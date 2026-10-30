import { findPlayerPossessions, isSuiyunInheritanceQuery } from './tianjiSearch.js';
import { getSuiyunStage } from './suiyun.js';
import { syncLifeSourceForRootChange } from './zhutianMirror.js';
import { bumpZhutianMirrorVersion } from '../utils/zhutianMirrorVersion.js';

export function validateTianjiReplacement(matches, replacement, keyword) {
  if (!replacement?.name) throw new Error('请指定物品表中存在的替换名称。');
  if (replacement.name === keyword) throw new Error('替换名称需要与抹除目标不同。');
  const roots = matches.some(item => ['root', 'suiyun'].includes(item.kind));
  if (roots && matches.some(item => !['root', 'suiyun'].includes(item.kind))) {
    throw new Error('目标同时命中灵根与物品，请选择含义唯一的名称。');
  }
  if (roots) {
    if (replacement.class && replacement.class !== '灵根') throw new Error('灵根需替换为灵根。');
    if (replacement.eff == null || !replacement.type) throw new Error('请回复有效的灵根名称。');
    if (replacement.唯一灵根 || replacement.不可随机获取 || getSuiyunStage({ 灵根: replacement })) {
      throw new Error('替换目标请选择普通灵根，唯一传承另行承接。');
    }
    return;
  }
  for (const entry of matches) {
    if (replacement.class !== entry.category) throw new Error(`【${entry.name}】需替换为${entry.category}类物品。`);
    if (entry.category === '装备' && entry.slot && replacement.type !== entry.slot) {
      throw new Error(`【${entry.name}】需替换为${entry.slot}类型装备。`);
    }
  }
}

// Mutate only owned entries; keep reward history so a later reawakening grants no duplicate rewards.
export function replacePlayerPossessions(state, keyword, replacement) {
  let matches = findPlayerPossessions(state, keyword);
  if (!matches.length) return { changed: false };
  validateTianjiReplacement(matches, replacement, keyword);
  const suiyun = isSuiyunInheritanceQuery(keyword) || matches.some(entry =>
    entry.kind === 'root' && getSuiyunStage({ 灵根: entry.container[entry.key] }));
  if (suiyun) matches = findPlayerPossessions(state, '岁云传承');
  validateTianjiReplacement(matches, replacement, keyword);
  const { player } = state;
  const previousRoot = player.灵根;
  const currentRootChanged = matches.some(entry => entry.container === player && entry.key === '灵根');
  for (const entry of matches) {
    if (entry.kind === 'suiyun') continue;
    const previous = entry.container[entry.key];
    if (entry.kind === 'root') entry.container[entry.key] = structuredClone(replacement);
    else if (typeof previous === 'string') entry.container[entry.key] = replacement.name;
    else {
      const next = structuredClone(replacement);
      if (next.class === '装备' && next.pinji == null) next.pinji = 1;
      for (const key of ['数量', '绑定者', 'author_name', 'islockd']) {
        if (Object.hasOwn(previous, key)) next[key] = previous[key];
      }
      entry.container[entry.key] = next;
    }
  }
  if (currentRootChanged) {
    syncLifeSourceForRootChange(player, previousRoot, player.灵根);
    player.法球倍率 = Number(player.灵根.法球倍率) || 0;
  }
  if (matches.some(entry => entry.kind === 'root') && player.诸天镜系统) {
    const life = player.诸天镜系统.生命本源切换状态;
    if (life && life.灵根 !== player.灵根?.name) delete player.诸天镜系统.生命本源切换状态;
    bumpZhutianMirrorVersion(player);
  }
  if (suiyun) {
    if (player.岁云) {
      delete player.岁云.已觉醒;
      delete player.岁云.自动晋升待结算;
    }
    delete player.岁云法则;
    if (Array.isArray(player.已领悟法则)) player.已领悟法则 = player.已领悟法则.filter(name => name !== '岁云法则');
    if (player.天资等级 === '岁云') {
      player.天资等级 = '平庸之资';
      player.天资评价 = '岁云传承已由管理员抹除，回归普通天资。';
    }
    if (player.势力 === '岁云剑宫') {
      player.势力 = '';
      player.势力职位 = '';
    }
  }
  if (matches.some(entry => entry.kind === 'skill')) {
    player.学习的功法 = [...new Set(player.学习的功法)];
  }
  return { changed: true, count: matches.length, suiyun };
}
