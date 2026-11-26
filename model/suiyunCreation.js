import { createRequire } from 'node:module';
import { isInnateTreasureName } from './innateTreasure.js';
import { isDaoTreasureItem } from './daoTreasure.js';
import { findXianguTopSeed } from '../apps/SecretPlace/xianguSeed.js';

export const SUIYUN_CREATION_COST = 10;
const xianguConfig = createRequire(import.meta.url)('../data/xianguSecretPlace.json');
const CLASSES = new Set(['装备', '仙宠', '宝石', '丹药', '道具', '道种', '功法', '草药', '材料', '食材', '盒子', '仙宠口粮']);
const UNIQUE_NAMES = new Set([
  '岁云的残念', '岁云残念', '无上天阙枝', '圣法碎片', '神秘石罐', '花粉路祖种',
  '永恒仙图', '虚天之主传承', '玉石匣', '玉石匣·仙王经文', '仙王经文', '大罗剑胎', '帝血', '一滴帝血',
]);

/** 稀有度不参与造物资格；仅保留既有造物禁令、唯一归属及可入库类别。 */
export function getSuiyunCreationRestriction(item) {
  if (!item || typeof item.name !== 'string' || !item.name.trim()) return '未找到该物品，请使用完整物品名。';
  if (!CLASSES.has(item.class)) return '该条目不是可直接放入纳戒的物品。';
  if (item.不可创造) return `【${item.name}】设有专属获取规则，岁云造物仍保留该限制。`;
  if (item.全服唯一 || item.全时间线唯一 || item.唯一灵根
    || item.先天至宝本体 || item.永恒仙图本体 || isDaoTreasureItem(item)
    || item.品阶 === '先天至宝' || isInnateTreasureName(item.name)
    || UNIQUE_NAMES.has(item.name) || /唯一/.test(String(item.type || ''))
    || findXianguTopSeed(xianguConfig, item.name)) {
    return `【${item.name}】具有唯一归属，请沿用原有获取与认主途径。`;
  }
  if (item.绑定者 || item.author_name) return '已有器主烙印的物品请沿用原有归属。';
  return '';
}
