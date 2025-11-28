import fs from 'fs';
import path from 'path';
import { plugin, puppeteer, verc, Show, data, config } from '../../api/api.js';
import { __PATH } from '../../model/xiuxian.js';
import {
  ForwardMsg,
  Read_player,
  shijianc,
  Add_灵石,
  existplayer,
  Add_najie_thing,
  exist_najie_thing,
  zd_battle,
  channel
} from '../../model/xiuxian.js';
export class Tiandibang extends plugin {
  constructor() {
    super({
      name: 'Tiandibang',
      dsc: '交易模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#天地榜$',
          fnc: 'my_point',
        },
        {
          reg: '^#比试$',
          fnc: 'pk',
        },
        {
          reg: '^#更新属性$',
          fnc: 'update_jineng',
        },
        {
          reg: '^#清空积分',
          fnc: 'bd_jiesuan',
        },
        {
          reg: '^#报名比赛',
          fnc: 'cansai',
        },
        {
          reg: '^#天地堂',
          fnc: 'tianditang',
        },
        {
          reg: '^#积分兑换(.*)$',
          fnc: 'duihuan',
        },
         {
          reg: '^#结算天地榜奖励$',
          fnc: 'settle_rewards',
          permission: 'master' // 只有主人可以执行
        }
      ],
    });
   this.set = config.getConfig('task', 'task');
    this.task = {
      cron: this.set.saiji, // 赛季结算任务，每周一0点
      name: 're_bangdang',
      fnc: () => this.re_bangdang(),
    };
this.task2 = {
  cron:  this.set.resetCron,
  name: 'reset_challenge_and_reward',
  fnc: () => this.resetChallengeAndReward(),
    };
  }
async settle_rewards(e) {
    if (!e.isMaster) {
        e.reply('只有主人可以执行此操作');
        return false;
    }
    
    try {
        // 执行奖励结算逻辑，并获取结算详情
        const result = await this.resetChallengeAndReward();
        
        // 构建详细奖励日志
        let reply = '天地榜奖励结算完成！\n前三名玩家奖励详情：';
        
        for (const [index, player] of result.topPlayers.entries()) {
            const reward = result.rewards[index];
            reply += `\n\n🥇 第${index + 1}名: ${player.名号} (QQ:${player.qq})`;
            reply += `\n💎 获得灵石: ${reward.灵石.toLocaleString()}`;
            reply += `\n🎁 获得宝盒: ${reward.宝盒}个`;
        }
        
        // 添加排名变更信息
        if (result.positionChanges.length > 0) {
            reply += '\n\n排名变化:';
            result.positionChanges.forEach(change => {
                reply += `\n${change.name} ${change.change > 0 ? '上升' : '下降'} ${Math.abs(change.change)}位`;
            });
        }
        
        e.reply(reply);
        return true;
    } catch (err) {
        console.error('结算天地榜奖励出错:', err);
        e.reply('结算天地榜奖励失败，请查看日志');
        return false;
    }
}

async resetChallengeAndReward() {
  try {
    const tiandibang = await Read_tiandibang();
    if (tiandibang.length === 0) {
      logger.mark('天地榜为空，无需结算');
      return false;
    }

    // 1. 保存旧排名用于比较
    const oldRanking = {};
    tiandibang.forEach((player, index) => {
      oldRanking[player.qq] = {
        rank: index + 1,
        points: player.积分
      };
    });

    // 2. 按积分降序排序
    tiandibang.sort((a, b) => b.积分 - a.积分);
    
    // 3. 前三名奖励配置
    const rewardData = [
      { position: 1, 灵石: 17500000, 宝盒: 5 },
      { position: 2, 灵石: 13000000, 宝盒: 3 },
      { position: 3, 灵石: 9200000, 宝盒: 1 }
    ];

    // 4. 构建消息内容
    const date = new Date();
    const formattedDate = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
    
    let announcement = [`【天地榜每日结算】(${formattedDate})`];
    let loggerMsg = [`天地榜结算：${formattedDate}`];
    
    // 5. 处理前三名奖励
    await Promise.all(rewardData.map(async (reward, index) => {
      if (tiandibang.length < index + 1) return;
      
      const player = tiandibang[index];
      const oldRank = oldRanking[player.qq]?.rank || "未入榜";
      const rankChange = oldRank !== "未入榜" 
        ? (oldRank === index + 1 ? "持平" : (oldRank > index + 1 ? `↑${oldRank - (index + 1)}` : `↓${(index + 1) - oldRank}`))
        : "新上榜";
      
      // 构建玩家奖励消息
      announcement.push(
        ` 第${reward.position}名: ${player.名号}`,
        `  积分: ${player.积分.toLocaleString()}`,
        `  排名: ${rankChange} (${oldRank}→${index+1})`,
        `  奖励: ${reward.灵石.toLocaleString()}灵石 + ${reward.宝盒}个超越宝盒`
      );
      
      loggerMsg.push(
        `第${reward.position}名: ${player.名号}(${player.qq})`,
        `  积分: ${player.积分} | 排名变化: ${rankChange}`,
        `  获得: ${reward.灵石}灵石 + ${reward.宝盒}宝盒`
      );
      
      // 发放奖励
      await Add_灵石(player.qq, reward.灵石);
      await Add_najie_thing(player.qq, "超越宝盒", "盒子", reward.宝盒);
    }));

    // 6. 处理4-10名公告
    if (tiandibang.length > 3) {
      announcement.push("\n 优秀修士:");
      for (let i = 3; i < Math.min(tiandibang.length, 10); i++) {
        const player = tiandibang[i];
        const oldRank = oldRanking[player.qq]?.rank || "未入榜";
        const rankChange = oldRank !== "未入榜" 
          ? (oldRank === i + 1 ? "" : (oldRank > i + 1 ? `↑${oldRank - (i + 1)}` : `↓${(i + 1) - oldRank}`))
          : "✨新星";
        announcement.push(`  ${i+1}. ${player.名号} ${rankChange}`);
      }
    }
    
    // 7. 重置积分和次数（每周重置）
    const isWeeklyReset = new Date().getDay() === 1; // 周一
    if (isWeeklyReset) {
      tiandibang.forEach(player => {
        player.积分 = 0;
        player.次数 = 3;
      });
      announcement.push("\n⚠️注意：天地榜积分已重置，所有玩家次数恢复3次");
    } else {
      announcement.push("\n每日挑战次数已恢复");
      tiandibang.forEach(player => {
        player.次数 = 3;
      });
    }
    
    // 8. 保存更新
    await Write_tiandibang(tiandibang);
    
    // 9. 发送系统公告到所有配置的群组
    try {
        // 获取配置中的群组列表
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        const targetGroup = xiuxianConfig?.Era?.notifyGroups || [];
        await Bot.pickGroup(targetGroup).sendMsg(announcement.join('\n'));
        logger.mark(`天地榜结算公告已发送至群 ${targetGroup}`);
    } catch (err) {
        logger.error(`发送天地榜结算公告失败: ${err.stack}`);
    }
    
    // 10. 记录详细日志
    logger.mark(loggerMsg.join('\n'));
    return true;
    
  } catch (err) {
    logger.error(`天地榜结算失败: ${err.stack}`);
    return false;
  }
}
// 发送奖励通知
async sendRewardNotifications(tiandibang) {
    try {
        // 给前三名玩家发送通知
        for (let i = 0; i < Math.min(3, tiandibang.length); i++) {
            const player = tiandibang[i];
            const rewardMsg = [];
            
            if (i === 0) {
                rewardMsg.push(
                    `恭喜您荣登天地榜榜首！`,
                    `获得第一名奖励：`,
                    `- 1750万灵石`,
                    `- 超越宝盒 x5`
                );
            } else if (i === 1) {
                rewardMsg.push(
                    `恭喜您获得天地榜第二名！`,
                    `获得第二名奖励：`,
                    `- 1300万灵石`,
                    `- 超越宝盒 x3`
                );
            } else if (i === 2) {
                rewardMsg.push(
                    `恭喜您获得天地榜第三名！`,
                    `获得第三名奖励：`,
                    `- 920万灵石`,
                    `-超越宝盒 x1`
                );
            }
            
            // 尝试发送私信通知
            try {
                await common.relpyPrivate(player.qq, rewardMsg.join('\n'));
            } catch (e) {
                console.log(`无法发送私信给 ${player.名号}，尝试群聊通知`);
                // 如果私信失败，尝试在群聊中@通知
                // 这里需要知道玩家所在的群组，可能需要额外存储信息
            }
        }
        
        // 在系统公告群发送公告
        const systemGroup = config.getConfig('system', 'announce_group');
        if (systemGroup) {
            let announcement = [
                `天地榜每日奖励发放完毕`,
                `第一名：${tiandibang[0]?.名号 || '无'} - 获得1750万灵石 + 超越宝盒*5`,
                `第二名：${tiandibang[1]?.名号 || '无'} - 获得1300万灵石 + 超越宝盒*3`,
                `第三名：${tiandibang[2]?.名号 || '无'} - 获得920万灵石 + 超越宝盒*1`,
                `每日0点重置挑战次数并发放奖励，努力提升排名吧！`
            ];
            
            await Bot.pickGroup(systemGroup).sendMsg(announcement.join('\n'));
        }
        
    } catch (err) {
        console.error('发送奖励通知出错:', err);
    }
}

  async re_bangdang() {
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith('.json'));
    let File_length = File.length;
    let temp = [];
    let t;
    for (var k = 0; k < File_length; k++) {
      let this_qq = File[k].replace('.json', '');

      let player = await Read_player(this_qq);
      let level_id = data.Level_list.find(
        item => item.level_id == player.level_id
      ).level_id;
      temp[k] = {
        名号: player.名号,
        境界: level_id,
        攻击: player.攻击,
        防御: player.防御,
        当前血量: player.血量上限,
        暴击率: player.暴击率,
        灵根: player.灵根,
        法球倍率: player.灵根.法球倍率,
        学习的功法: player.学习的功法,
        魔道值: player.魔道值,
        神石: player.神石,
        qq: this_qq,
        次数: 3,
        积分: 0,
      };
    }
    for (var i = 0; i < File_length - 1; i++) {
      var count = 0;
      for (var j = 0; j < File_length - i - 1; j++) {
        if (temp[j].积分 < temp[j + 1].积分) {
          t = temp[j];
          temp[j] = temp[j + 1];
          temp[j + 1] = t;
          count = 1;
        }
      }
      if (count == 0) break;
    }
    await Write_tiandibang(temp);
    return false;
  }

  async duihuan(e) {
    if (!verc({ e })) return false;
    let date = new Date();
    let n = date.getDay();
    if (n != 0) {
      e.reply(`物品筹备中，等到周日再来兑换吧`);
      return false;
    }

    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    var reg = new RegExp(/积分兑换/);
    let msg = e.msg.replace(reg, '');
    msg = msg.replace('#', '');
    let thing_name = msg.replace('积分兑换', '');
    let ifexist = data.tianditang.find(item => item.name == thing_name);
    if (!ifexist) {
      e.reply(`天地堂还没有这样的东西:${thing_name}`);
      return false;
    }
    let tiandibang;
    tiandibang = await Read_tiandibang();
    let m = tiandibang.length;
    let i;
    for (m = 0; m < tiandibang.length; m++) {
      if (tiandibang[m].qq == usr_qq) {
        break;
      }
    }
    if (m == tiandibang.length) {
      e.reply('请先报名!');
      return false;
    }
    for (i = 0; i < data.tianditang.length; i++) {
      if (thing_name == data.tianditang[i].name) {
        break;
      }
    }
    if (tiandibang[m].积分 < data.tianditang[i].积分) {
      e.reply(
        `积分不足,还需${
          data.tianditang[i].积分 - tiandibang[m].积分
        }积分兑换${thing_name}`
      );
      return false;
    }
    tiandibang[m].积分 -= data.tianditang[i].积分;
    await Add_najie_thing(usr_qq, thing_name, data.tianditang[i].class, 1);
    await Write_tiandibang(tiandibang);
    e.reply([
      `兑换成功!  获得[${thing_name}],剩余[${tiandibang[m].积分}]积分  `,
      '\n可以在【我的纳戒】中查看',
    ]);
    return false;
  }

  async tianditang(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let tiandibang;
    try {
      tiandibang = await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
      tiandibang = await Read_tiandibang();
    }
    let m = tiandibang.length;
    for (m = 0; m < tiandibang.length; m++) {
      if (tiandibang[m].qq == usr_qq) {
        break;
      }
    }
    if (m == tiandibang.length) {
      e.reply('请先报名!');
      return false;
    }
    let img = await get_tianditang_img(e, tiandibang[m].积分);
    e.reply(img);
    return false;
  }

  async cansai(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let tiandibang;
    try {
      tiandibang = await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
      tiandibang = await Read_tiandibang();
    }
    let x = tiandibang.length;
    for (var i = 0; i < tiandibang.length; i++) {
      if (tiandibang[i].qq == usr_qq) {
        x = i;
        break;
      }
    }
    if (x == tiandibang.length) {
      let player = await Read_player(usr_qq);
      let level_id = data.Level_list.find(
        item => item.level_id == player.level_id
      ).level_id;
      let A_player = {
        名号: player.名号,
        境界: level_id,
        攻击: player.攻击,
        防御: player.防御,
        当前血量: player.血量上限,
        血量上限: player.血量上限, 
        暴击率: player.暴击率,
        灵根: player.灵根,
        法球倍率: player.灵根.法球倍率,
        学习的功法: player.学习的功法,
        qq: usr_qq,
        次数: 0,
        积分: 0,
      };

      tiandibang.push(A_player);
      await Write_tiandibang(tiandibang);
      e.reply('参赛成功!');
      return false;
    } else {
      e.reply('你已经参赛了!');
      return false;
    }
  }

  async my_point(e) {

    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let tiandibang;
    try {
      tiandibang = await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
      tiandibang = await Read_tiandibang();
    }
    let x = tiandibang.length;
    let l = 10;
    let msg = ['***天地榜(每日免费三次)***\n       周一0点清空积分'];
    for (var i = 0; i < tiandibang.length; i++) {
      if (tiandibang[i].qq == usr_qq) {
        x = i;
        break;
      }
    }
    if (x == tiandibang.length) {
      e.reply('请先报名!');
      return false;
    }
    if (l > tiandibang.length) {
      l = tiandibang.length;
    }
    if (x < l) {
      for (var m = 0; m < l; m++) {
        msg.push(
          '名次：' +
            (m + 1) +
            '\n名号：' +
            tiandibang[m].名号 +
            '\n积分：' +
            tiandibang[m].积分
        );
      }
    } else if (x >= l && tiandibang.length - x < l) {
      for (var m = tiandibang.length - l; m < tiandibang.length; m++) {
        msg.push(
          '名次：' +
            (m + 1) +
            '\n名号：' +
            tiandibang[m].名号 +
            '\n积分：' +
            tiandibang[m].积分
        );
      }
    } else {
      for (var m = x - 5; m < x + 5; m++) {
        msg.push(
          '名次：' +
            (m + 1) +
            '\n名号：' +
            tiandibang[m].名号 +
            '\n积分：' +
            tiandibang[m].积分
        );
      }
    }
    await ForwardMsg(e, msg);
    return false;
  }

  async pk(e) {

    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    //获取游戏状态
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return false;
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
        e.reply('正在' + action.action + '中,剩余时间:' + m + '分' + s + '秒');
        return false;
      }
    }
    let tiandibang;
    try {
      tiandibang = await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
      tiandibang = await Read_tiandibang();
    }
    let x = tiandibang.length;
    for (var m = 0; m < tiandibang.length; m++) {
      if (tiandibang[m].qq == usr_qq) {
        x = m;
        break;
      }
    }
    if (x == tiandibang.length) {
      e.reply('请先报名!');
      return false;
    }
    let last_msg = [];
    let atk = 1;
    let def = 1;
    let blood = 1;
    let now = new Date();
    let nowTime = now.getTime(); //获取当前日期的时间戳
    let Today = await shijianc(nowTime);
    let lastbisai_time = await getLastbisai(usr_qq); //获得上次签到日期
    if (
      Today.Y != lastbisai_time.Y ||
      Today.M != lastbisai_time.M ||
      Today.D != lastbisai_time.D
    ) {
      await redis.set('xiuxian:player:' + usr_qq + ':lastbisai_time', nowTime); //redis设置签到时间
      tiandibang[x].次数 = 3;
    }
    if (
      Today.Y == lastbisai_time.Y &&
      Today.M == lastbisai_time.M &&
      Today.D == lastbisai_time.D &&
      tiandibang[x].次数 < 1
    ) {
      let zbl = await exist_najie_thing(usr_qq, '摘榜令', '道具');
      if (zbl) {
        tiandibang[x].次数 = 1;
        await Add_najie_thing(usr_qq, '摘榜令', '道具', -1);
        last_msg.push(`${tiandibang[x].名号}使用了摘榜令\n`);
      } else {
        e.reply('今日挑战次数用光了,请明日再来吧');
        return false;
      }
    }
    Write_tiandibang(tiandibang);
    let lingshi;
    tiandibang = await Read_tiandibang();
    if (x != 0) {
      let k;
      for (k = x - 1; k >= 0; k--) {
        if (tiandibang[x].境界 > 41) break;
        else {
          if (tiandibang[k].境界 > 41) {
            continue;
          } else break;
        }
      }
      let B_player;
      if (k != -1) {
        if (tiandibang[k].攻击 / tiandibang[x].攻击 > 2) {
          atk = 2;
          def = 2;
          blood = 2;
        } else if (tiandibang[k].攻击 / tiandibang[x].攻击 > 1.6) {
          atk = 1.6;
          def = 1.6;
          blood = 1.6;
        } else if (tiandibang[k].攻击 / tiandibang[x].攻击 > 1.3) {
          atk = 1.3;
          def = 1.3;
          blood = 1.3;
        }
        B_player = {
          名号: tiandibang[k].名号,
          攻击: tiandibang[k].攻击,
          防御: tiandibang[k].防御,
          当前血量: tiandibang[k].当前血量,
          血量上限: tiandibang[k].当前血量,  
          暴击率: tiandibang[k].暴击率,
          学习的功法: tiandibang[k].学习的功法,
          灵根: tiandibang[k].灵根,
          法球倍率: tiandibang[k].法球倍率,
        };
      }
      let A_player = {
        名号: tiandibang[x].名号,
        攻击: parseInt(tiandibang[x].攻击) * atk,
        防御: parseInt(tiandibang[x].防御 * def),
        当前血量: parseInt(tiandibang[x].当前血量 * blood),
        血量上限: tiandibang[x].当前血量,  
        暴击率: tiandibang[x].暴击率,
        学习的功法: tiandibang[x].学习的功法,
        灵根: tiandibang[x].灵根,
        法球倍率: tiandibang[x].法球倍率,
      };
      if (k == -1) {
        atk = 0.8 + 0.4 * Math.random();
        def = 0.8 + 0.4 * Math.random();
        blood = 0.8 + 0.4 * Math.random();
        B_player = {
          名号: '灵修兽',
          攻击: parseInt(tiandibang[x].攻击) * atk,
          防御: parseInt(tiandibang[x].防御 * def),
          当前血量: parseInt(tiandibang[x].当前血量 * blood),
          血量上限: parseInt(tiandibang[x].当前血量 * blood),
          暴击率: tiandibang[x].暴击率,
          学习的功法: tiandibang[x].学习的功法,
          灵根: tiandibang[x].灵根,
          法球倍率: tiandibang[x].法球倍率,
        };
      }
      let Data_battle = await zd_battle(A_player, B_player);
      let msg = Data_battle.msg;
      let A_win = `${A_player.名号}击败了${B_player.名号}`;
      let B_win = `${B_player.名号}击败了${A_player.名号}`;
      if (msg.find(item => item == A_win)) {
        if (k == -1) {
          tiandibang[x].积分 += 1500;
          lingshi = tiandibang[x].积分 * 8;
        } else {
          tiandibang[x].积分 += 2000;
          lingshi = tiandibang[x].积分 * 4;
        }
        tiandibang[x].次数 -= 1;
        last_msg.push(
          `${A_player.名号}击败了[${B_player.名号}],当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        Write_tiandibang(tiandibang);
      } else if (msg.find(item => item == B_win)) {
        if (k == -1) {
          tiandibang[x].积分 += 800;
          lingshi = tiandibang[x].积分 * 6;
        } else {
          tiandibang[x].积分 += 1000;
          lingshi = tiandibang[x].积分 * 2;
        }
        tiandibang[x].次数 -= 1;
        last_msg.push(
          `${A_player.名号}被[${B_player.名号}]打败了,当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        Write_tiandibang(tiandibang);
      } else {
       e.reply(`战斗平局！`);
  tiandibang[x].积分 += 500; // 平局奖励
      }
      await Add_灵石(usr_qq, lingshi);
      if (msg.length > 50) {
      } else {
        await ForwardMsg(e, msg);
      }
      e.reply(last_msg);
    } else {
      let A_player = {
        名号: tiandibang[x].名号,
        攻击: tiandibang[x].攻击,
        防御: tiandibang[x].防御,
        当前血量: tiandibang[x].当前血量,
        暴击率: tiandibang[x].暴击率,
        学习的功法: tiandibang[x].学习的功法,
        灵根: tiandibang[x].灵根,
        法球倍率: tiandibang[x].法球倍率,
      };
      atk = 0.8 + 0.4 * Math.random();
      def = 0.8 + 0.4 * Math.random();
      blood = 0.8 + 0.4 * Math.random();
      let B_player = {
        名号: '灵修兽',
        攻击: parseInt(tiandibang[x].攻击) * atk,
        防御: parseInt(tiandibang[x].防御 * def),
        当前血量: parseInt(tiandibang[x].当前血量 * blood),
        血量上限: parseInt(tiandibang[x].当前血量 * blood),
        暴击率: tiandibang[x].暴击率,
        学习的功法: tiandibang[x].学习的功法,
        灵根: tiandibang[x].灵根,
        法球倍率: tiandibang[x].法球倍率,
      };
      let Data_battle = await zd_battle(A_player, B_player);
      let msg = Data_battle.msg;
      let A_win = `${A_player.名号}击败了${B_player.名号}`;
      let B_win = `${B_player.名号}击败了${A_player.名号}`;
      if (msg.find(item => item == A_win)) {
        tiandibang[x].积分 += 1500;
        tiandibang[x].次数 -= 1;
        lingshi = tiandibang[x].积分 * 8;
        last_msg.push(
          `${A_player.名号}击败了[${B_player.名号}],当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        Write_tiandibang(tiandibang);
      } else if (msg.find(item => item == B_win)) {
        tiandibang[x].积分 += 800;
        tiandibang[x].次数 -= 1;
        lingshi = tiandibang[x].积分 * 6;
        last_msg.push(
          `${A_player.名号}被[${B_player.名号}]打败了,当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        Write_tiandibang(tiandibang);
      } else {
       e.reply(`战斗平局！`);
  tiandibang[x].积分 += 500; // 平局奖励
      }
      await Add_灵石(usr_qq, lingshi);
      if (msg.length > 50) {
      } else {
        await ForwardMsg(e, msg);
      }
      e.reply(last_msg);
    }
    tiandibang = await Read_tiandibang();
    let t;
    for (var i = 0; i < tiandibang.length - 1; i++) {
      var count = 0;
      for (var j = 0; j < tiandibang.length - i - 1; j++) {
        if (tiandibang[j].积分 < tiandibang[j + 1].积分) {
          t = tiandibang[j];
          tiandibang[j] = tiandibang[j + 1];
          tiandibang[j + 1] = t;
          count = 1;
        }
      }
      if (count == 0) break;
    }
    Write_tiandibang(tiandibang);
    return false;
  }

  async update_jineng(e) {
 
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!e.isGroup) {
      e.reply('此功能暂时不开放私聊');
      return false;
    }

    //查看存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let tiandibang;
    try {
      tiandibang = await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
      tiandibang = await Read_tiandibang();
    }
    let m = tiandibang.length;
    for (m = 0; m < tiandibang.length; m++) {
      if (tiandibang[m].qq == usr_qq) {
        break;
      }
    }
    if (m == tiandibang.length) {
      e.reply('请先报名!');
      return false;
    }
    let player = await Read_player(usr_qq);
    let level_id = data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    tiandibang[m].名号 = player.名号;
    tiandibang[m].境界 = level_id;
    tiandibang[m].攻击 = player.攻击;
    tiandibang[m].防御 = player.防御;
    tiandibang[m].当前血量 = player.血量上限;   // 当前血量更新为最大血量（因为每次更新属性后，玩家可能是满血）
tiandibang[m].血量上限 = player.血量上限;   // 新增：更新血量上限
    tiandibang[m].暴击率 = player.暴击率;
    tiandibang[m].学习的功法 = player.学习的功法;
    (tiandibang[m].灵根 = player.灵根),
      (tiandibang[m].法球倍率 = player.灵根.法球倍率),
      Write_tiandibang(tiandibang);
    tiandibang = await Read_tiandibang();
    tiandibang[m].暴击率 = Math.trunc(tiandibang[m].暴击率 * 100);
    let msg = [];
    msg.push(
      '名次：' +
        (m + 1) +
        '\n名号：' +
        tiandibang[m].名号 +
        '\n攻击：' +
        tiandibang[m].攻击 +
        '\n防御：' +
        tiandibang[m].防御 +
        '\n血量：' +
        tiandibang[m].当前血量 +
        '\n暴击：' +
        tiandibang[m].暴击率 +
        '%\n积分：' +
        tiandibang[m].积分
    );
    await ForwardMsg(e, msg);
    return false;
  }

  async bd_jiesuan(e) {
    if (!verc({ e })) return false;
    if (!e.isMaster) {
      e.reply('只有主人可以执行操作');
      return false;
    }
    try {
      await Read_tiandibang();
    } catch {
      //没有表要先建立一个！
      await Write_tiandibang([]);
    }
    await re_bangdang();
    e.reply('积分已经重置！');
    return false;
  }
}
async function Write_tiandibang(wupin) {
  let dir = path.join(__PATH.tiandibang, `tiandibang.json`);
  let new_ARR = JSON.stringify(wupin, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return false;
}

async function Read_tiandibang() {
  let dir = path.join(`${__PATH.tiandibang}/tiandibang.json`);
  let tiandibang = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  tiandibang = JSON.parse(tiandibang);
  return tiandibang;
}

async function getLastbisai(usr_qq) {
  //查询redis中的人物动作
  let time = await redis.get('xiuxian:player:' + usr_qq + ':lastbisai_time');
  console.log(time);
  if (time != null) {
    let data = await shijianc(parseInt(time));
    return data;
  }
  return false;
}

async function get_tianditang_img(e, jifen) {
  let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
  let player = await Read_player(usr_qq);
  let commodities_list = data.tianditang;
  let tianditang_data = {
    name: player.名号,
    jifen,
    commodities_list: commodities_list,
  };
  const data1 = await new Show(e).get_tianditangData(tianditang_data);
  let img = await puppeteer.screenshot('tianditang', {
    ...data1,
  });
  return img;
}

async function re_bangdang() {
  let File = fs.readdirSync(__PATH.player_path);
  File = File.filter(file => file.endsWith('.json'));
  let File_length = File.length;
  let temp = [];
  let t;
  for (var k = 0; k < File_length; k++) {
    let this_qq = File[k].replace('.json', '');

    let player = await Read_player(this_qq);
    let level_id = data.Level_list.find(
      item => item.level_id == player.level_id
    ).level_id;
    temp[k] = {
      名号: player.名号,
      境界: level_id,
      攻击: player.攻击,
      防御: player.防御,
      当前血量: player.血量上限,
      暴击率: player.暴击率,
      灵根: player.灵根,
      法球倍率: player.灵根.法球倍率,
      学习的功法: player.学习的功法,
      魔道值: player.魔道值,
      神石: player.神石,
      qq: this_qq,
      次数: 3,
      积分: 0,
    };
  }
  for (var i = 0; i < File_length - 1; i++) {
    var count = 0;
    for (var j = 0; j < File_length - i - 1; j++) {
      if (temp[j].积分 < temp[j + 1].积分) {
        t = temp[j];
        temp[j] = temp[j + 1];
        temp[j + 1] = t;
        count = 1;
      }
    }
    if (count == 0) break;
  }
  await Write_tiandibang(temp);
  return false;
}
