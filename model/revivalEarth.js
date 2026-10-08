// 原著机制与插件数值的边界见《复活地球玩法说明.md》。
// 本世数据独立存放；旧版仅在成功动作时升级，无后台扣费、无全账号重开。
export const REVIVAL_EARTH_LOCATION = 0.5;
export const REVIVAL_REALMS = Object.freeze(['凡人', '炼气', '筑基', '金丹', '元婴', '化神']);
export const REVIVAL_PHASES = Object.freeze(['初期', '中期', '后期', '大圆满']);
export const REVIVAL_STUDY_NEED = Object.freeze([0, 100, 180, 300, 480]);
const MINUTE = 60_000;
const ELEMENTS = ['金', '木', '水', '火', '土'];
const TOWER_CLUES = ['规章', '读数', '名册'];
const JOBS = Object.freeze({
  绿植维护: { credits: 30, items: { 灵植: 2 }, contribution: 1 },
  工程检修: { credits: 35, items: { 工程部件: 1 }, contribution: 1 },
  复活值守: { credits: 40, items: {}, contribution: 2 },
});
const MAX_WORK_BATCH = 10;
const BREAKTHROUGHS = Object.freeze({
  minor: { kind: 'minor', minutes: 5, credits: 10, items: {}, risk: 0 },
  foundation: { kind: 'foundation', minutes: 60, credits: 60, items: { 筑基丹: 1 }, risk: 0 },
  core: { kind: 'core', minutes: 90, credits: 80, items: {}, risk: 0 },
  nascent: { kind: 'nascent', minutes: 120, credits: 100, items: { 金脑丹: 1 }, risk: 0.65 },
  spirit: { kind: 'spirit', minutes: 120, credits: 100, items: {}, risk: 0 },
});
const CONTRACTS = Object.freeze({
  医疗补给: { items: { 灵植: 4 }, credits: 45, contribution: 3 },
  设备修复: { items: { 工程部件: 2, 燃料: 1 }, credits: 65, contribution: 4 },
});
const SIGNAL_KINDS = ['signalInvestigate', 'signalVerify', 'signalHandle'];
const FIELD_KINDS = ['journey', 'scavenge', 'fieldCultivate', 'return', ...SIGNAL_KINDS];
const FIELD_MODES = Object.freeze({
  隐蔽: { windows: 2, adjustment: -0.1 }, 法术: { windows: 1, adjustment: -0.06 }, 科技: { windows: 1, adjustment: -0.12 },
});
// 一次外勤至多一段固定信号；仅为原创规则遭遇，不据此解释原著伪人的本质。
const SIGNAL_PATTERNS = Object.freeze({
  回声: {
    clue: '耳机里的接应员重复着上一轮的停顿。你还没发问，他已念完你的下一句回答；飞船外却没有灯。',
    evidence: '本地离线录音显示：回声沿接收广播持续定位，关闭回传后仍重复。处置规则：切断广播接收，保留真实返航导航。',
    answer: '切断广播',
  },
  索名: {
    clue: '接应员只问姓名，不报船号。每次回传亮起，探测图上的人影就近一格；你沉默时，它也停下。',
    evidence: '离线比对显示：它只在终端回传时逼近，关闭广播后自动回传仍在。处置规则：关闭回传，保留真实返航导航。',
    answer: '关闭回传',
  },
  借影: {
    clue: '屏幕里的接应员抬手与你同步，连你身后的裂口都映在他肩后。切到离线画面，他仍指向镜头外；通道里却没有脚步声。',
    evidence: '离线逐帧比对显示：对方动作来自你自己的前置镜头，广播与位置回传关闭后图像仍更新。处置规则：遮断镜头，保留真实返航导航。',
    answer: '遮断镜头',
  },
  错时: {
    clue: '接应员每报一次时间，导航上的归航窗口就向前跳一格。机械计时器还没走完一分钟，终端却催你立刻离开原路。',
    evidence: '离线校时显示：假接应点只篡改授时数据，广播静音与镜头遮蔽均不阻止偏移。处置规则：锁定时钟，按出发时保存的本地时基导航。',
    answer: '锁定时钟',
  },
});
const LEGACY_SIGNALS = ['回声', '索名'];
const SIGNAL_ORDER = ['回声', '借影', '错时', '索名'];
const SIGNAL_HANDLES = ['切断广播', '关闭回传', '遮断镜头', '锁定时钟'];
const SIGNAL_CHOICES = ['绕开信号', ...SIGNAL_HANDLES, '追随信号'];
// 以下人物、事件选择和制度门槛为插件改编，不是原著角色或固定数值。
const TOWER_EVENTS = Object.freeze({
  读数矛盾: {
    npc: '抄表员陈默（原创狱友）',
    text: '两张复活记录的末位读数不一致。陈默指出：伪人按表执行，错的不是刑期，而是你们认定的处理时点。',
    choices: {
      共同核验: { minutes: 15, stale: false, escort: false, text: '逐项比对记录；解除旧表误差，不增加越狱风险。' },
      采用旧表: { minutes: 5, stale: true, escort: false, text: '先拿到协作；越狱失败率额外增加15个百分点，候时不消除此误差，重新观察读数可纠正。' },
    },
  },
  轮换分离: {
    npc: '护工周苓（原创狱友）',
    text: '周苓掌握下一批处理名册。她愿意交换记录，但希望你把另一名囚徒也列入复活接应计划。',
    choices: {
      共用窗口: { minutes: 5, stale: false, escort: true, text: '带上囚徒一同尝试；越狱失败率额外增加10个百分点，成功到站增加贡献3。' },
      个人窗口: { minutes: 10, stale: false, escort: false, text: '重新整理个人时点，不增加越狱风险；同伴不随你离塔，也没有协作接应贡献。' },
    },
  },
  同号名册: {
    npc: '记账员许砚（原创狱友）',
    text: '名册上有两个相同的囚号，一栏写着等待重塑，另一栏却已在值守。许砚把纸翻到背面：旧号指向上一批处理时点，凭它离塔更快，也可能把你送回同一张台上。',
    choices: {
      逐页对照: { minutes: 20, stale: false, escort: false, text: '从原始页核对处理批次，20分钟取得可靠协作，不增加越狱风险。' },
      借用旧号: { minutes: 5, stale: true, escort: false, text: '5分钟沿用旧号取得协作；越狱失败率额外增加15个百分点，重新观察读数可纠正，候时本身不消除误差。' },
    },
  },
  熄灯点名: {
    npc: '修理工林朔（原创狱友）',
    text: '灯灭后，点名声仍从空床传来。林朔在停机时留下的纸条上数出一个被漏记的活人。按旧名单独走、为同伴补录，或花更久核对自己的批次，都要付出不同代价。',
    choices: {
      按表独行: { minutes: 5, stale: true, escort: false, text: '5分钟沿旧名单独行；越狱失败率额外增加15个百分点，没有同行贡献。重新观察读数可纠正旧表。' },
      补录同伴: { minutes: 10, stale: false, escort: true, text: '10分钟补录活着的同伴；越狱失败率额外增加10个百分点，成功到站贡献+3，接应仍不保本世修为。' },
      手抄核对: { minutes: 25, stale: false, escort: false, text: '25分钟逐项核对个人批次，不增加越狱风险；不带同伴离塔，也不领取同行贡献。' },
    },
  },
});
const LEGACY_TOWER_EVENTS = ['读数矛盾', '轮换分离'];
const TOWER_EVENT_ORDER = ['读数矛盾', '同号名册', '熄灯点名', '轮换分离'];
// 有限的本世事件链，沿用计时行动和抉择；人物、遭遇与资源代价均为插件原创。
const PATH_STAGES = Object.freeze({
  化凡: ['借来的床位', '断药名单', '无回音的接应'],
  信仰: ['饥年供桌', '病榻祈求', '沉默图腾', '送别之约'],
});
const PATH_EVENTS = Object.freeze({
  借来的床位: {
    text: '临时胶囊按工时分配。工友程禾的复活登记刚完成，床位却因缺勤被划去。他问的不是长生，只是今晚能在哪里睡。你仍压着足以改变眼前局面的修为。',
    choices: {
      匀出配给: { minutes: 10, credits: 10, items: { 灵植: 1 }, text: '分出食宿配给；程禾随后协助跑腿，下一段换药用时由60降至30分钟。', result: '程禾借到一晚床位，答应帮你跑腿。你的配给被扣去，登记系统没有因此多出一张床。' },
      顶替夜班: { minutes: 45, credits: 0, items: {}, text: '用凡人劳动替他补足工时；下一段购药可凭工单从30降至15积分。', result: '你接过了他的夜班。工单只换来一张药费折抵凭证，没有改变按工时分配生存资源的规则。' },
    },
  },
  断药名单: {
    text: '病区把“仍有药”和“等待复活”写在相邻两栏。一名病者托你买药，又问若接应落空，是否还会有人记得他的名字。你只以凡人的办法承接这件事。',
    choices: {
      购买药包: { minutes: 10, credits: 30, items: {}, text: '购买并送达药包，不承诺治愈或复活；此前顶替夜班可抵15积分。', result: '药包及时送到了。病者把姓名交给你；药只能缓解这一刻，接应名单上仍没有他的确认回执。' },
      跑腿换药: { minutes: 60, credits: 0, items: {}, text: '用病区杂务换药，不花积分；此前匀出配给可由程禾协助，缩至30分钟。', result: '你拿着劳动换来的药返回时，病床已经空了。名单仍在滚动，你留下的承诺却再没有人当面追问。' },
    },
  },
  无回音的接应: {
    text: '接应台只重复“记录待核”，既不确认归来，也不宣布结束。你要决定如何安置这些没有回音的名字，而不是把愿望说成一定兑现的神迹。',
    choices: {
      留存名册: { minutes: 10, credits: 20, items: { 工程部件: 1 }, text: '租用终端并封存名册；不改变接应概率，也不产生新复活保障。', result: '终端存下了名字，却没有带回任何一个人。你留下的是见证，不是免死承诺。三段经历完成，可立愿。' },
      手抄守候: { minutes: 60, credits: 0, items: {}, text: '亲手抄录并陪家属等过一轮值守，不花积分或材料。', result: '你抄完最后一个名字，值守灯又换了一轮。有人离去，有人继续等待；你终于要说清自己愿意承担什么。可立愿。' },
    },
  },
  饥年供桌: {
    text: '传承支线中的凡间聚落仍保留供奉传统。供桌摆着最后一袋口粮，守庙人却已饿得站不稳。他们把图腾当作寄托，饥饿并未因此消失。',
    choices: {
      分粮共食: { minutes: 10, credits: 0, items: { 灵植: 3 }, text: '补入粮药并与众人共食；下一段若承认局限，共同照护将由60缩至30分钟。', result: '供桌前的人先吃到食物，再自愿留下供奉。他们答应共同照护病者；信仰不是向空间站兑换来的贡献。' },
      轮值耕作: { minutes: 60, credits: 0, items: {}, text: '陪众人修整药圃、排定轮值；下一段送药所需灵植由4降至2。', result: '轮值表落在每个人手里。药圃余粮留给病区，图腾前的供奉来自共同承担，不是突然降下的神迹。' },
    },
  },
  病榻祈求: {
    text: '病者家属捧着图腾请你许诺活到明天。供奉可以延续，病痛却没有按祈祷次数减轻。你要回应的是具体的人，不是再收一轮信仰数值。',
    choices: {
      送药守约: { minutes: 10, credits: 0, items: { 灵植: 4 }, text: '送药并说明药效有限；此前轮值耕作可少用灵植2，受助家庭将协助最终交接，缩短30分钟。', result: '药送进病区，你没有保证所有人都能活下来。受助家庭愿意接手照护轮值，供奉随守约而留下。' },
      承认局限: { minutes: 60, credits: 0, items: {}, text: '说明图腾不是免死保证，亲自照护和守丧；此前分粮共食可得到帮手，缩至30分钟。最终交接仍需60分钟。', result: '有些人撤下了供物，愿意留下的人不再要求你许诺永生。你与他们照护、送别；留下的信仰有了边界。' },
    },
  },
  沉默图腾: {
    text: '图腾附近出现一段模仿逝者的声音，逐个索要供奉者的姓名。仪器记录与口述彼此矛盾。没人证实它是什么，更没有证据证明它会兑现许诺。',
    choices: {
      仪器复核: { minutes: 15, credits: 10, items: { 工程部件: 2 }, text: '架设普通记录设备，比对异常；最终留下手册时可复用记录，免去10积分抄录费。', result: '录音里的回答重复了同一处停顿。你封存未经证实的“神谕”，保存核验记录；这没有授予识破一切异常的能力。' },
      停供守夜: { minutes: 60, credits: 0, items: {}, text: '暂停异常供奉，逐人核对姓名并守夜；最终手册仍需10积分抄录费。', result: '你陪众人熬过沉默的一夜，没有把未证实的声音当成命令。供奉重新由活着的人自愿决定。' },
    },
  },
  送别之约: {
    text: '当你准备离开，守庙人问：“你走之后，病区和夜班交给谁？”继续依赖一个随时会离去的人，并不是已经兑现的庇护。',
    choices: {
      交接轮值: { minutes: 60, credits: 0, items: {}, text: '逐户交接照护与守夜；此前送药守约可获得受助家庭协助，缩至30分钟。', result: '接班人复述完每项约定。你没有许诺随叫随到，众人也没有把生命押在一个永不失约的神身上。信仰准备完成。' },
      留下手册: { minutes: 15, credits: 10, items: { 工程部件: 1 }, text: '留下照护、核验与交接记录；此前仪器复核可免去10积分，工程部件仍需1。', result: '手册写明了可做之事，也写下做不到之事。图腾前仍有供奉，但离别不再被包装成万能庇护。信仰准备完成。' },
    },
  },
});
// 单人视角的原创公共危机；不代表原著制度，也不修改其他玩家或全站共享资源。
const CRISIS_STAGES = ['失压警报', '配给争议', '名册回声'];
const CRISIS_EVENTS = Object.freeze({
  失压警报: {
    text: '氧循环支路突然失压。值守员罗砚把两张表推到你面前：传感器称舱内无人，登记册却列着刚完成复活的人。隔门仍有敲击声。先维持呼吸，还是先相信读数？',
    choices: {
      机械检修: { minutes: 15, credits: 20, items: { 工程部件: 3 },
        text: '更换支路并保留离线控制日志；末段公开核账少需10积分与工程部件1。',
        result: '压力回来了。离线日志却显示，同一张供氧牌在两个舱室同时核销。仪器修好了管路，没有回答门后的声音是谁。' },
      灵力稳压: { minutes: 5, credits: 0, items: {}, power: true,
        text: '至少炼气；炼气至元婴支付本阶段积累25，化神不再扣凡间积累。化凡期间先保持压制，可选其他办法。稳住压力不等于取得核账证据。',
        result: '灵力把压力维持在警戒线之上。隔门的敲击与你的心跳重合了一瞬；术法没有留下可靠的控制日志，后续仍须另行取证。' },
      轮班供氧: { minutes: 45, credits: 0, items: {},
        text: '接替人工压缩与搬运，不花材料或额外积分；工友留下交接见证，末段公开核账基础用时由45降至30分钟。',
        result: '你们轮流转动备用压缩机。有人在交接纸上签名，有人只留下指印。工友孟乔记住了每次换班；机器认不出的人，暂时由人作证。' },
    },
  },
  配给争议: {
    text: '压力恢复了，剩余配给却只够部分舱室先用。旧表按贡献排序，新复活者几乎排在末尾。孟乔问：清零重来的人，要拿什么证明自己值得等到下一次接应？',
    choices: {
      贡献优先: { minutes: 10, credits: 0, items: {},
        text: '沿用贡献排序，快速完成分发；低贡献工友被转入等待名单，末段公开核账因缺少现场证人增加15分钟。',
        result: '配给按贡献顺序发完。系统记下“秩序恢复”，孟乔的床位却变成了一个待接应编号。你再去找他，交接处只剩一张空椅子。' },
      配给改订: { minutes: 20, credits: 20, items: { 灵植: 2 },
        text: '自付粮药缺额，按当前需求重排本次配给；工友留在现场作证，末段公开核账减少15分钟。仅影响本支线。',
        result: '粮药填上了一部分缺口，孟乔和病区轮值员留了下来。另一座失联舱室仍没有回应；重排一张表，并没有凭空多出一套生命维持设备。' },
      延长轮值: { minutes: 60, credits: 0, items: {},
        text: '用额外人工轮值分担缺额，不花材料或额外积分；保留现场证人，末段公开核账减少15分钟。',
        result: '你把名字填进无人愿接的长班，工友分摊了剩余轮值。孟乔熬到了交接，失联舱室的灯却始终没有亮。多做一班，只换来一部分人继续等待。' },
    },
  },
  名册回声: {
    text: '核销台出现两个相同编号：一份说人还在病舱，一份说已完成复活接应。两次签名连停笔处都一样。罗砚把档案权限交给你：公开差异会延长核验，封存则能立即让名册恢复“正常”。',
    choices: {
      公开核账: { minutes: 45, credits: 20, items: { 工程部件: 2 },
        text: '保存矛盾原件并逐人核账；前两段的日志、见证与分配决定实际成本。此举不授予识破伪人的能力。',
        result: '你留下了两份互相矛盾的原件。本次配给交接补上双人核验，失联者仍未归来；至少他们的缺席没有被改写成设备误差。' },
      封存名册: { minutes: 10, credits: 0, items: {},
        text: '以设备异常封存此案，迅速结案；矛盾编号留在封档中，不再重选或补发另一结局的贡献。',
        result: '异常被归入设备故障，公开名册恢复正常。换班广播响起时，你却听见它再次念出那个已经核销的编号。' },
    },
  },
});
const STATION_PERMITS = Object.freeze({
  配给: { field: 'rationed', contribution: 4, cost: 20, text: '登记定额配给，每次站务生活费减1积分。' },
  居住: { field: 'resident', contribution: 8, cost: 60, text: '登记正式床位，每次站务生活费减2积分。' },
  接应: { field: 'relay', contribution: 12, cost: 40, text: '登记备用接应资料；无欠款时，新行动每轮接应成功率为60%，仍收费且不保修为。' },
});
const STATION_ACTIONS = ['work', 'workBatch', 'study', 'cultivate', 'fog', 'craft', 'element', 'breakthrough',
  'mortal', 'rescue', 'totem', 'seekFaith', 'preach', 'journey', 'stationChoice'];
const REVIEW_ACTIONS = ['工作', '还款', '接受清退', '委托', '交付委托', '取消委托', '存入', '取出', '接应预算'];
const LIFE_DECISION = /^(抉择|调查|核验|越狱|探索|应对|深入|撤离|弃货撤离|地表修炼|吸收黑雾|突破|化神|立愿|动用修为|申请|透支|还款|参与危机|公议)(?:\s|$)/;

// 时长、资源数量、任务风险均为游戏平衡值，不冒充原著定量设定。
export const REVIVAL_EXPEDITIONS = Object.freeze({
  地表采药: { realm: 1, cost: 15, minutes: 10, risk: 0.18, threat: '采集区接近伪人巡查路线，撤离窗口有限', items: { 灵植: 5, 百年大蓟: 1, 百年茯神: 1, 筑基药引: 1 } },
  废站勘探: { realm: 1, cost: 15, minutes: 10, risk: 0.25, threat: '废站结构失稳，异常生物活动尚未排除', items: { 工程部件: 3, 燃料: 3 } },
  古木遗址: { realm: 2, cost: 30, minutes: 20, risk: 0.3, threat: '灵气充足，但远离可靠的返航接应点', items: { 千年古木: 1, 五百年灵草: 1 } },
  极寒地带: { realm: 2, cost: 30, minutes: 20, risk: 0.35, threat: '极寒环境与异常活动同时威胁生命维持系统', items: { 水灵之气: 1 } },
  塔底调查: { realm: 2, cost: 40, minutes: 20, risk: 0.4, threat: '再度进入塔的控制范围，暴露可能导致重新收监', items: { 黑雾样本: 1 }, unlock: '佛道传承' },
  道门试炼: { realm: 3, cost: 80, minutes: 30, risk: 0.55, threat: '选拔的另一面是耗材筛选，落选者面临被用于炼丹', items: { 金脑丹: 1 }, need: '佛道传承' },
  图腾寻访: { realm: 4, cost: 40, minutes: 20, risk: 0.25, threat: '载体附近的污染读数升高，回程可能中断', items: { 图腾载体: 1 } },
  离界测绘: { realm: 4, cost: 50, minutes: 20, risk: 0.3, threat: '测绘需要持续暴露位置，接引信号亦可能来自陷阱', items: {}, unlock: '离界坐标' },
});

const RECIPES = Object.freeze({
  探测器: { realm: 1, credits: 10, items: { 工程部件: 1 } },
  丹炉: { realm: 1, credits: 80, items: { 工程部件: 3 }, facility: '丹炉' },
  筑基丹: { realm: 1, credits: 20, items: { 百年大蓟: 1, 百年茯神: 1, 筑基药引: 1 }, need: '丹炉' },
  本命法器: { realm: 2, credits: 100, items: { 工程部件: 5 }, body: 'weapon' },
  持续火种: { realm: 2, credits: 50, items: { 燃料: 3 }, facility: '持续火种' },
  接引装置: { realm: 4, credits: 500, items: { 工程部件: 12, 燃料: 6 }, facility: '接引装置', knowledge: '离界坐标' },
});

export const REVIVAL_ITEMS = Object.freeze([...new Set([
  ...Object.values(REVIVAL_EXPEDITIONS).flatMap(item => Object.keys(item.items)),
  ...Object.values(RECIPES).flatMap(item => Object.keys(item.items)),
  '筑基丹', '探测器',
])]);

export const REVIVAL_HELP = [
  '【复活地球·独立凡间路线】',
  '炼气 → 筑基 → 金丹 → 元婴 → 化神；本版止于化神初期。',
  '下列命令均以 #复活地球 开头：',
  '入界 / 入界 确认｜状态｜规则｜结算',
  '塔规｜事件｜观察 [规章/读数/名册]｜交谈｜抉择 选项 [确认]｜推演｜候时｜越狱 确认',
  '站务｜工作 [绿植维护/工程检修/复活值守] [次数1~10] [确认]｜委托 医疗补给/设备修复｜交付委托｜取消委托',
  '连续工作：多轮先预览，确认后每轮5分钟、逐轮计生活费，到期一次结算；不自动续工。',
  '站务危机｜参与危机 [确认]｜公议 选项 [确认]：原创三段公共危机，前段选择影响后段代价。',
  '申请 配给/居住/接应 [确认]｜透支 数额 [确认]｜还款 数额｜接受清退 [确认]',
  '履历｜死亡记录｜复盘 [世次]',
  '研读｜修炼｜筹备｜突破 [确认]',
  '探索 地表采药/废站勘探/古木遗址/极寒地带/塔底调查/道门试炼/图腾寻访/离界测绘 [确认]',
  '外勤｜应对 隐蔽/法术/科技 [确认]｜深入 [确认]｜地表修炼 [确认]｜撤离/弃货撤离 [确认]',
  '可疑接应：事件｜调查 信号 [确认]｜核验 手工/科技 [确认]｜异常档案',
  '抉择 绕开信号/切断广播/关闭回传/遮断镜头/锁定时钟/追随信号 [确认]',
  '制作 探测器/丹炉/筑基丹/本命法器/持续火种/接引装置',
  '蕴养 金/木/水/火/土｜吸收黑雾 确认',
  '接应预算 0~300（60的倍数）｜存入/取出 物品 数量',
  '化神 化凡/信仰/化魔｜化凡｜立愿 愿文｜动用修为 确认',
  '凝聚图腾｜寻访信众｜传道｜救援 确认｜离界 确认',
  '化凡/传道到期：结算 → 事件 → 抉择 选项 确认 → 结算；选择兑现后才增加经历或信仰。',
  '行动到期后使用「结算」。离线不额外扣费或生成事故。',
  '化魔待原文补核；离界接入既有仙界是插件改编，不是原著飞升结论。',
].join('\n');

export const REVIVAL_RULES = [
  '【死亡与修炼规则】',
  '真正死亡：本世境界、修为、五行蕴养、本命法器、图腾与化神过程、随身物资归零。',
  '记忆、设施、仓储与账户余额保留；黑雾成瘾也保留，没有永久战力补偿。',
  '接应每轮60积分，最多5轮；默认每轮50%，无欠款且取得接应资格的新行动为60%，首次成功即停扣。',
  '更新前已经启动的行动保留旧结算与全额预算计费；新行动按逐轮接应计费。',
  '接应预算为0或余额不足60：死亡后回塔。预算只决定落点，空间站复活同样清修为。',
  '塔内需要规章、读数、名册与狱友协作；校准后推演窗口。候时降低越狱失败率，每次尝试消耗窗口。',
  '外勤物资与调查发现暂存在地表，返站后才入账；深入、施法与地表修炼会消耗撤离窗口。',
  '在地表暂停站内工作、仓储、制作与突破；弃货撤离降低风险但丢失本次全部收获。',
  '新版外勤25%遇可疑接应信号（插件原创）：先调查核验再处置，或绕开、追随、直接撤离。旧在途外勤不追加信号。',
  '信号正确处置使后续搜索、修炼和撤离风险减5个百分点；误判或追随加15个百分点，仍受2%~90%上下限约束。无额外暗骰，线索不因离线或重启刷新。',
  '第七版新外勤含回声、索名、借影、错时四类信号，总出现率仍25%；新交谈含四组狱友事件，代价在选择前公开。旧在途信号及交谈按原版本兑现。',
  '异常档案仅在第七版核验结算后留下一条对应记录，最多四类，死亡保留；查询不揭示当前未调查信号，也不自动减风险。旧核验不追补档案。',
  '筑基：筑基丹与闭关；结丹：五行齐备；污染结婴：佛道传承、金脑丹与闭关。',
  '金脑丹路线是佛道污染支线，不宣称它是原著所有修士的唯一结婴方式。',
  '道门试炼涉及金丹修士沦为炼丹耗材；此处仅使用剧情NPC，不扣取其他玩家角色。',
  '化凡期间压制修为，动用修为会重置悟道过程；信仰路线需要图腾与有信仰传统的群体。',
  '化凡/传道先遇见事件，再确认选择并结算；选择影响后续资源或用时。事件与人物为插件改编，不是原著突破公式。',
  '抉择延续已付费的当段经历，不再收生活费或扣缓冲；开始抉择仍须通过站务审查。旧待结算经历兑现原进度。',
  '空间站工作、委托和救援只产生站务贡献，不产生宗教信仰；信众寻访与四段供奉经历为压缩支线改编。',
  '站内开工、闭关、制作、外勤出发各记一次生活费，默认5积分，配给与居住资格合计降至2；零余额仍可工作。',
  '连续工作每批2~10轮，首轮开工扣费，余下各轮在结算时按保存的单轮费率依次扣费、发薪还款；零余额减免也逐轮计算，不是整批只收一次。',
  '筹备仅汇总当前阶段的固定开销与已到账物资，含材料来源和取仓提示；外勤、筹材劳动与化神抉择的费用另计，不自动购买或开始行动。',
  '公共危机是单人原创支线：主动参与，每段公议另计生活费与欠款缓冲，兑现后贡献+2；不增加暗骰死亡，不自动续段或按离线制造损失。',
  '公共危机每份复活地球记录仅一次；已兑现选择随站务账户保留，死亡仍清本世修为。它不代替化凡、信仰或离界条件，也不改其他玩家的配给制度。',
  '透支收一次10%服务费，欠款上限132；三次非工作站务行动后进入清退审查。工作及委托收入优先还款，离线不扣息。',
  '清退审查期间先工作或还款；接受清退须另行确认，会死亡回塔、清本世修为，但债务继续保留。',
  '所有时长、数量和任务风险是插件数值；风险先展示，开始时固定随机数，重启与重复消息不重抽。',
].join('\n');

function newBody() {
  return {
    realm: 0, phase: 0, cultivation: 0, weapon: false,
    elements: Object.fromEntries(ELEMENTS.map(name => [name, 0])),
    path: '', chosenPath: '', mortalSteps: 0, vow: '', totem: false, faith: 0,
    pathEvent: null, pathChoices: [],
  };
}

export function createRevivalState(now = Date.now()) {
  return {
    version: 7, revision: 0, status: 'active', createdAt: now,
    place: '塔监狱', body: newBody(), bag: {}, storage: {}, facilities: {},
    knowledge: {}, credits: 0, rescueBudget: 120, addiction: 0, deaths: 0,
    towerNotes: 0, receivedWelcome: false, action: null, receipts: [], history: [],
    tower: { clues: [], ally: false, calibrated: false, window: 0, event: null, stale: false, escort: false },
    station: { contribution: 0, completed: 0, contract: null, resident: false, rationed: false, relay: false, debt: 0, grace: 0, crisis: null },
    expedition: null, lifeTrace: [], deathRecords: [], anomalyArchive: [],
  };
}

// 只操作私有副本：查询、预览与失败动作不迁移落盘，旧行动不补随机数或改费用。
function migrateState(state) {
  if (state.version === 1) {
    state.version = 2;
    state.tower = { clues: TOWER_CLUES.slice(0, state.towerNotes), ally: false, calibrated: false, window: 0 };
    state.station = { contribution: 0, completed: 0, contract: null };
    state.expedition = null;
  }
  if (state.version === 2) {
    state.version = 3;
    Object.assign(state.tower, { event: null, stale: false, escort: false });
    Object.assign(state.station, { resident: false, rationed: false, relay: false, debt: 0, grace: 0 });
    state.lifeTrace = [];
    state.deathRecords = [];
  }
  if (state.version === 3) {
    state.version = 4;
    Object.assign(state.body, { pathEvent: null, pathChoices: [] });
  }
  if (state.version === 4) {
    state.version = 5;
    // 已出发旅程直到返站都按旧约定进行，不凭升级补抽遭遇。
    if (state.expedition) state.expedition.signal = null;
  }
  if (state.version === 5) {
    state.version = 6;
    state.station.crisis = null;
  }
  if (state.version === 6) {
    state.version = 7;
    // 旧经历不反推成新证据，旧待结算行动的规则版本保持原值。
    state.anomalyArchive = [];
  }
  return state;
}

export function isRevivalEarthActive(player) {
  return player?.复活地球?.status === 'active';
}

export function getRevivalCommandBlock(player, message) {
  if (player?.复活地球?.needsImmortalSync
    && !/^#(?:复活地球(?:\s|$)|复活全人类$)/.test(String(message || '').trim())) {
    return '离界记录已保存，仙界属性尚待同步。请先发送 #复活地球 状态 完成同步。';
  }
  if (!isRevivalEarthActive(player)) return '';
  if (/^#(?:复活地球(?:\s|$)|复活全人类$|我的练气$|我$|诸天帮助$|修仙帮助$|再入仙途$|强制再入仙途$|世界(?:\s|$))/.test(String(message || '').trim())) return '';
  return '你正身处复活地球，使用独立境界与物资。请发送 #复活地球 查看本世进度；普通修炼与穿梭暂停。';
}

export function assertRevivalWriteCurrent(previous, next) {
  const before = previous?.复活地球;
  if (!before) return;
  const after = next?.复活地球;
  const changedNativeRealm = before.status === 'active' && after?.status === 'active'
    && ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', 'lunhui']
      .some(key => Number(previous[key] || 0) !== Number(next[key] || 0));
  if (!after || after.revision < before.revision
    || (after.revision === before.revision && JSON.stringify(before) !== JSON.stringify(after))
    || (after.status === 'active' && Number(next.power_place) !== REVIVAL_EARTH_LOCATION)
    || changedNativeRealm) {
    const error = new Error('复活地球存档已变化，请重新读取后操作。');
    error.code = 'REVIVAL_EARTH_STALE_WRITE';
    throw error;
  }
}

function realmName(body) {
  return body.realm === 0 ? '凡人' : `${REVIVAL_REALMS[body.realm]}${REVIVAL_PHASES[body.phase]}`;
}

function requireCondition(ok, message) {
  if (!ok) throw new Error(message);
}

function pathProgress(body) {
  return body.path === '化凡' ? body.mortalSteps : Math.floor(body.faith / 25);
}

function nextPathEvent(body) {
  return PATH_STAGES[body.path]?.[pathProgress(body)] || null;
}

function pathEventInfo(body, name = body.pathEvent) {
  const event = PATH_EVENTS[name];
  const choices = Object.fromEntries(Object.entries(event.choices).map(([key, value]) => [key, { ...value }]));
  const chose = (id, choice) => body.pathChoices.some(record => record.event === id && record.choice === choice);
  let echo = '';
  if (name === '断药名单') {
    if (chose('借来的床位', '匀出配给')) choices.跑腿换药.minutes = 30;
    if (chose('借来的床位', '顶替夜班')) choices.购买药包.credits = 15;
    echo = chose('借来的床位', '匀出配给') ? '回响：程禾赶来帮你跑腿，兑现那晚的约定。'
      : chose('借来的床位', '顶替夜班') ? '回响：夜班工单仍有效，药房同意抵扣15积分。' : '';
  } else if (name === '无回音的接应') {
    echo = chose('断药名单', '购买药包') ? '回响：你还记得病者亲口托付姓名的声音；药已送达，接应却始终没有确认。'
      : chose('断药名单', '跑腿换药') ? '回响：空病床上的编号与接应台名册相同。你来得太晚，药还在手里。' : '';
  } else if (name === '病榻祈求') {
    if (chose('饥年供桌', '轮值耕作')) choices.送药守约.items = { 灵植: 2 };
    if (chose('饥年供桌', '分粮共食')) choices.承认局限.minutes = 30;
    echo = chose('饥年供桌', '轮值耕作') ? '回响：此前留下的药圃配给补上两份药材，送药少需灵植2。'
      : chose('饥年供桌', '分粮共食') ? '回响：与你共食的人来轮流照护，陪守用时减少30分钟。' : '';
  } else if (name === '送别之约') {
    if (chose('病榻祈求', '送药守约')) choices.交接轮值.minutes = 30;
    if (chose('沉默图腾', '仪器复核')) choices.留下手册.credits = 0;
    echo = [
      chose('病榻祈求', '送药守约') ? '回响：受助家庭如约接班，交接用时减少30分钟。'
        : chose('病榻祈求', '承认局限') ? '回响：众人接受你并非万能，仍请你把照护职责逐户交清。' : '',
      chose('沉默图腾', '仪器复核') ? '核验记录可以复用，留下手册免去10积分抄录费。' : '',
    ].filter(Boolean).join('\n');
  }
  return { ...event, choices, echo };
}

function crisisInfo(state) {
  const records = state.station.crisis?.choices || [];
  const name = CRISIS_STAGES[records.length];
  const event = structuredClone(CRISIS_EVENTS[name]);
  const first = records[0]?.choice;
  const second = records[1]?.choice;
  const echoes = [];
  if (first) echoes.push(`前段回响：${CRISIS_EVENTS.失压警报.choices[first].result}`);
  if (second) echoes.push(`分配回响：${CRISIS_EVENTS.配给争议.choices[second].result}`);
  if (name === '名册回声') {
    const audit = event.choices.公开核账;
    if (first === '机械检修') {
      audit.credits -= 10;
      audit.items.工程部件--;
    } else if (first === '轮班供氧') audit.minutes = 30;
    audit.minutes += second === '贡献优先' ? 15 : -15;
  }
  for (const choice of Object.values(event.choices)) {
    choice.cultivationCost = choice.power && state.body.realm < 5 ? 25 : 0;
  }
  return { ...event, name, echo: echoes.join('\n') };
}

function crisisAftermath(state) {
  const records = state.station.crisis?.choices;
  if (!records) return '';
  if (records.length < CRISIS_STAGES.length) {
    return `公共危机尚停在「${CRISIS_STAGES[records.length]}」，已兑现${records.length}/3段。${state.status === 'ascended'
      ? '你带着未结的公案离开；后续结果没有补造，已存记录封存于此凡间篇。' : '剩余选择待你回站确认；等待与离线不自动处置。'}`;
  }
  return [
    '【公共危机结案·插件原创】',
    records[1].choice === '贡献优先'
      ? '贡献排序被沿用。孟乔的空床仍挂着待接应编号；贡献表证明他曾经劳动过，却没有把他带回交接处。'
      : '孟乔留在下一班见证名单上。按需分配靠的是你补入的资源或工时，并没有救回那座失联舱室里的人。',
    records[2].choice === '公开核账'
      ? '矛盾编号与原件被保留，本支线的配给交接增加双人核验。制度留下了纠错入口，却仍解释不了两个相同的签名。'
      : '封档理由是设备异常。广播里的那个编号仍在重复；公开账目已经整齐，失联者却没有因此出现。',
    '已兑现公议随站务档案保留，结案不重复发贡献，不赠修为、信仰、免死或永久战力，也不修改全服制度。',
  ].join('\n');
}

function validateState(state) {
  requireCondition([1, 2, 3, 4, 5, 6, 7].includes(state?.version) && ['active', 'ascended'].includes(state.status), '复活地球存档版本异常，请保留存档并检查。');
  requireCondition(['塔监狱', '空间站', '仙界', ...(state.version >= 2 ? ['地表'] : [])].includes(state.place), '复活地球位置异常，请检查存档。');
  for (const field of ['revision', 'credits', 'rescueBudget', 'addiction', 'deaths', 'towerNotes']) {
    requireCondition(Number.isSafeInteger(state[field]) && state[field] >= 0, `复活地球字段 ${field} 异常，请检查存档。`);
  }
  requireCondition(state.rescueBudget <= 300 && state.rescueBudget % 60 === 0, '接应预算字段异常，请检查存档。');
  requireCondition(Number.isInteger(state.body?.realm) && state.body.realm >= 0 && state.body.realm < REVIVAL_REALMS.length
    && Number.isInteger(state.body.phase) && state.body.phase >= 0 && state.body.phase < REVIVAL_PHASES.length
    && Number.isSafeInteger(state.body.cultivation) && state.body.cultivation >= 0, '本世境界数据异常，请检查存档。');
  requireCondition(state.bag && state.storage && state.facilities && state.knowledge
    && state.body.elements && Array.isArray(state.receipts) && Array.isArray(state.history), '本世资源结构异常，请检查存档。');
  requireCondition(Number.isInteger(state.body.mortalSteps) && state.body.mortalSteps >= 0 && state.body.mortalSteps <= 3
    && Number.isInteger(state.body.faith) && state.body.faith >= 0 && state.body.faith <= 100
    && ['', '化凡', '信仰'].includes(state.body.path)
    && ['', '化凡', '信仰'].includes(state.body.chosenPath)
    && typeof state.body.vow === 'string', '化神过程数据异常，请检查存档。');
  if (state.version >= 4) {
    const b = state.body;
    const stages = PATH_STAGES[b.path] || [];
    requireCondition(Array.isArray(b.pathChoices) && b.pathChoices.length <= stages.length
      && b.pathChoices.every((record, i, records) => record
        && typeof record.event === 'string' && stages.includes(record.event)
        && typeof record.choice === 'string' && Object.hasOwn(PATH_EVENTS[record.event].choices, record.choice)
        && stages.indexOf(record.event) < pathProgress(b)
        && (!i || stages.indexOf(records[i - 1].event) < stages.indexOf(record.event))),
    '化神抉择履历异常，请检查存档。');
    requireCondition(b.pathEvent === null || (typeof b.pathEvent === 'string'
      && b.pathEvent === nextPathEvent(b) && b.realm === 4 && ['空间站', '地表'].includes(state.place)
      && state.status === 'active'), '待处理化神事件异常，请检查存档。');
  }
  for (const inventory of [state.bag, state.storage]) {
    for (const [name, amount] of Object.entries(inventory)) {
      requireCondition(REVIVAL_ITEMS.includes(name) && Number.isSafeInteger(amount) && amount >= 0, '本世物资数据异常，请检查存档。');
    }
  }
  for (const name of ELEMENTS) {
    requireCondition(Number.isInteger(state.body.elements[name]) && state.body.elements[name] >= 0 && state.body.elements[name] <= 3, '五行蕴养数据异常，请检查存档。');
  }
  if (state.version >= 6) {
    const c = state.station?.crisis;
    requireCondition(c === null || (c && typeof c === 'object' && !Array.isArray(c)
      && Array.isArray(c.choices) && c.choices.length <= CRISIS_STAGES.length
      && c.choices.every((record, i) => record && record.event === CRISIS_STAGES[i]
        && typeof record.choice === 'string' && Object.hasOwn(CRISIS_EVENTS[record.event].choices, record.choice))),
    '公共危机履历异常，请保留记录并检查。');
  }
  if (state.version >= 7) {
    const archive = state.anomalyArchive;
    requireCondition(Array.isArray(archive) && archive.length <= SIGNAL_ORDER.length
      && archive.every(record => record && SIGNAL_ORDER.includes(record.pattern)
        && Number.isSafeInteger(record.at) && record.at >= 0
        && Number.isSafeInteger(record.life) && record.life >= 1 && record.life - 1 <= state.deaths
        && ['手工', '科技'].includes(record.method))
      && new Set(archive.map(record => record.pattern)).size === archive.length,
    '异常档案记录异常，请保留存档并检查。');
  }
  if (state.action) {
    const a = state.action;
    requireCondition(['observe', 'escape', 'work', 'workBatch', 'study', 'cultivate', 'fog', 'explore', 'craft', 'element',
      'breakthrough', 'mortal', 'rescue', 'totem', 'talk', 'deduce', 'wait', 'seekFaith', 'preach', 'towerChoice', 'pathChoice', 'stationChoice', ...FIELD_KINDS].includes(a.kind)
      && Number.isSafeInteger(a.endAt) && a.endAt >= 0
      && [a.roll, a.rescueRoll].every(n => Number.isFinite(n) && n >= 0 && n < 1)
      && (a.rulesVersion === undefined || ([2, 3, 4, 5, 6, 7].includes(a.rulesVersion) && a.rulesVersion <= state.version))
      && (a.risk === undefined || (Number.isFinite(a.risk) && a.risk >= 0 && a.risk <= 1)), '待结算行动异常，请检查存档。');
    if (SIGNAL_KINDS.includes(a.kind)) requireCondition(a.rulesVersion >= 5, '信号行动版本异常，请检查存档。');
    if (['escape', 'fog', 'explore', 'breakthrough', 'rescue', ...FIELD_KINDS].includes(a.kind)) {
      requireCondition(Number.isFinite(a.risk), '危险行动缺少风险记录，请检查存档。');
    }
    if (['cultivate', 'fog', 'fieldCultivate'].includes(a.kind)) {
      requireCondition(Number.isSafeInteger(a.gain) && a.gain > 0, '修炼收益记录异常，请检查存档。');
    }
    if (['explore', 'journey'].includes(a.kind)) requireCondition(Object.hasOwn(REVIVAL_EXPEDITIONS, a.target), '探索目标记录异常，请检查存档。');
    if (a.kind === 'breakthrough') requireCondition(['minor', 'foundation', 'core', 'nascent', 'spirit'].includes(a.gate), '突破关卡记录异常，请检查存档。');
    if (a.rulesVersion >= 3) requireCondition([0.5, 0.6].includes(a.rescueChance)
      && Number.isSafeInteger(a.livingCost) && a.livingCost >= 0 && a.livingCost <= 5, '行动接应与生活费记录异常，请检查存档。');
    if (['work', 'workBatch'].includes(a.kind)) {
      requireCondition((a.target === undefined && a.kind === 'work') || (typeof a.target === 'string'
        && Object.hasOwn(JOBS, a.target)), '工作岗位记录异常，请检查存档。');
    }
    if (a.kind === 'workBatch') requireCondition(a.rulesVersion >= 5 && state.place === '空间站'
      && Number.isInteger(a.count) && a.count >= 2 && a.count <= MAX_WORK_BATCH
      && [2, 3, 4, 5].includes(a.unitLivingCost) && a.livingCost <= a.unitLivingCost
      && a.risk === undefined, '连续工作记录异常，请检查存档。');
    if (a.kind === 'towerChoice') requireCondition(a.rulesVersion >= 3
      && typeof a.event === 'string' && typeof a.choice === 'string' && Object.hasOwn(TOWER_EVENTS, a.event)
      && Object.hasOwn(TOWER_EVENTS[a.event].choices, a.choice) && state.tower?.event === a.event
      && (a.rulesVersion >= 7 || LEGACY_TOWER_EVENTS.includes(a.event)), '狱友抉择记录异常，请检查存档。');
    if (a.kind === 'escape' && a.rulesVersion >= 3) requireCondition(typeof a.escort === 'boolean', '越狱同行记录异常，请检查存档。');
    if (['mortal', 'preach'].includes(a.kind) && a.rulesVersion >= 4) {
      requireCondition(typeof a.event === 'string' && a.event === nextPathEvent(state.body)
        && state.body.path === (a.kind === 'mortal' ? '化凡' : '信仰')
        && state.body.realm === 4 && state.place === '空间站' && state.body.pathEvent === null
        && a.risk === undefined,
      '化神经历行动异常，请检查存档。');
    }
    if (a.kind === 'pathChoice') {
      requireCondition(a.rulesVersion >= 4 && typeof a.event === 'string' && Object.hasOwn(PATH_EVENTS, a.event)
        && a.event === state.body.pathEvent && typeof a.choice === 'string'
        && Object.hasOwn(PATH_EVENTS[a.event].choices, a.choice)
        && a.livingCost === 0 && a.risk === undefined, '化神抉择行动异常，请检查存档。');
    }
    if (a.kind === 'stationChoice') {
      const event = CRISIS_STAGES[state.station?.crisis?.choices?.length];
      requireCondition(a.rulesVersion >= 6 && state.status === 'active' && state.place === '空间站'
        && event && a.event === event && typeof a.choice === 'string'
        && Object.hasOwn(CRISIS_EVENTS[event].choices, a.choice) && a.risk === undefined
        && [2, 3, 4, 5].includes(a.livingCost)
        && a.cultivationCost === (CRISIS_EVENTS[event].choices[a.choice].power && state.body.realm < 5 ? 25 : 0),
      '公共危机行动与阶段不一致，请保留记录并检查。');
      if (CRISIS_EVENTS[event].choices[a.choice].power) requireCondition(state.body.realm >= 1
        && !(state.body.realm === 4 && state.body.path === '化凡'), '公共危机术法行动与本世修为不一致，请检查存档。');
    }
  }
  requireCondition(state.towerNotes <= 3, '塔规记录异常，请检查存档。');
  if (state.version === 1) return;
  const t = state.tower;
  requireCondition(t && Array.isArray(t.clues) && t.clues.length === state.towerNotes
    && new Set(t.clues).size === t.clues.length && t.clues.every(name => TOWER_CLUES.includes(name))
    && typeof t.ally === 'boolean' && typeof t.calibrated === 'boolean'
    && [0, 1, 2].includes(t.window)
    && (!t.window || (t.ally && t.calibrated && t.clues.length === 3)), '塔内协作记录异常，请检查存档。');
  requireCondition(state.station && ['contribution', 'completed'].every(key => Number.isSafeInteger(state.station[key]) && state.station[key] >= 0)
    && (state.station.contract === null || (typeof state.station.contract === 'string' && Object.hasOwn(CONTRACTS, state.station.contract))), '站务记录异常，请检查存档。');
  const x = state.expedition;
  requireCondition((state.place === '地表') === Boolean(x)
    && (x === null || (typeof x === 'object' && !Array.isArray(x))), '外勤位置与记录不一致，请检查存档。');
  if (x) {
    requireCondition(Object.hasOwn(REVIVAL_EXPEDITIONS, x.target)
      && Number.isInteger(x.depth) && x.depth >= 1 && x.depth <= 3
      && Number.isInteger(x.window) && x.window >= 0 && x.window <= 5
      && Number.isInteger(x.casts) && x.casts >= 0 && x.casts <= 2
      && Number.isInteger(x.loudCasts) && x.loudCasts >= 0 && x.loudCasts <= 2
      && Number.isFinite(x.risk) && x.risk >= 0.05 && x.risk <= 0.9
      && ['travel', 'encounter', 'choice', 'returning'].includes(x.stage)
      && x.cargo && typeof x.cargo === 'object' && !Array.isArray(x.cargo)
      && Object.entries(x.cargo).every(([name, amount]) => REVIVAL_ITEMS.includes(name) && Number.isSafeInteger(amount) && amount >= 0)
      && Array.isArray(x.discoveries) && x.discoveries.length <= 1
      && x.discoveries.every(name => name === REVIVAL_EXPEDITIONS[x.target].unlock), '地表探索记录异常，请检查存档。');
    if (state.version >= 5) {
      const s = x.signal;
      requireCondition(s === null || (s && typeof s === 'object' && !Array.isArray(s)
        && typeof s.pattern === 'string' && Object.hasOwn(SIGNAL_PATTERNS, s.pattern)
        && (state.version >= 7 || LEGACY_SIGNALS.includes(s.pattern))
        && typeof s.investigated === 'boolean' && typeof s.verified === 'boolean'
        && (!s.verified || s.investigated) && ['', ...SIGNAL_CHOICES].includes(s.choice)
        && (state.version >= 7 || !['遮断镜头', '锁定时钟'].includes(s.choice))
        && (!SIGNAL_HANDLES.includes(s.choice) || s.investigated)
        && (x.stage !== 'travel' || (!s.investigated && !s.verified && !s.choice))
        && (s.choice || (x.depth === 1 && ['travel', 'encounter', 'returning'].includes(x.stage)))),
      '接应信号记录异常，请检查存档。');
      if (SIGNAL_KINDS.includes(state.action?.kind)) {
        const a = state.action;
        requireCondition(s && !s.choice && a.risk === 0 && a.livingCost === 0
          && (a.kind === 'signalInvestigate' ? !s.investigated
            : a.kind === 'signalVerify' ? s.investigated && !s.verified && ['手工', '科技'].includes(a.method)
              : s.investigated && SIGNAL_HANDLES.includes(a.choice))
          && (a.rulesVersion >= 7 || (LEGACY_SIGNALS.includes(s.pattern)
            && (a.kind !== 'signalHandle' || ['切断广播', '关闭回传'].includes(a.choice)))),
        '信号调查或处置行动异常，请检查存档。');
      }
      requireCondition(!s || !state.action || state.action.rulesVersion >= 7 || LEGACY_SIGNALS.includes(s.pattern),
        '旧外勤行动与新信号类型不一致，请保留存档并检查。');
      requireCondition(state.action?.kind !== 'scavenge' || !s || s.choice, '请先决定如何对待可疑信号。');
    }
    const stages = { journey: 'travel', scavenge: 'encounter', fieldCultivate: 'choice', return: 'returning',
      signalInvestigate: 'encounter', signalVerify: 'encounter', signalHandle: 'encounter' };
    requireCondition(state.action
      ? [2, 3, 4, 5, 6, 7].includes(state.action.rulesVersion) && stages[state.action.kind] === x.stage
        && (state.action.kind !== 'journey' || state.action.target === x.target)
      : ['encounter', 'choice'].includes(x.stage), '外勤行动阶段异常，请检查存档。');
  } else {
    requireCondition(!FIELD_KINDS.includes(state.action?.kind), '外勤行动缺少旅程记录，请检查存档。');
  }
  if (state.version === 2) return;
  requireCondition((t.event === null || (typeof t.event === 'string' && Object.hasOwn(TOWER_EVENTS, t.event)))
    && (!t.event || state.version >= 7 || LEGACY_TOWER_EVENTS.includes(t.event))
    && typeof t.stale === 'boolean' && typeof t.escort === 'boolean'
    && (!t.event || (!t.ally && state.place === '塔监狱'))
    && ((!t.stale && !t.escort) || t.ally), '塔内人物事件记录异常，请检查存档。');
  const s = state.station;
  requireCondition(['resident', 'rationed', 'relay'].every(key => typeof s[key] === 'boolean')
    && Number.isSafeInteger(s.debt) && s.debt >= 0 && s.debt <= 132
    && Number.isInteger(s.grace) && s.grace >= 0 && s.grace <= 3
    && (s.debt > 0 || s.grace === 0), '站务资格或欠款记录异常，请检查存档。');
  const traceOk = trace => Array.isArray(trace) && trace.length <= 24 && trace.every(item =>
    Number.isSafeInteger(item.at) && item.at >= 0 && typeof item.command === 'string' && typeof item.message === 'string');
  const itemsOk = items => items && typeof items === 'object' && !Array.isArray(items)
    && Object.entries(items).every(([name, count]) => REVIVAL_ITEMS.includes(name) && Number.isSafeInteger(count) && count >= 0);
  requireCondition(traceOk(state.lifeTrace) && Array.isArray(state.deathRecords) && state.deathRecords.length <= 20
    && state.deathRecords.every((record, i, records) => Number.isSafeInteger(record.life) && record.life > 0 && record.life <= state.deaths
      && (!i || records[i - 1].life < record.life) && Number.isSafeInteger(record.at) && record.at >= 0
      && typeof record.reason === 'string' && typeof record.action === 'string'
      && Number.isInteger(record.body?.realm) && record.body.realm >= 0 && record.body.realm < REVIVAL_REALMS.length
      && Number.isInteger(record.body.phase) && record.body.phase >= 0 && record.body.phase < 4
      && Number.isSafeInteger(record.body.cultivation) && record.body.cultivation >= 0
      && itemsOk(record.bag) && itemsOk(record.cargo) && traceOk(record.decisions)
      && ['周期重塑', '越狱窗口', '确认清退', '积分接应'].includes(record.mode)
      && Array.isArray(record.discoveries) && record.discoveries.length <= 1
      && record.discoveries.every(name => ['佛道传承', '离界坐标'].includes(name))
      && Number.isSafeInteger(record.spent) && record.spent >= 0 && record.spent <= 300 && record.spent % 60 === 0
      && ['塔监狱', '空间站'].includes(record.place) && [0.5, 0.6].includes(record.rescueChance)
      && Number.isSafeInteger(record.debt) && record.debt >= 0 && record.debt <= 132
      && (record.risk === null || (Number.isFinite(record.risk) && record.risk >= 0 && record.risk <= 1))
      && typeof record.legacyRescue === 'boolean'), '本世履历或死亡记录异常，请检查存档。');
}

function addItems(inventory, items) {
  for (const [name, amount] of Object.entries(items)) {
    const next = (inventory[name] || 0) + amount;
    requireCondition(Number.isSafeInteger(next) && next >= 0, `物资 ${name} 数量超出范围。`);
    inventory[name] = next;
  }
}

function itemList(inventory) {
  return Object.entries(inventory).filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}×${count}`).join('、') || '空';
}

function spend(state, credits = 0, items = {}) {
  requireCondition(state.credits >= credits, `积分不足，需要${credits}，现有${state.credits}。可在空间站工作。`);
  for (const [name, count] of Object.entries(items)) {
    requireCondition((state.bag[name] || 0) >= count, `随身物资缺少${name}×${count}；仓库物资请先取出。`);
  }
  state.credits -= credits;
  for (const [name, count] of Object.entries(items)) state.bag[name] -= count;
}

function checkEntry(player) {
  requireCondition(!player.试炼宇宙, '试炼宇宙已有降临记录，请沿当前路线继续。');
  requireCondition(!player.复活地球, '已有复活地球记录，请查看状态。');
  requireCondition(Number(player.power_place) === 0, '请从凡间选择这条开局路线。');
  requireCondition(['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id'].every(key => Number(player[key] ?? 1) <= 1)
    && !Number(player.lunhui), '此入口用于凡人开局。已有修炼角色保留原路线；新角色可选择复活地球。');
}

export function getRevivalBreakthroughGate(state) {
  const b = state.body;
  if (b.realm === 0) return { ok: false, message: '先在空间站研读功法，再以灵植引灵入体。' };
  if (b.realm === 5) return { ok: false, message: '本版已到化神初期；后续合体、返虚不纳入此凡间篇。可筹备离界。' };
  if (b.cultivation < REVIVAL_STUDY_NEED[b.realm]) {
    return { ok: false, message: `修炼积累不足：${b.cultivation}/${REVIVAL_STUDY_NEED[b.realm]}。` };
  }
  if (b.phase < 3) return { ok: true, ...structuredClone(BREAKTHROUGHS.minor) };
  if (b.realm === 1) {
    return { ok: true, ...structuredClone(BREAKTHROUGHS.foundation) };
  }
  if (b.realm === 2) {
    const missing = ELEMENTS.filter(name => b.elements[name] < 3);
    if (missing.length) return { ok: false, message: `五行尚未齐备：${missing.map(name => `${name}${b.elements[name]}/3`).join('、')}。` };
    return { ok: true, ...structuredClone(BREAKTHROUGHS.core) };
  }
  if (b.realm === 3) {
    if (!state.knowledge.佛道传承) return { ok: false, message: '本版开放佛道污染结婴支线，请先调查塔底获得传承。常规结婴条件待原文补核。' };
    return { ok: true, ...structuredClone(BREAKTHROUGHS.nascent) };
  }
  if (b.pathEvent) return { ok: false, message: `尚有「${b.pathEvent}」待兑现，查看「事件」并完成抉择后再闭关。` };
  if (b.path === '化凡') {
    if (b.mortalSteps < 3 || !b.vow) return { ok: false, message: '化凡尚需三段凡人经历与立愿；过程中保持修为压制。' };
  } else if (b.path === '信仰') {
    if (!b.totem || b.faith < 100) return { ok: false, message: `尚需凝聚图腾与信仰积累：${b.faith}/100。` };
  } else {
    return { ok: false, message: '请先选择化凡或信仰路线；化神为魔的具体条件尚待原文补核。' };
  }
  return { ok: true, ...structuredClone(BREAKTHROUGHS.spirit) };
}

function elementItems(name, progress) {
  const source = { 木: '千年古木', 土: '五百年灵草', 水: '水灵之气', 火: '燃料' }[name];
  return source && (['水', '火'].includes(name) || progress === 0) ? { [source]: 1 } : {};
}

function livingCost(state) {
  return 5 - (state.station.resident ? 2 : 0) - (state.station.rationed ? 1 : 0);
}

function receiveIncome(state, amount) {
  const repayment = Math.min(amount, state.station.debt);
  state.station.debt -= repayment;
  state.credits += amount - repayment;
  if (!state.station.debt) state.station.grace = 0;
  return repayment ? `其中${repayment}积分归还欠款，剩余欠款${state.station.debt}。` : '';
}

// 首轮生活费已在开工时支付；后续逐轮重放原来的扣费→发薪→偿债顺序。
function workRewards(state, action) {
  const job = JOBS[action.target || '绿植维护'];
  const count = action.kind === 'workBatch' ? action.count : 1;
  const debt = state.station.debt;
  let upkeep = action.livingCost || 0;
  for (let i = 0; i < count; i++) {
    if (i) {
      const cost = Math.min(action.unitLivingCost, state.credits);
      spend(state, cost);
      upkeep += cost;
    }
    receiveIncome(state, job.credits);
  }
  const items = Object.fromEntries(Object.entries(job.items).map(([name, amount]) => [name, amount * count]));
  addItems(state.bag, items);
  if (action.rulesVersion >= 2) state.station.contribution += job.contribution * count;
  return { credits: job.credits * count, items, upkeep, repayment: debt - state.station.debt };
}

function towerRisk(state) {
  return ((state.tower.window === 2 ? 5 : 25)
    + (state.tower.stale ? 15 : 0) + (state.tower.escort ? 10 : 0)) / 100;
}

function beginAction(state, kind, title, minutes, options, now, random) {
  let upkeep = 0;
  if (STATION_ACTIONS.includes(kind)) {
    // 只在主动开工时收取；零余额工作仍然开放，不由生活费自动生成债务。
    const work = kind === 'work' || kind === 'workBatch';
    upkeep = work ? Math.min(livingCost(state), state.credits) : livingCost(state);
    requireCondition(state.credits >= upkeep, `还需生活费${upkeep}积分；本次所有预付均未落盘。可先工作补足余额。`);
    spend(state, upkeep);
    if (!work && state.station.debt) state.station.grace = Math.max(0, state.station.grace - 1);
  }
  const roll = random();
  const rescueRoll = random();
  requireCondition([roll, rescueRoll].every(n => Number.isFinite(n) && n >= 0 && n < 1), '随机源异常，行动尚未启动。');
  state.action = {
    kind, title, endAt: now + minutes * MINUTE, roll, rescueRoll, rulesVersion: 7,
    livingCost: upkeep, rescueChance: state.station.relay && !state.station.debt ? 0.6 : 0.5, ...options,
  };
  return `${title}已开始，${minutes}分钟后发送 #复活地球 结算。所需成本已记账（另计生活费${upkeep}）；重启后继续沿用本次记录。${state.station.debt ? `\n欠款${state.station.debt}，非工作站务缓冲剩余${state.station.grace}次；用尽后进入审查，工作和还款仍开放。` : ''}`;
}

function die(state, reason, rescueRoll, { place, legacyRescue = false, rescueChance = 0.5, now, action } = {}) {
  const before = realmName(state.body);
  const mode = !place ? '积分接应' : action?.kind === 'observe' ? '周期重塑'
    : action?.kind === 'escape' ? '越狱窗口' : '确认清退';
  const fieldLoss = state.expedition
    ? `外勤暂存损失：${itemList(state.expedition.cargo)}；未交回的调查发现一并失去。\n` : '';
  let spent = 0;
  if (!place) {
    const calls = Math.floor(Math.min(state.credits, state.rescueBudget) / 60);
    place = '塔监狱';
    // 同一个已保存的均匀样本决定首次成功轮次，结算时不重抽；旧行动固定50%。
    for (let attempt = 1; attempt <= calls; attempt++) {
      spent += 60;
      if (rescueRoll < 1 - (1 - rescueChance) ** attempt) {
        place = '空间站';
        break;
      }
    }
    if (legacyRescue) spent = calls * 60;
    state.credits -= spent;
  }
  state.deathRecords = [...state.deathRecords, {
    life: state.deaths + 1, at: now, reason, action: action?.title || '空间站清退审查',
    body: structuredClone(state.body), bag: { ...state.bag }, cargo: { ...state.expedition?.cargo },
    decisions: structuredClone(state.lifeTrace), spent, place, rescueChance, legacyRescue,
    debt: state.station.debt, risk: action?.risk ?? null, mode,
    discoveries: [...(state.expedition?.discoveries || [])],
  }].slice(-20);
  state.lifeTrace = [];
  if (state.place !== '塔监狱' || place !== '塔监狱') {
    Object.assign(state.tower, { ally: false, event: null, stale: false, escort: false });
  }
  state.tower.window = 0;
  state.tower.calibrated = false;
  state.body = newBody();
  state.bag = {};
  state.action = null;
  state.expedition = null;
  state.place = place;
  state.deaths++;
  return [
    `【死亡重塑】${reason}`,
    `${before} → 凡人；本世修为、五行、本命法器、图腾与随身物资归零。`,
    `${fieldLoss}接应支出：${spent}积分；复活地点：${place}。${legacyRescue ? '本次沿用旧行动全额预算计费。' : ''}`,
    `仓储、设施、记忆保留；黑雾成瘾仍为${state.addiction}。`,
    ...(state.anomalyArchive.length ? [`异常档案保留${state.anomalyArchive.length}类已核验记录；保留的是经验，不是修为或免死保障。`] : []),
    ...(state.station.crisis ? ['你签过的公议记录仍在站务档案里；回站后可查看「站务危机」。记录保留，不代表本世修为回来。'] : []),
    `欠款${state.station.debt}仍记在账户上。发送 #复活地球 复盘 ${state.deaths} 查看本世损失与关键选择。`,
    place === '塔监狱' ? '你又看见了那间囚室。此前的修炼没有随你回来。' : '你回到了空间站，但这一世的修炼要从头开始。',
  ].join('\n');
}

function settle(state, now) {
  const a = state.action;
  requireCondition(a, '当前没有待结算行动。');
  requireCondition(now >= a.endAt, `行动尚余${Math.ceil((a.endAt - now) / MINUTE)}分钟。`);
  state.action = null;
  if (a.kind === 'observe') {
    const clue = a.target || TOWER_CLUES.find(name => !state.tower.clues.includes(name)) || '读数';
    if (!state.tower.clues.includes(clue)) state.tower.clues.push(clue);
    state.towerNotes = state.tower.clues.length;
    const message = die(state, '这一轮记录结束，塔按周期执行了死亡与复活。', a.rescueRoll, { place: '塔监狱', now, action: a });
    state.tower.calibrated = true;
    if (clue === '读数') state.tower.stale = false;
    return `${message}\n记下${clue}，规章记录：${state.towerNotes}/3。本轮读数已校准；线索保留，越狱窗口另行推演。`;
  }
  if (a.kind === 'talk') {
    if (a.rulesVersion >= 3) {
      state.tower.event = a.rulesVersion >= 7 ? TOWER_EVENT_ORDER[Math.floor(a.roll * TOWER_EVENT_ORDER.length)]
        : a.roll < 0.5 ? '读数矛盾' : '轮换分离';
      return formatTowerEvent(state);
    }
    state.tower.ally = true;
    return '狱友答应交换复活时间与观测记录。你得到的是协作，不是额外一条命。线索齐备并校准后可「推演」。';
  }
  if (a.kind === 'towerChoice') {
    const choice = TOWER_EVENTS[a.event].choices[a.choice];
    Object.assign(state.tower, { ally: true, stale: choice.stale, escort: choice.escort, event: null });
    return `${TOWER_EVENTS[a.event].npc}与你完成「${a.choice}」。${choice.text}\n协作已取得，三类线索与校准齐备后可推演。`;
  }
  if (a.kind === 'deduce') {
    state.tower.window = 1;
    return `已推演出窗口，当前越狱失败率${Math.round(towerRisk(state) * 100)}%。候时降低基础风险；旧表误差与共用窗口的额外风险另计。窗口仅用一次。`;
  }
  if (a.kind === 'wait') {
    state.tower.window = 2;
    return `处理时段对齐，当前越狱失败率${Math.round(towerRisk(state) * 100)}%；发送 #复活地球 越狱 确认。`;
  }
  if (a.kind === 'escape') {
    const success = a.roll >= a.risk;
    let message = die(state, success ? '利用规章与周期争取到了外界复活窗口。' : '复活窗口未对齐，塔按处理规章收回了这次机会。', a.rescueRoll, { place: success ? '空间站' : '塔监狱', now, action: a });
    if (success && a.rulesVersion >= 3 && a.escort) {
      state.station.contribution += 3;
      message += a.rulesVersion >= 7
        ? '\n你带出的同伴名册也完成登记，一名囚徒得到接应。站务贡献+3；这不是修为补偿。'
        : '\n周苓交付的同伴名册也完成登记，一名囚徒得到接应。站务贡献+3；这不是修为补偿。';
    }
    if (success && !state.receivedWelcome) {
      state.receivedWelcome = true;
      state.credits += 120;
      message += '\n初次登记：分配工作与120积分安置额度（仅一次）。';
    }
    return message;
  }
  if (a.risk > 0 && a.roll < a.risk) {
    return die(state, `${a.title}失败，肉身死亡。`, a.rescueRoll, {
      legacyRescue: !a.rulesVersion, rescueChance: a.rescueChance ?? 0.5, now, action: a,
    });
  }
  if (a.kind === 'work' || a.kind === 'workBatch') {
    const reward = workRewards(state, a);
    const repayment = reward.repayment ? `其中${reward.repayment}积分归还欠款，剩余欠款${state.station.debt}。` : '';
    return `完成${a.target || '绿植维护'}${a.kind === 'workBatch' ? `×${a.count}轮` : ''}，报酬${reward.credits}积分；${repayment}物资：${itemList(reward.items)}。站务贡献${state.station.contribution}；${a.kind === 'workBatch'
      ? `整批生活费合计${reward.upkeep}积分（含开工已付${a.livingCost}），已逐轮结清，不自动续工。` : '生活消耗已在开工时支付。'}`;
  }
  if (a.kind === 'study') {
    state.knowledge.功法 = true;
    return '掌握了引灵入体与后续基础修炼知识。知识保留，已修成的力量仍随本世肉身结算。';
  }
  if (['cultivate', 'fog', 'fieldCultivate'].includes(a.kind)) {
    if (state.body.realm === 0) state.body.realm = 1;
    else state.body.cultivation = Math.min(REVIVAL_STUDY_NEED[state.body.realm], state.body.cultivation + a.gain);
    return `修炼结束：${realmName(state.body)}，积累${state.body.cultivation}/${REVIVAL_STUDY_NEED[state.body.realm]}。突破需另行满足关卡。`;
  }
  if (a.kind === 'journey') {
    state.expedition.stage = 'encounter';
    return `抵达${state.expedition.target}：${REVIVAL_EXPEDITIONS[state.expedition.target].threat}。\n尚未取得物资。${state.expedition.signal
      ? `\n${formatSignalEvent(state)}` : '发送「应对 隐蔽/法术/科技」查看代价，或「撤离」止损。'}`;
  }
  if (SIGNAL_KINDS.includes(a.kind)) {
    const signal = state.expedition.signal;
    if (a.kind === 'signalInvestigate') signal.investigated = true;
    else if (a.kind === 'signalVerify') {
      signal.verified = true;
      if (a.rulesVersion >= 7 && !state.anomalyArchive.some(record => record.pattern === signal.pattern)) {
        state.anomalyArchive.push({ pattern: signal.pattern, at: now, life: state.deaths + 1, method: a.method });
      }
    }
    else signal.choice = a.choice;
    return formatSignalEvent(state);
  }
  if (a.kind === 'scavenge') {
    const x = state.expedition;
    const task = REVIVAL_EXPEDITIONS[x.target];
    addItems(x.cargo, task.items);
    if (task.unlock && !x.discoveries.includes(task.unlock)) x.discoveries.push(task.unlock);
    x.stage = 'choice';
    return `完成第${x.depth}处搜索。暂存：${itemList(x.cargo)}；发现：${x.discoveries.join('、') || '无'}。\n剩余窗口${x.window}/5。选择「深入」「地表修炼」或「撤离」；未返站的收获仍可能全部失去。`;
  }
  if (a.kind === 'return') {
    const x = state.expedition;
    addItems(state.bag, x.cargo);
    for (const name of x.discoveries) state.knowledge[name] = true;
    const message = `撤离成功，已返空间站。交回：${itemList(x.cargo)}；调查记录：${x.discoveries.join('、') || '无'}。`;
    state.expedition = null;
    state.place = '空间站';
    return message;
  }
  if (a.kind === 'explore') {
    const task = REVIVAL_EXPEDITIONS[a.target];
    if (a.roll < a.risk + 0.12) {
      return `${a.target}途中警报升级：${task.threat}。你放弃采集提前返航，预付成本已经消耗，但肉身与修为保住了。`;
    }
    addItems(state.bag, task.items);
    if (task.unlock) state.knowledge[task.unlock] = true;
    return `完成${a.target}并返航。获得：${Object.entries(task.items).map(([name, count]) => `${name}×${count}`).join('、') || '调查记录'}${task.unlock ? `；解锁${task.unlock}` : ''}。`;
  }
  if (a.kind === 'craft') {
    const recipe = RECIPES[a.target];
    if (recipe.facility) state.facilities[recipe.facility] = true;
    else if (recipe.body) state.body[recipe.body] = true;
    else addItems(state.bag, { [a.target]: 1 });
    return `制作完成：${a.target}。${recipe.body ? '它属于本世肉身，死亡后重新蕴养。' : ''}`;
  }
  if (a.kind === 'element') {
    state.body.elements[a.target]++;
    return `${a.target}灵之气蕴养：${state.body.elements[a.target]}/3。五行分别准备，积分与修为没有替代作用。`;
  }
  if (a.kind === 'breakthrough') {
    if (a.gate === 'minor') state.body.phase++;
    else {
      state.body.realm++;
      state.body.phase = 0;
    }
    state.body.cultivation = 0;
    return `闭关完成，踏入${realmName(state.body)}。${a.gate === 'spirit' ? '神识已成；本凡间篇进入离界筹备阶段。' : ''}`;
  }
  if (['mortal', 'preach'].includes(a.kind) && a.rulesVersion >= 4) {
    state.body.pathEvent = a.event;
    return formatPathEvent(state);
  }
  if (a.kind === 'pathChoice') {
    const b = state.body;
    const choice = pathEventInfo(b, a.event).choices[a.choice];
    b.pathChoices.push({ event: a.event, choice: a.choice });
    b.pathEvent = null;
    if (b.path === '化凡') b.mortalSteps++;
    else b.faith = Math.min(100, b.faith + 25);
    return `【${b.path}抉择兑现·${a.event}】${a.choice}\n${choice.result}\n${b.path === '化凡'
      ? `化凡经历${b.mortalSteps}/3，修为仍压制。${b.mortalSteps === 3 ? '发送「立愿 愿文」。' : '下一段发送「化凡」。'}`
      : `信仰积累${b.faith}/100，站务贡献不变。${b.faith === 100 ? '可查看突破条件。' : '下一段发送「传道」。'}`}\n人物、遭遇与选择后果为插件改编。`;
  }
  if (a.kind === 'stationChoice') {
    const choice = crisisInfo(state).choices[a.choice];
    state.station.crisis.choices.push({ event: a.event, choice: a.choice });
    state.station.contribution += 2;
    return `【公议兑现·${a.event}】${a.choice}\n${choice.result}\n站务贡献+2，现为${state.station.contribution}；本世化凡经历与信仰进度保持原样。\n${crisisAftermath(state)}\n发送 #复活地球 站务危机 查看公议履历与后续代价。`;
  }
  if (a.kind === 'mortal') {
    state.body.mortalSteps++;
    return `旧版化凡经历兑现${state.body.mortalSteps}/3：${['以劳动换取食宿', '在凡人能力范围内守住承诺', '接受力有尽时并明确自身所求'][state.body.mortalSteps - 1]}。修为仍处于压制中，不追加本段事件。`;
  }
  if (a.kind === 'rescue') {
    if (!a.rulesVersion) {
      state.body.faith = Math.min(100, state.body.faith + 25);
      return `旧版救援行动结算：保留已承诺的信仰进度${state.body.faith}/100。后续救援只计站务贡献。`;
    }
    state.station.contribution += 5;
    return `完成空间站地表救援，站务贡献${state.station.contribution}。科技居民的感谢与认可不计作宗教信仰。`;
  }
  if (a.kind === 'seekFaith') {
    state.knowledge.信众群体 = true;
    return '通过传承支线接触到有信仰传统的凡间群体（插件压缩支线）。建立联系不等于获得信仰；凝聚图腾后以「传道」推进。';
  }
  if (a.kind === 'preach') {
    state.body.faith = Math.min(100, state.body.faith + 25);
    return `旧版传道与图腾供奉兑现，信仰积累${state.body.faith}/100，不追加本段事件。这是信众的供奉，不是空间站贡献兑换。`;
  }
  if (a.kind === 'totem') {
    state.body.totem = true;
    return '图腾载体已完成凝聚；寻访有信仰传统的群体并传道，再与图腾融合化出神识。';
  }
  throw new Error('行动类型异常，请保留记录并检查。');
}

function station(state) {
  requireCondition(state.place === '空间站', '此操作在空间站进行。塔内先争取越狱窗口，地表先完成撤离。');
}

function useCultivation(state) {
  requireCondition(state.body.realm !== 4 || state.body.path !== '化凡', '当前处于化凡过程。若要动用修为，请发送 #复活地球 动用修为 确认；悟道经历与愿文将重置。');
}

function riskPrompt(title, risk, command) {
  return `${title}：本次死亡风险${Number((risk * 100).toFixed(2))}%。死亡清空本世修炼与随身物资，复活落点由接应决定。发送 #复活地球 ${command} 确认 开始。`;
}

function fieldRisk(x, adjustment = 0) {
  return Math.min(0.9, Math.max(0.02, x.risk + (x.depth - 1) * 0.07 + x.loudCasts * 0.05 + signalAdjustment(x) + adjustment));
}

function returnRisk(x, discard = false) {
  return Math.min(0.9, Math.max(0.02,
    x.risk / 2 + (x.depth - 1) * 0.05 + x.loudCasts * 0.05 + signalAdjustment(x) + (x.window === 0 ? 0.25 : 0) - (discard ? 0.15 : 0)));
}

function signalAdjustment(x) {
  const s = x.signal;
  if (!s?.choice || s.choice === '绕开信号') return 0;
  return s.choice === SIGNAL_PATTERNS[s.pattern].answer ? -0.05 : 0.15;
}

function signalResult(x) {
  if (x.signal.choice === '绕开信号') return '已绕开假接应点，沿出发时保存的路线行动；不增加信号风险。';
  return signalAdjustment(x) < 0
    ? '处置匹配线索，诱导链已截断；本趟后续搜索、地表修炼和撤离风险减5个百分点，最低2%。这不是识破一切异常的能力。'
    : '你暴露给了假接应点；本趟后续搜索、地表修炼和撤离风险加15个百分点，最高90%。再次切换终端设置也抹不掉已泄露的位置。';
}

function formatSignalEvent(state) {
  const x = state.expedition;
  const s = x.signal;
  const pendingPath = state.body.pathEvent ? `另有「${state.body.pathEvent}」待兑现，先完成外勤撤离，再到站查看化神事件。` : '';
  if (x.stage === 'travel') return `尚在抵达途中，先结算；信号线索在抵达后呈现。\n${pendingPath}`.trim();
  if (!s) return `本趟没有可疑接应信号记录；按原外勤流程应对或撤离。\n${pendingPath}`.trim();
  return [
    '【外勤事件·可疑接应信号｜插件原创】',
    '接应频道叫出了你的登记编号，声称提前安排了飞船。它知道你是谁，却始终没给出可靠的船号。',
    s.investigated ? `调查线索：${SIGNAL_PATTERNS[s.pattern].clue}` : '尚未调查，身份未核实；响起的声音不等于真正接应。',
    s.verified ? `核验记录：${SIGNAL_PATTERNS[s.pattern].evidence}` : '',
    s.choice ? `已选择「${s.choice}」：${signalResult(x)}`
      : '调查 信号：5分钟、窗口1；核验 手工：调查后5分钟、窗口1；核验 科技：调查后2分钟、探测器1、不耗窗口。均需确认并结算，无直接死亡抽签。',
    s.choice ? '本趟线索与选择已固定，深入不刷新。继续应对或撤离；实际风险在相应动作确认前显示。'
      : '抉择 绕开信号：立即耗窗口1，不加风险；抉择 追随信号：不耗窗口，后续风险+15个百分点。',
    s.choice ? '' : `调查后可「抉择 ${SIGNAL_HANDLES.join('/')}」：2分钟、不耗窗口；匹配规则后续风险-5个百分点，误判+15个百分点。先核验可明确本次规则；每趟只处置一次。`,
    s.choice ? '' : '选择需加「确认」；搜索前先决定如何对待信号。也可直接撤离，无需材料或剩余窗口；未处理信号不额外增加撤离风险。',
    '风险变化只作用于本趟搜索、地表修炼和撤离，最终限于2%~90%；不改死亡清零与接应落点规则。离线不触发额外事故。',
    state.action ? `当前行动：${state.action.title}，请先结算。` : '',
    pendingPath,
  ].filter(Boolean).join('\n');
}

function formatAnomalyArchive(state) {
  return [
    '【异常档案｜插件原创规则遭遇】',
    `已核验${state.anomalyArchive.length}/${SIGNAL_ORDER.length}类；仅保留首次亲自核验的记录。`,
    ...state.anomalyArchive.map(record => [
      `【${record.pattern}】第${record.life}世·${record.method}核验`,
      `当时线索：${SIGNAL_PATTERNS[record.pattern].clue}`,
      `当时核验：${SIGNAL_PATTERNS[record.pattern].evidence}`,
    ].join('\n')),
    state.anomalyArchive.length ? '这些记录证明的是曾经遇到的规则，不证明眼前来人仍按同一规则行动。' : '尚无亲自兑现的核验记录。外勤中调查信号，再核验并结算，才收录对应线索。',
    '死亡保留认知，不保修为或随身物资；档案不自动处置当前信号、不减风险，不揭示未调查类型。旧经历不追补。',
    state.status === 'ascended' ? '你已离开这个凡间世界。档案封存，没有把被记住的人算作已经归来。' : '',
  ].filter(Boolean).join('\n');
}

function formatJourneyRisk(risk, travelRisk) {
  const x = { risk, depth: 1, window: 5, loudCasts: 0 };
  return [
    '【单点行程估算】抵达 → 搜索一处 → 立即携货撤离（无信号或选择绕开信号）：',
    ...Object.entries(FIELD_MODES).map(([mode, settings]) => {
      const search = fieldRisk(x, settings.adjustment);
      const returning = returnRisk({ ...x, window: 5 - settings.windows, loudCasts: mode === '法术' ? 1 : 0 });
      const death = 1 - (1 - travelRisk) * (1 - search) * (1 - returning);
      return `${mode}：全程死亡风险${(death * 100).toFixed(2)}%${mode === '科技' ? '（需随身探测器1）' : mode === '法术' ? '（返程已计施法暴露）' : ''}。`;
    }),
    '三段分别抽签，不是把风险相加，也不是只抽抵达一次。新版每趟独立25%遇可疑接应信号；调查核验后的处置、追随、耗尽窗口、深入、地表修炼或弃货另算。接应只改变复活落点，不抵消修为清零。',
  ].join('\n');
}

function performExpedition(state, args, now, random) {
  const [verb, target] = args;
  const confirmed = args.at(-1) === '确认';
  const x = state.expedition;
  if (['调查', '核验', '抉择'].includes(verb)) {
    const s = x.signal;
    requireCondition(x.stage === 'encounter' && s && !s.choice, '本趟没有待处理信号，或选择已固定。请查看「事件」，也可撤离。');
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：调查 信号 / 核验 手工或科技 / 抉择 选项 [确认]。');
    if (verb === '调查') {
      requireCondition(target === '信号' && !s.investigated, '调查 信号：每趟一次；已调查的线索可在「事件」重看。');
      requireCondition(x.window >= 1, '调查需要窗口1；窗口不足时仍可直接撤离。');
      requireCondition(confirmed, '调查只监听本地记录，5分钟、窗口1，不花积分或物资，没有直接死亡抽签。发送 #复活地球 调查 信号 确认。');
      x.window--;
      return beginAction(state, 'signalInvestigate', '调查可疑接应信号', 5, { risk: 0 }, now, random);
    }
    if (verb === '核验') {
      requireCondition(s.investigated && !s.verified, '先调查信号；已核验的结论保留在「事件」中，无需重复支付。');
      requireCondition(['手工', '科技'].includes(target), '核验方式：手工（5分钟、窗口1）或科技（2分钟、探测器1、不耗窗口）。');
      const tech = target === '科技';
      requireCondition(tech || x.window >= 1, '手工核验需要窗口1；也可用探测器核验、绕开信号或直接撤离。');
      requireCondition(confirmed, `离线比对已经取得的记录，不向假接应点发送姓名；${tech ? '2分钟、随身探测器1，不耗窗口' : '5分钟、窗口1，不耗物资'}，无直接死亡抽签。发送 #复活地球 核验 ${target} 确认。`);
      if (tech) spend(state, 0, { 探测器: 1 });
      else x.window--;
      return beginAction(state, 'signalVerify', `${target}核验接应信号`, tech ? 2 : 5, { risk: 0, method: target }, now, random);
    }
    requireCondition(SIGNAL_CHOICES.includes(target), formatSignalEvent(state));
    const handle = SIGNAL_HANDLES.includes(target);
    requireCondition(!handle || s.investigated, '先调查取得线索，再决定切断哪条链路；也可直接绕开、追随或撤离。');
    requireCondition(target !== '绕开信号' || x.window >= 1, '绕开信号需要窗口1；窗口不足时仍可直接撤离。');
    const cost = handle ? '2分钟，不耗窗口与材料；匹配规则后续风险-5个百分点，误判+15个百分点，无直接死亡抽签'
      : target === '绕开信号' ? '立即消耗窗口1，沿原导航前进，不增加信号风险'
        : '立即追随假接应点，不耗窗口；本趟后续风险+15个百分点';
    requireCondition(confirmed, `${cost}。仅能选择一次；实际死亡仍清本世修为。发送 #复活地球 抉择 ${target} 确认。`);
    if (handle) return beginAction(state, 'signalHandle', `处置信号·${target}`, 2, { risk: 0, choice: target }, now, random);
    if (target === '绕开信号') x.window--;
    s.choice = target;
    return formatSignalEvent(state);
  }
  if (verb === '应对') {
    requireCondition(x.stage === 'encounter', '此处已搜索完毕，请选择深入、地表修炼或撤离。');
    requireCondition(!x.signal || x.signal.choice, '可疑接应信号尚待决策：查看「事件」，调查核验后处置，或直接绕开、追随、撤离。');
    requireCondition(Object.hasOwn(FIELD_MODES, target), '应对方式：隐蔽（窗口2）、法术（窗口1与施法次数1）、科技（窗口1与探测器1）。');
    const { windows, adjustment } = FIELD_MODES[target];
    const risk = fieldRisk(x, adjustment);
    requireCondition(x.window >= windows, '撤离窗口不足，停止搜索后可撤离或弃货撤离。');
    if (target === '法术') {
      useCultivation(state);
      requireCondition(x.casts > 0, '本次携带的施法余量已耗尽；可用探测器、隐蔽或撤离。');
    }
    requireCondition(confirmed, `${riskPrompt(`第${x.depth}处·${target}搜索`, risk, `应对 ${target}`)}\n消耗窗口${windows}；${target === '法术' ? '消耗一次施法余量，后续暴露风险增加5个百分点。' : target === '科技' ? '消耗随身探测器×1；科技也有探测盲区。' : '规避正面接触，但会错过一部分接应时间。'}`);
    if (target === '科技') spend(state, 0, { 探测器: 1 });
    if (target === '法术') { x.casts--; x.loudCasts++; }
    x.window -= windows;
    return beginAction(state, 'scavenge', `${target}搜索${x.target}`, 5, { risk }, now, random);
  }
  if (verb === '深入') {
    requireCondition(x.stage === 'choice', '先处理当前危险点，再决定是否深入。');
    requireCondition(x.depth < 3, '本次携带的测绘资料只覆盖三处区域，请撤离。');
    requireCondition(x.window >= 2, '深入至少保留2格窗口：前进1格、下一处应对至少1格。建议撤离。');
    requireCondition(confirmed, `深入消耗窗口1，下一处搜索基础风险增加7个百分点；尚未交回的物资继续随身冒险。发送 #复活地球 深入 确认。`);
    x.depth++;
    x.window--;
    x.stage = 'encounter';
    return `进入第${x.depth}处区域，剩余窗口${x.window}/5。旧收获仍在暂存中；请选择应对方式，或撤离止损。`;
  }
  if (verb === '地表修炼') {
    useCultivation(state);
    requireCondition(x.stage === 'choice', '先处理当前危险点，再寻找地表修炼位置。');
    requireCondition(state.knowledge.功法 && state.body.realm > 0 && state.body.realm < 5, '地表修炼用于炼气至元婴的积累，不代替境界突破。');
    requireCondition(state.body.cultivation < REVIVAL_STUDY_NEED[state.body.realm], '当前积累已满，请先返站满足突破关卡。');
    requireCondition(x.window >= 2, '地表修炼需要2格撤离窗口，当前建议撤离。');
    const risk = fieldRisk(x, 0.1);
    requireCondition(confirmed, `${riskPrompt('地表就地引灵', risk, '地表修炼')}\n不消耗灵植，积累+75（受当前上限约束）；占用窗口2，未交回物资也在风险之内。`);
    x.window -= 2;
    return beginAction(state, 'fieldCultivate', '地表引灵修炼', 10, { risk, gain: 75 }, now, random);
  }
  if (verb === '撤离' || verb === '弃货撤离') {
    const discard = verb === '弃货撤离';
    const risk = returnRisk(x, discard);
    requireCondition(confirmed, `${riskPrompt(discard ? '弃货紧急撤离' : '携货撤离', risk, verb)}\n${x.window === 0 ? '窗口已耗尽，紧急接驳增加25个百分点风险。' : '仍有正常接驳窗口。'}${discard ? '确认时丢弃本次暂存物资与调查发现；原随身物资仍携带。' : '成功返站才交付物资与调查发现。'}`);
    if (discard) { x.cargo = {}; x.discoveries = []; }
    x.stage = 'returning';
    return beginAction(state, 'return', `${x.target}撤离`, 5, { risk }, now, random);
  }
  throw new Error('当前在地表外勤，站内仓储、工作、制作、突破等暂停。请查看「外勤」或「事件」，选择调查、核验、抉择、应对、深入、地表修炼或撤离。');
}

function perform(state, command, now, random) {
  const args = command.split(/\s+/);
  const [verb, target] = args;
  const confirmed = args.at(-1) === '确认';
  if (verb === '结算') return settle(state, now);
  requireCondition(!state.action, '已有行动在进行或待结算，请先发送 #复活地球 结算。');
  if (state.expedition) return performExpedition(state, args, now, random);
  if (verb === '抉择' && state.place === '塔监狱') {
    requireCondition(state.tower.event, '先在塔内交谈触发狱友事件；「事件」可重看当前选项。');
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：抉择 选项 [确认]。');
    const event = TOWER_EVENTS[state.tower.event];
    requireCondition(Object.hasOwn(event.choices, target), formatTowerEvent(state));
    const choice = event.choices[target];
    requireCondition(confirmed, `${event.npc}：${choice.text}\n需${choice.minutes}分钟；发送 #复活地球 抉择 ${target} 确认。`);
    return beginAction(state, 'towerChoice', `狱友抉择·${target}`, choice.minutes,
      { event: state.tower.event, choice: target }, now, random);
  }
  if (verb === '观察') {
    requireCondition(state.place === '塔监狱', '观察规章只在塔监狱进行。');
    const clue = target || TOWER_CLUES.find(name => !state.tower.clues.includes(name)) || '读数';
    requireCondition(TOWER_CLUES.includes(clue), '可观察规章、读数、名册；已掌握线索也可再次观察校准当次周期。');
    state.tower.window = 0;
    state.tower.calibrated = false;
    return beginAction(state, 'observe', `记录塔内${clue}与处理周期`, 5, { target: clue }, now, random);
  }
  if (['交谈', '推演', '候时'].includes(verb)) {
    requireCondition(state.place === '塔监狱', '塔内协作与窗口推演在囚室中进行。');
    const t = state.tower;
    if (verb === '交谈') {
      requireCondition(t.clues.includes('规章'), '先观察规章，辨认适合与狱友交换信息的时段。');
      requireCondition(!t.ally, '本轮已取得狱友协作，接下来补齐线索并推演。');
      requireCondition(!t.event, '狱友正在等待你的选择。请查看「事件」，再次交谈不会更换事件。');
      return beginAction(state, 'talk', '交换狱友观测记录', 5, {}, now, random);
    }
    if (verb === '推演') {
      requireCondition(t.clues.length === 3 && t.ally, '推演需要规章、读数、名册三类线索，以及「交谈」取得狱友协作。');
      requireCondition(t.calibrated, '本次处理周期尚未校准，请再观察一次读数。旧线索保留，但旧窗口已经失效。');
      requireCondition(!t.window, '窗口已经推演，可候时校准或确认越狱。');
      return beginAction(state, 'deduce', '推算复活窗口', 5, {}, now, random);
    }
    requireCondition(t.window === 1, '候时需要一个已推演且尚未精校的窗口。');
    return beginAction(state, 'wait', '等候处理读数对齐', 5, {}, now, random);
  }
  if (verb === '越狱') {
    requireCondition(state.place === '塔监狱', '你已离开塔监狱。');
    requireCondition(state.tower.window > 0, '先观察三类线索、交谈取得协作，再校准并推演当次窗口。');
    const risk = towerRisk(state);
    requireCondition(confirmed, `越狱必经死亡重塑；${Math.round((1 - risk) * 100)}%获空间站接应，失败回塔。${state.tower.stale ? '旧表误差额外增加15个百分点风险。' : ''}${state.tower.escort ? '共用窗口额外增加10个百分点风险。' : ''}窗口仅用一次。发送 #复活地球 越狱 确认。`);
    state.tower.window = 0;
    state.tower.calibrated = false;
    return beginAction(state, 'escape', '争取塔外复活窗口', 10, { risk, escort: state.tower.escort }, now, random);
  }
  station(state);
  if (state.station.debt && state.station.grace === 0) {
    requireCondition(REVIEW_ACTIONS.includes(verb),
      `【清退审查】欠款${state.station.debt}，缓冲已用尽。新闭关、制作和外勤暂缓；工作及委托收入优先还款，亦可主动还款。若选择接受清退，请先查看代价。离线不会执行清退。`);
  }
  if (verb === '参与危机') {
    requireCondition(args.length === (confirmed ? 2 : 1), '格式：参与危机 [确认]。');
    requireCondition(!state.station.crisis, '本记录已经参加公共危机，请查看「站务危机」；已开始或结案的事件不重复领取。');
    requireCondition(confirmed, '原创单人支线：失压警报 → 配给争议 → 名册回声。参与本身不收费；三段公议分别预览、确认并结算，每段另计站务生活费及欠款缓冲，兑现贡献+2。已兑现选择死亡后保留，事件不重开；普通修行仍可继续，没有离线倒计时或全服资源扣减。发送 #复活地球 参与危机 确认。');
    state.station.crisis = { choices: [] };
    return formatStationCrisis(state);
  }
  if (verb === '公议') {
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：公议 选项 [确认]。');
    requireCondition(state.station.crisis && state.station.crisis.choices.length < CRISIS_STAGES.length,
      '请先查看「站务危机」并参与；已结案的公议不再次发放贡献。');
    const event = crisisInfo(state);
    requireCondition(Object.hasOwn(event.choices, target), formatStationCrisis(state));
    const choice = event.choices[target];
    requireCondition(Number.isSafeInteger(state.station.contribution + 2), '站务贡献已超出结算范围，请保留记录并检查。');
    if (choice.power) {
      useCultivation(state);
      requireCondition(state.body.realm >= 1, '灵力稳压至少需要炼气；凡人可机械检修或轮班供氧。');
      requireCondition(state.body.cultivation >= choice.cultivationCost,
        `灵力稳压需本阶段积累${choice.cultivationCost}，当前${state.body.cultivation}；也可选择机械检修或轮班供氧。`);
    }
    requireCondition(confirmed, `${choice.text}\n实际代价：${choice.minutes}分钟、${choice.credits}积分、物资${itemList(choice.items)}、本阶段积累${choice.cultivationCost}；另计生活费${livingCost(state)}。有欠款时消耗一次非工作缓冲，已开行动仍可结算。此段无直接死亡抽签；贡献与后续影响在结算后兑现。发送 #复活地球 公议 ${target} 确认。`);
    spend(state, choice.credits, choice.items);
    state.body.cultivation -= choice.cultivationCost;
    return beginAction(state, 'stationChoice', `公共危机·${event.name}·${target}`, choice.minutes,
      { event: event.name, choice: target, cultivationCost: choice.cultivationCost }, now, random);
  }
  if (verb === '抉择') {
    requireCondition(state.body.pathEvent, '化凡或传道到期结算后触发经历事件；「事件」可查看进度与选项。');
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：抉择 选项 [确认]。');
    const event = pathEventInfo(state.body);
    requireCondition(Object.hasOwn(event.choices, target), formatPathEvent(state));
    const choice = event.choices[target];
    requireCondition(confirmed, `${choice.text}\n本次实际代价：${choice.minutes}分钟、${choice.credits}积分、物资${itemList(choice.items)}。本段生活费已付，不再扣缓冲；抉择结算后才增加进度。发送 #复活地球 抉择 ${target} 确认。`);
    spend(state, choice.credits, choice.items);
    return beginAction(state, 'pathChoice', `${state.body.path}抉择·${target}`, choice.minutes,
      { event: state.body.pathEvent, choice: target }, now, random);
  }
  if (verb === '申请') {
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：申请 配给/居住/接应 [确认]。');
    requireCondition(Object.hasOwn(STATION_PERMITS, target), '可申请配给、居住、接应；「站务」显示门槛。');
    const permit = STATION_PERMITS[target];
    requireCondition(!state.station[permit.field], '此资格已经登记。');
    requireCondition(!state.station.debt, '请先结清欠款，再办理新资格。');
    requireCondition(state.station.contribution >= permit.contribution, `申请${target}需要贡献${permit.contribution}，当前${state.station.contribution}；贡献只作门槛，不扣除。`);
    requireCondition(confirmed, `${permit.text}登记费${permit.cost}积分，资格随账户保留。此制度与数值为插件改编。发送 #复活地球 申请 ${target} 确认。`);
    spend(state, permit.cost);
    state.station[permit.field] = true;
    return `${target}资格已登记。${permit.text}`;
  }
  if (verb === '透支') {
    requireCondition(args.length === (confirmed ? 3 : 2), '格式：透支 数额 [确认]。');
    requireCondition(/^[1-9]\d*$/.test(target) && Number.isSafeInteger(Number(target)), '透支数额为10至120之间、10的倍数。');
    const amount = Number(target);
    requireCondition(amount <= 120 && amount % 10 === 0, '透支数额为10至120之间、10的倍数。');
    const fee = amount / 10;
    requireCondition(state.station.debt + amount + fee <= 132, '连同一次性服务费，账户欠款上限为132积分；先还款再申请额度。');
    requireCondition(confirmed, `到账${amount}，记欠款${amount + fee}（含一次性服务费${fee}）。缓冲为3次非工作站务行动，追加透支不重置缓冲；到期暂缓修炼和外勤，工作收入优先还款。接受清退会死亡清修为，债务保留。发送 #复活地球 透支 ${amount} 确认。`);
    if (!state.station.debt) state.station.grace = 3;
    state.station.debt += amount + fee;
    state.credits += amount;
    return `到账${amount}积分，账户欠款${state.station.debt}，缓冲剩余${state.station.grace}次。没有离线利息或后台清退。`;
  }
  if (verb === '还款') {
    requireCondition(args.length === 2 && /^[1-9]\d*$/.test(target) && Number.isSafeInteger(Number(target)), '格式：还款 正整数。');
    const amount = Number(target);
    requireCondition(amount <= state.station.debt, `当前欠款${state.station.debt}，还款数额请勿超出欠款。`);
    spend(state, amount);
    state.station.debt -= amount;
    if (!state.station.debt) state.station.grace = 0;
    return `已还${amount}，剩余欠款${state.station.debt}。${state.station.debt ? '部分还款不重置缓冲。' : '审查解除，正常站务恢复。'}`;
  }
  if (verb === '接受清退') {
    requireCondition(state.station.debt > 0 && state.station.grace === 0, '只有欠款到期、处于清退审查时才有此选项。');
    requireCondition(confirmed && args.length === 2, `接受清退会真正死亡，清空本世境界、修为与随身物资，直接回塔且本次不安排接应。欠款${state.station.debt}继续保留。工作还款仍开放。发送 #复活地球 接受清退 确认。`);
    return die(state, `主动接受欠款清退：尚欠${state.station.debt}积分，离开空间站生命维持环境。`, 0, { place: '塔监狱', now });
  }
  if (verb === '接应预算') {
    requireCondition(args.length === 2 && /^(0|[1-9]\d*)$/.test(target), '请输入0至300之间、60的倍数。');
    const amount = Number(target);
    requireCondition(amount <= 300 && amount % 60 === 0, '请输入0至300之间、60的倍数。');
    state.rescueBudget = amount;
    return `接应预算设为${amount}积分，按死亡时实际余额支付。此预算不保修为。`;
  }
  if (verb === '存入' || verb === '取出') {
    requireCondition(args.length === 3 && REVIVAL_ITEMS.includes(target) && /^[1-9]\d*$/.test(args[2]), '格式：存入/取出 物品 正整数。');
    const amount = Number(args[2]);
    requireCondition(Number.isSafeInteger(amount), '物资数量超出范围。');
    const [source, destination] = verb === '存入' ? [state.bag, state.storage] : [state.storage, state.bag];
    requireCondition((source[target] || 0) >= amount, '现有物资数量不足。');
    addItems(destination, { [target]: amount });
    source[target] -= amount;
    return `${target}×${amount}已${verb}。死亡仅清空随身物资，仓储独立保留。`;
  }
  if (verb === '工作') {
    const values = confirmed ? args.slice(0, -1) : args;
    requireCondition(values.length <= 3 && (!confirmed || values.length >= 2)
      && (values[2] === undefined || /^[1-9]\d*$/.test(values[2])),
    '格式：工作 [岗位] [次数1~10] [确认]；多轮须先确认。');
    const name = target || '绿植维护';
    requireCondition(Object.hasOwn(JOBS, name), `可选岗位：${Object.keys(JOBS).join('、')}。`);
    const count = Number(values[2] || 1);
    requireCondition(Number.isInteger(count) && count <= MAX_WORK_BATCH, `每批工作次数为1至${MAX_WORK_BATCH}。`);
    if (count === 1) return beginAction(state, 'work', `空间站${name}`, 5, { target: name }, now, random);
    const unitLivingCost = livingCost(state);
    const quote = structuredClone(state);
    const upfront = Math.min(unitLivingCost, quote.credits);
    spend(quote, upfront);
    const reward = workRewards(quote, { kind: 'workBatch', target: name, count, unitLivingCost, livingCost: upfront, rulesVersion: 7 });
    validateState(quote);
    const forecast = `${name}×${count}轮：${count * 5}分钟，毛报酬${reward.credits}积分、物资${itemList(reward.items)}、贡献${JOBS[name].contribution * count}；逐轮生活费共${reward.upkeep}，偿债${reward.repayment}，结算后余额${quote.credits}、欠款${quote.station.debt}。`;
    requireCondition(confirmed, `${forecast}\n本批到期一次结算，期间暂停其他动作；不提前发薪，不自动续工。发送 #复活地球 工作 ${name} ${count} 确认。`);
    return `${beginAction(state, 'workBatch', `空间站${name}×${count}轮`, count * 5,
      { target: name, count, unitLivingCost }, now, random)}\n${forecast}\n首轮生活费已付；其余各轮到期结算时按保存费率逐轮扣费、发薪还款，零余额减免逐轮计算。`;
  }
  if (verb === '委托') {
    requireCondition(Object.hasOwn(CONTRACTS, target), '请查看「站务」，选择医疗补给或设备修复委托。');
    requireCondition(!state.station.contract, `已有委托${state.station.contract}，请先交付或取消。`);
    state.station.contract = target;
    return `已领取${target}委托，需交付${itemList(CONTRACTS[target].items)}；物资仅在「交付委托」时扣除。死亡不销毁委托，随身货物仍会失去。`;
  }
  if (verb === '交付委托' || verb === '取消委托') {
    const name = state.station.contract;
    requireCondition(name, '当前没有已领取委托，请查看「站务」。');
    if (verb === '取消委托') {
      state.station.contract = null;
      return `已取消${name}，未扣物资，未发报酬。`;
    }
    const contract = CONTRACTS[name];
    spend(state, 0, contract.items);
    const repayment = receiveIncome(state, contract.credits);
    state.station.contribution += contract.contribution;
    state.station.completed++;
    state.station.contract = null;
    return `交付${name}，报酬${contract.credits}积分与站务贡献${contract.contribution}；${repayment}累计完成${state.station.completed}单。贡献不兑换修为或宗教信仰。`;
  }
  if (verb === '研读') {
    requireCondition(!target || target === '功法', '本版可研读基础功法，其他法门的适用条件仍待原文补核。');
    requireCondition(!state.knowledge.功法, '功法知识已经掌握。');
    spend(state, 20);
    return beginAction(state, 'study', '研读修行功法', 5, {}, now, random);
  }
  if (verb === '修炼' || verb === '吸收黑雾') {
    useCultivation(state);
    requireCondition(state.knowledge.功法, '请先研读功法。');
    requireCondition(state.body.realm < 5, '化神以后的修行另有规则，本版不以普通灵植继续填充化神修为。请筹备离界。');
    requireCondition(state.body.realm === 0 || state.body.cultivation < REVIVAL_STUDY_NEED[state.body.realm], '当前积累已满，请查看突破条件。');
    const fog = verb === '吸收黑雾';
    if (fog) {
      requireCondition(state.knowledge.佛道传承, '请先完成塔底调查，辨明污染风险。');
      requireCondition(confirmed, '黑雾可加速积累，每次成瘾+1，死亡风险随成瘾升高且重塑后保留。发送 #复活地球 吸收黑雾 确认。');
    }
    spend(state, 10, fog ? { 黑雾样本: 1 } : { 灵植: 1 });
    if (fog) state.addiction++;
    return beginAction(state, fog ? 'fog' : 'cultivate', fog ? '吸收黑雾' : '闭关修炼', 10, {
      gain: fog ? 75 : 25, risk: fog ? Math.min(0.9, 0.1 + state.addiction * 0.1) : 0,
    }, now, random);
  }
  if (verb === '探索') {
    useCultivation(state);
    const task = Object.hasOwn(REVIVAL_EXPEDITIONS, target) ? REVIVAL_EXPEDITIONS[target] : null;
    requireCondition(task, `可探索：${Object.keys(REVIVAL_EXPEDITIONS).join('、')}。`);
    requireCondition(state.body.realm >= task.realm, `此行至少需要${REVIVAL_REALMS[task.realm]}境界。`);
    requireCondition(!task.need || state.knowledge[task.need], `请先获得${task.need}。`);
    // 高境界能压制旧威胁，但环境与异常风险始终存在。
    const risk = Math.max(0.05, task.risk - (state.body.realm - task.realm) * 0.04 - (state.body.weapon ? 0.03 : 0));
    const travelRisk = Math.max(0.02, risk / 2);
    requireCondition(confirmed, `${riskPrompt(`${target}抵达阶段`, travelRisk, `探索 ${target}`)}\n危险征兆：${task.threat}。\n${formatJourneyRisk(risk, travelRisk)}\n预付${task.cost}积分，另计生活费${livingCost(state)}；携带5格撤离窗口，抵达后另选应对方式。搜索、深入和撤离各自展示风险，奖励返站才入账。`);
    spend(state, task.cost);
    state.place = '地表';
    state.expedition = {
      target, depth: 1, window: 5, casts: Math.min(2, state.body.realm), loudCasts: 0,
      risk, stage: 'travel', cargo: {}, discoveries: [], signal: null,
    };
    const message = beginAction(state, 'journey', `前往${target}`, task.minutes, { target, risk: travelRisk }, now, random);
    // 单独抽取并立即保存，和抵达死亡/接应抽签独立；到达、查询与重启不补抽。
    const signalRoll = random();
    requireCondition(Number.isFinite(signalRoll) && signalRoll >= 0 && signalRoll < 1, '随机源异常，外勤尚未启动。');
    if (signalRoll < 0.25) state.expedition.signal = {
      pattern: SIGNAL_ORDER[Math.floor(signalRoll * 16)], investigated: false, verified: false, choice: '',
    };
    return message;
  }
  if (verb === '制作') {
    useCultivation(state);
    const recipe = Object.hasOwn(RECIPES, target) ? RECIPES[target] : null;
    requireCondition(recipe, `可制作：${Object.keys(RECIPES).join('、')}。`);
    requireCondition(state.body.realm >= recipe.realm, `制作至少需要${REVIVAL_REALMS[recipe.realm]}境界。`);
    requireCondition(!recipe.need || state.facilities[recipe.need], `请先制作${recipe.need}。`);
    requireCondition(!recipe.knowledge || state.knowledge[recipe.knowledge], `请先完成${recipe.knowledge}。`);
    requireCondition(!(recipe.facility && state.facilities[recipe.facility]) && !(recipe.body && state.body[recipe.body]), '此设施或本命法器已经具备。');
    spend(state, recipe.credits, recipe.items);
    return beginAction(state, 'craft', `制作${target}`, 15, { target }, now, random);
  }
  if (verb === '蕴养') {
    useCultivation(state);
    requireCondition(state.body.realm === 2 && ELEMENTS.includes(target), '筑基期可分别蕴养金、木、水、火、土。');
    requireCondition(state.body.elements[target] < 3, '此灵气已完成本阶段蕴养。');
    requireCondition(target !== '金' || state.body.weapon, '金灵之气须通过本命法器蕴养。');
    requireCondition(target !== '火' || state.facilities.持续火种, '请先建立持续火种。');
    // 木、土基材只在首轮入炉；水与燃料按次投入。外部火种不与本世火灵混为一物。
    spend(state, 20, elementItems(target, state.body.elements[target]));
    return beginAction(state, 'element', `蕴养${target}灵之气`, 30, { target }, now, random);
  }
  if (verb === '突破') {
    const gate = getRevivalBreakthroughGate(state);
    requireCondition(gate.ok, gate.message);
    if (gate.risk) requireCondition(confirmed, riskPrompt('污染结婴（佛道支线）', gate.risk, '突破'));
    spend(state, gate.credits, gate.items);
    return beginAction(state, 'breakthrough', `突破·${gate.kind === 'nascent' ? '污染结婴' : realmName(state.body)}`, gate.minutes, {
      gate: gate.kind, risk: gate.risk,
    }, now, random);
  }
  if (verb === '化神') {
    requireCondition(state.body.realm === 4, '化神路线须在元婴期选择。');
    requireCondition(['化凡', '信仰', '化魔'].includes(target), '可选择化凡、信仰；化魔尚待原文补核。');
    requireCondition(target !== '化魔', '化神为魔的具体条件尚待原文补核；本版只登记名称，突破入口关闭，资源保持原样。');
    requireCondition(!state.body.path, `本世已选择${state.body.path}，两条路线各自推进。`);
    requireCondition(!state.body.chosenPath || state.body.chosenPath === target, `本世已走${state.body.chosenPath}，终止悟道也保留路线选择；重塑后的新一世可重新选择。`);
    requireCondition(state.body.phase === 3 && state.body.cultivation >= REVIVAL_STUDY_NEED[4], '先修至元婴大圆满并积累充足修为，再压制修为或准备图腾。');
    state.body.path = target;
    state.body.chosenPath = target;
    return `已选择${target}。${target === '化凡' ? '修为进入压制状态，请以凡人身份经历生活并立愿。' : '请准备图腾、寻访信众，再通过传道与供奉积累信仰。空间站贡献与信仰分开计算；寻访流程为插件压缩支线。'}`;
  }
  if (verb === '化凡') {
    requireCondition(state.body.realm === 4 && state.body.path === '化凡' && state.body.mortalSteps < 3, '请先选择化凡路线；三段经历完成后立愿。');
    requireCondition(!state.body.pathEvent, '当前经历尚待抉择，请查看「事件」；再次化凡不会更换事件。');
    spend(state, 15);
    return beginAction(state, 'mortal', '以凡人身份生活', 60, { event: nextPathEvent(state.body) }, now, random);
  }
  if (verb === '立愿') {
    requireCondition(state.body.path === '化凡' && state.body.mortalSteps === 3, '先完成三段化凡经历。');
    const vow = command.slice(2).trim();
    requireCondition(vow.length >= 8 && vow.length <= 80, '愿文请写8至80字，明确你愿意承担之事。');
    state.body.vow = vow;
    return '愿文已记录。游戏以经历与承诺记录表示悟道，不声称程序能判断真心。可开始化神闭关。';
  }
  if (verb === '动用修为') {
    requireCondition(state.body.realm === 4 && state.body.path === '化凡' && confirmed, '化凡中动用修为会重置悟道经历与愿文。发送 #复活地球 动用修为 确认。');
    state.body.mortalSteps = 0;
    state.body.vow = '';
    state.body.path = '';
    state.body.pathEvent = null;
    state.body.pathChoices = [];
    return '你解除了修为压制；本次化凡经历、待选事件、后续协助与愿文清零，已付成本不返还；同世路线仍锁定化凡。日后须重新开始。';
  }
  if (verb === '凝聚图腾') {
    requireCondition(state.body.path === '信仰' && !state.body.totem, '请先选择信仰路线；已有图腾时转向寻访信众与传道。');
    spend(state, 60, { 图腾载体: 1, 工程部件: 3 });
    return beginAction(state, 'totem', '凝聚信仰图腾', 30, {}, now, random);
  }
  if (verb === '救援') {
    useCultivation(state);
    requireCondition(state.body.realm >= 1, '地表救援至少需要炼气境界。');
    requireCondition(confirmed, `${riskPrompt('地表接应救援', 0.2, '救援')}\n预付30积分与燃料×1，成功获得站务贡献5，不增加宗教信仰。`);
    spend(state, 30, { 燃料: 1 });
    return beginAction(state, 'rescue', '地表接应救援', 30, { risk: 0.2 }, now, random);
  }
  if (verb === '寻访信众') {
    requireCondition(state.body.path === '信仰', '先在元婴大圆满选择信仰路线，再推进寻访支线。');
    requireCondition(!state.knowledge.信众群体, '已经建立信众联系，凝聚图腾后可传道。');
    spend(state, 30);
    return beginAction(state, 'seekFaith', '凡间传承支线·寻访信众', 30, {}, now, random);
  }
  if (verb === '传道') {
    requireCondition(state.body.realm === 4 && state.body.path === '信仰' && state.body.totem && state.knowledge.信众群体, '信仰传道需要元婴本世图腾，以及「寻访信众」建立的联系。');
    requireCondition(state.body.faith < 100, '图腾信仰积累已满，请检查突破条件。');
    requireCondition(!state.body.pathEvent, '信众正在等待回应，请查看「事件」并兑现抉择；再次传道不会更换诉求。');
    spend(state, 30, { 灵植: 1 });
    return beginAction(state, 'preach', '异域信众传道与图腾供奉', 30, { event: nextPathEvent(state.body) }, now, random);
  }
  if (verb === '离界') {
    requireCondition(state.body.realm === 5 && state.knowledge.离界坐标 && state.facilities.接引装置, '离界需化神、离界坐标与接引装置。这是插件仙界衔接条件，不是原著突破公式。');
    requireCondition(!state.station.debt, `离界前请结清空间站欠款${state.station.debt}积分；缓冲期不免除偿还义务。`);
    requireCondition(confirmed, '离界将结束此凡间篇，接入既有仙界地仙阶段；原著境界记录保留。发送 #复活地球 离界 确认。');
    state.status = 'ascended';
    state.place = '仙界';
    state.needsImmortalSync = true;
    return ['接引完成，离开复活地球，进入既有仙界。化神记录保留；仙界地仙入口是插件衔接，不表示两书境界天然等价。',
      crisisAftermath(state)].filter(Boolean).join('\n');
  }
  throw new Error('命令未识别，请发送 #复活地球 帮助。');
}

function formatTowerEvent(state) {
  const event = TOWER_EVENTS[state.tower.event];
  if (!event) return '当前没有待抉择的狱友事件。塔内观察规章后「交谈」可建立联系；已取得协作时继续校准与推演。';
  return [
    `【塔内事件·${state.tower.event}】${event.npc}`,
    event.text,
    ...Object.entries(event.choices).map(([name, choice]) => `抉择 ${name}：${choice.minutes}分钟。${choice.text}`),
    '以上人物与情节为插件改编。先查看选项，添加「确认」才开始；重启或重复交谈不会更换事件。',
  ].join('\n');
}

function formatPathEvent(state) {
  const b = state.body;
  if (!b.path) return '当前没有化神经历事件。元婴大圆满且积累齐备后选择「化神 化凡/信仰」；塔内事件请先交谈。';
  const progress = b.path === '化凡' ? `经历${b.mortalSteps}/3` : `信仰${b.faith}/100`;
  const records = b.pathChoices.map(record => `${record.event} → ${record.choice}`).join('；');
  const summary = `【${b.path}经历·插件改编】${progress}\n本世已兑现：${records || '暂无本版抉择记录'}。${!records && pathProgress(b) > 0 ? '旧版已取得进度照常保留，不补造选择或追加前段经历。' : ''}`;
  if (!b.pathEvent) {
    const next = nextPathEvent(b);
    return `${summary}\n${b.vow ? `愿文：${b.vow}\n` : ''}${state.action
      ? '先结算进行中的行动；本面板不提前发放经历。'
      : next ? `下一段「${next}」：发送「${b.path === '化凡' ? '化凡' : '传道'}」，到期结算后查看选项。`
        : b.realm >= 5 ? '化神已经完成，经历封存于本世记录。' : b.path === '化凡' && !b.vow ? '三段经历已完成，请立愿。' : '准备已齐，可查看突破条件。'}`;
  }
  const event = pathEventInfo(b);
  return [
    summary,
    `【待兑现·${b.pathEvent}】`,
    event.echo, event.text,
    ...Object.entries(event.choices).map(([name, choice]) =>
      `抉择 ${name}：实际需${choice.minutes}分钟、${choice.credits}积分、物资${itemList(choice.items)}。${choice.text}`),
    state.action ? `当前行动：${state.action.title}，请先结算，期间不切换选项。` : '',
    state.place === '地表' ? '先完成外勤撤离，再回站回应此事件。' : '',
    '添加「确认」才支付并行动，结算后才增加进度；沿用本段已付生活费，不再消耗缓冲，开始抉择仍受欠款审查约束。',
    '本段抉择没有暗骰死亡；等待与离线不追加损失。可先工作补齐资源；真正死亡会清除此世全部经历。',
    '人物、遭遇、数值与后续协助均为插件改编，不宣称来自原著正文。',
  ].filter(Boolean).join('\n');
}

function formatTower(state) {
  const t = state.tower;
  return [
    '【塔内规章与复活窗口】',
    `线索：${TOWER_CLUES.map(name => `${name}${t.clues.includes(name) ? '✓' : '未记'} `).join('')}`,
    `狱友协作：${t.ally ? '已取得' : '未取得'}｜当次校准：${t.calibrated ? '已完成' : '待观察'}｜窗口：${['未推演', '粗校（失败25%）', '精校（失败5%）'][t.window]}`,
    `旧表误差：${t.stale ? '待重查读数，风险+15个百分点' : '无'}｜共用窗口：${t.escort ? '是，风险+10个百分点' : '否'}`,
    t.window ? `本次实际越狱失败率：${Math.round(towerRisk(state) * 100)}%。` : '',
    t.event ? `待抉择：${t.event}，发送「事件」查看。` : '',
    '观察规章 → 交谈 → 抉择建立协作 → 观察读数/名册 → 推演 → 直接越狱或候时后越狱。',
    '观察会经历周期死亡；线索永久保留。每次越狱消耗窗口，失败后重校；再次从外界回塔也需重新取得协作。',
    '读数、轮数与失败率是插件数值；不按离线时长使窗口过期。',
  ].filter(Boolean).join('\n');
}

function formatStation(state) {
  return [
    '【空间站站务】',
    `账户：${state.credits}积分｜贡献：${state.station.contribution}｜已交委托：${state.station.completed}`,
    `居住：${state.station.resident ? '正式床位' : '临时胶囊'}｜配给：${state.station.rationed ? '定额登记' : '普通'}｜接应：${state.station.relay ? '备用资料已登记' : '普通'}`,
    `欠款：${state.station.debt}｜缓冲：${state.station.grace}次非工作站务行动｜${state.station.debt && !state.station.grace ? '清退审查中，工作还款仍开放' : '尚未进入审查'}`,
    ...Object.entries(JOBS).map(([name, job]) => `工作 ${name}：5分钟，${job.credits}积分，物资${itemList(job.items)}，贡献${job.contribution}。`),
    `工作 岗位 次数：1~${MAX_WORK_BATCH}轮；多轮加「确认」，整批到期一次结算，逐轮扣费及优先偿债。期间先结算再做其他动作，结束后不自动续工。`,
    `每次站内开工/闭关/制作/外勤出发另计生活费${livingCost(state)}积分；工作最多扣现有余额，零余额仍有岗位。离线不额外扣费。`,
    ...Object.entries(STATION_PERMITS).map(([name, permit]) => `申请 ${name}：贡献门槛${permit.contribution}、登记费${permit.cost}。${permit.text}`),
    ...Object.entries(CONTRACTS).map(([name, job]) => `委托 ${name}：交付${itemList(job.items)} → ${job.credits}积分、贡献${job.contribution}。`),
    `已领取：${state.station.contract || '无'}；「交付委托」从随身扣物资，「取消委托」不扣费。`,
    `公共危机：${state.station.crisis ? `已兑现${state.station.crisis.choices.length}/3段` : '尚未参加'}；「站务危机」查看原创支线与公议后果。`,
    `接应预算：${state.rescueBudget}；每轮60积分，当前新行动成功率${state.station.relay && !state.station.debt ? 60 : 50}%，首次成功即停扣。`,
    '透支10~120（10的倍数），含一次性10%服务费的欠款上限132；追加透支不重置缓冲。',
    '工作及委托收入优先还款；到期后暂停新修炼/外勤，可继续工作。接受清退须确认，死亡回塔且债务保留。',
    '贡献用于资格门槛，不扣除、不兑换修为或信仰。人物、登记门槛与按行动计费均属插件改编。',
  ].join('\n');
}

function formatStationCrisis(state) {
  const crisis = state.station.crisis;
  if (!crisis) return `【站务危机·插件原创】\n失压警报 → 配给争议 → 名册回声。\n${state.status === 'ascended'
    ? '本篇已结束，没有参加此支线的记录。' : '尚未参加；在空间站发送「参与危机」预览，再加「确认」登记。本支线每份记录仅一次，不是原著事件复刻或全服共享危机。'}`;
  const history = crisis.choices.map(record => `${record.event} → ${record.choice}`).join('；') || '暂无已兑现公议';
  if (crisis.choices.length === CRISIS_STAGES.length || state.status === 'ascended') {
    return `${crisisAftermath(state)}\n公议履历：${history}。`;
  }
  const event = crisisInfo(state);
  return [
    `【站务危机·${event.name}｜插件原创】已兑现${crisis.choices.length}/3段`,
    `公议履历：${history}。`, event.echo, event.text,
    ...Object.entries(event.choices).map(([name, choice]) =>
      `公议 ${name}：${choice.minutes}分钟、${choice.credits}积分、物资${itemList(choice.items)}、积累${choice.cultivationCost}，另计生活费${livingCost(state)}。${choice.text}`),
    state.action ? `当前行动「${state.action.title}」尚待结算，期间不切换公议或提前领取贡献。` : '',
    state.place !== '空间站' ? '当前不在空间站；先回站再公议。已兑现记录保留，地表暂存物资仍未交付。' : '',
    state.station.debt && !state.station.grace ? '清退审查中：先工作或还款清债，再继续公议；已开始的行动照常结算。' : '',
    '每段添加「确认」才扣费并开始，结算后贡献+2；有欠款时消耗一次非工作缓冲。缺少资源可先工作或取仓库物资。',
    '每段都有无需材料和额外积分的办法，站务生活费仍照常支付。没有隐藏死亡抽签；等待、查询和离线不追加损失，也不自动推进人物命运。',
    '这是一条个人站务记录，不更改其他玩家的配给。死亡清本世修为，已兑现社会后果保留；公议不替代化凡经历、宗教信仰或突破条件。',
  ].filter(Boolean).join('\n');
}

function formatPreparation(state) {
  const b = state.body;
  const heading = `【突破筹备·${realmName(b)}】`;
  if (state.status === 'ascended') return `${heading}\n本凡间篇已结束，记录封存；请在仙界继续修行。`;
  if (state.action) return `${heading}\n当前行动「${state.action.title}」尚待结算。先结算再汇总，避免重复计算已预付成本；未结算奖励不计入库存。本查询不提前兑现行动。`;
  const fee = livingCost(state);
  const needs = {};
  const produced = {};
  const steps = new Map();
  const notes = [];
  let credits = 0;
  let minutes = 0;
  const total = name => (state.bag[name] || 0) + (state.storage[name] || 0);
  const add = (command, cost, items, duration, count = 1) => {
    if (!count) return;
    steps.set(command, (steps.get(command) || 0) + count);
    credits += (cost + fee) * count;
    minutes += duration * count;
    for (const [name, amount] of Object.entries(items)) needs[name] = (needs[name] || 0) + amount * count;
  };
  const craft = name => {
    const recipe = RECIPES[name];
    if ((recipe.facility && state.facilities[recipe.facility])
      || (recipe.body && b[recipe.body])) return;
    if (recipe.need) craft(recipe.need);
    if (recipe.knowledge && !state.knowledge[recipe.knowledge]) notes.push(`制作${name}前须取得${recipe.knowledge}；先探索离界测绘并返站。`);
    add(`制作 ${name}`, recipe.credits, recipe.items, 15);
    if (!recipe.facility && !recipe.body) produced[name] = (produced[name] || 0) + 1;
  };
  if (b.realm < 5) {
    if (!state.knowledge.功法) add('研读', 20, {}, 5);
    const count = b.realm === 0 ? 1 : Math.max(0, Math.ceil((REVIVAL_STUDY_NEED[b.realm] - b.cultivation) / 25));
    add('修炼', 10, { 灵植: 1 }, 10, count);
  }
  if (b.realm > 0 && b.realm < 5) {
    const kind = b.phase < 3 ? 'minor' : ['', 'foundation', 'core', 'nascent', 'spirit'][b.realm];
    const gate = BREAKTHROUGHS[kind];
    if (kind === 'foundation' && total('筑基丹') < 1) craft('筑基丹');
    if (kind === 'core') {
      if (b.elements.金 < 3) craft('本命法器');
      if (b.elements.火 < 3) craft('持续火种');
      for (const name of ELEMENTS) {
        for (let progress = b.elements[name]; progress < 3; progress++) {
          add(`蕴养 ${name}`, 20, elementItems(name, progress), 30);
        }
      }
      notes.push('木、土仅未投入首轮时需要基材；水与火的剩余每轮各用一份材料。设施、本命法器和已完成蕴养均按现状扣除。');
    }
    if (kind === 'nascent') {
      if (!state.knowledge.佛道传承) notes.push('先探索塔底调查并成功返站，取得佛道传承；有传承后才开放道门试炼。');
      notes.push('本表只列佛道污染结婴支线；常规结婴条件仍待正文核实。');
    }
    if (kind === 'spirit') {
      if (!b.path) {
        notes.push(`修为齐备后先选择「化神 ${b.chosenPath || '化凡/信仰'}」；尚未选定的路线成本未计入，选路后重新查询。化魔条件仍待正文核实。`);
      } else if (b.path === '化凡') {
        add('化凡', 15, {}, 60, 3 - b.mortalSteps - Number(Boolean(b.pathEvent)));
        if (!b.vow) notes.push('三段化凡经历与抉择兑现后须「立愿 愿文」；压制修为期间仅筹备普通劳动与生活所需。');
      } else {
        if (!b.totem) add('凝聚图腾', 60, { 图腾载体: 1, 工程部件: 3 }, 30);
        if (!state.knowledge.信众群体) add('寻访信众', 30, {}, 30);
        add('传道', 30, { 灵植: 1 }, 30, 4 - pathProgress(b) - Number(Boolean(b.pathEvent)));
      }
      if (b.path) notes.push('下列只计剩余经历发起费；每段先结算、再抉择兑现。未选择的抉择成本与耗时另计，不自动决定人物选择。');
      if (b.pathEvent) {
        notes.push(`待兑现「${b.pathEvent}」的发起费已付，不重复计入；当前选项单列，未并入固定小计：`);
        for (const [name, choice] of Object.entries(pathEventInfo(b).choices)) {
          notes.push(`抉择 ${name}：${choice.credits}积分、${choice.minutes}分钟、物资${itemList(choice.items)}；本段不再收生活费。`);
        }
      }
    }
    add(gate.risk ? '突破 确认' : '突破', gate.credits, gate.items, gate.minutes);
    if (gate.risk) notes.push(`闭关本身死亡风险${gate.risk * 100}%，另有筹材外勤风险；清单齐备不等于存活保证。`);
  } else if (b.realm === 5) {
    if (!state.knowledge.离界坐标 && state.facilities.接引装置) notes.push('先探索离界测绘并成功返站，取得离界坐标。');
    craft('接引装置');
    steps.set('离界 确认', 1);
    notes.push('离界另需化神、离界坐标、接引装置与欠款清零；这只是插件仙界衔接，凡间上限保持化神初期。');
  }
  const materials = [];
  for (const [name, amount] of Object.entries(needs)) {
    const need = Math.max(0, amount - (produced[name] || 0));
    if (!need) continue;
    const bag = state.bag[name] || 0;
    const stored = state.storage[name] || 0;
    const take = Math.min(stored, Math.max(0, need - bag));
    const missing = Math.max(0, need - bag - stored);
    materials.push(`${name}：需${need}｜随身${bag}｜仓储${stored}｜待补${missing}`);
    if (take) materials.push(`  取仓提示：#复活地球 取出 ${name} ${take}（回站后执行，不自动取货）。`);
    if (missing) {
      for (const [job, reward] of Object.entries(JOBS)) {
        if (reward.items[name]) {
          const count = Math.min(MAX_WORK_BATCH, Math.ceil(missing / reward.items[name]));
          materials.push(`  岗位来源：#复活地球 工作 ${job} ${count}${count > 1 ? ' 确认' : ''}（每轮${reward.items[name]}，本批最多${MAX_WORK_BATCH}轮）。`);
        }
      }
      for (const [target, task] of Object.entries(REVIVAL_EXPEDITIONS)) {
        if (task.items[name]) materials.push(`  外勤来源：探索 ${target}（${REVIVAL_REALMS[task.realm]}起${task.need ? `，另需${task.need}` : ''}）；物资须成功返站才交付，先查看风险。`);
      }
    }
  }
  return [
    heading,
    state.place !== '空间站' ? `当前位置${state.place}：先回空间站再执行筹备；地表暂存、未交回发现均未计入。` : '',
    `账户${state.credits}积分｜欠款${state.station.debt}｜当前单次生活费${fee}。${state.station.debt ? '工作收入优先偿债；审查中先清债再开新修炼、制作和外勤。' : ''}`,
    '【当前阶段固定步骤】',
    [...steps].map(([command, count]) => `${command}×${count}`).join(' → '),
    `固定项目积分小计${credits}（已含逐次生活费），现有余额外尚缺${Math.max(0, credits - state.credits)}；欠款另列。固定计时${minutes}分钟。`,
    Object.keys(produced).length ? `计划制作产物：${itemList(produced)}；闭关所需由此补足，下方只统计其原料。` : '',
    '【材料缺口】', ...materials,
    materials.length ? '' : '固定项目没有额外材料缺口。',
    ...notes,
    '本表按当前已到账物资与资格估算：普通修炼按每次25积累，逐个小境界筹备；未计筹材工作、外勤及未选抉择费用，也不预支其奖励。',
    '仓储只参与缺口统计，实际消费仍从随身扣除。清单只读，不扣费、不迁移存档、不抽随机；材料齐备后仍须通过实际突破入口。',
  ].filter(Boolean).join('\n');
}

function formatChronicle(state, command) {
  if (command === '履历') {
    return `【第${state.deaths + 1}世·关键选择】\n${state.lifeTrace.map(item => `${item.at}｜${item.command}\n${item.message}`).join('\n') || '本版尚未记录到本世关键选择。'}\n最多保留本世24条关键选择；死亡时随复盘保存。`;
  }
  if (command === '死亡记录') {
    return `【死亡记录·最近20世】总死亡${state.deaths}次\n${state.deathRecords.map(item => `第${item.life}世｜${realmName(item.body)}｜${item.mode}·${item.action}｜接应扣${item.spent}｜回到${item.place}`).join('\n') || '没有本版死亡记录；旧版死亡次数保留，不推测补写经过。'}\n复盘 世次：查看损失和当时的选择。`;
  }
  const args = command.split(/\s+/);
  requireCondition(args.length <= 2 && (!args[1] || /^[1-9]\d*$/.test(args[1])), '格式：复盘 [世次正整数]。');
  const record = args[1] ? state.deathRecords.find(item => item.life === Number(args[1])) : state.deathRecords.at(-1);
  requireCondition(record, '没有该世的详细记录。可查看「死亡记录」；本版仅保存最近20次，不推测旧版经过。');
  const riskText = record.mode === '周期重塑' ? '塔内周期性死亡，未抽取存活机会'
    : record.mode === '确认清退' ? '已确认清退，直接死亡回塔'
      : `${record.mode === '越狱窗口' ? '外界复活窗口失败率' : '死亡风险'}${Math.round(record.risk * 100)}%`;
  return [
    `【第${record.life}世死亡复盘】${record.action}`,
    `原因：${record.reason}`,
    `失去境界：${realmName(record.body)}｜阶段积累：${record.body.cultivation}｜随身：${itemList(record.bag)}｜外勤暂存：${itemList(record.cargo)}`,
    `未交回发现：${record.discoveries.join('、') || '无'}。`,
    `化神过程损失：化凡${record.body.mortalSteps ?? 0}/3、信仰${record.body.faith ?? 0}/100；待兑现${record.body.pathEvent || '无'}；愿文${record.body.vow || '无'}。`,
    `已兑现经历：${record.body.pathChoices?.map(item => `${item.event} → ${item.choice}`).join('；') || '没有本版记录，不推测补写'}。`,
    `当时结算：${riskText}｜${record.mode === '积分接应' ? `积分接应单轮${record.rescueChance * 100}%` : '不使用积分接应抽签'}｜接应支出${record.spent}｜落点${record.place}`,
    `欠款${record.debt}保留。${record.legacyRescue ? '接应沿用旧版全额预算计费。' : ''}`,
    ...record.decisions.map(item => `选择：${item.command}\n${item.message}`),
    '记录只供复盘，不用于恢复修为或读档重抽；未列入损失的仓储、设施与知识按原规则保留。',
  ].join('\n');
}

export function formatRevivalStatus(state, now = Date.now()) {
  if (!state) return `${REVIVAL_HELP}\n新凡人角色发送 #复活地球 入界 阅读代价。`;
  validateState(state);
  state = migrateState(structuredClone(state));
  const b = state.body;
  const x = state.expedition;
  return [
    `【复活地球】${state.place}｜第${state.deaths + 1}世｜${realmName(b)}`,
    `修为：${b.cultivation}/${REVIVAL_STUDY_NEED[b.realm] || 0}｜死亡：${state.deaths}次｜黑雾成瘾：${state.addiction}`,
    `积分：${state.credits}｜接应预算：${state.rescueBudget}｜塔规记录：${state.towerNotes}/3｜站务贡献：${state.station.contribution}`,
    `欠款：${state.station.debt}｜缓冲：${state.station.grace}次｜生活费：${livingCost(state)}/次${state.station.debt && !state.station.grace ? '｜清退审查：先工作或还款' : ''}`,
    state.station.crisis ? `公共危机：已兑现${state.station.crisis.choices.length}/3段；「站务危机」查看履历与当前选择。` : '',
    state.place === '塔监狱' ? `塔内：协作${state.tower.ally ? '已成' : '未成'}｜${state.tower.calibrated ? '已校准' : '待校准'}｜${['无窗口', '粗校窗口', '精校窗口'][state.tower.window]}；「塔规」查看下一步。` : '',
    `五行：${ELEMENTS.map(name => `${name}${b.elements[name]}/3`).join(' ')}｜本命法器：${b.weapon ? '已成' : '未成'}`,
    `化神路线：${b.path || '未选'}｜化凡：${b.mortalSteps}/3｜图腾：${b.totem ? '已凝聚' : '未凝聚'}｜信仰：${b.faith}/100`,
    b.pathEvent ? `待兑现经历：${b.pathEvent}；「事件」查看代价和后续回响，抉择结算前不增加进度。`
      : b.path ? '「事件」查看本世抉择履历与下一段经历。' : '',
    `随身：${itemList(state.bag)}`,
    `仓储：${itemList(state.storage)}`,
    `设施：${Object.keys(state.facilities).filter(key => state.facilities[key]).join('、') || '无'}`,
    `知识：${Object.keys(state.knowledge).filter(key => state.knowledge[key]).join('、') || '无'}`,
    `异常档案：${state.anomalyArchive.length}/${SIGNAL_ORDER.length}类已核验；发送「异常档案」回看，记录本身不减风险。`,
    state.action ? `行动：${state.action.title}｜${now >= state.action.endAt ? '已到期，请结算' : `尚余${Math.ceil((state.action.endAt - now) / MINUTE)}分钟`}` : '行动：空闲',
    x ? `外勤：${x.target}第${x.depth}/3处｜${{ travel: '途中', encounter: '待应对', choice: '待选择', returning: '撤离中' }[x.stage]}｜窗口${x.window}/5｜施法余量${x.casts}｜暴露加成${x.loudCasts * 5}%\n地表暂存：${itemList(x.cargo)}；发现：${x.discoveries.join('、') || '无'}，返站才入账。\n${state.action ? '先结算当前行动。' : x.stage === 'encounter' ? '选择：应对 隐蔽/法术/科技，或撤离/弃货撤离；不加确认可先看风险。' : '选择：深入、地表修炼、撤离/弃货撤离；窗口不足时仍可紧急撤离。'}` : '',
    x?.signal && x.stage !== 'travel' ? `可疑接应信号：${x.signal.choice ? signalResult(x) : '待决策，搜索前先查看「事件」；调查、核验或直接绕开，也可撤离止损。'}` : '',
    state.status === 'ascended' ? '本篇已结束，境界记录封存。' : `下一关：${getRevivalBreakthroughGate(state).message || '满足积累后，突破入口会检查材料并启动闭关。'}`,
    '发送 #复活地球 筹备 查看本阶段材料与固定费用；#复活地球 帮助 查看命令；#复活地球 规则 查看清零边界。',
  ].filter(Boolean).join('\n');
}

export function runRevivalCommand(player, command = '状态', { now = Date.now(), random = Math.random, requestId = '' } = {}) {
  command = String(command).trim() || '状态';
  if (command === '帮助') return { ok: true, changed: false, message: REVIVAL_HELP };
  if (command === '规则') return { ok: true, changed: false, message: REVIVAL_RULES };
  // 小状态的写时复制：缺材料、输入错误、未确认与异常结算均不改变调用方快照。
  try {
    requireCondition(Number.isSafeInteger(now) && now >= 0, '时间参数异常。');
    if (command === '状态' || command === '外勤') return { ok: true, changed: false, message: formatRevivalStatus(player.复活地球, now) };
    const previous = player.复活地球;
    if (previous) validateState(previous);
    if (['塔规', '站务', '站务危机', '筹备', '事件', '异常档案', '履历', '死亡记录'].includes(command) || /^复盘(?:\s|$)/.test(command)) {
      requireCondition(previous, '先发送 #复活地球 入界 查看规则。');
      const view = migrateState(structuredClone(previous));
      const message = command === '塔规' ? formatTower(view) : command === '站务' ? formatStation(view)
        : command === '站务危机' ? formatStationCrisis(view)
        : command === '筹备' ? formatPreparation(view)
        : command === '异常档案' ? formatAnomalyArchive(view)
        : command === '事件' ? (view.expedition ? formatSignalEvent(view)
          : view.place === '塔监狱' ? formatTowerEvent(view) : formatPathEvent(view)) : formatChronicle(view, command);
      return { ok: true, changed: false, message };
    }
    const receipt = requestId && previous?.receipts.find(item => item.id === requestId);
    if (receipt) return { ok: true, changed: false, message: `【已结算消息】${receipt.message}` };
    let state;
    let message;
    if (command === '入界' || command === '入界 确认') {
      checkEntry(player);
      requireCondition(command === '入界 确认', '此路线从塔监狱凡人开始；死亡清空本世修为与随身物资，接应失败回塔。普通修炼与穿梭暂停，直至离界。现有角色数据保留；本入口仅接纳新凡人。发送 #复活地球 入界 确认。');
      state = createRevivalState(now);
      message = '你在塔监狱醒来。没有前世修为，也没有谢深专属神魂。先发送 #复活地球 塔规，再观察规章并与狱友交谈。';
    } else {
      requireCondition(previous, '先发送 #复活地球 入界 查看规则。');
      requireCondition(previous.status === 'active', '本篇已经结束，请在仙界继续修行。');
      requireCondition(Number(player.power_place) === REVIVAL_EARTH_LOCATION, '位面位置与本世记录不一致，请保留存档并检查。');
      state = migrateState(structuredClone(previous));
      message = perform(state, command, now, random);
    }
    state.revision++;
    state.history = [...state.history, { at: now, command, message }].slice(-8);
    const choiceResult = command === '结算' && (previous?.action?.kind === 'pathChoice'
      || (previous?.action?.kind === 'towerChoice' && previous.action.rulesVersion >= 7));
    const signalSettled = command === '结算' && SIGNAL_KINDS.includes(previous?.action?.kind);
    const publicChoice = command === '结算' && previous?.action?.kind === 'stationChoice';
    if ((LIFE_DECISION.test(command) || choiceResult || signalSettled || publicChoice) && state.deaths === (previous?.deaths ?? 0)) {
      state.lifeTrace = [...state.lifeTrace, {
        at: now, command: choiceResult ? `抉择兑现 ${previous.action.event}·${previous.action.choice}`
          : publicChoice ? `公议兑现 ${previous.action.event}·${previous.action.choice}`
          : signalSettled ? `线索兑现 ${previous.action.title}` : command, message,
      }].slice(-24);
    }
    if (requestId) state.receipts = [...state.receipts, { id: requestId, message }].slice(-64);
    validateState(state);
    player.复活地球 = state;
    player.power_place = state.status === 'active' ? REVIVAL_EARTH_LOCATION : 1;
    if (state.status === 'ascended') {
      player.level_id = 42;
      player.修为 = 0;
      player.power = 0;
    }
    return { ok: true, changed: true, message };
  } catch (error) {
    return { ok: false, changed: false, message: error.message };
  }
}
