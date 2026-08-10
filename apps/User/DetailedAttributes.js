import { config, data, plugin, verc } from '../../api/api.js';
import {
  ForwardMsg,
  Read_equipment,
  Read_player,
  __PATH,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import { buildPlayerAttributeReport } from '../../model/playerAttributeReport.js';
import { readShouyuanDifficulty } from './shouyuanDifficulty.js';

export class DetailedAttributes extends plugin {
  constructor() {
    super({
      name: 'DetailedAttributes',
      dsc: '玩家全属性与加成来源审计',
      event: 'message',
      priority: 600,
      rule: [{ reg: '^#(详细属性|全属性)$', fnc: 'showDetailedAttributes' }],
    });
  }

  async showDetailedAttributes(e) {
    if (!verc({ e })) return false;
    let qq = e.user_id.toString().replace('qg_', '');
    qq = await channel(qq);
    if (!(await existplayer(qq))) return e.reply('请先创建修仙角色');

    const [player, equipment] = await Promise.all([
      Read_player(qq),
      Read_equipment(qq),
    ]);
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const report = buildPlayerAttributeReport({
      player,
      equipment,
      data,
      eraIndex: Number(xiuxianConfig.Era?.current?.index ?? 2),
      difficulty: readShouyuanDifficulty(`${__PATH.data_path}/位面.json`),
    });
    await ForwardMsg(e, report);
    return true;
  }
}

