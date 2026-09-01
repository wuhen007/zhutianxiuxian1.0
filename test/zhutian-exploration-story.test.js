import test from 'node:test';
import assert from 'node:assert/strict';
import { bindBasicZhutianMirror } from '../model/zhutianMirror.js';
import {
  beginExplorationStory,
  ensureExplorationStoryState,
  getExplorationStorySummary,
  resolveExplorationStory,
  ZHUTIAN_EXPLORATION_EVENTS,
} from '../model/zhutianExplorationStory.js';
import { getZhutianMirrorVersion } from '../utils/zhutianMirrorVersion.js';

const NOW = new Date('2026-08-23T00:00:00+08:00').getTime();

function createPlayer() {
  const player = {
    level_id: 48,
    灵根: { id: 1001, name: '金灵根', type: '普通' },
  };
  bindBasicZhutianMirror(player, { now: NOW });
  player.诸天镜系统.镜阶 = 7;
  return player;
}

test('三个专属世界各有十个合法剧情事件与两条连续事件链', () => {
  for (const [world, events] of Object.entries(ZHUTIAN_EXPLORATION_EVENTS)) {
    assert.equal(events.length, 10, `${world}剧情数量`);
    assert.equal(new Set(events.map(event => event.id)).size, 10, `${world}剧情ID应唯一`);
    assert.equal(events.filter(event => event.options.some(item => item.effect?.nextEvent)).length, 2, `${world}连续事件链数量`);
    for (const event of events) {
      assert.ok(event.title && event.scene, `${event.id}缺少剧情文本`);
      assert.ok(event.options.length >= 2 && event.options.length <= 4, `${event.id}选项数量无效`);
      for (const item of event.options) assert.ok(item.text && item.result, `${event.id}存在空选项`);
    }
  }
});

test('友枝町连续事件会持久化关系、标记、熟练度并防止重复结算', () => {
  const player = createPlayer();
  const opening = beginExplorationStory(player, '魔法少女樱', '友枝小学', { random: () => 0 });
  assert.equal(opening.id, 'sakura_mirror_start');

  const beforeFirst = getZhutianMirrorVersion(player);
  const first = resolveExplorationStory(player, opening.world, opening.id, 1, { resolutionId: 'story-1' });
  assert.equal(first.ok, true);
  assert.equal(getZhutianMirrorVersion(player), beforeFirst + 1);
  assert.equal(first.nextTitle, '镜牌的约定');
  let state = ensureExplorationStoryState(player, '魔法少女樱');
  assert.equal(state.人物关系.木之本樱, 2);
  assert.ok(state.事件标记.includes('识破镜牌'));

  const sequel = beginExplorationStory(player, '魔法少女樱', '企鹅公园', { random: () => 0.99 });
  assert.equal(sequel.id, 'sakura_mirror_end');
  const second = resolveExplorationStory(player, sequel.world, sequel.id, 1, { resolutionId: 'story-2' });
  assert.equal(second.ok, true);
  assert.equal(player.库洛牌系统.魔法熟练度, 5);
  assert.equal(state.人物关系.木之本樱, 5);
  assert.ok(state.事件标记.includes('镜牌盟约'));

  const beforeRepeated = getZhutianMirrorVersion(player);
  const repeated = resolveExplorationStory(player, sequel.world, sequel.id, 1, { resolutionId: 'story-2' });
  assert.equal(repeated.alreadyResolved, true);
  assert.equal(getZhutianMirrorVersion(player), beforeRepeated);
  assert.equal(player.库洛牌系统.魔法熟练度, 5);
  assert.equal(state.人物关系.木之本樱, 5);
});

test('见泷原与骑士世界的剧情选择会改变既有危机数值', () => {
  const player = createPlayer();
  const madoka = resolveExplorationStory(player, '魔法少女小圆', 'madoka_walpurgis_scout', 2, { resolutionId: 'madoka-1' });
  assert.equal(madoka.ok, true);
  assert.equal(player.诸天镜系统.世界进度.魔法少女小圆.灵魂宝石污浊度, 8);
  assert.equal(player.希望系统.净化绝望值, 15);

  const decade = resolveExplorationStory(player, '假面骑士帝骑', 'decade_dai_shocker', 1, { resolutionId: 'decade-1' });
  assert.equal(decade.ok, true);
  assert.equal(player.诸天镜系统.世界进度.假面骑士帝骑.世界融合度, 5);
  assert.equal(player.诸天镜系统.世界进度.假面骑士帝骑.共鸣度, 6);
});

test('剧情摘要保留次数、主要人物关系与待续事件', () => {
  const player = createPlayer();
  resolveExplorationStory(player, '魔法少女小圆', 'madoka_homura_start', 1, { resolutionId: 'summary-1' });
  const summary = getExplorationStorySummary(player, '魔法少女小圆');
  assert.equal(summary.count, 1);
  assert.match(summary.relations, /晓美焰\+2/);
  assert.equal(summary.pending, '第十四次黄昏');
});
