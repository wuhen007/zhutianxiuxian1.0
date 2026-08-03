export const ENDLESS_BATTLE_TEMPLATES = Object.freeze({
  1: '简洁战报',
  2: '无尽轮回战卷',
  3: '界海征伐天幕',
  4: '主神序列战场',
});

export function normalizeEndlessBattleTemplate(value) {
  const templateId = Number(value);
  return ENDLESS_BATTLE_TEMPLATES[templateId] ? templateId : 1;
}

export function getEndlessBattleTemplateModel(value) {
  return normalizeEndlessBattleTemplate(value) === 1
    ? 'endless_battle'
    : 'endless_battle_themed';
}
