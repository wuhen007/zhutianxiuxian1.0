const isFormerBranch = value => value === '大宇' || value === '究极';

function flowerLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

/** Branch identity is independent of repeatable extreme attainments. A later
 * "究极根基" completion does not prove which branch a past evolution selected.
 * History is deliberately not read here: a new level-17 evolution chooses anew. */
export function getFlowerBranchState(player) {
  const level = flowerLevel(player?.huafenlevel_id);
  const current = player?.花粉路分支;
  const former = player?.花粉路前身分支;
  if (level < 17) return { level, branch: '', formerBranch: '', needsReview: false };

  if (level === 17) {
    const branch = isFormerBranch(current) ? current : isFormerBranch(former) ? former : '';
    return { level, branch, formerBranch: branch, needsReview: !branch };
  }

  // Every successful level-18 evolution converges into 宇究. Its earlier choice
  // may be absent in an old save; keep that distinction explicit.
  const formerBranch = isFormerBranch(former) ? former : isFormerBranch(current) ? current : '';
  return { level, branch: '宇究', formerBranch, needsReview: !formerBranch };
}

/** Normalize only branch identity; no realm, extreme reward or resource changes. */
export function normalizeFlowerBranchState(player) {
  const state = getFlowerBranchState(player);
  if (!player || typeof player !== 'object') return state;
  if (state.level >= 17) {
    player.花粉路分支 = state.branch;
    player.花粉路前身分支 = state.formerBranch;
  }
  return state;
}

/** Call after the original realm rollback, before clearing repeatable extremes.
 * The small record preserves evidence only and never restores future choices. */
export function preserveFlowerBranchAfterReforge(player, previousLevel, nextLevel, now = Date.now()) {
  const fromLevel = flowerLevel(previousLevel);
  const toLevel = flowerLevel(nextLevel);
  const before = getFlowerBranchState({ ...player, huafenlevel_id: fromLevel });
  if (fromLevel !== toLevel && fromLevel >= 17) {
    if (player.花粉分支回炉记录 === undefined) player.花粉分支回炉记录 = [];
    if (Array.isArray(player.花粉分支回炉记录)) {
      player.花粉分支回炉记录.push({
        fromLevel, toLevel, branch: before.branch, formerBranch: before.formerBranch,
        at: Number.isSafeInteger(now) && now > 0 ? now : Date.now(),
      });
    }
  }

  if (toLevel < 17) {
    delete player.花粉路分支;
    delete player.花粉路前身分支;
  } else {
    player.花粉路分支 = toLevel >= 18 ? '宇究' : before.formerBranch;
    player.花粉路前身分支 = before.formerBranch;
  }
  return getFlowerBranchState(player);
}
