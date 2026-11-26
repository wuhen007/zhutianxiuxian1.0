const GRADE_LABELS = Object.freeze({
  1: '松懈',
  2: '戒备',
  3: '恐慌',
});

const GRADE_TONES = Object.freeze({
  1: 'calm',
  2: 'alert',
  3: 'danger',
});

export const XIJIE_SHOP_LOCK_TTL_MS = 4 * 60 * 60 * 1000;

const formatNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '—';
};

const normalizeGrade = value => {
  const grade = Number(value);
  return Math.min(3, Math.max(1, Number.isFinite(grade) ? Math.trunc(grade) : 1));
};

export function refreshXijieShop(runtimeList, catalogList) {
  const runtimeByName = new Map(
    (Array.isArray(runtimeList) ? runtimeList : [])
      .filter(place => place?.name)
      .map(place => [place.name, place])
  );

  return (Array.isArray(catalogList) ? catalogList : []).map(source => ({
    ...structuredClone(source),
    Grade: normalizeGrade(runtimeByName.get(source.name)?.Grade ?? source.Grade),
    state: 0,
  }));
}

export function isXijieShopLockExpired(place, now = Date.now()) {
  if (Number(place?.state) !== 1) return false;
  const expiresAt = Number(place?.state_until);
  return !Number.isFinite(expiresAt) || expiresAt <= Number(now);
}

function groupRewards(entries) {
  const groups = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name || '未知物品');
    const className = String(entry.class || '未分类');
    const quantity = Number(entry.数量);
    const normalizedQuantity = Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0;
    const key = `${name}\u0000${className}\u0000${normalizedQuantity}`;
    const group = groups.get(key) || {
      name,
      className,
      quantity: normalizedQuantity,
      slots: 0,
      availableSlots: 0,
    };

    group.slots += 1;
    if (normalizedQuantity > 0) group.availableSlots += 1;
    groups.set(key, group);
  }

  return [...groups.values()].map(item => ({
    ...item,
    available: item.availableSlots > 0,
    weightLabel: item.slots > 1 ? `权重 ×${item.slots}` : '单槽',
    quantityLabel: item.quantity > 0 ? `×${formatNumber(item.quantity)}` : '已耗尽',
  }));
}

export function buildXijieAtlasData(shopList) {
  const source = Array.isArray(shopList) ? shopList : [];
  const locations = source
    .filter(place => place && typeof place === 'object' && place.name)
    .map((place, index) => {
      const grade = normalizeGrade(place.Grade);
      const rewards = groupRewards(place.one);
      const availableSlots = rewards.reduce((sum, reward) => sum + reward.availableSlots, 0);
      const slotCount = rewards.reduce((sum, reward) => sum + reward.slots, 0);
      const isGuarded = Number(place.state) === 1;
      const status = isGuarded ? '已戒备' : availableSlots > 0 ? '可洗劫' : '已搬空';
      const statusClass = isGuarded ? 'guarded' : availableSlots > 0 ? 'ready' : 'empty';

      return {
        id: place.id ?? index,
        ordinal: String(index + 1).padStart(2, '0'),
        name: String(place.name),
        grade,
        gradeLabel: GRADE_LABELS[grade],
        tone: GRADE_TONES[grade],
        status,
        statusClass,
        priceLabel: formatNumber((Number(place.price) || 0) * grade),
        rewards,
        availableSlots,
        slotCount,
      };
    });

  const rewardTypes = new Set(
    locations.flatMap(place => place.rewards.map(reward => reward.className))
  );

  return {
    title: '洗劫列表图鉴',
    eyebrow: '诸天 · 劫光档案',
    subtitle: '实时记录各处目标的戒备与掉落池',
    note: '掉落池按单次搜刮槽位展示；灰置条目代表当前库存已耗尽',
    command: '#洗劫 地点名',
    locations,
    stats: {
      locationCount: locations.length,
      readyCount: locations.filter(place => place.statusClass === 'ready').length,
      guardedCount: locations.filter(place => place.statusClass === 'guarded').length,
      emptyCount: locations.filter(place => place.statusClass === 'empty').length,
      rewardTypeCount: rewardTypes.size,
    },
  };
}
