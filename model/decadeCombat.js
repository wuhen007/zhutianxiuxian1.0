const DECADE_ROOTS = new Set(['帝骑', '帝骑·神主', '帝骑·终极神主']);

const DECADE_CARD_MOVES = Object.freeze([
  { 骑士卡: '空我', name: 'Kamen Ride·究极空我', form: '究极空我', beilv: 3.2, 护盾比例: 0.12, 蓄力重击: 1, 蓄力倍率: 1.4 },
  { 骑士卡: '亚极陀', name: 'Kamen Ride·闪耀亚极陀', form: '闪耀亚极陀', beilv: 2.8, 回复比例: 0.08, 攻击成长: 0.04, 攻击成长上限: 3 },
  { 骑士卡: '龙骑', name: 'Kamen Ride·龙骑生存', form: '龙骑生存形态', beilv: 3.4, 吸血比例: 0.2 },
  { 骑士卡: 'Faiz', name: 'Attack Ride·Faiz Blaster', form: 'Faiz爆裂形态', beilv: 4, 不可防御: 1, 破甲比例: 0.15, 破甲回合: 2 },
  { 骑士卡: '剑', name: 'Attack Ride·Royal Straight Flush', form: 'Blade帝王形态', beilv: 3.7, 禁疗回合: 2, 残血阈值: 0.35, 残血倍率: 1.5 },
  { 骑士卡: '响鬼', name: 'Attack Ride·鬼神觉声', form: '装甲响鬼', beilv: 3.6, 负面效果: 1, 负面回合: 3, 负面类型: '音击灼烧' },
  { 骑士卡: '甲斗', name: 'Attack Ride·Hyper Clock Up', form: '超越甲斗', beilv: 4, 拉条: 800, 闪避加成: 0.08, 反击比例: 0.3 },
  { 骑士卡: '电王', name: 'Attack Ride·电王列车形态', form: '电王列车形态', beilv: 3.2, 护盾比例: 0.12, 随机形态增益: 1 },
  { 骑士卡: 'Kiva', name: 'Attack Ride·Kiva魔皇', form: 'Kiva魔皇形态', beilv: 3.8, 吸血比例: 0.15, 负面效果: 1, 负面回合: 3, 负面类型: '魔皇流血' },
]);

export const DECADE_GOD_MASTER_MOVES = Object.freeze([
  { 骑士卡: '空我', name: '究极升华·天地崩裂', form: '究极空我', beilv: 8, 护盾比例: 0.25, 蓄力重击: 1, 蓄力倍率: 1.5 },
  { 骑士卡: '亚极陀', name: '闪耀骑士踢', form: '闪耀亚极陀', beilv: 6, 回复比例: 0.15, 攻击成长: 0.06, 攻击成长上限: 3 },
  { 骑士卡: '龙骑', name: '龙火风暴', form: '龙骑生存形态', beilv: 7, 吸血比例: 0.35 },
  { 骑士卡: 'Faiz', name: '超强化深红电钻', form: 'Faiz爆裂形态', beilv: 8.5, 不可防御: 1, 破甲比例: 0.35, 破甲回合: 2 },
  { 骑士卡: '剑', name: '皇家同花顺', form: 'Blade帝王形态', beilv: 8, 禁疗回合: 2, 残血阈值: 0.35, 残血倍率: 1.8 },
  { 骑士卡: '响鬼', name: '音击刃·鬼神觉声', form: '装甲响鬼', beilv: 7.7, 负面效果: 1, 负面回合: 3, 负面类型: '七重音击灼烧' },
  { 骑士卡: '甲斗', name: '百虫剑·究极斩', form: '超越甲斗', beilv: 10, 不可防御: 1, 拉条: 3000, 闪避加成: 0.12, 反击比例: 0.4 },
  { 骑士卡: '甲斗', name: '百虫剑·究极炮', form: '超越甲斗', beilv: 6, 群攻: 99, 群攻比例: 0.7, 推条: 1000, 不可防御: 1 },
  { 骑士卡: '电王', name: '电车斩·终点站', form: '电王列车形态', beilv: 6, 护盾比例: 0.15, 随机形态增益: 1 },
  { 骑士卡: 'Kiva', name: '终结赞巴特斩', form: 'Kiva魔皇形态', beilv: 7.5, 吸血比例: 0.3, 负面效果: 1, 负面回合: 3, 负面类型: '赞巴特流血' },
]);

const DECADE_ULTIMATE_MOVES = Object.freeze([
  ...DECADE_GOD_MASTER_MOVES.map(move => ({
    ...move,
    name: `${move.name}·诸界投影`,
    beilv: Number((move.beilv * 1.25).toFixed(2)),
    护盾比例: move.护盾比例 ? Math.min(0.35, move.护盾比例 + 0.05) : undefined,
    回复比例: move.回复比例 ? Math.min(0.25, move.回复比例 + 0.05) : undefined,
    吸血比例: move.吸血比例 ? Math.min(0.45, move.吸血比例 + 0.05) : undefined,
  })),
  { name: 'Complete Ride·世界重叠', form: '攻击、守护与极速三重世界', beilv: 8, 护盾比例: 0.18, 回复比例: 0.12, 攻击成长: 0.05, 攻击成长上限: 3, 清除控制: 1 },
  { name: 'All Rider Final Attack', form: '历代骑士终极投影', beilv: 14, 不可防御: 1, 无视减伤: 1, 护盾比例: 0.2 },
  { name: '世界破坏者·终幕', form: '极光帷幕中的世界破坏者', beilv: 10, 不可防御: 1, 禁疗回合: 2, 斩杀阈值: 0.15, 首领最大生命伤害比例: 0.08, 首领伤害攻击上限: 10 },
]);

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function maxHp(unit) {
  return Math.max(1, asNumber(unit?.血量上限, unit?.当前血量 || 1));
}

export function isDecadeRoot(unit) {
  return DECADE_ROOTS.has(unit?.灵根?.name);
}

export function resolveDecadeCombatSkill(player, skill, random = Math.random) {
  if (!skill?.帝骑技能池 || !isDecadeRoot(player)) return skill;
  const pools = {
    卡组驾驭: DECADE_CARD_MOVES,
    终极形态召唤: DECADE_GOD_MASTER_MOVES,
    全骑士与世界破坏: DECADE_ULTIMATE_MOVES,
  };
  let moves = pools[skill.帝骑技能池] || [];
  const deck = player?.诸天镜系统?.世界进度?.假面骑士帝骑?.出战卡组 || [];
  const selected = moves.filter(move => !move.骑士卡 || deck.includes(move.骑士卡));
  if (selected.length) moves = selected;
  if (!moves.length) return skill;
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, asNumber(random())));
  const move = moves[Math.floor(roll * moves.length)];
  // 招式的 name 只作为展示用的「招式名」，绝不能覆盖 skill.name。
  // 战斗引擎用 hasSupremeInnate(attacker, skill.name) 判定灵根技能是否可用，
  // 一旦 name 被替换成招式名（如「百虫剑·究极斩」），判定必然失败 → 帝骑技能永不触发。
  const { name: moveName, ...moveEffect } = move;
  const resolved = {
    ...skill,
    ...moveEffect,
    帝骑效果: 1,
    招式名: moveName,
    msg1: `点亮${move.骑士卡 ? `${move.骑士卡}骑士卡` : '终极卡'}，召唤${move.form}发动《${moveName}》，`,
    msg2: `被《${moveName}》正面命中`,
  };
  if (
    resolved.残血倍率 > 1 &&
    asNumber(player?.当前血量) <= maxHp(player) * asNumber(resolved.残血阈值, 0.35)
  ) {
    resolved.beilv *= resolved.残血倍率;
    resolved.msg1 += '残血意志令终结威力暴涨，';
  }
  return resolved;
}

export function tickDecadeCombatState(unit, round, messages = []) {
  if (!unit || unit._帝骑状态结算回合 === round) return messages;
  unit._帝骑状态结算回合 = round;

  if (unit._帝骑禁疗回合 > 0) {
    unit._帝骑禁疗回合 -= 1;
    if (unit._帝骑禁疗回合 <= 0) {
      unit.禁疗 = asNumber(unit._帝骑原禁疗);
      delete unit._帝骑原禁疗;
      messages.push(`${unit.名号}身上的皇家封印消散，治疗能力恢复。`);
    }
  }

  if (unit._帝骑破甲回合 > 0) {
    unit._帝骑破甲回合 -= 1;
    if (unit._帝骑破甲回合 <= 0) {
      unit.防御 = Math.max(0, asNumber(unit.防御) + asNumber(unit._帝骑破甲数值));
      delete unit._帝骑破甲数值;
      messages.push(`${unit.名号}被光子血液贯穿的防线重新稳定。`);
    }
  }

  return messages;
}

export function applyDecadeSkillEffects(
  attacker,
  defender,
  skill,
  { shieldField = '护盾值', isBoss = false, random = Math.random } = {},
) {
  if (!skill?.帝骑效果 || !isDecadeRoot(attacker)) {
    return { messages: [], bonusDamage: 0 };
  }

  const messages = [];
  let bonusDamage = 0;

  if (skill.蓄力重击) {
    if (attacker._帝骑空我已蓄力) {
      skill.beilv *= asNumber(skill.蓄力倍率, 1.5);
      attacker._帝骑空我已蓄力 = false;
      messages.push(`${attacker.名号}释放空我积蓄的究极之力，本次重击威力提升${Math.round((asNumber(skill.蓄力倍率, 1.5) - 1) * 100)}%。`);
    } else {
      attacker._帝骑空我已蓄力 = true;
      messages.push(`${attacker.名号}以究极之暗稳住架势，为下一次空我重击蓄力。`);
    }
  }

  if (skill.回复比例 > 0 && !attacker._先天禁疗 && asNumber(attacker.禁疗) < 1) {
    const before = asNumber(attacker.当前血量);
    attacker.当前血量 = Math.min(maxHp(attacker), before + Math.trunc(maxHp(attacker) * skill.回复比例));
    const healed = attacker.当前血量 - before;
    if (healed > 0) messages.push(`${attacker.名号}得到骑士投影回馈，恢复${healed}点生命。`);
  }

  if (skill.护盾比例 > 0) {
    const shield = Math.trunc(maxHp(attacker) * skill.护盾比例);
    attacker[shieldField] = Math.max(0, asNumber(attacker[shieldField])) + shield;
    messages.push(`${attacker.名号}展开次元护阵，获得${shield}点护盾。`);
  }

  if (skill.攻击成长 > 0) {
    const limit = Math.max(1, Math.trunc(asNumber(skill.攻击成长上限, 3)));
    const stacks = Math.max(0, Math.trunc(asNumber(attacker._帝骑攻击成长层数)));
    if (stacks < limit) {
      attacker.攻击 = Math.trunc(asNumber(attacker.攻击) * (1 + skill.攻击成长));
      attacker.防御 = Math.trunc(asNumber(attacker.防御) * (1 + skill.攻击成长));
      attacker._帝骑攻击成长层数 = stacks + 1;
      messages.push(`${attacker.名号}沐浴闪耀之光，攻防永久提升${Math.round(skill.攻击成长 * 100)}%（${stacks + 1}/${limit}）。`);
    }
  }

  if (skill.破甲比例 > 0 && !defender._帝骑破甲回合) {
    const removed = Math.trunc(asNumber(defender.防御) * Math.min(0.8, skill.破甲比例));
    defender.防御 = Math.max(0, asNumber(defender.防御) - removed);
    defender._帝骑破甲数值 = removed;
    defender._帝骑破甲回合 = Math.max(1, Math.trunc(asNumber(skill.破甲回合, 2)));
    messages.push(`${defender.名号}的防线被光子血液贯穿，防御降低${Math.round(skill.破甲比例 * 100)}%。`);
  }

  if (skill.吸血比例 > 0) {
    attacker.吸血率 = Math.max(asNumber(attacker.吸血率), skill.吸血比例);
  }

  if (skill.禁疗回合 > 0) {
    if (!defender._帝骑禁疗回合) defender._帝骑原禁疗 = asNumber(defender.禁疗);
    defender.禁疗 = 1;
    defender._帝骑禁疗回合 = Math.max(defender._帝骑禁疗回合 || 0, Math.trunc(skill.禁疗回合));
    messages.push(`${defender.名号}受到皇家同花顺封印，暂时失去治疗能力。`);
  }

  if (skill.闪避加成 > 0) {
    attacker.闪避率 = Math.min(0.75, asNumber(attacker.闪避率) + skill.闪避加成);
    attacker._帝骑高速反击次数 = Math.max(1, asNumber(attacker._帝骑高速反击次数));
    attacker._帝骑高速反击比例 = Math.max(
      asNumber(attacker._帝骑高速反击比例),
      asNumber(skill.反击比例, 0.35),
    );
    messages.push(`${attacker.名号}进入Hyper Clock Up，闪避提升并准备高速反击。`);
  }

  if (skill.随机形态增益) {
    const roll = Math.max(0, Math.min(0.999999, asNumber(random())));
    const effects = [
      ['圣剑形态', '攻击', 0.12],
      ['圣竿形态', '防御', 0.12],
      ['圣翼形态', '速度', 0.18],
      ['圣枪形态', '暴击率', 0.08],
    ];
    const [form, field, rate] = effects[Math.floor(roll * effects.length)];
    if (field === '暴击率') attacker[field] = Math.min(1, asNumber(attacker[field]) + rate);
    else attacker[field] = Math.trunc(asNumber(attacker[field], 100) * (1 + rate));
    messages.push(`${attacker.名号}切换电王${form}，${field}得到强化。`);
  }

  if (skill.清除控制) {
    attacker.dongjie = false;
    delete attacker._东皇冻结回合;
    messages.push(`${attacker.名号}穿过极光帷幕，清除了自身控制。`);
  }

  if (isBoss && skill.首领最大生命伤害比例 > 0) {
    const ratioDamage = maxHp(defender) * skill.首领最大生命伤害比例;
    const cap = asNumber(attacker.攻击) * asNumber(skill.首领伤害攻击上限, 10);
    bonusDamage = Math.max(0, Math.trunc(Math.min(ratioDamage, cap)));
    if (bonusDamage > 0) messages.push(`世界破坏之力撕开首领法则，追加${bonusDamage}点比例伤害。`);
  }

  return { messages, bonusDamage };
}

export function resolveDecadeDodgeCounter(defender, source) {
  const charges = Math.max(0, Math.trunc(asNumber(defender?._帝骑高速反击次数)));
  if (charges <= 0 || !source) return { triggered: false, counterDamage: 0 };

  defender._帝骑高速反击次数 = charges - 1;
  const counterDamage = Math.max(
    1,
    Math.trunc(asNumber(defender.攻击, 1) * asNumber(defender._帝骑高速反击比例, 0.35)),
  );
  source.当前血量 = Math.max(0, asNumber(source.当前血量) - counterDamage);

  return {
    triggered: true,
    counterDamage,
    message: `【Hyper Clock Up】${defender.名号}在时间加速中避开攻击，反击${source.名号}造成${counterDamage}点伤害！`,
  };
}

export function resolveDecadeAuroraCurtain(
  defender,
  source,
  incomingDamage,
  { shieldField = '护盾值' } = {},
) {
  const damage = Math.max(0, asNumber(incomingDamage));
  if (
    defender?.灵根?.name !== '帝骑·终极神主' ||
    defender._帝骑极光帷幕已触发 ||
    damage < asNumber(defender.当前血量, 1)
  ) {
    return { triggered: false, damage };
  }

  defender._帝骑极光帷幕已触发 = true;
  const shield = Math.trunc(maxHp(defender) * 0.25);
  defender[shieldField] = Math.max(0, asNumber(defender[shieldField])) + shield;
  const counterDamage = source
    ? Math.max(1, Math.trunc(asNumber(defender.攻击, 1) * 3))
    : 0;
  if (source && counterDamage > 0) {
    source.当前血量 = Math.max(0, asNumber(source.当前血量) - counterDamage);
  }

  return {
    triggered: true,
    damage: 0,
    shield,
    counterDamage,
    message: `【极光帷幕·逆转】${defender.名号}遁入世界夹缝避开致命一击，获得${shield}点护盾${source ? `，并反击${source.名号}造成${counterDamage}点伤害` : ''}！`,
  };
}
