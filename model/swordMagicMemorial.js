// 飞升信物的纳戒层发放：独立模块，避免 model/xiuxian.js ↔ model/swordMagic.js 循环依赖。
import { Read_player, Write_player, Add_najie_thing } from './xiuxian.js';
import { getPendingMemorial, clearPendingMemorial } from './swordMagic.js';

/**
 * 把待发信物送进纳戒并清空标记。
 * 幂等三层：swordMagic 的 revision 写保护、纳戒 _rewardClaims 的 idempotencyKey、标记清空后才落盘。
 * 任一步失败都保留标记，下一次指令或后台任务会补发，不会重复发放。
 */
export async function deliverMemorial(id, player) {
  const pending = getPendingMemorial(player);
  if (!pending) return '';
  try {
    await Add_najie_thing(id, pending.name, '装备', 1, pending.pinji, 1,
      { idempotencyKey: `sword-magic-memorial:${pending.ending}` });
  } catch (error) {
    console.warn(`[剑与魔法] 玩家${id}信物入库失败：${error.message}`);
    return `【飞升赠礼】${pending.name} 入库未确认，下次发送 #剑与魔法 状态 会自动补发。`;
  }
  // 重新读取最新存档再清标记，避免覆盖并发写入。
  const latest = await Read_player(id);
  if (!clearPendingMemorial(latest)) return `【飞升赠礼】${pending.name} 已入纳戒（绑定本人，不可交易）。`;
  try {
    await Write_player(id, latest);
  } catch (error) {
    console.warn(`[剑与魔法] 玩家${id}信物标记清理失败：${error.message}`);
  }
  return `【飞升赠礼】${pending.name} 已入纳戒（绑定本人，不可交易）。`;
}
