import { SHENGXU_DUNGEONS } from './shengxuContent.js';

const DROP_FIELDS = ['one', 'two', 'three', 'four'];

const SHENGXU_SOURCES = Object.freeze({
  普通进化花粉: ['花粉路·感应异变', '圣墟副本·太行山', '圣墟副本·昆仑山', '圣墟副本·武当山', '圣墟势力·菩提基因'],
  灵性进化花粉: ['花粉路·感应异变', '圣墟副本·龙虎山', '圣墟副本·嵩山', '圣墟副本·终南山', '圣墟副本·泰山', '圣墟副本·顺天玉虚宫', '圣墟副本·大雷音寺遗址', '圣墟势力·大梦净土'],
  神性进化花粉: ['花粉路·感应异变', '圣墟副本·小阴间星路', '圣墟副本·阳间名山', '圣墟势力·阳间第一山'],
  无暇进化花粉: ['花粉路·感应异变', '圣墟副本·魂河古地'],
  净化花露: ['花粉路·感应异变', '圣墟势力俸禄'],
  形意呼吸法: ['圣墟副本·太行山', '圣墟副本·昆仑山', '圣墟副本·顺天玉虚宫'],
  太极呼吸法: ['圣墟副本·武当山', '圣墟副本·龙虎山'],
  大雷音呼吸法: ['圣墟副本·嵩山', '圣墟副本·大雷音寺遗址'],
  道引呼吸法: ['圣墟副本·终南山', '圣墟副本·泰山', '圣墟副本·小阴间星路', '圣墟副本·阳间名山'],
  盗引呼吸法: ['圣墟副本·魂河古地'],
  神秘石罐: ['全服唯一机缘·追寻石罐'],
});

const PLACE_SOURCES = [
  ['didian_list', '秘境'],
  ['guildSecrets_list', '宗门秘境'],
  ['forbiddenarea_list', '禁地'],
  ['Fairyrealm_list', '仙境'],
  ['timeplace_list', '仙府'],
  ['zhetian_list', '遮天位面'],
  ['xiajie_list', '下界八域'],
  ['jiutianshidi_list', '九天十地'],
  ['jiehai_list', '界海'],
  ['shangcang_list', '上苍之上'],
  ['shenjie', '神界'],
  ['mojie', '魔界'],
  ['shop_list', '坊市'],
];

const FLAT_SOURCES = [
  ['commodities_list', '柠檬堂'],
  ['tianjige_list', '天机阁'],
  ['tianjige2_list', '天机阁符楼'],
  ['shitujifen', '师徒积分商城'],
  ['tianditang', '天地堂'],
  ['yaochishangdian', '瑶池商店'],
  ['yaoguangshangdian', '摇光商店'],
  ['jianyunhaishangdian', '剑云海商店'],
  ['xingge', '星阁拍卖行'],
  ['xingge2', '星阁内场拍卖行'],
  ['xianchonxunbao', '仙宠探索'],
  ['bapin', '残卷兑换'],
  ['hecheng_list', '合成'],
  ['fuhua_list', '孵化'],
  ['danfang_list', '炼丹'],
  ['zhizuo_list', '制符'],
  ['tuzhi_list', '锻造'],
  ['changzhu', '常驻卡池'],
  ['xianding', '限定卡池'],
  ['changzhuxianchon', '仙宠卡池'],
  ['tuanbenjiangli', '团本'],
];

function containsNamedItem(value, itemName) {
  if (Array.isArray(value)) {
    return value.some(item => containsNamedItem(item, itemName));
  }
  if (!value || typeof value !== 'object') return false;
  if (value.name === itemName) return true;
  return Object.values(value).some(item => containsNamedItem(item, itemName));
}

function hasNamedItem(items, itemName) {
  return Array.isArray(items) && items.some(item => item?.name === itemName);
}

function formatPlace(label, placeName) {
  return !placeName || placeName === label ? label : `${label}·${placeName}`;
}

export function parseItemSearchQuery(message) {
  return String(message || '').replace(/^#哪里有\s*/, '').trim();
}

export function findItemSources(data, itemName) {
  const target = String(itemName || '').trim();
  if (!target) return [];

  const sources = new Set();
  for (const source of SHENGXU_SOURCES[target] || []) sources.add(source);
  for (const dungeon of SHENGXU_DUNGEONS) {
    if (dungeon.skills?.some(skill => skill.name === target)) {
      sources.add(`圣墟副本·${dungeon.name}`);
    }
  }
  for (const [key, label] of PLACE_SOURCES) {
    for (const place of Array.isArray(data?.[key]) ? data[key] : []) {
      if (DROP_FIELDS.some(field => hasNamedItem(place?.[field], target))) {
        sources.add(formatPlace(label, place?.name));
      }
      if (place?.inheritance?.scripture === target) {
        sources.add(`${formatPlace(label, place?.name)}·传承`);
      }
    }
  }

  for (const place of Array.isArray(data?.jingshenyuzhou_list)
    ? data.jingshenyuzhou_list
    : []) {
    for (const layer of Array.isArray(place?.layers) ? place.layers : []) {
      if (hasNamedItem(layer?.drops, target)) {
        sources.add(`精神宇宙·${place.name}·${layer.name}`);
      }
    }
  }

  for (const map of Object.values(data?.xunbao_list?.treasureMaps || {})) {
    if (containsNamedItem(map?.rewards, target)) {
      sources.add(`寻宝·${map.name}`);
    }
  }

  for (const [key, label] of FLAT_SOURCES) {
    if (hasNamedItem(data?.[key], target)) {
      sources.add(label);
    }
  }

  const processingRecipes = Array.isArray(data?.jiagong_list)
    ? data.jiagong_list
    : [];
  for (const recipe of processingRecipes) {
    if (hasNamedItem(recipe?.outputs, target)) {
      sources.add(`加工·${recipe.name}`);
    }
  }

  if (
    (Array.isArray(data?.GroupBossReward_list)
      ? data.GroupBossReward_list
      : []
    ).some(boss => hasNamedItem(boss?.one, target))
  ) {
    sources.add('若陀龙王团本');
  }

  return [...sources];
}
