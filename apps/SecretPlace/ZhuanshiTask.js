import { plugin, common, config, data } from '../../api/api.js';
import fs from 'fs';
import { __PATH } from '../../model/xiuxian.js';
import {
  Read_player,
  Write_player,
  Write_equipment,
  Write_najie,
  Write_danyao,
  Add_HP,
  isNotNull,
  get_random_talent,
  get_random_fromARR,
  Read_najie
} from '../../model/xiuxian.js';

let ZxTask = null;

// ==================== 境界体系 ====================
const MijingLevels = [
  { id: 1, name: "凡人", desc: "红尘中挣扎，百年后一抔黄土" },
  { id: 2, name: "轮海秘境·苦海", desc: "生命之轮与苦海同生，修士第一步" },
  { id: 3, name: "轮海秘境·命泉", desc: "命泉喷涌，神力源泉初现" },
  { id: 4, name: "轮海秘境·神桥", desc: "横渡苦海，神桥通天" },
  { id: 5, name: "轮海秘境·彼岸", desc: "到达彼岸，脱胎换骨" },
  { id: 6, name: "道宫秘境·五大神藏", desc: "心肝脾肺肾，五神孕道" },
  { id: 7, name: "四极秘境·四重天", desc: "四肢通天，力撼山河" },
  { id: 8, name: "化龙秘境·九重天", desc: "脊柱如龙，九变登天" },
  { id: 9, name: "仙台秘境·半步大能", desc: "仙台初筑，半步之遥" },
  { id: 10, name: "仙台秘境·大能", desc: "一方霸主，威震一域" },
  { id: 11, name: "仙台秘境·斩道王者", desc: "斩断前路，我道唯一" },
  { id: 12, name: "仙台秘境·圣人", desc: "圣贤之境，法则加身" },
  { id: 13, name: "仙台秘境·圣人王", desc: "圣中之王，俯视苍生" },
  { id: 14, name: "仙台秘境·大圣", desc: "准帝之下，举世无双" },
  { id: 15, name: "准帝九重天", desc: "九重天梯，一步一劫" },
  { id: 16, name: "大帝", desc: "人道绝巅，一世无敌" },
  { id: 17, name: "红尘仙", desc: "于红尘中九世成仙" },
  { id: 18, name: "仙王", desc: "仙中之王，万古不灭" },
  { id: 19, name: "仙王巨头", desc: "巨头之威，震慑诸天" },
  { id: 20, name: "道祖·准仙帝", desc: "道之极致，半步超脱" },
  { id: 21, name: "路尽级仙帝", desc: "进化路的尽头，至高无上" },
  { id: 22, name: "祭道", desc: "祭掉自身大道，超越极限" },
  { id: 23, name: "祭道之上", desc: "超越祭道，不可言说" },
  { id: 24, name: "唯一道之上", desc: "道之外，永恒自在" }
];

// ==================== 天资体系 ====================
const aptitudeGrades = {
  '无演无尽': 0.00001,   // 0.001% - 超脱天道
  '万古无双': 0.0001,    // 0.01% - 百万年难遇
  '绝世天骄': 0.001,     // 0.1% - 十万年难遇
  '旷世奇才': 0.005,     // 0.5% - 万年难遇
  '天纵之资': 0.01,      // 1% - 百年难遇
  '超凡资质': 0.05,      // 5% - 宗门核心
  '平庸之资': 0.78379,   // 78.379% - 芸芸众生
  '先天不足': 0.1,       // 10% - 道途艰难
  '天弃之人': 0.05,       // 5% - 天道不容
  '生而痴傻': 0.005,       // 0.5% - 灵智蒙尘
  '无化如是': 0.001       // 0.1% - 大道难成
};

// 天资评价（辰东风格）
const aptitudeDescriptions = {
  '无演无尽': '亘古未有，超脱天道之外，一念可演诸天万界，此等天资已非生灵所能拥有',
  '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，注定永恒无敌于世间',
  '绝世天骄': '惊才绝艳，具备大帝之姿，注定为一个时代的天地主角，万族共尊',
  '旷世奇才': '万年难遇，此等资质放眼九天十地也是凤毛麟角，有望触及准帝之境',
  '天纵之资': '天赋异禀，媲美上古大教圣子，若是不陨，必成一方巨擘',
  '超凡资质': '资质超凡，注定异于常人，可拜入圣地，得真传',
  '平庸之资': '资质平平，如那芸芸众生，若无大机缘，终生难窥仙道',
  '先天不足': '先天有缺，如那漏底的木桶，修炼事倍功半，需以百倍努力弥补',
  '天弃之人': '被天道所弃，修炼必遭反噬，每一步都如行走在刀尖之上，九死一生',
  '生而痴傻': '天生愚笨，灵智蒙尘，修炼难如登天，纵有仙经在前，亦难明其义',
  '无化如是': '无用之人，命中注定难有所为，如那风中残烛，随时可灭'
};

// 天资等级顺序（从高到低）
const aptitudeOrder = [
  '无演无尽', '万古无双', '绝世天骄', '旷世奇才', '天纵之资',
  '超凡资质', '平庸之资', '先天不足', '天弃之人', '生而痴傻', '无化如是'
];

// ==================== 轮回异象 ====================
const rebirthPhenomena = [
  "九天之上，雷海沸腾，仿佛天道在怒吼",
  "黄泉路上，彼岸花开，如血般妖艳",
  "六道轮回盘虚影浮现，镇压万古青天",
  "时间长河显化，过去未来交织",
  "混沌青莲摇曳，洒落大道之光",
  "飞仙之光划破黑暗，如那开天辟地第一缕光",
  "万鬼哭嚎，似在恭送一位无上存在",
  "仙乐阵阵，有真仙虚影在混沌中诵经",
  "阴阳二气化作太极图，缓缓转动",
  "星辰坠落，如那烟花般绚烂"
];

// 获取随机天资
function get_random_aptitude() {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [grade, prob] of Object.entries(aptitudeGrades)) {
    cumulative += prob;
    if (rand < cumulative) {
      return {
        grade: grade,
        evaluation: aptitudeDescriptions[grade],
        probability: prob
      };
    }
  }
  return { grade: '平庸之资', evaluation: aptitudeDescriptions['平庸之资'], probability: 0.78379 };
}

// 降低天资
function downgradeAptitude(currentAptitude) {
  const currentIndex = aptitudeOrder.indexOf(currentAptitude);
  if (currentIndex === -1 || currentIndex >= aptitudeOrder.length - 1) {
    return '无化如是'; // 已是最低，无法再降
  }
  return aptitudeOrder[currentIndex + 1];
}

// 判断能否硬扛阴阳大磨盘
function canWithstandYinYangGrind(player) {
  return (player.mijinglevel_id >= 11) || (player.xiangulevel_id >= 9);
}

// 发送消息
async function sendRebirthMessage(e, message) {
  try {
    if (e?.reply) {
      await e.reply(message);
    } else if (e?.group_id) {
      await e.reply(message);
    } else if (e?.user_id) {
      await common.relpyPrivate(e.user_id, message);
    }
  } catch (err) {
    console.error('【轮回】发送消息失败:', err);
  }
}

// 获取随机称号
function getRandomTitle() {
  const titles = [
    '路人', '散修', '道童', '剑客', '刀客', '书生', '侠客',
    '游子', '浪人', '隐士', '行者', '求道者', '问心人',
    '苦行僧', '摆渡人', '守墓人', '采药人', '铸剑师'
  ];
  return titles[Math.floor(Math.random() * titles.length)];
}

// 获取随机异象
function getRandomPhenomenon() {
  return rebirthPhenomena[Math.floor(Math.random() * rebirthPhenomena.length)];
}

// ==================== 纳戒掉落系统 ====================
// 位面定义
const weimianList = [
  { id: 0, name: "下界八域", minX: 1, maxX: 100, minY: 1, maxY: 100 },
  { id: 1, name: "九天十地", minX: 101, maxX: 500, minY: 101, maxY: 500 },
  { id: 2, name: "遮天位面", minX: 501, maxX: 1000, minY: 501, maxY: 1000 },
  { id: 3, name: "禁地", minX: 1001, maxX: 2000, minY: 1001, maxY: 2000 },
  { id: 4, name: "仙境", minX: 2001, maxX: 5000, minY: 2001, maxY: 5000 },
  { id: 5, name: "仙古秘境", minX: 5001, maxX: 10000, minY: 5001, maxY: 10000 },
  { id: 6, name: "古地府", minX: 10001, maxX: 20000, minY: 10001, maxY: 20000 },
  { id: 7, name: "轮回路", minX: 20001, maxX: 50000, minY: 20001, maxY: 50000 },
];

// 根据轮回次数确定可能掉落的位面范围
function getAvailableWeimian(lunhuiCount) {
  if (lunhuiCount <= 1) {
    return weimianList.slice(0, 2); // 前两个位面
  } else if (lunhuiCount <= 3) {
    return weimianList.slice(0, 4);
  } else if (lunhuiCount <= 5) {
    return weimianList.slice(0, 6);
  } else {
    return weimianList; // 所有位面
  }
}

// 生成随机掉落坐标
function generateDropLocation(lunhuiCount) {
  const availableWeimian = getAvailableWeimian(lunhuiCount);
  const weimian = availableWeimian[Math.floor(Math.random() * availableWeimian.length)];
  const x = Math.floor(Math.random() * (weimian.maxX - weimian.minX + 1)) + weimian.minX;
  const y = Math.floor(Math.random() * (weimian.maxY - weimian.minY + 1)) + weimian.minY;
  
  return {
    weimianId: weimian.id,
    weimianName: weimian.name,
    x: x,
    y: y
  };
}

// 纳戒是否为空
function isNajieEmpty(najie) {
  const categories = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '盒子', '仙宠', '仙宠口粮', '宝石'];
  for (const cat of categories) {
    if (najie[cat] && najie[cat].length > 0) {
      return false;
    }
  }
  return najie.灵石 <= 0 && najie.源石 <= 0;
}

// 创建纳戒掉落记录
async function createNajieDrop(player_id, oldPlayer, oldNajie) {
  const lunhuiCount = oldPlayer.轮回转世次数 || 0;
  const location = generateDropLocation(lunhuiCount);
  
  // 计算纳戒价值
  let value = oldNajie.灵石 || 0;
  value += (oldNajie.源石 || 0) * 10000;
  
  const dropData = {
    player_id: player_id,
    player_name: oldPlayer.名号,
    najie: oldNajie,
    location: location,
    lunhuiCount: lunhuiCount,
    createTime: Date.now(),
    expiredTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天后过期
    beFound: false
  };
  
  // 保存到Redis
  const dropKey = `xiuxian:najie_drop:${player_id}:${Date.now()}`;
  await redis.set(dropKey, JSON.stringify(dropData), { EX: 7 * 24 * 60 * 60 });
  
  // 同时保存一份索引，方便查询
  const indexKey = `xiuxian:najie_drop_index`;
  await redis.zAdd(indexKey, { score: Date.now(), value: dropKey });
  
  return { location, value };
}

// 获取所有未捡取的纳戒掉落
async function getAllNajieDrops() {
  const indexKey = `xiuxian:najie_drop_index`;
  const now = Date.now();
  
  // 获取所有掉落键
  const dropKeys = await redis.zRange(indexKey, 0, -1);
  const drops = [];
  
  for (const key of dropKeys) {
    try {
      const dropData = await redis.get(key);
      if (dropData) {
        const data = JSON.parse(dropData);
        if (!data.beFound && now < data.expiredTime) {
          drops.push({ key, ...data });
        }
      }
    } catch (e) {
      console.error('读取纳戒掉落失败:', e);
    }
  }
  
  return drops;
}

// 获取指定位面的纳戒掉落
async function getNajieDropsByWeimian(weimianId) {
  const allDrops = await getAllNajieDrops();
  return allDrops.filter(drop => drop.location.weimianId === weimianId);
}

// 捡取纳戒
async function pickupNajieDrop(dropKey, pickerId) {
  const dropData = await redis.get(dropKey);
  if (!dropData) {
    return { success: false, message: '纳戒不存在或已被捡取' };
  }
  
  const data = JSON.parse(dropData);
  if (data.beFound) {
    return { success: false, message: '纳戒已被捡取' };
  }
  
  // 检查过期
  if (Date.now() > data.expiredTime) {
    return { success: false, message: '纳戒已过期消散' };
  }
  
  // 将纳戒内容添加到捡取者
  const najie = data.najie;
  
  // 写入新的纳戒文件（覆盖原玩家的纳戒）
  await Write_najie(pickerId, najie);
  
  // 标记为已捡取
  data.beFound = true;
  data.foundTime = Date.now();
  data.foundBy = pickerId;
  await redis.set(dropKey, JSON.stringify(data));
  
  // 从索引中移除
  const indexKey = `xiuxian:najie_drop_index`;
  await redis.zRem(indexKey, dropKey);
  
  return { 
    success: true, 
    data: data,
    najie: najie
  };
}

// 格式化坐标显示
function formatLocation(location) {
  return `[${location.weimianName}]坐标(${location.x}, ${location.y})`;
}

// ==================== 创建新玩家 ====================
async function createNewPlayerAfterRebirth(e, oldPlayer, isChixiao, downgradedAptitude) {
  try {
    const player_id = oldPlayer.id;
    let File_msg = fs.readdirSync(__PATH.player_path);
    let n = File_msg.length + 1;
    
    const talent = await get_random_talent();
    
    let newAptitude;
    if (isChixiao) {
      newAptitude = {
        grade: '生而痴傻',
        evaluation: '前世灵魂在阴阳大磨盘中磨灭殆尽，仅余一缕残魂，灵智蒙尘，如那初生之婴'
      };
    } else if (downgradedAptitude) {
      newAptitude = {
        grade: downgradedAptitude,
        evaluation: aptitudeDescriptions[downgradedAptitude] + '（轮回磨砺，道基受损，前世荣光不再）'
      };
    } else {
      newAptitude = await get_random_aptitude();
    }
    
    // 轮回奖励计算
    const lunhuiGanwu = oldPlayer.轮回感悟 || 0;
    const hasYinji = oldPlayer.轮回印记 || false;
    
    let new_player = {
      id: player_id,
      sex: 0,
      名号: isChixiao ? `痴儿${n}号` : oldPlayer.痴傻状态 ? `痴儿${n}号` : `${getRandomTitle()}${n}号`,
      宣言: '这一世，我要踏破诸天，证道永恒！',
      daofa: '未开启',
      level_id: 1,
      Physique_id: 1,
      mijinglevel_id: 1,
      xiangulevel_id: 1,
      神识: 0,
      元神: 0,
      元神上限: 0,
      race: 1,
      修为: 1,
      血气: 1,
      灵石: 10000 + lunhuiGanwu * 1000,
      源石: 0,
      生命本源: 100,
      灵根: talent,
      神石: 0,
      寿元: 99 + lunhuiGanwu * 5,
      favorability: 0,
      breakthrough: false,
      linggen: [],
      linggenshow: 1,
      学习的功法: [],
      修炼效率提升: talent.eff,
      饱食度: 0,
      热量: 0,
      连续签到天数: 0,
      道法赐福天数: 0,
      攻击加成: 0,
      防御加成: 0,
      生命加成: 0,
      power_place: 0,
      当前血量: 8000 + lunhuiGanwu * 100,
      lunhui: 0,
      lunhuiBH: 0,
      轮回点: 10 + lunhuiGanwu,
      daofaxianshu: 0,
      daofaxianshu_endtime: 0,
      occupation: [],
      occupation_level: 1,
      镇妖塔层数: 0,
      神魄段数: 0,
      魔道值: 0,
      仙宠: [],
      练气皮肤: 0,
      装备皮肤: 0,
      纳戒皮肤: 0,
      幸运: 0 + lunhuiGanwu,
      addluckyNo: 0,
      师徒任务阶段: 0,
      师徒积分: 0,
      attempting_level_7: false,
      guardian: null,
      抽奖次数: 0,
      出金率: 0,
      出金次数: 0,
      庇护人: "",
      仙宠寻宝状态: 0,
      仙宠寻宝: "",
      仙宠寻宝开始时间: 0,
      护道人: "无",
      势力: "无",
      势力职位: "",
      天资等级: newAptitude.grade,
      天资评价: newAptitude.evaluation,
      五色祭坛: 0,
      痴傻状态: isChixiao || oldPlayer.痴傻状态 || false,
      轮回转世次数: (oldPlayer.轮回转世次数 || 0) + 1,
      轮回感悟: lunhuiGanwu,
      轮回印记: hasYinji
    };
    
    // 轮回印记加成
    if (hasYinji) {
      new_player.轮回点 += 5;
      new_player.幸运 += 5;
      new_player.寿元 += 10;
    }
    
    return new_player;
  } catch (err) {
    console.error('创建新玩家失败:', err);
    throw err;
  }
}

// ==================== 处理宗门关系 ====================
async function handleSectRelationship(player_id, oldPlayer) {
  if (!isNotNull(oldPlayer.宗门)) return;
  
  let ass = data.getAssociation(oldPlayer.宗门.宗门名称);
  if (!ass) return;
  
  if (oldPlayer.宗门.职位 !== '宗主') {
    // 普通成员，直接移除
    if (ass[oldPlayer.宗门.职位]) {
      ass[oldPlayer.宗门.职位] = ass[oldPlayer.宗门.职位].filter(item => item != player_id);
    }
    ass['所有成员'] = ass['所有成员'].filter(item => item != player_id);
    await data.setAssociation(ass.宗门名称, ass);
  } else {
    // 宗主陨落，宗门大乱
    if (ass.所有成员.length < 2) {
      // 宗门覆灭
      try {
        const assFile = `${data.filePathMap.association}/${oldPlayer.宗门.宗门名称}.json`;
        if (fs.existsSync(assFile)) fs.unlinkSync(assFile);
      } catch (error) {
        console.warn('宗门覆灭:', error);
      }
    } else {
      // 传承之争
      ass['所有成员'] = ass['所有成员'].filter(item => item != player_id);
      
      let newSectMaster = null;
      if (ass.长老 && ass.长老.length > 0) {
        newSectMaster = await get_random_fromARR(ass.长老);
      } else if (ass.内门弟子 && ass.内门弟子.length > 0) {
        newSectMaster = await get_random_fromARR(ass.内门弟子);
      } else {
        newSectMaster = await get_random_fromARR(ass.所有成员);
      }
      
      if (newSectMaster) {
        let newMaster = await data.getData('player', newSectMaster);
        if (newMaster && newMaster.宗门) {
          if (ass[newMaster.宗门.职位]) {
            ass[newMaster.宗门.职位] = ass[newMaster.宗门.职位].filter(
              item => item != newSectMaster
            );
          }
          ass['宗主'] = newSectMaster;
          newMaster.宗门.职位 = '宗主';
          await data.setData('player', newSectMaster, newMaster);
          await data.setAssociation(ass.宗门名称, ass);
        }
      }
    }
  }
}

// ==================== 强制再入仙途 ====================
async function forceRebirthPlayer(e, oldPlayer, acount, isChixiao = false, downgradedAptitude = null) {
  try {
    const player_id = oldPlayer.id;
    console.log(`【再入仙途】玩家 ${player_id} 开始转世...`);
    
    // 1. 处理宗门
    await handleSectRelationship(player_id, oldPlayer);
    
    // 2. 读取旧纳戒并创建掉落（先读取再删除）
    let dropInfo = null;
    try {
      const oldNajie = await Read_najie(player_id);
      if (oldNajie && !isNajieEmpty(oldNajie)) {
        dropInfo = await createNajieDrop(player_id, oldPlayer, oldNajie);
        console.log(`【纳戒掉落】玩家 ${player_id} 的纳戒掉落至 ${formatLocation(dropInfo.location)}`);
      }
    } catch (error) {
      console.error('处理纳戒掉落失败:', error);
    }
    
    // 3. 删除旧存档（保留纳戒掉落记录）
    try {
      const files = [
        `${__PATH.player_path}/${player_id}.json`,
        `${__PATH.equipment_path}/${player_id}.json`,
        `${__PATH.najie_path}/${player_id}.json`
      ];
      files.forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
    } catch (error) {
      console.error('删除旧存档失败:', error);
    }
    
    // 5. 创建新玩家
    const new_player = await createNewPlayerAfterRebirth(e, oldPlayer, isChixiao, downgradedAptitude);
    
    // 6. 初始化装备
    let new_equipment = {
      武器: data.equipment_list.find(item => item.name == '烂铁匕首'),
      护具: data.equipment_list.find(item => item.name == '破铜护具'),
      法宝: data.equipment_list.find(item => item.name == '廉价炮仗'),
      帝兵: data.dibing_list.find(item => item.name == '废铁'),
    };
    
    // 7. 初始化纳戒
    let new_najie = {
      等级: 1,
      灵石上限: 5000 + (oldPlayer.轮回感悟 || 0) * 100,
      灵石: 0,
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
    };
    
    // 8. 写入数据
    await Write_player(player_id, new_player);
    await Write_equipment(player_id, new_equipment);
    await Write_najie(player_id, new_najie);
    await Add_HP(player_id, 999999);
    
    // 9. 初始化丹药
    const arr = {
      biguan: 0, biguanxl: 0, xingyun: 0, lianti: 0,
      ped: 0, modao: 0,
      beiyong1: 0, beiyong2: 0, beiyong3: 0, beiyong4: 0, beiyong5: 0,
    };
    await Write_danyao(player_id, arr);
    
    // 10. 更新Redis
    await redis.set('xiuxian:player:' + player_id + ':last_reCreate_time', Date.now());
    await redis.set('xiuxian:player:' + player_id + ':reCreate_acount', acount + 1);
    
    // 11. 构建消息
    let effectMsg = '';
    if (isChixiao) {
      effectMsg = '\n【灵魂重创】前世灵魂在阴阳大磨盘中磨灭殆尽，此生灵智蒙尘，如那初生之婴，痴痴傻傻...';
    } else if (downgradedAptitude) {
      effectMsg = `\n【道基受损】阴阳大磨盘磨灭部分本源，天资从"${oldPlayer.天资等级}"降至"${downgradedAptitude}"，前世荣光不再...`;
    }
    
    // 纳戒掉落消息
    let najieDropMsg = '';
    if (dropInfo) {
      najieDropMsg = `\n【纳戒遗落】前世纳戒遗落于${dropInfo.location.weimianName}，坐标(${dropInfo.location.x}, ${dropInfo.location.y})，有缘人或可寻得...`;
    }
    
    const rebornMsg = [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `【轮回转世·重生完成】`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `岁月如刀斩天骄，长生路上叹妖娆。`,
      `${oldPlayer.名号}的残魂在轮回中重新凝聚，前尘往事尽成空...`,
      effectMsg,
      najieDropMsg,
      ``,
      `一声婴儿啼哭，你重新降临于世！`,
      `这一世，你将再踏仙路，追寻那永恒的大道！`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `道号：${new_player.名号}`,
      `天资：${new_player.天资等级}`,
      `灵根：${new_player.灵根.name}`,
      `轮回次数：${new_player.轮回转世次数}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `仙路漫漫，愿你此生能够走得更远，`,
      `终有一日，踏破诸天，证道永恒！`
    ].join('\n');
    
    await sendRebirthMessage(e, rebornMsg);
    console.log(`【再入仙途】玩家 ${player_id} 转世完成！`);
    
  } catch (err) {
    console.error(`【再入仙途】出错:`, err);
    await sendRebirthMessage(e, `\n【转世出错】发生未知错误，请联系管理员！`);
  }
}

// ==================== 执行轮回转世 ====================
async function executeZhuanshiRebirth(e, task) {
  try {
    const player_id = task.player_id;
    const oldPlayer = task.player_data;
    const acount = task.acount || 0;
    
    console.log(`【轮回】玩家 ${player_id} 开始轮回...`);
    
    const canWithstand = canWithstandYinYangGrind(oldPlayer);
    const mijingLevel = MijingLevels.find(l => l.id === oldPlayer.mijinglevel_id)?.name || '未知';
    const xianguLevel = oldPlayer.xiangulevel_id;
    const phenomenon = getRandomPhenomenon();
    
    let messages = [];
    
    // ===== 第一阶段：寿元耗尽，魂归地府 =====
    messages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    messages.push(`【轮回转世·魂归地府】`);
    messages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    messages.push(``);
    messages.push(`岁月无情，大道苍凉。`);
    messages.push(`${oldPlayer.名号}的寿元终于走到了尽头...`);
    messages.push(``);
    messages.push(`那一日，${phenomenon}，`);
    messages.push(`仿佛在为你送行，又仿佛在嘲笑这世间众生的渺小。`);
    messages.push(``);
    messages.push(`一缕残魂飘飘荡荡，脱离肉身，坠入那传说中的古地府...`);
    messages.push(`黄泉路上，阴风怒号，无数亡魂与你擦肩而过，`);
    messages.push(`它们或是哭嚎，或是麻木，或是茫然...`);
    messages.push(``);
    messages.push(`你随着亡魂大军，来到了地府深处。`);
    messages.push(`一座古老的石殿横亘在前，上书三个大字：`);
    messages.push(`【判官殿】`);
    messages.push(``);
    
    await sendRebirthMessage(e, messages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ===== 第二阶段：判官审魂 =====
    let judgeMessages = [];
    
    judgeMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    judgeMessages.push(`【判官审魂】`);
    judgeMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    judgeMessages.push(``);
    judgeMessages.push(`殿内，一盏魂灯摇曳，照亮了那高大的身影。`);
    judgeMessages.push(`判官翻开生死簿，目光如电，声音如雷霆：`);
    judgeMessages.push(``);
    judgeMessages.push(`"${oldPlayer.名号}，阳寿已尽，功德已消，`);
    judgeMessages.push(`今生种种，皆为定数。`);
    judgeMessages.push(`速入轮回，来世或可得道！"`);
    judgeMessages.push(``);
    
    if (oldPlayer.轮回转世次数 > 0) {
      judgeMessages.push(`判官眉头微皱："嗯？此人已轮回${oldPlayer.轮回转世次数}次..."`);
      judgeMessages.push(`"轮回印记在身，倒也是个有故事的人。"`);
      judgeMessages.push(``);
    }
    
    if (canWithstand) {
      judgeMessages.push(`突然，判官面色大变！`);
      judgeMessages.push(`"这...这股气息...你是${mijingLevel}境的存在？！"`);
      judgeMessages.push(`"斩道王者！已触摸到天道规则，超脱轮回之外！"`);
      if (xianguLevel >= 9) {
        judgeMessages.push(`"不对...还有真神之躯！仙台与仙古同修，这是要逆天吗？！"`);
      }
      judgeMessages.push(``);
      judgeMessages.push(`判官连忙起身，恭敬道："大人，请随我来..."`);
    } else {
      judgeMessages.push(`你沉默不语，心中却有万般不甘。`);
      judgeMessages.push(`这一生，你可曾后悔？`);
      judgeMessages.push(`这一生，你可曾遗憾？`);
      judgeMessages.push(`这一生，你可曾...真正活过？`);
      judgeMessages.push(``);
      judgeMessages.push(`判官摇头："执念太深，难入轮回。`);
      judgeMessages.push(`去吧，阴阳大磨盘会磨灭你的一切执念。"`);
    }
    
    judgeMessages.push(``);
    judgeMessages.push(`你被带入古地府最深处——轮回路！`);
    judgeMessages.push(`前方，一座巨大的阴阳大磨盘横亘于世，`);
    judgeMessages.push(`阴鱼与阳鱼交织，缓缓转动，`);
    judgeMessages.push(`仿佛要将这世间的一切都磨灭成虚无...`);
    judgeMessages.push(``);
    
    await sendRebirthMessage(e, judgeMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ===== 第三阶段：阴阳大磨盘 =====
    let grindMessages = [];
    
    if (canWithstand) {
      // 强者硬扛
      grindMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      grindMessages.push(`【阴阳大磨盘·以力破法】`);
      grindMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      grindMessages.push(``);
      grindMessages.push(`阴阳大磨盘轰然震动，轮回之力如海啸般席卷而来！`);
      grindMessages.push(`那磨盘上的阴鱼与阳鱼仿佛活了过来，`);
      grindMessages.push(`化作两条巨大的阴阳鱼，张口要将你吞噬！`);
      grindMessages.push(``);
      grindMessages.push(`但你只是静静地站在那里，周身散发出无尽神威。`);
      grindMessages.push(`你的道，你的法，你的意志，在这一刻凝成实质！`);
      grindMessages.push(``);
      grindMessages.push(`"轰——！"`);
      grindMessages.push(``);
      grindMessages.push(`阴阳大磨盘发出不堪重负的哀鸣，`);
      grindMessages.push(`磨盘上出现无数裂痕，如那蛛网般蔓延！`);
      grindMessages.push(``);
      grindMessages.push(`判官目瞪口呆："这...这怎么可能！`);
      grindMessages.push(`阴阳大磨盘，自古长存，从未有人能将其震裂！"`);
      grindMessages.push(``);
      grindMessages.push(`你淡淡开口："我的道，不在轮回之中。"`);
      grindMessages.push(`"今日，我便以力破法，超脱这轮回之外！"`);
      grindMessages.push(``);
      grindMessages.push(`"咔嚓——！"`);
      grindMessages.push(`阴阳大磨盘，碎！`);
    } else {
      // 弱者受磨
      grindMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      grindMessages.push(`【阴阳大磨盘·灵魂淬炼】`);
      grindMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      grindMessages.push(``);
      grindMessages.push(`你被投入阴阳大磨盘之中！`);
      grindMessages.push(`磨盘缓缓转动，发出"轰隆隆"的巨响，`);
      grindMessages.push(`仿佛天道在怒吼，又仿佛万古的丧钟在敲响...`);
      grindMessages.push(``);
      grindMessages.push(`阴鱼与阳鱼交织成太极图案，`);
      grindMessages.push(`无尽轮回之力开始研磨你的灵魂！`);
      grindMessages.push(``);
      grindMessages.push(`那一刻，你的记忆如走马灯般闪过...`);
      grindMessages.push(`童年的欢笑，少年的热血，中年的沧桑，老年的悲凉...`);
      grindMessages.push(`爱恨情仇，喜怒哀乐，一切情感都在磨盘中化为虚无...`);
      grindMessages.push(``);
      grindMessages.push(`"啊——！"`);
      grindMessages.push(`你忍不住发出痛苦的嘶吼，`);
      grindMessages.push(`那是对过往的眷恋，对今生的不甘，对未来的迷茫...`);
      grindMessages.push(``);
      grindMessages.push(`磨盘无情，继续转动。`);
      grindMessages.push(`你的灵魂在痛苦中颤抖，在颤抖中蜕变...`);
    }
    
    grindMessages.push(``);
    await sendRebirthMessage(e, grindMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ===== 第四阶段：轮回结果 =====
    let resultMessages = [];
    let isChixiao = false;
    let downgradedAptitude = null;
    
    if (canWithstand) {
      // 完美转世
      resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      resultMessages.push(`【轮回结果·完美无缺】`);
      resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      resultMessages.push(``);
      resultMessages.push(`阴阳大磨盘破碎，轮回之力四散！`);
      resultMessages.push(`你的灵魂完好无损，道基未受丝毫影响！`);
      resultMessages.push(``);
      resultMessages.push(`判官躬身行礼："大人神威，古今罕见！`);
      resultMessages.push(`既已超脱轮回，本官便助大人完美转世！"`);
      resultMessages.push(``);
      resultMessages.push(`"愿大人来世，踏破诸天，证道永恒！"`);
    } else {
      // 受损转世
      const random = Math.random();
      const isChixiaoRandom = random < 0.3; // 30%概率痴傻
      
      if (isChixiaoRandom) {
        // 灵魂重创
        resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
        resultMessages.push(`【轮回结果·灵魂重创】`);
        resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
        resultMessages.push(``);
        resultMessages.push(`阴阳大磨盘疯狂转动，轮回之力远超你的承受极限！`);
        resultMessages.push(`"咔嚓——"一声脆响，你的灵魂出现无数裂痕！`);
        resultMessages.push(``);
        resultMessages.push(`那一刻，你感觉自己的记忆在飞速流逝...`);
        resultMessages.push(`功法、神通、阅历、情感，一切都在磨灭...`);
        resultMessages.push(``);
        resultMessages.push(`最终，你熬过了磨盘的磨砺，`);
        resultMessages.push(`但你的灵智已失，记忆几乎被磨灭殆尽...`);
        resultMessages.push(``);
        resultMessages.push(`判官叹息："灵魂受损至此，来世恐怕是痴傻之人..."`);
        resultMessages.push(`"也罢，送你再入轮回，望来世能够修复灵魂..."`);
        
        isChixiao = true;
      } else {
        // 天资受损
        const currentAptitude = oldPlayer.天资等级 || '平庸之资';
        const newAptitude = downgradeAptitude(currentAptitude);
        downgradedAptitude = newAptitude;
        
        resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
        resultMessages.push(`【轮回结果·道基受损】`);
        resultMessages.push(`━━━━━━━━━━━━━━━━━━━━━━`);
        resultMessages.push(``);
        resultMessages.push(`阴阳大磨盘疯狂转动，轮回之力如潮水般涌来！`);
        resultMessages.push(`你的灵魂在磨盘中苦苦支撑，如那风中残烛...`);
        resultMessages.push(``);
        resultMessages.push(`最终，你熬过了磨盘的磨砺，`);
        resultMessages.push(`但你的灵魂本源受损，道基不再完美！`);
        resultMessages.push(``);
        resultMessages.push(`天资从"${currentAptitude}"降至"${newAptitude}"！`);
        resultMessages.push(``);
        resultMessages.push(`判官摇头："能熬过已是万幸，只是道基受损...`);
        resultMessages.push(`去吧，再入轮回，或许还有恢复之日。"`);
      }
    }
    
    // 轮回感悟
    if (acount >= 5 && !isChixiao && !canWithstand) {
      resultMessages.push(``);
      resultMessages.push(`【轮回感悟】`);
      resultMessages.push(`历经多次轮回，你对生死之道有了更深的感悟！`);
      resultMessages.push(`轮回感悟+1，来世或可得大道眷顾！`);
      oldPlayer.轮回感悟 = (oldPlayer.轮回感悟 || 0) + 1;
    }
    
    if (acount >= 10 && !isChixiao && !canWithstand) {
      resultMessages.push(``);
      resultMessages.push(`【轮回印记】`);
      resultMessages.push(`轮回印记在你灵魂上留下淡淡光芒，`);
      resultMessages.push(`这是大道的馈赠，也是你逆天而行的证明！`);
      oldPlayer.轮回印记 = true;
    }
    
    resultMessages.push(``);
    await sendRebirthMessage(e, resultMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ===== 第五阶段：再入仙途 =====
    const rebirthMessage = [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `【再入仙途】`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `六道轮回之门轰然开启，`,
      `你的魂魄被一股无形之力牵引，投入那无尽的轮回之中...`,
      ``,
      `前尘往事尽成空，`,
      `而今迈步从头越！`,
      ``,
      `正在为你重塑肉身，重开仙路...`,
      `这一世，你将如何书写你的传奇？`,
      ``
    ].join('\n');
    
    await sendRebirthMessage(e, rebirthMessage);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 执行转世
    await forceRebirthPlayer(e, oldPlayer, acount, isChixiao, downgradedAptitude);
    
    console.log(`【轮回】玩家 ${player_id} 轮回完成！`);
    
  } catch (err) {
    console.error(`【轮回】执行出错:`, err);
    await sendRebirthMessage(e, `\n【轮回出错】发生未知错误，请联系管理员！`);
  }
}

// ==================== 定时任务类 ====================
class ZhuanshiTask extends plugin {
  constructor() {
    super({
      name: '轮回转世任务',
      dsc: '定时检测玩家轮回转世任务',
      event: 'message',
      priority: 6000,
      rule: []
    });

    ZxTask = this;
    this.setting = config.getConfig("task", "task");

    this.task = [
      {
        cron: this.setting.zhuanshi_task,
        name: 'ZhuanshiTask',
        fnc: () => this.checkZhuanshiTask(),
      }
    ];
  }

  async checkZhuanshiTask() {
    try {
      console.log('【轮回检查】开始执行...');
      const keys = await redis.keys('xiuxian:zhuanshi_task:*');

      for (const key of keys) {
        try {
          const taskData = await redis.get(key);
          if (!taskData) {
            await redis.del(key);
            continue;
          }

          const task = JSON.parse(taskData);
          const now = Date.now();
          const player_id = task.player_id;

          if (now >= task.end_time) {
            console.log(`【轮回】玩家 ${player_id} 时间到，开始轮回...`);

            const msgCtx = {
              isGroup: !!task.group_id,
              group_id: task.group_id || null,
              user_id: player_id,
              reply: async (msg) => {
                try {
                  if (task.group_id) {
                    await Bot.pickGroup(task.group_id).sendMsg([segment.at(Number(player_id)), msg]);
                  } else {
                    await common.relpyPrivate(player_id, msg);
                  }
                } catch (err) {
                  console.error('【轮回】发送消息失败:', err);
                }
              }
            };

            await executeZhuanshiRebirth(msgCtx, task);
            await redis.del(key);
            await redis.del(`xiuxian:player:${player_id}:action`);
          } else {
            const remaining = task.end_time - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            console.log(`【轮回检查】玩家 ${player_id} 剩余 ${hours}小时${minutes}分钟`);
          }
        } catch (err) {
          console.error(`处理轮回任务出错 (${key}):`, err);
        }
      }

      console.log('【轮回检查】完成');
    } catch (err) {
      console.error('轮回任务检查出错:', err);
    }
  }
}

// ==================== 纳戒掉落查询与捡取 ====================
class NajieDrop extends plugin {
  constructor() {
    super({
      name: 'NajieDrop',
      dsc: '轮回纳戒掉落系统',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#遗落纳戒列表$',
          fnc: 'listNajieDrops',
        },
        {
          reg: '^#查询遗落纳戒$',
          fnc: 'queryNajieDrops',
        },
        {
          reg: '^#捡取纳戒(\\d+)$',
          fnc: 'pickupNajie',
        },
        {
          reg: '^#附近纳戒(\\d+)$',
          fnc: 'nearbyNajie',
        },
      ],
    });
  }

  // 列出所有未捡取的遗落纳戒
  async listNajieDrops(e) {
    try {
      const drops = await getAllNajieDrops();
      
      if (drops.length === 0) {
        await e.reply('当前没有任何遗落的纳戒。');
        return;
      }
      
      let msg = ['━━━━━━━━━━━━━━━━━━━━━━', '【遗落纳戒列表】', '━━━━━━━━━━━━━━━━━━━━━━', ''];
      
      for (let i = 0; i < Math.min(drops.length, 10); i++) {
        const drop = drops[i];
        const remaining = Math.ceil((drop.expiredTime - Date.now()) / (1000 * 60 * 60));
        msg.push(`【${i + 1}】前主：${drop.player_name}`);
        msg.push(`    位置：${drop.location.weimianName} (${drop.location.x}, ${drop.location.y})`);
        msg.push(`    剩余：约${remaining}小时后消散`);
        msg.push('');
      }
      
      if (drops.length > 10) {
        msg.push(`...共${drops.length}个遗落纳戒`);
      }
      
      msg.push('使用【#捡取纳戒序号】可捡取对应纳戒');
      msg.push('使用【#附近纳戒坐标】可查看附近纳戒');
      
      await e.reply(msg.join('\n'));
    } catch (err) {
      console.error('【遗落纳戒列表】出错:', err);
      await e.reply('查询遗落纳戒列表失败。');
    }
  }

  // 按位面查询遗落纳戒
  async queryNajieDrops(e) {
    try {
      const msg = e.msg.replace('#查询遗落纳戒', '').trim();
      const weimianName = msg || '';
      
      let drops;
      if (weimianName) {
        const weimian = weimianList.find(w => w.name.includes(weimianName));
        if (weimian) {
          drops = await getNajieDropsByWeimian(weimian.id);
        } else {
          await e.reply(`未找到名为"${weimianName}"的位面。`);
          return;
        }
      } else {
        drops = await getAllNajieDrops();
      }
      
      if (drops.length === 0) {
        await e.reply(`当前${weimianName ? weimianName + '中' : ''}没有任何遗落的纳戒。`);
        return;
      }
      
      let replyMsg = ['━━━━━━━━━━━━━━━━━━━━━━', `【${weimianName || '所有位面'}遗落纳戒】`, '━━━━━━━━━━━━━━━━━━━━━━', ''];
      
      for (let i = 0; i < Math.min(drops.length, 5); i++) {
        const drop = drops[i];
        replyMsg.push(`【${i + 1}】前主：${drop.player_name}`);
        replyMsg.push(`    坐标：(${drop.location.x}, ${drop.location.y})`);
        replyMsg.push('');
      }
      
      if (drops.length > 5) {
        replyMsg.push(`...共${drops.length}个遗落纳戒`);
      }
      
      replyMsg.push('━━━━━━━━━━━━━━━━━━━━━━');
      
      await e.reply(replyMsg.join('\n'));
    } catch (err) {
      console.error('【查询遗落纳戒】出错:', err);
      await e.reply('查询遗落纳戒失败。');
    }
  }

  // 捡取纳戒
  async pickupNajie(e) {
    try {
      let usr_qq = e.user_id.toString().replace('qg_', '');
      
      // 检查是否是玩家
      let player;
      try {
        player = await Read_player(usr_qq);
      } catch {
        await e.reply('你还没有开始修仙，无法捡取纳戒。');
        return;
      }
      
      // 提取序号
      const match = e.msg.match(/^#捡取纳戒(\d+)$/);
      if (!match) {
        await e.reply('请输入正确的命令格式：#捡取纳戒序号');
        return;
      }
      const index = parseInt(match[1]) - 1;
      
      // 获取所有掉落
      const drops = await getAllNajieDrops();
      
      if (index < 0 || index >= drops.length) {
        await e.reply(`没有序号为${index + 1}的遗落纳戒。`);
        return;
      }
      
      const selectedDrop = drops[index];
      
      // 检查是否是自己的纳戒（转世后同一QQ）
      if (selectedDrop.player_id === usr_qq) {
        await e.reply('这是你自己的纳戒，无需捡取。');
        return;
      }
      
      // 执行捡取
      const result = await pickupNajieDrop(selectedDrop.key, usr_qq);
      
      if (!result.success) {
        await e.reply(result.message);
        return;
      }
      
      // 发送成功消息
      const najie = result.najie;
      const totalLingshi = najie.灵石 || 0;
      
      let replyMsg = [
        `【纳戒捡取成功】`,
        `你捡取了${selectedDrop.player_name}遗落的纳戒！`,
        `纳戒中包含：`,
        `  灵石：${totalLingshi.toLocaleString()}`,
        `  装备：${najie.装备?.length || 0}件`,
        `  丹药：${najie.丹药?.length || 0}颗`,
        `  功法：${najie.功法?.length || 0}本`,
        `  草药：${najie.草药?.length || 0}株`,
        `  材料：${najie.材料?.length || 0}个`,
        `愿你善用此机缘，莫负前人之托！`,
      ].join('\n');
      
      await e.reply(replyMsg);
      
      console.log(`【纳戒捡取】玩家 ${usr_qq} 捡取了 ${selectedDrop.player_name} 的纳戒`);
    } catch (err) {
      console.error('【捡取纳戒】出错:', err);
      await e.reply('捡取纳戒失败。');
    }
  }

  // 查看附近纳戒（根据玩家当前位面）
  async nearbyNajie(e) {
    try {
      let usr_qq = e.user_id.toString().replace('qg_', '');
      
      // 检查是否是玩家
      let player;
      try {
        player = await Read_player(usr_qq);
      } catch {
        await e.reply('你还没有开始修仙，无法查看附近纳戒。');
        return;
      }
      
      // 提取范围（0-7表示位面索引，0表示当前位面，1表示上下各1个位面范围）
      const match = e.msg.match(/^#附近纳戒(\d+)$/);
      if (!match) {
        await e.reply('请输入正确的命令格式：#附近纳戒范围（0-7）');
        return;
      }
      const rangeLevel = Math.min(Math.max(parseInt(match[1]), 0), 7);
      
      // 获取玩家当前位面
      const playerWeimianId = player.power_place || 0;
      const currentWeimian = weimianList.find(w => w.id === playerWeimianId);
      const weimianName = currentWeimian ? currentWeimian.name : '未知位面';
      
      // 查找当前位面及附近的掉落
      const allDrops = await getAllNajieDrops();
      const nearbyDrops = allDrops.filter(drop => {
        const diff = Math.abs(drop.location.weimianId - playerWeimianId);
        return diff <= rangeLevel;
      });
      
      if (nearbyDrops.length === 0) {
        if (rangeLevel === 0) {
          await e.reply(`在${weimianName}中没有遗落的纳戒。\n可以尝试【#附近纳戒1】扩大搜索范围到相邻位面。`);
        } else {
          await e.reply(`在${weimianName}及相邻${rangeLevel}个位面范围内都没有遗落的纳戒。`);
        }
        return;
      }
      
      let msg = [
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `【附近纳戒】`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `当前位置：${weimianName}`,
        `搜索范围：${rangeLevel === 0 ? '本位于面' : `本位于面及上下各${rangeLevel}个位面`}`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        ``
      ];
      
      // 按位面分组显示
      const groupedByWeimian = {};
      nearbyDrops.forEach(drop => {
        const wName = drop.location.weimianName;
        if (!groupedByWeimian[wName]) {
          groupedByWeimian[wName] = [];
        }
        groupedByWeimian[wName].push(drop);
      });
      
      let index = 1;
      for (const [wName, drops] of Object.entries(groupedByWeimian)) {
        msg.push(`【${wName}】`);
        for (const drop of drops.slice(0, 3)) {
          msg.push(`  ${index}. ${drop.player_name} - 坐标(${drop.location.x}, ${drop.location.y})`);
          index++;
        }
        if (drops.length > 3) {
          msg.push(`  ...等${drops.length}个纳戒`);
        }
        msg.push('');
      }
      
      msg.push('━━━━━━━━━━━━━━━━━━━━━━');
      msg.push('使用【#捡取纳戒序号】可捡取纳戒');
      msg.push(`共${nearbyDrops.length}个纳戒在附近`);
      
      await e.reply(msg.join('\n'));
    } catch (err) {
      console.error('【附近纳戒】出错:', err);
      await e.reply('查找附近纳戒失败。');
    }
  }
}

export { ZhuanshiTask, NajieDrop };
export default ZhuanshiTask;
