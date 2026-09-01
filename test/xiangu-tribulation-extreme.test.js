import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  calcXianguCarryDaoFlaw,
  resolveXianguBreakthroughCommand,
} from '../apps/SecretPlace/xianguTribulationSettlement.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('载道劫判定：无自身之道或阶段不足时留下隐患', () => {
  assert.deepEqual(calcXianguCarryDaoFlaw({}), { ownWayStrong: false, externalDaoFlaw: true });
  assert.deepEqual(
    calcXianguCarryDaoFlaw({ 已创自身之道: true, 自身之道阶段: 2 }),
    { ownWayStrong: false, externalDaoFlaw: true },
  );
  assert.deepEqual(
    calcXianguCarryDaoFlaw({ 已创自身之道: true, 自身之道阶段: '1' }),
    { ownWayStrong: false, externalDaoFlaw: true },
  );
});

test('载道劫判定：自身之道达到至尊·真意（阶段>=3）可以我为根、不留隐患', () => {
  assert.deepEqual(
    calcXianguCarryDaoFlaw({ 已创自身之道: true, 自身之道阶段: 3 }),
    { ownWayStrong: true, externalDaoFlaw: false },
  );
  assert.deepEqual(
    calcXianguCarryDaoFlaw({ 已创自身之道: true, 自身之道阶段: 8 }),
    { ownWayStrong: true, externalDaoFlaw: false },
  );
});

test('仙古渡劫新增虚道极境·九天十地劫独立试炼', () => {
  const src = readSource('apps/SecretPlace/xianguTribulation.js');
  assert.match(src, /runJiutianShidiTrial\s*\(/);
  assert.match(src, /_runJiutianShidiTribulation\s*\(/);
  assert.match(src, /第一关·九天十地演化/);
  assert.match(src, /最后一层天/);
  assert.match(src, /niFaZhanWo/);
  assert.match(src, /逆伐斩我/);
});

test('仙古渡劫新增斩我极境·斩仙铡刀劫独立试炼', () => {
  const src = readSource('apps/SecretPlace/xianguTribulation.js');
  assert.match(src, /runZhanxianZhandaoTrial\s*\(/);
  assert.match(src, /_runZhanxianZhandaoTribulation\s*\(/);
  assert.match(src, /第一关·葬地雷渊/);
  assert.match(src, /不朽印记/);
  assert.match(src, /zhanwoPeak/);
});

test('天神破虚道与后续主线、极境试炼统一接入恐怖威能结算', () => {
  const src = readSource('apps/SecretPlace/xianguTribulation.js');
  assert.match(src, /calculateXianguHorrorWavePower\s*\(/);
  assert.match(src, /getXianguUpperTribulationHorrorMultiplier\(fromLevelId\)/);
  assert.match(src, /getXianguUpperTribulationHorrorMultiplier\(12\)/);
  assert.match(src, /getXianguUpperTribulationHorrorMultiplier\(13\)/);
  assert.match(src, /finalWave:\s*i === waves\.length - 1/);
  assert.match(src, /maxDamageRate:\s*this\._horrorMultiplier > 1/);
  assert.match(src, /baseDamage:\s*ordinaryBase \* daoHeartMultiplier/);
  assert.match(src, /const base = horror\.damage;/);
  assert.doesNotMatch(src, /horror\.damage \* daoHeartMultiplier/);
  assert.match(src, /_withTransientTribulationEffects\s*\(player, action\)/);
  assert.match(src, /finally\s*\{\s*this\._resetTransientTribulationEffects\(player\)/);
  assert.match(src, /_resetTransientTribulationEffects\s*\(player\)/);
  assert.doesNotMatch(src, /const r = originalDamage \* \(player\.者字秘效果/);
  assert.doesNotMatch(src, /const r = originalDamage \* \(player\.不灭经效果/);
  assert.doesNotMatch(src, /const r = originalDamage \* \(player\.涅槃仙功效果/);
});

test('遁一破境改为战场血战中渡劫，斩仙铡刀不再作为遁一前置', () => {
  const src = readSource('apps/SecretPlace/xianguTribulation.js');
  assert.match(src, /第一关·战场血战/);
  assert.match(src, /战场破境/);
  assert.match(src, /帝族强者皓丰/);
  assert.doesNotMatch(src, /本关先重现斩我阶段的斩仙铡刀淬炼/);
});

test('至尊路新增第四关·载道之劫，外部道痕隐患由自身之道境界决定', () => {
  const src = readSource('apps/SecretPlace/xianguTribulation.js');
  assert.match(src, /第四关·载道/);
  assert.match(src, /以身为种、以我为根/);
  assert.match(src, /externalDaoFlaw: finalFlaw/);
  assert.match(src, /calcXianguCarryDaoFlaw\(player\)/);
});

test('冲关极境在虚道/斩我接续九天十地劫与斩仙铡刀劫入口', () => {
  const src = readSource('apps/User/xiangujinshi.js');
  assert.equal(
    resolveXianguBreakthroughCommand(12, true).method,
    'breakthroughJiutianShidiExtreme',
  );
  assert.match(src, /breakthroughJiutianShidiExtreme\s*\(/);
  assert.equal(
    resolveXianguBreakthroughCommand(13, true).method,
    'breakthroughZhanxianExtreme',
  );
  assert.match(src, /breakthroughZhanxianExtreme\s*\(/);
  assert.match(src, /xiangu_jiutian_shidi = true/);
  assert.match(src, /xiangu_nifa_zhanwo = true/);
  assert.match(src, /xiangu_zhanxian_zhadao = true/);
  assert.match(src, /xiangu_zhanwo_peak = true/);
});
