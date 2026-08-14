import { plugin } from '../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Write_equipment,
  channel,
  exist_najie_thing,
  existplayer,
} from '../model/xiuxian.js';
import {
  RELIC_AFFIXES,
  RELIC_EXPANSION_ITEM,
  RELIC_PARTS,
  RELIC_QUALITIES,
  RELIC_SETS,
  addRelicToBag,
  calculateRelicEffects,
  createRelic,
  engraveRelic,
  expandRelicSlot,
  formatRelicAffix,
  formatRelicEffects,
  normalizeRelicState,
  removeEngravedRelic,
} from '../model/relicSystem.js';

function relicLine(relic) {
  if (!relic) return '空';
  const affixes = relic.副词条.map(formatRelicAffix).filter(Boolean).join('、');
  return `【${relic.品质}】${relic.套装}（${affixes || '无副词条'}）`;
}

export class RelicSystem extends plugin {
  constructor() {
    super({
      name: '诸天遗珍',
      dsc: '遗珍铭刻、共鸣与属性管理',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#(?:诸天遗珍|我的遗珍)$', fnc: 'showRelics' },
        { reg: '^#遗珍背包$', fnc: 'showBag' },
        { reg: '^#遗珍图鉴$', fnc: 'showAtlas' },
        { reg: '^#铭刻遗珍\\*\\d+\\*(?:武器|护具|法宝)(?:\\*[12])?$', fnc: 'engrave' },
        { reg: '^#卸下遗珍\\*(?:武器|护具|法宝)(?:\\*[12])?$', fnc: 'remove' },
        { reg: '^#拓展遗珍槽\\*(?:武器|护具|法宝)$', fnc: 'expand' },
        {
          reg: '^#发放遗珍(?:\\*\\d+)?\\*(?:凡耀|灵玄|至圣|大道|超脱)\\*.+$',
          fnc: 'grant',
          permission: 'master',
        },
      ],
    });
  }

  async playerId(e) {
    return channel(String(e.user_id).replace('qg_', ''));
  }

  async context(e) {
    const qq = await this.playerId(e);
    if (!await existplayer(qq)) {
      await e.reply('你还没有踏入仙途。');
      return null;
    }
    const equipment = await Read_equipment(qq);
    equipment.遗珍 = normalizeRelicState(equipment.遗珍);
    return { qq, equipment };
  }

  async showRelics(e) {
    const context = await this.context(e);
    if (!context) return false;
    const { equipment } = context;
    const state = equipment.遗珍;
    const summary = calculateRelicEffects(state);
    const lines = ['【诸天遗珍·铭刻】'];
    for (const part of RELIC_PARTS) {
      const second = state.拓展[part] ? relicLine(state.铭刻[part][1]) : '未拓展';
      lines.push(`${part}① ${relicLine(state.铭刻[part][0])}`);
      lines.push(`${part}② ${second}`);
    }
    lines.push(`道韵共鸣：${summary.resonances.join('、') || '无'}`);
    const effectLines = formatRelicEffects(summary.effects);
    lines.push(`遗珍总效：${effectLines.join('、') || '无'}`);
    lines.push('操作：#遗珍背包｜#铭刻遗珍*编号*部位*铭刻位');
    return e.reply(lines.join('\n'));
  }

  async showBag(e) {
    const context = await this.context(e);
    if (!context) return false;
    const bag = context.equipment.遗珍.背包;
    if (bag.length === 0) return e.reply('【遗珍背包】\n当前没有未铭刻的遗珍。');
    const lines = [`【遗珍背包 ${bag.length}/200】`];
    bag.forEach((relic, index) => lines.push(`${index + 1}. ${relicLine(relic)}`));
    lines.push('铭刻：#铭刻遗珍*编号*武器/护具/法宝*1/2');
    return e.reply(lines.join('\n'));
  }

  async showAtlas(e) {
    const qualityText = Object.entries(RELIC_QUALITIES)
      .map(([name, config]) => `${name}${config.affixCount}词条`)
      .join('、');
    const lines = [
      '【诸天遗珍图鉴】',
      `品质：${qualityText}`,
      `副词条：${Object.entries(RELIC_AFFIXES).map(([name, config]) => `${name}·${config.field}`).join('、')}`,
      '',
      '三件共鸣必须由武器、护具、法宝各承载一件同套遗珍：',
    ];
    for (const [name, set] of Object.entries(RELIC_SETS)) {
      lines.push(`【${name}】${set.description}`);
      lines.push(`共鸣：${formatRelicEffects(set.effects).join('、')}`);
    }
    lines.push('获得途径：击杀位面鱼王，遗珍会随机分配给一名讨伐队员。');
    lines.push(`第二铭刻位：消耗【${RELIC_EXPANSION_ITEM}】，每个部位最多拓展一次。`);
    return e.reply(lines.join('\n'));
  }

  async engrave(e) {
    const context = await this.context(e);
    if (!context) return false;
    const match = e.msg.match(/^#铭刻遗珍\*(\d+)\*(武器|护具|法宝)(?:\*([12]))?$/);
    try {
      const result = engraveRelic(
        context.equipment.遗珍,
        Number(match[1]),
        match[2],
        Number(match[3] || 1),
      );
      context.equipment.遗珍 = result.state;
      await Write_equipment(context.qq, context.equipment);
      const replaced = result.replaced ? `，原有【${result.replaced.品质}·${result.replaced.套装}】已放回背包` : '';
      return e.reply(`已将【${result.relic.品质}·${result.relic.套装}】铭刻至${match[2]}第${match[3] || 1}位${replaced}。`);
    } catch (error) {
      return e.reply(error.message);
    }
  }

  async remove(e) {
    const context = await this.context(e);
    if (!context) return false;
    const match = e.msg.match(/^#卸下遗珍\*(武器|护具|法宝)(?:\*([12]))?$/);
    try {
      const result = removeEngravedRelic(context.equipment.遗珍, match[1], Number(match[2] || 1));
      context.equipment.遗珍 = result.state;
      await Write_equipment(context.qq, context.equipment);
      return e.reply(`已卸下【${result.relic.品质}·${result.relic.套装}】，遗珍已放回背包。`);
    } catch (error) {
      return e.reply(error.message);
    }
  }

  async expand(e) {
    const context = await this.context(e);
    if (!context) return false;
    const part = e.msg.match(/^#拓展遗珍槽\*(武器|护具|法宝)$/)?.[1];
    try {
      const next = expandRelicSlot(context.equipment.遗珍, part);
      if (Number(await exist_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具')) < 1) {
        return e.reply(`你的纳戒中没有【${RELIC_EXPANSION_ITEM}】。`);
      }
      await Add_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具', -1);
      try {
        context.equipment.遗珍 = next;
        await Write_equipment(context.qq, context.equipment);
      } catch (error) {
        await Add_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具', 1);
        throw error;
      }
      return e.reply(`【界纹拓印】${part}的第二铭刻位已经开启。`);
    } catch (error) {
      return e.reply(error.message);
    }
  }

  async grant(e) {
    const args = e.msg.replace(/^#发放遗珍\*/, '').split('*').map(value => value.trim());
    let target = await this.playerId(e);
    if (/^\d+$/.test(args[0]) && args.length >= 3) target = args.shift();
    const [quality, setName] = args;
    if (!await existplayer(target)) return e.reply(`玩家${target}尚未创建角色。`);
    try {
      const equipment = await Read_equipment(target);
      const relic = createRelic({ quality, setName });
      equipment.遗珍 = addRelicToBag(equipment.遗珍, relic);
      await Write_equipment(target, equipment);
      const index = equipment.遗珍.背包.length;
      return e.reply(`已向玩家${target}发放【${quality}·${setName}】遗珍，背包编号${index}。`);
    } catch (error) {
      return e.reply(error.message);
    }
  }
}
