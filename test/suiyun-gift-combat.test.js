import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import template from 'art-template';
import { getSuiyunEffects, getSuiyunStage, hasSuiyunSkills, SUIYUN_EXCLUSIVE_SKILLS } from '../model/suiyun.js';
import { castSuiyunMoonSword, reduceSuiyunDamage, reflectSuiyunDamage, trySuiyunRevival } from '../model/suiyunCombat.js';
import { buildCombatSkillPanel } from '../model/combatSkillPanel.js';
import { createCrossRaidAvatar, hydrateCrossRaidAvatar } from '../apps/worldChat/raid.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const recipient = (extra = {}) => ({
  id: 'gift-fixture', 名号: '受赐修士', 灵根: { name: '普通灵根', type: '普通' },
  攻击: 100, 防御: 80, 当前血量: 1000, 血量上限: 1000, 速度: 100, 学习的功法: [],
  月华传承: { 授予者: 'suiyun-owner', 受赐者: 'gift-fixture', 名额: 1, 传授时间: 1000, 技能: [...SUIYUN_EXCLUSIVE_SKILLS] },
  ...extra,
});

test('普通灵根受赐者仅获得三战技，保留原根且不获得岁云专属被动', () => {
  const player = recipient();
  assert.equal(getSuiyunStage(player), 0);
  assert.equal(hasSuiyunSkills(player), true);
  assert.deepEqual(getSuiyunEffects(player), getSuiyunEffects({ 灵根: { name: '普通灵根' } }));
  assert.equal(reduceSuiyunDamage(player, 100), 50);
  const attacker = { 当前血量: 1000 };
  assert.equal(reflectSuiyunDamage(player, attacker, 50).damage, 50);
  assert.equal(attacker.当前血量, 950);
  const enemy = { 名号: '测试敌手', 当前血量: 1000000, 血量上限: 1000000 };
  const sword = castSuiyunMoonSword(player, [enemy]);
  assert.equal(sword.hits, 9);
  assert.equal(sword.totalDamage, 22500);
  for (let count = 1; count <= 3; count++) {
    player.当前血量 = 0;
    assert.equal(trySuiyunRevival(player).revived, true);
    assert.equal(player._suiyunRevives, count);
  }
  player.当前血量 = 0;
  assert.equal(trySuiyunRevival(player).revived, false);
  player.灵根 = { name: '木之本樱', type: '魔卡少女' };
  player.诸天镜系统 = { 当前化身: '木之本樱' };
  assert.equal(hasSuiyunSkills(player), true, '永久资格跟随角色而非当前灵根');
});

test('分身与复制到其他角色的授予记录均无战技，普通教学不能制造授予资格', () => {
  for (const extra of [{ _tahua_type: 'mirror_self' }, { _yiqihua_entity: true }, { _帝骑分身: true }, { _圆神分身: true }, { _万灵魔幡主魂: true }, { 分身: true }, { id: 'different' }]) {
    const player = recipient(extra);
    assert.equal(hasSuiyunSkills(player), false);
    assert.equal(castSuiyunMoonSword(player, [{ 当前血量: 1000 }]).active, false);
  }
  const learnedOnly = recipient({ 月华传承: undefined, 学习的功法: [...SUIYUN_EXCLUSIVE_SKILLS] });
  assert.equal(hasSuiyunSkills(learnedOnly), false);
  const source = read('model/xiuxian.js');
  const start = source.indexOf('export function createTahuaAvatarEntity(');
  const end = source.indexOf('\nasync function zd_battle_1v1(', start);
  const create = new Function(`${source.slice(start, end).replace('export ', '')}; return createTahuaAvatarEntity;`)();
  const cloned = create(recipient(), {}, { id: 'mirror_self' }, 3, 'A');
  assert.equal(cloned.月华传承, undefined);
  assert.equal(hasSuiyunSkills(cloned), false);
});

test('月华受赐者面板与HTML标记赐予来源，无占槽或虚构熟练度', () => {
  const panel = buildCombatSkillPanel(recipient());
  const innate = panel.sections.flatMap(section => section.items).filter(item => item.innate);
  assert.deepEqual(innate.map(item => item.name), [...SUIYUN_EXCLUSIVE_SKILLS]);
  assert.ok(innate.every(item => item.sourceLabel === '月华赐予' && item.stage.includes('第1位')));
  assert.equal(panel.totalEquipped, 0);
  const html = template.render(read('resources/html/combat_skill/combat_skill.html'), { panel, pluResPath: '/fixture' });
  assert.equal((html.match(/<span>月华赐予<\/span>/g) || []).length, 3);
  assert.doesNotMatch(html, /<span>灵根自带<\/span>|当前熟练度/);
  assert.match(read('apps/User/GongfaProficiency.js'), /item\.sourceLabel \|\| '灵根自带'/);
});

test('跨服匿名投影保留已验证战技，快照不泄露授予者和受赐者QQ', () => {
  const player = recipient({ id: '987654321', 月华传承: { 授予者: '123456789', 受赐者: '987654321', 名额: 2, 传授时间: 1000, 技能: [...SUIYUN_EXCLUSIVE_SKILLS] } });
  const snapshot = createCrossRaidAvatar(player);
  assert.doesNotMatch(JSON.stringify(snapshot), /123456789|987654321/);
  assert.equal(snapshot.id, undefined);
  assert.equal(snapshot.月华传承.受赐者, 'cross_snapshot');
  const hydrated = hydrateCrossRaidAvatar(snapshot, { serverId: 'fixture', memberTag: 'anonymous' });
  assert.equal(hydrated.月华传承.受赐者, hydrated.id);
  assert.equal(hasSuiyunSkills(hydrated), true);
  assert.equal(getSuiyunStage(hydrated), 0);
  assert.equal(getSuiyunEffects(hydrated).luckBonus, 0);
  assert.equal(createCrossRaidAvatar({ ...player, id: 'different' }).月华传承, undefined);
  const malformed = structuredClone(snapshot);
  malformed.月华传承.技能 = ['霜剑入月'];
  assert.equal(hydrateCrossRaidAvatar(malformed).月华传承, undefined);
});

test('实际单挑、队战和共享团本中获赐普通角色拥有三技与HP回写上限', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    globalThis.redis = { get: async () => null, del: async () => 0 };
    Math.random = () => .5;
    const { zd_battle, tb_battle } = await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const unit = (name, extra = {}) => ({
      名号: name, 攻击: 100, 防御: 1, 当前血量: 1e6, 血量上限: 1e6, 速度: 5000,
      暴击率: 0, 暴击伤害: 1.5, 闪避率: 0, 吸血率: 0, 穿透: 0, 法球倍率: 1,
      灵根: { name: '普通灵根', type: '普通', 法球倍率: 1 }, 生命本源: 100, 魔道值: 0,
      学习的功法: [], mijinglevel_id: 0, xiangulevel_id: 0, huafenlevel_id: 0, ...extra,
    });
    const gift = { 授予者: 'fixture-owner', 受赐者: 'cross_skill_recipient', 名额: 1, 传授时间: 1000, 技能: ['霜剑入月', '岁云归一', '白云苍狗'] };
    const gifted = unit('受赐修士', { id: gift.受赐者, 月华传承: gift });
    const original = structuredClone(gifted);
    const wall = unit('高防敌手', { 攻击: 1, 防御: 1e12, 速度: 1 });
    const duel = await zd_battle(gifted, wall, { maxRound: 1, preserveHpOnTimeout: true });
    assert.ok(duel.msg.some(line => /霜剑击中高防敌手9次，实际伤害合计22500/.test(line)));
    assert.deepEqual(gifted, original);
    const fragile = { ...gifted, 攻击: 1, 当前血量: 100, 血量上限: 100, 速度: 1 };
    const killer = unit('攻击者', { 攻击: 1e6, 当前血量: 450, 血量上限: 450 });
    const revived = await zd_battle(killer, fragile);
    assert.equal(revived.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);
    assert.equal(revived.winner, 'B');
    assert.equal(revived.B_hp, 100);
    const team = await zd_battle([killer], [fragile]);
    assert.equal(team.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);
    assert.equal(team.winner, 'B');
    assert.equal(team.B_team[0].当前血量, 100);
    const raid = await tb_battle([{ ...gifted, 攻击: 10000 }], wall, {});
    assert.ok(raid.msg.some(line => String(line).includes('【霜剑入月】')));
    assert.equal(raid.result, '玩家胜利');
    assert.equal(gifted.灵根.name, '普通灵根');
    assert.equal(gifted.魔道值, 0);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
