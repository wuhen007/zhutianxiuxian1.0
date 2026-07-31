import fs from 'node:fs';

export const JAILER_BONUS = 75000000;
export const JAILER_STATE_KEY = '囚牢之主';
export const JAILER_HP_KEY = '囚牢之主当前血量';
export const JAILER_MAX_HP_KEY = '囚牢之主血量上限';

export function buildJailerStats(level, physique) {
  if (!level || !physique) {
    throw new Error('缺少囚牢之主的练气42或炼体50境界配置');
  }

  return {
    攻击: Number(level.基础攻击) + Number(physique.基础攻击) + JAILER_BONUS,
    防御: Number(level.基础防御) + Number(physique.基础防御) + JAILER_BONUS,
    血量: Number(level.基础血量) + Number(physique.基础血量) + JAILER_BONUS,
    暴击率: Math.min(1, Number(level.基础暴击 || 0) + Number(physique.基础暴击 || 0)),
  };
}

function readWorld(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeWorld(filePath, world) {
  fs.writeFileSync(filePath, JSON.stringify(world, null, 4), 'utf8');
}

export function ensureJailerState(filePath, maxHP) {
  const world = readWorld(filePath);
  let alive = Number(world[JAILER_STATE_KEY]) === 1;
  const storedHP = Number(world[JAILER_HP_KEY]);
  let hp = alive
    ? (Number.isFinite(storedHP) ? Math.min(maxHP, Math.max(0, Math.floor(storedHP))) : maxHP)
    : 0;

  if (alive && hp === 0) alive = false;

  if (
    world[JAILER_STATE_KEY] !== Number(alive) ||
    world[JAILER_HP_KEY] !== hp ||
    world[JAILER_MAX_HP_KEY] !== maxHP
  ) {
    world[JAILER_STATE_KEY] = Number(alive);
    world[JAILER_HP_KEY] = hp;
    world[JAILER_MAX_HP_KEY] = maxHP;
    writeWorld(filePath, world);
  }

  return { alive, hp, maxHP };
}

export function damageJailer(filePath, maxHP, requestedDamage) {
  const state = ensureJailerState(filePath, maxHP);
  if (!state.alive) {
    return { ...state, damage: 0, defeated: false };
  }

  const damage = Math.min(state.hp, Math.max(0, Math.floor(Number(requestedDamage) || 0)));
  const hp = state.hp - damage;
  const alive = hp > 0;
  const world = readWorld(filePath);
  world[JAILER_STATE_KEY] = Number(alive);
  world[JAILER_HP_KEY] = hp;
  world[JAILER_MAX_HP_KEY] = maxHP;
  writeWorld(filePath, world);

  return { alive, hp, maxHP, damage, defeated: !alive };
}
