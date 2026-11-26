import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  OWN_WAY_ROUTE_REALM_GATES,
  bindOwnWayRoute,
  getOwnWayRealmGate,
  resolveOwnWayRoute,
} from '../model/ownWayRealm.js';

const ROUTE_FIELDS = Object.freeze({
  mijing: 'mijinglevel_id',
  xiangu: 'xiangulevel_id',
  huafen: 'huafenlevel_id',
});

const ROUTE_LEVEL_FILES = Object.freeze({
  mijing: '../resources/data/Level/秘境体系.json',
  xiangu: '../resources/data/Level/仙古今世法.json',
  huafen: '../resources/data/Level/花粉进化路体系.json',
});

function normalizedRealmName(value) {
  return String(value || '').replace(/[·—－\-\s/]/g, '');
}

test('自身之道八次突破分别匹配三大体系的实际境界', () => {
  assert.equal(OWN_WAY_ROUTE_REALM_GATES.length, 8);
  for (const gate of OWN_WAY_ROUTE_REALM_GATES) {
    for (const [route, requirement] of Object.entries(gate.requirements)) {
      const field = ROUTE_FIELDS[route];
      const player = {
        自身之道体系: route,
        mijinglevel_id: 24,
        xiangulevel_id: 25,
        huafenlevel_id: 25,
        [field]: requirement.realmId - 1,
      };

      const blocked = getOwnWayRealmGate(player, gate.target);
      assert.equal(blocked.ok, false, `${route}第${gate.target}次突破不应由其他体系代替放行`);
      assert.equal(blocked.field, field);
      assert.equal(blocked.requiredRealmId, requirement.realmId);

      player[field] = requirement.realmId;
      const ready = getOwnWayRealmGate(player, gate.target);
      assert.equal(ready.ok, true, `${route}第${gate.target}次突破应在对应境界放行`);
    }
  }
});

test('自身之道门槛编号和名称与三大体系原始境界表一致', () => {
  for (const [route, relativePath] of Object.entries(ROUTE_LEVEL_FILES)) {
    const levels = JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
    const creationGate = getOwnWayRealmGate({ 自身之道体系: route }, 0);
    const requirements = [
      creationGate,
      ...OWN_WAY_ROUTE_REALM_GATES.map(gate => gate.requirements[route]),
    ];

    for (const requirement of requirements) {
      const configured = levels.find(level => Number(level.level_id) === requirement.requiredRealmId
        || Number(level.level_id) === requirement.realmId);
      const expectedName = requirement.requiredRealmName || requirement.realmName;
      assert.ok(configured, `${route}缺少${requirement.requiredRealmId || requirement.realmId}级境界配置`);
      assert.ok(
        normalizedRealmName(configured.level).includes(normalizedRealmName(expectedName)),
        `${route}${configured.level_id}级名称应匹配${expectedName}，实际为${configured.level}`,
      );
    }
  }
});

test('自身之道创建后绑定路线，并兼容旧存档的中文主修体系记录', () => {
  const player = {
    自身之道创造: [{ 主修体系: '仙古今世法' }],
    mijinglevel_id: 24,
    xiangulevel_id: 13,
    huafenlevel_id: 25,
  };
  assert.equal(resolveOwnWayRoute(player), 'xiangu');
  assert.equal(getOwnWayRealmGate(player, 1).ok, true);

  assert.equal(bindOwnWayRoute(player, '花粉进化路'), 'huafen');
  assert.equal(player.自身之道体系, 'huafen');
  assert.equal(resolveOwnWayRoute(player), 'huafen');
});

test('自身之道初始阶段也匹配创建体系境界，未知突破阶段会被拦截', () => {
  const player = { 自身之道体系: 'mijing', mijinglevel_id: 13 };
  assert.equal(getOwnWayRealmGate(player, 0).ok, true);
  player.mijinglevel_id = 12;
  assert.equal(getOwnWayRealmGate(player, 0).ok, false);
  assert.equal(getOwnWayRealmGate(player, 99).reason, 'route');
});

test('仙古伴生秘境再高也不会替仙古主修路线通过自身之道门槛', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 21,
    xiangulevel_id: 12,
    huafenlevel_id: 1,
  };
  assert.equal(resolveOwnWayRoute(player), 'xiangu');
  assert.equal(getOwnWayRealmGate(player, 0).ok, true);
  assert.equal(getOwnWayRealmGate(player, 1).ok, false);
});

test('突破入口只校验绑定体系，不再同时索取互斥体系法则', () => {
  const source = readFileSync(new URL('../apps/User/daofa.js', import.meta.url), 'utf8');
  assert.match(source, /getOwnWayRealmGate\(player, nextRealm\.index\)/);
  assert.doesNotMatch(source, /OWN_WAY_BREAKTHROUGH_RULES/);
  assert.doesNotMatch(source, /\['虚道', 1000\].*\['圣王法则', 1000\]/);
});
