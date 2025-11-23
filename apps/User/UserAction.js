import {plugin, verc, data, config} from '../../api/api.js';
import common from '../../../../lib/common/common.js';
import fs from 'fs';
import {
  Read_player,
  existplayer,
  Read_najie,
  Write_najie,
  exist_najie_thing,
  Add_灵石,
  Write_player,
  Add_najie_thing,
  __PATH,
  Add_player_学习功法,
  Go,
  get_najie_img,
  get_najie_category_img,
  get_najie_chouchou_img,
  channel
} from '../../model/xiuxian.js';
export class UserAction extends plugin {
  constructor() {
    super({
      name: 'UserAction',
      dsc: '交易模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#我的纳戒|#纳戒$',
          fnc: 'Show_najie',
        },
        {
          reg: '^#瞅瞅纳戒$',
          fnc: 'Show_najie_luck',
        },
        {
reg: '^#纳戒(功法|草药|盒子|丹药|道具|材料|食材|装备)$',
fnc: 'Show_najie_category'
},
        {
          reg: '^#升级纳戒$',
          fnc: 'Lv_up_najie',
        },
         {
          reg: '^#打听天机$',
          fnc: 'dating',
        }
       ,
{
    reg: '^#探索狠人道场$',
    fnc: 'exploreHrenDao'
},
{
    reg: '^#探索乱古遗址$',
    fnc: 'exploreLuanGu'
},
{
    reg: '^#探索青帝坟冢$',
    fnc: 'exploreQingDi'
},
{
    reg: '^#传音给作者\\s*(.*)$',
    fnc: 'sendMessageToAuthor'
},
{
    reg: '^#造访剑云海$',
    fnc: 'jianyunhai'
},
{
    reg: '^#剑云海选择\\s*([123])$',
    fnc: 'jianyunhaiChoice'
},
{
    reg: '^#加入瑶池$',
    fnc: 'yaochi'
},
{
    reg: '^#偷取纳戒物品随机\\s+(\\d+)$',
    fnc: 'stealRandomItemFromPlayer',
    event: 'message.private'
},
  {
    reg: '^#偷取纳戒物品\\s+(\\S+)\\s+(\\d+)$',
    fnc: 'stealItemFromPlayer',
    event: 'message.private'
},
{
    reg: '^#职位晋升$',
    fnc: 'zhiweijinsheng'
},
{
    reg: '^#领取瑶池俸禄$',
    fnc: 'lingquYaochiSalary'
},
{
    reg: '^#开启剑云海秘库$',
    fnc: 'lingqujianyunhai'
}
      ],
    });
  }

async lingqujianyunhai(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // 检查是否加入剑云海势力
    if (player.势力 !== "剑云海") {
        return e.reply([
            `【剑云海禁地】`,
            `非我宗门弟子，不得擅入秘库。`,
        ].join('\n'));
    }
    
    // 获取当前日期（基于本地时间的0点）
    const now = new Date();
    const today = now.getDate(); // 获取当月日期数字（1-31）
    
    // 获取上次开启的日期
    const lastOpenDay = await redis.get(`xiuxian:player:${usr_qq}:jianyunhai_open_day`);
    
    // 检查今日是否已开启秘库（比较日期数字）
    if (lastOpenDay && parseInt(lastOpenDay) === today) {
        return e.reply([
            `【剑云海秘库禁令】`,
            `今日秘库已为尊驾开启。`,
            `剑云海秘库法则：每日仅限一次，望尊驾明日再来。`
        ].join('\n'));
    }
    
    // 基础奖励：5000万源石
    player.源石 += 50000000;
    let rewardMsg = "【剑云海秘库·开启】";
    rewardMsg += ` 作为剑云海传人，您获得5000万源石供奉\n`;
    
    // 随机决定仙品或圣品秘境结算卡
    const isXianpin = Math.random() < 0.5;
    const settlementCard = isXianpin ? "仙品秘境结算卡" : "圣品秘境结算卡";
    const cardDesc = isXianpin ? 
        "仙品秘境结算卡：可缩减秘境探索时间" : 
        "圣品秘境结算卡：可大幅缩减秘境探索时间";
    
    // 定义三组奖励物品
    const rewardGroups = [
        ["众生仙钓", "道具", "诸天仙宝，可垂钓众生"],
        ["剑云海圣药", "丹药", "宗门秘传圣药，可增进修为血气"],
        [settlementCard, "道具", cardDesc]
    ];
    
    // 随机决定奖励档次
    const random = Math.random();
    let rewardLevel = "";
    let rewardMultiplier = 1;
    
    if (random < 0.7) {
        // 70%概率：每组3个物品
        rewardLevel = "【基础赏赐】";
        rewardMultiplier = 3;
    } else if (random < 0.9) {
        // 20%概率：每组5个物品
        rewardLevel = "【鸿运嘉赏】";
        rewardMultiplier = 5;
    } else {
        // 10%概率：每组5个物品 + 10个超越宝盒
        rewardLevel = "【天选厚赐】";
        rewardMultiplier = 5;
    }
    
    // 发放奖励
    for (const [itemName, itemType] of rewardGroups) {
        await Add_najie_thing(usr_qq, itemName, itemType, rewardMultiplier);
    }
    
    if (rewardLevel === "【天选厚赐】") {
        await Add_najie_thing(usr_qq, "超越宝盒", "盒子", 10);
    }
    
    // 构建奖励详情
    rewardMsg += ` 奖励等级：${rewardLevel}\n`;
    for (const [itemName, , desc] of rewardGroups) {
        rewardMsg += ` - ${itemName} x${rewardMultiplier}：${desc}\n`;
    }
    
    if (rewardLevel === "【天选厚赐】") {
        rewardMsg += ` - 超越宝盒 x10：蕴含无上道机的秘宝\n`;
    }
    
    // 添加结算卡备注
    rewardMsg += `\n 本次秘库开启，随机赐予${isXianpin ? "仙品" : "圣品"}秘境结算卡`;
    
    // 记录开启日期（存储日期数字）
    await redis.set(`xiuxian:player:${usr_qq}:jianyunhai_open_day`, today);
    
    // 保存玩家数据（源石增加）
    await Write_player(usr_qq, player);
    
    // 添加宗门律令
    rewardMsg += `\n\n【剑云海律令】真传弟子每日可开启一次秘库，以彰宗门恩典。`;
    
    e.reply(rewardMsg);
    return true;
}

// 偷取纳戒随机物品功能
async stealRandomItemFromPlayer(e) {
    // 解析指令
    const match = e.msg.match(/^#偷取纳戒物品随机\s+(\d+)$/);
    if (!match) {
        return e.reply('指令格式错误！正确格式：#偷取纳戒物品随机 [对方QQ号]');
    }
    
    const targetQQ = match[1];
    const thiefQQ = e.user_id.toString().replace('qg_', '');
    
    // 检查自己是否存在
    if (!await existplayer(thiefQQ)) {
        return e.reply('你还没有创建角色，请先创建角色！');
    }
    
    // 检查目标是否存在
    if (!await existplayer(targetQQ)) {
        return e.reply(`目标玩家 ${targetQQ} 不存在！`);
    }
    
    // 读取双方玩家数据
    const thief = await Read_player(thiefQQ);
    const target = await Read_player(targetQQ);
    
    // 读取目标纳戒数据
    const targetNajie = await Read_najie(targetQQ);
    
    // 收集目标纳戒中所有可偷取的物品
    const allItems = [];
    const categories = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '盒子', '仙宠', '宝石'];
    
    for (const category of categories) {
        const items = targetNajie[category];
        if (items && items.length > 0) {
            for (const item of items) {
                // 排除数量为0的物品
                if (item.数量 > 0) {
                    allItems.push({
                        name: item.name,
                        class: category,
                        pinji: item.pinji || 0
                    });
                }
            }
        }
    }
    
    // 检查是否有可偷取的物品
    if (allItems.length === 0) {
        return e.reply(`目标玩家纳戒中没有任何物品可偷取！`);
    }
    
    // 随机选择一个物品
    const randomIndex = Math.floor(Math.random() * allItems.length);
    const selectedItem = allItems[randomIndex];
    const itemName = selectedItem.name;
    const itemClass = selectedItem.class;
    const itemPinji = selectedItem.pinji;
    
    // 确保神识属性存在
    thief.神识 = thief.神识 || 0;
    target.神识 = target.神识 || 0;
    
    // 偷取成功率计算（基于境界差和神识差）
    const levelDiff = thief.mijinglevel_id - target.mijinglevel_id;
    const divineSenseDiff = thief.神识 - target.神识;
    
    let successRate = 0.5; // 基础成功率
    
    // 境界优势加成
    if (levelDiff > 0) {
        successRate += levelDiff * 0.1;
    } else if (levelDiff < 0) {
        successRate += levelDiff * 0.05;
    }
    
    // 神识优势加成
    if (divineSenseDiff > 0) {
        successRate += divineSenseDiff * 0.02;
    } else if (divineSenseDiff < 0) {
        successRate += divineSenseDiff * 0.01;
    }
    
    // 限制成功率范围
    successRate = Math.max(0.1, Math.min(0.9, successRate));
    
    // 随机决定是否成功
    const isSuccess = Math.random() < successRate;
    
    if (isSuccess) {
        // 偷取成功
        // 从目标纳戒中移除物品
        for (const category of categories) {
            const items = targetNajie[category];
            if (items) {
                const index = items.findIndex(i => i.name === itemName);
                if (index !== -1) {
                    // 减少数量或移除
                    if (items[index].数量 > 1) {
                        items[index].数量 -= 1;
                    } else {
                        targetNajie[category].splice(index, 1);
                    }
                    break;
                }
            }
        }
        
        // 添加到偷取者纳戒
        await Add_najie_thing(thiefQQ, itemName, itemClass, 1, itemPinji);
        
        // 保存目标纳戒
        await Write_najie(targetQQ, targetNajie);
        
        // 发送成功消息给偷取者
        await e.reply([
            `【随机偷取成功】`,
            `你成功从 ${target.名号}(${targetQQ}) 的纳戒中随机偷取了【${itemName}】！`,
            `成功率：${(successRate * 100).toFixed(1)}%`,
            `境界差：${levelDiff > 0 ? '+' : ''}${levelDiff}`,
            `神识差：${divineSenseDiff > 0 ? '+' : ''}${divineSenseDiff}`,
            `物品已添加到你的纳戒中，使用 #纳戒 查看`
        ].join('\n'));
        
        // 不通知被偷者（成功偷取不会被发现）
        
        return true;
    } else {
        // 偷取失败
        // 被发现惩罚
        const damage = Math.floor(thief.当前血量 * 0.3); // 损失30%当前血量
        thief.当前血量 = Math.max(1, thief.当前血量 - damage);
        
        // 神识受损惩罚
        const divineSenseDamage = Math.floor(thief.神识 * 0.1); // 损失10%神识
        thief.神识 = Math.max(0, thief.神识 - divineSenseDamage);
        
        // 保存偷取者状态
        await Write_player(thiefQQ, thief);
        
        // 发送失败消息给偷取者
        await e.reply([
            `【随机偷取失败】`,
            `你在随机偷取 ${target.名号}(${targetQQ}) 的纳戒物品时被发现了！`,
            `目标物品：${itemName}`,
            `成功率：${(successRate * 100).toFixed(1)}%`,
            `境界差：${levelDiff > 0 ? '+' : ''}${levelDiff}`,
            `神识差：${divineSenseDiff > 0 ? '+' : ''}${divineSenseDiff}`,
            `你受到神识反击：`,
            `- 损失了${damage}点生命值！`,
            `- 神识受损${divineSenseDamage}点！`,
            `当前血量：${thief.当前血量}`,
            `当前神识：${thief.神识}`
        ].join('\n'));
        
        // 通知被偷者
        try {
            // 使用 pushInfo 函数发送私聊通知
            await common.relpyPrivate(targetQQ, false, [
                `【警惕！】`,
                `有宵小之徒试图随机偷取你的纳戒物品！`,
                `偷取者：${thief.名号}(${thiefQQ})`,
                `目标物品：${itemName}`,
                `偷取时间：${new Date().toLocaleString()}`,
                `你的神识敏锐，及时发现了偷窃行为！`,
                `已成功击退偷取者！`
            ].join('\n'));
        } catch (error) {
            console.log(`无法通知被偷者 ${targetQQ}: ${error.message}`);
        }
        
        return true;
    }
}
// 偷取纳戒物品功能
async stealItemFromPlayer(e) {
    // 解析指令
    const match = e.msg.match(/^#偷取纳戒物品\s+(\S+)\s+(\d+)$/);
    if (!match) {
        return e.reply('指令格式错误！正确格式：#偷取纳戒物品 [物品名称] [对方QQ号]');
    }
    
    const itemName = match[1];
    const targetQQ = match[2];
    const thiefQQ = e.user_id.toString().replace('qg_', '');
    
    // 检查自己是否存在
    if (!await existplayer(thiefQQ)) {
        return e.reply('你还没有创建角色，请先创建角色！');
    }
    
    // 检查目标是否存在
    if (!await existplayer(targetQQ)) {
        return e.reply(`目标玩家 ${targetQQ} 不存在！`);
    }
    
    // 读取双方玩家数据
    const thief = await Read_player(thiefQQ);
    const target = await Read_player(targetQQ);
    
    // 读取双方纳戒数据
    const thiefNajie = await Read_najie(thiefQQ);
    const targetNajie = await Read_najie(targetQQ);
    
    // 检查目标是否有该物品
    let itemFound = false;
    let itemClass = '';
    let itemPinji = 0;
    
    // 检查所有类别
    const categories = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '盒子', '仙宠', '宝石'];
    for (const category of categories) {
        const item = targetNajie[category]?.find(i => i.name === itemName);
        if (item) {
            itemFound = true;
            itemClass = category;
            itemPinji = item.pinji || 0;
            break;
        }
    }
    
    if (!itemFound) {
        return e.reply(`目标玩家没有【${itemName}】这个物品！`);
    }
    // 确保神识属性存在
thief.神识 = thief.神识 || 0;
target.神识 = target.神识 || 0;
    // 偷取成功率计算（基于境界差和神识差）
    const levelDiff = thief.mijinglevel_id - target.mijinglevel_id;
    const divineSenseDiff = thief.神识 - target.神识;
    
    let successRate = 0.5; // 基础成功率
    
    // 境界优势加成
    if (levelDiff > 0) {
        successRate += levelDiff * 0.1;
    } else if (levelDiff < 0) {
        successRate += levelDiff * 0.05;
    }
    
    // 神识优势加成
    if (divineSenseDiff > 0) {
        successRate += divineSenseDiff * 0.02;
    } else if (divineSenseDiff < 0) {
        successRate += divineSenseDiff * 0.01;
    }
    
    // 限制成功率范围
    successRate = Math.max(0.1, Math.min(0.9, successRate));
    
    // 随机决定是否成功
    const isSuccess = Math.random() < successRate;
    
    if (isSuccess) {
        // 偷取成功
        // 从目标纳戒中移除物品
        for (const category of categories) {
            const items = targetNajie[category];
            if (items) {
                const index = items.findIndex(i => i.name === itemName);
                if (index !== -1) {
                    // 减少数量或移除
                    if (items[index].数量 > 1) {
                        items[index].数量 -= 1;
                    } else {
                        targetNajie[category].splice(index, 1);
                    }
                    break;
                }
            }
        }
        
        // 添加到偷取者纳戒
        await Add_najie_thing(thiefQQ, itemName, itemClass, 1);
         await Add_najie_thing(targetQQ, itemName, itemClass, -1);
        // // 保存双方纳戒
        // await Write_najie(targetQQ, targetNajie);
        // await Write_najie(thiefQQ, thiefNajie);
        
        // 发送成功消息给偷取者
        await e.reply([
            `【偷取成功】`,
            `你成功从 ${target.名号}(${targetQQ}) 的纳戒中偷取了【${itemName}】！`,
            `成功率：${(successRate * 100).toFixed(1)}%`,
            `境界差：${levelDiff > 0 ? '+' : ''}${levelDiff}`,
            `神识差：${divineSenseDiff > 0 ? '+' : ''}${divineSenseDiff}`,
            `物品已添加到你的纳戒中，使用 #纳戒 查看`
        ].join('\n'));
        
        // 不通知被偷者（成功偷取不会被发现）
        
        return true;
    } else {
        // 偷取失败
        // 被发现惩罚
        const damage = Math.floor(thief.当前血量 * 0.3); // 损失30%当前血量
        thief.当前血量 = Math.max(1, thief.当前血量 - damage);
        
        // 神识受损惩罚
        const divineSenseDamage = Math.floor(thief.神识 * 0.1); // 损失10%神识
        thief.神识 = Math.max(0, thief.神识 - divineSenseDamage);
        
        // 保存偷取者状态
        await Write_player(thiefQQ, thief);
        
        // 发送失败消息给偷取者
        await e.reply([
            `【偷取失败】`,
            `你在偷取 ${target.名号}(${targetQQ}) 的【${itemName}】时被发现了！`,
            `成功率：${(successRate * 100).toFixed(1)}%`,
            `境界差：${levelDiff > 0 ? '+' : ''}${levelDiff}`,
            `神识差：${divineSenseDiff > 0 ? '+' : ''}${divineSenseDiff}`,
            `你受到神识反击：`,
            `- 损失了${damage}点生命值！`,
            `- 神识受损${divineSenseDamage}点！`,
            `当前血量：${thief.当前血量}`,
            `当前神识：${thief.神识}`
        ].join('\n'));
        
  
            // 尝试发送私聊通知
            await common.relpyPrivate(targetQQ, [
                `【警惕！】`,
                `有宵小之徒试图偷取你的纳戒物品！`,
                `偷取者：${thief.名号}(${thiefQQ})`,
                `目标物品：${itemName}`,
                `偷取时间：${new Date().toLocaleString()}`,
                `你的神识敏锐，及时发现了偷窃行为！`,
                `已成功击退偷取者！`
            ].join('\n'));

        
        return true;
    }
}
  // 显示纳戒特定类别（图片版）
  async Show_najie_category(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查玩家是否存在
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    // 提取类别名称
    const category = e.msg.replace('#纳戒', '').trim();
    const validCategories = ['功法', '草药', '盒子', '丹药', '道具', '材料', '食材', '装备'];
    
    // 验证类别是否有效
    if (!validCategories.includes(category)) {
      e.reply(`无效的类别: ${category}`);
      return false;
    }
    
    // 获取玩家和纳戒数据
    let player = await Read_player(usr_qq);
    let najie = await Read_najie(usr_qq);
    
    // 获取该类别下的物品
    const items = najie[category];
    
    // 如果没有物品
    if (!items || Object.keys(items).length === 0) {
      e.reply(`纳戒${category}类别下没有物品`);
      return true;
    }
    
    // 生成类别图片
    let img = await get_najie_category_img(e, category);
    e.reply(img);
    return true;
  }

  // 显示整个纳戒
  async Show_najie(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查玩家是否存在
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    // 获取纳戒图片
    let img = await get_najie_img(e);
    e.reply(img);
    return false;
  }
  async  lingquYaochiSalary(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // 检查是否加入瑶池势力
    if (player.势力 !== "瑶池") {
        return e.reply([
            `【非瑶池弟子】`,
            `你尚未加入瑶池势力，无法领取俸禄！`,
            `加入瑶池指令：#加入瑶池`
        ].join('\n'));
    }
    
    // 检查职位
    const position = player.势力职位 || "记名女弟子";
    
    // 职位俸禄表
    const salaryTable = {
        "记名女弟子": 100000,
        "正式女弟子": 500000,
        "亲传女弟子": 2000000,
        "真传女弟子": 5000000,
        "圣女": 12000000
    };
    
    // 检查今日是否已领取俸禄
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastClaimDate = await redis.get(`xiuxian:player:${usr_qq}:yaochi_salary_date`);
    
    if (lastClaimDate === today) {
        return e.reply([
            `【俸禄已领】`,
            `今日俸禄已领取，请明日再来！`,
            `瑶池俸禄每日仅可领取一次`
        ].join('\n'));
    }
    
    // 计算俸禄
    const salary = salaryTable[position];
    
    // 发放俸禄
    player.源石 += salary;
    await Write_player(usr_qq, player);
    
    // 记录领取日期
    await redis.set(`xiuxian:player:${usr_qq}:yaochi_salary_date`, today);
    
    // 构建回复文案
    const positionDesc = {
        "记名女弟子": "瑶池记名女弟子",
        "正式女弟子": "瑶池正式女弟子",
        "亲传女弟子": "瑶池亲传女弟子",
        "真传女弟子": "瑶池真传女弟子",
        "圣女": "瑶池圣女"
    };
    
    return e.reply([
        `【瑶池俸禄】`,
        `身份：${positionDesc[position]}`,
        `俸禄：${salary.toLocaleString()}源石`,
        `已存入你的纳戒中`,
        `当前源石：${player.源石.toLocaleString()}`,
        `明日可再次领取`
    ].join('\n'));
}
  async yaochi(e) {
   if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    if (!await existplayer(usr_qq)) return false;
    const player = await Read_player(usr_qq);
       if (  player.power_place != 2) {
        return e.reply(
            `你不在遮天位面怎么找得到瑶池？`,
        );
    }
    if ( player.sex != 1) {
        return e.reply(
            `瑶池只有女性才能加入`,
        );
    }
   
    player.势力 = "瑶池";
    player.势力职位 = "记名女弟子";
    await Write_player(usr_qq, player);
   return e.reply(`成功加入瑶池！`);
}
async zhiweijinsheng(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // 检查是否加入势力
    if (player.势力 === "无" || !player.势力) {
        return e.reply([
            `【无门无派】`,
            `你尚未加入任何势力，无法晋升职位！`,
            `目前可加入势力：`,
            `- 瑶池（#加入瑶池）`,
        ].join('\n'));
    }
    
    // 定义天资等级序列
    const aptitudeSequence = [
        '天弃之人',
        '先天不足',
        '平庸之资',
        '超凡资质',
        '天纵之资',
        '旷世奇才',
        '绝世天骄',
        '万古无双',
        '无演无尽'
    ];
    
    // 瑶池职位晋升体系 - 修改为与境界和天资挂钩
    const yaochiPositions = {
        "记名女弟子": {
            next: "正式女弟子",
            cost: 500000, // 50万源石
            level_required: 2, // 需要轮海秘境-苦海
            aptitude_required: 2, // 需要至少"平庸之资"天资
            desc: "需达到轮海秘境-苦海境界，天资至少平庸之资"
        },
        "正式女弟子": {
            next: "亲传女弟子",
            cost: 1000000, // 100万源石
            level_required: 3, // 需要轮海秘境-命泉
            aptitude_required: 3, // 需要至少"超凡资质"天资
            desc: "需达到轮海秘境-命泉境界，天资至少超凡资质"
        },
        "亲传女弟子": {
            next: "真传女弟子",
            cost: 5000000, // 500万源石
            level_required: 5, // 需要轮海秘境-彼岸
            aptitude_required: 4, // 需要至少"天纵之资"天资
            desc: "需达到轮海秘境-彼岸境界，天资至少天纵之资"
        },
        "真传女弟子": {
            next: "圣女",
            cost: 20000000, // 2000万源石
            level_required: 6, // 需要道宫秘境
            aptitude_required: 5, // 需要至少"旷世奇才"天资
            desc: "需达到道宫秘境境界，天资至少旷世奇才"
        },
        "圣女": {
            next: null,
            level_required: 8, // 需要化龙秘境
            aptitude_required: 6, // 需要至少"绝世天骄"天资
            desc: "已是瑶池最高职位"
        }
    };
    
    // 检查是否瑶池弟子
    if (player.势力 !== "瑶池") {
        return e.reply(`你所在的势力${player.势力}暂无职位晋升体系`);
    }
    
    // 获取当前职位信息
    const currentPosition = player.势力职位 || "记名女弟子";
    const positionInfo = yaochiPositions[currentPosition];
    
    // 检查是否最高职位
    if (!positionInfo.next) {
        return e.reply([
            `【已达巅峰】`,
            `你已是瑶池圣女，位同副掌教！`,
            `西王母之下，万仙之上！`,
        ].join('\n'));
    }
    
    // 获取玩家当前天资等级索引
    const currentAptitudeIndex = aptitudeSequence.indexOf(player.天资等级);
    
    // 检查境界是否足够
    if (!player.mijinglevel_id || player.mijinglevel_id < positionInfo.level_required) {
        const levelNames = {
            2: "轮海秘境-苦海",
            3: "轮海秘境-命泉",
            4: "轮海秘境-神桥",
            5: "轮海秘境-彼岸",
            6: "道宫秘境",
            7: "四极秘境",
            8: "化龙秘境",
            9: "仙台秘境-半步大能",
            10: "仙台秘境-大能",
            11: "仙台秘境-斩道王者",
            12: "仙台秘境-圣人",
            13: "仙台秘境-圣人王",
            14: "仙台秘境-大圣",
            15: "仙台秘境-准帝",
            16: "仙台秘境-大帝"
        };
        
        return e.reply([
            `【境界不足】`,
            `晋升${positionInfo.next}需要达到${levelNames[positionInfo.level_required]}境界！`,
            `你当前境界：${player.mijinglevel_id ? player.mijinglevel_id : "未知"}`,
            `提示：${positionInfo.desc}`
        ].join('\n'));
    }
    
    // 检查天资是否足够
    if (currentAptitudeIndex < positionInfo.aptitude_required) {
        return e.reply([
            `【天资不足】`,
            `晋升${positionInfo.next}需要天资达到${aptitudeSequence[positionInfo.aptitude_required]}！`,
            `你当前天资：${player.天资等级}`,
            `提示：${positionInfo.desc}`
        ].join('\n'));
    }
    
    // 检查源石是否足够
    if (player.源石 < positionInfo.cost) {
        return e.reply([
            `【资源不足】`,
            `晋升${positionInfo.next}需要${positionInfo.cost.toLocaleString()}源石！`,
            `你当前仅有：${player.源石.toLocaleString()}源石`,
            `提示：${positionInfo.desc}`
        ].join('\n'));
    }
    
    // 晋升职位
    player.源石 -= positionInfo.cost;
    player.势力职位 = positionInfo.next;
    
    // 不同职位的额外奖励
    let extraReward = "";
    switch(positionInfo.next) {
        case "正式女弟子":
            await Add_najie_thing(usr_qq, '西皇经·道宫卷', '功法', 1);
            extraReward = "获得《西皇经·道宫卷》x1";
            break;
        case "亲传女弟子":
            await Add_najie_thing(usr_qq, '蟠桃仙种', '草药', 3);
            extraReward = "获得蟠桃仙种×3";
            break;
        case "真传女弟子":
            await Add_najie_thing(usr_qq, '西皇经', '功法', 1);
            extraReward = "获得《西皇经》×1";
            break;
        case "圣女":
            await Add_najie_thing(usr_qq, '瑶池仙令', '道具', 1);
            extraReward = "获得瑶池仙令×1";
            break;
    }
    
    await Write_player(usr_qq, player);
    
    // 构建晋升文案
    const positionDesc = {
        "正式女弟子": [
            `【瑶池初成】`,
            `你通过瑶池初试，正式成为瑶池弟子！`,
            `瑶池长老为你赐下：`,
            `- 瑶池玉牌（身份象征）`,
            `- 《西皇经·道宫卷》`,
        ],
        "亲传女弟子": [
            `【亲传之荣】`,
            `你被瑶池长老收为亲传弟子！`,
            `赐予：`,
            `- 亲传弟子玉簪`,
            `- 蟠桃仙种三枚`,
            `- 可入瑶池秘境修炼`,
        ],
        "真传女弟子": [
            `【真传之位】`,
            `你晋升为瑶池真传弟子！`,
            `西王母亲自赐下：`,
            `- 真传弟子仙衣`,
            `- 《西皇经》`,
            `- 可参悟瑶池帝经`,
        ],
        "圣女": [
            `【圣女加冕】`,
            `瑶池钟鸣九响，西王母为你加冕！`,
            `你成为新一代瑶池圣女：`,
            `- 执掌瑶池仙令`,
            `- 可调动瑶池底蕴`,
            `- 位同副掌教`,
            `蟠桃园中，三千瑶池弟子齐声恭贺：`,
            `"恭迎圣女！"`,
        ]
    };
    
    return e.reply([
        ...positionDesc[positionInfo.next],
        `消耗源石：${positionInfo.cost.toLocaleString()}`,
        extraReward ? `额外奖励：${extraReward}` : "",
    ].filter(Boolean).join('\n'));
}
async jianyunhai(e) {
    // 处理QQ号
const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
     const player = await Read_player(usr_qq);
    // 检查玩家
    if (!await existplayer(usr_qq)) {
        return e.reply('玩家数据不存在，请先创建角色');
    }
    
    // 检查令牌
    const tokenCount = await exist_najie_thing(usr_qq, '剑云海令牌', '道具');
    if (player.level_id < 42) {
        return e.reply(
            `你并没有成仙无法造访剑云海！`);
    }
 // 检查玩家是否已经完成过剑云海选择
    if (player.剑云海已选择) {
        return e.reply('你已然获得过剑魔帝主的机缘，无法再次进入剑云海！');
    }
    
    // 检查玩家是否正在选择中
    if (player.剑云海选择中) {
        return e.reply('你正在剑云海中，请先完成选择！');
    }
    if (!tokenCount || tokenCount < 1) {
        return e.reply([
            `【剑道无缘】`,
            `你来到剑云海入口，却被通天剑阵阻挡！`,
            `守山剑侍眸光如电：`,
            `"无剑云海令牌者，不得入内！"`,
            `需持有「剑云海令牌」方可进入`,
        ].join('\n'));
    }
    

    
    // 构建回复消息
    const encounterText = [
        `【剑云海】`,
        `你持令牌踏入剑云海，`,
        `只见云海翻涌，万剑悬空！`,
        `一位白衣青年负手而立，`,
        `其气息如深渊瀚海，眸中似有星河幻灭。`,
        `剑魔帝主淡然道：`,
        `"持令而来，可允你一愿，但说无妨。"`,
        `请选择：`,
        `1. 求取修炼资源`,
        `2. 拜师成为剑云海传人`,
        `3. 求得帝主庇护`,
        `回复【#剑云海选择1】或【#剑云海选择2】或【#剑云海选择3】`,
    ].join('\n');

  player.剑云海选择中 = true;
      // 消耗令牌
    await Add_najie_thing(usr_qq, '剑云海令牌', '道具', -1);
    await Write_player(usr_qq, player);
    
    return e.reply(encounterText);
}
async jianyunhaiChoice(e) {
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // 检查是否在剑云海选择状态
    if (!player.剑云海选择中) {
        return e.reply('请先使用【#剑云海】进入剑云海');
    }
    
    // 获取选择
    const choice = e.msg.replace('#剑云海选择', '').trim();
    
    // 处理选择
    switch(choice) {
        case '1': // 修炼资源
            await Add_灵石(usr_qq, 150000000); // 1亿5千万灵石
            await Add_najie_thing(usr_qq, '剑云海圣药', '丹药', 3);
            
            // 标记为已完成选择
            player.剑云海选择中 = false;
            player.剑云海已选择 = true;
            await Write_player(usr_qq, player);
            
            return e.reply([
                `【修炼资源】`,
                `剑魔帝主袖袍一挥，`,
                `一座灵石山和一瓶神药落在你面前：`,
                `获得：`,
                `- 灵石x1亿五千万`,
                `- 剑云海圣药x3`,
                `剑魔帝主："勤加修炼，莫负此缘！"`,
            ].join('\n'));
            
        case '2': // 成为传人
            // 检查服务器中是否已有剑云海传人
            const hasChuanren = await this.checkJianyunhaiChuanren();
            if (hasChuanren) {
                // 如果已有传人，返还令牌并重置选择状态
                await Add_najie_thing(usr_qq, '剑云海令牌', '道具', 1);
                player.剑云海选择中 = false; // 重置选择状态，允许玩家重新选择
                await Write_player(usr_qq, player);
                
                return e.reply([
                    `【传人已定】`,
                    `剑魔帝主摇头：`,
                    `"剑云海已有传人，此位不可再授！"`,
                    `提示：`,
                    `- 剑云海传人具有唯一性`,
                    `- 当前世界线已有传人存在`,
                    `- 你的令牌已返还，请重新选择其他奖励`,
                    `- 使用 #剑云海 重新进入选择`
                ].join('\n'));
            }
            
            // 如果没有传人，则继续执行
            player.学习的功法.push('永恒终极剑道');
            player.势力 = "剑云海";
            player.势力职位 = "传人";
            
            // 标记为已完成选择
            player.剑云海选择中 = false;
            player.剑云海已选择 = true;
            await Write_player(usr_qq, player);
            
            return e.reply([
                `【剑云海传人】`,
                `白衣青年眸光如电：`,
                `"跪下，拜师！"`,
                `你三叩九拜，行拜师大礼！`,
                `剑魔帝主指尖一点，`,
                `《永恒终极剑道》化作流光融入你识海！`,
                `获得:永恒终极剑道x1`,
                `从此你便是剑云海传人，`,
                `未来可继承整座剑云海！`,
            ].join('\n'));
            
        case '3': // 帝主庇护
            player.剑云海庇护 = {
                黑暗牢笼: 5, // 免受黑暗牢笼5次
                副本奖励: 5  // 副本5倍奖励5次
            };
            
            // 标记为已完成选择
            player.剑云海选择中 = false;
            player.剑云海已选择 = true;
            await Write_player(usr_qq, player);
            
            return e.reply([
                `【帝主庇护】`,
                `剑魔帝主取出一枚剑符：`,
                `"此符蕴含本帝三道剑气，可护你周全！"`,
                `获得：`,
                `- 免受黑暗牢笼接引 ×5次`,
                `- 副本奖励五倍 ×5次`,
                `剑魔帝主："好自为之，莫要辱没我的威名！"`,
            ].join('\n'));
            
        default:
            return e.reply('请选择有效选项：1、2或3');
    }
}

// 检查剑云海是否已有传人
async checkJianyunhaiChuanren() {
    try {
        // 获取所有玩家文件
        const playerFiles = fs.readdirSync('./plugins/zhutianxiuxian1.0/resources/data/xiuxian_player')
            .filter(file => file.endsWith('.json'));
        
        for (let file of playerFiles) {
            const playerId = file.replace('.json', '');
            const playerData = await Read_player(playerId);
            
            // 检查是否是剑云海传人
            if (playerData.势力 === "剑云海" && playerData.势力职位 === "传人") {
                return true; // 已存在传人
            }
        }
        return false; // 没有传人
    } catch (error) {
        console.error('检查剑云海传人时出错:', error);
        return false; // 出错时默认没有传人
    }
}
// 传音功能实现
async sendMessageToAuthor(e) {
    const content = e.msg.replace('#传音给作者', '').trim();
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    if (!await existplayer(usr_qq)) return false;
    const player = await Read_player(usr_qq);
    if (!content) {
        return e.reply([
            `【传音失败】`,
            `传音内容不能为空！`,
            `格式：#传音给作者 你想说的话`,
            `示例：#传音给作者 游戏建议：增加新功能`
        ].join('\n'));
    }
    
    const authorQQ = "2283096140"; // 作者QQ号
    const playerName = player.名号; // 发送者昵称
    const playerQQ = e.user_id; // 发送者QQ
    
    // 构建传音消息
    const message = [
        `【诸天传音】`,
        `${playerName}(${playerQQ}) 传音给您：`,
        `${content}`,
        `发送时间：${new Date().toLocaleString()}`,
    ].join('\n');
    
    try {
        // 使用pushInfo函数发送私信给作者
        await this.pushInfo(authorQQ, false, message);
        
        // 回复发送者
        e.reply([
            `【传音成功】`,
            `你的传音已跨越诸天万界，送达作者耳中！`,
            `传音内容：`,
            `${content}`,
        ].join('\n'));
    } catch (err) {
        Bot.logger.mark(err);
        e.reply([
            `【传音失败】`,
            `传音途中遭遇时空乱流，未能送达！`,
            `错误信息：${err.message}`,
            `请稍后再试或联系管理员`
        ].join('\n'));
    }
    
    return true;
}
//狠人道场探索
async  exploreHrenDao(e) {
    // ==== 基础校验 ====
    if (!e.isGroup) return e.reply('需在群聊中使用');
    
    const user_qq = e.user_id;
    const player = await Read_player(user_qq);
    
    if (!player) return e.reply('角色数据不存在');

    // ==== 狠人道场检查 ====
    if (!player.狠人传闻) {
        return e.reply([
            `【道场迷雾】`,
            `你欲探索狠人道场，却不知其所在！`,
            `天机老人警示：`,
            `"需先获取狠人道场秘闻，方可知其方位！"`,
        ].join('\n'));
    }

    // ==== 精血检查 ====
    const specialConstitutions = {
        "圣体": { name: "圣体精血", power: 2 },
        "小成圣体": { name: "小成圣体精血", power: 3 },
        "大成圣体": { name: "大成圣体精血", power: 4 },
        "先天道胎": { name: "先天道胎精血", power: 1 },
        "圣体道胎": { name: "圣体道胎精血", power: 4 },
        "妖体": { name: "妖体精血", power: 1 },
        "神体": { name: "神体精血", power: 1 },
        "混沌体": { name: "混沌体精血", power: 4 },
        "混沌圣体道胎": { name: "混沌圣体道胎精血", power: 5 }
    };

    const playerBloods = [];
    for (const [_, bloodInfo] of Object.entries(specialConstitutions)) {
        const count = await exist_najie_thing(user_qq, bloodInfo.name, "丹药");
        if (count > 0) {
            playerBloods.push({ 
                name: bloodInfo.name,
                power: bloodInfo.power,
                count: count 
            });
        }
    }

    if (playerBloods.length < 4) {
        const bloodList = Object.values(specialConstitutions)
            .map(b => b.name)
            .join('、');
            
        return e.reply([
            `【禁制未开】`,
            `狠人道场禁制轰鸣，拒绝开启！`,
            `需集齐四种不同的特殊体质精血：`,
            `你当前拥有：${playerBloods.length}种特殊精血`,
            `所需精血类型：`,
            `${bloodList}`,
            `提示：高阶精血可提升探索成功率`
        ].join('\n'));
    }

    // ==== 血脉力量计算 ====
    playerBloods.sort((a, b) => b.power - a.power);
    const usedBloods = playerBloods.slice(0, 4);
    const totalBloodPower = usedBloods.reduce((sum, blood) => sum + blood.power, 0);

    // ==== CD检查 ====
    const currentTime = Date.now();
    const lastExploreTime = player.last_hren_explore || 0;
    const cdTime = 24 * 3600 * 1000; // 24小时CD
    
    if (currentTime - lastExploreTime < cdTime) {
        const remainingTime = cdTime - (currentTime - lastExploreTime);
        const hours = Math.floor(remainingTime / 3600000);
        const minutes = Math.floor((remainingTime % 3600000) / 60000);
        
        return e.reply([
            `【道场反噬】`,
            `你强行冲击狠人道场，却遭帝威镇压！`,
            `狠人虚影显化虚空：`,
            `"道场未稳，需${hours}时${minutes}分方可再探！"`,
            `当前使用精血：`,
            ...usedBloods.map(b => `- ${b.name} (${b.power}点力量)`)
        ].join('\n'));
    }

    // ==== 消耗精血 ====
    for (const blood of usedBloods) {
        await Add_najie_thing(user_qq, blood.name, "丹药", -1);
    }

    // ==== 探索结果判定 ====
    const baseSuccessRate = 0.7; // 基础成功率70%
    const powerBonus = totalBloodPower * 0.05; // 每点力量+5%
    const successRate = Math.min(baseSuccessRate + powerBonus, 0.95); // 上限95%
    const isSuccess = Math.random() < successRate;

    if (!isSuccess) {
        // 探索失败惩罚
        player.修为 = Math.floor(player.修为 * 0.9);
        player.当前血量 = Math.max(1, Math.floor(player.当前血量 * 0.8));
        player.last_hren_explore = currentTime;
        await Write_player(user_qq, player);

        return e.reply([
            `【道场惊变】`,
            `你踏入狠人道场，却触发太古杀阵！`,
            `万化圣诀逆转阴阳，飞仙光雨撕裂虚空！`,
            `你祭出所有护身法宝才勉强逃出道场...`,
            `惩罚效果：`,
            `- 修为减少10% (剩余:${player.修为})`,
            `- 气血减少20% (剩余:${player.当前血量})`,
            `狠人低语：`,
            `"蝼蚁也敢窥探帝境..."`
        ].join('\n'));
    }

    // ==== 探索成功奖励 ====
    const hrenGongfa = [
        {name: "不灭天功", desc: "肉身不灭，元神永存"},
        {name: "万化圣诀", desc: "化尽天下万法"},
        {name: "飞仙诀", desc: "一击飞仙，破灭万古"}
    ];

    // 获取可奖励功法
    const availableGongfa = [];
    for (const gongfa of hrenGongfa) {
        const hasLearned = player.学习的功法?.includes(gongfa.name);
        const inNajie = await exist_najie_thing(user_qq, gongfa.name, "功法");
        
        if (!hasLearned && !inNajie) {
            availableGongfa.push(gongfa);
        }
    }

    // 所有功法都已拥有时改为修为奖励
    if (availableGongfa.length === 0) {
        const expReward = 100000000; // 1亿修为
        player.修为 += expReward;
        player.last_hren_explore = currentTime;
        await Write_player(user_qq, player);

        return e.reply([
            `【帝缘已尽】`,
            `你踏入狠人道场，却见三块帝玉尽皆黯淡！`,
            `狠人大帝的虚影显化虚空：`,
            `"汝已得吾之真传，此世帝缘已尽..."`,
            `大帝挥手间，一道本源帝气灌入你体内！`,
            `获得：${expReward.toLocaleString()}修为`
        ].join('\n'));
    }

    // 随机获取一个功法
    const reward = availableGongfa[Math.floor(Math.random() * availableGongfa.length)];
    await Add_najie_thing(user_qq, reward.name, "功法", 1);
    player.last_hren_explore = currentTime;
    await Write_player(user_qq, player);

    return e.reply([
        `【狠人传承】`,
        `你踏入北域荒原，在月圆之夜开启狠人道场！`,
        `▂▂▂▂▂▂▂狠人道场▂▂▂▂▂▂▂`,
        `道场中央，三块帝玉悬浮虚空：`,
        ...hrenGongfa.map(g => 
            `- ${g.name.padEnd(6,"　")}｜${g.desc}`
        ),
        `你以精血为引，与${reward.name}帝玉共鸣！`,
        `帝玉化作流光融入你仙台秘境，`,
        `狠人大帝的无上传承烙印神魂！`,
        `获得：【${reward.name}】`,
       
    ].join('\n'));
}
async exploreQingDi(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // ==== 前置条件检查 ====
    
    // 1. 需有青帝传闻
    if (!player.青帝传闻) {
        return e.reply([
            `【帝踪难觅】`,
            `你欲寻青帝传承，却不知其所在！`,
            `妖帝坟冢隐于东荒南域，`,
            `需先获取青帝秘闻方可知其方位！`,
        ].join('\n'));
    }
    
    // 2. 体质检查 - 必须是妖体
    if (player.灵根.type !== "妖体") {
        return e.reply([
            `【血脉排斥】`,
            `你欲踏入青帝坟冢，却遭帝阵反噬！`,
            `混沌青莲虚影显化：`,
            `"非我妖族血脉，不得入内！"`,
            `你被帝威震飞万里，口吐鲜血！`,
            `提示：需妖体血脉方可接受青帝传承`
        ].join('\n'));
    }
    
    // 3. CD检查（24小时）
    const currentTime = Date.now();
    const lastExploreTime = player.last_qingdi_explore || 0;
    const cdTime = 24 * 3600 * 1000; // 24小时CD
    
    if (currentTime - lastExploreTime < cdTime) {
        const remainingTime = cdTime - (currentTime - lastExploreTime);
        const hours = Math.floor(remainingTime / 3600000);
        const minutes = Math.floor((remainingTime % 3600000) / 60000);
        
        return e.reply([
            `【帝冢未稳】`,
            `你强行冲击青帝坟冢，引动帝阵反噬！`,
            `混沌青莲虚影显化：`,
            `"帝冢未稳，需${hours}时${minutes}分方可再探！"`,
        ].join('\n'));
    }
    
    // ==== 探索结果判定 ====
    const isSuccess = Math.random() < 0.6; // 60%成功率
    
    if (!isSuccess) {
        // 探索失败惩罚
        player.当前血量 = Math.max(1, Math.floor(player.当前血量 * 0.7)); // 血量减少30%
        player.last_qingdi_explore = currentTime;
        await Write_player(usr_qq, player);
        
        return e.reply([
            `【帝阵反噬】`,
            `你踏入青帝坟冢，却触发混沌杀阵！`,
            `混沌青莲摇曳，万道青霞斩落：`,
            `"妖体未纯，难承帝道！"`,
            `你祭出妖血抵挡：`,
            `「噗——」妖血飞溅，帝威透体！`,
            `惩罚：气血减少30% (剩余:${player.当前血量})`,
            `青帝道音回荡：`,
            `"淬炼妖血，再来一试！"`
        ].join('\n'));
    }
    
    // ==== 探索成功奖励 ====
    const qingDiGongfa = [
        {name: "妖帝古经", desc: "青帝根本功法，可修混沌青莲道果"},
        {name: "妖帝九斩", desc: "九式斩仙秘术，破灭万法"},
        {name: "混沌种青莲", desc: "演化混沌青莲异象，镇压诸天"}
    ];
    
    // 获取可奖励功法
    const availableGongfa = [];
    for (const gongfa of qingDiGongfa) {
        const hasLearned = player.学习的功法?.includes(gongfa.name);
        const inNajie = await exist_najie_thing(usr_qq, gongfa.name, "功法");
        
        if (!hasLearned && !inNajie) {
            availableGongfa.push(gongfa);
        }
    }
    
    // 所有功法都已拥有时改为修为奖励
    if (availableGongfa.length === 0) {
        const expReward = 150000000; // 1.5亿修为
        player.修为 += expReward;
        player.last_qingdi_explore = currentTime;
        await Write_player(usr_qq, player);
        
        return e.reply([
            `【帝缘已尽】`,
            `你踏入青帝坟冢，却见混沌青莲已然凋零！`,
            `青帝残念显化：`,
            `"汝已得吾之真传，此世帝缘已尽..."`,
            `青莲凋零处，一缕帝气灌入你体内！`,
            `获得：${expReward.toLocaleString()}修为`
        ].join('\n'));
    }
    
    // 随机获取一个功法
    const reward = availableGongfa[Math.floor(Math.random() * availableGongfa.length)];
    await Add_najie_thing(usr_qq, reward.name, "功法", 1);
    player.last_qingdi_explore = currentTime;
    await Write_player(usr_qq, player);
    
    return e.reply([
        `【青帝传承】`,
        `你以妖血为引，开启青帝坟冢！`,
        `坟冢深处，一株混沌青莲摇曳生辉：`,
        `- 莲叶铭刻「妖帝古经」`,
        `- 莲茎蕴含「妖帝九斩」`,
        `- 莲心演化「混沌种青莲」`,
        `你与${reward.name}产生共鸣！`,
        `青莲道则融入你仙台秘境，`,
        `妖帝的无上传承烙印神魂！`,
        `获得：【${reward.name}】`,
        `青帝道音回荡：`,
        `"以我之道，证汝帝路！"`
    ].join('\n'));
}
// 乱古遗址探索
async exploreLuanGu(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // 检查传闻
    if (!player.乱古传闻) {
        return e.reply([
            `【遗址无踪】`,
            `你欲探索乱古遗址，却不知其方位！`,
            `虚空传来道音：`,
            `"非历经百败者，不可见乱古帝踪！"`,
        ].join('\n'));
    }
    
    // 检查百败之证
   // const baiBaiCount = await exist_najie_thing(usr_qq, "百败之证", "道具");
   // if (baiBaiCount < 1) {
    //    return e.reply([
    //        `【帝威拒斥】`,
     //       `乱古遗址入口，九座魔碑轰然降临！`,
   //         `碑文血光冲天："非持百败之证者，不得入内！"`,
    //        `提示：需经历百场败绩，凝聚「百败之证」`,
   //         `方可承受乱古大帝的传承考验`,
    //    ].join('\n'));
   // }
    
    // 消耗百败之证
   // await Add_najie_thing(usr_qq, "百败之证", "道具", -1);
    
    // CD检查（24小时）
    const currentTime = Date.now();
    const lastExploreTime = player.last_luangu_explore || 0;
    const cdTime = 24 * 3600 * 1000; // 24小时CD
    
    if (currentTime - lastExploreTime < cdTime) {
        const remainingTime = cdTime - (currentTime - lastExploreTime);
        const hours = Math.floor(remainingTime / 3600000);
        const minutes = Math.floor((remainingTime % 3600000) / 60000);
        
        return e.reply([
            `【心魔反噬】`,
            `你强行冲击乱古遗址，却引动心魔劫！`,
            `乱古战斧虚影斩落虚空：`,
            `"道心未稳，需${hours}时${minutes}分方可再探！"`,
        ].join('\n'));
    }
    
    // 记录探索时间
    player.last_luangu_explore = currentTime;
    await Write_player(usr_qq, player);
    
    // 探索结果（60%成功，40%失败）
    const random = Math.random();
    if (random < 0.4) {
        // 探索失败
        const failureText = [
            `【心魔劫】`,
            `你踏入乱古遗址，却陷入百世轮回！`,
            `斩我明道诀化作心魔利刃，`,
            `永恒的放逐将你打入时空裂缝！`,
            `历经九死一生才逃出遗址，`,
            `道心受损，修为大减！`,
            `惩罚：`,
            `- 修为减少15%`,
            `- 气血减少25%`,
        ].join('\n');
        
        // 惩罚
        player.修为 = Math.floor(player.修为 * 0.85);
        player.当前血量 = Math.floor(player.当前血量 * 0.75);
        await Write_player(usr_qq, player);
        
        return e.reply(failureText);
    }
    
  // 探索成功
const luanGuGongfa = [
    "乱古经", "斩我明道诀", "永恒的放逐"
];

// 过滤掉玩家已经拥有的功法
const availableGongfa = [];
for (const gongfa of luanGuGongfa) {
    // 检查玩家是否已学习该功法
    const hasLearned = player.学习的功法 && player.学习的功法.includes(gongfa);
    // 检查纳戒中是否已有该功法
    const inNajie = await exist_najie_thing(usr_qq, gongfa, "功法");
    
    if (!hasLearned && !inNajie) {
        availableGongfa.push(gongfa);
    }
}

// 如果所有功法都已拥有
if (availableGongfa.length === 0) {
    // 改为给予其他奖励，例如大量修为或稀有道具
    player.修为 += 100000000; // 增加10亿修为
    await Write_player(usr_qq, player);
    
    const alternativeRewardText = [
        `【帝缘已尽】`,
        `你踏入乱古遗址，却见三块道碑尽皆黯淡！`,
        `乱古大帝的虚影显化虚空：`,
        `"汝已得吾之真传，此世帝缘已尽..."`,
        `大帝挥手间，一道本源帝气灌入你体内！`,
    ].join('\n');
    
    return e.reply(alternativeRewardText);
}

// 随机选择一个功法
const randomIndex = Math.floor(Math.random() * availableGongfa.length);
const learnedGongfa = availableGongfa[randomIndex];

// 添加功法
await Add_najie_thing(usr_qq, learnedGongfa, "功法", 1);

const successText = [
    `【乱古传承】`,
    `你踏入北原冰层，在百败之证指引下开启乱古遗址！`,
    `▂▂▂▂▂▂▂乱古帝陵▂▂▂▂▂▂▂`,
    `帝陵深处，三块道碑镇压万古：`,
    `- 一块铭刻「乱古」帝文`,
    `- 一块流转「斩我」道则`,
    `- 一块散发「放逐」神威`,
    `你以百败之证为钥，与${learnedGongfa}道碑共鸣！`,
    `道碑化作帝经融入你识海，`,
    `乱古大帝的至高传承烙印道基！`,
    `获得：【${learnedGongfa}】`,
    `此乃乱古大帝证道之法，威能逆乱古今！`,
].join('\n');

return e.reply(successText);}
async dating(e) {
    if (!verc({ e })) return false;
    const usr_qq = (await channel(e.user_id.toString().replace('qg_',''))).toString();
    
    if (!await existplayer(usr_qq)) return false;
    
    const player = await Read_player(usr_qq);
    
    // CD检查（6小时）
    const currentTime = Date.now();
    const lastDatingTime = player.last_dating_time || 0;
    const cdTime = 6 * 3600 * 1000; // 6小时CD
    
    if (currentTime - lastDatingTime < cdTime) {
        const remainingTime = cdTime - (currentTime - lastDatingTime);
        const hours = Math.floor(remainingTime / 3600000);
        const minutes = Math.floor((remainingTime % 3600000) / 60000);
        
        return e.reply([
            `【天机反噬】`,
            `你强行推演天机，却遭大道反噬！`,
            `天机老人咳血警示：`,
            `"天机不可轻泄！需调息${hours}时${minutes}分方可再窥天秘"`,
        ].join('\n'));
    }
    
    // 源石不足处理
    if (player.源石 < 5000000) {
        return e.reply([
            `【源石不足】`,
            `你欲寻北斗星域秘闻，却连打点天机阁的源石都凑不齐！`,
            `天机老人拂袖冷笑："区区${player.源石}源石，也配窥探大帝道场天机？"`,
            `需500万源石方能在北斗星域打探天机`
        ].join('\n'));
    }
    
    const random = Math.random();
    player.源石 -= 5000000;
    player.last_dating_time = currentTime; // 记录本次打听时间
    
    // 检查秘闻状态
    const isHrenRumorTaken = await checkRumorInServer('狠人传闻');
    const isLuanGuRumorTaken = await checkRumorInServer('乱古传闻');
    const isQingDiRumorTaken = await checkRumorInServer('青帝传闻'); // 新增青帝传闻检查
    
    // 如果所有秘闻都已被择主
    if (isHrenRumorTaken && isLuanGuRumorTaken && isQingDiRumorTaken) {
        const allTakenText = [
            `【天机已尽】`,
            `你耗费500万源石推演天机，却见天机老人神色黯然！`,
            `"北斗星域三大秘闻皆已择主，此世帝缘已尽..."`,
            `青铜罗盘轰然炸裂，碎片划破虚空！`,
            `天机老人咳血道：`,
            `"大道机缘，唯属一人！此世再无秘闻可寻..."`,
        ].join('\n');
        
        await Write_player(usr_qq, player);
        return e.reply(allTakenText);
    }
    
    // 动态调整概率
    let failureProb = 0.5;
    let hrenProb = 0.15;
    let luanguProb = 0.15;
    let qingdiProb = 0.2; // 新增青帝传闻概率
    
    // 概率调整逻辑
    const adjustProbabilities = () => {
        const totalTaken = [isHrenRumorTaken, isLuanGuRumorTaken, isQingDiRumorTaken].filter(Boolean).length;
        const availableProb = hrenProb + luanguProb + qingdiProb;
        
        if (totalTaken === 3) return; // 所有秘闻都被获取
        
        // 如果某个秘闻已被择主，将其概率分配给其他未获取的秘闻
        if (isHrenRumorTaken) {
            const remainingProbs = [luanguProb, qingdiProb].filter(p => p > 0);
            if (remainingProbs.length > 0) {
                const addPerProb = hrenProb / remainingProbs.length;
                luanguProb += !isLuanGuRumorTaken ? addPerProb : 0;
                qingdiProb += !isQingDiRumorTaken ? addPerProb : 0;
            }
            hrenProb = 0;
        }
        
        if (isLuanGuRumorTaken) {
            const remainingProbs = [hrenProb, qingdiProb].filter(p => p > 0);
            if (remainingProbs.length > 0) {
                const addPerProb = luanguProb / remainingProbs.length;
                hrenProb += !isHrenRumorTaken ? addPerProb : 0;
                qingdiProb += !isQingDiRumorTaken ? addPerProb : 0;
            }
            luanguProb = 0;
        }
        
        if (isQingDiRumorTaken) {
            const remainingProbs = [hrenProb, luanguProb].filter(p => p > 0);
            if (remainingProbs.length > 0) {
                const addPerProb = qingdiProb / remainingProbs.length;
                hrenProb += !isHrenRumorTaken ? addPerProb : 0;
                luanguProb += !isLuanGuRumorTaken ? addPerProb : 0;
            }
            qingdiProb = 0;
        }
    };
    
    adjustProbabilities();
    
    // 失败分支（50%概率）
    if (random < failureProb) {
        const failureTexts =  [
            `【天机混沌】`,
            `你耗费500万源石推演天机，却见青铜罗盘剧烈震颤！`,
            `天机老人面色骤变：`,
            `"不好！有至尊级存在遮掩了北斗星域的天机！"`,
            `虚空突然裂开一道缝隙，一只遮天巨手拍下！`,
            `罗盘应声而碎，天机老人咳血倒退：`,
            `"快走！是生命禁区里的古老存在出手了！"`,
            `你被震飞万里，神魂险些崩裂...`
        ];
        
        await Write_player(usr_qq, player);
        return e.reply(failureTexts[Math.floor(Math.random() * failureTexts.length)]);
    }
    // 狠人秘闻分支
    else if (random < failureProb + hrenProb) {
        // 如果狠人秘闻已被择主，直接跳过
        if (isHrenRumorTaken) {
            const rumorTakenText = [
                `【天机已泄】`,
                `你耗费500万源石推演天机，却见天机老人神色剧变！`,
                `"狠人道场天机已被他人截取！"`,
                `青铜罗盘轰然炸裂，碎片划破虚空！`,
                `天机老人咳血道：`,
                `"大道机缘，唯属一人！此世狠人道场已择主..."`,
            ].join('\n');
            
            await Write_player(usr_qq, player);
            return e.reply(rumorTakenText);
        }
        
        const successText = [
            `【惊天秘闻·狠人道场】`,
            `你以500万源石为代价，请动天机老人推演天机！`,
            `青铜罗盘炸裂的刹那，一道血字浮现在虚空：`,
            `"狠人道场现世于北域荒原！"`,
            `天机老人咳血警示：`,
            `"需集齐四种至强体质的本源精血，`,
            `方能在月圆之夜开启道场禁制！"`,
            `至强体质包括：`,
            `- 荒古圣体`,
            `- 先天道胎`,
            `- 神体`,
            `- 天妖体`,
            `此秘闻已烙印于你识海，永世不忘！`
        ].join('\n');
        
        player.狠人传闻 = 1;
        await Write_player(usr_qq, player);
        
        return e.reply(successText);
    }
    // 乱古秘闻分支
    else if (random < failureProb + hrenProb + luanguProb) {
        // 如果乱古秘闻已被择主，直接跳过
        if (isLuanGuRumorTaken) {
            const rumorTakenText = [
                `【帝踪已逝】`,
                `你追寻乱古大帝遗址，却见虚空崩裂！`,
                `一道横贯古今的斧影劈开星域：`,
                `"乱古传承已择主！后来者止步！"`,
                `帝威弥漫中，你手中兽皮古卷化为飞灰...`,
            ].join('\n');
            
            await Write_player(usr_qq, player);
            return e.reply(rumorTakenText);
        }
        
        const successText = [
            `【万古秘辛·乱古遗址】`,
            `你在葬帝星一处古矿深处，发现半卷染血的兽皮古卷！`,
            `古卷记载着惊天秘闻：`,
            `"乱古大帝坐化之地，藏于北原万丈冰层之下！"`,
            `卷末以帝血书警告：`,
            `"非历经百败者，入之必遭心魔噬魂！"`,
            `此秘闻已融入你神魂，永世不灭！`
        ].join('\n');
        
        player.乱古传闻 = 1;
        await Write_player(usr_qq, player);
        
        return e.reply(successText);
    }
    // 青帝秘闻分支（新增）
    else {
        // 如果青帝秘闻已被择主，直接跳过
        if (isQingDiRumorTaken) {
            const rumorTakenText = [
                `【帝冢已封】`,
                `你追寻青帝坟冢，却见东荒南域妖气冲天！`,
                `一株混沌青莲虚影显化九天：`,
                `"妖帝传承已择主！非妖体血脉者，速退！"`,
                `青帝道音回荡，你被震退万里...`,
            ].join('\n');
            
            await Write_player(usr_qq, player);
            return e.reply(rumorTakenText);
        }
        
        const successText = [
            `【妖帝秘闻·青帝坟冢】`,
            `你在东荒南域一处古林，发现一株枯萎的混沌青莲！`,
            `青莲枯萎处，浮现帝纹：`,
            `"妖帝坟冢，隐于南域妖林深处！"`,
            `帝纹旁有血书警示：`,
            `"非纯正妖体血脉，入之必遭万妖噬魂！"`,
            `此秘闻已融入你血脉，永世不忘！`,
            `提示：青帝传承唯妖体血脉可继承`
        ].join('\n');
        
        player.青帝传闻 = 1;
        await Write_player(usr_qq, player);
        
        return e.reply(successText);
    }
}
  async Show_najie_luck(e){
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;

    let img = await get_najie_chouchou_img(e);
    e.reply(img);
    return false;
  }

  //#我的纳戒
  async Show_najie(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let img = await get_najie_img(e);
    e.reply(img);
    return false;
  }

  //纳戒升级
  async Lv_up_najie(e) {
    if (!verc({ e })) return false;
    let flag = await Go(e);
    if (!flag) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let najie = await Read_najie(usr_qq);
    let player = await Read_player(usr_qq);
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let najie_num = cf.najie_num;
    let najie_price = cf.najie_price;
    if (najie.等级 == najie_num.length) {
      e.reply('你的纳戒已经是最高级的了');
      return false;
    }
    if (player.灵石 < najie_price[najie.等级]) {
      e.reply(
        `灵石不足,还需要准备${najie_price[najie.等级] - player.灵石}灵石`
      );
      return false;
    }
    await Add_灵石(usr_qq, -najie_price[najie.等级]);
    najie.灵石上限 = najie_num[najie.等级];
    najie.等级 += 1;
    await Write_najie(usr_qq, najie);
    e.reply(
      `你的纳戒升级成功,花了${
        najie_price[najie.等级 - 1]
      }灵石,目前纳戒灵石存储上限为${najie.灵石上限},可以使用【#我的纳戒】来查看`
    );
    return false;
  }
  // 检查服务器中是否已有剑云海传人
async  checkJianyunhaiChuanren() {
    const playerFiles = fs.readdirSync(__PATH.player_path);
    const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
    
    for (const file of jsonFiles) {
        const playerId = file.replace(".json", '');
        const playerData = await Read_player(playerId);
        
        // 检查玩家势力是否为剑云海且职位为传人
        if (playerData.势力 === "剑云海" && playerData.势力职位 === "传人") {
            return true; // 已存在传人
        }
    }
    return false; // 没有传人
}
  // 在pushInfo方法中添加私信发送逻辑
async pushInfo(id, is_group, msg) {
    if (is_group) {
        await Bot.pickGroup(id)
            .sendMsg(msg)
            .catch(err => {
                Bot.logger.mark(err);
            });
    } else {
        // 添加私信发送逻辑
        try {
            const user = Bot.pickUser(id);
            await user.sendMsg(msg);
        } catch (err) {
            Bot.logger.error(`私信发送失败 [QQ: ${id}]`, err);
            throw err; // 抛出错误以便上层处理
        }
    }
}
}
async function checkRumorInServer(rumorName) {
    let files = fs.readdirSync(__PATH.player_path);
    files = files.filter(file => file.endsWith(".json"));
    
    for (let i = 0; i < files.length; i++) {
        let this_qq = files[i].replace(".json", '');
        let otherPlayer = await Read_player(this_qq);
        
        // 检查传闻是否存在（永久有效）
        if (otherPlayer[rumorName] === 1) {
            return true; // 传闻已被他人获取
        }
    }
    return false; // 传闻未被获取
}
