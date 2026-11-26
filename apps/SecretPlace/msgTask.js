import { plugin, puppeteer, config, Show } from '../../api/api.js';
import { Read_temp, Write_temp } from '../../model/xiuxian.js';
import {
  getSecretPlaceSummaryNotificationRoute,
  sendSecretPlaceNotification,
} from '../../model/secretPlaceNotification.js';
/**
 * 读 JPEG 高度，用于识别「只截到标题、正文没渲染出来」的空图。
 * 进程内第一次截图时浏览器刚冷启动，页面常常还没画完就截了。
 */
function jpegHeight(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return 0;
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0~SOF15（排除 DHT/JPG/DAC）里带图片尺寸
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return buf.readUInt16BE(i + 5);
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  return 0;
}

/** 截图；高度明显不足（只有标题）时重渲染一次，避免推送一张空图 */
async function screenshotLog(data) {
  let img = await puppeteer.screenshot('log', { ...data });
  const buf = img?.file;
  // 空图（只有标题条）实测约 118px，单行内容约 180px，取 150 作分界
  if (Buffer.isBuffer(buf) && jpegHeight(buf) < 150) {
    img = await puppeteer.screenshot('log', { ...data });
  }
  return img;
}

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
        // 传字符串而不是数组：数组会被模板按 JSON 渲染，图上出现 ["、"] 和一堆引号。
        // 用英文逗号连接，与模板既有的 split(",") 分条规则一致。
        let temp_data = {
          log: batch.msg.join(','),
        };
        const data1 = await new Show().get_log(temp_data);
        let img = await screenshotLog(data1);
        const sent = await sendSecretPlaceNotification(batch.action, batch.playerId, img);
        if (!sent) failedEntries.push(...batch.entries);
      }
      await Write_temp(failedEntries);
    }
  }
}
