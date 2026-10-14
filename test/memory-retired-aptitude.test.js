import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { getAptitudeWudaoBonus } from '../apps/User/wudaoRules.js';
import { resolveReincarnationAptitudeLoss } from '../model/reincarnationAptitude.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('停用的星神天资不再获得最高悟道或轮回档位，普通最高天资和岁云保留', () => {
  assert.equal(getAptitudeWudaoBonus('星神之资'), 0);
  assert.equal(getAptitudeWudaoBonus('无演无尽'), .3);
  assert.equal(resolveReincarnationAptitudeLoss('星神之资').next, '先天不足');
  assert.equal(resolveReincarnationAptitudeLoss('岁云').next, '万古无双');
  assert.equal(resolveReincarnationAptitudeLoss('无演无尽').next, '万古无双');
  const source = read('apps/User/daofa.js');
  const start = source.indexOf('const aptitudeMap = {');
  const end = source.indexOf('\n};', start);
  const mapping = vm.runInNewContext(`${source.slice(start, end + 3)}; aptitudeMap;`);
  assert.equal(mapping['星神之资'], undefined);
  assert.equal(mapping['岁云'], 10);
  assert.equal(mapping['无演无尽'], 10);
});

function battleFixture(kind) {
  const entity = { id: 'fixture-enemy', 名号: '试炼灾厄', type: '孽兽', status: 'active', 当前血量: 100, 血量上限: 100, 生命本源: 200 };
  const player = { kind, 名号: '试炼修士', 当前血量: 100, 灵根: { name: kind === 'memory' ? '无漏净子' : kind } };
  const values = new Map(), replies = [];
  const source = read('apps/Boss/ForeignCalamity.js')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export class', 'class');
  const Constructor = vm.runInNewContext(`${source}\nForeignCalamity;`, {
    plugin: class { constructor(options) { Object.assign(this, options); } },
    redis: { get: async key => values.get(key), set: async (key, value) => { values.set(key, value); return 'OK'; } },
    existplayer: async () => true,
    Read_player: async () => player,
    Write_player: async () => {},
    withForeignCalamityLock: async (_id, action) => action(),
    withForeignOverlordLock: async (_id, action) => action(),
    withPlayerMutationLock: async (_id, action) => action(),
    readForeignCalamity: async () => entity,
    readActiveForeignOverlord: async () => entity,
    readForeignOverlord: async () => entity,
    saveForeignCalamity: async () => {},
    saveForeignOverlord: async () => {},
    registerForeignCalamityDefeat: async () => null,
    spawnForeignOverlordIfReady: async () => null,
    createForeignCalamityRewardPlan: () => [],
    createForeignOverlordCombatant: value => value,
    applyForeignOverlordBattleResult: value => { value.status = 'defeated'; return { damage: 100 }; },
    FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS: 900000,
    FOREIGN_OVERLORD_REFINEMENT_WEIGHT: .5,
    zd_battle: async () => ({ winner: 'A', A_hp: 50, msg: ['试炼结束'] }),
    isEvilCultivator: value => value.kind === 'evil',
    getSuiyunStage: value => value.kind === 'suiyun' ? 1 : 0,
    getMemoryStage: value => value.kind === 'memory' ? 4 : 0,
    get_fight_img: async (_event, lines) => lines.join('\n'),
    bigNumberTransform: String,
  });
  const app = new Constructor();
  app.resolveTarget = async () => entity;
  app.grantReward = async () => ({ lines: [] });
  return { app, entity, values, replies, event: { user_id: 'fixture', msg: '#讨伐域外灾厄 1', reply: async text => replies.push(text) } };
}

for (const method of ['battleCalamity', 'battleOverlord']) {
  test(`${method}记忆命途不再签发炼化凭证，邪修和岁云保留`, async () => {
    for (const kind of ['memory', 'evil', 'suiyun']) {
      const f = battleFixture(kind);
      await f.app[method](f.event);
      const receipts = [...f.values.keys()].filter(key => key.includes(':refine:'));
      assert.equal(receipts.length, kind === 'memory' ? 0 : 1, kind);
      assert.doesNotMatch(f.replies.join('\n'), /六相冰封|记忆封存/);
      if (method === 'battleOverlord') {
        assert.equal(Boolean(f.entity.refinement), kind !== 'memory');
        assert.match(f.replies.join('\n'), /裂界残忆/);
      }
    }
  });
}
