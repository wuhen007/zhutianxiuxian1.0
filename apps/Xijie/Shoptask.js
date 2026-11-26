import { plugin, config, data } from '../../api/api.js';
import { Write_shop, Read_shop } from '../../model/xiuxian.js';
import { refreshXijieShop } from '../../model/xijieAtlas.js';
import { runTaskOnce } from '../../utils/taskGuard.js';

export class Shoptask extends plugin {
  constructor() {
    super({
      name: 'Shoptask',
      dsc: '定时任务',
      event: 'message',
      rule: [],
    });
    this.set = config.getConfig('task', 'task');
    this.task = {
      cron: this.set.shop,
      name: 'Shoptask',
      fnc: () => runTaskOnce('Shoptask', () => this.Shoptask()),
    };
  }
  async Shoptask() {
    let shop = [];
    try {
      shop = await Read_shop();
    } catch {
      // The catalog below is also the recovery source for a missing or malformed runtime file.
    }
    await Write_shop(refreshXijieShop(shop, data.shop_list));
  }
}
