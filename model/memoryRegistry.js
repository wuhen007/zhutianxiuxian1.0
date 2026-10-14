import { fileURLToPath } from 'node:url';
import {
  claimSuiyunUnique, getSuiyunTimeline, readSuiyunUnique,
  releaseSuiyunUnique, withSuiyunUniqueClaim,
} from './suiyunRegistry.js';

export const MEMORY_REGISTRY_FILE = fileURLToPath(new URL('../resources/data/memory_unique', import.meta.url));
export const MEMORY_DATA_DROP_CHANCE = 0.0001;
/* 暂停条目原定义：从有效 JSON 目录撤下，不删除玩家已有物品或已学秘籍。
道具列表.json:
{
  "id": 29904001, "name": "奇怪的数据", "class": "道具", "type": "唯一造化",
  "desc": "往世星海以0.0001概率唯一掉落。消耗后开启金血之体与星神之资，获得六相冰封秘籍。",
  "出售价": 0, "稀有度": 10, "不可交易": true, "不可支取": true,
  "不可创造": 1, "不可随机获取": true, "全服唯一": true, "islockd": 1
},
{
  "id": 29904002, "name": "记忆之诗篇", "class": "道具", "type": "记忆命途传承",
  "desc": "晋升无漏净子获得并自动激活；每现实小时结算0.1记忆碎片，无需消耗。",
  "出售价": 0, "稀有度": 10, "不可交易": true, "不可支取": true,
  "不可创造": 1, "不可随机获取": true, "记忆专属": true, "islockd": 1
}
功法列表.json:
{
  "id": 4005801, "name": "六相冰封", "class": "功法", "type": "限定功法", "修炼加成": 20,
  "desc": "记忆命途专属法门。习得后用#六相冰封，将战胜的玩家、镇压天骄或灾厄本源化作100至300记忆棱镜。",
  "出售价": 0, "稀有度": 10, "不可创造": 1, "不可交易": true,
  "不可外传": true, "专属灵根": "记忆命途"
}
*/
const storage = options => ({ ...options, file: options?.file || MEMORY_REGISTRY_FILE });
const registryKind = kind => kind === 'data' ? 'remnant' : kind;

export function readMemoryUnique(kind, options) {
  return readSuiyunUnique(registryKind(kind), storage(options));
}

export function claimMemoryUnique(kind, ownerId, options) {
  return claimSuiyunUnique(registryKind(kind), ownerId, storage(options));
}

export function releaseMemoryUnique(kind, ownerId, options) {
  return releaseSuiyunUnique(registryKind(kind), ownerId, storage(options));
}

export async function rollAndGrantMemoryData(player, grant, { location, random = Math.random, ...options } = {}) {
  // 奇怪的数据暂停掉落与旧占用补发，保留原登记和物品存档。
  return { ok: false, encountered: false, reason: 'disabled' };
  if (location !== '往世星海') return { ok: false, encountered: false };
  const ownerId = String(player?.id || player?.qq || '');
  if (!ownerId) return { ok: false, encountered: false };
  options.timeline ??= getSuiyunTimeline(player);
  const previous = readMemoryUnique('data', options);
  if (previous?.delivered || (previous && previous.ownerId !== ownerId)) return { ok: false, encountered: false };
  const roll = previous ? 0 : Number(random());
  if (!Number.isFinite(roll) || roll < 0 || roll >= MEMORY_DATA_DROP_CHANCE) return { ok: false, encountered: false };
  const result = await withSuiyunUniqueClaim('remnant', ownerId, () => grant({
    idempotencyKey: `memory:data:${options.timeline}:${ownerId}`,
  }), storage(options));
  return { ...result, encountered: result.ok };
}
