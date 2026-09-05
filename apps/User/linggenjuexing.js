import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import {
  existplayer,
  Write_player,
  Write_equipment,
  isNotNull,
  player_efficiency,
  get_random_fromARR,
  Read_player,
  Read_equipment,
  Add_HP,
  zd_battle,
  exist_najie_thing,
  Add_修为,
  Add_血气,
  __PATH,
  Add_寿元,
  Add_najie_thing,
  dujie,
  LevelTask,
  get_log_img,
  channel,
  ForwardMsg
} from '../../model/xiuxian.js';
import {
  SUPREME_STAGE_NAMES,
  ensureSupremePath,
  getNirvanaMissing,
  getSupremeTitle,
  getSupremeTrialSpec,
  getUltimateMissing,
  learnSupremeBoneArt,
  repairSupremeBoneManifestation,
} from '../../model/supremePath.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  applyZhetianAwakening,
  getZhetianAwakeningStage,
  inspectZhetianAwakening,
} from '../../model/zhetianPhysiquePath.js';
import {
  getActiveZhutianAvatarName,
  syncCurrentZhutianAvatar,
} from '../../model/zhutianMirror.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

function getAvatarRootGuardMessage(player) {
  const avatarName = getActiveZhutianAvatarName(player);
  return avatarName
    ? `当前正装载化身【${avatarName}】，请先发送 #装载化身 本源，再进行灵根觉醒。`
    : '';
}

export class linggenjuexing extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_linggenjuexing',
      dsc: '修仙灵根觉醒模块',
      event: 'message',
      priority: 600,
      rule: [
            { 
            reg: '^#奏响往世乐土之章$', 
            fnc: 'zouxiangwangshi' 
            },
            { 
            reg: '^#真我觉醒$',
            fnc: 'zhenwojuexing' 
            },
            { 
            reg: '^#流萤觉醒$',
            fnc: 'liuyingjuexing' 
            },
            {
            reg: '^#圣体觉醒$',
            fnc: 'shengtijuexing'
            },
            {
            reg: '^#霸体觉醒$',
            fnc: 'batijuexing'
            },
            {
            reg: '^#妖体觉醒$',
            fnc: 'yaotijuexing'
            },
            {
            reg: '^#(?:太阳体觉醒|太阳神体觉醒|太阳圣皇体成就)$',
            fnc: 'taiyangjuexing'
            },
            {
            reg: '^#(?:太阴体觉醒|太阴神体觉醒|太阴圣皇体成就)$',
            fnc: 'taiyinjuexing'
            },
            {
            reg: '^#(?:神王体觉醒|小成神王体|大成神王体)$',
            fnc: 'shenwangjuexing'
            },
            {
            reg: '^#至尊之路$',
            fnc: 'supremePathStatus'
            },
            {
            reg: '^#(?:斩骨|斩骨涅槃)$',
            fnc: 'startSupremeNirvana'
            },
            {
            reg: '^#参悟(?:涅槃)?至尊骨$',
            fnc: 'comprehendSupremeBone'
            },
            {
            reg: '^#舍骨入血$',
            fnc: 'startSupremeUltimate'
            },
            {
            reg: '^#至尊试炼$',
            fnc: 'supremeTrial'
            },
            {
            reg: '^#孕育仙骨$',
            fnc: 'awakenImmortalBone'
            },
            {
            reg: '^#重瞳开天$',
            fnc: 'awakenDoublePupil'
            },
            {
            reg: '^#瞳骨合一$',
            fnc: 'mergeSupremeTalents'
            },
      ],
      
    }); 
  }  /* ---------- 第一步：弹出选项 ---------- */
async zouxiangwangshi(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const has = await exist_najie_thing(usr_qq, '往世乐土之章', '道具');
    if (!has) return e.reply('【往世乐土】你尚未获得"往世乐土之章"，无法开启仪式。');

    const broadcast = [
      `诸天万界忽而响起水晶轻鸣，一座被岁月尘封的「往世乐土」在星空中绽放。`,
      `十三道刻印环绕成环，终末的英桀之座于花海中显形。`,
      `无瑕的少女踏花而来，微笑询问：`,
      `「嗨，想和我一起，让这个世界……变成你喜欢的样子吗？」`,
      ``,
      `【往世乐土】已激活！`,
      `请选择你的回应——`,
      `1. 「我愿意献此身灵根，化作无瑕之人。」（覆盖灵根）`,
      `2. 「我愿与你并肩，而非取代。」（消耗往世乐土之章，召唤次数+1/个）`,
      `（30 秒内回复 1 或 2）`
    ].join('\n');
    await e.reply(broadcast);

    // 设定上下文，等待纯数字
    this.setContext('wangshiChoice');
    return false;
  }
  /* ---------- 第二步：处理选择（框架把 1/2 喂进来） ---------- */
  async wangshiChoice(e) {
    if (!verc({ e })) return false;
    const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    return withPlayerMutationLock(usr_qq, async () => {
    const player = await Read_player(usr_qq);
    
    // 获取用户拥有的往世乐土之章数量
    const chapterCount = await exist_najie_thing(usr_qq, '往世乐土之章', '道具');

    // 从上下文消息中获取用户回复
    let new_msg = '';
    if (this.e?.message && this.e.message[0]?.type === 'text') {
      new_msg = this.e.message[0].text.trim();
    } else if (e.msg) {
      new_msg = e.msg.trim();
    }
    
    if (new_msg === "1") {
      const guardMessage = getAvatarRootGuardMessage(player);
      if (guardMessage) {
        this.finish('wangshiChoice');
        return e.reply(guardMessage);
      }
      const 水晶花 = (await exist_najie_thing(usr_qq, '无瑕水晶花', '道具')) || 0;
      const 誓约证 = (await exist_najie_thing(usr_qq, '誓约之证', '道具')) || 0;
      if (水晶花 < 4 || 誓约证 < 4) {
        await e.reply(
          `【无瑕之人】材料不足！\n` +
          `无瑕水晶花×4（${水晶花}/4）\n` +
          `誓约之证×4（${誓约证}/4）`
        );
        this.finish('wangshiChoice');
        return;
      }
      // 扣材料
      await Add_najie_thing(usr_qq, '往世乐土之章', '道具', -1);
      await Add_najie_thing(usr_qq, '无瑕水晶花', '道具', -4);
      await Add_najie_thing(usr_qq, '誓约之证', '道具', -4);
      // 换灵根
      player.灵根 = {
        id: 7010020,
        name: '爱莉希雅',
        type: '无瑕之人',
        归类: '诸天万界',
        eff: 1.2,
        法球倍率: 1.5,
        攻击: 0.8,
        防御: 0.7,
        生命: 0.9,
        生命本源: 50,
        特殊效果: ['水晶花种', '真我刻印']
      };
      player.生命本源 = 100 + player.灵根.生命本源;
      await Write_player(usr_qq, player);

      await e.reply([
         `你献上无瑕水晶花与誓约之证，花海倒卷，刻印降临。`,
      `五行化作粉金色的花瓣，雷火凝成晶莹的露珠。`,
      `【系统】灵根已变更为：无瑕之人·爱莉希雅`,
      `天际响起她的轻笑：「从今往后，你的每一次心跳，都将开出最美的花哦～」`
      ].join('\n'));
      this.finish('wangshiChoice');
      return;
    }

    /* ---------- 分支 2：询问消耗数量 ---------- */
    if (new_msg === "2") {
      if (chapterCount <= 0) {
        await e.reply('【往世乐土】你没有可消耗的"往世乐土之章"。');
        this.finish('wangshiChoice');
        return;
      }
      
      await e.reply(
        `你选择与爱莉希雅并肩作战。\n` +
        `你当前拥有往世乐土之章×${chapterCount}。\n` +
        `请输入要消耗的数量（1~${chapterCount}）：\n` +
        `（每个可增加1次召唤次数，30秒内回复数字）`
      );
      
      // 设置新的上下文，等待输入数量
      this.setContext('wangshiChoiceCount');
      return false;
    }

    /* ---------- 超时或非法 ---------- */
    await e.reply('选择无效，已超时。乐土之门悄然闭合……');
    this.finish('wangshiChoice');
    });
  }

  /* ---------- 第三步：处理选择数量 ---------- */
  async wangshiChoiceCount(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    
    // 重新获取用户拥有的往世乐土之章数量
    const chapterCount = await exist_najie_thing(usr_qq, '往世乐土之章', '道具');

    // 从上下文消息中获取用户回复
    let new_msg = '';
    if (this.e?.message && this.e.message[0]?.type === 'text') {
      new_msg = this.e.message[0].text.trim();
    } else if (e.msg) {
      new_msg = e.msg.trim();
    }
    
    // 解析输入的数量
    const count = parseInt(new_msg);
    if (isNaN(count) || count < 1 || count > chapterCount) {
      await e.reply(`输入无效，请输入1~${chapterCount}之间的整数。`);
      // 不结束上下文，让用户重新输入
      return false;
    }
    
    // 扣除相应数量的往世乐土之章
    await Add_najie_thing(usr_qq, '往世乐土之章', '道具', -count);
    
    // 增加召唤次数
    const currentSummonCount = player.爱莉希雅召唤次数 || 0;
    player.爱莉希雅召唤次数 = currentSummonCount + count;
    await Write_player(usr_qq, player);

    // 根据消耗数量生成不同的回复
    let replyText = '';
    if (count === 1) {
      replyText = [
        `你后退半步，却伸手接过飘落的晶瓣。`,
        `爱莉希雅眨了眨眼，将一滴闪耀金芒的霸血放入你掌心：`,
        `「那就说定啦，下次召唤我时……要带更多好玩的故事来！」`,
        `【系统】消耗往世乐土之章×1，爱莉希雅召唤次数 +1`
      ].join('\n');
    } else {
      replyText = [
        `你取出${count}枚往世乐土之章，水晶的光芒在花海中交织。`,
        `爱莉希雅轻笑着接过，将${count}滴闪耀金芒的霸血放入你掌心：`,
        `「哎呀，这么期待见到我吗？那就约定好了，要和我创造${count}次美好的回忆哦～」`,
        `【系统】消耗往世乐土之章×${count}，爱莉希雅召唤次数 +${count}`
      ].join('\n');
    }
    
    await e.reply(replyText);
    this.finish('wangshiChoiceCount');
    return;
  }



/** 真我觉醒：人之律者 / 始源律者 二段觉醒 */
async zhenwojuexing(e) {
    if (!e.isGroup) { e.reply('请在群聊中完成真我仪式'); return; }

    const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!await existplayer(usr_qq)) { e.reply('玩家不存在'); return; }

    return withPlayerMutationLock(usr_qq, async () => {
    const player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    // 爱莉希雅的二段觉醒本身就是化身内晋升：材料、境界和生命本源
    // 仍由本流程校验，晋升后同步诸天镜阶段；其他灵根继续走本源保护。
    const activeAvatar = getActiveZhutianAvatarName(player);
    if (guardMessage && activeAvatar !== '爱莉希雅') return e.reply(guardMessage);
    if ( player.灵根.name !== '爱莉希雅'&& player.灵根.name !== '人之律者·爱莉希雅') {
        e.reply('只有无瑕之人·爱莉希雅才能开启真我觉醒'); return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply('生命本源亏空，无法承载真我权柄'); return;
    }

    /* ---------- 阶段判定 ---------- */
    const isRen = player.灵根.type === '无瑕之人';
    const isShiYuan = player.灵根.type === '真我·人之律者';
    if (!isRen && !isShiYuan) { e.reply('当前状态无法觉醒'); return; }

    /* ---------- 材料检查 ---------- */
    const need = isRen
        ? { 往世乐土的记忆结晶: 5, 永恒的乐园之息: 5, 秘境最低: 15 /*准帝*/ }
        : { 无瑕之证: 5, 终焉的启示: 5, 秘境最低: 19 /*仙王巨头*/ };

    for (const [name, num] of Object.entries(need).filter(([k]) => k !== '秘境最低')) {
        const has = await exist_najie_thing(usr_qq, name, '道具') || 0;
        if (has < num) return e.reply(`真我觉醒需要 ${num} 个【${name}】，当前 ${has}`);
    }

    /* ---------- 境界检查 ---------- */
    if (player.mijinglevel_id < need.秘境最低) {
        return e.reply(isRen ? '需秘境体系达到准帝方可承载人之律者权柄'
                            : '需秘境体系达到仙王巨头方可承载始源律者权柄');
    }

    /* ---------- 扣除材料 ---------- */
    for (const [name, num] of Object.entries(need).filter(([k]) => k !== '秘境最低')) {
        await Add_najie_thing(usr_qq, name, '道具', -num);
    }

    /* ---------- 觉醒晋升 ---------- */
    if (isRen) {
        player.灵根 = {
            id: 7010020,
            name: '人之律者·爱莉希雅',
            type: '真我·人之律者',
            归类: '诸天万界',
            eff: 2.8,
            法球倍率: 3.0,
            攻击: 2,
            防御: 1.8,
            生命: 2.2,
            生命本源: 150,
            特殊效果: ['人之权柄', '始源领域']
        };
        player.生命本源 = 100 + player.灵根.生命本源;
        syncCurrentZhutianAvatar(player);
        await Write_player(usr_qq, player);

        const txt = [
            ` 水晶花雨洒落，无瑕之光映照诸天！`,
            `你将「往世乐土的记忆结晶」与「永恒的乐园之息」融入血脉，`,
            `真我权柄苏醒，踏入「人之律者」命途！`,
            ``,
            `【人之律者·爱莉希雅】`,
            `一念花开，一念众生；始源加身，诸天无瑕！`
        ].join('\n');
        e.reply(txt);
    } else {
        player.灵根 = {
            id: 7010020,
            name: '始源之律者·爱莉希雅',
            type: '始源律者',
            归类: '诸天万界',
            eff: 5,
            法球倍率: 6,
            攻击: 4.5,
            防御: 4,
            生命: 5,
            生命本源: 300,
            特殊效果: ['因果干涉', '概念显现']
        };
        player.生命本源 = 100 + player.灵根.生命本源;
        syncCurrentZhutianAvatar(player);
        await Write_player(usr_qq, player);

        const txt = [
            ` 终焉启示降临，始源之海沸腾！`,
            `你以「无瑕之证」承载「终焉的启示」，`,
            `踏过人之律者极限，登临「始源律者」王座！`,
            ``,
            `【始源律者·爱莉希雅】`,
            `一念改因果，一念化诸天；始源既现，万界无瑕！`
        ].join('\n');
        e.reply(txt);
    }
    });
}

async liuyingjuexing(e) {
    if (!e.isGroup) { e.reply('请在群聊中完成流萤觉醒'); return; }

    const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!await existplayer(usr_qq)) { e.reply('玩家不存在'); return; }

    return withPlayerMutationLock(usr_qq, async () => {
    const player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if ( player.灵根.name !== '少女流萤') {
        e.reply('只有少女流萤灵根才能开启流萤觉醒'); return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply('生命本源亏空，无法承受觉醒仪式'); return;
    }

    /* ---------- 阶段判定 ---------- */
    const isRen = player.灵根.type === '星铁';
    if (!isRen && !isShiYuan) { e.reply('当前状态无法觉醒'); return; }

    /* ---------- 材料检查（修改点1：材料更改为星核与命途碎片） ---------- */
    const need = isRen
        ? { 星核: 10, 命途碎片: 10, 秘境最低: 15 /*准帝*/ } // 将原有材料替换为星核和命途碎片
        : { 星核: 10, 命途碎片: 10, 秘境最低: 19 /*仙王巨头*/ }; // 将原有材料替换为星核和命途碎片

    for (const [name, num] of Object.entries(need).filter(([k]) => k !== '秘境最低')) {
        const has = await exist_najie_thing(usr_qq, name, '道具') || 0;
        if (has < num) return e.reply(`流萤觉醒需要 ${num} 个【${name}】，当前仅有 ${has} 个`);
    }

    /* ---------- 境界检查 ---------- */
    if (player.mijinglevel_id < need.秘境最低) {
        return e.reply(isRen ? '需秘境体系达到准帝方可承载「萨姆」机甲'
                            : '需秘境体系达到仙王巨头方可完全解放「星核」之力');
    }

    /* ---------- 扣除材料（修改点2：扣除新的材料） ---------- */
    for (const [name, num] of Object.entries(need).filter(([k]) => k !== '秘境最低')) {
        await Add_najie_thing(usr_qq, name, '道具', -num);
    }

    /* ---------- 觉醒晋升 ---------- */
    if (isRen) {
        // 灵根更新为机甲形态
        player.灵根 = {"id":7010015,"name":"流萤·萨姆机甲","type":"星核猎手","归类":"诸天万界","eff":3,"法球倍率":3,"攻击":3,"防御":3,"生命":3,"生命本源":150};
        player.生命本源 = 100 + player.灵根.生命本源;
        await Write_player(usr_qq, player);

        // 修改点3：觉醒文案重写，贴合星穹铁道设定
        const txt = [
            `🔥 炽烈的星核之光划破长空，命途的碎片在掌心汇聚！`,
            `你将十枚【星核】与十枚【命途碎片】嵌入「萨姆」机甲的核心炉心。`,
            `庞大的能量瞬间激活了沉睡的装甲，流萤在光芒中完成同步，化身为人形天灾——`,
            `「指令确认，流萤Ⅳ型，完全燃烧！」`,
            ``,
            `【星核猎手·流萤（萨姆）】`,
            `于此展现，比星辰更耀眼的光芒！`
        ].join('\n');
        e.reply(txt);
    }
    });
}
async shengtijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return;
    }
    let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    return withPlayerMutationLock(usr_qq, async () => {
    let player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if (!isNotNull(player.Physique_id)) {
        e.reply("请先#刷新信息");
        return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply("你的生命本源亏空无法觉醒");
        return;
    }

    // 初始化圣体秘境完成度系统
    if (typeof player.圣体秘境完成度 === 'undefined') {
        player.圣体秘境完成度 = {
            轮海: 0,
            道宫: 0, 
            四极: 0,
            化龙: 0
        };
    }

    // 检查玩家是否拥有圣体血脉
    if (player.灵根.type === "圣体" && player.mijinglevel_id > 6) {
        // 小成圣体觉醒条件：至少两个秘境达到50%以上
        const 秘境完成度 = Object.values(player.圣体秘境完成度);
        const 达标秘境数 = 秘境完成度.filter(完成度 => 完成度 >= 50).length;
        
        if (达标秘境数 >= 2) {
            player.灵根 = {
                "id": 7010012,
                "name": "小成·荒古圣体",
                "type": "小成圣体",
                "归类": "遮天位面",
                "eff": 1.3,
                "法球倍率": 1.3,
                "攻击": 1.6,
                "防御": 2,
                "生命": 3,
                "生命本源": 150
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            await Write_player(usr_qq, player);
            
            // 构建小成圣体觉醒文案
            const 觉醒文案 = [
                ` 黄金血气冲霄汉，圣体初成震乾坤！`,
                `你历经磨难，将${达标秘境数}大秘境修炼至小成境界，打破天道诅咒！`,
                `黄金圣血终于觉醒，苦海化金洋，异象初显威，自此可以正常修行！`,
                ``,
                `【圣体小成】`,
                `轮海秘境：${player.圣体秘境完成度.轮海}%`,
                `道宫秘境：${player.圣体秘境完成度.道宫}%`, 
                `四极秘境：${player.圣体秘境完成度.四极}%`,
                `化龙秘境：${player.圣体秘境完成度.化龙}%`,
                ``,
                ` 圣体异象已可初步施展，同阶无敌之路开启！`
            ];
            
            e.reply(觉醒文案.join('\n'));
        } else {
            // 秘境修炼不足的提示
            const 不足文案 = [
                ` 圣体觉醒条件不足！`,
                `需至少将两大秘境修炼至50%以上方可小成`,
                `当前秘境完成度：`,
                `轮海：${player.圣体秘境完成度.轮海}% | 道宫：${player.圣体秘境完成度.道宫}%`,
                `四极：${player.圣体秘境完成度.四极}% | 化龙：${player.圣体秘境完成度.化龙}%`,
                ``,
                ` 提示：使用 #修炼圣体秘术 指令继续打磨秘境`
            ];
            e.reply(不足文案.join('\n'));
        }
    } 
    else if (player.灵根.type === "小成圣体" && player.mijinglevel_id > 14) {
        // 大成圣体觉醒条件：四大秘境必须全部达到100%圆满[6](@ref)
        const 秘境完成度 = Object.values(player.圣体秘境完成度);
        const 是否全部圆满 = 秘境完成度.every(完成度 => 完成度 >= 100);
        
        if (是否全部圆满) {
            player.灵根 = {
                "id": 7010013,
                "name": "大成·荒古圣体", 
                "type": "大成圣体",
                "归类": "遮天位面",
                "eff": 1.8,
                "法球倍率": 1.8,
                "攻击": 4,
                "防御": 5,
                "生命": 6,
                "生命本源": 300
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            await Write_player(usr_qq, player);
            
            // 构建大成圣体觉醒文案（辰东风格）
            const 大成文案 = [
                ` 黄金血气贯九霄，圣体大成震古今！`,
                `轮海、道宫、四极、化龙四大秘境尽数圆满，`,
                `你终于打破天地桎梏，成就无上大成圣体！`,
                ``,
                `【圣体大成·可与大帝争锋】`,
                `黄金血气如海，举手投足间星辰摇曳，`,
                `已然拥有叫板古之大帝的绝世战力！`,
                ``,
                ` 秘境圆满状态：`,
                `轮海秘境：${player.圣体秘境完成度.轮海}% `,
                `道宫秘境：${player.圣体秘境完成度.道宫}% `,
                `四极秘境：${player.圣体秘境完成度.四极}% `, 
                `化龙秘境：${player.圣体秘境完成度.化龙}% `,
                ``,
                ` 从此可镇压黑暗动乱，护佑人族万年太平！`
            ];
            
            e.reply(大成文案.join('\n'));
        } else {
            // 大成条件不足的详细提示
            const 未圆满秘境 = [];
            if (player.圣体秘境完成度.轮海 < 100) 未圆满秘境.push(`轮海(${player.圣体秘境完成度.轮海}%)`);
            if (player.圣体秘境完成度.道宫 < 100) 未圆满秘境.push(`道宫(${player.圣体秘境完成度.道宫}%)`);
            if (player.圣体秘境完成度.四极 < 100) 未圆满秘境.push(`四极(${player.圣体秘境完成度.四极}%)`);
            if (player.圣体秘境完成度.化龙 < 100) 未圆满秘境.push(`化龙(${player.圣体秘境完成度.化龙}%)`);
            
            const 不足文案 = [
                ` 大成圣体觉醒条件不足！`,
                `需将四大秘境全部修炼至100%圆满境界`,
                ``,
                ` 当前进度：`,
                `轮海秘境：${player.圣体秘境完成度.轮海}% ${player.圣体秘境完成度.轮海 >= 100 ? '🌟' : '❌'}`,
                `道宫秘境：${player.圣体秘境完成度.道宫}% ${player.圣体秘境完成度.道宫 >= 100 ? '🌟' : '❌'}`,
                `四极秘境：${player.圣体秘境完成度.四极}% ${player.圣体秘境完成度.四极 >= 100 ? '🌟' : '❌'}`,
                `化龙秘境：${player.圣体秘境完成度.化龙}% ${player.圣体秘境完成度.化龙 >= 100 ? '🌟' : '❌'}`,
                ``,
                ` 未圆满秘境：${未圆满秘境.join('、')}`,
                `继续使用 #修炼圣体秘术 指令打磨秘境`
            ];
            
            e.reply(不足文案.join('\n'));
        }
    } 
    else if (!["圣体", "小成圣体"].includes(player.灵根.type)) {
        e.reply(` 血脉不符！非圣体一脉，无法觉醒圣体之威。`);
    } 
    else {
        e.reply(` 觉醒条件不足！需达到更高境界且完成秘境修炼。`);
    }
    });
}
async batijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return;
    }
    let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    return withPlayerMutationLock(usr_qq, async () => {
    let player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if (!isNotNull(player.Physique_id)) {
        e.reply("请先#刷新信息");
        return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply("你的生命本源亏空无法觉醒");
        return;
    }

    // 检查玩家是否拥有霸体血脉
    if (player.灵根.type === "霸体" && player.mijinglevel_id > 6) {
        let 霸血 = await exist_najie_thing(usr_qq, '不灭霸血', '道具')    
        if (霸血) {
            // 移除不灭霸血
            await Add_najie_thing(usr_qq, "不灭霸血", "道具", -1);
            
            // 更新为小成霸体
            player.灵根 = {
                "id": 70046,
                "name": "小成·苍天霸体",
                "type": "小成霸体",
                "归类": "遮天位面",
                "eff": 30,
                "法球倍率": 1.5,
                "攻击": 2.5,
                "防御": 1,
                "生命": 1,
                "生命本源": 100
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            await Write_player(usr_qq, player);
            
            // 构建小成霸体觉醒文案
            const 觉醒文案 = [
                ` 紫色血气冲霄汉，霸体初成震乾坤！`,
                `你融合不灭霸血，激发体内霸体血脉，`,
                `紫色霸血沸腾如海，苦海化紫洋，异象初显威！`,
                ``,
                `【霸体小成】`,
                `苍天霸体血脉初步觉醒，同阶无敌之路开启！`,
                `紫色血气贯九霄，霸拳一出山河碎！`,
                ``,
                ` 从此可力压同代天骄，傲视群雄！`
            ];
            
            e.reply(觉醒文案.join('\n'));
        } else {
            e.reply('你没有不灭霸血无法进行觉醒');
        }
    } 
    else if (player.灵根.type === "小成霸体" && player.mijinglevel_id > 14) {
            // 检查霸体大圆满标志
            if (player.学习的功法?.includes("霸拳真解")&&player.霸体祖星洗礼) {
                player.灵根 = {
                    "id": 70049,
                    "name": "大成·苍天霸体", 
                    "type": "大成霸体",
                    "归类": "遮天位面",
                    "eff": 100,
                    "法球倍率": 2,
                    "攻击": 5,
                    "防御": 3,
                    "生命": 3,
                    "生命本源": 150
                };
                player.生命本源 = 100 + player.灵根.生命本源;
                await Write_player(usr_qq, player);
                
                // 构建大成霸体觉醒文案
                const 大成文案 = [
                    ` 紫色血气贯九霄，霸体大成震古今！`,
                    `准帝九重天巅峰，霸血沸腾如星河倒卷！`,
                    `你终于将苍天霸体淬炼至大圆满境界！`,
                    ``,
                    `【霸体大成·可与大帝争锋】`,
                    `紫色血气如海，举手投足间星辰摇曳，`,
                    `霸拳一出，星河崩碎，万道哀鸣！`,
                    `已然拥有叫板古之大帝的绝世战力！`,
                    ``,
                    ` 从此可镇压一方星域，霸绝九天十地！`
                ];
                
                e.reply(大成文案.join('\n'));
            } else {
                // 霸体未大圆满提示
                const 不足文案 = [
                    ` 小成霸体尚未大圆满！`,
                    `需将霸体血脉淬炼至极致境界`,
                    ``,
                    `须：`,
                    `1. 前往霸体祖星接受祖池洗礼`,
                    `2. 修炼霸拳真解`,
                    `3. 达到准帝九重天`
                ];
                
                e.reply(不足文案.join('\n'));
            }
        }
    else if (!["霸体", "小成霸体"].includes(player.灵根.type)) {
        e.reply(` 血脉不符！非霸体一脉，无法觉醒霸体之威。`);
    } 
    else {
        e.reply(` 觉醒条件不足！需达到更高境界。`);
    }
    });
}
async yaotijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return;
    }
    let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    return withPlayerMutationLock(usr_qq, async () => {
    let player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if (!isNotNull(player.Physique_id)) {
        e.reply("请先#刷新信息");
        return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply("你的生命本源亏空无法觉醒");
        return;
    }

    // 小成妖体觉醒
    if (player.灵根.type === "妖体" && player.mijinglevel_id > 6) {
        let 天妖真血 = await exist_najie_thing(usr_qq, '天妖真血', '道具');
        if (天妖真血) {
            // 移除天妖真血
            await Add_najie_thing(usr_qq, "天妖真血", "道具", -1);
            
            // 更新为小成妖体
            player.灵根 = {
                "id": 7010018,
                "name": "天妖王体",
                "type": "小成妖体",
                "归类": "遮天位面",
                "eff": 2.2,
                "法球倍率": 1.4,
                "攻击": 1.8,
                "防御": 0.8,
                "生命": 1.5,
                "生命本源": 50
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            await Write_player(usr_qq, player);
            
            // 构建小成妖体觉醒文案
            const 觉醒文案 = [
                ` 妖气冲天贯九霄，万妖朝拜震星河！`,
                `你炼化天妖真血，体内妖血沸腾如海，身后浮现九大妖神虚影！`,
                `青鸾展翅，白虎啸天，玄武镇海，朱雀焚空...`,
                `万妖齐鸣，恭迎新王诞生！`,
                ``,
                `【天妖王体觉醒】`,
                `妖血返祖，蜕变为天妖王体！`,
                `举手投足间引动万妖之力，妖皇血脉初步觉醒！`,
                ``,
                ` 从此可统御万妖，号令群妖，踏上妖皇之路！`
            ];
            
            e.reply(觉醒文案.join('\n'));
        } else {
            e.reply('你没有天妖真血无法进行觉醒');
        }
    } 
    // 大成妖体觉醒
    else if (player.灵根.type === "小成妖体" && player.mijinglevel_id > 14) {
        // 检查大成条件
        const hasEmperorScripture = player.学习的功法?.includes("妖帝古经");
        
        if (hasEmperorScripture ) {
            // 更新为大成妖体
            player.灵根 = {
                "id": 7010019,
                "name": "天妖皇体",
                "type": "大成妖体",
                "归类": "遮天位面",
                "eff": 4.0,
                "法球倍率": 2.2,
                "攻击": 3.5,
                "防御": 1.5,
                "生命": 3.0,
                "生命本源": 100
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            await Write_player(usr_qq, player);
            
            // 构建大成妖体觉醒文案
            const 大成文案 = [
                ` 妖皇临世，万界震颤！`,
                `你融合妖皇之心与太古妖血，身后浮现妖帝虚影！`,
                `青帝踏空而来，一指洞穿时空，将无上妖皇传承打入你的仙台！`,
                ``,
                `【天妖皇体大成】`,
                `妖血彻底返祖，蜕变为天妖皇体！`,
                `周身妖气化作九条真龙，环绕飞舞，万妖臣服！`,
                `"吾道不孤..."青帝虚影含笑消散，化作点点青光融入你的血脉。`,
                ``,
                ` 从此可统御诸天万妖，重现上古妖庭辉煌！`
            ];
            
            e.reply(大成文案.join('\n'));
        } else {
            // 条件不足提示
            const 不足文案 = [` 天妖皇体觉醒条件不足：`];
            
            if (!hasEmperorScripture) {
                不足文案.push(`- 需领悟「妖帝古经」无上妙法`);
            }
            
            不足文案.push(``);
            不足文案.push(` 继续追寻妖皇之路，终将重现上古妖庭辉煌！`);
            
            e.reply(不足文案.join('\n'));
        }
    } 
    else if (!["妖体", "小成妖体"].includes(player.灵根.type)) {
        e.reply(` 血脉不符！非妖体一脉，无法觉醒妖皇之威。`);
    } 
    else {
        e.reply(` 觉醒条件不足！需达到更高境界。`);
    }
    });
}

async taiyangjuexing(e) {
    return this.awakenZhetianPhysique(e, '太阳');
}

async taiyinjuexing(e) {
    return this.awakenZhetianPhysique(e, '太阴');
}

async shenwangjuexing(e) {
    return this.awakenZhetianPhysique(e, '神王');
}

async awakenZhetianPhysique(e, routeKey) {
    if (!e.isGroup) return e.reply('修仙游戏请在群聊中游玩');
    const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');

    const game_action = await redis.get(`xiuxian:player:${usr_qq}:game_action`);
    if (game_action == 0) return e.reply('修仙：游戏进行中...');

    return withPlayerMutationLock(usr_qq, async () => {
    const player = await Read_player(usr_qq);
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if (!isNotNull(player.Physique_id)) return e.reply('请先#刷新信息');

    const state = getZhetianAwakeningStage(player, routeKey);
    if (state.status === 'complete') {
        return e.reply(`你的${state.route.label}已经修至大成，无需再次觉醒。`);
    }
    if (state.status === 'wrong-lineage') {
        return e.reply(`血脉不符！你当前并非${state.route.label}一脉。`);
    }
    if (state.status !== 'ready') return e.reply('未知的遮天体质进阶路线。');

    const itemCounts = {};
    if (state.stage.item) {
        itemCounts[state.stage.item.name] = Number(
            await exist_najie_thing(usr_qq, state.stage.item.name, state.stage.item.class) || 0
        );
    }
    const result = inspectZhetianAwakening(player, routeKey, itemCounts);
    if (!result.ok) {
        return e.reply([
            `【${result.stage.title}条件不足】`,
            ...result.missing.map(entry => `- ${entry}`),
        ].join('\n'));
    }

    const targetTalent = data.talent_list.find(entry => entry.name === result.stage.to);
    if (!targetTalent) return e.reply(`灵根配置缺失：${result.stage.to}，请联系管理员。`);

    if (result.stage.item) {
        await Add_najie_thing(
            usr_qq,
            result.stage.item.name,
            result.stage.item.class,
            -result.stage.item.amount
        );
    }
    applyZhetianAwakening(player, result, [targetTalent]);
    await Write_player(usr_qq, player);
    await player_efficiency(usr_qq);

    return e.reply([
        `【${result.stage.title}】`,
        result.stage.description,
        `灵根蜕变：${result.stage.from} → ${result.stage.to}`,
    ].join('\n'));
    });
}

async getSupremeContext(e) {
    if (!verc({ e })) return null;
    const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!await existplayer(usr_qq)) {
        await e.reply('玩家不存在，请先创建角色');
        return null;
    }
    const player = await Read_player(usr_qq);
    const boneRepaired = repairSupremeBoneManifestation(player);
    const path = ensureSupremePath(player);
    if (!path) {
        await e.reply('你并非天生至尊，无法踏上至尊骨进阶之路。');
        return null;
    }
    if (boneRepaired) await Write_player(usr_qq, player);
    return { usr_qq, player, path };
}

async saveSupremePlayer(usr_qq, player) {
    const path = ensureSupremePath(player);
    if (path) path.称号 = getSupremeTitle(player);
    await Write_player(usr_qq, player);
    await player_efficiency(usr_qq);
}

async supremePathStatus(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    const trial = path.试炼;
    const nextMissing = path.阶段 === 1
        ? getNirvanaMissing(player)
        : path.阶段 === 2
            ? getUltimateMissing(player)
            : [];

    await Write_player(usr_qq, player);
    return e.reply([
        '【至尊之路】',
        `本命阶段：${SUPREME_STAGE_NAMES[path.阶段]}`,
        `组合称号：${getSupremeTitle(player)}`,
        `至尊骨：${player.至尊骨 || '尚未显化'}`,
        `至尊宝术：${['上苍之手', '轮回宝术', '轮回天罚'].filter(skill => player.学习的功法?.includes(skill)).join('、') || '尚未参悟'}`,
        `重瞳：${path.重瞳 ? '已觉醒' : '未觉醒'}`,
        `仙骨：${path.仙骨 ? '已孕育' : '未孕育'}`,
        `瞳骨共鸣：${path.共鸣 ? '已完成' : '未完成'}`,
        trial ? `当前试炼：${trial.名称} ${trial.胜场}/${trial.目标}` : '当前试炼：无',
        nextMissing.length ? `下一阶段尚缺：${nextMissing.join('、')}` : path.阶段 < 3 ? '下一阶段条件已经满足' : '至尊骨主线已经圆满',
        '',
        '可用指令：#斩骨、#斩骨涅槃、#参悟至尊骨、#参悟涅槃至尊骨、#舍骨入血、#至尊试炼、#孕育仙骨、#重瞳开天、#瞳骨合一',
    ].join('\n'));
}

async startSupremeNirvana(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    if (e.msg === '#斩骨' && path.阶段 === 2) return this.startSupremeUltimate(e, ctx);
    if (path.阶段 !== 1) return e.reply('只有天生至尊可以开启第一次斩骨涅槃。');
    if (path.试炼) return e.reply(`你正在进行${path.试炼.名称}，请使用 #至尊试炼。`);

    const missing = getNirvanaMissing(player);
    if (missing.length) return e.reply(`【斩骨涅槃·条件不足】\n尚缺：${missing.join('、')}`);

    const spec = getSupremeTrialSpec('nirvana');
    path.试炼 = { 类型: 'nirvana', 名称: '失骨涅槃', 胜场: 0, 目标: spec.target };
    player.至尊骨 = '已斩出';
    await Add_najie_thing(usr_qq, '至尊骨', '材料', 1, undefined, 1, {
        idempotencyKey: 'supreme-path:first-bone',
    });
    await Write_player(usr_qq, player);
    return e.reply([
        '【斩骨涅槃】',
        '你亲手挖出胸口至尊骨，将上苍符文散入血肉。',
        '获得【至尊骨】×1，可使用 #参悟至尊骨 领悟上苍之手。',
        '试炼期间将以凡血之躯迎战夺骨者投影。',
        `取得${spec.target}场胜利后，至尊骨将由自身重新孕育。`,
        '使用 #至尊试炼 开始战斗。',
    ].join('\n'));
}

async startSupremeUltimate(e, existingContext = null) {
    const ctx = existingContext || await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    if (path.阶段 !== 2) return e.reply('只有涅槃·至尊可以开启舍骨入血。');
    if (path.试炼) return e.reply(`你正在进行${path.试炼.名称}，请使用 #至尊试炼。`);

    const missing = getUltimateMissing(player);
    if (missing.length) return e.reply(`【舍骨入血·条件不足】\n尚缺：${missing.join('、')}`);

    const spec = getSupremeTrialSpec('ultimate');
    path.试炼 = { 类型: 'ultimate', 名称: '血肉铭骨', 胜场: 0, 目标: spec.target };
    player.至尊骨 = '已舍入血肉';
    await Add_najie_thing(usr_qq, '涅槃至尊骨', '材料', 1, undefined, 1, {
        idempotencyKey: 'supreme-path:nirvana-bone',
    });
    await Write_player(usr_qq, player);
    return e.reply([
        '【舍骨入血】',
        '你从第二块至尊骨中截下核心宝骨，余下符文化入血液、脏腑与每一寸肉身。',
        '获得【涅槃至尊骨】×1，可使用 #参悟涅槃至尊骨 领悟轮回宝术。',
        `你必须以无骨之身战胜自身道果${spec.target}次。`,
        '使用 #至尊试炼 迎战至尊骨中的自己。',
    ].join('\n'));
}

async comprehendSupremeBone(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player } = ctx;
    const boneName = e.msg.includes('涅槃至尊骨') ? '涅槃至尊骨' : '至尊骨';
    const amount = Number(await exist_najie_thing(usr_qq, boneName, '材料') || 0);
    if (amount < 1) return e.reply(`你的纳戒中没有【${boneName}】。`);

    const result = learnSupremeBoneArt(player, boneName);
    if (!result.ok) {
        if (result.reason === 'known') return e.reply(`你已经参悟出【${result.skill}】，无需重复参悟。`);
        if (result.reason === 'wrong_stage') {
            return e.reply(`【${boneName}】中的符文尚未回应你，需达到${SUPREME_STAGE_NAMES[result.requiredStage]}。`);
        }
        return e.reply('这块骨中没有可供参悟的至尊符文。');
    }

    await Add_najie_thing(usr_qq, boneName, '材料', -1);
    await this.saveSupremePlayer(usr_qq, player);
    return e.reply([
        `【至尊骨参悟】`,
        `消耗【${boneName}】×1，领悟【${result.skill}】。`,
        result.combined
            ? '上苍符文与轮回符文交融，自动领悟【轮回天罚】！'
            : result.skill === '上苍之手'
                ? '上苍之手可镇压对手，使其无法行动。'
                : '轮回符文流转不息，只待与上苍之手合一。',
    ].join('\n'));
}

buildSupremeTrialFighters(player, trial) {
    const spec = getSupremeTrialSpec(trial.类型);
    const maxHp = Math.max(1, Number(player.血量上限 || player.当前血量 || player.生命 || 1));
    const attacker = JSON.parse(JSON.stringify(player));
    attacker.名号 = `${player.名号}·无骨之身`;
    attacker.当前血量 = maxHp;
    attacker.血量上限 = maxHp;
    attacker.灵根 = { name: '凡血之躯', type: '体质', 法球倍率: 0.8 };
    attacker.法球倍率 = 0.8;
    delete attacker.至尊之路;

    const enemyRootName = trial.类型 === 'nirvana' ? '天生至尊' : '涅槃·至尊';
    const enemyRoot = data.talent_list.find(item => item.name === enemyRootName) || player.灵根;
    const enemy = {
        名号: spec.enemyName,
        攻击: Math.max(1, Math.trunc(Number(player.攻击 || 1) * spec.enemyScale)),
        防御: Math.max(1, Math.trunc(Number(player.防御 || 1) * spec.enemyScale)),
        当前血量: Math.max(1, Math.trunc(maxHp * spec.enemyScale)),
        血量上限: Math.max(1, Math.trunc(maxHp * spec.enemyScale)),
        暴击率: Number(player.暴击率 || 0.1),
        暴击伤害: Number(player.暴击伤害 || 1.5),
        灵根: { ...enemyRoot },
        法球倍率: Number(enemyRoot.法球倍率 || 1),
        学习的功法: [],
        仙宠: null,
        速度: Number(player.速度 || 100),
        mijinglevel_id: Number(player.mijinglevel_id || 0),
        xiangulevel_id: Number(player.xiangulevel_id || 0),
    };
    return { attacker, enemy };
}

async supremeTrial(e) {
    const lockQQ = await channel(e.user_id.toString().replace('qg_', ''));
    return withPlayerMutationLock(lockQQ, async () => {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    const guardMessage = getAvatarRootGuardMessage(player);
    if (guardMessage) return e.reply(guardMessage);
    if (!path.试炼) return e.reply('你尚未开启至尊试炼。');

    const { attacker, enemy } = this.buildSupremeTrialFighters(player, path.试炼);
    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, attacker, enemy);
    if (blackEmperorFormation.consumed) await Write_player(usr_qq, player);
    const result = await zd_battle(attacker, enemy);
    if (blackEmperorFormation.message && Array.isArray(result.msg)) result.msg.unshift(blackEmperorFormation.message);
    if (Array.isArray(result.msg) && result.msg.length) await ForwardMsg(e, result.msg);

    if (result.winner !== 'A') {
        return e.reply(`【至尊试炼失败】\n道痕未损，当前进度仍为 ${path.试炼.胜场}/${path.试炼.目标}。`);
    }

    path.试炼.胜场++;
    if (path.试炼.胜场 < path.试炼.目标) {
        await Write_player(usr_qq, player);
        return e.reply(`【至尊试炼胜利】\n${path.试炼.名称}：${path.试炼.胜场}/${path.试炼.目标}`);
    }

    const completedType = path.试炼.类型;
    const nextStage = completedType === 'nirvana' ? 2 : 3;
    const nextName = SUPREME_STAGE_NAMES[nextStage];
    const nextTalent = data.talent_list.find(item => item.name === nextName);
    if (!nextTalent) return e.reply(`未找到灵根配置：${nextName}，请联系管理员。`);

    player.灵根 = { ...nextTalent };
    player.至尊骨 = completedType === 'nirvana' ? '涅槃再生' : '血肉铭骨';
    path.阶段 = nextStage;
    path.试炼 = null;
    player.生命本源 = 100 + Number(player.灵根.生命本源 || 0);
    await this.saveSupremePlayer(usr_qq, player);

    return e.reply([
        `【${nextName}】`,
        completedType === 'nirvana'
            ? '失去的骨没有归来，一块更强的至尊骨却从自身血肉中重新生出。轮回宝术就此觉醒。'
            : '至尊符文不再拘泥于一块骨，而是遍布血肉脏腑。第三至尊术于体内轰鸣。',
        `当前称号：${getSupremeTitle(player)}`,
    ].join('\n'));
    });
}

async awakenImmortalBone(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    if (path.仙骨) return e.reply('你的仙骨已经孕育完成。');
    if (!player.学习的功法?.includes('五行涅槃法')) return e.reply('孕育仙骨需要掌握五行涅槃法。');
    if (player.生命本源 !== 100 + Number(player.灵根.生命本源 || 0)) return e.reply('生命本源亏空，无法孕育仙骨。');

    const souls = Number(await exist_najie_thing(usr_qq, '仙王残魂', '材料') || 0);
    const worldStones = Number(await exist_najie_thing(usr_qq, '世界石', '材料') || 0);
    if (souls < 3 || worldStones < 1) {
        return e.reply(`【仙骨材料不足】\n仙王残魂：${souls}/3\n世界石：${worldStones}/1`);
    }

    await Add_najie_thing(usr_qq, '仙王残魂', '材料', -3);
    await Add_najie_thing(usr_qq, '世界石', '材料', -1);
    path.仙骨 = true;
    path.共鸣 = false;
    await this.saveSupremePlayer(usr_qq, player);
    return e.reply(`【仙骨孕育】\n仙光贯穿四肢百骸，第二块不朽仙骨在体内成形。\n获得称号：${getSupremeTitle(player)}`);
}

async awakenDoublePupil(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    if (path.重瞳) return e.reply('你的重瞳已经觉醒。');
    if (Math.max(Number(player.mijinglevel_id || 0), Number(player.xiangulevel_id || 0)) < 6) {
        return e.reply('重瞳开天需要遮天或仙古境界达到第六境。');
    }

    const source = Number(await exist_najie_thing(usr_qq, '重瞳本源', '材料') || 0);
    if (source < 1) return e.reply('你没有重瞳本源，无法映照开天神瞳。');

    await Add_najie_thing(usr_qq, '重瞳本源', '材料', -1);
    path.重瞳 = true;
    path.共鸣 = false;
    await this.saveSupremePlayer(usr_qq, player);
    return e.reply(`【重瞳开天】\n双眸各生重瞳，左眼开天，右眼寂灭。\n获得称号：${getSupremeTitle(player)}`);
}

async mergeSupremeTalents(e) {
    const ctx = await this.getSupremeContext(e);
    if (!ctx) return false;
    const { usr_qq, player, path } = ctx;
    if (path.阶段 < 2) return e.reply('至少完成第一次至尊涅槃，方能承受瞳骨合一。');
    if (!path.重瞳 || !path.仙骨) return e.reply('瞳骨合一需要同时拥有重瞳、至尊骨与仙骨。');
    if (path.共鸣) return e.reply('重瞳、至尊骨与仙骨已经完成共鸣。');

    path.共鸣 = true;
    await this.saveSupremePlayer(usr_qq, player);
    return e.reply([
        '【瞳骨合一】',
        '重瞳洞察万法，至尊骨主掌攻伐，仙骨镇压反噬。',
        '三种本源贯通周身，获得终极共鸣：瞳照上苍·不朽轮回。',
        `无上称号：${getSupremeTitle(player)}`,
    ].join('\n'));
}

}
