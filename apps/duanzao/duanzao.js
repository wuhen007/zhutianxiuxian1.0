import fs from 'fs';

import { plugin, puppeteer, verc, data, Show } from '../../api/api.js';
import { add_qinmidu, __PATH } from '../../model/xiuxian.js';
import {
  getMinggeBonusMultiplier,
  getMinggeEffects,
} from '../../model/mingge.js';
import { AppName } from '../../app.config.js';
import {
  looktripod,
  settripod,
  Read_mytripod,
  Read_tripod,
  Write_duanlu,
  readthat,
  readall,
  Restraint,
  getxuanze,
  mainyuansu,
  Writeit,
  Read_it,
  alluser,
  dataall

} from '../../model/duanzaofu.js';
import {
  existplayer,
  Write_player,
  exist_najie_thing,
  Add_najie_thing,
  Add_职业经验,
  convert2integer,
  foundthing,
  Read_najie,
  Write_najie,
  Read_danyao,
  Write_danyao,
  Read_equipment,
  channel
} from '../../model/xiuxian.js';
import { log } from 'console';
import { getPetAbilityBonus, getTimedActionMultiplier } from '../../model/innateTreasure.js';

async function resolveForgeFire(user_qq, player) {
  const selectedName = player.炉火 || '凡火';
  const selected = await readthat(selectedName, '炼器火');
  if (selected && (selectedName === '凡火' || Number(await exist_najie_thing(user_qq, selectedName, '道具')) > 0)) {
    return { name: selectedName, fire: selected, unavailable: false };
  }
  return {
    name: '凡火',
    fire: await readthat('凡火', '炼器火'),
    unavailable: selectedName !== '凡火' ? selectedName : false,
  };
}

export class duanzao extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Occupation',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#炼器师能力评测',
          fnc: 'getmybook',
        },
        {
          reg: '^#熔炼.*$',
          fnc: 'givein',
        },
        {
          reg: '^#开始炼制',
          fnc: 'startit',
        },
        {
          reg: '^#开炉',
          fnc: 'openit',
        },
        {
          reg: '^#清空锻炉',
          fnc: 'clearthat',
        },
        {
          reg: '^#我的锻炉',
          fnc: 'mytript',
        },
        {
          reg: '^#赋名.*$',
          fnc: 'getnewname',
        },
        {
          reg: '^#全体清空锻炉',
          fnc: 'all_clearthat',
        },
        {
          reg: '^#神兵榜',
          fnc: 'bestfile',
        },
        {
          reg: '^#神兵重铸.*$',
          fnc: 'remakeit',
        },
        {
          reg: '^#一键开炉$',
          fnc: 'oneclickOpen',
        },
        {
          reg: '^#一键完美开炉$',
          fnc: 'perfectOpen',
        },
        {
          reg: '^#炼器炉$',
          fnc: 'showFurnace',
        },
        {
          reg: '^#升阶锻炉$',
          fnc: 'upgradeFurnace',
        },
        {
          reg: '^#安装锻炉.*$',
          fnc: 'installFurnace',
        },
        {
          reg: '^#炼器功法$',
          fnc: 'showGongfa',
        },
        {
          reg: '^#修炼功法.*$',
          fnc: 'learnGongfa',
        },
        {
          reg: '^#炉火$',
          fnc: 'showFire',
        },
        {
          reg: '^#点燃炉火.*$',
          fnc: 'lightFire',
        },
        {
          reg: '^#参悟时光令配方$',
          fnc: 'learnTimeTokenRecipe',
        },
      ],
    });
  }
  async bestfile(e) {
    if (!verc({ e })) return false;
    let wupin;
    try {
      wupin = await Read_it();
    } catch {
      await Writeit([]);
      wupin = await Read_it();
    }
    let newwupin = [];
    const type = ['武器', '护具', '法宝'];
    let eWai=0
    const nowTime = Date.now();
    // if 根本还没记录时间或者过了时间，就遍历生成，额外往wupin里添加owner_name（号）属性，并重写回去custom.json
    if(!await redis.exists('xiuxian:bestfileCD') ||( nowTime-await redis.get('xiuxian:bestfileCD'))>30*60*1000) {
      // if(1) {
        console.log("鲱鱼是笨逼")
      await redis.set('xiuxian:bestfileCD', nowTime);

      let all = await alluser();
      for (let [wpId, j] of wupin.entries()) {
        for (let i of all) {
          let najie = await Read_najie(i);
          const equ = await Read_equipment(i);
          let exist = najie.装备.find(item => item.name == j.name);
          for (let m of type) {
            if (equ[m].name == j.name) {
              exist = 1;
              break;
            }
          }
 
          let D = '无门无派';
          let author = '神秘匠师';
          if (exist) {
            if (j.author_name) {
              const player = await data.getData('player', j.author_name);
              author = player.名号;
            }
            const usr_player = await data.getData('player', i);
            wupin[wpId].owner_name = i;

            if(j.type=='法宝') eWai=2000
            if(j.type=='护具') eWai=1000
            if(j.type=='武器') eWai=0
            if (usr_player.宗门) D = usr_player.宗门.宗门名称;
            newwupin.push({
              name: j.name,
              type: j.type,
              评分: Math.trunc((j.atk * 1.2 + j.def * 1.5 + j.HP * 1.5) * 10000+eWai),
              制作者: author,
              使用者: usr_player.名号 + '(' + D + ')',
            });
            break;
          }
        }
      }
      await Writeit(wupin); // 重写custom.json
    }
    // 否则，直接按照custom.json记录的数据生成newwupin
    else {
      for(const wp of wupin) {
        let D = '无门无派';
        let author = '神秘匠师';
        if (wp.author_name) {
          const player = await data.getData('player', wp.author_name);
          author = player.名号;
        }
        const usr_player = await data.getData('player', wp.owner_name);
        if (usr_player.宗门) D = usr_player.宗门.宗门名称;

        if(wp.type=='法宝') eWai=2000
        if(wp.type=='护具') eWai=1000
        if(wp.type=='武器') eWai=0
        newwupin.push({
          name: wp.name,
          type: wp.type,
          评分: Math.trunc((wp.atk * 1.2 + wp.def * 1.5 + wp.HP * 1.5) * 10000+eWai),
          制作者: author,
          使用者: usr_player.名号 + '(' + D + ')',
        })
      }
    }

    // 让newwupin工作
    newwupin.sort(function (a, b) {
      return b.评分 - a.评分;
    });
    if (newwupin[20] && newwupin[0].评分 == newwupin[20].评分) {
      let num = Math.floor((newwupin.length - 20) * Math.random());
      newwupin = newwupin.slice(num, num + 20);
    } else {
      newwupin = newwupin.slice(0, 20);
    }
    let bd_date = {
      newwupin,
    };
    const data1 = await new Show(e).get_shenbing(bd_date);
    const tu = await puppeteer.screenshot('shenbing', {
      ...data1,
    });
    e.reply(tu);
    return false;
  }
  async all_clearthat(e) {
    if (!verc({ e })) return false;
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) return false;
    await Write_duanlu([]);
    let playerList = [];
    let files = fs
      .readdirSync('./plugins/' + AppName + '/resources/data/xiuxian_player')
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      let action = null;
      await redis.set(
        'zhutianxiuxian1.0:' + player_id + ':action10',
        JSON.stringify(action)
      );
    }
    e.reply('清除完成');
    return false;
  }
  async clearthat(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_',''); //用户qq
    user_qq=await channel(user_qq)
    //有无存档
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A == 1) {
      let newtripod = await Read_tripod();
      for (let item of newtripod) {
        if (user_qq == item.qq) {
          item.材料 = [];
          item.数量 = [];
          item.TIME = 0;
          item.时长 = 30000;
          item.状态 = 0;
          item.预计时长 = 0;
          await Write_duanlu(newtripod);
          let action = null;
          await redis.set(
            'zhutianxiuxian1.0:' + user_qq + ':action10',
            JSON.stringify(action)
          );
          e.reply('材料成功清除');
          return false;
        }
      }
    }
    return false;
  }

  async getmybook(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_',''); //用户qq
    user_qq=await channel(user_qq)
    //有无存档
    if (!(await existplayer(user_qq))) {
      return false;
    }
    const player = await data.getData('player', user_qq);
    if (player.occupation != '炼器师') {
      e.reply(`你还不是炼器师哦,宝贝`);
      return false;
    }
    if (player.锻造天赋) {
      e.reply(`您已经测评过了`);
      return false;
    }
    const b = await settripod(user_qq);
    e.reply(b);
    return false;
  }

  async givein(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_',''); //用户qq
    user_qq=await channel(user_qq)
    //有无存档
    if (!(await existplayer(user_qq))) return false;
    //不开放私聊
    //获取游戏状态
    const game_action = await redis.get(
      'zhutianxiuxian1.0:' + user_qq + ':game_action'
    );
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return false;
    }
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来煅炉吧`);
      return false;
    }
    const player = await data.getData('player', user_qq);
    if (player.occupation != '炼器师') {
      e.reply(`切换到炼器师后再来吧,宝贝`);
      return false;
    }
    let thing = e.msg.replace('#', '');
    thing = thing.replace('熔炼', '');
    const code = thing.split('*');
    const thing_name = code[0]; //物品
    let thing_acount = code[1]; //数量
    thing_acount = await convert2integer(thing_acount);
    const wupintype = await foundthing(thing_name);
    if (!wupintype || wupintype.type != '锻造') {
      e.reply(`凡界物品无法放入煅炉`);
      return false;
    }
    let mynum = await exist_najie_thing(user_qq, thing_name, '材料');
    if (mynum < thing_acount) {
      e.reply(`材料不足,无法放入`);
      return false;
    }

    //开始放入

    const tripod = await Read_mytripod(user_qq);
    if (tripod.状态 == 1) {
      e.reply(`正在炼制中,无法熔炼更多材料`);
      return false;
    }
    const forgingPetBonus = getPetAbilityBonus(player.仙宠, '炼器');
    let num1 = Math.floor(forgingPetBonus * 10);
    let num = 0;
    for (let item in tripod.数量) {
      num += Number(tripod.数量[item]);
    }
    let dyew = 0;
    let dy = await Read_danyao(user_qq);
    if (dy.beiyong5 > 0) {
      dyew = dy.beiyong5;
    }
    const shengyu =
      dyew +
      tripod.容纳量 +
      num1 +
      Math.floor(player.occupation_level / 2) -
      num -
      Number(thing_acount);
    if (
      num + Number(thing_acount) >
      tripod.容纳量 + dyew + num1 + Math.floor(player.occupation_level / 2)
    ) {
      e.reply(`该煅炉当前只能容纳[${shengyu + Number(thing_acount)}]物品`);
      return false;
    }
    let newtripod;
    try {
      newtripod = await Read_tripod();
    } catch {
      await Write_duanlu([]);
      newtripod = await Read_tripod();
    }
    for (let item of newtripod) {
      if (user_qq == item.qq) {
        item.材料.push(thing_name);
        item.数量.push(thing_acount);
        await Write_duanlu(newtripod);
        await Add_najie_thing(user_qq, thing_name, '材料', -thing_acount);
        const yongyou = num + Number(thing_acount);
        e.reply(
          `熔炼成功,当前煅炉内拥有[${yongyou}]个材料,根据您现有等级,您还可以放入[${shengyu}]个材料`
        );
        return false;
      }
    }
  }

  async startit(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_','');
    user_qq=await channel(user_qq)
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来锻造吧`);
      return false;
    }

    let newtripod;
    try {
      newtripod = await Read_tripod();
    } catch {
      await Write_duanlu([]);
      newtripod = await Read_tripod();
    }
    for (let item of newtripod) {
      if (user_qq == item.qq) {
        if (item.材料.length == 0) {
          e.reply(`炉子为空,无法炼制`);
          return false;
        }
        if (item.状态 == 1) {
          e.reply(`锻炉已经在炼制中，无需重复启动`);
          return false;
        }
        let action = await redis.get('zhutianxiuxian1.0:' + user_qq + ':action10');
        action = JSON.parse(action);
        if (action != null) {
          //人物有动作查询动作结束时间
          let action_end_time = action.end_time;
          let now_time = new Date().getTime();
          if (now_time <= action_end_time) {
            let m = parseInt((action_end_time - now_time) / 1000 / 60);
            let s = parseInt(
              (action_end_time - now_time - m * 60 * 1000) / 1000
            );
            e.reply(
              '正在' + action.action + '中，剩余时间:' + m + '分' + s + '秒'
            );
            return false;
          }
        }
        let action_time = 180 * 60 * 1000; //持续时间，单位毫秒
        const player = await data.getData('player', user_qq);
        // 炉火 + 炼器功法 缩短炼器（温养）时间
        const { fire: fObj } = await resolveForgeFire(user_qq, player);
        const fr = fObj && typeof fObj.缩短比例 === 'number' ? fObj.缩短比例 : 0;
        const gfName = player.炼器功法 || null;
        const gfObj = gfName ? await readthat(gfName, '功法列表') : null;
        const gfCut = gfObj && typeof gfObj.timeCut === 'number' ? gfObj.timeCut : 0;
        const timeSpeed = 1 - Math.min(0.95, fr + gfCut);
        action_time = Math.floor(action_time * timeSpeed);
        const timeMultiplier = getTimedActionMultiplier(player);
        const actualActionTime = Math.floor(action_time * timeMultiplier);
        item.状态 = 1;
        item.TIME = Date.now() - Math.floor(action_time * (1 - timeMultiplier));
        await Write_duanlu(newtripod);
        let arr = {
          action: '锻造', //动作
          end_time: new Date().getTime() + actualActionTime, //结束时间
          time: action_time, //持续时间
        };
        let dy = await Read_danyao(user_qq);
        if (dy.xingyun >= 1) {
          dy.xingyun--;
          if (dy.xingyun == 0) {
            dy.beiyong5 = 0;
          }
        }
        await Write_danyao(user_qq, dy);
        await redis.set(
          'zhutianxiuxian1.0:' + user_qq + ':action10',
          JSON.stringify(arr)
        ); //redis设置动作
        const speedNote = (fr > 0 || gfCut > 0) ? `（炉火/功法提速 ${Math.round((1 - timeSpeed) * 100)}%）` : '';
        e.reply(`现在开始锻造武器，预计${Math.ceil(actualActionTime / 60000)}分钟后完成温养${speedNote}`);
        return false;
      }
    }
  }
  async doForge(e, user_qq, timeMode) {
    if (!verc({ e })) return false;
    user_qq = user_qq.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来锻造吧`);
      return false;
    }
    const player = await data.getData('player', user_qq);
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    if (player.occupation != '炼器师') {
      e.reply(`切换到炼器师后再来吧,宝贝`);
      return false;
    }
    let newtripod;
    try {
      newtripod = await Read_tripod();
    } catch {
      await Write_duanlu([]);
      newtripod = await Read_tripod();
    }
    for (let item of newtripod) {
      if (user_qq == item.qq) {
        if (item.材料.length == 0) {
          e.reply(`煅炉里面空空如也,也许自己还没有放入材料`);
          return false;
        }

        let xishu = 1;
        // ===== 外部条件：煅炉品阶 + 自由装配炉火（提速） + 炼器功法 =====
        const furnaceName = item.炉阶 || '凡铁炉';
        const furnace = await readthat(furnaceName, '炼器炉');
        if (furnace && typeof furnace.xishu === 'number') xishu += furnace.xishu;
        // 炉火只由玩家装配，未拥有或配置失效时回退凡火。
        const { name: fireName, fire } = await resolveForgeFire(user_qq, player);
        const fireRate = fire && typeof fire.缩短比例 === 'number' ? fire.缩短比例 : 0; // 0~0.6
        // 炼器功法：固定加成 + 特效（放宽完美窗口 / 缩短时间）
        const gongfaName = player.炼器功法 || null;
        const gongfa = gongfaName ? await readthat(gongfaName, '功法列表') : null;
        let gfXishu = 0, gfWindow = 0, gfTimeCut = 0;
        if (gongfa) {
          gfXishu = typeof gongfa.xishu === 'number' ? gongfa.xishu : 0;
          gfWindow = typeof gongfa.windowBonus === 'number' ? gongfa.windowBonus : 0;
          gfTimeCut = typeof gongfa.timeCut === 'number' ? gongfa.timeCut : 0;
          const prof = Math.min(player.炼器功法熟练度 || 0, 100);
          gfXishu += (prof / 100) * 0.1; // 熟练度加成（0~0.1）
        }
        xishu += gfXishu;
        // 综合时间缩短比例（炉火 + 功法），封顶 0.95
        const totalTimeRate = Math.min(0.95, fireRate + gfTimeCut);
        const timeSpeed = 1 - totalTimeRate;
        const windowBonus = gfWindow; // 完美窗口放宽（分钟）

        // 时间系数基准：普通开炉按实际时间；一键开炉无视时间无衰减；一键完美开炉无视时间强制完美
        if (timeMode === 'normal') {
          if (item.TIME == 0) {
            e.reply(`煅炉里面空空如也,也许自己还没有启动它`);
            return false;
          }
          const newtime = Date.now() - item.TIME;
          if (newtime < 1000 * 60 * 30 * timeSpeed) {
            e.reply(`炼制时间过短,无法获得装备,再等等吧`);
            return false;
          }
        } else if (timeMode === 'perfect') {
          xishu += 0.1; // 无视时间，保留炉阶/功法并追加完美加成
        } // oneclick: 保留炉阶/功法，无视时间、无衰减、无时间加成

        // 计算属性九维值
        let cailiao;
        let jiuwei = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let newitem in item.材料) {
          cailiao = await readthat(item.材料[newitem], '锻造材料');
          jiuwei[0] += cailiao.攻 * item.数量[newitem];
          jiuwei[1] += cailiao.防 * item.数量[newitem];
          jiuwei[2] += cailiao.血 * item.数量[newitem];
          jiuwei[3] += cailiao.暴 * item.数量[newitem];
          jiuwei[4] += cailiao.金 * item.数量[newitem];
          jiuwei[5] += cailiao.木 * item.数量[newitem];
          jiuwei[6] += cailiao.土 * item.数量[newitem];
          jiuwei[7] += cailiao.水 * item.数量[newitem];
          jiuwei[8] += cailiao.火 * item.数量[newitem];
        }

        let newrandom = Math.random();
        let xuanze = ['锻造武器', '锻造护具', '锻造宝物'];
        let weizhi;
        let wehizhi1;
        if (jiuwei[0] > jiuwei[1] * 2) {
          weizhi = xuanze[0];
          wehizhi1 = '武器';
        } else if (jiuwei[0] * 2 < jiuwei[1]) {
          weizhi = xuanze[1];
          wehizhi1 = '护具';
        } else if (newrandom > 0.8) {
          weizhi = xuanze[2];
          wehizhi1 = '法宝';
        } else if (jiuwei[0] > jiuwei[1]) {
          weizhi = xuanze[0];
          wehizhi1 = '武器';
        } else {
          weizhi = xuanze[1];
          wehizhi1 = '护具';
        }

        // 寻找符合标准的装备
        const newwupin = await readall(weizhi);
        let bizhi = [];
        for (let item2 in newwupin) {
          bizhi[item2] = Math.abs(
            newwupin[item2].atk -
              jiuwei[0] +
              newwupin[item2].def -
              jiuwei[1] +
              newwupin[item2].HP -
              jiuwei[2]
          );
        }
        let min = bizhi[0];
        let new1;
        for (let item3 in bizhi) {
          if (min >= bizhi[item3]) {
            min = bizhi[item3];
            new1 = item3;
          }
        }
        const wuqiname = newwupin[new1].name;
        const num = jiuwei[0] + jiuwei[1] + jiuwei[2];

        // 普通开炉：按时间衰减/加成（炉火/功法已缩短 overtime，功法放宽完美窗口）
        if (timeMode === 'normal') {
          const newtime = Date.now() - item.TIME;
          const overtime = (80 * num + 10) * 1000 * 60 * timeSpeed;
          const nowtime = Math.abs((overtime - newtime) / 1000 / 60);
          if (nowtime < 2 + windowBonus) {
            xishu += 0.1;
          } else if (nowtime > 12 + windowBonus) {
            xishu -= 0.2;
          } else if (nowtime > 8 + windowBonus) {
            xishu -= 0.1;
          } else {
            xishu -= 0.0;
          }
        }

        let houzhui;
        // 计算五维收益（五行加成所有模式通用）
        let i;
        let qianzhui = 0;
        const wuwei = [jiuwei[4], jiuwei[5], jiuwei[6], jiuwei[7], jiuwei[8]];
        const wuxing = ['金', '木', '土', '水', '火'];
        let max = wuwei[0];
        let shuzu = [wuwei[0]];
        for (i = 0; i < wuwei.length; i++) {
          if (max < wuwei[i]) {
            max = wuwei[i];
            shuzu = [wuxing[i]];
          } else if (max == wuwei[i]) {
            shuzu.push(wuxing[i]);
          }
          if (wuwei[i] != 0) {
            qianzhui++;
          }
        }
        max = await getxuanze(shuzu, player.隐藏灵根.type);
        let fangyuxuejian = 0;
        if (qianzhui == 5) {
          houzhui = '五行杂灵';
          xishu += 0.1;
        } else if (qianzhui == 4) {
          houzhui = '四圣显化';
          xishu += 0.07;
        } else if (qianzhui == 3) {
          houzhui = '三灵共堂';
          xishu += 0.05;
        } else if (qianzhui == 2) {
          const shuzufu = await Restraint(wuwei, max[0]);
          houzhui = shuzufu[0];
          xishu += shuzufu[1];
          if (shuzufu[1] == 0.5) {
            fangyuxuejian = 0.5;
          }
        } else if (qianzhui == 1) {
          const mu = await mainyuansu(wuwei);
          houzhui = '纯' + mu;
          xishu += 0.15;
        }if (qianzhui == 0) {
  houzhui = '终极至宝';
  xishu += 0.2;
}

        const newtime1 = Date.now() - Math.floor(Date.now() / 1000) * 1000;
        const sum = jiuwei[0] + jiuwei[1] + jiuwei[2];
        const craftedEquipmentMultiplier = getMinggeBonusMultiplier(
          minggeEffects,
          '炼制装备加成'
        );
        const zhuangbei = {
          id: max[1],
          name: wuqiname + '·' + houzhui + newtime1,
          class: '装备',
          type: wehizhi1,
          atk: Math.floor(jiuwei[0] * xishu * craftedEquipmentMultiplier * 1000) / 1000,
          def: Math.floor(jiuwei[1] * (xishu - fangyuxuejian) * craftedEquipmentMultiplier * 1000) / 1000,
          HP: Math.floor(jiuwei[2] * xishu * craftedEquipmentMultiplier * 1000) / 1000,
          bao: Math.floor(jiuwei[3] * craftedEquipmentMultiplier * 1000) / 1000,
          author_name: player.id,
          出售价: Math.floor(1000000 * sum),
        };

        await Add_najie_thing(user_qq, zhuangbei, '装备', 1);

        // 灵根影响值
        let v =
          player.隐藏灵根.控器 / (Math.abs(max[1] - player.隐藏灵根.type) + 5);
        // 天赋影响值
        let k = ((player.锻造天赋 + 100) * v) / 200 + 1;
        // 基础值
        let z = Math.floor(sum * 1000 * 0.7 * k + 200);
        if (sum >= 0.9) {
          z += 2000;
        } else if (sum >= 0.7) {
          z += 1000;
        }
        const forgingPetBonus = getPetAbilityBonus(player.仙宠, '炼器');
        if (forgingPetBonus > 0) z = Math.floor(z * (1 + forgingPetBonus));
        z = Math.floor(
          z * getMinggeBonusMultiplier(minggeEffects, '锻造经验加成')
        );
        // 炼器功法熟练度累加（封顶 100），影响系数加成
        if (gongfaName) {
          player.炼器功法熟练度 = Math.min((player.炼器功法熟练度 || 0) + 1, 100);
          await Write_player(user_qq, player);
        }
        // 熟练度先落盘，再由 Add_职业经验 读取最新存档，避免旧 player 回写覆盖经验。
        await Add_职业经验(user_qq, z);
        // 关闭所有状态
        item.状态 = 0;
        item.TIME = 0;
        item.材料 = [];
        item.数量 = [];
        await Write_duanlu(newtripod);
        const action = new Date().getTime();
        await redis.set(
          'zhutianxiuxian1.0:' + user_qq + ':action10',
          JSON.stringify(action)
        );
        const modeText = timeMode === 'perfect' ? '一键完美开炉' : timeMode === 'oneclick' ? '一键开炉' : '开炉';
        const extNote = [];
        if (fireName && fireRate > 0) extNote.push(`炉火【${fireName}】提速 ${Math.round(fireRate * 100)}%`);
        if (gongfaName) extNote.push(`功法【${gongfaName}】xishu+${gfXishu.toFixed(2)}`);
        const extStr = extNote.length ? '\n' + extNote.join('，') : '';
        e.reply(`【${modeText}】炉[${furnaceName}] 火[${fireName}]${extStr}\n恭喜你获得了[${wuqiname}·${houzhui}],炼器经验增加了[${z}]`);
        return false;
      }
    }
    return false;
  }

  async openit(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    return this.doForge(e, user_qq, 'normal');
  }

  async oneclickOpen(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来锻造吧`);
      return false;
    }
    const player = await data.getData('player', user_qq);
    if (player.occupation != '炼器师') {
      e.reply(`切换到炼器师后再来吧,宝贝`);
      return false;
    }
    // 先确认炉内有材料，避免白扣道具
    let newtripod;
    try {
      newtripod = await Read_tripod();
    } catch {
      await Write_duanlu([]);
      newtripod = await Read_tripod();
    }
    let hasMat = false;
    for (let item of newtripod) {
      if (user_qq == item.qq && item.材料.length > 0) {
        hasMat = true;
        break;
      }
    }
    if (!hasMat) {
      e.reply(`煅炉里面空空如也,先放入材料再来一键开炉吧`);
      return false;
    }
    // 管理员无需条件；普通玩家需要[时光令]
    if (!this.isMaster(e, user_qq)) {
      const haveLing = await exist_najie_thing(user_qq, '时光令', '道具');
      if (!haveLing || haveLing < 1) {
        e.reply(`一键开炉需要[时光令]，你还没有此物（管理员无需）\n可先 #熔炼 材料，再用 #我的锻炉 查看`);
        return false;
      }
      await Add_najie_thing(user_qq, '时光令', '道具', -1);
    }
    return this.doForge(e, user_qq, 'oneclick');
  }

  async perfectOpen(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来锻造吧`);
      return false;
    }
    const player = await data.getData('player', user_qq);
    if (player.occupation != '炼器师') {
      e.reply(`切换到炼器师后再来吧,宝贝`);
      return false;
    }
    let newtripod;
    try {
      newtripod = await Read_tripod();
    } catch {
      await Write_duanlu([]);
      newtripod = await Read_tripod();
    }
    let hasMat = false;
    for (let item of newtripod) {
      if (user_qq == item.qq && item.材料.length > 0) {
        hasMat = true;
        break;
      }
    }
    if (!hasMat) {
      e.reply(`煅炉里面空空如也,先放入材料再来一键完美开炉吧`);
      return false;
    }
    // 管理员无需条件；普通玩家需要[时光令]+[造化本源]
    if (!this.isMaster(e, user_qq)) {
      const haveLing = await exist_najie_thing(user_qq, '时光令', '道具');
      const haveBen = await exist_najie_thing(user_qq, '造化本源', '道具');
      if (!haveLing || haveLing < 1 || !haveBen || haveBen < 1) {
        e.reply(`一键完美开炉需要[时光令]+[造化本源]，你尚未集齐（管理员无需）\n可先 #熔炼 材料，再用 #我的锻炉 查看`);
        return false;
      }
      await Add_najie_thing(user_qq, '时光令', '道具', -1);
      await Add_najie_thing(user_qq, '造化本源', '道具', -1);
    }
    return this.doForge(e, user_qq, 'perfect');
  }

  isMaster(e, user_qq) {
    if (e.isMaster) return true;
    try {
      const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
      const masterList = xiuxianConfig.Master || [];
      return masterList.includes(user_qq.toString().replace('qg_', ''));
    } catch {
      return false;
    }
  }


  async mytript(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) {
      e.reply(`请先去#炼器师能力评测,再来煅炉吧`);
      return false;
    }

    let a = await Read_mytripod(user_qq);
    const player = await data.getData('player', user_qq);
    const furnaceName = a.炉阶 || '凡铁炉';
    const furnace = await readthat(furnaceName, '炼器炉');
    const { name: fireName, fire, unavailable } = await resolveForgeFire(user_qq, player);
    const fireRate = fire && typeof fire.缩短比例 === 'number' ? fire.缩短比例 : 0;
    const gongfaName = player.炼器功法 || null;
    const gongfa = gongfaName ? await readthat(gongfaName, '功法列表') : null;
    const gfTimeCut = gongfa && typeof gongfa.timeCut === 'number' ? gongfa.timeCut : 0;
    const windowBonus = gongfa && typeof gongfa.windowBonus === 'number' ? gongfa.windowBonus : 0;
    const timeSpeed = 1 - Math.min(0.95, fireRate + gfTimeCut);

    if (a.材料.length === 0) {
      e.reply(`锻炉里空空如也,没什么好看的\n【锻炉】${furnaceName}` + (furnace ? `（xishu+${furnace.xishu}）` : '') + ` 【炉火】${fireName}` + (fire ? `（提速 ${Math.round(fireRate * 100)}%）` : '') + (unavailable ? `\n原炉火【${unavailable}】尚未拥有，已回退凡火` : ''));
      return false;
    }

    // 汇总材料（名称 + 数量 + 属性）
    const matMap = new Map();
    for (let i in a.材料) {
      const name = a.材料[i];
      const cnt = Number(a.数量[i]) || 0;
      if (!matMap.has(name)) matMap.set(name, { count: 0, attr: null });
      const m = matMap.get(name);
      m.count += cnt;
      if (!m.attr) m.attr = await readthat(name, '锻造材料');
    }

    // 计算九维总属性：攻 防 血 暴 | 金 木 土 水 火
    const WX = ['金', '木', '土', '水', '火'];
    const jiuwei = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const [, m] of matMap) {
      const c = m.attr;
      if (!c) continue;
      jiuwei[0] += (c.攻 || 0) * m.count;
      jiuwei[1] += (c.防 || 0) * m.count;
      jiuwei[2] += (c.血 || 0) * m.count;
      jiuwei[3] += (c.暴 || 0) * m.count;
      jiuwei[4] += (c.金 || 0) * m.count;
      jiuwei[5] += (c.木 || 0) * m.count;
      jiuwei[6] += (c.土 || 0) * m.count;
      jiuwei[7] += (c.水 || 0) * m.count;
      jiuwei[8] += (c.火 || 0) * m.count;
    }

    const num = jiuwei[0] + jiuwei[1] + jiuwei[2];

    // 格式化工具
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const fmtDur = ms => {
      const totalMin = Math.max(0, Math.floor(ms / 60000));
      const day = Math.floor(totalMin / 1440);
      const hr = Math.floor((totalMin % 1440) / 60);
      const min = totalMin % 60;
      const p = [];
      if (day) p.push(`${day}天`);
      if (hr) p.push(`${hr}小时`);
      if (min) p.push(`${min}分`);
      return p.join('') || '0分';
    };
    const t3 = v => {
      const r = Math.round(v * 1000) / 1000;
      return (r === 0 ? 0 : r).toString();
    };

    // 开炉时机（与 #开炉 完美判定一致：overtime=(80*num+10)分钟，±2分钟完美+10%，±8分钟内无加成损失）
    const optimalMin = 80 * num + 10;
    const optimalMs = optimalMin * 60 * 1000 * timeSpeed;
    const perfectStart = optimalMs - (2 + windowBonus) * 60 * 1000;
    const perfectEnd = optimalMs + (2 + windowBonus) * 60 * 1000;
    const safeEnd = optimalMs + (8 + windowBonus) * 60 * 1000;

    let statusText, timingText;
    const now = Date.now();
    if (a.状态 == 1 && a.TIME) {
      // 已在锻造中：以实际启动时刻为基准推算完美窗口
      const startAbs = a.TIME + perfectStart;
      const endAbs = a.TIME + perfectEnd;
      const safeAbs = a.TIME + safeEnd;
      statusText = '锻造中';
      if (now < startAbs) {
        timingText =
          `距完美开炉还剩 ${fmtDur(startAbs - now)}\n` +
          `  完美窗口：${fmt(new Date(startAbs))} ~ ${fmt(new Date(endAbs))}\n` +
          `  （±2分钟完美+10%，±8分钟内无加成损失，最晚 ${fmt(new Date(safeAbs))}）\n` +
          `  建议于 ${fmt(new Date(startAbs))} 前后 #开炉`;
      } else if (now <= endAbs) {
        timingText =
          `现在正是完美开炉黄金期！立即 #开炉 可获最高加成(+10%)\n` +
          `  完美窗口：${fmt(new Date(startAbs))} ~ ${fmt(new Date(endAbs))}`;
      } else {
        timingText =
          `已错过完美窗口 ${fmtDur(now - endAbs)}，加成开始下降\n` +
          `  完美窗口已于 ${fmt(new Date(endAbs))} 结束，最晚可于 ${fmt(new Date(safeAbs))} 前 #开炉（无加成损失）\n` +
          `  请尽快开炉`;
      }
    } else {
      // 尚未启动锻造：提示先 #开始炼制，再等待对应时长
      const startAbs = now + perfectStart;
      const endAbs = now + perfectEnd;
      const safeAbs = now + safeEnd;
      statusText = '待启动';
      timingText =
        `炉内已备料，使用 #开始炼制 后约 ${optimalMin} 分钟为完美开炉时机\n` +
        `  完美窗口：${fmt(new Date(startAbs))} ~ ${fmt(new Date(endAbs))}\n` +
        `  （±2分钟完美+10%，±8分钟内无加成损失，最晚 ${fmt(new Date(safeAbs))}）`;
    }

    // 组装材料明细
    let totalCount = 0;
    for (let i in a.数量) totalCount += Number(a.数量[i]) || 0;
    let b = '';
    b += `【锻炉】${furnaceName}` + (furnace ? `（xishu+${furnace.xishu}，容纳量${furnace.容纳量}）` : '') + `\n`;
    b += `【炉火】${fireName}` + (fire ? `（提速 ${Math.round(fireRate * 100)}%，最佳开炉更快）` : '') + `\n`;
    if (unavailable) b += `  原炉火【${unavailable}】尚未拥有，已回退凡火\n`;

    // 炼器功法显示
    if (gongfaName) {
      const prof = Math.min(player.炼器功法熟练度 || 0, 100);
      const gfX = ((gongfa ? (gongfa.xishu || 0) : 0) + (prof / 100) * 0.1).toFixed(2);
      b += `【炼器功法】${gongfaName}（品级${gongfa ? gongfa.品级 : '?'}｜系数+${gfX}｜熟练度 ${prof}/100` +
        (gongfa && gongfa.windowBonus ? `｜完美窗口+${gongfa.windowBonus}分` : '') +
        (gongfa && gongfa.timeCut ? `｜缩时${Math.round(gongfa.timeCut * 100)}%` : '') + `）\n`;
    } else {
      b += `【炼器功法】无（使用 #修炼功法 习得）\n`;
    }
    b += `\n`;
    b += `您的锻炉里拥有（${matMap.size} 种 / 共 ${totalCount} 个）：\n`;
    for (const [name, m] of matMap) {
      const c = m.attr;
      b += `· ${name} ×${m.count}\n`;
      if (c) {
        const wxStr = WX.map(n => ({ n, v: (c[n] || 0) * m.count }))
          .filter(o => o.v > 0)
          .map(o => `${o.n}${o.v}`)
          .join(' ') || '无';
        b +=
          `    攻+${t3((c.攻 || 0) * m.count)} 防+${t3((c.防 || 0) * m.count)} ` +
          `血+${t3((c.血 || 0) * m.count)} 暴+${t3((c.暴 || 0) * m.count)}\n` +
          `    五行：${wxStr}\n`;
      } else {
        b += `    （未找到该材料属性）\n`;
      }
    }

    // 属性总览
    const totalWx = WX.map((n, idx) => ({ n, v: jiuwei[4 + idx] }))
      .filter(o => o.v > 0)
      .map(o => `${o.n}${o.v}`)
      .join(' ') || '无';
    b +=
      `\n【属性总览】攻 ${t3(jiuwei[0])} / 防 ${t3(jiuwei[1])} / ` +
      `血 ${t3(jiuwei[2])} / 暴 ${t3(jiuwei[3])}\n` +
      `【五行总览】${totalWx}\n\n` +
      `【开炉时机】状态：${statusText}\n${timingText}`;

    e.reply(b);
    return false;
  }

  // ===== 第一步新增：煅炉品阶 / 炉火 指令 =====
  async showFurnace(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    const a = await Read_mytripod(user_qq);
    const furnaceName = a.炉阶 || '凡铁炉';
    const furnace = await readthat(furnaceName, '炼器炉');
    const allFurnace = await readall('炼器炉');
    const idx = allFurnace.findIndex(x => x.name === furnaceName);
    const next = idx >= 0 && idx + 1 < allFurnace.length ? allFurnace[idx + 1] : null;
    const owned = [];
    for (const candidate of allFurnace) {
      if (candidate.name === '凡铁炉' || candidate.name === furnaceName || Number(await exist_najie_thing(user_qq, candidate.name, '道具')) > 0) {
        owned.push(candidate.name);
      }
    }
    let b = `【当前煅炉】${furnaceName}\n`;
    if (furnace) {
      b += `  系数加成：xishu+${furnace.xishu}\n`;
      b += `  容纳量：${furnace.容纳量}\n`;
    }
    b += `  当前拥有：${owned.join('、')}\n`;
    if (next) {
      b += `\n【下一阶】${next.name}（xishu+${next.xishu}，容纳量${next.容纳量}）\n`;
      b += Number(await exist_najie_thing(user_qq, next.name, '道具')) > 0
        ? `  已拥有，使用 #升阶锻炉 安装`
        : `  尚未拥有，可前往 #战功商店 兑换`;
    } else {
      b += `\n已是最高阶煅炉`;
    }
    b += `\n使用 #安装锻炉 <名称> 可在已拥有的锻炉间自由切换`;
    e.reply(b);
    return false;
  }

  async upgradeFurnace(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    let newtripod;
    try { newtripod = await Read_tripod(); } catch { await Write_duanlu([]); newtripod = await Read_tripod(); }
    let target;
    for (let item of newtripod) { if (user_qq == item.qq) { target = item; break; } }
    if (!target) return false;
    if (target.状态 == 1) { e.reply(`炼制中不能更换锻炉`); return false; }
    const furnaceName = target.炉阶 || '凡铁炉';
    const allFurnace = await readall('炼器炉');
    const idx = allFurnace.findIndex(x => x.name === furnaceName);
    if (idx < 0 || idx + 1 >= allFurnace.length) { e.reply(`已是最高阶煅炉，无法继续升阶`); return false; }
    const next = allFurnace[idx + 1];
    if (Number(await exist_najie_thing(user_qq, next.name, '道具')) < 1) {
      e.reply(`你尚未拥有【${next.name}】，请先前往 #战功商店 兑换`);
      return false;
    }
    target.炉阶 = next.name;
    target.容纳量 = next.容纳量;
    await Write_duanlu(newtripod);
    e.reply(`安装成功！当前锻炉为【${next.name}】\n  系数加成 xishu+${next.xishu}，容纳量 ${next.容纳量}`);
    return false;
  }

  async installFurnace(e) {
    if (!verc({ e })) return false;
    let user_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!(await existplayer(user_qq))) return false;
    const name = e.msg.replace('#', '').replace('安装锻炉', '').trim();
    if (!name) { e.reply(`请指定锻炉名，如 #安装锻炉 玄铁炉`); return false; }
    const furnace = await readthat(name, '炼器炉');
    if (!furnace) { e.reply(`没有名为【${name}】的锻炉`); return false; }
    if (name !== '凡铁炉' && Number(await exist_najie_thing(user_qq, name, '道具')) < 1) {
      e.reply(`你尚未拥有【${name}】，请先前往 #战功商店 兑换`);
      return false;
    }
    const tripods = await Read_tripod();
    const target = tripods.find(item => user_qq == item.qq);
    if (!target) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    if (target.状态 == 1) { e.reply(`炼制中不能更换锻炉`); return false; }
    target.炉阶 = furnace.name;
    target.容纳量 = furnace.容纳量;
    await Write_duanlu(tripods);
    e.reply(`已安装【${furnace.name}】（xishu+${furnace.xishu}，容纳量${furnace.容纳量}）\n炉火保持独立，可使用 #点燃炉火 自由搭配`);
    return false;
  }

  async showFire(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    const player = await data.getData('player', user_qq);
    const { name: fireName, fire, unavailable } = await resolveForgeFire(user_qq, player);
    const allFire = await readall('炼器火');
    const owned = ['凡火'];
    for (const candidate of allFire) {
      if (candidate.name !== '凡火' && Number(await exist_najie_thing(user_qq, candidate.name, '道具')) > 0) {
        owned.push(candidate.name);
      }
    }
    let b = `【当前炉火】${fireName}\n`;
    if (fire) {
      b += `  品级：${fire.品级}\n`;
      b += `  缩短炼器时间：${Math.round(fire.缩短比例 * 100)}%\n`;
      b += `  （开始炼制到最佳开炉时间相应变短）\n`;
    }
    if (unavailable) b += `\n原炉火【${unavailable}】尚未拥有，已自动回退凡火。`;
    b += `\n已拥有火种：${owned.join('、')}\n`;
    b += `使用 #点燃炉火 <火种名> 自由更换；更多火种可在 #战功商店 兑换`;
    e.reply(b);
    return false;
  }

  async lightFire(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    const a = await Read_mytripod(user_qq);
    if (a.状态 == 1) { e.reply(`炼制中不能更换炉火`); return false; }
    let name = e.msg.replace('#', '').replace('点燃炉火', '').trim();
    if (!name) { e.reply(`请指定火种名，如 #点燃炉火 灵火`); return false; }
    const fire = await readthat(name, '炼器火');
    if (!fire) { e.reply(`没有名为【${name}】的火种`); return false; }
    if (name !== '凡火' && Number(await exist_najie_thing(user_qq, name, '道具')) < 1) {
      e.reply(`你尚未拥有【${name}】，可前往 #战功商店 搜寻兑换`);
      return false;
    }
    const player = await data.getData('player', user_qq);
    player.炉火 = name;
    await Write_player(user_qq, player);
    e.reply(`已点燃炉火【${name}】（炼器提速 ${Math.round(fire.缩短比例 * 100)}%，开始炼制到最佳开炉时间更短）`);
    return false;
  }

  // ===== 炼器功法指令 =====
  async showGongfa(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    const player = await data.getData('player', user_qq);
    const gongfaName = player.炼器功法 || null;
    const gongfa = gongfaName ? await readthat(gongfaName, '功法列表') : null;
    const allGongfa = (await readall('功法列表')).filter(g => g.type === '炼器' && typeof g.xishu === 'number');
    let b = `【当前炼器功法】${gongfaName || '无'}\n`;
    if (gongfa) {
      const prof = Math.min(player.炼器功法熟练度 || 0, 100);
      const gfX = (gongfa.xishu + (prof / 100) * 0.1).toFixed(2);
      b += `  品级：${gongfa.品级}\n`;
      b += `  系数加成：xishu+${gfX}（基础${gongfa.xishu}+熟练度${prof}/100）\n`;
      if (gongfa.windowBonus) b += `  特效：完美窗口放宽 +${gongfa.windowBonus} 分\n`;
      if (gongfa.timeCut) b += `  特效：炼器时间缩短 ${Math.round(gongfa.timeCut * 100)}%\n`;
    }
    b += `\n【可修炼功法】\n`;
    for (const g of allGongfa) {
      b += `· ${g.name}（${g.品级}｜xishu+${g.xishu}` +
        (g.windowBonus ? `｜窗口+${g.windowBonus}` : '') +
        (g.timeCut ? `｜缩时${Math.round(g.timeCut * 100)}%` : '') +
        `）修炼需 ${g.cost} 灵石\n`;
    }
    b += `\n使用 #修炼功法 <功法名> 进行修炼`;
    e.reply(b);
    return false;
  }

  async learnGongfa(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_', '');
    user_qq = await channel(user_qq);
    if (!(await existplayer(user_qq))) return false;
    const A = await looktripod(user_qq);
    if (A != 1) { e.reply(`请先去#炼器师能力评测,再来煅炉吧`); return false; }
    const tripod = await Read_mytripod(user_qq);
    if (tripod.状态 == 1) { e.reply(`炼制中不能更换炼器功法`); return false; }
    let name = e.msg.replace('#', '').replace('修炼功法', '').trim();
    if (!name) { e.reply(`请指定功法名，如 #修炼功法 百炼诀`); return false; }
    const gongfa = await readthat(name, '功法列表');
    if (!gongfa) { e.reply(`没有名为【${name}】的炼器功法`); return false; }
    if (gongfa.type !== '炼器' || typeof gongfa.xishu !== 'number') { e.reply(`【${name}】暂未配置炼器属性，无法作为炼器功法修炼`); return false; }
    const player = await data.getData('player', user_qq);
    const cost = gongfa.cost || 0;
    if ((player.灵石 || 0) < cost) {
      e.reply(`灵石不足，修炼【${gongfa.name}】需 ${cost} 灵石，当前 ${player.灵石 || 0}`);
      return false;
    }
    player.灵石 = (Number(player.灵石) || 0) - cost;
    player.炼器功法 = gongfa.name;
    player.炼器功法熟练度 = 0;
    await Write_player(user_qq, player);
    e.reply(`修炼成功！已习得炼器功法【${gongfa.name}】（品级${gongfa.品级}，xishu+${gongfa.xishu}` +
      (gongfa.windowBonus ? `，完美窗口+${gongfa.windowBonus}分` : '') +
      (gongfa.timeCut ? `，缩时${Math.round(gongfa.timeCut * 100)}%` : '') +
      `）\n消耗灵石 ${cost}，熟练度已重置为 0（每次开炉 +1，满 100 额外 +0.1 系数）`);
    return false;
  }

  async learnTimeTokenRecipe(e) {
    if (!verc({ e })) return false;
    const user_qq = await channel(e.user_id.toString().replace('qg_', ''));
    if (!(await existplayer(user_qq))) return false;
    const player = await data.getData('player', user_qq);
    if (player.时光令配方) {
      e.reply(`你已经参悟【时光令配方】，可使用 #合成时光令*数量`);
      return false;
    }
    if (Number(await exist_najie_thing(user_qq, '时光令配方', '道具')) < 1) {
      e.reply(`你还没有【时光令配方】，可前往 #战功商店 兑换`);
      return false;
    }

    await Add_najie_thing(user_qq, '时光令配方', '道具', -1);
    player.时光令配方 = true;
    try {
      await Write_player(user_qq, player);
    } catch (error) {
      await Add_najie_thing(user_qq, '时光令配方', '道具', 1);
      console.error('[时光令配方] 参悟存档失败，已退还配方', error);
      e.reply('参悟失败，配方已退还，请稍后重试');
      return false;
    }
    e.reply([
      '【时光令配方已参悟】',
      '每枚时光令需要：光阴石×2、世界石×1、天外清风×1、符纸×10',
      '发送 #合成时光令*数量 即可制作。'
    ].join('\n'));
    return false;
  }

  async getnewname(e) {
    if (!verc({ e })) return false;
    let user_qq = e.user_id.toString().replace('qg_',''); //用户qq
    user_qq=await channel(user_qq)
    if (!(await existplayer(user_qq))) return false;
    let thing = e.msg.replace('#', '');
    thing = thing.replace('赋名', '');
    const code = thing.split('*');
    const thing_name = code[0]; //原物品
    let new_name = code[1]; //新名字
    const thingnum = await exist_najie_thing(user_qq, thing_name, '装备');
    if (!thingnum) {
      e.reply(`你没有这件装备`);
      return false;
    }
    const newname = await foundthing(new_name);
    if (newname) {
      e.reply(`这个世间已经拥有这把武器了`);
      return false;
    }
    if (newname.length > 8) {
      e.reply('字符超出最大限制,请重新赋名');
      return false;
    }
    let A;
    try {
      A = await Read_it();
    } catch {
      await Writeit([]);
      A = await Read_it();
    }
    for (let item of A) {
      if (item.name == thing_name) {
        e.reply(`一个装备只能赋名一次`);
        return false;
      }
    }
    const thingall = await Read_najie(user_qq);

    for (let item of thingall.装备) {
      if (item.name == thing_name) {
        if (item.atk < 99 && item.def <99 && item.HP < 99) {
          if (
            item.atk >= 1.5 ||
            item.def >= 1.2 ||
            (item.type == '法宝' && (item.atk >= 1 || item.def >= 1)) ||
            item.atk + item.def > 1.95
          ) {
            item.atk=Math.round(item.atk*100)/100
            item.def=Math.round(item.def*100)/100
            item.HP=Math.round(item.HP*100)/100
            item.name = new_name;
            item.owner_name=user_qq;
            item.稀有度=2;
            A.push(item);
            await Write_najie(user_qq, thingall);
            await Writeit(A);
            const allThing=await readall('传闻系统')
            const Time=Date.now();

            const newThing = {
  uid: user_qq,                // 所有者ID
  name:item.name,
  equipment: {
       // 装备唯一ID
    name: new_name,            // 新名称
    class: item.class,          // 装备大类（武器/护具/法宝）
    type: item.type || '通用',  // 具体类型（长剑/法杖等）
      atk: item.atk,           // 攻击力
      def: item.def,           // 防御力
      hp: item.HP,             // 生命值
      bao: item.bao || 0 ,      // 暴击率,
      author_name: item.author_name || '匿名',  // 制作者
      owner_name: user_qq,          // 当前持有者
      出售价: item.出售价 || 0,   // 出售价格
      rarity: 2, 
      islockd: 0,              // 稀有度（1-5星）
      pinji: item.pinji || 1, // 品质等级
    timestamp: Date.now()      // 赋名时间
  },
  num:1,   
   Time:Time,
   稀有度:2 ,           // 数量
  logs: [{
    event: "赋名",
    time: Date.now(),
    operator: user_qq,
    oldName: thing_name        // 记录原名
  }]
};
            allThing.push(newThing)
            await dataall(allThing,'传闻系统')
             await Add_najie_thing(user_qq,new_name,item.class,1,item.pinji)
            e.reply(`附名成功,您的${thing_name}更名为${new_name}`);
            return false;
          }
        }
      }
    }
    e.reply(`您的装备太弱了,无法赋予名字`);
    return false;
  }
  async remakeit(e){
    let user_qq=e.user_id.toString().replace('qg_','')
    user_qq=await channel(user_qq)
    let thing = e.msg.replace('#', '');
    thing = thing.replace('神兵重铸', '');
    const code = thing.split('*');
    const thing_name = code[0]; //物品原名
    let newname = code[1]; //数量改名
    const thingnum = await exist_najie_thing(user_qq, thing_name, '装备');
    if (!thingnum) {
      e.reply(`你没有这件装备`);
      return false;
    }
    const it = await foundthing(newname);
    if (it) {
      e.reply(`这个世间已经拥有这把武器了`);
      return false;
    }
    if (it.length > 8) {
      e.reply('字符超出最大限制,请重新赋名');
      return false;
    }
    const ka = await exist_najie_thing(user_qq, '神兵重铸卡', '道具');
    if(!ka){
      e.reply('你没有神兵重铸卡')
      return false;
    }
    let old=await Read_it();
    for(let item of old){
      if(item.name==thing_name){
        item.name=newname
        await Writeit(old)
        await Add_najie_thing(user_qq, '神兵重铸卡', '道具', -1); 
        // await Add_najie_thing(user_qq, thing_name, '装备' , -1); 
        let PLAYER=await Read_najie(user_qq)
       for(let item2 of   PLAYER.装备){
        if(item2.name==thing_name){
          item2.name=newname
        }
        await Write_najie(user_qq,PLAYER)
       }
       e.reply('神光转瞬即逝，武器又重回您的纳戒当中')
        return false;
      }
    }
    e.reply('无法命名非神兵武器')
    return
   }
}
