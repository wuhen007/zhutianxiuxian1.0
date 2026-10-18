import fs from 'node:fs';
import path from 'node:path';
import { plugin, verc, config, data } from '../../api/api.js';
import {
  Add_修为,
  Add_灵石,
  Add_血气,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
  __PATH,
  channel,
  existplayer,
  foundthing,
  invalidateBattleEquipmentCache,
  instead_equipment,
  player_efficiency,
} from '../../model/xiuxian.js';
import { getPlayerPlaneName } from '../../model/planeCoords.js';
import { getMinggeEffects } from '../../model/mingge.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { ensureWorldlineState, getCausalDebtTier } from '../../model/worldlineAuthority.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getRealmAuthorityPath } from '../../model/realmAuthority.js';
import {
  calculateWudaoResult,
  ensureDaoPath,
  ensureXianguDaoPath,
  getDaoRuleForRealm,
  getXianguDaoRuleForRealm,
} from './wudaoRules.js';
import { getFlowerDaoGateState } from '../../model/flowerPollenPath.js';
import {
  accelerateSecretPlaceAction,
  getSecretPlaceActionEndTime,
} from '../../model/secretPlaceAddiction.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import {
  AUTHORITY_COOLDOWNS,
  ETERNAL_MAP_COMPONENTS,
  ETERNAL_MAP_GESTATION_WORLD_YEARS,
  ETERNAL_MAP_NAME,
  ETERNAL_MAP_SYNTHESIS_COSTS,
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  buildInnateTreasureTransfer,
  consumeEternalMapSynthesisMaterials,
  createEternalImmortalMap,
  claimKongtongBorrow,
  formatCooldown,
  getAuthorityState,
  getCooldownRemaining,
  getEternalMapGestationStatus,
  getChaosItemRarity,
  getChaosItemRestriction,
  getInnateTreasureProjectionName,
  getKongtongModifiers,
  hasEquippedInnateTreasure,
  isInnateTreasureName,
  readInnateTreasureState,
  setKongtongDecree,
  startAuthorityCooldown,
  temperMyriadTribulationSpirit,
  transferInnateTreasureAuthorityState,
  PANGU_TALISMAN_SHATTER_CHANCE,
  writeInnateTreasureState,
} from '../../model/innateTreasure.js';

const COPYABLE_CLASSES = ['丹药', '道具', '草药', '材料', '食材', '仙宠口粮', '盒子'];
const CHAOS_INSPECTABLE_CLASSES = [...COPYABLE_CLASSES, '装备'];

function currentWorldYear() {
  const current = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  const calculated = getRealmEventWorldYear(current.index, current.years, current.epoch);
  const total = Number(current.totalYears);
  return Number.isFinite(total) ? Math.max(total, calculated) : calculated;
}

function parseItemAmount(message, command) {
  const match = String(message || '').match(new RegExp(`^#${command}\\s+(.+?)\\*(\\d+)$`));
  if (!match) return null;
  return { name: match[1].trim(), amount: Number(match[2]) };
}

function findInventoryItem(najie, name, classes = COPYABLE_CLASSES) {
  for (const itemClass of classes) {
    const item = najie[itemClass]?.find(entry => entry.name === name);
    if (item) return { itemClass, item };
  }
  return null;
}

function mergeInventoryItem(najie, itemClass, item, amount) {
  najie[itemClass] ||= [];
  const current = najie[itemClass].find(entry => entry.name === item.name);
  if (current) current.数量 = (Number(current.数量) || 0) + amount;
  else najie[itemClass].push({ ...item, class: itemClass, 数量: amount });
}

function removeInventoryItem(najie, itemClass, item, amount) {
  item.数量 = (Number(item.数量) || 0) - amount;
  najie[itemClass] = najie[itemClass].filter(entry => Number(entry.数量) > 0);
}

function worldStorageHasItem(name) {
  const contains = value => {
    if (Array.isArray(value)) return value.some(entry => entry?.name === name || contains(entry));
    if (!value || typeof value !== 'object') return false;
    if (value.name === name) return true;
    return Object.values(value).some(contains);
  };
  for (const directory of [__PATH.najie_path, __PATH.equipment_path]) {
    if (!fs.existsSync(directory)) continue;
    for (const fileName of fs.readdirSync(directory)) {
      if (!fileName.endsWith('.json')) continue;
      try {
        if (contains(JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')))) return true;
      } catch {
        // Ignore an unrelated damaged save and keep checking the remaining holders.
      }
    }
  }
  return false;
}

function nativePool(itemClass) {
  const pools = {
    丹药: data.danyao_list,
    道具: data.daoju_list,
    草药: data.caoyao_list,
    材料: [...(data.cailiao_list || []), ...(data.duanzhaocailiao || [])],
    食材: data.shicai_list,
    盒子: data.hezi_list,
  };
  return (pools[itemClass] || []).filter((item, index, list) =>
    item?.name && list.findIndex(other => other.name === item.name) === index
  );
}

async function persistChaosState(qq, najie, player) {
  const transaction = new FileRollbackTransaction();
  transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
  transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
  try {
    await Write_najie(qq, najie);
    await Write_player(qq, player);
    transaction.commit();
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], '混沌珠状态写入及回滚均失败');
    }
    throw error;
  }
}

export class InnateTreasureAuthorities extends plugin {
  constructor() {
    super({
      name: '先天至宝权柄',
      dsc: '先天至宝主动权柄与独立冷却',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#(?:先天)?至宝图鉴(?:\\s+.+)?$', fnc: 'showTreasureCatalog' },
        { reg: '^#执掌先天至宝\\s+.+$', fnc: 'equipTreasure' },
        { reg: '^.*#移交至宝归属\\s+.+$', fnc: 'transferTreasure' },
        { reg: '^#先天至宝$', fnc: 'showTreasure' },
        { reg: '^#玄黄护道$', fnc: 'xuanhuangGuard' },
        { reg: '^#混沌复制\\s+.+\\*\\d+$', fnc: 'chaosCopy' },
        { reg: '^#混沌演化\\s+.+\\*\\d+$', fnc: 'chaosEvolve' },
        { reg: '^#混沌变幻\\s+.+\\*\\d+$', fnc: 'chaosTransform' },
        { reg: '^#炼妖融合\\s+.+\\*.+$', fnc: 'fusePet' },
        { reg: '^#收摄山河\\s+(灵界裂缝|副本)$', fnc: 'captureLandscape' },
        { reg: '^#邀请山河投影', fnc: 'inviteLandscape' },
        { reg: '^#开天$', fnc: 'preparePangu' },
        { reg: '^#布诛仙剑阵$', fnc: 'prepareZhuxian' },
        { reg: '^#东皇镇世$', fnc: 'prepareDonghuang' },
        { reg: '^#截断岁月$', fnc: 'cutTime' },
        { reg: '^#人皇敕令\\s+(修炼|历练)$', fnc: 'kongtongDecree' },
        { reg: '^#借人皇气运修炼$', fnc: 'borrowKongtong' },
        { reg: '^#执掌轮回', fnc: 'protectReincarnation' },
        { reg: '^#切换太极\\s+(阴|阳)$', fnc: 'switchTaiji' },
        { reg: '^#阴阳逆转$', fnc: 'reverseTaiji' },
        { reg: '^#邀请登舟', fnc: 'inviteXutianPassenger' },
        { reg: '^#同意登舟$', fnc: 'acceptXutianPassenger' },
        { reg: '^#虚天舟乘员$', fnc: 'showXutianPassengers' },
        { reg: '^#离开虚天舟$', fnc: 'leaveXutianShip' },
        { reg: '^#(?:太初一斩|太初斩道)$', fnc: 'prepareTaichu' },
        { reg: '^#(?:无量护身|无量封界)$', fnc: 'prepareWuliang' },
        { reg: '^#(?:星辰护界|周天列阵)$', fnc: 'prepareStarBanner' },
        { reg: '^#造化回春', fnc: 'creationSpring' },
        { reg: '^#万道开炉$', fnc: 'openMyriadFurnace' },
        { reg: '^#(?:菩提悟道|菩提顿悟)$', fnc: 'bodhiEnlightenment' },
        { reg: '^#(?:因果净照|燃灯解因)$', fnc: 'cleanseCausality' },
        { reg: '^#万劫淬神$', fnc: 'temperSpirit' },
        { reg: '^#演化诸天$', fnc: 'prepareDinghai' },
        { reg: '^#合成永恒仙图$', fnc: 'synthesizeEternalMap' },
        { reg: '^#永恒古史$', fnc: 'showEternalHistory' },
        { reg: '^#永恒改命\\s+\\S+$', fnc: 'rewriteEternalFact' },
      ],
    });
    this.task = {
      cron: '0 * * * * ?',
      name: '山河社稷图投影结算',
      fnc: () => this.settleLandscapeRealms(),
    };
  }

  async treasureOwnerStatus(state, name) {
    const ownerId = state.owners?.[name]?.ownerId;
    if (!ownerId) return '未认主';
    let ownerName = '一位修士';
    if (await existplayer(ownerId)) ownerName = (await Read_player(ownerId)).名号 || ownerName;
    if (ETERNAL_MAP_COMPONENTS.includes(name) && state.owners?.[name]?.fusedInto === ETERNAL_MAP_NAME) {
      return `已熔入永恒仙图·${ownerName}`;
    }
    if (ETERNAL_MAP_COMPONENTS.includes(name) && state.owners?.[name]?.gestatingInto === ETERNAL_MAP_NAME) {
      return `仙图孕育中·${ownerName}`;
    }
    const equipped = String(state.equipped?.[name]?.ownerId || '') === String(ownerId);
    return `${equipped ? '执掌中' : '已认主'}·${ownerName}`;
  }

  async showTreasureCatalog(e) {
    if (!verc({ e })) return false;
    const requestedName = String(e.msg || '').replace(/^#(?:先天)?至宝图鉴\s*/, '').trim();
    const state = readInnateTreasureState();
    if (!requestedName) {
      const statuses = await Promise.all(INNATE_TREASURE_NAMES.map(name => this.treasureOwnerStatus(state, name)));
      const claimed = statuses.filter(status => status !== '未认主').length;
      const lines = [
        '【诸天先天至宝图鉴】',
        `收录：${INNATE_TREASURE_NAMES.length}件｜已认主：${claimed}件｜待择主：${INNATE_TREASURE_NAMES.length - claimed}件`,
        '',
      ];
      INNATE_TREASURE_NAMES.forEach((name, index) => {
        const entry = INNATE_TREASURE_CATALOG[name];
        lines.push(`${String(index + 1).padStart(2, '0')}.【${name}·${entry.title}】〔${statuses[index]}〕`);
        lines.push(`   ${entry.summary}`);
      });
      lines.push('', '发送 #至宝图鉴 至宝名 查看完整权柄。', '普通本体由24小时择主之争第一名获得；虚天舟仅随虚天之主传承认主。');
      return e.reply(lines.join('\n'));
    }

    const entry = INNATE_TREASURE_CATALOG[requestedName];
    if (!entry) return e.reply(`未收录【${requestedName}】。可查：${INNATE_TREASURE_NAMES.join('、')}`);
    const status = await this.treasureOwnerStatus(state, requestedName);
    const lines = [
      `【先天至宝图鉴·${requestedName}】`,
      `尊号：${entry.title}｜状态：${status}`,
      '本体属性：攻击1亿｜防御1亿｜生命1亿｜全属性100',
      `宝录：${entry.lore}`,
    ];
    if (entry.passives.length) lines.push('', '常驻权柄：', ...entry.passives.map(text => `· ${text}`));
    if (entry.authorities.length) {
      lines.push('', '主动权柄：');
      for (const authority of entry.authorities) {
        const cooldown = authority.cooldownKey
          ? `（冷却${formatCooldown(AUTHORITY_COOLDOWNS[authority.cooldownKey])}）`
          : '';
        lines.push(`· ${authority.command}${cooldown}`, `  ${authority.effect}`);
      }
    }
    lines.push('', requestedName === '虚天舟'
      ? '获取：从虚天宝库取得并参悟【虚天之主传承】，由唯一虚天舟自行认主。'
      : '获取：先天灵宝出世后抵达精确坐标参加24小时择主之争；第一名获得永久本体，第二、三名获得七日投影。');
    return e.reply(lines.join('\n'));
  }

  async equipTreasure(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const requestedName = String(e.msg).replace(/^#执掌先天至宝\s+/, '').trim();
    const najie = await Read_najie(qq);
    const item = najie.装备?.find(entry => entry.name === requestedName);
    if (!item) return e.reply(`你的纳戒中没有【${requestedName}】。`);
    const projectionName = getInnateTreasureProjectionName(item);
    const treasureName = projectionName || (isInnateTreasureName(item.name) ? item.name : '');
    if (!treasureName) {
      if (item.先天至宝本体 && Number(item.先天投影截止) <= Date.now()) {
        najie.装备 = najie.装备.filter(entry => entry !== item);
        await Write_najie(qq, najie);
        return e.reply('这道先天至宝投影已经超过七日，触碰时化作道光消散。');
      }
      return e.reply('该装备不是可执掌的先天至宝。');
    }
    if (String(item.绑定者 || item.author_name) !== String(qq)) {
      return e.reply('至宝上的大道烙印与你不符，无法执掌。');
    }
    if (!projectionName) {
      const owner = readInnateTreasureState().owners?.[treasureName]?.ownerId;
      if (String(owner || '') !== String(qq)) return e.reply('至宝本体并未认你为主。');
    }
    await instead_equipment(qq, { ...item, type: '至宝' });
    const equipment = await Read_equipment(qq);
    if (equipment.至宝?.name !== item.name) return e.reply('至宝执掌失败，请检查独立至宝位。');
    return e.reply(projectionName
      ? `你执掌了【${requestedName}】，可在投影消散前动用【${treasureName}】的权柄。`
      : `【${treasureName}】已归于独立至宝位，其先天权柄开始显化。`);
  }

  async transferTreasure(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply('至宝归属移交需在群聊中完成。');
    const atItem = (e.message || []).find(item => item.type === 'at' && item.qq !== 'all');
    const rawTarget = atItem?.qq || (e.at && e.at !== 'all' ? e.at : '');
    if (!rawTarget) return e.reply('用法：@玩家 #移交至宝归属 至宝名');

    const sourceQq = String(await channel(String(e.user_id).replace('qg_', '')));
    const targetQq = String(await channel(String(rawTarget).replace('qg_', '')));
    if (sourceQq === targetQq) return e.reply('至宝已经认你为主，无需移交给自己。');
    if (!await existplayer(sourceQq)) return false;
    if (!await existplayer(targetQq)) return e.reply('对方尚未踏入修行，无法承接至宝。');

    const treasureName = String(e.msg || '').replace(/^.*#移交至宝归属\s+/, '').trim();
    if (!isInnateTreasureName(treasureName)) {
      return e.reply(`未收录先天至宝【${treasureName}】。可移交：${INNATE_TREASURE_NAMES.join('、')}`);
    }

    const lockIds = [sourceQq, targetQq].sort();
    return withPlayerMutationLock(lockIds[0], () => withPlayerMutationLock(lockIds[1], async () => {
      const state = readInnateTreasureState();
      if (ETERNAL_MAP_COMPONENTS.includes(treasureName) &&
          (state.owners?.[treasureName]?.gestatingInto || state.owners?.[treasureName]?.fusedInto)) {
        return e.reply(`【${treasureName}】已经熔入永恒仙图道胎，不能再单独移交。`);
      }
      const transfer = buildInnateTreasureTransfer(state, treasureName, sourceQq, targetQq);
      if (!transfer.ok) {
        if (transfer.reason === 'unclaimed') return e.reply(`【${treasureName}】当前尚未认主。`);
        if (transfer.reason === 'not-owner') return e.reply(`你并非【${treasureName}】当前认主者，不能移交其归属。`);
        return e.reply('至宝归属没有发生变化。');
      }

      const [sourceNajie, targetNajie, sourceEquipment, targetEquipment] = await Promise.all([
        Read_najie(sourceQq),
        Read_najie(targetQq),
        Read_equipment(sourceQq),
        Read_equipment(targetQq),
      ]);
      sourceNajie.装备 ||= [];
      targetNajie.装备 ||= [];

      let treasure;
      if (sourceEquipment.至宝?.name === treasureName && !sourceEquipment.至宝?.先天至宝本体) {
        treasure = sourceEquipment.至宝;
        sourceEquipment.至宝 = {};
      } else {
        const index = sourceNajie.装备.findIndex(item => item.name === treasureName && !item.先天至宝本体);
        if (index < 0) return e.reply(`你的装备位与纳戒中都没有【${treasureName}】本体，归属数据可能需要修复。`);
        [treasure] = sourceNajie.装备.splice(index, 1);
      }

      if (targetNajie.装备.some(item => item.name === treasureName && !item.先天至宝本体) ||
          targetEquipment.至宝?.name === treasureName) {
        return e.reply(`对方存档中已存在【${treasureName}】本体，请先修复重复数据。`);
      }

      const now = Date.now();
      const transferredTreasure = {
        ...treasure,
        type: '至宝',
        author_name: targetQq,
        绑定者: targetQq,
        认主时间: now,
        数量: 1,
        islockd: 1,
      };
      const previousTreasure = targetEquipment.至宝?.name ? { ...targetEquipment.至宝 } : null;
      if (previousTreasure) targetNajie.装备.push({ ...previousTreasure, 数量: 1 });
      targetEquipment.至宝 = transferredTreasure;

      const transaction = new FileRollbackTransaction();
      for (const qq of [sourceQq, targetQq]) {
        transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
        transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
        transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
      }
      transaction.capture(path.join(__PATH.data_path, 'innate_treasure_state.json'));

      let sourceName = sourceQq;
      let targetName = targetQq;
      try {
        writeInnateTreasureState(transfer.nextState);
        await Write_najie(sourceQq, sourceNajie);
        await Write_equipment(sourceQq, sourceEquipment);
        await Write_najie(targetQq, targetNajie);
        await Write_equipment(targetQq, targetEquipment);
        const [sourcePlayer, targetPlayer] = await Promise.all([
          Read_player(sourceQq),
          Read_player(targetQq),
        ]);
        transferInnateTreasureAuthorityState(sourcePlayer, targetPlayer, treasureName);
        sourceName = sourcePlayer.名号 || sourceQq;
        targetName = targetPlayer.名号 || targetQq;
        await Write_player(sourceQq, sourcePlayer);
        await Write_player(targetQq, targetPlayer);
        transaction.commit();
      } catch (error) {
        try {
          transaction.rollback();
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], '至宝移交写入及回滚均失败');
        } finally {
          invalidateBattleEquipmentCache(sourceQq);
          invalidateBattleEquipmentCache(targetQq);
        }
        logger.error('[先天至宝] 归属移交失败:', error);
        return e.reply('至宝移交中断，双方数据已恢复，请稍后重试。');
      }

      return e.reply([
        '【先天至宝·归属移交】',
        `【${sourceName}】主动散去旧有大道烙印。`,
        `【${treasureName}】已重新认主【${targetName}】，认主与掌控权同步移交。`,
        previousTreasure ? `【${targetName}】原执掌的【${previousTreasure.name}】已退回纳戒。` : '',
      ].filter(Boolean).join('\n'));
    }));
  }

  async context(e, treasureName, cooldownKey = '') {
    if (!verc({ e })) return null;
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    const sealedUntil = Number(player?.先天权柄?.违禁品清算封禁截止) || 0;
    if (sealedUntil > Date.now()) {
      const remaining = formatCooldown(sealedUntil - Date.now());
      await e.reply(`【${treasureName}】的先天权柄正被道天清算封禁，还需${remaining}才能再次显化。`);
      return null;
    }
    if (!hasEquippedInnateTreasure(player, treasureName, cooldownKey)) {
      await e.reply(`需先执掌【${treasureName}】才能动用此权柄。`);
      return null;
    }
    if (cooldownKey) {
      const remaining = getCooldownRemaining(player, cooldownKey);
      if (remaining > 0) {
        await e.reply(`【${cooldownKey}】尚在冷却，还需${formatCooldown(remaining)}。`);
        return null;
      }
    }
    return { qq, player };
  }

  async prepare(e, treasureName, cooldownKey, flag, message) {
    const ctx = await this.context(e, treasureName, cooldownKey);
    if (!ctx) return false;
    getAuthorityState(ctx.player)[flag] = true;
    startAuthorityCooldown(ctx.player, cooldownKey);
    await Write_player(ctx.qq, ctx.player);
    return e.reply(message);
  }

  async showTreasure(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const player = await Read_player(qq);
    const name = player.当前先天至宝
      || (player.当前大道至宝 === ETERNAL_MAP_NAME ? ETERNAL_MAP_NAME : '')
      || player.彼岸大道至宝运行时?.name;
    if (!name) return e.reply('你当前没有执掌先天至宝。使用 #执掌先天至宝 名称 可令已认主的至宝归位。');
    const cooldowns = Object.entries(player.先天权柄?.冷却 || {})
      .map(([key, expiresAt]) => [key, Math.max(0, Number(expiresAt) - Date.now())])
      .filter(([, remaining]) => remaining > 0)
      .map(([key, remaining]) => `${key}：${formatCooldown(remaining)}`);
    return e.reply([
      `当前执掌：【${name === player.当前大道至宝 ? player.大道至宝器名 || name : name}】${player.先天至宝失效时间 ? `（投影剩余${formatCooldown(player.先天至宝失效时间 - Date.now())}）` : ''}`,
      cooldowns.length ? cooldowns.join('\n') : '主动权柄：均可使用',
    ].join('\n'));
  }

  async xuanhuangGuard(e) {
    return this.prepare(
      e, '天地玄黄玲珑塔', '玄黄护道', '玄黄护道待用',
      '天地玄黄气垂落。下一次渡劫伤害降低30%，或下一次开启内景地的失败率降低30%。'
    );
  }

  async chaosCopy(e) {
    const lockId = await channel(String(e.user_id).replace('qg_', ''));
    return withPlayerMutationLock(lockId, async () => {
      const ctx = await this.context(e, '混沌珠', '混沌复制');
      if (!ctx) return false;
      const input = parseItemAmount(e.msg, '混沌复制');
      if (!input || input.amount < 1) return e.reply('用法：#混沌复制 物品*数量');
      const najie = await Read_najie(ctx.qq);
      const found = findInventoryItem(najie, input.name, CHAOS_INSPECTABLE_CLASSES);
      if (!found) return e.reply('纳戒中没有该物品。');
      const catalogItem = await foundthing(found.item.name);
      const restriction = getChaosItemRestriction(found.item, catalogItem || null);
      if (restriction) return e.reply(restriction);
      if (!COPYABLE_CLASSES.includes(found.itemClass)) return e.reply('混沌复制暂不支持装备。');
      if (Number(found.item.数量) < input.amount) return e.reply('纳戒中没有足够的该物品。');
      const rank = getChaosItemRarity(found.item, catalogItem || null);
      const cap = rank >= 6 ? 9 : rank >= 3 ? 99 : 999;
      if (input.amount > cap) return e.reply(`该品阶单次最多复制${cap}个。`);
      found.item.数量 = Number(found.item.数量) + input.amount;
      startAuthorityCooldown(ctx.player, '混沌复制');
      await persistChaosState(ctx.qq, najie, ctx.player);
      return e.reply(`混沌气翻涌，【${input.name}】复制成功，数量+${input.amount}。`);
    });
  }

  async chaosEvolve(e) {
    const lockId = await channel(String(e.user_id).replace('qg_', ''));
    return withPlayerMutationLock(lockId, async () => {
      const ctx = await this.context(e, '混沌珠', '混沌演化');
      if (!ctx) return false;
      const input = parseItemAmount(e.msg, '混沌演化');
      if (!input || input.amount < 1) return e.reply('用法：#混沌演化 材料*数量');
      const najie = await Read_najie(ctx.qq);
      const found = findInventoryItem(najie, input.name, CHAOS_INSPECTABLE_CLASSES);
      if (!found) return e.reply('纳戒中没有该物品。');
      const catalogItem = await foundthing(found.item.name);
      const restriction = getChaosItemRestriction(found.item, catalogItem || null);
      if (restriction) return e.reply(restriction);
      if (found.itemClass !== '材料') return e.reply('混沌演化仅支持材料。');
      if (Number(found.item.数量) < input.amount) return e.reply('纳戒中没有足够的该材料。');
      const pool = nativePool('材料').filter(item => !getChaosItemRestriction(item));
      const currentRank = getChaosItemRarity(found.item, catalogItem || null);
      const maxRank = Math.max(currentRank, ...pool.map(getChaosItemRarity));
      const targetRank = currentRank < maxRank && Math.random() < 0.5 ? currentRank + 1 : currentRank;
      const candidates = pool.filter(item => getChaosItemRarity(item) === targetRank && item.name !== input.name);
      const fallback = pool.filter(item => getChaosItemRarity(item) === currentRank && item.name !== input.name);
      const targets = candidates.length ? candidates : fallback;
      if (!targets.length) return e.reply('混沌中没有可供演化的同阶材料。');
      const target = targets[Math.floor(Math.random() * targets.length)];
      removeInventoryItem(najie, '材料', found.item, input.amount);
      mergeInventoryItem(najie, '材料', target, input.amount);
      startAuthorityCooldown(ctx.player, '混沌演化');
      await persistChaosState(ctx.qq, najie, ctx.player);
      return e.reply(`【${input.name}】在混沌中演化为【${target.name}】x${input.amount}。`);
    });
  }

  async chaosTransform(e) {
    const ctx = await this.context(e, '混沌珠', '混沌变幻');
    if (!ctx) return false;
    const input = parseItemAmount(e.msg, '混沌变幻');
    if (!input || input.amount < 1) return e.reply('用法：#混沌变幻 物品*数量');
    const najie = await Read_najie(ctx.qq);
    const found = findInventoryItem(najie, input.name);
    if (!found || Number(found.item.数量) < input.amount) return e.reply('纳戒中没有足够的该物品。');
    const pool = nativePool(found.itemClass);
    const rank = getChaosItemRarity(found.item);
    const candidates = pool.filter(item => getChaosItemRarity(item) === rank && item.name !== input.name
      && !item.全服唯一 && !item.全时间线唯一 && !item.不可创造 && !item.不可支取);
    if (!candidates.length) return e.reply('该类别与品阶暂时没有可变幻的其他物品。');
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    removeInventoryItem(najie, found.itemClass, found.item, input.amount);
    mergeInventoryItem(najie, found.itemClass, target, input.amount);
    startAuthorityCooldown(ctx.player, '混沌变幻');
    await Write_najie(ctx.qq, najie);
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`混沌重塑物性，【${input.name}】变幻为【${target.name}】x${input.amount}。`);
  }

  async fusePet(e) {
    const ctx = await this.context(e, '炼妖壶', '炼妖融合');
    if (!ctx) return false;
    const match = String(e.msg).match(/^#炼妖融合\s+(.+?)\*(.+)$/);
    if (!match) return e.reply('用法：#炼妖融合 主宠*副宠');
    const [mainName, secondaryName] = [match[1].trim(), match[2].trim()];
    if (mainName === secondaryName) return e.reply('主宠与副宠不能是同一只仙宠。');
    const najie = await Read_najie(ctx.qq);
    const main = najie.仙宠?.find(pet => pet.name === mainName);
    const secondary = najie.仙宠?.find(pet => pet.name === secondaryName);
    if (!main || !secondary) return e.reply('主宠与副宠都必须在纳戒中。');
    if (main.炼妖继承能力) return e.reply('这只主宠已经进行过炼妖融合。');
    // 副宠加成优先用已重算的 加成；若其为常驻纳戒、从未出战导致 加成 为 0/缺失，
    // 则用其基础成长（每级增加 × 等级）推导，避免继承的 50% 能力直接归零。
    const secondaryStoredBonus = Number(secondary.加成) || 0;
    const secondaryDerivedBonus = (Number(secondary.每级增加) || 0) * (Number(secondary.等级) || 1);
    const secondaryEffectiveBonus = secondaryStoredBonus > 0 ? secondaryStoredBonus : secondaryDerivedBonus;
    main.炼妖继承能力 = {
      来源: secondary.name,
      type: secondary.type,
      加成: Number((secondaryEffectiveBonus * 0.5).toFixed(6)),
    };
    // 若主宠即当前出战宠，立即把继承的幸运反映到 player.幸运，避免需等下次数据同步才生效
    if (main.炼妖继承能力.type === '幸运' && main.name === ctx.player.仙宠?.name) {
      ctx.player.幸运 += Number(main.炼妖继承能力.加成) || 0;
    }
    removeInventoryItem(najie, '仙宠', secondary, 1);
    startAuthorityCooldown(ctx.player, '炼妖融合');
    await Write_najie(ctx.qq, najie);
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`炼妖壶中万灵归一，【${mainName}】继承了【${secondaryName}】50%的${secondary.type}能力。`);
  }

  async captureLandscape(e) {
    const ctx = await this.context(e, '山河社稷图', '收摄山河');
    if (!ctx) return false;
    const sourceType = String(e.msg).match(/^#收摄山河\s+(灵界裂缝|副本)$/)?.[1];
    const completed = sourceType === '灵界裂缝'
      ? Number(ctx.player.灵界裂缝通关次数) > 0
      : Number(ctx.player.副本通关次数) > 0;
    if (!completed) return e.reply(`你尚未通关过${sourceType}，无法将其收摄入图。`);

    const state = readInnateTreasureState();
    state.landscapeRealms = (state.landscapeRealms || []).filter(realm => Number(realm.expiresAt) > Date.now());
    if (state.landscapeRealms.some(realm => realm.ownerId === String(ctx.qq))) {
      return e.reply('山河社稷图中已有一处投影运转，需待其六小时结算完毕。');
    }
    const realmPower = Math.max(1,
      (Number(ctx.player.level_id) || 0) +
      (Number(ctx.player.Physique_id) || 0) +
      (Number(ctx.player.mijinglevel_id) || 0) * 2 +
      (Number(ctx.player.xiangulevel_id) || 0) * 2
    );
    const base = realmPower * (sourceType === '灵界裂缝' ? 50000 : 30000);
    const now = Date.now();
    state.landscapeRealms.push({
      id: `landscape_${ctx.qq}_${now}`,
      ownerId: String(ctx.qq),
      ownerName: ctx.player.名号,
      sourceType,
      createdAt: now,
      expiresAt: now + 6 * 60 * 60 * 1000,
      lastSettlementAt: now,
      invitedQqs: [],
      hourlyReward: { 修为: base, 血气: base, 灵石: Math.floor(base * 0.5) },
    });
    writeInnateTreasureState(state);
    startAuthorityCooldown(ctx.player, '收摄山河');
    await Write_player(ctx.qq, ctx.player);
    return e.reply([
      `已将【${sourceType}】收摄为山河投影，持续6小时，每小时结算一次。`,
      `每小时：修为+${base.toLocaleString('zh-CN')}、血气+${base.toLocaleString('zh-CN')}、灵石+${Math.floor(base * 0.5).toLocaleString('zh-CN')}。`,
      '可发送 #邀请山河投影 @玩家，最多邀请2人共享完整收益。'
    ].join('\n'));
  }

  async inviteLandscape(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
    if (!rawTarget) return e.reply('用法：#邀请山河投影 @玩家');
    const targetQq = String(await channel(rawTarget));
    if (targetQq === String(qq)) return e.reply('无需邀请自己。');
    if (!await existplayer(targetQq)) return e.reply('目标尚未踏入修行。');
    const state = readInnateTreasureState();
    const realm = (state.landscapeRealms || []).find(item =>
      item.ownerId === String(qq) && Number(item.expiresAt) > Date.now()
    );
    if (!realm) return e.reply('你当前没有正在运转的山河投影。');
    realm.invitedQqs ||= [];
    if (realm.invitedQqs.includes(targetQq)) return e.reply('对方已经在共享这处山河投影。');
    if (realm.invitedQqs.length >= 2) return e.reply('山河投影最多邀请2人。');
    realm.invitedQqs.push(targetQq);
    writeInnateTreasureState(state);
    const target = await Read_player(targetQq);
    return e.reply(`已邀请【${target.名号}】进入山河投影，后续每小时将获得完整共享收益。`);
  }

  async settleLandscapeRealms(now = Date.now()) {
    const state = readInnateTreasureState();
    const realms = state.landscapeRealms || [];
    for (const realm of realms) {
      const settlementEnd = Math.min(now, Number(realm.expiresAt));
      const hours = Math.floor((settlementEnd - Number(realm.lastSettlementAt)) / (60 * 60 * 1000));
      if (hours <= 0) continue;
      const participants = [realm.ownerId, ...(realm.invitedQqs || [])];
      for (const qq of participants) {
        if (!await existplayer(qq)) continue;
        await Add_修为(qq, Number(realm.hourlyReward?.修为 || 0) * hours);
        await Add_血气(qq, Number(realm.hourlyReward?.血气 || 0) * hours);
        await Add_灵石(qq, Number(realm.hourlyReward?.灵石 || 0) * hours);
      }
      realm.lastSettlementAt = Number(realm.lastSettlementAt) + hours * 60 * 60 * 1000;
    }
    state.landscapeRealms = realms.filter(realm =>
      Number(realm.expiresAt) > now || Number(realm.lastSettlementAt) < Number(realm.expiresAt)
    );
    writeInnateTreasureState(state);
    return true;
  }

  async preparePangu(e) {
    return this.prepare(e, '盘古幡', '开天', '盘古开天待用', `开天气机已凝聚，下一场PVE或天骄讨伐将触发开天；战胜天骄时有${PANGU_TALISMAN_SHATTER_CHANCE * 100}%概率打碎其本世护身法宝。`);
  }

  async prepareTaichu(e) {
    return this.prepare(e, '太初仙刃', '太初一斩', '太初仙刃首击待用', '太初锋芒已凝聚，下一场战斗的首次命中将触发太初一斩。');
  }

  async prepareWuliang(e) {
    return this.prepare(e, '无量天尺', '无量护身', '无量护身待用', '无量道纹护住周身，下一场战斗前3次受击伤害降低20%。');
  }

  async prepareStarBanner(e) {
    return this.prepare(e, '周天星辰旗', '星辰护界', '星辰护界待用', '周天星辰已经列阵，下一场战斗将为己方展开星辰护盾。');
  }

  async prepareDinghai(e) {
    return this.prepare(e, '定海珠', '演化诸天', '定海珠演化待用', '二十四颗定海珠已映照诸天，下一场战斗将展开50%最大生命的定海护盾。');
  }

  async creationSpring(e) {
    const ctx = await this.context(e, '造化仙池', '造化回春');
    if (!ctx) return false;
    const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
    const targetQq = rawTarget ? String(await channel(rawTarget)) : String(ctx.qq);
    if (!await existplayer(targetQq)) return e.reply('目标尚未踏入修行。');
    const target = targetQq === String(ctx.qq) ? ctx.player : await Read_player(targetQq);
    if (getPlayerPlaneName(target) !== getPlayerPlaneName(ctx.player)) return e.reply('造化仙池只能滋养同一位面的修士。');
    const effects = getMinggeEffects(target, data.minggeList);
    const naturalMax = getLifeSourceRepairMaximum(target, effects.生命本源额外);
    const restored = Math.max(0, naturalMax - (Number(target.生命本源) || 0));
    target.生命本源 = Math.max(Number(target.生命本源) || 0, naturalMax);
    target.仙道潜力 = Math.max(0, Number(target.仙道潜力) || 0) + 500;
    // 造化仙池修复道伤：道伤归零，并解除"无法证道"封锁
    const hadDaoWound = (Number(target.道伤) || 0) > 0;
    target.道伤 = 0;
    delete target.无法证道;
    startAuthorityCooldown(ctx.player, '造化回春');
    await Write_player(targetQq, target);
    if (targetQq !== String(ctx.qq)) await Write_player(ctx.qq, ctx.player);
    const lines = [`【造化回春】${target.名号}生命本源恢复${restored}点，仙道潜力+500。`];
    if (hadDaoWound) lines.push('仙池圣水涤荡道基，道伤尽愈！');
    return e.reply(lines.join('\n'));
  }

  async openMyriadFurnace(e) {
    const ctx = await this.context(e, '万道神炉', '万道开炉');
    if (!ctx) return false;
    const multiplier = Math.random() < 0.7 ? 2 : 3;
    getAuthorityState(ctx.player).万道开炉待用 = {
      multiplier,
      furnaceBonus: 0.5,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    startAuthorityCooldown(ctx.player, '万道开炉');
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`【万道开炉】已锁定${multiplier}倍丹药产出（或下一次炼器开炉系数+0.5），24小时内下一次普通丹药/炼器开炉时触发。`);
  }

  async bodhiEnlightenment(e) {
    const ctx = await this.context(e, '菩提祖树', '菩提悟道');
    if (!ctx) return false;
    await player_efficiency(ctx.qq);
    ctx.player = await Read_player(ctx.qq);
    const cf = config.getConfig('xiuxian', 'xiuxian');
    // 直接获得闭关72小时（4320分钟）的修为与血气收益
    const perMinute = Math.floor((Number(cf.biguan?.size) || 0) * (Number(ctx.player.level_id) || 1) * ((Number(ctx.player.修炼效率提升) || 0) + 1));
    const modifiers = getKongtongModifiers(ctx.player);
    const cultivation = Math.max(1, Math.floor(perMinute * 72 * 60 * modifiers.cultivationMultiplier));
    await Add_修为(ctx.qq, cultivation);
    await Add_血气(ctx.qq, cultivation);
    // 立刻无条件无代价获得一次顿悟的悟道
    const wudao = this.applyFreeEnlightenment(ctx.player);
    ctx.player = await Read_player(ctx.qq);
    startAuthorityCooldown(ctx.player, '菩提悟道');
    await Write_player(ctx.qq, ctx.player);
    const lines = [
      '【菩提悟道】',
      '菩提叶落，道念澄明：',
      `修为与血气各+${cultivation.toLocaleString('zh-CN')}（闭关72小时收益）。`,
    ];
    if (wudao.ok) lines.push(`顿悟成功：${wudao.ruleName} 道途进度+${wudao.gain}（顿悟双倍，无条件无代价）。`);
    else lines.push(wudao.reason);
    return e.reply(lines.join('\n'));
  }

  /** 菩提祖树专属：无条件无代价结算一次顿悟的悟道（必然成功、收益双倍、不耗资源、不限次数） */
  applyFreeEnlightenment(player) {
    const route = getRealmAuthorityPath(player);
    let rule = null;
    let path = null;
    if (route === 'xiangu') {
      path = ensureXianguDaoPath(player).path;
      rule = getXianguDaoRuleForRealm(Number(player.xiangulevel_id) || 0);
    } else if (route === 'huafen') {
      const gate = getFlowerDaoGateState(player, Number(player.huafenlevel_id) || 1);
      path = gate.path;
      rule = gate.rule;
    } else {
      path = ensureDaoPath(player, { migrateLegacy: false }).path;
      rule = getDaoRuleForRealm(Number(player.mijinglevel_id) || 0);
    }
    if (!rule) return { ok: false, reason: '当前境界尚未开启道途，本次仅获得闭关收益。' };
    const key = rule.key;
    const current = Number(path.stages?.[key]) || 0;
    if (current >= rule.targetExp) return { ok: false, reason: `${rule.name}已圆满，道途进度未变化。` };
    const set = config.getConfig('xiuxian', 'xiuxian');
    const eraIndex = Number(set.Era?.current?.index ?? 2);
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const result = calculateWudaoResult({
      player,
      rule,
      physiqueName: player.灵根?.name,
      eraIndex,
      aptitudeName: player.天资等级,
      techniqueBonus: 0,
      worldBonus: Number(player.超维星界悟道加成) || 0,
      minggeEffects,
    });
    // 顿悟：收益双倍，必然成功
    const gain = Math.max(1, Math.floor(Number(result.gain) * 2));
    path.stages[key] = Math.min(rule.targetExp, current + gain);
    return { ok: true, gain, ruleName: rule.name };
  }

  async cleanseCausality(e) {
    const ctx = await this.context(e, '因果神灯', '因果净照');
    if (!ctx) return false;
    const state = ensureWorldlineState(ctx.player);
    const reduced = Math.min(40, Math.max(0, Number(state.causalDebt) || 0));
    state.causalDebt = Math.max(0, Number(state.causalDebt) - reduced);
    ctx.player.因果反噬 = { debt: state.causalDebt, ...getCausalDebtTier(state.causalDebt), updatedAt: Date.now() };
    state.history.push({ type: '因果净照', reduced, at: Date.now() });
    startAuthorityCooldown(ctx.player, '因果净照');
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`【因果净照】神灯照去${reduced}点因果债，当前因果债：${state.causalDebt}。`);
  }

  async temperSpirit(e) {
    const ctx = await this.context(e, '万劫天碑', '万劫淬神');
    if (!ctx) return false;
    const result = temperMyriadTribulationSpirit(ctx.player);
    startAuthorityCooldown(ctx.player, '万劫淬神');
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`【万劫淬神】恢复元神${result.restored.toLocaleString('zh-CN')}；元神上限永久提升至${result.max.toLocaleString('zh-CN')}（已淬炼${result.count}次，无次数上限）。`);
  }

  async synthesizeEternalMap(e) {
    if (!verc({ e })) return false;
    const qq = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!await existplayer(qq)) return false;
    return withPlayerMutationLock(qq, async () => {
      const state = readInnateTreasureState();
      const worldYear = currentWorldYear();
      const gestation = getEternalMapGestationStatus(state.eternalMap, worldYear);
      if (state.eternalMap) {
        if (String(state.eternalMap.ownerId || '') !== qq) {
          return e.reply(gestation.phase === 'formed'
            ? '永恒仙图已经在诸天中成形，无法再次合成。'
            : `永恒仙图正在他人道炉中孕育，距离成形还需${gestation.remainingWorldYears.toLocaleString('zh-CN')}世界年。`);
        }
        if (gestation.phase === 'formed') return e.reply('你已经炼成【永恒仙图】，无需再次合成。');
        if (gestation.phase === 'gestating') {
          return e.reply(`【永恒仙图】仍在孕育，距离成形还需${gestation.remainingWorldYears.toLocaleString('zh-CN')}世界年（预计诸天纪年${gestation.readyAtWorldYear.toLocaleString('zh-CN')}年）。`);
        }

        const [najie, equipment] = await Promise.all([Read_najie(qq), Read_equipment(qq)]);
        najie.装备 ||= [];
        if (equipment.至宝?.name) najie.装备.push({ ...equipment.至宝, 数量: 1 });
        equipment.至宝 = createEternalImmortalMap(qq);
        for (const name of ETERNAL_MAP_COMPONENTS) {
          const owner = state.owners?.[name] || {};
          state.owners[name] = {
            ...owner,
            ownerId: qq,
            fusedInto: ETERNAL_MAP_NAME,
            fusedAt: Date.now(),
          };
          delete state.owners[name].gestatingInto;
          delete state.equipped[name];
        }
        state.eternalMap = {
          ...state.eternalMap,
          status: 'formed',
          formedAt: Date.now(),
          formedAtWorldYear: worldYear,
        };

        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
        transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
        transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
        transaction.capture(path.join(__PATH.data_path, 'innate_treasure_state.json'));
        try {
          writeInnateTreasureState(state);
          await Write_najie(qq, najie);
          await Write_equipment(qq, equipment);
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          invalidateBattleEquipmentCache(qq);
          throw error;
        }
        return e.reply('【大道至宝·永恒仙图】九宝历经9000世界年孕育，今日归一成图。攻击、防御、血量各固定增加一万亿，全属性倍率+300，九宝权能与原有冷却全部保留。');
      }

      const missingOwnership = ETERNAL_MAP_COMPONENTS.filter(name => String(state.owners?.[name]?.ownerId || '') !== qq);
      if (missingOwnership.length) return e.reply(`尚未取得这些至宝的永久归属：${missingOwnership.join('、')}`);
      const [najie, equipment] = await Promise.all([Read_najie(qq), Read_equipment(qq)]);
      najie.装备 ||= [];
      const held = name => equipment.至宝?.name === name || najie.装备.some(item => item.name === name && !item.先天投影截止);
      const missingItems = ETERNAL_MAP_COMPONENTS.filter(name => !held(name));
      if (missingItems.length) return e.reply(`存档中缺少这些至宝本体：${missingItems.join('、')}`);

      const materialResult = consumeEternalMapSynthesisMaterials(najie);
      if (!materialResult.ok) {
        return e.reply(`合成材料不足：${materialResult.missing.map(item => `${item.name} ${item.owned}/${item.required}`).join('、')}`);
      }

      najie.装备 = najie.装备.filter(item => !ETERNAL_MAP_COMPONENTS.includes(item.name));
      if (ETERNAL_MAP_COMPONENTS.includes(equipment.至宝?.name)) equipment.至宝 = {};
      for (const name of ETERNAL_MAP_COMPONENTS) {
        state.owners[name] = {
          ...state.owners[name],
          ownerId: qq,
          gestatingInto: ETERNAL_MAP_NAME,
          gestationStartedAt: Date.now(),
        };
        delete state.equipped[name];
      }
      state.eternalMap = {
        ownerId: qq,
        status: 'gestating',
        startedAt: Date.now(),
        startedAtWorldYear: worldYear,
        readyAtWorldYear: worldYear + ETERNAL_MAP_GESTATION_WORLD_YEARS,
      };

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
      transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
      transaction.capture(path.join(__PATH.data_path, 'innate_treasure_state.json'));
      try {
        writeInnateTreasureState(state);
        await Write_najie(qq, najie);
        await Write_equipment(qq, equipment);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        invalidateBattleEquipmentCache(qq);
        throw error;
      }
      return e.reply([
        '【永恒仙图·开始孕育】',
        '九件先天至宝已永久熔入道胎。',
        `消耗：${Object.entries(ETERNAL_MAP_SYNTHESIS_COSTS).map(([name, amount]) => `${name}×${amount}`).join('、')}`,
        `成形：诸天纪年${state.eternalMap.readyAtWorldYear.toLocaleString('zh-CN')}年（还需${ETERNAL_MAP_GESTATION_WORLD_YEARS.toLocaleString('zh-CN')}世界年）。`,
        '到期后再次发送 #合成永恒仙图 令大道至宝出世。',
      ].join('\n'));
    });
  }

  async showEternalHistory(e) {
    if (!verc({ e })) return false;
    const qq = String(await channel(String(e.user_id).replace('qg_', '')));
    const player = await Read_player(qq);
    if (player.当前大道至宝 !== ETERNAL_MAP_NAME) return e.reply('需先执掌【永恒仙图】才能观照永恒古史。');
    const records = Array.isArray(player.先天权柄?.永恒改命记录) ? player.先天权柄.永恒改命记录 : [];
    if (!records.length) return e.reply('【永恒古史】当前没有可供改写的既定事实。');
    return e.reply(['【永恒古史】', ...records.map((record, index) => `${record.id || index + 1}. ${record.name || record.type}｜${record.state === 'erased' ? '可改写' : '已改写'}`)].join('\n'));
  }

  async rewriteEternalFact(e) {
    if (!verc({ e })) return false;
    const qq = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!await existplayer(qq)) return false;
    const player = await Read_player(qq);
    if (player.当前大道至宝 !== ETERNAL_MAP_NAME) return e.reply('需先执掌【永恒仙图】才能改写既定事实。');
    const remaining = getCooldownRemaining(player, '永恒改命');
    if (remaining > 0) return e.reply(`【永恒改命】尚在冷却，还需${formatCooldown(remaining)}。`);
    const id = String(e.msg).replace(/^#永恒改命\s+/, '').trim();
    const records = Array.isArray(player.先天权柄?.永恒改命记录) ? player.先天权柄.永恒改命记录 : [];
    const record = records.find((item, index) => String(item.id || index + 1) === id && item.state === 'erased');
    if (!record) return e.reply('没有找到这条可改写的永恒古史记录。');
    const innateState = readInnateTreasureState();
    if (record.innateName && innateState.owners?.[record.innateName] && String(innateState.owners[record.innateName].ownerId) !== qq) {
      return e.reply(`【${record.innateName}】已经重新认他人为主，本次改命未生效，也未进入冷却。`);
    }
    const recordedItems = [
      ...(record.snapshot?.inventory || []).map(entry => entry.item),
      ...(record.snapshot?.equipment || []).map(entry => entry.item),
    ];
    if (recordedItems.some(item => item?.全服唯一) && worldStorageHasItem(record.name)) {
      return e.reply(`【${record.name}】的全服唯一锚点已经被重新占据，本次改命未生效，也未进入冷却。`);
    }
    const [najie, equipment] = await Promise.all([Read_najie(qq), Read_equipment(qq)]);
    for (const [key, value] of Object.entries(record.snapshot?.player || {})) player[key] = value;
    for (const entry of record.snapshot?.inventory || []) {
      najie[entry.itemClass] ||= [];
      const current = najie[entry.itemClass].find(item => item.name === entry.item.name);
      if (current) current.数量 = (Number(current.数量) || 0) + (Number(entry.item.数量) || 1);
      else najie[entry.itemClass].push({ ...entry.item });
    }
    for (const entry of record.snapshot?.equipment || []) {
      if (!equipment[entry.slot]?.name) equipment[entry.slot] = { ...entry.item };
      else {
        najie.装备 ||= [];
        najie.装备.push({ ...entry.item, class: '装备', 数量: 1 });
      }
    }
    record.state = 'rewritten';
    record.rewrittenAt = Date.now();
    startAuthorityCooldown(player, '永恒改命');
    if (record.innateName) innateState.owners[record.innateName] = { ownerId: qq, claimedAt: Date.now() };

    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
    transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
    transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
    transaction.capture(path.join(__PATH.data_path, 'innate_treasure_state.json'));
    try {
      if (record.innateName) writeInnateTreasureState(innateState);
      await Write_player(qq, player);
      await Write_najie(qq, najie);
      if ((record.snapshot?.equipment || []).length) await Write_equipment(qq, equipment);
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      invalidateBattleEquipmentCache(qq);
      throw error;
    }
    return e.reply(`【永恒改命】既定事实“${record.name || record.type}”已从古史中重新显化。`);
  }

  async prepareZhuxian(e) {
    return this.prepare(e, '诛仙四剑', '诛仙剑阵', '诛仙剑阵待用', '诛戮陷绝四剑归位，下一场战斗必定布下诛仙剑阵。');
  }

  async prepareDonghuang(e) {
    return this.prepare(e, '东皇钟', '东皇镇世', '东皇镇世待用', '东皇钟声蓄而不发，下一场战斗将镇压对手。');
  }

  async reverseTaiji(e) {
    return this.prepare(e, '太极图', '阴阳逆转', '阴阳逆转待用', '阴阳二气合一，下一场战斗开局定住对手，并逆转一次致命伤害。');
  }

  async switchTaiji(e) {
    const ctx = await this.context(e, '太极图', '切换太极');
    if (!ctx) return false;
    const mode = String(e.msg).match(/^#切换太极\s+(阴|阳)$/)?.[1];
    getAuthorityState(ctx.player).太极模式 = mode;
    await Write_player(ctx.qq, ctx.player);
    return e.reply(mode === '阴'
      ? '太极图转入阴相：受击时有30%概率化去伤害并立即反击。'
      : '太极图转入阳相：造成实际伤害的50%转化为自身气血。');
  }

  async cutTime(e) {
    const ctx = await this.context(e, '混沌钟', '截断岁月');
    if (!ctx) return false;
    const key = `xiuxian:player:${ctx.qq}:action`;
    const result = await withPlayerMutationLock(ctx.qq, async () => {
      const raw = await redis.get(key);
      if (!raw) return { blocked: 'none' };
      let action = JSON.parse(raw);
      if (/轮回|关押|永寂/.test(String(action.action || ''))) {
        return { blocked: 'forbidden' };
      }
      const now = Date.now();
      const endTime = getSecretPlaceActionEndTime(action);
      if (!Number.isFinite(endTime) || endTime <= now) {
        return { blocked: 'done' };
      }
      if (String(action.Place_actionplus) === '0') {
        // 分段结算行动（宗门/福地秘境历练等，无 end_time 字段）：
        // 把剩余全段压缩到期，由定时结算逐段消化。
        const acceleration = accelerateSecretPlaceAction(action, endTime - now, now);
        action = acceleration.action;
      } else {
        // 常规计时行动：直接拉到当前时刻
        action.end_time = now;
      }
      startAuthorityCooldown(ctx.player, '截断岁月');
      await redis.set(key, JSON.stringify(action));
      await Write_player(ctx.qq, ctx.player);
      return { blocked: '' };
    });
    if (result.blocked === 'none') return e.reply('你当前没有可截断的计时行动。');
    if (result.blocked === 'forbidden') return e.reply('此状态牵涉轮回或封禁，混沌钟无法截断。');
    if (result.blocked === 'done') return e.reply('当前行动已经可以结算，无需截断岁月。');
    return e.reply('混沌钟响，当前计时行动已抵达结算时刻。');
  }

  async kongtongDecree(e) {
    const ctx = await this.context(e, '崆峒印', '人皇敕令');
    if (!ctx) return false;
    const type = String(e.msg).match(/^#人皇敕令\s+(修炼|历练)$/)?.[1];
    const plane = getPlayerPlaneName(ctx.player);
    if (!plane) return e.reply('当前所在之地不属于可敕封的位面。');
    setKongtongDecree(ctx.qq, plane, type);
    startAuthorityCooldown(ctx.player, '人皇敕令');
    await Write_player(ctx.qq, ctx.player);
    return e.reply(type === '修炼'
      ? `人皇敕封【${plane}】24小时：修炼、悟道收益+50%，修炼额外获得35%血气，并开启借人皇气运修炼。`
      : `人皇敕封【${plane}】24小时：所有玩家副本收益+100%。`);
  }

  async borrowKongtong(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    let player = await Read_player(qq);
    const decree = readInnateTreasureState().decree;
    if (!decree || decree.type !== '修炼' || Number(decree.expiresAt) <= Date.now()) {
      return e.reply('当前没有生效中的修炼敕令。');
    }
    if (getPlayerPlaneName(player) !== decree.plane) return e.reply(`需身处【${decree.plane}】才能借用人皇气运。`);
    const claim = claimKongtongBorrow(qq);
    if (!claim.ok) return e.reply(claim.reason === 'claimed' ? '本次敕令期间你已经借用过人皇气运。' : '修炼敕令已经失效。');
    await player_efficiency(qq);
    player = await Read_player(qq);
    const cf = config.getConfig('xiuxian', 'xiuxian');
    const perMinute = Math.floor((Number(cf.biguan?.size) || 0) * (Number(player.level_id) || 1) * ((Number(player.修炼效率提升) || 0) + 1));
    const modifiers = getKongtongModifiers(player);
    const cultivation = Math.floor(perMinute * 1200 * modifiers.cultivationMultiplier * 1.5);
    const blood = Math.floor(cultivation * 0.35);
    await Add_修为(qq, cultivation);
    await Add_血气(qq, blood);
    return e.reply(`借人皇气运修炼完成：修为+${cultivation.toLocaleString('zh-CN')}，血气+${blood.toLocaleString('zh-CN')}。`);
  }

  async protectReincarnation(e) {
    const ctx = await this.context(e, '六道轮回盘', '执掌轮回');
    if (!ctx) return false;
    const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
    if (!rawTarget) return e.reply('用法：#执掌轮回 @玩家');
    const targetQq = await channel(rawTarget);
    if (!await existplayer(targetQq)) return e.reply('目标尚未踏入修行。');
    const target = String(targetQq) === String(ctx.qq) ? ctx.player : await Read_player(targetQq);
    getAuthorityState(target).轮回庇护截止 = Date.now() + 24 * 60 * 60 * 1000;
    startAuthorityCooldown(ctx.player, '执掌轮回');
    await Write_player(targetQq, target);
    if (String(targetQq) !== String(ctx.qq)) await Write_player(ctx.qq, ctx.player);
    return e.reply(`六道轮回盘已庇护【${target.名号}】24小时，寿元枯竭时不会被强制送入轮回。`);
  }

  async isPlayerBusy(qq) {
    const raw = await redis.get(`xiuxian:player:${qq}:action`);
    if (!raw) return false;
    try {
      const action = JSON.parse(raw);
      return Number(action?.end_time) > Date.now();
    } catch {
      return false;
    }
  }

  async inviteXutianPassenger(e) {
    const ctx = await this.context(e, '虚天舟', '邀请登舟');
    if (!ctx) return false;
    const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
    if (!rawTarget) return e.reply('用法：#邀请登舟 @玩家');
    const targetQq = await channel(rawTarget);
    if (String(targetQq) === String(ctx.qq)) return e.reply('你已经在掌舵虚天舟。');
    if (!await existplayer(targetQq)) return e.reply('目标尚未踏入修行。');
    const target = await Read_player(targetQq);
    if (getPlayerPlaneName(target) !== getPlayerPlaneName(ctx.player)) return e.reply('虚天舟只能接引当前位面的道友登舟。');
    if (await this.isPlayerBusy(targetQq)) return e.reply(`${target.名号}当前正在行动，无法登舟。`);
    const passengers = [...new Set((ctx.player.虚天舟乘员 || []).map(String))];
    if (!passengers.includes(String(targetQq)) && passengers.length >= 3) return e.reply('虚天舟至多搭载三名乘员。');
    await redis.set(`xutian:boarding:${targetQq}`, JSON.stringify({
      ownerQq: String(ctx.qq),
      ownerName: ctx.player.名号,
      expiresAt: Date.now() + 60000,
    }), { EX: 60 });
    return e.reply(`【${ctx.player.名号}】邀请【${target.名号}】登上虚天舟，请对方在60秒内发送 #同意登舟。`);
  }

  async acceptXutianPassenger(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const raw = await redis.get(`xutian:boarding:${qq}`);
    if (!raw) return e.reply('当前没有等待确认的虚天舟邀请。');
    const invitation = JSON.parse(raw);
    if (Number(invitation.expiresAt) <= Date.now() || !await existplayer(invitation.ownerQq)) {
      await redis.del(`xutian:boarding:${qq}`);
      return e.reply('这次登舟邀请已经失效。');
    }
    const owner = await Read_player(invitation.ownerQq);
    const passenger = await Read_player(qq);
    if (!hasEquippedInnateTreasure(owner, '虚天舟', '邀请登舟')) return e.reply('船主已经不再执掌虚天舟。');
    if (getPlayerPlaneName(owner) !== getPlayerPlaneName(passenger)) return e.reply('你与虚天舟已不在同一位面。');
    if (await this.isPlayerBusy(qq)) return e.reply('你当前正在行动，无法登舟。');
    owner.虚天舟乘员 = [...new Set((owner.虚天舟乘员 || []).map(String))];
    if (!owner.虚天舟乘员.includes(String(qq)) && owner.虚天舟乘员.length >= 3) return e.reply('虚天舟已经满载。');
    if (!owner.虚天舟乘员.includes(String(qq))) owner.虚天舟乘员.push(String(qq));
    passenger.虚天舟船主 = String(invitation.ownerQq);
    await Write_player(invitation.ownerQq, owner);
    await Write_player(qq, passenger);
    await redis.del(`xutian:boarding:${qq}`);
    return e.reply(`你已登上【${owner.名号}】的虚天舟。船主下次穿梭位面时，你将一同启程。`);
  }

  async showXutianPassengers(e) {
    const ctx = await this.context(e, '虚天舟', '虚天舟乘员');
    if (!ctx) return false;
    const passengers = [];
    for (const qq of [...new Set((ctx.player.虚天舟乘员 || []).map(String))].slice(0, 3)) {
      if (await existplayer(qq)) passengers.push((await Read_player(qq)).名号 || qq);
    }
    return e.reply(passengers.length
      ? `【虚天舟乘员 ${passengers.length}/3】\n${passengers.map((name, index) => `${index + 1}. ${name}`).join('\n')}`
      : '虚天舟当前没有乘员。使用 #邀请登舟 @玩家。');
  }

  async leaveXutianShip(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const passenger = await Read_player(qq);
    const ownerQq = String(passenger.虚天舟船主 || '');
    if (!ownerQq || !await existplayer(ownerQq)) {
      passenger.虚天舟船主 = '';
      await Write_player(qq, passenger);
      return e.reply('你当前不在任何虚天舟上。');
    }
    const owner = await Read_player(ownerQq);
    owner.虚天舟乘员 = (owner.虚天舟乘员 || []).map(String).filter(id => id !== String(qq));
    passenger.虚天舟船主 = '';
    await Write_player(ownerQq, owner);
    await Write_player(qq, passenger);
    return e.reply('你在启航前离开了虚天舟。');
  }
}
