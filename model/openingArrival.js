export const ARRIVAL_LOCATIONS = Object.freeze(['修仙界', '地球', '试炼宇宙', '剑与魔法']);
export const OPEN_ARRIVAL_LOCATIONS = Object.freeze(['修仙界', '剑与魔法']);

export function getArrivalEntryBlock(location) {
  return ['地球', '试炼宇宙'].includes(location)
    ? `【${location}·入口维护】该路线暂缓接纳新角色，已有角色照常游玩。请选择 #降临 修仙界 或 #降临 剑与魔法。`
    : '';
}

export const OPENING_WORLD_PROLOGUE = [
  '【诸天序章·万界沉浮】',
  '鸿蒙未判时，诸天只是一粒微尘。第一缕光划破混沌，岁月有了流向，亿万星海从虚无中诞生；一方方大千世界如长河中的灯火，照见众生，也照见诸神的坟墓。',
  '有人御剑横渡星河，向天争一线长生；有人在古老王国的钟声中苏醒，以剑术、精灵与魔法探寻命运。诸天之外，地球仍有未熄的灯火，试炼宇宙仍在等待它的归来者。',
  '然而，仙门之上并非净土，群星尽头亦非归乡。古老的灾厄正在苏醒，不祥沿着世界的裂隙蔓延。昨日庇护众生的法则，明日也许便会成为吞没文明的深渊。',
  '此界充满了灾厄与不祥。你将从一介凡人出发，在诸天的注视下，写下自己的命运。',
].join('\n\n');

export const ARRIVAL_CHOICES_TEXT = [
  '【请选择你的降临地】',
  '一、修仙界｜问道长生：灵根初醒，拜宗寻缘，从凡尘踏上诸天仙途。',
  '发送：#降临 修仙界',
  '',
  '二、剑与魔法｜断冠纪元：中世纪城邦、精灵古林、魔法学院与冒险者公会。抽取精灵亲和、元素亲和、魔力超群、无吟唱者等天赋，选择剑士、魔法师、僧侣或游侠，踏入勇者与魔王的时代。',
  '发送：#降临 剑与魔法',
  '',
  '地球、试炼宇宙：玩法重构期间暂缓接纳新角色，已有角色照常游玩。',
  '',
  '选定后才创建角色；各路线独立成长，既有角色不会因选择指令被覆盖。',
].join('\n');

// 与每日任务共用富文本发送方式；沿用原文，普通客户端仍显示纯文本版本。
export const OPENING_ARRIVAL_MARKDOWN = [
  OPENING_WORLD_PROLOGUE
    .replace(/^【(.+)】/, '# $1')
    .replace('此界充满了灾厄与不祥。', '> **此界充满了灾厄与不祥。**'),
  '',
  ARRIVAL_CHOICES_TEXT
    .replace('【请选择你的降临地】', '## 请选择你的降临地\n')
    .replace(/^([一二三]、[^：]+)：/gm, '**$1**\n\n')
    .replace(/^发送：(.+)$/gm, '\n发送：`$1`')
    .replace('最终目标——成神，对应修仙境界「无境」。', '**最终目标——成神，对应修仙境界「无境」。**')
    .replace(/^试炼死亡(.+)$/m, '\n> **死亡代价：**试炼死亡$1')
    .replace(/^(选定后才创建角色；.+)$/m, '> $1'),
].join('\n');

export const ARRIVAL_BUTTONS = [OPEN_ARRIVAL_LOCATIONS.map(name => ({
  text: name, command: `#降临 ${name}`,
}))];

export function parseArrivalChoice(message) {
  const match = String(message || '').trim().match(/^#(?:选择降临地|降临)\s*(修仙界|地球|试炼宇宙|剑与魔法)$/);
  return match?.[1] || '';
}
