import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialGPURequirements, validateGPURequirements, estimateGPUMemory,
  gpuCandidates, validateGPUProposal, gpuServerCandidates, gpuAdvisorReport} from '../dist/gpu-advisor.js';
import {gpuCatalog} from '../dist/gpu-catalog.js';
import {gpuPurposes, isLanguageWorkload, gpuServerWorkload} from '../dist/gpu-purposes.js';
const data = JSON.parse(await readFile(new URL('../dist/catalog.json', import.meta.url), 'utf8'));
let passed = 0;
function test(name, action) {action(); passed++; console.log('PASS ' + name);}
const req = {...initialGPURequirements(), parametersB:8, precision:'16', runtimeGB:4};
const proposal = {version:1, requirements:req, gpuId:'nvidia-l4'};
test('Legacy language-model requirements migrate without changing estimates or server mapping', () => {
  const legacy = Object.fromEntries(Object.entries(req).filter(([key]) =>
    !['useCase','task','softwareName','workloadDetails','channels','sharing','computeType'].includes(key)));
  assert.deepEqual(validateGPURequirements(legacy), req);
  assert.equal(estimateGPUMemory(legacy).targetGB, 24);
  assert.equal(gpuServerWorkload(validateGPURequirements(legacy)), 'ai_inference');
  assert.equal(gpuServerWorkload({...req, workload:'finetune'}), 'ai_training');
});
test('Unselected purpose cannot produce proposals or product reports', () => {
  assert.throws(() => gpuCandidates(data,{...req,useCase:null}));
  assert.throws(() => validateGPUProposal({...proposal,requirements:{...req,useCase:null}},data));
  assert.throws(() => gpuAdvisorReport(data,{...req,useCase:null}));
});
for (const purpose of gpuPurposes) test(purpose.id + ' stays exploratory without real workload memory', () => {
  const requirements = {...req, useCase:purpose.id, task:'general', softwareName:'Example software',
    workloadDetails:'Dataset or scene details', concurrency:30, channels:10};
  const estimate = estimateGPUMemory(requirements);
  assert.equal(estimate.weightsGB,null); assert.equal(estimate.targetGB,null);
  assert(estimate.unresolved.includes('workloadMemoryUnknown'));
  assert(estimate.unresolved.includes('applicationReview'));
  assert(gpuCandidates(data,requirements).every(candidate => candidate.fit === 'unknown'));
  assert.equal(estimateGPUMemory({...requirements,measuredGB:20}).targetGB,25);
  const report = gpuAdvisorReport(data,requirements,'nvidia-l4');
  assert.equal(report.requirements.workloadDetails,'Dataset or scene details');
  assert.equal(report.routing.purpose,purpose.id);
  assert.equal(report.status,'technical_review_required');
  assert(!report.routing.server_workload.startsWith('ai_'));
  assert(report.limitations.includes('applicationReview'));
  assert(gpuServerCandidates(data,{...proposal,requirements}).every(server => server.status !== 'verified'));
});
test('Only explicit language-model branches use parameter counts', () => {
  for (const useCase of ['ai','generative','security']) {
    assert(isLanguageWorkload({...req,useCase}));
    assert.equal(estimateGPUMemory({...req,useCase}).targetGB,24);
    assert.equal(estimateGPUMemory({...req,useCase,task:'general'}).targetGB,null);
  }
  assert.throws(() => validateGPURequirements({...req,useCase:'render',task:'llm'}));
});
test('Graphics and encoding routes do not shortlist large-memory compute-only cards', () => {
  for (const useCase of ['vdi','render','video','twin']) {
    const requirements = {...req,useCase,task:'general'};
    assert.equal(gpuCandidates(data,requirements).length,4);
    assert(!gpuCandidates(data,requirements).some(candidate => /h100|h200/.test(candidate.id)));
    assert.throws(() => validateGPUProposal({...proposal,requirements,gpuId:'nvidia-h200-nvl'},data));
    assert.throws(() => gpuAdvisorReport(data,requirements,'nvidia-h100-nvl'));
  }
});
test('FP64 scientific compute and MIG sharing are distinct capability routes', () => {
  const requirements = {...req,useCase:'hpc',task:'general',computeType:'fp64'};
  assert.deepEqual(gpuCandidates(data,requirements).map(candidate => candidate.id),['nvidia-h100-nvl','nvidia-h200-nvl']);
  const service = {...req,useCase:'service',task:'general',sharing:'mig'};
  assert.equal(gpuCandidates(data,service).length,3);
  assert(!gpuCandidates(data,service).some(candidate => /nvidia-l4/.test(candidate.id)));
  assert(estimateGPUMemory(service).unresolved.includes('sharingReview'));
  assert.equal(gpuCandidates(data,{...service,sharing:'vgpu'}).length,4);
  assert.equal(gpuCandidates(data,{...service,sharing:'dedicated'}).length,6);
  assert.equal(gpuCandidates(data,{...service,useCase:'vdi'}).length,1);
  assert.equal(gpuServerWorkload(service),'virtualization');
  assert.equal(gpuServerWorkload({...req,useCase:'analytics',task:'general'}),'database');
  assert.equal(gpuServerWorkload({...req,useCase:'render',task:'general'}),'business');
});
test('Purpose descriptions and numeric fields are strictly validated', () => {
  for (const patch of [{useCase:'anything'},{task:'anything'},{sharing:'anything'},{computeType:'anything'},
    {softwareName:23},{softwareName:'a'.repeat(161)},{workloadDetails:'bad\ntext'},
    {channels:0},{channels:1.5},{channels:10001},{channels:'10'}]) {
    assert.throws(() => validateGPURequirements({...req,...patch}));
  }
});
test('Unknown inputs remain exploratory', () => {
  const result = estimateGPUMemory(initialGPURequirements());
  assert.equal(result.targetGB, null); assert.equal(result.weightsGB, null);
  assert(gpuCandidates(data, initialGPURequirements()).every(item => item.fit === 'unknown'));
});
test('Exact memory arithmetic includes runtime and heuristic margin', () => {
  assert.equal(estimateGPUMemory(req).weightsGB, 16);
  assert.equal(estimateGPUMemory(req).targetGB, 24);
  assert.equal(estimateGPUMemory({...req, precision:'4'}).targetGB, 9);
});
test('Missing runtime is not silently treated as known zero', () => {
  const result = estimateGPUMemory({...req, runtimeGB:null});
  assert.equal(result.targetGB, 20); assert(result.unresolved.includes('runtimeUnknown'));
  assert(!estimateGPUMemory({...req, runtimeGB:0}).unresolved.includes('runtimeUnknown'));
});
test('Memory threshold is exact', () => {
  assert.equal(gpuCandidates(data, req).find(item => item.id === 'nvidia-l4').fit, 'capacity');
  assert.equal(gpuCandidates(data, {...req, runtimeGB:4.1}).find(item => item.id === 'nvidia-l4').fit, 'insufficient');
});
test('Training does not reuse inference-only math', () => {
  for (const workload of ['training', 'finetune']) {
    assert.equal(estimateGPUMemory({...req, workload}).targetGB, null);
    assert.equal(estimateGPUMemory({...req, workload, measuredGB:40}).targetGB, 50);
  }
});
test('Measured peak overrides rough weight estimate', () => {
  const estimate = estimateGPUMemory({...req, measuredGB:40});
  assert.equal(estimate.basis, 'measured'); assert.equal(estimate.targetGB, 50);
});
test('An inconsistent measurement cannot undercut the known weight floor', () => {
  const result = estimateGPUMemory({...req, measuredGB:2});
  assert.equal(result.targetGB, 20);
  assert(result.unresolved.includes('measuredBelowWeights'));
});
test('Concurrency, context and multiple GPUs never imply pooled memory or speed', () => {
  const many = {...req, concurrency:50, contextTokens:32000, replicas:8};
  const result = estimateGPUMemory(many);
  assert.equal(result.targetGB, 24); assert(result.unresolved.includes('loadUnverified'));
  assert(result.unresolved.includes('replicaCount')); assert(result.unresolved.includes('performance'));
  assert.equal(gpuCandidates(data, {...many, parametersB:70}).find(item => item.id === 'nvidia-l4').fit, 'insufficient');
});
test('Independent NVIDIA catalog includes GPUs not listed by HPE', () => {
  const candidates = gpuCandidates(data, req);
  assert.equal(candidates.length, 6);
  assert(candidates.every(item => item.source.startsWith('https://www.nvidia.com/')));
  assert.equal(candidates.find(item => item.id === 'nvidia-h200-nvl').usableGB, 141);
  assert.equal(candidates.find(item => item.id === 'nvidia-h100-nvl').usableGB, 94);
  assert.equal(candidates.find(item => item.id === 'nvidia-rtx-pro-6000-server').usableGB, 96);
  assert(!candidates.some(item => item.name.includes('A16')));
  assert(gpuCatalog.products.every(item => Number.isFinite(item.watts) && item.watts > 0));
});
test('HPE proposals use exact source-backed ordering parts and model scope', () => {
  const servers = gpuServerCandidates(data, proposal);
  assert.deepEqual(servers.map(item => item.model.id).sort(), ['16305','16910','16911','16912','16913','17105']);
  assert(servers.every(item => item.option.model_id === item.model.id && item.option.sku === 'S0K89C' && item.option.evidence.length));
  assert.deepEqual(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).map(item => item.model.id).sort(), ['16911','16912','16913','17105']);
  assert(!gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).some(item => item.model.id === '16910'));
  assert(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).every(item => item.status !== 'verified'));
});
test('Unlisted NVIDIA GPUs remain standalone, not incompatible or HPE-qualified', () => {
  assert.equal(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-h100-nvl'}).length, 0);
  const report = gpuAdvisorReport(data, req, 'nvidia-h100-nvl');
  assert(report.limitations.includes('hpeUnlisted'));
  assert.equal(report.status, 'technical_review_required');
  assert.equal(report.selected.memory_per_device_gb, 94);
});
test('New HPE platform evidence never fabricates configurator parts or quantity approval', () => {
  const report = gpuAdvisorReport(data, {...req, replicas:8}, 'nvidia-rtx-pro-6000-server');
  assert.equal(report.servers.length, 0);
  assert.equal(report.source_listed_platforms.length, 5);
  assert(report.source_listed_platforms.some(platform => platform.name === 'HPE ProLiant DL380a Gen12'));
  assert(!report.source_listed_platforms.some(platform => /DL580|DL380a Gen11/.test(platform.name)));
  assert(report.source_listed_platforms.every(platform => platform.sku === 'S6A73C' &&
    platform.source.startsWith('https://www.hpe.com/') && platform.status === 'technical_review_required' &&
    platform.configurable === false && platform.quantity_verified === false && platform.quantity === 8));
  assert(report.limitations.includes('hpePlatformReview'));
  assert(!report.limitations.includes('hpeUnlisted'));
  const h200 = gpuAdvisorReport(data, req, 'nvidia-h200-nvl');
  assert.equal(h200.source_listed_platforms.length, 3);
  assert(h200.source_listed_platforms.every(platform => platform.sku === 'S3U30C'));
});
test('Accessory requirements and unknown states survive planning', () => {
  const tower = gpuServerCandidates(data, proposal).find(item => item.model.id === '16912');
  assert(tower.required.some(item => item.any.includes('P47219-B21')));
  assert(tower.required.some(item => item.any.includes('P47902-B21')));
  assert(tower.findings.some(item => item.status === 'unknown'));
});
test('No candidate above catalog capacity is invented', () => {
  const huge = {...req, parametersB:1000, precision:'32'};
  assert(gpuCandidates(data, huge).every(item => item.fit === 'insufficient'));
  assert.throws(() => validateGPUProposal({...proposal, requirements:huge}, data));
});
test('Malformed requirements and restored proposals are rejected', () => {
  for (const patch of [{replicas:0}, {replicas:9}, {replicas:1.2}, {replicas:null}, {measuredGB:-1},
    {parametersB:Infinity}, {parametersB:'8'}, {parametersB:0}, {contextTokens:0},
    {concurrency:1.5}, {runtimeGB:-1}, {precision:'FP8'}, {workload:'other'},
    {modelName:'a'.repeat(161)}, {modelName:'bad\nname'}, {surprise:1}]) {
    assert.throws(() => validateGPURequirements({...req, ...patch}));
  }
  for (const value of [null, [], {...proposal, version:2}, {...proposal, gpuId:'unknown'},
    {...proposal, extra:1}, {...proposal, gpuId:'https://example.com'}]) assert.throws(() => validateGPUProposal(value, data));
});
test('Reports include evidence, assumptions and unresolved commercial issues', () => {
  const report = gpuAdvisorReport(data, req, 'nvidia-l4');
  assert(report.candidates.every(item => item.source));
  assert(report.servers.every(item => item.evidence.length && item.hpe_ordering_sku));
  assert(report.limitations.includes('availability')); assert(report.limitations.includes('hardware'));
  assert(report.limitations.includes('noPooling')); assert(report.estimate.unresolved.includes('heuristic'));
  assert.equal(gpuAdvisorReport(data, initialGPURequirements()).selected, null);
  assert.equal(gpuAdvisorReport(data, initialGPURequirements()).estimate.targetGB, null);
});
test('Planning and reporting do not mutate catalog or requirements', () => {
  const before = JSON.stringify({data, req});
  gpuServerCandidates(data, proposal); gpuAdvisorReport(data, req, 'nvidia-l4');
  assert.equal(JSON.stringify({data, req}), before);
});
console.log(`${passed} GPU advisor checks passed.`);
