/**
 * 修仙新手引导（两步准备）
 *
 * 用法：
 *   修仙游玩说明 / #修仙游玩说明
 *   （旧别名 #修仙引导、#开始修仙、#怎么玩修仙 仍可用）
 *
 * 典型用法是在 QQ 开放平台的「自定义菜单 / 指令面板」里配一个「发送指令」，
 * 指令填 `修仙游玩说明`，玩家点一下就能收到「文字 + 引导图」。
 *
 * 为什么要有这个引导：
 *   修仙依赖官方 Bot 的全量消息（否则拿不到 msg_id，被动回复也配不上），
 *   而全量消息只能群主在群设置里开，普通玩家开不了；
 *   开完还得作者给玩家开通游戏权限。这两步不写清楚，玩家会一直问「怎么玩不了」。
 *
 * 图片走 puppeteer 渲染 resources/html/guide/guide.html，
 * 首次渲染后缓存到 resources/data/guide.png，模板改动会自动失效重渲染。
 */
import fs from 'node:fs';
import path from 'node:path';
import { plugin } from '../../api/api.js';
import { __dirname as PluginDir } from '../../app.config.js';

const TPL_FILE = path.join(PluginDir, 'resources/html/guide/guide.html');
const CACHE_FILE = path.join(PluginDir, 'resources/data/guide.png');
const RENDER_NAME = 'xxhs-guide';

/**
 * 纯文字版。尽量控制在 100 字以内：
 * 超过 100 字会被长文本转图，降级发送时就变成「两张图」反而更难读。
 * 操作路径由作者提供：① 获取全部消息 ② 机器人主动发言。开通已自动化，不再需要联系作者。
 */
export const GUIDE_TEXT = [
  '【踏入仙途·两步准备】',
  '① 群主：点头像 → 右上角设置 → 开启「获取全部消息」',
  '② 群主：同页打开「机器人主动发言」',
  '',
  '发 #踏入仙途 · 仅供娱乐',
].join('\n');

/** 渲染器按需加载，避免没用到的场景也把 Chromium 拖起来 */
let rendererModule = null;

async function getRenderer() {
  if (!rendererModule) {
    rendererModule = import('../../../../lib/puppeteer/puppeteer.js').then(m => m.default);
  }
  try {
    return await rendererModule;
  } catch (err) {
    rendererModule = null;
    throw err;
  }
}

/**
 * 生成引导图。模板没改动就直接读缓存，避免每次触发都跑一次 Chromium。
 * @returns {Promise<Buffer|null>} 失败返回 null，由调用方降级成纯文字
 */
export async function renderGuide() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const tplTime = fs.statSync(TPL_FILE).mtimeMs;
      const cacheTime = fs.statSync(CACHE_FILE).mtimeMs;
      if (cacheTime > tplTime) return fs.readFileSync(CACHE_FILE);
    }
  } catch {
    /* 读缓存失败就当没有，继续渲染 */
  }

  try {
    const renderer = await getRenderer();
    const buffer = await renderer.render(RENDER_NAME, {
      tplFile: TPL_FILE,
      saveId: 'xxhs-guide',
      imgType: 'png',
    });
    if (buffer && Buffer.isBuffer(buffer) && buffer.length > 512) {
      try {
        fs.writeFileSync(CACHE_FILE, buffer);
      } catch {
        /* 缓存写不进去不影响本次发送 */
      }
      return buffer;
    }
  } catch (err) {
    logger?.warn?.(`[修仙引导] 图片渲染失败：${err?.message ?? err}`);
  }
  return null;
}

export class XiuxianGuide extends plugin {
  constructor() {
    super({
      name: '修仙新手引导',
      dsc: '两步准备引导：开启全量消息 + 打开主动发言',
      event: 'message',
      priority: 550,
      rule: [
        // 主入口：# 可带可不带，后台菜单里填「修仙游玩说明」或「#修仙游玩说明」都能触发
        { reg: '^[#/]?修仙游玩说明$', fnc: 'guide' },
        // 旧别名保留，避免已经配好的菜单/指令面板失效
        { reg: '^#修仙引导$', fnc: 'guide' },
        { reg: '^#开始修仙$', fnc: 'guide' },
        { reg: '^#怎么玩修仙$', fnc: 'guide' },
      ],
    });
  }

  async guide(e) {
    const buffer = await renderGuide();

    // 图没渲染出来（Chromium 没就绪等）：只发文字，别让玩家什么都收不到
    if (!buffer) {
      return e.reply(
        [
          GUIDE_TEXT,
          '',
          '详细操作：',
          '① 群主：点机器人头像 → 右上角「设置」→ 开启「获取全部消息」',
          '② 群主：在同一设置页打开「机器人主动发言」',
          '本服务仅供娱乐',
        ].join('\n'),
      );
    }

    // 文字在前、图片在后：先看到结论，再按图操作
    return e.reply([GUIDE_TEXT, segment.image(buffer)]);
  }
}
