import fs from 'node:fs';
import path from 'node:path';

import { plugin, verc } from '../../api/api.js';
import {
  __PATH,
  channel,
  existplayer,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
} from '../../model/xiuxian.js';
import {
  extractArchiveItem,
  listBackupLineIds,
  mergeArchiveItem,
  readPlayerArchiveInventory,
} from '../../model/backupSnapshot.js';
import {
  addCausalDebt,
  compareWorldlineAuthority,
  ensureWorldlineState,
  getWorldlineWithdrawalBlock,
  getWithdrawalLimit,
  getWorldlineStatus,
  isShapeSpiritDestroyed,
  isTimelineWithdrawalClaimed,
  rebuildShapeSpirit,
  recordTimelineWithdrawal,
  reduceCausalDebtWithEraAccumulation,
  removeArtifactRankingEntries,
  resolveAncientHistoryStrike,
  setShapeSpiritDestroyed,
} from '../../model/worldlineAuthority.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import { isInnateTreasureName, releaseInnateTreasure } from '../../model/innateTreasure.js';
import { Read_it, Writeit } from '../../model/duanzaofu.js';
import { writeJsonAtomically } from '../../utils/atomicJson.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const CAUSAL_STATE_FILE = path.join(__PATH.data_path, 'worldline_causal_state.json');
const ITEM_CATEGORIES = new Set(['装备', '丹药', '道具', '功法', '草药', '材料', '盒子', '仙宠']);
const FACT_TYPES = new Set(['证道', '创道', '造化', '功法', '物品', '至宝']);

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

async function persistCausalImpact(actor, debtResult) {
  if (!debtResult?.delta) return;
  await withPlayerMutationLock('worldline:causal-impact', async () => {
    let state = {
      version: 1,
      absoluteSpiritAdvance: 0,
      absoluteSpiritExtension: 0,
      relatedIncidents: 0,
      planeDamage: 0,
      highlandSacrificeAdvance: 0,
      history: [],
    };
    try {
      if (fs.existsSync(CAUSAL_STATE_FILE)) {
        state = { ...state, ...JSON.parse(fs.readFileSync(CAUSAL_STATE_FILE, 'utf8')) };
      }
    } catch {
      // Corrupt aggregate state is rebuilt from the next valid event.
    }
    const tier = debtResult.tier.level;
    if (tier >= 1) state.absoluteSpiritAdvance += debtResult.delta;
    if (tier >= 2) {
      state.absoluteSpiritExtension += Math.ceil(debtResult.delta / 2);
      state.relatedIncidents += 1;
    }
    if (tier >= 3) state.planeDamage += debtResult.delta;
    if (tier >= 4) state.highlandSacrificeAdvance += debtResult.delta;
    state.history = [
      ...(state.history || []),
      {
        actor: actor.名号 || '',
        debt: debtResult.debt,
        delta: debtResult.delta,
        tier: debtResult.tier.name,
        related: actor.因果牵连?.related || [],
        at: Date.now(),
      },
    ].slice(-100);
    writeJsonAtomically(CAUSAL_STATE_FILE, state);
  });
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
      const status = getWorldlineStatus(player);
      const withdrawalBlock = getWorldlineWithdrawalBlock(player);
      const lineIds = listBackupLineIds(__PATH.backup);
      await Write_player(userId, player);
      const abilities = [];
      if (status.level >= 19) abilities.push('感知时间线扰动、法身护持过去');
      if (status.level >= 20) abilities.push('单线支取、改写低境古史');
      if (status.level >= 21) abilities.push('支取全部存档、单线毁灭不损真身');
      if (status.level >= 22) abilities.push('打击仙帝古史锚点');
      const facts = status.facts.filter(fact => fact.state === 'anchored').slice(-6);
      return e.reply([
        `【${player.名号}·时间线权能】`,
        `等效权柄：${status.level}重天`,
        `历史存档：${lineIds.length}条｜已毁：${status.destroyedLines.length}条`,
        `因果债：${status.causalDebt}（${status.debtTier.name}）`,
        `纪元消债：${status.debtReductionRate <= 0 ? '至少需要准仙帝级权柄' : Number.isFinite(status.debtReductionRate) ? `1点纪元积累消减${status.debtReductionRate}点因果债` : '祭道之上无因果代价'}`,
        withdrawalBlock.blocked ? `支取封禁：剩余${formatDuration(withdrawalBlock.remainingMs)}` : '支取封禁：无',
        `现世状态：${status.noReturn ? '绝无复生' : status.shapeSpiritDestroyed ? '形神俱灭' : '道标稳固'}`,
        `权能：${abilities.join('；') || '尚未触及时光长河'}`,
        `关键事实：${facts.length ? facts.map(fact => `${fact.type}·${fact.name}`).join('、') : '尚未形成可见锚点'}`,
        `反噬预兆：${status.debtTier.effect}`,
      ].join('\n'));
    });
  }

  async withdrawTimeline(e) {
    if (!verc({ e })) return false;
    const actorId = await playerIdFromEvent(e);
    const mentionedId = await mentionedPlayerId(e);
    const targetId = mentionedId || actorId;
    const spec = parseItemSpec(e.msg, '#支取时间线');
    if (!spec) return e.reply('格式：#支取时间线 灵石，或 #支取时间线 [@玩家] 道具*物品名');
    if (!(await existplayer(actorId)) || !(await existplayer(targetId))) return e.reply('目标玩家存档不存在。');

    return withPlayerPairLock(actorId, targetId, async () => {
      const actor = await Read_player(actorId);
      const target = targetId === actorId ? actor : await Read_player(targetId);
      const withdrawalBlock = getWorldlineWithdrawalBlock(actor);
      if (withdrawalBlock.blocked) {
        return e.reply(`你被时间长河雷劫击杀后的因果封禁尚未消散，${formatDuration(withdrawalBlock.remainingMs)}内不得再次支取时间线。`);
      }
      const limit = getWithdrawalLimit(actor);
      if (limit === 0) return e.reply('至少达到准仙帝级权柄，方可从备份存档中支取实物。');

      if (targetId !== actorId) {
        const comparison = compareWorldlineAuthority(actor, target);
        if (!comparison.ok) {
          const debt = addCausalDebt(actor, comparison.reason === 'same_level' ? 45 : 80, '强行支取受护持的时间线');
          if (comparison.reason === 'higher_target' && comparison.targetLevel >= 21) {
            setShapeSpiritDestroyed(actor, '支取路尽级过去时遭本体抹杀');
          }
          await persistCausalImpact(actor, debt);
          await Write_player(actorId, actor);
          return e.reply([
            comparison.reason === 'same_level'
            ? '同级本体循因果降临，支取中止；若要强取，只能先与其当世本体分出胜负。'
            : '目标的高境本体护持过去，你的时间线法身已被当场抹灭。',
            ...formatCausalDebtResult(debt),
          ].join('\n'));
        }
      }

      const lineIds = listBackupLineIds(__PATH.backup);
      const selected = [];
      const entries = [];
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
        if (!entry) continue;
        selected.push(lineId);
        entries.push(entry);
        if (Number.isFinite(limit) && selected.length >= limit) break;
      }
      if (!entries.length) return e.reply('可触及的历史存档中没有该物品，或对应时间线已经支取过。');

      const najie = await Read_najie(actorId);
      let total = 0;
      for (const entry of entries) {
        mergeArchiveItem({ player: actor, najie }, entry);
        total += entry.amount;
      }
      const debt = recordTimelineWithdrawal(actor, {
        playerId: actorId,
        targetId,
        category: spec.category,
        itemName: spec.itemName,
        lineIds: selected,
        amount: total,
      });
      await persistCausalImpact(actor, debt);
      await Write_player(actorId, actor);
      await Write_najie(actorId, najie);
      return e.reply([
        '【时间线支取·既定化虚】',
        `从${selected.length}条历史存档支取【${spec.itemName}】×${total}。`,
        ...formatCausalDebtResult(debt),
        debt.tier.level >= 2 ? `因果已开始牵连：${actor.因果牵连?.related?.join('、') || '宗门与身边之人'}。` : '',
      ].filter(Boolean).join('\n'));
    });
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
      if (getRealmAuthorityLevel(actor) < 20) {
        return e.reply('古史打击要求秘境、仙古或花粉路任一体系至少达到准仙帝。');
      }
      const lineIds = listBackupLineIds(__PATH.backup);
      const targetState = ensureWorldlineState(target);
      const lineId = lineIds.find(id => !targetState.destroyedLines.includes(id)) || `现世前影:${Date.now()}`;
      const result = resolveAncientHistoryStrike(actor, target, {
        ...spec,
        lineId,
        availableLineIds: lineIds,
        currentEternalSilence: target.永寂状态 === '永寂' || target.永寂状态 === '绝无复生',
      });
      await persistCausalImpact(actor, result.debt);

      if (!result.ok) {
        await Write_player(actorId, actor);
        if (result.outcome === 'obliterated') {
          const actorNajie = await Read_najie(actorId);
          actorNajie.时间线封锁 = actor.纳戒封锁;
          await Write_najie(actorId, actorNajie);
          return e.reply([
            '路尽级力量沿因果反斩，你的法身、真身与神魂一并被抹灭。',
            ...formatCausalDebtResult(result.debt),
          ].join('\n'));
        }
        return e.reply([
          result.outcome === 'body_clash'
            ? '目标当世本体循古史波动降临，双方权柄同级，本次改写转化为本体对峙。'
            : '目标境界压过施术者，过去法身自行显化并挡下了古史打击。',
          ...formatCausalDebtResult(result.debt),
        ].join('\n'));
      }

      let effect = { text: '该时间线已经从古史中熄灭。' };
      if (result.outcome === 'fact_erased') effect = await applyErasedFact(targetId, target, spec.type, spec.name);
      await Write_player(actorId, actor);
      await Write_player(targetId, target);
      return e.reply([
        '【古史打击·既定事实改写】',
        `目标：${target.名号}｜锚点：${spec.type}·${spec.name}`,
        `结果：${result.outcome === 'line_only' ? '仅打灭一条过去时间线，仙帝真身不受影响。' : effect.text}`,
        result.line?.presentEffect === 'quasi_emperor_flaw' ? '准仙帝现世道果受到牵连，新增一道古史创伤。' : '',
        result.line?.allLinesDestroyed ? '目标的所有可见时间线均已熄灭；若当世再陷永寂，将绝无复生可能。' : '',
        ...formatCausalDebtResult(result.debt),
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
      const najie = await Read_najie(targetId);
      delete najie.时间线封锁;
      await persistCausalImpact(actor, debt);
      await Write_player(actorId, actor);
      await Write_player(targetId, target);
      await Write_najie(targetId, najie, { allowWorldlineUnlock: true });
      return e.reply([
        '【映照诸天·重塑形神】',
        `${actor.名号}以路尽之光重聚${target.名号}的肉身与神魂。`,
        `目标恢复至${rebuilt.currentHp}点生命，练气存档与纳戒重新可用。`,
        ...formatCausalDebtResult(debt),
      ].join('\n'));
    });
  }
}
