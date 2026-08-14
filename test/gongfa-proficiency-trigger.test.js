import assert from 'node:assert/strict';
import test from 'node:test';

import {
  awardRecordedCombatProficiency,
  recordGongfaCombatTrigger,
} from '../model/gongfaProficiency.js';

test('combat proficiency records each technique once and respects the daily cap', () => {
  const player = {
    ['\u5b66\u4e60\u7684\u529f\u6cd5']: ['\u6597\u5b57\u79d8'],
    ['\u529f\u6cd5\u719f\u7ec3\u5ea6']: { '\u6597\u5b57\u79d8': 0 },
  };

  assert.equal(recordGongfaCombatTrigger(player, '\u6597\u5b57\u79d8'), true);
  assert.equal(recordGongfaCombatTrigger(player, '\u6597\u5b57\u79d8'), true);
  assert.deepEqual(
    awardRecordedCombatProficiency(player, 1, { dateKey: '2026-08-13' }),
    { '\u6597\u5b57\u79d8': 1 },
  );
  assert.equal(player['\u529f\u6cd5\u719f\u7ec3\u5ea6']['\u6597\u5b57\u79d8'], 1);
  assert.equal(player['_' + '\u672c\u573a\u89e6\u53d1\u529f\u6cd5'], undefined);

  recordGongfaCombatTrigger(player, '\u6597\u5b57\u79d8');
  assert.deepEqual(
    awardRecordedCombatProficiency(player, 25, { dateKey: '2026-08-13' }),
    { '\u6597\u5b57\u79d8': 19 },
  );
  assert.equal(player['\u529f\u6cd5\u719f\u7ec3\u5ea6']['\u6597\u5b57\u79d8'], 20);
});
