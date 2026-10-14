import { plugin, puppeteer, verc, data, Show } from '../../api/api.js';
import fs from 'fs';
import {
  existplayer,
  Write_player,
  isNotNull,
   Write_equipment,
  exist_najie_thing,
  Add_najie_thing,
  Add_职业经验,
  Add_灵石,
  Read_equipment,
  sleep,
  ForwardMsg,
  convert2integer,
  Go,
  zd_battle,
  get_danfang_img,
  get_tuzhi_img,
  get_zhizuo_img,
  get_log_img,
  bigNumberTransform,
  channel
} from '../../model/xiuxian.js';
import { Read_player, __PATH, Read_danyao } from '../../model/xiuxian.js';
import {
  getMinggeBonusMultiplier,
  getMinggeEffects,
  calculateMinggeYield,
} from '../../model/mingge.js';
import { consumeAlchemyMultiplier, getPetAbilityBonus, getTimedActionMultiplier } from '../../model/innateTreasure.js';
import {
  SOURCE_STONE_FIELD_CONFIG,
  prepareSourceStoneField as createSourceStoneField,
} from '../../model/tianjiTalismans.js';
import {
  normalizeOccupationCollection,
  saveOccupation,
  snapshotOccupation,
  takeOccupation,
} from '../../model/occupationCollection.js';
import { getFlowerPollenAuthorityLevel, getRealmAuthorityPath } from '../../model/realmAuthority.js';

// 材料稀有度
const MATERIAL_RARITY = {
   "大罗银精": 9,
   "仙泪绿金": 9,
    "凰血赤金": 9,
    "龙纹黑金": 9,
    "永恒蓝金": 9,
    "神痕紫金": 9,
    "道劫黄金": 9,
    "羽化青金": 9,
    "混沌石精": 9,
    "九彩神金": 12,
    "万物母气": 10,
    "太初源金": 11,
    "混沌母金": 11,
    "万物源金": 11,
    "天衍唯一": 21,
};

   // 九大仙金列表
let IMMORTAL_GOLDS = [
    "仙泪绿金", "凰血赤金", "龙纹黑金", "永恒蓝金", 
    "神痕紫金", "道劫黄金", "羽化青金", "混沌石精", 
    "大罗银精", "太初源金", "混沌母金", "万物源金"
];



// 帝兵形态选项
const WEAPON_FORMS = ["剑", "刀", "枪", "戟", "斧", "钟", "鼎", "塔", "镜", "印", "炉", "伞", "琴", "扇", "鞭"];
export class Occupation extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Occupation',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#我的职业$',
          fnc: 'show_occupations',
        },
        {
          reg: '^#转职.*$',
          fnc: 'chose_occupation',
        },
        {
          reg: '^#转换副职.*$',
          fnc: 'chose_occupation2',
        },
        {
          reg: '^#猎户转.*$',
          fnc: 'zhuanzhi',
        },
        {
          reg: '(^#采药$)|(^#采药(.*)(分|分钟)$)',
          fnc: 'plant',
        },
        {
          reg: '^#结束采药$',
          fnc: 'plant_back',
        },
        {
          reg: '(^#采矿$)|(^#采矿(.*)(分|分钟)$)',
          fnc: 'mine',
        },
        {
          reg: '^#结束采矿$',
          fnc: 'mine_back',
        },
        {
          reg: '^#丹药配方$',
          fnc: 'show_danfang',
        },
        {
          reg: '^#参悟大衍悟道丹配方$',
          fnc: 'learnDayanWudaoPillRecipe',
        },
        {
          reg: '^#符道配方$',
          fnc: 'show_zhizuo',
        },
        {
          reg: '^#我的药效$',
          fnc: 'yaoxiao',
        },
        {
          reg: '^#装备图纸$',
          fnc: 'show_tuzhi',
        },
        {
          reg: '^#炼制.*(\\*[0-9]*)?$',
          fnc: 'liandan',
        },
          {
          reg: '^#制作.*(\\*[0-9]*)?$',
          fnc: 'zhizuo_fu',
        },
        {
          reg: '^#打造.*(\\*[0-9]*)?$',
          fnc: 'lianqi',
        },
        {
          reg: '^#悬赏目标$',
          fnc: 'search_sb',
        },
        {
          reg: '^#讨伐目标.*$',
          fnc: 'taofa_sb',
        },
        {
          reg: '^#悬赏.*$',
          fnc: 'xuanshang_sb',
        },
        {
          reg: '^#赏金榜$',
          fnc: 'shangjingbang',
        },
        {
          reg: '^#刺杀目标.*$',
          fnc: 'cisha_sb',
        },
        {
          reg: '^#清空赏金榜$',
          fnc: 'qingchushangjinbang',
        },
         {
                    reg: '(^#狩猎$)|(^#狩猎(.*)(分|分钟)$)',
                    fnc: 'shoulie'
                },
                {
                    reg: '^#结束狩猎$',
                    fnc: 'shoulie_back'
                },
                {
                    reg: '^#村庄列表$',
                    fnc: 'search_cz'
                 },
                 {
                     reg: '^#劫掠村庄.*$',
                     fnc: 'taofa_cz'
                 },
                   {
                    reg: '(^#寻源$)|(^#寻源(.*)(分|分钟)$)',
                    fnc: 'xunyuan'
                },
                {
                    reg: '^#结束寻源$',
                    fnc: 'xunyuan_back'
                },
                {
                    reg: '(^#寻脉定源$)|(^#寻脉定源(.*)(分|分钟)$)',
                    fnc: 'xunyuan2'
                },
                {
                    reg: '^#结束寻脉定源$',
                    fnc: 'xunyuan2_back'
                },
                                {
                    reg: '(^#地脉引气$)|(^#地脉引气(.*)(分|分钟)$)',
                    fnc: 'xunyuan3'
                },
                {
                    reg: '^#结束地脉引气$',
                    fnc: 'xunyuan3_back'
                },
                {
                    reg: '^#布置源石场$',
                    fnc: 'prepareSourceStoneField'
                },
                {
                    reg: '^#查看源石场$',
                    fnc: 'showSourceStoneField'
                },
                {
    reg: '^#禁仙六封$',
    fnc: 'forbiddenImmortalSixSeals'
},
{
    reg: '^#解除禁仙六封$',
    fnc: 'releaseForbiddenSeal'
},
                {
    reg: '^#以(.*)炼制帝兵(.*)$',
    fnc: 'forgeEmperorWeapon'
},
{
    reg: '^#以(.*)融合帝兵$',
    fnc: 'fuseEmperorWeapon'
},
{
    reg: '^#以雷劫洗礼帝兵$',
    fnc: 'upgradeEmperorWeapon'
},
{
  reg: '^#为帝兵更名\\s*(.*)$',
  fnc: 'renameEmperorWeapon'
},
{
    reg: '^#蕴养帝兵(?:\\*(\\d+))?$',
    fnc: 'nurtureEmperorWeapon'
},                  {
                    reg: '^#刻写帝兵$',
                    fnc: 'engraveEmperorWeapon'
                 },
                  {
                    reg: '^#查看恶人$',
                    fnc: 'chakanhuaidan'
                 },
                 {
                     reg: '^#消灭恶人.*$',
                     fnc: 'taofahuaidan'
                 }
      ],
    });
  }

async prepareSourceStoneField(e) {
    if (!e.isGroup) return e.reply('请在群聊中布置源石场');
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');
    const player = await Read_player(usr_qq);
    const result = createSourceStoneField(player);

    if (!result.ok) {
        if (result.reason === 'occupation') {
            return e.reply('唯有源地师或源天师能勾连山川龙脉，布下源石场。');
        }
        if (result.reason === 'location') {
            return e.reply('此处地脉坐标未明，先抵达有正式坐标的位面再布置源石场。');
        }
        if (result.reason === 'cost') {
            return e.reply(`布阵需要${bigNumberTransform(result.cost)}源石，你当前只有${bigNumberTransform(player.源石 || 0)}。`);
        }
        if (result.reason === 'active') {
            const field = result.field;
            return e.reply(`【${field.name}】仍在${field.plane}（${field.coordinate.x},${field.coordinate.y}）运转，剩余${field.remaining}场。`);
        }
    }

    await Write_player(usr_qq, player);
    const field = result.field;
    return e.reply([
        `【源术布阵·${field.name}】`,
        `你耗费${bigNumberTransform(result.cost)}源石，沿${field.plane}山川走势钉下源桩，拘来地脉龙气。`,
        `阵眼：${field.plane}（${field.coordinate.x},${field.coordinate.y}）`,
        `效果：在此坐标进行接下来3场讨伐PVE时，攻防血提升${Math.round((field.multiplier - 1) * 100)}%。`,
        '源石场持续24小时；离开阵眼不会消耗次数，返回后仍可使用。',
    ].join('\n'));
}

async showSourceStoneField(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');
    const player = await Read_player(usr_qq);
    const field = player.源石场;
    if (!field || Number(field.remaining) <= 0 || Number(field.expiresAt) <= Date.now()) {
        const config = SOURCE_STONE_FIELD_CONFIG[player.occupation];
        return e.reply(config
            ? `当前没有生效中的源石场。发送 #布置源石场，消耗${bigNumberTransform(config.cost)}源石布阵。`
            : '当前没有生效中的源石场。源地师或源天师方可布阵。');
    }
    const minutes = Math.max(0, Math.ceil((field.expiresAt - Date.now()) / 60000));
    return e.reply([
        `【${field.name}】`,
        `阵眼：${field.plane}（${field.coordinate.x},${field.coordinate.y}）`,
        `PVE增幅：${Math.round((field.multiplier - 1) * 100)}%`,
        `剩余：${field.remaining}场｜${Math.floor(minutes / 60)}小时${minutes % 60}分`,
    ].join('\n'));
}

async  forbiddenImmortalSixSeals(e) {
    if (!e.isGroup) {
        e.reply('请在群聊中施展禁仙六封');
        return true;
    }

    // 检查是否有艾特信息
    const atItems = e.message.filter(item => item.type === "at");
    if (atItems.length === 0) {
        e.reply('请艾特需要封印的修士');
        return true;
    }

    const casterQQ = e.user_id; // 施法者QQ
    const targetQQ = atItems[0].qq; // 被封印者QQ
    
    // 读取施法者数据
    const caster = await Read_player(casterQQ);
    
    // 检查施法者是否为源天师
    if (caster.occupation !== "源天师") {
        return e.reply([
            '「源术造诣不足！」',
            '禁仙六封乃源天师一脉至高秘术',
            `你当前职业：${caster.occupation || "未就职"}`,
            '需成为源天师方可施展此无上源术'
        ].join('\n'));
    }
    
    // 检查源石是否足够
    const requiredSourceStones = 1000000; // 100万源石
    if (caster.源石 < requiredSourceStones) {
        return e.reply([
            '「源石不足！」',
            `施展禁仙六封需消耗${bigNumberTransform(requiredSourceStones)}源石`,
            `你当前源石：${bigNumberTransform(caster.源石)}`,
            '请前往源矿采集或交易获取源石'
        ].join('\n'));
    }
    

    // 读取被封印者数据
    if (!await existplayer(targetQQ)) {
        return e.reply('目标修士不存在');
    }
    const target = await Read_player(targetQQ);
    
// 检查是否已被封印 - 通过Redis action状态检查
const targetAction = await redis.get(`xiuxian:player:${targetQQ}:action`);
      const actionData = JSON.parse(targetAction);
    if (targetAction != null) {

      let now_time = new Date().getTime();
      //人物任务的动作是否结束
      let targetAction_end_time = targetAction.end_time;
      if (now_time <= targetAction_end_time) {
        let m = parseInt((targetAction_end_time - now_time) / 1000 / 60);
        let s = parseInt((targetAction_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply(
          '正在' + targetAction.action + '中,剩余时间:' + m + '分' + s + '秒'
        );
        return false;
      }
    }
if (targetAction) {
    const actionData = JSON.parse(targetAction);
    if (actionData.action === '神源封印') {
        return e.reply([
            `「${target.名号}」已被禁仙六封封印！`,
            `封印时间：${target.封印时间 || "未知"}`,
            `解封时间：待黄金大世开启`
        ].join('\n'));
    }
}
        let 目标秘境体系 = data.Levelmijing_list.find(item => item.level_id == target.mijinglevel_id);
        let 自身秘境体系 = data.Levelmijing_list.find(item => item.level_id == caster.mijinglevel_id);
    let 目标仙古今世法 = data.xiangujinshi_list.find(item => item.level_id == target.xiangulevel_id);
    let 自身仙古今世法 = data.xiangujinshi_list.find(item => item.level_id == caster.xiangulevel_id);
    // 检查目标境界是否过高
    if (target.mijinglevel_id > caster.mijinglevel_id + 2&&target.xiangulevel_id > caster.xiangulevel_id + 2) {
        return e.reply([
            '「源术反噬！」',
            `${target.名号}境界过高，无法封印`,
            `施法者境界：`,
            `秘境体系：${自身秘境体系}，仙古今世法：${自身仙古今世法}`,
            `目标境界：`,
            `秘境体系：${目标秘境体系}，仙古今世法：${目标仙古今世法}`,
        ].join('\n'));
    }
    
    // === 施展禁仙六封 ===
    
    // 扣除源石
    caster.源石 -= requiredSourceStones;
    
    // 更新施法者数据
    caster.禁仙六封使用次数 = (caster.禁仙六封使用次数 || 0) + 1;
    caster.最后使用时间 = new Date().toLocaleString();
    
    // 更新目标数据
    target.封印状态 = "禁仙六封";
    target.封印时间 = new Date().toLocaleString();
    target.封印者 = caster.名号;
    target.封印者ID = casterQQ;
    target.解封条件 = "待黄金大世开启";
    
    // === 添加神源封印状态 ===
    const sealState = {
        action: '神源封印',
        end_time: Date.now() + 99999 * 60000, // 99999分钟（近乎永久）
        time: 99999 * 60000,
        shutup: '1', // 禁止发言
        working: '1', // 禁止工作
        Place_action: '1', // 禁止场景行动
        Place_actionplus: '1', // 禁止高级行动
        power_up: '1', // 禁止提升修为
        mojie: '1', // 禁止魔界行动
        xijie: '1', // 禁止仙界行动
        plant: '1', // 禁止种植
        mine: '1', // 禁止采矿
        jieyin: '1' // 特殊标记：神源封印
    };
    
    // 保存封印状态到Redis
    await redis.set(`xiuxian:player:${targetQQ}:action`, JSON.stringify(sealState));
    
    // 保存玩家数据
    await Write_player(casterQQ, caster);
    await Write_player(targetQQ, target);
    
    // === 生成遮天风格文案 ===
    const sealText = [
        `【禁仙六封·神源永镇】`,
        `${caster.名号}双眸绽放源天神光，手掐无上源诀！`,
        `「源天师一脉，禁仙六封！」`,
        `天地间源气沸腾，化作六道神链贯穿虚空！`,
        ``,
        `${target.名号}周身空间凝固，大道符文湮灭！`,
        `神源之气自九幽涌出，化作不朽晶体！`,
        `「以吾之名，封汝于此，待黄金大世重临！」`,
        ``,
        `六道神则锁链缠绕，${target.名号}被永恒封入神源！`,
        `神源晶体沉入大地深处，等待下一个黄金大世开启...`,
        ``,
        `施法者：${caster.名号}（源天师）`,
        `消耗：${bigNumberTransform(requiredSourceStones)}源石`,
        `封印状态：神源封印（99999分钟）`,
        `解封条件：黄金大世开启或源天师解封`
    ].join('\n');
    
    e.reply(sealText);
    return true;
}
async  releaseForbiddenSeal(e) {
    if (!e.isGroup) {
        e.reply('请在群聊中解除禁仙六封');
        return true;
    }

    // 检查是否有艾特信息
    const atItems = e.message.filter(item => item.type === "at");
    if (atItems.length === 0) {
        e.reply('请艾特需要解封的修士');
        return true;
    }

    const casterQQ = e.user_id; // 解封者QQ
    const targetQQ = atItems[0].qq; // 被解封者QQ
    
    // 读取解封者数据
    const caster = await Read_player(casterQQ);
    
    // 检查解封者是否为源天师
    if (caster.occupation !== "源天师") {
        return e.reply([
            '「源术造诣不足！」',
            '解除禁仙六封需源天师境界',
            `你当前职业：${caster.occupation || "未就职"}`,
            '唯有源天师可解此无上源术'
        ].join('\n'));
    }
    
    // 读取被解封者数据
    if (!await existplayer(targetQQ)) {
        return e.reply('目标修士不存在');
    }
    const target = await Read_player(targetQQ);
    
    // 检查是否被禁仙六封封印
    if (target.封印状态 !== "禁仙六封") {
        return e.reply([
            `「${target.名号}」未被禁仙六封封印！`,
            `当前状态：${target.封印状态 || "正常"}`
        ].join('\n'));
    }
    
    // 检查解封者是否为原封印者或更高境界
    if (casterQQ !== target.封印者ID && caster.mijinglevel_id <= target.mijinglevel_id) {
        return e.reply([
            '「源术反噬！」',
            `你非原封印者，且境界不足`,
            `原封印者：${target.封印者}`,
            `目标境界：${target.境界}`,
            `你当前境界：${caster.境界}`
        ].join('\n'));
    }
    
    // === 解除封印 ===
    
    // 更新目标数据
    target.封印状态 = null;
    target.解封时间 = new Date().toLocaleString();
    target.解封者 = caster.名号;
    
    // 移除Redis中的封印状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    // 保存玩家数据
    await Write_player(targetQQ, target);
    
    // === 生成解封文案 ===
    const releaseText = [
        `【源天解封·神源破茧】`,
        `${caster.名号}手掐源天解封诀，引动天地源气！`,
        `「源天师一脉，六封皆解！」`,
        `大地震动，神源晶体自九幽升起！`,
        ``,
        `六道神则锁链寸寸断裂，神源晶体绽放无量光！`,
        `${target.名号}破源而出，气息更胜往昔！`,
        `「黄金大世已至，当重临世间！」`,
        ``,
        `解封者：${caster.名号}（源天师）`,
        `解封时间：${new Date().toLocaleString()}`,
        `被封印时长：${calculateSealDuration(target.封印时间)}`
    ].join('\n');
    
    e.reply(releaseText);
    return true;
}


async nurtureEmperorWeapon(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;

    // ✅ 解析次数（默认1次）
    const match = e.msg.match(/^#蕴养帝兵(?:\*(\d+))?$/);
    if (!match) return;

    let times = parseInt(match[1]) || 1;
    if (times <= 0) {
        e.reply("蕴养次数必须大于0");
        return true;
    }

    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }

    // 获取玩家数据
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);

    // 检查是否有帝兵
    if (!equipment.帝兵 || equipment.帝兵.author_name !== player.id) {
        return e.reply("这并非你的本命帝兵，无法蕴养");
    }

    const weapon = equipment.帝兵;

    // ✅ 实时判定兵字秘
    const hasBingziMi = player.学习的功法?.includes("兵字秘");
    const currentNurtureLimit = hasBingziMi ? 25 : 5;

    // ✅ 已圆满到的上限（关键字段）
    weapon.圆满上限 = weapon.圆满上限 || 0;

    // ✅ 剩余可蕴养次数（永远以当前状态为准）
    const remain = currentNurtureLimit - (weapon.蕴养 || 0);
    if (remain <= 0) {
        return e.reply([
            `帝兵蕴养已达上限！`,
            `当前蕴养次数：${weapon.蕴养}/${currentNurtureLimit}`,
            `无法继续蕴养`
        ].join("\n"));
    }

    if (times > remain) {
        times = remain;
    }

    // ✅ 消耗
    const costCultivation = 20000000000;
    const costBlood = 20000000000;
    const costLifeEssence = 50;

    const totalCultivation = costCultivation * times;
    const totalBlood = costBlood * times;
    const totalLifeEssence = costLifeEssence * times;



    // 检查资源
    if (
        player.修为 < totalCultivation ||
        player.血气 < totalBlood ||
        player.生命本源 < totalLifeEssence
    ) {
        const messages = [
            `资源不足！`,
            `蕴养消耗：`,
            `修为：${bigNumberTransform(totalCultivation)}`,
            `血气：${bigNumberTransform(totalBlood)}`,
            `生命本源：${totalLifeEssence}`,
            `当前资源：`,
            `修为：${bigNumberTransform(player.修为)}`,
            `血气：${bigNumberTransform(player.血气)}`,
            `生命本源：${player.生命本源}`
        ];

        if ( player.修为 < totalCultivation) {
            messages.push(`修为不足：${bigNumberTransform(totalCultivation - player.修为)}`);
        }

        if (player.血气 < totalBlood) {
            messages.push(`血气不足：${bigNumberTransform(totalBlood - player.血气)}`);
        }

        if (player.生命本源< totalLifeEssence) {
            messages.push(`生命本源不足：${totalLifeEssence - player.生命本源}`);
        }

        return e.reply(messages.join("\n"));
    }

    // ✅ 扣资源
    player.修为 -= totalCultivation;
    player.血气 -= totalBlood;
    player.生命本源 -= totalLifeEssence;

    // ✅ 记录旧值
    const oldNurture = weapon.蕴养 || 0;
    weapon.蕴养 = oldNurture + times;

    // ✅ 属性成长（基础）
    const baseBoost = 5000000000*times;
    weapon.atk += baseBoost;
    weapon.def += baseBoost;
    weapon.HP += baseBoost;
    weapon.全属性 += times;

if (
    weapon.蕴养 === currentNurtureLimit &&
    weapon.圆满上限 < currentNurtureLimit
) {
    // ✅ 正确补偿公式：新上限 − 已圆满上限
    const bonus = currentNurtureLimit - weapon.圆满上限;
    weapon.全属性 += bonus;

    // 兵字秘额外效果（只在首次达到25时生效）
    if (hasBingziMi && currentNurtureLimit === 25) {
        weapon.bao = (weapon.bao || 0) + 0.1;
    }

    weapon.圆满上限 = currentNurtureLimit;
}

    // ✅ 仅用于展示
    weapon.蕴养上限 = currentNurtureLimit;

    // ✅ 保存
    equipment.帝兵 = weapon;
    await Write_equipment(usr_qq, equipment);
    await Write_player(usr_qq, player);

    // ✅ 回执（原文案零改动）
    const weaponForm = weapon.name.match(/剑|鼎|枪|钟|塔|镜|印|刀|斧|戟|鞭|琴|扇/)?.[0] || "帝兵";

    let successMsg = [
        `【帝兵蕴养成功】`,
        `以自身生命本源温养帝兵，大道共鸣！`,
        `${weaponForm}形帝兵「${weapon.name}」得生命本源滋养，威能大增！`,
        `属性提升：`,
        `攻击：+${bigNumberTransform(baseBoost)}`,
        `防御：+${bigNumberTransform(baseBoost)}`,
        `气血：+${bigNumberTransform(baseBoost)}`,
        `全属性：+1`,
        `当前蕴养次数：${weapon.蕴养}/${currentNurtureLimit}`
    ];

    if (weapon.蕴养 === currentNurtureLimit) {
        successMsg.push(
            ``,
            `【帝兵蕴养圆满】`,
            `帝兵与主人心意相通，达到完美蕴养状态！`,
            `全属性额外增加：${hasBingziMi ? "+25" : "+5"}`
        );

        if (hasBingziMi) {
            successMsg.push(
                `兵字秘效果触发，帝兵与主人心意相通！`,
                `暴击率增加：10%`
            );
        }
    }

    if (hasBingziMi) {
        successMsg.push(
            ``,
            `「兵字秘」效果：蕴养上限提升至25次`
        );
    }

    if (times > 1) {
        successMsg.unshift(`连续蕴养 ${times} 次，天道轰鸣！`);
    }

    e.reply(successMsg.join("\n"));
    return true;
}
  async  engraveEmperorWeapon(e) {
    if (!e.isGroup) {
        e.reply('请在群聊中刻写帝兵');
        return true;
    }

    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
    
    // 检查玩家是否已创自身之道
    if (!player.已创自身之道) {
        return e.reply([
            `你尚未开创自身之道！`,
            `需先使用 #创造自身之道 开创专属大道`,
            `方能将其刻写入帝兵`
        ].join('\n'));
    }
    
    // 检查是否有帝兵
    if (!equipment.帝兵 || equipment.帝兵.author_name !== player.id) {
        return e.reply("这并非你的本命帝兵，无法刻写");
    }
    
    const weapon = equipment.帝兵;
    
    // 检查帝兵品阶是否达到要求（三线对齐雷劫洗礼：仙古/花粉走天神兵位，遮天走圣兵；仙古旧档"圣兵"视作天神兵）
    const daoRoute = getRealmAuthorityPath(player);
    const isFlowerPath = daoRoute === 'huafen' && Number(player.huafenlevel_id) > 1;
    const isXianguPath = Number(player.xiangulevel_id) >= 8 || isFlowerPath;
    const flowerAuthority = getFlowerPollenAuthorityLevel(player.huafenlevel_id);
    const neededRank = isXianguPath ? "天神兵" : "圣兵";
    const rankOK = isXianguPath
        ? (weapon.品阶 === "天神兵" || weapon.品阶 === "圣兵")
        : (weapon.品阶 === "圣兵");
    if (!rankOK) {
        return e.reply([
            `帝兵品阶不足！`,
            `当前品阶：${weapon.品阶}`,
            `需要品阶：${neededRank}`,
            `请先使用 #以雷劫洗礼帝兵 将帝兵提升至${neededRank}品阶`
        ].join('\n'));
    }
    
    // 检查是否已刻写过
    if (weapon.刻写之道) {
        return e.reply([
            `帝兵已刻写道法！`,
            `「${weapon.name}」已刻写：${weapon.刻写之道}`,
            `无法再次刻写`
        ].join('\n'));
    }
    
    // 检查玩家境界是否足够（三线各自对齐：遮天·圣人王13 / 仙古·天神11 / 花粉·对标12）
    let realmLabel = "遮天秘境";
    let realmNow = String(player.mijinglevel_id || 0);
    let realmNeed = "13（圣人王）";
    let realmOK = Number(player.mijinglevel_id) >= 13;
    if (isFlowerPath) {
        realmLabel = "花粉进化路";
        realmNow = String(flowerAuthority);
        realmNeed = "13（神将）";
        realmOK = flowerAuthority >= 13;
    } else if (Number(player.xiangulevel_id) >= 8) {
        realmLabel = "仙古今世";
        realmNow = String(player.xiangulevel_id || 0);
        realmNeed = "12（虚道）";
        realmOK = Number(player.xiangulevel_id) >= 12;
    }
    if (!realmOK) {
        return e.reply([
            `境界不足！`,
            `刻写道法需要达到${realmLabel}·${realmNeed}境界`,
            `当前境界：${realmLabel} ${realmNow}`,
            `请先提升境界`
        ].join('\n'));
    }
    
    // 获取玩家自身之道
    const playerWay = {
        name: player.自身之道名称,
        type: player.自身之道类型
    };
    
    // 计算消耗
    const costCultivation = 1e10; // 100亿修为
    const costBlood = 1e10; // 100亿血气
    const costLifeEssence = 100; // 100点生命本源
    
    // 检查资源是否足够
    if (player.修为 < costCultivation || player.血气 < costBlood || player.生命本源 < costLifeEssence) {
        const messages = [
            `资源不足！`,
            `刻写消耗：`,
            `修为：${bigNumberTransform(costCultivation)}`,
            `血气：${bigNumberTransform(costBlood)}`,
            `生命本源：${costLifeEssence}`,
            `当前资源：`,
            `修为：${bigNumberTransform(player.修为)}`,
            `血气：${bigNumberTransform(player.血气)}`,
            `生命本源：${player.生命本源}`
        ];
        
        if (player.修为 < costCultivation) {
            messages.push(`修为不足：${bigNumberTransform(costCultivation - player.修为)}`);
        }
        
        if (player.血气 < costBlood) {
            messages.push(`血气不足：${bigNumberTransform(costBlood - player.血气)}`);
        }
        
        if (player.生命本源 < costLifeEssence) {
            messages.push(`生命本源不足：${costLifeEssence - player.生命本源}`);
        }
        
        return e.reply(messages.join("\n"));
    }
    
    // 扣除消耗
    player.修为 -= costCultivation;
    player.血气 -= costBlood;
    player.生命本源 -= costLifeEssence;
    
    // 刻写道法
    weapon.刻写之道 = playerWay.name;
    weapon.道法类型 = playerWay.type;
    weapon.全属性 += 5;
    
    // 根据道法类型添加特殊效果
    switch (playerWay.type) {
        case '攻伐':
            weapon.atk *= 1.5; // 攻击提升50%
            weapon.bao += 0.1; // 暴击率+10%
            break;
        case '护体':
            weapon.def *= 1.5; // 防御提升50%
             weapon.bao += 0.1; // 暴击率+10%
            break;
        case '涅槃':
            weapon.HP *= 1.5; // 生命提升50%
             weapon.bao += 0.1; // 暴击率+10%
            break;
    }
    
    // 保存数据
    equipment.帝兵 = weapon;
    await Write_equipment(usr_qq, equipment);
    await Write_player(usr_qq, player);
    
    // 构建回复消息
    const weaponForm = weapon.name.match(/剑|鼎|枪|钟|塔|镜|印|刀|斧|戟|鞭|琴|扇/)?.[0] || "帝兵";
    
    // 根据道法类型生成不同文案
    let engraveText = "";
    switch (playerWay.type) {
        case '攻伐':
            engraveText = [
                `「${player.名号}」双眸如电，手持帝兵划破虚空！`,
                `大道符文自体内涌出，化作攻伐神则融入帝兵！`,
                `「${playerWay.name}」之道刻入帝兵，锋芒毕露！`,
                `帝兵震颤，发出震天剑鸣，似要斩断万古！`
            ].join('\n');
            break;
        case '护体':
            engraveText = [
                `「${player.名号}」盘坐虚空，帝兵悬浮身前！`,
                `护体神光流转，化作不朽道则融入帝兵！`,
                `「${playerWay.name}」之道刻入帝兵，万法不侵！`,
                `帝兵绽放永恒神光，构筑不朽防御！`
            ].join('\n');
            break;
        case '涅槃':
            engraveText = [
                `「${player.名号}」引动涅槃真火，煅烧帝兵！`,
                `生命本源燃烧，涅槃之道融入帝兵！`,
                `「${playerWay.name}」之道刻入帝兵，生生不息！`,
                `帝兵浴火重生，散发不朽生机！`
            ].join('\n');
            break;
    }
    
    const successMsg = [
        `【帝兵刻写·大道铭刻】`,
        engraveText,
        ``,
        `「${weaponForm}形帝兵」${weapon.name} 已刻写：`,
        `大道名称：${playerWay.name}`,
        `大道类型：${playerWay.type}`,
        ``,
        `【属性提升】`,
        `全属性：+5`,
        `当前全属性：${weapon.全属性}`,
        playerWay.type === '攻伐' ? `攻击力提升：50%` : '',
        playerWay.type === '护体' ? `防御力提升：50%` : '',
        playerWay.type === '涅槃' ? `生命值提升：50%` : '',
        weapon.bao > 0 ? `暴击率提升：${Math.round(weapon.bao * 100)}%` : '',
        ``,
        `「${playerWay.name}之道，与兵同在！」`
    ].filter(Boolean).join('\n');
    
    e.reply(successMsg);
    return true;
}
async renameEmperorWeapon(e) {
    if (!e.isGroup) return;
    
    // 使用更灵活的名称提取方式
    const match = e.msg.match(/^#为帝兵更名\s*([\u4e00-\u9fa5a-zA-Z0-9]+)$/);
    if (!match) {
        e.reply("指令格式错误！正确格式：#为帝兵更名 [新名称]");
        return true;
    }
    
    const newName = match[1];
    const usr_qq = e.user_id;
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 获取玩家装备数据
    const equipment = await Read_equipment(usr_qq);
    
    // 检查是否有帝兵
    if (!equipment.帝兵 ) {
        return e.reply("你还没有炼制帝兵！请先使用 #以[材料]炼制帝兵[名称] 炼制帝兵");
    }
    
    const weapon = equipment.帝兵;
    
    // 定义必须包含的帝兵形态字眼
    const REQUIRED_WEAPON_FORMS = ["剑", "鼎", "枪", "钟", "塔", "镜", "印", "刀", "斧", "戟", "鞭", "琴", "扇"];
    
    // 检查新名称是否合法
    const isValidWeaponName = REQUIRED_WEAPON_FORMS.some(form => 
        newName.includes(form)
    );
    
    if (!isValidWeaponName) {
        return e.reply([
            `帝兵名称必须包含以下形态之一：`,
            REQUIRED_WEAPON_FORMS.join("、"),
            `例如：#为帝兵更名 混沌剑`,
            `您输入的名称：${newName}`,
            `请重新命名！`
        ].join("\n"));
    }
    
    // 检查名称长度
    if (newName.length < 2 || newName.length > 10) {
        return e.reply("帝兵名称长度需在2-10个字符之间");
    }
    
    // 保存旧名称
    const oldName = weapon.name;
    
    // 更新名称
    weapon.name = newName;
    equipment.帝兵 = weapon;
    
    // 保存装备数据
    await Write_equipment(usr_qq, equipment);
    
    // 回复消息
    e.reply([
        `【帝兵更名】`,
        `原名称：${oldName}`,
        `新名称：${newName}`,
        `帝兵更名成功！`
    ].join("\n"));
    
    return true;
}
async upgradeEmperorWeapon(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
    
    // 检查是否有帝兵
    if (!equipment.帝兵.author_name || equipment.帝兵.author_name !== player.id) {
        return e.reply("这并非你的本命帝兵，无法洗礼进阶");
    }

    const weapon = equipment.帝兵;

    // 帝兵品阶体系：仙古境界≥神火(8级)自动走仙古线，否则走遮天线。
    // 前 3 档、中间 4 档和祭道后的 27 档按体系共用，后 5 档两系共用。
    const POST_SACRIFICE_BING_RANKS = [
        "道器（一阶）", "道器（二阶）", "道器（三阶）", "道器（四阶）", "道器（五阶）",
        "道器（六阶）", "道器（七阶）", "道器（八阶）", "道器（九阶）",
        "鸿蒙器（一阶）", "鸿蒙器（二阶）", "鸿蒙器（三阶）", "鸿蒙器（四阶）", "鸿蒙器（五阶）",
        "鸿蒙器（六阶）", "鸿蒙器（七阶）", "鸿蒙器（八阶）", "鸿蒙器（九阶）",
        "唯一器（一阶）", "唯一器（二阶）", "唯一器（三阶）", "唯一器（四阶）", "唯一器（五阶）",
        "唯一器（六阶）", "唯一器（七阶）", "唯一器（八阶）", "唯一器（九阶）"
    ];
    const ZHETIAN_BING_RANKS = [
        "雏形", "通灵", "铭刻道与理", "斩道王兵",
        "圣兵", "准帝兵", "极道帝兵", "仙器",
        "仙王器", "准仙帝器", "仙帝器", "祭道器",
        ...POST_SACRIFICE_BING_RANKS
    ];
    const XIANGU_BING_RANKS = [
        "雏形", "通灵", "铭刻道与理", "真神兵",
        "天神兵", "遁一兵", "至尊兵", "仙器",
        "仙王器", "准仙帝器", "仙帝器", "祭道器",
        ...POST_SACRIFICE_BING_RANKS
    ];
    // 遮天旧品阶 → 仙古品阶（仙古玩家旧存档自动对齐新体系档位）
    const LEGACY_RANK_MAP = {
        "斩道王兵": "真神兵", "圣兵": "天神兵",
        "准帝兵": "遁一兵", "极道帝兵": "至尊兵"
    };
    const isFlowerPath = Number(player.huafenlevel_id) > 1 && getRealmAuthorityPath(player) === 'huafen';
    const isXianguPath = Number(player.xiangulevel_id) >= 8 || isFlowerPath;
    const flowerAuthority = getFlowerPollenAuthorityLevel(player.huafenlevel_id);
    const DI_BING_RANKS = isXianguPath ? XIANGU_BING_RANKS : ZHETIAN_BING_RANKS;
    // 当前品阶（仙古玩家旧名映射到新体系，未进阶前存档仍保留旧名）
    const currentRank = isXianguPath && LEGACY_RANK_MAP[weapon.品阶]
        ? LEGACY_RANK_MAP[weapon.品阶]
        : weapon.品阶;

    // 唯一器九阶是帝兵终极上限；祭道器之后仍可在更高境界继续进阶。
    if (currentRank === "唯一器（九阶）") {
        return e.reply([
            `帝兵已达终极圆满！`,
            `「${weapon.name}」已进阶至最高品阶「唯一器（九阶）」`,
            `无法再进行雷劫洗礼`
        ].join("\n"));
    }
        if (currentRank === "铭刻道与理"&&!weapon.蕴养) {
        return e.reply([
            `你需要用自身道行和生命本源蕴养${weapon.name}才能使其更进一步承受住雷劫洗礼`,
        ].join("\n"));
    }
            if (currentRank === (isXianguPath ? "天神兵" : "圣兵")&&!weapon.刻写之道) {
        return e.reply([
            `你需要将自身之道刻在${weapon.name}才能使其更进一步承受住雷劫洗礼`,
        ].join("\n"));
    }
   // 至尊兵（仙古）/极道帝兵（遮天）检查
    if (currentRank === (isXianguPath ? "至尊兵" : "极道帝兵") ) {
        // 检查是否融合了全部九种仙金
        const hasAllNineGolds = checkAllNineGoldsFused(weapon);
        
        if (!hasAllNineGolds) {
            // 获取缺少的仙金列表
            const missingGolds = getMissingGolds(weapon);
            
            return e.reply([
                `「${weapon.name}」需要融合全部九种仙金才能使其更进一步承受住雷劫洗礼`,
                `当前已融合仙金：${weapon.主材料}（主材）${weapon.融合仙金?.join('、') || '无'}`,
                `缺少仙金：${missingGolds.join('、')}`,
                `请使用 #以[仙金名称]融合帝兵 完成祭炼`
            ].join("\n"));
        } else {
        weapon.祭炼 = true;
        equipment.帝兵 = weapon;
        await Write_equipment(usr_qq, equipment);
        e.reply(`「${weapon.name}」已融合全部九种仙金，开始终极一跃！`);
        }
    }
// 辅助函数：检查是否融合了全部九种仙金
function checkAllNineGoldsFused(weapon) {
    // 主材料
    const mainMaterial = weapon.主材料;
    
    // 融合仙金列表
    const fusedMaterials = weapon.融合仙金 || [];
    
    // 合并所有仙金
    const allMaterials = [mainMaterial, ...fusedMaterials];
    
    // 检查是否包含全部九大仙金
    return IMMORTAL_GOLDS.every(gold => allMaterials.includes(gold));
}

// 辅助函数：获取缺少的仙金列表
function getMissingGolds(weapon) {
    // 主材料
    const mainMaterial = weapon.主材料;
    
    // 融合仙金列表
    const fusedMaterials = weapon.融合仙金 || [];
    
    // 合并所有仙金
    const allMaterials = [mainMaterial, ...fusedMaterials];
    
    // 找出缺少的仙金
    return IMMORTAL_GOLDS.filter(gold => !allMaterials.includes(gold));
}


    if (currentRank === "仙王器"&&!weapon.祭炼) {
        return e.reply([
            `「${weapon.name}」需要用同品阶帝兵进行祭炼才能使其更进一步承受住雷劫洗礼`,
        ].join("\n"));
    }
    // 检查成长次数是否已达潜力上限
    if (weapon.成长次数 >= weapon.潜力) {
        return e.reply([
            `帝兵潜力已耗尽！`,
            `当前潜力：${weapon.潜力}星`,
            `已成长次数：${weapon.成长次数}`,
            `可通过融合仙金提升潜力上限`,
            `当前品阶：${currentRank}`,
            `最高可进阶至：唯一器（九阶）`
        ].join("\n"));
    }

    // 祭道之后的三段高阶链路：道器 → 鸿蒙器 → 唯一器。
    // 道器、鸿蒙器需要祭道之上；唯一器需要唯一道之上。
    const POST_SACRIFICE_EVOLUTION_STAGES = {
        "祭道器": { next: "道器（一阶）", power: 2.2, require: "祭道之上境界", addAllAttr: 300 },
        "道器（一阶）": { next: "道器（二阶）", power: 2.2, require: "祭道之上境界", addAllAttr: 350 },
        "道器（二阶）": { next: "道器（三阶）", power: 2.2, require: "祭道之上境界", addAllAttr: 400 },
        "道器（三阶）": { next: "道器（四阶）", power: 2.3, require: "祭道之上境界", addAllAttr: 450 },
        "道器（四阶）": { next: "道器（五阶）", power: 2.3, require: "祭道之上境界", addAllAttr: 500 },
        "道器（五阶）": { next: "道器（六阶）", power: 2.3, require: "祭道之上境界", addAllAttr: 550 },
        "道器（六阶）": { next: "道器（七阶）", power: 2.4, require: "祭道之上境界", addAllAttr: 600 },
        "道器（七阶）": { next: "道器（八阶）", power: 2.4, require: "祭道之上境界", addAllAttr: 650 },
        "道器（八阶）": { next: "道器（九阶）", power: 2.4, require: "祭道之上境界", addAllAttr: 700 },
        "道器（九阶）": { next: "鸿蒙器（一阶）", power: 2.5, require: "祭道之上境界", addAllAttr: 750 },
        "鸿蒙器（一阶）": { next: "鸿蒙器（二阶）", power: 2.5, require: "祭道之上境界", addAllAttr: 800 },
        "鸿蒙器（二阶）": { next: "鸿蒙器（三阶）", power: 2.5, require: "祭道之上境界", addAllAttr: 850 },
        "鸿蒙器（三阶）": { next: "鸿蒙器（四阶）", power: 2.6, require: "祭道之上境界", addAllAttr: 900 },
        "鸿蒙器（四阶）": { next: "鸿蒙器（五阶）", power: 2.6, require: "祭道之上境界", addAllAttr: 950 },
        "鸿蒙器（五阶）": { next: "鸿蒙器（六阶）", power: 2.6, require: "祭道之上境界", addAllAttr: 1000 },
        "鸿蒙器（六阶）": { next: "鸿蒙器（七阶）", power: 2.7, require: "祭道之上境界", addAllAttr: 1050 },
        "鸿蒙器（七阶）": { next: "鸿蒙器（八阶）", power: 2.7, require: "祭道之上境界", addAllAttr: 1100 },
        "鸿蒙器（八阶）": { next: "鸿蒙器（九阶）", power: 2.7, require: "祭道之上境界", addAllAttr: 1150 },
        "鸿蒙器（九阶）": { next: "唯一器（一阶）", power: 2.8, require: "唯一道之上境界", addAllAttr: 1200 },
        "唯一器（一阶）": { next: "唯一器（二阶）", power: 2.8, require: "唯一道之上境界", addAllAttr: 1250 },
        "唯一器（二阶）": { next: "唯一器（三阶）", power: 2.8, require: "唯一道之上境界", addAllAttr: 1300 },
        "唯一器（三阶）": { next: "唯一器（四阶）", power: 2.9, require: "唯一道之上境界", addAllAttr: 1350 },
        "唯一器（四阶）": { next: "唯一器（五阶）", power: 2.9, require: "唯一道之上境界", addAllAttr: 1400 },
        "唯一器（五阶）": { next: "唯一器（六阶）", power: 2.9, require: "唯一道之上境界", addAllAttr: 1450 },
        "唯一器（六阶）": { next: "唯一器（七阶）", power: 3.0, require: "唯一道之上境界", addAllAttr: 1500 },
        "唯一器（七阶）": { next: "唯一器（八阶）", power: 3.0, require: "唯一道之上境界", addAllAttr: 1550 },
        "唯一器（八阶）": { next: "唯一器（九阶）", power: 3.0, require: "唯一道之上境界", addAllAttr: 1600 }
    };

    // 帝兵进阶体系（按体系自动切换：仙古线 真神兵→至尊兵，遮天线 斩道王兵→极道帝兵）
    const EVOLUTION_STAGES = {
      ...(isXianguPath ? {
        "雏形": { next: "通灵", power: 2, require: "无", addAllAttr: 1 },
        "通灵": { next: "铭刻道与理", power: 2, require: "雷劫洗礼", addAllAttr: 2 },
        "铭刻道与理": { next: "真神兵", power: 2, require: "真一境界", addAllAttr: 3 },
        "真神兵": { next: "天神兵", power: 2, require: "天神境界", addAllAttr: 5 },
        "天神兵": { next: "遁一兵", power: 2, require: "遁一境界", addAllAttr: 7 },
        "遁一兵": { next: "至尊兵", power: 2, require: "至尊境界", addAllAttr: 10 },
        "至尊兵": { next: "仙器", power: 2, require: "真仙境界", addAllAttr: 20 },
        "仙器": { next: "仙王器", power: 2, require: "仙王境界", addAllAttr: 30 },
        "仙王器": { next: "准仙帝器", power: 2, require: "准仙帝境界", addAllAttr: 50 },
        "准仙帝器": { next: "仙帝器", power: 2, require: "仙帝境界", addAllAttr: 100 },
        "仙帝器": { next: "祭道器", power: 2, require: "祭道境界", addAllAttr: 200 }
      } : {
        "雏形": { next: "通灵", power: 2, require: "无", addAllAttr: 1 },
        "通灵": { next: "铭刻道与理", power: 2, require: "雷劫洗礼", addAllAttr: 2 },
        "铭刻道与理": { next: "斩道王兵", power: 2, require: "斩道境界", addAllAttr: 3 },
        "斩道王兵": { next: "圣兵", power: 2, require: "圣人境界", addAllAttr: 5 },
        "圣兵": { next: "准帝兵", power: 2, require: "准帝境界", addAllAttr: 7 },
        "准帝兵": { next: "极道帝兵", power: 2, require: "大帝境界", addAllAttr: 10 },
        "极道帝兵": { next: "仙器", power: 2, require: "红尘仙境界", addAllAttr: 20 },
        "仙器": { next: "仙王器", power: 2, require: "仙王境界", addAllAttr: 30 },
        "仙王器": { next: "准仙帝器", power: 2, require: "准仙帝境界", addAllAttr: 50 },
        "准仙帝器": { next: "仙帝器", power: 2, require: "仙帝境界", addAllAttr: 100 },
        "仙帝器": { next: "祭道器", power: 2, require: "祭道境界", addAllAttr: 200 }
      }),
      ...POST_SACRIFICE_EVOLUTION_STAGES
    };
    
    const currentStage = currentRank;
    const stageInfo = EVOLUTION_STAGES[currentStage];
    if (!stageInfo) {
        return e.reply(`「${weapon.name}」当前品阶无进阶路径，请联系管理员检查帝兵数据`);
    }
    const nextStage = stageInfo.next;
    const powerBoost = stageInfo.power;
    const requireCondition = stageInfo.require;
    
    // 检查进阶条件
    if (requireCondition !== "无") {
        // 检查玩家是否满足进阶条件
        let conditionMet = false;
        
        if (requireCondition === "雷劫洗礼") {
            conditionMet = true; // 雷劫洗礼本身就是条件
        } else if (requireCondition === "真一境界") {
            conditionMet = Number(player.xiangulevel_id) >= 9 || flowerAuthority >= 11; // 仙古·真一 / 花粉对标
        } else if (requireCondition === "天神境界") {
            conditionMet = Number(player.xiangulevel_id) >= 11 || flowerAuthority >= 12; // 仙古·天神 / 花粉对标
        } else if (requireCondition === "遁一境界") {
            conditionMet = Number(player.xiangulevel_id) >= 14 || flowerAuthority >= 15; // 仙古·遁一 / 花粉对标
        } else if (requireCondition === "至尊境界") {
            conditionMet = Number(player.xiangulevel_id) >= 15 || flowerAuthority >= 16; // 仙古·至尊 / 花粉对标
        } else if (requireCondition === "真仙境界") {
            conditionMet = Number(player.xiangulevel_id) >= 16 || flowerAuthority >= 17; // 仙古·真仙 / 花粉对标
        } else if (requireCondition === "斩道境界") {
            conditionMet = Number(player.mijinglevel_id) >= 11 || flowerAuthority >= 11; // 斩道王者 / 花粉对标
        } else if (requireCondition === "圣人境界") {
            conditionMet = Number(player.mijinglevel_id) >= 12 || flowerAuthority >= 12; // 圣人 / 花粉对标
        } else if (requireCondition === "准帝境界") {
            conditionMet = Number(player.mijinglevel_id) >= 15 || flowerAuthority >= 15; // 准帝 / 花粉对标
        } else if (requireCondition === "大帝境界") {
            conditionMet = Number(player.mijinglevel_id) >= 16 || flowerAuthority >= 16; // 大帝 / 花粉对标
        } else if (requireCondition === "红尘仙境界") {
            conditionMet = Number(player.mijinglevel_id) >= 17 || flowerAuthority >= 17; // 红尘仙 / 花粉对标
        } else if (requireCondition === "仙王境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 18 || flowerAuthority >= 18
                : Number(player.mijinglevel_id) >= 18 || flowerAuthority >= 18; // 仙王境界
        } else if (requireCondition === "准仙帝境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 20 || flowerAuthority >= 20
                : Number(player.mijinglevel_id) >= 20 || flowerAuthority >= 20; // 准仙帝境界
        } else if (requireCondition === "仙帝境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 21 || flowerAuthority >= 21
                : Number(player.mijinglevel_id) >= 21 || flowerAuthority >= 21; // 仙帝境界
        } else if (requireCondition === "祭道境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 22 || flowerAuthority >= 22
                : Number(player.mijinglevel_id) >= 22 || flowerAuthority >= 22; // 祭道境界
        } else if (requireCondition === "祭道之上境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 24 || flowerAuthority >= 23
                : Number(player.mijinglevel_id) >= 23 || flowerAuthority >= 23;
        } else if (requireCondition === "唯一道之上境界") {
            conditionMet = isXianguPath
                ? Number(player.xiangulevel_id) >= 25 || flowerAuthority >= 24
                : Number(player.mijinglevel_id) >= 24 || flowerAuthority >= 24;
        }
        
        if (!conditionMet) {
            return e.reply([
                `进阶条件不足！`,
                `当前品阶：${currentStage}`,
                `下一品阶：${nextStage}`,
                `要求：${requireCondition}`,
            ].join("\n"));
        }
    }
    
    // 添加辅助函数
    function getLevelName(condition) {
        const levelMap = {
            "真一境界": "真一",
            "天神境界": "天神",
            "遁一境界": "遁一",
            "至尊境界": "至尊",
            "真仙境界": "真仙",
            "斩道境界": "斩道王者",
            "圣人境界": "圣人",
            "准帝境界": "准帝",
            "大帝境界": "大帝",
            "红尘仙境界": "红尘仙",
            "仙王境界": "仙王",
            "准仙帝境界": "准仙帝",
            "仙帝境界": "仙帝",
            "祭道境界": "祭道",
            "祭道之上境界": "祭道之上",
            "唯一道之上境界": "唯一道之上"
        };
        return levelMap[condition] || condition;
    }
    
    // 计算消耗
    const baseCost = 10000000;
    const actualCost = Math.round(baseCost * (1 + weapon.成长次数 * 5));
    // 血气消耗比例 (100%)
    const bloodCost = Math.round(actualCost * 1);
    
    // 检查修为和血气是否足够
    if (player.修为 < actualCost || player.血气 < bloodCost) {
        const messages = [
            `资源不足！`,
            `进阶消耗：`,
            `修为：${actualCost.toLocaleString()}`,
            `血气：${bloodCost.toLocaleString()}`,
            `当前资源：`,
            `修为：${player.修为.toLocaleString()}`,
            `血气：${player.血气.toLocaleString()}`
        ];
        
        if (player.修为 < actualCost) {
            messages.push(`修为不足：${(actualCost - player.修为).toLocaleString()}`);
        }
        
        if (player.血气 < bloodCost) {
            messages.push(`血气不足：${(bloodCost - player.血气).toLocaleString()}`);
        }
        
        return e.reply(messages.join("\n"));
    }
    
    // 计算成功率
    let successRate = 0.75 - (weapon.成长次数 * 0.02);

    // 高品阶进阶更难（仙古/遮天对应档位）
    if (currentRank === "至尊兵" || currentRank === "极道帝兵") successRate = 0.3;
    if (currentRank === "仙器") successRate = 0.2;
    if (currentRank === "仙王器") successRate = 0.1;
    if (currentRank === "准仙帝器") successRate = 0.05;
    if (currentRank === "仙帝器") successRate = 0.01;
    if (currentRank === "祭道器") successRate = 0.005;
    if (currentRank.startsWith("道器（")) successRate = 0.08;
    if (currentRank.includes("鸿蒙器")) successRate = 0.03;
    if (currentRank.includes("唯一器")) successRate = 0.01;

    // 添加境界加成（按体系取对应境界）
    if (isFlowerPath) {
        if (flowerAuthority >= 17) successRate += 0.2; // 真仙对标
        if (flowerAuthority >= 18) successRate += 0.3; // 仙王对标
        if (flowerAuthority >= 20) successRate += 0.4; // 准仙帝对标
        if (flowerAuthority >= 21) successRate += 0.5; // 仙帝对标
        if (flowerAuthority >= 22) successRate += 0.6; // 祭道对标
        if (flowerAuthority >= 23) successRate += 0.7; // 祭道之上对标
        if (flowerAuthority >= 24) successRate += 0.8; // 唯一道之上对标
    } else if (isXianguPath) {
        if (player.xiangulevel_id >= 16) successRate += 0.2; // 真仙加成
        if (player.xiangulevel_id >= 18) successRate += 0.3; // 仙王加成
        if (player.xiangulevel_id >= 20) successRate += 0.4; // 准仙帝加成
        if (player.xiangulevel_id >= 21) successRate += 0.5; // 仙帝加成
        if (player.xiangulevel_id >= 22) successRate += 0.6; // 祭道加成
        if (player.xiangulevel_id >= 24) successRate += 0.7; // 祭道之上加成
        if (player.xiangulevel_id >= 25) successRate += 0.8; // 唯一道之上加成
    } else {
        if (player.mijinglevel_id >= 16) successRate += 0.2; // 大帝境界加成
        if (player.mijinglevel_id >= 17) successRate += 0.3; // 红尘仙加成
        if (player.mijinglevel_id >= 19) successRate += 0.4; // 准仙帝加成
        if (player.mijinglevel_id >= 20) successRate += 0.5; // 仙帝加成
        if (player.mijinglevel_id >= 21) successRate += 0.6; // 祭道加成
        if (player.mijinglevel_id >= 23) successRate += 0.7; // 祭道之上加成
        if (player.mijinglevel_id >= 24) successRate += 0.8; // 唯一道之上加成
    }
    // 限制成功率范围
    successRate = Math.max(0.01, Math.min(0.95, successRate));
    
    // 发送确认消息
    await e.reply([
        `【帝兵雷劫洗礼】`,
        `当前品阶：${currentStage}`,
        `下一品阶：${nextStage}`,
        `成功率：${Math.round(successRate * 100)}%`,
        `消耗修为：${actualCost.toLocaleString()}`,
        `消耗血气：${bloodCost.toLocaleString()}`,
    ].join("\n"));
    
    // 扣除资源
    player.修为 -= actualCost;
    player.血气 -= bloodCost;
    await Write_player(usr_qq, player);
    
    // 进行雷劫判定
    const rand = Math.random();
    if (rand > successRate) {
        // 进阶失败
        const damageRate = 0.1 + (1 - successRate) * 0.2;
        const damage = Math.round(weapon.HP * damageRate);
        weapon.HP -= damage;
        weapon.成长次数 += 1;
        
        // 保存帝兵
        equipment.帝兵 = weapon;
        await Write_equipment(usr_qq, equipment);
        
        return e.reply([
            `【雷劫洗礼失败】`,
            `九天神雷劈落，帝兵遭受重创！`,
            `气血损失：${damage.toLocaleString()}`,
            `当前气血：${weapon.HP.toLocaleString()}`,
            `帝兵品阶未提升，当前品阶：${currentStage}`,
            `距离${nextStage}还需努力！`
        ].join('\n'));
    }
    
    // 进阶成功
    weapon.品阶 = nextStage;
    weapon.成长次数 += 1;
    
    // 提升属性
    weapon.atk = Math.round(weapon.atk * powerBoost);
    weapon.def = Math.round(weapon.def * powerBoost);
    weapon.HP = Math.round(weapon.HP * powerBoost);
    

    
    // 计算新全属性值
     weapon.全属性 += stageInfo.addAllAttr;
    

    // 暴击率提升：高阶三大体系沿用2.5周目的阶段增幅，唯一器九阶额外圆满+10%。
    const baoIncreaseMap = {
        "极道帝兵": 0.05,
        "仙器": 0.1,
        "仙王器": 0.15,
        "准仙帝器": 0.2,
        "仙帝器": 0.25,
        "祭道器": 0.5
    };
    for (const stage of POST_SACRIFICE_BING_RANKS) {
        if (stage.includes("道器")) baoIncreaseMap[stage] = 0.03;
        else if (stage.includes("鸿蒙器")) baoIncreaseMap[stage] = 0.05;
        else if (stage === "唯一器（九阶）") baoIncreaseMap[stage] = 0.18;
        else if (stage.includes("唯一器")) baoIncreaseMap[stage] = 0.08;
    }
    const baoIncrease = baoIncreaseMap[nextStage] || 0;
    if (baoIncrease > 0) weapon.bao = (weapon.bao || 0) + baoIncrease;
    
    // 保存帝兵
    equipment.帝兵 = weapon;
    await Write_equipment(usr_qq, equipment);
    
    // 生成成功消息
    const weaponForm = weapon.name.match(/剑|鼎|枪|钟|塔|镜|印|刀|斧|戟|鞭|琴|扇/)?.[0] || "帝兵";
    
    // 添加辅助函数
    function getBaoIncrease(stage) {
        const increaseMap = {
            "极道帝兵": 5,
            "仙器": 10,
            "仙王器": 15,
            "准仙帝器": 20,
            "仙帝器": 25,
            "祭道器": 50,
            ...Object.fromEntries(POST_SACRIFICE_BING_RANKS.map(stage => [
                stage,
                stage.includes("道器") ? 3 : stage.includes("鸿蒙器") ? 5 : stage === "唯一器（九阶）" ? 18 : 8
            ]))
        };
        return increaseMap[stage] || 0;
    }
    
    // 特殊品阶的消息
    let specialTitle = "";
    let specialDesc = "";
    
    if (nextStage === "唯一器（九阶）") {
        specialTitle = "【帝兵圆满·大道唯一】";
        specialDesc = `祭道之上，唯一独尊，万古不朽！`;
    } else if (nextStage.includes("唯一器")) {
        specialTitle = "【唯一器现世·独尊万古】";
        specialDesc = `唯一之道烙印，万兵皆为蝼蚁！`;
    } else if (nextStage.includes("鸿蒙器")) {
        specialTitle = "【鸿蒙器显化·混沌初开】";
        specialDesc = `鸿蒙紫气萦绕，重塑帝兵本源！`;
    } else if (nextStage.includes("道器")) {
        specialTitle = "【道器降世·万法归宗】";
        specialDesc = `道则共鸣，天地臣服！`;
    } else if (nextStage === "准仙帝器") {
        specialTitle = "【准仙帝器出世·纪元更迭】";
        specialDesc = `时间长河倒流，纪元更迭！`;
    } else if (nextStage === "仙帝器") {
        specialTitle = "【仙帝器诞生·诸天共尊】";
        specialDesc = `仙光耀世，万道臣服！`;
    } else if (nextStage === "祭道器") {
        specialTitle = "【祭道器诞生·诸天同悲】";
        specialDesc = `万道崩解，诸天同悲！`;
    }
    
    const successMsg = [
        specialTitle ? specialTitle : `【帝兵进阶成功】`,
        specialDesc ? specialDesc : `九天神雷淬炼，大道符文铭刻！`,
        `${weaponForm}形帝兵「${weapon.name}」成功进阶为「${nextStage}」！`,
        `属性提升：`,
        `攻击：${weapon.atk.toLocaleString()}（×${powerBoost}）`,
        `防御：${weapon.def.toLocaleString()}（×${powerBoost}）`,
        `气血：${weapon.HP.toLocaleString()}（×${powerBoost}）`,
        `全属性加成：${weapon.全属性.toLocaleString()}`,
        nextStage === "极道帝兵" || nextStage === "仙器" || 
        nextStage === "仙王器" || nextStage === "准仙帝器" || 
        nextStage === "仙帝器" || nextStage === "祭道器" || baoIncrease > 0 ?
        `暴击率：+${getBaoIncrease(nextStage)}% → ${Math.round(weapon.bao * 100)}%` : "",
        `当前成长次数：${weapon.成长次数}/${weapon.潜力}`,
        weapon.成长次数 < weapon.潜力 ? 
            `可继续进阶` : `潜力已耗尽，需融合仙金提升潜力`
    ].filter(Boolean).join("\n");
    
    e.reply(successMsg);
    return true;
}
async forgeEmperorWeapon(e) {
    if (!e.isGroup) return;
    
    // 解析命令
    const match = e.msg.match(/^#以(.*)炼制帝兵(.*)$/);
    if (!match) return false;
    
    const materialName = match[1].trim();
    const weaponName = match[2].trim();
    const usr_qq = e.user_id;
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);

    const chuilian = {
            "id": 23001005,
            "name": "神纹锤炼法",
            "class": "功法",
            "type": "炼器",
            "desc": "以神纹锤炼本命法器",
            "出售价": 1000000
    };
    

    if (!player.学习的功法.includes(chuilian.name)) {
       return e.reply(`你没有炼制本命帝兵的法门`);
    }
    // 检查材料是否存在
    if (!await exist_najie_thing(usr_qq, materialName, "材料")) {
        return e.reply(`你缺少【${materialName}】材料`);
    }
    
    // 定义必须包含的帝兵形态字眼
    const REQUIRED_WEAPON_FORMS = ["剑", "鼎", "枪", "钟", "塔", "镜", "印", "刀", "斧", "戟", "鞭", "琴", "扇"];
    
    // 检查帝兵名称是否包含必要字眼
    const isValidWeaponName = REQUIRED_WEAPON_FORMS.some(form => 
        weaponName.includes(form)
    );
    
    if (!isValidWeaponName) {
        return e.reply([
            `帝兵名称必须包含以下形态之一：`,
            REQUIRED_WEAPON_FORMS.join("、"),
            `例如：#以仙泪绿金炼制帝兵「混沌剑」`,
            `请重新命名！`
        ].join("\n"));
    }
    
    // 获取材料稀有度
    const rarity = MATERIAL_RARITY[materialName] || 5;
    
    // 消耗材料
    await Add_najie_thing(usr_qq, materialName, "材料", -1);
    
    // 创建帝兵 - 使用统一的属性名称
    const weapon = {
        id: 1997, // 唯一ID
        name: weaponName,
        author_name: player.id,
        class:"装备",
        type: "帝兵",
        品阶: "雏形",
        主材料: materialName,
        atk: Math.floor(rarity * 800 ), // 攻击
        def: Math.floor(rarity * 800 ),  // 防御
        HP: Math.floor(rarity * 800 ),  // 血量
        全属性:rarity * 0.1 ,  
        出售价:rarity * 120000,
        bao: 0.03, // 暴击率加成
        潜力: rarity * 0.3, // 稀有度越高潜力越大
        成长次数: 0
    };
    
    // 保存帝兵
    equipment.帝兵 = weapon;
    await Add_najie_thing(usr_qq, weapon,"装备",1);
    
    // 从名称中提取帝兵形态
    const weaponForm = REQUIRED_WEAPON_FORMS.find(form => 
        weaponName.includes(form)
    ) || "兵器";
    
    // 潜力星级
    const potentialStars = Math.min(5, Math.floor(rarity / 2));
    
    // 生成成功消息
    const successMsg = [
        `【极道帝兵现世】`,
        `九天神雷劈开混沌，大道梵音响彻星域！`,
        `${weaponForm}形帝兵「${weaponName}」横空出世！`,
        `使用材料：${materialName}（稀有度${rarity}）`,
        `初始属性：`,
        `攻击 │ ${weapon.atk.toLocaleString()}`,
        `防御 │ ${weapon.def.toLocaleString()}`,
        `气血 │ ${weapon.HP.toLocaleString()}`,
        `全属性加成 │ ${weapon.全属性.toLocaleString()}`, 
        `此兵可随主人渡劫成长，当前潜力：${'★'.repeat(potentialStars)}`,
        `帝兵等阶：${weapon.品阶}`,
        `需以自身道与法温养，历经雷劫方能极尽升华！`
    ].join("\n");
    
    e.reply(successMsg);
    return true;
}
async fuseEmperorWeapon(e) {
    if (!e.isGroup) return;
    
    // 解析命令
    const match = e.msg.match(/^#以(.*)融合帝兵$/);
    if (!match) return false;
    
    const materialName = match[1].trim();
    const usr_qq = e.user_id;
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
       // 检查是否有帝兵
    if (!equipment.帝兵.author_name||equipment.帝兵.author_name&&equipment.帝兵.author_name!=player.id) {
        return e.reply("这并非你的本命帝兵，无法进行融合");
    }

    
    // 获取帝兵
    const weapon = equipment.帝兵;
    
    // 检查是否已达上限
    if (weapon.品阶 === "唯一器（九阶）") {
        return e.reply([
            `帝兵已达上限！`,
            `「${weapon.name}」已进阶至最高品阶「唯一器（九阶）」`,
            `无法再融合新的仙金材料`
        ].join("\n"));
    }
    
    // 设置潜力上限
    const MAX_POTENTIAL = 40;
    if (weapon.潜力 >= MAX_POTENTIAL) {
        return e.reply([
            `帝兵潜力已达上限！`,
            `当前潜力：${weapon.潜力}星（最大${MAX_POTENTIAL}星）`,
            `无法再融合新的仙金材料`
        ].join("\n"));
    }
    
    // 检查材料是否为九大仙金
    const IMMORTAL_GOLDS = [
        "仙泪绿金", "凰血赤金", "龙纹黑金", "永恒蓝金",
        "神痕紫金", "道劫黄金", "羽化青金", "混沌石精",
        "大罗银精", "太初源金", "混沌母金", "万物源金"
    ];
    
    if (!IMMORTAL_GOLDS.includes(materialName)) {
        return e.reply([
            `「${materialName}」非九大仙金！`,
            `可用的仙金材料：`,
            IMMORTAL_GOLDS.join("、"),
            `例如：#以仙泪绿金融合帝兵`
        ].join("\n"));
    }
    
    // 检查材料是否存在
    if (!await exist_najie_thing(usr_qq, materialName, "材料")) {
        return e.reply(`你缺少【${materialName}】仙金`);
    }
    
    // ===== 关键检查：是否已使用过该仙金 =====
    // 检查是否作为主材料使用过
    const isMainMaterial = weapon.主材料 === materialName;
    // 检查是否作为融合材料使用过
    const isFusedMaterial = weapon.融合仙金 && weapon.融合仙金.includes(materialName);
    
    if (isMainMaterial || isFusedMaterial) {
        let msg = `「${weapon.name}」已融合过${materialName}，每种仙金只能融合一次！`;
        
        if (isMainMaterial) {
            msg += `\n（该仙金是帝兵的主材料）`;
        } else {
            msg += `\n（该仙金已作为融合材料使用过）`;
        }
        
        return e.reply(msg);
    }
    
    // 获取仙金稀有度
    const MATERIAL_RARITY = {
        "大罗银精": 9,
        "仙泪绿金": 9,
        "凰血赤金": 9,
        "龙纹黑金": 9,
        "永恒蓝金": 9,
        "神痕紫金": 9,
        "道劫黄金": 9,
        "羽化青金": 9,
        "混沌石精": 9
    };
    
    const rarity = MATERIAL_RARITY[materialName] || 9;
    
    // 消耗材料
    await Add_najie_thing(usr_qq, materialName, "材料", -1);
    
    // 记录融合仙金
    if (!weapon.融合仙金) weapon.融合仙金 = [];
    weapon.融合仙金.push(materialName);
    
    // 潜力提升值 = 稀有度 / 2（四舍五入）
    const potentialBoost = Math.round(rarity / 3);
    
    // 提升潜力（注意：先计算新的潜力值，然后不超过上限）
    weapon.潜力 = Math.min(weapon.潜力 + potentialBoost, MAX_POTENTIAL);
    
    // 保存帝兵
    equipment.帝兵 = weapon;
    await Write_equipment(usr_qq, equipment);
    
    // 生成成功消息
    const weaponForm = weapon.name.match(/剑|鼎|枪|钟|塔|镜|印|刀|斧|戟|鞭|琴|扇/)?.[0] || "帝兵";
    
    const successMsg = [
        `【帝兵融合·仙金融道】`,
        `九天神火焚尽虚空，${materialName}化作道则神链！`,
        `${weaponForm}形帝兵「${weapon.name}」与仙金融为一体！`,
        `潜力提升：+${potentialBoost}星 → ${weapon.潜力}星${weapon.潜力 === MAX_POTENTIAL ? "（已达上限）" : ""}`,
        `当前品阶：${weapon.品阶}`,
        `已融合仙金：${weapon.主材料}（主材）${weapon.融合仙金.join("、")}`,
        weapon.潜力 < MAX_POTENTIAL ? 
            `可继续融合仙金提升潜力上限` : 
            `潜力已达上限，无法再提升`,
        `使用 #以雷劫洗礼帝兵 提升帝兵品阶`
    ].join("\n");
    
    e.reply(successMsg);
    return true;
}



  // 开始寻脉定源
async xunyuan2(e) {
    let usr_qq = e.user_id;
    if (!await existplayer(usr_qq)) return;
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }

    // 源天师职业验证
    let player = await Read_player(usr_qq);
    if (player.occupation !== "源天师") {
        e.reply("您并非源天师，没有拘禁山川龙脉改天换地的能力又怎么定源?");
        return;
    }

    // 时间处理（标准化为15分钟倍数）
    let time = parseInt(e.msg.replace("#寻脉定源", "").replace("分钟", "")) || 30;
    const TIME_UNIT = 15; // 基础时间单位
    const MAX_CYCLES = 480; // 最大循环次数
    
    // 寻找最近的TIME_UNIT倍数
    for (let i = MAX_CYCLES; i > 0; i--) {
        if (time >= TIME_UNIT * i) {
            time = TIME_UNIT * i;
            break;
        }
    }
  time = Math.max(time, 30); // 最低30分钟

  // 动作冲突检查
  let action = await redis.get(`xiuxian:player:${usr_qq}:action`);
  action = JSON.parse(action);
  if (action && Date.now() <= action.end_time) {
      const remain = action.end_time - Date.now();
      const m = Math.floor(remain / 60000);
      const s = Math.floor((remain % 60000) / 1000);
      e.reply(`正在${action.action}中，剩余时间:${m}分${s}秒`);
      return;
  }

  // 设置新动作
  const action_time = time * 60000; // 毫秒
  const arr = {
      action: '寻脉定源',
      start_time: Date.now(),
      end_time: Date.now() + Math.floor(action_time * getTimedActionMultiplier(player)),
        time: action_time,
        xunyuan2:0,plant: 1, shutup: 1, working: 1, 
        Place_action: 1, power_up: 1, mojie: 1,
        xijie: 1, mine: 1, shoulie: 1
    };
    if (e.isGroup) arr.group_id = e.group_id;

    await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(arr));
    e.reply(`现在开始寻脉定源${time}分钟`);
}

// 结束寻脉定源
async xunyuan2_back(e) {
    if (!verc({ e })) {
        e.reply("验证失败，无法结束寻脉定源！");
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 获取当前动作
    const actionData = await redis.get(`xiuxian:player:${usr_qq}:action`);
    const action = JSON.parse(actionData);
    if (!action || action.action !== '寻脉定源') {
        e.reply("你当前没有进行寻脉定源");
        return;
    }

    // 计算有效时间
    const start_time = action.start_time || action.end_time - action.time;
    const now = Date.now();
    let validTime = 0;
    const TIME_UNIT = 15;
    const MAX_CYCLES = 480;

    if (now < action.end_time) {
        // 提前结束
        validTime = Math.floor((now - start_time) / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    } else {
        // 超时结算
        validTime = Math.floor(action.time / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    }
    
    // 执行结算
    if (e.isGroup) {
        await this.xunyuan2_jiesuan(usr_qq, validTime, e.group_id);
    } else {
        await this.xunyuan2_jiesuan(usr_qq, validTime);
    }

    // 更新动作状态
    action.is_jiesuan = 1;
    action.xunyuan2 = 1;
    action.end_time = now;
    delete action.group_id;
    await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(action));
}

// 寻脉定源结算
async xunyuan2_jiesuan(usr_qq, time, group_id) {
    const player = data.getData("player", usr_qq);
    if (!player.level_id) return;

    // 源天师职业加成计算
    const exp = (player.occupation === "源天师") ? time * 100 : 0;
    const rate = data.occupation_exp_list.find(
        item => item.id == player.occupation_level
    )?.rate * 10 || 1;
    
    // 资源计算（龙脉能量）
    const baseAmount = Math.floor((1.8 + Math.random() * 0.4) * time);
    const rareAmount = Math.floor(time / 30);
    let end_amount = Math.floor(3 * (rate + 1) * baseAmount); // 超品源石
    let end_amount2 = Math.floor(2 * (rate + 0.7) * rareAmount); // 上品神源石
    let end_amount3 = Math.floor(1 * (rate + 0.5) * rareAmount); // 超品神源石

    // 境界惩罚（化神以下受压制）
    const levelFactor = player.level_id <= 21 
        ? player.level_id / 80 
        : player.level_id / 40;
    
    end_amount = Math.floor(end_amount * levelFactor);
    end_amount2 = Math.floor(end_amount2 * levelFactor);
    end_amount3 = Math.floor(end_amount3 * levelFactor);

    // 添加龙脉资源
    await Add_najie_thing(usr_qq, "超品源石", "道具", end_amount);
    await Add_najie_thing(usr_qq, "上品神源石", "道具", end_amount2);
    await Add_najie_thing(usr_qq, "神源液", "丹药", end_amount2);
    await Add_najie_thing(usr_qq, "超品神源石", "道具", end_amount3);
    await Add_najie_thing(usr_qq, "神源药", "丹药", end_amount3);
    await Add_职业经验(usr_qq, exp);

    // 构造龙脉能量报告
    let msg = `【${player.名号}】寻脉定源归来，`;
    if (exp > 0) {
        msg += `获得${exp}点龙脉勘测经验，`;
        msg += `源石产量提升${Math.floor(rate * 100)}%，`;
    }
    
    // 添加境界警告
    if (player.level_id <= 21) {
        const penalty = (1 - player.level_id / 40) * 50;
        msg += `\n⚠️境界压制：遭遇诡异怪物，产量降低${penalty.toFixed(1)}%`;
    }
    
     
    if (Math.random() > 0.85) {
      await Add_najie_thing(usr_qq, "龙脉精华", "道具", 1);
      msg += `\n\n🏮发现上古遗迹！获得【龙脉精华】×1`;
    }
    msg += `\n\n收获龙脉精华：`;
    msg += `\n超品源石 × ${end_amount}`;
    msg += `\n上品神源石 × ${end_amount2} + 神源液 × ${end_amount2}`;
    msg += `\n超品神源石 × ${end_amount3} + 神源药 × ${end_amount3}`;
    
    // 发送结果
    if (group_id) {
        await this.pushInfo(group_id, true, msg);
    } else {
        await this.pushInfo(usr_qq, false, msg);
    }
}
  async xunyuan(e) {
    let usr_qq = e.user_id;
    // 账号检查
    if (!await existplayer(usr_qq)) return;
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }

    // 职业验证
    let player = await Read_player(usr_qq);
    if (player.occupation != "源师") {
        e.reply("您又不是源师，怎么寻找源脉?");
        return;
    }

    // 时间处理（标准化为15分钟倍数）
    let time = parseInt(e.msg.replace("#寻源", "").replace("分钟", "")) || 30;
    const TIME_UNIT = 15; // 基础时间单位
    const MAX_CYCLES = 480; // 最大循环次数
    
    // 寻找最近的TIME_UNIT倍数
    for (let i = MAX_CYCLES; i > 0; i--) {
        if (time >= TIME_UNIT * i) {
            time = TIME_UNIT * i;
            break;
        }
    }
    time = Math.max(time, 30); // 最低30分钟

    // 动作冲突检查
    let action = await redis.get(`xiuxian:player:${usr_qq}:action`);
    action = JSON.parse(action);
    if (action && new Date().getTime() <= action.end_time) {
        const remain = action.end_time - Date.now();
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        e.reply(`正在${action.action}中，剩余时间:${m}分${s}秒`);
        return;
    }

    // 设置新动作
    const action_time = time * 60000; // 毫秒
    const arr = {
        action: '寻源',
        start_time: Date.now(),
        end_time: Date.now() + Math.floor(action_time * getTimedActionMultiplier(player)),
        time: action_time,xunyuan:0,
        plant: 1, shutup: 1, working: 1, 
        Place_action: 1, power_up: 1, mojie: 1,
        xijie: 1, mine: 1, shoulie: 1
    };
    if (e.isGroup) arr.group_id = e.group_id;

    await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(arr));
    e.reply(`现在开始寻源${time}分钟`);
}

async xunyuan_back(e) {
    if (!verc({ e })) {
        e.reply("验证失败，无法结束寻源！");
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 获取当前动作
    const actionData = await redis.get(`xiuxian:player:${usr_qq}:action`);
    const action = JSON.parse(actionData);
    if (!action || action.action !== '寻源') {
        e.reply("你当前没有进行寻源");
        return;
    }

    // 计算有效时间
    const start_time = action.start_time || action.end_time - action.time;
    const now = Date.now();
    let validTime = 0;
    const TIME_UNIT = 15;
    const MAX_CYCLES = 480;

    if (now < action.end_time) {
        // 提前结束
        validTime = Math.floor((now - start_time) / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    } else {
        // 超时结算
        validTime = Math.floor(action.time / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    }
    
    // 执行结算
    if (e.isGroup) {
        await this.xunyuan_jiesuan(usr_qq, validTime, e.group_id);
    } else {
        await this.xunyuan_jiesuan(usr_qq, validTime);
    }

    // 更新动作状态
    action.is_jiesuan = 1;
    action.xunyuan = 1;
    action.end_time = now;
    delete action.group_id;
   await redis.del(`xiuxian:player:${usr_qq}:action`);
}

async xunyuan_jiesuan(usr_qq, time, group_id) {
    const player = data.getData("player", usr_qq);
    if (!player.level_id) return;

    // 职业加成计算
    const exp = (player.occupation === "源师") ? time * 100 : 0;
    const rate = data.occupation_exp_list.find(
        item => item.id == player.occupation_level
    )?.rate * 10 || 1;
    
    // 资源计算
    const baseAmount = Math.floor((1.8 + Math.random() * 0.4) * time);
    const rareAmount = Math.floor(time / 30);
    let end_amount = Math.floor(3 * (rate + 1) * baseAmount);
    let end_amount2 = Math.floor(2 * (rate + 0.7) * rareAmount);
    let end_amount3 = Math.floor(1 * (rate + 0.5) * rareAmount);

    // 境界惩罚
    const levelFactor = player.level_id <= 21 
        ? player.level_id / 80 
        : player.level_id / 40;
    
    end_amount = Math.floor(end_amount * levelFactor);
    end_amount2 = Math.floor(end_amount2 * levelFactor);
    end_amount3 = Math.floor(end_amount3 * levelFactor);

    // 添加资源
    await Add_najie_thing(usr_qq, "下品源石", "道具", end_amount);
    await Add_najie_thing(usr_qq, "中品源石", "道具", end_amount);
    await Add_najie_thing(usr_qq, "上品源石", "道具", end_amount2);
    await Add_najie_thing(usr_qq, "神源石", "道具", end_amount3);
    await Add_najie_thing(usr_qq, "凡源药", "丹药", end_amount3);
    await Add_职业经验(usr_qq, exp);

    // 构造消息
    let msg = `【${player.名号}】寻源归来，`;
    if (exp > 0) msg += `获得寻源经验${exp}，`;
    msg += `收获：\n下品源石×${end_amount}\n中品源石×${end_amount}\n上品源石×${end_amount2}\n神源石×${end_amount3}\n凡源药×${end_amount3}`;
    
    // 发送结果
    if (group_id) {
        await this.pushInfo(group_id, true, msg);
    } else {
        await this.pushInfo(usr_qq, false, msg);
    }
}
 async xunyuan3(e) {
    let usr_qq = e.user_id;
    // 账号检查
    if (!await existplayer(usr_qq)) return;
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }

    // 职业验证
    let player = await Read_player(usr_qq);
    if (player.occupation != "源地师") {
        e.reply("您又不是源地师，怎么感知地脉流转，引导山川精气?");
        return;
    }

    // 时间处理（标准化为15分钟倍数）
    let time = parseInt(e.msg.replace("#地脉引气", "").replace("分钟", "")) || 30;
    const TIME_UNIT = 15; // 基础时间单位
    const MAX_CYCLES = 480; // 最大循环次数
    
    // 寻找最近的TIME_UNIT倍数
    for (let i = MAX_CYCLES; i > 0; i--) {
        if (time >= TIME_UNIT * i) {
            time = TIME_UNIT * i;
            break;
        }
    }
    time = Math.max(time, 30); // 最低30分钟

    // 动作冲突检查
    let action = await redis.get(`xiuxian:player:${usr_qq}:action`);
    action = JSON.parse(action);
    if (action && new Date().getTime() <= action.end_time) {
        const remain = action.end_time - Date.now();
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        e.reply(`正在${action.action}中，剩余时间:${m}分${s}秒`);
        return;
    }

    // 设置新动作
    const action_time = time * 60000; // 毫秒
    let arr = {
        action: '地脉引气',
        start_time: Date.now(),
        end_time: Date.now() + Math.floor(action_time * getTimedActionMultiplier(player)),
        time: action_time,xunyuan3:0,
        plant: 1, shutup: 1, working: 1, 
        Place_action: 1, power_up: 1, mojie: 1,
        xijie: 1, mine: 1, shoulie: 1
    };
    if (e.isGroup) {
      arr.group_id = e.group_id;
    }


    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    e.reply(`现在开始地脉引气${time}分钟`);
}
async xunyuan3_back(e) {
    if (!verc({ e })) {
        e.reply("验证失败，无法结束寻源！");
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 获取当前动作
    const actionData = await redis.get(`xiuxian:player:${usr_qq}:action`);
    const action = JSON.parse(actionData);
    if (!action || action.action !== '地脉引气') {
        e.reply("你当前没有进行地脉引气");
        return;
    }

    // 计算有效时间
    const start_time = action.start_time || action.end_time - action.time;
    const now = Date.now();
    let validTime = 0;
    const TIME_UNIT = 15;
    const MAX_CYCLES = 480;

    if (now < action.end_time) {
        // 提前结束
        validTime = Math.floor((now - start_time) / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    } else {
        // 超时结算
        validTime = Math.floor(action.time / 60000);
        for (let i = MAX_CYCLES; i > 0; i--) {
            if (validTime >= TIME_UNIT * i) {
                validTime = TIME_UNIT * i;
                break;
            }
        }
    }
    
    // 执行结算
    if (e.isGroup) {
        await this.xunyuan3_jiesuan(usr_qq, validTime, e.group_id);
    } else {
        await this.xunyuan3_jiesuan(usr_qq, validTime);
    }

    // 更新动作状态
    action.is_jiesuan = 1;
    action.xunyuan3 = 1;
    action.end_time = now;
    delete action.group_id;
    await redis.del(`xiuxian:player:${usr_qq}:action`, JSON.stringify(action));
}
async xunyuan3_jiesuan(usr_qq, time, group_id) {
    const player = data.getData("player", usr_qq);
    if (!player.level_id) return;

    // 职业加成计算
    const exp = (player.occupation === "源地师") ? time * 100 : 0;
    const rate = data.occupation_exp_list.find(
        item => item.id == player.occupation_level
    )?.rate * 10 || 1;
    
    const rareAmount = Math.floor(time / 30);
    let end_amount2 = Math.floor(4 * (rate + 0.7) * rareAmount);
    let end_amount3 = Math.floor(1 * (rate + 0.5) * rareAmount);

    // 境界惩罚
    const levelFactor = player.level_id <= 21 
        ? player.level_id / 80 
        : player.level_id / 40;
    

    end_amount2 = Math.floor(end_amount2 * levelFactor);
    end_amount3 = Math.floor(end_amount3 * levelFactor);

    await Add_najie_thing(usr_qq, "上品源石", "道具", end_amount2);
    await Add_najie_thing(usr_qq, "超品源石", "道具", end_amount2);
    await Add_najie_thing(usr_qq, "神源石", "道具", end_amount2);
    await Add_najie_thing(usr_qq, "地源药", "丹药", end_amount3);
    await Add_职业经验(usr_qq, exp);

    // 构造消息
    let msg = `【${player.名号}】地脉引气归来，`;
    if (exp > 0) msg += `获得地脉引气经验${exp}，`;
    msg += `收获：\n上品源石×${end_amount2}\n神源石×${end_amount2}\n超品源石 × ${end_amount2}\n地源药×${end_amount3}`;
    
    // 发送结果
    if (group_id) {
        await this.pushInfo(group_id, true, msg);
    } else {
        await this.pushInfo(usr_qq, false, msg);
    }
}
 async taofahuaidan(e) {
    let usr_qq = e.user_id;
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply("玩家不存在，请先创建角色");
        return;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != "侠客") {
        e.reply("非侠客不能执行此操作");
        return;
    }

    let 侠客令 = await exist_najie_thing(usr_qq, "侠客令", "道具")
    // 检查侠客令道具数量
    if (侠客令 < 1) {
        e.reply("您没有侠客令道具，无法进行消灭");
        return;
    }
    
    let action = await redis.get("xiuxian:player:" + usr_qq + ":jiangjing");
    if (!action) {
        e.reply("当前没有可消灭的目标");
        return;
    }
    action = JSON.parse(action);

    if (action.arm.length === 0) {
        e.reply("当前没有可消灭的目标");
        return;
    }

    let num = e.msg.replace("#消灭恶人", '');
    num = parseInt(num.trim()) - 1;

    if (isNaN(num) || num < 0 || num >= action.arm.length) {
        e.reply("目标编号错误");
        return;
    }

    // 使用与劫掠村庄相似的计算格式
    let baseReward = 500; // 基础赏金
    let levelMultiplier = 1.2 + 0.02 * player.occupation_level; // 等级倍数
    let target赏金 = Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5);
    let zuizhongjiangli = Math.floor(target赏金 * 0.0002); // 降低的魔道值
    const end_amount = Math.floor(target赏金 * 0.0001);
    let ent = Math.floor(end_amount * 0.015);

    let target = action.arm[num];
    let last_msg = "";
    
    // 执行消灭逻辑
    player.灵石 += target赏金;
    player.魔道值 -= zuizhongjiangli;
    await Add_najie_thing(usr_qq, "侠客令", "道具", -1);
    await Write_player(usr_qq, player);
    await Add_职业经验(usr_qq, 2255);
    
    // 添加侠客特色奖励
    await Add_najie_thing(usr_qq, "四阶淬体丹", "丹药", end_amount);
    await Add_najie_thing(usr_qq, "四阶玄元丹", "丹药", end_amount);
    await Add_najie_thing(usr_qq, "秘境之匙", "道具", ent);
    
    // 构建消息 - 保持与劫掠村庄相似的格式
    last_msg = `你消灭了【${target.名号}】,获得灵石${target赏金}，降低魔道值${zuizhongjiangli}\n`;
    last_msg += `你搜刮了恶人的巢穴，发现了一些丹药和宝物：\n`;
    last_msg += `四阶淬体丹 × ${end_amount}\n`;
    last_msg += `四阶玄元丹 × ${end_amount}\n`;
    last_msg += `秘境之匙 × ${ent}`;

    // 从列表中移除目标
    action.arm.splice(num, 1);
    await redis.set("xiuxian:player:" + usr_qq + ":jiangjing", JSON.stringify(action));

    e.reply(last_msg);
}
async chakanhuaidan(e) {
    let usr_qq = e.user_id;
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply("玩家不存在，请先创建角色");
        return;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != "侠客") {
        e.reply("非侠客不能执行此操作");
        return;
    }

    // 尝试获取现有的恶人列表
    let action = await redis.get("xiuxian:player:" + usr_qq + ":jiangjing");
    let mubiao = [];
    let needRefresh = true;

    // 如果存在且未过期，则使用现有的恶人列表
    if (action) {
        action = JSON.parse(action);
        // 检查是否过期
        if (new Date().getTime() < action.end_time) {
            mubiao = action.arm;
            needRefresh = false;
        }
    }

    // 如果恶人列表为空或需要刷新，则生成新的恶人
    if (mubiao.length === 0 || needRefresh) {
        // 生成劫掠目标
        let baseReward = 500; // 基础赏金
        let levelMultiplier = 1.2 + 0.05 * player.occupation_level; // 等级倍数

        // 添加仙路窃贼目标
        mubiao.push({
            名号: "老王八蛋",
            赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5),
            掉落物: "四阶玄元丹，四阶淬体丹，秘境之匙",
            QQ: 1
        });

        // 添加村庄目标
        mubiao.push({
            名号: "大卡拉米-老王",
            赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5),
            掉落物: "四阶玄元丹，四阶淬体丹，秘境之匙",
            QQ: 1
        });

        mubiao.push({
            名号: "邪神信徒",
            赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5),
            掉落物: "四阶玄元丹，四阶淬体丹，秘境之匙",
            QQ: 1
        });

        // 设置劫掠目标和结束时间
        let arr = {
            arm: mubiao,
            end_time: new Date().getTime() + 60000 * 60 * 12, // 12小时后刷新
        };
        await redis.set("xiuxian:player:" + usr_qq + ":jiangjing", JSON.stringify(arr));
    }

    // 显示劫掠目标
    let msg_data = {
        msg: mubiao,
        type: 2
    };
    const data1 = await new Show(e).get_msg(msg_data);
    let img = await puppeteer.screenshot("msg", {
        ...data1,
    });
    e.reply(img);
    return;
}
     async shoulie(e) {
        let usr_qq = e.user_id;//用户qq
        //有无存档
        if (!await existplayer(usr_qq)) {
            return;
        }

        //不开放私聊
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let player = await Read_player(usr_qq);
        if (player.occupation != "猎户") {
            e.reply("你的狩猎许可证呢？盗猎是吧？罚款2000灵石。")
            await Add_灵石(usr_qq, -2000)
            return
        }

        //获取时间
        let time = e.msg.replace("#狩猎", "");
        time = time.replace("分钟", "");
        if (parseInt(time) == parseInt(time)) {
            time = parseInt(time);
            var y = 30;//时间
            var x = 240;//循环次数
            //如果是 >=16*33 ----   >=30
            for (var i = x; i > 0; i--) {
                if (time >= y * i) {
                    time = y * i;
                    break;
                }
            }
            //如果<30，修正。
            if (time < 30) {
                time = 30;
            }
        }
        else {
            //不设置时间默认30分钟
            time = 30;
        }

         //查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    action = JSON.parse(action);
    if (action != null) {
      //人物有动作查询动作结束时间
      let action_end_time = action.end_time;
      let now_time = new Date().getTime();
      if (now_time <= action_end_time) {
        let m = parseInt((action_end_time - now_time) / 1000 / 60);
        let s = parseInt((action_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply('正在' + action.action + '中，剩余时间:' + m + '分' + s + '秒');
        return false;
      }
    }

    let action_time = time * 60 * 1000; //持续时间，单位毫秒
    let arr = {
      action: '狩猎', //动作
      start_time: Date.now(),
      end_time: new Date().getTime() + Math.floor(action_time * getTimedActionMultiplier(player)), //结束时间
      time: action_time, //持续时间
      plant: '1', //采药-开启
      shoulie: '0', //狩猎-开启
      shutup: '1', //闭关状态-开启
      working: '1', //降妖状态-关闭
      Place_action: '1', //秘境状态---关闭
      Place_actionplus: '1', //沉迷---关闭
      power_up: '1', //渡劫状态--关闭
      mojie: '1', //魔界状态---关闭
      xijie: '1', //洗劫状态开启
      mine: '1', //采矿-开启
    };
    if (e.isGroup) {
      arr.group_id = e.group_id;
    }

    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr)); //redis设置动作
    e.reply(`现在开始狩猎${time}分钟`);

    return false;
  }
        
    
async shoulie_back(e) {
   if (!verc({ e })) {
        // 假设有发送消息的方法，例如 e.reply
        e.reply("验证失败，无法结束狩猎！");
        return false;
    }
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let action = await this.getPlayerAction(usr_qq);
    if (action.shoulie == 1) {
      e.reply(`你并没有狩猎`);
      return false;
    }
    //结算
    let end_time = action.end_time;
    let start_time = action.start_time || action.end_time - action.time;
    let now_time = new Date().getTime();
    let time;
    var y = 15; //固定时间
    var x = 48; //循环次数

    if (end_time > now_time) {
      //属于提前结束
      time = parseInt((new Date().getTime() - start_time) / 1000 / 60);
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    } else {
      //属于结束了未结算
      time = parseInt(action.time / 1000 / 60);
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    }
       if (e.isGroup) {
      // 将群号作为第三个参数 group_id 传入
      await this.shoulie_jiesuan(usr_qq, time, e.group_id); 
    } else {
      // 私聊时第三个参数为 undefined（或不传，但函数定义有三个参数，所以这里传undefined）
      await this.shoulie_jiesuan(usr_qq, time, undefined); 
    }
    let arr = action;
    arr.is_jiesuan = 1; //结算状态
    arr.shoulie = 1; //狩猎状态
    arr.shutup = 1; //闭关状态
    arr.working = 1; //降妖状态
    arr.power_up = 1; //渡劫状态
    arr.Place_action = 1; //秘境
    //结束的时间也修改为当前时间
    arr.end_time = new Date().getTime();
    delete arr.group_id; //结算完去除group_id
    await redis.set(
      'xiuxian:player:' +usr_qq  + ':action',
      JSON.stringify(arr)
    );
  }

  async shoulie_jiesuan(user_id, time, group_id) {
    //time的单位是min
    let usr_qq = user_id;
    let player = data.getData("player", usr_qq);
    if (!isNotNull(player.level_id)) {
        return;
    }
    let msg = `【${player.名号}】`;
    //返回数目
    let shoulie_amount = Math.floor((3 + Math.random() * 0.5) * time * 12);
    //职业经验
    let exp = 0;
    let ext = "";
    if (player.occupation == "猎户") {
        exp = time * 100;
        ext = `你是猎户，获得狩猎经验${exp}，`;
    }
    let end_amount = Math.floor(shoulie_amount)
    end_amount *= player.occupation_level / 60
    end_amount = Math.floor(end_amount);
    // 定义要添加的物品数组
    const items = [
        {name: "野兔", type: "食材", amount: end_amount},
        {name: "野鸡", type: "食材", amount: end_amount},
        {name: "野猪", type: "食材", amount: end_amount},
        {name: "野牛", type: "食材", amount: end_amount},
        {name: "野羊", type: "食材", amount: end_amount}
    ];
    msg += `\n狩猎归来，${ext}\n收获：`;
    for (let item of items) {
        await Add_najie_thing(usr_qq, item.name, item.type, item.amount);
        msg += `\n${item.name}×${item.amount}`;
    }
    await Add_职业经验(usr_qq, exp);
    let img = await get_log_img(msg);
    if (group_id) {
        await this.pushInfo(group_id, true, img);
    } else {
        await this.pushInfo(usr_qq, false, img);
    }
    return;
}

  async zhuanzhi(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    if (player.occupation != '猎户') {
      e.reply('你不是猎户,无法自选职业');
      return false;
    }
    let occupation = e.msg.replace('#猎户转', '');
    let x = data.occupation_list.find(item => item.name == occupation);
    if (!isNotNull(x)) {
      e.reply(`没有[${occupation}]这项职业`);
      return false;
    }
    if (occupation === player.occupation) {
      e.reply(`你当前已经是[${occupation}]`);
      return false;
    }
    const stored = normalizeOccupationCollection(
      await redis.get('xiuxian:player:' + usr_qq + ':fuzhi')
    );
    const { occupation: target, remaining } = takeOccupation(stored, occupation);
    const occupations = saveOccupation(remaining, snapshotOccupation(player));
    player.occupation = occupation;
    player.occupation_level = target?.职业等级 || 1;
    player.occupation_exp = target?.职业经验 || 0;
    await redis.set(
      'xiuxian:player:' + usr_qq + ':fuzhi',
      JSON.stringify(occupations)
    );
    await Write_player(usr_qq, player);
    e.reply(`恭喜${player.名号}转职为[${occupation}]`);
    return false;
  }

  async show_occupations(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!(await existplayer(usr_qq))) return false;

    const player = await Read_player(usr_qq);
    const current = snapshotOccupation(player);
    const stored = normalizeOccupationCollection(
      await redis.get('xiuxian:player:' + usr_qq + ':fuzhi')
    ).filter(item => item.职业名 !== current?.职业名);
    const format = (label, occupation) => {
      const level = data.occupation_exp_list.find(item => item.id == occupation.职业等级);
      const rank = level?.name ? `（${level.name}）` : '';
      const progress = level
        ? `${bigNumberTransform(occupation.职业经验)}/${bigNumberTransform(level.experience)}`
        : bigNumberTransform(occupation.职业经验);
      return `${label}：${occupation.职业名}｜${occupation.职业等级}级${rank}｜经验 ${progress}`;
    };
    const lines = [`【${player.名号}的职业】`];
    if (current) lines.push(format('主职', current));
    stored.forEach((occupation, index) => lines.push(format(`副职${index + 1}`, occupation)));
    if (stored.length === 0) lines.push('副职：暂无');
    e.reply(lines.join('\n'));
    return false;
  }

  async chose_occupation(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let flag = await Go(e);
    if (!flag) {
      return false;
    }
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;

    let occupation = e.msg.replace('#转职', '');
    let player = await Read_player(usr_qq);
    let player_occupation = player.occupation;
    let x = data.occupation_list.find(item => item.name == occupation);
    if (!isNotNull(x)) {
      e.reply(`没有[${occupation}]这项职业`);
      return false;
    }
    let now_level_id;
    now_level_id = data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    if (now_level_id < 17 && occupation == '采矿师') {
      e.reply('包工头:就你这小身板还来挖矿？再去修炼几年吧');
      return false;
    }
    if (now_level_id < 25 && occupation == "猎户") {
            e.reply("就你这点修为做猎户？怕不是光头强砍不到树来转的？")
            return
        }
    if (player_occupation == occupation) {
      e.reply(`你当前已经是[${player_occupation}]`);
      return false;
    }
    const stored = normalizeOccupationCollection(
      await redis.get('xiuxian:player:' + usr_qq + ':fuzhi')
    );
    if (stored.some(item => item.职业名 === occupation)) {
      e.reply(`你已经拥有[${occupation}]，请使用#转换副职${occupation}`);
      return false;
    }
    let thing_name = occupation + '转职凭证';
    let thing_class = '道具';
    let n = -1;
    let thing_quantity = await exist_najie_thing(
      usr_qq,
      thing_name,
      thing_class
    );
    if (!thing_quantity) {
      //没有
      e.reply(`你没有【${thing_name}】`);
      return false;
    }
    await Add_najie_thing(usr_qq, thing_name, thing_class, n);
    if (!player.occupation) {
      player.occupation = occupation;
      player.occupation_level = 1;
      player.occupation_exp = 0;
      await Write_player(usr_qq, player);
      e.reply(`恭喜${player.名号}转职为[${occupation}]`);
      return false;
    }
    const occupations = saveOccupation(stored, snapshotOccupation(player));
    await redis.set(
      'xiuxian:player:' + usr_qq + ':fuzhi',
      JSON.stringify(occupations)
    );
    player.occupation = occupation;
    player.occupation_level = 1;
    player.occupation_exp = 0;
    await Write_player(usr_qq, player);
    e.reply(`恭喜${player.名号}转职为[${occupation}]，已拥有${occupations.length + 1}个职业`);
    return false;
  }
  async chose_occupation2(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let flag = await Go(e);
    if (!flag) {
      return false;
    }
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;

    let player = await Read_player(usr_qq);
    const stored = normalizeOccupationCollection(
      await redis.get('xiuxian:player:' + usr_qq + ':fuzhi')
    ).filter(item => item.职业名 !== player.occupation);
    if (stored.length === 0) {
      e.reply(`您还没有副职哦`);
      return false;
    }
    let targetName = e.msg.replace('#转换副职', '').trim();
    if (!targetName && stored.length > 1) {
      e.reply(`你有多个副职，请发送#转换副职职业名\n可选：${stored.map(item => item.职业名).join('、')}`);
      return false;
    }
    if (!targetName) targetName = stored[0].职业名;
    const { occupation: target, remaining } = takeOccupation(stored, targetName);
    if (!target) {
      e.reply(`你还没有[${targetName}]职业，可发送#我的职业查看`);
      return false;
    }
    const occupations = saveOccupation(remaining, snapshotOccupation(player));
    player.occupation = target.职业名;
    player.occupation_exp = target.职业经验;
    player.occupation_level = target.职业等级;
    await redis.set(
      'xiuxian:player:' + usr_qq + ':fuzhi',
      JSON.stringify(occupations)
    );
    await Write_player(usr_qq, player);
    e.reply(`恭喜${player.名号}切换为[${player.occupation}]，该职业为${player.occupation_level}级`);
    return false;
  }

  async plant(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq); //用户qq
    if (!(await existplayer(usr_qq))) return false;
    //不开放私聊
    if (!verc({ e })) return false;
    //获取游戏状态
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return false;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != '采药师') {
      e.reply('您采药，您配吗?');
      return false;
    }
    //获取时间
    let time = e.msg.replace('#采药', '');
    time = time.replace('分钟', '');
    if (parseInt(time) == parseInt(time)) {
      time = parseInt(time);
      var y = 15; //时间
      var x = 48; //循环次数
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<30，修正。
      if (time < 30) {
        time = 30;
      }
    } else {
      //不设置时间默认30分钟
      time = 30;
    }

    //查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    action = JSON.parse(action);
    if (action != null) {
      //人物有动作查询动作结束时间
      let action_end_time = action.end_time;
      let now_time = new Date().getTime();
      if (now_time <= action_end_time) {
        let m = parseInt((action_end_time - now_time) / 1000 / 60);
        let s = parseInt((action_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply('正在' + action.action + '中，剩余时间:' + m + '分' + s + '秒');
        return false;
      }
    }

    let action_time = time * 60 * 1000; //持续时间，单位毫秒
    let arr = {
      action: '采药', //动作
      start_time: Date.now(),
      end_time: new Date().getTime() + Math.floor(action_time * getTimedActionMultiplier(player)), //结束时间
      time: action_time, //持续时间
      plant: '0', //采药-开启
      shutup: '1', //闭关状态-开启
      working: '1', //降妖状态-关闭
      Place_action: '1', //秘境状态---关闭
      Place_actionplus: '1', //沉迷---关闭
      power_up: '1', //渡劫状态--关闭
      mojie: '1', //魔界状态---关闭
      xijie: '1', //洗劫状态开启
      mine: '1', //采矿-开启
    };
    if (e.isGroup) {
      arr.group_id = e.group_id;
    }

    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr)); //redis设置动作
    e.reply(`现在开始采药${time}分钟`);

    return false;
  }

  async qingchushangjinbang(e) {
    if (!verc({ e })) return false;
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let action = await redis.get('xiuxian:player:' + 1 + ':shangjing');
    action = await JSON.parse(action);
    action = null;
    e.reply('清除完成');
    await redis.set(
      'xiuxian:player:' + 1 + ':shangjing',
      JSON.stringify(action)
    );
    return false;
  }

  async plant_back(e) {
    if (!verc({ e })) return false;
    let usr_qq=e.user_id.toString().replace('qg_','')
    usr_qq = await channel(usr_qq);
    let action = await this.getPlayerAction(usr_qq);
    if (action.plant == 1) {
      return false;
    }
    //结算
    let end_time = action.end_time;
    let start_time = action.start_time || action.end_time - action.time;
    let now_time = new Date().getTime();
    let time;
    var y = 15; //固定时间
    var x = 48; //循环次数

    if (end_time > now_time) {
      //属于提前结束
      time = parseInt((new Date().getTime() - start_time) / 1000 / 60);
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    } else {
      //属于结束了未结算
      time = parseInt(action.time / 1000 / 60);
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    }
    if (e.isGroup) {
      await this.plant_jiesuan(usr_qq, time, false, e.group_id); //提前闭关结束不会触发随机事件
    } else {
      await this.plant_jiesuan(usr_qq, time, false); //提前闭关结束不会触发随机事件
    }
    let arr = action;
    arr.is_jiesuan = 1; //结算状态
    arr.plant = 1; //采药状态
    arr.shutup = 1; //闭关状态
    arr.working = 1; //降妖状态
    arr.power_up = 1; //渡劫状态
    arr.Place_action = 1; //秘境
    //结束的时间也修改为当前时间
    arr.end_time = new Date().getTime();
    delete arr.group_id; //结算完去除group_id
    await redis.set(
      'xiuxian:player:' +usr_qq  + ':action',
      JSON.stringify(arr)
    );
  }
  async mine(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq); //用户qq
    if (!(await existplayer(usr_qq))) return false;
    //获取游戏状态
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return false;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != '采矿师') {
      e.reply('你挖矿许可证呢？非法挖矿，罚款200灵石');
      await Add_灵石(usr_qq, -200);
      return false;
    }
    //获取时间
    let time = e.msg.replace('#采矿', '');
    time = time.replace('分钟', '');
    if (parseInt(time) == parseInt(time)) {
      time = parseInt(time);
      var y = 30; //时间
      var x = 24; //循环次数
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<30，修正。
      if (time < 30) {
        time = 30;
      }
    } else {
      //不设置时间默认30分钟
      time = 30;
    }
    //查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    action = JSON.parse(action);
    if (action != null) {
      //人物有动作查询动作结束时间
      let action_end_time = action.end_time;
      let now_time = new Date().getTime();
      if (now_time <= action_end_time) {
        let m = parseInt((action_end_time - now_time) / 1000 / 60);
        let s = parseInt((action_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply('正在' + action.action + '中，剩余时间:' + m + '分' + s + '秒');
        return false;
      }
    }

    let action_time = time * 60 * 1000; //持续时间，单位毫秒
    let arr = {
      action: '采矿', //动作
      start_time: Date.now(),
      end_time: new Date().getTime() + Math.floor(action_time * getTimedActionMultiplier(player)), //结束时间
      time: action_time, //持续时间
      plant: '1', //采药-开启
      mine: '0', //采药-开启
      shutup: '1', //闭关状态-开启
      working: '1', //降妖状态-关闭
      Place_action: '1', //秘境状态---关闭
      Place_actionplus: '1', //沉迷---关闭
      power_up: '1', //渡劫状态--关闭
      mojie: '1', //魔界状态---关闭
      xijie: '1', //洗劫状态开启
    };
    if (e.isGroup) {
      arr.group_id = e.group_id;
    }

    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr)); //redis设置动作
    e.reply(`现在开始采矿${time}分钟`);

    return false;
  }

  async mine_back(e) {
    if (!verc({ e })) return false;
    let usr_qq=e.user_id.toString().replace('qg_','')
    usr_qq=await channel(usr_qq)
    let action = await this.getPlayerAction(usr_qq);
    if (action.mine == 1) return false;
    //结算
    let end_time = action.end_time;
    let start_time = action.start_time || action.end_time - action.time;
    let now_time = new Date().getTime();
    let time;
    if (end_time > now_time) {
      //属于提前结束
      time = parseInt((new Date().getTime() - start_time) / 1000 / 60);
      var y = 30; //时间
      var x = 24; //循环次数
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    } else {
      //属于结束了未结算
      time = parseInt(action.time / 1000 / 60);
      //超过就按最低的算，即为满足30分钟才结算一次
      //如果是 >=16*33 ----   >=30
      for (var i = x; i > 0; i--) {
        if (time >= y * i) {
          time = y * i;
          break;
        }
      }
      //如果<15，不给收益
      if (time < y) {
        time = 0;
      }
    }

    if (e.isGroup) {
      await this.mine_jiesuan(usr_qq, time, false, e.group_id); //提前闭关结束不会触发随机事件
    } else {
      await this.mine_jiesuan(usr_qq, time, false); //提前闭关结束不会触发随机事件
    }

    let arr = action;
    arr.is_jiesuan = 1; //结算状态
    arr.mine = 1; //采药状态
    arr.plant = 1; //采药状态
    arr.shutup = 1; //闭关状态
    arr.working = 1; //降妖状态
    arr.power_up = 1; //渡劫状态
    arr.Place_action = 1; //秘境
    //结束的时间也修改为当前时间
    arr.end_time = new Date().getTime();
    delete arr.group_id; //结算完去除group_id
    await redis.set(
      'xiuxian:player:' + usr_qq + ':action',
      JSON.stringify(arr)
    );
  }

  async plant_jiesuan(user_id, time, is_random, group_id) {
    let usr_qq = user_id;
    let player = data.getData('player', usr_qq);
    let msg = player.名号;
    let exp = 0;
    exp = time * 10;
    let k = 1;
    if (player.level_id < 22) {
      k = 0.5;
    }
    let sum = (time / 480) * (player.occupation_level * 2 + 12) * k;
    if (player.level_id >= 36) {
      sum = (time / 480) * (player.occupation_level * 3 + 11);
    }
    let names = [
      '万年凝血草',
      '万年何首乌',
      '万年血精草',
      '万年甜甜花',
      '万年清心草',
      '古神藤',
      '万年太玄果',
      '炼骨花',
      '魔蕴花',
      '万年清灵草',
      '万年天魂菊',
      '仙蕴花',
      '仙缘草',
      '太玄仙草',
    ];
    const sum2 = [0.2, 0.3, 0.2, 0.2, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const sum3 = [
      0.17, 0.22, 0.17, 0.17, 0.17, 0.024, 0.024, 0.024, 0.024, 0.024, 0.024,
      0.024, 0.012, 0.011,
    ];
    msg+=`\n恭喜你获得了经验${exp},草药:`;
    let newsum = sum3.map(item => item * sum);
    if (player.level_id < 36) {
      newsum = sum2.map(item => item * sum);
    }
    // ==== 命格消费层：采药加成 ====
    // 「草木通灵」类命格引动灵脉，使采得药草数量按数学期望增益。
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const herbBonus = minggeEffects?.['采药加成'] ? getMinggeBonusMultiplier(minggeEffects, '采药加成') : 1;
    for (let item in sum3) {
      // 先按命格期望放大，再 floor 入库，保证小额产出也有概率吃到加成
      const yieldCount = calculateMinggeYield(newsum[item], minggeEffects, '采药加成');
      if (yieldCount < 1) {
        continue;
      }
      msg+=`\n${names[item]}${yieldCount}个`;
      await Add_najie_thing(
        usr_qq,
        names[item],
        '草药',
        yieldCount
      );
    }
    if (herbBonus > 1) {
      msg+=`\n命格·草木通灵：采药产出 +${Math.round((herbBonus - 1) * 100)}%`;
    }
    await Add_职业经验(usr_qq, exp);
    let img=await get_log_img(msg)
    if (group_id) {
      await this.pushInfo(group_id, true, img);
    } else {
      await this.pushInfo(usr_qq, false, img);
    }

    return false;
  }

  async mine_jiesuan(user_id, time, is_random, group_id) {
    let usr_qq = user_id;
    let player = data.getData('player', usr_qq);
    let msg =player.名号;
    let mine_amount1 = Math.floor((1.8 + Math.random() * 0.4) * time);
    let rate =
      data.occupation_exp_list.find(item => item.id == player.occupation_level)
        .rate * 10;
    let exp = 0;
    let ext = '';
    exp = time * 10;
    ext = `你是采矿师，获得采矿经验${exp}，额外获得矿石${Math.floor(
      rate * 100
    )}%,`;
    let end_amount = Math.floor(4 * (rate + 1) * mine_amount1); //普通矿石
    let num = Math.floor(((rate / 12) * time) / 30); //锻造
    const A = [
      '金色石胚',
      '棕色石胚',
      '绿色石胚',
      '红色石胚',
      '蓝色石胚',
      '金色石料',
      '棕色石料',
      '绿色石料',
      '红色石料',
      '蓝色石料',
    ];
    const B = [
      '金色妖石',
      '棕色妖石',
      '绿色妖石',
      '红色妖石',
      '蓝色妖石',
      '金色妖丹',
      '棕色妖丹',
      '绿色妖丹',
      '红色妖丹',
      '蓝色妖丹',
    ];
    let xuanze = Math.trunc(Math.random() * A.length);
    end_amount *= player.level_id / 40;
    end_amount = Math.floor(end_amount);
    // ==== 命格消费层：采矿加成 ====
    // 「地脉亲和」类命格感应矿脉走向，使采得矿石数量按数学期望增益。
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const mineBonus = minggeEffects?.['采矿加成'] ? getMinggeBonusMultiplier(minggeEffects, '采矿加成') : 1;
    const minggeEnd = calculateMinggeYield(end_amount, minggeEffects, '采矿加成');
    const minggeNum = calculateMinggeYield(num, minggeEffects, '采矿加成');
    const minggeNumB = calculateMinggeYield(Math.trunc(num / 48), minggeEffects, '采矿加成');
    await Add_najie_thing(usr_qq, '庚金', '材料', minggeEnd);
    await Add_najie_thing(usr_qq, '玄土', '材料', minggeEnd);
    await Add_najie_thing(usr_qq, A[xuanze], '材料', minggeNum);
    await Add_najie_thing(usr_qq, B[xuanze], '材料', minggeNumB);
    await Add_职业经验(usr_qq, exp);
    msg+=`\n采矿归来，${ext}\n收获庚金×${minggeEnd}\n玄土×${minggeEnd}`;
    msg+=`\n${A[xuanze]}x${minggeNum}\n${B[xuanze]}x${minggeNumB}`;
    if (mineBonus > 1) {
      msg+=`\n命格·地脉亲和：采矿产出 +${Math.round((mineBonus - 1) * 100)}%`;
    }
    let img=await get_log_img(msg)
    if (group_id) {
      await this.pushInfo(group_id, true, img);
    } else {
      await this.pushInfo(usr_qq, false, img);
    }
    return false;
  }

  async show_danfang(e) {
    if (!verc({ e })) return false;
    let img = await get_danfang_img(e);
    e.reply(img);
    return false;
  }
  async learnDayanWudaoPillRecipe(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const recipeName = '大衍悟道丹配方';
    const player = await Read_player(usr_qq);
    if (player[recipeName]) {
      return e.reply('你已经参悟【大衍悟道丹配方】，满级炼丹师可使用 #炼制大衍悟道丹*数量');
    }
    if (Number(await exist_najie_thing(usr_qq, recipeName, '道具')) < 1) {
      return e.reply('你还没有【大衍悟道丹配方】，可使用 #愿鳞兑换 大衍悟道丹配方 消耗200众生愿鳞兑换');
    }

    await Add_najie_thing(usr_qq, recipeName, '道具', -1);
    player[recipeName] = true;
    try {
      await Write_player(usr_qq, player);
    } catch (error) {
      await Add_najie_thing(usr_qq, recipeName, '道具', 1);
      console.error('[大衍悟道丹配方] 参悟存档失败，已退还配方', error);
      return e.reply('参悟失败，配方已退还，请稍后重试');
    }

    return e.reply([
      '【大衍悟道丹配方已参悟】',
      '炼制门槛：满级（36级·白袍极品）炼丹师',
      '每颗消耗：悟道古茶叶×10、万年凝血草×20、万年太玄果×20、万年天魂菊×20、万年清心草×20',
      '发送 #炼制大衍悟道丹*数量 即可炼制。',
    ].join('\n'));
  }
    async show_zhizuo(e) {
    if (!verc({ e })) return false;
    let img = await get_zhizuo_img(e);
    e.reply(img);
    return false;
  }
  async yaoxiao(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let dy = await Read_danyao(usr_qq);
    let player = await Read_player(usr_qq);
    let m = '丹药效果:';
    if (dy.ped > 0) {
      m += `\n仙缘丹药力${dy.beiyong1 * 100}%药效${dy.ped}次`;
    }
    if (dy.lianti > 0) {
      m += `\n炼神丹药力${dy.beiyong4 * 100}%药效${dy.lianti}次`;
    }
    if (dy.beiyong2 > 0) {
      m += `\n神赐丹药力${dy.beiyong3 * 100}% 药效${dy.beiyong2}次`;
    }
    if (dy.biguan > 0) {
      m += `\n辟谷丹药力${dy.biguanxl * 100}%药效${dy.biguan}次`;
    }
    if (player.islucky > 0) {
      m += `\n福源丹药力${player.addluckyNo * 100}%药效${player.islucky}次`;
    }
    if (player.breakthrough == true) {
      m += `\n破境丹生效中`;
    }
    if (dy.xingyun > 0) {
      m += `\n真器丹药力${dy.beiyong5}药效${dy.xingyun}次`;
    }
        if (player.出金次数 > 0) {
      m += `\n冒险出金率${player.出金率}%药效${player.出金次数}次`;
    }
    e.reply(m);
    return false;
  }

  async show_tuzhi(e) {
    if (!verc({ e })) return false;
    let img = await get_tuzhi_img(e);
    e.reply(img);
    return false;
  }

  async liandan(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    if (player.occupation != '炼丹师') {
      e.reply('丹是上午炼的,药是中午吃的,人是下午走的');
      return false;
    }
    let t = e.msg.replace('#炼制', '').split('*');
    if (t <= 0) {
      t = 1;
    }
    let danyao = t[0];
    let n = await convert2integer(t[1]);
    let tmp_msg = '';
    let danfang = data.danfang_list.find(item => item.name == danyao);
    if (!isNotNull(danfang)) {
      e.reply(`世界上没有丹药[${danyao}]的配方`);
      return false;
    }
    if (danfang.传承要求 && !player[danfang.传承要求]) {
      e.reply(`你尚未获得【${danfang.传承要求}】，无法理解${danyao}的丹方`);
      return false;
    }
    if (danfang.level_limit > player.occupation_level) {
      e.reply(`${danfang.level_limit}级炼丹师才能炼制${danyao}`);
      return false;
    }
    let materials = danfang.materials;
    let exp = danfang.exp;
    tmp_msg += '消耗';
    for (let i in materials) {
      let material = materials[i];
      // 根据丹药名称决定材料类型
      let materialType;
      if (danyao === '天命轮回丹') materialType = '丹药';
      else if (material.name === '悟道古茶叶') materialType = '道具';
      else materialType = '草药';
      let x = await exist_najie_thing(usr_qq, material.name, materialType);
      if (x === false) {
        x = 0;
      }
      if (x < material.amount * n) {
        e.reply(
          `纳戒中拥有${material.name}(${materialType})${x}份，炼制需要${material.amount * n}份`
        );
        return false;
      }
    }

    for (let i in materials) {
      let material = materials[i];
      let materialType;
      if (danyao === '天命轮回丹') materialType = '丹药';
      else if (material.name === '悟道古茶叶') materialType = '道具';
      else materialType = '草药';
      tmp_msg += `${material.name}×${material.amount * n}，`;
      await Add_najie_thing(
        usr_qq,
        material.name,
        materialType,
        -material.amount * n
      );
    }
    let total_exp = exp[1] * n;
    const alchemyPetBonus = getPetAbilityBonus(player.仙宠, '炼丹');
    if (alchemyPetBonus > 0) {
      let random = Math.random();
     
      if (random < alchemyPetBonus) {
        n *= 2;
        e.reply(
          '你的仙宠' + player.仙宠.name + '辅佐了你进行炼丹,成功获得了双倍丹药'
        );
      } else {
        e.reply('你的仙宠只是在旁边看着');
      }
    }
    const furnaceEligible = !danfang.唯一 && !danfang.全服唯一 && !danfang.任务物品 && !danfang.固定唯一奖励;
    if (furnaceEligible) {
      const furnaceMultiplier = consumeAlchemyMultiplier(player);
      if (furnaceMultiplier > 1) {
        n *= furnaceMultiplier;
        await Write_player(usr_qq, player);
        e.reply(`【万道神炉】万道炉火共鸣，本炉丹药产出提升至${furnaceMultiplier}倍。`);
      }
    }
    if (
      danyao == '神心丹' ||
      danyao == '定神丹' ||
      danyao == '太虚养神丹' ||
      danyao == '九阶淬体丹' ||
      danyao == '九阶玄元丹' ||
      danyao == '起死回生丹' ||danyao == '天命轮回丹' || danyao == '大衍悟道丹'
    ) {
      await Add_najie_thing(usr_qq, danyao, '丹药', n);
      e.reply(`${tmp_msg}得到${danyao}${n}颗，获得炼丹经验${total_exp}`);
    } else {
      let dengjixiuzheng = player.occupation_level;
      let newrandom = Math.random();
      let newrandom2 = Math.random();

      // ==== 命格消费层：炼丹成功率 / 炼丹品质 ====
      // 「丹道通玄」类命格引动丹火，使出炉丹药更易成上品，仙品之姿更为可期。
      const minggeEffects = getMinggeEffects(player, data.minggeList);
      const danSuccess = minggeEffects?.['炼丹成功率'] || 0; // 可正可负：降低凡品率=提升出好丹概率
      const danQuality = minggeEffects?.['炼丹品质'] || 0;   // 可正可负：提升仙品概率
      let fanpinThreshold = Math.max(0, Math.min(0.95, 0.1 + (dengjixiuzheng * 3) / 100 - danSuccess));
      let xianpinChance = Math.max(0, Math.min(0.95, 0.4 + danQuality));

      let qualityName = '';
      if (newrandom >= fanpinThreshold) {
        qualityName = '凡品';
      } else if (newrandom2 < xianpinChance) {
        qualityName = '仙品';
      } else {
        qualityName = '极品';
      }
      await Add_najie_thing(usr_qq, qualityName + danyao, '丹药', n);
      e.reply(`${tmp_msg}得到"${qualityName}"${danyao}${n}颗，获得炼丹经验${total_exp}`);
      if (danSuccess !== 0 || danQuality !== 0) {
        e.reply(
          `命格·丹道通玄：出好丹概率 +${Math.round(danSuccess * 100)}%　仙品概率 +${Math.round(danQuality * 100)}%`
        );
      }
    }
    await Add_职业经验(usr_qq, total_exp);
  }
async zhizuo_fu(e) {
  if (!verc({ e })) return false;
  const usr_qq = e.user_id.toString().replace('qg_', '');
  const player = await Read_player(usr_qq);

  // 1. 职业验证
  if (player.occupation !== '符师') {
    e.reply('符道玄奥，非符师不可妄为！');
    return false;
  }

  // 2. 指令解析
  const args = e.msg.replace('#制作', '').split('*');
  const fuming = args[0]?.trim(); // 符箓名称
  const n = args[1] ? await convert2integer(args[1]) : 1; // 默认制作1张

  // 3. 配方验证
  const fufang = data.zhizuo_list.find(item => item.name === fuming);
  if (!fufang) {
    e.reply(`符道秘录中无「${fuming}」记载`);
    return false;
  }

  // 4. 等级与材料检查
  if (fufang.level_limit > player.occupation_level) {
    e.reply(`需达「符师${fufang.level_limit}重境」方可制作`);
    return false;
  }
  for (const material of fufang.materials) {
    const stock = await exist_najie_thing(usr_qq, material.name, material.class) || 0;
    if (stock < material.amount * n) {
      e.reply(`「${material.name}」不足！需${material.amount*n}份，仅存${stock}份`);
      return false;
    }
  }

  // 5. 执行制作
  try {
    // 扣除材料
    for (const material of fufang.materials) {
      await Add_najie_thing(usr_qq, material.name, material.class, -material.amount * n);
    }

    // ==== 命格消费层：制符加成 ====
    // 「符道通玄」类命格灵力自化符纹，使绘制的符箓数量更为丰沛。
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const fuBonus = minggeEffects?.['制符加成'] ? getMinggeBonusMultiplier(minggeEffects, '制符加成') : 1;
    const minggeCount = Math.max(n, calculateMinggeYield(n, minggeEffects, '制符加成'));

    // 添加基础成品（已含命格加成期望）
    await Add_najie_thing(usr_qq, fuming, fufang.class, minggeCount);
    // 仙宠双倍判定（基于命格加成后的数量）
    let shownCount = minggeCount;
    if (Math.random() < getPetAbilityBonus(player.仙宠, '制符')) {
      await Add_najie_thing(usr_qq, fuming, fufang.class, minggeCount);
      shownCount = minggeCount * 2;
      e.reply(`✨ 仙宠【${player.仙宠.name}】助力，符箓产出翻倍！`);
    }
    // 命格提示
    if (fuBonus > 1) {
      e.reply(`命格·符道通玄：制符产出 +${Math.round((fuBonus - 1) * 100)}%`);
    }
    // 成功反馈
    e.reply(`成功制作「${fuming}」×${shownCount}！`);
  } catch (err) {
    console.error(`制作失败@${usr_qq}:`, err);
    e.reply('灵力反噬！符纸自焚成灰...');
  }
  return true;
}
  async lianqi(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    if (player.occupation != '炼器师') {
      e.reply('铜都不炼你还炼器？');
      return false;
    }
    let t = e.msg.replace('#打造', '').split('*');
    let equipment_name = t[0];
    let suc_rate = 0;
    let tmp_msg1 = '';
    let tmp_msg2 = '';
    let tuzhi = data.tuzhi_list.find(item => item.name == equipment_name);
    if (!tuzhi) {
      e.reply(`世界上没有[${equipment_name}]的图纸`);
      return false;
    }
    let materials = tuzhi.materials;
    let exp = tuzhi.exp;
    let res_exp;
    suc_rate += tuzhi.rate;

    let rate = 0;

    if (player.occupation_level > 0) {
      rate = data.occupation_exp_list.find(
        item => item.id == player.occupation_level
      ).rate;
      rate = rate * 10;
      rate = rate * 0.025;
    }
    if (player.occupation == '炼器师') {
      tmp_msg1 += `你是炼器师，额外增加成功率${Math.floor(
        rate * 10
      )}%(以乘法算)，`;
      suc_rate *= 1 + rate;
      if (player.occupation_level >= 24) {
        suc_rate = 0.8;
      }
      res_exp = exp[0];
    }
    const forgeSuccessMultiplier = getMinggeBonusMultiplier(
      minggeEffects,
      '炼器成功率'
    );
    const craftedEquipmentMultiplier = getMinggeBonusMultiplier(
      minggeEffects,
      '炼制装备加成'
    );
    const forgeExpMultiplier = getMinggeBonusMultiplier(
      minggeEffects,
      '锻造经验加成'
    );
    suc_rate = Math.max(0.01, Math.min(0.95, suc_rate * forgeSuccessMultiplier));
    res_exp = Math.floor((Number(res_exp) || 0) * forgeExpMultiplier);
    tmp_msg2 += `，获得炼器经验${res_exp}`;
    tmp_msg1 += '消耗';
    for (let i in materials) {
      let material = materials[i];
      let x = await exist_najie_thing(usr_qq, material.name, '材料');
      if (x < material.amount || !x) {
        e.reply(
          `纳戒中拥有${material.name}×${x}，打造需要${material.amount}份`
        );
        return false;
      }
    }
    for (let i in materials) {
      let material = materials[i];
      tmp_msg1 += `${material.name}×${material.amount}，`;
      await Add_najie_thing(usr_qq, material.name, '材料', -material.amount);
    }
    let rand1 = Math.random();
    if (rand1 > suc_rate) {
      let random = Math.random();
      if (random < 0.5) {
        e.reply(`打造装备时不小心锤断了刃芯，打造失败！`);
      } else {
        e.reply(`打造装备时没有把控好火候，烧毁了，打造失败！`);
      }
      return false;
    }
    let pinji = Math.trunc(Math.random() * 7);
    if (pinji > 5) {
      e.reply('在你细致的把控下，一把绝世极品即将问世！！！！');
      await sleep(10000);
    }
    await Add_najie_thing(
      usr_qq,
      equipment_name,
      '装备',
      1,
      pinji,
      craftedEquipmentMultiplier
    );
    await Add_职业经验(usr_qq, res_exp);
    e.reply(
      `${tmp_msg1}打造成功，获得${equipment_name}(${
        ['劣', '普', '优', '精', '极', '绝', '顶'][pinji]
      })×1${tmp_msg2}`
    );
  }
  async search_sb(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    if (player.occupation != '侠客') {
      e.reply('只有专业的侠客才能获取悬赏');
      return false;
    }
    let msg = [];
    let action = await redis.get('xiuxian:player:' + usr_qq + ':shangjing');
    action = await JSON.parse(action);
    let type = 0;
    if (action != null) {
      if (action.end_time > new Date().getTime()) {
        msg = action.arm;
        var msg_data = {
          msg,
          type,
        };
        const data1 = await new Show(e).get_msg(msg_data);
        let img = await puppeteer.screenshot('msg', {
          ...data1,
        });
        e.reply(img);
        return false;
      }
    }
    let mubiao = [];
    let i = 0;
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith('.json'));
    let File_length = File.length;
    for (var k = 0; k < File_length; k++) {
      let this_qq = File[k].replace('.json', '');

      let players = await Read_player(this_qq);
      if (players.魔道值 > 999 && this_qq != usr_qq) {
        mubiao[i] = {
          名号: players.名号,
          赏金: Math.trunc(
            (1000000 *
              (1.2 + 0.05 * player.occupation_level) *
              player.level_id *
              player.Physique_id) /
              42 /
              42 /
              4
          ),
          QQ: this_qq,
        };
        i++;
      }
    }
    while (i < 4) {
      mubiao[i] = {
        名号: 'DD大妖王',
        赏金: Math.trunc(
          (1000000 *
            (1.2 + 0.05 * player.occupation_level) *
            player.level_id *
            player.Physique_id) /
            42 /
            42 /
            4
        ),
        QQ: 1,
      };
      i++;
    }
    for (var k = 0; k < 3; k++) {
      msg.push(mubiao[Math.trunc(Math.random() * i)]);
    }
    let arr = {
      arm: msg,
      end_time: new Date().getTime() + 60000 * 60 * 20, //结束时间
    };
    await redis.set(
      'xiuxian:player:' + usr_qq + ':shangjing',
      JSON.stringify(arr)
    );
    var msg_data = {
      msg,
      type,
    };
    const data1 = await new Show(e).get_msg(msg_data);
    let img = await puppeteer.screenshot('msg', {
      ...data1,
    });
    e.reply(img);
    return false;
  }
  async taofa_sb(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let A_action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    A_action = JSON.parse(A_action);
    if (A_action != null) {
      let now_time = new Date().getTime();
      //人物任务的动作是否结束
      let A_action_end_time = A_action.end_time;
      if (now_time <= A_action_end_time) {
        let m = parseInt((A_action_end_time - now_time) / 1000 / 60);
        let s = parseInt((A_action_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply(
          '正在' + A_action.action + '中,剩余时间:' + m + '分' + s + '秒'
        );
        return false;
      }
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != '侠客') {
      e.reply('侠客资质不足,需要进行训练');
      return false;
    }
    let action = await redis.get('xiuxian:player:' + usr_qq + ':shangjing');
    action = await JSON.parse(action);
    if (action == null) {
      e.reply('还没有接取到悬赏,请查看后再来吧'); //没接取悬赏
      return false;
    }
    if (action.arm.length == 0) {
      e.reply('每日限杀,请等待20小时后新的赏金目标'); //悬赏做完了(20h后刷新)
      return false;
    }
    var num = e.msg.replace('#讨伐目标', '');
    num = num.trim() - 1;
    let qq;
    try {
      qq = action.arm[num].QQ;
    } catch {
      e.reply('不要伤及无辜'); //输错了，没有该目标
      return false;
    }
    let last_msg = '';
    if (qq != 1) {
      var player_B = await Read_player(qq);
      player_B.当前血量 = player_B.血量上限;

      player_B.法球倍率 = player_B.灵根.法球倍率;
      let buff = 1 + player.occupation_level * 0.055;
      let player_A = {
        id: player.id,
        mijinglevel_id: player.mijinglevel_id,
        xiangulevel_id: player.xiangulevel_id,
        huafenlevel_id: player.huafenlevel_id,
        名号: player.名号,
        攻击: parseInt(player.攻击 * buff),
        防御: parseInt(player.防御),
        当前血量: parseInt(player.血量上限 * buff),
        暴击率: player.暴击率,
        学习的功法: player.学习的功法,
        功法熟练度: player.功法熟练度,
        功法熟练度每日: player.功法熟练度每日,
        战斗技能配置: player.战斗技能配置,
        魔道值: player.魔道值,
        灵根: player.灵根,
        法球倍率: player.灵根.法球倍率,
        仙宠: player.仙宠,
        神石: player.神石,
      };
      let Data_battle = await zd_battle(player_A, player_B, { pvp: true });
      player.功法熟练度 = player_A.功法熟练度;
      player.功法熟练度每日 = player_A.功法熟练度每日;
      let msg = Data_battle.msg;
      if (Data_battle.winner === 'A') {
        player_B.魔道值 -= 50;
        player_B.灵石 -= 1000000;
        player_B.当前血量 = 0;
        await Write_player(qq, player_B);
        player.灵石 += action.arm[num].赏金;
        player.魔道值 -= 5;
        await Write_player(usr_qq, player);
        await Add_职业经验(usr_qq, 2255);
        last_msg +=
          '【全服公告】' +
          player_B.名号 +
          '失去了1000000灵石,罪恶得到了洗刷,魔道值-50,无名侠客获得了部分灵石,自己的正气提升了,同时获得了更多的悬赏加成';
      } else if (Data_battle.winner === 'B') {
        var shangjing = Math.trunc(action.arm[num].赏金 * 0.8);
        player.当前血量 = 0;
        player.灵石 += shangjing;
        player.魔道值 -= 5;
        await Write_player(usr_qq, player);
        await Add_职业经验(usr_qq, 1100);
        last_msg += player_B.名号 + '反杀了你,只获得了部分辛苦钱';
      }
      if (msg.length > 100) {
      } else {
        await ForwardMsg(e, msg);
      }
    } else {
      player.灵石 += action.arm[num].赏金;
      player.魔道值 -= 5;
      await Write_player(usr_qq, player);
      await Add_职业经验(usr_qq, 2255);
      last_msg += '你惩戒了仙路窃贼,获得了部分灵石'; //直接获胜
    }
    action.arm.splice(num, 1);
    await redis.set(
      'xiuxian:player:' + usr_qq + ':shangjing',
      JSON.stringify(action)
    );
    if (
      last_msg == '你惩戒了仙路窃贼,获得了部分灵石' ||
      last_msg == player_B.名号 + '反杀了你,只获得了部分辛苦钱'
    ) {
      let last_img=await get_log_img(last_msg)
      e.reply(last_img);
    } else {
      let last_img=await get_log_img(last_msg)
      const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
      const groupList = await redis.sMembers(redisGlKey);
      for (const group_id of groupList) {
        this.pushInfo(group_id, true, last_img);
      }
    }
  }

  async xuanshang_sb(e) {
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    let qq = e.msg.replace('#悬赏', '');
    let code = qq.split('*');
    qq = code[0];
    let money = await convert2integer(code[1]);



    
    if (money < 10000000) {
      money = 10000000;
    }


    if (player.灵石 < money) {
      e.reply('您手头这点灵石,似乎在说笑');
      return false;
    }
    let player_B;
    try {
      player_B = await Read_player(qq);
    } catch {
      e.reply('世间没有这人'); //查无此人
      return false;
    }
    var arr = {
      名号: player_B.名号,
      QQ: qq,
      赏金: money,
    };
    let action = await redis.get('xiuxian:player:' + 1 + ':shangjing');
    action = await JSON.parse(action);
    if (action != null) {
      action.push(arr);
    } else {
      action = [];
      action.push(arr);
    }
    player.灵石 -= money;
    await Write_player(usr_qq, player);
    e.reply('悬赏成功!');
    let msg = '';
    msg += '【全服公告】' + player_B.名号 + '被悬赏了' + money + '灵石';
    const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
    const groupList = await redis.sMembers(redisGlKey);
    for (const group_id of groupList) {
      this.pushInfo(group_id, true, msg);
    }
    await redis.set(
      'xiuxian:player:' + 1 + ':shangjing',
      JSON.stringify(action)
    );
    return false;
  }
  async shangjingbang(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let action = await redis.get('xiuxian:player:' + 1 + ':shangjing');
    action = await JSON.parse(action);
    if (action == null) {
      e.reply('悬赏已经被抢空了'); //没人被悬赏
      return false;
    }
    for (var i = 0; i < action.length - 1; i++) {
      var count = 0;
      for (var j = 0; j < action.length - i - 1; j++) {
        if (action[j].赏金 < action[j + 1].赏金) {
          var t;
          t = action[j];
          action[j] = action[j + 1];
          action[j + 1] = t;
          count = 1;
        }
      }
      if (count == 0) break;
    }
    await redis.set(
      'xiuxian:player:' + 1 + ':shangjing',
      JSON.stringify(action)
    );
    let type = 1;
    var msg_data = {
      msg: action,
      type,
    };
    const data1 = await new Show(e).get_msg(msg_data);
    let img = await puppeteer.screenshot('msg', {
      ...data1,
    });
    e.reply(img);
    return false;
  }
  async cisha_sb(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let A_action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    A_action = JSON.parse(A_action);
    if (A_action != null) {
      let now_time = new Date().getTime();
      //人物任务的动作是否结束
      let A_action_end_time = A_action.end_time;
      if (now_time <= A_action_end_time) {
        let m = parseInt((A_action_end_time - now_time) / 1000 / 60);
        let s = parseInt((A_action_end_time - now_time - m * 60 * 1000) / 1000);
        e.reply(
          '正在' + A_action.action + '中,剩余时间:' + m + '分' + s + '秒'
        );
        return false;
      }
    }
    let action = await redis.get('xiuxian:player:' + 1 + ':shangjing');
    action = await JSON.parse(action);
    var num = e.msg.replace('#刺杀目标', '');
    num = num.trim() - 1;
    let qq;
    try {
      qq = action[num].QQ;
    } catch {
      e.reply('不要伤及无辜'); //输错了，没有该目标
      return false;
    }
    if (qq == usr_qq) {
      e.reply('咋的，自己干自己？');
      return false;
    }
    let player = await Read_player(usr_qq);
    let buff = 1;
    if (player.occupation == '侠客') {
      buff = 1 + player.occupation_level * 0.055;
    }
    let last_msg = '';
    let player_B = await Read_player(qq);
    //if (player_B.当前血量 == 0) {
    //  e.reply(`对方已经没有血了,请等一段时间再刺杀他吧`);
    //  return false;
    //}
    let B_action = await redis.get('xiuxian:player:' + qq + ':action');
    B_action = JSON.parse(B_action);
    if (B_action != null) {
      let now_time = new Date().getTime();
      //人物任务的动作是否结束
      let B_action_end_time = B_action.end_time;
      if (now_time <= B_action_end_time) {
        let ishaveyss = await exist_najie_thing(usr_qq, '隐身水', '道具');
        if (!ishaveyss) {
          //如果A没有隐身水，直接返回不执行
          let m = parseInt((B_action_end_time - now_time) / 1000 / 60);
          let s = parseInt(
            (B_action_end_time - now_time - m * 60 * 1000) / 1000
          );
          e.reply(
            '对方正在' + B_action.action + '中,剩余时间:' + m + '分' + s + '秒'
          );
          return false;
        }
      }
    }
    player_B.法球倍率 = player_B.灵根.法球倍率;
    player_B.当前血量 = player_B.血量上限;
    let player_A = {
      id: player.id,
      mijinglevel_id: player.mijinglevel_id,
      xiangulevel_id: player.xiangulevel_id,
      huafenlevel_id: player.huafenlevel_id,
      名号: player.名号,
      攻击: parseInt(player.攻击 * buff),
      防御: parseInt(player.防御),
      当前血量: parseInt(player.血量上限),
      暴击率: player.暴击率,
      学习的功法: player.学习的功法,
      功法熟练度: player.功法熟练度,
      功法熟练度每日: player.功法熟练度每日,
      战斗技能配置: player.战斗技能配置,
      灵根: player.灵根,
      魔道值: player.魔道值,
      神石: player.神石,
      法球倍率: player.灵根.法球倍率,
      仙宠: player.仙宠,
    };
    let Data_battle = await zd_battle(player_A, player_B, { pvp: true });
    player.功法熟练度 = player_A.功法熟练度;
    player.功法熟练度每日 = player_A.功法熟练度每日;
    let msg = Data_battle.msg;
    let 赏金_2=action[num].赏金/2
    if (Data_battle.winner === 'A') {
      player_B.当前血量 = 0;
      player_B.修为 -= 赏金_2;
      player_B.血气 -= 赏金_2;
      await Write_player(qq, player_B);
      player.灵石 += Math.trunc(action[num].赏金 * 0.3);
      await Write_player(usr_qq, player);
      last_msg +=
        '【全服公告】' +
        player_B.名号 +
        '被' +
        player.名号 +
        '悄无声息的刺杀了';
      //优化下文案，比如xxx在刺杀xxx中
      action.splice(num, 1);
      await redis.set(
        'xiuxian:player:' + 1 + ':shangjing',
        JSON.stringify(action)
      );
    } else if (Data_battle.winner === 'B') {
      player.当前血量 = 0;
      await Write_player(usr_qq, player);
      last_msg +=
        '【全服公告】' +
        player.名号 +
        '刺杀失败,' +
        player_B.名号 +
        '勃然大怒,单手就反杀了' +
        player.名号; //优化下文案，比如xxx在刺杀xxx中
    }
    if (msg.length > 100) {
    } else {
      await ForwardMsg(e, msg);
    }
    const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
    const groupList = await redis.sMembers(redisGlKey);
    for (const group_id of groupList) {
      this.pushInfo(group_id, true, last_msg);
    }
    return false;
  }

    /**
 * 
 * @param {any} e
 * @returns
 */
async search_cz(e) {
    let usr_qq = e.user_id;
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply("玩家不存在，请先创建角色");
        return;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != "唤魔者") {
        e.reply("非唤魔者不能执行此操作");
        return;
    }

    // 清空之前的劫掠目标
    await redis.del("xiuxian:player:" + usr_qq + ":jiangjing");

    // 生成劫掠目标
    let mubiao = [];
    let baseReward = 500; // 基础赏金
    let levelMultiplier = 1.2 + 0.02 * player.occupation_level; // 等级倍数

    // 添加仙路窃贼目标
    mubiao.push({
        名号: "仙路窃贼-小卡拉米老王的村庄",
        赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.mijinglevel_id * player.Physique_id * 1.5),
        掉落物: "土豆,小麦，面包，胡萝卜",
        QQ: 1
    });

    // 添加村庄目标
    mubiao.push({
        名号: "村庄-蒙德",
        赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5),
        掉落物: "土豆,小麦，面包，胡萝卜",
        QQ: 1
    });

    mubiao.push({
        名号: "村庄-稻妻",
        赏金: Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5),
        掉落物: "土豆,小麦，面包，胡萝卜",
        QQ: 1
    });

    // 设置劫掠目标和结束时间
    let arr = {
        arm: mubiao,
        end_time: new Date().getTime() + 60000 * 60 * 1, // 20小时后刷新
    };
    await redis.set("xiuxian:player:" + usr_qq + ":jiangjing", JSON.stringify(arr));

    // 构建消息
    let msg = "可劫掠的目标：";
    mubiao.forEach((target, index) => {
        msg += `${index + 1}. ${target.名号} - 赏金: ${target.赏金}灵石\n`;
    });
    msg += "使用 #劫掠村庄 [编号] 进行劫掠";

     // 显示劫掠目标
        let msg_data = {
            msg: mubiao,
            type: 0
        };
        const data1 = await new Show(e).get_msg2(msg_data);
        let img = await puppeteer.screenshot("msg2", {
            ...data1,
        });
        e.reply(img);
    }

async taofa_cz(e) {
    let usr_qq = e.user_id;
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply("玩家不存在，请先创建角色");
        return;
    }
    let player = await Read_player(usr_qq);
    if (player.occupation != "唤魔者") {
        e.reply("非唤魔者不能执行此操作");
        return;
    }

    let 唤魔令 = await exist_najie_thing(usr_qq, "唤魔令", "道具");
    // 检查唤魔令道具数量
    if (唤魔令 < 1) {
        e.reply("您没有唤魔令道具，无法进行劫掠");
        return;
    }

    let action = await redis.get("xiuxian:player:" + usr_qq + ":jiangjing");
    if (!action) {
        e.reply("当前没有可劫掠的目标");
        return;
    }
    action = JSON.parse(action);

    if (action.arm.length === 0) {
        e.reply("当前没有可劫掠的目标");
        return;
    }

    let num = e.msg.replace("#劫掠村庄", '').trim();
    num = parseInt(num) - 1;

    if (isNaN(num) || num < 0 || num >= action.arm.length) {
        e.reply("目标编号错误");
        return;
    }
    
    await Add_najie_thing(usr_qq, "唤魔令", "道具", -1);
    
    let target = action.arm[num];
    // 使用与劫掠村庄相似的计算格式
    let baseReward = 500; // 基础赏金
    let levelMultiplier = 1.2 + 0.02 * player.occupation_level; // 等级倍数
    let target赏金 = Math.trunc(baseReward * levelMultiplier * player.level_id * player.Physique_id * 1.5);
    let zuizhongjiangli = Math.floor(target赏金 * 0.0002); // 降低的魔道值
    const end_amount = Math.floor(target赏金 * 0.001);

    // 执行劫掠逻辑
    player.灵石 += target赏金;
    player.魔道值 += zuizhongjiangli;
    await Add_职业经验(usr_qq, 2255);
    await Add_najie_thing(usr_qq, "面包", "食材", end_amount);
    await Add_najie_thing(usr_qq, "小麦", "食材", end_amount);
    await Add_najie_thing(usr_qq, "胡萝卜", "食材", end_amount);
    await Add_najie_thing(usr_qq, "土豆", "食材", end_amount);

    // ===== 25%概率触发金色宝箱 =====
    let isGoldenBox = Math.random() < 0.25;
    let goldenReward = 0;
    let goldenItem = "";
    let goldenItemType = "道具";
    let goldenItemAmount = 0;
    
    const goldenItems = [
        { name: "超越宝盒", type: "盒子", amount: () => Math.floor(Math.random() * 3) + 1 },
        { name: "噬魂幡碎片", type: "材料", amount: () => Math.floor(Math.random() * 5) + 3 },
        { name: "血炼晶石", type: "材料", amount: () => Math.floor(Math.random() * 10) + 5 },
        { name: "万魂幡", type: "法宝", amount: () => 1 },
        { name: "魔道秘典", type: "功法", amount: () => 1 },
        { name: "九幽玄铁", type: "材料", amount: () => Math.floor(Math.random() * 4) + 2 }
    ];

    if (isGoldenBox) {
        goldenReward = Math.floor(target赏金 * (2.5 + Math.random() * 2.5)); // 额外2.5~5倍灵石
        let item = goldenItems[Math.floor(Math.random() * goldenItems.length)];
        goldenItem = item.name;
        goldenItemType = item.type;
        goldenItemAmount = item.amount();
        player.灵石 += goldenReward;
        await Add_najie_thing(usr_qq, goldenItem, goldenItemType, goldenItemAmount);
    }
    
    await Write_player(usr_qq, player);

    let msgLines = [];
    
    // 开场白随机池
    const openLines = [
        `你扛着唤魔幡，脚下黑云滚滚，大摇大摆地降临【${target.名号}】！\n村口老黄狗见你气势汹汹，夹着尾巴钻进了狗洞，边跑边吠："魔头来啦——！"`,
        `你狞笑着祭出唤魔令，霎时间乌云蔽日，鬼哭狼嚎！\n【${target.名号}】的村民们吓得魂飞魄散，连滚带爬地躲进了地窖。`,
        `你一脚踹开【${target.名号}】的栅栏门，门板飞出去三丈远，精准地拍晕了正在巡逻的村保安。\n你掸了掸衣袖："今日，此村归我了。"`,
        `黑雾弥漫中，你缓缓降落在【${target.名号}】的晒谷场上。\n正在晒太阳的老大爷眯着眼看了你半天，颤巍巍地递来一杆旱烟："大仙，抽、抽一口？"`
    ];
    msgLines.push(openLines[Math.floor(Math.random() * openLines.length)]);
    
    msgLines.push(`\n你如入无人之境，挨家挨户"收租"，所到之处寸草不生！`);
    msgLines.push(`最终搜刮获得灵石${target赏金}，魔道值+${zuizhongjiangli}（你的良心隐隐作痛，但很快就被贪婪淹没了）`);
    
    // 普通物资文案
    msgLines.push(`\n【菜田大丰收】`);
    const farmLines = [
        `你在村东头的菜田里发现了隐藏的菜窖，里面堆满了粮食。你二话不说，连坛带罐统统收进纳戒！`,
        `村长家的地窖比你想的还肥，你甚至翻出了一坛腌制了三十年的老酸菜——虽然臭，但你还是顺走了。`,
        `你踹开粮仓大门，老鼠们排着队跟你敬礼，仿佛在说："老大，您终于来了！"`
    ];
    msgLines.push(farmLines[Math.floor(Math.random() * farmLines.length)]);
    msgLines.push(`小麦×${end_amount} | 面包×${end_amount} | 土豆×${end_amount} | 胡萝卜×${end_amount}`);
    
    // 金色宝箱文案
    if (isGoldenBox) {
        msgLines.push(`\n【金色宝箱！逆天改命！】`);
        const boxLines = [
            `正当你准备收工，忽然发现村长的茅厕底下竟隐隐透出金光！\n你掘地三尺，挖出一个镶满宝石的【金色宝箱】，箱盖上刻着一行小字："此箱乃上古粪坑战神所留，得者发大财。"\n你屏住呼吸，缓缓打开——宝光冲天！`,
            `你顺手掀了村口土地庙的供桌，没想到桌底下藏着一道暗门！\n暗室里端端正正摆着一只鎏金宝箱，箱角还蹲着一只会说话的蛤蟆："呱——恭喜发财，红包拿来——呱！"你一脚踢开蛤蟆，开箱！`,
            `你正准备离去，村长的胖儿子哭哭啼啼地拽住你的衣角："大仙别走！俺爹床底下还有东西！"\n你狐疑地掀开床板，瞳孔骤缩——一个通体赤金的宝箱正在发光，旁边还贴着纸条："给有缘的魔道巨擘。"`,
            `你随手放了一把魔火烧了村长的书房，火光中竟浮现出一道虚影！\n虚影拱手道："道友留步！吾乃三百年前坐化于此的散修，毕生积蓄藏于此箱，今日赠予有缘人！"\n话音未落，一个金灿灿的箱子从灰烬中冉冉升起！`
        ];
        msgLines.push(boxLines[Math.floor(Math.random() * boxLines.length)]);
        msgLines.push(`额外灵石+${goldenReward}！（村长攒了一辈子的棺材本，便宜你了）`);
        msgLines.push(`稀有掉落：${goldenItem}×${goldenItemAmount}（${goldenItemType}）`);
        
        const endLines = [
            `你仰天大笑三声，扛着宝箱扬长而去，只留下一群在风中凌乱的村民。`,
            `你心满意足地拍拍纳戒，化作一道黑光消失在天际，村民们追出来骂街，却只吃到一口尾气。`,
            `临走前，你在村口石碑上刻下八个大字："下次还来，记得藏好。"然后潇洒离去。`
        ];
        msgLines.push(`\n${endLines[Math.floor(Math.random() * endLines.length)]}`);
    } else {
        msgLines.push(`\n你意犹未尽地舔了舔嘴唇，总觉得还漏了点什么……\n算了，下次再来！`);
    }
    
    let msg = msgLines.join("\n");

    // 从列表中移除劫掠目标
    action.arm.splice(num, 1);
    await redis.set("xiuxian:player:" + usr_qq + ":jiangjing", JSON.stringify(action));

    // 发送消息
    let img = await get_log_img(msg);
    e.reply(img);
}
  /**
   * 获取缓存中的人物状态信息
   * @param usr_qq
   * @return  falses {Promise<void>}
   */
  async getPlayerAction(usr_qq) {
    let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    action = JSON.parse(action); //转为json格式数据
    return action;
  }
 async pushInfo(id, is_group, msg) {
    try {
        if (is_group) {
            await Bot.pickGroup(id).sendMsg(msg);
        } else {
            await Bot.pickUser(id).sendMsg(msg);
        }
    } catch (err) {
        Bot.logger.mark(err);
    }
}
}
// 辅助函数：计算封印时长
function calculateSealDuration(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}天${hours}时${minutes}分`;
}
