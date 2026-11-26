'use strict';
// Shared exact rational arithmetic; UI conversion is only an output projection.
function steadyExactGcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;}
function steadyExactFraction(a,b=1n){
 a=BigInt(a);b=BigInt(b);if(!b)throw Error('zero denominator');
 if(b<0n){a=-a;b=-b;}const g=steadyExactGcd(a,b);
 return {n:a/g,d:b/g};
}
function steadyExactQ(value){
 if(value&&typeof value==='object'&&'n' in value&&'d' in value)return steadyExactFraction(value.n,value.d);
 if(typeof factoryParseRationalText==='function')return factoryParseRationalText(value);
 const s=String(value),match=s.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
 if(!match)throw Error('invalid physical coefficient: '+s);
 const decimals=(match[3]||'').length,exponent=Number(match[4]||0)-decimals;
 if(Math.abs(exponent)>50)throw Error('unsupported decimal exponent');
 let n=BigInt(match[2]+(match[3]||''));
 if(match[1])n=-n;
 return exponent>=0?steadyExactFraction(n*10n**BigInt(exponent)):steadyExactFraction(n,10n**BigInt(-exponent));
}
function steadyRegionQ(x){
 if(typeof x==='string'&&/^-?\d+\/\d+$/.test(x)){
  const [a,b]=x.split('/');return steadyExactFraction(BigInt(a),BigInt(b));
 }
 return steadyExactQ(x);
}
function steadyExactAdd(a,b){return steadyExactFraction(a.n*b.d+b.n*a.d,a.d*b.d);}
function steadyExactSub(a,b){return steadyExactFraction(a.n*b.d-b.n*a.d,a.d*b.d);}
function steadyExactMul(a,b){return steadyExactFraction(a.n*b.n,a.d*b.d);}
function steadyExactDiv(a,b){return steadyExactFraction(a.n*b.d,a.d*b.n);}
function steadyExactCmp(a,b){const diff=a.n*b.d-b.n*a.d;return diff<0n?-1:diff>0n?1:0;}
function steadyExactMin(a,b){return steadyExactCmp(a,b)<=0?a:b;}
function steadyExactText(a){const r=steadyExactFraction(a.n,a.d);return r.d===1n?String(r.n):String(r.n)+'/'+String(r.d);}
function steadyExactNumber(a){
 const n=Number(a.n),d=Number(a.d);
 if(Number.isFinite(n)&&Number.isFinite(d))return n/d;
 if(!a.n)return 0;
 const sign=a.n<0n?-1:1,ns=String(a.n<0n?-a.n:a.n),ds=String(a.d);
 const take=16,nn=Number(ns.slice(0,take)),dd=Number(ds.slice(0,take));
 return sign*(nn/dd)*10**(Math.max(0,ns.length-take)-Math.max(0,ds.length-take));
}
const STEADY_ZERO=steadyExactQ(0),STEADY_ONE=steadyExactQ(1);
function steadyExactSum(xs){return xs.reduce((s,x)=>steadyExactAdd(s,x),STEADY_ZERO);}
