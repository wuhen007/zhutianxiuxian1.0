// 飞升赠礼的纳戒层发放：独立模块，避免 model/xiuxian.js ↔ model/swordMagic.js 循环依赖。
import { Read_player, Write_player, Add_najie_thing } from './xiuxian.js';
import { getPendingMemorial, clearPendingMemorial, getGraduationPet } from './swordMagic.js';

/**
 * 把毕业赠礼（终局信物 + 际遇仙宠）送进纳戒并清空标记。
 * 幂等三层：swordMagic 的 revision 写保护、纳戒 _rewardClaims 的 idempotencyKey、标记清空后才落盘。
 * 两件赠礼各有独立回执键：其中一件失败时另一件不会重复发放，下一轮只补发缺的那件。
 * 任一步失败都保留标记，下一次指令或后台任务会补发，不会重复发放。
 */
export async function deliverMemorial(id, player) {
  const pending = getPendingMemorial(player);
  if (!pending) return '';
  const state = player.剑与魔法;
  const pet = getGraduationPet(state);
  const granted = [], deferred = [];
  const grant = async (name, thingClass, pinji, key) => {
    try {
      await Add_najie_thing(id, name, thingClass, 1, pinji, 1, { idempotencyKey: key });
      granted.push(name);
    } catch (error) {
      console.warn(`[剑与魔法] 玩家${id}赠礼入库失败（${name}）：${error.message}`);
      deferred.push(name);
    }
  };
  await grant(pending.name, '装备', pending.pinji, `sword-magic-memorial:${pending.ending}`);
  await grant(pet.name, '仙宠', undefined, `sword-magic-memorial:pet:${pet.id}`);
  if (deferred.length) {
    return `【飞升赠礼】${deferred.join('、')} 入库未确认，下次发送 #剑与魔法 状态 会自动补发。`;
  }
  // 重新读取最新存档再清标记，避免覆盖并发写入。
  const latest = await Read_player(id);
  const detail = `【飞升赠礼】${pending.name} 与 ${pet.name} 已入纳戒（绑定本人，不可交易）。`;
  if (!clearPendingMemorial(latest)) return detail;
  try {
    await Write_player(id, latest);
  } catch (error) {
    console.warn(`[剑与魔法] 玩家${id}赠礼标记清理失败：${error.message}`);
  }
  return detail;
}
