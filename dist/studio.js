import {productsFor,productTypes} from './products.js';
import {copy} from './studio-copy.js';
import {el,button,shell,focusHeading} from './studio-ui.js';
const stylesheet=el('link');stylesheet.rel='stylesheet';stylesheet.href='./products.css';
document.head.append(stylesheet);
let lang='fa', revision=0;
try { lang=localStorage.getItem('aria-studio-language')==='en'?'en':'fa'; } catch {}
function setLanguage(value) {
  lang=value;
  try {localStorage.setItem('aria-studio-language',lang);}catch {}
}
function home(type=null, focus=false) {
  ++revision;
  const t=copy[lang], main=shell(lang,{
    onHome:type?()=>home(null,true):null,
    onLanguage:value=>{setLanguage(value);home(type,true);},
  },type?t.vendor:t.choose,t.lead);
  const grid=el('div',null,'product-grid');
  if(type) {
    for(const product of productsFor(type)) {
      const card=el('article',null,'product-card');
      card.append(el('p',t[type],'eyebrow'),el('h2',product.vendor),
        button(t.select,()=>openProduct(product),'primary'));
      grid.append(card);
    }
  } else {
    for(const [index,kind] of productTypes.entries()) {
      const available=productsFor(kind);
      if(!available.length)continue;
      const card=el('article',null,'product-card');
      card.dataset.productType=kind;
      for(const vendor of new Set(available.map(product=>product.vendor))) {
        card.append(el('span',vendor,'hpe-wordmark'));
      }
      card.append(el('span',String(index+1).padStart(2,'0')+' / '+kind.toUpperCase(),'product-index'),
        el('h2',t[kind]),el('p',t[kind+'Lead']),
        el('p',t.available+': '+[...new Set(available.map(p=>p.vendor))].join(' · '),'product-vendors'),
        button(t.select,()=>available.length===1?openProduct(available[0]):home(kind,true),'primary'));
      grid.append(card);
    }
  }
  main.append(grid);
  if(focus)focusHeading();
}
async function openProduct(product) {
  const token=++revision;
  const context={lang,onHome:()=>home(null,true),onLanguage:value=>{
    setLanguage(value);context.lang=value;
  },isCurrent:()=>token===revision};
  const main=shell(lang,{onHome:context.onHome,onLanguage:value=>{
    setLanguage(value);openProduct(product);
  }},copy[lang][product.type],copy[lang].loading);
  main.setAttribute('aria-busy','true');
  try {
    const module=await product.load();
    if(!context.isCurrent())return;
    await module.mount(context);
    if(context.isCurrent())focusHeading();
  } catch {
    if(!context.isCurrent())return;
    const failed=shell(lang,{onHome:context.onHome,onLanguage:value=>{
      setLanguage(value);openProduct(product);
    }},copy[lang][product.type],copy[lang].failed);
    failed.append(
      button(copy[lang].retry,()=>openProduct(product),'primary'));
  }
}
home();
