export function getPlayerLayout(player) {
  return Number(player?.练气排版) === 2 ? 2 : 1;
}

export function parsePlayerLayoutCommand(message) {
  const match = String(message || '').trim().match(/^#切换练气排版\s*([12])$/);
  return match ? Number(match[1]) : null;
}
