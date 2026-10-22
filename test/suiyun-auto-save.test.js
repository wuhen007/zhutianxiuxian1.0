import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { activateSuiyun, advanceSuiyunToRealm, createSuiyunRoot } from '../model/suiyun.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const player = () => {
  const p = { id: 'auto-save', mijinglevel_id: 20 };
  activateSuiyun(p);
  return p;
};

function writeFixture() {
  const state = { stored: null, callbacks: 0, warnings: 0, failSettlement: false };
  const source = read('model/xiuxian.js');
  const from = source.indexOf('export async function Write_player('), to = source.indexOf('function normalizeEquipmentSlot(', from);
  // 只替换奖励模块装载边界，实际保存方法和晋阶逻辑原样执行；不触碰真实存档。
  const body = source.slice(from, to).replace('export ', '')
    .replace("await import('../apps/User/Suiyun.js')", 'await loadSuiyunApp()');
  const deps = {
    path, withPlayerMutationLock, advanceSuiyunToRealm,
    assertGlobalInitIdle() {}, assertTribulationWriteAllowed: async () => {},
    __PATH: { player_path: '/fixture' }, fs: { existsSync: () => false },
    isTianmoHuashengPhysique: () => false, releaseJuelingLifespanForAuthority() {},
    syncSuiyunLuckyBonus() {}, rememberImmortalEmperorHistory() {}, markZhutianMirrorSnapshot() {},
    writeJsonAtomically: (_file, p) => { state.stored = clone(p); },
    console: { warn() { state.warnings++; } },
    loadSuiyunApp: async () => ({
      Suiyun: class {
        async settleAutomaticStage(qq) {
          state.callbacks++;
          assert.equal(qq, 'auto-save');
          assert.equal(state.stored.灵根.name, '岁云剑尊', '晋阶必须先落盘再发奖');
          if (state.failSettlement) throw Error('injected-settlement-error');
          delete state.stored.岁云.自动晋升待结算;
          state.stored.自动奖励核对 = true;
          return { player: clone(state.stored) };
        }
      },
    }),
  };
  state.write = new Function(...Object.keys(deps), `${body}; return Write_player;`)(...Object.values(deps));
  return state;
}

test('真实异步保存入口自动连升并调用奖励服务，返回对象同步最终存档，重写不重复发奖', async () => {
  const f = writeFixture(), p = player();
  await f.write('auto-save', p);
  assert.equal(p.灵根.name, '岁云剑尊');
  assert.equal(p.法球倍率, 1000);
  assert.equal(p.生命本源, 15000);
  assert.equal(p.自动奖励核对, true);
  assert.equal(p.岁云.自动晋升待结算, undefined);
  assert.equal(f.callbacks, 1);
  await f.write('auto-save', p);
  assert.equal(f.callbacks, 1);
});

test('奖励服务中断不撤销成功晋阶，保留待补领标记，重试补领；跳过递归的保存仍保留阶段', async () => {
  const f = writeFixture(), p = player();
  f.failSettlement = true;
  await f.write('auto-save', p);
  assert.equal(f.stored.灵根.name, '岁云剑尊');
  assert.equal(f.stored.岁云.自动晋升待结算, true);
  assert.equal(f.warnings, 1);
  f.failSettlement = false;
  await f.write('auto-save', p);
  assert.equal(f.callbacks, 2);
  assert.equal(f.stored.岁云.自动晋升待结算, undefined);
  const skipped = writeFixture();
  await skipped.write('auto-save', player(), { skipSuiyunSettlement: true });
  assert.equal(skipped.callbacks, 0);
  assert.equal(skipped.stored.灵根.name, '岁云剑尊');
  assert.equal(skipped.stored.岁云.自动晋升待结算, true);
});

test('真实同步存档入口也按境界晋阶并标记待补领，不变更普通灵根和装载中的化身', () => {
  const source = read('model/XiuxianData.js');
  const from = source.indexOf('  setData(file_name, user_qq, data) {');
  const to = source.indexOf('  getAssociation(', from);
  let stored = { 灵根: createSuiyunRoot(1), id: 'auto-save' }, writes = 0;
  const deps = {
    path, advanceSuiyunToRealm, assertGlobalInitIdle() {}, assertTribulationSnapshotCurrentSync() {},
    assertZhutianMirrorWriteCurrent() {}, assertZhutianAvatarRootWriteAllowed() {},
    rememberImmortalEmperorHistory() {},
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify(stored) },
    writeJsonAtomically: (_file, p) => { stored = clone(p); writes++; },
  };
  const setData = new Function(...Object.keys(deps), `return ({${source.slice(from, to)}}).setData;`)(...Object.values(deps));
  const app = { filePathMap: { player: '/fixture' }, setData };
  app.setData('player', 'auto-save', player());
  assert.equal(stored.灵根.name, '岁云剑尊');
  assert.equal(stored.岁云.自动晋升待结算, true);
  app.setData('player', 'auto-save', { 灵根: { name: '凡体', type: '普通' }, mijinglevel_id: 30 });
  assert.equal(stored.灵根.name, '凡体');
  const avatar = { ...player(), 诸天镜系统: { 当前化身: '门矢士' } };
  app.setData('player', 'auto-save', avatar);
  assert.equal(stored.灵根.name, '月华之体');
  assert.equal(writes, 3);
});
