import { plugin } from '../../api/api.js';
import config from '../../model/Config.js';
import { syncAllPlayerLucky } from '../../model/luckySync.js';
import { isXiuxianAdmin } from '../../model/xiuxian.js';

/**
 * 同步全体玩家的正确幸运值
 * 触发指令：#同步幸运（仅 Master）
 * 说明：
 *   - 统一仙宠加成公式为「每级增加 × 等级」（修复初始加成被重复计入的问题，
 *     如万仙白泽幸运由 100% 修正为 50%）。
 *   - 重算出战宠/纳戒宠的加成，并修正 player.幸运 =
 *     福源丹药力(addluckyNo) + 出战宠加成 + 炼妖继承幸运加成。
 */
export class luckySync extends plugin {
  constructor() {
    super({
      name: 'luckySync',
      dsc: '同步全体玩家正确幸运值',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#同步幸运$', fnc: 'syncLucky' }
      ]
    });
  }

  async syncLucky(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!isXiuxianAdmin(e)) return false;

    e.reply('开始同步全体玩家幸运值…');
    const result = await syncAllPlayerLucky();

    const lines = [
      `幸运同步完成：扫描 ${result.scanned} 人，修正 ${result.corrected} 人，未变 ${result.unchanged} 人，失败 ${result.failed} 人`,
    ];
    if (result.corrected > 0) {
      lines.push(`— 修正明细（前 ${Math.min(result.details.length, 10)}/${result.details.length} 条）—`);
      for (const d of result.details.slice(0, 10)) {
        lines.push(`${d.qq}: 幸运 ${d.from} → ${d.to}`);
      }
    }
    if (result.errors.length > 0) {
      lines.push(`— 失败明细（前 ${Math.min(result.errors.length, 10)}/${result.errors.length} 条）—`);
      for (const er of result.errors.slice(0, 10)) {
        lines.push(`${er.qq}: ${er.reason}`);
      }
    }
    e.reply(lines.join('\n'));
    return true;
  }
}
