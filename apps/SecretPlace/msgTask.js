import { plugin, puppeteer, config, Show } from '../../api/api.js';
import { Read_temp, Write_temp } from '../../model/xiuxian.js';
import {
  getSecretPlaceSummaryNotificationRoute,
  sendSecretPlaceNotification,
} from '../../model/secretPlaceNotification.js';
export class msgTask extends plugin {
  constructor() {
    super({
      name: 'msgTask',
      dsc: '定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });
    this.set = config.getConfig('task', 'task');
    this.task = {
      cron: this.set.temp_task,
      name: 'msgTask',
      fnc: () => this.msgTask(),
    };
  }

  async msgTask() {
    let temp;
    try {
      temp = await Read_temp();
    } catch {
      await Write_temp([]);
      temp = await Read_temp();
    }
    if (temp.length > 0) {
      const batches = new Map();
      for (const entry of temp) {
        const route = getSecretPlaceSummaryNotificationRoute(entry);
        if (!route.target) {
          console.error('[秘境汇总通知] 缺少消息目标，已跳过:', entry);
          continue;
        }
        if (!batches.has(route.key)) {
          batches.set(route.key, { ...route, entries: [], msg: [] });
        }
        const batch = batches.get(route.key);
        batch.entries.push(entry);
        batch.msg.push(entry.msg);
      }

      const failedEntries = [];
      for (const batch of batches.values()) {
        let temp_data = {
          log: batch.msg,
        };
        const data1 = await new Show().get_log(temp_data);
        let img = await puppeteer.screenshot('log', {
          ...data1,
        });
        const sent = await sendSecretPlaceNotification(batch.action, batch.playerId, img);
        if (!sent) failedEntries.push(...batch.entries);
      }
      await Write_temp(failedEntries);
    }
  }
}
