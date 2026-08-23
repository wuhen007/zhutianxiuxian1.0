import { plugin } from '../../api/api.js';
import { 
    Read_player, 
    Write_player, 
    Add_修为, 
    Add_血气,
    Add_灵石,
    player_efficiency,
} from '../../model/xiuxian.js';
import { getRealmAuthorityLevel, hasRealmAuthority } from '../../model/realmAuthority.js';
import {
  addMirrorRelic,
  consumeMirrorEnergy,
  ensureZhutianMirrorSystem,
  exploreDecadeWorld,
  exploreMitakihara,
  exploreTomoeda,
  getWorldMinimumMirrorTier,
  MIRROR_TIER_CONFIG,
  recordProjectionMirrorProgress,
} from '../../model/zhutianMirror.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

// ========== 诸天投影世界配置 ==========
const PROJECTION_WORLDS = {
  // ==================== 动漫世界 ====================
  '魔卡少女樱': {
    name: '魔卡少女樱',
    difficulty: 2,
    minLevelId: 43,
    minLevelName: '天仙',
    entryText: [
      '【诸天镜·友枝町】',
      '你睁开眼，发现自己站在友枝町的樱花树下。',
      '粉白的花瓣随风飘落，远处传来钟楼的悠扬钟声。',
      '一道金色的光芒从不远处的庭院冲天而起——那是库洛牌的气息！',
      '「吼——！」一只长着翅膀的黄色小兽从窗口飞出，',
      '它紧张地绕着你飞了两圈：「你是谁？也是冲着库洛牌来的吗？！」',
      '——这正是封印之兽·可鲁贝洛斯。',
      `不远处，一个手持封印之杖的少女正追赶着飞散的库洛牌……`
    ],
    story: {
      start: {
        desc: '友枝町的库洛牌正在四处作乱，木之本樱正在努力回收它们。你感应到好几张库洛牌的气息分散在城市各处。',
        options: [
          { num: 1, text: '帮助小樱收集库洛牌', next: 'help_sakura' },
          { num: 2, text: '夺取库洛牌据为己有', next: 'steal_cards' },
          { num: 3, text: '与可鲁贝洛斯交涉情报', next: 'talk_kero' }
        ]
      },
      help_sakura: {
        desc: '你追上小樱，表明来意。她犹豫了一下，可鲁贝洛斯嗅了嗅你：「这家伙身上没有恶意，让他帮忙吧！」',
        options: [
          { num: 1, text: '用灵力帮小樱封印「风」牌', next: 'seal_windy', bonus: '+8魂' },
          { num: 2, text: '用武力压制暴走的「火」牌', next: 'fight_fire', bonus: '+6魂,+10影' },
          { num: 3, text: '设陷阱困住四处逃窜的「跳」牌', next: 'trap_jump', bonus: '+5魂,+5影' }
        ]
      },
      steal_cards: {
        desc: '你隐藏气息，悄悄尾随小樱。当她与「水」牌激战时，库洛牌散落的魔力波动为你创造了机会……',
        options: [
          { num: 1, text: '趁乱抢夺「水」牌', next: 'grab_water', penalty: '-15魂' },
          { num: 2, text: '潜入小樱家偷取已封印的库洛牌', next: 'sneak_home', penalty: '-25魂,+20影' },
          { num: 3, text: '放弃偷盗，转而帮助小樱', next: 'help_sakura', bonus: '+5魂' }
        ]
      },
      talk_kero: {
        desc: '你找到可鲁贝洛斯，它正蹲在窗台吃布丁。「哦？异世界的访客？」它舔了舔爪子，「库洛里多那家伙留下的牌可不是那么好对付的。」',
        options: [
          { num: 1, text: '请教库洛牌的本质', next: 'learn_cards', bonus: '+10魂' },
          { num: 2, text: '请求获得一张库洛牌作为报酬', next: 'request_card', bonus: '+5影' },
          { num: 3, text: '询问这个世界的规则', next: 'ask_rules', bonus: '+3魂,+3影' }
        ]
      },
      seal_windy: {
        desc: '「风」牌化作龙卷风肆虐友枝町。你运转灵力，在狂风中布下道纹结界——小樱趁机挥动封印之杖：「库洛牌，我命令你——变回原来的样子！」',
        end: 'good',
        reward: { 修为: 1500, 影: 40, items: [{ name: '库洛的残页', class: '道具', desc: '库洛里多留下的魔法笔记残页' }] }
      },
      fight_fire: {
        desc: '「火」牌化身烈焰巨人，将半个公园烧成焦土。你冲入火海，凭借修仙者的体魄硬扛烈焰。小樱趁机封印了火牌，她感激地看着你：「谢谢你！」',
        end: 'good',
        reward: { 修为: 1200, 影: 20, items: [{ name: '封印之羽', class: '道具', desc: '封印之杖上脱落的一片羽毛，蕴含封魔之力' }] }
      },
      trap_jump: {
        desc: '「跳」牌在楼宇间弹来弹去，你设下灵力陷阱，将它困在无形的屏障中。小樱成功封印，可鲁贝洛斯赞道：「有一套啊你！」',
        end: 'good',
        reward: { 修为: 1000, 影: 15 }
      },
      grab_water: {
        desc: '你在小樱封印「水」牌的瞬间出手抢夺——但库洛牌的魔力反噬让你神魂剧震！月城雪兔突然出现在你面前，眼神冰冷：「把牌放下。」',
        end: 'bad',
        reward: { 修为: 200, 影: -10 }
      },
      sneak_home: {
        desc: '你潜入木之本家，刚摸到库洛牌册——「汪！」一只白色的大型犬（实为守护兽）扑了过来。小樱闻声赶来，你仓皇逃窜，投影险些崩碎。',
        end: 'bad',
        reward: { 修为: 100, 影: -5 }
      },
      learn_cards: {
        desc: '可鲁贝洛斯向你解释了库洛牌的由来：「库洛里多那家伙把黑暗力量分成了52张牌……但你身上的力量体系完全不同，也许能从中学到什么。」你感悟到了魔力与灵力的共通之处。',
        end: 'neutral',
        reward: { 修为: 800, 影: 10 }
      },
      request_card: {
        desc: '小樱犹豫再三，最终将一张较弱的「歌」牌交给你作为帮忙的谢礼。库洛牌的魔力在你手中微微颤动，似乎在适应你的灵气。',
        end: 'good',
        reward: { 修为: 600, 影: 15, items: [{ name: '库洛牌·歌', class: '道具', desc: '一张蕴含音乐魔力的库洛牌' }] }
      },
      ask_rules: {
        desc: '可鲁贝洛斯告诉你这个世界的基本规则：「魔力与你们的灵力不同源，但可以互相理解。你在这个世界待得越久，投影越不稳定，早点完成任务回去吧。」',
        end: 'neutral',
        reward: { 修为: 500, 影: 5 }
      }
    }
  },

  '魔法少女小圆': {
    name: '魔法少女小圆',
    difficulty: 3,
    minLevelId: 46,
    minLevelName: '金仙',
    entryText: [
      '【诸天镜·见泷原】',
      '铺天盖地的绝望感扑面而来——你投影到了一座诡异的城市。',
      '天空是扭曲的拼贴画，地面浮动着不祥的黑色纹路，远处巨大的魔女结界正在吞噬街区。',
      '一只白色生物轻盈地落在你面前，红宝石般的眼睛注视着你：',
      '「你好，异世界的访客。我叫丘比，你想成为魔法少女吗？」',
      '它的尾巴轻轻摆动：「我可以实现你任何一个愿望——只需要你与我签订契约。」',
      '你感觉到这只生物散发着某种不自然的因果律波动……',
      '远处传来战斗的声音——粉发少女鹿目圆正在犹豫是否签订契约。'
    ],
    story: {
      start: {
        desc: '丘比注视着你，它的声音在你脑海中响起：「你的灵魂波动非常特殊。签订契约的话，你能获得的魔法力量将远超普通魔法少女。」',
        options: [
          { num: 1, text: '拒绝契约，帮助鹿目圆和晓美焰对抗魔女', next: 'help_girls' },
          { num: 2, text: '与丘比签订契约，成为魔法少年/少女', next: 'contract' },
          { num: 3, text: '试图揭穿丘比的真相', next: 'expose_kyubey' }
        ]
      },
      help_girls: {
        desc: '你拒绝了丘比，冲向魔女结界。晓美焰正独自苦战，看到你出现时她愣了一下：「你……不是这个世界的人？」',
        options: [
          { num: 1, text: '用灵力压制魔女结界', next: 'suppress_witch', bonus: '+10魂,+15影' },
          { num: 2, text: '掩护鹿目圆撤退', next: 'evacuate_madoka', bonus: '+8魂,+10影' },
          { num: 3, text: '与晓美焰联手攻击魔女核心', next: 'attack_core', bonus: '+12魂,+20影' }
        ]
      },
      contract: {
        desc: '丘比的眼睛亮了起来：「明智的选择！」一道白光笼罩了你——你感受到强大的魔力涌入体内，但同时，灵魂似乎被抽离了一部分……',
        options: [
          { num: 1, text: '接受魔力，全力消灭眼前的魔女', next: 'witch_hunt', bonus: '+20影' },
          { num: 2, text: '试图在签订契约后反抗丘比的控制', next: 'rebel', penalty: '-20魂,+25影' }
        ]
      },
      expose_kyubey: {
        desc: '你直接道出真相：「你就是利用少女希望、制造魔女的孵化者吧？」丘比歪了歪头：「被看穿了呢。不过……这又有什么关系？熵增是不可逆的，魔法少女的牺牲是必要的。」',
        end: 'neutral',
        reward: { 修为: 2000, 影: 30, items: [{ name: '悲叹之种', class: '道具', desc: '魔女被击败后留下的叹息结晶，蕴含净化之力' }] }
      },
      suppress_witch: {
        desc: '你的灵力与魔女结界的诅咒之力激烈碰撞——你将修仙者的道韵凝结成阵，封印了魔女的核心。晓美焰趁机用枪械精准点射，鹿目圆的声音在后方响起：「不要放弃希望！」',
        end: 'good',
        reward: { 修为: 2500, 影: 40, items: [{ name: '希望碎片', class: '道具', desc: '少女们心中纯粹希望凝结的碎片' }] }
      },
      evacuate_madoka: {
        desc: '你护送鹿目圆逃出魔女结界。她回头看着战斗中的晓美焰，眼中满是坚定：「谢谢你……我知道该怎么做了。」',
        end: 'good',
        reward: { 修为: 1800, 影: 25 }
      },
      attack_core: {
        desc: '你与晓美焰的配合出奇默契——时间暂停的刹那，你的灵力精确地击穿了魔女核心。晓美焰淡淡地说：「你……还算有用。」',
        end: 'good',
        reward: { 修为: 2200, 影: 35, items: [{ name: '时间沙漏碎片', class: '道具', desc: '晓美焰时间之盾上脱落的碎片' }] }
      },
      witch_hunt: {
        desc: '你以魔法少年/少女的力量激战魔女。魔力与修仙体系的碰撞产生了奇异的效果——你强行扭曲了魔女结界，将其中的诅咒之力炼化为己用。',
        end: 'good',
        reward: { 修为: 2800, 影: 45, items: [{ name: '灵魂宝石碎片', class: '道具', desc: '契约后生成的灵魂宝石碎片，蕴含魔法少女之力' }] }
      },
      rebel: {
        desc: '你凭借修仙者的意志强行抵抗丘比的因果律束缚——灵魂宝石剧烈震颤，但在崩碎之前，你成功切断了与孵化者系统的联系。丘比面无表情：「真是个有趣的实验体。」',
        end: 'neutral',
        reward: { 修为: 1500, 影: 20 }
      }
    }
  },

  '星穹铁道·匹诺康尼': {
    name: '星穹铁道·匹诺康尼',
    difficulty: 4,
    minLevelId: 47,
    minLevelName: '大罗金仙',
    entryText: [
      '【诸天镜·匹诺康尼】',
      '你坠入一片流光溢彩的梦境之中——匹诺康尼，永不停歇的盛会。',
      '金色大厅里无数宾客戴着面具起舞，但每个人的笑容都带着机械般的精准。',
      '一个银发少女从人群中走出，她的眼神清澈却带着淡淡的忧伤：',
      '「你……也是被这个梦困住的人吗？」——她是流萤，星核猎手。',
      '「这里的一切都是假的，但痛苦是真的。」她轻轻触碰你的衣袖，',
      '「帮我找到梦境的真相……然后我们一起离开这里。」'
    ],
    story: {
      start: {
        desc: '流萤带你穿过舞会人群。她低声说：「这个梦境由「同谐」家族维持，但底层隐藏着「秩序」的残党。梦境正在崩塌……你必须选择一条路。」',
        options: [
          { num: 1, text: '与流萤一同深入梦境核心', next: 'deep_dream' },
          { num: 2, text: '探索匹诺康尼的「现实」层', next: 'reality_layer' },
          { num: 3, text: '暗中调查「钟表匠」的遗产', next: 'watchmaker' }
        ]
      },
      deep_dream: {
        desc: '你们潜入梦境的最深处——「稚子的梦」。这里是梦境的源头，无数记忆碎片如同星辰般漂浮。流萤停下脚步：「前面就是「沉眠」的核心……准备好了吗？」',
        options: [
          { num: 1, text: '直面「沉眠」的真相', next: 'face_truth', bonus: '+15魂,+25影' },
          { num: 2, text: '用灵力为流萤构建一个真实的梦境', next: 'create_dream', bonus: '+10魂,+30影' }
        ]
      },
      reality_layer: {
        desc: '你强行突破梦境的禁制，窥见了匹诺康尼的真实——一座冰冷的太空设施，无数人在营养舱中沉睡着。这里的每一个人……都被梦吞噬了。',
        end: 'neutral',
        reward: { 修为: 2200, 影: 35, items: [{ name: '梦境碎片', class: '道具', desc: '匹诺康尼梦境崩落时凝结的碎片' }] }
      },
      watchmaker: {
        desc: '你找到了「钟表匠」遗留的工坊。满墙的钟表指向不同的时间——每一块表都囚禁着一个人的梦境。流萤轻轻拿起一块停止走动的怀表：「这是他留给我的……」',
        end: 'good',
        reward: { 修为: 2600, 影: 40, items: [{ name: '时间的齿轮', class: '道具', desc: '钟表匠遗物中最为精密的齿轮，蕴含时间法则的碎片' }] }
      },
      face_truth: {
        desc: '「沉眠」并非怪物——它是所有被梦境吞噬者的集体意识。无数声音在你们脑海中回荡：救我……放我出去……流萤举起光剑，你运转灵力，两人之力撕裂了「沉眠」的边界。',
        end: 'good',
        reward: { 修为: 3000, 影: 50, items: [{ name: '流萤的光刃碎片', class: '道具', desc: '星核猎手流萤光剑上脱落的一片能量结晶' }] }
      },
      create_dream: {
        desc: '你将自己的灵力和对故乡的记忆编织成一个温暖的梦境。流萤在梦中看到了真正的星空——不是虚假的穹顶，而是无尽的银河。她笑了，那是你在匹诺康尼看到的第一个真实的笑容。',
        end: 'good',
        reward: { 修为: 2500, 影: 45, items: [{ name: '真实的星空', class: '道具', desc: '一枚封存着真实星空投影的水晶' }] }
      }
    }
  },

  '魔女之旅': {
    name: '魔女之旅',
    difficulty: 3,
    minLevelId: 46,
    minLevelName: '金仙',
    entryText: [
      '【诸天镜·旅途中的国度】',
      '你投影到了一个奇妙的异世界。脚下是一条蜿蜒的石板路，两旁是连绵起伏的丘陵。',
      '远处炊烟袅袅，一座陌生的小镇静静躺在夕阳之中。',
      '一位灰发魔女骑着扫帚从天而降——她有着如灰烬般美丽的发色和一双看遍世事的眼瞳。',
      '「我是伊蕾娜，只是一个路过的旅行者哦。」她歪着头打量你，',
      '「你身上的气息和我见过的都不一样……来自更远的地方吧？」',
      '她翻了翻随身的旅行日记：「这个国家好像正在发生一些奇怪的事情——要一起看看吗？」'
    ],
    story: {
      start: {
        desc: '伊蕾娜翻开她的旅行日记：「根据情报，这个国家有一株能实现愿望的「幻之树」……但靠近它的人全都消失了。我正准备去调查——你怎么看？」',
        options: [
          { num: 1, text: '与伊蕾娜同行调查幻之树', next: 'investigate_tree' },
          { num: 2, text: '独自深入小镇了解失踪真相', next: 'solo_investigate' },
          { num: 3, text: '先在镇上收集情报再行动', next: 'gather_info' }
        ]
      },
      investigate_tree: {
        desc: '你们穿过密林，来到一棵巨大的古树前。树冠如华盖，散发着令人心悸的光。伊蕾娜抬手示意你停下：「这棵树……在吸取靠近者的生命力。」',
        options: [
          { num: 1, text: '用灵力切断古树的吸食根脉', next: 'sever_roots', bonus: '+10魂,+20影' },
          { num: 2, text: '进入古树的记忆幻境寻找真相', next: 'memory_realm', bonus: '+15魂,+25影' }
        ]
      },
      solo_investigate: {
        desc: '你在小镇中走访，发现每个失踪者都有一个共同点——他们都在夜间听到过「树的声音」。当夜，你也听到了……那是一首古老而悲伤的歌。',
        end: 'neutral',
        reward: { 修为: 2000, 影: 25 }
      },
      gather_info: {
        desc: '你在镇上的酒馆里遇到了一位老者。他说古树曾是守护神，但百年前被人用诅咒污染了。伊蕾娜在日记上记下这一切：「果然，每个国家都有它自己的悲伤故事呢。」',
        end: 'neutral',
        reward: { 修为: 1500, 影: 20 }
      },
      sever_roots: {
        desc: '你的灵力化作利刃，精准地切断了古树吸取生命力的根源。古树发出一声叹息般的长鸣——被困在树中的人们化为光点飞出。伊蕾娜轻声说：「你看，旅行的意义就在于见证这些瞬间。」',
        end: 'good',
        reward: { 修为: 2800, 影: 40, items: [{ name: '伊蕾娜的旅行日记·残页', class: '道具', desc: '魔女的旅行日记中掉落的一页，记录了这个国度的故事' }] }
      },
      memory_realm: {
        desc: '你进入古树的记忆幻境——里面是百年来的画面：战争中失去家园的人们向古树祈祷、诅咒魔女在树根下埋入毒刺……你将这些记忆带出，告诉了小镇人民。伊蕾娜合上日记：「故事该被记住，而不该被遗忘。」',
        end: 'good',
        reward: { 修为: 3200, 影: 50, items: [{ name: '幻之树种子', class: '道具', desc: '古树在释然后结出的一粒种子，蕴含重生的希望' }] }
      }
    }
  },

  '假面骑士帝骑': {
    name: '假面骑士帝骑',
    difficulty: 5,
    minLevelId: 48,
    minLevelName: '大道金仙',
    entryText: [
      '【诸天镜·崩溃的骑士世界】',
      '九个世界正在融合——天空是叠加的照片，地面交错着不同时空的残骸。',
      '一个品红色的身影站在废墟之上，他的腰带闪烁着不祥的光芒。',
      '「我只是一个路过的假面骑士，给我记好了。」',
      '——门矢士，假面骑士Decade，毁灭一切连接一切之人。',
      '他转过身，头盔下的目光穿透了你的神魂：',
      '「你是来自这个世界之外的存在……比这个世界更远的地方。」',
      '「那么告诉我——你是要看着这九个世界一起毁灭，还是要和我一起战斗？」'
    ],
    story: {
      start: {
        desc: '九个世界的融合正在加速，大地开始崩裂。Decade抽出卡盒剑：「我的力量不足以同时稳住所有世界——我需要帮手。」',
        options: [
          { num: 1, text: '与Decade并肩战斗', next: 'fight_together' },
          { num: 2, text: '尝试窃取Decade的力量', next: 'steal_power' },
          { num: 3, text: '寻找阻止世界融合的方法', next: 'stop_merge' }
        ]
      },
      fight_together: {
        desc: 'Decade将一张空白的骑士卡片递给你：「把你的力量注入这张卡——或许能创造新的形态。」',
        options: [
          { num: 1, text: '注入灵力，创造「修仙者」形态', next: 'create_form', bonus: '+15魂,+30影' },
          { num: 2, text: '将灵力附着在Decade的剑上', next: 'enhance_sword', bonus: '+10魂,+25影' }
        ]
      },
      steal_power: {
        desc: '你接近Decade，试图用灵力窥探他腰带的秘密——但「极光帷幕」突然出现在你脚下，Decade的声音从背后传来：「想偷我的力量？你还早了一万年呢。」',
        penalty: '-25魂',
        options: [
          { num: 1, text: '道歉并请求合作', next: 'fight_together' }
        ]
      },
      stop_merge: {
        desc: '你以修仙者的视角分析世界融合的本质——这并非自然现象，而是有人在幕后操控。「大修卡」的阴影浮出水面……',
        end: 'neutral',
        reward: { 修为: 3000, 影: 35 }
      },
      create_form: {
        desc: '你的灵力注入空白卡片——一张全新的骑士卡出现了：金色的道纹在卡面上流转，与Decade的品红交相辉映。Decade轻笑：「修仙者形态……有意思。」两人之力撕开融合，九个世界各归其位。',
        end: 'good',
        reward: { 修为: 4200, 影: 60, items: [{ name: '空白骑士卡片', class: '道具', desc: 'Decade留下的空白卡片，可以注入自己的力量创造新形态' }] }
      },
      enhance_sword: {
        desc: '你的灵力包裹了Decade的卡盒剑——刀刃上浮现出金色的道纹。一剑斩落，融合的边界被切开，九个世界暂时稳住了。Decade收起剑：「干得不错，异世界的家伙。」',
        end: 'good',
        reward: { 修为: 3500, 影: 45, items: [{ name: '极光帷幕碎片', class: '道具', desc: 'Decade极光帷幕能力残余的能量碎片' }] }
      }
    }
  },

  // ==================== 原创世界 ====================
  '剑渊古路': {
    name: '剑渊古路',
    difficulty: 6,
    minLevelId: 51,
    minLevelName: '无极仙帝',
    entryText: [
      '【诸天镜·剑渊古路】',
      '你投影到了一片被剑意充斥的荒古大地——',
      '天穹之上悬挂着九柄倒悬的古剑，每一柄都散发着足以斩碎星辰的剑意。',
      '脚下是一条看不见尽头的古老石路，每走一步都有剑道真意涌入识海。',
      '「剑渊古路，亿万年前剑道始祖陨落后化作的试炼之地。」',
      '一个苍老的声音响起：「有缘踏上古路者，或可悟得剑道真谛，或被剑意斩灭神魂。」',
      '「你……敢走吗？」'
    ],
    story: {
      start: {
        desc: '九柄天道古剑悬浮天际，每一柄对应一个境界的剑道真意。你感应到剑气在你体内共鸣——这是你修炼至今从未有过的感受。',
        options: [
          { num: 1, text: '挑战「碎星古剑」（剑道雏形）', next: 'sword1' },
          { num: 2, text: '挑战「开天古剑」（剑道大成）', next: 'sword2' },
          { num: 3, text: '静坐感悟剑渊道韵', next: 'meditate' }
        ]
      },
      sword1: {
        desc: '你飞身而起，直面「碎星古剑」。剑意如流星般倾泻而下——你以自身道法对抗，在剑雨中穿梭，每一道剑痕都在你神魂上留下印记。',
        options: [
          { num: 1, text: '以拳破剑，霸道硬撼', next: 'fist_vs_sword', bonus: '+15魂,+30影' },
          { num: 2, text: '以柔克刚，引导剑意', next: 'soft_sword', bonus: '+10魂,+25影' }
        ]
      },
      sword2: {
        desc: '「开天古剑」的威压远超想象——仅仅是靠近，你的法袍就开始碎裂。这一剑，曾斩开混沌。',
        end: 'good',
        reward: { 修为: 5000, 血气: 5000, 影: 70, items: [{ name: '开天剑意碎片', class: '道具', desc: '开天古剑散落的一缕剑意，可直接参悟' }] }
      },
      meditate: {
        desc: '你在古路上盘膝而坐。亿万年的剑道沉淀涌入识海——你看到了一位白衣剑客从少年到白发的一生，最终他以身化剑渊，为后来者留路。',
        end: 'good',
        reward: { 修为: 4000, 影: 45, items: [{ name: '剑道真解·残篇', class: '功法', desc: '剑渊古路中悟得的剑道心法残篇' }] }
      },
      fist_vs_sword: {
        desc: '拳剑相击，虚空炸裂！你以肉身硬撼古剑锋芒，每一拳都蕴含着你的道心。古剑嗡鸣，最终碎裂成光——一道剑意没入你体内：「后来者，剑道……托付于你。」',
        end: 'good',
        reward: { 修为: 4500, 血气: 4000, 影: 55, items: [{ name: '碎星剑魂', class: '道具', desc: '碎星古剑碎裂后留下的剑魂核心' }] }
      },
      soft_sword: {
        desc: '你不与剑意正面对抗，而是以自身道韵引导——剑意不再是杀戮之器，而是与你共鸣的道友。古剑由竖转横，化作一缕剑意绕你而转。',
        end: 'good',
        reward: { 修为: 3800, 影: 35 }
      }
    }
  },

  '星海归墟': {
    name: '星海归墟',
    difficulty: 7,
    minLevelId: 55,
    minLevelName: '万界道祖',
    entryText: [
      '【诸天镜·星海归墟】',
      '你投影到了一片漆黑的虚空——不，那不是虚空，是星海。',
      '无数死去的星辰漂浮在你周围：熄灭的白矮星、冷却的中子星、坍缩的黑洞残骸……',
      '这里是宇宙的坟墓，万星归墟之地。',
      '在星海中央，有一团微弱的「火」在燃烧——那是这个宇宙诞生时的第一缕光，即将熄灭。',
      '一个由星辰尘埃凝聚的身影出现在你面前：「外来的旅者……你能帮我……点燃最后一颗星辰吗？」'
    ],
    story: {
      start: {
        desc: '星辰的化身告诉你：这个宇宙已经走到了终点。所有星辰都已死亡，唯有「初火」尚存一丝余烬。点燃最后一颗星，就能开启新的轮回——或者彻底结束。',
        options: [
          { num: 1, text: '燃烧神魂点燃初火', next: 'burn_soul' },
          { num: 2, text: '以自身灵力重塑一颗星辰', next: 'create_star' },
          { num: 3, text: '引导初火自我涅槃重生', next: 'rebirth_fire' }
        ]
      },
      burn_soul: {
        desc: '你将神魂的一部分注入初火——剧烈的灼烧感席卷全身，但你咬牙坚持。初火猛地膨胀，点燃了最近的一颗死星——新的光，诞生了。',
        end: 'good',
        reward: { 修为: 6000, 血气: 6000, 影: 80, items: [{ name: '初火余烬', class: '道具', desc: '宇宙初火点燃时的余烬，蕴含创世之力' }] }
      },
      create_star: {
        desc: '你以自身灵力为核，从归墟中收集星尘——一颗全新的星辰在虚空中诞生。它不是继承旧宇宙的遗产，而是你亲手创造的奇迹。',
        end: 'good',
        reward: { 修为: 5500, 影: 75, items: [{ name: '星辰之核', class: '道具', desc: '你亲手创造的那颗星辰的本源核心' }] }
      },
      rebirth_fire: {
        desc: '你没有强行干预，而是用道韵引导初火自我涅槃——就像凤凰浴火。初火在最后的瞬间绽放出前所未有的光芒，然后坍缩、爆炸——新的宇宙大爆炸，在你眼前发生。',
        end: 'good',
        reward: { 修为: 7000, 血气: 5000, 影: 100, items: [{ name: '宇宙卵', class: '道具', desc: '初火涅槃后留下的宇宙之卵，蕴含一个新宇宙的潜能' }] }
      }
    }
  },

  '万道争锋': {
    name: '万道争锋',
    difficulty: 5,
    minLevelId: 48,
    minLevelName: '大道金仙',
    entryText: [
      '【诸天镜·万道擂台】',
      '你投影到了一座悬浮在虚空中的巨大擂台——',
      '四面八方是无数观战者的虚影，每一个都散发着至少大道金仙层次的气息。',
      '「欢迎来到万道争锋！」一位身穿星袍的老者立于擂台中央，',
      '「这里是诸天万界最强者的竞技场——只有在这里证明自己的道，才能被称为真正的强者！」',
      '老者指了指擂台的另一端：「你的对手，来自另一个维度的修士——去，用你的道，击败他！」'
    ],
    story: {
      start: {
        desc: '你的对手已经站上了擂台——他周身环绕着诡异的紫色道纹，使用的修炼体系与你截然不同。观战者们开始欢呼，赌注在人群中流转。',
        options: [
          { num: 1, text: '用最强招式正面碾压', next: 'overwhelm' },
          { num: 2, text: '以智取胜，观察对手弱点', next: 'outsmart' },
          { num: 3, text: '以道论道，用道韵压制对手', next: 'dao_battle' }
        ]
      },
      overwhelm: {
        desc: '你全力爆发——灵力如海啸般涌出，每一击都震碎虚空。对手被你的力量震慑，退了三步后才稳住身形。他拱了拱手：「阁下的力量……我认可了。」',
        end: 'good',
        reward: { 修为: 3000, 血气: 3500, 影: 50 }
      },
      outsmart: {
        desc: '你注意到对手每次爆发后都有0.3息的间隙。当第七次爆发结束后，你的攻击精准地切入那个瞬间——一击制胜。',
        end: 'good',
        reward: { 修为: 2800, 影: 45, items: [{ name: '异界功法抄本', class: '功法', desc: '从对手身上获得的异界修炼体系基础功法' }] }
      },
      dao_battle: {
        desc: '你没有出招，而是在擂台上展现了自己的道——从修炼至今的所有感悟化作道韵展开。对手的道在你的道面前寸寸崩解，他不甘地低下了头。',
        end: 'good',
        reward: { 修为: 3500, 影: 60, items: [{ name: '万道令牌', class: '道具', desc: '万道争锋擂台的通行令牌，可以再次挑战更强对手' }] }
      }
    }
  }
};

const PROJECTION_WORLD_ORDER = [
  '魔卡少女樱',
  '魔女之旅',
  '魔法少女小圆',
  '星穹铁道·匹诺康尼',
  '假面骑士帝骑',
  '万道争锋',
  '剑渊古路',
  '星海归墟',
];

function hasProjectionRealm(player, world) {
  return Number(player?.level_id || 0) >= world.minLevelId;
}

// ========== 主类 ==========
export class touyingzhutian extends plugin {
  constructor() {
    super({
      name: 'touyingzhutian',
      dsc: '诸天投影·多世界穿越',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#投影诸天(.*)$',
          fnc: 'touyingzhutian',
        },
        {
          reg: '^#退出投影$',
          fnc: 'forceExitProjection',
        },
        {
          reg: '^[1234]$',
          fnc: 'handleProjectionChoice',
        },
        {
          reg: '^#诸天世界$',
          fnc: 'listWorlds',
        },
        {
          reg: '^#道化之身$',
          fnc: 'listDaohua',
        },
        {
          reg: '^#万身归真$',
          fnc: 'recycleAllDaohua',
        },
      ],
    });
  }

  // ========== 列出所有可投影世界 ==========
  async listWorlds(e) {
    if (!e.isGroup) return;
    let rows = ['【诸天镜·可投影世界】', ''];
    for (const worldName of PROJECTION_WORLD_ORDER) {
      const world = PROJECTION_WORLDS[worldName];
      const stars = '★'.repeat(world.difficulty) + '☆'.repeat(10 - world.difficulty);
      rows.push(`${stars} ${world.name}  → 需求：${world.minLevelName}、${getWorldMinimumMirrorTier(world.name)}阶诸天镜`);
    }
    rows.push('');
    rows.push('使用 #投影诸天 随机投影到一个世界');
    rows.push('使用 #投影诸天 [世界名] 指定投影');
    e.reply(rows.join('\n'));
    return true;
  }

  // ========== 强制退出投影 ==========
  async forceExitProjection(e) {
    const player_qq = e.user_id;
    try {
      const player = await Read_player(player_qq);
      const action = await redis.get('xiuxian:player:' + player_qq + ':action');
      const projection = action ? JSON.parse(action) : null;

      if (!projection || projection.action !== '投影诸天') {
        e.reply('你当前没有进行中的投影');
        return true;
      }

      // 计算惩罚
      const penaltyXiuwei = Math.floor(projection.returnRate ? projection.returnRate * 100 : 500);
      await Add_修为(player_qq, -penaltyXiuwei);

      await redis.del('xiuxian:player:' + player_qq + ':action');
      e.reply([
        '你强行中断了神魂投影！',
        '由于神魂强行脱离异界，受到反噬：',
        `修为损失：${penaltyXiuwei}`,
        '本次镜能已消耗，投影终止。'
      ].join('\n'));
      return true;
    } catch (err) {
      console.error('退出投影出错:', err);
      e.reply('退出投影时发生意外');
      return true;
    }
  }

  // ========== 开始投影 ==========
  async touyingzhutian(e) {
    const player_qq = e.user_id;
    try {
      const player = await Read_player(player_qq);
      if (!player) {
        e.reply('未找到玩家数据');
        return true;
      }

      // 检查是否已在投影中
      const existingAction = await redis.get('xiuxian:player:' + player_qq + ':action');
      if (existingAction) {
        const action = JSON.parse(existingAction);
        if (action && action.action === '投影诸天') {
          e.reply('你已经在投影诸天中，请输入 1/2/3/4 继续剧情，或使用 #退出投影');
          return true;
        }
      }

      const mirror = ensureZhutianMirrorSystem(player);
      if (!mirror.已绑定) {
        e.reply('请先在天机阁兑换并使用诸天镜完成绑定。');
        return true;
      }

      // 选择世界：指定名称或随机
      let worldName = e.msg.replace('#投影诸天', '').trim();
      let selectedWorld;

      if (worldName) {
        // 指定世界
        selectedWorld = Object.values(PROJECTION_WORLDS).find(
          w => w.name === worldName || w.name.includes(worldName)
        );
        if (!selectedWorld) {
          const names = Object.keys(PROJECTION_WORLDS).join('、');
          e.reply(`未找到世界【${worldName}】。\n可投影世界：${names}\n或使用 #投影诸天 随机投影`);
          return true;
        }
      } else {
        // 随机选择（根据境界过滤）
        const availableWorlds = Object.values(PROJECTION_WORLDS).filter(w => {
          return hasProjectionRealm(player, w)
            && mirror.镜阶 >= getWorldMinimumMirrorTier(w.name);
        });
        if (availableWorlds.length === 0) {
          e.reply('你的境界尚不足以投影诸天，至少需要达到天仙并持有一阶诸天镜。');
          return true;
        }
        selectedWorld = availableWorlds[Math.floor(Math.random() * availableWorlds.length)];
      }

      // 境界检查
      if (!hasProjectionRealm(player, selectedWorld)) {
        e.reply(`你的境界不足！${selectedWorld.name}需要至少${selectedWorld.minLevelName}才能投影。`);
        return true;
      }

      const requiredTier = getWorldMinimumMirrorTier(selectedWorld.name);
      if (mirror.镜阶 < requiredTier) {
        e.reply(`【${selectedWorld.name}】需要至少${requiredTier}阶诸天镜，当前为${mirror.镜阶}阶。`);
        return true;
      }

      const startResult = await withPlayerMutationLock(player_qq, async () => {
        const actionKey = 'xiuxian:player:' + player_qq + ':action';
        if (await redis.get(actionKey)) return { ok: false, reason: 'action' };

        const latestPlayer = await Read_player(player_qq);
        const latestMirror = ensureZhutianMirrorSystem(latestPlayer);
        if (!latestMirror.已绑定) return { ok: false, reason: 'unbound' };
        if (latestMirror.镜阶 < requiredTier) return { ok: false, reason: 'tier' };
        if (!hasProjectionRealm(latestPlayer, selectedWorld)) {
          return { ok: false, reason: 'realm' };
        }
        const consumed = consumeMirrorEnergy(latestPlayer);
        if (!consumed.ok) return consumed;

        const projectionState = {
          action: '投影诸天',
          world: selectedWorld.name,
          step: 'start',
          soulStability: 100,
          worldInfluence: 0,
          returnRate: 0,
          startLevelId: latestPlayer.level_id,
          start_time: Date.now(),
        };
        await redis.set(actionKey, JSON.stringify(projectionState));
        try {
          await Write_player(player_qq, latestPlayer);
        } catch (error) {
          await redis.del(actionKey);
          throw error;
        }
        return { ok: true, mirror: latestMirror };
      });

      if (!startResult.ok) {
        if (startResult.reason === 'action') e.reply('你当前已有进行中的行动，暂时不能再次投影。');
        else if (startResult.reason === 'unbound') e.reply('请先绑定诸天镜。');
        else if (startResult.reason === 'tier') e.reply(`当前诸天镜阶位不足，需要${requiredTier}阶。`);
        else if (startResult.reason === 'realm') e.reply(`你的境界不足！${selectedWorld.name}需要至少${selectedWorld.minLevelName}。`);
        else if (startResult.reason === 'energy') e.reply('今日镜能已经耗尽，明日会自动恢复。');
        return true;
      }

      // 发送入口文案 + 第一个选择
      const node = selectedWorld.story.start;
      const optionsText = node.options.map(o => `${o.num}. ${o.text}`).join('\n');
      e.reply([
        ...selectedWorld.entryText,
        '',
        `你的神魂稳定性：100/100`,
        `世界影响力：0 | 剩余镜能：${startResult.mirror.镜能}/${MIRROR_TIER_CONFIG[startResult.mirror.镜阶].energyMax}`,
        '',
        node.desc,
        '',
        optionsText
      ].join('\n'));
      return true;
    } catch (err) {
      console.error('投影诸天出错:', err);
      e.reply('投影过程中发生意外，请稍后再试');
      return true;
    }
  }

  // ========== 处理选择 ==========
  async handleProjectionChoice(e) {
    const player_qq = e.user_id;
    const choice = parseInt(e.msg.trim());
    if (isNaN(choice) || choice < 1 || choice > 4) {
      e.reply('请输入 1、2、3 或 4 来做出选择');
      return true;
    }

    try {
      const actionStr = await redis.get('xiuxian:player:' + player_qq + ':action');
      if (!actionStr) {
        e.reply('当前没有进行中的投影');
        return true;
      }
      const projection = JSON.parse(actionStr);
      if (projection.action !== '投影诸天') {
        e.reply('当前没有进行中的投影');
        return true;
      }

      const world = PROJECTION_WORLDS[projection.world];
      if (!world) {
        e.reply('投影数据异常，请使用 #退出投影');
        return true;
      }

      // 找到当前节点
      const currentNode = world.story[projection.step];
      if (!currentNode || !currentNode.options) {
        e.reply('当前无可用选择，请使用 #退出投影');
        return true;
      }

      // 找到玩家选择对应的选项
      const selectedOption = currentNode.options.find(o => o.num === choice);
      if (!selectedOption) {
        e.reply('无效的选择，请输入对应的数字');
        return true;
      }

      // 处理额外效果（bonus/penalty）
      if (selectedOption.bonus) {
        const parts = selectedOption.bonus.split(',');
        for (const part of parts) {
          const match = part.trim().match(/([+-]?\d+)(魂|影)/);
          if (match) {
            const val = parseInt(match[1]);
            if (match[2] === '魂') projection.soulStability = Math.max(0, Math.min(100, projection.soulStability + val));
            if (match[2] === '影') projection.worldInfluence = Math.max(0, projection.worldInfluence + val);
          }
        }
      }
      if (selectedOption.penalty) {
        const parts = selectedOption.penalty.split(',');
        for (const part of parts) {
          const match = part.trim().match(/([+-]?\d+)(魂|影)/);
          if (match) {
            const val = parseInt(match[1]);
            if (match[2] === '魂') projection.soulStability = Math.max(0, Math.min(100, projection.soulStability + val));
            if (match[2] === '影') projection.worldInfluence = Math.max(0, projection.worldInfluence + val);
          }
        }
      }

      // 移动到下一个节点
      const nextNodeKey = selectedOption.next;

      // 判断是否到达终点
      if (!nextNodeKey) {
        e.reply('剧情分支异常，本次投影被迫终止');
        await redis.del('xiuxian:player:' + player_qq + ':action');
        return true;
      }

      const nextNode = world.story[nextNodeKey];
      if (!nextNode) {
        e.reply('剧情节点异常，本次投影被迫终止');
        await redis.del('xiuxian:player:' + player_qq + ':action');
        return true;
      }

      // 如果是终点节点（有 end 字段）
      if (nextNode.end) {
        await this.completeProjection(e, player_qq, projection, world, nextNode);
        return true;
      }

      // 如果还有子选项
      if (nextNode.options && nextNode.options.length > 0) {
        projection.step = nextNodeKey;

        // 检查神魂稳定性
        if (projection.soulStability <= 0) {
          await this.collapseProjection(e, player_qq, projection, world);
          return true;
        }

        // 每轮自然衰减 2-5 点神魂稳定性
        projection.soulStability = Math.max(0, projection.soulStability - (2 + Math.floor(Math.random() * 4)));

        if (projection.soulStability <= 0) {
          await this.collapseProjection(e, player_qq, projection, world);
          return true;
        }

        await redis.set('xiuxian:player:' + player_qq + ':action', JSON.stringify(projection));

        const optionsText = nextNode.options.map(o => `${o.num}. ${o.text}`).join('\n');
        e.reply([
          nextNode.desc,
          '',
          `神魂稳定性：${projection.soulStability}/100`,
          `世界影响力：${projection.worldInfluence}`,
          '',
          optionsText
        ].join('\n'));
        return true;
      }

      // 不应该到达这里
      e.reply('剧情结构异常，请使用 #退出投影');
      return true;
    } catch (err) {
      console.error('处理选择出错:', err);
      e.reply('处理选择时发生意外');
      return true;
    }
  }

  // ========== 神魂崩溃 ==========
  async collapseProjection(e, player_qq, projection, world) {
    await redis.del('xiuxian:player:' + player_qq + ':action');
    const penalty = Math.floor(projection.returnRate * 50 || 300);
    await Add_修为(player_qq, -penalty);

    e.reply([
      `⚠️ 神魂稳定性降至临界点！`,
      `你在【${world.name}】的投影体崩碎了——`,
      `你的意识被强行拽回本体，神魂受创。`,
      `修为损失：${penalty}`,
      '',
      `世界影响力残留：${projection.worldInfluence}`
    ].join('\n'));
  }

  // ========== 完成投影 ==========
  async completeProjection(e, player_qq, projection, world, endNode) {
    return withPlayerMutationLock(player_qq, async () => {
    let player = await Read_player(player_qq);
    const endingType = endNode.end || 'neutral';
    const settlementId = `${world.name}:${projection.start_time}`;
    const initialMirror = ensureZhutianMirrorSystem(player);
    if (!Array.isArray(initialMirror.已结算投影)) initialMirror.已结算投影 = [];
    if (initialMirror.已结算投影.includes(settlementId)) {
      await redis.del('xiuxian:player:' + player_qq + ':action');
      e.reply('本次诸天投影已经完成结算，未重复发放奖励。');
      return true;
    }

    // 计算投影回归率（base 70%，世界影响力每20点+5%，上限95%）
    const baseRate = 0.7;
    const influenceBonus = Math.floor(projection.worldInfluence / 20) * 0.05;
    const returnRate = Math.min(0.95, baseRate + influenceBonus);

    // 计算实际奖励
    const reward = endNode.reward || { 修为: 500 };
    const calculatedXiuwei = Math.floor((reward.修为 || 0) * returnRate);
    const calculatedXueqi = Math.floor((reward.血气 || 0) * returnRate);

    // 发放奖励
    const xiuweiClaimKey = `zhutian:${settlementId}:xiuwei`;
    const xueqiClaimKey = `zhutian:${settlementId}:xueqi`;
    const addedXiuwei = calculatedXiuwei > 0
      ? await Add_修为(player_qq, calculatedXiuwei, { idempotencyKey: xiuweiClaimKey })
      : 0;
    const addedXueqi = calculatedXueqi > 0
      ? await Add_血气(player_qq, calculatedXueqi, { idempotencyKey: xueqiClaimKey })
      : 0;

    player = await Read_player(player_qq);
    const finalXiuwei = addedXiuwei || Number(player._rewardClaims?.[xiuweiClaimKey]?.amount) || 0;
    const finalXueqi = addedXueqi || Number(player._rewardClaims?.[xueqiClaimKey]?.amount) || 0;
    const itemsGained = [];
    for (const item of reward.items || []) {
      addMirrorRelic(player, item.name);
      itemsGained.push(item.name);
    }

    // 构建结局描述
    const endingNames = { good: '【完美结局】', neutral: '【平凡结局】', bad: '【糟糕结局】' };
    const endingDesc = endingNames[endingType] || '【未知结局】';

    const msg = [
      ...endNode.desc.split('\n'),
      '',
      `━━━━ ${endingDesc} ━━━━`,
      `回归率：${Math.floor(returnRate * 100)}%（基础70% + 影响力加成${Math.floor(influenceBonus * 100)}%）`,
      `世界影响力：${projection.worldInfluence}`,
      '',
      `🗡 修为 +${finalXiuwei}`,
    ];

    if (finalXueqi > 0) msg.push(`🩸 血气 +${finalXueqi}`);
    if (itemsGained.length > 0) msg.push(`🎁 获得：${itemsGained.join('、')}`);

    msg.push('');
    msg.push(`${player.名号}的神魂从【${world.name}】归来——投影体消散，修为回流本体！`);

    // ==== 道化之身：投影完成自动创建 ====
    let mirrorRootChanged = false;
    if (endingType !== 'bad') {
      const mirrorRewards = recordProjectionMirrorProgress(player, world.name, {
        difficulty: world.difficulty,
        endingType,
      });
      if (mirrorRewards.newMark) msg.push(`获得世界印记【${world.name}】`);
      const materialRows = ['镜尘', '世界残响', '位面晶核', '时空锚', '诸天镜心']
        .filter(name => mirrorRewards[name] > 0)
        .map(name => `${name}+${mirrorRewards[name]}`);
      msg.push(`诸天镜汲取世界余韵：${materialRows.join('、')}`);
      if (world.name === '魔卡少女樱') {
        const exploration = exploreTomoeda(player, '友枝小学', { consumeEnergy: false });
        msg.push(`友枝町探索度 +8，镜尘 +${exploration.dust}${exploration.echo ? '，世界残响 +1' : ''}`);
        if (exploration.card) msg.push(`封印库洛牌【${exploration.card}】`);
        if (exploration.keyFound) msg.push('获得【封印之钥】');
        if (exploration.unlocked) msg.push('解锁诸天化身【木之本樱】，可使用 #装载化身 木之本樱');
      }
      if (world.name === '魔法少女小圆') {
        const exploration = exploreMitakihara(player, '蔷薇园魔女结界', { consumeEnergy: false });
        msg.push(`见泷原探索度 +8，因果碎片 +1，希望碎片 +${exploration.hopeShards}`);
        if (exploration.griefSeed) msg.push('净化魔女结界，获得【悲叹之种】');
        if (exploration.gemFound) msg.push('获得【灵魂宝石】');
        if (exploration.unlocked) msg.push('解锁诸天化身【鹿目圆】，可使用 #装载化身 鹿目圆');
        if (exploration.corruptionGain) msg.push(`灵魂宝石污浊 +${exploration.corruptionGain}`);
        if (exploration.timelineCollapsed) msg.push('当前时间线因污浊崩塌，自动回退到50点污浊');
      }
      if (world.name === '假面骑士帝骑') {
        const exploration = exploreDecadeWorld(player, '光写真馆', { consumeEnergy: false });
        if (!exploration.ok && exploration.reason === 'crisis') {
          msg.push('骑士世界融合度已满，本次投影未推进探索；请使用 #最终攻击驾驭 化解危机');
        } else {
          msg.push(`骑士世界探索度 +8，世界共鸣 +${exploration.card ? 10 : 4}，融合度 +${exploration.fusionGain}`);
          if (exploration.card) msg.push(`获得骑士卡片【${exploration.card}】`);
          if (exploration.driverFound) msg.push('获得【帝骑驱动器】');
          if (exploration.unlocked) msg.push('解锁诸天化身【门矢士】，可使用 #装载化身 门矢士');
          if (exploration.advanced) msg.push('九位主骑之力共鸣，【门矢士】化身晋升为【帝骑】');
          if (exploration.crisis) msg.push('世界融合度达到100，请使用 #最终攻击驾驭 化解危机');
          mirrorRootChanged ||= exploration.rootChanged;
        }
      }
      if (!player.道化之身) player.道化之身 = [];

      // 道化之身上限 = 境界决定
      const authorityLevel = getRealmAuthorityLevel(player);
      const daohuaMax = authorityLevel >= 23 ? 999 :  // 祭道之上无上限
                       authorityLevel >= 18 ? 15 :
                       authorityLevel >= 12 ? 10 :
                       authorityLevel >= 8  ? 5  : 3;

      // 检查同世界是否已有
      const existing = player.道化之身.find(d => d.world === world.name);
      if (existing) {
        // 已有则升级
        const maxLevel = world.difficulty * 2;
        if (existing.level < maxLevel) {
          existing.level++;
          existing.rate = world.difficulty * existing.level * 100;
          msg.push(`🌐 道化之身·${world.name} 等级提升至 Lv.${existing.level}（修为速率：${existing.rate}/时）`);
        }
      } else if (player.道化之身.length < daohuaMax) {
        // 新建
        const level = endingType === 'good'
          ? Math.max(1, Math.floor(projection.worldInfluence / 10))
          : Math.max(1, Math.floor(projection.worldInfluence / 20));
        const rate = world.difficulty * level * 100;
        player.道化之身.push({
          world: world.name,
          level: level,
          rate: rate,
          created: new Date().toLocaleDateString(),
          特殊: null
        });
        msg.push(`🌐 一缕道韵留驻【${world.name}】——你在此界凝出了一道「道化之身」！`);
        msg.push(`   等级：Lv.${level} | 修为速率：${rate}/时`);
      } else {
        msg.push(`🌐 道化之身已达上限（${daohuaMax}），未能在此界凝出身外之身。`);
      }

    }

    const settledMirror = ensureZhutianMirrorSystem(player);
    if (!Array.isArray(settledMirror.已结算投影)) settledMirror.已结算投影 = [];
    settledMirror.已结算投影.push(settlementId);
    settledMirror.已结算投影 = settledMirror.已结算投影.slice(-100);
    await Write_player(player_qq, player);
    if (mirrorRootChanged) await player_efficiency(player_qq);
    await redis.del('xiuxian:player:' + player_qq + ':action');

    e.reply(msg.join('\n'));
    return true;
    });
  }

  // ========== 查看道化之身 ==========
  async listDaohua(e) {
    const player_qq = e.user_id;
    const player = await Read_player(player_qq);
    if (!player) return e.reply('请先创建角色');

    if (!player.道化之身 || player.道化之身.length === 0) {
      return e.reply('你尚未在任何世界留下道化之身。\n使用 #投影诸天 完成投影后，会自动凝出道化之身。');
    }

    let totalRate = 0;
    const lines = player.道化之身.map(d => {
      totalRate += d.rate;
      const teShu = d.特殊 ? ` | 特殊：${d.特殊}` : '';
      return `🌐 ${d.world} Lv.${d.level} | 速率：${d.rate}/时${teShu} | ${d.created}`;
    });

    const authorityLevel = getRealmAuthorityLevel(player);
    const daohuaMax = authorityLevel >= 23 ? '无上限' :
                     authorityLevel >= 18 ? 15 :
                     authorityLevel >= 12 ? 10 :
                     authorityLevel >= 8  ? 5  : 3;

    e.reply([
      `【道化之身·诸天印记】(${player.道化之身.length}/${daohuaMax})`,
      `散落于诸天万界的身外道身——`,
      `每一个都在默默修炼，等待万身归真之日。`,
      '',
      ...lines,
      '',
      `总计修为速率：${totalRate}/时 = ${Math.floor(totalRate * 24)}/天`,
      `使用 #万身归真 一次性收回所有道化之身。`
    ].join('\n'));
  }

  // ========== 万身归真 ==========
  async recycleAllDaohua(e) {
    const player_qq = e.user_id;
    const player = await Read_player(player_qq);
    if (!player) return e.reply('请先创建角色');

    if (!player.道化之身 || player.道化之身.length === 0) {
      return e.reply('你尚未在任何世界留下道化之身。');
    }

    if (!hasRealmAuthority(player, 18)) {
      return e.reply('万身归真需要至少仙王境界才能承受诸天万界的道韵回流。');
    }

    // 计算每个道化之身从创建至今累积的修为
    let totalXiuwei = 0;
    const now = new Date();
    const details = [];
    const inheritedSpecials = [];

    for (const d of player.道化之身) {
      const created = new Date(d.created);
      const hoursPassed = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60)));
      const accumulated = Math.floor(d.rate * hoursPassed);
      totalXiuwei += accumulated;
      details.push(`${d.world} Lv.${d.level}：${accumulated}修为（${hoursPassed}时）`);

      // 10%概率继承特殊能力
      if (d.特殊 && Math.random() < 0.1) {
        inheritedSpecials.push(d.特殊);
      }
    }

    // 回归率 = 基础70%
    const returnXiuwei = Math.floor(totalXiuwei * 0.7);
    await Add_修为(player_qq, returnXiuwei);

    // 继承特殊能力
    if (inheritedSpecials.length > 0) {
      if (!player.道化特殊) player.道化特殊 = [];
      for (const spec of inheritedSpecials) {
        if (!player.道化特殊.includes(spec)) player.道化特殊.push(spec);
      }
    }

    // 清空道化之身
    const count = player.道化之身.length;
    const worldNames = player.道化之身.map(d => d.world).join('、');
    player.道化之身 = [];
    await Write_player(player_qq, player);

    const msg = [
      '【万身归真】',
      '',
      `你的${count}个道化之身同时睁开双眼——`,
      '诸天万界，无数个你，在这一刻重归于一。',
      `世界：${worldNames}`,
      '',
      '收回修为明细：',
      ...details,
      '',
      `总计累积：${totalXiuwei}修为 → 回归率70% → 实收${returnXiuwei}修为`,
    ];

    if (inheritedSpecials.length > 0) {
      msg.push('', `✨ 继承特殊能力：${inheritedSpecials.join('、')}`);
    }

    msg.push('', '道化之身已全部清空。再次投影诸天可重新凝出道化之身。');
    msg.push('冷却时间：72小时（3天）后可使用 #投影诸天。');

    e.reply(msg.join('\n'));
  }
}
