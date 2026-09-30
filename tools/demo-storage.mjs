// Run without arguments for a compact review. --write saves example JSON and BOMs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {initialConfiguration,recommend,review,exportJSON,exportCSV} from '../storage/engine.mjs';
const data=JSON.parse(readFileSync(new URL('../storage/catalog.json',import.meta.url),'utf8'));
const item=(qs,sku,quantity=1)=>({option_id:`${qs}:${sku}`,quantity});
const primary={purposes:['primary'],access:'block',workload:'virtualization',usableTB:6,annualGrowthPct:10,years:3,headroomPct:20,protocol:'fc',availability:'standard',budgetTier:'value',lifecycle:'active'};
const backup={purposes:['backup'],backupTB:10,changePct:5,retentionDays:30,fullEveryDays:7,headroomPct:20,backupWindowHours:8,rtoHours:4,offlineCopy:true,immutable:true};
const msa=initialConfiguration('msa-2060');
msa.host_protocol='fc';msa.items=[item('16615','R0Q74B'),item('16615','R0Q47A',8)];
msa.diskGroups=[{option_id:'16615:R0Q47A',disks:8,spares:0,raid:'6',location:'base'}];
const storeonce=initialConfiguration('storeonce-3760');storeonce.items=[item('14996','S4P73A'),item('14996','S4P75A')];
const tape=initialConfiguration('msl-msl2024');tape.host_protocol='fc';tape.items=[item('17271','AK379B'),item('17271','R6Q74A'),item('17271','Q2079A',24)];
const examples=[['msa-2060',msa,primary],['storeonce-3760',storeonce,backup],['msl2024',tape,{...backup,purposes:['archive'],existingLTO:8}]];
for(const [name,s,r] of examples) {
  const report=review(data,s,r,'en');
  console.log(`${name}: ${report.status}; usable ${report.capacity.usableTB??report.capacity.tape.nativeTB??'unknown'} TB; ${report.bom.length} BOM rows; ${report.findings.length} findings`);
  if(process.argv.includes('--write')) {
    const dir=new URL('../storage/examples/',import.meta.url);mkdirSync(dir,{recursive:true});
    for(const lang of ['en','fa'])writeFileSync(new URL(`${name}-${lang}.json`,dir),exportJSON(review(data,s,r,lang))+'\n','utf8');
    writeFileSync(new URL(`${name}-bom.csv`,dir),exportCSV(report),'utf8');
  }
}
const shortlist=recommend(data,primary,'en');
console.log('Primary shortlist:',shortlist.roles.primary.slice(0,5).map(x=>x.model.name).join(', '));
console.log('Primary capacity target:',shortlist.capacity.requiredTB,'TB with growth and reserve.');
console.log('Unknowns remain explicit; no configuration is marked fully qualified.');
