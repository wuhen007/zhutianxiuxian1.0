import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps/ShowImeg/Showningmeng.js', import.meta.url), 'utf8');
function fixture(fail = false) {
  const context = {
    plugin: class { constructor(options) { this.rule = options.rule; } },
    __PATH: { player_path: '' },
    get_announce_img: async e => `image:${e.msg}`,
    createAnnouncementWebLink: async () => { if (fail) throw new Error('fixture private path'); return 'https://example.test/announce'; },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('export class Showningmeng')).replace('export class', 'class') + '\nthis.App = Showningmeng;', context);
  return new context.App();
}

test('公告网页别名准确匹配且无需玩家存档或门禁', async () => {
  const app = fixture();
  const rule = app.rule.find(item => item.fnc === 'Show_announce_web');
  for (const cmd of ['#公告网页', '#更新公告网页', '#更新公告 HTML', '#更新公告html']) assert.match(cmd, new RegExp(rule.reg));
  for (const cmd of ['#更新公告2', '#更新公告', '#公告网页坏']) assert.ok(!new RegExp(rule.reg).test(cmd));
  const replies = [];
  await app.Show_announce_web({ reply: async text => replies.push(text) });
  assert.match(replies[0], /https:\/\/example\.test\/announce/);
  assert.match(replies[0], /#更新公告2/);
  await app.Show_announce({ msg: '#更新公告2', reply: async text => replies.push(text) });
  assert.equal(replies[1], 'image:#更新公告2');
});

test('网页未就绪保留图片指引，不向玩家泄露内部异常', async () => {
  const replies = [];
  await fixture(true).Show_announce_web({ reply: async text => replies.push(text) });
  assert.match(replies[0], /#更新公告/);
  assert.ok(!replies[0].includes('fixture private path'));
});
