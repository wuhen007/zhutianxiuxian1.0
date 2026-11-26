import { getSuiyunStage } from './suiyun.js';
import { capRealmAuthorityForBattle, getRealmAuthorityLevel } from './realmAuthority.js';

const sourcePlayers = new WeakMap();
const realmFields = ['mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id'];
const playerUnit = unit => unit && !unit.boss && unit.type !== 'boss' && !unit.isNPC && !unit.isNpc && !unit._xianguNpcCompanion
  && !unit.天骄 && !unit.isTianjiao && !unit._tahua_type && !unit._yiqihua_entity
  && !unit._万灵魔幡主魂 && !unit._帝骑分身 && !unit._圆神分身 && unit.分身 !== true;

/** 只由已确认的PVP入口开启，ID/灵根名字本身不足以将PVE识别成玩家对战。 */
export function prepareSuiyunPvpBattle(A_input, B_input, options = {}) {
  if (options._suiyunPvpPrepared || options.pvp === false) return null;
  if (options.timeRiverBattle) return null;
  if (options.pvp !== true && !['pvp', 'xiangu_pvp', 'xiangu_spar'].includes(options.battleType)) return null;
  const teams = [A_input, B_input].map(input => Array.isArray(input) ? input : [input]);
  const plans = [];
  teams.forEach((team, side) => {
    const holders = team.filter(unit => playerUnit(unit) && unit.当前血量 > 0 && getSuiyunStage(unit));
    for (const holder of holders) {
      const rank = getRealmAuthorityLevel(holder);
      teams[1 - side].forEach((opponent, index) => {
        if (!playerUnit(opponent) || !(opponent.当前血量 > 0) || getRealmAuthorityLevel(opponent) <= rank) return;
        const previous = plans.find(plan => plan.side === 1 - side && plan.index === index);
        if (previous) previous.rank = Math.min(previous.rank, rank);
        else plans.push({ side: 1 - side, index, rank, holder });
      });
    }
  });
  if (!plans.length) return null;
  const copies = teams.map(team => team.map(unit => {
    const copy = structuredClone(unit);
    sourcePlayers.set(copy, getSuiyunPvpSource(unit));
    return copy;
  }));
  const messages = [];
  for (const { side, index, rank, holder } of plans) {
    const opponent = copies[side][index];
    const before = getRealmAuthorityLevel(opponent);
    capRealmAuthorityForBattle(opponent, rank);
    messages.push(`【岁云·同境裁决】${holder.名号 || '岁云修士'}令${opponent.名号 || '对手'}的额外体系等效境界由${before}压至${rank}，本场PVP强制同境。`);
  }
  return {
    A_input: Array.isArray(A_input) ? copies[0] : copies[0][0],
    B_input: Array.isArray(B_input) ? copies[1] : copies[1][0],
    sources: teams, messages,
  };
}

/** 修炼熟练度、炼魂等持久化结算始终引用真实来源，绝不使用临时同境副本。 */
export function getSuiyunPvpSource(unit) {
  return sourcePlayers.get(unit) || unit;
}

export function restoreSuiyunPvpResult(result, opening) {
  for (const [side, key] of [[0, 'A_team'], [1, 'B_team']]) {
    const team = result[key];
    if (!Array.isArray(team)) continue;
    opening.sources[side].forEach((source, index) => {
      if (!team[index]) return;
      for (const field of realmFields) {
        if (Object.hasOwn(source, field)) team[index][field] = source[field];
        else delete team[index][field];
      }
    });
  }
  result.msg.unshift(...opening.messages);
  return result;
}
