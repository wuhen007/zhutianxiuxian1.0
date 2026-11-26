import path from 'node:path';
import { plugin, data } from '../../api/api.js';
import {
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  __PATH,
  channel,
  existplayer,
  getTargetQQFromEvent,
} from '../../model/xiuxian.js';
import {
  GRAND_UNIVERSE_LAW_STAGES,
  UNIVERSE_DUNGEON_AURA_COST,
  UNIVERSE_INVENTORY_CATEGORIES,
  ascendSmallWorldToGrandUniverse,
  createItemUniverseDungeon,
  createReincarnationUniverseDungeon,
  editUniverseDungeon,
  enterGrandUniverse,
  enterUniverseDungeon,
  getGrandUniverseLawCap,
  getGrandUniverseLawStage,
  improveGrandUniverseLaws,
  leaveGrandUniverse,
  refineItemIntoUniverseAura,
  setGrandUniverseOpen,
} from '../../model/grandUniverse.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction, writeJsonAtomically } from '../SecretPlace/rebirthTransaction.js';

function formatNumber(value) {
  return Math.trunc(Number(value) || 0).toLocaleString('zh-CN');
}

function formatDuration(ms) {
  const minutes = Math.ceil(Math.max(0, Number(ms) || 0) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}小时${rest}分钟` : `${rest}分钟`;
}

function failureMessage(result) {
  const messages = {
    world: '你尚未开辟小世界。',
    ascended: '你的小世界早已升格为大宇宙。',
    universe: '请先使用 #升格大宇宙。',
    authority: `境界权柄不足，当前${result.authority || 0}重天，需要${result.required || 0}重天。`,
    'own-way': '需先开创并命名自己的修炼体系，方能以自身之道升格宇宙。',
    'world-level': `小世界尚未演化圆满，当前${result.current || 0}/5级。`,
    dao: `自身道行积累不足，当前修炼${formatNumber(result.current)}次，需要${formatNumber(result.required)}次。`,
    potential: `仙道潜力不足，当前${formatNumber(result.current)}，需要${formatNumber(result.required)}。`,
    cultivation: `完善法则所需修为与血气不足，两者各需${formatNumber(result.required)}。`,
    cap: `当前境界只能将宇宙完善至【${result.cap?.capacity || '红尘仙'}】承载上限。`,
    category: `物品类别应为：${UNIVERSE_INVENTORY_CATEGORIES.join('、')}。`,
    input: '物品名称或数量格式有误，单次数量为1至9999。',
    item: `纳戒中的目标物品不足，当前可用${formatNumber(result.available)}件。`,
    name: '秘境名称应为2至10个字。',
    duplicate: '大宇宙中已有同名秘境。',
    limit: '大宇宙秘境数量已达12座上限。',
    aura: `宇宙灵韵不足，当前${formatNumber(result.current)}，需要${formatNumber(result.required)}。`,
    cost: `演绎万物轮回代价不足：修为${formatNumber(result.cost?.cultivation)}、血气${formatNumber(result.cost?.blood)}、源石${formatNumber(result.cost?.sourceStone)}、灵韵${formatNumber(result.cost?.aura)}。`,
    dungeon: '大宇宙中没有这座秘境。',
    field: '可编辑字段仅限：简介、敌人、奖励。',
    content: '编辑内容应为2至60个字。',
    cooldown: `这座秘境的轮回尚未重启，还需${formatDuration(result.remaining)}。`,
    closed: '这座大宇宙已经封闭，暂不接引外界生灵。',
    target: '没有找到目标玩家的大宇宙。',
    owner: '你本就是这座大宇宙的界主。',
    'not-inside': '你当前不在其他玩家的大宇宙中。',
  };
  return messages[result.reason] || '大宇宙法则本次未能响应。';
}

export class GrandUniverse extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_grand_universe',
      dsc: '仙王大宇宙与自定义秘境',
      event: 'message',
      priority: 599,
      rule: [
        { reg: '^#大宇宙列表$', fnc: 'listGrandUniverses' },
        { reg: '^#开放大宇宙$', fnc: 'openGrandUniverse' },
        { reg: '^#关闭大宇宙$', fnc: 'closeGrandUniverse' },
        { reg: '^#进入大宇宙(?:\\s+.*)?$', fnc: 'enterGrandUniverse' },
        { reg: '^#离开大宇宙$', fnc: 'leaveGrandUniverse' },
        { reg: '^#(?:我的)?大宇宙$', fnc: 'viewGrandUniverse' },
        { reg: '^#升格大宇宙$', fnc: 'ascendGrandUniverse' },
        { reg: '^#完善宇宙法则(?:\\*[1-5])?$', fnc: 'improveUniverseLaws' },
        { reg: '^#炼化宇宙灵韵\\s+.+\\*.+\\*[1-9]\\d{0,3}$', fnc: 'refineUniverseAura' },
        { reg: '^#铸造宇宙秘境\\s+.+\\*.+\\*.+$', fnc: 'forgeUniverseDungeon' },
        { reg: '^#演绎宇宙秘境\\s+.+$', fnc: 'deriveUniverseDungeon' },
        { reg: '^#编辑宇宙秘境\\s+.+\\*(?:简介|敌人|奖励)\\*.+$', fnc: 'editUniverseDungeon' },
        { reg: '^#宇宙秘境$', fnc: 'listUniverseDungeons' },
        { reg: '^#进入宇宙秘境\\s+.+$', fnc: 'enterUniverseDungeon' },
      ],
    });
  }

  async getQq(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  getWorld(qq) {
    return (data.xiaoshijie || []).find(item => String(item.player_qq) === String(qq));
  }

  async withPlayerLocks(ids, operation) {
    const keys = [...new Set(ids.map(String))].sort();
    const run = index => index >= keys.length
      ? operation()
      : withPlayerMutationLock(keys[index], () => run(index + 1));
    return run(0);
  }

  async resolveUniverseTarget(e, selfQq) {
    const input = e.msg.replace(/^#进入大宇宙\s*/, '').trim();
    const eventTarget = getTargetQQFromEvent(e, selfQq);
    let ownerId = eventTarget || (/^\d{5,20}$/.test(input) ? input : '');
    if (ownerId) ownerId = String(await channel(ownerId));
    const world = ownerId
      ? this.getWorld(ownerId)
      : (data.xiaoshijie || []).find(item => item.大宇宙 && item.world_name === input);
    return { ownerId: String(world?.player_qq || ownerId), world };
  }

  async mutateUniverseVisit(e, targetOwnerId, operation) {
    if (!e.isGroup) return false;
    const qq = await this.getQq(e);
    if (!await existplayer(qq)) return e.reply('请先创建修仙角色。');

    try {
      return await this.withPlayerLocks([qq, targetOwnerId], async () => {
        const worldIndex = (data.xiaoshijie || []).findIndex(
          item => String(item.player_qq) === String(targetOwnerId)
        );
        const world = worldIndex >= 0 ? data.xiaoshijie[worldIndex] : null;
        const player = await Read_player(qq);
        const snapshot = world ? structuredClone(world) : null;
        const result = operation({ player, world, qq, ownerId: String(targetOwnerId) });
        if (!result.ok) return e.reply(failureMessage(result));

        const worldFile = path.join(data.lib_path, '小世界列表.json');
        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
        transaction.capture(worldFile);
        try {
          await Write_player(qq, player);
          writeJsonAtomically(worldFile, data.xiaoshijie);
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          if (worldIndex >= 0 && snapshot) data.xiaoshijie[worldIndex] = snapshot;
          throw error;
        }
        return { ...result, ownerId: String(targetOwnerId), worldName: world.world_name };
      });
    } catch (error) {
      console.error(`[大宇宙] 玩家${qq}跨界写入失败:`, error);
      return e.reply('大宇宙存档写入失败，本次变化已回滚。');
    }
  }

  async mutateAccessibleUniverse(e, operation) {
    const qq = await this.getQq(e);
    if (!await existplayer(qq)) return e.reply('请先创建修仙角色。');
    const initialPlayer = await Read_player(qq);
    const initialOwnerId = String(initialPlayer?.大宇宙位置?.界主 || qq);
    return this.mutateUniverseVisit(e, initialOwnerId, ({ player, world, ownerId }) => {
      const currentOwnerId = String(player?.大宇宙位置?.界主 || qq);
      if (currentOwnerId !== ownerId) return { ok: false, reason: 'target' };
      if (currentOwnerId !== qq && !world?.大宇宙) return { ok: false, reason: 'target' };
      if (currentOwnerId !== qq && world?.大宇宙?.对外开放 === false) {
        return { ok: false, reason: 'closed' };
      }
      return operation({ player, world, qq, ownerId });
    });
  }

  async mutate(e, operation, { inventory = false } = {}) {
    if (!e.isGroup) return false;
    const qq = await this.getQq(e);
    if (!await existplayer(qq)) return e.reply('请先创建修仙角色。');

    try {
      return await withPlayerMutationLock(qq, async () => {
        const worldIndex = (data.xiaoshijie || []).findIndex(item => String(item.player_qq) === qq);
        const world = worldIndex >= 0 ? data.xiaoshijie[worldIndex] : null;
        const player = await Read_player(qq);
        const najie = inventory ? await Read_najie(qq) : null;
        const snapshot = world ? structuredClone(world) : null;
        const result = operation({ player, world, najie, qq });
        if (!result.ok) return e.reply(failureMessage(result));

        const worldFile = path.join(data.lib_path, '小世界列表.json');
        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
        transaction.capture(worldFile);
        if (inventory) transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));

        try {
          await Write_player(qq, player);
          if (inventory && await Write_najie(qq, najie) === false) {
            throw new Error('纳戒时间线处于封锁状态');
          }
          writeJsonAtomically(worldFile, data.xiaoshijie);
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          if (worldIndex >= 0 && snapshot) data.xiaoshijie[worldIndex] = snapshot;
          throw error;
        }
        return result;
      });
    } catch (error) {
      console.error(`[大宇宙] 玩家${qq}写入失败:`, error);
      return e.reply('大宇宙存档写入失败，本次变化已回滚。');
    }
  }

  async listGrandUniverses(e) {
    const worlds = (data.xiaoshijie || []).filter(
      item => item.大宇宙 && item.大宇宙.对外开放 !== false
    );
    if (!worlds.length) return e.reply('诸天之中暂时没有对外开放的大宇宙。');
    return e.reply([
      '【诸天大宇宙·位面坐标】',
      ...worlds.map((world, index) => {
        const stage = getGrandUniverseLawStage(world);
        return `${index + 1}.【${world.world_name}】界主${world.player_qq}｜承载${stage.capacity}｜秘境${world.大宇宙.秘境?.length || 0}座`;
      }),
      '发送 #进入大宇宙 QQ、#进入大宇宙 宇宙名，或@界主进入。',
    ].join('\n'));
  }

  async openGrandUniverse(e) {
    const result = await this.mutate(e, ({ world }) => setGrandUniverseOpen(world, true));
    if (!result?.ok) return result;
    return e.reply('【界门洞开】你的大宇宙已接入诸天位面，其他玩家现在可以进入。');
  }

  async closeGrandUniverse(e) {
    const result = await this.mutate(e, ({ world }) => setGrandUniverseOpen(world, false));
    if (!result?.ok) return result;
    return e.reply('【界门封闭】你的大宇宙已隔绝外界，现有访客仍可使用 #离开大宇宙 返回诸天。');
  }

  async enterGrandUniverse(e) {
    const qq = await this.getQq(e);
    const target = await this.resolveUniverseTarget(e, qq);
    if (!target.world?.大宇宙) return e.reply(failureMessage({ reason: 'target' }));
    const result = await this.mutateUniverseVisit(e, target.ownerId, ({ player, world, ownerId }) => (
      enterGrandUniverse(player, world, { ownerId, visitorId: qq })
    ));
    if (!result?.ok) return result;
    return e.reply([
      `【横渡界壁·${result.worldName}】`,
      `你已进入界主${result.ownerId}开辟的大宇宙，这里视作一座独立玩家位面。`,
      '可使用 #宇宙秘境 查看本界副本，使用 #进入宇宙秘境 秘境名 进行挑战。',
      '发送 #离开大宇宙 可返回诸天万界。',
    ].join('\n'));
  }

  async leaveGrandUniverse(e) {
    const result = await this.mutate(e, ({ player }) => leaveGrandUniverse(player));
    if (!result?.ok) return result;
    return e.reply(`【离界归途】你已离开【${result.location.宇宙名}】，返回原本所在的诸天位面。`);
  }

  async viewGrandUniverse(e) {
    const qq = await this.getQq(e);
    const world = this.getWorld(qq);
    if (!world) return e.reply('你尚未开辟小世界。');
    if (!world.大宇宙) return e.reply('你的小世界尚未升格，可在仙王境使用 #升格大宇宙。');
    const player = await Read_player(qq);
    const stage = getGrandUniverseLawStage(world);
    const cap = GRAND_UNIVERSE_LAW_STAGES[Math.max(0, getGrandUniverseLawCap(player))];
    const universe = world.大宇宙;
    return e.reply([
      `【${world.world_name}·大宇宙】`,
      `创世之道：${universe.创世之道}`,
      `法则：${stage.name}（${stage.level}/${cap.level}）`,
      `承载上限：${stage.capacity}｜当前境界可完善至${cap.capacity}`,
      `道行投入：${formatNumber(universe.道行投入)}｜宇宙灵韵：${formatNumber(universe.灵韵)}`,
      `绝灵时代：不受压制｜自定义秘境：${universe.秘境?.length || 0}/12`,
      `位面界门：${universe.对外开放 === false ? '封闭' : '开放'}｜近期访客：${universe.访客记录?.length || 0}`,
    ].join('\n'));
  }

  async ascendGrandUniverse(e) {
    const result = await this.mutate(e, ({ player, world }) => ascendSmallWorldToGrandUniverse(player, world));
    if (!result?.ok) return result;
    return e.reply([
      '【小世界升格·大宇宙开辟】',
      `你以自身之道【${result.universe.创世之道}】重定乾坤，原有小世界化作无垠星海。`,
      `初生法则足以承载${result.stage.capacity}，并永久摆脱绝灵时代压制。`,
      '原有药田、栖息地、工坊与世界资产全部保留。',
      '大宇宙已作为玩家位面接入诸天，默认开放，其他玩家可按界主或宇宙名进入。',
    ].join('\n'));
  }

  async improveUniverseLaws(e) {
    const times = Number(e.msg.match(/\*(\d+)$/)?.[1] || 1);
    const result = await this.mutate(e, ({ player, world }) => {
      const upgrades = [];
      for (let i = 0; i < times; i++) {
        const step = improveGrandUniverseLaws(player, world);
        if (!step.ok) return upgrades.length ? { ok: true, upgrades, stopped: step } : step;
        upgrades.push(step);
      }
      return { ok: true, upgrades };
    });
    if (!result?.ok) return result;
    const final = result.upgrades.at(-1);
    return e.reply([
      '【大宇宙·法则完善】',
      ...result.upgrades.map(item => `${item.previous.name} → ${item.stage.name}，承载上限提升至${item.stage.capacity}，灵韵+${item.auraGain}`),
      result.stopped ? `后续停止：${failureMessage(result.stopped)}` : '',
      `当前法则：${final.stage.name}`,
    ].filter(Boolean).join('\n'));
  }

  async refineUniverseAura(e) {
    const match = e.msg.match(/^#炼化宇宙灵韵\s+(.+?)\*(.+?)\*(\d+)$/);
    const result = await this.mutate(e, ({ world, najie }) => refineItemIntoUniverseAura(world, najie, {
      category: match?.[1]?.trim(), itemName: match?.[2]?.trim(), amount: match?.[3],
    }), { inventory: true });
    if (!result?.ok) return result;
    return e.reply(`【万物归源】炼化${result.amount}件物品，获得宇宙灵韵${formatNumber(result.aura)}，当前共${formatNumber(result.totalAura)}。`);
  }

  async forgeUniverseDungeon(e) {
    const match = e.msg.match(/^#铸造宇宙秘境\s+(.+?)\*(.+?)\*(.+)$/);
    const result = await this.mutate(e, ({ world, najie }) => createItemUniverseDungeon(world, najie, {
      name: match?.[1], category: match?.[2]?.trim(), itemName: match?.[3]?.trim(),
    }), { inventory: true });
    if (!result?.ok) return result;
    return e.reply([
      '【造化秘境·以物开天】',
      `秘境：【${result.dungeon.name}】`,
      `核心：${result.dungeon.source.category}·${result.dungeon.source.itemName}`,
      `法则承载：${result.dungeon.capacity}｜消耗灵韵：${UNIVERSE_DUNGEON_AURA_COST}`,
      `可使用 #编辑宇宙秘境 ${result.dungeon.name}*简介*内容 自定义秘境。`,
    ].join('\n'));
  }

  async deriveUniverseDungeon(e) {
    const name = e.msg.replace(/^#演绎宇宙秘境\s+/, '').trim();
    const result = await this.mutate(e, ({ player, world }) => createReincarnationUniverseDungeon(player, world, { name }));
    if (!result?.ok) return result;
    return e.reply([
      '【演绎万物轮回】',
      `你截取一缕宇宙可能，将【${result.dungeon.name}】由虚化实。`,
      `代价：修为${formatNumber(result.cost.cultivation)}、血气${formatNumber(result.cost.blood)}、源石${formatNumber(result.cost.sourceStone)}、灵韵${formatNumber(result.cost.aura)}`,
      result.cost.multiplier < 1 ? '路尽级权能减免了本次演绎代价。' : '准仙帝强行演绎，承受了完整开天代价。',
    ].join('\n'));
  }

  async editUniverseDungeon(e) {
    const match = e.msg.match(/^#编辑宇宙秘境\s+(.+?)\*(简介|敌人|奖励)\*(.+)$/);
    const result = await this.mutate(e, ({ world }) => editUniverseDungeon(world, match?.[1], match?.[2], match?.[3]));
    if (!result?.ok) return result;
    return e.reply(`【秘境法则已改】${result.dungeon.name}的${result.field}已更新。`);
  }

  async listUniverseDungeons(e) {
    const qq = await this.getQq(e);
    if (!await existplayer(qq)) return e.reply('请先创建修仙角色。');
    const player = await Read_player(qq);
    const ownerId = String(player?.大宇宙位置?.界主 || qq);
    const world = this.getWorld(ownerId);
    if (!world?.大宇宙) {
      return e.reply(ownerId === qq ? '请先使用 #升格大宇宙。' : failureMessage({ reason: 'target' }));
    }
    if (ownerId !== qq && world.大宇宙.对外开放 === false) {
      return e.reply(failureMessage({ reason: 'closed' }));
    }
    const dungeons = world.大宇宙.秘境 || [];
    if (!dungeons.length) return e.reply('大宇宙中尚无自定义秘境。');
    return e.reply([
      `【${world.world_name}·宇宙秘境】`,
      ownerId !== qq ? `当前位面界主：${ownerId}` : '',
      ...dungeons.map((item, index) => [
        `${index + 1}.【${item.name}】${item.source.mode === 'item' ? '器物造化' : '轮回演绎'}`,
        `   ${item.description}｜敌人：${item.enemyName}｜奖励：${item.rewardText}｜挑战${item.runs || 0}次`,
      ].join('\n')),
    ].filter(Boolean).join('\n'));
  }

  async enterUniverseDungeon(e) {
    const name = e.msg.replace(/^#进入宇宙秘境\s+/, '').trim();
    const result = await this.mutateAccessibleUniverse(e, ({ player, world, ownerId }) => (
      enterUniverseDungeon(player, world, name, { universeId: ownerId })
    ));
    if (!result?.ok) return result;
    if (!result.success) {
      return e.reply(`【${result.dungeon.name}·挑战失利】你被${result.dungeon.enemyName}击退，当前血量仅余一成。`);
    }
    return e.reply([
      `【${result.dungeon.name}·轮回通关】`,
      `你镇压${result.dungeon.enemyName}，完成一次【${result.worldName}】的宇宙秘境。`,
      `获得：修为${formatNumber(result.rewards.cultivation)}、血气${formatNumber(result.rewards.blood)}、仙道潜力${result.rewards.potential}、宇宙灵韵${result.rewards.aura}`,
      `秘境设定奖励：${result.dungeon.rewardText}`,
    ].join('\n'));
  }
}
