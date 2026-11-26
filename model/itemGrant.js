/**
 * 把发单账本接到游戏存档上。
 * 账本逻辑在 itemGrantStore.js，这里只负责「查道具定义」和「真的放进纳戒」。
 */

import path from 'node:path';
import {
  __PATH,
  Add_najie_thing,
  Read_player,
  foundthing,
  isXiuxianAdmin,
  re_najie_thing,
} from './xiuxian.js';
import { GrantStore } from './itemGrantStore.js';

let store = null;

/** 老发放指令被拦下来时回的这一份说明（唯一文案源，别在别处再抄一遍） */
export const GRANT_GUIDE = [
  '【发放方式已变更】道具不再直接到账，改为「群主派单 + 玩家本人领取」。',
  '',
  '群主发单（群里发，要 @ 人）：',
  '#派单 @某人 返命丹 卡在筑基七天',
  '#派单 @某人 洗髓丹 x2 缺材料',
  '数量最多 3 件，每人每周 10 单，理由必填且玩家可见。',
  '',
  '玩家领取（必须私聊机器人，群里发不处理）：',
  '#领取              本人领取，一次结清名下所有待领单',
  '#我的单            查还有哪些没领（7 天不领自动作废）',
  '#撤单 N-1A2B3C     撤未领取的单，额度退回',
  '',
  '派单只是生成待领单，玩家不领就不算发放，别对玩家说“已经给了”。',
  '领取后道具自动锁定，不能出售、赠送、交换，只能自己用。',
].join('\n');

/**
 * 老的 #发 / #全体发 / #发拉新奖励 一律不再发放，只回说明。
 * 普通玩家照旧静默（和改造前一致），只有原本有权限的人才会看到这段。
 * @returns {boolean} true 表示已处理，调用方应 return false 中断
 */
export function deprecatedGrantNotice(e) {
  try {
    if (!isXiuxianAdmin(e)) return false;
  } catch {
    return false;
  }
  e.reply(GRANT_GUIDE);
  return true;
}

export function grantStore() {
  if (!store) store = new GrantStore(path.join(__PATH.data_path, 'item_grant.json'));
  return store;
}

/**
 * 发单前查道具是否真实存在，拿到 class/pinji 存进单子，
 * 领取时才能准确入纳戒（不同类目的纳戒 key 不同）。
 */
export async function resolveItem(itemName) {
  let item;
  try {
    item = await foundthing(itemName, { readOnlyLookup: true });
  } catch {
    item = null;
  }
  if (!item || !item.name) return { ok: false, msg: `没有「${itemName}」这个道具，名字要对上。` };
  if (!item.class) return { ok: false, msg: `「${item.name}」没有类目，没法放进纳戒。` };
  return { ok: true, item };
}

/** 真正入账：进纳戒 + 上锁（锁定后不能出售/交换/转移，等于只能自用） */
export async function deliverToPlayer(order, mint) {
  const player = await Read_player(order.targetQQ);
  if (!player) return { ok: false, msg: '对方还没有修仙存档，先让他发一次修仙指令。' };

  const added = await Add_najie_thing(
    order.targetQQ,
    order.itemName,
    order.itemClass,
    order.qty,
    order.itemPinji || 0
  );
  // 返回 0 表示这件东西压根不能发放（唯一机缘类），重试多少次都一样，标成永久失败让账本撤单
  if (added === 0) return { ok: false, msg: '这件道具不能发放（唯一机缘类），已通知群主改单。', permanent: true };

  try {
    await re_najie_thing(order.targetQQ, order.itemName, order.itemClass, order.itemPinji || 0, 1);
  } catch (err) {
    // 锁失败不影响到账，但要在日志里看得见
    logger.warn(`[道具发单] 锁定失败 ${order.targetQQ} ${order.itemName}: ${err.message}`);
  }
  logger.info(`[道具发单] ${order.id} → ${order.targetQQ} ${order.itemName}x${order.qty} (${mint})`);
  return { ok: true };
}
