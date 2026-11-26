export const SOURCE_STONE_FORMS = [
  { name: '青皮石', appearance: '青褐石皮粗粝，纹路平缓', bias: -0.04, weight: 12 },
  { name: '鬼裂石', appearance: '裂痕宛如鬼口，似曾被人重新封合', bias: -0.08, weight: 10 },
  { name: '蜂巢石', appearance: '细孔密布，偶有微光在孔隙间游走', bias: 0.01, weight: 11 },
  { name: '黑玉石', appearance: '石皮乌黑温润，敲击声沉闷', bias: 0, weight: 11 },
  { name: '赤砂石', appearance: '表面赤砂簌簌脱落，内里坚如精铁', bias: -0.01, weight: 11 },
  { name: '龙纹石', appearance: '天然纹路盘旋如龙，却有数处断裂', bias: 0.02, weight: 10 },
  { name: '龙首石', appearance: '形似昂首古龙，眉心有一点白痕', bias: 0.03, weight: 5 },
  { name: '仙音石', appearance: '风过石窍，隐约传出清越道音', bias: 0.04, weight: 5 },
  { name: '烈阳石', appearance: '日光照射后温度渐升，赤霞一闪即逝', bias: 0.05, weight: 4 },
  { name: '月亮石', appearance: '石皮莹白，背光处浮现淡淡月华', bias: 0.04, weight: 4 },
  { name: '白玉龟', appearance: '形似伏卧白龟，背甲纹路浑然天成', bias: 0.02, weight: 6 },
  { name: '紫霞石', appearance: '紫色石皮间霞丝隐现，触之微有暖意', bias: 0.02, weight: 7 },
  { name: '星辰石', appearance: '深青石皮缀着银白斑点，宛若微缩星空', bias: 0.04, weight: 4 },
  { name: '寒髓石', appearance: '石皮凝霜不化，裂隙间寒气丝丝外溢', bias: 0, weight: 8 },
  { name: '火云石', appearance: '赤纹层叠如云，靠近时可闻细微爆鸣', bias: 0.01, weight: 8 },
  { name: '古井石', appearance: '中央天然凹陷如井，源气入内便杳无回声', bias: -0.03, weight: 9 },
  { name: '铜锈石', appearance: '青绿石衣斑驳，敲击时隐有金铁颤音', bias: -0.02, weight: 8 },
  { name: '雷击石', appearance: '焦黑石皮遍布银色支纹，偶有电芒跳动', bias: 0.015, weight: 6 },
  { name: '麒麟石', appearance: '石身伏卧如麒麟，鳞纹间似有瑞光流转', bias: 0.045, weight: 3 },
];

export function drawSourceStoneForms(count, random = Math.random) {
  const pool = SOURCE_STONE_FORMS.map(form => ({ ...form }));
  const selected = [];
  while (selected.length < count && pool.length) {
    const total = pool.reduce((sum, form) => sum + form.weight, 0);
    let roll = random() * total;
    let index = pool.length - 1;
    for (let current = 0; current < pool.length; current++) {
      roll -= pool[current].weight;
      if (roll < 0) {
        index = current;
        break;
      }
    }
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}
