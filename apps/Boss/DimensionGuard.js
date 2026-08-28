import fs from 'node:fs';
import path from 'node:path';

import { config, data, plugin } from '../../api/api.js';
import {
  Read_player,
  __PATH,
} from '../../model/xiuxian.js';
import {
  markPlanesDestroyed,
  PLANE_DESTRUCTION_SOURCES,
} from '../../model/planeDestruction.js';
import {
  advanceDimensionGuardState,
  createDimensionGuardState,
  isGuardingEternal,
} from '../../model/dimensionGuard.js';
import { writeJsonAtomically } from '../../utils/atomicJson.js';

const STATE_FILE = path.join(__PATH.data_path, 'dimension_guard_state.json');
const PLANE_FILE = data.filePathMap.weimianList;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return createDimensionGuardState();
  }
}

function saveState(state) {
  writeJsonAtomically(STATE_FILE, state);
}

function readPlayerFiles() {
  try {
    return fs.readdirSync(__PATH.player_path).filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
}

function highlandDestroyed() {
  try {
    const plane = JSON.parse(fs.readFileSync(PLANE_FILE, 'utf8'));
    return plane.厄土高原 === 0;
  } catch {
    return false;
  }
}

async function findGuardians() {
  const guardians = [];
  for (const file of readPlayerFiles()) {
    const id = file.replace(/\.json$/, '');
    try {
      const player = await Read_player(id);
      if (isGuardingEternal(player)) guardians.push({ id, name: player.名号 || id });
    } catch {}
  }
  return guardians;
}

function formatTime(timestamp) {
  if (!timestamp) return '未排定';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export class DimensionGuard extends plugin {
  constructor() {
    super({
      name: '永恒未知之地维度镇守',
      dsc: '仙帝镇守永恒未知之地，防止大恐怖席卷上苍与诸天',
      event: 'message',
      priority: 579,
      rule: [
        { reg: '^#永恒镇守状态$', fnc: 'showStatus' },
        { reg: '^#维度镇守状态$', fnc: 'showStatus' },
      ],
    });
    this.task = {
      cron: '0 */1 * * * *',
      name: '永恒镇守与维度灾厄巡查',
      fnc: () => this.tick(),
      log: false,
    };
    this.ticking = false;
  }

  async broadcast(message) {
    const set = config.getConfig('xiuxian', 'xiuxian');
    const configured = Array.isArray(set?.Era?.notifyGroups)
      ? set.Era.notifyGroups
      : [];
    const fallback = configured.length
      ? []
      : await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    for (const groupId of new Set([...configured, ...fallback])) {
      try {
        await Bot.pickGroup(groupId).sendMsg(message);
      } catch (error) {
        logger.warn(`[维度镇守] 群${groupId}广播失败：${error.message}`);
      }
    }
  }

  async tick() {
    if (this.ticking) return false;
    this.ticking = true;
    try {
      const now = Date.now();
      const guardians = await findGuardians();
      const result = advanceDimensionGuardState(readState(), {
        now,
        guarded: guardians.length > 0,
        highlandDestroyed: highlandDestroyed(),
      });
      if (result.event) {
        const destroyed = markPlanesDestroyed(PLANE_FILE, result.event.targets, {
          source: PLANE_DESTRUCTION_SOURCES.DIMENSION_CALAMITY,
          actor: '永恒未知之地大恐怖',
        });
        await this.broadcast([
          '【维度灾厄·永恒失守】',
          '厄土高原尚存，而永恒未知之地无人镇守。',
          '大恐怖已席卷而下，上苍之上与诸天万界的现世锚点被逐一打灭。',
          `本次覆灭位面：${destroyed.join('、') || '暂无可写入位面'}`,
          '仙帝真身归位永恒未知之地后，方可阻止下一轮灾厄；已毁位面需以映照权能重塑。',
        ].join('\n'));
      }
      saveState(result.state);
      return Boolean(result.event);
    } finally {
      this.ticking = false;
    }
  }

  async showStatus(e) {
    await this.tick();
    const state = readState();
    const guardians = await findGuardians();
    const lines = [
      '【维度镇守·永恒未知之地】',
      `厄土高原：${highlandDestroyed() ? '已覆灭，灾厄链断开' : '尚存'}`,
      `当前镇守仙帝：${guardians.length ? guardians.map((item) => item.name).join('、') : '无'}`,
      `镇守规则：每小时检查一次，仙帝真身位于永恒未知之地即算镇守；法身可在诸天代行副本。`,
      `下一次大恐怖：${formatTime(state.nextCalamityAt)}`,
      `历史灾厄：${state.calamityCount || 0}次`,
    ];
    return e.reply(lines.join('\n'));
  }
}
