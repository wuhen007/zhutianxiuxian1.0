/**
 * 天骄夺宝 · 先天至宝争夺状态管理（纯逻辑，不负责 IO / 公告）
 *
 * 生态闭环：至宝择主之争 → 天骄夺冠 → mountTianjiaoTreasure 挂载至宝并增强战力 →
 * 玩家讨伐该天骄 → rollTianjiaoTreasureRecovery 判定夺回 → 转世时 clearTianjiaoTreasure 释放。
 */
import { INNATE_TREASURE_NAMES } from './innateTreasure.js';

/** 讨伐天骄夺回至宝的基础概率 */
export const TIANJIAO_TREASURE_RECOVERY_CHANCE = 0.8;

/**
 * 天骄夺得至宝：挂载 `当前先天至宝`（战斗引擎据此自动生效至宝被动/权柄，战力飙升）
 * 并记录夺宝凭证（含轮回世数，用于转世校验）。
 */
export function mountTianjiaoTreasure(tianjiao, treasureName, now = Date.now()) {
  if (!tianjiao || !INNATE_TREASURE_NAMES.includes(treasureName)) return null;
  tianjiao.当前先天至宝 = treasureName;
  tianjiao.天骄夺宝 = {
    至宝名: treasureName,
    夺得时间: now,
    轮回世数: Math.max(0, Math.floor(Number(tianjiao.轮回世数) || 0)),
  };
  return {
    tianjiao,
    treasureName,
    夺得时间: now,
    轮回世数: tianjiao.天骄夺宝.轮回世数,
  };
}

/** 清理天骄持有的至宝（转世释放 / 夺回成功后调用）。返回是否原本持宝。 */
export function clearTianjiaoTreasure(tianjiao) {
  if (!tianjiao) return false;
  const had = Boolean(tianjiao.天骄夺宝 || tianjiao.当前先天至宝);
  delete tianjiao.当前先天至宝;
  delete tianjiao.天骄夺宝;
  return had;
}

/**
 * 判定讨伐者能否从天骄手中夺回至宝。
 * - 天骄未持宝 → { ok: false, reason: 'no_claim' }
 * - 概率失败 → { ok: true, recovered: false, treasureName }（至宝随转世释放，等待再出世）
 * - 成功 → 清空天骄持宝状态并返回 { ok: true, recovered: true, treasureName }
 */
export function rollTianjiaoTreasureRecovery(tianjiao, random = Math.random, chance = TIANJIAO_TREASURE_RECOVERY_CHANCE) {
  const claim = tianjiao?.天骄夺宝;
  const treasureName = claim?.至宝名;
  if (!treasureName || tianjiao.当前先天至宝 !== treasureName) {
    return { ok: false, recovered: false, reason: 'no_claim' };
  }
  if (random() >= chance) {
    return { ok: true, recovered: false, treasureName, reason: 'failed' };
  }
  clearTianjiaoTreasure(tianjiao);
  return { ok: true, recovered: true, treasureName };
}
