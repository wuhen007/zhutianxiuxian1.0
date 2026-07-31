// 仙遗宝地 · 寿元耗尽遗留秘境
// 由 ZhuanshiTask.checkRelicConversion 在「掉落 12h 无人捡 + 死者筑基以上」时调用 createFromDrop 生成。
// 玩家可用 #仙遗宝地 查看、#探索仙遗宝地 序号 探索、#收取仙遗宝地 序号 收取已发现之物。

import { plugin, config } from '../../api/api.js';
import {
  existplayer,
  Read_player,
  Write_player,
  Read_najie,
  Write_najie,
} from '../../model/xiuxian.js';
import { mergeNajieContents, NAJIE_CATEGORIES } from '../../model/najieMerge.js';
import {
  acquireRedisLock,
  commitClaimWithRollback,
  migrateDropToBaodi,
  releaseRedisLock,
} from './xianyiBaodiState.js';

const BAODI_PREFIX = 'xiuxian:xianyi_baodi:';
const BAODI_INDEX = 'xiuxian:xianyi_baodi_index';
const EXPLORE_COOLDOWN_MS = 10 * 60 * 1000;          // 探索冷却 10 分钟
const RELIC_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;    // 仙遗宝地存续 30 天
const BAODI_LOCK_TTL_SECONDS = 60;
const DROP_INDEX = 'xiuxian:najie_drop_index';

// ==================== 工具函数 ====================
function emptyNajie() {
  const n = { 灵石: 0, 源石: 0 };
  for (const cat of NAJIE_CATEGORIES) n[cat] = [];
  return n;
}

function isNajieEmpty(n) {
  if (!n) return true;
  if ((n.灵石 || 0) > 0) return false;
  if ((n.源石 || 0) > 0) return false;
  for (const cat of NAJIE_CATEGORIES) {
    if (Array.isArray(n[cat]) && n[cat].length > 0) return false;
  }
  return true;
}

function countItems(n) {
  if (!n) return 0;
  let c = 0;
  if ((n.灵石 || 0) > 0) c += 1;
  if ((n.源石 || 0) > 0) c += 1;
  for (const cat of NAJIE_CATEGORIES) {
    if (Array.isArray(n[cat])) c += n[cat].length;
  }
  return c;
}

function computeBaodiValue(n) {
  if (!n) return 0;
  let v = (n.灵石 || 0) + (n.源石 || 0) * 10000;
  for (const cat of NAJIE_CATEGORIES) {
    if (Array.isArray(n[cat])) v += n[cat].length * 100;
  }
  return v;
}

function formatMoved(n) {
  const parts = [];
  if (n.灵石 > 0) parts.push(`灵石×${n.灵石}`);
  if (n.源石 > 0) parts.push(`源石×${n.源石}`);
  for (const cat of NAJIE_CATEGORIES) {
    const arr = n[cat];
    if (Array.isArray(arr) && arr.length) {
      const names = arr.slice(0, 5).map(i => i?.name || '?').join('、');
      const more = arr.length > 5 ? ` 等${arr.length}件` : '';
      parts.push(`${cat}：${names}${more}`);
    }
  }
  return parts.length ? parts.join('\n') : '（空）';
}

// 从 loot 按比例搬运一批道具到 discovered（就地修改两者）
function moveBatch(loot, discovered, fraction) {
  const moved = emptyNajie();
  const lf = Math.floor((loot.灵石 || 0) * fraction);
  if (lf > 0) { discovered.灵石 += lf; loot.灵石 -= lf; moved.灵石 = lf; }
  const yf = Math.floor((loot.源石 || 0) * fraction);
  if (yf > 0) { discovered.源石 += yf; loot.源石 -= yf; moved.源石 = yf; }
  for (const cat of NAJIE_CATEGORIES) {
    const arr = loot[cat];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const take = Math.max(1, Math.ceil(arr.length * fraction));
    const sliced = arr.splice(0, take);
    discovered[cat] = (discovered[cat] || []).concat(sliced);
    moved[cat] = sliced;
  }
  return moved;
}

// ==================== 存储 ====================
async function saveBaodi(baodi) {
  const key = BAODI_PREFIX + baodi.id;
  const remain = Math.max(60, Math.floor((baodi.expireAt - Date.now()) / 1000));
  await redis.set(key, JSON.stringify(baodi), { EX: remain });
}

async function deleteBaodi(baodi) {
  if (!baodi || !baodi.id) return;
  const key = BAODI_PREFIX + baodi.id;
  await redis.multi()
    .del(key)
    .zRem(BAODI_INDEX, key)
    .exec();
}

async function getBaodiList() {
  const now = Date.now();
  const keys = await redis.zRange(BAODI_INDEX, 0, -1);
  const out = [];
  for (const key of keys) {
    try {
      const raw = await redis.get(key);
      if (!raw) { await redis.zRem(BAODI_INDEX, key); continue; }
      const b = JSON.parse(raw);
      if (!b || (b.expireAt && b.expireAt < now)) {
        await deleteBaodi(b || { id: key.replace(BAODI_PREFIX, '') });
        continue;
      }
      out.push(b);
    } catch (e) {
      console.error('[仙遗宝地] 读取失败:', e.message);
    }
  }
  out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return out;
}

async function getBaodiByIndex(idx) {
  const list = await getBaodiList();
  return list[idx - 1] || null;
}

async function getBaodiById(id) {
  const raw = await redis.get(BAODI_PREFIX + id);
  if (!raw) return null;

  const baodi = JSON.parse(raw);
  if (baodi.expireAt && baodi.expireAt < Date.now()) {
    await deleteBaodi(baodi);
    return null;
  }
  return baodi;
}

// ==================== 对外入口：由 ZhuanshiTask 调用 ====================
export async function createFromDrop(drop) {
  if (!drop?.player_id || !drop?.key) return null;

  const id = `baodi_${drop.player_id}_${drop.createTime || Date.now()}`;
  const baodi = {
    id,
    owner_name: drop.player_name || '无名修士',
    owner_level_id: drop.player_level_id || 0,
    owner_qq: drop.player_id,
    location_name: drop.location?.weimianName || '未知位面',
    loot: drop.najie || emptyNajie(),
    discovered: emptyNajie(),
    explorers: {},
    createdAt: Date.now(),
    expireAt: Date.now() + RELIC_EXPIRE_MS,
  };

  return migrateDropToBaodi(redis, {
    baodiKey: BAODI_PREFIX + id,
    baodiIndexKey: BAODI_INDEX,
    dropKey: drop.key,
    dropIndexKey: DROP_INDEX,
    baodi,
    ttlSeconds: Math.floor(RELIC_EXPIRE_MS / 1000),
  });
}

// ==================== 玩家命令 ====================
export class XianyiBaodi extends plugin {
  constructor() {
    super({
      name: 'XianyiBaodi',
      dsc: '仙遗宝地·寿元耗尽遗留秘境',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#仙遗宝地$', fnc: 'listBaodi' },
        { reg: '^#探索仙遗宝地\\s*(\\d+)$', fnc: 'exploreBaodi' },
        { reg: '^#收取仙遗宝地\\s*(\\d+)$', fnc: 'claimBaodi' },
      ],
    });
  }

  async listBaodi(e) {
    try {
      const list = await getBaodiList();
      if (!list.length) {
        return e.reply('【仙遗宝地】\n当前诸天之中暂无现世的仙遗宝地。');
      }
      const lines = ['【仙遗宝地·诸天现世】', `共 ${list.length} 座可供探索：`, ''];
      list.forEach((b, i) => {
        lines.push(`▶ ${i + 1}. ${b.owner_name}的仙遗宝地`);
        lines.push(`   原主境界：第${b.owner_level_id}层 | 来源位面：${b.location_name}`);
        lines.push(`   预估价值：${computeBaodiValue(b.loot)} | 已探索进度：${countItems(b.discovered)}/${countItems(b.loot)}`);
        lines.push(`   探索人数：${Object.keys(b.explorers || {}).length}`);
        lines.push('');
      });
      lines.push('使用 #探索仙遗宝地 序号 探索，#收取仙遗宝地 序号 收取已发现之物。');
      return e.reply(lines.join('\n'));
    } catch (err) {
      console.error('[仙遗宝地] 列表失败:', err);
      return e.reply('查看仙遗宝地失败。');
    }
  }

  async exploreBaodi(e) {
    let lockKey = null;
    let lockToken = null;
    let locked = false;

    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      if (!await existplayer(usr_qq)) {
        return e.reply('道友尚未开始修仙，无法探索仙遗宝地。');
      }
      const match = e.msg.match(/^#探索仙遗宝地\s*(\d+)$/);
      const idx = parseInt(match[1], 10);
      const listedBaodi = await getBaodiByIndex(idx);
      if (!listedBaodi) {
        return e.reply('未找到对应的仙遗宝地，请先用 #仙遗宝地 查看序号。');
      }

      lockKey = `xiuxian:lock:xianyi_baodi:${listedBaodi.id}`;
      lockToken = `${usr_qq}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      locked = await acquireRedisLock(redis, lockKey, lockToken, BAODI_LOCK_TTL_SECONDS);
      if (!locked) {
        return e.reply('该仙遗宝地正在被其他道友探索或收取，请稍后重试。');
      }

      const baodi = await getBaodiById(listedBaodi.id);
      if (!baodi) {
        return e.reply('该仙遗宝地已经消散，请重新查看列表。');
      }

      const now = Date.now();
      const last = baodi.explorers[usr_qq] || 0;
      if (now - last < EXPLORE_COOLDOWN_MS) {
        const remain = Math.ceil((EXPLORE_COOLDOWN_MS - (now - last)) / 60000);
        return e.reply(`探索需调息恢复，请 ${remain} 分钟后再来（探索冷却 ${EXPLORE_COOLDOWN_MS / 60000} 分钟）。`);
      }
      baodi.explorers[usr_qq] = now;

      const player = await Read_player(usr_qq);
      const r = Math.random();
      let resultMsg = '';

      if (r < 0.4) {
        const moved = moveBatch(baodi.loot, baodi.discovered, 0.25 + Math.random() * 0.2);
        resultMsg = `你于宝地中仔细搜寻，触碰到一缕残存的道韵，有所收获！\n发现：\n${formatMoved(moved)}`;
      } else if (r < 0.6) {
        // 守护残魂
        const guardian = (baodi.owner_level_id || 1) * 6000 * (0.8 + Math.random() * 0.4);
        const myPower = (player.攻击 || 0) + (player.防御 || 0) * 0.5 + (player.幸运 || 0) * 100;
        if (myPower >= guardian) {
          const moved = moveBatch(baodi.loot, baodi.discovered, 0.5 + Math.random() * 0.3);
          resultMsg = `宝地深处，一尊守护残魂裹挟煞气扑杀而来！\n你以无上法力将其镇压，夺得大批造化！\n发现：\n${formatMoved(moved)}`;
        } else {
          const loss = Math.floor((player.当前血量 || 1) * 0.3);
          player.当前血量 = Math.max(1, (player.当前血量 || 1) - loss);
          await Write_player(usr_qq, player);
          resultMsg = `宝地深处，一尊守护残魂裹挟煞气扑杀而来！\n你不敌其威，被震退，损耗气血 ${loss}（当前气血 ${player.当前血量}）。\n需尽快提升实力再来。`;
        }
      } else {
        resultMsg = `你于宝地中搜寻良久，却只见到满地尘埃，一无所获，只觉此地灵机深不可测。`;
      }

      await saveBaodi(baodi);
      return e.reply(
        `【仙遗宝地·探索】\n${resultMsg}\n\n` +
        `宝地：${baodi.owner_name}的仙遗宝地（第${baodi.owner_level_id}层）\n` +
        `已发现可收取：${countItems(baodi.discovered)} 件`
      );
    } catch (err) {
      console.error('[仙遗宝地] 探索失败:', err);
      return e.reply('探索仙遗宝地失败。');
    } finally {
      if (locked) {
        try {
          await releaseRedisLock(redis, lockKey, lockToken);
        } catch (err) {
          console.error('[仙遗宝地] 释放探索锁失败:', err);
        }
      }
    }
  }

  async claimBaodi(e) {
    let baodiLockKey = null;
    let pickerLockKey = null;
    let lockToken = null;
    let baodiLocked = false;
    let pickerLocked = false;

    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      if (!await existplayer(usr_qq)) {
        return e.reply('道友尚未开始修仙，无法收取。');
      }
      const match = e.msg.match(/^#收取仙遗宝地\s*(\d+)$/);
      const idx = parseInt(match[1], 10);
      const listedBaodi = await getBaodiByIndex(idx);
      if (!listedBaodi) {
        return e.reply('未找到对应的仙遗宝地。');
      }

      lockToken = `${usr_qq}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      baodiLockKey = `xiuxian:lock:xianyi_baodi:${listedBaodi.id}`;
      pickerLockKey = `xiuxian:lock:najie_pickup:${usr_qq}`;

      baodiLocked = await acquireRedisLock(
        redis,
        baodiLockKey,
        lockToken,
        BAODI_LOCK_TTL_SECONDS
      );
      if (!baodiLocked) {
        return e.reply('该仙遗宝地正在被其他道友探索或收取，请稍后重试。');
      }

      pickerLocked = await acquireRedisLock(
        redis,
        pickerLockKey,
        lockToken,
        BAODI_LOCK_TTL_SECONDS
      );
      if (!pickerLocked) {
        return e.reply('你的纳戒正在进行其他操作，请稍后重试。');
      }

      const baodi = await getBaodiById(listedBaodi.id);
      if (!baodi) {
        return e.reply('该仙遗宝地已经消散，请重新查看列表。');
      }
      if (isNajieEmpty(baodi.discovered)) {
        return e.reply('该仙遗宝地暂无可收取之物，先去 #探索仙遗宝地 吧。');
      }

      let myNajie;
      try {
        myNajie = await Read_najie(usr_qq);
      } catch (e) {
        if (e?.code !== 'ENOENT') throw e;
        myNajie = emptyNajie();
      }
      const claimed = JSON.parse(JSON.stringify(baodi.discovered));
      const merged = mergeNajieContents(myNajie, claimed);
      const summary = formatMoved(claimed);

      baodi.discovered = emptyNajie();
      const exhausted = isNajieEmpty(baodi.loot);
      await commitClaimWithRollback({
        originalNajie: myNajie,
        mergedNajie: merged,
        writeNajie: najie => Write_najie(usr_qq, najie),
        commitBaodi: () => exhausted ? deleteBaodi(baodi) : saveBaodi(baodi),
      });

      if (exhausted) {
        return e.reply(
          `【仙遗宝地·收取】\n你收取了全部造化：\n${summary}\n\n` +
          `宝地机缘已尽，秘境缓缓消散于虚空之中。`
        );
      }
      return e.reply(
        `【仙遗宝地·收取】\n你收取了部分造化：\n${summary}\n\n` +
        `宝地尚有遗藏，可继续探索。`
      );
    } catch (err) {
      console.error('[仙遗宝地] 收取失败:', err);
      return e.reply('收取仙遗宝地失败。');
    } finally {
      if (pickerLocked) {
        try {
          await releaseRedisLock(redis, pickerLockKey, lockToken);
        } catch (err) {
          console.error('[仙遗宝地] 释放纳戒锁失败:', err);
        }
      }
      if (baodiLocked) {
        try {
          await releaseRedisLock(redis, baodiLockKey, lockToken);
        } catch (err) {
          console.error('[仙遗宝地] 释放宝地锁失败:', err);
        }
      }
    }
  }
}
