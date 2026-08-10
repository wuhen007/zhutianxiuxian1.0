import { plugin, verc, data } from '../../api/api.js';
import {
  Read_player,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import {
  formatGongfaProficiency,
  getGongfaDailyGain,
  getGongfaProficiencyProfile,
  getLearnedGongfaNames,
} from '../../model/gongfaProficiency.js';

const SPECIAL_GONGFA = new Set([
  '皆字秘',
  '临字秘',
  '者字秘',
  '行字秘',
  '鲲鹏宝术',
  '浑源法门·悟道',
]);

function trackedGongfaNames(player) {
  const combat = new Set(
    [...(data.jineng1 || []), ...(data.jineng2 || []), ...(data.jineng3 || [])]
      .filter(skill => skill?.class === '功法')
      .map(skill => skill.熟练度归属 || skill.name)
  );
  const recorded = new Set(Object.keys(player?.功法熟练度 || {}));
  return getLearnedGongfaNames(player).filter(name =>
    combat.has(name) || SPECIAL_GONGFA.has(name) || recorded.has(name)
  );
}

export class GongfaProficiency extends plugin {
  constructor() {
    super({
      name: '功法熟练度',
      dsc: '查看战斗与辅助功法的参悟进度',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#(?:功法熟练度|功法参悟)$', fnc: 'showProficiency' },
      ],
    });
  }

  async showProficiency(e) {
    if (!verc({ e })) return false;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    if (!(await existplayer(userId))) return false;

    const player = await Read_player(userId);
    const names = trackedGongfaNames(player);
    if (!names.length) return e.reply('你尚未掌握可参悟熟练度的功法。');

    const lines = ['【功法参悟】'];
    for (const name of names) {
      const profile = getGongfaProficiencyProfile(player, name);
      lines.push(formatGongfaProficiency(player, name));
      lines.push(
        `触发×${profile.trigger.toFixed(2)}｜威能×${profile.combat.toFixed(2)}｜效果×${profile.numeric.toFixed(2)}｜今日+${getGongfaDailyGain(player, name)}/20`
      );
    }
    return e.reply(lines.join('\n'));
  }
}
