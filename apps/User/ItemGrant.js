/**
 * 道具发单与领取（公益版）
 *
 * 群主只发单，玩家本人 `#领取` 才真正进纳戒 —— 这样谁发的、谁领的、隔了多久都有记录，
 * 卖单（收钱才给发单）和代领都会留痕迹；领取时固定弹公益防诈提示。
 *
 * 指令：
 *   #派单 @某人 返命丹 [x2] 卡在筑基七天   群主/管理员，群里发
 *   #领取                                  玩家本人，私聊或群里都行
 *   #我的单                                查自己还有哪些待领
 *   #撤单 N-1A2B3C                         撤自己发出去还没被领的单
 *   #举报 谁收了你多少钱                    生成工单
 */

import { plugin } from '../../api/api.js';
import { grantStore, resolveItem, deliverToPlayer } from '../../model/itemGrant.js';
import { MAX_QTY } from '../../model/itemGrantStore.js';

const TIP_FULL =
  '本服公益运营，全程免费。机器人不会向你收费，也不会索要账号或验证码。\n' +
  '凡以「代领/包过/内部渠道/出售道具」收费的，都是骗子。\n' +
  '遇收费请截图发我，不必先付款。';
const TIP_SHORT = '公益免费，收费即骗子。遇收费请截图举报。';

/** 去掉 CQ 码和指令词，只留参数 */
function args(e, cmd) {
  return String(e.msg || '')
    .replace(/\[CQ:[^\]]*\]/g, ' ')
    .replace(new RegExp(`^#?${cmd}`), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ItemGrant extends plugin {
  constructor() {
    super({
      name: '道具发单',
      dsc: '群主发单、玩家本人领取、全链路留痕，附公益防诈提示',
      event: 'message',
      priority: 520,
      rule: [
        { reg: '^#派单\\s', fnc: 'grant' },
        { reg: '^#领取$', fnc: 'claim' },
        { reg: '^#我的单$', fnc: 'myOrders' },
        { reg: '^#撤单\\s', fnc: 'revoke' },
        { reg: '^#举报\\s', fnc: 'report' },
      ],
    });
  }

  isAdmin(e) {
    return Boolean(e.isMaster || e.member?.is_owner || e.member?.is_admin);
  }

  roleOf(e) {
    if (e.isMaster) return 'master';
    if (e.member?.is_owner) return 'owner';
    if (e.member?.is_admin) return 'admin';
    return 'member';
  }

  async grant(e) {
    if (!e.isGroup) return e.reply('请到群里发单，方便玩家核对。');
    if (!this.isAdmin(e)) return e.reply('只有群主 / 管理员可以发单。');

    const target = e.at;
    if (!target) return e.reply('要 @ 一位玩家。格式：#派单 @某人 返命丹 卡在筑基七天');

    // 参数：道具名 [xN] 理由
    const parts = args(e, '发单').split(' ').filter(Boolean);
    let itemName = parts.shift() || '';
    let qty = 1;
    const inline = /^(.+?)[x×*](\d+)$/.exec(itemName);
    if (inline) {
      itemName = inline[1];
      qty = Number(inline[2]);
    } else if (/^[x×*]\d+$/.test(parts[0] || '')) {
      qty = Number(parts.shift().slice(1));
    }
    qty = Math.min(Math.max(qty || 1, 1), MAX_QTY);
    const reason = parts.join(' ').trim() || '未填写';
    if (!itemName) return e.reply('格式：#派单 @某人 道具名 [x数量] 理由');

    const found = await resolveItem(itemName);
    if (!found.ok) return e.reply(found.msg);

    const r = await grantStore().order({
      groupId: e.group_id,
      grantedBy: e.user_id,
      role: this.roleOf(e),
      targetQQ: target,
      itemName: found.item.name,
      itemClass: found.item.class,
      itemPinji: found.item.pinji || 0,
      qty,
      reason,
    });
    if (!r.ok) return e.reply(r.msg);

    const o = r.order;
    return e.reply(
      [
        segment.at(target),
        ` 群主给你发了：${o.itemName} ×${o.qty}（${o.id}）`,
        `理由：${o.reason}`,
        `请本人私聊我发「#领取」到账，7 天内有效。`,
        '本服公益免费，收费即骗子——道具本来就该免费给你。',
      ].join('\n')
    );
  }

  async claim(e) {
    // 领取一律走私聊：群里发货会刷屏，流水也不该被围观
    if (e.isGroup) {
      return e.reply('领取要私聊我，群里不发货。\n私聊发「#领取」就行，别人代不了。');
    }
    const r = await grantStore().claim(e.user_id, deliverToPlayer);
    if (!r.ok) return e.reply(r.msg);

    const ok = r.list.filter(x => !x.err);
    const bad = r.list.filter(x => x.err);
    const lines = ok.map(x => `【已到账】${x.name} ×${x.qty}（流水 ${x.mint}，已锁定自用）`);

    if (lines.length) await e.reply(lines.join('\n'));
    if (bad.length) {
      await e.reply(bad.map(x => `「${x.name}」没领到：${x.err}`).join('\n'));
    }
    if (lines.length) {
      await e.reply(r.first ? TIP_FULL : TIP_SHORT);
    }
  }

  async myOrders(e) {
    const list = grantStore().pendingOf(e.user_id);
    if (!list.length) return e.reply('当前没有待领取的道具。');
    const lines = list
      .slice(0, 5)
      .map(x => `${x.itemName} ×${x.qty}（${x.id}，群 ${x.groupId || '-'} 发的）`);
    return e.reply(['待领取：', ...lines, '私聊我发「#领取」到账。'].join('\n'));
  }

  async revoke(e) {
    const id = args(e, '撤单').toUpperCase();
    if (!/^N-[0-9A-F]{6}$/.test(id)) return e.reply('格式：#撤单 N-1A2B3C');
    const r = await grantStore().revoke(id, e.user_id, this.roleOf(e));
    return e.reply(r.msg);
  }

  async report(e) {
    const text = args(e, '举报');
    if (!text) return e.reply('把情况写上：谁、收了多少、什么时候。#举报 张三收 20 元才给道具');
    const id = await grantStore().report(e.user_id, text);
    return e.reply(`已收到，工单 ${id}，48 小时内处理。\n请勿付款——本服道具全部免费。`);
  }
}
