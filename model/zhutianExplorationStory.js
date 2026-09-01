import { ensureZhutianMirrorSystem } from './zhutianMirror.js';

import { bumpZhutianMirrorVersion } from '../utils/zhutianMirrorVersion.js';

const option = (text, result, effect = {}) => ({ text, result, effect });

export const ZHUTIAN_EXPLORATION_EVENTS = Object.freeze({
  魔法少女樱: [
    {
      id: 'sakura_mirror_start', title: '镜中的另一位小樱', once: true, weight: 3,
      scene: '放学后的走廊忽然被镜面折成两半。另一个“小樱”隔着倒影伸出手，真正的小樱却被困在教室深处。',
      options: [
        option('握住倒影的手，借诸天镜辨认真伪', '镜面记住了你的气息，也照出了被藏起来的真实出口。', {
          relations: { 木之本樱: 2 }, flags: ['识破镜牌'], nextEvent: 'sakura_mirror_end', materials: { 镜尘: 2 },
        }),
        option('绕到教室外寻找真正的小樱', '你没有惊动倒影，和大道寺知世一同找到了镜牌留下的魔力丝线。', {
          relations: { 大道寺知世: 2 }, flags: ['追踪镜牌'], nextEvent: 'sakura_mirror_end',
        }),
      ],
    },
    {
      id: 'sakura_mirror_end', title: '镜牌的约定', once: true, requiresAny: ['识破镜牌', '追踪镜牌'], weight: 10,
      scene: '镜牌没有继续攻击。她只是安静地模仿着小樱的笑容，似乎在等待一个不会伤害她的答案。',
      options: [
        option('让小樱亲自回应她', '小樱以名字和承诺完成封印，镜牌主动成为了通往友枝町深处的眼睛。', {
          relations: { 木之本樱: 3, 镜牌: 3 }, flags: ['镜牌盟约'], stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 5, label: '魔法熟练度' }],
        }),
        option('用诸天镜接纳她的倒影', '镜牌在诸天镜中留下一个稳定锚点，今后的投影变得清晰许多。', {
          relations: { 镜牌: 2 }, flags: ['镜界锚点'], materials: { 世界残响: 1 },
        }),
      ],
    },
    {
      id: 'sakura_clock_start', title: '月峰神社的停摆钟声', once: true, weight: 3,
      scene: '月峰神社的钟声停在黄昏，参道上的行人不断重复同一句话。李小狼握紧罗盘，示意你不要贸然踏入。',
      options: [
        option('与李小狼一同逆着钟声前进', '你们在重复的时隙里找到了时间魔力的源头。', {
          relations: { 李小狼: 2 }, flags: ['逆行钟声'], nextEvent: 'sakura_clock_end',
        }),
        option('留在原地记录每次循环的差异', '知世的镜头捕捉到一帧本不该存在的月影。', {
          relations: { 大道寺知世: 2 }, flags: ['月影底片'], nextEvent: 'sakura_clock_end',
        }),
      ],
    },
    {
      id: 'sakura_clock_end', title: '被借走的一分钟', once: true, requiresAny: ['逆行钟声', '月影底片'], weight: 10,
      scene: '循环尽头，一分钟的时间被锁在古钟内部。若强行击碎钟身，整座友枝町都会记住这道裂痕。',
      options: [
        option('用封印术温和取回时间', '古钟重新走动，小樱也从你的处理方式中领悟了更细腻的魔力控制。', {
          relations: { 木之本樱: 2, 李小狼: 1 }, flags: ['归还一分钟'], stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 6, label: '魔法熟练度' }],
        }),
        option('让诸天镜保存这段时间残响', '你放走了时间魔力，只截下一缕不会伤害友枝町的残响。', {
          flags: ['时间残响'], materials: { 世界残响: 1, 镜尘: 2 },
        }),
      ],
    },
    {
      id: 'sakura_syaoran_test', title: '李小狼的试探',
      scene: '李小狼拦在你面前。他不相信突然出现在友枝町的投影者，提出以一招定下是否同行。',
      options: [
        option('正面接下雷帝招来', '你稳稳接下雷光，李小狼收剑抱拳，认可了你的实力。', { relations: { 李小狼: 2 }, materials: { 镜尘: 1 } }),
        option('以诸天镜映出雷光轨迹', '你避开锋芒并指出术式破绽，李小狼虽然嘴硬，却把你的提醒记了下来。', { relations: { 李小狼: 1 }, stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 2, label: '魔法熟练度' }] }),
      ],
    },
    {
      id: 'sakura_tomoyo_album', title: '知世未完成的相册', minRelations: { 大道寺知世: 2 },
      scene: '知世请你从一叠异常底片中挑出真正属于这条时间线的照片。每一张都记录着不同结局的小樱。',
      options: [
        option('保留大家都平安归来的那张', '底片化作温暖的光，知世将一份复制品交给了你。', { relations: { 大道寺知世: 2, 木之本樱: 1 }, flags: ['幸福底片'], materials: { 镜尘: 2 } }),
        option('将所有底片按时间顺序归档', '你从错位的影像里找出了梦境与现实的分界。', { relations: { 大道寺知世: 1 }, flags: ['时间线相册'], materials: { 世界残响: 1 } }),
      ],
    },
    {
      id: 'sakura_kero_pudding', title: '可鲁贝洛斯的布丁危机',
      scene: '最后一杯布丁悬在厨房半空，甜牌的魔力正把整栋屋子变成糖果迷宫。可鲁贝洛斯坚持先救布丁。',
      options: [
        option('先救人，再救布丁', '迷宫被解除，可鲁贝洛斯念叨了半天，还是把守护兽的经验传给了你。', { relations: { 可鲁贝洛斯: 1 }, stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 3, label: '魔法熟练度' }] }),
        option('用诸天镜把布丁完整映出来', '两杯布丁让守护兽立刻倒戈，甜牌也在笑闹中安静下来。', { relations: { 可鲁贝洛斯: 3 }, materials: { 镜尘: 1 } }),
      ],
    },
    {
      id: 'sakura_song_night', title: '无人音乐室的歌声',
      scene: '夜里的音乐室传来小樱的歌声，可她此刻明明就在你身边。歌牌只愿追随真正理解旋律的人。',
      options: [
        option('安静听完，不打断她的歌', '歌牌主动现身，留下了一段能安抚躁动魔力的旋律。', { relations: { 木之本樱: 1, 歌牌: 2 }, flags: ['歌牌旋律'] }),
        option('以镜音与她完成二重奏', '不同世界的旋律短暂重合，凝成一缕珍贵残响。', { relations: { 歌牌: 1 }, materials: { 世界残响: 1 } }),
      ],
    },
    {
      id: 'sakura_rain_roof', title: '企鹅公园的骤雨',
      scene: '雨牌突然失控，水幕把几个孩子困在企鹅滑梯上。封印并不难，难的是先救哪一边。',
      options: [
        option('撑起结界护住孩子们', '小樱得以专心完成封印，孩子们只把这一切当成一场奇妙阵雨。', { relations: { 木之本樱: 2 }, stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 2, label: '魔法熟练度' }] }),
        option('引导雨水灌入无人的河道', '你改变了雨牌的攻击轨迹，也从水流中筛出一些镜尘。', { flags: ['疏导雨幕'], materials: { 镜尘: 3 } }),
      ],
    },
    {
      id: 'sakura_moon_watch', title: '月下的守望者', minRelations: { 木之本樱: 3 },
      scene: '月站在高处询问：当力量足以改写所有失误时，你是否还会尊重每个人自己的选择？',
      options: [
        option('力量只该守护选择，而不是替代选择', '月没有赞许，只是让开道路。那份沉默本身便是认可。', { relations: { 月: 3 }, flags: ['月之认可'], materials: { 世界残响: 1 } }),
        option('我会承担改写之后的一切后果', '月指出承担并不等于支配，你记下了这句严厉的提醒。', { relations: { 月: 1 }, flags: ['月之诫言'], stats: [{ path: ['库洛牌系统', '魔法熟练度'], amount: 4, label: '魔法熟练度' }] }),
      ],
    },
  ],

  魔法少女小圆: [
    {
      id: 'madoka_tea_start', title: '巴麻美的茶会邀请', once: true, weight: 3,
      scene: '结界消散后，巴麻美邀请你去她家喝茶。桌上多摆了一只茶杯，却没有人记得那是谁的位置。',
      options: [
        option('询问空茶杯的主人', '麻美沉默片刻，决定带你调查被时间线抹去的同伴。', { relations: { 巴麻美: 2 }, flags: ['无名茶杯'], nextEvent: 'madoka_tea_end' }),
        option('先陪她喝完这杯茶', '你没有揭开伤口，只把这段短暂的安宁留在了时间线上。', { relations: { 巴麻美: 3 }, flags: ['茶会余温'], nextEvent: 'madoka_tea_end', stats: [{ path: ['希望系统', '希望碎片'], amount: 3, label: '希望碎片' }] }),
      ],
    },
    {
      id: 'madoka_tea_end', title: '没有名字的魔法少女', once: true, requiresAny: ['无名茶杯', '茶会余温'], weight: 10,
      scene: '你们在废弃车站找到了那名少女最后的使魔。它守着一枚尚未彻底染黑的灵魂宝石碎片。',
      options: [
        option('净化碎片并归还麻美', '被遗忘的名字重新出现在麻美的记忆里，希望没有让过去复生，却让告别得以完成。', { relations: { 巴麻美: 3 }, flags: ['记住无名少女'], stats: [{ path: ['希望系统', '净化绝望值'], amount: 12, label: '净化绝望值' }, { path: ['诸天镜系统', '世界进度', '魔法少女小圆', '灵魂宝石污浊度'], amount: -6, min: 0, max: 100, label: '灵魂宝石污浊度' }] }),
        option('将碎片封入诸天镜保存', '碎片成为时间线的见证，镜面也因此映出更多被抹去的痕迹。', { flags: ['无名者见证'], materials: { 世界残响: 1 }, stats: [{ path: ['希望系统', '因果律领悟'], amount: 1, label: '因果律领悟' }] }),
      ],
    },
    {
      id: 'madoka_homura_start', title: '晓美焰留下的坐标', once: true, weight: 3,
      scene: '一枚子弹擦过你的投影，在墙上刻出日期与坐标。晓美焰没有现身，这更像是一场对判断力的测试。',
      options: [
        option('按坐标独自赴约', '你在停滞的时间里看见无数次失败留下的弹壳。', { relations: { 晓美焰: 2 }, flags: ['焰的坐标'], nextEvent: 'madoka_homura_end' }),
        option('先把坐标交给鹿目圆', '圆相信你，焰却对这份坦白表现出复杂的警惕。', { relations: { 鹿目圆: 2, 晓美焰: -1 }, flags: ['共享坐标'], nextEvent: 'madoka_homura_end' }),
      ],
    },
    {
      id: 'madoka_homura_end', title: '第十四次黄昏', once: true, requiresAny: ['焰的坐标', '共享坐标'], weight: 10,
      scene: '坐标指向一次尚未发生的魔女袭击。提前出手能救下路人，却可能令这条时间线偏离焰掌握的未来。',
      options: [
        option('立即阻止袭击', '未来发生偏移，但所有人都活了下来。焰接受了这个不完美的新变量。', { relations: { 晓美焰: 2, 鹿目圆: 2 }, flags: ['改写第十四次黄昏'], stats: [{ path: ['希望系统', '拯救人数'], amount: 2, label: '拯救人数' }, { path: ['希望系统', '时间线干涉'], amount: 1, label: '时间线干涉' }] }),
        option('布置陷阱，让历史以最小偏差收束', '你们在原定时刻消灭魔女，焰终于把你视为可以托付后背的协力者。', { relations: { 晓美焰: 4 }, flags: ['时间线协力者'], stats: [{ path: ['希望系统', '因果律领悟'], amount: 2, label: '因果律领悟' }] }),
      ],
    },
    {
      id: 'madoka_qb_contract', title: '丘比的等价提案',
      scene: '丘比承诺用一个问题的答案换取你的投影数据。它强调这是一场“完全公平”的交换。',
      options: [
        option('拒绝交换并切断观测', '你保住了自己的因果，却也确认丘比已经开始关注诸天镜。', { relations: { 丘比: -2 }, flags: ['拒绝契约'], stats: [{ path: ['诸天镜系统', '世界进度', '魔法少女小圆', '灵魂宝石污浊度'], amount: -2, min: 0, max: 100, label: '灵魂宝石污浊度' }] }),
        option('用无关紧要的镜尘样本换取情报', '丘比给出的情报准确得令人不安，而镜尘里也多了一道观测印记。', { relations: { 丘比: 1 }, flags: ['被丘比观测'], materials: { 镜尘: -1 }, stats: [{ path: ['希望系统', '因果律领悟'], amount: 1, label: '因果律领悟' }] }),
      ],
    },
    {
      id: 'madoka_kyoko_apple', title: '佐仓杏子的半个苹果',
      scene: '佐仓杏子把半个苹果抛给你，随后指向结界深处：“拿了就一起干活，别浪费。”',
      options: [
        option('接住苹果并并肩清理使魔', '干净利落的战斗让杏子很满意，她顺手分给你一部分战利品。', { relations: { 佐仓杏子: 3 }, stats: [{ path: ['希望系统', '助人次数'], amount: 1, label: '助人次数' }], materials: { 镜尘: 2 } }),
        option('把苹果留给避难的孩子', '杏子嘴上抱怨，手中的长枪却替你挡下了背后的偷袭。', { relations: { 佐仓杏子: 2 }, stats: [{ path: ['希望系统', '希望碎片'], amount: 4, label: '希望碎片' }] }),
      ],
    },
    {
      id: 'madoka_sayaka_echo', title: '人鱼结界的回声', minRelations: { 鹿目圆: 2 },
      scene: '人鱼魔女的乐声里夹着美树沙耶香尚未说出口的话。鹿目圆请求你不要把它当成普通噪音抹去。',
      options: [
        option('保留回声并耐心听完', '执念被听见后逐渐平息，绝望没有消失，却不再继续扩散。', { relations: { 鹿目圆: 2, 美树沙耶香: 2 }, flags: ['听见人鱼回声'], stats: [{ path: ['希望系统', '净化绝望值'], amount: 8, label: '净化绝望值' }] }),
        option('以诸天镜分离绝望与记忆', '记忆被保存，绝望则凝成可以净化灵魂宝石的残渣。', { relations: { 美树沙耶香: 1 }, stats: [{ path: ['诸天镜系统', '世界进度', '魔法少女小圆', '悲叹之种'], amount: 1, label: '悲叹之种' }] }),
      ],
    },
    {
      id: 'madoka_prayer', title: '鹿目圆的小小愿望',
      scene: '鹿目圆没有许下改变世界的大愿，只希望你陪她把迷路的孩子送回家。远处已有使魔开始聚集。',
      options: [
        option('护送孩子，避开不必要的战斗', '平凡的善意在因果中留下了比战果更明亮的痕迹。', { relations: { 鹿目圆: 3 }, stats: [{ path: ['希望系统', '助人次数'], amount: 1, label: '助人次数' }, { path: ['希望系统', '希望碎片'], amount: 3, label: '希望碎片' }] }),
        option('先清理沿途使魔再送人回家', '道路彻底安全，你也从结界残骸里带回了少量镜尘。', { relations: { 鹿目圆: 1 }, stats: [{ path: ['希望系统', '拯救人数'], amount: 1, label: '拯救人数' }], materials: { 镜尘: 2 } }),
      ],
    },
    {
      id: 'madoka_walpurgis_scout', title: '魔女之夜的先兆',
      scene: '倒悬的舞台只显现了一瞬，狂风便把整条街卷向天空。你可以保存情报，也可以冒险削弱它的一缕投影。',
      options: [
        option('记录轨迹并立刻撤离', '完整的观测数据降低了下一次时间线推演的代价。', { flags: ['魔女之夜轨迹'], stats: [{ path: ['希望系统', '因果律领悟'], amount: 1, label: '因果律领悟' }], materials: { 世界残响: 1 } }),
        option('冒险斩断一缕灾厄投影', '你带着伤痕退回镜面，但那场灾厄的气息确实黯淡了一分。', { relations: { 晓美焰: 1 }, flags: ['削弱灾厄投影'], stats: [{ path: ['诸天镜系统', '世界进度', '魔法少女小圆', '灵魂宝石污浊度'], amount: 8, min: 0, max: 100, label: '灵魂宝石污浊度' }, { path: ['希望系统', '净化绝望值'], amount: 15, label: '净化绝望值' }] }),
      ],
    },
    {
      id: 'madoka_mami_trust', title: '麻美托付的后背', minRelations: { 巴麻美: 3 },
      scene: '巴麻美把最危险的结界出口交给你把守。那里不会有掌声，只有源源不断的使魔与一条必须守住的退路。',
      options: [
        option('寸步不退守到所有人撤出', '最后一名路人离开后，金色缎带才从你身侧收回。麻美始终相信你守得住。', { relations: { 巴麻美: 3 }, flags: ['麻美的协力者'], stats: [{ path: ['希望系统', '拯救人数'], amount: 2, label: '拯救人数' }] }),
        option('利用诸天镜折叠出口缩短战线', '你让危险的死守变成了漂亮的撤离战，麻美认可了这份判断。', { relations: { 巴麻美: 2 }, materials: { 镜尘: 3 }, stats: [{ path: ['希望系统', '助人次数'], amount: 1, label: '助人次数' }] }),
      ],
    },
  ],

  假面骑士帝骑: [
    {
      id: 'decade_photo_start', title: '不存在于底片中的人', once: true, weight: 3,
      scene: '光写真馆洗出一张空白照片。门矢士断言拍摄时有人站在那里，只是整个世界正在遗忘他。',
      options: [
        option('让诸天镜重映底片', '镜中浮现一名无名骑士，以及大修卡抹除他的瞬间。', { relations: { 门矢士: 2 }, flags: ['重映空白底片'], nextEvent: 'decade_photo_end' }),
        option('沿拍摄地点追查世界痕迹', '你在街角找到一枚本应随骑士一同消失的破损徽章。', { relations: { 光夏海: 2 }, flags: ['无名骑士徽章'], nextEvent: 'decade_photo_end' }),
      ],
    },
    {
      id: 'decade_photo_end', title: '世界最后的合影', once: true, requiresAny: ['重映空白底片', '无名骑士徽章'], weight: 10,
      scene: '无名骑士仍在世界夹缝中战斗。只要让照片重新记录他，这个世界就会恢复有关他的记忆。',
      options: [
        option('与门矢士闯入夹缝把人带回来', '快门落下时，无名骑士重新拥有了名字，世界也记起了自己的守护者。', { relations: { 门矢士: 3, 光夏海: 1 }, flags: ['救回无名骑士'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 8, label: '世界共鸣' }] }),
        option('以诸天镜将战斗投影回原世界', '万千目光共同见证了他的存在，夹缝再也困不住一个被世界承认的人。', { relations: { 光夏海: 2 }, flags: ['世界共同见证'], materials: { 世界残响: 1 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 5, label: '世界共鸣' }] }),
      ],
    },
    {
      id: 'decade_rider_start', title: '来自镜世界的求援', once: true, weight: 3,
      scene: '一面车窗映出燃烧的城市，龙骑的卡片不断震动。求援者只留下“不要相信第一个出现的骑士”。',
      options: [
        option('立即穿过镜面救援', '你抢在镜世界闭合前抵达，却被两名一模一样的骑士包围。', { relations: { 门矢士: 1 }, flags: ['进入镜中战场'], nextEvent: 'decade_rider_end' }),
        option('先用骑士卡片校验求援频率', '求援确实属于龙骑，但另一个信号正在故意模仿他的波长。', { flags: ['识别伪装信号'], nextEvent: 'decade_rider_end', stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 3, label: '世界共鸣' }] }),
      ],
    },
    {
      id: 'decade_rider_end', title: '镜中的两名龙骑', once: true, requiresAny: ['进入镜中战场', '识别伪装信号'], weight: 10,
      scene: '两名龙骑同时要求你攻击对方。真正的契约兽不会背弃契约者，而伪装者的镜面正悄悄吞噬周围世界。',
      options: [
        option('观察契约兽后攻击伪装者', '龙深红者撕开虚假的镜面，真正的龙骑把卡片共鸣留给了你。', { relations: { 龙骑: 3 }, flags: ['龙骑共鸣'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 10, label: '世界共鸣' }, { path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -6, min: 0, max: 100, label: '世界融合度' }] }),
        option('让诸天镜同时映照二者的世界痕迹', '伪装者没有属于自己的世界，在镜光中自行崩解。', { relations: { 门矢士: 2 }, flags: ['照破伪骑士'], materials: { 镜尘: 2 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -4, min: 0, max: 100, label: '世界融合度' }] }),
      ],
    },
    {
      id: 'decade_kuuga_ruins', title: '空我的无字遗迹',
      scene: '遗迹深处没有宝物，只有一面刻满笑脸的石墙。大修卡正在抽取其中守护众人的意志。',
      options: [
        option('守住石墙并驱逐大修卡', '温暖的金色力量回应了你的守护，世界融合的裂痕也随之收缩。', { relations: { 空我: 2 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -5, min: 0, max: 100, label: '世界融合度' }] }),
        option('记录遗迹后转移所有石刻', '你保住了记忆本身，也从遗迹基座下发现了镜尘。', { flags: ['空我遗迹拓片'], materials: { 镜尘: 3 } }),
      ],
    },
    {
      id: 'decade_kabuto_clockup', title: 'Clock Up追逐战',
      scene: '甲斗只在快门中留下一道残影。一只异虫正试图借世界融合逃往另一条时间线。',
      options: [
        option('预判异虫的落点封锁出口', '异虫撞进你提前展开的镜界，甲斗停下一瞬，向你点头。', { relations: { 甲斗: 3 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 5, label: '世界共鸣' }] }),
        option('以诸天镜连续折射Clock Up轨迹', '你没有追上时间，却让每一条逃跑路线都回到原点。', { relations: { 甲斗: 1 }, flags: ['高速轨迹'], materials: { 世界残响: 1 } }),
      ],
    },
    {
      id: 'decade_denliner', title: '错站的电班列', minRelations: { 门矢士: 2 },
      scene: '电班列停在不属于任何时代的站台。车票写着你的名字，终点却是诸天镜尚未经历的一次破碎。',
      options: [
        option('上车查看未来的破碎点', '你记住了那道裂痕的形状，并在返回现在后提前加固镜面。', { relations: { 电王: 2 }, flags: ['见过镜碎未来'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -5, min: 0, max: 100, label: '世界融合度' }] }),
        option('把车票交给门矢士决定', '士把车票撕成两半：“我的旅途，不需要别人写好的终点。”', { relations: { 门矢士: 3 }, flags: ['拒绝既定终点'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 4, label: '世界共鸣' }] }),
      ],
    },
    {
      id: 'decade_dai_shocker', title: '大修卡的招揽',
      scene: '大修卡以稳定世界为名，邀请你交出诸天镜的坐标。他们承诺会替你消除所有融合危机。',
      options: [
        option('当场毁掉坐标装置', '爆炸加剧了短暂的世界重叠，却也彻底切断了追踪。', { relations: { 大修卡: -3, 门矢士: 1 }, flags: ['摧毁追踪装置'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: 5, min: 0, max: 100, label: '世界融合度' }, { path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 6, label: '世界共鸣' }] }),
        option('留下假坐标反向追踪基地', '你找到了一条大修卡的补给路线，代价是镜面留下了轻微污染。', { relations: { 大修卡: -1 }, flags: ['大修卡补给线'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: 3, min: 0, max: 100, label: '世界融合度' }], materials: { 镜尘: 3 } }),
      ],
    },
    {
      id: 'decade_natsumi_point', title: '光夏海的笑穴指',
      scene: '门矢士又把照片拍得一塌糊涂，却坚持这是“世界的问题”。光夏海向你投来一个是否要揭穿他的眼神。',
      options: [
        option('认真分析照片里的世界畸变', '照片确实捕捉到了肉眼看不见的融合边缘，士难得没有继续嘴硬。', { relations: { 门矢士: 2 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '共鸣度'], amount: 3, label: '世界共鸣' }] }),
        option('默默给光夏海让出位置', '一声惨叫之后，光写真馆恢复了和平。你也被正式算作了自己人。', { relations: { 光夏海: 3, 门矢士: 1 }, flags: ['写真馆自己人'] }),
      ],
    },
    {
      id: 'decade_world_anchor', title: '失控的世界锚', minRelations: { 门矢士: 3 },
      scene: '世界融合点出现一枚正在过载的锚。拔出它会让一座城市暂时失去保护，留下它则会继续撕扯其他世界。',
      options: [
        option('与门矢士共同承担反冲后拔锚', '极光帷幕接住了坠落的城市，融合危机被大幅压低。', { relations: { 门矢士: 2 }, flags: ['拔除失控世界锚'], stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -12, min: 0, max: 100, label: '世界融合度' }] }),
        option('重写世界锚，让它只固定本世界', '城市安然无恙，诸天镜也记下了一种更稳定的锚定方式。', { flags: ['重写世界锚'], materials: { 世界残响: 1 }, stats: [{ path: ['诸天镜系统', '世界进度', '假面骑士帝骑', '世界融合度'], amount: -8, min: 0, max: 100, label: '世界融合度' }] }),
      ],
    },
  ],
});

function clamp(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)));
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

export function ensureExplorationStoryState(player, world) {
  const system = ensureZhutianMirrorSystem(player);
  if (!system.剧情进度 || typeof system.剧情进度 !== 'object') system.剧情进度 = {};
  if (!system.剧情进度[world] || typeof system.剧情进度[world] !== 'object') system.剧情进度[world] = {};
  const state = system.剧情进度[world];
  if (!state.人物关系 || typeof state.人物关系 !== 'object') state.人物关系 = {};
  for (const [name, value] of Object.entries(state.人物关系)) state.人物关系[name] = clamp(value, -100, 100);
  for (const field of ['事件标记', '已完成事件', '最近事件', '已结算剧情']) {
    if (!Array.isArray(state[field])) state[field] = [];
    state[field] = [...new Set(state[field].filter(value => typeof value === 'string'))];
  }
  state.剧情次数 = clamp(state.剧情次数);
  if (typeof state.待续事件 !== 'string') state.待续事件 = '';
  return state;
}

function isEligible(event, state, location, { ignoreLocation = false } = {}) {
  if (!ignoreLocation && event.locations && !event.locations.includes(location)) return false;
  if (event.once && state.已完成事件.includes(event.id)) return false;
  if (event.requires?.some(flag => !state.事件标记.includes(flag))) return false;
  if (event.requiresAny && !event.requiresAny.some(flag => state.事件标记.includes(flag))) return false;
  if (event.excludes?.some(flag => state.事件标记.includes(flag))) return false;
  return Object.entries(event.minRelations || {}).every(([name, value]) => (state.人物关系[name] || 0) >= value);
}

function publicEvent(world, event) {
  return {
    world,
    id: event.id,
    title: event.title,
    scene: event.scene,
    options: event.options.map(({ text }, index) => ({ num: index + 1, text })),
  };
}

export function beginExplorationStory(player, world, location, { random = Math.random } = {}) {
  const events = ZHUTIAN_EXPLORATION_EVENTS[world];
  if (!events) return null;
  const state = ensureExplorationStoryState(player, world);
  if (state.待续事件) {
    const pending = events.find(event => event.id === state.待续事件);
    if (pending && isEligible(pending, state, location, { ignoreLocation: true })) return publicEvent(world, pending);
    state.待续事件 = '';
  }

  let eligible = events.filter(event => isEligible(event, state, location));
  const fresh = eligible.filter(event => !state.最近事件.includes(event.id));
  if (fresh.length > 0) eligible = fresh;
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, event) => sum + Math.max(1, Number(event.weight) || 1), 0);
  let roll = Math.max(0, Math.min(0.999999, Number(random()) || 0)) * totalWeight;
  const selected = eligible.find(event => (roll -= Math.max(1, Number(event.weight) || 1)) < 0) || eligible.at(-1);
  return publicEvent(world, selected);
}

function applyStat(player, stat, changes) {
  let target = player;
  for (const key of stat.path.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  const key = stat.path.at(-1);
  const before = Number(target[key]) || 0;
  const after = clamp(before + stat.amount, stat.min ?? 0, stat.max ?? Number.MAX_SAFE_INTEGER);
  target[key] = after;
  const delta = after - before;
  if (delta) changes.push(`${stat.label || key} ${delta > 0 ? '+' : ''}${delta}`);
}

export function resolveExplorationStory(player, world, eventId, choice, { resolutionId = '' } = {}) {
  const events = ZHUTIAN_EXPLORATION_EVENTS[world];
  const event = events?.find(item => item.id === eventId);
  if (!event) return { ok: false, reason: 'event' };
  const state = ensureExplorationStoryState(player, world);
  if (resolutionId && state.已结算剧情.includes(resolutionId)) {
    return { ok: true, alreadyResolved: true, title: event.title };
  }
  const selected = event.options[Number(choice) - 1];
  if (!selected) return { ok: false, reason: 'choice', maxChoice: event.options.length };

  const effect = selected.effect || {};
  const changes = [];
  for (const [name, amount] of Object.entries(effect.relations || {})) {
    const before = state.人物关系[name] || 0;
    const after = clamp(before + amount, -100, 100);
    state.人物关系[name] = after;
    const delta = after - before;
    if (delta) changes.push(`${name}关系 ${delta > 0 ? '+' : ''}${delta}`);
  }
  for (const flag of effect.flags || []) addUnique(state.事件标记, flag);
  for (const [name, amount] of Object.entries(effect.materials || {})) {
    const before = Number(player.诸天镜系统.材料[name]) || 0;
    const after = clamp(before + amount);
    player.诸天镜系统.材料[name] = after;
    const delta = after - before;
    if (delta) changes.push(`${name} ${delta > 0 ? '+' : ''}${delta}`);
  }
  for (const stat of effect.stats || []) applyStat(player, stat, changes);

  if (state.待续事件 === event.id) state.待续事件 = '';
  if (effect.nextEvent) state.待续事件 = effect.nextEvent;
  if (event.once) addUnique(state.已完成事件, event.id);
  state.最近事件.push(event.id);
  state.最近事件 = state.最近事件.slice(-3);
  state.剧情次数 += 1;
  if (resolutionId) {
    state.已结算剧情.push(resolutionId);
    state.已结算剧情 = state.已结算剧情.slice(-100);
  }
  bumpZhutianMirrorVersion(player);

  return {
    ok: true,
    title: event.title,
    result: selected.result,
    changes,
    nextTitle: events.find(item => item.id === state.待续事件)?.title || '',
  };
}

export function getExplorationStorySummary(player, world) {
  const state = ensureExplorationStoryState(player, world);
  const relations = Object.entries(state.人物关系)
    .filter(([, value]) => value !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([name, value]) => `${name}${value > 0 ? '+' : ''}${value}`);
  return {
    count: state.剧情次数,
    relations: relations.join('、') || '尚未结识剧情人物',
    pending: ZHUTIAN_EXPLORATION_EVENTS[world]?.find(event => event.id === state.待续事件)?.title || '',
  };
}
