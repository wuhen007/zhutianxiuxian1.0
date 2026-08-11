import fs from 'fs';
import path from 'path';
import { plugin, config, data } from '../../api/api.js';
import { __PATH, channel, existplayer, Read_player } from '../../model/xiuxian.js';

/** 自动备份保留份数，超过则删除最旧的 */
const KEEP_BACKUP_COUNT = 30;
const FULL_DATA_SNAPSHOT = 'data';
const ROOT_DATA_SNAPSHOT = 'root_data';
const RUNTIME_CONFIG_SNAPSHOT = 'runtime_config';
const PLUGIN_ROOT = path.resolve(__PATH.data_path, '..', '..');
const YUNZAI_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');
const ROOT_DATA_PATH = path.join(PLUGIN_ROOT, 'data');
const XIUXIAN_CONFIG_PATH = path.join(PLUGIN_ROOT, 'config', 'xiuxian');
const ANNOUNCE_GROUPS_PATH = path.join(YUNZAI_ROOT, 'config', 'announceGroups.json');
const REDIS_KEY_PATTERNS = [
  'xiuxian:*',
  'Xiuxian:*',
  'tianjiao:*',
  'yuanshen:*',
  'shenyou:*',
  'wuxiangta:*',
  'xutian:*',
  'zhutianxiuxian1.0:*',
  'zhutianxiuxian1.0Record*',
  'guiyishizu*',
  'gaoyuan',
  'jueling_loss:*',
  'jueling_loss_immune:*',
  'tianjige2:*',
];

async function listBackupRedisKeys() {
  const keyLists = await Promise.all(REDIS_KEY_PATTERNS.map(pattern => redis.keys(pattern)));
  return [...new Set(keyLists.flat())];
}

async function readRedisSnapshot() {
  const snapshot = {};
  const keys = await listBackupRedisKeys();

  for (const key of keys) {
    const type = await redis.type(key);
    const ttl = await redis.ttl(key);
    const expiresAt = ttl >= 0 ? Date.now() + ttl * 1000 : null;
    let value;

    switch (type) {
      case 'string': value = await redis.get(key); break;
      case 'set': value = await redis.sMembers(key); break;
      case 'hash': value = await redis.hGetAll(key); break;
      case 'list': value = await redis.lRange(key, 0, -1); break;
      case 'zset': value = await redis.zRangeWithScores(key, 0, -1); break;
      default:
        logger.warn(`[BackUp] Skipping unsupported Redis key type: ${type} (${key})`);
        continue;
    }

    snapshot[key] = { type, value, expiresAt };
  }

  return snapshot;
}

async function restoreRedisSnapshot(snapshot) {
  const entries = Object.values(snapshot);
  const legacySnapshot = entries.length > 0 && entries.every(Array.isArray);
  const currentKeys = legacySnapshot
    ? await redis.keys('xiuxian:*')
    : await listBackupRedisKeys();
  if (currentKeys.length) await Promise.all(currentKeys.map(key => redis.del(key)));

  for (const [key, entry] of Object.entries(snapshot)) {
    const legacyEntry = Array.isArray(entry);
    const type = legacyEntry ? entry[0] : entry.type;
    const value = legacyEntry ? entry[1] : entry.value;
    const ttl = legacyEntry || !entry.expiresAt
      ? null
      : Math.floor((entry.expiresAt - Date.now()) / 1000);

    if (ttl !== null && ttl <= 0) continue;

    switch (type) {
      case 'string': if (value !== null && value !== undefined) await redis.set(key, value); break;
      case 'set': if (Array.isArray(value) && value.length) await redis.sAdd(key, value); break;
      case 'hash': if (value && Object.keys(value).length) await redis.hSet(key, value); break;
      case 'list': if (Array.isArray(value) && value.length) await redis.rPush(key, value); break;
      case 'zset': if (Array.isArray(value) && value.length) await redis.zAdd(key, value); break;
      default:
        logger.warn(`[BackUp] Skipping unsupported Redis snapshot type: ${type} (${key})`);
        continue;
    }

    if (ttl !== null) await redis.expire(key, ttl);
  }
}

export class BackUp extends plugin {
  constructor() {
    super({
      name: 'BackUp',
      dsc: '存档备份',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: '^#备份存档$',
          fnc: 'saveBackUp',
        },
        {
          reg: '^#存档列表$',
          fnc: 'checkBackUp',
        },
        {
          reg: '^#读取存档(.*)',
          fnc: 'loadBackUp',
        },
        {
          reg: '^#回溯玩家(练气|纳戒|练气/纳戒)存档',
          fnc: 'rollbackPlayerArchive',
        },
      ],
    });
    this.saving = false;
    this.task = {
      cron: config.getConfig('task', 'task').AutoBackUpTask,
      name: '修仙备份存档Task',
      fnc: () => this.saveBackUp(),
    };
  }

  async saveBackUp(e, cleanOld = true) {
    let opentime = new Date().getTime();
    let pendingFolder = '';
    if (e) {
      const masterList = config.getConfig('xiuxian', 'xiuxian').Master || [];
      const userQQ = e.user_id.toString().replace('qg_', '');
      if (!e.isMaster && !masterList.includes(userQQ)) {
        e.reply('只有主人可以执行操作');
        return false;
      }
    }
    try {
      logger.info("修仙：备份存档");
      await e?.reply('开始备份喵~');

      // redis备份
      const redisObj = await readRedisSnapshot();

      // 检查备份目录
      if (!fs.existsSync(__PATH.backup)) {
        fs.mkdirSync(__PATH.backup, { recursive: true });
      }

      const nowTimeStamp = Date.now();
      const saveFolder = `${__PATH.backup}/${nowTimeStamp}`;
      pendingFolder = `${saveFolder}.tmp`;
      if (fs.existsSync(saveFolder) || fs.existsSync(pendingFolder)) {
        e?.reply('备份目录已存在，可能是系统时间问题');
        return false;
      }
      fs.mkdirSync(pendingFolder);

      // Keep a recursive snapshot so nested directories and root-level data files are included.
      await fs.promises.cp(__PATH.data_path, path.join(pendingFolder, FULL_DATA_SNAPSHOT), {
        recursive: true,
        force: true,
      });

      // 仙古秘境配置等数据位于插件根 data 目录，不在 resources/data 快照中。
      if (fs.existsSync(ROOT_DATA_PATH)) {
        await fs.promises.cp(ROOT_DATA_PATH, path.join(pendingFolder, ROOT_DATA_SNAPSHOT), {
          recursive: true,
          force: true,
        });
      }

      // 纪元进度会写入 config/xiuxian；公告群是另一个运行时配置文件。
      const runtimeConfigSnapshot = path.join(pendingFolder, RUNTIME_CONFIG_SNAPSHOT);
      fs.mkdirSync(runtimeConfigSnapshot, { recursive: true });
      if (fs.existsSync(XIUXIAN_CONFIG_PATH)) {
        await fs.promises.cp(XIUXIAN_CONFIG_PATH, path.join(runtimeConfigSnapshot, 'xiuxian'), {
          recursive: true,
          force: true,
        });
      }
      if (fs.existsSync(ANNOUNCE_GROUPS_PATH)) {
        fs.copyFileSync(ANNOUNCE_GROUPS_PATH, path.join(runtimeConfigSnapshot, 'announceGroups.json'));
      }

      // 显式备份小世界列表（xiaoshijie.js 运行时写入 resources/data/item/小世界列表.json），
      // 独立落一份在备份根目录，兼容旧格式备份点与 data 快照双保险
      const xiaoshijieListSrc = path.join(__PATH.lib_path, '小世界列表.json');
      if (fs.existsSync(xiaoshijieListSrc)) {
        fs.copyFileSync(xiaoshijieListSrc, `${pendingFolder}/xiaoshijie_list.json`);
      }

      // 写入redis备份
      fs.writeFileSync(`${pendingFolder}/redis.json`, JSON.stringify(redisObj));
      fs.renameSync(pendingFolder, saveFolder);
      pendingFolder = '';

      // 清理旧备份，仅保留最近 KEEP_BACKUP_COUNT 份
      if (cleanOld) await this.cleanOldBackups(KEEP_BACKUP_COUNT);

      const timeStr = this.getTimeStr(nowTimeStamp);
      e?.reply(`存档备份成功喵~\n${timeStr}`);
      console.log("备份存档耗时：", new Date().getTime() - opentime);

      return true;
    } catch (err) {
      if (pendingFolder) fs.rmSync(pendingFolder, { recursive: true, force: true });
      e?.reply(`备份失败惹喵...\n${err.message}`);
      logger.error('备份存档出错:', err);
      return false;
    }
  }

  async checkBackUp(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      e.reply('只有主人可以执行操作');
      return false;
    }
    try {
      let backUpList = fs.readdirSync(__PATH.backup).filter(folderName => {
        const stat = fs.statSync(`${__PATH.backup}/${folderName}`);
        return folderName === `${Number(folderName)}` && stat.isDirectory();
      }).sort((a, b) => Number(b) - Number(a)); // 按时间倒序排序

      if (backUpList.length > 80) backUpList = backUpList.slice(0, 80);

      const messageList = backUpList.map((folder, index) => ({
        message: `${index + 1}：${this.getTimeStr(folder)}${
          fs.existsSync(path.join(__PATH.backup, folder, FULL_DATA_SNAPSHOT))
            ? ''
            : ' [旧格式：不含小世界/内景地/位面]'
        }`,
        nickname: Bot.nickname,
        user_id: Bot.uin,
      }));

      if (messageList.length === 0) {
        e.reply('暂无存档备份');
        return false;
      }

      e.reply(await Bot.makeForwardMsg(messageList));
      return false;
    } catch (err) {
      await e.reply(`查看存档列表失败，${err.message}`);
      logger.error('查看存档列表出错:', err);
      return false;
    }
  }

  async loadBackUp(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      e.reply('只有主人可以执行操作');
      return false;
    }

    const saveDataNum = Number(e.msg.replace('#读取存档', '').trim());
    if (isNaN(saveDataNum) || saveDataNum < 1 || saveDataNum > 80) {
      e.reply('正确格式：#读取存档[1~80]\n如：#读取存档18');
      return false;
    }

    try {
      let backUpList = fs.readdirSync(__PATH.backup).filter(folderName => {
        const stat = fs.statSync(`${__PATH.backup}/${folderName}`);
        return folderName === `${Number(folderName)}` && stat.isDirectory();
      }).sort((a, b) => Number(b) - Number(a));

      if (backUpList.length > 80) backUpList = backUpList.slice(0, 80);
      if (saveDataNum > backUpList.length) {
        e.reply('该存档不存在');
        return false;
      }

      const backUpPath = `${__PATH.backup}/${backUpList[saveDataNum - 1]}`;
      if (!fs.existsSync(backUpPath)) {
        e.reply('该存档已损坏');
        return false;
      }
      if (!fs.existsSync(path.join(backUpPath, FULL_DATA_SNAPSHOT))) {
        await e.reply('警告：这是旧格式存档，不含小世界、内景地、位面及位面事件，只会回滚当时已备份的基础数据。');
      }

      await e.reply('正在自动备份当前存档...');
      if (!await this.saveBackUp(e, false)) {
        await e.reply('当前存档备份失败，已中止读取，避免无法回退。');
        return false;
      }
      await e.reply('开始读取存档...');

      const fullDataSnapshot = path.join(backUpPath, FULL_DATA_SNAPSHOT);
      if (fs.existsSync(fullDataSnapshot)) {
        await fs.promises.rm(__PATH.data_path, { recursive: true, force: true });
        await fs.promises.cp(fullDataSnapshot, __PATH.data_path, {
          recursive: true,
          force: true,
        });
      }

      const rootDataSnapshot = path.join(backUpPath, ROOT_DATA_SNAPSHOT);
      if (fs.existsSync(rootDataSnapshot)) {
        await fs.promises.rm(ROOT_DATA_PATH, { recursive: true, force: true });
        await fs.promises.cp(rootDataSnapshot, ROOT_DATA_PATH, {
          recursive: true,
          force: true,
        });
      }

      const runtimeConfigSnapshot = path.join(backUpPath, RUNTIME_CONFIG_SNAPSHOT);
      if (fs.existsSync(runtimeConfigSnapshot)) {
        const xiuxianConfigSnapshot = path.join(runtimeConfigSnapshot, 'xiuxian');
        if (fs.existsSync(xiuxianConfigSnapshot)) {
          await fs.promises.rm(XIUXIAN_CONFIG_PATH, { recursive: true, force: true });
          await fs.promises.cp(xiuxianConfigSnapshot, XIUXIAN_CONFIG_PATH, {
            recursive: true,
            force: true,
          });
        }

        const announceGroupsSnapshot = path.join(runtimeConfigSnapshot, 'announceGroups.json');
        await fs.promises.rm(ANNOUNCE_GROUPS_PATH, { force: true });
        if (fs.existsSync(announceGroupsSnapshot)) {
          fs.mkdirSync(path.dirname(ANNOUNCE_GROUPS_PATH), { recursive: true });
          fs.copyFileSync(announceGroupsSnapshot, ANNOUNCE_GROUPS_PATH);
        }
      }

      const needLoad = [
        'player_path', 'najie_path', 'equipment_path', 'danyao_path',
        'association', 'Exchange', 'qinmidu', 'duanlu', 'shitu', 'tiandibang',
        'custom', 'shop', 'temp_path', 'renwu', 'mijing', 'inner_world_path'
      ].filter(key => __PATH[key]); // 过滤不存在的路径

      // 读取备份数据
      const backupData = {};
      for (const key of needLoad) {
        const backupDir = `${backUpPath}/${key}`;
        if (!fs.existsSync(backupDir)) continue;

        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
        backupData[key] = {
          files: files,
          contents: await Promise.all(
            files.map(file => fs.promises.readFile(`${backupDir}/${file}`, 'utf8'))
          )
        };
      }

      // 恢复数据
      const restoreTasks = [];
      for (const key of needLoad) {
        if (!backupData[key]) continue;

        // 清空原目录
        const originalDir = __PATH[key];
        const originalFiles = fs.readdirSync(originalDir).filter(f => f.endsWith('.json'));
        for (const file of originalFiles) {
          restoreTasks.push(fs.promises.unlink(`${originalDir}/${file}`));
        }

        // 写入备份数据
        for (let i = 0; i < backupData[key].files.length; i++) {
          restoreTasks.push(
            fs.promises.writeFile(
              `${originalDir}/${backupData[key].files[i]}`,
              backupData[key].contents[i]
            )
          );
        }
      }

      // 恢复redis数据
      const redisBackupPath = `${backUpPath}/redis.json`;
      if (fs.existsSync(redisBackupPath)) {
        const redisData = JSON.parse(fs.readFileSync(redisBackupPath, 'utf8'));
        await restoreRedisSnapshot(redisData);
      }

      // 恢复小世界列表（xiaoshijie_list.json，独立备份文件；新备份的 data 快照内亦含同名文件，此处再覆盖一次保持一致）
      const xiaoshijieListBackup = `${backUpPath}/xiaoshijie_list.json`;
      if (fs.existsSync(xiaoshijieListBackup)) {
        const xiaoshijieListDst = path.join(__PATH.lib_path, '小世界列表.json');
        fs.mkdirSync(__PATH.lib_path, { recursive: true });
        fs.copyFileSync(xiaoshijieListBackup, xiaoshijieListDst);
      }

      await Promise.all(restoreTasks);
      // XiuxianData caches small worlds, plane bosses, custom sutras and pets at startup.
      data.ensureDirsExist();
      await this.cleanOldBackups(KEEP_BACKUP_COUNT);
      const timeStr = this.getTimeStr(backUpList[saveDataNum - 1]);
      e.reply(`存档已读取：${timeStr}\n配置与定时任务将在重启机器人后完全生效。`);

      return false;
    } catch (err) {
      e.reply(`读取失败，${err.message}`);
      logger.error('读取存档出错:', err);
      return false;
    }
  }
  // ============ 单玩家·单维度存档回溯 ============
  // 指令：
  //   #回溯玩家练气存档@玩家 [序号]        -> 仅回溯练气（修行）存档
  //   #回溯玩家纳戒存档@玩家 [序号]        -> 仅回溯纳戒存档
  //   #回溯玩家练气/纳戒存档@玩家 [序号]    -> 同时回溯两者
  // 序号对应 #存档列表（倒序，1=最新），缺省为最新一份
  async rollbackPlayerArchive(e) {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      e.reply('只有主人可以执行操作');
      return false;
    }

    // 1. 解析维度（练气 / 纳戒 / 练气/纳戒）
    const dimMatch = e.msg.match(/^#回溯玩家(练气|纳戒|练气\/纳戒)存档/);
    if (!dimMatch) return false;
    const dim = dimMatch[1];

    // 2. 解析目标 QQ（@ 优先：CQ at 消息 > 裸 @数字）
    let targetQQ = '';
    const atItem = e.message?.find(item => item.type === 'at');
    if (atItem?.qq) {
      targetQQ = atItem.qq.toString().replace('qg_', '');
    }
    if (!targetQQ) {
      const atMatch = e.msg.match(/@(\d+)/);
      if (atMatch) targetQQ = atMatch[1];
    }
    if (!targetQQ) {
      e.reply([
        '请指定目标玩家：',
        '#回溯玩家练气存档@玩家 [序号]',
        '#回溯玩家纳戒存档@玩家 [序号]',
        '#回溯玩家练气/纳戒存档@玩家 [序号]',
        '（序号对应 #存档列表，缺省为最新一份）',
      ].join('\n'));
      return false;
    }
    targetQQ = await channel(targetQQ);
    if (!await existplayer(targetQQ)) {
      e.reply('目标玩家不存在于诸天万界中');
      return false;
    }

    // 3. 解析序号（去掉指令前缀与 @ 部分，剩余数字；缺省=1 最新）
    const indexStr = e.msg
      .replace(/^#回溯玩家(练气|纳戒|练气\/纳戒)存档/, '')
      .replace(/\[CQ:at,qq=\d+\]/, '')
      .replace(/@\d+/, '')
      .replace(/\s/g, '')
      .trim();
    const saveDataNum = indexStr ? Number(indexStr) : 1;

    // 4. 取得备份点列表（倒序，1=最新）
    let backUpList = [];
    try {
      backUpList = fs.readdirSync(__PATH.backup).filter(folderName => {
        const stat = fs.statSync(`${__PATH.backup}/${folderName}`);
        return folderName === `${Number(folderName)}` && stat.isDirectory();
      }).sort((a, b) => Number(b) - Number(a));
    } catch (err) {
      e.reply('读取备份目录失败：' + err.message);
      return false;
    }
    if (backUpList.length > 80) backUpList = backUpList.slice(0, 80);
    if (isNaN(saveDataNum) || saveDataNum < 1 || saveDataNum > backUpList.length) {
      e.reply(`该存档不存在（当前共 ${backUpList.length} 份，可用 #存档列表 查看）`);
      return false;
    }
    const backUpPath = `${__PATH.backup}/${backUpList[saveDataNum - 1]}`;
    if (!fs.existsSync(backUpPath)) {
      e.reply('该存档已损坏');
      return false;
    }

    // 5. 维度 -> 路径键
    const dimMap = {
      '练气': ['player_path'],
      '纳戒': ['najie_path'],
      '练气/纳戒': ['player_path', 'najie_path'],
    };
    const keys = dimMap[dim] || ['player_path'];
    const labelMap = {
      player_path: '练气（修行）',
      najie_path: '纳戒',
    };

    try {
      // 6. 回溯前，先为该玩家做轻量回滚备份，保证可逆（不污染 #存档列表）
      const rbDir = `${__PATH.backup}/rollback_${Date.now()}`;
      fs.mkdirSync(`${rbDir}/player_path`, { recursive: true });
      fs.mkdirSync(`${rbDir}/najie_path`, { recursive: true });
      const curPlayer = `${__PATH.player_path}/${targetQQ}.json`;
      const curNajie = `${__PATH.najie_path}/${targetQQ}.json`;
      if (fs.existsSync(curPlayer)) fs.copyFileSync(curPlayer, `${rbDir}/player_path/${targetQQ}.json`);
      if (fs.existsSync(curNajie)) fs.copyFileSync(curNajie, `${rbDir}/najie_path/${targetQQ}.json`);

      // 仅保留最近 5 份回滚备份，避免无限增长
      const rbDirs = fs.readdirSync(__PATH.backup)
        .filter(n => n.startsWith('rollback_'))
        .sort();
      while (rbDirs.length > 5) {
        const old = rbDirs.shift();
        fs.rmSync(`${__PATH.backup}/${old}`, { recursive: true, force: true });
      }

      // 7. 单玩家·单维度覆盖恢复
      const restored = [];
      for (const key of keys) {
        const src = `${backUpPath}/${key}/${targetQQ}.json`;
        if (!fs.existsSync(src)) {
          e.reply(`该玩家在此备份点无【${labelMap[key]}】存档，已跳过`);
          continue;
        }
        const dst = `${__PATH[key]}/${targetQQ}.json`;
        fs.copyFileSync(src, dst);
        restored.push(labelMap[key]);
      }

      if (restored.length === 0) {
        e.reply('回溯已完成，但没有任何维度被恢复（目标备份点不含该玩家对应数据）');
        return false;
      }

      const timeStr = this.getTimeStr(backUpList[saveDataNum - 1]);
      const playerName = (await Read_player(targetQQ)).名号 || targetQQ;
      e.reply([
        '【回溯·单兵档案】',
        `目标：${playerName}`,
        `已将【${restored.join('、')}】存档回溯至：${timeStr}`,
        '（回溯前已自动留档，可凭 rollback_ 备份回退）',
      ].join('\n'));
      return false;
    } catch (err) {
      e.reply('回溯失败，' + err.message);
      logger.error('回溯玩家存档出错:', err);
      return false;
    }
  }

  getTimeStr(timeStamp) {
    return new Date(Number(timeStamp)).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * 自动备份清理：仅保留最近 KEEP_BACKUP_COUNT 份，超出的删除最旧的
   * 备份目录以毫秒时间戳命名，升序排序后末尾为最新
   */
  async cleanOldBackups(keepCount = KEEP_BACKUP_COUNT) {
    try {
      const backupDir = __PATH.backup;
      if (!fs.existsSync(backupDir)) return;
      const folders = fs.readdirSync(backupDir).filter(name => {
        const stat = fs.statSync(`${backupDir}/${name}`);
        return name === `${Number(name)}` && stat.isDirectory();
      }).sort((a, b) => Number(a) - Number(b)); // 升序：旧的在前
      if (folders.length <= keepCount) return;
      const toDelete = folders.slice(0, folders.length - keepCount);
      for (const f of toDelete) {
        fs.rmSync(`${backupDir}/${f}`, { recursive: true, force: true });
      }
      logger.info(`修仙：清理旧备份 ${toDelete.length} 份，保留最新 ${keepCount} 份`);
    } catch (err) {
      logger.error('清理旧备份出错:', err);
    }
  }

}
