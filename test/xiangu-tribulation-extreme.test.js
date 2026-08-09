import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { calcXianguCarryDaoFlaw } from '../apps/SecretPlace/xianguTribulationSettlement.js';

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
  assert.match(src, /xiangulevel_id === 12/);
  assert.match(src, /breakthroughJiutianShidiExtreme\s*\(/);
  assert.match(src, /xiangulevel_id === 13/);
  assert.match(src, /breakthroughZhanxianExtreme\s*\(/);
  assert.match(src, /xiangu_jiutian_shidi = true/);
  assert.match(src, /xiangu_nifa_zhanwo = true/);
  assert.match(src, /xiangu_zhanxian_zhadao = true/);
  assert.match(src, /xiangu_zhanwo_peak = true/);
});
