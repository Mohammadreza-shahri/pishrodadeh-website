// NVIDIA specifications are distinct from HPE-qualified ordering parts and availability.
const hpeAccelerators = 'https://www.hpe.com/us/en/collaterals/collateral.c04123180.html';
const platform = (name, cpuFamily, sku) => ({name, cpuFamily, sku, source:hpeAccelerators,
  checkedAt:'2026-10-03', quote:`${name} · ${cpuFamily}`});
const hpeBlackwellPlatforms = [
  platform('HPE ProLiant DL380a Gen12', 'SRF, GNR', 'S6A73C'),
  platform('HPE ProLiant DL385 Gen11', 'Genoa, Turin', 'S6A73C'),
  platform('HPE ProLiant DL380 Gen12', 'SRF, GNR', 'S6A73C'),
  platform('HPE Edge Server e930t', 'SPR', 'S6A73C'),
  platform('HPE ProLiant EL2000 EL240 Gen12', 'GNR', 'S6A73C'),
];
export const gpuCatalog = {
  version:'2026-10-03',
  products:[
    {id:'nvidia-l4', name:'NVIDIA L4', memoryGB:24, watts:72, layout:'lowProfile',
      image:{url:'https://d2vfia6k6wrouk.cloudfront.net/productimages/f8ba18e3-c163-4bd4-b679-afd300cbce8d/images/l4_3qtr-front-left_reverse.png',
        source:'https://www.pny.com/en-eu/nvidia-l4'},
      hpeSkus:['S0K89C'], source:'https://www.nvidia.com/en-us/data-center/l4/'},
    {id:'nvidia-l40', name:'NVIDIA L40', memoryGB:48, watts:300, layout:'dualSlot',
      image:{url:'https://d2vfia6k6wrouk.cloudfront.net/productimages/7f3c20b9-b2e3-4ec9-a71c-af5c0145ae88/images/nvidia-l40-3qtr-front-left-reverse.png',
        source:'https://www.pny.com/en-eu/nvidia-l40'},
      hpeSkus:['S0K90C'], source:'https://www.nvidia.com/en-us/data-center/l40/'},
    {id:'nvidia-l40s', name:'NVIDIA L40S', memoryGB:48, watts:350, layout:'dualSlot',
      image:{url:'https://d2vfia6k6wrouk.cloudfront.net/productimages/8b56407f-6ed8-4455-9983-b05800c70eb5/images/nvidia-l40s-3qtr-front-left-reverse.png',
        source:'https://www.pny.com/en-eu/nvidia-l40s'},
      hpeSkus:['S2L70C'], source:'https://www.nvidia.com/en-us/data-center/l40s/'},
    {id:'nvidia-h100-nvl', name:'NVIDIA H100 NVL · PCIe', memoryGB:94, watts:400, layout:'nvl',
      image:{url:'https://d2vfia6k6wrouk.cloudfront.net/productimages/ab2f11c5-8853-4088-88c5-b1380098c279/images/h100-nvl-3qtr-right-reverse.png',
        source:'https://www.pny.com/en-eu/nvidia-h100-nvl'},
      hpeSkus:[], source:'https://www.nvidia.com/en-us/data-center/h100/'},
    {id:'nvidia-rtx-pro-6000-server', name:'NVIDIA RTX PRO 6000 Blackwell Server Edition · Air', memoryGB:96,
      watts:600, layout:'dualSlot', hpeSkus:['S6A73C'], hpePlatforms:hpeBlackwellPlatforms,
      image:{url:'https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/rtx-pro-6000-blackwell-server-edition/nvidia-rtx-pro-ari.jpg',
        source:'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/'},
      source:'https://www.nvidia.com/en-us/data-center/rtx-pro-6000-blackwell-server-edition/'},
    {id:'nvidia-h200-nvl', name:'NVIDIA H200 NVL · PCIe', memoryGB:141, watts:600, layout:'nvl',
      hpePlatforms:[
        platform('HPE ProLiant DL380a Gen12', 'SRF, GNR', 'S3U30C'),
        platform('HPE ProLiant DL385 Gen11', 'Genoa, Turin', 'S3U30C'),
        platform('HPE ProLiant DL380 Gen12', 'SRF, GNR', 'S3U30C'),
      ],
      image:{url:'https://d2vfia6k6wrouk.cloudfront.net/productimages/9dd6170d-325e-41cf-8258-b26b00d29347/images/h200-nvl-3qtr-right-reverse.png',
        source:'https://www.pny.com/en-eu/nvidia-h200-nvl'},
      hpeSkus:['S3U30C'], source:'https://www.nvidia.com/en-us/data-center/h200/'},
  ],
};
