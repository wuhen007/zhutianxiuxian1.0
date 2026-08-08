function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function addInteger(current, amount) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    toNonNegativeInteger(current) + toNonNegativeInteger(amount),
  );
}

function clonePlainData(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function getEntryName(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (!isRecord(entry)) return '';
  return String(entry.name ?? entry.名称 ?? '').trim();
}

function requireBag(bag) {
  if (!isRecord(bag)) throw new TypeError('仙古秘境背包无效');
  bag.items = Array.isArray(bag.items) ? bag.items : [];
  bag.seeds = Array.isArray(bag.seeds) ? bag.seeds : [];
  bag.techniques = Array.isArray(bag.techniques) ? bag.techniques : [];
  return bag;
}

function createEmptyXianguBag() {
  return {
    xiuwei: 0,
    xueqi: 0,
    sourceStone: 0,
    items: [],
    seeds: [],
    techniques: [],
    potential: 0,
  };
}

export function calculateXianguSourceStoneReward(player = {}, rolls = 1) {
  const level = Math.max(1, Math.floor(Number(player.xiangulevel_id) || 1));
  const rewardRolls = Math.max(1, Math.floor(Number(rolls) || 1));
  return 2_000_000 * level * rewardRolls;
}

export function claimXianguBagItems(najie, bag, claimId, claimedAt = Date.now()) {
  if (!isRecord(najie)) throw new TypeError('纳戒数据无效');
  const id = String(claimId || '').trim();
  if (!id) throw new TypeError('秘境结算编号无效');

  najie._rewardClaims = isRecord(najie._rewardClaims) ? najie._rewardClaims : {};
  if (najie._rewardClaims[id]) return { claimed: false, itemCount: 0 };

  const normalized = createXianguBag(bag);
  for (const item of normalized.items) {
    const category = Array.isArray(najie[item.type]) ? item.type : '材料';
    najie[category] ||= [];
    const existing = najie[category].find(entry => entry?.name === item.name);
    if (existing) {
      existing.数量 = addInteger(existing.数量, item.quantity);
    } else {
      const { quantity, type, ...saved } = item;
      najie[category].push({ ...saved, class: saved.class || type, 数量: quantity, islockd: 0 });
    }
  }

  najie._rewardClaims[id] = {
    claimedAt: Math.max(0, Math.floor(Number(claimedAt) || Date.now())),
    itemCount: normalized.items.reduce((sum, item) => addInteger(sum, item.quantity), 0),
  };
  const staleClaims = Object.entries(najie._rewardClaims)
    .filter(([key]) => key.startsWith('xiangu:'))
    .sort((left, right) => Number(right[1]?.claimedAt) - Number(left[1]?.claimedAt))
    // Keep enough history to cover the player receipt window. A short
    // twenty-entry list could forget an evacuation claim while its player
    // receipt was still pending and make a retry duplicate items.
    .slice(200);
  for (const [key] of staleClaims) delete najie._rewardClaims[key];

  return { claimed: true, itemCount: najie._rewardClaims[id].itemCount };
}

export function addXianguBagGrowth(bag, rewards = {}) {
  requireBag(bag);
  if (!isRecord(rewards)) return bag;
  bag.xiuwei = addInteger(bag.xiuwei, rewards.xiuwei ?? rewards.修为);
  bag.xueqi = addInteger(bag.xueqi, rewards.xueqi ?? rewards.血气);
  bag.sourceStone = addInteger(bag.sourceStone, rewards.sourceStone ?? rewards.源石);
  return bag;
}

export function addXianguBagItem(bag, item, quantity) {
  requireBag(bag);
  const source = typeof item === 'string'
    ? { name: item, type: '道具' }
    : isRecord(item) ? item : null;
  if (!source) return bag;

  const name = String(source.name ?? source.名称 ?? '').trim();
  const type = String(source.type ?? source.类型 ?? '道具').trim() || '道具';
  const amount = toNonNegativeInteger(
    quantity ?? source.quantity ?? source.数量 ?? source.count ?? 1,
  );
  if (!name || amount === 0) return bag;

  const existing = bag.items.find(entry => entry.name === name && entry.type === type);
  if (existing) {
    existing.quantity = addInteger(existing.quantity, amount);
    if (source.unique === true) existing.unique = true;
    return bag;
  }

  const saved = clonePlainData(source);
  delete saved.name;
  delete saved.名称;
  delete saved.type;
  delete saved.类型;
  delete saved.quantity;
  delete saved.数量;
  delete saved.count;
  bag.items.push({ ...saved, name, type, quantity: amount });
  return bag;
}

export function takeXianguUniqueBagItem(bag) {
  requireBag(bag);
  const index = bag.items.findIndex(item => item?.unique === true);
  if (index < 0) return null;

  const source = bag.items[index];
  const item = clonePlainData({ ...source, quantity: 1 });
  source.quantity = toNonNegativeInteger(source.quantity) - 1;
  if (source.quantity <= 0) bag.items.splice(index, 1);
  return item;
}

export function addXianguBagSeed(bag, seed) {
  requireBag(bag);
  if (!getEntryName(seed)) return bag;
  bag.seeds.push(clonePlainData(seed));
  return bag;
}

export function addXianguBagTechnique(bag, technique) {
  requireBag(bag);
  const name = getEntryName(technique);
  if (!name || bag.techniques.some(entry => getEntryName(entry) === name)) return bag;
  bag.techniques.push(clonePlainData(technique));
  return bag;
}

export function addXianguBagPotential(bag, amount) {
  requireBag(bag);
  bag.potential = addInteger(bag.potential, amount);
  return bag;
}

export function createXianguBag(initial = {}) {
  const bag = createEmptyXianguBag();
  if (!isRecord(initial)) return bag;

  addXianguBagGrowth(bag, initial);
  addXianguBagPotential(bag, initial.potential ?? initial.仙道潜力);
  for (const item of Array.isArray(initial.items) ? initial.items : []) {
    addXianguBagItem(bag, item);
  }
  for (const seed of Array.isArray(initial.seeds) ? initial.seeds : []) {
    addXianguBagSeed(bag, seed);
  }
  for (const technique of Array.isArray(initial.techniques) ? initial.techniques : []) {
    addXianguBagTechnique(bag, technique);
  }
  return bag;
}

export function ensureXianguBag(player) {
  if (!isRecord(player)) throw new TypeError('玩家数据无效');
  player.xiangu_bag = createXianguBag(player.xiangu_bag);
  return player.xiangu_bag;
}

export function cloneXianguBag(bag) {
  return createXianguBag(bag);
}

export function getXianguBagLootUnits(bag) {
  const normalized = createXianguBag(bag);
  const itemUnits = normalized.items.reduce((sum, item) => addInteger(sum, item.quantity), 0);
  const scalarUnits = ['xiuwei', 'xueqi', 'sourceStone', 'potential']
    .filter(key => normalized[key] > 0).length;
  return addInteger(
    addInteger(itemUnits, normalized.seeds.length + normalized.techniques.length),
    scalarUnits,
  );
}

export function getXianguBagSummary(bag) {
  const snapshot = cloneXianguBag(bag);
  return {
    ...snapshot,
    itemCount: snapshot.items.reduce((sum, item) => addInteger(sum, item.quantity), 0),
    seedCount: snapshot.seeds.length,
    techniqueCount: snapshot.techniques.length,
    lootUnits: getXianguBagLootUnits(snapshot),
  };
}

export function formatXianguBag(bag) {
  const summary = getXianguBagSummary(bag);
  const itemText = summary.items.length > 0
    ? summary.items.map(item => `${item.name}×${item.quantity}`).join('、')
    : '无';
  const seedText = summary.seeds.map(getEntryName).filter(Boolean).join('、') || '无';
  const techniqueText = summary.techniques.map(getEntryName).filter(Boolean).join('、') || '无';
  return [
    '【仙古秘境背包】',
    `修为：${summary.xiuwei.toLocaleString('zh-CN')}`,
    `血气：${summary.xueqi.toLocaleString('zh-CN')}`,
    `源石：${summary.sourceStone.toLocaleString('zh-CN')}`,
    `仙道潜力：${summary.potential.toLocaleString('zh-CN')}`,
    `物品：${itemText}`,
    `道种：${seedText}`,
    `功法：${techniqueText}`,
    `战利品单位：${summary.lootUnits}`,
  ].join('\n');
}

export function clearXianguBag(player) {
  if (!isRecord(player)) throw new TypeError('玩家数据无效');
  const snapshot = cloneXianguBag(player.xiangu_bag);
  delete player.xiangu_bag;
  return snapshot;
}
