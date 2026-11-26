import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import {
  existplayer,
  Write_player,
  Read_player,
  channel
} from '../../model/xiuxian.js';
import {
  consumeMirrorEnergy,
  ensureZhutianMirrorSystem,
  inspectZhutianAvatarAdvancement,
  syncCurrentZhutianAvatar,
} from '../../model/zhutianMirror.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { getMinggeEffects } from '../../model/mingge.js';

function getRecoverableLifeSourceMaximum(player) {
    const effects = getMinggeEffects(player, data.minggeList);
    return getLifeSourceRepairMaximum(player, effects.生命本源额外);
}

export class mofashaonv extends plugin {
  constructor() {
    super({
      name: '魔法少女进阶系统',
      dsc: '魔法少女小圆主题进阶系统',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#穿越魔法少女世界$',
          fnc: 'chuanyuemofa'
        },
        {
          reg: '^#救赎$',
          fnc: 'jiushu'
        },
        {
          reg: '^#魔法少女进阶|#魔法少女觉醒|#魔法觉醒$',
          fnc: 'mofashaonvjinjie'
        }
      ],
    });
  }
async jiushu(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return false;
    }

    let casterQQ = e.user_id.toString().replace('qg_', '');
    casterQQ = await channel(casterQQ);

    // 查看施法者存档
    let casterExists = await existplayer(casterQQ);
    if (!casterExists) {
        e.reply('施法者不存在，请先创建角色');
        return false;
    }

    // 检查是否为魔法少女一脉
    const caster = await Read_player(casterQQ);
    const magicGirlTypes = ["魔法少女", "愿望化身", "希望化身", "圆环之理"];
    if (!magicGirlTypes.includes(caster.灵根.type)) {
        e.reply('🌸 血脉不符！非魔法少女一脉，无法施展救赎之术。');
        return false;
    }

    // 初始化希望系统
    if (typeof caster.希望系统 === 'undefined') {
        caster.希望系统 = {
            希望碎片: 0,
            拯救人数: 0,
            助人次数: 0,
            净化绝望值: 0,
            因果律领悟: 0,
            时间线干涉: 0
        };
        await Write_player(casterQQ, caster);
    }

    // 检查目标玩家
    let targetQQ;
    const atItems = e.message.filter(item => item.type === "at");

    if (atItems.length > 0) {
        // 救赎他人
        targetQQ = atItems[0].qq.toString().replace('qg_', '');
        targetQQ = await channel(targetQQ);
    } else {
        // 救赎自己
        targetQQ = casterQQ;
    }

    // 检查目标是否存在
    if (!await existplayer(targetQQ)) {
        e.reply('目标玩家不存在于诸天万界中');
        return false;
    }

    const target = await Read_player(targetQQ);
    const isSelf = targetQQ === casterQQ;

    // 检查目标状态
    const targetAction = await redis.get('xiuxian:player:' + targetQQ + ':action');
    const parsedAction = targetAction ? JSON.parse(targetAction) : null;

    // ===== 新增：检查永寂状态及等级 =====
    let oblivionData = null;
    let oblivionLevel = 21; // 默认仙帝级永寂
    let obliteratorName = '未知存在';

    // 尝试获取oblivion（新格式）
    let oblivionStr = await redis.get('xiuxian:player:' + targetQQ + ':oblivion');
    if (oblivionStr) {
        oblivionData = JSON.parse(oblivionStr);
        oblivionLevel = oblivionData.oblivionLevel || 21;
        obliteratorName = oblivionData.obliteratorName || '未知存在';
    } else {
        // 尝试获取yongji（旧格式）
        oblivionStr = await redis.get('xiuxian:player:' + targetQQ + ':yongji');
        if (oblivionStr) {
            oblivionData = { yongji: true };
        }
    }

    const status = {
        isYongji: oblivionData !== null, // 永寂状态
        oblivionLevel: oblivionLevel, // 永寂等级
        obliteratorName: obliteratorName, // 致寂者
        isTianlao: parsedAction?.action === '天牢', // 天牢状态
        isHeianlaolong: parsedAction?.heianlaolong, // 黑暗牢笼状态
        isJinbi: parsedAction?.action === '禁闭', // 禁闭状态
        hasDaoshang: target.道伤 > 0, // 有道伤
        hasShengmingbenyuan: target.生命本源 < getRecoverableLifeSourceMaximum(target) // 生命本源受损
    };

    // ===== 永寂等级与救援权限判定 =====
    // 根据施法者的mijinglevel_id判断能救哪些永寂等级
    // oblivionLevel 21 (仙帝永寂) → 需要仙帝(21+)救援
    // oblivionLevel 22 (祭道永寂) → 需要祭道(22+)救援
    // oblivionLevel 23 (终极始祖永寂) → 需要祭道之上(24+)救援
    // oblivionLevel 24+ (祭道之上永寂) → 需要祭道之上(24+)救援

    let canRescueYongji = false;
    let yongjiRescueMsg = '';
    let yongjiCost = 0;

    if (status.isYongji) {
        // 祭道之上(24+)：可救回一切永寂
        if (caster.mijinglevel_id >= 24) {
            canRescueYongji = true;
            yongjiCost = 200; // 基础消耗
            // 更高等级的永寂需要更多消耗
            if (oblivionLevel >= 24) yongjiCost = 400;
            else if (oblivionLevel === 23) yongjiCost = 300;
        }
        // 祭道(22-23)：可救回祭道(22)和仙帝(21)永寂，救不了终极始祖(23)和祭道之上(24)
        else if (caster.mijinglevel_id >= 22) {
            if (oblivionLevel <= 22) {
                canRescueYongji = true;
                yongjiCost = 250;
            } else {
                yongjiRescueMsg = `此为${this.getOblivionLevelName(oblivionLevel)}——需要祭道之上(24级+)方能映照逆转！`;
            }
        }
        // 仙帝(21)：只能救被仙帝(21)永寂的
        else if (caster.mijinglevel_id >= 21) {
            if (oblivionLevel === 21) {
                canRescueYongji = true;
                yongjiCost = 200;
            } else {
                yongjiRescueMsg = `此为${this.getOblivionLevelName(oblivionLevel)}——您的境界不足以映照逆转！`;
            }
        } else {
            yongjiRescueMsg = `需达仙帝境(21级)方能触及永寂层面的存在！`;
        }
    }

    // 根据施法者境界判断可救赎的状态
    const canRescue = {
        // 魔法少女：只能解放天牢和禁闭
        tianlao: caster.灵根.type === "魔法少女" && status.isTianlao,
        jinbi: caster.灵根.type === "魔法少女" && status.isJinbi,

        // 愿望化身：解放天牢+黑暗牢笼+修复生命本源
        heianlaolong: ["愿望化身", "希望化身", "圆环之理"].includes(caster.灵根.type) && status.isHeianlaolong,
        shengmingbenyuan: ["愿望化身", "希望化身", "圆环之理"].includes(caster.灵根.type) && status.hasShengmingbenyuan,

        // 希望化身：以上所有+修复道伤
        daoshang: ["希望化身", "圆环之理"].includes(caster.灵根.type) && status.hasDaoshang,

        // 永寂：需要境界检查
        yongji: canRescueYongji
    };

    // 检查是否有可救赎的状态
    const hasRescuableStatus = Object.values(canRescue).some(v => v) ||
                              (!status.isYongji && !status.isTianlao && !status.isHeianlaolong && !status.isJinbi);

    if (!hasRescuableStatus) {
        // 如果是因为永寂无法救，显示特殊提示
        if (status.isYongji && !canRescueYongji) {
            e.reply([
                `🌸 ${caster.名号}的救赎之光尝试触及${isSelf ? '自身' : target.名号}的永寂状态...`,
                ``,
                `检测到${this.getOblivionLevelName(oblivionLevel)}！`,
                `【致寂者】${obliteratorName}`,
                ``,
                yongjiRescueMsg,
                ``,
                `「唯有超越${this.getOblivionLevelName(oblivionLevel)}的存在——」`,
                `「方能映照逆转此等永寂！」`,
            ].join('\n'));
            return false;
        }
        e.reply(this.buildNoRescueNeededMessage(caster, target, isSelf, status));
        return false;
    }

    // 计算救赎消耗（包含永寂）
    let cost = this.calculateRescueCost(caster, canRescue);
    if (canRescueYongji) {
        // 根据境界调整永寂救援消耗
        const discount = {
            "魔法少女": 1.0,
            "愿望化身": 0.9,
            "希望化身": 0.8,
            "圆环之理": 0.7
        }[caster.灵根.type] || 1.0;
        cost += Math.floor(yongjiCost * discount);
    }

    if (caster.希望系统.希望碎片 < cost) {
        e.reply(`🌸 希望碎片不足！需要${cost}个希望碎片，当前仅有${caster.希望系统.希望碎片}个。`);
        return false;
    }

    // 执行救赎
    return await this.executeRescue(e, caster, target, targetQQ, canRescue, cost, isSelf, casterQQ, status);
}

/** 获取永寂等级名称 */
getOblivionLevelName(level) {
    if (level >= 24) return '祭道之上永寂';
    if (level === 23) return '终极始祖永寂';
    if (level === 22) return '祭道永寂';
    return '仙帝永寂';
}

/** 构建无需救赎的提示消息 */
buildNoRescueNeededMessage(caster, target, isSelf, status) {
    const messages = [`🌸 ${caster.名号}的救赎之光扫过${isSelf ? '自身' : target.名号}...`];
    
    if (status.isYongji && caster.灵根.type !== "圆环之理") {
        messages.push(` 检测到永寂状态...但${caster.名号}的境界不足，无法触及此等存在层面的湮灭。`);
        messages.push(` 需达到「圆神」境界方能逆转永寂！`);
    } else if (status.isHeianlaolong && !["愿望化身", "希望化身", "圆环之理"].includes(caster.灵根.type)) {
        messages.push(` 检测到黑暗牢笼束缚...但${caster.名号}的境界不足，无法破除永恒黑暗。`);
        messages.push(` 需达到「愿望化身」及以上境界方能解放黑暗牢笼！`);
    } else if (status.hasDaoshang && !["希望化身", "圆环之理"].includes(caster.灵根.type)) {
        messages.push(` 检测到道伤痕迹...但${caster.名号}对因果律的理解不足，无法修复大道之伤。`);
        messages.push(` 需达到「希望化身」及以上境界方能治愈道伤！`);
    } else if (status.isJinbi && !["魔法少女", "愿望化身", "希望化身", "圆环之理"].includes(caster.灵根.type)) {
        messages.push(` 检测到禁闭状态...但${caster.名号}的血脉之力不足，无法破开禁闭之门。`);
        messages.push(` 需达到「魔法少女」及以上境界方能解救禁闭！`);
    } else {
        messages.push(` ${isSelf ? '您' : target.名号}当前状态良好，无需救赎。`);
        messages.push(` 真正的救赎，在于守护现有的希望与幸福。`);
    }
    
    return messages.join('\n');
}

/** 计算救赎消耗（不含永寂） */
calculateRescueCost(caster, canRescue) {
    let cost = 0;

    // 基础救赎消耗
    if (canRescue.tianlao) cost += 50;
    if (canRescue.jinbi) cost += 40;
    if (canRescue.heianlaolong) cost += 100;
    if (canRescue.shengmingbenyuan) cost += 30;
    if (canRescue.daoshang) cost += 80;
    // 永寂消耗在jiushu中单独计算

    // 根据境界调整消耗
    const discount = {
        "魔法少女": 1.0,
        "愿望化身": 0.8,
        "希望化身": 0.6,
        "圆环之理": 0.4
    }[caster.灵根.type] || 1.0;

    return Math.floor(cost * discount);
}

/** 执行救赎 */
async executeRescue(e, caster, target, targetQQ, canRescue, cost, isSelf, casterQQ, status = {}) {
    // 执行各类救赎
    const results = {
        tianlao: canRescue.tianlao ? await this.rescueTianlao(targetQQ) : false,
        jinbi: canRescue.jinbi ? await this.rescueJinbi(targetQQ) : false,
        heianlaolong: canRescue.heianlaolong ? await this.rescueHeianlaolong(targetQQ) : false,
        shengmingbenyuan: canRescue.shengmingbenyuan ? await this.healShengmingbenyuan(targetQQ) : false,
        daoshang: canRescue.daoshang ? await this.healDaoshang(targetQQ) : false,
        yongji: canRescue.yongji ? await this.rescueYongji(targetQQ, {
            oblivionLevel: status.oblivionLevel,
            obliteratorName: status.obliteratorName,
            casterName: caster.名号
        }) : false
    };

    // 自救时各修复函数已经把目标写回；重新读取，避免旧的施法者对象覆盖修复结果。
    const updatedCaster = isSelf ? await Read_player(casterQQ) : caster;

    // 消耗希望碎片并记录救赎统计
    if (
        !updatedCaster.希望系统 ||
        typeof updatedCaster.希望系统 !== 'object' ||
        Array.isArray(updatedCaster.希望系统)
    ) {
        updatedCaster.希望系统 = {};
    }
    updatedCaster.希望系统.希望碎片 = Math.max(
        0,
        (Number(updatedCaster.希望系统.希望碎片) || 0) - cost
    );

    // 记录救赎统计
    const rescuedCount = Object.values(results).filter(Boolean).length;
    updatedCaster.希望系统.拯救人数 =
        (Number(updatedCaster.希望系统.拯救人数) || 0) + rescuedCount;
    updatedCaster.希望系统.助人次数 =
        (Number(updatedCaster.希望系统.助人次数) || 0) + 1;

    // 更新施法者数据
    await Write_player(casterQQ, updatedCaster);

    // 构建回复消息
    const message = this.buildRescueSuccessMessage(updatedCaster, target, canRescue, results, cost, isSelf, status);
    e.reply(message);

    return true;
}

/** 解放天牢 */
async rescueTianlao(targetQQ) {
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    const target = await Read_player(targetQQ);
    target.当前血量 = target.血量上限;
    target.修为 = Math.floor(target.修为 * 0.9); // 保留90%修为
    
    // 添加解放记录
    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '天牢解放',
        时间: new Date().toLocaleString()
    });
    
    await Write_player(targetQQ, target);
    return true;
}

/** 解救禁闭 */
async rescueJinbi(targetQQ) {
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    const target = await Read_player(targetQQ);
    target.当前血量 = target.血量上限;
    target.修为 = Math.floor(target.修为 * 0.95); // 保留95%修为
    
    // 添加解救记录
    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '禁闭解救',
        时间: new Date().toLocaleString()
    });
    
    await Write_player(targetQQ, target);
    return true;
}

/** 解放黑暗牢笼 */
async rescueHeianlaolong(targetQQ) {
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    const target = await Read_player(targetQQ);
    target.当前血量 = target.血量上限;
    target.修为 = Math.floor(target.修为 * 0.85); // 保留85%修为
    
    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '黑暗牢笼解放',
        时间: new Date().toLocaleString()
    });
    
    await Write_player(targetQQ, target);
    return true;
}

/** 修复生命本源 */
async healShengmingbenyuan(targetQQ) {
    const target = await Read_player(targetQQ);
    const maxShengmingbenyuan = getRecoverableLifeSourceMaximum(target);
    target.生命本源 = maxShengmingbenyuan;
    
    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '生命本源修复',
        时间: new Date().toLocaleString()
    });
    
    await Write_player(targetQQ, target);
    return true;
}

/** 修复道伤 */
async healDaoshang(targetQQ) {
    const target = await Read_player(targetQQ);
    target.道伤 = 0;
    
    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '道伤修复',
        时间: new Date().toLocaleString()
    });
    
    await Write_player(targetQQ, target);
    return true;
}

/** 拯救永寂 */
async rescueYongji(targetQQ, status = {}) {
    // 清除所有可能的永寂状态key
    await redis.del(`xiuxian:player:${targetQQ}:yongji`);
    await redis.del(`xiuxian:player:${targetQQ}:oblivion`);
    await redis.del(`xiuxian:player:${targetQQ}:action`);

    const target = await Read_player(targetQQ);
    target.当前血量 = target.血量上限;
    target.道伤 = 0;
    target.生命本源 = getRecoverableLifeSourceMaximum(target);

    // 设置虚弱期
    let weaknessTime = 20 * 60 * 1000; // 20分钟
    let multiplier = 0.75;
    if (status.oblivionLevel >= 24) {
        weaknessTime = 30 * 60 * 1000;
        multiplier = 0.6;
    } else if (status.oblivionLevel === 23) {
        weaknessTime = 25 * 60 * 1000;
        multiplier = 0.65;
    }

    // 保存原始属性
    if (!target.原始属性) {
        target.原始属性 = {
            血量上限: target.血量上限,
            攻击: target.攻击,
            防御: target.防御
        };
    }

    // 应用虚弱减益
    target.血量上限 = Math.trunc(target.原始属性.血量上限 * multiplier);
    target.攻击 = Math.trunc(target.原始属性.攻击 * multiplier);
    target.防御 = Math.trunc(target.原始属性.防御 * multiplier);
    target.当前血量 = Math.min(target.当前血量, target.血量上限);

    // 保存虚弱期到Redis
    let weaknessEndTime = Date.now() + weaknessTime;
    await redis.set(`xiuxian:player:${targetQQ}:weakness`, JSON.stringify({
        startTime: Date.now(),
        endTime: weaknessEndTime,
        type: 'yongji_rescue',
        multiplier: multiplier,
        fromRescuer: status.casterName || '魔法少女'
    }));

    target.救赎记录 = target.救赎记录 || [];
    target.救赎记录.push({
        类型: '永寂拯救',
        时间: new Date().toLocaleString(),
        描述: `从${this.getOblivionLevelName(status.oblivionLevel || 21)}中归来`,
        致寂者: status.obliteratorName || '未知'
    });

    await Write_player(targetQQ, target);
    return true;
}

/** 构建救赎成功消息 */
buildRescueSuccessMessage(caster, target, canRescue, results, cost, isSelf, status = {}) {
    const messages = [];
    const targetName = isSelf ? '自身' : target.名号;
    const oblivionLevel = status.oblivionLevel || 21;
    const obliteratorName = status.obliteratorName || '未知存在';

    // 根据救赎类型构建不同文案
    messages.push(`✨ ${caster.名号}施展${caster.灵根.type}之力，绽放希望之光！`);

    if (canRescue.yongji && results.yongji) {
        // 根据永寂等级构建不同文案
        if (oblivionLevel >= 24) {
            // 逆转祭道之上永寂
            messages.push(
                `🌈【圆环之理·逆转祭道之上永寂】`,
                `「眸光所至，枯竭所有，重现所有！」`,
                `${caster.名号}的眸光穿透诸天万界，`,
                `映照那本应永恒寂灭的祭道之上存在！`,
                ``,
                `轰！整部古史剧烈震荡！`,
                `那超越祭道领域的终极湮灭——`,
                `竟在${caster.名号}的眸光下化作虚无！`,
                ``,
                `"重现。"`,
                `${targetName}的身影从虚无中踏出！`,
                ``,
                `诸天震颤，所有至高存在皆心生感应！`,
                `"这便是......超越一切的希望！"`,
                ``,
                `【致寂者】${obliteratorName}`,
                `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
            );
        } else if (oblivionLevel === 23) {
            // 逆转终极始祖永寂
            messages.push(
                `🌈【圆环之理·逆转终极始祖之寂】`,
                `「眸光所至，枯竭所有，重现所有！」`,
                `${caster.名号}以超越祭道的希望之光，`,
                `映照那超越祭道的终极湮灭！`,
                ``,
                `轰！整部古史剧烈震荡！`,
                `终极始祖留下的永寂烙印——`,
                `竟在希望之力下寸寸崩裂！`,
                ``,
                `"重现。"`,
                `${targetName}从超越祭道的湮灭中归来！`,
                ``,
                `"终极虽强——"`,
                `"亦在希望一念之间！"`,
                ``,
                `【致寂者】${obliteratorName}`,
                `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
            );
        } else {
            // 普通永寂逆转
            messages.push(
                `🌈【圆环之理·逆转永寂】`,
                `「眸光所至，枯竭所有，重现所有！」`,
                `${caster.名号}的眸光穿透诸天万界，映照那本应永恒寂灭的存在！`,
                ``,
                `轰！整部古史突然剧烈震荡！`,
                `那流淌了万古纪元的黑暗物质竟开始...倒流！`,
                ``,
                `"重现。"`,
                `二字道出，永寂黑暗如薄雾般被生生蒸干！`,
                `${targetName}的身影从虚无中踏出，重归现世！`,
                ``,
                `诸天震颤，所有仙帝级存在皆心生感应：`,
                `"永寂...被逆转了？！"`,
                ``,
                `【致寂者】${obliteratorName}`,
                `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
            );
        }
    } else if (canRescue.daoshang && results.daoshang) {
        messages.push(
            `🌟【希望化身·治愈道伤】`,
            `${caster.名号}引动希望之光，照耀${targetName}的大道之伤！`,
            `因果律的裂痕在希望之力的温养下逐渐弥合，`,
            `破碎的道基重新焕发生机！`,
            ``,
            `"以希望之名，赐汝完美道基！"`
        );
    } else if (canRescue.heianlaolong && results.heianlaolong) {
        messages.push(
            `💫【愿望化身·破暗逐光】`,
            `${caster.名号}于永恒未知之地睁开双眸，`,
            `眸光穿透无尽虚空，映照那传说中永无天日的黑暗牢笼！`,
            ``,
            `"以愿望之力，逐散永恒黑暗！"`,
            `仙帝伟力化作无量神光，贯穿永恒黑暗！`,
            `冰冷的秩序神链寸寸断裂，${targetName}重获自由！`
        );
    } else if (canRescue.jinbi && results.jinbi) {
        messages.push(
            `🌟【魔法少女·破禁解围】`,
            `${caster.名号}施展魔法少女之力，温柔地照耀着冰冷的禁闭室！`,
            `希望之力化作钥匙，轻易打开了沉重的牢门，`,
            `束缚的锁链在光芒中寸寸断裂，化作点点星光消散！`,
            ``,
            `${targetName}从禁闭中被解救，重获自由！`
        );
    } else if (canRescue.tianlao && results.tianlao) {
        messages.push(
            `⭐【魔法少女·破狱解厄】`,
            `${caster.名号}施展魔法少女之力，映照诸天万界！`,
            `天牢深处，一道神光贯穿古今，`,
            `坚固的牢狱壁垒在希望之力的照耀下如薄纸般破碎！`,
            ``,
            `${targetName}从天牢中被解放，重获新生！`
        );
    }
    
    // 添加修复信息
    if (results.shengmingbenyuan) {
        messages.push(` 生命本源已完全修复！`);
    }
    
    // 添加消耗信息
    messages.push(``, ` 消耗希望碎片：${cost}个`);
    messages.push(`✨ ${caster.名号}当前希望碎片：${caster.希望系统.希望碎片}个`);
    
    return messages.join('\n');
}
  // 穿越魔法少女世界主函数
  async chuanyuemofa(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return false;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      e.reply('玩家不存在，请先创建角色');
      return false;
    }

    return withPlayerMutationLock(usr_qq, async () => {
    let player = await Read_player(usr_qq);
    
    // 检查是否为魔法少女一脉
    const magicGirlTypes = ["魔法少女", "愿望化身", "希望化身", "圆环之理"];
    if (!magicGirlTypes.includes(player.灵根.type)) {
      e.reply('🌸 血脉不符！非魔法少女一脉，无法进行时间线穿梭。');
      return false;
    }
    
    // 初始化希望系统数据
    if (typeof player.希望系统 === 'undefined') {
      player.希望系统 = {
        希望碎片: 0,
        拯救人数: 0,
        助人次数: 0,
        净化绝望值: 0,
        因果律领悟: 0,
        时间线干涉: 0
      };
    }
    
    
    const mirror = ensureZhutianMirrorSystem(player);
    if (!mirror.已绑定) {
      e.reply('请先绑定诸天镜，再尝试穿梭时间线。');
      return false;
    }
    if (mirror.镜阶 < 2) {
      e.reply('魔法少女小圆世界需要二阶诸天镜才能稳定锚定。');
      return false;
    }
    if (!consumeMirrorEnergy(player).ok) {
      e.reply('今日镜能已经耗尽，明日会自动恢复。');
      return false;
    }

    // 增加总轮回次数
    player.希望系统.时间线干涉 += 1;
    const currentCycle = player.希望系统.时间线干涉;
    
    // 生成随机事件
    const eventResult = this.generateMagicGirlEvent(currentCycle, player);
    
    // 发放奖励
    player.希望系统.希望碎片 += eventResult.shardsGained;
    if (eventResult.additionalStats) {
      Object.keys(eventResult.additionalStats).forEach(key => {
        if (player.希望系统[key] !== undefined) {
          player.希望系统[key] += eventResult.additionalStats[key];
        }
      });
    }
    
    // 更新玩家数据
    await Write_player(usr_qq, player);
    
    // 构建回复消息
    let replyMsg = eventResult.message.join('\n');
    replyMsg += `\n\n✨ 本次获得希望碎片：${eventResult.shardsGained}个`;
    replyMsg += `\n⏰ 您的时间线干涉总次数：${currentCycle}次`;
    
    e.reply(replyMsg);
    return true;
    });
  }

  // 魔法少女进阶函数
// 魔法少女进阶函数
async mofashaonvjinjie(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return false;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return false;
    }
    
    return withPlayerMutationLock(usr_qq, async () => {
    let player = await Read_player(usr_qq);
    
    // 初始化希望系统
    if (typeof player.希望系统 === 'undefined') {
        player.希望系统 = {
            希望碎片: 0,
            拯救人数: 0,
            助人次数: 0,
            净化绝望值: 0,
            因果律领悟: 0,
            时间线干涉: 0
        };
        await Write_player(usr_qq, player);
    }
    
    // 魔法少女 → 许愿者·圆
    if (player.灵根.type === "魔法少女") {
        const realm = inspectZhutianAvatarAdvancement(player, 2);
        const realmName = realm.requirement.label;
        
        // 检查境界条件
        if (!realm.ok) {
            return e.reply([
                `🌸 许愿者·圆 进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `❌ 境界要求：${realmName}`,
                ...realm.missing,
                `✅ 希望碎片：100个（当前${player.希望系统.希望碎片 || 0}个）`,
                `✅ 拯救人数：10人（当前${player.希望系统.拯救人数 || 0}人）`,
                `✅ 助人次数：10次（当前${player.希望系统.助人次数 || 0}次）`,
                `✅ 生命本源：100（当前${player.生命本源 || 0}）`,
                ``,
                `💡 首要任务：提升境界至${realmName}`
            ].join('\n'));
        }
        
        // 安全访问检查
        const 希望系统 = player.希望系统 || {};
        const 希望碎片 = 希望系统.希望碎片 || 0;
        const 拯救人数 = 希望系统.拯救人数 || 0;
        const 助人次数 = 希望系统.助人次数 || 0;
        
        const 检查条件 = {
            希望碎片: 希望碎片 >= 100,
            拯救人数: 拯救人数 >= 10,
            助人次数: 助人次数 >= 10,
            生命本源: player.生命本源 >= 100
        };
        
        if (检查条件.希望碎片 && 检查条件.拯救人数 && 检查条件.助人次数 && 检查条件.生命本源) {
            player.希望系统.希望碎片 -= 100;
            
            player.灵根 = {
                "id": 7010016,
                "name": "许愿者·圆",
                "type": "愿望化身",
                "归类": "诸天万界",
                "eff": 2.0,
                "法球倍率": 2.0,
                "攻击": 3,
                "防御": 2,
                "生命": 2,
                "生命本源": 150
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            syncCurrentZhutianAvatar(player);
            await Write_player(usr_qq, player);
            
            const 进阶文案 = [
                `✨ 愿望之力觉醒，希望之光绽放！✨`,
                `你收集了100个希望碎片，拯救了${player.希望系统.拯救人数}名绝望者，`,
                `完成了${player.希望系统.助人次数}次助人善举，`,
                `终于理解了愿望的真谛！`,
                ``,
                `【许愿者·圆 进阶成功】`,
                `🌟 周身散发出粉色光芒，背后浮现圆环虚影`,
                `🎯 掌握了初步的愿望实现能力`,
                `💫 可以将希望之力转化为现实奇迹`
            ];
            
            e.reply(进阶文案.join('\n'));
        } else {
            const 不足文案 = [
                `🌸 许愿者·圆 进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `✅ 境界要求：${realmName}以上（已满足）`,
                `${检查条件.希望碎片 ? '✅' : '❌'} 希望碎片：100个（当前${player.希望系统.希望碎片}个）`,
                `${检查条件.拯救人数 ? '✅' : '❌'} 拯救人数：10人（当前${player.希望系统.拯救人数}人）`,
                `${检查条件.助人次数 ? '✅' : '❌'} 助人次数：10次（当前${player.希望系统.助人次数}次）`,
                `${检查条件.生命本源 ? '✅' : '❌'} 生命本源：100（当前${player.生命本源}）`,
                ``,
                `💡 请优先完成标记为❌的条件`
            ];
            
            e.reply(不足文案.join('\n'));
        }
    }
    // 许愿者·圆 → 希望之光·圆
    else if (player.灵根.type === "愿望化身") {
        const realm = inspectZhutianAvatarAdvancement(player, 3);
        const realmName = realm.requirement.label;
        
        // 检查境界条件
        if (!realm.ok) {
            return e.reply([
                `🌸 希望之光·圆 进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `❌ 境界要求：${realmName}`,
                ...realm.missing,
                `✅ 希望碎片：500个（当前${player.希望系统.希望碎片 || 0}个）`,
                `✅ 净化绝望值：1000点（当前${player.希望系统.净化绝望值 || 0}点）`,
                `✅ 因果律领悟：10次（当前${player.希望系统.因果律领悟 || 0}次）`,
                `✅ 生命本源：250（当前${player.生命本源 || 0}）`,
                ``,
                `💡 首要任务：提升境界至${realmName}`
            ].join('\n'));
        }
        
        const 检查条件 = {
            希望碎片: player.希望系统.希望碎片 >= 500,
            净化绝望: player.希望系统.净化绝望值 >= 1000,
            因果律: player.希望系统.因果律领悟 >= 10,
            生命本源: player.生命本源 >= 250
        };
        
        if (检查条件.希望碎片 && 检查条件.净化绝望 && 检查条件.因果律 && 检查条件.生命本源) {
            player.希望系统.希望碎片 -= 500;
            
            player.灵根 = {
                "id": 7010017,
                "name": "希望之光·圆",
                "type": "希望化身",
                "归类": "诸天万界",
                "eff": 3.5,
                "法球倍率": 3.5,
                "攻击": 8,
                "防御": 5,
                "生命": 6,
                "生命本源": 300
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            syncCurrentZhutianAvatar(player);
            await Write_player(usr_qq, player);
            
            const 进阶文案 = [
                `🌟 希望之光闪耀，因果律初显！🌟`,
                `你净化了${player.希望系统.净化绝望值}点绝望值，`,
                `领悟了${player.希望系统.因果律领悟}次因果律奥秘，`,
                `终于成为了希望的化身！`,
                ``,
                `【希望之光·圆 进阶成功】`,
                `✨ 粉色光环扩展至整个星域，圆环之理初现`,
                `🎯 掌握了因果律干涉能力`,
                `💫 可以改写小范围内的现实法则`
            ];
            
            e.reply(进阶文案.join('\n'));
        } else {
            const 不足文案 = [
                `🌸 希望之光·圆 进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `✅ 境界要求：${realmName}以上（已满足）`,
                `${检查条件.希望碎片 ? '✅' : '❌'} 希望碎片：500个（当前${player.希望系统.希望碎片}个）`,
                `${检查条件.净化绝望 ? '✅' : '❌'} 净化绝望值：1000点（当前${player.希望系统.净化绝望值}点）`,
                `${检查条件.因果律 ? '✅' : '❌'} 因果律领悟：10次（当前${player.希望系统.因果律领悟}次）`,
                `${检查条件.生命本源 ? '✅' : '❌'} 生命本源：250（当前${player.生命本源}）`,
                ``,
                `💡 请优先完成标记为❌的条件`
            ];
            
            e.reply(不足文案.join('\n'));
        }
    }
    // 希望之光·圆 → 圆神
    else if (player.灵根.type === "希望化身") {
        const realm = inspectZhutianAvatarAdvancement(player, 4);
        const realmName = realm.requirement.label;
        
        // 检查境界条件
        if (!realm.ok) {
            return e.reply([
                `🌸 圆神 最终进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `❌ 境界要求：${realmName}`,
                ...realm.missing,
                `✅ 希望碎片：1000个（当前${player.希望系统.希望碎片 || 0}个）`,
                `✅ 时间线干涉：5次（当前${player.希望系统.时间线干涉 || 0}次）`,
                `✅ 圆环理解：50次（当前${player.希望系统.因果律领悟 || 0}次）`,
                `✅ 生命本源：300（当前${player.生命本源 || 0}）`,
                ``,
                `💡 首要任务：提升境界至${realmName}`
            ].join('\n'));
        }
        
        const 检查条件 = {
            希望碎片: player.希望系统.希望碎片 >= 1000,
            时间线干涉: player.希望系统.时间线干涉 >= 5,
            圆环理解: player.希望系统.因果律领悟 >= 50,
            生命本源: player.生命本源 >= 300
        };
        
        if (检查条件.希望碎片 && 检查条件.时间线干涉 && 检查条件.圆环理解 && 检查条件.生命本源) {
            player.希望系统.希望碎片 -= 1000;
            
            player.灵根 = {
                "id": 7010018,
                "name": "圆神",
                "type": "圆环之理",
                "归类": "诸天万界",
                "eff": 5,
                "法球倍率": 5,
                "攻击": 20,
                "防御": 20,
                "生命": 20,
                "生命本源": 1000
            };
            player.生命本源 = 100 + player.灵根.生命本源;
            syncCurrentZhutianAvatar(player);
            await Write_player(usr_qq, player);
            
            const 进阶文案 = [
                `🌈 圆环之理显现，概念化身诞生！🌈`,
                `你完成了${player.希望系统.时间线干涉}次时间线干涉，`,
                `深刻理解了圆环之理的真谛，`,
                `最终成为了超越因果的存在！`,
                ``,
                `【圆神 最终进阶成功】`,
                `🌟 整个宇宙为你歌唱，圆环之理全面展开`,
                `🎯 成为概念本身，超越时空与因果`,
                `💫 掌握宇宙法则的终极权限`
            ];
            
            e.reply(进阶文案.join('\n'));
        } else {
            const 不足文案 = [
                `🌸 圆神 最终进阶条件不足！`,
                `需要满足以下所有条件：`,
                ``,
                `✅ 境界要求：${realmName}以上（已满足）`,
                `${检查条件.希望碎片 ? '✅' : '❌'} 希望碎片：1000个（当前${player.希望系统.希望碎片}个）`,
                `${检查条件.时间线干涉 ? '✅' : '❌'} 时间线干涉：5次（当前${player.希望系统.时间线干涉}次）`,
                `${检查条件.圆环理解 ? '✅' : '❌'} 圆环理解：50次（当前${player.希望系统.因果律领悟}次）`,
                `${检查条件.生命本源 ? '✅' : '❌'} 生命本源：300（当前${player.生命本源}）`,
                ``,
                `💡 请优先完成标记为❌的条件`
            ];
            
            e.reply(不足文案.join('\n'));
        }
    }
    else if (!["魔法少女", "愿望化身", "希望化身"].includes(player.灵根.type)) {
        e.reply(`🌸 血脉不符！非魔法少女一脉，无法进阶圆环之理。`);
    } 
    else {
        e.reply(`🌸 进阶条件不足！需达到更高境界且积累更多希望之力。`);
    }
    
    return true;
    });
}

  // 生成魔法少女随机事件
  generateMagicGirlEvent(cycleCount, player) {
    // 基础奖励随轮回次数增长
    let baseMinShards = 5;
    let baseMaxShards = 15;
    if (cycleCount > 10) { baseMinShards = 8; baseMaxShards = 20; }
    if (cycleCount > 30) { baseMinShards = 12; baseMaxShards = 25; }
    if (cycleCount > 50) { baseMinShards = 15; baseMaxShards = 30; }

    const events = [];

    // 事件1：魔女盛宴的救赎
    events.push({
      name: '魔女盛宴的救赎',
      weight: cycleCount > 1 ? 1.2 : 0.8,
      generate: () => {
        const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards;
        const additionalShards = Math.floor(shards * 0.3);
        const totalShards = shards + additionalShards;

        const messages = [
          `🌌 魔女盛宴的救赎`,
          `你聆听着魔女哭泣般的摇篮曲，那是一个少女未能实现的愿望...`,
          `你伸出手，并非给予最后一击，而是用希望碎片的光芒将其温柔包裹。`,
          `「安息吧，」你轻声道，「你的愿望，由我来继承。」`,
          `魔女化为光点消散，留下一颗纯净的悲叹之种（净化版）。`
        ];

        return {
          message: messages,
          shardsGained: totalShards,
          additionalStats: { 净化绝望值: Math.floor(totalShards / 2) }
        };
      }
    });

    // 事件2：指引迷途的魔法少女
    events.push({
      name: '指引迷途的魔法少女',
      weight: player.希望系统.净化绝望值 > 50 ? 1.1 : 0.9,
      generate: () => {
        const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards;
        const hasTemporaryProtection = Math.random() > 0.7;

        const messages = [
          `💫 指引迷途的魔法少女`,
          `看着眼前这位眼神黯淡的后辈，你仿佛看到了无数轮回中的自己。`,
          `你告诉她：「魔法少女的命运并非只有绝望，只要我们彼此扶持，希望就永远不会消失。」`,
          `你分享了自己的战斗经验，并赠送了少量希望碎片帮助她净化灵魂宝石。`
        ];

        const additionalStats = { 拯救人数: 1,助人次数: 1 };
        if (hasTemporaryProtection) {
          messages.push(`✨ 获得了该魔法少女的「临时庇护」，下次战斗获得小幅增益。`);
          additionalStats.临时庇护 = 1;
        }

        return {
          message: messages,
          shardsGained: shards,
          additionalStats: additionalStats
        };
      }
    });

    // 事件3：时间线残影·巴麻美的茶会
    events.push({
      name: '时间线残影·巴麻美的茶会',
      weight: 0.3, // 稀有事件
      generate: () => {
        const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards;

        const messages = [
          `🍰 时间线残影·巴麻美的茶会`,
          `「要再来一块蛋糕吗？」麻美学姐微笑着为你斟茶。`,
          `这一刻，没有魔女，没有战斗，只有红茶氤氲的香气。`,
          `你深知这不过是时空的涟漪，但仍愿将这短暂的温暖深深铭记。`,
          `生命本源获得了小幅恢复。`
        ];

        return {
          message: messages,
          shardsGained: shards,
          additionalStats: { 生命本源恢复: 10 }
        };
      }
    });

    // 事件4：人鱼魔女的挽歌（需要轮回次数>5）
    if (cycleCount > 5) {
      events.push({
        name: '人鱼魔女的挽歌',
        weight: 1.0,
        generate: () => {
          const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards;
          const chooseB = Math.random() > 0.5;
          const success = chooseB ? Math.random() > 0.3 : true;

          const messages = [`💔 人鱼魔女的挽歌`];

          if (chooseB && success) {
            messages.push(
              `在魔女的嘶吼中，你听到了那首熟悉的吉他曲...`,
              `你大声喊道：「沙耶香！仁美和恭介都希望你幸福啊！」`,
              `魔女的攻击骤然停止，一滴浑浊的泪水从它眼中滑落。`,
              `冒险共鸣成功，获得了沙耶香的祝福！`
            );
            return {
              message: messages,
              shardsGained: shards + Math.floor(shards * 0.8),
              additionalStats: { 因果律领悟: 2, 特殊道具: "沙耶香的祝福" }
            };
          } else {
            messages.push(
              `你选择直接净化人鱼魔女，虽然获得了标准奖励，`,
              `但心中却有一丝淡淡的遗憾...`
            );
            return {
              message: messages,
              shardsGained: shards,
              additionalStats: { 净化绝望值: Math.floor(shards / 3) }
            };
          }
        }
      });
    }

    // 事件5：魔女之夜的预演（需要轮回次数>10）
    if (cycleCount > 10) {
      events.push({
        name: '魔女之夜的预演',
        weight: 0.8,
        generate: () => {
          const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards + 10;

          const messages = [
            `🌪️ 魔女之夜的预演`,
            `天空如同破碎的油画，巨大的齿轮在云层中若隐若现。`,
            `你知道，这仅仅是那个「活着的天灾」投下的一缕阴影。`,
            `真正的战斗，还在未来...`,
            `虽然艰难，但你成功击退了先锋魔女，窥见了魔女之夜本体的部分情报。`
          ];

          return {
            message: messages,
            shardsGained: shards,
            additionalStats: { 
              攻击临时提升: 5,
              防御临时提升: 5,
              魔女之夜情报进度: 1
            }
          };
        }
      });
    }

    // 事件6：丘比的契约诱惑（生命本源或希望碎片较低时易触发）
    events.push({
      name: '丘比的契约诱惑',
      weight: (player.生命本源 < 100 || player.希望系统.希望碎片 < 50) ? 1.5 : 0.7,
      generate: () => {
        const shards = Math.floor(Math.random() * (baseMaxShards - baseMinShards + 1)) + baseMinShards;
        const chooseB = Math.random() > 0.6;
        const isMarked = chooseB && Math.random() > 0.8;

        const messages = [
          `🐰 丘比的契约诱惑`,
          `丘比摇着尾巴，用毫无波澜的语调说：`,
          `「你的希望碎片消耗很快吧？签订契约，你可以获得更稳定、更强大的力量。」`,
          `它的红色眼睛，仿佛能看穿人心的一切犹豫。`
        ];

        if (chooseB) {
          messages.push(`你选择虚与委蛇，假意周旋，试图套取情报...`);
          if (isMarked) {
            messages.push(`⚠️ 但被丘比看穿，遭到了「标记」，后续事件难度可能增加。`);
          } else {
            messages.push(`✨ 成功获得了关于「孵化者」文明的情报。`);
          }
        } else {
          messages.push(`你严词拒绝，坚守本心，获得了希望碎片奖励。`);
        }

        return {
          message: messages,
          shardsGained: shards,
          additionalStats: { 
            因果律领悟: chooseB ? (isMarked ? 0 : 1) : 0,
            被标记: isMarked ? 1 : 0
          }
        };
      }
    });

    // 事件7：圆环之理的碎片（高轮回次数专属）
    if (cycleCount > 30 && player.希望系统.希望碎片 > 200) {
      events.push({
        name: '圆环之理的碎片',
        weight: cycleCount / 100,
        generate: () => {
          const shards = baseMaxShards + Math.floor(cycleCount / 2);

          const messages = [
            `🌈 圆环之理的碎片`,
            `一瞬间，你仿佛看到了——所有的绝望被一道粉色的光芒温柔地包裹、带走。`,
            `一个声音在无尽遥远的地方低语：「没关系的，所有的魔法少女，都由我来拯救...」`,
            `你短暂感受到了「圆环之理」的浩瀚与慈悲。`
          ];

          return {
            message: messages,
            shardsGained: shards,
            additionalStats: { 时间线干涉: 2, 因果律领悟: 3 }
          };
        }
      });
    }

    // 事件8：晓美焰的时之狭间（高轮回次数专属）
    if (cycleCount > 50) {
      events.push({
        name: '晓美焰的时之狭间',
        weight: cycleCount / 150,
        generate: () => {
          const shards = baseMaxShards + Math.floor(cycleCount / 3);

          const messages = [
            `⏳ 晓美焰的时之狭间`,
            `空气中弥漫着时间被强行扭断的焦灼感。`,
            `你看到无数个黑发少女的身影在重叠、破碎、又重组。`,
            `「我绝不能...放弃...」无数的低语汇成一股执念的洪流。`,
            `获得了「时之加护」，下次行动时间减半。`
          ];

          return {
            message: messages,
            shardsGained: shards,
            additionalStats: { 时之加护: 1 }
          };
        }
      });
    }

    // 加权随机选择事件
    const weightedEvents = [];
    events.forEach(event => {
      const weight = Math.max(0.1, Math.min(event.weight, 2)); // 限制权重范围
      for (let i = 0; i < weight * 10; i++) {
        weightedEvents.push(event);
      }
    });

    const selectedEvent = weightedEvents[Math.floor(Math.random() * weightedEvents.length)];
    return selectedEvent.generate();
  }
}
