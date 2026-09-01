import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getLocationName, PLACE_LOCATION_MAP } from '../model/weimianTravel.js';

const pluginSource = fs.readFileSync(
  new URL('../apps/SecretPlace/OtherShoreWorld.js', import.meta.url),
  'utf8'
);
const secretPlaceSource = fs.readFileSync(
  new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url),
  'utf8'
);
const expeditionSource = fs.readFileSync(
  new URL('../model/otherShoreExpedition.js', import.meta.url),
  'utf8'
);
const canglanWebSource = fs.readFileSync(
  new URL('../resources/web/canglan/app.js', import.meta.url),
  'utf8'
);
const innateTreasureSource = fs.readFileSync(
  new URL('../model/innateTreasure.js', import.meta.url),
  'utf8'
);

test('彼岸世界插件注册完整探索入口与前置界律拦截', () => {
  assert.match(pluginSource, /priority:\s*1/);
  assert.match(pluginSource, /进入彼岸世界/);
  assert.match(pluginSource, /彼岸网页/);
  assert.match(pluginSource, /观测大星/);
  assert.match(pluginSource, /远征/);
  assert.match(pluginSource, /探索大星/);
  assert.match(pluginSource, /锚定大星/);
  assert.match(pluginSource, /柠檬堂/);
  assert.match(pluginSource, /无尽商店/);
  assert.match(pluginSource, /选购/);
  assert.match(pluginSource, /服用/);
  assert.match(pluginSource, /guardOtherShoreTransit/);
  assert.match(pluginSource, /遨游时间长河/);
  assert.match(pluginSource, /轮回\|登仙\|证道\|轰击成仙路/);
  assert.match(pluginSource, /Number\(player\?\.power_place\) === OTHER_SHORE_PLANE_ID/);
  const webEntry = pluginSource.slice(
    pluginSource.indexOf('async openOtherShoreWeb(e)'),
    pluginSource.indexOf('async observeStar(e)'),
  );
  assert.match(webEntry, /await e\.reply\(message\)/);
  assert.doesNotMatch(webEntry, /pickFriend|sendMsg/);
  assert.match(pluginSource, /ACTION_RECEIPT_LIMIT/);
  assert.match(pluginSource, /其余道痕需由其他修士补全/);
  assert.match(pluginSource, /一键回血/);
});

test('彼岸世界拥有独立位面编号并开启位面配置', () => {
  const planes = JSON.parse(fs.readFileSync(new URL('../resources/data/位面.json', import.meta.url), 'utf8'));
  assert.equal(PLACE_LOCATION_MAP.彼岸世界, 3.8);
  assert.equal(getLocationName(3.8), '彼岸世界');
  assert.equal(planes.彼岸世界, 1);
  assert.match(secretPlaceSource, /threshold\.code === 'sealed'/);
  assert.match(secretPlaceSource, /isSealedLocation\(location\)/);
});

test('彼岸区域战役接入共享营地、临时行囊、救援与幂等结算', () => {
  for (const command of [
    '彼岸远征',
    '建设前线营地',
    '推进彼岸战役',
    '彼岸行囊',
    '存放彼岸战利品',
    '救援彼岸修士',
    '彼岸撤离',
    '彼岸强撤',
    '领取彼岸远征战果',
    '追回',
  ]) {
    assert.match(pluginSource, new RegExp(command));
  }
  for (const action of [
    'expedition_enter',
    'camp_build',
    'campaign_advance',
    'bag_deposit',
    'expedition_rescue',
    'lost_cache_recover',
    'evacuation_start',
    'evacuation_force',
    'expedition_claim',
  ]) {
    assert.match(pluginSource, new RegExp(`['"]${action}['"]`));
  }
  assert.match(pluginSource, /serializeExpeditionForWeb/);
  assert.match(pluginSource, /createExpeditionEnemy/);
  assert.match(pluginSource, /other_shore_campaign_boss/);
  assert.match(pluginSource, /claimXianguBagItems/);
  assert.match(pluginSource, /xiangu:other-shore:/);
  assert.match(pluginSource, /区域远征已锁定当前大星/);
  assert.match(pluginSource, /pendingExpeditionSettlement/);
  assert.match(pluginSource, /本次救援不恢复气血/);
  assert.ok(pluginSource.includes('match(/^#救援彼岸修士\\s+(\\S+)/)'));
  assert.match(pluginSource, /serializeOtherShoreProgression/);
  assert.match(pluginSource, /previewOtherShoreDaoTreasureForge/);
  assert.match(pluginSource, /validateOtherShoreLayerAccess\('qiankun'/);
  assert.match(pluginSource, /trueWorldExplorationComplete/);
  assert.match(pluginSource, /knownRecipes:/);
  assert.doesNotMatch(pluginSource, /riftMotherAnchor:\s*true/);
  assert.doesNotMatch(pluginSource, /const dimensionBreak = Boolean/);
  assert.match(pluginSource, /#彼岸层级/);
  assert.match(pluginSource, /#彼岸铸宝/);
});

test('沧澜三段主线从当前战役星接入并由母锚首通开放真世界', () => {
  for (const token of [
    'OTHER_SHORE_CAMPAIGNS',
    'OTHER_SHORE_CAMPAIGN_CHAIN',
    'OTHER_SHORE_QIN_FERRY_STAR_ID',
    'OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID',
  ]) {
    assert.match(pluginSource, new RegExp(token));
    assert.match(expeditionSource, new RegExp(token));
  }
  assert.doesNotMatch(
    pluginSource,
    /targetId\s*!==\s*OTHER_SHORE_EXPEDITION_STAR_ID/,
  );
  assert.match(pluginSource, /const campaign = OTHER_SHORE_CAMPAIGNS\[targetId\]/);
  assert.match(pluginSource, /storedRun\?\.starId === focusStarId \? raw\.viewer\.run : null/);
  assert.match(
    expeditionSource,
    /synchronizeCompletedCampaignStar\(world, campaignState\)/,
  );
  assert.match(pluginSource, /message = result\.completed[\s\S]+首通完成，可封存战利品并撤离/);
  assert.match(pluginSource, /motherAnchor\?\.phase === 'cleared'/);
  assert.match(pluginSource, /campaignClears === OTHER_SHORE_CAMPAIGN_CHAIN\.length/);
  assert.match(pluginSource, /lockedReason/);
  assert.match(canglanWebSource, /drawCampaignRoute/);
  assert.match(canglanWebSource, /沧澜主线/);
  assert.match(canglanWebSource, /前置锁定/);
  assert.doesNotMatch(canglanWebSource, /total:\s*4/);
  assert.match(canglanWebSource, /number:\s*5,\s*total:\s*5,\s*name:\s*'镇压神炉灾核'/);
});

test('真世界网页动作接入层级切换、共享探索与战果回执', () => {
  for (const action of [
    'true_world_enter',
    'true_world_leave',
    'true_world_observe',
    'true_world_move',
    'true_world_explore',
    'true_world_encounter',
    'true_world_claim',
  ]) {
    assert.match(pluginSource, new RegExp(`['"]${action}['"]`));
    assert.match(canglanWebSource, new RegExp(action));
  }
  for (const command of ['进入真世界', '返回沧澜界', '观测真世界', '前往真世界', '探索真世界', '迎战真世界敌群', '领取真世界战果']) {
    assert.match(pluginSource, new RegExp(command));
  }
  assert.match(pluginSource, /assertTrueWorldExclusive/);
  assert.match(pluginSource, /彼岸真世界记录/);
  assert.match(pluginSource, /彼岸炼器材料/);
  assert.match(pluginSource, /session\.runId}:\$\{operation/);
  assert.match(pluginSource, /TRUE_WORLD_EXPLORATION_TARGET = OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT/);
});

test('彼岸古文明事件与大道至宝正式铸造接入命令、网页和事务回执', () => {
  for (const command of [
    '彼岸古文明',
    '推进古文明事件',
    '领取古文明战果',
    '大道开炉',
    '大道出炉',
  ]) {
    assert.match(pluginSource, new RegExp(command));
  }
  for (const action of [
    'ancient_event_contribute',
    'ancient_event_claim',
    'dao_forge_start',
    'dao_forge_claim',
  ]) {
    assert.match(pluginSource, new RegExp(`['"]${action}['"]`));
  }
  for (const contract of [
    'ensureOtherShoreAncientEvents',
    'serializeOtherShoreAncientEvents',
    'contributeOtherShoreAncientEvent',
    'claimOtherShoreAncientEventReward',
    'ensureOtherShoreDaoTreasureForgeState',
    'startOtherShoreDaoTreasureForge',
    'claimOtherShoreDaoTreasureForge',
    'serializeOtherShoreDaoTreasureForge',
    'FileRollbackTransaction',
    'writeInnateTreasureState',
    'createOtherShoreDaoTreasureItem',
    'grantQuasiImmortalEmperorRecipe',
  ]) {
    assert.match(pluginSource, new RegExp(contract));
  }
  assert.match(pluginSource, /claim\.reward\?\.tier === 'quasi_immortal_emperor'/);
  assert.match(pluginSource, /INNATE_TREASURE_NAMES\.slice\(12\)/);
  assert.match(pluginSource, /transaction\.capture\(path\.join\(__PATH\.player_path/);
  assert.match(pluginSource, /transaction\.capture\(path\.join\(__PATH\.najie_path/);
  assert.match(pluginSource, /transaction\.capture\(path\.join\(__PATH\.equipment_path/);
  assert.match(pluginSource, /consumeInnateTreasureRecords/);
  assert.match(pluginSource, /restoreInnateTreasureRecords/);
  assert.match(pluginSource, /readInnateTreasureState\(\{ strict: true \}\)/);
  assert.match(pluginSource, /clearInnateTreasureAuthorityState/);
  assert.match(pluginSource, /innateRecordsConsumed/);
  assert.match(pluginSource, /resolveCustomForgeAuthorities/);
  assert.match(pluginSource, /彼岸大道铸炉记录/);
  assert.match(pluginSource, /if \(token && !matched\)/);
  assert.doesNotMatch(pluginSource, /transaction\.capture\(path\.join\(__PATH\.data_path/);
  assert.match(pluginSource, /delivered: true/);
  assert.match(pluginSource, /if \(!await Write_najie/);
  assert.match(pluginSource, /inventoryClaimId: `dao-forge:\$\{target\}`/);
  assert.match(innateTreasureSource, /writeJsonAtomically\(STATE_FILE, state\)/);
  assert.match(innateTreasureSource, /const strict = options === true \|\| options\?\.strict === true/);
});
