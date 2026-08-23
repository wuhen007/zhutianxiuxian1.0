import { plugin } from '../../api/api.js';
import {
  Read_player,
  zd_battle,
  get_fight_img,
  bigNumberTransform,
  sleep
} from '../../model/xiuxian.js';

// 木桩血量：极大，保证任意档位玩家 50 回合内都打不穿（显示恒为同一数值）。
const DUMMY_HP = 1e30;
// 单张战斗图片承载的日志条数（与 BOSS4 的 sendFightImages 保持一致）。
const PAGE_SIZE = 20;
// 演练回合上限。
const ROUND_CAP = 50;

/**
 * #打桩*n —— 无限血条木桩，用于测试自身 DPS。
 *   - n 为演练回合数（玩家有效攻击次数），上限 50，缺省 10。
 *   - 战斗日志通过 zd_battle 图片发出，过长自动分多张。
 */
export class Dazhuang extends plugin {
  constructor() {
    super({
      name: 'Dazhuang',
      dsc: '打桩演练 · DPS 测试',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#打桩(?:\\s*\\*(\\d+))?$',
          fnc: 'dazhuang'
        }
      ]
    });
  }

  async dazhuang(e) {
    const usr_qq = e.user_id;
    const player = await Read_player(usr_qq);
    if (!player) {
      e.reply('请先创建角色再进行打桩演练。');
      return true;
    }

    // 解析回合数 n
    const match = e.msg.match(/^#打桩(?:\s*\*(\d+))?$/);
    let rounds = match && match[1] ? parseInt(match[1], 10) : 10;
    if (!Number.isFinite(rounds) || rounds < 1) rounds = 1;
    if (rounds > ROUND_CAP) rounds = ROUND_CAP;

    // 玩家（A 方）战斗快照——与 BOSS4 等保持一致的结构化构造。
    const A_player = {
      ...player,
      名号: player.名号,
      攻击: player.攻击,
      防御: player.防御,
      当前血量: player.当前血量,
      血量上限: player.血量上限,
      暴击率: player.暴击率,
      暴击伤害: player.暴击伤害,
      灵根: player.灵根,
      法球倍率: player.灵根?.法球倍率 || 1,
      学习的功法: player.学习的功法 || []
    };

    // 木桩（B 方）：克隆玩家存档保证结构完整，再抹除一切进攻/特殊能力，成为纯木桩。
    const B_player = JSON.parse(JSON.stringify(player));
    B_player.名号 = '木桩';
    B_player.id = 'qg_dummy';
    B_player.攻击 = 0;
    B_player.防御 = 0;
    B_player.当前血量 = DUMMY_HP;
    B_player.血量上限 = DUMMY_HP;
    B_player.法球倍率 = 1;
    B_player.暴击率 = 0;
    B_player.暴击伤害 = 0;
    B_player.闪避率 = 0;
    B_player.吸血率 = 0;
    B_player.穿透 = 0;
    B_player.速度 = 1;
    B_player.学习的功法 = [];
    B_player.分身 = [];
    B_player.仙宠 = [];
    B_player.当前先天至宝 = null;
    B_player.装备 = [];
    B_player.骑士卡片 = [];
    B_player.诸天镜系统 = null;
    B_player.灵根 = { name: '普通灵根', type: null, 法球倍率: 1 };

    // 开打：传入 maxRound 让引擎在玩家攻击 n 次后收尾。
    const result = await zd_battle(A_player, B_player, { maxRound: rounds });

    const totalDamage = result?.totalDamageTaken || 0;
    const actualAttacks = result?.playerAttacks || rounds;
    const dps = actualAttacks > 0 ? Math.floor(totalDamage / actualAttacks) : 0;

    const header = [
      `【打桩演练 · DPS 测试】`,
      `演练者：${player.名号}`,
      `演练回合：${actualAttacks}（上限${ROUND_CAP}）`,
      `累计总伤害：${bigNumberTransform(totalDamage)}`,
      `平均单回合 DPS：${bigNumberTransform(dps)}`,
      `木桩：无限血条，气血恒久远`,
      `━━━ 战斗日志 ━━━`
    ];

    // 把木桩剩余血量显示统一替换成 ∞（与"无限血条"语义一致）。
    const dummyHpText = bigNumberTransform(DUMMY_HP);
    const battleLog = Array.isArray(result?.msg)
      ? result.msg.map((m) => String(m ?? '').split(dummyHpText).join('∞'))
      : [];

    const allMessages = [...header, ...battleLog];

    // 逐张渲染战斗图片（日志过长自动分多张）。
    for (let start = 0; start < allMessages.length; start += PAGE_SIZE) {
      const image = await get_fight_img(e, allMessages.slice(start, start + PAGE_SIZE));
      if (image) await e.reply(image);
      if (start + PAGE_SIZE < allMessages.length) await sleep(250);
    }

    return true;
  }
}
