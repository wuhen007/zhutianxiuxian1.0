import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import {
  existplayer,
  Write_player,
  Write_equipment,
  isNotNull,
  player_efficiency,
  get_random_fromARR,
  Read_player,
foundthing,
  Read_equipment,
  Set_HP,
   zd_battle,
   Read_najie,
  exist_najie_thing,
  Add_修为,
  Add_player_学习功法,
  bigNumberTransform,
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

export class xiantianzhibao extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_xiantianzhibao',
      dsc: '先天至宝模块',
      event: 'message',
      priority: 600,
      rule: [
    {
    reg: '^#(推演诸相|映照诸相|照见诸相)\\s*(.+)$',
    fnc: 'tuiyanZhuxiang'
    },
{
    reg: /^#(道争虚影|挑战虚影|塔内论道)$/i,
    fnc: 'daozhengXuying',
    priority: 50,
    describe: '与推演出的虚影进行道争'
},
{
    reg: /^#具现选择(?:\s+(.+))?$/i,
    fnc: 'manifestSelection',
    priority: 50,
    describe: '选择要具现的物品'
}

      ],
    });
  }

// 推演诸相功能 - 功极无相塔
async tuiyanZhuxiang(e) {
    if (!e.isGroup) {
        e.reply('此间非道场，归尘归土，归群聊。');
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('凡尘未踏，何言诸相？先证己身。');
        return;
    }
    
    let player = await Read_player(usr_qq);
    
    // ==== 检查功极无相塔绑定状态 ====
    if (player.功极无相塔 !== 1) {
        e.reply([
            '塔音低沉：',
            '"命魂未契，真灵未缚..."',
            '',
            '尔之性命真灵未曾烙印于此塔。',
            '欲推演诸相，需先以真灵与塔相缚。',
            '',
            '（需获得【功极无相塔】并完成真灵绑定）'
        ].join('\n'));
        return;
    }
    
    const match = e.msg.match(new RegExp('^#(推演诸相|映照诸相|照见诸相)\\s*(.+)$'));
    if (!match || !match[2] || match[2].trim() === '') {
        e.reply([
            '塔音回响：',
            '诸天如镜，推演何影？',
            '',
            '【法】',
            '#推演诸相 [道号]',
            '#推演诸相 [天机印记]',
            '',
            '例：',
            '#推演诸相 凌霄剑尊',
            '#推演诸相 2283096140',
            '',
            '塔规：所推之影，不可逾己境。'
        ].join('\n'));
        return;
    }
    
    const targetInput = match[2].trim();
    
    // 清理输入，移除可能的@符号
    const cleanInput = targetInput.replace(/^@/, '').trim();
    
    if (cleanInput.length === 0) {
        e.reply('塔灵警示：目标不可为空无！');
        return;
    }
    
    // 塔灵初始回应
    e.reply([
        '塔身微震，古纹流转。',
        '一缕道音自无尽高处垂落：',
        '"诸相非相，是名诸相..."',
        '',
        '正以尔之"功"为引，推演诸天...'
    ].join('\n'));
    
    // 遍历所有玩家存档
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith(".json"));
    
    let foundTargets = [];
    let processed = 0;
    
    for (let i = 0; i < File.length; i++) {
        let this_qq = File[i].replace(".json", '');
        let playerData = await Read_player(this_qq);
        
        // 匹配QQ号（精确）
        if (cleanInput === this_qq) {
            foundTargets.push({
                qq: this_qq,
                name: playerData.名号,
                data: playerData
            });
            break;
        }
        
        // 匹配名号（含部分）
        if (playerData.名号 && playerData.名号.includes(cleanInput)) {
            foundTargets.push({
                qq: this_qq,
                name: playerData.名号,
                data: playerData
            });
        }
        
        processed++;
        // 每处理50个显示一次进度
        if (processed % 50 === 0) {
            e.reply(`塔纹明灭，已推演 ${processed}/${File.length} 方道域...`);
        }
    }
    
    // 未找到目标
    if (foundTargets.length === 0) {
        e.reply([
            '塔音渐寂：',
            '"万界轮转，光阴长河...',
            '未见【' + cleanInput + '】之道痕。"',
            '',
            '或此身已殒，',
            '或此名未证诸天。'
        ].join('\n'));
        return;
    }
    
    // 找到多个目标
    if (foundTargets.length > 1) {
        let message = [
            '塔身嗡鸣，镜光分化：',
            '"一因生多果，一道化万影..."',
            '',
            `与【${cleanInput}】相契之道身有 ${foundTargets.length} 尊：`,
            ''
        ];
        
        foundTargets.slice(0, 8).forEach((t, index) => {
            // 获取目标境界信息显示
            let targetLevels = this.getTargetLevelInfo(t.data);
            message.push(`${index + 1}. ${t.name}（印记：${t.qq}）`);
            message.push(`   道境：${targetLevels.mainLevel}`);
        });
        
        if (foundTargets.length > 8) {
            message.push('');
            message.push(`...余 ${foundTargets.length - 8} 尊隐于混沌`);
        }
        
        message.push('');
        message.push('塔规：需言明印记或道号，方得唯一。');
        
        e.reply(message.join('\n'));
        return;
    }
    
    // 找到唯一目标
    const target = foundTargets[0];
    
    // 获取目标境界信息
    const targetLevelInfo = this.getTargetLevelInfo(target.data);
    
    // 获取玩家自身境界
    const playerLevelInfo = this.getTargetLevelInfo(player);
    
    // 不能推演自己
    if (target.qq === usr_qq) {
        e.reply([
            '塔音陡然森寒：',
            '"道不可自照，法不可自证。"',
            '',
            '镜中窥己，必见心魔。',
            '轻则道基崩毁，',
            '重则...',
            '',
            '（塔身隐入虚空，三息方现）'
        ].join('\n'));
        return;
    }
    
    // 境界检查 - 使用主要境界比较
    if (target.data.mijinglevel_id > player.mijinglevel_id) {
        e.reply([
            '塔纹逆流，镜面龟裂！',
            `"彼身已证 ${targetLevelInfo.mainLevel}，`,
            `尔仅 ${playerLevelInfo.mainLevel}..."`,
            '',
            '强窥上境，必遭反噬。',
            '镜碎之时，即尔道殒之刻。',
            '',
            '（一滴黑血自塔尖滴落，没入虚空）'
        ].join('\n'));
        return;
    }
    
    // ==== 新增：根据目标境界计算所需「功」值 ====
    // 计算推演消耗：练气每级100功 + 炼体每级100功 + 仙古/秘境体系每级500功
    const calculateGongCost = (targetData) => {
        let totalCost = 0;
        
        // 练气消耗：每级100功
        totalCost += (targetData.level_id || 0) * 100;
        
        // 炼体消耗：每级100功
        totalCost += (targetData.Physique_id || 0) * 100;
        
        // 取仙古和秘境体系中的较高者：每级500功
        const higherRealm = Math.max(
            targetData.mijinglevel_id || 0, 
            targetData.xiangulevel_id || 0
        );
        totalCost += higherRealm * 500;
        
        return totalCost;
    };
    
    const requiredGong = calculateGongCost(target.data);
    
    // 检查「功」值是否足够
    if (player.功 === undefined || player.功 < requiredGong) {
        e.reply([
            '塔身黯淡：',
            '"尔之"功"不足，难推诸相..."',
            '',
            '【推演消耗计算】',
            `• 练气${target.data.level_id}重：${target.data.level_id * 100}功`,
            `• 炼体${target.data.Physique_id}重：${target.data.Physique_id * 100}功`,
            `• 高阶体系：${Math.max(target.data.mijinglevel_id, target.data.xiangulevel_id) * 500}功`,
            `• 总计需：${requiredGong}点「功」`,
            '',
            `尔当前仅有：${player.功 || 0}点「功」`,
            '',
            '塔规：',
            '"推演所需功值，随境界递增。',
            '练气炼体每级需百功，',
            '仙古秘境每级需五百功。"'
        ].join('\n'));
        return;
    }
    
    // 扣除「功」值
    player.功 = (player.功 || 0) - requiredGong;
    await Write_player(usr_qq, player);
    
    // 构建奖励池
    try {
        let targetNajie = await Read_najie(target.qq);
        
        // 显示目标详细信息
        let targetDetailMsg = [
            '塔音庄严：',
            `"既见真影，当推其${target.data.mijinglevel_id >= 15 ? '道果' : '法缘'}..."`,
            '',
            '【推演消耗】',
            `• 总计：${requiredGong}点「功」`,
            `• 剩余：${player.功}点「功」`,
            '',
            '【镜中之影】',
            `• 道号：${target.name}`,
            `• 天机印记：${target.qq}`,
            `• 道境：${targetLevelInfo.mainLevel}`
        ];
        
        // 添加详细的境界信息
        targetDetailMsg.push(`• 修途：${targetLevelInfo.detailedLevels}`);
        
        e.reply(targetDetailMsg.join('\n'));
        
        // 塔灵开始复制
        setTimeout(() => {
            e.reply([
                '古塔九层，层层亮起：',
                '一层推其功法，',
                '二层演其宝库，',
                '三层算其道韵...'
            ].join('\n'));
        }, 1500);
        
        let rewardPool = {
            timestamp: Date.now(),
            targetQQ: target.qq,
            targetName: target.name,
            targetRealm: target.data.mijinglevel_id,
            operatorQQ: usr_qq,
            operatorName: player.名号,
            consumedGong: requiredGong,
            gongfaList: [],
            najieItems: [],
            randomPool: []
        };
        
        // 复制功法
        if (target.data.学习的功法 && target.data.学习的功法.length > 0) {
            target.data.学习的功法.forEach(gongfaName => {
                rewardPool.gongfaList.push({
                    name: gongfaName,
                    type: 'gongfa'
                });
                // 根据功法稀有度添加不同数量到随机池
                let entries = 1;
                if (gongfaName.includes('仙') || gongfaName.includes('神')) entries = 3;
                if (gongfaName.includes('帝') || gongfaName.includes('圣')) entries = 5;
                
                for (let i = 0; i < entries; i++) {
                    rewardPool.randomPool.push({
                        name: gongfaName,
                        type: 'gongfa',
                        rarity: entries > 1 ? '稀有' : '普通'
                    });
                }
            });
        }
        
        // 复制纳戒物品
        const najieCategories = ['丹药', '道具', '功法', '草药', '材料', '食材', '仙宠', '装备', '仙宠口粮', '盒子', '宝石'];
        
        najieCategories.forEach(category => {
            if (targetNajie[category] && targetNajie[category].length > 0) {
                targetNajie[category].forEach(item => {
                    let itemCopy = JSON.parse(JSON.stringify(item));
                    itemCopy.category = category;
                    
                    rewardPool.najieItems.push({
                        category: category,
                        item: itemCopy
                    });
                    
                    // 根据物品数量和质量决定权重
                    let weight = Math.min(Math.floor((item.数量 || 1) / 10) + 1, 10);
                    if (item.品质 && item.品质 >= 4) weight *= 2;
                    if (item.name.includes('神') || item.name.includes('仙')) weight *= 3;
                    
                    for (let i = 0; i < weight; i++) {
                        rewardPool.randomPool.push({
                            name: item.name,
                            type: category,
                            itemData: itemCopy,
                            weight: weight
                        });
                    }
                });
            }
        });
        
        // 添加修为/血气奖励
        if (target.data.修为 > 0) {
            let xiuweiAmount = Math.floor(target.data.修为 * 0.08);
            rewardPool.randomPool.push({
                name: '修为道韵',
                type: 'experience',
                amount: xiuweiAmount,
                targetType: '修为',
                weight: 2
            });
        }
        
        if (target.data.血气 > 0) {
            let xueqiAmount = Math.floor(target.data.血气 * 0.08);
            rewardPool.randomPool.push({
                name: '血气精华',
                type: 'experience',
                amount: xueqiAmount,
                targetType: '血气',
                weight: 2
            });
        }
        
        // 保存到Redis
        const redisKey = `wuxiangta:${usr_qq}:${target.qq}:${Date.now()}`;
        await redis.set(redisKey, JSON.stringify(rewardPool), 'EX', 86400);
        
        const userRewardKey = `wuxiangta:user:${usr_qq}:target`;
        await redis.set(userRewardKey, JSON.stringify({
            targetQQ: target.qq,
            targetName: target.name,
            rewardPoolKey: redisKey,
            createTime: Date.now(),
            targetRealm: target.data.mijinglevel_id,
            consumedGong: requiredGong,
            gongCostBreakdown: {
                levelCost: target.data.level_id * 100,
                physiqueCost: target.data.Physique_id * 100,
                highRealmCost: Math.max(target.data.mijinglevel_id, target.data.xiangulevel_id) * 500,
                totalCost: requiredGong
            }
        }), 'EX', 86400);
        
        // 延迟显示最终结果
        setTimeout(() => {
            let message = [
                '塔音恢弘：',
                '"诸相已推，道影已固。"',
                '',
                '【推演完成】',
                `• 道号：${target.name}`,
                `• 天机印记：${target.qq}`,
                `• 道境：${targetLevelInfo.mainLevel}`,
                `• 修途：${targetLevelInfo.detailedLevels}`,
                `• 消耗：${requiredGong}点「功」`,
                '',
                '【掠道之池】',
                `• 功法拓印：${rewardPool.gongfaList.length} 部`,
                `• 诸宝映影：${rewardPool.najieItems.length} 件`,
                `• 道韵碎片：${rewardPool.randomPool.length} 缕`,
                '',
                '塔规昭昭：',
                '"胜者，可取其一而归。"',
                '',
                '【道争启】',
                '以 #道争虚影 入塔论道。',
                '',
                '（此影存世：一日光阴）'
            ];
            
            e.reply(message.join('\n'));
        }, 2000);
        
    } catch (error) {
        console.error('推演诸相出错：', error);
        // 出错时返还功值
        player.功 = (player.功 || 0) + requiredGong;
        await Write_player(usr_qq, player);
        
        e.reply([
            '塔身剧震！',
            '"万界逆流，光阴错乱..."',
            '',
            '（一道裂痕自塔基蔓延而上）',
            `推演中断，${requiredGong}点「功」已返还。`,
            '',
            '塔音："因果错乱，需待时光平复..."'
        ].join('\n'));
    }
}
async daozhengXuying(e) {
    if (!e.isGroup) {
        e.reply('塔内秘境，需在群中方可入内。');
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('凡尘未踏，何谈道争？先证己身。');
        return;
    }
    
    let player = await Read_player(usr_qq);
    
    // ==== 检查功极无相塔绑定状态 ====
    if (player.功极无相塔 !== 1) {
        e.reply([
            '塔身沉寂：',
            '"尔之真灵未缚，如何入塔？"',
            '',
            '需先以真灵与塔相缚，',
            '方可在塔中与诸天虚影道争。'
        ].join('\n'));
        return;
    }
    
    // ==== 检查是否有未完成的推演 ====
    const userRewardKey = `wuxiangta:user:${usr_qq}:target`;
    const rewardInfoStr = await redis.get(userRewardKey);
    
    if (!rewardInfoStr) {
        e.reply([
            '塔音空灵：',
            '"塔中无影，何来道争？"',
            '',
            '需先以 #推演诸相 映照目标，',
            '方可在塔中与其虚影论道。'
        ].join('\n'));
        return;
    }
    
    const rewardInfo = JSON.parse(rewardInfoStr);
    
    // ==== 检查奖励池是否存在 ====
    const rewardPoolStr = await redis.get(rewardInfo.rewardPoolKey);
    if (!rewardPoolStr) {
        e.reply([
            '塔身微震：',
            '"虚影已散，道痕不存..."',
            '',
            '推演结果已过时效（24小时），',
            '请重新推演。'
        ].join('\n'));
        await redis.del(userRewardKey);
        return;
    }
    
    const rewardPool = JSON.parse(rewardPoolStr);
    
    // ==== 检查目标是否存在 ====
    const targetExist = await existplayer(rewardInfo.targetQQ);
    if (!targetExist) {
        e.reply([
            '塔音低沉：',
            '"此身已殒，道痕消散..."',
            '',
            '目标修士已不存在，',
            '虚影随之溃散。'
        ].join('\n'));
        await redis.del(userRewardKey);
        await redis.del(rewardInfo.rewardPoolKey);
        return;
    }
    
    // ==== 检查玩家状态 ====
    if (player.当前血量 <= player.血量上限 * 0.1) {
        e.reply([
            '塔灵警示：',
            '"尔气血亏虚，不宜论道。"',
            '',
            '先养伤恢复，再入塔道争。'
        ].join('\n'));
        return;
    }
    
    // ==== 道争过程 ====
    try {
        // 读取目标玩家数据
        const targetPlayer = await Read_player(rewardInfo.targetQQ);
        
        e.reply([
            '塔门洞开，',
            '无尽阶梯延伸至虚空深处。',
            '',
            '塔音如钟：',
            `"道争之地，${rewardInfo.targetName}之影已候。"`,
            '"胜者存，败者殒，天地为证。"',
            '',
            '尔之身影没入塔中...'
        ].join('\n'));
        
        // 等待片刻，模拟进入塔中
        await this.sleep(2000);
        
        e.reply([
            '塔内轰鸣！',
            '道法碰撞，法则崩碎...',
            '',
            '（三息之后）'
        ].join('\n'));
        
        // 等待战斗过程
        await this.sleep(1500);
        
        // ==== 使用zd_battle函数进行战斗判定 ====
        // 确保玩家对象包含必要的属性
        player.法球倍率 = player.灵根?.法球倍率 || 1;
        targetPlayer.法球倍率 = targetPlayer.灵根?.法球倍率 || 1;
        
        const battleResult = await zd_battle(player, targetPlayer);
        
        // 转发战斗过程
        if (battleResult.msg && battleResult.msg.length > 0) {
            await ForwardMsg(e, battleResult.msg);
        }
        
        const isWin = battleResult.winner === 'A';
        const isDefeated = battleResult.winner === 'B';
        
        if (isWin) {
            // ==== 胜利处理 ====
            await this.handleVictory(e, player, rewardInfo, rewardPool);
        } else if (isDefeated) {
            // ==== 失败处理 ====
            await this.handleDefeat(e, player, rewardInfo);
        } else {
            e.reply([
                '塔身剧震！',
                '"时空错乱，因果崩坏..."',
                '',
                '战斗结果无法判定，',
                '道争中断，虚影消散。'
            ].join('\n'));
        }
        
        // 更新玩家血量
        if (battleResult.A_hp !== undefined) {
            player.当前血量 = await Set_HP(usr_qq, battleResult.A_hp);
        }
        
        // 清理Redis数据
        await redis.del(userRewardKey);
        await redis.del(rewardInfo.rewardPoolKey);
        
    } catch (error) {
        console.error('道争虚影出错：', error);
        e.reply([
            '塔身剧震！',
            '"时空错乱，因果崩坏..."',
            '',
            '（一道空间裂缝吞噬了虚影）',
            '道争中断，虚影消散。'
        ].join('\n'));
    }
}

// 计算战斗结果
calculateBattleResult(player, target) {
    // 基础胜率计算
    let baseWinRate = 0.5;
    
    // 境界差距影响
    const realmDiff = player.mijinglevel_id - target.mijinglevel_id;
    if (realmDiff > 0) {
        // 境界高于目标，增加胜率
        baseWinRate += realmDiff * 0.1;
    } else if (realmDiff < 0) {
        // 境界低于目标，降低胜率
        baseWinRate += realmDiff * 0.15;
    }
    
    // 攻击力影响
    const atkDiff = (player.攻击 - target.攻击) / Math.max(player.攻击, target.攻击);
    baseWinRate += atkDiff * 0.2;
    
    // 防御力影响
    const defDiff = (player.防御 - target.防御) / Math.max(player.防御, target.防御);
    baseWinRate += defDiff * 0.1;
    
    // 血量影响
    const hpDiff = (player.当前血量 - target.当前血量) / Math.max(player.当前血量, target.当前血量);
    baseWinRate += hpDiff * 0.1;
    
    // 随机因素
    const randomFactor = (Math.random() - 0.5) * 0.2;
    baseWinRate += randomFactor;
    
    // 确保胜率在0.05到0.95之间
    baseWinRate = Math.max(0.05, Math.min(0.95, baseWinRate));
    
    // 判定胜负
    return Math.random() < baseWinRate;
}

// 胜利处理
async handleVictory(e, player, rewardInfo, rewardPool) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    
    // ==== 计算可以具现的物品数量 ====
    // 基础1个 + 每多消耗5000功增加1个（最大5个）
    const baseCost = rewardInfo.consumedGong || 100;
    const extraItems = Math.min(Math.floor(baseCost / 5000), 4); // 最多额外4个
    const totalItems = 1 + extraItems;
    
    e.reply([
        '塔门再开，',
        '一道身影踉跄而出，',
        '手中握着数缕道韵光点...',
        '',
        '塔音缥缈：',
        '"道争已毕，胜者...当取掠物。"',
        '',
        `【胜利奖励】`,
        `可具现物品数：${totalItems}件`,
        `（消耗${baseCost}功，获得${totalItems}次具现机会）`
    ].join('\n'));
    
    // 显示可具现的物品列表
    const availableItems = this.getAvailableItems(rewardPool);
    
    // 如果奖励池为空
    if (availableItems.length === 0) {
        e.reply([
            '',
            '塔音遗憾：',
            '"此影身无长物，无可掠取。"',
            '',
            '（虚影溃散，化作点点光雨）',
            '',
            '尔之「功」未白费，道心略有精进。'
        ].join('\n'));
        return;
    }
    
    // 随机抽取指定数量的物品
    const selectedItems = this.selectRandomItems(availableItems, totalItems);
    
    // 计算具现所需的功值（每个物品消耗推演消耗的20%）
    const costPerItem = Math.ceil(baseCost * 0.2);
    const totalCost = costPerItem * selectedItems.length;
    
    // 检查功值是否足够
    if (player.功 < totalCost) {
        e.reply([
            '塔音低沉：',
            `"尔之"功"不足具现所有掠物..."`,
            '',
            `需${totalCost}点「功」具现${selectedItems.length}件物品，`,
            `尔当前仅有：${player.功}点「功」`,
            '',
            '可选择性具现部分物品。',
            '使用 #具现选择 [序号] 来选择要具现的物品。'
        ].join('\n'));
        
        // 保存可选择的物品列表
        const selectKey = `wuxiangta:select:${usr_qq}:${Date.now()}`;
        await redis.set(selectKey, JSON.stringify({
            items: selectedItems,
            costPerItem: costPerItem,
            totalCost: totalCost,
            maxSelect: Math.floor(player.功 / costPerItem)
        }), 'EX', 3600); // 1小时有效
        
        await redis.set(`wuxiangta:user:${usr_qq}:selection`, selectKey, 'EX', 3600);
        
        // 显示可选择物品
        const itemList = selectedItems.map((item, index) => {
            return `${index + 1}. ${item.name}（需${costPerItem}功）`;
        }).join('\n');
        
        e.reply([
            '【可选择物品】',
            itemList,
            '',
            `当前「功」值：${player.功}`,
            `可具现数量：${Math.floor(player.功 / costPerItem)}/${selectedItems.length}`,
            '',
            '指令：#具现选择 [序号]',
            '示例：#具现选择 1 3 5'
        ].join('\n'));
        
        return;
    }
    
    // 功值足够，直接具现所有物品
    await this.manifestItems(e, player, selectedItems, costPerItem, totalCost);
}

// 获取可具现的物品列表
getAvailableItems(rewardPool) {
    const items = [];
    
    // 添加功法
    if (rewardPool.gongfaList && rewardPool.gongfaList.length > 0) {
        rewardPool.gongfaList.forEach(gongfa => {
            items.push({
                type: '功法',
                name: gongfa.name,
                data: gongfa
            });
        });
    }
    
    // 添加纳戒物品
    if (rewardPool.najieItems && rewardPool.najieItems.length > 0) {
        rewardPool.najieItems.forEach(itemInfo => {
            items.push({
                type: itemInfo.category,
                name: itemInfo.item.name,
                data: itemInfo.item,
                quantity: itemInfo.item.数量 || 1
            });
        });
    }
    
    // 添加修为/血气
    if (rewardPool.randomPool && rewardPool.randomPool.length > 0) {
        rewardPool.randomPool.forEach(item => {
            if (item.type === 'experience') {
                items.push({
                    type: '修为',
                    name: item.name,
                    data: item,
                    amount: item.amount || 0
                });
            } else if (item.type !== 'gongfa') {
                items.push({
                    type: item.type,
                    name: item.name,
                    data: item.itemData || item,
                    quantity: item.itemData?.数量 || 1
                });
            }
        });
    }
    
    return items;
}

// 随机抽取指定数量的物品
selectRandomItems(items, count) {
    if (items.length <= count) {
        return [...items]; // 返回所有物品的副本
    }
    
    // 随机抽取
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// 具现物品
async manifestItems(e, player, items, costPerItem, totalCost) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    let manifestResults = [];
    
    // 扣除功值
    player.功 -= totalCost;
    await Write_player(usr_qq, player);
    
    // 具现每个物品
    for (const item of items) {
        try {
            let result = '';
            
            switch (item.type) {
                case '功法':
                    // 学习功法
                    if (!player.学习的功法.includes(item.name)) {
                        player.学习的功法.push(item.name);
                        result = `领悟功法【${item.name}】`;
                    } else {
                        // 如果已学习，转化为修为
                        const xiuweiGain = Math.floor(costPerItem * 10);
                        player.修为 = (player.修为 || 0) + xiuweiGain;
                        result = `功法【${item.name}】已掌握，转化为修为${xiuweiGain}`;
                    }
                    break;
                    
                case '修为':
                    // 增加修为
                    const xiuweiAmount = item.amount || Math.floor(costPerItem * 5);
                    player.修为 = (player.修为 || 0) + xiuweiAmount;
                    result = `获得${item.name}：${bigNumberTransform(xiuweiAmount)}`;
                    break;
                    
                case '血气':
                    // 增加血气
                    const xueqiAmount = item.amount || Math.floor(costPerItem * 5);
                    player.血气 = (player.血气 || 0) + xueqiAmount;
                    result = `获得${item.name}：${bigNumberTransform(xueqiAmount)}`;
                    break;
                    
                default:
                    // 添加物品到纳戒
                    const quantity = item.quantity || 1;
                    await Add_najie_thing(usr_qq, item.name, item.type, quantity);
                    result = `获得【${item.name}】×${quantity}`;
                    break;
            }
            
            manifestResults.push(result);
            
        } catch (error) {
            console.error(`具现物品 ${item.name} 失败：`, error);
            manifestResults.push(`具现【${item.name}】失败`);
        }
    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 发送结果
    const resultMsg = [
        '塔音庄严：',
        '"以功为引，化虚为实！"',
        '',
        '【具现结果】',
        `消耗「功」：${totalCost}点`,
        `剩余「功」：${player.功}点`,
        '',
        '【获得物品】',
        ...manifestResults,
        '',
        '（虚影彻底消散，化作精纯道韵）',
        '塔音："道争已毕，因果了结..."'
    ].join('\n');
    
    e.reply(resultMsg);
}

// 失败处理
async handleDefeat(e, player, rewardInfo) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    
    // 失败惩罚：扣除10%当前血量
    const hpLoss = Math.floor(player.当前血量 * 0.1);
    player.当前血量 = Math.max(1, player.当前血量 - hpLoss);
    
    // 随机扣除少量功值（0-10%）
    const gongLoss = Math.floor((player.功 || 0) * Math.random() * 0.1);
    player.功 = Math.max(0, (player.功 || 0) - gongLoss);
    
    await Write_player(usr_qq, player);
    
    e.reply([
        '塔门骤闭！',
        '',
        '塔音冰冷：',
        `"败者...当付代价。"`,
        '',
        `（尔之气血被削去${hpLoss}点）`,
        gongLoss > 0 ? `（${gongLoss}点「功」被虚影掠夺）` : '',
        '',
        '塔身隐去，',
        '只余一缕血雾飘散...',
        '',
        '剩余血量：' + bigNumberTransform(player.当前血量),
        '剩余「功」值：' + (player.功 || 0)
    ].join('\n'));
}



async manifestSelection(e) {
    if (!e.isGroup) {
        e.reply('此指令需在群聊中使用。');
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let player = await Read_player(usr_qq);
    
    // 获取选择信息
    const selectionKey = await redis.get(`wuxiangta:user:${usr_qq}:selection`);
    if (!selectionKey) {
        e.reply('无可选择具现的物品，或选择已过期。');
        return;
    }
    
    const selectionStr = await redis.get(selectionKey);
    if (!selectionStr) {
        e.reply('选择信息已失效，请重新道争。');
        await redis.del(`wuxiangta:user:${usr_qq}:selection`);
        return;
    }
    
    const selection = JSON.parse(selectionStr);
    
    // 解析选择参数
    const match = e.msg.match(/^#具现选择(?:\s+(.+))?$/i);
    if (!match || !match[1]) {
        // 显示可选择的物品列表
        const itemList = selection.items.map((item, index) => {
            return `${index + 1}. ${item.name}（需${selection.costPerItem}功）`;
        }).join('\n');
        
        e.reply([
            '【可选择物品】',
            itemList,
            '',
            `当前「功」值：${player.功}`,
            `单件消耗：${selection.costPerItem}功`,
            `可具现数量：${selection.maxSelect}/${selection.items.length}`,
            '',
            '指令：#具现选择 [序号]',
            '示例：#具现选择 1 3 5',
            '注意：序号间用空格分隔'
        ].join('\n'));
        return;
    }
    
    // 解析选择的序号
    const choices = match[1].trim().split(/\s+/).map(num => parseInt(num) - 1);
    
    // 验证选择
    const validChoices = [];
    for (const choice of choices) {
        if (choice >= 0 && choice < selection.items.length) {
            if (!validChoices.includes(choice)) {
                validChoices.push(choice);
            }
        }
    }
    
    if (validChoices.length === 0) {
        e.reply('序号无效，请重新选择。');
        return;
    }
    
    if (validChoices.length > selection.maxSelect) {
        e.reply(`「功」值不足，最多可选择${selection.maxSelect}件物品。`);
        return;
    }
    
    // 计算总消耗
    const totalCost = selection.costPerItem * validChoices.length;
    
    if (player.功 < totalCost) {
        e.reply(`「功」值不足，需要${totalCost}点，当前仅有${player.功}点。`);
        return;
    }
    
    // 获取选择的物品
    const selectedItems = validChoices.map(index => selection.items[index]);
    
    // 执行具现
    await this.manifestItems(e, player, selectedItems, selection.costPerItem, totalCost);
    
    // 清理选择数据
    await redis.del(selectionKey);
    await redis.del(`wuxiangta:user:${usr_qq}:selection`);
}

// 辅助函数：睡眠
sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// 辅助函数：获取目标的境界信息
getTargetLevelInfo(playerData) {
    let result = {
        mainLevel: '',
        detailedLevels: ''
    };
    
    // 获取练气境界
    let 练气 = data.Level_list.find(item => item.level_id == playerData.level_id);
    let 炼体 = data.LevelMax_list.find(item => item.level_id == playerData.Physique_id);
    let 秘境体系 = data.Levelmijing_list.find(item => item.level_id == playerData.mijinglevel_id);
    let 仙古今世法 = data.xiangujinshi_list.find(item => item.level_id == playerData.xiangulevel_id);
    
    // 设置主要境界（以秘境体系为主）
    result.mainLevel = 秘境体系 && 秘境体系.level ? 秘境体系.level : `秘境${playerData.mijinglevel_id}重天`;
    
    // 构建详细境界字符串
    let levelParts = [];
    
    if (练气 && 练气.level) {
        levelParts.push(`练气:${练气.level}`);
    }
    
    if (炼体 && 炼体.level) {
        levelParts.push(`炼体:${炼体.level}`);
    }
    
    // 只有秘境体系和仙古今世法不是1级时才显示
    if (playerData.mijinglevel_id > 1 && 秘境体系 && 秘境体系.level) {
        levelParts.push(`秘境:${秘境体系.level}`);
    }
    
    if (playerData.xiangulevel_id > 1 && 仙古今世法 && 仙古今世法.level) {
        levelParts.push(`仙古:${仙古今世法.level}`);
    }
    
    // 如果境界信息都为空，显示默认
    if (levelParts.length === 0) {
        result.detailedLevels = '凡尘未启';
    } else {
        result.detailedLevels = levelParts.join(' | ');
    }
    
    return result;
}


}
 
