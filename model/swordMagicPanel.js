// 剑与魔法·艾瑟兰 状态面板的视图模型（纯函数，不碰存档与渲染器，便于单测）
// 消费方：model/show.js#get_swordMagicPanelData → resources/html/sword_magic/sword_magic.html
import { SWORD_MAGIC_PROFESSIONS, SWORD_MAGIC_REGIONS, SWORD_MAGIC_TRAITS } from './swordMagic.js';

// 职业 → 立绘 / 英文角标 / 立绘说明
const PROFESSION_ART = Object.freeze({
  剑士: { key: 'swordsman', en: 'SWORDSMAN', desc: '以斗气和身法迎战，正面突破最为稳健。' },
  魔法师: { key: 'mage', en: 'MAGE', desc: '操纵元素与术式，擅长解析法阵。' },
  僧侣: { key: 'cleric', en: 'CLERIC', desc: '以誓愿引导圣术，擅长净化与庇护。' },
  游侠: { key: 'ranger', en: 'RANGER', desc: '追踪、射击与野外生存，擅长调查和迂回。' },
});
// 底部资源栏：铜币 + 四类可携带物（旧契约信图标 letter 暂留备用，本面板不展示）
const FOOTER_ITEMS = Object.freeze([
  { name: '铜币', icon: 'coin', label: '铜币' },
  { name: '古代晶片', icon: 'crystal', label: '古代晶片' },
  { name: '野营口粮', icon: 'ration', label: '野营口粮' },
  { name: '疗伤药', icon: 'potion_hp', label: '疗伤药' },
  { name: '魔力药', icon: 'potion_mp', label: '魔力药' },
]);
const TRAIT_DESC = Object.freeze(Object.fromEntries(SWORD_MAGIC_TRAITS.map(t => [t.id, t.name])));
const SKILL_ORDER = ['剑术', '魔法', '祷告', '侦察'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : fallback);
const pct = (cur, max) => (max > 0 ? clamp(Math.round((cur / max) * 1000) / 10, 0, 100) : 0);
const clock = ms => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total >= 3600) return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}`;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// 生命/魔力上限与 model/swordMagic.js 的 caps() 保持一致（面板是只读快照，公式重复在此不做收敛）
function caps(state) {
  const mana = Array.isArray(state.traits) && state.traits.includes('mana');
  return { hp: 100 + (int(state.level, 1) - 1) * 8, mp: 60 + (int(state.level, 1) - 1) * 6 + (mana ? 35 : 0) };
}

// 当前应展示的地区卡：遭遇 > 进行中的行动 > 下一个待探索地区 > 末章
function currentRegion(state) {
  const chapter = clamp(int(state.chapter), 0, SWORD_MAGIC_REGIONS.length);
  const index = state.encounter ? int(state.encounter.region)
    : state.action && Number.isFinite(Number(state.action.region)) && state.action.kind !== 'return'
      ? int(state.action.region)
      : clamp(chapter, 0, SWORD_MAGIC_REGIONS.length - 1);
  return { index, region: SWORD_MAGIC_REGIONS[index] };
}

export function buildSwordMagicPanel(state, { now = Date.now(), playerName = '异乡人' } = {}) {
  const limits = caps(state);
  const skills = state.skills || {};
  const primarySkill = state.profession ? SWORD_MAGIC_PROFESSIONS[state.profession]?.skill : '';
  const bag = state.bag || {};
  const atTown = (state.place || '白桦镇') === '白桦镇';
  const travelling = Boolean(state.encounter)
    || Boolean(state.action && Number.isFinite(Number(state.action.region)) && ['explore', 'choice'].includes(state.action.kind));
  const { region } = currentRegion(state);
  const chapter = clamp(int(state.chapter), 0, SWORD_MAGIC_REGIONS.length);
  const load = Object.values(bag).reduce((sum, n) => sum + int(n), 0)
    + Object.values(state.cargo || {}).reduce((sum, n) => sum + int(n), 0);

  // 行动条：进行中 → 倒计时；遭遇 → 抉择提示；其余 → 空闲态
  let action;
  if (state.action) {
    const total = Math.max(1, int(state.action.endAt) - int(state.action.startedAt));
    const left = Math.max(0, int(state.action.endAt) - int(now));
    action = { idle: false, title: state.action.title || '行动中',
      hint: '到期自动兑现，途中可 #剑与魔法 撤离', remain: clock(left),
      pct: clamp(Math.round(((total - left) / total) * 1000) / 10, 0, 100) };
  } else if (state.encounter) {
    action = { idle: false, title: `遭遇 · ${region.name}`,
      hint: `发送 #剑与魔法 抉择 ${region.choices.join(' / ')}`, remain: '抉择',
      pct: 100 };
  } else if (state.wounded) {
    action = { idle: true, title: '重伤未愈', hint: '休养或使用疗伤药后再出发', remain: '休整', pct: 0 };
  } else {
    action = { idle: true, title: '当前空闲', hint: '可训练、整理背包或探索地图', remain: '待命', pct: 0 };
  }

  const art = PROFESSION_ART[state.profession] || null;
  return {
    name: String(playerName || '异乡人'),
    nameTag: state.ending || '白桦镇的异乡人',
    profession: state.profession || '未就职',
    professionEn: art ? art.en : 'ADVENTURER',
    level: int(state.level, 1),

    hp: { cur: int(state.hp), max: limits.hp, pct: pct(int(state.hp), limits.hp) },
    mp: { cur: int(state.mp), max: limits.mp, pct: pct(int(state.mp), limits.mp) },
    coins: int(state.coins),
    exp: { cur: int(state.exp), max: int(state.level, 1) * 35, pct: pct(int(state.exp), int(state.level, 1) * 35) },
    load: { cur: load, max: 12 },
    weapon: { on: Boolean(state.weapon), text: state.weapon ? '已锻造' : '未锻造' },

    traits: (Array.isArray(state.traits) ? state.traits : [])
      .map(id => ({ id, name: TRAIT_DESC[id] || id }))
      .filter(trait => Boolean(trait.name)),
    skills: SKILL_ORDER.map(name => ({ name, value: int(skills[name]), max: 30,
      pct: pct(int(skills[name]), 30), primary: name === primarySkill })),

    place: state.place || '白桦镇',
    atTown,
    chapter,
    commissions: int(state.commissions),
    defeats: int(state.defeats),
    chapterTrack: SWORD_MAGIC_REGIONS.map((_, i) => i < chapter ? 'on' : i === chapter ? 'cur' : ''),

    region: {
      label: travelling ? 'CURRENT REGION' : chapter >= SWORD_MAGIC_REGIONS.length ? 'FINAL REGION' : 'NEXT DESTINATION',
      name: region.name,
      meta: `威胁 ${region.threat} ｜ 单程 ${region.minutes} 分钟 ｜ 推荐 Lv.${region.level}`,
      desc: region.intro,
      choices: [...region.choices],
    },
    caption: `主线 ${chapter} / ${SWORD_MAGIC_REGIONS.length} ｜ 公会委托 ${int(state.commissions)} 次 ｜ 重伤撤回 ${int(state.defeats)} 次`,
    professions: Object.entries(PROFESSION_ART).map(([name, art]) => ({ name, key: art.key, on: name === state.profession })),
    action,
    bonds: [
      state.companion
        ? { text: '巡礼僧侣莉娅同行 · 战后治疗 5', on: true }
        : { text: '尚无同行者', on: false },
      state.pact
        ? { text: '风精灵契约 · 施法消耗 −2', on: true }
        : { text: '尚未缔结精灵契约', on: false },
    ],

    footer: {
      items: FOOTER_ITEMS.map(item => {
        const count = item.name === '铜币' ? int(state.coins) : int(bag[item.name]);
        return { icon: item.icon, label: item.label, count, empty: count <= 0 };
      }),
      hint: '发送 <b>#剑与魔法 帮助</b> 查看规则 ｜ <b>#抽取异界词条</b> 抽天赋 ｜ <b>#我的纳戒</b> 查看物资',
    },
    portrait: art ? { ...art, name: state.profession } : null,
  };
}
