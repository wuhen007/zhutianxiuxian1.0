import fs from 'fs';
import path from 'path';
import plugin from '../../../../lib/plugins/plugin.js';
import {__PATH} from '../../model/xiuxian.js';
import config from '../../model/Config.js';
import { Read_player, Write_player } from '../../model/xiuxian.js';
import data from '../../model/XiuxianData.js';
import { refreshDaofaStatus } from '../../model/daofa.js';

/**
 * 道法仙术定时任务
 */
export class DaofaDailyTask extends plugin {
  constructor() {
    super({
      name: 'DaofaDailyTask',
      dsc: '每天0点同步道法仙术有效期',
      event: 'message',
      priority: 300,
      rule: [],
    });
    
    // 设置时区（根据服务器配置）
    process.env.TZ = 'Asia/Shanghai';
    
    // 设置定时任务为每天0点执行
    this.task = {
      cron: '0 0 * * *', // 每天0点执行
      name: 'DaofaDailyTask',
      fnc: () => this.reduceDaofaDays(),
    };
  }
  
  async reduceDaofaDays() {
    const startTime = Date.now();
    let updatedCount = 0;
    let expiredCount = 0;
    
    try {
      const playerPath = __PATH.player_path;
      const playerFiles = fs.readdirSync(playerPath);
      const batchSize = 100; // 每批处理100个玩家
      
      for (let i = 0; i < playerFiles.length; i += batchSize) {
        const batchFiles = playerFiles.slice(i, i + batchSize);
        const batchResult = await this.processBatch(batchFiles);
        updatedCount += batchResult.updatedCount;
        expiredCount += batchResult.expiredCount;
        console.log(`[每日定时任务] 已处理批次 ${Math.ceil(i / batchSize) + 1}`);
      }
      
      console.log(`[每日定时任务] 已更新${updatedCount}名玩家，其中${expiredCount}名玩家道法仙术已到期`);
    } catch (error) {
      console.error('[每日定时任务] 执行出错:', error);
      
      // 错误恢复：记录失败点
      const checkpointFile = path.join(__PATH.temp_path, 'daofa_task_checkpoint.json');
      const checkpoint = {
        lastProcessed: new Date().toISOString(),
        error: error.message
      };
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint));
    } finally {
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // 秒
      console.log(`[每日定时任务] 执行完成，耗时 ${duration.toFixed(2)} 秒`);
    }
  }
  
  async processBatch(files) {
    const players = [];
    let updatedCount = 0;
    let expiredCount = 0;
    
    // 读取批处理中的玩家数据
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const qq = file.replace('.json', '');
          const player = await Read_player(qq);
          player.qq = qq;
          players.push(player);
        } catch (error) {
          console.error(`读取玩家数据出错: ${file}`, error);
        }
      }
    }
    
    // 处理批处理中的玩家
    const nowTime = Date.now();
    for (const player of players) {
      const status = refreshDaofaStatus(player, nowTime);
      if (status === 'inactive') continue;

      await Write_player(player.qq, player);
      if (status === 'expired') {
        data.removeFromDaofaList(player.qq);
        expiredCount++;
      }
      updatedCount++;
    }
    
    return { updatedCount, expiredCount };
  }
}
