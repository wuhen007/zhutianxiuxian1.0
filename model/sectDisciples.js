export const DISCIPLE_SPECIALTIES = ["采药", "炼丹", "炼器", "阵法", "护山", "外务"];
export const DISCIPLE_MANAGE_POSITIONS = new Set(["宗主", "副宗主", "长老"]);

const APTITUDE_POOL = [
  ["平庸之资", 60],
  ["超凡资质", 23],
  ["天纵之资", 10],
  ["旷世奇才", 5],
  ["绝世天骄", 2],
];
const ROOT_TYPE_WEIGHT = {
  大道体: 0.00001,
  至尊体: 0.0001,
  圣体: 0.0009,
  霸体: 0.001,
  神王体: 0.0011,
  道胎: 0.0012,
  神体: 0.002,
  妖体: 0.005,
  天灵根: 0.08,
  变异灵根: 0.05,
  体质: 0.2,
  真灵根: 0.29,
  伪灵根: 0.36869,
};
const SURNAME = ["沈", "顾", "陆", "苏", "叶", "萧", "楚", "姜", "宁", "林"];
const GIVEN = ["清", "玄", "长", "昭", "云", "星", "宁", "寒", "月", "川", "瑶", "离"];
const SPECIALTY_RATE = { 采药: 1, 炼丹: 1.15, 炼器: 1.1, 阵法: 1.08, 护山: 1.05, 外务: 1.2 };
const SPECIALTY_ROOT_KEYS = {
  采药: ["木", "水", "草", "生命"],
  炼丹: ["火", "木", "阴", "阳"],
  炼器: ["金", "火", "雷", "器"],
  阵法: ["土", "水", "空", "道"],
  护山: ["土", "金", "霸", "体"],
  外务: ["风", "雷", "光", "暗", "时"],
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pick(list, random) {
  const index = Math.max(0, Math.min(list.length - 1, Math.floor(random() * list.length)));
  return list[index];
}

function weightedPick(list, random) {
  const total = list.reduce((sum, item) => sum + item[1], 0);
  let cursor = random() * total;
  for (const item of list) {
    cursor -= item[1];
    if (cursor < 0) return item[0];
  }
  return list[list.length - 1][0];
}

function pickTalent(talentList, random) {
  const grouped = new Map();
  for (const talent of talentList) {
    const type = talent?.type || "伪灵根";
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(talent);
  }
  const availableTypes = [...grouped.keys()].map((type) => [type, ROOT_TYPE_WEIGHT[type] || 0.01]);
  const type = weightedPick(availableTypes, random);
  return pick(grouped.get(type) || talentList, random);
}

export function getDiscipleAffinity(root, specialty) {
  const rootName = String(root?.name || "");
  return (SPECIALTY_ROOT_KEYS[specialty] || []).some((key) => rootName.includes(key)) ? 1.25 : 1;
}

export function ensureSectDisciples(association) {
  if (!Array.isArray(association.宗门弟子)) association.宗门弟子 = [];
  association.宗门弟子序号 = Math.max(
    0,
    Math.trunc(finite(association.宗门弟子序号))
  );
  if (!association.宗门仓库 || typeof association.宗门仓库 !== "object") {
    association.宗门仓库 = { 药材: 0, 丹药: 0, 法器: 0 };
  }
  association.宗门仓库.药材 = Math.max(0, finite(association.宗门仓库.药材));
  association.宗门仓库.丹药 = Math.max(0, finite(association.宗门仓库.丹药));
  association.宗门仓库.法器 = Math.max(0, finite(association.宗门仓库.法器));
  association.宗门声望 = Math.max(0, finite(association.宗门声望));
  if (!association.宗门运营 || typeof association.宗门运营 !== "object") {
    association.宗门运营 = { 上次结算: Date.now(), 连续运营: 0 };
  }
  association.宗门运营.上次结算 = finite(
    association.宗门运营.上次结算,
    Date.now()
  );
  association.宗门运营.连续运营 = Math.max(
    0,
    Math.trunc(finite(association.宗门运营.连续运营))
  );
  return association;
}

export function getDiscipleCapacity(association) {
  return Math.max(3, Math.trunc(finite(association?.宗门等级, 1)) * 3);
}

export function getRecruitCost(association) {
  return 10000 + Math.max(1, Math.trunc(finite(association?.宗门等级, 1))) * 5000;
}

export function recruitDisciple(association, { talentList = [], now = Date.now(), random = Math.random } = {}) {
  ensureSectDisciples(association);
  if (association.宗门弟子.length >= getDiscipleCapacity(association)) {
    return { ok: false, reason: "capacity", message: "宗门弟子名额已满，请先升级宗门。" };
  }
  if (!talentList.length) {
    return { ok: false, reason: "talent", message: "灵根库为空，暂时无法招募弟子。" };
  }

  association.宗门弟子序号 += 1;
  const root = clone(pickTalent(talentList, random));
  const aptitude = weightedPick(APTITUDE_POOL, random);
  const specialty = pick(DISCIPLE_SPECIALTIES, random);
  const id = association.宗门弟子序号;
  const disciple = {
    id,
    名号: `${pick(SURNAME, random)}${pick(GIVEN, random)}${pick(GIVEN, random)}`,
    灵根: root,
    天资等级: aptitude,
    专长: specialty,
    灵根契合度: getDiscipleAffinity(root, specialty),
    境界: "练气",
    培养等级: 0,
    忠诚度: 60 + Math.trunc(random() * 31),
    状态: "待命",
    招募时间: now,
  };
  association.宗门弟子.push(disciple);
  return { ok: true, disciple, cost: getRecruitCost(association) };
}

export function trainDisciple(association, id) {
  ensureSectDisciples(association);
  const disciple = association.宗门弟子.find((item) => item.id === Number(id));
  if (!disciple) return { ok: false, message: "找不到这名宗门弟子。" };
  if (disciple.培养等级 >= 5) return { ok: false, message: "该弟子已培养至当前上限。" };
  const cost = 10000 * (disciple.培养等级 + 1);
  if (finite(association.灵石池) < cost) {
    return { ok: false, message: `宗门灵石池不足，需要${cost}灵石。` };
  }
  association.灵石池 -= cost;
  disciple.培养等级 += 1;
  disciple.忠诚度 = Math.min(100, finite(disciple.忠诚度, 60) + 5);
  return { ok: true, disciple, cost };
}

export function assignDisciple(association, id, specialty) {
  ensureSectDisciples(association);
  if (!DISCIPLE_SPECIALTIES.includes(specialty)) return { ok: false, message: "未知的弟子专长。" };
  const disciple = association.宗门弟子.find((item) => item.id === Number(id));
  if (!disciple) return { ok: false, message: "找不到这名宗门弟子。" };
  disciple.专长 = specialty;
  disciple.状态 = "任职";
  return { ok: true, disciple };
}

const DAY = 24 * 60 * 60 * 1000;

export function settleSectOperations(association, now = Date.now()) {
  ensureSectDisciples(association);
  const operation = association.宗门运营;
  const days = Math.min(7, Math.max(0, Math.floor((now - operation.上次结算) / DAY)));
  if (!days) return { ok: true, days: 0, message: "尚未到每日结算时间。" };

  const active = association.宗门弟子.filter((item) => item.状态 === "任职");
  const level = Math.max(1, Math.trunc(finite(association.宗门等级, 1)));
  const upkeep = (1000 * level + active.length * 500) * days;
  if (finite(association.灵石池) < upkeep) {
    operation.连续运营 = 0;
    operation.上次结算 += days * DAY;
    return { ok: false, days, upkeep, message: `灵石池不足，无法维持运营，需要${upkeep}灵石。` };
  }

  association.灵石池 -= upkeep;
  let produced = { 药材: 0, 丹药: 0, 法器: 0, 灵石: 0 };
  for (const disciple of active) {
    const multiplier = SPECIALTY_RATE[disciple.专长] * (disciple.灵根契合度 || 1) * (1 + finite(disciple.培养等级) * 0.2);
    const amount = Math.max(1, Math.trunc(multiplier * days));
    if (disciple.专长 === "采药") produced.药材 += amount * 10;
    if (disciple.专长 === "炼丹") produced.丹药 += amount * 5;
    if (disciple.专长 === "炼器") produced.法器 += amount * 2;
    if (disciple.专长 === "外务") produced.灵石 += amount * 3000;
    if (disciple.专长 === "阵法") association.宗门声望 += amount * 2;
    if (disciple.专长 === "护山") association.宗门声望 += amount;
    disciple.忠诚度 = Math.min(100, finite(disciple.忠诚度, 60) + 1);
  }
  association.宗门仓库.药材 += produced.药材;
  association.宗门仓库.丹药 += produced.丹药;
  association.宗门仓库.法器 += produced.法器;
  association.灵石池 += produced.灵石;
  operation.连续运营 += days;
  operation.上次结算 += days * DAY;
  return { ok: true, days, upkeep, produced, reputation: association.宗门声望 };
}

export function formatDisciple(disciple) {
  const affinity = Number(disciple.灵根契合度) > 1 ? "高契合" : "普通契合";
  return `#${disciple.id} ${disciple.名号}｜${disciple.灵根?.name || "未知灵根"}｜${disciple.天资等级}｜${disciple.专长}(${affinity})｜培养${disciple.培养等级}/5｜${disciple.状态}`;
}
