const SCENES = {
  observe: ['观星', '星辉有信', 'scan', '你将神念收束成一线。寂静星海里，那道微弱的回声终于有了方向。'],
  move: ['跃迁', '一息越星海', 'travel', '旧日星光向身后退去。航路在眼前展开，远方的界灯仍在等候。'],
  explore: ['探索', '踏入无名古史', 'scan', '尘埃之下，文明留下的刻痕依旧清晰。你俯身辨认那些未被岁月抹去的名字。'],
  anchor: ['锚定', '为归途留一盏灯', 'anchor', '一道金色阵纹落入星核。你试着在这片陌生星海中，为后来者留下一处路标。'],
  expedition: ['远征', '星尘落在行囊上', 'scan', '远征记录翻过新的一页。营地的灯与古星的轮廓，在神念中渐渐清晰。'],
  battle: ['交锋', '星海闻兵', 'battle', '赤色涟漪越过寂静的星面。你收敛神念，等待这一场交锋的回讯。'],
  ancient: ['古史', '有人曾从此经过', 'ancient', '残缺的炉铭、断裂的渡碑，像一封迟到了许多纪元的信。你将它缓缓展开。'],
  forge: ['铸道', '万道入炉', 'forge', '炉壁上的古纹次第亮起。你凝望炉心，等待材料与道法交汇后的回响。'],
  return: ['归航', '灯火在彼岸', 'travel', '你望向归途的灯火。星锚正在接收这次行动的回讯，所有得失都以记录为据。'],
  claim: ['归档', '此行留有回声', 'anchor', '星尘沉入卷册，经历化作清晰的记录。这一页，只写已经发生的事。'],
  error: ['界讯', '回声尚未落定', 'quiet', '神念停在界隙边缘。本次响应尚未确认，请先查看回执与当前星图。'],
};

function sceneKey(action) {
  if (SCENES[action]) return action;
  if (action.startsWith('ancient_event_')) return 'ancient';
  if (action.startsWith('dao_forge_')) return 'forge';
  if (/^(challenge|execute|refine|defend|campaign_advance|true_world_(encounter|encounter_start|battle))$/.test(action)) return 'battle';
  if (/claim$|^bag_deposit$/.test(action)) return 'claim';
  if (/^evacuation_|_leave$/.test(action)) return 'return';
  if (/_move$|_enter$/.test(action)) return 'move';
  if (/_observe$|_explore$/.test(action)) return 'explore';
  return 'expedition';
}

// 只编排表现层；战斗输赢、奖励和耗时始终取实际回执，不在这里推算。
export function buildStoryScene({ action = '', message = '', targetName = '当前星域', before, after, failed = false, pendingSync = false, preview = false }) {
  const [chapter, title, effect, atmosphere] = SCENES[failed ? 'error' : sceneKey(action)];
  const receipt = String(message || '此次没有返回可展示的详细回执。');
  const beats = [
    { label: '星海演绎', text: atmosphere },
    { label: pendingSync ? '行动回执 · 星图待同步' : failed ? '响应说明' : preview ? '预览回执' : '行动回执', text: receipt },
  ];
  const changes = [];
  if (!failed && !pendingSync) {
    for (const [name, oldValue, newValue] of [
      ['心神', before?.player?.mind, after?.player?.mind],
      ['界压', before?.pressure, after?.pressure],
    ]) {
      if (Number.isFinite(oldValue) && Number.isFinite(newValue) && oldValue !== newValue) changes.push(`${name} ${oldValue} → ${newValue}`);
    }
  }
  if (changes.length) beats.push({ label: '星图实录', text: changes.join('；') + '。其余结果请查阅当前面板。' });
  return { chapter, title, effect: failed || pendingSync ? 'quiet' : effect, targetName: String(targetName), preview, beats };
}

export function createStoryTheater({ root, motionQuery, preview = false, onEffect = () => {} }) {
  const find = selector => root.querySelector(selector);
  const panel = find('#story-theater');
  const history = [];
  let current = null;
  let beat = 0;
  let effectTimer;
  let autoShow = true;
  let motionOff = false;
  const readSetting = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const saveSetting = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  autoShow = readSetting('canglan-story-auto') !== 'false';
  motionOff = readSetting('canglan-story-motion-off') === 'true';

  function clearEffect() {
    clearTimeout(effectTimer);
    panel.classList.remove('is-performing');
  }

  function updateSettings() {
    find('#story-auto').setAttribute('aria-pressed', String(autoShow));
    find('#story-auto').textContent = `演绎：${autoShow ? '开' : '关'}`;
    find('#story-motion').setAttribute('aria-pressed', String(motionOff));
    find('#story-motion').textContent = `动效：${motionOff || motionQuery.matches ? '静止' : '开'}`;
    root.dataset.motion = motionOff || motionQuery.matches ? 'off' : 'on';
    if (motionOff || motionQuery.matches) clearEffect();
  }

  function renderBeat() {
    if (!current) return;
    const scene = current.scene;
    const text = scene.beats[beat];
    find('#story-chapter').textContent = `${scene.chapter} / ${scene.targetName}`;
    find('#story-title').textContent = scene.title;
    find('#story-origin').textContent = scene.preview ? '预览演绎 · 不写存档' : '星海演绎 · 结果以回执为准';
    find('#story-beat-label').textContent = text.label;
    find('#story-copy').textContent = text.text;
    find('#story-page').textContent = `${String(beat + 1).padStart(2, '0')} / ${String(scene.beats.length).padStart(2, '0')}`;
    find('#story-prev').disabled = beat === 0;
    find('#story-next').textContent = beat === scene.beats.length - 1 ? '合卷' : beat === 0 ? '查看回执' : '下一幕';
    const all = find('#story-full-record');
    all.replaceChildren();
    for (const entry of scene.beats) {
      const p = document.createElement('p');
      const label = document.createElement('strong');
      label.textContent = entry.label;
      p.append(label, document.createTextNode(entry.text));
      all.append(p);
    }
  }

  function show(record) {
    current = record;
    beat = 0;
    panel.hidden = false;
    panel.dataset.effect = record.scene.effect;
    find('#story-all').open = false;
    renderBeat();
    clearEffect();
    if (!motionOff && !motionQuery.matches && !document.hidden && record.scene.effect !== 'quiet') {
      void panel.offsetWidth;
      panel.classList.add('is-performing');
      onEffect(record.scene.effect, record.point);
      effectTimer = setTimeout(clearEffect, 2200);
    }
  }

  function close() {
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    clearEffect();
    if (hadFocus) find('#story-replay').focus({ preventScroll: true });
  }

  function renderHistory() {
    const list = find('#story-history-list');
    list.replaceChildren();
    [...history].reverse().forEach(record => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${record.scene.chapter} · ${record.scene.targetName}`;
      button.title = record.scene.title;
      button.addEventListener('click', () => { show(record); find('#story-history').open = false; find('#story-next').focus({ preventScroll: true }); });
      const li = document.createElement('li');
      li.append(button);
      list.append(li);
    });
    find('#story-replay').disabled = !history.length;
    find('#story-history-count').textContent = String(history.length);
  }

  find('#story-close').addEventListener('click', close);
  find('#story-next').addEventListener('click', () => { if (beat < current.scene.beats.length - 1) { beat += 1; renderBeat(); } else close(); });
  find('#story-prev').addEventListener('click', () => { beat = Math.max(0, beat - 1); renderBeat(); });
  find('#story-replay').addEventListener('click', () => { if (history.length) show(history[history.length - 1]); });
  find('#story-auto').addEventListener('click', () => { autoShow = !autoShow; saveSetting('canglan-story-auto', autoShow); updateSettings(); if (!autoShow) close(); });
  find('#story-motion').addEventListener('click', () => { motionOff = !motionOff; saveSetting('canglan-story-motion-off', motionOff); updateSettings(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); find('#story-history').open = false; }
    if (!panel.hidden && panel.contains(event.target) && !event.target.closest('summary, details[open]')) {
      if (event.key === 'ArrowRight') { event.preventDefault(); find('#story-next').click(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); find('#story-prev').click(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearEffect(); });
  motionQuery.addEventListener?.('change', updateSettings);
  updateSettings();
  renderHistory();
  return {
    get motionOff() { return motionOff; },
    syncPreferences: updateSettings,
    present(options) {
      if (options.operationId && history.some(record => record.operationId === options.operationId)) return;
      const record = { operationId: options.operationId, point: options.point, scene: buildStoryScene({ ...options, preview }) };
      history.push(record);
      if (history.length > 8) history.shift();
      renderHistory();
      if (autoShow) show(record);
    },
  };
}
