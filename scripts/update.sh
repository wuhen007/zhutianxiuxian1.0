#!/usr/bin/env bash
set -Eeuo pipefail

# Safe plugin update: snapshot runtime data, fast-forward from origin, then restart Yunzai.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKUP_ROOT="${XIUXIAN_UPDATE_BACKUP_DIR:-$PLUGIN_DIR/_backups/update}"
KEEP_BACKUPS="${XIUXIAN_UPDATE_KEEP_BACKUPS:-14}"
BOT_STOPPED=0
PM2_NAME=""

log() { printf '[zhutianxiuxian] %s\n' "$*"; }
die() { printf '[zhutianxiuxian] ERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die 'git is required'
command -v tar >/dev/null 2>&1 || die 'tar is required'
git -C "$PLUGIN_DIR" rev-parse --show-toplevel >/dev/null 2>&1 || die "$PLUGIN_DIR is not a git worktree"

stop_bot() {
  if [[ -n "${YUNZAI_STOP_CMD:-}" ]]; then
    bash -lc "$YUNZAI_STOP_CMD"
    BOT_STOPPED=1
    return
  fi

  if command -v pm2 >/dev/null 2>&1; then
    local candidate
    for candidate in "${YUNZAI_PM2_NAME:-}" yunzai Yunzai Miao-Yunzai; do
      [[ -n "$candidate" ]] || continue
      if pm2 describe "$candidate" >/dev/null 2>&1; then
        PM2_NAME="$candidate"
        pm2 stop "$PM2_NAME" >/dev/null
        BOT_STOPPED=1
        return
      fi
    done
  fi

  if [[ -n "${YUNZAI_SYSTEMD_SERVICE:-}" ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$YUNZAI_SYSTEMD_SERVICE"
    BOT_STOPPED=1
    return
  fi

  log 'No stop command detected; taking the snapshot while Yunzai is running.'
}

restart_bot() {
  if [[ -n "${YUNZAI_RESTART_CMD:-}" ]]; then
    bash -lc "$YUNZAI_RESTART_CMD"
    return
  fi
  if [[ -n "$PM2_NAME" ]]; then
    pm2 restart "$PM2_NAME" --update-env >/dev/null
    return
  fi
  if [[ -n "${YUNZAI_SYSTEMD_SERVICE:-}" ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl restart "$YUNZAI_SYSTEMD_SERVICE"
    return
  fi
  log 'Update finished, but Yunzai could not be restarted automatically.'
  log "Set YUNZAI_RESTART_CMD, for example: export YUNZAI_RESTART_CMD='pm2 restart yunzai'"
  return 1
}

cleanup() {
  local status=$?
  if (( status == 0 )); then
    restart_bot || status=$?
  elif (( BOT_STOPPED )); then
    log 'Update failed; attempting to start Yunzai again.'
    restart_bot || true
  fi
  exit "$status"
}
trap cleanup EXIT

stop_bot

timestamp="$(date +%Y%m%d_%H%M%S)"
backup_dir="$BACKUP_ROOT/$timestamp"
mkdir -p "$backup_dir"
log "Creating backup: $backup_dir"

git -C "$PLUGIN_DIR" status --short > "$backup_dir/git-status.txt" || true
git -C "$PLUGIN_DIR" diff --binary > "$backup_dir/local-tracked-changes.patch" || true
git -C "$PLUGIN_DIR" diff --cached --binary > "$backup_dir/local-staged-changes.patch" || true
printf 'plugin_dir=%s\ncreated_at=%s\n' "$PLUGIN_DIR" "$(date --iso-8601=seconds)" > "$backup_dir/manifest.txt"

archive_paths=(resources/data)
for optional_path in config/xiuxian config/task config/endless-web.json; do
  [[ -e "$PLUGIN_DIR/$optional_path" ]] && archive_paths+=("$optional_path")
done
tar -C "$PLUGIN_DIR" -czf "$backup_dir/runtime.tar.gz" "${archive_paths[@]}"

branch="$(git -C "$PLUGIN_DIR" symbolic-ref --quiet --short HEAD || true)"
[[ -n "$branch" ]] || die 'detached HEAD; checkout the branch you want to update first'
remote="${XIUXIAN_UPDATE_REMOTE:-origin}"
log "Pulling $remote/$branch"
git -C "$PLUGIN_DIR" fetch "$remote" --prune
git -C "$PLUGIN_DIR" pull --ff-only "$remote" "$branch"

if [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]]; then
  mapfile -t old_backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
  while (( ${#old_backups[@]} > KEEP_BACKUPS )); do
    rm -rf -- "$BACKUP_ROOT/${old_backups[0]}"
    old_backups=("${old_backups[@]:1}")
  done
fi

log 'Update completed successfully.'
