const TRANSIENT_FIELDS = new Set(['数量', '存入时间']);

function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

function canonicalize(value, root = false) {
  if (Array.isArray(value)) return value.map(item => canonicalize(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter(key => !root || !TRANSIENT_FIELDS.has(key))
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function variantKey(item) {
  return JSON.stringify(canonicalize(item, true));
}

export function isPercentEquipment(item) {
  const atk = Number(item?.atk) || 0;
  const def = Number(item?.def) || 0;
  const hp = Number(item?.HP) || 0;
  if (atk >= 99 || def >= 99 || hp >= 99) return false;
  return atk >= 1.5 || def >= 1.2 || (item?.type === '法宝' && (atk >= 1 || def >= 1)) || atk + def > 1.95;
}

export function requiresInnerWorldNaming(item, playerId) {
  return isPercentEquipment(item) &&
    !item?.owner_name &&
    String(item?.author_name || '') === String(playerId);
}

export function moveNamedItemStacks(source, target, {
  name,
  quantity,
  template,
  filter = () => true,
  toInnerWorld = false,
  now = Date.now(),
}) {
  let remaining = quantity === Infinity ? Infinity : Math.max(0, Number(quantity) || 0);
  let moved = 0;
  const movedItems = [];

  for (const item of source) {
    if (item.name !== name || remaining <= 0) continue;
    if (!filter(item)) continue;
    if (template && variantKey(item) !== variantKey(template)) continue;

    const count = Math.min(Number(item.数量) || 0, remaining);
    if (count <= 0) continue;

    const transferred = clone(item);
    transferred.数量 = count;
    if (toInnerWorld) transferred.存入时间 = now;
    else delete transferred.存入时间;

    const key = variantKey(transferred);
    const existing = target.find(candidate => variantKey(candidate) === key);
    if (existing) existing.数量 = (Number(existing.数量) || 0) + count;
    else target.push(transferred);

    item.数量 -= count;
    moved += count;
    movedItems.push(transferred);
    if (remaining !== Infinity) remaining -= count;
  }

  for (let index = source.length - 1; index >= 0; index--) {
    if ((Number(source[index].数量) || 0) <= 0) source.splice(index, 1);
  }

  return { moved, movedItems };
}
