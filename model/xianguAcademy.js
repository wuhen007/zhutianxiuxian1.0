export const XIANGU_ACADEMY_NAME = '天神书院';
import { PLACE_LOCATION_MAP } from './weimianTravel.js';

export const XIANGU_ACADEMY_BRANCHES = ['仙院', '圣院'];

export const XIANGU_ACADEMY_RANKS = [
  {
    name: '外院弟子',
    realmLevel: 7,
    realmName: '尊者境',
    cost: 0,
    salary: 100000,
  },
  {
    name: '内院弟子',
    realmLevel: 8,
    realmName: '神火境',
    cost: 500000,
    salary: 500000,
  },
  {
    name: '核心弟子',
    realmLevel: 9,
    realmName: '真一境',
    cost: 2000000,
    salary: 2000000,
  },
  {
    name: '长老亲传',
    realmLevel: 11,
    realmName: '天神境',
    cost: 8000000,
    salary: 5000000,
  },
  {
    name: '书院首席',
    realmLevel: 12,
    realmName: '虚道境',
    cost: 20000000,
    salary: 12000000,
  },
];

export function getAcademyAdmission(player = {}) {
  if (player.仙古院籍?.学院) {
    return { ok: false, reason: 'joined', message: '你已经拥有天神书院院籍。' };
  }
  if (Number(player.power_place) !== PLACE_LOCATION_MAP.九天十地) {
    return {
      ok: false,
      reason: 'plane',
      message: '天神书院位于九天十地，请先前往九天十地。',
    };
  }
  if (
    (Number(player.xiangulevel_id) || 0) < XIANGU_ACADEMY_RANKS[0].realmLevel
  ) {
    return {
      ok: false,
      reason: 'realm',
      message: '申请天神书院至少需要达到尊者境。',
    };
  }
  return { ok: true };
}

export function createAcademyRecord(now = Date.now()) {
  return {
    学院: XIANGU_ACADEMY_NAME,
    分院: '',
    身份: XIANGU_ACADEMY_RANKS[0].name,
    入院时间: now,
  };
}

export function getAcademyRank(record) {
  return (
    XIANGU_ACADEMY_RANKS.find((rank) => rank.name === record?.身份) || null
  );
}

export function getAcademyNextRank(record) {
  const index = XIANGU_ACADEMY_RANKS.findIndex(
    (rank) => rank.name === record?.身份
  );
  return index >= 0 ? XIANGU_ACADEMY_RANKS[index + 1] || null : null;
}

export function getAcademyPromotion(record, player = {}) {
  const current = getAcademyRank(record);
  if (!current)
    return {
      ok: false,
      reason: 'invalid',
      message: '院籍身份异常，请联系管理员处理。',
    };
  const next = getAcademyNextRank(record);
  if (!next)
    return {
      ok: false,
      reason: 'max',
      current,
      message: '你已经是天神书院首席。',
    };
  if ((Number(player.xiangulevel_id) || 0) < next.realmLevel) {
    return {
      ok: false,
      reason: 'realm',
      current,
      next,
      message: `晋升${next.name}需要达到${next.realmName}。`,
    };
  }
  if ((Number(player.源石) || 0) < next.cost) {
    return {
      ok: false,
      reason: 'cost',
      current,
      next,
      message: `晋升${next.name}需要${next.cost.toLocaleString()}源石。`,
    };
  }
  return { ok: true, current, next };
}

export function applyAcademyPromotion(record, nextRank, now = Date.now()) {
  record.身份 = nextRank.name;
  record.最近晋升时间 = now;
  return record;
}

export function selectAcademyBranch(record, branch) {
  if (!XIANGU_ACADEMY_BRANCHES.includes(branch)) {
    return { ok: false, reason: 'invalid', message: '只能选择仙院或圣院。' };
  }
  if (record?.分院) {
    return {
      ok: false,
      reason: record.分院 === branch ? 'same' : 'chosen',
      message:
        record.分院 === branch
          ? `你已经选择了${branch}。`
          : `你已经选择${record.分院}，修行方向不可重复选择。`,
    };
  }
  record.分院 = branch;
  record.分院选择时间 = Date.now();
  return { ok: true, branch };
}

export function getAcademySalary(record) {
  return getAcademyRank(record)?.salary || 0;
}
