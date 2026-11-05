import {parse} from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import {randomBytes} from 'node:crypto';
export const importFields={name:'שם',status:'סטטוס',owner:'אחראי',due:'מועד יעד',skills:'כישורים / צרכים',notes:'הערות',expectedRevenue:'הכנסה צפויה'};
const allowedKinds=['leads','families','workers','matches','cases','tasks','documents'];
const aliases={name:['שם','שם משפחה','שם לקוח','שם עובד','name'],status:['סטטוס','מצב','status'],owner:['אחראי','מטפל','owner'],due:['מועד יעד','תאריך יעד','due'],skills:['כישורים','צרכים','skills'],notes:['הערות','notes'],expectedRevenue:['הכנסה צפויה','סכום','expectedRevenue']};
function table(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.length>2001)throw Error('נדרשות כותרות ו־1–2000 שורות נתונים');
 if(!Array.isArray(rows[0])||rows[0].length>40)throw Error('מגבלת 40 עמודות');
 const headers=rows[0].map(v=>String(v??'').trim());
 if(headers.some(h=>!h||h.length>150)||new Set(headers).size!==headers.length)throw Error('כותרות חייבות להיות מלאות וייחודיות');
 const data=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>{if(r.length>headers.length)throw Error('שורה מכילה יותר עמודות מהכותרות');return headers.map((_,i)=>String(r[i]??'').trim());});
 if(!data.length)throw Error('אין שורות נתונים');
 if(data.some(r=>r.some(v=>v.length>4000)))throw Error('תא ארוך מדי (עד 4000 תווים)');
 return {headers,rows:data};
}
function checkZip(buffer){
 // Bound advertised uncompressed size before ExcelJS decompresses XLSX entries.
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('קובץ XLSX אינו ZIP תקין');
 const entries=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16);if(entries>500||entries===0)throw Error('יותר מדי רכיבי Excel');
 let pos=offset,total=0;for(let i=0;i<entries;i++){if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw Error('מבנה XLSX לא תקין');total+=buffer.readUInt32LE(pos+24);if(total>8*1024*1024)throw Error('תוכן Excel גדול מדי לאחר פתיחה');pos+=46+buffer.readUInt16LE(pos+28)+buffer.readUInt16LE(pos+30)+buffer.readUInt16LE(pos+32);}
}
export async function parseUpload({filename,data,sheet}){
 if(typeof data!=='string'||data.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('קובץ לא תקין; עד 500KB');
 const buffer=Buffer.from(data,'base64');if(buffer.length>500000)throw Error('מגבלת קובץ: 500KB');
 if(/\.csv$/i.test(filename||'')){const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);return {...table(parse(text,{bom:true,skip_empty_lines:true,relax_column_count:true,max_record_size:200000,delimiter:text.split('\n')[0].includes(';')?';':','})),sheets:[]};}
 if(!/\.xlsx$/i.test(filename||''))throw Error('נתמכים CSV UTF-8 ו־XLSX בלבד; יש להמיר XLS ישן');
 checkZip(buffer);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);const sheets=workbook.worksheets.map(s=>s.name);const ws=sheet?workbook.getWorksheet(sheet):workbook.worksheets[0];if(!ws||ws.rowCount>2001||ws.columnCount>40)throw Error('גיליון חסר או גדול מדי (2000 שורות ו־40 עמודות)');
 const rows=[];ws.eachRow({includeEmpty:true},row=>{const values=[];for(let i=1;i<=ws.columnCount;i++){const cell=row.getCell(i),value=cell.value;if(value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value))throw Error('נוסחאות אינן מיובאות; שמור ערכים בלבד בקובץ סינתטי');values.push(value instanceof Date?value.toISOString().slice(0,10):cell.text);}rows.push(values);});return {...table(rows),sheets,selectedSheet:ws.name};
}
export async function readSheets(body,{token=process.env.GOOGLE_ACCESS_TOKEN,fetcher=fetch}={}){
 if(!/^[a-zA-Z0-9_-]{20,150}$/.test(body.spreadsheetId||''))throw Error('מזהה גיליון לא תקין');
 if(!token)throw Error('חסר GOOGLE_ACCESS_TOKEN לקריאה בלבד בשרת');
 const range=String(body.range||'A1:AN2001');if(range.length>150)throw Error('טווח ארוך מדי');
 const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+body.spreadsheetId+'/values/'+encodeURIComponent(range),{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Google דחה קריאה; בדוק הרשאה, אסימון ומדיניות רשת');const result=await response.json();return result.values||[];
}
export function importRoutes({db,list,save,log,sheetFetch=fetch}){
 const sources=new Map(),plans=new Map();
 const prune=()=>{for(const map of [sources,plans])for(const [k,v] of map)if(v.expires<Date.now())map.delete(k);};
 const lookup=(map,id,session)=>{const item=map.get(id);if(!item||item.session!==session||item.expires<Date.now())throw Error('תצוגה מקדימה פגה או אינה שייכת לחיבור זה; טען מחדש');return item;};
 return async({url,req,body,session,role,send})=>{
  if(!url.pathname.startsWith('/api/import/'))return false;
  if(role!=='admin')return send(403,{error:'ייבוא דורש מנהל'});
  if(req.method!=='POST')return send(405,{error:'פעולה אינה נתמכת'});
  prune();
  if(['/api/import/file','/api/import/sheets'].includes(url.pathname)){
   if(body.synthetic!==true)return send(400,{error:'יש לאשר נתונים סינתטיים בלבד'});
   const result=url.pathname.endsWith('/file')?await parseUpload(body):{...table(await readSheets(body,{fetcher:sheetFetch})),sheets:[]};
   if(sources.size>=30)return send(429,{error:'יותר מדי תצוגות מקדימות; המתן עד לפקיעתן'});
   const id=randomBytes(20).toString('hex');sources.set(id,{...result,session,expires:Date.now()+15*60000});
   const mapping={};for(const [field,names] of Object.entries(aliases)){const h=result.headers.find(h=>names.some(n=>h.toLowerCase()===n.toLowerCase()));if(h)mapping[field]=h;}
   log(session.name,'import preview source',url.pathname.endsWith('/file')?'file':'sheets read-only');return send(200,{sourceId:id,headers:result.headers,preview:result.rows.slice(0,10),total:result.rows.length,mapping,fields:importFields,sheets:result.sheets,selectedSheet:result.selectedSheet,readOnly:true});
  }
  if(url.pathname==='/api/import/preview'){
   const source=lookup(sources,body.sourceId,session);if(!allowedKinds.includes(body.kind))throw Error('סוג רשומה אינו נתמך');
   if(!body.mapping||typeof body.mapping!=='object'||Array.isArray(body.mapping)||!body.mapping.name)throw Error('יש למפות עמודת שם');
   for(const [field,column] of Object.entries(body.mapping))if(!Object.hasOwn(importFields,field)||!source.headers.includes(column))throw Error('מיפוי עמודות לא תקין');
   const errors=[],warnings=[],records=[];const existing=new Set(list(body.kind).map(r=>r.name.trim()));const seen=new Set();
   source.rows.forEach((row,index)=>{const data={status:'חדש'};for(const [field,column] of Object.entries(body.mapping))data[field]=row[source.headers.indexOf(column)];
    if(!data.name||data.name.length>200)errors.push({row:index+2,error:'שם חסר או ארוך מדי'});
    if(data.status&&!['חדש','בטיפול','ממתין','הושלם','נסגר','בוטל'].includes(data.status))errors.push({row:index+2,error:'סטטוס לא נתמך'});
    if(data.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.due)||!Number.isFinite(Date.parse(data.due))||new Date(data.due).toISOString().slice(0,10)!==data.due))errors.push({row:index+2,error:'תאריך נדרש בפורמט YYYY-MM-DD'});
    if(data.expectedRevenue){data.expectedRevenue=Number(data.expectedRevenue.replace(/[₪,\s]/g,''));if(!Number.isFinite(data.expectedRevenue)||data.expectedRevenue<0||data.expectedRevenue>1e12)errors.push({row:index+2,error:'הכנסה צפויה לא תקינה'});}
    if(existing.has(data.name)||seen.has(data.name))warnings.push({row:index+2,warning:'שם זהה לרשומה קיימת או לשורה אחרת — לא יידרס, תיווצר רשומה חדשה'});seen.add(data.name);records.push(data);
   });
   const id=randomBytes(20).toString('hex');if(plans.size>=30)throw Error('יותר מדי תצוגות מקדימות');plans.set(id,{session,kind:body.kind,records,errors,expires:Date.now()+15*60000});
   return send(200,{planId:id,total:records.length,preview:records.slice(0,20),errors,warnings,canCommit:errors.length===0});
  }
  if(url.pathname==='/api/import/commit'){
   const plan=lookup(plans,body.planId,session);if(body.confirm!==true||body.synthetic!==true||plan.errors.length)return send(400,{error:'נדרש אישור סינתטי ותצוגה מקדימה ללא שגיאות'});
   db.exec('BEGIN');try{for(const record of plan.records)save(plan.kind,record);log(session.name,'import commit',plan.kind+':'+plan.records.length);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}plans.delete(body.planId);return send(201,{created:plan.records.length,kind:plan.kind});
  }
  return send(404,{error:'לא נמצא'});
 };
}
