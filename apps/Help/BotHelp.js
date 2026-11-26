import { plugin, puppeteer, verc } from '../../api/api.js';
import Help from '../../model/help.js';
import Help2 from '../../model/shituhelp.js';
import Help3 from '../../model/zhutianhelp.js';
import ActivityHelp from '../../model/huodonghelp.js';
import { createHash } from 'node:crypto';
import { replyOfficialButtons, isOfficialMessageEvent } from '../../model/officialMessage.js';

// 官方 keyboard 上限 5 行 × 5 列
const HELP_BUTTONS = [
  [{ text: '修仙签到', command: '#修仙签到' }, { text: '修仙状态', command: '#修仙状态' }, { text: '基础帮助', command: '#基础帮助' }],
  [{ text: '职业帮助', command: '#职业帮助' }, { text: '灵根帮助', command: '#灵根帮助' }, { text: '活动帮助', command: '#活动帮助' }],
];

const HELP_TEMPLATE = 'celestial-codex';
let helpData = {
  md5: '',
  img: '',
};
export class BotHelp extends plugin {
  constructor() {
    super({
      name: 'BotHelp',
      dsc: '修仙帮助',
      event: 'message',
      priority: 400,
      rule: [
        {
          reg: '^.*修仙帮助.*',
          fnc: 'Xiuxianhelp',
        },
                {
          reg: '^.*职业帮助.*',
          fnc: 'zhiyehelp',
        },
          {
          reg: '^.*(诸天帮助|诸天镜帮助).*',
          fnc: 'zhutianhelp',
        },
                  {
          reg: '^.*灵根帮助.*',
          fnc: 'linggenhelp',
        },
                  {
          reg: '^.*基础帮助.*',
          fnc: 'jichuhelp',
        },
          {
          reg: '^.*小世界帮助.*',
          fnc: 'xiaoshijiehelp',
        },
        {
          reg: '^.*修仙管理.*',
          fnc: 'adminsuper',
        },
        {
          reg: '^.*宗门管理.*',
          fnc: 'AssociationAdmin',
        },
        {
          reg: '^.*修仙扩展.*',
          fnc: 'Xiuxianhelpcopy',
        },
            {
          reg: '^.*三周目帮助.*',
          fnc: 'Xiuxianhelpcopy2',
        },
        {
          reg: '^#师徒帮助$',
          fnc: 'shituhelp',
        },
        {
          reg: '^#周年庆帮助$',
          fnc: 'znq',
        },
        {
          reg: '^#星海之缘活动$',
          fnc: 'xinghai',
        },
        {
          reg: '^#活动帮助$',
          fnc: 'activityHelp',
        },
      ],
    });
  }
  async znq(e) {
    let data = await Help.get_zhounian(e);

    await this.sendHelp(e, data);
  }
  async xinghai(e) {
    let data = await Help.get_xinghai(e);

    await this.sendHelp(e, data);
  }
  async activityHelp(e) {
    let data = await ActivityHelp.huodonghelp(e);
    await this.sendHelp(e, data);
  }

  async Xiuxianhelpcopy(e) {
    if (!verc({ e })) return false;
    let data = await Help.gethelpcopy(e);
    if (!data) return false;
    await this.sendHelp(e, data);
  }
    async Xiuxianhelpcopy2(e) {
    if (!verc({ e })) return false;
    let data = await Help.gethelpcopy2(e);
    if (!data) return false;
    await this.sendHelp(e, data);
  }
  async Xiuxianhelp(e) {

    let data = await Help.get(e);

    await this.sendHelp(e, data);
  }
async zhutianhelp(e) {

    let data = await Help3.zhutianhelp(e);

    await this.sendHelp(e, data);
  }

async xiaoshijiehelp(e) {
    let data = await Help.xiaoshijiehelp(e);
    await this.sendHelp(e, data);
  }
  async jichuhelp(e) {
    let data = await Help.jichuhelp(e);
    await this.sendHelp(e, data);
  }
  async linggenhelp(e) {
    let data = await Help.linggenhelp(e);
    await this.sendHelp(e, data);
  }  
  async zhiyehelp(e) {

    let data = await Help.zhiyehelp(e);

    await this.sendHelp(e, data);
  }
  async adminsuper(e) {
    if (!verc({ e })) return false;
    let data = await Help.setup(e);
    if (!data) return false;
    await this.sendHelp(e, data);
  }

  async AssociationAdmin(e) {
    if (!verc({ e })) return false;
    let data = await Help.Association(e);
    if (!data) return false;
    await this.sendHelp(e, data);
  }

  async shituhelp(e) {
    if (!verc({ e })) return false;
    let data = await Help2.shituhelp(e);
    if (!data) return false;
    await this.sendHelp(e, data);
  }


  /**
   * 图片保持原来的 HTML 渲染结果（主帮助是 2 张图），后面再跟一条
   * 「请选择：」+ 快捷按钮的 markdown 消息 —— 与 #修仙签到 的观感一致。
   * 非官方出口只发图，不追加按钮段（协议号不认 keyboard）。
   */
  async sendHelp(e, data) {
    const img = await this.cache(data);
    await e.reply(img);
    if (isOfficialMessageEvent(e)) {
      return replyOfficialButtons(e, { buttons: HELP_BUTTONS });
    }
    return true;
  }

  async cache(data) {
    data.tplFile = `./plugins/zhutianxiuxian1.0/resources/html/help-variants/${HELP_TEMPLATE}.html`;
    const tmp = createHash('md5').update(JSON.stringify(data), 'utf8').digest('hex');
    if (helpData.md5 == tmp) return helpData.img;
    helpData.img = await puppeteer.screenshots('help', data);
    helpData.md5 = tmp;
    return helpData.img;
  }
}
