import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  addJuelingAwareLifespan,
  hasJuelingLifespan,
  releaseJuelingLifespanForAuthority,
  restoreJuelingLifespan,
  suppressJuelingLifespan,
} from '../model/juelingLifespan.js';

test('绝灵时代突破寿元完整计入真实值，显示值不超过9999', () => {
  const player = { 寿元: 9999, 压制寿元: 100000, mijinglevel_id: 10 };
  const gain = addJuelingAwareLifespan(player, 5000, 4);

  assert.deepEqual(gain, { added: 5000, visibleAdded: 0, suppressed: true });
  assert.equal(player.寿元, 9999);
  assert.equal(player.压制寿元, 105000);
});

test('绝灵时代未满上限时同步增加显示寿元和真实寿元', () => {
  const player = { 寿元: 9000, mijinglevel_id: 10 };
  const gain = addJuelingAwareLifespan(player, 1500, 4);

  assert.deepEqual(gain, { added: 1500, visibleAdded: 999, suppressed: true });
  assert.equal(player.寿元, 9999);
  assert.equal(player.压制寿元, 10500);
});

test('仙王权限解除旧压制，零寿元压制记录也可恢复', () => {
  const authorityPlayer = { 寿元: 9999, 压制寿元: 50000, xiangulevel_id: 17 };
  assert.equal(releaseJuelingLifespanForAuthority(authorityPlayer), true);
  assert.equal(authorityPlayer.寿元, 50000);
  assert.equal(hasJuelingLifespan(authorityPlayer), false);

  const zeroPlayer = { 寿元: 1, 压制寿元: 0 };
  assert.equal(restoreJuelingLifespan(zeroPlayer), true);
  assert.equal(zeroPlayer.寿元, 0);
});

test('压制与恢复基础规则保持可逆', () => {
  const player = { 寿元: 20000, mijinglevel_id: 10 };
  assert.equal(suppressJuelingLifespan(player), true);
  assert.equal(player.寿元, 9999);
  assert.equal(player.压制寿元, 20000);
  assert.equal(restoreJuelingLifespan(player), true);
  assert.equal(player.寿元, 20000);
});

test('时代入口和新玩家入口共用加锁后的绝灵寿元服务', () => {
  const levelSource = fs.readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');
  const startSource = fs.readFileSync(new URL('../apps/User/UserStart.js', import.meta.url), 'utf8');
  const eraSource = fs.readFileSync(new URL('../apps/tasks/EraChangeTask.js', import.meta.url), 'utf8');
  const reshapeSource = fs.readFileSync(new URL('../apps/tasks/EraStatusPlugin.js', import.meta.url), 'utf8');
  const serviceSource = fs.readFileSync(new URL('../apps/tasks/juelingLifespanService.js', import.meta.url), 'utf8');

  assert.equal(levelSource.match(/addJuelingAwareLifespan\(player,/g)?.length, 4);
  assert.equal(startSource.match(/await writeCreatedPlayer\(/g)?.length, 2);
  assert.match(eraSource, /applyEraLifespanTransition/);
  assert.match(reshapeSource, /restoreAllPlayerLifespans/);
  assert.match(reshapeSource, /suppressAllPlayerLifespans/);
  assert.match(
    reshapeSource,
    /const highland = getPlaneDestructionInfo\([\s\S]*?'厄土高原'[\s\S]*?if \(!highland\.destroyed\)/,
  );
  assert.ok(
    reshapeSource.indexOf('if (!highland.destroyed)') < reshapeSource.indexOf("const set = config.getConfig('xiuxian', 'xiuxian')"),
  );
  assert.match(serviceSource, /withPlayerLocks\(playerIds/);
  assert.match(serviceSource, /written\.reverse\(\)/);
});
