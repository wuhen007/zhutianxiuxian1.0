import fs from 'fs';
import { plugin, config } from '../../api/api.js';
import { Read_player, Write_player,__PATH } from '../../model/xiuxian.js';
import { readShouyuanDifficulty } from './shouyuanDifficulty.js';
import { notifyReincarnationPlayer, getActiveReincarnationController } from '../SecretPlace/ZhuanshiTask.js';
import { buildShouyuanRebirthNotice } from './shouyuanRebirthNotice.js';
import { hasReincarnationProtection } from '../../model/innateTreasure.js';

const SHOUYUAN_RESCUE_WINDOW_MS = 5 * 60 * 1000;

// 寿元耗尽 → 自动送入轮回往生路（惩罚型，复用 ZhuanshiTask 转世链路）
export async function triggerShouyuanRebirth(usr_qq, player) {
  try {
    if (hasReincarnationProtection(player)) return false;
    // 幂等：已有转世任务则跳过，避免重复送入
    const existing = await redis.get(`xiuxian:zhuanshi_task:${usr_qq}`);
    if (existing) return;

    // 重生次数上限保护（与 #送入轮回 一致，避免被无限转世）
    let reincarnation_count = await redis.get(`xiuxian:player:${usr_qq}:reCreate_acount`);
    reincarnation_count = parseInt(reincarnation_count) || 0;
    if (reincarnation_count >= 15) return;

    const task = {
      player_qq: usr_qq,
      player_id: usr_qq,
      player_name: player.名号,
      player_data: player,
      group_id: null,
      admin_info: {
        qq: 'system',
        name: '天道',
        time: new Date().toLocaleString()
      },
      start_time: Date.now(),
      end_time: Date.now() + SHOUYUAN_RESCUE_WINDOW_MS,
      acount: reincarnation_count,
      status: '轮回中',
      type: '寿元耗尽',
      admin: 'system'
    };
    await redis.multi()
      .set(`xiuxian:zhuanshi_task:${usr_qq}`, JSON.stringify(task), { EX: 24 * 60 * 60 })
      .set(`xiuxian:player:${usr_qq}:action`, JSON.stringify({
        action: '轮回往生路',
        type: 'zhuanshi',
        start_time: task.start_time,
        end_time: task.end_time,
        description: '寿元耗尽，等待往生或救援',
        status: '轮回中',
      }))
      .exec();
    // 若有轮回路执掌者，弥留通知一并 @ 执掌者（补上此前遗漏的 @）
    let controller = null;
    try {
      controller = await getActiveReincarnationController();
    } catch (e) {
      // 获取执掌者失败不影响弥留通知主流程
    }
    const extraMentions = controller && controller.player_id ? [controller.player_id] : [];
    await notifyReincarnationPlayer(
      usr_qq,
      buildShouyuanRebirthNotice(player.名号, usr_qq, SHOUYUAN_RESCUE_WINDOW_MS),
      extraMentions
    );
    console.log(`【寿元耗尽】玩家 ${usr_qq} 寿元已尽，送入轮回往生路`);
  } catch (err) {
    console.error(`【寿元耗尽】触发转世失败 (${usr_qq}):`, err);
  }
}

export class ReduceShouyuanTask extends plugin {
  constructor() {
    super({
      name: '寿元流逝定时任务',
      dsc: '每三小时减少玩家1000寿元',
      event: 'message',
      priority: 300,
      rule: [],
    });
    this.set = config.getConfig('task', 'task');
    this.task = {
      cron: "0 0 */3 * * ?", // 每三小时执行一次
      name: 'ReduceShouyuanTask',
      fnc: () => this.reduceShouyuan(),
    };
  }

  async reduceShouyuan() {
    try {
      const difficulty = readShouyuanDifficulty(`${__PATH.data_path}/位面.json`);
      if (!difficulty.drainsLifespan) {
        console.log('[寿元流逝] 当前为简单难度，本轮不扣除寿元');
        return true;
      }

      // 获取所有玩家文件列表
      const playerDir = __PATH.player_path;
      const files = fs.readdirSync(playerDir);
      
      let count = 0;
      const startTime = Date.now();
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const usr_qq = file.replace('.json', '');
          const player = await Read_player(usr_qq);
          
          // 跳过特殊玩家（如GM、管理员）
          if (player.名号.includes("管理员") || player.名号.includes("GM")) {
            continue;
          }
          
          // 境界越高，寿元减少越少
          let reduction = 1000;
           if (player.level_id > 50) {
            reduction = Math.floor(reduction * 0.5);
          } else if (player.level_id <=41) {
            reduction = 20;
          }
          
          // 特殊体质寿元流逝更慢
          if (player.灵根.type === "圣体道胎" || player.灵根.type === "大成圣体"|| player.灵根.type === "大成霸体") {
            reduction = Math.floor(reduction * 0.3);
          }
          // 特殊体质寿元流逝更慢
          if (player.灵根.type === "小成圣体" ||player.灵根.type === "小成霸体" || player.灵根.type === "大道体") {
            reduction = Math.floor(reduction * 0.5);
          }
          // 特殊体质寿元流逝更慢
          if (player.灵根.type === "圣体" ) {
            reduction = Math.floor(reduction * 0.7);
          }
           // 特殊体质寿元流逝更慢
          if (player.灵根.type === "神体"||player.灵根.type === "神王体"|| player.灵根.type === "转生"||player.灵根.type === "魔头"||player.灵根.type === "魔女" || player.灵根.type === "魔法少女"|| player.灵根.type === "魔卡少女") {
            reduction = Math.floor(reduction * 0.8);
          }
          // 确保寿元不为负
          player.寿元 = Math.max(0, player.寿元 - reduction);

          await Write_player(usr_qq, player);
          count++;

          // 寿元耗尽 → 自动送入轮回往生路（惩罚型）
          if (difficulty.reincarnatesOnExhaustion && player.寿元 <= 0) {
            await triggerShouyuanRebirth(usr_qq, player);
          }
          
          // 每处理100个玩家休息一下，避免阻塞
          if (count % 100 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (err) {
          console.error(`处理玩家 ${file} 时出错:`, err);
        }
      }
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`[寿元流逝] 已完成 ${count} 名玩家的寿元减少，耗时 ${duration.toFixed(2)} 秒`);
    } catch (err) {
      console.error('寿元流逝任务执行失败:', err);
    }
    return true;
  }
}
