const form = document.querySelector('#survey-form');
const questionsRoot = document.querySelector('#questions');
const notice = document.querySelector('#notice');
const welcome = document.querySelector('#welcome');
const progressWrap = document.querySelector('#progress-wrap');
const progressLabel = document.querySelector('#progress-label');
const progressBar = document.querySelector('#progress-bar');
const validationMessage = document.querySelector('#validation-message');
const submitButton = document.querySelector('#submit-button');
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const resultMessage = document.querySelector('#result-message');
const retryReward = document.querySelector('#retry-reward');

let state = null;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '请求失败');
  return payload;
}

function selectedValues(question) {
  return [...document.querySelectorAll(`input[name="${question.id}"]:checked`)].map(input => input.value);
}

function visible(question) {
  if (!question.showWhen) return true;
  return selectedValues({ id: question.showWhen.questionId }).includes(question.showWhen.equals);
}

function setConditionalVisibility() {
  for (const question of state.questions) {
    const fieldset = document.querySelector(`[data-question="${question.id}"]`);
    if (!fieldset) continue;
    const shown = visible(question);
    fieldset.hidden = !shown;
    if (!shown) {
      fieldset.classList.remove('invalid');
      fieldset.querySelectorAll('input').forEach(input => {
        if (input.type === 'radio' || input.type === 'checkbox') input.checked = false;
        else input.value = '';
      });
    }
  }
  updateProgress();
}

function isAnswered(question) {
  if (!visible(question)) return true;
  const values = selectedValues(question);
  if (!values.length) return false;
  if (!values.includes('__other__')) return true;
  return Boolean(document.querySelector(`[data-other-for="${question.id}"]`)?.value.trim());
}

function updateProgress() {
  const active = state.questions.filter(visible);
  const answered = active.filter(isAnswered).length;
  progressLabel.textContent = `${answered} / ${active.length}`;
  progressBar.style.width = `${active.length ? answered / active.length * 100 : 0}%`;
}

function optionControl(question, value, labelText) {
  const label = document.createElement('label');
  label.className = 'option';
  const input = document.createElement('input');
  input.type = question.type === 'multiple' ? 'checkbox' : 'radio';
  input.name = question.id;
  input.value = value;
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return { label, input };
}

function syncOtherInput(fieldset, question) {
  const otherInput = fieldset.querySelector(`[data-other-for="${question.id}"]`);
  if (!otherInput) return;
  const otherOption = fieldset.querySelector(`input[name="${question.id}"][value="__other__"]`);
  otherInput.disabled = !otherOption?.checked;
  if (otherInput.disabled) otherInput.value = '';
}

function renderQuestion(question) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'question';
  fieldset.dataset.question = question.id;
  const legend = document.createElement('legend');
  const number = document.createElement('span');
  number.className = 'question-number';
  number.textContent = question.number;
  const text = document.createTextNode(question.text);
  const type = document.createElement('span');
  type.className = 'question-type';
  type.textContent = question.type === 'multiple' ? '多选' : '单选';
  legend.append(number, text, type);

  const options = document.createElement('div');
  options.className = 'options';
  for (const option of question.options) {
    const control = optionControl(question, option, option);
    control.input.addEventListener('change', () => {
      if (question.type === 'multiple' && question.options.includes('没有')) {
        const inputs = [...fieldset.querySelectorAll(`input[name="${question.id}"]`)];
        if (control.input.checked && option === '没有') inputs.forEach(input => { if (input !== control.input) input.checked = false; });
        if (control.input.checked && option !== '没有') inputs.find(input => input.value === '没有').checked = false;
      }
      syncOtherInput(fieldset, question);
      fieldset.classList.remove('invalid');
      setConditionalVisibility();
    });
    options.append(control.label);
  }

  if (question.allowOther) {
    const control = optionControl(question, '__other__', '其他');
    const other = document.createElement('input');
    other.type = 'text';
    other.className = 'other-input';
    other.dataset.otherFor = question.id;
    other.maxLength = 120;
    other.placeholder = '填写其他意见';
    other.disabled = true;
    control.input.addEventListener('change', () => {
      syncOtherInput(fieldset, question);
      if (control.input.checked) other.focus();
      fieldset.classList.remove('invalid');
      updateProgress();
    });
    other.addEventListener('input', () => {
      fieldset.classList.remove('invalid');
      updateProgress();
    });
    options.append(control.label, other);
  }

  fieldset.append(legend, options);
  questionsRoot.append(fieldset);
}

function collectAnswers() {
  const answers = {};
  let firstMissing = null;
  for (const question of state.questions) {
    if (!visible(question)) continue;
    const fieldset = document.querySelector(`[data-question="${question.id}"]`);
    const selected = selectedValues(question);
    const other = document.querySelector(`[data-other-for="${question.id}"]`)?.value.trim() || '';
    if (!selected.length || (selected.includes('__other__') && !other)) {
      fieldset.classList.add('invalid');
      firstMissing ||= fieldset;
      continue;
    }
    answers[question.id] = {
      selected: question.type === 'multiple' ? selected : selected[0],
      ...(selected.includes('__other__') ? { other } : {}),
    };
  }
  if (firstMissing) {
    firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    throw new Error('请完成所有当前显示的问题');
  }
  return answers;
}

function showResult(title, message, pending = false) {
  notice.hidden = true;
  form.hidden = true;
  progressWrap.hidden = true;
  result.hidden = false;
  resultTitle.textContent = title;
  resultMessage.textContent = message;
  retryReward.hidden = !pending;
}

async function submit(answers) {
  submitButton.disabled = true;
  retryReward.disabled = true;
  validationMessage.textContent = '';
  try {
    const payload = await request('/api/survey/submit', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
    showResult('答卷提交成功', payload.message);
  } catch (error) {
    validationMessage.textContent = error.message;
    submitButton.disabled = false;
    retryReward.disabled = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    submit(collectAnswers());
  } catch (error) {
    validationMessage.textContent = error.message;
  }
});

retryReward.addEventListener('click', () => submit({}));

async function boot() {
  const token = new URLSearchParams(location.search).get('t');
  if (token) {
    try {
      await request('/api/survey/session', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      history.replaceState({}, '', '/survey');
    } catch (error) {
      // An existing cookie may still hold a valid session after a refresh.
    }
  }
  try {
    const payload = await request('/api/survey/state');
    state = payload.state;
    welcome.textContent = `${state.playerName}，请留下你的真实判断`;
    if (state.submitted) {
      return showResult('本期调研已经完成', '你的答卷与奖励均已记录，无需重复提交。');
    }
    if (state.pendingReward) {
      return showResult('答卷已记录', '上次发奖流程尚未完成，可以继续领取。', true);
    }
    notice.hidden = true;
    questionsRoot.replaceChildren();
    state.questions.forEach(renderQuestion);
    setConditionalVisibility();
    progressWrap.hidden = false;
    form.hidden = false;
  } catch (error) {
    notice.classList.add('error');
    notice.textContent = error.message;
    welcome.textContent = '入口未能开启';
  }
}

boot();
