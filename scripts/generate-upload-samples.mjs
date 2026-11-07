// Small, deterministic fixtures for upload/preview demonstrations, not solver inputs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', 'mock-data')
const samples = {}
const json = (id, data) => { samples[id] = { ext: 'json', data } }
const csv = (id, headers, rows) => { samples[id] = { ext: 'csv', data: [headers, ...rows].map(r => r.join(',')).join('\n') + '\n' } }
const text = (id, ext, data, note) => { samples[id] = { ext, data, note } }
const stations = Array.from({ length: 10 }, (_, i) => [`STA-${String(i + 1).padStart(4, '0')}`, (i % 5) * 500, Math.floor(i / 5) * 500, 0, 0])
json('DS-WAVE-0002', { coordinate_system: 'local_cartesian_m', moment_tensor_unit: 'N m', moment_tensor: [[1e12, 0, 0], [0, 5e11, 0], [0, 0, -1.5e12]], source_location: { x: 1000, y: 250, z: -1000 }, time_step_seconds: 0.001, total_steps: 2000, assumed_p_velocity_m_s: 3000 })
json('DS-WAVE-0003', { boundary_type: 'PML', layers: 10, damping_profile: 'cosine', reflection_coefficient: 0.001 })
csv('DS-WAVE-0004', ['station_id', 'x', 'y', 'z', 'elevation_m'], stations)
csv('DS-WAVE-0005', ['pick_id', 'station_id', 'phase', 'travel_time_s', 'confidence'], stations.map(([id,x,y], i) => [`PK-${String(i+1).padStart(5,'0')}`, id, 'P', (Math.hypot(x-1000,y-250,1000)/3000).toFixed(6), 0.95]))
json('DS-TEC-0002', { layers: [{ name: 'upper_crust', density_kg_m3: 2700, viscosity_pa_s: 1e22, young_modulus_pa: 5e10 }, { name: 'lower_crust', density_kg_m3: 2900, viscosity_pa_s: 5e21, young_modulus_pa: 6.5e10 }] })
csv('DS-TEC-0003', ['point_id','lon','lat','vx_mm_per_yr','vy_mm_per_yr','sigma_mm'], Array.from({length:8},(_,i)=>[`TP-${i+1}`,102+i*0.1,31+i*0.05,18+i*0.2,-6+i*0.1,0.8]))
json('DS-LLM-0002', { model: { type: 'BPE', vocab: { '[UNK]': 0, '[PAD]': 1, 'hello': 2, 'world': 3, '计算': 4, '科学': 5 }, merges: [] }, unk_token: '[UNK]' })
const tensorHeader = Buffer.from(JSON.stringify({ __metadata__: { source_type: 'simulated', description: 'Tiny upload fixture, not a pretrained model' }, 'demo.weight': { dtype: 'F32', shape: [2, 3], data_offsets: [0, 24] } }).padEnd(256, ' '))
const tensorLength = Buffer.alloc(8); tensorLength.writeBigUInt64LE(BigInt(tensorHeader.length))
const tensorData = Buffer.alloc(24); for (let i=0;i<6;i++) tensorData.writeFloatLE(i/10,i*4)
samples['DS-LLM-0003'] = { ext: 'safetensors', data: Buffer.concat([tensorLength,tensorHeader,tensorData]) }
json('DS-LLM-0004', { data_parallel: 2, tensor_parallel: 1, pipeline_parallel: 1, micro_batch_size: 2, gradient_accumulation_steps: 4, precision: 'fp32' })
json('DS-PINN-0001', { equation: 'heat_2d', diffusivity: 0.01, domain: { x: [0,1], y: [0,1], t: [0,1] }, loss_weights: { pde: 1, boundary: 1, initial: 1 } })
json('DS-PINN-0003', { boundary_type: 'Dirichlet', boundary_value: 0, initial_condition: 'sin(pi*x)*sin(pi*y)', points: [{ x: 0, y: 0, t: 0, value: 0 }, { x: 0.5, y: 0.5, t: 0, value: 1 }] })
json('DS-CRASH-0002', { demo_format: 'mesh-json-v1', coordinate_unit: 'mm', nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 100, y: 0, z: 0 }, { id: 3, x: 100, y: 100, z: 0 }, { id: 4, x: 0, y: 100, z: 0 }], elements: [{ id: 1, type: 'shell4', node_ids: [1,2,3,4], material_id: 'steel' }] })
samples['DS-CRASH-0002'].note = 'LSDA 专用格式的演示替代：JSON 小网格，可预览节点；不是 LSDA 文件，不能直接交给 LS-DYNA 求解。'
json('DS-CRASH-0003', { materials: [{ id: 'steel', density_kg_m3: 7850, young_modulus_mpa: 210000, poisson_ratio: 0.3, yield_stress_mpa: 350 }] })
json('DS-CRASH-0004', { velocity_m_s: 15.56, impact_angle_deg: 0, overlap_ratio: 1, duration_s: 0.12, barrier: 'rigid_wall' })
json('DS-CRASH-0005', { contacts: [{ id: 'C1', type: 'automatic_single_surface', friction: 0.2 }], welds: [{ id: 'W1', node_ids: [1,2], failure_force_n: 5000 }] })
csv('DS-FATIGUE-0002', ['time_s','force_x_n','force_y_n','force_z_n'], Array.from({length:20},(_,i)=>[(i*0.05).toFixed(2),0,0,(1000+500*Math.sin(i*Math.PI/5)).toFixed(2)]))
csv('DS-FATIGUE-0003', ['material_id','stress_amplitude_mpa','cycles_to_failure'], [400,350,300,250,200].map((s,i)=>['steel',s,10000*10**i]))
json('DS-FATIGUE-0004', { material_id: 'steel', young_modulus_mpa: 210000, ultimate_strength_mpa: 600, fatigue_limit_mpa: 200, mean_stress_correction: 'Goodman' })
json('DS-SWARM-0001', { coordinate_unit: 'm', agents: Array.from({length:5},(_,i)=>({ id:`UAV-${i+1}`, position:[i*10,0,20], velocity:[0,0,0] })), time_step_s: 0.1 })
json('DS-SWARM-0002', { directed: false, nodes: Array.from({length:5},(_,i)=>`UAV-${i+1}`), edges: Array.from({length:4},(_,i)=>({ source:`UAV-${i+1}`, target:`UAV-${i+2}`, latency_ms:10 })) })
json('DS-SWARM-0003', { formation: 'line', coordinate_unit: 'm', targets: Array.from({length:5},(_,i)=>({ agent_id:`UAV-${i+1}`, position:[i*10,100,20] })) })
json('DS-PATH-0002', { coordinate_unit: 'm', obstacles: [{ id:'O1', type:'sphere', center:[50,50,20], radius:10, velocity:[0,0,0] }, { id:'O2', type:'sphere', center:[70,30,15], radius:5, velocity:[0,0.5,0] }] })
json('DS-PATH-0003', { coordinate_unit: 'm', missions: [{ agent_id:'UAV-1', start:[0,0,20], goal:[100,100,20], max_speed_m_s:10 }], safety_distance_m:3 })
text('DS-VS-0002', 'pdb', 'HEADER    SIMULATED ALANINE FRAGMENT\nREMARK    UPLOAD PREVIEW ONLY - NOT AN EXPERIMENTAL TARGET\nATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N  \nATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 20.00           C  \nATOM      3  C   ALA A   1       2.050   1.400   0.000  1.00 20.00           C  \nATOM      4  O   ALA A   1       1.450   2.400   0.000  1.00 20.00           O  \nATOM      5  CB  ALA A   1       2.000  -0.800   1.200  1.00 20.00           C  \nTER\nEND\n')
json('DS-VS-0003', { center_angstrom:[1,1,0], box_size_angstrom:[20,20,20], exhaustiveness:8, num_modes:3, seed:42 })
text('DS-VS-0004','sdf','Simulated ethanol\n  Topic5 Demo\nUpload preview fixture\n  3  2  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    2.1000    1.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\n  2  3  1  0  0  0  0\nM  END\n> <source_type>\nsimulated\n\n$$$$\n')
csv('DS-ADMET-0001', ['molecule_id','molecular_weight','logp','hbd','hba','tpsa'], [['MOL-1',46.07,-0.3,1,1,20.23],['MOL-2',78.11,2.13,0,0,0],['MOL-3',180.16,1.19,1,4,63.6]])
csv('DS-ADMET-0003', ['molecule_id','absorption_probability','hepatotoxicity_label','clearance_ml_min_kg'], [['MOL-1',0.9,0,15],['MOL-2',0.7,1,12],['MOL-3',0.8,0,8]])
text('DS-BANDOS-0002','upf','<?xml version="1.0"?>\n<UPF version="2.0.1">\n  <PP_INFO>SIMULATED PREVIEW FIXTURE. Not a usable pseudopotential for SCF calculations.</PP_INFO>\n  <PP_HEADER element="Si" pseudo_type="NC" z_valence="4.0" functional="PBE"/>\n  <PP_MESH><PP_R>0.0 0.1 0.2 0.3</PP_R></PP_MESH>\n  <PP_LOCAL>0.0 -1.0 -0.5 -0.1</PP_LOCAL>\n</UPF>\n', 'UPF 结构展示样例，非可用于自洽场计算的完整赝势。')
json('DS-BANDOS-0003', { grid:[4,4,4], shift:[0,0,0], scheme:'Monkhorst-Pack' })
json('DS-BANDOS-0004', { calculation:'scf', ecutwfc_ry:40, convergence_threshold_ry:1e-6, max_iterations:50, smearing:'gaussian', degauss_ry:0.01 })
json('DS-HTS-0002', { materials:[{ id:'MAT-SI', formula:'Si', band_gap_ev:1.12, formation_energy_ev_atom:0 }, { id:'MAT-GAAS', formula:'GaAs', band_gap_ev:1.42, formation_energy_ev_atom:-0.4 }] })
json('DS-HTS-0003', { calculation:'relax+scf', ecutwfc_ry:40, kpoint_grid:[4,4,4], convergence_threshold_ry:1e-6, max_iterations:50 })

const manifest = {}
for (const domain of ['geodynamics','llm','automotive','uav','drug','dft']) {
  const datasets = JSON.parse(readFileSync(resolve(root,domain,'datasets.json'),'utf8')).data
  for (const dataset of datasets) {
    const scope = datasets.filter(d=>d.scenario_id===dataset.scenario_id)
    if (dataset.format==='HDF5' || dataset===(scope.find(d=>d.format==='HDF5')??scope[0])) continue
    const sample=samples[dataset.dataset_id]
    if (!sample) throw new Error(`Missing fixture: ${dataset.dataset_id}`)
    const folder=resolve(root,'uploads',domain); mkdirSync(folder,{recursive:true})
    const filename=`${dataset.dataset_id}.${sample.ext}`
    const content=sample.ext==='json' ? JSON.stringify({dataset_id:dataset.dataset_id,scenario_id:dataset.scenario_id,source_type:'simulated',...sample.data},null,2)+'\n' : sample.data
    writeFileSync(resolve(folder,filename),content)
    manifest[dataset.dataset_id]={domain,file_name:filename,format:sample.ext.toUpperCase(),note:sample.note??'小规模模拟样例，仅用于上传与预览演示。'}
  }
}
writeFileSync(resolve(root,'uploads','manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(`Generated ${Object.keys(manifest).length} upload fixtures.`)
