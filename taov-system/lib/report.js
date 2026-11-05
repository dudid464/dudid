import PDFDocument from 'pdfkit';
import bidiFactory from 'bidi-js';
import {fileURLToPath} from 'node:url';
const bidi=bidiFactory();
export const localDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(date);
export function dashboard(list,date=new Date()){
 const open=r=>!['הושלם','נסגר','בוטל'].includes(r.status);
 const cases=list('cases').filter(open);
 return {asOf:date.toISOString(),timezone:'Asia/Jerusalem',openLeads:list('leads').filter(open).length,matchesInProgress:list('matches').filter(open).length,overdueTasks:list('tasks').filter(r=>open(r)&&r.due&&r.due<localDate(date)).length,expectedRevenue:cases.reduce((c,r)=>c+Math.round(Number(r.expectedRevenue||0)*100),0)/100,currency:'ILS',revenueBasis:'סכום הכנסה צפויה בתיקים פתוחים בלבד; אינו הכנסה שהתקבלה'};
}
export function reportPdf(metrics){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:50,info:{Title:'תאוב — דוח ניהולי',Author:'TAOV'}});const chunks=[];
  doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.font(fileURLToPath(new URL('../assets/DejaVuSans.ttf',import.meta.url)));
  const text=(s,size=15)=>{const reordered=bidi.getReorderedString(s,bidi.getEmbeddingLevels(s,'rtl'));doc.fontSize(size).text(reordered,{align:'right'}).moveDown();};
  text('תאוב — דוח ניהולי',25);text('נתונים סינתטיים בלבד • ללא שליחת הודעות',11);
  text('תאריך: '+new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'medium',timeStyle:'short'}).format(new Date(metrics.asOf)),11);
  text('לידים פתוחים: '+metrics.openLeads);text('התאמות בתהליך: '+metrics.matchesInProgress);text('משימות באיחור: '+metrics.overdueTasks);
  text('הכנסות צפויות: '+new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(metrics.expectedRevenue));text(metrics.revenueBasis,11);doc.end();
 });
}
