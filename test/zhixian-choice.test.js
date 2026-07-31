import assert from 'node:assert/strict';
import test from 'node:test';

import { validateZhiXianChoice } from '../apps/meirrenwu/zhixianChoice.js';

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
