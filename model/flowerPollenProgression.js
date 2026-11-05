/** Read-only routing of the established high-realm progression. This module
 * grants no qualification and never migrates a player's existing cultivation. */
const ROUTES=Object.freeze({
 21:Object.freeze({targetLevel:22,reason:'self-dao-required',title:'道祖绝巅·推演己道',command:'#推演己道',
  text:'路尽级仙帝通过己道推演晋升。先将自身之道修至阶段六、修炼三百次，再用 #推演己道 推进二十次推演；按提示设立六个体系境界，完成神胎与终战后证得路尽。'}),
 22:Object.freeze({targetLevel:23,reason:'sacrifice-dao-required',title:'路尽仙帝·祭道前路',command:'#祭道',
  text:'祭道通过专用祭道流程晋升。自身之道须达阶段七、修炼四百次，并在仙帝阶段另行完成十次 #推演己道；道心圆满、厄土仙帝击杀十次后，用 #祭道 核对全部门槛。'}),
 23:Object.freeze({targetLevel:24,reason:'sacrifice-bubble-required',title:'祭道绝巅·挣脱泡影',command:'#空间泡影状态',
  text:'祭道之上须遭始祖彻底永祭，进入没有任何概念的空间泡影。用 #空间泡影状态 查看记录，现实七百二十分钟届满后 #挣脱空间泡影；普通进化不代替这段经历。'}),
 24:Object.freeze({targetLevel:25,reason:'dao-beyond-required',title:'祭道之上·唯一证道',command:'#证道',
  text:'唯一道之上沿现有 #证道 流程晋升：先持有本人已认主的大道至宝本体（装备栏或纳戒均可），恢复真身与气血，结束当前劫罚并备齐本体系所需修为、血气；由 #证道 核验全部原条件与消耗。普通进化不替代证道。'}),
});
export const FLOWER_OPTIONAL_HIGH_CULTIVATION='当前花粉道则与专属渡劫属于额外修持，收益及既有记录保留，并非本境专用晋升的必需条件；请按真实晋升入口继续前路。';
export function getFlowerPollenProgression(playerOrLevel){
 const raw=typeof playerOrLevel==='object'?playerOrLevel?.huafenlevel_id:playerOrLevel,level=Number(raw);
 if(!Number.isFinite(level)||level<21)return null;
 const currentLevel=Math.trunc(level);
 if(currentLevel>=25)return {currentLevel,targetLevel:25,reason:'max',title:'唯一道之上·已证顶境',command:'#花粉路',maxed:true,optionalCultivation:false,text:'花粉路已达唯一道之上。原境界与修持记录保留，可用 #花粉路 查看当前状态，或 #花粉境界 查看本体系境界。'};
 return {...ROUTES[currentLevel],currentLevel,maxed:false,optionalCultivation:true};
}
export function formatFlowerPollenProgression(playerOrLevel,{optional=false}={}){
 const route=getFlowerPollenProgression(playerOrLevel);if(!route)return '';
 return [`【${route.title}】`,route.text,optional&&route.optionalCultivation?FLOWER_OPTIONAL_HIGH_CULTIVATION:'','花粉路祖种属于可选机缘，以上晋升无需持有祖种。'].filter(Boolean).join('\n');
}
