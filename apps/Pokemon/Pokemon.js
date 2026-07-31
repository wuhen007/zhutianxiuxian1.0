import { plugin, verc, data } from '../../api/api.js';
import fs from 'fs';
import {
  exist_najie_thing,
  Read_najie,
  Write_najie,
  isNotNull,
  Write_player,
  channel
} from '../../model/xiuxian.js';
import {
  Add_najie_thing,
  convert2integer,
  Add_灵石,
} from '../../model/xiuxian.js';
import {
  addInventoryPetVariant,
  createHabitatPetData,
  removeInventoryPetAt,
  restoreHabitatPetToInventory,
} from './habitatPetTransfer.js';
import { getMinggeEffects, calculateMinggeYield } from '../../model/mingge.js';
import {
  getHabitatSlotBonus,
  getPetTreasureRules,
} from '../../model/innateTreasure.js';
export class Pokemon extends plugin {
  constructor() {
    super({
      name: 'Pokemon',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#出战仙宠.*$',
          fnc: 'Fight',
        },
        {
          reg: '^#喂给仙宠.*$',
          fnc: 'feed',
        },
        {
          reg: '^#进阶仙宠$',
          fnc: 'Advanced',
        },
           {
          reg: '^#派仙宠寻宝$',
          fnc: 'sendPetTreasure',
        },
        {
          reg: '^#结束仙宠寻宝$',
          fnc: 'getPetTreasure',
        },
        {
          reg: '^#安置仙宠(.*)$',
          fnc: 'settlePetToHabitat',
        },
        {
          reg: '^#召回仙宠(.*)$',
          fnc: 'recallPetFromHabitat',
        },
      ],
    });
      // 特殊秘境奇遇系统
    this.specialEvents = {
      "龙窟奇遇": {
        reward: { name: "遣龙令", class: "道具", quantity: 1 },
        description: "误闯太古龙窟，得真龙赐下龙族秘令"
      },
      "虎王峡谷": {
        reward: { name: "遣虎令", class: "道具", quantity: 1 },
        description: "于虎啸峡谷得白虎王青睐"
      },
      "仙玉矿脉": {
        reward: { name: "仙兽玉", class: "道具", quantity: 1 },
        description: "发现上古仙玉矿脉，采得仙兽本源之玉"
      }
    };
  }
  
  

  // 派仙宠寻宝
  async sendPetTreasure(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;
    
    let player = data.getData('player', usr_qq);
    
    // 检查是否有出战仙宠
    if (!isNotNull(player.仙宠.name)) {
      e.reply('请先出战一只仙宠再进行寻宝！');
      return false;
    }
    
    // 检查仙宠是否正在寻宝
    if (player.仙宠寻宝状态 === 1) {
      e.reply(`${player.仙宠.name}正在秘境探索中，耐心等候其归来吧！`);
      return false;
    }
     if (player.灵石 < 8000000) {
        e.reply("需要800W灵石才能派仙宠寻宝！");
        return;
    }
    player.灵石-=8000000;
    // 开启寻宝状态
    player.仙宠寻宝状态 = 1;
    player.仙宠寻宝 = player.仙宠.name;
    player.仙宠寻宝开始时间 = Date.now();
    await Write_player(usr_qq, player); //写入
    
    const treasureNames = ["葬仙古域", "龙血秘境", "天渊海眼", "虚神界外域"];
    const randomName = treasureNames[Math.floor(Math.random() * treasureNames.length)];
    
    const replies = [
      `${player.仙宠.name}长啸一声，化作一道流光遁入「${randomName}」寻访仙缘！`,
      `${player.仙宠.name}踏云而起，尾羽散落星辰，消失在「${randomName}」的迷雾中……`,
      `只见${player.仙宠.name}爪撕虚空，打开通往「${randomName}」的裂缝，跃入其中！`
    ];
    
    e.reply(replies[Math.floor(Math.random() * replies.length)]);
    return true;
  }

 async getPetTreasure(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;
    
    let player = data.getData('player', usr_qq);
    const treasureRules = getPetTreasureRules(player);
    
    // 检查仙宠是否在寻宝中
    if (player.仙宠寻宝状态 !== 1) {
      e.reply('你的仙宠此刻正在身边休憩，无需召回！');
      return false;
    }
    
    const currentTime = Date.now();
    const timeDiff = Math.floor((currentTime - player.仙宠寻宝开始时间) / 60000); // 分钟数
    
    // 检查是否为如梦道祖的坐骑
    const isDreamMount = player.仙宠寻宝 === "如梦道祖的坐骑";
    
    // 如梦坐骑所需时间减半
    const requiredTime = treasureRules.requiredMinutes || (isDreamMount ? 60 : 120);
    
    // 检查是否达到所需时间
    if (timeDiff < requiredTime) {
      e.reply(`天地禁制未消！还需${requiredTime - timeDiff}分钟才能将${player.仙宠寻宝}从秘境召回！`);
      return false;
    }
    
    // 计算奖励次数（每次5分钟，最多8次）
    const effectiveMinutes = treasureRules.maxMinutes
      ? Math.min(timeDiff, treasureRules.maxMinutes)
      : timeDiff;
    let rewardCount = Math.min(
      Math.floor(effectiveMinutes / 4),
      treasureRules.maxMinutes ? Math.floor(treasureRules.maxMinutes / 4) : 8
    );
    
    // 如梦坐骑奖励次数增加50%
    if (isDreamMount) {
      const dreamCap = treasureRules.maxMinutes
        ? Math.ceil(treasureRules.maxMinutes / 4 * 1.5)
        : 12;
      rewardCount = Math.min(Math.ceil(rewardCount * 1.5), dreamCap);
    }
    
    const petName = player.仙宠寻宝;
    
    // 获取奖励池（过滤掉特殊物品）
    const treasurePool = data.xianchonxunbao.filter(item => 
      item.name !== "遣龙令" && 
      item.name !== "遣虎令" && 
      item.name !== "仙兽玉"
    );
    
    // 生成普通奖励
    const rewardItems = [];
    const rewardMap = new Map(); // 用于合并相同奖励
    
    // 生成特殊秘境奇遇
    const specialEvents = [];
    
    // 随机选择奖励项（概率方式）
    for (let i = 0; i < rewardCount; i++) {
      // 计算总概率
      let totalProb = 0;
      for (const item of treasurePool) {
        totalProb += item.概率 || 1; // 默认概率为1
      }
      
      // 随机选择一项奖励
      let randomProb = Math.random() * totalProb;
      let currentProb = 0;
      let selectedReward = null;
      
      for (const item of treasurePool) {
        currentProb += item.概率 || 1;
        if (currentProb >= randomProb) {
          selectedReward = item;
          break;
        }
      }
      
      if (selectedReward) {
        // 如梦坐骑奖励数量增加50%
        let quantity = selectedReward.数量 || 1;
        if (isDreamMount) {
          quantity = Math.ceil(quantity * 1.5);
        }

        // ==== 命格消费层：寻宝加成 ====
        // 「寻龙点穴」类命格感应地脉龙气，使仙宠所获更为丰沛。
        const minggeEffects = getMinggeEffects(player, data.minggeList);
        const treasureBonus = minggeEffects?.['寻宝加成'] || 0; // 可正可负
        if (treasureBonus !== 0) {
          // calculateMinggeYield 内部已按 (1+bonus) 放大，此处直接传基础 quantity 即可，勿重复乘
          quantity = Math.max(1, calculateMinggeYield(quantity, minggeEffects, '寻宝加成'));
        }
        quantity = Math.max(1, Math.floor(quantity * treasureRules.rewardMultiplier));
        
        // 合并相同奖励
        const key = `${selectedReward.name}|${selectedReward.class}`;
        if (rewardMap.has(key)) {
          rewardMap.get(key).数量 += quantity;
        } else {
          rewardMap.set(key, {...selectedReward, 数量: quantity});
        }
        
        rewardItems.push({...selectedReward, 数量: quantity});
      }
      
      // 判定特殊秘境奇遇（8%概率）
      if (Math.random() < 0.08) {
        const eventKeys = Object.keys(this.specialEvents);
        const randomEventKey = eventKeys[Math.floor(Math.random() * eventKeys.length)];
        specialEvents.push(this.specialEvents[randomEventKey]);
      }
    }
    
    // 添加到纳戒
    const rewardsText = [];
    for (const [_, item] of rewardMap) {
      await Add_najie_thing(usr_qq, item.name, item.class, item.数量);
      rewardsText.push(`${item.name}x${item.数量}`);
    }
    
    // 添加特殊奇遇到纳戒并记录
    const specialRewardsText = [];
    for (const event of specialEvents) {
      let quantity = event.reward.quantity;
      // 如梦坐骑特殊奖励也增加50%
      if (isDreamMount) {
        quantity = Math.ceil(quantity * 1.5);
      }
      quantity = Math.max(1, Math.floor(quantity * treasureRules.rewardMultiplier));
      
      await Add_najie_thing(
        usr_qq, 
        event.reward.name, 
        event.reward.class, 
        quantity
      );
      specialRewardsText.push({
        name: event.reward.name,
        quantity: quantity,
        description: event.description
      });
    }
    
    // 仙宠归来文案
    const conditionTexts = [
      `爪鳞间沾染着远古凶兽的气息`,
      `眼中似乎映照出九天神霞的轨迹`,
      `皮毛上凝聚着虚空之力的光泽`,
      `体内奔涌着新获得的太古血脉`,
      `气息变得更加幽深难测`,
      `身后隐现远古祖兽的虚影`,
    ];
    
    // 如梦坐骑专属描述
    const dreamMountTexts = [
      `周身环绕着如梦似幻的道韵`,
      `蹄下踏着虚幻的时空涟漪`,
      `眼中流转着大千世界的倒影`,
      `气息与道祖同源，威压天地`,
    ];
    
    const randomCondition = isDreamMount ? 
      dreamMountTexts[Math.floor(Math.random() * dreamMountTexts.length)] :
      conditionTexts[Math.floor(Math.random() * conditionTexts.length)];
    
    // 构建回复消息
    let result = [
      `◇◇◇虚空震荡间${petName}骤然归来◇◇◇`,
      `「${randomCondition}，似经历了一番大道争锋！」`
    ];
    
    // 如梦坐骑专属提示
    if (isDreamMount) {
      result.push("「如梦道祖的坐骑果然不凡，寻宝效率远超寻常仙宠！」");
    }
    
    // 特殊奇遇展示
    if (specialRewardsText.length > 0) {
      result.push("▬▬▬▬▬▬▬▬ 秘境奇遇 ▬▬▬▬▬▬▬▬");
      specialRewardsText.forEach(special => {
        result.push(`◆ ${special.description}`);
        result.push(`★ 获得『${special.name}x${special.quantity}』★`);
      });
      result.push("▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬");
    }
    
    // 普通奖励展示
    if (rewardsText.length > 0) {
      result.push(`仙宠张口一吐，诸般仙珍异宝纷纷显现：`);
      rewardsText.forEach((r, i) => {
        result.push(`${i === rewardsText.length - 1 ? '┗ ' : '┣ '}${r}`);
      });
    }
    
    // 总结信息
    const closingTexts = [
      `周身缠绕着尚未散去的秘境灵气……`,
      `眉心浮现金色道纹，似有所悟……`,
      `毛发间流淌着星河般的微光……`,
    ];
    
    result.push(
      closingTexts[Math.floor(Math.random() * closingTexts.length)],
      `「历经${rewardCount}个秘境时辰，携回${rewardsText.length + specialRewardsText.length}份仙缘」`
    );
    
    // 追加特殊奇遇提示
    if (specialRewardsText.length > 0) {
      result.push(`「其中${specialRewardsText.length}份乃千古奇遇所得！」`);
    }
    
    // 如梦坐骑额外提示
    if (isDreamMount) {
      result.push("「如梦道祖的坐骑果然不凡，寻宝效率远超寻常仙宠！」");
    }
    
    // 重置状态
    player.仙宠寻宝状态 = 0;
    player.仙宠寻宝 = "";
    player.仙宠寻宝开始时间 = 0;
    await data.setData('player', usr_qq, player);
    
    e.reply(result.join('\n'));
    return true;
}
  


  async Fight(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;
    let player = data.getData('player', usr_qq);
    let name = e.msg.replace('#', '');
    name = name.replace('出战仙宠', '').trim();
    let num = parseInt(name);
    let najie = await Read_najie(usr_qq);
    let targetPetIndex = -1;
    if (num && num > 1000) {
      targetPetIndex = num - 1001;
      if (targetPetIndex < 0 || targetPetIndex >= najie.仙宠.length) {
        e.reply('仙宠代号输入有误!');
        return false;
      }
      name = najie.仙宠[targetPetIndex].name;
    } else {
      targetPetIndex = najie.仙宠.findIndex(item => item.name === name);
    }
    if (player.仙宠.灵魂绑定 == 1) {
      e.reply('你已经与' + player.仙宠.name + '绑定了灵魂,无法更换别的仙宠！');
      return false;
    }
    let thing = data.xianchon.find(item => item.name == name); //查找仙宠
    if (!isNotNull(thing)) {
      e.reply('这方世界不存在' + name);
      return false;
    }
    const selectedPet = najie.仙宠[targetPetIndex];
    if (!selectedPet) {
      e.reply('你没有' + name);
      return false;
    }

    const originalNajie = JSON.parse(JSON.stringify(najie));
    const originalPlayer = JSON.parse(JSON.stringify(player));
    const last = JSON.parse(JSON.stringify(selectedPet));
    last.数量 = 1;
    last.islockd = 0;
    removeInventoryPetAt(najie, targetPetIndex);
    if (isNotNull(player.仙宠.name)) addInventoryPetVariant(najie, player.仙宠);
    if (player.仙宠.type == '修炼') {
      player.修炼效率提升 = player.修炼效率提升 - player.仙宠.加成;
    }
    if (player.仙宠.type == '幸运') {
      player.幸运 = player.幸运 - player.仙宠.加成;
    }
    if (player.仙宠.type == '制符') {
      player.制符成功率 = (player.制符成功率 || 0) - player.仙宠.加成;
    }
    player.仙宠 = last;
    player.仙宠.加成 = player.仙宠.等级 * player.仙宠.每级增加;
    if (last.type == '幸运') {
      player.幸运 = player.幸运 + last.加成;
    }
    if (last.type == '修炼') {
      player.修炼效率提升 = player.修炼效率提升 + last.加成;
    }
    if (last.type == '制符') {
      player.制符成功率 = (player.制符成功率 || 0) + last.加成;
    }
    try {
      await Write_najie(usr_qq, najie);
      await Write_player(usr_qq, player);
    } catch (error) {
      await Write_najie(usr_qq, originalNajie);
      await Write_player(usr_qq, originalPlayer);
      console.error('切换出战仙宠失败:', error);
      e.reply('切换出战仙宠失败，仙宠数据已恢复');
      return false;
    }
    e.reply('成功出战' + name);
  }

  async Advanced(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;
    let player = data.getData('player', usr_qq);
    let list = ['仙胎', '仙仔', '仙兽', '仙道', '仙灵'];
    let list_level = [20, 40, 60, 80, 100];
    let x = 114514;
    for (var i = 0; list.length > i; i++) {
      if (list[i] == player.仙宠.品级) {
        x = i;
        break;
      }
    }
    if (x == 114514) {
      e.reply('你没有仙宠');
      return false;
    }
    if (x == 4) {
      e.reply('[' + player.仙宠.name + ']已达到最高品级');
      return false;
    }
    let number_n = x + 1;
    number_n.toString; //等级转换字符串
    let name = number_n + '级仙石';
    let quantity = await exist_najie_thing(usr_qq, name, '道具'); //查找纳戒
    if (!quantity) {
      //没有
      e.reply(`你没有[${name}]`);
      return false;
    }
    let player_level = player.仙宠.等级;
    let last_jiachen = player.仙宠.加成;
    if (player_level == list_level[x]) {
      //判断是否满级
      const basePet = data.xianchon.find(item => item.name === player.仙宠.name);
      if (basePet?.来源 === '小世界野外') {
        e.reply(`【${player.仙宠.name}】是野外仙宠，当前没有固定进阶形态`);
        return false;
      }
      let thing = data.xianchon.find(item => item.id == player.仙宠.id + 1); //查找下个等级仙宠
      if (!thing) {
        e.reply(`【${player.仙宠.name}】暂无可用的进阶形态`);
        return false;
      }
      console.log(thing);
      player.仙宠 = thing;
      player.仙宠.等级 = player_level; //赋值之前的等级
      player.仙宠.加成 = last_jiachen; //赋值之前的加成
      await Add_najie_thing(usr_qq, name, '道具', -1);
      await Write_player(usr_qq, player);
      e.reply('恭喜进阶【' + player.仙宠.name + '】成功');
    } else {
      let need = Number(list_level[x]) - Number(player_level);
      e.reply('仙宠的灵泉集韵不足,还需要【' + need + '】级方可进阶');
      return false;
    }
  }

  async feed(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //用户不存在
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;
    let player = data.getData('player', usr_qq);
    if (player.仙宠 == '') {
      //有无仙宠
      e.reply('你没有仙宠');
      return false;
    }
    let thing = e.msg.replace('#', '');
    thing = thing.replace('喂给仙宠', '');
    let code = thing.split('*');
    let thing_name = code[0]; //物品
    let thing_value = await convert2integer(code[1]); //数量
   // 确保两个数据源都是数组，如果不存在则设为空数组
const kouliangList1 = Array.isArray(data.xianchonkouliang) ? data.xianchonkouliang : [];
const kouliangList2 = Array.isArray(data.xianchonkouliang2) ? data.xianchonkouliang2 : [];

// 合并两个数组（或者分别查找）
let ifexist = kouliangList1.find(item => item.name == thing_name) || kouliangList2.find(item => item.name == thing_name);

if (!ifexist) {
    e.reply('此乃凡物,仙宠不吃' + thing_name);
    return false;
}
    if (
      player.仙宠.等级 == player.仙宠.等级上限 &&
      player.仙宠.品级 != '仙灵'
    ) {
      e.reply('等级已达到上限,请主人尽快为仙宠突破品级');
      return false;
    }
    if (
      player.仙宠.品级 == '仙灵' &&
      player.仙宠.等级 == player.仙宠.等级上限
    ) {
      e.reply('您的仙宠已达到天赋极限');
      return false;
    }
    //纳戒中的数量
    let thing_quantity = await exist_najie_thing(
      usr_qq,
      thing_name,
      '仙宠口粮'
    );
    if (thing_quantity < thing_value || !thing_quantity) {
      //没有
      e.reply(`【${thing_name}】数量不足`);
      return false;
    }
    //纳戒数量减少
    await Add_najie_thing(usr_qq, thing_name, '仙宠口粮', -thing_value);
    //待完善加成
    let jiachen = ifexist.level * thing_value; //加的等级
    if (jiachen > player.仙宠.等级上限 - player.仙宠.等级) {
      jiachen = player.仙宠.等级上限 - player.仙宠.等级;
    }
    //保留
    player.仙宠.加成 += jiachen * player.仙宠.每级增加;
    if (player.仙宠.type == '修炼') {
      player.修炼效率提升 += jiachen * player.仙宠.每级增加;
    }
    if (player.仙宠.type == '幸运') {
      player.幸运 += jiachen * player.仙宠.每级增加;
    }
    if (player.仙宠.type == '制符') {
      player.制符成功率 = (player.制符成功率 || 0) + jiachen * player.仙宠.每级增加;
    }
    if (player.仙宠.等级上限 > player.仙宠.等级 + jiachen) {
      player.仙宠.等级 += jiachen;
    } else {
      if (player.仙宠.品级 == '仙灵') {
        e.reply('您的仙宠已达到天赋极限');
      } else {
        e.reply('等级已达到上限,请主人尽快为仙宠突破品级');
      }
      player.仙宠.等级 = player.仙宠.等级上限;
    }
    await data.setData('player', usr_qq, player);

    // 如果仙宠在小世界栖息地中，喂食恢复精力
    let energyMsg = '';
    if (data.xiaoshijie) {
      const world = data.xiaoshijie.find(w => w.player_qq === usr_qq);
      if (world && world.栖息地) {
        const habitatPet = world.栖息地.find(p => p.name === player.仙宠.name);
        if (habitatPet) {
          let energyRecover = { '五果': 20, '六斋': 30, '七荤': 40, '八珍': 50 }[ifexist.name] || 20;
          // 贪吃特性加成
          if (habitatPet.特性 && habitatPet.特性.includes('贪吃')) {
            energyRecover = Math.floor(energyRecover * 1.5);
          }
          habitatPet.精力 = Math.min(habitatPet.最大精力 || 100, (habitatPet.精力 || 100) + energyRecover);
          const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === usr_qq);
          data.xiaoshijie[worldIndex] = world;
          const libPath = `${process.cwd()}/plugins/zhutianxiuxian1.0/resources/data/item/小世界列表.json`;
          fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));
          energyMsg = `\n${player.仙宠.name}在小世界中的精力恢复了${energyRecover}点（当前${habitatPet.精力}/${habitatPet.最大精力}）`;
        }
      }
    }

    e.reply(`喂养成功，仙宠的等级增加了${jiachen},当前为${player.仙宠.等级}${energyMsg}`);
    return false;
  }

  // ===== 栖息地功能 =====

  // 安置仙宠到小世界栖息地
  async settlePetToHabitat(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    let ifexistplay = data.existData('player', player_qq);
    if (!ifexistplay) return false;

    let name = e.msg.replace('#安置仙宠', '').trim();
    if (!name) {
      e.reply('请指定要安置的仙宠名称，如：#安置仙宠 白毫');
      return false;
    }

    // 读取小世界数据
    // if (!data.xiaoshijie) data.xiaoshijie = [];
    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return false;
    }

    const player = data.getData('player', player_qq);

    // 初始化栖息地
    if (!world.栖息地) world.栖息地 = [];
    const maxSlots = (world.attributes.栖息地上限 || 1) + getHabitatSlotBonus(player);
    if (world.栖息地.length >= maxSlots) {
      e.reply(`你的小世界栖息地已满（${world.栖息地.length}/${maxSlots}），请先#召回仙宠 腾出位置`);
      return false;
    }

    // 查找纳戒中的仙宠
    let najie = await Read_najie(player_qq);
    if (!najie.仙宠 || najie.仙宠.length === 0) {
      e.reply('你的纳戒中没有仙宠');
      return false;
    }

    // 支持名称或序号
    let targetPetIndex = -1;
    let num = parseInt(name);
    if (num && num > 1000) {
      const index = num - 1001;
      if (index >= 0 && index < najie.仙宠.length) targetPetIndex = index;
    }
    if (targetPetIndex === -1) {
      targetPetIndex = najie.仙宠.findIndex(p => p.name === name);
    }
    const targetPet = najie.仙宠[targetPetIndex];
    if (!targetPet) {
      e.reply(`纳戒中找不到仙宠【${name}】`);
      return false;
    }

    // 不能安置出战的仙宠
    if (player.仙宠 && player.仙宠.name === targetPet.name) {
      e.reply(`${targetPet.name}正在出战，请先切换其他仙宠或召回后再安置`);
      return false;
    }

    const originalNajie = JSON.parse(JSON.stringify(najie));
    const originalHabitat = JSON.parse(JSON.stringify(world.栖息地));
    const petData = createHabitatPetData(targetPet);
    removeInventoryPetAt(najie, targetPetIndex);
    world.栖息地.push(petData);

    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(player_qq)
    );
    const libPath = `${process.cwd()}/plugins/zhutianxiuxian1.0/resources/data/item/小世界列表.json`;
    try {
      data.xiaoshijie[worldIndex] = world;
      fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));
      await Write_najie(player_qq, najie);
    } catch (error) {
      world.栖息地 = originalHabitat;
      data.xiaoshijie[worldIndex] = world;
      fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));
      await Write_najie(player_qq, originalNajie);
      console.error('安置仙宠失败:', error);
      e.reply('安置仙宠失败，仙宠数据已恢复，请稍后重试');
      return false;
    }

    e.reply(`${targetPet.name}已安置到【${world.world_name}】的栖息地（${world.栖息地.length}/${maxSlots}）\n它将自动产出资源，在#收获小世界资源 时一并结算`);
    return true;
  }

  // 从栖息地召回仙宠
  async recallPetFromHabitat(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = data.existData('player', usr_qq);
    if (!ifexistplay) return false;

    let name = e.msg.replace('#召回仙宠', '').trim();
    if (!name) {
      e.reply('请指定要召回的仙宠名称，如：#召回仙宠 白毫');
      return false;
    }

    if (!data.xiaoshijie) data.xiaoshijie = [];
    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(usr_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return false;
    }

    if (!world.栖息地 || world.栖息地.length === 0) {
      e.reply('你的小世界栖息地中没有仙宠');
      return false;
    }

    const petIndex = world.栖息地.findIndex(p => p.name === name);
    if (petIndex === -1) {
      e.reply(`栖息地中找不到仙宠【${name}】`);
      return false;
    }

    const pet = world.栖息地[petIndex];
    const najie = await Read_najie(usr_qq);
    const originalNajie = JSON.parse(JSON.stringify(najie));
    const originalHabitat = JSON.parse(JSON.stringify(world.栖息地));
    const restoreResult = restoreHabitatPetToInventory(najie, pet, data.xianchon || []);
    if (!restoreResult.ok) {
      e.reply(`召回失败：${restoreResult.reason}，仙宠仍保留在栖息地`);
      return false;
    }

    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(usr_qq)
    );
    const libPath = `${process.cwd()}/plugins/zhutianxiuxian1.0/resources/data/item/小世界列表.json`;
    try {
      await Write_najie(usr_qq, najie);
      world.栖息地.splice(petIndex, 1);
      data.xiaoshijie[worldIndex] = world;
      fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));
    } catch (error) {
      world.栖息地 = originalHabitat;
      data.xiaoshijie[worldIndex] = world;
      await Write_najie(usr_qq, originalNajie);
      console.error('召回仙宠失败:', error);
      e.reply('召回仙宠失败，仙宠仍保留在栖息地，请稍后重试');
      return false;
    }

    const maxSlots = world.attributes.栖息地上限 || 1;
    e.reply(`${pet.name}已从栖息地召回（${world.栖息地.length}/${maxSlots}）`);
    return true;
  }
}
