// Each product supplies a lazy mount({lang, onHome, onLanguage, isCurrent}) adapter.
// Only ship vendors with a working catalog and flow.
export const productTypes = ['servers', 'storage', 'gpu'];
export const products = [
  {id:'hpe-servers', type:'servers', vendor:'HPE', load:()=>import('./app.js')},
  {id:'hpe-storage', type:'storage', vendor:'HPE', load:()=>import('./storage-ui.js')},
  {id:'nvidia-gpu', type:'gpu', vendor:'NVIDIA', load:()=>import('./gpu-ui.js')},
];
export const productsFor = type => products.filter(product => product.type === type);
