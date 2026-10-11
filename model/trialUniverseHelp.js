import { TRIAL_WORLDS } from './trialUniverse.js';

export const TRIAL_HELP_THEMES = Object.freeze([
  { id: 'terminal', name: '主神终端', index: 1 },
  { id: 'dossier', name: '禁忌档案', index: 2 },
  { id: 'astral', name: '诸界星图', index: 3 },
]);

export function getTrialHelpData(themeIndex = 1) {
  const theme = TRIAL_HELP_THEMES.find(item => item.index === Number(themeIndex));
  if (!theme) throw new RangeError('帮助模板请选择 1、2 或 3。');
  return {
    theme,
    intro: '全球众生被传送至主神空间。进入诸界，完成任务，活着回归；以积分换取力量，直到成为神。',
    quickstart: { command: '#降临 试炼宇宙', text: '新角色先发送 #踏入仙途，再选择降临地。' },
    worlds: Object.entries(TRIAL_WORLDS).map(([type, world]) => ({ type, name: world.name, intro: world.intro })),
    groups: [
      { id: '01', title: '选择世界', kicker: '投放前准备', items: [
        { command: '#试炼宇宙 世界', desc: '查看六类世界背景与三阶段任务。' },
        { command: '#试炼宇宙 进入 末日 确认', desc: '将“末日”替换为所选类型；确认后开始试炼。' },
        { command: '#试炼宇宙 任务', desc: '查看阶段进度、剩余时限与每种行动的实际风险。' },
      ] },
      { id: '02', title: '行动与回归', kicker: '在期限内存活', items: [
        { command: '#试炼宇宙 行动 谨慎', desc: '进度 +1，时限 +2；风险较低，留意剩余时间。' },
        { command: '#试炼宇宙 行动 强攻', desc: '进度 +2，时限 +1；有情报时消耗 1 点再多推进 1 点。' },
        { command: '#试炼宇宙 行动 调查', desc: '进度 +1，情报 +1，时限 +1；精神消耗较高。' },
        { command: '#试炼宇宙 结算', desc: '三段任务全部完成后回归，领取积分并修复生命与精神。' },
      ] },
      { id: '03', title: '物品与强化', kicker: '只为下一次活着回来', items: [
        { command: '#试炼宇宙 兑换 医疗包', desc: '医疗包 / 定神剂各 60 积分，界障护符 100 积分。' },
        { command: '#试炼宇宙 使用 医疗包', desc: '试炼内使用物品，占 1 格时限；药剂恢复 45 点对应状态。' },
        { command: '#试炼宇宙 强化 体魄', desc: '可选体魄 / 精神，最高各 5 级；花费 120 × 目标等级积分。' },
      ] },
      { id: '04', title: '记录与重生', kicker: '记住每一次代价', items: [
        { command: '#试炼宇宙 状态', desc: '查看生命、精神、积分、物品、强化与本世凭证。' },
        { command: '#试炼宇宙 规则', desc: '查看风险、重复世界难度、物品效果与死亡清零范围。' },
        { command: '#试炼宇宙 履历', desc: '回看最近行动与死亡记录。' },
        { command: '#试炼宇宙 重生 确认', desc: '死亡后以凡躯重新开始，保留历史通关和死亡记录。' },
      ] },
    ],
    rules: [
      { label: '任务时限', text: '三阶段各需 4 点进度，最多 12 格行动时限。只在行动或使用物品时推进，离线不扣生命。' },
      { label: '回归收益', text: '活着结算获得 350 积分；本世首次通关该类型另得 500 积分与凭证。兑换与强化仅在主神空间进行。' },
      { label: '死亡代价', text: '生命、精神耗尽或任务超时即死亡。本世积分、物品、强化与凭证清空，历史记录及重复世界难度保留。' },
    ],
    ascension: {
      title: '终局 · 成神',
      requirements: '本世六类通关凭证 · 体魄与精神各 5 级 · 消耗 3000 积分',
      command: '#试炼宇宙 成神 确认',
      note: '独立神阶对应修仙「无境」，保留原修仙境界。',
    },
    footer: '帮助 1 主神终端 / 帮助 2 禁忌档案 / 帮助 3 诸界星图 · 指令前缀均为 #试炼宇宙',
  };
}
