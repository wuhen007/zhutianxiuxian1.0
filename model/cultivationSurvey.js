import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonAtomically } from '../utils/atomicJson.js';

export const SURVEY_VERSION = 1;
export const SURVEY_REWARDS = Object.freeze({
  众生仙钓: 10,
  无尽秘钥: 3,
  超越宝盒: 20,
  源石: 15_000_000,
});

export const SURVEY_QUESTIONS = Object.freeze([
  {
    id: 'q1', number: '1', type: 'single', allowOther: true,
    text: '您觉得诸天万界修仙的整体节奏怎么样？',
    options: ['非常快', '快', '正常', '慢', '非常慢'],
  },
  {
    id: 'q2', number: '2', type: 'single', allowOther: true,
    text: '您觉得诸天万界修仙的数值怎么样？',
    options: ['过于膨胀', '膨胀', '正常', '太小', '非常小'],
  },
  {
    id: 'q3', number: '3', type: 'single', allowOther: true,
    text: '您怎么看待诸天万界修仙的唯一性物品机制？',
    options: ['令人很不舒服，很影响体验', '还能接受，凑合着玩', '挺好的，符合修仙的弱肉强食，尔虞我诈'],
  },
  {
    id: 'q4', number: '4', type: 'single', allowOther: true,
    text: '您对诸天万界修仙的难度怎么看？',
    options: ['非常难', '难', '正常', '简单', '非常简单'],
  },
  {
    id: 'q4_1', number: '4-1', type: 'multiple', allowOther: true,
    text: '哪些地方让你感觉难度很高？',
    options: ['轮回转生，寿命机制', '唯一性物品机制', '额外体系道具刷取', '悟道系统', '额外体系渡劫系统', '时代机制', '天骄截杀，秘境偷袭等一系列报复行为'],
    showWhen: { questionId: 'q4', equals: '非常难' },
  },
  {
    id: 'q5', number: '5', type: 'single', allowOther: true,
    text: '您是否感觉诸天万界的玩法太庞杂？',
    options: ['是', '否'],
  },
  {
    id: 'q6', number: '6', type: 'single', allowOther: true,
    text: '您对诸天万界哪个玩法或机制感到满意？',
    options: ['没有', '秘境体系', '仙古今世法', '花粉路', '额外体系渡劫系统', '道法仙术', '垂钓众生', '功法传授', '诸天镜系统', '无尽劫境', '小世界系统'],
  },
  {
    id: 'q7', number: '7', type: 'multiple', allowOther: true,
    text: '您对哪款文游修仙游戏的玩法印象非常深刻或感到很惊艳？',
    options: ['没有', '云岚', '提瓦特', '绝云问', '啵唧修仙', '小竹服', '修仙模拟器（柠檬冲水新作）', '三点水修仙（原版修仙）', '萝莉服', '凡仙', '斗破', '仙逆', '云端问仙', '诸天'],
  },
  {
    id: 'q8', number: '8', type: 'multiple', allowOther: true,
    text: '您觉得一款健康的文游修仙游戏应该具备什么？',
    options: ['休闲挂机收菜', '社交聊天', '丰富的玩法', '保持更新', '长期运营', '多听取玩家意见', '数值比拼'],
  },
  {
    id: 'q9', number: '9', type: 'single', allowOther: true,
    text: '您觉得一款文游修仙游戏应该具备毕业完结的结局吗？',
    options: ['是', '否'],
  },
  {
    id: 'q10', number: '10', type: 'single', allowOther: true,
    text: '您觉得一款文游修仙游戏的流程多久合适？',
    options: ['1～7天', '7～21天', '1个月～3个月', '1年～5年'],
  },
  {
    id: 'q11', number: '11', type: 'single', allowOther: true,
    text: '您对文游修仙通过氪金变强的容忍度怎么样？（假设存在氪全力压众人的情况）',
    options: ['极度不能容忍', '不能容忍', '能凑合玩', '还行', '随意'],
  },
  {
    id: 'q12', number: '12', type: 'single', allowOther: true,
    text: '您对氪金赞助这个项目是否容忍？',
    options: ['能：为开发者赞助助力长期运营', '不能，太影响平衡，破坏游戏体验'],
  },
  {
    id: 'q12_1', number: '12-1', type: 'single', allowOther: true,
    text: '您觉得文游修仙的氪金赞助应保持在什么范围？',
    options: ['1～30元', '30～100元', '100～200元', '200元～1000元', '1000元以上'],
    showWhen: { questionId: 'q12', equals: '能：为开发者赞助助力长期运营' },
  },
]);

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
export const SURVEY_RESPONSE_DIR = path.join(pluginRoot, 'resources', 'data', 'survey', 'responses');

function cleanOther(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function responseFile(userId, directory = SURVEY_RESPONSE_DIR) {
  const hash = createHash('sha256').update(String(userId)).digest('hex');
  return path.join(directory, `v${SURVEY_VERSION}-${hash}.json`);
}

function isVisible(question, answers) {
  if (!question.showWhen) return true;
  const selected = answers[question.showWhen.questionId]?.selected;
  return Array.isArray(selected)
    ? selected.includes(question.showWhen.equals)
    : selected === question.showWhen.equals;
}

export function validateSurveyAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    throw new Error('答卷格式无效');
  }
  const answers = {};
  for (const question of SURVEY_QUESTIONS) {
    if (!isVisible(question, answers)) continue;
    const raw = rawAnswers[question.id] || {};
    const selected = question.type === 'multiple'
      ? [...new Set(Array.isArray(raw.selected) ? raw.selected.map(String) : [])]
      : String(raw.selected || '');
    const values = Array.isArray(selected) ? selected : [selected];
    if (!values.length || values.some(value => !value)) {
      throw new Error(`第${question.number}题尚未作答`);
    }
    if (question.type === 'single' && values.length !== 1) {
      throw new Error(`第${question.number}题只能选择一项`);
    }
    if (values.length > question.options.length + Number(question.allowOther)) {
      throw new Error(`第${question.number}题选项数量异常`);
    }
    if (values.some(value => value !== '__other__' && !question.options.includes(value))) {
      throw new Error(`第${question.number}题包含无效选项`);
    }
    const other = cleanOther(raw.other);
    if (values.includes('__other__') && (!question.allowOther || !other)) {
      throw new Error(`请填写第${question.number}题的其他选项`);
    }
    answers[question.id] = {
      selected,
      ...(values.includes('__other__') ? { other } : {}),
    };
  }
  return answers;
}

export function readSurveyResponse(userId, options = {}) {
  try {
    return JSON.parse(fs.readFileSync(responseFile(userId, options.directory), 'utf8'));
  } catch {
    return null;
  }
}

export async function submitSurveyResponse({
  userId,
  playerName,
  answers,
  award,
  now = Date.now(),
  directory = SURVEY_RESPONSE_DIR,
}) {
  fs.mkdirSync(directory, { recursive: true });
  const file = responseFile(userId, directory);
  let response = readSurveyResponse(userId, { directory });
  if (response?.status === 'granted') {
    return { alreadySubmitted: true, response };
  }
  if (!response) {
    response = {
      version: SURVEY_VERSION,
      userId: String(userId),
      playerName: String(playerName || '无名道友').slice(0, 40),
      answers: validateSurveyAnswers(answers),
      submittedAt: now,
      status: 'rewarding',
    };
    writeJsonAtomically(file, response);
  }
  await award(String(userId));
  response.status = 'granted';
  response.rewardedAt = now;
  writeJsonAtomically(file, response);
  return { alreadySubmitted: false, response };
}

export function readSurveyResponses(options = {}) {
  const directory = options.directory || SURVEY_RESPONSE_DIR;
  try {
    return fs.readdirSync(directory)
      .filter(file => file.startsWith(`v${SURVEY_VERSION}-`) && file.endsWith('.json'))
      .map(file => {
        try {
          return JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(response => response?.version === SURVEY_VERSION && response.status === 'granted');
  } catch {
    return [];
  }
}

export function buildSurveyStatistics(responses = readSurveyResponses()) {
  const orderedResponses = responses
    .map((response, index) => ({ response, index }))
    .sort((a, b) => (Number(a.response.submittedAt) || 0) - (Number(b.response.submittedAt) || 0) || a.index - b.index)
    .map(item => item.response);
  const questions = SURVEY_QUESTIONS.map(question => {
    const counts = Object.fromEntries([...question.options, '__other__'].map(option => [option, 0]));
    const otherAnswers = [];
    let answered = 0;
    for (const response of orderedResponses) {
      const answer = response.answers?.[question.id];
      if (!answer) continue;
      answered += 1;
      const selected = Array.isArray(answer.selected) ? answer.selected : [answer.selected];
      for (const value of selected) if (Object.hasOwn(counts, value)) counts[value] += 1;
      if (selected.includes('__other__') && answer.other) {
        otherAnswers.push({
          playerName: String(response.playerName || '无名道友'),
          text: String(answer.other),
        });
      }
    }
    return { ...question, answered, counts, otherAnswers };
  });
  const submittedAt = orderedResponses
    .map(response => Number(response.submittedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    version: SURVEY_VERSION,
    total: responses.length,
    questions,
    participants: orderedResponses.map(response => String(response.playerName || '无名道友')),
    firstSubmittedAt: submittedAt[0] || 0,
    lastSubmittedAt: submittedAt.at(-1) || 0,
  };
}

function ratioOf(count, total) {
  return total > 0 ? count / total * 100 : 0;
}

function formatSurveyTime(timestamp, withDate = true) {
  if (!timestamp) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...(withDate ? { month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp).replaceAll('/', '-');
}

function topRows(question, limit = 1) {
  return question.rows
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildSurveyStatisticsView(statistics, options = {}) {
  const questions = statistics.questions.map(question => {
    const maxCount = Math.max(0, ...Object.values(question.counts));
    const rows = [...question.options, '__other__'].map(option => {
      const count = Number(question.counts[option]) || 0;
      const ratio = ratioOf(count, question.answered);
      return {
        label: option === '__other__' ? '其他（自定义）' : option,
        count,
        ratio,
        ratioLabel: `${ratio.toFixed(1)}%`,
        width: ratio > 0 ? Math.max(2, Number(ratio.toFixed(1))) : 0,
        tone: option === '__other__' ? 'other' : (count > 0 && count === maxCount ? 'top' : 'normal'),
      };
    });
    const condition = question.showWhen
      ? SURVEY_QUESTIONS.find(item => item.id === question.showWhen.questionId)
      : null;
    return {
      ...question,
      rows,
      typeLabel: question.type === 'multiple' ? '多选' : '单选',
      isWide: rows.length >= 8 || Boolean(question.showWhen),
      conditionNote: condition
        ? `仅当第${condition.number}题选择「${question.showWhen.equals}」时展示`
        : '',
    };
  });

  const byId = Object.fromEntries(questions.map(question => [question.id, question]));
  const insights = [];
  const addInsight = (id, label, makeText, limit = 1) => {
    const question = byId[id];
    if (!question?.answered) return;
    const leaders = topRows(question, limit);
    if (leaders.length) insights.push({ label, text: makeText(leaders, question) });
  };
  addInsight('q1', '节奏共识', ([leader]) => `${leader.label}以 ${leader.ratioLabel} 居首，共 ${leader.count} 位道友选择。`);
  addInsight('q4', '难度体感', ([leader]) => `最多玩家认为当前难度为「${leader.label}」，占有效回答的 ${leader.ratioLabel}。`);
  addInsight('q6', '玩法偏好', ([leader]) => `最受青睐的玩法是「${leader.label}」，获得 ${leader.count} 票。`);
  addInsight('q8', '健康生态', leaders => `优先诉求集中在${leaders.map(item => `「${item.label}」`).join('、')}。`, 3);
  addInsight('q12', '赞助态度', ([leader]) => `「${leader.label}」为主流选择，支持率 ${leader.ratioLabel}。`);
  if (!insights.length) insights.push({ label: '等待回响', text: '本期尚无有效答卷，统计图将在收到回答后自动生成。' });

  const firstSubmittedAt = Number(statistics.firstSubmittedAt) || 0;
  const lastSubmittedAt = Number(statistics.lastSubmittedAt) || 0;
  const elapsedHours = Math.max(0, lastSubmittedAt - firstSubmittedAt) / 3_600_000;
  const answeredQuestions = questions.filter(question => question.answered > 0).length;
  const customAnswerCount = questions.reduce((sum, question) => sum + question.otherAnswers.length, 0);
  const submissionWindow = firstSubmittedAt
    ? `${formatSurveyTime(firstSubmittedAt)} 至 ${formatSurveyTime(lastSubmittedAt, false)}`
    : '暂无提交记录';

  return {
    version: statistics.version,
    title: `诸天修仙调研统计`,
    subtitle: `第 ${statistics.version} 期玩家意见全量汇总`,
    generatedAt: formatSurveyTime(options.now || Date.now()),
    submissionWindow,
    questions,
    insights,
    participants: statistics.participants || [],
    metrics: [
      { value: statistics.total, label: '有效答卷', note: '份' },
      { value: answeredQuestions, label: '题目覆盖', note: `共 ${questions.length} 题` },
      { value: customAnswerCount, label: '自定义意见', note: '条' },
      {
        value: firstSubmittedAt ? (elapsedHours < 0.1 ? '<0.1h' : `${elapsedHours.toFixed(1)}h`) : '--',
        label: '提交窗口',
        note: firstSubmittedAt ? '北京时间' : '等待答卷',
      },
    ],
  };
}

export function formatSurveyStatistics(statistics) {
  const lines = [
    `【诸天修仙调研统计·第${statistics.version}期】`,
    `有效答卷：${statistics.total}份`,
  ];
  for (const question of statistics.questions) {
    lines.push('', `${question.number}. ${question.text}（有效${question.answered}份${question.type === 'multiple' ? '，多选' : ''}）`);
    for (const option of [...question.options, '__other__']) {
      const count = question.counts[option] || 0;
      const ratio = question.answered ? (count / question.answered * 100).toFixed(1) : '0.0';
      lines.push(`${option === '__other__' ? '其他' : option}：${count}（${ratio}%）`);
    }
  }
  return lines.join('\n');
}
