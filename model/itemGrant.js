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
  re_najie_thing,
} from './xiuxian.js';
import { GrantStore } from './itemGrantStore.js';

let store = null;

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
  if (added === 0) return { ok: false, msg: '这件道具不能发放（唯一机缘类）。' };

  try {
    await re_najie_thing(order.targetQQ, order.itemName, order.itemClass, order.itemPinji || 0, 1);
  } catch (err) {
    // 锁失败不影响到账，但要在日志里看得见
    logger.warn(`[道具发单] 锁定失败 ${order.targetQQ} ${order.itemName}: ${err.message}`);
  }
  logger.info(`[道具发单] ${order.id} → ${order.targetQQ} ${order.itemName}x${order.qty} (${mint})`);
  return { ok: true };
}
