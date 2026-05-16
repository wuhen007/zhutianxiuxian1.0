import plugin from '../../../../lib/plugins/plugin.js';
import common from '../../../../lib/common/common.js';
import config from '../../model/Config.js';
import {
  Add_najie_thing,
  Add_灵石,
  Read_player,
} from '../../model/xiuxian.js';
import { openAU } from '../Auction/Auction.js';
import { get_auction_img } from '../../model/xiuxian.js';

/**
 * 星阁拍卖定时任务（图片版）
 */
export class AuctionofficialTask extends plugin {
  constructor() {
    super({
      name: 'AuctionofficialTask',
      dsc: '星阁拍卖定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });

    this.set = config.getConfig('xiuxian', 'xiuxian');
    this.task = {
      cron: this.set.Auction.Auction_task,
      name: 'AuctionofficialTask',
      fnc: () => this.AuctionofficialTask(),
    };
    
  }

  async AuctionofficialTask() {
    const wupinStr = await redis.get('xiuxian:AuctionofficialTask');

    /* ================= 未开拍 ================= */
    if (!wupinStr) {
      const nowDate = new Date();
      const todayDate = new Date(nowDate);
      const { openHour, closeHour } = this.set.Auction;
      const todayTime = todayDate.setHours(0, 0, 0, 0);
      const openTime = todayTime + openHour * 60 * 60 * 1000;
      const closeTime = todayTime + closeHour * 60 * 60 * 1000;
      const nowTime = nowDate.getTime();

      if (nowTime < openTime || nowTime > closeTime) return;

      /* 开启拍卖 */
      const auction = await openAU();

      const msgArr = [
        "📦 拍品：【" + auction.thing.name + "】",
        "当前最高价：0",
        "暂无出价者",
        "请在群内 #星阁出价 XXX 参与"
      ];

      for (const group_id of auction.groupList) {
        await this.sendAuctionImg(group_id, msgArr);
      }
      return;
    }

    /* ================= 正在拍卖 ================= */
    const wupin = JSON.parse(wupinStr);
    const group_ids = wupin.groupList;
    const interMinu = this.set.Auction.interval;
    const nowTime = Date.now();

    if (wupin.last_offer_price + interMinu * 60 * 1000 > nowTime) {
      const remain =
        wupin.last_offer_price + interMinu * 60 * 1000 - nowTime;
      const m = Math.floor(remain / 60000);
      const s = Math.floor((remain % 60000) / 1000);

      const msgArr = [
        "📦 拍品：【" + wupin.thing.name + "】",
        "当前最高价：" + wupin.last_price,
        "剩余时间：" + m + "分" + s + "秒"
      ];

      for (const group_id of group_ids) {
        await this.sendAuctionImg(group_id, msgArr);
      }
    } else {
      /* ================= 拍卖结束 ================= */
      const last_offer_player = wupin.last_offer_player;

      if (last_offer_player === 0) {
        const msgArr = [
          "📦 拍品：【" + wupin.thing.name + "】",
          "流拍",
          "无人出价，已退回神秘人纳戒"
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, msgArr);
        }
      } else {
        await Add_灵石(last_offer_player, -wupin.last_price);
        await Add_najie_thing(
          last_offer_player,
          wupin.thing.name,
          wupin.thing.class,
          wupin.amount,
          wupin.thing.pinji
        );

        const player = await Read_player(last_offer_player);

        const msgArr = [
          "拍品：【" + wupin.thing.name + "】",
          "成交！",
          "最终价格：" + wupin.last_price,
          "得主：" + player.名号
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, msgArr);
        }
      }

      await redis.del('xiuxian:AuctionofficialTask');
    }
  }

  /**
   * 发送拍卖图片
   */
  async sendAuctionImg(group_id, msgArr) {
    try {
      const simulatedEvent = {
        group_id,
        isGroup: true,
        sender: {
          user_id: Bot.uin,
          nickname: '星阁'
        }
      };

      const img = await get_auction_img(simulatedEvent, msgArr);
      await Bot.pickGroup(group_id).sendMsg(img);
    } catch (err) {
      console.error('拍卖图片发送失败:', err);
      // 兜底文本
      await this.pushInfo(group_id, true, msgArr.join('\n'));
    }
  }

  /**
   * 兜底文本推送
   */
  async pushInfo(id, is_group, msg) {
    if (is_group) {
      await Bot.pickGroup(id).sendMsg(msg).catch(() => {});
    } else {
      await common.relpyPrivate(id, msg);
    }
  }
}