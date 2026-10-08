import { randomUUID } from 'node:crypto';
import { plugin } from '../api/api.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
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
  RELIC_FRAGMENT_RULES,
  MAX_RELIC_BAG_SIZE,
  RELIC_PARTS,
  RELIC_QUALITIES,
  RELIC_SETS,
  addRelicToBag,
  calculateRelicEffects,
  createRelic,
  dismantleRelics,
  engraveRelic,
  expandRelicSlot,
  formatRelicAffix,
  formatRelicEffects,
  normalizeRelicState,
  removeEngravedRelic,
  synthesizeRelics,
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
      dsc: '遗珍铭刻、共鸣、分解与定向合成',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#(?:诸天遗珍|我的遗珍)$', fnc: 'showRelics' },
        { reg: '^#遗珍背包$', fnc: 'showBag' },
        { reg: '^#遗珍图鉴$', fnc: 'showAtlas' },
        { reg: '^#遗珍碎片$', fnc: 'showFragments' },
        { reg: '^#(?:分解遗珍|批量分解遗珍)(?:\\*.*)?$', fnc: 'previewDismantle' },
        { reg: '^#确认分解遗珍(?:\\*.*)?$', fnc: 'confirmDismantle' },
        { reg: '^#取消分解遗珍$', fnc: 'cancelDismantle' },
        { reg: '^#合成遗珍(?:\\*.*)?$', fnc: 'synthesize' },
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

  async withRelicLock(e, action, target) {
    const qq = target ?? await this.playerId(e);
    if (!await existplayer(qq)) return e.reply(`玩家${qq}尚未创建角色。`);
    try {
      const message = await withPlayerMutationLock(qq, async () => {
        const equipment = await Read_equipment(qq);
        equipment.遗珍 = normalizeRelicState(equipment.遗珍);
        return action({ qq, equipment });
      });
      return e.reply(message);
    } catch (error) {
      return e.reply(error.message);
    }
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
    const { 背包: bag, 碎片 } = context.equipment.遗珍;
    const lines = [`【遗珍背包 ${bag.length}/${MAX_RELIC_BAG_SIZE}】`, `遗珍碎片：${碎片}`];
    if (bag.length === 0) lines.push('当前没有未铭刻的遗珍。');
    bag.forEach((relic, index) => lines.push(`${index + 1}. ${relicLine(relic)}`));
    lines.push('铭刻：#铭刻遗珍*编号*武器/护具/法宝*1/2');
    lines.push('分解预览：#分解遗珍*编号｜#批量分解遗珍*品质');
    lines.push('定向合成：#合成遗珍*套装*品质*数量（数量默认1）');
    lines.push('碎片与兑换规则：#遗珍碎片');
    return e.reply(lines.join('\n'));
  }

  async showFragments(e) {
    const context = await this.context(e);
    if (!context) return false;
    const lines = [
      '【遗珍碎片】',
      `当前持有：${context.equipment.遗珍.碎片}`,
      '碎片保存在遗珍背包，不占格子；仅用于定向合成。',
      '品质｜每件分解所得｜每件合成消耗',
      ...Object.entries(RELIC_FRAGMENT_RULES).map(([quality, rule]) =>
        `${quality}｜${rule.salvage}｜${rule.synthesis}`),
      '分解预览：#分解遗珍*编号｜#批量分解遗珍*品质',
      '批量仅选指定品质；确认后永久消耗选中遗珍，已铭刻的遗珍不参与。',
      '定向合成：#合成遗珍*套装*品质*数量（数量默认1）',
      `套装：${Object.keys(RELIC_SETS).join('、')}`,
      '示例：#合成遗珍*荒古战血*至圣*3',
      '套装和品质固定，副词条随机；同套三件分别铭刻到武器、护具、法宝即可共鸣。',
    ];
    return e.reply(lines.join('\n'));
  }

  pendingDismantleKey(qq) {
    return `xiuxian:relic:dismantle:${qq}`;
  }

  async previewDismantle(e) {
    const match = e.msg.match(/^#(分解遗珍|批量分解遗珍)\*([^*]+)$/);
    if (!match) return e.reply('用法：#分解遗珍*编号 或 #批量分解遗珍*品质');
    return this.withRelicLock(e, async ({ qq, equipment }) => {
      const selector = match[2].trim();
      const bag = equipment.遗珍.背包;
      let selected;
      if (match[1] === '批量分解遗珍') {
        if (!Object.hasOwn(RELIC_QUALITIES, selector)) throw new Error('品质请选择：凡耀、灵玄、至圣、大道、超脱。');
        selected = bag.filter(relic => relic.品质 === selector);
        if (!selected.length) return `遗珍背包中没有【${selector}】品质的遗珍。`;
      } else {
        const index = Number(selector) - 1;
        if (!/^\d+$/.test(selector) || !Number.isSafeInteger(index) || !bag[index]) {
          throw new Error('遗珍背包中没有这个编号，请先查看 #遗珍背包。');
        }
        selected = [bag[index]];
      }
      const result = dismantleRelics(equipment.遗珍, selected.map(relic => relic.id));
      const token = randomUUID().slice(0, 8);
      await redis.set(this.pendingDismantleKey(qq), JSON.stringify({
        token,
        expiresAt: Date.now() + 120_000,
        relics: result.relics,
      }), { EX: 120 });
      const lines = [
        '【遗珍分解预览】',
        ...result.relics.slice(0, 10).map(relicLine),
      ];
      if (result.relics.length > 10) lines.push(`另有${result.relics.length - 10}件同品质遗珍。`);
      lines.push(
        `共${result.relics.length}件，分解获得遗珍碎片${result.fragments}，当前碎片${equipment.遗珍.碎片}。`,
        '确认后永久消耗以上遗珍；仅处理本次预览选中项，已铭刻遗珍不参与。',
        `请在120秒内发送 #确认分解遗珍*${token}`,
        '取消：#取消分解遗珍',
      );
      return lines.join('\n');
    });
  }

  async confirmDismantle(e) {
    const token = e.msg.match(/^#确认分解遗珍\*([a-f0-9]{8})$/)?.[1];
    if (!token) return e.reply('请先预览分解，并使用预览中的确认指令。');
    return this.withRelicLock(e, async ({ qq, equipment }) => {
      const key = this.pendingDismantleKey(qq);
      const raw = await redis.get(key);
      if (!raw) return '分解预览已过期或已取消，请重新预览。';
      const pending = JSON.parse(raw);
      if (!Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now()) {
        await redis.del(key);
        return '分解预览已过期，请重新预览。';
      }
      if (pending.token !== token) return '确认令牌已失效，请使用最新预览中的确认指令。';
      const current = new Map(equipment.遗珍.背包.map(relic => [relic.id, relic]));
      if (!Array.isArray(pending.relics) || pending.relics.some(relic =>
        JSON.stringify(current.get(relic.id)) !== JSON.stringify(relic))) {
        await redis.del(key);
        return '待分解遗珍已变动或已铭刻，本次未分解，请重新预览。';
      }
      const result = dismantleRelics(equipment.遗珍, pending.relics.map(relic => relic.id));
      // 先撤销确认令牌；存档失败时重新预览，避免同一确认重复执行。
      await redis.del(key);
      equipment.遗珍 = result.state;
      await Write_equipment(qq, equipment);
      return `已分解${result.relics.length}件遗珍，获得遗珍碎片${result.fragments}，现有碎片${result.state.碎片}。\n背包：${result.state.背包.length}/${MAX_RELIC_BAG_SIZE}，剩余编号已更新，请查看 #遗珍背包。`;
    });
  }

  async cancelDismantle(e) {
    return this.withRelicLock(e, async ({ qq }) => {
      await redis.del(this.pendingDismantleKey(qq));
      return '已取消遗珍分解预览。';
    });
  }

  async synthesize(e) {
    const match = e.msg.match(/^#合成遗珍\*([^*]+)\*([^*]+)(?:\*(\d+))?$/);
    if (!match) return e.reply('用法：#合成遗珍*套装*品质*数量（数量默认1）；兑换规则见 #遗珍碎片。');
    return this.withRelicLock(e, async ({ qq, equipment }) => {
      const result = synthesizeRelics(equipment.遗珍, {
        setName: match[1].trim(),
        quality: match[2].trim(),
        count: Number(match[3] ?? 1),
      });
      const start = equipment.遗珍.背包.length + 1;
      equipment.遗珍 = result.state;
      await Write_equipment(qq, equipment);
      return [
        `已合成【${match[2].trim()}·${match[1].trim()}】遗珍${result.relics.length}件。`,
        `消耗遗珍碎片${result.cost}，剩余${result.state.碎片}。`,
        `背包编号：${start}${result.relics.length > 1 ? `～${result.state.背包.length}` : ''}，副词条已随机生成。`,
        '查看：#遗珍背包｜铭刻：#铭刻遗珍*编号*武器/护具/法宝*1/2',
      ].join('\n');
    });
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
    lines.push('获得途径：位面鱼王等奖励，或消耗遗珍碎片定向合成。');
    lines.push('分解与合成规则：#遗珍碎片');
    lines.push(`第二铭刻位：消耗【${RELIC_EXPANSION_ITEM}】，每个部位最多拓展一次。`);
    return e.reply(lines.join('\n'));
  }

  async engrave(e) {
    const match = e.msg.match(/^#铭刻遗珍\*(\d+)\*(武器|护具|法宝)(?:\*([12]))?$/);
    return this.withRelicLock(e, async context => {
      const result = engraveRelic(
        context.equipment.遗珍,
        Number(match[1]),
        match[2],
        Number(match[3] || 1),
      );
      context.equipment.遗珍 = result.state;
      await Write_equipment(context.qq, context.equipment);
      const replaced = result.replaced ? `，原有【${result.replaced.品质}·${result.replaced.套装}】已放回背包` : '';
      return `已将【${result.relic.品质}·${result.relic.套装}】铭刻至${match[2]}第${match[3] || 1}位${replaced}。`;
    });
  }

  async remove(e) {
    const match = e.msg.match(/^#卸下遗珍\*(武器|护具|法宝)(?:\*([12]))?$/);
    return this.withRelicLock(e, async context => {
      const result = removeEngravedRelic(context.equipment.遗珍, match[1], Number(match[2] || 1));
      context.equipment.遗珍 = result.state;
      await Write_equipment(context.qq, context.equipment);
      return `已卸下【${result.relic.品质}·${result.relic.套装}】，遗珍已放回背包。`;
    });
  }

  async expand(e) {
    const part = e.msg.match(/^#拓展遗珍槽\*(武器|护具|法宝)$/)?.[1];
    return this.withRelicLock(e, async context => {
      const next = expandRelicSlot(context.equipment.遗珍, part);
      if (Number(await exist_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具')) < 1) {
        return `你的纳戒中没有【${RELIC_EXPANSION_ITEM}】。`;
      }
      await Add_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具', -1);
      try {
        context.equipment.遗珍 = next;
        await Write_equipment(context.qq, context.equipment);
      } catch (error) {
        await Add_najie_thing(context.qq, RELIC_EXPANSION_ITEM, '道具', 1);
        throw error;
      }
      return `【界纹拓印】${part}的第二铭刻位已经开启。`;
    });
  }

  async grant(e) {
    const args = e.msg.replace(/^#发放遗珍\*/, '').split('*').map(value => value.trim());
    let target = await this.playerId(e);
    if (/^\d+$/.test(args[0]) && args.length >= 3) target = args.shift();
    const [quality, setName] = args;
    return this.withRelicLock(e, async ({ equipment }) => {
      const relic = createRelic({ quality, setName });
      equipment.遗珍 = addRelicToBag(equipment.遗珍, relic);
      await Write_equipment(target, equipment);
      const index = equipment.遗珍.背包.length;
      return `已向玩家${target}发放【${quality}·${setName}】遗珍，背包编号${index}。`;
    }, target);
  }
}
