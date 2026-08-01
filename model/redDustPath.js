export const RED_DUST_LIVES = Object.freeze([
  Object.freeze({
    life: 1,
    name: "斩旧我",
    demon: "旧我执念",
    clue: "封住一门最依赖的传承，以新的自己活过这一世。",
  }),
  Object.freeze({
    life: 2,
    name: "补道缺",
    demon: "道心裂痕",
    clue: "回到曾经忽略的道途，补上最初留下的裂痕。",
  }),
  Object.freeze({
    life: 3,
    name: "结红尘",
    demon: "红尘羁绊",
    clue: "在众生之间留下真实牵挂，独行者难渡此劫。",
  }),
  Object.freeze({
    life: 4,
    name: "还因果",
    demon: "业火焚身",
    clue: "偿还一段主动背负的因果，不能只用修为硬压。",
  }),
  Object.freeze({
    life: 5,
    name: "熬岁月",
    demon: "岁月长河",
    clue: "以衰败之身守住道心，长生药不能替你完成这一世。",
  }),
  Object.freeze({
    life: 6,
    name: "立己道",
    demon: "大道反噬",
    clue: "暂离旧有帝经，证明你有一条不依附前人的己道。",
  }),
  Object.freeze({
    life: 7,
    name: "斩不详",
    demon: "黑暗源头",
    clue: "直面不详并保住本心，逃避只会留下污染。",
  }),
  Object.freeze({
    life: 8,
    name: "问真我",
    demon: "真我质疑",
    clue: "立下一条不可反悔的仙道誓愿，回答自己为何成仙。",
  }),
  Object.freeze({
    life: 9,
    name: "破天牢",
    demon: "天地牢笼",
    clue: "让前八世道痕合一，承受最后一重天地拒绝。",
  }),
]);

export const RED_DUST_VOWS = Object.freeze({
  化凡: Object.freeze({
    id: "化凡",
    name: "化凡路",
    description: "修为血气消耗-15%，心魔威能-10%，世印成长标准。",
    costRate: 0.85,
    demonRate: 0.9,
    gainRate: 1,
  }),
  争渡: Object.freeze({
    id: "争渡",
    name: "争渡路",
    description: "修为血气与心魔威能标准，世印成长+5%。",
    costRate: 1,
    demonRate: 1,
    gainRate: 1.05,
  }),
  逆天: Object.freeze({
    id: "逆天",
    name: "逆天路",
    description: "修为血气消耗+15%，心魔威能+10%，世印成长+15%。",
    costRate: 1.15,
    demonRate: 1.1,
    gainRate: 1.15,
  }),
});

export function getRedDustLife(life) {
  const value = Number(life) || 1;
  return Math.min(9, Math.max(1, Math.floor(value)));
}

function getRedDustProgressLife(life) {
  return Math.max(1, Math.floor(Number(life) || 1));
}

export function getRedDustLifeInfo(life) {
  return RED_DUST_LIVES[getRedDustLife(life) - 1];
}

export function getRedDustVow(value) {
  const text = String(value || "").trim();
  return (
    Object.values(RED_DUST_VOWS).find(
      (vow) => vow.id === text || vow.name === text
    ) || null
  );
}

export function getRedDustPath(player) {
  const path = player?.红尘仙路;
  if (!path || typeof path !== "object") return null;
  return {
    ...path,
    unlocked: path.unlocked === true,
    life: getRedDustProgressLife(path.life || player.nihuo_count || 1),
    seals: Array.isArray(path.seals) ? path.seals : [],
    ashes: Math.max(0, Number(path.ashes) || 0),
  };
}

export function createRedDustPath(player, now = Date.now()) {
  const currentLife = getRedDustProgressLife(player?.nihuo_count || 1);
  return {
    unlocked: true,
    unlockedAt: now,
    life: currentLife,
    vow: null,
    seals: Array.from({ length: Math.min(9, currentLife - 1) }, (_, index) => ({
      life: index + 1,
      vow: "旧世道痕",
      legacy: true,
    })),
    ashes: 0,
  };
}

export function formatRedDustProgress(player) {
  const path = getRedDustPath(player);
  const currentLife = getRedDustProgressLife(player?.nihuo_count || 1);
  const completed = Math.min(
    9,
    Math.max(path?.seals?.length || 0, currentLife - 1)
  );
  return { path, currentLife, completed };
}

export function getRedDustDaoFruit(seals) {
  const counts = { 化凡: 0, 争渡: 0, 逆天: 0 };
  for (const seal of Array.isArray(seals) ? seals : []) {
    if (seal?.vow in counts) counts[seal.vow] += 1;
  }
  if (counts.化凡 >= 5) return "长生道果";
  if (counts.争渡 >= 5) return "战仙道果";
  if (counts.逆天 >= 5) return "逆命道果";
  return "红尘道果";
}
