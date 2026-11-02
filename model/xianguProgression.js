const amount=x=>Number.isFinite(Number(x))?Math.max(0,Math.trunc(Number(x))):0;
/** Pure guidance for the existing high-realm systems. No grant, resource
 * consumption, trial normalization or realm advancement happens here. */
export function formatXianguProgression(player){
 const level=amount(player?.xiangulevel_id),state=player?.己道推演||{};
 if(level<21)return '';
 if(level===21){
  const lines=['【准仙帝·己道成帝之路】','你已到达普通仙古冲关的终点。路尽级仙帝通过自身之道与己道推演晋升，#冲关 与 #冲关极境 均不直接完成这一跃迁。'];
  if(!player?.已创自身之道)lines.push('下一步：#创造自身之道，按提示完成创道。');
  else if(amount(player.自身之道阶段)<6||amount(player.修炼次数)<300)lines.push('下一步：#修炼自身之道，达到当前阶段上限后 #突破自身之道，逐步修至阶段六、累计三百次。');
  else if(!player?.自创修炼体系?.name)lines.push('下一步：#合道 体系名，完成本人修炼体系。');
  else if(state.recovery?.status==='recovering')lines.push('神胎终战后的真血正在重聚；用 #推演己道 查看原恢复状态。');
  else if(amount(state.attempts)>=5&&(state.realms?.length||0)!==6)lines.push('下一步：#设立体系境界 境界一/境界二/境界三/境界四/境界五/境界六，再继续 #推演己道。');
  else lines.push('下一步：#推演己道，按原资粮、六境、神胎与终战条件继续成帝。');
  lines.push('当前自身道：阶段'+amount(player?.自身之道阶段)+'/6｜修炼'+amount(player?.修炼次数)+'/300次；己道推演'+Math.min(20,amount(state.attempts))+'/20次。','原有低境极境与已付进度保留；此提示不扣费、不启动试炼。');
  return lines.join('\n');
 }
 if(level===22)return ['【路尽仙帝·祭道前路】','先将自身之道修至阶段七、累计四百次，再另行完成十次 #推演己道；道心圆满并完成十次厄土仙帝击杀后，用 #祭道 核对实际晋升条件。','当前祭道推演：'+Math.min(10,amount(state.sacrificeAttempts))+'/10次。','#冲关 与 #冲关极境 不替代祭道条件，本次未扣费。'].join('\n');
 if(level===23)return ['【祭道·超脱前路】','祭道之上须遭始祖彻底永祭，进入空间泡影，现实七百二十分钟届满后挣脱。','#空间泡影状态 查看本人原记录；#挣脱空间泡影 按原计时结算。','普通冲关与极境不代替此经历，本次未扣费。'].join('\n');
 if(level===24)return ['【祭道之上·唯一道前路】','持有本人已认主的大道至宝后，发送 #证道 核对原有资粮与状态条件，冲击唯一道之上。','普通冲关与极境不代替证道，本次未扣费。'].join('\n');
 return '【唯一道之上·已证顶境】\n仙古今世法已到达当前最高境界；原进度保留。\n#修仙状态 查看当前境界与自身状态。';
}
