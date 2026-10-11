import fs from 'fs';
import path from 'path';
import {
  __PATH,
  isNotNull,
  Read_player,
  Write_player,
  Read_najie,
  Write_najie,
} from './xiuxian.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../apps/SecretPlace/rebirthTransaction.js';
import { rebuildPlayerLucky, computePetStoredBonus } from './petLuckyCalc.js';

/**
 * 同步全体玩家的正确幸运值（#同步幸运 后端逻辑）
 *
 * 对每个玩家：
 *  1. 规范化 2931-2935 幸运仙宠（初始加成/每级增加 固定 0.002，与一键同步一致）
 *  2. 出战宠 + 纳戒宠的 加成 统一重算为「每级增加 × 等级」
 *  3. player.幸运 重算为「福源丹药力 + 出战宠加成 + 炼妖继承加成 + 灵根幸运」
 *  4. 仅当数值实际变化时才写盘；全程加锁 + 事务回滚
 *
 * @returns {Promise<{
 *   scanned: number, corrected: number, unchanged: number, failed: number,
 *   errors: Array<{qq: string, reason: string}>, details: Array<{qq: string, from: number, to: number}>
 * }>}
 */
export async function syncAllPlayerLucky() {
  const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
  const result = {
    scanned: files.length,
    corrected: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
    details: [],
  };

  for (const file of files) {
    const usr_qq = file.replace('.json', '');
    try {
      await withPlayerMutationLock(usr_qq, async () => {
        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
        transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
        try {
          // Read_player 会迁移旧档灵根幸运；用原落盘值比较，确保迁移真实持久化。
          const storedPlayer = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, `${usr_qq}.json`), 'utf8'));
          const player = await Read_player(usr_qq);
          if (!player || !player.id) return;
          const najie = await Read_najie(usr_qq);

          // —— 出战宠加成重算 ——
          let petChanged = false;
          const pet = player.仙宠;
          if (pet && pet.id) {
            if (pet.id > 2930 && pet.id < 2936) {
              pet.初始加成 = 0.002;
              pet.每级增加 = 0.002;
            }
            if (isNotNull(pet.初始加成) && isNotNull(pet.每级增加)) {
              const newBonus = computePetStoredBonus(pet);
              if (Math.abs((Number(pet.加成) || 0) - newBonus) > 1e-9) {
                pet.加成 = newBonus;
                petChanged = true;
              }
            }
          }

          // —— 纳戒宠加成重算 ——
          for (const j of najie.仙宠 || []) {
            if (j.id > 2930 && j.id < 2936) {
              j.初始加成 = 0.002;
              j.每级增加 = 0.002;
            }
            if (isNotNull(j.初始加成) && isNotNull(j.每级增加)) {
              const newBonus = computePetStoredBonus(j);
              if (Math.abs((Number(j.加成) || 0) - newBonus) > 1e-9) {
                j.加成 = newBonus;
              }
            }
          }

          // —— player.幸运 重算 ——
          const oldLucky = Number(storedPlayer.幸运) || 0;
          const correctLucky = rebuildPlayerLucky(player);
          const luckyChanged = Math.abs(oldLucky - correctLucky) > 1e-9;
          const rootChanged = (Number(storedPlayer._岁云幸运加成) || 0) !== (Number(player._岁云幸运加成) || 0);

          if (petChanged || luckyChanged || rootChanged) {
            await Write_najie(usr_qq, najie);
            await Write_player(usr_qq, player);
            transaction.commit();
            result.corrected++;
            result.details.push({ qq: usr_qq, from: oldLucky, to: correctLucky });
          } else {
            result.unchanged++;
          }
        } catch (err) {
          try {
            transaction.rollback();
          } catch (rollbackError) {
            console.error(`[同步幸运] 玩家 ${usr_qq} 回滚失败:`, rollbackError);
          }
          throw err;
        }
      });
    } catch (err) {
      result.failed++;
      result.errors.push({ qq: usr_qq, reason: err?.message || String(err) });
    }
  }
  return result;
}
