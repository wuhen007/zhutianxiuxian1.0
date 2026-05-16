import plugin from '../../../../lib/plugins/plugin.js';
import common from '../../../../lib/common/common.js';
import config from '../../model/Config.js';
import {
  Add_najie_thing,
  Add_灵石,
  Add_源石,
  Read_player,
  sleep,
  get_auction_img
} from '../../model/xiuxian.js';
import { openAU } from '../Auction/Auction2.js';

/**
 * 定时任务 - 星阁内场拍卖（图片版 + NPC）
 */
export class AuctionofficialTask2 extends plugin {
  constructor() {
    super({
      name: 'AuctionofficialTask2',
      dsc: '星阁内场拍卖定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });

    this.set = config.getConfig('xiuxian', 'xiuxian');
    this.task = {
      cron: this.set.Auction2.Auction_task,
      name: 'AuctionofficialTask2',
      fnc: () => this.AuctionofficialTask2(),
    };

    // NPC 类型
    this.npcTypes = [
      { type: "谨慎", minBid: 1.05, maxBid: 1.15, probability: 0.4 },
      { type: "激进", minBid: 1.15, maxBid: 1.35, probability: 0.3 },
      { type: "豪爽", minBid: 1.25, maxBid: 1.5, probability: 0.2 },
      { type: "神秘", minBid: 1.1, maxBid: 1.8, probability: 0.1 }
    ];

    // NPC 名称
    this.npcNames = [
      "隐世高人", "仙门长老", "世家公子",
      "妖族大能", "魔道巨擘", "佛门高僧"
    ];

    // NPC 评论
    this.npcComments = {
      "谨慎": ["此物虽好，但价格已高", "再加一次，若不成便放弃"],
      "激进": ["此物我志在必得！", "再加！我看谁还敢争"],
      "豪爽": ["这点源石不算什么", "宝物有缘者得之"],
      "神秘": ["......", "此物与我有缘"]
    };
  }

  async AuctionofficialTask2() {
    const wupinStr = await redis.get('xiuxian:AuctionofficialTask2');

    /* ================= 未开拍 ================= */
    if (!wupinStr) {
      const nowDate = new Date();
      const todayDate = new Date(nowDate);
      const { openHour, closeHour } = this.set.Auction2;
      const todayTime = todayDate.setHours(0, 0, 0, 0);
      const openTime = todayTime + openHour * 60 * 60 * 1000;
      const nowTime = nowDate.getTime();
      const closeTime = todayTime + closeHour * 60 * 60 * 1000;

      if (nowTime < openTime || nowTime > closeTime) return;

      const auction = await openAU();

      const msgArr = [
        "📦 拍品：【" + auction.thing.name + "】x" + auction.amount,
        "当前最高价：0",
        "暂无出价者",
        "请在群内 #星阁内场出价 XXX 参与"
      ];

      for (const group_id of auction.groupList) {
        await this.sendAuctionImg(group_id, msgArr);
      }
      return;
    }

    /* ================= 正在拍卖 ================= */
    const wupin = JSON.parse(wupinStr);
    const group_ids = wupin.groupList;
    const interMinu = this.set.Auction2.interval;
    const nowTime = Date.now();

    let timeToEnd =
      wupin.last_offer_price + interMinu * 60 * 1000 - nowTime;

    /* ================= NPC 竞价 ================= */
    if (timeToEnd > 0 && wupin.last_offer_player > 0) {
      if (Math.random() < 0.3) {
        const npcBidResult = await this.npcBid(wupin);

        const npcMsgArr = [
          "📦 拍品：【" + wupin.thing.name + "】x" + wupin.amount,
          "当前最高价：" + npcBidResult.newPrice + " 源石",
          "出价者：神秘NPC",
          "💬 " + npcBidResult.comment
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, npcMsgArr);
        }

        wupin.last_price = npcBidResult.newPrice;
        wupin.last_offer_player = -1;
        wupin.last_offer_price = nowTime;

        await redis.set(
          'xiuxian:AuctionofficialTask2',
          JSON.stringify(wupin)
        );

        await sleep(2000 + Math.random() * 3000);
        timeToEnd =
          wupin.last_offer_price + interMinu * 60 * 1000 - nowTime;
      }
    }

    /* ================= 拍卖进行中 ================= */
    if (timeToEnd > 0) {
      const m = Math.floor(timeToEnd / 60000);
      const s = Math.floor((timeToEnd % 60000) / 1000);

      let bidder = "暂无";
      if (wupin.last_offer_player > 0) {
        const p = await Read_player(wupin.last_offer_player);
        bidder = p.名号;
      } else if (wupin.last_offer_player < 0) {
        bidder = "神秘NPC";
      }

      const msgArr = [
        "📦 拍品：【" + wupin.thing.name + "】x" + wupin.amount,
        "当前最高价：" + wupin.last_price + " 源石",
        "最高出价者：" + bidder,
        "剩余时间：" + m + "分" + s + "秒"
      ];

      for (const group_id of group_ids) {
        await this.sendAuctionImg(group_id, msgArr);
      }
    } else {
      /* ================= 拍卖结束 ================= */
      if (wupin.last_offer_player === 0) {
        const msgArr = [
          "📦 拍品：【" + wupin.thing.name + "】x" + wupin.amount,
          "流拍",
          "无人出价，已退回神秘人纳戒"
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, msgArr);
        }
      } else if (wupin.last_offer_player < 0) {
        const msgArr = [
          "📦 拍品：【" + wupin.thing.name + "】x" + wupin.amount,
          "成交！",
          "最终价格：" + wupin.last_price + " 源石",
          "得主：神秘NPC"
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, msgArr);
        }
      } else {
        await Add_源石(wupin.last_offer_player, -wupin.last_price);
        await Add_najie_thing(
          wupin.last_offer_player,
          wupin.thing.name,
          wupin.thing.class,
          wupin.amount,
          wupin.thing.pinji
        );

        const player = await Read_player(wupin.last_offer_player);

        const msgArr = [
          "📦 拍品：【" + wupin.thing.name + "】x" + wupin.amount,
          "成交！",
          "最终价格：" + wupin.last_price + " 源石",
          "得主：" + player.名号
        ];

        for (const group_id of group_ids) {
          await this.sendAuctionImg(group_id, msgArr);
        }
      }

      await redis.del('xiuxian:AuctionofficialTask2');
    }
  }

  /* ================= NPC 竞价 ================= */
  async npcBid(auction) {
    const npcName =
      this.npcNames[Math.floor(Math.random() * this.npcNames.length)];
    const npcType = this.selectNpcType();

    const newPrice = Math.ceil(
      auction.last_price *
        (npcType.minBid +
          Math.random() * (npcType.maxBid - npcType.minBid))
    );

    const comments = this.npcComments[npcType.type];
    const comment =
      comments[Math.floor(Math.random() * comments.length)];

    return {
      newPrice,
      comment: npcName + "：" + comment
    };
  }

  selectNpcType() {
    const r = Math.random();
    let cum = 0;
    for (const t of this.npcTypes) {
      cum += t.probability;
      if (r <= cum) return t;
    }
    return this.npcTypes[0];
  }

  /* ================= 图片发送 ================= */
  async sendAuctionImg(group_id, msgArr) {
    try {
      const simulatedEvent = {
        group_id,
        isGroup: true,
        sender: {
          user_id: Bot.uin,
          nickname: "星阁内场"
        }
      };

      const img = await get_auction_img(simulatedEvent, msgArr);
      await Bot.pickGroup(group_id).sendMsg(img);
    } catch (err) {
      console.error("拍卖图片发送失败:", err);
      await this.pushInfo(group_id, true, msgArr.join("\n"));
    }
  }

  async pushInfo(id, is_group, msg) {
    if (is_group) {
      await Bot.pickGroup(id).sendMsg(msg).catch(() => {});
    } else {
      await common.relpyPrivate(id, msg);
    }
  }
}