export const pcieEvidence = {
  source:'https://pcisig.com/sites/default/files/files/PCIe_Specification_Webinar_Rev%206_FINAL_0.pdf',
  page:4,
  quote:'Doubles data rate with full backward compatibility every three years over seven generations',
};

export function gpuPCIeLink(gpu, slotGeneration, slotLanes = 16) {
  if (!gpu?.pcie || ![3,4,5].includes(gpu.pcie.generation) || gpu.pcie.lanes !== 16 ||
      ![3,4,5].includes(slotGeneration) || ![1,2,4,8,16].includes(slotLanes)) {
    throw Error('Invalid GPU PCIe link parameters');
  }
  const generation = Math.min(gpu.pcie.generation, slotGeneration);
  const lanes = Math.min(gpu.pcie.lanes, slotLanes);
  return {generation, lanes,
    theoreticalGBpsPerDirection:Math.round(8 * 2 ** (generation - 3) * 128 / 130 * lanes / 8 * 100) / 100,
    status:'bus_interoperability_only_host_unverified'};
}

export function gpuPCIeReport(gpu) {
  return {interface:{...gpu.pcie}, host_verified:false, source:pcieEvidence.source,
    examples:[3,4,5].map(slotGeneration => ({slot_generation:slotGeneration,
      ...gpuPCIeLink(gpu, slotGeneration)}))};
}
