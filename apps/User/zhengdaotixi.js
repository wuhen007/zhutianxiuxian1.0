import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import {
  reviveFromYongJi,
  revivePlaneFromYongJi,
  reviveAllFromYongJi,
  findYongJiByNameOrQQ,
} from '../Boss/YongJiList.js';
import { repairAllDestroyedPlanes, repairSinglePlane } from '../Boss/WeimianDestruction.js';
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
   Read_najie,
  exist_najie_thing,
  Add_修为,
  bigNumberTransform,
  Add_血气,
  __PATH,
  Add_寿元,
  Add_najie_thing,
  dujie,
  LevelTask,
  get_log_img,
  channel,
  ForwardMsg
} from '../../model/xiuxian.js';
import { applyQuestionFortuneCost } from '../../model/redDustFortune.js';
import { createTianjiaoTrace, formatTianjiaoTrace, getKnownTianjiaoTrace } from '../../model/tianjiaoGrowth.js';
import {
  formatTianjiSearchResult,
  parseTianjiCommand,
  requestNameFrom,
  searchPlayerGongfa,
  TIANJI_COSTS,
} from '../../model/tianjiSearch.js';
import {
  applySoulSearchKarmaTribulation,
  calculateSoulSearchSuccessRate,
  canUseSoulSearch,
  getSoulSearchProfile,
  pickSoulSearchGongfa,
  WORLD_ENDING_TRIBULATION_DAMAGE,
} from './soulSearchRules.js';
import {
  applyTeachingResult,
  canTeachGongfa,
  getGongfaLevel,
  getTeachingCosts,
  getTeachingSuccessRate,
  reserveTeachingCosts,
} from '../../model/gongfaTeaching.js';
import {
  getRealmAuthorityLevel,
  getRealmAuthorityName,
  hasRealmAuthority,
  lowerRealmAuthority,
  revokeBreakKingEmperorEligibility,
} from '../../model/realmAuthority.js';
import {
  FORBIDDEN_COOLDOWN_MS,
  forbiddenCooldownKey,
  getForbiddenProtection,
  protectForbiddenTarget,
} from '../../model/forbiddenSoul.js';
import { adjustDaoHeart, getDaoHeartLearningChanceMultiplier } from '../../model/daoHeart.js';
import { addCausalDebt } from '../../model/worldlineAuthority.js';
import { calculateCreationEverything, formatCreationDuration } from '../../model/createEverything.js';
import {
  getSacrificePromotionGate,
  promotePlayerToSacrifice,
} from '../../model/strangeSacrifice.js';

function formatSoulSearchTribulation(player, result) {
  if (!result.triggered) return [];
  const lines = [
    `【业力清算·灭世雷劫】`,
    `${player.名号}业力达到${result.karmaThreshold}点，十道灭世神雷轰然降临！`,
    `每道基础劫威：${bigNumberTransform(WORLD_ENDING_TRIBULATION_DAMAGE)}`,
  ];
  for (const wave of result.waves) {
    lines.push(
      `第${wave.wave}道：承受${bigNumberTransform(wave.damage)}伤害，剩余气血${bigNumberTransform(wave.remainingHp)}`
    );
  }
  if (result.survived) {
    lines.push(`【渡劫成功】你扛过十道灭世雷劫，${result.karmaThreshold}点业力随劫消散。`);
    return lines;
  }

  const penalty = result.penalty;
  const labels = {
    level_id: '练气',
    Physique_id: '炼体',
    mijinglevel_id: '秘境',
    xiangulevel_id: '仙古',
  };
  lines.push(`【渡劫失败·道基崩裂】`);
  for (const [field, label] of Object.entries(labels)) {
    lines.push(`${label}：${penalty.oldRealms[field]} → ${penalty.newRealms[field]}`);
  }
  lines.push(
    `元神上限：${bigNumberTransform(penalty.oldSoulLimit)} → ${bigNumberTransform(penalty.newSoulLimit)}（削减70%）`,
    `资质：${penalty.oldAptitude} → ${penalty.newAptitude}`,
    penalty.forgottenGongfa.length > 0
      ? `遗忘功法：${penalty.forgottenGongfa.join('、')}`
      : `遗忘功法：无`,
    `${result.karmaThreshold}点业力随雷劫清算。`
  );
  return lines;
}


// 源石兑换表：源石道具 → 可兑换的源石数值（斤）
const SOURCE_STONE_EXCHANGE_RATES = {
    "下品源石": 10,
    "中品源石": 50,
    "上品源石": 100,
    "超品源石": 300,
    "神源石": 5000,
    "上品神源石": 7000,
    "超品神源石": 12500
};

export class zhengdaotixi extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_zhengdaotixi',
      dsc: '证道体系模块',
      event: 'message',
      priority: 600,
      rule: [
{
reg: '^#?赐予(练气|炼体)升(\\d+)级(?:@(\\d+))?$',
 fnc: 'ciyujingjie'
},  
{
reg: '^#天意一刀斩众生万灵$',
fnc: 'tianyi_yidao'
},
{
    reg: '^#映照(?:复活)?.*$',
    fnc: 'yingzhao',
},
{
    reg: '^#镇压(?:@(\\d+))?$',
    fnc: 'suppressPlayer'
},
  {
          reg: '^#(?:消耗|转化)纪元积累(?:\\s*(\\d+)|\\*(\\d+))?$',
          fnc: 'jiyuanjilei',
        },
        {
          reg: '^#创造仙宠\\s+(.*?)\\s+(.*?)\\s+(\\d*\\.?\\d+)',
          fnc: 'createXianchong'
        },
{
  reg: '^#灌顶至\\d+级$',  // 匹配如 #灌顶至5级
  fnc: 'guanding'
},
               // {
 // reg: '^#破王成帝$',
 // fnc: 'powangchengdi'
//},
  {
  reg: '^#重塑灵根',
  fnc: 'reshapeLinggen'
},
{
          reg: '^#护法$',
          fnc: 'addProtector'
        },
        { 
            reg: '^#解除护法$',   
            fnc: 'removeProtector' }
            ,
 {
        reg: '^#传授功法(?:@(\\d+))?\\s*(.*)$',
        fnc: 'teachGongfa',
        dsc: '传授指定功法给目标玩家'
    },
    {
        reg: '^#(?:传授全部功法|一键传授)(?:\\s*@(\\d+))?\\s*$',
        fnc: 'teachAllGongfa',
        dsc: '将自己所有功法传授给目标玩家'
    },
      {
        reg: '^#神城兑换源石 (.*) (\\d+)$',
        fnc: 'exchangeSourceStone'
    },
    {
        reg: '^#神城兑换源石 (.*)$',
        fnc: 'exchangeSourceStone'
    },
    {
        reg: '^#神城一键兑换源石$',
        fnc: 'oneClickExchangeSourceStone'
    },
     {
        reg: '^#造化万物(?:\\s+(.*))?$',
        fnc: 'createEverything'
    },
    {
    reg: '^#凝聚精血(\\*\\d+)?$',
    fnc: 'jingxue'
},
 {
    reg: '^#轰击天地万道助其成帝$',
    fnc: 'hongjiTiandao'
},
{
  reg: '^#修炼圣体秘术(?:\\s+(轮海|道宫|四极|化龙))?(?:\\s+(\\d+))?$',
  fnc: 'shengtimishu',
  dsc: '修炼圣体秘术 - 打磨单一秘境（支持批量修炼）'
},
{
    reg: '^#修炼终极圣体秘术(?:\\s+(\\d+))?$',
    fnc: 'shengtizhongjimishu',
},
 {
reg: '^#祭道$',
fnc: 'jidao'
},

                      {
                    reg: '^#修复位面$',
                    fnc: 'xiufu_weimian'
                },
                 {
          reg: '^#为其逆天改命\\s+(.+)\\s*(?:@(\\d+))?$',
          fnc: 'changeAptitude',
          dsc: '仙帝可改变玩家天资'
        },
       
{
  reg: '^#轰击成仙路$',
  fnc: 'hongjiChengxianlu'
},
{
  reg: '^#推演天机(.*)$',
  fnc: 'tuiyanTianji'
},
{
  reg: '^#搜魂$',
  fnc: 'soulSearch',
  dsc: '搜魂大法-强行夺取他人功法记忆'
}
      ],
    });
 // 仙宠基础配置
    this.xianchonTypes = {
      "战斗": { atk: 5, def: 5, HP: 5 },
      "炼丹": { atk: 3, def: 3, HP: 7 },
      "炼器": { atk: 3, def: 7, HP: 3 },
      "幸运": { atk: 4, def: 4, HP: 4 },
      "修炼": { atk: 2, def: 2, HP: 2 }
    };
  }
// 添加护法者（增强版）
async addProtector(e) {
  if (!e.isGroup) return e.reply('请在群聊中使用护法指令');

  const at = e.message.find(m => m.type === 'at');
  if (!at) return e.reply('请@需要护法的玩家');

  const protectorId = e.user_id.toString().replace('qg_', '');
  const targetId   = at.qq.toString().replace('qg_', '');

  const protector = await Read_player(protectorId);
  const target    = await Read_player(targetId);

  if (!target) return e.reply('目标玩家不存在');
  if (target.护法玩家) return e.reply('该玩家已有护法者');
  if (target.破王成帝 === undefined || target.破王成帝 !== 0)
    return e.reply('目标当前并未处于破王成帝/渡劫阶段，无需护法');

  // 护法者境界检查
  if (getRealmAuthorityLevel(protector) < getRealmAuthorityLevel(target) - 1)
    return e.reply('你的境界不足以为该玩家护法（需 ≥ 目标境界 −1）');

  // 一人只能同时给一个人护法
  if (protector.正在护法)
    return e.reply(`你正在为 ${protector.正在护法} 护法，请先 #解除护法`);

  // 快照护法血量（×3 倍，一次性）
  const protectorSnap = {
    名字: protector.名号,
      境界: getRealmAuthorityName(protector, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list),
    当前血量: Math.floor(protector.当前血量 * 3),
    血量上限: Math.floor(protector.当前血量 * 3)
  };

  target.护法玩家   = protectorSnap;
  protector.正在护法 = target.名号;

  await Write_player(targetId, target);
  await Write_player(protectorId, protector);

  return e.reply([
    `【护法结成】`,
    `${protector.名号} 愿为 ${target.名号} 护道！`,
    `护法血量：${protectorSnap.当前血量.toLocaleString()}`,
    `可分担 40 % 雷劫伤害，直至本次破王成帝结束`
  ].join('\n'));
}

// 解除护法（可选指令）
async removeProtector(e) {
  if (!e.isGroup) return e.reply('请在群聊中使用');
  const pid = e.user_id.toString().replace('qg_', '');
  const me  = await Read_player(pid);

  if (!me.正在护法)
    return e.reply('你当前并未担任任何玩家的护法');

  const targetQQ = me.正在护法;          // 存的是名号，需反向查 QQ
  const allFiles = fs.readdirSync(__PATH.player_path);
  let targetId = null;
  for (const f of allFiles) {
    const tmp = await Read_player(f.replace('.json', ''));
    if (tmp.名号 === targetQQ) { targetId = f.replace('.json', ''); break; }
  }
  if (!targetId) return e.reply('目标数据异常，解除失败');

  const target = await Read_player(targetId);
  delete target.护法玩家;
  delete me.正在护法;

  await Write_player(targetId, target);
  await Write_player(pid, me);
  return e.reply(`【护法解除】${me.名号} 已退出护法状态`);
}


  // 辅助方法
  hasGongfa(player, gongfa) {
    return player.功法 && player.功法[gongfa];
  }



  // ==== 创造仙宠指令 ====
  async createXianchong(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    
    // ==== 境界检查 ====
    if (!hasRealmAuthority(player, 21)) {
      return e.reply([
        `「欲创仙宠，先入仙帝境！」`,
        `${player.名号}当前境界为${getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)}，`,
        `需突破至仙帝境方可创造仙宠`
      ].join('\n'));
    }

    // ==== 参数解析 ====
    const args = e.msg.match(/^#创造仙宠\s+(.*?)\s+(.*?)\s+(\d*\.?\d+)/);
    const [_, name, type, bonusStr] = args;
    const bonus = parseFloat(bonusStr);

    // ==== 类型验证 ====
    if (!this.xianchonTypes[type]) {
      return e.reply([
        `无效的仙宠类型！可选类型：`,
        ...Object.keys(this.xianchonTypes).map(t => `- ${t}`)
      ].join('\n'));
    }

    // ==== 加成验证 ====
    if (isNaN(bonus) || bonus <= 0 || bonus > 0.15) {
      return e.reply('加成需在0-0.15之间（如0.05表示5%加成）');
    }

    // ==== 创建仙宠对象 ====
    const newPet = {
      id: Date.now(), // 使用时间戳作为唯一ID
      name: name,
      class: "仙宠",
      type: type,
      atk: this.xianchonTypes[type].atk,
      def: this.xianchonTypes[type].def,
      HP: this.xianchonTypes[type].HP,
      初始加成: bonus,
      每级增加: bonus * 0.1, // 每级增加10%基础加成
      加成: bonus,
      灵魂绑定: 0,
      品级: "仙仔",
      desc: `${player.名号}创造的专属仙宠`,
      等级: 1,
      获取难度: Math.floor(bonus * 1e9),
      等级上限: 100,
      出售价: Math.floor(bonus * 1e8),
      稀有度: Math.max(1, Math.min(10, Math.ceil(bonus / 0.015)))
    };

    // ==== 保存到仙宠列表 ====
    try {
      await this.saveXianchong(newPet);
       await Add_najie_thing(usr_qq, newPet.name, '仙宠', 1);
      await e.reply(this.generateCreationText(player.名号, newPet));
    } catch (err) {
      console.error('创造仙宠失败:', err);
      e.reply('仙宠创造失败，天地法则紊乱！');
    }
  }

  // ==== 仙宠保存方法 ====
  async saveXianchong(pet) {
    const filePath = path.join(data.lib_path, '仙宠列表.json');
    let petList = [];
    
    // 读取现有列表
    if (fs.existsSync(filePath)) {
      petList = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    // 检查同名仙宠
    if (petList.some(p => p.name === pet.name)) {
      throw new Error(`已存在同名仙宠: ${pet.name}`);
    }
    
    // 添加新仙宠
    petList.push(pet);
    
    // 保存文件
    fs.writeFileSync(filePath, JSON.stringify(petList, null, 2));
    
    // 更新内存数据
    if (data.xianchon) {
      data.xianchon = petList;
    }
  }

  // ==== 仙宠读取方法 ====
  async getXianchongList() {
    const filePath = path.join(data.lib_path, '仙宠列表.json');
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
        return [];
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('读取仙宠列表失败:', err);
      return [];
    }
  }

  // ==== 生成创造文案 ====
  generateCreationText(playerName, pet) {
    return [
      `【仙宠诞生·天地共鸣】`,
      ,
      `${playerName}以无上法力创造${pet.name}！`,
      `虚空裂开，无尽仙光汇聚成${pet.type}型仙宠！`,
      `「${pet.name}」诞生时引发天地异象，万兽朝拜！`,
      ,
      `仙宠属性：`,
      `- 类型：${pet.type}`,
      `- 攻击：${pet.atk} ★`,
      `- 防御：${pet.def} ★`,
      `- 生命：${pet.HP} ★`,
      `- 基础加成：${(pet.初始加成*100).toFixed(1)}%`,
      `- 成长系数：${(pet.每级增加*100).toFixed(1)}%/级`,
      ,
    ].join('\n');
  }
  /**
   * 获取仙宠列表
   */
  getXianchongList() {
    const filePath = path.join(this.lib_path, '仙宠列表.json');
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
        return [];
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('读取仙宠列表失败:', err);
      return [];
    }
  }

  /**
   * 保存仙宠列表
   */
  saveXianchongList(petList) {
    const filePath = path.join(this.lib_path, '仙宠列表.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(petList, null, 2));
      this.xianchon = petList; // 更新内存数据
    } catch (err) {
      console.error('保存仙宠列表失败:', err);
      throw err;
    }
  }

  /**
   * 添加新仙宠
   */
  addXianchong(newPet) {
    const petList = this.getXianchongList();
    
    // 检查同名
    if (petList.some(p => p.name === newPet.name)) {
      throw new Error(`已存在同名仙宠: ${newPet.name}`);
    }
    
    petList.push(newPet);
    this.saveXianchongList(petList);
  }




  async xiufu_weimian(e) {
  if (!e.isGroup) {
    e.reply('修仙游戏请在群聊中游玩');
    return;
  }
  
  let usr_qq = e.user_id.toString().replace('qg_', '');
  let ifexistplay = await existplayer(usr_qq);
  if (!ifexistplay) {
    e.reply('玩家不存在，请先创建角色');
    return;
  }
  
  let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
  if (game_action == 0) {
    e.reply("修仙：游戏进行中...");
    return;
  }
  
  let player = await Read_player(usr_qq);
  
  // 检查玩家境界是否大于20
  const authorityLevel = getRealmAuthorityLevel(player);
  if (authorityLevel <= 20) {
    e.reply("你尚未达到仙帝之境，无法修复破碎的位面");
    return;
  }
  
  // 读取位面数据
  let weimianData = {};
  try {
    const weimianPath = data.filePathMap.weimianList;
    if (fs.existsSync(weimianPath)) {
      weimianData = JSON.parse(fs.readFileSync(weimianPath, 'utf8'));
    } else {
      // 如果文件不存在，创建默认位面数据
      weimianData = {
        "诸天位面": 5,
        "现世承受力": 9999999
      };
      fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 2));
    }
  } catch (err) {
    console.error("读取位面数据失败:", err);
    e.reply("读取位面数据失败，请稍后再试");
    return;
  }
  
  // 计算修复所需修为和血气
  const requiredCultivation = player.修为 * 0.5+100000000000; // 50%修为
  const requiredBlood = player.血气 * 0.5+100000000000; // 30%血气
  
  // 检查是否足够
  if (player.修为 < requiredCultivation || player.血气 < requiredBlood) {
    e.reply([
      `【修复位面·修为不足】`,
      
      `修复破碎的诸天位面需要消耗：`,
      `修为：${Math.floor(requiredCultivation)}（当前：${Math.floor(player.修为)}）`,
      `血气：${Math.floor(requiredBlood)}（当前：${Math.floor(player.血气)}）`,
      
      `你尚不具备修复位面的伟力，请继续修炼！`
    ].join("\n"));
    return;
  }
  
  // 扣除修为和血气
  player.修为 -= requiredCultivation;
  player.血气 -= requiredBlood;
  
  // 修复位面 - 同时增加现世承受力和诸天位面
  const repairAmount = authorityLevel * 10000;
  weimianData.现世承受力 += repairAmount;
  
  // 增加诸天位面数量
  const weimianIncrease = 1; // 每5级增加1个位面
  weimianData.诸天位面 += weimianIncrease;

  // 保存玩家数据
  await Write_player(usr_qq, player);
  
  // 保存位面数据
  try {
    fs.writeFileSync(data.filePathMap.weimianList, JSON.stringify(weimianData, null, 4), 'utf8');
  } catch (err) {
    console.error("保存位面数据失败:", err);
    e.reply("保存位面数据失败，修复可能未完全生效");
  }
  
  // 广播修复消息
  const message = [
    `【仙帝伟力·修复位面】`,
    
    `诸天崩坏，万界哀鸣！`,
    `${player.名号}仙帝踏岁月长河而来，`,
    `眸中映照万古轮回，掌中演化宇宙生灭！`,
    
    `只见仙帝双手结印，无上道则如星河垂落，`,
    `破碎的位面壁垒在仙帝伟力下缓缓愈合！`,
    
    `消耗：`,
    `修为：${Math.floor(requiredCultivation)}`,
    `血气：${Math.floor(requiredBlood)}`,
    
    `修复成果：`,
    `现世承受力 +${repairAmount}`,
    `诸天位面 +${weimianIncrease}`,
    
    `当前状态：`,
    `现世承受力：${weimianData.现世承受力}`,
    `诸天位面：${weimianData.诸天位面}`,
    
    `万灵有感，诸天震动！`,
    `破碎的位面在仙帝伟力下重获新生！`,
    
    ` 众生齐颂：${player.名号}仙帝功德无量！`
  ].join("\n");
      const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
    const groupList = await redis.sMembers(redisGlKey);
  for (const group_id of groupList) {
        await pushInfo(group_id, true, message);
    }
}
async jiyuanjilei(e) {
  if (!e.isGroup) {
    e.reply('修仙游戏请在群聊中游玩');
    return;
  }

  // 解析指令（支持 #消耗纪元积累*3 这样的格式）
  const match = e.msg.match(/^#(?:消耗|转化)纪元积累(?:\s*(\d+)|\*(\d+))?$/);
  const consumeCount = parseInt(match[1] || match[2] || '1');

  let usr_qq = e.user_id.toString().replace('qg_', '');
  let ifexistplay = await existplayer(usr_qq);
  if (!ifexistplay) {
    e.reply('玩家不存在，请先创建角色');
    return;
  }

  let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
  if (game_action == 0) {
    e.reply("修仙：游戏进行中...");
    return;
  }

  let player = await Read_player(usr_qq);

  // 检查纪元积累是否足够
  if (player.纪元积累 === undefined || player.纪元积累 < consumeCount) {
    e.reply(`你的纪元积累不足！当前剩余：${player.纪元积累 || 0}，需要消耗：${consumeCount}`);
    return;
  }

  // 计算奖励（优化后的公式）
  const baseReward = 100000000;
  const reward = baseReward *
    Math.max(1, getRealmAuthorityLevel(player)) *
    player.level_id  * 
    player.Physique_id ;

  // 应用奖励
  const totalReward = Math.floor(reward * consumeCount);
  player.修为 += totalReward;
  player.血气 += totalReward;
  player.纪元积累 -= consumeCount;

  // 保存数据
  await Write_player(usr_qq, player);

  // 构建回复消息
  const msg = [
    `【纪元积累转化】`,
    `消耗 ${consumeCount} 个纪元积累，获得：`,
    `修为：+${totalReward.toLocaleString()}`,
    `血气：+${totalReward.toLocaleString()}`,
    `当前纪元积累剩余：${player.纪元积累}`,
    `（转化效率：${Math.floor(reward / baseReward * 100)}%）`
  ].join('\n');

  e.reply(msg);
}

async hongjiChengxianlu(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_','');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    // 检查境界 - 必须大于16（红尘仙境界）
    if (!hasRealmAuthority(player, 17)) {
      return e.reply([
        `【境界不足·无法轰击成仙路】`,
        ,
        `${player.名号}立于星空古路尽头，`,
        `欲轰击成仙路，却感力不从心！`,
        ,
        `「红尘仙境界方可撼动仙路壁垒！」`,
        `当前境界: ${getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)}（需红尘仙或真仙）`,
        ,
        `继续苦修，待境界足够再来尝试！`
      ].join('\n'));
    }

    // 读取位面数据
    let weimianData = {};
    try {
      const weimianPath = data.filePathMap.weimianList;
      if (fs.existsSync(weimianPath)) {
        const rawData = fs.readFileSync(weimianPath, 'utf8');
        weimianData = JSON.parse(rawData);
      } else {
        return e.reply('位面数据文件不存在，无法验证成仙路状态');
      }
    } catch (err) {
      console.error('读取位面数据失败:', err);
      return e.reply('读取位面数据失败，无法验证成仙路状态');
    }

    // 检查帝尊状态 - 必须为0（已被打败）
    if (weimianData.帝尊 !== 0) {
      return e.reply([
        `【帝尊未灭·仙路难开】`,
        ,
        `${player.名号}欲轰击成仙路，`,
        `却感冥冥中有大恐怖阻隔！`,
        ,
        `「帝尊未灭，仙路难开！」`,
        `帝尊仍在布局万古，炼化诸天，`,
        `此时轰击成仙路必遭其扼杀！`,
        ,
        `待帝尊彻底败亡后，方可尝试！`
      ].join('\n'));
    }
    
    // ==== 新增：时空条件检查 ====
    // 1. 检查是否在遮天位面（power_place=2）
    if (player.power_place !== 2) {
      const placeNames = {
        '凡间': 0,
        '仙界': 1,
        '下界八域': 1.5,
        '遮天位面': 2,
        "九天十地":2.5,
        '界海': 3,
        '时间长河': 4,
        '永恒未知之地': 5,
        '仙域': 6
      };
      
      const currentPlace = placeNames[player.power_place] || "未知位面";
      
      return e.reply([
        `【时空错位·仙路难寻】`,
        ,
        `${player.名号}欲轰击成仙路，`,
        `却感天地法则排斥，时空错乱！`,
        ,
        `「仙路只在特定时空节点显现！」`,
        `古史记载：`,
        `- 神话时代，帝尊于北斗星域开启仙路`,
        `- 太古末年，不死天皇在飞仙星踏仙路`,
        `- 荒古岁月，狠人大帝一掌断仙路于葬帝星`,
        ,
        `唯有遮天位面（北斗、飞仙、葬帝等古星），`,
        `方有成仙路显现的时空节点！`,
        ,
        `当前位置：${currentPlace}`,
        `请先前往遮天位面再尝试轰击！`
      ].join('\n'));
    }
    
    // 2. 检查成仙路是否开启（weimianData.成仙路=1）
    if (weimianData.成仙路 !== 1) {
      return e.reply([
        `【仙路未开·时机未至】`,
        ,
        `${player.名号}立于星空下，`,
        `眸光如电，欲击穿仙路壁垒！`,
        ,
        `然，虚空寂寥，万道沉寂，`,
        `仙路壁垒坚如磐石，纹丝不动！`,
        ,
        `「仙路未开，时机未至！」`,
        `古史昭示：`,
        `- 仙路开启需万古积累`,
        `- 时机未至，纵仙帝亦难强行开启`,
        ,
        `唯有等待成仙路自然开启之时，`,
        `方可尝试轰击！`,
        ,
        `当前状态：成仙路未开启`
      ].join('\n'));
    }

    // 更新玩家位置
    player.power_place = 6;
    await Write_player(player_qq, player);

    // 构建辰东风格文案
    const realmNames = [
      "北斗星域",
      "飞仙星",
      "葬帝星",
      "紫微星域",
      "通天古星"
    ];
    const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];

    const message = [
      `【轰击成仙路·万古奇迹】`,
      `${player.名号}立于${randomRealm}之巅，眸光开阖间，天上地下都在颤栗！`,
      ,
      `"万古等待，只为今朝！"`,
      `${player.名号}一声道喝震碎星河，`,
      `无穷仙光自其体内爆发，照亮了永恒！`,
      ,
      `一拳轰出，万道哀鸣！`,
      `成仙路壁垒如琉璃般寸寸破碎，`,
      `璀璨仙光自裂缝中喷涌而出，`,
      `弥漫着长生气息！`,
      ,
      `"成功了！"`,
      `${player.名号}迈步而入，踏入仙域，`,
      `眼前景象令其震撼不已：`,
      `- 仙山巍峨，灵气如液，瀑布垂落九万丈`,
      `- 神药遍地，不死物质浓郁得化不开`,
      `- 仙禽瑞兽嬉戏，祥瑞之气弥漫`,
      `- 天地规则完整无缺，大道轰鸣`,
      ,
      `「这就是仙域么？」`,
      `${player.名号}深吸一口气，`,
      `只觉寿元暴涨，道基稳固，`,
      `仿佛下一刻就能突破至高境界！`,
      ,
      `在正确的时间，正确的地点，`,
      `${player.名号}终于轰穿了成仙路，`,
      `抵达了无数修士梦寐以求的仙域！`,
      `自此，长生不死不再是传说！`,
      ,
      `位置已更新：仙域`
    ].join('\n');

    await e.reply(message);
    return true;

  } catch (error) {
    console.error('轰击成仙路失败:', error);
    await e.reply([
      `❌ 轰击成仙路失败`,
      `错误信息: ${error.message}`,
      `请联系管理员查看日志`
    ].join('\n'));
    return false;
  }
}
/** 逆天改命功能 */
async changeAptitude(e) {
  // 群聊限定
  if (!e.isGroup) {
    e.reply('修仙之路当在群仙汇聚之所印证');
    return false;
  }
  
  // 解析命令
  const aptitudeName = e.msg.match(/#为其逆天改命\s+(.+?)(?:\s|$)/);
  if (!aptitudeName || !aptitudeName[1]) {
    e.reply('指令格式：#为其逆天改命 新天资名称 [@目标玩家]');
    e.reply('可用天资：生而愚痴、天弃之人、先天不足、平庸之资、超凡资质、天纵之资、旷世奇才、绝世天骄、万古无双、无演无尽');
    return false;
  }
  
  // 确定目标玩家QQ
  let targetQQ = e.user_id;
  if (e.message.some(item => item.type === "at")) {
    const atItem = e.message.find(item => item.type === "at");
    targetQQ = atItem.qq;
  }
  
  // 检查施法者是否存在
  const invokerQQ = e.user_id;
  if (!await existplayer(invokerQQ)) {
    e.reply('你尚未踏入仙途，无法施展逆天改命之术');
    return false;
  }
  
  // 检查施法者境界
  const invoker = await Read_player(invokerQQ);
  const authorityLevel = getRealmAuthorityLevel(invoker);
  if (authorityLevel < 21) {
    e.reply(`你当前境界不足，唯有仙帝方可掌控命运！`);
    return false;
  }
  
  // 获取目标玩家
  if (!await existplayer(targetQQ)) {
    e.reply('目标修士尚未踏入仙途');
    return false;
  }
  const targetPlayer = await Read_player(targetQQ);
  
  // 完整的天资序列
  const aptitudeSequence = [
    '生而愚痴',
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
  
  // 内联构建天资数据对象（替代不存在的 getPlayerAptitudeData 函数）
  const targetAptitudeData = {
    grade: targetPlayer.天资等级 || '平庸之资',
    index: aptitudeSequence.indexOf(targetPlayer.天资等级 || '平庸之资')
  };
  const invokerAptitudeData = {
    grade: invoker.天资等级 || '平庸之资',
    index: aptitudeSequence.indexOf(invoker.天资等级 || '平庸之资')
  };

  // 检查新的天资是否有效
  const newAptitude = aptitudeName[1];
  if (!aptitudeSequence.includes(newAptitude)) {
    const validList = aptitudeSequence.join('、');
    e.reply([
      `〖天资无效〗`,
      `"${newAptitude}"并非有效的天资名称！`,
      ``,
      `可用天资列表：`,
      `生而愚痴、天弃之人、先天不足、平庸之资`,
      `超凡资质、天纵之资、旷世奇才、绝世天骄`,
      `万古无双、无演无尽`
    ].join('\n'));
    return false;
  }
  
  // === 获取原天资 ===
  const oldAptitude = targetPlayer.天资等级 || '平庸之资';

  if (oldAptitude === '无化如是') {
    e.reply('「无化如是」只在初踏仙途时由天命判定，既不可后天赋予，也不可逆天改命。');
    return false;
  }

  
  // === 特殊情况2：无演无尽无法被降低 ===
  if (oldAptitude === '无演无尽' && newAptitude !== '无演无尽') {
    e.reply([
      `〖天道反制〗`,
      `${invoker.名号}试图削弱${targetPlayer.名号}的天资！`,
      `然无演无尽道果自动反击，万法不侵！`,
      `〖无演无尽道果显化〗`,
      `"无演无尽，万法源头，岂是尔等可染指？"`,
      `"欲降吾道果，需先破诸天万界！"`,
      `〖结果〗`,
      `${invoker.名号}被道果反震！`,
      `无演无尽不可被降低，维持原状！`
    ].join('\n'));
    return false;
  }
  
  // === 特殊情况3：施法者天资不够 ===
  // 只有无演无尽才能将他人提升到无演无尽
  if (newAptitude === '无演无尽' && invokerAptitudeData.grade !== '无演无尽') {
    e.reply([
      `〖权限不足〗`,
      `你欲将${targetPlayer.名号}提升至【无演无尽】！`,
      `然无演无尽乃无穷之终点，唯有自身已达此境者，`,
      `方能为他人开启无演无尽之路！`,
      `〖境界要求〗`,
      `施法者天资：${invokerAptitudeData.grade}`,
      `所需天资：无演无尽`,
      `提示：你需先将自己提升至无演无尽`
    ].join('\n'));
    return false;
  }
  
   
  // 构建天资评价
  const aptitudeEvaluations = {
    '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚，万法源头，众生终点',
    '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌，帝光耀世',
    '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角，眸光开阖间便有真龙盘绕',
    '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻，一滴血便可压塌虚空',
    '天纵之资': '天赋异禀，媲美上古大教的天才，吞吐间有混沌气缭绕',
    '超凡资质': '资质超凡，注定异于常人，道基之上显化异象',
    '平庸之资': '资质平平，勉勉强强，在芸芸修士中毫不起眼',
    '先天不足': '先天有缺，修炼事倍功半，如同漏鼎难承天地灵气',
    '天弃之人': '被天道抛弃，修炼必遭反噬，每一步修行都将遭遇天罚拷问',
    '生而愚痴': '天生愚笨，修炼难如登天，识海混沌，思维迟滞',
    '无化如是': '无用之人，命中注定难有所作为，任何外力都无法改变，天道枷锁'
  };
  
  // 构建仙帝威势消息
  let emperorRealmDesc = "";
  if (authorityLevel >= 23) {
    emperorRealmDesc = `〖祭道之上〗${invoker.名号}周身缭绕不灭道光，祭道之力席卷八荒，诸世在他面前颤抖，时空概念为之扭曲`;
  } else if (authorityLevel === 22) {
    emperorRealmDesc = `〖祭道〗${invoker.名号}帝威浩荡，眸中映照万界生灭，一念间诸天星辰皆成尘埃，时间长河在脚下臣服`;
  } else {
    emperorRealmDesc = `〖仙帝〗${invoker.名号}仙帝气机震动时间长河，掌指间流淌着毁灭万物的能量，天道法则为之让路`;
  }
  
  // === 构建特效消息 ===
  let effectMsg = [
    `〖逆天改命·篡夺造化〗`,
    `混沌炸裂！时空震颤！`,
    `${emperorRealmDesc}`,
    `${invoker.名号}一步踏出，诸天规则哀鸣！`,
    `时间长河被截断，命运长河激起万丈波澜！`,
    `帝掌覆盖无量宇宙，因果轨迹在其掌心重铸！`
  ];
  
  // === 特殊天资改动有额外特效 ===
  if (oldAptitude === '生而愚痴') {
    effectMsg.push(`愚痴枷锁浮现，与天道法则激烈对抗！`);
  }
  if (newAptitude === '无演无尽') {
    effectMsg.push(`诸天万界同时共鸣，迎接新的无演无尽诞生！`);
  }
  if (newAptitude === '生而愚痴') {
    effectMsg.push(`天道降下愚痴枷锁，封印灵智！`);
  }
  
  // 天资蜕变特效
  let changeProcess = [
    `▼ 命运长河倒灌 ▼`,
    `▷ 原始天资【${oldAptitude}】被强行剥离：`,
    `  天地间回荡着命运规则的崩裂声，万道枷锁寸寸断裂`,
    `▷ 创世仙光重塑本源：`,
    `  九色神虹贯穿诸天，三千大道符文烙印进血脉深处`
  ];
  
  // 特殊蜕变效果
  if (oldAptitude === '生而愚痴') {
    changeProcess.push(`▷ 愚痴枷锁破碎：`,
      `  识海混沌消散，灵智初开，智慧之光闪耀！`);
  } else if (newAptitude === '生而愚痴') {
    changeProcess.push(`▷ 天道封印降临：`,
      `  愚痴枷锁加身，灵智蒙尘，智慧之光逐渐黯淡！`);
  }
  
  if (newAptitude === '无演无尽') {
    changeProcess.push(`▷ 无演无尽道果孕育：`,
      `  混沌气弥漫中，【无演无尽】真命正在复苏，`,
      `  万法臣服，诸道共鸣！`);
  } else {
    changeProcess.push(`▷ 【${newAptitude}】道果孕育：`,
      `  混沌气弥漫中，【${newAptitude}】真命正在复苏`);
  }
  
  // 结果消息
  let resultMsg = [
    `≡≡≡ 宿命终章 ≡≡≡`,
    `一缕眸光击穿时间长河，帝掌缓缓收回：`,
    `  万界重归平静，唯留命运长河上荡漾的涟漪`,
    `  施法仙帝：${invoker.名号}`,
    `  目标修士：${targetPlayer.名号}`,
    `  原始天资：【${oldAptitude}】`,
    `  重塑天资：【${newAptitude}】`,
    `  天资跃迁：${targetAptitudeData.index} → ${aptitudeSequence.indexOf(newAptitude)}`,
  ];
  
  // 天资评价
  resultMsg.push(`  命格批语：${aptitudeEvaluations[newAptitude]}`);
  
  // 施法者留言
  const emperorMessages = [
    `"修道一途，逆天而行！今日本帝篡尔天命，望汝不负此造化"`,
    `"天命已改，道途重铸，望汝能登临绝巅"`,
    `"本帝今日种下因果，他日望能结出无上道果"`,
    `"命运长河已为你改道，前路如何，全在汝一念之间"`,
    `"天道枷锁已破，从今往后，你的命运由自己书写"`
  ];
  
  const randomMessage = emperorMessages[Math.floor(Math.random() * emperorMessages.length)];
  resultMsg.push(`${invoker.名号}收拢周身道则，漠然低语：`);
  resultMsg.push(`  ${randomMessage}`);
  
  // 特殊天资的额外警告
  if (newAptitude === '无化如是') {
    resultMsg.push(``);
    resultMsg.push(`〖天道警告〗`);
    resultMsg.push(`无化如是乃天道诅咒，一旦获得，永世不可更改！`);
    resultMsg.push(`目标修士将永远无法学习功法、提升境界！`);
  } else if (newAptitude === '生而愚痴') {
    resultMsg.push(``);
    resultMsg.push(`〖愚痴警告〗`);
    resultMsg.push(`生而愚痴将蒙蔽灵智，学习功法极其困难！`);
    resultMsg.push(`建议尽快寻找开智之法！`);
  }
  
  // 更新玩家数据
  targetPlayer.天资等级 = newAptitude;
  targetPlayer.天资评价 = aptitudeEvaluations[newAptitude];
  await Write_player(targetQQ, targetPlayer);
  
  // 记录逆天改命日志
  if (!targetPlayer.逆天改命记录) {
    targetPlayer.逆天改命记录 = [];
  }
  targetPlayer.逆天改命记录.push({
    时间: new Date().toISOString(),
    施法者: invoker.名号,
    原天资: oldAptitude,
    新天资: newAptitude
  });
  await Write_player(targetQQ, targetPlayer);
  
  // 发送分段消息（带特效延迟）
  await e.reply(`〖逆天改命·序幕〗${invoker.名号}帝威初现，欲为${targetPlayer.名号}篡改天命！`);
  await sleep(1500);
  await e.reply(effectMsg.join('\n'));
  await sleep(2500);
  await e.reply(changeProcess.join('\n'));
  await sleep(3000);
  await e.reply(resultMsg.join('\n'));
  
  // 如果是无化如是，发送额外警告
  if (newAptitude === '无化如是') {
    await sleep(2000);
    await e.reply([
      `〖终极警告〗`,
      `目标${targetPlayer.名号}已被赋予【无化如是】天资！`,
      `从此刻起：`,
      `1. 无法学习任何功法、技能`,
      `2. 无法加入任何势力`,
      `3. 无法提升境界`,
      `4. 任何提升资质的道具对其无效`,
      `5. 永久不可更改`,
      `此为天道最严厉的诅咒，慎之！慎之！`
    ].join('\n'));
  }
  
  return true;
}



 async jidao(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return;
    }
    
    let player = await Read_player(usr_qq);
    
    const promotionGate = getSacrificePromotionGate(player);
    if (!promotionGate.ok) {
        const missing = [];
        if (!promotionGate.checks.immortalEmperor) missing.push('达到路尽级仙帝');
        if (!promotionGate.checks.emperorKills) missing.push(`击杀仙帝级强者10位（当前${promotionGate.kills}位）`);
        if (!promotionGate.checks.daoHeart) missing.push(`道心圆满（当前${promotionGate.daoHeart.name}）`);
        if (!promotionGate.checks.selfDao) missing.push(`自身之道修满仙帝阶段（当前${promotionGate.selfDaoCultivation}/400）`);
        e.reply(['【祭道门槛未满】', ...missing.map(item => `· ${item}`)].join('\n'));
        return;
    }
    
    // 祭道成功率与失败处理
    const successRate = 0.5; // 50%成功率
    const randomValue = Math.random();
    
    if (randomValue > successRate) {
       if (player.莫晓羽庇护 === 1) {
        e.reply([
            `【祭道失败·厄土阻道】`,
            ,
            `${player.名号}焚尽规则与秩序，欲祭掉自身至高大道！`,
            `刹那间，诸天万界剧烈震动，时空长河倒卷！`,
            `"轰隆——"`,
            `厄土高原深处，十具古老棺椁同时开启！`,
            `十位始祖自万古沉眠中苏醒，眸光撕裂无尽宇宙！`,
            `"何人敢窥祭道之境？"`,
            `声波化作亿万黑暗神链贯穿诸天，无尽次元宇宙在威压下哀鸣崩灭！`,
            `十股祭道级威压锁定${player.名号}，厄土高原显化实体，`,
            `要将整个祭道场域拖入永恒的黑暗深渊！`,
            `就在十位始祖真身降临的刹那——`,
            `"聒噪！"`,
            `九天之巅传来一声道喝，莫晓羽踏破万古时空降临！`,
            `一位始祖瞳孔骤缩："是你？！当年那个无化如是的小子！"`,
            `另一始祖骇然道："不可能！你竟已走到这一步？！"`,
            `莫晓羽眸光平静扫过十位始祖："无化如是是我，无演无尽依旧是我。"`,
            `音声震碎万古虚空，十位始祖齐齐后退，厄土高原剧烈震动！`,
            `"她我保定了，尔等可有异议？！"`,
            `十位始祖怒极而笑："狂妄！即便你触摸到那个境界，也休想独抗我十人！"`,
            `"合体！让他见识真正的终极始祖之力！"`,
            `十位始祖化作十道黑暗本源，在厄土高原深处融合！`,
            `一尊超越祭道领域的终极始祖诞生：`,
            ` 身躯贯穿古今未来，同时存在于所有时间线`,
            ` 每根发丝都缠绕着亿万宇宙的生灭轮回`,
            ` 呼吸间喷吐的黑暗物质足以污染整部古史`,
            `"此乃我等燃烧始祖本源凝聚的终极形态，看你如何抵挡！"`,
            `终极始祖一掌拍出，掌中蕴含诸天万界所有黑暗时代的毁灭力量！`,
            ``,
            `莫晓羽淡然不语，只是轻轻抬眸一瞥——`,
            `"轰！！！！"`,
            `终极始祖的身躯寸寸炸裂，连同整个厄土高原一起化作虚无粒子！`,
            `眸光所及，时空重构，黑暗物质逆流回溯，万古因果尽数斩断！`,
            ,
            `骤然！无尽维度的尽头传来开天辟地之音：`,
            `"祭道领域，岂容亵渎！"`,
            `一道身披万道星辉的身影踏破维度壁障，其威压令诸天规则哀鸣臣服：`,
            ` 每一步落下都有新宇宙诞生又湮灭`,
            ` 发丝飘动间亿万星河随之明暗流转`,
            ` 眸光开阖时映照古今未来所有因果`,
            `超维真界至高主宰！真正统御无限维度的存在降临！`,
            `"此子祭道，当入万维炼狱受永世劫火"`,
            `主帝声如开天法则，言出法随，整个祭道场域开始固化结晶！`,
            `莫晓羽黑发狂舞，面对至高主帝竟露轻笑：`,
            `"就凭你？"`,
            `他翻掌祭出主宰道舍，这件超越维度理解的至宝瞬间化作永恒庇护：`,
            ` 道舍绽放无量文明辉光，将${player.名号}笼罩其中`,
            `万道梵宇法则触及时空扭曲避让`,
            ` 主帝威压被隔绝在文明辉光之外`,
            `护好此物，待我归来！`,
            `道音未落，莫晓羽已撕裂维度：`,
            `"主帝小儿，可敢随本座去那鸿蒙未判之地做过一场？！"`,
            `鸿蒙未判之地的战斗余波穿透万古维度：`,
            `有开天巨斧劈碎永恒星海的虚影`,
            `见混沌青莲镇封亿万文明的景象`,
            `闻时空长河被斩断重续的悲鸣`,
            `感诸天万界在道战中颤栗崩解`,
            `主帝怒喝穿透万古："莫晓羽！你竟触摸到了那层境界？！"`,
            `道音渐隐，唯留主宰道舍庇护下的${player.名号}安然祭道...`
        ].join('\n'));
        
            
            // 祭道成功并获得主宰道舍庇护
            player.修为 = 0;
            player.血气 = 0;
            promotePlayerToSacrifice(player);
            player.level_id = 1;
            player.Physique_id = 1;
            player.主宰道舍庇护 = 1; // 新增庇护属性
            
            await Add_HP(usr_qq, 9999999999);
            await Write_player(usr_qq, player);
        } else {
            e.reply([
                `【祭道失败·始祖阻道】`,
                ,
                `${player.名号}焚尽规则与秩序，欲祭掉自身至高大道！`,
                `刹那间，诸天万界剧烈震动，时空长河倒卷！`,
                `"轰隆——"`,
                `厄土高原深处，十具古老棺椁同时开启！`,
                `十位始祖自万古沉眠中苏醒，眸光撕裂无尽宇宙！`,
                `何人敢窥探祭道领域？`,
                `声波化作实质的黑暗秩序链，贯穿古今未来！`,
                `亿万黑暗物质自虚空裂缝涌出，化作遮天巨手抓向${player.名号}！`,
                `始祖真身未至，其威压已让诸天星辰黯淡，万道哀鸣！`,
                `此路不通，当永寂！`,
                `冰冷的声音冻结时空，${player.名号}的祭道进程被强行中断！`,
                `黑暗秩序链贯穿${player.名号}的仙帝本源，`,
                `大道根基被撕裂，神魂遭受不可逆的重创！`,
                `十位始祖联手施压，祭道之路被彻底断绝！`,
                `始祖齐出，天下无不克之地，无不败之兵！`,
                `${player.名号}从祭道状态跌落，道果崩裂，`,
                `修为大幅倒退，需重新积累方能再次尝试！`,
                `厄土始祖的黑暗印记已烙印在其大道本源中，`,
                `下次祭道将会引来更恐怖的阻道！`
            ].join('\n'));
            
            // 祭道失败惩罚
            player.修为 *= 0.3; 
            player.血气 *= 0.3; 

             player.mijinglevel_id = 20;
            await Write_player(usr_qq, player);
        }
    } else {
        // 40%概率成功
        player.修为 = 0;
        player.血气 = 0;
        promotePlayerToSacrifice(player);
        player.level_id = 1;
        player.Physique_id = 1;
        await Add_HP(usr_qq, 9999999999);
        await Write_player(usr_qq, player);
        
        e.reply(`你焚尽规则与秩序，祭掉了自身的至高大道与过往的一切，极尽升华！成功到达祭道领域，此刻你已经能够洞彻古今未来，意志便能让一切因果时空命运尽灭，拥有恐怖的伟力，仅是立身于现世就能压塌无尽无限多元宇宙，哪怕是囊括无穷尽神维丝线海的维宙在你一眼凝视下也要刹那湮灭！`);
    }
}
async hongjiTiandao(e) {
    // 仅限群聊使用
    if (!e.isGroup) {
        e.reply('帝境神通需在群内施展');
        return true;
    }

    // 检查@目标
    const atTarget = e.message.find(item => item.type === "at");
    if (!atTarget) {
        e.reply('请指定护道目标：\n#轰击天地万道助其成帝@目标QQ');
        return true;
    }
    const targetQQ = atTarget.qq;

    // 验证执行者
    const executorQQ = e.user_id;
    const executor = await Read_player(executorQQ);
    if (!executor) {
        e.reply('执行者未创建修仙角色');
        return true;
    }

    // 境界校验（需准仙帝）
    if (!hasRealmAuthority(executor, 16)) {
        e.reply([
            `「帝威不足！」`,
            `${executor.名号}当前境界：${getRealmAuthorityName(executor, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)}`,
            `轰穿万道需大帝或至尊之境`
        ].join('\n'));
        return true;
    }

    // 验证目标
    const target = await Read_player(targetQQ);
    if (!target) {
        e.reply(`目标玩家不存在`);
        return true;
    }

    // 目标状态校验
    if (target.mijinglevel_id < 15) {
        e.reply([
            `「帝基未固」`,
            `${target.名号}当前境界：${target.境界}`,
            `需达到准帝九重天（境界ID≥15）`
        ].join('\n'));
        return true;
    }

    if (target.护道状态) {
        e.reply([
            `「帝路已开」`,
            `${target.名号}已有短暂证道时间`,
            `无需重复护道`
        ].join('\n'));
        return true;
    }

   // ==== 开始护道流程 ====
await e.reply(`🌌 ${executor.帝号}眸绽冷电，帝拳轰击天地万道！`);
await sleep(2000);

     // 新增：护道过程状态追踪
    let totalDamage = 0; // 累计承受伤害
    const damagePer5Sec = 30000000000; // 每5秒300亿伤害
    let isFailed = false; // 是否失败标志
    
   // 阶段1：旧道反噬（参考叶凡战九大天尊）
await e.reply([
    `万道化九大天尊虚影临世！`,
    `虚空雷海翻涌，少年无始持钟、狠人执罐踏劫而至`,
    `${executor.帝号}独断帝劫，每五息承${damagePer5Sec/100000000}亿道痕反噬！`
].join('\n'));
    
    // 新增：循环扣血机制（共3轮，每次5秒）
    for (let i = 1; i <= 30; i++) {
        await sleep(5000); // 等待5秒
        
        // 扣除血量
        executor.当前血量 = Math.max(0, executor.当前血量 - damagePer5Sec);
        totalDamage += damagePer5Sec;
        
        // 更新玩家数据
        await Write_player(executorQQ, executor);
        
          await e.reply([
        `第${i}重帝劫！`,
        `天尊虚影结「诛仙阵」引动混沌雷池`,
        `${executor.帝号}帝血染星海，道骨现裂痕！`,
        `气血暴跌${(damagePer5Sec/100000000).toLocaleString()}亿`
    ].join('\n'));
        
        // 检查是否失败
        if (executor.当前血量 <= 0) {
            isFailed = true;
            await e.reply([
                `帝躯崩解！`,
                `${executor.帝号}道基溃散，玄黄鼎坠落星海`,
                `「终究...逆不了这天...」`,
                `轰击万道失败！`
            ].join('\n'));
            break; // 中断循环
        }
    }
    
    // 若中途失败则终止流程
    if (isFailed) return true;

    // 阶段2：重塑道痕（仅当存活时执行）
    await e.reply([
        `帝血焚燃，万道重组！`,
        `玄黄鼎吞噬旧道痕，撕裂天道枷锁`,
        `「新道当立！！」`
    ].join('\n'));
    
    // 阶段3：禁区干扰（30%概率）
    if (Math.random() < 0.3) {
        await sleep(3000);
        await e.reply([
            `太初古矿传来冷笑：`,
            `「投机取巧，终将道崩！」`,
            `不死山射出诅咒仙芒，削弱${target.名号}20%血气`
        ].join('\n'));
        target.血气 *= 0.8;
    }

    const damage = 30000000000
    totalDamage += damage;
    
    // 玩家承受伤害
    executor.当前血量 = Math.max(0,executor.当前血量 - damage);
    // ==== 更新数据 ====
    // 赋予目标天心印记（1小时有效期）
    target.护道状态 = Date.now() + 3600000;
    await Write_player(targetQQ, target);

    // 执行者代价
    executor.修为 *= 0.7;
    executor.血气 *= 0.8;
    await Write_player(executorQQ, executor);

    // ==== 天道诏告 · 新帝契机 ====
    target.护道状态 = Date.now() + 3600000; // 1时辰证道窗口
    // 成功播报
    return e.reply([
        `〖天道诏告〗`,
        `万古铁律崩坏！累计承受${(totalDamage/100000000).toLocaleString()}亿道伤`,
        `${executor.帝号}以帝血开辟新路：`,
        `• 修为跌落${(executor.修为*0.3).toLocaleString()}(-30%)`,
        `• 血气枯竭${(executor.血气*0.2).toLocaleString()}(-20%)`,
        `——————————————————`,
        `${target.名号}获证道契机至 ${new Date(Date.now() + 3600000).toLocaleTimeString()}`
    ].join('\n'));
}
async jingxue(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    
    // 解析数量参数
    const match = e.msg.match(/#凝聚精血\*(\d+)$/);
    let amount = 1;
    if (match && match[1]) {
        amount = parseInt(match[1]);
        if (amount <= 0) {
            return e.reply('凝聚数量需为正整数！');
        }
        if (amount > 99999999) {
            return e.reply('单次最多凝聚99999999滴精血！');
        }
    }
    
    // 特殊体质映射表（添加圆神）
    const specialConstitutions = {
        "圣体": "圣体精血",
        "小成圣体": "小成圣体精血",
        "大成圣体": "大成圣体精血",
        "道胎": "先天道胎精血",
        "圣体道胎": "圣体道胎精血",
        "妖体": "妖体精血",
        "神体": "神体精血",
        "混沌体": "混沌体精血",
        "混沌圣体道胎": "混沌圣体道胎精血",
        "至尊体": "至尊体精血",
        "大道体": "大道体精血",
        "圆环之理": "圆神精血"  // 新增圆神体质
    };
    
    // 检查是否特殊体质
    if (!specialConstitutions[player.灵根.type]) {
        return e.reply([
            `【万道反噬】`,
            `你尝试凝聚本源精血，却引发大道暴动！`,
            `体内奔涌的${player.灵根.type}血脉剧烈沸腾，`,
            `七窍喷薄神光，仙台秘境几欲崩裂！`,
            `警告：唯有特殊体质方可凝聚本源精血！`,
        ].join('\n'));
    }
    
    // 根据体质等级确定消耗和产出
    const bloodMap = {
        "圣体精血": { costXiuwei: 15000000, costXueqi: 15000000 },
        "小成圣体精血": { costXiuwei: 25000000, costXueqi: 25000000 },
        "大成圣体精血": { costXiuwei: 35000000, costXueqi: 35000000 },
        "先天道胎精血": { costXiuwei: 15000000, costXueqi: 15000000 },
        "圣体道胎精血": { costXiuwei: 45000000, costXueqi: 45000000 },
        "妖体精血": { costXiuwei: 10000000, costXueqi: 10000000 },
        "神体精血": { costXiuwei: 10000000, costXueqi: 10000000 },
        "混沌体精血": { costXiuwei: 40000000, costXueqi: 40000000 },
        "至尊体精血": { costXiuwei: 40000000, costXueqi: 40000000 },
         "大道体精血": { costXiuwei: 40000000, costXueqi: 40000000 },
        "混沌圣体道胎精血": { costXiuwei: 75000000, costXueqi: 75000000 },
        "圆神精血": { costXiuwei: 70000000, costXueqi: 70000000 }  // 圆神消耗更高
    };
    
    const bloodName = specialConstitutions[player.灵根.type];
    const { costXiuwei, costXueqi } = bloodMap[bloodName];
    
    // 计算总消耗
    const totalXiuwei = costXiuwei * amount;
    const totalXueqi = costXueqi * amount;
    
    // 检查资源是否足够
    if (player.修为 < totalXiuwei) {
        return e.reply([
            `【本源枯竭】`,
            `尝试凝聚${amount}滴${bloodName}失败！`,
            `需${totalXiuwei.toLocaleString()}点修为，当前仅有${player.修为.toLocaleString()}点`,
            `体内道则轰鸣却后继无力，血气黯淡如残烛`,
        ].join('\n'));
    }
    
    if (player.血气 < totalXueqi) {
        return e.reply([
            `【血气衰败】`,
            `凝聚${amount}滴${bloodName}遭遇反噬！`,
            `需${totalXueqi.toLocaleString()}点血气，当前仅有${player.血气.toLocaleString()}点`,
            `血气如退潮般消散，本源几近枯竭`,
        ].join('\n'));
    }
    
    // 凝聚精血文案（根据体质不同）
    let cultivationText = [];
    
    // 圆神体质特殊文案
    if (player.灵根.type === "圆环之理") {
        cultivationText = [
            `【圆环之理·精血凝聚】`,
            `${player.名号}张开双臂，发间丝带绽放虹光！`,
            `「所有宇宙、过去未来的魔法少女们——」`,
            `「你们的悲伤，由我来承受！」`,
            ,
            `因果律重构！粉红光翼贯穿多元宇宙！`,
            `圆环之理显现，改写宇宙基本法则！`,
            `「这就是我选择的命运！」`,
            ,
            `悲叹之种在掌心旋转，`,
            `化作${amount}滴闪耀着虹光的圆神精血！`,
            `每滴精血中都映照着无限宇宙的生灭轮回`,
            ,
            `「希望与绝望的平衡，由我来维系...」`,
            `虹光渐隐，${player.名号}眼中闪过一丝悲悯`
        ];
    } 
    // 其他体质文案
    else {
        const baseText = {
            "圣体精血": [
                `【圣体精血·凝聚成功】`,
                `苦海翻腾，金色浪涛击天！`,
                `圣体本源轰鸣，脊柱大龙昂首长吟`,
                `${amount}滴缠绕混沌气的黄金精血自仙台凝结`
            ],
           "至尊体精血":     [
        `【至尊体·帝血重凝】`,
        `「帝威浩荡，镇压万古！」`,
        `${player.名号}体内帝血沸腾，背后浮现九重天虚影`,
        `每一滴血液都似一颗生命古星在轮转`,
        ,
        `仙台秘境中走出模糊帝影，手托日月星辰`,
        `凝练出${amount}滴紫金色的至尊帝血`,
        `每滴血中都沉浮着一方小世界，万灵膜拜`,
    ],
 "大道体精血": [
        `【大道体·本源截天】`,
        `「道法自然，我为乾坤！」`,
        `${player.名号}周身浮现三千大道锁链，`,
        `头顶浮现混沌青莲，莲心吞吐鸿蒙紫气`,
        ,
        `脊椎骨节节炸响，化作通天建木贯穿天地`,
        `凝出${amount}滴琉璃色的道源精血`,
        `每滴血中都烙印着完整的大道符文`,
    ],
            "小成圣体精血": [
                `【小成圣体精血·凝聚成功】`,
                `气血如龙，贯穿三十三重天！`,
                `金色苦海化作熔炉，淬炼圣体本源`,
                `脊柱腾起九条真龙，共同孕育${amount}滴璀璨精血`
            ],
            "大成圣体精血": [
                `【大成圣体精血·凝聚成功】`,
                `帝威弥漫，诸天星辰为之震颤！`,
                `黄金血气化作永恒神炉，熔炼万道法则`,
                `${amount}滴压塌虚空的精血浮现，内蕴开天辟地异象`
            ],
            "先天道胎精血": [
                `【先天道胎精血·凝聚成功】`,
                `道音轰鸣，万道法则垂落如瀑！`,
                `先天道纹交织成茧，孕育大道本源`,
                `${amount}滴晶莹剔透的道胎精血浮现，映照诸天星辰`
            ],
            "圣体道胎精血": [
                `【圣体道胎精血·凝聚成功】`,
                `黄金血气与先天道纹共舞！`,
                `苦海中升起混沌青莲，莲心孕育无上精血`,
                `${amount}滴融合圣体与道胎本源的混沌精血震动古今`
            ],
            "混沌体精血": [
                `【混沌体精血·凝聚成功】`,
                `混沌气弥漫，开天辟地异象显化！`,
                `体内三千小世界同时轰鸣，混沌本源凝聚`,
                `${amount}滴沉重如星域的精血浮现，内蕴鸿蒙初开景象`
            ],
            "混沌圣体道胎精血": [
                `【混沌圣体道胎精血·凝聚成功】`,
                `时间长河虚影显化，万道为之哀鸣！`,
                `黄金血气、先天道纹、混沌本源三相合一`,
                `${amount}滴照耀古史的精血凝结，散发准帝威压`
            ],
            "妖体精血": [
                `【妖体精血·凝聚成功】`,
                `万妖虚影显化，妖气席卷星域！`,
                `体内妖血沸腾，凝聚上古大妖真形`,
                `${amount}滴妖异如血钻的精血浮现，内蕴太古凶兽咆哮`
            ],
            "神体精血": [
                `【神体精血·凝聚成功】`,
                `神光冲霄，引动诸神共鸣！`,
                `体内神血沸腾，凝聚远古神明虚影`,
                `${amount}滴璀璨如大日的精血浮现，散发神圣气息`
            ]
        }[bloodName];
        
        cultivationText = [
            ...baseText,
            ,
            `消耗：${totalXiuwei.toLocaleString()}修为 | ${totalXueqi.toLocaleString()}血气`,
            `获得：${bloodName}×${amount}`,
            `此精血蕴含无上本源，可：`,
            `- 炼丹：炼制无上九转仙丹的核心材料`,
            `- 延寿：生死人肉白骨的绝世神药`,
        ];
    }
    
    // 扣除资源
    player.修为 -= totalXiuwei;
    player.血气 -= totalXueqi;
    
    // 添加精血到纳戒
    await Add_najie_thing(usr_qq, bloodName, "丹药", amount);
    await Write_player(usr_qq, player);
    
    // 构建回复
    return e.reply(cultivationText.join('\n'));
}

async shengtimishu(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    
    // 初始化圣体秘境加成属性
    if (typeof player.圣体秘境加成 === 'undefined') {
        player.圣体秘境加成 = {
            轮海: 0,
            道宫: 0,
            四极: 0,
            化龙: 0
        };
    }

    // 初始化圣体秘境完成度系统
    if (typeof player.圣体秘境完成度 === 'undefined') {
        player.圣体秘境完成度 = {
            轮海: 0,
            道宫: 0,
            四极: 0,
            化龙: 0
        };
    }

    // 解析指令参数
    const args = e.msg.trim().split(/\s+/);
    let mijing = "";
    let times = 1; // 默认修炼1次
    
    // 解析修炼次数（最后一个数字参数）
    for (let i = args.length - 1; i >= 1; i--) {
        const num = parseInt(args[i]);
        if (!isNaN(num) && num > 0) {
            times = num;
            // 从args中移除次数参数，剩下的就是秘境参数
            args.splice(i, 1);
            break;
        }
    }
    
    // 限制最大批量次数（防止刷属性）
    const maxBatchTimes = 10;
    if (times > maxBatchTimes) {
        times = maxBatchTimes;
        e.reply(` 批量修炼次数限制为${maxBatchTimes}次，已自动调整`);
    }
    
    // 检查是否指定了秘境
    if (args.length > 1) {
        const specifiedMijing = args[1];
        if (["轮海", "道宫", "四极", "化龙"].includes(specifiedMijing)) {
            mijing = specifiedMijing;
        } else {
            return e.reply([
                `秘境指定错误！`,
                `可选秘境：轮海、道宫、四极、化龙`,
                `示例：#修炼圣体秘术 轮海 5（修炼5次轮海秘境）`
            ].join('\n'));
        }
    }
    
    // 基础检查函数
    const checkPrerequisites = () => {
        // 检查功法
        if (!player.学习的功法.includes("圣体秘术")) {
            return `道途未明，秘术难寻！\n你体内并无《圣体秘术》的传承道痕\n需寻得荒古石碑，方能参悟此等打磨秘境的盖世法门`;
        }

        // 检查圣体血脉
        if (!["圣体", "小成圣体", "圣体道胎", "大成圣体"].includes(player.灵根.type)) {
            return `血脉轰鸣，金辉溃散！\n非荒古圣体一脉，强修此术必遭反噬\n你体内奔涌的${player.灵根.type}血脉与圣体道纹剧烈冲突`;
        }

        // 检查境界（需达到仙台秘境）
        if (player.mijinglevel_id < 9) {
            return `仙台未筑，秘境难开！\n圣体秘术需以仙台为基，引动九天神辉\n你当前${player.mijinglevel_id}境修为，强修恐致道基崩裂`;
        }
        
        return null;
    };

    // 批量修炼逻辑
    const batchCultivate = () => {
        let totalCostXiuwei = 0;
        let totalCostXueqi = 0;
        let totalAttributeGain = 0;
        let successTimes = 0;
        let progressDetails = [];
        let nodeAchievements = [];

        // 预先计算总消耗
        for (let i = 0; i < times; i++) {
            const currentProgress = player.圣体秘境完成度[mijing] + (i * 5);
            if (currentProgress >= 100) break;
            
            const progressFactor = 1 + (currentProgress / 100);
            const costxiuwei = Math.round(10000000 * progressFactor);
            const costXueqi = Math.round(10000000 * progressFactor);
            
            totalCostXiuwei += costxiuwei;
            totalCostXueqi += costXueqi;
        }

        // 检查资源是否足够
        if (player.修为 < totalCostXiuwei) {
            return {
                success: false,
                message: `道源枯竭！批量修炼需${totalCostXiuwei}缕混沌炁，你仅存${player.修为}缕`
            };
        }
        if (player.血气 < totalCostXueqi) {
            return {
                success: false,
                message: `气血衰败！批量修炼需${totalCostXueqi}滴圣血，你仅余${player.血气}滴`
            };
        }

        // 执行批量修炼
        for (let i = 0; i < times; i++) {
            if (player.圣体秘境完成度[mijing] >= 100) {
                progressDetails.push(`${mijing}秘境已圆满，停止修炼`);
                break;
            }

            const 原完成度 = player.圣体秘境完成度[mijing];
            const progressFactor = 1 + (原完成度 / 100);
            const costxiuwei = Math.round(10000000 * progressFactor);
            const costXueqi = Math.round(10000000 * progressFactor);
            const 单次增加属性 = Math.round(45000000 * 0.05);

            // 扣除资源
            player.修为 -= costxiuwei;
            player.血气 -= costXueqi;
            
            // 更新完成度
            player.圣体秘境完成度[mijing] += 5;
            if (player.圣体秘境完成度[mijing] > 100) {
                player.圣体秘境完成度[mijing] = 100;
            }
            
            // 更新属性加成
            player.圣体秘境加成[mijing] += 单次增加属性;
            player.攻击加成 += 单次增加属性;
            player.攻击 += 单次增加属性;
            player.生命加成 += 单次增加属性;
            player.血量上限 += 单次增加属性;
            player.当前血量 += 单次增加属性;
            player.防御加成 += 单次增加属性;
            player.防御 += 单次增加属性;

            totalAttributeGain += 单次增加属性;
            successTimes++;

            // 记录进度
            progressDetails.push(`第${i+1}次：${原完成度}% → ${player.圣体秘境完成度[mijing]}% (+${单次增加属性}属性)`);

            // 检查重要节点
            const 当前完成度 = player.圣体秘境完成度[mijing];
            if (原完成度 < 25 && 当前完成度 >= 25) {
                nodeAchievements.push(` ${mijing}秘境初成，道基稳固！`);
            } else if (原完成度 < 50 && 当前完成度 >= 50) {
                nodeAchievements.push(` ${mijing}秘境小成，黄金血气澎湃！`);
            } else if (原完成度 < 75 && 当前完成度 >= 75) {
                nodeAchievements.push(` ${mijing}秘境大成，异象纷呈！`);
            } else if (原完成度 < 100 && 当前完成度 >= 100) {
                nodeAchievements.push(` ${mijing}秘境圆满！黄金圣血沸腾！`);
            }
        }

        return {
            success: true,
            successTimes,
            totalCostXiuwei,
            totalCostXueqi,
            totalAttributeGain,
            progressDetails,
            nodeAchievements,
            finalProgress: player.圣体秘境完成度[mijing]
        };
    };

    // 主逻辑执行
    const prerequisiteCheck = checkPrerequisites();
    if (prerequisiteCheck) {
        return e.reply(prerequisiteCheck);
    }

    // 自动选择秘境（如果未指定）
    if (!mijing) {
        const unfinishedMijings = ["轮海", "道宫", "四极", "化龙"].filter(
            mij => player.圣体秘境完成度[mij] < 100
        );
        
        if (unfinishedMijings.length === 0) {
            return e.reply([
                `恭喜！所有秘境均已圆满！`,
                `轮海、道宫、四极、化龙四大秘境皆已臻至完美境界`,
                `黄金血气如大日悬空，圣体已然小成大圆满！`
            ].join('\n'));
        }
        
        mijing = unfinishedMijings[Math.floor(Math.random() * unfinishedMijings.length)];
    }

    // 检查完成度是否已达上限
    if (player.圣体秘境完成度[mijing] >= 100) {
        return e.reply([
            `${mijing}秘境已达极境！`,
            `黄金血气如大日悬空，再难寸进`,
            `当前完成度：${player.圣体秘境完成度[mijing]}%`,
            `可尝试修炼其他未圆满秘境`
        ].join('\n'));
    }

    // 执行批量修炼
    const result = batchCultivate();
    if (!result.success) {
        return e.reply(result.message);
    }

    // 保存数据
    await Write_player(usr_qq, player);

    // 秘境修炼文案
    const cultivationText = {
        轮海: `苦海翻腾，神桥贯空！轮海秘境中浪涛击天，命泉喷涌混沌气`,
        道宫: `五神诵经，道宫轰鸣！五脏道宫共振，传出远古祭祀道音`,
        四极: `四肢擎天，撑开寰宇！地水火风道则缠绕，演绎开天辟地异象`,
        化龙: `脊椎化龙，直冲仙台！脊柱大龙腾空而起，九节龙骨迸发仙光`
    }[mijing];

    // 构建回复
    const replyLines = [
        `【圣体秘术·${mijing}篇】×${result.successTimes}`,
        cultivationText,
        ``,
        ` 修炼统计：`,
        ` 成功修炼：${result.successTimes}次`,
        ` 进度提升：${player.圣体秘境完成度[mijing] - (result.successTimes * 5)}% → ${player.圣体秘境完成度[mijing]}%`,
        ` 属性增益：+${result.totalAttributeGain}（攻击/防御/气血）`,
        ` 资源消耗：${result.totalCostXiuwei}修为 | ${result.totalCostXueqi}血气`,
        ``
    ];

    // 添加节点成就
    if (result.nodeAchievements.length > 0) {
        replyLines.push(` 秘境突破：`);
        replyLines.push(...result.nodeAchievements);
        replyLines.push(``);
    }

    // 添加详细进度（如果次数较多则折叠显示）
    if (result.successTimes <= 5) {
        replyLines.push(` 详细进度：`);
        replyLines.push(...result.progressDetails);
    } else {
        replyLines.push(` 详细进度（${result.successTimes}次修炼，此处显示前5次）：`);
        replyLines.push(...result.progressDetails.slice(0, 5));
        replyLines.push(`... 以及${result.successTimes - 5}次修炼`);
    }

    // 检查圆满状态
    if (player.圣体秘境完成度[mijing] >= 100) {
        replyLines.push(``);
        replyLines.push(`✨ **${mijing}秘境已臻至大圆满！**`);
        
        const 所有完成度 = Object.values(player.圣体秘境完成度);
        if (所有完成度.every(完成度 => 完成度 >= 100)) {
            replyLines.push(`🎉 **恭喜！四大秘境全部圆满，圣体小成达到大圆满！**`);
            replyLines.push(`黄金血气贯霄汉，举手投足间已有大帝之姿！`);
        } else {
            replyLines.push(`可继续修炼其他未圆满秘境`);
        }
    }

    return e.reply(replyLines.join('\n'));
}
async shengtizhongjimishu(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        e.reply('玩家不存在，请先创建角色');
        return;
    }
    let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    let player = await Read_player(usr_qq);
    if (!isNotNull(player.Physique_id)) {
        e.reply("请先#刷新信息");
        return;
    }
    if (player.生命本源 !== 100 + player.灵根.生命本源) {
        e.reply("你的生命本源亏空无法修炼终极秘术");
        return;
    }

    // 解析修炼次数
    let times = 1; // 默认修炼1次
    const message = e.msg.trim();
    const match = message.match(/#修炼终极圣体秘术(?:\\s+(\\d+))?$/);
    if (match && match[1]) {
        times = parseInt(match[1]);
        if (times <= 0) {
            e.reply('修炼次数必须大于0');
            return;
        }
    }

    // 限制最大批量次数
    const maxBatchTimes = 5; // 仙台秘境消耗巨大，限制次数
    if (times > maxBatchTimes) {
        times = maxBatchTimes;
        e.reply(` 仙台秘境修炼消耗巨大，批量次数限制为${maxBatchTimes}次，已自动调整`);
    }

    // 检查功法
    if (!player.学习的功法.includes("终极圣体秘术")) {
        return e.reply([
            `圣体道痕未显，仙台秘境未开！`,
            `你神识内探，苦海寂静，未能寻到那源自火星大成圣体的无上道痕。`,
            `《终极圣体秘术》乃圣体一脉真正的无敌资本，非大机缘、大悟性不可得。`
        ].join('\n'));
    }

    // 核心条件1：必须为大成圣体
    if (player.灵根.type !== "大成圣体") {
        return e.reply([
            `血脉未达极致！`,
            `《终极圣体秘术》乃无上仙台法，需成就大成圣体方可参悟`,
            `当前血脉：${player.灵根.type}`
        ].join('\n'));
    }

    // 核心条件2：四大基础秘境必须全部圆满[7](@ref)
    if (typeof player.圣体秘境完成度 === 'undefined' ||
        player.圣体秘境完成度.轮海 < 100 ||
        player.圣体秘境完成度.道宫 < 100 ||
        player.圣体秘境完成度.四极 < 100 ||
        player.圣体秘境完成度.化龙 < 100) {
        
        const 未圆满秘境 = [];
        if (!player.圣体秘境完成度 || player.圣体秘境完成度.轮海 < 100) 未圆满秘境.push(`轮海(${player.圣体秘境完成度?.轮海 || 0}%)`);
        if (!player.圣体秘境完成度 || player.圣体秘境完成度.道宫 < 100) 未圆满秘境.push(`道宫(${player.圣体秘境完成度?.道宫 || 0}%)`);
        if (!player.圣体秘境完成度 || player.圣体秘境完成度.四极 < 100) 未圆满秘境.push(`四极(${player.圣体秘境完成度?.四极 || 0}%)`);
        if (!player.圣体秘境完成度 || player.圣体秘境完成度.化龙 < 100) 未圆满秘境.push(`化龙(${player.圣体秘境完成度?.化龙 || 0}%)`);
        
        return e.reply([
            `根基不足！欲修仙台，先固根基`,
            `《终极圣体秘术》需以四大秘境圆满为基`,
            `当前未圆满秘境：${未圆满秘境.join('、')}`,
            `请先使用 #修炼圣体秘术 将基础秘境打磨至圆满`
        ].join('\n'));
    }

    // 初始化仙台秘境系统
    if (typeof player.仙台秘境完成度 === 'undefined') {
        player.仙台秘境完成度 = {
            仙台一层天: 0,
            仙台二层天: 0,
            仙台三层天: 0,
            仙台四层天: 0,
            仙台五层天: 0,
            仙台六层天: 0
        };
        player.仙台秘境加成 = 0;
    }

    // 检查仙台秘境是否已全部圆满
    const 仙台完成度 = Object.values(player.仙台秘境完成度);
    if (仙台完成度.every(完成度 => 完成度 >= 100)) {
        return e.reply([
            `仙台极境，道果圆满！`,
            `你已将仙台六层天全部修炼至大圆满境界`,
            `神识覆盖诸天，一念可动星辰，已达此术极致`
        ].join('\n'));
    }

    // 批量修炼逻辑
    const batchCultivate = () => {
        let totalCostXiuwei = 0;
        let totalCostXueqi = 0;
        let totalAttributeGain = 0;
        let successTimes = 0;
        let progressDetails = [];
        let layerProgress = {};
        let nodeAchievements = [];

        // 预先估算总消耗（由于进度会变化，这里做保守估算）
        for (let i = 0; i < times; i++) {
            const 当前总完成度 = 仙台完成度.reduce((sum, curr) => sum + curr, 0) / 6 + (i * 4 / 6);
            const progressFactor = 1 + (当前总完成度 / 100);
            const costxiuwei = Math.round(50000000 * progressFactor);
            const costXueqi = Math.round(50000000 * progressFactor);
            
            totalCostXiuwei += costxiuwei;
            totalCostXueqi += costXueqi;
        }

        // 检查资源是否足够
        if (player.修为 < totalCostXiuwei) {
            return {
                success: false,
                message: `道源枯竭！批量修炼需${totalCostXiuwei}缕混沌炁，你仅存${player.修为}缕`
            };
        }
        if (player.血气 < totalCostXueqi) {
            return {
                success: false,
                message: `气血衰败！批量修炼需${totalCostXueqi}滴圣血，你仅余${player.血气}滴`
            };
        }

        // 执行批量修炼
        for (let i = 0; i < times; i++) {
            // 检查是否全部圆满
            const 所有仙台完成度 = Object.values(player.仙台秘境完成度);
            if (所有仙台完成度.every(完成度 => 完成度 >= 100)) {
                progressDetails.push(`所有仙台秘境已圆满，停止修炼`);
                break;
            }

            // 确定当前修炼层数
            let 当前修炼层数 = "";
            if (player.仙台秘境完成度.仙台一层天 < 100) {
                当前修炼层数 = "仙台一层天";
            } else if (player.仙台秘境完成度.仙台二层天 < 100) {
                当前修炼层数 = "仙台二层天";
            } else if (player.仙台秘境完成度.仙台三层天 < 100) {
                当前修炼层数 = "仙台三层天";
            } else if (player.仙台秘境完成度.仙台四层天 < 100) {
                当前修炼层数 = "仙台四层天";
            } else if (player.仙台秘境完成度.仙台五层天 < 100) {
                当前修炼层数 = "仙台五层天";
            } else {
                当前修炼层数 = "仙台六层天";
            }

            // 记录层数进度
            if (!layerProgress[当前修炼层数]) {
                layerProgress[当前修炼层数] = {
                    start: player.仙台秘境完成度[当前修炼层数],
                    count: 0
                };
            }
            layerProgress[当前修炼层数].count++;

            // 计算本次消耗和加成
            const 当前总完成度 = 所有仙台完成度.reduce((sum, curr) => sum + curr, 0) / 6;
            const progressFactor = 1 + (当前总完成度 / 100);
            const costxiuwei = Math.round(50000000 * progressFactor);
            const costXueqi = Math.round(50000000 * progressFactor);
            
            const 层数加成系数 = {
                "仙台一层天": 1.0,
                "仙台二层天": 1.2,
                "仙台三层天": 1.5,
                "仙台四层天": 2.0,
                "仙台五层天": 2.5,
                "仙台六层天": 3.0
            }[当前修炼层数];
            
            const 实际属性增加值 = Math.round(90000000 * 层数加成系数);

            // 扣除资源
            player.修为 -= costxiuwei;
            player.血气 -= costXueqi;
            
            // 更新完成度
            const 原完成度 = player.仙台秘境完成度[当前修炼层数];
            player.仙台秘境完成度[当前修炼层数] += 4;
            if (player.仙台秘境完成度[当前修炼层数] > 100) {
                player.仙台秘境完成度[当前修炼层数] = 100;
            }
            
            // 更新属性加成
            player.仙台秘境加成 += 实际属性增加值;
            player.攻击加成 += 实际属性增加值;
            player.攻击 += 实际属性增加值;
            player.生命加成 += 实际属性增加值;
            player.血量上限 += 实际属性增加值;
            player.当前血量 += 实际属性增加值;
            player.防御加成 += 实际属性增加值;
            player.防御 += 实际属性增加值;

            totalAttributeGain += 实际属性增加值;
            successTimes++;

            // 记录进度
            progressDetails.push(`第${i+1}次：${当前修炼层数} ${原完成度}% → ${player.仙台秘境完成度[当前修炼层数]}%`);

            // 检查层数圆满
            if (原完成度 < 100 && player.仙台秘境完成度[当前修炼层数] >= 100) {
                const 圆满奖励系数 = 层数加成系数 * 0.5;
                const 圆满奖励值 = Math.round(90000000 * 圆满奖励系数);
                
                player.攻击加成 += 圆满奖励值;
                player.攻击 += 圆满奖励值;
                player.生命加成 += 圆满奖励值;
                player.血量上限 += 圆满奖励值;
                player.当前血量 += 圆满奖励值;
                player.防御加成 += 圆满奖励值;
                player.防御 += 圆满奖励值;

                nodeAchievements.push(`✨ ${当前修炼层数}圆满！获得圆满奖励`);
            }
        }

        // 计算实际总消耗
        totalCostXiuwei = 0;
        totalCostXueqi = 0;
        for (let i = 0; i < successTimes; i++) {
            // 这里简化计算，实际应该按每次修炼的进度重新计算
            totalCostXiuwei += Math.round(50000000 * (1 + (i * 0.04)));
            totalCostXueqi += Math.round(50000000 * (1 + (i * 0.04)));
        }

        return {
            success: true,
            successTimes,
            totalCostXiuwei,
            totalCostXueqi,
            totalAttributeGain,
            progressDetails,
            nodeAchievements,
            layerProgress,
            finalProgress: player.仙台秘境完成度
        };
    };

    // 执行批量修炼
    const result = batchCultivate();
    if (!result.success) {
        return e.reply(result.message);
    }

    // 保存数据
    await Write_player(usr_qq, player);

    // 构建回复
    const 回复文案 = [
        `【终极圣体秘术·批量修炼】×${result.successTimes}`,
        `仙台秘境绽放无量光，神识跨越诸天万界！`,
        ``,
        ` 修炼统计：`,
        ` 成功修炼：${result.successTimes}次`,
        ` 属性增益：+${result.totalAttributeGain}`,
        ` 资源消耗：${result.totalCostXiuwei}修为 | ${result.totalCostXueqi}血气`,
        ` 仙台总加成：${player.仙台秘境加成}`,
        ``
    ];

    // 添加层数进度概要
    回复文案.push(` 层数进度：`);
    for (let layer in result.layerProgress) {
        const progress = result.layerProgress[layer];
        const finalProgress = player.仙台秘境完成度[layer];
        回复文案.push(` ${layer}: ${progress.start}% → ${finalProgress}% (修炼${progress.count}次)`);
    }
    回复文案.push(``);

    // 添加节点成就
    if (result.nodeAchievements.length > 0) {
        回复文案.push(` 秘境突破：`);
        回复文案.push(...result.nodeAchievements);
        回复文案.push(``);
    }

    // 添加详细进度（限制显示条数）
    if (result.successTimes <= 3) {
        回复文案.push(` 详细进度：`);
        回复文案.push(...result.progressDetails);
    } else {
        回复文案.push(` 详细进度（前3次）：`);
        回复文案.push(...result.progressDetails.slice(0, 3));
        回复文案.push(`... 以及${result.successTimes - 3}次修炼`);
    }

    // 检查是否全部圆满
    const 所有仙台完成度 = Object.values(player.仙台秘境完成度);
    if (所有仙台完成度.every(完成度 => 完成度 >= 100)) {
        回复文案.push(``);
        回复文案.push(` **恭喜！仙台六层天全部圆满，圣体终极蜕变！**`);
        回复文案.push(`黄金血气映照诸天，五大秘境圆满合一，已具天帝之资！`);
    }

    return e.reply(回复文案.join('\n'));
}  
async createEverything(e) {
    // 群聊限定
    if (!e.isGroup) {
        e.reply('此无上神通需在诸天群聊中方显神威！');
        return true;
    }

    const usr_qq = e.user_id.toString().replace('qg_','');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);
    const actionKey = `xiuxian:player:${player_qq}:action`;
    const actionRaw = await redis.get(actionKey);
    let action = null;
    try {
        action = actionRaw ? JSON.parse(actionRaw) : null;
    } catch {
        return e.reply('当前修仙状态数据异常，请联系管理员处理。');
    }

    let pendingCreation = null;
    if (action?.action === '造化万物') {
        pendingCreation = action.creation;
        if (!pendingCreation?.itemName || !pendingCreation?.itemClass) {
            return e.reply('造化万物行动数据异常，请联系管理员处理。');
        }
        const remainingMs = Math.max(0, Number(action.end_time) - Date.now());
        if (remainingMs > 0) {
            return e.reply([
                `【造化万物·演化中】`,
                `正在造化：【${pendingCreation.itemName}】x${pendingCreation.amount}`,
                `稀有度：${pendingCreation.rarity}｜数量倍率：x${pendingCreation.quantityMultiplier}`,
                `剩余时间：${formatCreationDuration(Math.ceil(remainingMs / 60_000))}`,
                `造化完成后发送 #造化万物 领取。`,
            ].join('\n'));
        }
    } else if (actionRaw) {
        return e.reply(`你当前正在进行【${action?.action || '其他修仙行动'}】，结束并结算后才能造化万物。`);
    }

    let authorityLevel = pendingCreation?.authorityLevel ?? getRealmAuthorityLevel(player);

    // 检查境界 - 仙帝及以上（境界ID >= 21）
    if (!pendingCreation && authorityLevel < 21) {
        e.reply([
            `【境界不足】`,
            `造化万物乃仙帝伟力！`,
            `道友当前境界不足，无法施展此无上神通！`,
        ].join('\n'));
        return true;
    }

    let itemName;
    let amount;
    let itemExist;
    let creationProfile;
    if (pendingCreation) {
        itemName = pendingCreation.itemName;
        amount = pendingCreation.amount;
        itemExist = {
            class: pendingCreation.itemClass,
            出售价: pendingCreation.salePrice,
            稀有度: pendingCreation.rarity,
        };
        creationProfile = pendingCreation;
    } else {
        const msg = e.msg.replace('#造化万物', '').trim();
        const [parsedItemName, amountStr] = msg.split(/\s+/);
        itemName = parsedItemName;
        amount = amountStr === undefined ? 1 : Number(amountStr);
        if (!itemName) return e.reply('指令格式：#造化万物 物品名 [数量]');
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return e.reply('造化万物需心诚，数量必须为正整数！');
        }

        itemExist = await foundthing(itemName);
        if (itemExist?.不可创造) {
            return e.reply(`此等物品涉及的力量哪怕是仙帝也无法造化！`);
        }
        if (!itemExist) {
            return e.reply(`诸天万界中并无【${itemName}】此物，仙帝亦不可无中生有！`);
        }
        creationProfile = calculateCreationEverything(authorityLevel, itemExist.稀有度, amount);
    }

    // 读取位面数据
    let weimianData = {};
    try {
        const weimianPath = data.filePathMap.weimianList;
        if (fs.existsSync(weimianPath)) {
            const rawData = fs.readFileSync(weimianPath, 'utf8');
            weimianData = JSON.parse(rawData);
        } else {
            e.reply('位面数据文件不存在，无法进行造化万物');
            return true;
        }
    } catch (err) {
        console.error('读取位面数据失败:', err);
        e.reply('读取位面数据失败，无法进行造化万物');
        return true;
    }

    // === 根据境界计算消耗 ===
    let costPerItem = 0;
    let costDescription = "";
    const itemSalePrice = Math.max(0, Number(itemExist.出售价) || 0);
    
    if (authorityLevel === 22) {
        // 祭道境界：每10000出售价消耗1点承受力
        costPerItem = Math.ceil(itemSalePrice / 10000);
        costDescription = `每10000出售价消耗1点承受力`;
    } else if (authorityLevel >= 23) {
        // 祭道之上境界：不消耗任何承受力
        costPerItem = 0;
        costDescription = `祭道之上，言出法随，不染因果`;
    } else {
        // 仙帝境界：每100出售价消耗1点承受力
        costPerItem = Math.ceil(itemSalePrice / 100);
        costDescription = `每100出售价消耗1点承受力`;
    }

    const totalCost = pendingCreation?.totalCost ?? costPerItem * amount;
    if (!Number.isSafeInteger(totalCost) || totalCost < 0) {
        return e.reply('本次造化规模过大，现世承受力无法稳定计量。');
    }

    // 检查承受力是否足够（祭道之上除外）
    if (!pendingCreation && authorityLevel < 23 && weimianData.现世承受力 < totalCost) {
        const realmNames = [
            "上苍之上",
            "魂河尽头",
            "天帝葬坑",
            "古地府",
            "祭海"
        ];
        const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];
        
        e.reply([
            `【诸天震荡·法则反噬】`,
            `${player.名号}立于${randomRealm}之巅，眸中仙光暴涨！`,
            `欲创【${itemName}】x${amount}，撼动诸天根基！`,
            ,
            `轰！！！`,
            `万道法则哀鸣，时间长河掀起滔天巨浪！`,
            `诸天万界剧烈震荡，星辰如雨坠落！`,
            ,
            `「现世承受力不足！」`,
            `此方天地已无法承受更多造化伟力！`,
            `需消耗：${totalCost}点现世承受力（${costDescription}）`,
            `当前剩余：${weimianData.现世承受力}点`,
        ].join('\n'));
        return true;
    }

    if (!pendingCreation) {
        if (authorityLevel < 23) {
            weimianData.现世承受力 -= totalCost;
            try {
                fs.writeFileSync(data.filePathMap.weimianList, JSON.stringify(weimianData, null, 4), 'utf8');
            } catch (error) {
                console.error('保存位面数据失败:', error);
                return e.reply('保存现世承受力失败，本次造化未开始。');
            }
        }

        const now = Date.now();
        const creation = {
            ...creationProfile,
            itemName,
            itemClass: itemExist.class,
            salePrice: itemSalePrice,
            authorityLevel,
            totalCost,
            costDescription,
        };
        const actionData = {
            action: '造化万物',
            start_time: now,
            end_time: now + creation.durationMs,
            time: creation.durationMs,
            creation,
            shutup: '0',
            working: '1',
            Place_action: '1',
            Place_actionplus: '1',
            power_up: '1',
            mojie: '1',
            xijie: '1',
            plant: '1',
            mine: '1',
        };
        try {
            await redis.set(actionKey, JSON.stringify(actionData));
        } catch (error) {
            if (authorityLevel < 23) {
                weimianData.现世承受力 += totalCost;
                fs.writeFileSync(data.filePathMap.weimianList, JSON.stringify(weimianData, null, 4), 'utf8');
            }
            console.error('保存造化万物行动失败:', error);
            return e.reply('造化行动开启失败，预扣的现世承受力已返还。');
        }

        return e.reply([
            `【造化万物·万道演化】`,
            `${player.名号}开始造化【${itemName}】x${amount}。`,
            `稀有度：${creation.rarity}｜数量倍率：x${creation.quantityMultiplier}`,
            `境界耗时比例：1:${creation.minutesPerRarity}`,
            `所需时间：${formatCreationDuration(creation.minutes)}`,
            creation.causalDebt > 0 ? `预计基础因果债：${creation.causalDebt}点` : `祭道之上不染因果。`,
            authorityLevel < 23 ? `已预扣现世承受力：${totalCost}点` : `无需消耗现世承受力。`,
            `预计完成：${new Date(actionData.end_time).toLocaleString()}`,
            `完成后发送 #造化万物 领取。`,
        ].join('\n'));
    }

    // 行动到时后结算物品与因果债。
    await Add_najie_thing(player_qq, itemName, itemExist.class, amount);
    const causalDebtAmount = Number(creationProfile.causalDebt) || 0;
    const causalDebtResult = addCausalDebt(player, causalDebtAmount, `造化万物：${itemName}`);
    await Write_player(player_qq, player);
    await redis.del(actionKey);
 if (authorityLevel < 22 && weimianData.现世承受力 < 1000000) {
        // 40%概率触发始祖扼杀
        if (Math.random() < 0.4) {
            // 境界跌落
            lowerRealmAuthority(player);
            await Write_player(player_qq, player);
            
            // 构建始祖扼杀文案
            const killTexts = [
                ,
                `【厄土震怒·始祖扼杀】`,
                `诸天根基剧烈震荡，万界濒临崩坏！`,
                ,
                `厄土高原深处，十具古老棺椁同时开启！`,
                `诸天竟有如此变数，当扼杀之！"`,
                 `十大始祖齐声喝令，十股祭道级力量融合归一！`,
                ,
                `厄土高原显化本体，化作一柄斩断万古的黑暗天刀！`,
                `刀锋所指，时空长河断流，古今未来隔绝！`,
                `整个诸天都在这一刀下颤栗哀鸣！`,
                ,
                `"噗——"`,
                `${player.名号}的仙帝之躯在黑暗天刀下寸寸瓦解！`,
                `大道根基被十股始祖之力联手斩断！`,
                `境界永恒跌落至${getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)}！`,
                ,
                `十大始祖的冰冷道音回荡诸天：`,
                `"自此之后，万古再无此变数！"`,
                `十道身影缓缓退回棺椁，厄土高原隐入虚空...`
            ];
            
            // 发送扼杀文案
            e.reply(createTexts.join('\n') + '\n' + killTexts.join('\n'));
            return true;
        }
    }
    // 构建辰东风格文案
    const realmNames = [
        "上苍之上",
        "魂河尽头",
        "天帝葬坑",
        "古地府",
        "祭海"
    ];
    const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];

    // 基础文案
    const createTexts = [
        `【诸天造化·创世】`,
        `${player.名号}立于${randomRealm}之巅，眸光开阖间，`,
        `整部古史都在颤栗！`,
        ,
        `"诸天为炉，万道为火！"`,
        `一声道喝震碎时间长河！`,
        `无穷诸天仿佛都要炸开了！`,
        ,
        `只见${player.名号}抬手间：`,
        `- 仙域边荒的星辰簌簌坠落`,
        `- 界海深处的浪涛席卷诸天`,
        `- 万道符文如天河倒灌，汇聚于掌心`,
        ,
        `轰！！！`,
        `一道贯穿古今未来的神光中，`,
        `【${itemName}】x${amount}自虚无中诞生！`,
    ];

    // 祭道境界文案（境界22）
    if (authorityLevel === 22) {
        createTexts.splice(4, 0, 
            `祭道符文照亮了永恒未知之地！`
        );
        createTexts.splice(11, 0,
            `"他化自在，他化万古！"`,
            `三道帝影自岁月长河中走出，结印共演创世法！`
        );
        
        // 添加消耗说明
        createTexts.push(
            
            `此造化撼动诸天根基，消耗${totalCost}点现世承受力（每10000出售价消耗1点）！`,
            `当前现世承受力：${weimianData.现世承受力}点`
        );
    }
    // 祭道之上境界文案（境界23）
    else if (authorityLevel >= 23) {
        createTexts.splice(4, 0,
            `「眸光所至，枯竭所有，重现所有！」`,
            `诸天万界，无量宇宙，所有生灵心头莫名悸动，`,
            `仿佛某种至高无上的存在睁开了双眼！`
        );
        
        createTexts.splice(11, 0,
            `"言出法随，万道共尊！"`,
            `诸天法则自动演化，无需消耗任何承受力！`
        );
        
        // 添加不消耗说明
        createTexts.push(
            
            `祭道之上，言出法随，不染因果！`,
            `造化万物无需消耗现世承受力！`
        );
    }
    // 仙帝境界文案（境界21）
    else {
        createTexts.push(
            
            `此造化撼动诸天根基，消耗${totalCost}点现世承受力（每100出售价消耗1点）！`,
            `当前现世承受力：${weimianData.现世承受力}点`
        );
    }

    // 特殊物品文案增强
    switch(itemName) {
        case "混沌青莲":
            createTexts.splice(createTexts.length - 1, 0, 
                `一株青莲摇曳生姿，混沌气弥漫，仿佛开天辟地前的第一缕生机！`
            );
            break;
        case "世界石":
            createTexts.splice(createTexts.length - 1, 0, 
                `石体表面浮现诸天万界虚影，大道符文流转不息！`
            );
            break;
        case "仙泉之眼":
            createTexts.splice(createTexts.length - 1, 0, 
                `仙泉喷涌，生命精气如龙腾空，滋养万古！`
            );
            break;
        case "不死神药":
            createTexts.splice(createTexts.length - 1, 0, 
                `神药通灵，散发不朽气息，仿佛能让人活出第二世！`
            );
            break;
    }

    // 承受力接近枯竭时的警告（祭道之上除外）
    if (authorityLevel < 23 && weimianData.现世承受力 < 1000000) {
        createTexts.splice(createTexts.length, 0,
            
            `「警告！」`,
            `诸天根基动摇，万界濒临崩坏！`,
            `现世承受力仅余：${weimianData.现世承受力}点！`
        );
    }

    createTexts.push(`本次造化历时${formatCreationDuration(creationProfile.minutes)}。`);
    createTexts.push(causalDebtResult.costFree
        ? `祭道之上不染因果，本次因果债为0。`
        : `本次造化新增因果债${causalDebtResult.delta}点，当前共${causalDebtResult.debt}点。`);
    if (causalDebtResult.backlash?.triggered) {
        createTexts.push(`因果债超过200点，时间长河降下二十道反噬雷劫。`);
    }

    e.reply(createTexts.join('\n'));
    return true;
}
  async exchangeSourceStone(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);
    // ==== 初始化源石属性 ====
    if (player.源石 === undefined) {
        player.源石 = 0;
        await Write_player(player_qq, player);
           // 发送初始化提示
        e.reply([
            `【源石系统激活】`,
            `首次兑换源石，系统已激活源石属性！`,
            `当前源石：0斤`,
        ].join("\n"));
    
    }
    // 解析命令
    const match = e.msg.match(/^#神城兑换源石 (.*?)(?: (\d+))?$/);
    if (!match) return false;
    
    const stoneName = match[1].trim();
    let amount = match[2] ? parseInt(match[2]) : 1;
    // 检查源石类型是否有效
    if (!SOURCE_STONE_EXCHANGE_RATES[stoneName]) {
        const validStones = Object.keys(SOURCE_STONE_EXCHANGE_RATES).join('、');
        return e.reply([
            `【神城兑换·源石】`,
            `未知的源石类型：${stoneName}`,            
            `可兑换源石类型：${validStones}`,
        ].join("\n"));
    }
    
    // 获取玩家拥有的该源石数量
    const stoneCount = await exist_najie_thing(player_qq, stoneName, "道具");
    
    // 检查数量是否足够
    if (stoneCount < amount) {
        return e.reply([
            `【神城兑换·源石】`,
            `源石不足！`,            
            `你拥有【${stoneName}】x${stoneCount}`,
            `试图兑换数量：${amount}`,
        ].join("\n"));
    }
    
    // 计算兑换值
    const exchangeRate = SOURCE_STONE_EXCHANGE_RATES[stoneName];
    const totalValue = exchangeRate * amount;
    
    // 扣除源石道具
    await Add_najie_thing(player_qq, stoneName, "道具", -amount);
    
      // 增加源石数值（确保属性已存在）
    player.源石 = (player.源石 || 0) + totalValue;
    await Write_player(player_qq, player);
    
    // 构建兑换文案
    const exchangeTexts = [
        `【神城兑换·源石】`,
        `你在神城找到源天师后人开设的兑换铺`,
        `交出${amount}块【${stoneName}】`,
        `获得${bigNumberTransform(totalValue)}斤源石`,
        `源天师后人轻抚源石，眼中闪过异彩：`,
    ];
    
    // 根据源石类型添加不同文案
    if (stoneName.includes("神源")) {
        exchangeTexts.push(
            `"神源难寻，道友福缘深厚！"`,
            `一缕神光从源石中透出，映照半边天宇`
        );
    } else if (stoneName === "超品源石") {
        exchangeTexts.push(
            `"源中蕴道，此石不凡！"`,
            `源石表面浮现道道先天纹路`
        );
    } else {
        exchangeTexts.push(
            `"源气充沛，可助修行！"`,
            `源石在阳光下闪烁晶莹光泽`
        );
    }
    
    
    e.reply(exchangeTexts.join("\n"));
    return true;
}

  // 神城一键兑换源石：把纳戒中所有可兑换源石道具一次性全部兑换为源石数值
  async oneClickExchangeSourceStone(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    // ==== 初始化源石属性 ====
    if (player.源石 === undefined) {
        player.源石 = 0;
        await Write_player(player_qq, player);
        e.reply([
            `【源石系统激活】`,
            `首次兑换源石，系统已激活源石属性！`,
            `当前源石：0斤`,
        ].join("\n"));
    }

    // 遍历兑换表，把背包里每种源石道具有多少换多少
    let totalValue = 0;          // 本次兑换获得的总源石数值
    let exchangedTypes = 0;      // 实际兑换了几类源石
    const detailLines = [];      // 兑换明细

    for (const [stoneName, exchangeRate] of Object.entries(SOURCE_STONE_EXCHANGE_RATES)) {
        const stoneCount = await exist_najie_thing(player_qq, stoneName, "道具");
        if (!stoneCount || stoneCount <= 0) continue; // 背包里没有这种源石，跳过

        const value = exchangeRate * stoneCount;
        // 扣除背包中全部该源石道具
        await Add_najie_thing(player_qq, stoneName, "道具", -stoneCount);
        totalValue += value;
        exchangedTypes++;
        detailLines.push(`· 交出【${stoneName}】x${stoneCount}，得 ${bigNumberTransform(value)} 斤源石`);
    }

    // 没有任何可兑换的源石
    if (exchangedTypes === 0) {
        return e.reply([
            `【神城·一键兑换源石】`,
            `你将纳戒翻了个底朝天，却寻不到半块源石。`,
            `可兑换源石类型：${Object.keys(SOURCE_STONE_EXCHANGE_RATES).join('、')}`,
        ].join("\n"));
    }

    // 汇总累加源石数值
    player.源石 = (player.源石 || 0) + totalValue;
    await Write_player(player_qq, player);

    const lines = [
        `【神城·一键兑换源石】`,
        `你迈步踏入神城源天师后人开设的兑换铺，将纳戒中诸般源石尽数倾出——`,
        ...detailLines,
        `──────────────`,
        `本次共得源石：${bigNumberTransform(totalValue)} 斤`,
        `当前源石总计：${bigNumberTransform(player.源石)} 斤`,
        `源天师后人抚石而笑："道友豪阔，一笔结清，源气沛然！"`,
    ];
    e.reply(lines.join("\n"));
    return true;
}

// 传授指定功法
async teachGongfa(e) {
    return this.handleTeach(e, false);
}

// 传授全部功法
async teachAllGongfa(e) {
    return this.handleTeach(e, true);
}

// 处理功法传授的核心逻辑
async handleTeach(e, isAll = false) {
    if (!e.isGroup) {
        e.reply('请在群聊中传授功法');
        return true;
    }

    const casterQQ = e.user_id.toString().replace('qg_', '');
    const caster = await Read_player(casterQQ);
    
    // === 检查施法者 ===
    if (!caster.学习的功法 || caster.学习的功法.length === 0) {
        e.reply('你尚未习得任何功法，无法传授');
        return true;
    }
    
    if (!canTeachGongfa(caster)) {
        e.reply('你的道行不够，还没有传道授业为别人指点修行的能力');
        return true;
    }

    // === 传授冷却检查（累计10门功法后进入24小时冷却） ===
    const TEACH_COOLDOWN_HOURS = 24;
    const TEACH_COUNT_THRESHOLD = 10;
    const teachCDKey = `xiuxian:player:${casterQQ}:teach_cooldown_until`;
    const teachCountKey = `xiuxian:player:${casterQQ}:teach_count`;
    const teachCDUntil = await redis.get(teachCDKey);
    if (teachCDUntil) {
        const remainingMs = parseInt(teachCDUntil) - Date.now();
        if (remainingMs > 0) {
            const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
            e.reply([
                `〖传道冷却·元神未复〗`,
                `你已累计传授${TEACH_COUNT_THRESHOLD}门功法，元神大损！`,
                `需等待 ${remainingHours} 小时后元神恢复方可再次传道。`,
                `「传道授业虽积功德，亦不可竭泽而渔」`
            ].join('\n'));
            return true;
        }
        // 冷却已过期，清除
        await redis.del(teachCDKey);
        await redis.del(teachCountKey);
    }

    // === 获取目标玩家 ===
    const atItems = e.message.filter(item => item.type === "at");
    if (atItems.length === 0) {
        e.reply('请指定传授目标（@某人）');
        return true;
    }

    const targetQQ = atItems[0].qq.toString().replace('qg_', '');
    
    // 不能传授给自己
    if (targetQQ === casterQQ) {
        e.reply('无法向自己传授功法');
        return true;
    }

    // 检查目标玩家是否存在
    if (!await existplayer(targetQQ)) {
        e.reply('目标玩家不存在');
        return true;
    }

    const target = await Read_player(targetQQ);
    // 内联天资数据（grade=天资等级字段，description=描述）
    const aptitudeDescMap = {
        '无化如是': '天道封禁，一无所能',
        '生而愚痴': '愚钝之资，仅通武学',
        '天弃之人': '被天道遗弃，基础尚可',
        '先天不足': '根骨稍差，可学常法',
        '平庸之资': '中规中矩，天魔命运可学',
        '超凡资质': '资质不俗，道与法可入',
        '天纵之资': '天纵奇才，九秘杀术可习',
        '旷世奇才': '旷世之姿，帝经可悟',
        '绝世天骄': '绝世天骄，仙王法可领',
        '万古无双': '万古罕见，仙帝法可承',
        '无演无尽': '超脱造化，神慧者可学'
    };
    const targetAptitude = {
        grade: target.天资等级 || '平庸之资',
        description: aptitudeDescMap[target.天资等级] || '天资难辨'
    };
    
    // === 特殊天资：无化如是 ===
    if (targetAptitude.grade === '无化如是') {
        e.reply([
            `〖天道封禁·传授失败〗`,
            `你试图向${target.名号}传授功法，`,
            `然功法在接触其识海的瞬间崩碎！`,
            ``,
            `〖天道之音〗`,
            `"无化如是，天道弃子，不配承载任何道法！"`,
            `"纵是仙帝亲传，亦无法烙印进其识海！"`,
            ``,
            `目标天资【无化如是】已被天道永久封印，`,
            `任何功法都无法被其学习。`
        ].join('\n'));
        return true;
    }
    
    // === 特殊天资：生而愚痴 ===
    if (targetAptitude.grade === '生而愚痴') {
        e.reply([
            `〖愚痴之脑·传授困难〗`,
            `你试图向${target.名号}传授功法，`,
            `然其识海混沌，灵智蒙尘，`,
            `功法真谛在其脑中如雾里看花。`,
            ``,
            `〖愚痴限制〗`,
            `生而愚痴者灵智未开，`,
            `学习功法成功率极低。`,
            `建议先为其寻找开智之法。`
        ].join('\n'));
        
        e.reply(`传授仍将继续，但每门功法只有30%的领悟机会。`);
    }
    
    // 天资等级对应的最高可学习难度（值=能学的最高gongfaHierarchy，与UserHome.js保持一致）
    const aptitudeLevels = {
        "生而愚痴": 0,   // 只能学武学(0)
        "天弃之人": 1,   // 可学修炼功法/炼器/炼丹(1)
        "先天不足": 2,   // 可学天魔法/命运法/限定功法(2)
        "平庸之资": 2,   // 可学天魔法/命运法(2)，学不了道与法(3)
        "超凡资质": 3,   // 可学道与法/宝术(3)
        "天纵之资": 4,   // 可学九秘/盖世杀术(4)
        "旷世奇才": 5,   // 可学帝经(5)
        "绝世天骄": 7,   // 可学十凶宝术(6)/仙王法(7)
        "万古无双": 8,   // 可学仙帝法(8)
        "无演无尽": 9,   // 可学神慧者(9)
        "无化如是": -1   // 什么都学不了
    };
    
    // 获取目标玩家最高可学层级（默认平庸之资=2）
    const targetMaxLevel = aptitudeLevels[targetAptitude.grade] ?? 2;
    
    // === 传授指定功法 ===
    if (!isAll) {
        const gongfaName = e.msg.replace(/^#传授功法/, '').replace(/@\d+/g, '').trim();
        
        if (!gongfaName) {
            e.reply('请指定要传授的功法名称');
            return true;
        }

        // 检查施法者是否拥有该功法
        if (!caster.学习的功法.includes(gongfaName)) {
            e.reply(`你尚未习得【${gongfaName}】，无法传授`);
            return true;
        }

        // 检查目标是否已学习该功法
        if (target.学习的功法 && target.学习的功法.includes(gongfaName)) {
            e.reply(`目标已掌握【${gongfaName}】，无需传授`);
            return true;
        }
        
        // 获取功法类型与不可外传属性
        let gongfaType = "修炼功法";
        let gongfaData = null;
        for (const category in data) {
            if (Array.isArray(data[category])) {
                const found = data[category].find(item => item.name === gongfaName);
                if (found) {
                    gongfaType = found.type || "修炼功法";
                    gongfaData = found;
                    break;
                }
            }
        }
        
        // 获取功法层级
        const gongfaLevel = getGongfaLevel(gongfaType);
        
        // === 不可外传拦截 ===
        if (gongfaData && gongfaData.不可外传) {
            e.reply([
                `〖不传之秘·传授受阻〗`,
                `你欲向${target.名号}传授【${gongfaName}】，`,
                `却在功法触及识海的刹那被一道禁制震退！`,
                ``,
                `〖禁传之令〗`,
                gongfaData.不可外传说明 || '此功法乃不传之秘，非经同意不得外传。',
                ``,
                `「纵你道行通天，亦无权将门派至宝私相授受！」`
            ].join('\n'));
            return true;
        }
        
        // === 检查天资条件 ===
        if (targetMaxLevel < gongfaLevel) {
            e.reply([
                `〖天资不足〗`,
                `${target.名号}的天资【${targetAptitude.grade}】过低，`,
                `无法领悟【${gongfaName}】！`,
                ``,
                `〖学习要求〗`,
                `所需天资：至少${getAptitudeNameByLevel(gongfaLevel)}`,
                `当前天资：${targetAptitude.grade}`,
                `评价：${targetAptitude.description}`,
                ``,
                `建议：先提升目标的天资等级`
            ].join('\n'));
            return true;
        }
        
        // === 特殊功法检查 ===
        if (gongfaName === '自然大道') {
            const allowedAptitudes = ["平庸之资", "先天不足", "天弃之人", "生而愚痴"];
            
            if (!allowedAptitudes.includes(targetAptitude.grade)) {
                e.reply([
                    `〖大道拒斥〗`,
                    `${target.名号}的天资【${targetAptitude.grade}】过于聪慧，`,
                    `无法领悟【自然大道】的真谛！`,
                    ``,
                    `〖自然大道真意〗`,
                    `"道法自然，无为而化，唯愚者可悟！"`,
                    `当前天资：${targetAptitude.grade}`,
                    `适合天资：平庸之资、先天不足、天弃之人、生而愚痴`
                ].join('\n'));
                return true;
            }
        }
        
        
        if (gongfaName === '无始经') {
            const allowedRoots = ["先天圣体道胎", "混沌圣体道胎"];
            if (!allowedRoots.includes(target.灵根.name) && 
                !allowedRoots.includes(target.灵根.type)) {
                e.reply([
                    `〖帝经拒斥〗`,
                    `你欲传授《无始经》，却遭无始钟虚影镇压！`,
                    ``,
                    `〖无始要求〗`,
                    `"非先天圣体道胎，不配执掌无始法！"`,
                    `目标灵根：${target.灵根.name}（${target.灵根.type}）`,
                    `要求灵根：先天圣体道胎或混沌圣体道胎`
                ].join('\n'));
                return true;
            }
        }
        
        if (gongfaName === '西皇经') {
            const allowedRoots = ["道胎", "圣体道胎", "混沌圣体道胎"];
            if (!allowedRoots.includes(target.灵根.type)) {
                e.reply([
                    `〖道胎本源〗`,
                    `你欲传授《西皇经》，却引动道则反噬！`,
                    ``,
                    `〖西皇要求〗`,
                    `"非先天道胎血脉，不可承西皇道统！"`,
                    `目标灵根类型：${target.灵根.type}`,
                    `要求灵根：道胎、圣体道胎、混沌圣体道胎`
                ].join('\n'));
                return true;
            }
        }
        
        if (["妖帝古经", "万龙古经"].includes(gongfaName)) {
            const allowedRoots = ["妖体", "小成妖体", "大成妖体"];
            if (!allowedRoots.includes(target.灵根.type)) {
                e.reply([
                    `〖妖血沸腾〗`,
                    `你欲传授《${gongfaName}》，却引万妖虚影暴动！`,
                    ``,
                    `〖妖经要求〗`,
                    `"非纯正妖体血脉，岂敢觊觎妖族帝经！"`,
                    `目标灵根类型：${target.灵根.type}`,
                    `要求灵根：妖体、小成妖体、大成妖体`
                ].join('\n'));
                return true;
            }
        }
        
        // === 学习失败概率 ===
        const successRate = Math.min(1, getTeachingSuccessRate(gongfaLevel, targetAptitude.grade) * getDaoHeartLearningChanceMultiplier(target));
        let failureReason = "";
        
        if (targetAptitude.grade === '生而愚痴') {
            failureReason = "生而愚痴，灵智未开";
        } else if (gongfaLevel >= 6) {
            failureReason = "功法太过玄奥";
        } else if (gongfaLevel >= 4) {
            failureReason = "境界不足，领悟困难";
        }
        
        if (Math.random() > successRate) {
            e.reply([
                `〖传授失败〗`,
                `你向${target.名号}传授【${gongfaName}】，`,
                `然其苦思冥想，始终无法领悟其中真谛！`,
                ``,
                `〖失败原因〗`,
                `${failureReason}`,
                `成功率：${(successRate * 100).toFixed(0)}%`,
                ``,
                `提示：可稍后再次尝试传授`
            ].join('\n'));
            return true;
        }
        
        // === 施法者元神消耗（按功法难度递增） ===
        const { potential: potentialCost, spirit: casterSpiritCost } = getTeachingCosts(gongfaLevel);
        const casterYuanShen = caster.元神 || 0;
        if (casterYuanShen < casterSpiritCost) {
            e.reply([
                `〖元神不足·传道受阻〗`,
                `传授【${gongfaName}】需消耗元神 ${casterSpiritCost.toLocaleString()}，`,
                `你当前元神仅 ${casterYuanShen.toLocaleString()}，无法支撑此次传道！`,
                ``,
                `「元神乃修士根本，传道耗损甚巨」`
            ].join('\n'));
            return true;
        }

        const currentPotential = target.仙道潜力 || 0;
        if (currentPotential < potentialCost) {
            e.reply([
                `〖仙道潜力不足·传授受阻〗`,
                `你向${target.名号}传授【${gongfaName}】，`,
                `然其识海中的仙道潜力已几近枯竭，无法承载这份传承！`,
                ``,
                `目标当前仙道潜力：${currentPotential} 点`,
                `学习所需潜力：${potentialCost} 点（${gongfaType}）`,
                `「请先为目标补足仙道潜力方可传授！」`
            ].join('\n'));
            return true;
        }

        // === 传授成功 ===
        applyTeachingResult(target, [gongfaName], currentPotential - potentialCost);
        await Write_player(targetQQ, target);
        await player_efficiency(targetQQ);

        // 扣除施法者元神
        caster.元神 = casterYuanShen - casterSpiritCost;

        // 添加传授记录
        caster.传授记录 = caster.传授记录 || [];
        caster.传授记录.push({
            时间: new Date().toLocaleString(),
            目标: target.名号,
            功法: gongfaName,
            成功率: `${(successRate * 100).toFixed(0)}%`,
            结果: "成功",
            元神消耗: casterSpiritCost
        });
        await Write_player(casterQQ, caster);

        // === 累计传授计数与冷却触发 ===
        let teachCount = parseInt(await redis.get(teachCountKey) || '0') + 1;
        await redis.set(teachCountKey, teachCount.toString());
        let cooldownTriggered = false;
        if (teachCount >= TEACH_COUNT_THRESHOLD) {
            const cooldownUntil = Date.now() + TEACH_COOLDOWN_HOURS * 60 * 60 * 1000;
            await redis.set(teachCDKey, cooldownUntil.toString());
            await redis.del(teachCountKey);
            cooldownTriggered = true;
        }
        
        // 构建成功消息
        let successMsg = [
            `〖功法传授〗`,
            `${caster.名号}将毕生所学【${gongfaName}】倾囊相授`,
            `${target.名号}灵台清明，如获新生！`,
            ``,
            `〖传道代价〗`,
            `元神消耗：${casterSpiritCost.toLocaleString()}（剩余 ${caster.元神.toLocaleString()}）`,
            `累计传授：${teachCount}/${TEACH_COUNT_THRESHOLD} 门`
        ];

        if (cooldownTriggered) {
            successMsg.push(`〖元神大损·传道冷却〗`);
            successMsg.push(`累计传授已达${TEACH_COUNT_THRESHOLD}门，元神透支！`);
            successMsg.push(`进入${TEACH_COOLDOWN_HOURS}小时冷却，期间无法再传授功法。`);
        }
        
        if (targetAptitude.grade === '生而愚痴') {
            successMsg.push(`〖奇迹发生〗生而愚痴者竟能领悟此功法，实乃天意！`);
        } else if (gongfaLevel >= 6) {
            successMsg.push(`〖天地共鸣〗${gongfaName}引发天地异象，道音轰鸣！`);
        } else if (gongfaLevel >= 4) {
            successMsg.push(`〖道法天成〗功法真谛如醍醐灌顶，尽数领悟！`);
        } else {
            successMsg.push(`功法真谛融入心田，修为大进！`);
        }
        
        e.reply(successMsg.join('\n'));
        return true;
    }
    
    // === 传授全部功法 ===
    const teachableGongfa = [];
    const alreadyKnown = [];
    const failedByAptitude = [];
    const failedBySpecial = [];
    const failedByLuck = [];
    const failedByPotential = []; // 新增：仙道潜力不足
    const failedBySpirit = []; // 元神不足跳过
    const specialSuccess = [];
    let remainingPotential = target.仙道潜力 || 0; // 实时追踪目标剩余潜力
    let remainingSpirit = caster.元神 || 0;
    let totalSpiritCost = 0;
    
    for (const gongfaName of new Set(caster.学习的功法)) {
        // 检查目标是否已学习
        if (target.学习的功法 && target.学习的功法.includes(gongfaName)) {
            alreadyKnown.push(gongfaName);
            continue;
        }
        
        // 获取功法类型与不可外传属性
        let gongfaType = "修炼功法";
        let gongfaData = null;
        for (const category in data) {
            if (Array.isArray(data[category])) {
                const found = data[category].find(item => item.name === gongfaName);
                if (found) {
                    gongfaType = found.type || "修炼功法";
                    gongfaData = found;
                    break;
                }
            }
        }
        
        // 获取功法层级
        const gongfaLevel = getGongfaLevel(gongfaType);
        
        // === 不可外传拦截 ===
        if (gongfaData && gongfaData.不可外传) {
            failedBySpecial.push(`${gongfaName}(不可外传)`);
            continue;
        }
        
        // 检查天资条件
        if (targetMaxLevel < gongfaLevel) {
            failedByAptitude.push(`${gongfaName}(需${getAptitudeNameByLevel(gongfaLevel)})`);
            continue;
        }
        
        // 特殊功法检查
        if (gongfaName === '自然大道') {
            const allowedAptitudes = ["平庸之资", "先天不足", "天弃之人", "生而愚痴"];
            if (!allowedAptitudes.includes(targetAptitude.grade)) {
                failedBySpecial.push(`${gongfaName}(天资过高)`);
                continue;
            }
        }
        
        if (gongfaName === '愚钝真经') {
            if (targetAptitude.grade !== '生而愚痴') {
                failedBySpecial.push(`${gongfaName}(不够愚钝)`);
                continue;
            }
        }
        
        if (gongfaName === '混沌道经') {
            if (!target.灵根.type.includes("混沌")) {
                failedBySpecial.push(`${gongfaName}(非混沌血脉)`);
                continue;
            }
        }
        
        if (gongfaName === '无始经') {
            const allowedRoots = ["先天圣体道胎", "混沌圣体道胎"];
            if (!allowedRoots.includes(target.灵根.name) && 
                !allowedRoots.includes(target.灵根.type)) {
                failedBySpecial.push(`${gongfaName}(需先天圣体道胎)`);
                continue;
            }
        }
        
        if (gongfaName === '西皇经') {
            const allowedRoots = ["道胎", "圣体道胎", "混沌圣体道胎"];
            if (!allowedRoots.includes(target.灵根.type)) {
                failedBySpecial.push(`${gongfaName}(需道胎)`);
                continue;
            }
        }
        
        if (["妖帝古经", "万龙古经"].includes(gongfaName)) {
            if (!["妖体", "小成妖体", "大成妖体"].includes(target.灵根.type)) {
                failedBySpecial.push(`${gongfaName}(需妖体)`);
                continue;
            }
        }
        
        // === 学习失败概率 ===
        const successRate = Math.min(1, getTeachingSuccessRate(gongfaLevel, targetAptitude.grade) * getDaoHeartLearningChanceMultiplier(target));
        
        if (Math.random() > successRate) {
            failedByLuck.push(`${gongfaName}(成功率${(successRate * 100).toFixed(0)}%)`);
            continue;
        }
        
        const reservation = reserveTeachingCosts({ remainingPotential, remainingSpirit }, gongfaLevel);
        if (!reservation.ok && reservation.reason === 'potential') {
            failedByPotential.push(`${gongfaName}(潜力不足)`);
            continue;
        }
        if (!reservation.ok) {
            failedBySpirit.push(`${gongfaName}(元神不足)`);
            continue;
        }
        remainingPotential = reservation.remainingPotential;
        remainingSpirit = reservation.remainingSpirit;
        totalSpiritCost += reservation.costs.spirit;

        // 可以传授
        teachableGongfa.push(gongfaName);
        
        // 特殊功法标记
        if (gongfaName === '自然大道' || gongfaName === '愚钝真经' || 
            gongfaName === '混沌道经' || gongfaLevel >= 6) {
            specialSuccess.push(gongfaName);
        }
    }
    
    if (teachableGongfa.length === 0) {
        const message = [
            `〖传授失败〗`,
            `无法向${target.名号}传授任何功法！`,
            ``
        ];
        
        if (alreadyKnown.length > 0) {
            message.push(`目标已掌握：${alreadyKnown.length}门`);
        }
        
        if (failedByAptitude.length > 0) {
            message.push(`天资不足：${failedByAptitude.length}门`);
        }
        
        if (failedBySpecial.length > 0) {
            message.push(`条件不符：${failedBySpecial.length}门`);
        }
        
        if (failedByLuck.length > 0) {
            message.push(`传授失败：${failedByLuck.length}门`);
        }
        
        if (failedByPotential.length > 0) {
            message.push(`潜力不足：${failedByPotential.length}门（${target.名号}仙道潜力不足，需补充后再试）`);
        }
        
        if (failedBySpirit.length > 0) {
            message.push(`元神不足：${failedBySpirit.length}门（施法者元神不够支撑传授）`);
        }
        
        e.reply(message.join('\n'));
        return true;
    }
    
    // === 批量传授 ===
    applyTeachingResult(target, teachableGongfa, remainingPotential);
    await Write_player(targetQQ, target);
    await player_efficiency(targetQQ);

    // 扣除施法者元神
    caster.元神 = remainingSpirit;

    // 添加传授记录
    caster.传授记录 = caster.传授记录 || [];
    caster.传授记录.push({
        时间: new Date().toLocaleString(),
        目标: target.名号,
        功法: '批量传授',
        传授数量: teachableGongfa.length,
        成功率: `${((teachableGongfa.length / (teachableGongfa.length + failedByLuck.length)) * 100).toFixed(0)}%`,
        元神消耗: totalSpiritCost
    });
    await Write_player(casterQQ, caster);

    // === 累计传授计数与冷却触发 ===
    let teachCount = parseInt(await redis.get(teachCountKey) || '0') + teachableGongfa.length;
    let cooldownTriggered = false;
    if (teachCount >= TEACH_COUNT_THRESHOLD) {
        const cooldownUntil = Date.now() + TEACH_COOLDOWN_HOURS * 60 * 60 * 1000;
        await redis.set(teachCDKey, cooldownUntil.toString());
        await redis.del(teachCountKey);
        cooldownTriggered = true;
    } else {
        await redis.set(teachCountKey, teachCount.toString());
    }
    
    // === 构建结果消息 ===
    const message = [
        `〖醍醐灌顶·倾囊相授〗`,
        `${caster.名号}将毕生所学尽数传授给${target.名号}`,
        ``
    ];
    
    // 特殊功法成功展示
    if (specialSuccess.length > 0) {
        message.push(`〖天地异象〗`);
        for (const gongfa of specialSuccess) {
            if (gongfa === '自然大道') {
                message.push(`《自然大道》融入心田："道法自然，无为而化..."`);
            } else if (gongfa === '愚钝真经') {
                message.push(`《愚钝真经》燃烧成灰："大智若愚，大道无形！"`);
            } else if (gongfa === '混沌道经') {
                message.push(`《混沌道经》引发混沌共鸣！`);
            } else {
                message.push(`${gongfa}引发天地异象，道音轰鸣！`);
            }
        }
        message.push(``);
    }
    
    message.push(`〖传授结果〗`);
    message.push(`成功传授：${teachableGongfa.length}门功法`);
    
    if (teachableGongfa.length <= 5) {
        message.push(`传授列表：${teachableGongfa.join('、')}`);
    } else {
        message.push(`前5门：${teachableGongfa.slice(0, 5).join('、')}...等`);
    }
    
    message.push(``);
    
    if (alreadyKnown.length > 0) {
        message.push(`已掌握：${alreadyKnown.length}门`);
    }
    
    if (failedByAptitude.length > 0) {
        message.push(`天资不足：${failedByAptitude.length}门`);
    }
    
    if (failedBySpecial.length > 0) {
        message.push(`条件不符：${failedBySpecial.length}门`);
    }
    
    if (failedByLuck.length > 0) {
        message.push(`传授失败：${failedByLuck.length}门`);
    }
    
    if (failedByPotential.length > 0) {
        message.push(`潜力不足跳过：${failedByPotential.length}门`);
    }
    
    if (failedBySpirit.length > 0) {
        message.push(`元神不足跳过：${failedBySpirit.length}门`);
    }
    
    message.push(``);
    message.push(`〖传道代价〗`);
    message.push(`元神消耗：${totalSpiritCost.toLocaleString()}（剩余 ${caster.元神.toLocaleString()}）`);
    message.push(`累计传授：${teachCount}/${TEACH_COUNT_THRESHOLD} 门`);

    if (cooldownTriggered) {
        message.push(`〖元神大损·传道冷却〗`);
        message.push(`累计传授已达${TEACH_COUNT_THRESHOLD}门，元神透支！`);
        message.push(`进入${TEACH_COOLDOWN_HOURS}小时冷却，期间无法再传授功法。`);
    }
    message.push(``);
    message.push(`${target.名号}灵台清明，如获新生！`);
    message.push(`${target.名号}剩余仙道潜力：${remainingPotential} 点`);
    
    // 特殊天资的成功消息
    if (targetAptitude.grade === '生而愚痴' && teachableGongfa.length > 0) {
        message.push(`〖奇迹降临〗生而愚痴者竟能学会功法，实乃万古未闻！`);
    }
    
    e.reply(message.join('\n'));
    return true;
}






  async suppressPlayer(e) {
    // 群聊限定
    if (!e.isGroup) {
        e.reply('请在群聊中使用此无上神通');
        return true;
    }

    // 获取施法者信息
    const casterQQ = e.user_id.toString().replace('qg_', '');
    const caster = await Read_player(casterQQ);
    const authorityLevel = getRealmAuthorityLevel(caster);
    
    // 检查施法者境界（仙帝及以上）
    if (authorityLevel < 21) {
        e.reply([
            `【境界不足】`,
            `镇压诸天、令万灵永寂乃仙帝伟力！`,
            `道友当前境界不足，无法施展此无上神通！`,
        ].join('\n'));
        return true;
    }

    // 检查是否有艾特信息
    const atItems = e.message.filter(item => item.type === "at");
    if (atItems.length === 0) {
        e.reply('请指定要镇压的目标（@某人）');
        return true;
    }

    // 获取目标玩家QQ
    const targetQQ = atItems[0].qq.toString().replace('qg_', '');

    // 不能镇压自己
    if (targetQQ === casterQQ) {
        e.reply('道友不可对己身施展镇压之术！');
        return true;
    }

    // 检查目标玩家是否存在
    if (!await existplayer(targetQQ)) {
        e.reply('目标玩家不存在于诸天万界中');
        return true;
    }

    // 读取目标玩家信息
    const target = await Read_player(targetQQ);

    // 执行镇压：将目标状态设置为永寂
    await this.setPlayerToYongji(targetQQ, caster);

    // 构建镇压文案（根据境界层次）
    const messages = this.generateSuppressionMessage(caster, target);

    e.reply(messages.join('\n'));
    return true;
}

/** 将玩家设置为永寂状态 */
async setPlayerToYongji(targetQQ, caster) {
    // 设置永寂状态
    const yongjiData = {
        state: 'yongji',
        caster: caster.名号,
        time: new Date().toLocaleString(),
        casterLevel: getRealmAuthorityLevel(caster),
        casterRealm: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    };
      // 设置永寂行动状态
        let arr = {
            action: '永寂',
            end_time: new Date().getTime() + 99999 * 60000, // 近乎永久
            time: 99999 * 60000,
            shutup: '1',
            working: '1',
            Place_action: '1',
            Place_actionplus: '1',
            power_up: '1',
            mojie: '1',
            xijie: '1',
            plant: '1',
            mine: '1',
            yongji: '1' // 特殊标记
        };

            // 清除其他行动状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    await redis.set('xiuxian:player:' + targetQQ + ':action', JSON.stringify(arr));
    // 记录到玩家数据
    const player = await Read_player(targetQQ);
    player.永寂标记 = 1; // 标记为永寂状态
    player.镇压记录 = player.镇压记录 || [];
    player.镇压记录.push({
        时间: new Date().toLocaleString(),
        施法者: caster.名号,
        施法者境界: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });
    await Write_player(targetQQ, player);
}

/** 生成镇压文案（根据施法者境界） */
generateSuppressionMessage(caster, target) {
    const messages = [];
    const authorityLevel = getRealmAuthorityLevel(caster);

    // 仙帝级镇压文案
    if (authorityLevel < 22) {
        messages.push(
            `【仙帝镇世·万灵永寂】`,
            `${caster.名号}眸光开阖，整部古史都在颤栗！`,
            `一只覆盖整片星海的帝手探出，`,
            `无穷大道符文缠绕，镇压向${target.名号}！`,
            `"违逆帝者，当永寂！"`,
            `帝音回荡，万道哀鸣！`,
            `${target.名号}的身影在帝手下寸寸崩灭，`,
            `真灵被投入永寂之地，万世不得超生！`,
        );
    }
    // 祭道级镇压文案
    else if (authorityLevel === 22) {
        messages.push(
            `【祭道镇世·诸天同寂】`,
            `轰！！！`,
            `整部古史突然剧烈震荡！${caster.名号}的祭道符文照亮诸天万界！`,
            `"祭吾真名，葬汝永世！"`,
            `祭祀音回荡，${target.名号}所在宇宙瞬间枯竭，`,
            `时光长河断流，因果命运崩解！`,
            `诸天万界都在哀鸣，无数宇宙走向终点，`,
            `${target.名号}的真名被从古史中彻底抹除，`,
            `永坠祭海，永世沉沦！`,
        );
    }
    // 祭道之上镇压文案（24级+）
    else {
        messages.push(
            `【永恒镇压·诸天归墟】`,
            `眸光所至，整部古史突然陷入死寂！`,
            `${caster.名号}的身影同时显化在：`,
            ` 开天辟地前的混沌原点`,
            ` 现世轮回的尽头`,
            ` 所有可能的未来支流`,
            `"枯竭。"`,
            `二字道出，${target.名号}所在时空瞬间湮灭！`,
            `连"存在"这个概念本身都在瓦解！`,
            `诸天万界，无量宇宙，所有生灵心头莫名悸动，`,
            `仿佛某种至高无上的存在睁开了双眼。`,
            `"永恒镇压。"`,
            `四字道出，万古时空彻底凝固！`,
            `${target.名号}被永恒禁锢在"无"与"有"的夹缝中，`,
            `永世不得超脱！`,
        );
    }

    return messages;
}
async yingzhao(e) {
    // 群聊限定
    if (!e.isGroup) {
        e.reply('请在群聊中使用此神圣术法');
        return true;
    }

    // 检查施法者境界
    const casterQQ = e.user_id.toString().replace('qg_','');
    const caster = await Read_player(casterQQ);
    
    // 只有仙帝级以上才能使用映照复活
    if (!hasRealmAuthority(caster, 21)) {
        e.reply([
            `【境界不足】`,
            `映照诸天、逆转生死乃仙帝伟力！`,
            `道友当前境界不足，无法施展此无上神通！`,
        ].join('\n'));
        return true;
    }

    // ===== 映照诸天（优先级最高）=====
    const rawMsg = e.msg.trim();
    if (/^#映照诸天$/.test(rawMsg)) {
        return await this.handleZhuTianYingzhao(e, caster, casterQQ);
    }

    // ===== 映照位面（无@时匹配位面名）=====
    const planeMatch = rawMsg.match(/^#映照(?:复活)?(凡间|仙界|下界八域|遮天位面|九天十地|界海|仙域)$/);
    if (planeMatch) {
        return await this.handlePlaneYingzhao(e, caster, casterQQ, planeMatch[1]);
    }

    // 检查是否有艾特信息（可以复活他人或自己）
    let targetQQ;
    const atItems = e.message.filter(item => item.type === "at");
    
    if (atItems.length > 0) {
        // 复活他人
        targetQQ = atItems[0].qq.toString().replace('qg_','');
    } else {
        // 复活自己
        targetQQ = casterQQ;
    }

    // 检查目标玩家是否存在
    if (!await existplayer(targetQQ)) {
        e.reply('目标玩家不存在于诸天万界中');
        return true;
    }

    // 读取目标数据
    const target = await Read_player(targetQQ);
    const targetAction = await redis.get('xiuxian:player:' + targetQQ + ':action');
    const parsedAction = targetAction ? JSON.parse(targetAction) : null;

    // 判断目标状态
    const isSelf = targetQQ === casterQQ;
    const isYongji = parsedAction?.yongji; // 永寂状态
    const isTianlao = parsedAction?.action === '天牢'; // 天牢状态
    const isHeianlaolong = parsedAction?.heianlaolong; // 黑暗牢笼状态
    const isNormal = !isYongji && !isTianlao && !isHeianlaolong; // 正常状态但有其他异常

    // 处理不同状态
    if (isYongji) {
        // 永寂状态 - 执行复活
        return await this.handleYongjiResurrection(e, caster, target, targetQQ);
    } else if (isTianlao) {
        // 天牢状态 - 解放并恢复
        return await this.handleTianlaoRelease(e, caster, target, targetQQ);
    } else if (isHeianlaolong) {
        // 黑暗牢笼状态 - 解救并恢复
        return await this.handleHeianlaolongRescue(e, caster, target, targetQQ);
    } else if (isSelf) {
        // 对自己使用 - 恢复满血并解除所有状态
        return await this.handleSelfRecovery(e, caster, targetQQ);
    } else {
        // 对他人使用但非特殊状态 - 恢复满血并解除异常状态
        return await this.handleNormalRecovery(e, caster, target, targetQQ);
    }
}

/** 处理永寂复活（整合 YongJiList 新系统 + 旧永寂兼容） */
async handleYongjiResurrection(e, caster, target, targetQQ) {
    const authorityLevel = getRealmAuthorityLevel(caster);
    // ===== 步骤1：查 YongJiList（诡异大祭·位面破坏产生的永寂者）=====
    const yongjiResult = await findYongJiByNameOrQQ(targetQQ);
    
    if (yongjiResult.found) {
        // --- 新系统永寂复活（数据从备份完整恢复）---
        const record = yongjiResult.record;
        const { planeName, yongjiTimeStr, 名号 } = record;

        // 消耗：修为20%+血量上限20%（沿用zhengdaotixi百分比模型）
        const costCultivation = Math.floor(caster.修为 * 0.2);
        const costMaxHP = Math.floor(caster.血量上限 * 0.2);

        if (caster.修为 < costCultivation) {
            await e.reply([
                `【映照·修为不足】`,
                `${caster.名号}尝试映照${名号 || targetQQ}的永寂状态……`,
                `然而修为不足以支撑这道权能！`,
                `所需修为：${bigNumberTransform(costCultivation)}`,
                `当前修为：${bigNumberTransform(caster.修为)}`,
            ].join('\n'));
            return true;
        }

        // 扣除消耗
        caster.修为 -= costCultivation;
        caster.血量上限 -= costMaxHP;
        caster.当前血量 = Math.min(caster.当前血量, caster.血量上限);
        await Write_player(caster.qq, caster);

        // 执行复活
        const reviveResult = await reviveFromYongJi(record.qq);
        if (!reviveResult.success) {
            await e.reply(`映照失败：${reviveResult.reason || '未知错误'}`);
            return true;
        }

        // 回复
        await e.reply([
            `【映照诸天·逆转生死】`,
            `${caster.名号}施展无上仙帝伟力，映照${reviveResult.playerName}！`,
            ``,
            `整部古史都在颤栗！`,
            `"归来！"`,
            `一声道喝震碎时间长河！`,
            `${reviveResult.playerName}从永寂之界中归来！`,
            ``,
            `曾沉眠于：${reviveResult.planeName}`,
            `永寂时间：${yongjiTimeStr}`,
            ``,
            `【映照代价】`,
            `消耗修为：${bigNumberTransform(costCultivation)}`,
            `消耗血量上限：${bigNumberTransform(costMaxHP)}`,
            ``,
            `「映照诸天，虽代价沉重——」`,
            `「然道友之情，重于泰山！」`
        ].join('\n'));

        // 全服广播
        await this._broadcastYingZhaoSimple('single', caster.名号, reviveResult.playerName, reviveResult.planeName);
        return true;
    }

    // ===== 步骤2：兼容旧永寂系统 =====
    // 获取目标的永寂状态
    let oblivionInfo = await redis.get(`xiuxian:player:${targetQQ}:oblivion`);
    if (!oblivionInfo) {
        oblivionInfo = await redis.get(`xiuxian:player:${targetQQ}:yongji`);
    }
    
    let oblivionLevel = 21; // 默认仙帝级永寂
    let obliteratorName = '未知存在';
    
    if (oblivionInfo) {
        let oblivionData = JSON.parse(oblivionInfo);
        oblivionLevel = oblivionData.oblivionLevel || 21;
        obliteratorName = oblivionData.obliteratorName || '未知存在';
    }
    
    // ===== 救援权限判定 =====
    // 永寂等级与救援要求：
    // oblivionLevel 21 (仙帝永寂) → 需要仙帝(21+)救援
    // oblivionLevel 22 (祭道永寂) → 需要祭道(22+)救援
    // oblivionLevel 23 (终极始祖永寂) → 需要祭道之上(24+)救援（超越祭道但非完全超脱）
    // oblivionLevel 24+ (祭道之上永寂) → 需要祭道之上(24+)救援
    
    let canRescue = false;
    let rescueRequireMsg = '';
    
    if (oblivionLevel >= 24) {
        // 祭道之上永寂 - 需要祭道之上(24+)才能救
        if (authorityLevel >= 24) {
            canRescue = true;
        } else {
            rescueRequireMsg = `此为祭道之上级别的永寂，唯有同层次的至高存在方能映照逆转！`;
        }
    } else if (oblivionLevel === 23) {
        // 终极始祖永寂 - 超越祭道但非完全超脱，需要祭道之上(24+)才能救
        // 祭道境(22-23)无法救终极始祖永寂，因为终极始祖已超越祭道
        if (authorityLevel >= 24) {
            canRescue = true;
        } else {
            rescueRequireMsg = `此为终极始祖的永寂——已超越祭道领域！祭道之下的存在无法触及此等层面的湮灭！`;
        }
    } else if (oblivionLevel === 22) {
        // 祭道永寂 - 需要祭道(22+)才能救
        if (authorityLevel >= 22) {
            canRescue = true;
        } else {
            rescueRequireMsg = `此为祭道级别的永寂，唯有祭道境以上的存在方能映照逆转！`;
        }
    } else {
        // 仙帝永寂 - 需要仙帝(21+)才能救
        if (authorityLevel >= 21) {
            canRescue = true;
        } else {
            rescueRequireMsg = `此为仙帝级别的永寂，需达仙帝境方可映照逆转！`;
        }
    }
    
    // ===== 权限不足处理 =====
    if (!canRescue) {
        await e.reply([
            `【映照失败·权限不足】`,
            `${caster.名号}尝试映照${target.名号}的永寂状态……`,
            ``,
            `然而，${obliteratorName}留下的永寂烙印太过强大！`,
            `您的修为不足以触及这一层面的存在！`,
            ``,
            `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`,
            `【致寂者】${obliteratorName}`,
            ``,
            rescueRequireMsg,
            ``,
            `「唯有超越${this.getOblivionLevelName(oblivionLevel)}的存在——」`,
            `「方能映照逆转此等永寂！」`,
        ].join('\n'));
        return true;
    }
    
    // ===== 映照消耗与限制 =====
    
    // 检查映照次数限制（每天最多映照复活3次）
    let yingzhaoCount = await redis.get(`xiuxian:player:${caster.qq}:yingzhao_count`);
    yingzhaoCount = yingzhaoCount ? parseInt(yingzhaoCount) : 0;
    let maxYingzhaoPerDay = 3;
    
    let lastYingzhaoDate = await redis.get(`xiuxian:player:${caster.qq}:last_yingzhao_date`);
    let today = new Date().toDateString();
    
    if (lastYingzhaoDate !== today) {
        yingzhaoCount = 0;
        await redis.set(`xiuxian:player:${caster.qq}:last_yingzhao_date`, today);
    }
    
    // if (yingzhaoCount >= maxYingzhaoPerDay) {
    //     await e.reply([
    //         `【映照受限】`,
    //         `今日你的映照次数已用尽（${maxYingzhaoPerDay}次/天）！`,
    //         `「映照诸天需要消耗大量心力，不可滥用……」`,
    //         `请明日再尝试。`,
    //     ].join("\n"));
    //     return true;
    // }
    
    // 计算映照消耗（永寂等级越高，消耗越大）
    // 仙帝(21)：消耗修为20%
    // 祭道(22)：消耗修为15%
    // 祭道之上(23-24)：消耗修为10%
    // 祭道之上(25+)：消耗修为5%
    let costRate = 0.2;
    if (authorityLevel >= 24) {
        costRate = 0.05;
    } else if (authorityLevel >= 23) {
        costRate = 0.1;
    } else if (authorityLevel >= 22) {
        costRate = 0.15;
    }
    
    // 永寂等级加成消耗（救援更高等级的永寂需要更多代价）
    let oblivionBonus = 1.0;
    if (oblivionLevel >= 24) {
        oblivionBonus = 1.5; // 祭道之上永寂增加50%消耗
    } else if (oblivionLevel === 23) {
        oblivionBonus = 1.3; // 终极始祖永寂增加30%消耗
    } else if (oblivionLevel === 22) {
        oblivionBonus = 1.2; // 祭道永寂增加20%消耗
    }
    
    let costCultivation = Math.floor(caster.修为 * costRate * oblivionBonus);
    let costMaxHP = Math.floor(caster.血量上限 * costRate * oblivionBonus);
    let costAttack = Math.floor(caster.攻击 * costRate * oblivionBonus);
    let costDefense = Math.floor(caster.防御 * costRate * oblivionBonus);
    
    // 检查是否有足够的修为
    if (caster.修为 < costCultivation) {
        await e.reply([
            `【修为不足】`,
            `映照复活需要消耗${Math.round(costRate * oblivionBonus * 100)}%修为！`,
            `你当前修为不足，无法施展此神通！`,
            `所需修为：${bigNumberTransform(costCultivation)}`,
            `当前修为：${bigNumberTransform(caster.修为)}`,
        ].join("\n"));
        return true;
    }
    
    // 扣除消耗
    caster.修为 -= costCultivation;
    caster.血量上限 -= costMaxHP;
    caster.攻击 -= costAttack;
    caster.防御 -= costDefense;
    caster.当前血量 = Math.min(caster.当前血量, caster.血量上限);
    await Write_player(caster.qq, caster);
    
    // 增加映照计数
    yingzhaoCount++;
    await redis.set(`xiuxian:player:${caster.qq}:yingzhao_count`, yingzhaoCount.toString());
    
    // 执行复活
    await this.resurrectPlayer(targetQQ, caster);

    // 构建回复消息
    const messages = [];
    
    // 根据永寂等级添加不同文案
    if (oblivionLevel >= 24) {
        // 逆转祭道之上永寂
        messages.push(
            `【永恒映照·逆转祭道之上永寂】`,
            `${caster.名号}施展超越祭道的无上伟力！`,
            `「眸光所至，枯竭所有，重现所有！」`,
            ``,
            `号称"不可逆"的祭道之上永寂——`,
            `竟在${caster.名号}的眸光下化作虚无！`,
            `${target.名号}的身影从终极湮灭中归来！`,
            ``,
            `诸天震颤，所有至高存在皆心生感应！`,
            `"这便是......超越一切的存在！"`,
            ``,
            `【致寂者】${obliteratorName}`,
            `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
        );
    } else if (oblivionLevel === 23) {
        // 逆转终极始祖永寂
        messages.push(
            `【终极映照·逆转终极始祖之寂】`,
            `${caster.名号}以祭道之上的修为，`,
            `映照那超越祭道领域的终极湮灭！`,
            ``,
            `终极始祖的永寂烙印——`,
            `在这无上眸光下寸寸崩裂！`,
            `${target.名号}从超越祭道的湮灭中归来！`,
            ``,
            `"终极虽强——"`,
            `"亦在我一念之间！"`,
            ``,
            `【致寂者】${obliteratorName}`,
            `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
        );
    } else if (authorityLevel >= 22) {
        // 祭道映照
        messages.push(
            `【祭道映照·逆转生死】`,
            `${caster.名号}立于时光长河之上，祭道符文在眸中流转！`,
            `「他化自在，他化万古！」`,
            ``,
            `整部古史都在颤栗！`,
            `三道贯穿古今的帝影同时结印映照诸天：`,
            `"以我祭道真名，唤汝真灵重聚！"`,
            `${target.名号}从永寂中归来！`,
            ``,
            `【致寂者】${obliteratorName}`,
            `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
        );
    } else {
        // 普通映照
        messages.push(
            `【映照诸天·逆转生死】`,
            `${caster.名号}施展无上仙帝伟力，映照${target.名号}！`,
            ``,
            `整部古史都在颤栗！`,
            `"归来！"`,
            `一声道喝震碎时间长河！`,
            `${target.名号}从永寂中归来！`,
            ``,
            `【致寂者】${obliteratorName}`,
            `【永寂等级】${this.getOblivionLevelName(oblivionLevel)}`
        );
    }
    
    // 映照消耗信息
    messages.push(
        ``,
        `【映照代价】`,
        `消耗修为：${bigNumberTransform(costCultivation)}`,
        `消耗血量上限：${bigNumberTransform(costMaxHP)}`,
        `消耗攻击：${bigNumberTransform(costAttack)}`,
        `消耗防御：${bigNumberTransform(costDefense)}`,
        ``,
        `今日剩余映照次数：${maxYingzhaoPerDay - yingzhaoCount}次`,
        ``,
        `「映照诸天，虽代价沉重——」`,
        `「然道友之情，重于泰山！」`
    );
    
    e.reply(messages.join('\n'));
    console.log(`[映照复活] ${target.名号} 被 ${caster.名号} 从永寂中复活（永寂等级:${oblivionLevel}），已设置虚弱期`);
    
    return true;
}

/** 获取永寂等级名称 */
getOblivionLevelName(level) {
    if (level >= 24) return '祭道之上永寂';
    if (level === 23) return '终极始祖永寂';
    if (level === 22) return '祭道永寂';
    return '仙帝永寂';
}

/** 处理天牢解放 */
async handleTianlaoRelease(e, caster, target, targetQQ) {
    // 解除天牢状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    // 恢复玩家属性
    const player = await Read_player(targetQQ);
    player.当前血量 = player.血量上限;
    player.修为 = Math.floor(player.修为 * 0.9); // 保留90%修为
    player.灵石 = Math.floor(player.灵石 * 0.7); // 保留70%灵石
    
    // 添加解放记录
    player.解放记录 = player.解放记录 || [];
    player.解放记录.push({
        时间: new Date().toLocaleString(),
        施法者: caster.名号,
        施法者境界: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });

    await Write_player(targetQQ, player);
    
    // 构建回复消息
    const message = [
        `【映照诸天·破狱解厄】`,
        `${caster.名号}施展无上仙帝伟力，映照诸天万界！`,
        
        `天牢深处，一道神光贯穿古今，`,
        `坚固的牢狱壁垒在仙帝伟力前如薄纸般破碎！`,
        
        `${target.名号}从天牢中被解放，`,
        `所有伤势瞬间痊愈！`,
        
        `"谢仙帝救命之恩！"`
    ].join('\n');
    
    e.reply(message);
    return true;
}

/** 处理黑暗牢笼解救 */
async handleHeianlaolongRescue(e, caster, target, targetQQ) {
    const authorityLevel = getRealmAuthorityLevel(caster);
    // 解除黑暗牢笼状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    // 恢复玩家属性
    const player = await Read_player(targetQQ);
    player.当前血量 = player.血量上限;
    player.修为 = Math.floor(player.修为 * 0.9); // 保留90%修为
    player.灵石 = Math.floor(player.灵石 * 0.7); // 保留70%灵石
    
    // 添加解救记录
    player.解救记录 = player.解救记录 || [];
    player.解救记录.push({
        时间: new Date().toLocaleString(),
        施法者: caster.名号,
        施法者境界: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });

    await Write_player(targetQQ, player);
    
    // 构建回复消息 - 根据仙帝境界不同显示不同文案
    let messages = [];
    
    // 普通仙帝级解救文案（21级）
    if (authorityLevel === 21) {
        messages = [
            `【映照诸天·破灭黑暗】`,
            `${caster.名号}于永恒未知之地睁开仙帝之眸，`,
            `眸光穿透无尽虚空，映照那传说中永无天日的黑暗牢笼！`,
            ``,
            `"区区黑暗，也敢囚我道友？"`,
            `一声道喝震碎万古虚空！`,
            `仙帝伟力化作无量神光，贯穿永恒黑暗！`,
            `那号称不朽的黑暗物质在仙帝法则前如冰雪般消融，`,
            `冰冷的秩序神链寸寸断裂！`,
            ``,
            `接引古殿虚影剧烈震颤，青铜巨门轰然洞开！`,
            `一道璀璨仙光自牢笼深处迸发，`,
            `${target.名号}的元神挣脱黑暗枷锁，重归现世！`,
            ``,
            `"谢仙帝救命之恩！"`
        ];
    }
    // 祭道级解救文案（22-23级）
    else if (authorityLevel >= 22 && authorityLevel <= 23) {
        messages = [
            `【祭道映照·焚尽黑暗】`,
            `${caster.名号}立于时光长河之上，祭道符文在眸中流转，`,
            `目光所及，那永恒黑暗的牢笼竟开始燃烧！`,
            ``,
            `"他化自在，他化万古！"`,
            `三道贯穿古今的帝影同时显化：`,
            `- 一道立于现世，手持仙剑斩断秩序神链`,
            `- 一道立于过去，焚尽黑暗物质本源`,
            `- 一道立于未来，镇压接引古殿反噬`,
            ``,
            `整部古史都在颤栗！黑暗牢笼的根基被祭道伟力彻底焚毁！`,
            `那号称"永无天日"的囚笼，第一次被光明彻底照亮！`,
            `${target.名号}的元神沐浴祭道神火，重塑真身！`,
            ``,
            `"以祭道之名，赐汝新生！"`
        ];
    }
    // 祭道之上解救文案（24级+）
    else if (authorityLevel >= 24) {
        messages = [
            `【永恒映照·湮灭黑暗】`,
            `「眸光所至，枯竭所有，重现所有！」`,
            `${caster.名号}的眸光穿透诸天万界，落在黑暗牢笼深处。`,
            ``,
            `轰！`,
            `整部古史突然剧烈震荡！`,
            `接引古殿发出不堪重负的哀鸣，`,
            `那流淌了万古纪元的黑暗物质竟开始...倒流！`,
            ``,
            `"枯竭。"`,
            `二字道出，永寂黑暗吞噬万古！`,
            `黑暗牢笼、秩序神链、接引古殿...`,
            `一切与黑暗相关的事物都在湮灭，归于虚无！`,
            ``,
            `就在黑暗即将彻底消失时——`,
            ``,
            `"重现。"`,
            `${caster.名号}的眸光再次闪动！`,
            ``,
            `一道纯净无暇的身影自虚无中踏出，`,
            `正是${target.名号}，`,
            `其元神晶莹剔透，再无半点黑暗侵蚀痕迹！`,
            ``,
            `诸天震颤，所有仙帝级存在皆心生感应：`,
            `"黑暗源头...被抹除了？！"`
        ];
    }
    
    e.reply(messages.join('\n'));
    return true;
}

/** 处理自身恢复 */
async handleSelfRecovery(e, caster, targetQQ) {
    // 解除所有异常状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    // 恢复玩家属性
    const player = await Read_player(targetQQ);
    player.当前血量 = player.血量上限;
    player.修为 = player.修为; // 保持修为不变
    player.灵石 = player.灵石; // 保持灵石不变
    player.道伤=0;
    player.生命本源=100+player.灵根.生命本源;
    // 添加恢复记录
    player.恢复记录 = player.恢复记录 || [];
    player.恢复记录.push({
        时间: new Date().toLocaleString(),
        境界: getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });

    await Write_player(targetQQ, player);
    
    // 构建回复消息
    const message = [
        `【映照己身·万法不侵】`,
        `${caster.名号}施展无上仙帝伟力，映照己身！`,
        
        `周身仙光缭绕，所有异常状态瞬间消散，`,
        `伤势痊愈，状态恢复到巅峰！`,
        
        `"我身即道，万法不侵！"`
    ].join('\n');
    
    e.reply(message);
    return true;
}

/** 处理普通恢复 */
async handleNormalRecovery(e, caster, target, targetQQ) {
    // 解除所有异常状态
    await redis.del(`xiuxian:player:${targetQQ}:action`);
    
    // 恢复玩家属性
    const player = await Read_player(targetQQ);
    player.当前血量 = player.血量上限;
    player.道伤=0;
    player.生命本源=100+player.灵根.生命本源;
    // 添加恢复记录
    player.恢复记录 = player.恢复记录 || [];
    player.恢复记录.push({
        时间: new Date().toLocaleString(),
        施法者: caster.名号,
        施法者境界: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });

    await Write_player(targetQQ, player);
    
    // 构建回复消息
    const message = [
        `【映照诸天·涤荡尘埃】`,
        `${caster.名号}施展仙帝伟力，映照${target.名号}！`,
        
        `一道纯净仙光笼罩${target.名号}，`,
        `所有异常状态瞬间消散，伤势痊愈！`,
        
        `"谢仙帝恩典！"`
    ].join('\n');
    
    e.reply(message);
    return true;
}

/** 复活玩家具体逻辑 */
async resurrectPlayer(targetQQ, caster) {
    // 解除永寂状态
    await redis.del(`xiuxian:player:${targetQQ}:yongji`);
    await redis.del(`xiuxian:player:${targetQQ}:action`);

    // 恢复基础属性
    const target = await Read_player(targetQQ);
    target.当前血量 = target.血量上限;
    target.永寂标记 = 0;
    
    // 添加复活记录
    target.复活记录 = target.复活记录 || [];
    target.复活记录.push({
        时间: new Date().toLocaleString(),
        施法者: caster.名号,
        施法者境界: getRealmAuthorityName(caster, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list)
    });

    await Write_player(targetQQ, target);
}

// ==================== 映照位面 & 映照诸天（整合 YongJiList）====================

/** 位面级别映照：修复被诡异大祭崩灭的位面（不复活永寂者） */
async handlePlaneYingzhao(e, caster, casterQQ, planeName) {
    const PLANE_ID_MAP = {
        '凡间': 0, '仙界': 1, '下界八域': 1.5,
        '遮天位面': 2, '九天十地': 2.5, '界海': 3, '仙域': 6,
    };
    const planeId = PLANE_ID_MAP[planeName];
    if (planeId === undefined) {
        await e.reply(`【映照·位面不明】\n「${planeName}」并非可映照的位面。`);
        return true;
    }

    // 映照CD检查
    const cdKey = `xiuxian:player:${casterQQ}:yingzhao_cd`;
    if (await this._checkYingZhaoCD(e, caster, cdKey)) return true;

    // 消耗：1000亿修为+1000亿血气
    const COST = 100000000000;
    if (caster.修为 < COST || caster.血气 < COST) {
        await e.reply([
            `【映照·资源不足】`,
            `帝意映照崩灭的位面——`,
            `那是何等浩大的伟力涌动！`,
            ``,
            `所需消耗：修为 1000亿（当前：${bigNumberTransform(caster.修为)}）`,
            `　　　　　血气 1000亿（当前：${bigNumberTransform(caster.血气)}）`,
        ].join('\n'));
        return true;
    }

    caster.修为 -= COST;
    caster.血气 -= COST;
    if (caster.修为 < 0) caster.修为 = 0;
    if (caster.血气 < 0) caster.血气 = 0;
    await Write_player(casterQQ, caster);

    const repaired = await repairSinglePlane(planeId);
    if (!repaired) {
        // 位面未被破坏，归还资源
        caster.修为 += COST;
        caster.血气 += COST;
        await Write_player(casterQQ, caster);
        await e.reply([
            `【映照·位面无恙】`,
            `你的帝意探入「${planeName}」——`,
            `然而此位面并未崩灭，无需映照修复。`,
            ``,
            `「位面安好，何必映照？」`,
            `资源已归还。`,
        ].join('\n'));
        return true;
    }

    // 全服广播
    await this._broadcastYingZhaoSimple('plane', caster.名号, planeName, planeName, 0);

    await e.reply([
        `══════ 仙帝映照 · 位面修复 ══════`,
        ``,
        `帝意如大日骤然升起，`,
        `映照「${planeName}」的崩灭废墟——`,
        ``,
        `扭曲的虚空裂缝在帝辉中缓缓弥合，`,
        `崩碎的山河大地重新拼接成型，`,
        ``,
        `「此界，朕一言修复——！」`,
        ``,
        `轰隆！`,
        `诡异大祭留下的创伤被帝威抹去，`,
        `「${planeName}」位面壁垒重铸，`,
        `崩灭状态已解除，修士可再次踏入！`,
        ``,
        `【消耗】修为 -1000亿 | 血气 -1000亿`,
    ].join('\n'));
    return true;
}

/** 映照诸天：复活所有永寂者 + 修复所有被毁位面
 *  境界分层消耗：
 *    仙帝(21)：    1兆修为+血气，CD 24h，不念不想 360min
 *    祭道(22)：    5000亿修为+血气，CD 12h，不念不想 180min
 *    祭道之上(23+)：无消耗，无CD，无任何代价
 */
async handleZhuTianYingzhao(e, caster, casterQQ) {
    const level = getRealmAuthorityLevel(caster);
    const cdKey = `xiuxian:player:${casterQQ}:yingzhao_cd`;

    // ===== 祭道之上：无视一切代价 =====
    const isAboveJidao = level >= 23;
    // ===== 祭道：代价减半 =====
    const isJidao = level === 22;

    // ===== 非祭道之上：CD检查 =====
    if (!isAboveJidao) {
        if (await this._checkYingZhaoCD(e, caster, cdKey)) return true;
    }

    // ===== 消耗分层 =====
    let COST = 1000000000000;  // 仙帝默认：1兆
    let cdHours = 24;          // 仙帝默认：24h
    let bunianMin = 360;       // 仙帝默认：360min

    if (isAboveJidao) {
        COST = 0;
        cdHours = 0;
        bunianMin = 0;
    } else if (isJidao) {
        COST = 500000000000;   // 祭道：5000亿
        cdHours = 12;
        bunianMin = 180;
    }

    // ===== 消耗检查（祭道之上跳过） =====
    if (COST > 0 && (caster.修为 < COST || caster.血气 < COST)) {
        const realmName = isJidao ? '祭道' : '仙帝';
        await e.reply([
            `\n══════ ${realmName}映照 · 诸天引渡 ══════`,
            ``,
            `帝意浩荡，欲映照诸天万界……`,
            ``,
            `然而——`,
            `修为与血气的枯竭，令这道权能无以为继！`,
            ``,
            `「映照诸天」所需消耗：`,
            `  ◆ 修为：${bigNumberTransform(COST)}（当前：${bigNumberTransform(caster.修为)}）`,
            `  ◆ 血气：${bigNumberTransform(COST)}（当前：${bigNumberTransform(caster.血气)}）`,
            ``,
            `「汝之帝意，尚不足以映照诸天！」`,
        ].join('\n'));
        return true;
    }

    // ===== 扣除消耗 =====
    if (COST > 0) {
        caster.修为 -= COST;
        caster.血气 -= COST;
        if (caster.修为 < 0) caster.修为 = 0;
        if (caster.血气 < 0) caster.血气 = 0;
        await Write_player(casterQQ, caster);
    }

    // ===== 执行全体复活 =====
    const reviveResult = await reviveAllFromYongJi();

    if (reviveResult.total === 0) {
        // 无永寂者
        if (isAboveJidao) {
            // 祭道之上不消耗，无需归还
            await e.reply([
                `【终极映照·虚空无感】`,
                `永寂之界空无一物——`,
                ``,
                `你的意志扫过诸天万界，`,
                `确认无一道果沉眠。`,
                ``,
                `「映照诸天，虚发。」`,
            ].join('\n'));
        } else {
            // 归还资源
            caster.修为 += COST;
            caster.血气 += COST;
            await Write_player(casterQQ, caster);
            await e.reply([
                `【映照诸天·虚空无感】`,
                `帝意如日悬空，映照诸天万界——`,
                `然而永寂之界一片虚空，此刻无一道沉眠的道果气息！`,
                ``,
                `「永寂者皆已归来，或从未入永寂——」`,
                `「映照诸天，虚发。」`,
                `资源已归还。`,
            ].join('\n'));
        }
        return true;
    }

    // ===== 修复所有被破坏的位面 =====
    await repairAllDestroyedPlanes();

    // ===== 施加惩罚（祭道之上跳过） =====
    if (!isAboveJidao) {
        const now = Date.now();
        const bunianState = {
            状态: '不念不想',
            startTime: now,
            endTime: now + bunianMin * 60 * 1000,
            reason: isJidao ? '祭道映照后帝意波动，暂入不念不想' : '映照诸天后帝意枯竭，濒临从古史中消散',
        };
        await redis.set(cdKey, JSON.stringify({
            endTime: now + cdHours * 60 * 60 * 1000,
            reason: isJidao ? '祭道映照·帝意暂封' : '映照诸天·帝意枯竭，形神将散',
        }));
        caster.不念不想 = bunianState;
        await Write_player(casterQQ, caster);
        await redis.set(`xiuxian:player:${casterQQ}:bunian`, JSON.stringify(bunianState));
    }

    // ===== 全服广播（传入境界） =====
    await this._broadcastYingZhaoSimple('all', caster.名号, '诸天', '诸天万界', reviveResult.total, level);

    const planesRevived = reviveResult.byPlane.map(p => `  ◆ ${p.planeName}：${p.count}人`).join('\n');

    // ===== 成功文案（境界分层） =====
    if (isAboveJidao) {
        await e.reply([
            `\n 万古无声`,
            `　　祭道之上 · 映照万界`,

            ``,
            `${caster.名号}，你已超脱一切时空、维度、法则与命运——`,
            `纵是诡异始祖倾巢而出，`,
            `纵是诸天万界一同坠入永寂，`,
            `在你眼中——`,
            `不过是时间长河中的一粒微尘。`,
            ``,
            `你一念起——`,
            `永寂之界的壁垒，如同薄纸般洞穿！`,
            ``,
            `没有消耗，没有挣扎，没有代价。`,
            `因为你本身，`,
            `就已经超越了代价这个概念。`,
            ``,
            `「永寂之界中沉眠的道果——」`,
            `「归——来。」`,
            ``,
            `这一声轻语，`,
            `却令整个诡异高原都在颤抖！`,
            `${reviveResult.total} 道沉寂的道果，`,
            `在祭道之上的意志中——`,
            `瞬间摆脱永寂之界的束缚！`,
            `瞬间重塑不朽道基！`,
            `瞬间归位于诸天万界！`,
            ``,
            `【复活分布】`,
            planesRevived,
            ``,
            `不仅如此`,
            `被诡异大祭崩灭的位面碎片，`,
            `在你意志降临的刹那——`,
            `连时间本身都在倒退！`,
            `断裂的壁垒自行愈合！`,
            `湮灭的法则重新编织！`,
            `崩碎的位面——从无到有，重生！`,
            ``,
            `「祭道之上——」`,
            `「万古诸天，不过一念之间。」`,
            `「寂灭与新生，皆由我心。」`,
            ``,
            `【代价】`,
            `  ◆ 修为消耗：无`,
            `  ◆ 血气消耗：无`,
            `  ◆ 映照CD：无（祭道之上，不受任何限制）`,
            `  ◆ 不念不想：无（汝身已超越心念之困）`,
            `  ◆ 所有被毁位面：已修复 ✓`,
        ].join('\n'));
    } else if (isJidao) {
        await e.reply([
            `\n`,
            `　　诸天震颤 · 祭道映照`,
            `${caster.名号}，你已焚尽规则与秩序，`,
            `祭掉了自身的至高大道与过往一切——`,
            `这一刻，祭道符文在眼眸深处熊熊燃烧！`,
            ``,
            `你无需再顾忌诸天因果，`,
            `因为你自己，`,
            `就是焚烧大道的起源！`,
            ``,
            `「永寂之界中的道果——」`,
            `「以我祭道真名，唤尔等归来！！」`,
            ``,
            `祭道伟力化作焚天黑炎，`,
            `点燃永寂之界的每一寸灰雾！`,
            `沉寂的道果在黑炎中——`,
            `被剥离永寂的枷锁！`,
            `被召回现世的怀抱！`,
            `被重塑不朽的真灵！`,
            ``,
            `${reviveResult.total} 道沉寂的道果，`,
            `在祭道神火中重铸道基，`,
            `自永寂之界的深渊——归位！`,
            ``,
            `【复活分布】`,
            planesRevived,
            ``,
            `同时`,
            `祭道符文流转间，`,
            `被崩灭的位面碎片自行愈合，`,
            `诸天壁垒在祭道的意志下重塑！`,
            ``,
            `「焚尽大道者，代价已然减半——」`,
            `「然祭道之身终究未超脱，`,
            `　映照过后，帝意仍不免暂封。」`,
            ``,
            `【代价（减半）】`,
            `  ◆ 修为 -${bigNumberTransform(COST)} | 血气 -${bigNumberTransform(COST)}`,
            `  ◆ 映照权能暂封 ${cdHours}小时`,
            `  ◆ 修仙状态陷入「不念不想」${bunianMin}分钟`,
            `  ◆ 所有被毁位面：已修复 ✓`,
        ].join('\n'));
    } else {
        await e.reply([
            `诸天震动 · 仙帝映照`,
            ``,
            `${caster.名号}，你缓缓睁开仙帝之眸——`,
            `那道贯穿万古的帝光，超脱了时间与空间的桎梏，`,
            `映照诸天已崩之界！`,
            ``,
            `「坠入永寂之界的道果——」`,
            `「本座来了！」`,
            ``,
            `帝意轰鸣，如诸天开辟的第一缕曦光！`,
            `仙帝伟力化作无量神芒，`,
            `贯穿永寂之界每一寸灰雾！`,
            ``,
            `一道道沉寂的道果在光辉中——`,
            `颤抖！苏醒！凝聚！升腾！`,
            `归——来——！！`,
            ``,
            `轰！！！`,
            `诸天永寂之界，被仙帝伟力撕开一道裂缝！`,
            `${reviveResult.total} 名修士的道果，悉数重归诸天万界！`,
            ``,
            `【复活分布】`,
            planesRevived,
            ``,
            `不仅如此`,
            `被诡异大祭崩灭的位面，`,
            `在仙帝帝意的映照下——`,
            `壁垒愈合，万道归位，重获新生！`,
            ``,
            `然而——`,
            `如此磅礴的帝意涌动，`,
            `几乎抽干了你的仙帝本源！`,
            ``,
            `帝躯龟裂——`,
            `一道道裂痕自眉心蔓延至四肢百骸，`,
            `帝血自裂缝中渗出，尚未滴落，便化作虚无！`,
            ``,
            `「不念，不想……」`,
            ``,
            `这是帝意枯竭的恐怖征兆——`,
            `不念不想，非为悟道空明，`,
            `而是形神将散、`,
            `即将从古史中彻底淡去的濒灭前兆！`,
            ``,
            `你的身影在时间长河中变得模糊，`,
            `诸天万界的伟力不再向你汇聚，`,
            `曾经一念可灭诸天的仙帝——`,
            `此刻连维持自身的存在，都在艰难挣扎！`,
            ``,
            `「映照诸天……」`,
            `「这，便是代价。」`,
            ``,
            `【代价】`,
            `  ◆ 修为 -${bigNumberTransform(COST)} | 血气 -${bigNumberTransform(COST)}`,
            `  ◆ 映照权能封闭 ${cdHours}小时`,
            `  ◆ 修仙状态陷入「不念不想」${bunianMin}分钟`,
            `  ◆ 所有被毁位面：已修复 ✓`,
        ].join('\n'));
    }
    return true;
}

/** 检查映照CD（24小时封闭）*/
async _checkYingZhaoCD(e, caster, cdKey) {
    const cdData = await redis.get(cdKey);
    if (!cdData) return false;
    
    const cd = JSON.parse(cdData);
    const remaining = cd.endTime - Date.now();
    if (remaining <= 0) {
        await redis.del(cdKey);
        return false;
    }
    
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    await e.reply([
        `【映照·权能暂封】`,
        `你曾以帝躯崩裂为代价，`,
        `将永寂之界的亡魂悉数引渡——`,
        `那道映照诸天的帝光，几乎燃尽了你的一切！`,
        ``,
        `如今帝意枯竭，形神尚未稳固，`,
        `若再强行映照——`,
        `恐将从古史中彻底消散，再无归来的可能！`,
        ``,
        `「权能封闭，`,
        `　待帝意重聚之后方可再用。」`,
        ``,
        `剩余封闭时间：${hours}小时${mins}分钟`,
    ].join('\n'));
    return true;
}

/** 简单全服广播（支持境界分层）*/
async _broadcastYingZhaoSimple(type, casterName, targetName, planeName, count = 1, casterLevel = 21) {
    // 读取全局推送群组（优先配置，配置为空时fallback到Redis）
    let groupList = [];
    try {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
        if (notifyGroups.length > 0) {
            groupList = notifyGroups.map(g => String(g));
            logger.info(`[映照广播] 从配置读取群列表: ${groupList.join(', ')}`);
        }
    } catch (e) {
        logger.error('[映照广播] 从配置读取群列表失败，将尝试Redis:', e.message);
    }

    // 配置为空，fallback到Redis拍卖群列表（与EraChangeTask.js一致）
    if (groupList.length === 0) {
        try {
            const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
            const redisGroups = await redis.sMembers(redisGlKey);
            if (redisGroups && redisGroups.length > 0) {
                groupList = redisGroups.map(g => String(g));
                logger.info(`[映照广播] 从Redis读取群列表(fallback): ${groupList.join(', ')}`);
            }
        } catch (e) {
            logger.error('[映照广播] 从Redis读取群列表失败:', e.message);
        }
    }

    if (groupList.length === 0) {
        logger.warn('[映照广播] 群列表为空，无法推送消息！请检查AdminSuper配置或Redis拍卖群列表');
    }

    let msg = '';
    if (type === 'single') {
        msg = [
            `\n══════ 仙帝映照 · 引渡 ══════`,
            ``,
            `${casterName}，立于时光长河之巅，`,
            `伸出那只曾经映照过无数纪元兴衰的手——`,
            ``,
            `「${targetName}……」`,
            `「朕已见汝道果。」`,
            `「归来——！」`,
            ``,
            `永寂之界震颤！${targetName} 的道果归位！`,
            `曾沉眠「${planeName}」的亡魂，重归诸天！`,
        ].join('\n');
    } else if (type === 'plane') {
        msg = [
            `══════ 仙帝映照 · 位面修复 ══════`,
            ``,
            `${casterName} 帝意浩荡，`,
            `映照「${planeName}」的崩灭废墟——`,
            `帝威过处，虚空裂缝弥合，山河大地重组！`,
            ``,
            `「此界，朕一言修复！」`,
            `诡异大祭的创伤被帝辉抹去，`,
            `「${planeName}」崩灭状态解除，修士可再次踏入！`,
        ].join('\n');
    } else if (type === 'all') {
        if (casterLevel >= 23) {
            // 祭道之上广播
            msg = [
                `\n══════════ 万古无声 ══════════`,
                `　　祭道之上 · 映照万界`,
                ``,
                `${casterName}——`,
                `超脱一切时空维度，`,
                `超越一切法则命运！`,
                ``,
                `一念起，永寂之界洞穿！`,
                `${count} 道沉寂的道果，`,
                `在祭道之上的意志中——`,
                `瞬间归位于诸天万界！`,
                ``,
                `█ 被崩灭的位面——`,
                `　在意志降临的刹那，连时间都在倒退！█`,
                `█ 万古诸天，不过一念之间 █`,
                ``,
                `「永寂消弭，万界重生。」`,
            ].join('\n');
        } else if (casterLevel === 22) {
            // 祭道广播
            msg = [
                `\n══════════════════════════`,
                `　　诸天震颤 · 祭道映照`,
                `══════════════════════════`,
                ``,
                `${casterName}立于焚尽大道的至高之处，`,
                `祭道符文燃烧万古诸天！`,
                ``,
                `永寂之界在祭道伟力下剧烈震荡！`,
                `${count} 名修士的道果，`,
                `在焚天之火中重铸道基、自深渊归来！`,
                ``,
                `█ 所有被诡异大祭崩灭的位面——`,
                `　在祭道的意志中重塑重生 █`,
                ``,
                `「焚尽大道者——`,
                `　映照诸天，修复万界，渡尽永寂！」`,
            ].join('\n');
        } else {
            // 仙帝广播（保持原有）
            msg = [
                `\n══════════════════════════`,
                `　　诸天震动 · 仙帝映照`,
                `══════════════════════════`,
                ``,
                `${casterName}立于帝座之巅，`,
                `帝意如日，映照诸天！`,
                ``,
                `永寂之界剧烈震荡！`,
                `${count} 名修士的道果，自永寂之界中归位！`,
                ``,
                `█ 所有被诡异大祭崩灭的位面——`,
                `　在帝意的映照下重获新生 █`,
                ``,
                `「朕以此帝意——`,
                `　映照诸天，修复万界，渡尽永寂！」`,
            ].join('\n');
        }
    }

    if (!msg) return;
    const groups = groupList || [];
    for (const groupId of groups) {
        Bot.pickGroup(groupId).sendMsg(msg).catch(console.error);
    }
}
 
async reshapeLinggen(e) {
   // 群聊限定
   if (!e.isGroup) {
     e.reply('修仙游戏请在群聊中游玩');
     return;
   }
   
   // 获取操作者信息
   const invokerQQ = e.user_id;
   const invoker = await Read_player(invokerQQ);
   const authorityLevel = getRealmAuthorityLevel(invoker);
   
   // 检查操作者境界
   if (authorityLevel < 21) {
     return e.reply("你尚未达到仙帝境界，无法重塑他人灵根！");
   }
   
   // 检查是否有艾特信息
   const atItems = e.message.filter(item => item.type === "at");
   if (atItems.length === 0) {
     return e.reply("请艾特需要重塑灵根的玩家");
   }
   
   // 获取目标玩家QQ
   const targetQQ = atItems[0].qq;
   
   // 处理消息内容：去掉指令前缀和所有艾特
   let content = e.msg.replace(/^#重塑灵根\s*/, '');
   content = content.replace(/$$CQ:at,qq=\d+$$\s*/g, '');
   const linggenName = content.trim();
   
   // 如果没有提取到灵根名称，提示用户输入
   if (!linggenName) {
     return e.reply("请指定要重塑的灵根名称，例如：先天混沌圣体道胎");
   }
   
   // ==== 新增：特殊灵根拦截 ====
   const forbiddenLinggens = [
     "终焉神魔体", 
     "无演无尽者", 
     "圆神", 
     "先天混沌圣体道胎", 
     "如梦本尊"
   ];
   
   if (forbiddenLinggens.includes(linggenName) && authorityLevel < 23) {
     return e.reply([
       `【仙帝伟力·不可重塑】`,
       `${invoker.名号}欲重塑灵根为【${linggenName}】，却感天地法则剧烈震荡！`,
       `「轰隆——」`,
       `诸天万界剧烈震动，时空长河倒卷！`,
       `一股源自大道本源的禁忌之力反噬而来！`,
       `${invoker.名号}仙帝之躯剧烈震颤，嘴角溢出一缕帝血！`,
       `「不可能！这灵根竟引动大道本源反噬！」`,
       `冥冥中，一道贯穿古今的声音在神魂中回响：`,
       `「此等灵根乃大道禁忌，纵使仙帝亦不可强塑！」`,
       `「仙帝也无法达到万能的程度！」`,
       `重塑失败！${invoker.名号}道基受损，需修养三日方能恢复！`
     ].join("\n"));
   }
   // ==== 特殊灵根拦截结束 ====
   
   // 验证目标玩家
   if (!await existplayer(targetQQ)) {
     return e.reply("目标玩家不存在，请先创建角色");
   }
   
   const targetPlayer = await Read_player(targetQQ);
   
   // 查找灵根
   const newLinggen = data.talent_list.find(item => item.name === linggenName);
   if (!newLinggen) {
     return e.reply(`灵根【${linggenName}】不存在！`);
   }
   
   // 记录旧灵根信息
   const oldLinggen = targetPlayer.灵根;
   
   // 更新灵根
   targetPlayer.灵根 = newLinggen;
   targetPlayer.生命本源 = 100+targetPlayer.灵根.生命本源;
    await Write_player(targetQQ, targetPlayer);
    let equipment = await Read_equipment(targetQQ);
    await Write_equipment(targetQQ, equipment);
    await player_efficiency(targetQQ); // 添加await
      
 // 格式化新灵根属性
const formattedLinggen = {
    ...newLinggen,
    eff: `${(newLinggen.eff * 100).toFixed(0)}%`,
    法球倍率: `${(newLinggen.法球倍率 * 100).toFixed(0)}%`,
    攻击加成: `${((newLinggen.攻击 || 0) * 100).toFixed(0)}%`,
    防御加成: `${((newLinggen.防御 || 0) * 100).toFixed(0)}%`,
    生命加成: `${((newLinggen.生命 || 0) * 100).toFixed(0)}%`,
    生命本源: newLinggen.生命本源 || 0
};

// 构建回复消息
const message = [
    `【仙帝伟力·重塑灵根】`,
    `${invoker.名号}施展无上仙帝伟力，重塑${targetPlayer.名号}的灵根！`,
    `旧灵根: ${oldLinggen.name} (${oldLinggen.type})`,
    `新灵根: ${formattedLinggen.name} (${formattedLinggen.type})`,
    `灵根属性:`,
    ` 修炼加成: ${formattedLinggen.eff}`,
    ` 额外增伤: ${formattedLinggen.法球倍率}`,
    ` 攻击加成: ${formattedLinggen.攻击加成}`,
    ` 防御加成: ${formattedLinggen.防御加成}`,
    ` 生命加成: ${formattedLinggen.生命加成}`,
    ` 生命本源: +${formattedLinggen.生命本源}`,
    `${targetPlayer.名号}的灵根已被重塑为【${formattedLinggen.name}】！`
].join("\n");
   
   return e.reply(message);
}

// 推演天机功能
async tuiyanTianji(e) {
  if (!e.isGroup) {
    e.reply('修仙游戏请在群聊中游玩');
    return;
  }
  
  let usr_qq = e.user_id.toString().replace('qg_', '');
  let ifexistplay = await existplayer(usr_qq);
  if (!ifexistplay) {
    e.reply('玩家不存在，请先创建角色');
    return;
  }
  
  let player = await Read_player(usr_qq);
    // 权限检查：只有机器人管理员或修仙管理员可以使用
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  // 检查玩家境界是否足够推演天机
  if (!e.isMaster && !masterList.includes(userQQ) && !hasRealmAuthority(player, 16)) {
    e.reply('你境界不足，无法推演天机！');
    return;
  }
  
  const request = parseTianjiCommand(e.msg);
  if (!request) {
    e.reply([
      '【天机推演·指引】',
      '功法溯源：#推演天机 功法名（消耗2000万修为与2000万血气）',
      '天骄位置：#推演天机 位置 天骄名（消耗2000万修为与2000万血气）',
    ].join('\n'));
    return;
  }
  if (request.type === 'tianjiao') {
    const name = requestNameFrom(e.msg);
    if (!data.weimiantianjiao_list.find(item => item.名号 === name)) {
      e.reply('未找到名为「' + name + '」的天骄。可先查看 #天骄列表 确认名号。');
      return;
    }
  }
  const cost = TIANJI_COSTS[request.type === 'tianjiao' ? '天骄位置' : '功法溯源'];
  if ((player.修为 || 0) < cost.修为 || (player.血气 || 0) < cost.血气) {
    e.reply([
      '【天机推演·道基不足】',
      '本次推演需消耗 ' + cost.修为.toLocaleString() + ' 修为与 ' + cost.血气.toLocaleString() + ' 血气。',
      '当前修为：' + (player.修为 || 0).toLocaleString() + '｜血气：' + (player.血气 || 0).toLocaleString(),
    ].join('\n'));
    return;
  }
  player.修为 -= cost.修为;
  player.血气 -= cost.血气;
  await Write_player(usr_qq, player);

  if (request.type === 'tianjiao') {
    await this.searchTianjiaoPosition(e, player);
    return;
  }

  const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
  const results = searchPlayerGongfa(qq => Read_player(qq), files, request.keyword);
  results.totalChecked = files.length;
  e.reply(formatTianjiSearchResult({ type: 'gongfa', target: request.keyword, results }));
}

  async searchTianjiaoPosition(e, player) {
    const name = requestNameFrom(e.msg);
    const tianjiao = data.weimiantianjiao_list.find(item => item.名号 === name);
    if (!tianjiao) {
      e.reply('未找到名为「' + name + '」的天骄。可先查看 #天骄列表 确认名号。');
      return;
    }
    const known = getKnownTianjiaoTrace(player, tianjiao);
    if (known) {
      e.reply([
        '【天机推演·天骄位置】',
        '你已知晓' + tianjiao.名号 + '的当前位置：' + formatTianjiaoTrace(known),
        '踪迹有效期至 ' + new Date(Number(known.expiresAt)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      ].join('\n'));
      return;
    }
    player.天骄踪迹 ||= {};
    player.天骄踪迹[tianjiao.名号] = createTianjiaoTrace(tianjiao, {
      source: '天机推演',
      now: Date.now(),
    });
    await Write_player(e.user_id.toString().replace('qg_', ''), player);
    const trace = player.天骄踪迹[tianjiao.名号];
    e.reply([
      '【天机推演·天骄位置】',
      '你付出2000万修为与2000万血气，推演出' + tianjiao.名号 + '的踪迹。',
      '当前位置：' + formatTianjiaoTrace(trace),
      '踪迹24小时内有效，抵达后可发送 #讨伐天骄 ' + tianjiao.名号,
    ].join('\n'));
  }

  async tianyi_yidao(e) {
          if (!e.isGroup) {
              e.reply('修仙游戏请在群聊中游玩');
              return;
            }
            let usr_qq = e.user_id.toString().replace('qg_', '');
            let ifexistplay = await existplayer(usr_qq);
            if (!ifexistplay) {
              e.reply('玩家不存在，请先创建角色');
              return;
            }
            let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
            if (game_action == 0) {
              e.reply("修仙：游戏进行中...");
              return;
            }
            let player = await Read_player(usr_qq);
          // 检查玩家mijinglevelid是否大于20
          if (!hasRealmAuthority(player, 21)) {
              e.reply("你并非超越诸天极限的生灵，没有这种伟力");
              return;
          }
          // 所有玩家
          let File = fs.readdirSync(__PATH.player_path);
          File = File.filter(file => file.endsWith(".json"));
          let File_length = File.length;
          let processed = 0;
          for (let i = 0; i < File_length; i++) {
              let this_qq = File[i].replace(".json", '');
              let player = await Read_player(this_qq);
              // 将除mijinglevelid为21以下的全部玩家修为和血气清为0
              if (getRealmAuthorityLevel(player) < 7) {
                  player.血气 = 0;
                  player.修为 = 0;
                  await Write_player(this_qq, player);
          processed++;
    if (processed % 10 === 0) {
        e.reply(`已斩掉 ${processed}/${File_length} 名四极以下玩家的修为与血气...`);
    }
}
          }
          e.reply(`你从永恒未知之地转身，眼眸凝视整片现世诸天，以掌化刀划过虚空，强大的意志和仙帝伟力代表了天意一刀，至高力量针对了无量量宇宙中的修士，他们纷纷修炼体系断裂，修行道基炸开！`);
      }
async ciyujingjie(e) {
        // 境界描述配置
    const realmDescriptions = {
        level: {
            64: `九重天劫·大罗道果！周身混沌气弥漫，体内演化三十六诸天。挥手间星河倒转，一念永恒，此乃大罗金仙极境！`,
            63: `太乙道果！紫气东来三万里，头顶三花聚顶。弹指破灭万古青天，眸光开阖间界海生灭`
        },
        physique: {
            63: `不灭圣体！气血熔炼万界，骨文铭刻诸天法则。一滴血可填瀚海，一根发丝斩断星域`,
            62: `混元霸体！肉身横渡无量劫，细胞演化诸天万界。吐纳间混沌开天，血肉重组天地玄黄`
        }
    };
    // ==== 基础校验 ====
    if (!e.isGroup) return e.reply('需在群聊中使用');
    const atTarget = e.message.find(m => m.type === "at");
    if (!atTarget) return e.reply('请@目标玩家');
    
    const user_qq = e.user_id;
    const targetQQ = atTarget.qq;

    // ==== 权限检查 ====
    const [invoker, target] = await Promise.all([
        Read_player(user_qq),
        Read_player(targetQQ)
    ]);
    const authorityLevel = getRealmAuthorityLevel(invoker);
    if (authorityLevel < 21) {
        return e.reply(`需仙帝境(21重)以上才可赐予境界`);
    }
    if (!target) return e.reply('目标玩家不存在');

    // ==== 指令解析 ====
    const match = e.msg.match(/赐予(练气|炼体)升(\d+)级/);
    if (!match) return e.reply('格式：赐予练气升5级 或 赐予炼体升5级');
    const [_, realmType, levelStr] = match;
    const levelIncrease = parseInt(levelStr);
    if (isNaN(levelIncrease) || levelIncrease <= 0) {
        return e.reply('请输入有效的境界提升级数');
    }

    // ==== 境界参数设置 ====
    const isLevelUp = realmType === '练气';
    const realmKey = isLevelUp ? 'level_id' : 'Physique_id';
    const maxLevel = isLevelUp ? 64 : 63;
    const currentLevel = target[realmKey];
    let newLevel = Math.min(currentLevel + levelIncrease, maxLevel);
    if (newLevel === currentLevel) {
        return e.reply(`目标已达到${realmType}最高境界`);
    }

    // ==== 寿元计算（移除绝灵时代压制） ====
    const getShouyuan = (level) => {
        if (level <= 6) return 3;
        else if (level <= 11) return 10;
        else if (level <= 16) return 20;
        else if (level <= 21) return 50;
        else if (level <= 26) return 100;
        else if (level <= 31) return 200;
        else if (level <= 36) return 500;
        else if (level <= 40) return 1000;
        else if (level == 41) return 1500;
        else if (level <= 44) return (level - 41) * 700 + 1500;
        else if (level <= 52) return (level - 44) * 1000 + 3600;
        else if (level <= 55) return (level - 52) * 1500 + 11600;
        else  if (level == 56) return 20000;
        else  if (level <= 62) return (level - 55) * 3000 + 20000;
        else  if (level == 62) return 100000;
        else  if (level <= 64) return 999999999999;
        return 0;
    };

    // 直接计算新寿元（无压制）
    const newShouyuan = getShouyuan(newLevel);
    const shouyuanAdded = newShouyuan + target.寿元;

    // ==== 执行境界提升 ====
    target[realmKey] = newLevel;
    target.寿元 = newShouyuan;
    if (isLevelUp) {
        target.修为 += levelIncrease * 1000000;
    } else {
        target.血气 += levelIncrease * 1500000;
    }
     let equipment = await Read_equipment(targetQQ);
    // ==== 数据保存 ====
    await Write_player(targetQQ, target);
    await Write_equipment(targetQQ, equipment);
    await Add_HP(targetQQ, 99999999999999);

    // ==== 消息构建 ====
    const realmName = data.Level_list.find(l => l.level_id === newLevel)?.level || '未知境界';
    let invokerAction = '';
    if (authorityLevel >= 23) {
        invokerAction = `\n${invoker.名号}眸光开合间，命运因果时空随之明灭：\n"大道不过泡影，念起则境界生..."`;
    } else if (authorityLevel === 22) {
        invokerAction = `\n${invoker.名号}祭道伟力贯通古今：\n"因果改写，大道重铸！"`;
    } else {
        invokerAction = `\n${invoker.名号}仙帝之威撼动万古：\n"赐汝道果，续写传奇！"`;
    }

    e.reply([
        `▼无上赐予·境界飞升▼`,
        `${realmType}境：${currentLevel} → ${newLevel}重天`,
        `寿元增加：${shouyuanAdded}年`,
        `${invokerAction}`,
        `\n${target.名号}已达${realmName}！`,
        realmDescriptions[isLevelUp ?  'level' : 'Physique'][newLevel] || ''
    ].join('\n'));
}
/**
 * 搜魂大法 - 强行搜索并学习他人功法
 * 玄幻仙侠风格实现：霸道、凶险、有违天和
 */
async soulSearch(e) {
  if (!e.isGroup) {
    e.reply('搜魂大法需在群仙汇聚之所施展，方可借天地之势镇压反噬！');
    return false;
  }

  // 检查是否艾特目标
  const atTarget = e.message.find(item => item.type === "at");
  if (!atTarget) {
    e.reply('搜魂大法需指定目标！\n用法：#搜魂@目标玩家 或 #搜魂并艾特目标');
    return false;
  }

  let executorQQ = e.user_id.toString().replace('qg_', '');
  let targetQQ = atTarget.qq.toString().replace('qg_', '');
  executorQQ = await channel(executorQQ);
  targetQQ = await channel(targetQQ);
  
  // 检查执行者
  const executor = await Read_player(executorQQ);
  if (!executor) {
    e.reply('你尚未踏入修仙之路，无法施展搜魂这等逆天秘术！');
    return false;
  }

  // 检查目标
  const target = await Read_player(targetQQ);
  if (!target) {
    e.reply('目标修士不存在，或已陨落在某个时空节点...');
    return false;
  }
  if (executorQQ === targetQQ) {
    e.reply('搜魂大法无法对自己施展！');
    return false;
  }

  // 秘境斩道、仙古真一或花粉路对标斩道后，均可施展搜魂。
  if (!canUseSoulSearch(executor)) {
    e.reply([
      `【境界不足·道则反噬】`,
      ``,
      `${executor.名号}欲施展搜魂大法，`,
      `刚欲凝聚神识，便感仙台欲裂！`,
      ``,
      `「搜魂之术，逆天而行！」`,
      `需斩道王者、真一境或对应花粉权柄方可承受因果反噬`,
      `当前秘境等级：${executor.mijinglevel_id || 0}（对标权柄：${getRealmAuthorityLevel(executor)}）`,
      `当前仙古等级：${executor.xiangulevel_id || 0}，花粉等级：${executor.huafenlevel_id || 0}`,
      `需达到斩道/真一对标权柄（≥11）`,
      ``,
      `强行施展必遭大道反噬，神魂俱灭！`
    ].join('\n'));
    return false;
  }

  // 检查冷却时间（搜魂大法有伤天和，需间隔24小时）
  const lastSoulSearch = await redis.get(`xiuxian:player:${executorQQ}:last_soul_search`);
  const cooldown = 24 * 60 * 60 * 1000; // 24小时
  const now = Date.now();
  const [executorActionRaw, targetActionRaw] = await Promise.all([
    redis.get(`xiuxian:player:${executorQQ}:action`),
    redis.get(`xiuxian:player:${targetQQ}:action`),
  ]);
  for (const [owner, raw] of [[executor.名号, executorActionRaw], [target.名号, targetActionRaw]]) {
    if (!raw) continue;
    try {
      const action = JSON.parse(raw);
      if (action.heianlaolong === '1' || Number(action.end_time) >= now) {
        e.reply(`${owner}正在${action.action || '进行其他行动'}，无法参与搜魂。`);
        return false;
      }
    } catch {
      // 损坏或过期的行动数据不阻止本次校验。
    }
  }

  const protection = getForbiddenProtection(target, now);
  if (protection.protected) {
    const remainingHours = Math.ceil(protection.waitMs / 3_600_000);
    e.reply(`目标仍受禁忌侵害保护，还需约${remainingHours}小时。`);
    return false;
  }

  const sharedCooldownUntil = Number(await redis.get(forbiddenCooldownKey(executorQQ))) || 0;
  if (sharedCooldownUntil > now) {
    const remainingHours = Math.ceil((sharedCooldownUntil - now) / 3_600_000);
    e.reply(`你发动其他禁术留下的因果尚未消散，还需约${remainingHours}小时。`);
    return false;
  }
  
  if (lastSoulSearch && (now - parseInt(lastSoulSearch)) < cooldown) {
    const remainingHours = Math.ceil((cooldown - (now - parseInt(lastSoulSearch))) / (1000 * 60 * 60));
    e.reply([
      `【搜魂冷却·天道限制】`,
      ``,
      `搜魂大法有伤天和，天地规则降下限制！`,
      `你上次搜魂的因果业力尚未消散，`,
      `需等待 ${remainingHours} 时辰后方可再次施展。`,
      ``,
      `「逆天之术，不可轻用」`
    ].join('\n'));
    return false;
  }

  // 检查目标是否有功法
  if (!target.学习的功法 || target.学习的功法.length === 0) {
    e.reply([
      `【搜魂无果·神魂空洞】`,
      ``,
      `${executor.名号}施展搜魂大法，`,
      `神识如刀，强行撕裂${target.名号}的元神防御！`,
      ``,
      `然而，在其神魂深处，`,
      `你只看到一片虚无...`,
      ``,
      `此人竟未学习任何功法，`,
      `神魂空洞如枯井，搜魂一无所获！`
    ].join('\n'));
    return false;
  }

  // 检查执行者是否已有目标的所有功法
  const targetGongfa = [...target.学习的功法];
  const executorGongfa = executor.学习的功法 ||= [];
  const missingGongfa = targetGongfa.filter(gongfa => !executorGongfa.includes(gongfa));
  const soulSearchProfile = getSoulSearchProfile(executor);
  const availableGongfaSlots = Math.max(0, soulSearchProfile.maxGongfa - executorGongfa.length);
  
  if (missingGongfa.length === 0) {
    e.reply([
      `【搜魂重复·已得真传】`,
      ``,
      `${target.名号}元神中的所有功法，`,
      `你早已融会贯通！`,
      ``,
      `再施展搜魂，只是徒增因果业力罢了。`
    ].join('\n'));
    return false;
  }
  if (availableGongfaSlots === 0) {
    e.reply([
      `【搜魂受限·功法满载】`,
      `${executor.灵根?.name || '当前体质'}最多可承载${soulSearchProfile.maxGongfa}门功法。`,
      `你已掌握${executorGongfa.length}门，无法继续截取新的功法烙印。`
    ].join('\n'));
    return false;
  }

  const sharedCooldownReserved = await redis.set(
    forbiddenCooldownKey(executorQQ),
    String(now + FORBIDDEN_COOLDOWN_MS),
    { EX: Math.ceil(FORBIDDEN_COOLDOWN_MS / 1000), NX: true }
  );
  if (sharedCooldownReserved !== 'OK') {
    e.reply('禁术因果刚被触发，请稍后查看冷却。');
    return false;
  }

  e.reply([
    `【搜魂大法·武力镇压】`,
    ``,
    `${executor.名号}欲强取${target.名号}的元神记忆，`,
    `${target.名号}奋起反抗，唯有先将其击败，方可继续搜魂！`
  ].join('\n'));

  executor.法球倍率 = executor.灵根?.法球倍率 ?? executor.法球倍率 ?? 1;
  target.法球倍率 = target.灵根?.法球倍率 ?? target.法球倍率 ?? 1;
  const battleResult = await zd_battle(executor, target);
  if (Array.isArray(battleResult.msg) && battleResult.msg.length > 0) {
    await ForwardMsg(e, battleResult.msg.slice(0, 35));
    if (battleResult.msg.length > 35) e.reply('战斗过长，仅展示前35条战报。');
  }

  executor.当前血量 = Math.max(0, battleResult.A_hp);
  target.当前血量 = Math.max(0, battleResult.B_hp);
  await Promise.all([
    Write_player(executorQQ, executor),
    Write_player(targetQQ, target),
    redis.set(`xiuxian:player:${executorQQ}:last_soul_search`, now.toString())
  ]);

  if (battleResult.winner !== 'A') {
    e.reply([
      `【搜魂中止·镇压失败】`,
      ``,
      `${executor.名号}未能击败${target.名号}，无法触及其元神！`,
      `本次搜魂已进入冷却。`
    ].join('\n'));
    return false;
  }

  // 施展搜魂大法
  e.reply([
    `【搜魂大法·元神撕裂】`,
    ``,
    `${executor.名号}眸光一冷，杀机毕露！`,
    `虚空震荡，一股阴冷至极的神识波动席卷而出！`,
    ``,
    `"搜魂——！！"`,
    ``,
    `阴风呼啸，鬼哭神嚎！`,
    `这是被天地所不容的禁术！`,
    `神识化作万千利刃，强行撕开${target.名号}的元神防御！`,
    ``,
    `${target.名号}发出凄厉惨叫，七窍流血！`,
    `元神被撕裂的痛苦，比万箭穿心更甚百倍！`,
    ``,
    `天道规则震怒，降下业力反噬...`
  ].join('\n'));

  // 等待3秒增加氛围
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 战斗胜利后进行元神判定，目标境界或元神等级更高时会降低成功率。
  const finalSuccessRate = calculateSoulSearchSuccessRate(executor, target);
  e.reply([
    `【元神判定】`,
    `搜魂成功率：${Math.round(finalSuccessRate * 100)}%`,
    `境界差：${executor.mijinglevel_id - target.mijinglevel_id}｜元神等级差：${(executor.yuanshenlevel_id || 0) - (target.yuanshenlevel_id || 0)}`
  ].join('\n'));
  
  const searchSuccess = Math.random() < finalSuccessRate;
  
  if (!searchSuccess) {
    // 搜魂失败，遭受反噬
    const backlashDamage = executor.当前血量 * 0.3;
    executor.当前血量 -= backlashDamage;
    
    // 业力缠绕
    executor.业力值 = (Number(executor.业力值) || 0) + 100;
    const tribulation = applySoulSearchKarmaTribulation(executor);
    
    await Write_player(executorQQ, executor);
    
    await e.reply([
      `【搜魂失败·业力反噬】`,
      ``,
      `${target.名号}元神中竟有禁制守护！`,
      `或是高人设下，或是天地自动生成...`,
      ``,
      `搜魂之术被强行弹开！`,
      `业力反噬，你损失了${Math.floor(backlashDamage)}点气血！`,
      ``,
      `业力值+100${tribulation.triggered
        ? '，已触发灭世雷劫！'
        : `（当前${tribulation.karma}/${tribulation.karmaThreshold}）`}`
    ].join('\n'));
    if (tribulation.triggered) {
      await e.reply(formatSoulSearchTribulation(executor, tribulation).join('\n'));
    }
    
    return false;
  }

  // 搜魂成功
  const learnedGongfa = pickSoulSearchGongfa(missingGongfa, availableGongfaSlots);
  const learned = new Set(learnedGongfa);
  const failedGongfa = missingGongfa.filter(gongfa => !learned.has(gongfa));
  executor.学习的功法.push(...learnedGongfa);

  // 业力惩罚（搜魂有伤天和）
  executor.业力值 = (Number(executor.业力值) || 0) + 50;
  const tribulation = applySoulSearchKarmaTribulation(executor);
  
  // 目标遭受元神创伤
  target.元神 = Math.max(100000, (target.元神 || 500000) * 0.7);
  adjustDaoHeart(target, -20, '搜魂');
  protectForbiddenTarget(target, Date.now());
  
  await Write_player(executorQQ, executor);
  await Write_player(targetQQ, target);
  
  // 构建结果消息
  const resultLines = [
    `【搜魂成功·记忆掠夺】`,
    ``,
    `${executor.名号}成功撕裂${target.名号}的元神！`,
    `在其破碎的记忆长河中，你看到了无数功法烙印...`,
    ``
  ];

  if (learnedGongfa.length > 0) {
    resultLines.push(`✅ 成功领悟 ${learnedGongfa.length} 门功法：`);
    learnedGongfa.forEach(gongfa => {
      resultLines.push(`  · ${gongfa} - 功法烙印已刻入你的元神`);
    });
    resultLines.push(``);
  }

  if (failedGongfa.length > 0) {
    resultLines.push(`⚠️ 其余 ${failedGongfa.length} 门功法未能截取；单次最多取得两到三门，总上限${soulSearchProfile.maxGongfa}门。`);
    resultLines.push(``);
  }

  resultLines.push(`💀 业力惩罚：业力值+50${tribulation.triggered
    ? '，已触发灭世雷劫'
    : `（当前${tribulation.karma}/${tribulation.karmaThreshold}）`}`);
  resultLines.push(`💀 目标创伤：${target.名号}元神受损，道心蒙尘`);
  resultLines.push(``);
  resultLines.push(`「搜魂之术，虽能速成，却有伤天和」`);
  resultLines.push(tribulation.triggered
    ? `「业力满百，灭世雷劫已至！」`
    : `「业力缠身，满百之时，天罚必至！」`);

  await e.reply(resultLines.join('\n'));
  if (tribulation.triggered) {
    await e.reply(formatSoulSearchTribulation(executor, tribulation).join('\n'));
  }

  return true;
}
async guanding(e) {
    // ==== 基础校验 ====
    if (!e.isGroup) return e.reply('需在群聊中使用');
    
    const atTarget = e.message.find(m => m.type === "at");
    if (!atTarget) return e.reply('请@目标玩家');
    
    const user_qq = e.user_id;
    const targetQQ = atTarget.qq;

    // ==== 权限检查 ====
    const [invoker, target] = await Promise.all([
        Read_player(user_qq),
        Read_player(targetQQ)
    ]);
    const authorityLevel = getRealmAuthorityLevel(invoker);
    
    // 检查操作者境界是否足够
    if (authorityLevel < 23) {
        return e.reply(`需祭道之上(23重)才可灌顶`);
    }
    if (!target) return e.reply('目标玩家不存在');

    // ==== 指令解析 ====
    const match = e.msg.match(/灌顶至(\d+)级/);
    if (!match) return e.reply('格式：灌顶至5级');
    
    const [_, targetLevelStr] = match;
    const targetLevel = parseInt(targetLevelStr);
    
    // 检查目标等级是否有效
    if (isNaN(targetLevel) || targetLevel <= 0 || targetLevel > 24) {
        return e.reply('请输入有效的境界等级(1-24)');
    }

    // ==== 灌顶限制检查 ====
    // 1. 不能超过操作者自身境界
    if (targetLevel > authorityLevel) {
        return e.reply(`无法灌顶至超过自身权柄境界（当前等效为${authorityLevel}重天）`);
    }
    
    // 2. 不能低于目标当前境界
    if (targetLevel <= target.mijinglevel_id) {
        return e.reply(`目标当前已是${target.mijinglevel_id}重天，无需灌顶`);
    }

    // ==== 获取境界配置 ====
    const targetRealm = data.Levelmijing_list.find(l => l.level_id === targetLevel);
    if (!targetRealm) {
        return e.reply('未知境界配置，请联系管理员');
    }

    // ==== 执行灌顶 ====
    const oldLevel = target.mijinglevel_id;
    target.mijinglevel_id = targetLevel;
    
    // 更新基础属性
    target.基础攻击 = targetRealm.基础攻击;
    target.基础防御 = targetRealm.基础防御;
    target.基础血量 = targetRealm.基础血量;
    


     let equipment = await Read_equipment(targetQQ);
    // ==== 数据保存 ====
    await Write_player(targetQQ, target);
    await Write_equipment(targetQQ, equipment);
    await Add_HP(targetQQ, 99999999999999);
    
    // ==== 消息构建 ====
    let invokerAction = '';
    if (authorityLevel >= 23) {
        invokerAction = `\n${invoker.名号}眸光开合间，命运长河为之倒流：\n"今日助你破境，他日共踏仙路！"`;
    } else if (authorityLevel === 22) {
        invokerAction = `\n${invoker.名号}祭道伟力倾泻而下：\n"以我道果，铸你根基！"`;
    } else {
        invokerAction = `\n${invoker.名号}仙帝之威笼罩四方：\n"灌顶传功，助你登天！"`;
    }

    e.reply([
        `▼无上灌顶·境界突破▼`,
        `目标境界：${oldLevel} → ${targetLevel}重天`,
        `当前境界：${targetRealm.level}`,
        `${invokerAction}`,
        `\n${target.名号}已直达${targetRealm.level}！`
    ].join('\n'));
}
async command_zhengdao(e) {
    if (!verc({ e })) return false;
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    

 // 检查自己是否有护道状态（临时状态，允许在已有大帝的情况下证道）
const isProtected = player.护道状态;   // 注意：这个护道状态是轰击天地万道设置的

// 检查当世是否已有大帝（天心印记持有者）
const hasHeavenHeartMark = await this.checkHeavenHeartMark(usr_qq);

// 如果当世已有大帝，且当前玩家没有护道状态，则无法证道
if (hasHeavenHeartMark && !isProtected) {
    e.reply([
        `【天心印记·帝路断绝】`,
        
        `${player.名号}欲证道成帝，却感天地大道压制！`,
        `当世已有大帝存在，天心印记镇压万道！`,
        
        `"一时代只容一帝，此乃天道铁律！"`
    ].join("\n"));
    return false;
}

    
    // 获取时代信息
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    
    // 时代系统配置
    const eraCostRates = [0.75, 0.8, 1.0, 2.0, 3.0];
    const eraDifficultyRates = [0.8, 0.9, 1.0, 1.2, 1.5];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    // 先定义 difficultyRate
    const difficultyRate = eraDifficultyRates[currentEra.index];
    
    // 然后再使用它
    const costRate = eraCostRates[currentEra.index];
    const eraName = eraNames[currentEra.index];
    const eraBoost = difficultyRate; // 使用难度系数作为时代加成
    const costModifier = costRate !== 1.0 ? `(×${costRate})` : "";
    
    // 计算实际需求
    const base_need_exp = Math.pow(2, 15) * 250000;
    const actual_need_exp = applyQuestionFortuneCost(
        player,
        Math.ceil(base_need_exp * costRate)
    );
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_need_exp - player.血气);
    
    // 资源检查
    if (player.修为 < actual_need_exp) {
        e.reply([
            `修为不足以证道成帝！`,
            
            `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
            `基础需求: ${base_need_exp.toLocaleString()}`,
            `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
            `还需修为: ${exp2.toLocaleString()}`
        ].join("\n"));
        return false;
    }
    if (player.血气 < actual_need_exp) {
        e.reply([
            `血气不足以证道成帝！`,
            
            `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
            `基础需求: ${base_need_exp.toLocaleString()}`,
            `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
            `还需血气: ${exp3.toLocaleString()}`
        ].join("\n"));
        return false;
    }
    
    // 境界检查
    if (player.mijinglevel_id < 15) {
        const levelName = data.Levelmijing_list.find(l => l.level_id === player.mijinglevel_id)?.level || "未知境界";
        e.reply([
            `证道成帝需达到准帝九重天！`,
            `你当前的证道体系仅到达 ${levelName}`
        ].join("\n"));
        return false;
    }
    if (player.mijinglevel_id >= 16) {
        e.reply(`你早已成就帝位，不可重复证道`);
        return false;
    }
    
    // 开始证道仪式
    const eraEffectNote = costRate !== 1.0 
        ? `【天道影响】资源消耗${costRate > 1 ? '大幅增加' : '有所减少'}`
        : "";
    
    await e.reply([
        ` 诸天震动！万域共鸣！`,
        `时代背景：${eraName}`,
        eraEffectNote,
        
        `天地众生感应到${player.名号}在宇宙深处证道成帝`,
        `天道降下万道枷锁欲将${player.名号}抹除...`
    ].join("\n"));
    await sleep(2000);
    
    await e.reply(`破碎万道枷锁中...`);
    await sleep(3000);
    await e.reply(` 轰！天道法则崩解，万古时空震颤！`);
    await sleep(1000);
    
    // 大帝意志阵列
    const emperors = [
        { name: "太阳圣皇", desc: "扶桑神树，耀照九天", quote: "帝路茫茫，唯道可证", basePower: 7.5e8 },
        { name: "青帝", desc: "万古青天一株莲", quote: "天道无常，我道永恒", basePower: 8.2e8 },
        { name: "虚空大帝", desc: "虚空无垠，道化万古", quote: "虚空不灭，大道永存", basePower: 8.8e8 },
        { name: "斗战圣皇", desc: "战天斗地，不敬仙神", quote: "战无不胜，攻无不克", basePower: 9.0e8 },
        { name: "狠人大帝", desc: "一念花开，君临天下", quote: "不为成仙，只为在这红尘中等你归来", basePower: 9e8 },
        { name: "无始大帝", desc: "仙路尽头谁为峰，一见无始道成空", quote: "我道成时，天地俯首", basePower: 9.5e8 }

    ];
    

let battleCount = 0;

let battleSuccess = true;
let accumulatedPower = 0; // 积累的天地威能

for (const emperor of emperors) {
    battleCount++;
    
    // 创建大帝虚影（BB_player）
    const BB_player = createEmperorPlayer(
        emperor.name,
        battleCount,
        difficultyRate
    );
     player.当前血量 = player.血量上限;
    await Write_player(usr_qq, player); 
    // 战斗预告
    const prebattleMsg = [
        `第${battleCount}战：${emperor.name}意志降临！`,
        `「${emperor.desc}」`,
        `道音："${emperor.quote}"`,
        `气血：${bigNumberTransform(BB_player.当前血量)} | 攻击：${bigNumberTransform(BB_player.攻击)}`,
        eraBoost > 1 ? `【${eraName}加持】威能提升${(eraBoost-1)*100}%` : ""
    ];
    await e.reply(prebattleMsg.join("\n"));
    await sleep(5000);
    
   
// 修改后
const battleResult = await zd_battle(player, BB_player);
  // 更新玩家血量
        player.当前血量 = battleResult.A_hp;
       
        await ForwardMsg(e, battleResult.msg);
        
     // 处理战斗结果 - 结果解释调整
        if (battleResult.A_hp <= 0) {
            // 玩家战败
            battleSuccess = false;
            
            // 时代惩罚机制
            const penaltyFactor = costRate > 1.0 ? costRate : 1.0;
            const powerLoss = battleCount * emperor.basePower * penaltyFactor;
            const attackLoss = Math.round(powerLoss * 0.4);
            const defenseLoss = Math.round(powerLoss * 0.3);
            const hpLoss = Math.round(powerLoss * 0.3);
            
            player.攻击加成 -= attackLoss;
            player.防御加成 -= defenseLoss;
            player.生命加成 -= hpLoss;
            player.mijinglevel_id = Math.max(1, player.mijinglevel_id - battleCount);
            // 证道失败境界跌落削帝路资格：需重渡破王成帝劫
            revokeBreakKingEmperorEligibility(player, 'mijing');
            
            await Write_player(usr_qq, player);
            
            // 失败结局
            await e.reply([
                `${player.名号}败于${emperor.name}之手！`,
                `证道之路断绝！天道惩罚：`,
                `境界跌落：${player.mijinglevel_id}重天`,
                `攻击损失: ${bigNumberTransform(attackLoss)}`,
                `防御损失: ${bigNumberTransform(defenseLoss)}`,
                `生命损失: ${bigNumberTransform(hpLoss)}`,
                eraName !== "天命时代" ? `【${eraName}天罚】惩罚增强${(penaltyFactor-1)*100}%` : ""
            ].join('\n'));
            
            break; // 终止后续挑战
        } else if (battleResult.B_hp <= 0) {
            // 战胜大帝的奖励
            const powerReward = emperor.basePower * difficultyRate;
            const attackReward = Math.round(powerReward * 0.4);
            const defenseReward = Math.round(powerReward * 0.3);
            const hpReward = Math.round(powerReward * 0.3);
            
            player.攻击加成 += attackReward;
            player.防御加成 += defenseReward;
            player.生命加成 += hpReward;
            accumulatedPower += powerReward;
            
            await Write_player(usr_qq, player);
            
            await e.reply([
                `🏆 ${player.名号}战胜${emperor.name}意志！`,
                `攻击获得: ${bigNumberTransform(attackReward)}`,
                `防御获得: ${bigNumberTransform(defenseReward)}`,
                `生命获得: ${bigNumberTransform(hpReward)}`,
                difficultyRate < 1 ? `【${eraName}馈赠】奖励增强${(1/difficultyRate-1)*100}%` : ""
            ].join('\n'));
            
            if (battleCount < emperors.length) {
                await sleep(3000);
                await e.reply(`⏳ 准备迎战下一位古帝意志...`);
                await sleep(2000);
            }
        }
    }
    
    // 最终证道结果
    if (battleSuccess) {
        // 扣除资源
        player.修为 -= actual_need_exp;
        player.血气 -= actual_need_exp;
        player.mijinglevel_id = 16;
        
        // 生成帝号
        const titleComponents = emperors.map(e => e.name.charAt(0)).join('');
        const divineAppellation = getDivineAppellation();
        player.di_wei = "天帝";
        player.帝号 = `${titleComponents}${divineAppellation}天帝`;
        
        // 最终属性奖励
        const finalPowerBonus = Math.round(accumulatedPower * 2);
        player.攻击加成 += finalPowerBonus;
        player.防御加成 += finalPowerBonus;
        player.生命加成 += finalPowerBonus;
        
        // 新增：授予天心印记
        player.天心印记 = 1;
        
        await Write_player(usr_qq, player);
        // 证道成功结局
        await e.reply([
            `大道共鸣！诸天齐贺！`,
            `${player.名号}成功证道成帝！`,
            `诸天尊号：${player.帝号}`,
            `时代背景：${eraName}`,
            `资源消耗：${actual_need_exp.toLocaleString()} ${costModifier}`,
            `最终属性提升：${bigNumberTransform(finalPowerBonus)}`,
            `【天心印记】`,
            `天道认可，授予天心印记！`,
            `此时代唯你独尊，镇压万道！`,
        ].join("\n"));
    }
    
    return true;
}

// 新增：检查天心印记的方法
async checkHeavenHeartMark(currentQQ) {
    const playerFiles = fs.readdirSync(__PATH.player_path);
    const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
    
    for (const file of jsonFiles) {
        const qq = file.replace(".json", "");
        // 跳过当前玩家
        if (qq === currentQQ) continue;
        
        const player = await Read_player(qq);
        // 检查天心印记是否存在且大于0
        if (player.天心印记 && player.天心印记>0) {
            return true; // 存在其他大帝
        }
    }
    
    return false; // 没有其他大帝
}

    }
function createEmperorPlayer(emperorName, battleNumber, difficultyRate = 1) {
    // 创建B_player对象
    const B_player = {
        名号: `${emperorName}虚影`,
        当前血量: 100000000000, // 200亿血量
        攻击: 100000000000,     // 20亿攻击
        防御: 100000000000,   // 15亿防御
        学习的功法: [],
        灵根: { name: "普通灵根", type: "普通", 法球倍率: 1.0 },
        法球倍率: 1.0,
        血量上限: 100000000000,
        魔道值: 0,
        神石: 0,
        
        dongjie: false,
        mijinglevel_id: 16, // 大帝级.
    };
    
    // 根据大帝名字添加特性和功法
    switch (emperorName) {
        case "太阳圣皇":
            B_player.当前血量 = 40000000000; // 700亿
            B_player.攻击 = 40000000000;     // 20亿
            B_player.防御 = 50000000000;   // 75亿
            B_player.学习的功法.push("扶桑神树守护","太阳真火焚九天","太阳真经", "扶桑神术");
            B_player.灵根 = { name: "太阳神体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 = 1;
            break;
            
        case "青帝":
            B_player.当前血量 = 40000000000; // 150亿
            B_player.攻击 = 30000000000;      // 20亿
            B_player.防御 = 60000000000;    // 75亿
            B_player.学习的功法.push("青莲万法不侵","妖帝九斩","混沌青莲开天", "混沌青莲法");
            B_player.灵根 = { name: "混沌青莲体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 = 1;
            break;
            
        case "虚空大帝":
            B_player.当前血量 = 50000000000; // 700亿
            B_player.攻击 = 35000000000;     // 50亿
            B_player.防御 = 60000000000;   // 75亿
            B_player.学习的功法.push("虚空遁形","虚空经", "虚空永恒放逐","大虚空术");
            B_player.灵根 = { name: "虚空道体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 = 1;
            break;
            
        case "斗战圣皇":
            B_player.当前血量 = 50000000000; // 700亿
            B_player.攻击 = 70000000000;     // 50亿
            B_player.防御 = 50000000000;   // 75亿（修正为7.5e9）
            B_player.学习的功法.push("斗战金身","斗战圣法·葬仙图", "九转天功","斗字秘");
            B_player.灵根 = { name: "斗战圣体", type: "特殊体质", "法球倍率": 3 };
            B_player.法球倍率 = 1;
            break;    

        case "无始大帝":
            B_player.当前血量 = 70000000000; // 700亿
            B_player.攻击 =70000000000;     // 50亿
            B_player.防御 = 70000000000; // 75亿（修正为7.5e9）
            B_player.学习的功法.push("无始钟护体","无始无终","无始经", "时光逆转");
            B_player.灵根 = { name: "先天圣体道胎", type: "特殊体质", "法球倍率": 2 };
            B_player.法球倍率 = 1;
            break;
            
        case "狠人大帝":
            B_player.当前血量 = 80000000000; // 700亿
            B_player.攻击 = 60000000000;     // 50亿
            B_player.防御 = 40000000000;  // 75亿（修正为7.5e9）
            B_player.学习的功法.push("不灭天功", "万化圣诀", "飞仙","一念花开，君临天下");
            B_player.灵根 = { name: "魔胎仙体", type: "特殊体质", "法球倍率": 2 };
            B_player.法球倍率 = 1;
            break;
    }
    
    // 根据战斗次数增强
  const multiplier = 1 + (battleNumber - 1) * 0.2 * difficultyRate;
    B_player.当前血量 = B_player.当前血量 * multiplier;
    B_player.攻击 =B_player.攻击 * multiplier;
    B_player.防御 =B_player.防御 * multiplier;
    B_player.血量上限 = B_player.当前血量; // 设置血量上限
    
    return B_player;
}
// 睡眠函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 辅助函数：获取神圣称谓
function getDivineAppellation() {
    const appellations = ["玄", "昊", "寰", "太初", "道衍", "星穹", "混元", "混沌"];
    return appellations[Math.floor(Math.random() * appellations.length)];
}
// 辅助函数：根据层级获取天资名称
async function getAptitudeNameByLevel(level) {
    const aptitudeLevels = {
        8: "无演无尽",
        7: "万古无双",
        6: "绝世天骄",
        5: "旷世奇才",
        4: "天纵之资",
        3: "超凡资质",
        2: "平庸之资",
        1: "先天不足",
        0: "天弃之人"
    };
    return aptitudeLevels[level] || "未知天资";
}


/**
 * 推送消息，群消息推送群，或者推送私人
 * @param id
 * @param is_group
 * @returns {Promise<void>}
 */
async function pushInfo(id, is_group, msg) {
  if (is_group) {
    await Bot.pickGroup(id)
      .sendMsg(msg)
      .catch(err => {
        Bot.logger.mark(err);
      });
  } else {
    await common.relpyPrivate(id, msg);
  }
}
