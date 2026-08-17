import fs from 'node:fs';
import { data, plugin } from '../../api/api.js';
import { __PATH, channel } from '../../model/xiuxian.js';
import {
  getShengxuRankEntries,
  isShengxuRankEligible,
  SHENGXU_RANK_LIMIT,
} from '../../model/shengxuRank.js';

function readPlayers() {
  const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
  return files.flatMap(file => {
    try {
      const player = JSON.parse(fs.readFileSync(`${__PATH.player_path}/${file}`, 'utf8'));
      return [{ ...player, qq: file.slice(0, -5) }];
    } catch {
      return [];
    }
  });
}

function realmName(level) {
  return data.huafen_list?.find(item => Number(item.level_id) === Number(level))?.level || `花粉境${level}阶`;
}

export class ShengxuRank extends plugin {
  constructor() {
    super({
      name: '圣墟榜',
      dsc: '花粉进化路圣墟榜单',
      event: 'message',
      priority: 600,
      rule: [{ reg: '^#圣墟榜(?:\\s+\\d+)?$', fnc: 'showRank' }],
    });
  }

  async showRank(e) {
    const userId = await channel(String(e.user_id).replace('qg_', ''));
    const requested = Number(String(e.msg || '').match(/(\d+)$/)?.[1]) || SHENGXU_RANK_LIMIT;
    const players = readPlayers();
    const entries = getShengxuRankEntries(players, requested);
    const lines = [
      '【圣墟榜·花粉进化路】',
      '仅收录已踏上花粉进化路的修士。排序：花粉境界＞当前道则进度＞极境数量＞场域境界。',
      '',
    ];
    if (!entries.length) {
      lines.push('当前还没有花粉路修士登榜。');
      return e.reply(lines.join('\n'));
    }
    entries.forEach((entry, index) => {
      const dao = entry.flowerDaoTarget
        ? `道则${entry.flowerDaoExp}/${entry.flowerDaoTarget}`
        : '道则未开';
      lines.push(
        `${index + 1}. ${entry.name}｜${realmName(entry.realmLevel)}｜${entry.branch}`
        + `｜${dao}｜极境${entry.extremeCount}｜场域${entry.fieldStage}重天`
      );
    });
    const mine = entries.findIndex(entry => entry.qq === String(userId));
    const current = players.find(player => player.qq === String(userId));
    if (mine >= 0) lines.push('', `你的圣墟榜排名：第${mine + 1}名`);
    else if (!isShengxuRankEligible(current)) lines.push('', '你尚未踏上花粉进化路，暂不计入圣墟榜。');
    else lines.push('', '你当前位于榜单展示范围之外。');
    return e.reply(lines.join('\n'));
  }
}
