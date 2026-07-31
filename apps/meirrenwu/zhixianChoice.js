const choiceIdsByTask = {
    1: new Set([1, 2]),
    2: new Set([1, 2]),
};

export function validateZhiXianChoice(player, taskId, choiceId) {
    const activeTasks = Array.isArray(player?.支线任务) ? player.支线任务 : [];
    if (!activeTasks.includes(taskId)) {
        return { ok: false, message: '你未接取该支线任务。' };
    }

    const allowedChoiceIds = choiceIdsByTask[taskId];
    if (!allowedChoiceIds) {
        return { ok: false, message: '该支线任务没有可选择的分支。' };
    }

    if (!allowedChoiceIds.has(choiceId)) {
        return { ok: false, message: '无效的支线任务选项。' };
    }

    const stage = Number(player?.支线任务进度?.[taskId]?.阶段 ?? 1);
    if (stage !== 1) {
        return { ok: false, message: '该支线任务已经做出选择，不能重复领取奖励。' };
    }

    return { ok: true };
}
