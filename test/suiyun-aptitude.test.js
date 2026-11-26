import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveReincarnationAptitudeLoss } from '../model/reincarnationAptitude.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const files = [
  'apps/Anniversary/Anniversary.js',
  'apps/SecretPlace/SecretPlaceTask.js',
  'apps/SecretPlace/SecretPlaceplusTask.js',
  'apps/User/UserHome.js',
  'apps/User/UserSellAll.js',
  'apps/User/shili.js',
  'apps/User/zhengdaotixi.js',
];
const sequence = ['无化如是', '生而愚痴', '天弃之人', '先天不足', '平庸之资', '超凡资质', '天纵之资', '旷世奇才', '绝世天骄', '万古无双', '无演无尽'];

test('天资消费入口实际索引表达式将岁云按最高等级计算，保留展示名称', () => {
  let checked = 0;
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /aptitudeSequence\.indexOf\((?:player\.天资等级|originalAptitude|currentAptitude|highestAptitudeReached)\)/, file);
    for (const match of source.matchAll(/(?:const|let)\s+current(?:Aptitude)?Index\s*=\s*(aptitudeSequence\.indexOf\([^;\r\n]+\));/g)) {
      const calculate = new Function('aptitudeSequence', 'player', 'originalAptitude', 'currentAptitude', `return ${match[1]};`);
      const player = { 天资等级: '岁云' };
      assert.equal(calculate(sequence, player, '岁云', '岁云'), 10, `${file}: ${match[1]}`);
      assert.equal(player.天资等级, '岁云');
      checked++;
    }
    if (file.endsWith('zhengdaotixi.js')) {
      const start = source.indexOf('  const targetAptitudeData = {');
      const end = source.indexOf('\n  // 检查新的天资是否有效', start);
      const calculate = new Function('aptitudeSequence', 'targetPlayer', 'invoker',
        `${source.slice(start, end)}; return [targetAptitudeData, invokerAptitudeData];`);
      assert.deepEqual(calculate(sequence, { 天资等级: '岁云' }, { 天资等级: '岁云' }), [
        { grade: '岁云', index: 10 }, { grade: '岁云', index: 10 },
      ]);
    }
  }
  assert.ok(checked >= 16);
});

test('真实地仙奇遇四入口不把岁云修正成低资质，普通升阶与旧档修复仍工作', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let checked = 0;
  for (const file of ['apps/SecretPlace/SecretPlaceTask.js', 'apps/SecretPlace/SecretPlaceplusTask.js', 'apps/User/UserSellAll.js']) {
    const source = read(file);
    for (const match of source.matchAll(/if \(random < 0\.0001\) \{\s*\/\/ 完整的天资等级序列/g)) {
      const labelStart = source.lastIndexOf('aptitudeEncounter: {', match.index);
      const start = labelStart >= 0 && match.index - labelStart < 30 ? labelStart : match.index;
      const end = source.indexOf('if (random > 0.1', match.index);
      assert.ok(end > start, `${file}: 奇遇边界`);
      const run = new AsyncFunction('player', 'Write_player', 'Add_najie_thing', 'B_player', 'usr_qq', 'player_id',
        `let random = 0; let last_msg = ''; ${source.slice(start, end)}`);
      for (const [grade, expected, expectedWrites] of [['岁云', '岁云', 0], ['无演无尽', '无演无尽', 0], ['平庸之资', '超凡资质', 1], ['未知旧档', '生而愚痴', 1]]) {
        const player = { 天资等级: grade };
        let writes = 0;
        await run(player, async () => { writes++; }, async () => {}, { 名号: '试炼月影' }, 'fixture', 'fixture');
        assert.equal(player.天资等级, expected, `${file}: ${grade}`);
        assert.equal(writes, expectedWrites);
      }
      checked++;
    }
  }
  assert.equal(checked, 4);
});

test('岁云轮回降一阶等同无演无尽，但保留当前天资名称', () => {
  assert.deepEqual(resolveReincarnationAptitudeLoss('岁云'), {
    current: '岁云', next: '万古无双', extinguished: false,
  });
  assert.equal(resolveReincarnationAptitudeLoss('岁云').next, resolveReincarnationAptitudeLoss('无演无尽').next);
});
