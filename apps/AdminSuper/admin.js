import { plugin, verc, config } from '../../api/api.js';
import { AppName } from '../../app.config.js';
import { exec } from 'child_process';
import { BackUp } from '../User/BackUp.js';
export class admin extends plugin {
  constructor() {
    super({
      name: '管理|更新插件',
      dsc: '管理和更新代码',
      event: 'message',
      priority: 400,
      rule: [
        {
          reg: '^#修仙(插件)?(强制)?更新',
          fnc: 'checkout',
        },
      ],
    });
  }
  async checkout(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) return false;
    if (!verc({ e })) return false;
    const isForce = e.msg.includes('强制');
    if (isForce) {
      await e.reply('为避免硬重置覆盖存档和本地源码，聊天内强制更新已禁用。请使用普通的 #修仙更新。');
      return false;
    }
    if (!await new BackUp().saveBackUp(e)) {
      await e.reply('自动备份失败，更新已中止。');
      return false;
    }
    const command = 'git pull --ff-only';
    this.e.reply('正在执行更新操作，请稍等');
    exec(
      command,
      { cwd: `${process.cwd()}/plugins/${AppName}/` },
      function (error, stdout, stderr) {
        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
          e.reply('目前已经是最新版zhutianxiuxian1.0了~');
          return false;
        }
        if (error) {
          e.reply(
            'zhutianxiuxian1.0更新失败！\nError code: ' +
              error.code +
              '\n' +
              error.stack +
              '\n 请稍后重试。'
          );
          return false;
        }
        e.reply('更新成功，Yunzai 将在 2 秒后自动重启。');
        setTimeout(() => process.exit(0), 2000);
      }
    );
    return false;
  }
}
