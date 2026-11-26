"""Offline oracle for the portable JS compiler; native exact QF_LRA.
Neither a numerical fixed point nor an objective maximization chooses the model.
"""
import sys,json,subprocess,time
from pathlib import Path
from fractions import Fraction
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'vendor'))
import z3
def compile_problem(g,policy='relaxed'):
    return json.loads(subprocess.check_output(['node','-e','const fs=require("fs"),c=require(process.argv[1]);process.stdout.write(JSON.stringify(c.compileExactRateProblem(JSON.parse(fs.readFileSync(0,"utf8")),{inletPolicy:process.argv[2]})));',str(HERE/'compile_exact.js'),policy],input=json.dumps(g,ensure_ascii=False),encoding='utf-8'))
def run(g,policy='relaxed',timeout=30000):
    p=compile_problem(g,policy)
    if p['status']!='compiled':return p
    solver=z3.SolverFor('QF_LRA');solver.set(timeout=timeout)
    solver.from_string(p['smt'])
    start=time.monotonic();r=solver.check()
    result=dict(status=str(r),solve_s=round(time.monotonic()-start,3),variables=p['variables'],policy=policy)
    if r!=z3.sat:
        if r==z3.unknown:result['reason']=solver.reason_unknown()
        return result
    m=solver.model()
    assert all(z3.is_true(m.eval(a,model_completion=True)) for a in solver.assertions())
    symbols={k:z3.Real(v) for k,v in p['observables'].items()}
    values={k:m.eval(v,model_completion=True) for k,v in symbols.items()}
    def text(v):return str(Fraction(v.numerator_as_long(),v.denominator_as_long()))
    result['values']={k:text(v) for k,v in values.items()}
    result['groups']={}
    # Prove each reported observable independently. If the group has an
    # alternative, every changed coordinate is already a counterexample;
    # remove those and ask whether any remaining coordinate can differ.
    # At most len(keys) strict removals. This is logical case elimination,
    # not numerical convergence or choosing a favored physical flow.
    result['observable_status']={}
    def classify(keys):
        todo=list(keys);states={};witnesses={}
        while todo:
            solver.push()
            solver.add(z3.Or(*[symbols[k]!=values[k] for k in todo]))
            res=solver.check()
            if res==z3.unsat:
                states.update({k:'unique' for k in todo})
            elif res==z3.unknown:
                states.update({k:'unknown' for k in todo})
            else:
                alt=solver.model()
                changed=[k for k in todo if not z3.eq(alt.eval(symbols[k],model_completion=True),values[k])]
                assert changed
                for k in changed:
                    states[k]='multiple';witnesses[k]=text(alt.eval(symbols[k],model_completion=True))
            solver.pop()
            todo=[k for k in todo if k not in states]
        return states,witnesses
    for group,keys in p['groups'].items():
        if not keys:result['groups'][group]={'status':'unique','seconds':0};continue
        solver.push();solver.add(z3.Or(*[symbols[k]!=values[k] for k in keys]))
        t=time.monotonic();other=solver.check()
        info={'status':'unique' if other==z3.unsat else 'multiple' if other==z3.sat else 'unknown','seconds':round(time.monotonic()-t,3)}
        if other==z3.sat:
            alt=solver.model();info['alternate']={k:text(alt.eval(symbols[k],model_completion=True)) for k in keys if not z3.eq(alt.eval(symbols[k],model_completion=True),values[k])}
        elif other==z3.unknown:info['reason']=solver.reason_unknown()
        solver.pop()
        result['groups'][group]=info
        if other==z3.unsat:result['observable_status'].update({k:'unique' for k in keys})
        elif other==z3.sat:
            status,witnesses=classify(keys)
            result['observable_status'].update(status)
            info['nonunique']=[k for k in keys if status[k]=='multiple']
            info['unknown']=[k for k in keys if status[k]=='unknown']
            info['witnesses']=witnesses
        else:result['observable_status'].update({k:'unknown' for k in keys})
    return result
if __name__=='__main__':
    for name in sys.argv[1:]:
        g=json.loads(subprocess.check_output(['node',str(HERE/'export-graph.js'),name],encoding='utf-8'))
        r=run(g)
        (HERE/(Path(name).stem+'.portable.result.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
        print(name,json.dumps({k:v for k,v in r.items() if k!='values'},ensure_ascii=False),flush=True)
