import { randomUUID } from 'node:crypto';
import { plugin, verc } from '../../api/api.js';
import {
  ForwardMsg,
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  channel,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import {
  DISPOSITION_TTL_SECONDS,
  FORBIDDEN_COOLDOWN_MS,
  SOUL_BREAK_COOLDOWN_SECONDS,
  SOUL_DORMANCY_MS,
  SUMMON_TTL_SECONDS,
  addSoulBrandResentment,
  applyForbiddenDisposition,
  breakSoulBrand,
  calculateSoulBreakChance,
  craftHumanPuppet,
  ensureForbiddenState,
  forbiddenAssistKey,
  forbiddenBreakKey,
  forbiddenCooldownKey,
  forbiddenPendingKey,
  forbiddenSettlementKey,
  forbiddenSummonKey,
  getAvailableDispositions,
  getChinaDateKey,
  getForbiddenProtection,
  getForbiddenTargetEligibility,
  meltStolenDaoFruit,
  protectForbiddenTarget,
  refineStolenDaoFruit,
  repairHumanPuppet,
} from '../../model/forbiddenSoul.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { applySoulSearchKarmaTribulation } from '../User/soulSearchRules.js';
import { replyOfficialMessage } from '../../model/officialMessage.js';

const PUPPET_CRAFT_COST = Object.freeze({ 阴魂木: 3, 神魂结晶: 1, 灵石: 50_000_000 });
const PUPPET_REPAIR_COST = Object.freeze({ 阴魂木: 1, 灵石: 10_000_000 });
const IMPURITY_RETREAT_MS = 6 * 60 * 60 * 1000;

function formatNumber(value) {
  return Math.floor(Number(value) || 0).toLocaleString('zh-CN');
}

function formatDuration(ms) {
  const minutes = Math.max(1, Math.ceil(Number(ms) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days && `${days}天`, hours && `${hours}小时`, rest && `${rest}分钟`]
    .filter(Boolean)
    .join('');
}

function getActiveAction(raw, now = Date.now()) {
  if (!raw) return null;
  try {
    const action = JSON.parse(raw);
    return action && Number(action.end_time) >= now ? action : null;
  } catch {
    return null;
  }
}

function getAtTarget(e) {
  return e.message?.find(item => item.type === 'at') || null;
}

async function resolveQQ(value) {
  return channel(String(value).replace('qg_', ''));
}

async function withPlayerLocks(playerIds, task) {
  const ids = [...new Set(playerIds.map(String))].sort();
  const acquire = index => index >= ids.length
    ? task()
    : withPlayerMutationLock(ids[index], () => acquire(index + 1));
  return acquire(0);
}

async function reserveRedisKey(key, value, ttlSeconds) {
  return (await redis.set(key, value, { EX: ttlSeconds, NX: true })) === 'OK';
}

function inventoryEntries(najie) {
  return Object.values(najie || {}).flatMap(value => Array.isArray(value) ? value : []);
}

function countInventoryItem(najie, name) {
  return inventoryEntries(najie)
    .filter(item => item?.name === name)
    .reduce((total, item) => total + Math.max(0, Number(item.数量) || 0), 0);
}

function consumeInventoryItem(najie, name, amount) {
  let remaining = amount;
  for (const entries of Object.values(najie || {})) {
    if (!Array.isArray(entries)) continue;
    for (const item of entries) {
      if (item?.name !== name || remaining <= 0) continue;
      const used = Math.min(Math.max(0, Number(item.数量) || 0), remaining);
      item.数量 = (Number(item.数量) || 0) - used;
      remaining -= used;
    }
  }
  for (const [key, entries] of Object.entries(najie || {})) {
    if (Array.isArray(entries)) najie[key] = entries.filter(item => Number(item?.数量) > 0);
  }
  return remaining === 0;
}

function soulCost(player, ratio) {
  return Math.max(1, Math.ceil((Number(player.元神上限) || 0) * ratio));
}

function actionBlockReason(player, action, now = Date.now()) {
  ensureForbiddenState(player, now);
  if (player.邪道创伤.真灵蛰伏至 > now) {
    return `真灵仍在蛰伏，还需${formatDuration(player.邪道创伤.真灵蛰伏至 - now)}`;
  }
  if (action) return `正在${action.action || '进行其他行动'}`;
  return '';
}

function syncBrandResentment(master, target) {
  const brand = target.邪道创伤.魂印;
  const soul = master?.邪道?.魂奴;
  if (brand && soul?.sourceId === String(target.id || brand.targetId || soul.sourceId)) {
    soul.resentment = brand.resentment;
  }
}

function karmaResultLine(result) {
  if (!result?.triggered) return '';
  return result.survived
    ? '业力引来灭世雷劫，你承下十重劫光。'
    : '业力引来灭世雷劫，你身陨道损，境界、元神与部分功法遭劫。';
}

export class ForbiddenSoul extends plugin {
  constructor() {
    super({
      name: 'ForbiddenSoul',
      dsc: '邪道镇魂、魂奴、人傀与夺果玩法',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#镇魂.*$', fnc: 'suppressSoul' },
        { reg: '^#处置\\s*(烙印|灭魂|夺果)$', fnc: 'settleDisposition' },
        { reg: '^#我的邪道$', fnc: 'showForbiddenState' },
        { reg: '^#召唤魂奴$', fnc: 'summonSoulSlave' },
        { reg: '^#冲击魂印$', fnc: 'challengeSoulBrand' },
        { reg: '^#斩断魂印.*$', fnc: 'assistSoulBreak' },
        { reg: '^#炼制人傀$', fnc: 'craftPuppet' },
        { reg: '^#我的人傀$', fnc: 'showPuppet' },
        { reg: '^#驱使人傀$', fnc: 'summonPuppet' },
        { reg: '^#修复人傀$', fnc: 'repairPuppet' },
        { reg: '^#毁去人傀(?:\\s*确认)?$', fnc: 'destroyPuppet' },
        { reg: '^#炼化道果$', fnc: 'refineDaoFruit' },
        { reg: '^#熔去外来道果$', fnc: 'meltDaoFruit' },
        { reg: '^#闭关化杂$', fnc: 'retreatForImpurity' },
      ],
    });
  }

  async suppressSoul(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply('镇魂只能在群聊中发动。');
    const atTarget = getAtTarget(e);
    if (!atTarget) return e.reply('请指定目标：#镇魂 @目标');

    const attackerId = await resolveQQ(e.user_id);
    const targetId = await resolveQQ(atTarget.qq);
    if (attackerId === targetId) return e.reply('不能对自己施展镇魂。');
    if (!(await existplayer(attackerId))) return false;
    if (!(await existplayer(targetId))) return e.reply('目标尚未踏入修行。');

    return withPlayerLocks([attackerId, targetId], async () => {
      const now = Date.now();
      const [attacker, target] = await Promise.all([
        Read_player(attackerId),
        Read_player(targetId),
      ]);
      attacker.id = attackerId;
      target.id = targetId;
      ensureForbiddenState(attacker, now);
      ensureForbiddenState(target, now);

      const eligibility = getForbiddenTargetEligibility(attacker, target, now);
      if (!eligibility.ok) {
        const wait = eligibility.waitMs ? `，还需${formatDuration(eligibility.waitMs)}` : '';
        return e.reply(`${eligibility.reason}${wait}。`);
      }
      const choices = getAvailableDispositions(attacker, target, now);
      if (!choices.length) return e.reply('当前没有可对该目标执行的镇魂处置。');
      if (await redis.get(forbiddenPendingKey(attackerId))) {
        return e.reply('你已有一份尚未处置的镇魂战果，请先处置或等待其消散。');
      }

      const [attackerActionRaw, targetActionRaw] = await Promise.all([
        redis.get(`xiuxian:player:${attackerId}:action`),
        redis.get(`xiuxian:player:${targetId}:action`),
      ]);
      const attackerBlock = actionBlockReason(attacker, getActiveAction(attackerActionRaw, now), now);
      const targetBlock = actionBlockReason(target, getActiveAction(targetActionRaw, now), now);
      if (attackerBlock) return e.reply(`你${attackerBlock}，无法镇魂。`);
      if (targetBlock) return e.reply(`${target.名号}${targetBlock}，无法成为目标。`);

      const cooldownUntil = Number(await redis.get(forbiddenCooldownKey(attackerId))) || 0;
      if (cooldownUntil > now) {
        return e.reply(`禁术因果尚未消散，还需${formatDuration(cooldownUntil - now)}。`);
      }
      const cost = soulCost(attacker, 0.1);
      if ((Number(attacker.元神) || 0) < cost) {
        return e.reply(`镇魂需消耗${formatNumber(cost)}点元神，你当前元神不足。`);
      }

      const reserved = await reserveRedisKey(
        forbiddenCooldownKey(attackerId),
        String(now + FORBIDDEN_COOLDOWN_MS),
        Math.ceil(FORBIDDEN_COOLDOWN_MS / 1000)
      );
      if (!reserved) return e.reply('禁术因果刚被触发，请稍后查看冷却。');

      attacker.元神 -= cost;
      attacker.法球倍率 = Number(attacker.灵根?.法球倍率) || Number(attacker.法球倍率) || 1;
      target.法球倍率 = Number(target.灵根?.法球倍率) || Number(target.法球倍率) || 1;
      await Write_player(attackerId, attacker);

      let battle;
      try {
        battle = await zd_battle(attacker, target, { pvp: true });
      } catch (error) {
        console.error('镇魂战斗失败:', error);
        return e.reply(`镇魂战斗异常：${error.message}`);
      }
      if (Array.isArray(battle.msg) && battle.msg.length) {
        await ForwardMsg(e, battle.msg.slice(0, 35));
        if (battle.msg.length > 35) await e.reply('战斗过长，仅展示前35条战报。');
      }

      attacker.当前血量 = Math.max(0, Number(battle.A_hp) || 0);
      target.当前血量 = Math.max(0, Number(battle.B_hp) || 0);
      if (battle.winner !== 'A') {
        await Promise.all([
          Write_player(attackerId, attacker),
          Write_player(targetId, target),
        ]);
        return e.reply(`镇魂失败，${attacker.名号}未能压服${target.名号}。`);
      }

      protectForbiddenTarget(target, now);
      const pending = {
        id: randomUUID(),
        attackerId,
        targetId,
        groupId: String(e.group_id),
        createdAt: now,
        expiresAt: now + DISPOSITION_TTL_SECONDS * 1000,
        snapshot: {
          sourceId: targetId,
          sourceName: String(target.名号 || targetId),
          realmAuthority: getRealmAuthorityLevel(target),
          soulLevel: Math.max(0, Number(target.yuanshenlevel_id) || 0),
          attack: Math.max(1, Number(target.攻击) || 1),
          defense: Math.max(0, Number(target.防御) || 0),
          hp: Math.max(1, Number(target.血量上限) || 1),
          rootName: String(target.灵根?.name || ''),
          rootType: String(target.灵根?.type || ''),
          technique: String(target.当前使用的功法 || target.学习的功法?.[0] || ''),
          createdAt: now,
        },
      };
      await Promise.all([
        Write_player(attackerId, attacker),
        Write_player(targetId, target),
        redis.set(forbiddenPendingKey(attackerId), JSON.stringify(pending), { EX: DISPOSITION_TTL_SECONDS }),
      ]);
      return e.reply([
        `【镇魂得手】${target.名号}的神魂已被压入禁阵。`,
        `可选处置：${choices.join('、')}`,
        `请在10分钟内发送 #处置 ${choices[0]}（一次只能选择一种）。`,
      ].join('\n'));
    });
  }

  async settleDisposition(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply('处置镇魂战果只能在原群聊进行。');
    const type = String(e.msg).replace(/^#处置\s*/, '').trim();
    const attackerId = await resolveQQ(e.user_id);
    const raw = await redis.get(forbiddenPendingKey(attackerId));
    if (!raw) return e.reply('你没有尚在有效期内的镇魂处置权。');

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      await redis.del(forbiddenPendingKey(attackerId));
      return e.reply('这份镇魂处置权已经损坏并被清理。');
    }
    if (String(pending.groupId) !== String(e.group_id)) return e.reply('必须回到镇魂发生的群聊完成处置。');
    if (Number(pending.expiresAt) < Date.now()) {
      await redis.del(forbiddenPendingKey(attackerId));
      return e.reply('镇魂禁阵已经消散，处置权失效。');
    }

    return withPlayerLocks([attackerId, pending.targetId], async () => {
      const claimKey = forbiddenSettlementKey(pending.id);
      const claimed = await reserveRedisKey(claimKey, attackerId, DISPOSITION_TTL_SECONDS);
      if (!claimed) return e.reply('这份镇魂战果正在结算或已经被处置。');
      try {
        const now = Date.now();
        const [attacker, target] = await Promise.all([
          Read_player(attackerId),
          Read_player(pending.targetId),
        ]);
        attacker.id = attackerId;
        target.id = pending.targetId;
        const result = applyForbiddenDisposition(type, attacker, target, {
          now,
          settlementId: pending.id,
          attackerId,
          targetId: pending.targetId,
          snapshot: pending.snapshot,
        });
        if (!result.ok) {
          await redis.del(claimKey);
          return e.reply(`${result.reason}，你仍可在处置权过期前选择其他处置。`);
        }

        const tribulation = result.attackerApplied
          ? applySoulSearchKarmaTribulation(attacker)
          : { triggered: false };
        await Promise.all([
          Write_player(attackerId, attacker),
          Write_player(pending.targetId, target),
        ]);
        if (type === '灭魂' && result.targetApplied) {
          await redis.set(`xiuxian:player:${pending.targetId}:action`, JSON.stringify({
            action: '真灵蛰伏',
            end_time: now + SOUL_DORMANCY_MS,
            time: now,
            forbiddenSoul: 1,
          }), { EX: Math.ceil(SOUL_DORMANCY_MS / 1000) });
        }
        await redis.del(forbiddenPendingKey(attackerId));

        const resultText = {
          烙印: `你在${target.名号}神魂中烙下魂印，魂影可供驱使72小时。`,
          灭魂: `你打灭${target.名号}神魂，取得一具七日内可炼的人傀遗蜕。`,
          夺果: `你从${target.名号}体内剥得【${attacker.邪道.待炼道果?.wayName || '无名道果'}】。`,
        }[type];
        return e.reply([
          `【镇魂处置·${type}】`,
          resultText,
          `业力 +${result.config.karma}，魔道值 +${result.config.demonic}。`,
          karmaResultLine(tribulation),
        ].filter(Boolean).join('\n'));
      } catch (error) {
        await redis.del(claimKey);
        console.error('镇魂处置失败:', error);
        return e.reply(`处置结算异常：${error.message}`);
      }
    });
  }

  async showForbiddenState(e) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const now = Date.now();
      const player = await Read_player(playerId);
      ensureForbiddenState(player, now);
      await Write_player(playerId, player);
      const cooldown = Number(await redis.get(forbiddenCooldownKey(playerId))) || 0;
      const protection = getForbiddenProtection(player, now);
      const evil = player.邪道;
      const brand = player.邪道创伤.魂印;
      return e.reply([
        `【${player.名号}·邪道录】`,
        `魔道值：${formatNumber(player.魔道值)} | 业力：${formatNumber(player.业力值)}`,
        `禁术：${cooldown > now ? `冷却${formatDuration(cooldown - now)}` : '可施展'}`,
        `魂奴：${evil.魂奴 ? `${evil.魂奴.sourceName}（${formatDuration(evil.魂奴.expiresAt - now)}）` : '无'}`,
        `魂印：${brand ? `${brand.masterName}所留，怨念${brand.resentment}/100` : '无'}`,
        `遗蜕：${evil.待炼遗蜕 ? `${evil.待炼遗蜕.sourceName}（${formatDuration(evil.待炼遗蜕.expiresAt - now)}）` : '无'}`,
        `人傀：${evil.人傀 ? `${evil.人傀.sourceName}（耐久${evil.人傀.durability}/100）` : '无'}`,
        `待炼道果：${evil.待炼道果?.wayName || '无'}`,
        `外来道果：${evil.外来道果?.wayName || '无'} | 杂质：${evil.道果杂质}/60`,
        `受术保护：${protection.protected ? formatDuration(protection.waitMs) : '无'}`,
      ].join('\n'));
    });
  }

  async queueCompanion(e, type) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const now = Date.now();
      const player = await Read_player(playerId);
      ensureForbiddenState(player, now);
      const source = type === '人傀' ? player.邪道.人傀 : player.邪道.魂奴;
      if (!source) return e.reply(type === '人傀' ? '你尚未炼制人傀。' : '你没有可召唤的魂奴。');
      if (type === '人傀' && (Number(source.durability) || 0) < 20) {
        return e.reply('人傀耐久不足20，需先修复。');
      }
      const dateKey = getChinaDateKey(now);
      const usedDate = type === '人傀' ? player.邪道.人傀出战日期 : player.邪道.魂奴召唤日期;
      if (usedDate === dateKey) return e.reply(`${type}今日已经出战过。`);
      if (await redis.get(forbiddenSummonKey(playerId))) {
        return e.reply('你已经为下一场战斗准备了一尊额外战体。');
      }

      const summon = { id: randomUUID(), type, playerId, createdAt: now };
      await redis.set(
        forbiddenSummonKey(playerId),
        JSON.stringify(summon),
        { EX: SUMMON_TTL_SECONDS }
      );
      return e.reply(`${type}已收入战阵，将加入你未来6小时内的下一场主动单人战斗。`);
    });
  }

  summonSoulSlave(e) {
    return this.queueCompanion(e, '魂奴');
  }

  summonPuppet(e) {
    return this.queueCompanion(e, '人傀');
  }

  async challengeSoulBrand(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply('冲击魂印只能在群聊中进行。');
    const targetId = await resolveQQ(e.user_id);
    if (!(await existplayer(targetId))) return false;
    const initial = await Read_player(targetId);
    ensureForbiddenState(initial);
    const masterId = String(initial.邪道创伤.魂印?.masterId || '');
    if (!masterId) return e.reply('你的神魂中没有魂印。');
    if (!(await existplayer(masterId))) {
      initial.邪道创伤.魂印 = null;
      await Write_player(targetId, initial);
      return e.reply('魂印失去印主维系，自行消散。');
    }

    return withPlayerLocks([targetId, masterId], async () => {
      const now = Date.now();
      const [target, master] = await Promise.all([Read_player(targetId), Read_player(masterId)]);
      target.id = targetId;
      master.id = masterId;
      ensureForbiddenState(target, now);
      ensureForbiddenState(master, now);
      const brand = target.邪道创伤.魂印;
      if (!brand || String(brand.masterId) !== masterId) return e.reply('魂印已经消散。');

      const reserved = await reserveRedisKey(
        forbiddenBreakKey(targetId),
        '1',
        SOUL_BREAK_COOLDOWN_SECONDS
      );
      if (!reserved) {
        const ttl = await redis.ttl(forbiddenBreakKey(targetId));
        return e.reply(`神魂尚未平复，还需${formatDuration(Math.max(1, ttl) * 1000)}再次冲击。`);
      }

      const chance = calculateSoulBreakChance(target, brand);
      let result;
      if (Math.random() < chance) {
        breakSoulBrand(master, target, { now, targetId });
        result = `冲击成功，魂印崩碎！印主损失20%当前元神。`;
      } else {
        const autoBreak = addSoulBrandResentment(brand, 35);
        syncBrandResentment(master, target);
        if (autoBreak) {
          breakSoulBrand(master, target, { now, targetId });
          result = '冲击虽未直接成功，积蓄的怨念却撑碎魂印！印主遭到反噬。';
        } else {
          result = `冲击失败，成功率${Math.round(chance * 100)}%，魂印怨念升至${brand.resentment}/100。`;
        }
      }
      await Promise.all([Write_player(targetId, target), Write_player(masterId, master)]);
      return e.reply(`【冲击魂印】${result}`);
    });
  }

  async assistSoulBreak(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply('斩断魂印只能在群聊中进行。');
    const atTarget = getAtTarget(e);
    if (!atTarget) return e.reply('请指定援助目标：#斩断魂印 @目标');
    const helperId = await resolveQQ(e.user_id);
    const targetId = await resolveQQ(atTarget.qq);
    if (helperId === targetId) return e.reply('请使用 #冲击魂印 自行破印。');
    if (!(await existplayer(helperId)) || !(await existplayer(targetId))) return e.reply('相关修士不存在。');

    const initial = await Read_player(targetId);
    ensureForbiddenState(initial);
    const masterId = String(initial.邪道创伤.魂印?.masterId || '');
    if (!masterId) return e.reply('目标身上没有魂印。');
    if (helperId === masterId) return e.reply('印主不能假意援助自己的魂奴。');
    if (!(await existplayer(masterId))) {
      initial.邪道创伤.魂印 = null;
      await Write_player(targetId, initial);
      return e.reply('魂印失去印主维系，自行消散。');
    }

    return withPlayerLocks([helperId, targetId, masterId], async () => {
      const now = Date.now();
      const [helper, target, master] = await Promise.all([
        Read_player(helperId), Read_player(targetId), Read_player(masterId),
      ]);
      helper.id = helperId;
      target.id = targetId;
      master.id = masterId;
      ensureForbiddenState(helper, now);
      ensureForbiddenState(target, now);
      ensureForbiddenState(master, now);
      const brand = target.邪道创伤.魂印;
      if (!brand || String(brand.masterId) !== masterId) return e.reply('目标魂印已经消散。');
      if (getRealmAuthorityLevel(helper) < Number(brand.masterAuthority)) {
        return e.reply('你的境界权柄低于烙印时的印主，无法斩断魂印。');
      }
      const cost = soulCost(helper, 0.2);
      if ((Number(helper.元神) || 0) < cost) return e.reply(`援助需消耗${formatNumber(cost)}点元神。`);

      const dateKey = getChinaDateKey(now);
      const reserved = await reserveRedisKey(forbiddenAssistKey(targetId, dateKey), helperId, 2 * 86400);
      if (!reserved) return e.reply('目标今日已经接受过一次斩印援助。');
      helper.元神 -= cost;

      let result;
      if (Math.random() < 0.7) {
        breakSoulBrand(master, target, { now, targetId });
        result = '援助成功，魂印被斩断，印主遭受元神反噬。';
      } else {
        const autoBreak = addSoulBrandResentment(brand, 35);
        syncBrandResentment(master, target);
        if (autoBreak) {
          breakSoulBrand(master, target, { now, targetId });
          result = '斩印失败，但累积怨念最终撑碎了魂印。';
        } else {
          result = `斩印失败，魂印怨念升至${brand.resentment}/100。`;
        }
      }
      await Promise.all([
        Write_player(helperId, helper),
        Write_player(targetId, target),
        Write_player(masterId, master),
      ]);
      return e.reply(`【斩断魂印】${result}`);
    });
  }

  async craftPuppet(e) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const now = Date.now();
      const [player, najie] = await Promise.all([Read_player(playerId), Read_najie(playerId)]);
      ensureForbiddenState(player, now);
      if (!player.邪道.待炼遗蜕) return e.reply('你没有可供炼制的待炼遗蜕。');
      if (player.邪道.人傀) return e.reply('你已经持有一尊人傀。');
      for (const [name, amount] of Object.entries(PUPPET_CRAFT_COST)) {
        if (name === '灵石') continue;
        if (countInventoryItem(najie, name) < amount) return e.reply(`炼制人傀还需${name}×${amount}。`);
      }
      if ((Number(player.灵石) || 0) < PUPPET_CRAFT_COST.灵石) {
        return e.reply(`炼制人傀需要${formatNumber(PUPPET_CRAFT_COST.灵石)}灵石。`);
      }

      consumeInventoryItem(najie, '阴魂木', PUPPET_CRAFT_COST.阴魂木);
      consumeInventoryItem(najie, '神魂结晶', PUPPET_CRAFT_COST.神魂结晶);
      player.灵石 -= PUPPET_CRAFT_COST.灵石;
      const result = craftHumanPuppet(player, now);
      if (!result.ok) return e.reply(result.reason);
      await Promise.all([Write_player(playerId, player), Write_najie(playerId, najie)]);
      return e.reply(`【人傀炼成】${result.puppet.sourceName}的遗蜕已化作人傀，耐久100。`);
    });
  }

  async showPuppet(e) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    const player = await Read_player(playerId);
    ensureForbiddenState(player);
    const puppet = player.邪道.人傀;
    if (!puppet) return e.reply('你尚未炼制人傀。');
    return e.reply([
      `【人傀·${puppet.sourceName}】`,
      `灵根：${puppet.rootName || '无'} | 功法：${puppet.technique || '无'}`,
      `攻击：${formatNumber(puppet.attack)} | 防御：${formatNumber(puppet.defense)}`,
      `血量：${formatNumber(puppet.hp)} | 耐久：${puppet.durability}/100`,
      '实际出战属性仍受主人对应属性35%上限约束。',
    ].join('\n'));
  }

  async repairPuppet(e) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const now = Date.now();
      const [player, najie] = await Promise.all([Read_player(playerId), Read_najie(playerId)]);
      ensureForbiddenState(player, now);
      if (!player.邪道.人傀) return e.reply('你尚未炼制人傀。');
      if ((Number(player.邪道.人傀.durability) || 0) >= 100) return e.reply('人傀耐久已满。');
      if (countInventoryItem(najie, '阴魂木') < PUPPET_REPAIR_COST.阴魂木) {
        return e.reply('修复人傀需要阴魂木×1。');
      }
      if ((Number(player.灵石) || 0) < PUPPET_REPAIR_COST.灵石) {
        return e.reply(`修复人傀需要${formatNumber(PUPPET_REPAIR_COST.灵石)}灵石。`);
      }
      consumeInventoryItem(najie, '阴魂木', PUPPET_REPAIR_COST.阴魂木);
      player.灵石 -= PUPPET_REPAIR_COST.灵石;
      const result = repairHumanPuppet(player, 40, now);
      await Promise.all([Write_player(playerId, player), Write_najie(playerId, najie)]);
      return e.reply(`人傀耐久由${result.before}恢复至${result.current}。`);
    });
  }

  async destroyPuppet(e) {
    if (!verc({ e })) return false;
    if (!String(e.msg).trim().endsWith('确认')) {
      const text = '销毁后不返还材料。确定请发送：#毁去人傀 确认';
      return replyOfficialMessage(e, {
        markdown: [
          '# 毁去人傀',
          '',
          '> 人傀将被彻底销毁，已消耗的材料不会返还。',
        ].join('\n'),
        text,
        buttons: [[
          { text: '确认销毁', command: '#毁去人傀 确认' },
          { text: '保留人傀', command: '#我的人傀' },
        ]],
      });
    }
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const player = await Read_player(playerId);
      ensureForbiddenState(player);
      if (!player.邪道.人傀) return e.reply('你尚未炼制人傀。');
      const name = player.邪道.人傀.sourceName;
      player.邪道.人傀 = null;
      await Write_player(playerId, player);
      return e.reply(`人傀【${name}】已被彻底毁去。`);
    });
  }

  async refineDaoFruit(e) {
    return this.mutateSinglePlayer(e, player => {
      const result = refineStolenDaoFruit(player);
      if (!result.ok) return result;
      return { ok: true, message: `【${result.fruit.wayName}】已炼入外来道果槽，全战斗属性提升3%，杂质${result.impurity}/60。` };
    });
  }

  async meltDaoFruit(e) {
    return this.mutateSinglePlayer(e, player => {
      const result = meltStolenDaoFruit(player);
      if (!result.ok) return result;
      return { ok: true, message: `外来道果已经熔去，当前道果杂质${result.impurity}/60。` };
    });
  }

  async mutateSinglePlayer(e, mutation) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const player = await Read_player(playerId);
      ensureForbiddenState(player);
      const result = mutation(player);
      if (!result.ok) return e.reply(result.reason);
      await Write_player(playerId, player);
      return e.reply(result.message);
    });
  }

  async retreatForImpurity(e) {
    if (!verc({ e })) return false;
    const playerId = await resolveQQ(e.user_id);
    if (!(await existplayer(playerId))) return false;
    return withPlayerLocks([playerId], async () => {
      const now = Date.now();
      const player = await Read_player(playerId);
      ensureForbiddenState(player, now);
      if (player.邪道.道果杂质 <= 0) return e.reply('你体内没有需要化解的道果杂质。');
      if (player.邪道.化杂结束至 > now) return e.reply('你已经在闭关化杂。');
      const actionKey = `xiuxian:player:${playerId}:action`;
      const action = getActiveAction(await redis.get(actionKey), now);
      if (action) return e.reply(`你正在${action.action || '进行其他行动'}，无法闭关化杂。`);

      player.邪道.化杂结束至 = now + IMPURITY_RETREAT_MS;
      await Promise.all([
        Write_player(playerId, player),
        redis.set(actionKey, JSON.stringify({
          action: '闭关化杂',
          end_time: now + IMPURITY_RETREAT_MS,
          time: now,
          forbiddenSoul: 1,
        }), { EX: Math.ceil(IMPURITY_RETREAT_MS / 1000) }),
      ]);
      return e.reply('你已闭关化解外来道果杂质，6小时后完成，杂质降低30点。');
    });
  }
}
