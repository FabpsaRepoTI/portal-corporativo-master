import {jsPDF} from 'jspdf';
import logo from '../../../logo-fabpsa.png';
import {reportDate,reportSections} from './ReportPreview';

export async function downloadReport(report){
 const logoImage=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=logo;});
 const pdf=new jsPDF({unit:'mm',format:'a4'}),navy='#152e4b',muted='#60748b',green='#087f76';
 const clean=value=>String(value??'No documentado').replace(/[\u0000-\u0008\u000b-\u001f]/g,'').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\u0020-\u00ff\n]/g,'');
 let y=44;
 const header=()=>{pdf.setFillColor(navy);pdf.rect(0,0,210,33,'F');const h=13,w=Math.min(39,h*logoImage.naturalWidth/logoImage.naturalHeight);pdf.addImage(logoImage,'PNG',16,10,w,h);pdf.setTextColor('#ffffff');pdf.setFont('helvetica','bold');pdf.setFontSize(14);pdf.text('Informe del desarrollo',64,14);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text(clean(report.folio||'FABPSA TI'),64,21);pdf.setFontSize(7);pdf.text('USO INTERNO',194,14,{align:'right'});pdf.text(reportDate(report.fechaGeneracion),194,21,{align:'right'});};
 const ensure=height=>{if(y+height>276){pdf.addPage();header();y=44;}};
 const text=(value,{size=10,color=navy,bold=false,indent=0,gap=3}={})=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);const lines=pdf.splitTextToSize(clean(value),178-indent),step=size*.43;for(const line of lines){ensure(step);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);pdf.text(line,16+indent,y);y+=step;}y+=gap;};
 header();
 text(report.ficha.titulo||'Desarrollo sin título registrado',{size:19,bold:true,gap:5});
 text(`${report.ficha.estado}  |  Responsable: ${report.ficha.responsable}`,{size:10,color:green,bold:true});
 text(`Solicitante: ${report.ficha.solicitante}`,{size:9,color:muted});
 text(`Registro: ${reportDate(report.ficha.fechaInicio)}    Conclusión: ${reportDate(report.ficha.fechaConclusion)}`,{size:9,color:muted,gap:7});
 text('LECTURA EJECUTIVA',{size:9,color:green,bold:true});
 text(report.informe.resumen,{size:11,gap:7});
 ensure(23);const metrics=[['AVANCES',report.indicadores.avances],['ETAPAS',report.indicadores.etapas],['EVIDENCIAS',report.indicadores.evidencias],['BLOQUEOS ABIERTOS',report.indicadores.bloqueosAbiertos]];
 metrics.forEach(([label,value],i)=>{const x=16+i*45;pdf.setFillColor('#f0f5f8');pdf.roundedRect(x,y,42,19,2,2,'F');pdf.setTextColor(navy);pdf.setFont('helvetica','bold');pdf.setFontSize(15);pdf.text(String(value??'—'),x+4,y+8);pdf.setTextColor(muted);pdf.setFontSize(6.5);pdf.text(label,x+4,y+15);});y+=28;
 for(const [key,title,num] of reportSections){ensure(20);pdf.setDrawColor('#dce5ed');pdf.line(16,y-3,194,y-3);text(`${num}  ${title}`,{size:12,color:green,bold:true,gap:4});for(const item of report.informe[key].length?report.informe[key]:['No documentado en los registros consultados.'])text('• '+item,{size:10,indent:2,gap:4});y+=4;}
 text('Fuente: trazabilidad registrada del desarrollo. Síntesis asistida por IA; revisar antes de distribuir. La conclusión no acredita por sí sola una liberación.',{size:8,color:muted});
 const total=pdf.getNumberOfPages();for(let page=1;page<=total;page++){pdf.setPage(page);pdf.setDrawColor('#dce5ed');pdf.line(16,282,194,282);pdf.setTextColor(muted);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text('FABPSA | Gestión de Desarrollo',16,288);pdf.text(`${page} / ${total}`,194,288,{align:'right'});}
 pdf.setProperties({title:`Informe ${report.folio||'del desarrollo'}`,author:'FABPSA TI',subject:'Resultados y trazabilidad del desarrollo'});
 pdf.save('Informe-'+String(report.folio||'desarrollo').replace(/[^a-z0-9_-]/gi,'-')+'.pdf');
}
