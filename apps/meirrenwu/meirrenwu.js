import { plugin, puppeteer, verc, data, Show } from '../../api/api.js';
import {
    Read_player,
    existplayer,
    add_renwu,
    Write_player,
    Write_renwu,
    Read_renwu,
    channel
} from '../../model/xiuxian.js';
import { Add_灵石, Add_修为, Add_血气, Add_najie_thing } from '../../model/xiuxian.js';
import {
    DAILY_TASK_WENXIAN_EXP,
    findDailyTaskIndex,
    getDailyTaskDateKey,
    getDailyTaskLingshiProgress,
    getDailyTaskPotentialReward,
    isDailyTaskComplete,
    resetDailyTaskLingshiProgress,
    wasDailyTaskAcceptedToday,
} from '../../model/dailyTask.js';
import { getMinggeEffects, grantMinggePotential } from '../../model/mingge.js';
import { recordWenXianTaskProgress, recordWenXianTrial } from '../../model/wenxianling.js';
import { WenXianLing } from '../WenXianLing/WenXianLing.js';
import {
    acquireRedisLock,
    refreshRedisLock,
    releaseRedisLock,
} from '../SecretPlace/xianyiBaodiState.js';

const DAILY_TASK_LOCK_KEY = 'xiuxian:lock:daily_task_records';
const DAILY_TASK_LOCK_TTL_SECONDS = 60;

function syncLingshiProgress(record, player) {
    const progress = getDailyTaskLingshiProgress(player);
    if (record.wancheng1 === 1) record.jilu1 = Math.max(Number(record.jilu1) || 0, progress.spent);
    if (record.wancheng2 === 1) record.jilu2 = Math.max(Number(record.jilu2) || 0, progress.gained);
}

async function grantTaskStepReward(usr_qq, dateKey, taskNumber, amount) {
    const key = `daily-task:${dateKey}:step-${taskNumber}`;
    await Add_修为(usr_qq, amount, { idempotencyKey: `${key}:xiuwei` });
    await Add_血气(usr_qq, amount, { idempotencyKey: `${key}:xueqi` });
    await Add_灵石(usr_qq, amount, {
        idempotencyKey: `${key}:lingshi`,
        trackDailyTask: false,
    });
}

async function withDailyTaskLock(e, callback) {
    const token = `${Date.now()}:${Math.random()}`;
    if (!await acquireRedisLock(redis, DAILY_TASK_LOCK_KEY, token, DAILY_TASK_LOCK_TTL_SECONDS)) {
        return e.reply('每日任务正在结算其他指令，请稍候再试。');
    }
    const refreshTimer = setInterval(() => {
        refreshRedisLock(redis, DAILY_TASK_LOCK_KEY, token, DAILY_TASK_LOCK_TTL_SECONDS)
            .catch(error => console.error('续期每日任务记录锁失败:', error));
    }, 15_000);
    refreshTimer.unref?.();
    try {
        return await callback();
    } finally {
        clearInterval(refreshTimer);
        await releaseRedisLock(redis, DAILY_TASK_LOCK_KEY, token);
    }
}

/**
 * 作者：晓飞
 */

export class meirrenwu extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'meirrenwu',
            /** 功能描述 */
            dsc: '任务模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#获取每日任务$',
                    fnc: 'zuolao',
                },
                {
                    reg: '^#我的任务$',
                    fnc: 'look_renwu',
                },
                {
                    reg: '^#提交每日任务$',
                    fnc: 'zuowanle',
                },
                {
                    reg: '^#领取每日奖励$',
                    fnc: 'xingchen',
                }
            ],
        });
      
    }
    /**
     * 接取每日任务
     */
    async zuolao(e) {
        if (!e.isGroup) return false;
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        if (!await existplayer(usr_qq)) return false;

        return withDailyTaskLock(e, async () => {
            const nowTime = Date.now();
            const lastTaskTime = await redis.get(`xiuxian:player:${usr_qq}:last_renwu_time`);
            if (wasDailyTaskAcceptedToday(lastTaskTime, nowTime)) {
                return e.reply('今日已经接取过任务了');
            }

            const player = await Read_player(usr_qq);
            let renwu = await Read_renwu();
            let i = findDailyTaskIndex(renwu, usr_qq);
            if (i < 0) {
                await add_renwu(usr_qq, 1);
                renwu = await Read_renwu();
                i = findDailyTaskIndex(renwu, usr_qq);
            }
            if (i < 0) return e.reply('每日任务存档建立失败，请稍后再试。');

            Object.assign(renwu[i], {
                wancheng1: 1,
                wancheng2: 1,
                wancheng3: 1,
                renwu: 0,
                jilu1: 0,
                jilu2: 0,
                jilu3: 0,
            });
            await Write_renwu(renwu);
            resetDailyTaskLingshiProgress(player, nowTime);
            await Write_player(usr_qq, player, { trackDailyTask: false });
            await redis.set(`xiuxian:player:${usr_qq}:last_renwu_time`, nowTime);
            await redis.del(`xiuxian:player:${usr_qq}:renwu_lingshi_jilu`);
            return e.reply('今日任务成功接取');
        });
    }
    /**
     * 提交每日任务
     */
    async zuowanle(e) {
        if (!e.isGroup) return false;
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        if (!await existplayer(usr_qq)) return false;
        const lastTaskTime = await redis.get(`xiuxian:player:${usr_qq}:last_renwu_time`);
        if (!wasDailyTaskAcceptedToday(lastTaskTime)) {
            return e.reply('请先发送 #获取每日任务 接取今日任务。');
        }

        return withDailyTaskLock(e, async () => {
        const renwu = await Read_renwu();
        const i = findDailyTaskIndex(renwu, usr_qq);
        if (i < 0) return e.reply('请先发送 #获取每日任务 接取今日任务。');
        if (isDailyTaskComplete(renwu[i])) {
            return e.reply(renwu[i].renwu === 2 ? '今日奖励已经领取。' : '全部任务已完成，请发送 #领取每日奖励。');
        }
        if (renwu[i].wancheng1 === 0 && renwu[i].wancheng2 === 0 && renwu[i].wancheng3 === 0) {
            return e.reply('请先发送 #获取每日任务 接取今日任务。');
        }

        const player = await Read_player(usr_qq);
        syncLingshiProgress(renwu[i], player);
        const dateKey = getDailyTaskDateKey();

        let m = '';
        let dengji = renwu[i].等级
        //这里是任务提交需要的东西
        //需要消耗：(任务等级*5+player炼气+player练体)*5000个灵石
        let xuyao1 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
        //需要获得：(任务等级*5+player炼气+player练体)*5000个灵石
        let xuyao2 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
        //需要进入等级+4次秘境
        let xuyao3 = dengji + 1
        //这里是奖励
        //看你怎么弄了，反正给的东西是不多的，巨少！(估计狗都嫌弃)
        //这个是获得的灵石，修为，血气
        //计算公式：(任务等级*(player炼气+player练体))*5000
        let jiangli = (dengji * (player.level_id + player.Physique_id)) * 3000
        //这个是获得的物品的数量
        //计算公式：任务等级
        //这个是任务经验，任务等级越高获得的东西越多，但是这个等级挺难升的，不用改，问题不大
        //(我自己测试是64练气54炼体，也要做上小一周才能升一级，而且越往后越难升)
        //计算公式：((任务等级*5)+player炼气+player练体)*8
        let jingyan = ((dengji * 5) + player.level_id + player.Physique_id) * 8
        //结算任务
        if (renwu[i].jilu1 > xuyao1 - 1&& renwu[i].wancheng1 == 1) {
            renwu[i].wancheng1 = 2;
            renwu[i].jilu1 = 0;
            await grantTaskStepReward(usr_qq, dateKey, 1, jiangli);
            renwu[i].经验 += jingyan
            m += `你完成了任务1,获得了：\n1.修为*${jiangli}\n2.血气*${jiangli}\n3.灵石*${jiangli}\n4.任务经验*${jingyan}\n`;
        }
        if (renwu[i].jilu2 > xuyao2 - 1&& renwu[i].wancheng2 == 1) {
            renwu[i].wancheng2 = 2;
            renwu[i].jilu2 = 0;
            await grantTaskStepReward(usr_qq, dateKey, 2, jiangli);
            renwu[i].经验 += jingyan
            m += `你完成了任务2,获得了：\n1.修为*${jiangli}\n2.血气*${jiangli}\n3.灵石*${jiangli}\n4.任务经验*${jingyan}\n`;
        }
        if (renwu[i].jilu3 > xuyao3 - 1 && renwu[i].wancheng3 == 1) {
            renwu[i].wancheng3 = 2;
            renwu[i].jilu3 = 0;
            await grantTaskStepReward(usr_qq, dateKey, 3, jiangli);
            renwu[i].经验 += jingyan
            m += `你完成了任务3,获得了：\n1.修为*${jiangli}\n2.血气*${jiangli}\n3.灵石*${jiangli}\n4.任务经验*${jingyan}\n`;
        }
        if (isDailyTaskComplete(renwu[i])) {
            const rewardPlayer = await Read_player(usr_qq);
            const potentialBase = getDailyTaskPotentialReward(rewardPlayer);
            const potentialKey = `daily-task:${dateKey}:potential`;
            rewardPlayer._rewardClaims ??= {};
            let potentialGain = Number(rewardPlayer._rewardClaims[potentialKey]?.amount) || 0;
            if (!rewardPlayer._rewardClaims[potentialKey]) {
                potentialGain = grantMinggePotential(
                    rewardPlayer,
                    getMinggeEffects(rewardPlayer, data.minggeList),
                    potentialBase,
                );
                rewardPlayer._rewardClaims[potentialKey] = { amount: potentialGain, claimedAt: Date.now() };
            }
            const passTrial = recordWenXianTrial(rewardPlayer, 'daily');
            const weeklyTask = recordWenXianTaskProgress(rewardPlayer, 'dailyTask');
            await Write_player(usr_qq, rewardPlayer);
            renwu[i].renwu = 1;
            m += `你已完成全部每日任务，仙道潜力 +${potentialGain}，可以领取奖励了！`;
            if (passTrial.changed) {
                m += `\n问仙试炼：每日任务 ${passTrial.trial.dailyTasks}/7。`;
            }
            if (weeklyTask.changed) {
                m += `\n每周任务：每日任务 ${weeklyTask.weekly.progress.dailyTask}/5。`;
            }
        }
        //这里是经验升级的地方，你如果要是需要改记得给底下还有俩也改了，一般来说不用改，要的挺多的，等级巨难升
        //计算公式：(任务等级*1000加2333)*5
        let shengji = (dengji * 2200 + 1000) * 10 + 2333
        if (renwu[i].经验 > shengji - 1) {
            renwu[i].等级++
            renwu[i].经验 -= shengji
        }
        await Write_renwu(renwu);
        //最后发送任务完成状态
        if (m) return e.reply(m);
        return e.reply('你还有任务没完成哦~');
        });
    }
    /**
     * 我的任务
     */
    
    async look_renwu(e) {
        if (!e.isGroup) return false;
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        if (!await existplayer(usr_qq)) return false;
        const lastTaskTime = await redis.get(`xiuxian:player:${usr_qq}:last_renwu_time`);
        if (!wasDailyTaskAcceptedToday(lastTaskTime)) {
            return e.reply('你今天还没有接取任务，请发送 #获取每日任务。');
        }

        let ready = false;
        await withDailyTaskLock(e, async () => {
            const renwu = await Read_renwu();
            const i = findDailyTaskIndex(renwu, usr_qq);
            if (i < 0) return e.reply('你还没有每日任务档案，请发送 #获取每日任务。');

            const player = await Read_player(usr_qq);
            const before = `${renwu[i].jilu1}:${renwu[i].jilu2}`;
            syncLingshiProgress(renwu[i], player);
            if (before !== `${renwu[i].jilu1}:${renwu[i].jilu2}`) await Write_renwu(renwu);
            ready = true;
        });
        if (!ready) return false;

        const img = await get_renwu_img(e);
        return e.reply(img);
    }
    /**
     * 领取每日奖励
     */
    async xingchen(e) {
        if (!e.isGroup) return false;
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        if (!await existplayer(usr_qq)) return false;
        const lastTaskTime = await redis.get(`xiuxian:player:${usr_qq}:last_renwu_time`);
        if (!wasDailyTaskAcceptedToday(lastTaskTime)) {
            return e.reply('请先发送 #获取每日任务 接取今日任务。');
        }

        return withDailyTaskLock(e, async () => {
        const renwu = await Read_renwu();
        const i = findDailyTaskIndex(renwu, usr_qq);
        if (i < 0) return e.reply('请先发送 #获取每日任务 接取今日任务。');
        if (!isDailyTaskComplete(renwu[i])) return e.reply('你还有任务没完成哦~');
        if (renwu[i].renwu === 2) return e.reply('你已经领取了每日任务奖励。');
        if (renwu[i].renwu !== 1) return e.reply('请先提交已完成的每日任务。');

        const player = await Read_player(usr_qq);
        let dengji = renwu[i].等级
        //这里是奖励
        //看你怎么弄了，反正给的东西是不多的，巨少！(估计狗都嫌弃)
        //这个是获得的灵石，修为，血气
        //计算公式：(任务等级*(player炼气+player练体))*8000
        let jiangli = (dengji * (player.level_id + player.Physique_id)) * 8000
        //这个是获得的物品的数量
        //计算公式：任务等级
        let wupin = dengji
        //这个是任务经验，任务等级越高获得的东西越多，但是这个等级挺难升的，不用改，问题不大
        //(我自己测试是64练气54炼体，也要做上小一周才能升一级，而且越往后越难升)
        //计算公式：((任务等级*5)+player炼气+player练体)*12
        let jingyan = ((dengji * 5) + player.level_id + player.Physique_id) * 12
        const rewardKey = `daily-task:${getDailyTaskDateKey()}:final`;
        await Add_修为(usr_qq, jiangli, { idempotencyKey: `${rewardKey}:xiuwei` });
        await Add_血气(usr_qq, jiangli, { idempotencyKey: `${rewardKey}:xueqi` });
        await Add_灵石(usr_qq, jiangli, {
            idempotencyKey: `${rewardKey}:lingshi`,
            trackDailyTask: false,
        });
        await Add_najie_thing(
            usr_qq,
            "秘境之匙",
            "道具",
            wupin,
            undefined,
            1,
            { idempotencyKey: `${rewardKey}:key` },
        );

        const latestPlayer = await Read_player(usr_qq);
        latestPlayer._rewardClaims ??= {};
        if (!latestPlayer._rewardClaims[`${rewardKey}:draws`]) {
            latestPlayer.抽奖次数 = (Number(latestPlayer.抽奖次数) || 0) + 3;
            latestPlayer._rewardClaims[`${rewardKey}:draws`] = { amount: 3, claimedAt: Date.now() };
            await Write_player(usr_qq, latestPlayer);
        }
        const passResult = await WenXianLing.addDailyTaskExp(usr_qq, DAILY_TASK_WENXIAN_EXP);
        if (passResult?.reason === 'failed') {
            return e.reply('问仙令经验发放失败，本次奖励状态已保留，请稍后重新领取。');
        }

        renwu[i].renwu = 2;
        renwu[i].经验 += jingyan
        //这里是经验升级的地方，你如果要是需要改记得给底下的显示也改了，一般来说不用改，要的挺多的，等级巨难升
        //计算公式：(任务等级*1000加2333)*5
        let shengji = (dengji * 2200 + 1000) * 10 + 2333
        if (renwu[i].经验 > shengji - 1) {
            renwu[i].等级 += 1
            renwu[i].经验 -= shengji
        }
        await Write_renwu(renwu);
        const passMessage = passResult?.reason === 'already_awarded'
            ? '7.问仙令经验已发放'
            : !passResult
            ? '7.问仙令经验发放失败，请稍后重试'
            : passResult.unlocked === false
                ? `7.问仙道痕*${passResult.added}（暂存${passResult.pendingExp}/1000）`
                : `7.问仙令经验*${passResult.added}${passResult.levelUp ? `（等级提升至${passResult.newLevel}级）` : ''}`;
        return e.reply(`你领取了每日任务奖励，获得了：\n1.修为*${jiangli}\n2.血气*${jiangli}\n3.灵石*${jiangli}\n4.任务经验*${jingyan}\n5.秘境之匙*${wupin}个\n6.每日抽奖次数*3次\n${passMessage}\n`);
        });
    }
}
/**
 * 我的任务
 * @return image
 */

export async function get_renwu_img(e) {
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!data.existData('player', usr_qq)) return false;
    const player = await Read_player(usr_qq);
    const A = usr_qq;
    const renwu11 = await Read_renwu();
    const x = findDailyTaskIndex(renwu11, A);
    if (x < 0) {
        e.reply('你还没有每日任务档案，请发送 #获取每日任务。');
        return false;
    }
    const newaction = renwu11;
    let i;
    for (i = 0; i < newaction.length; i++) {
        if (newaction[i].player == A) {
            //这里是显示
            let dengji = renwu11[x].等级
            let xuyao1 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
            let xuyao2 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
            let xuyao3 = dengji + 1
            let ass;
            ass = newaction[i].经验;
            let renwu1 = '当前没有任务';
            let renwu2 = '当前没有任务';
            let renwu3 = '当前没有任务';
            if (renwu11[x].wancheng1 == 1) {
                renwu1 = `消耗${xuyao1}灵石(每次提交任务时才会刷新)`
            }
            if (renwu11[x].wancheng2 == 1) {
                renwu2 = `获取${xuyao2}灵石(每次提交任务时才会刷新)`
            }
            if (renwu11[x].wancheng3 == 1) {
                renwu3 = `前往${xuyao3}次秘境(沉迷不计入)`
            }
            let wc1;
            let wc2;
            let wc3;
            let rw1 = renwu11[x].jilu1;
            let rw2 = renwu11[x].jilu2;
            let rw3 = renwu11[x].jilu3;
            let wcrw1 = xuyao1;
            let wcrw2 = xuyao2;
            let wcrw3 = xuyao3;
            let new1 = newaction[x].等级;
            let shengji = (dengji * 2200 + 1000) * 10 + 2333
            let need = shengji;
            let need1 = Strand(ass, need);
            let renwu = `还有任务没完成哦~`;
            if (renwu11[x].renwu == 1) {
                renwu = `未领取,输入"#领取每日奖励"领取哦~`
            } else if (renwu11[x].renwu == 2) {
                renwu = `已领取`
            }
            if (renwu11[x].wancheng1 == 0) {
                wc1 = '(未接取)';
            } else if (renwu11[x].wancheng1 == 1) {
                wc1 = '(未完成)';
            } else if (renwu11[x].wancheng1 == 2) {
                wc1 = '(已完成)';
            }
            if (renwu11[x].wancheng2 == 0) {
                wc2 = '(未接取)';
            } else if (renwu11[x].wancheng2 == 1) {
                wc2 = '(未完成)';
            } else if (renwu11[x].wancheng2 == 2) {
                wc2 = '(已完成)';
            }
            if (renwu11[x].wancheng3 == 0) {
                wc3 = '(未接取)';
            } else if (renwu11[x].wancheng3 == 1) {
                wc3 = '(未完成)';
            } else if (renwu11[x].wancheng3 == 2) {
                wc3 = '(已完成)';
            }
            let renwu_data = {
                user_id: usr_qq,
                minghao: player.名号,
                jingyan: ass,
                dengji: new1,
                xuyao: need,
                baifenbixuyao: need1,
                rw1: renwu1,
                rw2: renwu2,
                rw3: renwu3,
                wancheng1: wc1,
                wancheng2: wc2,
                wancheng3: wc3,
                zhuangtai: renwu,
                wc1: rw1,
                wc2: rw2,
                wc3: rw3,
                xuyao1: wcrw1,
                xuyao2: wcrw2,
                xuyao3: wcrw3,
            };
            const data1 = await new Show(e).get_renwuData(renwu_data);
            return await puppeteer.screenshot('renwu', {
                ...data1,
            });
        }
    }
}
/**
 * @description: 进度条渲染
 * @param {Number} res 百分比小数
 * @return {*} css样式
 */

function Strand(now, max) {
    let num = (now / max * 100).toFixed(0);
    let mini
    if (num > 100) {
        mini = 100
    } else {
        mini = num
    }
    let strand = {
        style: `style=width:${mini}%`,
        num: num
    };
    return strand
}
