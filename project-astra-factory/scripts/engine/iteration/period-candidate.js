'use strict';
// Research-only: a sufficient stock-screen for candidate translation periods.
// Assumes a repeated control key and a sufficient full-tick stock guard bound.
// The floating diagnostic supplies one-unit bounds; the exact kernel also accounts for frozen debits/reservations.
// This function does NOT establish that the key captures the exact transition.
function iterationCheckStockCandidate(previous,current,lastLow,items,{unlimited=false}={}){
 if(!Number.isSafeInteger(previous.tick)||!Number.isSafeInteger(current.tick)||current.tick<=previous.tick)
  return {accepted:false,reason:'invalid-period'};
 const drift={};
 for(const item of items){
  const a=previous.stock[item]??0,b=current.stock[item]??0;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(b-a))
   return {accepted:false,reason:'invalid-stock',item};
  const d=b-a;drift[item]=d;
  if(unlimited)continue;
  if(a<0||b<0||d<0)return {accepted:false,reason:'negative-stock-or-drift',item};
  if(d>0&&(lastLow[item]??0)>previous.tick)
   return {accepted:false,reason:'positive-drift-crosses-guard',item};
 }
 return {accepted:true,periodTicks:current.tick-previous.tick,drift};
}
// A finite number of additional copies of a measured control loop can be
// skipped only when every changing stock remained above its conservative
// full-tick demand threshold, even in the last skipped copy.
function iterationPlanStockJump(previous,current,minStock,gates,items){
 let copies=Infinity,hasNegative=false;
 for(const k of items){
  const a=previous.stock[k]??0,b=current.stock[k]??0,d=b-a,m=minStock[k];
  if(![a,b,d].every(Number.isSafeInteger)||a<0||b<0)return 0;
  if(!d)continue;
  if(!Number.isSafeInteger(m)||m<gates[k])return 0;
  if(d<0){hasNegative=true;copies=Math.min(copies,Math.floor((m-gates[k])/-d));}
 }
 return hasNegative&&Number.isSafeInteger(copies)&&copies>0?copies:0;
}
// Each executed unit debit w>0 gives a lower slack w-1;
// each rejected debit w<=0 gives an upper slack -w.
// Translation by j*d must stay within all such bounds.
function iterationTranslationBounds(a,b,bounds,items){
 let copies=Infinity,negative=false;
 for(const k of items){
  const x=a.stock[k]??0,y=b.stock[k]??0,d=y-x,g=bounds[k]||{};
  if(![x,y,d].every(Number.isSafeInteger)||x<0||y<0)return {infinite:false,copies:0};
  if(d<0){negative=true;copies=Math.min(copies,Math.floor(Math.min(g.lower??Infinity,y)/-d))}
  if(d>0&&g.upper!==undefined)copies=Math.min(copies,Math.floor(g.upper/d));
 }
 return {infinite:!negative&&copies===Infinity,copies:Number.isSafeInteger(copies)?Math.max(0,copies):0};
}
// Verification is separate from search history; a replay uses unoptimized
// one-tick transitions, not the event jump or sampled minima.
function iterationVerifyTranslation(a,b,replay,items,{unlimited,physical,gates}){
 if(unlimited)return true;
 return iterationTranslationBounds(a,b,replay.bounds,items).infinite;
}
if(typeof module!=='undefined')module.exports={iterationCheckStockCandidate,iterationPlanStockJump,iterationTranslationBounds,iterationVerifyTranslation};
