import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAO_TREASURE_ALL_ATTRIBUTE_BONUS,
  DAO_TREASURE_FIXED_ATTRIBUTES,
  DAO_TREASURE_REPAIR_TARGETS,
  applyDaoTreasureBattleOpening,
  applyDaoTreasureDomainReduction,
  applyDaoTreasureLawDeduction,
  consumeDaoTreasureRevivalBlock,
  createDaoTreasureItem,
  getDaoTreasureForgeProgress,
  resolveDaoTreasureCritical,
  tickDaoTreasureDomain,
  tryDaoTreasureDeathRewrite,
} from '../model/daoTreasure.js';

const completeState = {
  treasure: {
    ownerId: '10001',
    authorities: { 生死: '完整', 命运: '完整', 万法: '完整', 世界: '完整' },
  },
};

function makeHolder(authority) {
  return {
    id: '10001',
    名号: '器主',
    当前大道至宝: '诸天文明炉',
    大道主权柄: authority,
    当前血量: 1000,
    血量上限: 1000,
    减伤: 0.1,
  };
}

test('大道至宝固定炼制五万世界年并按万年切换五阶段', () => {
  assert.deepEqual(getDaoTreasureForgeProgress(2000, 1999), {
    elapsed: 0,
    stageIndex: 0,
    completed: false,
  });
  assert.equal(getDaoTreasureForgeProgress(2000, 11_999).stageIndex, 0);
  assert.equal(getDaoTreasureForgeProgress(2000, 12_000).stageIndex, 1);
  assert.equal(getDaoTreasureForgeProgress(2000, 51_999).stageIndex, 4);
  assert.deepEqual(getDaoTreasureForgeProgress(2000, 52_000), {
    elapsed: 50_000,
    stageIndex: 5,
    completed: true,
  });
});

test('大道至宝实体绑定器主且使用最终固定加算与加法倍率', () => {
  const item = createDaoTreasureItem({
    id: 'dao-1',
    name: '诸天文明炉',
    ownerId: '10001',
    integrity: 100,
    completedWorldYear: 52_000,
  });
  assert.equal(item.type, '至宝');
  assert.equal(item.品阶, '大道至宝');
  assert.equal(item.绑定者, '10001');
  assert.equal(item.固定全属性, DAO_TREASURE_FIXED_ATTRIBUTES);
  assert.equal(item.全属性倍率加成, DAO_TREASURE_ALL_ATTRIBUTE_BONUS);
  assert.equal(item.islockd, 1);
  assert.equal(item.不可交易, true);
  assert.deepEqual(DAO_TREASURE_REPAIR_TARGETS, ['本体', '生死', '命运', '万法', '世界']);
});

test('生死权柄每战护命一次并删除敌方一次复生', () => {
  const holder = makeHolder('生死');
  const enemy = { 名号: '敌手', 当前血量: 1000, 血量上限: 1000 };
  const opening = applyDaoTreasureBattleOpening(holder, enemy, { state: completeState });
  assert.equal(opening.active, true);

  holder.当前血量 = 0;
  holder.不可复活 = true;
  const rewritten = tryDaoTreasureDeathRewrite(holder);
  assert.equal(rewritten.revived, true);
  assert.equal(holder.当前血量, 400);
  assert.equal(holder.不可复活, false);
  assert.equal(tryDaoTreasureDeathRewrite({ ...holder, 当前血量: 0 }).revived, false);

  enemy.当前血量 = 0;
  assert.equal(consumeDaoTreasureRevivalBlock(enemy), true);
  assert.equal(consumeDaoTreasureRevivalBlock(enemy), false);
});

test('命运权柄保证器主首次暴击并否决敌方首次暴击', () => {
  const holder = makeHolder('命运');
  holder.暴击伤害 = 2.25;
  const enemy = { 名号: '敌手', 当前血量: 1000, 血量上限: 1000 };
  applyDaoTreasureBattleOpening(holder, enemy, { state: completeState });

  assert.equal(resolveDaoTreasureCritical(holder, 1).multiplier, 2.25);
  assert.equal(resolveDaoTreasureCritical(holder, 1).multiplier, 1);
  assert.equal(resolveDaoTreasureCritical(enemy, 3).multiplier, 1);
  assert.equal(resolveDaoTreasureCritical(enemy, 3).multiplier, 3);
});

test('万法权柄每三击追加法则伤害并对首领使用百分比上限', () => {
  const holder = makeHolder('万法');
  const enemy = { 名号: '敌手', 当前血量: 1000, 血量上限: 1000 };
  applyDaoTreasureBattleOpening(holder, enemy, { state: completeState });

  assert.equal(applyDaoTreasureLawDeduction(holder, enemy, 100).triggered, false);
  assert.equal(applyDaoTreasureLawDeduction(holder, enemy, 100).triggered, false);
  const normal = applyDaoTreasureLawDeduction(holder, enemy, 100);
  assert.equal(normal.triggered, true);
  assert.equal(normal.lawDamage, 70);
  assert.equal(normal.damage, 170);

  holder._大道万法道痕 = 2;
  const boss = applyDaoTreasureLawDeduction(
    holder,
    { 名号: '纪元首领', 当前血量: 5000, 血量上限: 5000 },
    1000,
    { isBoss: true }
  );
  assert.equal(boss.lawDamage, 500);
  assert.equal(boss.damage, 1500);
});

test('世界权柄持续五次行动并提供独立35%减伤', () => {
  const holder = makeHolder('世界');
  const enemy = { 名号: '敌手', 当前血量: 1000, 血量上限: 1000 };
  const opening = applyDaoTreasureBattleOpening(holder, enemy, { state: completeState });
  assert.equal(opening.holderSpeedMultiplier, 1.3);
  assert.equal(opening.opponentSpeedMultiplier, 0.8);
  assert.equal(holder._大道世界减伤, 0.35);
  assert.equal(applyDaoTreasureDomainReduction(holder, 1000), 650);

  for (let i = 0; i < 4; i++) assert.equal(tickDaoTreasureDomain(holder), '');
  assert.match(tickDaoTreasureDomain(holder), /大道界归隐/);
  assert.equal(holder._大道世界减伤, undefined);
  assert.equal(applyDaoTreasureDomainReduction(holder, 1000), 1000);
});
