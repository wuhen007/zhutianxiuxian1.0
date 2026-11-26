import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ensureZhutianMirrorSystem,
  getActiveZhutianAvatarName,
  syncCurrentZhutianAvatar,
} from '../model/zhutianMirror.js';

const source = fs.readFileSync(
  new URL('../apps/User/linggenjuexing.js', import.meta.url),
  'utf8'
);

test('爱莉希雅真我觉醒允许在爱莉希雅化身内进行', () => {
  const start = source.indexOf('async zhenwojuexing');
  const end = source.indexOf('async liuyingjuexing', start);
  const method = source.slice(start, end);
  assert.match(method, /const activeAvatar = getActiveZhutianAvatarName\(player\)/);
  assert.match(method, /activeAvatar !== '爱莉希雅'/);
  assert.equal(
    (method.match(/syncCurrentZhutianAvatar\(player\)/g) || []).length,
    2
  );
});

test('爱莉希雅晋升同步诸天镜化身阶段，不再要求切回本源重装', () => {
  const player = {
    level_id: 50,
    mijinglevel_id: 15,
    灵根: {
      id: 7010020,
      name: '爱莉希雅',
      type: '无瑕之人',
      生命本源: 50,
    },
  };
  ensureZhutianMirrorSystem(player);
  assert.equal(getActiveZhutianAvatarName(player), '爱莉希雅');

  player.灵根 = {
    id: 7010020,
    name: '人之律者·爱莉希雅',
    type: '真我·人之律者',
    生命本源: 150,
  };
  assert.equal(syncCurrentZhutianAvatar(player), true);
  assert.equal(player.诸天化身谱[0].stage, 2);
  assert.equal(player.诸天化身谱[0].root.name, '人之律者·爱莉希雅');

  player.灵根 = {
    id: 7010020,
    name: '始源之律者·爱莉希雅',
    type: '始源律者',
    生命本源: 300,
  };
  assert.equal(syncCurrentZhutianAvatar(player), true);
  assert.equal(player.诸天化身谱[0].stage, 3);
  assert.equal(player.诸天化身谱[0].root.name, '始源之律者·爱莉希雅');
});
