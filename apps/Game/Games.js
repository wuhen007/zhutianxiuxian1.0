import {
  plugin,
  puppeteer,
  verc,
  data,
  config,
  Show,
} from '../../api/api.js';
import {
  Read_player,
  existplayer,
  Write_player,
  Write_linggen,
  isNotNull,
  add_qinmidu,
  fstadd_qinmidu,
  Add_najie_thing,
  find_qinmidu,
  exist_hunyin,
  exist_najie_thing,
  Go,
  setu,
  channel
} from '../../model/xiuxian.js';
import { Add_灵石, Add_修为 } from '../../model/xiuxian.js';
import {
  SOURCE_DUEL_COOLDOWN_MS,
  SOURCE_DUEL_NPCS,
  SOURCE_DUEL_RESONANCES,
  SOURCE_DUEL_STATE_TTL_SECONDS,
  createSourceDuelSession,
  getSourceDuelNpc,
  resolveSourceDuel,
} from './sourceDuelRules.js';
import {
  SKY_GARDEN_COOLDOWN_MS,
  STONE_KING_CONFIG,
  STONE_MARKET_STATE_TTL_SECONDS,
  createStoneKingState,
  createStoneMarketState,
  getCutExtraCost,
  getLayeredPreview,
  getShanghaiDateKey,
  getStoneGarden,
  getStoneWeekKey,
  getWeeklyStoneKing,
  inspectStone,
  resolveStoneCut,
  resolveStoneKing,
  useHeavenlyCheck,
} from './stoneMarketRules.js';
let gane_key_user = []; //怡红院限制
var yazhu = []; //投入
let gametime = []; //临时游戏CD
export class Games extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Games',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#怡红院$',
          fnc: 'Xiuianplay',
        },
        // {
        //   reg: '^#金银坊$',
        //   fnc: 'Moneynumber',
        // },
        // {
        //   reg: '^#(梭哈)|(投入.*)$',
        //   fnc: 'Moneycheck',
        // },
        {
          reg: '^(大|小)$',
          fnc: 'Moneycheckguess',
        },
        // {
        //   reg: '^#金银坊记录$',
        //   fnc: 'Moneyrecord',
        // },
        {
          reg: '^双修$',
          fnc: 'Couple',
        },
        {
          reg: '^#源石坊帮助$',
          fnc: 'StoneMarketHelp',
        },
        {
          reg: '^#源石坊(外园|地字号|天字号)?$',
          fnc: 'StoneMarket',
        },
        {
          reg: '^#勘石\\s*[1-5]$',
          fnc: 'StoneInspect',
        },
        {
          reg: '^#天师辨石\\s*[1-5]$',
          fnc: 'StoneHeavenlyCheck',
        },
        {
          reg: '^#购石\\s*[1-5]$',
          fnc: 'StoneBuy',
        },
        {
          reg: '^#(一刀切|层层剥石|封源切法)$',
          fnc: 'StoneCutMethod',
        },
        {
          reg: '^#(继续切|石坊回购)$',
          fnc: 'StonePeelDecision',
        },
        {
          reg: '^#镇园石王$',
          fnc: 'StoneKingView',
        },
        {
          reg: '^#石王助切$',
          fnc: 'StoneKingJoin',
        },
        {
          reg: '^#源石坊记录$',
          fnc: 'StoneRecord',
        },
        {
          reg: '^#源石坊对决$',
          fnc: 'StoneDuelMenu',
        },
        {
          reg: '^#源石坊对决\\s*[1-3]$',
          fnc: 'StoneDuelStart',
        },
        {
          reg: '^#对决选石\\s*[1-5]\\s+[1-5]\\s+[1-5](?:\\s+(平注|加注|豪赌))?$',
          fnc: 'StoneDuelChoice',
        },
        {
          reg: '^#拒绝双修$',
          fnc: 'Refusecouple',
        },
        {
          reg: '^#允许双修$',
          fnc: 'Allowcouple',
        },
        {
          reg: '^#召唤如梦道祖$',
          fnc: 'rumeng',
        },
        {
          reg: '^(请教修行|求取道法|论道古今)$',
          fnc: 'rumengChoice',
        },
      ],
    });
  }

async rumeng(e) {
    if (!verc({ e })) return false;
    
    // 处理QQ号
    const rawQQ = e.user_id.toString().replace('qg_', '');
    const usr_qq = (await channel(rawQQ)).toString();
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        return e.reply('玩家数据不存在');
    }
    
    // 检查如梦道痕
    const rumengCount = await exist_najie_thing(usr_qq, '如梦道痕', '道具');
    
    if (!rumengCount || rumengCount < 1) {
        return e.reply([
            `【道痕缺失】`,
            `你欲联系如梦道祖，却寻不见如梦道痕！`,
            `虚空传来道音：`,
            `"无如梦道痕者，不得扰本祖清修！"`,
            `提示：`,
            `- 需持有「如梦道痕」方可联系道祖`,
            `- 可通过特殊机缘获得此物`
        ].join('\n'));
    }
    
    // 扣除道痕
    await Add_najie_thing(usr_qq, '如梦道痕', '道具', -1);
    
    // 构建道祖回应
    const daozuText = [
        `【如梦道祖】`,
        `虚空泛起涟漪，一道朦胧身影显化！`,
        `如梦道祖眸光如星海流转：`,
        `"小友何事寻我？"`,
        `提示：`,
        `- 可向道祖请教修行疑难`,
        `- 或求取如梦道法传承`,
        `回复选项：`,
        `请教修行`,
        `求取道法`,
        `论道古今`,
    ].join('\n');
    
    // 设置道祖对话状态
    const player = await Read_player(usr_qq);
    player.如梦道祖对话 = true;
    await Write_player(usr_qq, player);
    
    return e.reply(daozuText);
}
// 处理道祖对话选择
 async rumengChoice(e) {
    if (!verc({ e })) return false;
    
    const rawQQ = e.user_id.toString().replace('qg_', '');
    const usr_qq = (await channel(rawQQ)).toString();
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        return e.reply('玩家数据不存在');
    }
    
    const player = await Read_player(usr_qq);
    const choice = e.msg.trim();
    
    if (!player.如梦道祖对话) {
        return true; // 不是道祖对话状态，交给其他插件处理
    }
    
    // 清除状态避免重复触发
    player.如梦道祖对话 = false;
    await Write_player(usr_qq, player);
    
    // 处理不同选择
    switch(choice) {
        case '请教修行':
            return this.handleCultivation(e, usr_qq);
        case '求取道法':
            return this.handleRequestTechnique(e, usr_qq);
        case '论道古今':
            return this.handleDiscussDao(e, usr_qq);
        default:
            return e.reply('请选择有效选项：请教修行、求取道法、论道古今');
    }
  }

  // 处理请教修行
  async handleCultivation(e, usr_qq) {
    const player = await Read_player(usr_qq);
    

    const gain = Math.floor(Math.random() * 1000000000) + 1500000;
    
    player.修为 += gain;
    player.血气 += Math.floor(gain * 0.8);
    await Write_player(usr_qq, player);
    
    return e.reply([
        `【道祖点化】`,
        `如梦道祖一指轻点，一道九彩流光融入你识海！`,
        `你神游太虚，见证星河生灭，顿悟修行至理`,
        `体内灵力奔腾如江海，境界壁垒轰然破碎`,
        `修为暴涨：${gain.toLocaleString()}`,
        `血气增强：${Math.floor(gain * 0.8).toLocaleString()}`,
        `道祖言："修行之路，贵在明心见性"`,
        `"望你勤修不辍，早日证得大道！"`
    ].join('\n'));
  }

  // 处理求取道法
  async handleRequestTechnique(e, usr_qq) {
    const daofaList = [
        {name: '如梦令',class: '功法',  type: '道与法', desc: '可编织梦境，化虚为实'},
        {name: '大梦千秋',class: '功法', type: '道与法', desc: '一梦千年，感悟大道真谛'},
        {name: '浮生若梦',class: '功法', type: '道与法', desc: '虚实转换，幻化万千'},
    ];
    
    const randomIndex = Math.floor(Math.random() * daofaList.length);
    const technique = daofaList[randomIndex];
    
    await Add_najie_thing(usr_qq, technique.name, technique.class, 1);
    
    return e.reply([
        `【道法传承】`,
        `如梦道祖袖中飞出一卷道书，`,
        `书页无风自动，浮现玄奥道纹`,
        `道祖言："此乃《${technique.name}》，`,
        `为我早年所创，今日便传于你"`,
        `获得：【${technique.name}】`,
        `类型：${technique.type}`,
        `描述：${technique.desc}`,
        `提示：可在纳戒中查看并使用`
    ].join('\n'));
  }

  // 处理论道古今
  async handleDiscussDao(e, usr_qq) {
    const loreTexts = [
        `"梦非梦，醒非醒，真作假时假亦真，无为有处有还无！"`,
        `"世间万物，皆如梦幻泡影，唯道永恒！"`,
        `"一花一世界，一梦一轮回，你怎知此刻非梦中？"`,
        `"修行千年，方知大梦一场，然梦中亦可证道！"`,
        `"昔年我观庄周梦蝶，顿悟虚实大道，创如梦仙诀"`
    ];
    
    const insights = [
        '你心有所悟，道心更加通透',
        '你识海中道音回荡，境界隐隐松动',
        '你感悟到时空真谛，遁法有所精进',
        '你对虚实之道的理解更加深刻',
        '你神魂凝练，神识范围扩大三成'
    ];
    
    const randomText = loreTexts[Math.floor(Math.random() * loreTexts.length)];
    const randomInsight = insights[Math.floor(Math.random() * insights.length)];
    
    // 随机增加少量修为
    const gain = Math.floor(Math.random() * 10000000000) + 1500000;
    await Add_修为(usr_qq, gain);
    
    return e.reply([
        `【论道古今】`,
        `你与如梦道祖对坐论道，`,
        `四周演化星河生灭、世界轮回之景`,
        `三日三夜，不觉时光流逝`,
        `道祖言：`,
        `${randomText}`,
        `${randomInsight}`,
        `修为增加：${gain.toLocaleString()}`,
        `道祖身影渐淡："缘起缘灭，好自为之..."`
    ].join('\n'));
  }

// 源石坊功能
async StoneMarketHelp(e) {
  if (!verc({ e })) return false;
  e.reply([
    `【神城源石坊·玩法帮助】`,
    ``,
    `一、选园赌石`,
    `#源石坊外园：灵石购石，每日3块`,
    `#源石坊地字号：源石购石，每日2块`,
    `#源石坊天字号：高风险珍品园，每日1块，购买后冷却20小时`,
    `每园每日可用2次 #勘石编号；源天师另可用1次 #天师辨石编号。`,
    `看准后发送 #购石编号，购买后须先切石才能再买。`,
    ``,
    `二、开石方法`,
    `#一刀切：免费，但可能损坏神药、神液和帝经残页`,
    `#层层剥石：加收石价10%，出现异象可 #继续切 或 #石坊回购`,
    `#封源切法：源天师专属，消耗源石压制凶物并保全仙珍`,
    ``,
    `三、镇园石王`,
    `#镇园石王 查看本周奇石；#石王助切 投入30万斤源石。`,
    `仅限群内，凑齐3人开切；每名玩家每周只能参加一次。`,
    ``,
    `四、源术对决`,
    `#源石坊对决 查看对手，#源石坊对决1 发起挑战。`,
    `五选三示例：#对决选石1 3 5 加注`,
    `可选平注×1、加注×2、豪赌×3；败者押注与本方切源归胜者。`,
    ``,
    `五、奇珍与记录`,
    `地字号、天字号可能切出神源液、药王、仙金和羽化仙经残页。`,
    `10张残页可用 #合成羽化仙经*1 合成完整帝经。`,
    `发送 #源石坊记录 查看累计收支、空石和对决战绩。`,
  ].join('\n'));
  return true;
}

async StoneMarket(e) {
  if (!verc({ e })) return false;
  const cf = config.getConfig('xiuxian', 'xiuxian');
  if (!cf.switch.StoneMarket) return false;
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  if (!await existplayer(usr_qq)) return false;
  if (!await Go(e)) return false;

  const gardenName = e.msg.match(/^#源石坊(外园|地字号|天字号)?$/)?.[1] || '外园';
  const garden = getStoneGarden(gardenName);
  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    state.activeGarden = garden.id;
    await saveStoneMarketState(usr_qq, state);

    const batch = state.gardens[garden.id];
    const remaining = garden.dailyLimit - batch.purchasedIds.length;
    const inspectRemaining = 2 - batch.inspectedIds.length;
    const skyCooldownUntil = Number(await redis.get(`xiuxian:player:${usr_qq}:stone_sky_cd`)) || 0;
    const cooldownText = garden.id === 'sky' && skyCooldownUntil > Date.now()
      ? `\n天字号调息：${formatRemainingTime(skyCooldownUntil - Date.now())}`
      : '';
    const stones = batch.stones.flatMap(stone => [
      `${stone.id}.【${stone.name}】${formatSourceAmount(stone.price)}${garden.currency}${stone.purchased ? '（已购）' : ''}`,
      `   表象：${stone.surfaces.map(item => item.text).join('；')}`,
      stone.inspection ? `   已勘：${stone.inspection.lines.join('；')}` : null,
    ].filter(Boolean));
    const pendingText = state.pending
      ? `\n你还有一块已购源石待切，请先选择 #一刀切、#层层剥石 或 #封源切法。`
      : '';

    e.reply([
      `【神城源石坊·${garden.name}】`,
      `今日可购：${remaining}/${garden.dailyLimit}块 | 可勘：${inspectRemaining}/2次`,
      `当前灵石：${formatSourceAmount(player.灵石)} | 源石：${formatSourceAmount(player.源石)}斤`,
      ...stones,
      ``,
      `发送 #勘石1 获取深层线索，发送 #购石1 买下源石。`,
      `切换石园：#源石坊外园 / #源石坊地字号 / #源石坊天字号${cooldownText}${pendingText}`,
    ].join('\n'));
    return true;
  });
}

async StoneInspect(e) {
  if (!verc({ e })) return false;
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;
  const stoneId = Number(e.msg.match(/^#勘石\s*([1-5])$/)?.[1]);

  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    try {
      const result = inspectStone(state, state.activeGarden, stoneId, player);
      await saveStoneMarketState(usr_qq, state);
      const batch = state.gardens[state.activeGarden];
      e.reply([
        `【勘石·${result.stone.name}】`,
        ...result.lines,
        `线索清晰度：${Math.round(result.accuracy * 100)}%`,
        `今日尚可勘石：${2 - batch.inspectedIds.length}次`,
      ].join('\n'));
      return true;
    } catch (error) {
      return e.reply(error.message);
    }
  });
}

async StoneHeavenlyCheck(e) {
  if (!verc({ e })) return false;
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;
  const stoneId = Number(e.msg.match(/^#天师辨石\s*([1-5])$/)?.[1]);

  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    try {
      const message = useHeavenlyCheck(state, state.activeGarden, stoneId, player);
      await saveStoneMarketState(usr_qq, state);
      return e.reply(`【源天师·辨伪】\n${message}`);
    } catch (error) {
      return e.reply(error.message);
    }
  });
}

async StoneBuy(e) {
  if (!verc({ e })) return false;
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;
  const stoneId = Number(e.msg.match(/^#购石\s*([1-5])$/)?.[1]);

  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    if (state.pending) return e.reply('请先切开已经买下的源石');
    const garden = getStoneGarden(state.activeGarden);
    const batch = state.gardens[garden.id];
    const stone = batch.stones.find(item => item.id === stoneId);
    if (!stone || stone.purchased || stone.cut) return e.reply('这块源石已经不在石架上');
    if (batch.purchasedIds.length >= garden.dailyLimit) {
      return e.reply(`${garden.name}今日只能购买${garden.dailyLimit}块源石`);
    }
    if (garden.id === 'sky') {
      const cooldownUntil = Number(await redis.get(`xiuxian:player:${usr_qq}:stone_sky_cd`)) || 0;
      if (cooldownUntil > Date.now()) {
        return e.reply(`天字号石园尚未开放，请${formatRemainingTime(cooldownUntil - Date.now())}后再来`);
      }
    }
    if ((Number(player[garden.currency]) || 0) < stone.price) {
      return e.reply(`购买${stone.name}需要${formatSourceAmount(stone.price)}${garden.currency}`);
    }

    player[garden.currency] -= stone.price;
    player.源石坊购石次数 = (player.源石坊购石次数 || 0) + 1;
    addStoneMarketSpend(player, garden.currency, stone.price);
    stone.purchased = true;
    batch.purchasedIds.push(stone.id);
    state.pending = { gardenId: garden.id, stoneId: stone.id, phase: 'choose' };
    await Write_player(usr_qq, player);
    await saveStoneMarketState(usr_qq, state);
    if (garden.id === 'sky') {
      await redis.set(
        `xiuxian:player:${usr_qq}:stone_sky_cd`,
        Date.now() + SKY_GARDEN_COOLDOWN_MS,
        { EX: Math.ceil(SKY_GARDEN_COOLDOWN_MS / 1000) }
      );
    }

    e.reply([
      `【购石·${stone.name}】`,
      `已支付${formatSourceAmount(stone.price)}${garden.currency}，今日购买次数已经计算。`,
      `#一刀切：免费立即开石，但可能损伤脆弱仙珍`,
      `#层层剥石：加收石价10%，出现异象时可继续或回购`,
      `#封源切法：源天师专属，消耗${formatSourceAmount(garden.sealCost)}斤源石压制凶物`,
    ].join('\n'));
    return true;
  });
}

async StoneCutMethod(e) {
  if (!verc({ e })) return false;
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;
  const method = { '#一刀切': 'one', '#层层剥石': 'layered', '#封源切法': 'sealed' }[e.msg];

  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    const pending = getPendingMarketStone(state);
    if (!pending || state.pending.phase !== 'choose') return e.reply('你当前没有等待开切的源石');
    if (method === 'sealed' && player.occupation !== '源天师') {
      return e.reply('封源切法只有源天师能够施展');
    }

    const extra = getCutExtraCost(pending.stone, pending.garden.id, method);
    if ((Number(player[extra.currency]) || 0) < extra.amount) {
      return e.reply(`此切法还需${formatSourceAmount(extra.amount)}${extra.currency}`);
    }
    player[extra.currency] -= extra.amount;
    addStoneMarketSpend(player, extra.currency, extra.amount);

    if (method === 'layered') {
      const preview = getLayeredPreview(pending.stone, pending.garden.id);
      if (preview.needsDecision) {
        state.pending = {
          ...state.pending,
          phase: 'peeling',
          offer: preview.offer,
          offerCurrency: preview.currency,
        };
        await Write_player(usr_qq, player);
        await saveStoneMarketState(usr_qq, state);
        return e.reply([
          `【层层剥石·异象初现】`,
          preview.anomaly,
          `石坊愿以${formatSourceAmount(preview.offer)}${preview.currency}回购。`,
          `发送 #继续切 或 #石坊回购`,
        ].join('\n'));
      }
    }

    const result = resolveStoneCut(pending.stone, pending.garden.id, method);
    return finishStoneMarketCut(e, usr_qq, player, state, pending, result);
  });
}

async StonePeelDecision(e) {
  if (!verc({ e })) return false;
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;

  return withStoneMarketLock(usr_qq, e, async () => {
    const player = await Read_player(usr_qq);
    const state = await loadStoneMarketState(usr_qq, player);
    const pending = getPendingMarketStone(state);
    if (!pending || state.pending.phase !== 'peeling') return e.reply('当前没有等待决断的切石异象');

    if (e.msg === '#石坊回购') {
      const { offer, offerCurrency } = state.pending;
      player[offerCurrency] = (Number(player[offerCurrency]) || 0) + offer;
      addStoneMarketIncome(player, offerCurrency, offer);
      pending.stone.cut = true;
      state.pending = null;
      await Write_player(usr_qq, player);
      await saveStoneMarketState(usr_qq, state);
      return e.reply(`【石坊回购】管事支付${formatSourceAmount(offer)}${offerCurrency}，收走了这块异石。`);
    }

    const result = resolveStoneCut(pending.stone, pending.garden.id, 'layered');
    return finishStoneMarketCut(e, usr_qq, player, state, pending, result);
  });
}

async StoneKingView(e) {
  if (!verc({ e })) return false;
  if (!e.isGroup) return e.reply('镇园石王只在群内开放');
  const { weekKey, king } = getWeeklyStoneKing();
  const stateKey = stoneKingStateKey(e.group_id, weekKey);
  let state = parseJsonOrNull(await redis.get(stateKey));
  if (!state || state.weekKey !== weekKey) {
    state = createStoneKingState();
    await redis.set(stateKey, JSON.stringify(state), { EX: 8 * 24 * 60 * 60 });
  }
  const names = state.participants.map(item => item.name).join('、') || '暂无';
  e.reply([
    `【本周镇园石王·${king.name}】`,
    king.omen,
    `助切代价：每人${formatSourceAmount(STONE_KING_CONFIG.contribution)}斤源石`,
    `开切人数：${state.participants.length}/${STONE_KING_CONFIG.target}`,
    `参与者：${names}`,
    state.opened ? `本周石王已经开切：${state.outcome.name}` : `发送 #石王助切 参与本周群事件`,
  ].join('\n'));
  return true;
}

async StoneKingJoin(e) {
  if (!verc({ e })) return false;
  if (!e.isGroup) return e.reply('镇园石王只在群内开放');
  let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
  if (!await existplayer(usr_qq) || !await Go(e)) return false;
  const weekKey = getStoneWeekKey();
  const stateKey = stoneKingStateKey(e.group_id, weekKey);

  return withRedisLock(`${stateKey}:lock`, e, async () => {
    let state = parseJsonOrNull(await redis.get(stateKey));
    if (!state || state.weekKey !== weekKey) state = createStoneKingState();
    if (state.opened) return e.reply('本群本周的镇园石王已经开切');
    if (state.participants.some(item => item.qq === usr_qq)) return e.reply('你已经参与本周助切');
    const joinedKey = `xiuxian:stone_king:${weekKey}:joined:${usr_qq}`;
    if (await redis.get(joinedKey)) return e.reply('你本周已经在其他石坊参与过镇园石王');

    const player = await Read_player(usr_qq);
    if ((Number(player.源石) || 0) < STONE_KING_CONFIG.contribution) {
      return e.reply(`参与助切需要${formatSourceAmount(STONE_KING_CONFIG.contribution)}斤源石`);
    }
    player.源石 -= STONE_KING_CONFIG.contribution;
    player.源石坊源石支出 = (player.源石坊源石支出 || 0) + STONE_KING_CONFIG.contribution;
    state.participants.push({ qq: usr_qq, name: player.名号 || String(usr_qq) });
    await Write_player(usr_qq, player);
    await redis.set(joinedKey, '1', { EX: 8 * 24 * 60 * 60 });

    if (state.participants.length < STONE_KING_CONFIG.target) {
      await redis.set(stateKey, JSON.stringify(state), { EX: 8 * 24 * 60 * 60 });
      return e.reply([
        `你投入${formatSourceAmount(STONE_KING_CONFIG.contribution)}斤源石参与助切。`,
        `当前人数：${state.participants.length}/${STONE_KING_CONFIG.target}`,
      ].join('\n'));
    }

    const result = resolveStoneKing(state);
    await redis.set(stateKey, JSON.stringify(state), { EX: 8 * 24 * 60 * 60 });
    const rewardLines = [];
    for (const participant of state.participants) {
      const member = await Read_player(participant.qq);
      if (result.outcome.source > 0) {
        member.源石 = (Number(member.源石) || 0) + result.outcome.source;
        member.源石坊源石收入 = (member.源石坊源石收入 || 0) + result.outcome.source;
      }
      if (result.outcome.damage) {
        const damage = Math.floor((Number(member.血量上限) || 0) * result.outcome.damage);
        member.当前血量 = Math.max(1, (Number(member.当前血量) || 1) - damage);
      }
      await Write_player(participant.qq, member);
      rewardLines.push(`${participant.name}：${formatSourceAmount(result.outcome.source)}斤源石`);
    }
    if (result.itemWinner && result.item) {
      await Add_najie_thing(
        result.itemWinner.qq,
        result.item.name,
        result.item.class,
        result.item.amount
      );
      rewardLines.push(`${result.itemWinner.name}额外获得【${result.item.name}】x${result.item.amount}`);
    }

    e.reply([
      `【镇园石王·${result.king.name}开切】`,
      `结果：${result.outcome.name}`,
      result.outcome.damage ? `凶机爆发，所有参与者损失20%血量。` : `石中神华照亮整座神城。`,
      ...rewardLines,
    ].join('\n'));
    return true;
  });
}



// 源石坊记录查询
async StoneRecord(e) {
  if (!verc({ e })) return false;
  let qq = e.user_id.toString().replace('qg_','');
  qq = await channel(qq);
  
  const player = await Read_player(qq);
  const purchases = player.源石坊购石次数 || 0;
  const empty = player.源石坊空石次数 || 0;
  const treasures = player.源石坊奇珍次数 || 0;
  const sourceIncome = player.源石坊源石收入 || 0;
  const sourceSpend = player.源石坊源石支出 || 0;
  const spiritIncome = player.源石坊灵石收入 || 0;
  const spiritSpend = player.源石坊灵石支出 || 0;
  const duelWins = player.源石坊对决胜场 || 0;
  const duelLosses = player.源石坊对决负场 || 0;
  const duelDraws = player.源石坊对决平局 || 0;
  const duelTotal = duelWins + duelLosses + duelDraws;
  const duelWinRate = duelTotal > 0 ? ((duelWins / duelTotal) * 100).toFixed(2) : 0;
  const duelNet = player.源石坊对决净收益 || 0;
  
  const recordMsg = [
    `【${player.名号}源石坊战绩】`,
    `职业：${player.occupation || "无"}`,
    `累计购石：${purchases}块`,
    `切出空石：${empty}块`,
    `切出奇珍：${treasures}件`,
    `连续空石：${player.源石坊连续空石 || 0}次`,
    `灵石收支：${formatSignedAmount(spiritIncome - spiritSpend)}`,
    `源石收支：${formatSignedAmount(sourceIncome - sourceSpend)}斤`,
    ``,
    `【NPC源术对决】`,
    `对决次数：${duelTotal}次`,
    `胜/负/平：${duelWins}/${duelLosses}/${duelDraws}`,
    `对决胜率：${duelWinRate}%`,
    `源石净收益：${formatSourceAmount(duelNet)}斤`
  ].join("\n");
  
  e.reply(recordMsg);
  return true;
}

async StoneDuelMenu(e) {
  if (!verc({ e })) return false;
  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);
  if (!await existplayer(usr_qq)) return false;
  if (!await Go(e)) return false;

  const player = await Read_player(usr_qq);
  const cooldownUntil = Number(await redis.get(`xiuxian:player:${usr_qq}:stone_duel_cd`)) || 0;
  const cooldownText = cooldownUntil > Date.now()
    ? `\n调息时间：${formatRemainingTime(cooldownUntil - Date.now())}`
    : '';
  const lines = SOURCE_DUEL_NPCS.map(npc => {
    const totalRisk = npc.wager * 3 + npc.stoneFee;
    return `${npc.id}. ${npc.name}·${npc.title}\n` +
      `   石料费${formatSourceAmount(npc.stoneFee)} | 平注${formatSourceAmount(npc.wager)} | 豪赌最大损失${formatSourceAmount(totalRisk)}源石`;
  });

  e.reply([
    `【神城源术对决】`,
    `当前源石：${formatSourceAmount(player.源石)}斤`,
    ...lines,
    ``,
    `发送 #源石坊对决1 挑战对应人物`,
    `石料费开局即扣且超时不退；胜者获得双方押注和双方切出的全部源。${cooldownText}`,
  ].join('\n'));
  return true;
}

async StoneDuelStart(e) {
  if (!verc({ e })) return false;
  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);
  if (!await existplayer(usr_qq)) return false;
  if (!await Go(e)) return false;

  const npcId = Number(e.msg.match(/^#源石坊对决\s*([1-3])$/)?.[1]);
  const npc = getSourceDuelNpc(npcId);
  if (!npc) return false;
  const stateKey = `xiuxian:player:${usr_qq}:stone_duel`;
  const lockKey = `${stateKey}:lock`;
  const lockToken = `${Date.now()}:${Math.random()}`;
  const lockAcquired = Boolean(await redis.set(lockKey, lockToken, { EX: 10, NX: true }));
  if (!lockAcquired) return e.reply('源石坊正在登记你的对决，请稍候再试');

  try {
    if (await redis.get(stateKey)) {
      return e.reply('你已有一场未完成的源术对决，请先发送#对决选石1 3 5');
    }

    const cooldownUntil = Number(await redis.get(`xiuxian:player:${usr_qq}:stone_duel_cd`)) || 0;
    if (cooldownUntil > Date.now()) {
      return e.reply(`源术对决耗费心神，请${formatRemainingTime(cooldownUntil - Date.now())}后再来`);
    }

    const player = await Read_player(usr_qq);
    const totalCost = npc.wager + npc.stoneFee;
    if ((Number(player.源石) || 0) < totalCost) {
      return e.reply([
        `【源术对决·验资失败】`,
        `挑战${npc.name}需要${formatSourceAmount(totalCost)}斤源石`,
        `其中石料费${formatSourceAmount(npc.stoneFee)}，押注${formatSourceAmount(npc.wager)}`,
        `你当前只有${formatSourceAmount(player.源石)}斤源石`,
      ].join('\n'));
    }

    const session = createSourceDuelSession(npc.id, player);
    player.源石 -= npc.stoneFee;
    player.源石坊对决净收益 = (player.源石坊对决净收益 || 0) - npc.stoneFee;
    await Write_player(usr_qq, player);
    try {
      await redis.set(stateKey, JSON.stringify(session), { EX: SOURCE_DUEL_STATE_TTL_SECONDS });
    } catch (error) {
      player.源石 += npc.stoneFee;
      player.源石坊对决净收益 += npc.stoneFee;
      await Write_player(usr_qq, player);
      return e.reply('源石坊登记失败，石料费已退还，请稍后重试');
    }

    const stones = session.playerStones.flatMap(stone => {
      const lines = [`${stone.id}.【${stone.name}】${stone.appearance}`, `   表象：${stone.clue}`];
      if (stone.insight) lines.push(`   ${stone.insight}`);
      return lines;
    });
    const availableResonances = SOURCE_DUEL_RESONANCES.filter(resonance =>
      resonance.stones.every(name => session.playerStones.some(stone => stone.name === name))
    );
    const resonanceLines = availableResonances.length
      ? [`本局可成石相：${availableResonances.map(item =>
        `【${item.name}】${item.stones.join('+')}（+${Math.round((item.multiplier - 1) * 100)}%）`
      ).join('；')}`]
      : [];
    e.reply([
      `【神城源术对决·${npc.name}】`,
      `${npc.name}：“${npc.opening}”`,
      `双方各选三石，败者押注与本方切源尽归胜者。`,
      `已付石料费：${formatSourceAmount(npc.stoneFee)}源石（超时不退）`,
      `本局押注：${formatSourceAmount(npc.wager)}源石`,
      ``,
      ...stones,
      ``,
      ...resonanceLines,
      `押注方式：平注×1、加注×2、豪赌×3，双方同步加码。`,
      `五分钟内发送 #对决选石1 3 5 豪赌`,
    ].join('\n'));
    return true;
  } finally {
    if (await redis.get(lockKey) === lockToken) await redis.del(lockKey);
  }
}

async StoneDuelChoice(e) {
  if (!verc({ e })) return false;
  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);
  const stateKey = `xiuxian:player:${usr_qq}:stone_duel`;
  const lockKey = `${stateKey}:lock`;
  const lockToken = `${Date.now()}:${Math.random()}`;
  const lockAcquired = Boolean(await redis.set(lockKey, lockToken, { EX: 10, NX: true }));
  if (!lockAcquired) return e.reply('这场源术对决正在结算，请勿重复选石');

  try {
    const rawSession = await redis.get(stateKey);
    if (!rawSession) return e.reply('选石时间已过，石料费不退，请重新发送#源石坊对决');

    let session;
    try {
      session = JSON.parse(rawSession);
    } catch {
      await redis.del(stateKey);
      return e.reply('源术对决状态异常，请重新发起挑战');
    }

    const choiceMatch = e.msg.match(/^#对决选石\s*([1-5])\s+([1-5])\s+([1-5])(?:\s+(平注|加注|豪赌))?$/);
    const choices = choiceMatch?.slice(1, 4).map(Number) || [];
    const stakeMode = choiceMatch?.[4] || '平注';
    let duel;
    try {
      duel = resolveSourceDuel(session, choices, { stakeMode });
    } catch (error) {
      return e.reply(error.message);
    }

    const player = await Read_player(usr_qq);
    if ((Number(player.源石) || 0) < duel.settlement.amountDue) {
      return e.reply(`还需押注${formatSourceAmount(duel.settlement.amountDue)}斤源石，你的源石已经不足`);
    }

    player.源石 -= duel.settlement.amountDue;
    player.源石 += duel.settlement.credit;
    player.源石坊对决胜场 = (player.源石坊对决胜场 || 0) + (duel.result === 'win' ? 1 : 0);
    player.源石坊对决负场 = (player.源石坊对决负场 || 0) + (duel.result === 'lose' ? 1 : 0);
    player.源石坊对决平局 = (player.源石坊对决平局 || 0) + (duel.result === 'draw' ? 1 : 0);
    player.源石坊对决净收益 = (player.源石坊对决净收益 || 0) +
      duel.settlement.credit - duel.settlement.amountDue;
    player.源石坊对决累计切源 = (player.源石坊对决累计切源 || 0) + duel.playerSource;
    player.源石坊对决最高切源 = Math.max(player.源石坊对决最高切源 || 0, duel.playerSource);

    await Write_player(usr_qq, player);
    const cooldownUntil = Date.now() + SOURCE_DUEL_COOLDOWN_MS;
    await redis.set(
      `xiuxian:player:${usr_qq}:stone_duel_cd`,
      cooldownUntil,
      { EX: Math.ceil(SOURCE_DUEL_COOLDOWN_MS / 1000) }
    );
    await redis.del(stateKey);

    const resultText = {
      win: `你赢下对决，收回本方押注并夺得${duel.npc.name}的押注与双方切源！`,
      lose: `你输掉对决，本方押注和切出的${formatSourceAmount(duel.playerSource)}斤源尽归${duel.npc.name}！`,
      draw: `双方切源价值相同，各自收回押注并保留本方切源。`,
    }[duel.result];
    const netLabel = duel.settlement.net >= 0 ? '本局净收益' : '本局净损失';

    e.reply([
      `【源术对决·三石尽开】`,
      `你的三块源石：`,
      ...formatDuelCuts(duel.playerCuts),
      ...formatDuelResonance(duel.playerResonance, duel.playerBaseSource, duel.playerSource),
      `切源总值：${formatSourceAmount(duel.playerSource)}斤`,
      ``,
      `${duel.npc.name}的三块源石：`,
      ...formatDuelCuts(duel.npcCuts),
      ...formatDuelResonance(duel.npcResonance, duel.npcBaseSource, duel.npcSource),
      `切源总值：${formatSourceAmount(duel.npcSource)}斤`,
      ``,
      resultText,
      `石料费：${formatSourceAmount(duel.npc.stoneFee)}斤`,
      `押注：${formatSourceAmount(duel.settlement.amountDue)}斤（${duel.stakeMode}）`,
      `${netLabel}：${formatSourceAmount(Math.abs(duel.settlement.net))}斤源石`,
      `当前源石：${formatSourceAmount(player.源石)}斤`,
    ].join('\n'));
    return true;
  } finally {
    if (await redis.get(lockKey) === lockToken) await redis.del(lockKey);
  }
}

  async Refusecouple(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let player = await Read_player(usr_qq);
    await redis.set('xiuxian:player:' + usr_qq + ':couple', 1);
    e.reply(player.名号 + '开启了拒绝模式');
    return false;
  }

  async Allowcouple(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let player = await Read_player(usr_qq);
    await redis.set('xiuxian:player:' + usr_qq + ':couple', 0);
    e.reply(player.名号 + '开启了允许模式');
    return false;
  }

  //怡红院
  async Xiuianplay(e) {
    if (!verc({ e })) return false;
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let switchgame = cf.switch.play;
    if (switchgame != true) {
      return false;
    }
    //统一用户ID名
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //全局状态判断
    //得到用户信息
    let player = await Read_player(usr_qq);
    let now_level_id;
    if (!isNotNull(player.level_id)) {
      e.reply('请先#同步信息');
      return false;
    }
    let flag = await Go(e);
    if (!flag) {
      return false;
    }
    now_level_id = data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    //用id当作收益用
    //收益用
    var money = now_level_id * 1000;
    //如果是渡劫期。大概收益用为33*1000=3.3w
    //为防止丹药修为报废，这个收益要成曲线下降
    //得到的修为
    //先是1:1的收益
    var addlevel;
    //到了结丹中期收益变低
    //都不是凡人了，还天天祸害人间？
    if (now_level_id < 10) {
      addlevel = money;
    } else {
      addlevel = (9 / now_level_id) * money;
    }
    //随机数
    var rand = Math.random();
    var ql1 =
      "门口的大汉粗鲁的将你赶出来:'哪来的野小子,没钱还敢来学人家公子爷寻欢作乐?' 被人看出你囊中羞涩,攒到";
    var ql2 = '灵石再来吧！';
    if (player.灵石 < money) {
      e.reply(ql1 + money + ql2);
      return false;
    }
    //加修为
    if (rand < 0.5) {
      let randexp = 90 + parseInt(Math.random() * 20);
      e.reply(
        '花费了' +
          money +
          '灵石,你好好放肆了一番,奇怪的修为增加了' +
          randexp +
          '!在鱼水之欢中你顿悟了,修为增加了' +
          addlevel +
          '!'
      );
      await Add_修为(usr_qq, addlevel);
      await Add_灵石(usr_qq, -money);
      let gameswitch = cf.switch.Xiuianplay_key;
      if (gameswitch == true) {
        setu(e);
      }
      return false;
    }
    //被教训
    else if (rand > 0.7) {
      await Add_灵石(usr_qq, -money);
      ql1 = '花了';
      ql2 =
        '灵石,本想好好放肆一番,却赶上了扫黄,无奈在衙门被教育了一晚上,最终大彻大悟,下次还来！';
      e.reply([segment.at(usr_qq), ql1 + money + ql2]);
      return false;
    }
    //被坑了
    else {
      await Add_灵石(usr_qq, -money);
      ql1 =
        '这一次，你进了一个奇怪的小巷子，那里衣衫褴褛的漂亮姐姐说要找你玩点有刺激的，你想都没想就进屋了。\n';
      ql2 =
        '没想到进屋后不多时遍昏睡过去。醒来发现自己被脱光扔在郊外,浑身上下只剩一条裤衩子了。仰天长啸：也不过是从头再来！';
      e.reply([segment.at(usr_qq), ql1 + ql2]);
      return false;
    }
  }

  //金银坊
  async Moneynumber(e) {
    if (!verc({ e })) return false;
    const cf = config.getConfig('xiuxian', 'xiuxian');
    //金银坊开关
    let gameswitch = cf.switch.Moneynumber;
    if (gameswitch != true) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let flag = await Go(e);
    if (!flag) return false;
    //用户信息查询
    let player = data.getData('player', usr_qq);
    let now_time = new Date().getTime();
    var money = 10000;
    //判断灵石
    if (player.灵石 < money) {
      //直接清除，并记录
      //重新记录本次时间
      await redis.set('xiuxian:player:' + usr_qq + ':last_game_time', now_time); //存入缓存
      //清除游戏状态
      await redis.set('xiuxian:player:' + usr_qq + ':game_action', 1);
      //清除未投入判断
      //清除金额
      yazhu[usr_qq] = 0;
      //清除游戏定时检测CD
      clearTimeout(gametime[usr_qq]);
      e.reply('媚娘：钱不够也想玩？');
      return false;
    }
    //设置
    var time = cf.CD.gambling; //
    //获取当前时间
    //最后的游戏时间
    //last_game_time
    //获得时间戳
    let last_game_time = await redis.get(
      'xiuxian:player:' + usr_qq + ':last_game_time'
    );
    last_game_time = parseInt(last_game_time);
    let transferTimeout = parseInt(60000 * time);
    if (now_time < last_game_time + transferTimeout) {
      let game_m = Math.trunc(
        (last_game_time + transferTimeout - now_time) / 60 / 1000
      );
      let game_s = Math.trunc(
        ((last_game_time + transferTimeout - now_time) % 60000) / 1000
      );
      e.reply(
        `每${transferTimeout / 1000 / 60}分钟游玩一次。` +
          `cd: ${game_m}分${game_s}秒`
      );
      //存在CD。直接返回
      return false;
    }
    //记录本次执行时间
    await redis.set('xiuxian:player:' + usr_qq + ':last_game_time', now_time);
    //判断是否已经在进行
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    //为0，就是在进行了
    if (game_action == 0) {
      //在进行
      e.reply(`媚娘：猜大小正在进行哦!`);
      return false;
    }
    //不为0   没有参与投入和梭哈
    e.reply(`媚娘：发送[#投入+数字]或[#梭哈]`, true);
    //写入游戏状态为真-在进行了
    await redis.set('xiuxian:player:' + usr_qq + ':game_action', 0);
    return false;
  }

  //这里冲突了，拆函数！
  //梭哈|投入999
  async Moneycheck(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //获取当前时间戳
    let now_time = new Date().getTime();
    //文档
    let ifexistplay = await existplayer(usr_qq);
    //得到此人的状态
    //判断是否是投入用户
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    if (!ifexistplay || game_action == 1) {
      //不是就返回
      return false;
    }
    //梭哈|投入999。如果是投入。就留下999
    let es = e.msg.replace('#投入', '').trim();
    //去掉投入，发现得到的是梭哈
    //梭哈，全部灵石
    if (es == '#梭哈') {
      let player = await Read_player(usr_qq);
      //得到投入金额
      yazhu[usr_qq] = player.灵石 - 1;
      e.reply('媚娘：梭哈完成,发送[大]或[小]');
      return false;
    }
    //不是梭哈，看看是不是数字
    //判断是不是输了个数字，看看投入多少
    if (parseInt(es) == parseInt(es)) {
      let player = await Read_player(usr_qq);
      //判断灵石
      if (player.灵石 >= parseInt(es)) {
        //得到投入数
        yazhu[usr_qq] = parseInt(es);
        //这里限制一下，至少押1w
        var money = 10000;
        //如果投入的数大于0
        if (yazhu[usr_qq] >= money) {
          //如果押的钱不够
          //值未真。并记录此人信息
          gane_key_user[usr_qq];
          e.reply('媚娘：投入完成,发送[大]或[小]');
          return false;
        } else {
          //直接清除，并记录
          //重新记录本次时间
          await redis.set(
            'xiuxian:player:' + usr_qq + ':last_game_time',
            now_time
          ); //存入缓存
          //清除游戏状态
          await redis.set('xiuxian:player:' + usr_qq + ':game_action', 1);
          //清除未投入判断
          //清除金额
          yazhu[usr_qq] = 0;
          //清除游戏定时检测CD
          clearTimeout(gametime[usr_qq]);
          e.reply('媚娘：钱不够也想玩？');
          return false;
        }
      }
    }
    return false;
  }

  //大|小
  async Moneycheckguess(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //获取当前时间戳
    let now_time = new Date().getTime();
    //文档
    let ifexistplay = await existplayer(usr_qq);
    //得到此人的状态
    //判断是否是投入用户
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    if (!ifexistplay || game_action == 1) {
      //不是就返回
      return false;
    }
    if (isNaN(yazhu[usr_qq])) {
      return false;
    }
    //判断是否投入金额
    //是对应的投入用户。
    //检查此人是否已经投入
    if (!gane_key_user) {
      e.reply('媚娘：公子，你还没投入呢');
      return false;
    }
    let player = await Read_player(usr_qq);
    let es = e.msg;
    //随机数并取整【1，7）
    let randtime = Math.trunc(Math.random() * 6) + 1;
    //点子
    let touzi;
    var n;
    //防止娶不到整，我们自己取
    for (n = 1; n <= randtime; n++) {
      //是1.111就取1 --是2.0就取到2。没有7.0是不可能取到7的。也就是得到6
      //随机并取整
      touzi = n;
    }
    //发送固定点数的touzi
    e.reply(segment.dice(touzi));
    const cf = config.getConfig('xiuxian', 'xiuxian');
    //你说大，touzi是大。赢了
    if ((es == '大' && touzi > 3) || (es == '小' && touzi < 4)) {
      //赢了
      //获奖倍率
      var x = cf.percentage.Moneynumber;
      var y = 1;
      var z = cf.size.Money * 10000;
      //增加金银坊投资记录
      //投入大于一百万
      if (yazhu[usr_qq] >= z) {
        //扣一半的投入
        x = cf.percentage.punishment;
        //并提示这是被扣了一半
        y = 0;
      }
      yazhu[usr_qq] = Math.trunc(yazhu[usr_qq] * x);
      //金库
      //获得灵石超过100w
      //积累
      if (isNotNull(player.金银坊胜场)) {
        player.金银坊胜场 = parseInt(player.金银坊胜场) + 1;
        player.金银坊收入 =
          parseInt(player.金银坊收入) + parseInt(yazhu[usr_qq]);
      } else {
        player.金银坊胜场 = 1;
        player.金银坊收入 = parseInt(yazhu[usr_qq]);
      }
      //把记录写入
      data.setData('player', usr_qq, player);
      //得到的
      Add_灵石(usr_qq, yazhu[usr_qq]);
      if (y == 1) {
        e.reply([
          segment.at(usr_qq),
          `骰子最终为 ${touzi} 你猜对了！`,
          '\n',
          `现在拥有灵石:${player.灵石 + yazhu[usr_qq]}`,
        ]);
      } else {
        e.reply([
          segment.at(usr_qq),
          `骰子最终为 ${touzi} 你虽然猜对了，但是金银坊怀疑你出老千，准备打断你的腿的时候，你选择破财消灾。`,
          '\n',
          `现在拥有灵石:${player.灵石 + yazhu[usr_qq]}`,
        ]);
      }
      //重新记录本次时间
      await redis.set('xiuxian:player:' + usr_qq + ':last_game_time', now_time); //存入缓存
      //清除游戏状态
      await redis.set('xiuxian:player:' + usr_qq + ':game_action', 1);
      //清除未投入判断
      //清除金额
      yazhu[usr_qq] = 0;
      //清除游戏CD
      clearTimeout(gametime[usr_qq]);
      return false;
    }
    //你说大，但是touzi<4,是输了
    else if ((es == '大' && touzi < 4) || (es == '小' && touzi > 3)) {
      //输了
      //增加金银坊投资记录
      if (isNotNull(player.金银坊败场)) {
        player.金银坊败场 = parseInt(player.金银坊败场) + 1;
        player.金银坊支出 =
          parseInt(player.金银坊支出) + parseInt(yazhu[usr_qq]);
      } else {
        player.金银坊败场 = 1;
        player.金银坊支出 = parseInt(yazhu[usr_qq]);
      }
      //把记录写入
      data.setData('player', usr_qq, player);
      //只要花灵石的地方就要查看是否存在游戏状态
      Add_灵石(usr_qq, -yazhu[usr_qq]);
      let msg = [
        segment.at(usr_qq),
        `骰子最终为 ${touzi} 你猜错了！`,
        '\n',
        `现在拥有灵石:${player.灵石 - yazhu[usr_qq]}`,
      ];
      let now_money = player.灵石 - yazhu[usr_qq];
      //重新记录本次时间
      await redis.set('xiuxian:player:' + usr_qq + ':last_game_time', now_time); //存入缓存
      //清除游戏状态
      await redis.set('xiuxian:player:' + usr_qq + ':game_action', 1);
      //清除未投入判断
      //清除金额
      yazhu[usr_qq] = 0;
      //清除游戏CD
      clearTimeout(gametime[usr_qq]);
      //如果扣了之后，钱被扣光了，就提示
      if (now_money <= 0) {
        msg.push(
          '\n媚娘：没钱了也想跟老娘耍？\n你已经裤衩都输光了...快去降妖赚钱吧！'
        );
      }
      e.reply(msg);
      return false;
    }
  }

  async Moneyrecord(e) {
    if (!verc({ e })) return false;
    let qq = e.user_id.toString().replace('qg_','');
    qq=await channel(qq)
    let shenglv;
    //获取人物信息
    let player_data = data.getData('player', qq);
    let victory = isNotNull(player_data.金银坊胜场)
      ? player_data.金银坊胜场
      : 0;
    let victory_num = isNotNull(player_data.金银坊收入)
      ? player_data.金银坊收入
      : 0;
    let defeated = isNotNull(player_data.金银坊败场)
      ? player_data.金银坊败场
      : 0;
    let defeated_num = isNotNull(player_data.金银坊支出)
      ? player_data.金银坊支出
      : 0;
    if (parseInt(victory) + parseInt(defeated) == 0) {
      shenglv = 0;
    } else {
      shenglv = ((victory / (victory + defeated)) * 100).toFixed(2);
    }
    const data1 = await new Show(e).get_jinyin({
      user_qq: qq,
      victory,
      victory_num,
      defeated,
      defeated_num,
    });
    let img = await puppeteer.screenshot('moneyCheck', {
      ...data1,
    });
    e.reply(img);
  }

// ==========  双修  ==========
async Couple(e) {
    if (!verc({ e })) return false;
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let gameswitch = cf.switch.couple;
    if (gameswitch != true) return false;

    let A = e.user_id.toString().replace('qg_', '');
    A = await channel(A);

    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    let atItem = e.message.filter(item => item.type === 'at');
    let B = atItem[0].qq.toString().replace('qg_', '');
    B = await channel(B);
    if (A == B) {
        e.reply('你咋这么爱撸自己呢?');
        return false;
    }

    const FUSION_GUARANTEE = 20;               // ★保底次数
    async function getFailCnt(qq) {            // 工具：读失败次数
        return parseInt(await redis.get(`xiuxian:player:${qq}:fusion_fail`) || 0);
    }
    async function setFailCnt(qq, val) {       // 工具：写失败次数
        await redis.set(`xiuxian:player:${qq}:fusion_fail`, val);
    }

    var Time = cf.CD.couple;
    let shuangxiuTimeout = parseInt(60000 * Time);
    let now_Time = new Date().getTime();

    let last_timeA = parseInt(await redis.get('xiuxian:player:' + A + ':last_shuangxiu_time') || 0);
    if (now_Time < last_timeA + shuangxiuTimeout) {
        let Couple_m = Math.trunc((last_timeA + shuangxiuTimeout - now_Time) / 60 / 1000);
        let Couple_s = Math.trunc(((last_timeA + shuangxiuTimeout - now_Time) % 60000) / 1000);
        e.reply(`双修冷却: ${Couple_m}分 ${Couple_s}秒`);
        return false;
    }
    let last_timeB = parseInt(await redis.get('xiuxian:player:' + B + ':last_shuangxiu_time') || 0);
    if (now_Time < last_timeB + shuangxiuTimeout) {
        let Couple_m = Math.trunc((last_timeB + shuangxiuTimeout - now_Time) / 60 / 1000);
        let Couple_s = Math.trunc(((last_timeB + shuangxiuTimeout - now_Time) % 60000) / 1000);
        e.reply(`对方双修冷却: ${Couple_m}分 ${Couple_s}秒`);
        return false;
    }

    let ifexistplay_B = await existplayer(B);
    if (!ifexistplay_B) {
        e.reply('修仙者不可对凡人出手!');
        return false;
    }
    let couple = await redis.get('xiuxian:player:' + B + ':couple');
    if (couple != 0) {
        e.reply('哎哟，你干嘛...');
        return false;
    }

    let pd = await find_qinmidu(A, B);
    let marryA = await exist_hunyin(A), marryB = await exist_hunyin(B);
    if ((marryA && marryA !== B) || (marryB && marryB !== A)) {
        e.reply(`力争纯爱！禁止贴贴！！`);
        return false;
    }
    if (pd == false) await fstadd_qinmidu(A, B);

    let playerA = await Read_player(A);
    let playerB = await Read_player(B);

    // ========  融合检测变量  ========
    let isShenDao = playerA.灵根.name === "命运神道体";
    let isJiDao = playerB.灵根.name === "极道天魔";
    let isShenDaoB = playerB.灵根.name === "命运神道体";
    let isJiDaoA = playerA.灵根.name === "极道天魔";
    let istaiyang = playerA.灵根.name === "太阳之体";
    let istaiyin = playerB.灵根.name === "太阴之体";
    let istaiyangB = playerB.灵根.name === "太阳之体";
    let istaiyinA = playerA.灵根.name === "太阴之体";
    let isShengti = playerA.灵根.name === "大成·荒古圣体";
    let isDaotai = playerB.灵根.name === "先天道胎";
    let isShengtiB = playerB.灵根.name === "大成·荒古圣体";
    let isDaotaiA = playerA.灵根.name === "先天道胎";
    let isHundunA = playerA.灵根.name === "混沌体";
    let isxiantianShengtiB = playerB.灵根.name === "先天圣体道胎";
    let isHundunB = playerB.灵根.name === "混沌体";
    let isxiantianShengtiA = playerA.灵根.name === "先天圣体道胎";

    let fusionHit = false;   // 是否已触发融合

    // ==========  随机融合  ==========
    if ((isShengti && isDaotai) || (isShengtiB && isDaotaiA)) {
        if (Math.random() < 0.05) {                       // 5%
            const lg = {"id": 7010014, "name": "先天圣体道胎", "type": "圣体道胎", "归类": "遮天位面", "eff": 300, "法球倍率": 2.1, "攻击": 10, "防御": 10, "生命": 10, "生命本源": 500};
            playerA.灵根 = playerB.灵根 = lg; fusionHit = true;
            await Write_linggen(A, playerA); await Write_linggen(B, playerB);
            await Write_player(A, playerA); await Write_player(B, playerB);
            e.reply([`【圣体道胎交融】`, `荒古圣体与先天道胎相遇，引动万古异象！`, `「先天圣体道胎」诞生！`, `圣体不灭，道胎永恒，万古无双！`].join("\n"));
        }
    } else if ((isShenDao && isJiDao) || (isShenDaoB && isJiDaoA)) {
        if (Math.random() < 0.01) {                       // 1%
            const lg = {"id": 7010015, "name": "终焉神魔体", "type": "神魔体", "归类": "神魔", "eff": 300, "法球倍率": 3, "攻击": 7, "防御": 6, "生命": 5, "生命本源": 100};
            playerA.灵根 = playerB.灵根 = lg; fusionHit = true;
            await Write_linggen(A, playerA); await Write_linggen(B, playerB);
            await Write_player(A, playerA); await Write_player(B, playerB);
            e.reply([`【命运与天魔交融】`, `时空长河倒卷，混沌重开！`, `「终焉神魔体」诞生！`, `神魔同体，再造混沌！`].join("\n"));
        }
    } else if ((istaiyang && istaiyin) || (istaiyinA && istaiyangB)) {
        if (Math.random() < 0.01) {
            const lg = {"id": 70051, "name": "混沌体", "type": "混沌体", "归类": "遮天位面", "eff": 72, "法球倍率": 1.45, "攻击": 5, "防御": 5, "生命": 5, "生命本源": 200};
            playerA.灵根 = playerB.灵根 = lg; fusionHit = true;
            await Write_linggen(A, playerA); await Write_linggen(B, playerB);
            await Write_player(A, playerA); await Write_player(B, playerB);
            e.reply([`【太阴太阳交融】`, `阴阳二气交织，混沌初开！`, `「混沌体」诞生！`, `阴阳合一，混沌初成！`].join("\n"));
        }
    } else if ((isHundunA && isxiantianShengtiB) || (isHundunB && isxiantianShengtiA)) {
        if (Math.random() < 0.01) {
            const lg = {"id": 70051, "name": "先天混沌圣体道胎", "type": "混沌圣体道胎", "归类": "遮天位面", "eff": 572, "法球倍率": 4, "攻击": 15, "防御": 15, "生命": 15, "生命本源": 800};
            playerA.灵根 = playerB.灵根 = lg; fusionHit = true;
            await Write_linggen(A, playerA); await Write_linggen(B, playerB);
            await Write_player(A, playerA); await Write_player(B, playerB);
            e.reply([`【混沌与圣体道胎交融】`, `天地初开，混沌重演！`, `「先天混沌圣体道胎」诞生！`, `混沌圣体，道胎天成！`].join("\n"));
        }
    }

    let failA = await getFailCnt(A), failB = await getFailCnt(B);
    let maxFail = Math.max(failA, failB);

    // ==========  保底融合  ==========
    if (!fusionHit && maxFail >= FUSION_GUARANTEE) {
        let guaLg = null, guaMsg = null;
        if ((isShengti && isDaotai) || (isShengtiB && isDaotaiA)) {
            guaLg = {"id": 7010014, "name": "先天圣体道胎", "type": "圣体道胎", "归类": "遮天位面", "eff": 300, "法球倍率": 2.1, "攻击": 10, "防御": 10, "生命": 10, "生命本源": 500};
            guaMsg = [`【圣体道胎·保底融合】`, `荒古圣体与先天道胎历经千锤百炼，终得天地认可！`, `「先天圣体道胎」保底诞生！`, `圣体不灭，道胎永恒，万古无双！`];
        } else if ((isShenDao && isJiDao) || (isShenDaoB && isJiDaoA)) {
            guaLg = {"id": 7010015, "name": "终焉神魔体", "type": "神魔体", "归类": "神魔", "eff": 300, "法球倍率": 3, "攻击": 7, "防御": 6, "生命": 5, "生命本源": 100};
            guaMsg = [`【终焉神魔体·保底融合】`, `命运与天魔在无数次擦肩后终将交汇！`, `「终焉神魔体」保底诞生！`, `神魔同体，再造混沌！`];
        } else if ((istaiyang && istaiyin) || (istaiyinA && istaiyangB)) {
            guaLg = {"id": 70051, "name": "混沌体", "type": "混沌体", "归类": "遮天位面", "eff": 72, "法球倍率": 1.45, "攻击": 5, "防御": 5, "生命": 5, "生命本源": 200};
            guaMsg = [`【混沌体·保底融合】`, `太阴太阳在二十次轮回后终得阴阳合一！`, `「混沌体」保底诞生！`, `阴阳合一，混沌初成！`];
        } else if ((isHundunA && isxiantianShengtiB) || (isHundunB && isxiantianShengtiA)) {
            guaLg = {"id": 70051, "name": "先天混沌圣体道胎", "type": "混沌圣体道胎", "归类": "遮天位面", "eff": 572, "法球倍率": 4, "攻击": 15, "防御": 15, "生命": 15, "生命本源": 800};
            guaMsg = [`【先天混沌圣体道胎·保底融合】`, `混沌与圣体道胎历经二十次磨合，终得宇宙认可！`, `「先天混沌圣体道胎」保底诞生！`, `混沌圣体，道胎天成！`];
        }
        if (guaLg) {
            playerA.灵根 = playerB.灵根 = guaLg; fusionHit = true;
            await Write_linggen(A, playerA); await Write_linggen(B, playerB);
            await Write_player(A, playerA); await Write_player(B, playerB);
            e.reply(guaMsg.join("\n"));
            await setFailCnt(A, 0); await setFailCnt(B, 0);
        }else {e.reply(`两种凡体历经二十次磨合，仍无缘蜕变，大道难成……\n【${'▱'.repeat(width)}】20/20（无契合路线）`);
  }
    }

// ==========  融合失败则累加计数 + 专属文案 ==========
if (!fusionHit) {
    await setFailCnt(A, failA + 1);
    await setFailCnt(B, failB + 1);

    const next = Math.min(failA + 1, FUSION_GUARANTEE);   //  当前失败次数
    const width = 10;                      // 进度条总长
    const filled = Math.min(Math.floor((next / FUSION_GUARANTEE) * width), width);
    const empty  = width - filled;
    const bar    = '▰'.repeat(filled) + '▱'.repeat(empty);

    /* ——————  各组合专属失败文案 —————— */
    let failText = '';

    // ① 先天道胎 ⇄ 荒古圣体
    if ((isShengti && isDaotai) || (isShengtiB && isDaotaiA)) {
        failText = `圣体与道胎擦肩而过，未能共鸣……\n` +
                   `荒古血气与先天道光微微触碰，便又归于寂静。\n` +
                   `进度 [${bar}] ${next}/20（圣体·道胎交融）`;
    }
    // ② 命运神道体 ⇄ 极道天魔
    else if ((isShenDao && isJiDao) || (isShenDaoB && isJiDaoA)) {
        failText = `神性与魔息彼此吞噬，却终究泾渭分明……\n` +
                   `命运长河与万魔渊壑短暂重叠，随后各自退去。\n` +
                   `进度 [${bar}] ${next}/20（神魔同体）`;
    }
    // ③ 太阳 ⇄ 太阴
    else if ((istaiyang && istaiyin) || (istaiyinA && istaiyangB)) {
        failText = `太阴与太阳交汇一线，却未能真正合一……\n` +
                   `日辉月华交错即逝，混沌未开。\n` +
                   `进度 [${bar}] ${next}/20（阴阳合一）`;
    }
    // ④ 混沌体 ⇄ 先天圣体道胎
    else if ((isHundunA && isxiantianShengtiB) || (isHundunB && isxiantianShengtiA)) {
        failText = `混沌雾霭与圣体道光微微交融，又被天道法则强行抚平……\n` +
                   `进度 [${bar}] ${next}/20（混沌·圣体道胎）`;
    }
    // ⑤ 其余未列出的稀有组合（预留）
    else {
        failText = `两种无上体质互相吸引，却终究欠缺一丝契机……\n` +
                   `进度 [${bar}] ${next}/20（未知交融）`;
    }

    e.reply(failText);
}



    if (fusionHit) return false;                // 已融合直接结束
    // ==========  双修时间 & 普通修为增长  ==========
    await redis.set('xiuxian:player:' + A + ':last_shuangxiu_time', now_Time);
    await redis.set('xiuxian:player:' + B + ':last_shuangxiu_time', now_Time);
    // ----------  以下为原普通双修  ----------
    let option = Math.random(), xiuwei = Math.random(), x = 0, y = 0;
    if (option > 0 && option <= 0.5) {
        x = 28000; y = Math.trunc(xiuwei * x);
        await Add_修为(A, y); await Add_修为(B, y); await add_qinmidu(A, B, 30);
        e.reply(`你们双方情意相通，缠绵一晚，都增加了${y}修为，亲密度+30`);
    } else if (option > 0.5 && option <= 0.6) {
        x = 21000; y = Math.trunc(xiuwei * x);
        await Add_修为(A, y); await Add_修为(B, y); await add_qinmidu(A, B, 20);
        e.reply(`你们双方交心交神，努力修炼，都增加了${y}修为，亲密度+20`);
    } else if (option > 0.6 && option <= 0.7) {
        x = 14000; y = Math.trunc(xiuwei * x);
        await Add_修为(A, y); await Add_修为(B, y); await add_qinmidu(A, B, 15);
        e.reply(`你们双方共同修炼，过程平稳，都增加了${y}修为，亲密度+15`);
    } else if (option > 0.7 && option <= 0.9) {
        x = 520; y = Math.trunc(xiuwei * x);
        await Add_修为(A, y); await Add_修为(B, y); await add_qinmidu(A, B, 10);
        e.reply(`你们双方努力修炼，但是并进不了状态，都增加了${y}修为，亲密度+10`);
    } else {
        e.reply('你们双修时心神合一，但是不知道哪来的小孩，惊断了状态');
    }
    return false;
}
}

function parseJsonOrNull(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function stoneMarketStateKey(usr_qq, dateKey = getShanghaiDateKey()) {
  return `xiuxian:player:${usr_qq}:stone_market:${dateKey}`;
}

async function loadStoneMarketState(usr_qq, player) {
  const dateKey = getShanghaiDateKey();
  const state = parseJsonOrNull(await redis.get(stoneMarketStateKey(usr_qq, dateKey)));
  if (state?.version === 1 && state.dateKey === dateKey && state.gardens) return state;
  const freshState = createStoneMarketState(player);
  await saveStoneMarketState(usr_qq, freshState);
  return freshState;
}

async function saveStoneMarketState(usr_qq, state) {
  await redis.set(
    stoneMarketStateKey(usr_qq, state.dateKey),
    JSON.stringify(state),
    { EX: STONE_MARKET_STATE_TTL_SECONDS }
  );
}

async function withRedisLock(key, e, callback) {
  const token = `${Date.now()}:${Math.random()}`;
  const acquired = Boolean(await redis.set(key, token, { EX: 15, NX: true }));
  if (!acquired) return e.reply('源石坊正在处理上一道指令，请稍候再试');
  try {
    return await callback();
  } finally {
    if (await redis.get(key) === token) await redis.del(key);
  }
}

function withStoneMarketLock(usr_qq, e, callback) {
  return withRedisLock(`xiuxian:player:${usr_qq}:stone_market_lock`, e, callback);
}

function getPendingMarketStone(state) {
  const pending = state?.pending;
  const garden = getStoneGarden(pending?.gardenId);
  const stone = state?.gardens?.[garden?.id]?.stones?.find(item => item.id === pending?.stoneId);
  return garden && stone && stone.purchased && !stone.cut ? { garden, stone } : null;
}

function addStoneMarketSpend(player, currency, amount) {
  if (!amount) return;
  const field = currency === '灵石' ? '源石坊灵石支出' : '源石坊源石支出';
  player[field] = (player[field] || 0) + amount;
}

function addStoneMarketIncome(player, currency, amount) {
  if (!amount) return;
  const field = currency === '灵石' ? '源石坊灵石收入' : '源石坊源石收入';
  player[field] = (player[field] || 0) + amount;
}

async function finishStoneMarketCut(e, usr_qq, player, state, pending, result) {
  const rewardLines = [];
  if (result.sourceValue > 0) {
    player.源石 = (Number(player.源石) || 0) + result.sourceValue;
    addStoneMarketIncome(player, '源石', result.sourceValue);
    rewardLines.push(`获得${formatSourceAmount(result.sourceValue)}斤源石`);
  }
  for (const item of result.items) {
    await Add_najie_thing(usr_qq, item.name, item.class, item.amount);
    rewardLines.push(`获得【${item.name}】x${item.amount}，已收入纳戒`);
  }
  if (result.damageRate) {
    const damage = Math.floor((Number(player.血量上限) || 0) * result.damageRate);
    player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - damage);
    rewardLines.push(`凶机反噬，损失${formatSourceAmount(damage)}点血量`);
  }
  if (result.damaged) rewardLines.push('刀势过猛，脆弱仙珍损毁，只抢救出少量源');
  if (result.suppressed) rewardLines.push('封源术镇住凶机，从封印边缘剥离出少量源');
  if (result.empty) rewardLines.push('石心空空，未能切出任何源');

  player.源石坊空石次数 = (player.源石坊空石次数 || 0) + (result.empty ? 1 : 0);
  player.源石坊奇珍次数 = (player.源石坊奇珍次数 || 0) + result.items.length;
  player.源石坊连续空石 = result.empty ? (player.源石坊连续空石 || 0) + 1 : 0;
  pending.stone.cut = true;
  state.pending = null;
  await Write_player(usr_qq, player);
  await saveStoneMarketState(usr_qq, state);

  if (player.源石坊连续空石 === 5) {
    rewardLines.push('连续五次空石，下一批石料的勘石线索将更加清晰');
  }
  e.reply([
    `【开石·${pending.stone.name}】`,
    `切石结果：${result.outcomeName}`,
    ...rewardLines,
    `当前源石：${formatSourceAmount(player.源石)}斤`,
  ].join('\n'));
  return true;
}

function stoneKingStateKey(groupId, weekKey) {
  return `xiuxian:stone_king:${weekKey}:group:${groupId}`;
}

function formatSourceAmount(amount) {
  return Math.trunc(Number(amount) || 0).toLocaleString('zh-CN');
}

function formatSignedAmount(amount) {
  const value = Math.trunc(Number(amount) || 0);
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString('zh-CN')}`;
}

function formatRemainingTime(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
}

function formatDuelCuts(stones) {
  return stones.map(stone =>
    `- ${stone.name}：${stone.outcomeName}，${formatSourceAmount(stone.sourceValue)}斤`
  );
}

function formatDuelResonance(resonance, baseSource, source) {
  if (!resonance) return [];
  return [`  石相共鸣【${resonance.name}】，额外增加${formatSourceAmount(source - baseSource)}斤源`];
}
