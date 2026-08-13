import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const anniversarySource = read('../apps/Anniversary/Anniversary.js');
const botHelpSource = read('../apps/Help/BotHelp.js');
const endlessSource = read('../apps/EndlessRealm.js');
const riftSource = read('../apps/PlaneRiftFestival.js');
const pathSource = read('../model/xiuxian.js');
const activityHelp = read('../config/help/huodonghelp.yaml');
const mainHelp = read('../config/help/help.yaml');
const zhutianHelp = read('../config/help/zhutianhelp.yaml');

test('皮肤帮助覆盖自选、上传与预览指令', () => {
  for (const command of [
    '#自选存档皮肤',
    '#上传练气皮肤',
    '#预览练气皮肤',
    '#上传纳戒皮肤',
  ]) {
    assert.match(mainHelp, new RegExp(command));
  }
  assert.equal(
    (anniversarySource.match(/usr_qq = await channel\(usr_qq\)/g) || []).length >= 3,
    true
  );
});

test('上传纳戒皮肤只接受横版JPG并自动应用', () => {
  assert.match(anniversarySource, /reg: '\^#上传纳戒皮肤/);
  assert.match(anniversarySource, /probeImageSize\.sync\(imageBuffer\)/);
  assert.match(anniversarySource, /dimensions\.width <= dimensions\.height/);
  assert.match(anniversarySource, /const validTypes = \["练气", "装备", "纳戒"\]/);
  assert.match(anniversarySource, /player\.纳戒皮肤 = skinId/);
  assert.match(pathSource, /najie_pifu_path: path\.join\(__dirname, '\/resources\/img\/najie_pifu'\)/);
});

test('诸天帮助保留无尽系统资料', () => {
  assert.match(zhutianHelp, /#无尽劫境帮助/);
  assert.match(zhutianHelp, /#无尽轮回帮助/);

  for (const command of [
    '#离开无尽队伍',
    '#解散无尽队伍',
    '#无尽网页',
    '#无尽购买 商品名\\*数量',
    '#重置万劫道碑 / #确认重置万劫道碑',
    '#万象归一 武器/护具/法宝\\*装备名',
  ]) {
    assert.match(endlessSource, new RegExp(command));
  }
});

test('星海之缘真实指令汇总到活动帮助', () => {
  for (const command of [
    '#星海之缘签到',
    '#召唤爱莉希雅',
    '#疯狂召唤爱莉希雅',
    '#奏响往世乐土之章',
    '#真我觉醒',
    '#创建讨伐队伍',
    '#发起讨伐',
    '#结算团本奖励',
  ]) {
    assert.match(activityHelp, new RegExp(command));
  }
});

test('活动帮助以星海、巡界与无尽劫境分组直接展开指令', () => {
  assert.match(mainHelp, /#活动帮助/);
  assert.match(botHelpSource, /reg: '\^#活动帮助\$'/);
  assert.match(botHelpSource, /ActivityHelp\.huodonghelp\(e\)/);
  assert.doesNotMatch(riftSource, /巡界活动\|巡界帮助\|太初星墟/);
  assert.doesNotMatch(mainHelp, /title: '#(?:星海之缘活动|无尽劫境帮助)'/);

  for (const group of ['#星海之缘活动', '#巡界帮助', '#无尽劫境帮助']) {
    assert.match(activityHelp, new RegExp(`group: '${group}'`));
    assert.equal((activityHelp.match(new RegExp(group, 'g')) || []).length, 1);
  }
  for (const command of [
    '#星海之缘签到', '#创建讨伐队伍', '#巡界签到', '#裂界副本',
    '#界源兑换', '#创建无尽队伍', '#劫途星图', '#无尽选择',
    '#无尽商店', '#万劫道碑', '#万象归一',
  ]) {
    assert.match(activityHelp, new RegExp(command));
  }
});
