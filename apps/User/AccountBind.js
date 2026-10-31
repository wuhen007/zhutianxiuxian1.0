/**
 * 修仙身份绑定：把「官方群内身份（openid）」和「旧 QQ 号存档」关联起来
 *
 * 用法（必须在官方机器人的群聊里发，@ 它或直接发都可以）：
 *   #修仙绑定 504010020 无痕     绑定旧存档（QQ号 + 名号）
 *   #修仙绑定状态                看自己绑了谁
 *   #修仙解绑                    解除自己的绑定
 *
 * 为什么必须在官方通道：
 *   只有官方事件里才有 member_openid；协议号那边只有 QQ 号，拿不到 openid，
 *   所以协议号侧收到这条指令一律静默（返回 false），避免同一条消息被两个号各回一次。
 *
 * 为什么要求名号：
 *   只知道 QQ 号就能绑的话，群里任何人猜到号码都能冒领别人的存档。
 *   名号是玩家自己取的称号，只有本人和作者知道，用它做二次校验。
 */
import fs from 'node:fs';
import path from 'node:path';
import { plugin } from '../../api/api.js';
import cfg from '../../../../lib/config/config.js';
import { __PATH } from '../../model/xiuxian.js';
import {
  bindAccount,
  getBinding,
  getOpenidByQQ,
  unbindByOpenid,
  unbindByQQ,
  countBindings,
} from '../../model/identityMap.js';

/** 主人列表取不到时的兜底（作者号） */
const FALLBACK_AUTHOR = '504010020';
/** 官方 Bot 的 self_id 前缀，用来区分消息来自哪条通道 */
const OFFICIAL_PREFIX = 'qqbot-';
/** 单条回复的字数上限（超过 100 字会被长文本转图，绑定结果不适合变成图片） */
const MAX_REPLY = 100;

const isOfficial = e => String(e?.self_id ?? '').startsWith(OFFICIAL_PREFIX);

/**
 * NFKC 归一：把全角数字/字母/标点折叠成半角。
 * 玩家输入法切到全角时，`５０４０１００２０` 这种号码用 `\d` 是匹配不到的，
 * 名号也可能出现「ＡＢＣ」对不上存档里的「ABC」。
 */
const nfkc = value => String(value ?? '').normalize('NFKC').trim();

function readPlayer(qq) {
  try {
    const file = path.join(__PATH.player_path, `${qq}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export class AccountBind extends plugin {
  constructor() {
    super({
      name: '修仙身份绑定',
      dsc: '把官方群内身份与旧 QQ 存档绑定，用于切换官方通道后继承存档',
      event: 'message',
      priority: 560,
      rule: [
        { reg: '^#修仙绑定状态$', fnc: 'status' },
        { reg: '^#修仙解绑(\\s*\\d{5,12})?$', fnc: 'unbind' },
        { reg: '^#修仙绑定\\s*\\d{5,12}', fnc: 'bind' },
        { reg: '^#修仙绑定$', fnc: 'bind' },
      ],
    });
  }

  async reply(e, lines) {
    const text = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines);
    return e.reply(text.length > MAX_REPLY ? `${text.slice(0, MAX_REPLY)}…` : text);
  }

  async bind(e) {
    // 协议号通道拿不到 openid，静默让官方通道那条来处理
    if (!isOfficial(e)) return false;

    const openid = String(e.user_id || '');
    // 先做 NFKC：全角数字/字母折叠成半角，否则 `＃修仙绑定` 后面的全角号码解析不出来
    const raw = nfkc(e.msg);
    const matched = /^#修仙绑定\s*(\d{5,12})(?:\s+(.+))?$/.exec(raw);
    if (!matched) {
      return this.reply(e, [
        '【修仙绑定】用法：',
        '#修仙绑定 <旧QQ号> <名号>',
        '名号就是你在修仙里的称号，用来确认身份',
      ]);
    }

    const qq = matched[1];
    const name = String(matched[2] || '').trim();

    const player = readPlayer(qq);
    if (!player) {
      // 带了名号说明想继承旧存档，那就必须真的有存档，否则是号码填错了。
      if (name) {
        return this.reply(e, [
          `【修仙绑定】QQ ${qq} 上没有旧存档，名号无从校验。`,
          '如果只是想登记身份，去掉名号再发一次：',
          `#修仙绑定 ${qq}`,
        ]);
      }
      // 软绑定：只登记 openid ↔ QQ 的对应关系，不迁移任何存档。
      // channel() 会优先拿 QQ 号找存档、找不到自动退回 openid，所以现有角色不受影响。
      const reg = bindAccount(openid, qq, { groupId: String(e.group_id || '') });
      if (!reg.ok) {
        if (reg.error === 'QQ 已被其它群内身份绑定') {
          return this.reply(e, [`【修仙绑定】QQ ${qq} 已被别人登记。`, '如果这是你的号，请联系作者处理。']);
        }
        if (reg.error === '你已绑定另一个 QQ') {
          return this.reply(e, ['【修仙绑定】你已登记过另一个 QQ。', '要换绑请先发 #修仙解绑。']);
        }
        return this.reply(e, `【修仙绑定】${reg.error}`);
      }
      return this.reply(e, [
        `【修仙绑定】已登记 QQ ${qq}。`,
        '这个号上没有旧存档，所以没有数据需要继承，你当前的角色没有任何变化。',
      ]);
    }

    if (!name) {
      return this.reply(e, [
        `【修仙绑定】QQ ${qq} 的存档存在。`,
        '为防止绑错人，请带上名号再发一次：',
        `#修仙绑定 ${qq} <你的名号>`,
      ]);
    }

    const savedName = String(player.名号 || '').trim();
    // 名号按 NFKC 比较：全角「９５」和半角「95」视为同一个名号
    if (!savedName || nfkc(savedName) !== nfkc(name)) {
      return this.reply(e, [
        '【修仙绑定】名号对不上，绑定未完成。',
        '名号是你在修仙里的称号，记不清可以找作者核实。',
      ]);
    }

    const result = bindAccount(openid, qq, { name: savedName, groupId: String(e.group_id || '') });
    if (!result.ok) {
      if (result.error === 'QQ 已被其它群内身份绑定') {
        return this.reply(e, [`【修仙绑定】QQ ${qq} 已被别人绑定。`, '如果这是你的号，请联系作者处理。']);
      }
      if (result.error === '你已绑定另一个 QQ') {
        return this.reply(e, [`【修仙绑定】你已绑定 QQ ${result.current}。`, '要换绑请先发 #修仙解绑。']);
      }
      return this.reply(e, `【修仙绑定】${result.error}`);
    }

    return this.reply(e, [
      '【修仙绑定】成功',
      `QQ ${qq}（${savedName}）`,
      `已绑定 ${countBindings()} 人。切换官方通道后，进度会跟着这个号的存档走。`,
    ]);
  }

  async status(e) {
    const openid = String(e.user_id || '');

    if (isOfficial(e)) {
      const mine = getBinding(openid);
      return this.reply(e, [
        '【修仙绑定】你的群内身份',
        `openid：${openid}`,
        mine ? `已绑定 QQ ${mine.qq}（${mine.name || '未知'}）` : '尚未绑定旧 QQ 号',
        mine ? '' : '继承旧存档：\n#修仙绑定 <旧QQ号> <名号>',
      ]);
    }

    const bound = getOpenidByQQ(openid);
    return this.reply(e, [
      '【修仙绑定】当前是协议号通道',
      `QQ：${openid}`,
      bound ? '已关联官方群内身份' : '尚未关联官方群内身份',
      '关联请到群里 @官方机器人 发：\n#修仙绑定 <QQ号> <名号>',
    ]);
  }

  async unbind(e) {
    const raw = nfkc(e.msg);
    const targetQQ = /^#修仙解绑\s*(\d{5,12})$/.exec(raw)?.[1] || '';

    if (isOfficial(e)) {
      if (targetQQ) return this.reply(e, '【修仙解绑】官方通道只能解绑自己，直接发 #修仙解绑 即可。');
      const openid = String(e.user_id || '');
      const mine = getBinding(openid);
      if (!mine) return this.reply(e, '【修仙解绑】你还没有绑定过。');
      const result = unbindByOpenid(openid);
      return this.reply(
        e,
        result.ok ? `【修仙解绑】已解除与 QQ ${mine.qq} 的绑定。` : `【修仙解绑】失败：${result.error}`,
      );
    }

    // 协议号通道：主人可解绑指定 QQ
    if (!targetQQ) return this.reply(e, '【修仙解绑】协议号通道请指定号码：#修仙解绑 504010020');
    if (!this.isAuthor(String(e.user_id || ''))) return this.reply(e, '【修仙解绑】只有主人可以解绑别人。');
    const result = unbindByQQ(targetQQ);
    return this.reply(
      e,
      result.ok ? `【修仙解绑】已解除 QQ ${targetQQ} 的绑定。` : `【修仙解绑】失败：${result.error}`,
    );
  }

  isAuthor(userId) {
    const id = String(userId ?? '').trim();
    const set = new Set();
    const push = qq => {
      const v = String(qq ?? '').trim();
      if (/^\d{5,12}$/.test(v)) set.add(v);
    };
    try {
      for (const qq of cfg.masterQQ || []) push(qq);
      for (const list of Object.values(cfg.master || {})) for (const qq of list || []) push(qq);
    } catch {}
    if (!set.size) set.add(FALLBACK_AUTHOR);
    return set.has(id);
  }
}
