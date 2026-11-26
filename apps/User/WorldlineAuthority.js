import fs from 'node:fs';
import path from 'node:path';
import { hasSuiyunAuthority } from '../../model/suiyunAuthority.js';

import { plugin, verc } from '../../api/api.js';
import {
  __PATH,
  channel,
  existplayer,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
} from '../../model/xiuxian.js';
import {
  extractArchiveItem,
  listArchivePlayerIds,
  listBackupLineIds,
  mergeArchiveItem,
  readBackupEra,
  readPlayerArchiveInventory,
} from '../../model/backupSnapshot.js';
import {
  addCausalDebt,
  compareWorldlineAuthority,
  ensureWorldlineState,
  getTimelineWithdrawalAuthority,
  getWorldlineWithdrawalBlock,
  getWorldlineStatus,
  isShapeSpiritDestroyed,
  isTimelineWithdrawalClaimed,
  parseTimelineSelection,
  rebuildShapeSpirit,
  recordTimelineWithdrawals,
  reduceCausalDebtWithEraAccumulation,
  removeArtifactRankingEntries,
  resolveAncientHistoryStrike,
  selectWithdrawableLines,
  setShapeSpiritDestroyed,
  formatCausalImpactLines,
} from '../../model/worldlineAuthority.js';
import {
  getCausalImpactStatus,
  persistCausalImpact,
  retryPendingCausalCompensations,
} from '../../model/causalImpact.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import { computeJuelingErasure } from '../../model/juelingLoss.js';
import {
  ETERNAL_MAP_NAME,
  getAuthorityState,
  isInnateTreasureName,
  releaseInnateTreasure,
} from '../../model/innateTreasure.js';
import { Read_it, Writeit } from '../../model/duanzaofu.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const ITEM_CATEGORIES = new Set(['装备', '丹药', '道具', '功法', '草药', '材料', '盒子', '仙宠']);
const FACT_TYPES = new Set(['证道', '创道', '造化', '功法', '物品', '至宝']);
const TIMELINE_SELECTION_TTL_MS = 10 * 60 * 1000;
const pendingTimelineWithdrawals = new Map();

async function playerIdFromEvent(e) {
  return String(await channel(String(e.user_id).replace('qg_', '')));
}

async function mentionedPlayerId(e) {
  const at = (e.message || []).find(segment => segment?.type === 'at');
  return at ? String(await channel(String(at.qq).replace('qg_', ''))) : '';
}

function withPlayerPairLock(firstId, secondId, task) {
  const ids = [...new Set([String(firstId), String(secondId)])].sort();
  if (ids.length === 1) return withPlayerMutationLock(ids[0], task);
  return withPlayerMutationLock(ids[0], () => withPlayerMutationLock(ids[1], task));
}

function withdrawalSessionKey(e, actorId) {
  return `${actorId}:${e.group_id || 'private'}`;
}

function parseItemSpec(message, command) {
  const raw = String(message || '').replace(command, '').trim();
  if (/^(?:纳戒灵石|灵石)$/.test(raw)) return { category: raw, itemName: raw };
  const match = raw.match(/(装备|丹药|道具|功法|草药|材料|盒子|仙宠)\s*[*＊]\s*([^\r\n#]+)$/);
  if (!match) return null;
  const category = match[1];
  const itemName = match[2].trim();
  return ITEM_CATEGORIES.has(category) && itemName ? { category, itemName } : null;
}

function parseFactSpec(message) {
  const match = String(message || '').match(/(证道|创道|造化|功法|物品|至宝)\s*[*＊]\s*([^\r\n#]+)$/);
  if (!match) return null;
  const type = match[1];
  const name = match[2].trim();
  return FACT_TYPES.has(type) && name ? { type, name } : null;
}

function formatDuration(milliseconds) {
  const minutes = Math.max(1, Math.ceil(Number(milliseconds || 0) / 60_000));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return [hours ? `${hours}小时` : '', restMinutes ? `${restMinutes}分钟` : ''].filter(Boolean).join('');
}

function formatCausalDebtResult(result) {
  if (!result) return [];
  const lines = [result.costFree
    ? '祭道之上不沾因果，本次因果债为0。'
    : `因果债 +${result.delta}，当前${result.debt}（${result.tier.name}）。`];
  if (!result.backlash?.triggered) return lines;
  lines.push(
    `【时间长河·因果雷罚】因果债已超过200，连续降下${result.backlash.bolts}道雷劫。`,
    `每道雷劫造成血量上限120%的伤害：${result.backlash.damagePerBolt.toLocaleString()}点。`,
  );
  if (result.backlash.killed) {
    lines.push('你被因果雷罚击杀，道伤+2；12小时内不得再次支取时间线。');
  }
  return lines;
}

function eraseNamedItem(container, itemName, equipment = false) {
  let amount = 0;
  let changed = false;
  for (const [key, value] of Object.entries(container || {})) {
    if (Array.isArray(value)) {
      const kept = [];
      for (const item of value) {
        if (item?.name === itemName) {
          amount += Math.max(1, Number(item.数量) || 1);
          changed = true;
        } else kept.push(item);
      }
      if (changed) container[key] = kept;
    } else if (equipment && value?.name === itemName) {
      amount += Math.max(1, Number(value.数量) || 1);
      container[key] = null;
      changed = true;
    }
  }
  return { amount, changed };
}

async function eraseArtifactEverywhere(itemName) {
  const ids = new Set();
  for (const directory of [__PATH.najie_path, __PATH.equipment_path]) {
    if (!fs.existsSync(directory)) continue;
    for (const fileName of fs.readdirSync(directory)) {
      if (fileName.endsWith('.json')) ids.add(fileName.slice(0, -5));
    }
  }

  let amount = 0;
  let holders = 0;
  for (const id of ids) {
    await withPlayerMutationLock(id, async () => {
      let holderChanged = false;
      for (const [directory, equipment] of [
        [__PATH.najie_path, false],
        [__PATH.equipment_path, true],
      ]) {
        const filePath = path.join(directory, `${id}.json`);
        if (!fs.existsSync(filePath)) continue;
        let value;
        try {
          value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
          continue;
        }
        const erased = eraseNamedItem(value, itemName, equipment);
        if (!erased.changed) continue;
        amount += erased.amount;
        holderChanged = true;
        if (equipment) await Write_equipment(id, value);
        else await Write_najie(id, value);
      }
      if (holderChanged) holders += 1;
    });
  }

  let rankingEntries = 0;
  try {
    const ranking = await Read_it();
    const erased = removeArtifactRankingEntries(ranking, itemName);
    rankingEntries = erased.removed;
    if (rankingEntries) await Writeit(erased.items);
  } catch {
    // Missing legacy ranking data does not block erasing current inventories.
  }
  return { amount, holders, rankingEntries };
}

async function applyErasedFact(targetId, target, type, name) {
  const effect = { text: '该因果锚点已从现世松动。', removed: 0, holders: 0 };
  if (type === '功法') {
    const before = Array.isArray(target.学习的功法) ? target.学习的功法.length : 0;
    target.学习的功法 = (target.学习的功法 || []).filter(value => value !== name);
    if (target.功法 && typeof target.功法 === 'object') delete target.功法[name];
    effect.removed = before - target.学习的功法.length;
    effect.text = effect.removed ? `目标遗忘了【${name}】。` : `【${name}】的习得事实已被抹去。`;
  } else if (type === '创道') {
    if (target.自创修炼体系?.name === name) delete target.自创修炼体系;
    if (target.自身之道名称 === name) target.自身之道受损 = true;
    effect.text = `【${name}】的开创事实被改写，道果根基出现断层。`;
  } else if (type === '证道') {
    effect.text = '证道事实被击穿，现世境界随古史一同跌落。';
  } else if (type === '物品' || type === '至宝') {
    // Persist the ancient-history wound before equipment recalculation reloads the player.
    await Write_player(targetId, target);
    const erased = await eraseArtifactEverywhere(name);
    Object.assign(target, await Read_player(targetId));
    effect.removed = erased.amount;
    effect.holders = erased.holders;
    if (type === '至宝' && isInnateTreasureName(name)) releaseInnateTreasure(name, targetId);
    effect.text = erased.amount || erased.rankingEntries
      ? `【${name}】从${erased.holders}名持有者的现世存档中消失，共抹去${erased.amount}件；神兵榜同步熄灭${erased.rankingEntries}条记录。`
      : `【${name}】的获得事实已被抹去。`;
  } else if (type === '造化') {
    target.唯一性造化受损 = [...new Set([...(target.唯一性造化受损 || []), name])];
    effect.text = `【${name}】的获得事实被改写，唯一性权柄失去锚点。`;
  }
  return effect;
}

async function buildEternalFactRecord(targetId, target, type, name) {
  if (target.当前大道至宝 !== ETERNAL_MAP_NAME) return null;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const fieldsByType = {
    功法: ['学习的功法', '功法'],
    创道: ['自创修炼体系', '自身之道名称', '自身之道受损', '自身之道阶段', '自身之道境界'],
    证道: ['level_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', '境界称号'],
    造化: ['唯一性造化受损'],
  };
  const playerSnapshot = {};
  for (const field of fieldsByType[type] || []) {
    if (Object.prototype.hasOwnProperty.call(target, field)) playerSnapshot[field] = clone(target[field]);
  }
  const snapshot = { player: playerSnapshot, inventory: [], equipment: [] };
  if (type === '物品' || type === '至宝') {
    const [najie, equipment] = await Promise.all([Read_najie(targetId), Read_equipment(targetId)]);
    for (const [itemClass, entries] of Object.entries(najie)) {
      if (!Array.isArray(entries)) continue;
      for (const item of entries.filter(entry => entry?.name === name)) {
        snapshot.inventory.push({ itemClass, item: clone(item) });
      }
    }
    for (const [slot, item] of Object.entries(equipment)) {
      if (item?.name === name) snapshot.equipment.push({ slot, item: clone(item) });
    }
  }
  return {
    id: `E${Date.now().toString(36)}`,
    type,
    name,
    state: 'erased',
    erasedAt: Date.now(),
    snapshot,
    innateName: isInnateTreasureName(name) ? name : '',
  };
}

/**
 * 因果绝灵侵蚀：立即执行个人超长绝灵损失（11000~13000 年，星宇护身符与仙王豁免均无法抵挡）。
 * @param {string} qq 玩家 QQ
 * @param {{ years: number }} jueling 绝灵侵蚀参数
 * @returns {Promise<Array<{name, category, amount}>>} 损失的物品列表
 */
async function applyCausalJuelingErasure(qq, jueling) {
  const player = await Read_player(qq);
  const najie = await Read_najie(qq);
  const { items } = computeJuelingErasure(najie, jueling.years, { player });
  if (items.length > 0) await Write_najie(qq, najie);
  return items;
}

/** 因果绝灵侵蚀的回复文案行（无触发时返回空数组） */
function formatJuelingErasureLines(debt, items) {
  const jueling = debt?.backlash?.jueling;
  if (!jueling) return [];
  return [
    '【因果绝灵·侵蚀降临】',
    `时间长河雷劫惊动沉寂的绝灵——一场长达 ${jueling.years} 年的绝灵侵蚀将你吞没，星宇护身符与仙王豁免均无法抵挡！`,
    `纳戒损失：${items.length ? items.map(item => `${item.name}x${item.amount}`).join('、') : '无可侵蚀之物'}`,
  ];
}

function scanTimelineItems(actor, targetId, spec, lineIds, eraByLine = new Map()) {
  const hits = [];
  for (const lineId of lineIds) {
    if (isTimelineWithdrawalClaimed(actor, targetId, spec.category, spec.itemName, lineId)) continue;
    const snapshot = readPlayerArchiveInventory({
      backupRoot: __PATH.backup,
      lineId,
      dataPath: __PATH.data_path,
      playerId: targetId,
      playerDirectory: __PATH.player_path,
      najieDirectory: __PATH.najie_path,
    });
    const entry = extractArchiveItem(snapshot, spec.category, spec.itemName);
    if (entry) hits.push({
      targetId,
      lineId,
      entry,
      era: eraByLine.get(lineId) || { known: false, label: '古史时代不可考' },
      targetName: snapshot.player?.名号 || '',
    });
  }
  return hits;
}

function formatTimelineHit(hit, index, targetLabel = '') {
  return `${index + 1}. ${targetLabel ? `${targetLabel}｜` : ''}${hit.era.label}｜×${hit.entry.amount}`;
}

async function settleTimelineWithdrawal(actorId, actor, selected, spec) {
  const najie = await Read_najie(actorId);
  let total = 0;
  const grouped = new Map();
  for (const hit of selected) {
    mergeArchiveItem({ player: actor, najie }, hit.entry);
    total += hit.entry.amount;
    const lines = grouped.get(hit.targetId) || [];
    lines.push({ lineId: hit.lineId, amount: hit.entry.amount });
    grouped.set(hit.targetId, lines);
  }
  const debt = recordTimelineWithdrawals(actor, {
    playerId: actorId,
    category: spec.category,
    itemName: spec.itemName,
    claims: [...grouped].map(([targetId, lines]) => ({ targetId, lines })),
  });
  await Write_player(actorId, actor);
  await Write_najie(actorId, najie);
  const impact = await persistCausalImpact(actor, debt, { actorId: actorId });
  return { total, debt, impact };
}

export class WorldlineAuthority extends plugin {
  constructor() {
    super({
      name: '仙帝时间线权能',
      dsc: '古史打击、时间线支取与因果债',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#(?:时间线权能|古史状态|因果债)$', fnc: 'worldlineStatus' },
        { reg: '^#重试因果代偿$', fnc: 'retryCausalCompensation' },
        { reg: '^#确认支取时间线\\s*(?:全部|[\\d\\s,，、]+)$', fnc: 'confirmTimelineWithdrawal' },
        { reg: '^#取消支取时间线$', fnc: 'cancelTimelineWithdrawal' },
        { reg: '^#支取时间线(?:.|\n)+$', fnc: 'withdrawTimeline' },
        { reg: '^#(?:消减因果债|纪元消债)(?:\\s*[*＊]?\\s*\\d+)?$', fnc: 'reduceCausalDebt' },
        { reg: '^#古史打击(?:.|\n)+$', fnc: 'ancientHistoryStrike' },
        { reg: '^#重塑形神$', fnc: 'rebuildBodyAndSoul' },
      ],
    });
  }

  async worldlineStatus(e) {
    const userId = await playerIdFromEvent(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      await retryPendingCausalCompensations({ maxTasks: 8 });
      const status = getWorldlineStatus(player);
      const withdrawalBlock = getWorldlineWithdrawalBlock(player);
      const impactStatus = getCausalImpactStatus();
      const lineIds = listBackupLineIds(__PATH.backup);
      await Write_player(userId, player);
      const abilities = [];
      if (status.level >= 19) abilities.push('感知时间线扰动、法身护持过去');
      if (status.level >= 20) abilities.push('模糊感知命中数量、随机单线支取、改写低境古史');
      if (status.level >= 21) abilities.push('推演指定玩家的古史时代、自选时间线支取');
      if (status.level >= 22) abilities.push('指定玩家或遍观全体、自选诸世支取、打击仙帝古史锚点');
      const facts = status.facts.filter(fact => fact.state === 'anchored').slice(-6);
      return e.reply([
        `【${player.名号}·时间线权能】`,
        `等效权柄：${status.level}重天`,
        `历史存档：${lineIds.length}条｜已毁：${status.destroyedLines.length}条`,
        `因果债：${status.causalDebt}（${status.debtTier.name}）`,
        `因果惩罚：有效生命上限${status.punishment.effectiveMaxHp}｜道伤层数${status.punishment.woundStacks}｜支取税率${Math.round(status.punishment.withdrawalTaxRate * 100)}%${status.punishment.realmSuppression ? `｜道果压制${status.punishment.realmSuppression}层` : ''}`,
        `纪元消债：${status.debtReductionRate <= 0 ? '至少需要准仙帝级权柄' : Number.isFinite(status.debtReductionRate) ? `1点纪元积累消减${status.debtReductionRate}点因果债` : '祭道之上无因果代价'}`,
        withdrawalBlock.blocked ? `支取封禁：剩余${formatDuration(withdrawalBlock.remainingMs)}` : '支取封禁：无',
        `待处理众生代偿：${impactStatus.pendingCompensations.length}项${impactStatus.pendingCompensations.length ? `（${impactStatus.pendingCompensations.slice(0, 5).map(item => item.targetName || item.targetId).join('、')}）` : ''}`,
        `位面损伤累计：${impactStatus.planeDamage}｜大祭提前压力：${impactStatus.highlandSacrificeAdvance}年｜大祭状态：${impactStatus.sacrifice.plateauDestroyed ? '高原永灭' : impactStatus.sacrifice.phase}`,
        status.tierCrossings.length ? `最近阈值跨越：${status.tierCrossings.slice(-3).map(item => `${item.name}@${item.debt}`).join('、')}` : '最近阈值跨越：无',
        `现世状态：${status.noReturn ? '绝无复生' : status.shapeSpiritDestroyed ? '形神俱灭' : '道标稳固'}`,
        `权能：${abilities.join('；') || '尚未触及时光长河'}`,
        `关键事实：${facts.length ? facts.map(fact => `${fact.type}·${fact.name}`).join('、') : '尚未形成可见锚点'}`,
        `反噬预兆：${status.debtTier.effect}`,
      ].join('\n'));
    });
  }

  async retryCausalCompensation(e) {
    if (!verc({ e })) return false;
    const result = await retryPendingCausalCompensations({ maxTasks: 32 });
    return e.reply([
      '【因果代偿·持久队列重试】',
      `本轮处理${result.attempted}项，成功${result.applied.length + result.deduped.length}项，空间泡影跳过${result.skippedBubble.length}项，失败${result.failed.length}项。`,
      `队列剩余${result.pending}项。`,
      result.failed.length ? `待下次重试：${result.failed.map(item => item.name || item.id).join('、')}` : '当前没有失败代偿。',
    ].join('\n'));
  }

  async withdrawTimeline(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    const mentionedId = await mentionedPlayerId(e);
    const spec = parseItemSpec(e.msg, '#支取时间线');
    if (!spec) return e.reply('格式：#支取时间线 [@玩家/全体] 道具*物品名');
    if (!(await existplayer(actorId))) return e.reply('玩家存档不存在。');

    const itemMarker = String(e.msg || '').search(/(?:纳戒灵石|灵石|装备|丹药|道具|功法|草药|材料|盒子|仙宠)/);
    const scopeText = itemMarker >= 0 ? String(e.msg).slice(0, itemMarker) : '';
    const globalRequested = scopeText.includes('全体');
    if (globalRequested && mentionedId) return e.reply('指定玩家与全体玩家只能选择一种支取范围。');

    const lockTargetId = mentionedId || actorId;
    return withPlayerPairLock(actorId, lockTargetId, async () => {
      const actor = await Read_player(actorId);
      const withdrawalBlock = getWorldlineWithdrawalBlock(actor);
      if (withdrawalBlock.blocked) {
        return e.reply(`你被时间长河雷劫击杀后的因果封禁尚未消散，${formatDuration(withdrawalBlock.remainingMs)}内不得再次支取时间线。`);
      }
      const authority = getTimelineWithdrawalAuthority(actor);
      if (authority.mode === 'none') return e.reply('至少达到准仙帝级权柄，方可从备份存档中支取实物。');
      if (globalRequested && authority.mode !== 'scope_select') {
        return e.reply('遍观全体玩家的所有时间线需要祭道级权柄。');
      }

      const lineIds = listBackupLineIds(__PATH.backup);
      const archivePlayerIds = listArchivePlayerIds({
        backupRoot: __PATH.backup,
        lineIds,
        dataPath: __PATH.data_path,
        playerDirectory: __PATH.player_path,
        najieDirectory: __PATH.najie_path,
      });
      const globalScope = authority.mode === 'scope_select' && globalRequested;
      const targetId = mentionedId || actorId;
      if (!globalScope && !(await existplayer(targetId)) && !archivePlayerIds.includes(targetId)) {
        return e.reply('目标玩家在现世与历史存档中均不存在。');
      }

      if (!globalScope && targetId !== actorId && await existplayer(targetId)) {
        const target = await Read_player(targetId);
        if (hasSuiyunAuthority(target, '无上')) return e.reply('【无上】目标时间线隐于天阙，神念未曾窥见其古史。');
        const comparison = compareWorldlineAuthority(actor, target);
        if (!comparison.ok) {
          const debt = addCausalDebt(actor, comparison.reason === 'same_level' ? 45 : 80, '强行支取受护持的时间线');
          // 因果绝灵侵蚀：多次雷劫后大概率同时引来超长绝灵（护身符/仙王豁免均无效）
          const juelingItems = debt.backlash?.jueling
            ? await applyCausalJuelingErasure(actorId, debt.backlash.jueling)
            : [];
          if (comparison.reason === 'higher_target' && comparison.targetLevel >= 21) {
            setShapeSpiritDestroyed(actor, '支取路尽级过去时遭本体抹杀');
          }
          await Write_player(actorId, actor);
          const impact = await persistCausalImpact(actor, debt, { actorId: actorId });
          return e.reply([
            comparison.reason === 'same_level'
            ? '同级本体循因果降临，支取中止；若要强取，只能先与其当世本体分出胜负。'
            : '目标的高境本体护持过去，你的时间线法身已被当场抹灭。',
            ...formatCausalDebtResult(debt),
            ...formatCausalImpactLines(impact),
            ...formatJuelingErasureLines(debt, juelingItems),
          ].filter(Boolean).join('\n'));
        }
      }

      const targetIds = globalScope ? archivePlayerIds : [targetId];
      const labels = new Map([[actorId, actor.名号 || actorId]]);
      const eraByLine = new Map(lineIds.map(lineId => [lineId, readBackupEra({
        backupRoot: __PATH.backup,
        lineId,
      })]));
      const protectedTargets = [];
      const hits = [];
      for (const currentTargetId of targetIds) {
        if (globalScope && currentTargetId !== actorId && await existplayer(currentTargetId)) {
          const currentTarget = await Read_player(currentTargetId);
          labels.set(currentTargetId, currentTarget.名号 || currentTargetId);
          const comparison = compareWorldlineAuthority(actor, currentTarget);
          if (!comparison.ok) {
            protectedTargets.push(`${currentTarget.名号 || currentTargetId}(${currentTargetId})`);
            continue;
          }
        } else if (!labels.has(currentTargetId) && await existplayer(currentTargetId)) {
          const currentTarget = await Read_player(currentTargetId);
          labels.set(currentTargetId, currentTarget.名号 || currentTargetId);
        }
        const targetHits = scanTimelineItems(actor, currentTargetId, spec, lineIds, eraByLine);
        if (!labels.has(currentTargetId) && targetHits[0]?.targetName) {
          labels.set(currentTargetId, targetHits[0].targetName);
        }
        hits.push(...targetHits);
      }
      if (!hits.length) {
        return e.reply(globalScope
          ? `祭道神念遍观${targetIds.length}名玩家的所有时间线，没有发现尚可支取的【${spec.itemName}】${protectedTargets.length ? `；另有${protectedTargets.length}名同级或高境玩家受道果护持` : ''}。`
          : authority.mode === 'random_one'
            ? `准仙帝法身模糊感知：目标可能存在0条尚可支取【${spec.itemName}】的时间线。`
            : `目标所有可见时间线中没有尚可支取的【${spec.itemName}】。`);
      }

      if (authority.mode === 'random_one') {
        const selectedLineIds = new Set(selectWithdrawableLines(
          actor,
          hits.map(hit => hit.lineId),
          targetId,
          spec.category,
          spec.itemName,
        ));
        const selected = hits.filter(hit => selectedLineIds.has(hit.lineId));
        const { total, debt, impact } = await settleTimelineWithdrawal(actorId, actor, selected, spec);
        return e.reply([
          '【时间线支取·既定化虚】',
          `准仙帝法身朦胧感知：${labels.get(targetId) || targetId}可能有${hits.length}条时间线存在【${spec.itemName}】。`,
          `无法辨清具体古史，只得随机支取其中一条，获得×${total}。`,
          ...formatCausalDebtResult(debt),
          ...formatCausalImpactLines(impact),
          debt.tier.level >= 2 ? `因果已开始牵连：${actor.因果牵连?.related?.join('、') || '宗门与身边之人'}。` : '',
        ].filter(Boolean).join('\n'));
      }

      const sessionKey = withdrawalSessionKey(e, actorId);
      const session = {
        createdAt: Date.now(),
        spec,
        hits,
      };
      pendingTimelineWithdrawals.set(sessionKey, session);
      const expiryTimer = setTimeout(() => {
        if (pendingTimelineWithdrawals.get(sessionKey) === session) {
          pendingTimelineWithdrawals.delete(sessionKey);
        }
      }, TIMELINE_SELECTION_TTL_MS);
      expiryTimer.unref?.();

      const detailLines = hits.map((hit, index) => formatTimelineHit(
        hit,
        index,
        globalScope ? `${labels.get(hit.targetId) || hit.targetId}(${hit.targetId})` : '',
      ));
      for (let index = 0; index < detailLines.length; index += 25) {
        await e.reply([
          `【${globalScope ? '祭道·诸世映照' : '仙帝·古史推演'} ${Math.floor(index / 25) + 1}/${Math.ceil(detailLines.length / 25)}】`,
          ...detailLines.slice(index, index + 25),
        ].join('\n'));
      }
      return e.reply([
        `共推演出${hits.length}条持有【${spec.itemName}】的时间线，本次尚未支取。`,
        protectedTargets.length ? `同级或高境道果护持而跳过：${protectedTargets.join('、')}` : '',
        '发送 #确认支取时间线 1,3 选择若干条，或发送 #确认支取时间线 全部。',
        '候选古史十分钟后消散；可发送 #取消支取时间线。',
      ].filter(Boolean).join('\n'));
    });
  }

  async confirmTimelineWithdrawal(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    const sessionKey = withdrawalSessionKey(e, actorId);
    const pending = pendingTimelineWithdrawals.get(sessionKey);
    if (!pending) return e.reply('当前没有等待确认的时间线支取，请先推演目标物品。');
    if (!(await existplayer(actorId))) {
      pendingTimelineWithdrawals.delete(sessionKey);
      return e.reply('玩家存档不存在。');
    }
    if (Date.now() - pending.createdAt > TIMELINE_SELECTION_TTL_MS) {
      pendingTimelineWithdrawals.delete(sessionKey);
      return e.reply('候选古史已经消散，请重新发送支取时间线指令推演。');
    }
    const selectionText = String(e.msg || '').replace('#确认支取时间线', '').trim();
    const indexes = parseTimelineSelection(selectionText, pending.hits.length);
    if (!indexes.length) return e.reply(`请选择1-${pending.hits.length}之间的编号，多个编号用逗号分隔，或填写“全部”。`);

    return withPlayerMutationLock(actorId, async () => {
      const actor = await Read_player(actorId);
      const authority = getTimelineWithdrawalAuthority(actor);
      if (authority.level < 21) {
        pendingTimelineWithdrawals.delete(sessionKey);
        return e.reply('当前权柄已经不足以辨认并选择古史，请重新推演。');
      }
      const withdrawalBlock = getWorldlineWithdrawalBlock(actor);
      if (withdrawalBlock.blocked) {
        return e.reply(`因果封禁尚未消散，${formatDuration(withdrawalBlock.remainingMs)}内不得支取时间线。`);
      }

      const selected = indexes.map(index => pending.hits[index]);
      for (const targetId of new Set(selected.map(hit => hit.targetId))) {
        if (targetId === actorId || !(await existplayer(targetId))) continue;
        const target = await Read_player(targetId);
        if (!compareWorldlineAuthority(actor, target).ok) {
          pendingTimelineWithdrawals.delete(sessionKey);
          return e.reply(`${target.名号 || targetId}的当世道果已经发生变化，本次候选古史失效，请重新推演。`);
        }
      }
      if (selected.some(hit => isTimelineWithdrawalClaimed(
        actor,
        hit.targetId,
        pending.spec.category,
        pending.spec.itemName,
        hit.lineId,
      ))) {
        pendingTimelineWithdrawals.delete(sessionKey);
        return e.reply('部分候选时间线已经被支取，本次清单失效，请重新推演。');
      }

      const { total, debt, impact } = await settleTimelineWithdrawal(actorId, actor, selected, pending.spec);
      pendingTimelineWithdrawals.delete(sessionKey);
      return e.reply([
        '【时间线支取·既定化虚】',
        `已支取${selected.length}条古史时间线，获得【${pending.spec.itemName}】×${total}。`,
        `逐线因果债已叠加结算。`,
        ...formatCausalDebtResult(debt),
        ...formatCausalImpactLines(impact),
        debt.tier.level >= 2 ? `因果已开始牵连：${actor.因果牵连?.related?.join('、') || '宗门与身边之人'}。` : '',
      ].filter(Boolean).join('\n'));
    });
  }

  async cancelTimelineWithdrawal(e) {
    const actorId = await playerIdFromEvent(e);
    const removed = pendingTimelineWithdrawals.delete(withdrawalSessionKey(e, actorId));
    return e.reply(removed ? '候选古史已经散去，本次支取取消。' : '当前没有等待确认的时间线支取。');
  }

  async reduceCausalDebt(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    if (!(await existplayer(actorId))) return e.reply('玩家不存在，请先创建角色。');
    const match = String(e.msg || '').match(/(\d+)/);
    const requested = match ? Number(match[1]) : 1;

    return withPlayerMutationLock(actorId, async () => {
      const player = await Read_player(actorId);
      const result = reduceCausalDebtWithEraAccumulation(player, requested);
      if (!result.ok) {
        if (result.reason === 'authority') return e.reply('秘境、仙古或花粉路任一体系至少达到准仙帝，方可消减因果债。');
        if (result.reason === 'no_debt') return e.reply('当前没有因果债需要消减。');
        return e.reply(`纪元积累不足，当前剩余${result.available || 0}点。`);
      }
      await Write_player(actorId, player);
      return e.reply([
        '【纪元积累·洗去因果】',
        result.costFree
          ? `祭道之上超脱因果，本次不消耗纪元积累，消去${result.reduced}点旧债。`
          : `消耗${result.spent}点纪元积累，按1:${result.rate}消去${result.reduced}点因果债。`,
        `剩余因果债：${result.debt}（${result.tier.name}）`,
        `剩余纪元积累：${player.纪元积累 || 0}`,
      ].join('\n'));
    });
  }

  async ancientHistoryStrike(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    const targetId = await mentionedPlayerId(e);
    const spec = parseFactSpec(e.msg);
    if (!targetId || !spec) return e.reply('格式：#古史打击 @玩家 物品*名称（类型可选证道、创道、造化、功法、物品、至宝）');
    if (targetId === actorId) return e.reply('自身古史与你当世道果重叠，无法以此法自斩。');
    if (!(await existplayer(actorId)) || !(await existplayer(targetId))) return e.reply('目标玩家存档不存在。');

    return withPlayerPairLock(actorId, targetId, async () => {
      const actor = await Read_player(actorId);
      const target = await Read_player(targetId);
      if (hasSuiyunAuthority(target, '无上')) return e.reply('【无上】目标时间线隐于天阙之外，本次古史打击消散。');
      if (getRealmAuthorityLevel(actor) < 20) {
        return e.reply('古史打击要求秘境、仙古或花粉路任一体系至少达到准仙帝。');
      }
      const lineIds = listBackupLineIds(__PATH.backup);
      const eternalRecord = await buildEternalFactRecord(targetId, target, spec.type, spec.name);
      const targetState = ensureWorldlineState(target);
      const lineId = lineIds.find(id => !targetState.destroyedLines.includes(id)) || `现世前影:${Date.now()}`;
      const result = resolveAncientHistoryStrike(actor, target, {
        ...spec,
        lineId,
        availableLineIds: lineIds,
        currentEternalSilence: target.永寂状态 === '永寂' || target.永寂状态 === '绝无复生',
      });
      if (!result.ok) {
        await Write_player(actorId, actor);
        if (result.outcome === 'obliterated') {
          const actorNajie = await Read_najie(actorId);
          actorNajie.时间线封锁 = actor.纳戒封锁;
          await Write_najie(actorId, actorNajie);
          const impact = await persistCausalImpact(actor, result.debt, { actorId: actorId });
          return e.reply([
            '路尽级力量沿因果反斩，你的法身、真身与神魂一并被抹灭。',
            ...formatCausalDebtResult(result.debt),
            ...formatCausalImpactLines(impact),
          ].join('\n'));
        }
        const impact = await persistCausalImpact(actor, result.debt, { actorId: actorId });
        return e.reply([
          result.outcome === 'body_clash'
            ? '目标当世本体循古史波动降临，双方权柄同级，本次改写转化为本体对峙。'
            : '目标境界压过施术者，过去法身自行显化并挡下了古史打击。',
          ...formatCausalDebtResult(result.debt),
          ...formatCausalImpactLines(impact),
        ].join('\n'));
      }

      let effect = { text: '该时间线已经从古史中熄灭。' };
      if (result.outcome === 'fact_erased') effect = await applyErasedFact(targetId, target, spec.type, spec.name);
      if (result.outcome === 'fact_erased' && eternalRecord) {
        const authority = getAuthorityState(target);
        authority.永恒改命记录 = [
          ...(Array.isArray(authority.永恒改命记录) ? authority.永恒改命记录 : []),
          eternalRecord,
        ].slice(-10);
      }
      await Write_player(actorId, actor);
      await Write_player(targetId, target);
      const impact = await persistCausalImpact(actor, result.debt, { actorId: actorId });
      return e.reply([
        '【古史打击·既定事实改写】',
        `目标：${target.名号}｜锚点：${spec.type}·${spec.name}`,
        `结果：${result.outcome === 'line_only' ? '仅打灭一条过去时间线，仙帝真身不受影响。' : effect.text}`,
        result.line?.presentEffect === 'quasi_emperor_flaw' ? '准仙帝现世道果受到牵连，新增一道古史创伤。' : '',
        result.line?.allLinesDestroyed ? '目标的所有可见时间线均已熄灭；若当世再陷永寂，将绝无复生可能。' : '',
        ...formatCausalDebtResult(result.debt),
        ...formatCausalImpactLines(impact),
      ].filter(Boolean).join('\n'));
    });
  }

  async rebuildBodyAndSoul(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    const targetId = await mentionedPlayerId(e);
    if (!targetId) return e.reply('请@需要重塑肉身、修补神魂的玩家。');
    if (!(await existplayer(actorId)) || !(await existplayer(targetId))) return e.reply('目标玩家存档不存在。');

    return withPlayerPairLock(actorId, targetId, async () => {
      const actor = await Read_player(actorId);
      const target = await Read_player(targetId);
      if (getRealmAuthorityLevel(actor) < 21) return e.reply('重塑形神至少需要仙帝级权柄。');
      if (ensureWorldlineState(target).noReturn || target.练气存档状态 === '永久不可用') {
        return e.reply('目标所有时间线均已熄灭，且当世道标永寂，重塑法已失去落点。');
      }
      if (!isShapeSpiritDestroyed(target)) return e.reply('目标形神尚在，无需重塑。');

      const rebuilt = rebuildShapeSpirit(target, actor.名号);
      const debt = addCausalDebt(actor, 120, `为${target.名号}逆转形神俱灭`);
      // 因果绝灵侵蚀：多次雷劫后大概率同时引来超长绝灵（护身符/仙王豁免均无效）
      const juelingItems = debt.backlash?.jueling
        ? await applyCausalJuelingErasure(actorId, debt.backlash.jueling)
        : [];
      const najie = await Read_najie(targetId);
      delete najie.时间线封锁;
      await Write_player(actorId, actor);
      await Write_player(targetId, target);
      await Write_najie(targetId, najie, { allowWorldlineUnlock: true });
      const impact = await persistCausalImpact(actor, debt, { actorId: actorId });
      return e.reply([
        '【映照诸天·重塑形神】',
        `${actor.名号}以路尽之光重聚${target.名号}的肉身与神魂。`,
        `目标恢复至${rebuilt.currentHp}点生命，练气存档与纳戒重新可用。`,
        ...formatCausalDebtResult(debt),
        ...formatCausalImpactLines(impact),
        ...formatJuelingErasureLines(debt, juelingItems),
      ].filter(Boolean).join('\n'));
    });
  }
}
