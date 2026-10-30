import fs from 'node:fs';
import path from 'node:path';
import { plugin, config, data } from '../../api/api.js';
import {
  __PATH, channel, foundthing, Read_player, Read_najie, Read_equipment,
  Write_player, Write_najie, Write_equipment, player_efficiency, invalidateBattleEquipmentCache,
} from '../../model/xiuxian.js';
import {
  isTianjiAdmin, isSuiyunInheritanceQuery, readTianjiState, searchPlayerPossessions,
} from '../../model/tianjiSearch.js';
import { replacePlayerPossessions, validateTianjiReplacement } from '../../model/tianjiErasure.js';
import { getSuiyunStage } from '../../model/suiyun.js';
import { getSuiyunTimeline, getSuiyunClaimFile, readSuiyunUnique } from '../../model/suiyunRegistry.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';

export class TianjiErasure extends plugin {
  constructor() {
    super({
      name: '天机强行抹除', dsc: '管理员按名称替换同时间线持有物',
      event: 'message', priority: 100,
      rule: [{ reg: '^#强行抹除(.*)$', fnc: 'erase' }],
    });
  }

  async admin(e) {
    const qq = String(await channel(String(e.user_id).replace(/^qg_/, '')));
    if (!isTianjiAdmin(e, config.getConfig('xiuxian', 'xiuxian')?.Master || [], qq)) return null;
    const file = path.join(__PATH.player_path, `${qq}.json`);
    const player = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return { qq, timeline: getSuiyunTimeline(player) };
  }

  async scan(keyword, timeline) {
    const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
    const results = await searchPlayerPossessions(qq => readTianjiState(qq, __PATH), files, keyword, { timeline });
    if (results.errors.length) throw new Error(`存档读取异常，请先核对：${results.errors.map(item => item.qq).join('、')}`);
    return results;
  }

  async erase(e) {
    const admin = await this.admin(e);
    if (!admin) return e.reply('此指令仅限机器人主人或修仙管理员使用。');
    this.finish('eraseChoice');
    const keyword = String(e.msg).replace(/^#强行抹除/, '').trim();
    if (!keyword) return e.reply('用法：#强行抹除 名称。抹除岁云全部阶段请用 #强行抹除 岁云传承；范围为管理员当前时间线，无角色时为main。');
    try {
      const results = await this.scan(keyword, admin.timeline);
      const suiyun = isSuiyunInheritanceQuery(keyword) || results.some(item =>
        item.matches.some(match => match.kind === 'root' && getSuiyunStage({ 灵根: { name: match.name } })));
      const staleClaim = isSuiyunInheritanceQuery(keyword) && readSuiyunUnique('root', { timeline: admin.timeline });
      if (!results.length && !staleClaim) return e.reply(`时间线【${admin.timeline}】暂无【${keyword}】持有者。`);
      const context = this.setContext('eraseChoice', false, 120, '抹除会话已超时，尚未执行的替换已取消。');
      context.erasure = {
        keyword, timeline: admin.timeline, operator: admin.qq, suiyun,
        ids: results.map(item => item.qq), matches: results.flatMap(item => item.matches),
        stage: 'replacement', expiresAt: Date.now() + 120_000,
      };
      return e.reply([
        `【强行抹除·选择替换】时间线：${admin.timeline}`,
        `目标【${keyword}】，命中${results.length}名玩家：`,
        ...results.slice(0, 20).map(item => `${item.name}（${item.qq}）：${[...new Set(item.matches.map(match => match.location))].join('、')}`),
        results.length > 20 ? `其余${results.length - 20}人也在本次范围内，可用 #推演天机 ${keyword} 查看。` : '',
        staleClaim && !results.length ? `仅发现旧的岁云灵根登记，归属：${staleClaim.ownerId}。` : '',
        suiyun ? '会替换命中玩家的全部岁云灵根快照，清理岁云觉醒、法则、专属天资与宫主身份；奖励历史及已有物品保留。全部传承者清除后释放本时间线灵根名额。' : '',
        '请在120秒内回复替换名称，例如：替换为 无演无尽者。随后会再次确认；回复 取消 结束。',
      ].filter(Boolean).join('\n'));
    } catch (error) {
      return e.reply(`抹除准备未完成：${error.message}`);
    }
  }

  async eraseChoice(context) {
    const e = this.e;
    const pending = context.erasure;
    if (String(e.user_id) !== String(context.user_id)
      || String(e.group_id || '') !== String(context.group_id || '')
      || String(e.self_id || '') !== String(context.self_id || '')
      || Boolean(e.isGroup) !== Boolean(context.isGroup)) return 'continue';
    const input = String(e.msg || '').trim();
    if (/^#强行抹除/.test(input)) return this.erase(e);
    if (input.startsWith('#') && !/^#(?:替换为|替换成|确认抹除|取消抹除)/.test(input)) {
      this.finish('eraseChoice');
      return 'continue';
    }
    const admin = await this.admin(e);
    if (!admin || !pending || admin.qq !== pending.operator || admin.timeline !== pending.timeline
      || this.getContext('eraseChoice') !== context || Date.now() > pending.expiresAt) {
      this.finish('eraseChoice');
      return e.reply('权限、角色、时间线或会话状态已变化，请重新发起抹除。');
    }
    if (/^#?(?:取消|取消抹除)$/.test(input)) {
      this.finish('eraseChoice');
      return e.reply('已取消抹除。');
    }
    try {
      if (pending.stage === 'replacement') {
        const name = input.replace(/^#?(?:替换为|替换成)\s*/, '').trim();
        const roots = pending.suiyun || pending.matches.some(item => item.kind === 'root');
        const replacement = roots ? data.talent_list.find(item => item.name === name) : await foundthing(name);
        validateTianjiReplacement(pending.matches.length ? pending.matches : [{ kind: 'suiyun' }], replacement, pending.keyword);
        if (roots && !data.talent_list.includes(replacement)) throw new Error('请回复灵根表中的名称。');
        if (pending.suiyun && (replacement.唯一灵根 || getSuiyunStage({ 灵根: replacement }))) throw new Error('请选择普通灵根作为替换目标。');
        pending.replacement = structuredClone(replacement);
        pending.stage = 'confirm';
        return e.reply(`时间线【${pending.timeline}】：将${pending.ids.length}名玩家持有的【${pending.keyword}】替换为【${replacement.name}】。\n执行前自动备份；请回复 确认抹除 执行，或回复 取消。`);
      }
      if (!/^#?确认抹除$/.test(input)) return e.reply('请回复 确认抹除 或 取消。');
      this.finish('eraseChoice');
      await e.reply('正在备份并替换，请稍候。');
      const result = await this.executeErasure(pending);
      return e.reply([
        `【强行抹除·结果】时间线：${pending.timeline}`,
        `【${pending.keyword}】→【${pending.replacement.name}】：完成${result.changed}人，失败${result.errors.length}人。`,
        ...result.errors.map(item => `${item.qq}：${item.message}`),
        pending.suiyun ? (result.released ? '本时间线岁云灵根名额已释放。' : '本时间线岁云灵根登记未释放，请用 #推演天机 岁云传承 核对剩余持有者。') : '',
        result.registryError ? `登记处理异常：${result.registryError}` : '',
        `备份：${result.backupDir}`,
      ].join('\n'));
    } catch (error) {
      return e.reply(`抹除未完成：${error.message}`);
    }
  }

  async executeErasure(pending) {
    return withPlayerMutationLock(`tianji-erasure:${pending.timeline}`, async () => {
      const current = await this.scan(pending.keyword, pending.timeline);
      if (JSON.stringify(current.map(item => item.qq).sort()) !== JSON.stringify([...pending.ids].sort())) {
        throw new Error('持有者列表已变化，请重新发起并核对名单。');
      }
      const stamp = `${Date.now()}-${process.pid}`;
      const backupDir = path.resolve(__PATH.player_path, '../../..', '_backups', `tianji_erasure_${stamp}`);
      fs.mkdirSync(backupDir, { recursive: true });
      const result = { changed: 0, errors: [], released: false, backupDir };
      for (const qq of pending.ids) {
        try {
          await withPlayerMutationLock(qq, async () => {
            const transaction = new FileRollbackTransaction();
            for (const key of ['player_path', 'najie_path', 'equipment_path']) {
              const file = path.join(__PATH[key], `${qq}.json`);
              transaction.capture(file);
              if (fs.existsSync(file)) {
                const target = path.join(backupDir, key, `${qq}.json`);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
              }
            }
            try {
              const state = {
                player: await Read_player(qq),
                najie: fs.existsSync(path.join(__PATH.najie_path, `${qq}.json`)) ? await Read_najie(qq) : {},
                equipment: await Read_equipment(qq),
              };
              if (getSuiyunTimeline(state.player) !== pending.timeline) throw new Error('玩家已切换时间线，请重新查询。');
              const originalBag = JSON.stringify(state.najie);
              const change = replacePlayerPossessions(state, pending.keyword, pending.replacement);
              if (!change.changed) throw new Error('玩家持有状态已变化，请重新查询。');
              if (JSON.stringify(state.najie) !== originalBag
                && await Write_najie(qq, state.najie, { allowWorldlineUnlock: true }) === false) throw new Error('纳戒保存失败');
              await Write_player(qq, state.player);
              await Write_equipment(qq, state.equipment);
              await player_efficiency(qq);
              transaction.commit();
              result.changed++;
            } catch (error) {
              transaction.rollback();
              invalidateBattleEquipmentCache(qq);
              throw error;
            }
          });
        } catch (error) {
          result.errors.push({ qq, message: error.message });
        }
      }
      if (pending.suiyun && !result.errors.length) {
        try {
          const options = { timeline: pending.timeline };
          const claim = readSuiyunUnique('root', options);
          if (claim) await withPlayerMutationLock(String(claim.ownerId), async () => {
            const remaining = await this.scan('岁云传承', pending.timeline);
            if (remaining.length || readSuiyunUnique('root', options)?.ownerId !== claim.ownerId) return;
            const file = getSuiyunClaimFile('root', options);
            fs.copyFileSync(file, path.join(backupDir, path.basename(file)), fs.constants.COPYFILE_EXCL);
            fs.unlinkSync(file);
            result.released = true;
          });
          else result.released = true;
        } catch (error) {
          result.registryError = error.message;
        }
      }
      return result;
    });
  }
}
