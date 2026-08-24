import { plugin, data } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
  bigNumberTransform,
  existplayer,
  get_fight_img,
  zd_battle,
} from '../../model/xiuxian.js';
import {
  FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS,
  FOREIGN_PAGE_REQUIREMENT,
  FOREIGN_TECHNIQUES,
  createForeignCalamityRewardPlan,
  listForeignCalamities,
  readForeignCalamity,
  saveForeignCalamity,
  withForeignCalamityLock,
} from '../../model/foreignCalamity.js';
import { applyTianmoCalamityRefinement } from '../../model/tianmoHuasheng.js';
import { addRelicToBag, normalizeRelicState } from '../../model/relicSystem.js';
import { isEvilCultivator } from '../../model/tianjiaoHostility.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const REFINE_KEY = qq => `xiuxian:foreign-calamity:refine:${qq}`;
const BATTLE_COOLDOWN_KEY = qq => `xiuxian:foreign-calamity:battle-cooldown:${qq}`;

function playerId(e) {
  return e.user_id.toString().replace('qg_', '');
}

function rewardGroupText(group) {
  if (group.type === 'relic') return `${group.relic.品质}·${group.relic.name}x1`;
  return `${group.name}x${group.amount}`;
}

function formatEntity(entity, index) {
  const hp = Math.max(0, Number(entity.当前血量) || 0);
  const maxHp = Math.max(1, Number(entity.血量上限) || 1);
  return [
    `${index + 1}.【${entity.type}】${entity.名号}（${entity.id}）`,
    `气血：${bigNumberTransform(hp)}/${bigNumberTransform(maxHp)}｜额外体系：${entity.额外体系}`,
    `境界：秘境${entity.mijinglevel_id}阶・仙古${entity.xiangulevel_id}阶・花粉${entity.huafenlevel_id}阶`,
  ].join('\n');
}

async function sendBattleLog(e, lines) {
  const messages = Array.isArray(lines) ? lines : [String(lines || '')];
  for (let start = 0; start < messages.length; start += 20) {
    const image = await get_fight_img(e, messages.slice(start, start + 20));
    if (image) await e.reply(image);
  }
}

export class ForeignCalamity extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_千年域外灾厄',
      dsc: '千年生成的孽兽、域外邪魔与外道修士',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#(?:域外灾厄|域外邪祟)$', fnc: 'showCalamities' },
        { reg: '^#讨伐(?:域外灾厄|域外邪祟)(?:\\s+(.+))?$', fnc: 'battleCalamity' },
        { reg: '^#领取域外战利品$', fnc: 'claimPendingRewards' },
        { reg: '^#天魔炼化(?:灾厄|邪祟)$', fnc: 'refineCalamity' },
        { reg: '^#合成域外功法(?:\\s+(.+))?$', fnc: 'composeTechnique' },
      ],
    });
  }

  async getActive() {
    return (await listForeignCalamities())
      .filter(entity => entity.status === 'active' && Number(entity.当前血量) > 0)
      .sort((a, b) => Number(b.worldYear) - Number(a.worldYear) || a.id.localeCompare(b.id));
  }

  async showCalamities(e) {
    const active = await this.getActive();
    if (!active.length) return e.reply('当前诸天安宁，尚未发现存世的域外灾厄。');
    return e.reply([
      `【千年域外灾厄】现存${active.length}尊`,
      ...active.map(formatEntity),
      '使用 #讨伐域外灾厄 编号（或灾厄ID/名号）发起挑战。',
    ].join('\n\n'));
  }

  async resolveTarget(input) {
    const active = await this.getActive();
    const keyword = String(input || '').trim();
    if (!keyword) return null;
    if (/^\d+$/.test(keyword)) return active[Number(keyword) - 1] || null;
    return active.find(entity => entity.id === keyword || entity.名号 === keyword)
      || active.find(entity => entity.名号.includes(keyword));
  }

  async battleCalamity(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const input = String(e.msg || '').replace(/^#讨伐(?:域外灾厄|域外邪祟)\s*/, '').trim();
    const target = await this.resolveTarget(input);
    if (!target) return e.reply('未找到这尊灾厄，请先发送 #域外灾厄 查看编号。');

    const result = await withForeignCalamityLock(target.id, async () => {
      const entity = await readForeignCalamity(target.id);
      if (!entity || entity.status !== 'active') return { message: '这尊灾厄已经被其他修士镇压。' };
      return withPlayerMutationLock(qq, async () => {
        const player = await Read_player(qq);
        if (Number(player.当前血量) <= 0) return { message: '你当前气血枯竭，先恢复状态再来讨伐。' };
        const now = Date.now();
        const cooldownKey = BATTLE_COOLDOWN_KEY(qq);
        const cooldownUntil = Number(await redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          return { message: `域外讨伐尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟。` };
        }
        const reserved = await redis.set(cooldownKey, String(now + FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS), {
          NX: true,
          EX: Math.ceil(FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS / 1000),
        });
        if (reserved !== 'OK') return { message: '域外讨伐尚在调息，请稍后再试。' };
        const attacker = {
          ...player,
          灵根: player.灵根 || { name: '普通灵根', 法球倍率: 1 },
          法球倍率: player.灵根?.法球倍率 || player.法球倍率 || 1,
        };
        const defender = { ...entity, 灵根: entity.灵根 || { name: entity.type, 法球倍率: 1 } };
        const battle = await zd_battle(attacker, defender, { battleType: 'foreign_calamity' });
        player.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(Number(battle.A_hp) || 1)) : 1;
        await Write_player(qq, player);

        entity.当前血量 = battle.winner === 'A' ? 0 : Math.max(1, Math.trunc(Number(battle.B_hp) || 1));
        let reward = null;
        if (battle.winner === 'A') {
          entity.status = 'defeated';
          entity.defeatedBy = qq;
          entity.defeatedByName = player.名号;
          entity.defeatedAt = Date.now();
          entity.rewardPlan ||= createForeignCalamityRewardPlan(entity);
        }
        await saveForeignCalamity(entity);

        if (battle.winner === 'A') {
          try {
            reward = await this.grantReward(qq, entity);
          } catch (error) {
            console.error(`[域外灾厄] 奖励结算暂缓 entity=${entity.id} player=${qq}`, error);
            reward = { pending: true, lines: ['奖励方案已经锁定，本次写盘暂缓。'] };
          }
          if (isEvilCultivator(player)) {
            await redis.set(REFINE_KEY(qq), JSON.stringify({
              entityId: entity.id,
              name: entity.名号,
              attack: entity.攻击,
              defense: entity.防御,
              maxHp: entity.血量上限,
              lifeSource: entity.生命本源,
            }), { EX: 5 * 60 });
          }
        }
        return { battle, entity, reward, evil: battle.winner === 'A' && isEvilCultivator(player) };
      });
    });

    if (result.busy) return e.reply('已有修士正在挑战这尊灾厄，请稍候。');
    if (result.message) return e.reply(result.message);
    const lines = [...(Array.isArray(result.battle.msg) ? result.battle.msg : [result.battle.msg])];
    if (result.battle.winner === 'A') {
      lines.push('', `【域外灾厄伏诛】${result.entity.名号}已被你镇压。`, ...(result.reward?.lines || []));
      if (result.reward?.pending) lines.push('遗珍背包清理后发送 #领取域外战利品，可继续结算已锁定的奖励。');
      if (result.evil) lines.push('魔念牵引其残存本源：5分钟内发送 #天魔炼化灾厄 可再炼其道果。');
    } else {
      lines.push('', `【讨伐失利】${result.entity.名号}剩余气血：${bigNumberTransform(result.entity.当前血量)}/${bigNumberTransform(result.entity.血量上限)}`);
    }
    await sendBattleLog(e, lines);
    return true;
  }

  async grantReward(qq, entity) {
    return withPlayerMutationLock(qq, async () => {
      const plan = entity.rewardPlan;
      if (!plan) throw new Error(`灾厄${entity.id}缺少奖励方案`);
      const player = await Read_player(qq);
      player._foreignCalamityClaims ||= {};
      if (player._foreignCalamityClaims[entity.id]) {
        entity.rewardClaimedAt ||= Date.now();
        await saveForeignCalamity(entity);
        return { lines: ['奖励此前已完整结算。'], already: true };
      }

      const relicGroup = plan.groups.find(group => group.type === 'relic');
      let equipment = null;
      if (relicGroup) {
        equipment = await Read_equipment(qq);
        const relicState = normalizeRelicState(equipment.遗珍);
        const owned = [...relicState.背包, ...Object.values(relicState.铭刻).flat().filter(Boolean)];
        if (!owned.some(relic => relic.id === relicGroup.relic.id)) {
          try {
            equipment.遗珍 = addRelicToBag(relicState, relicGroup.relic);
          } catch (error) {
            if (error.message === '遗珍背包已满') return { pending: true, lines: ['遗珍背包已满，本次全部奖励已锁定。'] };
            throw error;
          }
        }
      }

      for (let index = 0; index < plan.groups.length; index++) {
        const group = plan.groups[index];
        if (group.type === 'relic') continue;
        await Add_najie_thing(qq, group.name, group.class, group.amount, undefined, 1, {
          idempotencyKey: `${plan.id}:${index}`,
        });
      }
      if (equipment) await Write_equipment(qq, equipment);
      const oldKarma = Math.max(0, Number(player.业力值) || 0);
      player.业力值 = Math.max(0, oldKarma - plan.karmaReduction);
      player.位面青睐 = Math.max(0, Number(player.位面青睐) || 0) + plan.planeFavor;
      player._foreignCalamityClaims[entity.id] = Date.now();
      await Write_player(qq, player);
      entity.rewardClaimedAt = Date.now();
      await saveForeignCalamity(entity);
      return {
        lines: [
          `随机奖励：${plan.groups.map(rewardGroupText).join('、')}`,
          `固定收益：业力-${Math.min(oldKarma, plan.karmaReduction)}、位面青睐+${plan.planeFavor}`,
        ],
      };
    });
  }

  async claimPendingRewards(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const pending = (await listForeignCalamities()).filter(entity =>
      entity.status === 'defeated' && entity.defeatedBy === qq && !entity.rewardClaimedAt
    );
    if (!pending.length) return e.reply('当前没有待领取的域外战利品。');
    const lines = [];
    for (const entity of pending) {
      let result;
      try {
        result = await withForeignCalamityLock(entity.id, async () => {
          const fresh = await readForeignCalamity(entity.id);
          if (!fresh || fresh.rewardClaimedAt) return { lines: [`${entity.名号}：已结算`] };
          return this.grantReward(qq, fresh);
        });
      } catch (error) {
        console.error(`[域外灾厄] 补领失败 entity=${entity.id} player=${qq}`, error);
        result = { pending: true, lines: ['写盘暂缓，奖励仍保持锁定'] };
      }
      if (result.busy) lines.push(`${entity.名号}：正在结算，请稍候`);
      else lines.push(`${entity.名号}：${(result.lines || []).join('；')}`);
      if (result.pending) break;
    }
    return e.reply(['【域外战利品补领】', ...lines].join('\n'));
  }

  async refineCalamity(e) {
    const qq = playerId(e);
    const raw = await redis.get(REFINE_KEY(qq));
    if (!raw) return e.reply('当前没有被你镇压、可供炼化的域外灾厄。');
    return withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      if (!isEvilCultivator(player)) return e.reply('你的魔道修为尚不足以炼化这份域外本源。');
      const pending = JSON.parse(raw);
      player._foreignCalamityRefines ||= {};
      if (player._foreignCalamityRefines[pending.entityId]) {
        await redis.del(REFINE_KEY(qq));
        return e.reply('这尊灾厄的本源此前已经炼化。');
      }
      const cultivation = Math.max(1, Math.floor((Number(player.修为) || 0) * 0.02));
      const blood = Math.max(1, Math.floor((Number(player.血气) || 0) * 0.02));
      const soul = Math.max(1, Math.floor((Number(player.元神) || 0) * 0.01));
      player.修为 = (Number(player.修为) || 0) + cultivation;
      player.血气 = (Number(player.血气) || 0) + blood;
      player.元神 = (Number(player.元神) || 0) + soul;
      player.魔道值 = (Number(player.魔道值) || 0) + 50;
      const tianmoGrowth = applyTianmoCalamityRefinement(player, {
        sourceLifeEssence: pending.lifeSource,
      });
      if (tianmoGrowth.applied) player.法球倍率 = player.灵根.法球倍率;
      player._foreignCalamityRefines[pending.entityId] = Date.now();
      await Write_player(qq, player);
      await redis.del(REFINE_KEY(qq));
      const lines = [
        `【天魔炼化】${pending.name}的残存本源被你炼入魔躯。`,
        `修为+${bigNumberTransform(cultivation)}｜血气+${bigNumberTransform(blood)}｜元神+${bigNumberTransform(soul)}｜魔道值+50`,
      ];
      if (tianmoGrowth.applied) {
        lines.push(
          `天魔化生进度+0.1人｜生命本源+${tianmoGrowth.lifeSourceGain}（炼化10尊灾厄折算1名玩家）`,
          `法球倍率 ${(tianmoGrowth.previousOrb * 100).toFixed(0)}%→${(tianmoGrowth.currentOrb * 100).toFixed(0)}%｜灵根攻、防、生各+0.005`,
        );
        if (tianmoGrowth.evolved) lines.push('万灵归一，你已蜕变为【无相·万化天魔体】！');
      }
      return e.reply(lines.join('\n'));
    });
  }

  async composeTechnique(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const input = String(e.msg || '').replace(/^#合成域外功法\s*/, '').replace(/残页$/, '').trim();
    const technique = FOREIGN_TECHNIQUES.find(item => item.name === input)
      || FOREIGN_TECHNIQUES.find(item => item.name.includes(input) && input);
    if (!technique) {
      return e.reply(['请输入要合成的功法名，例如：#合成域外功法 太虚观界经', ...FOREIGN_TECHNIQUES.map(item => `${item.category}：${item.name}`)].join('\n'));
    }

    return withPlayerMutationLock(qq, async () => {
      const najie = await Read_najie(qq);
      najie.道具 ||= [];
      najie.功法 ||= [];
      const pages = najie.道具.find(item => item.name === technique.page);
      const amount = Math.max(0, Number(pages?.数量) || 0);
      if (amount < FOREIGN_PAGE_REQUIREMENT) {
        return e.reply(`${technique.page}不足：${amount}/${FOREIGN_PAGE_REQUIREMENT}。`);
      }
      pages.数量 -= FOREIGN_PAGE_REQUIREMENT;
      najie.道具 = najie.道具.filter(item => Number(item.数量) > 0);
      const owned = najie.功法.find(item => item.name === technique.name);
      if (owned) owned.数量 = (Number(owned.数量) || 0) + 1;
      else {
        const item = data.gongfa_list.find(entry => entry.name === technique.name);
        if (!item) throw new Error(`功法数据缺失：${technique.name}`);
        najie.功法.push({ ...JSON.parse(JSON.stringify(item)), 数量: 1, islockd: 1 });
      }
      await Write_najie(qq, najie);
      return e.reply(`十页归一，道文重现。获得【${technique.category}·${technique.name}】x1。`);
    });
  }
}
