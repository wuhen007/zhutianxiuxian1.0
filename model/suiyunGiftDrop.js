import { multiplySuiyunLoot } from './suiyunLoot.js';

export const SUIYUN_GIFT_HIDDEN_CHANCE = .5;
// 复用现有普通稀有奇遇物品；唯一传承与至宝仍从原获取途径发放。
export const SUIYUN_GIFT_HIDDEN_ITEMS = Object.freeze([
  { name: '旧神印章', class: '材料' },
  { name: '仙王残魂', class: '材料' },
  { name: '轮回印', class: '材料' },
  { name: '如梦道痕', class: '道具' },
  { name: '长相奇怪的小石头', class: '道具' },
  { name: '超越宝盒', class: '盒子' },
].map(Object.freeze));

/** 每个实际探索结算仅消费一次药效，先落盘抽取结果，再以同一回执发奖。 */
export async function settleSuiyunGiftDrop(player, { token, won, save, grant, random = Math.random }) {
  const key = String(token || '');
  if (!key) return '';
  const count = Math.max(0, Math.floor(Number(player.岁月馈赠次数) || 0));
  const records = Array.isArray(player.岁月馈赠记录) ? player.岁月馈赠记录 : [];
  let receipt = records.find(record => record?.token === key);
  if (!receipt) {
    if (!Number.isSafeInteger(count) || count <= 0) return '';
    let reward = null;
    if (won && random() < SUIYUN_GIFT_HIDDEN_CHANCE) {
      const index = Math.min(SUIYUN_GIFT_HIDDEN_ITEMS.length - 1,
        Math.max(0, Math.floor((Number(random()) || 0) * SUIYUN_GIFT_HIDDEN_ITEMS.length)));
      const item = SUIYUN_GIFT_HIDDEN_ITEMS[index];
      reward = { ...item, amount: multiplySuiyunLoot(player, item, 1) };
    }
    receipt = { token: key, reward, remaining: count - 1 };
    player.岁月馈赠次数 = count - 1;
    player.岁月馈赠记录 = [...records, receipt].slice(-512);
    if (await save() === false) throw new Error('隐藏药效结算已失去当前任务，请稍后重试');
  }
  if (!receipt.reward) return '';
  const reward = receipt.reward;
  await grant(reward, { idempotencyKey: `suiyun-hidden:${key}` });
  return `【岁月的馈赠·隐藏机缘】获得${reward.name}×${reward.amount}，隐藏药效剩余${receipt.remaining}次。`;
}
