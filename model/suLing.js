export const SU_LING_ENCOUNTER_CHANCE = 0.02;
export const SU_LING_DEEP_FAVOR = 240;
export const SU_LING_PROTECTOR_FAVOR = 480;
export const SU_LING_TEACHING_TOTAL = 10;
export const SU_LING_ULTIMATE = '命运终章·移劫夺运';

const RELATIONSHIPS = Object.freeze([
  { favor: 480, level: 5, name: '生死同命' },
  { favor: 240, level: 4, name: '命途相知' },
  { favor: 180, level: 3, name: '共渡命劫' },
  { favor: 60, level: 2, name: '观命之交' },
  { favor: 0, level: 1, name: '命线初逢' },
]);

const STORY_BEATS = Object.freeze({
  60: '【逆流见影】命运长河倒卷，苏灵让你看见数种本应陨落的未来，又亲手将其中最晦暗的一条命线剪去。',
  180: '【共渡命劫】一场针对苏灵化身的命劫降临，你没有退走，与她共同守住命运轮盘。她第一次真正记住了你的名字。',
  240: '【同道授法】苏灵坦言自己亦是命运神道体，并准许你此后以「#苏灵请教」叩问命运大道。',
  480: '【护道之约】苏灵将一道命轮印记留在你眉心。自此可用「#请苏灵护道」请她成为护道人。',
});

function recordEvent(character, event) {
  if (!Array.isArray(character.事件记录)) character.事件记录 = [];
  character.事件记录.push(event);
  if (character.事件记录.length > 30) character.事件记录.splice(0, character.事件记录.length - 30);
}

export function getSuLingData(player) {
  if (!Array.isArray(player?.剧情人物)) return null;
  return player.剧情人物.find(character => character?.苏灵) || null;
}

export function getSuLingRelation(favor = 0) {
  const value = Math.max(0, Number(favor) || 0);
  return RELATIONSHIPS.find(relation => value >= relation.favor);
}

export function getSuLingStoryBeat(oldFavor = 0, newFavor = 0) {
  const threshold = [60, 180, 240, 480].find(value => oldFavor < value && newFavor >= value);
  return threshold ? STORY_BEATS[threshold] : '';
}

export function isFateDivineBody(player) {
  return String(player?.灵根?.name || '').includes('命运神道体');
}

export function rollSuLingDungeonEncounter(player, options = {}) {
  if (!player || typeof player !== 'object') return { encountered: false, changed: false };
  const random = options.random || Math.random;
  const chance = Math.min(1, Math.max(0, options.chance ?? SU_LING_ENCOUNTER_CHANCE));
  if (random() >= chance) return { encountered: false, changed: false };

  if (!Array.isArray(player.剧情人物)) player.剧情人物 = [];
  let character = getSuLingData(player);
  const place = options.dungeon || options.plane || '未知秘境';

  if (!character) {
    character = {
      苏灵: 1,
      关系: 1,
      好感度: 10,
      指点次数: 0,
      解锁时间: Date.now(),
      事件记录: [`${place}·命线初逢`],
    };
    player.剧情人物.push(character);
    return {
      encountered: true,
      changed: true,
      firstMeeting: true,
      favorGain: 10,
      relation: getSuLingRelation(10),
      message: ` 【命线初逢】${place}深处忽然万籁俱寂，一轮星辉轮盘在虚空中缓缓转动。白衣女子从停滞的光阴中走来，指尖拨开一道缠向你的死劫：“此线不该断在这里。”剧情人物「苏灵」关系已建立，好感度+10。`,
    };
  }

  const oldFavor = Math.max(0, Number(character.好感度) || 0);
  const oldRelation = getSuLingRelation(oldFavor);
  const favorGain = options.favorGain ?? 6 + Math.floor(random() * 5);
  character.好感度 = oldFavor + favorGain;
  const relation = getSuLingRelation(character.好感度);
  character.关系 = relation.level;
  recordEvent(character, `${place}再遇，好感度+${favorGain}`);

  const storyBeat = getSuLingStoryBeat(oldFavor, character.好感度);
  if (storyBeat) recordEvent(character, storyBeat.replace(/^【[^】]+】/, ''));

  return {
    encountered: true,
    changed: true,
    firstMeeting: false,
    favorGain,
    relation,
    relationUp: relation.level > oldRelation.level,
    storyBeat,
    message: storyBeat
      ? ` ${storyBeat} 好感度+${favorGain}，关系提升为「${relation.name}」。`
      : ` 你在${place}的岔路尽头再次遇见苏灵。她替你校正了一缕偏离的命线，好感度+${favorGain}（${relation.name}）。`,
  };
}

export function advanceSuLingTeaching(player, dateKey) {
  const character = getSuLingData(player);
  if (!character) return { ok: false, reason: 'not-met' };
  if (hasSuLingUltimate(player)) {
    player.命运终章已领悟 = true;
    return { ok: false, reason: 'learned', count: SU_LING_TEACHING_TOTAL };
  }
  const favor = Math.max(0, Number(character.好感度) || 0);
  if (favor < SU_LING_DEEP_FAVOR) {
    return { ok: false, reason: 'favor', missing: SU_LING_DEEP_FAVOR - favor };
  }
  if (!isFateDivineBody(player)) return { ok: false, reason: 'physique' };
  if (character.上次指点日期 === dateKey) {
    return { ok: false, reason: 'daily', count: Math.max(0, Number(character.指点次数) || 0) };
  }

  character.上次指点日期 = dateKey;
  character.指点次数 = Math.min(SU_LING_TEACHING_TOTAL, Math.max(0, Number(character.指点次数) || 0) + 1);
  recordEvent(character, `命运神道体指点·第${character.指点次数}次`);

  const learned = character.指点次数 >= SU_LING_TEACHING_TOTAL;
  if (learned) {
    if (!Array.isArray(player.学习的功法)) player.学习的功法 = [];
    if (!player.学习的功法.includes(SU_LING_ULTIMATE)) player.学习的功法.push(SU_LING_ULTIMATE);
    player.命运终章已领悟 = true;
    recordEvent(character, `领悟${SU_LING_ULTIMATE}`);
  }
  return { ok: true, count: character.指点次数, learned };
}

export function hasSuLingUltimate(unit) {
  return Boolean(unit?.命运终章已领悟 || unit?.学习的功法?.includes(SU_LING_ULTIMATE));
}

function moveFields(from, to, fields) {
  if (!fields.some(field => from[field] !== undefined && from[field] !== null && from[field] !== false && from[field] !== 0)) return false;
  for (const field of fields) {
    if (from[field] !== undefined) to[field] = from[field];
    delete from[field];
  }
  return true;
}

export function transferSuLingFateEffects(holder, opponent) {
  if (!hasSuLingUltimate(holder) || !opponent) return { triggered: false, negatives: [], buffs: [], message: '' };
  const negatives = [];
  const buffs = [];

  if (moveFields(holder, opponent, ['fumianhuihe', 'fumian_damage', 'fumian_type'])) negatives.push('持续负面');
  if (moveFields(holder, opponent, ['_fumianhuihe', '_fumian_damage', '_fumian_type'])) negatives.push('持续负面');
  for (const field of ['dongjie', '_东皇冻结回合', '_困龙封印', '_陷仙沉默', '_绝仙流血', '_先天禁疗']) {
    if (moveFields(holder, opponent, [field])) negatives.push('控制');
  }

  if (moveFields(opponent, holder, ['_持续减伤回合', '_持续减伤比例'])) buffs.push('持续减伤');
  if (moveFields(opponent, holder, ['_immune_control', '_immune_type'])) buffs.push('免控');
  for (const field of ['护盾值', '_护盾值', '_减伤比例', '_阴阳逆转护命']) {
    if (moveFields(opponent, holder, [field])) buffs.push(field.includes('护盾') ? '护盾' : '护体增益');
  }

  const uniqueNegatives = [...new Set(negatives)];
  const uniqueBuffs = [...new Set(buffs)];
  const parts = [];
  if (uniqueNegatives.length) parts.push(`将自身${uniqueNegatives.join('、')}转嫁给${opponent.名号 || '对手'}`);
  if (uniqueBuffs.length) parts.push(`夺取${opponent.名号 || '对手'}的${uniqueBuffs.join('、')}`);
  return {
    triggered: parts.length > 0,
    negatives: uniqueNegatives,
    buffs: uniqueBuffs,
    message: parts.length ? `【${SU_LING_ULTIMATE}】${holder.名号 || '命运神道体修士'}${parts.join('，')}！` : '',
  };
}

export function resolveSuLingFatalFate(defender, attacker, incomingDamage) {
  const damage = Math.max(0, Number(incomingDamage) || 0);
  const hp = Math.max(0, Number(defender?.当前血量) || 0);
  if (!hasSuLingUltimate(defender) || defender._命运终章护命已触发 || hp <= 0 || damage < hp) {
    return { triggered: false, damage };
  }
  defender._命运终章护命已触发 = true;
  if (attacker) attacker._命运删除行动 = Math.max(2, Math.floor(Number(attacker._命运删除行动) || 0));
  return {
    triggered: true,
    damage: 0,
    message: `【${SU_LING_ULTIMATE}】败亡之果被从命运长河中抹去，${defender.名号 || '守命者'}免疫致命伤害；${attacker?.名号 || '对手'}接下来两次行动被删除！`,
  };
}

export function consumeDeletedFateAction(unit) {
  const remaining = Math.max(0, Math.floor(Number(unit?._命运删除行动) || 0));
  if (!unit || remaining <= 0) return { skipped: false, remaining: 0, message: '' };
  unit._命运删除行动 = remaining - 1;
  return {
    skipped: true,
    remaining: remaining - 1,
    message: `【命运删改】${unit.名号 || '对手'}这一段未来已被抹除，无法行动（剩余${remaining - 1}次）。`,
  };
}
