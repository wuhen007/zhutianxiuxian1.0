export function determineBattleWinner(A_hp, B_hp) {
  if (A_hp > 0 && B_hp <= 0) return 'A';
  if (B_hp > 0 && A_hp <= 0) return 'B';
  return 'draw';
}

/**
 * 校验 A/B 血量字段的语义一致性
 *
 * 不变量：
 *   - winner='A' 必须满足 A_hp > 0 && B_hp <= 0
 *   - winner='B' 必须满足 B_hp > 0 && A_hp <= 0
 *   - A_hp 与 B_hp 都必须 >= 0
 *
 * 不满足时打 warn 日志并返回 false，但**不抛错**（生产环境不宜中断战斗流）。
 * 后续迁移完成后可改为 throw。
 */
function _assertBattleContract(result, source) {
  if (!result || typeof result.A_hp !== 'number' || typeof result.B_hp !== 'number') return false;
  if (result.A_hp < 0 || result.B_hp < 0) {
    console.warn(`[BattleResult] ${source}: 血量出现负数 A_hp=${result.A_hp} B_hp=${result.B_hp}`);
    return false;
  }
  if (result.winner === 'A' && !(result.A_hp > 0 && result.B_hp <= 0)) {
    console.warn(`[BattleResult] ${source}: winner=A 但 A_hp=${result.A_hp} B_hp=${result.B_hp}，可能 A/B 已对调！`);
    return false;
  }
  if (result.winner === 'B' && !(result.B_hp > 0 && result.A_hp <= 0)) {
    console.warn(`[BattleResult] ${source}: winner=B 但 A_hp=${result.A_hp} B_hp=${result.B_hp}，可能 A/B 已对调！`);
    return false;
  }
  return true;
}

export function create1v1BattleResult({
  msg,
  A_player,
  B_player,
  actionOrder,
  A_speed,
  B_speed,
  extra = {}
}) {
  const A_hp = A_player.当前血量;
  const B_hp = B_player.当前血量;
  const A_actions = actionOrder.filter(action => action.name === A_player.名号).length;
  const B_actions = actionOrder.filter(action => action.name === B_player.名号).length;
  const {
    winner = determineBattleWinner(A_hp, B_hp),
    battleEnded = true,
    ...extraFields
  } = extra;

  const result = {
    msg,
    winner,
    battleEnded,
    A_hp,
    B_hp,
    // 兼容旧调用方，迁移完成后删除 A_xue/B_xue。
    A_xue: A_hp,
    B_xue: B_hp,
    actionOrder,
    speedRatio: B_speed / A_speed,
    actualRatio: A_actions > 0 ? B_actions / A_actions : 0,
    ...extraFields
  };

  _assertBattleContract(result, 'create1v1BattleResult');
  return result;
}

export function createTeamBattleResult({ msg, A_team, B_team }) {
  const A_alive = A_team.filter(player => player.当前血量 > 0);
  const B_alive = B_team.filter(player => player.当前血量 > 0);
  const A_hp = A_alive.reduce((sum, player) => sum + player.当前血量, 0);
  const B_hp = B_alive.reduce((sum, player) => sum + player.当前血量, 0);

  const result = {
    msg,
    winner: determineBattleWinner(A_hp, B_hp),
    battleEnded: true,
    A_hp,
    B_hp,
    A_alive_count: A_alive.length,
    B_alive_count: B_alive.length,
    // 兼容旧调用方，迁移完成后删除 A_xue/B_xue。
    A_xue: A_hp,
    B_xue: B_hp,
    A_team,
    B_team
  };

  _assertBattleContract(result, 'createTeamBattleResult');
  return result;
}
