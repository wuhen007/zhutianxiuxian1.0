import { plugin, verc, data } from '../../api/api.js';
import {
  Read_player,
  existplayer,
  exist_najie_thing,
  foundthing,
  re_najie_thing,
  Write_najie,
  sleep,
  synchronization,
  Synchronization_ASS,
  Add_灵石,
  Add_najie_thing,
  Add_修为,
   Add_饱食度,
  Add_寿元,
  Add_player_学习功法,
  Add_血气,
   Add_HP,
  __PATH,
  instead_equipment,
  Read_najie,
  get_equipment_img,
  get_log_img,
  isNotNull,
  Write_player,
  channel
} from '../../model/xiuxian.js';

import {
  dataall,
  readall,
  allwupin,
  alluser
} from '../../model/duanzaofu.js';
export class UserSellAll extends plugin {
  constructor() {
    super({
      name: 'UserSellAll',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#一键出售(.*)$',
          fnc: 'Sell_all_comodities',
        },
        {
          reg: '^#一键服用修为丹$',
          fnc: 'all_xiuweidan',
        },
        {
          reg: '^#一键服用血气丹$',
          fnc: 'all_xueqidan',
        },
                {
          reg: '^#一键服用天药$',
          fnc: 'all_yuanshen',
        },
        {
          reg: '^#一键学习$',
          fnc: 'all_learn',
        },
        {
          reg: '^#一键同步$',
          fnc: 'all_tongbu',
        },
        {
          reg: '^#(锁定|解锁).*$',
          fnc: 'locked',
        },
        {
          reg: '^#一键回收(.*)$',
          fnc: 'Sell_all_huishou',
        },
        {
          reg: '^#一键赠送(.*)$',
          fnc: 'all_give',
        },
        {
          reg: '^#一键锁定(.*)$',
          fnc: 'all_locked',
        },
        {
          reg: '^#一键解锁(.*)$',
          fnc: 'all_unlocked',
        },
        {
          reg: '^#一键装备$',
          fnc: 'all_zhuangbei',
        },
        {
          reg: '^#物品升级',
          fnc: 'upall',
        },
         {
           reg: '^#练气皮肤同步',
           fnc: 'ul',
         },
          {
                    reg: '^#一键服用神药$',
                    fnc: 'all_shenyao'
                },
                 {   reg: '^#一键卖矿石$',
                    fnc: 'sellMineral'
                },
                {   reg: '^#一键卖钞票$',
                    fnc: 'sellchaopiao'
                },
                 {   reg: '^#一键服用食材$',
                    fnc: 'all_food'
                },
             {   reg: '^#一键回血$',
                    fnc: 'all_huixue'
                },
                {
    reg: '^#一键消耗结算卡$',
    fnc: 'quickSettleDungeon'
}
      ],
    });

  }
async quickSettleDungeon(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const processed_qq = await channel(usr_qq);
    
    // 检查玩家是否存在
    if (!await existplayer(processed_qq)) {
        e.reply("当前位面无存档");
        return false;
    }
    
    // 检查玩家是否有进行中的探索
    let action = await redis.get('xiuxian:player:' + processed_qq + ':action');
    if (!action) {
        e.reply("没有进行中的副本探索");
        return false;
    }
    
    action = JSON.parse(action);
    const now_time = new Date().getTime();
    
    // 检查是否在探索状态
    const inAction = action.Place_action === '0' || action.Place_actionplus === '0';
    if (!inAction) {
        e.reply("当前不在副本探索中，无法结算");
        return false;
    }
    
    // 确定结束时间
    let end_time;
    if (action.end_time) {
        // 普通副本（禁地历练）结构
        end_time = action.end_time;
    } else if (action.Place_actionplus === '0' && action.start_time && action.total_time) {
        // 沉迷副本（秘境历练）结构
        end_time = action.start_time + action.total_time * 60 * 1000;
    } else {
        console.error("无法确定结束时间:", action);
        e.reply("探索状态异常，无法结算");
        return false;
    }
    
    // 确保结束时间是有效数字
    if (isNaN(end_time)) {
        console.error("无效的结束时间:", end_time);
        e.reply("探索状态异常，无法结算");
        return false;
    }
    
    // 检查探索是否已结束
    if (now_time >= end_time) {
        e.reply("副本探索已结束，无需结算");
        return false;
    }
    
    // 计算剩余时间（毫秒）
    const remainingTime = end_time - now_time;
    
    // 确保剩余时间是有效数字
    if (isNaN(remainingTime) || remainingTime <= 0) {
        console.error("无效的剩余时间:", remainingTime);
        e.reply("探索状态异常，无法结算");
        return false;
    }
    
    // 定义结算卡映射表（按价值从低到高排序）
    const settlementCards = [
        {name: "凡品秘境结算卡", value: 30000},       // 0.5分钟
        {name: "玄品秘境结算卡", value: 60000},       // 1分钟
        {name: "灵品秘境结算卡", value: 180000},      // 3分钟
        {name: "仙品秘境结算卡", value: 300000},      // 5分钟
        {name: "圣品秘境结算卡", value: 600000},      // 10分钟
        {name: "帝品秘境结算卡", value: 1800000}      // 30分钟
    ];
    
    let totalReduce = 0;
    let usedCards = {};
    let remaining = remainingTime;
    
    // 智能使用结算卡 - 优先使用低价值卡片
    for (const card of settlementCards) {
        if (remaining <= 0) break; // 剩余时间为0，停止使用卡片
        
        try {
            // 获取该卡片在背包中的数量
            const cardCount = await exist_najie_thing(processed_qq, card.name, "道具");
            
            // 确保卡片数量是有效数字
            const validCardCount = safeNumber(cardCount);
            if (validCardCount <= 0) continue;
            
            // 确保卡片价值是有效数字
            if (isNaN(card.value) || card.value <= 0) {
                console.error(`无效的卡片价值: ${card.name} = ${card.value}`);
                continue;
            }
            
            // 计算需要使用的卡片数量
            const cardsNeeded = Math.min(
                validCardCount, // 背包中有的数量
                Math.floor(remaining / card.value) // 需要覆盖剩余时间的数量
            );
            
            // 如果没有需要使用的卡片，跳过
            if (cardsNeeded <= 0) continue;
            
            // 计算实际减少的时间
            const cardReduce = Math.min(remaining, cardsNeeded * card.value);
            
            // 更新剩余时间
            remaining -= cardReduce;
            totalReduce += cardReduce;
            
            // 记录使用的卡片
            usedCards[card.name] = cardsNeeded;
            
            // 消耗卡片
            await Add_najie_thing(processed_qq, card.name, "道具", -cardsNeeded);
        } catch (err) {
            console.error(`处理卡片 ${card.name} 时出错:`, err);
        }
    }
    
    // 如果没有使用任何结算卡
    if (totalReduce === 0) {
        e.reply("背包中没有可用的秘境结算卡");
        return false;
    }
    
    // 确保减少的时间是有效数字
    if (isNaN(totalReduce) || totalReduce <= 0) {
        console.error("无效的减少时间:", totalReduce);
        e.reply("结算失败，请重试");
        return false;
    }
    
    // 根据副本类型处理时间减少
    if (action.Place_actionplus === '0') {
        // 沉迷副本：减少总时间（分钟）
        const reduceMinutes = totalReduce / (60 * 1000);
        action.total_time -= reduceMinutes;
        
        // 重新计算结束时间
        end_time = action.start_time + action.total_time * 60 * 1000;
        
        // 重新计算下一次结算时间
        if (action.next_settle_time) {
            // 确保结算间隔不低于1分钟
            const minInterval = 60 * 1000; // 1分钟
            const calculatedInterval = action.total_time * 60 * 1000 / action.total_count;
            const interval = Math.max(minInterval, calculatedInterval);
            
            action.interval = interval;
            action.next_settle_time = now_time + interval;
        }
    } else {
        // 普通副本：直接减少结束时间
        action.end_time -= totalReduce;
        end_time = action.end_time;
    }
    
    // 更新Redis
    await redis.set('xiuxian:player:' + processed_qq + ':action', JSON.stringify(action));
    
    // 计算减少的时间（分钟）
    const reduceMinutes = (totalReduce / 60000).toFixed(1);
    
    // 构建回复消息
    let msg = "【秘境结算·仙力催动】\n";
    msg += "你祭出秘境结算卡，引发时空波动，加速副本探索！\n\n";
    
    // 列出使用的卡片
    if (Object.keys(usedCards).length > 0) {
        msg += " 使用结算卡：\n";
        for (const [cardName, quantity] of Object.entries(usedCards)) {
            // 确保数量是有效数字
            const validQuantity = safeNumber(quantity);
            if (validQuantity > 0) {
                msg += `▸ ${cardName} x${validQuantity}\n`;
            }
        }
    }
    
    // 添加时间减少信息
    msg += `\n 时间加速：${reduceMinutes}分钟`;
    
    // 添加剩余时间
    const newRemaining = end_time - now_time;
    const formattedTime = formatTime(newRemaining);
    
    msg += `\n\n 剩余探索时间：${formattedTime}`;
    
    // 仙侠风格提示
    if (totalReduce >= remainingTime) {
        msg += `\n\n 仙力浩荡！副本探索已完成！`;
    } else if (totalReduce / remainingTime > 0.7) {
        msg += `\n\n 仙力澎湃！副本探索进程已大幅推进！`;
    } else if (totalReduce / remainingTime > 0.3) {
        msg += `\n\n 仙力流转！副本探索进程稳步推进！`;
    } else {
        msg += `\n\n 时空涟漪荡漾，秘境探索加速进行`;
    }
    
    e.reply(msg);
    return true;
}








  async all_food(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const processed_qq = await channel(usr_qq);
    
    // 检查玩家是否存在
    if (!await existplayer(processed_qq)) {
        e.reply("当前位面无存档");
        return false;
    }
    
    // 获取玩家纳戒数据
    const najie = await data.getData('najie', processed_qq);
    
    // 定义食材饱食度映射表
    const foodSatietyMap = {
        "生肉": 2,
        "熟肉": 4,
        "鱼肉": 2,
        "烤鱼": 4,
        "苹果": 2,
        "西瓜": 1,
        "土豆": 1,
        "烤土豆": 3,
        "胡萝卜": 2,
        "面包": 3,
        "紫颂果": 150,
        "灵橘": 10,
        "仙馐果": 10
    };
    
    // 特殊食材处理（如腐肉）
    const specialFoodMap = {
        "腐肉": {
            satiety: 2,
            effect: async (quantity, player) => {
                await Add_HP(processed_qq, -500000 * quantity);
                return `，但腐肉有毒，血量减少${500000 * quantity}点`;
            }
        }
    };
    
    let totalSatiety = 0;
    let consumedItems = [];
    let specialEffects = [];
    
    // 遍历纳戒中的食材
    for (const item of najie.食材) {
        const foodName = item.name;
        
        // 检查是否是有效食材
        if (foodSatietyMap[foodName] || specialFoodMap[foodName]) {
            // 获取食材数量
            const quantity = await exist_najie_thing(processed_qq, foodName, "食材");
            
            if (quantity > 0) {
                // 计算饱食度增加值
                let satietyValue = 0;
                
                if (foodSatietyMap[foodName]) {
                    satietyValue = foodSatietyMap[foodName] * quantity;
                } else if (specialFoodMap[foodName]) {
                    satietyValue = specialFoodMap[foodName].satiety * quantity;
                }
                
                totalSatiety += satietyValue;
                
                // 处理特殊效果
                if (specialFoodMap[foodName]) {
                    const player = await Read_player(processed_qq);
                    const effectMsg = await specialFoodMap[foodName].effect(quantity, player);
                    specialEffects.push(`- ${foodName} x${quantity}${effectMsg}`);
                } else {
                    consumedItems.push(`- ${foodName} x${quantity}`);
                }
                
                // 消耗食材
                await Add_najie_thing(processed_qq, foodName, "食材", -quantity);
            }
        }
    }
    
    // 如果没有消耗任何食材
    if (totalSatiety === 0) {
        e.reply("纳戒中没有可服用的食材");
        return false;
    }
    
    // 增加饱食度
    await Add_饱食度(processed_qq, totalSatiety);
    
    // 构建回复消息
    let msg = "【一键服用食材】\n";
    msg += " 你大快朵颐，服用了以下食材：\n";
    
    if (consumedItems.length > 0) {
        msg += consumedItems.join("\n") + "\n";
    }
    
    if (specialEffects.length > 0) {
        msg += specialEffects.join("\n") + "\n";
    }
    
    msg += `\n 饱食度增加：${totalSatiety}点`;
    
    e.reply(msg);
    return true;
}
  //#(装备|服用|使用)物品*数量
  async all_xueqidan(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    //检索方法
    let najie = await data.getData('najie', usr_qq);
    let xueqi = 0;
     if (player.mijinglevel_id>19 && player.xiangulevel_id > 19) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
      }
    for (var l of najie.丹药) {
      if (l.type == '血气') {
        //纳戒中的数量
        let quantity = await exist_najie_thing(usr_qq, l.name, l.class);
        await Add_najie_thing(usr_qq, l.name, l.class, -quantity);
        xueqi = xueqi + l.xueqi * quantity;
      }
    }
    await Add_血气(usr_qq, xueqi);
    e.reply(`服用成功,血气增加${xueqi}`);
    return false;
  }
   async all_huixue(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) return;
    
    const player = await Read_player(usr_qq);
    const needHP = player.血量上限 - player.当前血量;
    
    if (needHP <= 0) {
        e.reply(`当前气血充盈，无需回血`);
        return false;
    }
    
    const najie = await data.getData("najie", usr_qq);
    let bestPill = null;
    let bestEfficiency = 0; // 效率=单颗回复量/丹药价值
    
    // 遍历所有回血丹药，选择性价比最高的
    for (const pill of najie.丹药) {
        if (pill.type === '血量') {
            // 计算单颗实际回复量（与单独服用逻辑一致）
            const singleRecover = Math.min(
                player.血量上限 * (pill.HPp || 0) + (pill.HP || 0),
                player.血量上限 - player.当前血量
            );
            
            // 计算效率（回复量/价值）
            const efficiency = singleRecover / (pill.出售价 || 1);
            
            if (efficiency > bestEfficiency) {
                bestEfficiency = efficiency;
                bestPill = pill;
            }
        }
    }
    
    if (!bestPill) {
        e.reply(`纳戒中无回血丹药`);
        return false;
    }
    
    // 计算单颗实际回复量
    const singleRecover = Math.min(
        player.血量上限 * (bestPill.HPp || 0) + (bestPill.HP || 0),
        player.血量上限 - player.当前血量
    );
    
    // 计算需要数量
    let quantity = Math.ceil(needHP / singleRecover);
    const available = await exist_najie_thing(usr_qq, bestPill.name, bestPill.class);
    
    if (quantity > available) {
        quantity = available;
    }
    
    // 实际回复量（不超过需要量）
    const recoverHP = Math.min(quantity * singleRecover, needHP);
    
    // 更新数据
    await Add_najie_thing(usr_qq, bestPill.name, bestPill.class, -quantity);
    await Add_HP(usr_qq, recoverHP);
    
    // 获取更新后的玩家数据
    const updatedPlayer = await Read_player(usr_qq);
    const hpPercent = (updatedPlayer.当前血量 / updatedPlayer.血量上限 * 100).toFixed(1);
    
    e.reply([
        `【丹药回元·气血归真】`,
        `服用 ${bestPill.name} ×${quantity}`,
        `气血回复：+${recoverHP.toLocaleString()}`,
        `当前气血：${updatedPlayer.当前血量.toLocaleString()}/${updatedPlayer.血量上限.toLocaleString()} (${hpPercent}%)`,
    ].join("\n"));
    
    return false;
}
        
async all_shenyao(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;
    
    let player = await Read_player(usr_qq);
    let najie = await data.getData("najie", usr_qq);
    
    let xiuwei = 0;
    let xueqi = 0;
    let shouyuanAdd = 0;             
    let actualShouyuanAdd = 0;       
    let suppressedShouyuanAdd = 0;   
    
    // 新增道伤修复相关变量
    let daoshangMsg = "";         // 道伤修复消息
    let usedXiuwei = 0;           // 用于修复道伤的修为
    let usedXueqi = 0;            // 用于修复道伤的血气
    let repairAmount = 0;         // 本次修复的道伤量
    
    // 临时存储需要消耗的神药
    let consumeList = [];
    
    // 高境界检查
    if (player.mijinglevel_id > 19 && player.xiangulevel_id > 19) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
    }
    
    // 遍历所有神药并计算效果
    for (let l of najie.丹药) {
        if (l.type === '神药') {
            let quantity = await exist_najie_thing(usr_qq, l.name, l.class);
            if (quantity <= 0) continue;
            
            // 添加消耗项
            consumeList.push({name: l.name, class: l.class, quantity});
            
            // 计算修为和血气
            xiuwei += l.exp * quantity;
            xueqi += l.xueqi * quantity;
            
            // 计算理论寿元增加
            shouyuanAdd += l.exp / 10000 * quantity;
        }
    }
    
    // ==== 道伤修复逻辑 ====
    if (player.道伤 && player.道伤 > 0) {
        // 计算修复道伤所需的总资源
        const levelSum = player.mijinglevel_id * player.xiangulevel_id;
        const requiredPerLevel = 950000000; // 每级需要1500万修为/血气
        const totalRequired = levelSum * requiredPerLevel;
        
        // 初始化道伤修复度（如果不存在）
        if (!player.道伤修复度) {
            player.道伤修复度 = 0;
        }
        
        // 计算还需要多少资源来完全修复道伤
        const remainingRequired = totalRequired - player.道伤修复度;
        
        if (remainingRequired > 0) {
            // 计算本次可以用于修复的资源
            const availableXiuwei = Math.min(xiuwei, remainingRequired);
            const availableXueqi = Math.min(xueqi, remainingRequired);
            
            // 实际使用的资源（取两者中较小的，确保平衡使用）
            usedXiuwei = Math.min(availableXiuwei, availableXueqi);
            usedXueqi = usedXiuwei;
            
            // 更新道伤修复度
            player.道伤修复度 += usedXiuwei + usedXueqi;
            repairAmount = usedXiuwei + usedXueqi;
            
            // 检查是否完全修复
            if (player.道伤修复度 >= totalRequired) {
                player.道伤 = 0; // 清除道伤
                delete player.道伤修复度; // 删除修复度属性
                daoshangMsg = `\n道伤已完全修复！`;
            } else {
                const repairPercent = Math.floor((player.道伤修复度 / totalRequired) * 100);
                daoshangMsg = `\n道伤修复进度: ${repairPercent}% (${player.道伤修复度.toLocaleString()}/${totalRequired.toLocaleString()})`;
            }
        }
    }
    // ==== 道伤修复结束 ====
    
    // 处理寿元增加逻辑
    let suppressMsg = "";
    if (shouyuanAdd > 0) {
        if (player.压制寿元) {
            // 压制状态下：
            const currentShouyuan = player.寿元 || 0;
            const availableCapacity = 9999 - currentShouyuan;
            
            if (shouyuanAdd > availableCapacity) {
                actualShouyuanAdd = availableCapacity;
            } else {
                actualShouyuanAdd = shouyuanAdd;
            }
            
            suppressedShouyuanAdd = shouyuanAdd;
            player.寿元 = Math.min(9999, currentShouyuan + actualShouyuanAdd);
            
            if (actualShouyuanAdd < shouyuanAdd) {
                suppressMsg = `\n【寿元压制】处于绝灵时代，寿命上限9999年。本次增加${actualShouyuanAdd}年（理论${shouyuanAdd}年）`;
            } else {
                suppressMsg = `\n【寿元压制】处于绝灵时代，寿命上限9999年。本次增加${shouyuanAdd}年`;
            }
        } else {
            if (player.寿元 >= 20000000) {
                actualShouyuanAdd = 0;
                suppressMsg = `\n你的寿元已足够漫长，神药的延寿效果已经对你不起作用`;
            } else {
                actualShouyuanAdd = shouyuanAdd;
                player.寿元 += shouyuanAdd;
            }
        }
    }
    
    // 应用增加效果
    let msg = "服用神药效果:\n";
    
    // 增加修为（扣除用于修复道伤的部分）
    const remainingXiuwei = xiuwei - usedXiuwei;
    if (remainingXiuwei > 0) {
        player.修为 += remainingXiuwei;
        msg += `修为增加: ${remainingXiuwei.toLocaleString()}\n`;
    }
    
    // 增加血气（扣除用于修复道伤的部分）
    const remainingXueqi = xueqi - usedXueqi;
    if (remainingXueqi > 0) {
        player.血气 += remainingXueqi;
        msg += `血气增加: ${remainingXueqi.toLocaleString()}\n`;
    }
    
    // 增加寿元
    if (actualShouyuanAdd > 0) {
        msg += `寿元增加: ${actualShouyuanAdd}年\n`;
    }
    
    // 添加道伤修复信息
    if (daoshangMsg) {
        msg += daoshangMsg;
        if (repairAmount > 0) {
            msg += `\n消耗修为修复道伤: ${usedXiuwei.toLocaleString()}`;
            msg += `\n消耗血气修复道伤: ${usedXueqi.toLocaleString()}`;
        }
    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 处理没有效果的情况
    if (remainingXiuwei === 0 && remainingXueqi === 0 && actualShouyuanAdd === 0 && !daoshangMsg) {
        e.reply("没有可服用的神药或药效无法生效");
        return;
    }
    
    // 消耗神药
    for (let item of consumeList) {
        await Add_najie_thing(usr_qq, item.name, item.class, -item.quantity);
    }
    
    // 添加压制提示
    if (suppressMsg) {
        msg += suppressMsg;
    }
    
    e.reply(msg);
    return;
}
   async sellchaopiao(e) {
        if (!verc({ e })) return false;
         let usr_qq = e.user_id.toString().replace('qg_', '');
        // 有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) return false;
    
        // 获取纳戒中的数据
        let najie = await data.getData('najie', usr_qq);
        let minerals = ['1k', '5k', '1w', '2w', '10w']; // 指定的矿石名称
        let commodities_price = 0;
    
        // 遍历纳戒中的道具类别
        for (let l of najie['道具']) {
            if (l && l.islockd == 0 && minerals.includes(l.name)) { // 检查是否是指定的矿石名称
                let quantity = l.数量;
                commodities_price += l.出售价 * quantity; // 计算总价
                await Add_najie_thing(usr_qq, l.name, l.class, -quantity, l.pinji); // 从纳戒中减去矿石
            }
        }
    
        // 增加灵石
        if (commodities_price > 0) {
            await Add_灵石(usr_qq, commodities_price);
            e.reply(`一键卖钞票成功！共获得${commodities_price}灵石`);
        } else {
            e.reply('纳戒中没有钞票可以出售');
        }
    }
    
    async sellMineral(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        // 有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) return false;
    
        // 获取纳戒中的数据
        let najie = await data.getData('najie', usr_qq);
        let minerals = ['矿渣', '碎矿', '小矿', '金矿', '仙晶矿', '灵矿']; // 指定的矿石名称
        let commodities_price = 0;
    
        // 遍历纳戒中的道具类别
        for (let l of najie['道具']) {
            if (l && l.islockd == 0 && minerals.includes(l.name)) { // 检查是否是指定的矿石名称
                let quantity = l.数量;
                commodities_price += l.出售价 * quantity; // 计算总价
                await Add_najie_thing(usr_qq, l.name, l.class, -quantity, l.pinji); // 从纳戒中减去矿石
            }
        }
    
        // 增加灵石
        if (commodities_price > 0) {
            await Add_灵石(usr_qq, commodities_price);
            e.reply(`一键卖矿石成功！共获得${commodities_price}灵石`);
        } else {
            e.reply('纳戒中没有矿石可以出售');
        }
    }
  async ul(e){
    if (!e.isMaster) return false;
    let player=await alluser()
    for(let i=0;i<player.length;i++){
      let player2=await Read_player(player[i])
        player2.练气皮肤=0
        player2.头像框皮肤=0
        player2.纳杰皮肤=undefined
        player2.纳戒皮肤=0
        await Write_player(player[i],player2)
    }
  }
  // async upall(e) {
  //   let thing =await allwupin()

  //   for(let item of thing){
  //    let A= await readall(item)
  //     for(let all of A){
  //       all.稀有度=0;
  //     }
  //    await dataall(A,item)
  //   }
  //   return;
  // }
 async all_zhuangbei(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    // 获取玩家数据
    let najie = await data.getData('najie', usr_qq);
    let player = await Read_player(usr_qq);
    
    // ==== 新增：检查是否满足终古剑之主装备条件 ====
    const hasEternalSwordDao = player.学习的功法.includes("永恒终极剑道");
    const isJianyunhaiChuanren = player.势力职位 === "传人";
    // ==== 新增结束 ====
    
    let sanwei = [];
    sanwei[0] =
      data.Level_list.find(item => item.level_id == player.level_id).基础攻击 +
      player.攻击加成 +
      data.LevelMax_list.find(item => item.level_id == player.Physique_id)
        .基础攻击;
    sanwei[1] =
      data.Level_list.find(item => item.level_id == player.level_id).基础防御 +
      player.防御加成 +
      data.LevelMax_list.find(item => item.level_id == player.Physique_id)
        .基础防御;
    sanwei[2] =
      data.Level_list.find(item => item.level_id == player.level_id).基础血量 +
      player.生命加成 +
      data.LevelMax_list.find(item => item.level_id == player.Physique_id)
        .基础血量;
    
    let equipment = await data.getData('equipment', usr_qq);
    
    // 智能选择装备
    let type = ['武器', '护具', '法宝'];
    for (let j of type) {
      let max;
      let max_equ;
      if (
        equipment[j].atk < 10 &&
        equipment[j].def < 10 &&
        equipment[j].HP < 10
      )
        max =
          equipment[j].atk * sanwei[0] * 0.43 +
          equipment[j].def * sanwei[1] * 0.16 +
          equipment[j].HP * sanwei[2] * 0.41;
      else
        max =
          equipment[j].atk * 0.43 +
          equipment[j].def * 0.16 +
          equipment[j].HP * 0.41;
      
      for (let i of najie['装备']) {
        // ==== 新增：终古剑之主特殊检查 ====
        if (i.name === "终古剑之主") {
            // 检查是否满足装备条件
            if (!hasEternalSwordDao || !isJianyunhaiChuanren) {
                // 不满足条件，跳过该装备
                continue;
            }
        }
        // ==== 新增结束 ====
        
        // 先判断装备存不存在
        let thing_exist = await foundthing(i.name);
        if (!thing_exist) {
          continue;
        }
        
        if (i.type == j) {
          let temp;
          // 再判断装备数值类型
          if (i.atk < 10 && i.def < 10 && i.HP < 10)
            temp =
              i.atk * sanwei[0] * 0.43 +
              i.def * sanwei[1] * 0.16 +
              i.HP * sanwei[2] * 0.41;
          else temp = i.atk * 0.43 + i.def * 0.16 + i.HP * 0.41;
          
          // 选出最佳装备
          if (max < temp) {
            max = temp;
            max_equ = i;
          }
        }
      }
      
      if (max_equ) await instead_equipment(usr_qq, max_equ);
    }
    
    // ==== 新增：如果终古剑之主被跳过，添加提示 ====
    if (!hasEternalSwordDao || !isJianyunhaiChuanren) {
        const hasZhongguJian = najie['装备'].some(i => i.name === "终古剑之主");
        
        if (hasZhongguJian) {
            let message = [
                `【终古剑之主·剑器通灵】`,
                `剑匣剧烈震颤，一道恐怖剑意冲天而起！`,
                `终古剑之主发出震天剑鸣：`,
                `"非永恒终极剑道修炼者，不配执掌吾身！"`
            ];
            
            if (!hasEternalSwordDao) {
                message.push(`你尚未领悟永恒终极剑道真谛`);
                message.push(`此剑乃剑魔帝主王旭的证道之器，蕴含无上剑道法则`);
                message.push(`唯有参透永恒终极剑道者方可驾驭`);
            }
            
            if (!isJianyunhaiChuanren) {
                message.push(`你非剑云海传人`);
                message.push(`此剑只认剑云海一脉传人为主`);
                message.push(`若无传人身份，纵是仙帝亦难降服`);
            }
            
            message.push(`终古剑之主化作一道剑光，重回剑匣`);
            message.push(`剑匣上浮现古老铭文：`);
            message.push(`"永恒剑道，传人方证"`);
            
            // 在装备图片前添加提示
            const img = await get_equipment_img(e);
            e.reply([message.join("\n"), img].join("\n\n"));
            return false;
        }
    }
    // ==== 新增结束 ====
    
    let img = await get_equipment_img(e);
    e.reply(img);
    return false;
}

  async all_locked(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let najie = await data.getData('najie', usr_qq);
    let wupin = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '草药',
      '食材',
      '材料',
      '仙宠',
      '仙宠口粮',
    ];
    let wupin1 = [];
    if (e.msg != '#一键锁定') {
      let thing = e.msg.replace('#一键锁定', '');
      for (var i of wupin) {
        if (thing == i) {
          wupin1.push(i);
          thing = thing.replace(i, '');
        }
      }
      if (thing.length == 0) {
        wupin = wupin1;
      } else {
        return false;
      }
    }
    for (var i of wupin) {
      for (let l of najie[i]) {
        //纳戒中的数量
        l.islockd = 1;
      }
    }
    await Write_najie(usr_qq, najie);
    e.reply(`一键锁定完成`);
    return false;
  }

  async all_unlocked(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let najie = await data.getData('najie', usr_qq);
    let wupin = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '食材',
      '草药',
      '材料',
      '仙宠',
      '仙宠口粮',
    ];
    let wupin1 = [];
    if (e.msg != '#一键解锁') {
      let thing = e.msg.replace('#一键解锁', '');
      for (var i of wupin) {
        if (thing == i) {
          wupin1.push(i);
          thing = thing.replace(i, '');
        }
      }
      if (thing.length == 0) {
        wupin = wupin1;
      } else {
        return false;
      }
    }
    for (var i of wupin) {
      for (let l of najie[i]) {
        //纳戒中的数量
        l.islockd = 0;
      }
    }
    await Write_najie(usr_qq, najie);
    e.reply(`一键解锁完成`);
    return false;
  }

  async all_give(e) {
    if (!verc({ e })) return false;
    //这是自己的
    let A_qq = e.user_id.toString().replace('qg_','');
    A_qq=await channel(A_qq)
    //自己没存档
    let ifexistplay = await existplayer(A_qq);
    if (!ifexistplay) return false;
    //对方
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    let atItem = e.message.filter(item => item.type === 'at'); //获取at信息
    let B_qq = atItem[0].qq//对方qq
    B_qq = B_qq.toString().replace('qg_', '');
    B_qq=await channel(B_qq)
    //对方没存档
    ifexistplay = await existplayer(B_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return false;
    }
    let A_najie = await data.getData('najie', A_qq);
    let wupin = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '盒子',
      '草药',
      '食材',
      '材料',
      '仙宠',
      '仙宠口粮',
    ];
    let wupin1 = [];
    if (e.msg != '#一键赠送') {
      let thing = e.msg.replace('#一键赠送', '');
      for (var i of wupin) {
        if (thing == i) {
          wupin1.push(i);
          thing = thing.replace(i, '');
        }
      }
      if (thing.length == 0) {
        wupin = wupin1;
      } else {
        return false;
      }
    }
    for (var i of wupin) {
      for (let l of A_najie[i]) {
        if (l && l.islockd == 0) {
          let quantity = l.数量;
          //纳戒中的数量
          if (i == '装备' || i == '仙宠') {
            await Add_najie_thing(B_qq, l, l.class, quantity, l.pinji);
            await Add_najie_thing(A_qq, l, l.class, -quantity, l.pinji);
            let najie = await Read_najie(B_qq);
            for(let item of najie.装备){
              if(item==l){
                item.islockd=1
              }
            }
            for(let item of najie.仙宠){
              if(item==l){
                item.islockd=1
              }
            }
            continue;
          }
          await Add_najie_thing(A_qq, l.name, l.class, -quantity);
          await Add_najie_thing(B_qq, l.name, l.class, quantity);
        }
      }
    }
    e.reply(`一键赠送完成`);
    return false;
  }
  async Sell_all_huishou(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let najie = await data.getData('najie', usr_qq);
    let lingshi = 0;
    let wupin = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '草药',
       '食材',
      '材料',
      '仙宠',
      '仙宠口粮',
    ];
    let wupin1 = [];
    if (e.msg != '#一键回收') {
      let thing = e.msg.replace('#一键回收', '');
      for (var i of wupin) {
        if (thing == i) {
          wupin1.push(i);
          thing = thing.replace(i, '');
        }
      }
      if (thing.length == 0) {
        wupin = wupin1;
      } else {
        return false;
      }
    }
    for (var i of wupin) {
      for (let l of najie[i]) {
        //纳戒中的数量
        let thing_exist = await foundthing(l.name);
        if (thing_exist) {
          continue;
        }
        await Add_najie_thing(usr_qq, l.name, l.class, -l.数量, l.pinji);
        if (l.class == '材料' || l.class == '草药') {
          lingshi += l.出售价 * l.数量;
        } else {
          lingshi += l.出售价 * l.数量 * 2;
        }
      }
    }
    await Add_灵石(usr_qq, lingshi);
    e.reply(`回收成功!  获得${lingshi}灵石 `);
    return false;
  }
  async locked(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    //命令判断
    let msg = e.msg.replace('#', '');
    let un_lock = msg.substr(0, 2);
    let thing = msg.substr(2).split('*');
    let thing_name = thing[0];
    let najie = await Read_najie(usr_qq);
    thing[0] = parseInt(thing[0]);
    let thing_pinji;
    //装备优化
    if (thing[0]) {
      if (thing[0] > 1000) {
        try {
          thing_name = najie.仙宠[thing[0] - 1001].name;
        } catch {
          e.reply('仙宠代号输入有误!');
          return false;
        }
      } else if (thing[0] > 500) {
        try {
          thing_name = najie.装备[thing[0] - 500].name;
          thing[1] = najie.装备[thing[0] - 500].pinji;
        } catch {
          e.reply('装备代号输入有误!');
          return false;
        }
      }
    }
    let thing_exist = await foundthing(thing_name);
    if (!thing_exist) {
      e.reply(`你瓦特了吧，这方世界没有这样的东西:${thing_name}`);
      return false;
    }
    let pj = {
      劣: 0,
      普: 1,
      优: 2,
      精: 3,
      极: 4,
      绝: 5,
      顶: 6,
    };
    thing_pinji = pj[thing[1]];
    let ifexist;
    if (un_lock == '锁定') {
      ifexist = await re_najie_thing(
        usr_qq,
        thing_name,
        thing_exist.class,
        thing_pinji,
        1
      );
      if (ifexist) {
        e.reply(`${thing_exist.class}:${thing_name}已锁定`);
        return false;
      }
    } else if (un_lock == '解锁') {
      ifexist = await re_najie_thing(
        usr_qq,
        thing_name,
        thing_exist.class,
        thing_pinji,
        0
      );
      if (ifexist) {
        e.reply(`${thing_exist.class}:${thing_name}已解锁`);
        return false;
      }
    }
    e.reply(`你没有【${thing_name}】这样的${thing_exist.class}`);
    return false;
  }

  async all_tongbu(e) {
    if (!verc({ e })) return false;
    await synchronization(e);
    await Synchronization_ASS(e);
    return false;
  }
  //一键出售
async Sell_all_comodities(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查存档是否存在
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    let commodities_price = 0;
    let najie = await data.getData('najie', usr_qq);
    let wupin = [
        '装备',
        '丹药',
        '道具',
        '功法',
        '草药',
        '食材',
        '材料',
        '仙宠',
        '盒子',
        '仙宠口粮',
    ];
    
    let wupin1 = [];
    let protectedWeapons = []; // 存储被保护的帝兵信息
    
    if (e.msg != '#一键出售') {
        let thing = e.msg.replace('#一键出售', '').trim();
        
        // 验证类别
        for (var i of wupin) {
            if (thing == i) {
                wupin1.push(i);
            }
        }
        
        if (wupin1.length === 0) {
            return e.reply(`无效的物品类别: ${thing}`);
        }
        
        wupin = wupin1;
        
        for (let category of wupin) {
            for (let item of najie[category]) {
                if (item && item.islockd == 0) {
                    // 检查是否是帝兵且属于玩家
                    if (category === '装备' && item.type === '帝兵' && item.author_name) {
                        protectedWeapons.push(item.name);
                        continue;
                    }
                    
                    let quantity = item.数量;
                    if (item.name != "秘境之匙") {
                        await Add_najie_thing(usr_qq, item.name, item.class, -quantity, item.pinji); // 减少物品数量
                        commodities_price += item.出售价 * quantity;
                    } else {
                        await Add_najie_thing(usr_qq, item.name, item.class, -quantity, item.pinji);
                        commodities_price += 2000000 * quantity;
                    }
                }
            }
        }
        
        await Add_灵石(usr_qq, commodities_price);
        
        let replyMsg = `出售成功! 获得${commodities_price}灵石`;
        if (protectedWeapons.length > 0) {
            replyMsg += `\n【帝兵保护】以下本命帝兵未出售：${protectedWeapons.join('、')}`;
        }
        
        e.reply(await get_log_img(replyMsg));
        return false;
    }

    
    let goodsNum = 0;
    let goods = [];
    
    // 构建物品清单表格数据
    let tableData = [];
    let totalValue = 0;
    
    for (let category of wupin) {
      for (let item of najie[category]) {
        if (item && item.islockd == 0) {
          // 新增：检查是否是帝兵且属于玩家
          if (category === '装备' && item.type === '帝兵' && item.author_name) {
            continue; // 跳过显示
          }
          
          let quantity = item.数量;
          let itemValue = item.name === "秘境之匙" ? 2000000 * quantity : item.出售价 * quantity;
          totalValue += itemValue;
          
          tableData.push({
            名称: item.name,
            数量: quantity,
            单价: item.name === "秘境之匙" ? "200万" : item.出售价,
            总价: itemValue,
            类别: category
          });
          
          goodsNum++;
        }
      }
    }
    
    if (goodsNum == 0) {
        e.reply('没有东西可以出售', false, { at: true });
        return false;
    }

    // 将tableData按类别分组
    let categories = {};
    tableData.forEach(item => {
        if (!categories[item.类别]) {
            categories[item.类别] = [];
        }
        categories[item.类别].push(item);
    });

    // 构建格式化的出售清单
    let formattedMsg = [
        `【诸天万界·一键出售清单】`,
        `共计 ${goodsNum} 件物品，预估总价值: ${this.formatNumber(totalValue)} 灵石`,
    ];

    // 按类别分组并格式化显示
    for (let category in categories) {
        formattedMsg.push(`\n【${category}】`);
        formattedMsg.push('─'.repeat(40));
        
        categories[category].forEach(item => {
            // 格式化数字显示
            const formattedPrice = this.formatNumber(item.单价);
            const formattedTotal = this.formatNumber(item.总价);
            
            // 对齐显示，每个字段单独一行
            formattedMsg.push(
                `${this.padRight(item.名称, 16)}`
            );
            formattedMsg.push(
                `数量: ${this.padLeft(item.数量, 4)}`
            );
            formattedMsg.push(
                `单价: ${this.padLeft(formattedPrice, 12)}`
            );
            formattedMsg.push(
                `总价: ${this.padLeft(formattedTotal, 15)}`
            );
            formattedMsg.push('─'.repeat(40)); // 每个物品后加分隔线
        });
        
        // 计算类别小计
        const categoryTotal = categories[category].reduce((sum, item) => sum + item.总价, 0);
        formattedMsg.push(`小计: ${this.formatNumber(categoryTotal)} 灵石`);
    }

    formattedMsg.push(`总价值: ${this.formatNumber(totalValue)} 灵石`);
    formattedMsg.push(`回复[1]确认出售，回复[0]取消`);

    // 使用get_log_img打印格式化后的清单
    e.reply(await get_log_img(formattedMsg.join('\n')));
    
    /** 设置上下文 */
    this.setContext('noticeSellAllGoods');
    
    return false;
}

// 数字格式化
formatNumber(num) {
    if (typeof num === 'string') {
        // 如果是字符串（如"200万"），直接返回
        return num;
    }
    if (num >= 100000000) {
        return (num / 100000000).toFixed(2) + '亿';
    } else if (num >= 10000) {
        return (num / 10000).toFixed(2) + '万';
    }
    return num.toString();
}

// 字符串对齐
padRight(str, length) {
    str = str.toString();
    if (str.length >= length) return str.substring(0, length);
    return str + ' '.repeat(length - str.length);
}

padLeft(str, length) {
    str = str.toString();
    if (str.length >= length) return str.substring(0, length);
    return ' '.repeat(length - str.length) + str;
}
  async noticeSellAllGoods(e) {
    if (!verc({ e })) return false;
    let reg = new RegExp(/^1$/);
    let new_msg = this.e.msg;
    let difficulty = reg.exec(new_msg);
    if (!difficulty) {
      e.reply('已取消出售', false, { at: true });
      /** 结束上下文 */
      this.finish('noticeSellAllGoods');
      return false;
    }
    /** 结束上下文 */
    this.finish('noticeSellAllGoods');
    /**出售*/

    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let najie = await data.getData('najie', usr_qq);
    let commodities_price = 0;
    let wupin = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '草药',
       '食材',
      '材料',
      '盒子',
      '仙宠',
      '仙宠口粮',
    ];
    for (let i of wupin) {
      for (let l of najie[i]) {
        if (l && l.islockd == 0) {
          console.log(await foundthing(l.name).出售价)
          //纳戒中的数量
          let quantity = l.数量;
          if(l.name!="秘境之匙"){
            await Add_najie_thing(usr_qq, l.name, l.class, -quantity, l.pinji);
            commodities_price = commodities_price + l.出售价 * quantity;
          }else{
            await Add_najie_thing(usr_qq, l.name, l.class, -quantity, l.pinji);
            commodities_price = commodities_price + 2000000 * quantity;
          }
        }
      }
    }
    await Add_灵石(usr_qq, commodities_price);
    e.reply(await get_log_img(`出售成功!  获得${commodities_price}灵石 `))
    return false;
  }

  //#(装备|服用|使用)物品*数量
  async all_xiuweidan(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    //检索方法
    let najie = await data.getData('najie', usr_qq);
    let xiuwei = 0;
          if (player.mijinglevel_id>19 && player.xiangulevel_id > 19) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
      }
    for (var l of najie.丹药) {
      if (l.type == '修为') {
        //纳戒中的数量
        let quantity = await exist_najie_thing(usr_qq, l.name, l.class);
        await Add_najie_thing(usr_qq, l.name, l.class, -quantity);
        xiuwei = xiuwei + l.exp * quantity;
      }
    }
    await Add_修为(usr_qq, xiuwei);
    e.reply(`服用成功,修为增加${xiuwei}`);
    return false;
  }
  //#(装备|服用|使用)物品*数量
 async all_yuanshen(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let player = await Read_player(usr_qq);
  
    // 有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;

    // 检索方法
    let najie = await data.getData('najie', usr_qq);
    let totalYuanshen = 0; // 用于累计所有天药提供的元神值

    for (var l of najie.丹药) {
      if (l.type == '天药') {
        // 纳戒中的数量
        let quantity = await exist_najie_thing(usr_qq, l.name, l.class);
        // 累加这种天药提供的元神值
        totalYuanshen += l.yuanshen * quantity;
        // 消耗丹药
        await Add_najie_thing(usr_qq, l.name, l.class, -quantity);
      }
    }

    // 更新玩家元神和元神上限
    player.元神 += totalYuanshen;
    player.元神上限 += totalYuanshen;
    await Write_player(usr_qq, player);
    e.reply(`服用成功,元神与元神上限增加${totalYuanshen}`);
    return false;
}

 async all_learn(e) {
  if (!verc({ e })) return false;
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  
  // 有无存档
  let ifexistplay = await existplayer(usr_qq);
  if (!ifexistplay) return false;
  
  // 检索方法
  let najie = await data.getData('najie', usr_qq);
  let player = await Read_player(usr_qq);
  
const gongfaHierarchy = {
  "神慧者": 8,
  "仙帝法": 7,
  "仙王法": 6,
  "十凶宝术": 6,
  "帝经": 5,
  "九秘": 5,
  "盖世杀术": 5,
  "道与法": 4,
  "宝术": 4,
  "天赋": 2,
  "修炼功法": 1,
  "炼器": 1,
  "推演": 1,
  "技能": 1,
  "武学": 1
};

// 定义天资等级映射（数字越大表示天资越高）
const aptitudeLevels = {
  "无演无尽": 8,
  "万古无双": 7,
  "绝世天骄": 6,
  "旷世奇才": 5,
  "天纵之资": 4,
  "超凡资质": 3,
  "平庸之资": 2,
  "先天不足": 1,
  "天弃之人": 0
};
  
 // 获取玩家的天资等级
const aptitudeLevel = player.天资等级;

// 获取玩家天资层级（数字越大越好）
const playerAptitudeLevel = aptitudeLevels[aptitudeLevel] || 0; // 默认为天赋层级
  
  let learnedGongfa = []; // 成功学习的功法
  let skippedGongfa = []; // 因条件不符跳过的功法
  let failedGongfa = [];  // 因特殊条件失败的功法
  
  for (var l of najie.功法) {
    // 检查是否已学习
    if (player.学习的功法.includes(l.name)) {
      skippedGongfa.push(`${l.name}(已学习)`);
      continue;
    }
       // 特殊功法检查 - 自然大道
    if (l.name == '自然大道') {
        // 允许学习的资质类型
        const allowedAptitudes = ["平庸之资", "先天不足", "天弃之人"];
        
        if (!allowedAptitudes.includes(aptitudeLevel)) {
            failedGongfa.push(`${l.name}(资质【${aptitudeLevel}】过于聪慧，大道拒斥)`);
            continue;
        }
    }
    // 特殊功法检查（神慧者）
    if (l.type == '神慧者' && player.灵根.type != "神慧者") {
      failedGongfa.push(`${l.name}(需要神慧者灵根)`);
      continue;
    }
    // 特殊功法检查（神慧者）
    if (l.name == '无始经' && player.灵根.name != "先天圣体道胎") {
      failedGongfa.push(`${l.name}(需要先天圣体道胎灵根)`);
      continue;
    }
    // 特殊功法检查（神慧者）
    if (l.name == '西皇经' && (player.灵根.type != "道胎"&&player.灵根.type != "圣体道胎")) {
      failedGongfa.push(`${l.name}(需要拥有先天道胎)`);
      continue;
    }
     // 特殊功法检查（神慧者）
    if (l.name == '妖帝古经' && player.灵根.type != "妖体") {
      failedGongfa.push(`${l.name}(妖族古皇的帝经非妖体不可学)`);
      continue;
    }
      // 特殊功法检查（神慧者）
    if (l.name == '万龙古经' && player.灵根.type != "妖体") {
      failedGongfa.push(`${l.name}(妖族古皇的帝经非妖体不可学)`);
      continue;
    }
    // 获取功法的层级
   const gongfaLevel = gongfaHierarchy[l.type] || 8; // 默认为修炼功法层级
    
   // 学习条件：玩家天资层级 >= 功法层级 才能学习
  if (playerAptitudeLevel < gongfaLevel) {
    skippedGongfa.push(`${l.name}(天资不足)`);
    continue;
  }
    
    // 学习功法
    await Add_najie_thing(usr_qq, l.name, '功法', -1);
    await Add_player_学习功法(usr_qq, l.name);
    learnedGongfa.push(l.name);
  }
  
  // 构建回复消息
  let replyMsg = '';
  
  if (learnedGongfa.length > 0) {
    replyMsg += `你学会了${learnedGongfa.join('、')}\n`;
  }
  
  if (skippedGongfa.length > 0) {
    replyMsg += `跳过学习：${skippedGongfa.join('、')}\n`;
  }
  
  if (failedGongfa.length > 0) {
    replyMsg += `无法学习：${failedGongfa.join('、')}\n`;
  }
  
  if (learnedGongfa.length === 0 && skippedGongfa.length === 0 && failedGongfa.length === 0) {
    replyMsg = '无新功法可学习';
  } else {
    replyMsg += '可以在【#我的炼体】中查看已学功法';
  }
  
  e.reply(replyMsg);
  return false;
}
}
// 安全数值获取函数
function safeNumber(value, defaultValue = 0) {
    // 如果是有效数字，直接返回
    if (typeof value === 'number' && !isNaN(value)) {
        return value;
    }
    
    // 如果是字符串，尝试转换
    if (typeof value === 'string') {
        // 移除可能的逗号或其他非数字字符
        const cleanValue = value.replace(/[^0-9.]/g, '');
        const num = parseFloat(cleanValue);
        return isNaN(num) ? defaultValue : num;
    }
    
    // 其他类型返回默认值
    return defaultValue;
}

// 时间格式化函数
function formatTime(ms) {
    // 确保ms是有效数字
    if (isNaN(ms) || ms <= 0) {
        return "0秒";
    }
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0 && seconds > 0) {
        return `${minutes}分${seconds}秒`;
    } else if (minutes > 0) {
        return `${minutes}分`;
    } else {
        return `${seconds}秒`;
    }
}