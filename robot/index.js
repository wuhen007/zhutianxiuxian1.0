import fs from 'fs';
import path from 'path';
import { AppName } from '../app.config.js';
import { wrapPluginClass } from '../model/textToImage.js';
import { installScheduledSender } from '../model/scheduledSender.js';
import { installHashSpaceFix } from '../model/hashSpaceFix.js';

export const appsOut = async AppsName => {
  const firstName = `plugins/${AppName}`;
  const filepath = `./${firstName}/${AppsName}`;
  const name = [];
  const sum = [];
  const travel = (dir, callback) => {
    fs.readdirSync(dir).forEach(file => {
      if (file.search('.js') != -1) name.push(file.replace('.js', ''));
      let pathname = path.join(dir, file);
      if (fs.statSync(pathname).isDirectory()) {
        travel(pathname, callback);
      } else {
        callback(pathname);
      }
    });
  };
  travel(filepath, path => {
    if (path.endsWith('.js')) sum.push(path);
  });
  let apps = {};
  // 非 class 导出（工具函数、常量等）属于正常现象，累计后只输出一条汇总，避免刷屏
  const skipped = new Set();
  for (let item of sum) {
    let address = `..${item.replace(/\\/g, '/').replace(`${firstName}`, '')}`;
    let allExport = await import(address);
    let keys = Object.keys(allExport);
    keys.forEach(key => {
      if (allExport[key]?.prototype instanceof plugin) {
        if (apps.hasOwnProperty(key))
          logger.info(
            `Template detection:已经存在class ${key}同名导出\n    ${address}`
          );
        apps[key] = allExport[key];
      } else {
        skipped.add(key);
      }
    });
  }
  if (skipped.size)
    logger.debug(
      `Template detection: 已跳过 ${skipped.size} 个非 class 导出（辅助函数/常量，正常现象），注册插件类 ${Object.keys(apps).length} 个`
    );

  // 接入长文本自动转图片：给每个插件类套一层，处理器执行时给事件装 e.reply 拦截器
  let wrappedMethods = 0;
  for (const key of Object.keys(apps)) {
    wrappedMethods += wrapPluginClass(apps[key]);
  }
  if (wrappedMethods) {
    logger.info(`[文字转图片] 已接管 ${Object.keys(apps).length} 个插件类的 ${wrappedMethods} 个方法`);
  }

  // 定时任务的 Bot.pickGroup(id).sendMsg 改走官方主动消息（只对已配置群生效）
  installScheduledSender();

  // 玩家发 `# 修仙状态`（井号后带空格）或全角 `＃` 时也能命中指令
  await installHashSpaceFix();

  return apps;
};
