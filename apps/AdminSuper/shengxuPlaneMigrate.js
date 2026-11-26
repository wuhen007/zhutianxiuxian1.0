import { plugin } from '../../api/api.js';
import { alluser } from '../../model/duanzaofu.js';
import config from '../../model/Config.js';
import { Read_player, Write_player,
  isXiuxianAdmin} from '../../model/xiuxian.js';
import { migrateShengxuPlayer } from '../../model/shengxuPlaneMigration.js';

/**
 * 圣墟位面三级拆分 · 旧存档迁移指令
 * 触发指令：#同步圣墟位面
 * 说明：
 *   - 旧版圣墟位面 power_place === 7（坐标字段 '圣墟位面坐标'）。
 *   - 拆分后：小阴间=4 / 大阴间=5 / 阳间=7。
 *   - 遍历全体玩家，将 power_place === 7 的存档按坐标 region 迁移到
 *     小阴间(4) 或 阳间(7)，坐标数值保留，字段名同步。
 */
export class shengxuPlaneMigrate extends plugin {
  constructor() {
    super({
      name: 'shengxuPlaneMigrate',
      dsc: '圣墟位面三级拆分旧存档迁移',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#同步圣墟位面$', fnc: 'syncPlane' }
      ]
    });
  }

  async syncPlane(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!isXiuxianAdmin(e)) return false;

    e.reply('开始迁移圣墟位面旧存档（小阴间/阳间）…');
    const players = await alluser();
    let migrated = 0;
    let toXiaoyinjian = 0;
    let toYangjian = 0;

    for (const qq of players) {
      const player = await Read_player(qq);
      if (!player) continue;
      if (!migrateShengxuPlayer(player)) continue;
      await Write_player(qq, player);
      migrated++;
      if (Number(player.power_place) === 4) toXiaoyinjian++;
      else if (Number(player.power_place) === 7) toYangjian++;
    }

    e.reply(
      `圣墟位面迁移完成：共迁移 ${migrated} 名玩家` +
      `（→小阴间 ${toXiaoyinjian} 人 / →阳间 ${toYangjian} 人）`
    );
    return;
  }
}
