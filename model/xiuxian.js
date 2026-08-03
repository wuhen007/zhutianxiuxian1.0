import fs from 'fs';
import path from 'path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';

import data from './XiuxianData.js';
// 道种专属技能全局池别名：战斗函数内 `data` 常被玩家参数遮蔽，故用 SKILL_DB 稳定引用 XiuxianData 单例
const SKILL_DB = data;

// 按道种专属技能名查找技能条目（跨攻击/防御/治疗池），返回含 技能分类 的条目
function getSeedSkillEntry(name) {
  if (!name) return null;
  for (const pool of [SKILL_DB.jineng1, SKILL_DB.jineng2, SKILL_DB.jineng_heal]) {
    if (!Array.isArray(pool)) continue;
    const found = pool.find(s => s.name === name && s.class === '道种专属');
    if (found) return found;
  }
  return null;
}
import { Writeit, Read_it,readall,dataall } from './duanzaofu.js';
import { AppName } from '../app.config.js';
import config from './Config.js';
import Show from './show.js';
import { log } from 'console';
import { TIMEOUT } from 'dns';
import { userInfo } from 'os';
// import {action_way_fun} from "../apps/Game/action.js";
import{cheakbaoshi}from "../apps/xiangqian/xiangqian.js"
import { segment } from "icqq";
import { create1v1BattleResult, createTeamBattleResult } from './combat/BattleResult.js';
import {
  buildMinggeAtlasData,
  calculateMinggeCurrencyGain,
  calculateMinggeFourRealmBonus,
  calculateMinggeGain,
  calculateMinggeSourceGain,
  getMinggeEffects,
} from './mingge.js';
import { getXianqiSuppressMultiplier } from './xianguXianqi.js';
import {
  getPetAbilityBonus,
  isInnateTreasureName,
  getInnateTreasureProjectionName,
  updateEquippedInnateTreasure,
} from './innateTreasure.js';
import {
  PLACE_LOCATION_MAP,
  SPECIAL_LOCATIONS,
  getBaseTravelThreshold,
  getBodyTravelQuote,
  ensureDefaultCoordinates,
  getKunpengReduction,
  getLocationThreshold,
  getTokenTier,
  getTokenTravelTime,
  hasCoordinate,
  hasEngravedCoordinate,
} from './weimianTravel.js';
import { calculateEquippedStats } from './equipmentStats.js';
import { hasSupremeInnate } from './supremePath.js';

/**
 * 获取机器人类型
 */
export function getBotType() {
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  return xiuxianConfig?.BotType || 'onebot';
}

/**
 * 统一 @ 构造器
 * @param {string|number} userId
 * @returns {string|object}
 */
export function buildAt(userId) {
  const botType = getBotType();
  const id = String(userId).replace('qg_', '');

  // 官方机器人：返回字符串（用于拼接进 content）
  if (botType === 'official') {
    return `<qqbot-at-user id="${id}" />`;
  }

  // OneBot / go-cqhttp
  const qq = Number(id);
  if (!qq || qq <= 0) return '';
  return segment.at(qq);
}

/**
 * 标准化用户ID（去掉 qg_）
 */
export function normalizeUserId(userId) {
  return String(userId).replace('qg_', '');
}

/**
 * 判断是否为官方机器人ID
 */
export function isOfficialBot(userId) {
  return String(userId).startsWith('qg_');
}

/**
 * 全局
 */
// 全局渡劫状态管理
export let dj = 0;
export let dj_players = {}; // 存储正在渡劫的玩家信息 {qq: {timer: 定时器, grade: 雷劫道数, count: 当前道数}}
export const spirit_players = {}; // 存储元神劫状态
//插件根目录
const __dirname = `${path.resolve()}${path.sep}plugins${path.sep}${AppName}`;
// 文件存放路径
export const __PATH = {
  //数据目录
  data_path: path.join(__dirname, '/resources/data'),
  //更新日志
  updata_log_path: path.join(__dirname, 'vertion.txt'),
  //用户数据
  player_path: path.join(__dirname, '/resources/data/xiuxian_player'),
  //装备
  equipment_path: path.join(__dirname, '/resources/data/xiuxian_equipment'),
  //纳戒
  najie_path: path.join(__dirname, '/resources/data/xiuxian_najie'),
  //丹药
  danyao_path: path.join(__dirname, '/resources/data/xiuxian_danyao'),
  inner_world_path: path.join(__dirname, '/resources/data/inner_world'), // 修正后的路径
  //源数据
  lib_path: path.join(__dirname, '/resources/data/item'),
  Timelimit: path.join(__dirname, '/resources/data/Timelimit'),
  Exchange: path.join(__dirname, '/resources/data/Exchange'),
  shop: path.join(__dirname, '/resources/data/shop'),
  log_path: path.join(__dirname, '/resources/data/suduku'),
  association: path.join(__dirname, '/resources/data/association'),
  renwu: path.join(__dirname, '/resources/data/renwu'),
  tiandibang: path.join(__dirname, '/resources/data/tiandibang'),
  qinmidu: path.join(__dirname, '/resources/data/qinmidu'),
  backup: path.join(__dirname, '/resources/backup'),
  player_pifu_path: path.join(__dirname, '/resources/img/player_pifu'),
  shitu: path.join(__dirname, '/resources/data/shitu'),
  equipment_pifu_path: path.join(__dirname, '/resources/img/equipment_pifu'),
  duanlu: path.join(__dirname, '/resources/data/duanlu'),
  temp_path: path.join(__dirname, '/resources/data/temp'),
  custom: path.join(__dirname, '/resources/data/custom'),
  auto_backup: path.join(__dirname, '/resources/data/auto_backup'),
  channel: path.join(__dirname, '/resources/data/channel'),
  chengzhang: path.join(__dirname, '/resources/data/chengzhang'),
  equipment_list: path.join(__dirname, '/resources/data/item'),
  dibing_list: path.join(__dirname, '/resources/data/item'),
  tszb_list: path.join(__dirname, '/resources/data/item'),
};


//检查存档是否存在，存在返回true;
export async function existplayer(usr_qq) {
  let exist_player;
  exist_player = fs.existsSync(`${__PATH.player_path}/${usr_qq}.json`);

  if (exist_player) {
    return true;
  }
  return false;
}

/**
 * 
 * @param {*} amount 输入数量
 * @returns 返回正整数
 */
export async function convert2integer(amount) {
  let number = 1;
  let reg = new RegExp(/^[1-9][0-9]{0,12}$/);
  if (!reg.test(amount)) {
    return number;
  } else {
    return parseInt(amount);
  }
}

export async function Locked_najie_thing(usr_qq, thing_name, thing_class,thing_pinji=null) {
    let najie = await Read_najie(usr_qq);
    let ifexist;
    if (thing_class == "装备") {
        ifexist = najie.装备.find(item => item.name == thing_name&&item.pinji==thing_pinji);
    }
    if (thing_class == "丹药") {
        ifexist = najie.丹药.find(item => item.name == thing_name);
    }
    if (thing_class == "道具") {
        ifexist = najie.道具.find(item => item.name == thing_name);
    }
    if (thing_class == "功法") {
        ifexist = najie.功法.find(item => item.name == thing_name);
    }
    if (thing_class == "草药") {
        ifexist = najie.草药.find(item => item.name == thing_name);
    }
    if (thing_class == "材料") {
        ifexist = najie.材料.find(item => item.name == thing_name);
    }
    if (thing_class == "食材") {
        ifexist = najie.食材.find(item => item.name == thing_name);
    }
    if (thing_class == "盒子") {
        ifexist = najie.盒子.find(item => item.name == thing_name);
    }
    if (thing_class == "仙宠") {
        ifexist = najie.仙宠.find(item => item.name == thing_name);
    }
    if (thing_class == "仙米") {
        ifexist = najie.仙宠口粮.find(item => item.name == thing_name);
    }
    if (ifexist) {
        return ifexist.islockd;
    }
    return false;
}

export async function Check_thing(data){
    let state=0;
    if (data.id >= 5005000&& data.id <= 5005009) {
        state=1;
    }
    else if (data.id >= 400991 && data.id <= 400999) {
        state=1;
    }
    return state;
}

export async function Read_updata_log() {
  let dir = path.join(`${__PATH.updata_log_path}`);
  let update_log = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  return update_log;
}

//读取存档信息，返回成一个JavaScript对象
export async function Read_player(usr_qq) {
  let dir = path.join(`${__PATH.player_path}/${usr_qq}.json`);
  let player = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  player = JSON.parse(player);
  if (player.先天至宝失效时间 && Number(player.先天至宝失效时间) <= Date.now()) {
    player.当前先天至宝 = '';
    player.先天至宝失效时间 = 0;
  }
  ensureDefaultCoordinates(player);
  return player;
}
export async function LevelTask(e, power_n, power_m, power_Grade, aconut, illusionRate) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  
  let msg = [buildAt(usr_qq)];
  let player = await Read_player(usr_qq);
  
    // 特殊体质：肉身打散雷劫
  if (player.Physique_id == 43) {
    const damagePercent = 0.25;
    const damage = Math.trunc(player.血量上限 * damagePercent);
    player.当前血量 -= damage;
    
    await Write_player(usr_qq, player);
    
    msg.push(`\n${player.名号}仰天长啸，肉身之力震动天地！`);
    msg.push(`只见他纵身跃起，一拳轰向雷云！`);
    msg.push(`第${aconut}道雷劫竟被硬生生打散！`);
    msg.push(`肉身硬抗雷劫，气血翻涌，损失${damage}点生命值`);
    
    if (aconut >= power_Grade) {
      // 关键优化：不再设置power_place，而是直接触发元神劫
      const bonus = 100000 * aconut;
      player.生命加成 += bonus;
      player.血量上限 += bonus;
      player.当前血量 += bonus;
      player.防御加成 += bonus;
      player.防御 += bonus;
      player.攻击加成 += bonus;
      player.攻击 += bonus;
      
      await Write_player(usr_qq, player);
      msg.push(`\n${player.名号}以肉身之力硬撼天劫，肉身劫完成！`);
      msg.push(`肉身经雷劫淬炼，全属性提升${bonus}点！`);
      
      // 立即开始元神劫
      try {
        await e.reply(msg);
      } catch (err) {
        console.log(`[${new Date().toISOString()}] e.reply错误:`, err);
      }
      console.log(`[${new Date().toISOString()}] ${player.名号}肉身劫完成，等待3秒后进入元神劫`);
      
      // 等待3秒，确保玩家看到消息
      console.log(`[${new Date().toISOString()}] 开始3秒倒计时...`);
      await new Promise(resolve => {
        setTimeout(() => {
          console.log(`[${new Date().toISOString()}] 3秒倒计时结束，${player.名号}开始进入元神劫`);
          resolve();
        }, 3000);
      });
      
      // 关键优化：直接调用元神劫
      console.log(`[${new Date().toISOString()}] ${player.名号}调用元神劫函数`);
      const spiritResult = await spirit_tribulation(e, player);
      console.log(`[${new Date().toISOString()}] ${player.名号}元神劫结果:`, spiritResult.success);
      
      if (spiritResult.success) {
        return 3; // 返回3表示双劫完成
      } else {
        return 2; // 返回2表示肉身劫完成但元神劫失败
      }
    }
    
    msg.push(`\n下一道雷劫在一分钟后落下！`);
    e.reply(msg);
    return 1;
  }
  
  // 元神防御机制
  let power_distortion = await dujie(usr_qq);
  if (illusionRate > 0.1) {
    const reduction = Math.min(0.5, illusionRate * 0.7);
    power_distortion = power_distortion * (1 + reduction);
    msg.push(`元神化虚为实，雷抗提升${(reduction*100).toFixed(1)}%`);
  }
  
  // 草药辅助
  const yaocaolist = ['凝血草', '小吉祥草', '大吉祥草'];
  for (const j in yaocaolist) {
    const num = await exist_najie_thing(usr_qq, yaocaolist[j], '草药');
    if (num) {
      msg.push(`[${yaocaolist[j]}]为你提高了雷抗\n`);
      power_distortion = Math.trunc(power_distortion * (1 + 0.2 * j));
      await Add_najie_thing(usr_qq, yaocaolist[j], '草药', -1);
    }
  }
  
  // 雷劫威力计算
  let variable = Math.random() * (power_m - power_n) + power_n;
  variable = variable + aconut / 10;
  variable = Number(variable);
  
  // 高阶体质特效
  if (player.Physique_id > 43) {
    const damagePercent = 0.05;
    const damage = Math.trunc(player.当前血量 * damagePercent);
    player.当前血量 -= damage;
    
    await Write_player(usr_qq, player);
    
    msg.push(`${player.名号}抬头望向天空！`);
    msg.push(`仰天长啸，一拳轰向雷云！`);
    msg.push(`第${aconut}道雷劫竟被硬生生打散！`);
    msg.push(`将打散的雷劫炼化，损失了${damage}点生命值`);
    
    if (aconut >= power_Grade) {

      
      // 保留全属性强化
      const bonus = 500000 * aconut;
      player.生命加成 += bonus;
      player.血量上限 += bonus;
      player.当前血量 += bonus;
      player.防御加成 += bonus;
      player.防御 += bonus;
      player.攻击加成 += bonus;
      player.攻击 += bonus;
      
      await Write_player(usr_qq, player);
      msg.push(`${player.名号}以天劫之力淬炼肉身，肉身劫完成！`);
      msg.push(`肉身经雷劫淬炼，全属性提升${bonus}点！`);
      
      // 立即开始元神劫
      await e.reply(msg);
      console.log(`[${new Date().toISOString()}] ${player.名号}肉身劫完成(43+体质)，等待3秒后进入元神劫`);
      
      // 等待3秒，确保玩家看到消息
      await new Promise(resolve => {
        setTimeout(() => {
          console.log(`[${new Date().toISOString()}] ${player.名号}开始进入元神劫(43+体质)`);
          resolve();
        }, 3000);
      });
      
      // 直接调用元神劫
      console.log(`[${new Date().toISOString()}] ${player.名号}调用元神劫函数(43+体质)`);
      const spiritResult = await spirit_tribulation(e, player);
      console.log(`[${new Date().toISOString()}] ${player.名号}元神劫结果(43+体质):`, spiritResult.success);
      
      if (spiritResult.success) {
        return 3; // 返回3表示双劫完成
      } else {
        return 2; // 返回2表示肉身劫完成但元神劫失败
      }
    }
    
    msg.push(`下一道雷劫在一分钟后落下！`);
    e.reply(msg);
    return 1;
  }
  
  if (power_distortion >= variable) {
    if (aconut >= power_Grade) {
      // 关键优化：不再设置power_place，而是直接触发元神劫
      const bonus = 100000 * aconut;
      player.生命加成 += bonus;
      player.血量上限 += bonus;
      player.当前血量 += bonus;
      player.防御加成 += bonus;
      player.防御 += bonus;
      player.攻击加成 += bonus;
      player.攻击 += bonus;
      
      await Write_player(usr_qq, player);
      msg.push(
        '\n' + player.名号 + '成功度过了第' + aconut + '道雷劫！肉身劫完成！'
      );
      msg.push(`肉身经雷劫淬炼，全属性提升${bonus}点！`);
      
      // 立即开始元神劫
      try {
        await e.reply(msg);
      } catch (err) {
        console.log(`[${new Date().toISOString()}] e.reply错误:`, err);
      }
      console.log(`[${new Date().toISOString()}] ${player.名号}肉身劫完成，等待3秒后进入元神劫`);
      
      // 等待3秒，确保玩家看到消息
      console.log(`[${new Date().toISOString()}] 开始3秒倒计时...`);
      await new Promise(resolve => {
        setTimeout(() => {
          console.log(`[${new Date().toISOString()}] 3秒倒计时结束，${player.名号}开始进入元神劫`);
          resolve();
        }, 3000);
      });
      
      // 关键优化：直接调用元神劫
      console.log(`[${new Date().toISOString()}] ${player.名号}调用元神劫函数`);
      const spiritResult = await spirit_tribulation(e, player);
      console.log(`[${new Date().toISOString()}] ${player.名号}元神劫结果:`, spiritResult.success);
      
      if (spiritResult.success) {
        return 3; // 返回3表示双劫完成
      } else {
        return 2; // 返回2表示肉身劫完成但元神劫失败
      }
    }
    
    let act = variable - power_n;
    act = act / (power_m - power_n);
    player.当前血量 = Math.trunc(player.当前血量 - player.当前血量 * act);
    
    await Write_player(usr_qq, player);
    
    msg.push(
      '\n本次雷伤：' + variable.toFixed(2) +
      '\n本次雷抗：' + power_distortion +
      '\n' + player.名号 + '成功度过了第' + aconut + '道雷劫！' +
      '\n下一道雷劫在一分钟后落下！'
    );
    e.reply(msg);
    return 1;
  } 
  
  // 雷劫失败
  player.当前血量 = 1;
  player.修为 = Math.trunc(player.修为 * 0.5);

  
  await Write_player(usr_qq, player);
  
  msg.push(
    '\n本次雷伤：' + variable.toFixed(2) +
    '\n本次雷抗：' + power_distortion +
    '\n第' + aconut + '道雷劫落下了，' + player.名号 + '未能抵挡！'
  );
  e.reply(msg);
  return 0;
}
// =====================
// 肉身劫函数 (异步版)
// =====================
export async function mortal_tribulation(e, player) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  
  // 获取最新玩家数据
  player = await Read_player(usr_qq);
  
  try {
    // 当前系数计算
    let x = await dujie(usr_qq);
    
    // 劫数计算（根据灵根）
    let y = 3; // 默认劫数
    const rootType = player.灵根.type;
    
    // 灵根类型与对应劫数
    const rootLevels = {
      '伪灵根': 3,
      '真灵根': 6,
      '天灵根': 9,
      '体质': 10,
      '转生': 21, '魔头': 21,
      '妖体': 26,'神体': 26,
      '圣体': 52,
      '小成圣体': 72,
      '混沌体': 82,
      '至尊体': 96,
      '大成圣体': 102, '大道体': 102,
      '圣体道胎': 128,
      '神慧者': 1280
    };
    
    y = rootLevels[rootType] || 12;
    
    // 渡劫系数区间
    let n = 11800; // 最低
    let p = 2800;  // 变动
    
    // 元神保护机制
    if (player.虚实转化率 > 0) {
      const reduction = Math.min(0.5, player.虚实转化率 * 0.7);
      n *= (1 - reduction); 
      p *= (1 - reduction); 
      x *= (1 + reduction / 2); 
    }
    
    if (x <= n) {
      player.当前血量 = 0;
      const currentLevel = data.Level_list.find(item => item.level_id == player.level_id);
      const levelExp = currentLevel ? currentLevel.exp : 1000; // 默认值防止找不到
      player.修为 -= parseInt(levelExp / 4);
      await Write_player(usr_qq, player);
      e.reply('天空一声巨响，未降下雷劫，就被天道的气势震死了。');
      return { success: false };
    }
    
    // // 全局渡劫锁定检查
    // if (dj > 0) {
    //   e.reply('已经有人在渡劫了，建议打死他');
    //   return { success: false };
    // }
    
    // dj++;
    
    // 渡劫成功率计算
    let l = (x - n) / (p + y * 0.1) * 100;
    l = l.toFixed(2);
    
    // 发送渡劫信息
    e.reply('天道：就凭这肉身，也敢逆天改命？');
    let img = await get_log_img(
      `[${player.名号}]\n雷抗：${x}\n成功率：${l}%\n灵根：${rootType}\n需渡${y}道雷劫\n将在一分钟后落下\n[温馨提示]请把其他渡劫期打死后再渡劫！`
    );
    e.reply(img);
    
    let aconut = 1;
    let result = { success: false };
    
  let time = setInterval(async () => {
    try {
      const flag = await LevelTask(e, n, p+n, y, aconut, player.虚实转化率 || 0);
      
      // 更新当前雷劫道数
      if (dj_players[usr_qq]) {
        dj_players[usr_qq].count = aconut;
      }
      
      if (flag === 3) {
        // 双劫完成 - 等待LevelTask内部完全执行完毕
        // 注意：LevelTask内部的元神劫已经完成，这里只需清理定时器
        clearInterval(time);
        if (dj_players[usr_qq]) {
          delete dj_players[usr_qq];
        }
        result.success = true;
        dj = 0;
      } else if (flag === 2) {
        // 肉身劫完成但元神劫失败
        clearInterval(time);
        if (dj_players[usr_qq]) {
          delete dj_players[usr_qq];
        }
        
        // 更新玩家状态：标记肉身劫已完成
        player = await Read_player(usr_qq);
        player.power = 1; // 标记已过肉身劫
        player.元神劫上次失败时间 = Date.now(); // 记录失败时间
        await Write_player(usr_qq, player);
        
        result.success = true; // 肉身劫成功
        result.spiritFailed = true; // 元神劫失败标记
        dj = 0;
      } else if (flag === 0) {
        // 肉身劫失败
        clearInterval(time);
        if (dj_players[usr_qq]) {
          delete dj_players[usr_qq];
        }
        result.success = false;
        dj = 0;
      } else {
        // 继续下一道雷劫
        aconut++;
      }
    } catch (error) {
      logger.error(`雷劫任务出错: ${error}`);
      clearInterval(time);
      dj = 0;
    }
  }, 60000);
    
    // 记录渡劫信息
    dj_players[usr_qq] = {
      timer: time,
      grade: y,
      count: aconut
    };
    
    return new Promise(resolve => {
      // 设置超时检查
      const timeout = setTimeout(() => {
        if (!result.success && dj_players[usr_qq]) {
          clearInterval(time);
          delete dj_players[usr_qq];
          dj = 0;
          resolve({ success: false });
        }
      }, 60000 * (y + 5)); // 总劫数时间 + 5分钟缓冲
      
      // 等待结果
      const checkResult = setInterval(() => {
        if (result.success !== undefined) {
          clearInterval(checkResult);
          clearTimeout(timeout);
          resolve(result);
        }
      }, 1000);
    });
    
  } catch (error) {
    logger.error(`肉身劫处理错误: ${error}`);
    return { success: false };
  }
}

// =====================
// 元神劫函数 (完整异步版)
// =====================
export async function spirit_tribulation(e, player) {
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    console.log(`[${new Date().toISOString()}] spirit_tribulation开始: ${player?.名号 || '未知玩家'} (${usr_qq})`);
    
    // 检查是否已在元神劫中
    if (spirit_players[usr_qq]) {
        console.log(`[${new Date().toISOString()}] ${player?.名号 || '未知玩家'}已在元神劫中`);
        e.reply('你已在元神劫中，请勿重复尝试');
        return { success: false };
    }
    
    // 获取最新玩家数据
    player = await Read_player(usr_qq);
    
    try {
        // 元神化真系数
        const spiritFactor = player.元神 / 1000000 * (1 + (player.虚实转化率 || 0.1));
        
        // 发送元神劫信息
        await e.reply([
            `≡≡≡ 元神化真劫开启 ≡≡≡`,
            `${player.名号}元神出窍，直面真实壁垒`,
            `当前元神强度：${(spiritFactor*100).toFixed(1)}%`,
            `虚实转化率：${((player.虚实转化率 || 0.1)*100).toFixed(1)}%`,
            `将经受九转虚实考验`
        ].join("\n"));
        
        // 初始化元神劫状态
        spirit_players[usr_qq] = {
            current_transformation: 1,
            transformations: 9,
            result: { success: false },
            timer: null,
            startTime: Date.now()
        };
        
        const playerState = spirit_players[usr_qq];
        
        // 创建元神劫定时器
        playerState.timer = setInterval(async () => {
            try {
                // 每转开始前刷新玩家数据
                player = await Read_player(usr_qq);
                
                // 元神消耗（随转数增加）
                const spiritCost = playerState.current_transformation * 50000;
                if (player.元神 < spiritCost) {
                    clearInterval(playerState.timer);
                    playerState.result = { success: false, damage: 0.1 };
                    e.reply(`元神枯竭，无法继续虚实转化！`);
                    delete spirit_players[usr_qq];
                    return;
                }
                
                // 元神震荡（随机波动）
                const fluctuation = (Math.random() * 0.3) - 0.15;
                const current_strength = Math.max(0.05, spiritFactor + fluctuation);
                
                // 转化难度（指数增长）
                const difficulty = 0.1 * Math.pow(1.3, playerState.current_transformation);
                
                // 构建消息
                let msg = `【${player.名号}:第${playerState.current_transformation}转】`;
                msg += `元神强度：${(current_strength*100).toFixed(1)}% 要求：${(difficulty*100).toFixed(1)}%\n`;
                
                if (current_strength > difficulty) {
                    // 虚实转化成功
                    player.元神 -= spiritCost;
                    player.元神上限 += spiritCost * 0.1;
                    player.虚实转化率 = (player.虚实转化率 || 0.1) + 0.125;
                    
                    msg += `≡ 虚实转化成功！\n`;
                    msg += `≡ 元神上限提升至：${player.元神上限.toFixed(0)}\n`;
                    msg += `≡ 虚实转化率提升至：${(player.虚实转化率*100).toFixed(1)}%`;
                    
                    // 天罗地网感知（第7~9转注入恐怖文本）
                    if (playerState.current_transformation >= 7) {
                        const tianluoMsgs = [
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            // 第7转
                            `\n\n  ══════════════════════╗\n  你的元神在虚实转化的刹那——\n  忽然打了个寒颤。\n\n  虚空深处，似有冰冷锁链在碰撞。\n  那声音极其遥远，又似近在耳畔：\n  \n    "又来了一个……"\n  \n  你告诉自己那是错觉。\n  ══════════════════════╝`,
                            // 第8转
                            `\n\n  ══════════════════════╗\n  第捌转，虚实壁垒出现了裂痕——\n  不是你造成的裂痕。\n\n  透过那道裂痕，你看见了光。\n  你以为那是仙门。\n\n  但那光……冰冷刺骨。\n  光幕后面，有无数模糊的影子在挣扎，\n  它们的元神，正被一根根透明的丝线缠绕，\n  缓缓拖入光的彼端。\n\n  你忽然意识到——\n  那些丝线，一直都在你身上。\n  ══════════════════════╝`,
                            // 第9转
                            `\n\n  ══════════════════════╗\n  第玖转。最终转。\n\n  你终于看清了。\n\n  那不是仙门。\n  那是一张网。\n\n  一张从宇宙初开时就张开的网。\n  天罗在上，地网在下，\n  凡间所有修士的元神，皆在网中。\n\n  你不是第一个走到这一步的人。\n  也不会是最后一个。\n\n  网中的鱼，永远不可能自己挣脱渔网。\n\n    ——除非，你把撒网的人，拉下来。\n  ══════════════════════╝`,
                        ];
                        const senseText = tianluoMsgs[playerState.current_transformation];
                        if (senseText) {
                            msg += senseText;
                            // 标记玩家已感知天罗地网
                            player.天罗地网感知 = true;
                            await Write_player(usr_qq, player);
                        }
                    }

                    // 保存玩家数据
                    await Write_player(usr_qq, player);
                    
                    // 最终转突破
                    if (playerState.current_transformation >= playerState.transformations) {
                        clearInterval(playerState.timer);
                        msg += `\n\n≡≡≡ 元神化真完成！≡≡≡`;
                        
                        // 天罗地网感知者，登仙喜报语气改变
                        let celebrationMsg;
                        if (player.天罗地网感知) {
                            celebrationMsg = [
                                `≡≡≡ 阴阳同济·永恒证真 ≡≡≡`,
                                `≡ ${player.名号}成功渡过双重无妄真劫`,
                                `≡ `,
                                `≡ 但你的元神，已看见了网。`,
                                `≡ 那扇所谓的"仙门"，冰冷刺骨。`,
                                `≡ `,
                                `≡ 请慎重 #登仙……`,
                                `≡ 你确定，门后面，是你要去的地方吗？`,
                            ].join('\n');
                        } else {
                            celebrationMsg = [
                                `≡≡≡ 阴阳同济·永恒证真 ≡≡≡`,
                                `≡ ${player.名号}成功渡过双重无妄真劫，超脱人世间`,
                                `≡ 元神强度：${player.元神.toFixed(0)}`,
                                `≡ 真实掌握度：100%`,
                                `≡ 请即刻#登仙进入仙界！`
                            ].join('\n');
                        }

                        // 原始终结处理（补回 power + 真实掌握度）
                        player.power = 2;
                        player.真实掌握度 = 1.0;
                        await Write_player(usr_qq, player);
                        
                        e.reply(msg + '\n\n' + celebrationMsg);
                        playerState.result = { success: true };
                        delete spirit_players[usr_qq];
                        return;
                    }
                    
                    e.reply(msg + `\n\n下一转将在1分钟后降临...`);
                    playerState.current_transformation++;
                    
                } else {
                    // 转化失败
                    clearInterval(playerState.timer);
                    const damage = Math.max(0.01, (1 - current_strength) * 0.1);
                    player.虚实转化率 = Math.max(0.01, (player.虚实转化率 || 0.1) - damage);
                    
                    // 记录失败时间和次数
                    player.元神劫上次失败时间 = Date.now();
                    player.元神劫失败次数 = (player.元神劫失败次数 || 0) + 1;
                    
                    // 元神值临时下降
                    const spiritDamage = damage * player.元神 * 0.5;
                    player.元神 = Math.max(500000, player.元神 - spiritDamage);
                    
                    // 保存玩家数据
                    await Write_player(usr_qq, player);
                    
                    msg += `≡≡≡ 元神震荡！≡≡≡\n`;
                    msg += `虚实失衡，转化率受损：-${(damage*100).toFixed(1)}%\n`;
                    msg += `元神值下降：-${spiritDamage.toFixed(0)}`;
                    
                    e.reply(msg);
                    playerState.result = { success: false, damage };
                    delete spirit_players[usr_qq];
                }
            } catch (error) {
                logger.error(`元神劫处理出错: ${error}`);
                clearInterval(playerState.timer);
                playerState.result = { success: false, damage: 0.1 };
                delete spirit_players[usr_qq];
            }
        }, 60000); // 每转间隔1分钟
        
        // 返回Promise等待结果
        return new Promise(resolve => {
            // 设置超时检查
            const timeout = setTimeout(() => {
                if (!playerState.result.success && spirit_players[usr_qq]) {
                    clearInterval(playerState.timer);
                    delete spirit_players[usr_qq];
                    resolve({ success: false });
                }
            }, 60000 * (playerState.transformations + 2)); // 总转数时间 + 2转缓冲
            
            // 定期检查结果
            const checkInterval = setInterval(() => {
                if (playerState.result.success !== undefined) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve(playerState.result);
                }
            }, 1000);
        });
        
    } catch (error) {
        logger.error(`元神劫初始化错误: ${error}`);
        if (spirit_players[usr_qq]) {
            delete spirit_players[usr_qq];
        }
        return { success: false };
    }
}

export async function dujie(user_qq) {
  let usr_qq = user_qq;
  let player = await Read_player(usr_qq);
  
  // 基础属性归一化
  var new_blood = player.当前血量 / 100000;
  var new_defense = player.防御 / 100000;
  var new_attack = player.攻击 / 100000;
  
  // 属性权重分配
  new_blood = (new_blood * 4) / 10;
  new_defense = (new_defense * 6) / 10;
  new_attack = (new_attack * 2) / 10;
  
  // 基础厚度计算
  var N = new_blood + new_defense;
  
  // 初始系数
  var x = N * new_attack;
  
  // 灵根加成
  const rootBonus = {
    '伪灵根': 1.0,
    '真灵根': 1.5,
    '天灵根': 1.75,
    '转生': 2.5,'魔头': 2.5,
    '神体': 3.0,'妖体': 3.0,
    '圣体': 4.0,
    '小成圣体': 5.0,
    '大成圣体': 8.0,'至尊体': 8.0,'命运': 8.0,'天魔': 8.0,
    '混沌体': 8.0,
    '大道体': 8.0,
    '圣体道胎': 10.0,'神魔体': 12.0,
    '神慧者': 15.0,
    '圆环之理': 15.0
  };
  
  // 应用灵根加成
  const rootType = player.灵根.type || '伪灵根';
  x *= rootBonus[rootType] || 1.0;
  
  // 虚实转化率加成
  if (player.虚实转化率 && player.虚实转化率 > 0) {
    const illusionBonus = Math.min(2.0, 1 + player.虚实转化率 * 5);
    x *= illusionBonus;
  }
  
  // 结果格式化
  return Number(x.toFixed(2));
}
//写入存档信息,第二个参数是一个JavaScript对象
export async function Write_player(usr_qq, player) {
  let dir = path.join(__PATH.player_path, `${usr_qq}.json`);
  let new_ARR = JSON.stringify(player, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

function normalizeEquipmentSlot(slot) {
  return {
    name: '',
    atk: 0,
    def: 0,
    HP: 0,
    bao: 0,
    全属性: 0,
    ...(slot && typeof slot === 'object' ? slot : {}),
  };
}

function normalizeEquipment(equipment) {
  const current = equipment && typeof equipment === 'object' ? equipment : {};
  return {
    ...current,
    武器: normalizeEquipmentSlot(current.武器),
    护具: normalizeEquipmentSlot(current.护具),
    法宝: normalizeEquipmentSlot(current.法宝),
    帝兵: normalizeEquipmentSlot(current.帝兵),
  };
}

//读取装备信息，返回成一个JavaScript对象
export async function Read_equipment(usr_qq) {
  let dir = path.join(`${__PATH.equipment_path}/${usr_qq}.json`);
  
  // 检查文件是否存在
  if (!fs.existsSync(dir)) {
    return normalizeEquipment({ 饰品: { name: '', 品阶: '' }, 帝具: null });
  }
  
  let equipment = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  equipment = JSON.parse(equipment);
  return normalizeEquipment(equipment);
}

function addXianguExtremeBonus(total, bonus) {
  if (!bonus) return;
  total.攻击 += Number(bonus.攻击加成) || 0;
  total.防御 += Number(bonus.防御加成) || 0;
  total.血量 += Number(bonus.血量加成) || 0;
}

/**
 * 按玩家已达成的极境汇总固定属性，重复调用不会累加存档值。
 * 神火极境优先使用具体道种/路线配置，找不到时回退到神火境默认配置。
 */
export function calculateXianguExtremeBonus(player, levels = data.xiangujinshi_list) {
  const completed = new Set(
    (Array.isArray(player?.极境) ? player.极境 : []).map(levelId => String(levelId))
  );
  if (player?.xiangu_shenhuo?.极境达成) completed.add('8');

  const total = { 攻击: 0, 防御: 0, 血量: 0 };
  for (const realm of levels || []) {
    const levelId = String(realm?.level_id);
    if (!completed.has(levelId)) continue;

    let bonus = realm.极境加成;
    if (levelId === '8') {
      const extremeName = player?.xiangu_shenhuo?.极境名称;
      // 有具体道种名称时必须精确命中；旧版普通道种不能回退吃到祭炼真我的默认极境。
      bonus = extremeName ? realm.极境?.[extremeName] : bonus;
    }
    addXianguExtremeBonus(total, bonus);
  }
  return total;
}

//写入装备信息,第二个参数是一个JavaScript对象
export async function Write_equipment(usr_qq, equipment) {
  let player = await Read_player(usr_qq);
  equipment = normalizeEquipment(equipment);

  const projectionName = getInnateTreasureProjectionName(equipment.帝兵);
  const innateTreasureName = projectionName || (isInnateTreasureName(equipment.帝兵?.name)
    ? equipment.帝兵.name
    : '');
  player.当前先天至宝 = innateTreasureName;
  player.先天至宝失效时间 = projectionName
    ? Number(equipment.帝兵.先天投影截止)
    : 0;
  if (projectionName) {
    updateEquippedInnateTreasure(usr_qq, '');
  } else {
    updateEquippedInnateTreasure(
      usr_qq,
      innateTreasureName,
      player.宗门?.宗门名称 || ''
    );
  }

   // 新增逻辑：如果仙古今世法等级是undefined，则赋值为1
  if (player.xiangulevel_id === undefined) {
    player.xiangulevel_id = 1;
  }
  if (!player.光阴加成) player.光阴加成 = { 攻: 0, 防: 0, 生: 0 };

  // ===== 额外加成阈值拆分 =====
  // 未超上限的部分正常参与所有计算（灵根放大/装备乘法/套装乘法）
  // 超出上限的部分移到最后加算（不被任何乘法放大 = 自然稀释）
  const _lv = player.level_id || 1;
  const _phy = player.Physique_id || 1;
  const _mij = player.mijinglevel_id || 1;
  // 练气：1~41每级100w，42+每级1000w
  const 练气上限 = _lv <= 41 ? _lv * 1000000 : 41 * 1000000 + (_lv - 41) * 10000000;
  // 炼体：1~41每级100w，42+每级1000w
  const 炼体上限 = _phy <= 41 ? _phy * 1000000 : 41 * 1000000 + (_phy - 41) * 10000000;
  // 证道体系（秘境）：每级1500w
  const 证道上限 = _mij * 15000000;
  // 总上限（三层相加）
  const 额外上限 = 练气上限 + 炼体上限 + 证道上限;

  // 光阴加成直接豁免：始终全额参与所有放大，不进阈值稀释
  const 光阴攻 = player.光阴加成?.攻 || 0;
  const 光阴防 = player.光阴加成?.防 || 0;
  const 光阴血 = player.光阴加成?.生 || 0;

  // 极境加成从配置统一重算。通用加成没有可靠来源标记，不对旧存档做数值猜测或自动扣减。
  const 仙古极境加成 = calculateXianguExtremeBonus(player);
  const 原始额外攻 = Number(player.攻击加成) || 0;
  const 原始额外防 = Number(player.防御加成) || 0;
  const 原始额外血 = Number(player.生命加成) || 0;
  const 额外攻 = 原始额外攻;
  const 额外防 = 原始额外防;
  const 额外血 = 原始额外血;

  // 阈值内部分（正常参与所有后续乘法计算）
  const 阈内攻 = Math.min(额外攻, 额外上限);
  const 阈内防 = Math.min(额外防, 额外上限);
  const 阈内血 = Math.min(额外血, 额外上限);

  // 超出部分（移到最后加算，不被任何乘法放大 = 自然稀释）
  const 超出攻 = Math.max(额外攻 - 额外上限, 0);
  const 超出防 = Math.max(额外防 - 额外上限, 0);
  const 超出血 = Math.max(额外血 - 额外上限, 0);

  // ===== 阶段1：命格倍率仅作用于练气、炼体、秘境、仙古四体系基础总和 =====
  const 四体系境界 = {
    练气: data.Level_list.find(item => item.level_id == player.level_id),
    炼体: data.LevelMax_list.find(item => item.level_id == player.Physique_id),
    秘境: data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id),
    仙古: data.xiangujinshi_list.find(item => item.level_id == player.xiangulevel_id),
  };
  const 四体系基础 = {
    攻击: 四体系境界.练气.基础攻击 + 四体系境界.炼体.基础攻击 +
      四体系境界.秘境.基础攻击 + 四体系境界.仙古.基础攻击,
    防御: 四体系境界.练气.基础防御 + 四体系境界.炼体.基础防御 +
      四体系境界.秘境.基础防御 + 四体系境界.仙古.基础防御,
    血量: 四体系境界.练气.基础血量 + 四体系境界.炼体.基础血量 +
      四体系境界.秘境.基础血量 + 四体系境界.仙古.基础血量,
  };
  const 命格效果 = getMinggeEffects(player, data.minggeList);
  const 命格四体系加成 = calculateMinggeFourRealmBonus(四体系基础, 命格效果);

  // 先按原公式结算，命格产生的四体系增量留到最后，避免被其他乘区二次放大。
  player.攻击 = 四体系基础.攻击 + 仙古极境加成.攻击 + 阈内攻 + 光阴攻;
  player.防御 = 四体系基础.防御 + 仙古极境加成.防御 + 阈内防 + 光阴防;
  player.血量上限 = 四体系基础.血量 + 仙古极境加成.血量 + 阈内血 + 光阴血;
  player.暴击率 =
    四体系境界.练气.基础暴击 + 四体系境界.炼体.基础暴击 +
    (Number(命格效果.暴击加成) || 0);

  // ===== 阶段2：灵根百分比放大（乘法） =====
  const 灵根攻击 = player.灵根?.攻击 ?? 0;
  const 灵根防御 = player.灵根?.防御 ?? 0;
  const 灵根生命 = player.灵根?.生命 ?? 0;
  player.攻击 = player.攻击 * (1 + 灵根攻击);
  player.防御 = player.防御 * (1 + 灵根防御);
  player.血量上限 = player.血量上限 * (1 + 灵根生命);
  let type = ['武器', '护具', '法宝','帝兵'];
  const equippedStats = calculateEquippedStats(player, type.map(i => equipment[i]));
  player.攻击 = equippedStats.攻击;
  player.防御 = equippedStats.防御;
  player.血量上限 = equippedStats.血量上限;
  for (let i of type) player.暴击率 += equipment[i].bao;
  player.暴击伤害 = player.暴击率 + 1.5;
  if (player.暴击伤害 > 2.5) player.暴击伤害 = 2.5;
  player.暴击伤害 += getPetAbilityBonus(player.仙宠, '暴伤');

  // ===== 阶段5：套装效果（增益相加，不再乘法叠加） =====
  let 套装增益 = { 攻: 0, 防: 0, 血: 0 };
  // 灭仙套
  if (equipment.武器.name == "灭仙剑" && equipment.法宝.name == "灭仙符" && equipment.护具.name == "灭仙衣" && player.魔道值 > 999 && player.灵根.type == "魔头") {
    套装增益.攻 += 0.15;
  }
  // 诛仙套
  if (equipment.武器.name == "诛仙枪" && equipment.法宝.name == "诛仙花" && equipment.护具.name == "诛仙甲" && player.魔道值 > 999 && player.灵根.type == "魔头") {
    套装增益.攻 += 0.05;
    套装增益.血 += 0.2;
  }
  // 光明套
  if (equipment.武器.name == "光明剑" && equipment.法宝.name == "光明符" && equipment.护具.name == "光明衣" && player.魔道值 < 1 && player.灵根.type == "转生") {
    套装增益.攻 += 0.15;
  }
  // 神月套
  if (equipment.武器.name == "神月剑" && equipment.法宝.name == "神日花" && equipment.护具.name == "神星甲" && player.魔道值 < 1 && player.灵根.type == "转生") {
    套装增益.攻 += 0.05;
    套装增益.血 += 0.2;
  }
  // 武祖套
  if (equipment.武器.name == "【武祖】万仙武极天" && equipment.法宝.name == "【神命】无法无天" && equipment.护具.name == "【如梦】道祖的加护" && player.魔道值 < 1 && player.灵根.type == "命运") {
    套装增益.攻 += 2; 套装增益.血 += 2; 套装增益.防 += 2;
  }
  // 邪神套
  if (equipment.武器.name == "【邪神】斩仙灭神剑" && equipment.法宝.name == "【邪神】魔渊的凝视" && equipment.护具.name == "【邪神】冥王真祖甲" && player.魔道值 > 9999 && player.灵根.type == "天魔") {
    套装增益.攻 += 3; 套装增益.血 += 1; 套装增益.防 += 1.5;
  }
  // 光阴套（命运）
  if (equipment.武器.name == "【光阴】天道之剑" && equipment.法宝.name == "【光阴】命运之心" && equipment.护具.name == "【光阴】主宰之甲" && player.灵根.type == "命运") {
    套装增益.攻 += 5; 套装增益.血 += 5; 套装增益.防 += 5;
  }
  // 光阴套（天魔）
  if (equipment.武器.name == "【光阴】天道之剑" && equipment.法宝.name == "【光阴】命运之心" && equipment.护具.name == "【光阴】主宰之甲" && player.灵根.type == "天魔") {
    套装增益.攻 += 6; 套装增益.血 += 4; 套装增益.防 += 5;
  }
  // 超维·天帝剑（命运）
  if (equipment.武器.name == "【超维】天帝剑" && player.灵根.type == "命运") {
    套装增益.攻 += 9; 套装增益.血 += 7; 套装增益.防 += 7;
  }
  // 超维·多元星盘（命运）
  if (equipment.武器.name == "【超维】多元星盘" && player.灵根.type == "命运") {
    套装增益.攻 += 6; 套装增益.血 += 9; 套装增益.防 += 4;
  }
  // 超维·主帝神甲（命运）
  if (equipment.武器.name == "【超维】主帝神甲" && player.灵根.type == "命运") {
    套装增益.攻 += 4; 套装增益.血 += 4; 套装增益.防 += 9;
  }
  // 超维·天帝剑（天魔）
  if (equipment.武器.name == "【超维】天帝剑" && player.灵根.type == "天魔") {
    套装增益.攻 += 14; 套装增益.血 += 7; 套装增益.防 += 7;
  }
  // 超维·多元星盘（天魔）
  if (equipment.武器.name == "【超维】多元星盘" && player.灵根.type == "天魔") {
    套装增益.攻 += 6; 套装增益.血 += 9; 套装增益.防 += 4;
  }
  // 超维·主帝神甲（天魔）
  if (equipment.武器.name == "【超维】主帝神甲" && player.灵根.type == "天魔") {
    套装增益.攻 += 4; 套装增益.血 += 4; 套装增益.防 += 9;
  }
  // 极道帝兵·万物母气鼎
  if (equipment.武器.name == "【极道帝兵】万物母气鼎" && player.灵根.type == "大成圣体") {
    套装增益.攻 += 14; 套装增益.血 += 4; 套装增益.防 += 4;
  }
  // 仙帝器·大罗仙剑（准仙帝+）
  if (equipment.武器.name == "仙帝器·大罗仙剑" && player.mijinglevel_id >= 20) {
    套装增益.攻 += 16.5; 套装增益.血 += 9; 套装增益.防 += 9;
  }
  // 荒剑（仙帝+）
  if (equipment.武器.name == "荒剑" && player.mijinglevel_id >= 21) {
    套装增益.攻 += 19; 套装增益.血 += 9; 套装增益.防 += 9;
  }
  // 天帝鼎（仙帝+）
  if (equipment.武器.name == "天帝鼎" && player.mijinglevel_id >= 21) {
    套装增益.攻 += 19; 套装增益.血 += 9; 套装增益.防 += 9;
  }

  // 祭道甲胄（仙帝+）
  if (equipment.护具.name == "祭道甲胄" && player.mijinglevel_id >= 21) {
    套装增益.攻 += 14; 套装增益.血 += 19; 套装增益.防 += 34;
  }
  // 雷池（仙帝+）
  if (equipment.法宝.name == "雷池" && player.mijinglevel_id >= 21) {
    套装增益.攻 += 19; 套装增益.血 += 19; 套装增益.防 += 19;
  }
  // 统一应用套装增益（增益相加，不再乘法叠加）
  player.攻击 = Math.trunc(player.攻击 * (1 + 套装增益.攻));
  player.防御 = Math.trunc(player.防御 * (1 + 套装增益.防));
  player.血量上限 = Math.trunc(player.血量上限 * (1 + 套装增益.血));

  // 道种的常规百分比属性随装备总属性重算；顶级仙种的固定极境数值已在阶段1单独结算。
  const 道种属性 = player.xiangu_shenhuo?.点燃方式 === '道种孕育'
    ? (player.xiangu_shenhuo.属性加成 || {})
    : {};
  const 道种全属性率 = Number(道种属性.全属性加成) || 0;
  const 道种攻击率 = 道种全属性率 + (Number(道种属性.攻击加成) || 0);
  const 道种防御率 = 道种全属性率 + (Number(道种属性.防御加成) || 0);
  const 道种生命率 = 道种全属性率 + (Number(道种属性.血气加成 ?? 道种属性.生命加成) || 0);
  player.攻击 = Math.trunc((player.攻击 + (Number(道种属性.攻击) || 0)) * (1 + 道种攻击率));
  player.防御 = Math.trunc((player.防御 + (Number(道种属性.防御) || 0)) * (1 + 道种防御率));
  player.血量上限 = Math.trunc((player.血量上限 + (Number(道种属性.血气 ?? 道种属性.生命) || 0)) * (1 + 道种生命率));
  player.暴击率 += Number(道种属性.暴击加成 ?? 道种属性.暴撃加成 ?? 道种属性.暴击) || 0;

  // ===== 阶段6：帝兵全属性（只乘秘境基础+仙古基础，不再乘最终属性） =====
  const 秘境基础数据 = data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id);
  const 仙古基础数据 = data.xiangujinshi_list.find(item => item.level_id == player.xiangulevel_id);
  const 后两层攻 = (秘境基础数据?.基础攻击 || 0) + (仙古基础数据?.基础攻击 || 0);
  const 后两层防 = (秘境基础数据?.基础防御 || 0) + (仙古基础数据?.基础防御 || 0);
  const 后两层血 = (秘境基础数据?.基础血量 || 0) + (仙古基础数据?.基础血量 || 0);
  // 自己铸造的帝兵 → 全额
  if (equipment.帝兵.author_name == player.id) {
    player.攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻);
    player.血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血);
    player.防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防);
  }
  // 特殊帝兵且境界不足 → 1/10
  if ((equipment.帝兵.name == "封神榜" || equipment.帝兵.name == "神女炉" || equipment.帝兵.name == "天庭权杖") && player.mijinglevel_id < 12 && player.xiangulevel_id < 12) {
    player.攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻 / 10);
    player.血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血 / 10);
    player.防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防 / 10);
  } else if (equipment.帝兵 && !equipment.帝兵.author_name) {
    // 无主帝兵 → 全额
    player.攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻);
    player.血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血);
    player.防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防);
  }

  // ===== 阶段7：不参与其他乘区的属性最后加算 =====
  player.攻击 = Math.max(1, player.攻击 + 超出攻 + 命格四体系加成.攻击);
  player.防御 = Math.max(1, player.防御 + 超出防 + 命格四体系加成.防御);
  player.血量上限 = Math.max(1, player.血量上限 + 超出血 + 命格四体系加成.血量);
    await Write_player(usr_qq, player);
    await Add_HP(usr_qq, 0);
    let dir = path.join(__PATH.equipment_path, `${usr_qq}.json`);
    let new_ARR = JSON.stringify(equipment, "", "\t");
    fs.writeFileSync(dir, new_ARR, 'utf8', (err) => {
        console.log('写入成功', err)
    })
    return;
}

export async function Write_linggen(usr_qq) {
  // 1. 读取玩家当前数据
  let player = await Read_player(usr_qq);

const 灵根攻击 = player.灵根?.攻击 ?? 0;
const 灵根防御 = player.灵根?.防御 ?? 0;
const 灵根生命 = player.灵根?.生命 ?? 0;   
player.攻击 = player.攻击 * (1+灵根攻击);
player.防御 = player.防御 *(1+灵根防御);
player.血量上限 = player.血量上限 * (1+灵根生命);
    
    // 生命本源直接加算
    if (player.灵根.生命本源) {
      player.生命本源 = 100+player.灵根.生命本源;
    }
  

  // 5. 保存更新后的玩家数据
  await Write_player(usr_qq, player);

  return ;
}
//读取纳戒信息，返回成一个JavaScript对象
export async function Read_najie(usr_qq) {
  let dir = path.join(`${__PATH.najie_path}/${usr_qq}.json`);
  let najie = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  try {
    najie = JSON.parse(najie);
  } catch {
    //转换不了，纳戒错误
    await fixed(usr_qq);
    najie = await Read_najie(usr_qq);
  }
  return najie;
}
/**
 * 返回该玩家的仙宠图片
 * @return image
 */
export async function get_XianChong_img(e) {
  let i;
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);
  let XianChong_have = [];
  let XianChong_need = [];
  let Kouliang = [];
  let XianChong_list = data.xianchon;
  let Kouliang_list = data.xianchonkouliang;
  for (i = 0; i < XianChong_list.length; i++) {
    if (najie.仙宠.find(item => item.name == XianChong_list[i].name)) {
      XianChong_have.push(XianChong_list[i]);
    } else if (player.仙宠.name == XianChong_list[i].name) {
      XianChong_have.push(XianChong_list[i]);
    } else {
      XianChong_need.push(XianChong_list[i]);
    }
  }
  for (i = 0; i < Kouliang_list.length; i++) {
    Kouliang.push(Kouliang_list[i]);
  }
  let player_data = {
    nickname: player.名号,
    XianChong_have,
    XianChong_need,
    Kouliang,
  };
  const data1 = await new Show(e).get_xianchong(player_data);
  return await puppeteer.screenshot('xianchong', {
    ...data1,
  });
}
/**
 * 通用消息图片
 * @return image
 */
export async function get_log_img(e){
  let log2=e
  let log={
    log:log2
  }

  const data1 = await new Show(e).get_log(log);
  return await puppeteer.screenshot('log', {
    ...data1,
  });
}
export async function get_log3_img(e){
 

  const data1 = await new Show(e).get_log(log);
  return await puppeteer.screenshot('log3', {
    ...data1,
  });
}

/**
 * 沉迷消息图片
 * @return image
 */
export async function get_log2_img(e){
  let log2=e
  let log={
    log:log2
  }

  const data1 = await new Show(e).get_log2(log);
  return await puppeteer.screenshot('log2', {
    ...data1,
  });
}
// 辅助：格式化大数
function fmtNum(n) {
  if (n === null || n === undefined) return '--';
  const value = Number(n);
  if (!Number.isFinite(value)) return '--';
  const trim = num => num.toFixed(1).replace(/\.0$/, '');
  if (value >= 100000000) return trim(value / 100000000) + '亿';
  if (value >= 10000) return trim(value / 10000) + '万';
  return trim(value);
}

function fmtLevel(list, levelId) {
  const id = Number(levelId) || 0;
  const name = list.find(item => Number(item.level_id) === id)?.level;
  return name ? `${name}（${id}级）` : `${id}级`;
}

// 危险等级 → CSS class
function dangerClass(danger) {
  const m = { '极低': 'danger-极低', '中等': 'danger-中等', '高': 'danger-高',
    '极高': 'danger-极高', '致命': 'danger-致命', '不可知': 'danger-不可知', '仙王级': 'danger-仙王级' };
  return m[danger] || 'danger-中等';
}

// 位面 ID → CSS class 后缀
function idToCss(id) { return String(id).replace('.', '_'); }

// 位面 ID → 徽章字
function idToBadge(id) {
  const m = { 0: '凡', 1: '仙', 1.5: '下', 2: '遮', 2.5: '九', 3: '界', 3.5: '墟', 4: '时', 5: '永', 6: '域' };
  return m[id] || '?';
}

export async function get_weimian_img(e) {
  try {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);

    if (!data.existData('player', usr_qq)) return '暂无修仙存档，请先发送 #修仙 创建角色';
    const player = await data.getData('player', usr_qq);

    const mijingLv = player.mijinglevel_id ?? 0;
    const xianguLv = player.xiangulevel_id ?? 0;
    const physiqueLv = player.Physique_id ?? 0;
    const currentPlaceValue = Number(player.power_place ?? 0);
    const currentPlace = Number.isFinite(currentPlaceValue) ? currentPlaceValue : 0;
    const travelTechniqueReduction = getKunpengReduction(player);

    let worldState = {};
    try {
      worldState = JSON.parse(fs.readFileSync(data.filePathMap.weimianList, 'utf8'));
    } catch (error) {
      console.error('读取位面状态失败:', error.message);
    }

    const ID_TO_NAME = {};
    for (const [name, id] of Object.entries(PLACE_LOCATION_MAP)) ID_TO_NAME[id] = name;

    const REALM_DEFS = [
      {
        id: 0, name: '凡间', icon: '🌍', description: '凡尘俗世，修仙起点。天地灵气稀薄但安全稳定，初入仙途的打基础之地。',
        danger: '极低', features: '凡人世界·王朝更替',
        isSpecial: false
      },
      {
        id: 1, name: '仙界', icon: '🌌', description: '仙灵之气充盈之地，大教圣地、仙宫神殿林立，成仙后的主要舞台。',
        danger: '中等', features: '仙气浓郁·大教林立',
        isSpecial: false
      },
      {
        id: 1.5, name: '下界八域', icon: '🏔️', description: '法则残缺的古界，蕴含大机缘。古教传承遍布，成就天神的关键跳板。',
        danger: '高', features: '法则残缺·古教传承',
        isSpecial: false
      },
      {
        id: 2, name: '遮天位面', icon: '🌟', description: '北斗星域，七大生命禁区。成就大帝、红尘仙的试炼场。',
        danger: '极高', features: '生命禁区·帝路争锋',
        isSpecial: false
      },
      {
        id: 2.5, name: '九天十地', icon: '🏛️', description: '乱古战场，仙古纪元遗迹。仙王传承地，异域前线。',
        danger: '极高', features: '仙王传承·乱古战场',
        isSpecial: false
      },
      {
        id: 3, name: '界海', icon: '🌊', description: '诸天万界汇聚地，浪花间沉浮残破古界。准仙帝战场，黑暗源头。',
        danger: '致命', features: '万界沉浮·准仙帝战场',
        isSpecial: false
      },
      {
        id: 3.5, name: '太初星墟', icon: '☄️', description: '开天前残界堆叠成的星海废墟，古老观测站仍在捕捉诸天裂隙。',
        danger: '致命', features: '残界潮汐·裂界观测',
        isSpecial: false
      },
      {
        id: 4, name: '时间长河', icon: '⏳', description: '贯穿古今未来的长河，超脱者的领域。可逆溯万古，窥探未来。',
        danger: '不可知', features: '时间领域·历史长河',
        isSpecial: true
      },
      {
        id: 5, name: '永恒未知之地', icon: '♾️', description: '超脱诸天之外，万法不存。仙帝也无法完全掌握的终极领域。',
        danger: '不可知', features: '诸天之外·终极秘密',
        isSpecial: true
      },
      {
        id: 6, name: '仙域', icon: '✨', description: '完美世界至高净土，仙王巨头坐镇，诸天万界之核心。',
        danger: '仙王级', features: '仙王坐镇·至高净土',
        isSpecial: true
      },
    ];

    const realmList = REALM_DEFS.map(realm => {
      const { id, name } = realm;
      const isCurrent = currentPlace === id;
      const worldOpen = worldState[name] !== 0;
      const baseThreshold = getBaseTravelThreshold(player);
      const locationThreshold = getLocationThreshold(player, name);
      const coordinateKnown = hasCoordinate(player, name);
      const tokenTier = getTokenTier(player);
      const tokenRoute = Boolean(tokenTier && !SPECIAL_LOCATIONS.includes(name));
      const coordinateEngraved = hasEngravedCoordinate(player, name);
      const routeReady = !tokenRoute || coordinateEngraved;
      const thresholdMet = tokenRoute || locationThreshold.ok;
      const unlocked = worldOpen && baseThreshold.ok && coordinateKnown && routeReady && thresholdMet;

      let status_tag = 'locked';
      let status_label = '未解锁';
      if (isCurrent) {
        status_tag = 'current';
        status_label = '当前位置';
      } else if (!worldOpen) {
        status_tag = 'destroyed';
        status_label = '已崩灭';
      } else if (!coordinateKnown) {
        status_label = '坐标未知';
      } else if (tokenRoute && !coordinateEngraved) {
        status_label = '阵图未刻';
      } else if (unlocked) {
        status_tag = 'unlocked';
        status_label = '已解锁';
      }

      const req_items = [
        { label: '位面状态', display: worldOpen ? '开放' : '已崩灭', met: worldOpen },
        ...baseThreshold.checks,
        ...locationThreshold.checks.map(check => ({
          ...check,
          bypassed: tokenRoute && !check.met,
          display: tokenRoute && !check.met ? `${check.display}（传送阵通行）` : check.display,
        })),
        { label: '星空坐标', display: coordinateKnown ? '已知' : '未记录', met: coordinateKnown },
      ];
      if (tokenRoute) {
        req_items.push({ label: '传送阵坐标', display: coordinateEngraved ? '已刻画' : '未刻画', met: coordinateEngraved });
      }

      const bodyQuote = getBodyTravelQuote(player, currentPlace, id);
      let route_label = isCurrent ? '无需穿梭' : '肉身穿梭';
      let xiuweiCost = bodyQuote.xiuweiCost;
      let qixueCost = bodyQuote.qixueCost;
      let shouyuanCost = bodyQuote.shouyuanCost;
      let travelTime = bodyQuote.travelTime;
      let costClass = 'cost-ok';

      if (!isCurrent && tokenRoute) {
        route_label = tokenTier === 'high' ? '高级传送阵' : '传送阵';
        if (coordinateEngraved) {
          xiuweiCost = 0;
          qixueCost = 0;
          shouyuanCost = 0;
          travelTime = getTokenTravelTime(player, currentPlace, id, tokenTier);
        } else {
          xiuweiCost = null;
          qixueCost = null;
          shouyuanCost = null;
          travelTime = null;
          costClass = 'cost-muted';
        }
      }

      const resourceClass = (cost, current) => {
        if (cost === null) return 'cost-muted';
        return Number(current || 0) >= cost ? 'cost-ok' : 'cost-fail';
      };

      return {
        id_css: idToCss(id),
        id_badge: idToBadge(id),
        name: realm.name,
        icon: realm.icon,
        description: realm.description,
        isSpecial: realm.isSpecial,
        features: realm.features,
        danger: realm.danger,
        status_tag,
        status_label,
        danger_class: dangerClass(realm.danger),
        req_items,
        route_label,
        cost_xiuwei: fmtNum(xiuweiCost),
        cost_xueqi: fmtNum(qixueCost),
        cost_shouyuan: fmtNum(shouyuanCost),
        cost_xiuwei_class: costClass === 'cost-muted' ? costClass : resourceClass(xiuweiCost, player.修为),
        cost_xueqi_class: costClass === 'cost-muted' ? costClass : resourceClass(qixueCost, player.血气),
        cost_shouyuan_class: costClass === 'cost-muted' ? costClass : resourceClass(shouyuanCost, player.寿元),
        cost_time: travelTime === null ? '--' : `${fmtNum(travelTime)}分钟`,
        hasKunpeng: !tokenRoute && bodyQuote.kunpengReduction > 0,
        kunpengReduction: bodyQuote.kunpengReduction,
        unlocked: isCurrent || unlocked,
      };
    });

    const unlockedCount = realmList.filter(realm => realm.unlocked).length;
    const total = realmList.length;

    const playerData = {
      nickname: player.名号 || usr_qq,
      current_location_name: ID_TO_NAME[currentPlace] || '未知',
      teleport_tokens: player.位面传送次数 || 0,
      advanced_teleport_tokens: player.高级传送次数 || 0,
      cultivationLevel: fmtLevel(data.Level_list, player.level_id),
      physiqueLevel: fmtLevel(data.LevelMax_list, physiqueLv),
      mijinLevel: fmtLevel(data.Levelmijing_list, mijingLv),
      xianguLevel: fmtLevel(data.xiangujinshi_list, xianguLv),
      travelTechnique: travelTechniqueReduction > 0
        ? `鲲鹏宝术（-${travelTechniqueReduction}分）`
        : '无',
      unlocked: unlockedCount,
      total,
      progress: Math.round((unlockedCount / total) * 100),
      realmList,
    };

    const renderData = await new Show(e).get_weimianData(playerData);
    return await puppeteer.screenshot('weimian', renderData);

  } catch (err) {
    console.error('生成位面图鉴失败:', err);
    return `生成位面图鉴失败：${err.message}`;
  }
}
/**
 * 返回该图片
 * @return image
 */
export async function get_daoju_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);
  let daoju_have = [];
  let daoju_need = [];
  for (const i of data.daoju_list) {
    if (najie.道具.find(item => item.name == i.name)) {
      daoju_have.push(i);
    } else {
      daoju_need.push(i);
    }
  }
  let player_data = {
    user_id: usr_qq,
    nickname: player.名号,
    daoju_have,
    daoju_need,
  };
  const data1 = await new Show(e).get_daojuData(player_data);
  return await puppeteer.screenshot('daoju', {
    ...data1,
  });
}

/**
 * 返回该玩家的武器图片
 * @return image
 */
export async function get_wuqi_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);
  let equipment = await Read_equipment(usr_qq);
  let wuqi_have = [];
  let wuqi_need = [];
  const wuqi_list = [
    'equipment_list',
    'dibing_list',
    'tszb_list',
    'timeequipmen_list',
    'duanzhaowuqi',
    'duanzhaohuju',
    'duanzhaobaowu',
  ];
  let zb = [];
  for (const i of wuqi_list) {
    for (const j of data[i]) {
      if (
        najie['装备'].find(item => item.name == j.name) &&
        !wuqi_have.find(item => item.name == j.name)
      ) {
        wuqi_have.push(j);
      } else if (
        (equipment['武器'].name == j.name ||
          equipment['法宝'].name == j.name ||
          equipment['护具'].name == j.name||
          equipment['帝兵'].name == j.name) &&
        !wuqi_have.find(item => item.name == j.name)
      ) {
        wuqi_have.push(j);
      } else if (!wuqi_need.find(item => item.name == j.name)) {
        wuqi_need.push(j);
      }
    }
  }

  let player_data = {
    user_id: usr_qq,
    nickname: player.名号,
    wuqi_have,
    wuqi_need,
  };
  const data1 = await new Show(e).get_wuqiData(player_data);
  return await puppeteer.screenshot('wuqi', {
    ...data1,
  });
}
export async function get_neijingdi_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) {
        return e.reply('请先创建角色');
    }
    
    // 获取玩家数据和内景地数据
    const player = await data.getData('player', usr_qq);
    const innerWorld = await data.getData('inner_world', usr_qq);
    
    // 检查是否已开辟内景地
    if (player.内景地开辟 !== 1) {
        return e.reply('尚未开辟内景地空间');
    }
    
    // 获取当前时间戳
    const now = Date.now();
    
    // 定义时间格式化函数 - 显示具体日期时间和相对时间
    const formatStorageTime = (timestamp) => {
        if (!timestamp) return { absolute: '未知时间', relative: '未知时间前存放' };
        
        try {
            // 确保时间戳是数字
            timestamp = Number(timestamp);
            
            // 检查时间戳单位（毫秒或秒）
            if (timestamp < 10000000000) {
                timestamp *= 1000; // 转换为毫秒
            }
            
            const date = new Date(timestamp);
            
            // 1. 格式化绝对时间（具体日期时间）
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const absoluteTime = `${year}年${month}月${day}日 ${hours}:${minutes}`;
            
            // 2. 计算相对时间（几天前几点几分存放）
            const diffMs = now - timestamp;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            let relativeTime = '';
            if (diffDays > 0) {
                relativeTime = `${diffDays}天前 ${hours}:${minutes}存放`;
            } else if (diffHours > 0) {
                relativeTime = `${diffHours}小时${diffMinutes}分钟前存放`;
            } else if (diffMinutes > 0) {
                relativeTime = `${diffMinutes}分钟前存放`;
            } else {
                relativeTime = '刚刚存放';
            }
            
            return {
                absolute: absoluteTime,
                relative: relativeTime
            };
        } catch (err) {
            console.error('时间格式化错误:', err);
            return {
                absolute: '时间错误',
                relative: '时间错误'
            };
        }
    };
    
    // 动态分类内景地物品
    const categorizedItems = {};
    const VALID_CATEGORIES = ["装备","丹药", "道具", "功法", "草药",  "食材", "材料", "仙宠口粮", "盒子", "仙宠"];
    
    VALID_CATEGORIES.forEach(category => {
        if (innerWorld[category] && innerWorld[category].length > 0) {
            categorizedItems[category] = innerWorld[category].map(item => {
                // 生成星星字符串
                const stars = item.稀有度 ? '★'.repeat(item.稀有度) : '';
                
                // 格式化时间
                const timeInfo = formatStorageTime(item.存入时间);
                
                return {
                    name: item.name,
                    amount: item.数量 || 1,
                    pinji: item.pinji || null,
                    rarity: item.稀有度 || null,
                    storageTimeAbsolute: timeInfo.absolute, // 绝对时间
                    storageTimeRelative: timeInfo.relative, // 相对时间
                    stars: stars // 添加星星字符串
                };
            });
        }
    });
    
    // 计算空间使用率
    const usedPercent = Math.round((innerWorld.当前容量 / innerWorld.最大容量) * 100);
    
    // 格式化最后更新时间
    const lastUpdateInfo = formatStorageTime(innerWorld.最后更新时间);
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号,
        innerWorld: {
            level: innerWorld.等级,
            spiritStones: innerWorld.灵石,
            currentCapacity: innerWorld.当前容量,
            maxCapacity: innerWorld.最大容量,
            usedPercent: usedPercent,
            upgradeCost: innerWorld.等级 * 500000, // 示例：每级升级需要100源石
            lastUpdateAbsolute: lastUpdateInfo.absolute, // 最后更新绝对时间
            lastUpdateRelative: lastUpdateInfo.relative, // 最后更新相对时间
            categorizedItems: categorizedItems // 分类物品
        },
        sortedCategories: Object.keys(categorizedItems).sort()
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_neijingdiData(renderData);
    return await puppeteer.screenshot('neijingdi', templateData);
}
// 时间戳转换函数
function formatStorageTime(timestamp) {
    if (!timestamp) return '未知时间';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // 如果是今天，显示具体时间
    if (diffDays === 0) {
        return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    // 如果是昨天
    else if (diffDays === 1) {
        return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    // 如果是7天内
    else if (diffDays < 7) {
        return `${diffDays}天前`;
    }
    // 其他情况显示完整日期
    else {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }
}
/**
 * 返回该玩家的丹药图片
 * @return image
 */
export async function get_danyao_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  const player = await Read_player(usr_qq);
  const najie = await Read_najie(usr_qq);
  let danyao_have = [];
  let danyao_need = [];
  const danyao = ['danyao_list', 'timedanyao_list', 'newdanyao_list'];
  for (const i of danyao) {
    for (const j of data[i]) {
      if (
        najie['丹药'].find(item => item.name == j.name) &&
        !danyao_have.find(item => item.name == j.name)
      ) {
        danyao_have.push(j);
      } else if (!danyao_need.find(item => item.name == j.name)) {
        danyao_need.push(j);
      }
    }
  }
  let player_data = {
    user_id: usr_qq,
    nickname: player.名号,
    danyao_have,
    danyao_need,
  };
  const data1 = await new Show(e).get_danyaoData(player_data);
  return await puppeteer.screenshot('danyao', {
    ...data1,
  });
}
export async function get_linggen_img(e) {
    let player; // 将 player 声明在函数顶部
    
    try {
        // 1. 获取玩家数据
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        player = await Read_player(usr_qq);
        
        // 2. 获取所有灵根数据
        const allLinggen = data.talent_list;
        
        // 辅助函数：计算品质类
        function calculateQualityClass(linggen) {
            const attackBonus = parseFloat(linggen.攻击 || 0);
            const defenseBonus = parseFloat(linggen.防御 || 0);
            const healthBonus = parseFloat(linggen.生命 || 0);
            const totalBonus = attackBonus + defenseBonus + healthBonus;
            
            if (totalBonus >= 3.0) return 'quality-rainbow';
            if (totalBonus >= 2.5) return 'quality-red';
            if (totalBonus >= 2.0) return 'quality-orange';
            if (totalBonus >= 1.5) return 'quality-gold';
            if (totalBonus >= 1.0) return 'quality-purple';
            if (totalBonus >= 0.5) return 'quality-blue';
            if (totalBonus >= 0.2) return 'quality-green';
            return 'quality-white';
        }
        
        // 3. 按归类分组灵根（优先使用"归类"属性，没有则使用"type"）
        const linggenGroups = {};
        allLinggen.forEach(linggen => {
            // 确定分组键 - 优先使用"归类"属性
            const groupKey = linggen.归类 || linggen.type || "其他";
            
            if (!linggenGroups[groupKey]) {
                linggenGroups[groupKey] = [];
            }
            
            // 格式化属性显示
            const formattedLinggen = {
                ...linggen,
                eff: `${(linggen.eff * 100).toFixed(0)}%`,
                法球倍率: `${(linggen.法球倍率 * 100).toFixed(0)}%`,
                攻击加成: `${((linggen.攻击 || 0) * 100).toFixed(0)}%`,
                防御加成: `${((linggen.防御 || 0) * 100).toFixed(0)}%`,
                生命加成: `${((linggen.生命 || 0) * 100).toFixed(0)}%`,
                生命本源: linggen.生命本源 || 0,
                isCurrent: player.灵根?.id === linggen.id,
                qualityClass: calculateQualityClass(linggen)
            };
            
            linggenGroups[groupKey].push(formattedLinggen);
        });
        
        // 4. 构建模板数据
        const templateData = {
            title: "灵根图鉴",
            current: player.灵根?.name || "无",
            groups: Object.entries(linggenGroups).map(([groupName, linggens]) => ({
                groupName,
                linggens
            })),
            totalLinggens: allLinggen.length
        };
        
        // 5. 获取模板数据
        const data1 = await new Show(e).get_linggenData(templateData);
        
        // 6. 生成图片
        return await puppeteer.screenshot('linggen', {
            ...data1,
        });
        
    } catch (err) {
        console.error('生成灵根图鉴失败:', err);
        
        // 降级方案：返回文本信息
        // 确保 player 变量已定义
        const currentLinggenName = player ? (player.灵根?.name || "无") : "无";
        
        return [
            `【灵根图鉴】`,
            `生成图片失败: ${err.message}`,
            `当前灵根: ${currentLinggenName}`,
            ...data.talent_list.map(l => 
                `${l.name}(${l.type}): 修${(l.eff*100).toFixed(0)}% 攻${((l.攻击||1)*100-100).toFixed(0)}%`
            )
        ].join('\n');
    }
}

export async function get_mingge_img(e) {
  try {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await existplayer(usr_qq) ? await Read_player(usr_qq) : null;
    const templateData = buildMinggeAtlasData(data.minggeList, player);
    const renderData = await new Show(e).get_minggeData(templateData);
    return await puppeteer.screenshot('mingge', renderData);
  } catch (err) {
    console.error('生成命格图鉴失败:', err);
    return `生成命格图鉴失败：${err.message}`;
  }
}
/**
 * 返回该玩家的功法图片
 * @return image
 */
export async function get_gongfa_img(e) {
  let i;
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let xuexi_gongfa = player.学习的功法;
  let gongfa_have = [];
  let gongfa_need = [];
  const gongfa = ['gongfa_list', 'timegongfa_list', 'dijingList'];
  for (const i of gongfa) {
    for (const j of data[i]) {
      if (
        xuexi_gongfa.find(item => item == j.name) &&
        !gongfa_have.find(item => item.name == j.name)
      ) {
        gongfa_have.push(j);
      } else if (!gongfa_need.find(item => item.name == j.name)) {
        gongfa_need.push(j);
      }
    }
  }
  let player_data = {
    user_id: usr_qq,
    nickname: player.名号,
    gongfa_have,
    gongfa_need,
  };
  const data1 = await new Show(e).get_gongfaData(player_data);
  return await puppeteer.screenshot('gongfa', {
    ...data1,
  });
}
export async function get_hecheng_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) return;
    
    // 获取玩家数据和合成列表
    const player = await data.getData('player', usr_qq);
    const hechengItems = data.hecheng_list;
    
    // 动态分类合成项目[1](@ref)
    const categorizedItems = {};
    
    hechengItems.forEach(item => {
        const category = item.class || '材料';
        if (!categorizedItems[category]) {
            categorizedItems[category] = [];
        }
        
        categorizedItems[category].push({
            name: item.name,
            materials: item.materials.map(mat => ({
                name: mat.name,
                class: mat.class,
                amount: mat.amount
            }))
        });
    });
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号,
        categorizedItems,
        unlockedCount: player.hecheng_unlocked || 0,
        totalCount: hechengItems.length,
        // 新增分类排序功能
        sortedCategories: Object.keys(categorizedItems).sort()
    };
    
    // 获取渲染数据并生成截图[5,7](@ref)
    const templateData = await new Show(e).get_hechengData(renderData);
    return await puppeteer.screenshot('hecheng', templateData);
}
export async function get_xiuxianqiandao_img(e, player, gift_xiuwei, yuanshi, ticketCount, isSignedToday = false) {
    // 获取玩家境界信息
    const 练气 = data.Level_list.find(item => item.level_id == player.level_id);
    const 炼体 = data.LevelMax_list.find(item => item.level_id == player.Physique_id);
    const 秘境体系 = data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id);
    const 仙古今世法 = data.xiangujinshi_list.find(item => item.level_id == player.xiangulevel_id);
    
    // 获取当前日期信息
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // 生成日历数据
    const calendarData = await generateCalendarData(player, year, month);
    
    // 准备渲染数据
    const renderData = {
        nickname: player.名号 || "修仙者",
        signDays: player.连续签到天数 || 1,
        realm1: 练气.level || 练气.level_name || "未知",
        realm2: 炼体.level || 炼体.level_name || "未知",
        realm3: 秘境体系.level || "未知",
        realm4: 仙古今世法.level || "未知",
        xiuwei: isSignedToday ? "0 (已签到)" : bigNumberTransform(gift_xiuwei),
        xueqi: isSignedToday ? "0 (已签到)" : bigNumberTransform(gift_xiuwei),
        lingshi: isSignedToday ? "0 (已签到)" : bigNumberTransform(yuanshi),
        yuanshi: isSignedToday ? "0 (已签到)" : bigNumberTransform(yuanshi),
        tickets: isSignedToday ? "0 (已签到)" : ticketCount,
        isDaofaPlayer: player.daofaxianshu == 2,
        calendar: calendarData
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_qiandaoData(renderData);
    return await puppeteer.screenshot('xiuxianqiandao', templateData);
}
export async function generateCalendarData(player, year, month) {
    // 如果玩家不存在，返回空日历
    if (!player) {
        const totalDays = new Date(year, month, 0).getDate();
        const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
        
        return {
            year: year,
            month: month,
            signedCount: 0,
            totalDays: totalDays,
            progress: 0,
            emptyDays: firstDayOfMonth,
            days: []
        };
    }
    
    // 初始化签到记录对象
    if (!player.signRecord) {
        player.signRecord = {};
    }
    
    // 创建月份键名
    const monthKey = `${year}-${month}`;
    
    // 计算正确的总天数
    const correctTotalDays = new Date(year, month, 0).getDate();
    
    // 获取月份数据
    let monthData = player.signRecord[monthKey];
    
    // 如果月份数据不存在，创建新数据
    if (!monthData) {
        monthData = {
            signedDays: [],
            totalDays: correctTotalDays
        };
        player.signRecord[monthKey] = monthData;
    }
    
    // 确保总天数正确
    if (monthData.totalDays !== correctTotalDays) {
        monthData.totalDays = correctTotalDays;
    }
    
    // 2. 获取当月第一天是星期几（0=周日）
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    
    // 3. 获取当前日期
    const now = new Date();
    const currentDay = now.getDate();
    
    // 4. 生成日期数组
    const days = [];
    for (let d = 1; d <= monthData.totalDays; d++) {
        // 计算每个日期的星期几
        const date = new Date(year, month - 1, d);
        const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
        
        days.push({
            day: d,
            isSigned: monthData.signedDays.includes(d),
            isToday: d === currentDay,
            dayOfWeek: dayOfWeek
        });
    }
    
    // 5. 计算签到进度
    const progress = Math.floor((monthData.signedDays.length / monthData.totalDays) * 100);
    
    // 添加详细日志
    console.log(`[日历数据] ${year}年${month}月`);
    console.log(` - 总天数: ${monthData.totalDays}`);
    console.log(` - 已签天数: ${monthData.signedDays.length}`);
    console.log(` - 签到日期: ${monthData.signedDays.join(', ') || '无'}`);
    
    return {
        year: year,
        month: month,
        signedCount: monthData.signedDays.length,
        totalDays: monthData.totalDays,
        progress: progress,
        emptyDays: firstDayOfMonth,
        days: days
    };
}
export async function get_chengjiu_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) return;
    
    // 获取玩家数据和成就列表
    const player = await data.getData('player', usr_qq);
    const chengjiuItems = data.chengjiu_list;
    
    // 动态分类成就项目
    const categorizedItems = {};
    let unlockedCount = 0;
    
    chengjiuItems.forEach(item => {
        const category = item.type || '其他成就';
        if (!categorizedItems[category]) {
            categorizedItems[category] = [];
        }
        
        // 检查成就是否已解锁 - 使用成就ID匹配
        const unlocked = player.成就 && Array.isArray(player.成就) && 
                         player.成就.includes(item.id.toString());
        
        if (unlocked) unlockedCount++;
        
        categorizedItems[category].push({
            id: item.id,
            name: item.name,
            desc: item.desc,
            unlocked: unlocked
        });
    });
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号 || "未知玩家",
        categorizedItems: categorizedItems,
        unlockedCount: unlockedCount,
        totalCount: chengjiuItems.length,
        sortedCategories: Object.keys(categorizedItems).sort()
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_chengjiuData(renderData);
    return await puppeteer.screenshot('chengjiu', templateData);
}

export async function get_lqpf_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) return;
    
    // 获取玩家数据
    const player = await data.getData('player', usr_qq);
    
    // 获取皮肤目录路径
    const skinDir = __PATH.player_pifu_path;
    
    // 读取所有皮肤文件
    let skinFiles = [];
    try {
        skinFiles = fs.readdirSync(skinDir).filter(file => 
            file.endsWith('.jpg') || file.endsWith('.png')
        );
    } catch (err) {
        console.error('读取皮肤目录失败:', err);
        return '获取皮肤数据失败，请检查目录配置';
    }
    
    // 构建皮肤数据
    const skinData = skinFiles.map(file => {
        const id = path.basename(file, path.extname(file));
        return {
            id,
            name: `练气·${id}`,
            path: path.join(skinDir, file),
            isEquipped: player.练气皮肤 === id
        };
    });
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号 || "无名修士",
        skinData: skinData,
        totalCount: skinFiles.length,
        equippedCount: skinData.filter(skin => skin.isEquipped).length
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_lqpfData(renderData);
    return await puppeteer.screenshot('lqpf', templateData);
}
export async function get_xigen_img(e) {
    try {
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await channel(usr_qq);

        // 1. 验证玩家是否存在
        if (!data.existData('player', usr_qq)) return;

        // 2. 异步读取所有玩家文件
        const files = await fs.promises.readdir(__PATH.player_path);
        const jsonFiles = files.filter(file => file.endsWith(".json"));

        // 3. 并行读取玩家数据（提升效率）
        const players = await Promise.all(
            jsonFiles.map(async file => {
                const qq = file.replace(".json", '');
                const player = await Read_player(parseInt(qq));
                
                // 处理洗根次数未找到的情况，设为0
                const washCount = player.洗根次数 || 0;
                
                return {
                    qq,
                    name: player.名号,
                    washCount: washCount,
                    linggen: player.灵根
                };
            })
        );

        // 4. 过滤掉洗根次数为0的玩家
        const filteredPlayers = players.filter(p => p.washCount > 0);
        


        // 5. 按洗根次数降序排序
        filteredPlayers.sort((a, b) => b.washCount - a.washCount);

        // 6. 获取当前用户排名（只考虑有洗根次数的玩家）
        const userWashCount = players.find(p => p.qq === usr_qq)?.washCount || 0;
        const usr_paiming = userWashCount > 0 ? 
            filteredPlayers.findIndex(p => p.qq === usr_qq) + 1 : 
            filteredPlayers.length + 1; // 如果用户洗根次数为0，则排在最后

        // 7. 仅取前20名（避免逻辑矛盾）
        const topPlayers = filteredPlayers.slice(0, 20).map((p, index) => ({
            ...p,
            rank: index + 1
        }));

        // 8. 构造渲染数据
        const renderData = {
            currentPlayer: { 
                qq: usr_qq, 
                rank: usr_paiming,
                washCount: userWashCount
            },
            topPlayers: topPlayers,
            totalPlayers: filteredPlayers.length // 有洗根次数的玩家总数
        };

        // 9. 生成截图
        const templateData = await new Show(e).get_xigenData(renderData);
        return await puppeteer.screenshot('xigen', templateData);
    } catch (error) {
        console.error("洗根榜生成失败:", error);
        return null;
    }
}
export async function get_duihuan_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) return;
    
    // 获取玩家数据和兑换列表
    const player = await data.getData('player', usr_qq);
    const giftPacks = data.duihuan; // 从数据源获取兑换列表
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号 || '道友',
        giftPacks: giftPacks,
        currency: {
            points: player.积分 || 0,
            tokens: player.代币 || 0
        }
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_duihuanData(renderData);
    return await puppeteer.screenshot('duihuan', templateData);
}
export async function get_wmtj_img(e) {
    // 用户ID处理
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 验证玩家是否存在
    if (!data.existData('player', usr_qq)) return;
    
    // 获取玩家数据和位面天骄列表
    const player = await data.getData('player', usr_qq);
    const tianjiaoItems = data.weimiantianjiao_list;
    
    // 格式化天骄数据中的大数字
    const formattedTianjiaoItems = tianjiaoItems.map(tianjiao => {
        return {
            ...tianjiao,
            攻击: bigNumberTransform(tianjiao.攻击),
            防御: bigNumberTransform(tianjiao.防御),
            血量: bigNumberTransform(tianjiao.血量),
            血量上限: bigNumberTransform(tianjiao.血量上限)
        };
    });
    
    // 准备渲染数据
    const renderData = {
        user_id: usr_qq,
        nickname: player.名号 || "未知修士",
        tianjiaoItems: formattedTianjiaoItems,
        totalCount: tianjiaoItems.length
    };
    
    // 获取渲染数据并生成截图
    const templateData = await new Show(e).get_wmtjData(renderData);
    return await puppeteer.screenshot('wmtj', templateData);
}
export async function get_character_img(e) {
    try {
        // 1. 获取玩家数据
        let usr_qq = e.user_id.toString().replace('qg_','');
        usr_qq = await channel(usr_qq);
        
        // 验证玩家是否存在
        if (!data.existData('player', usr_qq)) return;
        
        const player = await data.getData('player', usr_qq);
        
        // 2. 获取剧情人物数据
        const characters = data.juqingrenwu_list;
        
        // 3. 获取玩家已解锁的剧情人物
        const unlockedCharacters = player.剧情人物 || [];
        const unlockedMap = {};
        
        // 创建已解锁人物的映射
        unlockedCharacters.forEach(char => {
            // 获取人物标识（如"柳神"）
            const charKey = Object.keys(char).find(key => 
                key !== "关系" && key !== "好感度" && key !== "解锁时间" && key !== "事件记录"
            );
            
            if (charKey) {
                unlockedMap[charKey] = {
                    关系: char.关系,
                    好感度: char.好感度
                };
            }
        });
        
        // 4. 按位面对人物进行分类，并标记解锁状态
        const realms = {};
        characters.forEach(character => {
            // 处理位面信息 - 可能包含多个位面
            const characterRealms = character.位面.split('/');
            
            // 检查是否已解锁
            const isUnlocked = !!unlockedMap[character.名号];
            const relationInfo = isUnlocked ? unlockedMap[character.名号] : null;
            
            characterRealms.forEach(realm => {
                if (!realms[realm]) {
                    realms[realm] = [];
                }
                
                // 添加解锁状态和关系信息
                realms[realm].push({
                    ...character,
                    已解锁: isUnlocked,
                    关系: relationInfo ? relationInfo.关系 : 0,
                    好感度: relationInfo ? relationInfo.好感度 : 0
                });
            });
        });
        
        // 转换为数组格式用于模板渲染
        const realmArray = Object.entries(realms).map(([name, characters]) => ({
            name,
            characters
        }));
        
        // 5. 计算解锁进度
        const unlockedCount = Object.keys(unlockedMap).length;
        const totalCharacters = characters.length;
        
        // 6. 构建模板数据
        const templateData = {
            realms: realmArray,
            totalCharacters,
            unlockedCount,
            progressPercentage: totalCharacters > 0 ? Math.round((unlockedCount / totalCharacters) * 100) : 0
        };
        
        // 7. 获取模板数据并生成截图
        const renderData = await new Show(e).get_characterData(templateData);
        return await puppeteer.screenshot('character', renderData);
        
    } catch (err) {
        console.error('生成人物图鉴失败:', err);
        return `生成人物图鉴失败: ${err.message}`;
    }
}
export async function get_announce_img(e) {
    try {
        // 1. 获取玩家数据
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await channel(usr_qq);

        // 验证玩家是否存在
        if (!data.existData('player', usr_qq)) return;

        const player = await data.getData('player', usr_qq);

        // 2. 读取公告数据（后端存储于 data/announce.json，缺失时回退空结构）
        function loadAnnounce() {
            try {
                return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'announce.json'), 'utf8'));
            } catch (err) {
                console.error('读取更新公告数据失败，使用空结构：', err.message);
                return { version: 'v1.0 诸天修仙', date: '2026.08', updates: [], changelog: [] };
            }
        }
        const ann = loadAnnounce();
        const updates = ann.updates || [];
        const rawGroups = ann.changelog || [];

        // 3. 扁平化提交日志（已是时间倒序），用于分页
        const allEntries = [];
        for (const g of rawGroups) {
            for (const it of (g.items || [])) {
                allEntries.push({ date: g.date, hash: it.hash, msg: it.msg, detail: it.detail || '' });
            }
        }

        // 4. 解析页码（#更新公告=1，#更新公告2=2...）并切片
        const pageMatch = e.msg.match(/#更新公告\s*(\d+)/);
        const requestedPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;
        const PAGE_SIZE = 8;
        const totalPages = Math.max(1, Math.ceil(allEntries.length / PAGE_SIZE));
        const page = Math.min(Math.max(requestedPage, 1), totalPages);
        const segStart = (page - 1) * PAGE_SIZE;
        const pageEntries = allEntries.slice(segStart, segStart + PAGE_SIZE);
        const showOverview = page === 1;

        // 5. 本页按日期重新分组，供前端遍历
        const changelog = [];
        for (const entry of pageEntries) {
            let last = changelog[changelog.length - 1];
            if (!last || last.date !== entry.date) {
                last = { date: entry.date, items: [] };
                changelog.push(last);
            }
            last.items.push({ hash: entry.hash, msg: entry.msg, detail: entry.detail });
        }

        // 6. 天骄属性一览（动态拉取，仅首页展示）
        const tianjiaoItems = showOverview
            ? (data.weimiantianjiao_list || []).map(t => ({
                名号: t.名号,
                avatar: (t.名号 || '修').substr(0, 1),
                境界: t.境界 || '未知',
                速度: t.速度 ?? 100,
                秘境: t.mijinglevel_id ?? 1,
                仙古: t.xiangulevel_id ?? 1
            }))
            : [];

        // 7. 剧情人物收集进度（动态拉取，仅首页展示）
        const characters = data.juqingrenwu_list || [];
        const unlockedCharacters = player.剧情人物 || [];
        const unlockedMap = {};
        unlockedCharacters.forEach(char => {
            const charKey = Object.keys(char).find(key =>
                key !== '关系' && key !== '好感度' && key !== '解锁时间' && key !== '事件记录'
            );
            if (charKey) unlockedMap[charKey] = true;
        });
        const unlockedCount = showOverview ? Object.keys(unlockedMap).length : 0;
        const totalCharacters = showOverview ? characters.length : 0;
        const progressPercentage = totalCharacters > 0 ? Math.round((unlockedCount / totalCharacters) * 100) : 0;

        // 8. 构建模板数据
        const renderData = {
            nickname: player.名号 || '无名修士',
            version: ann.version || 'v1.0 诸天修仙',
            date: ann.date || '2026.08',
            updates: showOverview ? updates : [],
            changelog,
            tianjiaoItems,
            unlockedCount,
            totalCharacters,
            progressPercentage,
            page,
            totalPages,
            hasMore: page < totalPages
        };

        // 9. 渲染并截图
        const templateData = await new Show(e).get_announceData(renderData);
        return await puppeteer.screenshot('announce', templateData);

    } catch (err) {
        console.error('生成更新公告失败:', err);
        return `生成更新公告失败: ${err.message}`;
    }
}
export async function get_power_img(e) {
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let player = await data.getData('player', usr_qq);
    let lingshi = Math.trunc(player.灵石);
    if (player.灵石 > 999999999999) {
        lingshi = 999999999999;
    }
    data.setData('player', usr_qq, player);
    await player_efficiency(usr_qq);
    
    if (!isNotNull(player.level_id)) {
        e.reply('请先#同步信息');
        return;
    }
    
    let this_association;
    if (!isNotNull(player.宗门)) {
        this_association = {
            宗门名称: '无',
            职位: '无',
        };
    } else {
        this_association = player.宗门;
    }
    
    // 境界名字需要查找境界名
    let levelMax = data.LevelMax_list.find(
        item => item.level_id == player.Physique_id
    ).level;
    let need_xueqi = data.LevelMax_list.find(
        item => item.level_id == player.Physique_id
    ).exp;
    
    // 功法层级分类
    const gongfaHierarchy = {
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
        "天帝经": 3.5 // 新增层级，高于仙帝法
    };
    
    // 获取所有功法数据
    const allGongfa = await data.gongfa_list;
    
    // 加载限定功法列表
    const timegongfa_list = await data.timegongfa_list;
    
    // 初始化分类对象
    const categorizedGongfa = {};
    
    // 初始化分类
    for (const category in gongfaHierarchy) {
        categorizedGongfa[category] = [];
    }
    
    // 添加"未知"分类
    categorizedGongfa["未知"] = [];
    
    // 获取玩家自创帝经列表
    const customSutras = await data.dijingList; // 假设 data.dijingList 是玩家自创帝经列表
    
    // 遍历玩家已学习的功法
    if (player.学习的功法 && player.学习的功法.length > 0) {
        for (const gongfaName of player.学习的功法) {
            // 首先检查是否为玩家自创帝经
            const isCustomSutra = customSutras.some(item => item.name === gongfaName);
            
            if (isCustomSutra) {
                // 玩家自创帝经归入"玩家自创帝经"类别
                categorizedGongfa["天帝经"].push(gongfaName);
                continue; // 跳过后续检查
            }
            
            // 检查是否为限定功法
            const isTimeLimited = timegongfa_list.some(item => item.name === gongfaName);
            
            if (isTimeLimited) {
                // 限定功法直接归入"限定功法"类别
                categorizedGongfa["限定功法"].push(gongfaName);
                continue; // 跳过后续检查
            }
            
            // 在全局功法数据中查找匹配的功法
            const gongfa = allGongfa.find(item => item.name === gongfaName);
            
            if (gongfa && gongfa.type) {
                // 检查功法类型是否在层级映射中
                if (gongfaHierarchy.hasOwnProperty(gongfa.type)) {
                    categorizedGongfa[gongfa.type].push(gongfaName);
                } else {
                    categorizedGongfa["未知"].push(gongfaName);
                }
            } else {
                categorizedGongfa["未知"].push(gongfaName);
            }
        }
    }
    
    // 构建玩家数据
    let playercopy = {
        user_id: usr_qq,
        nickname: player.名号,
        need_xueqi: need_xueqi,
        xueqi: player.血气,
        levelMax: levelMax,
        lingshi: lingshi,
        镇妖塔层数: player.镇妖塔层数,
        神魄段数: player.神魄段数,
        hgd: player.favorability,
        player_maxHP: player.血量上限,
        player_nowHP: player.当前血量,
        learned_gongfa: player.学习的功法,
        categorized_gongfa: categorizedGongfa, // 使用正确的属性名
        timegongfa_list: timegongfa_list,
        association: this_association,
        dijingList:customSutras
    };
    
    const data1 = await new Show(e).get_playercopyData(playercopy);
    return await puppeteer.screenshot('playercopy', {
        ...data1,
    });
}
// 新建 utils.js
export function getPinjiName(index) {
  return ['劣','普','优','精','极','绝'][index] || '未知';
}
/**
 * 返回该玩家的存档图片
 * @return image
 */
export async function get_player_img(e) {
  let 法宝评级;
  let 护具评级;
  let 武器评级;
  let 帝兵评级;
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let equipment = await data.getData('equipment', usr_qq);
  let player_status = await getPlayerAction(usr_qq);
  let status = '空闲';
  if (player_status.time != null) {
    status = player_status.action + '(剩余时间:' + player_status.time + ')';
  }
  let lingshi = Math.trunc(player.灵石);
  // if (player.灵石 > 999999999999) {
  //   lingshi = 999999999999;
  // }
  if (player.宣言 == null || player.宣言 == undefined) {
    player.宣言 = '这个人很懒什么都没写';
  }
  if (player.灵根 == null || player.灵根 == undefined) {
    player.灵根 = await get_random_talent();
  }
  if (player.天资等级 == null || player.天资等级 == undefined) {
    player.天资等级 = await  get_random_aptitude();
  }
  data.setData('player', usr_qq, player);
  await player_efficiency(usr_qq); // 注意这里刷新了修炼效率提升
  if ((await player.linggenshow) != 0) {
    player.灵根.type = '无';
    player.灵根.name = '未知';
    player.灵根.法球倍率 = '0';
    player.修炼效率提升 = '0';
  }
  if (!isNotNull(player.level_id)) {
    e.reply('请先#一键同步');
    return;
  }
  if (!isNotNull(player.sex)) {
    e.reply('请先#一键同步');
    return;
  }
  let nd = '无';
  if (player.隐藏灵根) nd = player.隐藏灵根.name;
  let zd = ['攻击', '防御', '生命加成', '防御加成', '攻击加成'];
  let num = [];
  let p = [];
  let kxjs = [];
  let count = 0;
  for (let j of zd) {
    if (player[j] == 0) {
      p[count] = '';
      kxjs[count] = 0;
      count++;
      continue;
    }
    p[count] = Math.floor(Math.log(player[j]) / Math.LN10);
    num[count] = player[j] * 10 ** -p[count];
    kxjs[count] = `${num[count].toFixed(2)} x 10`;
    count++;
  }
  let 元神状态 = "尚未凝练";
  let 元神等级名称 = "无";
  
  // 检查元神等级是否已凝练
  if (player.yuanshenlevel_id === undefined || player.yuanshenlevel_id === null) {
      元神状态 = "未凝练";
  } else {
      // 查找元神等级数据
      const 元神等级数据 = data.Levelyuanshen_list.find(
          item => item.level_id == player.yuanshenlevel_id
      );
      
      // 检查是否找到对应等级
      if (!元神等级数据) {
          元神状态 = "数据异常";
      } else {
          元神等级名称 = 元神等级数据.level;
          元神状态 = "已凝练";
      }
  }

  // 确保元神数值存在
  player.元神 = player.元神 || 0;
  player.元神上限 = player.元神上限 || 0;
  player.神识 = bigNumberTransform(player.神识) || 0;

  //境界名字需要查找境界名
  let level = data.Level_list.find(
    item => item.level_id == player.level_id
  ).level;
  let power =
    (player.攻击 * 0.9 +
      player.防御 * 1.1 +
      player.血量上限 * 0.6 +
      player.暴击率 * player.攻击 * 0.5 +
      player.灵根.法球倍率 * player.攻击) /
    10000;
  power = Number(power);
  power = power.toFixed(2);
  let power2 =
    (player.攻击 + player.防御 * 1.1 + player.血量上限 * 0.5) / 10000;
  power2 = Number(power2);
  power2 = power2.toFixed(2);
  let level2 = data.LevelMax_list.find(
    item => item.level_id == player.Physique_id
  ).level;
  let need_exp = bigNumberTransform(data.Level_list.find(
    item => item.level_id == player.level_id
  ).exp);
  let need_exp2 = data.LevelMax_list.find(
    item => item.level_id == player.Physique_id
  ).exp;
  let wudi2 = data.LevelMax_list.find(
    item => item.level_id == player.Physique_id
  ).exp;
  let occupation = player.occupation;
  let occupation_level;
  let occupation_level_name;
  let occupation_exp;
  let occupation_need_exp;
  if (!isNotNull(player.occupation)) {
    occupation = '无';
    occupation_level_name = '-';
    occupation_exp = '-';
    occupation_need_exp = '-';
  } else {
    occupation_level = player.occupation_level;
    occupation_level_name = data.occupation_exp_list.find(
      item => item.id == occupation_level
    ).name;
    occupation_exp = player.occupation_exp;
    occupation_need_exp = data.occupation_exp_list.find(
      item => item.id == occupation_level
    ).experience;
  }
  let this_association;
  if (!isNotNull(player.宗门)) {
    this_association = {
      宗门名称: '无',
      职位: '无',
    };
  } else {
    this_association = player.宗门;
  }
  let pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
  if (!isNotNull(equipment.武器.pinji)) {
    武器评级 = '无';
  } else {
    武器评级 = pinji[equipment.武器.pinji];
  }
  if (!isNotNull(equipment.护具.pinji)) {
    护具评级 = '无';
  } else {
    护具评级 = pinji[equipment.护具.pinji];
  }
  if (!isNotNull(equipment.法宝.pinji)) {
    法宝评级 = '无';
  } else {
    法宝评级 = pinji[equipment.法宝.pinji];
  }
  if (!isNotNull(equipment.帝兵.pinji)) {
    帝兵评级 = '无';
  } else {
    帝兵评级 = pinji[equipment.帝兵.pinji];
  }
  let rank_lianqi = (data.Level_list.find(
    item => item.level_id == player.level_id
  ).level);
  let expmax_lianqi = bigNumberTransform(
  data.Level_list.find(item => item.level_id == player.level_id).exp
  );
   let wudi = 
  data.Level_list.find(item => item.level_id == player.level_id).exp
  ;
  let rank_llianti = data.LevelMax_list.find(
    item => item.level_id == player.Physique_id
  ).level;
   let rank_xiuliantixi = data.Levelmijing_list.find(
    item => item.level_id == player.mijinglevel_id
  ).level;
     let rank_xiangujinshi = data.xiangujinshi_list.find(
    item => item.level_id == player.xiangulevel_id
  ).level;
    let 极境名称 = (player.xiangu_shenhuo && player.xiangu_shenhuo.极境名称)
    || data.xiangujinshi_list.find(
    item => item.level_id == player.xiangulevel_id
  )?.极境名称;
let 元神等级数据 = data.Levelyuanshen_list.find(
          item => item.level_id == player.yuanshenlevel_id
      );
  let expmax_llianti = bigNumberTransform(need_exp2);
  let rank_liandan = occupation_level_name;
  let expmax_liandan = occupation_need_exp;
  let strand_hp = Strand(player.当前血量, player.血量上限);
  let strand_lianqi = Strand(player.修为, wudi);
  let strand_llianti = Strand(player.血气, wudi2);
  let strand_liandan = Strand(occupation_exp, expmax_liandan);
  let Power = GetPower(
    player.攻击,
    player.防御,
    player.血量上限,
    player.暴击率
  );
  let PowerMini = bigNumberTransform(Power);
  lingshi = bigNumberTransform(lingshi);
 // 修为转换（显示用）
 let shengming = bigNumberTransform(player.当前血量);
 let shengming2 = bigNumberTransform(player.血量上限);
const exp = bigNumberTransform(player.修为);
// 血气转换（显示用）
const exp2 = bigNumberTransform(player.血气);

  let hunyin = '未知';
  let A = usr_qq;
  let qinmidu;
  try {
    qinmidu = await Read_qinmidu();
  } catch {
    //没有建立一个
    await Write_qinmidu([]);
    qinmidu = await Read_qinmidu();
  }
  for (let i = 0; i < qinmidu.length; i++) {
    if (qinmidu[i].QQ_A == A || qinmidu[i].QQ_B == A) {
      if (qinmidu[i].婚姻 > 0) {
        if (qinmidu[i].QQ_A == A) {
          let B = await Read_player(qinmidu[i].QQ_B);
          hunyin = B.名号;
        } else {
          let A = await Read_player(qinmidu[i].QQ_A);
          hunyin = A.名号;
        }
        break;
      }
    }
  }
  let action = player.练气皮肤;

  if(usr_qq==3413211040){action="A"}
  if(usr_qq==3196383818){action="DD"}
  var i = usr_qq;
  var l=0;
      while(i >= 1){
      i=i/10;
      l++;
  }

  let type=[
    "武器",
    "法宝",
    '护具'
  ]
  let equipment_wuqi_1=false
  let equipment_wuqi_2=false
  let equipment_wuqi_3=false

  let equipment_fabao_1=false
  let equipment_fabao_2=false
  let equipment_fabao_3=false

  let equipment_huju_1=false
  let equipment_huju_2=false
  let equipment_huju_3=false

  
  for(let m=0;m<type.length;m++){



      if(type[m]=="武器"){
        if(!equipment[type[m]].hasOwnProperty('宝石位')){
          equipment[type[m]]["宝石位"]={
              "宝石位1": "无",
              "宝石位2": "无",
              "宝石位3": "无",
            }
            await Write_equipment(usr_qq,equipment)
        }

        if(equipment[type[m]]["宝石位"].宝石位1!="无"){
          equipment_wuqi_1=true
        }
        if(equipment[type[m]]["宝石位"].宝石位2!="无"){
          equipment_wuqi_2=true
        }
        if(equipment[type[m]]["宝石位"].宝石位3!="无"){
          equipment_wuqi_3=true
        }
      
      }

      if(type[m]=="法宝"){
        if(!equipment[type[m]].hasOwnProperty('宝石位')){
          equipment[type[m]]["宝石位"]={
              "宝石位1": "无",
              "宝石位2": "无",
              "宝石位3": "无",
            }
            await Write_equipment(usr_qq,equipment)
        }
        if(equipment[type[m]]["宝石位"].宝石位1!="无"){
          equipment_fabao_1=true
        }
        if(equipment[type[m]]["宝石位"].宝石位2!="无"){
          equipment_fabao_2=true
        }
        if(equipment[type[m]]["宝石位"].宝石位3!="无"){
          equipment_fabao_3=true
        }
      
      }


      if(type[m]=="护具"){
        if(!equipment[type[m]].hasOwnProperty('宝石位')){
          equipment[type[m]]["宝石位"]={
              "宝石位1": "无",
              "宝石位2": "无",
              "宝石位3": "无",
            }
            await Write_equipment(usr_qq,equipment)
        }
        if(equipment[type[m]]["宝石位"].宝石位1!="无"){
          equipment_huju_1=true
        }
        if(equipment[type[m]]["宝石位"].宝石位2!="无"){
          equipment_huju_2=true
        }
        if(equipment[type[m]]["宝石位"].宝石位3!="无"){
          equipment_huju_3=true
        }
      
      }

    
  }
  let bao = parseInt(player.暴击率 * 100) + '%';
  equipment.武器.bao = parseInt(equipment.武器.bao * 100) + '%';
  equipment.护具.bao = parseInt(equipment.护具.bao * 100) + '%';
  equipment.法宝.bao = parseInt(equipment.法宝.bao * 100) + '%';
  equipment.帝兵.bao = parseInt(equipment.帝兵.bao * 100) + '%';
  if(l<11){

  
  let player_data = {
    equipment_wuqi_1:equipment_wuqi_1,
    equipment_wuqi_2:equipment_wuqi_2,
    equipment_wuqi_3:equipment_wuqi_3,
   yuanshen: player.元神,
    yuanshen_max: player.元神上限,
    yuanshen_level: 元神等级名称,
    yuanshen_status: 元神状态,
    shensi: player.神识,
    
    // 元神进度条数据
    strand_yuanshen: {
      style: `width: ${(player.元神/player.元神上限)*100}%`,
      num: ((player.元神/player.元神上限)*100).toFixed(1)
    },
    equipment_fabao_1:equipment_fabao_1,
    equipment_fabao_2:equipment_fabao_2,
    equipment_fabao_3:equipment_fabao_3,
  
    equipment_huju_1:equipment_huju_1,
    equipment_huju_2:equipment_huju_2,
    equipment_huju_3:equipment_huju_3,
    neidan: nd,
    pifu: action,
    user_id: usr_qq,
    player, // 玩家数据
    rank_lianqi, // 练气境界
    expmax_lianqi, // 练气需求经验
    rank_llianti, // 炼体境界
    expmax_llianti, // 炼体需求经验
    rank_xiuliantixi,
    rank_xiangujinshi,
    极境名称,
    元神等级数据,
    rank_liandan, // 炼丹境界
    expmax_liandan, // 炼丹需求经验
    equipment, // 装备数据
    talent: parseInt(player.修炼效率提升 * 100), //
    player_action: status, // 当前状态
    this_association, // 宗门信息
    strand_hp,
    strand_lianqi,
    strand_llianti,
    strand_liandan,
    PowerMini, // 玩家战力
    bao,
    nickname: player.名号,
    linggen: player.灵根, //
    declaration: player.宣言,
    need_exp: need_exp,
    need_exp2: need_exp2,
    shengming,
    shengming2,
    exp,
    exp2,
    zdl: power,
    镇妖塔层数: player.镇妖塔层数,
    sh: player.神魄段数,
    mdz: player.魔道值,
    hgd: player.favorability,
    jczdl: power2,
    level: level,
    level2: level2,
    lingshi: lingshi,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    player_atk: kxjs[0],
    player_atk2: p[0],
    player_def: kxjs[1],
    player_def2: p[1],
    生命加成: kxjs[2],
    生命加成_t: p[2],
    防御加成: kxjs[3],
    防御加成_t: p[3],
    攻击加成: kxjs[4],
    攻击加成_t: p[4],
    player_bao: player.暴击率,
    player_bao2: player.暴击伤害,
    occupation: occupation,
    occupation_level: occupation_level_name,
    occupation_exp: occupation_exp,
    occupation_need_exp: occupation_need_exp,
    arms: equipment.武器,
    armor: equipment.护具,
    treasure: equipment.法宝,
    association: this_association,
    learned_gongfa: player.学习的功法,
    婚姻状况: hunyin,
    武器评级: 武器评级,
    护具评级: 护具评级,
    法宝评级: 法宝评级,
    帝兵评级: 帝兵评级,
  };
  const data1 = await new Show(e).get_playerData(player_data);
  return await puppeteer.screenshot('player', {
    ...data1,
  });
  }else{

    let player_data = {
      equipment_wuqi_1:equipment_wuqi_1,
      equipment_wuqi_2:equipment_wuqi_2,
      equipment_wuqi_3:equipment_wuqi_3,
    
      equipment_fabao_1:equipment_fabao_1,
      equipment_fabao_2:equipment_fabao_2,
      equipment_fabao_3:equipment_fabao_3,
    
      equipment_huju_1:equipment_huju_1,
      equipment_huju_2:equipment_huju_2,
      equipment_huju_3:equipment_huju_3,
      touxian:e.user.avatar,
      neidan: nd,
      pifu: action,
      user_id: usr_qq,
       yuanshen: player.元神,
    yuanshen_max: player.元神上限,
    yuanshen_level: 元神等级名称,
    yuanshen_status: 元神状态,
    shensi: player.神识,
    
    // 元神进度条数据
    strand_yuanshen: {
      style: `width: ${(player.元神/player.元神上限)*100}%`,
      num: ((player.元神/player.元神上限)*100).toFixed(1)
    },
      player, // 玩家数据
      rank_lianqi, // 练气境界
      expmax_lianqi, // 练气需求经验
      rank_llianti, // 炼体境界
      expmax_llianti, // 炼体需求经验
      rank_xiuliantixi,
      rank_xiangujinshi,
      极境名称,
      元神等级数据,
      rank_liandan, // 炼丹境界
      expmax_liandan, // 炼丹需求经验
      equipment, // 装备数据
      talent: parseInt(player.修炼效率提升 * 100), //
      player_action: status, // 当前状态
      this_association, // 宗门信息
      strand_hp,
      strand_lianqi,
      strand_llianti,
      strand_liandan,
      PowerMini, // 玩家战力
      bao,
      nickname: player.名号,
      linggen: player.灵根, //
      declaration: player.宣言,
      need_exp: need_exp,
      need_exp2: need_exp2,
      exp,
      exp2,
      zdl: power,
      镇妖塔层数: player.镇妖塔层数,
      sh: player.神魄段数,
      mdz: player.魔道值,
      hgd: player.favorability,
      jczdl: power2,
      level: level,
      level2: level2,
      lingshi: lingshi,
      player_maxHP: player.血量上限,
      player_nowHP: player.当前血量,
      player_atk: kxjs[0],
      player_atk2: p[0],
      player_def: kxjs[1],
      player_def2: p[1],
      生命加成: kxjs[2],
      生命加成_t: p[2],
      防御加成: kxjs[3],
      防御加成_t: p[3],
      攻击加成: kxjs[4],
      攻击加成_t: p[4],
      player_bao: player.暴击率,
      player_bao2: player.暴击伤害,
      occupation: occupation,
      occupation_level: occupation_level_name,
      occupation_exp: occupation_exp,
      occupation_need_exp: occupation_need_exp,
      arms: equipment.武器,
      armor: equipment.护具,
      treasure: equipment.法宝,
      association: this_association,
      learned_gongfa: player.学习的功法,
      婚姻状况: hunyin,
      武器评级: 武器评级,
      护具评级: 护具评级,
      法宝评级: 法宝评级,
      帝兵评级: 帝兵评级,
    };
    const data1 = await new Show(e).get_player_pindao_Data(player_data);
    return await puppeteer.screenshot('player_pindao', {
      ...data1,
    });
  } 
}
//返回战斗
export async function get_fight_img(e,data) {
  let get_data={fightmsg: data}
  const data1 = await new Show(e).get_fightData(get_data);
  return await puppeteer.screenshot('fight', {
    ...data1,
  });
}

//返回自动每日任务领取记录图片
export async function get_autodaily_img(e, data) {
  const data1 = await new Show(e).get_autodailyData(data);
  return await puppeteer.screenshot('autodaily', {
    ...data1,
  });
}

//返回沉迷收获图片
export async function get_addictionharvest_img(e, data) {
  const data1 = await new Show(e).get_addictionharvestData(data);
  return await puppeteer.screenshot('addictionharvest', {
    ...data1,
  });
}


export async function get_auction_img(e, data) {
    const get_data = {
        auctionmsg: data
    };

    const showData = await new Show(e).get_auctionData(get_data);

    return await puppeteer.screenshot('auction', {
        ...showData
    });
}
/**
 * 我的宗门
 * @return image
 */
export async function get_association_img(e) {
  let item;
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  //无存档
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  //门派
  let player = data.getData('player', usr_qq);
  if (!isNotNull(player.宗门)) {
    return;
  }
  //境界
  //let now_level_id;
  if (!isNotNull(player.level_id)) {
    e.reply('请先#同步信息');
    return;
  }
  //有加入宗门
  let ass = data.getAssociation(player.宗门.宗门名称);
  //寻找
  let mainqq = await data.getData('player', ass.宗主);
  //仙宗
  let xian = ass.power;
  let weizhi;
  if (xian == 0) {
    weizhi = '凡界';
  } else {
    weizhi = '仙界';
  }
  //门槛
  let level = data.Level_list.find(
    item => item.level_id === ass.最低加入境界
  ).level;
  // 副宗主
  let fuzong = [];
  for (item in ass.副宗主) {
    fuzong[item] =
      '道号：' +
      data.getData('player', ass.副宗主[item]).名号 +
      'QQ：' +
      ass.副宗主[item];
  }
  //长老
  const zhanglao = [];
  for (item in ass.长老) {
    zhanglao[item] =
      '道号：' +
      data.getData('player', ass.长老[item]).名号 +
      'QQ：' +
      ass.长老[item];
  }
  //内门弟子
  const neimen = [];
  for (item in ass.内门弟子) {
    neimen[item] =
      '道号：' +
      data.getData('player', ass.内门弟子[item]).名号 +
      'QQ：' +
      ass.内门弟子[item];
  }
  //外门弟子
  const waimen = [];
  for (item in ass.外门弟子) {
    waimen[item] =
      '道号：' +
      data.getData('player', ass.外门弟子[item]).名号 +
      'QQ：' +
      ass.外门弟子[item];
  }
  let state = '需要维护';
  let now = new Date();
  let nowTime = now.getTime(); //获取当前日期的时间戳
  if (ass.维护时间 > nowTime - 1000 * 60 * 60 * 24 * 7) {
    state = '不需要维护';
  }
  //计算修炼效率
  let xiulian;
  let dongTan = await data.bless_list.find(item => item.name == ass.宗门驻地);
  if (ass.宗门驻地 == 0) {
    xiulian = ass.宗门等级 * 0.05 * 100;
  } else {
    try {
      xiulian = ass.宗门等级 * 0.05 * 100 + dongTan.efficiency * 100;
    } catch {
      xiulian = ass.宗门等级 * 0.05 * 100 + 0.5;
    }
  }
  xiulian = Math.trunc(xiulian);
  if (ass.宗门神兽 == 0) {
    ass.宗门神兽 = '无';
  }
  let association_data = {
    user_id: usr_qq,
    ass: ass,
    mainname: mainqq.名号,
    mainqq: ass.宗主,
    xiulian: xiulian,
    weizhi: weizhi,
    level: level,
    mdz: player.魔道值,
    zhanglao: zhanglao,
    fuzong: fuzong,
    neimen: neimen,
    waimen: waimen,
    state: state,
  };
  const data1 = await new Show(e).get_associationData(association_data);
  return await puppeteer.screenshot('association', {
    ...data1,
  });
}
export async function get_baoshi_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq= await channel(usr_qq)
  let player = await data.getData('player', usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  const bao = Math.trunc(parseInt(player.暴击率 * 100));
  let equipment = await data.getData('equipment', usr_qq);
  let player_data = {
    user_id: usr_qq,
    mdz: player.魔道值,
    nickname: player.名号,
    arms: equipment.武器,
    armor: equipment.护具,
    treasure: equipment.法宝,
    player_atk: player.攻击,
    player_def: player.防御,
    player_bao: bao,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    pifu: Number(player.装备皮肤),
  };
  const data1 = await new Show(e).get_equipmnetData3(player_data);
  return await puppeteer.screenshot('equipment3', {
    ...data1,
  });
}
/**
 * 返回该玩家的装备图片
 * @return image
 */
export async function get_equipment_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let player = await data.getData('player', usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  const bao = Math.trunc(parseInt(player.暴击率 * 100));
  let equipment = await data.getData('equipment', usr_qq);
  let player_data = {
    user_id: usr_qq,
    mdz: player.魔道值,
    nickname: player.名号,
    arms: equipment.武器,
    armor: equipment.护具,
    treasure: equipment.法宝,
    player_atk: player.攻击,
    player_def: player.防御,
    player_bao: bao,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    pifu: Number(player.装备皮肤),
  };
  const data1 = await new Show(e).get_equipmnetData(player_data);
  return await puppeteer.screenshot('equipment', {
    ...data1,
  });
}
// 新增函数：生成特定类别的纳戒图片
export async function get_najie_category_img(e, category) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);

  // 检查玩家是否存在
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }

  // 获取玩家和纳戒数据
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);

  const lingshi = Math.trunc(najie.灵石);
  const lingshi2 = Math.trunc(najie.灵石上限);
  let strand_hp = Strand(player.当前血量, player.血量上限);
  let strand_lingshi = Strand(najie.灵石, najie.灵石上限);

  // 所有类别名称
  const allCategories = ['装备','丹药','道具','功法','草药','材料','食材','盒子','宝石','仙宠','仙宠口粮'];

  // 复制纳戒数据，清空非目标类别（HTML模板通过 length>0 条件渲染）
  let najieFiltered = { ...najie, 灵石: lingshi, 灵石上限: lingshi2 };
  for (let cat of allCategories) {
    if (cat !== category) {
      najieFiltered[cat] = [];
    }
  }

  let player_data = {
    user_id: usr_qq,
    player: player,
    najie: najieFiltered,
    mdz: player.魔道值,
    nickname: player.名号,
    najie_lv: najie.等级,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    najie_maxlingshi: lingshi2,
    najie_lingshi: lingshi,
    najie_equipment: najieFiltered.装备,
    najie_danyao: najieFiltered.丹药,
    najie_daoju: najieFiltered.道具,
    najie_gongfa: najieFiltered.功法,
    najie_caoyao: najieFiltered.草药,
    najie_cailiao: najieFiltered.材料,
    najie_shicai: najieFiltered.食材,
    najie_hezi: najieFiltered.盒子,
    strand_hp: strand_hp,
    strand_lingshi: strand_lingshi,
    pifu: player.纳戒皮肤,
  };

  const data1 = await new Show(e).get_najie_category_Data(player_data);
  return await puppeteer.screenshot('najie', {
    ...data1,
  });
}


/**
 * 返回该玩家的纳戒图片
 * @return image
 */
export async function get_najie_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);
  const lingshi = Math.trunc(najie.灵石);
  const lingshi2 = Math.trunc(najie.灵石上限);
  let strand_hp = Strand(player.当前血量, player.血量上限);
  let strand_lingshi = Strand(najie.灵石, najie.灵石上限);
  let player_data = {
    user_id: usr_qq,
    player: player,
    najie: najie,
    mdz: player.魔道值,
    nickname: player.名号,
    najie_lv: najie.等级,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    najie_maxlingshi: lingshi2,
    najie_lingshi: lingshi,
    najie_equipment: najie.装备,
    najie_danyao: najie.丹药,
    najie_daoju: najie.道具,
    najie_gongfa: najie.功法,
    najie_caoyao: najie.草药,
    najie_cailiao: najie.材料,
    najie_shicai: najie.食材,
    najie_hezi: najie.盒子,
    strand_hp: strand_hp,
    strand_lingshi: strand_lingshi,
    pifu: player.纳戒皮肤,
  };
  const data1 = await new Show(e).get_najieData(player_data);
  return await puppeteer.screenshot('najie', {
    ...data1,
  });
}


/**
 * 返回该玩家的纳戒图片
 * @return image
 */
export async function get_najie_chouchou_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let najie = await Read_najie(usr_qq);
  const lingshi = Math.trunc(najie.灵石);
  const lingshi2 = Math.trunc(najie.灵石上限);
  let strand_hp = Strand(player.当前血量, player.血量上限);
  let strand_lingshi = Strand(najie.灵石, najie.灵石上限);

  // for(i in najie){
  //   for(var z=0;z<najie[i].length;z++){
  //     for(d in najie[i][z]){
  //       if(najie[i][z][d]==1){
  //         najie[i][z]
  //       }
  //     }
  //   }
  // }
  let wupin = [
    '装备',
    '丹药',
    '道具',
    '功法',
    '草药',
    '材料',
    '仙宠',
    '仙宠口粮',
  ];
  for (var i of wupin) {
    for (let l of najie[i]) {
      //纳戒中的数量
      if(l.islockd==1){
        console.log("执行1111111111111111111111111")
        let a=l.name
        let b=l.desc
        for(var z=0;z<najie[i].length;z++){
          if(najie[i][z].name==a && najie[i][z].desc==b){
            if(najie[i].length>1){
              najie[i].splice(z,1)
            }else{
              najie[i]=''

            }
            
          }
        }
      }
    }
  }


  let player_data = {
    user_id: usr_qq,
    player: player,
    najie: najie,
    mdz: player.魔道值,
    nickname: player.名号,
    najie_lv: najie.等级,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,
    najie_maxlingshi: lingshi2,
    najie_lingshi: lingshi,
    najie_equipment: najie.装备,
    najie_danyao: najie.丹药,
    najie_daoju: najie.道具,
    najie_gongfa: najie.功法,
    najie_caoyao: najie.草药,
    najie_cailiao: najie.材料,
    strand_hp: strand_hp,
    strand_lingshi: strand_lingshi,
    pifu: player.纳戒皮肤,
  };
  const data1 = await new Show(e).get_najie_chouchou_Data(player_data);
  return await puppeteer.screenshot('najie', {
    ...data1,
  });
}



/**
 * 返回境界列表图片
 * @return image
 */
export async function get_state_img(e, all_level) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let Level_id = player.level_id;
  let Level_list = data.Level_list;
  //循环删除表信息
  if (!all_level) {
    for (let i = 1; i <= 60; i++) {
      if (i > Level_id - 6 && i < Level_id + 6) {
        continue;
      }
      Level_list = await Level_list.filter(item => item.level_id != i);
    }
  }
  let state_data = {
    user_id: usr_qq,
    Level_list: Level_list,
  };
  const data1 = await new Show(e).get_stateData(state_data);
  return await puppeteer.screenshot('state', {
    ...data1,
  });
}

export async function get_statezhiye_img(e, all_level) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let Level_id = player.occupation_level;
  let Level_list = data.occupation_exp_list;
  //循环删除表信息
  if (!all_level) {
    for (let i = 0; i <= 60; i++) {
      if (i > Level_id - 6 && i < Level_id + 6) {
        continue;
      }
      Level_list = await Level_list.filter(item => item.id != i);
    }
  }
  let state_data = {
    user_id: usr_qq,
    Level_list: Level_list,
  };
  const data1 = await new Show(e).get_stateDatazhiye(state_data);
  return await puppeteer.screenshot('statezhiye', {
    ...data1,
  });
}

/**
 * 返回境界列表图片
 * @return image
 */
export async function get_statemax_img(e, all_level) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let Level_id = player.Physique_id;
  let LevelMax_list = data.LevelMax_list;
  //循环删除表信息
  if (!all_level) {
    for (let i = 1; i <= 60; i++) {
      if (i > Level_id - 6 && i < Level_id + 6) {
        continue;
      }
      LevelMax_list = await LevelMax_list.filter(item => item.level_id != i);
    }
  }
  let statemax_data = {
    user_id: usr_qq,
    LevelMax_list: LevelMax_list,
  };
  const data1 = await new Show(e).get_statemaxData(statemax_data);
  return await puppeteer.screenshot('statemax', {
    ...data1,
  });
}

/**
 * 返回秘境体系列表图片
 * @return image
 */
export async function get_mijing_img(e, all_level) {
    try {
        // 1. 用户ID处理（保持不变）
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await channel(usr_qq);

        // 2. 检查玩家是否存在（保持不变）
        if (!data.existData('player', usr_qq)) return;
        let player = await data.getData('player', usr_qq);
        let Level_id = player.mijinglevel_id; // 玩家当前秘境等级

        // 3. 获取秘境列表（复制原列表，避免修改全局数据）
        let Levelmijing_list = [...data.Levelmijing_list]; 

        // 4. 核心修改：适配1-24级范围过滤
        if (!all_level) {
            // 计算有效范围：当前等级±5级，但不超出1-24边界
            const minLevel = Math.max(1, Level_id - 5); // 最小等级≥1
            const maxLevel = Math.min(24, Level_id + 5); // 最大等级≤24

            // 直接过滤保留范围内的秘境（替代原循环）
            Levelmijing_list = Levelmijing_list.filter(item => 
                item.level_id >= minLevel && item.level_id <= maxLevel
            );
        }

        // 5. 准备渲染数据（保持不变）
        let statemax_data = {
            user_id: usr_qq,
            Levelmijing_list: Levelmijing_list,
        };

        // 6. 生成截图（保持不变）
        const data1 = await new Show(e).get_mijingData(statemax_data);
        return await puppeteer.screenshot('mijing', { ...data1 });
    } catch (err) {
        console.error("生成秘境图片失败:", err);
        return "生成秘境图片失败，请稍后再试";
    }
}

/**
 * 返回仙古今世法列表图片
 * @return image
 */
export async function get_xiangujinshi_img(e, all_level) {
    try {
        // 1. 用户ID处理（保持不变）
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await channel(usr_qq);

        // 2. 检查玩家是否存在（保持不变）
        if (!data.existData('player', usr_qq)) return;
        let player = await data.getData('player', usr_qq);
        let Level_id = player.xiangulevel_id; // 玩家当前秘境等级

        // 3. 获取秘境列表（复制原列表，避免修改全局数据）
        let xiangujinshi_list = [...data.xiangujinshi_list]; 

        // 4. 核心修改：适配1-24级范围过滤
        if (!all_level) {
            // 计算有效范围：当前等级±5级，但不超出1-24边界
            const minLevel = Math.max(1, Level_id - 5); // 最小等级≥1
            const maxLevel = Math.min(24, Level_id + 5); // 最大等级≤24

            // 直接过滤保留范围内的秘境（替代原循环）
            xiangujinshi_list = xiangujinshi_list.filter(item => 
                item.level_id >= minLevel && item.level_id <= maxLevel
            );
        }

        // 5. 准备渲染数据（保持不变）
        let statemax_data = {
            user_id: usr_qq,
            xiangujinshi_list: xiangujinshi_list,
        };

        // 6. 生成截图（保持不变）
        const data1 = await new Show(e).get_xiangujinshiData(statemax_data);
        return await puppeteer.screenshot('xiangujinshi', { ...data1 });
    } catch (err) {
        console.error("生成秘境图片失败:", err);
        return "生成秘境图片失败，请稍后再试";
    }
}

export async function get_talent_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let player = await data.getData('player', usr_qq);
  let Level_id = player.Physique_id;
  let talent_list = data.talent_list;
  let talent_data = {
    user_id: usr_qq,
    talent_list: talent_list,
  };
  const data1 = await new Show(e).get_talentData(talent_data);
  return await puppeteer.screenshot('talent', {
    ...data1,
  });
}

/**
 * 返回修仙设置
 * @return image
 */
export async function get_adminset_img(e) {
  const cf =config.getConfig('xiuxian', 'xiuxian')
  let adminset = {
    //CD：分
    CDassociation: cf.CD.association,
    CDjoinassociation: cf.CD.joinassociation,
    CDassociationbattle: cf.CD.associationbattle,
    CDrob: cf.CD.rob,
    CDgambling: cf.CD.gambling,
    CDcouple: cf.CD.couple,
    CDgarden: cf.CD.garden,
    CDlevel_up: cf.CD.level_up,
    CDsecretplace: cf.CD.secretplace,
    CDtimeplace: cf.CD.timeplace,
    CDforbiddenarea: cf.CD.forbiddenarea,
    CDreborn: cf.CD.reborn,
    CDtransfer: cf.CD.transfer,
    CDhonbao: cf.CD.honbao,
    CDboss: cf.CD.boss,
    //手续费
    percentagecost: cf.percentage.cost,
    percentageMoneynumber: cf.percentage.Moneynumber,
    percentagepunishment: cf.percentage.punishment,
    //出千控制
    sizeMoney: cf.size.Money,
    //开关
    switchplay: cf.switch.play,
    switchMoneynumber: cf.switch.play,
    switchcouple: cf.switch.couple,
    switchXiuianplay_key: cf.switch.Xiuianplay_key,
    //倍率
    biguansize: cf.biguan.size,
    biguantime: cf.biguan.time,
    biguancycle: cf.biguan.cycle,
    //
    worksize: cf.work.size,
    worktime: cf.work.time,
    workcycle: cf.work.cycle,

    //出金倍率
    SecretPlaceone: cf.SecretPlace.one,
    SecretPlacetwo: cf.SecretPlace.two,
    SecretPlacethree: cf.SecretPlace.three,
  };
  const data1 = await new Show(e).get_adminsetData(adminset);
  return await puppeteer.screenshot('adminset', {
    ...data1,
  });
}

export async function get_ranking_power_img(e, Data, usr_paiming, thisplayer) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let level = data.Level_list.find(
    item => item.level_id == thisplayer.level_id
  ).level;
  let ranking_power_data = {
    user_id: usr_qq,
    mdz: thisplayer.魔道值,
    nickname: thisplayer.名号,
    exp: thisplayer.修为,
    level: level,
    usr_paiming: usr_paiming,
    allplayer: Data,
  };
  const data1 = await new Show(e).get_ranking_powerData(ranking_power_data);
  return await puppeteer.screenshot('ranking_power', {
    ...data1,
  });
}
export async function get_genius_img(
  e,
  rankings,
  userRank,
  userPower,
  thisplayer,
  title = "封神榜"  // 添加标题参数
) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  
  // 设置副标题逻辑
  let subtitle;
  if (title === "封神榜") {
    subtitle = "仙界战力排行榜";
  } else if (title === "人体秘境榜") {
    subtitle = "遮天战力排行榜";
  }else if (title === "仙古今世法榜") {
    subtitle = "完美世界战力排行榜";
  } else {
    subtitle = "凡人战力排行榜";
  }
  
  // 准备图片数据
  const genius_data = {
    title: title,  // 添加标题
    subtitle: subtitle, // 根据标题设置副标题
    user_id: usr_qq,
    nickname: thisplayer.名号,
    user_rank: userRank > 0 ? userRank : "未上榜",
    user_power: bigNumberTransform(userPower),
    user_level: data.Levelmijing_list.find(l => l.level_id === thisplayer.level_id)?.level || "未知境界",
    user_qq: usr_qq,
    rankings: rankings.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      power: bigNumberTransform(r.power),
      level: r.level,
      qq: r.qq
    })),
    epoch: thisplayer.epoch || 1
  };
  
  // 获取渲染数据
  const renderData = await new Show(e).get_geniusData(genius_data);
  
  // 生成图片
  return await puppeteer.screenshot('genius', {
    ...renderData,
  });
}
export async function get_ranking_money_img(
  e,
  Data,
  usr_paiming,
  thisplayer,
  thisnajie
) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  const najie_lingshi = Math.trunc(thisnajie.灵石);
  const lingshi = Math.trunc(thisplayer.灵石 + thisnajie.灵石);
  let ranking_money_data = {
    user_id: usr_qq,
    nickname: thisplayer.名号,
    lingshi: lingshi,
    najie_lingshi: najie_lingshi,
    usr_paiming: usr_paiming,
    allplayer: Data,
  };
  const data1 = await new Show(e).get_ranking_moneyData(ranking_money_data);
  return await puppeteer.screenshot('ranking_money', {
    ...data1,
  });
}
export async function fixed(usr_qq) {
  fs.copyFileSync(
    `${__PATH.auto_backup}/najie/${usr_qq}.json`,
    `${__PATH.najie_path}/${usr_qq}.json`
    `${__PATH.player_path}/${usr_qq}.json`
  );
  return;
}
/**
 * 返回柠檬堂
 * @return image
 */
export async function get_ningmenghome_img(e, thing_type) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let commodities_list = data.commodities_list;
  if (thing_type != '') {
    if (
      thing_type == '装备' ||
      thing_type == '丹药' ||
      thing_type == '功法' ||
      thing_type == '道具' ||
      thing_type == '草药'
    ) {
      commodities_list = commodities_list.filter(
        item => item.class == thing_type
      );
    } else if (
      thing_type == '武器' ||
      thing_type == '护具' ||
      thing_type == '法宝' ||
      thing_type == '修为' ||
      thing_type == '血量' ||
      thing_type == '血气' ||
      thing_type == '天赋'
    ) {
      commodities_list = commodities_list.filter(
        item => item.type == thing_type
      );
    }
  }
  let ningmenghome_data = {
    user_id: usr_qq,
    commodities_list: commodities_list,
  };
  const data1 = await new Show(e).get_ningmenghomeData(ningmenghome_data);
  let img = await puppeteer.screenshot('ningmenghome', {
    ...data1,
  });
  return img;
}
/**
 * 返回瑶池仙楼
 * @return image
 */
export async function get_yaochi_img(e, thing_type) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let yaochishangdian = data.yaochishangdian;
  if (thing_type != '') {
    if (
      thing_type == '装备' ||
      thing_type == '丹药' ||
      thing_type == '功法' ||
      thing_type == '道具' ||
      thing_type == '草药'||
      thing_type == '材料'
    ) {
      yaochishangdian = yaochishangdian.filter(
        item => item.class == thing_type
      );
    } else if (
      thing_type == '武器' ||
      thing_type == '护具' ||
      thing_type == '法宝' ||
      thing_type == '帝兵' ||
      thing_type == '修为' ||
      thing_type == '血量' ||
      thing_type == '血气' ||
      thing_type == '天赋'
    ) {
      yaochishangdian = yaochishangdian.filter(
        item => item.type == thing_type
      );
    }
  }
  let yaochi_data = {
    user_id: usr_qq,
    yaochishangdian: yaochishangdian,
  };
  const data1 = await new Show(e).get_yaochiData(yaochi_data);
  let img = await puppeteer.screenshot('yaochi', {
    ...data1,
  });
  return img;
}
/**
 * 返回摇光宝库
 * @return image
 */
export async function get_yaoguang_img(e, thing_type) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let yaoguangshangdian = data.yaoguangshangdian;
  if (thing_type != '') {
    if (
      thing_type == '装备' ||
      thing_type == '丹药' ||
      thing_type == '功法' ||
      thing_type == '道具' ||
      thing_type == '草药'||
      thing_type == '材料'
    ) {
      yaoguangshangdian = yaoguangshangdian.filter(
        item => item.class == thing_type
      );
    } else if (
      thing_type == '武器' ||
      thing_type == '护具' ||
      thing_type == '法宝' ||
      thing_type == '帝兵' ||
      thing_type == '修为' ||
      thing_type == '血量' ||
      thing_type == '血气' ||
      thing_type == '天赋'
    ) {
      yaoguangshangdian = yaoguangshangdian.filter(
        item => item.type == thing_type
      );
    }
  }
  let yaoguang_data = {
    user_id: usr_qq,
    yaoguangshangdian: yaoguangshangdian,
  };
  const data1 = await new Show(e).get_yaoguangData(yaoguang_data);
  let img = await puppeteer.screenshot('yaoguang', {
    ...data1,
  });
  return img;
}
/**
 * 返回瑶池仙楼
 * @return image
 */
export async function get_jianyunhai_img(e, thing_type) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let jianyunhaishangdian = data.jianyunhaishangdian;
  if (thing_type != '') {
    if (
      thing_type == '装备' ||
      thing_type == '丹药' ||
      thing_type == '功法' ||
      thing_type == '道具' ||
      thing_type == '草药'||
      thing_type == '材料'||
      thing_type == '盒子'
    ) {
      jianyunhaishangdian = jianyunhaishangdian.filter(
        item => item.class == thing_type
      );
    } else if (
      thing_type == '武器' ||
      thing_type == '护具' ||
      thing_type == '法宝' ||
      thing_type == '帝兵' ||
      thing_type == '修为' ||
      thing_type == '血量' ||
      thing_type == '血气' ||
      thing_type == '天赋'
    ) {
      jianyunhaishangdian = jianyunhaishangdian.filter(
        item => item.type == thing_type
      );
    }
  }
  let jianyunhai_data = {
    user_id: usr_qq,
    jianyunhaishangdian: jianyunhaishangdian,
  };
  const data1 = await new Show(e).get_jianyunhaiData(jianyunhai_data);
  let img = await puppeteer.screenshot('jianyunhai', {
    ...data1,
  });
  return img;
}
/**
 * 返回万宝楼
 * @return image
 */
export async function get_valuables_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let valuables_data = {
    user_id: usr_qq,
  };
  const data1 = await new Show(e).get_valuablesData(valuables_data);
  let img = await puppeteer.screenshot('valuables', {
    ...data1,
  });
  return img;
}
/**
 * @description: 进度条渲染
 * @param {Number} res 百分比小数
 * @return {*} css样式
 */
function Strand(now, max) {
  let num = ((now / max) * 100).toFixed(0);
  let mini;
  if (num > 100) {
    mini = 100;
  } else {
    mini = num;
  }
  let strand = {
    style: `style=width:${mini}%`,
    num: num,
  };
  return strand;
}

/**
 * 大数字转换（支持到10^44）
 * @param {number|string} value - 要转换的数字值
 * @returns {string} - 转换后的带单位字符串
 */
export function bigNumberTransform(value) {
    // 边界处理和类型检查
    if (typeof value === 'string') {
        value = parseFloat(value);
    }
    if (typeof value !== 'number' || isNaN(value)) {
        return '0';
    }
    
    // 处理负数和零
    if (value < 0) return '-' + bigNumberTransform(-value);
    if (value === 0) return '0';
    
    // 小于1万时直接返回原生数值
    if (value < 10000) return value.toString();
    
    // 扩展单位体系（万、亿、兆、京、垓、秭、穰、沟、涧、正、载）
    const units = [
        { threshold: 1e4, units: ['万', '千万'] },      // 万级：1e4~1e7
        { threshold: 1e8, units: ['亿', '千亿'] },      // 亿级：1e8~1e11
        { threshold: 1e12, units: ['兆', '千兆'] },     // 兆级：1e12~1e15
        { threshold: 1e16, units: ['京', '千京'] },     // 京级：1e16~1e19
        { threshold: 1e20, units: ['垓', '千垓'] },     // 垓级：1e20~1e23
        { threshold: 1e24, units: ['秭', '千秭'] },     // 秭级：1e24~1e27
        { threshold: 1e28, units: ['穰', '千穰'] },     // 穰级：1e28~1e31
        { threshold: 1e32, units: ['沟', '千沟'] },     // 沟级：1e32~1e35
        { threshold: 1e36, units: ['涧', '千涧'] },     // 涧级：1e36~1e39
        { threshold: 1e40, units: ['正', '千正'] },     // 正级：1e40~1e43
        { threshold: 1e44, units: ['载', '千载'] }      // 载级：1e44+
    ];

    // 查找合适的单位和数量级
    for (let i = units.length - 1; i >= 0; i--) {
        const level = units[i];
        
        // 检查是否使用千倍单位
        const useKiloUnit = value >= level.threshold * 1000;
        const unitIndex = useKiloUnit ? 1 : 0;
        
        if (value >= (useKiloUnit ? level.threshold * 1000 : level.threshold)) {
            const divisor = useKiloUnit ? level.threshold * 1000 : level.threshold;
            const convertedValue = value / divisor;
            
            // 根据数值大小确定小数位数
            let decimalPlaces = 3;
            if (convertedValue >= 1000) decimalPlaces = 0;
            else if (convertedValue >= 100) decimalPlaces = 1;
            else if (convertedValue >= 10) decimalPlaces = 2;
            
            // 格式化为指定小数位数并去除尾部零
            let result = convertedValue.toFixed(decimalPlaces)
                .replace(/\.?0+$/, '') // 去除尾随零和小数点
                .replace(/(\.\d*?)0+$/, '$1'); // 去除小数点后的尾随零
            
            return result + level.units[unitIndex];
        }
    }
    
    // 如果数值大于1万但小于最小单位阈值（理论上不会发生）
    return value.toLocaleString();
}

//读Boss表
export async function Read_Boss_List() {
  let dir = path.join(`${__PATH.Exchange}/Boss_list.json`);
  let Boss_list = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  Boss_list = JSON.parse(Boss_list);
  return Boss_list;
}

//写Boss表
export async function Write_Boss_List(wupin) {
  let dir = path.join(__PATH.Exchange, `Boss_list.json`);
  let new_ARR = JSON.stringify(wupin, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
  /**
   *从输入字符串中截取数字存入数组arr
   */
   export async function getNumversFromString(str) {
    var pattern = /\d+/g;//正则表达
    var matches = str.match(pattern);//匹配
    var arr = [];
    if (matches !== null) {
      for (var i = 0; i < matches.length; i++) {
        arr[i] = parseInt(matches[i], 10);
        //arr.push(parseInt(matches[i],10));
      }
    } else {
      arr[0] = 1;
      return arr;
    }
    return arr;
  }
/**
 * 计算战力
 */
export function GetPower(atk, def, hp, bao) {
  let power = (atk + def * 0.8 + hp * 0.6) * (bao + 1);
  power = Math.trunc(power);
  return power;
}
/**
 * 增加减少纳戒内物品
 * @param usr_qq 操作存档的qq号
 * @param thing_name  仙宠名称
 * @param n  操作的数量,取+增加,取 -减少
 * @param thing_level  仙宠等级
 * @returns 无
 */
export async function Add_仙宠(usr_qq, thing_name, n, thing_level = null) {
  var x = Number(n);
  if (x == 0) {
    return;
  }
  let najie = await Read_najie(usr_qq);
  let trr = najie.仙宠.find(
    item => item.name == thing_name && item.等级 == thing_level
  );
  var name = thing_name;
  if (x > 0 && !isNotNull(trr)) {
    //无中生有
    let newthing = data.xianchon.find(item => item.name == name);
    if (!isNotNull(newthing)) {
      console.log('没有这个东西');
      return;
    }
    if (thing_level != null) {
      newthing.等级 = thing_level;
    }
    najie.仙宠.push(newthing);
    najie.仙宠.find(
      item => item.name == name && item.等级 == newthing.等级
    ).数量 = x;
    let xianchon = najie.仙宠.find(
      item => item.name == name && item.等级 == newthing.等级
    );
    najie.仙宠.find(
      item => item.name == name && item.等级 == newthing.等级
    ).加成 = xianchon.等级 * xianchon.每级增加;
    najie.仙宠.find(
      item => item.name == name && item.等级 == newthing.等级
    ).islockd = 0;
    await Write_najie(usr_qq, najie);
    return;
  }
  najie.仙宠.find(item => item.name == name && item.等级 == trr.等级).数量 += x;
  if (
    najie.仙宠.find(item => item.name == name && item.等级 == trr.等级).数量 < 1
  ) {
    //假如用完了,需要删掉数组中的元素,用.filter()把!=该元素的过滤出来
    najie.仙宠 = najie.仙宠.filter(
      item => item.name != thing_name || item.等级 != trr.等级
    );
  }
  await Write_najie(usr_qq, najie);
  return;
}
export async function get_danfang_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }

  // 获取纳戒数据
  let najie;
  try {
    najie = await data.getData('najie', usr_qq);
  } catch (err) {
    console.error("读取纳戒数据失败：", err);
    e.reply("读取纳戒数据失败");
    return;
  }
  
  // 将纳戒物品展平为数组
  const najie_items = [];
  for (const category in najie) {
    if (Array.isArray(najie[category])) {
      najie[category].forEach(item => {
        najie_items.push({
          name: item.name,
          class: item.class,
          num: item.数量 || 0 
        });
      });
    }
  }

  let danfang_list = data.danfang_list;
  
  // 计算每个配方可制作的数量
  danfang_list = danfang_list.map(dan => {
    let max_craftable = Infinity;
    const materials_info = [];
    
    for (const material of dan.materials) {
      // 在纳戒中查找材料
      const item = najie_items.find(item =>
        item.name && material.name && 
        item.name.trim().toLowerCase() === material.name.trim().toLowerCase()
      );
      
      const have = item ? item.num : 0;
      const craftable = Math.floor(have / material.amount);
      max_craftable = Math.min(max_craftable, craftable);
      
      materials_info.push({
        name: material.name,
        amount: material.amount,
        have: have,
        enough: have >= material.amount
      });
    }
    
    return {
      ...dan,
      max_craftable: max_craftable === Infinity ? 0 : max_craftable,
      materials: materials_info
    };
  });

  let danfang_data = {
    user_id: usr_qq,
    danfang_list: danfang_list,
  };
  
  const data1 = await new Show(e).get_danfangData(danfang_data);
  let img = await puppeteer.screenshot('danfang', {
    ...data1,
  });
  return img;
}
export async function get_zhizuo_img(e) {
  const usr_qq = e.user_id.toString().replace('qg_', '');
  
  // 1. 玩家存在性检查
  if (!await existplayer(usr_qq)) {
    e.reply('玩家不存在，请先创建角色');
    return;
  }

  // 2. 读取玩家数据
  let player, najie;
  try {
    player = await Read_player(usr_qq);
    najie = await data.getData('najie', usr_qq);
  } catch (err) {
    console.error("数据读取失败:", err);
    e.reply("读取玩家数据失败");
    return;
  }

  // 3. 展平纳戒物品
  const najie_items = [];
  for (const category in najie) {
    if (Array.isArray(najie[category])) {
      najie[category].forEach(item => {
        najie_items.push({
          name: item.name?.trim().toLowerCase(),
          class: item.class,
          amount: item.数量 || 0
        });
      });
    }
  }

  // 4. 处理制作配方数据
  const zhizuo_list = data.zhizuo_list.map(recipe => {
    let max_craftable = Infinity;
    const materials_info = [];
    
    for (const material of recipe.materials) {
      const materialName = material.name?.trim().toLowerCase();
      const item = najie_items.find(i => i.name === materialName);
      
      const have = item ? item.amount : 0;
      const craftable = Math.floor(have / material.amount);
      max_craftable = Math.min(max_craftable, craftable);
      
      materials_info.push({
        name: material.name,
        class: material.class,
        amount: material.amount,
        have: have,
        enough: have >= material.amount
      });
    }
    
    return {
      ...recipe,
      max_craftable: max_craftable === Infinity ? 0 : max_craftable,
      materials: materials_info
    };
  });

  // 5. 调用Show类处理数据并生成图片
  try {
    const zhizuo_data = {
      user_id: usr_qq,
      zhizuo_list: zhizuo_list,
      player_level: player.level_id,
      timestamp: new Date().toLocaleString()
    };
    
     const data1 = await new Show(e).get_zhizuoData(zhizuo_data);
    const img = await puppeteer.screenshot('zhizuo', {
      ...data1, // 展开Show类处理后的数据
    });
    return img;
  } catch (err) {
    console.error("生成图片失败:", err);
    e.reply("生成制作列表失败，请稍后再试");
    throw err;
  }
}
export async function get_tuzhi_img(e, all_level) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }

  let tuzhi_list = data.tuzhi_list;

  let tuzhi_data = {
    user_id: usr_qq,
    tuzhi_list: tuzhi_list,
  };
  const data1 = await new Show(e).get_tuzhiData(tuzhi_data);
  let img = await puppeteer.screenshot('tuzhi', {
    ...data1,
  });
  return img;
}
//图开关
export async function setu(e) {
  e.reply(
    `玩命加载图片中,请稍后...   ` +
      '\n(一分钟后还没有出图片,大概率被夹了,这个功能谨慎使用,机器人容易寄)'
  );
  let url;
  //setu接口地址
  url = 'https://api.lolicon.app/setu/v2?proxy=i.pixiv.re&r18=0';
  let msg = [];
  let res;
  //
  try {
    let response = await fetch(url);
    res = await response.json();
  } catch (error) {
    console.log('Request Failed', error);
  }
  if (res !== '{}') {
    console.log('res不为空');
  } else {
    console.log('res为空');
  }
  let link = res.data[0].urls.original; //获取图链
  link = link.replace('pixiv.cat', 'pixiv.re'); //链接改为国内可访问的域名
  let pid = res.data[0].pid; //获取图片ID
  let uid = res.data[0].uid; //获取画师ID
  let title = res.data[0].title; //获取图片名称
  let author = res.data[0].author; //获取画师名称
  let px = res.data[0].width + '*' + res.data[0].height; //获取图片宽高
  msg.push(
    'User: ' +
      author +
      '\nUid: ' +
      uid +
      '\nTitle: ' +
      title +
      '\nPid: ' +
      pid +
      '\nPx: ' +
      px +
      '\nLink: ' +
      link
  );
  await sleep(1000);
  //最后回复消息
  e.reply(segment.image(link));
  //
  await ForwardMsg(e, msg);
  //返回true 阻挡消息不再往下
  return true;
}

//改变数据格式
export async function datachange(data) {
  if (data / 1000000000000 > 1) {
    return Math.floor((data * 100) / 1000000000000) / 100 + '万亿';
  } else if (data / 100000000 > 1) {
    return Math.floor((data * 100) / 100000000) / 100 + '亿';
  } else if (data / 10000 > 1) {
    return Math.floor((data * 100) / 10000) / 100 + '万';
  } else {
    return data;
  }
}
//写入纳戒信息,第二个参数是一个JavaScript对象
export async function Write_najie(usr_qq, najie) {
  let dir = path.join(__PATH.najie_path, `${usr_qq}.json`);
  let new_ARR = JSON.stringify(najie, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

//修为数量和灵石数量正增加,负减少
//使用时记得加await
export async function Add_灵石(usr_qq, 灵石数量 = 0, options = {}) {
  let player = await Read_player(usr_qq);
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey && player._rewardClaims?.[idempotencyKey]) return 0;
  const effects = getMinggeEffects(player, data.minggeList);
  const actualAmount = calculateMinggeCurrencyGain(灵石数量, effects, options || {});
  player.灵石 += actualAmount;
  if (idempotencyKey) {
    player._rewardClaims ??= {};
    player._rewardClaims[idempotencyKey] = { amount: actualAmount, claimedAt: Date.now() };
  }
  await Write_player(usr_qq, player);
  return actualAmount;
}
export async function Add_源石(usr_qq, 源石数量 = 0, options = {}) {
  let player = await Read_player(usr_qq);
  const effects = getMinggeEffects(player, data.minggeList);
  const actualAmount = options?.applyMingge === false
    ? Math.trunc(源石数量)
    : calculateMinggeSourceGain(源石数量, effects);
  player.源石 = (Number(player.源石) || 0) + actualAmount;
  await Write_player(usr_qq, player);
  return actualAmount;
}
export async function Add_修为(usr_qq, 修为数量 = 0) {
  let player = await Read_player(usr_qq);
  const effects = getMinggeEffects(player, data.minggeList);
  const actualAmount = calculateMinggeGain(修为数量, effects, '修炼加成');
  player.修为 += actualAmount;
  await Write_player(usr_qq, player);
  return actualAmount;
}
export async function Add_练气(usr_qq, 数量 = 0) {
  const player = await Read_player(usr_qq);
  player.level_id = Math.max(0, player.level_id + Math.trunc(数量));
  await Write_player(usr_qq, player);
  return;
}

export async function Add_炼体(usr_qq, 数量 = 0) {
  const player = await Read_player(usr_qq);
  player.Physique_id = Math.max(0, player.Physique_id + Math.trunc(数量));
  await Write_player(usr_qq, player);
}
export async function Add_寿元(usr_qq, 寿元数量 = 0) {
  let player = await Read_player(usr_qq);
  player.寿元 += Math.trunc(寿元数量);
  await Write_player(usr_qq, player);
  return;
}
export async function Add_魔道值(usr_qq, 魔道值 = 0) {
  let player = await Read_player(usr_qq);
  player.魔道值 += Math.trunc(魔道值);
  await Write_player(usr_qq, player);
  return;
}
export async function Add_血气(usr_qq, 血气 = 0) {
  let player = await Read_player(usr_qq);
  player.血气 += Math.trunc(血气);
  await Write_player(usr_qq, player);
  return;
}


export async function Add_热量(usr_qq, 热量 = 0) {
    let player = await Read_player(usr_qq);
  if (!isNotNull(player.热量)) {
    player.热量 = Math.trunc(热量);
    await Write_player(usr_qq, player);
    return;
  }
  if (isNotNull(player.热量)) {
    player.热量 += Math.trunc(热量);
        await Write_player(usr_qq, player);
        return;
    }
}

export async function Add_饱食度(usr_qq, 饱食度 = 0) {
    let player = await Read_player(usr_qq);
  if (!isNotNull(player.饱食度)) {
    player.饱食度 = Math.trunc(饱食度);
    await Write_player(usr_qq, player);
    return;
  }
  if (isNotNull(player.饱食度)) {
    player.饱食度 += Math.trunc(饱食度);
        await Write_player(usr_qq, player);
        return;
    }
}



export async function Add_HP(usr_qq, blood = 0) {
  let player = await Read_player(usr_qq);
  player.当前血量 += Math.trunc(blood);
  if (player.当前血量 > player.血量上限) {
    player.当前血量 = player.血量上限;
  }
  if (player.当前血量 < 0) {
    player.当前血量 = 0;
  }
  await Write_player(usr_qq, player);
  return;
}

export async function Set_HP(usr_qq, blood) {
  const hp = Number(blood);
  if (!Number.isFinite(hp)) {
    throw new TypeError(`无法设置玩家${usr_qq}的血量：${blood}`);
  }

  const player = await Read_player(usr_qq);
  player.当前血量 = Math.min(Math.max(Math.trunc(hp), 0), player.血量上限);
  await Write_player(usr_qq, player);
  return player.当前血量;
}
/**
 *
 * @param {*} usr_qq 用户qq
 * @param {*} exp 经验值
 * @returns
 */
export async function Add_职业经验(usr_qq, exp = 0) {
  let player = await Read_player(usr_qq);

  if (exp == 0) {
    return;
  }
  exp = player.occupation_exp + exp;
  let level = player.occupation_level;
  while (true) {
    if(level>36){
      break
    }
    let need_exp = data.occupation_exp_list.find(item => item.id == level).experience;

    if (need_exp > exp) {
      break;
    } else {
      exp -= need_exp;
      level++;
    }
  }
  player.occupation_exp = exp;
  player.occupation_level = level;
  await Write_player(usr_qq, player);
  return;
}

export async function Add_najie_灵石(usr_qq, lingshi) {
  let najie = await Read_najie(usr_qq);
  najie.灵石 += Math.trunc(lingshi);
  await Write_najie(usr_qq, najie);
  return;
}

export async function Add_player_学习功法(usr_qq, gongfa_name) {
  let player = await Read_player(usr_qq);
  player.学习的功法.push(gongfa_name);
  data.setData('player', usr_qq, player);
  await player_efficiency(usr_qq);
  return;
}
export async function Reduse_player_学习功法(usr_qq, gongfa_name) {
    let player = await Read_player(usr_qq);
    Array.prototype.remove = function (v) {
        for (let i = 0, j = 0; i < this.length; i++) {
            if (this[i] != v) {
                this[j++] = this[i];
            }
        }
        this.length -= 1;
    }
    player.学习的功法.remove(gongfa_name);
    data.setData("player", usr_qq, player);
    await player_efficiency(usr_qq);
    return;
}

//---------------------------------------------分界线------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//修炼效率综合
export async function player_efficiency(usr_qq) {
  //这里有问题
  let player = await data.getData('player', usr_qq); //修仙个人信息
  let ass;
  let Assoc_efficiency; //宗门效率加成
  let linggen_efficiency; //灵根效率加成
  let gongfa_efficiency = 0; //功法效率加成
  let xianchong_efficiency = 0; // 仙宠效率加成
  if (!isNotNull(player.宗门)) {
    //是否存在宗门信息
    Assoc_efficiency = 0; //不存在，宗门效率为0
  } else {
    ass = await data.getAssociation(player.宗门.宗门名称); //修仙对应宗门信息
    if (ass.宗门驻地 == 0) {
      Assoc_efficiency = ass.宗门等级 * 0.05;
    } else {
      let dongTan = await data.bless_list.find(
        item => item.name == ass.宗门驻地
      );
      try {
        Assoc_efficiency = ass.宗门等级 * 0.05 + dongTan.efficiency;
      } catch {
        Assoc_efficiency = ass.宗门等级 * 0.05 + 0.5;
      }
    }
  }
  linggen_efficiency = player.灵根.eff; //灵根修炼速率
  label1: for (let i in player.学习的功法) {
    //存在功法，遍历功法加成
    let gongfa = ['gongfa_list', 'timegongfa_list', 'dijingList'];
    //这里是查看了功法表
    for (let j of gongfa) {
      let ifexist = data[j].find(item => item.name == player.学习的功法[i]);
      if (ifexist) {
        gongfa_efficiency += ifexist.修炼加成;
        continue label1;
      }
    }
    player.学习的功法.splice(i, 1);
  }
  xianchong_efficiency = getPetAbilityBonus(player.仙宠, '修炼');
  let dy = await Read_danyao(usr_qq);
  let bgdan = dy.biguanxl;
  if (parseInt(player.修炼效率提升) != parseInt(player.修炼效率提升)) {
    player.修炼效率提升 = 0;
  }

  player.修炼效率提升 =
    linggen_efficiency +
    Assoc_efficiency +
    gongfa_efficiency +
    xianchong_efficiency +
    bgdan; //修炼效率综合
  data.setData('player', usr_qq, player);
  return;
}
/**
 *
 * @param {*} usr_qq 玩家qq
 * @param {*} thing_name 物品名
 * @param {*} thing_class 物品类别
 * @param {*} thing_pinji 可选参数，装备品阶，数字0-6等
 * @returns 物品数量或者false
 */

//修改纳戒物品锁定状态
export async function re_najie_thing(
  usr_qq,
  thing_name,
  thing_class,
  thing_pinji,
  lock
) {
  let najie = await Read_najie(usr_qq);
  if (thing_class == '装备' && (thing_pinji || thing_pinji == 0)) {
    for (let i of najie['装备']) {
      if (i.name == thing_name && i.pinji == thing_pinji) i.islockd = lock;
    }
  } else {
    for (let i of najie[thing_class]) {
      if (i.name == thing_name) i.islockd = lock;
    }
  }
  await Write_najie(usr_qq, najie);
  return true;
}

//检查纳戒内物品是否存在
//判断物品
//要用await
export async function exist_najie_thing(
  usr_qq,
  thing_name,
  thing_class,
  thing_pinji
) {
  let najie = await Read_najie(usr_qq);
  let ifexist;
  if (thing_class == '装备' && (thing_pinji || thing_pinji == 0)) {
    ifexist = najie.装备.find(
      item => item.name == thing_name && item.pinji == thing_pinji
    );
  } else {
    let type = [
      '宝石',
      '装备',
      '丹药',
      '道具',
      '功法',
      '草药',
      '材料',
      '仙宠',
      '仙宠口粮',
      '食材',
      '盒子'
    ];

    
    for (let i of type) {
      if(!isNotNull(najie[i])){
        najie[i]=[]
        await Write_najie(usr_qq, najie)
      }
      ifexist = najie[i].find(item => item.name == thing_name);
      if (ifexist) break;
    }
  }
  if (ifexist) {
    return ifexist.数量;
  }
  return false;
}
/**
 *
 * @param {*} usr_qq 用户qq
 * @param {*} thing_name 物品名
 * @param {*} thing_class 物品类别
 * @param {*} thing_pinji 品级 数字0-6
 * @returns
 */

/**
 * 增加减少纳戒内物品
 * @param usr_qq 操作存档的qq号
 * @param name  物品名称
 * @param thing_class  物品类别
 * @param x  操作的数量,取+增加,取 -减少
 * @param pinji 品级 数字0-6
 * @param equipmentMultiplier 装备属性倍率
 * @returns 无
 */
export async function Add_najie_thing(
  usr_qq,
  name,
  thing_class,
  x,
  pinji,
  equipmentMultiplier = 1,
  options = {}
) {

  if(x>0){
  let wupin= await foundthing(name)

  }
  if (x == 0) return;
  let najie = await Read_najie(usr_qq);
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey && najie._rewardClaims?.[idempotencyKey]) return 0;
  const persistNajie = async () => {
    if (idempotencyKey) {
      najie._rewardClaims ??= {};
      najie._rewardClaims[idempotencyKey] = { amount: x, claimedAt: Date.now() };
    }
    await Write_najie(usr_qq, najie);
  };
  //写入
  //这部分写得很冗余,但能跑
  if (thing_class == '装备') {
    if (!pinji && pinji != 0) {
      pinji = Math.trunc(Math.random() * 6);
    }
    const safeEquipmentMultiplier = Number.isFinite(Number(equipmentMultiplier))
      ? Math.max(0, Number(equipmentMultiplier))
      : 1;
    let z = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 2];
    if (x > 0) {
      if (typeof name != 'object') {
        let list = [
          'equipment_list',
          'dibing_list',
          'tszb_list',
          'timeequipmen_list',
          'duanzhaowuqi',
          'duanzhaohuju',
          'duanzhaobaowu',
          'namegive',
        ];
        for (let i of list) {
          let thing = data[i].find(item => item.name == name);
          if (thing) {
            let equ = JSON.parse(JSON.stringify(thing));
            equ.pinji = pinji;
            equ.atk *= z[pinji] * safeEquipmentMultiplier;
            equ.def *= z[pinji] * safeEquipmentMultiplier;
            equ.HP *= z[pinji] * safeEquipmentMultiplier;
            equ.数量 = x;
            equ.islockd = 0;
            najie[thing_class].push(equ);
            await persistNajie();
            return;
          }
        }
      } else {
        if (!name.pinji) name.pinji = pinji;
        name.数量 = x;
        name.islockd = 0;
        najie[thing_class].push(name);
        await persistNajie();
        return;
      }
    }
    if (typeof name != 'object') {
      najie[thing_class].find(
        item => item.name == name && item.pinji == pinji
      ).数量 += x;
    } else {
      const sameVariant = najie[thing_class].find(
        item =>
          item.name == name.name &&
          item.pinji == pinji &&
          Boolean(item.归一属性) === Boolean(name.归一属性)
      );
      (sameVariant || najie[thing_class].find(
        item => item.name == name.name && item.pinji == pinji
      )).数量 += x;
    }
    najie.装备 = najie.装备.filter(item => item.数量 > 0);
    await persistNajie();
    return;
  } else if (thing_class == '仙宠') {
    if (x > 0) {
      if (typeof name != 'object') {
        let thing = data.xianchon.find(item => item.name == name);
        if (thing) {
          thing = JSON.parse(JSON.stringify(thing));
          thing.数量 = x;
          thing.islockd = 0;
          najie[thing_class].push(thing);
          await persistNajie();
          return;
        }
      } else {
        name.数量 = x;
        name.islockd = 0;
        najie[thing_class].push(name);
        await persistNajie();
        return;
      }
    }
    if (typeof name != 'object') {
      najie[thing_class].find(item => item.name == name).数量 += x;
    } else {
      najie[thing_class].find(item => item.name == name.name).数量 += x;
    }
    najie.仙宠 = najie.仙宠.filter(item => item.数量 > 0);
    await persistNajie();
    return;
  }else  if (thing_class == '宝石')
    if (x > 0) {
      if (typeof name != 'object') {
        let list = [
          'baoshi_list',
        ];
        for (let i of list) {
          let thing = data[i].find(item => item.name == name);
          if (thing) {
            let equ = JSON.parse(JSON.stringify(thing));
            equ.数量 = x;
            equ.islockd = 0;
            najie[thing_class].push(equ);
            await persistNajie();
            return;
          }
        }
      } else {
        name.数量 = x;
        name.islockd = 0;
        najie[thing_class].push(name);
        await persistNajie();
        return;
      }
  }
  let exist = await exist_najie_thing(usr_qq, name, thing_class);
  if (x > 0 && !exist) {
    let thing;
    let list = [
      'danyao_list',
      'newdanyao_list',
      'timedanyao_list',
      'daoju_list',
      'gongfa_list',
      'timegongfa_list',
      'caoyao_list',
      'xianchonkouliang',
      'xianchonkouliang2',
      'duanzhaocailiao',
      'kamian',
      'kamian3',
     'hecheng_list',
     'dijingList',
     'fuhua_list',
    
     'shicai_list',
      'jiagong_list',
      'cailiao_list',
      'jingshenyuzhou_drop_list',
      'hezi_list',
    'baoshi_list'
    ];
    for (let i of list) {
      thing = data[i].find(item => item.name == name);
      if (thing) {
        najie[thing_class].push(thing);
        najie[thing_class].find(item => item.name == name).数量 = x;
        najie[thing_class].find(item => item.name == name).islockd = 0;
        await persistNajie();
        return;
      }
    }
  }
  najie[thing_class].find(item => item.name == name).数量 += x;
  najie[thing_class] = najie[thing_class].filter(item => item.数量 > 0);
  await persistNajie();
  return;
}

//替换装备
export async function instead_equipment(usr_qq, equipment_data) {
  //装备name
  await Add_najie_thing(
    usr_qq,
    equipment_data,
    '装备',
    -1,
    equipment_data.pinji
  );
  let equipment = await Read_equipment(usr_qq);
  if (equipment_data.type == '武器') {
    //把读取装备，把武器放回戒指
    await Add_najie_thing(
      usr_qq,
      equipment.武器,
      '装备',
      1,
      equipment.武器.pinji
    );
    //根据名字找武器
    equipment.武器 = equipment_data;
    //武器写入装备
    await Write_equipment(usr_qq, equipment);
    return;
  }
  if (equipment_data.type == '护具') {
    await Add_najie_thing(
      usr_qq,
      equipment.护具,
      '装备',
      1,
      equipment.护具.pinji
    );
    equipment.护具 = equipment_data;
    await Write_equipment(usr_qq, equipment);
    return;
  }
  if (equipment_data.type == '法宝') {
    await Add_najie_thing(
      usr_qq,
      equipment.法宝,
      '装备',
      1,
      equipment.法宝.pinji
    );
    equipment.法宝 = equipment_data;
    await Write_equipment(usr_qq, equipment);
    return;
  }
  if (equipment_data.type == '帝兵') {
    await Add_najie_thing(
      usr_qq,
      equipment.帝兵,
      '装备',
      1,
      equipment.帝兵.pinji
    );
    equipment.帝兵 = equipment_data;
    await Write_equipment(usr_qq, equipment);
    return;
  }
  return;
}
//发送转发消息
//输入data一个数组,元素是字符串,每一个元素都是一条消息.
export async function ForwardMsg(e, data) {
//  let msgList = [];
//  for (let i of data) {
//    msgList.push({
//      message: i,
//      nickname: Bot.nickname,
//      user_id: Bot.uin,
//    });
//  }
//  if (msgList.length == 1) {
//    await e.reply(msgList[0].message);
//  } else {
//    await e.reply(await Bot.makeForwardMsg(msgList));
//  }
let img = await get_fight_img(e,data)
e.reply(img)
  return;
}


//对象数组排序
export function sortBy(field) {
  //从大到小,b和a反一下就是从小到大
  return function (b, a) {
    return a[field] - b[field];
  };
}

//获取总修为
export async function Get_xiuwei(usr_qq) {
  let player = await Read_player(usr_qq);
  let sum_exp = 0;
  let now_level_id;
  if (!isNotNull(player.level_id)) {
    return;
  }
  now_level_id = data.Level_list.find(
    item => item.level_id == player.level_id
  ).level_id;
  if (now_level_id < 65) {
    for (var i = 1; i < now_level_id; i++) {
      sum_exp = sum_exp + data.Level_list.find(temp => temp.level_id == i).exp;
    }
  } else {
    sum_exp = -999999999;
  } //说明玩家境界有错误
  sum_exp += player.修为;
  return sum_exp;
}
/**
 * 获取玩家的天资相关数据
 * @param {string} player 玩家对象
 * @returns {object} 包含天资信息和索引的对象
 */
export async function getPlayerAptitudeData(player) {
    // 完整的天资等级序列（从低到高）
    const aptitudeSequence = [
        '无化如是',
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
    
    // 天资等级描述
    const aptitudeDescriptions = {
        '无化如是': '无用之人，命中注定难有所作为，任何外力都无法改变',
        '生而愚痴': '天生愚笨，修炼难如登天',
        '天弃之人': '被天道抛弃，修炼必遭反噬',
        '先天不足': '先天有缺，修炼事倍功半',
        '平庸之资': '资质平平，勉勉强强',
        '超凡资质': '资质超凡，注定异于常人',
        '天纵之资': '天赋异禀，媲美上古大教的天才',
        '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻',
        '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
        '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌',
        '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚'
    };
    
    const currentAptitude = player.天资等级 || '无化如是';
    const currentIndex = aptitudeSequence.indexOf(currentAptitude);
    const description = aptitudeDescriptions[currentAptitude] || '未知天资';
    
    return {
        // 天资等级
        grade: currentAptitude,
        
        // 天资描述
        description: description,
        
        // 在序列中的索引位置
        index: currentIndex >= 0 ? currentIndex : 0,
        
        // 天资序列（完整）
        sequence: aptitudeSequence,
        
        // 判断是否为特殊天资
        isSpecialGrade: currentAptitude === '无化如是' || currentAptitude === '生而愚痴',
        
        // 判断是否达到指定资质
        isAtLeast: function(minGrade) {
            const minIndex = aptitudeSequence.indexOf(minGrade);
            return this.index >= minIndex;
        },
        
        // 获取下一等级
        getNextGrade: function() {
            if (this.index >= aptitudeSequence.length - 1) {
                return null; // 已经是最高等级
            }
            return aptitudeSequence[this.index + 1];
        },
        
        // 获取上一等级
        getPrevGrade: function() {
            if (this.index <= 0) {
                return null; // 已经是最低等级
            }
            return aptitudeSequence[this.index - 1];
        }
    };
}
// 获取随机天资等级
async function get_random_aptitude() {
  // 定义天资等级及其概率
  const aptitudeGrades = {
    '无演无尽': 0.00001,   // 0.001% (传说中的存在)
    '万古无双': 0.0001,    // 0.01% (百万年难遇)
    '绝世天骄': 0.001,     // 0.1% (十万年难遇)
    '旷世奇才': 0.005,     // 0.5% (万年难遇)
    '天纵之资': 0.01,      // 1% (百年难遇)
    '超凡资质': 0.05,      // 5% (宗门核心弟子级别)
    '平庸之资': 0.78379,   // 78.379% (普通凡人)
    '先天不足': 0.1,       // 10% (修炼困难)
    '天弃之人': 0.05,       // 5% (被天道诅咒)
    '生而痴傻': 0.005,       // 0.5% (几乎被磨灭资质)
    '无化如是': 0.001,       // 0.1% (无用之人)
  };

  // 计算总概率确保为1
  const totalProbability = Object.values(aptitudeGrades).reduce((sum, p) => sum + p, 0);
  if (Math.abs(totalProbability - 1) > 0.0001) {
    aptitudeGrades['平庸之资'] += 1 - totalProbability;
  }

  // 生成随机数决定天资等级
  const rand = Math.random();
  let cumulative = 0;
  let selectedGrade = '平庸之资';

  for (const [grade, prob] of Object.entries(aptitudeGrades)) {
    cumulative += prob;
    if (rand < cumulative) {
      selectedGrade = grade;
      break;
    }
  }

  // 天资评价描述
  const descriptions = {
    '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚',
    '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌',
    '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
    '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻',
    '天纵之资': '天赋异禀，媲美上古大教的天才',
    '超凡资质': '资质超凡，注定异于常人',
    '平庸之资': '资质平平，勉勉强强',
    '先天不足': '先天有缺，修炼事倍功半',
    '天弃之人': '被天道抛弃，修炼必遭反噬，但仍有希望',
    '生而痴傻': '天生愚笨，修炼难如登天',
    '无化如是': '无用之人，命中注定难有所作为'
  };

  return {
    grade: selectedGrade,
    evaluation: descriptions[selectedGrade],
    probability: aptitudeGrades[selectedGrade]
  };
}
// 获取随机灵根
export async function get_random_talent() {
  // 定义灵根类型概率
  const talentProbabilities = {
    '大道体': 0.00001,
    '至尊体': 0.0001,     // 0.01%
    '圣体': 0.0009,        // 0.09%
    '霸体': 0.0010,        // 0.10% (新增)
    '神王体': 0.0011,      // 0.11% (新增)
    '道胎': 0.0012,        // 0.12%
    '神体': 0.002,         // 0.2%
    '妖体': 0.005,         // 0.5%
    '天灵根': 0.08,        // 8%
    '变异灵根': 0.05,      // 5%
    '体质': 0.2,           // 20%
    '真灵根': 0.29,        // 29%
    '伪灵根': 0.36869      // 36.869%（1 - 其余概率之和，确保总和为1，消除告警）
  };

  // 计算总概率确保为1
  const totalProbability = Object.values(talentProbabilities).reduce((sum, p) => sum + p, 0);
  if (Math.abs(totalProbability - 1) > 0.0001) {
    console.error('灵根概率总和不为1:', totalProbability);
    // 自动调整伪灵根概率使总和为1
    talentProbabilities.伪灵根 += 1 - totalProbability;
  }

  // 生成随机数决定灵根类型
  const rand = Math.random();
  let cumulative = 0;
  let selectedType = '伪灵根'; // 默认值

  // 按优先级顺序检查
  const priorityOrder = [
    '大道体', '至尊体', '圣体', '霸体', '神王体', // 新增霸体和神王体
    '道胎', '神体', '妖体',  
    '天灵根', '变异灵根', '体质', '真灵根', '伪灵根'
  ];

  for (const type of priorityOrder) {
    cumulative += talentProbabilities[type];
    if (rand < cumulative) {
      selectedType = type;
      break;
    }
  }

  // 获取对应类型的灵根列表
  let talentList = data.talent_list.filter(item => item.type === selectedType);
  
  // 如果列表为空，使用伪灵根作为备选
  if (talentList.length === 0) {
    console.warn(`未找到${selectedType}类型的灵根，使用伪灵根代替`);
    talentList = data.talent_list.filter(item => item.type === '伪灵根');
  }

  // 随机选择一个灵根
  const randomIndex = Math.floor(Math.random() * talentList.length);
  return talentList[randomIndex];
}
// 在xiuxian.js中添加这个函数
export function getMonsterByLocation(weizhi, xf = -1) {
  let monster_list;
  
  if (
    weizhi.name == '三清山' ||
    weizhi.name == '张家界' ||
    weizhi.name == '九寨沟' ||
    weizhi.name == '灵通山' ||
    weizhi.name == '啵唧的小金库' ||
    (weizhi.name == '低级' && xf == 0) ||
    weizhi.name == '太玄门' || 
    weizhi.name == '瑶池旧址'|| 
    weizhi.name == '小涅槃界天墟'
  ) {
    monster_list = data.monster_list1;
  } else if (
    weizhi.name == '华山之巅' ||
    weizhi.name == '武当山' ||
    weizhi.name == '天下会' ||
    (weizhi.name == '中级' && xf == 0) ||
    weizhi.name == '职场' ||
    weizhi.name == '昆仑墟' ||
    weizhi.name == '须弥'
  ) {
    monster_list = data.monster_list2;
  } else if (
    weizhi.name == '试炼' ||
    weizhi.name == '华山' ||
    weizhi.name == '衡山' ||
    weizhi.name == '嵩山' ||
    weizhi.name == '桃花岛' ||
    (weizhi.name == '高级' && xf == 0) ||
    weizhi.name == '轮回池' ||
    weizhi.name == '神龙山' ||
    weizhi.name == '火域' ||
    weizhi.name == '大夏祖庙'
  ) {
    monster_list = data.monster_list3;
  } else if (
    weizhi.name == '神兽试炼' ||
    weizhi.name == '灭仙洞' ||
    weizhi.name == '禁忌海' ||
    weizhi.name == '雷风岛' ||
    weizhi.name == '仙遗之地' ||
    weizhi.name == '无欲天仙' ||
    weizhi.name == '须弥'
  ) {
    monster_list = data.monster_list4;
  } else if (
    weizhi.name == '剑冢' ||
    weizhi.name == '影界' ||
    weizhi.name == '太极之阴' ||
    weizhi.name == '太极之阳' ||
    weizhi.name == '剑帝传承' ||
    weizhi.name == '荧惑古星' ||
    weizhi.name == '灵墟洞天'
  ) {
    monster_list = data.monster_list5;
  } else if (weizhi.name == '终极古地') {
    monster_list = data.monster_list_huodong;
  } else if (weizhi.name == '接引古殿') {
    monster_list = data.monster_list_jieyin;
  } else if (
    weizhi.name == '永恒海' ||
    weizhi.name == '永恒海尽头' ||
    weizhi.name == '诸天'
  ) {
    monster_list = data.monster_list9;
  } else if (
    weizhi.name == '紫薇星域' || 
    weizhi.name == '真魔殿' || 
    weizhi.name == '北斗南域'
  ) {
    monster_list = data.monster_list10;
  } else if (weizhi.name == '葬天星墟') {
    monster_list = data.monster_list11;
  } else if (
    weizhi.name == '荒古禁地' ||
    weizhi.name == '青铜仙殿' ||
    weizhi.name == '万龙巢'||
    weizhi.name == '圣崖'
  ) {
    monster_list = data.monster_list12;
  } else if (weizhi.name == '始源·混沌初开之地') {
    monster_list = data.monster_list13;
  } else if (weizhi.name == '太初古矿') {
    monster_list = data.monster_list14;
  } else if (weizhi.name == '北斗星紫山') {
    monster_list = data.monster_list15;
  } else if (weizhi.name == '神域星宫') {
    monster_list = data.monster_list16;
  } else if (
    weizhi.name == '蓬莱岛' ||
    weizhi.name == '昆仑山' ||
    weizhi.name == '方诸山' ||
    weizhi.name == '杀神崖' ||
    weizhi.name == '斩魔谷' ||
    weizhi.name == '仙界矿场' ||
    weizhi.name == '诸神黄昏·旧神界' ||
    weizhi.name == '瑞泽云海' ||
    (weizhi.name == '高级' && xf == 1)
  ) {
    monster_list = data.monster_list6;
  } else if (weizhi.name == '低级' && xf == 1) {
    monster_list = data.monster_list7;
  } else if (weizhi.name == '中级' && xf == 1) {
    monster_list = data.monster_list8;
  } else if (weizhi.id == 5200) {
    monster_list = data.monster_list1;
  } else {
    monster_list = data.monster_list;
  }

  const monster_index = Math.trunc(Math.random() * monster_list.length);
  return monster_list[monster_index];
}
/**
 * 输入概率随机返回布尔类型数据
 * @param P 概率
 * @returns 随机返回 false or true
 */
export function get_random_res(P) {
  if (P > 1) {
    P = 1;
  }
  if (P < 0) {
    P = 0;
  }
  let rand = Math.random();
  if (rand < P) {
    return true;
  }
  return false;
}

/**
 * 输入数组随机返回其中一个
 * @param ARR 输入的数组
 * @returns 随机返回一个元素
 */
export function get_random_fromARR(ARR) {
  //let L = ARR.length;
  let randindex = Math.trunc(Math.random() * ARR.length);
  return ARR[randindex];
}

//sleep
export async function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

// 时间转换
export function timestampToTime(timestamp) {
  //时间戳为10位需*1000，时间戳为13位的话不需乘1000
  var date = new Date(timestamp);
  var Y = date.getFullYear() + '-';
  var M =
    (date.getMonth() + 1 < 10
      ? '0' + (date.getMonth() + 1)
      : date.getMonth() + 1) + '-';
  var D = date.getDate() + ' ';
  var h = date.getHours() + ':';
  var m = date.getMinutes() + ':';
  var s = date.getSeconds();
  return Y + M + D + h + m + s;
}

//根据时间戳获取年月日时分秒
export async function shijianc(time) {
  let dateobj = {};
  var date = new Date(time);
  dateobj.Y = date.getFullYear();
  dateobj.M = date.getMonth() + 1;
  dateobj.D = date.getDate();
  dateobj.h = date.getHours();
  dateobj.m = date.getMinutes();
  dateobj.s = date.getSeconds();
  return dateobj;
}

//获取上次签到时间
export async function getLastsign(usr_qq) {
  //查询redis中的人物动作
  let time = await redis.get('xiuxian:player:' + usr_qq + ':lastsign_time');
  if (time != null) {
    let data = await shijianc(parseInt(time));
    return data;
  }
  return false;
}
//获取上次周年庆签到时间
export async function getLastsign2(usr_qq) {
  //查询redis中的人物动作
  let time = await redis.get('xiuxian:player:' + usr_qq + ':lastsign_time2');
  if (time != null) {
    let data = await shijianc(parseInt(time));
    return data;
  }
  return false;
}
//获取上次周年庆签到时间
export async function getxinghailastsign_time(usr_qq) {
  //查询redis中的人物动作
  let time = await redis.get('xiuxian:player:' + usr_qq + ':xinghailastsign_time');
  if (time != null) {
    let data = await shijianc(parseInt(time));
    return data;
  }
  return false;
}
//获取上次道法仙术签到时间
export async function getLastsign3(usr_qq) {
  //查询redis中的人物动作
  let time = await redis.get('xiuxian:player:' + usr_qq + ':lastsign_time3');
  if (time != null) {
    let data = await shijianc(parseInt(time));
    return data;
  }
  return false;
}
export async function getPlayerAction(usr_qq) {
    try {
        // 查询redis中的人物动作
        let actionData = await redis.get('xiuxian:player:' + usr_qq + ':action');
        if (!actionData) {
            return {
                action: '空闲'
            };
        }
        
        const action = JSON.parse(actionData);
        const now_time = new Date().getTime();
        
        // 确定结束时间
        let end_time;
        if (action.end_time) {
            // 普通副本（禁地历练）结构
            end_time = action.end_time;
        } else if (action.Place_actionplus == '0') {
            // 沉迷副本（秘境历练）结构 - 使用 start_time + total_time
            end_time = action.start_time + action.total_time * 60 * 1000;
        } else {
            console.error('无效的动作数据：缺少结束时间', action);
            return {
                action: '空闲',
                error: '动作数据异常'
            };
        }
        
        // 检查动作是否已完成
        if (now_time > end_time) {
            return {
                action: '空闲'
            };
        }
        
        // 计算剩余时间
        const remainingMs = end_time - now_time;
        
        // 确保剩余时间是正数
        if (remainingMs <= 0) {
            return {
                action: '空闲'
            };
        }
        
        // 计算分钟和秒
        const m = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
        const s = Math.max(0, Math.floor((remainingMs % (1000 * 60)) / 1000));
        
        // 基础返回对象
        const result = {
            action: action.action,
            time: `${m}分${s}秒`,
            progress: '0%',
            location: '无'
        };
        
        // 处理沉迷仙境状态（秘境历练）
        if (action.Place_actionplus === '0') {
           
            result.location = action.Place_address?.name || '未知';
            
            // 计算进度
            if (action.total_count && action.settled_count !== undefined) {
                const total = Number(action.total_count);
                const settled = Number(action.settled_count);
                
                if (!isNaN(total) && !isNaN(settled) && total > 0) {
                    const progress = Math.round((settled / total) * 100);
                    result.progress = `${progress}%`;
                }
            }
        }
        // 处理普通副本状态（禁地历练）
        else if (action.action === '禁地历练') {
            result.location = action.Place_address?.name || '未知地点';
            
            // 计算进度（基于时间）
            if (action.time && !isNaN(action.time)) {
                const totalTimeMs = action.time;
                if (totalTimeMs > 0) {
                    const progress = Math.round((1 - remainingMs / totalTimeMs) * 100);
                    result.progress = `${progress}%`;
                }
            }
        }
        // 处理位面传送状态
        else if (action.action === '位面传送') {
            result.location = action.to_name || '未知地点';
            
            // 计算进度
            if (action.travel_time && !isNaN(action.travel_time)) {
                const travelTimeMs = action.travel_time * 60 * 1000;
                if (travelTimeMs > 0) {
                    const progress = Math.round((1 - remainingMs / travelTimeMs) * 100);
                    result.progress = `${progress}%`;
                }
            }
        }
        // 处理其他状态
        else {
            result.location = action.Place_address?.name || '无';
        }
        
        return result;
    } catch (err) {
        console.error('获取玩家状态出错：', err);
        return {
            action: '空闲',
            error: '系统错误'
        };
    }
}

//锁定
export async function dataverification(e) {
  if (!e.isGroup) {
    //禁私聊
    return 1;
  }
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  if (usr_qq == 80000000) {
    //非匿名
    return 1;
  }
  let ifexistplay = await existplayer(usr_qq);
  if (!ifexistplay) {
    //无存档
    return 1; //假
  }
  //真
  return 0;
}

/**
 * 判断对象是否不为undefined且不为null
 * @param obj 对象
 * @returns
 */
export function isNotNull(obj) {
  if (obj == undefined || obj == null) return false;
  return true;
}

export function isNotBlank(value) {
  if (value ?? '' !== '') {
    return true;
  } else {
    return false;
  }
}

export async function Read_qinmidu() {
  let dir = path.join(`${__PATH.qinmidu}/qinmidu.json`);
  let qinmidu = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  qinmidu = JSON.parse(qinmidu);
  return qinmidu;
}

export async function Write_qinmidu(qinmidu) {
  let dir = path.join(__PATH.qinmidu, `qinmidu.json`);
  let new_ARR = JSON.stringify(qinmidu, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
export async function Read_channel() {
  let dir = path.join(`${__PATH.channel}/channel.json`);
  let channel = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  channel = JSON.parse(channel);
  return channel;
}

export async function Write_channel(channel) {
  let dir = path.join(__PATH.channel, `channel.json`);
  let new_ARR = JSON.stringify(channel, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
export async function fstadd_channel(A, B, key) {
  let channel;
  try {
    channel = await Read_channel();
  } catch {
    //没有表要先建立一个！
    await Write_channel([]);
    channel = await Read_channel();
  }
  let pd=false
  var i = A;
  var l=0;
      while(i >= 1){
      i=i/10;
      l++;
      }
  if(l>10){//判断是否为频道19位id
    pd=true
  }
  let player=''
  if(pd){
    player = {
      QQ_ID: B,
      频道_ID: A,
      密钥: key,
    };
  }else{
    player = {
    QQ_ID: A,
    频道_ID: B,
    密钥: key,
  };
  }
  if(player==''){
    console.log("出现错误!!!!:设置绑定请求出现错误")
    return
  }
  channel.push(player);
  await Write_channel(channel);
  return;
}
export async function fstadd_qinmidu(A, B) {
  let qinmidu;
  try {
    qinmidu = await Read_qinmidu();
  } catch {
    //没有表要先建立一个！
    await Write_qinmidu([]);
    qinmidu = await Read_qinmidu();
  }
  let player = {
    QQ_A: A,
    QQ_B: B,
    亲密度: 0,
    婚姻: 0,
  };
  qinmidu.push(player);
  await Write_qinmidu(qinmidu);
  return;
}

export async function add_qinmidu(A, B, qinmi) {
  let qinmidu;
  try {
    qinmidu = await Read_qinmidu();
  } catch {
    //没有表要先建立一个！
    await Write_qinmidu([]);
    qinmidu = await Read_qinmidu();
  }
  let i;
  for (i = 0; i < qinmidu.length; i++) {
    if (
      (qinmidu[i].QQ_A == A && qinmidu[i].QQ_B == B) ||
      (qinmidu[i].QQ_A == B && qinmidu[i].QQ_B == A)
    ) {
      break;
    }
  }
  if (i == qinmidu.length) {
    await fstadd_qinmidu(A, B);
    qinmidu = await Read_qinmidu();
  }
  qinmidu[i].亲密度 += qinmi;
  await Write_qinmidu(qinmidu);
  return;
}

export async function find_qinmidu(A, B) {
  let qinmidu;
  try {
    qinmidu = await Read_qinmidu();
  } catch {
    //没有建立一个
    await Write_qinmidu([]);
    qinmidu = await Read_qinmidu();
  }
  let i;
  let QQ = [];
  for (i = 0; i < qinmidu.length; i++) {
    if (qinmidu[i].QQ_A == A || qinmidu[i].QQ_A == B) {
      if (qinmidu[i].婚姻 != 0) {
        QQ.push = qinmidu[i].QQ_B;
        break;
      }
    } else if (qinmidu[i].QQ_B == A || qinmidu[i].QQ_B == B) {
      if (qinmidu[i].婚姻 != 0) {
        QQ.push = qinmidu[i].QQ_A;
        break;
      }
    }
  }
  for (i = 0; i < qinmidu.length; i++) {
    if (
      (qinmidu[i].QQ_A == A && qinmidu[i].QQ_B == B) ||
      (qinmidu[i].QQ_A == B && qinmidu[i].QQ_B == A)
    ) {
      break;
    }
  }
  if (i == qinmidu.length) {
    return false;
  } else if (QQ.length != 0) {
    return 0;
  } else {
    return qinmidu[i].亲密度;
  }
}
//查询A的婚姻，如果有婚姻则返回对方qq，若无则返回false
export async function exist_hunyin(A) {
  let qinmidu;
  try {
    qinmidu = await Read_qinmidu();
  } catch {
    //没有建立一个
    await Write_qinmidu([]);
    qinmidu = await Read_qinmidu();
  }
  let i = 0;
  let flag = 0;
  for (i = 0; i < qinmidu.length; i++) {
    if (qinmidu[i].QQ_A == A) {
      //已婚则将A/B的另一半存到QQ数组中
      if (qinmidu[i].婚姻 != 0) {
        flag = qinmidu[i].QQ_B;
        break;
      }
    } else if (qinmidu[i].QQ_B == A) {
      if (qinmidu[i].婚姻 != 0) {
        flag = qinmidu[i].QQ_A;
        break;
      }
    }
  }
  //A存在已婚则返回对方qq
  if (flag != 0) {
    //console.log(flag);
    return flag;
  } else {
    return false;
  }
}

export async function Write_shitu(shitu) {
  let dir = path.join(__PATH.shitu, `shitu.json`);
  let new_ARR = JSON.stringify(shitu, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
export async function Read_shitu() {
  let dir = path.join(`${__PATH.shitu}/shitu.json`);
  let shitu = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  shitu = JSON.parse(shitu);
  return shitu;
}

export async function fstadd_shitu(A) {
  let shitu;
  try {
    shitu = await Read_shitu();
  } catch {
    //没有表要先建立一个！
    await Write_shitu([]);
    shitu = await Read_shitu();
  }
  let player = {
    师傅: A,
    收徒: 0,
    未出师徒弟: 0,
    任务阶段: 0,
    renwu1: 0,
    renwu2: 0,
    renwu3: 0,
    师徒BOOS剩余血量: 100000000,
    已出师徒弟: [],
  };
  shitu.push(player);
  await Write_shitu(shitu);
  return;
}

export async function add_shitu(A, num) {
  let shitu;
  try {
    shitu = await Read_shitu();
  } catch {
    //没有表要先建立一个！
    await Write_shitu([]);
    shitu = await Read_shitu();
  }
  let i;
  for (i = 0; i < shitu.length; i++) {
    if (shitu[i].A == A) {
      break;
    }
  }
  if (i == shitu.length) {
    await fstadd_shitu(A);
    shitu = await Read_shitu();
  }
  shitu[i].收徒 += num;
  await Write_shitu(shitu);
  return;
}

export async function find_shitu(A) {
  let shitu;
  try {
    shitu = await Read_shitu();
  } catch {
    //没有建立一个
    await Write_shitu([]);
    shitu = await Read_shitu();
  }
  let i;
  let QQ = [];
  for (i = 0; i < shitu.length; i++) {
    if (shitu[i].师傅 == A) {
      break;
    }
  }
  if (i == shitu.length) {
    return false;
  } else if (QQ.length != 0) {
    return 0;
  } else {
    return shitu[i].师徒;
  }
}

export async function find_tudi(A) {
  let shitu;
  shitu = await Read_shitu();
  let i;
  let QQ = [];
  for (i = 0; i < shitu.length; i++) {
    if (shitu[i].未出师徒弟 == A) {
      break;
    }
  }
  if (i == shitu.length) {
    return 0;
  } else if (QQ.length != 0) {
    return 0;
  } else {
    return shitu[i].师徒;
  }
}
export async function Read_danyao(usr_qq) {
  let dir = path.join(`${__PATH.danyao_path}/${usr_qq}.json`);
  let danyao = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  danyao = JSON.parse(danyao);
  return danyao;
}

export async function Write_danyao(usr_qq, danyao) {
  let dir = path.join(__PATH.danyao_path, `${usr_qq}.json`);
  let new_ARR = JSON.stringify(danyao, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
/**
 * 查找沉迷消息
 * @param {玩家ID} usr_qq 
 * @param {true或false} returns true为返回下标false为数据，不可为空
 * @returns 
 */
export async function find_temp(usr_qq, returns) {
    let temp = await Read_temp()
    let index
    let rom = []
    for (let i = 0; i < temp.length; i++) {
        if (temp[i].usr_qq == usr_qq) {
            index = i
            if (returns) {
                rom = i
            } else {
                rom = temp[i]
            }
        }
    }
    return rom
}
export async function Read_temp() {
  let dir = path.join(`${__PATH.temp_path}/temp.json`);
  let temp = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  temp = JSON.parse(temp);
  return temp;
}

export async function Write_temp(temp) {
  let dir = path.join(__PATH.temp_path, `temp.json`);
  let new_ARR = JSON.stringify(temp, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}
export async function Write_renwu(renwu) {
  let dir = path.join(__PATH.renwu, `renwu.json`);
  let new_ARR = JSON.stringify(renwu, "", "\t");
  fs.writeFileSync(dir, new_ARR, 'utf8', (err) => {
      console.log('写入成功', err)
  })
  return;
}
export async function Read_renwu() {
  let dir = path.join(`${__PATH.renwu}/renwu.json`);
  let renwu = fs.readFileSync(dir, 'utf8', (err, data) => {
      if (err) {
          console.log(err)
          return "error";
      }
      return data;
  })
  //将字符串数据转变成数组格式
  renwu = JSON.parse(renwu);
  return renwu;
}

export async function Add_renwu_progress(A, field, amount = 1) {
  const statusField = { jilu1: 'wancheng1', jilu2: 'wancheng2', jilu3: 'wancheng3' }[field];
  if (!statusField || !Number.isFinite(Number(amount))) return false;

  const lockKey = 'xiuxian:lock:daily_task_records';
  const token = `${A}:${Date.now()}:${Math.random()}`;
  let locked = false;
  for (let attempt = 0; attempt < 100 && !locked; attempt++) {
    locked = Boolean(await redis.set(lockKey, token, { EX: 15, NX: true }));
    if (!locked) await sleep(25);
  }
  if (!locked) return false;

  try {
    const renwu = await Read_renwu();
    const record = renwu.find(item => String(item?.player) === String(A));
    if (!record || record[statusField] !== 1) return false;
    record[field] = (Number(record[field]) || 0) + Number(amount);
    await Write_renwu(renwu);
    return true;
  } finally {
    try {
      await redis.eval(`
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
      `, { keys: [lockKey], arguments: [token] });
    } catch (error) {
      console.error('释放每日任务记录锁失败:', error);
    }
  }
}



export async function fstadd_renwu(A) {
  let renwu;
  try {
      renwu = await Read_renwu();
      ;
  } catch {
      //没有表要先建立一个！
      await Write_renwu([]);
      renwu = await Read_renwu();
  }
  let player = {
      player: A,
      等级: 0,
      经验: 0,
      renwu: 0,
      wancheng1: 0,
      jilu1: 0,
      wancheng2: 0,
      jilu2: 0,
      wancheng3: 0,
      jilu3: 0,
      jiequ: []

  }
  renwu.push(player);
  await Write_renwu(renwu);
  return;
}

export async function add_renwu(A, num) {
  let renwu;
  try {
      renwu = await Read_renwu();
      ;
  } catch {
      //没有表要先建立一个！
      await Write_renwu([]);
      renwu = await Read_renwu();
  }
  let i;
  for (i = 0; i < renwu.length; i++) {
      if (renwu[i].player == A) {
          break;
      }
  }
  if (i == renwu.length) {
      await fstadd_renwu(A);
      renwu = await Read_renwu();
  }
  renwu[i].等级 += num;
  await Write_renwu(renwu);
  return;
}

export async function find_renwu(A) {
  let renwu;
  try {
      renwu = await Read_renwu();
  } catch {
      //没有建立一个
      await Write_renwu([])
      renwu = await Read_renwu();
  }
  let i;
  for (i = 0; i < renwu.length; i++) {
      if (renwu[i].player == A) {
          break;

      }
  }
  if (i == renwu.length) {
      return false;
  }
  return true;
}
/**
 * 常用查询合集
 */
export async function Go(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    
    // 定义位置状态映射
    const PLACE_STATES = {
        0: "凡间",
        1: "仙界",
        2: "遮天位面",
        2.5: "九天十地",
        3: "界海",
        3.5: "太初星墟",
        4: "时间长河",
        5: "永恒未知之地"
    };
    
    // 获取当前位置名称
    const currentPlace = player.power_place || 0; // 默认为仙界
    const placeName = PLACE_STATES[currentPlace] || "未知之地";
    
    // // 不开放私聊
    // if (!e.isGroup) {
    //     return 0;
    // }
    
    // 有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        return 0;
    }
    
    // 获取游戏状态
    let game_action = await redis.get('xiuxian:player:' + usr_qq + ':game_action');
    
    // 防止继续其他娱乐行为
    if (game_action == 0) {
        e.reply('修仙：游戏进行中...');
        return 0;
    }
    
    // 查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
    action = JSON.parse(action);
    
    if (action != null) {
        // 人物有动作查询动作结束时间
        let action_end_time = action.end_time;
        let now_time = new Date().getTime();
        if (action.Place_actionplus === '0') {
        // 沉迷副本（秘境历练）结构
        action_end_time = action.start_time + action.total_time * 60 * 1000;
    } 
        if (now_time <= action_end_time) {
            const m = parseInt((action_end_time - now_time) / 1000 / 60);
            const s = parseInt((action_end_time - now_time - m * 60 * 1000) / 1000);
            const replyMsg = [
                `真身当前位置：${placeName}`,
  
                `正在${action.action}中，剩余时间：${m}分${s}秒`
            ];

            
            // 发送所有信息
            e.reply(replyMsg.join("\n"));
            return 0;
        }
    
    
    // ...其他代码...


    // if(action.Place_action==0){
    //   action=action.toString()
    //   e.reply(`降临秘境${action.Place_address}已完成,等待结算中`)
    //   return 0;
    // }

    // if(action.Place_actionplus==0){
    //   action=action.toString()
    //   e.reply(`沉迷秘境${action.Place_address}x${action.cishu}次已完成,等待结算中`)
    //   return 0;
    // }
  }

  return true;
}
// export async function Go(e) {
//   let usr_qq = e.user_id;
//   //不开放私聊
//   if (!e.isGroup) {
//     return 0;
//   }
//   //有无存档
//   let ifexistplay = await existplayer(usr_qq);
//   if (!ifexistplay) {
//     return 0;
//   }
//   //获取游戏状态
//   let game_action = await redis.get(
//     'xiuxian:player:' + usr_qq + ':game_action'
//   );
//   //防止继续其他娱乐行为
//   if (game_action == 0) {
//     e.reply('修仙：游戏进行中...');
//     return 0;
//   }
//   //查询redis中的人物动作
//   let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
//   action = JSON.parse(action);
//   let now_time = new Date().getTime();
//   if (action != null) {
//     if("禁闭" == action.action){
//       if(null != action.start_time){
//         if(0 <= now_time - action.start_time- 3600000){
//           await redis.del('xiuxian:player:' + usr_qq + ':action');
//           e.reply("碎了一觉，跑出来了")
//           return true;
//         }
//       }else if(null != action.end_time){
//         if(0 <= now_time - action.end_time){
//           await redis.del('xiuxian:player:' + usr_qq + ':action');
//           e.reply("碎了一觉，跑出来了")
//           return true;
//         }
//       }
//     }
//     if(null != action.start_time){
//       let time = parseInt(now_time - action.start_time);
//       if("历练" == action.action){
//         let need_time = 360000;
//         let cishu = 1;
//         if(null != action.cishu){
//           cishu = action.cishu;
//           need_time = need_time * cishu;
//         }
//         if(need_time <= time){
//           await action_way_fun(e);
//           return true;
//         }
//       }
//       let days = parseInt(time / (1000 * 60 * 60 * 24));
//       let hours = parseInt((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
//       let minutes = parseInt((time % (1000 * 60 * 60)) / (1000 * 60));
//       e.reply(action.action + days + " 天 " + hours + " 小时 " + minutes + " 分钟 ");
//       return 0;
//     }
//   }
//   return true;
// }


export async function Write_shop(shop) {
  let dir = path.join(__PATH.shop, `shop.json`);
  let new_ARR = JSON.stringify(shop, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

export async function Read_shop() {
  let dir = path.join(`${__PATH.shop}/shop.json`);
  let shop = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  shop = JSON.parse(shop);
  return shop;
}
//判断是否还有物品
export async function existshop(didian) {
  let shop = await Read_shop();
  let i;
  let thing = [];
  for (i = 0; i < shop.length; i++) {
    if (shop[i].name == didian) {
      break;
    }
  }
  for (var j = 0; j < shop[i].one.length; j++) {
    if (shop[i].one[j].数量 > 0) {
      thing.push(shop[i].one[j]);
    }
  }
  if (thing.length > 0) {
    return thing;
  } else {
    return false;
  }
}
/**
 * 处理帝兵效果
 * @param {Object} attacker 攻击者对象
 * @param {Object} defender 防御者对象
 * @param {Array} msg 消息数组
 * @returns {boolean} 是否触发了帝兵效果
 */
export async function handleEmperorWeapon(attacker, defender, msg, emperorWeaponTriggered, preloadedEquipment = null) {
    if (emperorWeaponTriggered || !isNotNull(attacker.id)|| !isNotNull(defender.id)) return false;

    // 优先使用预加载的装备（减少 IO），否则 fallback 到 await
    const equipment = preloadedEquipment || await Read_equipment(attacker.id);
const DI_BING_RANKS = [
    "雏形", "通灵", "铭刻道与理", "斩道王兵", 
    "圣兵", "准帝兵", "极道帝兵", "仙器", 
    "仙王器", "准仙帝器", "仙帝器", "祭道器"
];
    if (!equipment.帝兵 || 
        equipment.帝兵.author_name !== attacker.id || 
        DI_BING_RANKS.indexOf(equipment.帝兵.品阶) < DI_BING_RANKS.indexOf("极道帝兵")) {
        return false;
    }
    
    // 帝兵属性加成（一次性，乘 1.5 不再叠加，避免每回合指数膨胀）
    const 攻击加成 = Math.trunc(0.5 * attacker.攻击);
    const 血量加成 = Math.trunc(0.5 * attacker.血量上限);
    const 防御加成 = Math.trunc(0.5 * attacker.防御);

    attacker.攻击 += 攻击加成;
    attacker.血量上限 += 血量加成;
    attacker.防御 += 防御加成;
    
    // 根据品阶生成不同的描述
    let 帝兵描述 = "";
    switch(equipment.帝兵.品阶) {
        case "极道帝兵": 帝兵描述 = "极道帝威席卷九天十地，大道符文烙印虚空！"; break;
        case "仙器": 帝兵描述 = "仙光璀璨，照耀万古，不朽仙气弥漫诸天！"; break;
        case "仙王器": 帝兵描述 = "仙王法则交织，时间长河为之倒流，万界臣服！"; break;
        case "仙帝器": 帝兵描述 = "帝威浩荡，镇压万古轮回，一念可开天辟地！"; break;
        default: 帝兵描述 = "帝兵复苏，威压震古烁今！";
    }
    
    // 辰东风格文案
    msg.push("轰隆！");
    msg.push(`${equipment.帝兵.name}突然复苏，${帝兵描述}`);
    msg.push(`帝兵通体绽放仙光，与${attacker.名号}共鸣！`);
    msg.push(`「我为天帝，当镇压世间一切敌！」${attacker.名号}长啸，声震寰宇！`);
    msg.push(`帝兵加持下，${attacker.名号}战力暴涨！`);
    msg.push(`攻击增加：${bigNumberTransform(攻击加成)}`);
    msg.push(`血量上限增加：${bigNumberTransform(血量加成)}`);
    msg.push(`防御增加：${bigNumberTransform(防御加成)}`);

    // 特殊效果 - 万物母气
    if (equipment.帝兵.主材料 === "万物母气") {
        msg.push(`玄黄垂落，母气流转，镇压诸天万道！`);
        msg.push(`${defender.名号}如陷泥沼，行动艰难！`);
        defender.dongjie = true;
    }
    
    // 特殊帝兵效果
    if (equipment.帝兵.name === "无始钟") {
        msg.push(`钟声悠悠，震动万古，时间长河为之倒流！`);
        msg.push(`${defender.名号}周身时光碎片飞舞，寿元被斩去千年！`);
        defender.当前血量 = Math.max(defender.当前血量 * 0.7, 0);
    } 
    else if (equipment.帝兵.name === "吞天魔罐") {
        msg.push(`魔罐吞天，万灵哀嚎，吞噬一切精气！`);
        const 吞噬伤害 = Math.trunc(defender.当前血量 * 0.2);
        defender.当前血量 -= 吞噬伤害;
        attacker.当前血量 += 吞噬伤害;
        msg.push(`${defender.名号}被吞噬${bigNumberTransform(吞噬伤害)}点生命，${attacker.名号}恢复等量生命！`);
    }
    
    // 帝兵品阶压制效果
    const defenderequipment = await Read_equipment(defender.id);
    if (defenderequipment?.帝兵) {
        const attackerRank = DI_BING_RANKS.indexOf(equipment.帝兵.品阶);
        const defenderRank = DI_BING_RANKS.indexOf(defenderequipment.帝兵.品阶);
        
        if (attackerRank >= defenderRank + 2) {
            const destroyChance = 0.3 + (attackerRank - defenderRank) * 0.1;
            
            if (Math.random() < destroyChance) {
                msg.push(`「${equipment.帝兵.name}」绽放无量帝威，煌煌神光撕裂永恒！`);
                msg.push(`「${defenderequipment.帝兵.name}」在对方帝兵的威压下寸寸崩裂！`);
                msg.push(`${defender.名号}的帝兵被彻底粉碎！`);
            }
        }
    }
    
    return true;
}
/**
 * 处理圆神效果
 * @param {Object} attacker 攻击者对象
 * @param {Object} defender 防御者对象
 * @param {Array} msg 消息数组
 * @param {string} context 上下文（"main"或"fenshen"）
 * @returns {boolean} 是否触发了圆神效果
 */
function handleCircularGod(attacker, defender, msg, context) {
    if (context === "fenshen" || attacker.灵根?.name !== "圆神" || Math.random() >= 0.2) {
        return false;
    }
    
    const isFirstCast = !attacker.圆环之理激活;
    const healMessages = [];
    
    // 光炮伤害
    const lightCannonDmg = Math.trunc(attacker.攻击 * 10);
    defender.当前血量 = Math.max(0, defender.当前血量 - lightCannonDmg);
    
    // 治疗效果
    if (attacker.当前血量 > 0) {
        const healAmount = Math.trunc(attacker.血量上限 * 0.3);
        attacker.当前血量 = Math.min(attacker.当前血量 + healAmount, attacker.血量上限);
        healMessages.push(`${attacker.名号}恢复${bigNumberTransform(healAmount)}生命`);
    }
    
    // 自身增益
    attacker.减伤比例 = 0.3;
    attacker.护盾值 = Math.trunc(attacker.当前血量 * 0.4);
    
    // 分身召唤
    if (!attacker.分身) attacker.分身 = [];
    if (attacker.分身.length < 2) {
        const newFenshen = {
            名号: `${attacker.名号}·圆环分身`,
            攻击: attacker.攻击,
            防御: attacker.防御,
            当前血量: attacker.当前血量,
            血量上限: attacker.血量上限,
            法球倍率: attacker.法球倍率,
            暴击率: attacker.暴击率,
            协同攻击: true,
            分身: true
        };
        attacker.分身.push(newFenshen);
    }
    
    // 构建消息
    const skillMessages = [
        `${attacker.名号}张开双臂，发间丝带绽放虹光！`,
        `「所有宇宙、过去未来的魔法少女们——」`,
        `「你们的悲伤，由我来承受！」`
    ];
    
    if (isFirstCast) {
        skillMessages.push(
            `因果律重构！粉红光翼贯穿多元宇宙！`,
            `圆环之理显现，改写宇宙基本法则！`,
            `「这就是我选择的命运！」`
        );
        attacker.圆环之理激活 = true;
    }
    
    skillMessages.push(
        `箭矢虹光洪流倾泻而出，`,
        `对${defender.名号}造成${bigNumberTransform(lightCannonDmg)}点法则伤害！`,
        ...healMessages,
        `${attacker.名号}获得「神性加护」：`,
        `- 伤害减免30%`,
        `- 获得${bigNumberTransform(attacker.护盾值)}点因果护盾`
    );
    
    if (attacker.分身.length > 0) {
        const fenshenCount = attacker.分身.length;
        skillMessages.push(
            `${fenshenCount}道虹光从圆环中分离，`,
            `化作${attacker.名号}的思念体！`,
            `「我们永远同在...」`
        );
    }
    
    msg.push(...skillMessages);
    return true;
}

// P3-2: 提取九秘触发逻辑为公共函数（1v1 和团战共用）
// 概率公式：base 1% + 已学九秘数 × 10%，最多 100%
function calcMijueTriggerProb(attacker) {
  const learnedMijue = attacker.学习的功法?.filter(gongfa =>
    ["临", "兵", "斗", "者", "皆", "数", "组", "前", "行"].some(mijue => gongfa.includes(mijue))
  ).length || 0;
  return Math.min(1.0, 0.01 + learnedMijue * 0.1);
}

// 皆字秘：十倍战力。返回 true 表示触发了
function tryJieziMijue(attacker, msgs) {
  if (!attacker.学习的功法?.includes("皆字秘") || attacker.皆字秘触发) return false;
  if (Math.random() >= calcMijueTriggerProb(attacker)) return false;

  const originalAttack = attacker.攻击;
  const originalDefense = attacker.防御;
  const originalHP = attacker.当前血量;

  attacker.攻击 = Math.trunc(attacker.攻击 * 10);
  attacker.防御 = Math.trunc(attacker.防御 * 10);
  attacker.当前血量 = Math.trunc(attacker.当前血量 * 10);
  attacker.皆字秘触发 = true;

  msgs.push(`「皆！」${attacker.名号}口吐真言，周身迸发开天辟地之光！`);
  msgs.push(`九秘之皆字秘显化，战力飙升十倍，打破天地桎梏！`);
  msgs.push(`【战力飙升】`);
  msgs.push(`攻击：${bigNumberTransform(originalAttack)} → ${bigNumberTransform(attacker.攻击)}`);
  msgs.push(`防御：${bigNumberTransform(originalDefense)} → ${bigNumberTransform(attacker.防御)}`);
  msgs.push(`生命：${bigNumberTransform(originalHP)} → ${bigNumberTransform(attacker.当前血量)}`);
  return true;
}

// 临字秘：禁忌领域。linziState 是按引用对象，isA 表示攻方是 A 队
function tryLinzMijue(attacker, defender, msgs, linziState, isA) {
  if (!attacker.学习的功法?.includes("临字秘")) return false;
  const 已触发 = isA ? linziState.A_触发 : linziState.B_触发;
  if (已触发) return false;
  if (Math.random() >= calcMijueTriggerProb(attacker)) return false;

  const realmLevel = Math.floor(Math.random() * 9) + 1;

  // 皆字秘压制非神禁领域
  if (attacker.皆字秘触发 && realmLevel !== 9) {
    msgs.push(`「临！」${attacker.名号}欲展开禁忌领域，然皆字秘十倍战力如星河决堤，禁忌领域演化被强行中断！`);
    return true;
  }

  // 神禁领域突破皆字秘抑制
  if (attacker.皆字秘触发 && realmLevel === 9) {
    msgs.push(`「轰——！」${attacker.名号}长啸震古烁今，十倍战力加持下强行踏足神禁！`);
    msgs.push(`双秘共鸣，身涌帝气，威压万古青天！`);
  }

  const realmNames = {
    1: "一禁领域", 2: "二禁领域", 3: "三禁领域", 4: "四禁领域",
    5: "五禁领域", 6: "六禁领域", 7: "七禁领域", 8: "八禁领域", 9: "神禁领域"
  };

  const selfMultiplier = realmLevel;
  const enemyMultiplier = realmLevel / 10;

  attacker.攻击 = Math.trunc(attacker.攻击 * selfMultiplier + defender.攻击 * enemyMultiplier);
  attacker.防御 = Math.trunc(attacker.防御 * selfMultiplier + defender.防御 * enemyMultiplier);
  attacker.当前血量 = Math.trunc(attacker.当前血量 * selfMultiplier + defender.当前血量 * enemyMultiplier);

  const suppressionRate = realmLevel * 0.05;
  defender.攻击 = Math.trunc(defender.攻击 * (1 - suppressionRate));
  defender.防御 = Math.trunc(defender.防御 * (1 - suppressionRate));

  if (isA) {
    linziState.A_加成 = realmLevel * 0.04;
    linziState.A_触发 = true;
  } else {
    linziState.B_加成 = realmLevel * 0.04;
    linziState.B_触发 = true;
  }

  msgs.push(`「临！」${attacker.名号}口吐真言，${realmNames[realmLevel]}轰然展开！`);
  msgs.push(`战力指数级暴涨，位阶突破${realmLevel}重天关！`);

  if (realmLevel === 9) {
    msgs.push(`「神禁领域，唯我独尊！」${attacker.名号}身与道合，超脱在上！`);
  }

  // 九秘齐鸣文案
  const learnedMijue = attacker.学习的功法?.filter(gongfa =>
    ["临", "兵", "斗", "者", "皆", "数", "组", "前", "行"].some(mijue => gongfa.includes(mijue))
  ).length || 0;
  if (learnedMijue >= 9) {
    msgs.push(`九秘齐鸣，万道合一！${attacker.名号}身后浮现九大天尊虚影！`);
  } else if (learnedMijue >= 4) {
    msgs.push(`${learnedMijue}秘交织，异象纷呈！`);
  }

  return true;
}

/**
 * 处理控制效果（冻结、禁锢等）
 * @param {Object} attacker 攻击者对象
 * @param {Object} defender 防御者对象
 * @param {Array} msg 消息数组
 */
// P3-1: 收敛参数 - 删除未使用的 cnt/cnt2/A_临字秘触发/B_临字秘触发/A_临字秘加成/B_临字秘加成（6 个）
// 临字秘状态通过 linziState 对象按引用传递
function handleControlEffects(A_immune_control, B_immune_control, A_player, B_player, attacker, defender, msg, emperorFieldTriggered, context, linziState) {
    if (emperorFieldTriggered.value === false && attacker.mijinglevel_id > 19 && defender.mijinglevel_id < 20) {
      if (attacker.mijinglevel_id - defender.mijinglevel_id >= 2) {
            // 计算夺取数值
            let 夺取攻击 = Math.floor(defender.攻击 * 0.5);
            let 夺取防御 = Math.floor(defender.防御 * 0.5);
            let 夺取血量 = Math.floor(defender.当前血量 * 0.5);

            // 执行夺取
            defender.攻击 = Math.max(defender.攻击 - 夺取攻击, 0);
            defender.防御 = Math.max(defender.防御 - 夺取防御, 0);
            defender.当前血量 = Math.max(defender.当前血量 - 夺取血量, 0);
      msg.push(`${defender.名号}受到帝之场域压制，一身战力被削去十之五六!`);
       emperorFieldTriggered.value = true;
    }
}
if (attacker.mijinglevel_id > 19 && defender.mijinglevel_id < 20 && Math.random() < 0.99) {
  // 检查防御方是否有免疫控制效果
  const isImmune = (defender === A_player && A_immune_control > 0) || 
                   (defender === B_player && B_immune_control > 0);
  
  if (isImmune) {
    // 秘境等级差距过大时，免疫失效
    if (attacker.mijinglevel_id - defender.mijinglevel_id >= 2) {
      defender.dongjie = true;
      msg.push(`${attacker.名号}周身仙光亿万缕，大道符文压盖诸天，一缕气息崩断万古时空！`);
      msg.push(`然而${defender.名号}的涅槃真火在绝对实力差距下黯然熄灭，如同萤火之于皓月！`);
      msg.push(`${defender.名号}，在吾面前，纵有涅槃之力亦难逃镇压！`);
      msg.push(`${attacker.名号}声震寰宇，言出法随！`);
      msg.push(`${defender.名号}的身躯与神魂被永恒禁锢，万道哀鸣，诸天颤栗！`);
    } else {
      // 秘境等级差距不大时，免疫生效
      msg.push(`${attacker.名号}眸中射出两道仙芒，撕裂虚空，欲定住${defender.名号}的万古道果！`);
      msg.push(`${defender.名号}周身涅槃真火熊熊燃烧，焚尽万法，破灭一切禁锢！`);
      msg.push(`区区小道，也敢在涅槃真火前逞威？`);
      msg.push(`${defender.名号}冷笑，真火化作仙凰展翅，击穿永恒！`);
    }
  } else {
    // 无免疫效果时正常触发
    defender.dongjie = true; 
    msg.push(`${attacker.名号}身上散发出超越诸天极限的气息，一缕眸光压塌万古！`);
    msg.push(`${defender.名号}的身躯与神魂被永恒禁锢，时间长河在此断流！`);
    msg.push(`${defender.名号}，在吾面前，你连蝼蚁都不如！`);
    msg.push(`${attacker.名号}的声音冰冷彻骨，震动诸天万界！`);
  }
}


if ( defender.灵根&&defender.灵根.name === "命运神道体") {
      if (Math.random() > 0.7) {
        msg.push(`${defender.名号}推开了命运生死轮盘，改写了真实，局势发生了微妙的变化，${attacker.名号}被命运之力禁锢了！`);
         attacker.dongjie = true; 
        if (Math.random() > 0.01) {
          let 回复血量 = defender.当前血量 * 0.5;
          defender.当前血量 = Math.max(defender.当前血量 + 回复血量, 0);
          msg.push(`${defender.名号}念诵如梦真名，身魂受到庇护，永不坠劫，生命回复${回复血量}点,${defender.名号}当前血量${defender.当前血量}`);
        }
      }
    } 
// 九秘触发主逻辑
if (context !== "fenshen") {
    // P3-2: 皆字秘 用共享函数（行为完全一致）
    tryJieziMijue(attacker, msg);

    // P3-2: 临字秘 保留 1v1 专有的辰东风格丰富文案（与团战简单版不同，不共享）
    if (attacker.学习的功法?.includes("临字秘") && !(attacker === A_player ? linziState.A_触发 : linziState.B_触发)) {
        const prob = calcMijueTriggerProb(attacker);
        if (Math.random() < prob) {
            const realmLevel = Math.floor(Math.random() * 9) + 1;
            // 本地声明，供 1v1 辰东风格文案使用
            const learnedMijue = attacker.学习的功法?.filter(gongfa =>
                ["临", "兵", "斗", "者", "皆", "数", "组", "前", "行"].some(mijue => gongfa.includes(mijue))
            ).length || 0;

            // 禁忌领域抑制判断：皆字秘触发时，非神禁领域不得触发
            if (attacker.皆字秘触发 && realmLevel !== 9) {
                // 皆字秘压制非神禁领域，输出描述
                const suppressMsg = [
                    ``,
                    `「临！」${attacker.名号}欲展开禁忌领域，然周身皆字秘的十倍战力如星河决堤，煌煌神威不可犯！`,
                    `皆字秘乃无上增幅，未入神禁，无法相互叠加，禁忌领域演化被强行中断未能成形！`
                ];
                msg.push(suppressMsg.join('\n'));
            } else {
                // 可正常触发禁忌领域（包括神禁突破抑制）
                
                // 禁数领域描述
                const realmNames = {
                    1: "一禁领域",
                    2: "二禁领域", 
                    3: "三禁领域",
                    4: "四禁领域",
                    5: "五禁领域",
                    6: "六禁领域",
                    7: "七禁领域",
                    8: "八禁领域",
                    9: "神禁领域"
                };
                
                // 领域描述文案（辰东风格）
                const realmDescriptions = {
                    1: "周身混沌气弥漫，淡淡神辉浮现，大道初鸣",
                    2: "气血如龙，贯穿霄汉，战力翻涌如潮",
                    3: "道则环绕，符文漫天，战力飙升破苍穹",
                    4: "神光冲霄，撕裂永恒，战力惊动万古",
                    5: "大道共鸣，天地颤栗，战力破开九重天",
                    6: "异象纷呈，仙王临九天，盖压当世无敌手",
                    7: "神魔虚影显化，时间长河浮现，震古烁今",
                    8: "轮回往生，阴阳逆转，横推当世一切敌",
                    9: "踏入神禁领域，超脱在上，举世无敌！"
                };
                
                // 神禁领域突破皆字秘抑制的特殊描述
                if (attacker.皆字秘触发 && realmLevel === 9) {
                    const breakthroughMsg = [
                        ``,
                        `「轰——！」`,
                        `万丈雷海凭空起，${attacker.名号}长啸震古烁今，竟在十倍战力加持下强行踏足神禁！`,
                        `这是唯有古之大帝才能常驻的无上领域，此刻双秘共鸣，${attacker.名号}身涌帝气，威压万古青天！`,
                        `周边星域在这股气势下寸寸崩裂，无尽星域化为齑粉，岁月长河都为之倒流显化！`,
                        `「神禁领域，唯我独尊！」`
                    ];
                    msg.push(breakthroughMsg.join('\n'));
                }
                
                // 计算属性提升
                const selfMultiplier = realmLevel;
                const enemyMultiplier = realmLevel / 10;
                const gongfa = realmLevel * 4;
                
                // 保存原始属性
                const originalAttack = attacker.攻击;
                const originalDefense = attacker.防御;
                const originalHP = attacker.当前血量;
                
                // 计算新属性
                attacker.攻击 = Math.trunc(
                    attacker.攻击 * selfMultiplier + 
                    defender.攻击 * enemyMultiplier
                );
                attacker.防御 = Math.trunc(
                    attacker.防御 * selfMultiplier + 
                    defender.防御 * enemyMultiplier
                );
                attacker.当前血量 = Math.trunc(
                    attacker.当前血量 * selfMultiplier + 
                    defender.当前血量 * enemyMultiplier
                );
                
                // 属性压制效果
                const suppressionRate = realmLevel * 0.05;
                defender.攻击 = Math.trunc(defender.攻击 * (1 - suppressionRate));
                defender.防御 = Math.trunc(defender.防御 * (1 - suppressionRate));
                
                // 设置技能触发概率加成（通过 linziState 按引用传回主循环）
                if (attacker === A_player) {
                    linziState.A_加成 = realmLevel * 0.04;
                    linziState.A_触发 = true;
                } else {
                    linziState.B_加成 = realmLevel * 0.04;
                    linziState.B_触发 = true;
                }
                
                // 构建临字秘文案
                const realmMsg = [
                    `「临！」`,
                    `${attacker.名号}口吐真言，${realmNames[realmLevel]}轰然展开！`,
                    realmDescriptions[realmLevel],
                    ``,
                    `【战力飙升】`,
                    `战力指数级暴涨，位阶突破${realmLevel}重天关！`,
                    `攻击：${bigNumberTransform(originalAttack)} → ${bigNumberTransform(attacker.攻击)}`,
                    `防御：${bigNumberTransform(originalDefense)} → ${bigNumberTransform(attacker.防御)}`,
                    `生命：${bigNumberTransform(originalHP)} → ${bigNumberTransform(attacker.当前血量)}`,
                    ``,
                    `【道则压制】`,
                    `禁忌领域展开，${defender.名号}如陷泥沼！`,
                    `攻击压制：${(suppressionRate * 100).toFixed(0)}%`,
                    `防御压制：${(suppressionRate * 100).toFixed(0)}%`,
                    `功法触发概率提升：${gongfa}%`
                ];
                
                // 神禁领域特殊描述
                if (realmLevel === 9) {
                    realmMsg.push(
                        ``,
                        `「神禁领域，唯我独尊！」`,
                        `九重天关尽破，${attacker.名号}身与道合，超脱在上！`,
                        `举手投足间，万道哀鸣，诸天星辰为之黯淡！`
                    );
                }
                
                // 九秘共鸣效果
                if (learnedMijue > 0) {
                    realmMsg.push(``);
                    realmMsg.push(`【九秘共鸣】`);
                    
                    if (learnedMijue >= 9) {
                        realmMsg.push(
                            `九秘齐鸣，万道合一！`,
                            `${attacker.名号}身后浮现九大天尊虚影，`,
                            `临、兵、斗、者、皆、数、组、前、行九字真言照亮永恒！`,
                        );
                    } else if (learnedMijue >= 7) {
                        realmMsg.push(
                            `七秘共振，映照诸天！`,
                            `${attacker.名号}周身${learnedMijue}道天尊符文闪耀，`,
                            `大道锁链崩断之声震彻万古星空！`
                        );
                    } else if (learnedMijue >= 4) {
                        realmMsg.push(
                            `四秘交织，异象纷呈！`,
                            `${attacker.名号}体内${learnedMijue}种秘术本源共鸣，`,
                            `演化九十九重天，无量仙阙等无上异象！`
                        );
                    } else {
                        realmMsg.push(
                            `秘术初鸣，大道涟漪！`,
                            `${attacker.名号}体内${learnedMijue}种秘术本源轻轻颤动，`,
                            `初窥九秘合一的无上大道！`
                        );
                    }
                }
                
                msg.push(realmMsg.join('\n'));
            }
        }
    }
}
}
// 统一的技能效果处理对象
const 技能效果处理 = {
  // 时牌定身 - 木之本樱
  "时牌定身": function(attacker, defender, msg, skill) {
    defender.dongjie = true; 
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(attacker.名号 + processedMsg1 + defender.名号 + processedMsg2);
  },
  
  // 神魔夺取 - 终焉神魔体
  "神魔夺取": function(attacker, defender, msg, skill) {
    let godDemonMsg = [];
    
    // 禁锢效果
    defender.dongjie = true;
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    godDemonMsg.push(processedMsg1);
    godDemonMsg.push(processedMsg2);
    
    // 三维夺取效果
    if (Math.random() > 0.1) {
      // 计算夺取比例
      let 夺取比例 = skill.全属性夺取 || 0.25;
      
      // 计算夺取数值
      let 夺取攻击 = Math.floor(defender.攻击 * 夺取比例);
      let 夺取防御 = Math.floor(defender.防御 * 夺取比例);
      let 夺取血量 = Math.floor(defender.当前血量 * 夺取比例);
      
      // 执行夺取
      defender.攻击 = Math.max(defender.攻击 - 夺取攻击, 0);
      defender.防御 = Math.max(defender.防御 - 夺取防御, 0);
      defender.当前血量 = Math.max(defender.当前血量 - 夺取血量, 0);
      
      attacker.攻击 += 夺取攻击;
      attacker.防御 += 夺取防御;
      attacker.当前血量 += 夺取血量;
      
      godDemonMsg.push(`${attacker.名号}发动「神魔终焉劫」，掌心浮现神魔轮盘`);
      godDemonMsg.push(`诸天法则被改写，${defender.名号}的三维属性被强行剥夺`);
      godDemonMsg.push(`攻击：${defender.名号}-${bigNumberTransform(夺取攻击)} → ${attacker.名号}+${bigNumberTransform(夺取攻击)}`);
      godDemonMsg.push(`防御：${defender.名号}-${bigNumberTransform(夺取防御)} → ${attacker.名号}+${bigNumberTransform(夺取防御)}`);
      godDemonMsg.push(`生命：${defender.名号}-${bigNumberTransform(夺取血量)} → ${attacker.名号}+${bigNumberTransform(夺取血量)}`);
      
      // 终焉之力效果
      if (Math.random() > 0.1) {
        let 终焉伤害 = Math.floor(夺取攻击 + 夺取防御 + 夺取血量);
        defender.当前血量 = Math.max(defender.当前血量 - 终焉伤害, 0);
        godDemonMsg.push(`${attacker.名号}将夺取的三维属性转化为终焉之力，对${defender.名号}造成额外${bigNumberTransform(终焉伤害)}点伤害`);
      }
    }
    
    // 将消息加入msg数组
    msg.push(...godDemonMsg);
  },
  
  // 锦绣山河 - 大成·荒古圣体
  "锦绣山河": function(attacker, defender, msg, skill) {
    let godDemonMsg = [];
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    godDemonMsg.push(processedMsg1);
    godDemonMsg.push(processedMsg2);
    
    // 应用属性削减
    const debuff = 0.8;
    defender.攻击 = Math.round(defender.攻击 * debuff);
    defender.防御 = Math.round(defender.防御 * debuff);
    defender.当前血量 = Math.round(defender.当前血量 * debuff);
    
    msg.push(...godDemonMsg);
    msg.push(`${defender.名号}全属性下降20%！`);
  },
  
  // 圣体异象 - 大成·荒古圣体
  "圣体异象": function(attacker, defender, msg, skill) {
    let godDemonMsg = [];
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    godDemonMsg.push(processedMsg1);
    godDemonMsg.push(processedMsg2);
    
    // 应用属性提升
    attacker.攻击 *= 3;
    attacker.防御 *= 3;
    attacker.当前血量 *= 3;
    
    msg.push(...godDemonMsg);
    msg.push(`${attacker.名号}全属性提升三倍！`);
  },
  
  // 三灾六劫天人五衰 - 极道天魔
  "三灾六劫天人五衰": function(attacker, defender, msg, skill) {
    // 创建技能消息数组
    const godDemonMsg = [];
    
    // 禁锢效果
    defender.dongjie = true;
    
    // 处理消息文本
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    const processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    godDemonMsg.push(processedMsg1);
    godDemonMsg.push(processedMsg2);
    
    // 99%概率触发效果
    if (Math.random() > 0.01) {
        // 计算效果数值
        const 伤害 = Math.floor(defender.当前血量 * 0.2);
        const 减少防御 = Math.floor(defender.防御 * 0.2);
        const 减少攻击 = Math.floor(defender.攻击 * 0.2);
        
        // 应用效果（确保不低于0）
        defender.当前血量 = Math.max(defender.当前血量 - 伤害, 0);
        defender.防御 = Math.max(defender.防御 - 减少防御, 0);
        defender.攻击 = Math.max(defender.攻击 - 减少攻击, 0);
        
        // 构建详细战斗消息
        const battleMsg = `${attacker.名号}发动「三灾六劫天人五衰」，${defender.名号}的顶上三花胸中五气都被削掉！` +
            `${defender.名号}损失了${bigNumberTransform(伤害)}点生命，攻击降低了${bigNumberTransform(减少攻击)}点，防御降低了${bigNumberTransform(减少防御)}点` +
            `${defender.名号}当前状态：` +
            ` 生命：${bigNumberTransform(defender.当前血量)}` +
            ` 攻击：${bigNumberTransform(defender.攻击)}` +
            ` 防御：${bigNumberTransform(defender.防御)}`;
        
        msg.push(battleMsg);
    }
    
    // 将技能消息加入主消息数组
    msg.push(...godDemonMsg);
  },
  
  // 混沌开天 - 混沌体
  "混沌开天": function(attacker, defender, msg, skill) {
    // 禁锢效果
    defender.dongjie = true;
    
    // 处理消息文本
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    const processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);
    
    // 混沌侵蚀效果
    const 侵蚀比例 = skill.混沌侵蚀 || 0.3;
    const 减少攻击 = Math.floor(defender.攻击 * 侵蚀比例);
    const 减少防御 = Math.floor(defender.防御 * 侵蚀比例);
    const 减少血量 = Math.floor(defender.当前血量 * 侵蚀比例);
    
    defender.攻击 = Math.max(defender.攻击 - 减少攻击, 0);
    defender.防御 = Math.max(defender.防御 - 减少防御, 0);
    defender.当前血量 = Math.max(defender.当前血量 - 减少血量, 0);
    
    msg.push(`${defender.名号}道基受损，全属性下降${侵蚀比例 * 100}%！`);
    msg.push(`攻击：-${bigNumberTransform(减少攻击)}`);
    msg.push(`防御：-${bigNumberTransform(减少防御)}`);
    msg.push(`生命：-${bigNumberTransform(减少血量)}`);
  },
  
  // 圣胎共鸣 - 先天圣体道胎
  "圣胎共鸣": function(attacker, defender, msg, skill) {
    // 处理消息文本
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    const processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);
    
    // 属性提升效果
    const 提升比例 = skill.属性提升 || 5;
    const 原始攻击 = attacker.攻击;
    const 原始防御 = attacker.防御;
    const 原始血量 = attacker.当前血量;
    
    attacker.攻击 = Math.floor(attacker.攻击 * 提升比例);
    attacker.防御 = Math.floor(attacker.防御 * 提升比例);
    attacker.当前血量 = Math.floor(attacker.当前血量 * 提升比例);
    
    msg.push(`${attacker.名号}战力暴涨${(提升比例 - 1) * 100}%！`);
    msg.push(`攻击：${bigNumberTransform(原始攻击)} → ${bigNumberTransform(attacker.攻击)}`);
    msg.push(`防御：${bigNumberTransform(原始防御)} → ${bigNumberTransform(attacker.防御)}`);
    msg.push(`生命：${bigNumberTransform(原始血量)} → ${bigNumberTransform(attacker.当前血量)}`);
  },
  
  // 三元归一 - 先天混沌圣体道胎
  "三元归一": function(attacker, defender, msg, skill) {
    // 处理消息文本
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    const processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);
    
    // 属性提升效果
    const 提升比例 = skill.属性提升 || 3;
    const 原始攻击 = attacker.攻击;
    const 原始防御 = attacker.防御;
    const 原始血量 = attacker.当前血量;
    
    attacker.攻击 = Math.floor(attacker.攻击 * 提升比例);
    attacker.防御 = Math.floor(attacker.防御 * 提升比例);
    attacker.当前血量 = Math.floor(attacker.当前血量 * 提升比例);
    
    msg.push(`攻击：${bigNumberTransform(原始攻击)} → ${bigNumberTransform(attacker.攻击)}`);
    msg.push(`防御：${bigNumberTransform(原始防御)} → ${bigNumberTransform(attacker.防御)}`);
    msg.push(`生命：${bigNumberTransform(原始血量)} → ${bigNumberTransform(attacker.当前血量)}`);
  },

  // 神王初现 - 神王体
  "神王初现": function(attacker, defender, msg, skill) {
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);

    if (skill.神王威压) {
      // 攻方 +15% 全属性
      const 加成 = 0.15;
      attacker.攻击 = Math.floor(attacker.攻击 * (1 + 加成));
      attacker.防御 = Math.floor(attacker.防御 * (1 + 加成));
      attacker.当前血量 = Math.floor(attacker.当前血量 * (1 + 加成));
    }
    if (skill.属性压制) {
      // 压制对方 15% 三维
      const 比例 = skill.属性压制;
      defender.攻击 = Math.max(Math.floor(defender.攻击 * (1 - 比例)), 0);
      defender.防御 = Math.max(Math.floor(defender.防御 * (1 - 比例)), 0);
      defender.当前血量 = Math.max(Math.floor(defender.当前血量 * (1 - 比例)), 0);
      msg.push(`${defender.名号}道心被神王威压震慑，全属性下降${Math.round(比例 * 100)}%！`);
    }
  },

  // 神王领域 - 小成神王体
  "神王领域": function(attacker, defender, msg, skill) {
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);

    if (skill.神王领域) {
      // 攻方 +20% 战力
      attacker.攻击 = Math.floor(attacker.攻击 * 1.2);
      attacker.防御 = Math.floor(attacker.防御 * 1.2);
      attacker.当前血量 = Math.floor(attacker.当前血量 * 1.2);
      msg.push(`神王领域内，${attacker.名号}战力暴涨20%！`);
    }
    if (skill.属性压制) {
      const 比例 = skill.属性压制;
      defender.攻击 = Math.max(Math.floor(defender.攻击 * (1 - 比例)), 0);
      defender.防御 = Math.max(Math.floor(defender.防御 * (1 - 比例)), 0);
      defender.当前血量 = Math.max(Math.floor(defender.当前血量 * (1 - 比例)), 0);
      msg.push(`${defender.名号}被神王领域法则压制，全属性下降${Math.round(比例 * 100)}%！`);
    }
  },

  // 神王临世 - 大成神王体（cnt:1）
  "神王临世": function(attacker, defender, msg, skill) {
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);

    if (skill.神王临世) {
      // 攻方 +100% 战力
      attacker.攻击 = Math.floor(attacker.攻击 * 2);
      attacker.防御 = Math.floor(attacker.防御 * 2);
      attacker.当前血量 = Math.floor(attacker.当前血量 * 2);
    }
    if (skill.属性提升) {
      // 在属性提升基础上再叠加（如 JSON 配 2.0 = +200%）
      const 提升 = skill.属性提升;
      attacker.攻击 = Math.floor(attacker.攻击 * 提升);
      attacker.防御 = Math.floor(attacker.防御 * 提升);
      attacker.当前血量 = Math.floor(attacker.当前血量 * 提升);
    }
    if (skill.万法臣服) {
      // 削对方 40% 三维 + 禁锢 1 回合
      const 比例 = 0.4;
      defender.攻击 = Math.max(Math.floor(defender.攻击 * (1 - 比例)), 0);
      defender.防御 = Math.max(Math.floor(defender.防御 * (1 - 比例)), 0);
      defender.当前血量 = Math.max(Math.floor(defender.当前血量 * (1 - 比例)), 0);
      defender.dongjie = true;
      msg.push(`万法臣服！${defender.名号}全属性下降40%且被禁锢1回合！`);
    }
  },

  // 神王异象 - 大成神王体（cnt:-1）
  "神王异象": function(attacker, defender, msg, skill) {
    let processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    let processedMsg2 = skill.msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    msg.push(processedMsg2);

    if (skill.神王异象) {
      // 攻方 +30% 战力
      attacker.攻击 = Math.floor(attacker.攻击 * 1.3);
      attacker.防御 = Math.floor(attacker.防御 * 1.3);
      attacker.当前血量 = Math.floor(attacker.当前血量 * 1.3);
    }
    if (skill.属性压制) {
      const 比例 = skill.属性压制;
      defender.攻击 = Math.max(Math.floor(defender.攻击 * (1 - 比例)), 0);
      defender.防御 = Math.max(Math.floor(defender.防御 * (1 - 比例)), 0);
      defender.当前血量 = Math.max(Math.floor(defender.当前血量 * (1 - 比例)), 0);
      msg.push(`神王异象镇压！${defender.名号}道基震荡，全属性下降${Math.round(比例 * 100)}%！`);
    }
  },

  // 往世星海 - 人之律者·爱莉希雅
  "往世星海": function(attacker, defender, msg, skill) {
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    const 提升 = skill.属性提升 || 2.0;
    attacker.攻击 = Math.floor(attacker.攻击 * 提升);
    attacker.防御 = Math.floor(attacker.防御 * 提升);
    attacker.当前血量 = Math.floor(attacker.当前血量 * 提升);
    msg.push(`${attacker.名号}在「往世星海」领域加持下，全属性暴涨${Math.round((提升 - 1) * 100)}%！`);
  },

  // 始源终焉 - 始源之律者·爱莉希雅
  "始源终焉": function(attacker, defender, msg, skill) {
    const processedMsg1 = skill.msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
    msg.push(processedMsg1);
    const 提升 = skill.属性提升 || 5.0;
    attacker.攻击 = Math.floor(attacker.攻击 * 提升);
    attacker.防御 = Math.floor(attacker.防御 * 提升);
    attacker.当前血量 = Math.floor(attacker.当前血量 * 提升);
    msg.push(`${attacker.名号}在「始源终焉」领域加持下，全属性暴涨${Math.round((提升 - 1) * 100)}%！`);
  }
};

// 特殊技能处理函数
function handleSpecialSkills(attacker, defender, msg, teshujineng) {
  for (var i = 0; i < teshujineng.length; i++) {
    if (teshujineng[i].cnt === 0) continue;
    
    if (hasSupremeInnate(attacker, teshujineng[i].name)) {
      let Random = Math.random();
      
      if (Random < teshujineng[i].pr) {
        // 调用对应的效果处理函数
        const effectHandler = 技能效果处理[teshujineng[i].效果类型];
        if (effectHandler) {
          effectHandler(attacker, defender, msg, teshujineng[i]);
        } else {
          // 默认处理
          let processedMsg1 = teshujineng[i].msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
          let processedMsg2 = teshujineng[i].msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
          msg.push(processedMsg1);
          msg.push(processedMsg2);
        }
        
        if (teshujineng[i].cnt > 0) {
          teshujineng[i].cnt--;
        }
        
        break;
      }
    }
  }
}

/**
 * 战斗分发函数
 * 支持模式：
 *   1v1: zd_battle(A, B)
 *   群殴(Nv1): zd_battle([A,B], C)
 *   被群殴(1vN): zd_battle(A, [B,C])
 *   团战(NvM): zd_battle([A,B], [C,D])
 * 返回约定：A_hp/B_hp 为对应一方的最终剩余总血量；
 * A_xue/B_xue 仅作为旧调用方的兼容别名。
 */
export async function zd_battle(A_input, B_input, options = {}) {
  const A_isArray = Array.isArray(A_input);
  const B_isArray = Array.isArray(B_input);

  // 兼容旧版 1v1
  if (!A_isArray && !B_isArray) {
    return await zd_battle_1v1(A_input, B_input, options);
  }

  // 团战模式
  const A_team = A_isArray ? A_input : [A_input];
  const B_team = B_isArray ? B_input : [B_input];

  // 深拷贝
  const A_copy = A_team.map(p => JSON.parse(JSON.stringify(p)));
  const B_copy = B_team.map(p => JSON.parse(JSON.stringify(p)));

  return await zd_battle_team(A_copy, B_copy, {
    ...options,
    _sourceATeam: A_team,
    _sourceBTeam: B_team,
  });
}

async function zd_battle_1v1(AA_player, BB_player, options = {}) {
  // 保持输入、战斗状态与返回字段的 A/B 归属一致。
  let A_player = JSON.parse(JSON.stringify(AA_player));
  let B_player = JSON.parse(JSON.stringify(BB_player));

  // 初始化负面效果
  A_player.fumianhuihe = 0;
  A_player.fumian_damage = 0;
  A_player.fumian_type = null;
  B_player.fumianhuihe = 0;
  B_player.fumian_damage = 0;
  B_player.fumian_type = null;

  // ==================== 行动拉条系统 ====================
  let A_actionBar = 0;
  let B_actionBar = 0;
  const ACTION_BAR_MAX = 3000;
  
let A_speed = (A_player.速度 ?? 100)
  + (A_player.mijinglevel_id ?? 0) * 50
  + (A_player.xiangulevel_id ?? 0) * 50;

let B_speed = (B_player.速度 ?? 100)
  + (B_player.mijinglevel_id ?? 0) * 50
  + (B_player.xiangulevel_id ?? 0) * 50;
  
  let A_speedBoost = 1.0;
  let B_speedBoost = 1.0;
  
  let actionOrder = [];

  let cnt = 0;
  let cnt2;
  let t;
  let msg = [];
  let jineng1 = data.jineng1;
  let jineng2 = data.jineng2;
  let jineng3 = data.jineng3;
  // teshujineng 单独深拷贝，避免 handleSpecialSkills 中 cnt-- 污染全局 data
  let teshujineng = JSON.parse(JSON.stringify(data.teshujineng || []));
  let A_immune_control = 0;
  let B_immune_control = 0;
  let A_immune_type = null;
  let B_immune_type = null;
  // P3-1: 临字秘状态打包为对象（按引用传，避免 handleControlEffects 内部修改不传回主循环）
  const linziState = { A_触发: false, B_触发: false, A_加成: 0, B_加成: 0 };
  let A_revived = false;
  let B_revived = false;
  let fenshen = ["【仙帝】他化自在法", "一气化三清"];
  let huifu = ["者字秘"];
  let healMessages = [];
  let A_tahua_entities = [];
  let B_tahua_entities = [];
  let A_tahua_triggered = false;
  let B_tahua_triggered = false;
  let emperorFieldTriggered = { value: false };
  let emperorWeaponTriggered = false;
  let 轮回诸天拳触发 = false;

  // ==================== 装备缓存（避免每次攻击都 await Read_equipment） ====================
  // P0-6: try/catch 兜底，IO 失败返回 null 不抛错（防止 Promise rejection 中断战斗）
  const _equipmentCache = new Map();
  async function getEquipment(player) {
    if (!isNotNull(player?.id)) return null;
    if (_equipmentCache.has(player.id)) return _equipmentCache.get(player.id);
    try {
      const eq = await Read_equipment(player.id);
      _equipmentCache.set(player.id, eq);
      return eq;
    } catch (e) {
      console.error(`[战斗] 读取装备失败 player=${player.id}`, e?.message);
      return null;
    }
  }

  async function consumeAuthorityFlag(player, flag) {
    if (!player?.先天权柄?.[flag]) return false;
    delete player.先天权柄[flag];
    const source = player === A_player ? AA_player : player === B_player ? BB_player : null;
    if (source?.先天权柄) delete source.先天权柄[flag];
    if (!player.id) return true;
    try {
      const stored = await Read_player(player.id);
      if (stored?.先天权柄) delete stored.先天权柄[flag];
      await Write_player(player.id, stored);
    } catch (error) {
      console.error(`[先天至宝] 消耗战斗权柄失败 player=${player.id}`, error?.message);
    }
    return true;
  }

  function build1v1BattleResult(extra = {}) {
    return create1v1BattleResult({
      msg,
      A_player,
      B_player,
      actionOrder,
      A_speed,
      B_speed,
      extra
    });
  }

  // ==================== 他化自在法·行者化身库 ====================
  const TAHUA_AVATARS = [
    {
      id: "huangtiandi",
      name: "荒天帝",
      skill: "他化自在大法·起源一击",
      desc: "一念化万古，一力破苍穹",
      beilv: 15,
      special: "不可防御",
      msg1: "荒天帝眸光如炬，时间长河为之逆流！他抬手间，万古诸天之力汇聚成一道不朽仙光，轰然劈落——",
      msg2: "被荒天帝的盖世一击正面轰中，肉身元神剧烈震荡，仿佛被从时间长河中抹去！"
    },
    {
      id: "yetian",
      name: "叶天帝",
      skill: "天帝拳·镇压九天",
      desc: "拳震万古，压塌诸天",
      beilv: 12,
      special: "不可防御",
      msg1: "叶天帝眸绽金光，身后浮现六道轮回虚影！拳出如龙，裹挟混沌法则，天帝拳意撕裂虚空，镇压九天十地——",
      msg2: "被天帝拳的无上拳意击中，防御尽碎，道基震颤！"
    },
    {
      id: "henren",
      name: "狠人大帝",
      skill: "一念花开·君临天下",
      desc: "一念花开，万道哀鸣",
      beilv: 13,
      special: "不可复活",
      msg1: "狠人大帝素手轻扬，无数仙葩绽放虚空！每一朵花中都走出一道惊世真身，万千身影如潮水般涌来，君临天下——",
      msg2: "被狠人大帝的万千真身同时击中，无处可遁，真灵被斩断复活之机！"
    },
    {
      id: "wushi",
      name: "无始大帝",
      skill: "无始无终·镇压永恒",
      desc: "仙路尽头谁为峰，一见无始道成空",
      beilv: 14,
      special: "不可防御+禁锢",
      msg1: "无始大帝背对众生，一道朦胧伟岸的身影镇压万古！无始钟声响起，时间长河为之凝固，蕴含无始无终之意的神光自虚空尽头而至——",
      msg2: "被无始无终之力贯穿，万般道法、一切神通皆化为虚无，身躯被永恒禁锢！"
    },
    {
      id: "leidi",
      name: "雷帝",
      skill: "雷帝宝术·九天雷罚",
      desc: "执掌天罚，代天行刑",
      beilv: 10,
      special: "麻痹禁锢",
      msg1: "雷帝执掌天罚，代天行刑！九天雷池倾泻而下，亿万雷蛇狂舞化作灭世雷矛，贯穿时空而至——",
      msg2: "被天罚之雷击中，全身焦黑麻痹，元神僵滞，行动受阻！"
    },
    {
      id: "kunpeng",
      name: "鲲鹏王",
      skill: "鲲鹏宝术·阴阳逆转",
      desc: "鲲化鹏击九天，阴阳逆转虚空",
      beilv: 11,
      special: "极速先手",
      msg1: "鲲鹏王一念间化鲲为鹏！太阴太阳二气流转演化混沌，双翼遮天蔽日，一振扶摇直上九万里，挟万钧之力扑杀而至——",
      msg2: "被鲲鹏极速击中，根本来不及反应！"
    },
    {
      id: "liushen",
      name: "柳神",
      skill: "柳神法·万灵归墟",
      desc: "通天彻地祭灵之祖，掌生命与毁灭",
      beilv: 13,
      special: "不可防御",
      msg1: "通天柳树虚影撑开天地，万千晶莹柳条垂落！生命法则与毁灭法则交织成璀璨光雨，将整片战场淹没——",
      msg2: "被柳神的生命与毁灭轮回之力洗礼，生机与死气同时炸开！"
    },
    {
      id: "mirror_enemy",
      name: "敌之映照",
      skill: "他化自在·映照敌身",
      desc: "映照万古敌，化最强之矛为己用",
      beilv: 12,
      special: "复刻敌方",
      msg1: "他化自在法映照时间长河，捞出对手最为辉煌的一瞬间！那道道果凝聚成无敌战体，携对手毕生最强一击轰杀而至——",
      msg2: "被自己的道果映照击中，直面自身的终极一击，为之骇然！"
    },
    {
      id: "mirror_self",
      name: "己之映照",
      skill: "他化自在·映照己身",
      desc: "化出绝世道果，另一个我横扫诸天",
      beilv: 14,
      special: "本体之力",
      msg1: "他化自在法逆溯时间长河，映照出一尊踏碎万古的无敌身影！那是另一个我，携超越时空的无上伟力降临当世——",
      msg2: "被另一个我的无上伟力轰击，直面自身最恐怖的可能！"
    }
  ];

  // ==================== 他化自在法等级配置 ====================
  function getTahuaLevelConfig(mijinglevel_id) {
    switch(mijinglevel_id) {
      case 18: // 仙王 - 借来道果，化出战体，存在一回合
        return { minCount: 1, maxCount: 1, duration: 1, maxActive: 1, triggerChance: 0.30, desc: "借来道果" };
      case 19: // 仙王巨头 - 可存在两回合
        return { minCount: 1, maxCount: 1, duration: 2, maxActive: 1, triggerChance: 0.35, desc: "借来道果" };
      case 20: // 道祖准仙帝 - 随机1~2个，存在三回合，至多3个
        return { minCount: 1, maxCount: 2, duration: 3, maxActive: 3, triggerChance: 0.40, desc: "他化自在" };
      case 21: // 路尽级仙帝 - 随机1~3个，永久存在(可被击杀)，至多5个
        return { minCount: 1, maxCount: 3, duration: -1, maxActive: 5, triggerChance: 0.50, desc: "他化自在" };
      case 22: // 祭道 - 固定3个，永久存在，至多6个
        return { minCount: 3, maxCount: 3, duration: -1, maxActive: 6, triggerChance: 0.60, desc: "他化自在" };
      case 23: // 祭道之上 - 固定4个，永久存在，至多7个
        return { minCount: 4, maxCount: 4, duration: -1, maxActive: 7, triggerChance: 0.70, desc: "他化自在" };  
      case 24: // 唯一道之上 - 固定5个，永久存在，至多8个
        return { minCount: 5, maxCount: 5, duration: -1, maxActive: 8, triggerChance: 0.80, desc: "他化自在" };
      default:
        return null; // 境界不足，不可触发
    }
  }

  // ==================== 行动拉条核心函数 ====================
  
  function advanceActionBars() {
    const A_realSpeed = Math.floor(A_speed * A_speedBoost);
    const B_realSpeed = Math.floor(B_speed * B_speedBoost);
    
    A_actionBar += A_realSpeed;
    B_actionBar += B_realSpeed;
    
    const A_ready = A_actionBar >= ACTION_BAR_MAX;
    const B_ready = B_actionBar >= ACTION_BAR_MAX;
    
    if (A_ready && B_ready) {
      if (A_realSpeed >= B_realSpeed) {
        return { attacker: A_player, defender: B_player, attackerBar: 'A', defenderBar: 'B' };
      } else {
        return { attacker: B_player, defender: A_player, attackerBar: 'B', defenderBar: 'A' };
      }
    } else if (A_ready) {
      return { attacker: A_player, defender: B_player, attackerBar: 'A', defenderBar: 'B' };
    } else if (B_ready) {
      return { attacker: B_player, defender: A_player, attackerBar: 'B', defenderBar: 'A' };
    } else {
      return null;
    }
  }
  
  function resetActionBar(bar) {
    if (bar === 'A') {
      A_actionBar = 0;
    } else {
      B_actionBar = 0;
    }
  }
  
  function boostActionBar(bar, amount) {
    if (bar === 'A') {
      A_actionBar = Math.min(A_actionBar + amount, ACTION_BAR_MAX);
      return A_actionBar >= ACTION_BAR_MAX;
    } else {
      B_actionBar = Math.min(B_actionBar + amount, ACTION_BAR_MAX);
      return B_actionBar >= ACTION_BAR_MAX;
    }
  }
  
  function pushBackActionBar(bar, amount) {
    if (bar === 'A') {
      A_actionBar = Math.max(A_actionBar - amount, 0);
    } else {
      B_actionBar = Math.max(B_actionBar - amount, 0);
    }
  }

  // ==================== 攻击处理函数（保持原样） ====================
  async function performAttack(attacker, defender, cnt2, context = "main") {
    const isImmune = (attacker === A_player && A_immune_control > 0) || 
                     (attacker === B_player && B_immune_control > 0);
    const attackerEquipment = await getEquipment(attacker);

    if (context === 'main' && Number(attacker._东皇冻结回合) > 0) {
      attacker._东皇冻结回合--;
      msg.push(`${attacker.名号}被至宝镇封，本回合无法行动！`);
      return null;
    }
    const innateSilenced = context === 'main' && attacker._陷仙沉默 && Math.random() < 0.3;
    if (innateSilenced) msg.push(`【陷仙剑】${attacker.名号}神通被沉默，本回合只能进行普通攻击。`);

    if (attacker.dongjie) {
      if (isImmune) {
        attacker.dongjie = false;
        const immuneType = (attacker === A_player ? A_immune_type : B_immune_type) || "涅槃真火护体";
        msg.push(`${attacker.名号}的${immuneType}效果免疫了冻结状态！`);
      } else if (attackerEquipment?.护具?.name === '逍遥仙袍' && !attacker._逍遥仙袍已触发) {
        attacker.dongjie = false;
        attacker._逍遥仙袍已触发 = true;
        attacker._逍遥仙袍闪避次数 = 1;
        msg.push(`${attacker.名号}的逍遥仙袍清风流转，解除了首次控制，并获得一次10%闪避加成！`);
      } else {
        if (context !== "fenshen") {
          msg.push(`${attacker.名号}无法动弹！`);
          attacker.dongjie = false;
          return null;
        }
      }
    }

    // —— 道种·治疗技：回合起手持续回血（生生不息/乙木逢春）——
    if (attacker.xiangu_shenhuo && attacker.xiangu_shenhuo.专属技能) {
      const 治疗条目 = getSeedSkillEntry(attacker.xiangu_shenhuo.专属技能);
      if (!attacker._先天禁疗 && 治疗条目 && 治疗条目.技能分类 === '治疗' && 治疗条目.回复比例 && attacker.当前血量 < attacker.血量上限) {
        const 回血量 = Math.trunc(attacker.血量上限 * 治疗条目.回复比例 * (1 + (attacker.治疗效果加成 || 0)));
        if (回血量 > 0) {
          const _before = attacker.当前血量;
          attacker.当前血量 = Math.min(attacker.当前血量 + 回血量, attacker.血量上限);
          const _实际 = attacker.当前血量 - _before;
          if (_实际 > 0) msg.push(`${attacker.名号}的「${治疗条目.name}」道种生机涌动，气血自愈，恢复${bigNumberTransform(_实际)}点生命！`);
        }
      }
    }

    let baoji = baojishanghai(attacker.暴击率, attacker.暴击伤害);
    let isCritical = baoji > 1;

    if (!innateSilenced) {
      handleControlEffects( A_immune_control, B_immune_control, A_player, B_player, attacker, defender, msg, emperorFieldTriggered, context, linziState);
      if (await handleEmperorWeapon(attacker, defender, msg, emperorWeaponTriggered, attackerEquipment)) {
        emperorWeaponTriggered = true;
      }
      handleCircularGod(attacker, defender, msg, context);
      handleSpecialSkills(attacker, defender, msg, teshujineng,emperorFieldTriggered);
    }

    if (attacker.灵根 && attacker.灵根.name === "彼岸·命运神道体" && 轮回诸天拳触发 == false) {
      轮回诸天拳触发 = true;
      let godDemonMsg = [];
      
      if (Math.random() > 0.01) {
        defender.dongjie = true;
        godDemonMsg.push(`所有法，所有名，所有往来朝夕皆如土！`);
        godDemonMsg.push(`${attacker.名号}身与魂轮回诸天归来！祂自出世以来游历无穷混沌海未曾一败，在此刻意气神已经到达了顶峰，超脱了彼岸`);
        godDemonMsg.push(`无穷的拳意世界重重而立，巍峨神殿压迫而来，诸天命运生死轮盘浮现！`);
        godDemonMsg.push(`真实与虚妄在不断倒转，万千神魔撕裂虚空而来，此刻${attacker.名号}端坐九重天上仿佛至高天帝，${defender.名号}被恐怖的神意压制无法动弹！`);
        
        if (Math.random() > 0.01) {
          let 夺取比例 = 0.5;
          let 夺取攻击 = Math.floor(defender.攻击 * 夺取比例);
          let 夺取防御 = Math.floor(defender.防御 * 夺取比例);
          let 夺取血量 = Math.floor(defender.当前血量 * 夺取比例);
          
          defender.攻击 = Math.max(defender.攻击 - 夺取攻击, 0);
          defender.防御 = Math.max(defender.防御 - 夺取防御, 0);
          defender.当前血量 = Math.max(defender.当前血量 - 夺取血量, 0);
          
          godDemonMsg.push(`${defender.名号}受到诸天生死轮盘压制，一身气势在克泄，神与意都将被磨灭`);
          godDemonMsg.push(`攻击：${defender.名号}-${夺取攻击}`);
          godDemonMsg.push(`防御：${defender.名号}-${夺取防御}`);
          godDemonMsg.push(`生命：${defender.名号}-${夺取血量}`);
        }

        godDemonMsg.push(`轮回诸天拳第九重，诛天灭地！`);
        godDemonMsg.push(`${attacker.名号}断喝一声！音声撕裂了无穷大千宇宙，意气爆发，递出恐怖一拳，锁定了无穷时空变量，覆盖了一切概念！`);

        if (Math.random() > 0.01) {
          let 夺取比例 = 0.5;
          let 夺取攻击 = Math.floor(defender.攻击 * 夺取比例);
          let 夺取防御 = Math.floor(defender.防御 * 夺取比例);
          let 夺取血量 = Math.floor(defender.当前血量 * 夺取比例);
          let 终焉伤害 = Math.floor(夺取攻击 + 夺取防御 + 夺取血量) + attacker.攻击 * 100;
          
          defender.当前血量 = Math.max(defender.当前血量 - 终焉伤害, 0);
          godDemonMsg.push(`${defender.名号}眼眸刹那晦暗，意识在无尽冰冷的黑暗中不断下坠，被轮回诸天拳打的当空炸开！存在的概念都被磨灭殆尽了，失去了${bigNumberTransform(终焉伤害)}生命，当前血量${bigNumberTransform(defender.当前血量)}`);

          if (defender.当前血量 <= 0) {
            const canRevive = defender.学习的功法?.some(gongfa => 
              ["涅槃仙功", "圆神"].includes(gongfa)
            ) && !(defender === A_player ? A_revived : B_revived);

            if (canRevive) {
              const 最大血量 = defender.血量上限;
              defender.当前血量 = Math.trunc(最大血量 * 0.5);
              if (defender === A_player) A_revived = true;
              else B_revived = true;
              
              godDemonMsg.push(`然而${defender.名号}体内涅槃真火突然爆发！`);
              godDemonMsg.push(`「纵使轮回千百世，我亦不灭！」`);
              godDemonMsg.push(`${defender.名号}浴火重生，恢复${bigNumberTransform(最大血量 * 0.5)}点生命！`);
            } else {
              godDemonMsg.push(`「这一世，你败了。」${attacker.名号}收拳而立，眸光冰冷`);
              godDemonMsg.push(`${defender.名号}的道果被彻底磨灭，再无重生可能！`);

              msg = msg.concat(godDemonMsg);
              cnt += godDemonMsg.length;

              // 统一返回结构：{ 伤害, isCritical, baoji, battleEnded, winner, msg }
              return { 伤害: 0, isCritical: false, baoji: 1, battleEnded: true, winner: attacker === A_player ? "A" : "B", msg };
            }
          }
        }
      } else {
        godDemonMsg.push(`${attacker.名号}试图施展轮回诸天拳，但天地法则突然紊乱，招式未能成形！`);
      }

      msg = msg.concat(godDemonMsg);
      cnt += godDemonMsg.length;
    }

    let 基础伤害 = Harm(attacker.攻击 * 0.85, defender.防御);
    let 暴击伤害 = Math.trunc(基础伤害 * baoji);
    let 法球伤害 = Math.trunc(attacker.攻击 * attacker.法球倍率);
    let 伤害 = 暴击伤害 + 法球伤害;

    if (isNotNull(attacker.仙宠)) {
      const petCriticalBonus = getPetAbilityBonus(attacker.仙宠, '暴伤');
      const petCombatBonus = getPetAbilityBonus(attacker.仙宠, '战斗');
      if (petCriticalBonus > 0) baoji += petCriticalBonus;
      if (petCombatBonus > 0) {
        let ran = Math.random();
        if (ran < 0.35) {
          attacker.攻击 += Math.trunc(attacker.攻击 * petCombatBonus);
          attacker.防御 += Math.trunc(attacker.防御 * petCombatBonus);
          attacker.当前血量 += Math.trunc(attacker.当前血量 * petCombatBonus);
          msg.push(`仙宠【${attacker.仙宠.name}】辅佐了${attacker.名号}，攻防血增加${Math.trunc(petCombatBonus * 100)}%`);
        }
      }
    }
     
    if (isNotNull(attacker.id)) {
      let equipment = await getEquipment(attacker);
      let ran = Math.random();
      
      // P0-6: 装备 IO 失败时 equipment === null, 加 optional chaining 防 TypeError
      if (equipment?.法宝?.name == '万灵天图' && ran > 0.1) {
        const shieldValue = Math.trunc(attacker.血量上限 * 0.4);
        attacker.护盾值 = shieldValue;
        msg.push(`【万灵天图·诸天护体】`);
        msg.push(`${attacker.名号}祭出万灵天图，天图展开，万灵显化：真龙盘绕，神凰展翅，鲲鹏击天！`);
        msg.push(`诸天符文流转，演化无上防御：万灵护体，诸邪不侵！`);
        msg.push(`一道混沌光幕笼罩${attacker.名号}，凝聚万灵之力（护盾值+${shieldValue}）`);
      }

      if (equipment?.护具?.name == '星辰袍' && ran > 0.15) {
        const shieldValue = Math.trunc(attacker.血量上限 * 0.35);
        attacker.护盾值 = (attacker.护盾值 || 0) + shieldValue;
        const defenseBoost = Math.trunc(attacker.防御 * 0.5);
        attacker.防御 += defenseBoost;

        msg.push(`【星辰袍·周天星斗护体】`);
        msg.push(`${attacker.名号}身披星辰袍，引动周天星斗之力！`);
        msg.push(`三百六十五颗主星同时亮起，垂落无尽星辉，结成周天星斗大阵！`);
        msg.push(`星辰之力凝聚成不灭护盾，万法不侵（护盾值+${shieldValue}）`);
        msg.push(`星辉淬体，防御力大幅提升（防御+${defenseBoost}）`);

        if (ran > 0.85) {
          const counterDamage = Math.trunc(defender.攻击 * 0.8);
          defender.当前血量 = Math.max(defender.当前血量 - counterDamage, 0);

          msg.push(`【星辰反噬·星陨天罚】`);
          msg.push(`周天星斗大阵逆转，星辰之力化作毁灭光束！`);
          msg.push(`一道璀璨星芒贯穿虚空，直击${defender.名号}！`);
          msg.push(`星辰反噬造成${counterDamage}点伤害！`);
        }
      }

      if (equipment?.武器?.name == '紫云剑' && ran > 0.7) {
        attacker.攻击 *= 3;
        msg.push(`${attacker.名号}触发了紫云剑被动,攻击力提高了200%`);
      } else if (equipment?.武器?.name == '炼血竹枪' && ran > 0.75) {
        attacker.攻击 *= 2;
        attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.2);
        msg.push(`${attacker.名号}触发了炼血竹枪被动,攻击力提高了100%,血量回复了20%`);
      } else if (equipment?.武器?.name == '少阴玉剑' && ran > 0.75) {
        attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.4);
        msg.push(`${attacker.名号}触发了少阴玉剑被动,血量回复了40%`);
      } else if (equipment?.武器?.name == '荒剑' && (attacker.mijinglevel_id>20||attacker.xiangulevel_id>20) && ran > 0.75) {
        let 武器伤害 = attacker.攻击 * attacker.法球倍率 * 100;
        defender.当前血量 = Math.max(defender.当前血量 - 武器伤害, 0);
        msg.push(`${attacker.名号}眼眸开阖间挥动帝剑，煌煌剑光仿佛截断了永恒，斩开了时间长河，无穷大宇宙都在这一剑的滔天伟力下毁灭了，${defender.名号}在过去现在未来都受到了这毁天灭地的一击，仙躯与元神瞬间炸开！失去了${bigNumberTransform(武器伤害)}点血量,${defender.名号}当前血量${defender.当前血量}`);

        if (defender.当前血量 <= 0) {
          const 复活结果 = checkRevival(defender, "main");
          if (复活结果.revived) {
            msg.push(复活结果.message);
          } else {
            msg.push(`${attacker.名号}击败了${defender.名号}`);
            return { 伤害: 0, isCritical: false, baoji: 1, battleEnded: true, winner: attacker === A_player ? "A" : "B", msg };
          }
        }
      }

      if (equipment?.帝兵 && equipment.帝兵.name === "如梦的诸天棋盘") {
        msg.push(`「诸天为盘，众生为子！」${attacker.名号}轻语，抬手间祭出如梦的诸天棋盘`);
        msg.push(`棋盘上星罗棋布，每一颗棋子都映照着一方大千世界`);
        msg.push(`一道贯穿古今未来的光芒从棋盘射出，锁定${defender.名号}的所有时空存在，刹那间，风不转，云不动，一切都静止了`);
        msg.push(`「这一局，你输了。」${attacker.名号}落下一枚黑子，诸天震动！`);

        defender.当前血量 = 0;
        msg.push(`${defender.名号}的存在痕迹被从所有时间线上彻底抹除！`);
        // 统一返回结构
        return { 伤害: 0, isCritical: false, baoji: 1, battleEnded: true, winner: attacker === A_player ? "A" : "B", msg };
      }
    }

    let count = 0;
    let Random = Math.random();
    let 不可防御 = false;
    let 不可复活 = false;
    let 攻击方技能 = null; // 在if语句块外定义变量
    let 无视减伤 = false; // 草字剑诀·斩真我：无视目标减伤与类型减免
    let 斩杀阈值 = 0; // 草字剑诀·斩真我：命中后目标血量低于此比例(×血量上限)则直接斩杀
    const _基础伤害 = 伤害; // 基础普攻伤害（归为神通类型）
    let 类型桶 = { '神通': _基础伤害 }; // 分类型伤害桶：每个技能按自身攻击类型累加增量
    for (var i = 0; !innateSilenced && i < jineng1.length; i++) {
      if (context === "fenshen" && fenshen.includes(jineng1[i].name)) {
        continue;
      }
      
      let actualPr = jineng1[i].pr;
      if (attacker === A_player) {
        actualPr += linziState.A_加成;
      } else {
        actualPr += linziState.B_加成;
      }
      
      if ((jineng1[i].class == '常驻' && (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (attacker.学习的功法 && jineng1[i].class == '功法' && attacker.学习的功法.indexOf(jineng1[i].name) > -1 && (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (jineng1[i].class == '灵根' && hasSupremeInnate(attacker, jineng1[i].name) && (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (attacker.xiangu_shenhuo && jineng1[i].class == '道种专属' && attacker.xiangu_shenhuo.专属技能 === jineng1[i].name && (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr)) {
          攻击方技能 = jineng1[i]; // 在这里赋值
          if (jineng1[i].无视减伤) 无视减伤 = true; // 草字剑诀·斩真我
          if (jineng1[i].斩杀阈值) 斩杀阈值 = jineng1[i].斩杀阈值; // 草字剑诀·斩真我
        let processedMsg1 = jineng1[i].msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
        let processedMsg2 = jineng1[i].msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
        
        if (jineng1[i].msg2 == '') {
          msg.push(attacker.名号 + processedMsg1);
        } else {
          msg.push(attacker.名号 + processedMsg1 + defender.名号 + processedMsg2);
        }
        
        if (jineng1[i].不可防御 === 1) {
          不可防御 = true;
        }
        if (jineng1[i].不可复活 === 1) {
          不可复活 = true;
          defender.不可复活 = true;
        }
        if (jineng1[i].控制 === 1) {
          defender.dongjie = true;
        }
        
        if (jineng1[i].拉条) {
          const bar = attacker === A_player ? 'A' : 'B';
          const boosted = boostActionBar(bar, jineng1[i].拉条);
          if (boosted) {
            msg.push(`${attacker.名号}气势如虹，大道共鸣，行动条瞬间拉满，下一击即刻降临！`);
          } else {
            msg.push(`${attacker.名号}体内气血翻涌，元神燃烧，行动条跃进${jineng1[i].拉条}点！`);
          }
        }
        if (jineng1[i].推条) {
          const bar = defender === A_player ? 'A' : 'B';
          pushBackActionBar(bar, jineng1[i].推条);
          msg.push(`${defender.名号}被无上伟力镇压，遁光受阻，行动条被压制${jineng1[i].推条}点！`);
        }
        if (jineng1[i].速度加成) {
          if (attacker === A_player) A_speedBoost += jineng1[i].速度加成;
          else B_speedBoost += jineng1[i].速度加成;
          msg.push(`${attacker.名号}体内道则轰鸣，速度暴涨${Math.round(jineng1[i].速度加成 * 100)}%！`);
        }

        // —— 每个技能按自身攻击类型单独结算：基础连乘保留，增量归入对应类型桶 ——
        const _旧伤害 = 伤害;
        伤害 = 伤害 * jineng1[i].beilv + jineng1[i].other;
        const 该技能增量 = 伤害 - _旧伤害;
        const _t = jineng1[i].攻击类型 || '神通';
        类型桶[_t] = (类型桶[_t] || 0) + 该技能增量;

        if (jineng1[i].负面效果) {
          defender.fumianhuihe = jineng1[i].负面回合;
          defender.fumian_damage = Math.trunc(该技能增量 * jineng1[i].beilv + jineng1[i].other);
          defender.fumian_type = jineng1[i].负面类型;
        }

        count++;
        if (count == 3) break;
      }
    }
    const 伤害_循环末 = 伤害; // 技能循环结束时的原始总伤（用于对轰/防御技能/反弹的整体缩放映射）
// ==================== 对轰判断 ====================
  // 调试日志
  // console.log(`[对轰调试] 攻击方技能: ${攻击方技能?.name || '无'}, 不可防御: ${不可防御}, count: ${count}, 回合cnt2: ${cnt2}`);
  // console.log(`[对轰调试] 攻击方速度: ${attacker.速度}, 防御方速度: ${defender.速度}`);
  
  // 只有当攻击方触发了技能，且不是控制类技能时，才可能触发对轰
  if (攻击方技能 && 攻击方技能.控制 !== 1 && !不可防御) {
    // 速度影响对轰触发概率：防御方速度越快，越容易及时反击
    const 速度比值 = defender.速度 / (attacker.速度 + defender.速度);
    const 基础触发概率 = 0.3; // 基础30%触发概率
    const 速度加成 = 速度比值 * 0.3; // 速度优势最多加30%
    const 最终触发概率 = Math.min(1, 基础触发概率 + 速度加成);
    
    if (Math.random() < 最终触发概率) {
      // 防御方尝试用自己的攻击技能对轰
      let 防御方反击技能 = null;
      let 反击技能伤害 = 0;
      
      // 筛选防御方可以用于反击的攻击技能
      const 可用反击技能 = jineng1.filter(skill => {
        // 必须是攻击类技能
        if (skill.控制 === 1) return false;
        if (skill.负面效果) return false;
        
        // 检查防御方是否满足触发条件
        if (skill.class === '功法' && defender.学习的功法 && defender.学习的功法.includes(skill.name)) {
          return true;
        }
        if (skill.class === '灵根' && hasSupremeInnate(defender, skill.name)) {
          return true;
        }
        if (skill.class === '常驻') {
          return true;
        }
        return false;
      });
      
      if (可用反击技能.length > 0 && Math.random() < 0.6) { // 60%概率找到合适反击技能
        防御方反击技能 = 可用反击技能[Math.floor(Math.random() * 可用反击技能.length)];
        
        // 计算反击伤害
        let 反击基础伤害 = Harm(defender.攻击 * 0.7, attacker.防御); // 反击伤害较低
        let 反击暴击 = baojishanghai(defender.暴击率, defender.暴击伤害);
        let 反击最终伤害 = Math.trunc(反击基础伤害 * 反击暴击 * 防御方反击技能.beilv + 防御方反击技能.other);
        
        msg.push(`「嗯？」${defender.名号}见对方来势汹汹，不闪不避，同样施展神通对轰！`);
        msg.push(`${defender.名号}施展${防御方反击技能.name}，一道神光迎向对方的攻击！`);
        
        // 判断对轰结果：比较双方技能威力
        const 攻击方威力 = 攻击方技能.beilv || 1;
        const 防御方威力 = 防御方反击技能.beilv || 1;
        
        if (防御方威力 >= 攻击方威力 * 0.8) {
          // 防御方成功抵消大部分伤害
          const 抵消比例 = 防御方威力 / (攻击方威力 + 防御方威力);
          const 抵消伤害 = Math.trunc(伤害 * 抵消比例);
          伤害 = Math.trunc(伤害 * (1 - 抵消比例));
          
          msg.push(`两股神通在半空中剧烈碰撞，爆发出耀眼的光芒！`);
          msg.push(`${defender.名号}的神通抵消了${bigNumberTransform(抵消伤害)}点伤害！`);
          
          // 反击造成部分伤害
          if (反击最终伤害 > 0) {
            attacker.当前血量 = Math.max(attacker.当前血量 - 反击最终伤害, 0);
            msg.push(`对轰的余波震伤了${attacker.名号}，造成${bigNumberTransform(反击最终伤害)}点伤害！`);
            msg.push(`${attacker.名号}剩余血量：${bigNumberTransform(attacker.当前血量)}`);
          }
          
          // 双方都被推条
          const 对轰推条 = 100;
          const attackerBar = attacker === A_player ? 'A' : 'B';
          const defenderBar = defender === A_player ? 'A' : 'B';
          pushBackActionBar(attackerBar, 对轰推条);
          pushBackActionBar(defenderBar, 对轰推条);
          msg.push(`神通对轰的冲击让双方都后退数步，行动条各减少${对轰推条}点！`);
          
        } else {
          // 防御方对轰失败
          msg.push(`${defender.名号}的神通不敌对方，被一击击溃！`);
          msg.push(`${attacker.名号}的攻势虽被削弱，但依旧向前轰去！`);
          
          // 攻击伤害削弱
          伤害 = Math.trunc(伤害 * 0.7);
          
          // 反击失败，防御方额外受伤
          const 反噬伤害 = Math.trunc(反击最终伤害 * 0.3);
          if (反噬伤害 > 0) {
            defender.当前血量 = Math.max(defender.当前血量 - 反噬伤害, 0);
            msg.push(`${defender.名号}神通被破，受到反噬，损失${bigNumberTransform(反噬伤害)}点生命！`);
          }
          
          // 攻击方获得拉条奖励
          const 对轰胜利拉条 = 150;
          const attackerBar = attacker === A_player ? 'A' : 'B';
          boostActionBar(attackerBar, 对轰胜利拉条);
          msg.push(`${attacker.名号}在对轰中占据上风，气势大涨，行动条增加${对轰胜利拉条}点！`);
        }
        
        // 对轰后跳过后续防御技能判定
        不可防御 = true;
        
      } else {
        // 防御方来不及或找不到合适技能反击
        const 速度优势 = defender.速度 > attacker.速度;
        if (速度优势) {
          msg.push(`${defender.名号}速度虽快，但仓促间来不及施展强力神通反击！`);
        } else {
          msg.push(`${defender.名号}速度稍慢，来不及施展神通对轰！`);
        }
      }
    }
  }
    if (!不可防御) {
      let 反弹伤害 = 0;
      let random = Math.random();
      let 已触发技能 = false;
      
      const sortedSkills = [...jineng2].sort((a, b) => (a.优先级 || 999) - (b.优先级 || 999));
      
      for (var i = 0; i < sortedSkills.length; i++) {
        const skill = sortedSkills[i];
        let actualPr = skill.pr;

        if (defender === A_player) {
          actualPr += linziState.A_加成;
        } else {
          actualPr += linziState.B_加成;
        }
        
        if ((defender.学习的功法 && skill.class == '功法' && defender.学习的功法.indexOf(skill.name) > -1 && (cnt2 == skill.cnt || skill.cnt == -1) && random < skill.pr) ||
            (skill.class == '灵根' && hasSupremeInnate(defender, skill.name) && (cnt2 == skill.cnt || skill.cnt == -1) && random < skill.pr) ||
            (defender.xiangu_shenhuo && skill.class == '道种专属' && defender.xiangu_shenhuo.专属技能 === skill.name && (cnt2 == skill.cnt || skill.cnt == -1) && random < skill.pr)) {
          
          if (skill.msg1 == '') {
            msg.push(attacker.名号 + skill.msg2);
          } else if (skill.msg2 == '') {
            msg.push(defender.名号 + skill.msg1);
          } else {
            msg.push(defender.名号 + skill.msg1 + attacker.名号 + skill.msg2);
          }

          // —— 道种·防御技专属效果（护盾/免控/厚土无敌持续减伤）——
          if (skill.class == '道种专属') {
            if (skill.护盾值 > 0) {
              const 护盾量 = Math.trunc(defender.血量上限 * skill.护盾值);
              defender.护盾值 = (defender.护盾值 || 0) + 护盾量;
              msg.push(`${defender.名号}的道种之力凝聚护盾，获得${bigNumberTransform(护盾量)}点护盾！`);
            }
            if (skill.免控回合 > 0) {
              if (defender === A_player) { A_immune_control = skill.免控回合; A_immune_type = skill.name; }
              else { B_immune_control = skill.免控回合; B_immune_type = skill.name; }
              msg.push(`${defender.名号}道体不染尘埃，${skill.免控回合}回合内免疫一切控制！`);
            }
            if (skill.持续减伤 > 0 && skill.持续减伤回合 > 0) {
              defender._持续减伤比例 = skill.持续减伤;
              defender._持续减伤回合 = skill.持续减伤回合;
              msg.push(`${defender.名号}催动「${skill.name}」，厚土加身，未来${skill.持续减伤回合}回合内减伤${Math.trunc(skill.持续减伤 * 100)}%！`);
            }
          }

          if (skill.负面转移 && defender.fumianhuihe > 0) {
            attacker.fumianhuihe = defender.fumianhuihe;
            attacker.fumian_damage = defender.fumian_damage;
            attacker.fumian_type = defender.fumian_type;
            
            defender.fumianhuihe = 0;
            defender.fumian_damage = 0;
            defender.fumian_type = null;
            
            msg.push(`${defender.名号}成功将${attacker.fumian_type}效果转移给${attacker.名号}！`);
            msg.push(`${attacker.名号}将承受${attacker.fumianhuihe}回合的${attacker.fumian_type}效果！`);
          }

          if (skill.反弹伤害) {
            defender.反弹比例 = skill.反弹伤害;
            反弹伤害 = Math.floor(伤害 * defender.反弹比例);
            const 攻击者原始血量 = attacker.当前血量;
            attacker.当前血量 = Math.max(attacker.当前血量 - 反弹伤害, 0);
            const 攻击者损失血量 = 攻击者原始血量 - attacker.当前血量;
            
            伤害 = 伤害 * skill.beilv + skill.other;
            
            msg.push(`${attacker.名号}受到${bigNumberTransform(反弹伤害)}点反弹伤害！`);
            msg.push(`${defender.名号}当前生命${bigNumberTransform(defender.当前血量)}，${attacker.名号}当前生命：${bigNumberTransform(攻击者原始血量)} → ${bigNumberTransform(attacker.当前血量)} (减少${bigNumberTransform(攻击者损失血量)})`);
          }
          
          伤害 = 伤害 * skill.beilv + skill.other;
          已触发技能 = true;
          break;
        }
      }
      
      if (!已触发技能) {
        msg.push(`${defender.名号}未能触发任何防御技能！`);
      }
    } else {
      msg.push(`${defender.名号}的防御手段被${attacker.名号}的攻击神通完全压制！`);
    }

    let buff = 1;
    if (attacker.魔道值 > 999 && attacker.灵根.type == '魔头') {
      buff += Math.trunc(attacker.魔道值 / 1000) / 100;
      if (buff > 1.3) buff = 1.3;
      msg.push(`魔道值为${attacker.名号}提供了${Math.trunc((buff - 1) * 100)}%的增伤`);
    }
    if (defender.魔道值 < 1 && defender.灵根.type == '转生') {
      let buff2 = defender.神石 * 0.0015;
      if (buff2 > 0.3) buff2 = 0.3;
      buff -= buff2;
      msg.push(`神石为${defender.名号}提供了${Math.trunc(buff2 * 100)}%的减伤`);
    }
    if (attacker.魔道值 > 999 && attacker.灵根.type == '天魔') {
      buff += Math.trunc(attacker.魔道值 / 1000) / 100;
      if (buff > 1.3) buff = 1.3;
      if (['极道天魔', '无相·万化天魔体'].includes(attacker.灵根.name)) buff += 0.3;
      msg.push(`${attacker.名号}将魔道之力转化为邪神之力，获得了${Math.trunc((buff - 1) * 100)}%的增伤`);
    }
    if (defender.魔道值 < 1 && defender.灵根.type == '命运') {
      let buff2 = defender.神石 * 0.0015;
      if (buff2 > 0.3) buff2 = 0.3;
      if (defender.灵根.name == '命运神道体') buff2 += 0.3;
      buff -= buff2;
      msg.push(`${defender.名号}将神石之力转化为命运之力，获得了${Math.trunc(buff * 100)}%的减伤`);
    }

    伤害 = Math.trunc(伤害 * buff);

    // 统一伤害修正管线（闪避/类型加成/类型减免/穿透）；dmgType 按攻击技能类型分流
    // 无视减伤（草字剑诀·斩真我）：跳过类型减免
    const _cd = calcDamage(attacker, defender, 伤害, { buckets: 类型桶, baseRaw: 伤害_循环末 }, false, 无视减伤);
    伤害 = _cd.actual_damage;
    msg = msg.concat(_cd.msgs);

    if (!无视减伤) {
      // 减伤效果（圆环之理 0.3 减伤等配置属性实际生效）
      if (defender.减伤比例 > 0) {
        const before = 伤害;
        伤害 = Math.trunc(伤害 * (1 - defender.减伤比例));
        msg.push(`${defender.名号}的护体减伤效果抵消了${bigNumberTransform(before - 伤害)}点伤害！`);
      }
      // 道种·厚土无敌 持续减伤（多回合 80% 减伤，回合数由主循环递减）
      if (defender._持续减伤回合 > 0 && defender._持续减伤比例 > 0) {
        const before = 伤害;
        伤害 = Math.trunc(伤害 * (1 - defender._持续减伤比例));
        msg.push(`${defender.名号}的「厚土无敌」大地之力护体，抵消了${bigNumberTransform(before - 伤害)}点伤害！`);
      }
    } else {
      msg.push(`${attacker.名号}的攻击斩落真我本源，无视了${defender.名号}的一切护体减伤！`);
    }

    return { 伤害, isCritical, baoji, 无视减伤, 斩杀阈值 };
  }

  // ==================== 伤害应用函数（保持原样） ====================
  function applyDamage(defender, 伤害, context, source = null) {
    let fenshen_blocked = false;
    let actual_damage = 伤害;

    if (
      context === 'main' && source &&
      defender.当前先天至宝 === '太极图' &&
      defender.先天权柄?.太极模式 === '阴' &&
      Math.random() < 0.3
    ) {
      const counterDamage = Math.max(1, Harm((Number(defender.攻击) || 1) * 0.85, Number(source.防御) || 0));
      source.当前血量 = Math.max(0, source.当前血量 - counterDamage);
      msg.push(`【太极·阴】${defender.名号}化去本次伤害，并反击${source.名号}造成${bigNumberTransform(counterDamage)}点伤害。`);
      return { actual_damage: 0, fenshen_blocked: false, countered: true };
    }

    if (defender.护盾值 > 0) {
      if (defender.护盾值 >= actual_damage) {
        const 抵消值 = actual_damage;  // 先记录抵消值
        defender.护盾值 -= actual_damage;
        actual_damage = 0;
        msg.push(`${defender.名号}的护盾抵消了${bigNumberTransform(抵消值)}点伤害！`);
      } else {
        const 抵消值 = defender.护盾值;
        actual_damage -= defender.护盾值;
        msg.push(`${defender.名号}的护盾抵消${bigNumberTransform(抵消值)}点伤害！`);
        defender.护盾值 = 0;
      }
    }

    if (context !== "fenshen" && defender.分身 && defender.分身.length > 0) {
      const activeFenshen = defender.分身
        .filter(f => f.当前血量 > 0)
        .sort((a, b) => b.当前血量 - a.当前血量);
      
      if (activeFenshen.length > 0) {
        const shieldFenshen = activeFenshen[0];
        const originalDmg = actual_damage;
        
        if (shieldFenshen.当前血量 >= actual_damage) {
          shieldFenshen.当前血量 -= actual_damage;
          actual_damage = 0;
          msg.push(`${shieldFenshen.名号}挺身阻挡攻击！`);
          msg.push(`分身承受${bigNumberTransform(originalDmg)}点伤害`);
        } else {
          actual_damage -= shieldFenshen.当前血量;
          msg.push(`${shieldFenshen.名号}化作星尘消散！`);
          msg.push(`抵消${bigNumberTransform(shieldFenshen.当前血量)}点伤害`);
          shieldFenshen.当前血量 = 0;
        }
        fenshen_blocked = true;
      }
    }

    if (context !== "fenshen") {
      // 他化自在身抵挡伤害（按血量从高到低遍历，逐个挡伤）
      const tahuaEntities = defender === A_player ? A_tahua_entities : 
                            defender === B_player ? B_tahua_entities : null;
      
      if (tahuaEntities && tahuaEntities.length > 0) {
        const entities = tahuaEntities
          .filter(e => e.当前血量 > 0)
          .sort((a, b) => b.当前血量 - a.当前血量);
        let remainingDmg = actual_damage;
        
        for (const entity of entities) {
          if (remainingDmg <= 0) break;
          
          if (entity.当前血量 >= remainingDmg) {
            entity.当前血量 -= remainingDmg;
            msg.push(`${entity.名号}挺身而出，为${defender.名号}抵挡了${bigNumberTransform(remainingDmg)}点伤害！`);
            remainingDmg = 0;
            fenshen_blocked = true;
          } else {
            remainingDmg -= entity.当前血量;
            msg.push(`${entity.名号}为${defender.名号}抵挡${bigNumberTransform(entity.当前血量)}点伤害后，承受致命一击崩碎消散！`);
            entity.当前血量 = 0;
            fenshen_blocked = true;
          }
        }
        
        actual_damage = remainingDmg;
        
        // 清理已阵亡的化身
        if (defender === A_player) {
          A_tahua_entities = A_tahua_entities.filter(e => e.当前血量 > 0);
        } else {
          B_tahua_entities = B_tahua_entities.filter(e => e.当前血量 > 0);
        }
      }
    }

    if (context === 'main' && source && defender._阴阳逆转护命 && actual_damage >= defender.当前血量) {
      defender._阴阳逆转护命 = false;
      const healing = actual_damage;
      defender.当前血量 = Math.min(defender.血量上限 || defender.当前血量, defender.当前血量 + healing);
      source.当前血量 = Math.max(0, source.当前血量 - actual_damage);
      msg.push(`【阴阳逆转】致命伤害化为${bigNumberTransform(healing)}点治疗，并等量返还给${source.名号}！`);
      return { actual_damage: 0, fenshen_blocked, reversed: true };
    }

    defender.当前血量 -= actual_damage;
    if (defender.当前血量 < 0) defender.当前血量 = 0;

    // P0-2: 致死时立即检查复活（不让主循环漏掉涅槃仙功/圆神复活机会）
    if (context !== "fenshen" && defender.当前血量 <= 0) {
      const 复活结果 = checkRevival(defender, context);
      if (复活结果.revived) {
        msg.push(复活结果.message);
        return { actual_damage: 0, fenshen_blocked, revived: true };
      }
    }

    return { actual_damage, fenshen_blocked };
  }

  // ==================== 战斗消息生成（保持原样） ====================
  function createCombatMessage(round, attacker, defender, 伤害, actual_damage, isCritical, fenshen_blocked) {
    let message = `第${round + 1}回合：`;
    if (attacker.名号.includes('分身')) {
      message += `${attacker.名号}攻击了${defender.名号}，`;
    } else {
      if (isCritical) {
        message += `${attacker.名号}攻击了${defender.名号}，暴击！造成伤害${bigNumberTransform(伤害)}`;
      } else {
        message += `${attacker.名号}攻击了${defender.名号}，造成伤害${bigNumberTransform(伤害)}`;
      }
    }
    
    if (fenshen_blocked) {
      message += `（分身抵挡后实际伤害${bigNumberTransform(actual_damage)}）`;
    }
    
    message += `，${defender.名号}剩余血量${bigNumberTransform(defender.当前血量)}`;
    
    return message;
  }

  // ==================== 复活检查函数 ====================
  function checkRevival(player, context = "main") {
    const 可复活 = 
      context !== "fenshen" &&
      player.当前血量 <= 0 &&
      player.学习的功法 &&
      ((player === A_player && !A_revived) || (player === B_player && !B_revived));

    if (!可复活 || player.不可复活) {
      return { revived: false };
    }

    // 收集玩家学习的所有复活技能
    let playerReviveSkills = [];
    let builtInReviveSkills = [];

    for (var i = 0; i < jineng3.length; i++) {
      if (jineng3[i].复活技能 !== 1) continue;

      if (player.学习的功法 && player.学习的功法.indexOf(jineng3[i].name) > -1) {
        if (jineng3[i].稀有度 === 2) {
          // 玩家自创的复活功法 - 优先级最高··
          playerReviveSkills.push(jineng3[i]);
        } else {
          // 内置复活功法
          builtInReviveSkills.push(jineng3[i]);
        }
      }
    }

    // 优先检查玩家自创的复活功法（优先级最高）
    for (var i = 0; i < playerReviveSkills.length; i++) {
      let skill = playerReviveSkills[i];
      
      // 检查冷却和概率
      if (cnt2 == skill.cnt || skill.cnt == -1) {
        // 玩家自创功法使用 pr 概率判定
        if (Math.random() < skill.pr) {
          return performRevival(player, skill);
        }
      }
    }

    // 检查内置复活功法
    for (var i = 0; i < builtInReviveSkills.length; i++) {
      let skill = builtInReviveSkills[i];
      
      if (cnt2 == skill.cnt || skill.cnt == -1) {
        // 内置复活功法也添加 pr 判定
        let skillPr = skill.pr || 1; // 默认100%触发
        if (Math.random() < skillPr) {
          return performRevival(player, skill);
        }
      }
    }

    return { revived: false };
  }

  // 复活执行函数
  function performRevival(player, skill) {
    const 最大血量 = player.血量上限;
    const 恢复比例 = skill.恢复比例 || 0.5;
    const 恢复血量 = Math.trunc(最大血量 * 恢复比例);
    player.当前血量 = 恢复血量;
    player.dongjie = false;

    const 免控回合 = Math.round(skill.免控 || 0);
    if (player === A_player) {
      A_revived = true;
      if (免控回合 > 0) A_immune_control = 免控回合;
    } else {
      B_revived = true;
      if (免控回合 > 0) B_immune_control = 免控回合;
    }

    if (skill.攻击加成 && skill.攻击加成 > 0) {
      player.攻击 = Math.trunc(player.攻击 * (1 + skill.攻击加成));
    }
    if (skill.防御加成 && skill.防御加成 > 0) {
      player.防御 = Math.trunc(player.防御 * (1 + skill.防御加成));
    }
    if (skill.生命加成 && skill.生命加成 > 0) {
      const 新血量上限 = Math.trunc(player.血量上限 * (1 + skill.生命加成));
      player.血量上限 = 新血量上限;
      player.当前血量 = Math.trunc(player.当前血量 * (1 + skill.生命加成));
    }

    const 消息 = [];
    if (skill.msg1) 消息.push(player.名号 + skill.msg1);
    if (skill.msg2) 消息.push(player.名号 + skill.msg2);
    
    const 实际免控回合 = Math.round(免控回合);
    if (实际免控回合 > 0 && skill.免控类型 && skill.免控类型.length > 0) {
      const 随机免控类型 = skill.免控类型[Math.floor(Math.random() * skill.免控类型.length)];
      if (player === A_player) A_immune_type = 随机免控类型;
      else B_immune_type = 随机免控类型;
      消息.push(`${player.名号}获得${随机免控类型}，${实际免控回合}回合内免疫所有控制效果！`);
    } else if (实际免控回合 > 0) {
      if (player === A_player) A_immune_type = "涅槃真火护体";
      else B_immune_type = "涅槃真火护体";
      消息.push(`${player.名号}获得涅槃真火护体，${实际免控回合}回合内免疫所有控制效果！`);
    }

    let 加成消息 = "";
    if (skill.攻击加成 > 0) 加成消息 += `攻击+${(skill.攻击加成 * 100).toFixed(0)}% `;
    if (skill.防御加成 > 0) 加成消息 += `防御+${(skill.防御加成 * 100).toFixed(0)}% `;
    if (skill.生命加成 > 0) 加成消息 += `生命+${(skill.生命加成 * 100).toFixed(0)}% `;
    if (加成消息 !== "") {
      消息.push(`${player.名号}获得${加成消息.trim()}！`);
    }
    
    消息.push(`恢复${bigNumberTransform(恢复血量)}点血量！`);
    
    return {
      revived: true,
      message: 消息,
      skill: skill.name
    };
  }

  // ==================== 主战斗循环（仅修改行动条文案） ====================
  const A_isPersistentPlayer = Boolean(A_player.id) && fs.existsSync(path.join(__PATH.player_path, `${A_player.id}.json`));
  const B_isPersistentPlayer = Boolean(B_player.id) && fs.existsSync(path.join(__PATH.player_path, `${B_player.id}.json`));
  const isTianjiaoBattle = options.battleType === 'tianjiao';
  const isPvpBattle = A_isPersistentPlayer && B_isPersistentPlayer && !isTianjiaoBattle;

  function isBossOpponent(player) {
    return isTianjiaoBattle || player?.boss === true || player?.type === 'boss' ||
      /BOSS|Boss|首领|天骄/.test(String(player?.名号 || player?.name || ''));
  }

  async function applyInnateBattleOpening(holder, opponent) {
    const treasure = holder.当前先天至宝;

    if (treasure === '盘古幡' && !isPvpBattle) {
      opponent.防御 = Math.max(0, Math.floor((Number(opponent.防御) || 0) * 0.7));
      msg.push(`【盘古幡·破界】${holder.名号}无视了${opponent.名号}三成防御。`);
      if (await consumeAuthorityFlag(holder, '盘古开天待用')) {
        opponent.防御 = 0;
        const hpLossRate = isBossOpponent(opponent) ? 0.03 : 0.3;
        const hpLoss = Math.floor((Number(opponent.血量上限) || Number(opponent.当前血量) || 0) * hpLossRate);
        opponent.当前血量 = Math.max(1, opponent.当前血量 - hpLoss);
        msg.push(`【开天】盘古幡撕裂大道，${opponent.名号}防御归零，初始气血-${Math.round(hpLossRate * 100)}%。`);
      }
    }

    if (treasure === '诛仙四剑') {
      opponent._先天禁疗 = true;
      if (await consumeAuthorityFlag(holder, '诛仙剑阵待用')) {
        const sword = ['戮仙剑', '绝仙剑', '陷仙剑', '诛仙剑'][Math.floor(Math.random() * 4)];
        if (sword === '戮仙剑') opponent._诛仙易伤 = 0.5;
        if (sword === '绝仙剑') opponent._绝仙流血 = true;
        if (sword === '陷仙剑') opponent._陷仙沉默 = true;
        if (sword === '诛仙剑') {
          const damage = Math.floor((Number(holder.攻击) || 1) * (Number(holder.法球倍率) || 1) * 5);
          opponent.当前血量 = Math.max(0, opponent.当前血量 - damage);
          msg.push(`【诛仙剑】必中且无法防御的五倍神通贯穿${opponent.名号}，造成${bigNumberTransform(damage)}点伤害。`);
        }
        if (sword !== '诛仙剑') msg.push(`【诛仙剑阵·${sword}】剑阵开局权柄已降临。`);
      }
    }

    if (treasure === '东皇钟' && await consumeAuthorityFlag(holder, '东皇镇世待用')) {
      const boss = isBossOpponent(opponent);
      opponent._东皇冻结回合 = isPvpBattle || boss ? 1 : 3;
      if (boss) opponent.攻击 = Math.floor((Number(opponent.攻击) || 0) * 0.7);
      msg.push(boss
        ? `【东皇镇世】${opponent.名号}首回合被冻结，且攻击降低30%。`
        : `【东皇镇世】${opponent.名号}被东皇钟镇封${opponent._东皇冻结回合}回合。`);
    }

    if (treasure === '太极图') {
      if (holder.先天权柄?.太极模式 === '阳') holder.吸血率 = Math.max(Number(holder.吸血率) || 0, 0.5);
      if (await consumeAuthorityFlag(holder, '阴阳逆转待用')) {
        holder._阴阳逆转护命 = true;
        opponent._东皇冻结回合 = Math.max(Number(opponent._东皇冻结回合) || 0, 1);
        msg.push(`【阴阳逆转】${opponent.名号}开局被定住一回合，${holder.名号}获得一次致命伤害逆转。`);
      }
    }
  }

  if (A_player.当前先天至宝 === '六道轮回盘') B_speed = Math.max(1, Math.floor(B_speed * 0.8));
  if (B_player.当前先天至宝 === '六道轮回盘') A_speed = Math.max(1, Math.floor(A_speed * 0.8));
  await applyInnateBattleOpening(A_player, B_player);
  await applyInnateBattleOpening(B_player, A_player);

msg.push(`天地元气涌动，二人周身气势攀升，大战一触即发！`);
msg.push(`【天道法则】行动条满三千点方可出手，速度决定先机`);
msg.push(`【神通对轰】高速度可抢先出手，更有机会施展神通与对方对轰，占据主动！`);

let a玩家秘境加成 = A_player.mijinglevel_id * 50;
let b玩家秘境加成 = B_player.mijinglevel_id * 50;
let a玩家仙古加成 = A_player.xiangulevel_id * 50;
let b玩家仙古加成 = B_player.xiangulevel_id * 50;

// A 玩家速度文案
let aSpeedMsg = `${A_player.名号} 遁光速度：${A_speed}`;
if (a玩家秘境加成 > 0) {
  aSpeedMsg += `，秘境体系加成：${a玩家秘境加成}`;
}
if (a玩家仙古加成 > 0) {
  aSpeedMsg += `，仙古今世法加成：${a玩家仙古加成}`;
}
msg.push(aSpeedMsg);

// B 玩家速度文案
let bSpeedMsg = `${B_player.名号} 遁光速度：${B_speed}`;
if (b玩家秘境加成 > 0) {
  bSpeedMsg += `，秘境体系加成：${b玩家秘境加成}`;
}
if (b玩家仙古加成 > 0) {
  bSpeedMsg += `，仙古今世法加成：${b玩家仙古加成}`;
}
msg.push(bSpeedMsg);


  while (A_player.当前血量 > 0 && B_player.当前血量 > 0) {
    // 整场战斗回合上限保护（避免高回复/护盾循环长期占用进程）
    const MAX_ROUND = 100;
    if (cnt >= MAX_ROUND) {
      msg.push(`【天道法则】战局陷入僵持，已达${MAX_ROUND}回合上限，天道降下裁决！`);
      // 取血量较高者为胜方
      if (A_player.当前血量 > B_player.当前血量) {
        msg.push(`${A_player.名号}略占上风，险胜！`);
        B_player.当前血量 = 0;
      } else if (B_player.当前血量 > A_player.当前血量) {
        msg.push(`${B_player.名号}略占上风，险胜！`);
        A_player.当前血量 = 0;
      } else {
        msg.push(`双方战至力竭，平局收场！`);
        A_player.当前血量 = 0;
        B_player.当前血量 = 0;
      }
      break;
    }
    cnt2 = Math.trunc(cnt / 2);
    
    // ===== 推进行动条 =====
    let actionResult = null;
    let roundsAdvanced = 0;
    
    
    while (!actionResult) {
      roundsAdvanced++;
      actionResult = advanceActionBars();
      if (roundsAdvanced > 100) {
        msg.push(`天地元气紊乱，强制结束战斗！`);
        break;
      }
    }
    
    if (!actionResult) break;
    
    const { attacker, defender, attackerBar, defenderBar } = actionResult;
          // 每轮显示行动条状态
      const A_bar = Math.min(A_actionBar, ACTION_BAR_MAX);
      const B_bar = Math.min(B_actionBar, ACTION_BAR_MAX);
    msg.push(`${attacker.名号} 元气充盈，抢占先机！[${A_player.名号}:${A_bar}/${ACTION_BAR_MAX}] [${B_player.名号}:${B_bar}/${ACTION_BAR_MAX}]`);
    
    resetActionBar(attackerBar);

    if (attacker.当前先天至宝 === '六道轮回盘' && Math.random() < 0.2) {
      pushBackActionBar(defenderBar, Math.floor(ACTION_BAR_MAX * 0.2));
      msg.push(`【六道轮回盘】${defender.名号}的行动进度被推退20%。`);
    }
    
    actionOrder.push({
      round: cnt + 1,
      name: attacker.名号,
      actionBar: attacker === A_player ? A_actionBar : B_actionBar,
      opponentBar: defender === A_player ? A_actionBar : B_actionBar
    });

    if (attacker._绝仙流血) {
      const bleedDamage = Math.floor((Number(attacker.血量上限) || 0) * 0.2);
      attacker.当前血量 = Math.max(0, attacker.当前血量 - bleedDamage);
      msg.push(`【绝仙剑】${attacker.名号}本源流血，损失${bigNumberTransform(bleedDamage)}点生命。`);
      if (attacker.当前血量 <= 0) {
        const revival = checkRevival(attacker, 'main');
        if (revival.revived) msg.push(revival.message);
        else {
          msg.push(`${attacker.名号}被绝仙剑流血斩灭。`);
          break;
        }
      }
    }

    // 持续伤害在受影响角色自己的行动开始时结算。
    if (attacker.fumianhuihe > 0) {
      let effectMsg = "";
      switch (attacker.fumian_type) {
        case "太阴之力": effectMsg = "被太阴之力冰封，生机冻结，元神僵硬"; break;
        case "火焰风暴": effectMsg = "被火焰风暴席卷全身"; break;
        case "剧毒": effectMsg = "被剧毒侵蚀，五脏六腑如被腐蚀"; break;
        default: effectMsg = `受到${attacker.fumian_type}影响`;
      }
      
      attacker.当前血量 = Math.max(attacker.当前血量 - attacker.fumian_damage, 0);
      msg.push(`${attacker.名号}${effectMsg}，损失了${bigNumberTransform(attacker.fumian_damage)}点生命值！`);
      
      attacker.fumianhuihe--;
      if (attacker.fumianhuihe === 0) {
        msg.push(`${attacker.名号}身上的${attacker.fumian_type}效果消失了。`);
        attacker.fumian_type = null;
      }

      if (attacker.当前血量 <= 0) {
        const 复活结果 = checkRevival(attacker, "main");
        if (复活结果.revived) {
          msg.push(...(Array.isArray(复活结果.message) ? 复活结果.message : [复活结果.message]));
        } else {
          msg.push(`${attacker.名号}被持续伤害击溃！`);
          msg.push(`${defender.名号}击败了${attacker.名号}`);
          return build1v1BattleResult({
            battleEnded: true,
            winner: defender === A_player ? "A" : "B"
          });
        }
      }
    }

    // 免疫控制（保持原样）
    if (A_immune_control > 0) {
      A_immune_control--;
      const immuneType = A_immune_type || "涅槃真火护体";
      if (A_immune_control > 0) {
        msg.push(`${A_player.名号}的${immuneType}效果剩余${A_immune_control}回合`);
      }
    }
    if (B_immune_control > 0) {
      B_immune_control--;
      const immuneType = B_immune_type || "涅槃真火护体";
      if (B_immune_control > 0) {
        msg.push(`${B_player.名号}的${immuneType}效果剩余${B_immune_control}回合`);
      }
    }

    // 道种·厚土无敌 持续减伤回合递减（每回合末）
    for (const _p of [A_player, B_player]) {
      if (_p && _p._持续减伤回合 > 0) {
        _p._持续减伤回合--;
        if (_p._持续减伤回合 <= 0) {
          _p._持续减伤比例 = 0;
          msg.push(`${_p.名号}的「厚土无敌」大地之力渐渐消散。`);
        }
      }
    }

    // 检查冻结（保持原样）
    if (attacker.dongjie) {
      msg.push(`${attacker.名号}无法动弹！`);
      attacker.dongjie = false;
      cnt++;
      continue;
    }

    // ===== 执行攻击（保持原样） =====
    if (!attacker.dongjie) {
      // 木之本樱恢复
      if (attacker.灵根 && attacker.灵根.name === "木之本樱" && attacker.当前血量 < attacker.血量上限 && Math.random() < 0.55) {
        let 回复血量 = attacker.当前血量 * 0.3;
        attacker.当前血量 = Math.max(attacker.当前血量 + 回复血量, 0);
        msg.push(`${attacker.名号}拿出了爱牌，为自己回复了${bigNumberTransform(回复血量)}点生命,${attacker.名号}当前血量${bigNumberTransform(attacker.当前血量)}`);
      }

      // 小成圣体（保持原样）
      if (attacker.灵根?.type == "小成圣体") {
        if (Math.random() < 0.15) {
          msg.push(`${attacker.名号} 撑开了异象锦绣山河，一片不属于此界的天地山河浮现，山河领域笼罩自身，战力暴涨，举手投足间让宇宙中的日月星辰都与之共鸣，绽开无量神光`);
          attacker.当前血量 *= 1.5;
          attacker.防御 *= 1.5;
          attacker.攻击 *= 1.5;
          msg.push(`${attacker.名号}的攻击暴涨到了${bigNumberTransform(attacker.攻击)}，${attacker.名号}的防御暴涨到了${bigNumberTransform(attacker.防御)}，${attacker.名号}的生命暴涨到了${bigNumberTransform(attacker.当前血量)}`);
        }
        
        if (Math.random() < 0.25) {
          msg.push(`${attacker.名号} 演化出了阴阳生死图，虚空抖动，一副阐述阴阳生死大道的神图出现，天地间一瞬间只剩下了阴阳黑白鱼，其上散发出的威势让人心生绝望，似要破灭一切，重开此界`);
          
          let 伤害 = Harm(attacker.攻击 * 0.85, defender.防御);
          let 法球伤害 = Math.trunc(伤害 * attacker.法球倍率);
          伤害 = Math.trunc(1.5 * 法球伤害);
          
          defender.当前血量 -= 伤害;
          defender.当前血量 = Math.max(defender.当前血量, 0);
          
          msg.push(`${attacker.名号}催动阴阳生死图，撕开了天地混沌，轰杀向${defender.名号}，${defender.名号}损失了${bigNumberTransform(伤害)}生命，${defender.名号}剩余${bigNumberTransform(defender.当前血量)}生命`);
          
          if (defender.当前血量 <= 0) {
            const 复活结果 = checkRevival(defender, "main");
            if (复活结果.revived) {
              msg.push(复活结果.message);
            } else {
              msg.push(`${attacker.名号}击败了${defender.名号}`);
              return build1v1BattleResult({
                battleEnded: true,
                winner: attacker === A_player ? "A" : "B"
              });
            }
          }
        }

        if (Math.random() < 0.1) {
          msg.push(`${attacker.名号} 发动了异象仙王临九天，召出一道身影，那是另一个他自己，高坐九重天，身绕玄黄气，俯瞰天地间，如同一尊仙王出世，威震苍穹`);
          
          let 伤害 = Harm(attacker.攻击 * 0.85, defender.防御);
          let 法球伤害 = Math.trunc(伤害 * attacker.法球倍率);
          伤害 = Math.trunc(2 * 法球伤害);
          
          defender.当前血量 -= 伤害;
          defender.当前血量 = Math.max(defender.当前血量, 0);
          
          msg.push(`${attacker.名号} 的仙王分身对敌手打出恐怖一击后消散了，${defender.名号}损失了${bigNumberTransform(伤害)}生命，${defender.名号}剩余${bigNumberTransform(defender.当前血量)}生命`);
          
          if (defender.当前血量 <= 0) {
            const 复活结果 = checkRevival(defender, "main");
            if (复活结果.revived) {
              msg.push(复活结果.message);
            } else {
              msg.push(`${attacker.名号}击败了${defender.名号}`);
              return build1v1BattleResult({
                battleEnded: true,
                winner: attacker === A_player ? "A" : "B"
              });
            }
          }
        }
      }

      // ==================== 他化自在法·行者化身召唤 ====================
      if (!attacker.名号.includes('分身')) {
        // 他化自在法（等级化机制）
        if (attacker.学习的功法?.includes("【仙帝】他化自在法")) {
          const levelConfig = getTahuaLevelConfig(attacker.mijinglevel_id);
          const isA = attacker === A_player;
          const tahuaEntities = isA ? A_tahua_entities : B_tahua_entities;
          const isTriggered = isA ? A_tahua_triggered : B_tahua_triggered;
          
          if (levelConfig && !isTriggered && Math.random() < levelConfig.triggerChance) {
            const activeCount = tahuaEntities.filter(e => e.当前血量 > 0).length;
            const canSummon = levelConfig.maxActive - activeCount;
            
            if (canSummon > 0) {
              const summonCount = Math.min(
                Math.floor(Math.random() * (levelConfig.maxCount - levelConfig.minCount + 1)) + levelConfig.minCount,
                canSummon
              );
              
              msg.push(`≡ ${attacker.名号}低喝一声「他化自在，他化万古」！时间长河为之震颤，掀起滔天巨浪！`);
              
              const usedTypes = tahuaEntities.filter(e => e.当前血量 > 0).map(e => e._tahua_type);
              const availableAvatars = TAHUA_AVATARS.filter(a => !usedTypes.includes(a.id));
              const shuffled = availableAvatars.sort(() => Math.random() - 0.5);
              const selectedAvatars = shuffled.slice(0, summonCount);
              
              for (const avatar of selectedAvatars) {
                const entity = JSON.parse(JSON.stringify(attacker));
                entity.名号 = `${attacker.名号}·他化自在身(${avatar.name})`;
                entity._tahua_type = avatar.id;
                entity._tahua_duration = levelConfig.duration;
                entity._tahua_master = isA ? "A" : "B";
                entity.avatarSkill = { ...avatar };
                entity.当前血量 = entity.血量上限;
                
                if (isA) {
                  A_tahua_entities.push(entity);
                } else {
                  B_tahua_entities.push(entity);
                }
                
                msg.push(`时间长河中踏出一道伟岸身影——${avatar.name}降临！`);
                msg.push(`${avatar.name}眸绽冷电，睥睨万古：「${avatar.desc}」`);
                
                const avatarDmg = Math.trunc(entity.攻击 * avatar.beilv * (0.8 + Math.random() * 0.4));
                defender.当前血量 -= avatarDmg;
                defender.当前血量 = Math.max(defender.当前血量, 0);
                
                msg.push(`${avatar.name}施展「${avatar.skill}」！${avatar.msg1}`);
                msg.push(`${avatar.msg2}，造成${bigNumberTransform(avatarDmg)}点伤害！`);
                msg.push(`${defender.名号}剩余血量：${bigNumberTransform(defender.当前血量)}`);
                
                if (avatar.special.includes("禁锢") || avatar.special.includes("麻痹")) {
                  defender.dongjie = true;
                  msg.push(`${defender.名号}被${avatar.name}的力量禁锢，无法行动！`);
                }
                
                if (defender.当前血量 <= 0) {
                  const 复活结果 = checkRevival(defender, "main");
                  if (复活结果.revived) {
                    msg.push(复活结果.message);
                    continue;
                  } else {
                    msg.push(`${attacker.名号}击败了${defender.名号}`);
                    return build1v1BattleResult({
                      battleEnded: true,
                      winner: attacker === A_player ? "A" : "B"
                    });
                  }
                }
              }
              
              if (isA) A_tahua_triggered = true;
              else B_tahua_triggered = true;
              
              if (levelConfig.duration > 0) {
                msg.push(`${attacker.名号}的他化自在身可存在${levelConfig.duration}回合`);
              } else {
                const currentCount = tahuaEntities.filter(e => e.当前血量 > 0).length;
                msg.push(`${attacker.名号}的他化自在身永驻战场，直至被击杀！【${currentCount}/${levelConfig.maxActive}】`);
              }
            }
          }
        }
        // 一气化三清（保持独立机制，加入同一实体数组）
        else if (attacker.学习的功法?.includes("一气化三清") && Math.random() < 0.9) {
          const entity = JSON.parse(JSON.stringify(attacker));
          entity.名号 = `${attacker.名号}·道身`;
          entity.攻击 = Math.trunc(entity.攻击 * 0.6);
          entity.防御 = Math.trunc(entity.防御 * 0.6);
          entity._tahua_type = "yiqihua";
          entity._tahua_duration = 4;
          entity._tahua_master = attacker === A_player ? "A" : "B";
          entity.avatarSkill = null;
          entity.当前血量 = entity.血量上限;
          
          if (attacker === A_player) {
            A_tahua_entities.push(entity);
          } else {
            B_tahua_entities.push(entity);
          }
          
          msg.push(`${attacker.名号}施展「一气化三清」，三花聚顶凝聚出道身！`);
        }
      }

      // 防御者他化自在法（等级化机制）
      if (defender && !defender.名号?.includes('分身') && 
          defender.学习的功法?.includes("【仙帝】他化自在法")) {
        const defLevelConfig = getTahuaLevelConfig(defender.mijinglevel_id);
        const isDefA = defender === A_player;
        const defTahuaEntities = isDefA ? A_tahua_entities : B_tahua_entities;
        const defIsTriggered = isDefA ? A_tahua_triggered : B_tahua_triggered;
        
        if (defLevelConfig && !defIsTriggered && Math.random() < defLevelConfig.triggerChance) {
          const activeCount = defTahuaEntities.filter(e => e.当前血量 > 0).length;
          const canSummon = defLevelConfig.maxActive - activeCount;
          
          if (canSummon > 0) {
            const summonCount = Math.min(
              Math.floor(Math.random() * (defLevelConfig.maxCount - defLevelConfig.minCount + 1)) + defLevelConfig.minCount,
              canSummon
            );
            
            msg.push(`≡ ${defender.名号}暴喝道「他化自在，他化万古」！时间长河为之震颤，掀起滔天巨浪！`);
            
            const usedTypes = defTahuaEntities.filter(e => e.当前血量 > 0).map(e => e._tahua_type);
            const availableAvatars = TAHUA_AVATARS.filter(a => !usedTypes.includes(a.id));
            const shuffled = availableAvatars.sort(() => Math.random() - 0.5);
            const selectedAvatars = shuffled.slice(0, summonCount);
            
            for (const avatar of selectedAvatars) {
              const entity = JSON.parse(JSON.stringify(defender));
              entity.名号 = `${defender.名号}·他化自在身(${avatar.name})`;
              entity._tahua_type = avatar.id;
              entity._tahua_duration = defLevelConfig.duration;
              entity._tahua_master = isDefA ? "A" : "B";
              entity.avatarSkill = { ...avatar };
              entity.当前血量 = entity.血量上限;
              
              if (isDefA) {
                A_tahua_entities.push(entity);
              } else {
                B_tahua_entities.push(entity);
              }
              
              msg.push(`时间长河中踏出一道伟岸身影——${avatar.name}降临！`);
              msg.push(`${avatar.name}眸绽冷电，睥睨万古：「${avatar.desc}」`);
              
              const avatarDmg = Math.trunc(entity.攻击 * avatar.beilv * (0.8 + Math.random() * 0.4));
              attacker.当前血量 -= avatarDmg;
              attacker.当前血量 = Math.max(attacker.当前血量, 0);
              
              msg.push(`${avatar.name}施展「${avatar.skill}」！${avatar.msg1}`);
              msg.push(`${avatar.msg2}，造成${bigNumberTransform(avatarDmg)}点伤害！`);
              msg.push(`${attacker.名号}剩余血量：${bigNumberTransform(attacker.当前血量)}`);
              
              if (avatar.special.includes("禁锢") || avatar.special.includes("麻痹")) {
                attacker.dongjie = true;
                msg.push(`${attacker.名号}被${avatar.name}的力量禁锢，无法行动！`);
              }
              
              if (attacker.当前血量 <= 0) {
                const 复活结果 = checkRevival(attacker, "main");
                if (复活结果.revived) {
                  msg.push(复活结果.message);
                  continue;
                } else {
                  msg.push(`${defender.名号}击败了${attacker.名号}`);
                  return build1v1BattleResult({
                    battleEnded: true,
                    winner: defender === A_player ? "A" : "B"
                  });
                }
              }
            }
            
            if (isDefA) A_tahua_triggered = true;
            else B_tahua_triggered = true;
            
            if (defLevelConfig.duration > 0) {
              msg.push(`${defender.名号}的他化自在身可存在${defLevelConfig.duration}回合`);
            } else {
              msg.push(`${defender.名号}的他化自在身永驻战场，直至被击杀！`);
            }
          }
        }
      }

      // 主要攻击（保持原样）
      const attackResult = await performAttack(attacker, defender, cnt2, "main");
      let { 伤害 = 0, isCritical = false, baoji = 1, battleEnded: attackBattleEnded = false, winner: attackWinner = null, 斩杀阈值 = 0 } = attackResult || {};
      if (attackBattleEnded) {
        msg.push(...((attackResult && attackResult.msg) || []));
        return build1v1BattleResult({ battleEnded: true, winner: attackWinner });
      }
      // 仙气压制：攻击方每多一道仙气，对少一道者伤害+30%（完美世界·石昊三道仙气）
      const xianqiMul = calcXianqiSuppressMul(attacker, defender);
      if (xianqiMul > 1) {
        伤害 = Math.trunc(伤害 * xianqiMul);
        msg.push(`【仙气压制】${attacker.名号}仙气加身，碾压${defender.名号}，本击伤害 ×${xianqiMul.toFixed(2)}！`);
      }
      if (defender._诛仙易伤 > 0) 伤害 = Math.floor(伤害 * (1 + defender._诛仙易伤));
      const { actual_damage, fenshen_blocked } = applyDamage(defender, 伤害, "main", attacker);
      // 吸血（批次1：基于实际造成伤害回复，封顶血量上限）
      if (!attacker._先天禁疗 && attacker.吸血率 > 0 && actual_damage > 0) {
        const _heal = Math.trunc(actual_damage * attacker.吸血率);
        const _max = attacker.血量上限 || attacker.当前血量;
        attacker.当前血量 = Math.min(attacker.当前血量 + _heal, _max);
        msg.push(`${attacker.名号}汲取了${bigNumberTransform(_heal)}点生命！`);
      }
      const attack_msg = createCombatMessage(cnt, attacker, defender, 伤害, actual_damage, isCritical, fenshen_blocked);
      msg.push(attack_msg);

      if (
        attacker.当前先天至宝 === '诛仙四剑' &&
        defender.当前血量 > 0 &&
        defender.当前血量 < defender.血量上限 * 0.25
      ) {
        defender.当前血量 = 0;
        msg.push(`【诛仙斩命】${defender.名号}气血低于25%，本源被诛仙四剑直接斩灭！`);
      }

      // —— 草字剑诀·斩真我：命中后残血斩杀 ——
      if (斩杀阈值 > 0 && defender.当前血量 > 0 && defender.当前血量 <= 斩杀阈值 * defender.血量上限) {
        defender.当前血量 = 0;
        msg.push(`${attacker.名号}一剑「草字剑诀」斩落真我，${defender.名号}气血已衰竭至极，本源被当场斩断！`);
      }

      // 者字秘恢复（保持原样）
      if (!attacker._先天禁疗 && attacker.学习的功法?.some(gongfa => huifu.includes(gongfa))) {
        const 最大血量 = attacker.血量上限;
        const 恢复量 = Math.trunc(最大血量 * 0.1);
        if (attacker.当前血量 < 最大血量) {
          attacker.当前血量 = Math.min(attacker.当前血量 + 恢复量, 最大血量);
          msg.push(`${attacker.名号}周身泛起赤色霞光，「者字秘」燃烧生命精气，恢复${bigNumberTransform(恢复量)}点气血！`);
        }
      }

      // 检查复活（保持原样）
      const 复活结果 = checkRevival(defender, "main");
      if (复活结果.revived) {
        msg.push(复活结果.message);
      }
    }

    // 分身协同攻击（保持原样）
    if (attacker.分身 && attacker.分身.length > 0) {
      for (const fenshen of attacker.分身) {
        if (fenshen.当前血量 > 0) {
          const { 伤害: fenshen_damage } = await performAttack(fenshen, defender, cnt2, "fenshen");
          const { actual_damage } = applyDamage(defender, fenshen_damage, "fenshen", fenshen);
          
          msg.push(`${fenshen.名号}拉弓凝聚虹光，`);
          msg.push(`造成${bigNumberTransform(actual_damage)}点协同伤害`);
        }
      }
    }

    // ==================== 他化自在身独立攻击（统一攻守，消除对称重复） ====================
    // 抽象后：任一方的化身攻击任一方，都走同一段逻辑
    async function processTahuaAttack(entities, target, winner) {
      for (const entity of entities.filter(e => e.当前血量 > 0)) {
        if (entity.avatarSkill) {
          const avatar = entity.avatarSkill;
          const entityDmg = Math.trunc(entity.攻击 * avatar.beilv * (0.8 + Math.random() * 0.4));
          target.当前血量 -= entityDmg;
          target.当前血量 = Math.max(target.当前血量, 0);

          msg.push(`${entity.名号}施展「${avatar.skill}」攻击${target.名号}！`);
          if (avatar.special.includes("禁锢") || avatar.special.includes("麻痹")) {
            target.dongjie = true;
            msg.push(`${target.名号}被${avatar.name}的力量禁锢！`);
          }
          msg.push(`造成${bigNumberTransform(entityDmg)}点伤害，${target.名号}剩余${bigNumberTransform(target.当前血量)}`);
        } else {
          const { 伤害: entityDmg } = await performAttack(entity, target, cnt2, "fenshen");
          const { actual_damage } = applyDamage(target, entityDmg, "fenshen", entity);
          msg.push(`${entity.名号}发动攻击，对${target.名号}造成${bigNumberTransform(actual_damage)}伤害`);
        }

        if (target.当前血量 <= 0) {
          const rev = checkRevival(target, "main");
          if (!rev.revived) {
            return { battleEnded: true, winner };
          }
          msg.push(rev.message);
        }
      }
      return null;
    }

    // A 化身打 B
    const aResult = await processTahuaAttack(A_tahua_entities, B_player, "A");
    if (aResult) return build1v1BattleResult(aResult);

    // B 化身打 A
    const bResult = await processTahuaAttack(B_tahua_entities, A_player, "B");
    if (bResult) return build1v1BattleResult(bResult);

    // ==================== 他化自在身持续时间处理 ====================
    for (const entity of A_tahua_entities) {
      if (entity._tahua_duration > 0) entity._tahua_duration--;
    }
    for (const entity of B_tahua_entities) {
      if (entity._tahua_duration > 0) entity._tahua_duration--;
    }

    // ==================== 他化自在身消散 ====================
    for (const entity of [...A_tahua_entities]) {
      if (entity.当前血量 > 0 && entity._tahua_duration === 0) {
        if (entity._tahua_type === "yiqihua") {
          msg.push(`${entity.名号}化作一缕清气，重归天地之间！`);
        } else {
          msg.push(`${entity.名号}持续时间结束，伟岸身影渐趋虚淡，回归时间长河...`);
        }
      }
    }
    A_tahua_entities = A_tahua_entities.filter(e => e.当前血量 <= 0 || e._tahua_duration !== 0);

    for (const entity of [...B_tahua_entities]) {
      if (entity.当前血量 > 0 && entity._tahua_duration === 0) {
        if (entity._tahua_type === "yiqihua") {
          msg.push(`${entity.名号}化作一缕清气，重归天地之间！`);
        } else {
          msg.push(`${entity.名号}持续时间结束，伟岸身影渐趋虚淡，回归时间长河...`);
        }
      }
    }
    B_tahua_entities = B_tahua_entities.filter(e => e.当前血量 <= 0 || e._tahua_duration !== 0);

    cnt++;
  }


  
  if (B_player.当前血量 <= 0) {
    msg.push(`${AA_player.名号}击败了${BB_player.名号}`);
  } else if (A_player.当前血量 <= 0) {
    msg.push(`${BB_player.名号}击败了${AA_player.名号}`);
  }

  return build1v1BattleResult();
}


// ==================== 团战/群殴/被群殴 战斗逻辑 ====================
async function zd_battle_team(A_team, B_team, options = {}) {
  const ACTION_BAR_MAX = 3000;
  let msg = [];
  let cnt = 0;

  // 初始化所有参战单位
  const allUnits = [];

  // 团队状态追踪
  // P3-1: 临字秘状态打包为对象（与 1v1 一致）
  const linziState = { A_触发: false, B_触发: false, A_加成: 0, B_加成: 0 };
  let A_帝兵触发 = false;
  let B_帝兵触发 = false;
  let 轮回诸天拳触发 = false;
  let 命运神道体触发 = {};

  function initTeam(team, teamName) {
    for (let p of team) {
      p._team = teamName;
      p._actionBar = 0;
      p._speed = (p.速度 ?? 100) + (p.mijinglevel_id ?? 0) * 50 + (p.xiangulevel_id ?? 0) * 50;
      p._speedBoost = 1.0;
      p._fumianhuihe = 0;
      p._fumian_damage = 0;
      p._fumian_type = null;
      p._revived = false;
      p._immune_control = 0;
      p._immune_type = null;
      p._fenshen = null;
      p._fenshen_duration = 0;
      p._护盾值 = p.护盾值 || 0;
      p._减伤比例 = p._减伤比例 || 0;
      p._反弹比例 = 0;
      p.dongjie = p.dongjie || false;
      p.皆字秘触发 = false;
      p.圆环之理激活 = false;
      p.分身 = p.分身 || [];
      allUnits.push(p);
    }
  }

  initTeam(A_team, 'A');
  initTeam(B_team, 'B');

  async function consumeTeamAuthority(holder, flag) {
    if (!holder?.先天权柄?.[flag]) return false;
    delete holder.先天权柄[flag];
    const sources = holder._team === 'A' ? options._sourceATeam : options._sourceBTeam;
    const source = sources?.find(unit => String(unit?.id || unit?.名号) === String(holder?.id || holder?.名号));
    if (source?.先天权柄) delete source.先天权柄[flag];
    if (holder.id) {
      try {
        const stored = await Read_player(holder.id);
        if (stored?.先天权柄) delete stored.先天权柄[flag];
        await Write_player(holder.id, stored);
      } catch (error) {
        console.error(`[先天至宝] 团队战权柄消耗失败 player=${holder.id}`, error?.message);
      }
    }
    return true;
  }

  async function applyTeamInnateOpening(holder, enemies) {
    if (holder.当前先天至宝 === '盘古幡') {
      for (const enemy of enemies) enemy.防御 = Math.floor((Number(enemy.防御) || 0) * 0.7);
      if (await consumeTeamAuthority(holder, '盘古开天待用')) {
        for (const enemy of enemies) {
          enemy.防御 = 0;
          const boss = enemy.boss === true || enemy.type === 'boss' || /BOSS|Boss|首领|天骄/.test(String(enemy.名号 || ''));
          const maxHp = Number(enemy.血量上限) || Number(enemy.当前血量) || 1;
          enemy.当前血量 = Math.max(1, enemy.当前血量 - Math.floor(maxHp * (boss ? 0.03 : 0.3)));
        }
        msg.push(`【开天】${holder.名号}令敌方全体防御归零，并斩去初始气血。`);
      }
    }
    if (holder.当前先天至宝 === '诛仙四剑') {
      for (const enemy of enemies) enemy._先天禁疗 = true;
      if (await consumeTeamAuthority(holder, '诛仙剑阵待用')) {
        const sword = ['戮仙剑', '绝仙剑', '陷仙剑', '诛仙剑'][Math.floor(Math.random() * 4)];
        for (const enemy of enemies) {
          if (sword === '戮仙剑') enemy._诛仙易伤 = 0.5;
          if (sword === '绝仙剑') enemy._绝仙流血 = true;
          if (sword === '陷仙剑') enemy._陷仙沉默 = true;
          if (sword === '诛仙剑') enemy.当前血量 = Math.max(0, enemy.当前血量 - Math.floor(holder.攻击 * (holder.法球倍率 || 1) * 5));
        }
        msg.push(`【诛仙剑阵·${sword}】剑阵笼罩敌方全体。`);
      }
    }
    if (holder.当前先天至宝 === '东皇钟' && await consumeTeamAuthority(holder, '东皇镇世待用')) {
      for (const enemy of enemies) {
        const boss = enemy.boss === true || enemy.type === 'boss' || /BOSS|Boss|首领|天骄/.test(String(enemy.名号 || ''));
        enemy._东皇冻结回合 = boss ? 1 : 3;
        if (boss) enemy.攻击 = Math.floor((Number(enemy.攻击) || 0) * 0.7);
      }
      msg.push(`【东皇镇世】敌方全体被镇封，首领攻击同时受到压制。`);
    }
    if (holder.当前先天至宝 === '太极图' && holder.先天权柄?.太极模式 === '阳') {
      holder.吸血率 = Math.max(Number(holder.吸血率) || 0, 0.5);
    }
    if (holder.当前先天至宝 === '太极图' && await consumeTeamAuthority(holder, '阴阳逆转待用')) {
      holder._阴阳逆转护命 = true;
      for (const enemy of enemies) enemy.dongjie = true;
      msg.push(`【阴阳逆转】敌方全体开局被定住，${holder.名号}获得一次致命伤害逆转。`);
    }
  }

  for (const holder of A_team) await applyTeamInnateOpening(holder, B_team);
  for (const holder of B_team) await applyTeamInnateOpening(holder, A_team);

  if (A_team.some(unit => unit.当前先天至宝 === '六道轮回盘')) {
    for (const unit of B_team) unit._speed = Math.max(1, Math.floor(unit._speed * 0.8));
  }
  if (B_team.some(unit => unit.当前先天至宝 === '六道轮回盘')) {
    for (const unit of A_team) unit._speed = Math.max(1, Math.floor(unit._speed * 0.8));
  }

  msg.push(`≡≡≡ 群战开启 ≡≡≡`);
  msg.push(`【${A_team.map(p => p.名号).join('、')}】 VS 【${B_team.map(p => p.名号).join('、')}】`);
  msg.push(`【天道法则】行动条满三千点方可出手，速度决定先机`);

  // 展示速度
  for (let p of allUnits) {
    let speedMsg = `${p.名号} 遁光速度：${p._speed}`;
    let mijing = (p.mijinglevel_id ?? 0) * 50;
    let xiangu = (p.xiangulevel_id ?? 0) * 50;
    if (mijing > 0) speedMsg += `，秘境体系加成：${mijing}`;
    if (xiangu > 0) speedMsg += `，仙古今世法加成：${xiangu}`;
    msg.push(speedMsg);
  }

  // 获取敌方存活单位
  function getAliveEnemies(unit) {
    return unit._team === 'A' ? B_team.filter(p => p.当前血量 > 0) : A_team.filter(p => p.当前血量 > 0);
  }

  // 检查队伍存活
  function isTeamAlive(team) {
    return team.some(p => p.当前血量 > 0);
  }

  // ====== 团队版控制效果处理 ======
  function handleTeamControlEffects(attacker, defender, round, attackMsgs) {
    const isA = attacker._team === 'A';
    
    // 仙帝领域效果
    if (attacker.mijinglevel_id > 19 && defender.mijinglevel_id < 20) {
      if (attacker.mijinglevel_id - defender.mijinglevel_id >= 2) {
        let 夺取攻击 = Math.floor(defender.攻击 * 0.5);
        let 夺取防御 = Math.floor(defender.防御 * 0.5);
        let 夺取血量 = Math.floor(defender.当前血量 * 0.5);
        
        defender.攻击 = Math.max(defender.攻击 - 夺取攻击, 0);
        defender.防御 = Math.max(defender.防御 - 夺取防御, 0);
        defender.当前血量 = Math.max(defender.当前血量 - 夺取血量, 0);
        attackMsgs.push(`${defender.名号}受到帝之场域压制，一身战力被削去十之五六!`);
      }
    }
    
    // 秘境压制冻结
    if (attacker.mijinglevel_id > 19 && defender.mijinglevel_id < 20 && Math.random() < 0.99) {
      const isImmune = defender._immune_control > 0;
      
      if (isImmune) {
        if (attacker.mijinglevel_id - defender.mijinglevel_id >= 2) {
          defender.dongjie = true;
          attackMsgs.push(`${attacker.名号}周身仙光亿万缕，大道符文压盖诸天！`);
          attackMsgs.push(`${defender.名号}的涅槃真火在绝对实力差距下黯然熄灭！`);
        }
      } else {
        defender.dongjie = true;
        attackMsgs.push(`${attacker.名号}身上散发出超越诸天极限的气息，一缕眸光压塌万古！`);
        attackMsgs.push(`${defender.名号}的身躯与神魂被永恒禁锢！`);
      }
    }

    // 命运神道体反击
    if (defender.灵根 && defender.灵根.name === "命运神道体" && Math.random() > 0.7) {
      const uid = defender.id || defender.名号;
      if (!命运神道体触发[uid]) {
        attacker.dongjie = true;
        attackMsgs.push(`${defender.名号}推开了命运生死轮盘，${attacker.名号}被命运之力禁锢了！`);
        
        if (Math.random() > 0.01) {
          let 回复血量 = defender.当前血量 * 0.5;
          defender.当前血量 = Math.max(defender.当前血量 + 回复血量, 0);
          attackMsgs.push(`${defender.名号}生命回复${bigNumberTransform(回复血量)}点`);
        }
        命运神道体触发[uid] = true;
      }
    }

    // P3-2: 九秘触发改用共享函数（消除 60+ 行重复代码）
    tryJieziMijue(attacker, attackMsgs);
    tryLinzMijue(attacker, defender, attackMsgs, linziState, isA);
  }

  // ====== 团队版帝兵处理 ======
  async function handleTeamEmperorWeapon(attacker, defender, attackMsgs) {
    const isA = attacker._team === 'A';
    const 帝兵已触发 = isA ? A_帝兵触发 : B_帝兵触发;
    
    if (帝兵已触发 || !isNotNull(attacker.id) || !isNotNull(defender.id)) return false;
    
    try {
      const equipment = await Read_equipment(attacker.id);
      const DI_BING_RANKS = ["雏形", "通灵", "铭刻道与理", "斩道王兵", "圣兵", "准帝兵", "极道帝兵", "仙器", "仙王器", "准仙帝器", "仙帝器", "祭道器"];
      
      if (!equipment.帝兵 || equipment.帝兵.author_name !== attacker.id || 
          DI_BING_RANKS.indexOf(equipment.帝兵.品阶) < DI_BING_RANKS.indexOf("极道帝兵")) {
        return false;
      }
      
      // 帝兵属性加成（一次性，乘 0.5 不再叠加，与 1v1 P0-3 保持一致防指数膨胀）
      const 攻击加成 = Math.trunc(0.5 * attacker.攻击);
      const 血量加成 = Math.trunc(0.5 * attacker.血量上限);
      const 防御加成 = Math.trunc(0.5 * attacker.防御);
      
      attacker.攻击 += 攻击加成;
      attacker.血量上限 += 血量加成;
      attacker.防御 += 防御加成;
      
      let 帝兵描述 = "";
      switch(equipment.帝兵.品阶) {
        case "极道帝兵": 帝兵描述 = "极道帝威席卷九天十地！"; break;
        case "仙器": 帝兵描述 = "仙光璀璨，照耀万古！"; break;
        case "仙王器": 帝兵描述 = "仙王法则交织，时间长河为之倒流！"; break;
        case "仙帝器": 帝兵描述 = "帝威浩荡，镇压万古轮回！"; break;
        default: 帝兵描述 = "帝兵复苏，威压震古烁今！";
      }
      
      attackMsgs.push(`轰隆！${equipment.帝兵.name}突然复苏，${帝兵描述}`);
      attackMsgs.push(`「我为天帝，当镇压世间一切敌！」${attacker.名号}长啸！`);
      attackMsgs.push(`攻击增加：${bigNumberTransform(攻击加成)}，血量增加：${bigNumberTransform(血量加成)}，防御增加：${bigNumberTransform(防御加成)}`);
      
      if (isA) A_帝兵触发 = true;
      else B_帝兵触发 = true;
      
      // 特殊帝兵效果
      if (equipment.帝兵.主材料 === "万物母气") {
        defender.dongjie = true;
        attackMsgs.push(`玄黄垂落，${defender.名号}如陷泥沼！`);
      }
      
      if (equipment.帝兵.name === "无始钟") {
        attackMsgs.push(`钟声悠悠，${defender.名号}周身时光碎片飞舞！`);
        defender.当前血量 = Math.max(defender.当前血量 * 0.7, 0);
      } else if (equipment.帝兵.name === "吞天魔罐") {
        const 吞噬伤害 = Math.trunc(defender.当前血量 * 0.2);
        defender.当前血量 -= 吞噬伤害;
        attacker.当前血量 += 吞噬伤害;
        attackMsgs.push(`魔罐吞天，${defender.名号}被吞噬${bigNumberTransform(吞噬伤害)}点生命！`);
      }
      
      return true;
    } catch (err) {
      return false;
    }
  }

  // ====== 团队版轮回诸天拳 ======
  function handleTeam轮回诸天拳(attacker, defender, attackMsgs) {
    if (轮回诸天拳触发 || !attacker.灵根 || attacker.灵根.name !== "彼岸·命运神道体") return false;
    
    if (Math.random() > 0.01) {
      defender.dongjie = true;
      attackMsgs.push(`所有法，所有名，所有往来朝夕皆如土！`);
      attackMsgs.push(`${attacker.名号}身与魂轮回诸天归来，端坐九重天上！`);
      attackMsgs.push(`${defender.名号}被恐怖的神意压制无法动弹！`);
      
      if (Math.random() > 0.01) {
        let 夺取比例 = 0.5;
        let 夺取攻击 = Math.floor(defender.攻击 * 夺取比例);
        let 夺取防御 = Math.floor(defender.防御 * 夺取比例);
        let 夺取血量 = Math.floor(defender.当前血量 * 夺取比例);
        
        defender.攻击 = Math.max(defender.攻击 - 夺取攻击, 0);
        defender.防御 = Math.max(defender.防御 - 夺取防御, 0);
        defender.当前血量 = Math.max(defender.当前血量 - 夺取血量, 0);
        
        attackMsgs.push(`${defender.名号}受到诸天生死轮盘压制！`);
        attackMsgs.push(`攻击-${bigNumberTransform(夺取攻击)}，防御-${bigNumberTransform(夺取防御)}，生命-${bigNumberTransform(夺取血量)}`);
        
        let 终焉伤害 = Math.floor(夺取攻击 + 夺取防御 + 夺取血量) + attacker.攻击 * 100;
        defender.当前血量 = Math.max(defender.当前血量 - 终焉伤害, 0);
        attackMsgs.push(`${attacker.名号}断喝一声，递出恐怖一拳！`);
        attackMsgs.push(`${defender.名号}被打的当空炸开，失去了${bigNumberTransform(终焉伤害)}生命！`);
        
        if (defender.当前血量 <= 0) {
          const canRevive = defender.学习的功法?.some(gongfa => ["涅槃仙功", "圆神"].includes(gongfa)) && !defender._revived;
          if (canRevive) {
            // P0-3: 可复活时返回 false（不结束战斗），血量已为 0，由主循环统一调用 checkTeamRevival
            // 不标记 轮回诸天拳触发，让 checkTeamRevival 有机会工作
            return false;
          }
          轮回诸天拳触发 = true;
          return { battleEnded: true, winner: attacker._team };
        }
      }
      轮回诸天拳触发 = true;
    }
    return false;
  }

  // 简化的团队版攻击
  async function performTeamAttack(attacker, defender, round, allEnemies) {
    const attackMsgs = [];
    const isA = attacker._team === 'A';
    const 临字秘加成 = isA ? linziState.A_加成 : linziState.B_加成;

    if (Number(attacker._东皇冻结回合) > 0) {
      attacker._东皇冻结回合--;
      attackMsgs.push(`${attacker.名号}被东皇钟镇封，无法行动！`);
      return { msgs: attackMsgs, damage: 0, killed: false, aoeKilled: [] };
    }
    const innateSilenced = attacker._陷仙沉默 && Math.random() < 0.3;
    if (innateSilenced) attackMsgs.push(`【陷仙剑】${attacker.名号}神通被沉默，本回合只能进行普通攻击。`);

    if (attacker.dongjie) {
      if (attacker._immune_control > 0) {
        attacker.dongjie = false;
        const immuneType = attacker._immune_type || "涅槃真火护体";
        attackMsgs.push(`${attacker.名号}的${immuneType}效果免疫了冻结状态！`);
      } else {
        attackMsgs.push(`${attacker.名号}无法动弹！`);
        attacker.dongjie = false;
        return { msgs: attackMsgs, damage: 0, killed: false, aoeKilled: [] };
      }
    }

    // —— 道种·治疗技：回合起手持续回血（生生不息/乙木逢春）——
    if (attacker.xiangu_shenhuo && attacker.xiangu_shenhuo.专属技能) {
      const 治疗条目 = getSeedSkillEntry(attacker.xiangu_shenhuo.专属技能);
      if (!attacker._先天禁疗 && 治疗条目 && 治疗条目.技能分类 === '治疗' && 治疗条目.回复比例 && attacker.当前血量 < attacker.血量上限) {
        const 回血量 = Math.trunc(attacker.血量上限 * 治疗条目.回复比例 * (1 + (attacker.治疗效果加成 || 0)));
        if (回血量 > 0) {
          const _before = attacker.当前血量;
          attacker.当前血量 = Math.min(attacker.当前血量 + 回血量, attacker.血量上限);
          const _实际 = attacker.当前血量 - _before;
          if (_实际 > 0) attackMsgs.push(`${attacker.名号}的「${治疗条目.name}」道种生机涌动，气血自愈，恢复${bigNumberTransform(_实际)}点生命！`);
        }
      }
    }

    if (!innateSilenced) {
      // 帝之场域 + 九秘 + 命运神道体
      handleTeamControlEffects(attacker, defender, round, attackMsgs);

      // 帝兵处理
      await handleTeamEmperorWeapon(attacker, defender, attackMsgs);

      // 轮回诸天拳
      const 轮回结果 = handleTeam轮回诸天拳(attacker, defender, attackMsgs);
      if (轮回结果?.battleEnded) {
        return { msgs: attackMsgs, damage: 0, killed: true, aoeKilled: [], battleEnded: true, winner: 轮回结果.winner };
      }
    }

    let baoji = baojishanghai(attacker.暴击率, attacker.暴击伤害);
    if (临字秘加成 > 0) baoji = Math.min(baoji + 临字秘加成, 5);
    let isCritical = baoji > 1;

    // 小成圣体特殊处理
    if (attacker.灵根?.type == "小成圣体") {
      if (Math.random() < 0.15) {
        attackMsgs.push(`${attacker.名号}撑开了异象锦绣山河！`);
        attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.5);
        attacker.防御 = Math.trunc(attacker.防御 * 1.5);
        attacker.攻击 = Math.trunc(attacker.攻击 * 1.5);
      }
      if (Math.random() < 0.25) {
        let 伤害 = Harm(attacker.攻击 * 0.85, defender.防御);
        let 法球伤害 = Math.trunc(伤害 * attacker.法球倍率);
        伤害 = Math.trunc(1.5 * 法球伤害);
        defender.当前血量 -= 伤害;
        attackMsgs.push(`${attacker.名号}演化阴阳生死图，撕开了天地混沌！`);
        attackMsgs.push(`${defender.名号}损失了${bigNumberTransform(伤害)}生命`);
        if (defender.当前血量 <= 0) {
          return { msgs: attackMsgs, damage: 伤害, killed: true, aoeKilled: [] };
        }
      }
    }

    // 大成圣体异象
    if (attacker.灵根?.type == "大成圣体") {
      if (Math.random() < 0.3) {
        attacker.攻击 = Math.trunc(attacker.攻击 * 3);
        attackMsgs.push(`${attacker.名号}九大异象齐开，九尊仙王虚影浮现！`);
      }
    }

    // 混沌体
    if (attacker.灵根?.type == "混沌体") {
      if (Math.random() < 0.4) {
        attacker.攻击 = Math.trunc(attacker.攻击 * 2);
        attacker.防御 = Math.trunc(attacker.防御 * 2);
        attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.5);
        attackMsgs.push(`${attacker.名号}混沌体异象显现，万道混沌气弥漫！`);
      }
    }

    // 圆神特殊处理
    if (attacker.灵根?.name === "圆神" && Math.random() >= 0.8) {
      const lightCannonDmg = Math.trunc(attacker.攻击 * 10);
      defender.当前血量 = Math.max(0, defender.当前血量 - lightCannonDmg);
      
      const healAmount = Math.trunc(attacker.血量上限 * 0.3);
      attacker.当前血量 = Math.min(attacker.当前血量 + healAmount, attacker.血量上限);
      
      attacker._减伤比例 = 0.3;
      attacker._护盾值 = Math.trunc(attacker.当前血量 * 0.4);
      
      attackMsgs.push(`${attacker.名号}张开双臂，粉红光翼贯穿多元宇宙！`);
      attackMsgs.push(`对${defender.名号}造成${bigNumberTransform(lightCannonDmg)}点法则伤害！`);
      attackMsgs.push(`${attacker.名号}获得因果护盾：${bigNumberTransform(attacker._护盾值)}点`);
      
      if (defender.当前血量 <= 0) {
        return { msgs: attackMsgs, damage: lightCannonDmg, killed: true, aoeKilled: [] };
      }
    }

    // 木之本樱恢复
    if (attacker.灵根 && attacker.灵根.name === "木之本樱" && attacker.当前血量 < attacker.血量上限 && Math.random() < 0.55) {
      let 回复血量 = attacker.当前血量 * 0.3;
      attacker.当前血量 = Math.max(attacker.当前血量 + 回复血量, 0);
      attackMsgs.push(`${attacker.名号}为自己回复了${bigNumberTransform(回复血量)}点生命`);
    }

    // 装备特效
    if (isNotNull(attacker.id)) {
      try {
        let equipment = await Read_equipment(attacker.id);
        let ran = Math.random();

        if (equipment.法宝.name == '万灵天图' && ran > 0.1) {
          const shieldValue = Math.trunc(attacker.血量上限 * 0.4);
          attacker._护盾值 = shieldValue;
          attackMsgs.push(`【万灵天图·诸天护体】${attacker.名号}祭出万灵天图！`);
          attackMsgs.push(`诸天符文流转，万灵护体！（护盾值+${shieldValue}）`);
        }

        if (equipment.护具.name == '星辰袍' && ran > 0.15) {
          const shieldValue = Math.trunc(attacker.血量上限 * 0.35);
          attacker._护盾值 = (attacker._护盾值 || 0) + shieldValue;
          const defenseBoost = Math.trunc(attacker.防御 * 0.5);
          attacker.防御 += defenseBoost;
          attackMsgs.push(`【星辰袍·周天星斗护体】星辰之力凝聚不灭护盾（+${shieldValue}护盾）`);
          
          if (ran > 0.85) {
            const counterDamage = Math.trunc(defender.攻击 * 0.8);
            defender.当前血量 = Math.max(defender.当前血量 - counterDamage, 0);
            attackMsgs.push(`【星辰反噬】对${defender.名号}造成${counterDamage}反弹伤害！`);
            if (defender.当前血量 <= 0) {
              return { msgs: attackMsgs, damage: counterDamage, killed: true, aoeKilled: [] };
            }
          }
        }

        if (equipment.武器.name == '紫云剑' && ran > 0.7) {
          attacker.攻击 = Math.trunc(attacker.攻击 * 3);
          attackMsgs.push(`${attacker.名号}触发了紫云剑被动,攻击力提高200%`);
        } else if (equipment.武器.name == '炼血竹枪' && ran > 0.75) {
          attacker.攻击 = Math.trunc(attacker.攻击 * 2);
          attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.2);
          attackMsgs.push(`${attacker.名号}触发了炼血竹枪被动,攻击力+100%,血量+20%`);
        } else if (equipment.武器.name == '少阴玉剑' && ran > 0.75) {
          attacker.当前血量 = Math.trunc(attacker.当前血量 * 1.4);
          attackMsgs.push(`${attacker.名号}触发了少阴玉剑被动,血量+40%`);
        } else if (equipment.武器.name == '荒剑' && (attacker.mijinglevel_id > 20 || attacker.xiangulevel_id > 20) && ran > 0.75) {
          let 武器伤害 = attacker.攻击 * attacker.法球倍率 * 100;
          defender.当前血量 = Math.max(defender.当前血量 - 武器伤害, 0);
          attackMsgs.push(`${attacker.名号}眼眸开阖间挥动荒剑，一剑截断永恒！`);
          attackMsgs.push(`${defender.名号}在过去现在未来都受到毁灭一击，失去了${bigNumberTransform(武器伤害)}点血量`);
          if (defender.当前血量 <= 0) {
            return { msgs: attackMsgs, damage: 武器伤害, killed: true, aoeKilled: [] };
          }
        }
      } catch (err) {
        // 装备读取失败时静默处理
      }
    }

    // 仙宠
    if (isNotNull(attacker.仙宠)) {
      const petCriticalBonus = getPetAbilityBonus(attacker.仙宠, '暴伤');
      const petCombatBonus = getPetAbilityBonus(attacker.仙宠, '战斗');
      if (petCriticalBonus > 0) baoji += petCriticalBonus;
      if (petCombatBonus > 0) {
        let ran = Math.random();
        if (ran < 0.35) {
          attacker.攻击 += Math.trunc(attacker.攻击 * petCombatBonus);
          attacker.防御 += Math.trunc(attacker.防御 * petCombatBonus);
          attacker.当前血量 += Math.trunc(attacker.当前血量 * petCombatBonus);
          attackMsgs.push(`仙宠【${attacker.仙宠.name}】辅佐了${attacker.名号}，伤害+${Math.trunc(petCombatBonus * 100)}%`);
        }
      }
    }

    // 技能触发
    let 基础伤害 = Harm(attacker.攻击 * 0.85, defender.防御);
    let 暴击伤害 = Math.trunc(基础伤害 * baoji);
    let 法球伤害 = Math.trunc(attacker.攻击 * attacker.法球倍率);
    let 伤害 = 暴击伤害 + 法球伤害;

    let jineng1 = data.jineng1;
    let count = 0;
    let Random = Math.random();
    let 不可防御 = false;
    let 无视减伤 = false; // 草字剑诀·斩真我：无视目标减伤与类型减免
    let 斩杀阈值 = 0; // 草字剑诀·斩真我：命中后残血斩杀阈值
    let 攻击方技能列表 = [];
    const _基础伤害 = 伤害; // 基础普攻伤害（归为神通类型）
    let 类型桶 = { '神通': _基础伤害 }; // 分类型伤害桶：每个技能按自身攻击类型累加增量

    for (var i = 0; !innateSilenced && i < jineng1.length; i++) {
      let actualPr = jineng1[i].pr;

      if ((jineng1[i].class == '常驻' && (round == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (attacker.学习的功法 && jineng1[i].class == '功法' && attacker.学习的功法.indexOf(jineng1[i].name) > -1 && (round == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (jineng1[i].class == '灵根' && hasSupremeInnate(attacker, jineng1[i].name) && (round == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr) ||
          (attacker.xiangu_shenhuo && jineng1[i].class == '道种专属' && attacker.xiangu_shenhuo.专属技能 === jineng1[i].name && (round == jineng1[i].cnt || jineng1[i].cnt == -1) && Random < jineng1[i].pr)) {
        攻击方技能列表.push(jineng1[i]);
        if (jineng1[i].无视减伤) 无视减伤 = true; // 草字剑诀·斩真我
        if (jineng1[i].斩杀阈值) 斩杀阈值 = jineng1[i].斩杀阈值; // 草字剑诀·斩真我
        let processedMsg1 = jineng1[i].msg1.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);
        let processedMsg2 = jineng1[i].msg2.replace(/他/g, attacker.名号).replace(/对手/g, defender.名号);

        if (jineng1[i].msg2 == '') {
          attackMsgs.push(attacker.名号 + processedMsg1);
        } else {
          attackMsgs.push(attacker.名号 + processedMsg1 + defender.名号 + processedMsg2);
        }

        if (jineng1[i].不可防御 === 1) 不可防御 = true;
        if (jineng1[i].不可复活 === 1) defender.不可复活 = true;
        if (jineng1[i].控制 === 1) defender.dongjie = true;

        // —— 每个技能按自身攻击类型单独结算：基础连乘保留，增量归入对应类型桶 ——
        const _旧伤害 = 伤害;
        伤害 = 伤害 * jineng1[i].beilv + jineng1[i].other;
        const 该技能增量 = 伤害 - _旧伤害;
        const _t = jineng1[i].攻击类型 || '神通';
        类型桶[_t] = (类型桶[_t] || 0) + 该技能增量;

        if (jineng1[i].负面效果) {
          defender._fumianhuihe = jineng1[i].负面回合;
          defender._fumian_damage = Math.trunc(该技能增量 * jineng1[i].beilv + jineng1[i].other);
          defender._fumian_type = jineng1[i].负面类型;
        }

        count++;
        if (count == 3) break;
      }
    }
    const 伤害_循环末 = 伤害; // 技能循环结束时的原始总伤（用于防御技能/buff/反弹的整体缩放映射）

    // 防御技能
    if (!不可防御) {
      let random = Math.random();
      const sortedSkills = [...data.jineng2].sort((a, b) => (a.优先级 || 999) - (b.优先级 || 999));

      for (var i = 0; i < sortedSkills.length; i++) {
        const skill = sortedSkills[i];

        if ((defender.学习的功法 && skill.class == '功法' && defender.学习的功法.indexOf(skill.name) > -1 && (round == skill.cnt || skill.cnt == -1) && random < skill.pr) ||
            (skill.class == '灵根' && hasSupremeInnate(defender, skill.name) && (round == skill.cnt || skill.cnt == -1) && random < skill.pr) ||
            (defender.xiangu_shenhuo && skill.class == '道种专属' && defender.xiangu_shenhuo.专属技能 === skill.name && (round == skill.cnt || skill.cnt == -1) && random < skill.pr)) {

          if (skill.msg1 == '') {
            attackMsgs.push(attacker.名号 + skill.msg2);
          } else if (skill.msg2 == '') {
            attackMsgs.push(defender.名号 + skill.msg1);
          } else {
            attackMsgs.push(defender.名号 + skill.msg1 + attacker.名号 + skill.msg2);
          }

          // —— 道种·防御技专属效果（护盾/免控/厚土无敌持续减伤）——
          if (skill.class == '道种专属') {
            if (skill.护盾值 > 0) {
              const 护盾量 = Math.trunc(defender.血量上限 * skill.护盾值);
              defender._护盾值 = (defender._护盾值 || 0) + 护盾量;
              attackMsgs.push(`${defender.名号}的道种之力凝聚护盾，获得${bigNumberTransform(护盾量)}点护盾！`);
            }
            if (skill.免控回合 > 0) {
              defender._immune_control = skill.免控回合;
              defender._immune_type = skill.name;
              attackMsgs.push(`${defender.名号}道体不染尘埃，${skill.免控回合}回合内免疫一切控制！`);
            }
            if (skill.持续减伤 > 0 && skill.持续减伤回合 > 0) {
              defender._持续减伤比例 = skill.持续减伤;
              defender._持续减伤回合 = skill.持续减伤回合;
              attackMsgs.push(`${defender.名号}催动「${skill.name}」，厚土加身，未来${skill.持续减伤回合}回合内减伤${Math.trunc(skill.持续减伤 * 100)}%！`);
            }
          }

          if (skill.反弹伤害) {
            defender._反弹比例 = skill.反弹伤害;
            let 反弹伤害 = Math.floor(伤害 * defender._反弹比例);
            attacker.当前血量 = Math.max(attacker.当前血量 - 反弹伤害, 0);
            伤害 = 伤害 * skill.beilv + skill.other;
            attackMsgs.push(`${attacker.名号}受到${bigNumberTransform(反弹伤害)}点反弹伤害！`);
          } else {
            伤害 = 伤害 * skill.beilv + skill.other;
          }
          break;
        }
      }
    }

    // buff/debuff
    let buff = 1;
    if (attacker.魔道值 > 999 && attacker.灵根.type == '魔头') {
      buff += Math.trunc(attacker.魔道值 / 1000) / 100;
      if (buff > 1.3) buff = 1.3;
    }
    if (defender.魔道值 < 1 && defender.灵根.type == '转生') {
      let buff2 = defender.神石 * 0.0015;
      if (buff2 > 0.3) buff2 = 0.3;
      buff -= buff2;
    }
    if (attacker.魔道值 > 999 && attacker.灵根.type == '天魔') {
      buff += Math.trunc(attacker.魔道值 / 1000) / 100;
      if (buff > 1.3) buff = 1.3;
      if (['极道天魔', '无相·万化天魔体'].includes(attacker.灵根.name)) buff += 0.3;
    }
    if (defender.魔道值 < 1 && defender.灵根.type == '命运') {
      let buff2 = defender.神石 * 0.0015;
      if (buff2 > 0.3) buff2 = 0.3;
      if (defender.灵根.name == '命运神道体') buff2 += 0.3;
      buff -= buff2;
    }

    伤害 = Math.trunc(伤害 * buff);

    // 统一伤害修正管线（闪避/类型加成/类型减免/穿透）；不可防御技能无视闪避；dmgType 按攻击技能类型分流
    // 无视减伤（草字剑诀·斩真我）：跳过类型减免
    const _cd = calcDamage(attacker, defender, 伤害, { buckets: 类型桶, baseRaw: 伤害_循环末 }, 不可防御, 无视减伤);
    伤害 = _cd.actual_damage;
    attackMsgs = attackMsgs.concat(_cd.msgs);

    if (!无视减伤) {
      // 减伤效果（检查的是防御方，而不是攻击方）
      if (defender._减伤比例 > 0) {
        伤害 = Math.trunc(伤害 * (1 - defender._减伤比例));
        defender._减伤比例 = 0;
      }
      // 道种·厚土无敌 持续减伤（多回合 80% 减伤，回合数由主循环递减）
      if (defender._持续减伤回合 > 0 && defender._持续减伤比例 > 0) {
        const before = 伤害;
        伤害 = Math.trunc(伤害 * (1 - defender._持续减伤比例));
        attackMsgs.push(`${defender.名号}的「厚土无敌」大地之力护体，抵消了${bigNumberTransform(before - 伤害)}点伤害！`);
      }
    } else {
      attackMsgs.push(`${attacker.名号}的攻击斩落真我本源，无视了${defender.名号}的一切护体减伤！`);
    }

    // ===== 群攻处理 =====
    let 群攻技能 = null;
    for (let skill of 攻击方技能列表) {
      if (skill.群攻 > 1) {
        if (!群攻技能 || skill.群攻 > 群攻技能.群攻) {
          群攻技能 = skill;
        }
      }
    }

    let aoeKilled = [];
    if (群攻技能 && allEnemies && allEnemies.length > 1) {
      let 群攻人数 = Math.min(群攻技能.群攻 - 1, allEnemies.length - 1);
      let otherEnemies = allEnemies.filter(e => e !== defender && e.当前血量 > 0);
      if (otherEnemies.length > 0) {
        for (let i = otherEnemies.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherEnemies[i], otherEnemies[j]] = [otherEnemies[j], otherEnemies[i]];
        }
        let targets = otherEnemies.slice(0, 群攻人数);
        let 群攻比例 = 群攻技能.群攻比例 || 0.5;

        for (let t of targets) {
          let 群攻伤害 = Math.trunc(伤害 * 群攻比例);
          if (t._护盾值 > 0) {
            if (t._护盾值 >= 群攻伤害) {
              t._护盾值 -= 群攻伤害;
              群攻伤害 = 0;
            } else {
              群攻伤害 -= t._护盾值;
              t._护盾值 = 0;
            }
          }
          t.当前血量 -= 群攻伤害;
          if (t.当前血量 < 0) t.当前血量 = 0;
          attackMsgs.push(`【群攻】${attacker.名号}的余波扫中${t.名号}，造成${bigNumberTransform(群攻伤害)}伤害`);
          if (t.当前血量 <= 0) {
            // P0-7: 群攻击杀也走复活检查（与主目标保持一致）
            const rev = checkTeamRevival(t);
            if (rev.revived) {
              attackMsgs.push(...(Array.isArray(rev.message) ? rev.message : [rev.message]));
              continue;  // 已复活，不算 aoeKilled
            }
            aoeKilled.push(t);
          }
        }
      }
    }

    // 仙气压制：攻击方每多一道仙气，对少一道者伤害+30%（完美世界·石昊三道仙气）
    const xianqiMul_team = calcXianqiSuppressMul(attacker, defender);
    if (xianqiMul_team > 1) {
      伤害 = Math.trunc(伤害 * xianqiMul_team);
      attackMsgs.push(`【仙气压制】${attacker.名号}仙气加身，碾压${defender.名号}，本击伤害 ×${xianqiMul_team.toFixed(2)}！`);
    }

    // 应用伤害
    if (defender._诛仙易伤 > 0) 伤害 = Math.floor(伤害 * (1 + defender._诛仙易伤));
    let actual_damage = 伤害;
    if (
      defender.当前先天至宝 === '太极图' &&
      defender.先天权柄?.太极模式 === '阴' &&
      Math.random() < 0.3
    ) {
      const counterDamage = Math.max(1, Harm((Number(defender.攻击) || 1) * 0.85, Number(attacker.防御) || 0));
      attacker.当前血量 = Math.max(0, attacker.当前血量 - counterDamage);
      attackMsgs.push(`【太极·阴】${defender.名号}化去伤害并反击${bigNumberTransform(counterDamage)}点。`);
      actual_damage = 0;
    }
    if (defender._护盾值 > 0) {
      if (defender._护盾值 >= actual_damage) {
        defender._护盾值 -= actual_damage;
        actual_damage = 0;
      } else {
        actual_damage -= defender._护盾值;
        defender._护盾值 = 0;
      }
    }

    if (defender._阴阳逆转护命 && actual_damage >= defender.当前血量) {
      defender._阴阳逆转护命 = false;
      defender.当前血量 = Math.min(defender.血量上限 || defender.当前血量, defender.当前血量 + actual_damage);
      attacker.当前血量 = Math.max(0, attacker.当前血量 - actual_damage);
      attackMsgs.push(`【阴阳逆转】致命伤害化为治疗，并等量返还给${attacker.名号}！`);
      actual_damage = 0;
    }

    defender.当前血量 -= actual_damage;
    if (defender.当前血量 < 0) defender.当前血量 = 0;

    // —— 草字剑诀·斩真我：命中后残血斩杀 ——
    if (斩杀阈值 > 0 && defender.当前血量 > 0 && defender.当前血量 <= 斩杀阈值 * defender.血量上限) {
      defender.当前血量 = 0;
      attackMsgs.push(`${attacker.名号}一剑「草字剑诀」斩落真我，${defender.名号}气血已衰竭至极，本源被当场斩断！`);
    }
    if (attacker.当前先天至宝 === '诛仙四剑' && defender.当前血量 > 0 && defender.当前血量 < defender.血量上限 * 0.25) {
      defender.当前血量 = 0;
      attackMsgs.push(`【诛仙斩命】${defender.名号}气血低于25%，被直接斩杀！`);
    }

    // 吸血（批次1：基于实际造成伤害回复，封顶血量上限）
    if (!attacker._先天禁疗 && attacker.吸血率 > 0 && actual_damage > 0) {
      const _heal = Math.trunc(actual_damage * attacker.吸血率);
      const _max = attacker.血量上限 || attacker.当前血量;
      attacker.当前血量 = Math.min(attacker.当前血量 + _heal, _max);
      attackMsgs.push(`${attacker.名号}汲取了${bigNumberTransform(_heal)}点生命！`);
    }

    let criticalText = isCritical ? "暴击！" : "";
    attackMsgs.push(`${attacker.名号}攻击${defender.名号}，${criticalText}造成伤害${bigNumberTransform(伤害)}，${defender.名号}剩余血量${bigNumberTransform(defender.当前血量)}`);

    return {
      msgs: attackMsgs,
      damage: actual_damage,
      killed: defender.当前血量 <= 0,
      aoeKilled: aoeKilled
    };
  }

  // 检查复活（简化版）
  function checkTeamRevival(player) {
    if (player.当前血量 > 0 || player._revived || !player.学习的功法) return { revived: false };

    const reviveSkills = data.jineng3?.filter(j => j.复活技能 === 1) || [];
    for (let skill of reviveSkills) {
      if (player.学习的功法.indexOf(skill.name) > -1) {
        if (Math.random() < (skill.pr || 1)) {
          const 恢复比例 = skill.恢复比例 || 0.5;
          const 恢复血量 = Math.trunc(player.血量上限 * 恢复比例);
          player.当前血量 = 恢复血量;
          player.dongjie = false;
          player._revived = true;

          const msgs = [];
          if (skill.msg1) msgs.push(player.名号 + skill.msg1);
          if (skill.msg2) msgs.push(player.名号 + skill.msg2);

          const 免控回合 = Math.round(skill.免控 || 0);
          if (免控回合 > 0) {
            player._immune_control = 免控回合;
            player._immune_type = skill.免控类型?.[Math.floor(Math.random() * skill.免控类型.length)] || "涅槃真火护体";
            msgs.push(`${player.名号}获得${player._immune_type}，${免控回合}回合内免疫所有控制效果！`);
          }

          let 加成消息 = "";
          if (skill.攻击加成 > 0) {
            player.攻击 = Math.trunc(player.攻击 * (1 + skill.攻击加成));
            加成消息 += `攻击+${(skill.攻击加成 * 100).toFixed(0)}% `;
          }
          if (skill.防御加成 > 0) {
            player.防御 = Math.trunc(player.防御 * (1 + skill.防御加成));
            加成消息 += `防御+${(skill.防御加成 * 100).toFixed(0)}% `;
          }
          if (skill.生命加成 > 0) {
            const 新血量上限 = Math.trunc(player.血量上限 * (1 + skill.生命加成));
            player.血量上限 = 新血量上限;
            player.当前血量 = Math.trunc(player.当前血量 * (1 + skill.生命加成));
            加成消息 += `生命+${(skill.生命加成 * 100).toFixed(0)}% `;
          }
          if (加成消息 !== "") {
            msgs.push(`${player.名号}获得${加成消息.trim()}！`);
          }

          msgs.push(`恢复${bigNumberTransform(恢复血量)}点血量！`);
          return { revived: true, message: msgs };
        }
      }
    }
    return { revived: false };
  }

  // 主战斗循环
  while (isTeamAlive(A_team) && isTeamAlive(B_team)) {
    cnt++;

    // 推进行动条
    let readyUnit = null;
    let roundsAdvanced = 0;

    while (!readyUnit && roundsAdvanced < 100) {
      roundsAdvanced++;
      for (let u of allUnits) {
        if (u.当前血量 <= 0) continue;
        u._actionBar += Math.floor(u._speed * u._speedBoost);
      }

      const readyList = allUnits.filter(u => u.当前血量 > 0 && u._actionBar >= ACTION_BAR_MAX);
      if (readyList.length > 0) {
        readyList.sort((a, b) => {
          if (b._speed !== a._speed) return b._speed - a._speed;
          return b._actionBar - a._actionBar;
        });
        readyUnit = readyList[0];
      }
    }

    if (!readyUnit) break;

    readyUnit._actionBar -= ACTION_BAR_MAX;

    const enemies = getAliveEnemies(readyUnit);
    if (enemies.length === 0) break;

    if (readyUnit._绝仙流血) {
      const bleedDamage = Math.floor((Number(readyUnit.血量上限) || 0) * 0.2);
      readyUnit.当前血量 = Math.max(0, readyUnit.当前血量 - bleedDamage);
      msg.push(`【绝仙剑】${readyUnit.名号}本源流血，损失${bigNumberTransform(bleedDamage)}点生命。`);
      if (readyUnit.当前血量 <= 0) {
        const revival = checkTeamRevival(readyUnit);
        if (revival.revived) msg.push(...revival.message);
        else continue;
      }
    }

    const target = enemies[Math.floor(Math.random() * enemies.length)];

    if (readyUnit.当前先天至宝 === '六道轮回盘' && Math.random() < 0.2) {
      target._actionBar = Math.max(0, target._actionBar - Math.floor(ACTION_BAR_MAX * 0.2));
      msg.push(`【六道轮回盘】${target.名号}的行动进度被推退20%。`);
    }

    msg.push(`【第${cnt}回合】${readyUnit.名号} 抢占先机！[${readyUnit._team}方行动]`);

    // 负面效果
    if (readyUnit._fumianhuihe > 0) {
      readyUnit.当前血量 -= readyUnit._fumian_damage;
      readyUnit.当前血量 = Math.max(readyUnit.当前血量, 0);
      let effectMsg = "";
      switch (readyUnit._fumian_type) {
        case "太阴之力": effectMsg = "被太阴之力冰封，生机冻结，元神僵硬"; break;
        case "火焰风暴": effectMsg = "被火焰风暴席卷全身"; break;
        case "剧毒": effectMsg = "被剧毒侵蚀，五脏六腑如被腐蚀"; break;
        default: effectMsg = `受到${readyUnit._fumian_type}影响`;
      }
      msg.push(`${readyUnit.名号}${effectMsg}，损失了${bigNumberTransform(readyUnit._fumian_damage)}点生命值！`);
      readyUnit._fumianhuihe--;
      if (readyUnit._fumianhuihe === 0) {
        msg.push(`${readyUnit.名号}身上的${readyUnit._fumian_type}效果消失了。`);
        readyUnit._fumian_type = null;
      }

      if (readyUnit.当前血量 <= 0) {
        const reviveResult = checkTeamRevival(readyUnit);
        if (reviveResult.revived) {
          msg.push(...reviveResult.message);
        } else {
          msg.push(`${readyUnit.名号}被持续伤害击溃！`);
          if (!isTeamAlive(A_team) || !isTeamAlive(B_team)) break;
          continue;
        }
      }
    }

    // 免疫控制
    if (readyUnit._immune_control > 0) {
      readyUnit._immune_control--;
      const immuneType = readyUnit._immune_type || "涅槃真火护体";
      if (readyUnit._immune_control > 0) {
        msg.push(`${readyUnit.名号}的${immuneType}效果剩余${readyUnit._immune_control}回合`);
      }
    }

    // 道种·厚土无敌 持续减伤回合递减（每次行动结算）
    if (readyUnit._持续减伤回合 > 0) {
      readyUnit._持续减伤回合--;
      if (readyUnit._持续减伤回合 <= 0) {
        readyUnit._持续减伤比例 = 0;
        msg.push(`${readyUnit.名号}的「厚土无敌」大地之力渐渐消散。`);
      }
    }

    // 执行攻击
    const roundIndex = Math.trunc(cnt / 2);
    const attackResult = await performTeamAttack(readyUnit, target, roundIndex, enemies);
    msg.push(...attackResult.msgs);

    // 检查目标死亡
    if (attackResult.killed) {
      const reviveResult = checkTeamRevival(target);
      if (reviveResult.revived) {
        msg.push(...reviveResult.message);
      } else {
        msg.push(`${readyUnit.名号}击败了${target.名号}`);
      }
    }

    // 检查群攻击杀
    if (attackResult.aoeKilled && attackResult.aoeKilled.length > 0) {
      for (let aoeTarget of attackResult.aoeKilled) {
        const reviveResult = checkTeamRevival(aoeTarget);
        if (reviveResult.revived) {
          msg.push(...reviveResult.message);
        } else {
          msg.push(`${readyUnit.名号}的群攻击杀了${aoeTarget.名号}`);
        }
      }
    }

    // 检查攻击者是否被反弹致死
    if (readyUnit.当前血量 <= 0) {
      const reviveResult = checkTeamRevival(readyUnit);
      if (reviveResult.revived) {
        msg.push(...reviveResult.message);
      } else {
        msg.push(`${readyUnit.名号}被反弹之力击溃！`);
      }
    }

    // 者字秘恢复
    if (readyUnit.学习的功法?.some(gongfa => ["者字秘"].includes(gongfa))) {
      const 最大血量 = readyUnit.血量上限;
      const 恢复量 = Math.trunc(最大血量 * 0.1);
      if (readyUnit.当前血量 < 最大血量 && readyUnit.当前血量 > 0) {
        readyUnit.当前血量 = Math.min(readyUnit.当前血量 + 恢复量, 最大血量);
        msg.push(`${readyUnit.名号}周身泛起赤色霞光，「者字秘」燃烧生命精气，恢复${bigNumberTransform(恢复量)}点气血！`);
      }
    }

    // 检查战斗是否结束
    if (!isTeamAlive(A_team) || !isTeamAlive(B_team)) break;
  }

  // 结果
  const A_alive = A_team.filter(p => p.当前血量 > 0);
  const B_alive = B_team.filter(p => p.当前血量 > 0);

  if (A_alive.length > 0 && B_alive.length === 0) {
    msg.push(`\n${A_team.map(p => p.名号).join('、')}方获得了胜利！`);
  } else if (B_alive.length > 0 && A_alive.length === 0) {
    msg.push(`\n${B_team.map(p => p.名号).join('、')}方获得了胜利！`);
  } else {
    msg.push(`\n双方势均力敌，战斗结束！`);
  }

  return createTeamBattleResult({ msg, A_team, B_team });
}

// 团本战斗逻辑
export async function tb_battle(players, boss, team) {
  // 深拷贝玩家和BOSS数据
  let teamData = players.map(p => JSON.parse(JSON.stringify(p)));
  let bossCopy = JSON.parse(JSON.stringify(boss));
  
  let cnt = 0; // 回合计数器
  let msg = []; // 战斗日志
  let jineng1 = data.jineng1; // 玩家技能库
  let jineng2 = data.jineng2; // BOSS技能库

  // 初始化玩家属性
  for (let player of teamData) {
    player.初始血量 = player.当前血量; // 记录初始血量
    
    // 魔道值增益处理
    if (player.魔道值 > 999 && (player.灵根.type == '魔头' || player.灵根.type == '天魔')) {
      let buff = Math.trunc(player.魔道值 / 1000) / 100 + 1;
      if (buff > 1.3) buff = 1.3;
      if (['极道天魔', '无相·万化天魔体'].includes(player.灵根.name)) buff += 0.2;
      msg.push(
        `${player.名号}将魔道之力转化为邪神之力，获得了${Math.trunc((buff - 1) * 100)}%的增伤`
      );
    } else if (player.灵根.type == '转生' || player.灵根.type == '命运') {
      let buff2 = player.神石 * 0.0015;
      if (buff2 > 0.3) buff2 = 0.3;
      if (player.灵根.name == '命运神道体') buff2 += 0.2;
      msg.push(
        `${player.名号}将神石之力转化为命运之力，获得了${Math.trunc(buff2 * 100)}%的减伤`
      );
    }
  }
  
  // 仇恨系统：记录每个玩家的仇恨值
  let hatred = new Array(teamData.length).fill(0);
  let currentTarget = 0; // 当前仇恨目标索引
  
  // 战斗主循环
  while (bossCopy.当前血量 > 0 && teamData.some(p => p.当前血量 > 0)) {
    cnt++;

    // P0-4: 整场战斗回合上限保护（避免高回血/者字秘死循环占用进程）
    const MAX_BOSS_ROUND = 100;
    if (cnt > MAX_BOSS_ROUND) {
      msg.push(`\n【天道法则】战局陷入僵持，已达${MAX_BOSS_ROUND}回合上限，天道降下裁决！`);
      // 玩家还活着则玩家胜，否则 BOSS 胜
      if (teamData.some(p => p.当前血量 > 0)) {
        msg.push(`玩家阵营略占上风，险胜！`);
        bossCopy.当前血量 = 0;
      } else {
        msg.push(`${bossCopy.名号}略占上风，险胜！`);
        teamData.forEach(p => p.当前血量 = 0);
      }
      break;
    }
    msg.push(`\n===== 第 ${cnt} 回合开始 =====`);

    // 道种·厚土无敌 持续减伤回合递减（每回合初，玩家与BOSS统一结算）
    for (const _u of [...teamData, bossCopy]) {
      if (_u && _u._持续减伤回合 > 0) {
        _u._持续减伤回合--;
        if (_u._持续减伤回合 <= 0) {
          _u._持续减伤比例 = 0;
          msg.push(`${_u.名号}的「厚土无敌」大地之力渐渐消散。`);
        }
      }
    }

    // ---------- 玩家阶段 ----------
    msg.push(`【玩家阶段】`);
    
    // 玩家按照队伍顺序依次攻击
    for (let i = 0; i < teamData.length; i++) {
      const player = teamData[i];
      
      // 跳过死亡玩家
      if (player.当前血量 <= 0) {
        msg.push(`${player.名号}已倒下，无法行动`);
        continue;
      }
      
      // 玩家攻击BOSS
      const result = await calculateAttack(player, bossCopy, cnt, jineng1, jineng2);
      msg.push(...result.msgs);
      
      // 更新BOSS血量
      bossCopy.当前血量 -= result.damage;
      if (bossCopy.当前血量 < 0) bossCopy.当前血量 = 0;

      // 草字剑诀·斩真我：命中后残血斩杀
      if (result.斩杀阈值 > 0 && bossCopy.当前血量 > 0 && bossCopy.当前血量 <= result.斩杀阈值 * bossCopy.血量上限) {
        bossCopy.当前血量 = 0;
        msg.push(`${player.名号}一剑「草字剑诀」斩落真我，${bossCopy.名号}气血已衰竭至极，本源被当场斩断！`);
      }

      // 更新仇恨值（伤害越高仇恨越高）
      hatred[i] += result.damage;
      
      msg.push(`${player.名号}对${bossCopy.名号}造成${result.damage}点伤害，BOSS剩余血量：${bossCopy.当前血量}`);
      
      // 如果BOSS死亡，提前结束回合
      if (bossCopy.当前血量 <= 0) break;
    }
    
    // 检查BOSS是否死亡
    if (bossCopy.当前血量 <= 0) {
      msg.push(`\n${bossCopy.名号}已被击败！`);
      break;
    }
    
    // ---------- BOSS阶段 ----------
    msg.push(`\n【BOSS阶段】`);
    
    // 选择仇恨目标（仇恨值最高的存活玩家）
    currentTarget = selectTarget(teamData, hatred);
    const targetPlayer = teamData[currentTarget];
    
    // BOSS攻击仇恨目标
    const result = await calculateAttack(bossCopy, targetPlayer, cnt, jineng1, jineng2);
    msg.push(...result.msgs);
    
    // 更新玩家血量
    targetPlayer.当前血量 -= result.damage;
    if (targetPlayer.当前血量 < 0) targetPlayer.当前血量 = 0;

    // 草字剑诀·斩真我：BOSS 也可触发残血斩杀
    if (result.斩杀阈值 > 0 && targetPlayer.当前血量 > 0 && targetPlayer.当前血量 <= result.斩杀阈值 * targetPlayer.血量上限) {
      targetPlayer.当前血量 = 0;
      msg.push(`${bossCopy.名号}一击斩落真我，${targetPlayer.名号}气血衰竭，本源被当场斩断！`);
    }

    msg.push(`${bossCopy.名号}攻击${targetPlayer.名号}，造成${result.damage}点伤害，${targetPlayer.名号}剩余血量：${targetPlayer.当前血量}`);
    
    // 检查玩家是否全部死亡
    if (teamData.every(p => p.当前血量 <= 0)) {
      msg.push(`\n所有玩家已被击败！`);
      break;
    }
  }
  
  // 计算血量变化
  const playersHpChange = teamData.map(p => p.当前血量 - p.初始血量);
  const bossHpChange = bossCopy.当前血量 - bossCopy.初始血量;
  
  // 确定战斗结果
  const result = bossCopy.当前血量 <= 0 ? "玩家胜利" : "BOSS胜利";
  msg.push(`\n===== 战斗结束 =====`);
  msg.push(`结果：${result}`);
  
  return {
    msg: msg,
    players_hp_change: playersHpChange,
    boss_hp_change: bossHpChange,
    result: result
  };
}

// 选择仇恨目标函数
function selectTarget(players, hatred) {
  // 找到仇恨值最高的存活玩家
  let maxHatred = -1;
  let targetIndex = 0;
  
  for (let i = 0; i < players.length; i++) {
    if (players[i].当前血量 > 0 && hatred[i] > maxHatred) {
      maxHatred = hatred[i];
      targetIndex = i;
    }
  }
  
  return targetIndex;
}

// 计算攻击伤害（删除仙宠逻辑）
// P0-5: 加 equipment 缓存 + 装备属性加成不修改 attacker（防指数膨胀）
const _tbEquipmentCache = new Map();
async function calculateAttack(attacker, defender, cnt, jineng1, jineng2) {
  let msgs = [];
  let triggerShengti = false; // 小成圣体触发标志
  let 无视减伤 = false; // 草字剑诀·斩真我：无视目标减伤与类型减免
  let 斩杀阈值 = 0; // 草字剑诀·斩真我：命中后残血斩杀阈值

  // —— 道种·治疗技：回合起手持续回血（生生不息/乙木逢春）——
  if (attacker.xiangu_shenhuo && attacker.xiangu_shenhuo.专属技能) {
    const 治疗条目 = getSeedSkillEntry(attacker.xiangu_shenhuo.专属技能);
    if (治疗条目 && 治疗条目.技能分类 === '治疗' && 治疗条目.回复比例 && attacker.当前血量 < attacker.血量上限) {
      const 回血量 = Math.trunc(attacker.血量上限 * 治疗条目.回复比例 * (1 + (attacker.治疗效果加成 || 0)));
      if (回血量 > 0) {
        const _before = attacker.当前血量;
        attacker.当前血量 = Math.min(attacker.当前血量 + 回血量, attacker.血量上限);
        const _实际 = attacker.当前血量 - _before;
        if (_实际 > 0) msgs.push(`${attacker.名号}的「${治疗条目.name}」道种生机涌动，气血自愈，恢复${bigNumberTransform(_实际)}点生命！`);
      }
    }
  }

  // P0-5: 装备缓存（避免每回合重复 IO）
  let equipment = null;
  if (isNotNull(attacker.id)) {
    if (_tbEquipmentCache.has(attacker.id)) {
      equipment = _tbEquipmentCache.get(attacker.id);
    } else {
      try {
        equipment = await Read_equipment(attacker.id);
        _tbEquipmentCache.set(attacker.id, equipment);
      } catch (e) {
        equipment = null;
      }
    }
  }

  // P0-5: 保存原值，装备加成不直接改 attacker 属性（用加成变量参与伤害公式）
  const originalAtk = attacker.攻击;
  const originalDef = attacker.防御;
  let weaponAtkBoost = 0;
  let weaponDefBoost = 0;
  let weaponHpHeal = 0;

  if (equipment) {
    let ran = Math.random();

    if (equipment.武器?.name == '紫云剑' && ran > 0.7) {
      weaponAtkBoost = originalAtk * 2;  // 攻击力 +200%
      msgs.push(`${attacker.名号}触发了紫云剑被动，攻击力临时提高${weaponAtkBoost}`);
    } else if (equipment.武器?.name == '炼血竹枪' && ran > 0.75) {
      weaponAtkBoost = originalAtk;  // 攻击力 +100%
      weaponHpHeal = attacker.当前血量 * 0.2;
      attacker.当前血量 = Math.trunc(attacker.当前血量 + weaponHpHeal);
      msgs.push(`${attacker.名号}触发了炼血竹枪被动，攻击力临时提高${weaponAtkBoost}，血量回复${weaponHpHeal}`);
    } else if (equipment.武器?.name == '少阴玉剑' && ran > 0.85) {
      weaponHpHeal = attacker.当前血量 * 0.4;
      attacker.当前血量 = Math.trunc(attacker.当前血量 + weaponHpHeal);
      msgs.push(`${attacker.名号}触发了少阴玉剑被动，血量回复${weaponHpHeal}`);
    }
  }
  
  // 小成圣体技能触发
  if (attacker.灵根?.type == "小成圣体") {
    if (Math.random() < 0.89) {
      msgs.push(`${attacker.名号} 撑开了异象锦绣山河，一片不属于此界的天地山河浮现，山河领域笼罩全队，全队战力暴涨，举手投足间让宇宙中的日月星辰都与之共鸣，绽开无量神光`);
      
      // 标记触发了小成圣体领域
      triggerShengti = true;
    }
  }

  // P0-5: 伤害公式用 (原值 + 装备加成) 而不是修改后属性
  const realAtk = originalAtk + weaponAtkBoost;
  const realDef = originalDef + weaponDefBoost;
  let 伤害 = Harm(realAtk * 0.85, defender.防御);
  let 法球伤害 = Math.trunc(realAtk * attacker.法球倍率);
  伤害 = Math.trunc(伤害 + 法球伤害 + realDef * 0.1);

  // 仙气压制：攻击方每多一道仙气，对少一道者伤害+30%（完美世界·石昊三道仙气）
  const xianqiMul_tb = calcXianqiSuppressMul(attacker, defender);
  if (xianqiMul_tb > 1) {
    伤害 = Math.trunc(伤害 * xianqiMul_tb);
    msgs.push(`【仙气压制】${attacker.名号}仙气加身，碾压${defender.名号}，本击伤害 ×${xianqiMul_tb.toFixed(2)}！`);
  }
  
  // 技能触发
  let count = 0; // 限制次数
  let cnt2 = Math.trunc(cnt / 2);
  let 攻击类型 = '神通'; // 攻击技能类型（元神/神通/近战），用于 calcDamage 类型加成/减免
  const _基础伤害 = 伤害; // 基础普攻伤害（归为神通类型）
  let 类型桶 = { '神通': _基础伤害 }; // 分类型伤害桶：每个技能按自身攻击类型累加增量

  for (var i = 0; i < jineng1.length; i++) {
    if (
      (jineng1[i].class == '常驻' &&
        (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) &&
        Math.random() < jineng1[i].pr) ||
      (attacker.学习的功法 &&
        jineng1[i].class == '功法' &&
        attacker.学习的功法.indexOf(jineng1[i].name) > -1 &&
        (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) &&
        Math.random() < jineng1[i].pr) ||
      (jineng1[i].class == '灵根' &&
        hasSupremeInnate(attacker, jineng1[i].name) &&
        (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) &&
        Math.random() < jineng1[i].pr) ||
      (attacker.xiangu_shenhuo &&
        jineng1[i].class == '道种专属' &&
        attacker.xiangu_shenhuo.专属技能 === jineng1[i].name &&
        (cnt2 == jineng1[i].cnt || jineng1[i].cnt == -1) &&
        Math.random() < jineng1[i].pr)
    ) {
      // 构建技能消息
      let skillMsg = attacker.名号 + jineng1[i].msg1;
      if (jineng1[i].msg2 !== '') {
        skillMsg += defender.名号 + jineng1[i].msg2;
      }
      msgs.push(skillMsg);

      if (jineng1[i].无视减伤) 无视减伤 = true; // 草字剑诀·斩真我
      if (jineng1[i].斩杀阈值) 斩杀阈值 = jineng1[i].斩杀阈值; // 草字剑诀·斩真我

      // 应用技能效果（按自身攻击类型单独结算：基础连乘保留，增量归入对应类型桶）
      const _旧伤害 = 伤害;
      伤害 = 伤害 * jineng1[i].beilv + jineng1[i].other;
      const 该技能增量 = 伤害 - _旧伤害;
      const _t = jineng1[i].攻击类型 || '神通';
      类型桶[_t] = (类型桶[_t] || 0) + 该技能增量;
      攻击类型 = jineng1[i].攻击类型 || 攻击类型;

      count++;
      if (count == 2) break; // 最多触发3个技能
    }
  }
  const 伤害_循环末 = 伤害; // 攻击方技能循环结束时的原始总伤（用于防御方技能/buff的整体缩放映射）

  for (var i = 0; i < jineng2.length; i++) {
    if (
      (defender.学习的功法 &&
        jineng2[i].class == '功法' &&
        defender.学习的功法.indexOf(jineng2[i].name) > -1 &&
        (cnt2 == jineng2[i].cnt || jineng2[i].cnt == -1) &&
        Math.random() < jineng2[i].pr) ||
      (jineng2[i].class == '灵根' &&
        hasSupremeInnate(defender, jineng2[i].name) &&
        (cnt2 == jineng2[i].cnt || jineng2[i].cnt == -1) &&
        Math.random() < jineng2[i].pr) ||
      (defender.xiangu_shenhuo &&
        jineng2[i].class == '道种专属' &&
        defender.xiangu_shenhuo.专属技能 === jineng2[i].name &&
        (cnt2 == jineng2[i].cnt || jineng2[i].cnt == -1) &&
        Math.random() < jineng2[i].pr)
    ) {
      // 构建技能消息
      let skillMsg = defender.名号 + jineng2[i].msg1;
      if (jineng2[i].msg2 !== '') {
        skillMsg += attacker.名号 + jineng2[i].msg2;
      }
      msgs.push(skillMsg);

      // —— 道种·防御技专属效果（护盾/免控/厚土无敌持续减伤）——
      if (jineng2[i].class == '道种专属') {
        if (jineng2[i].护盾值 > 0) {
          const 护盾量 = Math.trunc(defender.血量上限 * jineng2[i].护盾值);
          defender.当前血量 = Math.min((defender.当前血量 || 0) + 护盾量, defender.血量上限);
          msgs.push(`${defender.名号}的道种之力凝聚护盾，气血充盈${bigNumberTransform(护盾量)}点！`);
        }
        if (jineng2[i].持续减伤 > 0 && jineng2[i].持续减伤回合 > 0) {
          defender._持续减伤比例 = jineng2[i].持续减伤;
          defender._持续减伤回合 = jineng2[i].持续减伤回合;
          msgs.push(`${defender.名号}催动「${jineng2[i].name}」，厚土加身，未来${jineng2[i].持续减伤回合}回合内减伤${Math.trunc(jineng2[i].持续减伤 * 100)}%！`);
        }
      }

      // 应用技能效果
      伤害 = 伤害 * jineng2[i].beilv + jineng2[i].other;
    }
  }
  
  // 魔道值增益/神石减伤
  let buff = 1;
  if (attacker.魔道值 > 999) {
    buff += Math.trunc(attacker.魔道值 / 1000) / 100;
    if (buff > 1.3) buff = 1.3;
    if (attacker.灵根.name == '九重魔功') buff += 0.2;
  }
  
  if (
    defender.魔道值 < 1 &&
    (defender.灵根.type == '转生' || defender.level_id > 41)
  ) {
    let buff2 = defender.神石 * 0.0015;
    if (buff2 > 0.3) buff2 = 0.3;
    if (defender.灵根.name == '九转轮回体') buff2 += 0.2;
    buff -= buff2;
  }
  
  伤害 = Math.trunc(伤害 * buff);

  // 统一伤害修正管线（闪避/类型加成/类型减免/穿透）；无视减伤跳过类型减免
  const _cd = calcDamage(attacker, defender, 伤害, { buckets: 类型桶, baseRaw: 伤害_循环末 }, false, 无视减伤);
  伤害 = _cd.actual_damage;
  msgs = msgs.concat(_cd.msgs);

  // 道种·厚土无敌 持续减伤（多回合减伤，回合数由 tb 主循环递减）
  if (!无视减伤 && defender._持续减伤回合 > 0 && defender._持续减伤比例 > 0) {
    const before = 伤害;
    伤害 = Math.trunc(伤害 * (1 - defender._持续减伤比例));
    msgs.push(`${defender.名号}的「厚土无敌」大地之力护体，抵消了${bigNumberTransform(before - 伤害)}点伤害！`);
  } else if (无视减伤) {
    msgs.push(`${attacker.名号}的攻击斩落真我本源，无视了${defender.名号}的一切护体减伤！`);
  }

  // 吸血（批次1：基于实际造成伤害回复，封顶血量上限）
  if (attacker.吸血率 > 0 && 伤害 > 0) {
    const _heal = Math.trunc(伤害 * attacker.吸血率);
    const _max = attacker.血量上限 || attacker.当前血量;
    attacker.当前血量 = Math.min(attacker.当前血量 + _heal, _max);
    msgs.push(`${attacker.名号}汲取了${bigNumberTransform(_heal)}点生命！`);
  }

  return {
    damage: 伤害,
    msgs: msgs,
    斩杀阈值: 斩杀阈值, // 草字剑诀·斩真我：由调用方在扣血后判定斩杀
    triggerShengti: triggerShengti // 返回是否触发了小成圣体领域
  };
}
// 创建一个专门的 combatUtils.js 模块
// ===== 仙气压制（完美世界·石昊三道仙气）=====
// xiangu_xianqi 兼容数字、数字字符串和旧版 { strands }，统一限制为0至3道。
// ===== 统一伤害修正管线（批次1：闪避 / 类型伤害加成 / 类型伤害减免 / 穿透）=====
// 纯函数：从 raw 伤害算出最终伤害，处理 闪避→类型伤害加成→类型伤害减免→穿透。
// 不含 护盾/分身/扣血/复活（各入口保留原逻辑）。dmgType 预留近战/元神扩展。
// 所有字段均带兜底（||0 / ??defender.防御），无来源时数值完全不变。
function calcDamage(attacker, defender, rawDamage, dmgTypeOrBuckets = '神通', ignoreDodge = false, ignoreReduction = false) {
  const msgs = [];
  // 闪避（防御端；整轮只判定一次；ignoreDodge 用于"不可防御"类技能）
  const firstDodge = defender.首次闪避 && !defender._首次闪避已触发;
  const robeDodge = !ignoreDodge && defender._逍遥仙袍闪避次数 > 0 ? 0.1 : 0;
  const dodge = firstDodge ? 1 : (defender.闪避率 || 0) + robeDodge;
  if (robeDodge > 0) defender._逍遥仙袍闪避次数 -= 1;
  if (!ignoreDodge && dodge > 0 && Math.random() < dodge) {
    if (firstDodge) defender._首次闪避已触发 = true;
    const rate = Number(defender.闪避增攻) || 0;
    const maxStacks = Math.max(0, Number(defender.闪避增攻上限) || 0);
    if (rate > 0 && (defender._闪避增攻层数 || 0) < maxStacks) {
      defender._闪避增攻基础攻击 ??= defender.攻击;
      defender._闪避增攻层数 = (defender._闪避增攻层数 || 0) + 1;
      defender.攻击 = Math.trunc(defender._闪避增攻基础攻击 * (1 + rate * defender._闪避增攻层数));
      msgs.push(`${defender.名号}乘风而起，攻击提升${Math.trunc(rate * defender._闪避增攻层数 * 100)}%！`);
    }
    msgs.unshift(`${defender.名号}身形虚化，避开了一击！`);
    return { actual_damage: 0, dodged: true, msgs };
  }

  // ===== 分桶模式：每个技能按自身攻击类型单独结算类型加成/减免 =====
  // dmgTypeOrBuckets = { buckets: {神通, 元神, 近战, ...}, baseRaw }
  // buckets 之和 == 技能循环末原始总伤（baseRaw）；rawDamage 为经过对轰/防御技能/反弹/buff 后的最终 raw，
  // 用 rawDamage/baseRaw 等比缩放，保证这些整体改动对总伤的影响不变（仅把"单一类型"换成"各自类型"）。
  if (dmgTypeOrBuckets && typeof dmgTypeOrBuckets === 'object') {
    const buckets = dmgTypeOrBuckets.buckets || {};
    const baseRaw = dmgTypeOrBuckets.baseRaw || rawDamage;
    let total = 0;
    for (const type of Object.keys(buckets)) {
      const amt = buckets[type];
      if (!amt) continue;
      let d = amt;
      // 类型伤害加成（攻击端倍率层；已建 元神/神通/近战 伤害加成 消费层）
      const typeAtk = attacker[type + '伤害加成'] || 0;
      if (typeAtk > 0) {
        d = Math.trunc(d * (1 + typeAtk));
        msgs.push(`${attacker.名号}的${type}之力爆发，伤害提升${Math.trunc(typeAtk * 100)}%！`);
      }
      // 类型伤害减免（防御端倍率层；已建 元神/神通/近战 伤害减免 消费层）
      const typeRed = defender[type + '伤害减免'] || 0;
      if (!ignoreReduction && typeRed > 0) {
        const before = d;
        d = Math.trunc(d * (1 - typeRed));
        msgs.push(`${defender.名号}的${type}抗性抵消了${bigNumberTransform(before - d)}点伤害！`);
      }
      total += d;
    }
    // 等比映射对轰/防御技能/反弹/buff 对 raw 的整体缩放（保持总伤不变）
    if (baseRaw > 0 && rawDamage !== baseRaw) {
      total = Math.trunc(total * (rawDamage / baseRaw));
    }
    // 穿透（整轮只判定一次；无视防御/减免百分比，直接增幅伤害）
    const pierce = attacker.穿透 || 0;
    if (pierce > 0) {
      total = Math.trunc(total * (1 + pierce));
      msgs.push(`${attacker.名号}的穿透之力撕裂防线，伤害提升${Math.trunc(pierce * 100)}%！`);
    }
    return { actual_damage: total, dodged: false, msgs };
  }

  // ===== 旧模式（单类型），保持原逻辑兼容 =====
  let dmg = rawDamage;
  // 类型伤害加成（攻击端倍率层）
  const typeAtk = attacker[dmgTypeOrBuckets + '伤害加成'] || 0;
  if (typeAtk > 0) {
    dmg = Math.trunc(dmg * (1 + typeAtk));
    msgs.push(`${attacker.名号}的${dmgTypeOrBuckets}之力爆发，伤害提升${Math.trunc(typeAtk * 100)}%！`);
  }
  // 类型伤害减免（防御端倍率层）
  const typeRed = defender[dmgTypeOrBuckets + '伤害减免'] || 0;
  if (!ignoreReduction && typeRed > 0) {
    const before = dmg;
    dmg = Math.trunc(dmg * (1 - typeRed));
    msgs.push(`${defender.名号}的${dmgTypeOrBuckets}抗性抵消了${bigNumberTransform(before - dmg)}点伤害！`);
  }
  // 穿透
  const pierce = attacker.穿透 || 0;
  if (pierce > 0) {
    dmg = Math.trunc(dmg * (1 + pierce));
    msgs.push(`${attacker.名号}的穿透之力撕裂防线，伤害提升${Math.trunc(pierce * 100)}%！`);
  }
  return { actual_damage: dmg, dodged: false, msgs };
}

function calcXianqiSuppressMul(attacker, defender) {
  return getXianqiSuppressMultiplier(attacker, defender);
}

export function calculateHarm(atk, def, baoji = 1) {
  // 确保输入是数字
  atk = ensureNumber(atk);
  def = ensureNumber(def);
  baoji = ensureNumber(baoji, 1);
  
  // 使用BigInt处理超大数字
  if (atk > Number.MAX_SAFE_INTEGER || def > Number.MAX_SAFE_INTEGER) {
    try {
      const bigAtk = BigInt(Math.round(atk));
      const bigDef = BigInt(Math.round(def));
      
      // 伤害公式：攻击 * 0.85 - 防御
      const damage = bigAtk * 850n / 1000n - bigDef;
      
      // 确保伤害不为负数
      return damage > 0n ? Number(damage) : 0;
    } catch (e) {
      console.error('BigInt计算错误:', e);
      return 0;
    }
  }
  
  // 普通数字计算
  let x;
  let s = atk / def;
  let rand = Math.trunc(Math.random() * 11) / 100 + 0.95;
  
  if (s < 1) {
    x = 0.1;
  } else if (s > 2.5) {
    x = 1;
  } else {
    x = 0.6 * s - 0.5;
  }
  
  let damage = Math.trunc(x * atk * rand * baoji);
  return ensureNumber(damage, 0);
}

export function ensureNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}
export function baojishanghai(baojilv, baojiDamage = 1.5) {
  const critRate = Math.min(Math.max(ensureNumber(baojilv, 0), 0), 1);
  const critMultiplier = Math.max(ensureNumber(baojiDamage, 1.5), 1);
  return Math.random() < critRate ? critMultiplier : 1;
}
// 修改Harm函数，使其能处理暴击
export function Harm(atk, def, baoji = 1) {
  let x;
  let s = atk / def;
  let rand = Math.trunc(Math.random() * 11) / 100 + 0.95;
  
  if (s < 1) {
    x = 0.1;
  } else if (s > 2.5) {
    x = 1;
  } else {
    x = 0.6 * s - 0.5;
  }
  
  // 应用暴击倍率
  x = Math.trunc(x * atk * rand * baoji);
  return x;
}


//判断克制关系
export function kezhi(equ, wx) {
  let wuxing = ['金', '木', '土', '水', '火', '金'];
  let equ_wx = wuxing[equ - 1];
  //相同
  for (let j of wx) {
    if (j == equ_wx) return 0.04;
  }
  //不同
  for (let j of wx)
    for (let i = 0; i < wuxing.length - 1; i++) {
      if (wuxing[i] == equ_wx && wuxing[i + 1] == j) return -0.02;
    }
  return 0;
}
//通过暴击伤害返回输出用的文本
export function ifbaoji(baoji) {
  if (baoji == 1) {
    return '';
  } else {
    return '触发暴击，';
  }
}
//写入交易表
export async function Write_Exchange(wupin) {
  let dir = path.join(__PATH.Exchange, `Exchange.json`);
  let new_ARR = JSON.stringify(wupin, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

//写入交易表
export async function Write_Forum(wupin) {
  let dir = path.join(__PATH.Exchange, `Forum.json`);
  let new_ARR = JSON.stringify(wupin, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

//读交易表
export async function Read_Exchange() {
  let dir = path.join(`${__PATH.Exchange}/Exchange.json`);
  let Exchange = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  Exchange = JSON.parse(Exchange);
  return Exchange;
}

//读交易表
export async function Read_Forum() {
  let dir = path.join(`${__PATH.Exchange}/Forum.json`);
  let Forum = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  Forum = JSON.parse(Forum);
  return Forum;
}

export async function get_supermarket_img(e, thing_class) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let Exchange_list;
  try {
    Exchange_list = await Read_Exchange();
  } catch {
    await Write_Exchange([]);
    Exchange_list = await Read_Exchange();
  }
  for (let i = 0; i < Exchange_list.length; i++) {
    Exchange_list[i].num = i + 1;
  }
  if (thing_class) {
    Exchange_list = Exchange_list.filter(
      item => item.name.class == thing_class
    );
  }

  Exchange_list.sort(function (a, b) {
    return b.now_time - a.now_time;
  });
  let supermarket_data = {
    user_id: usr_qq,
    Exchange_list: Exchange_list,
  };
  const data1 = await new Show(e).get_supermarketData(supermarket_data);
  let img = await puppeteer.screenshot('supermarket', {
    ...data1,
  });
  return img;
}

export async function get_forum_img(e, thing_class) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let Forum;
  try {
    Forum = await Read_Forum();
  } catch {
    await Write_Forum([]);
    Forum = await Read_Forum();
  }
  for (let i = 0; i < Forum.length; i++) {
    Forum[i].num = i + 1;
  }
  if (thing_class) {
    Forum = Forum.filter(item => item.class == thing_class);
  }

  Forum.sort(function (a, b) {
    return b.now_time - a.now_time;
  });
  let forum_data = {
    user_id: usr_qq,
    Forum: Forum,
  };
  const data1 = await new Show(e).get_forumData(forum_data);
  let img = await puppeteer.screenshot('forum', {
    ...data1,
  });
  return img;
}

export async function openAU() {
  const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';

  const random = Math.floor(Math.random() * data.xingge[0].one.length);
  const thing_data = data.xingge[0].one[random];
  const thing_value = Math.floor(thing_data.出售价);
  const thing_amount = 1;
  const now_time = new Date().getTime();
  const groupList = await redis.sMembers(redisGlKey);

  const wupin = {
    thing: thing_data,
    start_price: thing_value,
    last_price: thing_value,
    amount: thing_amount,
    last_offer_price: now_time,
    last_offer_player: 0,
    groupList,
  };
  await redis.set('xiuxian:AuctionofficialTask', JSON.stringify(wupin));
  return wupin;
}



export async function Goweizhi(e, weizhi, addres) {
let get_data={didian_list: weizhi,
            addres:addres}
const data1 = await new Show(e).get_secret_placeData(get_data);
return await puppeteer.screenshot('secret_place', {
  ...data1,
});
}

// 品类配置（emoji/英文/中文/难度基础分）
const CATEGORY_CONFIG = {
  fishing: { icon: '🎣', name: '钓鱼', cssClass: 'cat-fishing', iconClass: 'icon-fishing', sort: 1 },
  logging: { icon: '🪓', name: '砍树', cssClass: 'cat-logging', iconClass: 'icon-logging', sort: 2 },
  farming: { icon: '🌾', name: '种植', cssClass: 'cat-farming', iconClass: 'icon-farming', sort: 3 },
  mining:  { icon: '⛏️', name: '挖矿', cssClass: 'cat-mining',  iconClass: 'icon-mining',  sort: 4 },
  special: { icon: '✨', name: '特殊', cssClass: 'cat-special', iconClass: 'icon-special', sort: 5 }
};

/** 根据地点名反查品类 */
function getPlaceCategory(placeName) {
  const categories = data?.xunbao_list?.mapCategories;
  if (!categories) return 'mining';
  for (const [cat, places] of Object.entries(categories)) {
    if (places.includes(placeName)) return cat;
  }
  return 'mining';
}

/** 计算难度星级（1-5，按饱食度消耗） */
function calcDifficulty(price) {
  const p = parseInt(price) || 500;
  if (p <= 500) return 1;
  if (p <= 2000) return 2;
  if (p <= 5000) return 3;
  if (p <= 10000) return 4;
  return 5;
}

export async function xunbaoweizhi(e, placeNames, addres) {
    try {
        if (!data || !data.xunbao_list || !data.xunbao_list.treasureMaps) {
            return e.reply('❌ 寻宝数据未初始化');
        }

        const treasureMaps = data.xunbao_list.treasureMaps;
        const levelReqs = data.xunbao_list.levelRequirements || {};

        // 转换数据格式
        const weizhi = placeNames.map(placeName => {
            const place = treasureMaps[placeName];
            if (!place) return null;

            const category = getPlaceCategory(placeName);
            const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.mining;
            const priceNum = typeof place.price === 'string'
                ? parseInt(place.price.split(',')[0]) || 500
                : (place.price || 500);
            const levelReq = levelReqs[placeName] || 0;

            // 必备地图
            const one = place.requirements?.map?.map(item => ({
                name: item.name, amount: item.amount || 1
            })) || [];

            // 所需工具
            const two = place.requirements?.tools?.map(item => ({
                name: item.name, amount: item.amount || 1
            })) || [];

            // 普通奖励
            const three = place.rewards?.base?.map(item => ({
                name: item.name, amount: item.amount || 1
            })) || [];

            // 额外奖励
            const four = place.rewards?.random?.map(item => ({
                name: item.items?.[0]?.name || '未知',
                chance: item.chance || 0,
                amount: item.items?.[0]?.amount || 1
            })) || [];

            // 最佳奖励预览
            const bestRewards = (place.bestRewards || []).slice(0, 3);

            // 难度星级
            const stars = calcDifficulty(priceNum);

            return {
                name: place.name,
                Grade: place.grade,
                Price: priceNum,
                one, two, three, four,
                // 新品类字段
                category: cfg.name,
                categoryIcon: cfg.icon,
                catClass: cfg.cssClass,
                iconClass: cfg.iconClass,
                levelReq,
                levelReqLabel: levelReq > 0 ? `修为${levelReq}+` : '无限制',
                levelLocked: false, // 模板侧判断，预留
                bestRewards,
                stars,
                experience: place.experience
                    ? `经验要求: ${place.experience.toLocaleString()}`
                    : ''
            };
        }).filter(Boolean);

        // 按品类 + 价格排序
        weizhi.sort((a, b) => {
            const catA = CATEGORY_CONFIG[getPlaceCategory(a.name)]?.sort || 99;
            const catB = CATEGORY_CONFIG[getPlaceCategory(b.name)]?.sort || 99;
            if (catA !== catB) return catA - catB;
            return (a.Price || 0) - (b.Price || 0);
        });

        if (weizhi.length === 0) {
            return e.reply(`❌ 未找到${addres}的寻宝地点信息`);
        }

        // 品类列表（按sort排序）
        const allCats = Object.entries(CATEGORY_CONFIG)
            .sort((a, b) => a[1].sort - b[1].sort)
            .map(([key, cfg]) => ({
                key,
                icon: cfg.icon,
                name: cfg.name,
                cssClass: cfg.cssClass,
                active: addres && addres.includes(cfg.name)
            }));

        const get_data = {
            didian_list: weizhi,
            addres: addres || '寻宝地图',
            categories: allCats,
            totalCount: weizhi.length,
            timestamp: Date.now()
        };

        const templateData = await new Show(e).get_xunbao_placeData(get_data);
        const screenshot = await puppeteer.screenshot('get_xunbao_placeData', {
            ...templateData,
            quality: 90,
            waitFor: 1000,
            viewport: { width: 1200, height: 800 }
        });

        return screenshot;
    } catch (error) {
        console.error('寻宝位置导出错误:', error);
        return '❌ 寻宝信息生成失败，请稍后重试';
    }
}

/** 按分类筛选寻宝地点 */
export async function xunbaoCategoryData(e, categoryKey, categoryName) {
    try {
        const categories = data?.xunbao_list?.mapCategories;
        if (!categories || !categories[categoryKey]) {
            return e.reply(`❌ 未找到"${categoryName}"分类的寻宝地点`);
        }
        const placeNames = categories[categoryKey];
        return xunbaoweizhi(e, placeNames, `${categoryName}寻宝`);
    } catch (error) {
        console.error('分类寻宝错误:', error);
        return '❌ 分类寻宝信息生成失败';
    }
}
export async function xianjingweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_xianjing_placeData(get_data);
    return await puppeteer.screenshot('get_xianjing_placeData', {
        ...data1,
    });
}


/**
 * 增加player文件某属性的值（在原本的基础上增加）
 * @param user_qq
 * @param num 属性的value
 * @param type 修改的属性
 * @returns {Promise<void>}
 */
export async function setFileValue(user_qq, num, type) {
  let user_data = data.getData('player', user_qq);
  let current_num = user_data[type]; //当前灵石数量
  let new_num = current_num + num;
  if (type == '当前血量' && new_num > user_data.血量上限) {
    new_num = user_data.血量上限; //治疗血量需要判读上限
  }
  user_data[type] = new_num;
  await data.setData('player', user_qq, user_data);
  return;
}

export async function Synchronization_ASS(e) {
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  if (!e.isMaster && !masterList.includes(userQQ)) {
    return;
  }
  e.reply('宗门开始同步');
  let assList = [];
  let files = fs
    .readdirSync('./plugins/' + AppName + '/resources/data/association')
    .filter(file => file.endsWith('.json'));
  for (let file of files) {
    file = file.replace('.json', '');
    assList.push(file);
  }
  for (let ass_name of assList) {
    let ass = await data.getAssociation(ass_name);
    let player = data.getData('player', ass.宗主);
    let now_level_id = data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    //补
    if (!isNotNull(ass.power)) {
      ass.power = 0;
    }
    if (now_level_id < 42) {
      ass.power = 0; // 凡界
    } else {
      ass.power = 1; //  仙界
    }
    if (ass.power == 1) {
      if (ass.大阵血量 == 114514) {
        ass.大阵血量 = 1145140;
      }
      let level = ass.最低加入境界;
      if (level < 42) {
        ass.最低加入境界 = 42;
      }
    }
    if (ass.power == 0 && ass.最低加入境界 > 41) {
      ass.最低加入境界 = 41;
    }
    if (!isNotNull(ass.宗门驻地)) {
      ass.宗门驻地 = 0;
    }
    if (!isNotNull(ass.宗门建设等级)) {
      ass.宗门建设等级 = 0;
    }
    if (!isNotNull(ass.宗门神兽)) {
      ass.宗门神兽 = 0;
    }
    if (!isNotNull(ass.副宗主)) {
      ass.副宗主 = [];
    }
    await data.setAssociation(ass_name, ass);
  }

  e.reply('宗门同步结束');
  return;
}

export async function synchronization(e) {
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  if (!e.isMaster && !masterList.includes(userQQ)) {
    return;
  }
  e.reply('存档开始同步');
  let playerList = [];
  let files = fs
    .readdirSync('./plugins/' + AppName + '/resources/data/xiuxian_player')
    .filter(file => file.endsWith('.json'));
  for (let file of files) {
    file = file.replace('.json', '');
    playerList.push(file);
  }
  for (let player_id of playerList) {
    let usr_qq = player_id;
    let player = await data.getData('player', usr_qq);
    let najie = await Read_najie(usr_qq);
    let equipment = await Read_equipment(usr_qq);
    
    // ========== 灵根数据同步 ==========
    // 检查玩家灵根数据是否需要更新
    if (player.灵根 && isNotNull(player.灵根)) {
      // 查找新版本的灵根数据
      let newTalent = data.talent_list.find(t => 
        t.id === player.灵根.id || t.name === player.灵根.name
      );
      
      if (newTalent) {
        // 合并新旧灵根数据，保留玩家已有的自定义属性
        player.灵根 = {
          ...newTalent,           // 新版本的属性
          ...player.灵根          // 保留玩家已有的属性（如果有自定义的话）
        };
        
        console.log(`玩家 ${usr_qq} 灵根已更新: ${player.灵根.name}`);
      }
    }
    // ========== 灵根同步结束 ==========
    
    // 扩展字段数组，添加新版本字段
    let ziduan = [
      '镇妖塔层数', '神魄段数', '魔道值', '饱食度', '热量', '师徒任务阶段', 
      '师徒积分', 'favorability', '血气', 'lunhuiBH', 'lunhui', '攻击加成', 
      '防御加成', '生命加成', '幸运', '练气皮肤', '装备皮肤', 'islucky', 'sex', 
      'addluckyNo', '神石', '源石', '生命本源', '寿元', '道法赐福天数', 
      'daofaxianshu', 'daofaxianshu_endtime', '抽奖次数', '出金率', '出金次数', 
      '仙宠寻宝状态', '仙宠寻宝开始时间', '五色祭坛'
    ];
    
    let ziduan2 = [
      'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'linggenshow', 
      'power_place', 'occupation_level', '血量上限', '当前血量', '攻击', '防御'
    ];
    let ziduan3 = ['linggen', 'occupation', '仙宠'];
    let ziduan4 = ['材料', '草药', '仙宠', '仙宠口粮', '宝石', '食材', '盒子'];
    
    // 初始化数值字段为0
    for (let k of ziduan) {
      if (!isNotNull(player[k])) {
        player[k] = 0;
      }
    }
    
    // 初始化数值字段为1
    for (let k of ziduan2) {
      if (!isNotNull(player[k])) {
        player[k] = 1;
      }
    }
    
    // 初始化数组字段
    for (let k of ziduan3) {
      if (!isNotNull(player[k])) {
        player[k] = [];
      }
    }
    
    // 初始化纳戒数组字段
    for (let k of ziduan4) {
      if (!isNotNull(najie[k])) {
        najie[k] = [];
      }
    }
    
    // ========== 元神和元神上限特殊处理 ==========
    // 获取玩家当前境界ID
    let level_id = player.level_id || 1;
    
    // 计算基于境界的元神值（境界ID * 500000）
    let base_spirit = level_id * 500000;
    
    // 如果元神字段不存在或为0，设置基于境界的初始值
    if (!isNotNull(player.元神) || player.元神 === 0) {
      player.元神 = base_spirit;
    }
    
    // 如果元神上限字段不存在或为0，设置基于境界的初始值
    if (!isNotNull(player.元神上限) || player.元神上限 === 0) {
      player.元神上限 = base_spirit;
    }
    
    // 如果神识字段不存在或为0，也设置基于境界的初始值
    if (!isNotNull(player.神识) || player.神识 === 0) {
      player.神识 = base_spirit * 0.1; // 神识是元神的10%
    }
    // ========== 元神处理结束 ==========
    
    // ========== 寿元特殊处理 ==========
    // 根据境界ID计算基础寿元（境界ID * 500）
    let base_lifespan = level_id * 500;
    
    // 如果寿元字段不存在或为0，设置基于境界的初始值
    if (!isNotNull(player.寿元) || player.寿元 === 0) {
      player.寿元 = base_lifespan;
    }
    // ========== 寿元处理结束 ==========
    
    // ========== 生命本源特殊处理 ==========
    // 根据灵根的生命本源属性计算基础生命本源
    let base_life_essence = 100; // 基础值
    if (player.灵根 && player.灵根.生命本源) {
      base_life_essence += player.灵根.生命本源;
    }
    
    // 如果生命本源字段不存在或为0，设置基于灵根的初始值
    if (!isNotNull(player.生命本源) || player.生命本源 === 0) {
      player.生命本源 = base_life_essence;
    }
    // ========== 生命本源处理结束 ==========
    
    // 初始化字符串字段
    if (!isNotNull(player.daofa)) {
      player.daofa = '未开启';
    }
    if (!isNotNull(player.仙宠寻宝)) {
      player.仙宠寻宝 = "";
    }
    if (!isNotNull(player.势力)) {
      player.势力 = "无";
    }
    if (!isNotNull(player.势力职位)) {
      player.势力职位 = "";
    }
    if (!isNotNull(player.护道人)) {
      player.护道人 = "无";
    }
    if (!isNotNull(player.庇护人)) {
      player.庇护人 = "";
    }
    if (Array.isArray(player.护道人) && player.护道人.length === 0) {
    player.护道人 = "无";
}
if (Array.isArray(player.势力) && player.势力.length === 0) {
    player.势力 = "无";
}
if (Array.isArray(player.势力职位) && player.势力职位.length === 0) {
    player.势力职位 = "";
}
    // 初始化布尔字段
    if (!isNotNull(player.attempting_level_7)) {
      player.attempting_level_7 = false;
    }
    if (!isNotNull(player.guardian)) {
      player.guardian = null;
    }
    
    // 初始化天资系统（新增关键字段）
    if (!isNotNull(player.天资等级)) {
      player.天资等级 = "天纵之资"; // 默认天资等级
    }
    if (!isNotNull(player.天资评价)) {
      player.天资评价 = "天赋异禀，媲美上古大教的天才"; // 默认天资评价
    }
    
    // 原有逻辑保持不变
    if (!isNotNull(player.breakthrough)) {
      player.breakthrough = false;
    }
    if (!isNotNull(player.id)) {
      player.id = usr_qq;
    }
    if (!isNotNull(player.轮回点) || player.轮回点 > 10) {
      player.轮回点 = 10 - player.lunhui;
    }
    
    // 初始化丹药数据
    try {
      await Read_danyao(usr_qq);
    } catch {
      const arr = {
        biguan: 0, //闭关状态
        biguanxl: 0, //增加效率
        xingyun: 0,
        lianti: 0,
        ped: 0,
        modao: 0,
        beiyong1: 0, //ped
        beiyong2: 0,
        beiyong3: 0,
        beiyong4: 0,
        beiyong5: 0,
      };
      await Write_danyao(usr_qq, arr);
    }

    // 初始化装备的帝兵字段（新增）
    if (!isNotNull(equipment.帝兵)) {
      equipment.帝兵 = data.dibing_list.find(item => item.name == '废铁') || {
        name: '废铁',
        type: '帝兵',
        attack: 0,
        defense: 0
      };
    }

    let suoding = [
      '装备', '丹药', '道具', '功法', '草药', '材料', '仙宠', 
      '仙宠口粮', '宝石', '食材', '盒子'
    ];
    for (let j of suoding) {
      najie[j].forEach(item => {
        if (!isNotNull(item.islockd)) {
          item.islockd = 0;
        }
      });
    }
    
    // 仙宠幸运加成同步
    let pet = player.仙宠;
    if (pet && pet.id) {
      // 原有ID范围内的幸运仙宠（2931-2935）
      if (pet.id > 2930 && pet.id < 2936) {
        pet.初始加成 = 0.002;
        pet.每级增加 = 0.002;
        pet.加成 = pet.每级增加 * (pet.等级 || 1);
        player.幸运 = player.addluckyNo + pet.加成;
      }
      // 其他幸运仙宠（如麒麟、鲲鹏等，根据初始加成属性判断）
      else if (isNotNull(pet.初始加成) && isNotNull(pet.每级增加)) {
        pet.加成 = pet.初始加成 + pet.每级增加 * (pet.等级 || 1);
        player.幸运 = player.addluckyNo + pet.加成;
      }
      // 非幸运类型仙宠
      else {
        player.幸运 = player.addluckyNo;
      }
    } else {
      player.幸运 = player.addluckyNo;
    }
    
    // 纳戒中仙宠的加成同步
    for (let j of najie.仙宠) {
      if (j.id > 2930 && j.id < 2936) {
        j.初始加成 = 0.002;
        j.每级增加 = 0.002;
      }
      // 其他幸运仙宠也同步加成属性
      if (isNotNull(j.初始加成) && isNotNull(j.每级增加)) {
        j.加成 = (j.初始加成 || 0) + (j.每级增加 || 0) * (j.等级 || 1);
      }
    }
    
    // 装备调整（保持不变）
    let wuqi = ['雾切之回光', '护摩之杖', '磐岩结绿', '三圣器·朗基努斯之枪'];
    let wuqi2 = ['紫云剑', '炼血竹枪', '少阴玉剑', '纯阴金枪'];
    for (let j of najie.装备) {
      for (let k in wuqi) {
        if (j.name == wuqi[k]) {
          j.name = wuqi2[k];
        }
        if (equipment.武器.name == wuqi[k]) equipment.武器.name = wuqi2[k];
        if (equipment.法宝.name == wuqi[k]) equipment.法宝.name = wuqi2[k];
      }
    }
    
    // 口粮调整（保持不变）
    for (let j of najie.仙宠口粮) {
      j.class = '仙宠口粮';
    }
    
    // 灵根数据同步（使用新版本的灵根列表）
    let linggeng = data.talent_list.find(item => item.name == player.灵根.name);
    if (linggeng) {
      // 合并灵根数据，保留玩家可能存在的自定义属性
      player.灵根 = {
        ...linggeng,
        ...player.灵根
      };
    }

    // 隐藏灵根（保持不变）
    if (player.隐藏灵根) {
      player.隐藏灵根 = data.yincang.find(
        item => item.name == player.隐藏灵根.name
      );
    }
    
    // 重新根据id去重置仙门（保持不变）
    let now_level_id = await data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    if (now_level_id < 42) {
      player.power_place = 0;
    }
   
    
    await Write_najie(usr_qq, najie);
    await Write_player(usr_qq, player);
    await Write_equipment(usr_qq, equipment);
    
    // 记录同步信息（可选，用于调试）
    console.log(`玩家 ${usr_qq} 同步完成：境界${level_id} 元神${player.元神} 生命本源${player.生命本源} 寿元${player.寿元}`);
  }
  e.reply('存档同步结束');
  return;
}

export async function channel(usr_qq) {
  const dir = path.join(`${__PATH.channel}/channel.json`);
  const logfile = fs.readFileSync(dir, 'utf8');
  const allRecords = JSON.parse(logfile);
   if (usr_qq.length > 16) {
    for (let record of allRecords) {
      if (record.频道_ID == usr_qq) {
        usr_qq = record.QQ_ID; // 使用存档的 usr_qq
        let ifexistplay = data.existData("player", usr_qq);
        if (!ifexistplay) {
          usr_qq = record.频道_ID; // 使用存档的 usr_qq
        }
        break;
      }
    }
  } else {
    for (let record of allRecords) {
      if (record.频道_ID == usr_qq) {
        usr_qq = record.QQ_ID; // 使用存档的 usr_qq
        let ifexistplay = data.existData("player", usr_qq);
        if (!ifexistplay) {
          usr_qq = record.频道_ID; // 使用存档的 usr_qq
        }
        break;
      }
    }
  }
  return usr_qq; // 返回转换后的 usr_qq 值
}

/**
 *
 * @param {*} thing_name 物品名
 * @returns
 */
//遍历物品
export async function foundthing(thing_name) {
  let thing = [
    'equipment_list',
    'danyao_list',
    'dibing_list',
    'tszb_list',
    'dijingList',
    'daoju_list',
    'gongfa_list',
    'caoyao_list',
    'timegongfa_list',
    'timeequipmen_list',
    'timedanyao_list',
    'newdanyao_list',
    'xianchon',
    'xianchonkouliang',
    'xianchonkouliang2',
    'duanzhaocailiao',
    'kamian',
    'kamian3',
   'namegive',
    'hecheng_list',
     'fuhua_list',
     'jiagong_list',
     'shicai_list',
     'cailiao_list',
     'jingshenyuzhou_drop_list',
     'duanzhaohuju',
      'hezi_list',
  'baoshi_list'
  ];
  for (var i of thing) {
    for (var j of data[i]) {
      if (j.name == thing_name) return j;
    }
  }
  let A;
  try {
    A = await Read_it();
  } catch {
    await Writeit([]);
    A = await Read_it();
  }
  if (typeof thing_name != 'string') {
    thing_name=thing_name.name
   }
  for (var j of A) {
    if (j.name == thing_name) return j;
  }
  thing_name = thing_name.replace(/[0-9]+/g, '');
  thing = ['duanzhaowuqi', 'duanzhaohuju', 'duanzhaobaowu', 'zalei'];
  for (var i of thing) {
    for (var j of data[i]) {
      if (j.name == thing_name) return j;
    }
  }
  const craftedBaseName = thing_name.split('·')[0];
  for (const list of ['duanzhaowuqi', 'duanzhaohuju', 'duanzhaobaowu']) {
    const base = data[list].find(item => item.name === craftedBaseName);
    if (base) return { ...base, name: thing_name };
  }
  return false;
}





export async function get_shitujifen_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);;
  let player = await Read_player(usr_qq);
  let commodities_list = data.shitujifen;
  let jifen = player.师徒积分;
  let tianditang_data = {
    name: player.名号,
    jifen: jifen,
    commodities_list: commodities_list,
  };
  const data1 = await new Show(e).get_shitujifenData(tianditang_data);
  return await puppeteer.screenshot('shitujifen', {
    ...data1,
  });
}
//提交任务
export async function get_tijiao_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);;
  let player = await Read_player(usr_qq);
  let user_A;
  let A = e.user_id.toString().replace('qg_','');
    A = await channel(A);;
  user_A = A;
  let shitu = await Read_shitu();
  let i = await found_shitu_2(user_A);
  let jifen = shitu[i].师傅;
  let player2 = await Read_player(jifen);
  if (
    shitu[i].任务阶段 == 1 &&
    shitu[i].renwu1 == 2 &&
    shitu[i].renwu2 == 2 &&
    shitu[i].renwu3 == 2
  ) {
    shitu[i].任务阶段 = 2;
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    await Write_shitu(shitu);
    player.师徒任务阶段 = 2;
    await Write_player(usr_qq, player);
    player2.师徒积分 += 5;
    await Write_player(jifen, player2);
    await Add_修为(usr_qq, 10000);
    await Add_灵石(usr_qq, 10000);
    await Add_血气(usr_qq, 10000);
    e.reply(
      '已完成阶段任务1\n获得奖励：\n1.修为*10000\n2.血气*10000\n3.灵石*10000\n师傅获得奖励：师徒积分*5'
    );
    return;
  } else if (
    shitu[i].任务阶段 == 2 &&
    shitu[i].renwu1 == 2 &&
    shitu[i].renwu2 == 2 &&
    shitu[i].renwu3 == 2
  ) {
    shitu[i].任务阶段 = 3;
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    await Write_shitu(shitu);
    player.师徒任务阶段 = 3;
    await Write_player(usr_qq, player);
    player2.师徒积分 += 15;
    await Write_player(jifen, player2);
    await Add_修为(usr_qq, 40000);
    await Add_灵石(usr_qq, 40000);
    await Add_血气(usr_qq, 40000);
    await Add_najie_thing(usr_qq, '功法盒', '盒子', 1);
     await Add_najie_thing(usr_qq, '药水盒', '盒子', 1);
    e.reply(
      '已完成阶段任务2\n获得奖励：\n1.修为*40000\n2.血气*40000\n3.灵石*40000\n师傅获得奖励：师徒积分*15'
    );
    return;
  } else if (
    shitu[i].任务阶段 == 3 &&
    shitu[i].renwu1 == 2 &&
    shitu[i].renwu2 == 2 &&
    shitu[i].renwu3 == 2
  ) {
    shitu[i].任务阶段 = 4;
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    await Write_shitu(shitu);
    player.师徒任务阶段 = 4;
    await Write_player(usr_qq, player);
    player2.师徒积分 += 20;
    await Write_player(jifen, player2);
    await Add_修为(usr_qq, 50000);
    await Add_灵石(usr_qq, 50000);
    await Add_血气(usr_qq, 50000);
     await Add_najie_thing(usr_qq, '道具盒', '盒子', 1);
     await Add_najie_thing(usr_qq, '功法盒', '盒子', 1);
    e.reply(
      '已完成阶段任务3\n获得奖励：\n1.修为*50000\n2.血气*50000\n2.灵石*50000\n师傅获得奖励：师徒积分*20'
    );
    return;
  } else if (
    shitu[i].任务阶段 == 4 &&
    shitu[i].renwu1 == 2 &&
    shitu[i].renwu2 == 2 &&
    shitu[i].renwu3 == 2
  ) {
    shitu[i].任务阶段 = 5;
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    await Write_shitu(shitu);
    player.师徒任务阶段 = 5;
    await Write_player(usr_qq, player);
    player2.师徒积分 += 30;
    await Write_player(jifen, player2);
    await Add_修为(usr_qq, 150000);
    await Add_灵石(usr_qq, 150000);
    await Add_血气(usr_qq, 150000);
     await Add_najie_thing(usr_qq, '药水盒', '盒子', 1);
     await Add_najie_thing(usr_qq, '道具盒', '盒子', 1);
    e.reply(
      '已完成阶段任务4\n获得奖励：\n1.修为*150000\n2.血气*150000\n3.灵石*150000\n师傅获得奖励：师徒积分*30'
    );
    return;
  } else if (
    shitu[i].任务阶段 == 5 &&
    shitu[i].renwu1 == 2 &&
    shitu[i].renwu2 == 2 &&
    shitu[i].renwu3 == 2
  ) {
    shitu[i].任务阶段 = 0;
    shitu[i].renwu1 = 0;
    shitu[i].renwu2 = 0;
    shitu[i].renwu3 = 0;
    shitu[i].未出师徒弟 = 0;
    shitu[i].已出师徒弟.push(A);
    await Write_shitu(shitu);
    player.师徒任务阶段 = 6;
    await Write_player(usr_qq, player);
    player2.师徒积分 += 50;
    await Write_player(jifen, player2);
    await Add_修为(usr_qq, 250000);
    await Add_灵石(usr_qq, 250000);
    await Add_血气(usr_qq, 250000);
     await Add_najie_thing(usr_qq, '功法盒', '盒子', 3);
     await Add_najie_thing(usr_qq, '药水盒', '盒子', 3);
     await Add_najie_thing(usr_qq, '道具盒', '盒子', 3);
    e.reply(
      '已完成阶段任务5，恭喜你成功出师！\n获得奖励：\n1.修为*250000\n2.血气*250000\n3.灵石*250000\n师傅获得奖励：师徒积分*50'
    );
    return;
  } else if (
    shitu[i].renwu1 == 1 ||
    shitu[i].renwu2 == 1 ||
    shitu[i].renwu3 == 1
  ) {
    e.reply('你还有任务没完成哦~');
    return;
  }
}

export async function found_shitu(A) {
  let shitu = await Read_shitu();
  let i;
  for (i = 0; i < shitu.length; i++) {
    if (shitu[i].师傅 == A) {
      break;
    }
  }
  return i;
}
export async function found_shitu_2(A) {
  let shitu = await Read_shitu();
  let i;
  for (i = 0; i < shitu.length; i++) {
    if (shitu[i].未出师徒弟 == A) {
      break;
    }
  }
  return i;
}
//检索任务状态
export async function get_renwu_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);;
  let player = await Read_player(usr_qq);
  let user_A;
  let A = e.user_id.toString().replace('qg_','');
    A = await channel(A);;
  user_A = A;
  let shitu = await Read_shitu();
  let i = await found_shitu_2(user_A);
  let shifu = await find_shitu(A);
  let tudi = await find_tudi(A);
  //无存档
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  //判断对方有没有存档
  if (shifu == 0 && tudi == 0) {
    e.reply('你还没拜师&收徒过！');
    return;
  }
  if (shitu[i].任务阶段 == 1) {
    if (shitu[i].renwu1 == 1 && player.level_id > 9) {
      shitu[i].renwu1 = 2;
    }
    if (shitu[i].renwu2 == 1 && player.Physique_id > 9) {
      shitu[i].renwu2 = 2;
    }
    if (shitu[i].renwu3 == 1 && player.学习的功法 != 0) {
      shitu[i].renwu3 = 2;
    }
    await Write_shitu(shitu);
  } else if (shitu[i].任务阶段 == 2) {
    if (shitu[i].renwu1 == 1 && player.level_id > 17) {
      shitu[i].renwu1 = 2;
    }
    if (shitu[i].renwu2 == 1 && player.Physique_id > 16) {
      shitu[i].renwu2 = 2;
    }
    if (shitu[i].renwu3 == 1 && player.linggenshow == 0) {
      shitu[i].renwu3 = 2;
    }
    await Write_shitu(shitu);
  } else if (shitu[i].任务阶段 == 3) {
    if (shitu[i].renwu1 == 1 && player.level_id > 25) {
      shitu[i].renwu1 = 2;
    }
    if (shitu[i].renwu2 == 1 && player.Physique_id > 23) {
      shitu[i].renwu2 = 2;
    }
    if (shitu[i].renwu3 == 1 && player.灵石 > 3999999) {
      shitu[i].renwu3 = 2;
    }
    await Write_shitu(shitu);
  } else if (shitu[i].任务阶段 == 4) {
    if (shitu[i].renwu1 == 1 && player.level_id > 33) {
      shitu[i].renwu1 = 2;
    }
    if (shitu[i].renwu2 == 1 && player.Physique_id > 30) {
      shitu[i].renwu2 = 2;
    }
    if (
      shitu[i].renwu3 == 1 &&
      player.occupation != 0 &&
      player.occupation_level > 9
    ) {
      shitu[i].renwu3 = 2;
    }
    await Write_shitu(shitu);
  } else if (shitu[i].任务阶段 == 5) {
    if (shitu[i].renwu1 == 1 && player.level_id > 41) {
      shitu[i].renwu1 = 2;
    }
    if (shitu[i].renwu2 == 1 && player.Physique_id > 37) {
      shitu[i].renwu2 = 2;
    }
    if (shitu[i].renwu3 == 1 && shitu[i].师徒BOOS剩余血量 < 1) {
      shitu[i].renwu3 = 2;
    }
    await Write_shitu(shitu);
  } else if (player.师徒任务阶段 != 0 && player.师徒任务阶段 != 6) {
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    shitu[i].任务阶段 = player.师徒任务阶段;
    shitu[i].师徒BOOS剩余血量 = 100000000;
    await Write_shitu(shitu);
    e.reply(
      `任务已刷新！\n你上次任务进行到了阶段${player.师徒任务阶段}已自动为你延续`
    );
    return;
  } else if (player.任务阶段 != 6) {
    shitu[i].renwu1 = 1;
    shitu[i].renwu2 = 1;
    shitu[i].renwu3 = 1;
    shitu[i].任务阶段 = 1;
    shitu[i].师徒BOOS剩余血量 = 100000000;
    await Write_shitu(shitu);
    player.师徒任务阶段 = 1;
    await Write_player(usr_qq, player);
    e.reply('任务已刷新！');
    return;
  } else {
    e.reply('你已经毕业了，就别来做师徒任务了吧');
    return;
  }
  return;
}
/**
 * 我的弟子
 * @return image
 */
export async function get_shitu_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);;
  let player = await Read_player(usr_qq);
  let user_A;
  let A = e.user_id.toString().replace('qg_','');
    A = await channel(A);;
  user_A = A;
  let shitu = await Read_shitu();
  let x = await found_shitu(user_A);
  let shifu = await find_shitu(A);
  //无存档
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  //判断对方有没有存档
  if (shifu == 0) {
    e.reply('你还没有收过徒弟');
    return;
  }

  let action = await find_shitu(A);
  if (action == false) {
    await fstadd_shitu(A);
  }
  let newaction = await Read_shitu();
  let i;
  for (i = 0; i < newaction.length; i++) {
    if (newaction[i].师傅 == A) {
      //有加入宗门
      let ass;
      ass = player.师徒积分;
      let renwu1 = '当前没有任务';
      let renwu2 = '当前没有任务';
      let renwu3 = '当前没有任务';
      let wc1;
      let wc2;
      let wc3;
      let new1 = 0;
      if (newaction[i].未出师徒弟 != 0) {
        new1 = 1;
      }
      let item;
      let chengyuan = [];
      for (item in newaction[i].已出师徒弟) {
        chengyuan[item] =
          '道号：' +
          data.getData('player', newaction[i].已出师徒弟[item]).名号 +
          'QQ：' +
          newaction[i].已出师徒弟[item];
      }
      if (shitu[x].任务阶段 == 1) {
        renwu1 = '练气等级达到筑基巅峰';
        renwu2 = '炼体等级达到炼肉巅峰';
        renwu3 = '学习一个功法';
      } else if (shitu[x].任务阶段 == 2) {
        renwu1 = '练气等级达到元婴中期';
        renwu2 = '练体等级达到炼骨初期';
        renwu3 = '消耗一个定灵珠';
      } else if (shitu[x].任务阶段 == 3) {
        renwu1 = '练气等级达到化神圆满';
        renwu2 = '练体等级达到炼血后期';
        renwu3 = '拥有400w灵石(此项任务不会扣除灵石！)';
      } else if (shitu[x].任务阶段 == 4) {
        renwu1 = '练气等级达到合体后期';
        renwu2 = '练体等级达到炼脏圆满';
        renwu3 = '进行一次转职且等级到达黄袍中品';
      } else if (shitu[x].任务阶段 == 5) {
        renwu1 = '羽化登仙';
        renwu2 = '练体等级达到炼神中期';
        renwu3 = '击败师徒BOSS';
      }
      if (shitu[x].renwu1 == 0) {
        wc1 = '(未接取)';
      } else if (shitu[x].renwu1 == 1) {
        wc1 = '(未完成)';
      } else if (shitu[x].renwu1 == 2) {
        wc1 = '(已完成)';
      }
      if (shitu[x].renwu2 == 0) {
        wc2 = '(未接取)';
      } else if (shitu[x].renwu2 == 1) {
        wc2 = '(未完成)';
      } else if (shitu[x].renwu2 == 2) {
        wc2 = '(已完成)';
      }
      if (shitu[x].renwu3 == 0) {
        wc3 = '(未接取)';
      } else if (shitu[x].renwu3 == 1) {
        wc3 = '(未完成)';
      } else if (shitu[x].renwu3 == 2) {
        wc3 = '(已完成)';
      }
      let newchengyuan = data.getData('player', newaction[i].未出师徒弟).名号;
      let shitu_data = {
        user_id: usr_qq,
        minghao: player.名号,
        shifu: newaction[i].师傅,
        shimen: ass,
        renwu: newaction[i].任务阶段,
        tudinum: newaction[i].已出师徒弟.length + new1,
        rw1: renwu1,
        rw2: renwu2,
        rw3: renwu3,
        wancheng1: wc1,
        wancheng2: wc2,
        wancheng3: wc3,
        chengyuan: chengyuan,
        newchengyuan: newchengyuan,
      };
      const data1 = await new Show(e).get_shituData(shitu_data);
      return await puppeteer.screenshot('shitu', {
        ...data1,
      });
    }
  }
}
/**
 * 我的师傅
 * @return image
 */
export async function get_shifu_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);;
  let player = await Read_player(usr_qq);
  let user_A;
  let A = e.user_id.toString().replace('qg_','');
    A = await channel(A);;
  user_A = A;
  let shitu = await Read_shitu();
  let x = await found_shitu_2(user_A);
  //无存档
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
    return;
  }
  let action = await find_shitu(A);
  if (action == false) {
    await fstadd_shitu(A);
  }
  let newaction = await Read_shitu();
  let i;
  let newi = await chushi(A);
  if (newi == undefined) {
    newi = [5, 5];
  }
  for (i = 0; i < newaction.length; i++) {
    if (newaction[i].未出师徒弟 == A || newi[0] == A) {
      //有加入宗门;
      if (newi[0] == A) {
        newaction[i] = newi[1];
      }
      let ass;
      ass = player.师徒积分;
      let renwu1 = '请先输入"#提交任务"获取任务';
      let renwu2 = '请先输入"#提交任务"获取任务';
      let renwu3 = '请先输入"#提交任务"获取任务';
      let wc1;
      let wc2;
      let wc3;
      let new1 = 0;
      if (newaction[i].未出师徒弟 != 0) {
        new1 = 1;
      }
      let item;
      let chengyuan = [];
      for (item in newaction[i].已出师徒弟) {
        if (newaction[i].已出师徒弟[item] == A) {
          continue;
        }
        chengyuan[item] =
          '道号：' +
          data.getData('player', newaction[i].已出师徒弟[item]).名号 +
          'QQ：' +
          newaction[i].已出师徒弟[item];
      }
      if (shitu[x].任务阶段 == 1) {
        renwu1 = '练气等级达到筑基巅峰';
        renwu2 = '炼体等级达到炼肉巅峰';
        renwu3 = '学习一个功法';
      } else if (shitu[x].任务阶段 == 2) {
        renwu1 = '练气等级达到元婴中期';
        renwu2 = '练体等级达到炼骨初期';
        renwu3 = '消耗一个定灵珠';
      } else if (shitu[x].任务阶段 == 3) {
        renwu1 = '练气等级达到化神圆满';
        renwu2 = '练体等级达到炼血后期';
        renwu3 = '拥有400w灵石(此项任务不会扣除灵石！)';
      } else if (shitu[x].任务阶段 == 4) {
        renwu1 = '练气等级达到合体后期';
        renwu2 = '练体等级达到炼脏圆满';
        renwu3 = '进行一次转职且等级到达黄袍中品';
      } else if (shitu[x].任务阶段 == 5) {
        renwu1 = '羽化登仙';
        renwu2 = '练体等级达到炼神中期';
        renwu3 = '击败师徒BOSS';
      }
      if (shitu[x].renwu1 == 0) {
        wc1 = '(未接取)';
      } else if (shitu[x].renwu1 == 1) {
        wc1 = '(未完成)';
      } else if (shitu[x].renwu1 == 2) {
        wc1 = '(已完成)';
      }
      if (shitu[x].renwu2 == 0) {
        wc2 = '(未接取)';
      } else if (shitu[x].renwu2 == 1) {
        wc2 = '(未完成)';
      } else if (shitu[x].renwu2 == 2) {
        wc2 = '(已完成)';
      }
      if (shitu[x].renwu3 == 0) {
        wc3 = '(未接取)';
      } else if (shitu[x].renwu3 == 1) {
        wc3 = '(未完成)';
      } else if (shitu[x].renwu3 == 2) {
        wc3 = '(已完成)';
      }
    }
  }
      let shifu = data.getData('player', newaction[i].师傅).名号;
      let shifu_data = {
        user_id: usr_qq,
        minghao: player.名号,
        shifu: shifu,
        shimen: ass,
        renwu: newaction[i].任务阶段,
        tudinum: newaction[i].已出师徒弟.length + new1,
        rw1: renwu1,
        rw2: renwu2,
        rw3: renwu3,
        wancheng1: wc1,
        wancheng2: wc2,
        wancheng3: wc3,
        chengyuan: chengyuan,
      };
      const data1 = await new Show(e).get_shifuData(shifu_data);
      return await puppeteer.screenshot('shifu', {
        ...data1,
      });
    
}

// }<---这个括号导致整个插件无法运行，罪大恶极

export async function chushi(A) {
  let t;
  let i;
  let newaction = await Read_shitu();
  for (i = 0; i < newaction.length; i++) {
    for (t = 0; t < newaction[i].已出师徒弟.length; t++) {
      if (newaction[i].已出师徒弟[t] == A) {
        return [newaction[i].已出师徒弟[t], newaction[i]];
      }
    }
  }
}
export {

  get_random_aptitude  // 确保这一行存在
};

// 创建内景地空间
export async function Create_inner_world(usr_qq) {
  const dir = path.join(__PATH.inner_world_path, `${usr_qq}.json`);

  if (!fs.existsSync(__PATH.inner_world_path)) {
    fs.mkdirSync(__PATH.inner_world_path, { recursive: true });
  }

  // 🔧 修复：原代码引用了不存在的 createInnerWorld()，导致首次存入触发 ReferenceError
  // 改为直接内联默认 schema（与 resources/data/inner_world/*.json 既有结构保持一致）
  const defaultInnerWorld = {
    等级: 1,
    灵石: 0,
    当前容量: 0,
    最大容量: 500,
    装备: [],
    丹药: [],
    道具: [],
    功法: [],
    草药: [],
    食材: [],
    盒子: [],
    材料: [],
    仙宠: [],
    仙宠口粮: [],
    宝石: [],
    最后更新时间: Date.now()
  };

  fs.writeFileSync(dir, JSON.stringify(defaultInnerWorld, null, 2), 'utf8');
}

// 读取内景地空间
export async function Read_inner_world(usr_qq) {
  const dir = path.join(__PATH.inner_world_path, `${usr_qq}.json`);
  
  if (!fs.existsSync(dir)) {
    await Create_inner_world(usr_qq);
  }
  
  return JSON.parse(fs.readFileSync(dir, 'utf8'));
}

// 写入内景地空间
export async function Write_inner_world(usr_qq, data) {
  const dir = path.join(__PATH.inner_world_path, `${usr_qq}.json`);
  fs.writeFileSync(dir, JSON.stringify(data, null, 2), 'utf8');
}

// 添加物品到内景地
// 修改 Add_inner_world_thing 支持合并相同物品
export async function Add_inner_world_thing(usr_qq, item, category) {
  const innerWorld = await Read_inner_world(usr_qq);
  
  if (!Array.isArray(innerWorld[category])) {
    innerWorld[category] = [];
  }

  // 查找是否已存在相同物品
  const existingItem = innerWorld[category].find(
    i => i.name === item.name && i.pinji === item.pinji
  );

  if (existingItem) {
    existingItem.数量 += (item.数量 || 1); // 合并数量
  } else {
    innerWorld[category].push(item);
  }

  // 更新当前容量
  innerWorld.当前容量 += getItemSize(item, category);
  await Write_inner_world(usr_qq, innerWorld);
}

// 从内景地移除物品
// 修改 Remove_inner_world_thing
export async function Remove_inner_world_thing(usr_qq, itemName, category) {
  const innerWorld = await Read_inner_world(usr_qq);
  
  const [removedItem] = innerWorld[category].filter(
    item => item.name === itemName
  );
  
  if (removedItem) {
    innerWorld[category] = innerWorld[category].filter(
      item => item.name !== itemName
    );
    // 扣除对应容量
    innerWorld.当前容量 -= getItemSize(removedItem, category);
    await Write_inner_world(usr_qq, innerWorld);
    return removedItem; // 返回被移除的物品
  }
  
  return null; // 未找到物品
}
// 计算物品占用空间
export function getItemSize(item, category) {
  const rule = ITEM_SPACE_RULES[category] || ITEM_SPACE_RULES['默认'];
  return rule(1) * (item.数量 || 1); 
}

// 检查能否存入
export async function checkStorageSpace(usr_qq, itemSize) {
  const innerWorld = await Read_inner_world(usr_qq);
  return innerWorld.当前容量 + itemSize <= innerWorld.最大容量;
}
/* ---------- 辅助：读位面等级 ---------- */
export async function getWeimianLevel() {
  try {
    const path = data.filePathMap.weimianList;
    if (!fs.existsSync(path)) return 10;
    return JSON.parse(fs.readFileSync(path, 'utf8'))['诸天位面'] || 10;
  } catch {
    return 10;
  }
}
/**
 * 从消息文本中提取 QQ 号（不包含自己）
 */
export  function getTargetQQFromMessage(e, selfQQ = '') {
  const text = String(e?.msg || e?.raw_message || '');
  const ids = text.match(/\b\d{5,20}\b/g) || [];
  return ids.find(id => String(id) !== String(selfQQ)) || '';
}

/**
 * 从事件中获取被 @ 的目标 QQ（优先 at，兜底文本）
 */
export  function getTargetQQFromEvent(e, selfQQ = '') {
  const atItem = Array.isArray(e?.message)
    ? e.message.find(item => item?.type === 'at')
    : null;

  const id = String(
    getTargetQQFromMessage(e, selfQQ) ||
      e?.at ||
      e?.target_id ||
      e?.target_user_id ||
      atItem?.qq ||
      atItem?.user_id ||
      atItem?.id ||
      atItem?.data?.qq ||
      atItem?.data?.user_id ||
      atItem?.data?.id ||
      ''
  ).replace('qg_', '');

  // 二次校验：必须是合法 QQ
  if (!/^\d{5,20}$/.test(id)) return '';
  return id !== String(selfQQ) ? id : '';
}

// ==================== 行动条公共函数（供团本 tuanben 等复用，勿造轮子） ====================
// 行动条满 max 点方可出手，速度决定先机；拉条=立即再动，推条=延后行动。
export const ACTION_BAR_MAX = 3000;

// 初始化单位的行动条字段：_actionBar / _speed / _speedBoost
// 速度算法：传入 speed 则直接作为最终速度（不再叠加）；否则用 基础速度 + 秘境*50 + 仙古*50
export function initActionBar(unit, { speed, boost = 1.0 } = {}) {
  unit._actionBar = unit._actionBar || 0;
  const base = (speed != null)
    ? speed
    : (unit.速度 ?? 100) + (unit.mijinglevel_id ?? 0) * 50 + (unit.xiangulevel_id ?? 0) * 50;
  unit._speed = Math.floor(base);
  unit._speedBoost = boost;
  return unit;
}

// 推进所有存活单位的行动条（每单位 += floor(_speed * _speedBoost)）
export function advanceUnitBars(units, max = ACTION_BAR_MAX) {
  for (const u of units) {
    if (u.当前血量 > 0) {
      u._actionBar = (u._actionBar || 0) + Math.floor((u._speed || 100) * (u._speedBoost || 1));
    }
  }
}

// 取本拍就绪（行动条 >= max）的单位，速度优先，溢出量用于同速判定。
export function getReadyUnits(units, max = ACTION_BAR_MAX) {
  return units
    .filter(u => u.当前血量 > 0 && (u._actionBar || 0) >= max)
    .sort((a, b) =>
      ((b._speed || 0) - (a._speed || 0)) ||
      ((b._actionBar || 0) - (a._actionBar || 0))
    );
}

// 拉条：行动条增加 amount（封顶 max），用于「气势如虹立即再动」
export function boostActionBar(unit, amount, max = ACTION_BAR_MAX) {
  unit._actionBar = Math.min((unit._actionBar || 0) + amount, max);
  return (unit._actionBar || 0) >= max;
}

// 推条：行动条减少 amount（最低 0），用于「被镇压延后行动」
export function pushBackActionBar(unit, amount) {
  unit._actionBar = Math.max((unit._actionBar || 0) - amount, 0);
}
