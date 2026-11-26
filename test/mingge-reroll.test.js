import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyInitialMinggeEffects,
  applyInitialMinggeEffectsRaw,
  rollbackInitialMinggeEffects,
} from '../model/mingge.js';

const makeMingge = (id, effects) => ({
  id,
  name: id,
  rarity: 1,
  rarityName: '普通',
  category: 'test',
  isNegative: false,
  severity: 0,
  effects,
});

test('重抽命格：速度等 initial 效果正确减旧加新，不累积', () => {
  const minggeA = makeMingge('A', { 速度: 20, 仙道潜力额外: 5, 幸运值: 10 });
  const minggeB = makeMingge('B', { 速度: 30, 仙道潜力额外: 3, 幸运值: 0 });
  const minggeC = makeMingge('C', { 速度: 50, 仙道潜力额外: 8, 幸运值: 0 });

  const player = {
    速度: 100,
    仙道潜力: 0,
    生命本源: 1,
    寿元: 1,
    幸运: 0,
    心神额外上限: 0,
    心神: 0,
  };

  // 模拟首次抽两条（主命格 A + 附加命格 B）
  applyInitialMinggeEffects(player, minggeA); // 100+20=120, 仙道潜力 0+5=5, 幸运 0+0.1=0.1
  applyInitialMinggeEffects(player, minggeB); // 120+30=150, 仙道潜力 5+3=8

  assert.equal(player.速度, 150);
  assert.equal(player.仙道潜力, 8);
  assert.equal(Math.round(player.幸运 * 100) / 100, 0.1);

  // 模拟重抽主命格 A -> C：先回滚 A 再加 C
  rollbackInitialMinggeEffects(player, minggeA.effects); // 150-20=130, 仙道潜力 8-5=3
  applyInitialMinggeEffectsRaw(player, minggeC.effects); // 130+50=180, 仙道潜力 3+8=11

  // 期望 = 基础100 + B(30) + C(50) = 180；仙道潜力 = B(3)+C(8)=11
  assert.equal(player.速度, 180);
  assert.equal(player.仙道潜力, 11);

  // 再重抽附加命格 B -> A（反向），验证完全对称
  rollbackInitialMinggeEffects(player, minggeB.effects); // 180-30=150
  applyInitialMinggeEffectsRaw(player, minggeA.effects); // 150+20=170
  // 期望 = 基础100 + C(50) + A(20) = 170
  assert.equal(player.速度, 170);
});

test('重抽时旧命格 effects 缺失（数据异常）不报错、不破坏现有属性', () => {
  const player = { 速度: 150, 仙道潜力: 8 };
  // 传入 undefined effects（在 minggeList 中找不到旧命格）
  rollbackInitialMinggeEffects(player, undefined);
  applyInitialMinggeEffectsRaw(player, { 速度: 5 });
  assert.equal(player.速度, 155);
  assert.equal(player.仙道潜力, 8);
});

test('心神额外上限随重抽正确回滚/应用', () => {
  const m1 = makeMingge('m1', { 心神额外上限: 100 });
  const m2 = makeMingge('m2', { 心神额外上限: 200 });
  const player = { 速度: 100, 心神额外上限: 0, 心神: 0 };
  applyInitialMinggeEffects(player, m1); // 心神额外上限 100, 心神 +100
  assert.equal(player.心神额外上限, 100);
  assert.equal(player.心神, 100);
  rollbackInitialMinggeEffects(player, m1.effects); // 回滚 100
  assert.equal(player.心神额外上限, 0);
  assert.equal(player.心神, 0);
  applyInitialMinggeEffectsRaw(player, m2.effects); // 应用 200
  assert.equal(player.心神额外上限, 200);
  assert.equal(player.心神, 200);
});

test('重抽使速度降低时也能正确回滚（不会只增不减）', () => {
  const fast = makeMingge('fast', { 速度: 80 });
  const slow = makeMingge('slow', { 速度: 10 });
  const player = { 速度: 100, 仙道潜力: 0, 生命本源: 1, 寿元: 1, 幸运: 0, 心神额外上限: 0, 心神: 0 };
  applyInitialMinggeEffects(player, fast); // 100+80=180
  assert.equal(player.速度, 180);
  rollbackInitialMinggeEffects(player, fast.effects); // 180-80=100
  applyInitialMinggeEffectsRaw(player, slow.effects); // 100+10=110
  assert.equal(player.速度, 110); // 必须比 180 低，证明回滚生效
});
