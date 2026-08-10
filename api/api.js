import plugin from '../../../lib/plugins/plugin.js';
import common from '../../../lib/common/common.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import fs from 'fs';
import path from 'path';
import config from '../model/Config.js';
import data from '../model/XiuxianData.js';
import Show from '../model/show.js';

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
    return true;
};

export { plugin, common, puppeteer, data, config, Show };
