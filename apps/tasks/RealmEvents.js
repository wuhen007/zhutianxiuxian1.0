import fs from 'fs';
import path from 'path';
import { pushGroup } from '../../model/officialReply.js';
import { __PATH } from '../../model/xiuxian.js';
import { config as xiuxianConfig, data } from '../../api/api.js';
import { Read_player, Read_najie, Write_najie } from '../../model/xiuxian.js';
import {
    createRealmEventLocation,
    formatRealmEventLocation,
    formatRealmEventTravel
} from '../../model/realmEventLocation.js';
import {
    COORDINATE_EVENT_DURATION_MS,
    getCoordinateLocations
} from '../../model/weimianTravel.js';
import {
    TIANMO_HUASHENG_TECHNIQUE,
    TIANMO_LEGACY_DURATION_MS
} from '../../model/tianmoHuasheng.js';
import {
    getRealmEventWorldYear,
    isRealmEventCooldownReady
} from '../../model/realmEventClock.js';
import { createBlackMarketStock, createWhiteBeardStock } from '../../model/realmMerchant.js';
import {
    CONTESTABLE_INNATE_TREASURE_NAMES,
    INNATE_TREASURE_NAMES,
    readInnateTreasureState
} from '../../model/innateTreasure.js';
import { getTianjiaoHeldTreasureNames } from '../../model/tianjiaoTreasure.js';
import {
    TREASURE_CONTEST_DURATION_MS,
    createTreasureContest,
    getManifestedTreasureNames,
    getRevealedTreasureClues,
    getTreasureContestProfile,
    injectTianjiaoContestants,
    joinTreasureContest,
    performTreasureTrial,
    placeTreasureDaoHeart,
    registerTianjiTreasureEvent,
    settleTreasureContest
} from '../../model/innateTreasureContest.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
    BINGZI_DURATION_MS,
    createBingziLegacy,
    declareOnlyWeapon,
    identifyBingziMountain,
    observeBingziDiagram,
    rankBingziLegacy,
    settleBingziLegacy,
    traceCaiClan,
    trackMoonPrincess
} from '../../model/bingziLegacy.js';
import { formatTianjiaoTrace, rollRealmEventTianjiaoTrace } from '../../model/tianjiaoGrowth.js';

const DEFAULT_ERA_TRIGGER_CHANCE = 0.35;
const DEFAULT_DUNGEON_TRIGGER_CHANCE = 0.002;
const DEFAULT_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ACTIVE_EVENTS = 3;
const REALM_EVENT_REGISTRATION_LOCK = 'realm-event:registration';
const SECT_WAR_MAX_ACTIONS = 5;
const SECT_WAR_MAX_SUPPORTS = 3;

const SECT_WAR_ACTIONS = {
    '正面攻伐': { military: 2, contribution: 2 },
    '护送资源': { supplies: 2, seal: 0.5, contribution: 2 },
    '源术勘脉': { truth: 2, seal: 1, contribution: 2 },
    '潜入夺证': { truth: 3, seal: 0.5, contribution: 2 },
    '救援伤员': { supplies: 1, military: 0.5, seal: 0.5, contribution: 2 }
};

const SECT_WAR_CLUES = {
    mine: [
        [25, '矿脉深处存在人为凿开的古老甬道，双方最初得到的矿图都不完整。'],
        [50, '所谓神源龙脉其实是一处封印节点，争夺正在削弱地下帝阵。'],
        [75, '封印另一端传来禁区气息；继续大战，可能唤醒沉睡在黑暗中的存在。']
    ],
    frontier: [
        [25, '裂缝会吞噬神源并反哺禁区，寻常封禁只能延缓扩张。'],
        [50, '联军发现一座血祭古坛，破坏它可以切断裂缝与禁区深处的联系。'],
        [75, '古坛背后有至尊意志短暂复苏，联军必须在其完全醒来前作出决断。']
    ]
};

function clampWarMeter(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function createSectWarState({ mode, attacker, defender, coalitionMembers = [], timestamp }) {
    const frontier = mode === 'frontier';
    return {
        mode,
        status: 'open',
        phase: frontier ? '禁区外缘联军' : '神源龙脉争夺',
        openedAt: timestamp,
        maxActions: SECT_WAR_MAX_ACTIONS,
        sides: frontier ? {
            coalition: { name: '圣地联军', members: coalitionMembers },
            neutral: { name: '观望修士' }
        } : {
            attacker,
            defender,
            neutral: { name: '中立修士' }
        },
        scores: frontier
            ? { coalition: 0, neutral: 0 }
            : { attacker: 0, defender: 0, neutral: 0 },
        meters: { military: 0, supplies: 0, truth: 0, seal: 0 },
        participants: {},
        decisionVotes: {},
        clues: [],
        actionLog: [],
        supportLog: [],
        rewardedQqs: [],
        outcome: null
    };
}

function rankSectWar(war) {
    return Object.values(war?.participants || {})
        .map(entry => ({ ...entry }))
        .sort((a, b) =>
            (Number(b.contribution) || 0) - (Number(a.contribution) || 0) ||
            (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0)
        );
}

function revealSectWarClues(war) {
    const known = new Set((war.clues || []).map(item => Number(item.threshold)));
    const newlyRevealed = [];
    for (const [threshold, text] of SECT_WAR_CLUES[war.mode] || []) {
        if (Number(war.meters?.truth) >= threshold && !known.has(threshold)) {
            const clue = { threshold, text };
            war.clues.push(clue);
            newlyRevealed.push(clue);
        }
    }
    return newlyRevealed;
}

function hasPendingTreasureSettlement(event) {
    if (event?.type !== 'treasureAppear') return false;
    if (event.contest?.status !== 'settled') return true;
    const participants = Object.keys(event.contest?.participants || {}).length;
    const rewarded = new Set((event.contest?.rewardedQqs || []).map(String)).size;
    return rewarded < participants;
}

function hasPendingSectWarSettlement(event) {
    if (event?.type !== 'sectWar') return false;
    if (event.sectWar?.status !== 'settled') return true;
    const participants = Object.keys(event.sectWar?.participants || {}).length;
    const rewarded = new Set((event.sectWar?.rewardedQqs || []).map(String)).size;
    return rewarded < participants;
}

function hasPendingBingziSettlement(event) {
    if (event?.type !== 'bingziLegacy') return false;
    if (event.bingzi?.status !== 'settled') return true;
    const participants = Object.keys(event.bingzi?.participants || {}).length;
    const rewarded = new Set((event.bingzi?.rewardedQqs || []).map(String)).size;
    return rewarded < participants;
}

function hasPendingEventSettlement(event) {
    return hasPendingTreasureSettlement(event) ||
        hasPendingSectWarSettlement(event) ||
        hasPendingBingziSettlement(event);
}

function getDefaultEventConfig() {
    return {
        eventHistory: [],
        lastEventTime: 0,
        lastEventWorldYear: null,
        activeEvents: [],
        eventCooldown: 2000,
        enableEvents: true,
        eraTriggerChance: DEFAULT_ERA_TRIGGER_CHANCE,
        dungeonTriggerChance: DEFAULT_DUNGEON_TRIGGER_CHANCE,
        eventDurationMs: DEFAULT_EVENT_DURATION_MS,
        maxActiveEvents: DEFAULT_MAX_ACTIVE_EVENTS
    };
}

/** 位面大事件系统 */
export class RealmEvents {
    constructor() {
        // 位面大事件配置文件路径
        this.eventConfigPath = path.join(__PATH.data_path, 'weimian_events.json');
        
        // 初始化事件配置
        this.initEventConfig();
    }
    
    /** 初始化事件配置 */
    initEventConfig() {
        try {
            if (!fs.existsSync(this.eventConfigPath)) {
                const defaultConfig = getDefaultEventConfig();
                fs.writeFileSync(this.eventConfigPath, JSON.stringify(defaultConfig, null, 4), 'utf8');
            }
        } catch (e) {
            console.error("初始化位面大事件配置失败:", e);
        }
    }
    
    /** 读取事件配置 */
    readEventConfig() {
        try {
            if (fs.existsSync(this.eventConfigPath)) {
                return { ...getDefaultEventConfig(), ...JSON.parse(fs.readFileSync(this.eventConfigPath, 'utf8')) };
            }
        } catch (e) {
            console.error("读取事件配置失败:", e);
        }
        return getDefaultEventConfig();
    }
    
    /** 保存事件配置 */
    saveEventConfig(config) {
        try {
            fs.writeFileSync(this.eventConfigPath, JSON.stringify(config, null, 4), 'utf8');
            return true;
        } catch (e) {
            console.error("保存事件配置失败:", e);
            return false;
        }
    }
    
    /** 获取随机玩家 */
    async getRandomPlayer(excludeQqs = []) {
        try {
            const playerFiles = fs.readdirSync(__PATH.player_path);
            const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
            
            const validPlayers = [];
            for (const file of jsonFiles) {
                const qq = file.replace(".json", "");
                if (excludeQqs.includes(qq)) continue;
                
                const player = await Read_player(qq);
                if (player && player.名号) {
                    validPlayers.push({ qq, player });
                }
            }
            
            if (validPlayers.length === 0) return null;
            return validPlayers[Math.floor(Math.random() * validPlayers.length)];
        } catch (e) {
            console.error("获取随机玩家失败:", e);
            return null;
        }
    }
    
    /** 获取随机玩家（可指定境界范围） */
    async getRandomPlayerByLevel(minLevel, maxLevel, excludeQqs = []) {
        try {
            const playerFiles = fs.readdirSync(__PATH.player_path);
            const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
            
            const validPlayers = [];
            for (const file of jsonFiles) {
                const qq = file.replace(".json", "");
                if (excludeQqs.includes(qq)) continue;
                
                const player = await Read_player(qq);
                if (player && player.名号 && player.mijinglevel_id >= minLevel && player.mijinglevel_id <= maxLevel) {
                    validPlayers.push({ qq, player });
                }
            }
            
            if (validPlayers.length === 0) return null;
            return validPlayers[Math.floor(Math.random() * validPlayers.length)];
        } catch (e) {
            console.error("按境界获取随机玩家失败:", e);
            return null;
        }
    }
    
    /** 获取所有玩家 */
    async getAllPlayers() {
        try {
            const playerFiles = fs.readdirSync(__PATH.player_path);
            const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
            
            const players = [];
            for (const file of jsonFiles) {
                const qq = file.replace(".json", "");
                const player = await Read_player(qq);
                if (player && player.名号) {
                    players.push({ qq, player });
                }
            }
            return players;
        } catch (e) {
            console.error("获取所有玩家失败:", e);
            return [];
        }
    }
    
    /** 检查冷却时间 */
    checkCooldown(config, currentWorldYear, currentYears) {
        return isRealmEventCooldownReady(config, currentWorldYear, currentYears);
    }
    
    /** ============ 大事件类型定义 ============ */
    
    /** 先天灵宝出世事件 */
    async treasureAppearEvent(eraIndex, options = {}) {
        const random = options.random || Math.random;
        const excludedNames = new Set([
            ...(options.excludeNames || []),
            ...getTianjiaoHeldTreasureNames(data.weimiantianjiao_list)
        ]);
        const treasureDefinitions = [
            { name: "混沌珠", desc: "内含混沌，可开天辟地", rarity: "至宝", power: 15 },
            { name: "太极图", desc: "阴阳轮转，道法自然", rarity: "至宝", power: 15 },
            { name: "盘古幡", desc: "开天斧所化，威力无穷", rarity: "至宝", power: 15 },
            { name: "诛仙四剑", desc: "诛仙利，戮仙亡，陷仙四处起红光", rarity: "至宝", power: 15 },
            { name: "山河社稷图", desc: "内含一方小世界", rarity: "至宝", power: 14 },
            { name: "天地玄黄玲珑塔", desc: "后天第一防御至宝", rarity: "至宝", power: 14 },
            { name: "东皇钟", desc: "镇压鸿蒙宇宙", rarity: "至宝", power: 15 },
            { name: "混沌钟", desc: "攻防一体，威震诸天", rarity: "至宝", power: 14 },
            { name: "六道轮回盘", desc: "可掌轮回之力", rarity: "至宝", power: 14 },
            { name: "炼妖壶", desc: "可炼化万物", rarity: "至宝", power: 14 },
            { name: "崆峒印", desc: "人皇至宝", rarity: "至宝", power: 14 }
        ];
        const owners = readInnateTreasureState().owners || {};
        const treasures = treasureDefinitions.filter(treasure =>
            INNATE_TREASURE_NAMES.includes(treasure.name) &&
            !owners[treasure.name] &&
            !excludedNames.has(treasure.name)
        );
        if (!treasures.length) return null;
        const treasure = treasures[Math.floor(random() * treasures.length)];
        const destination = createRealmEventLocation({ random });
        if (!destination) return null;
        
        // 获取一个幸运玩家
        const luckyPlayer = options.skipLuckyPlayer ? null : await this.getRandomPlayer();
        const witnessCount = Math.floor(random() * 5) + 3;
        const witnessMsg = luckyPlayer ? `传闻${luckyPlayer.player.名号}曾在附近出没...` : "各方势力蠢蠢欲动";
        
        const timestamp = Date.now();
        const eventData = {
            type: 'treasureAppear',
            treasure: treasure,
            ...destination,
            luckyPlayer: luckyPlayer ? { qq: luckyPlayer.qq, name: luckyPlayer.player.名号 } : null,
            witnessCount: witnessCount,
            timestamp,
            expiresAt: timestamp + TREASURE_CONTEST_DURATION_MS
        };
        eventData.contest = createTreasureContest(treasure.name, eventData.timestamp);
        eventData.contest.profile = {
            omen: getTreasureContestProfile(treasure.name).omen
        };

        // 天骄入局：独立天骄闻讯赶来，成为择主之争的 AI 竞争者
        const tianjiaoEntrants = injectTianjiaoContestants(
            eventData.contest,
            treasure.name,
            data.weimiantianjiao_list || [],
            { random }
        );
        eventData.tianjiaoEntrants = tianjiaoEntrants.map(entrant => entrant.name);

        const message = [
            `【逆天机缘·先天至宝出世】`,
            ``,
            `天地异变！${formatRealmEventLocation(eventData)}上空突现万丈霞光！`,
            `一件${treasure.rarity}——【${treasure.name}】横空出世！`,
            `${treasure.desc}`,
            ``,
            `各方势力纷纷感应，大批修士正向此地赶来！`,
            witnessMsg,
            ...(tianjiaoEntrants.length
                ? [`诸天震动！${tianjiaoEntrants.map(entrant => entrant.name).join('、')}等天骄亦闻讯赶来，欲与天下英豪一争此宝！`]
                : []),
            `天象：${getTreasureContestProfile(treasure.name).omen}`,
            `「这是成道的契机！」`,
            `「先天灵宝，有德者居之！」`,
            ``,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            `抵达坐标后发送 #观摩灵宝，再发送 #夺宝参加择主之争。`,
            `事件持续24小时，需完成三次试炼并立下道心，结束后按公开评分择主。`
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 云游商人降临事件 */
    async merchantVisitEvent(eraIndex, random = Math.random) {
        const merchants = [
            { name: "矮胖道人", desc: "圆滚滚的身材，却身手敏捷", special: "专卖功法秘籍" },
            { name: "白须仙翁", desc: "白须垂胸，背负一座袖珍仙炉", special: "专卖游历诸天时炼成的百分比神兵、护具与法宝" },
            { name: "黑衣神秘人", desc: "浑身笼罩在黑雾之中", special: "专卖禁忌之物" },
            { name: "绝美仙子", desc: "倾国倾城，却无人知其来历", special: "可求红尘仙缘签，问道、历练、寻缘三选一" }
        ];
        
        const merchant = merchants[Math.floor(random() * merchants.length)];
        const destination = createRealmEventLocation();
        if (!destination) return null;
        const timestamp = Date.now();
        
        const eventData = {
            type: 'merchantVisit',
            merchant: merchant,
            ...destination,
            timestamp
        };
        if (merchant.name === '白须仙翁') {
            eventData.interaction = 'merchant';
            eventData.stock = createWhiteBeardStock({
                weaponTemplates: data.duanzhaowuqi,
                armorTemplates: data.duanzhaohuju,
                treasureTemplates: data.duanzhaobaowu,
                materials: data.duanzhaocailiao,
                random,
                serial: timestamp
            });
        } else if (merchant.name === '黑衣神秘人') {
            eventData.interaction = 'merchant';
            eventData.stock = createBlackMarketStock({
                pills: data.danyao_list,
                props: data.daoju_list,
                random
            });
        } else if (merchant.name === '绝美仙子') {
            eventData.interaction = 'merchant';
            eventData.serviceQqs = [];
        }
        
        const message = [
            `【神秘来客·云游商人】`,
            ``,
            `${formatRealmEventLocation(eventData)}传来消息：`,
            `一位自称${merchant.name}的商旅悄然现身！`,
            `${merchant.desc}`,
            `据传其带来诸多奇珍，皆是世间罕见之物！`,
            `「${merchant.special}」`,
            ``,
            `消息灵通者纷纷前往，欲购所需之物...`,
            `「此人来历成谜，所售之物却皆为真品」`,
            ``,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            merchant.name === '白须仙翁'
                ? `抵达后发送 #白须仙翁 查看仙炉藏品。`
                : merchant.name === '黑衣神秘人'
                    ? `抵达后发送 #黑衣神秘人 查看黑市货单。`
                    : merchant.name === '绝美仙子'
                        ? `抵达后发送 #绝美仙子 求取红尘仙缘签。`
                    : `「有缘者可得其青睐」`
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 圣地战争事件 */
    async sectWarEvent(eraIndex, random = Math.random) {
        const attackerSects = [
            { name: "太初圣宗", desc: "太古传承，底蕴深厚" },
            { name: "天璇圣地", desc: "北斗星域第一势力" },
            { name: "摇光圣地", desc: "以炼器闻名天下" },
            { name: "姬家皇朝", desc: "帝族血脉，威压当世" },
            { name: "虚空殿", desc: "行踪诡秘，刺杀无双" },
            { name: "万初圣地", desc: "太古大教复苏" },
            { name: "道一圣宫", desc: "道法传承最为悠久" },
            { name: "太虚圣地", desc: "以阵法称雄诸天" },
            { name: "神蚕岭", desc: "神蚕一族蛰伏万古" },
            { name: "紫微星主", desc: "紫微帝星守护者" }
        ];
        
        const defenderSects = [
            { name: "瑶池圣地", desc: "西皇传承，女修圣地" },
            { name: "姜家", desc: "恒宇大帝后裔" },
            { name: "秦岭万龙巢", desc: "真龙后裔巢穴" },
            { name: "荒古姬家", desc: "虚空大帝血脉" },
            { name: "太玄门", desc: "拙峰一脉传承" },
            { name: "阴阳圣教", desc: "阴阳合一之道" },
            { name: "大衍圣地", desc: "大衍天机术" },
            { name: "九霄圣地", desc: "九天神霄道统" },
            { name: "五行宫", desc: "五行本源法则" },
            { name: "天妖宫", desc: "妖帝传承" }
        ];
        
        const mineDisputes = [
            '双方都持有残缺矿图，并宣称神源龙脉是祖上传下的疆界',
            '一批神源矿料在交割时失踪，护送者全部被灭口',
            '源术师发现龙脉改道，两家圣地同时封锁了矿眼',
            '一名天骄在矿区陨落，遗留证据却同时指向交战双方'
        ];
        const forbiddenZones = ['太初古矿外缘', '不死山外缘', '神墟边界', '轮回海旧址'];
        
        const attacker = attackerSects[Math.floor(random() * attackerSects.length)];
        const defender = defenderSects[Math.floor(random() * defenderSects.length)];
        const frontier = random() < 0.3;
        const reason = frontier
            ? `${forbiddenZones[Math.floor(random() * forbiddenZones.length)]}出现吞噬神源的空间裂缝`
            : mineDisputes[Math.floor(random() * mineDisputes.length)];
        const destination = createRealmEventLocation({ plane: '遮天位面', random });
        if (!destination) return null;
        const timestamp = Date.now();
        const coalitionMembers = frontier
            ? [...new Set([attacker.name, defender.name, '瑶池圣地'])]
            : [];
        const mode = frontier ? 'frontier' : 'mine';
        const eventData = {
            type: 'sectWar',
            interaction: 'sectWar',
            attacker,
            defender,
            reason,
            ...destination,
            timestamp,
            sectWar: createSectWarState({ mode, attacker, defender, coalitionMembers, timestamp })
        };

        const message = frontier ? [
            '【圣地大战·禁区外缘联军】',
            '',
            `${reason}！`,
            `${coalitionMembers.join('、')}已经组成联军，封锁禁区外缘。`,
            `集结地点：${formatRealmEventLocation(eventData)}`,
            '联军目标：稳住裂缝、救出被困修士，并摧毁血祭古坛。',
            '此战只在禁区外缘展开，不会直接讨伐沉睡至尊。',
            '',
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            '抵达后发送 #圣战详情，并以 #圣战站队 联军 加入。',
            '事件持续24小时，军势、辎重、真相与封印进度共同决定结局。'
        ].join('\n') : [
            '【圣地大战·神源龙脉争夺】',
            '',
            `${attacker.name}正式向${defender.name}宣战！`,
            `交战地点：${formatRealmEventLocation(eventData)}`,
            `公开导火索：${reason}。`,
            `${attacker.name}：${attacker.desc}`,
            `${defender.name}：${defender.desc}`,
            '',
            '两方争夺神源、矿权与帝阵控制权，但矿脉深处似乎另有隐情。',
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            '抵达后发送 #圣战详情，再以 #圣战站队 攻方/守方/中立 选择立场。',
            '事件持续24小时；调查真相后，玩家可以推动停战或联军转攻禁区外缘。'
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 天骄崛起事件 */
    async prodigyRiseEvent(eraIndex) {
        const playerInfo = await this.getRandomPlayerByLevel(10, 15);
        
        if (!playerInfo) {
            return null; // 没有符合条件的玩家
        }
        const destination = createRealmEventLocation();
        if (!destination) return null;
        
        const achievements = [
            "于万丈深渊中悟得绝世剑意",
            "斩杀一头为祸一方的远古凶兽",
            "在一处上古遗迹中获得逆天机缘",
            "以弱胜强，击败高出自己数个境界的强敌",
            "独自一人探索仙古秘境并全身而退",
            "在一场天骄论道中力压群雄",
            "获得某位陨落大帝的认可与传承"
        ];
        
        const achievements2 = [
            "从此名动天下，被各方势力关注",
            "其名号开始在诸天万界流传",
            "诸多大能开始研究此人的来历",
            "被誉为当世最有潜力的天骄之一",
            "成为众多势力争相拉拢的对象"
        ];
        
        const achievement = achievements[Math.floor(Math.random() * achievements.length)];
        const achievement2 = achievements2[Math.floor(Math.random() * achievements2.length)];
        
        const levelNames = [
            "铭文境", "列阵境", "尊者境", "教主级", "大能级", 
            "准帝", "大帝", "红尘仙", "仙王", "仙帝"
        ];
        
        const eventData = {
            type: 'prodigyRise',
            player: { qq: playerInfo.qq, name: playerInfo.player.名号 },
            level: playerInfo.player.mijinglevel_id,
            levelName: levelNames[playerInfo.player.mijinglevel_id - 10] || "未知",
            achievement: achievement,
            achievement2: achievement2,
            ...destination,
            timestamp: Date.now()
        };
        
        const message = [
            `【天骄崛起·震动诸天】`,
            ``,
            `一位横空出世的少年天才引发热议！`,
            ``,
            `【${playerInfo.player.名号}】`,
            `境界：${levelNames[playerInfo.player.mijinglevel_id - 10] || "未知"}`,
            `现身地点：${formatRealmEventLocation(eventData)}`,
            ``,
            `此人${achievement}`,
            achievement2,
            ``,
            `消息传遍诸天万界，无数势力为之侧目！`,
            `「又一个时代的弄潮儿出现了...」`,
            `「此子日后必成大器！」`
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 禁区异动事件 */
    async forbiddenZoneEvent(eraIndex) {
        const forbiddenZones = [
            { name: "不死山", locationId: "busishan", desc: "位于北斗南域，传闻其中有石皇沉睡", danger: "极高" },
            { name: "神墟", locationId: "shenxu", desc: "太古年前的战场，埋葬无数神魔", danger: "极高" },
            { name: "仙陵", locationId: "xianling", desc: "据传为仙人流放之地", danger: "极高" },
            { name: "太初古矿", locationId: "taichugukuang", desc: "太古年间开采神源之地，传闻有至尊蛰伏", danger: "极高" },
            { name: "葬天岛", locationId: "shangcang", desc: "漂浮于九天之上，来历成谜", danger: "高" },
            { name: "上苍", locationId: "shangcang", desc: "传说中的神秘之地，无人知其具体位置", danger: "未知" },
            { name: "轮回海", locationId: "lunhuihai", desc: "传说可以让人进入轮回的诡异之地", danger: "极高" }
        ];
        
        const phenomena = [
            "传出惊天动地的怒吼声",
            "冲出一道贯穿星河的魔光",
            "散发出令人心悸的帝威",
            "有古老的祭祀声回荡",
            "异象笼罩方圆亿万里",
            "无数修士莫名失踪",
            "天地灵气骤然紊乱",
            "大道法则出现短暂扭曲"
        ];
        
        const zone = forbiddenZones[Math.floor(Math.random() * forbiddenZones.length)];
        const phenomenon = phenomena[Math.floor(Math.random() * phenomena.length)];
        const destination = createRealmEventLocation({ plane: '遮天位面', location: zone.locationId });
        if (!destination) return null;
        
        const eventData = {
            type: 'forbiddenZone',
            zone: zone,
            phenomenon: phenomenon,
            ...destination,
            timestamp: Date.now()
        };
        
        const message = [
            `【禁区异动·风云再起】`,
            ``,
            `${zone.name}发生惊天异变！`,
            phenomenon,
            `异动坐标：${formatRealmEventLocation(eventData)}`,
            ``,
            `禁区描述：${zone.desc}`,
            `危险等级：${zone.danger}`,
            ``,
            `各方势力惶恐不安，派遣探子前往查探！`,
            `传闻有至尊即将苏醒？`,
            `「禁区一动，必有大事发生...」`,
            `「不知又有多少无辜者将遭殃」`,
            ``,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            `诸位修士请谨慎行事！`
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 秦岭秦门兵字秘传承事件 */
    async bingziLegacyEvent(eraIndex, random = Math.random) {
        const destination = createRealmEventLocation({
            plane: '遮天位面',
            location: 'qinlingqinmen',
            random
        });
        if (!destination) return null;
        const timestamp = Date.now();
        const eventData = {
            type: 'bingziLegacy',
            interaction: 'bingzi',
            ...destination,
            timestamp,
            expiresAt: timestamp + BINGZI_DURATION_MS,
            bingzi: createBingziLegacy(timestamp, random)
        };

        const message = [
            '【九秘传承·秦门兵图显化】',
            '',
            '中州秦岭传出异象：秦门后山的拙劣兵器刻痕正在吞吐月华。',
            '古老线索指向三万年前覆灭的蔡族，而秦门掌教一脉疑为其后人。',
            `显化地点：${formatRealmEventLocation(eventData)}`,
            '',
            '此传承不是战利品。须追查蔡族旧事、跟踪月灵公主、在九座石山中辨出真迹，最终以自身唯一之器承受兵道经文。',
            '完整兵字秘只择一名参悟最深者，其余参与者可获得兵字秘残卷。',
            '',
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            '抵达后发送 #秦门兵图 查看传承步骤。',
            '石壁只显化24小时。'
        ].join('\n');

        return { eventData, message };
    }
    
    /** 天地异变事件 */
    async worldChangeEvent(eraIndex) {
        const eraEvents = {
            0: [ // 神话时代
                { title: "万灵朝拜", desc: "诸多神兽灵禽齐聚某地，疑似有祥瑞降世" },
                { title: "仙根觉醒", desc: "天地灵根突然大规模开花结果，灵气暴涨" },
                { title: "神迹频现", desc: "天神下凡，诸多神迹降临凡尘" }
            ],
            1: [ // 太古时代
                { title: "万族争锋", desc: "各大强族纷纷出世，血脉之力觉醒" },
                { title: "神魔战场", desc: "沉寂的神魔战场再度开启" },
                { title: "血脉觉醒", desc: "诸多隐世种族血脉觉醒，实力暴涨" }
            ],
            2: [ // 天命时代
                { title: "天命降临", desc: "天降异象，诸多修士感应天命" },
                { title: "宗门林立", desc: "各大宗门招收弟子，竞争激烈" },
                { title: "天骄辈出", desc: "当世天才如雨后春笋般涌现" }
            ],
            3: [ // 末法时代
                { title: "灵气衰退", desc: "天地灵气急剧减少，修士苦不堪言" },
                { title: "道统断裂", desc: "诸多上古传承断绝，后人难以为继" },
                { title: "武道崛起", desc: "在灵气匮乏之时，凡人武道开始崛起" }
            ],
            4: [ // 绝灵时代
                { title: "天道倾覆", desc: "天道法则崩乱，大道隐没" },
                { title: "万物凋零", desc: "天地万物开始凋零，灵物枯竭" },
                { title: "希望微光", desc: "有传言称，绝灵之中仍有希望存在..." }
            ]
        };
        
        const eraSpecificEvents = eraEvents[eraIndex] || eraEvents[2];
        const event = eraSpecificEvents[Math.floor(Math.random() * eraSpecificEvents.length)];
        const destination = createRealmEventLocation();
        if (!destination) return null;
        
        const eventData = {
            type: 'worldChange',
            eraIndex: eraIndex,
            event: event,
            ...destination,
            timestamp: Date.now()
        };
        
        const message = [
            `【天地异变·${event.title}】`,
            ``,
            `${event.desc}`,
            `异变源点：${formatRealmEventLocation(eventData)}`,
            ``,
            `这是时代更迭的征兆，亦或是命运的安排...`,
            `「天道无常，世事难料」`,
            `「或许...这其中蕴含着某种深意」`
        ].join('\n');
        
        return { eventData, message };
    }
    
    /** 神秘遗迹发现事件 */
    async mysteriousRuinsEvent(eraIndex) {
        const ruins = [
            { name: "上古仙宫", desc: "传闻为真仙所留，宫门紧闭" },
            { name: "远古战场", desc: "埋葬着上古神魔，怨气冲天" },
            { name: "神魔祭坛", desc: "古老而诡异的祭坛，作用未知" },
            { name: "仙古学府", desc: "曾经传授仙法的至高学府遗迹" },
            { name: "大帝陵寝", desc: "某位陨落大帝的长眠之地" },
            { name: "外星遗迹", desc: "据说是域外文明的遗留之物" },
            { name: "时空裂隙", desc: "时而出现时而消失的神秘空间入口" },
            { name: "天道棋盘", desc: "疑似上古大能博弈天地之所留" }
        ];
        
        const ruin = ruins[Math.floor(Math.random() * ruins.length)];
        const destination = createRealmEventLocation();
        if (!destination) return null;
        
        const eventData = {
            type: 'mysteriousRuins',
            ruins: ruin,
            ...destination,
            timestamp: Date.now()
        };
        
        const message = [
            `【惊天发现·神秘遗迹】`,
            ``,
            `${formatRealmEventLocation(eventData)}传来惊人消息！`,
            `一座名为"${ruin.name}"的神秘遗迹被意外发现！`,
            `${ruin.desc}`,
            ``,
            `遗迹散发古老气息，疑似蕴含逆天机缘！`,
            `各方势力闻讯赶来，场面一度混乱！`,
            `「这遗迹...来头不小！」`,
            `「不知其中有何危险与机遇」`,
            ``,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            `消息来源：一位不愿透露姓名的散修`
        ].join('\n');
        
        return { eventData, message };
    }

    /** 万化天魔传承现世事件 */
    async tianmoHuashengLegacyEvent() {
        const candidates = (await this.getAllPlayers()).filter(({ player }) =>
            player.灵根?.name === '极道天魔' &&
            !player.学习的功法?.includes(TIANMO_HUASHENG_TECHNIQUE)
        );
        if (candidates.length === 0) return null;

        const destination = createRealmEventLocation();
        if (!destination) return null;
        const timestamp = Date.now();
        const eventData = {
            type: 'tianmoHuashengLegacy',
            technique: TIANMO_HUASHENG_TECHNIQUE,
            ...destination,
            eligibleCount: candidates.length,
            timestamp,
            expiresAt: timestamp + TIANMO_LEGACY_DURATION_MS
        };
        const message = [
            `【万化天魔传承·万相魔冢】`,
            ``,
            `${formatRealmEventLocation(eventData)}裂开一道贯穿诸天的魔隙！`,
            `亿万残破灵根与众生本源在其中沉浮，最终凝作一座万相魔冢。`,
            ``,
            `唯有极道天魔能够踏入其中，直面由自身魔念凝成的【万灵怨胎】。`,
            `通过试炼者，可获得禁忌功法【${TIANMO_HUASHENG_TECHNIQUE}】。`,
            ``,
            `「炼万灵之根，化诸天之生；众生资质，尽归吾身。」`,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            `魔冢将在24小时后闭合，使用 #进入万相魔冢 接受传承试炼。`
        ].join('\n');
        return { eventData, message };
    }

    /** 石壁显露位面坐标线索事件 */
    async coordinateClueEvent() {
        const destination = createRealmEventLocation();
        if (!destination) return null;
        const sourcePlane = destination.plane;
        const targets = getCoordinateLocations().filter(name => name !== sourcePlane);
        const targetPlane = targets[Math.floor(Math.random() * targets.length)];
        const discoverer = await this.getRandomPlayer();
        const discovererName = discoverer?.player?.名号 || '一名无名散修';
        const timestamp = Date.now();
        const eventData = {
            type: 'coordinateClue',
            ...destination,
            sourcePlane,
            targetPlane,
            discovererName,
            claimedQqs: [],
            timestamp,
            expiresAt: timestamp + COORDINATE_EVENT_DURATION_MS
        };
        const message = [
            `【诸天传闻·石壁星图】`,
            `惊闻${discovererName}在「${formatRealmEventLocation(eventData)}」发现一面古老石壁！`,
            `石壁上刻满残缺星纹，似乎藏着前往「${targetPlane}」的位面坐标。`,
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            `抵达后发送 #探索位面线索 ${eventData.location} 亲自拓印。`,
            `石壁道纹将在24小时后消散。`
        ].join('\n');
        return { eventData, message };
    }

    /** 问仙古碑显化事件 */
    async wenXianClueEvent() {
        const destination = createRealmEventLocation();
        if (!destination) return null;
        const discoverer = await this.getRandomPlayer();
        const discovererName = discoverer?.player?.名号 || '一名无名散修';
        const timestamp = Date.now();
        const eventData = {
            type: 'wenxianClue',
            ...destination,
            discovererName,
            claimedQqs: [],
            timestamp,
            expiresAt: timestamp + DEFAULT_EVENT_DURATION_MS
        };
        const message = [
            '【诸天传闻·问仙古碑】',
            `惊闻${discovererName}在「${formatRealmEventLocation(eventData)}」发现一座无名古碑！`,
            '碑上仅余“问仙”二字，深处似乎封存着一份失落的传承线索。',
            `赶路方式：${formatRealmEventTravel(eventData)}`,
            '抵达后发送 #参悟问仙古碑，每位合资格修士均可参悟一次。',
            '古碑将在24小时后隐入虚空。'
        ].join('\n');
        return { eventData, message };
    }
    
    /** ============ 主函数：触发随机大事件 ============ */
    
    /** 触发位面大事件 */
    async triggerRandomEvent(eraIndex, currentYears, epoch = 1, options = {}) {
        return withPlayerMutationLock(REALM_EVENT_REGISTRATION_LOCK, async () => {
        try {
            const config = this.readEventConfig();
            const currentWorldYear = getRealmEventWorldYear(eraIndex, currentYears, epoch);
            const random = options.random || Math.random;
            if (!config.enableEvents) return null;

            // 管理员回调时代后，冷却从当前年份重新计算，避免等待旧时间线追平。
            if (Number(config.lastEventWorldYear) > currentWorldYear) {
                config.lastEventTime = currentYears;
                config.lastEventWorldYear = currentWorldYear;
                if (!this.saveEventConfig(config)) return null;
            }
            
            // 检查冷却
            if (!options.ignoreCooldown && !this.checkCooldown(config, currentWorldYear, currentYears)) {
                return null; // 冷却中
            }

            const triggerChance = Math.min(1, Math.max(0,
                Number(options.triggerChance ?? config.eraTriggerChance) || 0
            ));
            if (random() >= triggerChance) return null;

            const now = Date.now();
            const activeEvents = (config.activeEvents || []).filter(event =>
                !event.expiresAt || Number(event.expiresAt) > now ||
                hasPendingEventSettlement(event)
            );
            const maxActiveEvents = Math.max(1, Number(config.maxActiveEvents) || DEFAULT_MAX_ACTIVE_EVENTS);
            // 待结算记录保留以便补发奖励，但过期后不再占用新事件名额。
            const ongoingEvents = activeEvents.filter(event => !event.expiresAt || Number(event.expiresAt) > now);
            if (ongoingEvents.length >= maxActiveEvents) return null;
            
            // 根据当前时代调整事件概率和类型
            const activeTypes = new Set(activeEvents.map(event => event.type));
            const availableEvents = this.getAvailableEvents(eraIndex).filter(event =>
                !activeTypes.has(this.getEventDataType(event))
            );
            
            if (availableEvents.length === 0) {
                return null;
            }
            
            // 随机选择事件类型
            const eventType = availableEvents[Math.floor(random() * availableEvents.length)];
            
            // 触发事件
            let result;
            switch (eventType) {
                case 'treasure':
                    result = await this.treasureAppearEvent(eraIndex, { random });
                    break;
                case 'merchant':
                    result = await this.merchantVisitEvent(eraIndex, random);
                    break;
                case 'war':
                    result = await this.sectWarEvent(eraIndex, random);
                    break;
                case 'prodigy':
                    result = await this.prodigyRiseEvent(eraIndex);
                    break;
                case 'forbidden':
                    result = await this.forbiddenZoneEvent(eraIndex);
                    break;
                case 'legacy':
                    result = await this.bingziLegacyEvent(eraIndex, random);
                    break;
                case 'worldChange':
                    result = await this.worldChangeEvent(eraIndex);
                    break;
                case 'ruins':
                    result = await this.mysteriousRuinsEvent(eraIndex);
                    break;
                case 'tianmoLegacy':
                    result = await this.tianmoHuashengLegacyEvent();
                    break;
                case 'coordinateClue':
                    result = await this.coordinateClueEvent();
                    break;
                case 'wenxianClue':
                    result = await this.wenXianClueEvent();
                    break;
                default:
                    return null;
            }
            
            if (!result) {
                return null; // 事件生成失败（如没有符合条件的玩家）
            }

            const relocatableTypes = new Set([
                'treasureAppear', 'merchantVisit', 'sectWar', 'prodigyRise',
                'emperorLegacy', 'worldChange', 'mysteriousRuins'
            ]);
            if (options.preferredPlane && relocatableTypes.has(result.eventData.type)) {
                const oldLocation = formatRealmEventLocation(result.eventData);
                const oldTravel = formatRealmEventTravel(result.eventData);
                const destination = createRealmEventLocation({ plane: options.preferredPlane, random });
                if (destination?.plane === options.preferredPlane) {
                    Object.assign(result.eventData, destination);
                    result.message = result.message
                        .replaceAll(oldLocation, formatRealmEventLocation(result.eventData))
                        .replaceAll(oldTravel, formatRealmEventTravel(result.eventData));
                }
            }

            if (!result.eventData.plane || !result.eventData.coordinate) return null;

            const durationMs = Math.max(60000, Number(config.eventDurationMs) || DEFAULT_EVENT_DURATION_MS);
            result.eventData.expiresAt ||= now + durationMs;
            result.eventData.source = options.source || 'era';
            result.eventData.interaction ||= this.getEventInteraction(result.eventData);
            result.eventData.participantQqs ||= [];
            if (options.discoveredBy) result.eventData.discoveredBy = options.discoveredBy;

            const tianjiaoTrace = rollRealmEventTianjiaoTrace(
                data.weimiantianjiao_list,
                result.eventData,
                { random, now }
            );
            if (tianjiaoTrace) {
                result.eventData.tianjiaoTrace = tianjiaoTrace;
                result.message += `\n【天骄踪迹】${tianjiaoTrace.name}现身于${formatTianjiaoTrace(tianjiaoTrace)}，踪迹24小时内有效。`;
            }

            if (result.eventData.interaction === 'generic') {
                const discoverer = options.discoveredBy
                    ? `\n此异象由${options.discoveredBy.name}在${options.discoveredBy.dungeon}历练时意外引动。`
                    : '';
                result.message += [
                    discoverer,
                    `\n事件位置：${formatRealmEventLocation(result.eventData)}`,
                    `赶路方式：${formatRealmEventTravel(result.eventData)}`,
                    `抵达精确坐标后发送 #参与位面大事件。`
                ].filter(Boolean).join('\n');
            }
            
            // 更新配置
            config.lastEventTime = currentYears;
            config.lastEventWorldYear = currentWorldYear;
            config.eventHistory.push(result.eventData);
            config.activeEvents = [...activeEvents, result.eventData];
            
            // 保持历史记录不超过100条
            if (config.eventHistory.length > 100) {
                config.eventHistory = config.eventHistory.slice(-100);
            }
            
            if (!this.saveEventConfig(config)) return null;
            
            return result;
            
        } catch (e) {
            console.error("触发位面大事件失败:", e);
            return null;
        }
        });
    }

    /** 副本胜利结算时以极低概率引动一个位面大事件。 */
    async triggerDungeonEvent(context = {}, random = Math.random) {
        const config = this.readEventConfig();
        const chance = Math.min(1, Math.max(0,
            (Number(config.dungeonTriggerChance) || 0) * (Number(context.chanceMultiplier) || 1)
        ));
        if (!config.enableEvents || random() >= chance) return null;
        const era = context.era || {};
        return this.triggerRandomEvent(
            Number(era.index) || 0,
            Number(era.years) || 0,
            Number(era.epoch) || 1,
            {
                source: 'dungeon',
                ignoreCooldown: true,
                triggerChance: 1,
                discoveredBy: context.discoveredBy,
                preferredPlane: context.preferredPlane,
                random
            }
        );
    }

    /** 购买先天灵宝天机后，强行唤醒一件仍在蛰伏的未认主至宝。 */
    async triggerTreasureFromTianji(invoker = {}, options = {}) {
        return withPlayerMutationLock(REALM_EVENT_REGISTRATION_LOCK, async () => {
        try {
            const random = options.random || Math.random;
            const config = this.readEventConfig();
            if (!config.enableEvents) return { ok: false, reason: 'disabled' };

            const now = Date.now();
            const activeEvents = (config.activeEvents || []).filter(event =>
                !event.expiresAt || Number(event.expiresAt) > now || hasPendingEventSettlement(event)
            );
            const activeTreasureNames = getManifestedTreasureNames(activeEvents);
            const owners = readInnateTreasureState().owners || {};
            const unclaimed = CONTESTABLE_INNATE_TREASURE_NAMES.filter(name => !owners[name]);
            if (!unclaimed.length) return { ok: false, reason: 'all_claimed' };
            const tianjiaoHeldNames = getTianjiaoHeldTreasureNames(data.weimiantianjiao_list);
            const available = unclaimed.filter(name => !tianjiaoHeldNames.has(name));
            if (!available.length) return { ok: false, reason: 'all_held' };
            if (available.every(name => activeTreasureNames.has(name))) {
                return { ok: false, reason: 'all_manifested' };
            }

            const result = await this.treasureAppearEvent(0, {
                excludeNames: activeTreasureNames,
                skipLuckyPlayer: true,
                random
            });
            if (!result?.eventData?.plane || !result.eventData.coordinate) {
                return { ok: false, reason: 'failed' };
            }

            const registered = registerTianjiTreasureEvent(config, activeEvents, result, invoker);
            if (!this.saveEventConfig(config)) return { ok: false, reason: 'failed' };
            return registered;
        } catch (error) {
            console.error('先天灵宝天机引动至宝失败:', error);
            return { ok: false, reason: 'failed' };
        }
        });
    }

    async broadcastEvent(message) {
        const settings = xiuxianConfig.getConfig('xiuxian', 'xiuxian') || {};
        const groups = settings.Era?.notifyGroups || [];
        let sent = 0;
        for (const groupId of groups) {
            try {
                // 官方号优先（纯官方群也能发），失败/未配置回退协议号
                await pushGroup(groupId, message);
                sent++;
            } catch (error) {
                console.error(`广播位面大事件到群${groupId}失败:`, error);
            }
        }
        return sent;
    }
    
    /** 根据时代获取可用事件类型 */
    getAvailableEvents(eraIndex) {
        // 所有事件类型
        const allEvents = ['treasure', 'merchant', 'war', 'prodigy', 'forbidden', 'legacy', 'worldChange', 'ruins', 'tianmoLegacy', 'coordinateClue', 'wenxianClue'];
        
        // 根据时代调整事件权重和可用性
        const eraWeights = {
            0: { treasure: 3, merchant: 2, prodigy: 2, worldChange: 3, tianmoLegacy: 1, coordinateClue: 2, wenxianClue: 1 }, // 神话时代：宝物多、灵气足
            1: { war: 3, forbidden: 2, prodigy: 2, treasure: 2, tianmoLegacy: 1, coordinateClue: 2, wenxianClue: 1 }, // 太古时代：万族争锋
            2: { legacy: 3, prodigy: 2, war: 2, merchant: 2, tianmoLegacy: 1, coordinateClue: 2, wenxianClue: 1 }, // 天命时代：传承现世
            3: { ruins: 3, war: 2, forbidden: 2, worldChange: 2, tianmoLegacy: 1, coordinateClue: 2, wenxianClue: 1 }, // 末法时代：遗迹求生
            4: { forbidden: 3, worldChange: 3, merchant: 2, ruins: 2, tianmoLegacy: 1, coordinateClue: 2, wenxianClue: 1 } // 绝灵时代：危机四伏
        };
        
        const weights = eraWeights[eraIndex] || eraWeights[2];
        
        // 构建加权事件列表
        let weightedEvents = [];
        for (const [event, weight] of Object.entries(weights)) {
            for (let i = 0; i < weight; i++) {
                weightedEvents.push(event);
            }
        }
        
        return weightedEvents.length > 0 ? weightedEvents : allEvents;
    }

    getEventDataType(eventType) {
        return {
            treasure: 'treasureAppear',
            merchant: 'merchantVisit',
            war: 'sectWar',
            prodigy: 'prodigyRise',
            forbidden: 'forbiddenZone',
            legacy: 'bingziLegacy',
            worldChange: 'worldChange',
            ruins: 'mysteriousRuins',
            tianmoLegacy: 'tianmoHuashengLegacy',
            coordinateClue: 'coordinateClue',
            wenxianClue: 'wenxianClue'
        }[eventType] || eventType;
    }

    getEventInteraction(eventOrType) {
        const event = typeof eventOrType === 'object' ? eventOrType : null;
        const type = event?.type || eventOrType;
        if (event?.interaction) return event.interaction;
        if (type === 'treasureAppear') return 'treasure';
        if (type === 'sectWar') return 'sectWar';
        if (type === 'bingziLegacy') return 'bingzi';
        if (type === 'merchantVisit' && ['白须仙翁', '黑衣神秘人', '绝美仙子'].includes(event?.merchant?.name)) return 'merchant';
        if (type === 'tianmoHuashengLegacy') return 'tianmo';
        if (type === 'coordinateClue') return 'coordinate';
        if (type === 'wenxianClue') return 'wenxian';
        return 'generic';
    }

    getEventParticipationCommand(event) {
        if (this.getEventInteraction(event) === 'treasure') return '#夺宝';
        if (this.getEventInteraction(event) === 'merchant') return `#${event.merchant.name}`;
        if (this.getEventInteraction(event) === 'sectWar') return '#圣战详情';
        if (this.getEventInteraction(event) === 'bingzi') return '#秦门兵图';
        if (this.getEventInteraction(event) === 'tianmo') return '#进入万相魔冢';
        if (this.getEventInteraction(event) === 'coordinate') {
            return `#探索位面线索 ${event.location}`;
        }
        if (this.getEventInteraction(event) === 'wenxian') return '#参悟问仙古碑';
        return '#参与位面大事件';
    }
    
    /** 获取事件历史 */
    getEventHistory(count = 10) {
        const config = this.readEventConfig();
        return config.eventHistory.slice(-count).reverse();
    }

    getActiveEvents(now = Date.now()) {
        const config = this.readEventConfig();
        const activeEvents = (config.activeEvents || []).filter(event =>
            !event.expiresAt || Number(event.expiresAt) > now ||
            hasPendingEventSettlement(event)
        );
        if (activeEvents.length !== (config.activeEvents || []).length) {
            config.activeEvents = activeEvents;
            this.saveEventConfig(config);
        }
        return activeEvents.filter(event => !event.expiresAt || Number(event.expiresAt) > now);
    }

    getTreasureContestEvents(includeSettled = false) {
        const config = this.readEventConfig();
        return (config.activeEvents || []).filter(event =>
            event.type === 'treasureAppear' && (includeSettled || hasPendingTreasureSettlement(event))
        );
    }

    getLatestTreasureContestEvent() {
        const active = this.getTreasureContestEvents(true);
        if (active.length) return active.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
        return this.getEventHistory(100).find(event => event.type === 'treasureAppear') || null;
    }

    _syncTreasureHistory(config, event) {
        const historyEvent = (config.eventHistory || []).find(item =>
            Number(item.timestamp) === Number(event.timestamp)
        );
        if (!historyEvent) return;
        historyEvent.contest = JSON.parse(JSON.stringify(event.contest));
        historyEvent.participantQqs = Object.keys(event.contest?.participants || {});
        if (event.contest?.winner) historyEvent.winner = event.contest.winner;
    }

    _ensureTreasureContest(event) {
        if (!event.contest || typeof event.contest !== 'object') {
            event.contest = createTreasureContest(event.treasure?.name, Number(event.timestamp) || Date.now());
        }
        if (!event.contest.participants || typeof event.contest.participants !== 'object') {
            event.contest.participants = {};
        }
        if (!Array.isArray(event.contest.rewardedQqs)) event.contest.rewardedQqs = [];
        return event.contest;
    }

    _findTreasureEvent(config, timestamp) {
        return (config.activeEvents || []).find(item =>
            item.type === 'treasureAppear' && Number(item.timestamp) === Number(timestamp)
        ) || null;
    }

    joinTreasureEvent(timestamp, qq, name, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findTreasureEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const contest = this._ensureTreasureContest(event);
        const result = joinTreasureContest(contest, qq, name, now);
        if (!result.ok) return result;
        event.participantQqs = Object.keys(contest.participants);
        this._syncTreasureHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    recordTreasureTrial(timestamp, qq, trial, options = {}, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findTreasureEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const contest = this._ensureTreasureContest(event);
        const result = performTreasureTrial(
            contest,
            event.treasure?.name,
            qq,
            trial,
            { ...options, now },
            options.random
        );
        if (!result.ok) return result;
        event.participantQqs = Object.keys(contest.participants);
        this._syncTreasureHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    setTreasureDaoHeart(timestamp, qq, choice, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findTreasureEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const contest = this._ensureTreasureContest(event);
        const result = placeTreasureDaoHeart(contest, qq, choice, now);
        if (!result.ok) return result;
        this._syncTreasureHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    settleTreasureEvent(timestamp, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findTreasureEvent(config, timestamp);
        if (!event) return { ok: false, reason: 'missing' };
        if (Number(event.expiresAt) > now) return { ok: false, reason: 'open', event };
        const contest = this._ensureTreasureContest(event);
        const result = settleTreasureContest(contest, event.treasure?.name, event.timestamp, now);
        if (!result.ok) return result;
        event.participantQqs = Object.keys(contest.participants || {});
        this._syncTreasureHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    markTreasureRewarded(timestamp, qq) {
        const config = this.readEventConfig();
        const event = this._findTreasureEvent(config, timestamp);
        if (!event) return false;
        const contest = this._ensureTreasureContest(event);
        if (contest.status !== 'settled') return false;
        const key = String(qq);
        if (!contest.rewardedQqs.includes(key)) contest.rewardedQqs.push(key);
        this._syncTreasureHistory(config, event);
        this.saveEventConfig(config);
        return true;
    }

    _ensureSectWar(event) {
        if (!event.sectWar || typeof event.sectWar !== 'object') {
            event.sectWar = createSectWarState({
                mode: 'mine',
                attacker: event.attacker || { name: '攻方圣地' },
                defender: event.defender || { name: '守方圣地' },
                timestamp: Number(event.timestamp) || Date.now()
            });
        }
        event.sectWar.participants ||= {};
        event.sectWar.decisionVotes ||= {};
        event.sectWar.clues ||= [];
        event.sectWar.actionLog ||= [];
        event.sectWar.supportLog ||= [];
        event.sectWar.rewardedQqs ||= [];
        return event.sectWar;
    }

    _findSectWarEvent(config, timestamp) {
        return (config.activeEvents || []).find(item =>
            item.type === 'sectWar' && Number(item.timestamp) === Number(timestamp)
        ) || null;
    }

    _syncSectWarHistory(config, event) {
        const historyEvent = (config.eventHistory || []).find(item =>
            item.type === 'sectWar' && Number(item.timestamp) === Number(event.timestamp)
        );
        if (!historyEvent) return;
        historyEvent.sectWar = JSON.parse(JSON.stringify(event.sectWar));
        historyEvent.participantQqs = Object.keys(event.sectWar?.participants || {});
    }

    getSectWarEvents(includeSettled = false) {
        const config = this.readEventConfig();
        return (config.activeEvents || []).filter(event =>
            event.type === 'sectWar' && (includeSettled || hasPendingSectWarSettlement(event))
        );
    }

    getLatestSectWarEvent() {
        const events = this.getSectWarEvents(true);
        if (events.length) return events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
        return this.getEventHistory(100).find(event => event.type === 'sectWar') || null;
    }

    getSectWarRankings(event) {
        return rankSectWar(event?.sectWar);
    }

    joinSectWar(timestamp, qq, name, side, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const war = this._ensureSectWar(event);
        if (war.status !== 'open') return { ok: false, reason: 'settled' };
        const allowedSides = war.mode === 'frontier'
            ? ['coalition', 'neutral']
            : ['attacker', 'defender', 'neutral'];
        if (!allowedSides.includes(side)) return { ok: false, reason: 'invalid_side' };
        const key = String(qq);
        if (war.participants[key]) return { ok: false, reason: 'duplicate', participant: war.participants[key] };
        war.participants[key] = {
            qq: key,
            name: name || `修士${key}`,
            side,
            contribution: 0,
            sourceStones: 0,
            supportCount: 0,
            actions: [],
            joinedAt: now
        };
        event.participantQqs = Object.keys(war.participants);
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return { ok: true, event, participant: war.participants[key] };
    }

    recordSectWarAction(timestamp, qq, action, options = {}, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const war = this._ensureSectWar(event);
        const participant = war.participants[String(qq)];
        const effect = SECT_WAR_ACTIONS[action];
        if (!participant) return { ok: false, reason: 'not_joined' };
        if (!effect) return { ok: false, reason: 'invalid_action' };
        if (participant.actions.length >= SECT_WAR_MAX_ACTIONS) return { ok: false, reason: 'limit' };
        if (participant.actions.some(item => item.name === action)) return { ok: false, reason: 'duplicate' };
        if (participant.side === 'neutral' && ['正面攻伐', '护送资源'].includes(action)) {
            return { ok: false, reason: 'side_restricted' };
        }

        const power = Math.max(1, Math.min(12, Math.round(Number(options.power) || 1)));
        const meterGains = {};
        for (const meter of ['military', 'supplies', 'truth', 'seal']) {
            const gain = Math.round((Number(effect[meter]) || 0) * power);
            meterGains[meter] = gain;
            war.meters[meter] = clampWarMeter((Number(war.meters[meter]) || 0) + gain);
        }
        const contribution = Math.max(1, Math.round((Number(effect.contribution) || 1) * power));
        participant.contribution += contribution;
        participant.actions.push({ name: action, contribution, at: now });
        war.scores[participant.side] = (Number(war.scores[participant.side]) || 0) + contribution;
        war.actionLog.push({ qq: String(qq), name: participant.name, side: participant.side, action, contribution, at: now });
        war.actionLog = war.actionLog.slice(-100);
        const newClues = revealSectWarClues(war);
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return { ok: true, event, participant, contribution, meterGains, newClues };
    }

    recordSectWarSupport(timestamp, qq, amount, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const war = this._ensureSectWar(event);
        const participant = war.participants[String(qq)];
        if (!participant) return { ok: false, reason: 'not_joined' };
        if (participant.supportCount >= SECT_WAR_MAX_SUPPORTS) return { ok: false, reason: 'limit' };
        amount = Math.trunc(Number(amount));
        if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 1e12) {
            return { ok: false, reason: 'invalid_amount' };
        }
        const contribution = Math.max(1, Math.min(30, Math.round(Math.log10(amount / 1000 + 1) * 6)));
        const supplies = Math.max(1, Math.round(contribution * 1.5));
        const seal = war.mode === 'frontier' ? Math.max(1, Math.round(contribution / 3)) : 0;
        const supportId = `${qq}:${now}:${war.supportLog.length}`;
        participant.sourceStones += amount;
        participant.supportCount += 1;
        participant.contribution += contribution;
        war.scores[participant.side] = (Number(war.scores[participant.side]) || 0) + contribution;
        war.meters.supplies = clampWarMeter(war.meters.supplies + supplies);
        war.meters.seal = clampWarMeter(war.meters.seal + seal);
        war.supportLog.push({ id: supportId, qq: String(qq), side: participant.side, amount, contribution, supplies, seal, at: now });
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return { ok: true, event, participant, supportId, contribution, supplies, seal };
    }

    rollbackSectWarSupport(timestamp, supportId) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event) return false;
        const war = this._ensureSectWar(event);
        const index = war.supportLog.findIndex(item => item.id === supportId);
        if (index < 0) return false;
        const support = war.supportLog[index];
        const participant = war.participants[support.qq];
        if (participant) {
            participant.sourceStones = Math.max(0, participant.sourceStones - support.amount);
            participant.supportCount = Math.max(0, participant.supportCount - 1);
            participant.contribution = Math.max(0, participant.contribution - support.contribution);
        }
        war.scores[support.side] = Math.max(0, (Number(war.scores[support.side]) || 0) - support.contribution);
        war.meters.supplies = clampWarMeter(war.meters.supplies - support.supplies);
        war.meters.seal = clampWarMeter(war.meters.seal - support.seal);
        war.supportLog.splice(index, 1);
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return true;
    }

    submitSectWarDecision(timestamp, qq, choice, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const war = this._ensureSectWar(event);
        const participant = war.participants[String(qq)];
        if (!participant) return { ok: false, reason: 'not_joined' };
        if (Number(war.meters.truth) < 50) return { ok: false, reason: 'truth_locked' };
        const choices = war.mode === 'frontier'
            ? ['强攻禁区', '稳固封印', '撤离伤员']
            : ['继续争夺', '停战查真', '联军攻禁区'];
        if (!choices.includes(choice)) return { ok: false, reason: 'invalid_choice' };
        war.decisionVotes[String(qq)] = choice;
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return { ok: true, event, choice };
    }

    settleSectWarEvent(timestamp, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event) return { ok: false, reason: 'missing' };
        if (Number(event.expiresAt) > now) return { ok: false, reason: 'open', event };
        const war = this._ensureSectWar(event);
        if (war.status === 'settled') return { ok: true, event, alreadySettled: true };

        const voteCounts = Object.values(war.decisionVotes).reduce((counts, choice) => {
            counts[choice] = (counts[choice] || 0) + 1;
            return counts;
        }, {});
        const decision = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        let outcome;
        if (war.mode === 'frontier') {
            const military = Number(war.meters.military) || 0;
            const supplies = Number(war.meters.supplies) || 0;
            const seal = Number(war.meters.seal) || 0;
            const success = decision === '强攻禁区'
                ? military >= 60 && seal >= 40
                : decision === '撤离伤员'
                    ? supplies >= 50 && seal >= 40
                    : seal >= 50 && supplies >= 30;
            outcome = success ? {
                type: 'frontier_success',
                title: decision === '撤离伤员' ? '联军护送众修士安全撤离' : '禁区裂缝被暂时镇封',
                summary: '血祭古坛被毁，联军守住了禁区外缘。',
                winnerSide: 'coalition',
                planeEffect: '禁区外缘暂时恢复平静',
                decision: decision || '稳固封印'
            } : {
                type: 'frontier_failure',
                title: '禁区裂缝冲破联军封锁',
                summary: '联军保住主力后撤，但禁区气息仍在外溢。',
                winnerSide: null,
                planeEffect: '遮天位面仍有禁区气息外溢',
                decision: decision || '稳固封印'
            };
        } else if (Number(war.meters.truth) >= 50 && ['停战查真', '联军攻禁区'].includes(decision)) {
            outcome = {
                type: decision === '联军攻禁区' ? 'forbidden_coalition' : 'ceasefire',
                title: decision === '联军攻禁区' ? '两大圣地结成禁区联军' : '双方停战共查封印',
                summary: decision === '联军攻禁区'
                    ? '争夺矿脉的兵锋转向禁区外缘，血战暂时止息。'
                    : '双方共同修补帝阵，神源龙脉免于崩毁。',
                winnerSide: 'coalition',
                planeEffect: decision === '联军攻禁区' ? '双方兵锋已经转向禁区外缘' : '神源龙脉的地下封印恢复稳定',
                decision
            };
        } else {
            const attackScore = Number(war.scores.attacker) || 0;
            const defendScore = Number(war.scores.defender) || 0;
            const winnerSide = attackScore === defendScore ? 'draw' : attackScore > defendScore ? 'attacker' : 'defender';
            const winnerName = winnerSide === 'draw' ? '双方' : war.sides[winnerSide]?.name;
            outcome = {
                type: winnerSide === 'draw' ? 'draw' : 'faction_victory',
                title: winnerSide === 'draw' ? '双方罢兵，矿脉暂归无主' : `${winnerName}控制神源龙脉`,
                summary: winnerSide === 'draw'
                    ? '双方伤亡惨重，只得各自退回山门。'
                    : `${winnerName}夺得矿权与外围帝阵控制权。`,
                winnerSide,
                planeEffect: '神源矿脉归属已经改变',
                decision: decision || '继续争夺'
            };
        }

        war.status = 'settled';
        war.settledAt = now;
        war.outcome = outcome;
        war.rankings = rankSectWar(war);
        event.participantQqs = Object.keys(war.participants);
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return { ok: true, event, outcome };
    }

    markSectWarRewarded(timestamp, qq) {
        const config = this.readEventConfig();
        const event = this._findSectWarEvent(config, timestamp);
        if (!event) return false;
        const war = this._ensureSectWar(event);
        if (war.status !== 'settled') return false;
        const key = String(qq);
        if (!war.rewardedQqs.includes(key)) war.rewardedQqs.push(key);
        this._syncSectWarHistory(config, event);
        this.saveEventConfig(config);
        return true;
    }

    _ensureBingziLegacy(event) {
        if (!event.bingzi || typeof event.bingzi !== 'object') {
            event.bingzi = createBingziLegacy(Number(event.timestamp) || Date.now());
        }
        event.bingzi.participants ||= {};
        event.bingzi.rankings ||= [];
        event.bingzi.rewardedQqs ||= [];
        return event.bingzi;
    }

    _findBingziEvent(config, timestamp) {
        return (config.activeEvents || []).find(item =>
            item.type === 'bingziLegacy' && Number(item.timestamp) === Number(timestamp)
        ) || null;
    }

    _syncBingziHistory(config, event) {
        const historyEvent = (config.eventHistory || []).find(item =>
            item.type === 'bingziLegacy' && Number(item.timestamp) === Number(event.timestamp)
        );
        if (!historyEvent) return;
        historyEvent.bingzi = JSON.parse(JSON.stringify(event.bingzi));
        historyEvent.participantQqs = Object.keys(event.bingzi?.participants || {});
    }

    _mutateBingziLegacy(timestamp, now, mutation) {
        const config = this.readEventConfig();
        const event = this._findBingziEvent(config, timestamp);
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const legacy = this._ensureBingziLegacy(event);
        if (legacy.status !== 'open') return { ok: false, reason: 'settled' };
        const result = mutation(legacy);
        event.participantQqs = Object.keys(legacy.participants);
        this._syncBingziHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    getBingziLegacyEvents(includeSettled = false) {
        const config = this.readEventConfig();
        return (config.activeEvents || []).filter(event =>
            event.type === 'bingziLegacy' && (includeSettled || hasPendingBingziSettlement(event))
        );
    }

    getLatestBingziLegacyEvent() {
        const events = this.getBingziLegacyEvents(true);
        if (events.length) return events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
        return this.getEventHistory(100).find(event => event.type === 'bingziLegacy') || null;
    }

    getBingziRankings(event) {
        return rankBingziLegacy(event?.bingzi);
    }

    traceBingziCaiClan(timestamp, qq, name, now = Date.now()) {
        return this._mutateBingziLegacy(timestamp, now, legacy =>
            traceCaiClan(legacy, qq, name, now)
        );
    }

    trackBingziMoonPrincess(timestamp, qq, now = Date.now()) {
        return this._mutateBingziLegacy(timestamp, now, legacy =>
            trackMoonPrincess(legacy, qq)
        );
    }

    recordBingziMountain(timestamp, qq, mountain, now = Date.now()) {
        return this._mutateBingziLegacy(timestamp, now, legacy =>
            identifyBingziMountain(legacy, qq, mountain)
        );
    }

    recordBingziObservation(timestamp, qq, insight, now = Date.now()) {
        return this._mutateBingziLegacy(timestamp, now, legacy =>
            observeBingziDiagram(legacy, qq, insight)
        );
    }

    recordBingziWeapon(timestamp, qq, weapon, now = Date.now()) {
        return this._mutateBingziLegacy(timestamp, now, legacy =>
            declareOnlyWeapon(legacy, qq, weapon, now)
        );
    }

    settleBingziLegacyEvent(timestamp, now = Date.now()) {
        const config = this.readEventConfig();
        const event = this._findBingziEvent(config, timestamp);
        if (!event) return { ok: false, reason: 'missing' };
        if (Number(event.expiresAt) > now) return { ok: false, reason: 'open', event };
        const legacy = this._ensureBingziLegacy(event);
        const result = settleBingziLegacy(legacy, now);
        event.participantQqs = Object.keys(legacy.participants);
        this._syncBingziHistory(config, event);
        this.saveEventConfig(config);
        return { ...result, event };
    }

    setBingziWinner(timestamp, winner) {
        const config = this.readEventConfig();
        const event = this._findBingziEvent(config, timestamp);
        if (!event) return false;
        const legacy = this._ensureBingziLegacy(event);
        if (legacy.status !== 'settled') return false;
        legacy.winner = winner ? { ...winner } : null;
        this._syncBingziHistory(config, event);
        this.saveEventConfig(config);
        return true;
    }

    markBingziRewarded(timestamp, qq) {
        const config = this.readEventConfig();
        const event = this._findBingziEvent(config, timestamp);
        if (!event) return false;
        const legacy = this._ensureBingziLegacy(event);
        if (legacy.status !== 'settled') return false;
        const key = String(qq);
        if (!legacy.rewardedQqs.includes(key)) legacy.rewardedQqs.push(key);
        this._syncBingziHistory(config, event);
        this.saveEventConfig(config);
        return true;
    }

    /** 获取仍在持续的指定事件 */
    getActiveEvent(type, now = Date.now()) {
        return this.getActiveEvents(now).find(event => event.type === type) || null;
    }

    markEventParticipated(timestamp, qq) {
        const config = this.readEventConfig();
        const now = Date.now();
        const event = (config.activeEvents || []).find(item =>
            Number(item.timestamp) === Number(timestamp)
        );
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        if (this.getEventInteraction(event) !== 'generic') return { ok: false, reason: 'specialized' };
        if (!Array.isArray(event.participantQqs)) event.participantQqs = [];
        if (event.participantQqs.includes(String(qq))) return { ok: false, reason: 'duplicate' };
        event.participantQqs.push(String(qq));

        const historyEvent = (config.eventHistory || []).find(item =>
            Number(item.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.participantQqs = [...event.participantQqs];
        this.saveEventConfig(config);
        return { ok: true, count: event.participantQqs.length };
    }

    claimMerchantItem(timestamp, stockNumber, qq, now = Date.now()) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'merchantVisit' && Number(item.timestamp) === Number(timestamp)
        );
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        const item = event.stock?.[Number(stockNumber) - 1];
        if (!item) return { ok: false, reason: 'invalid' };
        if (item.soldTo) return { ok: false, reason: 'sold' };
        item.soldTo = String(qq);
        item.soldAt = now;

        const historyEvent = (config.eventHistory || []).find(entry =>
            Number(entry.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.stock = JSON.parse(JSON.stringify(event.stock));
        this.saveEventConfig(config);
        return { ok: true, item: JSON.parse(JSON.stringify(item)) };
    }

    releaseMerchantItem(timestamp, stockNumber, qq) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'merchantVisit' && Number(item.timestamp) === Number(timestamp)
        );
        const item = event?.stock?.[Number(stockNumber) - 1];
        if (!item || item.soldTo !== String(qq)) return false;
        item.soldTo = null;
        item.soldAt = null;
        const historyEvent = (config.eventHistory || []).find(entry =>
            Number(entry.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.stock = JSON.parse(JSON.stringify(event.stock));
        this.saveEventConfig(config);
        return true;
    }

    claimFairyService(timestamp, qq, now = Date.now()) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'merchantVisit' &&
            item.merchant?.name === '绝美仙子' &&
            Number(item.timestamp) === Number(timestamp)
        );
        if (!event || Number(event.expiresAt) <= now) return { ok: false, reason: 'expired' };
        if (!Array.isArray(event.serviceQqs)) event.serviceQqs = [];
        if (event.serviceQqs.includes(String(qq))) return { ok: false, reason: 'claimed' };
        event.serviceQqs.push(String(qq));

        const historyEvent = (config.eventHistory || []).find(item =>
            Number(item.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.serviceQqs = [...event.serviceQqs];
        this.saveEventConfig(config);
        return { ok: true };
    }

    releaseFairyService(timestamp, qq) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'merchantVisit' &&
            item.merchant?.name === '绝美仙子' &&
            Number(item.timestamp) === Number(timestamp)
        );
        if (!event || !Array.isArray(event.serviceQqs)) return false;
        const oldLength = event.serviceQqs.length;
        event.serviceQqs = event.serviceQqs.filter(item => item !== String(qq));
        if (event.serviceQqs.length === oldLength) return false;

        const historyEvent = (config.eventHistory || []).find(item =>
            Number(item.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.serviceQqs = [...event.serviceQqs];
        this.saveEventConfig(config);
        return true;
    }

    markCoordinateClueClaimed(timestamp, qq) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'coordinateClue' && Number(item.timestamp) === Number(timestamp)
        );
        if (!event || Number(event.expiresAt) <= Date.now()) return false;
        if (!Array.isArray(event.claimedQqs)) event.claimedQqs = [];
        if (!event.claimedQqs.includes(String(qq))) event.claimedQqs.push(String(qq));
        this.saveEventConfig(config);
        return true;
    }

    markWenXianClueClaimed(timestamp, qq) {
        const config = this.readEventConfig();
        const event = (config.activeEvents || []).find(item =>
            item.type === 'wenxianClue' && Number(item.timestamp) === Number(timestamp)
        );
        if (!event || Number(event.expiresAt) <= Date.now()) return false;
        if (!Array.isArray(event.claimedQqs)) event.claimedQqs = [];
        if (!event.claimedQqs.includes(String(qq))) event.claimedQqs.push(String(qq));
        const historyEvent = (config.eventHistory || []).find(item =>
            item.type === 'wenxianClue' && Number(item.timestamp) === Number(timestamp)
        );
        if (historyEvent) historyEvent.claimedQqs = [...event.claimedQqs];
        this.saveEventConfig(config);
        return true;
    }
    
    /** 获取事件统计 */
    getEventStats() {
        const config = this.readEventConfig();
        const history = config.eventHistory;
        
        const stats = {
            total: history.length,
            byType: {}
        };
        
        for (const event of history) {
            if (!stats.byType[event.type]) {
                stats.byType[event.type] = 0;
            }
            stats.byType[event.type]++;
        }
        
        return stats;
    }
    
    /** 获取事件描述 */
    getEventTypeName(type) {
        const names = {
            treasureAppear: '先天灵宝出世',
            merchantVisit: '云游商人降临',
            sectWar: '圣地大战',
            prodigyRise: '天骄崛起',
            forbiddenZone: '禁区异动',
            emperorLegacy: '古帝传承现世',
            bingziLegacy: '秦门兵字秘传承',
            worldChange: '天地异变',
            mysteriousRuins: '神秘遗迹',
            tianmoHuashengLegacy: '万化天魔传承',
            coordinateClue: '位面坐标石壁',
            wenxianClue: '问仙古碑'
        };
        return names[type] || '未知事件';
    }
}

export default new RealmEvents();
