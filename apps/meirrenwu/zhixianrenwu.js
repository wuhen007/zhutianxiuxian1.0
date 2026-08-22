import path from 'node:path';

import { plugin } from '../../api/api.js';
import {
    __PATH,
    Read_equipment,
    Read_player,
    Write_equipment,
    Write_player,
    Add_najie_thing,
    Add_灵石,
    Add_修为,
    Add_血气,
    channel,
    existplayer,
    invalidateBattleEquipmentCache,
    player_efficiency,
} from '../../model/xiuxian.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
    completeZhiXianTask,
    ensureZhiXianState,
    hasCompletedZhiXian,
    migrateCompletedZhiXianTasks,
    validateZhiXianChoice,
    validateZhiXianSubmission,
} from './zhixianChoice.js';
import { adjustDaoHeart, ensureDaoHeart } from '../../model/daoHeart.js';
import { getTitleById, grantTitle } from '../../model/titleSystem.js';

export class zhiXianRenWu extends plugin {
    constructor() {
        super({
            name: '支线任务',
            dsc: '遮天完美世界支线任务系统',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#我的支线任务$',
                    fnc: 'look_zhixian',
                },
                {
                    reg: '^#支线任务详情(\\d+)$',
                    fnc: 'zhixian_detail',
                },
                {
                    reg: '^#提交支线任务(\\d+)$',
                    fnc: 'submit_zhixian',
                },
                {
                    reg: '^#选择支线(\\d+)选项(\\d+)$',
                    fnc: 'zhixian_choice',
                }
            ],
        });
    }

    /**
     * 查看我的支线任务
     */
    async look_zhixian(e) {
        if (!e.isGroup) return;
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!await existplayer(usr_qq)) return e.reply('请先创建角色。');

        return withPlayerMutationLock(usr_qq, async () => {
            const player = await Read_player(usr_qq);
            if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);

            let msg = "【支线任务】\n";
            if (player.支线任务.length === 0) {
                msg += "你当前没有接取的支线任务。\n";
                msg += "可通过使用特殊道具触发隐藏任务线。";
            } else {
                for (const taskId of player.支线任务) {
                    const task = getZhiXianData(taskId);
                    if (!task) {
                        msg += `\n【未知支线 ${taskId}】进度数据仍保留，请联系管理员修复。\n`;
                        continue;
                    }
                    const progress = player.支线任务进度[taskId] || { 阶段: 1 };
                    msg += `\n【${task.name}】${getTaskStatus(taskId, progress)}\n`;
                    msg += `${task.desc.substring(0, 30)}...\n`;
                    msg += `当前阶段：${progress.阶段 || 1}/${task.阶段数}\n`;
                    msg += `发送 #支线任务详情${taskId} 查看详情\n`;
                }
            }

            const completedNames = Object.keys(player.支线任务完成记录)
                .map(Number)
                .map(taskId => getZhiXianData(taskId)?.name)
                .filter(Boolean);
            if (completedNames.length > 0) msg += `\n已完成：${completedNames.join('、')}`;
            return e.reply(msg);
        });
    }

    /**
     * 查看支线任务详情
     */
    async zhixian_detail(e) {
        const taskId = parseInt(e.msg.match(/\d+/)[0]);
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!await existplayer(usr_qq)) return e.reply('请先创建角色。');

        return withPlayerMutationLock(usr_qq, async () => {
            const player = await Read_player(usr_qq);
            if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
            if (hasCompletedZhiXian(player, taskId)) return e.reply('该支线任务已经完成。');
            if (!player.支线任务.includes(taskId)) return e.reply('你未接取该支线任务。');

            const task = getZhiXianData(taskId);
            if (!task) return e.reply('支线任务配置不存在，请联系管理员。');
            const progress = player.支线任务进度[taskId] || { 阶段: 1 };
            const stage = Number(progress.阶段) || 1;
            const currentStage = task.阶段[stage - 1];
            if (!currentStage) return e.reply('任务进度异常，请联系管理员修复。');

            let msg = `【${task.name}】\n\n${task.desc}\n\n`;
            msg += `【当前阶段：${stage}/${task.阶段数}】\n`;
            msg += `${currentStage.名称}\n${currentStage.描述}\n\n`;

            if (Object.keys(currentStage.需求 || {}).length > 0) {
                msg += `【任务需求】\n`;
                for (const [key, value] of Object.entries(currentStage.需求)) {
                    msg += `${key}: ${Number(progress[key]) || 0}/${value}\n`;
                }
            }
            if (Object.keys(currentStage.奖励 || {}).length > 0) {
                msg += `\n【阶段奖励】\n`;
                for (const [key, value] of Object.entries(currentStage.奖励)) msg += `${key}: ${value}\n`;
            }

            if (task.选项) {
                msg += '\n【任务选择】\n';
                task.选项.forEach((choice, index) => {
                    msg += `发送 #选择支线${taskId}选项${index + 1} ${choice}\n`;
                });
            } else {
                msg += `\n发送 #提交支线任务${taskId} 提交当前阶段`;
            }
            return e.reply(msg.trim());
        });
    }

    /**
     * 提交支线任务阶段
     */
    async submit_zhixian(e) {
        const taskId = parseInt(e.msg.match(/\d+/)[0]);
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!await existplayer(usr_qq)) return e.reply('请先创建角色。');

        return withPlayerMutationLock(usr_qq, async () => {
            let player = await Read_player(usr_qq);
            if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
            const task = getZhiXianData(taskId);
            if (!task) return e.reply('支线任务配置不存在，请联系管理员。');

            const validation = validateZhiXianSubmission(player, taskId, task.阶段数);
            if (!validation.ok) return e.reply(validation.message);
            const progress = player.支线任务进度[taskId] || { 阶段: validation.stage };
            const currentStage = task.阶段[validation.stage - 1];
            if (!currentStage) return e.reply('支线任务阶段配置不存在，请联系管理员。');
            for (const [key, value] of Object.entries(currentStage.需求 || {})) {
                const current = Number(progress[key]) || 0;
                if (current < value) return e.reply(`任务需求未满足：${key} (${current}/${value})`);
            }

            const transaction = createZhiXianTransaction(usr_qq);
            try {
                for (const [key, value] of Object.entries(currentStage.奖励 || {})) {
                    await giveReward(usr_qq, key, value, `zhixian:${taskId}:stage:${validation.stage}:${key}`);
                }

                const nextStageNumber = validation.stage + 1;
                if (nextStageNumber > task.阶段数) {
                    for (const [key, value] of Object.entries(task.最终奖励 || {})) {
                        await giveReward(usr_qq, key, value, `zhixian:${taskId}:final:${key}`);
                    }
                    player = await Read_player(usr_qq);
                    completeZhiXianTask(player, taskId);
                    await Write_player(usr_qq, player);
                    transaction.commit();
                    return e.reply(`【${task.name}】\n\n${task.完成文案}`);
                }

                player = await Read_player(usr_qq);
                ensureZhiXianState(player);
                progress.阶段 = nextStageNumber;
                player.支线任务进度[taskId] = progress;
                await Write_player(usr_qq, player);
                transaction.commit();

                const nextStage = task.阶段[nextStageNumber - 1];
                return e.reply([
                    `【阶段完成】\n\n${currentStage.完成描述}\n\n`,
                    `【下一阶段：${nextStage.名称}】\n`,
                    `${nextStage.描述}\n`,
                    `发送 #支线任务详情${taskId} 查看详情`,
                ]);
            } catch (error) {
                rollbackZhiXianTransaction(transaction, usr_qq, error);
                return e.reply('支线任务结算失败，进度与奖励已回滚，请稍后重试。');
            }
        });
    }

    /**
     * 处理支线任务选项选择
     */
    async zhixian_choice(e) {
        const matches = e.msg.match(/#选择支线(\d+)选项(\d+)/);
        if (!matches) return;

        const taskId = parseInt(matches[1]);
        const choiceId = parseInt(matches[2]);
        const usr_qq = await channel(e.user_id.toString().replace('qg_', ''));
        if (!await existplayer(usr_qq)) return e.reply('请先创建角色。');

        return withPlayerMutationLock(usr_qq, async () => {
            let player = await Read_player(usr_qq);
            if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
            const validation = validateZhiXianChoice(player, taskId, choiceId);
            if (!validation.ok) return e.reply(validation.message);

            const transaction = createZhiXianTransaction(usr_qq);
            try {
                const result = taskId === 1
                    ? await handleHuaYunFeiChoice(usr_qq, player, choiceId)
                    : await handleWangTengChoice(usr_qq, player, choiceId);
                if (!result.ok) {
                    transaction.commit();
                    return e.reply(result.message);
                }

                await Write_player(usr_qq, player);
                if (result.rebuildEquipment) {
                    await Write_equipment(usr_qq, await Read_equipment(usr_qq));
                }
                if (result.refreshEfficiency) await player_efficiency(usr_qq);

                player = await Read_player(usr_qq);
                completeZhiXianTask(player, taskId, { choiceId });
                await Write_player(usr_qq, player);
                transaction.commit();
                return e.reply(result.message);
            } catch (error) {
                rollbackZhiXianTransaction(transaction, usr_qq, error);
                return e.reply('支线选择结算失败，进度与奖励已回滚，请稍后重试。');
            }
        });
    }
}

/**
 * 获取支线任务数据
 */
function getZhiXianData(taskId) {
    const zhiXianData = {
        1: {
            id: 1,
            name: "何为他人嫁衣",
            desc: "狠人一脉的悲凉宿命，华云飞不甘为炉鼎的抗争之路",
            阶段数: 1,
            选项: ["继承执念", "斩断因果"],
            阶段: [
                {
                    名称: "最终抉择",
                    描述: "面对狠人一脉的宿命，你必须做出最终选择...",
                    需求: {},
                    奖励: {},
                    完成描述: ""
                }
            ],
            完成文案: "你终于走出了属于自己的道，不再是谁的嫁衣。华云飞的执念在你体内消散，留下的是对自由的永恒追求。"
        },
        2: {
            id: 2,
            name: "重走大帝路",
            desc: "乱古大帝传承者王腾的遗憾，大帝之姿的逆天之路",
            阶段数: 1,
            选项: ["觉醒武道天眼", "不继承王腾执念"],
            阶段: [
                {
                    名称: "逆天改命",
                    描述: "王腾败于叶凡，这是宿命还是偶然？你要证明，大帝之路不止一条！",
                    需求: {},
                    奖励: {},
                    完成描述: ""
                }
            ],
            完成文案: "你重走了大帝路，却走出了不同的结局。王腾的执念在你体内咆哮：『这一世，我必成帝！』"
        },
        3: {
            id: 3,
            name: "异域追杀",
            desc: "跨界而战，追寻鹤无双真身，夺取不朽传承",
            阶段数: 6,
            阶段: [
                {
                    名称: "跨界之门",
                    描述: "你站在异域之门前，感受到腐朽与不朽交织的气息。准备跨界！",
                    需求: { 跨界准备: 1 },
                    奖励: { 修为: 10000 },
                    完成描述: "你踏入了异域，这里的法则与九天十地截然不同。"
                },
                {
                    名称: "化身迷局",
                    描述: "鹤无双有九道化身，每一道都有本体的部分实力。找出真身！",
                    需求: { 击败化身: 3 },
                    奖励: { 元神强度: 80 },
                    完成描述: "你击败了部分化身，但真身仍未出现..."
                },
                {
                    名称: "鹤鸣九霄",
                    描述: "鹤无双的真身终于出现！那恐怖的元神攻击'鹤鸣九霄'震碎了虚空。",
                    需求: { 抵抗鹤鸣: 1 },
                    奖励: {},
                    完成描述: "你以无上意志抵抗住了鹤鸣九霄，但元神受到了重创。"
                },
                {
                    名称: "不朽之血",
                    描述: "鹤无双受伤，不朽之血洒落。收集这些血液，可炼制绝世神丹。",
                    需求: { 收集仙血: 5 },
                    奖励: {},
                    完成描述: "你收集了足够的不朽之血，肉身开始蜕变。"
                },
                {
                    名称: "终极对决",
                    描述: "最终战！鹤无双施展完整传承，你必须全力以赴！",
                    需求: { 击败真身: 1 },
                    奖励: { 修为: 50000 },
                    完成描述: "你赢了！鹤无双的真身在你脚下崩解，传承归你所有。"
                },
                {
                    名称: "跨界归来",
                    描述: "带着异域的传承，你需要安全返回九天十地。",
                    需求: {},
                    奖励: {},
                    完成描述: ""
                }
            ],
            最终奖励: { 鹤鸣九霄: 1, 不朽之王传承: 1, 异域法则: 1 },
            完成文案: "跨界追杀，九死一生。你带着鹤无双的完整传承归来，从此同代无敌，俯瞰天下！"
        },
        4: {
            id: 4,
            name: "天地无拘",
            desc: "循无拘仙印横渡诸天，体悟鲲鹏扶摇而上、不受万界拘束的逍遥真意",
            阶段数: 1,
            阶段: [
                {
                    名称: "乘风诸天",
                    描述: "完成三次跨位面穿梭，让仙印记下不同世界的风。",
                    需求: { 横渡位面: 3 },
                    奖励: {},
                    完成描述: "三界清风汇入仙印，鲲鹏道纹在你识海中徐徐展开。"
                }
            ],
            最终奖励: { 永久称号: "世外逍遥客", 功法: "逍遥游" },
            完成文案: "三次横渡之后，无拘仙印随风消散。你不再追逐逍遥子的背影，而是走出了自己的逍遥路。\n获得永久称号【世外逍遥客】与功法《逍遥游》。"
        }
    };
    
    return zhiXianData[taskId];
}

/**
 * 处理华云飞任务选项
 */
async function handleHuaYunFeiChoice(usr_qq, player, choiceId) {
    // 检查是否学过吞天魔功
    if (!Array.isArray(player.学习的功法)) player.学习的功法 = [];
    const hasTuntianMagic = player.学习的功法.includes('吞天魔功');
    const claimKey = `zhixian:1:choice:${choiceId}`;
    let message;
    
    if (choiceId === 1) {
        // 继承执念 - 需要已学习吞天魔功
        if (!hasTuntianMagic) {
            return { ok: false, message: [
                "【选择失败】",
                "",
                "你想要继承吞天魔功的传承，",
                "却发现自己从未修习过这门无上魔功。",
                "",
                "『未曾入门，岂敢妄谈继承？』",
                "",
                "华云飞的执念在你面前消散，",
                "只留下一声冷笑回荡在识海。",
                "",
                "（需要先学习《吞天魔功》才能选择此选项）"
            ] };
        }
        
        if (!hasZhiXianRewardClaim(player, claimKey)) {
            player.魔功值 = (Number(player.魔功值) || 0) + 100;
            player.灵根 = {
                id: 7010015,
                name: "魔胎仙体",
                type: "魔胎",
                归类: "遮天位面",
                eff: 300,
                法球倍率: 8,
                攻击: 5,
                防御: 2,
                生命: 3,
                生命本源: 150
            };
            recordZhiXianRewardClaim(player, claimKey, 1);
        }
        
        message = [
            "【选择：继承执念】",
            "",
            "你指尖轻颤，将那缕不甘的意志彻底纳入神魂。",
            "刹那间，血海翻涌，魔云压顶，",
            "似有一尊女帝自岁月长河中回眸，冷眼看向你。",
            "",
            "『既为棋子，那我便吞了这盘棋。』",
            "",
            "吞天魔功自行运转，",
            "你肉身化炉，神魂为火，结出魔胎，开始以身为炉、吞噬万物。",
            "这条路，注定尸骨成山，注定孤独一生。",
            "",
            "【获得灵根】魔胎仙体（至强成长型）",
            "【魔功值 +100】",
            "",
            "你笑了，笑得比华云飞更冷。"
        ];
    } else if (choiceId === 2) {
        if (!hasZhiXianRewardClaim(player, claimKey)) {
            player.仙道潜力 = (Number(player.仙道潜力) || 0) + 50;
            adjustDaoHeart(player, 30, '支线任务：斩断因果');
            for (const gongfa of ['斩天道', '星耀天地', '十方皆杀']) {
                if (!player.学习的功法.includes(gongfa)) player.学习的功法.push(gongfa);
            }
            recordZhiXianRewardClaim(player, claimKey, 1);
        }
        
        message = [
            "【选择：斩断因果】",
            "",
            "你不拜过去，不敬未来，只信手中道。",
            "一念花开，一念花落，",
            "华云飞的执念在你掌心寸寸崩裂，化作漫天光雨。",
            "",
            "『我命由我不由天，更不由狠人！』",
            "",
            "那一瞬，你听到了大道轰鸣，",
            "星辰之力自九天垂落，洗你筋骨，照你神魂。",
            "你不再是任何人的影子，也不再是他人的嫁衣。",
            "",
            "【获得】自由之心",
            "【仙道潜力 +50｜道心 +30】",
            "【领悟功法】斩天道 · 星耀天地 · 十方皆杀",
            "",
            "从此，你走的，是你自己的长生路。"
        ];
    }

    player.生命本源 = 100 + (Number(player.灵根?.生命本源) || 0);
    return {
        ok: true,
        message,
        rebuildEquipment: choiceId === 1,
        refreshEfficiency: true,
    };
}

/**
 * 处理王腾任务选项
 */
async function handleWangTengChoice(usr_qq, player, choiceId) {
    ensureDaoHeart(player);
    const claimKey = `zhixian:2:choice:${choiceId}`;
    let message;
    if (choiceId === 1) {
        // 觉醒武道天眼 - 需要道心>500且元神等级为仙台级
        const isXiantaiLevel = player.yuanshenlevel_id >= 1;
        
        if ((Number(player.道心) || 0) < 500) {
            return { ok: false, message: [
                "【选择失败】",
                "",
                "你想要觉醒武道天眼，",
                "却发现自己的道心还不够坚定。",
                "",
                "『道心不足，如何看破虚妄？』",
                "",
                "王腾的执念冷冷地看着你，",
                "随后化作流光消散。",
                "",
                "（需要道心达到500圆满才能选择此选项）"
            ] };
        }
        
        if (!isXiantaiLevel) {
            return { ok: false, message: [
                "【选择失败】",
                "",
                "你想要觉醒武道天眼，",
                "却发现自己元神境界不够。",
                "",
                "『仙台未成，天眼难开！』",
                "",
                "王腾的执念在你面前崩解，",
                "只留下一声叹息。",
                "",
                "（需要元神等级达到仙台级才能选择此选项）"
            ] };
        }
        
        if (!hasZhiXianRewardClaim(player, claimKey)) {
            player.乱古战意 = 1;
            player.武道天眼 = 1;
            recordZhiXianRewardClaim(player, claimKey, 1);
        }
        
        message = [
            "【选择：觉醒武道天眼】",
            "",
            "你凝视着王腾的执念，道心如磐石般坚定。",
            "仙台级元神绽放璀璨光芒，",
            "一道神光自你眉心射出，洞穿虚空！",
            "",
            "『天眼开，虚妄破！』",
            "",
            "乱古战意在体内沸腾，",
            "你看到了前所未有的景象——",
            "三千世界，诸天法则，皆在眼中流转。",
            "",
            "【获得】乱古战意（被动：战斗开局行动值+50%）",
            "【获得】武道天眼（可看破一切幻术与虚妄）",
            "",
            "王腾的执念满意地点头，融入你的神魂。"
        ];
        
    } else if (choiceId === 2) {
        if (!hasZhiXianRewardClaim(player, claimKey)) {
            player.仙道潜力 = (Number(player.仙道潜力) || 0) + 50;
            adjustDaoHeart(player, 50, '支线任务：不继承王腾执念');
            recordZhiXianRewardClaim(player, claimKey, 1);
        }
        
        await Add_najie_thing(
            usr_qq,
            "乱古帝符",
            "道具",
            1,
            undefined,
            1,
            { idempotencyKey: `${claimKey}:乱古帝符` },
        );
        
        message = [
            "【选择：不继承执念】",
            "",
            "你看着王腾的执念，轻轻摇头。",
            "『每个人都有自己的路，你的道，不是我的道。』",
            "",
            "王腾的执念怔住，随即大笑三声，",
            "笑声中带着释然与解脱。",
            "",
            "『好！好！好！』",
            "『既然如此，这枚帝符便赠予你吧！』",
            "",
            "一枚古朴的玉符落入你手中，",
            "上面刻着神秘的符文，散发着大帝气息。",
            "",
            "【获得】仙道潜力 +50",
            "【获得】道心 +50",
            "【获得道具】乱古帝符（可在必死遭遇中保自己一命）",
            "",
            "王腾的执念彻底消散，",
            "你感受到了前所未有的轻松。"
        ];
    }

    return { ok: true, message };
}

/**
 * 发放奖励通用函数
 */
function createZhiXianTransaction(usr_qq) {
    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
    transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
    transaction.capture(path.join(__PATH.equipment_path, `${usr_qq}.json`));
    return transaction;
}

function rollbackZhiXianTransaction(transaction, usr_qq, error) {
    console.error(`[支线任务] 玩家 ${usr_qq} 结算失败:`, error);
    try {
        transaction.rollback();
    } catch (rollbackError) {
        console.error(`[支线任务] 玩家 ${usr_qq} 回滚失败:`, rollbackError);
    } finally {
        invalidateBattleEquipmentCache(usr_qq);
    }
}

function hasZhiXianRewardClaim(target, key) {
    return Boolean(key && target?._rewardClaims?.[key]);
}

function recordZhiXianRewardClaim(target, key, amount) {
    if (!key) return;
    target._rewardClaims ??= {};
    target._rewardClaims[key] = { amount, claimedAt: Date.now() };
    const keys = Object.keys(target._rewardClaims);
    for (let index = 0; index < keys.length - 500; index += 1) delete target._rewardClaims[keys[index]];
}

async function mutatePlayerReward(usr_qq, idempotencyKey, value, mutation) {
    const player = await Read_player(usr_qq);
    if (hasZhiXianRewardClaim(player, idempotencyKey)) return;
    mutation(player);
    recordZhiXianRewardClaim(player, idempotencyKey, value);
    await Write_player(usr_qq, player);
}

async function giveReward(usr_qq, type, value, idempotencyKey) {
    const options = { idempotencyKey };
    switch(type) {
        case '修为':
            await Add_修为(usr_qq, value, options);
            break;
        case '血气':
            await Add_血气(usr_qq, value, options);
            break;
        case '灵石':
            await Add_灵石(usr_qq, value, options);
            break;
        case '仙道潜力':
        case '元神强度':
            await mutatePlayerReward(usr_qq, idempotencyKey, value, player => {
                const playerField = type === '元神强度' ? '元神' : type;
                player[playerField] = (Number(player[playerField]) || 0) + Math.trunc(value);
            });
            break;
        case '永久称号':
            await mutatePlayerReward(usr_qq, idempotencyKey, value, player => {
                if (!getTitleById(value)) throw new Error(`未注册称号：${value}`);
                grantTitle(player, value);
            });
            break;
        case '功法':
            await Add_najie_thing(usr_qq, value, "功法", 1, undefined, 1, options);
            break;
        default:
            // 道具类奖励
            await Add_najie_thing(usr_qq, type, "道具", value, undefined, 1, options);
    }
}

/**
 * 获取任务状态
 */
function getTaskStatus(taskId, progress) {
    if (!progress.阶段 || progress.阶段 === 1) return "【进行中】";
    if (progress.阶段 > getZhiXianData(taskId).阶段数) return "【已完成】";
    return "【进行中】";
}
