const VERSION_FIELD = '状态版本';
const snapshotVersions = new WeakMap();

export function getZhutianMirrorVersion(player) {
  const value = Number(player?.诸天镜系统?.[VERSION_FIELD]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function bumpZhutianMirrorVersion(player) {
  if (!player.诸天镜系统 || typeof player.诸天镜系统 !== 'object') {
    player.诸天镜系统 = {};
  }
  player.诸天镜系统[VERSION_FIELD] = getZhutianMirrorVersion(player) + 1;
  return player.诸天镜系统[VERSION_FIELD];
}

export function markZhutianMirrorSnapshot(player) {
  if (player && typeof player === 'object') {
    snapshotVersions.set(player, getZhutianMirrorVersion(player));
  }
  return player;
}

function getLoadedAvatarName(player) {
  const explicit = player?.诸天镜系统?.当前化身;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const rootName = String(player?.灵根?.name || '');
  return player?.诸天化身谱?.find(item => item?.root?.name === rootName)?.name || '';
}

function getRootIdentity(root) {
  if (!root || typeof root !== 'object') return '';
  return [root.id ?? '', root.name ?? '', root.type ?? ''].join('\u0000');
}

export function assertZhutianAvatarRootWriteAllowed(previousPlayer, nextPlayer) {
  if (!getLoadedAvatarName(previousPlayer)) return;
  const visibleChanged = getRootIdentity(previousPlayer?.灵根) !== getRootIdentity(nextPlayer?.灵根);
  const hiddenChanged = getRootIdentity(previousPlayer?.隐藏灵根) !== getRootIdentity(nextPlayer?.隐藏灵根);
  if (!visibleChanged && !hiddenChanged) return;
  if (getZhutianMirrorVersion(nextPlayer) > getZhutianMirrorVersion(previousPlayer)) return;

  const error = new Error('装载诸天化身期间禁止从外部改写灵根');
  error.code = 'ZHUTIAN_AVATAR_ROOT_MUTATION';
  throw error;
}

export function assertZhutianMirrorWriteCurrent(previousPlayer, nextPlayer) {
  const previousVersion = getZhutianMirrorVersion(previousPlayer);
  const nextVersion = getZhutianMirrorVersion(nextPlayer);
  const expectedVersion = snapshotVersions.get(nextPlayer);
  if (previousVersion <= nextVersion && (expectedVersion == null || expectedVersion === previousVersion)) return;

  const error = new Error(
    `玩家诸天镜状态已更新（读取${expectedVersion ?? nextVersion}，当前${previousVersion}，写入${nextVersion}），拒绝旧快照回写`,
  );
  error.code = 'ZHUTIAN_MIRROR_STALE_WRITE';
  throw error;
}
