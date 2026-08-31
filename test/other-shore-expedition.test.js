import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_SHORE_CAMPAIGNS,
  OTHER_SHORE_CAMPAIGN_CHAIN,
  OTHER_SHORE_EXPEDITION_STAR_ID,
  OTHER_SHORE_QIN_FERRY_STAR_ID,
  OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID,
  advanceOtherShoreExpedition,
  applyOtherShoreCampaignBossBattle,
  claimOtherShoreExpeditionSettlement,
  contributeOtherShoreCamp,
  depositOtherShoreExpeditionLoot,
  evacuateOtherShoreExpedition,
  forceEvacuateOtherShoreExpedition,
  getOtherShoreExpeditionRun,
  markOtherShoreExpeditionDowned,
  recoverOtherShoreLostCache,
  rescueOtherShoreExpedition,
  serializeOtherShoreExpedition,
  startOtherShoreExpedition,
} from '../model/otherShoreExpedition.js';
import { createOtherShoreWorld } from '../model/otherShoreWorld.js';

function createWorld(seed) {
  const world = createOtherShoreWorld(seed);
  world.states[OTHER_SHORE_EXPEDITION_STAR_ID].phase = 'visited';
  return world;
}

function start(world, playerId, now = 1, starId = OTHER_SHORE_EXPEDITION_STAR_ID) {
  return startOtherShoreExpedition(world, {
    starId,
    playerId,
    playerName: playerId,
    runId: `${playerId}-run-${now}`,
    operationId: `${playerId}-start-${now}`,
    now,
  }).run;
}

function reachBoss(world, run, now = 10) {
  OTHER_SHORE_CAMPAIGNS[run.starId].stages.slice(0, -1).forEach((stage, index) => advanceOtherShoreExpedition(world, {
    playerId: run.playerId,
    runId: run.runId,
    stageId: stage.id,
    operationId: `${run.runId}-${stage.id}`,
    now: now + index,
  }));
}

test('救援恢复濒危前状态且不回复血量', () => {
  for (const resumeStatus of ['active', 'waiting_boss', 'ready_to_evac']) {
    const world = createWorld(`rescue-${resumeStatus}`);
    const target = start(world, 'target');
    const rescuer = start(world, 'rescuer', 2);
    if (resumeStatus !== 'active') reachBoss(world, target);
    if (resumeStatus === 'ready_to_evac') {
      applyOtherShoreCampaignBossBattle(world, {
        playerId: target.playerId,
        runId: target.runId,
        damage: Number.MAX_SAFE_INTEGER,
        operationId: 'boss-clear',
        now: 20,
      });
    }

    markOtherShoreExpeditionDowned(world, {
      playerId: target.playerId,
      runId: target.runId,
      operationId: 'target-downed',
      now: 30,
    });
    const rescued = rescueOtherShoreExpedition(world, {
      playerId: rescuer.playerId,
      runId: rescuer.runId,
      targetPlayerId: target.playerId,
      targetRunId: target.runId,
      operationId: 'target-rescued',
      now: 31,
    });

    assert.equal(rescued.status, resumeStatus);
    assert.equal(rescued.healed, false);
    assert.equal(getOtherShoreExpeditionRun(world, { playerId: target.playerId }).status, resumeStatus);
  }
});

test('首通者可开启追回专用远征，追回后可存放并以任一方式撤离结算', () => {
  const world = createWorld('lost-cache-recovery');
  contributeOtherShoreCamp(world, {
    starId: OTHER_SHORE_EXPEDITION_STAR_ID,
    playerId: 'builder',
    amount: 10,
    operationId: 'build-camp',
  });
  const firstRun = start(world, 'owner');
  reachBoss(world, firstRun);
  applyOtherShoreCampaignBossBattle(world, {
    playerId: firstRun.playerId,
    runId: firstRun.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'first-clear',
    now: 20,
  });
  const forced = forceEvacuateOtherShoreExpedition(world, {
    playerId: firstRun.playerId,
    runId: firstRun.runId,
    claimId: 'first-settlement',
    now: 21,
  });
  const cacheId = forced.settlement.lostCacheId;
  assert.ok(cacheId);
  claimOtherShoreExpeditionSettlement(world, { playerId: 'owner', claimId: 'first-settlement', now: 22 });

  const recoveryRun = start(world, 'owner', 23);
  assert.equal(recoveryRun.mode, 'recovery');
  assert.equal(recoveryRun.stageIndex, 5);
  assert.equal(serializeOtherShoreExpedition(world, { viewerId: 'owner' }).viewer.run.mode, 'recovery');
  assert.throws(() => advanceOtherShoreExpedition(world, {
    playerId: 'owner',
    runId: recoveryRun.runId,
    operationId: 'illegal-campaign-advance',
  }), /追回专用远征不可推进/);

  recoverOtherShoreLostCache(world, {
    playerId: 'owner',
    runId: recoveryRun.runId,
    cacheId,
    operationId: 'recover-cache',
    now: 24,
  });
  const deposited = depositOtherShoreExpeditionLoot(world, {
    playerId: 'owner',
    runId: recoveryRun.runId,
    operationId: 'deposit-cache',
    now: 25,
  });
  assert.equal(deposited.carriedUnits, 0);
  assert.equal(deposited.stored.find(item => item.name === '纪元之力')?.quantity, 1);

  for (const [mode, evacuate] of [
    ['normal', evacuateOtherShoreExpedition],
    ['forced', forceEvacuateOtherShoreExpedition],
  ]) {
    const branch = structuredClone(world);
    const result = evacuate(branch, {
      playerId: 'owner',
      runId: recoveryRun.runId,
      claimId: `${mode}-recovery-settlement`,
      now: 26,
    });
    const claimed = claimOtherShoreExpeditionSettlement(branch, {
      playerId: 'owner',
      claimId: result.settlement.claimId,
      now: 27,
    });
    assert.equal(claimed.items.find(item => item.name === '纪元之力')?.quantity, 1);
  }
});

test('三场关键星战役形成玄阙、先秦归航与裂界母锚首通链', () => {
  assert.deepEqual(OTHER_SHORE_CAMPAIGN_CHAIN, [
    OTHER_SHORE_EXPEDITION_STAR_ID,
    OTHER_SHORE_QIN_FERRY_STAR_ID,
    OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID,
  ]);
  const campaigns = OTHER_SHORE_CAMPAIGN_CHAIN.map(starId => OTHER_SHORE_CAMPAIGNS[starId]);
  assert.deepEqual(campaigns.map(campaign => campaign.name), ['玄阙神炉', '先秦归航', '母锚归一']);
  assert.equal(new Set(campaigns.map(campaign => campaign.campaignId)).size, campaigns.length);
  assert.equal(new Set(campaigns.map(campaign => campaign.boss.bossId)).size, campaigns.length);
  assert.deepEqual(campaigns.map(campaign => campaign.prerequisiteStarId), [
    null,
    OTHER_SHORE_EXPEDITION_STAR_ID,
    OTHER_SHORE_QIN_FERRY_STAR_ID,
  ]);
  for (const campaign of campaigns) {
    assert.equal(campaign.stages.length, 5);
    assert.equal(campaign.stages.at(-1).kind, 'boss');
    assert.ok(campaign.boss.maxHp > 0);
    assert.equal(campaign.firstClearLoot.kind, 'key');
  }
  assert.match(campaigns[1].stages.map(stage => stage.name).join('、'), /先秦.*灵界裂隙.*彼岸渡碑/);
  assert.match(campaigns[2].stages.map(stage => stage.name).join('、'), /裂隙源谱.*母锚.*先秦道场/);
});

test('共享首领一次击破会幂等完成全部待战修士的个人首通', () => {
  const world = createWorld('shared-campaign-boss');
  const first = start(world, 'first', 1);
  const second = start(world, 'second', 2);
  const downed = start(world, 'downed', 3);
  reachBoss(world, first, 10);
  reachBoss(world, second, 20);
  reachBoss(world, downed, 24);
  markOtherShoreExpeditionDowned(world, {
    playerId: downed.playerId,
    runId: downed.runId,
    operationId: 'downed-before-shared-clear',
    now: 29,
  });

  const options = {
    playerId: first.playerId,
    runId: first.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'shared-boss-clear',
    now: 30,
  };
  const defeated = applyOtherShoreCampaignBossBattle(world, options);
  const replay = applyOtherShoreCampaignBossBattle(world, options);

  assert.deepEqual(replay, defeated);
  assert.deepEqual(new Set(defeated.completedPlayerIds), new Set(['first', 'second', 'downed']));
  assert.equal(getOtherShoreExpeditionRun(world, { playerId: 'first' }).status, 'ready_to_evac');
  assert.equal(getOtherShoreExpeditionRun(world, { playerId: 'second' }).status, 'ready_to_evac');
  assert.equal(getOtherShoreExpeditionRun(world, { playerId: 'downed' }).status, 'downed');
  const rescued = rescueOtherShoreExpedition(world, {
    playerId: second.playerId,
    runId: second.runId,
    targetPlayerId: downed.playerId,
    targetRunId: downed.runId,
    operationId: 'rescue-after-shared-clear',
    now: 31,
  });
  assert.equal(rescued.status, 'ready_to_evac');
  assert.equal(rescued.healed, false);
  const state = world.expedition.campaigns[OTHER_SHORE_EXPEDITION_STAR_ID];
  assert.equal(state.clearCount, 1);
  assert.equal(state.stageClears.at(-1), 1);
  assert.equal(state.participants.first.clears, 1);
  assert.equal(state.participants.second.clears, 1);
  assert.equal(state.participants.downed.clears, 1);
  assert.equal(world.states[OTHER_SHORE_EXPEDITION_STAR_ID].phase, 'cleared');

  forceEvacuateOtherShoreExpedition(world, {
    playerId: 'first',
    runId: first.runId,
    claimId: 'shared-first-settlement',
    now: 31,
  });
  const late = start(world, 'late', 32);
  reachBoss(world, late, 40);
  assert.equal(getOtherShoreExpeditionRun(world, { playerId: 'late' }).status, 'ready_to_evac');
  assert.equal(state.clearCount, 1);
  assert.equal(state.stageClears.at(-1), 1);
  assert.equal(state.participants.late.clears, 1);
});

test('后续关键星只认个人前置首通并沿链发放各自剧情凭证', () => {
  const world = createWorld('campaign-prerequisite-chain');
  world.states[OTHER_SHORE_QIN_FERRY_STAR_ID].phase = 'visited';
  world.states[OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID].phase = 'visited';

  assert.throws(() => start(world, 'owner', 1, OTHER_SHORE_QIN_FERRY_STAR_ID), /玄阙神炉.*个人首通/);

  const furnace = start(world, 'owner', 2);
  reachBoss(world, furnace, 10);
  applyOtherShoreCampaignBossBattle(world, {
    playerId: 'owner',
    runId: furnace.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'chain-furnace-clear',
    now: 20,
  });
  forceEvacuateOtherShoreExpedition(world, {
    playerId: 'owner',
    runId: furnace.runId,
    claimId: 'chain-furnace-settlement',
    now: 21,
  });

  assert.throws(
    () => start(world, 'outsider', 22, OTHER_SHORE_QIN_FERRY_STAR_ID),
    /玄阙神炉.*个人首通/,
  );
  const ferry = start(world, 'owner', 23, OTHER_SHORE_QIN_FERRY_STAR_ID);
  reachBoss(world, ferry, 30);
  assert.throws(() => applyOtherShoreCampaignBossBattle(world, {
    starId: OTHER_SHORE_QIN_FERRY_STAR_ID,
    playerId: 'owner',
    runId: ferry.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'chain-furnace-clear',
    now: 39,
  }), /operationId 已用于其他彼岸远征行动/);
  applyOtherShoreCampaignBossBattle(world, {
    starId: OTHER_SHORE_QIN_FERRY_STAR_ID,
    playerId: 'owner',
    runId: ferry.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'chain-ferry-clear',
    now: 40,
  });
  assert.equal(
    getOtherShoreExpeditionRun(world, { playerId: 'owner' }).bag.carried
      .find(item => item.name === '先秦归航碑拓')?.quantity,
    1,
  );
  forceEvacuateOtherShoreExpedition(world, {
    playerId: 'owner',
    runId: ferry.runId,
    claimId: 'chain-ferry-settlement',
    now: 41,
  });

  const anchor = start(world, 'owner', 42, OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID);
  reachBoss(world, anchor, 50);
  applyOtherShoreCampaignBossBattle(world, {
    starId: OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID,
    playerId: 'owner',
    runId: anchor.runId,
    damage: Number.MAX_SAFE_INTEGER,
    operationId: 'chain-anchor-clear',
    now: 60,
  });

  const view = serializeOtherShoreExpedition(world, {
    starId: OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID,
    viewerId: 'owner',
  });
  assert.equal(view.campaign.name, '母锚归一');
  assert.equal(view.campaign.prerequisite.name, '先秦归航');
  assert.equal(view.campaign.firstClearLoot.name, '裂界母锚坐标核');
  assert.deepEqual(view.campaignChain.map(entry => entry.viewerCleared), [true, true, true]);
  assert.deepEqual(view.campaignChain.map(entry => entry.globalCleared), [true, true, true]);
  assert.deepEqual(view.campaignChain.map(entry => entry.unlocked), [true, true, true]);
});

test('旧版玄阙世界文档会补齐新战役目录且保留既有首通', () => {
  const world = createWorld('campaign-state-migration');
  world.expedition = {
    version: 1,
    campaigns: {
      [OTHER_SHORE_EXPEDITION_STAR_ID]: {
        campaignId: 'xuanque-divine-furnace',
        starId: OTHER_SHORE_EXPEDITION_STAR_ID,
        status: 'completed',
        stageClears: [2, 2, 2, 2, 1],
        clearCount: 1,
        participants: { old: { playerName: 'old', starts: 1, clears: 1, highestStage: 5 } },
        completions: { oldRun: { playerId: 'old', at: 1 } },
        boss: {
          bossId: 'xuanque-calamity-core',
          name: '玄阙灾核',
          maxHp: 600_000_000_000_000,
          currentHp: 0,
          status: 'defeated',
          contributions: {},
        },
      },
    },
  };

  const view = serializeOtherShoreExpedition(world, {
    starId: OTHER_SHORE_QIN_FERRY_STAR_ID,
    viewerId: 'old',
  });
  assert.equal(world.expedition.version, 2);
  assert.equal(Object.keys(world.expedition.campaigns).length, 3);
  assert.equal(world.expedition.campaigns[OTHER_SHORE_EXPEDITION_STAR_ID].participants.old.clears, 1);
  assert.equal(view.campaign.name, '先秦归航');
  assert.equal(view.campaign.unlocked, true);
  assert.equal(world.states[OTHER_SHORE_EXPEDITION_STAR_ID].phase, 'cleared');
  assert.deepEqual(view.campaign.stages.map(stage => stage.clearCount), [0, 0, 0, 0, 0]);
});
