export const SUIYUN_BRANCH = '无上天阙枝';
export const SUIYUN_AUTHORITY_DAY = 86_400_000;
export const SUIYUN_AUTHORITY_SEALS = Object.freeze([
  { name: '梦幻', command: '#开启梦幻试炼', item: '如梦的加持', itemClass: '丹药', amount: 20 },
  { name: '真实', command: '#真实勇者试炼', item: '地心红莲', itemClass: '材料', amount: 1 },
  { name: '理想', command: '#理想勇者试炼', item: '雷帝宝术', itemClass: '功法', amount: 1 },
  { name: '无极', command: '#见证道之三龙', item: '万物母气', itemClass: '材料', amount: 1 },
  { name: '大地', command: '#终结大地', item: '仙坟土', itemClass: '材料', amount: 1 },
  { name: '海洋', command: '#始源之海', item: '仙泉之眼', itemClass: '材料', amount: 1 },
  { name: '天空', command: '#天空之柱', item: '九彩神金', itemClass: '材料', amount: 1 },
  { name: '七夜的许愿星', command: '#召唤基拉祈', lifeCost: 600 },
  { name: '创世', command: '#归一' },
].map(Object.freeze));
export const SUIYUN_BRANCH_AUTHORITIES = Object.freeze([
  ['梦幻', '#梦幻 至宝名 权柄名', '借用其他至宝的一项主动或被动权柄一次，包括大道至宝；24小时冷却。'],
  ['真实', '被动', '莱希拉姆认可你的真实，每场战斗攻击时无视敌方50%防御。'],
  ['理想', '被动', '捷克罗姆认可你的理想，悟道收益+20%、悟道消耗-20%，免于囚禁；讨伐天骄跳过踪迹、位置、境界与血量门槛，冷却照常。'],
  ['无极', '#无极悟技 技能名', '道之三龙认可真理，讨伐天骄冷却减半；无需持有或消耗秘籍，百分百领悟指定现有功法。'],
  ['大地', '#断崖之剑', '预备下一场首次攻击伤害+200%，24小时冷却。'],
  ['海洋', '#根源波动 @玩家', '常驻被动：承伤减少20%、每回合恢复20%最大生命，不受主动冷却影响；主动修复目标道伤与生命本源、已有仙道潜力+20%，48小时冷却。'],
  ['天空', '被动', '每回合速度线性增加开战速度的10%，第二回合裂空座以3倍攻击施展画龙点睛；单次秘境探索缩短60秒、沉迷秘境每轮再减10分钟，洗劫冷却减半。'],
  ['七夜的许愿星', '#祈愿渡劫 @玩家', '消耗自身500生命本源，为目标下一场渡劫减少50%伤害；同类祈愿不叠加。'],
  ['创世', '#创世 防具/装备/法宝 名称', '200界核铸防具、200宇宙核心铸武器，或各100铸法宝；每项属性+50000%。'],
  ['无上', '被动', '时间线不被他人窥视、支取或古史打击。'],
  ['月宫', '被动', '小世界仙宠栖息地至少容纳24只，卸下后超限仙宠保留但暂停工作。'],
  ['霜华', '被动', '渡劫中的修为、血气、生命本源、属性和道伤损失减少50%，境界与生死判定照常。'],
  ['岁云降世', '#岁云降世', '预备下一场战斗，前3回合护盾、攻防与速度+50%；每回合一轮9倍攻击月华剑雨，24小时冷却。'],
].map(Object.freeze));

const number = value => Math.max(0, Number(value) || 0);
export function hasSuiyunBranch(player) {
  return player?.当前大道至宝 === SUIYUN_BRANCH
    && !player?._tahua_type && !player?._yiqihua_entity && !player?._万灵魔幡主魂
    && !player?._帝骑分身 && !player?._圆神分身 && player?.分身 !== true;
}
export function hasSuiyunAuthority(player, authority) {
  if (!hasSuiyunBranch(player)) return false;
  if (SUIYUN_AUTHORITY_SEALS.some(seal => seal.name === authority)) return isSuiyunAuthorityUnlocked(player, authority);
  return SUIYUN_BRANCH_AUTHORITIES.some(([name]) => name === authority) && getSuiyunUnsealedCount(player) === 9;
}
export function isSuiyunAuthorityUnlocked(player, authority) {
  const record = player?.天阙权柄?.解封?.[authority];
  return Boolean(record && typeof record === 'object' && Number.isFinite(record.at) && record.at >= 0);
}
export function getSuiyunUnsealedCount(player) {
  return SUIYUN_AUTHORITY_SEALS.filter(seal => isSuiyunAuthorityUnlocked(player, seal.name)).length;
}
export function formatSuiyunAuthoritySeals(player) {
  const count = getSuiyunUnsealedCount(player);
  return [
    `天阙解封：${count}/9｜${count === 9 ? '已完全解封' : '逐项解封，完成一项开放一项'}`,
    ...SUIYUN_AUTHORITY_SEALS.map(seal => {
      const requirement = seal.item ? `上交${seal.item}×${seal.amount}`
        : seal.lifeCost ? `消耗${seal.lifeCost}生命本源，保留正数本源` : '无额外消耗';
      return `${isSuiyunAuthorityUnlocked(player, seal.name) ? '【已解封】' : '【未解封】'}${seal.name}｜${seal.command}｜${requirement}`;
    }),
    '九项齐备后额外开放：无上、月宫、霜华、岁云降世。旧晋阶试炼记录不抵扣解封供物。',
  ];
}
export function unsealSuiyunAuthority(player, bag, command, now = Date.now()) {
  if (!hasSuiyunBranch(player)) return { ok: false, message: '请先装备认主的无上天阙枝，再行解封。' };
  const seal = SUIYUN_AUTHORITY_SEALS.find(seal => seal.command === command);
  if (!seal) return { ok: false, message: '请用 #天阙权柄 查看解封指令。' };
  if (isSuiyunAuthorityUnlocked(player, seal.name)) return { ok: false, message: `【${seal.name}】已解封，供物与本源保留。` };
  if (bag?.时间线封锁?.locked) return { ok: false, message: '纳戒当前封锁，请解除后再上交供物。' };
  let stacks = [];
  if (seal.item) {
    stacks = (bag?.[seal.itemClass] || []).filter(item => item.name === seal.item
      && Number.isSafeInteger(Number(item.数量)) && Number(item.数量) > 0);
    const total = stacks.reduce((sum, item) => sum + Number(item.数量), 0);
    if (total < seal.amount) return { ok: false, message: `【${seal.name}】解封需上交${seal.item}×${seal.amount}，纳戒现有${total}。` };
  }
  if (seal.lifeCost && (!Number.isFinite(Number(player.生命本源)) || Number(player.生命本源) <= seal.lifeCost)) {
    return { ok: false, message: `解封需消耗${seal.lifeCost}生命本源，并保留正数本源。` };
  }
  let remaining = seal.amount || 0;
  for (const stack of stacks) {
    const used = Math.min(remaining, Number(stack.数量));
    stack.数量 = Number(stack.数量) - used;
    remaining -= used;
  }
  if (seal.lifeCost) player.生命本源 = Number(player.生命本源) - seal.lifeCost;
  const state = suiyunAuthorityState(player);
  state.解封 ||= {};
  state.解封[seal.name] = { at: now, command: seal.command };
  const count = getSuiyunUnsealedCount(player);
  return { ok: true, name: seal.name, count, inventoryChanged: Boolean(seal.item),
    message: `【天阙解封·${seal.name}】${seal.item ? `已上交${seal.item}×${seal.amount}，` : seal.lifeCost ? `已消耗${seal.lifeCost}生命本源，` : ''}权柄已开放（${count}/9）。${count === 9 ? '九项见证齐备，无上天阙枝完全解封；无上、月宫、霜华、岁云降世同时开放。' : ''}` };
}
export function suiyunAuthorityState(player) {
  player.天阙权柄 ||= {};
  player.天阙权柄.冷却 ||= {};
  return player.天阙权柄;
}
export function suiyunAuthorityRemaining(player, key, now = Date.now()) {
  return Math.max(0, number(player?.天阙权柄?.冷却?.[key]) - now);
}
export function startSuiyunAuthority(player, key, hours = 24, now = Date.now()) {
  suiyunAuthorityState(player).冷却[key] = now + hours * 3_600_000;
}
export function getSuiyunDream(player, treasureName, key = '', now = Date.now()) {
  const dream = player?.岁云梦幻;
  if (!hasSuiyunAuthority(player, '梦幻') || !dream || dream.treasureName !== treasureName
    || number(dream.expiresAt) <= now || (key && dream.key !== key)) return null;
  if (dream.passive && dream.used && player?._梦幻战斗凭证 !== dream.token) return null;
  return dream;
}
export async function claimSuiyunBattleAuthority(units, { read, write, lock }) {
  for (const unit of units.filter(Boolean)) {
    delete unit._梦幻战斗凭证;
    delete unit._天阙断崖;
    delete unit._天阙降世;
    const dream = unit.岁云梦幻;
    const passive = hasSuiyunAuthority(unit, '梦幻') && dream?.passive && !dream.used && dream.expiresAt > Date.now();
    const prepared = (hasSuiyunAuthority(unit, '大地') && unit.天阙权柄?.断崖之剑待用)
      || (hasSuiyunAuthority(unit, '岁云降世') && unit.天阙权柄?.岁云降世待用);
    if (!unit.id || !hasSuiyunBranch(unit) || (!passive && !prepared)) continue;
    await lock(String(unit.id), async () => {
      const player = await read(String(unit.id));
      if (!hasSuiyunBranch(player)) {
        delete unit.岁云梦幻;
        return;
      }
      if (passive && hasSuiyunAuthority(player, '梦幻') && player.岁云梦幻?.token === dream.token && !player.岁云梦幻.used) {
        player.岁云梦幻.used = true;
        dream.used = true;
        unit._梦幻战斗凭证 = dream.token;
      } else if (passive) delete unit.岁云梦幻;
      for (const [field, runtime] of [['断崖之剑待用', '_天阙断崖'], ['岁云降世待用', '_天阙降世']]) {
        if (player.天阙权柄?.[field] && hasSuiyunAuthority(player, field === '断崖之剑待用' ? '大地' : '岁云降世')) {
          unit[runtime] = true;
          delete player.天阙权柄[field];
        }
      }
      await write(String(unit.id), player);
    });
  }
}
export function consumeSuiyunDream(player, treasureName, key, now = Date.now()) {
  const dream = getSuiyunDream(player, treasureName, key, now);
  if (!dream || dream.used) return false;
  dream.used = true;
  startSuiyunAuthority(player, '梦幻', 24, now);
  return true;
}
export function getSuiyunEffectiveDefense(attacker, defender) {
  return number(defender?.防御) * (hasSuiyunAuthority(attacker, '真实') ? .5 : 1);
}
export function getSuiyunHabitatCapacity(player, base) {
  return Math.max(number(base), hasSuiyunAuthority(player, '月宫') ? 24 : 0);
}
export function getSuiyunExplorationDuration(player, milliseconds) {
  return Math.max(1_000, number(milliseconds) - (hasSuiyunAuthority(player, '天空') ? 60_000 : 0));
}
export function getSuiyunWudaoCost(player, amount) {
  return Math.max(0, number(amount) * (hasSuiyunAuthority(player, '理想') ? .8 : 1));
}
export function getSuiyunTribulationMultiplier(player) {
  return number(player?.基拉祈祈愿?.remaining) > 0 || player?._基拉祈渡劫 ? .5 : 1;
}
export function beginSuiyunTribulation(player) {
  if (number(player?.基拉祈祈愿?.remaining) > 0) {
    player.基拉祈祈愿.remaining = 0;
    player._基拉祈渡劫 = true;
  } else delete player._基拉祈渡劫;
}
// 在各渡劫落盘前调用；只返还该次检查点之后产生的损失，不返还入场费用。
export function protectSuiyunTribulationLoss(player, before) {
  if (!before || !hasSuiyunAuthority(before, '霜华')) return false;
  for (const field of ['修为', '血气', '生命本源', '攻击', '防御', '血量上限', '寿元', '仙道潜力', '元神']) {
    const old = Number(before[field]), current = Number(player[field]);
    if (Number.isFinite(old) && Number.isFinite(current) && current < old) player[field] = current + (old - current) * .5;
  }
  const wounds = number(player.道伤) - number(before.道伤);
  if (wounds > 0) player.道伤 = number(before.道伤) + wounds * .5;
  return true;
}
export function createSuiyunGenesisItem(kind, name, owner, now = Date.now()) {
  const types = { 防具: '护具', 装备: '武器', 武器: '武器', 法宝: '法宝' };
  if (!types[kind] || !String(name).trim() || [...String(name)].length > 16) return null;
  return {
    id: `suiyun-genesis-${now}-${owner}`, name: String(name).trim(), class: '装备', type: types[kind],
    装备类型: '百分比', 百分比装备: true, 百分比上限豁免: '天阙创世',
    天阙创世: true, atk: 500, def: 500, HP: 500, bao: 0, 全属性: 500,
    pinji: 6, 稀有度: 10, 数量: 1, 出售价: 0, islockd: 0, 创造者ID: String(owner),
  };
}
