import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relativePath =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const tribulationSource = read('../apps/User/zhetiandujie.js');
const guardSource = read('../apps/User/TribulationGuard.js');
const checkpointSource = read('../model/tribulationCheckpoint.js');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing section start: ${startMarker}`);
  assert.ok(end > start, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

function indexOfPattern(source, pattern, label) {
  const match = pattern.exec(source);
  assert.ok(match, `missing ${label}`);
  return match.index;
}

function findCall(source, name, fromIndex = 0) {
  const match = new RegExp(`\\b${name}\\s*\\(`, 'g');
  match.lastIndex = fromIndex;
  const found = match.exec(source);
  assert.ok(found, `missing call: ${name}`);

  const openIndex = source.indexOf('(', found.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char !== ')') continue;

    depth -= 1;
    if (depth === 0) {
      return {
        index: found.index,
        source: source.slice(found.index, index + 1),
        argumentsSource: source.slice(openIndex + 1, index),
      };
    }
  }

  assert.fail(`unterminated call: ${name}`);
}

function splitTopLevelArguments(source) {
  const args = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
    else if (char === ',' && round === 0 && square === 0 && curly === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const finalArgument = source.slice(start).trim();
  if (finalArgument) args.push(finalArgument);
  return args;
}

function assertOrdered(source, entries) {
  let previous = -1;
  for (const [label, pattern] of entries) {
    const relative = indexOfPattern(source.slice(previous + 1), pattern, label);
    previous += relative + 1;
  }
}

function referencedIdentifiers(source, candidates) {
  return [...candidates].filter(identifier =>
    new RegExp(`\\b${identifier.replace(/[$]/g, '\\$&')}\\b`).test(source));
}

test('圣人王劫在扣费前保存含纳戒的检查点', () => {
  const method = section(
    tribulationSource,
    'async shengrenwangleijie(e)',
    'async dashengleijie(e)',
  );
  const najieRead = indexOfPattern(method, /await\s+Read_najie\s*\(/, 'najie baseline read');
  const checkpointCall = findCall(method, 'createTribulationCheckpoint');
  const args = splitTopLevelArguments(checkpointCall.argumentsSource);
  const cultivationDebit = indexOfPattern(
    method,
    /player\.修为\s*-=\s*actual_need_exp/,
    'cultivation debit',
  );
  const vitalityDebit = indexOfPattern(
    method,
    /player\.血气\s*-=\s*actual_blood_need/,
    'vitality debit',
  );

  assert.ok(
    najieRead < checkpointCall.index,
    'najie baseline must be read before checkpoint creation',
  );
  assert.ok(checkpointCall.index < cultivationDebit, 'checkpoint must precede cultivation debit');
  assert.ok(checkpointCall.index < vitalityDebit, 'checkpoint must precede vitality debit');
  assert.ok(
    args.length >= 5,
    'najie baseline must use the checkpoint additional-baselines argument',
  );
  assert.match(args[4], /\bnajie\b/, 'checkpoint must include the najie baseline');
});

test('圣人王劫异常时恢复检查点，正常完成则在退出写盘后结算', () => {
  const method = section(
    tribulationSource,
    'async shengrenwangleijie(e)',
    'async dashengleijie(e)',
  );
  const checkpointCall = findCall(method, 'createTribulationCheckpoint');
  const settlementCall = findCall(method, 'settleTribulationCheckpoint', checkpointCall.index);
  const catchIndex =
    settlementCall.index +
    indexOfPattern(method.slice(settlementCall.index), /\bcatch\s*\(/, 'checkpoint recovery catch');
  const recoveryCall = findCall(method, 'restoreInterruptedTribulation', catchIndex);
  const exits = [...method.matchAll(/await\s+this\.exitTribulationState\s*\(/g)];
  const recoveryHelper = section(
    tribulationSource,
    'async restoreInterruptedTribulation(',
    '// ==== 遮天风格功法复活逻辑',
  );
  const modelRecoveryCall = findCall(recoveryHelper, 'recoverTribulationCheckpoint');

  assert.ok(
    catchIndex > checkpointCall.index,
    'recovery catch must cover the checkpointed mutation',
  );
  assert.ok(recoveryCall.index > catchIndex, 'the catch branch must invoke checkpoint recovery');
  assert.match(modelRecoveryCall.source, /restoreEquipment\s*:/);
  assert.match(modelRecoveryCall.source, /restoreNajie\s*:/);
  assert.match(modelRecoveryCall.source, /restorePlayer\s*:/);
  assert.ok(exits.length > 0, 'the successful path must exit tribulation state');
  for (const exit of exits) {
    assert.ok(
      exit.index < settlementCall.index,
      'checkpoint settlement must follow every exit write',
    );
  }
  assert.match(settlementCall.source, /attemptId/);
  const finalReply = indexOfPattern(
    method.slice(settlementCall.index),
    /await\s+e\.reply\s*\(\s*(?:finalBattleLog|battleLog\.join)/,
    'final tribulation reply',
  );
  assert.ok(finalReply > 0, 'the final reply must only be sent after checkpoint settlement');
});

test('圣人王劫以退出后重读的最终境界结算检查点', () => {
  const method = section(
    tribulationSource,
    'async shengrenwangleijie(e)',
    'async dashengleijie(e)',
  );
  const exitCall = findCall(method, 'exitTribulationState');
  const settlementCall = findCall(method, 'settleTribulationCheckpoint', exitCall.index);
  const afterExit = method.slice(exitCall.index + exitCall.source.length, settlementCall.index);
  const finalRead = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+Read_player\s*\(\s*usr_qq\s*\)/.exec(afterExit);
  assert.ok(finalRead, 'the player must be re-read after exitTribulationState and before settlement');

  const finalStateIdentifiers = new Set([finalRead[1]]);
  for (const declaration of afterExit.matchAll(
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g,
  )) {
    if (referencedIdentifiers(declaration[2], finalStateIdentifiers).length > 0) {
      finalStateIdentifiers.add(declaration[1]);
    }
  }

  const settlementArgs = splitTopLevelArguments(settlementCall.argumentsSource);
  assert.ok(settlementArgs.length >= 3, 'checkpoint settlement must include an outcome object');
  const outcome = settlementArgs[2];
  const result = /\bresult\s*:\s*([^,}\n]+)/.exec(outcome)?.[1] || '';
  const nextLevel = /\bnextLevel\s*:\s*([^,}\n]+)/.exec(outcome)?.[1] || '';
  assert.ok(result, 'checkpoint outcome must include result');
  assert.ok(nextLevel, 'checkpoint outcome must include nextLevel');
  assert.ok(
    referencedIdentifiers(result, finalStateIdentifiers).length > 0,
    'outcome result must derive from the player state read after exit',
  );
  assert.ok(
    referencedIdentifiers(nextLevel, finalStateIdentifiers).length > 0,
    'outcome nextLevel must derive from the player state read after exit',
  );
  assert.doesNotMatch(outcome, /\btribulationSucceeded\b/);
});

test('圣人王成功奖励只在截道结算后提交', () => {
  const method = section(
    tribulationSource,
    'async shengrenwangleijie(e)',
    'async dashengleijie(e)',
  );
  const exitCall = findCall(method, 'exitTribulationState');
  const settlementCall = findCall(method, 'settleTribulationCheckpoint', exitCall.index);
  const deferredEffects = [
    ['dao realm unlock', /unlockDaoRealm\s*\(\s*finalPlayer\s*,\s*13\s*\)/],
    ['potential debit', /finalPlayer\.仙道潜力\s*=\s*Math\.max/],
    ['dao injury clear', /finalPlayer\.道伤\s*=\s*0/],
    ['imperial weapon reward', /equipment\.帝兵\.圣人王\s*=\s*true/],
    ['success announcement', /【劫尽成王】/],
  ];

  for (const [label, pattern] of deferredEffects) {
    const effectIndex = indexOfPattern(method, pattern, label);
    assert.ok(effectIndex > exitCall.index, `${label} must follow ambush settlement`);
    assert.ok(effectIndex < settlementCall.index, `${label} must precede checkpoint settlement`);
  }

  const exitMethod = section(
    tribulationSource,
    'async exitTribulationState(',
    'async resolveTianjiaoTribulationAmbush(',
  );
  const ambushFailure = section(
    exitMethod,
    'if (ambush.defeated)',
    'refreshed.当前血量 = refreshed.血量上限',
  );
  assert.match(ambushFailure, /reason:\s*'ambushed'/);
  assert.match(ambushFailure, /success:\s*false/);
});

test('截道终局回复在圣人王检查点结算后发送，普通渡劫保持默认发送', () => {
  const method = section(
    tribulationSource,
    'async shengrenwangleijie(e)',
    'async dashengleijie(e)',
  );
  const exitCall = findCall(method, 'exitTribulationState');
  const exitArgs = splitTopLevelArguments(exitCall.argumentsSource);
  const settlementCall = findCall(method, 'settleTribulationCheckpoint', exitCall.index);
  const catchIndex = indexOfPattern(method, /\bcatch\s*\(error\)/, 'checkpoint recovery catch');
  const terminalReply = indexOfPattern(
    method,
    /await\s+e\.reply\s*\(\s*deferredAmbushFinalMessage\s*\)/,
    'deferred ambush final reply',
  );
  const battleLogReply = indexOfPattern(
    method,
    /await\s+e\.reply\s*\(\s*finalBattleLog\s*\)/,
    'final battle log reply',
  );

  assert.match(exitArgs.at(-1), /deferFinalReply\s*:\s*true/);
  assert.ok(settlementCall.index < catchIndex, 'checkpoint settlement must be covered by recovery');
  assert.ok(catchIndex < terminalReply, 'ambush terminal reply must follow the recovery catch');
  assert.ok(terminalReply < battleLogReply, 'ambush terminal reply must precede the final battle log');

  const exitMethod = section(
    tribulationSource,
    'async exitTribulationState(',
    'async resolveTianjiaoTribulationAmbush(',
  );
  assert.match(exitMethod, /options\s*=\s*\{\}/);
  assert.match(exitMethod, /deferFinalReply\s*===\s*true/);
  assert.match(exitMethod, /context\?\.e[\s\S]*?reply\s*\(\s*ambush\.finalMessage\s*\)/);

  const ambushResolver = section(
    tribulationSource,
    'async resolveTianjiaoTribulationAmbush(',
    '// ==== 理论最大攻击计算 ====',
  );
  assert.match(ambushResolver, /finalMessage\s*:\s*`【护劫成功】/);
  assert.match(ambushResolver, /finalMessage\s*:\s*\[[\s\S]*?'【截道成功·功亏一篑】'/);
  assert.doesNotMatch(
    ambushResolver,
    /context\.e\.reply\s*\(\s*`【护劫成功】/,
  );
  assert.doesNotMatch(
    ambushResolver,
    /context\.e\.reply\s*\(\s*\[\s*'【截道成功·功亏一篑】'/,
  );
});

test('渡劫守卫放行复活选择并在无锁检查点下持锁恢复三份基线', () => {
  const guard = section(guardSource, 'async guard(e)', '\n  }\n}');
  const revivalBypass = indexOfPattern(guard, /#复活选择/, 'manual revival bypass');
  const firstStateLookup = indexOfPattern(
    guard,
    /await\s+(?:getTribulationLockStatus|getTribulationCheckpoint|isTribulationLocked)\s*\(/,
    'tribulation state lookup',
  );
  const lockedRecovery = findCall(guard, 'withTribulationLock');

  assert.ok(
    revivalBypass < firstStateLookup,
    'manual revival choice must bypass the guard before lookup',
  );
  assert.match(guard.slice(0, firstStateLookup), /#复活选择[\s\S]*?return\s+false/);
  assert.match(guard.slice(0, lockedRecovery.index), /getTribulationCheckpoint\s*\(/);
  assert.match(guard.slice(0, lockedRecovery.index), /\.locked\b/);
  assert.match(guard.slice(0, lockedRecovery.index), /checkpoint\.exists\b/);
  assert.ok(
    guard.indexOf('.locked') < guard.indexOf('getTribulationCheckpoint('),
    'lock inspection must precede recovery of an unlocked checkpoint',
  );
  assert.match(lockedRecovery.source, /recoverTribulationCheckpoint\s*\(/);
  assertOrdered(lockedRecovery.source, [
    ['equipment restore callback', /restoreEquipment\s*:/],
    ['najie restore callback', /restoreNajie\s*:/],
    ['player restore callback', /restorePlayer\s*:/],
  ]);
  assertOrdered(lockedRecovery.source, [
    ['equipment baseline write', /Write_equipment\s*\(/],
    ['najie baseline write', /Write_najie\s*\(/],
    ['player baseline write', /Write_player\s*\(/],
  ]);

  const recoveryModel = section(
    checkpointSource,
    'export async function recoverTribulationCheckpoint',
    '\n}',
  );
  const terminalBranch = section(
    recoveryModel,
    'if (TERMINAL_STATUSES.has(current.checkpoint.status))',
    "if (typeof restoreEquipment !== 'function'",
  );
  assert.match(terminalBranch, /compareAndDeleteCheckpoint\s*\(/);
  assert.match(terminalBranch, /recovered:\s*false/);
  assert.doesNotMatch(terminalBranch, /restore(?:Equipment|Najie|Player)\s*\(/);
  assertOrdered(recoveryModel, [
    ['equipment recovery execution', /await\s+restoreEquipment\s*\(/],
    ['najie recovery execution', /await\s+restoreNajie\s*\(/],
    ['player recovery execution', /await\s+restorePlayer\s*\(/],
  ]);
});

test('渡劫状态提示展示远端租约剩余 TTL', () => {
  const guard = section(guardSource, 'async guard(e)', '\n  }\n}');
  const statusBranch = guard.slice(indexOfPattern(guard, /#渡劫状态/, 'status command'));

  assert.match(guard, /getTribulationLockStatus\s*\(/);
  assert.match(guard, /formatTribulationStatus\s*\(/);
  assert.match(statusBranch, /#恢复渡劫/);
  const presentation = read('../model/tribulationStatus.js');
  assert.match(presentation, /ttlSeconds/);
  assert.match(presentation, /(?:剩余|TTL)/);
  assert.match(presentation, /秒/);
});
