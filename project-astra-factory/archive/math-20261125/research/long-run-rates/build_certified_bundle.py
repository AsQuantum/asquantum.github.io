from pathlib import Path
import hashlib
import json
root=Path(__file__).resolve().parent
names=['direct_graph','symbolic_physical_spec','tandem_count_proof','recipe_tree_proof','permanent_fifo_blockage','real_refill_priority_proof','counterfactual_metrics','count_proof_compile','count_factored_projection','count_interval_projection','stock_work_conservation','warehouse_ready_tree_proof','structural_zero_proof','proof_depth_plan','saturated_router_proof','joint_stock_residual_bounds','sparse_frozen_priority','bounded_shared_root_tree_proof','frozen_exclusive_proof','frozen_fed_ring_proof','frozen_exclusive_network_proof','certified_counts']
registry=json.loads((root.parent.parent/'docs/math-proof-registry.json').read_text(encoding='utf8'))
assert registry['activeBundleModules']==names, 'Update math-proof-registry.json when changing production proof modules'
parts=["'use strict';\n// Generated from audited research modules; no runtime research-directory dependency.\n"]
for name in names:
    s=(root/(name+'.js')).read_text(encoding='utf8')
    digest=hashlib.sha256(s.encode('utf8')).hexdigest()
    if name=='direct_graph':s=s[:s.index('// Experimental interface for a future UI adapter.')]
    if name=='symbolic_physical_spec':s=s[:s.index('// Compile both mathematical views from the SAME current layout.')]
    parts.append('// --- '+name+'.js source SHA256 '+digest+' ---\n'+s+'\n')
(root.parent.parent/'scripts/engine/steady-certified-proofs.js').write_text('\n'.join(parts),encoding='utf8')
