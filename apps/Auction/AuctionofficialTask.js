import plugin from '../../../../lib/plugins/plugin.js';
import common from '../../../../lib/common/common.js';
import config from '../../model/Config.js';
import {
  Read_player,
} from '../../model/xiuxian.js';
import { openAU } from '../Auction/Auction.js';
import { get_auction_img } from '../../model/xiuxian.js';
import {
  createSettlingAuction,
  hasReservedAuctionItem,
  refundAuctionItem,
  settleAuctionPurchase,
} from '../../model/auctionSettlement.js';
import {
  compareAndDeleteRedisJson,
  compareAndSetRedisJson,
} from '../../utils/redisJsonCas.js';
import { runTaskOnce } from '../../utils/taskGuard.js';

const SETTLEMENT_LEASE_MS = 60_000;
const RESERVATION_LEASE_MS = 60_000;

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
    return runTaskOnce('AuctionofficialTask', async () => {
      try {
        await this.processPlayerAuction();
      } catch (error) {
        console.error('玩家拍卖结算失败:', error);
      }
      return this.processOfficialAuction();
    });
  }

  async processOfficialAuction() {
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
      if (!auction) return;

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
    if (wupin.status === 'settling') {
      if (Date.now() - Number(wupin.settlingAt || 0) < SETTLEMENT_LEASE_MS) return;
      const resumed = { ...wupin, settlingAt: Date.now() };
      if (!await compareAndSetRedisJson(
        redis,
        'xiuxian:AuctionofficialTask',
        wupinStr,
        resumed
      )) return;
      return this.finishOfficialAuction(resumed, JSON.stringify(resumed));
    }
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
      const resolution = wupin.last_offer_player === 0
        ? 'unsold'
        : wupin.last_offer_player < 0 ? 'npc' : 'buyer';
      const settling = createSettlingAuction(wupin, resolution);
      if (!await compareAndSetRedisJson(
        redis,
        'xiuxian:AuctionofficialTask',
        wupinStr,
        settling
      )) return;
      return this.finishOfficialAuction(settling, JSON.stringify(settling));
    }
  }

  async finishOfficialAuction(auction, auctionJson) {
    if (auction.resolution === 'buyer') {
      const result = await settleAuctionPurchase(auction, { currency: '灵石' });
      if (!result.ok) {
        const defaulted = { ...auction, resolution: 'defaulted' };
        if (!await compareAndSetRedisJson(
          redis,
          'xiuxian:AuctionofficialTask',
          auctionJson,
          defaulted
        )) return;
        auction = defaulted;
        auctionJson = JSON.stringify(defaulted);
      }
    }

    if (!await compareAndDeleteRedisJson(
      redis,
      'xiuxian:AuctionofficialTask',
      auctionJson
    )) return;

    let msgArr;
    if (auction.resolution === 'buyer') {
      const player = await Read_player(auction.last_offer_player);
      msgArr = [
        `拍品：【${auction.thing.name}】`,
        '成交！',
        `最终价格：${auction.last_price}`,
        `得主：${player.名号}`,
      ];
    } else if (auction.resolution === 'npc') {
      msgArr = [
        `拍品：【${auction.thing.name}】`,
        '成交！',
        `最终价格：${auction.last_price}`,
        `得主：${auction.tianjiaoBidder || '神秘修士'}`,
      ];
    } else if (auction.resolution === 'defaulted') {
      msgArr = [
        `📦 拍品：【${auction.thing.name}】`,
        '竞拍者余额不足，交易取消',
      ];
    } else {
      msgArr = [
        `📦 拍品：【${auction.thing.name}】`,
        '流拍',
        '无人出价，已退回神秘人纳戒',
      ];
    }
    for (const groupId of auction.groupList || []) {
      await this.sendAuctionImg(groupId, msgArr);
    }
  }

  async processPlayerAuction() {
    const key = 'xiuxian:auction';
    let auctionJson = await redis.get(key);
    if (!auctionJson) return;
    let auction = JSON.parse(auctionJson);

    if (auction.status === 'reserving') {
      if (Date.now() - Number(auction.last_offer_price || 0) < RESERVATION_LEASE_MS) return;
      if (!await hasReservedAuctionItem(auction)) {
        await compareAndDeleteRedisJson(redis, key, auctionJson);
        return;
      }
      const activatedAt = Date.now();
      const active = {
        ...auction,
        status: 'active',
        last_offer_price: activatedAt,
        reservedAt: activatedAt,
      };
      if (await compareAndSetRedisJson(redis, key, auctionJson, active)) {
        await redis.set(`xiuxian:player:${auction.qq}:last_auction`, activatedAt);
      }
      return;
    }

    if (auction.status !== 'settling') {
      const endTime = Number(auction.last_offer_price) + this.set.Auction.interval * 60 * 1000;
      if (endTime > Date.now()) return;
      auction = createSettlingAuction(
        auction,
        auction.last_offer_player === 0 ? 'unsold' : 'buyer'
      );
      if (!await compareAndSetRedisJson(redis, key, auctionJson, auction)) return;
      auctionJson = JSON.stringify(auction);
    } else {
      if (Date.now() - Number(auction.settlingAt || 0) < SETTLEMENT_LEASE_MS) return;
      const resumed = { ...auction, settlingAt: Date.now() };
      if (!await compareAndSetRedisJson(redis, key, auctionJson, resumed)) return;
      auction = resumed;
      auctionJson = JSON.stringify(resumed);
    }

    if (auction.resolution === 'buyer') {
      const result = await settleAuctionPurchase(auction, {
        currency: '灵石',
        sellerId: auction.qq,
      });
      if (!result.ok) {
        const defaulted = { ...auction, resolution: 'defaulted' };
        if (!await compareAndSetRedisJson(redis, key, auctionJson, defaulted)) return;
        auction = defaulted;
        auctionJson = JSON.stringify(defaulted);
      }
    }

    if (auction.resolution === 'unsold' || auction.resolution === 'defaulted') {
      await refundAuctionItem(auction);
    }
    if (!await compareAndDeleteRedisJson(redis, key, auctionJson)) return;

    const groups = String(auction.group_id || '')
      .split('|')
      .map(id => id.trim())
      .filter(Boolean);
    const message = auction.resolution === 'buyer'
      ? `拍卖成交：${auction.thing.name}，最终价格${auction.last_price}灵石。`
      : auction.resolution === 'defaulted'
        ? `拍卖取消：竞拍者余额不足，${auction.thing.name}已退回卖家。`
        : `拍卖流拍：${auction.thing.name}已退回卖家。`;
    for (const groupId of groups) await this.pushInfo(groupId, true, message);
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
