"""Replay the actual historical graphs with the new independent JS compiler.
Compare exact fractions, not rounded presentation values.
"""
from pathlib import Path
from fractions import Fraction as Q
import json, sys
from run_portable import run
HERE=Path(__file__).parent
def q(x):return Q(str(x))
def checks(expected):
    f=expected.get('fractions') or {}
    out={}
    for key,label in [('inflow','inflow'),('outflow','outflow'),('potentialNet','potential'),('localInflow','localIn'),('localOutflow','localOut'),('frozenDuty','duty'),('machineCycles','cycle')]:
        for name,value in (f.get(key) or {}).items():out[label+':'+name]=q(value)
    for r,items in (f.get('routes') or {}).items():
        for k,v in items.items():out['flow:'+r+'|'+k]=q(v)
    return out
results=[];seen=set()
for i,line in enumerate((HERE/'captured-historical.jsonl').read_text(encoding='utf-8').splitlines()):
    g,e=json.loads(line).values();key=json.dumps(g,sort_keys=True)
    if key in seen:continue
    seen.add(key)
    # Legacy comparison explicitly uses the same ideal fairness assumption.
    # The default relaxed mode separately tests whether each target is robust
    # to an unresolved same-material inlet arbitration.
    r=run(g,policy='fair',timeout=10000)
    error=[]
    if e['status']=='conditional-fixed-point':
        if r['status']!='sat':error.append(['status',r['status']])
        else:
            got=r['values'];want=checks(e)
            for k,v in want.items():
                # The old result includes isolated zero-cycle producers;
                # no line or positive flow may disappear.
                if q(got.get(k,'0'))!=v:error.append([k,str(v),got.get(k,'0')])
            for k,v in got.items():
                if k.startswith(('inflow:','outflow:','localIn:','localOut:','duty:','cycle:','flow:')) and k not in want and q(v)!=0:error.append(['unexpected '+k,v])
            if any(r['groups'][k]['status']!='unique' for k in ('ledger','local','cycles','flows','duties')):
                error.append(['group uniqueness',r['groups']])
    elif e['status']=='unresolved' and g['status']=='unresolved':
        if r['status']!='unsupported':error.append(['unsupported',r['status']])
    else: error.append(['unclassified legacy',e['status'],g['status']])
    results.append(dict(index=i,nodes=len(g['nodes']),lines=len(g['lines']),unlimited=g['unlimited'],frozen=len(g['frozen']),status=r['status'],errors=error,result=r))
    print(i,'PASS' if not error else 'FAIL',len(g['nodes']),len(g['lines']),'unlimited',g['unlimited'],'frozen',len(g['frozen']),'solve_s',r.get('solve_s'),str(error)[:1200],flush=True)
(HERE/'portable-historical-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('TOTAL',len(results),'PASS',sum(not r['errors'] for r in results))
if any(r['errors'] for r in results):sys.exit(1)
