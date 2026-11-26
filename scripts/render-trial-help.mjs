import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import template from 'art-template';
import { getTrialHelpData, TRIAL_HELP_THEMES } from '../model/trialUniverseHelp.js';

// 使用宿主已有的 Puppeteer；不启动机器人、不连接 Redis、不读取玩家存档。
const root = fileURLToPath(new URL('../', import.meta.url));
const hostRequire = createRequire(new URL('../../../package.json', import.meta.url));
const puppeteer = hostRequire('puppeteer');
const output = path.resolve(process.argv[2] || path.join(root, 'temp/trial-help-preview'));
fs.mkdirSync(output, { recursive: true });
const browserFile = [process.env.TRIAL_HELP_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(file => file && fs.existsSync(file));
const browser = await puppeteer.launch({ headless: true, ...(browserFile ? { executablePath: browserFile } : {}) });
const report = [];
try {
  for (const theme of TRIAL_HELP_THEMES) {
    const data = getTrialHelpData(theme.index);
    const source = fs.readFileSync(path.join(root, `resources/html/trial-help/${theme.id}.html`), 'utf8');
    const html = template.render(source, { ...data, pluResPath: pathToFileURL(path.join(root, 'resources/')).href });
    const htmlFile = path.join(output, `${theme.index}-${theme.id}.html`);
    const imageFile = path.join(output, `${theme.index}-${theme.id}.png`);
    fs.writeFileSync(htmlFile, html);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const container = document.querySelector('#container');
      const bounds = container.getBoundingClientRect();
      const overflow = [...container.querySelectorAll('*')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1
          || (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
          || (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1));
      }).map(el => ({ element: `${el.tagName}.${el.className}`, text: el.textContent.trim().slice(0, 32),
        client: [el.clientWidth, el.clientHeight], scroll: [el.scrollWidth, el.scrollHeight] }));
      return { width: bounds.width, height: bounds.height, overflow,
        fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
        text: container.innerText };
    });
    const missing = data.groups.flatMap(group => group.items).map(item => item.command)
      .filter(command => !layout.text.includes(command));
    delete layout.text;
    await (await page.$('#container')).screenshot({ path: imageFile });
    report.push({ theme: theme.name, htmlFile, imageFile, ...layout, errors, missing });
    await page.close();
  }
  const overviewFile = path.join(output, 'overview.html');
  fs.writeFileSync(overviewFile, `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#e3e6e5;font:22px 'Microsoft YaHei',sans-serif;width:1632px}
    main{display:grid;grid-template-columns:repeat(3,512px);gap:24px}h2{font-size:23px;margin:0 0 14px}img{display:block;width:512px;height:auto}
    </style></head><body><main>${report.map((item, i) => `<section><h2>${i + 1} · ${item.theme}</h2><img src="${pathToFileURL(item.imageFile).href}" alt="${item.theme}"></section>`).join('')}</main></body></html>`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1632, height: 1000 });
  await page.goto(pathToFileURL(overviewFile).href, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
  fs.writeFileSync(path.join(output, 'render-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.some(item => item.errors.length || item.overflow.length || item.missing.length
    || item.fonts.some(font => font.status !== 'loaded'))) process.exitCode = 1;
} finally {
  await browser.close();
}
