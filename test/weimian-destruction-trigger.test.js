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
