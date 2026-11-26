import { grantTitle } from '../../model/titleSystem.js';

const choiceIdsByTask = {
    1: new Set([1, 2]),
    2: new Set([1, 2]),
};

export function ensureZhiXianState(player) {
    if (!player || typeof player !== 'object') return false;

    let changed = false;
    if (!Array.isArray(player.支线任务)) {
        player.支线任务 = [];
        changed = true;
    } else {
        const normalized = [...new Set(player.支线任务
            .map(Number)
            .filter(Number.isInteger))];
        if (normalized.length !== player.支线任务.length ||
            normalized.some((id, index) => id !== player.支线任务[index])) {
            player.支线任务 = normalized;
            changed = true;
        }
    }
    if (!player.支线任务进度 || typeof player.支线任务进度 !== 'object' || Array.isArray(player.支线任务进度)) {
        player.支线任务进度 = {};
        changed = true;
    }
    if (!player.支线任务完成记录 || typeof player.支线任务完成记录 !== 'object' || Array.isArray(player.支线任务完成记录)) {
        player.支线任务完成记录 = {};
        changed = true;
    }
    return changed;
}

export function hasCompletedZhiXian(player, taskId) {
    ensureZhiXianState(player);
    return Boolean(player?.支线任务完成记录?.[taskId]);
}

export function completeZhiXianTask(player, taskId, options = {}) {
    ensureZhiXianState(player);
    const numericTaskId = Number(taskId);
    player.支线任务 = player.支线任务.filter(id => id !== numericTaskId);
    delete player.支线任务进度[numericTaskId];
    player.支线任务完成记录[numericTaskId] = {
        完成时间: Number(options.completedAt) || Date.now(),
        选择: Number(options.choiceId) || 0,
        奖励状态: '已领取',
        ...(options.migrated ? { 旧存档迁移: 1 } : {}),
    };
    return player.支线任务完成记录[numericTaskId];
}

export function migrateCompletedZhiXianTasks(player, now = Date.now()) {
    const changed = ensureZhiXianState(player);
    let migrated = changed;

    for (const taskId of [1, 2]) {
        const stage = Number(player.支线任务进度?.[taskId]?.阶段) || 1;
        if (!player.支线任务.includes(taskId) || stage <= 1) continue;

        const choiceId = taskId === 1
            ? (player.灵根?.name === '魔胎仙体' ? 1 : 2)
            : (player.武道天眼 || player.乱古战意 ? 1 : 2);
        completeZhiXianTask(player, taskId, {
            choiceId,
            completedAt: now,
            migrated: true,
        });
        migrated = true;
    }

    if (!player.支线任务完成记录[4] && player.称号列表?.includes('世外逍遥客')) {
        completeZhiXianTask(player, 4, {
            completedAt: now,
            migrated: true,
        });
        migrated = true;
    }
    if (player.支线任务完成记录[4] && grantTitle(player, '世外逍遥客')) {
        migrated = true;
    }
    return migrated;
}

export function isZhiXianChoiceTask(taskId) {
    return Boolean(choiceIdsByTask[Number(taskId)]);
}

export function validateZhiXianChoice(player, taskId, choiceId) {
    ensureZhiXianState(player);
    if (hasCompletedZhiXian(player, taskId)) {
        return { ok: false, message: '该支线任务已经完成，不能重复领取奖励。' };
    }

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

export function validateZhiXianSubmission(player, taskId, stageCount) {
    ensureZhiXianState(player);
    const numericTaskId = Number(taskId);
    if (hasCompletedZhiXian(player, numericTaskId)) {
        return { ok: false, reason: 'completed', message: '该支线任务已经完成。' };
    }
    if (!player.支线任务.includes(numericTaskId)) {
        return { ok: false, reason: 'inactive', message: '你未接取该支线任务。' };
    }
    if (isZhiXianChoiceTask(numericTaskId)) {
        return { ok: false, reason: 'choice-required', message: `该任务需要先做出选择，请发送 #支线任务详情${numericTaskId} 查看选项。` };
    }

    const stage = Number(player.支线任务进度?.[numericTaskId]?.阶段 ?? 1);
    const maxStage = Number(stageCount);
    if (!Number.isInteger(maxStage) || maxStage < 1 ||
        !Number.isInteger(stage) || stage < 1 || stage > maxStage) {
        return { ok: false, reason: 'invalid-stage', message: '任务进度异常，请联系管理员修复。' };
    }
    return { ok: true, stage };
}
