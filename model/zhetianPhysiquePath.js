const REALM_NAMES = Object.freeze({
  7: '四极秘境',
  15: '准帝九重天',
});

export const ZHETIAN_PHYSIQUE_ROUTES = Object.freeze({
  太阳: Object.freeze({
    label: '太阳体',
    finalName: '太阳圣皇体',
    stages: Object.freeze([
      Object.freeze({
        from: '太阳之体',
        to: '太阳神体',
        minRealm: 7,
        skills: Object.freeze(['太阳真经']),
        item: Object.freeze({ name: '扶桑神枝', class: '材料', amount: 1 }),
        title: '太阳神体觉醒',
        description: '扶桑神枝引动太阳圣力，至阳本源贯通四极，太阳真火自血脉中苏醒。',
      }),
      Object.freeze({
        from: '太阳神体',
        to: '太阳圣皇体',
        minRealm: 15,
        skills: Object.freeze(['太阳真经·仙台卷', '大日涅槃诀']),
        title: '太阳神体大成',
        description: '太阳仙经贯通仙台，圣皇道痕加身，体质终于修至大成。',
      }),
    ]),
  }),
  太阴: Object.freeze({
    label: '太阴体',
    finalName: '太阴圣皇体',
    stages: Object.freeze([
      Object.freeze({
        from: '太阴之体',
        to: '太阴神体',
        minRealm: 7,
        skills: Object.freeze(['太阴真经']),
        item: Object.freeze({ name: '地命果', class: '道具', amount: 1 }),
        title: '太阴神体觉醒',
        description: '地命果化去太阴本源反噬，太阴圣力流转四极，神体不再受早夭之厄。',
      }),
      Object.freeze({
        from: '太阴神体',
        to: '太阴圣皇体',
        minRealm: 15,
        skills: Object.freeze(['太阴真经·仙台卷']),
        title: '太阴神体大成',
        description: '太阴仙经贯通仙台，至阴本源圆满，人皇道痕映照诸天。',
      }),
    ]),
  }),
  神王: Object.freeze({
    label: '神王体',
    finalName: '大成·神王体',
    stages: Object.freeze([
      Object.freeze({
        from: '神王体',
        to: '小成·神王体',
        minRealm: 7,
        skills: Object.freeze([]),
        title: '神王体小成',
        description: '四极齐震，神王异象化作一方净土，神体初步觉醒。',
      }),
      Object.freeze({
        from: '小成·神王体',
        to: '大成·神王体',
        minRealm: 15,
        skills: Object.freeze(['斗字秘']),
        requiresHengyuInheritance: true,
        title: '神王体大成',
        description: '斗战圣法与恒宇道痕交融，神王本源圆满，再生神术由此觉醒。',
      }),
    ]),
  }),
});

function hasSkill(player, name) {
  return Array.isArray(player?.学习的功法) && player.学习的功法.includes(name);
}

function hasHengyuInheritance(player) {
  return Boolean(
    player?.遮天帝经传承?.恒宇经?.completed || hasSkill(player, '恒宇经')
  );
}

export function getZhetianAwakeningStage(player, routeKey) {
  const route = ZHETIAN_PHYSIQUE_ROUTES[routeKey];
  if (!route) return { status: 'unknown-route' };
  const rootName = player?.灵根?.name;
  if (rootName === route.finalName) return { status: 'complete', route };
  const stage = route.stages.find(entry => entry.from === rootName);
  if (!stage) return { status: 'wrong-lineage', route };
  return { status: 'ready', route, stage };
}

export function inspectZhetianAwakening(player, routeKey, itemCounts = {}) {
  const state = getZhetianAwakeningStage(player, routeKey);
  if (state.status !== 'ready') return { ...state, ok: false, missing: [] };

  const { stage } = state;
  const missing = [];
  const realm = Number(player?.mijinglevel_id || 0);
  if (realm < stage.minRealm) {
    missing.push(`秘境体系需达到${REALM_NAMES[stage.minRealm]}`);
  }
  for (const skill of stage.skills) {
    if (!hasSkill(player, skill)) missing.push(`需掌握《${skill}》`);
  }
  if (stage.requiresHengyuInheritance && !hasHengyuInheritance(player)) {
    missing.push('需完成姜家祖地五日传承，获得完整《恒宇经》');
  }
  if (stage.item) {
    const count = Number(itemCounts[stage.item.name] || 0);
    if (count < stage.item.amount) {
      missing.push(`需要【${stage.item.name}】×${stage.item.amount}，当前${count}`);
    }
  }

  const expectedSource = 100 + Number(player?.灵根?.生命本源 || 0);
  if (Number(player?.生命本源) !== expectedSource) {
    missing.push('生命本源亏空，无法承受体质蜕变');
  }

  return { ...state, ok: missing.length === 0, missing };
}

export function applyZhetianAwakening(player, result, talents) {
  if (!result?.ok || !result.stage) throw new Error('觉醒条件尚未满足');
  const talent = talents.find(entry => entry.name === result.stage.to);
  if (!talent) throw new Error(`灵根数据缺失：${result.stage.to}`);
  player.灵根 = { ...talent };
  player.生命本源 = 100 + Number(player.灵根.生命本源 || 0);
  return player.灵根;
}
