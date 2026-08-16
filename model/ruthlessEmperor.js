import {
  GONGFA_PROFICIENCY_MAX,
  ensureGongfaProficiency,
  getGongfaProficiency,
  getLearnedGongfaNames,
} from './gongfaProficiency.js';

export const RUTHLESS_DESTINY_EVENT_CHANCE = 0.01;
export const RUTHLESS_PROTECTOR_FAVOR = 480;
export const RUTHLESS_TEACHINGS = Object.freeze([
  '飞仙诀',
  '一念花开，君临天下',
  '飞仙',
  '万化圣诀',
  '不灭天功',
  '万化仙诀',
]);

const RELATIONSHIPS = Object.freeze([
  { min: 480, level: 5, name: '护道之约' },
  { min: 300, level: 4, name: '道途同行' },
  { min: 180, level: 3, name: '隔世相知' },
  { min: 60, level: 2, name: '青铜鬼面' },
  { min: 0, level: 1, name: '时间长河一瞥' },
]);

function appendEvent(character, event) {
  if (!Array.isArray(character.事件记录)) character.事件记录 = [];
  character.事件记录.push(event);
  if (character.事件记录.length > 30) {
    character.事件记录.splice(0, character.事件记录.length - 30);
  }
}

export function getRuthlessData(player) {
  if (!Array.isArray(player?.剧情人物)) return null;
  return player.剧情人物.find(character => character && Object.hasOwn(character, '狠人大帝')) || null;
}

export function getRuthlessRelation(favor = 0) {
  const value = Math.max(0, Number(favor) || 0);
  return RELATIONSHIPS.find(relation => value >= relation.min) || RELATIONSHIPS.at(-1);
}

export function unlockRuthlessRelation(player) {
  if (!Array.isArray(player.剧情人物)) player.剧情人物 = [];
  let character = getRuthlessData(player);
  if (!character) {
    character = {
      狠人大帝: 1,
      关系: 1,
      好感度: 10,
      解锁时间: Date.now(),
      事件记录: [],
    };
    player.剧情人物.push(character);
  }
  character.狠人大帝 = 1;
  character.好感度 = Math.max(10, Number(character.好感度) || 0);
  character.关系 = getRuthlessRelation(character.好感度).level;
  appendEvent(character, '赤王逆流时间长河劫杀，狠人大帝隔世出手相救');
  return character;
}

export function rollRuthlessDestinyEncounter(player, options = {}) {
  if (!options.isGlobalFirst) return { encountered: false, reason: 'rank' };
  if (player?.狠人大帝宿命事件已触发) return { encountered: false, reason: 'once' };

  const chance = Math.max(0, Math.min(1, Number(options.chance ?? RUTHLESS_DESTINY_EVENT_CHANCE)));
  const random = typeof options.random === 'function' ? options.random : Math.random;
  if (random() >= chance) return { encountered: false, reason: 'missed', chance };

  player.狠人大帝宿命事件已触发 = true;
  const character = unlockRuthlessRelation(player);
  const dungeon = String(options.dungeon || '秘境').trim();
  return {
    encountered: true,
    chance,
    character,
    message: [
      '【宿命劫杀·赤王逆流】',
      `你自「${dungeon}」结算归来，尚未散去的战意竟照亮了时间长河。`,
      '长河上游，一口赤色古钟轰然震响。不朽之王赤王循着你的未来逆流而至，要在你尚未登临绝巅前抹去一切痕迹。',
      '钟波压落，古今都在崩塌；就在你的存在将被从岁月中剥离时，一张青铜鬼面映入长河。',
      '白衣女子背对万古，独立于断裂的时光之上。她只抬起一掌，赤王钟便连同那道跨越纪元的杀念一同倒卷。',
      '狠人大帝隔着无尽岁月看向你，轻声说道：',
      '“我终是看到了，生在这一世，你比谁都要难，都要苦，需要一个人独断这万古啊。”',
      '话音散入岁月，赤王的身影已从此段时空彻底消失。青铜鬼面却留下一缕道痕，证明这一眼并非幻梦。',
      '剧情人物「狠人大帝」已解锁。',
    ].join('\n'),
  };
}

function normalizeTechniqueName(name) {
  const compact = String(name || '').trim().replace(/\s+/g, '');
  if (['一念花开君临天下', '一念花开·君临天下', '一念花开,君临天下'].includes(compact)) {
    return '一念花开，君临天下';
  }
  return compact;
}

export function teachRuthlessTechnique(player, requestedName) {
  const character = getRuthlessData(player);
  if (!character) return { ok: false, reason: 'locked' };

  const name = normalizeTechniqueName(requestedName);
  if (!RUTHLESS_TEACHINGS.includes(name)) return { ok: false, reason: 'unknown', name };
  const learned = getLearnedGongfaNames(player);
  if (learned.includes(name)) return { ok: false, reason: 'learned', name };

  if (name === '万化仙诀') {
    if (!learned.includes('万化圣诀')) return { ok: false, reason: 'prerequisite', name };
    const proficiency = getGongfaProficiency(player, '万化圣诀');
    if (proficiency < GONGFA_PROFICIENCY_MAX) {
      return {
        ok: false,
        reason: 'proficiency',
        name,
        proficiency,
        required: GONGFA_PROFICIENCY_MAX,
      };
    }
  }

  player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : learned;
  player.学习的功法.push(name);
  ensureGongfaProficiency(player)[name] = 0;
  appendEvent(character, `受狠人大帝指点，习得${name}`);
  return { ok: true, name };
}

export function addRuthlessFavor(player, amount) {
  const character = getRuthlessData(player);
  if (!character) return null;
  const before = Math.max(0, Number(character.好感度) || 0);
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  character.好感度 = before + gain;
  character.关系 = getRuthlessRelation(character.好感度).level;
  appendEvent(character, `于青铜仙殿论道，好感度+${gain}`);
  return { character, before, gain, relation: getRuthlessRelation(character.好感度) };
}
