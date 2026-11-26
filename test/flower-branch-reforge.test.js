import test from 'node:test';
import assert from 'node:assert/strict';
import { reforgeExtraCultivationState } from '../model/extraCultivation.js';
import {
  getFlowerBranchState, normalizeFlowerBranchState, preserveFlowerBranchAfterReforge,
} from '../model/flowerPollenBranch.js';

const player = (level, former = '究极') => ({
  额外体系: 'huafen', huafenlevel_id: level, mijinglevel_id: 23, xiangulevel_id: 1,
  花粉路分支: level >= 18 ? '宇究' : former, 花粉路前身分支: former,
  极境: ['13'], 花粉极境: ['本源觉醒', '究极根基', '究极道果'],
  进化积淀: 1234, 花粉隐患: 12, 修为: 1e12, 血气: 2e12,
  花粉道途: { version: 1, stages: { immortalKingPrinciple: 9600 } },
  自创修炼体系: { name: '旧道', route: 'huafen' },
  时间线权能: { tribulations: { huafen: { status: 'passed', passedAt: 123 } } },
});

test('reforging twenty to nineteen and nineteen to eighteen preserves the converged branch and true former choice', () => {
  for (const level of [20, 19]) for (const former of ['大宇', '究极']) {
    const p = player(level, former), before = structuredClone(p);
    const result = reforgeExtraCultivationState(p);
    assert.equal(result.changed, true);
    assert.equal(p.huafenlevel_id, level - 1);
    assert.equal(p.mijinglevel_id, 22, 'original rollback of other stored realms remains');
    assert.equal(p.额外体系, 'huafen');
    assert.equal(p.花粉路分支, '宇究');
    assert.equal(p.花粉路前身分支, former);
    assert.deepEqual(p.极境, []);
    assert.deepEqual(p.花粉极境, []);
    for (const key of ['进化积淀', '花粉隐患', '修为', '血气', '花粉道途', '自创修炼体系', '时间线权能']) assert.deepEqual(p[key], before[key], key);
    assert.deepEqual({ ...p.花粉分支回炉记录[0], at: 0 }, { fromLevel: level, toLevel: level - 1, branch: '宇究', formerBranch: former, at: 0 });
  }
});

test('eighteen to seventeen restores the recorded original branch even when later extreme names suggest another choice', () => {
  for (const former of ['大宇', '究极']) {
    const p = player(18, former);
    p.花粉极境 = former === '大宇' ? ['究极根基', '究极道果'] : ['大宇净化'];
    reforgeExtraCultivationState(p);
    assert.equal(p.huafenlevel_id, 17);
    assert.deepEqual(getFlowerBranchState(p), { level: 17, branch: former, formerBranch: former, needsReview: false });
  }
});

test('missing former records remain explicitly unknown and never infer a choice from regained extreme names or old history', () => {
  for (const level of [18, 19, 20]) {
    const p = player(level);
    delete p.花粉路分支; delete p.花粉路前身分支;
    p.花粉分支回炉记录 = [{ fromLevel: 17, toLevel: 16, branch: '大宇', formerBranch: '大宇', at: 10 }];
    const before = structuredClone(p), state = getFlowerBranchState(p);
    assert.deepEqual(p, before, 'read-only resolver does not mutate');
    assert.equal(state.branch, '宇究');
    assert.equal(state.formerBranch, '');
    assert.equal(state.needsReview, true);
    normalizeFlowerBranchState(p);
    reforgeExtraCultivationState(p);
    assert.equal(p.花粉路分支, level === 18 ? '' : '宇究');
    assert.equal(p.花粉路前身分支, '');
    assert.equal(getFlowerBranchState(p).needsReview, true);
    assert.equal(p.花粉分支回炉记录.length, 2);
  }
});

test('seventeen to sixteen clears active identity but keeps evidence without forcing a later branch choice', () => {
  const p = player(17, '究极');
  reforgeExtraCultivationState(p);
  assert.equal(p.huafenlevel_id, 16);
  assert.equal(p.花粉路分支, undefined);
  assert.equal(p.花粉路前身分支, undefined);
  assert.deepEqual(getFlowerBranchState(p), { level: 16, branch: '', formerBranch: '', needsReview: false });
  assert.equal(p.花粉分支回炉记录[0].formerBranch, '究极');
  // A future real evolution owns the fresh choice. Neither resolver nor
  // normalization resurrects the old historical 究极 identity.
  p.huafenlevel_id = 17;
  p.花粉路分支 = '大宇';
  normalizeFlowerBranchState(p);
  assert.equal(p.花粉路分支, '大宇');
  assert.equal(p.花粉路前身分支, '大宇');
  assert.equal(p.花粉分支回炉记录[0].formerBranch, '究极');
});

test('repeated rollbacks preserve branch evidence through convergence and stop appending below the branch threshold', () => {
  const p = player(20, '大宇');
  for (const expected of [19, 18, 17, 16]) {
    reforgeExtraCultivationState(p);
    assert.equal(p.huafenlevel_id, expected);
    assert.equal(p.花粉路分支, expected >= 18 ? '宇究' : expected === 17 ? '大宇' : undefined);
  }
  const history = structuredClone(p.花粉分支回炉记录);
  reforgeExtraCultivationState(p);
  assert.deepEqual(p.花粉分支回炉记录, history);
  assert.equal(history.length, 4);
});

test('low-level and no-change reforges retain original behavior and do not create a branch reward or history', () => {
  const low = player(2); delete low.花粉路分支; delete low.花粉路前身分支;
  reforgeExtraCultivationState(low);
  assert.equal(low.huafenlevel_id, 1);
  assert.equal(low.花粉分支回炉记录, undefined);
  const initial = { huafenlevel_id: 1, mijinglevel_id: 1, xiangulevel_id: 1 };
  assert.equal(reforgeExtraCultivationState(initial).changed, false);
  assert.equal(initial.花粉分支回炉记录, undefined);
});

test('helper preserves explicit historical evidence and never overwrites malformed legacy history', () => {
  const p = player(18, '大宇'); p.huafenlevel_id = 17;
  p.花粉分支回炉记录 = { legacy: 'preserve' };
  preserveFlowerBranchAfterReforge(p, 18, 17, 123);
  assert.deepEqual(p.花粉分支回炉记录, { legacy: 'preserve' });
  assert.equal(p.花粉路分支, '大宇');
});
