import path from 'node:path';
import { plugin, verc, config, data } from '../../api/api.js';
import {
  Add_修为,
  Add_灵石,
  Add_血气,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  __PATH,
  channel,
  existplayer,
  instead_equipment,
  player_efficiency,
} from '../../model/xiuxian.js';
import { getPlayerPlaneName } from '../../model/planeCoords.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import {
  AUTHORITY_COOLDOWNS,
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  claimKongtongBorrow,
  formatCooldown,
  getAuthorityState,
  getCooldownRemaining,
  getChaosItemRarity,
  getChaosItemRestriction,
  getInnateTreasureProjectionName,
  getKongtongModifiers,
  hasEquippedInnateTreasure,
  isInnateTreasureName,
  readInnateTreasureState,
  setKongtongDecree,
  startAuthorityCooldown,
  PANGU_TALISMAN_SHATTER_CHANCE,
  writeInnateTreasureState,
} from '../../model/innateTreasure.js';

const COPYABLE_CLASSES = ['丹药', '道具', '草药', '材料', '食材', '仙宠口粮', '盒子'];
const CHAOS_INSPECTABLE_CLASSES = [...COPYABLE_CLASSES, '装备'];

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

  async context(e, treasureName, cooldownKey = '') {
    if (!verc({ e })) return null;
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    if (!hasEquippedInnateTreasure(player, treasureName)) {
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
    const name = player.当前先天至宝;
    if (!name) return e.reply('你当前没有执掌先天至宝。使用 #执掌先天至宝 名称 可令已认主的至宝归位。');
    const cooldowns = Object.entries(player.先天权柄?.冷却 || {})
      .map(([key, expiresAt]) => [key, Math.max(0, Number(expiresAt) - Date.now())])
      .filter(([, remaining]) => remaining > 0)
      .map(([key, remaining]) => `${key}：${formatCooldown(remaining)}`);
    return e.reply([
      `当前执掌：【${name}】${player.先天至宝失效时间 ? `（投影剩余${formatCooldown(player.先天至宝失效时间 - Date.now())}）` : ''}`,
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
      const restriction = getChaosItemRestriction(found.item);
      if (restriction) return e.reply(restriction);
      if (!COPYABLE_CLASSES.includes(found.itemClass)) return e.reply('混沌复制暂不支持装备。');
      if (Number(found.item.数量) < input.amount) return e.reply('纳戒中没有足够的该物品。');
      const rank = getChaosItemRarity(found.item);
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
      const restriction = getChaosItemRestriction(found.item);
      if (restriction) return e.reply(restriction);
      if (found.itemClass !== '材料') return e.reply('混沌演化仅支持材料。');
      if (Number(found.item.数量) < input.amount) return e.reply('纳戒中没有足够的该材料。');
      const pool = nativePool('材料').filter(item => !getChaosItemRestriction(item));
      const currentRank = getChaosItemRarity(found.item);
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
    const candidates = pool.filter(item => getChaosItemRarity(item) === rank && item.name !== input.name);
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
    main.炼妖继承能力 = {
      来源: secondary.name,
      type: secondary.type,
      加成: Number(((Number(secondary.加成) || 0) * 0.5).toFixed(6)),
    };
    // 若主宠即当前出战宠，立即把继承的幸运反映到 player.幸运，避免需等下次数据同步才生效
    if (main.name === ctx.player.仙宠?.name) {
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
    const ctx = await this.context(e, '太极图');
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
    const raw = await redis.get(key);
    if (!raw) return e.reply('你当前没有可截断的计时行动。');
    const action = JSON.parse(raw);
    if (/轮回|关押|永寂/.test(String(action.action || ''))) {
      return e.reply('此状态牵涉轮回或封禁，混沌钟无法截断。');
    }
    if (!Number(action.end_time) || Number(action.end_time) <= Date.now()) {
      return e.reply('当前行动已经可以结算，无需截断岁月。');
    }
    action.end_time = Date.now();
    startAuthorityCooldown(ctx.player, '截断岁月');
    await redis.set(key, JSON.stringify(action));
    await Write_player(ctx.qq, ctx.player);
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
    const ctx = await this.context(e, '虚天舟');
    if (!ctx) return false;
    const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
    if (!rawTarget) return e.reply('用法：#邀请登舟 @玩家');
    const targetQq = await channel(rawTarget);
    if (String(targetQq) === String(ctx.qq)) return e.reply('你已经在掌舵虚天舟。');
    if (!await existplayer(targetQq)) return e.reply('目标尚未踏入修行。');
    const target = await Read_player(targetQq);
    if (target.power_place !== ctx.player.power_place) return e.reply('虚天舟只能接引当前位面的道友登舟。');
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
    if (!hasEquippedInnateTreasure(owner, '虚天舟')) return e.reply('船主已经不再执掌虚天舟。');
    if (owner.power_place !== passenger.power_place) return e.reply('你与虚天舟已不在同一位面。');
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
    const ctx = await this.context(e, '虚天舟');
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
