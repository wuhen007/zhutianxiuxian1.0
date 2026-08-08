const META_VERSION = 1;

export const REINCARNATION_BRANCH_GRADES = Object.freeze([
  'D', 'C', 'B', 'A', 'S', 'SS', 'SSS',
]);

export const REINCARNATION_ATTRIBUTE_GROUPS = Object.freeze({
  生命力: ['体力', '免疫力', '恢复力'],
  战斗力: ['肌肉强度', '神经反射', '战斗技巧'],
  智力: ['逻辑思维', '记忆力', '学习力'],
  精神力: ['意志力', '感知力', '抗压力'],
});

const ATTRIBUTE_NAMES = Object.values(REINCARNATION_ATTRIBUTE_GROUPS).flat();

export const REINCARNATION_PROFESSIONS = Object.freeze([
  {
    id: 'special_forces', name: '特战队员', domain: '战斗力',
    specialties: ['战术', '枪械', '强行突破'],
    active: '战术接管', passive: '遭遇突袭时首次判定获得额外优势',
    flaw: '不擅长处理超自然信息', item: '制式战术匕首',
    attributes: { 肌肉强度: 3, 神经反射: 2, 战斗技巧: 3, 体力: 1, 意志力: 1, 逻辑思维: -1 },
  },
  {
    id: 'emergency_doctor', name: '急诊医生', domain: '生命力',
    specialties: ['医疗', '人体', '急救'],
    active: '创伤处置', passive: '小队受到伤害时降低伤势恶化速度',
    flaw: '正面压制能力较弱', item: '便携急救包',
    attributes: { 免疫力: 2, 恢复力: 3, 逻辑思维: 2, 记忆力: 2, 学习力: 1, 肌肉强度: -1 },
  },
  {
    id: 'criminal_detective', name: '刑警', domain: '智力',
    specialties: ['调查', '审讯', '观察'],
    active: '现场还原', passive: '更容易发现矛盾证词和隐藏痕迹',
    flaw: '连续精神冲击会快速积累压力', item: '强光手电',
    attributes: { 逻辑思维: 3, 记忆力: 2, 感知力: 3, 战斗技巧: 1, 抗压力: 1 },
  },
  {
    id: 'firefighter', name: '消防员', domain: '生命力',
    specialties: ['救援', '强行突破', '危险环境'],
    active: '生命通道', passive: '保护同伴时获得体力和意志加成',
    flaw: '不擅长精密设备', item: '破拆斧',
    attributes: { 肌肉强度: 2, 体力: 3, 恢复力: 1, 意志力: 2, 抗压力: 2 },
  },
  {
    id: 'engineer', name: '机械工程师', domain: '智力',
    specialties: ['机械', '电子', '爆破'],
    active: '结构诊断', passive: '机械与设施判定失败时减轻代价',
    flaw: '近身战斗经验不足', item: '多功能工具钳',
    attributes: { 逻辑思维: 3, 学习力: 2, 记忆力: 1, 感知力: 1, 肌肉强度: 1, 战斗技巧: -1 },
  },
  {
    id: 'psychologist', name: '心理医生', domain: '精神力',
    specialties: ['心理', '交涉', '观察'],
    active: '认知锚定', passive: '降低全队因异常现象增加的压力',
    flaw: '缺乏高强度体能训练', item: '录音笔',
    attributes: { 逻辑思维: 2, 意志力: 2, 感知力: 2, 抗压力: 3, 记忆力: 1, 体力: -1 },
  },
  {
    id: 'investigative_reporter', name: '调查记者', domain: '精神力',
    specialties: ['调查', '情报', '交涉'],
    active: '追问真相', passive: '更容易显露隐藏支线与人物秘密',
    flaw: '好奇心会带来额外风险', item: '微型相机',
    attributes: { 感知力: 3, 记忆力: 2, 学习力: 2, 意志力: 1, 神经反射: 1 },
  },
  {
    id: 'security_hacker', name: '网络安全工程师', domain: '智力',
    specialties: ['系统', '数据', '入侵'],
    active: '协议劫持', passive: '电子系统相关判定获得额外优势',
    flaw: '脱离科技环境后专业优势受限', item: '离线终端',
    attributes: { 逻辑思维: 3, 学习力: 3, 记忆力: 2, 神经反射: 1, 体力: -1 },
  },
]);

export const REINCARNATION_NPCS = Object.freeze([
  {
    id: 'jiang_yingxue', name: '江映雪', profession: '急诊医生',
    specialties: ['医疗', '人体', '急救'], traits: ['利他', '冷静'],
    expertise: '创伤救治与死亡判断', bottomLine: '拒绝抛弃仍有救的人', fear: '再次错过抢救时机',
    approveLine: '先把人带回来，剩下的问题我来处理。', opposeLine: '这不是取舍，是把一个活人当成消耗品。',
  },
  {
    id: 'han_zheng', name: '韩铮', profession: '消防员',
    specialties: ['救援', '强行突破', '危险环境'], traits: ['利他', '责任'],
    expertise: '破拆、负重与灾害救援', bottomLine: '不会主动放弃受困者', fear: '队伍在自己面前被火焰吞没',
    approveLine: '我开路，你把人带出去。', opposeLine: '真走到那一步，我留下，不需要拿别人垫命。',
  },
  {
    id: 'xu_lin', name: '许临', profession: '数据分析师',
    specialties: ['系统', '数据', '逻辑'], traits: ['多疑', '谨慎'],
    expertise: '数据建模与异常模式识别', bottomLine: '拒绝执行无法验证的计划', fear: '自己的记忆被人为篡改',
    approveLine: '风险可以接受，但先把变量写清楚。', opposeLine: '证据不足。我不会把命押在你的直觉上。',
  },
  {
    id: 'su_yao', name: '苏遥', profession: '调查记者',
    specialties: ['调查', '情报', '交涉'], traits: ['好奇', '求知'],
    expertise: '追踪线索与挖掘人物秘密', bottomLine: '不能让真相被永远掩埋', fear: '成为无人记得的失踪者',
    approveLine: '这条线索值得追下去，哪怕它希望我们回头。', opposeLine: '现在停手，我们就永远只能相信广播给的答案。',
  },
  {
    id: 'wei_qishan', name: '魏岐山', profession: '退役军人',
    specialties: ['战术', '枪械', '警戒'], traits: ['守序', '坚韧'],
    expertise: '小队战术与危险警戒', bottomLine: '命令必须有人承担后果', fear: '再次误判导致全队覆灭',
    approveLine: '决定下了就执行，我守最后一个位置。', opposeLine: '威胁自己人只会让队伍死得更快。',
  },
  {
    id: 'gu_ning', name: '顾宁', profession: '心理咨询师',
    specialties: ['心理', '交涉', '观察'], traits: ['冷静', '利他'],
    expertise: '压力干预与谎言识别', bottomLine: '不能用精神控制剥夺选择', fear: '分不清自己的想法是否真实',
    approveLine: '保持呼吸，看着我。恐惧是真的，但它不等于命令。', opposeLine: '你正在用恐惧控制他们，这会留下裂痕。',
  },
  {
    id: 'lin_mo', name: '林默', profession: '轨道工程师',
    specialties: ['机械', '电子', '爆破'], traits: ['谨慎', '责任'],
    expertise: '列车结构与供电系统', bottomLine: '不会启动无法停止的设备', fear: '封闭空间结构性坍塌',
    approveLine: '给我三分钟，我能让这套东西按我们的规则运行。', opposeLine: '硬拆会毁掉唯一的控制回路。',
  },
  {
    id: 'tang_shiyi', name: '唐诗忆', profession: '档案研究员',
    specialties: ['记忆', '学习', '观察'], traits: ['求知', '多疑'],
    expertise: '旧档案、城市史与记忆校验', bottomLine: '任何记录都必须留下来源', fear: '发现自己只是伪造档案中的人物',
    approveLine: '我见过这个编号，它在十二年前就被注销了。', opposeLine: '别急着相信眼前的记忆，它可能正是陷阱。',
  },
  {
    id: 'zhao_heng', name: '赵衡', profession: '法医',
    specialties: ['医疗', '人体', '调查'], traits: ['冷静', '求知'],
    expertise: '尸表检验与死亡时间推定', bottomLine: '不能为了结论伪造任何证据', fear: '解剖台上的死者忽然说出他的名字',
    approveLine: '尸体不会配合谎言，先确定它究竟死过几次。', opposeLine: '没有完成检验之前，我不会接受这个结论。',
  },
  {
    id: 'shen_yan', name: '沈砚', profession: '民俗学者',
    specialties: ['民俗', '记忆', '情报'], traits: ['求知', '谨慎'],
    expertise: '地方禁忌、仪式与口述史', bottomLine: '不拿活人验证未知仪式', fear: '自己抄录的禁忌正在变成现实',
    approveLine: '禁忌不是迷信，是幸存者用死亡写下的说明。', opposeLine: '仪式缺了一环，贸然照做只会把门彻底打开。',
  },
  {
    id: 'lu_chenzhou', name: '陆沉舟', profession: '前特警',
    specialties: ['战术', '枪械', '强行突破'], traits: ['守序', '坚韧'],
    expertise: '近距离作战与人质解救', bottomLine: '枪口绝不指向无辜者', fear: '再次听见失败行动中的求救频道',
    approveLine: '我压制正面，你只管把目标带回来。', opposeLine: '这不是突击，是没有撤离方案的送死。',
  },
  {
    id: 'zhou_ye', name: '周野', profession: '越野救援司机',
    specialties: ['驾驶', '救援', '机械'], traits: ['坚韧', '利他'],
    expertise: '极端路况驾驶与车辆抢修', bottomLine: '不会把求救者丢在后视镜里', fear: '被困在永远开不到终点的道路上',
    approveLine: '路断了就换一条，车还动，人就能带出去。', opposeLine: '留下他能快一分钟，但那一分钟我不要。',
  },
  {
    id: 'bai_zhi', name: '白芷', profession: '临床药剂师',
    specialties: ['医疗', '药理', '数据'], traits: ['谨慎', '责任'],
    expertise: '毒物分析与紧急配药', bottomLine: '不会给同伴使用成分未知的药物', fear: '自己的判断让药物变成毒药',
    approveLine: '给我样本和两分钟，我能判断它会救人还是杀人。', opposeLine: '剂量、成分、代谢路径全都未知，不能注射。',
  },
  {
    id: 'chen_du', name: '陈渡', profession: '电力检修员',
    specialties: ['电子', '机械', '危险环境'], traits: ['责任', '谨慎'],
    expertise: '高压供电与城市地下设施', bottomLine: '送电前必须确认线路上没有活人', fear: '黑暗里响起本不该存在的合闸声',
    approveLine: '我能让它亮起来，但所有人先离开轨道。', opposeLine: '线路另一头还有负载，合闸等于亲手杀人。',
  },
  {
    id: 'luo_lan', name: '罗岚', profession: '刑事律师',
    specialties: ['交涉', '审讯', '逻辑'], traits: ['守序', '多疑'],
    expertise: '证词拆解、谈判与规则漏洞', bottomLine: '任何人都不能在胁迫下被定罪', fear: '规则从一开始只是一场处刑',
    approveLine: '它既然宣读规则，就必须承担规则里的漏洞。', opposeLine: '他没有选择权，这份所谓同意不成立。',
  },
  {
    id: 'song_qi', name: '宋栖', profession: '登山向导',
    specialties: ['救援', '观察', '危险环境'], traits: ['冷静', '责任'],
    expertise: '路线判断、绳索与野外生存', bottomLine: '恶劣环境下绝不拆散队伍', fear: '白雾吞掉绳队末端的同伴',
    approveLine: '保持间距，抓紧引导绳，我们一起穿过去。', opposeLine: '视野已经归零，再分头就是逐个失踪。',
  },
  {
    id: 'li_qing', name: '黎青', profession: '殡仪师',
    specialties: ['人体', '民俗', '心理'], traits: ['冷静', '利他'],
    expertise: '遗体修复与丧葬仪式', bottomLine: '死者的身份与尊严不能被利用', fear: '送走的人重新排队回到门外',
    approveLine: '先叫出它生前的名字，很多执念并不想伤人。', opposeLine: '别碰那张脸，它正在等一个身份。',
  },
  {
    id: 'cheng_mo', name: '程墨', profession: '理论物理研究员',
    specialties: ['数据', '逻辑', '学习'], traits: ['求知', '多疑'],
    expertise: '时空模型与异常数据推演', bottomLine: '模型不能凌驾于可观测事实', fear: '证明自己才是世界中多余的变量',
    approveLine: '循环有误差，只要误差存在，我们就能把它撬开。', opposeLine: '漂亮的解释不等于真实，先找可重复的证据。',
  },
  {
    id: 'xia_ning', name: '夏柠', profession: '社区社工',
    specialties: ['交涉', '心理', '救援'], traits: ['利他', '责任'],
    expertise: '危机沟通与失踪人口走访', bottomLine: '弱者不该成为多数人的代价', fear: '所有人都记得事件却忘了受害者',
    approveLine: '她不是任务变量，她是一个正在等人回应的人。', opposeLine: '人数不是理由，少数人的命也不是筹码。',
  },
  {
    id: 'fang_zhao', name: '方昭', profession: '舞台魔术师',
    specialties: ['观察', '交涉', '机关'], traits: ['好奇', '谨慎'],
    expertise: '视线误导、机关与逃脱术', bottomLine: '不会拿无法控制的危险当表演', fear: '幕布落下后台下只剩同一张脸',
    approveLine: '它在控制我们看哪里，那就去看它不想让人看的地方。', opposeLine: '这不是障眼法，失败以后没有谢幕。',
  },
]);

export const REINCARNATION_MONSTERS = Object.freeze([
  {
    id: 'faceless_inspector', name: '无面检票员', rank: '危险', type: '规则异怪',
    scenes: ['awakening', 'rule_test', 'memory_crash'], maxHp: 90, difficulty: 2, attack: 12, terror: 7, npcDamage: 8,
    description: '穿着褪色制服，面孔只有一道用于剪票的竖缝。它会检查每个人是否拥有“存在资格”。',
    mechanic: '点名时回答会被夺走姓名，沉默则会被判定为逃票者。', weakness: '破坏检票顺序或指出伪造车票', weaknessSpecialties: ['观察', '审讯', '民俗'], skill: '身份注销',
  },
  {
    id: 'reverse_passenger', name: '倒行乘客', rank: '普通', type: '时序残影',
    scenes: ['awakening', 'rule_test', 'child_signal'], maxHp: 65, difficulty: 1, attack: 8, terror: 5, npcDamage: 6,
    description: '身体朝前，关节却以相反方向行走；被它碰到的人会丢失刚刚发生的四十四秒。',
    mechanic: '每次失败都会让队伍忘记上一条有效线索。', weakness: '用连续记录固定时间顺序', weaknessSpecialties: ['记忆', '数据', '观察'], skill: '逆时触碰',
  },
  {
    id: 'mist_hound', name: '雾骸猎犬', rank: '普通', type: '追猎生物',
    scenes: ['awakening', 'child_signal', 'fracture'], maxHp: 72, difficulty: 1, attack: 11, terror: 3, npcDamage: 10,
    description: '由站台浓雾和碎骨拼成，只会追逐队伍中流血最严重的人。',
    mechanic: '优先袭击受伤目标，闻到新鲜血液后速度暴增。', weakness: '高频噪声与强光会打散雾态躯体', weaknessSpecialties: ['枪械', '电子', '危险环境'], skill: '循血扑杀',
  },
  {
    id: 'ticket_wraith', name: '纸票鬼', rank: '普通', type: '附着灵体',
    scenes: ['rule_test', 'child_signal', 'black_box'], maxHp: 58, difficulty: 1, attack: 6, terror: 8, npcDamage: 0,
    description: '由无数张作废车票折成人形，票面会逐渐印出队员的死亡时间。',
    mechanic: '先污染记忆，再让受害者主动走向票面标注的死亡地点。', weakness: '找出最早一张真实车票并烧毁', weaknessSpecialties: ['调查', '记忆', '民俗'], skill: '死期盖印',
  },
  {
    id: 'window_double', name: '车窗替身', rank: '危险', type: '认知异怪',
    scenes: ['rule_test', 'black_box', 'fracture'], maxHp: 86, difficulty: 2, attack: 9, terror: 10, npcDamage: 5,
    description: '它只存在于反光中，会逐步复制目标的动作、语气和记忆，直到从车窗内外交换位置。',
    mechanic: '信任越低，替身越容易说服小队它才是真人。', weakness: '制造无法被镜像同步的多人动作', weaknessSpecialties: ['心理', '交涉', '观察'], skill: '镜面置换', trustLoss: 3,
  },
  {
    id: 'name_eater', name: '失名者', rank: '危险', type: '记忆寄生体',
    scenes: ['child_signal', 'black_box', 'memory_crash'], maxHp: 82, difficulty: 2, attack: 7, terror: 12, npcDamage: 0,
    description: '看不清五官的人影，身上挂满无人认领的工牌。靠吞噬他人对受害者的记忆成长。',
    mechanic: '袭击后降低全队信任，并令一名队员暂时成为“陌生人”。', weakness: '公开完整姓名、经历与共同记忆', weaknessSpecialties: ['记忆', '心理', '档案'], skill: '存在剥离', trustLoss: 5,
  },
  {
    id: 'flesh_carriage', name: '血肉车厢', rank: '精英', type: '空间生命',
    scenes: ['child_signal', 'black_box', 'final_choice'], maxHp: 150, difficulty: 3, attack: 16, terror: 8, npcDamage: 12,
    description: '车壁在无人注视时缓慢搏动，扶手变成肋骨，座椅下方长出消化乘客的囊腔。',
    mechanic: '封锁出口并持续压缩空间，拖延越久伤害越高。', weakness: '切断列车供电或破坏车厢承重节点', weaknessSpecialties: ['机械', '电子', '爆破'], skill: '车厢消化', stressAll: 4,
  },
  {
    id: 'broadcast_parasite', name: '广播寄生体', rank: '危险', type: '声源异怪',
    scenes: ['black_box', 'fracture', 'memory_crash'], maxHp: 78, difficulty: 2, attack: 5, terror: 13, npcDamage: 0,
    description: '没有固定形体，寄生在每一只扬声器里，能用最信任之人的声音下达命令。',
    mechanic: '模拟NPC求救声，诱导小队分散并执行互相冲突的命令。', weakness: '隔离声源并比对语句中的记忆错误', weaknessSpecialties: ['电子', '心理', '数据'], skill: '服从指令', stressAll: 5,
  },
  {
    id: 'memory_moth', name: '记忆蛀群', rank: '普通', type: '精神虫群',
    scenes: ['black_box', 'fracture', 'memory_crash'], maxHp: 62, difficulty: 1, attack: 4, terror: 11, npcDamage: 0,
    description: '像灰烬般从旧照片中飞出，翅面排列着被啃空的人脸。',
    mechanic: '吞噬关键记忆，让真实线索与伪造回忆互相混淆。', weakness: '强光、密闭容器与交叉记录', weaknessSpecialties: ['记忆', '数据', '档案'], skill: '记忆蛀蚀', stressAll: 3,
  },
  {
    id: 'track_crawler', name: '轨下爬行者', rank: '危险', type: '伏击生物',
    scenes: ['child_signal', 'fracture', 'final_choice'], maxHp: 94, difficulty: 2, attack: 15, terror: 4, npcDamage: 14,
    description: '四肢被钢轨拉成细长金属节肢，只在列车减速时从车底攀上月台。',
    mechanic: '从视野盲区拖走队伍末位成员，并快速退回轨道下。', weakness: '保持阵型并提前布置绳索或交叉火力', weaknessSpecialties: ['警戒', '战术', '救援'], skill: '拖入轨底',
  },
  {
    id: 'cleaner_0444', name: '04:44清洁工', rank: '精英', type: '规则执行体',
    scenes: ['fracture', 'memory_crash', 'final_choice'], maxHp: 135, difficulty: 3, attack: 13, terror: 12, npcDamage: 10,
    description: '推着锈蚀清洁车，负责擦除事故现场、伤亡记录以及所有不该被记住的人。',
    mechanic: '被拖把经过的名字会从任务、档案和同伴记忆里同时消失。', weakness: '留下多份互相校验且无法同时清除的记录', weaknessSpecialties: ['调查', '数据', '档案'], skill: '记录清除', trustLoss: 4,
  },
  {
    id: 'blackbox_larva', name: '黑匣幼体', rank: '精英', type: '信息生命',
    scenes: ['black_box', 'memory_crash', 'final_choice'], maxHp: 128, difficulty: 3, attack: 8, terror: 14, npcDamage: 0,
    description: '从事故数据中孵化的漆黑人形，以矛盾证词为食，能够伪造刚刚发生的结果。',
    mechanic: '篡改一次失败或成功的记忆，使队伍无法判断谁说了真话。', weakness: '断开网络并使用物理证据建立只读事实链', weaknessSpecialties: ['数据', '逻辑', '调查'], skill: '结果篡写', stressAll: 6,
  },
  {
    id: 'last_driver', name: '末班车司机', rank: '首领', type: '事故核心',
    scenes: ['final_choice'], maxHp: 220, difficulty: 4, attack: 22, terror: 15, npcDamage: 16,
    description: '被方向盘和制动杆贯穿的高大尸体，仍在执行十二年前那条无法抵达终点的线路。',
    mechanic: '每次制动都会把伤势倒回队伍身上，并将列车拖向既定撞击。', weakness: '用黑匣子证明真正的事故指令并夺取驾驶权限', weaknessSpecialties: ['驾驶', '机械', '数据'], skill: '死亡班次', stressAll: 5,
  },
  {
    id: 'thirteenth_entity', name: '第十三乘客', rank: '首领', type: '因果空位',
    scenes: ['final_choice'], maxHp: 240, difficulty: 4, attack: 18, terror: 18, npcDamage: 12,
    description: '它不是某个人，而是每轮循环中被主动放弃的那个位置。所有牺牲者的脸在它身上轮流浮现。',
    mechanic: '只要队伍准备牺牲任何成员，它就会立即占据空位并复制被放弃者的全部记忆。', weakness: '所有成员共同选择返回，拒绝为它留下空座', weaknessSpecialties: ['救援', '交涉', '心理'], skill: '空位继承', trustLoss: 6,
  },
]);

export const REINCARNATION_EXCHANGES = Object.freeze([
  { id: 1, key: 'vital_training', name: '生命潜能训练', pointCost: 600, max: 10, description: '体力、免疫力、恢复力永久+1。', attributes: { 体力: 1, 免疫力: 1, 恢复力: 1 } },
  { id: 2, key: 'combat_training', name: '战斗潜能训练', pointCost: 600, max: 10, description: '肌肉强度、神经反射、战斗技巧永久+1。', attributes: { 肌肉强度: 1, 神经反射: 1, 战斗技巧: 1 } },
  { id: 3, key: 'intellect_training', name: '认知潜能训练', pointCost: 600, max: 10, description: '逻辑思维、记忆力、学习力永久+1。', attributes: { 逻辑思维: 1, 记忆力: 1, 学习力: 1 } },
  { id: 4, key: 'spirit_training', name: '精神潜能训练', pointCost: 600, max: 10, description: '意志力、感知力、抗压力永久+1。', attributes: { 意志力: 1, 感知力: 1, 抗压力: 1 } },
  { id: 5, key: 'gene_stabilizer', name: '基因稳定剂', pointCost: 1200, requiredGrade: 'C', max: 5, description: '基因锁稳定度+10，降低强行解锁的精神代价。', geneStability: 10 },
  { id: 6, key: 'neural_accelerator', name: '神经加速训练', pointCost: 2600, requiredGrade: 'B', max: 3, description: '神经反射+2、战斗技巧+1。', attributes: { 神经反射: 2, 战斗技巧: 1 } },
  { id: 7, key: 'memory_palace', name: '记忆宫殿', pointCost: 2600, requiredGrade: 'B', max: 3, description: '记忆力+2、逻辑思维+1。', attributes: { 记忆力: 2, 逻辑思维: 1 } },
  { id: 8, key: 'regeneration_factor', name: '再生因子·残片', pointCost: 5200, requiredGrade: 'A', max: 2, description: '恢复力+3、免疫力+2。', attributes: { 恢复力: 3, 免疫力: 2 } },
  { id: 9, key: 'spiritual_ember', name: '灵能火种', pointCost: 5200, requiredGrade: 'A', max: 2, description: '意志力+3、感知力+2。', attributes: { 意志力: 3, 感知力: 2 } },
  { id: 10, key: 'causality_observer', name: '因果观测者', pointCost: 9000, requiredGrade: 'S', max: 1, description: '十二属性各+1，更容易发现隐藏世界线。', allAttributes: 1 },
  { id: 11, key: 'worldline_anchor', name: '世界线锚定', pointCost: 16000, requiredGrade: 'SS', max: 1, description: '意志力、逻辑思维、抗压力各+4。', attributes: { 意志力: 4, 逻辑思维: 4, 抗压力: 4 } },
  { id: 12, key: 'reincarnator_authority', name: '轮回者权限', pointCost: 30000, requiredGrade: 'SSS', max: 1, description: '十二属性各+2，轮回中枢承认你的干涉资格。', allAttributes: 2 },
]);

const ENDINGS = Object.freeze({
  failure: { name: '抹杀结局·无人生还', grade: 'D', points: 120, survived: false, description: '你的意识被留在没有终点的列车上，轮回中枢只回收了一段残缺记录。' },
  madness: { name: '迷失结局·成为乘客', grade: 'D', points: 180, survived: false, description: '你接受了广播赋予的身份，成为下一批轮回者眼中的第十三名乘客。' },
  betrayal: { name: '独活结局·空出的座位', grade: 'D', points: 600, survived: true, description: '列车接受了祭品。你回到了中枢，但小队名册永远空了一格。' },
  escape: { name: '幸存结局·奔出末班车', grade: 'C', points: 900, survived: true, description: '你逃离了循环，却没能带回所有同行者，雾海市的事故仍会发生。' },
  team_escape: { name: '同行结局·黎明站台', grade: 'B', points: 1400, survived: true, description: '小队互相搀扶着越过终点线。列车仍在循环，但这一次没有人被留下。' },
  truth: { name: '真相结局·十二年前的黑匣子', grade: 'A', points: 2200, survived: true, description: '事故记录被送出循环，雾海市终于知道那一夜真正发生过什么。' },
  deep_truth: { name: '揭密结局·不存在的第十三人', grade: 'S', points: 3400, survived: true, description: '你证明列车以被遗忘者为燃料，强迫轮回交出了所有失踪者的名字。' },
  reverse: { name: '逆命结局·改写04:44', grade: 'SS', points: 5600, survived: true, description: '你将意识投向事故发生前，改变了撞击前最后一分钟的选择。' },
  true: { name: '真结局·终点从未发生', grade: 'SSS', points: 9600, survived: true, description: '列车、乘客与雾海市同时脱离既定死亡。主神第一次记录下无法回收的世界线。' },
});

const SCENES = Object.freeze({
  awakening: {
    act: 1, location: '第七码车厢', title: '醒来时，列车没有终点', threat: 3,
    narrative: [
      '冷白灯管依次亮起。你躺在一节没有线路编号的地铁里，车窗外只有浓得化不开的雾。',
      '三名陌生人与你同时醒来。每个人腕部都浮着同一句倒计时：距离04:44还有二十七分钟。',
    ],
    dialogue: [
      { speaker: '轮回中枢', text: '主线任务已发布：在04:44前抵达终点站。列车停止时，禁止遗留空座。' },
      { speaker: '{npc0}', text: '先别急着动。我们都不记得自己是怎么上车的。' },
    ],
    choices: [
      { text: '检查所有人的伤势与身份', risk: '低危', ethic: 'rescue', check: { attributes: ['逻辑思维', '恢复力'], difficulty: 14, specialty: '医疗' }, successText: '你发现所有人后颈都有同样的针孔，血液凝固时间却相差十二年。', failureText: '混乱的脉搏与陌生生理数据让判断失去意义。', successEffects: { flags: ['medicalInsight'], trustAll: 2, branch: { id: 'time_gap', grade: 'D', title: '错位的凝血时间' } }, failureEffects: { stress: 7 }, next: 'rule_test' },
      { text: '保持沉默，观察车窗与广播规律', risk: '低危', ethic: 'truth', check: { attributes: ['感知力', '逻辑思维'], difficulty: 14, specialty: '观察' }, successText: '每隔四十四秒，窗外同一盏红灯都会倒退一次，列车正在一段时间里循环。', failureText: '雾中的影子过于相似，你没能确认列车是否真的前进。', successEffects: { flags: ['loopClue'], worldline: 1 }, failureEffects: { stress: 5 }, next: 'rule_test' },
      { text: '撬开车厢应急柜，先取得武器', risk: '中危', ethic: 'pragmatic', check: { attributes: ['肌肉强度', '战斗技巧'], difficulty: 15, specialty: '强行突破' }, successText: '柜门后没有灭火器，只有一柄沾着旧血的信号斧。', failureText: '警报声骤然响起，某种东西隔着车门撞了你一下。', successEffects: { flags: ['signalAxe'] }, failureEffects: { hp: -14, stress: 8 }, next: 'rule_test' },
    ],
  },
  rule_test: {
    act: 1, location: '连接通道', title: '第十三名乘客', threat: 4,
    narrative: [
      '广播报出“当前乘客十二人”。可这节车厢连同你们，明明只有十一张脸。',
      '连接通道的玻璃上浮现一行雾字：不要清点乘客。它出现时，队伍里有人下意识地回答了“十二”。',
    ],
    dialogue: [
      { speaker: '{npc1}', text: '刚才有人站在我们中间。我记得轮廓，却想不起脸。' },
    ],
    choices: [
      { text: '顶着广播警告，重新清点每一道影子', risk: '中危', ethic: 'truth', check: { attributes: ['意志力', '感知力'], difficulty: 16, specialty: '警戒' }, successText: '第十三道影子不属于任何人，它正贴在你的脚后。', failureText: '数到第十二次时，你短暂忘记了自己的名字。', successEffects: { flags: ['ghostNumber'], branch: { id: 'thirteenth_passenger', grade: 'D', title: '第十三名乘客' }, worldline: 1 }, failureEffects: { stress: 14 }, next: 'child_signal' },
      { text: '逐个询问同伴，寻找记忆中的矛盾', risk: '低危', ethic: 'unity', check: { attributes: ['逻辑思维', '记忆力'], difficulty: 15, specialty: '审讯' }, successText: '{focus}的车票来自十二年前，而其他人的票都印着今天。', failureText: '众人的证词彼此污染，反而多出了几段不属于任何人的记忆。', successEffects: { flags: ['npcSecret'], trustAll: 3 }, failureEffects: { npcStressAll: 5 }, next: 'child_signal' },
      { text: '无视禁令，沿车顶追踪脚步声', risk: '高危', ethic: 'pragmatic', check: { attributes: ['神经反射', '战斗技巧'], difficulty: 17, specialty: '战术' }, successText: '你割下一截检票员制服，并看见胸牌上的名字与自己相同。', failureText: '车顶的东西抢先出手，利爪在你肩头留下冰冷伤口。', successEffects: { flags: ['conductorMark'] }, failureEffects: { hp: -20, stress: 8 }, next: 'child_signal' },
    ],
  },
  child_signal: {
    act: 2, location: '废弃月台', title: '不在任务名单里的孩子', threat: 5,
    narrative: [
      '列车在一座废弃站台减速。一个穿校服的女孩隔着玻璃拍门，她的脚边写着“事故唯一失踪者”。',
      '倒计时仍在流动。开门意味着偏离主线，不开门则只需要继续坐着。',
    ],
    dialogue: [{ speaker: '{npc0}', text: '她有体温，也有呼吸。至少现在还是活人。' }],
    choices: [
      { text: '强行制动列车，把女孩带上来', risk: '高危', ethic: 'rescue', check: { attributes: ['肌肉强度', '逻辑思维'], difficulty: 18, specialty: '救援' }, successText: '车门闭合前，你抓住了女孩。腕部倒计时因此少了整整五分钟。', failureText: '车门像捕兽夹般闭合，一名同伴为拉你回来受了重伤。', successEffects: { flags: ['childSaved'], worldline: 2, branch: { id: 'lost_child', grade: 'C', title: '救下失踪女孩' }, trustAll: 3 }, failureEffects: { hp: -12, damageNpc: 32, stress: 10 }, next: 'black_box' },
      { text: '记下站名，遵守主线继续前进', risk: '安全', ethic: 'pragmatic', successText: '女孩没有追赶，只在列车重新加速后举起一张写着你名字的旧照片。', effects: { flags: ['childAbandoned'], stress: 6 }, next: 'black_box' },
      { text: '利用广播回声，从循环缝隙接她上车', risk: '极危', ethic: 'truth', requiresAnyFlags: ['loopClue', 'ghostNumber'], check: { attributes: ['逻辑思维', '意志力'], difficulty: 19, specialty: '系统' }, successText: '你让广播提前了四十四秒。女孩从上一轮列车走进这一轮车厢。', failureText: '两个时间片同时闭合，你看见自己被车门夹死的记忆。', successEffects: { flags: ['childSaved', 'loopKey'], worldline: 3, branch: { id: 'loop_rescue', grade: 'B', title: '从上一轮救回乘客' }, trustAll: 4 }, failureEffects: { hp: -18, stress: 18 }, next: 'black_box' },
    ],
  },
  black_box: {
    act: 2, location: '驾驶室外', title: '被封死的黑匣子', threat: 5,
    narrative: [
      '驾驶室里没有司机。控制台被焊死，黑匣子的记录灯却仍在闪烁。',
      '屏幕显示，十二年前的04:44，这趟列车在雾海站前发生撞击，官方记录为“零人伤亡”。',
    ],
    dialogue: [{ speaker: '{npc2}', text: '零伤亡，却有一整列车的失踪档案。有人修改过数据库。' }],
    choices: [
      { text: '保留线路完整，破解黑匣子加密', risk: '中危', ethic: 'truth', check: { attributes: ['逻辑思维', '学习力'], difficulty: 19, specialty: '电子' }, successText: '你导出了撞击前最后一分钟的完整记录，里面有所有NPC的声音。', failureText: '加密程序反向写入你的终端，广播开始用你的声音发布命令。', successEffects: { flags: ['blackBox'], branch: { id: 'black_box', grade: 'B', title: '取得完整事故记录' }, worldline: 2 }, failureEffects: { stress: 16 }, next: 'fracture' },
      { text: '直接砸开外壳，抢出储存核心', risk: '高危', ethic: 'pragmatic', check: { attributes: ['肌肉强度', '战斗技巧'], difficulty: 19, specialty: '强行突破' }, successText: '储存核心保住了一半数据，其中反复出现“第十三人”字样。', failureText: '高压电弧贯穿手臂，储存核心也被烧毁。', successEffects: { flags: ['damagedBlackBox'], branch: { id: 'damaged_record', grade: 'C', title: '残缺事故记录' } }, failureEffects: { hp: -24, damageNpc: 18 }, next: 'fracture' },
      { text: '放弃设备，追踪驾驶室里的血迹', risk: '中危', ethic: 'truth', check: { attributes: ['感知力', '意志力'], difficulty: 18, specialty: '调查' }, successText: '血迹属于十二年前的小队，而名单中的队长正是你。', failureText: '血迹把你引回原车厢，座位上的人数又少了一个。', successEffects: { flags: ['crewTruth'], worldline: 1 }, failureEffects: { npcStressAll: 9 }, next: 'fracture' },
    ],
  },
  fracture: {
    act: 2, location: '紧急疏散门', title: '小队第一次拒绝命令', threat: 4, autonomy: true,
    narrative: [
      '倒计时只剩九分钟。{focus}突然停下，拒绝继续靠近终点站，并质问你是否隐瞒了任务代价。',
      '轮回中枢没有禁止内讧。恰恰相反，车门上出现了四个刚好够一部分人逃生的位置。',
    ],
    dialogue: [{ speaker: '{focus}', text: '你可以要求我冒险，但必须告诉我，我们究竟在救谁。' }],
    choices: [
      { text: '公开所有线索，让小队共同决定', risk: '中危', ethic: 'unity', check: { attributes: ['意志力', '逻辑思维'], difficulty: 18, specialty: '交涉' }, successText: '没有人完全赞同你，但所有人重新站回了同一条线。', failureText: '解释来得太晚，怀疑已经在每个人心里扎根。', successEffects: { flags: ['unity'], trustAll: 6, npcStressAll: -8, branch: { id: 'team_covenant', grade: 'C', title: '建立小队共同决策' } }, failureEffects: { trustAll: -4, npcStressAll: 8 }, next: 'memory_crash' },
      { text: '允许分队，尊重拒绝继续的人', risk: '高危', ethic: 'pragmatic', successText: '{focus}带着一名同伴留在疏散门后，你们约定在现实世界重逢。', effects: { flags: ['teamSplit'], separateFocus: true, trustAll: 1 }, next: 'memory_crash' },
      { text: '用武力和死亡威胁迫使所有人服从', risk: '极危', ethic: 'coercion', check: { attributes: ['战斗技巧', '意志力'], difficulty: 18, specialty: '战术' }, successText: '队伍继续移动，但他们看你的眼神已经不再像看同伴。', failureText: '{focus}夺走了疏散门控制器，独自消失在黑暗中。', successEffects: { flags: ['fearOrder'], trustAll: -10, npcStressAll: 12 }, failureEffects: { trustAll: -14, separateFocus: true }, next: 'memory_crash' },
    ],
  },
  memory_crash: {
    act: 3, location: '事故残响', title: '你曾经死在04:44', threat: 7,
    narrative: [
      '列车穿过终点前的隧道，所有灯光熄灭。撞击发生前的记忆同时灌入每个人脑中。',
      '你看见十二年前的自己站在驾驶室，亲手选择牺牲一节车厢，换取整座城市幸存。',
    ],
    dialogue: [{ speaker: '另一个你', text: '别再改了。每一次救他们，死去的人都会在下一轮加倍。' }],
    choices: [
      { text: '接受全部死亡记忆，保持自我清醒', risk: '极危', ethic: 'truth', crisis: true, check: { attributes: ['意志力', '记忆力'], difficulty: 21, specialty: '心理' }, successText: '你承认那次选择属于自己，却拒绝让它成为唯一的未来。', failureText: '上百次死亡重叠，你的意识几乎被过去的自己取代。', successEffects: { flags: ['selfTruth'], worldline: 2, branch: { id: 'death_memory', grade: 'A', title: '承受百次死亡记忆' } }, failureEffects: { stress: 28 }, next: 'final_choice' },
      { text: '撕碎幻象，与检票员正面交战', risk: '极危', ethic: 'pragmatic', crisis: true, check: { attributes: ['神经反射', '战斗技巧'], difficulty: 22, specialty: '枪械' }, successText: '你击碎了检票员面具，面具后是衰老十二年的自己。', failureText: '检票钳贯穿胸口，现实和记忆同时流血。', successEffects: { flags: ['conductorWounded'], branch: { id: 'conductor_mask', grade: 'B', title: '击碎检票员面具' } }, failureEffects: { hp: -38, stress: 14 }, next: 'final_choice' },
      { text: '让小队互相校验记忆，找出被篡改部分', risk: '高危', ethic: 'unity', requiresFlags: ['unity', 'blackBox'], check: { attributes: ['逻辑思维', '抗压力'], difficulty: 20, specialty: '数据' }, successText: '黑匣子与众人的记忆互相印证：真正下达牺牲命令的是轮回中枢。', failureText: '一个错误细节引发连锁怀疑，小队差点在幻觉中彼此攻击。', successEffects: { flags: ['selfTruth', 'teamTruth', 'crewTruth'], worldline: 3, branch: { id: 'memory_trial', grade: 'A', title: '全队通过记忆审判' }, trustAll: 5 }, failureEffects: { npcStressAll: 16, stress: 12 }, next: 'final_choice' },
    ],
  },
  final_choice: {
    act: 3, location: '雾海终点站', title: '主神只允许一种结局', threat: 9,
    narrative: [
      '04:44前最后一分钟，终点站出现在车窗外。站台一侧是轮回中枢的回归光柱，另一侧是十二年前尚未发生事故的雾海市。',
      '广播要求你提交最终选择。所有支线、伤亡与隐瞒都将在这一刻汇聚。',
    ],
    dialogue: [{ speaker: '{focus}', text: '这次由你决定。但无论选什么，至少让我们知道代价。' }],
    choices: [
      { text: '拉下紧急制动，带仍在身边的人返回中枢', risk: '中危', ethic: 'unity', successText: '车门在回归光柱前开启，你带着幸存者冲向黎明。', effects: { flags: ['evacuated'] }, ending: 'evacuate' },
      { text: '把完整黑匣子送入现实，迫使事故真相公开', risk: '高危', ethic: 'truth', requiresFlags: ['blackBox', 'selfTruth'], check: { attributes: ['逻辑思维', '意志力'], difficulty: 22, specialty: '数据' }, successText: '十二年前的事故记录覆盖了被篡改的新闻与档案。', failureText: '信号被中枢截断，黑匣子在光柱中化为灰烬。', successEffects: { branch: { id: 'publish_truth', grade: 'S', title: '向现实公开轮回真相' }, worldline: 3 }, failureEffects: { stress: 30 }, successEnding: 'truth', failureEnding: 'escape' },
      { text: '开启基因锁，把意识送回事故前改写04:44', risk: '必死', ethic: 'rescue', requiresFlags: ['childSaved', 'blackBox', 'selfTruth', 'unity'], crisis: true, forceGeneLock: true, check: { attributes: ['意志力', '逻辑思维', '神经反射'], difficulty: 29, specialty: '系统' }, successText: '你的神经开始燃烧，列车在两条时间线上同时脱轨。', failureText: '基因锁无法承受世界线反噬，你的意识被撕裂在两个时代之间。', successEffects: { flags: ['worldRewritten'], branch: { id: 'rewrite_0444', grade: 'SS', title: '改写事故发生前一分钟' }, worldline: 5 }, failureEffects: { hp: -200, stress: 100 }, successEnding: 'reverse', failureEnding: 'failure' },
      { text: '向列车交出一名同伴，独自换取回归资格', risk: '禁忌', ethic: 'sacrifice', successText: '一个座位重新空出，回归光柱只照在你身上。', effects: { killLowestTrustNpc: true, flags: ['betrayedTeam'] }, ending: 'betrayal' },
    ],
  },
});

const SCENE_ORDER = Object.keys(SCENES);

function clone(value) {
  return structuredClone(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function random(run) {
  let state = (number(run.rngState) >>> 0) || 0x9e3779b9;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  run.rngState = state >>> 0;
  return run.rngState / 0x100000000;
}

function shuffle(run, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random(run) * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function emptyRights() {
  return Object.fromEntries(REINCARNATION_BRANCH_GRADES.map(grade => [grade, 0]));
}

export function normalizeReincarnationMeta(player) {
  const current = player.无尽轮回 && typeof player.无尽轮回 === 'object'
    ? player.无尽轮回
    : {};
  const rights = emptyRights();
  for (const grade of REINCARNATION_BRANCH_GRADES)
    rights[grade] = Math.max(0, Math.floor(number(current.branchRights?.[grade])));
  const meta = {
    version: META_VERSION,
    points: Math.max(0, Math.floor(number(current.points))),
    branchRights: rights,
    geneLock: {
      stage: clamp(Math.floor(number(current.geneLock?.stage)), 0, 5),
      stability: clamp(Math.floor(number(current.geneLock?.stability)), 0, 100),
      awakenings: Math.max(0, Math.floor(number(current.geneLock?.awakenings))),
    },
    purchases: {},
    completedWorlds: Math.max(0, Math.floor(number(current.completedWorlds))),
    endings: current.endings && typeof current.endings === 'object' ? { ...current.endings } : {},
    highestEvaluation: REINCARNATION_BRANCH_GRADES.includes(current.highestEvaluation)
      ? current.highestEvaluation
      : 'D',
    lastEnding: current.lastEnding || null,
  };
  for (const product of REINCARNATION_EXCHANGES)
    meta.purchases[product.key] = clamp(
      Math.floor(number(current.purchases?.[product.key])),
      0,
      product.max
    );
  player.无尽轮回 = meta;
  return meta;
}

function getMetaAttributeBonuses(meta) {
  const bonuses = Object.fromEntries(ATTRIBUTE_NAMES.map(name => [name, 0]));
  for (const product of REINCARNATION_EXCHANGES) {
    const count = number(meta.purchases?.[product.key]);
    if (!count) continue;
    for (const name of ATTRIBUTE_NAMES)
      bonuses[name] += number(product.allAttributes) * count;
    for (const [name, value] of Object.entries(product.attributes || {}))
      bonuses[name] += number(value) * count;
  }
  return bonuses;
}

function buildAttributes(profession, meta) {
  const bonuses = getMetaAttributeBonuses(meta);
  return Object.fromEntries(
    ATTRIBUTE_NAMES.map(name => [
      name,
      Math.max(1, 5 + number(profession.attributes?.[name]) + number(bonuses[name])),
    ])
  );
}

function createNpcState(npc) {
  return {
    ...clone(npc), hp: 100, maxHp: 100, trust: 10, stress: 8,
    alive: true, separated: false,
  };
}

function createEncounterState(monster) {
  return {
    ...clone(monster), hp: monster.maxHp, status: 'active',
  };
}

function activeNpcs(run) {
  return run.npcs.filter(npc => npc.alive && !npc.separated);
}

function getCurrentEncounter(run) {
  return run.encounters?.[run.sceneId] || null;
}

function assignSceneEncounter(run, sceneId) {
  run.encounters ||= {};
  if (run.encounters[sceneId]) return run.encounters[sceneId];
  const eligible = REINCARNATION_MONSTERS.filter(monster => monster.scenes.includes(sceneId));
  const used = new Set(Object.values(run.encounters).map(monster => monster.id));
  const fresh = eligible.filter(monster => !used.has(monster.id));
  const pool = fresh.length ? fresh : eligible;
  if (!pool.length) return null;
  const encounter = createEncounterState(pool[Math.floor(random(run) * pool.length)]);
  run.encounters[sceneId] = encounter;
  return encounter;
}

function prepareScene(run, sceneId) {
  run.sceneId = sceneId;
  run.sceneVisits[sceneId] = number(run.sceneVisits[sceneId]) + 1;
  run.eventDialogue = [];
  const scene = SCENES[sceneId];
  assignSceneEncounter(run, sceneId);
  if (scene?.autonomy) {
    const focus = [...activeNpcs(run)].sort(
      (a, b) => b.stress - a.stress || a.trust - b.trust
    )[0];
    if (focus) {
      run.focusNpcId = focus.id;
      focus.stress = clamp(focus.stress + 7, 0, 100);
      run.eventDialogue.push({
        speaker: focus.name,
        text: `${focus.bottomLine}。继续服从之前，他要求你公开真正的风险。`,
      });
    }
  }
}

export function createReincarnationRun({ userId, player, seed = Date.now() }) {
  const meta = normalizeReincarnationMeta(player);
  const run = {
    version: 1,
    id: `${userId}:${Date.now()}`,
    userId: String(userId),
    worldId: 'mist_terminal',
    worldName: '终点站·雾海市',
    phase: 'scene',
    rngState: Number(seed) >>> 0,
    profession: null,
    attributes: {},
    hp: 100,
    maxHp: 100,
    stress: 8,
    maxStress: 100,
    geneLockStage: meta.geneLock.stage,
    geneLockStability: meta.geneLock.stability,
    geneLockUsed: false,
    geneLockAwakened: false,
    npcs: [],
    encounters: {},
    defeatedMonsters: [],
    encounterLog: [],
    sceneId: null,
    sceneVisits: {},
    focusNpcId: null,
    eventDialogue: [],
    flags: {},
    worldline: 0,
    branchEvents: [],
    history: [],
    lastOutcome: null,
    ending: null,
    settlement: null,
    startedAt: Date.now(),
  };
  run.profession = clone(
    REINCARNATION_PROFESSIONS[Math.floor(random(run) * REINCARNATION_PROFESSIONS.length)]
  );
  run.attributes = buildAttributes(run.profession, meta);
  run.npcs = shuffle(run, REINCARNATION_NPCS).slice(0, 3).map(createNpcState);
  run.focusNpcId = run.npcs[0]?.id || null;
  prepareScene(run, 'awakening');
  if (run.npcs[0])
    run.eventDialogue.push({
      speaker: run.npcs[0].name,
      text: `你看起来像是${run.profession.name}。至少我们现在知道谁最适合先行动。`,
    });
  return run;
}

function hasFlags(run, flags = []) {
  return flags.every(flag => Boolean(run.flags[flag]));
}

function choiceAvailable(run, choice) {
  if (!hasFlags(run, choice.requiresFlags)) return false;
  if (choice.requiresAnyFlags?.length && !choice.requiresAnyFlags.some(flag => run.flags[flag]))
    return false;
  if (choice.excludesFlags?.some(flag => run.flags[flag])) return false;
  if (
    choice.requiresNpcSkill &&
    !activeNpcs(run).some(npc => npc.specialties.includes(choice.requiresNpcSkill))
  ) return false;
  return true;
}

function tokenValues(run) {
  const focus = run.npcs.find(npc => npc.id === run.focusNpcId) || activeNpcs(run)[0];
  return {
    profession: run.profession.name,
    focus: focus?.name || '一名同伴',
    npc0: run.npcs[0]?.name || '同行者',
    npc1: run.npcs[1]?.name || '同行者',
    npc2: run.npcs[2]?.name || '同行者',
  };
}

function interpolate(run, text) {
  const values = tokenValues(run);
  return String(text || '').replace(/\{(profession|focus|npc[0-2])\}/g, (_, key) => values[key]);
}

function sceneChoices(run, scene) {
  return scene.choices.filter(choice => choiceAvailable(run, choice));
}

export function getReincarnationScene(run) {
  if (run.phase !== 'scene') return null;
  const scene = SCENES[run.sceneId];
  if (!scene) return null;
  const encounter = getCurrentEncounter(run);
  const choices = sceneChoices(run, scene).map((choice, index) => ({
    index: index + 1,
    text: interpolate(run, choice.text),
    risk: choice.risk,
    checkText: choice.check
      ? `${choice.check.attributes.join('+')}｜难度${choice.check.difficulty + number(encounter?.difficulty)}${choice.check.specialty ? `｜${choice.check.specialty}专长` : ''}${encounter ? `｜${encounter.name}干扰` : ''}`
      : '无需判定',
  }));
  return {
    id: run.sceneId,
    act: scene.act,
    location: scene.location,
    title: scene.title,
    narrative: scene.narrative.map(text => interpolate(run, text)),
    dialogue: [...scene.dialogue, ...(run.eventDialogue || [])].map(item => ({
      speaker: interpolate(run, item.speaker),
      text: interpolate(run, item.text),
    })),
    choices,
    encounter: clone(encounter),
  };
}

function gradeIndex(grade) {
  return Math.max(0, REINCARNATION_BRANCH_GRADES.indexOf(grade));
}

function addBranchEvent(run, branch) {
  if (!branch || run.branchEvents.some(event => event.id === branch.id)) return;
  run.branchEvents.push({ ...clone(branch), atScene: run.sceneId });
}

function selectNpcForDamage(run) {
  const candidates = activeNpcs(run);
  if (!candidates.length) return null;
  return candidates[Math.floor(random(run) * candidates.length)];
}

function applyEffects(run, effects = {}) {
  run.hp = clamp(run.hp + number(effects.hp), 0, run.maxHp);
  run.stress = clamp(run.stress + number(effects.stress), 0, run.maxStress);
  run.worldline = Math.max(0, run.worldline + number(effects.worldline));
  for (const flag of effects.flags || []) run.flags[flag] = true;
  for (const npc of run.npcs) {
    npc.trust = clamp(npc.trust + number(effects.trustAll), -100, 100);
    npc.stress = clamp(npc.stress + number(effects.npcStressAll), 0, 100);
  }
  if (effects.damageNpc) {
    const npc = selectNpcForDamage(run);
    if (npc) {
      npc.hp = clamp(npc.hp - number(effects.damageNpc), 0, npc.maxHp);
      if (!npc.hp) npc.alive = false;
    }
  }
  if (effects.separateFocus) {
    const focus = run.npcs.find(npc => npc.id === run.focusNpcId);
    if (focus) focus.separated = true;
  }
  if (effects.killLowestTrustNpc) {
    const target = [...activeNpcs(run)].sort((a, b) => a.trust - b.trust)[0];
    if (target) {
      target.hp = 0;
      target.alive = false;
    }
  }
  addBranchEvent(run, effects.branch);
}

const ETHIC_PREFERENCES = Object.freeze({
  rescue: { approve: ['利他', '责任'], oppose: ['谨慎'] },
  truth: { approve: ['好奇', '求知'], oppose: ['谨慎'] },
  unity: { approve: ['守序', '冷静', '责任'], oppose: ['多疑'] },
  pragmatic: { approve: ['谨慎', '坚韧'], oppose: ['利他'] },
  coercion: { approve: ['坚韧'], oppose: ['利他', '守序', '冷静'] },
  sacrifice: { approve: [], oppose: ['利他', '责任', '守序', '冷静'] },
});

function applyNpcReaction(run, ethic, success) {
  const preference = ETHIC_PREFERENCES[ethic];
  if (!preference) return null;
  let strongest = null;
  for (const npc of activeNpcs(run)) {
    const approves = npc.traits.some(trait => preference.approve.includes(trait));
    const opposes = npc.traits.some(trait => preference.oppose.includes(trait));
    const delta = approves ? (success ? 3 : 1) : opposes ? (success ? -3 : -2) : 0;
    npc.trust = clamp(npc.trust + delta, -100, 100);
    if (opposes) npc.stress = clamp(npc.stress + 3, 0, 100);
    if (!strongest || Math.abs(delta) > Math.abs(strongest.delta))
      strongest = { npc, delta, approves, opposes };
  }
  if (!strongest || !strongest.delta) return null;
  return {
    speaker: strongest.npc.name,
    text: strongest.delta > 0
      ? strongest.npc.approveLine
      : strongest.npc.opposeLine,
    trustDelta: strongest.delta,
  };
}

function tryGeneLock(run, choice, score, difficulty) {
  if (!choice.crisis || (!choice.forceGeneLock && score >= difficulty))
    return { score, used: false, awakened: false };
  const stabilityReduction = Math.floor(run.geneLockStability / 20);
  if (run.geneLockStage <= 0) {
    const threshold =
      number(run.attributes.意志力) +
      number(run.attributes.抗压力) +
      Math.floor(run.stress / 12);
    if (threshold < 12) return { score, used: false, awakened: false };
    run.geneLockStage = 1;
    run.geneLockAwakened = true;
    run.geneLockUsed = true;
    run.flags.geneLockUsed = true;
    run.stress = clamp(run.stress + Math.max(8, 18 - stabilityReduction), 0, 100);
    return { score: score + 7, used: true, awakened: true };
  }
  run.geneLockUsed = true;
  run.flags.geneLockUsed = true;
  run.stress = clamp(run.stress + Math.max(5, 14 - stabilityReduction), 0, 100);
  return { score: score + 4 + run.geneLockStage, used: true, awakened: false };
}

function encounterWeaknessSupport(run, encounter) {
  if (!encounter) return { bonus: 0, names: [] };
  const weaknesses = encounter.weaknessSpecialties || [];
  const names = [];
  if (run.profession.specialties.some(specialty => weaknesses.includes(specialty)))
    names.push(run.profession.name);
  for (const npc of activeNpcs(run))
    if (npc.specialties.some(specialty => weaknesses.includes(specialty))) names.push(npc.name);
  return { bonus: Math.min(4, names.length * 2), names };
}

function resolveCheck(run, choice) {
  if (!choice.check)
    return { success: true, score: null, difficulty: null, roll: null, supporters: [], geneLock: null };
  const encounter = getCurrentEncounter(run);
  const supporters = activeNpcs(run).filter(npc =>
    npc.specialties.includes(choice.check.specialty)
  );
  const weakness = encounterWeaknessSupport(run, encounter);
  const professionBonus = run.profession.specialties.includes(choice.check.specialty) ? 3 : 0;
  const supportBonus = Math.min(4, supporters.length * 2);
  const stressPenalty = Math.min(4, Math.floor(run.stress / 25));
  const difficulty = choice.check.difficulty + number(encounter?.difficulty);
  const roll = 1 + Math.floor(random(run) * 6);
  let score = choice.check.attributes.reduce(
    (sum, attribute) => sum + number(run.attributes[attribute]),
    0
  ) + professionBonus + supportBonus + weakness.bonus + roll - stressPenalty;
  const geneLock = tryGeneLock(run, choice, score, difficulty);
  score = geneLock.score;
  return {
    success: score >= difficulty,
    score,
    difficulty,
    roll,
    supporters: supporters.map(npc => npc.name),
    weaknessSupporters: weakness.names,
    encounter: encounter ? encounter.name : null,
    geneLock,
  };
}

function resolveEncounter(run, choice, success) {
  const encounter = getCurrentEncounter(run);
  if (!encounter || encounter.status !== 'active') return null;
  const weakness = encounterWeaknessSupport(run, encounter);
  const directCounter = choice.check?.specialty &&
    encounter.weaknessSpecialties.includes(choice.check.specialty);
  const countered = directCounter || weakness.names.length > 0;
  let target = null;
  let playerDamage = 0;
  let npcDamage = 0;

  if (success) {
    encounter.status = countered ? 'defeated' : 'repelled';
    encounter.hp = countered ? 0 : Math.ceil(encounter.maxHp * 0.35);
    if (countered) {
      run.defeatedMonsters ||= [];
      if (!run.defeatedMonsters.includes(encounter.id)) run.defeatedMonsters.push(encounter.id);
    }
  } else {
    encounter.status = 'escaped';
    playerDamage = number(encounter.attack);
    run.hp = clamp(run.hp - playerDamage, 0, run.maxHp);
    run.stress = clamp(run.stress + number(encounter.terror), 0, run.maxStress);
    for (const npc of activeNpcs(run)) {
      npc.trust = clamp(npc.trust - number(encounter.trustLoss), -100, 100);
      npc.stress = clamp(npc.stress + number(encounter.stressAll), 0, 100);
    }
    if (encounter.npcDamage) {
      target = selectNpcForDamage(run);
      if (target) {
        npcDamage = number(encounter.npcDamage);
        target.hp = clamp(target.hp - npcDamage, 0, target.maxHp);
        if (!target.hp) target.alive = false;
      }
    }
  }

  const result = {
    id: encounter.id,
    name: encounter.name,
    rank: encounter.rank,
    skill: encounter.skill,
    success,
    countered,
    status: encounter.status,
    weaknessSupporters: weakness.names,
    playerDamage,
    npcTarget: target?.name || null,
    npcDamage,
    text: success
      ? countered
        ? `队伍抓住“${encounter.weakness}”的弱点，击破了${encounter.name}。`
        : `你们挣脱了${encounter.name}的追击，但没能彻底消灭它。`
      : `${encounter.name}发动【${encounter.skill}】，轮回者受到${playerDamage}点伤害${target ? `，${target.name}受到${npcDamage}点伤害` : ''}。`,
  };
  run.encounterLog ||= [];
  run.encounterLog.push(clone(result));
  return result;
}

function allNpcsReturned(run) {
  return run.npcs.every(npc => npc.alive && !npc.separated);
}

function resolveEndingId(run, requested) {
  if (requested === 'evacuate')
    return allNpcsReturned(run) ? 'team_escape' : 'escape';
  if (requested === 'truth')
    return run.flags.crewTruth && run.flags.ghostNumber ? 'deep_truth' : 'truth';
  if (requested === 'reverse') {
    const trueEnding =
      allNpcsReturned(run) &&
      run.flags.childSaved &&
      run.flags.loopKey &&
      run.flags.blackBox &&
      run.flags.selfTruth &&
      run.flags.unity &&
      run.flags.geneLockUsed;
    return trueEnding ? 'true' : 'reverse';
  }
  return requested;
}

function createSettlement(run, endingId) {
  const ending = ENDINGS[endingId];
  if (endingId === 'true')
    addBranchEvent(run, { id: 'world_never_ended', grade: 'SSS', title: '令终点从未发生' });
  const returned = run.npcs.filter(npc => npc.alive && !npc.separated).length;
  const branchBonus = run.branchEvents.reduce(
    (sum, event) => sum + 60 + gradeIndex(event.grade) * 50,
    0
  );
  const monsterBonus = (run.defeatedMonsters?.length || 0) * 120;
  let points = ending.points + run.worldline * 120 + returned * 80 + branchBonus + monsterBonus;
  if (!ending.survived) points = Math.floor(points * 0.25);
  const rights = emptyRights();
  if (ending.survived)
    for (const event of run.branchEvents) rights[event.grade]++;
  return {
    worldId: run.worldId,
    worldName: run.worldName,
    endingId,
    ending: clone(ending),
    evaluation: ending.grade,
    points,
    rights,
    branchEvents: clone(run.branchEvents),
    worldline: run.worldline,
    returnedNpcs: returned,
    totalNpcs: run.npcs.length,
    defeatedMonsters: clone(run.defeatedMonsters || []),
    monsterBonus,
    geneLockAwakened: run.geneLockAwakened,
    geneLockStage: run.geneLockStage,
  };
}

function finishRun(run, requestedEnding) {
  const endingId = resolveEndingId(run, requestedEnding);
  run.phase = 'ending';
  run.ending = { id: endingId, ...clone(ENDINGS[endingId]) };
  run.settlement = createSettlement(run, endingId);
  return run.settlement;
}

export function chooseReincarnationOption(run, choiceNumber) {
  if (run.phase !== 'scene') throw new Error('当前没有等待选择的轮回剧情');
  const scene = SCENES[run.sceneId];
  if (!scene) throw new Error('当前世界线已经失效');
  const choices = sceneChoices(run, scene);
  const choice = choices[Math.floor(number(choiceNumber)) - 1];
  if (!choice) throw new Error(`请选择1至${choices.length}`);

  const check = resolveCheck(run, choice);
  const success = check.success;
  applyEffects(run, choice.effects);
  applyEffects(run, success ? choice.successEffects : choice.failureEffects);
  const encounter = resolveEncounter(run, choice, success);
  run.stress = clamp(run.stress + number(scene.threat), 0, run.maxStress);
  const reaction = applyNpcReaction(run, choice.ethic, success);
  const outcome = {
    sceneId: run.sceneId,
    sceneTitle: scene.title,
    choice: interpolate(run, choice.text),
    success,
    text: interpolate(run, success ? choice.successText : choice.failureText),
    check,
    encounter,
    reaction,
    hp: run.hp,
    stress: run.stress,
  };
  run.lastOutcome = outcome;
  run.history.push(clone(outcome));

  let settlement = null;
  const requestedEnding = success
    ? choice.successEnding || choice.ending
    : choice.failureEnding || choice.ending;
  if (run.hp <= 0) settlement = finishRun(run, 'failure');
  else if (run.stress >= run.maxStress) settlement = finishRun(run, 'madness');
  else if (requestedEnding) settlement = finishRun(run, requestedEnding);
  else prepareScene(run, success ? choice.successNext || choice.next : choice.failureNext || choice.next);

  return {
    outcome: clone(outcome),
    ended: run.phase === 'ending',
    settlement: settlement ? clone(settlement) : null,
    scene: getReincarnationScene(run),
  };
}

function taskStatus(run, sceneId, successFlag, failureFlag = null) {
  if (run.flags[successFlag]) return 'complete';
  if (failureFlag && run.flags[failureFlag]) return 'failed';
  const currentIndex = SCENE_ORDER.indexOf(run.sceneId);
  const taskIndex = SCENE_ORDER.indexOf(sceneId);
  return currentIndex > taskIndex || run.phase === 'ending' ? 'failed' : currentIndex === taskIndex ? 'active' : 'locked';
}

export function getReincarnationTasks(run) {
  return [
    { kind: '主线', title: '在04:44前抵达终点站', status: run.phase === 'ending' ? (run.ending.survived ? 'complete' : 'failed') : 'active', reward: '轮回点与回归资格' },
    { kind: '支线', title: '确认第十三名乘客', status: taskStatus(run, 'rule_test', 'ghostNumber'), reward: 'D级支线权限' },
    { kind: '支线', title: '救下月台失踪者', status: taskStatus(run, 'child_signal', 'childSaved', 'childAbandoned'), reward: 'C/B级支线权限' },
    { kind: '支线', title: '取得列车黑匣子', status: run.flags.blackBox ? 'complete' : run.flags.damagedBlackBox ? 'partial' : taskStatus(run, 'black_box', 'blackBox'), reward: 'B级支线权限' },
    { kind: '人物', title: '让所有NPC共同返回', status: run.phase === 'ending' ? (allNpcsReturned(run) ? 'complete' : 'failed') : run.flags.unity ? 'active' : 'locked', reward: '结局与评价修正' },
    { kind: '隐藏', title: '改写04:44事故', status: run.flags.worldRewritten ? 'complete' : hasFlags(run, ['childSaved', 'blackBox', 'selfTruth', 'unity']) ? 'active' : 'hidden', reward: 'SS/SSS级支线权限' },
  ];
}

export function getReincarnationRunView(run) {
  return {
    id: run.id,
    worldId: run.worldId,
    worldName: run.worldName,
    phase: run.phase,
    profession: clone(run.profession),
    attributes: clone(run.attributes),
    attributeGroups: Object.entries(REINCARNATION_ATTRIBUTE_GROUPS).map(([name, attributes]) => ({
      name,
      total: attributes.reduce((sum, attribute) => sum + number(run.attributes[attribute]), 0),
      attributes: attributes.map(attribute => ({ name: attribute, value: run.attributes[attribute] })),
    })),
    hp: run.hp,
    maxHp: run.maxHp,
    stress: run.stress,
    maxStress: run.maxStress,
    worldline: run.worldline,
    geneLockStage: run.geneLockStage,
    geneLockStability: run.geneLockStability,
    geneLockUsed: run.geneLockUsed,
    npcs: clone(run.npcs),
    encounter: clone(getCurrentEncounter(run)),
    defeatedMonsters: clone(run.defeatedMonsters || []),
    encounterLog: clone(run.encounterLog || []),
    scene: getReincarnationScene(run),
    tasks: getReincarnationTasks(run),
    branchEvents: clone(run.branchEvents),
    lastOutcome: clone(run.lastOutcome),
    ending: clone(run.ending),
    settlement: clone(run.settlement),
  };
}

function productPrice(product, bought) {
  return Math.round(product.pointCost * (1 + bought * 0.5));
}

export function findReincarnationExchange(input) {
  const text = String(input || '').trim();
  return REINCARNATION_EXCHANGES.find(product =>
    String(product.id) === text || product.name === text || product.key === text
  ) || null;
}

export function getReincarnationMetaView(player) {
  const meta = normalizeReincarnationMeta(player);
  const bonuses = getMetaAttributeBonuses(meta);
  return {
    meta: clone(meta),
    bonuses,
    products: REINCARNATION_EXCHANGES.map(product => {
      const bought = number(meta.purchases[product.key]);
      const price = productPrice(product, bought);
      return {
        ...clone(product),
        bought,
        price,
        maxed: bought >= product.max,
        affordable: meta.points >= price && (!product.requiredGrade || meta.branchRights[product.requiredGrade] > 0),
      };
    }),
  };
}

export function purchaseReincarnationExchange(player, input) {
  const meta = normalizeReincarnationMeta(player);
  const product = findReincarnationExchange(input);
  if (!product) throw new Error('轮回中枢没有这项强化');
  const bought = number(meta.purchases[product.key]);
  if (bought >= product.max) throw new Error(`【${product.name}】已经强化至上限`);
  const price = productPrice(product, bought);
  if (meta.points < price)
    throw new Error(`轮回点不足：需要${price}，当前${meta.points}`);
  if (product.requiredGrade && meta.branchRights[product.requiredGrade] <= 0)
    throw new Error(`需要${product.requiredGrade}级支线权限×1`);
  meta.points -= price;
  if (product.requiredGrade) meta.branchRights[product.requiredGrade]--;
  meta.purchases[product.key] = bought + 1;
  if (product.geneStability)
    meta.geneLock.stability = clamp(meta.geneLock.stability + product.geneStability, 0, 100);
  return {
    product: clone(product),
    level: meta.purchases[product.key],
    price,
    points: meta.points,
    meta: clone(meta),
  };
}

export function applyReincarnationSettlement(player, settlement) {
  const meta = normalizeReincarnationMeta(player);
  meta.points += Math.max(0, Math.floor(number(settlement.points)));
  for (const grade of REINCARNATION_BRANCH_GRADES)
    meta.branchRights[grade] += Math.max(0, Math.floor(number(settlement.rights?.[grade])));
  if (settlement.ending?.survived) meta.completedWorlds++;
  meta.endings[settlement.endingId] = number(meta.endings[settlement.endingId]) + 1;
  if (gradeIndex(settlement.evaluation) > gradeIndex(meta.highestEvaluation))
    meta.highestEvaluation = settlement.evaluation;
  meta.lastEnding = {
    worldName: settlement.worldName,
    endingId: settlement.endingId,
    name: settlement.ending.name,
    evaluation: settlement.evaluation,
    at: Date.now(),
  };
  if (settlement.geneLockAwakened && settlement.geneLockStage > meta.geneLock.stage) {
    meta.geneLock.stage = settlement.geneLockStage;
    meta.geneLock.awakenings++;
  }
  return clone(meta);
}

export function getReincarnationContent() {
  return {
    professions: clone(REINCARNATION_PROFESSIONS),
    npcs: clone(REINCARNATION_NPCS),
    monsters: clone(REINCARNATION_MONSTERS),
    exchanges: clone(REINCARNATION_EXCHANGES),
    endings: clone(ENDINGS),
    scenes: clone(SCENES),
  };
}
