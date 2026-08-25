const NUMBER_FIELDS = [
  '攻击', '防御', '当前血量', '血量上限', '速度', '暴击率', '暴击伤害',
  '法球倍率', '魔道值', '神石', 'level_id', 'Physique_id', 'mijinglevel_id',
  'xiangulevel_id', 'huafenlevel_id', 'yuanshenlevel_id', '治疗效果加成', '闪避', '破防', '减伤',
  '无尽劫境最高层',
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanObject(value, maxBytes = 3000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const json = JSON.stringify(value);
    return Buffer.byteLength(json) <= maxBytes ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

export function createCrossRaidAvatar(player) {
  const avatar = {
    名号: String(player?.名号 || '无名化身').slice(0, 30),
    灵根: cleanObject(player?.灵根, 1000),
    学习的功法: (Array.isArray(player?.学习的功法) ? player.学习的功法 : [])
      .map((item) => String(typeof item === 'string' ? item : item?.name || ''))
      .filter(Boolean)
      .slice(0, 80),
    战斗技能配置: cleanObject(player?.战斗技能配置, 2000),
    功法熟练度: cleanObject(player?.功法熟练度, 3000),
    xiangu_shenhuo: cleanObject(player?.xiangu_shenhuo, 1500),
    无尽道碑: cleanObject(player?.无尽道碑, 2000),
    无尽劫境进阶: cleanObject(player?.无尽劫境进阶, 2000),
    无尽至宝列表: (Array.isArray(player?.无尽至宝列表) ? player.无尽至宝列表 : [])
      .map((item) => typeof item === 'string'
        ? item.slice(0, 60)
        : { id: String(item?.id || '').slice(0, 60), level: finiteNumber(item?.level) })
      .filter((item) => typeof item === 'string' ? item : item.id)
      .slice(0, 80),
    当前称号: String(player?.当前称号 || '').slice(0, 40),
    花粉极境: (Array.isArray(player?.花粉极境) ? player.花粉极境 : [])
      .map(String)
      .slice(0, 30),
    花粉路分支: String(player?.花粉路分支 || '').slice(0, 10),
  };
  for (const field of NUMBER_FIELDS) avatar[field] = finiteNumber(player?.[field]);
  avatar.当前血量 = avatar.血量上限;
  return avatar;
}

export function hydrateCrossRaidAvatar(source, identity = {}) {
  const avatar = createCrossRaidAvatar(source);
  const safeId = `${identity.serverId || 'world'}_${identity.memberTag || 'avatar'}`
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80);
  return {
    ...avatar,
    id: `cross_${safeId}`,
    user_id: `cross_${safeId}`,
    名号: `${avatar.名号}【${String(identity.serverName || '异界').slice(0, 20)}·化身】`,
    _跨服化身: true,
  };
}

export function buildCrossRaidSnapshot(team, run, options = {}) {
  const members = Object.values(run?.members || {}).map((member) => ({
    id: member.id,
    name: member.name,
    alive: member.alive !== false,
    hp: Math.max(0, Math.round(Number(member.hp) || 0)),
    maxHp: Math.max(1, Math.round(Number(member.maxHp) || 1)),
  }));
  const pending = Object.keys(run?.pendingChoices || {}).map(
    (id) => run?.members?.[id]?.name || team?.memberNames?.[id] || id
  );
  const choices = Object.entries(run?.pendingChoices || {}).map(([id, abilityIds]) => ({
    memberId: id,
    memberName: run?.members?.[id]?.name || team?.memberNames?.[id] || id,
    options: (Array.isArray(abilityIds) ? abilityIds : []).map((abilityId, index) => {
      const ability = options.resolveAbility?.(abilityId) || {};
      return {
        index: index + 1,
        name: String(ability.name || abilityId).slice(0, 50),
        rarity: String(ability.rarity || '').slice(0, 20),
        description: String(ability.description || '').slice(0, 180),
      };
    }),
  }));
  const battle = run?.lastBattle
    ? {
        layer: Number(run.lastBattle.layer) || Number(run.layer) || 0,
        enemy: String(
          typeof run.lastBattle.enemy === 'string'
            ? run.lastBattle.enemy
            : run.lastBattle.enemy?.name || run.lastBattle.enemyName || ''
        ).slice(0, 50),
        victory: Boolean(run.lastBattle.victory),
        rounds: Number(run.lastBattle.rounds) || 0,
        logs: (Array.isArray(run.lastBattle.logs) ? run.lastBattle.logs : [])
          .map(String)
          .slice(-30),
      }
    : null;
  return {
    layer: Math.max(0, Number(run?.layer) || 0),
    phase: String(run?.phase || team?.status || 'recruiting'),
    world: String(run?.lastBattle?.world || run?.currentWorld?.name || run?.world?.name || '').slice(0, 50),
    lifeFire: Math.max(0, Number(run?.lifeFire) || 0),
    maxLifeFire: Math.max(0, Number(run?.maxLifeFire) || 0),
    members,
    pending,
    choices,
    starOptions: (options.starOptions || []).slice(0, 3).map((item, index) => ({
      index: index + 1,
      name: String(item?.name || item?.shortName || `路线${index + 1}`).slice(0, 50),
      risk: String(item?.risk || '').slice(0, 20),
      description: String(item?.description || '').slice(0, 160),
    })),
    battle,
    updatedAt: Date.now(),
  };
}

export function formatCrossRaidSnapshot(raid) {
  const snapshot = raid?.snapshot;
  const status = {
    recruiting: '招募中',
    in_battle: '探索中',
    settled: '已结算',
    defeated: '已战败',
    closed: '已关闭',
  }[raid?.status] || raid?.status || '未知';
  const lines = [
    `【跨服无尽·${raid?.code || '未知'}】`,
    `主位面：${raid?.host_name || raid?.host_server_id || '未知'}｜状态：${status}`,
    `队伍：${Number(raid?.local_members) + (raid?.members?.length || 0)}/${raid?.max_members || 4}｜观战：${raid?.watchers?.length || 0}`,
  ];
  if (!snapshot) return lines;
  lines.push(
    `层数：${snapshot.layer}｜阶段：${snapshot.phase}｜命火：${snapshot.lifeFire}/${snapshot.maxLifeFire}`,
    ...snapshot.members.map((member) =>
      `${member.alive ? '存续' : '陨落'} ${member.name} ${member.hp}/${member.maxHp}`
    )
  );
  if (snapshot.pending?.length) lines.push(`待抉择：${snapshot.pending.join('、')}`);
  for (const choice of snapshot.choices || []) {
    lines.push(`【${choice.memberName}的能力选择】`);
    for (const option of choice.options)
      lines.push(`${option.index}. ${option.rarity ? `[${option.rarity}] ` : ''}${option.name}${option.description ? `：${option.description}` : ''}`);
  }
  if (snapshot.starOptions?.length) {
    lines.push('【劫途星图】', ...snapshot.starOptions.map((option) =>
      `${option.index}. ${option.name}${option.risk ? `｜${option.risk}` : ''}${option.description ? `：${option.description}` : ''}`
    ));
  }
  if (snapshot.battle) {
    lines.push(
      `最近战斗：第${snapshot.battle.layer}层 ${snapshot.battle.enemy || '劫境敌影'}｜${snapshot.battle.victory ? '胜利' : '战败'}｜${snapshot.battle.rounds}回合`,
      ...snapshot.battle.logs.slice(-8)
    );
  }
  if (raid?.chat?.length) {
    lines.push('', '【队伍传音】', ...raid.chat.slice(-5).map((item) =>
      `[${item.server_name}] ${item.name}：${item.text}`
    ));
  }
  return lines;
}
