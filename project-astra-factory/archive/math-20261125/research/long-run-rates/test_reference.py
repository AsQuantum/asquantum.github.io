"""Offline regression tests; no game code is changed or executed for solving."""
from fractions import Fraction as Q
from itertools import product, combinations
from exact_reference import solve
def node(id,type,recipe=None,item=None):return dict(id=id,type=type,recipe=recipe,item=item)
def rec(output,qty=1,seconds=1,inputs=None):return dict(output=output,qty=qty,seconds=seconds,inputs=inputs or {})
def source(id,item='A',seconds=1):return node(id,'recipe',rec(item,seconds=seconds))
def sink(id):return node(id,'仓入')
def line(id,a,b,*items,active=True):return dict(id=id,from_=a,to=b,materials=list(items),active=active)|{'from':a}
def graph(nodes,lines,pools=None,frozen=None,unlimited=False):
    return dict(status='compiled',nodes=nodes,lines=lines,pools=pools or [],frozen=frozen or [],unlimited=unlimited)
def check(name,g,expect,flows=None):
    r=solve(g)
    assert r['status']=='sat' and r['uniqueness']=='unsat',(name,r)
    for k,v in expect.items():assert Q(r['net_per_second'].get(k,'0'))==Q(v),(name,r)
    for l,items in (flows or {}).items():
        for k,v in items.items():assert Q(r['flows'][l][k])==Q(v),(name,r)
    print('PASS',name,r['net_per_second'],r['solve_s'],r['uniqueness_s'])
def wf(t,c,k):
    c=list(c);c[k]=Q(1)
    left=min(t,sum(c)); result=[0]*len(c)
    for j,i in enumerate(sorted(range(len(c)),key=lambda i:c[i])):
        result[i]=min(c[i],left/(len(c)-j));left-=result[i]
    return result[k]
def closed(t,c,k):
    others=[v for j,v in enumerate(c) if j!=k]
    return min(Q(1),max((t-sum(s))/(len(c)-len(s)) for n in range(len(others)+1) for s in combinations(others,n)))
def test_waterfill():
    vals=[Q(0),Q(1,7),Q(1,2),Q(1)]
    count=0
    for n in range(1,5):
        for c in product(vals,repeat=n):
            for t in [Q(0),Q(1,11),Q(1,2),Q(1),Q(7,3),Q(5)]:
                for k in range(n):
                    assert wf(t,c,k)==closed(t,c,k),(t,c,k)
                    count+=1
    print('PASS exact closed-form waterfill',count,'rational comparisons')
if __name__=='__main__':
    test_waterfill()
    check('split unequal demand',graph([source('a'),node('s','分流'),node('r','recipe',rec('B',seconds=5,inputs={'A':1})),sink('w')],[line('i','a','s','A'),line('slow','s','r','A'),line('fast','s','w','A'),line('o','r','w','B')]),{'A':'4/5','B':'1/5'})
    check('same-material multiport',graph([source('a'),source('b'),node('r','recipe',rec('B',seconds=2,inputs={'A':3})),sink('w')],[line('a','a','r','A'),line('b','b','r','A'),line('o','r','w','B')]),{'B':'1/2'},{'a':{'A':'3/4'},'b':{'A':'3/4'}})
    check('same-material asymmetric capacities',graph([source('a',seconds=5),source('b'),node('r','recipe',rec('B',seconds=2,inputs={'A':2})),sink('w')],[line('a','a','r','A'),line('b','b','r','A'),line('o','r','w','B')]),{'B':'1/2'},{'a':{'A':'1/5'},'b':{'A':'4/5'}})
    check('multi-ingredient',graph([source('a',seconds=5),source('b','B'),node('r','recipe',rec('C',seconds=2,inputs={'A':2,'B':1})),sink('w')],[line('a','a','r','A'),line('b','b','r','B'),line('o','r','w','C')]),{'C':'1/10'})
    check('nested split',graph([source('a'),node('s','分流'),node('t','分流'),sink('w')],[line('i','a','s','A'),line('a','s','w','A'),line('b','s','t','A'),line('c','t','w','A'),line('d','t','w','A')]),{'A':1},{'a':{'A':'1/2'},'c':{'A':'1/4'},'d':{'A':'1/4'}})
    check('physical return loop',graph([source('a'),node('m','汇流'),node('s','分流'),sink('w')],[line('a','a','m','A'),line('b','m','s','A'),line('c','s','m','A'),line('d','s','w','A')]),{'A':'1/2'},{'b':{'A':1},'c':{'A':'1/2'}})
    check('unseeded loop',graph([node('a','分流'),node('b','分流'),sink('w')],[line('a','a','b','A',active=False),line('b','b','a','A',active=False),line('c','b','w','A',active=False)]),{'A':0})
    check('mixed merger tail',graph([source('a'),source('b','B'),node('m','汇流'),sink('w')],[line('a','a','m','A'),line('b','b','m','B'),line('c','m','w','A','B')]),{'A':'1/2','B':'1/2'})
    check('missing ingredient',graph([source('a'),node('r','recipe',rec('C',inputs={'A':1,'B':1})),sink('w')],[line('a','a','r','A'),line('c','r','w','C',active=False)]),{'C':0},{'a':{'A':0}})
    nodes=[source('a'),sink('w'),node('o1','仓出',item='A'),node('o2','仓出',item='A'),node('r','recipe',rec('B',seconds=5,inputs={'A':1})),node('c','电脑')]
    ls=[line('deposit','a','w','A'),line('first','o1','r','A'),line('second','o2','c','A'),line('product','r','w','B')]
    pools=[dict(item='A',order=['o1','o2']),dict(item='B',order=[])]
    check('warehouse priority',graph(nodes,ls,pools),{'A':0,'B':'1/5'},{'first':{'A':'1/5'},'second':{'A':'4/5'}})
    check('warehouse unlimited',graph(nodes,ls,pools,unlimited=True),{'A':'-1/5','B':'1/5'},{'second':{'A':1}})
    frozen=[dict(id='p',reachable=True,rates={'A':'1','B':'1/2'}),dict(id='q',reachable=True,rates={'A':'-2','B':'-1/2','C':'4'}),dict(id='r',reachable=True,rates={'B':'-1/2','D':'1'})]
    check('frozen duty and strict priority',graph([],[],frozen=frozen),{'A':0,'B':0,'C':2,'D':'1/2'})
    check('frozen unseeded',graph([],[],frozen=[dict(id='a',reachable=False,rates={'A':'-1','B':'1'}),dict(id='b',reachable=False,rates={'B':'-1','A':'1'})]),{'A':0,'B':0})
    # A seedable, exactly balanced frozen recirculation with no positive
    # external source illustrates nonuniqueness of the algebraic model:
    # reachable is a structural flag, not proof of sustained initial stock.
    r=solve(graph([],[],frozen=[dict(id='a',reachable=True,rates={'A':'-1','B':'1'}),dict(id='b',reachable=True,rates={'B':'-1','A':'1'})]))
    assert r['status']=='sat' and r['uniqueness']=='sat',r
    print('PASS multiple duty solutions detected; must not publish unique physical rate')
    r=solve(dict(status='unresolved',issues=[{'reason':'mixed FIFO needs ordered-item equations'}]))
    assert r['status']=='unsupported'
    print('PASS unsupported ordered FIFO does not fabricate a solution')
