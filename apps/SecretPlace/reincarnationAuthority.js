const REALM_REQUIREMENTS = {
  rescue: {
    mijing: ['斩道王者'],
    xiangu: ['真一境'],
  },
  control: {
    mijing: ['大帝'],
    // 当前《仙古今世法》境界表以“至尊境”表示极道至尊层次。
    xiangu: ['极道至尊', '至尊境'],
  },
};

function toLevelId(value) {
  const levelId = Number(value);
  return Number.isFinite(levelId) ? levelId : 0;
}

function findRequiredLevel(levels, names) {
  for (const name of names) {
    const exact = levels.find(item => item?.level === name);
    if (exact) return exact;

    const included = levels.find(item => item?.level?.includes(name));
    if (included) return included;
  }
  return null;
}

export function resolveReincarnationThresholds(mijingLevels = [], xianguLevels = []) {
  const rescueMijing = findRequiredLevel(mijingLevels, REALM_REQUIREMENTS.rescue.mijing);
  const rescueXiangu = findRequiredLevel(xianguLevels, REALM_REQUIREMENTS.rescue.xiangu);
  const controlMijing = findRequiredLevel(mijingLevels, REALM_REQUIREMENTS.control.mijing);
  const controlXiangu = findRequiredLevel(xianguLevels, REALM_REQUIREMENTS.control.xiangu);

  if (!rescueMijing || !rescueXiangu || !controlMijing || !controlXiangu) {
    throw new Error('轮回权限境界配置不完整，请检查秘境体系与仙古今世法境界表');
  }

  return {
    rescue: {
      mijingLevelId: toLevelId(rescueMijing.level_id),
      mijingName: rescueMijing.level,
      xianguLevelId: toLevelId(rescueXiangu.level_id),
      xianguName: rescueXiangu.level,
    },
    control: {
      mijingLevelId: toLevelId(controlMijing.level_id),
      mijingName: controlMijing.level,
      xianguLevelId: toLevelId(controlXiangu.level_id),
      xianguName: controlXiangu.level,
    },
  };
}

export function getReincarnationAuthority(player, mijingLevels = [], xianguLevels = []) {
  const thresholds = resolveReincarnationThresholds(mijingLevels, xianguLevels);
  const mijingLevelId = toLevelId(player?.mijinglevel_id);
  const xianguLevelId = toLevelId(player?.xiangulevel_id);

  return {
    canRescue:
      mijingLevelId >= thresholds.rescue.mijingLevelId ||
      xianguLevelId >= thresholds.rescue.xianguLevelId,
    canControl:
      mijingLevelId >= thresholds.control.mijingLevelId ||
      xianguLevelId >= thresholds.control.xianguLevelId,
    thresholds,
  };
}

export function getPlayerRealmNames(player, mijingLevels = [], xianguLevels = []) {
  const mijing = mijingLevels.find(
    item => toLevelId(item?.level_id) === toLevelId(player?.mijinglevel_id)
  );
  const xiangu = xianguLevels.find(
    item => toLevelId(item?.level_id) === toLevelId(player?.xiangulevel_id)
  );

  return {
    mijing: mijing?.level || '未入秘境体系',
    xiangu: xiangu?.level || '未入仙古今世法',
  };
}

export function applyReincarnationDecision(task, status, controller, now = Date.now()) {
  if (!['allow', 'deny'].includes(status)) {
    throw new TypeError(`无效的轮回裁定：${status}`);
  }

  return {
    ...task,
    end_time: status === 'allow' ? now : task.end_time,
    status: status === 'allow' ? '已获准往生' : '已驳回往生',
    rebirth_decision: {
      status,
      controller_id: String(controller.player_id),
      controller_name: controller.player_name,
      decided_at: now,
    },
  };
}

export function requiresControllerDecision(task, controller) {
  return Boolean(
    controller && task?.rebirth_decision?.status !== 'allow'
  );
}

