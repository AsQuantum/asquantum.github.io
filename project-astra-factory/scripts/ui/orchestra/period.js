'use strict';
// Read-only projection of witnessed theoretical logistics cycles onto score
// cursors. Never infer a time period from an average rate alone.
const orchestraPeriod=(()=>{
 const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a};
 const lcm=(a,b)=>a/gcd(a,b)*b;
 function fraction(s){
  if(typeof s!=='string'||!/^\d+(?:\/\d+)?$/.test(s))return null;
  const [n,d='1']=s.split('/').map(String),a=BigInt(n),b=BigInt(d);
  return b>0n?[a,b]:null;
 }
 function estimate(layout,budget,lengthFor,modulationTicks=1){
  if(!budget||budget.calculating)return {status:'waiting'};
  const components=budget.diagnostics?.components,rates=budget.fractions?.machineTotals;
  if(!Array.isArray(components)||!rates)return {status:'unknown'};
  const machines=new Map(layout.machines.map(m=>[m.id,m])),seen=new Set();
  let total=BigInt(modulationTicks),prefix=0,voices=0,unproven=0,analytic=0,unresolved=0;
  if(total<1n)return {status:'unknown'};
  for(const c of components){
   let turns=1n,active=false,missing=false;
   const witnessed=c.actualStatus==='exact-model-period'&&Number.isSafeInteger(c.periodTicks)&&c.periodTicks>0&&Number.isSafeInteger(c.prefixTicks)&&c.prefixTicks>=0;
   const period=witnessed?BigInt(c.periodTicks):0n;
   for(const id of c.machines||[]){
    const m=machines.get(id);if(!m||seen.has(id)){missing=true;continue}seen.add(id);
    for(const dir of ['in','out']){
     const L=lengthFor(m.type,dir,m);if(!Number.isSafeInteger(L)||L<1)continue;
     const f=fraction(rates[id]?.[dir]);if(!f){missing=true;continue}
     const [a,b]=f;if(!a)continue;
     active=true;voices++;
     if(!witnessed)continue;
     const numerator=a*period,denominator=b*20n;
     if(numerator%denominator){missing=true;continue}
     const n=numerator/denominator,len=BigInt(L);
     turns=lcm(turns,len/gcd(len,n));
    }
   }
   if(missing||active&&!witnessed){unproven++;if(!missing&&c.actualStatus==='exact-model-analytic')analytic++;else unresolved++;continue}
   if(active){total=lcm(total,period*turns);prefix=Math.max(prefix,c.prefixTicks)}
  }
  for(const [id,m] of machines)if(!seen.has(id)&&['in','out'].some(dir=>lengthFor(m.type,dir,m)>0)){unproven++;unresolved++}
  if(unproven)return {status:'unknown',unproven,analytic,unresolved,voices};
  return voices?{status:'period',ticks:total,prefix,voices}:{status:'silent'};
 }
 function duration(ticks,bpm){
  // 20 game ticks/s, simulation speed = BPM/60. Round to whole real seconds.
  const b=BigInt(Math.max(1,Math.round(bpm))),s=(ticks*3n+b/2n)/b;
  if(s>=3600n)return (s/3600n)+'小时'+(s%3600n/60n)+'分'+(s%60n)+'秒';
  if(s>=60n)return (s/60n)+'分'+(s%60n)+'秒';
  return s===0n?'不足1秒':s+'秒';
 }
 return {estimate,duration};
})();
