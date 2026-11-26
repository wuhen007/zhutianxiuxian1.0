import { config, data, plugin, puppeteer, Show, verc } from '../../api/api.js';
import {
  ForwardMsg,
  Read_equipment,
  Read_player,
  __PATH,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import {
  buildPlayerAttributeReport,
  buildPlayerAttributeView,
} from '../../model/playerAttributeReport.js';
import { readShouyuanDifficulty } from './shouyuanDifficulty.js';

const ATTRIBUTE_THEMES = Object.freeze({
  '1': Object.freeze({ name: '星海天阙', kicker: 'CELESTIAL ATTRIBUTE ARCHIVE · 01' }),
  '2': Object.freeze({ name: '万界天碑', kicker: 'THE MYRIAD REALMS STELE · 02' }),
  '3': Object.freeze({ name: '天机观测台', kicker: 'HEAVENLY OBSERVATORY · 03' }),
});

export class DetailedAttributes extends plugin {
  constructor() {
    super({
      name: 'DetailedAttributes',
      dsc: '玩家全属性与加成来源审计',
      event: 'message',
      priority: 600,
      rule: [{ reg: '^#(详细属性|全属性)(?:样式)?\\s*[123]?$', fnc: 'showDetailedAttributes' }],
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
    const difficulty = readShouyuanDifficulty(`${__PATH.data_path}/位面.json`);
    const theme = e.msg.match(/[123]\s*$/)?.[0]?.trim() || '1';
    const reportOptions = {
      player,
      equipment,
      data,
      eraIndex: Number(xiuxianConfig.Era?.current?.index ?? 2),
      difficulty,
    };
    const view = buildPlayerAttributeView(reportOptions);
    const renderData = await new Show(e).get_detailedAttributesData({
      theme,
      themeMeta: ATTRIBUTE_THEMES[theme],
      view,
    });

    try {
      const image = await puppeteer.screenshot(`detailed_attributes_${theme}`, renderData);
      if (image) {
        await e.reply(image);
        return true;
      }
    } catch (error) {
      console.error(`[详细属性] 样式${theme}渲染失败，回退文字报告`, error);
    }

    await ForwardMsg(e, buildPlayerAttributeReport(reportOptions));
    return true;
  }
}
