import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deletePlayerDataBundle,
  normalizePlayerId,
  removePlayerSmallWorlds,
} from '../apps/AdminSuper/playerDeletion.js';

function withFixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'player-deletion-'));
  const paths = {
    inner_world_path: path.join(directory, 'inner-world'),
    najie_path: path.join(directory, 'najie'),
    equipment_path: path.join(directory, 'equipment'),
    danyao_path: path.join(directory, 'danyao'),
    player_path: path.join(directory, 'player'),
  };
  Object.values(paths).forEach(item => fs.mkdirSync(item, { recursive: true }));
  const smallWorldFile = path.join(directory, 'small-worlds.json');

  try {
    run({ directory, paths, smallWorldFile });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('玩家账号只接受纯数字，并兼容 qg_ 前缀', () => {
  assert.equal(normalizePlayerId('qg_123456'), '123456');
  assert.throws(() => normalizePlayerId('../123'), /账号格式无效/);
});

test('筛除玩家全部小世界时兼容数字和字符串账号', () => {
  const result = removePlayerSmallWorlds('10001', [
    { player_qq: 10001, world_name: '甲' },
    { player_qq: '10001', world_name: '乙' },
    { player_qq: 20002, world_name: '丙' },
  ]);

  assert.equal(result.removedCount, 2);
  assert.deepEqual(result.remainingSmallWorlds, [
    { player_qq: 20002, world_name: '丙' },
  ]);
});

test('完整删档会删除五类文件和对应小世界', () => {
  withFixture(({ paths, smallWorldFile }) => {
    const playerId = '10001';
    for (const directory of Object.values(paths)) {
      fs.writeFileSync(path.join(directory, `${playerId}.json`), '{}', 'utf8');
    }
    const worlds = [
      { player_qq: 10001, world_name: '待删除' },
      { player_qq: 20002, world_name: '保留' },
    ];
    fs.writeFileSync(smallWorldFile, JSON.stringify(worlds), 'utf8');

    const result = deletePlayerDataBundle({
      playerId,
      paths,
      smallWorlds: worlds,
      smallWorldFile,
    });

    assert.deepEqual(result.removedFiles, [
      '内景地',
      '纳戒',
      '装备',
      '丹药',
      '玩家存档',
    ]);
    assert.equal(result.removedSmallWorlds, 1);
    for (const directory of Object.values(paths)) {
      assert.equal(fs.existsSync(path.join(directory, `${playerId}.json`)), false);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(smallWorldFile, 'utf8')), [
      { player_qq: 20002, world_name: '保留' },
    ]);
  });
});

test('删除过程失败时会恢复此前删除的全部文件', () => {
  withFixture(({ paths, smallWorldFile }) => {
    const playerId = '10001';
    for (const directory of Object.values(paths)) {
      fs.writeFileSync(path.join(directory, `${playerId}.json`), '{"alive":true}', 'utf8');
    }
    const worlds = [{ player_qq: 10001, world_name: '仍在' }];
    fs.writeFileSync(smallWorldFile, JSON.stringify(worlds), 'utf8');

    let deletionCount = 0;
    const failingFileSystem = Object.create(fs);
    failingFileSystem.unlinkSync = filePath => {
      deletionCount += 1;
      if (deletionCount === 3) throw new Error('模拟磁盘错误');
      return fs.unlinkSync(filePath);
    };

    assert.throws(
      () => deletePlayerDataBundle({
        playerId,
        paths,
        smallWorlds: worlds,
        smallWorldFile,
        fileSystem: failingFileSystem,
      }),
      /模拟磁盘错误/
    );

    for (const directory of Object.values(paths)) {
      const filePath = path.join(directory, `${playerId}.json`);
      assert.equal(fs.existsSync(filePath), true);
      assert.equal(fs.readFileSync(filePath, 'utf8'), '{"alive":true}');
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(smallWorldFile, 'utf8')), worlds);
  });
});
