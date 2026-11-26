/**
 * 修仙属性面板计算器 - 数据服务器
 * 运行方式: node calculator-server.js
 * 端口: 3000
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取资源文件路径
const getResourcePath = (relativePath) => {
    return path.join(__dirname, '..', 'resources', 'data', relativePath);
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
        console.error(`读取JSON文件失败: ${filePath}`, e);
        return null;
    }
};

// MIME类型
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API路由
    if (pathname === '/api/calculator-data') {
        const levelData = readJsonFile('Level/练气境界.json') || [];
        const liantiData = readJsonFile('Level/炼体境界.json') || []; // 炼体境界
        const mijingData = readJsonFile('Level/秘境体系.json') || [];
        const xianguData = readJsonFile('Level/仙古今世法.json') || [];
        const linggenRaw = readJsonFile('item/灵根列表.json') || [];
        const equipRaw = readJsonFile('item/装备列表.json') || [];
        const emperorRaw = readJsonFile('item/帝兵列表.json') || [];
        
        // 处理灵根数据 - 分类
        const linggenData = {
            伪灵根: [],
            真灵根: [],
            变异灵根: [],
            天灵根: [],
            体质: [],
            转生: [],
            魔头: [],
            圣体: [],
            混沌体: [],
            命运: [],
            天魔: [],
            至尊体: [],
            神魔体: [],
            大道体: [],
            超越诸天: [],
            其他: []
        };
        
        linggenRaw.forEach(item => {
            const type = item.type || '其他';
            if (linggenData[type]) {
                linggenData[type].push(item);
            } else {
                linggenData['其他'].push(item);
            }
        });
        
        // 处理装备数据 - 分类
        const equipData = {
            武器: [],
            护具: [],
            法宝: []
        };
        
        equipRaw.forEach(item => {
            const type = item.type || '其他';
            if (equipData[type]) {
                equipData[type].push(item);
            } else {
                equipData['武器'].push(item);
            }
        });
        
        // 帝兵品阶列表（用于自定义帝兵）
        const DI_BING_RANKS = [
            { id: 1, name: "雏形", rank: "雏形" },
            { id: 2, name: "通灵", rank: "通灵" },
            { id: 3, name: "铭刻道与理", rank: "铭刻道与理" },
            { id: 4, name: "斩道王兵", rank: "斩道王兵" },
            { id: 5, name: "圣兵", rank: "圣兵" },
            { id: 6, name: "准帝兵", rank: "准帝兵" },
            { id: 7, name: "极道帝兵", rank: "极道帝兵" },
            { id: 8, name: "仙器", rank: "仙器" },
            { id: 9, name: "仙王器", rank: "仙王器" },
            { id: 10, name: "准仙帝器", rank: "准仙帝器" },
            { id: 11, name: "仙帝器", rank: "仙帝器" },
            { id: 12, name: "祭道器", rank: "祭道器" }
        ];
        
        // 仙金材料列表（用于帝兵融合）
        const IMMORTAL_GOLDS = [
            "仙泪绿金", "凰血赤金", "龙纹黑金", "永恒蓝金",
            "神痕紫金", "道劫黄金", "羽化青金", "混沌石精",
            "大罗银精", "太初源金", "混沌母金", "万物源金"
        ];
        
        // 帝兵形态
        const WEAPON_FORMS = ["剑", "鼎", "枪", "钟", "塔", "镜", "印", "刀", "斧", "戟", "鞭", "琴", "扇"];
        
        // 百分比装备预设列表（常见百分比装备）
        const PERCENT_EQUIP_LIST = [
            { id: "pe_1", name: "天元一击", type: "百分比武器", atk_per: 0.5, def_per: 0, hp_per: 0, desc: "攻击+50%" },
            { id: "pe_2", name: "玄武护甲", type: "百分比护具", atk_per: 0, def_per: 0.5, hp_per: 0, desc: "防御+50%" },
            { id: "pe_3", name: "生命之泉", type: "百分比法宝", atk_per: 0, def_per: 0, hp_per: 0.5, desc: "生命+50%" },
            { id: "pe_4", name: "攻防一体", type: "百分比装备", atk_per: 0.3, def_per: 0.3, hp_per: 0, desc: "攻防+30%" },
            { id: "pe_5", name: "全能战甲", type: "百分比装备", atk_per: 0.2, def_per: 0.2, hp_per: 0.2, desc: "全属性+20%" },
            { id: "pe_6", name: "攻击至圣", type: "百分比武器", atk_per: 1.0, def_per: 0, hp_per: 0, desc: "攻击+100%" },
            { id: "pe_7", name: "防御至圣", type: "百分比护具", atk_per: 0, def_per: 1.0, hp_per: 0, desc: "防御+100%" },
            { id: "pe_8", name: "生命至圣", type: "百分比法宝", atk_per: 0, def_per: 0, hp_per: 1.0, desc: "生命+100%" }
        ];
        
        // 处理帝兵数据
        const emperorData = emperorRaw.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type || '帝兵',
            攻击: item.攻击 || 0,
            防御: item.防御 || 0,
            生命: item.生命 || 0,
            全属性: item.全属性 || 0,
            暴击: item.暴击 || 0
        }));
        
        const result = {
            success: true,
            data: {
                levelData,       // 练气境界
                liantiData,      // 炼体境界
                mijingData,      // 秘境体系
                xianguData,      // 仙古今世法
                linggenData,     // 灵根列表
                equipData,       // 装备列表
                emperorData,     // 帝兵列表
                diBingRanks: DI_BING_RANKS,    // 帝兵品阶
                immortalGolds: IMMORTAL_GOLDS,  // 仙金材料
                weaponForms: WEAPON_FORMS,      // 帝兵形态
                percentEquipList: PERCENT_EQUIP_LIST  // 百分比装备列表
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
    }
    
    // HTML页面
    if (pathname === '/' || pathname === '/calculator.html') {
        const htmlPath = path.join(__dirname, 'calculator.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('calculator.html not found');
        }
        return;
    }
    
    // 静态资源
    let filePath = path.join(__dirname, pathname);
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', pathname);
    }
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(fs.readFileSync(filePath));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🌟 修仙属性面板计算器服务器已启动`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`📍 或者: http://127.0.0.1:${PORT}`);
    console.log(`========================================\n`);
    console.log(`按 Ctrl+C 停止服务器\n`);
});
