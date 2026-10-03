// NVIDIA specifications are distinct from HPE-qualified ordering parts and availability.
export const gpuCatalog = {
  version:'2026-10-03',
  products:[
    {id:'nvidia-l4', name:'NVIDIA L4', memoryGB:24, watts:72, layout:'lowProfile',
      hpeSkus:['S0K89C'], source:'https://www.nvidia.com/en-us/data-center/l4/'},
    {id:'nvidia-l40', name:'NVIDIA L40', memoryGB:48, watts:300, layout:'dualSlot',
      hpeSkus:['S0K90C'], source:'https://www.nvidia.com/en-us/data-center/l40/'},
    {id:'nvidia-l40s', name:'NVIDIA L40S', memoryGB:48, watts:350, layout:'dualSlot',
      hpeSkus:['S2L70C'], source:'https://www.nvidia.com/en-us/data-center/l40s/'},
    {id:'nvidia-h100-nvl', name:'NVIDIA H100 NVL · PCIe', memoryGB:94, watts:400, layout:'nvl',
      hpeSkus:[], source:'https://www.nvidia.com/en-us/data-center/h100/'},
    {id:'nvidia-rtx-pro-6000-server', name:'NVIDIA RTX PRO 6000 Blackwell Server Edition · Air', memoryGB:96,
      watts:600, layout:'dualSlot', hpeSkus:[],
      source:'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/'},
    {id:'nvidia-h200-nvl', name:'NVIDIA H200 NVL · PCIe', memoryGB:141, watts:600, layout:'nvl',
      hpeSkus:[], source:'https://www.nvidia.com/en-us/data-center/h200/'},
  ],
};
