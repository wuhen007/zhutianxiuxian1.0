// import { plugin, verc, config, data } from '../../api/api.js';
// import {
//     existplayer,
//     exist_najie_thing,
//     ForwardMsg,
//     isNotNull,
//     Write_player,
//     Add_najie_thing,
//     Read_equipment,
//     bigNumberTransform,
//     Add_血气,
//     Add_职业经验,
//     Add_灵石,
//     Add_源石,
//     Add_热量,
//     Add_饱食度,
//     Add_HP,
//     Add_修为,
//     Add_寿元,
//     Read_player,
//     zd_battle,
//     channel
// } from '../../model/xiuxian.js';
// import {
//     readall,
//     dataall
// } from '../../model/duanzaofu.js';

// export class BattleTianjiao extends plugin {
//     constructor() {
//         super({
//             name: 'Yunzai_Bot_BattleTianjiao',
//             dsc: '天骄世界BOSS模块',
//             event: 'message',
//             priority: 600,
//             rule: [
//                 {
//                     reg: '^#讨伐天骄(.+)$',
//                     fnc: 'ChallengeTianjiao'
//                 },
//                 {
//                     reg: '^#天骄列表$',
//                     fnc: 'TianjiaoList'
//                 },
//                 {
//                     reg: '^#天骄状态(.+)?$',
//                     fnc: 'TianjiaoStatus'
//                 },
//                 {
//                     reg: '^#我的天骄挑战$',
//                     fnc: 'MyTianjiaoChallenge'
//                 },
//                 {
//                     reg: '^#刷新天骄(.+)$',
//                     fnc: 'ForceRefreshTianjiao',
//                     permission: 'master'
//                 },
//                 {
//                     reg: '^#天骄伤害榜(.+)?$',
//                     fnc: 'TianjiaoDamageRank'
//                 },
//                  {
//                     reg: '^#重置天骄冷却\\s*(\\S+)\\s*(.+)$',
//                     fnc: 'ResetPlayerCooldown',
//                     permission: 'master'
//                 }
//             ]
//         });

//         // 地点映射表
//         this.LOCATION_MAP = {
//             '凡间': 0,
//             '仙界': 1,
//             '下界八域': 1.5,
//             '遮天位面': 2,
//             '九天十地': 2.5,
//             '界海': 3,
//             '时间长河': 4,
//             '永恒未知之地': 5,
//             '仙域': 6
//         };

//         // 天骄个人冷却时间（30分钟）
//         this.userCooldownMs = 30 * 60 * 1000;
//         // 天骄刷新时间（6小时）
//         this.tianjiaoRefreshMs = 6 * 60 * 60 * 1000;

//         // 初始化天骄状态
//         this.initTianjiaoStatus();
//     }

//     // 初始化天骄状态
//     async initTianjiaoStatus() {
//         try {
//             const tianjiaoItems = data.weimiantianjiao_list;
//             await Promise.all(tianjiaoItems.map(async tianjiao => {
//                 const statusKey = `tianjiao:status:${tianjiao.名号}`;
//                 let status = await redis.get(statusKey);

//                 if (!status) {
//                     // 初始化天骄状态
//                     const hp = tianjiao.血量上限 || tianjiao.当前血量;
//                     const initialStatus = {
//                         currentHP: hp,
//                         maxHP: hp,
//                         isAlive: true,
//                         refreshTime: 0,
//                         lastChallenged: 0,
//                         totalDamage: 0
//                     };
//                     await redis.set(statusKey, JSON.stringify(initialStatus));
//                 } else {
//                     status = JSON.parse(status);
//                     // 检查是否需要刷新
//                     if (!status.isAlive && Date.now() > status.refreshTime) {
//                         const hp = tianjiao.血量上限 || tianjiao.当前血量;
//                         status.currentHP = hp;
//                         status.maxHP = hp;
//                         status.isAlive = true;
//                         status.refreshTime = 0;
//                         status.totalDamage = 0;
//                         await redis.set(statusKey, JSON.stringify(status));
//                     }
//                 }
//             }));
//         } catch (error) {
//             console.error('初始化天骄状态失败:', error);
//         }
//     }

//   // 获取天骄数据
// async getTianjiaoData(name) {
//     const tianjiaoItems = data.weimiantianjiao_list;
//     const tianjiao = tianjiaoItems.find(tj => tj.名号 === name);
    
//     if (!tianjiao) return null;
    
//     // 返回结构化数据
//     return {
//         名号: tianjiao.名号,
//         攻击: parseInt(tianjiao.攻击) || 0,
//         防御: parseInt(tianjiao.防御) || 0,
//         当前血量: parseInt(tianjiao.当前血量) || 0,
//         血量上限: parseInt(tianjiao.血量上限) || 0,
//         暴击率: parseFloat(tianjiao.暴击率) || 0,
//         灵根: tianjiao.灵根 || "无",
//         法球倍率: parseFloat(tianjiao.法球倍率) || 1.0,
//         暴击伤害: parseFloat(tianjiao.暴击伤害) || 1.5,
//         学习的功法: tianjiao.学习的功法 || [],
//         境界: tianjiao.境界 || "未知",
//         位面: tianjiao.位面 || "未知",
//         身份: tianjiao.身份 || "天骄"
//     };
// }

//     // 获取天骄状态
//     async getTianjiaoStatus(name) {
//         const statusKey = `tianjiao:status:${name}`;
//         let status = await redis.get(statusKey);

//         if (!status) {
//             // 如果状态不存在，初始化状态
//             const tianjiao = await this.getTianjiaoData(name);
//             if (!tianjiao) return null;

//             const hp = tianjiao.血量上限 || tianjiao.当前血量;
//             const initialStatus = {
//                 currentHP: hp,
//                 maxHP: hp,
//                 isAlive: true,
//                 refreshTime: 0,
//                 lastChallenged: 0,
//                 totalDamage: 0
//             };
//             await redis.set(statusKey, JSON.stringify(initialStatus));
//             return initialStatus;
//         }

//         status = JSON.parse(status);

//         // 检查是否需要自动刷新
//         if (!status.isAlive && Date.now() > status.refreshTime) {
//             const tianjiao = await this.getTianjiaoData(name);
//             if (tianjiao) {
//                 const hp = tianjiao.血量上限 || tianjiao.当前血量;
//                 status.currentHP = hp;
//                 status.maxHP = hp;
//                 status.isAlive = true;
//                 status.refreshTime = 0;
//                 status.totalDamage = 0;
//                 await redis.set(statusKey, JSON.stringify(status));
//             }
//         }

//         return status;
//     }

//     // 更新天骄状态
//     async updateTianjiaoStatus(name, updates) {
//         const statusKey = `tianjiao:status:${name}`;
//         let status = await this.getTianjiaoStatus(name);

//         if (!status) return false;

//         // 合并更新
//         Object.assign(status, updates);
//         await redis.set(statusKey, JSON.stringify(status));

//         return true;
//     }
//     async ResetPlayerCooldown(e) {
//         try {
//             const match = e.msg.match(/^#重置天骄冷却\s*(\S+)\s*(.+)$/);
//             if (!match) {
//                 return e.reply("指令格式错误，请使用: #重置天骄冷却 [玩家QQ] [天骄名]");
//             }
            
//             const playerQQ = match[1].trim();
//             const tianjiaoName = match[2].trim();
            
//             // 验证玩家是否存在
//             if (!await existplayer(playerQQ)) {
//                 return e.reply(`未找到玩家 ${playerQQ}`);
//             }
            
//             // 验证天骄是否存在
//             const B_player = await this.getTianjiaoData(tianjiaoName);
//             if (!B_player) {
//                 return e.reply(`未找到名为「${tianjiaoName}」的天骄`);
//             }
            
//             // 重置冷却时间
//             const userCooldownKey = `tianjiao:user_cooldown:${playerQQ}:${tianjiaoName}`;
//             await redis.del(userCooldownKey);
            
//             // 获取玩家名
//             const playerData = await Read_player(playerQQ);
//             const playerName = playerData.名号 || playerQQ;
            
//             e.reply(`已重置玩家 ${playerName} 对天骄 ${tianjiaoName} 的挑战冷却时间`);
//         } catch (error) {
//             console.error('重置天骄冷却失败:', error);
//             e.reply('重置天骄冷却失败，请检查指令格式');
//         }
//     }

//     // 获取所有天骄列表
//     async TianjiaoList(e) {
//         try {
//             const tianjiaoItems = data.weimiantianjiao_list;

//             let msg = "【天骄列表】\n";
//             for (const tj of tianjiaoItems) {
//                 const status = await this.getTianjiaoStatus(tj.名号);
//                 const statusText = status.isAlive ? "存活" : `已击败(刷新:${this.formatTime(status.refreshTime - Date.now())})`;
//                 msg += `${tj.名号} - ${tj.境界} - 位面: ${this.getLocationName(tj.位面)} - ${statusText}\n`;
//             }

//             msg += "\n使用 #讨伐天骄[天骄名] 进行挑战";
//             msg += "\n使用 #天骄状态[天骄名] 查看详细状态";
//             e.reply(msg);
//         } catch (error) {
//             console.error('获取天骄列表失败:', error);
//             e.reply('获取天骄列表失败，请稍后再试');
//         }
//     }

//     // 格式化时间
//     formatTime(ms) {
//         if (ms <= 0) return "已刷新";
//         const hours = Math.floor(ms / (60 * 60 * 1000));
//         const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
//         return `${hours}时${minutes}分`;
//     }

//     // 根据位面ID获取位面名称
//     getLocationName(locationId) {
//         for (const [name, id] of Object.entries(this.LOCATION_MAP)) {
//             if (id === locationId) return name;
//         }
//         return "未知位面";
//     }

//     // 检查玩家是否在正确位面
//     async checkPlayerLocation(A_player, B_player) {
//         const playerLocation = A_player.power_place;
//         const tianjiaoLocation = B_player.位面;

//         return playerLocation === tianjiaoLocation;
//     }

//     // 查看天骄状态
//     async TianjiaoStatus(e) {
//         try {
//             let tianjiaoName = e.msg.match(/^#天骄状态(.+)?$/)[1];

//             if (!tianjiaoName || tianjiaoName.trim() === '') {
//                 return e.reply("请指定天骄名称，例如: #天骄状态华云飞");
//             }

//             tianjiaoName = tianjiaoName.trim();
//             const B_player = await this.getTianjiaoData(tianjiaoName);
//             if (!B_player) {
//                 return e.reply(`未找到名为「${tianjiaoName}」的天骄`);
//             }

//             const status = await this.getTianjiaoStatus(tianjiaoName);
//             if (!status) {
//                 return e.reply(`获取天骄状态失败`);
//             }

//             const hpPercent = (status.currentHP / status.maxHP * 100).toFixed(2);
//             const locationName = this.getLocationName(B_player.位面);

//             let msg = [
//                 `【${tianjiaoName}】状态`,
//                 `境界：${B_player.境界}`,
//                 `位面：${locationName}`,
//                 `攻击：${bigNumberTransform(B_player.攻击)}`,
//                 `防御：${bigNumberTransform(B_player.防御)}`,
//                 `血量：${bigNumberTransform(status.currentHP)}/${bigNumberTransform(status.maxHP)} (${hpPercent}%)`,
//                 `状态：${status.isAlive ? '存活' : '已击败'}`,
//                 `累计伤害：${bigNumberTransform(status.totalDamage)}`
//             ];

//             if (!status.isAlive) {
//                 msg.push(`刷新时间：${this.formatTime(status.refreshTime - Date.now())}`);
//             }

//             e.reply(msg.join("\n"));
//         } catch (error) {
//             console.error('查看天骄状态失败:', error);
//             e.reply('查看天骄状态失败，请稍后再试');
//         }
//     }

//     // 讨伐天骄
//     async ChallengeTianjiao(e) {
//         try {
//             const user = e.user_id;
//             const tianjiaoName = e.msg.match(/^#讨伐天骄(.+)$/)[1].trim();

//             if (!e.isGroup) return;
//             if (!await existplayer(user)) {
//                 return e.reply("请先踏入仙途");
//             }

//             const A_player = await Read_player(user);
//             if (A_player.当前血量 <= 0) {
//                 return e.reply("你当前重伤未愈,无法挑战");
//             }
//             if (A_player.寿元 <= 0) {
//                 return e.reply("道友都快坐化了，难道想彻底死去吗？");
//             }

//             // 获取天骄数据
//             const tianjiaoData = await this.getTianjiaoData(tianjiaoName);
//             if (!tianjiaoData) {
//                 return e.reply(`未找到名为「${tianjiaoName}」的天骄`);
//             }

//             // // 检查天骄状态
//             // const status = await this.getTianjiaoStatus(tianjiaoName);
//             // if (!status.isAlive) {
//             //     return e.reply(`${tianjiaoName}已被击败，${this.formatTime(status.refreshTime - Date.now())}后刷新`);
//             // }

//             // // 检查玩家是否在正确位面
//             // const isInRightLocation = await this.checkPlayerLocation(A_player, B_player);
//             // if (!isInRightLocation) {
//             //     const locationName = this.getLocationName(B_player.位面);
//             //     return e.reply(`你当前不在「${locationName}」，无法挑战${tianjiaoName}`);
//             // }

//             // // 个人冷却检查
//             // const userCooldownKey = `tianjiao:user_cooldown:${user}:${tianjiaoName}`;
//             // const userCooldownEnd = await redis.get(userCooldownKey);
//             // if (userCooldownEnd) {
//             //     const remainingSeconds = Math.ceil((parseInt(userCooldownEnd) - Date.now()) / 1000);
//             //     if (remainingSeconds > 0) {
//             //         const minutes = Math.floor(remainingSeconds / 60);
//             //         const seconds = remainingSeconds % 60;
//             //         return e.reply(`挑战${tianjiaoName}冷却中[${minutes}分${seconds}秒]`);
//             //     }
//             // }

//             const originalPlayerHP = A_player.当前血量;
//             const originalPet = A_player.仙宠;
//             A_player.仙宠 = null; // 临时移除仙宠


//             // B_player.法球倍率 = B_player.灵根.法球倍率;
//             // B_player.当前血量 = status.currentHP;
//             // B_player.血量上限 = status.maxHP;
//                         // B_player.当前血量 = status.currentHP;
//             // B_player.血量上限 = status.maxHP;
//    // 构造战斗对象
//         const B_player = {
//             名号: tianjiaoData.名号,
//             攻击: tianjiaoData.攻击,
//             防御: tianjiaoData.防御,
//             当前血量: tianjiaoData.当前血量,
//             血量上限: tianjiaoData.血量上限,
//             暴击率: tianjiaoData.暴击率,
//             法球倍率: tianjiaoData.法球倍率,
//             暴击伤害: tianjiaoData.暴击伤害,
//             学习的功法: tianjiaoData.学习的功法
//         };


//             // 进行战斗
//             const result = await zd_battle( A_player,B_player);
//             let msg = result.msg;
//             await ForwardMsg(e, msg);
            
//             // 计算实际造成的伤害
//             const initialHP = status.currentHP;
//             const finalHP = Math.max(0, B_player.当前血量);
//             const battleDamage = Math.max(0, initialHP - finalHP);
            
//             const playerWin = finalHP <= 0;

//             // 更新天骄状态
//             const updates = {
//                 currentHP: finalHP,
//                 lastChallenged: Date.now(),
//                 totalDamage: status.totalDamage + battleDamage
//             };

//             if (finalHP <= 0) {
//                 updates.isAlive = false;
//                 updates.refreshTime = Date.now() + this.tianjiaoRefreshMs;
//             }

//             await this.updateTianjiaoStatus(tianjiaoName, updates);

//             // 记录战斗结果
//             result.win = playerWin;
//             result.playerName = A_player.名号;
//             result.tianjiaoName = tianjiaoName;
//             result.damage = battleDamage;

//             const battleKey = `tianjiao:battle:${user}:${tianjiaoName}:${Date.now()}`;
//             await redis.set(battleKey, JSON.stringify(result));

//             // 更新伤害排行榜
//             await this.updateDamageRank(user, A_player.名号, tianjiaoName, battleDamage);

//             // 恢复玩家状态
//             A_player.当前血量 = originalPlayerHP;
//             A_player.仙宠 = originalPet;
//             data.setData("player", user, A_player);

//             // 设置个人冷却
//             await redis.set(userCooldownKey, (Date.now() + this.userCooldownMs).toString());

//             // 处理战斗结果
//             if (playerWin) {
//                 // 广播击败消息
//                 e.reply(` ${A_player.名号} 成功击败了 ${tianjiaoName}！`);

//                 // 击败奖励
//                 const rewards = await this.getTianjiaoRewards(B_player);
//                 let rewardMsg = `击败奖励：`;

//                 for (const reward of rewards) {
//                     await Add_najie_thing(user, reward.name, reward.class, reward.数量);
//                     rewardMsg += `\n${reward.name} x${reward.数量}`;
//                 }

//                 // 特殊掉落
//                 if (B_player.特殊掉落) {
//                     for (const special of B_player.特殊掉落) {
//                         if (Math.random() < special.概率) {
//                             await Add_najie_thing(user, special.name, special.class, special.数量);
//                             rewardMsg += `\n特殊掉落：${special.name} x${special.数量}`;
//                             if (special.效果) {
//                                 rewardMsg += `（${special.效果}）`;
//                             }
//                         }
//                     }
//                 }

//                 e.reply(rewardMsg);
//             } else {
//                 // 战斗失败
//                 const baseReward = Math.floor(battleDamage * 0.005);
//                 if (baseReward > 0) {
//                     await Add_灵石(user, baseReward);
//                     await Add_修为(user, baseReward);
//                     await Add_血气(user, baseReward);
//                     e.reply(`你与${tianjiaoName}激战一番，造成${bigNumberTransform(battleDamage)}伤害，但最终不敌。获得灵石，修为与血气${bigNumberTransform(baseReward)}`);
//                 } else {
//                     const baodiReward = 500000;
//                     await Add_灵石(user, baodiReward);
//                     await Add_修为(user, baodiReward);
//                     await Add_血气(user, baodiReward);
//                     e.reply(`你与${tianjiaoName}交战，但未能造成有效伤害，获得安慰奖励灵石，修为与血气${bigNumberTransform(baodiReward)}。`);
//                 }
//             }
//         } catch (error) {
//             console.error('讨伐天骄失败:', error);
//             e.reply('讨伐天骄失败，请稍后再试');
//         }
//     }

//     // 更新伤害排行榜
//     async updateDamageRank(userId, playerName, tianjiaoName, damage) {
//         try {
//             const rankKey = `tianjiao:damage_rank:${tianjiaoName}`;
//             let rankData = await redis.get(rankKey);

//             if (!rankData) {
//                 rankData = [];
//             } else {
//                 rankData = JSON.parse(rankData);
//             }

//             const existingIndex = rankData.findIndex(item => item.userId === userId);
//             if (existingIndex >= 0) {
//                 // 更新现有记录
//                 rankData[existingIndex].damage += damage;
//                 rankData[existingIndex].lastChallenge = Date.now();
//                 rankData[existingIndex].totalChallenges = (rankData[existingIndex].totalChallenges || 0) + 1;
//             } else {
//                 // 添加新记录
//                 rankData.push({
//                     userId,
//                     playerName,
//                     damage,
//                     lastChallenge: Date.now(),
//                     totalChallenges: 1
//                 });
//             }

//             // 按伤害值排序
//             rankData.sort((a, b) => b.damage - a.damage);

//             // 只保留前100名
//             if (rankData.length > 100) {
//                 rankData = rankData.slice(0, 100);
//             }

//             await redis.set(rankKey, JSON.stringify(rankData));
//         } catch (error) {
//             console.error('更新伤害排行榜失败:', error);
//         }
//     }

//     // 查看天骄伤害榜
//     async TianjiaoDamageRank(e) {
//         try {
//             let tianjiaoName = e.msg.match(/^#天骄伤害榜(.+)?$/)[1];

//             if (!tianjiaoName || tianjiaoName.trim() === '') {
//                 return e.reply("请指定天骄名称，例如: #天骄伤害榜华云飞");
//             }

//             tianjiaoName = tianjiaoName.trim();
//             const B_player = await this.getTianjiaoData(tianjiaoName);
//             if (!B_player) {
//                 return e.reply(`未找到名为「${tianjiaoName}」的天骄`);
//             }

//             const rankKey = `tianjiao:damage_rank:${tianjiaoName}`;
//             let rankData = await redis.get(rankKey);

//             if (!rankData) {
//                 return e.reply(`${tianjiaoName}暂无伤害记录`);
//             }

//             rankData = JSON.parse(rankData);
//             if (rankData.length === 0) {
//                 return e.reply(`${tianjiaoName}暂无伤害记录`);
//             }

//             // 获取总伤害
//             const totalDamage = rankData.reduce((sum, item) => sum + item.damage, 0);

//             // 获取用户排名
//             const userRank = rankData.findIndex(item => item.userId === e.user_id) + 1;
//             const userData = rankData.find(item => item.userId === e.user_id);

//             // 构建排行榜消息
//             let msg = `【${tianjiaoName}伤害榜】\n总伤害: ${bigNumberTransform(totalDamage)}\n\n`;

//             for (let i = 0; i < Math.min(10, rankData.length); i++) {
//                 const item = rankData[i];
//                 const percent = ((item.damage / totalDamage) * 100).toFixed(2);
//                 msg += `第${i + 1}名：${item.playerName}\n伤害：${bigNumberTransform(item.damage)} (${percent}%)\n\n`;
//             }

//             // 显示当前用户在10名以外
//             if (userRank > 10 && userData) {
//                 const percent = ((userData.damage / totalDamage) * 100).toFixed(2);
//                 msg += `...\n第${userRank}名. ${userData.playerName}\n伤害：${bigNumberTransform(userData.damage)} (${percent}%)\n`;
//             } else if (!userData) {
//                 msg += `\n并没有你的伤害记录`;
//             }

//             e.reply(msg);
//         } catch (error) {
//             console.error('查看天骄伤害榜失败:', error);
//             e.reply('查看天骄伤害榜失败，请稍后再试');
//         }
//     }

//     // 获取天骄奖励
//     async getTianjiaoRewards(B_player) {
//         const rewards = [];

//         if (B_player.掉落物) {
//             for (const item of B_player.掉落物) {
//                 if (Math.random() < item.概率) {
//                     rewards.push({
//                         name: item.name,
//                         class: item.class,
//                         数量: item.数量
//                     });
//                 }
//             }
//         }



//         return rewards;
//     }

//     // 查看我的天骄挑战记录
//     async MyTianjiaoChallenge(e) {
//         try {
//             const user = e.user_id;
//             const tianjiaoItems = data.weimiantianjiao_list;

//             let msg = "【我的天骄挑战记录】\n";
//             let hasRecord = false;

//             for (const B_player of tianjiaoItems) {
//                 // 检查冷却状态
//                 const cooldownKey = `tianjiao:user_cooldown:${user}:${B_player.名号}`;
//                 const cooldownEnd = await redis.get(cooldownKey);

//                 // 检查伤害排名
//                 const rankKey = `tianjiao:damage_rank:${B_player.名号}`;
//                 let rankData = await redis.get(rankKey);

//                 let userDamage = 0;
//                 let userRank = 0;

//                 if (rankData) {
//                     rankData = JSON.parse(rankData);
//                     const userEntry = rankData.find(item => item.userId === user);
//                     if (userEntry) {
//                         userDamage = userEntry.damage;
//                         userRank = rankData.findIndex(item => item.userId === user) + 1;
//                     }
//                 }

//                 if (cooldownEnd || userDamage > 0) {
//                     hasRecord = true;
//                     msg += `\n${B_player.名号} - 伤害: ${bigNumberTransform(userDamage)}`;

//                     if (userRank > 0) {
//                         msg += ` - 排名: 第${userRank}名`;
//                     }

//                     if (cooldownEnd) {
//                         const remainingSeconds = Math.ceil((parseInt(cooldownEnd) - Date.now()) / 1000);
//                         if (remainingSeconds > 0) {
//                             const minutes = Math.floor(remainingSeconds / 60);
//                             const seconds = remainingSeconds % 60;
//                             msg += ` [冷却:${minutes}分${seconds}秒]`;
//                         }
//                     }
//                 }
//             }

//             if (!hasRecord) {
//                 msg += "\n暂无挑战记录，使用 #讨伐天骄[天骄名] 开始挑战";
//             }

//             e.reply(msg);
//         } catch (error) {
//             console.error('查看我的天骄挑战记录失败:', error);
//             e.reply('查看挑战记录失败，请稍后再试');
//         }
//     }

//     // 强制刷新天骄（管理员命令）
//     async ForceRefreshTianjiao(e) {
//         try {
//             let tianjiaoName = e.msg.match(/^#刷新天骄(.+)$/)[1].trim();

//             const B_player = await this.getTianjiaoData(tianjiaoName);
//             if (!B_player) {
//                 return e.reply(`未找到名为「${tianjiaoName}」的天骄`);
//             }

//             // 重置天骄状态
//             const hp = B_player.血量上限 || B_player.当前血量;
//             await this.updateTianjiaoStatus(tianjiaoName, {
//                 currentHP: hp,
//                 maxHP: hp,
//                 isAlive: true,
//                 refreshTime: 0,
//                 totalDamage: 0
//             });

//             // 清空伤害榜
//             const rankKey = `tianjiao:damage_rank:${tianjiaoName}`;
//             await redis.del(rankKey);

//             e.reply(`已强制刷新 ${tianjiaoName}`);
//         } catch (error) {
//             console.error('强制刷新天骄失败:', error);
//             e.reply('强制刷新天骄失败');
//         }
//     }
// }