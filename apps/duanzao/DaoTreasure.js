import fs from 'node:fs';
import path from 'node:path';
import { plugin, config, data, verc } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_player,
  Write_player,
  Write_equipment,
  __PATH,
  channel,
  exist_najie_thing,
  existplayer,
  foundthing,
  player_efficiency,
  invalidateBattleEquipmentCache,
  ForwardMsg,
  zd_battle,
} from '../../model/xiuxian.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import {
  applyInitialMinggeEffectsRaw,
  createPlayerMingge,
  rollbackInitialMinggeEffects,
} from '../../model/mingge.js';
import {
  DAO_TREASURE_AUTHORITIES,
  DAO_TREASURE_FUEL,
  DAO_TREASURE_GUARD_TARGET,
  DAO_TREASURE_MAX_ORIGIN,
  advanceDaoTreasureProject,
  contributeDaoTreasureFuel,
  createDaoTreasureProject,
  formatDaoTreasureProject,
  getPendingDaoTreasureDelivery,
  guardDaoTreasureStage,
  isDaoTreasureOwner,
  isDaoTreasureItem,
  markDaoTreasureDelivered,
  readDaoTreasureState,
  repairDaoTreasureAuthority,
  spendDaoTreasureOrigin,
} from '../../model/daoTreasure.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction, writeJsonAtomically } from '../SecretPlace/rebirthTransaction.js';
import { findYongJiByNameOrQQ, reviveFromYongJi } from '../Boss/YongJiList.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { getSuiyunDream, consumeSuiyunDream, SUIYUN_BRANCH_AUTHORITIES, formatSuiyunAuthoritySeals } from '../../model/suiyunAuthority.js';

const APTITUDE_EVALUATIONS = Object.freeze({
  无演无尽: '亘古绝今从未有，演尽诸天万界，已超脱天道束缚',
  万古无双: '横推古今未来无对手，为修道而生，为应劫而至',
  绝世天骄: '惊才绝艳，具备帝姿，注定成为一个时代的主角',
  旷世奇才: '万年难遇，放眼九天十地亦难寻其一',
  天纵之资: '天赋异禀，足以比肩上古大教最杰出的传人',
  超凡资质: '资质超凡，道基之上已有异象显化',
  平庸之资: '资质平平，尚需以岁月与心志弥补',
  先天不足: '先天有缺，修炼事倍功半',
  天弃之人: '被天道抛弃，每一步修行皆有劫难',
  生而愚痴: '识海混沌，修行之路极其艰难',
});

const APTITUDES = Object.freeze(Object.keys(APTITUDE_EVALUATIONS));

function currentWorldTime() {
  const era = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  return {
    worldYear: getRealmEventWorldYear(era.index, era.years, era.epoch),
    epoch: Math.max(1, Number(era.epoch) || 1),
  };
}

function cleanName(input, maxLength = 10) {
  const name = String(input || '').trim();
  if (!name || name.length > maxLength || /[\r\n<>]/.test(name)) return '';
  return name;
}

function targetFromEvent(e) {
  const raw = e.at && e.at !== 'all'
    ? String(e.at)
    : e.message?.find?.(item => item.type === 'at')?.qq;
  return raw ? String(raw).replace('qg_', '') : '';
}

function fuelScore(fuel = {}) {
  const weights = { 众生念力: 1, 鸿蒙道火: 10, 界核: 20, 宇宙核心: 100 };
  return Object.entries(fuel).reduce((sum, [name, amount]) => sum + (weights[name] || 1) * Number(amount || 0), 0);
}

export class DaoTreasure extends plugin {
  constructor() {
    super({
      name: '大道至宝',
      dsc: '以修仙文明为薪，跨越一个纪元炼制大道至宝',
      event: 'message',
      priority: 585,
      rule: [
        { reg: '^#大道炼器$', fnc: 'showForge' },
        { reg: '^#开铸大道至宝\\s+.+$', fnc: 'openForge' },
        { reg: '^#献祭文明\\s+.+\\*\\d+$', fnc: 'contribute' },
        { reg: '^#镇守大道炉$', fnc: 'guardForge' },
        { reg: '^#渡大道器劫$', fnc: 'faceFinalTribulation' },
        { reg: '^#大道至宝$', fnc: 'showTreasure' },
        { reg: '^#大道至宝改名(?:\\s+.*)?$', fnc: 'renameTreasure' },
        { reg: '^#敕令大道\\s+(生死|命运|万法|世界)$', fnc: 'selectAuthority' },
        { reg: '^#修复大道权柄\\s+(本体|生死|命运|万法|世界)$', fnc: 'repairAuthority' },
        { reg: '^#改写生死(?:\\s+.+)?$', fnc: 'rewriteLife' },
        { reg: '^#改写命格\\s+.+$', fnc: 'rewriteFate' },
        { reg: '^#重塑天资\\s+.+$', fnc: 'rewriteAptitude' },
        { reg: '^#同意大道改命$', fnc: 'acceptRewrite' },
        { reg: '^#推演终极功法\\s+.+$', fnc: 'deduceTechnique' },
        { reg: '^#开辟大道界\\s+.+$', fnc: 'createDaoWorld' },
      ],
    });
    this.task = {
      cron: '20 */10 * * * ?',
      name: '大道至宝成器发放',
      fnc: () => this.deliverTreasure(),
    };
  }

  async qq(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  async requireOwner(e, authority = '') {
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return null;
    const borrower = await Read_player(qq);
    const dream = getSuiyunDream(borrower, '大道至宝', authority);
    if (dream && !dream.used && authority) return {
      qq, player: borrower, dream: true,
      state: { treasure: { name: `梦幻·${authority}`, ownerId: qq, origin: 12, authorities: { [authority]: '完整' } } },
    };
    const state = readDaoTreasureState();
    if (!isDaoTreasureOwner(qq, state)) {
      await e.reply('大道至宝并未认你为主。');
      return null;
    }
    const player = await Read_player(qq);
    if (authority && player.当前大道至宝 !== state.treasure.name) {
      await e.reply(`需先将【${state.treasure.name}】装备至至宝槽位，方可行使大道权柄。`);
      return null;
    }
    if (authority && state.treasure.authorities?.[authority] !== '完整') {
      await e.reply(`【${authority}】权柄尚且残缺，请先使用 #修复大道权柄 ${authority}`);
      return null;
    }
    return { qq, player, state };
  }

  async spendOrigin(options) {
    const player = await Read_player(options.ownerId);
    const dream = getSuiyunDream(player, '大道至宝');
    if (!dream || dream.used || (options.authority && options.authority !== dream.key)) return spendDaoTreasureOrigin(options);
    return withPlayerMutationLock(options.ownerId, async () => {
      const latest = await Read_player(options.ownerId);
      const current = getSuiyunDream(latest, '大道至宝', dream.key);
      if (!current || current.used) return { ok: false, reason: 'already-used', message: '这一次梦幻权柄已使用。' };
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${options.ownerId}.json`));
      try {
        const treasure = { name: `梦幻·${dream.key}`, ownerId: options.ownerId, origin: 12 };
        await options.mutate?.(treasure, { treasure });
        const result = await Read_player(options.ownerId);
        if (!consumeSuiyunDream(result, '大道至宝', dream.key)) throw new Error('梦幻权柄状态已变化');
        await Write_player(options.ownerId, result);
        transaction.commit();
        return { ok: true, remaining: 0, treasure };
      } catch (error) {
        transaction.rollback();
        throw error;
      }
    });
  }

  async showForge(e) {
    if (!verc({ e })) return false;
    const { worldYear } = currentWorldTime();
    await advanceDaoTreasureProject(worldYear, currentWorldTime().epoch);
    const state = readDaoTreasureState();
    if (state.treasure) {
      return e.reply([
        `【大道器成】${state.treasure.name}`,
        `器主：${state.treasure.ownerName}`,
        `完整度：${state.treasure.integrity}%`,
        `文明本源：${state.treasure.origin}/${DAO_TREASURE_MAX_ORIGIN}`,
        `四权柄：${DAO_TREASURE_AUTHORITIES.map(name => `${name}[${state.treasure.authorities?.[name] || '残缺'}]`).join('、')}`,
        '发送 #大道至宝 查看完整权柄。',
      ].join('\n'));
    }
    return e.reply(formatDaoTreasureProject(state.project, worldYear));
  }

  async openForge(e) {
    if (!verc({ e })) return false;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const player = await Read_player(qq);
    const name = cleanName(String(e.msg).replace(/^#开铸大道至宝\s+/, ''), 10);
    if (!name) return e.reply('至宝名称需为1至10个字符，且不可包含换行或尖括号。');
    if (await foundthing(name)) return e.reply(`诸天已有名为【${name}】的事物，请为大道至宝另择真名。`);
    if (player.occupation !== '炼器师') return e.reply('唯有炼器师能够立下大道熔炉。');
    if (getRealmAuthorityLevel(player) < 22) return e.reply('开铸大道至宝需要达到祭道境。');
    if (player.炼器功法 !== '无上炼器道' || Number(player.炼器功法熟练度) < 100) {
      return e.reply('需将【无上炼器道】修至100熟练度，方能承受文明炉火。');
    }
    const tripodListPath = path.join(__PATH.duanlu, 'duanlu.json');
    const tripods = JSON.parse(fs.readFileSync(tripodListPath, 'utf8'));
    const tripod = tripods.find(item => String(item.qq) === qq);
    if (!['混沌炉', '造化仙炉'].includes(tripod?.炉阶) || player.炉火 !== '道火') {
      return e.reply('开铸需安装【混沌炉】或【造化仙炉】，并点燃【道火】。');
    }

    const { worldYear } = currentWorldTime();
    const result = await createDaoTreasureProject({
      ownerId: qq,
      ownerName: player.名号,
      name,
      worldYear,
    });
    if (!result.ok) {
      return e.reply(result.reason === 'already-completed'
        ? `大道至宝【${result.treasure.name}】已经出世，诸天不容第二件同阶之器。`
        : `大道炉已由${result.project.ownerName}立下，当前正在炼制【${result.project.name}】。`);
    }
    return e.reply([
      '【大道炉开·文明聚薪】',
      `${player.名号}于岁月长河之上立下大道熔炉，欲炼【${name}】。`,
      '它将以众生愿念为血，以宇宙核心为骨，以界核为胎，以鸿蒙道火点燃一个纪元。',
      ...Object.entries(DAO_TREASURE_FUEL).map(([fuel, amount]) => `${fuel}×${amount}`),
      '全服修士可使用：#献祭文明 材料名*数量',
      '薪火齐备之刻，大道炉将自动点燃。',
    ].join('\n'));
  }

  async contribute(e) {
    if (!verc({ e })) return false;
    const match = String(e.msg).match(/^#献祭文明\s+(.+?)\*(\d+)$/);
    if (!match) return false;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const itemName = match[1].trim();
    const amount = Math.max(1, Math.trunc(Number(match[2]) || 1));
    if (!DAO_TREASURE_FUEL[itemName]) {
      return e.reply(`大道炉只收纳：${Object.keys(DAO_TREASURE_FUEL).join('、')}`);
    }
    const player = await Read_player(qq);
    const { worldYear } = currentWorldTime();
    const result = await contributeDaoTreasureFuel({
      contributorId: qq,
      contributorName: player.名号,
      itemName,
      amount,
      worldYear,
      consume: async accepted => {
        const owned = Number(await exist_najie_thing(qq, itemName, '材料')) || 0;
        if (owned < accepted) throw new Error(`纳戒中只有${itemName}×${owned}，本次需要×${accepted}`);
        await Add_najie_thing(qq, itemName, '材料', -accepted);
      },
    }).catch(error => ({ ok: false, reason: 'consume-failed', message: error.message }));
    if (!result.ok) {
      const reasons = {
        'not-gathering': '当前大道炉不在文明聚薪阶段。',
        'fuel-full': `【${itemName}】已经达到所需数量。`,
        'consume-failed': result.message,
      };
      return e.reply(reasons[result.reason] || '文明献祭未能完成。');
    }
    const contribution = fuelScore({ [itemName]: result.accepted });
    await withPlayerMutationLock(qq, async () => {
      const latest = await Read_player(qq);
      latest.文明薪火贡献 = (Number(latest.文明薪火贡献) || 0) + contribution;
      if (result.firstContribution) latest.文明道痕 = (Number(latest.文明道痕) || 0) + 1;
      await Write_player(qq, latest);
    });
    if (result.ignited) {
      return e.reply([
        `【大道炉点燃】${result.project.name}`,
        `${player.名号}投入${itemName}×${result.accepted}，补全了最后一缕文明薪火。`,
        `大道炉将自世界年${result.project.startWorldYear}燃烧至${result.project.targetWorldYear}，整整一个纪元。`,
        `第一阶段【熔薪】已经开始，每位修士可使用 #镇守大道炉 留下一道文明道痕。`,
      ].join('\n'));
    }
    return e.reply(`文明献祭成功：${itemName}×${result.accepted}\n当前进度：${result.project.fuel[itemName]}/${DAO_TREASURE_FUEL[itemName]}`);
  }

  async guardForge(e) {
    if (!verc({ e })) return false;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const player = await Read_player(qq);
    const { worldYear } = currentWorldTime();
    await advanceDaoTreasureProject(worldYear, currentWorldTime().epoch);
    const currentProject = readDaoTreasureState().project;
    if (currentProject?.stageIndex === 4) {
      return e.reply('第五阶段需直面大道化身，请使用 #渡大道器劫；唯有胜者能够留下渡劫道痕。');
    }
    const result = await guardDaoTreasureStage({ playerId: qq, playerName: player.名号, worldYear });
    if (!result.ok) {
      return e.reply(result.reason === 'already-guarded'
        ? `你已在本阶段留下文明道痕，当前镇守${Object.keys(result.stage.guardians || {}).length}/${DAO_TREASURE_GUARD_TARGET}。`
        : '当前没有可以镇守的大道炼制阶段。');
    }
    await withPlayerMutationLock(qq, async () => {
      const latest = await Read_player(qq);
      latest.文明道痕 = (Number(latest.文明道痕) || 0) + 1;
      await Write_player(qq, latest);
    });
    return e.reply([
      `【大道炉·${result.stage.name}】`,
      `${player.名号}以自身道果镇住炉中暴动法则，留下一道文明道痕。`,
      `本阶段镇守：${result.guardians}/${result.target}`,
      result.guardians >= result.target ? '本阶段已经稳固，时代结束时对应权柄将完整成形。' : '尚需更多修士共同镇守。',
    ].join('\n'));
  }

  async faceFinalTribulation(e) {
    if (!verc({ e })) return false;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const { worldYear, epoch } = currentWorldTime();
    await advanceDaoTreasureProject(worldYear, epoch);
    const project = readDaoTreasureState().project;
    if (!project || project.status !== 'forging' || project.stageIndex !== 4) {
      return e.reply('大道器劫只在第五阶段【渡劫】开放。');
    }
    const stage = project.stages[4];
    if (stage.guardians?.[qq]) return e.reply('你已击破本纪元的大道化身，无需重复渡劫。');
    const source = await Read_player(qq);
    const attacker = JSON.parse(JSON.stringify(source));
    attacker.当前血量 = attacker.血量上限;
    const authorityLevel = getRealmAuthorityLevel(source);
    const enemy = JSON.parse(JSON.stringify(source));
    enemy.id = `dao-tribulation-${qq}`;
    enemy.名号 = `大道化身·${source.名号}`;
    enemy.boss = true;
    enemy.type = 'boss';
    enemy.攻击 = Math.max(1, Math.floor(Number(source.攻击) * (1.05 + authorityLevel * 0.005)));
    enemy.防御 = Math.max(1, Math.floor(Number(source.防御) * 0.9));
    enemy.血量上限 = Math.max(1, Math.floor(Number(source.血量上限) * 1.25));
    enemy.当前血量 = enemy.血量上限;
    enemy.速度 = Math.max(1, Math.floor(Number(source.速度 || 100) * 0.95));
    enemy.名号 = `大道化身·${project.name}`;
    enemy.当前大道至宝 = '';
    enemy.大道主权柄 = '';
    enemy.学习的功法 = [...new Set(source.学习的功法 || [])];
    const battle = await zd_battle(attacker, enemy, { battleType: 'dao_treasure_tribulation' });
    if (Array.isArray(battle.msg) && battle.msg.length) await ForwardMsg(e, battle.msg);
    if (battle.winner !== 'A') {
      return e.reply('【大道器劫·未破】你的道果未能胜过大道镜像，本阶段仍可再次挑战。');
    }
    const result = await guardDaoTreasureStage({
      playerId: qq,
      playerName: source.名号,
      worldYear,
    });
    if (!result.ok) return e.reply('器劫已破，但本阶段道痕未能写入，请联系管理员检查大道炉状态。');
    await withPlayerMutationLock(qq, async () => {
      const latest = await Read_player(qq);
      latest.文明道痕 = (Number(latest.文明道痕) || 0) + 1;
      await Write_player(qq, latest);
    });
    return e.reply(`【大道器劫·斩道功成】${source.名号}击破自身大道化身，渡劫道痕${result.guardians}/${result.target}。`);
  }

  async deliverTreasure() {
    const pending = getPendingDaoTreasureDelivery();
    if (!pending || !await existplayer(pending.treasure.ownerId)) return false;
    const qq = pending.treasure.ownerId;
    const idempotencyKey = `dao-treasure:${pending.treasure.id}`;
    await Add_najie_thing(qq, pending.item, '装备', 1, 6, 1, { idempotencyKey });
    await markDaoTreasureDelivered();
    return true;
  }

  async showTreasure(e) {
    if (!verc({ e })) return false;
    await this.deliverTreasure();
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const item = (await Read_equipment(qq)).至宝;
    const owned = isDaoTreasureItem(item) && String(item.绑定者 || item.author_name || item.ownerId) === qq;
    if (owned && item.name !== readDaoTreasureState().treasure?.name) {
      return e.reply([
        `【大道至宝·${item.自定义名称 || item.name}】`,
        `本名：${item.name}｜器主：${(await Read_player(qq)).名号 || qq}`,
        `固定全属性：${Number(item.固定全属性) || 0}｜全属性倍率加成：${Number(item.全属性倍率加成) || 0}`,
        '改名：#大道至宝改名 新名称（1至10字，仅改器名，不改变权柄与绑定）。',
        ...(item.name === '无上天阙枝'
          ? SUIYUN_BRANCH_AUTHORITIES.map(([name, command, effect]) => `${name}｜${command}：${effect}`) : []),
        ...(item.name === '无上天阙枝' ? formatSuiyunAuthoritySeals(await Read_player(qq)) : []),
      ].join('\n'));
    }
    const ctx = await this.requireOwner(e);
    if (!ctx) return false;
    const treasure = readDaoTreasureState().treasure;
    return e.reply([
      `【大道至宝·${owned && item.name === treasure.name ? item.自定义名称 || treasure.name : treasure.name}】`,
      `本名：${treasure.name}｜改名：#大道至宝改名 新名称（需装备本人至宝）`,
      `器主：${treasure.ownerName}｜完整度：${treasure.integrity}%`,
      '固定全属性：攻击、防御、生命各+1兆（最终加算）',
      '全属性倍率：+300（与其他倍率加法叠加）',
      `文明本源：${treasure.origin}/${DAO_TREASURE_MAX_ORIGIN}（每纪元恢复4）`,
      `本体[${treasure.body || (treasure.integrity >= 100 ? '完整' : '残缺')}]：决定第一阶段器胚完整度`,
      `生死[${treasure.authorities.生死}]：改写一次永寂或战斗致命结局，消耗6本源`,
      `命运[${treasure.authorities.命运}]：改写命格3点、重塑天资3至6点`,
      `万法[${treasure.authorities.万法}]：推演一部终极功法，消耗8点，仅一次`,
      `世界[${treasure.authorities.世界}]：将现有小世界升格为大道界，消耗12点，仅一次`,
      `当前战斗主权柄：${ctx.player.大道主权柄 || '未选择'}`,
      '使用 #敕令大道 生死/命运/万法/世界 切换。',
    ].join('\n'));
  }

  async renameTreasure(e) {
    if (!verc({ e })) return false;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return false;
    const raw = String(e.msg || '').replace(/^#大道至宝改名\s*/, '').trim();
    const name = cleanName(raw, 10);
    if (!name || /[\s#*\u0000-\u001f\u007f]/.test(name)) {
      return e.reply('用法：#大道至宝改名 新名称；器名限1至10字，避开空白、换行、尖括号、#与*。');
    }
    const message = await withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      if (getActiveZhutianAvatarName(player)) return '请先发送 #装载化身 本源，再为大道至宝改名。';
      const equipment = await Read_equipment(qq);
      const item = equipment.至宝;
      if (!isDaoTreasureItem(item) || item.先天投影截止) return '请先装备已认主的大道至宝，再使用改名指令。';
      const owners = [item.绑定者, item.author_name, item.ownerId].filter(value => value != null && value !== '').map(String);
      if (!owners.length || owners.some(owner => owner !== qq)) return '这件大道至宝尚未认你为主。';
      const previous = item.自定义名称 || item.name;
      if (name === previous) return `当前器名已是【${name}】，无需重复修改。`;
      if (name !== item.name && await foundthing(name, { readOnly: true })) return `诸天已有【${name}】，请另择器名。`;
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
      transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
      try {
        // 真名是权柄和唯一归属的标识；器名随实体换装保留，不改全局目录或认主记录。
        if (name === item.name) delete item.自定义名称;
        else item.自定义名称 = name;
        await Write_equipment(qq, equipment);
        transaction.commit();
      } catch (error) {
        try { transaction.rollback(); }
        finally { invalidateBattleEquipmentCache(qq); }
        throw error;
      }
      return `【大道铭名】${previous}的器名已改为【${name}】。\n本名【${item.name}】、绑定、唯一归属、属性和权柄保留；换装仍使用本名或纳戒代号。`;
    });
    return e.reply(message);
  }

  async selectAuthority(e) {
    const authority = String(e.msg).match(/^#敕令大道\s+(生死|命运|万法|世界)$/)?.[1];
    const ctx = await this.requireOwner(e, authority);
    if (!ctx) return false;
    const equipment = await Read_equipment(ctx.qq);
    if (!equipment.至宝?.大道至宝本体 || equipment.至宝.name !== ctx.state.treasure.name) {
      return e.reply(`需先将【${ctx.state.treasure.name}】装备至至宝槽位。`);
    }
    ctx.player.大道主权柄 = authority;
    await Write_player(ctx.qq, ctx.player);
    return e.reply(`【敕令大道】${ctx.state.treasure.name}已转入【${authority}】主权柄，下一场战斗将以此法则展开。`);
  }

  async repairAuthority(e) {
    const authority = String(e.msg).match(/^#修复大道权柄\s+(本体|生死|命运|万法|世界)$/)?.[1];
    const ctx = await this.requireOwner(e);
    if (!ctx) return false;
    const costs = { 众生念力: 200, 鸿蒙道火: 20, 界核: 10, 宇宙核心: 2 };
    const result = await repairDaoTreasureAuthority({
      ownerId: ctx.qq,
      authority,
      consume: async () => withPlayerMutationLock(ctx.qq, async () => {
        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.najie_path, `${ctx.qq}.json`));
        try {
          for (const [name, amount] of Object.entries(costs)) {
            const owned = Number(await exist_najie_thing(ctx.qq, name, '材料')) || 0;
            if (owned < amount) throw new Error(`修复需${name}×${amount}，当前×${owned}`);
          }
          for (const [name, amount] of Object.entries(costs)) {
            await Add_najie_thing(ctx.qq, name, '材料', -amount);
          }
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          throw error;
        }
      }),
    }).catch(error => ({ ok: false, reason: 'consume-failed', message: error.message }));
    if (!result.ok) {
      if (result.reason === 'already-complete') return e.reply(`【${authority}】权柄已经完整。`);
      return e.reply(result.message || '权柄修复失败。');
    }
    return e.reply(`【大道补天】${authority}权柄已经修复，至宝完整度提升至${result.treasure.integrity}%。`);
  }

  async requestConsent(e, kind, value, targetQq, cost) {
    const ctx = await this.requireOwner(e, '命运');
    if (!ctx) return false;
    const target = targetQq === ctx.qq ? ctx.player : await Read_player(targetQq);
    if (targetQq === ctx.qq) return this.applyRewrite(e, { kind, value, targetQq, ownerQq: ctx.qq, cost });
    await redis.set(`dao:rewrite:${targetQq}`, JSON.stringify({
      ownerQq: ctx.qq,
      ownerName: ctx.player.名号,
      targetQq,
      kind,
      value,
      cost,
      expiresAt: Date.now() + 60_000,
    }), { EX: 60 });
    return e.reply(`【大道改命邀请】${ctx.player.名号}欲将${target.名号}的${kind}改写为【${value}】。\n目标请在60秒内发送 #同意大道改命`);
  }

  async acceptRewrite(e) {
    const targetQq = await this.qq(e);
    const raw = await redis.get(`dao:rewrite:${targetQq}`);
    if (!raw) return e.reply('当前没有等待确认的大道改命邀请。');
    await redis.del(`dao:rewrite:${targetQq}`);
    const request = JSON.parse(raw);
    if (Number(request.expiresAt) < Date.now()) return e.reply('大道改命邀请已经消散。');
    return this.applyRewrite(e, request);
  }

  async applyRewrite(e, request) {
    const result = await this.spendOrigin({
      authority: '命运',
      ownerId: request.ownerQq,
      cost: request.cost,
      mutate: async () => withPlayerMutationLock(request.targetQq, async () => {
        const target = await Read_player(request.targetQq);
        if (request.kind === '命格') {
          const next = data.minggeList.find(item => item.name === request.value || item.id === request.value);
          if (!next) throw new Error('命格词条不存在');
          const oldId = typeof target.命格 === 'string' ? target.命格 : target.命格?.id;
          const old = data.minggeList.find(item => item.id === oldId);
          if (old) rollbackInitialMinggeEffects(target, old.effects);
          applyInitialMinggeEffectsRaw(target, next.effects);
          target.命格 = { ...createPlayerMingge(next), 初始效果已应用: true, 大道改写: true };
        } else {
          target.天资等级 = request.value;
          target.天资评价 = APTITUDE_EVALUATIONS[request.value];
        }
        await Write_player(request.targetQq, target);
      }),
    }).catch(error => ({ ok: false, reason: 'mutation-failed', message: error.message }));
    if (!result.ok) {
      return e.reply(result.reason === 'insufficient-origin'
        ? `文明本源不足，当前${result.current}点。`
        : (result.message || '大道改命失败。'));
    }
    return e.reply(`【命运重书】${request.kind}已经改写为【${request.value}】，剩余文明本源${result.remaining}点。`);
  }

  async rewriteFate(e) {
    const value = cleanName(String(e.msg).match(/^#改写命格\s+([^\s]+)/)?.[1], 20);
    const mentioned = targetFromEvent(e);
    const target = mentioned ? String(await channel(mentioned)) : await this.qq(e);
    if (!await existplayer(target)) return e.reply('目标尚未踏入仙途。');
    if (!data.minggeList.some(item => item.name === value || item.id === value)) return e.reply('未找到该命格，请先通过命格图鉴确认名称。');
    return this.requestConsent(e, '命格', value, target, 3);
  }

  async rewriteAptitude(e) {
    const value = cleanName(String(e.msg).match(/^#重塑天资\s+([^\s]+)/)?.[1], 10);
    if (!APTITUDES.includes(value)) return e.reply(`可重塑天资：${APTITUDES.join('、')}`);
    const mentioned = targetFromEvent(e);
    const target = mentioned ? String(await channel(mentioned)) : await this.qq(e);
    if (!await existplayer(target)) return e.reply('目标尚未踏入仙途。');
    return this.requestConsent(e, '天资', value, target, value === '无演无尽' ? 6 : 3);
  }

  async rewriteLife(e) {
    const ctx = await this.requireOwner(e, '生死');
    if (!ctx) return false;
    const mentioned = targetFromEvent(e);
    const rawTarget = String(e.msg).replace(/^#改写生死\s*/, '').trim();
    const target = mentioned ? String(await channel(mentioned)) : (rawTarget || ctx.qq);
    const found = await findYongJiByNameOrQQ(target);
    if (!found.found) return e.reply('未在永寂之界寻到该修士的真灵记录。');
    const targetQq = String(found.record.qq || found.record.id || target);
    const result = await this.spendOrigin({
      ownerId: ctx.qq,
      cost: 6,
      authority: '生死',
      mutate: async () => {
        const revived = await reviveFromYongJi(targetQq);
        if (!revived.success) throw new Error(revived.reason || '映照失败');
      },
    }).catch(error => ({ ok: false, reason: 'mutation-failed', message: error.message }));
    if (!result.ok) return e.reply(result.reason === 'insufficient-origin' ? `文明本源不足，当前${result.current}点。` : result.message);
    return e.reply(`【改写生死】永寂界裂开一道生门，${found.record.名号 || targetQq}已被重新映照至诸天。\n剩余文明本源${result.remaining}点。`);
  }

  async deduceTechnique(e) {
    const ctx = await this.requireOwner(e, '万法');
    if (!ctx) return false;
    const input = String(e.msg).replace(/^#推演终极功法\s+/, '').trim();
    const parts = input.split(/\s+/);
    const candidateType = parts.at(-1);
    const type = ['攻伐', '护道', '轮回', '悟道'].includes(candidateType) ? parts.pop() : '悟道';
    const name = cleanName(parts.join(' '), 10);
    if (!name) return e.reply('用法：#推演终极功法 功法名 攻伐/护道/轮回/悟道');
    const allTechniques = [...(data.gongfa_list || []), ...(data.timegongfa_list || []), ...(data.dijingList || [])];
    if (allTechniques.some(item => item.name === name)) return e.reply(`诸天已有功法【${name}】，推演不可覆盖既有传承。`);
    const result = await this.spendOrigin({
      ownerId: ctx.qq,
      cost: 8,
      authority: '万法',
      useKey: 'ultimate-technique',
      mutate: async treasure => {
        const playerPath = path.join(__PATH.player_path, `${ctx.qq}.json`);
        const sutraPath = path.join(data.lib_path, '玩家自创帝经.json');
        const previousSutras = structuredClone(data.dijingList || []);
        const transaction = new FileRollbackTransaction();
        transaction.capture(playerPath);
        transaction.capture(sutraPath);
        const sutra = {
          id: Date.now(),
          name,
          class: '功法',
          type: '终极功法',
          修炼加成: 20,
          终极路线: type,
          创造者: ctx.player.名号,
          创造者ID: ctx.qq,
          创造时间: new Date().toLocaleString('zh-CN'),
          出售价: 0,
          稀有度: 10,
        };
        try {
          data.addCustomSutra(sutra);
          const latest = await Read_player(ctx.qq);
          latest.学习的功法 ||= [];
          if (!latest.学习的功法.includes(name)) latest.学习的功法.push(name);
          latest.终极功法 = { name, type, createdAt: Date.now() };
          await Write_player(ctx.qq, latest);
          await player_efficiency(ctx.qq);
          treasure.ultimateTechnique = { name, type, createdAt: Date.now() };
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          data.dijingList = previousSutras;
          throw error;
        }
      },
    }).catch(error => ({ ok: false, reason: 'mutation-failed', message: error.message }));
    if (!result.ok) {
      const reasons = { 'already-used': '这件大道至宝已经推演过一部终极功法。', 'insufficient-origin': `文明本源不足，当前${result.current}点。` };
      return e.reply(reasons[result.reason] || result.message || '万法推演失败。');
    }
    return e.reply(`【推演万法】诸天功法在${ctx.state.treasure.name}中归一，终极功法【${name}】由此诞生。\n路线：${type}｜修炼加成：20｜剩余本源：${result.remaining}`);
  }

  async createDaoWorld(e) {
    const ctx = await this.requireOwner(e, '世界');
    if (!ctx) return false;
    const name = cleanName(String(e.msg).replace(/^#开辟大道界\s+/, ''), 10);
    if (!name) return e.reply('大道界名称需为1至10个字符。');
    const worldPath = path.join(data.lib_path, '小世界列表.json');
    const result = await this.spendOrigin({
      ownerId: ctx.qq,
      cost: 12,
      authority: '世界',
      useKey: 'dao-world',
      mutate: async treasure => {
        const transaction = new FileRollbackTransaction();
        transaction.capture(worldPath);
        try {
          const worlds = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
          const world = worlds.find(item => String(item.player_qq) === ctx.qq);
          if (!world) throw new Error('需先开辟并演化自己的小世界，才能以其为界胚');
          world.world_name = name;
          world.level = Math.max(6, Number(world.level) || 1);
          world.大道界 = true;
          world.大道界器主 = ctx.state.treasure.name;
          world.attributes ||= {};
          world.attributes.灵气浓度 = Math.max(100_000, Number(world.attributes.灵气浓度) || 0);
          world.attributes.面积 = '自成位面';
          world.attributes.时间流速 = '1:12';
          world.attributes.特殊资源 = [...new Set([...(world.attributes.特殊资源 || []), '文明本源', '大道结晶'])];
          writeJsonAtomically(worldPath, worlds);
          data.xiaoshijie = worlds;
          treasure.daoWorld = { name, createdAt: Date.now() };
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          throw error;
        }
      },
    }).catch(error => ({ ok: false, reason: 'mutation-failed', message: error.message }));
    if (!result.ok) {
      const reasons = { 'already-used': '这件大道至宝已经开辟过一方大道界。', 'insufficient-origin': `文明本源不足，当前${result.current}点。` };
      return e.reply(reasons[result.reason] || result.message || '大道界开辟失败。');
    }
    return e.reply(`【自成一界】小世界于${ctx.state.treasure.name}中升格为【${name}】，面积化作自成位面，时间流速提升至1:12。`);
  }
}
