import { isXiuxianAdmin } from '../../model/xiuxian.js';
import {  plugin, common, config, data } from '../../api/api.js';
import fs from 'fs';
import {
  Read_player,
  isNotNull,
  Add_najie_thing,
  Add_修为,
  Add_血气,
  Add_HP,
  Write_player,
  Read_equipment,
  Write_equipment,
  Add_寿元,
  Read_danyao,
  Write_danyao,
  bigNumberTransform,
  zd_battle,
  get_log_img,
  Read_najie,
  exist_najie_thing,
  existplayer,
  channel,
  getTargetQQFromEvent,
} from '../../model/xiuxian.js';
import { AppName } from '../../app.config.js';
import { getRealmAuthorityName, lowerRealmAuthority } from '../../model/realmAuthority.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
  clearDarkSuppressionPlayerState,
  completeDarkSuppressionCreation,
  DARK_SUPPRESSION_CANCELLING,
  DARK_SUPPRESSION_CANCELLING_CREATION,
  DARK_SUPPRESSION_CREATING,
  deleteDarkSuppressionAction,
  hasDarkSuppressionPlayerState,
  hasDarkSuppressionState,
  markDarkSuppressionCancelling,
  markDarkSuppressionCreationCancelling,
} from '../../model/darkSuppression.js';

export class DarkSuppressionTask extends plugin {
  constructor() {
    super({
      name: '黑暗镇压定时任务',
      dsc: '处理被黑暗准仙帝镇压的玩家',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#解除炼化.*$', fnc: 'removeSuppression' },
      ],
    });
    
    // 调整为每10分钟执行一次（注意cron表达式格式）
    this.task = {
      cron: '0 */10 * * * *', // 每10分钟的第0秒执行
      name: 'DarkSuppressionTask',
      fnc: () => this.checkSuppressedPlayers(),
    };
    
    // 镇压持续时间（毫秒）
    this.SUPPRESSION_DURATION = 60 * 60 * 1000; // 60分钟
  }

  async removeSuppression(e) {
    const adminQQ = String(e.user_id).replace('qg_', '');
    const masters = (config.getConfig('xiuxian', 'xiuxian').Master || []).map(String);
    if (!isXiuxianAdmin(e)) return false;

    const rawTarget = getTargetQQFromEvent(e);
    const playerId = rawTarget ? String(await channel(rawTarget)) : '';
    if (!playerId) return e.reply('请使用：#解除炼化 @玩家 或 #解除炼化 QQ号');
    if (!await existplayer(playerId)) return e.reply('目标玩家不存在于诸天万界中');

    try {
      const result = await this.cancelSuppression(playerId);
      if (!result.active) {
        return e.reply(`「${result.player.名号 || playerId}」当前未处于黑暗准仙帝炼化中。`);
      }
      return e.reply([
        segment.at(playerId),
        `\n【管理员·解除炼化】`,
        `\n黑暗准仙帝的炼化过程已被强行中断。`,
        `\n行动限制与炼化状态已解除，本次不会跌落境界。`,
      ]);
    } catch (err) {
      console.error(`管理员解除玩家${playerId}炼化状态失败:`, err);
      return e.reply(`解除炼化失败：${err.message}`);
    }
  }

  async getSuppressionState(playerId, player) {
    const [marker, endTime, suppressionData, actionData] = await Promise.all([
      redis.get(`xiuxian:dark_suppression:${playerId}`),
      redis.get(`xiuxian:player:${playerId}:suppression_end`),
      redis.get(`xiuxian:player:${playerId}:suppression_data`),
      redis.get(`xiuxian:player:${playerId}:action`),
    ]);
    return {
      active: hasDarkSuppressionState(player, { marker, endTime, suppressionData, actionData }),
      actionData,
      endTime,
      marker,
      suppressionData,
    };
  }

  async cancelSuppression(playerId) {
    return withPlayerMutationLock(playerId, async () => {
      let player = await Read_player(playerId);
      const state = await this.getSuppressionState(playerId, player);
      if (!state.active) return { active: false, player };

      if (state.marker === DARK_SUPPRESSION_CREATING) {
        await markDarkSuppressionCreationCancelling(redis, playerId);
        state.marker = DARK_SUPPRESSION_CANCELLING_CREATION;
      }
      if (state.marker === DARK_SUPPRESSION_CANCELLING_CREATION) {
        player = await this.cancelCreatingSuppression(playerId, state);
        return { active: true, player };
      }

      await markDarkSuppressionCancelling(redis, playerId);
      if (clearDarkSuppressionPlayerState(player)) await Write_player(playerId, player);
      await this.cleanupSuppression(playerId, state.actionData);
      return { active: true, player };
    });
  }

  async applySuppressionCreationRecovery(playerId, state, clearPlayerState = false) {
    let suppressionData;
    try {
      suppressionData = JSON.parse(state.suppressionData || '{}');
    } catch {
      suppressionData = {};
    }
    const recovery = suppressionData.recovery;
    let player = await Read_player(playerId);
    if (!player || !recovery?.player_patch || typeof recovery.player_patch !== 'object') return null;

    if (recovery.equipment && typeof recovery.equipment === 'object') {
      await Write_equipment(playerId, recovery.equipment);
      player = await Read_player(playerId);
    }
    if (!player) return null;
    Object.assign(player, recovery.player_patch);
    if (clearPlayerState) clearDarkSuppressionPlayerState(player);
    await Write_player(playerId, player);
    return { player, suppressionData };
  }

  async resumeSuppressionCreation(playerId, state) {
    const recovery = await this.applySuppressionCreationRecovery(playerId, state);
    if (!recovery) {
      await markDarkSuppressionCancelling(redis, playerId);
      await this.cancelSuppression(playerId);
      return null;
    }
    await completeDarkSuppressionCreation(redis, playerId, {
      groupId: recovery.suppressionData.group_id,
      originalLevel: recovery.suppressionData.original_level,
    });
    return recovery.player;
  }

  async cancelCreatingSuppression(playerId, state) {
    const recovery = await this.applySuppressionCreationRecovery(playerId, state, true);
    if (!recovery) {
      const player = await Read_player(playerId);
      if (clearDarkSuppressionPlayerState(player)) await Write_player(playerId, player);
      await this.cleanupSuppression(playerId, state.actionData);
      return player;
    }
    await this.cleanupSuppression(playerId, state.actionData);
    return recovery.player;
  }

  async checkSuppressedPlayers() {
    const now = Date.now();
    console.log(`[${new Date().toISOString()}] 执行镇压检查任务`);
    
    // 获取所有被镇压的玩家
    const suppressedPlayers = await redis.keys('xiuxian:dark_suppression:*');
    
    if (suppressedPlayers.length === 0) {
      console.log('当前没有玩家被镇压');
      return;
    }
    
    console.log(`发现${suppressedPlayers.length}个被镇压玩家`);
    
    for (const key of suppressedPlayers) {
      const playerId = key.replace('xiuxian:dark_suppression:', '');

      try {
        await withPlayerMutationLock(playerId, () => this.checkSuppressedPlayer(playerId, now));
      } catch (err) {
        console.error(`处理玩家${playerId}镇压状态失败:`, err);
      }
    }
  }

  async checkSuppressedPlayer(playerId, now) {
    let player = await Read_player(playerId);
    let state = await this.getSuppressionState(playerId, player);
    if (!state.active) return;
    if (state.marker === DARK_SUPPRESSION_CANCELLING_CREATION) {
      await this.cancelCreatingSuppression(playerId, state);
      return;
    }
    if (state.marker === DARK_SUPPRESSION_CREATING) {
      player = await this.resumeSuppressionCreation(playerId, state);
      if (!player) return;
      state = await this.getSuppressionState(playerId, player);
    }
    if (state.marker === DARK_SUPPRESSION_CANCELLING) {
      await this.cancelSuppression(playerId);
      return;
    }
    if (!hasDarkSuppressionPlayerState(player)) {
      await this.cleanupSuppression(playerId, state.actionData);
      return;
    }

    const { endTime } = state;
    if (!endTime) {
      console.warn(`玩家${playerId}无镇压结束时间，已自动解除`);
      await this.cancelSuppression(playerId);
      return;
    }

    const parsedEndTime = Number(endTime);
    if (!Number.isFinite(parsedEndTime)) {
      console.warn(`玩家${playerId}镇压结束时间无效，已自动解除`);
      await this.cancelSuppression(playerId);
      return;
    }

    const remainingTime = parsedEndTime - now;
    if (remainingTime <= 0) {
      console.log(`解除玩家${playerId}的镇压状态`);
      await this.releaseSuppression(playerId);
      return;
    }

    console.log(`玩家${playerId}还需镇压${Math.ceil(remainingTime / 60000)}分钟`);
    const remainingMinutes = Math.floor(remainingTime / 60000);
    if (remainingMinutes === 30 || remainingMinutes === 10) {
      await this.sendSuppressionReminder(playerId, remainingMinutes);
    }
  }

  async sendSuppressionReminder(playerId, remainingMinutes) {
    try {
      const suppressionData = await redis.get(`xiuxian:player:${playerId}:suppression_data`);
      if (!suppressionData) return;
      
      const { group_id } = JSON.parse(suppressionData);
      const msg = [
        `【黑暗镇压剩余时间】`,
        `你的元神仍在被黑暗准仙帝炼化中！`,
        `剩余镇压时间: ${remainingMinutes}分钟`,
        `解除后你的境界将跌落一层！`,
      ].join('\n');
      
      if (group_id) {
        await Bot.pickGroup(group_id).sendMsg([
          segment.at(playerId),
          msg
        ]);
      } else {
        await common.relpyPrivate(playerId, msg);
      }
    } catch (err) {
      console.error('发送镇压提醒失败:', err);
    }
  }

  async releaseSuppression(playerId) {
    return withPlayerMutationLock(playerId, async () => {
      try {
        const player = await Read_player(playerId);
        const state = await this.getSuppressionState(playerId, player);
        if (!state.active) return false;
        const suppressionData = await redis.get(`xiuxian:player:${playerId}:suppression_data`);
        let groupId;
        try {
          groupId = JSON.parse(suppressionData || '{}').group_id;
        } catch {
          groupId = undefined;
        }

        const needsSettlement = hasDarkSuppressionPlayerState(player);
        if (!needsSettlement) {
          await this.cleanupSuppression(playerId, state.actionData);
          return true;
        }

        // 境界跌落一层（按实际主修路线结算）
        const originalRealm = getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list);
        lowerRealmAuthority(player);
        const currentRealm = getRealmAuthorityName(player, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list);
        if (player.道果状态 === '道崩·炼化中') player.道果状态 = '道果受损';
        delete player.时间长河道崩;

        await Write_player(playerId, player);
        await this.cleanupSuppression(playerId, state.actionData);

        const msg = [
          `【镇压解除·道果受损】`,
          `黑暗准仙帝的镇压已解除！`,
          `你的道果被炼化部分，境界跌落一层！`,
          `境界变化: ${originalRealm} → ${currentRealm}`,
          `建议立即调息恢复，稳固道基！`
        ].join('\n');

        try {
          if (groupId) {
            await Bot.pickGroup(groupId).sendMsg([
              segment.at(playerId),
              msg
            ]);
          } else {
            await common.relpyPrivate(playerId, msg);
          }
        } catch (notifyError) {
          console.error(`发送玩家${playerId}镇压解除通知失败:`, notifyError);
        }
        return true;
      } catch (err) {
        console.error('解除镇压失败:', err);
        return false;
      }
    });
  }

  async cleanupSuppression(playerId, knownActionData = null) {
    // 主标记最后删除；前序清理失败时，定时任务仍可重试。
    await redis.del(`xiuxian:player:${playerId}:suppression_end`);
    await redis.del(`xiuxian:player:${playerId}:suppression_data`);
    await redis.del(`xiuxian:time_river:end_time:${playerId}`);

    await deleteDarkSuppressionAction(
      redis,
      `xiuxian:player:${playerId}:action`,
      knownActionData
    );
    await redis.del(`xiuxian:dark_suppression:${playerId}`);
  }
}
