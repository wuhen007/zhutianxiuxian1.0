import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plugin, puppeteer, verc } from '../../api/api.js';
import { channel, existplayer, Read_player, Write_player, __PATH } from '../../model/xiuxian.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { withLingshiMarket } from '../../model/lingshiMarketStore.js';
import { buildMarketPanel, getMarketPortfolio, runMarketCommand } from '../../model/lingshiMarket.js';

const template = fileURLToPath(new URL('../../resources/html/lingshi_market/lingshi_market.html', import.meta.url));

export class LingshiMarket extends plugin {
  constructor() {
    super({
      name: '万界灵市', dsc: '灵石股票、NPC交易、风声与操盘骗局', event: 'message', priority: 590,
      rule: [{ reg: '^#(?:灵市(?:帮助|人物|交谈|打听|查账|追问|消息|排行榜|收益榜|借款|还款|债务)?|股市|股票详情|股票走势|买入|卖出|我的股票)(?:\\s.*)?$', fnc: 'market' }],
    });
    this.task = {
      cron: '0 */10 * * * *', name: '万界灵市行情与NPC交易',
      fnc: () => withLingshiMarket(() => true, { create: false }).catch(error =>
        console.error('[万界灵市] 行情推进失败：', error)),
    };
  }

  async market(e) {
    if (!e.isGroup) return e.reply('万界灵市请在群聊中游玩。');
    if (!verc({ e })) return false;
    const id = String(await channel(String(e.user_id).replace(/^qg_/, '')));
    if (!await existplayer(id)) return e.reply('请先创建修仙角色，再来万界灵市开户。');
    let response;
    try {
      response = await withLingshiMarket(async market => {
        if (/^#灵市(?:排行榜|收益榜)\s*$/.test(e.msg)) return this.ranking(market, /收益榜/.test(e.msg));
        return withPlayerMutationLock(id, async () => {
          const player = await Read_player(id);
          const result = runMarketCommand(player, market, e.msg, {
            now: Date.now(),
            requestId: e.message_id || e.msg_id ? `${e.self_id || ''}:${e.group_id}:${e.message_id || e.msg_id}` : '',
          });
          if (result.changed) {
            player.灵市 = result.account;
            if (result.balance !== undefined) player.灵石 = result.balance;
            await Write_player(id, player, { trackDailyTask: false });
          }
          return result.panel
            ? { ...result, panelData: buildMarketPanel(market, player, { kind: result.panel, stockId: result.stockId, notice: result.notice }) }
            : result;
        });
      });
    } catch (error) {
      console.error('[万界灵市] 结算失败：', error);
      return e.reply('灵市本次结算未完成，请稍后重试；若持续出现，请管理员检查灵市及玩家存档与运行日志。');
    }
    if (response.panelData) {
      try {
        const image = await puppeteer.screenshot('lingshi_market', {
          tplFile: template, panel: response.panelData,
          saveId: `lingshi_market_${id}_${Date.now()}`, imgType: 'png',
        });
        if (image) return e.reply(image);
      } catch (error) {
        console.warn('[万界灵市] 行情图片生成失败：', error.message);
      }
      const panel = response.panelData;
      return e.reply([`【${panel.title}】${panel.status} ${panel.time}`, panel.summary,
        panel.debtSummary, panel.netAssets, panel.notice, ...panel.warnings,
        ...(panel.kind === 'portfolio'
          ? panel.portfolio.map(row => `${row.name} ${row.shares}股｜市值${row.value}｜浮盈${row.profit}`)
          : panel.rows.map(row => `${row.id}. ${row.name} ${row.price}/股｜${row.change}｜${row.status}`)),
        ...panel.news.map(item => item.text), '#灵市帮助 查看全部指令。'].join('\n'));
    }
    return e.reply(response.message);
  }

  async ranking(market, byRate) {
    const files = (await fs.readdir(__PATH.player_path)).filter(file => file.endsWith('.json'));
    const entries = [];
    let errors = 0;
    for (const file of files) {
      try {
        const player = JSON.parse(await fs.readFile(path.join(__PATH.player_path, file), 'utf8'));
        if (!player.灵市) continue;
        const stats = getMarketPortfolio(player, market);
        if (!stats.invested || (byRate && stats.invested < 100_000)) continue;
        entries.push({ name: String(player.名号 || file.slice(0, -5)).replace(/[\r\n]/g, ''),
          invested: stats.invested, value: stats.value, profit: stats.profit, rate: stats.rate, debt: stats.debt });
      } catch { errors += 1; }
    }
    entries.sort((a, b) => byRate ? b.rate - a.rate || b.profit - a.profit : b.profit - a.profit);
    return { message: [
      byRate ? '【万界灵市·收益率榜】累计投入至少10万灵石' : '【万界灵市·净盈利榜】',
      ...entries.slice(0, 15).map((entry, index) =>
        `${index + 1}. ${entry.name}\n累计投入${entry.invested.toLocaleString('zh-CN')}｜持仓市值${entry.value.toLocaleString('zh-CN')}\n净盈亏${entry.profit > 0 ? '+' : ''}${entry.profit.toLocaleString('zh-CN')}｜收益率${entry.rate.toFixed(2)}%${entry.debt ? `｜欠款${entry.debt.toLocaleString('zh-CN')}` : ''}`),
      entries.length ? '' : '暂无符合条件的玩家。',
      '净盈亏含持仓预估卖出费用、打听查账和借款利息；借款到账与归还本金均不计利润。收益率分母为累计买入和消息支出。',
      errors ? `本次有${errors}份异常存档未计入，请管理员核对。` : '',
    ].filter(Boolean).join('\n') };
  }
}
