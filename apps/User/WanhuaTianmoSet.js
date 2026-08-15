import { plugin, verc } from '../../api/api.js';
import {
  Add_najie_thing,
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
  applyWanhuaSetTrialResult,
  buildWanhuaSetTrialBattle,
  ensureWanhuaSetTrial,
  getWanhuaSetEligibility,
  getWanhuaSetTrialStatus,
} from '../../model/wanhuaTianmoSetTrial.js';

const activeTrials = new Set();

export class WanhuaTianmoSet extends plugin {
  constructor() {
    super({
      name: '万化天魔套试炼',
      dsc: '无相万化天魔体专属套装获取路线',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#万化天魔路$', fnc: 'showPath' },
        { reg: '^#万相夺道$', fnc: 'challengeBlade' },
        { reg: '^#无相蜕生\\s*(化万相|归无相)?$', fnc: 'challengeRobe' },
        { reg: '^#万灵幡祭$', fnc: 'challengeBanner' },
      ],
    });
  }

  async resolveWanhuaContext(e) {
    if (!e || !verc({ e })) return null;
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async showPath(e) {
    const ctx = await this.resolveWanhuaContext(e);
    if (!ctx) return false;
    const eligibility = getWanhuaSetEligibility(ctx.player);
    if (!eligibility.ok) return e.reply(eligibility.reason);
    ensureWanhuaSetTrial(ctx.player);
    await Write_player(ctx.qq, ctx.player);
    return e.reply(getWanhuaSetTrialStatus(ctx.player).lines.join('\n'));
  }

  async challengeBlade(e) {
    return this.runTrial(e, 'blade');
  }

  async challengeRobe(e) {
    const choice = String(e.msg).replace(/^#无相蜕生\s*/, '').trim();
    return this.runTrial(e, 'robe', choice);
  }

  async challengeBanner(e) {
    return this.runTrial(e, 'banner');
  }

  async grantBoundEquipment(qq, itemName) {
    await Add_najie_thing(qq, itemName, '装备', 1, 6, 1, {
      idempotencyKey: `wanhua-tianmo-set:${itemName}`,
    });
    const najie = await Read_najie(qq);
    const item = [...(najie.装备 || [])].reverse().find(entry => entry.name === itemName);
    if (!item) throw new Error(`装备奖励写入失败：${itemName}`);
    item.islockd = 1;
    item.绑定者 = String(qq);
    item.不可交易 = true;
    item.万化专属 = true;
    await Write_najie(qq, najie);
  }

  async runTrial(e, route, choice = '') {
    const ctx = await this.resolveWanhuaContext(e);
    if (!ctx) return false;
    if (activeTrials.has(ctx.qq)) return e.reply('你的上一场万化试炼尚未结束。');

    const trial = buildWanhuaSetTrialBattle(ctx.player, route, choice);
    if (!trial.ok) return e.reply(trial.reason);

    activeTrials.add(ctx.qq);
    try {
      const battle = await zd_battle(trial.attacker, trial.enemy, { disableWanhuaHarvest: true });
      if (Array.isArray(battle.msg) && battle.msg.length > 0) {
        try {
          await ForwardMsg(e, battle.msg);
        } catch (error) {
          console.error('[万化天魔试炼] 战报发送失败:', error?.message);
        }
      }

      const stored = await Read_player(ctx.qq);
      const result = applyWanhuaSetTrialResult(stored, route, battle.winner === 'A', choice);
      if (!result.ok) return e.reply(result.reason);
      if (result.completedItem) await this.grantBoundEquipment(ctx.qq, result.completedItem);
      await Write_player(ctx.qq, stored);

      const status = getWanhuaSetTrialStatus(stored);
      return e.reply([
        `【${trial.enemy.名号}·${result.won ? '炼化' : '试炼未破'}】`,
        trial.trialText,
        result.message,
        result.completedItem ? `获得绑定装备：${result.completedItem}` : '',
        status.nextCommand ? `下一步：${status.nextCommand}` : '万化天魔套已经圆满，万灵魔幡可开始炼魂。',
      ].filter(Boolean).join('\n'));
    } catch (error) {
      console.error('[万化天魔试炼] 结算失败:', error);
      return e.reply(`万化试炼结算异常：${error.message}`);
    } finally {
      activeTrials.delete(ctx.qq);
    }
  }
}
