import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XIANGU_ACADEMY_RANKS,
  applyAcademyPromotion,
  createAcademyRecord,
  getAcademyAdmission,
  getAcademyPromotion,
  getAcademySalary,
  selectAcademyBranch,
} from '../model/xianguAcademy.js';

test('只有位于九天十地的尊者境修士可以申请入院', () => {
  assert.equal(
    getAcademyAdmission({ power_place: 2.5, xiangulevel_id: 7 }).ok,
    true
  );
  assert.equal(
    getAcademyAdmission({ power_place: 2, xiangulevel_id: 7 }).reason,
    'plane'
  );
  assert.equal(
    getAcademyAdmission({ power_place: 2.5, xiangulevel_id: 6 }).reason,
    'realm'
  );
  assert.equal(
    getAcademyAdmission({
      power_place: 2.5,
      xiangulevel_id: 7,
      仙古院籍: { 学院: '天神书院' },
    }).reason,
    'joined'
  );
});

test('院籍按仙古境界和源石逐级晋升', () => {
  const record = createAcademyRecord(1000);
  const player = { xiangulevel_id: 8, 源石: 499999 };
  assert.equal(getAcademyPromotion(record, player).reason, 'cost');

  player.源石 = 500000;
  const promotion = getAcademyPromotion(record, player);
  assert.equal(promotion.ok, true);
  assert.equal(promotion.next.name, '内院弟子');
  applyAcademyPromotion(record, promotion.next, 2000);
  assert.equal(record.身份, '内院弟子');
  assert.equal(getAcademySalary(record), 500000);
});

test('境界不足不能用源石越级晋升', () => {
  const record = createAcademyRecord();
  const result = getAcademyPromotion(record, {
    xiangulevel_id: 7,
    源石: 999999999,
  });
  assert.equal(result.reason, 'realm');
  assert.equal(result.next.realmName, '神火境');
});

test('仙院和圣院只能选择一次', () => {
  const record = createAcademyRecord();
  assert.equal(selectAcademyBranch(record, '仙院').ok, true);
  assert.equal(record.分院, '仙院');
  assert.equal(selectAcademyBranch(record, '仙院').reason, 'same');
  assert.equal(selectAcademyBranch(record, '圣院').reason, 'chosen');
});

test('书院首席领取最高档俸禄且不能继续晋升', () => {
  const record = createAcademyRecord();
  record.身份 = XIANGU_ACADEMY_RANKS.at(-1).name;
  assert.equal(getAcademySalary(record), 12000000);
  assert.equal(
    getAcademyPromotion(record, { xiangulevel_id: 99, 源石: 999999999 }).reason,
    'max'
  );
});
