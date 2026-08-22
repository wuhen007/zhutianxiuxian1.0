import assert from 'node:assert/strict';
import test from 'node:test';

import {
    completeZhiXianTask,
    ensureZhiXianState,
    hasCompletedZhiXian,
    migrateCompletedZhiXianTasks,
    validateZhiXianChoice,
    validateZhiXianSubmission,
} from '../apps/meirrenwu/zhixianChoice.js';

function playerWithTask(taskId, progress) {
    const player = {
        支线任务: [taskId],
        支线任务进度: {},
    };
    if (progress !== undefined) player.支线任务进度[taskId] = progress;
    return player;
}

test('未接取任务时不能直接选择并领取奖励', () => {
    const result = validateZhiXianChoice({ 支线任务: [], 支线任务进度: {} }, 1, 2);

    assert.equal(result.ok, false);
    assert.equal(result.message, '你未接取该支线任务。');
});

test('只有任务1和任务2的有效选项可以提交', () => {
    assert.equal(validateZhiXianChoice(playerWithTask(1), 1, 1).ok, true);
    assert.equal(validateZhiXianChoice(playerWithTask(1), 1, 2).ok, true);
    assert.equal(validateZhiXianChoice(playerWithTask(2), 2, 1).ok, true);
    assert.equal(validateZhiXianChoice(playerWithTask(2), 2, 2).ok, true);

    assert.equal(validateZhiXianChoice(playerWithTask(1), 1, 3).ok, false);
    assert.equal(validateZhiXianChoice(playerWithTask(3), 3, 1).ok, false);
});

test('缺少进度时按第一阶段处理', () => {
    assert.equal(validateZhiXianChoice(playerWithTask(1), 1, 1).ok, true);
});

test('成功选择并进入第二阶段后不能重复领奖', () => {
    const result = validateZhiXianChoice(playerWithTask(2, { 阶段: 2 }), 2, 2);

    assert.equal(result.ok, false);
    assert.equal(result.message, '该支线任务已经做出选择，不能重复领取奖励。');
});

test('缺失或异常的支线字段会被统一修复', () => {
    const player = {
        支线任务: ['1', 1, 'x', 4],
        支线任务进度: [],
        支线任务完成记录: null,
    };

    assert.equal(ensureZhiXianState(player), true);
    assert.deepEqual(player.支线任务, [1, 4]);
    assert.deepEqual(player.支线任务进度, {});
    assert.deepEqual(player.支线任务完成记录, {});
});

test('选择任务只能走选择指令，不能直接提交', () => {
    const result = validateZhiXianSubmission(playerWithTask(1, { 阶段: 1 }), 1, 1);

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'choice-required');
});

test('普通多阶段任务仍可按当前阶段提交', () => {
    const result = validateZhiXianSubmission(playerWithTask(4, { 阶段: 2 }), 4, 3);

    assert.deepEqual(result, { ok: true, stage: 2 });
});

test('任务完成后清理进度并阻止重复提交和选择', () => {
    const player = playerWithTask(1, { 阶段: 1 });

    completeZhiXianTask(player, 1, { choiceId: 2, completedAt: 123 });

    assert.deepEqual(player.支线任务, []);
    assert.equal(player.支线任务进度[1], undefined);
    assert.equal(hasCompletedZhiXian(player, 1), true);
    assert.deepEqual(player.支线任务完成记录[1], {
        完成时间: 123,
        选择: 2,
        奖励状态: '已领取',
    });
    assert.equal(validateZhiXianChoice(player, 1, 2).ok, false);
    assert.equal(validateZhiXianSubmission(player, 1, 1).reason, 'completed');
});

test('旧版已进入第二阶段的选择任务会迁移为已完成', () => {
    const player = {
        支线任务: [1, 2],
        支线任务进度: {
            1: { 阶段: 2 },
            2: { 阶段: 2 },
        },
        灵根: { name: '魔胎仙体' },
    };

    assert.equal(migrateCompletedZhiXianTasks(player, 456), true);
    assert.deepEqual(player.支线任务, []);
    assert.equal(player.支线任务完成记录[1].选择, 1);
    assert.equal(player.支线任务完成记录[2].选择, 2);
    assert.equal(player.支线任务完成记录[1].旧存档迁移, 1);
    assert.equal(player.支线任务完成记录[2].完成时间, 456);
});

test('旧版任务4称号会迁移为完成记录，避免重复触发', () => {
    const player = {
        支线任务: [],
        支线任务进度: {},
        称号列表: ['世外逍遥客'],
    };

    assert.equal(migrateCompletedZhiXianTasks(player, 789), true);
    assert.equal(hasCompletedZhiXian(player, 4), true);
    assert.equal(player.支线任务完成记录[4].旧存档迁移, 1);
    assert.equal(player.支线任务完成记录[4].完成时间, 789);
});

test('任务4已完成但称号缺失时会自动补发', () => {
    const player = {
        支线任务: [],
        支线任务进度: {},
        支线任务完成记录: {
            4: { 完成时间: 123, 奖励状态: '已领取' },
        },
    };

    assert.equal(migrateCompletedZhiXianTasks(player, 789), true);
    assert.deepEqual(player.称号列表, ['世外逍遥客']);
    assert.equal(migrateCompletedZhiXianTasks(player, 789), false);
});
