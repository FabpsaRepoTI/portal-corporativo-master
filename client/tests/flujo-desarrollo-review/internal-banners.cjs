const {chromium,expect}=require('@playwright/test'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('.flujo-desarrollo-review');
 const server=http.createServer((req,res)=>{const name=path.basename(req.url.split('?')[0]),file=path.join(root,name);if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':'image/svg+xml');res.end(fs.readFileSync(file));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>')}}).listen(4360);
 const browser=await chromium.launch();try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{ok:true,data:[],equipo:[],atencion:[],resumen:{},conteos:{}}}));
 for(const width of [1840,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto('http://localhost:4360/?view=gestion');
  for(const [tab,title] of [['Portafolio','Seguimiento de desarrollos internos'],['Cronograma','Fechas y compromisos del equipo'],['Documentación','Documentación del área']]){
   await page.getByRole('tab',{name:tab,exact:true}).click();
   await expect(page.locator('.gd-internal-banner strong')).toHaveText(title);
   const rects=await page.locator('.gd-internal-banner').evaluate(b=>{const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return {banner:rect(b),copy:rect(b.querySelector('.gd-reference-hero-copy')),art:rect(b.querySelector('svg'))}});
   assert.ok(rects.copy.right<=rects.art.left,`${tab} ${width}: text overlaps illustration`);
   assert.ok(rects.art.left>=rects.banner.left&&rects.art.right<=rects.banner.right&&rects.art.top>=rects.banner.top&&rects.art.bottom<=rects.banner.bottom,`${tab} ${width}: illustration outside banner`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${tab} ${width}: page overflow`);
   await page.screenshot({path:`../_docs/gestion-desarrollo-revision/encabezado-${tab.toLowerCase().replace('ó','o')}-${width}.png`,fullPage:false});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: three banners at four widths; text and artwork do not overlap or overflow.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
