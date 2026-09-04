import { getLocationName } from './weimianTravel.js';

export const PLANE_STORY_CHARACTER_ENCOUNTER_CHANCE = 0.02;

const CHARACTERS = Object.freeze({
  遮天位面: {
    name: '盖九幽',
    plane: '遮天位面',
    firstMessage: place => ` 【九幽仙曲】${place}深处传来一缕如泣如诉的仙音，沿途凶煞尽皆沉寂。一位病容老人立于星辉下，轻声提醒你前路杀机。剧情人物「盖九幽」关系已建立，好感度+10。`,
    repeatMessage: (place, gain) => ` 你在${place}再次听见九幽仙曲。盖九幽替你点破一处隐伏杀局，好感度+${gain}。`,
  },
  九天十地: {
    name: '孟天正',
    plane: '九天十地',
    firstMessage: place => ` 【大长老巡关】${place}上空弓弦轻鸣，压得群山万壑一时无声。孟天正巡视归来，见你独自历练，出言指点了几处修行缺漏。剧情人物「孟天正」关系已建立，好感度+10。`,
    repeatMessage: (place, gain) => ` 你在${place}再次遇见巡视边疆的孟天正。他考校了你的修行进境，好感度+${gain}。`,
  },
});

function getCharacterConfig(plane) {
  return CHARACTERS[getLocationName(plane)] || null;
}

function getRelationLevel(favor) {
  if (favor >= 180) return 4;
  if (favor >= 100) return 3;
  if (favor >= 40) return 2;
  return 1;
}

function recordEvent(character, event) {
  if (!Array.isArray(character.事件记录)) character.事件记录 = [];
  character.事件记录.push(event);
  if (character.事件记录.length > 20) character.事件记录.splice(0, character.事件记录.length - 20);
}

export function getPlaneStoryCharacterData(player, name) {
  if (!Array.isArray(player?.剧情人物)) return null;
  return player.剧情人物.find(character => character?.[name]) || null;
}

export function rollPlaneStoryCharacterEncounter(player, options = {}) {
  if (!player || typeof player !== 'object') return { encountered: false, changed: false };
  const config = getCharacterConfig(options.plane ?? player.power_place);
  if (!config) return { encountered: false, changed: false };

  const random = options.random || Math.random;
  const chance = Math.min(1, Math.max(0, options.chance ?? PLANE_STORY_CHARACTER_ENCOUNTER_CHANCE));
  if (random() >= chance) return { encountered: false, changed: false };

  if (!Array.isArray(player.剧情人物)) player.剧情人物 = [];
  const place = options.dungeon || config.plane;
  let character = getPlaneStoryCharacterData(player, config.name);

  if (!character) {
    character = {
      [config.name]: 1,
      关系: 1,
      好感度: 10,
      解锁时间: Date.now(),
      事件记录: [`${place}初遇`],
    };
    player.剧情人物.push(character);
    return {
      encountered: true,
      changed: true,
      firstMeeting: true,
      characterName: config.name,
      favorGain: 10,
      message: config.firstMessage(place),
    };
  }

  const oldFavor = Math.max(0, Number(character.好感度) || 0);
  const favorGain = options.favorGain ?? 3 + Math.floor(random() * 4);
  character.好感度 = oldFavor + favorGain;
  character.关系 = getRelationLevel(character.好感度);
  recordEvent(character, `${place}再遇，好感度+${favorGain}`);
  return {
    encountered: true,
    changed: true,
    firstMeeting: false,
    characterName: config.name,
    favorGain,
    message: config.repeatMessage(place, favorGain),
  };
}
