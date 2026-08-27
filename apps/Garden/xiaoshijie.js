import { plugin, puppeteer, verc, data, config } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import Show from '../../model/show.js';
import { replyImageWithButtons } from '../../model/officialMessage.js';
import { calculateCropGrowthState } from './smallWorldGrowth.js';
import {
  pickSmallWorldPill,
} from './smallWorldAlchemy.js';
import {
  MAX_WORLD_ACCUMULATION_HOURS,
  calculateElapsedEventChance,
  calculateWorldAccumulation,
  settleResourceRemainders,
} from './smallWorldAccumulation.js';
import {
  SMALL_WORLD_GUARD_ENERGY_COST,
  SMALL_WORLD_STEAL_COOLDOWN_MS,
  calculateGuardInterceptChance,
  consumeGuardEnergy,
  getStealCooldownRemaining,
  isCropStealable,
  isWorldStealProtected,
  recordCropSteal,
} from './smallWorldSteal.js';
import { addInventoryPetVariant, findHabitatPetIndex } from '../Pokemon/habitatPetTransfer.js';
import { calculatePetCarePeriod, calculatePetEnergyPeriod } from './smallWorldPetEnergy.js';
import {
  WORKSHOP_LEVEL_EFFECTS,
  WORKSHOP_OUTPUTS,
  ensureWorkshopSupplies,
  getWorkshopUpgradeRequirement,
  upgradeWorkshop,
} from './smallWorldWorkshop.js';
import { WUDAO_TEA_ITEM, isWudaoTeaItem } from '../User/wudaoTea.js';
import {
  formatCooldown,
  getCooldownRemaining,
  getHabitatSlotBonus,
  getSmallWorldYieldMultiplier,
  hasEquippedInnateTreasure,
  startAuthorityCooldown,
} from '../../model/innateTreasure.js';
import {
  existplayer,
  Write_player,
  Write_equipment,
  exist_najie_thing,
  Add_najie_thing,
  Add_职业经验,
  Add_灵石,
  Add_源石,
  Read_equipment,
  sleep,
  ForwardMsg,
  convert2integer,
  Go,
  zd_battle,
  get_danfang_img,
  get_tuzhi_img,
  timestampToTime,
  get_log_img,
  channel,
  Add_修为,
  Add_血气,
  Read_najie,
  Write_najie
} from '../../model/xiuxian.js';
import { Read_player, __PATH, Read_danyao } from '../../model/xiuxian.js';
import {
  BAITIAN_TEMPLE_NAME,
  BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL,
  BAITIAN_TEMPLE_INTERVAL_HOURS,
  BAITIAN_TEMPLE_MAX_HOURS,
  BAITIAN_TEMPLE_SOURCE_PER_INTERVAL,
  BAITIAN_TEMPLE_SOURCE_COST,
  BAITIAN_TEMPLE_WORLD_STONE_COST,
  buildBaitianTemple,
  settleBaitianTemple,
} from '../../model/baitianTemple.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import {
  ascendSuperdimensionalStarRealm,
  hasShengfaPower,
  settleSuperdimensionalStarRealm,
} from '../../model/shengfaFragment.js';

const SMALL_WORLD_BUTTONS = [
  [
    { text: '收获资源', command: '#收获小世界资源', permission: false },
    { text: '小世界工坊', command: '#小世界工坊', permission: false },
  ],
  [
    { text: '一键种植', command: '#一键种植', permission: false },
    { text: '小世界守卫', command: '#小世界守卫', permission: false },
  ],
  [
    { text: '大宇宙', command: '#大宇宙', permission: false },
  ],
];

const WORLD_LEVELS = {
  1: {
    name: '混沌初开',
    attributes: {
      灵气浓度: 1000,
      面积: '十里方圆',
      时间流速: '1:1',
      特殊资源: [],
      药田上限: 1,
      栖息地上限: 1
    },
    requirements: {
      材料: { '世界石': 1 }
    }
  },
  2: {
    name: '鸿蒙小界',
    attributes: {
      灵气浓度: 3000,
      面积: '百里方圆',
      时间流速: '1:2',
      特殊资源: [],
      药田上限: 3,
      栖息地上限: 2
    },
    requirements: {
      材料: { '世界石': 3, '玄渊真水': 1, '元虚罡风': 1, '太初燧火': 1, '须弥神土': 1 }
    }
  },
  3: {
    name: '紫府洞天',
    attributes: {
      灵气浓度: 5000,
      面积: '千里方圆',
      时间流速: '1:3',
      特殊资源: [],
      药田上限: 5,
      栖息地上限: 3
    },
    requirements: {
      材料: { '世界石': 5, '造化玉碟': 1 }
    }
  },
  4: {
    name: '太虚仙境',
    attributes: {
      灵气浓度: 10000,
      面积: '万里山河',
      时间流速: '1:4',
      特殊资源: [],
      药田上限: 8,
      栖息地上限: 5
    },
    requirements: {
      材料: { '世界石': 10, '混沌母气': 10 }
    }
  },
  5: {
    name: '洪荒世界',
    attributes: {
      灵气浓度: 30000,
      面积: '十万里疆域',
      时间流速: '1:8',
      特殊资源: [],
      药田上限: 12,
      栖息地上限: 7
    },
    requirements: {
      材料: { '世界石': 20 }
    }
  }
};

// 品级产出倍率
const PINJI_RATE = { '仙胎': 1, '仙仔': 2, '仙兽': 3, '仙道': 4, '仙灵': 5 };

// 幸运仙宠稀有道具池
const LUCKY_REWARDS = [
  { name: '劫光令', class: '道具', weight: 5 },
  { name: '秘境之匙', class: '道具', weight: 20 },
  { name: '仙舟', class: '道具', weight: 15 },
  { name: '遣龙令', class: '道具', weight: 10 },
  { name: '仙兽玉', class: '道具', weight: 10 },
  { name: '世界石', class: '材料', weight: 25 },
  { name: '混沌母气', class: '材料', weight: 15 },
];

const TALISMAN_HERBS = ['定魂草', '固元花', '静心草', '聚灵藤', '灵墨汁', '轮回果'];

// 特殊资源池
const SPECIAL_RESOURCES = [
  '先天灵泉', '星辰矿脉', '混沌灵根', 
  '太初神木', '鸿蒙紫气', '大道金莲',
  '虚空晶石', '时间碎片', '生命古树'
];


const WORKSHOP_CONFIG = {
  '灵田': { compatible: ['修炼', '幸运'], desc: '照料灵植仙草', icon: '🌿' },
  '丹房': { compatible: ['炼丹'], desc: '炼制丹药灵散', icon: '🔥' },
  '器阁': { compatible: ['炼器'], desc: '锻造法宝神兵', icon: '🔨' },
  '符台': { compatible: ['制符'], desc: '绘制符箓阵纹', icon: '📜' },
  '矿脉': { compatible: ['战斗'], desc: '开采灵石矿藏', icon: '⛏️' }
};

// 默认工坊配置
const DEFAULT_WORKSHOPS = {
  '灵田': { level: 1, capacity: 1 },
  '丹房': { level: 1, capacity: 1 },
  '器阁': { level: 1, capacity: 1 },
  '符台': { level: 1, capacity: 1 },
  '矿脉': { level: 1, capacity: 1 }
};

// ══════════════════════════════════════
// ⚡ 仙宠特性系统
// ══════════════════════════════════════

// 特性池（正面 + 负面）
const PET_TRAITS = {
  '勤勉': { desc: '工作速度+30%，任劳任怨', workBonus: 1.3, energyCost: 1.0, attr: '正面' },
  '懒惰': { desc: '工作速度-20%，能偷懒就偷懒', workBonus: 0.8, energyCost: 1.0, attr: '负面' },
  '强韧': { desc: '精力消耗-50%，不知疲倦', workBonus: 1.0, energyCost: 0.5, attr: '正面' },
  '贪吃': { desc: '喂食效果+50%，胃口极好', feedBonus: 1.5, attr: '中性' },
  '聪慧': { desc: '有概率产出高品质额外收获', qualityBonus: 0.15, attr: '正面' },
  '神速': { desc: '产出速度+25%，事半功倍', workBonus: 1.25, energyCost: 1.0, attr: '正面' },
  '灵秀': { desc: '在灵田工作时产出+40%', workshopBonus: { '灵田': 1.4 }, attr: '正面' },
  '火灵': { desc: '在丹房工作时产出+40%', workshopBonus: { '丹房': 1.4 }, attr: '正面' },
  '金刚': { desc: '在矿脉工作时产出+40%', workshopBonus: { '矿脉': 1.4 }, attr: '正面' },
  '符心': { desc: '在符台工作时产出+40%', workshopBonus: { '符台': 1.4 }, attr: '正面' },
  '匠魂': { desc: '在器阁工作时产出+40%', workshopBonus: { '器阁': 1.4 }, attr: '正面' },
  '暴食': { desc: '精力消耗+30%，特别能吃', workBonus: 1.0, energyCost: 1.3, attr: '负面' }
};

// ══════════════════════════════════════
// 📝 工作状态文字描述模板
// ══════════════════════════════════════

// 工坊 × 精力区间 → 描述文本池
const WORK_DESCRIPTIONS = {
  '灵田': {
    high: [ // 精力 >= 30
      '{name}盘坐于灵田中，周身灵气化作旋涡，正吞吐天地精华…',
      '{name}轻挥爪间引动甘露洒落，灵药在雨露中以肉眼可见的速度生长…',
      '{name}在灵田中来回穿梭除草，每一株灵药都被照料得精神抖擞…'
    ],
    low: [ // 精力 10-29
      '{name}在灵田中缓慢挪动，时不时抬头喘口气…',
      '{name}动作明显慢了下来，但仍在坚持为灵药松土…',
      '{name}眼皮打架，手里的水壶差点掉进药田…'
    ],
    exhausted: [ // 精力 < 10
      '{name}几乎瘫在田埂上，有气无力地往灵药上洒了几滴水…',
      '{name}趴在灵田边睡着了，鼾声微起，灵药全靠天赋硬撑…',
      '{name}眼神涣散地盯着灵药，似乎在用意念浇灌…'
    ]
  },
  '丹房': {
    high: [
      '{name}在丹房内扇动炉火，一炉丹药已现雏形，额角渗出细密汗珠…',
      '{name}以天赋控火之术精准调节炉温，丹炉中溢出沁人心脾的药香…',
      '{name}一手投药一手掐诀，炼丹手法行云流水，丹炉嗡嗡作响…'
    ],
    low: [
      '{name}炉火忽明忽暗，扇风的手已经有些颤抖了…',
      '{name}擦了擦汗，强打起精神继续盯着炉内温度…',
      '{name}累得直打哈欠，差点把炼丹配方搞反…'
    ],
    exhausted: [
      '{name}靠在丹炉边打盹，炉火都快熄了自己也不知道…',
      '{name}有气无力地往炉里丢了一把药材，管他对不对…',
      '{name}趴在地上喃喃自语："再炼一炉…就一炉…"'
    ]
  },
  '器阁': {
    high: [
      '{name}挥舞重锤锻打着器胚，火花四溅中神兵雏形渐显…',
      '{name}一手执锤一手握钳，在铁砧前反复锤炼，器胚发出龙吟般的震颤…',
      '{name}在器阁中忙碌穿梭，淬火、打磨、铭纹一气呵成…'
    ],
    low: [
      '{name}锤子举起来放了三次才落下，累得连器胚都拿不稳…',
      '{name}对着铁砧发呆，手里的锤子越来越沉…',
      '{name}炼器炼到一半停下来揉腰，嘀咕道"老了老了"…'
    ],
    exhausted: [
      '{name}把锤子扔在一边，坐在地上喘粗气…',
      '{name}对着器胚闭眼念经，不知是在铭纹还是在祈祷…',
      '{name}已经分不清面前是铁还是饼，眼神完全涣散…'
    ]
  },
  '符台': {
    high: [
      '{name}运笔如飞蘸朱砂，符纸上勾勒出的阵纹散发着淡淡金光…',
      '{name}屏息凝神，笔尖游走间一道符箓已一气呵成…',
      '{name}左右手同时开弓，两张符箓同时完成，效率惊人…'
    ],
    low: [
      '{name}画符的手微微发抖，笔画开始有些歪歪扭扭…',
      '{name}对着符纸打了三个哈欠，墨都快干了还没下笔…',
      '{name}揉着酸痛的手腕，看着还剩一沓符纸叹了口气…'
    ],
    exhausted: [
      '{name}趴在符台上画符，画着画着变成了一团浆糊…',
      '{name}手抖得连朱砂都洒了，符纸上全是散乱的红点…',
      '{name}闭着眼瞎画，管它是符还是涂鸦…'
    ]
  },
  '矿脉': {
    high: [
      '{name}以利爪劈开矿脉，碎石飞溅中露出晶莹仙晶…',
      '{name}化出本相巨力凿山，矿脉入口不断有灵石被搬运出来…',
      '{name}在矿洞深处横冲直撞，所过之处矿石纷纷掉落…'
    ],
    low: [
      '{name}挖矿的速度明显慢了下来，时不时停下来擦汗…',
      '{name}砸了三锤才敲下一块灵石，喘着粗气继续…',
      '{name}坐在矿洞口休息，爪子上全是石屑…'
    ],
    exhausted: [
      '{name}靠在矿壁上睡着了，手里还握着一块没敲下来的灵石…',
      '{name}用头撞矿脉，不知道是在开采还是在自残…',
      '{name}瘫在矿洞里数天花板上的晶簇，一块都没采下来…'
    ]
  },
  '栖息地': {
    rest: [
      '{name}在栖息地中悠闲漫步，偶尔追逐一只灵蝶嬉戏…',
      '{name}懒洋洋地趴在溪边晒太阳，尾巴轻轻拍打着水面…',
      '{name}和几只小仙兽在草地上追逐打闹，玩得不亦乐乎…',
      '{name}蜷成一团舒舒服服地睡着，喉咙里发出满足的呼噜声…',
      '{name}在灵泉边大口喝水，不时抬头张望四周…'
    ]
  }
};

// 精疲力尽累倒描述
const COLLAPSE_MESSAGES = [
  '{name}终于撑不住了，累得一头栽倒，被仙童抬回了栖息地…',
  '{name}四肢一软倒在工作岗位上，四周的仙灵赶紧把它送回栖息地…',
  '{name}眼前一黑晕了过去，手中工具咣当落地…'
];

// 神药生长阶段配置（阶段不再含duration，仅用于展示剩余时间匹配）
// 阶段匹配规则：剩余时间百分比 >80%=阶段1，>60%=阶段2，>40%=阶段3，>20%=阶段4，≤20%=阶段5(即将成熟)
const SHENYAO_STAGES = {
  1: { name: "萌芽", desc: "种子破土而出，嫩芽初现" },
  2: { name: "幼苗", desc: "枝叶舒展，初具药形" },
  3: { name: "成长期", desc: "药株茁壮，散发神性光辉" },
  4: { name: "开花期", desc: "神花绽放，道韵流转" },
  5: { name: "成熟期", desc: "神药成熟，可采摘" }
};

// 神药种子配置
const SHENYAO_SEEDS = {
  "麒麟神药种子": {
    id: 900433,
    name: "麒麟神药种子",
    class: "草药",
    type: "神药种子",
    harvest: "麒麟神药",
    requirements: {
      灵气浓度: 3000,
      特殊环境: [ "仙泉"]
    }
  },
  "玄武神药种子": {
    id: 900433,
    name: "玄武神药种子",
    class: "草药",
    type: "神药种子",
    harvest: "玄武神药",
    requirements: {
      灵气浓度: 3000,
      特殊环境: [ "仙泉"]
    }
  },
  "蟠桃仙种": {
    id: 900433,
    name: "蟠桃仙种",
    class: "草药",
    type: "神药种子",
    harvest: "蟠桃仙果",
    requirements: {
      灵气浓度: 3000,
      特殊环境: [ "仙泉"]
    }
  },
  "真龙不死药种子": {
    id: 900434,
    name: "真龙不死药种子",
    class: "草药",
    type: "神药种子",
    harvest: "真龙不死药",
    requirements: {
      灵气浓度: 5000,
      特殊环境: ["龙穴"]
    }
  },
    "大夏神药种子": {
    id: 900434,
    name: "大夏神药种子",
    class: "草药",
    type: "神药种子",
    harvest: "大夏神药",
    requirements: {
      灵气浓度: 3000
    }
  },
  "九妙不死药种子": {
    id: 900435,
    name: "九妙不死药种子",
    class: "草药",
    type: "神药种子",
    harvest: "九妙不死药",
    requirements: {
      灵气浓度: 8000,
      特殊环境: ["仙坟"]
    }
  },
  "悟道古茶树幼苗": {
    id: 23001005,
     name: "悟道古茶树幼苗",
    class: "草药",
    type: "古茶树种子",
    harvest: WUDAO_TEA_ITEM,
    requirements: {
      灵气浓度: 10000,
      特殊环境: ["仙坟","仙泉"]
    }
  },
  "九转天药幼苗": {
    id: 900436,
    name: "九转天药幼苗",
    class: "草药",
    type: "神药种子",
    harvest: "九转天药",
    requirements: {
      灵气浓度: 12000,
      特殊环境: ["仙坟", "仙泉"]
    }
  }
};

// ══════════════════════════════════════
// 🔧 数据迁移函数
// ══════════════════════════════════════

// 迁移旧版小世界数据到新版（添加工坊、精力、特性字段）
function migrateWorldData(world) {
  let migrated = false;

  // 初始化工坊
  if (!world.工坊) {
    world.工坊 = JSON.parse(JSON.stringify(DEFAULT_WORKSHOPS));
    migrated = true;
  }
  if (!world.工坊物资 || typeof world.工坊物资 !== 'object') migrated = true;
  ensureWorkshopSupplies(world);

  // 迁移栖息地中的仙宠数据
  if (world.栖息地 && world.栖息地.length > 0) {
    for (const pet of world.栖息地) {
      if (pet.精力 === undefined) {
        pet.精力 = 100;
        pet.最大精力 = 100;
        migrated = true;
      }
      if (pet.工坊 === undefined) {
        pet.工坊 = null; // 默认在栖息地休息
        migrated = true;
      }
      // 清理旧版'兽栏'引用
      if (pet.工坊 === '兽栏') {
        pet.工坊 = null;
        migrated = true;
      }
      if (!pet.特性) {
        pet.特性 = [];
        migrated = true;
      }
      if (pet.累倒 === undefined) {
        pet.累倒 = false;
        migrated = true;
      }
      if (pet.守卫 === undefined) {
        pet.守卫 = false;
        migrated = true;
      }
      if (!Number.isFinite(Number(pet.作息进度))) {
        pet.作息进度 = 0;
        migrated = true;
      }
    }
  }

  return migrated;
}

async function collectBaitianTempleRewards(player_qq, world, now = new Date()) {
  if (!world?.败天神殿) return { cycles: 0, hours: 0, sourceStone: 0, insight: 0 };
  return withPlayerMutationLock(player_qq, async () => {
    const previousSettlement = world.败天神殿.上次结算时间;
    const rewards = settleBaitianTemple(world, now);
    if (!rewards.hours) {
      if (world.败天神殿.上次结算时间 !== previousSettlement) {
        try {
          fs.writeFileSync(path.join(data.lib_path, '小世界列表.json'), JSON.stringify(data.xiaoshijie, null, 2));
        } catch (error) {
          world.败天神殿.上次结算时间 = previousSettlement;
          throw error;
        }
      }
      return rewards;
    }

    const player = await Read_player(player_qq);
    player.源石 = Math.max(0, Number(player.源石) || 0) + rewards.sourceStone;
    player.功法感悟值 = Math.max(0, Number(player.功法感悟值) || 0) + rewards.insight;
    const worldFile = path.join(data.lib_path, '小世界列表.json');
    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, `${player_qq}.json`));
    transaction.capture(worldFile);
    try {
      await Write_player(player_qq, player);
      fs.writeFileSync(worldFile, JSON.stringify(data.xiaoshijie, null, 2));
      transaction.commit();
      return rewards;
    } catch (error) {
      transaction.rollback();
      world.败天神殿.上次结算时间 = previousSettlement;
      throw error;
    }
  });
}

// ══════════════════════════════════════
// 🔧 辅助计算函数
// ══════════════════════════════════════

// 计算仙宠在指定工坊的工作效率
function calculateWorkEfficiency(pet, workshop, world) {
  if (!pet || !workshop) return 1.0;

  // 基础倍率
  let efficiency = 1.0;

  // 类型匹配度
  const wsConfig = WORKSHOP_CONFIG[workshop];
  if (wsConfig) {
    if (wsConfig.compatible.includes(pet.type)) {
      efficiency *= 1.0; // 匹配
    } else {
      efficiency *= 0.5; // 不匹配
    }
  }

  // 工坊等级加成
  if (world && world.工坊 && world.工坊[workshop]) {
    const wsLevel = world.工坊[workshop].level || 1;
    const wsEffect = WORKSHOP_LEVEL_EFFECTS[wsLevel] || WORKSHOP_LEVEL_EFFECTS[1];
    efficiency *= wsEffect.outputBonus;
  }

  // 特性加成
  if (pet.特性 && pet.特性.length > 0) {
    for (const traitName of pet.特性) {
      const trait = PET_TRAITS[traitName];
      if (!trait) continue;
      // 通用工作加成
      if (trait.workBonus) efficiency *= trait.workBonus;
      // 特定工坊加成
      if (trait.workshopBonus && trait.workshopBonus[workshop]) {
        efficiency *= trait.workshopBonus[workshop];
      }
    }
  }

  return efficiency;
}

// 计算精力消耗（每小时）
function calculateEnergyCost(pet, workshop) {
  const baseCost = 4; // 每小时基础消耗
  let cost = baseCost;

  // 在栖息地休息：恢复精力
  if (!workshop) {
    return -8; // 栖息地每小时恢复8点精力
  }

  // 特性影响
  if (pet.特性 && pet.特性.length > 0) {
    for (const traitName of pet.特性) {
      const trait = PET_TRAITS[traitName];
      if (trait && trait.energyCost) cost *= trait.energyCost;
    }
  }

  return cost;
}

async function consumePetMeals(player_qq, world, resources, requiredMeals) {
  const supplies = ensureWorkshopSupplies(world);
  let remaining = Math.max(0, Math.floor(Number(requiredMeals) || 0)) + supplies.欠餐;
  const required = remaining;
  const consumed = {};
  const take = (name, available) => {
    const amount = Math.min(remaining, Math.max(0, Math.floor(Number(available) || 0)));
    if (amount > 0) {
      consumed[name] = (consumed[name] || 0) + amount;
      remaining -= amount;
    }
    return amount;
  };

  supplies.仙宠口粮 -= take('仙宠口粮', supplies.仙宠口粮);
  for (const name of ['仙馐果', '混沌元液']) {
    const amount = take(`本次产出·${name}`, resources[name]);
    resources[name] = Math.max(0, (Number(resources[name]) || 0) - amount);
  }

  const inventoryFoods = [
    ['五果', '仙宠口粮'], ['六斋', '仙宠口粮'], ['七荤', '仙宠口粮'], ['八素', '仙宠口粮'],
    ['月桂凝露', '仙宠口粮'], ['紫府灵参', '仙宠口粮'], ['天地琼浆', '仙宠口粮'],
    ['仙馐果', '食材'], ['混沌元液', '丹药'],
  ];
  for (const [name, itemClass] of inventoryFoods) {
    if (remaining <= 0) break;
    const count = Number(await exist_najie_thing(player_qq, name, itemClass)) || 0;
    const amount = take(`纳戒·${name}`, count);
    if (amount > 0) await Add_najie_thing(player_qq, name, itemClass, -amount);
  }
  supplies.欠餐 = remaining;

  return {
    required,
    fed: required - remaining,
    missing: remaining,
    efficiency: required > 0 ? (required - remaining) / required : 1,
    consumed,
  };
}

// 获取仙宠的工作状态描述
function getWorkDescription(pet, hoursWorked) {
  const petName = pet.name;
  const workshop = pet.工坊 || null;
  const energy = Number(pet.精力 ?? 100);

  // 在栖息地休息/玩耍
  if (!workshop) {
    const restPool = WORK_DESCRIPTIONS['栖息地'].rest;
    const msg = restPool[Math.floor(Math.random() * restPool.length)];
    return msg.replace(/\{name\}/g, petName);
  }

  // 有工坊：根据精力选择描述池
  const wsDesc = WORK_DESCRIPTIONS[workshop] || WORK_DESCRIPTIONS['矿脉'];
  let pool;
  if (energy >= 30) {
    pool = wsDesc.high;
  } else if (energy >= 10) {
    pool = wsDesc.low;
  } else if (energy > 0) {
    pool = wsDesc.exhausted;
  } else {
    // 精疲力尽累倒
    const collapseMsg = COLLAPSE_MESSAGES[Math.floor(Math.random() * COLLAPSE_MESSAGES.length)];
    return collapseMsg.replace(/\{name\}/g, petName);
  }

  const msg = pool[Math.floor(Math.random() * pool.length)];
  return msg.replace(/\{name\}/g, petName);
}

// 随机生成野生仙兽
function generateWildBeast() {
  const beastNames = [
    '赤瞳灵狐', '青鳞幼蛟', '金翅大鹏雏', '九尾仙猫', '玄甲龙龟',
    '紫电雷貂', '冰晶雪猿', '噬金仙蚁', '幻影灵蝶', '三足金乌雏',
    '碧水麒麟崽', '幽冥玄虎', '天音仙鹤', '噬灵古藤', '炎阳火凤雏'
  ];
  const types = ['战斗', '修炼', '炼丹', '炼器', '幸运', '制符'];
  const qualities = ['仙胎', '仙仔', '仙兽', '仙道', '仙灵'];
  const qualityWeights = [35, 30, 20, 10, 5]; // 权重分配

  // 按权重选择品级
  let totalW = qualityWeights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * totalW;
  let qualityIdx = 0;
  for (let i = 0; i < qualities.length; i++) {
    roll -= qualityWeights[i];
    if (roll <= 0) { qualityIdx = i; break; }
  }

  // 随机1-2个特性
  const allTraits = Object.keys(PET_TRAITS);
  const traitCount = Math.random() < 0.3 ? 2 : 1;
  const shuffled = [...allTraits].sort(() => Math.random() - 0.5);
  const traits = shuffled.slice(0, traitCount);

  return {
    name: beastNames[Math.floor(Math.random() * beastNames.length)],
    type: types[Math.floor(Math.random() * types.length)],
    品级: qualities[qualityIdx],
    特性: traits,
    hp: 100
  };
}

// 获取精力状态图标
function getEnergyIcon(energy) {
  if (energy >= 60) return '🟢';
  if (energy >= 30) return '🟡';
  if (energy > 0) return '🟠';
  return '🔴';
}

// 生成精力条文字
function getEnergyBar(current, max) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const barLen = 8;
  const filled = Math.round(ratio * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  return `[${bar}] ${current}/${max}`;
}

export class xiaoshijie extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_xiaoshijie',
      dsc: '小世界模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#开辟小世界 (.*)$',
          fnc: 'createSmallWorld'
        },
        {
          reg: '^#演化小世界$',
          fnc: 'upgradeSmallWorld'
        },
        {
          reg: '^#我的小世界$',
          fnc: 'viewSmallWorld'
        },
        {
          reg: '^#将分身化入小世界$',
          fnc: 'createAvatar'
        },
        {
          reg: '^#收获小世界资源$',
          fnc: 'harvestResources'
        },
        {
          reg: '^#(?:建立|建造)败天神殿$',
          fnc: 'buildBaitianTemple'
        },
        {
          reg: '^#图中巡游$',
          fnc: 'tourLandscape'
        },
        {
          reg: '^#小世界偷菜(?:.*)?$',
          fnc: 'stealSmallWorldCrop'
        },
        {
          reg: '^#设置仙宠守卫(.+?)$',
          fnc: 'setSmallWorldGuard'
        },
        {
          reg: '^#撤下仙宠守卫$',
          fnc: 'removeSmallWorldGuard'
        },
        {
          reg: '^#小世界守卫$',
          fnc: 'viewSmallWorldGuard'
        },
{
    reg: '^#使用(.*?)创造环境$',
    fnc: 'createEnvironmentWithItem'
},
{
    reg: '^#小世界栽种(.*?)$',
    fnc: 'plantShenyao'
},
{
    reg: '^#小世界种植(.*?)$',
    fnc: 'plantShenyao'
},
        {
  reg: '^#浇灌小世界作物$',
  fnc: 'forceRipenAllCrops', 
},
        {
  reg: '^#种植指南$',
  fnc: 'showPlantingHelp', 
},
{
  reg: '^#(?:使用|浇灌)?\\s*(草木精华露|岁月流金沙|掌天灵液)\\s*(?:催熟|浇灌)?\\s*(?:第)?(\\d+)(?:号)?(?:作物|药田)?$',
  fnc: 'forceRipenSingleCrop'
},
         {
        reg: '^#催熟小世界作物$',
        fnc: 'forceRipenCrops',
        permission: 'master'
    },
    {
        reg: '^#一键种植(.*?)$',
        fnc: 'batchPlantAll'
    },
    {
        reg: '^#一键浇灌(草木精华露|岁月流金沙|掌天灵液|普通)?$',
        fnc: 'batchWaterAll'
    },
    // ══════ 工坊系统 ══════
    {
        reg: '^#分配仙宠(.+?)到(.+?)$',
        fnc: 'assignPetToWorkshop'
    },
    {
        reg: '^#召回休息(.+?)$',
        fnc: 'recallPetToStable'
    },
    {
        reg: '^#处理分配(.+?)$',
        fnc: 'unassignPet'
    },
    {
        reg: '^#小世界工坊$',
        fnc: 'viewWorkshops'
    },
    {
        reg: '^#升级小世界工坊\\s*(灵田|丹房|器阁|符台|矿脉)$',
        fnc: 'upgradeSmallWorldWorkshop'
    },
    {
        reg: '^#驯服仙兽$',
        fnc: 'tameBeast'
    },
      ],
    });
  }
  // 将formatCropList方法放在类内部
  formatCropList(crops, world) {
    return crops.map((crop, index) => {
      const seedConfig = SHENYAO_SEEDS[crop.种子];
      if (!seedConfig) return `${index + 1}号: 未知作物`;
      
      const stageConfig = SHENYAO_STAGES[crop.当前阶段] || SHENYAO_STAGES[1];
      const remaining = this.calculateRemainingTime(crop, seedConfig, world);
      const stageProgress = "▰".repeat(crop.当前阶段) + "▱".repeat(5 - crop.当前阶段);
      
      return `${index + 1}号: ${seedConfig.name} [${stageProgress}] ${stageConfig.name} | 剩余: ${remaining}`;
    }).join("\n");
  }
async forceRipenSingleCrop(e) {
    if (!e.isGroup) return;
    
    // 更灵活的正则匹配，支持多种指令格式
    const match = e.msg.match(/^#(?:使用|浇灌)?\s*(草木精华露|岁月流金沙|掌天灵液)\s*(?:催熟|浇灌)?\s*(?:第)?(\d+)(?:号)?(?:作物|药田)?$/);
    if (!match) return false;
    
    const itemName = match[1];
    const position = parseInt(match[2]) - 1; // 位置从1开始，转换为索引
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    try {
        // 获取玩家小世界
        const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
        if (!world) {
            return e.reply('请先使用 #开辟小世界 创建您的小世界');
        }
        
        // 检查药田
        if (!world.药田 || world.药田.length === 0) {
            return e.reply('您的药田还没有种植任何作物，请先使用 #种植 [作物名] 进行种植');
        }
        
        // 检查位置是否有效
        if (position < 0 || position >= world.药田.length) {
            return e.reply(`位置无效，请选择1-${world.药田.length}号作物\n当前药田情况：\n${this.formatCropList(world.药田, world)}`);
        }
        
        // 获取作物
        const crop = world.药田[position];
        const seedConfig = SHENYAO_SEEDS[crop.种子];
        
        if (!seedConfig) {
            return e.reply('该作物配置异常，无法催熟');
        }
        
        // 催熟效果：减少剩余收获时间（有效秒数百分比）
        // 草木精华露：减少25%剩余时间
        // 岁月流金沙：减少50%剩余时间
        // 掌天灵液：减少75%剩余时间
        const reductionEffects = {
            '草木精华露': 0.25,
            '岁月流金沙': 0.50,
            '掌天灵液': 0.75
        };
        
        const reductionPct = reductionEffects[itemName] || 0.25;
        
        // 计算当前剩余时间（有效秒数）
        const now = new Date();
        const growthState = calculateCropGrowthState(crop, seedConfig, world, now);
        if (!growthState.valid) {
            return e.reply('作物种植时间异常，请联系统管理员');
        }
        const {
            elapsedSeconds,
            timeRatio,
            growthRate,
            totalGrowthTime,
            requiredTime,
            remainingTime,
        } = growthState;
        
        if (remainingTime <= 0) {
            // 已经成熟但阶段未更新，触发收获
            const harvestResult = await this.harvestCropBonus(player_qq, crop, seedConfig);
            world.药田.splice(position, 1);
            
            await this.saveWorld(player_qq, world);
            
            e.reply([
                `【${seedConfig.name}】已成熟！`,
                `收获：【${seedConfig.harvest}】x${harvestResult.totalYield}${harvestResult.seedReturned ? `，返种【${seedConfig.name}】x1` : ''}`,
                `已自动存入纳戒`
            ].join("\n"));
            return true;
        }

        // 只有未成熟作物才需要消耗催熟道具
        const itemCount = await exist_najie_thing(player_qq, itemName, "道具");
        if (itemCount < 1) {
            return e.reply([
                `需要【${itemName}】x1`,
                `提示：您当前拥有 ${itemCount} 个`
            ].join("\n"));
        }
        
        // 计算减少的时间（有效秒数）
        const reductionAmount = remainingTime * reductionPct;
        crop.时间加成 = (crop.时间加成 || 0) + reductionAmount;
        
        // 重新计算剩余时间百分比，更新展示阶段
        const newTotalGrowthTime = elapsedSeconds * timeRatio * growthRate + crop.时间加成;
        const newRemainingPct = Math.max(0, 1 - newTotalGrowthTime / requiredTime);
        const newStage = this.getStageByRemaining(newRemainingPct);
        
        const oldStage = crop.当前阶段;
        crop.当前阶段 = newStage;
        crop.阶段开始时间 = now.toLocaleString();
        
        // 记录生长日志
        crop.生长记录 = crop.生长记录 || [];
        crop.生长记录.push(`${now.toLocaleString()}: 使用【${itemName}】催熟，减少${(reductionPct * 100).toFixed(0)}%剩余时间，阶段【${SHENYAO_STAGES[oldStage]?.name || '未知'}】→【${SHENYAO_STAGES[newStage]?.name || '成熟期'}】`);
        
        // 扣除道具
        await Add_najie_thing(player_qq, itemName, "道具", -1);
        
        let replyMessage = [];
        
        // 检查是否成熟
        if (newTotalGrowthTime >= requiredTime) {
            // 成熟了，收获
            const harvestResult = await this.harvestCropBonus(player_qq, crop, seedConfig);
            
            // 从药田中移除
            world.药田.splice(position, 1);
            
            replyMessage = [
                `成功使用【${itemName}】催熟第${position + 1}号作物！`,
                `作物：${seedConfig.name}已成熟！`,
                `收获：【${seedConfig.harvest}】x${harvestResult.totalYield}${harvestResult.seedReturned ? `，返种【${seedConfig.name}】x1` : ''}`,
                `已自动存入纳戒`
            ];
        } else {
            const remaining = this.calculateRemainingTime(crop, seedConfig, world);
            replyMessage = [
                `成功使用【${itemName}】催熟第${position + 1}号作物！`,
                `作物：${seedConfig.name}减少${(reductionPct * 100).toFixed(0)}%剩余时间`,
                `当前阶段：【${SHENYAO_STAGES[newStage]?.name || '未知'}】`,
                `剩余时间：${remaining}`
            ];
        }
        
        // 保存小世界数据
        await this.saveWorld(player_qq, world);
        
        // 添加药田概览
        if (world.药田.length > 0) {
            replyMessage.push("\n当前药田概览：");
            replyMessage.push(this.formatCropList(world.药田, world));
        }
        
        e.reply(replyMessage.join("\n"));
        
    } catch (err) {
        console.error('催熟作物错误:', err);
        e.reply([
            '催熟失败',
            `错误: ${err.message}`,
            '请稍后重试或联系管理员'
        ].join("\n"));
    }
    
    return true;
}
async forceRipenAllCrops(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => String(w.player_qq) === String(player_qq));
    if (!world) {
        e.reply('请先开辟小世界');
        return true;
    }
    
    // 检查药田
    if (!world.药田 || world.药田.length === 0) {
        e.reply('药田中没有作物');
        return true;
    }
    
    // 检查道具数量
    const itemName = '乾坤造化瓶';
    const itemCount = await exist_najie_thing(player_qq, itemName, "道具");
    if (itemCount < 1) {
        e.reply(`需要【${itemName}】x1`);
        return true;
    }
    
    await Add_najie_thing(player_qq, itemName, "道具", -1);
    
    const now = new Date();
    const reductionPct = 0.25; // 群体催熟减少25%剩余时间
    const harvested = [];
    
    // 催熟所有作物：减少剩余时间
    for (let i = world.药田.length - 1; i >= 0; i--) {
        const crop = world.药田[i];
        const seedConfig = SHENYAO_SEEDS[crop.种子];
        
        if (!seedConfig) continue;
        
        // 计算当前剩余时间（有效秒数）
        const growthState = calculateCropGrowthState(crop, seedConfig, world, now);
        if (!growthState.valid) continue;
        const {
            elapsedSeconds,
            timeRatio,
            growthRate,
            totalGrowthTime,
            requiredTime,
            remainingTime,
        } = growthState;
        
        // 减少剩余时间
        const reductionAmount = remainingTime * reductionPct;
        crop.时间加成 = (crop.时间加成 || 0) + reductionAmount;
        
        // 重新计算剩余时间百分比，更新展示阶段
        const newTotalGrowthTime = elapsedSeconds * timeRatio * growthRate + crop.时间加成;
        const newRemainingPct = Math.max(0, 1 - newTotalGrowthTime / requiredTime);
        const newStage = this.getStageByRemaining(newRemainingPct);
        
        const oldStage = crop.当前阶段;
        crop.当前阶段 = newStage;
        crop.阶段开始时间 = now.toLocaleString();
        
        crop.生长记录 = crop.生长记录 || [];
        crop.生长记录.push(`${now.toLocaleString()}: 使用【${itemName}】群体催熟，减少${(reductionPct * 100).toFixed(0)}%剩余时间，阶段【${SHENYAO_STAGES[oldStage]?.name || '未知'}】→【${SHENYAO_STAGES[newStage]?.name || '成熟期'}】`);
        
        // 如果成熟则收获
        if (newTotalGrowthTime >= requiredTime) {
            const harvestResult = await this.harvestCropBonus(player_qq, crop, seedConfig);
            harvested.push({
                name: seedConfig.harvest,
                yield: harvestResult.totalYield,
                seedReturned: harvestResult.seedReturned,
                seedName: seedConfig.name
            });
            
            // 移除作物
            world.药田.splice(i, 1);
        }
    }
    
    // 保存小世界数据
    await this.saveWorld(player_qq, world);
    
    // 构建回复消息
    let msg = [
        `成功使用【${itemName}】！`,
        `小世界内所有作物剩余收获时间减少${(reductionPct * 100).toFixed(0)}%！`,
    ];
    
    if (harvested.length > 0) {
        msg.push(`以下作物已成熟并收获：`);
        harvested.forEach(item => {
            let info = `- ${item.name} x${item.yield}`;
            if (item.seedReturned) info += `（返种【${item.seedName}】x1）`;
            msg.push(info);
        });
    } else {
        msg.push(`所有作物生长加速，阶段已更新`);
    }
    
    e.reply(msg.join("\n"));
    return true;
}
checkShenyaoGrowth(world, hoursPassed) {
    const results = {
        harvested: [],
        grown: {}
    };

    if (!world.药田 || world.药田.length === 0) {
        return results;
    }

    const now = new Date();

    for (let i = 0; i < world.药田.length; i++) {
        const plant = world.药田[i];
        const seedConfig = SHENYAO_SEEDS[plant.种子];

        if (!seedConfig) continue;

        const growthState = calculateCropGrowthState(plant, seedConfig, world, now);
        if (!growthState.valid) continue;
        const { totalGrowthTime, requiredTime, remainingPct } = growthState;

        if (totalGrowthTime >= requiredTime) {
            // 时间足够，直接收获！
            plant.当前阶段 = 5;

            results.harvested.push({
                name: seedConfig.harvest,
                seedName: seedConfig.name,
                crop: plant
            });

            const harvestName = seedConfig.harvest;
            results.grown[harvestName] = (results.grown[harvestName] || 0) + 1;

            world.药田.splice(i, 1);
            i--;
        } else {
            // 未成熟，根据剩余时间百分比更新展示阶段
            const newStage = this.getStageByRemaining(remainingPct);

            if (newStage !== plant.当前阶段) {
                const oldStage = plant.当前阶段;
                plant.当前阶段 = newStage;
                plant.阶段开始时间 = now.toLocaleString();

                plant.生长记录 = plant.生长记录 || [];
                plant.生长记录.push(`${now.toLocaleString()}: 生长阶段变化【${SHENYAO_STAGES[oldStage]?.name || '未知'}】→【${SHENYAO_STAGES[newStage]?.name || '成熟期'}】(剩余${(remainingPct * 100).toFixed(0)}%)`);

                const harvestName = seedConfig.harvest;
                results.grown[harvestName] = (results.grown[harvestName] || 0) + 1;
            }
        }
    }

    return results;
}
async forceRipenCrops(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
        e.reply('你尚未开辟小世界');
        return true;
    }
    
    // 检查是否有药田
    if (!world.药田 || world.药田.length === 0) {
        e.reply('你的小世界中没有种植任何作物');
        return true;
    }
    
    // 记录收获的神药
    const harvested = [];
    
     // 遍历药田，将所有作物催熟
   for (let i = world.药田.length - 1; i >= 0; i--) {
       const plant = world.药田[i];
       const seedConfig = SHENYAO_SEEDS[plant.种子];
       
       // 直接设置为成熟期
       plant.当前阶段 = 5;
       plant.阶段开始时间 = new Date().toLocaleString();
       plant.生长记录.push(`${new Date().toLocaleString()}: 管理员催熟，【${seedConfig.harvest}】已成熟`);
       
       // 添加到收获列表（使用带加成的收获）
       const harvestResult = await this.harvestCropBonus(player_qq, plant, seedConfig);
       harvested.push({
           name: seedConfig.harvest,
           yield: harvestResult.totalYield,
           seedReturned: harvestResult.seedReturned,
           seedName: seedConfig.name
       });
       
       // 移除成熟药株
       world.药田.splice(i, 1);
   }
    
    // 保存小世界数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 构建回复消息
    let replyMsg = [
        '【管理员催熟】',
        '你以无上伟力催熟小世界所有作物！',
        '成功收获以下神药：'
    ];
    
    // 添加收获的神药
    harvested.forEach(item => {
        let info = `- ${item.name} x${item.yield}`;
        if (item.seedReturned) info += `（返种【${item.seedName}】x1）`;
        replyMsg.push(info);
    });
    
    replyMsg.push('▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂');
    
    e.reply(replyMsg.join("\n"));
    return true;
}
async createEnvironmentWithItem(e) {
    if (!e.isGroup) return;
    
    // 提取物品名称（支持更灵活的匹配）
    const itemName = e.msg.replace(/^#使用|创造环境$/g, '').trim();
    
    if (!itemName) {
        return this.showEnvironmentHelp(e);
    }
    
    const player_qq = await channel(e.user_id);
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    
    if (!world) {
        e.reply('请先开辟小世界');
        return true;
    }
    
    // 道具与环境映射
    const itemEnvironmentMap = {
        "混沌源石": "混沌土",
        "仙泉之眼": "仙泉",
        "龙魂精魄": "龙穴",
        "雷池核心": "雷池",
        "仙坟土": "仙坟",
        "星辰核心": "星辰矿脉",
        "生命之种": "生命古树",
        "时间沙漏": "时间碎片"
    };
    
    // 检查道具是否有效
    if (!itemEnvironmentMap[itemName]) {
        e.reply([
            `无法使用【${itemName}】创造环境`,
            `可用道具列表：`,
            ...Object.keys(itemEnvironmentMap).map(item => `- ${item}`)
        ].join("\n"));
        return true;
    }
    
    const environment = itemEnvironmentMap[itemName];
    
    // 检查是否已有该环境
    if (world.attributes.特殊资源.includes(environment)) {
        e.reply(`你的小世界已拥有【${environment}】环境`);
        return true;
    }
    
    // 检查道具数量
    const itemCount = await exist_najie_thing(player_qq, itemName, "材料");
    if (itemCount < 1) {
        e.reply([
            `需要【${itemName}】x1`,
            `提示：你当前拥有 ${itemCount} 个`
        ].join("\n"));
        return true;
    }
    
    // 扣除道具并添加环境
    await Add_najie_thing(player_qq, itemName, "材料", -1);
    world.attributes.特殊资源.push(environment);
    
    // 保存数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 获取环境描述
    const environmentDesc = {
        "混沌土": "提升混沌属性神药生长速度",
        "仙泉": "提升水属性神药生长速度",
        "龙穴": "提升龙属性神药生长速度",
        "雷池": "提升雷属性神药生长速度",
        "仙坟": "提升阴属性神药生长速度",
        "星辰矿脉": "增加灵矿产量",
        "生命古树": "增加仙馐果产量",
        "时间碎片": "加速所有作物生长"
    };
    
    e.reply([
        `成功使用【${itemName}】在小世界创造【${environment}】环境！`,
        `效果：${environmentDesc[environment] || '特殊环境效果'}`
    ].join("\n"));
    
    return true;
}

// 显示环境帮助信息
async showEnvironmentHelp(e) {
    const helpText = [
        "【小世界环境创造指南】",
        "指令：#使用[道具名]创造环境",
        "可用道具及效果：",
        "- 混沌源石 → 混沌土（提升混沌属性神药生长）",
        "- 仙泉之眼 → 仙泉（提升水属性神药生长）",
        "- 龙魂精魄 → 龙穴（提升龙属性神药生长）",
        "- 雷池核心 → 雷池（提升雷属性神药生长）",
        "- 仙坟土 → 仙坟（提升阴属性神药生长）",
        "- 星辰核心 → 星辰矿脉（增加灵矿产量）",
        "- 生命之种 → 生命古树（增加仙馐果产量）",
        "- 时间沙漏 → 时间碎片（加速所有作物生长）",
    ];
    
    e.reply(helpText.join("\n"));
    return true;
}
  
  // 开辟小世界
  async createSmallWorld(e) {
    if (!e.isGroup) return;
    
    // 解析命令
    const match = e.msg.match(/^#开辟小世界 (.*)$/);
    if (!match) return false;
    
    const worldName = match[1].trim();
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 检查玩家是否存在
    if (!await existplayer(player_qq)) {
      e.reply("请先创建修仙角色");
      return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(player_qq);
    
    // 确保小世界列表被初始化
    if (!data.xiaoshijie) {
      data.xiaoshijie = [];
    }
    
    // 检查是否已有小世界
    const existingWorld = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (existingWorld) {
      e.reply(`你已开辟【${existingWorld.world_name}】，无法再开辟新的小世界`);
      return true;
    }
    
    // 获取第一级配置
    const level1Config = WORLD_LEVELS[1];
    
    // 检查境界
    const playerLevel = data.Level_list.find(item => item.level_id == player.level_id);
    const requiredLevel = level1Config.requirements.境界;
    if (player.level_id < 42) {
        e.reply(`开辟小世界需要成仙`);
        return;
    }
    
    // 检查材料
    const materials = level1Config.requirements.材料;
    for (const [item, amount] of Object.entries(materials)) {
      const count = await exist_najie_thing(player_qq, item, "材料");
      if (count < amount) {
        e.reply(`开辟小世界需要${item}x${amount}`);
        return true;
      }
    }
    
    // 扣除材料
    for (const [item, amount] of Object.entries(materials)) {
      await Add_najie_thing(player_qq, item, "材料", -amount);
    }
    
    // 开辟小世界
    const newWorld = {
      player_qq: player_qq,
      player_name: player.名号 || player.name,
      world_name: worldName,
      level: 1,
      attributes: { ...level1Config.attributes },
      事件记录: [],
      creation_time: new Date().toLocaleString(),
      last_upgrade_time: null,
      药田: [], // 初始化药田
      栖息地: [], // 初始化栖息地
      栖息地上限: 1,
      工坊: JSON.parse(JSON.stringify(DEFAULT_WORKSHOPS)) // 初始化工坊
    };
    if (hasShengfaPower(player)) ascendSuperdimensionalStarRealm(newWorld);
    
    // 添加到小世界列表
    data.xiaoshijie.push(newWorld);
    // 保存到文件
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 开辟文案
    const creationTexts = [
      `你以无上法力撕裂虚空，于混沌中开辟出一方小世界！`,
      `掌中世界，心中乾坤！你成功开辟【${newWorld.world_name}】！`,
      `虚空震荡，法则重组！一方新世界在你手中诞生！`,
      `混沌初开，鸿蒙始分！你成功开辟属于自己的小世界【${newWorld.world_name}】！`
    ];
    
    const worldDesc = [
      `◇◇◇【${newWorld.world_name}】◇◇◇`,
      `等级：混沌初开（1级）`,
      `灵气浓度：${newWorld.attributes.灵气浓度}`,
      `面积：${newWorld.attributes.面积}`,
      `时间流速：${newWorld.attributes.时间流速}`,
      `特殊资源：${newWorld.attributes.特殊资源.join('、') || '无'}`,
      `「此界初成，尚需精心培育方能成为洞天福地」`
    ];
    
    e.reply([
      creationTexts[Math.floor(Math.random() * creationTexts.length)],
      ...worldDesc
    ].join("\n"));
    
    return true;
  }
  
  async upgradeSmallWorld(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
        e.reply('请先使用 #开辟小世界 创建你的小世界');
        return true;
    }
    
    // 获取下一等级配置
    const nextLevel = world.level + 1;
    const levelConfig = WORLD_LEVELS[nextLevel];
    
    if (!levelConfig) {
        e.reply(`你的小世界已达到最高等级（${world.level}级），无法继续升级`);
        return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(player_qq);
    if (!player) {
        e.reply('角色数据异常');
        return true;
    }
    
    if (player.level_id < 47) {
        e.reply(`演化小世界需要大罗金仙`);
        return;
    }
    
    // 检查材料
    const materials = levelConfig.requirements.材料;
    for (const [item, amount] of Object.entries(materials)) {
        const count = await exist_najie_thing(player_qq, item, "材料");
        if (count < amount) {
            e.reply(`演化小世界需要${item}x${amount}`);
            return true;
        }
    }
    
    // 扣除材料
    for (const [item, amount] of Object.entries(materials)) {
        await Add_najie_thing(player_qq, item, "材料", -amount);
    }
    
    // 保存原有的特殊资源
    const existingResources = [...world.attributes.特殊资源];
    
    // 升级小世界，保留原有特殊资源
    world.level = nextLevel;
    world.attributes = {
        ...levelConfig.attributes,
        特殊资源: existingResources  // 保留原有资源
    };
    world.last_upgrade_time = new Date().toLocaleString();
    
    // 随机添加新资源
    const newResources = [];
    const availableResources = [...SPECIAL_RESOURCES];
    
    // 确保不重复
    for (let i = 0; i < Math.min(2, availableResources.length); i++) {
        const randomIndex = Math.floor(Math.random() * availableResources.length);
        const resource = availableResources.splice(randomIndex, 1)[0];
        
        // 如果已有该资源，则跳过
        if (world.attributes.特殊资源.includes(resource)) {
            continue;
        }
        
        newResources.push(resource);
    }
    
    // 添加新资源
    world.attributes.特殊资源.push(...newResources);
    
    // 保存小世界
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    if (worldIndex !== -1) {
        data.xiaoshijie[worldIndex] = world;
        // 保存到文件
        fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    }
    
    // 升级文案
    const upgradeTexts = [
        `天地震荡，法则重组！你的小世界【${world.world_name}】成功晋升为【${levelConfig.name}】！`,
        `鸿蒙演化，世界晋升！【${world.world_name}】已升级为【${levelConfig.name}】！`,
        `乾坤再造，世界升华！你的小世界完成蜕变！`,
        `大道共鸣，世界跃迁！【${world.world_name}】成功晋升！`
    ];
    
    const newDesc = [
        `◇◇◇【${world.world_name}】◇◇◇`,
        `等级：${levelConfig.name}（${world.level}级）`,
        `灵气浓度：${world.attributes.灵气浓度}`,
        `面积：${world.attributes.面积}`,
        `时间流速：${world.attributes.时间流速}`,
        `特殊资源：${world.attributes.特殊资源.join('、') || '无'}`,
        `「世界晋升，大道可期！」`
    ];
    
    e.reply([
        upgradeTexts[Math.floor(Math.random() * upgradeTexts.length)],
        ...newDesc
    ].join("\n"));
    
    return true;
}
  
  // 创建分身
  async createAvatar(e) {
    if (!e.isGroup) return;
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家数据
    const player = await Read_player(player_qq);
    if (!player) {
      e.reply('请先创建角色');
      return true;
    }
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }
    
    // 检查是否已有分身
    if (world.avatar) {
      e.reply('你已化入分身在小世界中，无需再次化入');
      return true;
    }
    
    // 检查修为是否足够
    const cultivationCost = 1000000; // 消耗1000000点修为
    if (player.修为 < cultivationCost) {
      e.reply(`化入分身需要${cultivationCost}点修为，你只有${player.修为}点`);
      return true;
    }
    
    // 扣除修为
    player.修为 -= cultivationCost;
    await Write_player(player_qq, player);
    
    // 创建分身
    world.avatar = {
      created_time: new Date().toLocaleString(),
      last_harvest_time: new Date().toISOString(),
      resources: {}
    };
    
    // 保存小世界数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    e.reply(`你消耗${cultivationCost}点修为，化出一道分身进入【${world.world_name}】！\n分身将自动收集资源，最多积累${MAX_WORLD_ACCUMULATION_HOURS}个现实小时`);
    
    return true;
  }
  
  // 资源计算函数
  calculateResources(world, hours, yieldMultiplier = 1) {
    // 基础资源产量（根据小世界等级）
    const baseProduction = {
      1: { '灵石': 100000, '仙馐果': 50 },
      2: { '灵石': 200000, '仙馐果': 100, '灵矿': 5 },
      3: { '灵石': 300000, '仙馐果': 100, '灵矿': 10, '仙果': 5 },
      4: { '灵石': 500000, '仙馐果': 200, '灵矿': 10, '仙果': 10, '混沌元液': 3 },
      5: { '灵石': 800000, '仙馐果': 300, '灵矿': 20, '仙果': 15, '混沌元液': 5 }
    };
    
    // 获取基础产量
    const base = baseProduction[world.level] || baseProduction[1];
    const rawResources = {};
    for (const [res, amount] of Object.entries(base)) {
      rawResources[res] = amount * hours * yieldMultiplier;
    }
    
    // 特殊资源加成
    if (world.attributes.特殊资源.includes('先天灵泉')) {
      rawResources['仙馐果'] = (rawResources['仙馐果'] || 0) * 15;
    }
    if (world.attributes.特殊资源.includes('星辰矿脉')) {
      rawResources['灵矿'] = (rawResources['灵矿'] || 0) * 15;
    }
    if (world.attributes.特殊资源.includes('混沌灵根')) {
      rawResources['混沌元液'] = (rawResources['混沌元液'] || 0) * 15;
    }
    if (world.attributes.特殊资源.includes('太初神木')) {
      rawResources['仙果'] = (rawResources['仙果'] || 0) * 15;
    }
    if (world.attributes.特殊资源.includes('虚空晶石')) {
      rawResources['灵石'] = (rawResources['灵石'] || 0) * 15;
    }

    const settled = settleResourceRemainders(rawResources, world.avatar?.资源余量);
    if (world.avatar) world.avatar.资源余量 = settled.remainders;
    return settled.amounts;
  }

  // ========== 神药收获时间计算 ==========
  
  // 计算神药从种下到成熟所需的有效秒数
  // 公式：每1000灵气浓度 = 4小时(14400秒)，按世界灵气浓度加速
  calculateHarvestTime(seedConfig, world) {
    const baseConc = seedConfig.requirements?.灵气浓度 || 1000;
    // 每1000灵气浓度需要4小时 = 14400秒（有效秒数，已含灵气浓度修正）
    return (baseConc / 1000) * 14400;
  }

  // 根据剩余时间百分比计算当前应处阶段(1-5)
  // 剩余>80%=阶段1, >60%=阶段2, >40%=阶段3, >20%=阶段4, ≤20%=阶段5(即将成熟)
  getStageByRemaining(remainingPct) {
    if (remainingPct > 0.8) return 1;
    if (remainingPct > 0.6) return 2;
    if (remainingPct > 0.4) return 3;
    if (remainingPct > 0.2) return 4;
    return 5;
  }

  // 计算单株作物剩余时间（真实时间，用于展示）
  calculateRemainingTime(crop, seedConfig, world) {
    const growthState = calculateCropGrowthState(crop, seedConfig, world);
    if (!growthState.valid) return '时间异常';
    const { remainingTime: remainingGrowthTime, timeRatio, growthRate } = growthState;

    if (remainingGrowthTime <= 0) return '已成熟，可收获';

    // 转换为真实剩余时间
    const realRemaining = remainingGrowthTime / (timeRatio * growthRate);
    const days = Math.floor(realRemaining / 86400);
    const hours = Math.floor((realRemaining % 86400) / 3600);
    const minutes = Math.floor((realRemaining % 3600) / 60);

    if (days > 0) return `${days}天${hours}小时${minutes}分钟`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
  }
  
  // 保存小世界数据（辅助方法）
  async saveWorld(player_qq, world) {
    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(player_qq)
    );
    if (worldIndex !== -1) {
      data.xiaoshijie[worldIndex] = world;
      fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    }
  }

  async buildBaitianTemple(e) {
    if (!e.isGroup) return false;
    const player_qq = await channel(e.user_id);
    return withPlayerMutationLock(player_qq, async () => {
      const player = await Read_player(player_qq);
      const najie = await Read_najie(player_qq);
      const world = data.xiaoshijie.find(w => String(w.player_qq) === String(player_qq));
      if (!world) return e.reply('请先使用 #开辟小世界 创建你的小世界。');

      const worldSnapshot = structuredClone(world);
      const result = buildBaitianTemple(player, najie, world);
      if (result.reason === 'locked') return e.reply('败天神殿尚未解锁，需先消耗【玉石匣】承接败天遗法。');
      if (result.reason === 'built') return e.reply(`你的【${BAITIAN_TEMPLE_NAME}】早已建成。`);
      if (result.reason === 'materials') {
        return e.reply([
          `建立【${BAITIAN_TEMPLE_NAME}】所需材料不足：`,
          `源石：${result.sourceStone}/${BAITIAN_TEMPLE_SOURCE_COST}`,
          `世界石：${result.worldStone}/${BAITIAN_TEMPLE_WORLD_STONE_COST}`,
        ].join('\n'));
      }

      const worldFile = path.join(data.lib_path, '小世界列表.json');
      const worldIndex = data.xiaoshijie.indexOf(world);
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${player_qq}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${player_qq}.json`));
      transaction.capture(worldFile);
      try {
        await Write_player(player_qq, player);
        await Write_najie(player_qq, najie);
        fs.writeFileSync(worldFile, JSON.stringify(data.xiaoshijie, null, 2));
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        data.xiaoshijie[worldIndex] = worldSnapshot;
        throw error;
      }

      return e.reply([
        `【${BAITIAN_TEMPLE_NAME}·落成】`,
        '你以十五枚世界石镇住八方界脉，又引两千万源石化作不灭神基。',
        '万丈神殿拔地而起，殿中无塑像、无香火，唯有一道背对众生的伟岸身影，独立于破碎天穹之下。',
        '八道逆乱神痕绕殿而行，自此为你汇聚诸界源气，推演万法真意。',
        '',
        `每${BAITIAN_TEMPLE_INTERVAL_HOURS}个现实小时产出：${BAITIAN_TEMPLE_SOURCE_PER_INTERVAL / 10_000}万源石、${BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL}点功法感悟`,
        `发送 #收获小世界资源 一并领取（最多积累${BAITIAN_TEMPLE_MAX_HOURS}小时）`,
      ].join('\n'));
    });
  }

  async setSmallWorldGuard(e) {
    if (!e.isGroup) return;

    const player_qq = await channel(e.user_id);
    const world = (data.xiaoshijie || []).find(
      item => String(item.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);
    const match = e.msg.match(/^#设置仙宠守卫(.+?)$/);
    const petName = match?.[1]?.trim();
    if (!petName) {
      e.reply('用法：#设置仙宠守卫[仙宠名称]');
      return true;
    }

    const petIndex = findHabitatPetIndex(world.栖息地 || [], petName);
    if (petIndex < 0) {
      e.reply(`栖息地中找不到仙宠【${petName}】`);
      return true;
    }
    const player = data.getData('player', player_qq) || {};
    const maxSlots = (Number(world.attributes?.栖息地上限) || 1) + getHabitatSlotBonus(player);
    if (petIndex >= maxSlots) {
      e.reply(`这只仙宠当前位于超出上限的栖息地位置（${petIndex + 1}/${maxSlots}），请先装备扩容道具或召回前面的仙宠`);
      return true;
    }
    const pet = world.栖息地[petIndex];
    if (pet.累倒) {
      e.reply(`${pet.name}正在休养，暂时不能担任守卫`);
      return true;
    }
    if (Number(pet.精力 ?? 100) <= 0) {
      e.reply(`${pet.name}精力不足，请先让它在栖息地恢复`);
      return true;
    }

    const oldWorkshop = pet.工坊;
    for (const habitatPet of world.栖息地 || []) habitatPet.守卫 = false;
    pet.守卫 = true;
    pet.工坊 = null;
    await this.saveWorld(player_qq, world);

    const chance = Math.round(calculateGuardInterceptChance(pet) * 100);
    const workshopMessage = oldWorkshop ? `，已从【${oldWorkshop}】调离` : '';
    e.reply([
      `【${pet.name}】已成为小世界守卫${workshopMessage}`,
      `当前拦截率：${chance}%`,
      `当前精力：${pet.精力}/${pet.最大精力 || 100}`,
      `每次遭遇偷菜消耗${SMALL_WORLD_GUARD_ENERGY_COST}点精力`,
    ].join('\n'));
    return true;
  }

  async removeSmallWorldGuard(e) {
    if (!e.isGroup) return;

    const player_qq = await channel(e.user_id);
    const world = (data.xiaoshijie || []).find(
      item => String(item.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);
    const guards = (world.栖息地 || []).filter(pet => pet.守卫);
    if (guards.length === 0) {
      e.reply('你的小世界当前没有仙宠守卫');
      return true;
    }

    for (const pet of guards) pet.守卫 = false;
    await this.saveWorld(player_qq, world);
    e.reply(`已撤下仙宠守卫【${guards[0].name}】，它会留在栖息地休息`);
    return true;
  }

  async viewSmallWorldGuard(e) {
    if (!e.isGroup) return;

    const player_qq = await channel(e.user_id);
    const world = (data.xiaoshijie || []).find(
      item => String(item.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);
    const player = data.getData('player', player_qq) || {};
    const maxSlots = (Number(world.attributes?.栖息地上限) || 1) + getHabitatSlotBonus(player);
    const guard = (world.栖息地 || []).slice(0, maxSlots).find(pet => pet.守卫);
    if (!guard) {
      e.reply('当前没有仙宠守卫，可使用 #设置仙宠守卫[仙宠名称]');
      return true;
    }

    const chance = Math.round(calculateGuardInterceptChance(guard) * 100);
    e.reply([
      `小世界守卫：【${guard.name}】`,
      `类型/品级/等级：${guard.type} / ${guard.品级} / Lv.${guard.等级 || 1}`,
      `精力：${guard.精力 ?? 100}/${guard.最大精力 || 100}`,
      `当前拦截率：${chance}%`,
      `每次遭遇消耗：${SMALL_WORLD_GUARD_ENERGY_COST}精力`,
    ].join('\n'));
    return true;
  }

  async stealSmallWorldCrop(e) {
    if (!e.isGroup) return;

    const player_qq = await channel(e.user_id);
    const playerId = String(player_qq);
    const worlds = Array.isArray(data.xiaoshijie) ? data.xiaoshijie : [];
    const thiefWorld = worlds.find(world => String(world.player_qq) === playerId);

    if (!thiefWorld) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }
    if (!thiefWorld.avatar) {
      e.reply('请先使用 #将分身化入小世界，分身才能潜入其他世界偷菜');
      return true;
    }

    migrateWorldData(thiefWorld);
    const now = Date.now();
    const cooldownRemaining = getStealCooldownRemaining(
      thiefWorld.偷菜状态?.上次偷菜时间,
      now
    );
    if (cooldownRemaining > 0) {
      const totalMinutes = Math.ceil(cooldownRemaining / (60 * 1000));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      e.reply(`分身正在避风头，距离下次偷菜还有${hours}小时${minutes}分钟`);
      return true;
    }

    const atSegment = Array.isArray(e.message)
      ? e.message.find(item => item?.type === 'at' && item?.qq !== 'all')
      : null;
    const atTarget = atSegment?.qq ?? (e.at !== 'all' ? e.at : null);
    const commandSuffix = String(e.msg || '').replace(/^#小世界偷菜/, '').trim();
    if (!atTarget && commandSuffix) {
      e.reply('指定目标请使用：#小世界偷菜 @玩家\n不艾特玩家则随机寻找目标');
      return true;
    }

    const nowDate = new Date(now);
    const getStealableCrops = world => (world.药田 || []).filter(crop => {
      const seedConfig = SHENYAO_SEEDS[crop.种子];
      return isCropStealable(crop, seedConfig, world, nowDate);
    });

    let targets = [];
    if (atTarget) {
      const rawTargetId = String(atTarget).replace('qg_', '');
      const targetId = String(await channel(rawTargetId));
      if (targetId === playerId) {
        e.reply('不能偷自己小世界里的菜');
        return true;
      }

      const targetWorld = worlds.find(world => String(world.player_qq) === targetId);
      if (!targetWorld) {
        e.reply('对方尚未开辟小世界，本次不进入冷却');
        return true;
      }
      if (isWorldStealProtected(targetWorld.上次被偷菜时间, now)) {
        e.reply('对方的小世界正受法则保护，请稍后再来；本次不进入冷却');
        return true;
      }

      const crops = getStealableCrops(targetWorld);
      if (crops.length === 0) {
        e.reply('对方没有可偷取的成熟作物，本次不进入冷却');
        return true;
      }
      targets = [{ world: targetWorld, crops }];
    } else {
      targets = worlds.flatMap(world => {
        if (String(world.player_qq) === playerId) return [];
        if (isWorldStealProtected(world.上次被偷菜时间, now)) return [];
        const crops = getStealableCrops(world);
        return crops.length > 0 ? [{ world, crops }] : [];
      });
    }

    if (targets.length === 0) {
      e.reply('分身游荡诸界，却没有发现可下手的成熟作物；本次不进入冷却');
      return true;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    const crop = target.crops[Math.floor(Math.random() * target.crops.length)];
    const seedConfig = SHENYAO_SEEDS[crop.种子];
    const harvestItem = seedConfig.harvest;
    const itemType = isWudaoTeaItem(harvestItem) ? '道具' : '丹药';
    const cooldownHours = SMALL_WORLD_STEAL_COOLDOWN_MS / (60 * 60 * 1000);

    const addTargetEvent = (event, description) => {
      target.world.事件记录 = Array.isArray(target.world.事件记录)
        ? target.world.事件记录
        : [];
      target.world.事件记录.push({
        时间: nowDate.toLocaleString(),
        事件: event,
        描述: description,
      });
      if (target.world.事件记录.length > 20) {
        target.world.事件记录.splice(0, target.world.事件记录.length - 20);
      }
    };

    thiefWorld.偷菜状态 = { 上次偷菜时间: now };
    target.world.上次被偷菜时间 = now;

    const targetPlayer = data.getData('player', target.world.player_qq) || {};
    const targetMaxSlots = (Number(target.world.attributes?.栖息地上限) || 1)
      + getHabitatSlotBonus(targetPlayer);
    const guard = (target.world.栖息地 || []).slice(0, targetMaxSlots).find(pet => (
      pet.守卫 && !pet.累倒 && !pet.工坊 && Number(pet.精力 ?? 100) > 0
    ));
    let guardResult = '';
    if (guard) {
      const interceptChance = calculateGuardInterceptChance(guard);
      const remainingEnergy = consumeGuardEnergy(guard);
      const chancePercent = Math.round(interceptChance * 100);
      const exhaustedMessage = remainingEnergy <= 0
        ? `\n${guard.name}精力耗尽，已自动撤下守卫岗位`
        : '';

      if (Math.random() < interceptChance) {
        addTargetEvent(
          '仙宠护界',
          `${guard.name}发现了${thiefWorld.player_name || '神秘修士'}的分身并将其赶走`
        );
        await this.saveWorld(player_qq, thiefWorld);
        e.reply([
          `潜入失败！你的分身被【${guard.name}】当场发现并赶出了【${target.world.world_name}】`,
          `守卫拦截率：${chancePercent}%`,
          `守卫剩余精力：${remainingEnergy}/${guard.最大精力 || 100}${exhaustedMessage}`,
          `偷菜冷却：${cooldownHours}小时`,
        ].join('\n'));
        return true;
      }

      guardResult = `成功避开守卫【${guard.name}】（拦截率${chancePercent}%），其剩余精力${remainingEnergy}/${guard.最大精力 || 100}${exhaustedMessage}`;
    }

    recordCropSteal(crop, playerId, now);
    addTargetEvent(
      '分身潜入',
      `${thiefWorld.player_name || '神秘修士'}潜入药田，摘走了【${harvestItem}】的一份伴生产出`
    );

    await Add_najie_thing(player_qq, harvestItem, itemType, 1);
    await this.saveWorld(player_qq, thiefWorld);

    e.reply([
      `你的分身潜入【${target.world.world_name}】，从成熟的【${seedConfig.name}】旁摘走一份伴生产出！`,
      guardResult,
      `获得：【${harvestItem}】x1`,
      '原主的基础收成受到世界法则保护，不会减少',
      `偷菜冷却：${cooldownHours}小时`,
    ].filter(Boolean).join('\n'));
    return true;
  }
  
  // 收获资源
  async harvestResources(e) {
    if (!e.isGroup) return;

    const player_qq = await channel(e.user_id);
    return withPlayerMutationLock(player_qq, async () => {
      const worldFile = path.join(data.lib_path, '小世界列表.json');
      const worldIndex = data.xiaoshijie.findIndex(w => String(w.player_qq) === String(player_qq));
      const worldSnapshot = worldIndex >= 0 ? structuredClone(data.xiaoshijie[worldIndex]) : null;
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${player_qq}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${player_qq}.json`));
      transaction.capture(worldFile);
      try {
        const result = await this.harvestResourcesLocked(e, player_qq);
        transaction.commit();
        return result;
      } catch (error) {
        let rollbackError;
        try {
          transaction.rollback();
        } catch (caught) {
          rollbackError = caught;
        }
        if (worldSnapshot) data.xiaoshijie[worldIndex] = worldSnapshot;
        if (rollbackError) throw new AggregateError([error, rollbackError], '小世界收获失败且回滚不完整');
        throw error;
      }
    });
  }

  async harvestResourcesLocked(e, player_qq) {
    const player = await Read_player(player_qq);
    const innateYieldMultiplier = getSmallWorldYieldMultiplier(player);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    // 数据迁移：自动升级旧数据到新版本
    migrateWorldData(world);

    const now = new Date();
    const templeRewards = await collectBaitianTempleRewards(player_qq, world, now);
    let superdimensionalRewards = { hours: 0 };
    const latestPlayer = await Read_player(player_qq);
    if (hasShengfaPower(latestPlayer)) {
      const ascended = ascendSuperdimensionalStarRealm(world);
      superdimensionalRewards = settleSuperdimensionalStarRealm(latestPlayer, world, { now: now.getTime() });
      if (superdimensionalRewards.hours > 0) await Write_player(player_qq, latestPlayer);
      if (ascended || superdimensionalRewards.hours > 0) fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    }
    const superdimensionalLine = superdimensionalRewards.hours > 0
      ? `【超维星界】${superdimensionalRewards.hours}小时：修为+${superdimensionalRewards.cultivation.toLocaleString()}、血气+${superdimensionalRewards.blood.toLocaleString()}、超维之力+${superdimensionalRewards.power.toFixed(2)}`
      : '';

    // 检查是否有分身
    if (!world.avatar) {
      if (templeRewards.hours > 0 || superdimensionalLine) {
        e.reply([
          templeRewards.hours > 0 ? `【${BAITIAN_TEMPLE_NAME}】` : '',
          templeRewards.hours > 0
            ? `供奉${templeRewards.hours}个现实小时（${templeRewards.cycles}轮）：源石x${templeRewards.sourceStone}、功法感悟x${templeRewards.insight}`
            : '',
          superdimensionalLine,
          '小世界分身尚未化入，其他资源本次未结算。',
        ].filter(Boolean).join('\n'));
        return true;
      }
      e.reply('请先使用 #将分身化入小世界 创建分身');
      return true;
    }
    
    // 解析时间流速
    const timeFlow = String(world.attributes.时间流速 || '1:1').split(':');
    const configuredTimeRatio = Number(timeFlow[1]) / Number(timeFlow[0]);
    const timeRatio = Number.isFinite(configuredTimeRatio) && configuredTimeRatio > 0
      ? configuredTimeRatio
      : 1;
    
    // 计算可收获资源
    const lastHarvest = new Date(world.avatar.last_harvest_time);
    if (!Number.isFinite(lastHarvest.getTime()) || lastHarvest > now) {
      world.avatar.last_harvest_time = now.toISOString();
      await this.saveWorld(player_qq, world);
      const templeMessage = templeRewards.hours > 0
        ? `；败天神殿已结算${templeRewards.cycles}轮，获得源石x${templeRewards.sourceStone}、功法感悟x${templeRewards.insight}`
        : '';
      const superdimensionalMessage = superdimensionalLine ? `；${superdimensionalLine}` : '';
      return e.reply(`分身收获时间异常，已校准为当前时间，分身资源本次未结算${templeMessage}${superdimensionalMessage}。`);
    }
    const hoursPassed = (now - lastHarvest) / (1000 * 60 * 60);
    
    // 先按现实时间封顶，再应用小世界时间流速
    const accumulation = calculateWorldAccumulation(hoursPassed, timeRatio);
    const harvestRealHours = accumulation.realHours;
    const harvestHours = accumulation.effectiveHours;
    
    if (harvestHours <= 0) {
      e.reply(templeRewards.hours > 0 || superdimensionalLine
        ? [
          templeRewards.hours > 0
            ? `【${BAITIAN_TEMPLE_NAME}】供奉${templeRewards.hours}个现实小时（${templeRewards.cycles}轮）：源石x${templeRewards.sourceStone}、功法感悟x${templeRewards.insight}`
            : '',
          superdimensionalLine,
          '分身资源距离上次收获时间太短，本次未结算。',
        ].filter(Boolean).join('\n')
        : '距离上次收获时间太短，暂无资源可收获'
      );
      return true;
    }
    
    // 计算资源产量
    const resources = this.calculateResources(world, harvestHours, innateYieldMultiplier);

    // ==== 栖息地结算（工坊劳作 + 栖息地休息恢复精力） ====
    let habitatResults = [];
    let workDescriptions = [];
    const activeHabitatCount = Math.max(
      0,
      (Number(world.attributes?.栖息地上限) || 1) + getHabitatSlotBonus(player)
    );
    const careStates = new Map();
    let requiredMeals = 0;
    for (const pet of (world.栖息地 || []).slice(0, activeHabitatCount)) {
      if (!pet.工坊 || pet.累倒) continue;
      const careState = calculatePetCarePeriod(
        pet.精力,
        pet.最大精力,
        harvestHours,
        calculateEnergyCost(pet, pet.工坊),
        pet.作息进度
      );
      careStates.set(pet, careState);
      requiredMeals += careState.meals;
    }
    const feeding = await consumePetMeals(player_qq, world, resources, requiredMeals);
    if (feeding.required > 0) {
      const foodText = Object.entries(feeding.consumed).map(([name, amount]) => `${name}x${amount}`).join('、');
      habitatResults.push(
        feeding.missing > 0
          ? `🍚 自动用餐：${foodText || '没有食物'}；缺少${feeding.missing}份，工坊总效率降至${Math.round(feeding.efficiency * 100)}%`
          : `🍚 自动用餐：${foodText}`
      );
    }
    if (world.栖息地 && world.栖息地.length > 0) {
      for (let petIndex = 0; petIndex < world.栖息地.length; petIndex++) {
        const pet = world.栖息地[petIndex];
        if (petIndex >= activeHabitatCount) {
          workDescriptions.push(`${pet.name}当前超出栖息地上限，本次未参与工作结算`);
          continue;
        }
        const workshop = pet.工坊 || null; // null = 在栖息地休息
        const pinjiRate = PINJI_RATE[pet.品级] || 1;

        // 累倒恢复检查（在栖息地休养）
        if (pet.累倒) {
          const recoveryHours = Math.max(0, Number(pet.累倒_counter ?? 12) || 0);
          const restHours = Math.max(0, harvestHours - recoveryHours);
          pet.累倒_counter = recoveryHours - harvestHours;
          if (pet.累倒_counter <= 0) {
            pet.累倒 = false;
            pet.精力 = Math.min(Number(pet.最大精力 ?? 100), Number(pet.精力 ?? 0) + 30 + restHours * 8);
            habitatResults.push(`💤 ${pet.name}已从累倒中恢复，精神抖擞！`);
          } else {
            habitatResults.push(`💤 ${pet.name}还在栖息地休养中（还需${Math.ceil(pet.累倒_counter)}小时恢复）…`);
          }
          workDescriptions.push(getWorkDescription(pet, harvestHours));
          continue;
        }

        // 在栖息地休息：不产生资源，只恢复精力
        if (!workshop) {
          const restState = calculatePetEnergyPeriod(
            pet.精力,
            pet.最大精力,
            harvestHours,
            calculateEnergyCost(pet, workshop)
          );
          pet.精力 = restState.endEnergy;
          habitatResults.push(`🏠 ${pet.name}在栖息地休憩玩耍，精力恢复至 ${pet.精力}/${pet.最大精力}（${getEnergyIcon(pet.精力)}）`);
          workDescriptions.push(getWorkDescription(pet, harvestHours));
          continue;
        }

        const careState = careStates.get(pet);
        pet.精力 = careState.endEnergy;
        pet.作息进度 = careState.cycleProgress;

        // 计算工作效率
        const workedHours = careState.activeHours;
        const energyEfficiency = workedHours > 0 ? careState.weightedWorkHours / workedHours : 0;
        const baseWorkEfficiency = calculateWorkEfficiency(pet, workshop, world) * energyEfficiency;
        const workEfficiency = baseWorkEfficiency * feeding.efficiency;
        habitatResults.push(
          `🕰️ ${pet.name}自动作息：劳作${workedHours.toFixed(1)}小时、休息${careState.restHours.toFixed(1)}小时、玩耍${careState.playHours.toFixed(1)}小时`
        );

        // 工坊产出（使用新的产出体系）
        const wsOutput = WORKSHOP_OUTPUTS[pet.type];
        if (!wsOutput || workedHours <= 0) {
          workDescriptions.push(getWorkDescription(pet, harvestHours));
        } else for (const [resName, baseRate] of Object.entries(wsOutput)) {
          const outputEfficiency = resName === '仙宠口粮' ? baseWorkEfficiency : workEfficiency;
          const settled = settleResourceRemainders({
            [resName]: baseRate * workedHours * pinjiRate * outputEfficiency * innateYieldMultiplier,
          }, pet.产出余量);
          pet.产出余量 = settled.remainders;
          const amount = settled.amounts[resName];
          if (amount <= 0) continue;

          pet.产出累积 = pet.产出累积 || {};
          const energyIcon = getEnergyIcon(pet.精力);
          const efficiencyStr = outputEfficiency !== 1.0 ? ` (效率${(outputEfficiency*100).toFixed(0)}%)` : '';

          pet.产出累积[resName] = (pet.产出累积[resName] || 0) + amount;
          switch (resName) {
            case '灵石':
              await Add_灵石(player_qq, amount);
              habitatResults.push(`${energyIcon} ${pet.name}在矿脉开采：灵石x${amount}${efficiencyStr}`);
              break;
            case '源石':
              await Add_源石(player_qq, amount);
              habitatResults.push(`${energyIcon} ${pet.name}在矿脉开采：源石x${amount}${efficiencyStr}`);
              break;
            case '修为':
              await Add_修为(player_qq, amount);
              habitatResults.push(`${energyIcon} ${pet.name}在灵田修炼：修为x${amount}${efficiencyStr}`);
              break;
            case '血气':
              await Add_血气(player_qq, amount);
              habitatResults.push(`${energyIcon} ${pet.name}在灵田淬体：血气x${amount}${efficiencyStr}`);
              break;
            case '小世界神药':
              const pillCounts = {};
              for (let i = 0; i < amount; i++) {
                const pillName = pickSmallWorldPill(Math.random(), {
                  xutianAlchemy: Boolean(player.虚天之主传承 && hasEquippedInnateTreasure(player, '虚天舟')),
                });
                pillCounts[pillName] = (pillCounts[pillName] || 0) + 1;
              }
              for (const [pillName, count] of Object.entries(pillCounts)) {
                await Add_najie_thing(player_qq, pillName, '丹药', count);
              }
              const pillText = Object.entries(pillCounts)
                .map(([pillName, count]) => `${pillName}x${count}`)
                .join('、');
              habitatResults.push(`${energyIcon} ${pet.name}在丹房炼成：${pillText}${efficiencyStr}`);
              break;
            case '随机矿石':
              const ores = ['灵矿', '仙晶矿', '七彩流晶矿'];
              const randomOre = ores[Math.floor(Math.random() * ores.length)];
              await Add_najie_thing(player_qq, randomOre, '道具', amount);
              habitatResults.push(`${energyIcon} ${pet.name}在器阁锻造：${randomOre}x${amount}${efficiencyStr}`);
              break;
            case '稀有道具':
              const totalWeight = LUCKY_REWARDS.reduce((s, r) => s + r.weight, 0);
              let roll = Math.random() * totalWeight;
              for (const reward of LUCKY_REWARDS) {
                roll -= reward.weight;
                if (roll <= 0) {
                  await Add_najie_thing(player_qq, reward.name, reward.class, Math.ceil(amount));
                  habitatResults.push(`${energyIcon} ${pet.name}在灵田寻得机缘：${reward.name}x${Math.ceil(amount)}${efficiencyStr}`);
                  break;
                }
              }
              break;
            case '制符草药': {
              const herbCounts = {};
              for (let i = 0; i < amount; i++) {
                const herb = TALISMAN_HERBS[Math.floor(Math.random() * TALISMAN_HERBS.length)];
                herbCounts[herb] = (herbCounts[herb] || 0) + 1;
              }
              for (const [herb, count] of Object.entries(herbCounts)) {
                await Add_najie_thing(player_qq, herb, '草药', count);
              }
              habitatResults.push(`${energyIcon} ${pet.name}在灵田采收制符草药：${Object.entries(herbCounts).map(([name, count]) => `${name}x${count}`).join('、')}${efficiencyStr}`);
              break;
            }
            case '仙宠口粮':
            case '界源矿石':
            case '工坊构件':
              ensureWorkshopSupplies(world)[resName] += amount;
              habitatResults.push(`${energyIcon} ${pet.name}为工坊储备：${resName}x${amount}${efficiencyStr}`);
              break;
            case '符纸':
              await Add_najie_thing(player_qq, '符纸', '道具', amount);
              habitatResults.push(`${energyIcon} ${pet.name}在符台制符：符纸x${amount}${efficiencyStr}`);
              break;
          }
        }

        // 记录工作状态描述
        workDescriptions.push(getWorkDescription(pet, harvestHours));

        // 聪慧特性：额外品质产出
        if (pet.特性 && pet.特性.includes('聪慧') && Math.random() < 0.15) {
          const bonusRewards = ['炼丹经验翻倍', '炼器获得双倍矿石', '制符获得高级符纸'];
          const bonus = bonusRewards[Math.floor(Math.random() * bonusRewards.length)];
          habitatResults.push(`✨ ${pet.name}灵光一闪，触发聪慧：${bonus}！`);
        }
      }
    }

    // 添加资源到纳戒
    for (const [resource, amount] of Object.entries(resources)) {
      switch(resource) {
        case '灵石':
          // 使用 Add_灵石 方法添加灵石
          await Add_灵石(player_qq, amount);
          break;
          
        case '仙馐果':
          await Add_najie_thing(player_qq, '仙馐果', '食材', amount);
          break;
          
        case '灵矿':
          // 作为道具添加到纳戒
          await Add_najie_thing(player_qq, '灵矿', '道具', amount);
          break;
          
        case '仙果':
          // 作为丹药添加到纳戒
          await Add_najie_thing(player_qq, '仙果', '丹药', amount);
          break;
          
        case '混沌元液':
          // 作为丹药添加到纳戒
          await Add_najie_thing(player_qq, '混沌元液', '丹药', amount);
          break;
      }
    }
    
    // 检查神药生长
    const shenyaoResults = this.checkShenyaoGrowth(world, harvestHours);
    
       // 处理收获的神药
   for (const harvestData of shenyaoResults.harvested) {
     const shenyao = harvestData.name;
     const seedConfig = SHENYAO_SEEDS[harvestData.seedName];
     
     // 根据神药名称添加属性加成
     switch(shenyao) {
       case '九妙不死药':
         await Add_修为(player_qq, 35000000);
         await Add_血气(player_qq, 35000000);
         break;
       case '真龙不死药':
       case '神凰不死药':
         await Add_修为(player_qq, 8000000);
         await Add_血气(player_qq, 8000000);
         break;
       case '麒麟神药':
       case '玄武神药':
         await Add_修为(player_qq, 5000000);
         await Add_血气(player_qq, 5000000);
         break;
       case '蟠桃仙果':
         await Add_修为(player_qq, 15000000);
         await Add_血气(player_qq, 15000000);
         break;
     }
     
     // 使用带加成的收获，记录返种信息
     if (harvestData.crop && seedConfig) {
       const result = await this.harvestCropBonus(player_qq, harvestData.crop, seedConfig);
       harvestData.seedReturned = result.seedReturned;
       harvestData.totalYield = result.totalYield;
     } else {
       // 兼容旧数据，无加成直接添加
       let itemType = "丹药";
       if (isWudaoTeaItem(shenyao)) itemType = "道具";
       await Add_najie_thing(player_qq, shenyao, itemType, 1);
       harvestData.totalYield = 1;
     }
   }
    
    // 更新收获时间
    world.avatar.last_harvest_time = now.toISOString();
    
    // 保存小世界数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 构建收获信息
    const resourceList = Object.entries(resources)
      .map(([res, amount]) => `${res}x${amount}`)
      .join('、');
    
    // 添加时间流速信息
    const timeFlowInfo = `时间流速 ${world.attributes.时间流速}（加速${timeRatio}倍）`;
    
    // 构建回复消息
    let replyMsg = [
      `成功收获分身收集的资源：${resourceList}`,
      timeFlowInfo
    ];
    if (superdimensionalRewards.hours > 0) {
      replyMsg.push(superdimensionalLine);
    }
    
    // 添加神药收获信息
    if (shenyaoResults.harvested.length > 0) {
      // 按名称分组统计
      const harvestStats = {};
      const seedReturns = {};
      for (const item of shenyaoResults.harvested) {
        const name = item.name || item;
        harvestStats[name] = (harvestStats[name] || 0) + 1;
        if (item.seedReturned && item.seedName) {
          seedReturns[item.seedName] = (seedReturns[item.seedName] || 0) + 1;
        }
      }
      replyMsg.push(`【神药成熟】`);
      for (const [name, count] of Object.entries(harvestStats)) {
        replyMsg.push(`收获【${name}】x${count}`);
      }
      for (const [seedName, count] of Object.entries(seedReturns)) {
        replyMsg.push(`返种【${seedName}】x${count}`);
      }
    }
    
    const grownEntries = Object.entries(shenyaoResults.grown);
    if (grownEntries.length > 0) {
      replyMsg.push(
        `【神药生长】`,
        ...grownEntries.map(([name, count]) => `【${name}】阶段推进 ${count} 次`)
      );
    }
    
    replyMsg.push(`分身将继续在【${world.world_name}】中收集资源`);

    // 添加仙宠工作状态
    if (habitatResults.length > 0) {
      replyMsg.push(`【仙宠工坊】`);
      replyMsg.push(...habitatResults);
    }

    // 添加工作状态描述
    if (workDescriptions && workDescriptions.length > 0) {
      replyMsg.push(`【工作掠影】`);
      replyMsg.push(...workDescriptions);
    }

    if (templeRewards.hours > 0) {
      replyMsg.push(`【${BAITIAN_TEMPLE_NAME}】`);
      replyMsg.push(`供奉${templeRewards.hours}个现实小时（${templeRewards.cycles}轮）：源石x${templeRewards.sourceStone}、功法感悟x${templeRewards.insight}`);
    }

    // 野外驯服事件：每24现实小时约8%，按本次积累时长连续计算
    let tameEventMsg = null;
    const tameEventChance = calculateElapsedEventChance(harvestRealHours);
    if (Math.random() < tameEventChance) {
      const beast = generateWildBeast();
      world.驯服状态 = {
        active: true,
        beast_name: beast.name,
        beast_type: beast.type,
        beast_quality: beast.品级,
        beast_hp: beast.hp,
        beast_traits: beast.特性,
        expires: new Date(Date.now() + 30 * 60000).toLocaleString() // 30分钟有效期
      };
      const traitsStr = beast.特性.map(t => `【${t}】`).join('');
      tameEventMsg = [
        `【野外仙兽出没！】`,
        `一只 ${beast.品级} 级【${beast.name}】(类型:${beast.type}) 出现在了小世界中！`,
        `特性：${traitsStr || '无'}`,
        `使用 #驯服仙兽 消耗封灵符尝试驯服它！（30分钟内有效）`
      ].join('\n');
    }

    // 保存驯服状态
    const worldIndex2 = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex2] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));

    e.reply(replyMsg.join("\n"));

    // 如果有驯服事件，单独发一条消息
    if (tameEventMsg) {
      e.reply(tameEventMsg);
    }

    return true;
  }

  async tourLandscape(e) {
    if (!e.isGroup) return false;
    const player_qq = await channel(e.user_id);
    return withPlayerMutationLock(player_qq, () => this.tourLandscapeLocked(e, player_qq));
  }

  async tourLandscapeLocked(e, player_qq) {
    const player = await Read_player(player_qq);
    if (!hasEquippedInnateTreasure(player, '山河社稷图')) {
      return e.reply('需先执掌【山河社稷图】才能进入图中巡游。');
    }

    const remaining = getCooldownRemaining(player, '图中巡游');
    if (remaining > 0) return e.reply(`图中巡游尚在冷却，还需${formatCooldown(remaining)}。`);
    const world = data.xiaoshijie.find(w => String(w.player_qq) === String(player_qq));
    if (!world?.avatar) return e.reply('需先开辟小世界并将分身化入其中。');

    const lastHarvest = new Date(world.avatar.last_harvest_time);
    if (!Number.isFinite(lastHarvest.getTime())) return e.reply('分身收获时间异常，请先发送 #收获小世界资源 校准。');
    world.avatar.last_harvest_time = new Date(lastHarvest.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const worldIndex = data.xiaoshijie.findIndex(w => String(w.player_qq) === String(player_qq));
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    startAuthorityCooldown(player, '图中巡游');
    await Write_player(player_qq, player);
    await e.reply('你展开山河社稷图巡游一周，开始额外结算6小时小世界产出。');
    return this.harvestResources(e);
  }
//    // 查看小世界
// async viewSmallWorld(e) {
//     if (!e.isGroup) return;
    
//     const usr_qq = e.user_id;
//     const player_qq = await channel(usr_qq);
    
//     // 确保小世界列表被初始化
//     if (!data.xiaoshijie) {
//         data.xiaoshijie = [];
//     }
    
//     // 获取玩家小世界
//     const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
//     if (!world) {
//         e.reply('请先使用 #开辟小世界 创建你的小世界');
//         return true;
//     }
    
//     // 获取等级名称
//     const levelName = WORLD_LEVELS[world.level]?.name || `未知等级${world.level}`;
    
//     // 解析时间流速
//     const timeFlow = world.attributes.时间流速.split(':');
//     const timeRatio = parseInt(timeFlow[1]) / parseInt(timeFlow[0]);
    
//     // 构建消息数组
//     let msg = [
//         `---【${world.world_name}】---`,
//         `开辟者：${world.player_name}`,
//         `等级：${levelName}（${world.level}级）`,
//         `开辟时间：${world.creation_time}`,
//         world.last_upgrade_time ? `上次升级：${world.last_upgrade_time}` : '',
//         `灵气浓度：${world.attributes.灵气浓度}`,
//         `面积：${world.attributes.面积}`,
//         `时间流速：${world.attributes.时间流速}（加速${timeRatio}倍）`,
//         `药田容量：${world.药田?.length || 0}/${world.attributes.药田上限}株`,
//         `特殊资源：${world.attributes.特殊资源.join('、') || '无'}`,
//     ];
    
//     // 添加药田信息
//     msg.push(`---【神药药田】---`);
//     if (world.药田 && world.药田.length > 0) {
//         const now = new Date();
        
//         world.药田.forEach(plant => {
//             const seedConfig = SHENYAO_SEEDS[plant.种子];
//             const stageInfo = seedConfig.stages[plant.当前阶段];
            
//             // 计算当前阶段剩余时间
//             let stageRemaining = "已成熟";
//             let totalRemaining = "已成熟";
            
//             if (plant.当前阶段 < 5) {
//                 const startTime = new Date(plant.阶段开始时间);
//                 const elapsedSeconds = (now - startTime) / 1000;
                
//                 // 计算生长速率（灵气浓度影响）
//                 const growthRate = world.attributes.灵气浓度 / seedConfig.requirements.灵气浓度;
//                 const adjustedElapsed = elapsedSeconds * timeRatio * growthRate;
//                 const remainingSeconds = Math.max(0, stageInfo.duration - adjustedElapsed);
                
//                 // 转换为天、小时、分钟
//                 const days = Math.floor(remainingSeconds / 86400);
//                 const hours = Math.floor((remainingSeconds % 86400) / 3600);
//                 const minutes = Math.floor((remainingSeconds % 3600) / 60);
                
//                 stageRemaining = `${days}天${hours}小时${minutes}分钟`;
                
//                 // 计算整株神药剩余时间
//                 let totalSeconds = 0;
//                 for (let stage = plant.当前阶段; stage <= 4; stage++) {
//                     totalSeconds += seedConfig.stages[stage].duration;
//                 }
                
//                 // 应用时间流速和灵气浓度
//                 const adjustedTotal = totalSeconds / (timeRatio * growthRate);
                
//                 // 转换为天、小时、分钟
//                 const totalDays = Math.floor(adjustedTotal / 86400);
//                 const totalHours = Math.floor((adjustedTotal % 86400) / 3600);
//                 const totalMinutes = Math.floor((adjustedTotal % 3600) / 60);
                
//                 totalRemaining = `${totalDays}天${totalHours}小时${totalMinutes}分钟`;
//             }
            
//             // 构建每条神药信息
//             const plantMsg = [
//                 `神药：${seedConfig.harvest}`,
//                 `种子：${plant.种子}`,
//                 `当前阶段：${stageInfo.name}（${stageRemaining}后进入下一阶段）`,
//                 `预计成熟：${totalRemaining}`,
//                 `种植时间：${plant.种植时间}`
//             ]
            
//             msg.push(plantMsg);
//         });
//     } else {
//         msg.push(`药田暂无神药种植`);
//     }
    
//     // 添加分身信息
//     if (world.avatar) {
//         msg.push(`---【分身状态】---`);
        
//         const now = new Date();
//         const lastHarvest = new Date(world.avatar.last_harvest_time);
//         const hoursPassed = (now - lastHarvest) / (1000 * 60 * 60);
//         const accumulation = calculateWorldAccumulation(hoursPassed, timeRatio);
//         const harvestHours = accumulation.effectiveHours;
        
//         // 计算可收获资源量
//         const resources = this.calculateResources(world, harvestHours);
//         const resourceList = Object.entries(resources)
//             .map(([res, amount]) => `${res}x${amount}`)
//             .join('、');
        
//         const avatarMsg = [
//             `分身已收集资源：${harvestHours.toFixed(1)}小时`,
//             `可收获资源：${resourceList || '无'}`,
//             `上次收获：${world.avatar.last_harvest_time}`,
//             `最大积累：${MAX_WORLD_ACCUMULATION_HOURS}小时资源`
//         ]
        
//         msg.push(avatarMsg);
//     }
    
//     // 添加事件记录
//     if (world.事件记录 && world.事件记录.length > 0) {
//         msg.push(`◇◇◇【近期事件】◇◇◇`);
//         // 显示最近3条事件
//         const recentEvents = world.事件记录.slice(-3);
//         recentEvents.forEach(event => {
//             const eventMsg = [
//                 `[${event.时间}]`,
//                 `${event.事件}：${event.描述}`
//             ].join('\n');
            
//             msg.push(eventMsg);
//         });
//     }
    
//     // 添加等级描述
//     const levelDescriptions = {
//         1: `「混沌初开，万物始生」`,
//         2: `「鸿蒙初判，阴阳始分」`,
//         3: `「紫府洞天，仙家福地」`,
//         4: `「太虚仙境，超凡脱俗」`,
//         5: `「洪荒世界，开天辟地」`
//     };
    
//     msg.push(levelDescriptions[world.level] || `「此界玄妙，难以言表」`);
    
//     // 使用ForwardMsg发送消息
//     await ForwardMsg(e, msg);
//     return true;
// }
  // 查看小世界
async viewSmallWorld(e) {
 let img = await get_xiaoshijie_img(e);
     replyImageWithButtons(e, { image: img, buttons: SMALL_WORLD_BUTTONS });
     return false;}
async plantShenyao(e) {
    if (!e.isGroup) return;
    
    // 提取种子名称（支持更灵活的匹配）
    const seedName = e.msg.replace(/^#小世界种(?:植|栽)/, '').trim();
    
    if (!seedName) {
        return this.showPlantingHelp(e);
    }
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
        e.reply('请先开辟小世界');
        return true;
    }
    
    // 检查药田容量
    const maxFields = world.attributes.药田上限 || 0;
    if (world.药田 && world.药田.length >= maxFields) {
        e.reply([
            `药田已满（${world.药田.length}/${maxFields}）`,
            `提示：升级小世界可增加药田容量`
        ].join("\n"));
        return true;
    }
    
    // 查找匹配的种子配置（支持模糊匹配）
    let seedConfig;
    for (const key in SHENYAO_SEEDS) {
        if (key.includes(seedName)) {
            seedConfig = SHENYAO_SEEDS[key];
            break;
        }
    }
    
    if (!seedConfig) {
        return this.showPlantingHelp(e, `未找到【${seedName}】种子`);
    }
    
    // 检查种子数量
    const seedCount = await exist_najie_thing(player_qq, seedConfig.name, "草药");
    if (seedCount < 1) {
        e.reply([
            `需要【${seedConfig.name}】x1`,
            `提示：你当前拥有 ${seedCount} 个`
        ].join("\n"));
        return true;
    }
    
    // 检查种植条件
    const requirements = seedConfig.requirements || {};
    if (requirements.灵气浓度 && world.attributes.灵气浓度 < requirements.灵气浓度) {
        e.reply([
            `灵气浓度不足（需要${requirements.灵气浓度}，当前${world.attributes.灵气浓度}）`,
            `提示：升级小世界可提升灵气浓度`
        ].join("\n"));
        return true;
    }
    
    if (requirements.特殊环境) {
        const missingEnvironments = requirements.特殊环境.filter(env => 
            !world.attributes.特殊资源.includes(env)
        );
        
        if (missingEnvironments.length > 0) {
            e.reply([
                `缺少特殊环境：${missingEnvironments.join('、')}`,
                `提示：使用 #使用[道具]创造环境 创建所需环境`
            ].join("\n"));
            return true;
        }
    }
    
    // 扣除种子
    await Add_najie_thing(player_qq, seedConfig.name, "草药", -1);
    
    // 添加作物
    if (!world.药田) world.药田 = [];
    
    world.药田.push({
        种子: seedConfig.name,
        当前阶段: 1,
        阶段开始时间: new Date().toLocaleString(),
        种植时间: new Date().toLocaleString(),
        生长记录: [`${new Date().toLocaleString()}: 种植【${seedConfig.name}】`]
    });
    
    // 保存小世界数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 获取生长信息
    const stageInfo = SHENYAO_STAGES[1];
    const growthInfo = [
        `成功种植【${seedConfig.name}】！`,
        `当前阶段：${stageInfo.name}`,
        `阶段描述：${stageInfo.desc}`,
        `预计成熟：${this.calculateGrowthTime(seedConfig, world)}`
    ];
    
    if (world.药田.length >= maxFields) {
        growthInfo.push(`⚠️ 药田已满（${world.药田.length}/${maxFields}），无法种植更多作物`);
    }
    
    e.reply(growthInfo.join("\n"));
    return true;
}

// 计算预计收获剩余时间（种植时展示，基于每1000灵气浓度=4小时）
calculateGrowthTime(seedConfig, world) {
    const requiredTime = this.calculateHarvestTime(seedConfig, world);

    const timeFlow = world.attributes.时间流速.split(':');
    const timeRatio = parseInt(timeFlow[1]) / parseInt(timeFlow[0]);
    const growthRate = world.attributes.灵气浓度 / (seedConfig.requirements?.灵气浓度 || 1);

    // requiredTime是有效秒数，转换为真实秒数
    const realSeconds = requiredTime / (timeRatio * growthRate);

    const days = Math.floor(realSeconds / 86400);
    const hours = Math.floor((realSeconds % 86400) / 3600);
    const minutes = Math.floor((realSeconds % 3600) / 60);

    if (days > 0) return `${days}天${hours}小时${minutes}分钟`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
}

// 显示种植帮助信息
async showPlantingHelp(e, errorMsg = "") {
    const helpText = [
        "【小世界神药种植指南】",
        "指令：#小世界栽种[种子名]",
        "可用种子列表："
    ];
    
    // 添加种子列表
    for (const key in SHENYAO_SEEDS) {
        const seed = SHENYAO_SEEDS[key];
        const requirements = [];
        
        if (seed.requirements?.灵气浓度) {
            requirements.push(`灵气≥${seed.requirements.灵气浓度}`);
        }
        
        if (seed.requirements?.特殊环境) {
            requirements.push(`需要${seed.requirements.特殊环境.join('、')}`);
        }
        
        helpText.push(`- ${seed.name} → ${seed.harvest} ${requirements.length ? `(${requirements.join('，')})` : ''}`);
    }
    
    helpText.push(
        "",
        "提示：",
        "1. 使用 #查看小世界 查看当前种植情况",
        "2. 使用 #使用[道具]创造环境 创建特殊环境"
    );
    
    if (errorMsg) {
        helpText.unshift(errorMsg);
    }
    
    e.reply(helpText.join("\n"));
    return true;
}

// ========== 一键种植 ==========
async batchPlantAll(e) {
    if (!e.isGroup) return;
    
    const seedNameFilter = e.msg.replace(/^#一键种植/, '').trim();
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
        e.reply('请先开辟小世界');
        return true;
    }
    
    // 检查药田容量
    const maxFields = world.attributes.药田上限 || 0;
    if (!world.药田) world.药田 = [];
    const currentCount = world.药田.length;
    if (currentCount >= maxFields) {
        e.reply([
            `药田已满（${currentCount}/${maxFields}）`,
            `提示：升级小世界可增加药田容量`
        ].join("\n"));
        return true;
    }
    
    // 收集可用的种子
    const availableSlots = maxFields - currentCount;
    const seedsToPlant = [];
    
    if (seedNameFilter) {
        // 指定种子名称，只种植匹配的
        let matchedConfig = null;
        for (const key in SHENYAO_SEEDS) {
            if (key.includes(seedNameFilter)) {
                matchedConfig = SHENYAO_SEEDS[key];
                break;
            }
        }
        if (!matchedConfig) {
            e.reply(`未找到匹配【${seedNameFilter}】的种子`);
            return true;
        }
        const count = await exist_najie_thing(player_qq, matchedConfig.name, "材料");
        if (count <= 0) {
            e.reply(`纳戒中无【${matchedConfig.name}】，当前拥有 ${count} 个`);
            return true;
        }
        const plantCount = Math.min(count, availableSlots);
        for (let i = 0; i < plantCount; i++) {
            seedsToPlant.push(matchedConfig);
        }
    } else {
        // 自动收集纳戒中所有种子
        for (const key in SHENYAO_SEEDS) {
            const config = SHENYAO_SEEDS[key];
            const count = await exist_najie_thing(player_qq, config.name, "材料");
            if (count > 0) {
                for (let i = 0; i < count && seedsToPlant.length < availableSlots; i++) {
                    seedsToPlant.push(config);
                }
            }
        }
    }
    
    if (seedsToPlant.length === 0) {
        e.reply(seedNameFilter 
            ? `纳戒中没有足够的【${seedNameFilter}】种子可种植`
            : '纳戒中没有任何可种植的种子，请先获取种子'
        );
        return true;
    }
    
    // 种植统计
    const planted = {};
    const skipped = [];
    
    for (const seedConfig of seedsToPlant) {
        // 再次检查药田已满
        if (world.药田.length >= maxFields) break;
        
        // 检查种植条件
        const requirements = seedConfig.requirements || {};
        let canPlant = true;
        const reasons = [];
        
        if (requirements.灵气浓度 && world.attributes.灵气浓度 < requirements.灵气浓度) {
            canPlant = false;
            reasons.push(`灵气不足（需${requirements.灵气浓度}）`);
        }
        
        if (requirements.特殊环境) {
            const missingEnvs = requirements.特殊环境.filter(env => 
                !world.attributes.特殊资源.includes(env)
            );
            if (missingEnvs.length > 0) {
                canPlant = false;
                reasons.push(`缺少环境：${missingEnvs.join('、')}`);
            }
        }
        
        if (!canPlant) {
            const skipReason = `${seedConfig.name}（${reasons.join('，')}）`;
            if (!skipped.includes(skipReason)) {
                skipped.push(skipReason);
            }
            continue;
        }
        
        // 扣除种子
        await Add_najie_thing(player_qq, seedConfig.name, "草药", -1);
        
        // 添加到药田
        world.药田.push({
            种子: seedConfig.name,
            当前阶段: 1,
            阶段开始时间: new Date().toLocaleString(),
            种植时间: new Date().toLocaleString(),
            生长记录: [`${new Date().toLocaleString()}: 一键种植【${seedConfig.name}】`],
            浇灌记录: []
        });
        
        planted[seedConfig.name] = (planted[seedConfig.name] || 0) + 1;
    }
    
    // 保存数据
    const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 构建回复
    const replyMsg = ['【一键种植结果】'];
    const plantedEntries = Object.entries(planted);
    if (plantedEntries.length > 0) {
        replyMsg.push('成功种植：');
        plantedEntries.forEach(([name, count]) => {
            replyMsg.push(`- ${name} x${count}`);
        });
    } else {
        replyMsg.push('未能种植任何种子');
    }
    
    if (skipped.length > 0) {
        replyMsg.push(`\n未能种植（条件不足）：`);
        skipped.forEach(s => replyMsg.push(`- ${s}`));
    }
    
    replyMsg.push(`\n药田：${world.药田.length}/${maxFields}`);
    
    if (world.药田.length >= maxFields) {
        replyMsg.push('⚠️ 药田已满，无法继续种植');
    }
    
    e.reply(replyMsg.join("\n"));
    return true;
}

// ========== 一键浇灌 ==========
async batchWaterAll(e) {
    if (!e.isGroup) return;
    
    const match = e.msg.match(/^#一键浇灌(草木精华露|岁月流金沙|掌天灵液|普通)?$/);
    const itemName = match && match[1] ? match[1] : '';
    const isFree = !itemName || itemName === '普通';
    
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);
    
    // 获取玩家小世界
    const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
        e.reply('请先开辟小世界');
        return true;
    }
    
    // 检查药田
    if (!world.药田 || world.药田.length === 0) {
        e.reply('药田中没有作物，无需浇灌');
        return true;
    }
    
    // 过滤出未成熟的作物
    const immatureCrops = world.药田.filter(crop => {
        const seedConfig = SHENYAO_SEEDS[crop.种子];
        return seedConfig && !calculateCropGrowthState(crop, seedConfig, world).isMature;
    });
    if (immatureCrops.length === 0) {
        e.reply('所有作物均已成熟，无需浇灌');
        return true;
    }
    
    const now = new Date();
    
    // 计算时间流速
    const timeFlow = world.attributes.时间流速.split(':');
    const timeRatio = parseInt(timeFlow[1]) / parseInt(timeFlow[0]);
    
    if (isFree) {
        // 免费普通浇灌 - 检查冷却时间
        const freeWaterCooldown = 6 * 60 * 60 * 1000; // 6小时冷却
        if (world.lastFreeWaterTime) {
            const lastTime = new Date(world.lastFreeWaterTime);
            const elapsed = now - lastTime;
            if (elapsed < freeWaterCooldown) {
                const remaining = freeWaterCooldown - elapsed;
                const remHours = Math.floor(remaining / (1000 * 60 * 60));
                const remMins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                e.reply(`普通浇灌冷却中，剩余 ${remHours}小时${remMins}分钟`);
                return true;
            }
        }
        
        // 执行免费浇灌
        const timeReduce = 1800; // 30分钟（真实秒数）
        
        for (const crop of immatureCrops) {
            const seedConfig = SHENYAO_SEEDS[crop.种子];
            const growthRate = seedConfig ? world.attributes.灵气浓度 / (seedConfig.requirements?.灵气浓度 || 1) : 1;
            const effectiveReduce = timeReduce * timeRatio * growthRate; // 有效秒数
            
            // 累加时间加成（有效秒数）
            crop.时间加成 = (crop.时间加成 || 0) + effectiveReduce;
            
            // 更新展示阶段
            const now2 = new Date();
            const elapsedMs2 = now2 - new Date(crop.种植时间 || crop.阶段开始时间);
            const elapsedSec2 = elapsedMs2 / 1000;
            const totalGT2 = elapsedSec2 * timeRatio * growthRate + (crop.时间加成 || 0);
            const reqT = this.calculateHarvestTime(seedConfig, world);
            const remPct = Math.max(0, 1 - totalGT2 / reqT);
            const oldStage = crop.当前阶段;
            crop.当前阶段 = this.getStageByRemaining(remPct);
            crop.阶段开始时间 = now2.toLocaleString();
            
            // 记录浇灌
            crop.浇灌记录 = crop.浇灌记录 || [];
            crop.浇灌记录.push({
                时间: now.toLocaleString(),
                道具: '普通浇灌',
                时间减少: timeReduce
            });
            crop.生长记录 = crop.生长记录 || [];
            crop.生长记录.push(`${now.toLocaleString()}: 普通浇灌，减少${(timeReduce/60).toFixed(0)}分钟生长时间，阶段【${SHENYAO_STAGES[oldStage]?.name || '未知'}】→【${SHENYAO_STAGES[crop.当前阶段]?.name || '成熟期'}】`);
        }
        
        // 更新冷却时间
        world.lastFreeWaterTime = now.toLocaleString();
        
        // 保存数据
        const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
        data.xiaoshijie[worldIndex] = world;
        fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
        
        e.reply([
            `【普通浇灌】`,
            `对所有未成熟作物进行了免费浇灌！`,
            `减少生长时间：30分钟（受时间流速和灵气浓度加成）`,
            `浇灌作物数：${immatureCrops.length}株`,
            `下次免费浇灌：6小时后`,
        ].join("\n"));
        return true;
    }
    
    // 道具浇灌
    const waterConfig = {
        '草木精华露': { timeReduce: 10800, yieldBonus: 1, seedBonus: 10, type: '道具' },
        '岁月流金沙': { timeReduce: 21600, yieldBonus: 2, seedBonus: 20, type: '道具' },
        '掌天灵液':   { timeReduce: 43200, yieldBonus: 3, seedBonus: 30, type: '道具' },
    };
    
    const config = waterConfig[itemName];
    if (!config) {
        e.reply(`未知的浇灌道具：${itemName}`);
        return true;
    }
    
    // 检查道具数量
    const itemCount = await exist_najie_thing(player_qq, itemName, config.type);
    if (itemCount < 1) {
        e.reply(`需要【${itemName}】x1，当前拥有 ${itemCount} 个`);
        return true;
    }
    
    // 扣除道具
    await Add_najie_thing(player_qq, itemName, config.type, -1);
    
    // 执行道具浇灌
    for (const crop of immatureCrops) {
        const seedConfig = SHENYAO_SEEDS[crop.种子];
        const growthRate = seedConfig ? world.attributes.灵气浓度 / (seedConfig.requirements?.灵气浓度 || 1) : 1;
        const effectiveReduce = config.timeReduce * timeRatio * growthRate; // 有效秒数
        
        // 累加时间加成（有效秒数）
        crop.时间加成 = (crop.时间加成 || 0) + effectiveReduce;
        
        // 更新展示阶段
        const now2 = new Date();
        const startTime2 = new Date(crop.种植时间 || crop.阶段开始时间);
        const elapsedMs2 = now2 - startTime2;
        if (elapsedMs2 >= 0) {
            const elapsedSec2 = elapsedMs2 / 1000;
            const totalGT2 = elapsedSec2 * timeRatio * growthRate + crop.时间加成;
            const reqT = this.calculateHarvestTime(seedConfig, world);
            const remPct = Math.max(0, 1 - totalGT2 / reqT);
            const oldStage = crop.当前阶段;
            crop.当前阶段 = this.getStageByRemaining(remPct);
            crop.阶段开始时间 = now2.toLocaleString();
            
            crop.生长记录 = crop.生长记录 || [];
            crop.生长记录.push(`${now.toLocaleString()}: 使用【${itemName}】浇灌，减少生长时间，阶段【${SHENYAO_STAGES[oldStage]?.name || '未知'}】→【${SHENYAO_STAGES[crop.当前阶段]?.name || '成熟期'}】`);
        }
        
        // 记录浇灌
        crop.浇灌记录 = crop.浇灌记录 || [];
        crop.浇灌记录.push({
            时间: now.toLocaleString(),
            道具: itemName,
            时间减少: config.timeReduce,
            有效减少: effectiveReduce,
            产量加成: config.yieldBonus,
            返种加成: config.seedBonus
        });
    }
    
    // 检查是否有作物直接成熟（时间判定）
    const newlyMatured = [];
    for (let i = world.药田.length - 1; i >= 0; i--) {
        const crop = world.药田[i];
        if (immatureCrops.includes(crop)) {
            // 展示阶段不代表成熟，始终使用实际生长时间精确判定
            const seedConfig = SHENYAO_SEEDS[crop.种子];
            if (!seedConfig) continue;
            const growthState = calculateCropGrowthState(crop, seedConfig, world);
            if (growthState.isMature) {
                const harvestResult = await this.harvestCropBonus(player_qq, crop, seedConfig);
                newlyMatured.push({
                    name: seedConfig.harvest,
                    yield: harvestResult.totalYield,
                    seedReturned: harvestResult.seedReturned,
                    seedName: seedConfig.name
                });
                world.药田.splice(i, 1);
            }
        }
    }
    
    // 保存数据
    const worldIndex2 = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
    data.xiaoshijie[worldIndex2] = world;
    fs.writeFileSync(`${data.lib_path}/小世界列表.json`, JSON.stringify(data.xiaoshijie, null, 2));
    
    // 构建回复
    const timeLabels = { 10800: '3小时', 21600: '6小时', 43200: '12小时' };
    const replyMsg = [
        `【${itemName}浇灌】`,
        `使用【${itemName}】对所有未成熟作物进行了浇灌！`,
        `减少生长时间：${timeLabels[config.timeReduce] || config.timeReduce + '秒'}（受时间流速和灵气浓度加成）`,
        `浇灌作物数：${immatureCrops.length}株`,
        `\n浇灌效果：`,
        `- 产量加成：+${config.yieldBonus}（收获时额外获得）`,
        `- 返种概率加成：+${config.seedBonus}%`,
    ];
    
    if (newlyMatured.length > 0) {
        replyMsg.push(`\n【作物成熟】`);
        newlyMatured.forEach(item => {
            let extraInfo = `收获【${item.name}】x${item.yield}`;
            if (item.seedReturned) {
                extraInfo += `，返种【${item.seedName}】x1`;
            }
            replyMsg.push(`- ${extraInfo}`);
        });
    }
    
    e.reply(replyMsg.join("\n"));
    return true;
}

// ========== 收获加成计算 ==========
calculateHarvestBonuses(crop) {
    const bonuses = { extraYield: 0, seedReturnChance: 10 }; // 基础10%返种率
    if (!crop.浇灌记录 || crop.浇灌记录.length === 0) return bonuses;
    
    for (const record of crop.浇灌记录) {
        switch (record.道具) {
            case '草木精华露':
                bonuses.extraYield += (record.产量加成 || 1);
                bonuses.seedReturnChance += (record.返种加成 || 10);
                break;
            case '岁月流金沙':
                bonuses.extraYield += (record.产量加成 || 2);
                bonuses.seedReturnChance += (record.返种加成 || 20);
                break;
            case '掌天灵液':
                bonuses.extraYield += (record.产量加成 || 3);
                bonuses.seedReturnChance += (record.返种加成 || 30);
                break;
            // 普通浇灌无加成
        }
    }
    
    bonuses.seedReturnChance = Math.min(bonuses.seedReturnChance, 90); // 最高90%
    return bonuses;
}

// ========== 带加成的收获 ==========
async harvestCropBonus(player_qq, crop, seedConfig) {
    const bonuses = this.calculateHarvestBonuses(crop);
    const player = await Read_player(player_qq);
    const totalYield = Math.floor(
      (1 + bonuses.extraYield) * getSmallWorldYieldMultiplier(player)
    );
    
    const harvestItem = seedConfig.harvest;
    let itemType = "丹药";
    if (isWudaoTeaItem(harvestItem)) itemType = "道具";
    if (harvestItem === "蟠桃仙果") itemType = "丹药";
    
    // 添加收获物品
    await Add_najie_thing(player_qq, harvestItem, itemType, totalYield);
    
    // 返种判定
    let seedReturned = false;
    const roll = Math.random() * 100;
    if (roll < bonuses.seedReturnChance) {
        await Add_najie_thing(player_qq, seedConfig.name, "草药", 1);
        seedReturned = true;
    }
    
    return { totalYield, seedReturned };
}

// ══════════════════════════════════════
// 🏗️ 工坊系统命令
// ══════════════════════════════════════

  // 分配仙宠到工坊
  async assignPetToWorkshop(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);

    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);

    const petName = e.msg.match(/^#分配仙宠(.+?)到(.+?)$/);
    if (!petName) {
      const wsHelp = Object.entries(WORKSHOP_CONFIG)
        .map(([name, cfg]) => `${cfg.icon} ${name}（兼容：${cfg.compatible.join('/')}）`)
        .join('\n');
      e.reply(`用法：#分配仙宠[名称]到[工坊名]\n\n工坊列表：\n${wsHelp}`);
      return true;
    }

    const targetPetName = petName[1].trim();
    const workshopName = petName[2].trim();

    // 验证工坊
    const validWss = Object.keys(WORKSHOP_CONFIG);
    if (!validWss.includes(workshopName)) {
      e.reply(`无效工坊名：${workshopName}\n可选：${validWss.join('、')}`);
      return true;
    }

    // 确保工坊存在
    if (!world.工坊) world.工坊 = JSON.parse(JSON.stringify(DEFAULT_WORKSHOPS));

    // 查找栖息地中的仙宠
    if (!world.栖息地 || world.栖息地.length === 0) {
      e.reply('你的小世界中没有仙宠，请先使用 #安置仙宠');
      return true;
    }

    const petIndex = findHabitatPetIndex(world.栖息地, targetPetName);
    if (petIndex < 0) {
      e.reply(`栖息地中找不到仙宠【${targetPetName}】`);
      return true;
    }
    const player = data.getData('player', player_qq) || {};
    const maxSlots = (Number(world.attributes?.栖息地上限) || 1) + getHabitatSlotBonus(player);
    if (petIndex >= maxSlots) {
      e.reply(`这只仙宠当前位于超出上限的栖息地位置（${petIndex + 1}/${maxSlots}），不能分配到工坊`);
      return true;
    }
    const pet = world.栖息地[petIndex];

    // 检查是否已累倒
    if (pet.累倒) {
      e.reply(`${pet.name}已经累倒了，正在栖息地休养中，暂时无法分配工作`);
      return true;
    }
    if (pet.守卫) {
      e.reply(`${pet.name}正在守卫小世界，请先使用 #撤下仙宠守卫`);
      return true;
    }

    // 检查工坊容量
    const wsLevel = world.工坊[workshopName]?.level || 1;
    const wsCapacity = WORKSHOP_LEVEL_EFFECTS[wsLevel]?.capacity || 1;
    const currentAssign = world.栖息地
      .slice(0, maxSlots)
      .filter(p => p.工坊 === workshopName && !p.累倒)
      .length;
    if (currentAssign >= wsCapacity) {
      e.reply(`${workshopName}已满（${currentAssign}/${wsCapacity}），请先 #召回休息 腾出位置或升级工坊`);
      return true;
    }

    // 检查类型兼容性
    const wsConfig = WORKSHOP_CONFIG[workshopName];
    const isCompatible = wsConfig.compatible.includes(pet.type);

    // 分配工坊
    const oldWs = pet.工坊 ? `【${pet.工坊}】` : '栖息地';
    pet.工坊 = workshopName;

    // 保存
    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(player_qq)
    );
    data.xiaoshijie[worldIndex] = world;
    const libPath = `${data.lib_path}/小世界列表.json`;
    fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));

    const emoji = wsConfig.icon;
    if (isCompatible) {
      e.reply(`${emoji} ${pet.name}已分配到【${workshopName}】！\n` +
        `${pet.type}型仙宠与${workshopName}完美匹配，效率100%`);
    } else {
      e.reply(`${emoji} ${pet.name}已分配到【${workshopName}】\n` +
        `⚠️ ${pet.type}型仙宠不擅长${workshopName}工作，效率仅50%`);
    }

    return true;
  }

  // 召回休息（停止工作回栖息地）
  async recallPetToStable(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);

    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);

    const petNameMatch = e.msg.match(/^#召回休息(.+?)$/);
    if (!petNameMatch) {
      e.reply('用法：#召回休息[仙宠名称]');
      return true;
    }

    const petName = petNameMatch[1].trim();

    if (!world.栖息地 || world.栖息地.length === 0) {
      e.reply('你的小世界中没有仙宠');
      return true;
    }

    const petIndex = findHabitatPetIndex(world.栖息地, petName);
    if (petIndex < 0) {
      e.reply(`栖息地中找不到仙宠【${petName}】`);
      return true;
    }
    const pet = world.栖息地[petIndex];

    const oldWs = pet.工坊 ? `【${pet.工坊}】` : '栖息地';
    pet.工坊 = null; // 回栖息地休息玩耍

    // 保存
    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(player_qq)
    );
    data.xiaoshijie[worldIndex] = world;
    const libPath = `${data.lib_path}/小世界列表.json`;
    fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));

    e.reply(`🏠 ${pet.name}已从${oldWs}召回至【栖息地】休息玩耍，将缓慢恢复精力`);
    return true;
  }

  // 处理分配（清除工坊状态回栖息地）
  async unassignPet(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);

    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    const petNameMatch = e.msg.match(/^#处理分配(.+?)$/);
    if (!petNameMatch) {
      e.reply('用法：#处理分配[仙宠名称]\n清除仙宠的工坊分配（回到栖息地休息但不召回纳戒）');
      return true;
    }

    const petName = petNameMatch[1].trim();

    if (!world.栖息地 || world.栖息地.length === 0) {
      e.reply('你的小世界中没有仙宠');
      return true;
    }

    const petIndex = findHabitatPetIndex(world.栖息地, petName);
    if (petIndex < 0) {
      e.reply(`栖息地中找不到仙宠【${petName}】`);
      return true;
    }
    const pet = world.栖息地[petIndex];

    pet.工坊 = null; // 回栖息地

    const worldIndex = data.xiaoshijie.findIndex(
      w => String(w.player_qq) === String(player_qq)
    );
    data.xiaoshijie[worldIndex] = world;
    const libPath = `${data.lib_path}/小世界列表.json`;
    fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));

    e.reply(`${pet.name}的工坊分配已清除，回到栖息地休息`);
    return true;
  }

  async upgradeSmallWorldWorkshop(e) {
    if (!e.isGroup) return;
    const player_qq = await channel(e.user_id);
    const workshopName = e.msg.match(/^#升级小世界工坊\s*(灵田|丹房|器阁|符台|矿脉)$/)?.[1];
    return withPlayerMutationLock(player_qq, async () => {
      const world = data.xiaoshijie.find(w => String(w.player_qq) === String(player_qq));
      if (!world) return e.reply('请先使用 #开辟小世界 创建你的小世界');
      migrateWorldData(world);
      const result = upgradeWorkshop(world, workshopName);
      if (!result.ok) {
        if (result.reason === 'max') return e.reply(`【${workshopName}】已经达到六级圆满。`);
        if (result.reason === 'materials') {
          const missing = result.missing.map(item => `${item.name}${item.current}/${item.amount}`).join('、');
          return e.reply(`升级【${workshopName}】至Lv.${result.level + 1}还缺：${missing}\n使用 #小世界工坊 查看全部储备。`);
        }
        return e.reply('工坊名称应为灵田、丹房、器阁、符台或矿脉。');
      }

      await this.saveWorld(player_qq, world);
      const effect = WORKSHOP_LEVEL_EFFECTS[result.level];
      return e.reply([
        `【${workshopName}】已升级至Lv.${result.level}`,
        `消耗：界源矿石x${result.requirement.hours}、工坊构件x${result.requirement.hours}`,
        `岗位容量：${effect.capacity}，产出倍率：${Math.round(effect.outputBonus * 100)}%`,
      ].join('\n'));
    });
  }

  // 查看工坊状态
  async viewWorkshops(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);

    let world = data.xiaoshijie.find(
      w => String(w.player_qq) === String(player_qq)
    );
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    migrateWorldData(world);

    if (!world.工坊) world.工坊 = JSON.parse(JSON.stringify(DEFAULT_WORKSHOPS));

    const player = data.getData('player', player_qq) || {};
    const maxSlots = (Number(world.attributes?.栖息地上限) || 1) + getHabitatSlotBonus(player);
    const lines = [`【${world.world_name}】工坊总览（有效栖息地：${maxSlots}格）`];
    const supplies = ensureWorkshopSupplies(world);
    lines.push(`工坊物资：仙宠口粮x${supplies.仙宠口粮}、界源矿石x${supplies.界源矿石}、工坊构件x${supplies.工坊构件}${supplies.欠餐 ? `、欠餐x${supplies.欠餐}` : ''}`);

    if (world.败天神殿) {
      lines.push(`🏛️ ${BAITIAN_TEMPLE_NAME}（每${BAITIAN_TEMPLE_INTERVAL_HOURS}小时${BAITIAN_TEMPLE_SOURCE_PER_INTERVAL / 10_000}万源石、${BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL}点功法感悟）`);
    }

    for (const [wsName, wsData] of Object.entries(world.工坊)) {
      const wsConfig = WORKSHOP_CONFIG[wsName];
      if (!wsConfig) continue; // 跳过已删除的工坊类型（如兽栏）
      const level = wsData.level || 1;
      const capacity = WORKSHOP_LEVEL_EFFECTS[level]?.capacity || 1;
      const requirement = getWorkshopUpgradeRequirement(level);
      const assignedPets = world.栖息地?.slice(0, maxSlots).filter(p => p.工坊 === wsName) || [];
      const pets = assignedPets.map(p => {
        const petIndex = world.栖息地.indexOf(p);
        const traits = (p.特性 && p.特性.length > 0) ? ` [${p.特性.join(',')}]` : '';
        return `  [${1001 + petIndex}] ${getEnergyIcon(p.精力 ?? 100)} ${p.name}（${p.type}·${p.品级}·Lv.${p.等级 || 1}）${traits}`;
      }).join('\n');

      const upgradeText = requirement
        ? `；下级需界源矿石/工坊构件各${requirement.hours}`
        : '；已满级';
      lines.push(`${wsConfig.icon} ${wsName} Lv.${level}（${assignedPets.length}/${capacity}）${upgradeText}`);
      if (pets) lines.push(pets);
    }

    // 在栖息地休息玩耍的仙宠
    const restingPets = world.栖息地?.slice(0, maxSlots).filter(p => !p.工坊 && !p.累倒) || [];
    if (restingPets.length > 0) {
      lines.push(`🏠 栖息地（休息/守卫）：`);
      for (const p of restingPets) {
        const status = p.守卫
          ? `守卫中（拦截率${Math.round(calculateGuardInterceptChance(p) * 100)}%）`
          : getWorkDescription(p, 0);
        const petIndex = world.栖息地.indexOf(p);
        lines.push(`  [${1001 + petIndex}] ${getEnergyIcon(p.精力 ?? 100)} ${p.name} — ${status}`);
      }
    }

    // 累倒休养中的仙宠
    const collapsedPets = world.栖息地?.slice(0, maxSlots).filter(p => p.累倒) || [];
    if (collapsedPets.length > 0) {
      lines.push(`💤 休养中：`);
      for (const p of collapsedPets) {
        const petIndex = world.栖息地.indexOf(p);
        lines.push(`  [${1001 + petIndex}] ${p.name} — ${getWorkDescription(p, 0)}`);
      }
    }

    const inactivePets = world.栖息地?.slice(maxSlots) || [];
    if (inactivePets.length > 0) {
      lines.push(`⚠️ 超出上限（${inactivePets.length}只，暂不工作/守卫）：`);
      for (const p of inactivePets) {
        const petIndex = world.栖息地.indexOf(p);
        lines.push(`  [${1001 + petIndex}] ${p.name} — 请装备扩容道具或召回`);
      }
    }

    e.reply(lines.join('\n'));
    return true;
  }

  // 驯服野生仙兽
  async tameBeast(e) {
    if (!e.isGroup) return;
    const usr_qq = e.user_id;
    const player_qq = await channel(usr_qq);

    let world = data.xiaoshijie.find(w => w.player_qq === player_qq);
    if (!world) {
      e.reply('请先使用 #开辟小世界 创建你的小世界');
      return true;
    }

    if (!world.驯服状态 || !world.驯服状态.active) {
      e.reply('当前没有可驯服的野生仙兽！\n在收获小世界资源时有概率遇到野生仙兽');
      return true;
    }

    // 检查是否过期
    const expires = new Date(world.驯服状态.expires);
    if (new Date() > expires) {
      world.驯服状态.active = false;
      const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
      data.xiaoshijie[worldIndex] = world;
      e.reply('野生仙兽已经逃走了…下次请及时驯服（有效期30分钟）');
      return true;
    }

    // 检查封灵符
    const hasFengling = await exist_najie_thing(player_qq, '普通封灵符', '道具');
    const hasShangpin = await exist_najie_thing(player_qq, '上品封灵符', '道具');
    const hasJipin = await exist_najie_thing(player_qq, '极品封灵符', '道具');

    if (!hasFengling && !hasShangpin && !hasJipin) {
      e.reply('需要封灵符才能驯服仙兽！\n封灵符品质：普通(50%)、上品(70%)、极品(90%)');
      return true;
    }

    // 优先使用最高品质封灵符
    let talismanName = '普通封灵符';
    let baseRate = 0.5;
    if (hasJipin > 0) { talismanName = '极品封灵符'; baseRate = 0.9; }
    else if (hasShangpin > 0) { talismanName = '上品封灵符'; baseRate = 0.7; }

    // 消耗封灵符
    await Add_najie_thing(player_qq, talismanName, '道具', -1);

    const beast = world.驯服状态;
    const successRate = baseRate + (1 - beast.beast_hp / 100) / 2;
    const roll = Math.random();

    if (roll < successRate) {
      // 驯服成功
      const newPet = {
        id: data.xianchon.find(item => item.name === beast.beast_name)?.id
          || Date.now() % 100000 + 2900,
        name: beast.beast_name,
        class: '仙宠',
        type: beast.beast_type,
        atk: 1, def: 1, HP: 1,
        初始加成: 0.005,
        每级增加: 0.001,
        加成: 0.005,
        灵魂绑定: 0,
        品级: beast.beast_quality,
        等级: 1,
        等级上限: { '仙胎': 20, '仙仔': 40, '仙兽': 60, '仙道': 80, '仙灵': 100 }[beast.beast_quality] || 20,
        获取难度: 10,
        出售价: 100000,
        特性: beast.beast_traits || []
      };

      // 按完整实例写入，避免同名同级但特性不同的野外仙宠被错误合并。
      const najie = await Read_najie(player_qq);
      const 加成 = newPet.等级 * newPet.每级增加;
      addInventoryPetVariant(najie, {
        ...newPet,
        加成,
      });
      await Write_najie(player_qq, najie);

      world.驯服状态.active = false;
      const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
      data.xiaoshijie[worldIndex] = world;
      const libPath = `${data.lib_path}/小世界列表.json`;
      fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));

      const traitsStr = beast.beast_traits?.map(t => `【${t}】${PET_TRAITS[t]?.desc || ''}`).join('\n') || '无';
      e.reply([
        `✨ 驯服成功！`,
        `【${beast.beast_name}】已被驯服并收入纳戒！`,
        `品级：${beast.beast_quality} | 类型：${beast.beast_type}`,
        `特性：\n${traitsStr}`,
        `使用 #安置仙宠${beast.beast_name} 将它安置到小世界`
      ].join('\n'));
    } else {
      // 驯服失败
      world.驯服状态.active = false;
      const worldIndex = data.xiaoshijie.findIndex(w => w.player_qq === player_qq);
      data.xiaoshijie[worldIndex] = world;
      const libPath = `${data.lib_path}/小世界列表.json`;
      fs.writeFileSync(libPath, JSON.stringify(data.xiaoshijie, null, 2));

      e.reply(`💨 ${beast.beast_name}挣脱了封灵符，逃入山林深处…\n${talismanName}已被消耗`);
    }

    return true;
  }

}
export async function get_xiaoshijie_img(e) {
    try {
        const usr_qq = e.user_id;
        const player_qq = await channel(usr_qq);
        
        // 验证玩家是否存在
        if (!data.existData('player', usr_qq)) {
            return e.reply('玩家数据不存在');
        }
        
        // 获取玩家数据
        const player = await data.getData('player', usr_qq);
        
        // 确保小世界列表存在
        if (!data.xiaoshijie) {
            data.xiaoshijie = [];
        }
        
        // 获取玩家小世界
        const world = data.xiaoshijie.find(w => w.player_qq === player_qq);
        if (!world) {
            return e.reply('请先使用 #开辟小世界 创建您的小世界');
        }

        // 数据迁移
        migrateWorldData(world);

        // 确保属性存在
        world.attributes = world.attributes || {};
        world.attributes.时间流速 = world.attributes.时间流速 || '1:1';
        world.attributes.特殊资源 = world.attributes.特殊资源 || [];
        world.attributes.药田上限 = world.attributes.药田上限 || 0;
        
        // 获取等级名称
        const levelName = WORLD_LEVELS[world.level]?.name || `未知等级${world.level}`;
        
        // 计算时间比率
        const timeFlow = world.attributes.时间流速.split(':');
        const timeRatio = parseInt(timeFlow[1]) / parseInt(timeFlow[0]);
        
        // 准备渲染数据
        const renderData = {
            user_id: usr_qq,
            nickname: player.名号 || "未知玩家",
            world_name: world.world_name || "未命名小世界",
            level: world.level,
            level_name: levelName,
            creation_time: world.creation_time,
            last_upgrade_time: world.last_upgrade_time || "从未升级",
            attributes: world.attributes,
            description: getWorldDescription(world.level),
            unlockedCount: world.药田?.length || 0,
            totalCount: world.attributes.药田上限,
            timeRatio: timeRatio,
            // 添加预计算描述文本
            spirit_desc: world.attributes.灵气浓度 > 5000 
                ? '灵气充盈，适宜修炼' 
                : '灵气稀薄，需提升',
            area_desc: world.level > 2
                ? '山川河流，自成天地'
                : '初具规模，尚需扩展',
            capacity_desc: world.attributes.药田上限 > (world.药田?.length || 0)
                ? '可种植更多灵植'
                : '药田已满',
            habitatCount: world.栖息地?.length || 0,
            habitatMax: (world.attributes.栖息地上限 || 1) + getHabitatSlotBonus(player),
            habitat_desc: ((world.attributes.栖息地上限 || 1) + getHabitatSlotBonus(player)) > (world.栖息地?.length || 0)
                ? '可安置更多仙宠'
                : '栖息地已满',
            progressPercent: ((world.药田?.length || 0) / world.attributes.药田上限 * 100).toFixed(1),
            now: new Date().toLocaleString()
        };
        
        // 生成特殊资源HTML
        renderData.special_resources_html = generateSpecialResourcesHTML(world);
        
        // 生成药田信息HTML
        renderData.medicine_field_html = generateMedicineFieldHTML(world, timeRatio);
        
        // 生成分身信息HTML
        renderData.avatar_html = generateAvatarHTML(world, timeRatio);

        // 生成栖息地HTML
        renderData.habitat_html = generateHabitatHTML(world);

        // 生成事件记录HTML
        renderData.events_html = generateEventsHTML(world);
        
        // 获取渲染数据并生成截图
        const templateData = await new Show(e).get_xiaoshijieData(renderData);
        return await puppeteer.screenshot('xiaoshijie', templateData);
        
    } catch (err) {
        console.error('生成小世界截图错误:', err);
        return e.reply('处理小世界数据时发生错误');
    }
}

// 生成特殊资源HTML
function generateSpecialResourcesHTML(world) {
    const resources = [...(world.attributes.特殊资源 || [])];
    if (world.败天神殿) resources.unshift(BAITIAN_TEMPLE_NAME);
    if (resources.length === 0) {
        return '<div class="no-content"><i class="fas fa-box-open"></i>暂无特殊资源</div>';
    }
    
    return resources.map(res => {
        const iconClass = getResourceIcon(res);
        return `
            <div class="resource-chip">
                <div class="resource-chip-icon"><i class="fas ${iconClass}"></i></div>
                <div class="resource-chip-name">${res}</div>
            </div>
        `;
    }).join('');
}

// 生成药田信息HTML
function generateMedicineFieldHTML(world, timeRatio) {
    if (!world.药田 || world.药田.length === 0) {
        return '<div class="no-content"><i class="fas fa-seedling"></i>药田暂无神药种植</div>';
    }

    const now = new Date();

    return world.药田.map(plant => {
        const seedConfig = SHENYAO_SEEDS[plant.种子];
        if (!seedConfig) return '';

        // 计算已生长的有效秒数
        const startTime = new Date(plant.种植时间 || plant.阶段开始时间);
        const elapsedMs = now - startTime;
        if (elapsedMs < 0) {
            // 时间异常卡片
            return `
                <div class="field-card">
                    <div class="field-card-head">
                        <div class="plant-avatar">
                            <i class="fas fa-exclamation-triangle" style="color:#f00"></i>
                        </div>
                        <div class="plant-info">
                            <div class="plant-name">时间异常</div>
                            <div class="plant-seed">${plant.种子}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        const elapsedSeconds = elapsedMs / 1000;

        // 计算生长速率
        const growthRate = world.attributes.灵气浓度 / (seedConfig.requirements?.灵气浓度 || 1);
        const bonusSeconds = plant.时间加成 || 0;
        const totalGrowthTime = elapsedSeconds * timeRatio * growthRate + bonusSeconds;

        // 计算所需总有效秒数（每1000灵气浓度=4小时=14400秒）
        const baseConc = seedConfig.requirements?.灵气浓度 || 1000;
        const requiredTime = (baseConc / 1000) * 14400;

        // 判断是否成熟
        const isMature = totalGrowthTime >= requiredTime;

        // 计算剩余真实时间
        let remainingText = '已成熟，可收获';
        let progressPercent = 100;
        let remainingPct = 0;

        if (!isMature) {
            const remainingGrowthTime = requiredTime - totalGrowthTime;
            // 转换为真实剩余时间
            const realRemaining = remainingGrowthTime / (timeRatio * growthRate);
            remainingPct = 1 - (totalGrowthTime / requiredTime);

            const days = Math.floor(realRemaining / 86400);
            const hours = Math.floor((realRemaining % 86400) / 3600);
            const minutes = Math.floor((realRemaining % 3600) / 60);

            if (days > 0) remainingText = `${days}天${hours}小时${minutes}分钟`;
            else if (hours > 0) remainingText = `${hours}小时${minutes}分钟`;
            else remainingText = `${minutes}分钟`;

            progressPercent = (totalGrowthTime / requiredTime * 100);
        }

        // 根据剩余百分比获取展示阶段
        let displayStage = 5;
        if (!isMature) {
            if (remainingPct > 0.8) displayStage = 1;
            else if (remainingPct > 0.6) displayStage = 2;
            else if (remainingPct > 0.4) displayStage = 3;
            else if (remainingPct > 0.2) displayStage = 4;
            else displayStage = 5;
        }

        const stageInfo = SHENYAO_STAGES[displayStage];
        const stageClass = `stage-${displayStage}`;
        const plantIcon = isMature ? 'fa-spa' : 'fa-seedling';

        return `
            <div class="field-card${isMature ? ' mature' : ''}">
                <div class="field-card-head">
                    <div class="plant-avatar${isMature ? ' mature' : ''}">
                        <i class="fas ${plantIcon}" style="color:${isMature ? '#f0c060' : '#70d890'}"></i>
                    </div>
                    <div class="plant-info">
                        <div class="plant-name${isMature ? ' mature' : ''}">${seedConfig.harvest}</div>
                        <div class="plant-seed">${plant.种子}</div>
                    </div>
                    <span class="stage-badge ${stageClass}">${stageInfo.name} ${displayStage}/5</span>
                </div>
                <div class="field-card-body">
                    <div class="field-stats-row">
                        <div class="field-stat-item">
                            <div class="fsi-label">剩余时间</div>
                            <div class="fsi-val${isMature ? ' hi' : ''}">${remainingText}</div>
                        </div>
                        <div class="field-stat-item">
                            <div class="fsi-label">种植时间</div>
                            <div class="fsi-val" style="font-size:12px">${plant.种植时间 || plant.阶段开始时间 || '未知'}</div>
                        </div>
                    </div>
                    <div class="field-progress">
                        <div class="fp-header">
                            <span>成熟总进度</span>
                            <span>${isMature ? '已成熟' : progressPercent.toFixed(1) + '%'}</span>
                        </div>
                        <div class="fp-track">
                            <div class="fp-fill${isMature ? ' mature-fill' : ''}" style="width:${progressPercent.toFixed(1)}%"></div>
                        </div>
                    </div>
                    <div style="margin-top:8px;font-size:11px;color:#a0b8c8">阶段描述：${stageInfo.desc || '—'}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 生成分身信息HTML
function generateAvatarHTML(world, timeRatio) {
    if (!world.avatar) {
        return '';
    }
    
    const now = new Date();
    const lastHarvest = new Date(world.avatar.last_harvest_time);
    const hoursPassed = (now - lastHarvest) / (1000 * 60 * 60);
    const accumulation = calculateWorldAccumulation(hoursPassed, timeRatio);
    const harvestRealHours = accumulation.realHours;
    const harvestHours = accumulation.effectiveHours;
    
    // 计算可收获资源量
    const resources = calculateResources(world, harvestHours);
    
    // 构建资源卡片HTML（新样式）
    const resourcesHTML = Object.entries(resources).map(([name, value]) => {
        const iconClass = getResourceIcon(name);
        const desc = getResourceDesc(name);
        return `
            <div class="avatar-stat-card">
                <div class="asc-icon"><i class="fas ${iconClass}"></i></div>
                <div class="asc-label">${name}</div>
                <div class="asc-val">${value}</div>
                <div class="asc-sub">${desc}</div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="section-block" style="margin-bottom:20px">
            <div class="section-head">
                <div class="section-icon si-purple"><i class="fas fa-user-circle"></i></div>
                <div class="section-title-text">分身状态</div>
                <span style="font-size:13px;color:#a0a8c8">上次收获：${world.avatar.last_harvest_time}</span>
            </div>
            <div class="section-body">
                <div class="avatar-grid">
                    <div class="avatar-stat-card">
                        <div class="asc-icon"><i class="fas fa-user-clock"></i></div>
                        <div class="asc-label">已积累时间</div>
                        <div class="asc-val">${harvestRealHours.toFixed(1)} 小时</div>
                        <div class="asc-sub">世界内等效 ${harvestHours.toFixed(1)} 小时 · 上限 ${MAX_WORLD_ACCUMULATION_HOURS} 小时</div>
                    </div>
                    ${resourcesHTML}
                    <div class="avatar-stat-card">
                        <div class="asc-icon"><i class="fas fa-hourglass-half"></i></div>
                        <div class="asc-label">时间流速</div>
                        <div class="asc-val">${world.attributes.时间流速}</div>
                        <div class="asc-sub">加速 ${timeRatio} 倍</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 生成栖息地HTML
function generateHabitatHTML(world) {
    const hasPets = world.栖息地 && world.栖息地.length > 0;

    if (!hasPets) {
        return '<div class="no-content"><i class="fas fa-paw"></i>小世界暂无仙宠</div>';
    }

    // 按工坊分组（null = 在栖息地休息）
    const workshopGroups = {};
    for (const pet of world.栖息地) {
        const ws = pet.工坊 || '栖息地';
        if (!workshopGroups[ws]) workshopGroups[ws] = [];
        workshopGroups[ws].push(pet);
    }

    let html = '';

    // 先生成工坊分组
    const workshopOrder = ['灵田', '丹房', '器阁', '符台', '矿脉'];
    for (const wsName of workshopOrder) {
        const pets = workshopGroups[wsName];
        if (!pets || pets.length === 0) continue;

        const wsConfig = WORKSHOP_CONFIG[wsName];
        const level = world.工坊?.[wsName]?.level || 1;
        const capacity = WORKSHOP_LEVEL_EFFECTS[level]?.capacity || 1;
        const icon = wsConfig?.icon || '🏗️';

        html += buildWorkshopGroupHTML(wsName, icon, level, capacity, pets);
    }

    // 栖息地休息中的仙宠
    const restingPets = workshopGroups['栖息地'];
    if (restingPets && restingPets.length > 0) {
        html += `<div class="workshop-group">
            <div class="workshop-header" style="border-color: #4caf50;">
                <span class="workshop-icon">🏠</span>
                <span class="workshop-name">栖息地（休息/守卫）</span>
                <span class="workshop-count" style="color: #4caf50;">${restingPets.length}只</span>
            </div>
            <div class="habitat-grid">`;
        for (const pet of restingPets) {
            html += buildPetCardHTML(pet);
        }
        html += '</div></div>';
    }

    return html;
}

// 生成工坊分组HTML
function buildWorkshopGroupHTML(wsName, icon, level, capacity, pets) {
    let html = `<div class="workshop-group">
        <div class="workshop-header">
            <span class="workshop-icon">${icon}</span>
            <span class="workshop-name">${wsName}</span>
            <span class="workshop-level">Lv.${level}</span>
            <span class="workshop-count">${pets.length}/${capacity}</span>
        </div>
        <div class="habitat-grid">`;

    for (const pet of pets) {
        html += buildPetCardHTML(pet);
    }

    html += '</div></div>';
    return html;
}

// 生成单只仙宠卡片HTML
function buildPetCardHTML(pet) {
    const typeEmoji = {
        '战斗': '⚔️', '修炼': '🧘', '炼丹': '🔥',
        '炼器': '🔨', '幸运': '🍀', '制符': '📜'
    };
    const emoji = typeEmoji[pet.type] || '🐾';
    const energy = pet.精力 ?? 100;
    const maxEnergy = pet.最大精力 || 100;
    const energyPct = Math.max(0, Math.min(100, Math.round(energy / maxEnergy * 100)));
    const energyColor = energy >= 60 ? '#4caf50' : energy >= 30 ? '#ff9800' : energy > 0 ? '#f44336' : '#9e9e9e';
    const energyBarW = Math.round(energyPct * 0.8);
    const collapseTag = pet.累倒 ? '<span class="pet-collapse">💤 休养中</span>' : '';
    const guardTag = pet.守卫 && !pet.累倒
        ? '<span class="pet-collapse">🛡️ 守卫中</span>'
        : '';
    const traitsTag = (pet.特性 && pet.特性.length > 0)
        ? `<span class="pet-traits">${pet.特性.map(t => `【${t}】`).join('')}</span>`
        : '';
    const workStatus = collapseTag || (pet.守卫
        ? `守卫小世界 · 拦截率${Math.round(calculateGuardInterceptChance(pet) * 100)}%`
        : getWorkDescription(pet, 0));

    return `<div class="habitat-pet-card">
        <div class="pet-icon">${emoji}</div>
        <div class="pet-info">
            <div class="pet-name">${pet.name} ${collapseTag}${guardTag}</div>
            <div class="pet-meta">${pet.type} · ${pet.品级} · Lv.${pet.等级 || 1} ${traitsTag}</div>
            <div class="pet-energy-bar">
                <div class="pet-energy-fill" style="width:${energyBarW}px; background:${energyColor};"></div>
            </div>
            <div class="pet-energy-text">精力 ${energy}/${maxEnergy}</div>
            <div class="pet-work-status">${workStatus}</div>
        </div>
    </div>`;
}


// 生成事件记录HTML
function generateEventsHTML(world) {
    if (!world.事件记录 || world.事件记录.length === 0) {
        return '<div class="no-content"><i class="fas fa-scroll"></i>暂无近期事件</div>';
    }
    
    const recentEvents = world.事件记录.slice(-5);
    
    return recentEvents.map(event => {
        return `
            <div class="event-item">
                <div class="event-dot"></div>
                <div class="event-body">
                    <div class="event-time">${event.时间}</div>
                    <div class="event-desc">${event.事件}：${event.描述}</div>
                </div>
            </div>
        `;
    }).join('');
}


// 辅助函数：获取小世界描述
function getWorldDescription(level) {
    const descriptions = {
        1: '「混沌初开，万物始生」',
        2: '「鸿蒙初判，阴阳始分」',
        3: '「紫府洞天，仙家福地」',
        4: '「太虚仙境，超凡脱俗」',
        5: '「洪荒世界，开天辟地」'
    };
    return descriptions[level] || '「此界玄妙，难以言表」';
}

// 资源计算函数 - 与收获资源函数保持一致
function calculateResources(world, hours) {
    // 基础资源产量（根据小世界等级）
    const baseProduction = {
        1: { '灵石': 100000, '仙馐果': 50 },
        2: { '灵石': 200000, '仙馐果': 100, '灵矿': 5 },
        3: { '灵石': 300000, '仙馐果': 100, '灵矿': 10, '仙果': 5 },
        4: { '灵石': 500000, '仙馐果': 200, '灵矿': 10, '仙果': 10, '混沌元液': 3 },
        5: { '灵石': 800000, '仙馐果': 300, '灵矿': 20, '仙果': 15, '混沌元液': 5 }
    };
    
    // 获取基础产量
    const base = baseProduction[world.level] || baseProduction[1];
    const resources = {};
    for (const [res, amount] of Object.entries(base)) {
        resources[res] = Math.floor(amount * hours);
    }
    
    // 特殊资源加成 - 与收获资源函数保持一致
    if (world.attributes.特殊资源.includes('先天灵泉')) {
        resources['仙馐果'] = Math.floor(resources['仙馐果'] * 15);
    }
    if (world.attributes.特殊资源.includes('星辰矿脉')) {
        resources['灵矿'] = Math.floor((resources['灵矿'] || 0) * 15);
    }
    if (world.attributes.特殊资源.includes('混沌灵根')) {
        resources['混沌元液'] = Math.floor((resources['混沌元液'] || 0) * 15);
    }
    if (world.attributes.特殊资源.includes('太初神木')) {
        resources['仙果'] = Math.floor((resources['仙果'] || 0) * 15);
    }
    if (world.attributes.特殊资源.includes('虚空晶石')) {
        resources['灵石'] = Math.floor(resources['灵石'] * 15);
    }
    
    return resources;
}

// 获取资源图标类名
function getResourceIcon(resource) {
    if (resource.includes('泉')) return 'fa-water';
    if (resource.includes('矿')) return 'fa-gem';
    if (resource.includes('树')) return 'fa-tree';
    if (resource.includes('气')) return 'fa-wind';
    if (resource.includes('石')) return 'fa-diamond';
    if (resource.includes('果')) return 'fa-apple-alt';
    return 'fa-star';
}

// 获取资源描述
function getResourceDesc(resource) {
    if (resource === '灵石') return '可用于交易和修炼';
    if (resource === '仙馐果') return '可增加小许饱食度';
    if (resource === '灵矿') return '可用于卖些许灵石';
    if (resource === '仙果') return '提升小量修为与血气';
    if (resource === '混沌元液') return '提升大量修为与血气';
    return '珍稀资源';
}
