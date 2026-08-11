import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import template from 'art-template';

const html = fs.readFileSync(
  new URL('../resources/html/endless_panel/endless_panel.html', import.meta.url),
  'utf8'
);
const css = fs.readFileSync(
  new URL('../resources/html/endless_panel/endless_panel.css', import.meta.url),
  'utf8'
);
const appSource = fs.readFileSync(new URL('../apps/EndlessRealm.js', import.meta.url), 'utf8');

const base = {
  pluResPath: '..',
  mode: 'help',
  eyebrow: 'INFINITE CALAMITY',
  title: '诸天无尽劫境',
  subtitle: '跨越诸天位面',
  mark: '∞',
  status: '劫境已开启',
  heroStats: [{ label: '天关循环', value: '10层', note: '第10层Boss' }],
  notices: [{ tone: 'danger', title: '死亡代价', text: '未封存奖励只保留30%' }],
  footerCommand: '#创建无尽队伍',
  footerNote: '先结队，再入境。',
};

test('无尽劫境帮助面板保留核心规则与指令', () => {
  const output = template.render(html, {
    ...base,
    commandGroups: [{
      kicker: 'ASSEMBLE',
      title: '结队入境',
      items: [{ command: '#创建无尽队伍', description: '建立远征队伍' }],
    }],
  });
  assert.match(output, /诸天无尽劫境/);
  assert.match(output, /未封存奖励只保留30%/);
  assert.match(output, /#创建无尽队伍/);
});

test('队伍、构筑与能力选项可由同一模板渲染', () => {
  const output = template.render(html, {
    ...base,
    mode: 'build',
    team: { id: '123456' },
    members: [{
      name: '荒古修士',
      leader: true,
      viewer: true,
      alive: true,
      hp: '80万',
      maxHp: '100万',
      hpPct: 80,
      attack: '12万',
      defense: '8万',
      abilities: [{ name: '他化自在法', level: 2 }],
      blessings: [{ kind: '帝法', name: '天帝拳' }],
    }],
    fusions: ['雷火灭世莲'],
    choiceGroups: [{
      name: '荒古修士',
      command: '#无尽选择1/2/3/4',
      hint: '衍算天机',
      choices: [{
        index: 1,
        name: '鬼眼',
        rarity: '稀有',
        rarityClass: 'rare',
        description: '开启鬼域与厉鬼拼图。',
        levelText: '初次参悟',
        tags: '瞳术 · 洞察',
      }],
    }],
  });
  assert.match(output, /他化自在法/);
  assert.match(output, /雷火灭世莲/);
  assert.match(output, /#无尽选择1\/2\/3\/4/);
});

test('万劫道碑面板显示道碑进度与拼图装配状态', () => {
  const output = template.render(html, {
    ...base,
    mode: 'meta',
    metaNodes: [{
      index: '01', name: '征伐道痕', rank: 3, maxRank: 10,
      description: '永久提高攻击。', progress: 30, next: '下一级消耗300道痕',
    }],
    puzzleNodes: [{
      name: '八音盒', rank: 1, description: '周期性打断敌方行动。',
      equipped: true, next: '已参悟圆满',
    }],
    puzzleEquipped: 1,
    puzzleSlots: 2,
  });
  assert.match(output, /征伐道痕/);
  assert.match(output, /八音盒/);
  assert.match(output, /已装配 1 \/ 2/);
});

test('劫途星图面板显示十层星轨、投票与定途指令', () => {
  const output = template.render(html, {
    ...base,
    mode: 'star-map',
    starMap: {
      targetLayer: 1,
      selectedName: '尚未定途',
      commandRange: '1/2',
      rows: Array.from({ length: 10 }, (_, index) => ({
        label: String(index + 1).padStart(2, '0'),
        current: index === 0,
        nodes: [{
          statusClass: index ? 'hidden' : 'future',
          current: index === 0,
          visible: index === 0,
          symbol: '战',
          displayName: index === 0 ? '征伐' : '未观测',
          displayWorld: index === 0 ? '完美世界' : '因果迷雾',
        }],
      })),
      seals: [{ name: '杀伐印', value: 1, note: '三印后Boss获得吸血' }],
      options: [{
        index: 1,
        risk: '寻常',
        riskClass: 'stable',
        symbol: '战',
        name: '完美世界·征伐劫星',
        description: '正面击溃当地怪潮。',
        rewardText: '基础战利品',
        votes: 2,
        voters: '荒古修士、无名修士',
      }],
    },
  });
  assert.match(output, /十层因果星轨/);
  assert.match(output, /完美世界·征伐劫星/);
  assert.match(output, /建议 2 票/);
  assert.match(output, /#星图定途1\/2/);
  assert.match(css, /grid-template-columns:\s*repeat\(10,/);
});

test('面板使用稳定宽度并禁止视口字号缩放', () => {
  assert.match(css, /width:\s*1032px/);
  assert.doesNotMatch(css, /font-size:\s*(?:clamp|min|max|calc)\(/);
});

test('面板支持二倍原生像素渲染', () => {
  const output = template.render(html, { ...base, renderScale: 2 });
  assert.match(output, /transform: scale\(2\)/);
  assert.match(output, /transform-origin: top left/);
  assert.doesNotMatch(output, /zoom:/);
  assert.match(appSource, /renderScale:\s*2/);
  assert.match(appSource, /imgType:\s*'png'/);
});

test('帮助面板使用分页截图，其他面板仍保持单图', () => {
  assert.match(appSource, /view\.mode === 'help'[\s\S]*puppeteer\.screenshots\('endless_panel'/);
  assert.match(appSource, /puppeteer\.screenshot\('endless_panel'/);
});

test('劫途星图群聊指令与处理方法完整注册', () => {
  assert.ok(appSource.includes("{ reg: '^#劫途星图$', fnc: 'showStarMap' }"));
  assert.ok(appSource.includes("{ reg: '^#星图建议\\\\s*[1-3]$', fnc: 'suggestStarRoute' }"));
  assert.ok(appSource.includes("{ reg: '^#星图情报\\\\s*[1-3]$', fnc: 'showStarIntel' }"));
  assert.ok(appSource.includes("{ reg: '^#星图定途\\\\s*[1-3]$', fnc: 'selectStarRoute' }"));
  assert.match(appSource, /async showStarMap\(e\)/);
  assert.match(appSource, /async selectStarRoute\(e\)/);
});
