import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import template from 'art-template';

import { buildAnnouncePresentation, buildAnnouncePage, loadAnnouncement, splitAnnounceDetail, ANNOUNCE_PAGE_SIZE } from '../model/announcePresentation.js';

test('公告只取本期内容并按标签归档', () => {
  const updates = [
    { tag: '新玩法', title: '甲', points: ['a'] },
    { tag: '新玩法', title: '乙', points: ['b'] },
    { tag: '调整', title: '丙', points: ['c'] },
    { tag: '修复', title: '丁', points: ['d', 'e'] },
    { tag: '旧闻', title: '不应出现', points: [] },
  ];
  const result = buildAnnouncePresentation(updates, 4);

  assert.equal(result.count, 4);
  assert.deepEqual(result.groups.map(group => group.label), ['新玩法', '调整', '修复']);
  assert.deepEqual(result.groups.flatMap(group => group.modules.map(module => module.no)), ['01', '02', '03', '04']);
  assert.deepEqual(result.stats.map(stat => stat.value), [2, 1, 2]);
  assert.equal(result.groups[0].modules[0].points[0].segments[0].text, 'a');
});

test('长提交说明按模块标记拆开', () => {
  assert.deepEqual(splitAnnounceDetail('【玩法】新增内容；【修复】结算正常；'), [
    { title: '玩法', text: '新增内容' },
    { title: '修复', text: '结算正常' },
  ]);
});

test('公告每页两模块，超过旧上限的本期内容也逐项可达', () => {
  const updates = Array.from({ length: 38 }, (_, i) => ({ tag: '新玩法', title: `模块${i}`, points: ['#测试 说明'] }));
  const announcement = { updates, currentUpdateCount: 37 };
  const seen = [];
  for (let page = 1; page <= 19; page++) {
    const result = buildAnnouncePage(announcement, page);
    const modules = result.updateGroups.flatMap(group => group.modules);
    assert.ok(modules.length <= ANNOUNCE_PAGE_SIZE);
    assert.equal(result.page, page);
    assert.equal(result.totalPages, 19);
    seen.push(...modules.map(module => module.title));
  }
  assert.deepEqual(seen, updates.slice(0, 37).map(item => item.title));
  assert.equal(buildAnnouncePage(announcement, 99).page, 19);
  assert.equal(buildAnnouncePage(announcement, -1).page, 1);
  assert.equal(buildAnnouncePage(announcement, 'nope').page, 1);
  const last = buildAnnouncePage(announcement, 19);
  assert.equal(last.updateGroups[0].modules[0].no, '37');
  assert.equal(last.pageEnd, 37);
  assert.equal(last.hasMore, false);
});

test('空公告与零本期数量不回放旧内容', () => {
  for (const ann of [{}, { updates: null }, { updates: [{ title: '历史' }], currentUpdateCount: 0 }]) {
    const page = buildAnnouncePage(ann, 5);
    assert.equal(page.totalPages, 1);
    assert.equal(page.pageStart, 0);
    assert.equal(page.pageEnd, 0);
    assert.deepEqual(page.updateGroups, []);
  }
});

test('真实公告分章模板完整渲染，图文与后端使用同一本期内容', () => {
  const ann = loadAnnouncement();
  const html = fs.readFileSync(new URL('../resources/html/announce/announce.html', import.meta.url), 'utf8');
  assert.match(ann.date, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.ok(ann.currentUpdateCount > 0);
  for (let page = 1; page <= Math.ceil(ann.currentUpdateCount / ANNOUNCE_PAGE_SIZE); page++) {
    const data = buildAnnouncePage(ann, page);
    const output = template.render(html, data);
    assert.equal((output.match(/<article class="module">/g) || []).length, data.pageEnd - data.pageStart + 1);
    assert.match(output, /#公告网页/);
    assert.ok(output.includes(`第 ${page} / ${data.totalPages} 页`));
    for (const item of ann.updates.slice(data.pageStart - 1, data.pageEnd)) assert.ok(output.includes(item.title));
    if (page > 1) assert.ok(!output.includes(ann.intro));
  }
  // 真实公告本期条数每版都会变，多页渲染改用构造数据覆盖，避免用例被条数绑架
  const many = {
    ...ann,
    updates: Array.from({ length: 7 }, (_, i) => ({ tag: '测试', title: `模块${i + 1}`, summary: '摘要', points: ['要点'] })),
    currentUpdateCount: 7,
  };
  const lastPage = Math.ceil(many.currentUpdateCount / ANNOUNCE_PAGE_SIZE);
  assert.ok(lastPage > 1);
  for (let page = 1; page <= lastPage; page++) {
    const data = buildAnnouncePage(many, page);
    const output = template.render(html, data);
    assert.equal((output.match(/<article class="module">/g) || []).length, data.pageEnd - data.pageStart + 1);
    assert.ok(output.includes(`第 ${page} / ${lastPage} 页`));
    for (const item of many.updates.slice(data.pageStart - 1, data.pageEnd)) assert.ok(output.includes(item.title));
    if (page > 1) assert.ok(!output.includes(ann.intro));
  }
  const escaped = template.render(html, buildAnnouncePage({ updates: [{ tag: '测试', title: '<script>alert(1)</script>', points: ['<img onerror=alert(1)>'] }] }));
  assert.ok(!escaped.includes('<script>'));
  assert.ok(!escaped.includes('<img onerror'));
});
