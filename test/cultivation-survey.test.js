import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SURVEY_QUESTIONS,
  SURVEY_REWARDS,
  buildSurveyStatistics,
  buildSurveyStatisticsView,
  readSurveyResponse,
  readSurveyResponses,
  submitSurveyResponse,
  validateSurveyAnswers,
} from '../model/cultivationSurvey.js';
import {
  createEndlessWebHttpServer,
  issueSurveyWebTicket,
} from '../model/endlessWebServer.js';

function validAnswers({ hard = true, sponsor = true } = {}) {
  const answers = {};
  for (const question of SURVEY_QUESTIONS) {
    if (question.id === 'q4') {
      answers.q4 = { selected: hard ? '非常难' : '正常' };
      continue;
    }
    if (question.id === 'q4_1' && !hard) continue;
    if (question.id === 'q12') {
      answers.q12 = { selected: sponsor ? '能：为开发者赞助助力长期运营' : '不能，太影响平衡，破坏游戏体验' };
      continue;
    }
    if (question.id === 'q12_1' && !sponsor) continue;
    answers[question.id] = {
      selected: question.type === 'multiple' ? [question.options[0]] : question.options[0],
    };
  }
  return answers;
}

test('问卷严格校验必答题、条件题和其他文本', () => {
  const complete = validAnswers();
  assert.equal(Object.keys(validateSurveyAnswers(complete)).length, SURVEY_QUESTIONS.length);

  const missingConditional = validAnswers();
  delete missingConditional.q4_1;
  assert.throws(() => validateSurveyAnswers(missingConditional), /第4-1题尚未作答/);

  const hiddenConditional = validAnswers({ hard: false, sponsor: false });
  hiddenConditional.q4_1 = { selected: ['不存在的选项'] };
  const normalized = validateSurveyAnswers(hiddenConditional);
  assert.equal(normalized.q4_1, undefined);
  assert.equal(normalized.q12_1, undefined);

  const other = validAnswers();
  other.q1 = { selected: '__other__', other: ' 希望节奏分境界调整 ' };
  assert.equal(validateSurveyAnswers(other).q1.other, '希望节奏分境界调整');
  other.q1.other = '';
  assert.throws(() => validateSurveyAnswers(other), /其他选项/);
});

test('答卷先落盘再发奖，失败后可幂等续发且成功后不可重复', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhutian-survey-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let attempts = 0;
  const input = {
    userId: '10001',
    playerName: '荒古修士',
    answers: validAnswers(),
    directory,
    now: 123456,
  };

  await assert.rejects(
    submitSurveyResponse({ ...input, award: async () => { attempts += 1; throw new Error('award failed'); } }),
    /award failed/
  );
  assert.equal(readSurveyResponse('10001', { directory }).status, 'rewarding');

  const completed = await submitSurveyResponse({
    ...input,
    answers: {},
    award: async () => { attempts += 1; },
  });
  assert.equal(completed.alreadySubmitted, false);
  assert.equal(completed.response.status, 'granted');

  const repeated = await submitSurveyResponse({
    ...input,
    award: async () => { attempts += 1; },
  });
  assert.equal(repeated.alreadySubmitted, true);
  assert.equal(attempts, 2);
});

test('统计按实际回答人数计算单选和多选占比', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhutian-survey-stats-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await submitSurveyResponse({
    userId: '10001', playerName: '甲', answers: validAnswers(), directory, award: async () => {},
  });
  await submitSurveyResponse({
    userId: '10002', playerName: '乙', answers: validAnswers({ hard: false, sponsor: false }), directory, award: async () => {},
  });
  const statistics = buildSurveyStatistics(readSurveyResponses({ directory }));
  assert.equal(statistics.total, 2);
  assert.equal(statistics.questions.find(question => question.id === 'q4').counts.非常难, 1);
  assert.equal(statistics.questions.find(question => question.id === 'q4_1').answered, 1);
  assert.deepEqual(new Set(statistics.participants), new Set(['甲', '乙']));
  const view = buildSurveyStatisticsView(statistics, { now: 1_800_000 });
  assert.equal(view.questions.find(question => question.id === 'q4').rows[0].ratioLabel, '50.0%');
  assert.equal(view.questions.find(question => question.id === 'q4_1').conditionNote, '仅当第4题选择「非常难」时展示');
  assert.equal(view.metrics[0].value, 2);
  assert.ok(view.insights.some(item => item.label === '玩法偏好'));
  assert.deepEqual(SURVEY_REWARDS, { 众生仙钓: 10, 无尽秘钥: 3, 超越宝盒: 20, 源石: 15_000_000 });
});

class MemoryRedis {
  data = new Map();

  async set(key, value) { this.data.set(key, value); return 'OK'; }
  async get(key) { return this.data.get(key) ?? null; }
  async getDel(key) { const value = await this.get(key); this.data.delete(key); return value; }
  async del(key) { return this.data.delete(key) ? 1 : 0; }
}

test('调研网页入口只能兑换一次并可完成状态与提交请求', async t => {
  const redis = new MemoryRedis();
  const calls = [];
  const surveyController = {
    async getSurveyWebState(session) {
      return { playerName: session.playerName, submitted: false, questions: SURVEY_QUESTIONS, rewards: SURVEY_REWARDS };
    },
    async submitSurvey(session, body) {
      calls.push([session.userId, body.answers]);
      return { ok: true, message: '答卷提交成功' };
    },
  };
  const config = { publicUrl: 'http://127.0.0.1', ticketTtlSeconds: 120, sessionTtlSeconds: 3600 };
  const server = createEndlessWebHttpServer({ realm: null, redisClient: redis, config, surveyController });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;
  const token = await issueSurveyWebTicket(redis, config, {
    userId: '10001', rawUserId: '10001', playerName: '荒古修士',
  });

  const page = await fetch(`${base}/survey`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /诸天修仙调研问卷/);
  assert.equal((await fetch(`${base}/survey/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/survey/style.css`)).status, 200);

  const login = await fetch(`${base}/api/survey/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const replay = await fetch(`${base}/api/survey/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 401);

  const stateResponse = await fetch(`${base}/api/survey/state`, { headers: { Cookie: cookie } });
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).state.playerName, '荒古修士');

  const submit = await fetch(`${base}/api/survey/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify({ answers: { q1: { selected: '正常' } } }),
  });
  assert.equal(submit.status, 200);
  assert.deepEqual(calls, [['10001', { q1: { selected: '正常' } }]]);
});
