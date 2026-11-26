"""Offline exact rational disjunctive-linear reference solver.
No production edits. No numerical fixed point iteration, no floating arithmetic.
This checks uniqueness of actual material flows, not uniqueness of offers/demands.
"""
import json, sys, time
from fractions import Fraction as Q
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'vendor'))
import z3
from itertools import combinations

def solve(g,timeout=30000,recipe_priority=False):
    if g.get('status','compiled')!='compiled': return {'status':'unsupported','issues':g.get('issues')}
    lines=g['lines']; nodes={n['id']:n for n in g['nodes']}
    I={m:[] for m in nodes}; O={m:[] for m in nodes}
    for i,l in enumerate(lines): I[l['to']].append(i); O[l['from']].append(i)
    # Geometric game-relative inlet order, not AST1 record order.
    for m,ids in I.items():
        priority=nodes[m].get('inputPriority',[])
        if priority: ids.sort(key=lambda i: priority.index(lines[i]['toPort']) if lines[i].get('toPort') in priority else len(priority))
    solver=z3.SolverFor('QF_LRA'); solver.set(timeout=timeout)
    def rat(x):
        f=Q(str(x)); return z3.RealVal(f'{f.numerator}/{f.denominator}')
    zero,one=rat(0),rat(1)
    def total(xs): return sum(xs,zero)
    count=0
    def variable(prefix):
        nonlocal count
        count+=1; v=z3.Real(f'{prefix}_{count}'); return v
    def minimum(*xs):
        if len(xs)==1:return xs[0]
        v=variable('min')
        solver.add(*[v<=x for x in xs],z3.Or(*[v==x for x in xs]))
        return v
    def maximum(*xs):
        if len(xs)==1:return xs[0]
        v=variable('max')
        solver.add(*[v>=x for x in xs],z3.Or(*[v==x for x in xs]))
        return v
    def bound(x):return minimum(one,maximum(zero,x))
    def cf(t,caps,k):
        # Exact closed form: cap[k]=1, water level obtained from all saturated subsets.
        # Each candidate excludes the participant whose counterfactual cap is one.
        others=[x for j,x in enumerate(caps) if j!=k]
        choices=[(t-total(sub))/rat(len(caps)-len(sub))
                 for n in range(len(others)+1) for sub in combinations(others,n)]
        return minimum(one,maximum(*choices))
    S=[variable('s') for l in lines]; D=[variable('d') for l in lines]
    X=[variable('x') for l in lines]
    active=[bool(l['materials']) and l.get('active',True) for l in lines]
    material=[bool(l['materials']) for l in lines]
    F=[{k:variable('f') for k in l['materials']} for l in lines]
    for i in range(len(lines)):
        solver.add(S[i]>=zero,S[i]<=one,D[i]>=zero,D[i]<=one)
        solver.add(X[i]==(minimum(S[i],D[i]) if active[i] else zero))
        solver.add(X[i]==total(F[i].values()),*[x>=zero for x in F[i].values()])
        if not active[i]:solver.add(S[i]==zero)
        if not material[i]:solver.add(D[i]==zero)
    def offers(ids):return [S[i] if active[i] else zero for i in ids]
    def demands(ids):return [D[i] if material[i] else zero for i in ids]
    ns={}; nd={}; cycles={}
    def setS(i,v):ns[i]=minimum(one,v) if active[i] else zero
    def setD(i,v):nd[i]=minimum(one,v) if material[i] else zero
    for m,n in nodes.items():
        inc,out=I[m],O[m]; r=n.get('recipe'); typ=n['type']
        if not inc and not out:continue
        if r:
            groups=[(item,rat(q),[i for i in inc if item in F[i]]) for item,q in r['inputs'].items()]
            period=one/rat(r['seconds']); qty=rat(r['qty'])
            supp=[total(offers(ids))/q for _,q,ids in groups]
            if out:setS(out[0],qty*minimum(period,*supp))
            downstream=D[out[0]]/qty if out and material[out[0]] else zero
            for j,(item,q,ids) in enumerate(groups):
                demand=q*minimum(period,downstream,*[v for k,v in enumerate(supp) if k!=j])
                for k,i in enumerate(ids):
                    if recipe_priority:setD(i,bound(demand-total(offers(ids[:k]))))
                    else:setD(i,cf(demand,offers(ids),k))
            # Redundant exact conservation equations from finite buffers.
            nu=variable('cycle');cycles[m]=nu;solver.add(nu>=zero,nu<=period)
            for item,q,ids in groups:solver.add(total(F[i][item] for i in ids)==q*nu)
            solver.add(total(F[i].get(r['output'],zero) for i in out)==qty*nu)
        elif typ=='分流':
            if inc:setD(inc[0],total(demands(out)))
            supply=S[inc[0]] if inc and active[inc[0]] else zero
            for k,i in enumerate(out):setS(i,cf(supply,demands(out),k))
        elif typ=='汇流':
            if out:setS(out[0],total(offers(inc)))
            demand=D[out[0]] if out and material[out[0]] else zero
            for k,i in enumerate(inc):setD(i,cf(demand,offers(inc),k))
        elif typ=='仓入':
            for i in inc:setD(i,one)
        elif typ=='电脑':
            for k,i in enumerate(inc):setD(i,cf(one,offers(inc),k))
        elif typ!='仓出':return {'status':'unsupported','reason':typ}
        if typ in ('分流','汇流'):
            for item in set(k for i in inc+out for k in F[i]):
                solver.add(total(F[i].get(item,zero) for i in inc)==total(F[i].get(item,zero) for i in out))
    # Warehouse net and frozen factories: exact rational coefficients.
    pools={p['item']:p['order'] for p in g.get('pools',[])}
    frozen=g.get('frozen',[])
    for f in frozen:
        for item in f['rates']:pools.setdefault(item,[])
    A=[variable('duty') for f in frozen]
    avail={k:total(F[i].get(k,zero) for i,l in enumerate(lines) if nodes[l['to']]['type']=='仓入') for k in pools}
    for j,f in enumerate(frozen):
        solver.add(A[j]>=zero,A[j]<=one)
        for k,v in f['rates'].items():
            if Q(v)>0:avail[k]+=rat(v)*A[j]
    for j,f in enumerate(frozen):
        limits=[one if f.get('reachable',True) else zero]
        if not g.get('unlimited'):
            limits += [bound(avail[k]/rat(-Q(v))) for k,v in f['rates'].items() if Q(v)<0]
        solver.add(A[j]==minimum(*limits))
        for k,v in f['rates'].items():
            if Q(v)<0:avail[k]+=rat(v)*A[j]
    for k,order in pools.items():
        remaining=avail[k]
        for m in order:
            for i in O.get(m,[]):
                setS(i,one if g.get('unlimited') else bound(remaining))
                remaining-=X[i]
        if not g.get('unlimited'):solver.add(remaining>=zero)
    for i in range(len(lines)):
        solver.add(S[i]==ns.get(i,zero),D[i]==nd.get(i,zero))
    # No objective maximization, no preference for a known fixture value.
    t=time.monotonic(); res=solver.check()
    elapsed=time.monotonic()-t
    report={'recipe_priority':recipe_priority,'status':str(res),'solve_s':round(elapsed,3),'variables':count,'constraints':len(solver.assertions())}
    if res!=z3.sat:
        if res==z3.unknown:report['reason']=solver.reason_unknown()
        return report
    model=solver.model()
    def q(v):
        x=model.eval(v,model_completion=True)
        return Q(x.numerator_as_long(),x.denominator_as_long())
    # All assertions independently evaluated by exact model substitution.
    if not all(z3.is_true(model.eval(a,model_completion=True)) for a in solver.assertions()):
        raise AssertionError('candidate fails exact equations')
    flux={l['id']:{k:str(q(v)) for k,v in F[i].items()} for i,l in enumerate(lines)}
    net={}
    for i,l in enumerate(lines):
        for k,v in F[i].items():
            sign=(nodes[l['to']]['type']=='仓入')-(nodes[l['from']]['type']=='仓出')
            if sign:net[k]=net.get(k,Q(0))+sign*q(v)
    for j,f in enumerate(frozen):
        for k,v in f['rates'].items():net[k]=net.get(k,Q(0))+Q(v)*q(A[j])
    report.update(net_per_second={k:str(v) for k,v in net.items()},net_per_minute={k:str(v*60) for k,v in net.items()},flows=flux,cycles={k:str(q(v)) for k,v in cycles.items()},duties={f['id']:str(q(A[j])) for j,f in enumerate(frozen)})
    report['offers']={l['id']:str(q(S[i])) for i,l in enumerate(lines)}
    report['demands']={l['id']:str(q(D[i])) for i,l in enumerate(lines)}
    # Ask for any *different physical flow or duty*, not a different auxiliary water level.
    physical=[v for f in F for v in f.values()]+A+list(cycles.values())
    solver.add(z3.Or(*[v!=rat(q(v)) for v in physical]))
    t=time.monotonic(); other=solver.check()
    report.update(uniqueness=str(other),uniqueness_s=round(time.monotonic()-t,3))
    if other==z3.unknown:report['uniqueness_reason']=solver.reason_unknown()
    if other==z3.sat:
        alt=solver.model()
        report['different_flows']={l['id']:{k:str(alt.eval(v)) for k,v in F[i].items() if not z3.eq(alt.eval(v),model.eval(v))} for i,l in enumerate(lines) if any(not z3.eq(alt.eval(v),model.eval(v)) for v in F[i].values())}
    return report

if __name__=='__main__':
    import subprocess
    for filename in sys.argv[1:]:
        raw=subprocess.check_output(['node',str(Path(__file__).parent/'export-graph.js'),filename],encoding='utf-8')
        g=json.loads(raw)
        r=solve(g)
        path=Path(__file__).parent/(Path(filename).stem+'.result.json')
        path.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
        print(filename,json.dumps({k:v for k,v in r.items() if k not in ('flows','cycles','different_flows','offers','demands')},ensure_ascii=False),flush=True)
