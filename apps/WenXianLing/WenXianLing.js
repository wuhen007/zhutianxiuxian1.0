import { plugin, puppeteer, data, Show } from '../../api/api.js';
import {
    Read_player,
    Write_player,
    existplayer,
    channel,
    Add_najie_thing,
} from '../../model/xiuxian.js';
import {
    WENXIAN_CLUE_COST,
    WENXIAN_DAILY_QUEST_EXP,
    WENXIAN_DAILY_QUEST_GOALS,
    WENXIAN_DAILY_TASK_TARGET,
    WENXIAN_DUNGEON_CLUE_PITY,
    WENXIAN_EXP_PER_LEVEL as EXP_PER_LEVEL,
    WENXIAN_MAX_LEVEL as MAX_LEVEL,
    WENXIAN_PENDING_EXP_CAP,
    WENXIAN_REQUIRED_REALM_LEVEL,
    WENXIAN_WEEKLY_TASK_EXP,
    WENXIAN_WEEKLY_TASK_GOALS,
    activateWenXianLing,
    addWenXianExp,
    calculateWenXianWeeklyRewards,
    claimWenXianWeeklyTask,
    ensureWenXianState,
    ensureWenXianTaskState,
    isWenXianEligible,
    isWenXianTrialComplete,
    isWenXianWeeklyTaskComplete,
    purchaseWenXianClue,
    recordWenXianTrial,
} from '../../model/wenxianling.js';
import {
    formatRealmEventLocation,
    formatRealmEventTravel,
    getRealmEventReach,
} from '../../model/realmEventLocation.js';
import {
    acquireRedisLock,
    releaseRedisLock,
} from '../SecretPlace/xianyiBaodiState.js';
import { WENXIAN_ENDLESS_REWARDS } from '../../model/endlessAccess.js';
import { getDailyTaskDateKey } from '../../model/dailyTask.js';
import {
    WENDAO_PALACE_DESC,
    WENDAO_PALACE_NAME,
    grantWendaoPalace,
} from '../../model/spiritUniverse.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';

/**
 * 问仙令 - 战令系统 v2
 * 60级，每级给修为+血气+灵石+源石（数量随级波动）
 * 每逢5/10倍数有额外奖励
 * 展示5级一组，随玩家等级推进自然看到后面
 */

// ====== 生成每级基础奖励（修为/血气/灵石/源石，确定但每级不同） ======
function generateLevelRewards(level) {
    const xiuweiBase = 8000000;
    const xueqiBase = 4000000;
    const lingshiBase = 15000000;
    const yuanshiBase = 15000000;

    // 每级增长系数
    const mult = 1 + level * 0.12;

    // 确定性波动种子
    const s1 = ((level * 17 + 31) % 13) / 26 + 0.75;   // 0.75 ~ 1.25
    const s2 = ((level * 23 + 47) % 13) / 26 + 0.75;
    const s3 = ((level * 29 + 59) % 13) / 26 + 0.75;
    const s4 = ((level * 37 + 73) % 13) / 26 + 0.75;

    return {
        xiuwei: Math.floor(xiuweiBase * mult * s1),
        xueqi: Math.floor(xueqiBase * mult * s2),
        lingshi: Math.floor(lingshiBase * mult * s3),
        yuanshi: Math.max(1, Math.floor(yuanshiBase * mult * s4)),
    };
}

// ====== 5x级额外奖励 ======
const BONUS_REWARDS = {
    5: {
        name: '初入仙途',
        desc: '踏上问仙之路的第一步',
        rewards: [
            { kind: '丹药', name: '大衍悟道丹', count: 5, label: '大衍悟道丹x5' },
            { kind: '仙道潜力', value: 20, label: '仙道潜力+20' },
            { kind: '丹药', name: '定神丹', count: 1, label: '定神丹x1' },
        ],
    },
    10: {
        name: '洗髓铸骨',
        desc: '洗髓丹淬炼识海，根骨得以强化',
        rewards: [
            { kind: '丹药', name: '洗髓丹', count: 3, label: '洗髓丹x3' },
            { kind: '仙道潜力', value: 25, label: '仙道潜力+25' },
        ],
    },
    15: {
        name: '灵台澄澈',
        desc: '问仙之路愈行愈明',
        rewards: [
            { kind: '丹药', name: '大衍悟道丹', count: 5, label: '大衍悟道丹x5' },
            { kind: '盒子', name: '超越宝盒', count: 1, label: '超越宝盒x1' },
            { kind: '仙道潜力', value: 30, label: '仙道潜力+30' },
        ],
    },
    20: {
        name: '道种感悟',
        desc: '以道种入药，感悟天地大道',
        rewards: [
            { kind: '盒子', name: '超越宝盒', count: 3, label: '超越宝盒x3' },
            { kind: '丹药', name: '大衍悟道丹', count: 2, label: '大衍悟道丹x2' },
        ],
    },
    25: {
        name: '识海拓宽',
        desc: '识海如苍穹，容纳更多道韵',
        rewards: [
            { kind: '盒子', name: '超越宝盒', count: 3, label: '超越宝盒x3' },
            { kind: '仙道潜力', value: 40, label: '仙道潜力+40' },
            { kind: '丹药', name: '七窍养神丹', count: 1, label: '七窍养神丹x1' },
        ],
    },
    30: {
        name: '九转玲珑',
        desc: '历经九转，灵台玲珑剔透',
        rewards: [
            { kind: '丹药', name: '九转玲珑丹', count: 10, label: '九转玲珑丹x10' },
            { kind: '仙道潜力', value: 50, label: '仙道潜力+50' },
        ],
    },
    35: {
        name: '天道眷顾',
        desc: '天道偶有眷顾，赐予感悟',
        rewards: [
             { kind: '道具', name: '轮回命签', count: 10, label: '轮回命签x10' },
            { kind: '仙道潜力', value: 60, label: '仙道潜力+60' },
            { kind: '丹药', name: '化仙丹', count: 1, label: '化仙丹x1' },
        ],
    },
    40: {
        name: '先天元灵',
        desc: '太虚清气拓展识海，令灵台愈发广大',
        rewards: [
             { kind: '道具', name: '命宫拓碑', count: 1, label: '命宫拓碑x1' },
            { kind: '丹药', name: '太虚拓识丹', count: 1, label: '太虚拓识丹x1' },
        ],
    },
    45: {
        name: '万法归宗',
        desc: '识海如海，万法归于一念',
        rewards: [
            { kind: '仙道潜力', value: 80, label: '仙道潜力+80' },
            { kind: '丹药', name: '太虚养神丹', count: 2, label: '太虚养神丹x2' },
        ],
    },
    50: {
        name: '混沌造化',
        desc: '混沌之气淬炼，造化无穷',
        rewards: [
            { kind: '丹药', name: '玄黄造化丹', count: 1, label: '玄黄造化丹x1' },
            { kind: '丹药', name: '天命轮回丹', count: 50, label: '天命轮回丹x50' },
            { kind: '丹药', name: '七窍养神丹', count: 2, label: '七窍养神丹x2' },
        ],
    },
    55: {
        name: '道心永固',
        desc: '问道至此，道心坚如磐石',
        rewards: [
            { kind: '仙道潜力', value: 100, label: '仙道潜力+100' },
            { kind: '丹药', name: '虚天悟道丹', count: 1, label: '虚天悟道丹x1' },
        ],
    },
    60: {
        name: '问仙者归途',
        desc: WENDAO_PALACE_DESC,
        rewards: [
            { kind: '丹药', name: '极道丹', count: 1, label: '极道丹x1' },
            { kind: '丹药', name: '太虚拓识丹', count: 2, label: '太虚拓识丹x2' },
            { kind: '仙道潜力', value: 500, label: '仙道潜力+500' },
            { kind: '称号', name: '问仙者', label: '限定称号「问仙者」' },
            { kind: '永久宝物', name: WENDAO_PALACE_NAME, label: WENDAO_PALACE_NAME },
        ],
    },
};

for (const [level, rewards] of Object.entries(WENXIAN_ENDLESS_REWARDS)) {
    if (BONUS_REWARDS[level]) BONUS_REWARDS[level].rewards.push(...rewards);
}

// 所有有额外奖励的节点
const BONUS_LEVELS = Object.keys(BONUS_REWARDS).map(Number);

const DAILY_QUEST_LABELS = {
    spiritHeart: '消耗心神',
    tianjiao: '讨伐天骄',
    dungeon: '副本结算',
};
const WEEKLY_TASK_LABELS = {
    dailyTask: '完成每日任务',
    tianjiao: '讨伐天骄',
    stoneMarket: '源石坊购石',
    spiritHeart: '消耗心神',
    dungeon: '副本结算',
};

/**
 * 格式化数字为可读文本
 */
function fmtNum(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
}

export class WenXianLing extends plugin {
    constructor() {
        super({
            name: 'WenXianLing',
            dsc: '问仙令战令系统',
            event: 'message',
            priority: 600,
            rule: [
                { reg: '^#问仙令$', fnc: 'showPass' },
                { reg: '^#问仙令任务$', fnc: 'showDailyQuests' },
                { reg: '^#(?:问仙令)?每周任务$', fnc: 'showWeeklyTask' },
                { reg: '^#领取每周任务$', fnc: 'claimWeeklyTask' },
                { reg: '^#领取问仙令(\\d+)?$', fnc: 'claimReward' },
                { reg: '^#重金求取问仙线索$', fnc: 'buyWenXianClue' },
                { reg: '^#探索问仙线索$', fnc: 'exploreWenXianClue' },
                { reg: '^#激活问仙令$', fnc: 'activatePass' },
                { reg: '^#问仙令帮助$', fnc: 'showHelp' },
            ],
        });
    }

    // ====== 展示战令UI（5级一页，居中玩家等级） ======
    async showPass(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) {
            e.reply('请先创建角色再使用问仙令！');
            return false;
        }
        const player = await Read_player(usr_qq);
        this._initPassData(player);
        await Write_player(usr_qq, player);

        if (!player.问仙令.unlocked) {
            return e.reply(this._getAcquisitionStatus(player).join('\n'));
        }

        const passData = player.问仙令;
        const currentLevel = passData.level;
        const currentExp = passData.exp;
        const progressInLevel = currentLevel >= MAX_LEVEL ? EXP_PER_LEVEL : (currentExp % EXP_PER_LEVEL);
        const progressPct = currentLevel >= MAX_LEVEL ? 100 : Math.floor((progressInLevel / EXP_PER_LEVEL) * 100);

        // 计算展示范围：5级窗口，居中玩家等级
        const visibleRange = this._getVisibleRange(currentLevel);

        // 构建5个可见等级的卡片数据
        const visibleLevels = [];
        for (let lv = visibleRange.start; lv <= visibleRange.end; lv++) {
            const baseReward = generateLevelRewards(lv);
            const bonus = BONUS_REWARDS[lv] || null;
            const claimed = passData.claimed.includes(lv);
            const unlocked = currentLevel >= lv;
            const canClaim = unlocked && !claimed;
            const isPlayerLevel = lv === currentLevel;

            visibleLevels.push({
                level: lv,
                xiuwei: fmtNum(baseReward.xiuwei),
                xueqi: fmtNum(baseReward.xueqi),
                lingshi: fmtNum(baseReward.lingshi),
                yuanshi: fmtNum(baseReward.yuanshi),
                hasBonus: !!bonus,
                bonusName: bonus ? bonus.name : '',
                bonusLabel: bonus ? bonus.rewards.map(r => r.label).join(' ') : '',
                isBigBonus: bonus && BONUS_LEVELS.includes(lv) && lv % 10 === 0,
                isFinalBonus: lv === 60,
                claimed,
                unlocked,
                canClaim,
                isPlayerLevel,
            });
        }

        // 下一个可领的等级
        const nextClaimable = visibleLevels.find(v => v.canClaim);
        const anyUnclaimed = passData.level > 0 &&
            Array.from({ length: Math.min(passData.level, MAX_LEVEL) }, (_, i) => i + 1)
                .some(lv => !passData.claimed.includes(lv));

        const screenData = await new Show(e).get_wenxianlingData({
            user_id: usr_qq,
            nickname: player.名号 || '无名修士',
            level: player.level_id ? (data.Level_list?.find?.(l => l.level_id == player.level_id)?.level || '未知') : '未知',
            passLevel: currentLevel,
            maxLevel: MAX_LEVEL,
            currentExp,
            nextLevelExp: MAX_LEVEL > currentLevel ? (currentLevel + 1) * EXP_PER_LEVEL : MAX_LEVEL * EXP_PER_LEVEL,
            progressPct,
            visibleLevels,
            visibleRange,
            hasMoreLeft: visibleRange.start > 1,
            hasMoreRight: visibleRange.end < MAX_LEVEL,
            nextClaimableLevel: nextClaimable ? nextClaimable.level : null,
            claimedCount: passData.claimed.length,
            potentialLeft: player.仙道潜力 || 0,
            anyUnclaimed,
        });

        const img = await puppeteer.screenshot('wenxianling', { ...screenData });
        e.reply(img);
        return false;
    }

    // ====== 计算可见范围（5级窗口居中） ======
    _getVisibleRange(playerLevel) {
        let start, end;
        if (playerLevel <= 3) {
            start = 1;
            end = Math.min(5, MAX_LEVEL);
        } else if (playerLevel >= MAX_LEVEL - 2) {
            end = MAX_LEVEL;
            start = Math.max(1, MAX_LEVEL - 4);
        } else {
            start = playerLevel - 2;
            end = playerLevel + 2;
        }
        return { start, end };
    }

    _getAcquisitionStatus(player) {
        const state = ensureWenXianState(player);
        const realm = getRealmAuthorityLevel(player);
        const lines = [
            '【问仙令·传承未启】',
            `问仙道痕：${state.pendingExp}/${WENXIAN_PENDING_EXP_CAP}`,
        ];

        if (!isWenXianEligible(player)) {
            lines.push(
                `问仙资格：未达到（三大体系等效权柄需达到${WENXIAN_REQUIRED_REALM_LEVEL}重天）`,
                `当前等效权柄：${realm}重天`,
            );
            return lines;
        }

        if (!state.clue) {
            lines.push(
                '问仙资格：已达到',
                '问仙线索：尚未获得',
                `副本寻迹：${state.dungeonClueAttempts}/${WENXIAN_DUNGEON_CLUE_PITY}（每日首次成功副本1%概率）`,
                '也可参悟位面事件中的问仙古碑，',
                `或发送 #重金求取问仙线索 消耗${WENXIAN_CLUE_COST.toLocaleString('zh-CN')}源石。`,
            );
            return lines;
        }

        const trial = state.trial;
        const mark = done => done ? '已完成' : '未完成';
        lines.push(
            `线索来源：${state.clue.source}`,
            `最终线索：${formatRealmEventLocation(state.clue)}`,
            formatRealmEventTravel(state.clue),
            '',
            '【问仙试炼】',
            `每日任务：${trial.dailyTasks}/${WENXIAN_DAILY_TASK_TARGET}`,
            `开辟内景地：${mark(trial.innerWorldOpened)}`,
            `参与击败位面天骄：${mark(trial.tianjiaoDefeated)}`,
            `探索最终线索：${mark(trial.clueExplored)}（抵达后发送 #探索问仙线索）`,
            isWenXianTrialComplete(player)
                ? '全部试炼已经完成，发送 #激活问仙令。'
                : '完成全部试炼后方可激活问仙令。',
        );
        return lines.filter(Boolean);
    }

    async buyWenXianClue(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;

        const lockKey = `xiuxian:lock:wenxian_clue:${usr_qq}`;
        const token = `${Date.now()}:${Math.random()}`;
        if (!await acquireRedisLock(redis, lockKey, token, 15)) {
            return e.reply('问仙线索正在推演中，请稍后再试。');
        }

        try {
            const player = await Read_player(usr_qq);
            const result = purchaseWenXianClue(player);
            if (result.reason === 'ineligible') {
                return e.reply(`三大体系等效权柄达到${WENXIAN_REQUIRED_REALM_LEVEL}重天，才有资格求取问仙线索。`);
            }
            if (result.reason === 'unlocked') return e.reply('你已经激活问仙令，无需求取线索。');
            if (result.reason === 'known') return e.reply('你已经获得问仙线索，无需重复求取。');
            if (result.reason === 'insufficient') {
                return e.reply([
                    '【重金求取·源石不足】',
                    `问仙线索需要${result.cost.toLocaleString('zh-CN')}源石。`,
                    `你当前拥有${(Number(player.源石) || 0).toLocaleString('zh-CN')}源石。`,
                ].join('\n'));
            }
            if (!result.ok) return e.reply('问仙线索推演失败，请稍后再试。');

            await Write_player(usr_qq, player);
            return e.reply([
                '【重金求取·问仙残卷】',
                `你耗费${result.cost.toLocaleString('zh-CN')}源石，从诸天行商手中换得一卷问仙残图。`,
                `残图最终指向：${formatRealmEventLocation(result.clue)}`,
                formatRealmEventTravel(result.clue),
                '发送 #问仙令 查看完整试炼。',
            ].join('\n'));
        } finally {
            try {
                await releaseRedisLock(redis, lockKey, token);
            } catch { /* 锁会按时自动失效 */ }
        }
    }

    async exploreWenXianClue(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;
        const player = await Read_player(usr_qq);
        const state = ensureWenXianState(player);
        if (state.unlocked) return e.reply('你已经激活问仙令，无需再次探索。');
        if (!state.clue) return e.reply('你尚未获得问仙线索，发送 #问仙令 查看获取方式。');

        const reach = getRealmEventReach(player, state.clue);
        if (!reach.ok) {
            return e.reply([
                `最终线索位于：${formatRealmEventLocation(state.clue)}`,
                formatRealmEventTravel(state.clue),
            ].filter(Boolean).join('\n'));
        }

        const progress = recordWenXianTrial(player, 'explore');
        if (!progress.changed) return e.reply('你已经探索过问仙线索的最终地点。');
        await Write_player(usr_qq, player);
        return e.reply([
            '【问仙残图·终点已至】',
            '你在指定坐标寻得一座残破祭台，成功拓下最后一道问仙印记。',
            progress.ready ? '全部试炼已经完成，发送 #激活问仙令。' : '发送 #问仙令 查看其余试炼进度。',
        ].join('\n'));
    }

    async activatePass(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;
        const player = await Read_player(usr_qq);
        const result = activateWenXianLing(player);
        if (result.reason === 'unlocked') return e.reply('问仙令已经激活。');
        if (result.reason === 'no-clue') return e.reply('你尚未获得问仙线索。');
        if (result.reason === 'incomplete') return e.reply(this._getAcquisitionStatus(player).join('\n'));
        if (!result.ok) return e.reply('问仙令激活失败，请稍后再试。');

        await Write_player(usr_qq, player);
        return e.reply([
            '【问仙令·传承认主】',
            '四道试炼印记同时亮起，问仙令正式与你神魂相合。',
            `问仙道痕转化：${result.pendingExp}点`,
            `当前问仙令等级：${result.newLevel}级`,
            '发送 #问仙令 查看传承奖励。',
        ].join('\n'));
    }

    async showDailyQuests(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;
        const player = await Read_player(usr_qq);
        const { daily } = ensureWenXianTaskState(player);
        await Write_player(usr_qq, player);
        const lines = [
            '【问仙令·每日任务】',
            `每项首次完成奖励${WENXIAN_DAILY_QUEST_EXP}问仙令经验，每日重置。`,
            '',
        ];
        for (const [type, goal] of Object.entries(WENXIAN_DAILY_QUEST_GOALS)) {
            const done = daily.rewarded[type];
            lines.push(`${done ? '已完成' : '未完成'}｜${DAILY_QUEST_LABELS[type]} ${daily.progress[type]}/${goal}`);
        }
        return e.reply(lines.join('\n'));
    }

    async showWeeklyTask(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;
        const player = await Read_player(usr_qq);
        const { weekly } = ensureWenXianTaskState(player);
        const ready = isWenXianWeeklyTaskComplete(player);
        await Write_player(usr_qq, player);
        const lines = ['【每周任务】'];
        for (const [type, goal] of Object.entries(WENXIAN_WEEKLY_TASK_GOALS)) {
            lines.push(`${weekly.progress[type] >= goal ? '已完成' : '未完成'}｜${WEEKLY_TASK_LABELS[type]} ${weekly.progress[type]}/${goal}`);
        }
        // 按玩家当前字段动态结算奖励预览：修为/血气带随机波动，显示区间；灵石/源石为确定值
        const lo = calculateWenXianWeeklyRewards(player, () => 0);
        const hi = calculateWenXianWeeklyRewards(player, () => 0.999);
        const range = (min, max) => (min === max ? `+${fmtNum(min)}` : `+${fmtNum(min)}~${fmtNum(max)}`);
        lines.push(
            '',
            `状态：${weekly.claimed ? '本周奖励已领取' : ready ? '已完成，可发送 #领取每周任务' : '尚未完成'}`,
            `奖励：问仙令经验${WENXIAN_WEEKLY_TASK_EXP}、修为 ${range(lo.xiuwei, hi.xiuwei)}、血气 ${range(lo.xueqi, hi.xueqi)}、灵石 +${fmtNum(lo.lingshi)}、源石 +${fmtNum(lo.yuanshi)}、定神丹x5、超越宝盒x2、遣龙令x5`,
        );
        return e.reply(lines.join('\n'));
    }

    async claimWeeklyTask(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) return false;
        const lockKey = `xiuxian:lock:wenxian_weekly:${usr_qq}`;
        const token = `${Date.now()}:${Math.random()}`;
        if (!await acquireRedisLock(redis, lockKey, token, 30)) {
            return e.reply('每周任务奖励正在结算，请稍后再试。');
        }

        try {
            const player = await Read_player(usr_qq);
            const result = claimWenXianWeeklyTask(player);
            if (result.reason === 'claimed') return e.reply('本周任务奖励已经领取。');
            if (result.reason === 'incomplete') return e.reply('本周任务尚未全部完成，发送 #每周任务 查看进度。');
            if (!result.ok) return e.reply('每周任务奖励结算失败，请稍后再试。');

            await Add_najie_thing(usr_qq, '定神丹', '丹药', 5);
            await Add_najie_thing(usr_qq, '超越宝盒', '盒子', 2);
            await Add_najie_thing(usr_qq, '遣龙令', '道具', 5);
            await Write_player(usr_qq, player);
            const { rewards, expResult } = result;
            return e.reply([
                '【每周任务奖励】',
                `修为 +${fmtNum(rewards.xiuwei)}`,
                `血气 +${fmtNum(rewards.xueqi)}`,
                `灵石 +${fmtNum(rewards.lingshi)}`,
                `源石 +${fmtNum(rewards.yuanshi)}`,
                `${expResult.unlocked === false ? '问仙道痕' : '问仙令经验'} +${expResult.added}`,
                '定神丹x5 / 超越宝盒x2 / 遣龙令x5',
            ].join('\n'));
        } finally {
            try {
                await releaseRedisLock(redis, lockKey, token);
            } catch { /* 锁会按时自动失效 */ }
        }
    }

    // ====== 领取奖励 ======
    async claimReward(e) {
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!(await existplayer(usr_qq))) {
            e.reply('请先创建角色再使用问仙令！');
            return false;
        }

        const lockKey = `xiuxian:lock:wenxian_claim:${usr_qq}`;
        const token = `${Date.now()}:${Math.random()}`;
        if (!await acquireRedisLock(redis, lockKey, token, 60)) {
            return e.reply('问仙令奖励正在领取中，请稍后再试。');
        }

        try {
            return await this._claimReward(e, usr_qq);
        } finally {
            try {
                await releaseRedisLock(redis, lockKey, token);
            } catch { /* 锁会按时自动失效 */ }
        }
    }

    async _claimReward(e, usr_qq) {
        const player = await Read_player(usr_qq);
        this._initPassData(player);

        if (!player.问仙令.unlocked) {
            e.reply('你尚未激活问仙令，发送 #问仙令 查看获取与试炼进度。');
            return false;
        }

        const match = e.msg.match(/^#领取问仙令(\d+)?$/);
        const targetLevel = match?.[1] ? parseInt(match[1]) : null;

        const passData = player.问仙令;
        const currentLevel = passData.level;

        // 确定要领取的等级列表
        let claimLevels;
        if (targetLevel) {
            // 指定等级
            if (targetLevel < 1 || targetLevel > MAX_LEVEL) {
                e.reply(`等级范围：1 ~ ${MAX_LEVEL} 级`);
                return false;
            }
            if (targetLevel > currentLevel) {
                e.reply(`问仙令等级不足，需要达到第${targetLevel}级才能领取。\n当前：第${currentLevel}级`);
                return false;
            }
            if (passData.claimed.includes(targetLevel)) {
                e.reply(`问仙令第${targetLevel}级奖励已领取！`);
                return false;
            }
            claimLevels = [targetLevel];
        } else {
            // 一键领取所有可领
            claimLevels = [];
            for (let lv = 1; lv <= Math.min(currentLevel, MAX_LEVEL); lv++) {
                if (!passData.claimed.includes(lv)) {
                    claimLevels.push(lv);
                }
            }
            if (claimLevels.length === 0) {
                e.reply(`当前没有可领取的问仙令奖励。\n当前等级：第${currentLevel}级\n可发送 #问仙令 查看详情。`);
                return false;
            }
        }

        // 逐个发放奖励
        const rewardLines = [];
        for (const lv of claimLevels) {
            const baseReward = generateLevelRewards(lv);
            const bonus = BONUS_REWARDS[lv];

            // 发放基础奖励
            player.修为 = (Number(player.修为) || 0) + baseReward.xiuwei;
            player.血气 = (Number(player.血气) || 0) + baseReward.xueqi;
            player.灵石 = (Number(player.灵石) || 0) + baseReward.lingshi;
            player.源石 = (Number(player.源石) || 0) + baseReward.yuanshi;

            rewardLines.push(`【第${lv}级】修为+${fmtNum(baseReward.xiuwei)}  血气+${fmtNum(baseReward.xueqi)}  灵石+${fmtNum(baseReward.lingshi)}  源石+${fmtNum(baseReward.yuanshi)}`);

            // 发放额外奖励
            if (bonus) {
                for (const r of bonus.rewards) {
                    await this._grantBonusReward(usr_qq, player, r);
                }
                rewardLines.push(`  + 额外 · ${bonus.name}：${bonus.rewards.map(r => r.label).join(' / ')}`);
            }

            passData.claimed.push(lv);
        }

        await Write_player(usr_qq, player);

        const msgs = [
            `【问仙令奖励领取成功】`,
            `道友 ${player.名号}`,
            ``,
            ...rewardLines,
            ``,
            `当前问仙令等级：第 ${currentLevel} / ${MAX_LEVEL} 级`,
            `当前仙道潜力：${player.仙道潜力 || 0} 点`,
            `源石：${player.源石 || 0}`,
        ];
        e.reply(msgs.join('\n'));
        return false;
    }

    // ====== 帮助 ======
    async showHelp(e) {
        const lines = [
            `【问仙令帮助】`,
            ``,
            `问仙令是修仙之旅的传承令牌，共60级。`,
            `每升1级均可领取修为、血气、灵石、源石奖励！`,
            `每逢5级/10级额外赠送丹药、仙道潜力等稀有奖励。`,
            `第60级终极大奖含限定称号「问仙者」与${WENDAO_PALACE_NAME}！`,
            WENDAO_PALACE_DESC,
            ``,
            `【获取方式】`,
            `人体秘境、仙古今世法或花粉进化路的等效权柄达到${WENXIAN_REQUIRED_REALM_LEVEL}重天后，取得问仙线索并完成试炼。`,
            `每日首次成功副本1%概率发现线索，${WENXIAN_DUNGEON_CLUE_PITY}次保底。`,
            `也可参悟问仙古碑，或消耗${WENXIAN_CLUE_COST.toLocaleString('zh-CN')}源石重金求取。`,
            `试炼：7次每日任务、开辟内景地、参与击败位面天骄、探索最终坐标。`,
            ``,
            `【指令】`,
            `#问仙令    - 查看战令进度（展示5级窗口）`,
            `#问仙令任务 - 查看每日问仙令任务`,
            `#每周任务 / #领取每周任务 - 查看并领取周任务奖励`,
            `#领取问仙令  - 一键领取所有可领奖励`,
            `#领取问仙令30 - 领取指定第30级奖励`,
            `#重金求取问仙线索 - 消耗30亿源石获取线索`,
            `#探索问仙线索 - 在最终坐标完成探索`,
            `#激活问仙令 - 完成试炼后激活`,
            `#问仙令帮助 - 查看帮助`,
            ``,
            `【经验来源】`,
            `修仙签到基础 +50  |  每日任务 +50`,
            `问仙令每日任务每项 +${WENXIAN_DAILY_QUEST_EXP}  |  每周任务 +${WENXIAN_WEEKLY_TASK_EXP}`,
            ``,
            `【额外奖励节点】`,
        ];
        for (const lv of BONUS_LEVELS) {
            const b = BONUS_REWARDS[lv];
            const tag = lv === 60 ? '终极' : lv % 10 === 0 ? '大奖' : '小奖';
            lines.push(`第${lv}级 [${tag}] ${b.name}：${b.rewards.map(r => r.label).join(' / ')}`);
        }
        e.reply(lines.join('\n'));
        return false;
    }

    // ====== 内部：初始化战令数据 ======
    _initPassData(player) {
        return ensureWenXianState(player);
    }

    // ====== 内部：发放额外奖励 ======
    async _grantBonusReward(usr_qq, player, reward) {
        switch (reward.kind) {
            case '仙道潜力':
                player.仙道潜力 = (player.仙道潜力 || 0) + reward.value;
                break;
            case '道具':
                await Add_najie_thing(
                    usr_qq,
                    reward.name,
                    reward.class || '丹药',
                    reward.count,
                    0
                );
                break;
            case '丹药':
            case '盒子':
                await Add_najie_thing(usr_qq, reward.name, reward.kind, reward.count, 0);
                break;
            case '称号':
                if (!player.称号列表) player.称号列表 = [];
                if (!player.称号列表.includes(reward.name)) {
                    player.称号列表.push(reward.name);
                }
                break;
            case '永久宝物':
                grantWendaoPalace(player);
                break;
        }
    }
}


// ====================================================
// 静态方法：供其他模块调用，增加问仙令经验
// ====================================================
WenXianLing.addExp = async function (usr_qq, amount) {
    if (!usr_qq || amount <= 0) return;
    try {
        const player = await Read_player(usr_qq);
        if (!player) return;
        const result = addWenXianExp(player, amount);
        if (!result.ok) return;
        await Write_player(usr_qq, player);
        return result;
    } catch (err) {
        logger.warn(`[问仙令] addExp 失败 usr_qq=${usr_qq}`, err);
    }
};

async function addDailyExpOnce(usr_qq, amount, type) {
    if (!usr_qq || amount <= 0) return { awarded: false, reason: 'invalid' };

    const dateKey = getDailyTaskDateKey();
    const key = `xiuxian:player:${usr_qq}:wenxianling:${type}_exp:${dateKey}`;
    let acquired = false;

    try {
        acquired = Boolean(await redis.set(key, '1', { EX: 2 * 24 * 60 * 60, NX: true }));
        if (!acquired) return { awarded: false, reason: 'already_awarded' };

        const result = await WenXianLing.addExp(usr_qq, amount);
        if (!result) {
            await redis.del(key);
            return { awarded: false, reason: 'failed' };
        }

        return { ...result, awarded: true, amount };
    } catch (err) {
        if (acquired) {
            try {
                await redis.del(key);
            } catch { /* 保留原始错误 */ }
        }
        logger.warn(`[问仙令] 每日${type}经验发放失败 usr_qq=${usr_qq}`, err);
        return { awarded: false, reason: 'failed' };
    }
}

// 手动与自动签到共用同一个幂等标记。
WenXianLing.addDailySignExp = async function (usr_qq, amount = 50) {
    return addDailyExpOnce(usr_qq, amount, 'sign');
};

WenXianLing.addDailyTaskExp = async function (usr_qq, amount = 50) {
    return addDailyExpOnce(usr_qq, amount, 'task');
};
