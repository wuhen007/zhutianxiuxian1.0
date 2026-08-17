// 遮天风格功法复活（生命本源消耗版）
// 从 apps/User/zhetiandujie.js 的 checkGongfaResurrection 抽离为纯函数，
// 供花粉渡劫等伤害型渡劫复用同一套「命格复活 + 生命本源 + 复活功法冷却」机制。
// 不依赖 e/this：只改 player 状态并返回结果与文案，落盘与发送由调用方负责。
import { rollZhetianMinggeRevival } from '../apps/User/zhetianTribulationMingge.js';
import { getMinggeEffects } from './mingge.js';

// 复活功法冷却（回合），与 zhetiandujie.js this.gongfa 保持一致
export const REVIVAL_GONGFA_CD = Object.freeze({
  者字秘: 7,
  真凰宝术: 5,
  雷帝宝术: 5,
  柳神法: 5,
  不灭经: 4,
  补天术: 9,
  万化圣诀: 9,
  涅槃仙功: 12,
});

export const REVIVAL_GONGFA_NAMES = Object.freeze(Object.keys(REVIVAL_GONGFA_CD));

export function checkRevivalGongfa(player, name) {
  if (!player || typeof player !== 'object') return false;
  player.功法 ??= {};
  player.学习的功法 ??= [];
  if (!player.学习的功法.includes(name)) return false;
  player.功法[name] ??= { 冷却回合: 0 };
  return Number(player.功法[name].冷却回合 || 0) <= 0;
}

/** 每道雷劫后更新全部功法冷却（对标 zhetiandujie.updateCooldowns） */
export function cooldownRevivalGongfas(player) {
  if (!player?.功法) return;
  for (const name in player.功法) {
    const gongfa = player.功法[name];
    if (gongfa && Number(gongfa.冷却回合 || 0) > 0) gongfa.冷却回合 -= 1;
  }
}

function reviveMessage(player, lines) {
  return [`【${player.名号 || '你'}】`, ...lines];
}

/**
 * 渡劫死亡时的功法复活结算（纯函数）。
 * options: { minggeList, allowMingge = true }
 * 返回 { revived, source, healAmount, messages, effect }；未复活时 revived=false。
 */
export function resolveGongfaRevival(player, options = {}) {
  if (!player || typeof player !== 'object') return { revived: false, messages: [] };
  player.生命本源 = Math.max(0, Math.trunc(Number(player.生命本源) || 0)) || 100;
  const messages = [];

  // 命格复活：每次渡劫只判定一次（调用方每次渡劫重置 player._命格复活已判）
  if (options.allowMingge !== false && !player._命格复活已判 && options.minggeList) {
    player._命格复活已判 = true;
    const effects = getMinggeEffects(player, options.minggeList);
    const { chance, revived } = rollZhetianMinggeRevival(effects);
    if (revived) {
      const healAmount = Math.max(1, Math.floor(Number(player.血量上限 || 0) * 0.3));
      player.当前血量 = healAmount;
      return {
        revived: true,
        source: '命格·凤凰余血',
        healAmount,
        effect: null,
        messages: [
          ...reviveMessage(player, ['【命格·凤凰余血】', '体内残存的凤凰血脉骤然燃烧，于死境中重聚生机！']),
          `命格复活概率：${(chance * 100).toFixed(0)}%`,
          `恢复血量：${healAmount.toLocaleString()}`,
        ],
      };
    }
  }

  if (player.生命本源 <= 0) {
    return {
      revived: false,
      source: '生命本源枯竭',
      messages: reviveMessage(player, ['【生命本源枯竭】', '生命本源已完全枯竭，再也无法通过任何功法复活！', '需寻找不死神药或天地奇物补充生命本源']),
    };
  }

  const attempt = (name, effect) => {
    if (!checkRevivalGongfa(player, name) || player.生命本源 < 50) return null;
    player.生命本源 -= 50;
    player.功法[name].冷却回合 = REVIVAL_GONGFA_CD[name];
    return effect();
  };

  const zz = attempt('者字秘', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.7);
    player.当前血量 = healAmount;
    player.者字秘效果 = { 减伤比例: 0.25, 剩余次数: 3, 恢复比例: 0.05 };
    return { source: '者字秘·向死而生', healAmount, messages: [
      '【者字秘·向死而生】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['者字秘'] + '回合',
      '虚空裂开，九道仙光交织成璀璨"者"字，镇压诸天万道！', '「生命极尽，向死而生！」道音响彻星空',
      '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 接下来3道雷劫伤害减少25%', '2. 每次成功减伤后恢复5%最大生命值',
    ] };
  });
  if (zz) return { revived: true, ...zz };

  const zhf = attempt('真凰宝术', () => {
    player.当前血量 = Number(player.血量上限 || 0);
    player.真凰效果 = { 免死: true, 阶段减伤: 0.5 };
    return { source: '真凰宝术·浴火重生', healAmount: player.当前血量, messages: [
      '【真凰涅槃·浴火重生】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['真凰宝术'] + '回合',
      '七色神火焚尽苍穹，化作凤凰神卵！', '「真凰不灭，历劫永存！」涅槃真义流淌',
      '恢复效果：生命值全满', '附加效果：', '1. 免疫下一次致命伤害（保留10000点生命）', '2. 复活后首次雷劫伤害降低50%',
    ] };
  });
  if (zhf) return { revived: true, ...zhf };

  const ld = attempt('雷帝宝术', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.4);
    player.当前血量 = healAmount;
    player.雷帝效果 = { 转化比例: 0.4, 剩余次数: 4, 抗性提升: 0.1, 当前抗性: 0 };
    return { source: '雷帝宝术·劫中取生', healAmount, messages: [
      '【雷帝宝术·劫中取生】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['雷帝宝术'] + '回合',
      '漫天雷劫被牵引，化作雷池环绕！', '「以劫养身，以雷续命！」道音与雷暴共鸣！',
      '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 接下来4道雷劫伤害的40%转化为治疗', '2. 每次转化提升10%雷系抗性',
    ] };
  });
  if (ld) return { revived: true, ...ld };

  const ls = attempt('柳神法', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.6);
    player.当前血量 = healAmount;
    player.柳神效果 = {
      庇护层数: 3, 减伤比例: 0.2,
      持续恢复: { 回合数: 5, 治疗量: Math.floor(Number(player.血量上限 || 0) * 0.08) },
      免疫控制: true,
    };
    return { source: '柳神法·生生不息', healAmount, messages: [
      '【柳神法·生生不息】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['柳神法'] + '回合',
      '通天柳树虚影撑开雷海，枝条垂落万道霞光！', '「祭灵之道，生生不息...」祭祀音回荡星空！',
      '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 获得3层「柳神庇护」（每层减伤20%）', '2. 每道雷劫恢复8%最大生命值，持续5道', '3. 免疫控制效果',
    ] };
  });
  if (ls) return { revived: true, ...ls };

  const bmj = attempt('不灭经', () => {
    player.当前血量 = Number(player.血量上限 || 0);
    player.不灭经效果 = { 减伤比例: 0.4, 剩余次数: 5, 恢复比例: 0.3, 剩余复活次数: 2 };
    return { source: '不灭经·肉身不朽', healAmount: player.当前血量, messages: [
      '【不灭经·肉身不朽】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['不灭经'] + '回合',
      '金色经文浮现体表，肉身绽放不朽光辉！', '「肉身不灭，元神永存！」古老经文响彻星空',
      '恢复效果：生命值全满', '附加效果：', '1. 接下来5道雷劫伤害减少40%', '2. 每次受伤后恢复30%最大生命值',
    ] };
  });
  if (bmj) return { revived: true, ...bmj };

  const bts = attempt('补天术', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.8);
    player.当前血量 = healAmount;
    player.补天术效果 = { 免疫控制: 3, 冷却缩减: 0.2, 持续时间: 3 };
    return { source: '补天术·逆天改命', healAmount, messages: [
      '【补天术·逆天改命】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['补天术'] + '回合',
      '七彩神石虚影浮现，补全残缺的生命本源！', '「补天之道，逆天而行！」补天教真言震动虚空',
      '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 技能冷却时间缩短20%',
    ] };
  });
  if (bts) return { revived: true, ...bts };

  const whs = attempt('万化圣诀', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.5);
    player.当前血量 = healAmount;
    player.万化圣诀效果 = { 剩余次数: 3, 免死: true };
    return { source: '万化圣诀·化死为生', healAmount, messages: [
      '【万化圣诀·化死为生】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['万化圣诀'] + '回合',
      '周身浮现万道飞仙光，死气转化为生机！', '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 免疫下一次致命伤害（保留10000点生命）',
    ] };
  });
  if (whs) return { revived: true, ...whs };

  const npx = attempt('涅槃仙功', () => {
    const healAmount = Math.floor(Number(player.血量上限 || 0) * 0.3);
    player.当前血量 = healAmount;
    player.涅槃仙功效果 = { 减伤比例: 0.2, 剩余次数: 2, 本源恢复减半: true };
    return { source: '涅槃仙功', healAmount, messages: [
      '【涅槃仙功】', '消耗50点生命本源（剩余：' + player.生命本源 + '）', '冷却时间：' + REVIVAL_GONGFA_CD['涅槃仙功'] + '回合',
      '周身涅槃符文，勉强维持生机！', '恢复血量：' + healAmount.toLocaleString(), '附加效果：', '1. 接下来2次攻击伤害降低20%',
    ] };
  });
  if (npx) return { revived: true, ...npx };

  return {
    revived: false,
    source: '无复活手段',
    messages: reviveMessage(player, ['【道基崩碎·渡劫中断】', '周身大道符文寸寸崩裂，从渡劫中坠落！']),
  };
}
