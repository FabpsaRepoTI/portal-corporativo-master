const connectors = new Set(['de','del','la','las','el','los','y','en','para','con','a','al']);
const acronyms = new Set(['CEDIS','IAFSA','DNP','PMP','O.C.E','PPR','ERP','API','TI','SGC','GMOS']);
export function projectTitle(value) {
 return String(value || '').trim().split(/\s+/).map((word,index)=>{
  if(acronyms.has(word.toUpperCase())) return word.toUpperCase();
  if(/^PPR[´'’]s$/i.test(word)) return 'PPR´s';
  const lower=word.toLocaleLowerCase('es');
  return index && connectors.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase('es')+lower.slice(1);
 }).join(' ');
}
