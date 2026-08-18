import { plugin, verc, data, config } from '../../api/api.js';
import {
    existplayer,
    Read_player,
    exist_najie_thing,
    Read_najie,
    Write_najie,
    Add_najie_thing,
    Write_player,
    Read_equipment,
    Write_equipment,
    Add_修为,
    isNotNull
} from '../../model/xiuxian.js';

// 全局战斗房间存储（保持原结构）
const 战斗房间 = {};
const 装备绝对值阈值 = 99999;
const 百分比装备成长倍率 = 1.75;
const 百分比装备淬炼成长倍率 = 1.6;
const 百分比装备镶嵌倍率 = 1.5;
const 百分比装备终极强化倍率 = 1.35;
const 百分比装备升华倍率折算 = 0.06;
const 百分比装备升华法则除数 = 1e13;
const 终极强化等级成功率衰减 = 0.045;
const 终极强化成功次数衰减 = 0.012;

const 计算终极强化成功率 = (等级索引, 成功强化次数) => {
    return Math.max(0, 1 - (等级索引 * 终极强化等级成功率衰减 + 成功强化次数 * 终极强化成功次数衰减));
};

// 属性转换工具：兼容数字、"50%"，并贴合装备战力刷新里的 >99999 判定。
const parsePercent = (val) => {
    if (typeof val === "string" && val.includes("%")) {
        const num = Number(val.replace("%", ""));
        return isNaN(num) ? 0 : num / 100;
    }
    return typeof val === "number" ? val : 0;
};

const roundAttr = (val, digits = 6) => {
    const num = Number(val) || 0;
    const rate = Math.pow(10, digits);
    return Math.round(num * rate) / rate;
};

const getAttrValue = (equip, key) => parsePercent(equip?.[key]);

const isAbsoluteEquipment = (equip) => {
    if (!equip) return false;
    return ['atk', 'def', 'HP'].some(key => getAttrValue(equip, key) > 装备绝对值阈值);
};

const getModeName = (equip) => isAbsoluteEquipment(equip) ? '绝对值' : '百分比';

// 判断单项属性是否是显式百分比格式，保留给旧逻辑兜底。
const isPercentFormat = (val) => {
    if (typeof val === "string" && val.includes("%")) return true;
    if (typeof val === "number" && val > 0 && val < 1) return true;
    return false;
};

// 公共材料定义（保持原配置）
const 核心材料 = {
    "太初魂晶": { 攻击: 1500000000, 防御: 500000000, 血量: 1000000000, 暴击率: 0.08, 描述: "开天辟地时残留的先天魂光", 唯一: true },
    "九霄灵髓": { 攻击: 2000000000, 防御: 200000000, 血量: 500000000, 暴击率: 0.15, 描述: "九天雷云中淬炼千年的灵髓", 唯一: true },
    "幽冥月露": { 攻击: 1200000000, 防御: 800000000, 血量: 1500000000, 暴击率: 0.05, 描述: "黄泉彼岸月华凝结的至阴露珠", 唯一: true },
};

const 辅材材料 = {
    "天狼牙砂": { 攻击: 300000000, 防御: 1800000000, 血量: 1200000000, 暴击率: 0.02, 描述: "洪荒天狼陨落后犬齿所化金砂", 唯一: true },
    "玄武铁鳞": { 攻击: 500000000, 防御: 1500000000, 血量: 2000000000, 暴击率: 0, 描述: "神兽玄武脱落的背甲鳞片", 唯一: true },
    "凤凰火羽": { 攻击: 800000000, 防御: 1000000000, 血量: 1500000000, 暴击率: 0.05, 描述: "涅槃凤凰尾羽残留的火种", 唯一: true },
    "饕餮骨玉": { 攻击: 1000000000, 防御: 1200000000, 血量: 1000000000, 暴击率: 0.03, 描述: "凶兽饕餮喉间软骨所化", 唯一: true },
    "麒麟角粉": { 攻击: 600000000, 防御: 2000000000, 血量: 800000000, 暴击率: 0.01, 描述: "祥瑞麒麟断角研磨的晶粉", 唯一: true },
    "建木心屑": { 攻击: 400000000, 防御: 1600000000, 血量: 1800000000, 暴击率: 0, 描述: "上古建木树心剥落的木屑", 唯一: true },
    "鲲鹏绒羽": { 攻击: 700000000, 防御: 1000000000, 血量: 1500000000, 暴击率: 0.04, 描述: "北冥鲲鹏翼尖脱落的绒羽", 唯一: true },
};

const 修复温养材料 = {
    "青岚髓": { 修复值: 800, 契合度: 2, 心情: 4, 描述: "修补细裂并温养器灵" },
    "玄水丝": { 修复值: 1200, 耐久上限率: 0.01, 心情: 6, 描述: "滋润器身，缓慢抬高耐久上限" },
    "劫火红绒": { 修复值: 2000, 淬炼值: 8000, 攻击淬火: 0.002, 描述: "重铸破损处，适合攻伐器淬火" },
    "木灵胶": { 修复值: 1500, 防御护持: 0.002, 生命护持: 0.002, 描述: "粘合断裂部位，强化护持与生机" },
    "星尘砂": { 修复值: 3000, 时空: 1200, 因果: 800, 描述: "填补空间裂痕，补全法则纹路" }
};

const 淬炼材料 = {
    "五行聚灵晶": {
        淬炼值: 70000,
        攻击加成: 1200000000,
        防御加成: 1200000000,
        血量加成: 1200000000,
        百分比加成: { atk: 0.004, def: 0.004, HP: 0.004 },
        五行: 9000,
        契合度: 2,
        描述: "五行均衡，适合补齐三维短板"
    },
    "阴阳两极砂": {
        淬炼值: 60000,
        攻击加成: 1600000000,
        防御加成: 1600000000,
        血量加成: 700000000,
        百分比加成: { atk: 0.005, def: 0.005, HP: 0.002 },
        阴阳: 11000,
        暴击率: 0.003,
        契合度: 1,
        描述: "阴阳并济，偏攻防并少量提升暴击"
    },
    "时空凝滞石": {
        淬炼值: 95000,
        攻击加成: 900000000,
        防御加成: 900000000,
        血量加成: 900000000,
        百分比加成: { atk: 0.003, def: 0.003, HP: 0.003 },
        时空: 13000,
        心情: -1,
        描述: "时空稳固，淬炼进度最高并强化先手"
    },
    "因果纠缠丝": {
        淬炼值: 55000,
        攻击加成: 1400000000,
        防御加成: 800000000,
        血量加成: 1200000000,
        百分比加成: { atk: 0.005, def: 0.002, HP: 0.004 },
        因果: 14000,
        本命感应: 12,
        契合度: 3,
        描述: "因果牵引，提升本命感应与战斗逆转"
    },
    "生命本源露": {
        淬炼值: 60000,
        攻击加成: 700000000,
        防御加成: 1200000000,
        血量加成: 2200000000,
        百分比加成: { atk: 0.002, def: 0.004, HP: 0.007 },
        生命: 15000,
        心情: 4,
        契合度: 2,
        描述: "生命滋养，偏血量、耐久和器灵状态"
    }
};
// ========== 三大模块专属配置 ==========
// 1. 武器模块配置
const 武器配置 = {
    等级体系: [
        "凡铁", "剑胎", "利剑", "灵剑", "宝器", "法器", 
        "灵器", "仙器", "神器", "道器", "先天灵宝", "混沌至宝",
        "鸿蒙道胚", "太初源器"
    ],
    灵体名称: "剑灵",
    核心名称: "三魂",
    辅材名称: "七魄",
    魂魄圆满境界: ["鸿蒙道胚", "太初源器"],
    初始属性: {
        耐久度: 1000,
        耐久上限: 5000,
        atk: 10000,  // 侧重攻击
        def: 5000,
        HP: 50000,
        淬炼值: 0,
        五行: 0,
        阴阳: 0,
        时空: 0,
        因果: 0,
        生命: 0,
        鞘: 0  // 武器专属形态
    },
    升华倍数: {
        "凡铁": { 攻击: 1.2, 防御: 1.1, 生命: 1.3 },
        "剑胎": { 攻击: 1.5, 防御: 1.4, 生命: 1.6 },
        "利剑": { 攻击: 1.6, 防御: 1.5, 生命: 1.7 },
        "灵剑": { 攻击: 1.7, 防御: 1.6, 生命: 1.8 },
        "宝器": { 攻击: 1.8, 防御: 1.7, 生命: 1.9 },
        "法器": { 攻击: 1.9, 防御: 1.8, 生命: 2.0 },
        "灵器": { 攻击: 2.0, 防御: 1.9, 生命: 2.1 },
        "仙器": { 攻击: 2.2, 防御: 2.1, 生命: 2.3 },
        "神器": { 攻击: 2.5, 防御: 2.4, 生命: 2.6 },
        "道器": { 攻击: 3.0, 防御: 2.8, 生命: 3.2 },
        "先天灵宝": { 攻击: 4.0, 防御: 3.8, 生命: 4.2 },
        "混沌至宝": { 攻击: 5.0, 防御: 4.8, 生命: 5.2 },
        "鸿蒙道胚": { 攻击: 6.5, 防御: 6.2, 生命: 6.8 },
        "太初源器": { 攻击: 8.0, 防御: 7.6, 生命: 8.4 }
    },
    淬炼上限需求: {
        "剑胎": 100000,
        "利剑": 300000,
        "灵剑": 500000,
        "宝器": 800000,
        "法器": 1200000,
        "灵器": 2000000,
        "仙器": 3000000,
        "神器": 5000000,
        "道器": 8000000,
        "先天灵宝": 12000000,
        "混沌至宝": 20000000,
        "鸿蒙道胚": 36000000,
        "太初源器": 60000000
    },
    耐久上限配置: {
        "剑胎": 5000,
        "利剑": 8000,
        "灵剑": 12000,
        "宝器": 18000,
        "法器": 25000,
        "灵器": 35000,
        "仙器": 50000,
        "神器": 80000,
        "道器": 120000,
        "先天灵宝": 200000,
        "混沌至宝": 300000,
        "鸿蒙道胚": 500000,
        "太初源器": 800000
    }
};
// 2. 护具模块配置
const 护具配置 = {
    等级体系: [
        "凡布", "护心", "精钢甲", "宝甲", "灵甲", "仙甲",
        "神甲", "道甲", "先天甲", "混沌甲", "鸿蒙圣甲", "太初祖甲"
    ],
    灵体名称: "护灵",
    核心名称: "核心",
    辅材名称: "辅魂",
    魂魄圆满境界: ["鸿蒙圣甲", "太初祖甲"],
    初始属性: {
        耐久度: 1500,  // 侧重防御耐久
        耐久上限: 8000,
        atk: 3000,
        def: 10000,  // 侧重防御
        HP: 80000,    // 侧重血量
        淬炼值: 0,
        五行: 0,
        阴阳: 0,
        时空: 0,
        因果: 0,
        生命: 0
    },
    升华倍数: {
        "凡布": { 攻击: 1.1, 防御: 1.5, 生命: 1.6 },
        "护心": { 攻击: 1.2, 防御: 1.8, 生命: 1.9 },
        "精钢甲": { 攻击: 1.3, 防御: 2.0, 生命: 2.2 },
        "宝甲": { 攻击: 1.4, 防御: 2.3, 生命: 2.5 },
        "灵甲": { 攻击: 1.5, 防御: 2.6, 生命: 2.8 },
        "仙甲": { 攻击: 1.7, 防御: 3.0, 生命: 3.2 },
        "神甲": { 攻击: 2.0, 防御: 3.5, 生命: 3.8 },
        "道甲": { 攻击: 2.5, 防御: 4.0, 生命: 4.5 },
        "先天甲": { 攻击: 3.0, 防御: 4.8, 生命: 5.2 },
        "混沌甲": { 攻击: 4.0, 防御: 6.0, 生命: 6.5 },
        "鸿蒙圣甲": { 攻击: 5.5, 防御: 7.6, 生命: 8.2 },
        "太初祖甲": { 攻击: 7.0, 防御: 9.2, 生命: 10.0 }
    },
    淬炼上限需求: {
        "护心": 80000,
        "精钢甲": 150000,
        "宝甲": 300000,
        "灵甲": 500000,
        "仙甲": 800000,
        "神甲": 1200000,
        "道甲": 2000000,
        "先天甲": 5000000,
        "混沌甲": 10000000,
        "鸿蒙圣甲": 18000000,
        "太初祖甲": 32000000
    },
    耐久上限配置: {
        "护心": 8000,
        "精钢甲": 15000,
        "宝甲": 25000,
        "灵甲": 40000,
        "仙甲": 60000,
        "神甲": 90000,
        "道甲": 150000,
        "先天甲": 250000,
        "混沌甲": 400000,
        "鸿蒙圣甲": 650000,
        "太初祖甲": 1000000
    }
};
// 3. 法宝模块配置
const 法宝配置 = {
    等级体系: [
        "凡器", "法器", "宝器", "灵器", "仙器", "神器",
        "道器", "先天灵宝", "混沌至宝", "鸿蒙道宝", "太初源宝"
    ],
    灵体名称: "宝灵",
    核心名称: "灵韵",
    辅材名称: "灵纹",
    魂魄圆满境界: ["鸿蒙道宝", "太初源宝"],
    初始属性: {
        耐久度: 800,  // 耐久较低
        耐久上限: 3000,
        atk: 5000,
        def: 5000,
        HP: 100000,  // 侧重血量
        淬炼值: 0,
        五行: 1000,  // 侧重法则
        阴阳: 1000,
        时空: 0,
        因果: 0,
        生命: 0
    },
    升华倍数: {
        "凡器": { 攻击: 1.2, 防御: 1.2, 生命: 1.8 },
        "法器": { 攻击: 1.4, 防御: 1.4, 生命: 2.0 },
        "宝器": { 攻击: 1.6, 防御: 1.6, 生命: 2.3 },
        "灵器": { 攻击: 1.8, 防御: 1.8, 生命: 2.6 },
        "仙器": { 攻击: 2.1, 防御: 2.1, 生命: 3.0 },
        "神器": { 攻击: 2.5, 防御: 2.5, 生命: 3.5 },
        "道器": { 攻击: 3.0, 防御: 3.0, 生命: 4.0 },
        "先天灵宝": { 攻击: 3.8, 防御: 3.8, 生命: 4.8 },
        "混沌至宝": { 攻击: 5.0, 防御: 5.0, 生命: 6.0 },
        "鸿蒙道宝": { 攻击: 6.5, 防御: 6.5, 生命: 7.8 },
        "太初源宝": { 攻击: 8.0, 防御: 8.0, 生命: 9.6 }
    },
    淬炼上限需求: {
        "法器": 100000,
        "宝器": 200000,
        "灵器": 400000,
        "仙器": 800000,
        "神器": 1500000,
        "道器": 3000000,
        "先天灵宝": 8000000,
        "混沌至宝": 15000000,
        "鸿蒙道宝": 28000000,
        "太初源宝": 52000000
    },
    耐久上限配置: {
        "法器": 3000,
        "宝器": 6000,
        "灵器": 12000,
        "仙器": 20000,
        "神器": 35000,
        "道器": 60000,
        "先天灵宝": 120000,
        "混沌至宝": 250000,
        "鸿蒙道宝": 420000,
        "太初源宝": 700000
    }
};
// ========== 灵体初始配置（通用结构，名称适配模块） ==========
const getLingtiInitConfig = (lingtiName, coreName, auxName) => ({
    [lingtiName]: {
        [coreName]: [],
        [auxName]: [],
        姓名: null,
        性别: null,
        性格: null,
        契合度: 0,
        阶段: "形同陌路",
        心情: 50,
        攻击属性加成: 0,
        防御属性加成: 0,
        血量属性加成: 0
    }
});
// ========== 主类实现 ==========
export class fenjue extends plugin {
    constructor() {
        super({
            name: '本命三大模块',
            dsc: '本命武器、护具、法宝全功能（兼容批量消耗+成功率优化）',
            event: 'message',
            priority: 10,
            rule: [
                { reg: '^#本命帮助$', fnc: '本命帮助' },
                // 炼化指令（不变）
                { reg: '^#炼化本命武器$', fnc: '炼化武器' },
                { reg: '^#炼化本命护具$', fnc: '炼化护具' },
                { reg: '^#炼化本命法宝$', fnc: '炼化法宝' },
                // 修复/温养指令（不变）
                { reg: '^#(.*)修复爱剑$', fnc: '修复武器' },
                { reg: '^#(.*)修复护具$', fnc: '修复护具' },
                { reg: '^#(.*)温养法宝$', fnc: '温养法宝' },
                // 淬炼指令（不变）
                { reg: '^#淬炼剑身(.*)(\\*\\d+)?$', fnc: '淬炼武器' },
                { reg: '^#淬炼护具(.*)(\\*\\d+)?$', fnc: '淬炼护具' },
                { reg: '^#淬炼法宝(.*)(\\*\\d+)?$', fnc: '淬炼法宝' },
                // 升华指令（不变）
                { reg: '^#升华本命剑$', fnc: '升华武器' },
                { reg: '^#升华本命护具$', fnc: '升华护具' },
                { reg: '^#升华本命法宝$', fnc: '升华法宝' },
                // 镶嵌指令（不变）
                { reg: '^#剑魂镶嵌(.*)$', fnc: '镶嵌武器核心' },
                { reg: '^#护灵核心镶嵌(.*)$', fnc: '镶嵌护具核心' },
                { reg: '^#宝灵灵韵镶嵌(.*)$', fnc: '镶嵌法宝灵韵' },
                { reg: '^#剑魄镶嵌(.*)$', fnc: '镶嵌武器辅材' },
                { reg: '^#护灵辅魂镶嵌(.*)$', fnc: '镶嵌护具辅材' },
                { reg: '^#宝灵灵纹镶嵌(.*)$', fnc: '镶嵌法宝辅材' },
                { reg: '^#一键(本命|本命武器|本命护具|本命法宝|剑魂|剑魄|护灵核心|护灵辅魂|宝灵灵韵|宝灵灵纹)镶嵌$', fnc: '一键镶嵌' },
                // 灵体指令（不变）
                { reg: '^#召唤剑灵$', fnc: '召唤武器灵体' },
                { reg: '^#召唤护灵$', fnc: '召唤护具灵体' },
                { reg: '^#召唤宝灵$', fnc: '召唤法宝灵体' },
                { reg: '^#剑灵命名 .+$', fnc: '召唤武器灵体' },
                { reg: '^#护灵命名 .+$', fnc: '召唤护具灵体' },
                { reg: '^#宝灵命名 .+$', fnc: '召唤法宝灵体' },
                { reg: '^#剑灵性别 .+$', fnc: '召唤武器灵体' },
                { reg: '^#护灵性别 .+$', fnc: '召唤护具灵体' },
                { reg: '^#宝灵性别 .+$', fnc: '召唤法宝灵体' },
                { reg: '^#剑灵状态$', fnc: '召唤武器灵体' },
                { reg: '^#护灵状态$', fnc: '召唤护具灵体' },
                { reg: '^#宝灵状态$', fnc: '召唤法宝灵体' },
                { reg: '^#磨合心性$', fnc: '磨合武器灵体' },
                { reg: '^#磨合剑灵$', fnc: '磨合武器灵体' },
                { reg: '^#磨合护灵$', fnc: '磨合护具灵体' },
                { reg: '^#磨合宝灵$', fnc: '磨合法宝灵体' },
                // 共鸣指令（不变）
                { reg: '^#剑境共鸣$', fnc: '武器共鸣' },
                { reg: '^#护境共鸣$', fnc: '护具共鸣' },
                { reg: '^#宝境共鸣$', fnc: '法宝共鸣' },
                // 武器形态转换（不变）
                { reg: '^#化剑为鞘$', fnc: '化剑为鞘' },
                { reg: '^#化鞘为剑$', fnc: '化鞘为剑' },
                // 终极强化指令（适配批量格式）
                { reg: '^#(引雷淬火|玄铁精炼|法则滋养)(\\*\\d+)?$', fnc: '通用终极强化' },
                // 对战指令（不变）
                { reg: '^#召唤(剑灵|护灵|宝灵)战斗(\\d+)$', fnc: '玩家灵体对战' },
            ]
        });
    }

    // 帮助指令（精简描述）
    async 本命帮助(e) {
        if (!e.isGroup) return;
        const 帮助内容 = `
【本命系统帮助】

一、炼化本命
#炼化本命武器
#炼化本命护具
#炼化本命法宝

二、养护与淬炼
#材料名 修复爱剑
#材料名 修复护具
#材料名 温养法宝
#淬炼剑身 材料名*N
#淬炼护具 材料名*N
#淬炼法宝 材料名*N
说明：淬炼会触发稳火、精炼、大成、过载、余烬等异象。

三、升华进阶
#升华本命剑
#升华本命护具
#升华本命法宝
说明：魂魄圆满后，才可继续突破最后两阶终境。

四、魂魄镶嵌
#剑魂镶嵌材料
#剑魄镶嵌材料
#护灵核心镶嵌材料
#护灵辅魂镶嵌材料
#宝灵灵韵镶嵌材料
#宝灵灵纹镶嵌材料

五、一键镶嵌
#一键本命镶嵌
#一键本命武器镶嵌
#一键本命护具镶嵌
#一键本命法宝镶嵌
#一键剑魂镶嵌 / #一键剑魄镶嵌

六、器灵养成
#召唤剑灵 / #召唤护灵 / #召唤宝灵
#剑灵命名 名字 / #护灵命名 名字 / #宝灵命名 名字
#剑灵性别 男/女 / #护灵性别 男/女 / #宝灵性别 男/女
#剑灵状态 / #护灵状态 / #宝灵状态
#磨合剑灵 / #磨合护灵 / #磨合宝灵
说明：器灵会根据镶嵌材料觉醒天赋。

七、共鸣与形态
#剑境共鸣 / #护境共鸣 / #宝境共鸣
#化剑为鞘
#化鞘为剑

八、终极强化
#引雷淬火*N
#玄铁精炼*N
#法则滋养*N
说明：成功有强化异象，失败会积累强化残响，满4后下次成功触发天工回响。

九、器灵对战
#召唤剑灵战斗房间号
#召唤护灵战斗房间号
#召唤宝灵战斗房间号
        `.trim();
        await e.reply(帮助内容);
    }
    // ========== 通用工具方法 ==========
    // 获取模块配置
    getModuleConfig(module) {
        switch (module) {
            case '武器': return 武器配置;
            case '护具': return 护具配置;
            case '法宝': return 法宝配置;
            default: return null;
        }
    }
    // 获取模块存储字段
    getModuleField(module) {
        switch (module) {
            case '武器': return '武器';
            case '护具': return '护具';
            case '法宝': return '法宝';
            default: return null;
        }
    }
    // 获取下一等级
    getNextLevel(module, currentLevel) {
        const config = this.getModuleConfig(module);
        const index = config.等级体系.indexOf(currentLevel);
        return index < config.等级体系.length - 1 ? config.等级体系[index + 1] : currentLevel;
    }
    // 获取所需淬炼值
    getRequiredFireSpirit(module, level) {
        const config = this.getModuleConfig(module);
        return config.淬炼上限需求[level] || 0;
    }
    // 获取升级倍数
    getUpgradeMultiplier(module, currentLevel) {
        const config = this.getModuleConfig(module);
        return config.升华倍数[currentLevel] || { 攻击: 1, 防御: 1, 生命: 1 };
    }
    getPercentUpgradeMultiplier(multiplier) {
        const convert = (value) => roundAttr(1 + Math.max(0, (Number(value) || 1) - 1) * 百分比装备升华倍率折算, 4);
        return {
            攻击: convert(multiplier.攻击),
            防御: convert(multiplier.防御),
            生命: convert(multiplier.生命)
        };
    }
    // 获取耐久上限
    getDurabilityUpperLimit(module, level) {
        const config = this.getModuleConfig(module);
        return config.耐久上限配置[level] || config.初始属性.耐久上限;
    }
    getModuleGrowthBias(module) {
        return {
            武器: { atk: 1.25, def: 0.75, HP: 0.85 },
            护具: { atk: 0.75, def: 1.25, HP: 1.05 },
            法宝: { atk: 0.9, def: 0.9, HP: 1.25 }
        }[module] || { atk: 1, def: 1, HP: 1 };
    }
    getSoulProgress(equip, module) {
        const config = this.getModuleConfig(module);
        const lingti = equip?.[config.灵体名称] || {};
        const coreSlots = Array.isArray(lingti[config.核心名称]) ? lingti[config.核心名称] : [];
        const auxSlots = Array.isArray(lingti[config.辅材名称]) ? lingti[config.辅材名称] : [];
        const coreCount = Math.min(coreSlots.length, 3);
        const auxCount = Math.min(auxSlots.length, 7);
        const total = coreCount + auxCount;
        return {
            coreName: config.核心名称,
            auxName: config.辅材名称,
            coreCount,
            auxCount,
            total,
            rate: total / 10,
            complete: coreCount >= 3 && auxCount >= 7,
            label: `${config.核心名称}:${coreCount}/3 ${config.辅材名称}:${auxCount}/7`
        };
    }
    getSoulPowerMultiplier(equip, module) {
        const soul = this.getSoulProgress(equip, module);
        return roundAttr(1 + soul.coreCount * 0.04 + soul.auxCount * 0.02 + (soul.complete ? 0.25 : 0), 4);
    }
    getSoulResonanceMultiplier(equip, module) {
        const soul = this.getSoulProgress(equip, module);
        return roundAttr(1 + soul.coreCount * 0.05 + soul.auxCount * 0.025 + (soul.complete ? 0.35 : 0), 4);
    }
    getSoulBattleMultiplier(equip, module) {
        const soul = this.getSoulProgress(equip, module);
        return roundAttr(1 + soul.coreCount * 0.06 + soul.auxCount * 0.03 + (soul.complete ? 0.45 : 0), 4);
    }
    getFinalRealmGateMessage(module, equip, nextLevel) {
        const config = this.getModuleConfig(module);
        if (!config.魂魄圆满境界?.includes(nextLevel)) return null;
        const soul = this.getSoulProgress(equip, module);
        if (soul.complete) return null;
        return [
            "❌ 终境升华条件不足",
            `下一境界: ${nextLevel}`,
            `要求: ${config.核心名称}与${config.辅材名称}全部镶嵌`,
            `当前: ${soul.label}`,
            `提示：补全魂魄后才可继续突破最后两个境界`
        ].join("\n");
    }
    getLingtiBirthBonus(module, gender) {
        const table = {
            武器: {
                男: { 攻击: 350000000, 防御: 120000000, 血量: 180000000, 五行: 3000, 时空: 1500 },
                女: { 攻击: 220000000, 防御: 300000000, 血量: 220000000, 阴阳: 2500, 生命: 2000 }
            },
            护具: {
                男: { 攻击: 120000000, 防御: 360000000, 血量: 260000000, 阴阳: 3200, 生命: 2200 },
                女: { 攻击: 90000000, 防御: 420000000, 血量: 320000000, 阴阳: 2600, 生命: 3000 }
            },
            法宝: {
                男: { 攻击: 180000000, 防御: 160000000, 血量: 420000000, 时空: 2600, 生命: 3200 },
                女: { 攻击: 160000000, 防御: 180000000, 血量: 360000000, 五行: 3600, 因果: 2400 }
            }
        };
        return table[module]?.[gender] || { 攻击: 0, 防御: 0, 血量: 0 };
    }
    applySoulCompletionBonus(player, equip, module) {
        const soul = this.getSoulProgress(equip, module);
        if (!soul.complete || equip.魂魄圆满加成已生效) return null;
        const config = this.getModuleConfig(module);
        const lingti = equip[config.灵体名称];
        const mode = getModeName(equip);
        const percentTable = {
            武器: { atk: 0.035, def: 0.015, HP: 0.018 },
            护具: { atk: 0.015, def: 0.035, HP: 0.026 },
            法宝: { atk: 0.022, def: 0.022, HP: 0.04 }
        };
        const flatRateTable = {
            武器: { atk: 0.18, def: 0.1, HP: 0.12 },
            护具: { atk: 0.1, def: 0.18, HP: 0.16 },
            法宝: { atk: 0.13, def: 0.13, HP: 0.2 }
        };
        const gain = mode === '绝对值'
            ? {
                atk: Math.floor(getAttrValue(equip, 'atk') * flatRateTable[module].atk),
                def: Math.floor(getAttrValue(equip, 'def') * flatRateTable[module].def),
                HP: Math.floor(getAttrValue(equip, 'HP') * flatRateTable[module].HP)
            }
            : percentTable[module];
        equip.atk = roundAttr(getAttrValue(equip, 'atk') + gain.atk);
        equip.def = roundAttr(getAttrValue(equip, 'def') + gain.def);
        equip.HP = roundAttr(getAttrValue(equip, 'HP') + gain.HP);
        if (mode === '绝对值') {
            player.攻击 += gain.atk;
            player.防御 += gain.def;
            player.血量上限 += gain.HP;
        }
        equip.本命感应 = 1000;
        equip.魂魄圆满加成已生效 = Date.now();
        if (lingti) {
            lingti.契合度 = Math.min((Number(lingti.契合度) || 0) + 120, 1000);
            lingti.心情 = 100;
            lingti.魂魄特性 = "魂魄圆满";
        }
        const lawBonus = { 五行: 12000, 阴阳: 12000, 时空: 9000, 因果: 9000, 生命: 12000 };
        for (const [key, val] of Object.entries(lawBonus)) {
            equip[key] = (parsePercent(equip[key]) || 0) + val;
        }
        return {
            mode,
            gain,
            lawBonus,
            msg: `魂魄圆满：终境已解锁，强化成长x${this.getSoulPowerMultiplier(equip, module)}，共鸣x${this.getSoulResonanceMultiplier(equip, module)}`
        };
    }
    ensureBenmingState(equip, module) {
        const config = this.getModuleConfig(module);
        const lingtiConfig = getLingtiInitConfig(config.灵体名称, config.核心名称, config.辅材名称);
        for (const [key, val] of Object.entries(config.初始属性)) {
            if (equip[key] === undefined || equip[key] === null) equip[key] = val;
        }
        if (!equip[config.灵体名称]) equip[config.灵体名称] = lingtiConfig[config.灵体名称];
        if (!Array.isArray(equip[config.灵体名称][config.核心名称])) equip[config.灵体名称][config.核心名称] = [];
        if (!Array.isArray(equip[config.灵体名称][config.辅材名称])) equip[config.灵体名称][config.辅材名称] = [];
        if (equip.本命感应 === undefined) equip.本命感应 = equip.炼化可能 === 1 && !equip.等级 ? 260 : 0;
        if (equip.炼化次数 === undefined) equip.炼化次数 = 0;
        return equip;
    }
    计算本命炼化判定(player, equip, module) {
        const pinjiBonus = Math.min((Number(equip.pinji) || 0) * 0.04, 0.24);
        const realmBonus = Math.min(((Number(player.level_id) || 0) + (Number(player.mijinglevel_id) || 0) + (Number(player.xiangulevel_id) || 0)) / 360, 0.22);
        const critBonus = Math.min((Number(equip.bao) || 0) * 0.18, 0.12);
        const sense = Number(equip.本命感应) || 0;
        const senseBonus = Math.min(sense / 1000, 0.5);
        const chance = Math.min(0.22 + pinjiBonus + realmBonus + critBonus + senseBonus, 0.92);
        const senseGain = Math.floor(180 + pinjiBonus * 250 + realmBonus * 180);
        return {
            chance,
            sense,
            senseGain,
            guaranteed: sense >= 1000,
            detail: `基础22% 品级+${Math.round(pinjiBonus * 100)}% 境界+${Math.round(realmBonus * 100)}% 器性+${Math.round(critBonus * 100)}% 感应+${Math.round(senseBonus * 100)}%`
        };
    }
    applyLingtiNurture(equip, module, effect, count = 1) {
        const config = this.getModuleConfig(module);
        const lingti = equip?.[config.灵体名称];
        if (!lingti) return { 契合度: 0, 心情: 0 };
        const addFit = Math.floor((effect.契合度 || 0) * count);
        const addMood = Math.floor((effect.心情 || 0) * count);
        if (addFit) {
            lingti.契合度 = Math.min((Number(lingti.契合度) || 0) + addFit, 1000);
        }
        if (addMood) {
            const mood = Number.isFinite(Number(lingti.心情)) ? Number(lingti.心情) : 50;
            lingti.心情 = Math.min(Math.max(mood + addMood, 0), 100);
        }
        return { 契合度: addFit, 心情: addMood };
    }
    scaleGrowthEffect(effect, attrMultiplier = 1, lawMultiplier = attrMultiplier, fireMultiplier = attrMultiplier) {
        const scaled = { ...effect };
        for (const key of ['攻击加成', '防御加成', '血量加成']) {
            if (effect[key]) scaled[key] = Math.floor(effect[key] * attrMultiplier);
        }
        if (effect.百分比加成) {
            scaled.百分比加成 = {
                atk: roundAttr((effect.百分比加成.atk || 0) * attrMultiplier),
                def: roundAttr((effect.百分比加成.def || 0) * attrMultiplier),
                HP: roundAttr((effect.百分比加成.HP || 0) * attrMultiplier)
            };
        }
        for (const key of ['五行', '阴阳', '时空', '因果', '生命']) {
            if (effect[key]) scaled[key] = Math.floor(effect[key] * lawMultiplier);
        }
        if (effect.淬炼值) scaled.淬炼值 = Math.floor(effect.淬炼值 * fireMultiplier);
        if (effect.暴击率) scaled.暴击率 = roundAttr(effect.暴击率 * Math.min(attrMultiplier, 1.8));
        if (effect.本命感应) scaled.本命感应 = Math.floor(effect.本命感应 * Math.min(fireMultiplier, 1.8));
        if (effect.契合度) scaled.契合度 = Math.floor(effect.契合度 * Math.min(attrMultiplier, 1.6));
        return scaled;
    }
    rollRefineEvent(equip) {
        const ember = Number(equip.淬炼余烬) || 0;
        if (ember >= 5) {
            return {
                key: "ember_burst",
                名称: "余烬爆燃",
                描述: "此前积累的淬炼余烬被重新点燃",
                attrMultiplier: 2.2,
                lawMultiplier: 1.6,
                fireMultiplier: 1.2,
                consumeEmber: 5
            };
        }
        const events = [
            { key: "normal", 名称: "稳火淬炼", 描述: "火候平稳，器身稳步强化", weight: 66, attrMultiplier: 1, lawMultiplier: 1, fireMultiplier: 1 },
            { key: "fine", 名称: "精炼成功", 描述: "灵纹顺势延展，本次淬炼更进一步", weight: 20, attrMultiplier: 1.5, lawMultiplier: 1.2, fireMultiplier: 1.1 },
            { key: "great", 名称: "淬炼大成", 描述: "器身鸣响，法则与属性同时暴涨", weight: 8, attrMultiplier: 2, lawMultiplier: 1.5, fireMultiplier: 1.25 },
            { key: "overload", 名称: "过载淬炼", 描述: "强行压入法则，收益极高但损耗耐久", weight: 4, attrMultiplier: 2.8, lawMultiplier: 2, fireMultiplier: 1.3, durabilityRate: 0.04, moodDelta: -2 },
            { key: "ember", 名称: "灵火余烬", 描述: "本次火候未完全成型，凝成下次突破的余烬", weight: 2, attrMultiplier: 0.45, lawMultiplier: 0.6, fireMultiplier: 0.55, addEmber: 1 }
        ];
        let roll = Math.random() * events.reduce((sum, item) => sum + item.weight, 0);
        for (const item of events) {
            if (roll < item.weight) return item;
            roll -= item.weight;
        }
        return events[0];
    }
    applyRefineEventState(equip, event) {
        if (equip.淬炼余烬 === undefined) equip.淬炼余烬 = 0;
        let emberDelta = 0;
        let durabilityLoss = 0;
        if (event.consumeEmber) {
            equip.淬炼余烬 = Math.max(0, equip.淬炼余烬 - event.consumeEmber);
            emberDelta -= event.consumeEmber;
        }
        if (event.addEmber) {
            equip.淬炼余烬 += event.addEmber;
            emberDelta += event.addEmber;
        }
        if (event.durabilityRate) {
            const maxDurability = parsePercent(equip.耐久上限) || 0;
            durabilityLoss = Math.max(1, Math.floor(maxDurability * event.durabilityRate));
            equip.耐久度 = Math.max(1, (parsePercent(equip.耐久度) || maxDurability || 1) - durabilityLoss);
        }
        return { emberDelta, durabilityLoss };
    }
    ensureUltimateEcho(equip) {
        if (!equip.终极强化残响 || typeof equip.终极强化残响 !== 'object') equip.终极强化残响 = {};
        return equip.终极强化残响;
    }
    rollUltimateEnhanceEvent(equip, cmdName) {
        const echo = this.ensureUltimateEcho(equip);
        if ((Number(echo[cmdName]) || 0) >= 4) {
            return {
                key: "echo",
                名称: "天工回响",
                描述: "此前失败留下的残响在本次成功时返照成印",
                attrMultiplier: 1.6,
                lawMultiplier: 1.45,
                consumeEcho: 4
            };
        }
        const events = [
            { key: "normal", 名称: "普通成印", 描述: "灵力稳定落入器身", weight: 70, attrMultiplier: 1, lawMultiplier: 1 },
            { key: "craft", 名称: "天工巧成", 描述: "强化纹路自然契合，本次收益提高", weight: 20, attrMultiplier: 1.35, lawMultiplier: 1.2 },
            { key: "resonance", 名称: "大道共振", 描述: "器身与法则短暂同频", weight: 8, attrMultiplier: 1.8, lawMultiplier: 1.6 },
            { key: "overload", 名称: "极限过载", 描述: "强行压入终极法则，收益最高但损耗耐久", weight: 2, attrMultiplier: 2.5, lawMultiplier: 2.1, durabilityRate: 0.05, moodDelta: -4 }
        ];
        let roll = Math.random() * events.reduce((sum, item) => sum + item.weight, 0);
        for (const item of events) {
            if (roll < item.weight) return item;
            roll -= item.weight;
        }
        return events[0];
    }
    applyUltimateEventState(equip, event, cmdName, success) {
        const echo = this.ensureUltimateEcho(equip);
        let echoDelta = 0;
        let durabilityLoss = 0;
        if (!success) {
            const oldEcho = Number(echo[cmdName]) || 0;
            echo[cmdName] = Math.min(oldEcho + 1, 4);
            echoDelta = echo[cmdName] - oldEcho;
            return { echoDelta, durabilityLoss };
        }
        if (event?.consumeEcho) {
            echo[cmdName] = Math.max(0, (Number(echo[cmdName]) || 0) - event.consumeEcho);
            echoDelta -= event.consumeEcho;
        }
        if (event?.durabilityRate) {
            const maxDurability = parsePercent(equip.耐久上限) || 0;
            durabilityLoss = Math.max(1, Math.floor(maxDurability * event.durabilityRate));
            equip.耐久度 = Math.max(1, (parsePercent(equip.耐久度) || maxDurability || 1) - durabilityLoss);
        }
        return { echoDelta, durabilityLoss };
    }
    applyUltimateExclusiveEffect(equip, module, cmdName, effect, event) {
        const messages = [];
        const isSpecial = event.key !== "normal";
        if (cmdName === "引雷淬火") {
            effect.五行 = (effect.五行 || 0) + Math.floor(900 * event.lawMultiplier);
            effect.时空 = (effect.时空 || 0) + Math.floor(700 * event.lawMultiplier);
            effect.暴击率 = roundAttr((effect.暴击率 || 0) + 0.001 * Math.min(event.attrMultiplier, 2));
            if (isSpecial) messages.push(`雷劫刻印：五行+${Math.floor(900 * event.lawMultiplier)} 时空+${Math.floor(700 * event.lawMultiplier)} 暴击+${roundAttr(0.001 * Math.min(event.attrMultiplier, 2))}`);
        } else if (cmdName === "玄铁精炼") {
            effect.阴阳 = (effect.阴阳 || 0) + Math.floor(1000 * event.lawMultiplier);
            effect.生命 = (effect.生命 || 0) + Math.floor(900 * event.lawMultiplier);
            if (isSpecial) {
                const oldLimit = parsePercent(equip.耐久上限) || 0;
                if (oldLimit) {
                    const addLimit = Math.max(1, Math.floor(oldLimit * (event.key === "overload" ? 0.01 : 0.004)));
                    equip.耐久上限 = oldLimit + addLimit;
                    equip.耐久度 = (parsePercent(equip.耐久度) || oldLimit) + addLimit;
                    messages.push(`玄甲归炉：耐久上限+${addLimit} 阴阳+${Math.floor(1000 * event.lawMultiplier)} 生命+${Math.floor(900 * event.lawMultiplier)}`);
                }
            }
        } else if (cmdName === "法则滋养") {
            const lawKeys = ['五行', '阴阳', '时空', '因果', '生命'];
            const key = lawKeys[Math.floor(Math.random() * lawKeys.length)];
            const bonus = Math.floor(((effect[key] || 1500) * 0.75 + 1800) * event.lawMultiplier);
            effect[key] = (effect[key] || 0) + bonus;
            effect.契合度 = (effect.契合度 || 0) + (isSpecial ? 2 : 1);
            if (isSpecial) messages.push(`法则同频：${key}+${bonus} 器灵契合+${isSpecial ? 2 : 1}`);
        }
        if (event.moodDelta) effect.心情 = (effect.心情 || 0) + event.moodDelta;
        return messages;
    }
    applySoulStageBonus(player, equip, module) {
        const config = this.getModuleConfig(module);
        const soul = this.getSoulProgress(equip, module);
        const lingti = equip[config.灵体名称];
        if (!equip.魂魄阶段加成) equip.魂魄阶段加成 = {};
        const mode = getModeName(equip);
        const lines = [];
        const addAttr = (label, percentGain, flatRate) => {
            const gain = mode === '绝对值'
                ? {
                    atk: Math.floor(getAttrValue(equip, 'atk') * flatRate.atk),
                    def: Math.floor(getAttrValue(equip, 'def') * flatRate.def),
                    HP: Math.floor(getAttrValue(equip, 'HP') * flatRate.HP)
                }
                : percentGain;
            equip.atk = roundAttr(getAttrValue(equip, 'atk') + gain.atk);
            equip.def = roundAttr(getAttrValue(equip, 'def') + gain.def);
            equip.HP = roundAttr(getAttrValue(equip, 'HP') + gain.HP);
            if (mode === '绝对值') {
                player.攻击 += gain.atk;
                player.防御 += gain.def;
                player.血量上限 += gain.HP;
            }
            lines.push(`${label}：攻+${gain.atk} 防+${gain.def} 血+${gain.HP}`);
        };
        const addLaw = (law) => {
            for (const [key, val] of Object.entries(law)) {
                equip[key] = (parsePercent(equip[key]) || 0) + val;
            }
        };
        if (soul.coreCount >= 3 && !equip.魂魄阶段加成.三魂成型) {
            addAttr(`${config.核心名称}成型`, { atk: 0.008, def: 0.004, HP: 0.005 }, { atk: 0.045, def: 0.025, HP: 0.03 });
            addLaw({ 五行: 3000, 时空: 2200, 因果: 1200 });
            equip.本命感应 = Math.min((Number(equip.本命感应) || 0) + 160, 1000);
            if (lingti) lingti.契合度 = Math.min((Number(lingti.契合度) || 0) + 45, 1000);
            equip.魂魄阶段加成.三魂成型 = Date.now();
        }
        if (soul.auxCount >= 4 && !equip.魂魄阶段加成.七魄过半) {
            addAttr(`${config.辅材名称}成轮`, { atk: 0.004, def: 0.008, HP: 0.01 }, { atk: 0.025, def: 0.045, HP: 0.055 });
            addLaw({ 阴阳: 2600, 生命: 3200 });
            const oldLimit = parsePercent(equip.耐久上限) || 0;
            if (oldLimit) {
                const newLimit = Math.floor(oldLimit * 1.05);
                equip.耐久上限 = newLimit;
                equip.耐久度 = (parsePercent(equip.耐久度) || oldLimit) + (newLimit - oldLimit);
                lines.push(`${config.辅材名称}护器：耐久上限${oldLimit}→${newLimit}`);
            }
            if (lingti) lingti.心情 = Math.min((Number(lingti.心情) || 50) + 12, 100);
            equip.魂魄阶段加成.七魄过半 = Date.now();
        }
        if (soul.auxCount >= 7 && !equip.魂魄阶段加成.七魄归位) {
            addAttr(`${config.辅材名称}归位`, { atk: 0.006, def: 0.006, HP: 0.012 }, { atk: 0.035, def: 0.035, HP: 0.06 });
            addLaw({ 阴阳: 4000, 因果: 2600, 生命: 4200 });
            if (lingti) lingti.契合度 = Math.min((Number(lingti.契合度) || 0) + 60, 1000);
            equip.魂魄阶段加成.七魄归位 = Date.now();
        }
        return lines;
    }
    refreshLingtiTalent(equip, module) {
        const config = this.getModuleConfig(module);
        const lingti = equip?.[config.灵体名称];
        if (!lingti) return null;
        const mats = [
            ...(Array.isArray(lingti[config.核心名称]) ? lingti[config.核心名称] : []),
            ...(Array.isArray(lingti[config.辅材名称]) ? lingti[config.辅材名称] : [])
        ];
        if (!mats.length) return null;
        const score = { spacetime: 0, causality: 0, guard: 0, flame: 0, origin: 0 };
        for (const mat of mats) {
            if (["九霄灵髓", "鲲鹏绒羽"].includes(mat)) score.spacetime += 2;
            if (["幽冥月露", "饕餮骨玉"].includes(mat)) score.causality += 2;
            if (["玄武铁鳞", "麒麟角粉", "建木心屑"].includes(mat)) score.guard += 2;
            if (["凤凰火羽", "天狼牙砂"].includes(mat)) score.flame += 2;
            if (["太初魂晶", "建木心屑"].includes(mat)) score.origin += 1;
        }
        const type = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
        const talentMap = {
            spacetime: { 名称: "时空先手", 类型: "spacetime", 描述: "速度与法则先手更强" },
            causality: { 名称: "因果逆命", 类型: "causality", 描述: "因果续命与反击更强" },
            guard: { 名称: "玄甲生息", 类型: "guard", 描述: "护持与回复更强" },
            flame: { 名称: "炎羽追击", 类型: "flame", 描述: "暴击与追击伤害更强" },
            origin: { 名称: "五行归元", 类型: "origin", 描述: "三维基础战力更均衡" }
        };
        lingti.天赋 = talentMap[type] || talentMap.origin;
        return lingti.天赋;
    }
    applyAttrGrowth(equip, module, effect, percentExtraMultiplier = 1) {
        const absoluteMode = isAbsoluteEquipment(equip);
        const bias = this.getModuleGrowthBias(module);
        const soulMultiplier = this.getSoulPowerMultiplier(equip, module);
        const flatGain = {
            atk: Math.floor((effect.攻击加成 || 0) * bias.atk * soulMultiplier),
            def: Math.floor((effect.防御加成 || 0) * bias.def * soulMultiplier),
            HP: Math.floor((effect.血量加成 || 0) * bias.HP * soulMultiplier)
        };
        const rate = effect.百分比加成 || { atk: 0.003, def: 0.003, HP: 0.003 };
        const percentGain = {
            atk: roundAttr((rate.atk || 0) * bias.atk * 百分比装备成长倍率 * percentExtraMultiplier * soulMultiplier),
            def: roundAttr((rate.def || 0) * bias.def * 百分比装备成长倍率 * percentExtraMultiplier * soulMultiplier),
            HP: roundAttr((rate.HP || 0) * bias.HP * 百分比装备成长倍率 * percentExtraMultiplier * soulMultiplier)
        };
        const gain = absoluteMode ? flatGain : percentGain;
        equip.atk = roundAttr(getAttrValue(equip, 'atk') + gain.atk);
        equip.def = roundAttr(getAttrValue(equip, 'def') + gain.def);
        equip.HP = roundAttr(getAttrValue(equip, 'HP') + gain.HP);
        return { mode: absoluteMode ? '绝对值' : '百分比', gain };
    }
    getEmbedMeta(module, kind) {
        const config = this.getModuleConfig(module);
        const isCore = kind === 'core';
        return {
            field: this.getModuleField(module),
            lingtiName: config.灵体名称,
            slotName: isCore ? config.核心名称 : config.辅材名称,
            materials: isCore ? 核心材料 : 辅材材料,
            limit: isCore ? 3 : 7,
            kindName: isCore ? config.核心名称 : config.辅材名称
        };
    }
    getEmbedPriority(module, kind) {
        const priority = {
            武器: {
                core: ["九霄灵髓", "太初魂晶", "幽冥月露"],
                aux: ["饕餮骨玉", "鲲鹏绒羽", "凤凰火羽", "天狼牙砂", "麒麟角粉", "玄武铁鳞", "建木心屑"]
            },
            护具: {
                core: ["幽冥月露", "太初魂晶", "九霄灵髓"],
                aux: ["玄武铁鳞", "麒麟角粉", "建木心屑", "天狼牙砂", "凤凰火羽", "饕餮骨玉", "鲲鹏绒羽"]
            },
            法宝: {
                core: ["太初魂晶", "幽冥月露", "九霄灵髓"],
                aux: ["建木心屑", "凤凰火羽", "鲲鹏绒羽", "玄武铁鳞", "饕餮骨玉", "麒麟角粉", "天狼牙砂"]
            }
        };
        return priority[module]?.[kind] || Object.keys(kind === 'core' ? 核心材料 : 辅材材料);
    }
    getSoulLawBonus(matType) {
        return {
            太初魂晶: { 五行: 5000, 生命: 3000 },
            九霄灵髓: { 五行: 2500, 时空: 4500 },
            幽冥月露: { 阴阳: 3500, 因果: 3500, 生命: 1500 },
            天狼牙砂: { 阴阳: 1800, 因果: 1200 },
            玄武铁鳞: { 阴阳: 2400, 生命: 2200 },
            凤凰火羽: { 五行: 2200, 生命: 2000 },
            饕餮骨玉: { 因果: 2600, 五行: 1200 },
            麒麟角粉: { 生命: 2400, 阴阳: 1600 },
            建木心屑: { 生命: 2600, 五行: 1400 },
            鲲鹏绒羽: { 时空: 2600, 五行: 1200 }
        }[matType] || {};
    }
    applySoulMaterialToEquipment(equip, module, material, matType, kind) {
        const absoluteMode = isAbsoluteEquipment(equip);
        const bias = this.getModuleGrowthBias(module);
        const soulMultiplier = 1 + this.getSoulProgress(equip, module).rate * 0.25;
        const scale = kind === 'core' ? 0.45 : 0.24;
        const divisor = kind === 'core' ? 3e11 : 5e11;
        const flatGain = {
            atk: Math.floor((material.攻击 || 0) * bias.atk * scale * soulMultiplier),
            def: Math.floor((material.防御 || 0) * bias.def * scale * soulMultiplier),
            HP: Math.floor((material.血量 || 0) * bias.HP * scale * soulMultiplier)
        };
        const percentGain = {
            atk: roundAttr(((material.攻击 || 0) / divisor) * bias.atk * 百分比装备镶嵌倍率 * soulMultiplier),
            def: roundAttr(((material.防御 || 0) / divisor) * bias.def * 百分比装备镶嵌倍率 * soulMultiplier),
            HP: roundAttr(((material.血量 || 0) / divisor) * bias.HP * 百分比装备镶嵌倍率 * soulMultiplier)
        };
        const gain = absoluteMode ? flatGain : percentGain;
        equip.atk = roundAttr(getAttrValue(equip, 'atk') + gain.atk);
        equip.def = roundAttr(getAttrValue(equip, 'def') + gain.def);
        equip.HP = roundAttr(getAttrValue(equip, 'HP') + gain.HP);
        if (material.暴击率) equip.bao = roundAttr((parsePercent(equip.bao) || 0) + material.暴击率 * (kind === 'core' ? 0.35 : 0.2));
        const law = this.getSoulLawBonus(matType);
        for (const key of ['五行', '阴阳', '时空', '因果', '生命']) {
            if (law[key]) equip[key] = (parsePercent(equip[key]) || 0) + Math.floor(law[key] * soulMultiplier);
        }
        return { mode: absoluteMode ? '绝对值' : '百分比', gain, law };
    }
    async applyEmbedding(usr_qq, player, equipment, module, matType, kind) {
        const meta = this.getEmbedMeta(module, kind);
        const equip = equipment[meta.field];
        if (!equip || !isNotNull(equip.等级)) return { ok: false, msg: `你还没有本命${module}` };
        this.ensureBenmingState(equip, module);
        const material = meta.materials[matType];
        if (!material) return { ok: false, msg: `不存在该${meta.kindName}材料【${matType}】` };
        const slots = equip[meta.lingtiName][meta.slotName];
        if (slots.length >= meta.limit) return { ok: false, msg: `${module}${meta.kindName}已满` };
        if (material.唯一 && slots.includes(matType)) return { ok: false, msg: `【${matType}】已镶嵌过` };
        if (!await exist_najie_thing(usr_qq, matType, "道具")) return { ok: false, msg: `缺少【${matType}】` };

        const lingti = equip[meta.lingtiName];
        lingti.攻击属性加成 = parsePercent(lingti.攻击属性加成) + (material.攻击 || 0);
        lingti.防御属性加成 = parsePercent(lingti.防御属性加成) + (material.防御 || 0);
        lingti.血量属性加成 = parsePercent(lingti.血量属性加成) + (material.血量 || 0);
        const imprint = this.applySoulMaterialToEquipment(equip, module, material, matType, kind);
        if (imprint.mode === '绝对值') {
            player.攻击 += imprint.gain.atk;
            player.防御 += imprint.gain.def;
            player.血量上限 += imprint.gain.HP;
        }
        player.攻击 += material.攻击 || 0;
        player.防御 += material.防御 || 0;
        player.血量上限 += material.血量 || 0;
        if (material.暴击率) player.暴击率 = (parsePercent(player.暴击率) || 0) + material.暴击率;
        slots.push(matType);
        const soul = this.getSoulProgress(equip, module);
        const stageBonuses = this.applySoulStageBonus(player, equip, module);
        const talent = this.refreshLingtiTalent(equip, module);
        const completionBonus = this.applySoulCompletionBonus(player, equip, module);
        await Add_najie_thing(usr_qq, matType, "道具", -1);
        const detail = [
            `本体${imprint.mode}烙印：攻+${imprint.gain.atk} 防+${imprint.gain.def} 血+${imprint.gain.HP}`,
            `魂魄进度：${soul.label}`,
            `魂魄增幅：强化成长x${this.getSoulPowerMultiplier(equip, module)} 共鸣x${this.getSoulResonanceMultiplier(equip, module)}`,
            stageBonuses.length ? `阶段奖励：${stageBonuses.join("；")}` : '',
            talent ? `器灵天赋：${talent.名称}（${talent.描述}）` : '',
            completionBonus ? completionBonus.msg : ''
        ].filter(Boolean).join("\n");
        return {
            ok: true,
            msg: `${module}${meta.kindName}镶嵌【${matType}】`,
            detail,
            progress: `${slots.length}/${meta.limit}`
        };
    }
    // ========== 1. 炼化方法（三大模块对称） ==========
    async 炼化武器(e) {
        await this.通用炼化(e, '武器');
    }
    async 炼化护具(e) {
        await this.通用炼化(e, '护具');
    }
    async 炼化法宝(e) {
        await this.通用炼化(e, '法宝');
    }
    async 通用炼化(e, module) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;
        const player = await Read_player(usr_qq);
        const equipment = await Read_equipment(usr_qq);
        const config = this.getModuleConfig(module);
        const field = this.getModuleField(module);
        if (!equipment[field]) {
            equipment[field] = { name: `无名本命${module}`, type: module, bao: 0, pinji: 0 };
        }
        this.ensureBenmingState(equipment[field], module);
        if (equipment[field].等级) {
            return e.reply(`你已拥有本命${module}，无需重复炼化`);
        }

        const 判定 = this.计算本命炼化判定(player, equipment[field], module);
        if (判定.guaranteed || Math.random() <= 判定.chance) {
            const 初始等级 = config.等级体系[1];
            equipment[field].等级 = 初始等级;
            equipment[field].炼化可能 = 1;
            equipment[field].本命感应 = Math.max(Number(equipment[field].本命感应) || 0, 1000);
            equipment[field].本命判定 = {
                成功率: Math.round(判定.chance * 100),
                模式: getModeName(equipment[field]),
                时间: Date.now()
            };
            await Write_equipment(usr_qq, equipment);
            return e.reply([
                `这件${module}终于与你本命相连！`,
                `本命等级：${初始等级}`,
                `装备判定：${getModeName(equipment[field])}模式`,
                `炼化判定：${判定.detail}`,
                `本命感应：${equipment[field].本命感应}/1000`
            ].join('\n'));
        }

        equipment[field].炼化次数 = (Number(equipment[field].炼化次数) || 0) + 1;
        equipment[field].炼化可能 = 0;
        equipment[field].本命感应 = Math.min((Number(equipment[field].本命感应) || 0) + 判定.senseGain, 1000);
        await Write_equipment(usr_qq, equipment);
        return e.reply([
            `这件${module}尚未完全认主，但已留下本命感应。`,
            `本次成功率：${Math.round(判定.chance * 100)}%`,
            `炼化判定：${判定.detail}`,
            `本命感应：${equipment[field].本命感应}/1000`,
            `感应满1000后下次炼化必成`
        ].join('\n'));
    }
    // ========== 2. 修复/温养方法（三大模块对称） ==========
    async 修复武器(e) {
        await this.通用修复温养(e, '武器', '修复爱剑', '修复');
    }
    async 修复护具(e) {
        await this.通用修复温养(e, '护具', '修复护具', '修复');
    }
    async 温养法宝(e) {
        await this.通用修复温养(e, '法宝', '温养法宝', '温养');
    }
    async 通用修复温养(e, module, cmdKey, type) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        const matType = e.msg.replace("#", "").replace(cmdKey, "").trim();
        if (!await existplayer(usr_qq)) return;
        const equipment = await Read_equipment(usr_qq);
        const config = this.getModuleConfig(module);
        const field = this.getModuleField(module);

        if (!isNotNull(equipment[field]?.等级)) return e.reply(`无可用${type}的本命${module}`);
        if (!修复温养材料[matType]) return e.reply(`无此${type}材料`);
        if (!await exist_najie_thing(usr_qq, matType, "道具")) return e.reply(`缺少【${matType}】`);

        this.ensureBenmingState(equipment[field], module);
        const effect = 修复温养材料[matType];
        equipment[field].耐久度 = parsePercent(equipment[field].耐久度) || config.初始属性.耐久度;
        equipment[field].耐久上限 = parsePercent(equipment[field].耐久上限) || config.初始属性.耐久上限;
        const 修复值 = effect.修复值;
        if (effect.耐久上限率) {
            equipment[field].耐久上限 = Math.floor(equipment[field].耐久上限 * (1 + effect.耐久上限率));
        }
        equipment[field].耐久度 = Math.min(equipment[field].耐久度 + 修复值, equipment[field].耐久上限);
        const 耐久百分比 = Math.round((equipment[field].耐久度 / equipment[field].耐久上限) * 100) + "%";
        if (effect.淬炼值) equipment[field].淬炼值 = (parsePercent(equipment[field].淬炼值) || 0) + effect.淬炼值;
        if (effect.时空) equipment[field].时空 = (parsePercent(equipment[field].时空) || 0) + effect.时空;
        if (effect.因果) equipment[field].因果 = (parsePercent(equipment[field].因果) || 0) + effect.因果;
        const mode = getModeName(equipment[field]);
        const attrMsg = [];
        if (effect.攻击淬火) {
            if (isAbsoluteEquipment(equipment[field])) {
                const add = Math.floor(getAttrValue(equipment[field], 'atk') * effect.攻击淬火);
                equipment[field].atk = getAttrValue(equipment[field], 'atk') + add;
                attrMsg.push(`攻+${add}`);
            } else {
                equipment[field].atk = roundAttr(getAttrValue(equipment[field], 'atk') + effect.攻击淬火);
                attrMsg.push(`攻倍率+${effect.攻击淬火}`);
            }
        }
        if (effect.防御护持) {
            if (isAbsoluteEquipment(equipment[field])) {
                const add = Math.floor(getAttrValue(equipment[field], 'def') * effect.防御护持);
                equipment[field].def = getAttrValue(equipment[field], 'def') + add;
                attrMsg.push(`防+${add}`);
            } else {
                equipment[field].def = roundAttr(getAttrValue(equipment[field], 'def') + effect.防御护持);
                attrMsg.push(`防倍率+${effect.防御护持}`);
            }
        }
        if (effect.生命护持) {
            if (isAbsoluteEquipment(equipment[field])) {
                const add = Math.floor(getAttrValue(equipment[field], 'HP') * effect.生命护持);
                equipment[field].HP = getAttrValue(equipment[field], 'HP') + add;
                attrMsg.push(`血+${add}`);
            } else {
                equipment[field].HP = roundAttr(getAttrValue(equipment[field], 'HP') + effect.生命护持);
                attrMsg.push(`血倍率+${effect.生命护持}`);
            }
        }
        const nurture = this.applyLingtiNurture(equipment[field], module, effect);

        await Add_najie_thing(usr_qq, matType, "道具", -1);
        await Write_equipment(usr_qq, equipment);
        await e.reply([
            `✅ ${type}成功！消耗【${matType}】`,
            `材料效果：${effect.描述}`,
            `装备判定：${mode}模式`,
            `当前耐久：${耐久百分比}`,
            attrMsg.length ? `额外属性：${attrMsg.join(' ')}` : '',
            effect.淬炼值 ? `淬炼值+${effect.淬炼值}` : '',
            effect.时空 || effect.因果 ? `法则：时空+${effect.时空 || 0} 因果+${effect.因果 || 0}` : '',
            nurture.契合度 || nurture.心情 ? `器灵：契合+${nurture.契合度} 心情+${nurture.心情}` : ''
        ].filter(Boolean).join('\n'));
    }
    // ========== 3. 淬炼方法（三大模块对称，兼容百分比） ==========
    async 淬炼武器(e) {
        await this.通用淬炼(e, '武器', '淬炼剑身');
    }
    async 淬炼护具(e) {
        await this.通用淬炼(e, '护具', '淬炼护具');
    }
    async 淬炼法宝(e) {
        await this.通用淬炼(e, '法宝', '淬炼法宝');
    }
    // 通用淬炼方法：按整件装备的特殊判定模式成长，避免百分比装被洗成绝对值装。
async 通用淬炼(e, module, cmdKey) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const msg = e.msg.trim();

    const regMatch = msg.match(`^#${cmdKey}\\s*(.*?)\\s*(\\*(\\d+))?$`);
    if (!regMatch) return e.reply(`❌ 指令格式错误，请输入 #${cmdKey} 材料名 或 #${cmdKey} 材料名*N`);

    const matType = regMatch[1].trim();
    let 次数 = regMatch[3] ? parseInt(regMatch[3]) : 1;
    次数 = Math.min(次数, 10);
    if (次数 < 1) 次数 = 1;

    if (!淬炼材料[matType]) return e.reply(`不存在该淬炼材料【${matType}】`);
    if (!await existplayer(usr_qq)) return;
    const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
    const config = this.getModuleConfig(module);
    const field = this.getModuleField(module);

    if (!isNotNull(equipment[field]?.等级)) return e.reply(`你还没有本命${module}`);
    if (equipment[field].等级 === config.等级体系[0]) return e.reply(`请先完成${module}炼化`);
    this.ensureBenmingState(equipment[field], module);

    const 现有材料数量 = await exist_najie_thing(usr_qq, matType, "道具", true);
    if (现有材料数量 < 次数) {
        return e.reply(`缺少【${matType}】x${次数 - 现有材料数量}（当前${现有材料数量}个，需${次数}个）`);
    }

    let 成功次数 = 0;
    let 跳过次数 = 0;
    let 实际消耗 = 0;
    let 总淬炼值提升 = 0;
    let 总攻击提升 = 0;
    let 总防御提升 = 0;
    let 总血量提升 = 0;
    let 总暴击提升 = 0;
    let 总本命感应 = 0;
    let 总耐久损耗 = 0;
    let 总余烬变化 = 0;
    const 事件统计 = {};
    const 淬炼效果 = 淬炼材料[matType];
    const modeBefore = getModeName(equipment[field]);
    if (equipment[field].淬炼余烬 === undefined) equipment[field].淬炼余烬 = 0;

    for (let i = 0; i < 次数; i++) {
        const 当前等级 = equipment[field].等级;
        const 下一等级 = this.getNextLevel(module, 当前等级);
        const 当前淬炼上限 = 下一等级 !== 当前等级
            ? this.getRequiredFireSpirit(module, 下一等级)
            : this.getRequiredFireSpirit(module, 当前等级);

        equipment[field].淬炼值 = parsePercent(equipment[field].淬炼值) || 0;
        if (equipment[field].淬炼值 >= 当前淬炼上限) {
            跳过次数 = 次数 - i;
            break;
        }

        const 淬炼事件 = this.rollRefineEvent(equipment[field]);
        const eventState = this.applyRefineEventState(equipment[field], 淬炼事件);
        const eventEffect = this.scaleGrowthEffect(淬炼效果, 淬炼事件.attrMultiplier, 淬炼事件.lawMultiplier, 淬炼事件.fireMultiplier);
        if (淬炼事件.moodDelta) eventEffect.心情 = (eventEffect.心情 || 0) + 淬炼事件.moodDelta;
        事件统计[淬炼事件.名称] = (事件统计[淬炼事件.名称] || 0) + 1;
        总耐久损耗 += eventState.durabilityLoss;
        总余烬变化 += eventState.emberDelta;

        const growth = this.applyAttrGrowth(equipment[field], module, eventEffect, 百分比装备淬炼成长倍率);
        if (growth.mode === '绝对值') {
            player.攻击 += growth.gain.atk;
            player.防御 += growth.gain.def;
            player.血量上限 += growth.gain.HP;
        }

        equipment[field].五行 = (parsePercent(equipment[field].五行) || 0) + (eventEffect.五行 || 0);
        equipment[field].阴阳 = (parsePercent(equipment[field].阴阳) || 0) + (eventEffect.阴阳 || 0);
        equipment[field].时空 = (parsePercent(equipment[field].时空) || 0) + (eventEffect.时空 || 0);
        equipment[field].因果 = (parsePercent(equipment[field].因果) || 0) + (eventEffect.因果 || 0);
        equipment[field].生命 = (parsePercent(equipment[field].生命) || 0) + (eventEffect.生命 || 0);
        if (eventEffect.暴击率) {
            equipment[field].bao = roundAttr((parsePercent(equipment[field].bao) || 0) + eventEffect.暴击率);
            player.暴击率 = (parsePercent(player.暴击率) || 0) + eventEffect.暴击率;
            总暴击提升 += eventEffect.暴击率;
        }
        if (eventEffect.本命感应) {
            equipment[field].本命感应 = Math.min((Number(equipment[field].本命感应) || 0) + eventEffect.本命感应, 1000);
            总本命感应 += eventEffect.本命感应;
        }

        this.applyLingtiNurture(equipment[field], module, eventEffect);
        const 本次淬炼提升 = Math.min(eventEffect.淬炼值 || 0, 当前淬炼上限 - equipment[field].淬炼值);
        equipment[field].淬炼值 += 本次淬炼提升;

        成功次数++;
        实际消耗++;
        总淬炼值提升 += 本次淬炼提升;
        总攻击提升 += growth.gain.atk;
        总防御提升 += growth.gain.def;
        总血量提升 += growth.gain.HP;
    }

    if (实际消耗 > 0) {
        await Add_najie_thing(usr_qq, matType, "道具", -实际消耗);
    }
    await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);

    const 当前等级 = equipment[field].等级;
    const 下一等级 = this.getNextLevel(module, 当前等级);
    const 当前淬炼上限 = 下一等级 !== 当前等级
        ? this.getRequiredFireSpirit(module, 下一等级)
        : this.getRequiredFireSpirit(module, 当前等级);
    const 上限提示 = equipment[field].淬炼值 >= 当前淬炼上限
        ? `已达${当前等级}淬炼上限，可执行 #升华本命${module} 解锁更高上限`
        : `剩余淬炼空间：${当前淬炼上限 - equipment[field].淬炼值}`;
    const attrLabel = modeBefore === '绝对值' ? '属性' : '倍率';

    await e.reply([
        `✅ 淬炼${matType}${module}x${次数} 完成！`,
        `材料定位：${淬炼效果.描述}`,
        `装备判定：${modeBefore}模式`,
        `魂魄增幅：强化成长x${this.getSoulPowerMultiplier(equipment[field], module)}`,
        modeBefore === '百分比' ? `百分比淬炼额外倍率：x${百分比装备淬炼成长倍率}` : '',
        `淬炼异象：${Object.entries(事件统计).map(([name, count]) => `${name}x${count}`).join(' ')}`,
        总余烬变化 ? `淬炼余烬：${总余烬变化 > 0 ? '+' : ''}${总余烬变化}（当前${equipment[field].淬炼余烬}/5）` : `淬炼余烬：${equipment[field].淬炼余烬}/5`,
        总耐久损耗 ? `过载损耗：耐久-${总耐久损耗}` : '',
        `消耗：【${matType}】x${实际消耗}${跳过次数 ? `（到达上限，跳过${跳过次数}次未消耗）` : ''}`,
        `结果：成功${成功次数}次`,
        `淬炼值+${总淬炼值提升}（当前：${equipment[field].淬炼值}/${当前淬炼上限}）`,
        `${attrLabel}提升：攻+${roundAttr(总攻击提升)} | 防+${roundAttr(总防御提升)} | 血+${roundAttr(总血量提升)}`,
        总暴击提升 ? `暴击+${roundAttr(总暴击提升)}` : '',
        总本命感应 ? `本命感应+${总本命感应}` : '',
        上限提示
    ].filter(Boolean).join("\n"));
}

// 优化法则属性转化方法（补充容错，避免模块错误导致NaN）
convertElementToAttributes(module, elements) {
    // 强制模块容错，默认使用武器倍率
    const 转化倍率表 = {
        武器: { 五行: 10000, 阴阳: 80000, 时空: 90000, 因果: 20000, 生命: 70000 },
        护具: { 五行: 80000, 阴阳: 10000, 时空: 20000, 因果: 70000, 生命: 90000 },
        法宝: { 五行: 70000, 阴阳: 80000, 时空: 90000, 因果: 10000, 生命: 20000 }
    };
    const 转化倍率 = 转化倍率表[module] || 转化倍率表.武器;

    // 强制元素值为数字，避免NaN
    const 五行 = elements.五行 || 0;
    const 阴阳 = elements.阴阳 || 0;
    const 时空 = elements.时空 || 0;
    const 因果 = elements.因果 || 0;
    const 生命 = elements.生命 || 0;

    // 重新计算（确保所有参与运算的是数字）
    const 转化攻击 = Math.floor(五行 * 转化倍率.五行 + 时空 * 转化倍率.时空 * 0.6 + 因果 * 转化倍率.因果 * 0.5);
    const 转化防御 = Math.floor(阴阳 * 转化倍率.阴阳 + 时空 * 转化倍率.时空 * 0.4 + 因果 * 转化倍率.因果 * 0.3);
    const 转化血量 = Math.floor(生命 * 转化倍率.生命 + 因果 * 转化倍率.因果 * 0.2);

    return { 转化攻击, 转化防御, 转化血量 };
}
    // ========== 4. 升华方法（三大模块对称，兼容百分比） ==========
    async 升华武器(e) {
        await this.通用升华(e, '武器');
    }
    async 升华护具(e) {
        await this.通用升华(e, '护具');
    }
    async 升华法宝(e) {
        await this.通用升华(e, '法宝');
    }
    async 通用升华(e, module) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        try {
            const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
            const config = this.getModuleConfig(module);
            const field = this.getModuleField(module);

            // 现在module已正确传递（武器/护具/法宝），不会出现undefined
            if (!equipment[field] || !isNotNull(equipment[field]?.等级)) {
                return e.reply(`你还没有本命${module}`);
            }
            this.ensureBenmingState(equipment[field], module);
            const stageBonuses = this.applySoulStageBonus(player, equipment[field], module);
            const talent = this.refreshLingtiTalent(equipment[field], module);
            const completionBonus = this.applySoulCompletionBonus(player, equipment[field], module);
            const 当前等级 = equipment[field].等级;
            const 下一等级 = this.getNextLevel(module, 当前等级);
            if (下一等级 === 当前等级) {
                return this.reply(`🏆 您的${module}已是【${当前等级}】（最高等级），淬炼上限固定为${this.getRequiredFireSpirit(module, 当前等级)}，无需再升华`);
            }
            const gateMsg = this.getFinalRealmGateMessage(module, equipment[field], 下一等级);
            if (gateMsg) return this.reply(gateMsg);

            const 所需淬炼值 = this.getRequiredFireSpirit(module, 下一等级);
            if (equipment[field].淬炼值 < 所需淬炼值) {
                return this.reply([
                    "❌ 升华条件不足",
                    `当前等级: ${当前等级}`,
                    `下一等级: ${下一等级}`,
                    `需要淬炼值: ${所需淬炼值}`,
                    `当前淬炼值: ${equipment[field].淬炼值 || 0}`,
                    `提示：需淬炼至当前等级上限才能升华`
                ].join("\n"));
            }

            const modeBefore = getModeName(equipment[field]);
            equipment[field].等级 = 下一等级;
            const 旧耐久上限 = parsePercent(equipment[field].耐久上限) || config.初始属性.耐久上限;
            equipment[field].耐久上限 = this.getDurabilityUpperLimit(module, 下一等级);
            equipment[field].耐久度 = Math.floor((parsePercent(equipment[field].耐久度) || config.初始属性.耐久度) * (equipment[field].耐久上限 / 旧耐久上限));
            
            const oldAtk = equipment[field].atk === undefined ? config.初始属性.atk : parsePercent(equipment[field].atk);
            const oldDef = equipment[field].def === undefined ? config.初始属性.def : parsePercent(equipment[field].def);
            const oldHp = equipment[field].HP === undefined ? config.初始属性.HP : parsePercent(equipment[field].HP);
            const 加成倍数 = this.getUpgradeMultiplier(module, 当前等级);
            
            const 法则属性 = { 五行: parsePercent(equipment[field].五行) || 0, 阴阳: parsePercent(equipment[field].阴阳) || 0, 时空: parsePercent(equipment[field].时空) || 0, 因果: parsePercent(equipment[field].因果) || 0, 生命: parsePercent(equipment[field].生命) || 0 };
            const { 转化攻击, 转化防御, 转化血量 } = this.convertElementToAttributes(module, 法则属性);

            let atkDiff = 0;
            let defDiff = 0;
            let hpDiff = 0;
            if (modeBefore === '绝对值') {
                equipment[field].atk = Math.floor(oldAtk * 加成倍数.攻击 + 转化攻击);
                equipment[field].def = Math.floor(oldDef * 加成倍数.防御 + 转化防御);
                equipment[field].HP = Math.floor(oldHp * 加成倍数.生命 + 转化血量);
                atkDiff = Math.max(0, equipment[field].atk - oldAtk);
                defDiff = Math.max(0, equipment[field].def - oldDef);
                hpDiff = Math.max(0, equipment[field].HP - oldHp);
                player.攻击 += atkDiff;
                player.防御 += defDiff;
                player.血量上限 += hpDiff;
            } else {
                const 百分比升华倍数 = this.getPercentUpgradeMultiplier(加成倍数);
                const 法则倍率攻击 = 转化攻击 / 百分比装备升华法则除数;
                const 法则倍率防御 = 转化防御 / 百分比装备升华法则除数;
                const 法则倍率血量 = 转化血量 / 百分比装备升华法则除数;
                equipment[field].atk = roundAttr(oldAtk * 百分比升华倍数.攻击 + 法则倍率攻击);
                equipment[field].def = roundAttr(oldDef * 百分比升华倍数.防御 + 法则倍率防御);
                equipment[field].HP = roundAttr(oldHp * 百分比升华倍数.生命 + 法则倍率血量);
                atkDiff = roundAttr(Math.max(0, equipment[field].atk - oldAtk));
                defDiff = roundAttr(Math.max(0, equipment[field].def - oldDef));
                hpDiff = roundAttr(Math.max(0, equipment[field].HP - oldHp));
            }

            // 重置终极强化成功率计数器
            equipment[field].成功强化次数 = 0;

            const 新淬炼上限 = this.getRequiredFireSpirit(module, this.getNextLevel(module, 下一等级)) || this.getRequiredFireSpirit(module, 下一等级);
            await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);

            // 精简反馈（module已正确显示）
            await e.reply([
                `🎉 升华成功！${当前等级}→${下一等级}`,
                `装备判定：${modeBefore}模式`,
                stageBonuses.length ? `阶段奖励：${stageBonuses.join("；")}` : '',
                talent ? `器灵天赋：${talent.名称}（${talent.描述}）` : '',
                completionBonus ? completionBonus.msg : '',
                `魂魄增幅：强化成长x${this.getSoulPowerMultiplier(equipment[field], module)}`,
                modeBefore === '百分比' ? `百分比升华折算：原升华倍率超出部分x${百分比装备升华倍率折算}` : '',
                `属性提升：攻+${atkDiff} 防+${defDiff} 血+${hpDiff}`,
                `耐久上限：${旧耐久上限}→${equipment[field].耐久上限}`,
                `新淬炼上限：${新淬炼上限}`
            ].filter(Boolean).join("\n"));
        } catch (err) {
            console.error(`${module}升华出错：`, err);
            await e.reply(`🎉 升华成功！等级已突破\n⚠️  部分属性明细可通过#查看${module}确认`);
        }
    }
    // ========== 5. 核心镶嵌方法（三大模块对称，兼容百分比） ==========
    async 镶嵌武器核心(e) {
        await this.通用核心镶嵌(e, '武器', '剑魂镶嵌');
    }
    async 镶嵌护具核心(e) {
        await this.通用核心镶嵌(e, '护具', '护灵核心镶嵌');
    }
    async 镶嵌法宝灵韵(e) {
        await this.通用核心镶嵌(e, '法宝', '宝灵灵韵镶嵌');
    }
    async 通用核心镶嵌(e, module, cmdKey) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        const matType = e.msg.replace(`#${cmdKey}`, "").trim();
        if (!await existplayer(usr_qq)) return;
        const player = await Read_player(usr_qq);
        const equipment = await Read_equipment(usr_qq);
        const result = await this.applyEmbedding(usr_qq, player, equipment, module, matType, 'core');
        if (!result.ok) return e.reply(result.msg);
        await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);
        await this.reply([
            `成功${result.msg}`,
            result.detail,
            `进度：${result.progress}`
        ].join("\n"));
    }
    // ========== 6. 辅材镶嵌方法（三大模块对称，兼容百分比） ==========
    async 镶嵌武器辅材(e) {
        await this.通用辅材镶嵌(e, '武器', '剑魄镶嵌');
    }
    async 镶嵌护具辅材(e) {
        await this.通用辅材镶嵌(e, '护具', '护灵辅魂镶嵌');
    }
    async 镶嵌法宝辅材(e) {
        await this.通用辅材镶嵌(e, '法宝', '宝灵灵纹镶嵌');
    }
    async 通用辅材镶嵌(e, module, cmdKey) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        const matType = e.msg.replace(`#${cmdKey}`, "").trim();
        if (!await existplayer(usr_qq)) return;
        const player = await Read_player(usr_qq);
        const equipment = await Read_equipment(usr_qq);
        const result = await this.applyEmbedding(usr_qq, player, equipment, module, matType, 'aux');
        if (!result.ok) return e.reply(result.msg);
        await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);
        await this.reply([
            `成功${result.msg}`,
            result.detail,
            `进度：${result.progress}`
        ].join("\n"));
    }

    async 一键镶嵌(e) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;
        const key = e.msg.match(/^#一键(.+)镶嵌$/)?.[1];
        const targetMap = {
            本命: [
                ['武器', 'core'], ['武器', 'aux'],
                ['护具', 'core'], ['护具', 'aux'],
                ['法宝', 'core'], ['法宝', 'aux']
            ],
            本命武器: [['武器', 'core'], ['武器', 'aux']],
            本命护具: [['护具', 'core'], ['护具', 'aux']],
            本命法宝: [['法宝', 'core'], ['法宝', 'aux']],
            剑魂: [['武器', 'core']],
            剑魄: [['武器', 'aux']],
            护灵核心: [['护具', 'core']],
            护灵辅魂: [['护具', 'aux']],
            宝灵灵韵: [['法宝', 'core']],
            宝灵灵纹: [['法宝', 'aux']]
        };
        const targets = targetMap[key];
        if (!targets) return e.reply('一键镶嵌目标异常');

        const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
        const lines = [];
        let count = 0;
        for (const [module, kind] of targets) {
            const meta = this.getEmbedMeta(module, kind);
            if (!equipment[meta.field] || !isNotNull(equipment[meta.field].等级)) {
                lines.push(`${module}${meta.kindName}: 未拥有本命${module}`);
                continue;
            }
            this.ensureBenmingState(equipment[meta.field], module);
            const slots = equipment[meta.field][meta.lingtiName][meta.slotName];
            if (slots.length >= meta.limit) {
                lines.push(`${module}${meta.kindName}: 已满 ${slots.length}/${meta.limit}`);
                continue;
            }
            for (const matType of this.getEmbedPriority(module, kind)) {
                if (slots.length >= meta.limit) break;
                const result = await this.applyEmbedding(usr_qq, player, equipment, module, matType, kind);
                if (result.ok) {
                    count++;
                    lines.push(`${result.msg}，${result.progress}${result.detail.includes("魂魄圆满") ? "，魂魄圆满终境解锁" : ""}`);
                }
            }
            lines.push(`${module}${meta.kindName}: ${slots.length}/${meta.limit}`);
        }

        if (count > 0) {
            await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);
        }
        await e.reply([
            `【一键镶嵌完成】`,
            `目标：${key}`,
            `成功镶嵌：${count}个`,
            ...lines
        ].join('\n'));
    }
    // ========== 7. 灵体召唤与磨合（三大模块对称，兼容百分比） ==========
    async 召唤武器灵体(e) {
        await this.通用召唤灵体(e, '武器');
    }
    async 召唤护具灵体(e) {
        await this.通用召唤灵体(e, '护具');
    }
    async 召唤法宝灵体(e) {
        await this.通用召唤灵体(e, '法宝');
    }
    async 通用召唤灵体(e, module) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;
        // ========== 新增：读取玩家数据 ==========
    const player = await Read_player(usr_qq); // 关键修复：定义 player 变量
        const equipment = await Read_equipment(usr_qq);
        const config = this.getModuleConfig(module);
        const field = this.getModuleField(module);
        const lingtiName = config.灵体名称;
        const coreName = config.核心名称;
        const auxName = config.辅材名称;
        // 核心修复：兜底初始化灵体配置（若未存在）
        if (!equipment[field]) {
            return e.reply(`你还没有本命${module}`);
        }
        this.ensureBenmingState(equipment[field], module);
        if (!equipment[field][lingtiName]) {
            // 重新生成灵体初始配置
            const lingtiConfig = getLingtiInitConfig(lingtiName, coreName, auxName);
            equipment[field][lingtiName] = lingtiConfig[lingtiName];
            await Write_equipment(usr_qq, equipment);
            return e.reply(`${module}灵体配置缺失，已自动修复，请重新执行指令`);
        }
        if (equipment[field].等级 === config.等级体系[0]) {
            return e.reply(`请先完成${module}炼化`);
        }
        if (config.等级体系.indexOf(equipment[field].等级) < 1) {
            return e.reply(`你的${module}尚未孕育${lingtiName}`);
        }
        // 检查核心/辅材完整性
        if (equipment[field][lingtiName][coreName].length !== 3) {
            return e.reply(`${coreName}尚未成型（当前${equipment[field][lingtiName][coreName].length}/3）`);
        }
        if (equipment[field][lingtiName][auxName].length !== 7) {
            return e.reply(`${auxName}尚未成型（当前${equipment[field][lingtiName][auxName].length}/7）`);
        }
        const msg = e.msg.trim();
        const 灵体 = equipment[field][lingtiName];
        // 转换灵体属性为数字（兼容百分比）
        灵体.攻击属性加成 = parsePercent(灵体.攻击属性加成);
        灵体.防御属性加成 = parsePercent(灵体.防御属性加成);
        灵体.血量属性加成 = parsePercent(灵体.血量属性加成);
        // 初始化灵体（防止缺失）
        if (!灵体.姓名) {
            if (msg.startsWith(`#${lingtiName}命名 `)) {
                const name = msg.replace(`#${lingtiName}命名 `, "").trim();
                if (name.length > 10) {
                    return e.reply(`${lingtiName}名字最长10个字`);
                }
                灵体.姓名 = name;
                await Write_equipment(usr_qq, equipment);
                return e.reply(`${lingtiName}命名为【${name}】，请用 #${lingtiName}性别 男/女 设定性别`);
            }
            return e.reply(`请先为${lingtiName}命名：#${lingtiName}命名 [名字]`);
        }
        if (!灵体.性别) {
            if (msg.startsWith(`#${lingtiName}性别 `)) {
    const gender = msg.replace(`#${lingtiName}性别 `, "").trim();
    if (gender !== "男" && gender !== "女") {
        return e.reply("性别只能是男或女");
    }
    灵体.性别 = gender;
    const birthBonus = this.getLingtiBirthBonus(module, gender);
    const playerAttackAdd = birthBonus.攻击 || 0;
    const playerDefAdd = birthBonus.防御 || 0;
    const playerHpAdd = birthBonus.血量 || 0;

    // 性别觉醒是额外加成，不能覆盖三魂七魄已写入的器灵属性。
    灵体.攻击属性加成 = (parsePercent(灵体.攻击属性加成) || 0) + playerAttackAdd;
    灵体.防御属性加成 = (parsePercent(灵体.防御属性加成) || 0) + playerDefAdd;
    灵体.血量属性加成 = (parsePercent(灵体.血量属性加成) || 0) + playerHpAdd;
    player.攻击 += playerAttackAdd;
    player.防御 += playerDefAdd;
    player.血量上限 += playerHpAdd;
    for (const key of ['五行', '阴阳', '时空', '因果', '生命']) {
        const val = birthBonus[key] || 0;
        if (!val) continue;
        equipment[field][key] = (parsePercent(equipment[field][key]) || 0) + val;
        if (player[key] !== undefined) player[key] += val;
        灵体[`${key}加成`] = (parsePercent(灵体[`${key}加成`]) || 0) + val;
    }
    const stageBonuses = this.applySoulStageBonus(player, equipment[field], module);
    const talent = this.refreshLingtiTalent(equipment[field], module);
    const completionBonus = this.applySoulCompletionBonus(player, equipment[field], module);
    // 保存装备+玩家数据
    await Write_player(usr_qq, player);
    await Write_equipment(usr_qq, equipment);
    const 加成提示 = [
        playerAttackAdd ? `攻击+${playerAttackAdd}` : '',
        playerDefAdd ? `防御+${playerDefAdd}` : '',
        playerHpAdd ? `血量+${playerHpAdd}` : '',
        ...['五行', '阴阳', '时空', '因果', '生命'].map(key => birthBonus[key] ? `${key}+${birthBonus[key]}` : '')
    ].filter(Boolean).join(" ");
    return e.reply([
        `${lingtiName}性别设定为【${gender}】`,
        `觉醒加成：${加成提示}`,
        stageBonuses.length ? `阶段奖励：${stageBonuses.join("；")}` : '',
        talent ? `器灵天赋：${talent.名称}（${talent.描述}）` : '',
        completionBonus ? completionBonus.msg : '',
        `可用 #${lingtiName}状态 查看详情`
    ].filter(Boolean).join("\n"));
}
            return e.reply(`请设定${lingtiName}性别：#${lingtiName}性别 男/女`);
        }
        if (msg === `#${lingtiName}状态`) {
            const stageBonuses = this.applySoulStageBonus(player, equipment[field], module);
            const talent = this.refreshLingtiTalent(equipment[field], module);
            const completionBonus = this.applySoulCompletionBonus(player, equipment[field], module);
            if (completionBonus || stageBonuses.length || talent) {
                await Write_player(usr_qq, player);
                await Write_equipment(usr_qq, equipment);
            }
            const soul = this.getSoulProgress(equipment[field], module);
            const 魂魄进度 = soul.label;
            const 加成总值 = `攻+${灵体.攻击属性加成} 防+${灵体.防御属性加成} 血+${灵体.血量属性加成}`;
            return e.reply([
                `【${灵体.姓名}】${灵体.性别 === "男" ? "♂" : "♀"}（${lingtiName}）`,
                `契合度:${灵体.契合度}/1000（${灵体.阶段}）`,
                `魂魄:${魂魄进度}`,
                `魂魄特性:${soul.complete ? `圆满，终境解锁，强化x${this.getSoulPowerMultiplier(equipment[field], module)}，共鸣x${this.getSoulResonanceMultiplier(equipment[field], module)}` : "未圆满"}`,
                `器灵天赋:${灵体.天赋 ? `${灵体.天赋.名称}（${灵体.天赋.描述}）` : "未觉醒"}`,
                stageBonuses.length ? `补发阶段奖励:${stageBonuses.join("；")}` : '',
                `属性加成:${加成总值}`,
                `性格:${灵体.性格 || "未觉醒"}`
            ].join("\n"));
        }
        return e.reply(`可用 #${lingtiName}状态 查看详情，#磨合${lingtiName} 提升契合度`);
    }
    // 灵体磨合（兼容百分比）
    async 磨合武器灵体(e) {
        await this.通用磨合灵体(e, '武器');
    }
    async 磨合护具灵体(e) {
        await this.通用磨合灵体(e, '护具');
    }
    async 磨合法宝灵体(e) {
        await this.通用磨合灵体(e, '法宝');
    }
    async 通用磨合灵体(e, module) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;
        const player = await Read_player(usr_qq);
        const equipment = await Read_equipment(usr_qq);
        const config = this.getModuleConfig(module);
        const field = this.getModuleField(module);
        const lingtiName = config.灵体名称;
        if (!isNotNull(equipment[field]?.等级)) {
            return e.reply(`你还没有本命${module}`);
        }
        this.ensureBenmingState(equipment[field], module);
        const 灵体 = equipment[field][lingtiName];
        if (equipment[field].等级 === config.等级体系[0]) {
            return e.reply(`请先完成${module}炼化`);
        }
        if (config.等级体系.indexOf(equipment[field].等级) < 1) {
            return e.reply(`你的${module}尚未孕育${lingtiName}`);
        }
        if (!灵体.姓名 || !灵体.性别) {
            return e.reply(`请先完成${lingtiName}命名与性别设定`);
        }
        // 转换灵体属性为数字（兼容百分比）
        灵体.攻击属性加成 = parsePercent(灵体.攻击属性加成);
        灵体.防御属性加成 = parsePercent(灵体.防御属性加成);
        灵体.血量属性加成 = parsePercent(灵体.血量属性加成);
        // 初始化性格
        if (!灵体.性格) {
            const 性格列表 = [
                "孤傲", "冷冽", "狂暴", "沉静", "嗜血", "忠诚",
                "桀骜", "淡漠", "悲悯", "邪异", "肃杀", "灵动",
                "沧桑", "狂傲", "寂灭", "守护"
            ];
            灵体.性格 = 性格列表[Math.floor(Math.random() * 性格列表.length)];
        }
        // 基础契合度增加（与模块等级挂钩）
        const 等级索引 = config.等级体系.indexOf(equipment[field].等级);
        const 魂魄增幅 = this.getSoulPowerMultiplier(equipment[field], module);
        const 基础契合度增加 = Math.max(10, Math.floor(等级索引 * 4 * 魂魄增幅));
        // 随机事件
        const 随机事件 = [
            {
                名称: `${module}微颤`,
                描述: `${灵体.姓名}的${module}微微颤动，${灵体.性别 === "男" ? "他" : "她"}似乎对你有所回应`,
                契合度增加: 基础契合度增加,
                心情变化: 20,
                概率: 0.4
            },
            {
                名称: `${lingtiName}共鸣`,
                描述: `你感受到${灵体.姓名}的${lingtiName}与你产生共鸣，${灵体.性别 === "男" ? "他" : "她"}正在适应你的气息`,
                契合度增加: 基础契合度增加 * 7.5,
                心情变化: 2,
                概率: 0.3
            },
            {
                名称: `${module}心相通`,
                描述: `刹那间，你与${灵体.姓名}心意相通，${灵体.性别 === "男" ? "他" : "她"}的${灵体.性格}性格让你感到${
                    灵体.性格 === "孤傲" ? "高不可攀" :
                    灵体.性格 === "温顺" ? "如沐春风" :
                    灵体.性格 === "狂暴" ? "热血沸腾" : "平静如水"
                }`,
                契合度增加: 基础契合度增加 * 5,
                心情变化: 3,
                概率: 0.2
            },
            {
                名称: `${module}道顿悟`,
                描述: `${灵体.姓名}突然绽放耀眼灵光，${灵体.性别 === "男" ? "他" : "她"}引导你进入顿悟状态`,
                契合度增加: 基础契合度增加 * 5,
                心情变化: 5,
                附加效果: { 攻击: Math.floor(等级索引 * 30000000 * 魂魄增幅) },
                概率: 0.08
            },
            {
                名称: `人${module}合一`,
                描述: `你与${灵体.姓名}达到完美协调，仿佛${灵体.性别 === "男" ? "他" : "她"}就是你身体的延伸`,
                契合度增加: 基础契合度增加 * 5,
                心情变化: 8,
                附加效果: {
                    攻击: Math.floor(等级索引 * 55000000 * 魂魄增幅),
                    防御: Math.floor(等级索引 * 42000000 * 魂魄增幅),
                    血量: Math.floor(等级索引 * 65000000 * 魂魄增幅)
                },
                概率: 0.02
            }
        ];
        // 概率调整
        let 实际概率 = 随机事件.map(事件 => {
            let 调整概率 = 事件.概率;
            if (灵体.心情 > 70) 调整概率 *= 1.5;
            if (灵体.心情 < 30) 调整概率 *= 0.7;
            return 调整概率;
        });
        const 总概率 = 实际概率.reduce((a, b) => a + b, 0);
                // 概率归一化
        实际概率 = 实际概率.map(p => p / 总概率);
        // 随机选择事件
        let 随机数 = Math.random();
        let 选中事件 = null;
        for (let i = 0; i < 随机事件.length; i++) {
            if (随机数 < 实际概率[i]) {
                选中事件 = 随机事件[i];
                break;
            }
            随机数 -= 实际概率[i];
        }
        // 处理事件效果
        const 新增契合度 = Math.floor(选中事件.契合度增加);
        灵体.契合度 = Math.min(灵体.契合度 + 新增契合度, 1000);
        灵体.心情 = Math.min(Math.max(灵体.心情 + 选中事件.心情变化, 0), 100);
        // 更新阶段
        const 阶段列表 = [
            { 阈值: 0, 名称: "形同陌路" },
            { 阈值: 100, 名称: "略有感应" },
            { 阈值: 200, 名称: "心意相通" },
            { 阈值: 300, 名称: "人器相融" },
            { 阈值: 500, 名称: "魂器合一" },
            { 阈值: 700, 名称: "道器同归" },
            { 阈值: 900, 名称: "混沌一体" }
        ];
        for (let i = 阶段列表.length - 1; i >= 0; i--) {
            if (灵体.契合度 >= 阶段列表[i].阈值) {
                灵体.阶段 = 阶段列表[i].名称;
                break;
            }
        }
        // 处理附加效果
        let 附加效果提示 = "";
        if (选中事件.附加效果) {
            for (const [key, val] of Object.entries(选中事件.附加效果)) {
                if (key === "攻击") {
                    player.攻击 += val;
                    灵体.攻击属性加成 += val;
                    附加效果提示 += `\n✨ 额外获得攻击+${val}`;
                } else if (key === "防御") {
                    player.防御 += val;
                    灵体.防御属性加成 += val;
                    附加效果提示 += `\n✨ 额外获得防御+${val}`;
                } else if (key === "血量") {
                    player.血量上限 += val;
                    灵体.血量属性加成 += val;
                    附加效果提示 += `\n✨ 额外获得血量+${val}`;
                }
            }
        }
        // 保存数据
        await Write_player(usr_qq, player);
        await Write_equipment(usr_qq, equipment);
        // 回复信息
        await e.reply([
            `【${选中事件.名称}】`,
            选中事件.描述,
            `契合度提升: ${新增契合度}（当前: ${灵体.契合度}/1000）`,
            `阶段变化: ${灵体.阶段}`,
            `心情变化: ${灵体.心情}/100`,
            `魂魄增幅: x${魂魄增幅}`,
            附加效果提示
        ].filter(Boolean).join("\n"));
    }

    // ========== 8. 共鸣方法（三大模块对称，兼容百分比） ==========
    async 武器共鸣(e) {
        await this.通用共鸣(e, '武器', '剑境共鸣');
    }
    async 护具共鸣(e) {
        await this.通用共鸣(e, '护具', '护境共鸣');
    }
    async 法宝共鸣(e) {
        await this.通用共鸣(e, '法宝', '宝境共鸣');
    }
    async 通用共鸣(e, module, cmdName) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;
        const player = await Read_player(usr_qq);
        const equipment = await Read_equipment(usr_qq);
        const config = this.getModuleConfig(module);
        const field = this.getModuleField(module);
        const lingtiName = config.灵体名称;
        if (!isNotNull(equipment[field]?.等级)) {
            return e.reply(`你还没有本命${module}`);
        }
        if (equipment[field].等级 === config.等级体系[0]) {
            return e.reply(`请先完成${module}炼化`);
        }
        this.ensureBenmingState(equipment[field], module);
        const 灵体 = equipment[field][lingtiName];
        if (!灵体.姓名 || !灵体.性别) {
            return e.reply(`请先完成${lingtiName}命名与性别设定`);
        }
        if (灵体.契合度 < 100) {
            return e.reply(`${lingtiName}契合度不足100，无法触发${cmdName}`);
        }
        // 转换属性为数字（兼容百分比）
        const 基础攻击 = parsePercent(equipment[field].atk);
        const 基础防御 = parsePercent(equipment[field].def);
        const 基础血量 = parsePercent(equipment[field].HP);
        const 玩家攻击 = parsePercent(player.攻击) || 0;
        const 玩家防御 = parsePercent(player.防御) || 0;
        const 玩家血量 = parsePercent(player.血量上限) || 0;
        const 灵体攻击 = parsePercent(灵体.攻击属性加成) || 0;
        const 灵体防御 = parsePercent(灵体.防御属性加成) || 0;
        const 灵体血量 = parsePercent(灵体.血量属性加成) || 0;
        const modeBefore = getModeName(equipment[field]);
        const talent = this.refreshLingtiTalent(equipment[field], module);
        const 魂魄共鸣倍率 = this.getSoulResonanceMultiplier(equipment[field], module);
        const 契合共鸣倍率 = 1 + (Number(灵体.契合度) || 0) / 1800;
        const 计算共鸣加成 = (equipVal, playerVal, lingtiVal, ratio) => {
            const equipBonus = modeBefore === '绝对值'
                ? equipVal * ratio
                : playerVal * equipVal * ratio * 0.6;
            const lingtiBonus = lingtiVal * (0.1 + (Number(灵体.契合度) || 0) / 9000);
            return Math.floor((equipBonus + lingtiBonus) * 魂魄共鸣倍率 * 契合共鸣倍率);
        };
        // 共鸣加成（按模块侧重）
        let 攻击加成 = 0, 防御加成 = 0, 血量加成 = 0;
        if (module === '武器') {
            攻击加成 = 计算共鸣加成(基础攻击, 玩家攻击, 灵体攻击, 0.6);
            防御加成 = 计算共鸣加成(基础防御, 玩家防御, 灵体防御, 0.2);
            血量加成 = 计算共鸣加成(基础血量, 玩家血量, 灵体血量, 0.2);
        } else if (module === '护具') {
            攻击加成 = 计算共鸣加成(基础攻击, 玩家攻击, 灵体攻击, 0.2);
            防御加成 = 计算共鸣加成(基础防御, 玩家防御, 灵体防御, 0.6);
            血量加成 = 计算共鸣加成(基础血量, 玩家血量, 灵体血量, 0.4);
        } else if (module === '法宝') {
            攻击加成 = 计算共鸣加成(基础攻击, 玩家攻击, 灵体攻击, 0.3);
            防御加成 = 计算共鸣加成(基础防御, 玩家防御, 灵体防御, 0.3);
            血量加成 = 计算共鸣加成(基础血量, 玩家血量, 灵体血量, 0.8);
        }
        switch (talent?.类型) {
            case "spacetime":
                攻击加成 = Math.floor(攻击加成 * 1.08);
                break;
            case "causality":
                攻击加成 = Math.floor(攻击加成 * 1.05);
                血量加成 = Math.floor(血量加成 * 1.05);
                break;
            case "guard":
                防御加成 = Math.floor(防御加成 * 1.12);
                血量加成 = Math.floor(血量加成 * 1.08);
                break;
            case "flame":
                攻击加成 = Math.floor(攻击加成 * 1.12);
                break;
            case "origin":
                攻击加成 = Math.floor(攻击加成 * 1.06);
                防御加成 = Math.floor(防御加成 * 1.06);
                血量加成 = Math.floor(血量加成 * 1.06);
                break;
        }
        // 临时加成（1小时）
        player.临时攻击 = (parsePercent(player.临时攻击) || 0) + 攻击加成;
        player.临时防御 = (parsePercent(player.临时防御) || 0) + 防御加成;
        player.临时血量 = (parsePercent(player.临时血量) || 0) + 血量加成;
        // 记录共鸣结束时间
        equipment[field].共鸣结束时间 = Date.now() + 3600 * 1000;
        await Write_player(usr_qq, player);
        await Write_equipment(usr_qq, equipment);
        // 回复信息
        await e.reply([
            `【${cmdName}成功】`,
            `${灵体.姓名}(${lingtiName})与你产生强烈共鸣！`,
            `装备判定：${modeBefore}模式`,
            talent ? `器灵天赋：${talent.名称}` : '',
            `魂魄共鸣倍率：x${魂魄共鸣倍率}`,
            `临时属性加成（1小时）：`,
            `攻击+${攻击加成}`,
            `防御+${防御加成}`,
            `血量+${血量加成}`,
            `当前${lingtiName}契合度：${灵体.契合度}/1000`
        ].join("\n"));
    }

    // ========== 9. 武器专属形态转换（兼容百分比） ==========
    async 化剑为鞘(e) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
        const field = '武器';

        if (!isNotNull(equipment[field]?.等级)) return e.reply(`无本命武器`);
        if (equipment[field].鞘 === 1) return e.reply(`已处于鞘形态`);

        const 原攻击 = parsePercent(equipment[field].atk);
        const 原防御 = parsePercent(equipment[field].def);
        const modeBefore = getModeName(equipment[field]);
        const 新攻击 = modeBefore === '绝对值' ? Math.floor(原攻击 * 0.4) : roundAttr(原攻击 * 0.4);
        const 新防御 = modeBefore === '绝对值' ? Math.floor(原防御 * 1.6) : roundAttr(原防御 * 1.6);
        const 攻击减少量 = 原攻击 - 新攻击;
        const 防御增加量 = 新防御 - 原防御;

        equipment[field].atk = 新攻击;
        equipment[field].def = 新防御;
        equipment[field].鞘 = 1;
        if (modeBefore === '绝对值') {
            player.攻击 -= 攻击减少量;
            player.防御 += 防御增加量;
        }

        await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);
        await e.reply(`✅ 化剑为鞘成功！\n装备判定：${modeBefore}模式\n攻击：${原攻击}→${equipment[field].atk}（-60%）\n防御：${原防御}→${equipment[field].def}（+60%）`);
    }

    async 化鞘为剑(e) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
        const field = '武器';

        if (!isNotNull(equipment[field]?.等级)) return e.reply(`无本命武器`);
        if (equipment[field].鞘 === 0 || equipment[field].鞘 === undefined) return e.reply(`已处于剑形态`);

        const 当前攻击 = parsePercent(equipment[field].atk);
        const 当前防御 = parsePercent(equipment[field].def);
        const modeBefore = getModeName(equipment[field]);
        const 恢复后攻击 = modeBefore === '绝对值' ? Math.floor(当前攻击 / 0.4) : roundAttr(当前攻击 / 0.4);
        const 恢复后防御 = modeBefore === '绝对值' ? Math.floor(当前防御 / 1.6) : roundAttr(当前防御 / 1.6);

        equipment[field].atk = 恢复后攻击;
        equipment[field].def = 恢复后防御;
        equipment[field].鞘 = 0;
        if (modeBefore === '绝对值') {
            player.攻击 += 恢复后攻击 - 当前攻击;
            player.防御 -= 当前防御 - 恢复后防御;
        }

        await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);
        await e.reply(`✅ 化鞘为剑成功！\n装备判定：${modeBefore}模式\n攻击：${当前攻击}→${恢复后攻击}（+150%）\n防御：${当前防御}→${恢复后防御}（-37.5%）`);
    }

    // ========== 10. 终极强化方法（三大模块对称，兼容百分比）【已修复：四维平衡强化】 ==========
async 通用终极强化(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    if (!await existplayer(usr_qq)) return;

    // 解析指令：提取功能类型和批量次数
    const msg = e.msg.trim();
    const regMatch = msg.match(/^#(引雷淬火|玄铁精炼|法则滋养)(\*(\d+))?$/);
    if (!regMatch) return e.reply("指令格式错误！示例：#引雷淬火 或 #引雷淬火*5");
    const cmdName = regMatch[1];
    let 次数 = regMatch[3] ? parseInt(regMatch[3]) : 1;
    次数 = Math.min(次数, 10); // 限制最大10次批量
    if (次数 < 1) 次数 = 1;

    // 材料配置
    const 材料配置 = {
        "引雷淬火": {
            module: "武器",
            mat: "劫火红绒",
            effect: { 攻击加成: 2400000000, 防御加成: 600000000, 血量加成: 600000000, 百分比加成: { atk: 0.008, def: 0.002, HP: 0.002 }, 五行: 3000, 阴阳: 1000, 暴击率: 0.002 }
        },
        "玄铁精炼": {
            module: "护具",
            mat: "木灵胶",
            effect: { 攻击加成: 500000000, 防御加成: 2400000000, 血量加成: 1500000000, 百分比加成: { atk: 0.002, def: 0.008, HP: 0.005 }, 阴阳: 3000, 生命: 2000 }
        },
        "法则滋养": {
            module: "法宝",
            mat: "星尘砂",
            effect: { 攻击加成: 1100000000, 防御加成: 1100000000, 血量加成: 2200000000, 百分比加成: { atk: 0.004, def: 0.004, HP: 0.008 }, 五行: 1500, 阴阳: 1500, 时空: 3500, 因果: 2500, 生命: 2500, 契合度: 2 }
        }
    };
    const { module, mat, effect } = 材料配置[cmdName];
    const [player, equipment] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
    const config = this.getModuleConfig(module);
    const field = this.getModuleField(module);

    // 前置校验
    if (!isNotNull(equipment[field]?.等级)) return e.reply(`无本命${module}，无法${cmdName}`);
    if (equipment[field].等级 === config.等级体系[0]) return e.reply(`请先炼化${module}`);
    this.ensureBenmingState(equipment[field], module);
    const modeBefore = getModeName(equipment[field]);

    // 初始化成功强化次数
    if (equipment[field].成功强化次数 === undefined) equipment[field].成功强化次数 = 0;

    // 批量执行统计
    let 成功次数 = 0;
    let 失败次数 = 0;
    let 总攻击提升 = 0;
    let 总防御提升 = 0;
    let 总血量提升 = 0;
    let 总法则提升 = 0;
    let 总残响变化 = 0;
    let 总耐久损耗 = 0;
    const 强化异象统计 = {};
    const 专属效果提示 = [];
    const 材料消耗总量 = 次数;

    // 检查材料
    const 现有材料数量 = await exist_najie_thing(usr_qq, mat, "道具", true);
    if (现有材料数量 < 材料消耗总量) return e.reply(`缺少【${mat}】x${材料消耗总量 - 现有材料数量}（当前${现有材料数量}个）`);

    // 批量强化
    for (let i = 0; i < 次数; i++) {
        const 等级索引 = config.等级体系.indexOf(equipment[field].等级);
        // 成功率
        const 成功率 = 计算终极强化成功率(等级索引, equipment[field].成功强化次数);

        if (Math.random() > 成功率) {
            失败次数++;
            const failState = this.applyUltimateEventState(equipment[field], null, cmdName, false);
            总残响变化 += failState.echoDelta;
            continue;
        }

        // 强化成功
        成功次数++;
        equipment[field].成功强化次数++;

        const 强化异象 = this.rollUltimateEnhanceEvent(equipment[field], cmdName);
        const eventEffect = this.scaleGrowthEffect(effect, 强化异象.attrMultiplier, 强化异象.lawMultiplier, 强化异象.attrMultiplier);
        const exclusiveMessages = this.applyUltimateExclusiveEffect(equipment[field], module, cmdName, eventEffect, 强化异象);
        const eventState = this.applyUltimateEventState(equipment[field], 强化异象, cmdName, true);
        强化异象统计[强化异象.名称] = (强化异象统计[强化异象.名称] || 0) + 1;
        总残响变化 += eventState.echoDelta;
        总耐久损耗 += eventState.durabilityLoss;
        专属效果提示.push(...exclusiveMessages);

        const growth = this.applyAttrGrowth(equipment[field], module, eventEffect, 百分比装备终极强化倍率);
        if (growth.mode === '绝对值') {
            player.攻击 += growth.gain.atk;
            player.防御 += growth.gain.def;
            player.血量上限 += growth.gain.HP;
        }

        equipment[field].五行 = (parsePercent(equipment[field].五行) || 0) + (eventEffect.五行 || 0);
        equipment[field].阴阳 = (parsePercent(equipment[field].阴阳) || 0) + (eventEffect.阴阳 || 0);
        equipment[field].时空 = (parsePercent(equipment[field].时空) || 0) + (eventEffect.时空 || 0);
        equipment[field].因果 = (parsePercent(equipment[field].因果) || 0) + (eventEffect.因果 || 0);
        equipment[field].生命 = (parsePercent(equipment[field].生命) || 0) + (eventEffect.生命 || 0);
        if (eventEffect.暴击率) {
            equipment[field].bao = roundAttr((parsePercent(equipment[field].bao) || 0) + eventEffect.暴击率);
            player.暴击率 = (parsePercent(player.暴击率) || 0) + eventEffect.暴击率;
        }
        this.applyLingtiNurture(equipment[field], module, eventEffect);

        总攻击提升 += growth.gain.atk;
        总防御提升 += growth.gain.def;
        总血量提升 += growth.gain.HP;
        总法则提升 += (eventEffect.五行 || 0) + (eventEffect.阴阳 || 0) + (eventEffect.时空 || 0) + (eventEffect.因果 || 0) + (eventEffect.生命 || 0);
    }

    // 消耗材料
    await Add_najie_thing(usr_qq, mat, "道具", -材料消耗总量);
    await Promise.all([Write_player(usr_qq, player), Write_equipment(usr_qq, equipment)]);

    // 反馈
    const 提升详情 = [];
    提升详情.push(`攻+${总攻击提升}`);
    提升详情.push(`防+${总防御提升}`);
    提升详情.push(`血+${总血量提升}`);
    提升详情.push(`法则+${总法则提升}`);

        const 当前成功率 = 计算终极强化成功率(config.等级体系.indexOf(equipment[field].等级), equipment[field].成功强化次数);
        const 当前残响 = Number(equipment[field].终极强化残响?.[cmdName]) || 0;
        const 异象汇总 = Object.entries(强化异象统计).map(([name, count]) => `${name}x${count}`).join(" ");
        await e.reply([
            `✅ ${cmdName}x${次数} 完成！`,
            `装备判定：${modeBefore}模式`,
            `魂魄增幅：强化成长x${this.getSoulPowerMultiplier(equipment[field], module)}`,
            modeBefore === '百分比' ? `百分比终极强化倍率：x${百分比装备终极强化倍率}` : '',
            `消耗：【${mat}】x${材料消耗总量}`,
            `结果：成功${成功次数}次 | 失败${失败次数}次`,
            异象汇总 ? `强化异象：${异象汇总}` : '',
            专属效果提示.length ? `专属效果：${[...new Set(专属效果提示)].join("；")}` : '',
            总残响变化 ? `强化残响：${总残响变化 > 0 ? '+' : ''}${总残响变化}（当前${当前残响}/4）` : `强化残响：${当前残响}/4`,
            总耐久损耗 ? `极限过载：耐久-${总耐久损耗}` : '',
            `总提升：${提升详情.join(" ")}`,
            `当前成功率：${Math.round(当前成功率 * 100)}%（成功后每次仅降${roundAttr(终极强化成功次数衰减 * 100, 1)}%，升华后重置）`
        ].filter(Boolean).join("\n"));
}
    // ========== 11. 玩家灵体对战（房间号匹配模式） ==========
    async 玩家灵体对战(e) {
        if (!e.isGroup) return;
        const usr_qq = e.user_id;
        if (!await existplayer(usr_qq)) return;

        const regMatch = e.msg.match(/^#召唤(剑灵|护灵|宝灵)战斗(\d+)$/);
        const 灵体类型 = regMatch[1];
        const 房间号 = regMatch[2];
        const moduleMap = { '剑灵': '武器', '护灵': '护具', '宝灵': '法宝' };
        const module = moduleMap[灵体类型];

        const [玩家数据, 装备数据] = await Promise.all([Read_player(usr_qq), Read_equipment(usr_qq)]);
        if (!装备数据[module]) return e.reply(`❌ 你还没有本命${module}，无法召唤${灵体类型}战斗`);
        this.ensureBenmingState(装备数据[module], module);
        this.refreshLingtiTalent(装备数据[module], module);
        const 灵体数据 = 装备数据[module][灵体类型];
        const 校验结果 = await this.对战前置校验(usr_qq, module, 灵体类型, 灵体数据, 装备数据);
        if (校验结果) return e.reply(校验结果);

        // 房间处理（保持原逻辑）
        if (!战斗房间[房间号]) {
            战斗房间[房间号] = { 灵体类型: module, 灵体名称: 灵体类型, 玩家列表: [], 状态: '等待中' };
        }
        const 房间 = 战斗房间[房间号];
        if (房间.灵体类型 !== module) return e.reply(`❌ 房间${房间号}为${房间.灵体名称}专属`);
        if (房间.玩家列表.some(p => p.qq === usr_qq)) return e.reply(`❌ 已在房间${房间号}中`);
        if (房间.状态 === '战斗中') return e.reply(`❌ 房间${房间号}战斗中`);

        房间.玩家列表.push({
            qq: usr_qq,
            灵体数据: { ...灵体数据 },
            玩家数据: { ...玩家数据 },
            装备数据: { ...装备数据[module] },
            功法数据: 玩家数据.功法 || {}
        });

        if (房间.玩家列表.length === 1) {
            await e.reply(`✅ 加入房间${房间号}（${灵体类型}对战）\n状态：等待对手\n战力预览：${this.计算单玩家战力(module, 灵体数据, 玩家数据, 玩家数据.功法 || {}, 装备数据[module])}`);
        } else if (房间.玩家列表.length === 2) {
            房间.状态 = '战斗中';
            const [玩家A, 玩家B] = 房间.玩家列表;
            const 战斗结果 = this.执行器灵战斗(module, 玩家A, 玩家B);
            const 胜利者 = 战斗结果.胜利方 === 'A' ? 玩家A : 玩家B;
            const 失败者 = 战斗结果.胜利方 === 'A' ? 玩家B : 玩家A;

            await this.处理战斗结果(胜利者, 失败者, 灵体类型, 房间号, 战斗结果);

            await e.reply([
                `🔥 房间${房间号}${灵体类型}对战结束`,
                `对战双方：`,
                `${玩家A.qq}（${灵体类型}【${玩家A.灵体数据.姓名}】/${战斗结果.A.天赋}）战力：${战斗结果.A.战力}`,
                `${玩家B.qq}（${灵体类型}【${玩家B.灵体数据.姓名}】/${战斗结果.B.天赋}）战力：${战斗结果.B.战力}`,
                ``,
                `【战斗过程】`,
                ...战斗结果.日志,
                ``,
                `🏆 胜利者：${胜利者.qq}`,
                `❌ 失败者：${失败者.qq}`
            ].join('\n'));
            delete 战斗房间[房间号];
        }
    }

生成器灵战斗面板(module, combatant) {
    const 灵体 = combatant.灵体数据 || {};
    const 玩家 = combatant.玩家数据 || {};
    const 装备 = combatant.装备数据 || {};
    const 法则 = {
        五行: parsePercent(装备.五行) || 0,
        阴阳: parsePercent(装备.阴阳) || 0,
        时空: parsePercent(装备.时空) || 0,
        因果: parsePercent(装备.因果) || 0,
        生命: parsePercent(装备.生命) || 0
    };
    const 灵体攻击 = parsePercent(灵体.攻击属性加成) || 0;
    const 灵体防御 = parsePercent(灵体.防御属性加成) || 0;
    const 灵体血量 = parsePercent(灵体.血量属性加成) || 0;
    const 玩家攻击 = parsePercent(玩家.攻击) || 0;
    const 玩家防御 = parsePercent(玩家.防御) || 0;
    const 玩家血量 = parsePercent(玩家.血量上限) || 0;
    const 魂魄战斗倍率 = this.getSoulBattleMultiplier(装备, module);
    const soul = this.getSoulProgress(装备, module);
    const 模块系数 = {
        武器: { 攻击: 1.25, 防御: 0.85, 血量: 0.9 },
        护具: { 攻击: 0.85, 防御: 1.25, 血量: 1.05 },
        法宝: { 攻击: 0.95, 防御: 0.95, 血量: 1.25 }
    }[module] || { 攻击: 1, 防御: 1, 血量: 1 };
    const 法则攻击 = (法则.五行 * 22000 + 法则.时空 * 16000 + 法则.因果 * 12000) * (1 + soul.rate * 0.2);
    const 法则防御 = (法则.阴阳 * 22000 + 法则.时空 * 11000 + 法则.生命 * 12000) * (1 + soul.rate * 0.2);
    const 法则血量 = (法则.生命 * 38000 + 法则.因果 * 16000 + 法则.五行 * 8000) * (1 + soul.rate * 0.2);
    const 契合 = Number(灵体.契合度) || 0;
    const 心情 = Number(灵体.心情) || 50;
    const 契合倍率 = 1 + 契合 / 1400;
    const 心情倍率 = 0.9 + 心情 / 350;
    let 攻击 = Math.max(1, Math.floor((玩家攻击 * 0.22 + 灵体攻击 * 1.85 * 魂魄战斗倍率 + 法则攻击) * 模块系数.攻击 * 契合倍率 * 心情倍率));
    let 防御 = Math.max(1, Math.floor((玩家防御 * 0.18 + 灵体防御 * 1.95 * 魂魄战斗倍率 + 法则防御) * 模块系数.防御 * 契合倍率));
    let 血量 = Math.max(1000, Math.floor((玩家血量 * 0.15 + 灵体血量 * 2.55 * 魂魄战斗倍率 + 法则血量) * 模块系数.血量 * (0.95 + 心情 / 300)));
    let 暴击 = Math.min(0.75, (parsePercent(玩家.暴击率) || 0) * 0.3 + (parsePercent(装备.bao) || 0) + 契合 / 4200 + (soul.complete ? 0.05 : 0));
    let 暴伤 = 1.6 + Math.min(1.1, 契合 / 1200) + (soul.complete ? 0.15 : 0);
    let 速度 = 120 + 法则.时空 / 95 + 契合 / 8 + 心情 / 2 + (soul.complete ? 80 : 0);
    let 护持 = Math.floor((法则.阴阳 * 28000 + 法则.生命 * 16000) * 魂魄战斗倍率);
    let 回复 = Math.floor((法则.生命 * 9000 + 契合 * 5000) * (1 + soul.rate * 0.35));
    let 因果 = 法则.因果;
    switch (灵体.天赋?.类型) {
        case "spacetime":
            速度 = Math.floor(速度 * 1.15);
            攻击 = Math.floor(攻击 * 1.05);
            break;
        case "causality":
            因果 = Math.floor(因果 * 1.35);
            暴击 += 0.03;
            break;
        case "guard":
            防御 = Math.floor(防御 * 1.05);
            护持 = Math.floor(护持 * 1.25);
            回复 = Math.floor(回复 * 1.18);
            break;
        case "flame":
            攻击 = Math.floor(攻击 * 1.06);
            暴击 += 0.06;
            暴伤 += 0.25;
            break;
        case "origin":
            攻击 = Math.floor(攻击 * 1.06);
            防御 = Math.floor(防御 * 1.06);
            血量 = Math.floor(血量 * 1.06);
            break;
    }
    暴击 = Math.min(0.82, 暴击);
    const 战力 = Math.floor(((攻击 + 防御 + 血量 * 0.35) * (1 + 暴击 * 0.5) + 速度 * 100000 + 护持 * 0.25) * (1 + soul.rate * 0.2));
    return { 攻击, 防御, 血量, 暴击, 暴伤, 速度, 护持, 回复, 因果, 战力, 魂魄战斗倍率, 魂魄圆满: soul.complete, 天赋: 灵体.天赋?.名称 || "未觉醒" };
}

执行器灵战斗(module, 玩家A, 玩家B) {
    const A = this.生成器灵战斗面板(module, 玩家A);
    const B = this.生成器灵战斗面板(module, 玩家B);
    const state = {
        A: { hp: A.血量, maxHp: A.血量, usedCausality: false, usedSoulGuard: false },
        B: { hp: B.血量, maxHp: B.血量, usedCausality: false, usedSoulGuard: false }
    };
    const 日志 = [];
    const names = {
        A: 玩家A.灵体数据?.姓名 || '器灵A',
        B: 玩家B.灵体数据?.姓名 || '器灵B'
    };
    const panels = { A, B };
    const attackOnce = (from, to, round) => {
        const attacker = panels[from];
        const defender = panels[to];
        const atkState = state[from];
        const defState = state[to];
        let damage = Math.max(attacker.攻击 * 0.12, attacker.攻击 - defender.防御 * 0.42 - defender.护持 * 0.08);
        damage *= 0.9 + Math.random() * 0.2;
        const crit = Math.random() < attacker.暴击;
        if (crit) damage *= attacker.暴伤;
        damage = Math.floor(damage);
        defState.hp -= damage;
        atkState.hp = Math.min(atkState.maxHp, atkState.hp + attacker.回复);
        日志.push(`第${round}回合：${names[from]}${crit ? '触发暴击，' : ''}造成${damage}伤害${attacker.回复 ? `，生命法则回复${attacker.回复}` : ''}`);
        if (defState.hp <= 0 && defender.魂魄圆满 && !defState.usedSoulGuard) {
            defState.usedSoulGuard = true;
            defState.hp = Math.floor(defState.maxHp * 0.18);
            const backlash = Math.floor(defender.护持 * 0.35 + defender.回复 * 2);
            atkState.hp -= backlash;
            日志.push(`魂魄护主：${names[to]}三魂七魄同鸣，保留18%气血并反震${backlash}伤害`);
        }
        if (defState.hp <= 0 && !defState.usedCausality) {
            const reverseRate = Math.min(0.35, defender.因果 / 90000);
            if (Math.random() < reverseRate) {
                defState.usedCausality = true;
                defState.hp = Math.floor(defState.maxHp * 0.12);
                const counter = Math.floor(defender.因果 * 12000 + defender.攻击 * 0.18);
                atkState.hp -= counter;
                日志.push(`因果逆命：${names[to]}以因果线续命并反击${counter}伤害`);
            }
        }
    };

    for (let round = 1; round <= 6; round++) {
        const first = A.速度 + Math.random() * 30 >= B.速度 + Math.random() * 30 ? 'A' : 'B';
        const second = first === 'A' ? 'B' : 'A';
        attackOnce(first, second, round);
        if (state[second].hp <= 0 || state[first].hp <= 0) break;
        attackOnce(second, first, round);
        if (state[first].hp <= 0 || state[second].hp <= 0) break;
    }

    let 胜利方;
    if (state.A.hp <= 0 && state.B.hp <= 0) {
        胜利方 = A.战力 >= B.战力 ? 'A' : 'B';
    } else if (state.A.hp <= 0) {
        胜利方 = 'B';
    } else if (state.B.hp <= 0) {
        胜利方 = 'A';
    } else {
        const aScore = state.A.hp / state.A.maxHp + A.战力 / Math.max(B.战力, 1) * 0.2;
        const bScore = state.B.hp / state.B.maxHp + B.战力 / Math.max(A.战力, 1) * 0.2;
        胜利方 = aScore >= bScore ? 'A' : 'B';
    }
    日志.push(`余势：${names.A} ${Math.max(0, Math.floor(state.A.hp))}/${state.A.maxHp}，${names.B} ${Math.max(0, Math.floor(state.B.hp))}/${state.B.maxHp}`);
    return { 胜利方, A, B, 日志 };
}

// ========== 辅助方法：对战前置校验 ==========
async 对战前置校验(qq, module, 灵体类型, 灵体数据, 装备数据) {
    // 校验1：是否拥有对应本命装备
    if (!isNotNull(装备数据[module]?.等级)) {
        return `❌ 你还没有本命${module}，无法召唤${灵体类型}战斗`;
    }
    const config = this.getModuleConfig(module);
    const soul = this.getSoulProgress(装备数据[module], module);
    if (!soul.complete) {
        return `❌ ${config.核心名称}${config.辅材名称}尚未圆满（${soul.label}），${灵体类型}无法参战`;
    }
    // 校验2：灵体是否完成命名/性别设定
    if (!灵体数据.姓名 || !灵体数据.性别) {
        return `❌ 请先完成${灵体类型}的命名与性别设定`;
    }
    // 校验3：灵体契合度达标（最低300）
    if (灵体数据.契合度 < 300) {
        return `❌ ${灵体类型}契合度不足300（当前${灵体数据.契合度}/1000），需磨合后参战`;
    }
    // 校验4：灵体心情达标（最低20）
    if (灵体数据.心情 < 20) {
        return `❌ ${灵体类型}心情过低（当前${灵体数据.心情}/100），需温养后参战`;
    }
    return null; // 校验通过
}

// ========== 辅助方法：计算单玩家战力（灵体+面板+功法） ==========
计算单玩家战力(module, 灵体数据, 玩家数据, 功法数据, 装备数据 = null) {
    // 1. 灵体基础属性（攻击/防御/血量加成）
    const 灵体攻击 = parsePercent(灵体数据.攻击属性加成);
    const 灵体防御 = parsePercent(灵体数据.防御属性加成);
    const 灵体血量 = parsePercent(灵体数据.血量属性加成);

    // 2. 玩家面板属性
    const 玩家攻击 = parsePercent(玩家数据.攻击) || 0;
    const 玩家防御 = parsePercent(玩家数据.防御) || 0;
    const 玩家血量 = parsePercent(玩家数据.血量上限) || 0;
    const 魂魄战力倍率 = 装备数据 ? this.getSoulBattleMultiplier(装备数据, module) : 1;

    // 3. 功法加成（假设功法有攻击倍率、防御倍率、额外暴击等字段）
    const 功法攻击倍率 = 功法数据.攻击倍率 || 1.0;
    const 功法防御倍率 = 功法数据.防御倍率 || 1.0;
    const 功法额外战力 = 功法数据.额外战力 || 0;

    // 4. 模块侧重系数（武器=攻击优先，护具=防御优先，法宝=血量优先）
    const 模块系数 = {
        武器: { 攻击: 1.5, 防御: 0.8, 血量: 0.7 },
        护具: { 攻击: 0.8, 防御: 1.5, 血量: 1.0 },
        法宝: { 攻击: 0.7, 防御: 0.8, 血量: 1.2 }
    }[module];

    // 5. 灵体契合度/心情额外加成
    const 契合度加成 = 1 + (灵体数据.契合度 / 1000) * 0.9; // 最高+90%
    const 心情加成 = 1 + (灵体数据.心情 / 100) * 0.35; // 最高+35%
    const 天赋战力倍率 = {
        spacetime: 1.08,
        causality: 1.08,
        guard: 1.08,
        flame: 1.08,
        origin: 1.06
    }[灵体数据.天赋?.类型] || 1;

    // 总战力计算（综合所有维度）
    const 总攻击 = (玩家攻击 * 0.85 + 灵体攻击 * 1.8 * 魂魄战力倍率) * 模块系数.攻击 * 功法攻击倍率;
    const 总防御 = (玩家防御 * 0.85 + 灵体防御 * 1.9 * 魂魄战力倍率) * 模块系数.防御 * 功法防御倍率;
    const 总血量 = (玩家血量 * 0.85 + 灵体血量 * 2.2 * 魂魄战力倍率) * 模块系数.血量;
    const 总战力 = Math.floor((总攻击 + 总防御 + 总血量) * 契合度加成 * 心情加成 * (1 + (魂魄战力倍率 - 1) * 0.25) * 天赋战力倍率 + 功法额外战力);

    return 总战力;
}

// ========== 辅助方法：处理战斗结果（奖励/惩罚） ==========
async 处理战斗结果(胜利者, 失败者, 灵体类型, 房间号, 战斗结果 = null) {
    const 胜利QQ = 胜利者.qq;
    const 失败QQ = 失败者.qq;
    const 胜利灵体数据 = 胜利者.灵体数据;
    const 失败灵体数据 = 失败者.灵体数据;

    // 1. 胜利者奖励
    const 胜利契合度奖励 = Math.floor(35 + Math.random() * 40); // 契合度+35~75
    const 胜利心情奖励 = Math.floor(12 + Math.random() * 14); // 心情+12~26
    const 材料池 = [核心材料, 辅材材料, 淬炼材料, 修复温养材料].flatMap(obj => Object.keys(obj));
    const 胜利材料奖励 = 材料池[Math.floor(Math.random() * 材料池.length)];
    const 胜利修为奖励 = Math.floor(5000000 + Math.random() * 5000000); // 修为+500万~1000万

    // 更新胜利者灵体数据
    const 胜利装备数据 = await Read_equipment(胜利QQ);
    const 胜利Module = 灵体类型 === '剑灵' ? '武器' : 灵体类型 === '护灵' ? '护具' : '法宝';
    胜利装备数据[胜利Module][灵体类型].契合度 = Math.min(胜利灵体数据.契合度 + 胜利契合度奖励, 1000);
    胜利装备数据[胜利Module][灵体类型].心情 = Math.min(胜利灵体数据.心情 + 胜利心情奖励, 100);
    await Write_equipment(胜利QQ, 胜利装备数据);

    // 发放胜利者道具+修为
    await Add_najie_thing(胜利QQ, 胜利材料奖励, "道具", 1);
    await Add_修为(胜利QQ, 胜利修为奖励);

    // 2. 失败者惩罚（轻微惩罚，不打击积极性）
    const 失败契合度奖励 = Math.floor(15 + Math.random() * 16);
    const 失败心情惩罚 = Math.floor(1 + Math.random() * 4); // 心情-1~5
    const 失败修为惩罚 = Math.floor(100000 + Math.random() * 400000); // 修为-10万~50万

    // 更新失败者灵体数据
    const 失败装备数据 = await Read_equipment(失败QQ);
    const 失败Module = 灵体类型 === '剑灵' ? '武器' : 灵体类型 === '护灵' ? '护具' : '法宝';
    失败装备数据[失败Module][灵体类型].契合度 = Math.min((Number(失败灵体数据.契合度) || 0) + 失败契合度奖励, 1000);
    失败装备数据[失败Module][灵体类型].心情 = Math.max(失败灵体数据.心情 - 失败心情惩罚, 0);
    await Write_equipment(失败QQ, 失败装备数据);

    // 扣除失败者修为（最低保留1点）
    const 失败玩家数据 = await Read_player(失败QQ);
    失败玩家数据.修为 = Math.max(失败玩家数据.修为 - 失败修为惩罚, 1);
    await Write_player(失败QQ, 失败玩家数据);

    // 单独通知双方结果
    await this.sendPrivateMsg(胜利QQ, [
        `🏆 你在房间${房间号}的${灵体类型}对战中获胜！`,
        `奖励1：${灵体类型}契合度+${胜利契合度奖励}（当前${胜利装备数据[胜利Module][灵体类型].契合度}/1000）`,
        `奖励2：${灵体类型}心情+${胜利心情奖励}（当前${胜利装备数据[胜利Module][灵体类型].心情}/100）`,
        `奖励3：材料【${胜利材料奖励}】x1`,
        `奖励4：修为+${胜利修为奖励}`,
        战斗结果 ? `战斗评价：${战斗结果.日志.at(-1)}` : ''
    ].filter(Boolean).join("\n"));

    await this.sendPrivateMsg(失败QQ, [
        `❌ 你在房间${房间号}的${灵体类型}对战中失败`,
        `磨砺：${灵体类型}契合度+${失败契合度奖励}（当前${失败装备数据[失败Module][灵体类型].契合度}/1000）`,
        `惩罚1：${灵体类型}心情-${失败心情惩罚}（当前${失败装备数据[失败Module][灵体类型].心情}/100）`,
        `惩罚2：修为-${失败修为惩罚}（当前${失败玩家数据.修为}）`,
        `提示：提升灵体契合度或玩家面板可增加胜率`
    ].join("\n"));
}

// ========== 辅助方法：发送私聊消息（结果通知） ==========
async sendPrivateMsg(qq, content) {
    try {
        await bot.sendPrivateMsg(qq, content);
    } catch (err) {
        console.error(`给QQ${qq}发送私聊失败：`, err);
    }
}
}
