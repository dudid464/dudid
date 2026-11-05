import http from 'node:http';
import {dashboard,reportPdf} from './lib/report.js';
import {userManagement} from './lib/users.js';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export function createApp({directory=process.env.DATA_DIR||path.join(root,'data'),password=process.env.ADMIN_PASSWORD}={}){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const db=new DatabaseSync(path.join(directory,'taov.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS accounts(name TEXT PRIMARY KEY,salt TEXT,hash TEXT); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT, actor TEXT, action TEXT, target TEXT)');
 if(!db.prepare('SELECT name FROM accounts').get()){
  password ||= randomBytes(18).toString('base64url');
  const salt=randomBytes(16).toString('hex');
  db.prepare('INSERT INTO accounts(name,salt,hash) VALUES(?,?,?)').run('admin',salt,scryptSync(password,salt,64).toString('hex'));
  console.log('Initial admin password (store securely): '+password);
 }
 const sessions=new Map(),attempts=new Map();
 const kinds=['leads','families','workers','matches','cases','tasks','documents','notifications'];
 db.exec("CREATE TABLE IF NOT EXISTS roles(name TEXT PRIMARY KEY, role TEXT NOT NULL)");
 db.prepare("INSERT OR IGNORE INTO roles VALUES('admin','admin')").run();
 const roleOf=name=>db.prepare('SELECT role FROM roles WHERE name=?').get(name)?.role||'viewer';
 const scan=()=>{let count=0;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date());for(const kind of ['cases','tasks'])for(const r of list(kind)){if(r.due&&r.due<today&&r.status!=='הושלם'){const key=kind+':'+r.id;if(!list('notifications').some(n=>n.source===key&&n.status!=='הושלם')){save('notifications',{name:'איחור: '+r.name,status:'סימולציה',source:key,notes:'טיוטת WhatsApp בלבד — לא נשלחה הודעה'});count++;}}}return count;};
 const log=(actor,action,target)=>db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(new Date().toISOString(),actor,action,target);
 const handleUsers=userManagement(db,sessions,log);
 const list=kind=>db.prepare('SELECT body FROM records WHERE kind=?').all(kind).map(x=>JSON.parse(x.body));
 function save(kind,data,id=randomBytes(12).toString('hex')){
  if(!data||Array.isArray(data)||!data.name||typeof data.name!=='string'||data.name.length>200)throw Error('נדרש שם עד 200 תווים');
  for(const [field,target] of [['familyId','families'],['workerId','workers'],['caseId','cases']])if(data[field]&&!db.prepare('SELECT id FROM records WHERE id=? AND kind=?').get(data[field],target))throw Error('קישור לרשומה שאינה קיימת: '+field);
  if(data.attachment&&(kind!=='documents'||typeof data.attachment.name!=='string'||typeof data.attachment.data!=='string'||data.attachment.data.length>540000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.attachment.data)))throw Error('מסמך לא תקין או גדול מדי');
  if(data.expectedRevenue!==undefined&&(!Number.isFinite(Number(data.expectedRevenue))||Number(data.expectedRevenue)<0||Number(data.expectedRevenue)>1e12))throw Error('הכנסה צפויה חייבת להיות מספר חיובי או אפס');
  const record={...data,id,updatedAt:new Date().toISOString()};
  db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE kind=excluded.kind').run(id,kind,JSON.stringify(record));return record;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));return true;};
  try{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/')){
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    const f=files[url.pathname];if(!f)return send(404,{error:'לא נמצא'});
    res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html; charset=utf-8');return res.end(readFileSync(path.join(root,'public',f)));
   }
   let body={};
   if(['POST','PUT','PATCH'].includes(req.method)){
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return send(403,{error:'מקור בקשה אינו מורשה'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
    let raw='';for await(const c of req){raw+=c;if(raw.length>1024*1024)return send(413,{error:'בקשה גדולה מדי'});}body=JSON.parse(raw||'{}');
   }
   const token=/taov=([^;]+)/.exec(req.headers.cookie||'')?.[1];const session=sessions.get(token);
   if(url.pathname==='/api/login'&&req.method==='POST'){
    const ip=req.socket.remoteAddress, prev=attempts.get(ip)||{count:0,until:0};
    if(prev.until>Date.now()&&prev.count>=10)return send(429,{error:'נסיונות רבים מדי; המתן 15 דקות'});
    const account=db.prepare('SELECT * FROM accounts WHERE name=?').get(String(body.username||''));
    const hash=scryptSync(String(body.password||''),account?.salt||'dummy',64);
    if(!account||account.disabled||!timingSafeEqual(hash,Buffer.from(account.hash,'hex'))){attempts.set(ip,{count:prev.until>Date.now()?prev.count+1:1,until:Date.now()+900000});return send(401,{error:'פרטי כניסה שגויים'});}
    attempts.delete(ip);const t=randomBytes(32).toString('hex');sessions.set(t,{name:account.name,expires:Date.now()+8*3600000});
    res.setHeader('Set-Cookie',`taov=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);log(account.name,'login','');return send(200,{name:account.name});
   }
   if(!session||session.expires<Date.now()||db.prepare('SELECT disabled FROM accounts WHERE name=?').get(session.name)?.disabled){sessions.delete(token);return send(401,{error:'נדרשת כניסה'});}
   const role=roleOf(session.name);
   if(url.pathname==='/api/me')return send(200,{name:session.name,role});
   if(req.method!=='GET'&&role==='viewer'&&!['/api/logout','/api/password'].includes(url.pathname))return send(403,{error:'הרשאת צפייה בלבד'});
   if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','taov=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
   if(await handleUsers({url,req,body,session,role,send}))return;
   if(url.pathname==='/api/history'&&req.method==='GET'){if(role!=='admin')return send(403,{error:'נדרש מנהל'});return send(200,db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 500').all());}
   if(url.pathname==='/api/dashboard'&&req.method==='GET')return send(200,dashboard(list));
   if(url.pathname==='/api/report.pdf'&&req.method==='GET'){
    const pdf=await reportPdf(dashboard(list));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="taov-report.pdf"'});return res.end(pdf);
   }
   if(url.pathname==='/api/report'&&req.method==='GET')return send(200,{generatedAt:new Date().toISOString(),counts:Object.fromEntries(kinds.map(k=>[k,list(k).length])),openTasks:list('tasks').filter(r=>r.status!=='הושלם').length,overdue:list('tasks').filter(r=>r.status!=='הושלם'&&r.due&&r.due<new Date().toISOString().slice(0,10)).length,simulation:true});
   if(url.pathname==='/api/control'&&req.method==='POST'){const created=scan();log(session.name,'control',String(created));return send(200,{created,simulation:true});}
   if(url.pathname==='/api/suggestions'&&req.method==='GET'){
    const suggestions=[];for(const f of list('families'))for(const w of list('workers')){const needs=(f.skills||'').split(',').map(s=>s.trim()).filter(Boolean),skills=(w.skills||'').split(',').map(s=>s.trim());const common=needs.filter(n=>skills.includes(n));if(common.length)suggestions.push({familyId:f.id,workerId:w.id,name:f.name+' ↔ '+w.name,score:Math.round(common.length/needs.length*100),skills:common.join(', '),status:'ממתין',notes:'הצעה לפי כישורים בלבד; נדרשת בדיקה אנושית'});}return send(200,suggestions.sort((a,b)=>b.score-a.score));
   }
   if(url.pathname==='/api/assistant'&&req.method==='POST'){
    const q=String(body.query||'').trim().slice(0,500);if(!q)return send(400,{error:'יש להזין שאלה'});
    const mappings={'לידים':'leads','משפחות':'families','עובדים':'workers','תיקים':'cases','משימות':'tasks','מסמכים':'documents'};
    const scope=Object.entries(mappings).find(([k])=>q.includes(k))?.[1];let results=(scope?[scope]:kinds).flatMap(k=>list(k).map(r=>({...r,kind:k})));
    if(/פתוח|פתוחות|פתוחים/.test(q))results=results.filter(r=>r.status!=='הושלם');
    if(/איחור|באיחור/.test(q))results=results.filter(r=>r.due&&r.due<new Date().toISOString().slice(0,10)&&r.status!=='הושלם');
    const terms=q.split(/\s+/).filter(t=>t.length>1&&!['הצג','הצגי','מצא','חפש','את','כל','כמה','יש','פתוחים','פתוחות','פתוח','באיחור',...Object.keys(mappings)].includes(t));
    if(terms.length)results=results.filter(r=>terms.every(t=>JSON.stringify(r).includes(t)));
    return send(200,{explanation:'עוזר מקומי מבוסס כללים: חיפוש לפי מילים, סוג רשומה, פתוחים ואיחורים. אינו מודל שפה.',count:results.length,results:results.slice(0,100)});
   }
   if(url.pathname==='/api/sheets/read'&&req.method==='POST'){
    if(role!=='admin')return send(403,{error:'נדרש מנהל'});
    if(!/^[a-zA-Z0-9_-]{20,150}$/.test(body.spreadsheetId||''))return send(400,{error:'מזהה גיליון לא תקין'});
    if(!process.env.GOOGLE_ACCESS_TOKEN)return send(409,{error:'חסר GOOGLE_ACCESS_TOKEN לקריאה בלבד; יש להגדיר בשרת, לא בדפדפן'});
    const range=String(body.range||'A1:Z100').slice(0,100);
    const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+body.spreadsheetId+'/values/'+encodeURIComponent(range),{headers:{Authorization:'Bearer '+process.env.GOOGLE_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
    if(!response.ok)return send(502,{error:'Google דחה את הקריאה; בדוק הרשאה, תוקף אסימון ומדיניות רשת'});
    const result=await response.json();log(session.name,'sheets read',body.spreadsheetId);return send(200,{values:result.values||[],readOnly:true});
   }
   if(url.pathname==='/api/backup'&&req.method==='POST'){
    if(role!=='admin')return send(403,{error:'נדרש מנהל'});
    if(typeof body.passphrase!=='string'||body.passphrase.length<12)return send(400,{error:'סיסמת גיבוי: לפחות 12 תווים'});
    const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(body.passphrase,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
    const data=JSON.stringify({version:1,records:db.prepare('SELECT * FROM records').all(),audit:db.prepare('SELECT * FROM audit').all()});
    const ciphertext=Buffer.concat([cipher.update(data,'utf8'),cipher.final()]);log(session.name,'backup','encrypted');return send(200,{version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
   }
   if(url.pathname==='/api/restore'&&req.method==='POST'){
    if(role!=='admin')return send(403,{error:'נדרש מנהל'});
    if(body.confirm!=='RESTORE')return send(400,{error:'נדרש אישור שחזור מפורש'});
    let data;try{const b=body.backup;if(b.version!==1)throw Error();const key=scryptSync(String(body.passphrase),Buffer.from(b.salt,'base64'),32),dec=createDecipheriv('aes-256-gcm',key,Buffer.from(b.iv,'base64'));dec.setAuthTag(Buffer.from(b.tag,'base64'));data=JSON.parse(Buffer.concat([dec.update(Buffer.from(b.ciphertext,'base64')),dec.final()]).toString());if(data.version!==1||!Array.isArray(data.records)||data.records.some(r=>!kinds.includes(r.kind)||typeof r.id!=='string'||!JSON.parse(r.body).name))throw Error();}catch{return send(400,{error:'גיבוי לא תקין או סיסמה שגויה'});}
    db.exec('BEGIN');try{for(const r of data.records)db.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?)').run(r.id,r.kind,r.body);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}log(session.name,'restore','merge only; existing preserved');return send(200,{ok:true,mode:'merge-preserve-existing'});
   }
   const parts=url.pathname.split('/').filter(Boolean),kind=parts[1],id=parts[2];
   if(kinds.includes(kind)){
    if(req.method==='GET')return send(200,list(kind));
    if(req.method==='POST'||req.method==='PUT'){
     if(req.method==='PUT'&&!db.prepare('SELECT id FROM records WHERE kind=? AND id=?').get(kind,id))return send(404,{error:'לא נמצא'});
     const r=save(kind,body,req.method==='PUT'?id:undefined);log(session.name,req.method,kind+':'+r.id);return send(200,r);
    }
   }
   return send(404,{error:'לא נמצא'});
  }catch(e){send(400,{error:e instanceof SyntaxError?'JSON לא תקין':e.message});}
 });
 const timer=setInterval(()=>{try{scan();}catch(e){console.error('Automatic control failed');}},60000);timer.unref();server.on('close',()=>clearInterval(timer));
 return {server,db,list,save,kinds,log};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {server}=createApp();server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('TAOV listening on port '+(process.env.PORT||3000)));}
