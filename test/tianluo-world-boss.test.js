import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildJailerStats,
  damageJailer,
  ensureJailerState,
} from '../model/tianluoWorldBoss.js';

const level42 = {
  基础攻击: 10000000,
  基础防御: 10000000,
  基础血量: 20000000,
  基础暴击: 0.3,
};
const physique50 = {
  基础攻击: 10000000,
  基础防御: 130000000,
  基础血量: 200000000,
  基础暴击: 0.7,
};

test('囚牢之主属性为练气42、炼体50再加7500万全属性', () => {
  assert.deepEqual(buildJailerStats(level42, physique50), {
    攻击: 95000000,
    防御: 215000000,
    血量: 295000000,
    暴击率: 1,
  });
});

test('囚牢之主使用全服共享血条并在最后一击后消失', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tianluo-'));
  const file = path.join(dir, '位面.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(file, JSON.stringify({ 凡间: 1, 囚牢之主: 1 }), 'utf8');

  assert.deepEqual(ensureJailerState(file, 295000000), {
    alive: true,
    hp: 295000000,
    maxHP: 295000000,
  });
  assert.equal(damageJailer(file, 295000000, 75000000).hp, 220000000);
  assert.equal(damageJailer(file, 295000000, 20000000).hp, 200000000);

  const finalHit = damageJailer(file, 295000000, 300000000);
  assert.equal(finalHit.hp, 0);
  assert.equal(finalHit.defeated, true);
  assert.deepEqual(ensureJailerState(file, 295000000), {
    alive: false,
    hp: 0,
    maxHP: 295000000,
  });

  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.囚牢之主, 0);
  assert.equal(saved.囚牢之主当前血量, 0);
  assert.equal(saved.凡间, 1);
});
