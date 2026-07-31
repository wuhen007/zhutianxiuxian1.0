import fs from 'fs';

export const SHOUYUAN_DIFFICULTIES = Object.freeze({
  简单: 1,
  普通: 2,
  困难: 3,
});

export function resolveShouyuanDifficulty(value) {
  const level = [1, 2, 3].includes(Number(value)) ? Number(value) : 1;
  const name = Object.keys(SHOUYUAN_DIFFICULTIES)
    .find(key => SHOUYUAN_DIFFICULTIES[key] === level);
  return {
    level,
    name,
    drainsLifespan: level >= SHOUYUAN_DIFFICULTIES.普通,
    reincarnatesOnExhaustion: level >= SHOUYUAN_DIFFICULTIES.困难,
  };
}

export function readShouyuanDifficulty(filePath) {
  try {
    const world = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return resolveShouyuanDifficulty(world.往生系统);
  } catch (err) {
    console.error('[往生系统] 读取难度失败，已按简单难度处理:', err);
    return resolveShouyuanDifficulty(1);
  }
}
