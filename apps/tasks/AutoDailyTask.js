import { plugin } from '../../api/api.js';
import xiuxianData from '../../model/XiuxianData.js';
import {
    Read_player,
    existplayer,
    Write_player,
    Add_灵石,
    Add_源石,
    Add_修为,
    Add_血气,
    Add_najie_thing,
    channel
} from '../../model/xiuxian.js';
import schedule from 'node-schedule';

/**
 * 自动每日任务系统
 * 为道法仙术玩家自动执行：签到、领取俸禄、天道赐福、道法赐福
 */
export class AutoDailyTask extends plugin {
    constructor() {
        super({
            name: 'AutoDailyTask',
            dsc: '自动每日任务系统',
            event: 'message',
            priority: 1000, // 高优先级确保先初始化
            rule: [
                {
                    reg: '^#测试自动任务$',
                    fnc: 'testAutoTask',
                    permission: 'master'
                }
            ]
        });
        
        // 初始化定时任务
        this.initAutoTask();
    }

    /**
     * 初始化自动任务
     */
    initAutoTask() {
        // 每天00:05执行（避免与道法仙术扣减任务冲突）
        schedule.scheduleJob('0 5 0 * * *', async () => {
            console.log('开始执行自动每日任务');
            await this.executeAutoTask();
            console.log('自动每日任务执行完成');
        });
        
        console.log('自动每日任务定时器已设置 - 每天00:05执行');
    }

    /**
     * 执行自动任务
     */
    async executeAutoTask() {
        try {
            // 获取所有道法仙术玩家
            const daofaList = xiuxianData.getDaofaList();
            const playerQQs = Object.keys(daofaList);
            
            if (playerQQs.length === 0) {
                console.log('当前无道法仙术玩家，跳过自动任务');
                return;
            }

            console.log(`发现${playerQQs.length}位道法仙术玩家，开始执行自动任务`);

            let successCount = 0;
            let failCount = 0;

            for (const qq of playerQQs) {
                try {
                    await this.processPlayer(qq);
                    successCount++;
                } catch (error) {
                    console.error(`处理玩家 ${qq} 时出错:`, error);
                    failCount++;
                }
            }

            console.log(`自动任务完成 - 成功: ${successCount}, 失败: ${failCount}`);
        } catch (error) {
            console.error('执行自动任务时发生严重错误:', error);
        }
    }

    /**
     * 处理单个玩家的自动任务
     */
    async processPlayer(qq) {
        // 转换QQ号格式
        const usr_qq = await channel(qq.toString().replace('qg_', ''));
        
        // 检查玩家是否存在
        if (!await existplayer(usr_qq)) {
            console.log(`玩家 ${usr_qq} 不存在，跳过`);
            return;
        }

        // 读取玩家数据
        const player = await Read_player(usr_qq);
        
        // 检查是否为道法仙术玩家
        if (player.daofaxianshu !== 2) {
            console.log(`玩家 ${usr_qq} 道法仙术状态异常，跳过`);
            return;
        }

        // 检查是否过期
        const nowTime = new Date().getTime();
        if (!player.daofaxianshu_endtime || player.daofaxianshu_endtime <= nowTime) {
            console.log(`玩家 ${usr_qq} 道法仙术已过期，跳过`);
            return;
        }

        console.log(`开始为玩家 ${player.名号 || usr_qq} 执行自动任务`);

        // 1. 自动签到
        await this.autoSign(usr_qq, player);
        
        // 2. 自动领取势力俸禄
        await this.autoClaimSalary(usr_qq, player);
        
        // 3. 自动天道赐福
        await this.autoTiandaoCifu(usr_qq, player);
        
        // 4. 自动道法赐福
        await this.autoDaofaCifu(usr_qq, player);

        console.log(`玩家 ${player.名号 || usr_qq} 自动任务执行完成`);
    }

    /**
     * 自动签到
     */
    async autoSign(usr_qq, player) {
        try {
            // 检查今日是否已签到
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
            
            // 这里需要根据实际的签到存储方式调整
            // 假设使用Redis存储签到时间
            const redis = require('../../model/Redis.js').redis;
            const lastSignTime = await redis.get(`xiuxian:player:${usr_qq}:lastsign_time`);
            
            if (lastSignTime) {
                const lastSignDate = new Date(parseInt(lastSignTime));
                const lastSignStr = `${lastSignDate.getFullYear()}-${lastSignDate.getMonth()+1}-${lastSignDate.getDate()}`;
                
                if (lastSignStr === todayStr) {
                    console.log(`玩家 ${usr_qq} 今日已签到，跳过`);
                    return;
                }
            }

            // 执行签到逻辑（简化版）
            const isDaofaPlayer = player.daofaxianshu == 2;
            let baseMultiplier = isDaofaPlayer ? 2 : 1;
            let 加成 = player.level_id * player.Physique_id + (player.mijinglevel_id * player.xiangulevel_id);
            
            let gift_xiuwei = player.连续签到天数 * 10000 * baseMultiplier * 加成;
            let ticketCount = 5 * baseMultiplier;
            let yuanshi = player.连续签到天数 * 300 * baseMultiplier * 加成;

            // 更新连续签到天数
            const yesterday = new Date(today.getTime() - 86400000);
            const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`;
            
            if (lastSignTime) {
                const lastSignDate = new Date(parseInt(lastSignTime));
                const lastSignDateStr = `${lastSignDate.getFullYear()}-${lastSignDate.getMonth()+1}-${lastSignDate.getDate()}`;
                
                if (lastSignDateStr === yesterdayStr) {
                    player.连续签到天数 += 1;
                } else {
                    player.连续签到天数 = 1;
                }
            } else {
                player.连续签到天数 = 1;
            }

            // 发放奖励
            await Add_najie_thing(usr_qq, '秘境之匙', '道具', ticketCount);
            await Add_najie_thing(usr_qq, '喇叭', '道具', ticketCount);
            await Add_源石(usr_qq, yuanshi);
            await Add_灵石(usr_qq, yuanshi);
            await Add_修为(usr_qq, gift_xiuwei);
            await Add_血气(usr_qq, gift_xiuwei);

            // 保存数据
            await Write_player(usr_qq, player);
            await redis.set(`xiuxian:player:${usr_qq}:lastsign_time`, new Date().getTime());

            console.log(`玩家 ${usr_qq} 自动签到完成`);
        } catch (error) {
            console.error(`玩家 ${usr_qq} 自动签到失败:`, error);
        }
    }

    /**
     * 自动领取势力俸禄
     */
    async autoClaimSalary(usr_qq, player) {
        try {
            if (!player.势力) {
                console.log(`玩家 ${usr_qq} 未加入势力，跳过俸禄领取`);
                return;
            }

            const redis = require('../../model/Redis.js').redis;
            const today = new Date().toISOString().split('T')[0];
            
            // 检查今日是否已领取
            let redisKey;
            if (player.势力 === "瑶池") {
                redisKey = `xiuxian:player:${usr_qq}:yaochi_salary_date`;
            } else if (player.势力 === "摇光圣地") {
                redisKey = `xiuxian:player:${usr_qq}:yaoguang_salary_date`;
            } else {
                console.log(`玩家 ${usr_qq} 势力 ${player.势力} 不支持自动俸禄，跳过`);
                return;
            }

            const lastClaimDate = await redis.get(redisKey);
            if (lastClaimDate === today) {
                console.log(`玩家 ${usr_qq} 今日已领取俸禄，跳过`);
                return;
            }

            // 计算俸禄
            let salary = 0;
            const position = player.势力职位 || "记名弟子";

            if (player.势力 === "瑶池") {
                const salaryTable = {
                    "记名女弟子": 100000,
                    "正式女弟子": 500000,
                    "亲传女弟子": 2000000,
                    "真传女弟子": 5000000,
                    "圣女": 12000000
                };
                salary = salaryTable[position] || 0;
            } else if (player.势力 === "摇光圣地") {
                const salaryTable = {
                    "记名弟子": 100000,
                    "外门弟子": 500000,
                    "内门弟子": 2000000,
                    "核心弟子": 5000000,
                    "真传弟子": 8000000,
                    "圣子": 12000000,
                    "圣女": 12000000
                };
                salary = salaryTable[position] || 0;
            }

            if (salary > 0) {
                // 道法仙术玩家俸禄翻倍
                if (player.daofaxianshu === 2) {
                    salary *= 2;
                }
                
                player.源石 += salary;
                await Write_player(usr_qq, player);
                await redis.set(redisKey, today);

                console.log(`玩家 ${usr_qq} 自动领取${player.势力}俸禄 ${salary} 源石`);
            }
        } catch (error) {
            console.error(`玩家 ${usr_qq} 自动领取俸禄失败:`, error);
        }
    }

    /**
     * 自动天道赐福
     */
    async autoTiandaoCifu(usr_qq, player) {
        try {
            // 检查境界要求
            if (player.level_id < 22) {
                console.log(`玩家 ${usr_qq} 境界不足，跳过天道赐福`);
                return;
            }

            const redis = require('../../model/Redis.js').redis;
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;

            // 检查今日是否已赐福
            const lastCifuTimeStr = await redis.get(`xiuxian:player:${usr_qq}:lastCifuTime`);
            if (lastCifuTimeStr) {
                const lastCifuTime = new Date(parseInt(lastCifuTimeStr));
                const lastCifuStr = `${lastCifuTime.getFullYear()}-${lastCifuTime.getMonth()+1}-${lastCifuTime.getDate()}`;
                
                if (lastCifuStr === todayStr) {
                    console.log(`玩家 ${usr_qq} 今日已天道赐福，跳过`);
                    return;
                }
            }

            // 计算奖励
            let lastjiangli = Math.floor(player.level_id * 0.1);
            if (player.daofaxianshu === 2) {
                lastjiangli *= 2; // 道法仙术翻倍
            }

            // 发放基础奖励
            await Add_najie_thing(usr_qq, '秘境之匙', '道具', lastjiangli);
            await Add_najie_thing(usr_qq, '打工券', '道具', lastjiangli);

            // 职业额外奖励
            if (player.occupation === '侠客') {
                await Add_najie_thing(usr_qq, '侠客令', '道具', 3);
            } else if (player.occupation === '唤魔者') {
                await Add_najie_thing(usr_qq, '唤魔令', '道具', 3);
            }

            // 等级额外奖励
            if (player.level_id > 41) {
                await Add_najie_thing(usr_qq, '仙舟', '道具', lastjiangli);
            }
            if (player.level_id > 54) {
                await Add_najie_thing(usr_qq, '神域令牌', '道具', lastjiangli);
            }

            // 道法仙术额外奖励
            if (player.daofaxianshu === 2) {
                await Add_najie_thing(usr_qq, '九阶玄元丹', '丹药', lastjiangli);
                await Add_najie_thing(usr_qq, '九阶淬体丹', '丹药', lastjiangli);
            }

            // 记录时间
            await redis.set(`xiuxian:player:${usr_qq}:lastCifuTime`, new Date().getTime());

            console.log(`玩家 ${usr_qq} 自动天道赐福完成`);
        } catch (error) {
            console.error(`玩家 ${usr_qq} 自动天道赐福失败:`, error);
        }
    }

    /**
     * 自动道法赐福
     */
    async autoDaofaCifu(usr_qq, player) {
        try {
            const redis = require('../../model/Redis.js').redis;
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;

            // 检查今日是否已赐福
            const lastSignTime = await redis.get(`xiuxian:player:${usr_qq}:lastsign_time3`);
            if (lastSignTime) {
                const lastSignDate = new Date(parseInt(lastSignTime));
                const lastSignStr = `${lastSignDate.getFullYear()}-${lastSignDate.getMonth()+1}-${lastSignDate.getDate()}`;
                
                if (lastSignStr === todayStr) {
                    console.log(`玩家 ${usr_qq} 今日已道法赐福，跳过`);
                    return;
                }
            }

            // 更新连续赐福天数
            const yesterday = new Date(today.getTime() - 86400000);
            const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`;
            
            if (lastSignTime) {
                const lastSignDate = new Date(parseInt(lastSignTime));
                const lastSignDateStr = `${lastSignDate.getFullYear()}-${lastSignDate.getMonth()+1}-${lastSignDate.getDate()}`;
                
                if (lastSignDateStr === yesterdayStr) {
                    player.道法赐福天数 += 1;
                } else {
                    player.道法赐福天数 = 1;
                }
            } else {
                player.道法赐福天数 = 1;
            }

            // 连续7天重置奖励
            if (player.道法赐福天数 >= 7) {
                player.道法赐福天数 = 1;
                await Add_najie_thing(usr_qq, '超越宝盒', '盒子', 5);
            }

            // 计算奖励
            let gift_xiuwei = player.道法赐福天数 * 10000 * player.level_id * player.Physique_id * (player.mijinglevel_id + player.xiangulevel_id);
            const tickets = player.道法赐福天数 * 2;

            // 发放奖励
            await Add_najie_thing(usr_qq, '龙', '道具', tickets);
            await Add_najie_thing(usr_qq, '腾', '道具', tickets);
            await Add_najie_thing(usr_qq, '虎', '道具', tickets);
            await Add_najie_thing(usr_qq, '跃', '道具', tickets);
            await Add_najie_thing(usr_qq, '遣龙令', '道具', tickets);
            await Add_najie_thing(usr_qq, '遣虎令', '道具', tickets);
            await Add_najie_thing(usr_qq, '位面传送阵', '道具', 1);
            await Add_najie_thing(usr_qq, '灵品秘境结算卡', '道具', tickets);
            
            await Add_修为(usr_qq, gift_xiuwei);
            await Add_血气(usr_qq, gift_xiuwei);

            // 保存数据
            await Write_player(usr_qq, player);
            await redis.set(`xiuxian:player:${usr_qq}:lastsign_time3`, new Date().getTime());

            console.log(`玩家 ${usr_qq} 自动道法赐福完成`);
        } catch (error) {
            console.error(`玩家 ${usr_qq} 自动道法赐福失败:`, error);
        }
    }

    /**
     * 测试自动任务（仅管理员可用）
     */
    async testAutoTask(e) {
        if (!e.isMaster) {
            return false;
        }

        e.reply('开始测试自动任务...');
        await this.executeAutoTask();
        e.reply('自动任务测试完成，请查看控制台日志');
        return true;
    }
}