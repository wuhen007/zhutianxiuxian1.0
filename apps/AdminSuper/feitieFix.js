import { plugin } from '../../api/api.js';
import { alluser } from '../../model/duanzaofu.js';
import config from '../../model/Config.js';
import data from '../../model/XiuxianData.js';
import {
  isNotNull,
  Read_equipment,
  Write_equipment,
  Read_najie,
  Write_najie,
  isXiuxianAdmin} from '../../model/xiuxian.js';

/**
 * 全体玩家初始帝兵"废铁"数值同步修复
 * 触发指令:#同步废铁数值
 * 说明:
 *   - 遍历全体玩家,把【穿戴帝兵槽位】与【纳戒装备列表】中
 *     未铸造/未赋名的初始"废铁"(name=='废铁' && type=='帝兵' && 无 author_name)
 *     的 atk/def/HP 同步为数据表(帝兵列表.json)当前值。
 *   - 当前数据表 atk=501 / def=0 / HP=0,跨过 >499 阈值后被底层判定为
 *     数值装备(固定加算),不再被当作百分比倍率(原 def=100 会导致防御 ×101)。
 *   - 已铸造/已赋名(带 author_name)的帝兵不受影响。
 */
export class feitieFix extends plugin {
  constructor() {
    super({
      name: 'feitieFix',
      dsc: '全体玩家初始帝兵废铁数值同步',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#同步废铁数值$', fnc: 'syncFeitie' }
      ]
    });
  }

  /** 从数据表读取废铁当前数值,表里找不到时回退到 501/0/0 */
  getTargetStats() {
    const feitie = data.dibing_list.find(item => item.name === '废铁');
    return feitie
      ? { atk: Number(feitie.atk) || 0, def: Number(feitie.def) || 0, HP: Number(feitie.HP) || 0 }
      : { atk: 501, def: 0, HP: 0 };
  }

  /** 是否为未铸造的初始废铁 */
  isStarterFeiTie(item) {
    return Boolean(item) && item.name === '废铁' && item.type === '帝兵' && !isNotNull(item.author_name);
  }

  async syncFeitie(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!isXiuxianAdmin(e)) return false;

    e.reply('开始同步全体玩家废铁数值…');
    const target = this.getTargetStats();
    const players = await alluser();
    let fixedPlayers = 0;
    let fixedEquipped = 0;
    let fixedNajie = 0;

    for (const qq of players) {
      // —— 穿戴帝兵槽位 ——
      const equipment = await Read_equipment(qq);
      let equippedChanged = false;
      if (this.isStarterFeiTie(equipment?.帝兵)) {
        Object.assign(equipment.帝兵, target);
        equippedChanged = true;
        fixedEquipped++;
      }
      if (equippedChanged) {
        await Write_equipment(qq, equipment);
        fixedPlayers++;
      }

      // —— 纳戒装备列表 ——
      const najie = await Read_najie(qq);
      let najieChanged = false;
      for (const item of najie?.装备 || []) {
        if (this.isStarterFeiTie(item)) {
          Object.assign(item, target);
          najieChanged = true;
          fixedNajie++;
        }
      }
      if (najieChanged) await Write_najie(qq, najie);
    }

    e.reply(
      `废铁数值同步完成:覆盖 ${fixedPlayers} 名玩家` +
      `(穿戴 ${fixedEquipped} 件 / 纳戒 ${fixedNajie} 件),` +
      `同步目标 atk=${target.atk} def=${target.def} HP=${target.HP}`
    );
    return;
  }
}
