import {copy} from './studio-copy.js';
export function el(tag, text, cls) {
  const node=document.createElement(tag);
  if(text!==undefined && text!==null) node.textContent=String(text);
  if(cls) node.className=cls;
  return node;
}
export function button(text, action, cls='ghost') {
  const node=el('button',text,'button '+cls);
  node.type='button'; node.addEventListener('click',action); return node;
}
export function shell(lang, {onHome,onLanguage}, title, lead) {
  const t=copy[lang], app=document.getElementById('app');
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==='fa'?'rtl':'ltr';
  document.title='ARIA | '+title;
  const root=el('div',null,'shell product-shell'), header=el('header',null,'site-header');
  const brand=el('div',null,'brand'), logo=el('a',null,'brand-logo'), img=el('img');
  logo.href='https://aria-man.com/'; logo.target='_blank'; logo.rel='noreferrer';
  img.src='./ariaman-logo.png'; img.alt=t.brand; logo.append(img);
  const label=el('div',null,'brand-copy'); label.append(el('small',t.tagline),el('strong',t.brand));
  brand.append(logo,label);
  const actions=el('div',null,'header-actions');
  if(onHome)actions.append(button(t.home,onHome));
  actions.append(button(t.language,()=>onLanguage(lang==='fa'?'en':'fa'),'ghost language'));
  header.append(brand,actions);
  const main=el('main',null,'product-main'); main.id='main-content';
  const intro=el('section',null,'product-intro');
  intro.append(el('p','ENGINEERING CONFIGURATION STUDIO','eyebrow'),el('h1',title),el('p',lead,'hero-lead'));
  main.append(intro);
  const footer=el('footer',t.private,'product-footer');
  root.append(header,main,footer); app.replaceChildren(root);
  return main;
}
export function focusHeading() {
  const heading=document.querySelector('main h1');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
}
