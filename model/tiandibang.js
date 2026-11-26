export const TIANDIBANG_REWARDS = [
  { position: 1, 灵石: 17500000, 宝盒: 5 },
  { position: 2, 灵石: 13000000, 宝盒: 3 },
  { position: 3, 灵石: 9200000, 宝盒: 1 },
];

export function getTiandibangWeekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return [
    monday.getFullYear(),
    String(monday.getMonth() + 1).padStart(2, '0'),
    String(monday.getDate()).padStart(2, '0'),
  ].join('-');
}

export function getTiandibangSettlementKey(date = new Date()) {
  const closingDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
  return getTiandibangWeekKey(closingDate);
}

export function getTiandibangWinners(players) {
  return [...players]
    .filter(player => Number(player?.积分) > 0)
    .sort((a, b) => Number(b.积分) - Number(a.积分))
    .slice(0, TIANDIBANG_REWARDS.length);
}
