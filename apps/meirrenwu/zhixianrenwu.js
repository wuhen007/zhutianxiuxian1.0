import { plugin, puppeteer, data, Show } from '../../api/api.js';
import { Read_player, Write_player, Add_najie_thing, Add_灵石, Add_修为, Add_血气, sleep } from '../../model/xiuxian.js';

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
        let usr_qq = e.user_id.toString().replace('qg_','');
        let player = await Read_player(usr_qq);
        
        if (!e.isGroup) return;
        if (!await existplayer(usr_qq)) return;

        // 初始化支线任务数组
        if (!player.支线任务) {
            player.支线任务 = [];
            await Write_player(usr_qq, player);
        }

        let msg = "【支线任务】\n";
        if (player.支线任务.length === 0) {
            msg += "你当前没有接取的支线任务。\n";
            msg += "可通过使用特殊道具触发隐藏任务线。";
            e.reply(msg);
            return;
        }

        for (let taskId of player.支线任务) {
            let task = getZhiXianData(taskId);
            let progress = player.支线任务进度[taskId] || {};
            let status = getTaskStatus(taskId, progress);
            
            msg += `\n【${task.name}】${status}\n`;
            msg += `${task.desc.substring(0, 30)}...\n`;
            msg += `当前阶段：${progress.阶段 || 1}/${task.阶段数}\n`;
            msg += `发送 #支线任务详情${taskId} 查看详情\n`;
        }
        
        e.reply(msg);
    }

    /**
     * 查看支线任务详情
     */
    async zhixian_detail(e) {
        let taskId = parseInt(e.msg.match(/\d+/)[0]);
        let usr_qq = e.user_id.toString().replace('qg_','');
        let player = await Read_player(usr_qq);
        
        if (!player.支线任务.includes(taskId)) {
            e.reply("你未接取该支线任务。");
            return;
        }

        let task = getZhiXianData(taskId);
        let progress = player.支线任务进度[taskId] || { 阶段: 1 };
        let currentStage = task.阶段[progress.阶段 - 1];

        let msg = `【${task.name}】\n\n`;
        msg += `${task.desc}\n\n`;
        msg += `【当前阶段：${progress.阶段}/${task.阶段数}】\n`;
        msg += `${currentStage.名称}\n`;
        msg += `${currentStage.描述}\n\n`;
        
        if (currentStage.需求) {
            msg += `【任务需求】\n`;
            for (let [key, value] of Object.entries(currentStage.需求)) {
                let current = progress[key] || 0;
                msg += `${key}: ${current}/${value}\n`;
            }
        }
        
        if (currentStage.奖励) {
            msg += `\n【阶段奖励】\n`;
            for (let [key, value] of Object.entries(currentStage.奖励)) {
                msg += `${key}: ${value}\n`;
            }
        }

        msg += `\n发送 #提交支线任务${taskId} 提交当前阶段`;
        e.reply(msg);
    }

    /**
     * 提交支线任务阶段
     */
    async submit_zhixian(e) {
        let taskId = parseInt(e.msg.match(/\d+/)[0]);
        let usr_qq = e.user_id.toString().replace('qg_','');
        let player = await Read_player(usr_qq);
        
        if (!player.支线任务.includes(taskId)) {
            e.reply("你未接取该支线任务。");
            return;
        }

        let task = getZhiXianData(taskId);
        let progress = player.支线任务进度[taskId] || { 阶段: 1 };
        let currentStage = task.阶段[progress.阶段 - 1];

        // 检查是否满足需求
        if (currentStage.需求) {
            for (let [key, value] of Object.entries(currentStage.需求)) {
                let current = progress[key] || 0;
                if (current < value) {
                    e.reply(`任务需求未满足：${key} (${current}/${value})`);
                    return;
                }
            }
        }

        // 发放阶段奖励
        if (currentStage.奖励) {
            for (let [key, value] of Object.entries(currentStage.奖励)) {
                await giveReward(usr_qq, key, value);
            }
        }

        // 推进到下一阶段
        progress.阶段 = (progress.阶段 || 1) + 1;
        
        // 检查是否完成全部阶段
        if (progress.阶段 > task.阶段数) {
            player.支线任务 = player.支线任务.filter(id => id !== taskId);
            delete player.支线任务进度[taskId];
            await Write_player(usr_qq, player);
            
            // 发放最终奖励
            if (task.最终奖励) {
                for (let [key, value] of Object.entries(task.最终奖励)) {
                    await giveReward(usr_qq, key, value);
                }
            }
            
            e.reply(`【${task.name}】\n\n${task.完成文案}`);
            return;
        }

        // 保存进度
        player.支线任务进度[taskId] = progress;
        await Write_player(usr_qq, player);

        let nextStage = task.阶段[progress.阶段 - 1];
        e.reply([
            `【阶段完成】\n\n${currentStage.完成描述}\n\n`,
            `【下一阶段：${nextStage.名称}】\n`,
            `${nextStage.描述}\n`,
            `发送 #支线任务详情${taskId} 查看详情`
        ]);
    }

    /**
     * 处理支线任务选项选择
     */
    async zhixian_choice(e) {
        let matches = e.msg.match(/#选择支线(\d+)选项(\d+)/);
        let taskId = parseInt(matches[1]);
        let choiceId = parseInt(matches[2]);
        let usr_qq = e.user_id.toString().replace('qg_','');
        let player = await Read_player(usr_qq);

        let task = getZhiXianData(taskId);
        let progress = player.支线任务进度[taskId] || {};
        
        // 根据任务ID和选项处理不同逻辑
        if (taskId === 1) {
            await handleHuaYunFeiChoice(usr_qq, player, choiceId, e);
        } else if (taskId === 2) {
            await handleWangTengChoice(usr_qq, player, choiceId, e);
        }
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
            阶段: [
                {
                    名称: "最终抉择",
                    描述: "面对狠人一脉的宿命，你必须做出最终选择...",
                    需求: {},
                    奖励: {},
                    完成描述: ""
                }
            ],
            最终奖励: { 自由之心: 1, 狠人传承: 1 },
            完成文案: "你终于走出了属于自己的道，不再是谁的嫁衣。华云飞的执念在你体内消散，留下的是对自由的永恒追求。"
        },
        2: {
            id: 2,
            name: "重走大帝路",
            desc: "乱古大帝传承者王腾的遗憾，大帝之姿的逆天之路",
            阶段数: 1,
            阶段: [
                {
                    名称: "逆天改命",
                    描述: "王腾败于叶凡，这是宿命还是偶然？你要证明，大帝之路不止一条！",
                    需求: {},
                    奖励: {},
                    完成描述: ""
                }
            ],
            最终奖励: { 武道天眼: 1, 乱古帝符: 1 },
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
                    奖励: { 异域抗性: 50, 修为: 10000 },
                    完成描述: "你踏入了异域，这里的法则与九天十地截然不同。"
                },
                {
                    名称: "化身迷局",
                    描述: "鹤无双有九道化身，每一道都有本体的部分实力。找出真身！",
                    需求: { 击败化身: 3 },
                    奖励: { 战斗经验: 200, 元神强度: 80 },
                    完成描述: "你击败了部分化身，但真身仍未出现..."
                },
                {
                    名称: "鹤鸣九霄",
                    描述: "鹤无双的真身终于出现！那恐怖的元神攻击'鹤鸣九霄'震碎了虚空。",
                    需求: { 抵抗鹤鸣: 1 },
                    奖励: { 元神防御: 100, 悟性: 50 },
                    完成描述: "你以无上意志抵抗住了鹤鸣九霄，但元神受到了重创。"
                },
                {
                    名称: "不朽之血",
                    描述: "鹤无双受伤，不朽之血洒落。收集这些血液，可炼制绝世神丹。",
                    需求: { 收集仙血: 5 },
                    奖励: { 不朽之血: 5, 炼体值: 200 },
                    完成描述: "你收集了足够的不朽之血，肉身开始蜕变。"
                },
                {
                    名称: "终极对决",
                    描述: "最终战！鹤无双施展完整传承，你必须全力以赴！",
                    需求: { 击败真身: 1 },
                    奖励: { 修为: 50000, 气运: 100 },
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
        }
    };
    
    return zhiXianData[taskId];
}

/**
 * 处理华云飞任务选项
 */
async function handleHuaYunFeiChoice(usr_qq, player, choiceId, e) {
    // 检查是否学过吞天魔功
    const hasTuntianMagic = player.学习的功法 && player.学习的功法.includes('吞天魔功');
    
    if (choiceId === 1) {
        // 继承执念 - 需要已学习吞天魔功
        if (!hasTuntianMagic) {
            e.reply([
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
            ]);
            return;
        }
        
        // 继承执念
        player.魔功值 = (player.魔功值 || 0) + 100;
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
        
        e.reply([
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
        ]);
    } else if (choiceId === 2) {
        // 斩断因果
        player.仙道潜力 = (player.仙道潜力 || 0) + 50;
        player.道心 = (player.道心 || 0) + 30;
        
        // 避免重复添加功法
        if (!player.学习的功法.includes('斩天道')) {
            player.学习的功法.push('斩天道');
        }
        if (!player.学习的功法.includes('星耀天地')) {
            player.学习的功法.push('星耀天地');
        }
        if (!player.学习的功法.includes('十方皆杀')) {
            player.学习的功法.push('十方皆杀');
        }
        
        e.reply([
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
        ]);
    }
    
    // 推进到下一阶段
    if (!player.支线任务进度) player.支线任务进度 = {};
    let progress = player.支线任务进度[1] || { 阶段: 1 };
    progress.阶段 = 2;
    player.支线任务进度[1] = progress;
    
    // 更新生命本源（如果有灵根）
    if (player.灵根 && player.灵根.生命本源) {
        player.生命本源 = 100 + player.灵根.生命本源;
    } else {
        player.生命本源 = 100;
    }
    
    await Write_player(usr_qq, player);
}

/**
 * 处理王腾任务选项
 */
async function handleWangTengChoice(usr_qq, player, choiceId, e) {
    if (choiceId === 1) {
        // 觉醒武道天眼 - 需要道心>500且元神等级为仙台级
        const isXiantaiLevel = yuanshenlevel_id = 1; // 假设元神等级是字符串
        
        if (player.道心 <= 500) {
            e.reply([
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
                "（需要道心 > 500 才能选择此选项）"
            ]);
            return;
        }
        
        if (!isXiantaiLevel) {
            e.reply([
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
            ]);
            return;
        }
        
        // 觉醒武道天眼
        player.乱古战意 = 1;
        player.武道天眼 = 1;
        
        e.reply([
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
        ]);
        
    } else if (choiceId === 2) {
        // 不继承王腾的执念
        player.仙道潜力 = (player.仙道潜力 || 0) + 50;
        player.道心 = (player.道心 || 0) + 50;
        
        // 获得乱古帝符
        await Add_najie_thing(usr_qq, "乱古帝符", "道具", 1);
        
        e.reply([
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
        ]);
    }
    
    // 推进到下一阶段
    if (!player.支线任务进度) player.支线任务进度 = {};
    let progress = player.支线任务进度[2] || { 阶段: 1 };
    progress.阶段 = 2;
    player.支线任务进度[2] = progress;
    
    await Write_player(usr_qq, player);
}

/**
 * 发放奖励通用函数
 */
async function giveReward(usr_qq, type, value) {
    switch(type) {
        case '修为':
            await Add_修为(usr_qq, value);
            break;
        case '血气':
            await Add_血气(usr_qq, value);
            break;
        case '灵石':
            await Add_灵石(usr_qq, value);
            break;
        case '魔功熟练度':
        case '战意值':
        case '元神强度':
        case '悟性':
        case '气运':
            // 这些属性需要添加到player对象中
            let player = await Read_player(usr_qq);
            player[type] = (player[type] || 0) + value;
            await Write_player(usr_qq, player);
            break;
        default:
            // 道具类奖励
            await Add_najie_thing(usr_qq, type, "道具", value);
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
