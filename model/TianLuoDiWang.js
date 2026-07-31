/**
 * 天罗地网系统 · 飞升囚牢
 * 
 * 圣墟/遮天风格：飞升并非解脱，而是一张从宇宙初开时便张开的收割之网。
 * 当修士的元神足够强大（元神化真完成），试图登仙时，
 * 天罗地网便会显现，囚牢之主将现身收割。
 * 
 * 只有战胜囚牢之主，方能真飞升。
 * 战败者，元神被俘，沦为囚牢之地的永恒养料。
 */

import { data } from '../api/api.js';
import { Write_player, channel } from './xiuxian.js';
import {
    buildJailerStats,
    damageJailer,
    ensureJailerState,
} from './tianluoWorldBoss.js';

export const JAILER_SKILLS = Object.freeze([
    {
        name: '天罗缚魂',
        desc: '万千魂丝锁住肉身与元神，伤害倍率75%，网缚使玩家攻击降低10%',
        damageMultiplier: 0.75,
        bind: true,
    },
    {
        name: '无面凝视',
        desc: '无面深渊凝视真灵，伤害倍率85%，本场战斗无法暴击',
        damageMultiplier: 0.85,
        sealCrit: true,
    },
    {
        name: '万灵噬魂',
        desc: '引爆被囚万灵，造成全额伤害并吞噬玩家10%当前元神',
        damageMultiplier: 1,
        spiritDrain: 0.1,
    },
    {
        name: '葬世之门',
        desc: '开启埋葬诸世之门，伤害倍率125%并无视35%防御',
        damageMultiplier: 1.25,
        defenseIgnore: 0.35,
    },
]);

// 练气42 + 炼体50 + 7500万全属性。
function buildBossData() {
    const level = data.Level_list.find(item => item.level_id === 42);
    const physique = data.LevelMax_list.find(item => item.level_id === 50);
    const stats = buildJailerStats(level, physique);

    return {
       名号: '囚牢之主·无面冥葬',
       境界: '地仙·究极圣王',
       当前血量: stats.血量,
       血量上限: stats.血量,
       基础攻击: stats.攻击,
       基础防御: stats.防御,
       当前攻击: stats.攻击,
       当前防御: stats.防御,
       暴击率: stats.暴击率,
       网缚层数: 0,
       深渊凝视: false,
    };
}

// ==================== 天罗地网感知 · 注入元神劫 ====================
// 在 spirit_tribulation 第7~9转时调用，注入恐怖感知文本
// 返回 true 表示玩家已感知到天罗地网
export function tianluoSenseFlavor(currentFormation, player) {
    if (currentFormation === 7) {
        return [
            ``,
            ` `,
            `你的元神在虚实转化的刹那——`,
            `忽然打了个寒颤。`,
            ``,
            `虚空深处，似有冰冷锁链在碰撞。`,
            `那声音极其遥远，又似近在耳畔：`,
            ``,
            `  "又来了一个……"`,
            ``,
            `你告诉自己那是错觉。`,
        ].join('\n');
    }
    if (currentFormation === 8) {
        return [
            ``,
            ` `,
            `第捌转，虚实壁垒出现了裂痕——`,
            `不是你造成的裂痕。`,
            ``,
            `透过那道裂痕，你看见了光。`,
            `你以为那是仙门。`,
            ``,
            `但那光……冰冷刺骨。`,
            `光幕后面，有无数模糊的影子在挣扎，`,
            `它们的元神，正被一根根透明的丝线缠绕，`,
            `缓缓拖入光的彼端。`,
            ``,
            `你忽然意识到——`,
            `那些丝线，一直都在你身上。`,
        ].join('\n');
    }
    if (currentFormation === 9) {
        return [
            ``,
            `═══════════════════════════`,
            ``,
            `第玖转。最终转。`,
            ``,
            `你终于看清了。`,
            ``,
            `那不是仙门。`,
            `那是一张网。`,
            ``,
            `一张从宇宙初开时就张开的网。`,
            `天罗在上，地网在下，`,
            `凡间所有修士的元神，皆在网中。`,
            ``,
            `你不是第一个走到这一步的人。`,
            `也不会是最后一个。`,
            ``,
            `网中的鱼，永远不可能自己挣脱渔网。`,
            ``,
            `——除非，你把撒网的人，拉下来。`,
            ``,
            `═══════════════════════════`,
        ].join('\n');
    }
    return null;
}

// 天罗地网Boss战并发锁
const tianluo_lock = {};

// ==================== 天罗地网 · 登仙拦截 ====================
// 玩家触发 #登仙 时调用
// 返回值：{ intercepted: boolean, message: string }
//   intercepted = true  → 已拦截，展开了天罗地网剧情，调用方不要再执行原登仙逻辑
//   intercepted = false → 未触发（玩家未感知天罗地网，或已击败Boss），走原逻辑
export async function tryInterceptAscension(e, player) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const boss = buildBossData();
    let worldBoss;

    try {
        worldBoss = ensureJailerState(data.filePathMap.weimianList, boss.血量上限);
    } catch (error) {
        logger.error(`[天罗地网] 读取全服囚牢之主状态失败: ${error}`);
        await e.reply('天罗地网状态异常，仙门暂时无法开启，请稍后再试。');
        return { intercepted: true };
    }

    // 全服唯一的囚牢之主已经被消灭，所有玩家直接放行。
    if (!worldBoss.alive) {
        return { intercepted: false };
    }

    // 并发锁检查
    if (tianluo_lock[usr_qq]) {
        await e.reply('天罗地网较量仍在进行中，请等待结果……');
        return { intercepted: true };
    }

    // Boss 存活时，任何满足登仙条件的玩家都会被拦截。
    tianluo_lock[usr_qq] = true;
    try {
        await startTianluoBossFight(e, player, usr_qq, boss, worldBoss);
    } catch (error) {
        logger.error(`[天罗地网] 囚牢之主战斗异常: ${error}`);
        await e.reply('天罗地网剧烈震荡，本次战斗被迫中止，已造成的全服伤害仍会保留。');
    } finally {
        delete tianluo_lock[usr_qq];
    }
    return { intercepted: true };
}

// ==================== Boss 战主逻辑 ====================
async function startTianluoBossFight(e, player, usr_qq, boss, worldBoss) {
    boss.当前血量 = worldBoss.hp;

    // ── 第一阶段：天罗地网显现 ──────────────────────────────
    await e.reply([
        ``,
        `你抬起脚，迈向那扇光幕。`,
        ``,
        `你以为那是仙门。`,
        `你以为跨过去，便是永恒。`,
        ``,
        `你的元神触碰到光幕的刹那——`,
        ``,
        `光，碎了。`,
        ``,
        `不，不是光碎了。`,
        `是网，显形了。`,
        ``,
        `═══════════════════════════`,
        `　【天罗地网 · 显现】`,
        `═══════════════════════════`,
        ``,
        `你看见了。`,
        ``,
        `无数根透明丝线从虚空中渗出，`,
        `它们缠住了你的脚踝、你的腰、你的脖颈——`,
        `你的元神。`,
        ``,
        `丝线上传来冰冷的气息，似有亿万年的孤独。`,
        `每一个曾试图登仙的修士，都被这样的丝线缠住，`,
        `拖入光的彼端。`,
        ``,
        `没有人真正飞升过。`,
        ``,
        `飞升，是收割。`,
        ``,
    ].join('\n'));

    await sleep(3000);

    // ── 第二阶段：囚牢之主现身 ──────────────────────────────
    await e.reply([
        ``,
        `丝线忽然绷紧。`,
        ``,
        `一个声音，从网的彼端传来。`,
        `那不是人类的声音——它没有声带，没有口腔，`,
        `它直接在你的元神深处响起，如同远古的回音：`,
        ``,
        `  "多少纪元了……"`,
        `  "又到了收割的季节。"`,
        ``,
        `丝线开始收紧。你的元神剧烈震颤——`,
        ``,
        `光的彼端，一个身影缓缓浮现。`,
        ``,
        `它没有脸。`,
        ``,
        `不是被遮住了，而是它本来就没有脸。`,
        `它的"头部"是一片虚无，如同被挖去眼睛的深坑。`,
        `它的身躯裹在灰黑色的雾气里，身形变幻不定，`,
        `时而如山，时而如雾，时而如一只巨大的、透明的眼睛。`,
        ``,
        `【boss】囚牢之主·无面冥葬 显现！`,
        `全服血量：${worldBoss.hp.toLocaleString()} / ${worldBoss.maxHP.toLocaleString()}`,
        `攻击：${boss.基础攻击.toLocaleString()}　防御：${boss.基础防御.toLocaleString()}`,
        ``,
        `它看着你——尽管它没有眼睛。`,
        ``,
        `  "你的元神，很香。"`,
        `  "我会把你，炼成我最精美的那盏灯。"`,
        ``,
        `天罗地网彻底收紧——Boss战开始！`,
        ``,
    ].join('\n'));

    await sleep(2000);

    // ── 第三阶段：Boss 战（多回合制）──────────────────────────────
    await runBossBattle(e, player, usr_qq, boss);
}

// ==================== 回合制 Boss 战 ====================
async function runBossBattle(e, player, usr_qq, boss) {
    const maxRounds = 8;
    let currentRound = 0;
    let playerHP = player.当前血量 || 100;
    let bossHP = boss.当前血量;
    let escapeNet = false;
    let defeatedByPlayer = false;

    // 玩家战斗属性
    const pAtk = (player.攻击 || 1000000);
    const pDef = (player.防御 || 1000000);
    const pCrit = (player.暴击率 || 0.1);

    while (currentRound < maxRounds && bossHP > 0 && playerHP > 0) {
        const latestBoss = ensureJailerState(data.filePathMap.weimianList, boss.血量上限);
        bossHP = latestBoss.hp;
        if (!latestBoss.alive) break;

        currentRound++;
        const isBossTurn = (currentRound % 2 === 0);  // 偶数回合 Boss 行动

        if (!isBossTurn) {
            // ── 玩家回合 ──
            const roundResult = await playerAttackRound(e, boss, currentRound, playerHP, pAtk, pCrit);
            bossHP = roundResult.bossHP;
            defeatedByPlayer ||= roundResult.defeated;

            if (roundResult.bossStunned) {
                await e.reply(`囚牢之主身形一顿，网的收缩暂缓了……\n继续攻击！`);
            }
        } else {
            // ── Boss 回合 ──
            const roundResult = await bossAttackRound(e, player, boss, currentRound, bossHP, playerHP, pDef);
            playerHP = roundResult.playerHP;
        }

        // 检查是否挣脱天罗地网（Boss HP 低于 30% 时触发特殊剧情）
        if (bossHP < boss.血量上限 * 0.3 && !escapeNet) {
            escapeNet = true;
            await e.reply([
                ``,
                `囚牢之主的血量在急剧下降。`,
                `它终于露出了一丝……恐惧？`,
                ``,
                `  "不可能……你一个凡间修士……"`,
                ``,
                `天罗地网的丝线开始松动！`,
                `这是最后的机会——`,
                `彻底击碎它！`,
                ``,
            ].join('\n'));
        }

        await sleep(2500);
    }

    const finalBoss = ensureJailerState(data.filePathMap.weimianList, boss.血量上限);

    // ── 战斗结算 ──
    if (!finalBoss.alive && defeatedByPlayer) {
        player.当前血量 = Math.max(1, playerHP);
        await bossDefeated(e, player, usr_qq);
    } else if (!finalBoss.alive) {
        player.当前血量 = Math.max(1, playerHP);
        await Write_player(usr_qq, player);
        await e.reply('天罗地网轰然崩碎，另一位修士刚刚消灭了囚牢之主。仙门已经对全服开放，请重新发送 #登仙。');
    } else if (playerHP <= 0) {
        await playerCaptured(e, player, usr_qq);
    } else {
        // 回合数耗尽 → 玩家未能击败Boss，但也没死 → 囚牢之主主动撤退（剧情需要）
        await e.reply([
            ``,
            `天罗地网的丝线忽然全部断裂——`,
            `不是你断的。`,
            ``,
            `囚牢之主凝视着你，那片无面的虚无中，`,
            `竟传出了一声……笑。`,
            ``,
            `  "有趣……太有趣了……"`,
            `  "下次见面，我会亲自来吃你的元神。"`,
            ``,
            `丝线缩回虚空。光幕消散。`,
            `你瘫坐在地，元神几近枯竭。`,
            ``,
            `但你知道——网，还在。`,
            ``,
        ].join('\n'));

        // 惩罚：元神大幅下降，需要恢复后才能再次挑战
        player.当前血量 = Math.max(1, playerHP);
        player.元神 = Math.max(100000, player.元神 * 0.3);
        player.囚牢之主_挑战次数 = (player.囚牢之主_挑战次数 || 0) + 1;
        await Write_player(usr_qq, player);

        await e.reply([
            `本次造成的伤害已计入全服血条。`,
            `囚牢之主剩余：${finalBoss.hp.toLocaleString()} / ${finalBoss.maxHP.toLocaleString()}`,
            `元神受损严重，恢复后可再次发送 #登仙 继续挑战。`,
            `（当前元神：${player.元神.toFixed(0)}）`,
        ].join('\n'));
    }
}

// ==================== 玩家攻击回合 ====================
async function playerAttackRound(e, boss, round, playerHP, pAtk, pCrit) {
    // 计算玩家伤害（加入随机波动）
    const bindReduction = Math.max(0.4, 1 - boss.网缚层数 * 0.1);
    const effectiveAtk = Math.floor(pAtk * bindReduction);
    const variance = 0.85 + Math.random() * 0.3;  // 0.85~1.15
    const isCrit  = !boss.深渊凝视 && Math.random() < pCrit;
    const critMul = isCrit ? 1.8 : 1.0;
    const requestedDamage = Math.floor(
        effectiveAtk * variance * critMul *
        (1 - boss.基础防御 / (boss.基础防御 + effectiveAtk * 5))
    );
    const hit = damageJailer(data.filePathMap.weimianList, boss.血量上限, requestedDamage);

    // 叙事文本
    const roundFlavors = [
        // 第1回合
        [
            `你怒吼一声，全力一击砸在天罗地网上！`,
            `网剧烈震颤，囚牢之主发出一声刺耳的尖啸——`,
            `那不是声音，那是亿万被收割的元神同时在尖叫。`,
        ],
        // 第3回合
        [
            `你抓住一根丝线，用力拉扯——`,
            `丝线的另一端，传来一股令人作呕的甜味。`,
            `那是被炼化过的元神的味道。`,
            `你呕了出来，但手没有松。`,
        ],
        // 第5回合
        [
            `囚牢之主体内的灰色雾气开始溃散。`,
            `你看见雾气里，有无数张模糊的脸在蠕动——`,
            `那是历代被收割的修士，他们的元神，被炼成了囚牢之主的"养料"。`,
            ``,
            `  "我不会成为你们中的一员。"`,
        ],
        // 第7回合
        [
            `天罗地网已经破碎了大半。`,
            `囚牢之主第一次……后退了。`,
            ``,
            `  "你……你究竟是什么人？"`,
            `  "凡间不可能诞生你这样的……"`,
            ``,
            `你没有回答，因为你自己也不知道答案。`,
            `你只知道——不能停。`,
        ],
    ];

    let flavorText = '';
    if (round === 1)      flavorText = roundFlavors[0].join('\n');
    else if (round === 3)  flavorText = roundFlavors[1].join('\n');
    else if (round === 5)  flavorText = roundFlavors[2].join('\n');
    else if (round >= 7)  flavorText = roundFlavors[3].join('\n');
    else flavorText = `你再次挥出全力一击！`;

    const critText = isCrit ? ` 暴击！` : ``;
    const bindText = boss.网缚层数 > 0
        ? `天罗网缚：${boss.网缚层数}层，当前攻击降至${(bindReduction * 100).toFixed(0)}%`
        : null;

    await e.reply([
        ``,
        `── 第 ${round} 回合 · 你攻击 ──`,
        ``,
        flavorText,
        ``,
        `造成伤害：${hit.damage.toLocaleString()}${critText}`,
        bindText,
        `囚牢之主全服血条：${hit.hp.toLocaleString()} / ${hit.maxHP.toLocaleString()}（${(hit.hp / hit.maxHP * 100).toFixed(1)}%）`,
        ``,
    ].filter(Boolean).join('\n'));

    return {
        bossHP: hit.hp,
        playerHP,
        defeated: hit.defeated,
        bossStunned: hit.damage > boss.血量上限 * 0.15,
    };
}

// ==================== Boss 攻击回合 ====================
async function bossAttackRound(e, player, boss, round, bossHP, playerHP, pDef) {
    const bossAttacks = [
        `囚牢之主抬手，天罗地网的丝线骤然收紧！`,
        `无面之躯中渗出黑色液体，滴落在你的元神上，嗤嗤作响——`,
        `亿万被炼化的元神的哭嚎声同时响起，你的元神几近崩溃——`,
        `囚牢之主张开那片无面的虚无，向你"咬"了过来——`,
    ];

    const atkIndex = Math.min(Math.floor(round / 2) - 1, bossAttacks.length - 1);
    const skill = JAILER_SKILLS[atkIndex];
    const effectiveDef = pDef * (1 - (skill.defenseIgnore || 0));

    const variance = 0.9 + Math.random() * 0.2;
    const isBossCrit = Math.random() < boss.暴击率;
    const bossCritMul = isBossCrit ? 2.0 : 1.0;
    const bossDamage = Math.floor(
        boss.基础攻击 * skill.damageMultiplier * variance * bossCritMul *
        (1 - effectiveDef / (effectiveDef + boss.基础攻击 * 3))
    );
    playerHP = Math.max(0, playerHP - bossDamage);

    const effects = [];
    if (skill.bind) {
        boss.网缚层数++;
        effects.push(`天罗网缚叠加至${boss.网缚层数}层，攻击降低${boss.网缚层数 * 10}%`);
    }
    if (skill.sealCrit) {
        boss.深渊凝视 = true;
        effects.push('无面凝视封锁暴击，本场战斗后续攻击无法暴击');
    }
    if (skill.spiritDrain) {
        const spiritLoss = Math.floor((Number(player.元神) || 0) * skill.spiritDrain);
        player.元神 = Math.max(0, (Number(player.元神) || 0) - spiritLoss);
        effects.push(`万灵噬魂吞噬元神${spiritLoss.toLocaleString()}`);
    }
    if (skill.defenseIgnore) {
        effects.push(`葬世之门无视${(skill.defenseIgnore * 100).toFixed(0)}%防御`);
    }

    const critText = isBossCrit ? ` 暴击！` : ``;
    await e.reply([
        ``,
        `── 第 ${round} 回合 · ${skill.name} ──`,
        ``,
        bossAttacks[atkIndex],
        `【${skill.name}】${skill.desc}`,
        ``,
        `受到伤害：${bossDamage.toLocaleString()}${critText}`,
        ...effects,
        `你的剩余状态：HP ${playerHP.toLocaleString()}`,
        ``,
    ].join('\n'));

    return { bossHP, playerHP };
}

// ==================== 胜利：囚牢之主被击败 ====================
async function bossDefeated(e, player, usr_qq) {
    await e.reply([
        ``,
        `═══════════════════════════`,
        ``,
        `囚牢之主的身躯，开始崩解。`,
        ``,
        `不是战败的崩解——而是某种更根本的东西在碎裂。`,
        `天罗地网的丝线，一根接一根地断裂，`,
        `每一根断裂，都伴随着一声微弱的欢呼——`,
        `那是被炼化的元神们，在欢呼。`,
        ``,
        `囚牢之主最后的声音，在你的元神深处响起：`,
        ``,
        `  "你以为……杀了我……就结束了？"`,
        `  "这张网……从来就不只我一个人……"`,
        `  "上面……还有人……"`,
        ``,
        `它的身躯彻底消散。`,
        `丝线化为灰烬，飘落在虚空中。`,
        ``,
        `天罗地网，破了。`,
        ``,
        `你自由了。`,
        ``,
        `但也知道了一个让你骨髓发凉的真相——`,
        `这世上，还有比囚牢之主更恐怖的存在。`,
        ``,
        `═══════════════════════════`,
        ``,
        `【系统】你已击败囚牢之主·无面冥葬！`,
        `【系统】囚牢之主已被击败，天罗地网永久破碎。`,
        `【系统】你可以重新 #登仙，这一次，没有网。`,
        ``,
    ].join('\n'));

    // 全服状态已经在最后一击时置0；这里只结算击杀者奖励。
    player.囚牢之主_已击败 = true;
    player.天罗地网感知 = false;
    player.真实掌握度 = Math.min(2.0, (player.真实掌握度 || 1.0) + 0.5);
    await Write_player(usr_qq, player);

    await e.reply([
        ``,
        `奖励发放：`,
        `真实掌握度 +0.5（当前：${(player.真实掌握度 || 1.0).toFixed(2)}）`,
        `解锁成就：【破网者】`,
        `解锁特殊头衔：【越狱者】`,
        ``,
        `请重新发送 #登仙 完成真正的飞升。`,
        ``,
    ].join('\n'));
}

// ==================== 失败：玩家元神被俘 ====================
async function playerCaptured(e, player, usr_qq) {
    await e.reply([
        ``,
        `你的元神，耗尽了。`,
        ``,
        `天罗地网的丝线缠住了你最后的意识——`,
        `你看见自己的身体在远处倒下，`,
        `而你的元神，被一丝一丝地拖入光的彼端。`,
        ``,
        `囚牢之主的声音，最后一次响起：`,
        ``,
        `  "睡吧。"`,
        `  "在永恒的黑暗中，你会变成很美的灯。"`,
        ``,
        `光，消失了。`,
        ``,
        `═══════════════════════════`,
        `【你已被囚牢之主俘获】`,
        `═══════════════════════════`,
        ``,
    ].join('\n'));

    // 惩罚机制
    player.元神 = Math.max(100000, player.元神 * 0.1);
    player.当前血量 = 1;
    player.囚牢之主_被俘次数 = (player.囚牢之主_被俘次数 || 0) + 1;
    await Write_player(usr_qq, player);

    await e.reply([
        `你在冰冷中醒来。`,
        `身体还在，但元神像被撕掉了一层皮。`,
        ``,
        `你造成的伤害已经留在全服血条上。`,
        `恢复后可再次发送 #登仙，继续挑战囚牢之主。`,
        ``,
    ].join('\n'));
}

// ==================== 工具函数 ====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== EOF ====================
