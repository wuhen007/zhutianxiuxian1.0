import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import template from 'art-template';

const html = fs.readFileSync(
  fileURLToPath(new URL('../resources/html/endless_reincarnation/endless_reincarnation.html', import.meta.url)),
  'utf8'
);
const css = fs.readFileSync(
  fileURLToPath(new URL('../resources/html/endless_reincarnation/endless_reincarnation.css', import.meta.url)),
  'utf8'
);
const appSource = fs.readFileSync(
  fileURLToPath(new URL('../apps/EndlessReincarnation.js', import.meta.url)),
  'utf8'
);

function baseView(mode = 'scene') {
  return {
    pluResPath: './resources',
    renderScale: 2,
    mode,
    eyebrow: 'ENDLESS REINCARNATION / WORLDLINE ARCHIVE',
    title: '醒来时，列车没有终点',
    subtitle: '终点站·雾海市｜ACT 1｜第七码车厢',
    mark: '01',
    status: '剧情选择等待中',
    heroStats: [
      { label: '随机职业', value: '刑警', note: '现场还原' },
      { label: '生命状态', value: '93 / 100', note: '压力 28/100' },
      { label: '世界线干涉', value: 2, note: '2条支线已经改变' },
      { label: '基因锁', value: '1 阶', note: '本世界已经开启' },
    ],
    profession: {
      name: '刑警', domain: '智力', active: '现场还原', passive: '发现矛盾证词',
      flaw: '连续精神冲击会积累压力', item: '强光手电',
    },
    hpPct: 93,
    stressPct: 28,
    scene: {
      act: 1,
      location: '第七码车厢',
      title: '醒来时，列车没有终点',
      narrative: ['冷白灯管依次亮起。你躺在一节没有线路编号的地铁里。', '距离04:44还有二十七分钟。'],
      dialogue: [{ speaker: '江映雪', text: '先确认伤员，再找出口。' }],
      choices: [
        { index: 1, risk: '稳妥', riskClass: 'stable', text: '检查车厢与同行者', checkText: '感知力+逻辑思维｜难度12' },
        { index: 2, risk: '中危', riskClass: 'warning', text: '强行拉下紧急制动', checkText: '肌肉强度+战斗技巧｜难度15' },
        { index: 3, risk: '高危', riskClass: 'danger', text: '回应广播中的自己', checkText: '意志力+抗压力｜难度18' },
      ],
    },
    lastOutcome: {
      success: true,
      checkLabel: '19/15',
      text: '你在玻璃反光中发现了第十三道人影。',
      encounter: { success: true, name: '无面检票员', skill: '身份注销', text: '队伍击破了无面检票员。' },
      reaction: { speaker: '苏遥', text: '那道影子没有对应的座位。' },
    },
    encounter: {
      id: 'faceless_inspector', name: '无面检票员', rank: '危险', type: '规则异怪',
      status: 'active', statusLabel: '正在追猎', hp: 90, maxHp: 90, hpPct: 100,
      difficulty: 2, attack: 12, terror: 7, skill: '身份注销',
      description: '穿着褪色制服，面孔只有一道用于剪票的竖缝。',
      mechanic: '点名时回答会被夺走姓名。', weakness: '破坏检票顺序或指出伪造车票',
      weaknessTags: '观察 · 审讯 · 民俗',
    },
    npcs: [
      {
        name: '江映雪', profession: '急诊医生', expertise: '创伤救治', specialties: ['医疗', '人体'], traits: ['利他', '冷静'],
        bottomLine: '拒绝抛弃仍有救的人', fear: '再次错过抢救时机', stateLabel: '同行', active: true,
        hp: 90, maxHp: 100, hpPct: 90, trust: 18, trustLabel: '信赖', stress: 21, stressLabel: '稳定',
      },
      {
        name: '韩铮', profession: '消防员', expertise: '灾害救援', specialties: ['救援', '强行突破'], traits: ['利他', '责任'],
        bottomLine: '不放弃受困者', fear: '队伍在面前覆灭', stateLabel: '同行', active: true,
        hp: 82, maxHp: 100, hpPct: 82, trust: 7, trustLabel: '信赖', stress: 34, stressLabel: '稳定',
      },
      {
        name: '许临', profession: '数据分析师', expertise: '异常模式识别', specialties: ['系统', '数据'], traits: ['多疑', '谨慎'],
        bottomLine: '拒绝无法验证的计划', fear: '记忆被篡改', stateLabel: '同行', active: true,
        hp: 100, maxHp: 100, hpPct: 100, trust: 2, trustLabel: '戒备', stress: 45, stressLabel: '动摇',
      },
    ],
    tasks: [
      { kind: '主线', title: '在04:44前抵达终点站', status: 'active', statusLabel: '进行中', reward: '轮回点与回归资格' },
      { kind: '支线', title: '确认第十三名乘客', status: 'complete', statusLabel: '已完成', reward: 'D级支线权限' },
    ],
    branchEvents: [{ grade: 'D', title: '确认第十三名乘客' }],
    attributeGroups: [
      { name: '生命力', total: 32, attributes: [{ name: '体力', value: 11 }, { name: '免疫力', value: 10 }, { name: '恢复力', value: 11 }] },
      { name: '战斗力', total: 34, attributes: [{ name: '肌肉强度', value: 10 }, { name: '神经反射', value: 12 }, { name: '战斗技巧', value: 12 }] },
      { name: '智力', total: 38, attributes: [{ name: '逻辑思维', value: 14 }, { name: '记忆力', value: 12 }, { name: '学习力', value: 12 }] },
      { name: '精神力', total: 35, attributes: [{ name: '意志力', value: 12 }, { name: '感知力', value: 13 }, { name: '抗压力', value: 10 }] },
    ],
    rights: ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].map((grade, index) => ({ grade, count: index })),
    footerCommand: '#轮回选择1/2/3',
    footerNote: '选项可能引发延迟后果。',
  };
}

function render(view) {
  const output = template.render(html, view);
  assert.ok(!output.includes('{{'), '模板仍有未渲染表达式');
  return output;
}

test('剧情面板保留对话、检定、NPC状态与高分辨率缩放', () => {
  const output = render(baseView());
  for (const text of ['醒来时，列车没有终点', '江映雪', '先确认伤员', '感知力+逻辑思维', '无面检票员', '身份注销', '世界线将记住代价', '#轮回选择1/2/3'])
    assert.ok(output.includes(text), `剧情面板缺少${text}`);
  assert.ok(output.includes('transform: scale(2)'));
  assert.ok(!css.includes('zoom:'));
  assert.match(css, /width:\s*1032px/);
});

test('任务、小队、属性与人物档案均可独立渲染', () => {
  for (const [mode, expected] of [
    ['tasks', '确认第十三名乘客'],
    ['team', '#轮回档案 江映雪'],
    ['attributes', '四维十二项能力'],
    ['dossier', '不可触碰的底线'],
  ]) {
    const view = baseView(mode);
    if (mode === 'dossier') view.dossier = view.npcs[0];
    assert.ok(render(view).includes(expected), `${mode}面板缺少${expected}`);
  }
});

test('怪物档案显示异常机制、弱点与威胁数值', () => {
  const output = render(baseView('threat'));
  for (const text of ['ACTIVE THREAT', '无面检票员', '规则异怪', '点名时回答会被夺走姓名', '破坏检票顺序', '检定干扰', '精神污染'])
    assert.ok(output.includes(text), `怪物档案缺少${text}`);
});

test('轮回中枢与强化目录显示永久数据', () => {
  const hub = baseView('hub');
  hub.lastEnding = { name: '同行结局·黎明站台', evaluation: 'B', worldName: '终点站·雾海市' };
  hub.hubCommands = [{ command: '#开启无尽轮回', text: '投放至当前开放世界' }];
  assert.ok(render(hub).includes('永久能力增幅'));

  const exchange = baseView('exchange');
  exchange.products = [{
    id: 1, name: '生命潜能训练', description: '生命力永久提升', bought: 0, max: 10,
    priceText: '600', requirement: '无需支线权限', maxed: false, affordable: true,
  }];
  const output = render(exchange);
  assert.ok(output.includes('生命潜能训练'));
  assert.ok(output.includes('600'));
  assert.ok(output.includes('支线权限'));
});

test('结算面板完整显示评价、轮回点和支线权限', () => {
  const ending = baseView('ending');
  ending.title = '真结局·终点从未发生';
  ending.ending = { description: '列车、乘客与雾海市同时脱离既定死亡。' };
  ending.settlement = {
    evaluation: 'SSS', pointsText: '1.20万', worldline: 9, returnedNpcs: 3, totalNpcs: 3,
    geneLockStage: 1, rights: [{ grade: 'SSS', count: 1 }], defeatedMonsters: ['faceless_inspector'],
    monsterBonusText: '120',
  };
  ending.branchEvents = [{ grade: 'SSS', title: '令终点从未发生' }];
  const output = render(ending);
  for (const text of ['SSS', '1.20万', '获得支线权限', '异常体清除记录', '令终点从未发生'])
    assert.ok(output.includes(text), `结算面板缺少${text}`);
});

test('应用暴露完整的第一版群聊指令', () => {
  for (const command of [
    '#开启无尽轮回', '#轮回选择', '#轮回任务', '#轮回小队', '#轮回属性',
    '#轮回档案', '#轮回怪物', '#轮回强化', '#轮回兑换', '#基因锁', '#退出无尽轮回',
  ]) assert.ok(appSource.includes(command), `应用缺少${command}`);
  assert.ok(appSource.includes("puppeteer.screenshot('endless_reincarnation'"));
  assert.ok(appSource.includes('renderScale: 2'));
});

test('轮回中枢使用分页截图，其他面板仍保持单图', () => {
  assert.match(appSource, /view\.mode === 'hub'[\s\S]*puppeteer\.screenshots\('endless_reincarnation'/);
  assert.match(appSource, /puppeteer\.screenshot\('endless_reincarnation'/);
});
