import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  addMirrorRelic,
  bindBasicZhutianMirror,
  challengeUltimateCardTrial,
  consumeMirrorEnergy,
  DECADE_LOCATIONS,
  DECADE_TOUR_WORLDS,
  ensureZhutianMirrorSystem,
  executeFinalAttackRide,
  exploreDecadeWorld,
  exploreMitakihara,
  exploreTomoeda,
  loadZhutianAvatar,
  purifyMadokaSoulGem,
  recordProjectionMirrorProgress,
  refineZhutianMirror,
  resetMitakiharaTimeline,
  setClowCardDeck,
  setDecadeCardDeck,
  syncCurrentZhutianAvatar,
  MITAKIHARA_LOCATIONS,
  TOMOEDA_LOCATIONS,
} from '../model/zhutianMirror.js';

const NOW = Date.parse('2026-08-22T04:00:00Z');

function createPlayer() {
  return {
    灵根: { id: 1, name: '金灵根', type: '金', eff: 0.1 },
  };
}

test('诸天镜首次绑定、重复养镜与次日镜能恢复', () => {
  const player = createPlayer();
  const first = bindBasicZhutianMirror(player, { now: NOW });
  assert.equal(first.firstBind, true);
  assert.equal(first.system.镜能, 3);

  assert.equal(consumeMirrorEnergy(player, 1, { now: NOW }).ok, true);
  assert.equal(ensureZhutianMirrorSystem(player, { now: NOW }).镜能, 2);
  assert.equal(ensureZhutianMirrorSystem(player, { now: NOW + 24 * 60 * 60 * 1000 }).镜能, 3);

  const repeated = bindBasicZhutianMirror(player, { now: NOW + 24 * 60 * 60 * 1000 });
  assert.equal(repeated.firstBind, false);
  assert.equal(repeated.system.材料.镜尘, 25);
});

test('已绑定诸天镜会按当前阶位补齐开放世界', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 3;
  const system = ensureZhutianMirrorSystem(player, { now: NOW });
  assert.ok(system.已解锁世界.includes('魔法少女小圆'));
  assert.ok(system.已解锁世界.includes('假面骑士帝骑'));
  assert.ok(system.已解锁世界.includes('星穹铁道·匹诺康尼'));
});

test('旧版异世界灵根迁移为化身且当天镜能补满', () => {
  const player = { 灵根: { id: 7010015, name: '星之杖·木之本樱', type: '魔卡少女·觉醒' } };
  const system = ensureZhutianMirrorSystem(player, { now: NOW });
  assert.equal(system.已绑定, true);
  assert.equal(system.镜能, 3);
  assert.equal(system.当前化身, '木之本樱');
  assert.equal(player.诸天化身谱[0].stage, 2);

  const advanced = { 灵根: { name: '始源之律者·爱莉希雅', type: '始源律者' } };
  ensureZhutianMirrorSystem(advanced, { now: NOW });
  assert.equal(advanced.诸天化身谱[0].name, '爱莉希雅');
  assert.equal(advanced.诸天化身谱[0].stage, 3);

  advanced.灵根 = { name: '爱莉希雅', type: '无瑕之人' };
  ensureZhutianMirrorSystem(advanced, { now: NOW });
  assert.equal(advanced.诸天化身谱[0].stage, 3);
  assert.equal(advanced.诸天化身谱[0].root.name, '始源之律者·爱莉希雅');
});

test('友枝町三次有效探索可集齐基础条件且不会覆盖本源灵根', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });

  const first = exploreTomoeda(player, '友枝小学', { now: NOW, random: () => 0 });
  const second = exploreTomoeda(player, '企鹅公园', { now: NOW, random: () => 0 });
  const third = exploreTomoeda(player, '企鹅公园', { now: NOW, random: () => 0 });

  assert.deepEqual([first.card, second.card, third.card], ['影', '风', '翔']);
  assert.equal(third.keyFound, true);
  assert.equal(third.unlocked, true);
  assert.equal(player.灵根.name, '金灵根');
  assert.equal(player.诸天化身谱[0].name, '木之本樱');

  assert.equal(loadZhutianAvatar(player, '木之本樱', { now: NOW }).ok, true);
  assert.equal(player.灵根.name, '木之本樱');
  player.灵根 = { id: 7010015, name: '星之杖·木之本樱', type: '魔卡少女·觉醒' };
  assert.equal(syncCurrentZhutianAvatar(player, { now: NOW }), true);
  assert.equal(player.诸天化身谱[0].stage, 2);
  assert.equal(loadZhutianAvatar(player, '本源', { now: NOW }).ok, true);
  assert.equal(player.灵根.name, '金灵根');
});

test('地点阶位校验先于镜能消耗，封印之钥第八次保底', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  const blocked = exploreTomoeda(player, '东京塔', { now: NOW });
  assert.equal(blocked.reason, 'tier');
  assert.equal(player.诸天镜系统.镜能, 3);

  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;
  for (let i = 0; i < 8; i++) {
    exploreTomoeda(player, '友枝小学', { now: NOW, random: () => 0.99, keyChance: 0 });
  }
  assert.equal(player.诸天镜系统.世界进度.魔法少女樱.封印之钥, true);
});

test('一阶诸天镜材料足够时必定淬炼成功', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.材料.镜尘 = 50;
  player.诸天镜系统.材料.世界残响 = 10;
  player.诸天镜系统.世界印记.push('魔法少女樱');

  const result = refineZhutianMirror(player, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.tier, 2);
  assert.equal(player.诸天镜系统.材料.镜尘, 0);
  assert.equal(player.诸天镜系统.镜能, 4);
});

test('友枝町地图覆盖梦之杖所需的52张不同库洛牌', () => {
  const cards = Object.values(TOMOEDA_LOCATIONS).flatMap(location => location.cards);
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards).size, 52);
});

test('库洛牌三卡组合会实际改变友枝町探索结果', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.库洛牌系统.已封印库洛牌 = ['风', '翔', '影'];
  const deck = setClowCardDeck(player, ['风', '翔', '影'], { now: NOW });
  assert.equal(deck.combo, '疾风封印');

  const result = exploreTomoeda(player, '友枝小学', {
    now: NOW,
    random: () => 0.99,
    cardChance: 0,
  });
  assert.equal(result.combo, '疾风封印');
  assert.ok(result.card);
});

test('见泷原探索稳定推进因果并解锁鹿目圆基础化身', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 2;
  player.诸天镜系统.镜能 = 4;

  exploreMitakihara(player, '见泷原中学', { now: NOW, random: () => 0 });
  exploreMitakihara(player, '蔷薇园魔女结界', { now: NOW, random: () => 0 });
  const third = exploreMitakihara(player, '零食魔女结界', { now: NOW, random: () => 0 });

  assert.equal(third.gemFound, true);
  assert.equal(third.unlocked, true);
  assert.equal(player.诸天镜系统.世界进度.魔法少女小圆.因果碎片, 3);
  assert.ok(player.希望系统.希望碎片 > 0);
  assert.equal(player.灵根.name, '金灵根');
  assert.equal(player.诸天化身谱.find(item => item.name === '鹿目圆')?.stage, 1);
});

test('灵魂宝石第八次有效探索保底且阶位拦截不扣镜能', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  const blocked = exploreMitakihara(player, '人鱼魔女结界', { now: NOW });
  assert.equal(blocked.reason, 'tier');
  assert.equal(player.诸天镜系统.镜能, 3);

  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;
  for (let i = 0; i < 8; i++) {
    exploreMitakihara(player, '见泷原中学', {
      now: NOW,
      random: () => 0.99,
      gemChance: 0,
      griefSeedChance: 0,
    });
  }
  assert.equal(player.诸天镜系统.世界进度.魔法少女小圆.灵魂宝石, true);
});

test('灵魂宝石污浊可用悲叹之种净化并主动重置时间线', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 2;
  player.诸天镜系统.镜能 = 4;
  for (let i = 0; i < 3; i++) exploreMitakihara(player, '见泷原中学', { now: NOW, random: () => 0 });

  const progress = player.诸天镜系统.世界进度.魔法少女小圆;
  progress.灵魂宝石污浊度 = 80;
  progress.悲叹之种 = 1;
  const purified = purifyMadokaSoulGem(player, { now: NOW });
  assert.equal(purified.after, 40);
  assert.equal(progress.悲叹之种, 0);

  progress.灵魂宝石污浊度 = 60;
  const reset = resetMitakiharaTimeline(player, { now: NOW });
  assert.equal(reset.ok, true);
  assert.equal(progress.灵魂宝石污浊度, 0);
  assert.equal(player.希望系统.时间线干涉, 1);
});

test('骑士世界由驱动器与九张主骑卡依次解锁门矢士和帝骑', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;

  const route = ['光写真馆', '光写真馆', '光写真馆', '骑士大战遗迹', '骑士大战遗迹', '骑士大战遗迹', '世界融合点', '世界融合点', '世界融合点'];
  const results = route.map(location => exploreDecadeWorld(player, location, { now: NOW, random: () => 0 }));

  assert.equal(results[2].driverFound, true);
  assert.equal(results[2].unlocked, true);
  assert.equal(results[8].advanced, true);
  assert.equal(player.诸天镜系统.世界进度.假面骑士帝骑.骑士卡片.length, 9);
  assert.equal(player.灵根.name, '金灵根');
  const avatar = player.诸天化身谱.find(item => item.name === '门矢士');
  assert.equal(avatar.stage, 2);
  assert.equal(avatar.root.name, '帝骑');
});

test('第二阶段地图配置有效且帝骑驱动器第八次保底', () => {
  assert.equal(Object.keys(MITAKIHARA_LOCATIONS).length, 5);
  assert.equal(Object.keys(DECADE_LOCATIONS).length, 5);

  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;
  for (let i = 0; i < 8; i++) {
    exploreDecadeWorld(player, '大修卡基地', { now: NOW, random: () => 0.99, driverChance: 0 });
  }
  assert.equal(player.诸天镜系统.世界进度.假面骑士帝骑.帝骑驱动器, true);
});

test('骑士融合危机、碎片保底、十世界巡游与终极神主形成完整闭环', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;
  const baseRoute = ['光写真馆', '光写真馆', '光写真馆', '骑士大战遗迹', '骑士大战遗迹', '骑士大战遗迹', '世界融合点', '世界融合点', '世界融合点'];
  for (const location of baseRoute) exploreDecadeWorld(player, location, { now: NOW, random: () => 0, consumeEnergy: false });
  assert.equal(setDecadeCardDeck(player, ['空我', '龙骑', '剑'], { now: NOW }).ok, true);

  for (let i = 0; i < 3; i++) exploreDecadeWorld(player, '大修卡基地', { now: NOW, random: () => 0.99, consumeEnergy: false });
  const progress = player.诸天镜系统.世界进度.假面骑士帝骑;
  assert.equal(progress.神主触屏碎片, 1);
  assert.equal(progress.世界融合度, 100);
  assert.equal(exploreDecadeWorld(player, '大修卡基地', { now: NOW, consumeEnergy: false }).reason, 'crisis');

  const finalAttack = executeFinalAttackRide(player, { now: NOW, consumeEnergy: false });
  assert.equal(finalAttack.ok, true);
  assert.equal(finalAttack.after, 30);

  progress.神主触屏碎片 = 9;
  progress.碎片保底计数 = 2;
  const godMaster = exploreDecadeWorld(player, '极光帷幕深处', { now: NOW, random: () => 0.99, consumeEnergy: false });
  assert.equal(godMaster.godMasterUnlocked, true);
  assert.equal(player.诸天化身谱.find(item => item.name === '门矢士').stage, 3);

  let guard = 0;
  while (progress.已巡游世界.length < DECADE_TOUR_WORLDS.length && guard++ < 20) {
    if (progress.世界融合度 >= 100) executeFinalAttackRide(player, { now: NOW, consumeEnergy: false });
    exploreDecadeWorld(player, '极光帷幕深处', { now: NOW, random: () => 0, consumeEnergy: false });
  }
  assert.equal(progress.已巡游世界.length, DECADE_TOUR_WORLDS.length);

  const ultimate = challengeUltimateCardTrial(player, '共鸣', { now: NOW, consumeEnergy: false });
  assert.equal(ultimate.ok, true);
  const avatar = player.诸天化身谱.find(item => item.name === '门矢士');
  assert.equal(avatar.stage, 4);
  assert.equal(avatar.root.name, '帝骑·终极神主');
});

test('小圆与帝骑旧进阶结果会覆盖化身谱阶段快照', () => {
  const madoka = { 灵根: { ...createPlayer().灵根, name: '鹿目圆', type: '魔法少女' } };
  ensureZhutianMirrorSystem(madoka, { now: NOW });
  madoka.灵根 = { name: '希望之光·圆', type: '希望化身' };
  assert.equal(syncCurrentZhutianAvatar(madoka, { now: NOW }), true);
  assert.equal(madoka.诸天化身谱[0].stage, 3);

  const decade = { 灵根: { name: '门矢士', type: '假面驾驭' } };
  ensureZhutianMirrorSystem(decade, { now: NOW });
  decade.灵根 = { name: '帝骑·神主', type: '终极假面驾驭' };
  assert.equal(syncCurrentZhutianAvatar(decade, { now: NOW }), true);
  assert.equal(decade.诸天化身谱[0].stage, 3);
});

test('投影专属奖励进入诸天镜遗物仓，不依赖全局物品表', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  assert.equal(addMirrorRelic(player, '库洛的残页', 1, { now: NOW }), 1);
  assert.equal(addMirrorRelic(player, '库洛的残页', 2, { now: NOW }), 3);
});

test('投影阶位材料来源覆盖位面晶核、时空锚和诸天镜心', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  const first = recordProjectionMirrorProgress(player, '魔法少女小圆', { difficulty: 3, endingType: 'neutral', now: NOW });
  const fourth = recordProjectionMirrorProgress(player, '万道争锋', { difficulty: 4, endingType: 'good', now: NOW });
  const sixth = recordProjectionMirrorProgress(player, '星海归墟', { difficulty: 7, endingType: 'good', now: NOW });
  assert.equal(first.位面晶核, 1);
  assert.equal(fourth.时空锚, 1);
  assert.equal(sixth.诸天镜心, 1);
  assert.equal(player.诸天镜系统.世界印记.length, 3);
});

test('旧随机灵根入口与免费抽卡入口已移除', async () => {
  const [userHome, projection, sakura, madoka] = await Promise.all([
    readFile(new URL('../apps/User/UserHome.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/zhutianjing/mokashaonv.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/zhutianjing/mofashaonv.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(userHome, /probabilitySakura|chosenPath/);
  assert.doesNotMatch(projection, /Add_najie_thing\(player_qq, '诸天镜'/);
  assert.doesNotMatch(projection, /Add_najie_thing\(player_qq, item\.name/);
  assert.doesNotMatch(sakura, /const randomCard =/);
  assert.doesNotMatch(madoka, /Add_najie_thing\(usr_qq, ["']诸天镜/);
});

test('诸天镜导航、阶段目标和世界专属操作均已注册', async () => {
  const [mirrorApp, sakura] = await Promise.all([
    readFile(new URL('../apps/zhutiantouying/ZhutianMirror.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/zhutianjing/mokashaonv.js', import.meta.url), 'utf8'),
  ]);
  for (const command of ['#库洛牌组合', '#净化灵魂宝石', '#重置见泷原时间线', '#编组骑士卡片', '#最终攻击驾驭', '#终极卡试炼']) {
    assert.match(mirrorApp, new RegExp(command));
  }
  assert.match(mirrorApp, /下一目标/);
  assert.match(sakura, /月华守护/);
  assert.match(sakura, /pitySuccess/);
});

test('诸天镜相关应用模块可以完整装载', () => {
  const cwd = fileURLToPath(new URL('../../..', import.meta.url));
  const base = './plugins/zhutianxiuxian1.0';
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    await Promise.all([
      import('${base}/apps/zhutiantouying/ZhutianMirror.js'),
      import('${base}/apps/zhutiantouying/zhutiantouying.js'),
      import('${base}/apps/zhutianjing/mokashaonv.js'),
      import('${base}/apps/zhutianjing/mofashaonv.js'),
      import('${base}/apps/User/UserHome.js'),
    ]);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
