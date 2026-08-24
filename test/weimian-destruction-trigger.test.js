import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('位面崩灭只由诡异大祭万界持有', () => {
    const destruction = read('apps/Boss/WeimianDestruction.js');
    const darkRevolt = read('apps/Boss/BOSS2.js');
    const dajie = read('apps/Boss/BOSS3.js');

    assert.doesNotMatch(destruction, /WorldBossStatus2/);
    assert.doesNotMatch(destruction, /recordBlackRevoltPlaneDestruction/);
    assert.doesNotMatch(darkRevolt, /startWeimianDestruction/);
    assert.doesNotMatch(darkRevolt, /stopWeimianDestruction/);
    assert.match(dajie, /startWeimianDestruction/);
    assert.match(dajie, /stopWeimianDestruction/);
});

test('诡异大祭结束后保留厄土仙帝造成的毁灭记录', () => {
    const destruction = read('apps/Boss/WeimianDestruction.js');
    const start = destruction.indexOf('export async function stopWeimianDestruction');
    const end = destruction.indexOf('export async function getDestructionStatus', start);
    const stopBody = destruction.slice(start, end);

    assert.doesNotMatch(stopBody, /destroyedPlanes = new Set/);
    assert.doesNotMatch(stopBody, /DESTRUCTION_REDIS_KEYS\.destroyed/);
    assert.match(destruction, /PLANE_DESTRUCTION_SOURCES\.STRANGE_EMPEROR/);
});
