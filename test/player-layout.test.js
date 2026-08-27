import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import template from 'art-template';

import { getPlayerLayout, parsePlayerLayoutCommand } from '../model/playerLayout.js';
import Show from '../model/show.js';

const playerTemplate = fs.readFileSync(
  new URL('../resources/html/player/player-2.html', import.meta.url),
  'utf8'
);

test('练气排版指令只接受排版1和2，旧存档默认排版1', () => {
  assert.equal(parsePlayerLayoutCommand('#切换练气排版1'), 1);
  assert.equal(parsePlayerLayoutCommand('#切换练气排版 2'), 2);
  assert.equal(parsePlayerLayoutCommand('#切换练气排版3'), null);
  assert.equal(getPlayerLayout({}), 1);
  assert.equal(getPlayerLayout({ 练气排版: 2 }), 2);
  assert.equal(getPlayerLayout({ 练气排版: 9 }), 1);
});

test('练气面板按玩家设置分流模板', async () => {
  const defaultData = await new Show({ user_id: '10001' }).get_playerData({ player: {} });
  const mythicData = await new Show({ user_id: '10001' }).get_playerData({ player: { 练气排版: 2 } });

  assert.match(defaultData.tplFile, /resources\/html\/player\/player\.html$/);
  assert.match(mythicData.tplFile, /resources\/html\/player\/player-2\.html$/);
});

test('切换指令已注册并持久化到玩家存档字段', () => {
  const source = fs.readFileSync(new URL('../apps/User/UserStart.js', import.meta.url), 'utf8');
  assert.ok(source.includes("reg: '^#切换练气排版\\\\s*[12]$'"));
  assert.match(source, /player\.练气排版 = layout/);
  assert.match(source, /await Write_player\(usr_qq, player\)/);
});

test('诸天命盘模板可由项目模板引擎完整编译', () => {
  const player = {
    练气排版: 2,
    名号: '万古星河道君',
    势力: '上苍仙庭',
    势力职位: '太上长老',
    护道人: '柳神',
    当前称号: '诸天道尊',
    称号列表: ['诸天道尊', '帝路先行者'],
    di_wei: '天帝',
    帝号: '太初天帝',
    sex: 1,
    源石: 12680,
    寿元: '与世长存',
    宣言: '一念花开，照见诸天万古',
    暴击伤害: 2.35,
    mijinglevel_id: 10,
    xiangulevel_id: 10,
    huafenlevel_id: 10,
    yuanshenlevel_id: 4,
    元神: 9120,
    元神上限: 10000,
    神识: '一念诸界',
    灵根: { type: '混沌', name: '混沌天灵根', 法球倍率: 0.365 },
    命格: { rarityName: '唯一', name: '万古归一', isNegative: false },
    附加命格: [{ rarityName: '仙帝', name: '纪元之子', isNegative: false }],
    天资等级: '超脱级',
    天资评价: '万古无一',
    occupation: '炼丹师',
    occupation_exp: 91200000,
    仙道潜力: 9999,
    修为: 826000000,
    血气: 743000000,
    生命本源: '九转不灭',
    修炼效率提升: 3.65,
    幸运: 0.888,
    镇妖塔层数: 99,
    神魄段数: 12,
    轮回点: 27,
    魔道值: 0,
    饱食度: '96 / 100',
    热量: 8640,
    daofa: '他化万古 / 一念永恒',
    仙宠: '',
  };
  const equipment = {
    武器: { id: 1, name: '岁月断空剑', 品阶: '祭道', atk: 1.28, def: 0.18, HP: 0.36, bao: '18%' },
    护具: { id: 4, name: '万劫不灭衣', atk: 0.12, def: 0.96, HP: 0.88, bao: '8%' },
    法宝: { id: 2, name: '因果诸天镜', atk: 0.46, def: 0.42, HP: 0.82, bao: '12%' },
    帝兵: { name: '纪元母金鼎', 品阶: '路尽', 全属性: '35%', atk: 1200000, def: 960000, HP: 8800000, bao: '20%' },
  };
  const html = template.render(playerTemplate, {
    pluResPath: '../../resources',
    pifu: 90,
    avatar: 'avatar.png',
    user_id: '123456789',
    player,
    player_action: '巡游诸天',
    PowerMini: '9.87 亿',
    rank_lianqi: '帝光仙王',
    rank_llianti: '不灭仙躯',
    rank_liandan: '丹道圣手',
    rank_xiuliantixi: '帝光仙王',
    rank_xiangujinshi: '无上巨头',
    rank_huafen: '恒王领域',
    yuanshen_level: '映照诸天',
    player_atk: '3.28 x 10',
    player_atk2: 6,
    player_def: '2.46 x 10',
    player_def2: 6,
    bao: '68%',
    shengming: '3280 万',
    shengming2: '3280 万',
    lingshi: '8.64 亿',
    strand_hp: { style: 'style="width:100%"' },
    this_association: { 宗门名称: '截天道宫', 职位: '老祖' },
    婚姻状况: '未结道契',
    occupation: '满级炼丹师',
    exp: '8.26 亿',
    exp2: '7.43 亿',
    expmax_lianqi: '10 亿',
    expmax_llianti: '10 亿',
    expmax_liandan: '1 亿',
    strand_lianqi: { num: 82.6 },
    strand_llianti: { num: 74.3 },
    strand_liandan: { num: 91.2 },
    strand_yuanshen: { num: 91.2 },
    攻击加成: '1.28 x 10',
    攻击加成_t: 2,
    防御加成: '9.60 x 10',
    防御加成_t: 1,
    生命加成: '1.82 x 10',
    生命加成_t: 2,
    neidan: '混沌帝丹',
    equipment,
    武器评级: '诸天唯一',
    护具评级: '路尽',
    法宝评级: '帝器',
    帝兵评级: '至高',
  });

  assert.match(html, /万古星河道君/);
  assert.match(html, /三道同证/);
  assert.match(html, /岁月断空剑/);
  assert.doesNotMatch(html, /{{|}}/);
});
