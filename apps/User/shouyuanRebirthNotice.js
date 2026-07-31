export function buildShouyuanRebirthNotice(playerName, playerId, waitMs) {
  const waitMinutes = Math.max(1, Math.ceil((Number(waitMs) || 0) / 60000));
  return [
    '【弥留之际·魂归轮回】',
    `${playerName || '此人'}（QQ：${playerId}）寿元已尽，残魂已被天道牵引至轮回往生路。`,
    `轮回路救援窗口：${waitMinutes}分钟；倒计时结束后将正式转世。`,
    '如需救援，请由符合境界要求的修士使用：#轮回救人 @目标',
    '若当前有轮回路执掌者，救援窗口结束后还需等待执掌者裁定。',
  ].join('\n');
}
