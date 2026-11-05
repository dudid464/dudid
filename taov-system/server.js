import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
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
  db.prepare('INSERT INTO accounts VALUES(?,?,?)').run('admin',salt,scryptSync(password,salt,64).toString('hex'));
  console.log('Initial admin password (store securely): '+password);
 }
 const sessions=new Map(),attempts=new Map();
 const kinds=['leads','families','workers','matches'];
 const log=(actor,action,target)=>db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(new Date().toISOString(),actor,action,target);
 const list=kind=>db.prepare('SELECT body FROM records WHERE kind=?').all(kind).map(x=>JSON.parse(x.body));
 function save(kind,data,id=randomBytes(12).toString('hex')){
  if(!data.name||typeof data.name!=='string'||data.name.length>200)throw Error('נדרש שם עד 200 תווים');
  const record={...data,id,updatedAt:new Date().toISOString()};
  db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE kind=excluded.kind').run(id,kind,JSON.stringify(record));return record;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
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
    if(!account||!timingSafeEqual(hash,Buffer.from(account.hash,'hex'))){attempts.set(ip,{count:prev.until>Date.now()?prev.count+1:1,until:Date.now()+900000});return send(401,{error:'פרטי כניסה שגויים'});}
    attempts.delete(ip);const t=randomBytes(32).toString('hex');sessions.set(t,{name:account.name,expires:Date.now()+8*3600000});
    res.setHeader('Set-Cookie',`taov=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);log(account.name,'login','');return send(200,{name:account.name});
   }
   if(!session||session.expires<Date.now()){sessions.delete(token);return send(401,{error:'נדרשת כניסה'});}
   if(url.pathname==='/api/me')return send(200,{name:session.name,role:'admin'});
   if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','taov=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
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
 return {server,db,list,save,kinds,log};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {server}=createApp();server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('TAOV listening on port '+(process.env.PORT||3000)));}
