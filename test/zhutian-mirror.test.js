import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  addMirrorRelic,
  bindBasicZhutianMirror,
  challengeUltimateCardTrial,
  consumeMirrorEnergy,
  consumeZhutianProjectionCost,
  DECADE_LOCATIONS,
  DECADE_TOUR_WORLDS,
  ensureZhutianMirrorSystem,
  executeFinalAttackRide,
  exploreDecadeWorld,
  exploreMitakihara,
  exploreTomoeda,
  getActiveZhutianAvatarName,
  inspectZhutianAvatarSwitchCooldown,
  inspectZhutianAvatarAdvancement,
  inspectZhutianProjectionCost,
  loadZhutianAvatar,
  purifyMadokaSoulGem,
  recordZhutianProjectionCharge,
  recordProjectionMirrorProgress,
  reconcileZhutianProjectionBilling,
  refineZhutianMirror,
  resetMitakiharaTimeline,
  setClowCardDeck,
  setDecadeCardDeck,
  syncCurrentZhutianAvatar,
  MITAKIHARA_LOCATIONS,
  TOMOEDA_LOCATIONS,
  ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS,
  ZHUTIAN_AVATAR_SWITCH_ENERGY_COST,
  ZHUTIAN_PROJECTION_COST,
} from '../model/zhutianMirror.js';
import {
  assertZhutianAvatarRootWriteAllowed,
  assertZhutianMirrorWriteCurrent,
  getZhutianMirrorVersion,
  markZhutianMirrorSnapshot,
} from '../utils/zhutianMirrorVersion.js';

const NOW = Date.parse('2026-08-22T04:00:00Z');

function createPlayer() {
  return {
    level_id: 50,
    mijinglevel_id: 20,
    灵根: { id: 1, name: '金灵根', type: '金', eff: 0.1 },
  };
}

test('异世界化身进阶同时要求本体境界与至少一条等效额外体系', () => {
  const lowMain = createPlayer();
  lowMain.level_id = 41;
  assert.deepEqual(inspectZhutianAvatarAdvancement(lowMain, 2).missing, ['本体境界需达到【地仙】']);

  const lowExtra = createPlayer();
  lowExtra.mijinglevel_id = 9;
  assert.match(inspectZhutianAvatarAdvancement(lowExtra, 2).missing[0], /额外体系/);

  const xianguQualified = createPlayer();
  xianguQualified.level_id = 46;
  xianguQualified.mijinglevel_id = 1;
  xianguQualified.xiangulevel_id = 14;
  assert.equal(inspectZhutianAvatarAdvancement(xianguQualified, 3).ok, true);
});

test('终极神主境界不足时保留试炼进度与镜能', () => {
  const player = createPlayer();
  player.level_id = 49;
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 7;
  player.诸天镜系统.镜能 = 12;
  const progress = player.诸天镜系统.世界进度.假面骑士帝骑;
  progress.神主已解锁 = true;
  progress.已巡游世界 = [...DECADE_TOUR_WORLDS];
  progress.骑士卡片 = ['空我', '亚极陀', '龙骑', 'Faiz', '剑', '响鬼', '甲斗', '电王', 'Kiva'];
  progress.出战卡组 = ['空我', '龙骑', '剑'];

  const result = challengeUltimateCardTrial(player, '共鸣', { now: NOW });
  assert.equal(result.reason, 'realm');
  assert.equal(progress.终极神主已解锁, false);
  assert.equal(player.诸天镜系统.镜能, 12);
});

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

  player.诸天镜系统.镜能 = 2;
  assert.equal(loadZhutianAvatar(player, '木之本樱', { now: NOW }).ok, true);
  assert.equal(player.灵根.name, '木之本樱');
  player.灵根 = { id: 7010015, name: '星之杖·木之本樱', type: '魔卡少女·觉醒' };
  assert.equal(syncCurrentZhutianAvatar(player, { now: NOW }), true);
  assert.equal(player.诸天化身谱[0].stage, 2);
  assert.equal(loadZhutianAvatar(player, '本源', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS }).ok, true);
  assert.equal(player.灵根.name, '金灵根');
});

test('面板持久化跨日恢复时只递增一次诸天镜状态版本', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  consumeMirrorEnergy(player, 1, { now: NOW });
  const before = getZhutianMirrorVersion(player);

  ensureZhutianMirrorSystem(player, {
    now: NOW + 24 * 60 * 60 * 1000,
    bumpOnChange: true,
  });
  assert.equal(player.诸天镜系统.镜能, 3);
  assert.equal(getZhutianMirrorVersion(player), before + 1);

  ensureZhutianMirrorSystem(player, {
    now: NOW + 24 * 60 * 60 * 1000,
    bumpOnChange: true,
  });
  assert.equal(getZhutianMirrorVersion(player), before + 1);
});

test('本源灵根变化后再次装载化身会刷新本源快照', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天化身谱.push({
    name: '木之本樱',
    stage: 1,
    root: { id: 901, name: '木之本樱', type: '诸天化身', eff: 1.2 },
  });
  player.诸天镜系统.镜阶 = 2;
  player.诸天镜系统.镜能 = 4;

  assert.equal(loadZhutianAvatar(player, '木之本樱', { now: NOW }).ok, true);
  assert.equal(loadZhutianAvatar(player, '本源', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS }).ok, true);

  player.灵根 = { id: 88, name: '混沌灵根', type: '混沌', eff: 2.5 };

  assert.equal(loadZhutianAvatar(player, '木之本樱', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS * 2 }).ok, true);
  assert.equal(player.诸天镜系统.本源灵根.name, '混沌灵根');
  assert.equal(loadZhutianAvatar(player, '本源', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS * 3 }).ok, true);
  assert.equal(player.灵根.name, '混沌灵根');
  assert.notEqual(player.灵根, player.诸天镜系统.本源灵根);
});

test('投影固定成本计算保持纯函数且会一次列出所有不足资源', () => {
  assert.deepEqual(ZHUTIAN_PROJECTION_COST, {
    修为: 100_000_000,
    血气: 100_000_000,
    元神: 1_000_000,
    镜能: 1,
  });
  const player = {
    修为: 150_000_000,
    血气: 120_000_000,
    元神: 2_000_000,
    诸天镜系统: { 镜能: 2 },
  };
  const before = structuredClone(player);
  const ready = inspectZhutianProjectionCost(player);
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.remaining, { 修为: 50_000_000, 血气: 20_000_000, 元神: 1_000_000, 镜能: 1 });
  assert.deepEqual(player, before);

  const exact = {
    修为: ZHUTIAN_PROJECTION_COST.修为,
    血气: ZHUTIAN_PROJECTION_COST.血气,
    元神: ZHUTIAN_PROJECTION_COST.元神,
    诸天镜系统: { 镜能: ZHUTIAN_PROJECTION_COST.镜能 },
  };
  assert.equal(consumeZhutianProjectionCost(exact).ok, true);
  assert.deepEqual(exact, { 修为: 0, 血气: 0, 元神: 0, 诸天镜系统: { 镜能: 0, 状态版本: 1 } });

  for (const name of Object.keys(ZHUTIAN_PROJECTION_COST)) {
    const blocked = {
      修为: ZHUTIAN_PROJECTION_COST.修为,
      血气: ZHUTIAN_PROJECTION_COST.血气,
      元神: ZHUTIAN_PROJECTION_COST.元神,
      诸天镜系统: { 镜能: ZHUTIAN_PROJECTION_COST.镜能 },
    };
    if (name === '镜能') blocked.诸天镜系统.镜能 -= 1;
    else blocked[name] -= 1;
    const blockedBefore = structuredClone(blocked);
    const result = consumeZhutianProjectionCost(blocked);
    assert.equal(result.ok, false, `${name}不足时应拦截`);
    assert.deepEqual(blocked, blockedBefore, `${name}不足时四项资源均不应变化`);
  }
});

test('投影入口在玩家锁内以待确认扣费事务落盘', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  const start = source.indexOf('const startResult = await withProjectionMutationLock');
  const end = source.indexOf('if (!startResult.ok)', start);
  const block = source.slice(start, end);
  const consumeIndex = block.indexOf('consumeZhutianProjectionCost(latestPlayer)');
  const pendingIndex = block.indexOf("billingStatus: 'pending'");
  const actionIndex = block.indexOf('await redis.set(actionKey, pendingRaw, { NX: true })', pendingIndex);
  const writeIndex = block.indexOf('await Write_player(playerId, latestPlayer)');
  const activateIndex = block.indexOf('compareAndSetRedisJson(redis, actionKey, pendingRaw, activeProjection)', writeIndex);
  assert.ok(consumeIndex >= 0 && consumeIndex < pendingIndex && pendingIndex < actionIndex);
  assert.ok(actionIndex < writeIndex && writeIndex < activateIndex);
  assert.match(source, /reconcileProjectionAction\(actionKey, latestPlayer\)/);
  assert.match(source, /billingPendingUntil: billingCreatedAt \+ PROJECTION_BILLING_GRACE_MS/);
  assert.match(source, /compareAndDeleteRedisJson\(redis, actionKey, pendingRaw\)/);
  assert.match(source, /idempotencyKey: `zhutian-projection:\$\{billingId\}:terminal-penalty`/);
  assert.doesNotMatch(block, /!activated && !currentRaw/);
  assert.equal((block.match(/Write_player\(playerId, latestPlayer\)/g) || []).length, 1);
});

test('投影待确认扣费在崩溃后可区分未扣费与已扣费状态', () => {
  const projection = { action: '投影诸天', billingId: 'billing-1', billingStatus: 'pending' };
  const unpaid = createPlayer();
  assert.equal(reconcileZhutianProjectionBilling(unpaid, projection).status, 'discard');

  const charged = {
    ...createPlayer(),
    修为: ZHUTIAN_PROJECTION_COST.修为,
    血气: ZHUTIAN_PROJECTION_COST.血气,
    元神: ZHUTIAN_PROJECTION_COST.元神,
    诸天镜系统: { 镜能: 1 },
  };
  assert.equal(consumeZhutianProjectionCost(charged).ok, true);
  recordZhutianProjectionCharge(charged, 'billing-1', { now: NOW });
  const recovered = reconcileZhutianProjectionBilling(charged, projection);
  assert.equal(recovered.status, 'activate');
  assert.equal(recovered.projection.billingStatus, 'active');
});

test('诸天镜状态版本拒绝化身切换前的旧快照回写', () => {
  const current = createPlayer();
  bindBasicZhutianMirror(current, { now: NOW });
  current.诸天化身谱.push({ name: '化身甲', stage: 1, root: { name: '化身甲', type: '诸天化身' } });
  const stale = structuredClone(current);
  assert.equal(loadZhutianAvatar(current, '化身甲', { now: NOW }).ok, true);
  assert.ok(getZhutianMirrorVersion(current) > getZhutianMirrorVersion(stale));
  assert.throws(
    () => assertZhutianMirrorWriteCurrent(current, stale),
    error => error?.code === 'ZHUTIAN_MIRROR_STALE_WRITE',
  );
});

test('诸天镜状态版本拒绝两个快照同时从同一版本递增后互相覆盖', () => {
  const current = createPlayer();
  bindBasicZhutianMirror(current, { now: NOW });
  const first = markZhutianMirrorSnapshot(structuredClone(current));
  const second = markZhutianMirrorSnapshot(structuredClone(current));
  consumeMirrorEnergy(first, 1, { now: NOW });
  consumeMirrorEnergy(second, 1, { now: NOW });

  assert.doesNotThrow(() => assertZhutianMirrorWriteCurrent(current, first));
  assert.throws(
    () => assertZhutianMirrorWriteCurrent(first, second),
    error => error?.code === 'ZHUTIAN_MIRROR_STALE_WRITE',
  );
});

test('装载化身时中央写屏障拒绝未登记的显隐灵根变化', () => {
  const previous = createPlayer();
  bindBasicZhutianMirror(previous, { now: NOW });
  previous.诸天镜系统.当前化身 = '化身甲';
  previous.诸天化身谱.push({ name: '化身甲', root: { name: '化身甲', type: '诸天化身' } });
  previous.灵根 = { name: '化身甲', type: '诸天化身' };

  const external = structuredClone(previous);
  external.灵根 = { name: '外部改根', type: '违规' };
  assert.throws(
    () => assertZhutianAvatarRootWriteAllowed(previous, external),
    error => error?.code === 'ZHUTIAN_AVATAR_ROOT_MUTATION',
  );

  const internal = structuredClone(external);
  internal.诸天镜系统.状态版本++;
  assert.doesNotThrow(() => assertZhutianAvatarRootWriteAllowed(previous, internal));
});

test('卡组编成与灵魂宝石净化都会递增诸天镜状态版本', () => {
  const sakura = createPlayer();
  bindBasicZhutianMirror(sakura, { now: NOW });
  sakura.库洛牌系统.已封印库洛牌 = ['风', '翔', '影'];
  const sakuraVersion = getZhutianMirrorVersion(sakura);
  assert.equal(setClowCardDeck(sakura, ['风', '翔', '影'], { now: NOW }).ok, true);
  assert.equal(getZhutianMirrorVersion(sakura), sakuraVersion + 1);

  const madoka = createPlayer();
  bindBasicZhutianMirror(madoka, { now: NOW });
  const madokaProgress = madoka.诸天镜系统.世界进度.魔法少女小圆;
  madokaProgress.灵魂宝石 = true;
  madokaProgress.灵魂宝石污浊度 = 80;
  madokaProgress.悲叹之种 = 1;
  const madokaVersion = getZhutianMirrorVersion(madoka);
  assert.equal(purifyMadokaSoulGem(madoka, { now: NOW }).ok, true);
  assert.equal(getZhutianMirrorVersion(madoka), madokaVersion + 1);

  const decade = createPlayer();
  bindBasicZhutianMirror(decade, { now: NOW });
  decade.诸天镜系统.世界进度.假面骑士帝骑.骑士卡片 = ['空我', '龙骑', '剑'];
  const decadeVersion = getZhutianMirrorVersion(decade);
  assert.equal(setDecadeCardDeck(decade, ['空我', '龙骑', '剑'], { now: NOW }).ok, true);
  assert.equal(getZhutianMirrorVersion(decade), decadeVersion + 1);
});

test('化身装载提交核心存档后以幂等方式续接附属状态', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/ZhutianMirror.js', import.meta.url), 'utf8');
  const start = source.indexOf('async loadAvatar(e)');
  const end = source.indexOf('async recoverOriginRoot(e)', start);
  const block = source.slice(start, end);
  const writeIndex = block.indexOf('await Write_player(playerId, player)');
  const equipmentIndex = block.indexOf('await Add_najie_thing');

  assert.ok(writeIndex >= 0 && writeIndex < equipmentIndex);
  assert.match(block, /const switched = !result\.unchanged/);
  assert.match(block, /idempotencyKey: `zhutian-exclusive-equipment:/);
  assert.match(block, /再次发送相同装载指令即可续接/);
  assert.doesNotMatch(block, /FileRollbackTransaction|transaction\.rollback|Write_equipment/);
});

test('化身有效切换扣镜能并冷却十五分钟，重复与失败请求不改变灵根', () => {
  assert.equal(ZHUTIAN_AVATAR_SWITCH_ENERGY_COST, 1);
  assert.equal(ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS, 15 * 60 * 1000);
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 2;
  player.诸天镜系统.镜能 = 4;
  player.诸天化身谱.push(
    { name: '化身甲', stage: 1, root: { id: 901, name: '化身甲', type: '诸天化身' } },
    { name: '化身乙', stage: 1, root: { id: 902, name: '化身乙', type: '诸天化身' } },
  );

  const origin = structuredClone(player.灵根);
  const invalid = loadZhutianAvatar(player, '未收录化身', { now: NOW });
  assert.equal(invalid.reason, 'avatar');
  assert.equal(player.诸天镜系统.镜能, 4);
  assert.deepEqual(player.灵根, origin);

  const first = loadZhutianAvatar(player, '化身甲', { now: NOW });
  assert.equal(first.ok, true);
  assert.equal(first.remainingEnergy, 3);
  assert.equal(player.诸天镜系统.化身切换冷却至, NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS);

  const repeated = loadZhutianAvatar(player, '化身甲', { now: NOW + 1 });
  assert.equal(repeated.unchanged, true);
  assert.equal(player.诸天镜系统.镜能, 3);

  const cooling = loadZhutianAvatar(player, '化身乙', { now: NOW + 1 });
  assert.equal(cooling.reason, 'cooldown');
  assert.equal(player.灵根.name, '化身甲');
  assert.equal(player.诸天镜系统.镜能, 3);
  assert.deepEqual(inspectZhutianAvatarSwitchCooldown(player, { now: NOW + 1 }), {
    ready: false,
    currentTime: NOW + 1,
    cooldownUntil: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS,
    remainingMs: ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS - 1,
  });

  const second = loadZhutianAvatar(player, '化身乙', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS });
  assert.equal(second.ok, true);
  assert.equal(player.灵根.name, '化身乙');
  assert.equal(player.诸天镜系统.镜能, 2);

  const back = loadZhutianAvatar(player, '本源', { now: NOW + ZHUTIAN_AVATAR_SWITCH_COOLDOWN_MS * 2 });
  assert.equal(back.ok, true);
  assert.deepEqual(player.灵根, origin);
  assert.equal(player.诸天镜系统.镜能, 1);
});

test('本源缺失或镜能不足时化身切换不改变灵根', () => {
  const missingOrigin = createPlayer();
  bindBasicZhutianMirror(missingOrigin, { now: NOW });
  missingOrigin.诸天镜系统.当前化身 = '化身甲';
  missingOrigin.灵根 = { id: 901, name: '化身甲', type: '诸天化身' };
  const beforeMissing = structuredClone(missingOrigin.灵根);
  assert.equal(loadZhutianAvatar(missingOrigin, '本源', { now: NOW }).reason, 'origin');
  assert.deepEqual(missingOrigin.灵根, beforeMissing);
  assert.equal(missingOrigin.诸天镜系统.镜能, 3);

  const noEnergy = createPlayer();
  bindBasicZhutianMirror(noEnergy, { now: NOW });
  noEnergy.诸天镜系统.镜能 = 0;
  noEnergy.诸天化身谱.push({ name: '化身甲', stage: 1, root: { id: 901, name: '化身甲', type: '诸天化身' } });
  const beforeEnergy = structuredClone(noEnergy.灵根);
  assert.equal(loadZhutianAvatar(noEnergy, '化身甲', { now: NOW }).reason, 'energy');
  assert.deepEqual(noEnergy.灵根, beforeEnergy);
  assert.equal(noEnergy.诸天镜系统.镜能, 0);
  assert.equal(noEnergy.诸天镜系统.化身切换冷却至, 0);
});

test('损坏的化身或本源灵根在扣镜能前拦截', () => {
  const malformedAvatar = createPlayer();
  bindBasicZhutianMirror(malformedAvatar, { now: NOW });
  malformedAvatar.诸天化身谱.push({ name: '损坏化身', stage: 1, root: null });
  const avatarBefore = {
    root: structuredClone(malformedAvatar.灵根),
    energy: malformedAvatar.诸天镜系统.镜能,
    cooldown: malformedAvatar.诸天镜系统.化身切换冷却至,
    version: malformedAvatar.诸天镜系统.状态版本,
  };
  assert.equal(loadZhutianAvatar(malformedAvatar, '损坏化身', { now: NOW }).reason, 'root');
  assert.deepEqual({
    root: malformedAvatar.灵根,
    energy: malformedAvatar.诸天镜系统.镜能,
    cooldown: malformedAvatar.诸天镜系统.化身切换冷却至,
    version: malformedAvatar.诸天镜系统.状态版本,
  }, avatarBefore);

  const malformedOrigin = createPlayer();
  bindBasicZhutianMirror(malformedOrigin, { now: NOW });
  malformedOrigin.诸天镜系统.当前化身 = '化身甲';
  malformedOrigin.诸天镜系统.本源灵根 = {};
  malformedOrigin.灵根 = { name: '化身甲', type: '诸天化身' };
  const originBefore = {
    root: structuredClone(malformedOrigin.灵根),
    energy: malformedOrigin.诸天镜系统.镜能,
    cooldown: malformedOrigin.诸天镜系统.化身切换冷却至,
    version: malformedOrigin.诸天镜系统.状态版本,
  };
  assert.equal(loadZhutianAvatar(malformedOrigin, '本源', { now: NOW }).reason, 'root');
  assert.deepEqual({
    root: malformedOrigin.灵根,
    energy: malformedOrigin.诸天镜系统.镜能,
    cooldown: malformedOrigin.诸天镜系统.化身切换冷却至,
    version: malformedOrigin.诸天镜系统.状态版本,
  }, originBefore);
});

test('未迁移的旧版化身灵根也会触发装载守卫', () => {
  assert.equal(getActiveZhutianAvatarName({ 灵根: { name: '星之杖·木之本樱' } }), '木之本樱');
  assert.equal(getActiveZhutianAvatarName({ 灵根: { name: '金灵根' } }), '');
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

test('无独立地图的投影世界按结局推进世界完成度', () => {
  const player = createPlayer();
  bindBasicZhutianMirror(player, { now: NOW });
  const good = recordProjectionMirrorProgress(player, '崩坏宇宙', { endingType: 'good', now: NOW });
  const neutral = recordProjectionMirrorProgress(player, '崩坏宇宙', { endingType: 'neutral', now: NOW });
  const bad = recordProjectionMirrorProgress(player, '崩坏宇宙', { endingType: 'bad', now: NOW });
  assert.deepEqual([good.完成度增加, neutral.完成度增加, bad.完成度增加], [10, 5, 0]);
  assert.equal(player.诸天镜系统.世界进度.崩坏宇宙.探索度, 15);
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
  assert.equal((sakura.match(/bumpZhutianMirrorVersion\(player\);\s*await Write_player/g) || []).length, 4);
});

test('诸天投影使用明确境界ID并在帮助中列出完整主流程', async () => {
  const [projection, help, botHelp] = await Promise.all([
    readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8'),
    readFile(new URL('../config/help/zhutianhelp.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../apps/Help/BotHelp.js', import.meta.url), 'utf8'),
  ]);
  const worlds = [
    ['魔卡少女樱', 43, '天仙'], ['魔女之旅', 46, '金仙'], ['魔法少女小圆', 46, '金仙'],
    ['星穹铁道·匹诺康尼', 47, '大罗金仙'], ['假面骑士帝骑', 48, '大道金仙'],
    ['万道争锋', 48, '大道金仙'], ['剑渊古路', 51, '无极仙帝'], ['星海归墟', 55, '万界道祖'],
  ];
  for (const [name, levelId, levelName] of worlds) {
    const start = projection.indexOf(`'${name}':`);
    const block = projection.slice(start, projection.indexOf('entryText:', start));
    assert.ok(start >= 0, `缺少投影世界：${name}`);
    assert.match(block, new RegExp(`minLevelId: ${levelId}`));
    assert.match(block, new RegExp(`minLevelName: '${levelName}'`));
  }
  const order = projection.slice(projection.indexOf('const PROJECTION_WORLD_ORDER'), projection.indexOf('function hasProjectionRealm'));
  let previous = -1;
  for (const [name] of worlds) {
    const current = order.indexOf(`'${name}'`);
    assert.ok(current > previous, `投影世界显示顺序错误：${name}`);
    previous = current;
  }
  assert.doesNotMatch(projection, /Level_list\.find/);
  assert.doesNotMatch(projection, /至少需要筑基期/);
  assert.ok((projection.match(/hasProjectionRealm/g) || []).length >= 4);
  const helpData = YAML.parse(help);
  assert.deepEqual(helpData.slice(0, 6).map(group => group.group), [
    '世界聊天 · 跨服消息', '诸天镜总览', '诸天化身', '友枝町与木之本樱', '见泷原与鹿目圆', '骑士世界与帝骑',
  ]);
  for (const command of ['#诸天镜', '#淬炼诸天镜', '#诸天世界', '#投影诸天', '#诸天化身', '#友枝町', '#见泷原', '#骑士世界']) {
    assert.match(help, new RegExp(command));
  }
  assert.match(botHelp, /诸天镜帮助/);
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
