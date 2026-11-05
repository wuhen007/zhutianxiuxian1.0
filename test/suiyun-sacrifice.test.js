import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSuiyunRoot, getSuiyunStage } from '../model/suiyun.js';
import { getSacrificePromotionGate, promotePlayerToSacrifice } from '../model/strangeSacrifice.js';
import { getRealmAuthorityPath, revokeBreakKingEmperorEligibility } from '../model/realmAuthority.js';
import { resetSelfDaoAfterImmortalEmperorFall } from '../model/selfDaoDeduction.js';

const source = readFileSync(new URL('../apps/User/zhengdaotixi.js', import.meta.url), 'utf8');
const start = source.indexOf(' async jidao(e)');
const end = source.indexOf('async hongjiTiandao(e)', start);

async function run(root, overrides = {}, random = .999999) {
  const player = {
    名号: '祭道修士', mijinglevel_id: 21, level_id: 64, Physique_id: 63,
    道心: 500, 道心值: 500, 道心上次恢复时间: Date.now(),
    厄土仙帝击杀数: 10, 自身之道阶段: 7, 修炼次数: 400,
    己道推演: { sacrificeAttempts: 10 }, 修为: 10000, 血气: 10000, 灵根: root, ...overrides,
  };
  let writes = 0;
  const messages = [];
  const dependencies = {
    getSuiyunStage, getSacrificePromotionGate, promotePlayerToSacrifice,
    getRealmAuthorityPath, revokeBreakKingEmperorEligibility, resetSelfDaoAfterImmortalEmperorFall,
    existplayer: async () => true, Read_player: async () => player,
    Write_player: async () => writes++, Add_HP: async () => {},
    Math: { random: () => random },
  };
  const command = new Function(...Object.keys(dependencies),
    `return ({${source.slice(start, end)}}).jidao;`)(...Object.values(dependencies));
  await command({ user_id: 'fixture', isGroup: true, reply: text => messages.push(text) });
  return { player, writes, message: messages.join('\n') };
}

test('岁云全部五阶段即使随机值接近1仍祭道必成，三体系晋升沿用原逻辑', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    for (const [route, fields, finalField, finalLevel] of [
      ['mijing', {}, 'mijinglevel_id', 22],
      ['xiangu', { mijinglevel_id: 1, xiangulevel_id: 22 }, 'xiangulevel_id', 23],
      ['huafen', { mijinglevel_id: 1, huafenlevel_id: 22 }, 'huafenlevel_id', 23],
    ]) {
      const result = await run(createSuiyunRoot(stage), { ...fields, 自创修炼体系: { route } });
      assert.equal(result.player[finalField], finalLevel, `${stage}/${route}`);
      assert.equal(result.player.境界称号, '祭道');
      assert.equal(result.player.修为, 0);
      assert.equal(result.player.血气, 0);
      assert.equal(result.writes, 1);
      assert.doesNotMatch(result.message, /祭道失败/);
    }
  }
});

test('岁云祭道仍需满门槛；普通灵根与仅持有赐福者保持原成功率', async () => {
  const blocked = await run(createSuiyunRoot(5), { 厄土仙帝击杀数: 9 });
  assert.match(blocked.message, /祭道门槛未满/);
  assert.equal(blocked.writes, 0);
  assert.equal(blocked.player.mijinglevel_id, 21);
  for (const overrides of [{}, { 月华传承: { 名额: 5 } }, { 诸天镜系统: { 本源灵根: createSuiyunRoot(5) } }]) {
    const failed = await run({ name: '普通灵根' }, overrides);
    assert.match(failed.message, /祭道失败/);
    assert.equal(failed.player.mijinglevel_id, 20);
    const success = await run({ name: '普通灵根' }, overrides, .1);
    assert.equal(success.player.mijinglevel_id, 22);
  }
});
