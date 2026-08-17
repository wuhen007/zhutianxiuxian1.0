const NUMBER_FIELDS = [
  '攻击', '防御', '当前血量', '血量上限', '速度', '暴击率', '暴击伤害',
  '法球倍率', '魔道值', '神石', 'level_id', 'mijinglevel_id',
  'xiangulevel_id', 'huafenlevel_id', '治疗效果加成', '闪避', '破防', '减伤',
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
