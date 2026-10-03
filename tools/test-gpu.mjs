import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialGPURequirements, validateGPURequirements, estimateGPUMemory,
  gpuCandidates, validateGPUProposal, gpuServerCandidates, gpuAdvisorReport} from '../dist/gpu-advisor.js';
import {gpuCatalog} from '../dist/gpu-catalog.js';
import {gpuPCIeLink, gpuPCIeReport} from '../dist/gpu-pcie.js';
import {gpuPurposes, gpuPurposeGroups, isLanguageWorkload, gpuServerWorkload} from '../dist/gpu-purposes.js';
import {gpuSoftware, gpuWorkloadExamples, softwareForPurpose, selectedSoftware, applySoftwareProfile, examplesForPurpose} from '../dist/gpu-software.js';
const data = JSON.parse(await readFile(new URL('../dist/catalog.json', import.meta.url), 'utf8'));
let passed = 0;
function test(name, action) {action(); passed++; console.log('PASS ' + name);}
const req = {...initialGPURequirements(), parametersB:8, precision:'16', runtimeGB:4};
const proposal = {version:1, requirements:req, gpuId:'nvidia-l4'};
test('Six entry groups cover every supported purpose exactly once', () => {
  assert.equal(gpuPurposeGroups.length,6);
  assert.equal(new Set(gpuPurposeGroups.map(group=>group.id)).size,6);
  assert.deepEqual(gpuPurposeGroups.flatMap(group=>group.purposes).sort(),gpuPurposes.map(purpose=>purpose.id).sort());
});
test('Every task has editable workload examples without invented numeric requirements', () => {
  assert.equal(new Set(gpuWorkloadExamples.map(example=>example.id)).size,gpuWorkloadExamples.length);
  for (const purpose of gpuPurposes) assert(examplesForPurpose(purpose.id).length>=2);
  assert.deepEqual(examplesForPurpose('invalid'),[]);
});
test('Every non-language purpose has a bounded, official-source software list', () => {
  assert.equal(new Set(gpuSoftware.map(profile=>profile.id)).size,gpuSoftware.length);
  for (const purpose of gpuPurposes) assert(softwareForPurpose(purpose.id).length>=2);
  assert.equal(softwareForPurpose('invalid').length,0);
  for (const profile of gpuSoftware) {
    assert.equal(new URL(profile.source).protocol,'https:');
    assert(profile.name.length<160);
    assert(profile.purposes.every(id=>gpuPurposes.some(purpose=>purpose.id===id)));
    for (const useCase of profile.purposes) {
      const before={...req,useCase,task:'general',measuredGB:50,concurrency:20,replicas:2,condition:'used'};
      const applied=validateGPURequirements(applySoftwareProfile(before,profile.id));
      assert.equal(applied.measuredGB,null);assert.equal(applied.runtimeGB,null);
      assert.equal(applied.workloadDetails,'');assert.equal(applied.concurrency,20);assert.equal(applied.replicas,2);
      assert.equal(applied.condition,'used');assert.equal(applied.computeType,'unknown');
      assert.equal(applied.sharing,profile.defaults.sharing||'unknown');
      assert.equal(selectedSoftware(applied).id,profile.id);
      assert.equal(estimateGPUMemory(applied).targetGB,null);
      const report=gpuAdvisorReport(data,applied);
      assert.equal(report.software_profile.source,profile.source);
      assert.equal(report.software_profile.status,'application_version_license_and_hardware_unverified');
      assert.equal(before.measuredGB,50);
    }
  }
});
test('Software examples are scope-checked and custom text cannot inject evidence', () => {
  assert.throws(()=>applySoftwareProfile({...req,useCase:'video'},'horizon'));
  assert.throws(()=>applySoftwareProfile({...req,useCase:'vdi'},'unknown'));
  assert.equal(selectedSoftware({...req,useCase:'video',softwareName:'Omnissa Horizon · NVIDIA vGPU'}),null);
  assert.equal(gpuAdvisorReport(data,{...req,task:'general',softwareName:'<img src=x>'}).software_profile,null);
  assert.equal(gpuAdvisorReport(data,req).software_profile,null);
});
test('Legacy generation filters remain valid and every exact variant has capability metadata', () => {
  assert.equal(gpuCatalog.products.length,14);
  assert.equal(new Set(gpuCatalog.products.map(product=>product.id)).size,14);
  assert.equal(gpuCandidates(data,req).length,6);
  assert.equal(gpuCandidates(data,{...req,generation:'older'}).length,8);
  assert.equal(gpuCandidates(data,{...req,generation:'all'}).length,14);
  for (const product of gpuCatalog.products) {
    assert.deepEqual(Object.keys(product.capabilities).sort(),['fp64','graphics','mig','video']);
    assert(Object.values(product.capabilities).every(value=>typeof value==='boolean'));
  }
});
test('Legacy PCIe memory and power are exact, not SXM or pooled totals', () => {
  const expected = {'nvidia-t4':[16,70], 'nvidia-a10':[24,150], 'nvidia-a40':[48,300],
    'nvidia-a100-pcie-40':[40,250], 'nvidia-a100-pcie-80':[80,300],
    'nvidia-v100-pcie-16':[16,250], 'nvidia-v100-pcie-32':[32,250], 'nvidia-p40':[24,250]};
  for (const [id, [memory,watts]] of Object.entries(expected)) {
    const product=gpuCatalog.products.find(product=>product.id===id);
    assert.equal(product.memoryGB,memory);assert.equal(product.watts,watts);
    assert(product.source.startsWith('https://www.nvidia.com/')||product.source.startsWith('https://images.nvidia.com/'));
    assert.equal(product.hpeSkus.length,0);
  }
});
test('Every GPU has source-backed PCIe metadata, separate from server generations', () => {
  const gen3=['nvidia-t4','nvidia-p40','nvidia-v100-pcie-16','nvidia-v100-pcie-32'];
  const gen5=['nvidia-h100-nvl','nvidia-h200-nvl','nvidia-rtx-pro-6000-server'];
  for (const gpu of gpuCatalog.products) {
    assert.equal(gpu.pcie.generation,gen3.includes(gpu.id)?3:gen5.includes(gpu.id)?5:4);
    assert.equal(gpu.pcie.lanes,16);
    assert.equal(new URL(gpu.pcie.source).protocol,'https:');
    const report=gpuPCIeReport(gpu);
    assert.equal(report.host_verified,false);
    assert.equal(report.examples.length,3);
    assert(report.examples.every(link=>link.status==='bus_interoperability_only_host_unverified'));
  }
});
test('PCIe generation and lane negotiation never imply host qualification or VRAM pooling', () => {
  const p40=gpuCatalog.products.find(gpu=>gpu.id==='nvidia-p40');
  const a100=gpuCatalog.products.find(gpu=>gpu.id==='nvidia-a100-pcie-40');
  assert.deepEqual(gpuPCIeLink(p40,5),{generation:3,lanes:16,theoreticalGBpsPerDirection:15.75,
    status:'bus_interoperability_only_host_unverified'});
  assert.equal(gpuPCIeLink(a100,3).theoreticalGBpsPerDirection,15.75);
  assert.equal(gpuPCIeLink(a100,5).theoreticalGBpsPerDirection,31.51);
  assert.equal(gpuPCIeLink(a100,5,8).theoreticalGBpsPerDirection,15.75);
  for (const args of [[p40,9],[p40,4,0],[p40,4,3],[p40,NaN],[{pcie:{generation:4,lanes:8}},4]]) {
    assert.throws(()=>gpuPCIeLink(...args));
  }
});
test('Historical HPE host listings retain exact parts and CPU limits without creating configurations', () => {
  const requirements={...req,generation:'all',parametersB:4};
  for (const gpu of gpuCatalog.products.filter(gpu=>gpu.generation==='older')) {
    const report=gpuAdvisorReport(data,requirements,gpu.id);
    assert.equal(report.servers.length,0);
    assert(report.limitations.includes('pcieReview'));
    assert.equal(report.selected.pcie.host_verified,false);
    assert(report.source_listed_platforms.every(host=>host.configurable===false&&
      host.quantity_verified===false&&host.status==='technical_review_required'));
    assert.equal(report.source_listed_platforms.length,(gpu.hpePlatforms||[]).length);
  }
  const p40=gpuAdvisorReport(data,requirements,'nvidia-p40');
  const gen9=p40.source_listed_platforms.find(host=>host.name==='HPE ProLiant DL380 Gen9');
  assert.equal(gen9.sku,'Q0V80C');assert.equal(gen9.cpuFamily,'E5-2600v4 only');
  assert.equal(gen9.page,32);assert.equal(gen9.version,47);assert(gen9.archived);
  assert(p40.limitations.includes('p40Gen9Review'));
  assert(p40.limitations.includes('archivedPlatformReview'));
  assert(!p40.limitations.includes('hpeUnlisted'));
  assert(!p40.source_listed_platforms.some(host=>/DL360|ML350/.test(host.name)));
  const v100=gpuAdvisorReport(data,requirements,'nvidia-v100-pcie-16');
  assert.equal(v100.source_listed_platforms.length,0);
  assert(v100.limitations.includes('hpeUnlisted')); // FHHL 150W evidence does not apply to this 250W full-length card.
  const a100=gpuAdvisorReport(data,requirements,'nvidia-a100-pcie-80');
  assert(a100.limitations.includes('nonCECReview'));
  assert(a100.source_listed_platforms.every(host=>host.sku==='R9P49C'));
  assert(!a100.source_listed_platforms.some(host=>host.name==='HPE ProLiant DL380 Gen10'));
});
test('Old graphics, scientific and MIG routes use product capabilities', () => {
  const older={...req,generation:'older',task:'general',useCase:'video'};
  assert.deepEqual(gpuCandidates(data,older).map(product=>product.id).sort(),
    ['nvidia-t4','nvidia-a10','nvidia-a40','nvidia-p40'].sort());
  assert.equal(gpuCandidates(data,{...older,useCase:'hpc',computeType:'fp64'}).length,4);
  assert.deepEqual(gpuCandidates(data,{...older,useCase:'service',sharing:'mig'}).map(product=>product.id),
    ['nvidia-a100-pcie-40','nvidia-a100-pcie-80']);
  assert.throws(()=>validateGPUProposal({...proposal,gpuId:'nvidia-t4'},data));
  assert.throws(()=>validateGPUProposal({...proposal,gpuId:'nvidia-a100-pcie-40',requirements:{...older,useCase:'vdi'}},data));
});
test('Purchase condition is not stock, health or a compatibility guarantee', () => {
  for (const condition of ['any','new','used','refurbished']) {
    const requirements={...req,parametersB:4,generation:'older',condition};
    const report=gpuAdvisorReport(data,requirements,'nvidia-t4');
    assert.equal(report.selected.condition_requested,condition);
    assert.equal(report.selected.condition_verified,false);
    assert.equal(report.selected.generation,'older');
    assert(report.limitations.includes('conditionUnverified'));
    assert(report.limitations.includes('olderSoftwareReview'));
    assert(report.limitations.includes('olderHardwareReview'));
    assert(report.limitations.includes('hpePlatformReview'));
    assert(report.limitations.includes('archivedPlatformReview'));
    assert.equal(report.servers.length,0);assert.equal(report.source_listed_platforms.length,5);
    assert.equal(report.status,'technical_review_required');
    assert.equal(report.estimate.targetGB,14);
    assert(report.limitations.includes('usedHealthReview'));
    assert(report.limitations.includes('refurbishedReview'));
    assert.equal(new Set(report.limitations).size,report.limitations.length);
  }
  assert.throws(()=>validateGPURequirements({...req,condition:'certified'}));
  assert.throws(()=>validateGPURequirements({...req,generation:'Gen10'}));
});
test('Legacy language-model requirements migrate without changing estimates or server mapping', () => {
  const legacy = Object.fromEntries(Object.entries(req).filter(([key]) =>
    !['useCase','task','softwareName','workloadDetails','channels','sharing','computeType','generation','condition'].includes(key)));
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
