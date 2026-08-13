export const SHENGXU_DUNGEONS = Object.freeze([
  Object.freeze({ name: '昆仑山', requiredLevel: 2, monster: '昆仑兽王', scale: 0.72, medium: '普通进化花粉', amount: 2, accumulation: 8, gongfa: '形意呼吸法', gongfaChance: 0.18 }),
  Object.freeze({ name: '龙虎山', requiredLevel: 4, monster: '枷锁古猿', scale: 0.86, medium: '灵性进化花粉', amount: 1, accumulation: 10, gongfa: '太极呼吸法', gongfaChance: 0.14 }),
  Object.freeze({ name: '大雷音寺遗址', requiredLevel: 6, monster: '雷音尸魔', scale: 1, medium: '灵性进化花粉', amount: 2, accumulation: 12, gongfa: '大雷音呼吸法', gongfaChance: 0.1 }),
  Object.freeze({ name: '小阴间星路', requiredLevel: 8, monster: '星路猎杀者', scale: 1.1, medium: '神性进化花粉', amount: 1, accumulation: 16, gongfa: '道引呼吸法', gongfaChance: 0.07 }),
  Object.freeze({ name: '阳间名山', requiredLevel: 11, monster: '阳间神祇', scale: 1.22, medium: '神性进化花粉', amount: 2, accumulation: 20, gongfa: '道引呼吸法', gongfaChance: 0.1 }),
  Object.freeze({ name: '魂河古地', requiredLevel: 17, monster: '魂河接引者', scale: 1.38, medium: '无暇进化花粉', amount: 1, accumulation: 28, gongfa: '盗引呼吸法', gongfaChance: 0.03 }),
]);

export const SHENGXU_FACTIONS = Object.freeze({
  菩提基因: Object.freeze({ position: '外勤进化者', requiredLevel: 2, medium: '普通进化花粉', amount: 3, dew: 0, accumulation: 5 }),
  大梦净土: Object.freeze({ position: '外门弟子', requiredLevel: 8, medium: '灵性进化花粉', amount: 2, dew: 1, accumulation: 10 }),
  阳间第一山: Object.freeze({ position: '记名门徒', requiredLevel: 12, medium: '神性进化花粉', amount: 1, dew: 2, accumulation: 15 }),
});

export function getShengxuDungeon(name) {
  return SHENGXU_DUNGEONS.find(dungeon => dungeon.name === String(name || '').trim()) || null;
}

export function createShengxuMonster(player, dungeon) {
  const maxHealth = Math.max(1, Number(player?.血量上限 || player?.当前血量) || 1);
  const scale = Math.max(0.1, Number(dungeon?.scale) || 1);
  return {
    名号: dungeon?.monster || '异变生灵',
    攻击: Math.max(1, Math.trunc((Number(player?.攻击) || 1) * scale)),
    防御: Math.max(1, Math.trunc((Number(player?.防御) || 1) * scale)),
    当前血量: Math.max(1, Math.trunc(maxHealth * scale)),
    血量上限: Math.max(1, Math.trunc(maxHealth * scale)),
    暴击率: Math.max(0.1, Number(player?.暴击率) || 0.1),
    暴击伤害: Math.max(1.5, Number(player?.暴击伤害) || 1.5),
    速度: Math.max(100, Math.trunc((Number(player?.速度) || 100) * scale)),
    灵根: { name: '异变血脉', type: '妖体', 法球倍率: 1 },
    学习的功法: [],
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: dungeon?.requiredLevel || 1,
  };
}

export function resolveShengxuDungeonReward(dungeon, random = Math.random) {
  if (!dungeon) return null;
  return {
    medium: dungeon.medium,
    amount: dungeon.amount,
    accumulation: dungeon.accumulation,
    gongfa: Number(random()) < dungeon.gongfaChance ? dungeon.gongfa : '',
  };
}
