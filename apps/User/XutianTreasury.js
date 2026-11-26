import { plugin, verc } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
} from '../../model/xiuxian.js';
import {
  claimInnateTreasure,
  createInnateTreasure,
  readInnateTreasureState,
} from '../../model/innateTreasure.js';
import {
  XUTIAN_MASTER_INHERITANCE_CHANCE,
  XUTIAN_TREASURY_REWARDS,
  pickXutianTreasuryReward,
} from '../../model/xutianTreasury.js';

export class XutianTreasury extends plugin {
  constructor() {
    super({
      name: '虚天宝库',
      dsc: '虚天神钥、虚天之主传承与虚天舟',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#虚天宝库$', fnc: 'showTreasury' },
        { reg: '^#开启虚天宝库$', fnc: 'openTreasury' },
        { reg: '^#参悟虚天之主传承$', fnc: 'learnInheritance' },
      ],
    });
  }

  async context(e) {
    if (!verc({ e })) return null;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async withLock(qq, e, callback) {
    const key = `xutian:treasury:${qq}:lock`;
    const token = `${Date.now()}:${Math.random()}`;
    if (!await redis.set(key, token, { EX: 15, NX: true })) return e.reply('虚天宝库正在响应你的上一道神念，请稍候。');
    try {
      return await callback();
    } finally {
      if (await redis.get(key) === token) await redis.del(key);
    }
  }

  async showTreasury(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const keys = Number(await exist_najie_thing(ctx.qq, '虚天神钥', '道具')) || 0;
    const skills = XUTIAN_TREASURY_REWARDS.filter(reward => reward.class === '功法').map(reward => reward.name);
    return e.reply([
      '【虚天宝库】',
      `虚天神钥：${keys}枚`,
      '每枚神钥可以开启一次宝库，所得不会落空。',
      `元神传承：${skills.join('、')}`,
      '心神宝药：定神丹、太虚养神丹、七窍养神丹、太虚拓识丹',
      '悟道宝药：虚天悟道丹',
      `隐秘传承：虚天之主传承（${(XUTIAN_MASTER_INHERITANCE_CHANCE * 100).toFixed(1)}%）`,
      '',
      '发送 #开启虚天宝库',
    ].join('\n'));
  }

  async openTreasury(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return this.withLock(ctx.qq, e, async () => {
      const keys = Number(await exist_najie_thing(ctx.qq, '虚天神钥', '道具')) || 0;
      if (keys < 1) return e.reply('你没有【虚天神钥】。精神位面最深层的守关残念可能持有神钥。');
      const reward = pickXutianTreasuryReward();
      await Add_najie_thing(ctx.qq, '虚天神钥', '道具', -1);
      await Add_najie_thing(ctx.qq, reward.name, reward.class, reward.amount);
      return e.reply([
        '【虚天宝库·洞开】',
        '神钥化作一束清光，尘封宝库裂开一道缝隙。',
        `获得：${reward.name} ×${reward.amount}`,
        reward.name === '虚天之主传承'
          ? '一尊不可直视的虚影从宝库深处醒来。发送 #参悟虚天之主传承。'
          : `剩余虚天神钥：${keys - 1}`,
      ].join('\n'));
    });
  }

  async learnInheritance(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return this.withLock(ctx.qq, e, async () => {
      if (ctx.player.虚天之主传承) return e.reply('你已经承接虚天之主的完整传承。');
      const count = Number(await exist_najie_thing(ctx.qq, '虚天之主传承', '道具')) || 0;
      if (count < 1) return e.reply('你尚未得到【虚天之主传承】。');

      ctx.player.虚天之主传承 = true;
      await Add_najie_thing(ctx.qq, '虚天之主传承', '道具', -1);

      const claim = claimInnateTreasure('虚天舟', ctx.qq);
      let shipLine;
      if (claim.ok) {
        const najie = await Read_najie(ctx.qq);
        najie.装备 ||= [];
        najie.装备.push(createInnateTreasure('虚天舟', ctx.qq));
        await Write_najie(ctx.qq, najie);
        shipLine = '唯一先天至宝【虚天舟】横渡虚空而来，正式认你为主。';
      } else {
        const owner = readInnateTreasureState().owners?.虚天舟?.ownerId;
        shipLine = String(owner) === String(ctx.qq)
          ? '虚天舟已认你为主，可发送 #执掌先天至宝 虚天舟，令其归入独立至宝位。'
          : '虚天舟已有主人，但劫光令与养神丹配方仍已完整烙入你的识海。';
      }

      await Write_player(ctx.qq, ctx.player);
      return e.reply([
        '【虚天之主·传承认主】',
        '你看见一叶扁舟行过诸天裂隙，虚实万界皆在舟后化作流光。',
        '已解锁：劫光令合成',
        '已解锁：定神丹、太虚养神丹炼制',
        '已解锁：虚天舟小世界仙宠养神炼丹',
        shipLine,
      ].join('\n'));
    });
  }
}
