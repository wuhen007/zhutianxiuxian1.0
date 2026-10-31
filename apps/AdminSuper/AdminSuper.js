import { hasSuiyunAuthority } from '../../model/suiyunAuthority.js';
import fs from 'fs';
import { plugin, puppeteer, verc, data, Show, config } from '../../api/api.js';
import { AppName } from '../../app.config.js';
import XiuxianData from '../../model/XiuxianData.js';
import {
  existplayer,
  Write_player,
  Read_updata_log,
  Add_najie_thing,
  exist_najie_thing,
  Read_Exchange,
  Write_Exchange,
  get_player_img,
  Read_qinmidu,
  Write_qinmidu,
  Read_najie,
  Write_najie,
  Add_灵石,
  Add_源石,
  Add_纪元积累,
  channel
} from '../../model/xiuxian.js';
import { Read_player, __PATH } from '../../model/xiuxian.js';
import {
  ensureWenXianState,
  activateWenXianLing,
  WENXIAN_DAILY_TASK_TARGET,
} from '../../model/wenxianling.js';
import { deletePlayerDataBundle } from './playerDeletion.js';
import { getDailyTaskDateKey } from '../../model/dailyTask.js';
import { buildUniqueItemRarityMap } from '../../model/najieRaritySync.js';
import { backfillXianguEternalClaims } from '../../model/xianguEternalBackfill.js';
import { reviveFromYongJi } from '../Boss/YongJiList.js';
export class AdminSuper extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_AdminSuper',
      dsc: '修仙设置',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#解封.*$',
          fnc: 'relieve',
        },
        {
  reg: '^#送入轮回(?:@(\\d+))?$',
  fnc: 'sendToRebirth',
},
        {
          reg: '^#解除所有$',
          fnc: 'Allrelieve',
        },
         {
          reg: '^#解除法身$',
          fnc: 'relieveFashanAction',
        },
        {
          reg: '^#打落凡间.*$',
          fnc: 'Knockdown',
        },
        {
          reg: '^#清除冲水堂$',
          fnc: 'Deleteexchange',
        },
        {
          reg: '^#查看日志$',
          fnc: 'show_log',
        },
        {
          reg: '^#解散宗门.*$',
          fnc: 'jiesan_ass',
        },
        {
          reg: '#将米娜桑的纳戒里叫.*的的的(装备|道具|丹药|功法|草药|材料|仙宠|口粮)(抹除|替换为叫.*之之之(装备|道具|丹药|功法|草药|材料|仙宠|口粮))$',
          fnc: 'replaceThing',
        },
        {
          reg: '^#补发等级.*$',
          fnc: 'add_level',
        },
        {
          reg: '^#打入地狱.*$',
          fnc: 'down',
        },
        {
          reg: '^#拆散道侣.*$',
          fnc: 'xiaosan',
        },
        {
          reg: '#开通道法仙术.*$',
          fnc: 'openDaofa',
        },
        {
    reg: '^#打入天牢(?:@(\\d+))?\\s*(\\d+)?$',
    fnc: 'imprisonPlayer'
},
{
    reg: '^#全局推送消息(\\d+)$',
    fnc: 'globalPushMessage'
},
{
    reg: '^#删除全局推送(\\d+)$',
    fnc: 'removeGlobalPush'
},
{
    reg: '^#查看全局推送$',
    fnc: 'viewGlobalPush'
},
{
    reg: '^#设置修仙管理员.*$',
    fnc: 'setMaster'
},
{
    reg: '^#全体纳戒修复字段(.*)$',
    fnc: 'repairAllNajieFields'
},
{
    reg: '^#发拉新奖励([1-4]).*$',
    fnc: 'sendInvitationReward'
},
{
    reg: '^#重置每日任务.*$',
    fnc: 'resetDailyTaskCD'
},
{
    reg: '^#开启问仙令.*$',
    fnc: 'openWenXianLing'
},
{
    reg: '^#补登唯一机缘(\\s*(预览|检测|dry|查询|查看))?$',
    fnc: 'backfillEternalClaims'
},
{
    reg: '^#发放纪元积累.*$',
    fnc: 'grantEpochAccum'
}
      ],
    });
        this.xiuxianData =  XiuxianData; // 移至 super 之后
  }
  // 设置修仙管理员功能
async setMaster(e) {
  // 权限检查：只有机器人管理员或现有修仙管理员可以设置新的管理员
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  if (!e.isMaster && !masterList.includes(userQQ)) {
    return e.reply('你没有权限设置修仙管理员');
  }

  // 解析消息，获取目标用户QQ
  let targetQQ = '';

  // 方法1：优先从消息数组中查找at类型
  if (e.message && Array.isArray(e.message)) {
    const atMsg = e.message.find(item => item.type === 'at');
    if (atMsg && atMsg.qq) {
      targetQQ = atMsg.qq.toString();
    }
  }

  // 方法2：从e.msg中匹配CQ码格式的@用户 
  if (!targetQQ && e.msg) {
    const cqAtMatch = e.msg.match(/\[CQ:at,qq=(\d+)\]/);
    if (cqAtMatch) {
      targetQQ = cqAtMatch[1];
    }
  }
  
  // 方法3：从e.msg中匹配普通@用户格式
  if (!targetQQ && e.msg && e.msg.includes('@')) {
    const atMatch = e.msg.match(/@(\d+)/);
    if (atMatch) {
      targetQQ = atMatch[1];
    }
  }

  // 方法4：从消息中提取QQ号
  if (!targetQQ && e.msg) {
    const qqMatch = e.msg.match(/(\d{5,})/);
    if (qqMatch) {
      targetQQ = qqMatch[1];
    }
  }

  // 调试信息
  console.log('调试 - e.msg:', e.msg);
  console.log('调试 - e.message:', e.message);
  console.log('调试 - 解析出的targetQQ:', targetQQ);

  if (!targetQQ) {
    return e.reply('请指定要设置为管理员的用户格式：#设置修仙管理员@用户 或 #设置修仙管理员 QQ号');
  }

  // 检查目标用户是否已经是管理员
  if (masterList.includes(targetQQ)) {
    return e.reply(`用户 ${targetQQ} 已经是修仙管理员了`);
  }

  try {
    // 使用现有的config对象读取配置
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    
    // 确保Master数组存在
    if (!xiuxianConfig.Master) {
      xiuxianConfig.Master = [];
    }
    
    // 添加新的管理员
    xiuxianConfig.Master.push(targetQQ);
    
    // 使用config对象保存配置
    config.setConfig('xiuxian', 'xiuxian', xiuxianConfig);
    
    e.reply(`成功设置用户 ${targetQQ} 为修仙管理员`);
    
  } catch (error) {
    console.error('设置修仙管理员失败:', error);
    e.reply('设置修仙管理员失败，请检查配置文件权限');
  }
}
async sendToRebirth(e) {
  // 权限检查：只有管理员或修仙管理员可以使用
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  if (!e.isMaster && !masterList.includes(userQQ)) {
    return false;
  }
  
  // 检查是否有艾特信息
  const atItems = e.message.filter(item => item.type === "at");
  if (atItems.length === 0) {
    e.reply('请指定要送入轮回的目标（@某人）');
    return true;
  }

  // 获取目标玩家QQ
  const targetQQ = atItems[0].qq.toString().replace('qg_', '');
  
  // 检查目标玩家是否存在
  if (!await existplayer(targetQQ)) {
    e.reply('目标玩家不存在于诸天万界中');
    return true;
  }

  // 读取目标玩家信息
  const player = await Read_player(targetQQ);
  const player_name = player.名号;
  const group_id = e.group_id || null;
  const admin_name = e.sender.nickname;
  const admin_qq = userQQ;
  
  try {
    // 检查是否已有转世任务
    const existingTask = await redis.get(`xiuxian:zhuanshi_task:${targetQQ}`);
    if (existingTask) {
      const task = JSON.parse(existingTask);
      const remainingTime = task.end_time - Date.now();
      const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
      
      e.reply([
        segment.at(Number(targetQQ)),
        `\n该玩家已在轮回路上！`,
        `剩余时间: ${minutes}分${seconds}秒`
      ].join(''));
      return true;
    }
    
    // 检查重生次数
    let reincarnation_count = await redis.get(`xiuxian:player:${targetQQ}:reCreate_acount`);
    reincarnation_count = parseInt(reincarnation_count) || 0;
    
    if (reincarnation_count >= 15) {
      e.reply([
        segment.at(Number(targetQQ)),
        `\n该玩家灵魂已极度虚弱，无法再次转世！`
      ].join(''));
      return true;
    }
    
    // 创建轮回转世任务（1分钟） - 不包含e对象
    const task = {
      player_qq: targetQQ,
      player_id: targetQQ,
      player_name: player_name,
      player_data: player,
      group_id: group_id,
      // 不要存储e对象，只存储需要的数据
      admin_info: {
        qq: admin_qq,
        name: admin_name,
        time: new Date().toLocaleString()
      },
      start_time: Date.now(),
      end_time: Date.now() + (1 * 60 * 1000), // 1分钟
      acount: reincarnation_count,
      status: '轮回中',
      type: '管理员送入',
      admin: admin_qq
    };
    
    // 存储到Redis，设置2分钟过期以防万一
    await redis.set(`xiuxian:zhuanshi_task:${targetQQ}`, JSON.stringify(task));
    await redis.expire(`xiuxian:zhuanshi_task:${targetQQ}`, 2 * 60);
    
    // 设置行动状态
    await redis.set(`xiuxian:player:${targetQQ}:action`, JSON.stringify({
      type: 'zhuanshi',
      start_time: task.start_time,
      end_time: task.end_time,
      description: '踏上轮回路（管理员送入）',
      status: '轮回中',
      admin: admin_qq
    }));
    
    // 构建消息
    const messages = [
      `【管理员·送入轮回】`,
      `管理员 ${admin_name} 施展天道伟力，`,
      `将 ${player_name} 打入古地府轮回路！`,
      `轮回倒计时：1分钟`,
      `轮回规则：`,
      `- 踏上轮回路，前往古地府`,
      `- 经历阴阳大磨盘考验`,
      `- 30%概率灵魂磨损，变得痴傻`,
      `- 70%概率熬过考验，天资降低一级`,
      `- 斩道王者（秘境11级）、真一境（仙古9级）或圣者境（花粉10级）以上可硬扛阴阳大磨盘`,
      `- 达到上述境界者可使用 #轮回救人 @目标 强闯轮回路救人`,
      `- 大帝、仙古至尊境或花粉天尊境可执掌轮回，裁定所有魂魄是否往生`,
      `- 强制再入仙途`,
      `"轮回之门已开启，前尘往事尽成空..."`
    ];
    
    e.reply([
      segment.at(Number(targetQQ)),
      `\n${messages.join('\n')}`
    ]);
    
    // 记录管理员操作日志
    console.log(`【管理员送入轮回】管理员 ${admin_qq} 将玩家 ${targetQQ} 送入轮回`);
    
    return true;
    
  } catch (err) {
    console.error(`送入轮回指令执行失败:`, err);
    e.reply(`送入轮回失败：${err.message}`);
    return true;
  }
}
      async globalPushMessage(e) {
    // 只有管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    
    // 解析群号
    const match = e.msg.match(/^#全局推送消息(\d+)$/);
    if (!match) {
        e.reply('格式错误，请使用：#全局推送消息群号');
        return true;
    }
    
    const groupId = match[1];
    
    try {
        // 读取配置文件
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        
        // 检查Era配置是否存在
        if (!xiuxianConfig.Era) {
            xiuxianConfig.Era = {};
        }
        
        // 检查notifyGroups是否存在
        if (!xiuxianConfig.Era.notifyGroups) {
            xiuxianConfig.Era.notifyGroups = [];
        }
        
        // 检查群号是否已存在
        if (xiuxianConfig.Era.notifyGroups.includes(groupId)) {
            e.reply(`群号 ${groupId} 已在全局推送列表中`);
            return true;
        }
        
        // 添加群号到notifyGroups
        xiuxianConfig.Era.notifyGroups.push(groupId);
        
        // 保存配置
        config.setConfig('xiuxian', 'xiuxian', xiuxianConfig);
        
        e.reply(`✅ 成功添加群号 ${groupId} 到全局推送列表
当前推送群组：
${xiuxianConfig.Era.notifyGroups.join('\n')}`);
        
        return true;
        
    } catch (error) {
        console.error('配置全局推送消息失败:', error);
        e.reply('配置失败，请检查日志');
        return true;
    }
}

async removeGlobalPush(e) {
    // 只有管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    
    // 解析群号
    const match = e.msg.match(/^#删除全局推送(\d+)$/);
    if (!match) {
        e.reply('格式错误，请使用：#删除全局推送群号');
        return true;
    }
    
    const groupId = match[1];
    
    try {
        // 读取配置文件
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        
        // 检查Era配置和notifyGroups是否存在
        if (!xiuxianConfig.Era || !xiuxianConfig.Era.notifyGroups) {
            e.reply('当前没有配置任何全局推送群组');
            return true;
        }
        
        // 检查群号是否存在
        const index = xiuxianConfig.Era.notifyGroups.indexOf(groupId);
        if (index === -1) {
            e.reply(`群号 ${groupId} 不在全局推送列表中`);
            return true;
        }
        
        // 从数组中移除群号
        xiuxianConfig.Era.notifyGroups.splice(index, 1);
        
        // 保存配置
        config.setConfig('xiuxian', 'xiuxian', xiuxianConfig);
        
        e.reply(`✅ 成功从全局推送列表中移除群号 ${groupId}
当前推送群组：
${xiuxianConfig.Era.notifyGroups.length > 0 ? xiuxianConfig.Era.notifyGroups.join('\n') : '暂无群组'}`);
        
        return true;
        
    } catch (error) {
        console.error('删除全局推送消息失败:', error);
        e.reply('删除失败，请检查日志');
        return true;
    }
}

async viewGlobalPush(e) {
    // 只有管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    
    try {
        // 读取配置文件
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        
        // 检查Era配置和notifyGroups是否存在
        if (!xiuxianConfig.Era || !xiuxianConfig.Era.notifyGroups) {
            e.reply('当前没有配置任何全局推送群组');
            return true;
        }
        
        const notifyGroups = xiuxianConfig.Era.notifyGroups;
        
        if (notifyGroups.length === 0) {
            e.reply('📋 全局推送群组列表：暂无群组使用 #全局推送消息群号 来添加群组');
            return true;
        }
        
        let message = '📋 全局推送群组列表：';
        notifyGroups.forEach((groupId, index) => {
            message += `${index + 1}. 群号: ${groupId}`;
        });
        
        message += `共 ${notifyGroups.length} 个群组`;
        message += `使用指令：`;
        message += `• #全局推送消息群号 - 添加群组`;
        message += `• #删除全局推送群号 - 删除群组`;
        
        e.reply(message);
        return true;
        
    } catch (error) {
        console.error('查看全局推送消息失败:', error);
        e.reply('查看失败，请检查日志');
        return true;
    }
}
    async imprisonPlayer(e) {
    // 群聊限定
    if (!e.isGroup) {
        e.reply('请在群聊中使用此管理指令');
        return true;
    }
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    // 检查是否有艾特信息
    const atItems = e.message.filter(item => item.type === "at");
    if (atItems.length === 0) {
        e.reply('请指定要打入天牢的目标（@某人）');
        return true;
    }

    // 获取目标玩家QQ
    const targetQQ = atItems[0].qq.toString().replace('qg_', '');
    
    // 解析禁闭时间（分钟）
    const match = e.msg.match(/#打入天牢(?:\s*@\d+)?\s*(\d+)?/);
    const minutes = match && match[1] ? parseInt(match[1]) : 120; // 默认120分钟
    
    // 检查目标玩家是否存在
    if (!await existplayer(targetQQ)) {
        e.reply('目标玩家不存在于诸天万界中');
        return true;
    }

    // 读取目标玩家信息
    const target = await Read_player(targetQQ);
    
    // 执行打入天牢
    if (hasSuiyunAuthority(target, '理想')) return e.reply('【理想】捷克罗姆守护此身，天牢锁链已碎。');
    await this.setPlayerToPrison(targetQQ, minutes);
    
    // 构建天牢文案
    const messages = [
        `⚖️【天道审判·打入天牢】⚖️`,
        `管理员 ${e.sender.nickname} 施展天道伟力，`,
        `将 ${target.名号} 打入万仙盟天牢！`,
        `天牢位置：九幽之地第十八层`,
        `禁闭时间：${minutes}分钟`,
        `天牢特性：`,
        `- 修为增长停滞`,
        `- 无法进行任何修炼活动`,
        `- 无法参与秘境探索`,
        `- 无法使用任何道具`,
        `"天道昭昭，疏而不漏！"`
    ];
    
    e.reply(messages.join('\n'));
    return true;
}

/** 将玩家打入天牢 */
async setPlayerToPrison(targetQQ, minutes) {
    // 计算结束时间（毫秒）
    const action_time = minutes * 60 * 1000; // 分钟转毫秒
    const end_time = new Date().getTime() + action_time;
    
    // 设置天牢状态
    const prisonData = {
        action: '天牢',
        start_time: new Date().toLocaleString(),
        end_time: end_time,
        duration: minutes
    };
    
    // 保存到Redis
    await redis.set(`xiuxian:player:${targetQQ}:action`, JSON.stringify(prisonData));
    
    // 记录到玩家数据
    const player = await Read_player(targetQQ);
    player.禁闭记录 = player.禁闭记录 || [];
    player.禁闭记录.push({
        时间: new Date().toLocaleString(),
        时长: `${minutes}分钟`,
        执行者: '管理员'
    });
    await Write_player(targetQQ, player);
}
  
  async openDaofa(e) {
       const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    let nowTime = new Date().getTime();

    // 获取@的玩家QQ
    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) {
      e.reply('请@需要开通的玩家');
      return false;
    }
    const qq = atItem.qq;
    let player =await Read_player(qq)
    // 调用道法仙术开通方法
    const result =  this.xiuxianData.openDaofaForPlayer(qq);
    
      e.reply(`开通成功!【道法仙术】有效天数增加30天！`);
      return true;
    
  
}

  async ktgjdfxt(e) {
     const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
   let nowtime = new Date().getTime();
  let isat = e.message.some(item => item.type === 'at');
  if (!isat) return;

  let atItem = e.message.filter(item => item.type === 'at');
  let usr_qq = atItem[0].qq;
  
  if (!data.existData("player", usr_qq)) return;
  
  let player = await Read_player(usr_qq);
  player.daofaxianshu = 2;
let daofaxianshu_endtime = 2592000000; // 30天的毫秒数
if (Number(player.daofaxianshu_endtime) < nowtime) {
    player.daofaxianshu_endtime = daofaxianshu_endtime + nowtime;
} else {
    player.daofaxianshu_endtime += daofaxianshu_endtime;
}
// 计算剩余天数（相对于当前时间）
let remainingMilliseconds = player.daofaxianshu_endtime - nowtime;
let remainingDays = remainingMilliseconds / 86400000;
// 保留一位小数
remainingDays = Math.round(remainingDays * 10) / 10;

player.daofa = `已开启，当前剩余${remainingDays}天`;
  
  await Write_player(usr_qq, player);
  e.reply("开通成功!【道法仙术】的有效天数直接增加30天");
  return;
}
  
  async xiaosan(e){
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    let A = e.user_id.toString().replace('qg_','');
    A = await channel(A);
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    let atItem = e.message.filter(item => item.type === 'at');
    let B = atItem[0].qq.replace('qg_','');
    B=await channel(B)
    let i = await found(A, B);
    let qinmidu;
    try {
      qinmidu = await Read_qinmidu();
    } catch {
      //没有建立一个
      await Write_qinmidu([]);
      qinmidu = await Read_qinmidu();
    }

    if (i != qinmidu.length) {

        qinmidu[i].婚姻 = 0;
        await Write_qinmidu(qinmidu)
        e.reply("拆散成功")
    }
  }


  async down(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return false;
    }
    if (!verc({ e })) return false;

    const atItem = e.message?.find(item => item.type === 'at');
    if (!atItem?.qq) {
      await e.reply('请使用 #打入地狱 @玩家 指定要清除的存档');
      return false;
    }

    const rawTarget = String(atItem.qq).replace('qg_', '');
    const qq = String(await channel(rawTarget)).replace('qg_', '');

    try {
      const result = deletePlayerDataBundle({
        playerId: qq,
        paths: __PATH,
        smallWorlds: data.xiaoshijie ?? [],
        smallWorldFile: `${data.lib_path}/小世界列表.json`,
      });

      data.xiaoshijie = result.remainingSmallWorlds;
      const removed = [...result.removedFiles];
      if (result.removedSmallWorlds > 0) {
        removed.push(`小世界×${result.removedSmallWorlds}`);
      }

      if (removed.length === 0) {
        await e.reply(`未找到玩家 ${qq} 的任何可清除数据`);
        return false;
      }

      const missingText = result.missingFiles.length > 0
        ? `\n原本不存在：${result.missingFiles.join('、')}`
        : '';
      await e.reply(
        `【打入地狱】\n玩家：${qq}\n已彻底抹除：${removed.join('、')}${missingText}`
      );
    } catch (error) {
      console.error(`[打入地狱] 清除玩家 ${qq} 失败`, error);
      await e.reply(`玩家 ${qq} 删档失败，已尝试回滚全部改动，请查看后台日志`);
    }
    return false;
  }
  async add_level(e){
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let qq = atItem[0].qq.replace('qg_','');
    qq=await channel(qq)
    // 永寂玩家正式存档已清除，先从永寂备份中解除并恢复
    const yongjiRevived = await reviveFromYongJi(qq);
    if (yongjiRevived.success) {
      e.reply(`已解除！\n已将${yongjiRevived.playerName}从永寂中唤回，现世存档已恢复。`);
      return true;
    }
    //检查存档
    let ifexistplay = await existplayer(qq);
    if (!ifexistplay) return false;
    let level = parseInt(e.msg.replace('#补发等级', ''));
    
    let player=await Read_player(qq)
    player.occupation_level+=level
    await Write_player(qq,player)
    player=await Read_player(qq)
    e.reply("补发"+level+"级成功,当前为"+player.occupation+player.occupation_level+"级")
  }
  async jiesan_ass(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    let didian = e.msg.replace('#解散宗门', '');
    didian = didian.trim();
    let ass = data.getAssociation(didian);
    if (ass == 'error') {
      e.reply('该宗门不存在');
      return false;
    }
    for (let qq of ass.所有成员) {
      let player = await data.getData('player', qq);
      if (player.宗门) {
        if (player.宗门.宗门名称 == didian) {
          delete player.宗门;
          await Write_player(qq, player);
        }
      }
    }
    fs.rmSync(`${data.filePathMap.association}/${didian}.json`);
    e.reply('解散成功!');
    return false;
  }
  async show_log(e) {
    if (!verc({ e })) return false;
    let j;
    const reader = await Read_updata_log();
    let str = [];
    let line_log = reader.trim().split('\n'); //读取数据并按行分割
    line_log.forEach((item, index) => {
      // 删除空项
      if (!item) {
        line_log.splice(index, 1);
      }
    });
    for (let y = 0; y < line_log.length; y++) {
      let temp = line_log[y].trim().split(/\s+/); //读取数据并按空格分割
      let i = 0;
      if (temp.length == 4) {
        str.push(temp[0]);
        i = 1;
      }
      let t = '';
      for (let x = i; x < temp.length; x++) {
        t += temp[x];
        //console.log(t)
        if (x == temp.length - 2 || x == temp.length - 3) {
          t += '\t';
        }
      }
      str.push(t);
      //str += "\n";
    }
    let T;
    for (j = 0; j < str.length / 2; j++) {
      T = str[j];
      str[j] = str[str.length - 1 - j];
      str[str.length - 1 - j] = T;
    }
    for (j = str.length - 1; j > -1; j--) {
      if (str[j] == '零' || str[j] == '打铁的') {
        let m = j;
        while (str[m - 1] != '零' && str[m - 1] != '打铁的' && m > 0) {
          T = str[m];
          str[m] = str[m - 1];
          str[m - 1] = T;
          m--;
        }
      }
    }
    let log_data = {
      // 数组会被模板按 JSON 渲染，出现 ["、"] 和一堆引号；先拼成逗号分隔的字符串
      log: Array.isArray(str) ? str.join(',') : str,
    };
    const data1 = await new Show(e).get_logData(log_data);
    let img = await puppeteer.screenshot('log', {
      ...data1,
    });
    e.reply(img);
    return false;
  }

  async Deleteexchange(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    e.reply('开始清除！');
    let Exchange;
    try {
      Exchange = await Read_Exchange();
    } catch {
      //没有表要先建立一个！
      await Write_Exchange([]);
      Exchange = await Read_Exchange();
    }
    for (let i of Exchange) {
      let usr_qq = i.qq;
      let thing = i.name.name;
      let quanity = i.aconut;
      if (i.name.class == '装备' || i.name.class == '仙宠') thing = i.name;
      await Add_najie_thing(usr_qq, thing, i.name.class, quanity, i.name.pinji);
    }
    await Write_Exchange([]);
    e.reply('清除完成！');
    return false;
  }

  //#我的信息
  async Show_player(e) {
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    if (!e.isGroup) {
      e.reply('此功能暂时不开放私聊');
      return false;
    }
    let img = await get_player_img(e);
    e.reply(img);
    return false;
  }

  async Allrelieve(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    e.reply('开始行动！');
    let playerList = [];
    let files = fs
      .readdirSync('./plugins/' + AppName + '/resources/data/xiuxian_player')
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      //清除游戏状态
      await redis.set('xiuxian:player:' + player_id + ':game_action', 1);
      let action = await redis.get('xiuxian:player:' + player_id + ':action');
      action = JSON.parse(action);
      //不为空，存在动作
      if (action != null) {
        await redis.del('xiuxian:player:' + player_id + ':action');
        let arr = action;
        arr.is_jiesuan = 1; //结算状态
        arr.shutup = 1; //闭关状态
        arr.working = 1; //降妖状态
        arr.power_up = 1; //渡劫状态
        arr.Place_action = 1; //秘境
        arr.Place_actionplus = 1; //沉迷状态
        arr.end_time = new Date().getTime(); //结束的时间也修改为当前时间
        delete arr.group_id; //结算完去除group_id
        await redis.set(
          'xiuxian:player:' + player_id + ':action',
          JSON.stringify(arr)
        );
      }
      // 清除时间长河（古史节点）锁定
      await this.relieveTimeRiverLock(player_id);
    }
    e.reply('行动结束！');
  }
async relieveFashanAction(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    
    if (!verc({ e })) return false;
    
    e.reply('开始解除法身行动状态...');
    
    // 获取所有玩家列表
    let playerList = [];
    const files = fs
        .readdirSync('./plugins/' + AppName + '/resources/data/xiuxian_player')
        .filter(file => file.endsWith('.json'));
    
    for (let file of files) {
        playerList.push(file.replace('.json', ''));
    }
    
    let relievedCount = 0;
    
    for (let player_id of playerList) {
        // 获取法身行动状态
        const fashanActionKey = 'xiuxian:player:' + player_id + ':action:fashan';
        const fashanAction = await redis.get(fashanActionKey);
        
        if (fashanAction) {
            // 解析法身行动数据
            let actionData = JSON.parse(fashanAction);
            
            // 添加解除记录
            actionData.relieved_time = new Date().getTime();
            actionData.relieved_by = e.user_id;
            
            // 保存解除记录
            await redis.set(fashanActionKey, JSON.stringify(actionData));
            
            // 删除法身行动状态
            await redis.del(fashanActionKey);
            
            // 获取玩家信息
            const player = await Read_player(player_id);
            
            // 添加解除日志
            const log = {
                time: new Date().getTime(),
                action: '解除法身行动',
                relieved_by: e.user_id,
                fashan_type: actionData.fashan_type || '未知'
            };
            
            // 保存玩家日志
            if (!player.action_logs) player.action_logs = [];
            player.action_logs.push(log);
            await Write_player(player_id, player);
            
            relievedCount++;
        }
    }
    
    // 构建结果消息
    let resultMsg = `法身行动解除完成！`;
    resultMsg += `\n共解除 ${relievedCount} 名玩家的法身行动状态`;
    
    if (relievedCount > 0) {
        resultMsg += `\n\n【解除详情】`;
        resultMsg += `\n管理员：${e.user_id}`;
        resultMsg += `\n时间：${new Date().toLocaleString('zh-CN')}`;
    }
    
    e.reply(resultMsg);
    return true;
}
  async relieve(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let qq = atItem[0].qq;
    qq=qq.toString().replace('qg_','')
    qq=await channel(qq)
    //检查存档
    let ifexistplay = await existplayer(qq);
    if (!ifexistplay) return false;
    //清除游戏状态
    await redis.set('xiuxian:player:' + qq + ':game_action', 1);
    //查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + qq + ':action');
    action = JSON.parse(action);
    let relieved = false;
    //不为空，有状态
    if (action != null) {
      //把状态都关了
      let arr = action;
      arr.is_jiesuan = 1; //结算状态
      arr.shutup = 1; //闭关状态
      arr.working = 1; //降妖状态
      arr.power_up = 1; //渡劫状态
      arr.Place_action = 1; //秘境
      arr.Place_actionplus = 1; //沉迷状态
      arr.end_time = new Date().getTime(); //结束的时间也修改为当前时间
      delete arr.group_id; //结算完去除group_id
      await redis.set('xiuxian:player:' + qq + ':action', JSON.stringify(arr));
      relieved = true;
    }
    //清除时间长河（古史节点）锁定：真身已被古史节点锁定
    const trCleared = await this.relieveTimeRiverLock(qq);
    if (relieved || trCleared) {
      let msg = '已解除！';
      if (trCleared) msg += '\n已清除该玩家的时间长河状态（古史节点锁定已释放，可正常退出队伍）。';
      e.reply(msg);
      return false;
    }
    e.reply('不需要解除！');
    return false;
  }

  // 清除指定玩家的时间长河（古史节点）锁定状态
  async relieveTimeRiverLock(qq) {
    try {
      let cleared = false;
      // 清除个人探索结束时间戳
      if (await redis.del('xiuxian:time_river:end_time:' + qq)) cleared = true;
      // 定位所在队伍
      const teamId = await redis.get('xiuxian:time_river:player_team:' + qq);
      if (teamId) {
        const raw = await redis.get('xiuxian:time_river:team:' + teamId);
        if (raw) {
          const team = JSON.parse(raw);
          if (team.status === 'exploring') {
            team.status = 'recruiting'; // 释放古史节点锚定
            delete team.startedAt;
            await redis.set('xiuxian:time_river:team:' + team.id, JSON.stringify(team), 'EX', 24 * 60 * 60);
            cleared = true;
          }
        }
      }
      return cleared;
    } catch {
      return false;
    }
  }

  async Knockdown(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    if (!verc({ e })) return false;
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) return false;
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let qq = atItem[0].qq.replace('qg_','');
    qq=await channel(qq)
    //检查存档
    let ifexistplay = await existplayer(qq);
    if (!ifexistplay) {
      e.reply('没存档你打个锤子！');
      return false;
    }
    let player = await Read_player(qq);
    player.power_place = 0;
    e.reply('已打落凡间！');
    await Write_player(qq, player);
    return false;
  }

  async replaceThing(e) {
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        return false;
    }
    const msg1 = e.msg.replace('#将米娜桑的纳戒里叫', '');
    const [thingName, msg2] = msg1.split('的的的');

    // #将米娜桑的纳戒里叫.*的的的(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材)(抹除|替换为叫.*之之之(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材))$
    if (e.msg.endsWith('抹除')) {
      const thingType = msg2.replace(/抹除$/, '');
      if (!thingName || !thingType)
        return e.reply(
          '格式错误，正确格式范例：#将米娜桑的纳戒里叫1w的的的道具替换为叫1k之之之道具'
        );
      await clearNajieThing(thingType, thingName);
      return e.reply('全部抹除完成');
    }

    // 替换为
    const N = 1; // 倍数
    const [thingType, msg3] = msg2.split('替换为叫');
    const [newThingName, newThingType] = msg3.split('之之之');
    const objArr = await clearNajieThing(thingType, thingName);
    objArr.map(uid_tnum => {
      const usrId = Object.entries(uid_tnum)[0][0];
      Add_najie_thing(usrId, newThingName, newThingType, uid_tnum.usrId * N);
    });
    return e.reply('全部替换完成');
  }


  // ============ 全体纳戒字段修复 ============
  // 指令：#全体纳戒修复字段          -> 执行修复（写盘前自动备份）
  //       #全体纳戒修复字段 预览/检测 -> 仅统计，不写盘
  async repairAllNajieFields(e) {
    // 仅机器人管理员或修仙管理员可用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return false;
    }
    if (!verc({ e })) return false;

    const msg = (e.msg || '');
    const isPreview = /(预览|检测|dry|查询|查看)/.test(msg);

    const najieDir = './plugins/' + AppName + '/resources/data/xiuxian_najie';
    if (!fs.existsSync(najieDir)) {
      return e.reply('未找到纳戒数据目录');
    }
    const files = fs.readdirSync(najieDir).filter(f => f.endsWith('.json'));

    // 标准类别：数组名 === 物品 class（与 exist_najie_thing 的 type 列表一致）
    const CATEGORIES = [
      '装备', '丹药', '道具', '功法', '草药',
      '食材', '盒子', '材料', '仙宠', '仙宠口粮', '宝石'
    ];

    // 构建 名称 -> 唯一正确类别 的权威映射（来自主物品表）
    const nameClassMap = this._buildNajieNameClassMap();
    const nameRarityMap = this._buildNajieRarityMap();

    // 备份目录（写盘前统一备份，便于回滚）
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = 'najie_repair_' + ts;
    const backupDir = './plugins/' + AppName + '/_backups/' + backupName;
    let backupMade = false;

    let scanCount = 0;      // 扫描玩家数
    let playerFixed = 0;    // 有修复的玩家数
    let classFixed = 0;     // class 字段修正数
    let movedCount = 0;     // 错放归位数
    let mergedCount = 0;    // 归位时同数组同名合并数
    let fieldFixed = 0;     // 关联字段（数量/锁定/售价）修正数
    let missingArrFixed = 0; // 缺失数组补齐数
    let renamedCount = 0;     // 历史物品更名数
    let rarityFixed = 0;      // 按标准物品表同步稀有度
    const samples = [];     // 预览样本

    for (const file of files) {
      const usrId = file.replace('.json', '');
      const filePath = najieDir + '/' + file;
      let raw;
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      let najie;
      try {
        najie = JSON.parse(raw);
      } catch {
        // 损坏文件跳过，避免二次伤害
        continue;
      }
      if (!najie || typeof najie !== 'object') continue;

      scanCount++;
      let playerChanged = false;
      const log = [];

      try {
        // 1. 补齐缺失的标准类别数组
        for (const cat of CATEGORIES) {
          if (!Array.isArray(najie[cat])) {
            najie[cat] = [];
            missingArrFixed++;
            playerChanged = true;
            log.push('补齐缺失数组[' + cat + ']');
          }
        }

        // 2. 重建类别数组：对齐 class + 安全归位
        const rebuilt = {};
        for (const cat of CATEGORIES) rebuilt[cat] = [];

        for (const cat of CATEGORIES) {
          if (!Array.isArray(najie[cat])) continue;
          for (const item of najie[cat]) {
            if (!item || typeof item !== 'object') continue;
            // 历史物品名称迁移：雷劫液经重名冲突整改，按原类别分流
            // 道具版(渡劫圣物)→雷池真液；丹药版(天药)→雷帝道液，避免旧库存变死物品
            if (item.name === '雷劫液') {
              const newName = (item.class === '丹药') ? '雷帝道液' : '雷池真液';
              item.name = newName;
              renamedCount++;
              playerChanged = true;
              if (log.length < 8) log.push('更名[雷劫液]→' + newName);
            }
            const name = item.name;
            let target = cat;

            // 判定物品真正的类别（信任优先级：主表唯一类别 > 物品自身 class > 所在数组）
            // 说明：很多“放错分类”的物品，其 class 字段在生成时已被主表正确赋值，
            // 只是被塞进了错误的数组（如 class=材料 却躺在 道具 数组），故 class 比数组更可靠。
            const c = name ? nameClassMap.get(name) : undefined;
            if (c && CATEGORIES.includes(c)) {
              target = c; // 主表能唯一确定，最权威
            } else if (item.class && CATEGORIES.includes(item.class)) {
              target = item.class; // 主表无记录时，信任物品自带 class
            } else {
              target = cat; // 都无法确定，则对齐到所在数组
            }

            // 修正 class 字段（与真正类别一致）
            if (item.class !== target) {
              item.class = target;
              classFixed++;
              playerChanged = true;
            }
            // 放错分类：真正类别与所在数组不符 → 归位
            if (target !== cat) {
              movedCount++;
              playerChanged = true;
              if (log.length < 8) log.push('归位[' + (name || '?') + '] ' + cat + '→' + target);
            }

            const standardRarity = name ? nameRarityMap.get(name) : undefined;
            if (typeof standardRarity !== 'undefined' && item.稀有度 !== standardRarity) {
              const old = item.稀有度;
              item.稀有度 = standardRarity;
              rarityFixed++;
              playerChanged = true;
              if (log.length < 8) log.push('稀有度[' + name + ']=' + (old ?? '缺失') + '→' + standardRarity);
            }

            // 关联字段卫生
            // 数量：必须为正整数（兼容字符串数字，如 "12"）
            let q = item.数量;
            if (typeof q === 'string') q = Number(q);
            if (typeof q !== 'number' || !isFinite(q) || q <= 0) {
              const old = item.数量;
              item.数量 = 1;
              fieldFixed++;
              playerChanged = true;
              if (log.length < 8 && typeof old !== 'undefined') log.push('数量修正[' + (name || '?') + ']=' + old + '→1');
            } else {
              const f = Math.floor(q);
              if (f !== q) {
                item.数量 = f;
                fieldFixed++;
                playerChanged = true;
              } else {
                item.数量 = q; // 字符串数字落为数字
              }
            }
            // 锁定标记：仅 0/1
            if (item.islockd !== 0 && item.islockd !== 1) {
              item.islockd = 0;
              fieldFixed++;
              playerChanged = true;
            }
            // 售价：必须为有限数字（兼容字符串数字）
            let price = item.出售价;
            if (typeof price === 'string') price = Number(price);
            if (typeof price !== 'number' || !isFinite(price)) {
              item.出售价 = 0;
              fieldFixed++;
              playerChanged = true;
            } else {
              item.出售价 = price;
            }

            // 落点去重：同数组同名（装备需同品级）则合并数量，杜绝重复
            const existIdx = rebuilt[target].findIndex(x =>
              x && x.name === name && (target !== '装备' || x.pinji === item.pinji)
            );
            if (existIdx >= 0) {
              rebuilt[target][existIdx].数量 = (rebuilt[target][existIdx].数量 || 0) + (item.数量 || 0);
              mergedCount++;
            } else {
              rebuilt[target].push(item);
            }
          }
        }

        // 3. 组装结果：保留非类别元数据 + 未知数组原样保留 + 标准数组用重建结果
        const result = {};
        for (const k of Object.keys(najie)) {
          if (CATEGORIES.includes(k)) continue;
          result[k] = najie[k];
        }
        for (const cat of CATEGORIES) result[cat] = rebuilt[cat];

        if (playerChanged) {
          playerFixed++;
          if (isPreview) {
            if (samples.length < 15) samples.push({ usrId, log: log.slice(0, 6) });
          } else {
            try {
              if (!backupMade) {
                fs.mkdirSync(backupDir, { recursive: true });
                backupMade = true;
              }
              fs.copyFileSync(filePath, backupDir + '/' + file);
            } catch (_) { /* 备份失败不影响修复 */ }
            fs.writeFileSync(filePath, JSON.stringify(result, '', '\t'), 'utf8');
          }
        }
      } catch (err) {
        console.error('[全体纳戒修复字段] 处理 ' + usrId + ' 失败:', err);
      }
    }

    // 汇总
    let out = '【全体纳戒字段修复】' + (isPreview ? '预览/检测模式（未写入）' : '已执行修复') + '\n';
    out += '扫描玩家：' + scanCount + ' 人\n';
    out += '需修复玩家：' + playerFixed + ' 人\n';
    if (!isPreview) {
      out += 'class 修正：' + classFixed + ' 处\n';
      out += '错放归位：' + movedCount + ' 件（同名合并 ' + mergedCount + ' 次）\n';
      out += '关联字段修正（数量/锁定/售价）：' + fieldFixed + ' 处\n';
      out += '稀有度同步：' + rarityFixed + ' 处\n';
      out += '缺失数组补齐：' + missingArrFixed + ' 处\n';
      if (backupMade) out += '备份目录：_backups/' + backupName + '\n';
    } else {
      out += '预计 class 修正：' + classFixed + ' 处\n';
      out += '预计错放归位：' + movedCount + ' 件（同名合并 ' + mergedCount + ' 次）\n';
      out += '预计关联字段修正：' + fieldFixed + ' 处\n';
      out += '预计稀有度同步：' + rarityFixed + ' 处\n';
      out += '预计缺失数组补齐：' + missingArrFixed + ' 处\n';
    }
    if (renamedCount > 0) out += '物品更名：' + renamedCount + ' 处（雷劫液→雷池真液/雷帝道液）\n';
    if (isPreview && samples.length) {
      out += '\n— 样本 —\n';
      for (const s of samples) {
        out += '[' + s.usrId + '] ' + (s.log.length ? s.log.join('；') : '字段微调') + '\n';
      }
    }
    e.reply(out);
    return true;
  }

  // 构建 名称 -> 唯一正确类别 的权威映射
  _buildNajieNameClassMap() {
    const map = new Map(); // name -> Set(class)
    // 列表名本身即代表类别（这些列表的物品多不带 class 字段）
    const listClass = {
      equipment_list: '装备', dibing_list: '装备', tszb_list: '装备',
      timeequipmen_list: '装备', duanzhaowuqi: '装备', duanzhaohuju: '装备',
      duanzhaobaowu: '装备', namegive: '装备',
      xianchon: '仙宠',
      baoshi_list: '宝石'
    };
    // 这些列表里的物品自带 class 字段，直接采用
    const withClassLists = [
      'danyao_list', 'newdanyao_list', 'timedanyao_list', 'daoju_list',
      'gongfa_list', 'timegongfa_list', 'caoyao_list', 'shicai_list',
      'hecheng_list', 'cailiao_list', 'jingshenyuzhou_drop_list', 'hezi_list',
      'dijingList', 'fuhua_list', 'jiagong_list', 'xianchonkouliang',
      'xianchonkouliang2', 'duanzhaocailiao', 'kamian', 'kamian3'
    ];
    const add = (name, cls) => {
      if (!name || !cls) return;
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(cls);
    };
    for (const [list, cls] of Object.entries(listClass)) {
      const arr = data[list];
      if (Array.isArray(arr)) for (const it of arr) add(it.name, cls);
    }
    for (const list of withClassLists) {
      const arr = data[list];
      if (Array.isArray(arr)) for (const it of arr) add(it.name, it.class);
    }
    // 仅保留类别唯一确定的物品
    const single = new Map();
    for (const [name, set] of map) {
      if (set.size === 1) single.set(name, [...set][0]);
    }
    return single;
  }

  _buildNajieRarityMap() {
    const lists = [
      'equipment_list', 'dibing_list', 'tszb_list', 'timeequipmen_list',
      'duanzhaowuqi', 'duanzhaohuju', 'duanzhaobaowu', 'namegive',
      'xianchon', 'baoshi_list', 'danyao_list', 'newdanyao_list',
      'timedanyao_list', 'daoju_list', 'gongfa_list', 'timegongfa_list',
      'caoyao_list', 'shicai_list', 'hecheng_list', 'cailiao_list',
      'jingshenyuzhou_drop_list', 'hezi_list', 'dijingList', 'fuhua_list',
      'jiagong_list', 'xianchonkouliang', 'xianchonkouliang2',
      'duanzhaocailiao', 'kamian', 'kamian3'
    ];
    return buildUniqueItemRarityMap(lists.map(list => data[list]));
  }

  // 🎁 发放拉新奖励（4档可选）
  // 指令：#发拉新奖励1@用户  或  #发拉新奖励1 QQ号
  // 基础（所有档位）：5超越宝盒 + 3位面传送阵 + 1亿灵石 + 500w源石
  // 档1：+ 50轮回命签
  // 档2：+ 25叩仙丹 + 50天药
  // 档3：+ 10超越宝盒 + 3众生仙钓（超越宝盒共15）
  // 档4：+ 500洗根水 + 1锁灵仙符
  async sendInvitationReward(e) {
    // 权限检查
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限发放拉新奖励');
    }

    // 解析档位编号
    const pkgMatch = e.msg.match(/#发拉新奖励([1-4])/);
    if (!pkgMatch) {
      return e.reply('请指定奖励档位（1-4）：\n例如 #发拉新奖励1@用户');
    }
    const pkg = parseInt(pkgMatch[1]);

    // 解析目标QQ号：支持 @用户 和 纯数字
    let targetQQ = '';
    if (e.message && Array.isArray(e.message)) {
      const atMsg = e.message.find(item => item.type === 'at');
      if (atMsg && atMsg.qq) {
        targetQQ = atMsg.qq.toString().replace('qg_', '');
      }
    }
    if (!targetQQ && e.msg) {
      const qqMatch = e.msg.match(/#发拉新奖励[1-4]\s*(\d{5,})/);
      if (qqMatch) {
        targetQQ = qqMatch[1];
      }
    }

    if (!targetQQ) {
      return e.reply('请指定目标玩家：#发拉新奖励1@用户 或 #发拉新奖励1 QQ号');
    }

    targetQQ = await channel(targetQQ);

    // 检查玩家是否存在
    if (!await existplayer(targetQQ)) {
      return e.reply('目标玩家不存在于诸天万界中');
    }

    // ===== 基础奖励（所有档位共有） =====
    await Add_najie_thing(targetQQ, '超越宝盒', '盒子', 5);
    await Add_najie_thing(targetQQ, '位面传送阵', '道具', 3);
    await Add_najie_thing(targetQQ, '轮回命签', '道具', 50);
    await Add_灵石(targetQQ, 100000000);
    await Add_源石(targetQQ, 5000000, { applyMingge: false });

    // ===== 档位奖励 =====
    let bonusText = '';
    switch (pkg) {
      case 1:
        // 500洗根水 + 1锁灵仙符
        await Add_najie_thing(targetQQ, '洗根水', '道具', 500);
        await Add_najie_thing(targetQQ, '定灵仙符', '道具', 1);
        bonusText = '洗根水 ×500\n定灵仙符 ×1\n';
        break
      case 2:
        // 25叩仙丹 + 50天药
        await Add_najie_thing(targetQQ, '叩仙丹', '丹药', 25);
        await Add_najie_thing(targetQQ, '天药', '丹药', 50);
        bonusText = '叩仙丹 ×25\n天药 ×50\n';
        break;
      case 3:
        // 10超越宝盒 + 3众生仙钓（超越宝盒共15）
        await Add_najie_thing(targetQQ, '超越宝盒', '盒子', 10);
        await Add_najie_thing(targetQQ, '众生仙钓', '道具', 3);
        bonusText = '超越宝盒 ×10（共15）\n众生仙钓 ×3\n';
        break;
;
    }

    e.reply([
      `拉新奖励（档${pkg}）已发放至玩家 ${targetQQ}！\n`,
      '超越宝盒 ×5\n',
      `${bonusText}`,
      '位面传送阵 ×3\n',
      '灵石 ×1亿\n',
      '源石 ×500万'
    ]);

    return true;
  }

  /**
   * 重置目标玩家每日任务接取CD
   * 用法: #重置每日任务@用户
   */
  async resetDailyTaskCD(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return false;
    }

    // 解析目标QQ号：支持 @用户 和 纯数字
    let targetQQ = '';
    if (e.message && Array.isArray(e.message)) {
      const atMsg = e.message.find(item => item.type === 'at');
      if (atMsg && atMsg.qq) {
        targetQQ = atMsg.qq.toString().replace('qg_', '');
      }
    }
    if (!targetQQ && e.msg) {
      const cqAtMatch = e.msg.match(/\[CQ:at,qq=(\d+)\]/);
      if (cqAtMatch) targetQQ = cqAtMatch[1];
    }
    if (!targetQQ && e.msg) {
      const atMatch = e.msg.match(/@(\d+)/);
      if (atMatch) targetQQ = atMatch[1];
    }
    if (!targetQQ && e.msg) {
      const qqMatch = e.msg.match(/(\d{5,})/);
      if (qqMatch) targetQQ = qqMatch[1];
    }

    if (!targetQQ) {
      return e.reply('请指定要重置每日任务CD的目标，格式：#重置每日任务@用户');
    }

    targetQQ = await channel(targetQQ);

    if (!await existplayer(targetQQ)) {
      return e.reply('目标玩家不存在于诸天万界中');
    }

    // 清除每日任务接取CD
    const cdKey = `xiuxian:player:${targetQQ}:last_renwu_time`;
    const lastTime = await redis.get(cdKey);
    await redis.del(cdKey);

    // 同时清除灵石记录键，接取时会重新写入
    await redis.del(`xiuxian:player:${targetQQ}:renwu_lingshi_jilu`);

    const player = await Read_player(targetQQ);
    const rewardPrefix = `daily-task:${getDailyTaskDateKey()}:`;
    if (player._rewardClaims) {
      for (const key of Object.keys(player._rewardClaims)) {
        if (key.startsWith(rewardPrefix)) delete player._rewardClaims[key];
      }
      await Write_player(targetQQ, player, { trackDailyTask: false });
    }
    const najie = await Read_najie(targetQQ);
    if (najie?._rewardClaims) {
      for (const key of Object.keys(najie._rewardClaims)) {
        if (key.startsWith(rewardPrefix)) delete najie._rewardClaims[key];
      }
      await Write_najie(targetQQ, najie);
    }
    await redis.del(`xiuxian:player:${targetQQ}:wenxianling:task_exp:${getDailyTaskDateKey()}`);
    const playerName = player.名号 || targetQQ;

    if (lastTime) {
      e.reply(`已重置「${playerName}」的每日任务接取CD，现在可以重新接取每日任务了。`);
    } else {
      e.reply(`「${playerName}」当前没有每日任务CD记录，无需重置。`);
    }
    return true;
  }

  /**
   * 强制为目标玩家开启问仙令
   * 用法: #开启问仙令@用户
   * 跳过线索获取和四道试炼，直接激活问仙令
   */
  async openWenXianLing(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return false;
    }

    // 解析目标QQ号：支持 @用户 和 纯数字
    let targetQQ = '';
    if (e.message && Array.isArray(e.message)) {
      const atMsg = e.message.find(item => item.type === 'at');
      if (atMsg && atMsg.qq) {
        targetQQ = atMsg.qq.toString().replace('qg_', '');
      }
    }
    if (!targetQQ && e.msg) {
      const cqAtMatch = e.msg.match(/\[CQ:at,qq=(\d+)\]/);
      if (cqAtMatch) targetQQ = cqAtMatch[1];
    }
    if (!targetQQ && e.msg) {
      const atMatch = e.msg.match(/@(\d+)/);
      if (atMatch) targetQQ = atMatch[1];
    }
    if (!targetQQ && e.msg) {
      const qqMatch = e.msg.match(/(\d{5,})/);
      if (qqMatch) targetQQ = qqMatch[1];
    }

    if (!targetQQ) {
      return e.reply('请指定要开启问仙令的目标，格式：#开启问仙令@用户');
    }

    targetQQ = await channel(targetQQ);

    if (!await existplayer(targetQQ)) {
      return e.reply('目标玩家不存在于诸天万界中');
    }

    const player = await Read_player(targetQQ);
    const state = ensureWenXianState(player);

    if (state.unlocked) {
      return e.reply(`「${player.名号 || targetQQ}」的问仙令已经激活，无需重复开启。`);
    }

    // 强制补全前置条件：线索 + 四道试炼
    if (!state.clue) {
      state.clue = {
        source: '管理员赐予',
        acquiredAt: Date.now(),
        plane: '凡间',
        location: '未知',
        coordinate: '未知',
      };
    }
    state.trial.dailyTasks = WENXIAN_DAILY_TASK_TARGET;
    state.trial.innerWorldOpened = true;
    state.trial.tianjiaoDefeated = true;
    state.trial.clueExplored = true;

    // 激活问仙令（转化积攒的道痕）
    const result = activateWenXianLing(player);
    if (!result.ok) {
      return e.reply(`问仙令激活失败：${result.reason || '未知原因'}`);
    }

    await Write_player(targetQQ, player);

    const playerName = player.名号 || targetQQ;
    return e.reply([
      `【问仙令·管理员强制开启】`,
      `已为「${playerName}」强制开启问仙令。`,
      `问仙道痕转化：${result.pendingExp}点`,
      `当前问仙令等级：${result.newLevel}级`,
      `该玩家可发送 #问仙令 查看传承奖励。`,
    ].join('\n'));
  }

  // 指令：#补登唯一机缘          -> 扫描全服存档，把持有大罗剑胎/玉石匣/帝血的玩家补进永久认领记录
  //       #补登唯一机缘 预览/检测 -> 仅统计，不写入
  async backfillEternalClaims(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限执行补登。');
    }
    if (!verc({ e })) return false;
    const isPreview = /(预览|检测|dry|查询|查看)/.test(e.msg || '');
    try {
      const stats = await backfillXianguEternalClaims({
        redisClient: redis,
        playerDir: this.xiuxianData.filePathMap.player,
        equipmentDir: this.xiuxianData.filePathMap.equipment,
        najieDir: this.xiuxianData.filePathMap.najie,
        dryRun: isPreview,
      });
      const lines = [
        '【补登唯一机缘·天地唯一】' + (isPreview ? '预览（未写入）' : '已执行'),
        `扫描玩家：${stats.scanned} 人`,
        `持有者：${stats.holders} 人`,
      ];
      if (!isPreview) {
        lines.push(
          `新登记认领：${stats.registered} 条`,
          `已有记录跳过：${stats.skipped} 条`,
          `失败：${stats.failed} 条`,
        );
      }
      const byName = Object.entries(stats.byName);
      if (byName.length) {
        lines.push('', '— 明细（持有玩家数）—', ...byName.map(([name, count]) => `${name}：${count} 人`));
      }
      return e.reply(lines.join('\n'));
    } catch (error) {
      console.error('[补登唯一机缘] 执行失败:', error);
      return e.reply(`补登失败：${error?.message || error}`);
    }
  }

  // 指令：#发放纪元积累*N@玩家 / #发放纪元积累N@玩家 / #发放纪元积累*N QQ号
  //       目标优先取 @，其次消息中的 QQ 号，未指定时发给指令发送者自己
  async grantEpochAccum(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限发放纪元积累。');
    }
    if (!verc({ e })) return false;

    // 解析数量：#发放纪元积累*5 或 #发放纪元积累5
    const msg = String(e.msg || '').replace(/^\s*#/, '');
    const numMatch = msg.match(/^发放纪元积累[×x*]?\s*(\d+)/);
    if (!numMatch) {
      return e.reply('格式：#发放纪元积累*N@玩家 或 #发放纪元积累N@玩家（N 为正整数）');
    }
    const amount = Math.trunc(Number(numMatch[1]));
    if (!Number.isFinite(amount) || amount <= 0) {
      return e.reply('纪元积累数量必须是正整数。');
    }

    // 解析目标：优先 @，其次消息中的 QQ 号，最后默认发给发送者自己
    let targetQQ = '';
    if (e.message && Array.isArray(e.message)) {
      const atMsg = e.message.find(item => item.type === 'at');
      if (atMsg && atMsg.qq) targetQQ = String(atMsg.qq).replace('qg_', '');
    }
    if (!targetQQ) {
      const qqMatch = msg.match(/@(\d+)/) || msg.match(/(\d{5,})/);
      if (qqMatch) targetQQ = qqMatch[1];
    }
    if (!targetQQ) targetQQ = userQQ;
    targetQQ = await channel(targetQQ);

    // 检查存档
    const ifexistplay = await existplayer(targetQQ);
    if (!ifexistplay) {
      return e.reply('对方无存档，无法发放纪元积累。');
    }

    try {
      const granted = await Add_纪元积累(targetQQ, amount);
      const player = await Read_player(targetQQ);
      return e.reply([
        '【管理员发放·纪元积累】',
        `已发放 ${granted} 点纪元积累给 ${player.名号 || targetQQ}（QQ: ${targetQQ}）`,
        `当前纪元积累：${player.纪元积累 || 0} 点`,
      ].join('\n'));
    } catch (error) {
      console.error('[发放纪元积累] 执行失败:', error);
      return e.reply(`发放失败：${error?.message || error}`);
    }
  }
}
async function found(A, B) {
  let qinmidu = await Read_qinmidu();
  let i;
  for (i = 0; i < qinmidu.length; i++) {
    if (
      (qinmidu[i].QQ_A == A || qinmidu[i].QQ_B == B) ||
      (qinmidu[i].QQ_A == B || qinmidu[i].QQ_B == A)
    ) {
      break;
    }
  }
  return i;
}


async function clearNajieThing(thingType, thingName) {
  if (!thingType || !thingName) return [];
  const path = './plugins/' + AppName + '/resources/data/xiuxian_najie';
  return fs
    .readdirSync(path)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const usrId = file.replace('.json', '');
      const najie = fs.readFileSync(`${path}/${file}`);
      const thingInNajie = JSON.parse(najie)[thingType]?.find(
        thing => thing.name == thingName
      );
      if (!thingInNajie) return false;
      let thingNumber = thingInNajie.数量;
      Add_najie_thing(usrId, thingName, thingType, -thingNumber);
      if (thingType == '装备') {
        ['劣', '普', '优', '精', '绝', '顶'].map(async pinji => {
          const thingNum = await exist_najie_thing(
            usrId,
            thingName,
            thingType,
            pinji
          );
          if (thingNum) {
            Add_najie_thing(usrId, thingName, thingType, -thingNum, pinji);
            thingNumber += thingNum;
          }
        });
      }
      return { [usrId]: thingNumber };
    })
    .filter(usrObj => usrObj);
}
