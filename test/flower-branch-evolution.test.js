import test from 'node:test';
import assert from 'node:assert/strict';
import { reforgeExtraCultivationState } from '../model/extraCultivation.js';
import { getFlowerBranchState } from '../model/flowerPollenBranch.js';
import {
  resolveFlowerBreakthrough, resolveFlowerEvolution, getFlowerBranchProfile,
  getNextFlowerExtremeTrial, completeFlowerExtremeTrial,
} from '../model/flowerPollenPath.js';

const player = (level, extremes = []) => ({
  额外体系: 'huafen', huafenlevel_id: level, mijinglevel_id: 1, xiangulevel_id: 1,
  花粉极境: [...extremes], 进化积淀: 100000, 花粉隐患: 0,
  始祖污染度: 0, 道伤: 0, 学习的功法: [], 修为: 1e12, 血气: 1e12,
});
const medium = '无暇进化花粉';

test('real sixteen-to-seventeen-to-eighteen evolution chooses the current extreme branch and persists the same former identity', () => {
  for (const firstStep of [resolveFlowerBreakthrough, resolveFlowerEvolution]) {
    for (const branch of ['大宇', '究极']) {
      const former = branch === '大宇' ? '究极' : '大宇';
      const p = player(16, branch === '究极' ? ['究极根基'] : []);
      // Old saves can retain these raw fields below seventeen. Fresh evolution
      // must replace both rather than persist a contradictory former choice.
      p.花粉路分支 = '宇究';
      p.花粉路前身分支 = former;
      p.花粉分支回炉记录 = [{ fromLevel: 17, toLevel: 16, branch: former, formerBranch: former, at: 10 }];
      assert.equal(firstStep(p, medium, () => 0).ok, true);
      assert.equal(p.huafenlevel_id, 17);
      assert.equal(p.花粉路分支, branch);
      assert.equal(p.花粉路前身分支, branch);
      assert.equal(getFlowerBranchProfile(p).name, branch);
      // Learning an extreme afterwards never rewrites the established branch.
      if (!p.花粉极境.includes('究极根基')) p.花粉极境.push('究极根基');
      assert.equal(resolveFlowerEvolution(p, medium, () => 0).ok, true);
      assert.equal(p.huafenlevel_id, 18);
      assert.equal(p.花粉路分支, '宇究');
      assert.equal(p.花粉路前身分支, branch);
      assert.deepEqual(getFlowerBranchState(p), { level: 18, branch: '宇究', formerBranch: branch, needsReview: false });
      assert.equal(p.花粉分支回炉记录[0].formerBranch, former);
    }
  }
});

test('real reforge below seventeen permits a new choice while its old historical branch remains evidence only', () => {
  for (const [oldBranch, nextBranch] of [['究极', '大宇'], ['大宇', '究极']]) {
    const p = player(17, oldBranch === '究极' ? ['究极根基', '究极道果'] : ['大宇净化']);
    p.花粉路分支 = oldBranch;
    p.花粉路前身分支 = oldBranch;
    reforgeExtraCultivationState(p);
    assert.equal(p.huafenlevel_id, 16);
    assert.deepEqual(p.花粉极境, []);
    assert.equal(p.花粉路分支, undefined);
    if (nextBranch === '究极') p.花粉极境.push('究极根基');
    assert.equal(resolveFlowerBreakthrough(p, medium, () => 0).ok, true);
    assert.equal(p.花粉路分支, nextBranch);
    assert.equal(p.花粉路前身分支, nextBranch);
    assert.equal(resolveFlowerEvolution(p, medium, () => 0).ok, true);
    assert.equal(p.花粉路分支, '宇究');
    assert.equal(p.花粉路前身分支, nextBranch);
    assert.equal(p.花粉分支回炉记录[0].formerBranch, oldBranch);
  }
});

test('unknown seventeen-to-eighteen provenance converges without inventing a former choice from new extremes or history', () => {
  const p = player(17, ['究极根基', '究极道果']);
  p.花粉分支回炉记录 = [{ fromLevel: 17, toLevel: 16, branch: '大宇', formerBranch: '大宇', at: 10 }];
  assert.equal(getFlowerBranchState(p).needsReview, true);
  assert.equal(resolveFlowerEvolution(p, medium, () => 0).ok, true);
  assert.equal(p.huafenlevel_id, 18);
  assert.equal(p.花粉路分支, '宇究');
  assert.equal(getFlowerBranchState(p).formerBranch, '');
  assert.equal(getFlowerBranchState(p).needsReview, true);
  assert.equal(getFlowerBranchProfile(p).name, '宇究');
});

test('unknown former choice never grants either branch-specific extreme while ordinary extreme recovery still works', () => {
  const p = player(19);
  const completed = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = completeFlowerExtremeTrial(p);
    if (!result.ok) break;
    completed.push(result.trial.name);
  }
  assert.ok(completed.includes('究极根基'));
  assert.equal(completed.includes('大宇净化'), false);
  assert.equal(completed.includes('究极道果'), false);
  assert.equal(getNextFlowerExtremeTrial(p), null);
  assert.equal(getFlowerBranchState(p).needsReview, true);
  assert.equal(getFlowerBranchProfile(p).name, '宇究');
});

test('failed or insufficient-quality evolution preserves the established branch identity and its history', () => {
  for (const startLevel of [16, 17]) {
    const p = player(startLevel);
    p.花粉路分支 = startLevel === 17 ? '大宇' : '';
    p.花粉路前身分支 = startLevel === 17 ? '大宇' : '';
    p.花粉分支回炉记录 = [{ fromLevel: 17, toLevel: 16, branch: '究极', formerBranch: '究极', at: 10 }];
    const before = structuredClone(p);
    assert.equal(resolveFlowerEvolution(p, '普通进化花粉', () => 0).reason, 'quality');
    const result = startLevel === 16
      ? resolveFlowerBreakthrough(p, medium, () => 0.999)
      : resolveFlowerEvolution(p, medium, () => 0.999);
    assert.equal(result.ok, false);
    for (const field of ['huafenlevel_id', '花粉路分支', '花粉路前身分支', '花粉分支回炉记录']) assert.deepEqual(p[field], before[field], field);
  }
});
