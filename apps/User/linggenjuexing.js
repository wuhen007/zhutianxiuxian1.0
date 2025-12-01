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
      ],
      
    }); 
  }  /* ---------- 第一步：弹出选项 ---------- */
  async zouxiangwangshi(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const has = await exist_najie_thing(usr_qq, '往世乐土之章', '道具');
    if (!has) return e.reply('【往世乐土】你尚未获得“往世乐土之章”，无法开启仪式。');

    const broadcast = [
      `诸天万界忽而响起水晶轻鸣，一座被岁月尘封的「往世乐土」在星空中绽放。`,
      `十三道刻印环绕成环，终末的英桀之座于花海中显形。`,
      `无瑕的少女踏花而来，微笑询问：`,
      `「嗨，想和我一起，让这个世界……变成你喜欢的样子吗？」`,
      ``,
      `【往世乐土】已激活！`,
     `请选择你的回应——`,
    `1. 「我愿意献此身灵根，化作无瑕之人。」（覆盖灵根）`,
    `2. 「我愿与你并肩，而非取代。」（召唤次数+1）`,
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
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const needChapter = 1;

    // 从上下文消息中获取用户回复
    let new_msg = '';
    if (this.e?.message && this.e.message[0]?.type === 'text') {
      new_msg = this.e.message[0].text.trim();
    } else if (e.msg) {
      new_msg = e.msg.trim();
    }
    
    if (new_msg === "1") {
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
      await Add_najie_thing(usr_qq, '往世乐土之章', '道具', -needChapter);
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

    /* ---------- 分支 2：召唤+1 ---------- */
    if (new_msg === "2") {
      await Add_najie_thing(usr_qq, '往世乐土之章', '道具', -needChapter);
      player.爱莉希雅召唤次数 = (player.爱莉希雅召唤次数 || 0) + 1;
      await Write_player(usr_qq, player);

      await e.reply([
        `你后退半步，却伸手接过飘落的晶瓣。`,
        `爱莉希雅眨了眨眼，将一滴闪耀金芒的霸血放入你掌心：`,
        `「那就说定啦，下次召唤我时……要带更多好玩的故事来！」`,
        `【系统】爱莉希雅召唤次数 +1`
      ].join('\n'));
      this.finish('wangshiChoice');
      return;
    }

    /* ---------- 超时或非法 ---------- */
    await e.reply('选择无效，已超时。乐土之门悄然闭合……');
    this.finish('wangshiChoice');
  }



/** 真我觉醒：人之律者 / 始源律者 二段觉醒 */
async zhenwojuexing(e) {
    if (!e.isGroup) { e.reply('请在群聊中完成真我仪式'); return; }

    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) { e.reply('玩家不存在'); return; }

    const player = await Read_player(usr_qq);
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
}

async shengtijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
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
    let player = await Read_player(usr_qq);
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
}
async batijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
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
    let player = await Read_player(usr_qq);
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
                    "id": 7010013,
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
}
async yaotijuexing(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
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
    let player = await Read_player(usr_qq);
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
}

}