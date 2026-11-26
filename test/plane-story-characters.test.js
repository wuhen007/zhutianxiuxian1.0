import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPlaneStoryCharacterData,
  rollPlaneStoryCharacterEncounter,
} from '../model/planeStoryCharacters.js';

test('盖九幽只在遮天位面下本时出现', () => {
  const player = { power_place: 2 };
  const encounter = rollPlaneStoryCharacterEncounter(player, {
    chance: 1,
    random: () => 0,
    dungeon: '紫薇星域',
  });
  assert.equal(encounter.characterName, '盖九幽');
  assert.equal(encounter.firstMeeting, true);
  assert.equal(getPlaneStoryCharacterData(player, '盖九幽').好感度, 10);

  const wrongPlane = rollPlaneStoryCharacterEncounter({}, {
    plane: 1,
    chance: 1,
    random: () => 0,
  });
  assert.equal(wrongPlane.encountered, false);
});

test('孟天正只在九天十地下本时出现', () => {
  const player = { power_place: 2.5 };
  const encounter = rollPlaneStoryCharacterEncounter(player, {
    chance: 1,
    random: () => 0,
    dungeon: '帝关',
  });
  assert.equal(encounter.characterName, '孟天正');
  assert.equal(encounter.firstMeeting, true);
  assert.equal(getPlaneStoryCharacterData(player, '孟天正').好感度, 10);
  assert.equal(getPlaneStoryCharacterData(player, '盖九幽'), null);
});

test('同一人物再遇只增加好感，不会重复建档', () => {
  const player = { power_place: 2 };
  rollPlaneStoryCharacterEncounter(player, { chance: 1, random: () => 0 });
  const second = rollPlaneStoryCharacterEncounter(player, {
    chance: 1,
    random: () => 0,
    favorGain: 5,
  });
  assert.equal(second.firstMeeting, false);
  assert.equal(player.剧情人物.length, 1);
  assert.equal(getPlaneStoryCharacterData(player, '盖九幽').好感度, 15);
});
