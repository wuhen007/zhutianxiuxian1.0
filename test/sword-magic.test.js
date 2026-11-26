import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runSwordMagicCommand, SWORD_MAGIC_TRAITS, SWORD_MAGIC_REGIONS,
  assertSwordMagicWriteCurrent, getSwordMagicCommandBlock,
  getPendingMemorial, clearPendingMemorial,
  SWORD_MAGIC_ENDGAME_FATES as swordMagicEndgameFates,
} from '../model/swordMagic.js';

function fixture(profession = '剑士', rolls = () => 0.999) {
  const player = { id: 'fantasy', level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1,
    huafenlevel_id: 1, lunhui: 0, power_place: 0, 灵石: 10000 };
  let now = 1, seq = 0;
  const send = (text, options = {}) => runSwordMagicCommand(player, text, { now, random: rolls, requestId: `msg-${++seq}`, ...options });
  const act = (text, options) => { const result = send(text, options); assert.equal(result.ok, true, `${text}: ${result.message}`); return result; };
  const finish = () => { assert.ok(player.剑与魔法.action); now = player.剑与魔法.action.endAt; return act('结算'); };
  act('入界 确认');
  if (profession) { act('抽取词条'); act(`就职 ${profession}`); }
  return { player, send, act, finish, advance: n => { now += n; } };
}

test('开局双词条权重公开，无吟唱者可抽取、不重复且只抽一次', () => {
  assert.equal(SWORD_MAGIC_TRAITS.reduce((sum, item) => sum + item.weight, 0), 100);
  const values = [0.39, 0];
  const f = fixture('', () => values.shift());
  f.act('抽取词条');
  assert.deepEqual(f.player.剑与魔法.traits, ['silent', 'spirit']);
  assert.equal(f.send('抽取词条').changed, false);
  assert.match(f.act('词条').message, /第二抽剔除/);
});

test('错误随机源与异常数量整体回滚，不留下半个天赋和半笔费用', () => {
  const f = fixture('');
  const before = structuredClone(f.player);
  const values = [0, NaN];
  assert.equal(f.send('抽取词条', { random: () => values.shift() }).ok, false);
  assert.deepEqual(f.player, before);
  for (const command of ['购买 __proto__ 1', '购买 疗伤药 -1', '购买 疗伤药 1.5', '取出 constructor 1', '存入 野营口粮 999999']) {
    assert.equal(f.send(command).ok, false, command);
    assert.deepEqual(f.player, before);
  }
});

test('职业只选择一次，训练预付费用但到期前没有经验和熟练度', () => {
  const f = fixture();
  assert.equal(f.send('就职 魔法师').ok, false);
  const skill = f.player.剑与魔法.skills.剑术;
  const exp = f.player.剑与魔法.exp;
  f.act('训练 剑术');
  assert.equal(f.player.剑与魔法.coins, 110);
  assert.equal(f.player.剑与魔法.skills.剑术, skill);
  assert.equal(f.player.剑与魔法.exp, exp);
  assert.equal(f.send('训练 魔法').ok, false);
  f.finish();
  assert.ok(f.player.剑与魔法.skills.剑术 > skill);
  assert.ok(f.player.剑与魔法.exp > exp);
  const saved = structuredClone(f.player);
  assert.equal(f.act('结算').changed, false);
  assert.deepEqual(f.player, saved);
});

test('探索与抉择各有真实耗时，阶段前无掉落，只有回镇才入账', () => {
  const f = fixture();
  f.act('探索 风鸣林');
  assert.equal(f.player.剑与魔法.bag.野营口粮, 1);
  assert.equal(f.player.剑与魔法.chapter, 0);
  assert.equal(f.player.剑与魔法.bag.古代晶片, undefined);
  assert.equal(f.send('抉择 调查').changed, false);
  f.finish();
  assert.ok(f.player.剑与魔法.encounter);
  f.act('抉择 调查');
  assert.equal(f.player.剑与魔法.chapter, 0);
  f.finish();
  assert.equal(f.player.剑与魔法.chapter, 1);
  assert.equal(f.player.剑与魔法.place, '白桦镇');
  assert.ok(f.player.剑与魔法.bag.古代晶片 >= 2);
});

test('到期状态查询自动结算，失败的新指令不回滚已经完成的旧行动', () => {
  const f = fixture();
  f.act('训练 剑术');
  const finishAt = f.player.剑与魔法.action.endAt;
  const result = f.send('无效指令', { now: finishAt });
  assert.equal(result.ok, false);
  assert.equal(result.changed, true);
  assert.equal(f.player.剑与魔法.action, null);
  assert.ok(f.player.剑与魔法.exp > 0);
});

test('JSON重启、重复消息保持结束时间和随机记录，不重复训练发奖', () => {
  const f = fixture();
  f.act('训练 剑术', { requestId: 'start' });
  const copy = JSON.parse(JSON.stringify(f.player));
  const before = structuredClone(copy);
  assert.equal(runSwordMagicCommand(copy, '训练 剑术', { now: 100, requestId: 'start' }).changed, false);
  assert.deepEqual(copy, before);
  const endAt = copy.剑与魔法.action.endAt;
  assert.equal(runSwordMagicCommand(copy, '状态', { now: endAt, requestId: 'done' }).changed, true);
  const completed = structuredClone(copy);
  assert.equal(runSwordMagicCommand(copy, '状态', { now: endAt + 1, requestId: 'done' }).changed, false);
  assert.deepEqual(copy, completed);
});

test('背包上限、仓储取放守恒且探索期间隔离仓储', () => {
  const f = fixture();
  f.act('存入 疗伤药 2');
  assert.equal(f.player.剑与魔法.storage.疗伤药, 2);
  f.act('取出 疗伤药 1');
  assert.equal(f.player.剑与魔法.bag.疗伤药, 1);
  assert.equal(f.player.剑与魔法.storage.疗伤药, 1);
  assert.equal(f.send('购买 野营口粮 12').ok, false);
  f.act('探索 风鸣林');
  assert.equal(f.send('取出 疗伤药 1').ok, false);
  f.act('撤离');
  assert.equal(f.player.剑与魔法.place, '风鸣林');
  f.finish();
  assert.equal(f.player.剑与魔法.place, '白桦镇');
  assert.equal(f.player.剑与魔法.chapter, 0);
});

test('药品与免费疗养到期才恢复，零余额仍可计时帮工重建补给', () => {
  const f = fixture();
  f.player.剑与魔法.hp = 15;
  f.player.剑与魔法.coins = 0;
  f.act('使用 疗伤药');
  assert.equal(f.player.剑与魔法.hp, 15);
  assert.equal(f.player.剑与魔法.bag.疗伤药, 1);
  f.finish();
  assert.equal(f.player.剑与魔法.hp, 75);
  f.act('休养'); f.finish();
  assert.equal(f.player.剑与魔法.hp, 100);
  f.act('帮工'); assert.equal(f.player.剑与魔法.coins, 0);
  f.finish(); assert.equal(f.player.剑与魔法.coins, 15);
});

test('精灵亲和、魔力超群、无吟唱者提供真实能力而不只是显示名字', () => {
  const f = fixture('', () => 0);
  const values = [0.35, 0];
  f.act('抽取词条', { random: () => values.shift() });
  assert.ok(f.player.剑与魔法.traits.includes('mana'));
  assert.equal(f.player.剑与魔法.mp, 95);
  assert.ok(f.player.剑与魔法.traits.includes('spirit'));
  f.act('就职 魔法师'); f.act('探索 风鸣林'); f.finish();
  f.act('抉择 精灵交涉'); f.finish();
  assert.equal(f.player.剑与魔法.chapter, 1);
  assert.equal(f.player.剑与魔法.pact, true);
  const silent = fixture('魔法师', (() => { const rolls = [0.39, 0]; return () => rolls.length ? rolls.shift() : 0.99; })());
  const state = silent.player.剑与魔法;
  state.chapter = 3; state.lore = SWORD_MAGIC_REGIONS.slice(0, 3).map(region => region.name); state.level = 4;
  silent.act('探索 断冠遗迹'); silent.finish();
  silent.act('抉择 静默解析');
  assert.equal(state.action, null); // 模型通过副本提交；旧引用不会偷偷被原地修改。
  assert.equal(silent.player.剑与魔法.action.endAt - silent.player.剑与魔法.action.startedAt, 3 * 60_000);
});

test('战败实际损失并要求休养，见闻只在成功完成主线后解锁', () => {
  const f = fixture('剑士', () => 0);
  f.player.剑与魔法.hp = 1;
  f.act('探索 风鸣林'); f.finish(); f.act('抉择 救援'); f.finish();
  assert.equal(f.player.剑与魔法.wounded, true);
  assert.equal(f.player.剑与魔法.chapter, 0);
  assert.equal(f.player.剑与魔法.defeats, 1);
  assert.equal(f.send('探索 风鸣林').ok, false);
  f.act('休养'); f.finish();
  assert.equal(f.player.剑与魔法.wounded, false);
});

test('风鸣林的救援、调查和精灵交涉留下不同的长期收益', () => {
  const rescue = fixture();
  rescue.act('探索 风鸣林'); rescue.finish(); rescue.act('抉择 救援'); rescue.finish();
  assert.equal(rescue.player.剑与魔法.companion, true);
  assert.equal(rescue.player.剑与魔法.pact, false);
  const investigate = fixture();
  investigate.act('探索 风鸣林'); investigate.finish(); investigate.act('抉择 调查'); investigate.finish();
  assert.equal(investigate.player.剑与魔法.companion, false);
  assert.ok(investigate.player.剑与魔法.bag.古代晶片 > rescue.player.剑与魔法.bag.古代晶片);
});

test('独立路线旧写屏障保护职业、背包、位置与原修仙等级', () => {
  const f = fixture();
  const before = structuredClone(f.player);
  f.act('训练 剑术');
  assert.doesNotThrow(() => assertSwordMagicWriteCurrent(before, f.player));
  assert.throws(() => assertSwordMagicWriteCurrent(f.player, before), { code: 'SWORD_MAGIC_STALE_WRITE' });
  for (const mutate of [p => { delete p.剑与魔法; }, p => { p.power_place = 0; },
    p => { p.level_id = 4; }, p => { p.剑与魔法.coins++; }]) {
    const next = structuredClone(f.player); mutate(next);
    assert.throws(() => assertSwordMagicWriteCurrent(f.player, next), { code: 'SWORD_MAGIC_STALE_WRITE' });
  }
  for (const command of ['#闭关', '#修仙签到', '#复活地球 入界 确认', '#降临 修仙界']) assert.ok(getSwordMagicCommandBlock(f.player, command));
  // 转世确认流程是合法出口，不得拦截
  for (const command of ['#剑与魔法 帮助', '#我的纳戒', '#抽取命格词条', '#我', '#再入仙途', '#强制再入仙途', '断绝此生', '再继仙缘']) assert.equal(getSwordMagicCommandBlock(f.player, command), '');
});

for (const profession of ['剑士', '魔法师', '僧侣', '游侠']) {
  test(`${profession}只用真实命令、等待和资源完成六地区主线与职业终局`, () => {
    const f = fixture(profession);
    const primary = { 剑士: '剑术', 魔法师: '魔法', 僧侣: '祷告', 游侠: '剑术' }[profession];
    for (const [i, region] of SWORD_MAGIC_REGIONS.entries()) {
      while (f.player.剑与魔法.level < region.level || (i === 5 && f.player.剑与魔法.skills[primary] < 10)) {
        while (f.player.剑与魔法.coins < 10) { f.act('帮工'); f.finish(); }
        f.act(`训练 ${primary}`); f.finish();
      }
      f.act('休养'); f.finish();
      if (!f.player.剑与魔法.weapon && (f.player.剑与魔法.bag.古代晶片 || 0) >= 4) { f.act('锻造'); f.finish(); }
      if ((f.player.剑与魔法.bag.古代晶片 || 0) > 3 && f.player.剑与魔法.weapon) f.act(`存入 古代晶片 ${f.player.剑与魔法.bag.古代晶片}`);
      if (!f.player.剑与魔法.bag.野营口粮) f.act('购买 野营口粮 2');
      f.act(`探索 ${region.name}`); f.finish();
      const choice = i === 5 ? { 剑士: '重铸勇者誓约', 魔法师: '织补地脉', 僧侣: '继承守隙王冠', 游侠: '重铸勇者誓约' }[profession]
        : region.choices.includes('调查') ? '调查' : region.choices[0];
      f.act(`抉择 ${choice}`); f.finish();
      assert.equal(f.player.剑与魔法.chapter, i + 1);
    }
    assert.ok(f.player.剑与魔法.ending);
    assert.equal(f.player.level_id, 1);
    assert.equal(f.player.灵石, 10000);
  });
}

test('飞升需要完整通关与二次确认，毕业后落仙界且拦截解除', () => {
  const f = fixture('剑士');
  assert.equal(f.send('飞升 确认').ok, false); // 未通关直接确认：拒绝
  const state = f.player.剑与魔法;
  state.chapter = 6; state.lore = SWORD_MAGIC_REGIONS.map(region => region.name);
  state.ending = '黎明勇者'; state.level = 8; // 模拟已通关角色；尚缺职业武装
  assert.equal(f.send('飞升 确认').ok, false);
  state.weapon = true;
  const info = f.send('飞升');
  assert.equal(info.changed, false);
  assert.match(info.message, /飞升 确认/);
  const before = structuredClone(f.player);
  const result = f.act('飞升 确认');
  assert.match(result.message, /真界境后期/);
  // 毕业效果：境界跳变、修为清零、落仙界、铜币折灵石（120×100）
  assert.equal(f.player.剑与魔法.status, 'ascended');
  assert.equal(f.player.level_id, 39);
  assert.equal(f.player.修为, 0);
  assert.equal(f.player.power, 0);
  assert.equal(f.player.power_place, 1);
  assert.equal(f.player.灵石, 10000 + 120 * 100);
  // 毕业专属命格：异界归人 + 终局专属词条；额外开对应格数
  assert.deepEqual(f.player.附加命格, ['otherworld_returnee', 'dawn_oath']);
  assert.equal(f.player.命格词条上限, 3);
  // 写保护：active→ascended 的一次性跳变合法
  assert.doesNotThrow(() => assertSwordMagicWriteCurrent(before, f.player));
  // 待发信物标记按终局登记，清空时才推进 revision
  assert.equal(f.player.剑与魔法.memorial, '黎明勇者');
  assert.deepEqual(getPendingMemorial(f.player), { id: 9600501, name: '黎明誓约剑', pinji: 6, ending: '黎明勇者' });
  const revision = f.player.剑与魔法.revision;
  assert.equal(clearPendingMemorial(f.player), true);
  assert.equal(f.player.剑与魔法.memorial, '');
  assert.equal(f.player.剑与魔法.revision, revision + 1);
  assert.equal(clearPendingMemorial(f.player), false);
  assert.equal(f.player.剑与魔法.revision, revision + 1);
  // 拦截解除：普通修仙指令放行，#剑与魔法 前缀仍可查档案
  assert.equal(getSwordMagicCommandBlock(f.player, '#闭关'), '');
  assert.equal(getSwordMagicCommandBlock(f.player, '#剑与魔法 状态'), '');
  const archived = f.act('状态');
  assert.match(archived.message, /档案封存/);
  assert.match(f.act('回顾').message, /飞升诸天/);
});

test('飞升幂等防重：重复确认不发奖，旧消息重放走回执', () => {
  const f = fixture('僧侣');
  const state = f.player.剑与魔法;
  state.chapter = 6; state.lore = SWORD_MAGIC_REGIONS.map(region => region.name);
  state.ending = '守隙魔王'; state.level = 10; state.weapon = true;
  f.act('飞升 确认');
  const stones = f.player.灵石;
  // 终局专属词条按结局发放
  assert.deepEqual(f.player.附加命格, ['otherworld_returnee', 'riftward_vow']);
  assert.equal(f.player.命格词条上限, 3);
  assert.deepEqual(Object.keys(swordMagicEndgameFates), ['黎明勇者', '地脉贤者', '守隙魔王', '折冠之人']);
  assert.equal(swordMagicEndgameFates['地脉贤者'].id, 'leyline_promise');
  assert.equal(swordMagicEndgameFates['折冠之人'].id, 'crown_breaker');
  // 新消息再次确认：档案守卫拒绝，不重复发放
  const again = f.send('飞升 确认');
  assert.equal(again.ok, false);
  assert.equal(f.player.灵石, stones);
  // 同一 requestId 重放：命中回执，不重复发放
  const replay = runSwordMagicCommand(f.player, '飞升 确认', { now: 1, requestId: 'msg-4' });
  assert.equal(replay.changed, false);
  assert.match(replay.message, /已处理消息/);
  assert.equal(f.player.灵石, stones);
  // 毕业后行动类指令全部拒绝
  for (const command of ['训练 祷告', '探索 风鸣林', '抽取词条', '购买 疗伤药 1']) {
    assert.equal(f.send(command).ok, false, command);
  }
  assert.equal(f.player.灵石, stones);
  // 飞升后存档仍受版本保护：revision 倒退与删档照样拒绝
  const stale = structuredClone(f.player); stale.剑与魔法.revision--;
  assert.throws(() => assertSwordMagicWriteCurrent(f.player, stale), { code: 'SWORD_MAGIC_STALE_WRITE' });
  const deleted = structuredClone(f.player); delete deleted.剑与魔法;
  assert.throws(() => assertSwordMagicWriteCurrent(f.player, deleted), { code: 'SWORD_MAGIC_STALE_WRITE' });
});

test('旧档缺少篇章状态字段时按在籍处理，飞升后不再锚定位面', () => {
  const f = fixture('游侠');
  delete f.player.剑与魔法.status; // 模拟飞升功能上线前的旧档
  const result = f.act('状态');
  assert.equal(result.ok, true);
  assert.equal(f.player.power_place, 0.7);
  const state = f.player.剑与魔法;
  state.chapter = 6; state.lore = SWORD_MAGIC_REGIONS.map(region => region.name);
  state.ending = '地脉贤者'; state.level = 9; state.weapon = true;
  f.act('飞升 确认');
  assert.equal(f.player.power_place, 1);
  assert.equal(f.player.剑与魔法.status, 'ascended');
});

test('无职2.0：早慧魔力淬炼、七阶熟练度位阶与连续训练/连续帮工', () => {
  const f = fixture('魔法师');
  f.player.剑与魔法.coins = 300;
  // 连续训练 3 次魔法：消耗 30 铜币，耗时 15 分钟，扣减 75 MP 压到 0 触发早慧魔力淬炼
  f.act('训练 魔法 3');
  assert.equal(f.player.剑与魔法.coins, 270);
  assert.equal(f.player.剑与魔法.action.endAt - f.player.剑与魔法.action.startedAt, 15 * 60_000);
  const done = f.finish();
  assert.match(done.message, /早慧魔力淬炼/);
  assert.equal(f.player.剑与魔法.manaForaged, 1);
  assert.ok(f.player.剑与魔法.skills.魔法 >= 17);
  // 连续帮工 4 次：耗时 20 分钟，获得 60 铜币
  const coinsBefore = f.player.剑与魔法.coins;
  f.act('帮工 4');
  f.finish();
  assert.equal(f.player.剑与魔法.coins, coinsBefore + 60);
});

test('无职2.0：Lv.5 二转流派晋升、魔界古皇开眼与三阶魔导圣铠锻造', () => {
  const f = fixture('剑士');
  const state = f.player.剑与魔法;
  assert.equal(f.send('转职 天剑流').ok, false); // 等级与熟练未达标
  state.level = 5;
  state.skills.剑术 = 12;
  state.chapter = 2;
  state.lore = SWORD_MAGIC_REGIONS.slice(0, 2).map(r => r.name);
  state.coins = 500;
  state.bag = { 古代晶片: 6 };
  state.storage = { 古代晶片: 12 };
  f.act('转职 天剑流');
  assert.equal(f.player.剑与魔法.subclass, '天剑流');
  assert.equal(f.send('转职 止水流').ok, false); // 二转不可重复
  // 觉醒预知眼
  f.act('开眼 预知眼');
  assert.equal(f.player.剑与魔法.demonEye, '预知眼');
  assert.equal(f.send('开眼 千里眼').ok, false);
  // 三阶武装依次锻造：职业武装(60币4晶) → 傲慢龙骨铭装(120币6晶) → 初代魔导圣铠(200币8晶)
  f.act('锻造'); f.finish();
  assert.equal(f.player.剑与魔法.weaponTier, 1);
  f.act('取出 古代晶片 4');
  f.act('锻造'); f.finish();
  assert.equal(f.player.剑与魔法.weaponTier, 2);
  f.act('取出 古代晶片 8');
  f.act('锻造'); f.finish();
  assert.equal(f.player.剑与魔法.weaponTier, 3);
  assert.equal(f.send('锻造').ok, false); // 三阶封顶
});

test('无职2.0：灾变家书（旧契约信）收集、第四真结局「折冠之人」与飞升后裂隙探索', () => {
  const f = fixture('剑士');
  const state = f.player.剑与魔法;
  state.level = 9;
  state.skills.剑术 = 25;
  state.weapon = true;
  state.weaponTier = 3;
  state.chapter = 5;
  state.lore = SWORD_MAGIC_REGIONS.slice(0, 5).map(r => r.name);
  state.bag.旧契约信 = 3;
  state.bag.野营口粮 = 2;
  f.act('探索 裂月王庭');
  f.finish();
  const res = f.act('抉择 斩碎地脉炉');
  assert.equal(res.ok, true);
  const fin = f.finish();
  assert.match(fin.message, /折冠之人/);
  assert.equal(f.player.剑与魔法.ending, '折冠之人');
  // 飞升：初代魔导圣铠额外折算 50000 灵石，发放断冠古剑(9600504)与折冠破妄(crown_breaker)
  const coinsBefore = f.player.剑与魔法.coins;
  f.act('飞升 确认');
  assert.equal(f.player.灵石, 10000 + coinsBefore * 100 + 50_000);
  assert.deepEqual(f.player.附加命格, ['otherworld_returnee', 'crown_breaker']);
  assert.deepEqual(getPendingMemorial(f.player), { id: 9600504, name: '断冠古剑', pinji: 6, ending: '折冠之人' });
  // 飞升后每日 1 次裂隙探索
  const echo = f.act('裂隙探索');
  assert.match(echo.message, /裂隙回响/);
  assert.ok(f.player.修为 >= 40_000);
  assert.equal(f.send('裂隙探索').ok, false); // 当日不可重复
});
