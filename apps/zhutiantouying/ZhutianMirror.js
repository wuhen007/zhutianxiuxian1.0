import { plugin } from '../../api/api.js';
import {
  channel,
  existplayer,
  player_efficiency,
  Read_player,
  Write_player,
} from '../../model/xiuxian.js';
import {
  challengeUltimateCardTrial,
  DECADE_LOCATIONS,
  DECADE_TOUR_WORLDS,
  ensureZhutianMirrorSystem,
  executeFinalAttackRide,
  exploreDecadeWorld,
  exploreMitakihara,
  exploreTomoeda,
  inspectZhutianAvatarAdvancement,
  loadZhutianAvatar,
  MITAKIHARA_LOCATIONS,
  MIRROR_REFINEMENT_REQUIREMENTS,
  MIRROR_TIER_CONFIG,
  purifyMadokaSoulGem,
  refineZhutianMirror,
  resetMitakiharaTimeline,
  setClowCardDeck,
  setDecadeCardDeck,
  TOMOEDA_LOCATIONS,
} from '../../model/zhutianMirror.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

async function getPlayerId(e) {
  return channel(e.user_id.toString().replace('qg_', ''));
}

function formatMaterials(system) {
  return Object.entries(system.材料).map(([name, amount]) => `${name}${amount}`).join('、');
}

function getAvatarStage(player, name) {
  return Number(player.诸天化身谱?.find(item => item.name === name)?.stage) || 0;
}

function getRealmGoal(player, targetStage) {
  const realm = inspectZhutianAvatarAdvancement(player, targetStage);
  return `${realm.ok ? '境界已满足' : `境界：${realm.requirement.label}`}`;
}

function getSakuraGoal(player) {
  const stage = getAvatarStage(player, '木之本樱');
  const cards = player.库洛牌系统.已封印库洛牌.length;
  const skill = player.库洛牌系统.魔法熟练度;
  if (stage === 0) return '基础化身：封印之钥 + 风、翔、影';
  if (stage === 1) return `星之杖：库洛牌${cards}/10、熟练度${skill}/50、月之审判、${getRealmGoal(player, 2)}；#小樱进阶`;
  if (stage === 2) return `梦之杖：库洛牌${cards}/52、熟练度${skill}/200、梦之试炼、${getRealmGoal(player, 3)}；#小樱进阶`;
  return '梦之杖已经圆满';
}

function getMadokaGoal(player) {
  const stage = getAvatarStage(player, '鹿目圆');
  const hope = player.希望系统;
  if (stage === 0) return '基础化身：灵魂宝石 + 因果碎片3';
  if (stage === 1) return `许愿者·圆：希望${hope.希望碎片}/100、拯救${hope.拯救人数}/10、助人${hope.助人次数}/10、生命本源100、${getRealmGoal(player, 2)}；#魔法少女进阶`;
  if (stage === 2) return `希望之光·圆：希望${hope.希望碎片}/500、净化${hope.净化绝望值}/1000、因果${hope.因果律领悟}/10、生命本源250、${getRealmGoal(player, 3)}；#魔法少女进阶`;
  if (stage === 3) return `圆神：希望${hope.希望碎片}/1000、时间线${hope.时间线干涉}/5、因果${hope.因果律领悟}/50、生命本源300、${getRealmGoal(player, 4)}；#魔法少女进阶`;
  return '圆环之理已经圆满';
}

function getDecadeGoal(player) {
  const stage = getAvatarStage(player, '门矢士');
  const progress = player.诸天镜系统.世界进度.假面骑士帝骑;
  if (stage === 0) return `门矢士：帝骑驱动器 + 骑士卡片${progress.骑士卡片.length}/3`;
  if (stage === 1) return `帝骑：集齐九位主骑卡${progress.骑士卡片.length}/9、${getRealmGoal(player, 2)}`;
  if (stage === 2) return `帝骑·神主：神主触屏碎片${progress.神主触屏碎片}/10、${getRealmGoal(player, 3)}`;
  if (stage === 3) return `帝骑·终极神主：巡游${progress.已巡游世界.length}/${DECADE_TOUR_WORLDS.length}、${getRealmGoal(player, 4)}后使用 #终极卡试炼 路线`;
  return '终极神主已经圆满';
}

export class ZhutianMirrorSystem extends plugin {
  constructor() {
    super({
      name: 'ZhutianMirrorSystem',
      dsc: '诸天镜与异世界化身',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#诸天镜$', fnc: 'mirrorPanel' },
        { reg: '^#友枝町$', fnc: 'tomoedaMap' },
        { reg: '^#探索友枝町(?:\\s+.*)?$', fnc: 'exploreTomoeda' },
        { reg: '^#库洛牌组合(?:\\s+.*)?$', fnc: 'setClowDeck' },
        { reg: '^#见泷原$', fnc: 'mitakiharaMap' },
        { reg: '^#探索见泷原(?:\\s+.*)?$', fnc: 'exploreMitakihara' },
        { reg: '^#净化灵魂宝石$', fnc: 'purifySoulGem' },
        { reg: '^#重置见泷原时间线$', fnc: 'resetMadokaTimeline' },
        { reg: '^#骑士世界$', fnc: 'decadeMap' },
        { reg: '^#探索骑士世界(?:\\s+.*)?$', fnc: 'exploreDecadeWorld' },
        { reg: '^#编组骑士卡片(?:\\s+.*)?$', fnc: 'setDecadeDeck' },
        { reg: '^#最终攻击驾驭$', fnc: 'finalAttackRide' },
        { reg: '^#终极卡试炼(?:\\s+.*)?$', fnc: 'ultimateCardTrial' },
        { reg: '^#诸天化身$', fnc: 'avatarPanel' },
        { reg: '^#装载化身\\s*.*$', fnc: 'loadAvatar' },
        { reg: '^#淬炼诸天镜$', fnc: 'refineMirror' },
      ],
    });
  }

  async mirrorPanel(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const system = ensureZhutianMirrorSystem(player);
      await Write_player(playerId, player);
      if (!system.已绑定) {
        return e.reply('【诸天镜】尚未绑定\n在天机阁兑换诸天镜后，使用 #使用诸天镜 完成绑定。');
      }
      const tier = MIRROR_TIER_CONFIG[system.镜阶];
      const next = MIRROR_REFINEMENT_REQUIREMENTS[system.镜阶];
      const relics = Object.entries(system.异界遗物).filter(([, amount]) => amount > 0);
      const rows = [
        `【诸天镜】${tier.name}`,
        `镜能：${system.镜能}/${tier.energyMax}（每日恢复）`,
        `材料：${formatMaterials(system)}`,
        `世界印记：${system.世界印记.length}`,
        `已解锁世界：${system.已解锁世界.join('、') || '无'}`,
        `当前化身：${system.当前化身 || '本源'}`,
      ];
      const entries = ['#友枝町'];
      if (system.镜阶 >= 2) entries.push('#见泷原');
      if (system.镜阶 >= 3) entries.push('#骑士世界');
      entries.push('#诸天世界');
      rows.push(`可用入口：${entries.join('、')}`);
      if (relics.length > 0) rows.push(`异界遗物：${relics.map(([name, amount]) => `${name}×${amount}`).join('、')}`);
      if (next) {
        rows.push('', `下一阶：${Object.entries(next).map(([name, amount]) => `${name}×${amount}`).join('、')}`);
        rows.push('满足条件后使用 #淬炼诸天镜');
      } else {
        rows.push('', '诸天镜已至七阶圆满');
      }
      return e.reply(rows.join('\n'));
    });
  }

  async tomoedaMap(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const system = ensureZhutianMirrorSystem(player);
      await Write_player(playerId, player);
      if (!system.已绑定) return e.reply('请先在天机阁兑换并使用诸天镜。');

      const progress = system.世界进度.魔法少女樱;
      const rows = [
        '【友枝町·投影地图】',
        `探索度：${progress.探索度}/100 | 镜能：${system.镜能}/${MIRROR_TIER_CONFIG[system.镜阶].energyMax}`,
        `封印之钥：${progress.封印之钥 ? '已获得' : `未获得（第8次有效探索保底，当前${progress.有效探索次数}次）`}`,
        `基础库洛牌：风${player.库洛牌系统.已封印库洛牌.includes('风') ? '√' : '×'} 翔${player.库洛牌系统.已封印库洛牌.includes('翔') ? '√' : '×'} 影${player.库洛牌系统.已封印库洛牌.includes('影') ? '√' : '×'}`,
        `已封印库洛牌：${player.库洛牌系统.已封印库洛牌.length}/52`,
        `出战卡组：${player.库洛牌系统.出战卡组.join('、') || '未编组'}${player.库洛牌系统.当前组合 ? `（${player.库洛牌系统.当前组合}）` : ''}`,
        `下一目标：${getSakuraGoal(player)}`,
        '',
      ];
      for (const [name, config] of Object.entries(TOMOEDA_LOCATIONS)) {
        rows.push(`${system.镜阶 >= config.minTier ? '可探索' : '未解锁'} ${name}（${config.minTier}阶）`);
      }
      rows.push('', '使用 #探索友枝町 地点名', '使用 #库洛牌组合 卡牌1 卡牌2 卡牌3');
      return e.reply(rows.join('\n'));
    });
  }

  async exploreTomoeda(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const location = e.msg.replace(/^#探索友枝町\s*/, '').trim();
    if (!location) return this.tomoedaMap(e);

    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = exploreTomoeda(player, location);
      if (!result.ok) {
        if (result.reason === 'location') return e.reply(`友枝町没有【${location}】这个探索地点，使用 #友枝町 查看地图。`);
        if (result.reason === 'unbound') return e.reply('请先在天机阁兑换并使用诸天镜。');
        if (result.reason === 'tier') return e.reply(`诸天镜至少达到${result.requiredTier}阶才能探索【${location}】。`);
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
      }

      await Write_player(playerId, player);
      const rows = [
        `【友枝町·${location}】`,
        `探索度 +8，镜尘 +${result.dust}${result.echo ? '，世界残响 +1' : ''}`,
        result.card ? `成功封印库洛牌【${result.card}】` : '这次没有发现可封印的库洛牌',
        `剩余镜能：${result.remainingEnergy}`,
      ];
      if (result.keyFound) rows.push('你在异界共鸣中找到了【封印之钥】！');
      if (result.unlocked) rows.push('封印之钥与风、翔、影三牌共鸣，【木之本樱】基础化身已经解锁！', '使用 #装载化身 木之本樱');
      if (result.combo) rows.push(`当前组合【${result.combo}】已在本次探索生效。`);
      return e.reply(rows.join('\n'));
    });
  }

  async setClowDeck(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const cards = e.msg.replace(/^#库洛牌组合\s*/, '').trim().split(/\s+/).filter(Boolean);
    if (cards.length === 0) return e.reply('使用 #库洛牌组合 卡牌1 卡牌2 卡牌3，例如：#库洛牌组合 风 翔 影');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = setClowCardDeck(player, cards);
      if (!result.ok) {
        if (result.reason === 'count') return e.reply('库洛牌组合必须放入三张不同的牌。');
        return e.reply(`尚未封印：${result.missing.join('、')}`);
      }
      await Write_player(playerId, player);
      const effect = {
        疾风封印: '探索发现未收录库洛牌时必定完成封印',
        元素共鸣: '探索额外获得镜尘，并必得世界残响',
        月华守护: '月之审判成功率提高25%，第三次挑战保底',
        梦境回廊: '每次探索额外获得3点魔法熟练度',
      }[result.combo];
      return e.reply(`已编组：${result.cards.join('、')}\n${result.combo ? `触发组合【${result.combo}】：${effect}` : '未触发固定组合，仍可正常用于探索。'}`);
    });
  }

  async mitakiharaMap(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const system = ensureZhutianMirrorSystem(player);
      await Write_player(playerId, player);
      if (!system.已绑定) return e.reply('请先在天机阁兑换并使用诸天镜。');

      const progress = system.世界进度.魔法少女小圆;
      const rows = [
        '【见泷原·因果观测图】',
        `探索度：${progress.探索度}/100 | 镜能：${system.镜能}/${MIRROR_TIER_CONFIG[system.镜阶].energyMax}`,
        `灵魂宝石：${progress.灵魂宝石 ? '已获得' : `未获得（第8次有效探索保底，当前${progress.有效探索次数}次）`}`,
        `因果碎片：${progress.因果碎片}/3 | 悲叹之种：${progress.悲叹之种}`,
        `灵魂宝石污浊：${progress.灵魂宝石污浊度}/100 | 时间线重置：${progress.时间线重置次数}次`,
        `鹿目圆化身：${progress.基础化身已解锁 ? '已解锁' : '未解锁'}`,
        `下一目标：${getMadokaGoal(player)}`,
        '',
      ];
      for (const [name, config] of Object.entries(MITAKIHARA_LOCATIONS)) {
        rows.push(`${system.镜阶 >= config.minTier ? '可探索' : '未解锁'} ${name}（${config.minTier}阶）`);
      }
      rows.push('', '使用 #探索见泷原 地点名', '使用 #净化灵魂宝石 消耗悲叹之种', '污浊达到60后可使用 #重置见泷原时间线');
      return e.reply(rows.join('\n'));
    });
  }

  async exploreMitakihara(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const location = e.msg.replace(/^#探索见泷原\s*/, '').trim();
    if (!location) return this.mitakiharaMap(e);

    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = exploreMitakihara(player, location);
      if (!result.ok) {
        if (result.reason === 'location') return e.reply(`见泷原没有【${location}】这个探索地点，使用 #见泷原 查看地图。`);
        if (result.reason === 'unbound') return e.reply('请先在天机阁兑换并使用诸天镜。');
        if (result.reason === 'tier') return e.reply(`诸天镜至少达到${result.requiredTier}阶才能探索【${location}】。`);
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
      }

      await Write_player(playerId, player);
      const rows = [
        `【见泷原·${location}】`,
        `因果碎片 +1，希望碎片 +${result.hopeShards}，净化绝望值 +${result.despairPurified}`,
        `镜尘 +${result.dust}${result.echo ? '，世界残响 +1' : ''}`,
        result.griefSeed ? '你净化结界后收下了一枚【悲叹之种】' : '魔女结界消散，没有留下悲叹之种',
        result.corruptionGain ? `灵魂宝石污浊 +${result.corruptionGain}，当前${player.诸天镜系统.世界进度.魔法少女小圆.灵魂宝石污浊度}/100` : '灵魂宝石尚未显化，本次未累积污浊',
        `剩余镜能：${result.remainingEnergy}`,
      ];
      if (result.gemFound) rows.push('纠缠的因果凝成了【灵魂宝石】！');
      if (result.unlocked) rows.push('灵魂宝石与三枚因果碎片共鸣，【鹿目圆】基础化身已经解锁！', '使用 #装载化身 鹿目圆');
      if (result.timelineCollapsed) rows.push('污浊突破极限，当前时间线崩塌并自动回退到50点污浊；下次可提前净化或主动重置。');
      return e.reply(rows.join('\n'));
    });
  }

  async purifySoulGem(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = purifyMadokaSoulGem(player);
      if (!result.ok) {
        if (result.reason === 'gem') return e.reply('尚未获得灵魂宝石。');
        if (result.reason === 'seed') return e.reply('没有可用于净化的悲叹之种。');
        return e.reply('灵魂宝石当前没有污浊，无需净化。');
      }
      await Write_player(playerId, player);
      return e.reply(`消耗一枚悲叹之种，灵魂宝石污浊由${result.before}降至${result.after}，净化绝望值 +20。`);
    });
  }

  async resetMadokaTimeline(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = resetMitakiharaTimeline(player);
      if (!result.ok) {
        if (result.reason === 'gem') return e.reply('尚未获得灵魂宝石。');
        if (result.reason === 'corruption') return e.reply('污浊度未达到60，当前时间线仍然稳定。');
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
      }
      await Write_player(playerId, player);
      return e.reply(`你消耗1点镜能改写因果，将污浊从${result.before}归零。时间线干涉 +1，镜尘 +8，剩余镜能${result.remainingEnergy}。`);
    });
  }

  async decadeMap(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const system = ensureZhutianMirrorSystem(player);
      await Write_player(playerId, player);
      if (!system.已绑定) return e.reply('请先在天机阁兑换并使用诸天镜。');

      const progress = system.世界进度.假面骑士帝骑;
      const rows = [
        '【骑士世界·世界巡游图】',
        `探索度：${progress.探索度}/100 | 镜能：${system.镜能}/${MIRROR_TIER_CONFIG[system.镜阶].energyMax}`,
        `帝骑驱动器：${progress.帝骑驱动器 ? '已获得' : `未获得（第8次有效探索保底，当前${progress.有效探索次数}次）`}`,
        `骑士卡片：${progress.骑士卡片.length}/9 | 世界共鸣：${progress.共鸣度}`,
        `出战卡组：${progress.出战卡组.join('、') || '未编组'} | 世界融合度：${progress.世界融合度}/100`,
        `神主触屏碎片：${progress.神主触屏碎片}/10 | 十世界巡游：${progress.已巡游世界.length}/${DECADE_TOUR_WORLDS.length}`,
        `门矢士化身：${progress.基础化身已解锁 ? '已解锁' : '未解锁'} | 帝骑形态：${progress.帝骑已解锁 ? '已解锁' : '未解锁'}`,
        `下一目标：${getDecadeGoal(player)}`,
        '',
      ];
      for (const [name, config] of Object.entries(DECADE_LOCATIONS)) {
        rows.push(`${system.镜阶 >= config.minTier ? '可探索' : '未解锁'} ${name}（${config.minTier}阶）`);
      }
      rows.push('', '使用 #探索骑士世界 地点名', '使用 #编组骑士卡片 卡片1 卡片2 卡片3', '融合度达到60后使用 #最终攻击驾驭');
      return e.reply(rows.join('\n'));
    });
  }

  async exploreDecadeWorld(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const location = e.msg.replace(/^#探索骑士世界\s*/, '').trim();
    if (!location) return this.decadeMap(e);

    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = exploreDecadeWorld(player, location);
      if (!result.ok) {
        if (result.reason === 'location') return e.reply(`骑士世界没有【${location}】这个探索地点，使用 #骑士世界 查看地图。`);
        if (result.reason === 'unbound') return e.reply('请先在天机阁兑换并使用诸天镜。');
        if (result.reason === 'tier') return e.reply(`诸天镜至少达到${result.requiredTier}阶才能探索【${location}】。`);
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
        if (result.reason === 'crisis') return e.reply('世界融合度已经达到100，探索通道被重叠世界封锁。请先编组三张骑士卡片并使用 #最终攻击驾驭。');
      }

      await Write_player(playerId, player);
      if (result.rootChanged) await player_efficiency(playerId);
      const rows = [
        `【骑士世界·${location}】`,
        `世界共鸣 +${result.card ? 10 : 4}，镜尘 +${result.dust}${result.echo ? '，世界残响 +1' : ''}`,
        result.card ? `获得骑士卡片【${result.card}】` : '此处的骑士卡片已经全部收录',
        `世界融合度 +${result.fusionGain}，当前${player.诸天镜系统.世界进度.假面骑士帝骑.世界融合度}/100`,
        `剩余镜能：${result.remainingEnergy}`,
      ];
      if (result.driverFound) rows.push('极光帷幕展开，你取得了【帝骑驱动器】！');
      if (result.unlocked) rows.push('驱动器读取三张骑士卡片，【门矢士】基础化身已经解锁！', '使用 #装载化身 门矢士');
      if (result.advanced) rows.push('九位主骑之力完成共鸣，【门矢士】化身晋升第二阶段【帝骑】！');
      if (result.touchFragment) rows.push(`获得【神主触屏碎片】，当前${player.诸天镜系统.世界进度.假面骑士帝骑.神主触屏碎片}/10。`);
      if (result.godMasterUnlocked) rows.push('十枚碎片凝成神主触屏，【门矢士】化身晋升第三阶段【帝骑·神主】！');
      if (result.realmBlocked) rows.push(`进阶积累已经满足，境界尚差：${result.realmBlocked.missing.join('；')}。进度已保留。`);
      if (result.touredWorld) rows.push(`极光帷幕展开，完成【${result.touredWorld}】巡游。`);
      if (result.crisis) rows.push('世界融合度已经达到100，下一次探索前必须使用 #最终攻击驾驭 化解危机。');
      return e.reply(rows.join('\n'));
    });
  }

  async setDecadeDeck(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const cards = e.msg.replace(/^#编组骑士卡片\s*/, '').trim().split(/\s+/).filter(Boolean);
    if (cards.length === 0) return e.reply('使用 #编组骑士卡片 卡片1 卡片2 卡片3，例如：#编组骑士卡片 空我 龙骑 剑');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = setDecadeCardDeck(player, cards);
      if (!result.ok) {
        if (result.reason === 'count') return e.reply('骑士卡组必须放入三张不同的卡片。');
        return e.reply(`尚未收录骑士卡片：${result.missing.join('、')}`);
      }
      await Write_player(playerId, player);
      return e.reply(`骑士卡组已编成：${result.cards.join('、')}。世界融合度达到60后可使用 #最终攻击驾驭。`);
    });
  }

  async finalAttackRide(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = executeFinalAttackRide(player);
      if (!result.ok) {
        if (result.reason === 'unbound') return e.reply('请先绑定诸天镜。');
        if (result.reason === 'tier') return e.reply('最终攻击驾驭需要三阶诸天镜。');
        if (result.reason === 'deck') return e.reply('请先使用 #编组骑士卡片 选择三张已经收录的卡片。');
        if (result.reason === 'fusion') return e.reply(`世界融合度只有${result.current}/100，达到60后才能发动最终攻击驾驭。`);
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
      }
      await Write_player(playerId, player);
      return e.reply([
        '【FINAL ATTACK RIDE】',
        `${result.cards.join('、')}三张卡片依次亮起，重叠世界被贯穿。`,
        `世界融合度：${result.before} → ${result.after}`,
        `世界共鸣 +20，镜尘 +12，世界残响 +2，剩余镜能${result.remainingEnergy}。`,
      ].join('\n'));
    });
  }

  async ultimateCardTrial(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const route = e.msg.replace(/^#终极卡试炼\s*/, '').trim();
    if (!route) return e.reply('终极卡试炼路线：\n强攻：世界共鸣达到220\n共鸣：编组三张骑士卡片\n守护：至少化解一次世界融合危机\n使用 #终极卡试炼 路线');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = challengeUltimateCardTrial(player, route);
      if (!result.ok) {
        if (result.reason === 'completed') return e.reply('帝骑·终极神主已经完成觉醒。');
        if (result.reason === 'stage') return e.reply('需要先集齐十枚神主触屏碎片，晋升【帝骑·神主】。');
        if (result.reason === 'tour') return e.reply(`十世界巡游尚未完成：${result.current}/${result.required}。`);
        if (result.reason === 'route') return e.reply('试炼路线只有：强攻、共鸣、守护。');
        if (result.reason === 'resonance') return e.reply(`强攻路线需要世界共鸣${result.required}，当前${result.current}。`);
        if (result.reason === 'deck') return e.reply('共鸣路线需要先编组三张骑士卡片。');
        if (result.reason === 'battle') return e.reply('守护路线需要先使用最终攻击驾驭化解一次世界融合危机。');
        if (result.reason === 'realm') return e.reply(`终极神主境界尚差：${result.realmBlocked.missing.join('；')}。试炼进度已保留。`);
        if (result.reason === 'energy') return e.reply('今日镜能已经耗尽，明日会自动恢复。');
      }
      await Write_player(playerId, player);
      if (result.rootChanged) await player_efficiency(playerId);
      return e.reply(`你选择【${route}】通过终极卡试炼，二十一张终极卡在神主触屏上展开，【帝骑·终极神主】已经解锁！剩余镜能${result.remainingEnergy}。`);
    });
  }

  async avatarPanel(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const system = ensureZhutianMirrorSystem(player);
      await Write_player(playerId, player);
      if (!system.已绑定) return e.reply('请先绑定诸天镜。');
      if (player.诸天化身谱.length === 0) {
        const entries = ['#友枝町'];
        if (system.镜阶 >= 2) entries.push('#见泷原');
        if (system.镜阶 >= 3) entries.push('#骑士世界');
        return e.reply(`【诸天化身谱】尚未收录化身。\n当前可探索：${entries.join('、')}`);
      }
      const rows = player.诸天化身谱.map(avatar =>
        `${system.当前化身 === avatar.name ? '当前' : '可装载'} ${avatar.name}·第${avatar.stage}阶段（${avatar.world}）`
      );
      const goals = [];
      if (player.诸天化身谱.some(item => item.name === '木之本樱')) goals.push(getSakuraGoal(player));
      if (player.诸天化身谱.some(item => item.name === '鹿目圆')) goals.push(getMadokaGoal(player));
      if (player.诸天化身谱.some(item => item.name === '门矢士')) goals.push(getDecadeGoal(player));
      if (goals.length > 0) rows.push('', '【阶段目标】', ...goals);
      return e.reply(['【诸天化身谱】', ...rows, '', '使用 #装载化身 化身名；使用 #装载化身 本源 返回原灵根。'].join('\n'));
    });
  }

  async loadAvatar(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    const avatarName = e.msg.replace(/^#装载化身\s*/, '').trim();
    if (!avatarName) return this.avatarPanel(e);

    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = loadZhutianAvatar(player, avatarName);
      if (!result.ok) {
        if (result.reason === 'unbound') return e.reply('请先绑定诸天镜。');
        if (result.reason === 'origin') return e.reply('旧版诸天灵根迁移时没有留下原灵根记录，当前没有可返回的本源灵根。');
        return e.reply(`化身谱中尚未收录【${avatarName}】，使用 #诸天化身 查看。`);
      }
      await Write_player(playerId, player);
      await player_efficiency(playerId);
      return e.reply(`诸天镜映照己身，已装载【${result.name}】。`);
    });
  }

  async refineMirror(e) {
    const playerId = await getPlayerId(e);
    if (!await existplayer(playerId)) return e.reply('玩家不存在，请先创建角色');
    return withPlayerMutationLock(playerId, async () => {
      const player = await Read_player(playerId);
      const result = refineZhutianMirror(player);
      if (!result.ok) {
        if (result.reason === 'unbound') return e.reply('请先绑定诸天镜。');
        if (result.reason === 'max') return e.reply('诸天镜已经达到七阶圆满。');
        const missing = result.missing.map(item => `${item.name}${item.current}/${item.amount}`).join('、');
        return e.reply(`淬炼材料不足：${missing}`);
      }
      await Write_player(playerId, player);
      return e.reply(`诸天镜淬炼成功，晋升为【${MIRROR_TIER_CONFIG[result.tier].name}】，镜能已经补满。`);
    });
  }
}
