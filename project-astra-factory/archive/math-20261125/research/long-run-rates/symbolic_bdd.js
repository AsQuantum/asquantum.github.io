'use strict';
// Reduced ordered BDD. Interleaved current/next variables; functions are
// composed by substitution, not evaluated along an initial-state orbit.
function makeBDD({maxNodes=300000,ms=10000}={}){
 const end=performance.now()+ms,V=[Infinity,Infinity],L=[0,1],H=[0,1],unique=new Map(),memo=new Map(),nm=new Map([[0,1],[1,0]]);
 let calls=0;
 function check(){if(V.length>maxNodes||(++calls%2048===0&&performance.now()>end))throw Error('symbolic resource budget');}
 function node(v,l,h){if(l===h)return l;const k=v+','+l+','+h;let x=unique.get(k);if(x!==undefined)return x;check();x=V.length;V.push(v);L.push(l);H.push(h);unique.set(k,x);return x;}
 const variable=v=>node(v,0,1);
 function not(x){if(nm.has(x))return nm.get(x);const y=node(V[x],not(L[x]),not(H[x]));nm.set(x,y);nm.set(y,x);return y;}
 function ite(c,t,e){
  if(c===0||t===e)return e;if(c===1)return t;if(t===1&&e===0)return c;if(t===0&&e===1)return not(c);
  if(c===t)t=1;if(c===e)e=0;
  if(t===e)return t;
  const k=c+','+t+','+e;let r=memo.get(k);if(r!==undefined)return r;check();
  const v=Math.min(V[c],V[t],V[e]),a=x=>V[x]===v?L[x]:x,b=x=>V[x]===v?H[x]:x;
  r=node(v,ite(a(c),a(t),a(e)),ite(b(c),b(t),b(e)));memo.set(k,r);return r;
 }
 const and=(a,b)=>ite(a,b,0),or=(a,b)=>ite(a,1,b),xor=(a,b)=>ite(a,not(b),b),eq=(a,b)=>not(xor(a,b));
 function substitute(roots,mapping){const cache=new Map([[0,0],[1,1]]);function walk(x){if(cache.has(x))return cache.get(x);const v=V[x],a=walk(L[x]),b=walk(H[x]),y=ite(mapping[v]??variable(v),b,a);cache.set(x,y);return y;}return roots.map(walk);}
 function exists(root,vs){if(!vs.size)return root;const m=new Map([[0,0],[1,1]]);function f(x){if(m.has(x))return m.get(x);const a=f(L[x]),b=f(H[x]),r=vs.has(V[x])?or(a,b):node(V[x],a,b);m.set(x,r);return r;}return f(root);}
 function support(root){const s=new Set(),seen=new Set();function go(x){if(x<2||seen.has(x))return;seen.add(x);s.add(V[x]);go(L[x]);go(H[x]);}go(root);return s;}
 function count(root,n){const m=new Map();function f(x,j){if(x===0)return 0n;if(x===1)return 1n<<BigInt(n-j);const v=V[x];if(v%2||v/2<j||v/2>=n)throw Error('invalid current support');const k=x+','+j;if(m.has(k))return m.get(k);const i=v/2,r=(1n<<BigInt(i-j))*(f(L[x],i+1)+f(H[x],i+1));m.set(k,r);return r;}return f(root,0);}
 return {variable,not,ite,and,or,xor,eq,substitute,exists,support,count,size:()=>V.length,check};
}
function makeWords(b){
 const {and,or,xor,not,ite}=b,bit=(x,i)=>x[i]||0;
 function trim(x){while(x.length>1&&x.at(-1)===0)x.pop();return x.length?x:[0];}
 const c=n=>{n=BigInt(n);if(n<0n)throw Error('negative word');const w=[];do{w.push(Number(n&1n));n>>=1n;}while(n);return w;};
 const pick=(cond,a,d)=>trim(Array.from({length:Math.max(a.length,d.length)},(_,i)=>ite(cond,bit(a,i),bit(d,i))));
 function add(a,d){const out=[];let carry=0;for(let i=0;i<Math.max(a.length,d.length);i++){const x=bit(a,i),y=bit(d,i),z=xor(x,y);out.push(xor(z,carry));carry=or(and(x,y),and(z,carry));}out.push(carry);return trim(out);}
 function sub(a,d){const out=[];let borrow=0;for(let i=0;i<Math.max(a.length,d.length);i++){const x=bit(a,i),y=bit(d,i);out.push(xor(xor(x,y),borrow));borrow=or(and(not(x),y),and(not(xor(x,y)),borrow));}return trim(out);}
 function lt(a,d){let r=0;for(let i=0;i<Math.max(a.length,d.length);i++){const x=bit(a,i),y=bit(d,i);r=ite(xor(x,y),and(not(x),y),r);}return r;}
 const eq=(a,d)=>not(or(lt(a,d),lt(d,a))),le=(a,d)=>not(lt(d,a)),nonzero=a=>a.reduce(or,0);
 const min=(a,d)=>pick(lt(a,d),a,d),max=(a,d)=>pick(lt(a,d),d,a),satSub=(a,d)=>pick(lt(a,d),c(0),sub(a,d));
 function mul(a,k){k=BigInt(k);if(k<0n)throw Error('negative multiplier');let r=c(0),i=0;while(k){if(k&1n)r=add(r,[...Array(i).fill(0),...a]);k>>=1n;i++;}return r;}
 function divmod(a,k){k=BigInt(k);if(k<=0n)throw Error('division');if(k===1n)return [a,c(0)];const d=c(k),out=Array(a.length),w=d.length+1;let r=c(0);for(let i=a.length-1;i>=0;i--){r=trim([a[i],...r]);const ge=not(lt(r,d));out[i]=ge;r=pick(ge,sub(r,d),r).slice(0,w);}return [trim(out),trim(r)];}
 return {c,pick,add,sub,lt,le,eq,nonzero,min,max,satSub,mul,divmod,bit};
}
// Repeated squaring of an entire deterministic function and symbolic images
// of sets. A singleton reset is not stepped through the time orbit.
function solveSymbolicFunction(b,next,initial,rewards,clips=[],{maxDoublings=24}={}){
 const n=next.length,cur=Array.from({length:n},(_,i)=>b.variable(2*i)),nxt=Array.from({length:n},(_,i)=>b.variable(2*i+1));
 const init=initial.reduce((s,v,i)=>b.and(s,v?cur[i]:b.not(cur[i])),1);
 const map=fn=>Object.fromEntries(fn.map((v,i)=>[2*i,v]));
 const pre=(set,fn)=>b.substitute([set],map(fn))[0];
 function image(set,fn){
  const fs=fn.map((x,i)=>b.eq(nxt[i],x)),last=new Map();
  fs.forEach((f,i)=>{for(const v of b.support(f))if(v%2===0)last.set(v,i);});
  const done=Array.from({length:n},()=>new Set()),early=new Set();
  for(let i=0;i<n;i++){const j=last.get(2*i);(j===undefined?early:done[j]).add(2*i);}
  let r=b.exists(set,early);
  for(let i=0;i<n;i++){r=b.exists(b.and(r,fs[i]),done[i]);}
  return b.substitute([r],Object.fromEntries(cur.map((x,i)=>[2*i+1,x])))[0];
 }
 let reached=init,power=next,powers=[],cycle=null;
 for(let i=0;i<maxDoublings;i++){
  powers.push(power);const moved=image(reached,power),extended=b.or(reached,moved);
  if(extended===reached){cycle=moved;break;}
  reached=extended;power=b.substitute(power,map(power));
 }
 if(cycle===null)return {status:'unknown',reason:'symbolic doubling limit',bits:n,nodes:b.size()};
 // Exact lifting: every reachable clipping event must have no subsequent
 // reachable below-threshold state for that resource.
 for(const cl of clips){
  if(b.and(reached,cl.event)===0)continue;
  let future=cl.low;
  for(const p of powers)future=b.or(future,pre(future,p));
  if(b.and(reached,b.and(cl.event,pre(future,next)))!==0)return {status:'not-proved',reason:'unsafe clipping '+cl.item,bits:n,nodes:b.size()};
 }
 const count=b.count(cycle,n),sums={};
 if(count===0n)throw Error('empty recurrent set');
 for(const [k,w] of Object.entries(rewards)){let sum=0n;for(let j=0;j<w.length;j++)sum+=(1n<<BigInt(j))*b.count(b.and(cycle,w[j]),n);sums[k]=sum.toString();}
 return {status:'proved',count:count.toString(),sums,bits:n,nodes:b.size(),doublings:powers.length,reachable:b.count(reached,n).toString()};
}
module.exports={makeBDD,makeWords,solveSymbolicFunction};
