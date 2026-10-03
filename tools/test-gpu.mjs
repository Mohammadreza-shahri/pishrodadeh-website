import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialGPURequirements, validateGPURequirements, estimateGPUMemory,
  gpuCandidates, validateGPUProposal, gpuServerCandidates, gpuAdvisorReport} from '../dist/gpu-advisor.js';
import {gpuCatalog} from '../dist/gpu-catalog.js';
const data = JSON.parse(await readFile(new URL('../dist/catalog.json', import.meta.url), 'utf8'));
let passed = 0;
function test(name, action) {action(); passed++; console.log('PASS ' + name);}
const req = {...initialGPURequirements(), parametersB:8, precision:'16', runtimeGB:4};
const proposal = {version:1, requirements:req, gpuId:'nvidia-l4'};
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
  assert.equal(servers.length, 4);
  assert(servers.every(item => item.option.model_id === item.model.id && item.option.sku === 'S0K89C' && item.option.evidence.length));
  assert.equal(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).length, 3);
  assert(!gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).some(item => item.model.id === '16910'));
  assert(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-l40s'}).every(item => item.status !== 'verified'));
});
test('Unlisted NVIDIA GPUs remain standalone, not incompatible or HPE-qualified', () => {
  assert.equal(gpuServerCandidates(data, {...proposal, gpuId:'nvidia-h200-nvl'}).length, 0);
  const report = gpuAdvisorReport(data, req, 'nvidia-h200-nvl');
  assert(report.limitations.includes('hpeUnlisted'));
  assert.equal(report.status, 'technical_review_required');
  assert.equal(report.selected.memory_per_device_gb, 141);
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
