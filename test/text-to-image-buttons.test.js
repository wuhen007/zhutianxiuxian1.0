import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { commandButtonsFrom } from '../model/textToImage.js';

// textToImage 会连带官方代发那套模块，跑完主动收尾
after(() => setTimeout(() => process.exit(0), 50));

const flat = rows => rows.flat();

const CARD_1 = [
  '【红尘仙路·第1世】',
  '命題：斩旧我',
  '心魔：旧我执念',
  '可立世愿：',
  '- 化凡：修为血气消耗-15%，心魔威能-10%。',
  '当前世愿：未立',
  '选择后使用【#立下世愿 化凡/争渡/逆天】',
].join('\n');

const CARD_2 = [
  '【红尘仙法·总纲】',
  '天机老人没有告诉你一颗丹药或一件宝物的名字。',
  '你已知晓九世命题。每一世仍需推演本人的生门，并立下世愿。',
  '花费：5,000,000源石',
  '下一步：#推演红尘仙',
].join('\n');

test('括号指令块会拆成每个选项一个按钮', () => {
  const cmds = flat(commandButtonsFrom(CARD_1)).map(b => b.command);
  assert.deepEqual(cmds, ['#立下世愿 化凡', '#立下世愿 争渡', '#立下世愿 逆天']);
});

test('「下一步：#指令」这种行首写法也出按钮', () => {
  const cmds = flat(commandButtonsFrom(CARD_2));
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].command, '#推演红尘仙');
  assert.equal(cmds[0].text, '推演红尘仙');
});

test('不带括号的行首指令同样识别并拆选项', () => {
  const cmds = flat(commandButtonsFrom('立下世愿：\n#立下世愿 化凡/争渡/逆天')).map(b => b.command);
  assert.deepEqual(cmds, ['#立下世愿 化凡', '#立下世愿 争渡', '#立下世愿 逆天']);
});

test('正文里随口提到的 # 不会误判成按钮', () => {
  assert.equal(commandButtonsFrom('今天在群里聊了很久，还提到#话题 这事').length, 0);
  assert.equal(commandButtonsFrom('【修仙状态】\n修为：练气三层\n气血：100/100').length, 0);
});

test('引导词直接跟指令的老格式仍然识别', () => {
  const rows = commandButtonsFrom('想了解更多请发送 #修仙帮助');
  assert.equal(flat(rows)[0].command, '#修仙帮助');
});

test('一行并列多条指令、句末带句号也能拆对', () => {
  const cmds = flat(commandButtonsFrom('可执行：#推演红尘仙、#红尘仙帮助。')).map(b => b.command);
  assert.deepEqual(cmds, ['#推演红尘仙', '#红尘仙帮助']);
});
