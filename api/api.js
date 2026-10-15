import plugin from '../../../lib/plugins/plugin.js';
import common from '../../../lib/common/common.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import fs from 'fs';
import path from 'path';
import config from '../model/Config.js';
import data from '../model/XiuxianData.js';
import Show from '../model/show.js';
import { getRevivalCommandBlock } from '../model/revivalEarth.js';
import { getTrialCommandBlock } from '../model/trialUniverse.js';
import { getSwordMagicCommandBlock } from '../model/swordMagic.js';

const screenshotQueueGuard = Symbol.for('zhutianxiuxian.puppeteerQueueGuard');
if (!puppeteer[screenshotQueueGuard]) {
    const screenshot = puppeteer.screenshot.bind(puppeteer);
    puppeteer.screenshot = async (...args) => {
        const result = await screenshot(...args);
        if (result === false && Array.isArray(puppeteer.shoting)) {
            const index = puppeteer.shoting.lastIndexOf(args[0]);
            if (index >= 0) puppeteer.shoting.splice(index, 1);
        }
        return result;
    };
    puppeteer[screenshotQueueGuard] = true;
}

// 获取资源文件路径
const getResourcePath = (relativePath) => {
    return path.join(process.cwd(), 'plugins', 'zhutianxiuxian1.0', 'resources', 'data', relativePath);
};

// 读取JSON文件
const readJsonFile = (filePath) => {
    try {
        const fullPath = getResourcePath(filePath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            return JSON.parse(content);
        }
        return null;
    } catch (e) {
        logger.error(`读取JSON文件失败: ${filePath}`, e);
        return null;
    }
};

// 计算器数据API
export const calculatorData = async (e) => {
    // 只允许私聊或管理员使用
    if (e.isGroup && !e.isMaster) {
        return false;
    }
    
    // 读取所有需要的JSON数据
    const result = {
        success: true,
        data: {
            // 练气境界
            levelData: readJsonFile('Level/练气境界.json') || [],
            // 秘境体系
            mijingData: readJsonFile('Level/秘境体系.json') || [],
            // 仙古今世法
            xianguData: readJsonFile('Level/仙古今世法.json') || [],
            // 花粉进化路
            huafenData: readJsonFile('Level/花粉进化路体系.json') || [],
            // 灵根列表
            linggenData: readJsonFile('item/灵根列表.json') || [],
            // 装备列表
            equipData: readJsonFile('item/装备列表.json') || [],
            // 帝兵列表
            emperorData: readJsonFile('item/帝兵列表.json') || [],
            // 体质列表 (从灵根中提取)
            physiqueData: []
        }
    };
    
    // 从灵根列表中提取体质类型
    const linggenData = result.data.linggenData;
    if (linggenData && Array.isArray(linggenData)) {
        result.data.physiqueData = linggenData.filter(item => item.type === '体质' || item.type === '特殊体质');
    }
    
    // 返回JSON数据
    e.reply(JSON.stringify(result, null, 2));
    return true;
};

export const verc = ({ e }) => {
    let userId = String(e?.user_id || '').replace('qg_', '');
    if (userId) {
        try {
            // 与 channel() 一致：绑定 QQ 存档存在时才切换，避免频道号绕开独立路线门禁。
            const channelFile = getResourcePath(path.join('channel', 'channel.json'));
            try {
                if (fs.existsSync(channelFile)) {
                    const records = JSON.parse(fs.readFileSync(channelFile, 'utf8'));
                    const binding = Array.isArray(records) && records.find(record => String(record.频道_ID) === userId);
                    if (binding && fs.existsSync(getResourcePath(path.join('xiuxian_player', `${binding.QQ_ID}.json`)))) {
                        userId = String(binding.QQ_ID);
                    }
                }
            } catch (error) {
                console.warn(`[频道映射] 读取玩家 ${userId} 绑定失败：${error.message}`);
            }
            const playerFile = getResourcePath(path.join('xiuxian_player', `${userId}.json`));
            if (fs.existsSync(playerFile)) {
                const player = JSON.parse(fs.readFileSync(playerFile, 'utf8'));
                if (player.剑与魔法) {
                    const block = getSwordMagicCommandBlock(player, e.msg);
                    if (block) {
                        e.reply?.(block);
                        return false;
                    }
                }
                if (player.试炼宇宙) {
                    const block = getTrialCommandBlock(player, e.msg);
                    if (block) {
                        e.reply?.(block);
                        return false;
                    }
                }
                if (player.复活地球) {
                    const block = getRevivalCommandBlock(player, e.msg);
                    if (block) {
                        e.reply?.(block);
                        return false;
                    }
                }
                if (player.始祖永祭?.status === 'bubble') {
                    e.reply?.('【始祖永祭·空间泡影】现世交互暂停；现实时间720分钟后方可挣脱。发送 #空间泡影状态 查看进度。');
                    return false;
                }
                const sacrificeLockUntil = Number(player.诡异祭礼身灭道消至) || 0;
                if (sacrificeLockUntil > Date.now()) {
                    const hours = Math.ceil((sacrificeLockUntil - Date.now()) / 3600000);
                    e.reply?.(`【身灭道消·诸法皆寂】过去时间线尚未重聚，${hours}小时内不可进行任何交互。`);
                    return false;
                }
                if (player.练气存档状态 === '不可用' || player.练气存档状态 === '永久不可用') {
                    e.reply?.(player.练气存档状态 === '永久不可用'
                        ? '【古史尽灭】所有时间线与当世道标均已熄灭，练气存档永久封锁。'
                        : '【形神俱灭】肉身与神魂均已毁灭，练气存档、纳戒处于封锁状态，需由仙帝使用 #重塑形神。');
                    return false;
                }
            }
        } catch (error) {
            console.warn(`[形神状态] 读取玩家 ${userId} 失败：${error.message}`);
        }
    }
    return true;
};

export { plugin, common, puppeteer, data, config, Show };
