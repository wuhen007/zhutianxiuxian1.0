import { plugin, verc, data, puppeteer, Show } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import {
  allocateGongfaInsight,
  formatGongfaProficiency,
  getDouziMimicChance,
  getGongfaDailyGain,
  getGongfaProficiencyProfile,
  getLearnedGongfaNames,
  getVitalityRecoveryRate,
} from '../../model/gongfaProficiency.js';
import {
  equipCombatSkill,
  resolveCombatSkillSelection,
  unequipCombatSkill,
} from '../../model/combatSkillLoadout.js';
import { buildCombatSkillPanel } from '../../model/combatSkillPanel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const SPECIAL_GONGFA = new Set([
  '皆字秘',
  '临字秘',
  '者字秘',
  '行字秘',
  '鲲鹏宝术',
  '浑源法门·悟道',
]);

function trackedGongfaNames(player) {
  const combat = new Set(
    [...(data.jineng1 || []), ...(data.jineng2 || []), ...(data.jineng_heal || []), ...(data.jineng3 || [])]
      .filter(skill => skill?.class === '功法')
      .map(skill => skill.熟练度归属 || skill.name)
  );
  const recorded = new Set(Object.keys(player?.功法熟练度 || {}));
  return getLearnedGongfaNames(player).filter(name =>
    combat.has(name) || SPECIAL_GONGFA.has(name) || recorded.has(name)
  );
}

export class GongfaProficiency extends plugin {
  constructor() {
    super({
      name: '功法熟练度',
      dsc: '查看战斗与辅助功法的参悟进度',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#(?:功法熟练度|功法参悟)$', fnc: 'showProficiency' },
        { reg: '^#分配功法感悟\\s+.+\\*\\d+$', fnc: 'allocateInsight' },
        { reg: '^#(?:我的)?战斗技能$', fnc: 'showCombatSkills' },
        { reg: '^#(?:配置|装备)(?:攻击|防御|恢复|回血|复活|生机)技能\\s*.+$', fnc: 'equipSkill' },
        { reg: '^#卸下(?:攻击|防御|恢复|回血|复活|生机)技能\\s*.+$', fnc: 'unequipSkill' },
      ],
    });
  }

  async showProficiency(e) {
    if (!verc({ e })) return false;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    if (!(await existplayer(userId))) return false;

    const player = await Read_player(userId);
    const names = trackedGongfaNames(player);
    if (!names.length) return e.reply('你尚未掌握可参悟熟练度的功法。');

    const lines = ['【功法参悟】', `可分配功法感悟：${Math.max(0, Number(player.功法感悟值) || 0)}点`];
    for (const name of names) {
      const profile = getGongfaProficiencyProfile(player, name);
      lines.push(formatGongfaProficiency(player, name));
      lines.push(
        `触发×${profile.trigger.toFixed(2)}｜威能×${profile.combat.toFixed(2)}｜效果×${profile.numeric.toFixed(2)}｜今日+${getGongfaDailyGain(player, name)}/20`
      );
      if (name === '斗字秘') {
        lines.push(`天骄演法：${(getDouziMimicChance(player) * 100).toFixed(2)}%`);
      }
      if (name === '者字秘') {
        const rate = getVitalityRecoveryRate(player, name);
        const revive = profile.exp >= 1000 ? '每局可复生2次（第二次55%生命）' : '每局可复生1次';
        lines.push(`受击未死：概率恢复${Math.round(rate * 100)}%最大生命｜${revive}`);
      }
      if (name === '不灭经') {
        lines.push(`行动前：概率恢复${Math.round(getVitalityRecoveryRate(player, name) * 100)}%最大生命`);
      }
      const moves = data.jineng1?.find(skill => skill.name === name)?.招式;
      if (Array.isArray(moves) && moves.length) {
        const unlocked = moves.filter(move => profile.exp >= (Number(move.最低熟练度) || 0));
        const next = moves[unlocked.length];
        lines.push(next
          ? `已参悟${unlocked.length}/${moves.length}式｜下一式需${next.最低熟练度}熟练度`
          : `已参悟${moves.length}/${moves.length}式｜八式圆满`
        );
      }
    }
    return e.reply(lines.join('\n'));
  }

  async allocateInsight(e) {
    if (!verc({ e })) return false;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    if (!(await existplayer(userId))) return false;

    const match = e.msg.match(/^#分配功法感悟\s+(.+?)\*(\d+)$/);
    if (!match) return e.reply('用法：#分配功法感悟 功法名*数量');
    const [, name, amount] = match;
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      const result = allocateGongfaInsight(player, name.trim(), amount);
      if (result.reason === 'unlearned') return e.reply(`你尚未掌握【${name.trim()}】，无法参悟。`);
      if (result.reason === 'balance') return e.reply(`功法感悟不足：需要${amount}点，当前仅有${result.balance}点。`);
      if (result.reason === 'max') return e.reply(`【${name.trim()}】已经参悟圆满。`);
      if (!result.ok) return e.reply('分配数量必须是正整数。');

      await Write_player(userId, player);
      return e.reply([
        `你将${result.spent}点功法感悟注入【${name.trim()}】。`,
        `当前熟练度：${result.proficiency}/1000`,
        `剩余功法感悟：${result.balance}点`,
      ].join('\n'));
    });
  }

  #skillPools() {
    return {
      attack: data.jineng1,
      defense: data.jineng2,
      healing: data.jineng_heal,
      revival: data.jineng3,
    };
  }

  #normalizeType(type) {
    if (type === '攻击' || type === '防御') return type;
    return '生机';
  }

  async showCombatSkills(e) {
    if (!verc({ e })) return false;
    let userId = await channel(e.user_id.toString().replace('qg_', ''));
    if (!(await existplayer(userId))) return false;
    const player = await Read_player(userId);
    const pools = this.#skillPools();
    const panel = buildCombatSkillPanel(player, pools);
    const itemCount = panel.sections.reduce((total, section) => total + section.items.length, 0);
    const renderData = await new Show(e).get_combatSkillData({
      panel,
      multiPage: itemCount > 24,
      multiPageHeight: 4000,
    });
    try {
      const image = renderData.multiPage
        ? await puppeteer.screenshots('combat_skill', renderData)
        : await puppeteer.screenshot('combat_skill', renderData);
      if (image) return e.reply(image);
    } catch (error) {
      console.error('[战斗技能] HTML渲染失败，回退文字列表', error);
    }
    const lines = ['【战斗技能配置】'];
    for (const section of panel.sections) {
      lines.push(`${section.label}（${section.equippedCount}/${section.limit}）`);
      for (const item of section.items) {
        const triggers = item.triggers
          .map(row => `${row.when} ${row.chance}｜${row.effect}｜${row.multiplier}`)
          .join('；');
        lines.push(`${item.index}. ${item.equipped ? '[已装备]' : '[未装备]'}${item.name}｜熟练度${item.proficiency}/1000｜${triggers}`);
      }
    }
    return e.reply(lines.join('\n'));
  }

  async equipSkill(e) {
    if (!verc({ e })) return false;
    let userId = await channel(e.user_id.toString().replace('qg_', ''));
    if (!(await existplayer(userId))) return false;
    const match = e.msg.match(/^#(?:配置|装备)(攻击|防御|恢复|回血|复活|生机)技能\s*(.+)$/);
    if (!match) return false;
    const type = this.#normalizeType(match[1]);
    const selection = match[2].trim();
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      const resolved = resolveCombatSkillSelection(player, type, selection, this.#skillPools());
      if (!resolved.ok) {
        if (resolved.reason === 'index') {
          return e.reply(resolved.options.length
            ? `${type}技能序号无效，当前可选1-${resolved.options.length}。`
            : `你当前没有可配置的${type}技能。`
          );
        }
        return e.reply(`【${selection}】不是你已掌握的${type}技能。`);
      }
      const name = resolved.name;
      const result = equipCombatSkill(player, type, name, this.#skillPools());
      if (result.reason === 'unavailable') return e.reply(`【${name}】不是你已掌握的${type}技能。`);
      if (result.reason === 'equipped') return e.reply(`【${name}】已经装备。`);
      if (result.reason === 'full') return e.reply(`${type}技能槽已满（${result.limit}/${result.limit}），请先卸下一门。`);
      await Write_player(userId, player);
      const replaced = type === '生机' && result.replaced && result.replaced !== name
        ? `，替换【${result.replaced}】`
        : '';
      return e.reply(`已装备${type}技能【${name}】${replaced}。`);
    });
  }

  async unequipSkill(e) {
    if (!verc({ e })) return false;
    let userId = await channel(e.user_id.toString().replace('qg_', ''));
    if (!(await existplayer(userId))) return false;
    const match = e.msg.match(/^#卸下(攻击|防御|恢复|回血|复活|生机)技能\s*(.+)$/);
    if (!match) return false;
    const type = this.#normalizeType(match[1]);
    const selection = match[2].trim();
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      const resolved = resolveCombatSkillSelection(player, type, selection, this.#skillPools());
      if (!resolved.ok) {
        if (resolved.reason === 'index') {
          return e.reply(resolved.options.length
            ? `${type}技能序号无效，当前可选1-${resolved.options.length}。`
            : `你当前没有可卸下的${type}技能。`
          );
        }
        return e.reply(`【${selection}】不是你已掌握的${type}技能。`);
      }
      const name = resolved.name;
      const result = unequipCombatSkill(player, type, name, this.#skillPools());
      if (!result.ok) return e.reply(`【${name}】当前未装备在${type}槽。`);
      await Write_player(userId, player);
      return e.reply(`已卸下${type}技能【${name}】。`);
    });
  }
}
