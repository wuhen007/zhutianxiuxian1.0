export const DEFAULT_OPENING_POTENTIAL = 300;

export const MORTAL_OPENING_OMENS = Object.freeze([
  {
    id: 'mortal_dust',
    name: '凡尘一粟·万象无声',
    tier: '平凡无异',
    weight: 35,
    text: [
      '你顺利引气入体，成为了修仙界最普通的一名练气修士。',
      '没有天地异象，没有高人注视，甚至负责登记的外门弟子都没有抬头多看你一眼。',
      '今日无人知你，来日如何，只看你自己。',
    ],
    rewards: {},
  },
  {
    id: 'mountain_wanderer',
    name: '山野散修·一卷残经',
    tier: '平凡无异',
    weight: 10,
    text: [
      '你没有师承，只在荒山破庙中捡到半卷残缺吐纳法。',
      '经文错漏百出，纸页还被老鼠啃去了大半。凭着这点微薄机缘，你竟真的感应到了天地灵气。',
      '仙路已经打开，只是远比旁人更加崎岖。',
    ],
    rewards: { 仙道潜力: 30, 修为: 10000 },
  },
  {
    id: 'blue_star_soul',
    name: '异世孤魂·蓝星余梦',
    tier: '凡世机缘',
    weight: 10,
    text: [
      '你记得那个没有灵气的世界。那里有钢铁高楼、横跨天际的飞行器，以及一张小小屏幕便能知晓万里之外发生的事情。',
      '如今再睁眼，旧日文明已如梦幻泡影。你没有随身系统，也没有无上传承，只有一颗不属于这个时代的灵魂。',
    ],
    rewards: { 仙道潜力: 50 },
  },
  {
    id: 'two_lives_wisdom',
    name: '两世为人·慧根早生',
    tier: '凡世机缘',
    weight: 5,
    text: [
      '你出生数月便能听懂人言，三岁时已经学会隐藏自己的异常。',
      '前世的知识无法直接化作修为，却让你比同龄人更懂得观察、试探与取舍。',
      '在这弱肉强食的修仙界，清醒有时比天赋更珍贵。',
    ],
    rewards: { 仙道潜力: 80, 灵石: 10000 },
  },
  {
    id: 'medicine_valley_orphan',
    name: '雨夜弃婴·药谷收留',
    tier: '凡世机缘',
    weight: 8,
    text: [
      '一个雷雨交加的夜晚，采药老人从山崖下捡到了尚在襁褓中的你。',
      '你在药香中长大，以灵泉为水，以药渣为食。老人临终前，将积攒一生的灵石全部留给了你。',
    ],
    rewards: { 仙道潜力: 60, 血气: 30000, 灵石: 20000 },
  },
  {
    id: 'ancestral_hall_glow',
    name: '祖祠生霞·先人余荫',
    tier: '凡世机缘',
    weight: 6,
    text: [
      '你祭拜先祖时，蒙尘多年的祖牌突然绽放微光。',
      '一道残存其中的灵力融入你的身体，替你打通数条闭塞经脉。传承早已断绝，只剩这一点余荫落在你的身上。',
    ],
    rewards: { 仙道潜力: 120, 血气: 50000, 灵石: 20000 },
  },
  {
    id: 'spirit_spring_cleansing',
    name: '灵泉出世·洗髓开脉',
    tier: '凡世机缘',
    weight: 5,
    text: [
      '山洪过后，你在崩塌的石壁间发现了一眼灵泉。',
      '泉水入口清冽，随后却如烈火般灼烧五脏六腑。你昏迷三日，再次醒来时，体内杂质已被尽数排出。',
      '灵泉随即枯竭，仿佛它存在百年，只为等待今日。',
    ],
    rewards: { 仙道潜力: 150, 血气: 80000 },
  },
  {
    id: 'white_crane_guidance',
    name: '白鹤衔婴·云门接引',
    tier: '仙门接引',
    weight: 6,
    text: [
      '你出生那日，一只白鹤从云海深处飞来，在屋外守候整整一夜。',
      '清晨时分，它忽然卷起清风，将襁褓中的你驮上云端。',
      '数日后，凡间父母只收到一枚刻着“仙缘已至”的青色玉牌。',
    ],
    rewards: { 仙道潜力: 100, 修为: 30000, 灵石: 20000 },
  },
  {
    id: 'dao_bell_nine_chimes',
    name: '道钟九响·破例入门',
    tier: '仙门接引',
    weight: 4,
    text: [
      '你走过山门时，沉寂百年的问心钟忽然自行鸣响。',
      '第一声惊动外门，第三声惊动长老，第九声落下时，闭关多年的宗主亲自走出了洞府。',
      '无人看出你究竟有何特殊，但从这一日起，宗门再没有人敢将你视作普通弟子。',
    ],
    rewards: { 仙道潜力: 180, 修为: 100000, 灵石: 50000 },
  },
  {
    id: 'void_refinement_disciple',
    name: '炼虚垂目·收为亲传',
    tier: '仙门接引',
    weight: 3,
    text: [
      '一名游戏人间的炼虚大能偶然经过此地，在看见你的第一眼后突然停下脚步。',
      '他以神识探查你的根骨，又推演了整整一夜天机，最终却只得到一片无法看清的迷雾。',
      '天亮后，他封闭山门，将你收入座下，成为自己数百年来唯一的亲传弟子。',
    ],
    rewards: { 仙道潜力: 200, 修为: 150000, 灵石: 100000 },
  },
  {
    id: 'tribulation_thunder_body',
    name: '劫雷淬体·百脉天成',
    tier: '下界天骄',
    weight: 3,
    text: [
      '一位渡劫老祖陨落之时，散落的雷霆意外坠入你出生的小城。',
      '众人皆以为你必死无疑，雷光散去后，你却在废墟中放声啼哭。残余劫雷没有毁去你的肉身，反而替你淬炼了经脉与骨骼。',
    ],
    rewards: { 仙道潜力: 250, 血气: 200000 },
  },
  {
    id: 'spirit_body_awakening',
    name: '灵体初醒·天地吐纳',
    tier: '下界天骄',
    weight: 2,
    talentTypes: ['体质', '天灵根'],
    text: [
      '你第一次呼吸时，周围数里的灵气便自行汇聚而来。',
      '尚未修炼，你的经脉已经开始吞吐天地精华，体内窍穴如星辰般接连亮起。',
      '附近宗门为争夺你的归属连夜议和，最终共同立誓，不得在你成年前强行带走。',
    ],
    rewards: { 仙道潜力: 350, 修为: 300000, 血气: 300000 },
  },
  {
    id: 'tribulation_ancestor_rebirth',
    name: '劫灰复燃·老祖转世',
    tier: '凡界传说',
    weight: 2,
    text: [
      '数百年前，一位渡劫老祖在飞升雷劫中身死道消。',
      '你出生时，他遗留在宗门深处的魂灯突然重新燃起，尘封洞府也随之自行开启。',
      '你没有完整的前世记忆，却总能在修炼时本能避开错误，仿佛这条仙路，自己已经走过一次。',
    ],
    rewards: { 仙道潜力: 500, 修为: 500000, 血气: 500000 },
  },
  {
    id: 'world_ascension_bell',
    name: '一界钟鸣·飞升之种',
    tier: '凡界传说',
    weight: 1,
    text: [
      '你踏入仙途的一刻，凡界各大宗门供奉的飞升古钟同时响起。',
      '渡劫老怪从闭关中惊醒，占天师接连毁去七面卦盘，却仍无法看清你的未来。',
      '最终，天穹浮现出四个古老文字：此子可登仙。',
    ],
    rewards: { 仙道潜力: 700, 修为: 1000000, 血气: 1000000, 灵石: 1000000 },
  },
]);

function safeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

export function drawOpeningOmen(talent, random = Math.random) {
  const pool = MORTAL_OPENING_OMENS.filter(
    omen => !omen.talentTypes || omen.talentTypes.includes(talent?.type)
  );
  const totalWeight = pool.reduce((sum, omen) => sum + omen.weight, 0);
  let roll = safeRandom(random) * totalWeight;
  for (const omen of pool) {
    if (roll < omen.weight) return omen;
    roll -= omen.weight;
  }
  return pool[pool.length - 1];
}

export function applyOpeningOmen(player, omen, obtainedAt = Date.now()) {
  if (!player || typeof player !== 'object') throw new Error('玩家数据无效');
  if (!omen?.id) throw new Error('开局异象无效');
  if (player.开局异象?.奖励已结算 === true) return player;

  for (const key of ['仙道潜力', '修为', '血气', '灵石']) {
    player[key] = Math.max(0, (Number(player[key]) || 0) + (Number(omen.rewards?.[key]) || 0));
  }
  player.开局异象 = {
    id: omen.id,
    name: omen.name,
    tier: omen.tier,
    obtainedAt,
    奖励已结算: true,
  };
  return player;
}

export function formatOpeningOmenMessage(omen, playerName = '') {
  const rewardLines = Object.entries(omen?.rewards || {})
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `  ${key}：+${Number(value).toLocaleString('zh-CN')}`);
  return [
    `【踏入仙途·${omen.name}】`,
    ...(playerName ? [`凡界众生册上，自此多了一个名字：【${playerName}】。`] : []),
    '',
    ...(omen.text || []),
    '',
    `异象品阶：【${omen.tier}】`,
    '开局造化：',
    ...(rewardLines.length ? rewardLines : ['  无。仙路不曾格外垂青于你。']),
  ].join('\n');
}
