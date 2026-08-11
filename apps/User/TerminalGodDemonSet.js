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
  applyTerminalTrialResult,
  buildTerminalTrialBattle,
  ensureTerminalGodDemonTrial,
  getTerminalTrialEligibility,
  getTerminalTrialStatus,
} from '../../model/terminalGodDemonTrial.js';

const activeTrials = new Set();

export class TerminalGodDemonSet extends plugin {
  constructor() {
    super({
      name: '终焉神魔套试炼',
      dsc: '终焉神魔体专属套装获取路线',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#终焉神魔路$', fnc: 'showPath' },
        { reg: '^#黄昏神国$', fnc: 'challengeWeapon' },
        { reg: '^#太古魔土\\s*(吞噬魔血|保持本心)?$', fnc: 'challengeArmor' },
        { reg: '^#诸世归墟$', fnc: 'challengeWheel' },
      ],
    });
  }

  async resolveContext(e) {
    if (!e) return null;
    if (!verc({ e })) return null;
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async showPath(e) {
    const ctx = await this.resolveContext(e);
    if (!ctx) return false;
    const eligibility = getTerminalTrialEligibility(ctx.player);
    if (!eligibility.ok) return e.reply(eligibility.reason);
    ensureTerminalGodDemonTrial(ctx.player);
    await Write_player(ctx.qq, ctx.player);
    return e.reply(getTerminalTrialStatus(ctx.player).lines.join('\n'));
  }

  async challengeWeapon(e) {
    return this.runTrial(e, 'weapon');
  }

  async challengeArmor(e) {
    const choice = String(e.msg).replace(/^#太古魔土\s*/, '').trim();
    return this.runTrial(e, 'armor', choice);
  }

  async challengeWheel(e) {
    return this.runTrial(e, 'wheel');
  }

  async grantBoundEquipment(qq, itemName) {
    await Add_najie_thing(
      qq,
      itemName,
      '装备',
      1,
      6,
      1,
      { idempotencyKey: `terminal-god-demon-set:${itemName}` }
    );
    const najie = await Read_najie(qq);
    const item = [...(najie.装备 || [])].reverse().find(entry => entry.name === itemName);
    if (!item) throw new Error(`装备奖励写入失败：${itemName}`);
    item.islockd = 1;
    item.绑定者 = String(qq);
    item.不可交易 = true;
    item.终焉专属 = true;
    await Write_najie(qq, najie);
  }

  async runTrial(e, route, choice = '') {
    const ctx = await this.resolveContext(e);
    if (!ctx) return false;
    if (activeTrials.has(ctx.qq)) return e.reply('你的上一场终焉试炼尚未结束。');

    const trial = buildTerminalTrialBattle(ctx.player, route, choice);
    if (!trial.ok) return e.reply(trial.reason);

    activeTrials.add(ctx.qq);
    try {
      const battle = await zd_battle(trial.attacker, trial.enemy, {
        disableWanhuaHarvest: true,
      });
      if (Array.isArray(battle.msg) && battle.msg.length > 0) {
        try {
          await ForwardMsg(e, battle.msg);
        } catch (error) {
          console.error('[终焉神魔试炼] 战报发送失败:', error?.message);
        }
      }

      const stored = await Read_player(ctx.qq);
      const result = applyTerminalTrialResult(
        stored,
        route,
        battle.winner === 'A',
        battle.A_hp,
        choice
      );
      if (!result.ok) return e.reply(result.reason);
      if (result.completedItem) await this.grantBoundEquipment(ctx.qq, result.completedItem);
      await Write_player(ctx.qq, stored);

      const status = getTerminalTrialStatus(stored);
      return e.reply([
        `【${trial.enemy.名号}·${result.won ? '陨落' : '试炼未破'}】`,
        trial.trialText,
        result.message,
        route === 'armor' && result.won && !result.completedItem
          ? `魔土剩余生命：${Math.max(0, Number(battle.A_hp) || 0)}`
          : '',
        result.completedItem ? `获得绑定装备：${result.completedItem}` : '',
        status.nextCommand ? `下一步：${status.nextCommand}` : '诸世终焉套已经圆满。',
      ].filter(Boolean).join('\n'));
    } catch (error) {
      console.error('[终焉神魔试炼] 结算失败:', error);
      return e.reply(`终焉试炼结算异常：${error.message}`);
    } finally {
      activeTrials.delete(ctx.qq);
    }
  }
}
