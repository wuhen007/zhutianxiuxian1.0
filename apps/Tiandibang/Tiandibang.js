import fs from 'fs';
import path from 'path';
import { plugin, puppeteer, verc, Show, data, config } from '../../api/api.js';
import { __PATH } from '../../model/xiuxian.js';
import {
  getTiandibangSettlementKey,
  getTiandibangWinners,
  TIANDIBANG_REWARDS,
} from '../../model/tiandibang.js';
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
    this.task = [{
      cron: this.set.saiji, // 赛季结算任务，每周一0点
      name: 'settle_tiandibang',
      fnc: () => this.resetChallengeAndReward(),
    }];
  }
async settle_rewards(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
        e.reply('只有主人可以执行此操作');
        return false;
    }
    
    try {
        // 执行奖励结算逻辑，并获取结算详情
        const result = await this.resetChallengeAndReward();
        
        // 构建详细奖励日志
        if (result.alreadySettled) {
            e.reply(`天地榜 ${result.weekKey} 周奖励已经结算，无需重复发放`);
            return true;
        }

        let reply = `天地榜 ${result.weekKey} 周奖励结算完成！`;
        if (result.topPlayers.length === 0) {
            e.reply(`${reply}\n本周没有积分大于0的玩家，不发放排名奖励`);
            return true;
        }
        reply += '\n前三名玩家奖励详情：';
        
        for (const [index, player] of result.topPlayers.entries()) {
            const reward = result.rewards[index];
            reply += `\n\n🥇 第${index + 1}名: ${player.名号} (QQ:${player.qq})`;
            reply += `\n💎 获得灵石: ${reward.灵石.toLocaleString()}`;
            reply += `\n🎁 获得宝盒: ${reward.宝盒}个`;
        }
        
        await e.reply(reply);
        return true;
    } catch (err) {
        console.error('结算天地榜奖励出错:', err);
        e.reply('结算天地榜奖励失败，请查看日志');
        return false;
    }
}

async resetChallengeAndReward() {
  return withTiandibangLock(async () => {
    const now = new Date();
    const weekKey = getTiandibangSettlementKey(now);
    const settlementState = Read_tiandibang_settlement();
    const existingSettlement = settlementState.weeks?.[weekKey];
    if (existingSettlement?.status === 'completed') {
      logger.mark(`天地榜 ${weekKey} 周奖励已经结算，跳过重复任务`);
      return { ...existingSettlement, weekKey, alreadySettled: true };
    }

    const tiandibang = await Read_tiandibang();
    tiandibang.sort((a, b) => b.积分 - a.积分);
    const topPlayerResults = existingSettlement?.topPlayers || getTiandibangWinners(tiandibang).map(
      player => ({ qq: player.qq, 名号: player.名号, 积分: player.积分 })
    );
    const rewards = existingSettlement?.rewards || TIANDIBANG_REWARDS.slice(0, topPlayerResults.length);
    settlementState.weeks ??= {};
    settlementState.weeks[weekKey] = {
      status: 'pending',
      weekKey,
      topPlayers: topPlayerResults,
      rewards,
    };
    Write_tiandibang_settlement(settlementState);
    const announcement = [`【天地榜每周结算】(${weekKey})`];

    for (const [index, player] of topPlayerResults.entries()) {
      const reward = rewards[index];
      announcement.push(
        ` 第${reward.position}名: ${player.名号}`,
        `  积分: ${player.积分.toLocaleString()}`,
        `  奖励: ${reward.灵石.toLocaleString()}灵石 + ${reward.宝盒}个超越宝盒`
      );
      const rewardKey = `tiandibang:${weekKey}:${player.qq}`;
      await Add_灵石(player.qq, reward.灵石, {
        idempotencyKey: `${rewardKey}:lingshi`,
      });
      await Add_najie_thing(
        player.qq,
        '超越宝盒',
        '盒子',
        reward.宝盒,
        undefined,
        1,
        { idempotencyKey: `${rewardKey}:box` }
      );
    }

    tiandibang.forEach(player => {
      player.积分 = 0;
      player.次数 = 3;
    });
    await Write_tiandibang(tiandibang);
    announcement.push('\n天地榜积分已重置，所有玩家挑战次数恢复3次');

    const result = {
      status: 'completed',
      weekKey,
      topPlayers: topPlayerResults,
      rewards,
    };
    settlementState.weeks[weekKey] = result;
    Write_tiandibang_settlement(settlementState);

    const notifyGroups = config.getConfig('xiuxian', 'xiuxian')?.Era?.notifyGroups || [];
    for (const targetGroup of notifyGroups) {
      try {
        await Bot.pickGroup(targetGroup).sendMsg(announcement.join('\n'));
      } catch (err) {
        logger.error(`发送天地榜结算公告至群 ${targetGroup} 失败: ${err.stack}`);
      }
    }
    logger.mark(announcement.join('\n'));
    return { ...result, alreadySettled: false };
  });
}

async duihuan(e) {
  if (!verc({ e })) return false;

  const date = new Date();
  if (date.getDay() !== 0) {
    e.reply(`物品筹备中，等到周日再来兑换吧`);
    return false;
  }

  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);

  // 检查存档
  if (!await existplayer(usr_qq)) return false;

  /* ===== 1. 解析商品名与数量 ===== */
  const raw = e.msg.replace(/#?积分兑换/, '').trim(); // 去掉前缀
  const [namePart, qtyPart] = raw.split('*');
  const thing_name = namePart.trim();
  const quantity = Math.max(1, parseInt(qtyPart) || 1); // 默认1

  /* ===== 2. 查找商品 ===== */
  const ifexist = data.tianditang.find(item => item.name === thing_name);
  if (!ifexist) {
    e.reply(`天地堂还没有这样的东西:${thing_name}`);
    return false;
  }

  return withTiandibangLock(async () => {
  /* ===== 3. 检查报名 ===== */
  const tiandibang = await Read_tiandibang();
  const userIndex = tiandibang.findIndex(item => item.qq == usr_qq);
  if (userIndex === -1) {
    e.reply('请先报名!');
    return false;
  }

  /* ===== 4. 检查积分 ===== */
  const needScore = ifexist.积分 * quantity; // 支持批量
  if (tiandibang[userIndex].积分 < needScore) {
    e.reply(
      `积分不足,还需${needScore - tiandibang[userIndex].积分}积分兑换${thing_name}*${quantity}`
    );
    return false;
  }

  /* ===== 5. 扣积分、发物品 ===== */
  tiandibang[userIndex].积分 -= needScore;
  await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity); // 直接给数量
  await Write_tiandibang(tiandibang);

  e.reply([
    `兑换成功! 获得[${thing_name}]*${quantity},剩余[${tiandibang[userIndex].积分}]积分`,
    '\n可以在【#我的纳戒】中查看',
  ]);
  return false;
  });
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
    return withTiandibangLock(async () => {
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
    });
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
    return withTiandibangLock(async () => {
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
    await Write_tiandibang(tiandibang);
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
      if (Data_battle.winner === 'A') {
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
          await Write_tiandibang(tiandibang);
      } else if (Data_battle.winner === 'B') {
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
          await Write_tiandibang(tiandibang);
      } else {
        tiandibang[x].积分 += 500;
        tiandibang[x].次数 -= 1;
        lingshi = 0;
        last_msg.push(
          `${A_player.名号}与[${B_player.名号}]战平,当前积分[${tiandibang[x].积分}]`
        );
        await Write_tiandibang(tiandibang);
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
      if (Data_battle.winner === 'A') {
        tiandibang[x].积分 += 1500;
        tiandibang[x].次数 -= 1;
        lingshi = tiandibang[x].积分 * 8;
        last_msg.push(
          `${A_player.名号}击败了[${B_player.名号}],当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        await Write_tiandibang(tiandibang);
      } else if (Data_battle.winner === 'B') {
        tiandibang[x].积分 += 800;
        tiandibang[x].次数 -= 1;
        lingshi = tiandibang[x].积分 * 6;
        last_msg.push(
          `${A_player.名号}被[${B_player.名号}]打败了,当前积分[${tiandibang[x].积分}],获得了[${lingshi}]灵石`
        );
        await Write_tiandibang(tiandibang);
      } else {
        tiandibang[x].积分 += 500;
        tiandibang[x].次数 -= 1;
        lingshi = 0;
        last_msg.push(
          `${A_player.名号}与[${B_player.名号}]战平,当前积分[${tiandibang[x].积分}]`
        );
        await Write_tiandibang(tiandibang);
      }
      await Add_灵石(usr_qq, lingshi);
      if (msg.length > 50) {
      } else {
        await ForwardMsg(e, msg);
      }
      e.reply(last_msg);
    }
    tiandibang = await Read_tiandibang();
    tiandibang.sort((a, b) => b.积分 - a.积分);
    await Write_tiandibang(tiandibang);
    return false;
    });
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
    return withTiandibangLock(async () => {
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
    tiandibang[m].灵根 = player.灵根;
    tiandibang[m].法球倍率 = player.灵根.法球倍率;
    await Write_tiandibang(tiandibang);
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
    });
  }

  async bd_jiesuan(e) {
    if (!verc({ e })) return false;
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      e.reply('只有主人可以执行操作');
      return false;
    }
    await withTiandibangLock(async () => {
      try {
        await Read_tiandibang();
      } catch {
        await Write_tiandibang([]);
      }
      const tiandibang = await Read_tiandibang();
      tiandibang.forEach(player => {
        player.积分 = 0;
        player.次数 = 3;
      });
      await Write_tiandibang(tiandibang);
    });
    e.reply('积分已经重置！');
    return false;
  }
}

async function withTiandibangLock(callback) {
  const lockKey = 'xiuxian:lock:tiandibang';
  const token = `${Date.now()}:${Math.random()}`;
  let locked = false;
  for (let attempt = 0; attempt < 200 && !locked; attempt++) {
    locked = Boolean(await redis.set(lockKey, token, { EX: 120, NX: true }));
    if (!locked) await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (!locked) throw new Error('天地榜正忙，请稍后重试');

  try {
    return await callback();
  } finally {
    try {
      await redis.eval(`
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
      `, { keys: [lockKey], arguments: [token] });
    } catch (error) {
      logger.error(`释放天地榜锁失败: ${error.stack}`);
    }
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

function Read_tiandibang_settlement() {
  const file = path.join(__PATH.tiandibang, 'settlement.json');
  if (!fs.existsSync(file)) return { weeks: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function Write_tiandibang_settlement(state) {
  const file = path.join(__PATH.tiandibang, 'settlement.json');
  fs.writeFileSync(file, JSON.stringify(state, null, '\t'), 'utf8');
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
