import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import { ensureDaoPath } from './wudaoRules.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
    normalizeReincarnationWay, getReincarnationStatus, getReincarnationStep,
    parseReincarnationBatch, planReincarnationCultivation,
    canControlLifeDeath, canAdvanceReincarnationEra, getReincarnationEraTarget,
} from '../../model/reincarnationWay.js';
import {
  existplayer,
  Write_player,
  Write_equipment,
  isNotNull,
  player_efficiency,
  get_random_fromARR,
  Read_player,
foundthing,
  Read_equipment,
  Add_HP,
   zd_battle,
  exist_najie_thing,
  Add_修为,
  Add_player_学习功法,
  bigNumberTransform,
  Add_血气,
  __PATH,
  Add_寿元,
  Add_najie_thing,
  dujie,
  LevelTask,
  get_log_img,
  channel,
  ForwardMsg,
  isXiuxianAdmin
} from '../../model/xiuxian.js';
import {
    getRealmAuthorityLevel,
    getRealmAuthorityName,
    getRealmAuthorityPath,
    hasRealmAuthority,
} from '../../model/realmAuthority.js';
import { getExtraCultivationLevelSum } from '../../model/extraCultivation.js';
import {
    bindOwnWayRoute,
    getOwnWayRealmGate,
} from '../../model/ownWayRealm.js';
import {
    getOwnWaySkillListType,
    validateOwnWaySkillDescription,
} from '../../model/ownWaySkill.js';
// 在玩家数据结构中添加轮回大道相关字段
const playerTemplate = {
    // ...其他字段
    轮回大道: {
        境界: "未入门", // 生死境初期、生死境中期、生死境后期、生死境大圆满、岁月境初期等
        生死境: {
            阶段: 0, // 0-3 对应初期到圆满
            进度: 0, // 当前阶段进度百分比
            掌控生死: 0, // 掌控生死的能力值
            突破寿元压制: 0, // 突破寿元压制的能力值
        },
        岁月境: {
            阶段: 0, // 0-3 对应初期到圆满
            进度: 0, // 当前阶段进度百分比
            掌控时间: 0, // 掌控时间的能力值
            改变时代: 0, // 改变时代的能力值
        },
        修炼记录: [] // 记录每次修炼
    }
};
  // 在文件顶部定义功法层级分类
const GONGFA_HIERARCHY = {
    "神慧者": 0,
    "仙帝法": 1,
    "仙王法": 2,
    "十凶宝术": 3,
    "帝经": 4,
    "九秘": 5,
    "盖世杀术": 5,
    "道与法": 6,
    "宝术": 6,
    "天赋": 7,
    "天魔法": 7,
    "命运法": 7,
    "修炼功法": 8,
    "炼器": 8,
    "技能": 8,
    "武学": 8,
    "限定功法": 0.5,
    "天帝经": 3.5
};
const aptitudeMap = {
'无化如是': 0,
'生而愚痴': 1,
'天弃之人': 2,
'先天不足': 3,
'平庸之资': 4,
'超凡资质': 5,
'天纵之资': 6,
'旷世奇才': 7,
'绝世天骄': 8,
'万古无双': 9,
'无演无尽': 10,
'岁云': 10,
};
// 天资等级序列
const aptitudeSequence = [
    '无化如是',      
    '生而痴傻',     
    '天弃之人',      
    '先天不足',      
    '平庸之资',      
    '超凡资质',      
    '天纵之资',     
    '旷世奇才',      
    '绝世天骄',      
    '万古无双',     
    '无演无尽'      
];

const OWN_WAY_CREATION_DURATION = 30 * 60 * 1000;
const OWN_WAY_CREATION_CULTIVATION = 1e12;
const OWN_WAY_CREATION_BLOOD = 1e12;
const OWN_WAY_CREATION_SAINT_KING_LAW = 1000;
const OWN_WAY_BASE_POTENTIAL_COST = 10;
const OWN_WAY_BASE_CULTIVATION_COST = 150000000;

// 自身之道的境界只允许在当前区间内修炼，达到上限后必须完成突破。
const OWN_WAY_REALM_RULES = Object.freeze([
    { index: 0, name: '道基·虚道', min: 0, max: 10, multiplier: 1, feature: '道基稳固' },
    { index: 1, name: '斩我·分支', min: 11, max: 30, multiplier: 2, feature: '分支显化' },
    { index: 2, name: '遁一·道域', min: 31, max: 60, multiplier: 4, feature: '自身道域' },
    { index: 3, name: '至尊·真意', min: 61, max: 100, multiplier: 8, feature: '大道真意' },
    { index: 4, name: '红尘仙·万世融道', min: 101, max: 150, multiplier: 16, feature: '万世融道' },
    { index: 5, name: '仙王·开界称尊', min: 151, max: 220, multiplier: 32, feature: '开界称尊' },
    { index: 6, name: '准仙帝·帝光映古', min: 221, max: 300, multiplier: 64, feature: '帝光映古' },
    { index: 7, name: '仙帝·道源唯一', min: 301, max: 400, multiplier: 128, feature: '道源唯一' },
    { index: 8, name: '祭道·祭尽诸我', min: 401, max: 500, multiplier: 256, feature: '祭尽诸我' },
]);

const OWN_WAY_RESOURCE_ALIASES = Object.freeze({
    '圣王法则': ['圣王法则', 'saintKingDao'],
    '玄虚': ['玄虚', '虚道', '虚道法则', 'mysteriousVoid'],
    '映照法则': ['映照法则', 'reflectionPrinciple'],
});

function getOwnWayRealmRule(index) {
    const normalized = Math.max(0, Math.min(OWN_WAY_REALM_RULES.length - 1, Math.trunc(Number(index) || 0)));
    return OWN_WAY_REALM_RULES[normalized];
}

function getOwnWayRealmByCount(count) {
    const normalized = Math.max(0, Math.trunc(Number(count) || 0));
    return OWN_WAY_REALM_RULES.find(rule => normalized <= rule.max) ||
        OWN_WAY_REALM_RULES[OWN_WAY_REALM_RULES.length - 1];
}

function getOwnWayCurrentRealm(player) {
    const count = Math.max(0, Math.trunc(Number(player?.修炼次数) || 0));
    const explicitIndex = Number(player?.自身之道阶段);
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < OWN_WAY_REALM_RULES.length) {
        const explicitRule = getOwnWayRealmRule(explicitIndex);
        if (count >= explicitRule.min - 1 && count <= explicitRule.max) return explicitRule;
    }
    return getOwnWayRealmByCount(count);
}

function getOwnWayCultivationCosts(realm) {
    const multiplier = Number(realm?.multiplier) || 1;
    return {
        potential: OWN_WAY_BASE_POTENTIAL_COST * multiplier,
        cultivation: OWN_WAY_BASE_CULTIVATION_COST * multiplier,
        blood: OWN_WAY_BASE_CULTIVATION_COST * multiplier,
    };
}

function getOwnWayResourceLocations(player, resourceName) {
    const aliases = OWN_WAY_RESOURCE_ALIASES[resourceName] || [resourceName];
    const locations = [];
    const containers = [
        { parent: player, keys: [resourceName] },
        { parent: player?.法则, keys: aliases },
        { parent: player?.道途?.stages, keys: aliases },
        { parent: player?.仙古道途?.stages, keys: aliases },
        { parent: player?.花粉道途?.stages, keys: aliases },
    ];
    for (const container of containers) {
        if (!container.parent || typeof container.parent !== 'object') continue;
        for (const key of container.keys) {
            if (!Object.prototype.hasOwnProperty.call(container.parent, key)) continue;
            const value = Number(container.parent[key]);
            if (Number.isFinite(value)) locations.push({ parent: container.parent, key, value: Math.max(0, value) });
        }
    }
    return locations;
}

function getOwnWayCreationCosts(player) {
    const route = getRealmAuthorityPath(player);
    const routeName = { mijing: '人体秘境', xiangu: '仙古今世法', huafen: '花粉进化路' }[route];
    const levelField = route === 'xiangu' ? 'xiangulevel_id' : route === 'huafen' ? 'huafenlevel_id' : 'mijinglevel_id';
    const routeLevel = Math.max(1, Math.trunc(Number(player?.[levelField]) || 1));
    const levelSum = getExtraCultivationLevelSum(player);
    return {
        route,
        routeName,
        routeLevel,
        levelSum,
        potential: 200 * levelSum,
        cultivation: OWN_WAY_CREATION_CULTIVATION,
        blood: OWN_WAY_CREATION_BLOOD,
        law: OWN_WAY_CREATION_SAINT_KING_LAW,
        lifeSource: 50,
    };
}

function getOwnWayCreationLaw(player) {
    const route = getRealmAuthorityPath(player);
    const resourceName = { mijing: '圣王法则', xiangu: '玄虚', huafen: '映照法则' }[route];
    const location = getOwnWayResourceLocations(player, resourceName)
        .sort((a, b) => b.value - a.value)[0] || null;
    return { route, name: resourceName, value: location?.value || 0, location };
}

export class daofa extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_daofa',
      dsc: '道与法模块',
      event: 'message',
      priority: 600,
      rule: [

                {
  reg: '^#创造自身之道(?:\\s+(.*))?$',  // 支持发起创建与等待结束后的无参结算
  fnc: 'createOwnWay',         
},
{
  reg: '^#修炼自身之道(?:\\*(\\d+))?$',  // 支持可选*数字后缀
  fnc: 'cultivateOwnWay',
}, 
{
  reg: '^#突破自身之道$',
  fnc: 'breakthroughOwnWay',
  dsc: '自身之道达到当前境界极限后进行突破',
},
{
  reg: '^#(?:编辑|修改)自身之道(?:技能)?描述(?:\\s+.*)?$',
  fnc: 'editOwnWaySkillDescription',
},
{
  reg: '^#同步自身之道技能$',
  fnc: 'syncOwnWaySkill',
},
    {
                    reg: '^#轮回大道$',
                    fnc: 'viewReincarnationWay',
                    dsc: '查看当前轮回大道境界'
                },
            {
                reg: '^#同步轮回大道$',
                fnc: 'syncReincarnationWay',
                dsc: '校准旧轮回大道字段，不扣资源'
            },
                {
                    reg: '^#修炼轮回大道(?:\\s*\\*.*)?$',
                    fnc: 'cultivateReincarnationWay',
                    dsc: '修炼轮回大道'
                },
                {
                    reg: '^#掌控生死(?:\\s+.*)?$',
                    fnc: 'controlLifeDeath',
                    dsc: '掌控目标玩家的生死（延长或缩短寿元）',
                },
                {
                    reg: '^#推进时代\\s+(\\d+)$',
                    fnc: 'advanceEra2',
                    dsc: '直接推进时代（岁月境大圆满可用）',
                },     
    {
    reg: '^#创造帝经\\s*(.*)$',
    fnc: 'createEmperorSutra',
    dsc: '炉养百经，开创属于自己的无上帝经'
}
      ],
    });
  }

async syncOwnWaySkillRecord(player, usr_qq, description = player.自身之道技能描述) {
    const skillName = String(player.自身之道名称 || '').trim();
    const wayType = String(player.自身之道类型 || '').trim();
    const listType = getOwnWaySkillListType(wayType);
    let skill = await this.getCustomSkill(skillName, listType);
    const repaired = !skill;
    skill ||= this.createOwnWaySkill(wayType, skillName, player.名号);
    if (!skill) return null;

    skill.创造者ID ||= String(usr_qq);
    skill.自身之道阶段 = Math.max(0, Number(player.自身之道阶段) || 0);
    skill.自身之道境界 = player.自身之道境界 || skill.自身之道境界;
    if (description) skill.desc = description;
    if (!await this.saveCustomSkill(skill, listType)) return null;

    if (!Array.isArray(player.学习的功法)) player.学习的功法 = [];
    if (!player.学习的功法.includes(skillName)) player.学习的功法.push(skillName);
    return { listType, repaired, skill };
}

async editOwnWaySkillDescription(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;
    const player = await Read_player(usr_qq);
    if (!player.已创自身之道 || !player.自身之道名称 || !player.自身之道类型) {
        return e.reply('你尚未开创自身之道，请先使用 #创造自身之道');
    }

    const input = String(e.msg || '')
        .replace(/^#(?:编辑|修改)自身之道(?:技能)?描述/, '')
        .trim();
    const validation = validateOwnWaySkillDescription(input);
    if (validation.reason === 'empty') return e.reply('格式：#编辑自身之道描述 [20字以内的描述]');
    if (validation.reason === 'multiline') return e.reply('技能描述只允许单行文本');
    if (validation.reason === 'too-long') return e.reply(`技能描述最多20字，当前${validation.length}字`);

    player.自身之道技能描述 = validation.description;
    const result = await this.syncOwnWaySkillRecord(player, usr_qq, validation.description);
    if (!result) return e.reply('自身之道技能保存失败，请稍后再试');
    await Write_player(usr_qq, player);
    return e.reply([
        `【自身之道·描述已更新】`,
        `技能：${player.自身之道名称}`,
        `描述：${validation.description}`,
        result.repaired ? `已补录至技能列表${result.listType}` : `已同步至技能列表${result.listType}`,
    ].join('\n'));
}

async syncOwnWaySkill(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;
    const player = await Read_player(usr_qq);
    if (!player.已创自身之道 || !player.自身之道名称 || !player.自身之道类型) {
        return e.reply('你尚未开创自身之道，请先使用 #创造自身之道');
    }
    const result = await this.syncOwnWaySkillRecord(player, usr_qq);
    if (!result) return e.reply('自身之道技能同步失败，请稍后再试');
    await Write_player(usr_qq, player);
    return e.reply(`【自身之道·技能同步】${player.自身之道名称}已${result.repaired ? '补录' : '刷新'}至技能列表${result.listType}。`);
}


// 检查玩家是否满足功法学习条件
async  checkGongfaRequirements(player) {
    // 获取所有功法数据
    const allGongfa = await data.gongfa_list;
    
    // 加载限定功法列表
    const timegongfa_list = await data.timegongfa_list;
    
    // 获取玩家自创帝经列表
    const customSutras = await data.dijingList;
    
    let validGongfaCount = 0; // 有效功法计数（类型1-7）
    
    // 遍历玩家已学习的功法
    if (player.学习的功法 && player.学习的功法.length > 0) {
        for (const gongfaName of player.学习的功法) {
            // 检查是否为玩家自创帝经
            const isCustomSutra = customSutras.some(item => item.name === gongfaName);
            if (isCustomSutra) {
                // 天帝经属于有效功法（层级3.5）
                validGongfaCount++;
                continue;
            }
            
            // 检查是否为限定功法
            const isTimeLimited = timegongfa_list.some(item => item.name === gongfaName);
            if (isTimeLimited) {
                // 限定功法层级0.5，不计入有效功法
                continue;
            }
            
            // 在全局功法数据中查找匹配的功法
            const gongfa = allGongfa.find(item => item.name === gongfaName);
            
            if (gongfa && gongfa.type) {
                // 获取功法层级
                const hierarchy = GONGFA_HIERARCHY[gongfa.type];
                
                // 检查是否为有效功法（层级1-7）
                if (hierarchy !== undefined && hierarchy >= 1 && hierarchy <= 7) {
                    validGongfaCount++;
                }
            }
        }
    }
    
    return validGongfaCount;
}
    async getReincarnationPlayerId(e) {
        const id = String(e.user_id || '').replace(/^qg_/, '');
        return String(await channel(id));
    }

    // 展示只读；旧字段补齐和名称校准不会在查询时改写玩家档案。
    async viewReincarnationWay(e) {
        if (!verc({ e })) return false;
        const usr_qq = await this.getReincarnationPlayerId(e);
        if (!await existplayer(usr_qq)) return e.reply('请先创建修仙角色。');
        const player = await Read_player(usr_qq);
        const { state, realm, current, entered, maxed } = getReincarnationStatus(player.轮回大道);
        const cost = getReincarnationStep(state);
        const message = [
            '【轮回大道·当前境界】',
            `境界：${state.境界}`,
            entered ? `${realm}进度：${current.进度.toFixed(1)}%${maxed ? '（已圆满封顶）' : ''}` : '需达到准帝或其他体系同等权柄方可修炼。',
        ];
        if (entered) {
            message.push(`掌控生死：${state.生死境.掌控生死.toFixed(2)}`,
                `突破寿元压制系数：${state.生死境.突破寿元压制.toFixed(2)}`);
            if (realm === '岁月境') message.push(
                `掌控时间：${state.岁月境.掌控时间.toFixed(2)}`,
                `改变时代系数：${state.岁月境.改变时代.toFixed(2)}`);
        }
        if (!maxed) message.push(
            `下次修炼：${bigNumberTransform(cost.cultivation)}修为 + ${bigNumberTransform(cost.lifespan)}年寿元，进度 +${cost.progress}%`,
            '指令：#修炼轮回大道 或 #修炼轮回大道*10（1～99次）',
            '跨阶段逐次计算消耗；批量资源不足则不扣费，满级自动停止。');
        if (canControlLifeDeath(state)) message.push('已解锁掌控生死：修仙管理员可用 #掌控生死 @QQ +年数 / -年数。');
        if (canAdvanceReincarnationEra(state)) message.push('已解锁时代推进：你可用 #推进时代 年数（1～10000，影响全服）；岁月境大圆满即可，无需进度100%。');
        message.push('生死境初期→中期→后期→大圆满→岁月境初期→中期→后期→大圆满100%。',
            '能力系数随境界同步；当前仅已接入上述主动指令，不代表已自动复活或自动增加寿元。',
            '旧档显示异常可用 #同步轮回大道 校准字段（不扣资源、不依据日志补发等级）。');
        await e.reply(message.join('\n'));
        return true;
    }

    async syncReincarnationWay(e) {
        if (!verc({ e })) return false;
        const usr_qq = await this.getReincarnationPlayerId(e);
        const message = await withPlayerMutationLock(usr_qq, async () => {
            if (!await existplayer(usr_qq)) return '请先创建修仙角色。';
            const player = await Read_player(usr_qq);
            const normalized = normalizeReincarnationWay(player.轮回大道);
            if (JSON.stringify(player.轮回大道) === JSON.stringify(normalized)) return `轮回大道数据正常：${normalized.境界}。`;
            player.轮回大道 = normalized;
            await Write_player(usr_qq, player);
            return `轮回大道字段已同步：${normalized.境界}。修为、寿元不变；未按旧修炼记录推算或补发境界。`;
        });
        await e.reply(message);
        return true;
    }

    async cultivateReincarnationWay(e) {
        if (!verc({ e })) return false;
        const count = parseReincarnationBatch(e.msg);
        if (count === null) return e.reply('用法：#修炼轮回大道 或 #修炼轮回大道*10，次数为1～99的整数。');
        const usr_qq = await this.getReincarnationPlayerId(e);
        const message = await withPlayerMutationLock(usr_qq, async () => {
            if (!await existplayer(usr_qq)) return '请先创建修仙角色。';
            // 锁内读最新档案，防止同时发两条修炼指令覆盖扣费与进度。
            const player = await Read_player(usr_qq);
            if (!hasRealmAuthority(player, 15)) {
                return `需达到准帝或其他体系同等权柄方可修炼轮回大道；当前权柄等级：${getRealmAuthorityLevel(player)}。`;
            }
            const result = planReincarnationCultivation(player, count);
            if (!result.ok) {
                if (result.reason === 'maxed') return '岁月境大圆满已达100%，轮回大道修炼已封顶，本次不扣资源。';
                if (result.reason === 'resources') return [
                    `批量修炼资源不足，本次未扣费（预计实际修炼 ${result.actualCount} 次）。`,
                    `需要：${bigNumberTransform(result.total.cultivation)}修为 + ${bigNumberTransform(result.total.lifespan)}年寿元`,
                    `持有：${bigNumberTransform(Number(player.修为))}修为 + ${bigNumberTransform(Number(player.寿元))}年寿元`,
                    '跨境界费用按每次当前阶段计算，可减少修炼次数。',
                ].join('\n');
                if (result.reason === 'precision') return '资源数值超出当前数值精度，暂缓扣费，请先核对存档资源格式。';
                return '修炼参数或资源字段异常，本次未扣费，请先核对角色数据。';
            }
            player.修为 = result.cultivationAfter;
            player.寿元 = result.lifespanAfter;
            player.轮回大道 = result.state;
            await Write_player(usr_qq, player);
            const status = getReincarnationStatus(result.state);
            return [
                '【轮回大道·精进修炼】',
                `实际修炼：${result.actualCount}/${result.requestedCount}次`,
                `消耗：${bigNumberTransform(result.total.cultivation)}修为 + ${bigNumberTransform(result.total.lifespan)}年寿元`,
                `境界：${result.beforeRealm} → ${result.afterRealm}`,
                `当前进度：${status.current.进度.toFixed(1)}%`,
                `掌控生死：${result.state.生死境.掌控生死.toFixed(2)}；寿元压制系数：${result.state.生死境.突破寿元压制.toFixed(2)}`,
                ...(status.realm === '岁月境' ? [`掌控时间：${result.state.岁月境.掌控时间.toFixed(2)}；改变时代系数：${result.state.岁月境.改变时代.toFixed(2)}`] : []),
                ...(result.stageUp ? ['境界提升，能力系数已同步。'] : []),
                ...(result.maxed ? ['岁月境大圆满100%，已封顶；未执行的修炼次数不收费。'] : []),
            ].join('\n');
        });
        await e.reply(message);
        return true;
    }

    getReincarnationCost(reincarnation) {
        return getReincarnationStep(reincarnation).cultivation;
    }

    getProgressPerCultivation(reincarnation) {
        return getReincarnationStep(reincarnation).progress;
    }

    updateReincarnationAbilities(reincarnation) {
        Object.assign(reincarnation, normalizeReincarnationWay(reincarnation));
    }

    // 修仙管理员（主人 / Master / 本群群主或群主授权）可调用；进入岁月境后不再丢失生死境已解锁权限。
    async controlLifeDeath(e) {
        if (!isXiuxianAdmin(e)) return e.reply('此指令仅限修仙管理员。');
        if (!verc({ e })) return false;
        const match = /^#掌控生死\s+@?(\d+)\s+([+-]?\d+)$/.exec(String(e.msg || ''));
        const mentioned = typeof e.at === 'object' ? e.at?.qq || e.at?.user_id : e.at;
        const targetRaw = mentioned || match?.[1];
        const amountText = match?.[2] || (mentioned ? /^#掌控生死\s+([+-]?\d+)$/.exec(String(e.msg || '').trim())?.[1] : undefined);
        const years = Number(amountText);
        if (!targetRaw || !/^\d+$/.test(String(targetRaw)) || !Number.isSafeInteger(years) || years === 0) {
            return e.reply('用法：#掌控生死 @QQ +年数 或 -年数；年数应为非零整数。');
        }
        const usr_qq = await this.getReincarnationPlayerId(e);
        if (!await existplayer(usr_qq)) return e.reply('请先创建修仙角色。');
        const player = await Read_player(usr_qq);
        if (!canControlLifeDeath(player.轮回大道)) return e.reply('需达到生死境大圆满或更高境界才能掌控生死。');
        const targetQQ = String(await channel(String(targetRaw)));
        const message = await withPlayerMutationLock(targetQQ, async () => {
            if (!await existplayer(targetQQ)) return '目标角色不存在。';
            const targetPlayer = await Read_player(targetQQ);
            const current = Number(targetPlayer.寿元);
            const next = Math.max(0, current + years);
            if (!Number.isFinite(current) || current < 0 || !Number.isFinite(next) || next === current) {
                return '目标寿元字段或计算精度异常，未修改存档。';
            }
            targetPlayer.寿元 = next;
            await Write_player(targetQQ, targetPlayer);
            return `【生死掌控·轮回大道】\n目标玩家：${targetPlayer.名号}\n寿元变化：${next - current}年\n当前寿元：${next}年`;
        });
        await e.reply(message);
        return true;
    }

    async getReincarnationEraManager() {
        const { EraChangeTask } = await import('../tasks/EraChangeTask.js');
        return new EraChangeTask();
    }

    // 不写孤立的 Era.yaml，不凭空使用 this.eras；交给既有世界时代管理器处理迁移副作用。
    async advanceEra2(e) {
        if (!verc({ e })) return false;
        const match = /^#推进时代\s+(\d+)$/.exec(String(e.msg || ''));
        const years = Number(match?.[1]);
        if (!Number.isSafeInteger(years) || years < 1 || years > 10000) return e.reply('用法：#推进时代 年数，每次为1～10000的整数年。');
        const usr_qq = await this.getReincarnationPlayerId(e);
        if (!await existplayer(usr_qq)) return e.reply('请先创建修仙角色。');
        const player = await Read_player(usr_qq);
        if (!canAdvanceReincarnationEra(player.轮回大道)) return e.reply('需达到岁月境大圆满才能推进时代。');
        const manager = await this.getReincarnationEraManager();
        try {
            return await manager.advanceReincarnationEra({
                playerId: usr_qq, years, reply: (...args) => e.reply(...args),
            });
        } catch (error) {
            if (['queue_full', 'wait_timeout'].includes(error?.code)) {
                return e.reply('当前正在结算其他时代请求，请稍后再试；本次未开始推进。');
            }
            throw error;
        }
    }


async  createOwnWay(e) {
    try {
        if (!e.isGroup) {
            e.reply('请在群聊中创造自身之道');
            return true;
        }

        const usr_qq = e.user_id.toString().replace('qg_', '');
        const player = await Read_player(usr_qq);

        const actionKey = `xiuxian:player:${usr_qq}:action`;
        const actionRaw = await redis.get(actionKey);
        let pendingCreation = null;
        if (actionRaw) {
            try {
                const action = JSON.parse(actionRaw);
                const storedEndTime = Number(action?.end_time) || (
                    String(action?.Place_actionplus) === '0'
                        ? (Number(action.start_time) || 0) + (Number(action.total_time) || 0) * 60000
                        : 0
                );
                const actionEndTime = action?.action === '创造自身之道'
                    ? Math.max(
                        storedEndTime,
                        (Number(action.start_time) || 0) + OWN_WAY_CREATION_DURATION
                    )
                    : storedEndTime;
                if (action?.action === '创造自身之道') {
                    const endTime = actionEndTime;
                    if (endTime > Date.now()) {
                        const remainingMs = endTime - Date.now();
                        const minutes = Math.floor(remainingMs / 60000);
                        const seconds = Math.floor((remainingMs % 60000) / 1000);
                        return e.reply([
                            `【自身之道·开创中】`,
                            `你正在以${action.creation?.wayName || '未命名大道'}熔炼万法，尚需等待至少30分钟。`,
                            `剩余时间：${minutes}分${seconds}秒`,
                            '请等待修仙状态结束后再次发送#创造自身之道完成结算。'
                        ].join('\n'));
                    }

                    pendingCreation = action.creation || null;
                } else if (actionEndTime > Date.now()) {
                    const remainingMs = actionEndTime - Date.now();
                    const minutes = Math.floor(remainingMs / 60000);
                    const seconds = Math.floor((remainingMs % 60000) / 1000);
                    return e.reply([
                        `你正在${action.action || '其他行动'}中，暂不能开创自身之道。`,
                        `剩余时间：${minutes}分${seconds}秒`
                    ].join('\n'));
                }
            } catch (error) {
                console.warn(`[自身之道] 读取修仙状态失败：${error.message}`);
            }
        }
        
        // 检查冷却时间
        if (player.大道冷却时间 && player.大道冷却时间 > Date.now()) {
            const remainingHours = Math.ceil((player.大道冷却时间 - Date.now()) / (60 * 60 * 1000));
            return e.reply([
                `「大道反噬未愈！」`,
                `开创大道失败后需调息恢复`,
                `剩余冷却时间：${remainingHours}小时`,
                `请耐心等待`
            ].join('\n'));
        }

        // === 前置条件检查 ===
        // 生命本源检查
        if (player.生命本源 < 50) {
            return e.reply([
                `「生命本源亏损！」`,
                `开创大道需消耗生命本源`,
                `当前生命本源：${player.生命本源}`,
                `需至少50点生命本源`,
                `可通过 #修复生命本源 或服用神药恢复`
            ].join('\n'));
        }
        
        // 道伤检查
        if (player.道伤 > 0) {
            return e.reply([
                `「身负道伤，难证大道！」`,
                `大道伤痕会阻碍你与天地大道的共鸣`,
                `当前道伤：${player.道伤}`,
                `请先使用 #修复道伤 或服用神药修复大道伤痕`
            ].join('\n'));
        }
        
        // 顶级功法检查
        const topGongfaList = [
            "行字秘", "皆字秘", "斗字秘", "者字秘", "临字秘", 
            "兵字秘", "数字秘", "组字秘", "前字秘", "六道轮回拳", 
            "一气化三清", "霸拳真解", "天庭杀生大术", "无始术","斩我明道诀",
            "天帝拳", "飞仙诀", "万化圣诀", "妖帝九斩",
            "真龙宝术", "草字剑诀","平乱诀","仙劫剑诀",
            "真龙宝术","真凰宝术","天角蚁宝术","麒麟宝术","鲲鹏宝术","蛄之宝术","九幽獓宝术","打神石宝术"
        ];
        
        // 计算玩家掌握的顶级功法数量
        const learnedTopGongfa = topGongfaList.filter(gongfa =>
            player.学习的功法?.includes(gongfa)
        );
        const learnedCount = learnedTopGongfa.length;
        
        if (learnedCount < 6) {
            return e.reply([
                `「未掌握足够顶级功法！」`,
                `开创自身之道需至少掌握六种顶级功法`,
                `你当前掌握顶级功法：${learnedCount}种`,
                `已掌握功法：${learnedTopGongfa.join('、') || '无'}`,
                `顶级功法列表：${topGongfaList.join('、')}`,
                `请继续参悟顶级功法`
            ].join('\n'));
        }
        
        // 有效功法数量检查
        const validGongfaCount = await this.checkGongfaRequirements(player);
        if (validGongfaCount < 30) {
            return e.reply([
                `「欲创自身大道，需炉养百经！」`,
                `你当前研习有效功法：${validGongfaCount}部`,
                `开创无上大道需研习至少30部无上功法`,
                `请继续参悟更多高深功法！`
            ].join('\n'));
        }
        
        // 检查玩家是否已有自身之道
        if (player.已创自身之道) {
            return e.reply([
                `你已开创无上大道【${player.自身之道名称}】！`,
                `修士一生只能开创一条属于自己的大道`,
                `此乃天地法则所限，无法更改`
            ].join('\n'));
        }
        
        // 创建与后续突破都只认玩家选定的三大额外体系，伴生体系不能代替主修境界。
        const creationRealmGate = getOwnWayRealmGate(player, 0);
        if (!creationRealmGate.ok) {
            const currentRealm = getRealmAuthorityName(
                player,
                data.Levelmijing_list,
                data.xiangujinshi_list,
                data.huafen_list,
            );
            return e.reply([
                `欲创自身大道，需主修体系达到圣人王级权柄！`,
                `当前主修境界：${currentRealm}（${creationRealmGate.field}=${creationRealmGate.currentRealmId}）`,
                `尚缺：${creationRealmGate.missing.join('、')}`,
                `人体秘境、仙古今世法与花粉进化路分别校验自己的实际境界。`
            ].join('\n'));
        }

        // 指令解析；等待结束后的结算优先使用行动中保存的参数。
        let wayType;
        let wayName;
        if (pendingCreation) {
            wayType = pendingCreation.wayType;
            wayName = pendingCreation.wayName;
        } else {
            const match = String(e.msg || '').match(/^#创造自身之道\s+(\S+)\s+(.*)$/);
            if (!match) {
                return e.reply([
                    '指令格式错误！',
                    '正确格式：#创造自身之道 [大道类型] [大道名称]',
                    '大道类型：攻伐、护体、涅槃、时空、轮回、因果、封禁',
                    '示例：#创造自身之道 攻伐 杀伐剑道'
                ].join('\n'));
            }
            wayType = match[1];
            wayName = match[2].trim();
        }

        if (typeof wayType !== 'string' || typeof wayName !== 'string' || !wayName) {
            return e.reply('自身之道行动数据异常，请重新发送完整指令：#创造自身之道 [大道类型] [大道名称]');
        }
        
        // 验证类型
        const validTypes = ['攻伐', '护体', '涅槃', '时空', '轮回', '因果', '封禁'];
        if (!validTypes.includes(wayType)) {
            return e.reply(`无效的大道类型！请选择：${validTypes.join('、')}`);
        }
        
        // 检查名称长度
        if (wayName.length > 10) {
            return e.reply('大道名称过长，请控制在10字以内');
        }
        
        // 检查是否已有同名功法
        if (player.学习的功法?.includes(wayName)) {
            return e.reply(`你已掌握【${wayName}】，无需再创`);
        }
        
        // 创建资源按当前主修体系与三体系有效等级计算。
        const creationCosts = getOwnWayCreationCosts(player);
        const creationLaw = getOwnWayCreationLaw(player);
        const currentPotential = Number(player.仙道潜力) || 0;
        const currentCultivation = Number(player.修为) || 0;
        const currentBlood = Number(player.血气) || 0;
        if (currentPotential < creationCosts.potential) {
            return e.reply([
                `开创自身大道需要大量仙道潜力！`,
                `当前仙道潜力：${currentPotential.toLocaleString()}`,
                `所需仙道潜力：${creationCosts.potential.toLocaleString()}（200×三体系有效等级${creationCosts.levelSum}）`,
                `当前主修：${creationCosts.routeName}${creationCosts.routeLevel}级`,
                `请继续积累仙道潜力再试`
            ].join('\n'));
        }
        if (currentCultivation < creationCosts.cultivation) {
            return e.reply([
                `开创大道需消耗海量修为！`,
                `你当前修为：${bigNumberTransform(currentCultivation)}`,
                `所需修为：${bigNumberTransform(creationCosts.cultivation)}`,
                `请继续积累修为再试`
            ].join('\n'));
        }
        if (currentBlood < creationCosts.blood) {
            return e.reply([
                `开创大道需消耗海量血气！`,
                `你当前血气：${bigNumberTransform(currentBlood)}`,
                `所需血气：${bigNumberTransform(creationCosts.blood)}`,
                `请继续积累血气再试`
            ].join('\n'));
        }
        if (creationLaw.value < creationCosts.law) {
            return e.reply([
                `${creationLaw.name}不足，尚不足以承载自身大道！`,
                `当前${creationLaw.name}：${creationLaw.value.toLocaleString()}`,
                `至少需要：${creationCosts.law.toLocaleString()}`,
                `请先参悟并积累足够的${creationLaw.name}`
            ].join('\n'));
        }

        // 首次执行只开启行动，等待结束后再次执行才会真正结算。
        if (!pendingCreation) {
            const now = Date.now();
            const endTime = now + OWN_WAY_CREATION_DURATION;
            const action = {
                action: '创造自身之道',
                start_time: now,
                end_time: endTime,
                time: OWN_WAY_CREATION_DURATION,
                creation: {
                    wayType,
                    wayName,
                    costs: creationCosts,
                },
                // 与统一修仙状态兼容：闭关状态开启，其他行动全部锁定。
                plant: '1',
                shutup: '0',
                working: '1',
                Place_action: '1',
                Place_actionplus: '1',
                power_up: '1',
                mojie: '1',
                xijie: '1',
            };
            if (e.isGroup) action.group_id = e.group_id;
            await redis.set(actionKey, JSON.stringify(action));
            return e.reply([
                `【自身之道·开创开始】`,
                `${player.名号}已开始熔炼万法，准备开创【${wayName}】。`,
                `修仙状态：创造自身之道（至少30分钟）`,
                `主修体系：${creationCosts.routeName}${creationCosts.routeLevel}级`,
                `结算消耗：仙道潜力${creationCosts.potential.toLocaleString()}、修为与血气各${bigNumberTransform(creationCosts.cultivation)}、${creationLaw.name}${creationCosts.law}`,
                `预计结束：${new Date(endTime).toLocaleString()}`,
                `请等待状态结束后再次发送#创造自身之道完成结算。`
            ].join('\n'));
        }
        
  // === 天资成功率计算 ===
    // 获取天资等级字符串
    const aptitudeStr = player.天资等级 || "无化如是";
    
    // 使用映射表转换为数字等级
    let aptitudeLevel = aptitudeMap[aptitudeStr];
    
    // 如果找不到对应等级，设为0
    if (aptitudeLevel === undefined) {
        console.warn(`未知的天资等级：${aptitudeStr}，已设为0`);
        aptitudeLevel = 0;
    }
    
    // 确保在有效范围内
    if (aptitudeLevel < 0) aptitudeLevel = 0;
    if (aptitudeLevel >= aptitudeSequence.length) {
        aptitudeLevel = aptitudeSequence.length - 1;
        console.warn(`天资等级过高：${aptitudeStr}，已设为最大值 ${aptitudeLevel}`);
    }
    
    const aptitudeName = aptitudeSequence[aptitudeLevel] || '未知';
        
        // 基础成功率
        let baseSuccessRate = 0.1; // 10%
        
        // 天资加成
        const aptitudeBonus = aptitudeLevel * 0.1; // 每级天资增加10%成功率
        const successRate = Math.min(1, baseSuccessRate + aptitudeBonus);
        
        // 构建成功率消息
        const successMsg = [
            `【天资影响】`,
            `当前天资：${aptitudeName}（${aptitudeLevel}级）`,
            `基础成功率：${(baseSuccessRate * 100).toFixed(0)}%`,
            `天资加成：+${(aptitudeBonus * 100).toFixed(0)}%`,
            `最终成功率：${(successRate * 100).toFixed(0)}%`
        ].join('\n');
        await e.reply(successMsg);
        
        // 进行成功率判定
        const rand = Math.random();
        if (rand > successRate) {
            // 开创失败
            const failureMessages = [
                `「大道难证！」`,
                `开创【${wayName}】失败！`,
                `天资不足，未能证得大道真谛`,
                ``,
                `失败惩罚：`,
                `- 修为损失：${bigNumberTransform(creationCosts.cultivation * 0.5)}`,
                `- 血气损失：${bigNumberTransform(creationCosts.blood * 0.5)}`,
                `- 3小时内无法再次尝试`
            ];
            
            // 扣除部分资源
            player.修为 = Math.max(0, player.修为 - creationCosts.cultivation * 0.5);
            player.血气 = Math.max(0, player.血气 - creationCosts.blood * 0.5);
            
            // 添加冷却时间（3小时）
            player.大道冷却时间 = Date.now() + 3 * 60 * 60 * 1000;
            
            // 保存玩家数据
            await Write_player(usr_qq, player);
            await redis.del(actionKey);
            
            return e.reply(failureMessages.join('\n'));
        }
        
        // 根据类型创建技能对象
        const newWaySkill = this.createOwnWaySkill(wayType, wayName, player.名号);
        if (!newWaySkill) {
            return e.reply('未能生成对应的自身之道技能，请稍后重试');
        }
        newWaySkill.自身之道阶段 = 0;
        newWaySkill.自身之道境界 = OWN_WAY_REALM_RULES[0].name;
        
        // 创建对应的帝经对象
        const newSutra = {
            id: Date.now(), // 唯一ID
            name: wayName,
            class: "功法",
            type: "道与法",
            修炼加成: 5,      // 基础修炼速度+5%
            出售价: 180000000, // 1.8亿灵石
            创造者: player.名号,
            创造者ID: usr_qq,
            创造时间: new Date().toLocaleString(),
            关联技能: newWaySkill.name // 建立关联关系
        };
        
        // 根据类型保存到不同的技能列表
        const saveResult = await this.saveCustomSkill(newWaySkill, this.getListTypeByWayType(wayType));
        
        if (!saveResult) {
            return e.reply('保存大道失败，请稍后再试');
        }
        
        // 保存帝经
        await this.saveCustomSutra(newSutra);
        
        // 扣除资源
        player.修为 -= creationCosts.cultivation;
        player.血气 -= creationCosts.blood;
        player.仙道潜力 = currentPotential - creationCosts.potential;
        creationLaw.location.parent[creationLaw.location.key] = creationLaw.value - creationCosts.law;
        player.生命本源 -= creationCosts.lifeSource; // 扣除生命本源
        
        // 添加到玩家功法列表
        player.学习的功法 = player.学习的功法 || [];
        player.学习的功法.push(wayName);
        
        // 添加创造记录
        player.自身之道创造 = player.自身之道创造 || [];
        player.自身之道创造.push({
            时间: new Date().toLocaleString(),
            大道名称: wayName,
            大道类型: wayType,
            消耗修为: creationCosts.cultivation,
            消耗血气: creationCosts.blood,
            消耗仙道潜力: creationCosts.potential,
            消耗法则: `${creationLaw.name}×${creationCosts.law}`,
            主修体系: creationCosts.routeName,
            主修体系标识: creationCosts.route,
            消耗生命本源: creationCosts.lifeSource
        });
        
        // 标记已创自身之道
        player.已创自身之道 = true;
        player.自身之道名称 = wayName;
        player.自身之道类型 = wayType;
        player.自身之道阶段 = 0;
        player.自身之道境界 = OWN_WAY_REALM_RULES[0].name;
        player.自身之道体系 = bindOwnWayRoute(player, creationCosts.route);
        player.修炼次数 = Number(player.修炼次数) || 0;

        await Write_player(usr_qq, player);
        await redis.del(actionKey);
        
        // 生成大道创造文案
        const creationText = this.generateWayCreationText(player.名号, wayName, wayType);
        
        e.reply(creationText);
        return true;
    } catch (error) {
        console.error("开创自身之道出错:", error);
        e.reply("开创自身之道过程中发生未知错误");
        return true;
    }
}

// 创建攻伐技能
createAttackSkill(name, creator) {
    return {
        name: name,
        class: "功法",
        pr: 0.05, // 5%触发概率
        cnt: -1,  // 无冷却限制
        beilv: 1, // 1倍基础倍率
        other: 0,
        msg1: `${creator}施展自身开创的【${name}】，`,
        msg2: `被${name}的无上威能重创！`,
        稀有度: 2, // 自定义标识
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: "攻伐"
    };
}

// 创建防御技能
createDefenseSkill(name, creator) {
    return {
        name: name,
        class: "功法",
        pr: 0.05, // 5%触发概率
        cnt: -1,  // 无冷却限制
        beilv: -0.1, // 初始防御倍率（负值表示减伤）
        other: 0,
        msg1: `${creator}施展【${name}】，周身浮现大道符文！`,
        msg2: `的攻击被${name}的无上护体真法化解！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: "护体",
        反弹伤害: 0.1, // 初始反弹比例
        优先级: 3
    };
}

// 创建保命技能
createSurvivalSkill(name, creator) {
    return {
        name: name,
        class: "功法",
        pr: 0.05, // 100%触发（当满足条件时）
        cnt: -1,  // 无冷却限制（可调整）
        msg1: `${creator}施展【${name}】，大道本源护体！`,
        msg2: `从死亡边缘涅槃归来，恢复部分状态！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: "涅槃",
        复活技能: 1,
        恢复比例: 0.5, // 初始恢复比例
        免控: 1,      // 初始免控回合
        攻击加成: 0,   // 初始攻击加成
        防御加成: 0,   // 初始防御加成
        生命加成: 0    // 初始生命加成
    };
}

// 创建可复用的自身之道技能对象。轮回进入复活技能列表，其余类型进入攻击技能列表。
createOwnWaySkill(wayType, name, creator) {
    switch (wayType) {
        case '攻伐':
            return this.createAttackSkill(name, creator);
        case '护体':
            return this.createDefenseSkill(name, creator);
        case '涅槃':
            return this.createSurvivalSkill(name, creator);
        case '时空':
            return this.createSpaceTimeSkill(name, creator);
        case '轮回':
            return this.createReincarnationSkill(name, creator);
        case '因果':
            return this.createCausalitySkill(name, creator);
        case '封禁':
            return this.createSealSkill(name, creator);
        default:
            return null;
    }
}

// 时空道：加速自身、推迟对手，形成行动顺序优势。
createSpaceTimeSkill(name, creator) {
    return {
        name,
        class: '功法',
        pr: 0.05,
        cnt: -1,
        beilv: 1,
        other: 0,
        msg1: `展开【${name}】，时空长河在脚下倒卷！`,
        msg2: `被时空乱流拖慢，攻势出现断层！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: '时空',
        拉条: 100,
        推条: 80,
        速度加成: 0.05
    };
}

// 轮回道：以濒死复生为核心，沿用战斗引擎已有的自创复活判定。
createReincarnationSkill(name, creator) {
    return {
        name,
        class: '功法',
        pr: 0.05,
        cnt: -1,
        msg1: `催动【${name}】，轮回门在身后缓缓开启！`,
        msg2: `真灵坠入轮回又归来，重燃生机！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: '轮回',
        复活技能: 1,
        恢复比例: 0.2,
        免控: 1,
        免控类型: ['轮回隔世'],
        攻击加成: 0.15,
        防御加成: 0.15,
        生命加成: 0,
        轮回印: 1
    };
}

// 因果道：伤害落下时留下延迟反噬，强化“先种因、后收果”。
createCausalitySkill(name, creator) {
    return {
        name,
        class: '功法',
        pr: 0.05,
        cnt: -1,
        beilv: 1.1,
        other: 0,
        msg1: `拨动【${name}】，因果丝线缠上对手命数！`,
        msg2: `承受因果反噬，伤势将在未来回响！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: '因果',
        负面效果: true,
        负面回合: 2,
        负面类型: '因果反噬',
        因果印记: 1
    };
}

// 封禁道：以控制和推条为主，短暂截断对手施法节奏。
createSealSkill(name, creator) {
    return {
        name,
        class: '功法',
        pr: 0.05,
        cnt: -1,
        beilv: 0.8,
        other: 0,
        msg1: `结出【${name}】，万道锁链封住虚空！`,
        msg2: `周身法则被封，暂时无法行动！`,
        稀有度: 2,
        创造者: creator,
        创造时间: new Date().toLocaleString(),
        效果类型: '封禁',
        控制: 1,
        推条: 120
    };
}

// 保存自定义技能到指定列表
async saveCustomSkill(skill, listType) {
  try {
    const lib_path = data.lib_path;
    const fileName = `技能列表${listType}.json`;
    const filePath = path.join(lib_path, '技能列表', fileName);
    
    console.log(`技能保存路径: ${filePath}`);

    // 确保目录存在
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // 确保文件存在
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf8');
      console.log(`初始化空的技能列表文件: ${fileName}`);
    }

    // 读取现有技能
    let skillList = [];
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      skillList = JSON.parse(fileContent);
      
      if (!Array.isArray(skillList)) {
        console.warn('技能列表格式错误，重置为空数组');
        skillList = [];
      }
    } catch (error) {
      console.error('读取技能列表失败:', error);
    }

    // 检查同名技能
    const existingIndex = skillList.findIndex(s => s.name === skill.name);
    if (existingIndex !== -1) {
      skillList[existingIndex] = skill; // 更新
      console.log(`更新已有技能: ${skill.name}`);
    } else {
      skillList.push(skill); // 新增
      console.log(`添加新技能: ${skill.name}`);
    }

    // 保存文件
    fs.writeFileSync(filePath, JSON.stringify(skillList, null, 2), 'utf8');
    
    // 重新合并基础技能与全部自创技能，避免一门自创道法覆盖整张战斗技能表。
    data.reloadBattleSkillLists();
    
    return true;
  } catch (error) {
    console.error('保存技能失败:', error);
    return false;
  }
}
// 生成大道创造文案（遮天风格）
generateWayCreationText(playerName, wayName, wayType) {
    // 基础文案
    const baseText = [
        `「炉养百经，菩提证道！」`,
        `${playerName}盘坐菩提树下，道我与逝我诵经,九天神光垂落，大道符文漫天！`,
        `身后浮现万卷道经，化作神炉熔炼百经，`,
        `周身混沌气弥漫，无数星辰环绕，大道金莲绽放，天际边仙音袅袅，儒佛禅唱`,
        `打遍星空古路绝代天骄，横扫天上地下敌，终证得无上大道！`,
        ``,
        `【${wayName}】横空出世，诸天震动！`,
        ``
    ];
    
    // 类型专属文案
    let typeSpecificText = [];
    let finalText = [];
    
    switch (wayType) {
        case '攻伐':
            typeSpecificText = [
                ` 大道特性：`,
                `- 攻伐无双：心念一动，万法皆破`,
                `- 触发概率：5%（随境界提升可增加）`,
                `- 基础倍率：1倍（可随修为提升）`,
                `- 无冷却时间，一念破万法`,
                ``,
                `「${wayName}一出，诸天颤栗！」`,
                `此乃攻伐极致之道，未来可演化无上杀伐圣术！`,
                ``
            ];
            finalText = [
                ` 菩提叶落，道则轰鸣！`,
                `${playerName}睁开双眸，`,
                `眸中射出两道仙芒，撕裂虚空，贯穿万古！`,
                `「从今往后，我道即天道！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;
            
        case '护体':
            typeSpecificText = [
                ` 大道特性：`,
                `- 万法不侵：诸邪退避，万法难伤`,
                `- 触发概率：5%（随境界提升可增加）`,
                `- 基础防御：10%减伤（可随修为提升）`,
                `- 反弹伤害：10%（可随修为提升）`,
                `- 无冷却时间，永恒守护`,
                ``,
                `「${wayName}护体，万劫不灭！」`,
                `此乃防御极致之道，未来可铸不朽道基！`,
                ``
            ];
            finalText = [
                ` 菩提树摇曳，洒落亿万神辉！`,
                `${playerName}周身道则环绕，`,
                `演化混沌青莲，万法不侵，诸邪退避！`,
                `「我身即道，万劫不磨！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;
            
        case '涅槃':
            typeSpecificText = [
                ` 大道特性：`,
                `- 涅槃重生：向死而生，破而后立`,
                `- 触发条件：濒死状态自动触发`,
                `- 恢复效果：50%生命值（可随修为提升）`,
                `- 免控回合：1回合（可随修为提升）`,
                `- 无冷却时间，生生不息`,
                ``,
                `「${wayName}运转，向死而生！」`,
                `此乃生命极致之道，未来可证不死不灭！`,
                ``
            ];
            finalText = [
                ` 菩提树绽放无量光，涅槃真火焚尽虚空！`,
                `${playerName}浴火重生，`,
                `褪去旧躯，再造新我，气息更胜往昔！`,
                `「我命由我不由天！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;

        case '时空':
            typeSpecificText = [
                ` 大道特性：`,
                `- 时空折跃：提升自身行动进度并压制对手行动条`,
                `- 时空加速：触发后短暂提升速度`,
                `- 基础倍率：1倍（可随修炼提升）`,
                `- 无冷却时间，先手与追击皆可演化`,
                ``,
                `「${wayName}一转，古今未来皆在掌中！」`,
                `此乃时空交汇之道，未来可演化穿梭万古的禁忌神通！`,
                ``
            ];
            finalText = [
                ` 时间长河在菩提树下显化，无数支流映照同一尊身影！`,
                `${playerName}一步踏出，前因后果皆被甩在身后，`,
                `于刹那间横渡星海，截取属于自己的未来！`,
                `「岁月不能束我，空间不能困我！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;

        case '轮回':
            typeSpecificText = [
                ` 大道特性：`,
                `- 轮回归来：濒死时有概率从轮回中复生`,
                `- 真灵回响：复生后恢复生命并获得攻防加成`,
                `- 免控回合：1回合（可随修炼提升）`,
                `- 自创复活技优先判定，生死只隔一念`,
                ``,
                `「${wayName}一转，黄泉也要让路！」`,
                `此乃生死轮转之道，未来可演化逆转因果的轮回大术！`,
                ``
            ];
            finalText = [
                ` 六道轮盘在虚空中缓缓转动，万灵悲鸣又复归寂静！`,
                `${playerName}从生死线上回眸，接引归来的真灵重入肉身，`,
                `枯竭的气血重新奔涌，轮回印照亮九天十地！`,
                `「生死由我定，轮回由我开！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;

        case '因果':
            typeSpecificText = [
                ` 大道特性：`,
                `- 因果落印：命中后留下延迟反噬`,
                `- 先因后果：反噬持续回合可随修炼提升`,
                `- 基础伤害：110%（可随修炼提升）`,
                `- 无冷却时间，越战越能积累命数`,
                ``,
                `「${wayName}一出，今日之果皆是昨日之因！」`,
                `此乃因果牵引之道，未来可演化斩断宿命的无上秘术！`,
                ``
            ];
            finalText = [
                ` 因果丝线贯穿诸天，菩提叶上的露珠映出敌手一生！`,
                `${playerName}抬手拨动命运琴弦，`,
                `敌手今日所受的每一分伤势，都在未来化作更深的回响！`,
                `「种什么因，便收什么果！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;

        case '封禁':
            typeSpecificText = [
                ` 大道特性：`,
                `- 万道封禁：命中后冻结对手行动`,
                `- 镇压遁光：额外推迟对手行动条`,
                `- 基础倍率：80%（可随修炼提升）`,
                `- 控场优先，适合打断强力神通`,
                ``,
                `「${wayName}一封，诸天法则皆寂！」`,
                `此乃封锁万法之道，未来可演化封天绝地的无上禁术！`,
                ``
            ];
            finalText = [
                ` 菩提树下浮现万重禁制，星辰运行都为之停滞！`,
                `${playerName}指尖落下一枚道印，`,
                `敌手周身法则被层层锁死，只能眼睁睁看着杀机降临！`,
                `「我言即禁，万法不许动！」`,
                ``,
                `使用指令：#修炼自身之道 精进此无上大道`
            ];
            break;
    }
    
    return [...baseText, ...typeSpecificText, ...finalText].join('\n');
}
async cultivateOwnWay(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);

    // === 1. 解析倍数参数 ===
    const match = e.msg.match(/#修炼自身之道\*(\d+)/);
    const parsedBatchTimes = match ? Number.parseInt(match[1], 10) : 1;
    const batchTimes = Math.max(1, Math.min(Number.isFinite(parsedBatchTimes) ? parsedBatchTimes : 1, 9999));

    // === 2. 前置条件检查 ===
    if (!player.已创自身之道) {
        return e.reply('你尚未开创自身之道，请先使用 #创造自身之道');
    }

    // === 3. 当前境界封顶检查与阶段固定消耗 ===
    const currentCultivationCount = Math.max(0, Math.trunc(Number(player.修炼次数) || 0));
    const currentRealm = getOwnWayCurrentRealm(player);
    const currentRealmGate = getOwnWayRealmGate(player, currentRealm.index);
    if (!currentRealmGate.ok) {
        return e.reply([
            `【${currentRealm.name}·道途未至】`,
            ...currentRealmGate.missing.map(item => `尚缺：${item}`)
        ].join('\n'));
    }
    const remainingTimes = Math.max(0, currentRealm.max - currentCultivationCount);
    if (remainingTimes <= 0) {
        const isFinalRealm = currentRealm.index === OWN_WAY_REALM_RULES.length - 1;
        return e.reply([
            `【${currentRealm.name}·境界已满】`,
            `当前修炼次数：${currentCultivationCount}/${currentRealm.max}`,
            isFinalRealm
                ? `自身之道已达到当前版本最高境界。`
                : `已达到当前境界极限，请使用 #突破自身之道。`
        ].join('\n'));
    }
    if (batchTimes > remainingTimes) {
        return e.reply([
            `【${currentRealm.name}·不可越境修炼】`,
            `当前修炼次数：${currentCultivationCount}/${currentRealm.max}`,
            `本阶段最多还可修炼：${remainingTimes}次`,
            `请先修炼至${currentRealm.max}次，再使用 #突破自身之道。`
        ].join('\n'));
    }

    const costPerTime = getOwnWayCultivationCosts(currentRealm);
    const totalPotentialCost = costPerTime.potential * batchTimes;
    const totalCost = costPerTime.cultivation * batchTimes;
    const cultivateCosts = Array.from({ length: batchTimes }, () => costPerTime.cultivation);
    const currentPotential = Number(player.仙道潜力) || 0;
    const currentCultivation = Number(player.修为) || 0;
    const currentBlood = Number(player.血气) || 0;

    if (currentPotential < totalPotentialCost) {
        return e.reply([
            `批量修炼需消耗仙道潜力：${batchTimes}×${costPerTime.potential}`,
            `当前仙道潜力：${currentPotential.toLocaleString()}`,
            `所需仙道潜力：${totalPotentialCost.toLocaleString()}`
        ].join('\n'));
    }
    if (currentCultivation < totalCost) {
        return e.reply([
            `批量修炼需消耗修为：${batchTimes}×${bigNumberTransform(costPerTime.cultivation)}`,
            `当前修为：${bigNumberTransform(currentCultivation)}`,
            `所需修为：${bigNumberTransform(totalCost)}`,
            `(首单次消耗：${bigNumberTransform(cultivateCosts[0])})`,
            `(末单次消耗：${bigNumberTransform(cultivateCosts[batchTimes-1])})`
        ].join('\n'));
    }
    if (currentBlood < totalCost) {
        return e.reply([
            `批量修炼需消耗血气：${batchTimes}×${bigNumberTransform(costPerTime.blood)}`,
            `当前血气：${bigNumberTransform(currentBlood)}`,
            `所需血气：${bigNumberTransform(totalCost)}`,
            `(首单次消耗：${bigNumberTransform(cultivateCosts[0])})`,
            `(末单次消耗：${bigNumberTransform(cultivateCosts[batchTimes-1])})`
        ].join('\n'));
    }
    
    // === 4. 获取技能数据 ===
    const skillName = player.自身之道名称;
    const listType = this.getListTypeByWayType(player.自身之道类型);
    let customSkill = await this.getCustomSkill(skillName, listType);
    
    if (!customSkill) {
        // 兼容旧数据：技能文件缺失时按道途重新生成完整技能对象。
        customSkill = this.createOwnWaySkill(player.自身之道类型, skillName, player.名号) || {
            name: skillName,
            class: '功法',
            pr: 0.05,
            cnt: -1,
            beilv: 1,
            other: 0,
            msg1: `${skillName}发动效果`,
            msg2: ''
        };
    }

    // === 5. 根据大道类型进行不同的提升 ===
    let totalPrGain = 0;
    let totalBeilvGain = 0;
    let specialEffects = [];
    
    // 临时变量用于计算
    let tempPr = Number(customSkill.pr) || 0.05;
    let tempBeilv = Number.isFinite(Number(customSkill.beilv)) ? Number(customSkill.beilv) : 1;
    
    // 记录初始值（用于计算总增益）
    const initialPr = tempPr;
    const initialBeilv = tempBeilv;
    
    // 先扣除资源
    player.修为 = currentCultivation - totalCost;
    player.血气 = currentBlood - totalCost;
    player.仙道潜力 = currentPotential - totalPotentialCost;
    
    // === 关键修复：改为循环处理每次修炼 ===
    for (let i = 0; i < batchTimes; i++) {
        const currentCount = currentCultivationCount + i + 1;
        
        // 根据类型进行提升
        switch (player.自身之道类型) {
            case '攻伐':
                // 攻伐大道：提升触发概率和伤害倍率
                tempPr = Math.min(0.85, tempPr + 0.005);
                tempBeilv += 0.1;
                totalPrGain += 0.005;
                totalBeilvGain += 0.1;
                
                // 概率获得特殊属性 (5%概率)
                if (Math.random() < 0.05) {
                    // 随机选择一种特殊属性
                    const specialTypes = ['不可防御', '不可复活', '控制'];
                    const selectedType = specialTypes[Math.floor(Math.random() * specialTypes.length)];
                    
                    // 如果还没有该属性，则添加
                    if (!customSkill[selectedType]) {
                        customSkill[selectedType] = 1;
                        specialEffects.push(`获得特殊属性：${selectedType}`);
                    } else {
                        // 如果已有该属性，则提升等级
                        customSkill[selectedType] += 0.1;
                        specialEffects.push(`提升${selectedType}等级：${customSkill[selectedType].toFixed(1)}`);
                    }
                }
                break;
                
            case '护体':
                // 护体真法：降低倍率（增强防御），提升反弹概率
                tempPr = Math.min(0.85, tempPr + 0.005);
                tempBeilv = Math.max(-0.95, tempBeilv - 0.01); // 最大减伤95%
                totalPrGain += 0.005;
                totalBeilvGain -= 0.01; // 注意：这里是负值
                
                // 提升反弹伤害 (5%概率)
                if (Math.random() < 0.05) {
                    if (!customSkill.反弹伤害) customSkill.反弹伤害 = 0.1;
                    customSkill.反弹伤害 = Math.min(0.5, customSkill.反弹伤害 + 0.005);
                    specialEffects.push(`反弹伤害提升：${(customSkill.反弹伤害 * 100).toFixed(1)}%`);
                }
                break;
                
            case '涅槃':
                // 涅槃圣术：提升恢复比例、免控回合和属性加成
                tempPr = Math.min(1.0, tempPr + 0.01); // 涅槃技能pr上限100%
                totalPrGain += 0.01;
                
                // 提升恢复比例
                if (!customSkill.恢复比例) customSkill.恢复比例 = 0.5;
                customSkill.恢复比例 = Math.min(0.95, customSkill.恢复比例 + 0.01);
                
                // 提升免控回合
                if (!customSkill.免控) customSkill.免控 = 1;
                customSkill.免控 = Math.min(5, customSkill.免控 + 0.1);
                
                // 提升属性加成
                const attributes = ['攻击加成', '防御加成', '生命加成'];
                attributes.forEach(attr => {
                    if (!customSkill[attr]) customSkill[attr] = 0;
                    customSkill[attr] = Math.min(0.5, customSkill[attr] + 0.005);
                });
                break;

            case '时空':
                // 时空大道：逐步提高触发率、行动条优势与速度。
                tempPr = Math.min(0.75, tempPr + 0.005);
                tempBeilv += 0.03;
                totalPrGain += 0.005;
                totalBeilvGain += 0.03;
                customSkill.拉条 = Math.min(300, (Number(customSkill.拉条) || 100) + 5);
                customSkill.推条 = Math.min(250, (Number(customSkill.推条) || 80) + 5);
                customSkill.速度加成 = Math.min(0.3, (Number(customSkill.速度加成) || 0.05) + 0.002);
                break;

            case '轮回':
                // 轮回大道：提高复生概率、复生后的恢复与反哺战力。
                tempPr = Math.min(0.85, tempPr + 0.005);
                totalPrGain += 0.005;
                customSkill.恢复比例 = Math.min(0.65, (Number(customSkill.恢复比例) || 0.2) + 0.005);
                customSkill.免控 = Math.min(5, (Number(customSkill.免控) || 1) + 0.1);
                customSkill.攻击加成 = Math.min(1, (Number(customSkill.攻击加成) || 0.15) + 0.01);
                customSkill.防御加成 = Math.min(1, (Number(customSkill.防御加成) || 0.15) + 0.01);
                break;

            case '因果':
                // 因果大道：提升命中伤害，并延长因果反噬的持续回合。
                tempPr = Math.min(0.85, tempPr + 0.005);
                tempBeilv += 0.05;
                totalPrGain += 0.005;
                totalBeilvGain += 0.05;
                customSkill.负面回合 = Math.min(5, Math.max(1, Number(customSkill.负面回合) || 2));
                if (currentCount % 20 === 0) customSkill.负面回合 = Math.min(5, customSkill.负面回合 + 1);
                break;

            case '封禁':
                // 封禁大道：强化控制触发率、封锁伤害与推条强度。
                tempPr = Math.min(0.7, tempPr + 0.004);
                tempBeilv += 0.02;
                totalPrGain += 0.004;
                totalBeilvGain += 0.02;
                customSkill.推条 = Math.min(300, (Number(customSkill.推条) || 120) + 4);
                customSkill.控制 = 1;
                break;
        }
    }
    
    // 更新修炼次数
    player.修炼次数 = currentCultivationCount + batchTimes;
    player.自身之道阶段 = currentRealm.index;
    player.自身之道境界 = currentRealm.name;
    if (currentRealm.index >= 4) player.自身之道根基 = '无缺帝道';

    // === 6. 更新数据 ===
    const updatedSkill = {
        ...customSkill,
        pr: tempPr,
        beilv: tempBeilv,
        自身之道阶段: currentRealm.index,
        自身之道境界: currentRealm.name,
        ...(currentRealm.index >= 4 ? { 道源根基: '无缺帝道' } : {}),
    };

    // === 7. 保存数据 ===
    const skillSaveResult = await this.saveCustomSkill(
        updatedSkill,
        this.getListTypeByWayType(player.自身之道类型)
    );
    if (!skillSaveResult) return e.reply('保存自身之道修炼结果失败，本次资源未扣除');
    await Write_player(usr_qq, player);

    // === 8. 构建反馈消息 ===
    let resultMessage = [
        `【大道精进·批量修炼】`,
        `消耗 ${batchTimes}次${currentRealm.name}修炼`,
        `总消耗：仙道潜力${totalPotentialCost.toLocaleString()}，修为与血气各${bigNumberTransform(totalCost)}`,
        `当前进度：${player.修炼次数}/${currentRealm.max}`,
        `「${skillName}」累计提升：`
    ];
    
    // 计算总增益
    const prGainPercent = (tempPr - initialPr) * 100;
    const beilvGain = tempBeilv - initialBeilv;
    
    // 根据类型添加不同的提升信息
    switch (player.自身之道类型) {
        case '攻伐':
            resultMessage.push(
                `├─ 触发概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/${(0.85 * 100).toFixed(0)}%上限`,
                `├─ 伤害倍率：+${beilvGain.toFixed(1)}`,
                `└─ 当前倍率：${tempBeilv.toFixed(1)}`
            );
            break;
            
        case '护体':
            resultMessage.push(
                `├─ 触发概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/${(0.85 * 100).toFixed(0)}%上限`,
                `├─ 减伤效果：${(-tempBeilv * 100).toFixed(1)}%`,
                `└─ 反弹伤害：${(customSkill.反弹伤害 * 100).toFixed(1)}%`,
            );
            break;
            
        case '涅槃':
            resultMessage.push(
                `├─ 触发概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%`,
                `├─ 恢复比例：${(customSkill.恢复比例 * 100).toFixed(1)}%`,
                `├─ 免控回合：${customSkill.免控.toFixed(1)}`,
                `├─ 攻击加成：${(customSkill.攻击加成 * 100).toFixed(1)}%`,
                `├─ 防御加成：${(customSkill.防御加成 * 100).toFixed(1)}%`,
                `└─ 生命加成：${(customSkill.生命加成 * 100).toFixed(1)}%`
            );
            break;

        case '时空':
            resultMessage.push(
                `├─ 触发概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/75.0%上限`,
                `├─ 伤害倍率：+${beilvGain.toFixed(2)}`,
                `├─ 当前拉条：${Math.round(Number(customSkill.拉条) || 0)}点`,
                `├─ 当前推条：${Math.round(Number(customSkill.推条) || 0)}点`,
                `└─ 速度加成：${((Number(customSkill.速度加成) || 0) * 100).toFixed(1)}%`
            );
            break;

        case '轮回':
            resultMessage.push(
                `├─ 复生概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/85.0%上限`,
                `├─ 复生恢复：${((Number(customSkill.恢复比例) || 0) * 100).toFixed(1)}%`,
                `├─ 复生免控：${(Number(customSkill.免控) || 0).toFixed(1)}回合`,
                `├─ 复生攻击：+${((Number(customSkill.攻击加成) || 0) * 100).toFixed(1)}%`,
                `└─ 复生防御：+${((Number(customSkill.防御加成) || 0) * 100).toFixed(1)}%`
            );
            break;

        case '因果':
            resultMessage.push(
                `├─ 触发概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/85.0%上限`,
                `├─ 伤害倍率：+${beilvGain.toFixed(2)}`,
                `├─ 当前倍率：${tempBeilv.toFixed(2)}`,
                `└─ 反噬回合：${Math.round(Number(customSkill.负面回合) || 0)}回合`
            );
            break;

        case '封禁':
            resultMessage.push(
                `├─ 控制概率：+${prGainPercent.toFixed(1)}%`,
                `├─ 当前概率：${(tempPr * 100).toFixed(1)}%/70.0%上限`,
                `├─ 封禁倍率：${tempBeilv.toFixed(2)}`,
                `└─ 当前推条：${Math.round(Number(customSkill.推条) || 0)}点`
            );
            break;
    }
    
    // 添加特殊效果信息（去重）
    if (specialEffects.length > 0) {
        // 合并相同类型的特殊效果
        const effectSummary = {};
        specialEffects.forEach(effect => {
            effectSummary[effect] = (effectSummary[effect] || 0) + 1;
        });
        
        resultMessage.push(`大道感悟触发特殊效果：`);
        Object.keys(effectSummary).forEach(effect => {
            if (effectSummary[effect] > 1) {
                resultMessage.push(`├─ ${effect} (x${effectSummary[effect]})`);
            } else {
                resultMessage.push(`├─ ${effect}`);
            }
        });
    }
    
    resultMessage.push(`大道感悟愈发深邃！`);
    
    e.reply(resultMessage.join('\n'));
}

async breakthroughOwnWay(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    if (!player.已创自身之道) {
        return e.reply('你尚未开创自身之道，请先使用 #创造自身之道');
    }

    const cultivationCount = Math.max(0, Math.trunc(Number(player.修炼次数) || 0));
    const currentRealm = getOwnWayCurrentRealm(player);
    if (cultivationCount < currentRealm.max) {
        return e.reply([
            `【自身之道·积累不足】`,
            `当前境界：${currentRealm.name}`,
            `当前修炼次数：${cultivationCount}/${currentRealm.max}`,
            `还需修炼：${currentRealm.max - cultivationCount}次`
        ].join('\n'));
    }

    const nextRealm = OWN_WAY_REALM_RULES[currentRealm.index + 1];
    if (!nextRealm) {
        return e.reply([
            `【自身之道·祭道圆满】`,
            `你的自身之道已经达到${currentRealm.name}极限。`,
            `当前修炼次数：${cultivationCount}/${currentRealm.max}`
        ].join('\n'));
    }

    const realmGate = getOwnWayRealmGate(player, nextRealm.index);
    if (!realmGate.ok) {
        return e.reply([
            `【${currentRealm.name}·道途未至】`,
            `目标境界：${nextRealm.name}`,
            ...realmGate.missing.map(item => `尚缺：${item}`)
        ].join('\n'));
    }

    const skillName = player.自身之道名称;
    const listType = this.getListTypeByWayType(player.自身之道类型);
    const customSkill = await this.getCustomSkill(skillName, listType) ||
        this.createOwnWaySkill(player.自身之道类型, skillName, player.名号);
    if (!customSkill) return e.reply('自身之道技能数据异常，无法完成突破');

    const updatedSkill = {
        ...customSkill,
        pr: Math.min(1, (Number(customSkill.pr) || 0.05) + 0.01),
        自身之道阶段: nextRealm.index,
        自身之道境界: nextRealm.name,
        道境特性: nextRealm.feature,
        道境强度: nextRealm.multiplier,
        ...(nextRealm.index >= 4 ? { 道源根基: '无缺帝道' } : {}),
    };
    const saveResult = await this.saveCustomSkill(updatedSkill, listType);
    if (!saveResult) return e.reply('保存自身之道突破结果失败，请稍后再试');

    player.自身之道阶段 = nextRealm.index;
    player.自身之道境界 = nextRealm.name;
    if (nextRealm.index >= 4) player.自身之道根基 = '无缺帝道';
    player.自身之道突破记录 = player.自身之道突破记录 || [];
    player.自身之道突破记录.push({
        时间: new Date().toLocaleString(),
        原境界: currentRealm.name,
        新境界: nextRealm.name,
        所属体系: realmGate.route,
        体系境界: `${realmGate.routeName}${realmGate.currentRealmId}级`,
    });
    await Write_player(usr_qq, player);

    const nextCost = getOwnWayCultivationCosts(nextRealm);
    return e.reply([
        `【自身之道·突破成功】`,
        `${player.名号}的【${skillName}】由${currentRealm.name}突破至${nextRealm.name}！`,
        `解锁特性：${nextRealm.feature}`,
        nextRealm.index >= 4 ? `道源根基：无缺帝道` : '',
        `体系门槛：${realmGate.routeName}${realmGate.currentRealmId}级（需${realmGate.requiredRealmName}${realmGate.requiredRealmId}级）`,
        `下一阶段：${cultivationCount + 1}～${nextRealm.max}次`,
        `每次修炼消耗：仙道潜力${nextCost.potential}、修为与血气各${bigNumberTransform(nextCost.cultivation)}`
    ].filter(Boolean).join('\n'));
}

// 获取自定义技能
async getCustomSkill(skillName, listType) {
    try {
        const lib_path = data.lib_path;
        const fileName = `技能列表${listType}.json`;
        const filePath = path.join(lib_path, '技能列表', fileName);
        
        // 确保文件存在
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        // 读取文件
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const skillList = JSON.parse(fileContent);
        
        // 查找技能
        return skillList.find(skill => skill.name === skillName) || null;
    } catch (error) {
        console.error(`读取技能列表${listType}失败:`, error);
        return null;
    }
}
// 根据大道类型获取对应的技能列表类型
getListTypeByWayType(wayType) {
    return getOwnWaySkillListType(wayType);
}
async createEmperorSutra(e) {
    if (!e.isGroup) {
        e.reply('请在群聊中创造帝经');
        return true;
    }

    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    
    // 检查玩家是否已有帝经
    if (player.已创帝经) {
        return e.reply([
            `你已开创无上帝经【${player.帝经名称}】！`,
            `古往今来，大帝只能开创一部属于自己的无上帝经`,
            `此乃天地法则所限，无法更改`
        ].join('\n'));
    }
    
    // 检查玩家是否达到大帝境界
    if (!hasRealmAuthority(player, 16)) {
        return e.reply([
            `欲创帝经，需先证道成帝！`,
            `你当前境界仅为${player.level}，`,
            `需达到大帝境界方可开创无上帝经`
        ].join('\n'));
    }
    
    // 获取帝经名称
    const sutraName = e.msg.match(/^#创造帝经\s*(.*)$/)[1]?.trim();
    if (!sutraName) {
        return e.reply('请为你的帝经命名，如：#创造帝经 天帝经');
    }
    
    // 检查名称长度
    if (sutraName.length > 10) {
        return e.reply('帝经名称过长，请控制在10字以内');
    }
    
    // 检查是否已有同名功法
    if (player.学习的功法?.includes(sutraName)) {
        return e.reply(`你已掌握【${sutraName}】，无需再创`);
    }
    
    // 检查修为是否足够
    const requiredCultivation = 1e9; 
    if (player.修为 < requiredCultivation) {
        return e.reply([
            `开创帝经需消耗海量修为！`,
            `你当前修为：${bigNumberTransform(player.修为)}`,
            `所需修为：${bigNumberTransform(requiredCultivation)}`,
            `请继续积累修为再试`
        ].join('\n'));
    }
    
    // 创建帝经对象
    const newSutra = {
        id: Date.now(), // 使用时间戳作为唯一ID
        name: sutraName,
        class: "功法",
        type: "帝经",
        修炼加成: 5, // 基础加成
        出售价: 180000000, // 基础售价
        创造者: player.名号,
        创造者ID: usr_qq,
        创造时间: new Date().toLocaleString(),
    };
    
    // 保存到玩家自创帝经列表
    await this.saveCustomSutra(newSutra);
    
    // 扣除修为
    player.修为 -= requiredCultivation;
    
    // 添加帝经到玩家功法列表
    player.学习的功法 = player.学习的功法 || [];
    player.学习的功法.push(sutraName);
    
    // 添加创造记录
    player.帝经创造 = player.帝经创造 || [];
    player.帝经创造.push({
        时间: new Date().toLocaleString(),
        帝经名称: sutraName,
        消耗修为: requiredCultivation
    });
    
    // 标记已创帝经
    player.已创帝经 = true;
    player.帝经名称 = sutraName;
    
    await Write_player(usr_qq, player);
    
    // 生成帝经创造文案
    const creationText = this.generateSutraCreationText(player.名号, sutraName);
    
    e.reply(creationText);
    return true;
}

async saveCustomSutra(sutra) {
    try {
        // === 直接使用指定的路径 ===
        const lib_path = data.lib_path; // 获取lib路径
        const filePath = path.join(lib_path, '玩家自创帝经.json');
        
        console.log(`保存路径: ${filePath}`);
        
        // === 确保文件存在 ===
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '[]', 'utf8');
            console.log('已创建新的玩家自创帝经文件');
        }
        
        // === 读取现有数据 ===
        let customSutras = [];
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            customSutras = JSON.parse(fileContent);
            
            // 确保是数组
            if (!Array.isArray(customSutras)) {
                console.warn('玩家自创帝经文件格式错误，重置为空数组');
                customSutras = [];
            }
        } catch (error) {
            console.error('读取玩家自创帝经列表失败:', error);
        }
        
        // === 检查是否已有同名帝经 ===
        const existingSutra = customSutras.find(s => s.name === sutra.name);
        if (existingSutra) {
            console.warn(`已存在同名帝经: ${sutra.name}`);
            return false; // 返回失败
        }
        
        // === 添加到列表 ===
        customSutras.push(sutra);
        
        // === 保存文件 ===
        fs.writeFileSync(filePath, JSON.stringify(customSutras, null, 2), 'utf8');
        console.log(`成功保存新帝经: ${sutra.name} 到 ${filePath}`);
        
        // === 更新内存缓存 ===
        data.dijingList = customSutras;
        
        return true; // 返回成功
    } catch (error) {
        console.error('保存玩家自创帝经列表失败:', error);
        return false; // 返回失败
    }
}
// 生成帝经创造文案
generateSutraCreationText(playerName, sutraName) {
    const creationProcesses = [
        `${playerName}盘坐九天之上，周身万道轰鸣`,
        ` 体内三百六十五处神藏同时发光，演化诸天星辰`,
        ` 炉养百经，万法熔炼，历经千劫万险`,
        ` 终在混沌中开辟出一条前所未有的道路`,
        ` 大道符文交织成经，天地法则为之共鸣`
    ];
    
    const sutraEffects = [
        ` 一经施展，星河倒转，岁月长河为之断流`,
        ` 帝经显化，万道哀鸣，诸天星辰皆颤栗`,
        ` 修至大成，万法不侵，永恒不灭`,
        ` 一念花开，君临天下，镇压世间一切敌`
    ];
    
    const creationSuccess = [
        ` ${playerName}双眸开阖，射出两道仙芒，撕裂永恒`,
        ` 虚空中浮现四个大道神文：${sutraName}`,
        `从此天上地下，唯此帝经独尊！`,
        ` 新的传说，自此开始书写！`
    ];
    
    // 随机选择过程描述
    const selectedProcess = get_random_fromARR(creationProcesses);
    const selectedEffect = get_random_fromARR(sutraEffects);
    
    return [
        `无上帝经诞生`,
        selectedProcess,
        `《${sutraName}》初现世间！`,
        selectedEffect,
        ...creationSuccess,
    ].join('\n');
}
}
