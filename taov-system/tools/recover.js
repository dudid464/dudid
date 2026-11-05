import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,statSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {decryptSnapshot} from '../lib/backups.js';
export function recoverToNewDirectory(backup,key,directory){
 const snapshot=decryptSnapshot(backup,key.trim());
 if(snapshot.version!==2||!Array.isArray(snapshot.records)||!Array.isArray(snapshot.accounts)||!Array.isArray(snapshot.roles)||!Array.isArray(snapshot.audit))throw Error('נדרש גיבוי יומי מלא בגרסה 2');
 const kinds=['leads','families','workers','matches','cases','tasks','documents','notifications','signatures'];
 if(snapshot.records.some(r=>typeof r.id!=='string'||!kinds.includes(r.kind)||typeof r.body!=='string'||!JSON.parse(r.body).name))throw Error('רשומות גיבוי לא תקינות');
 if(snapshot.accounts.some(a=>!/^\w[\w-]{2,39}$/.test(a.name)||!/^[a-f0-9]{32}$/.test(a.salt)||!/^[a-f0-9]{128}$/.test(a.hash)||![0,1].includes(a.disabled)))throw Error('חשבונות גיבוי לא תקינים');
 if(snapshot.roles.some(r=>!['admin','editor','viewer'].includes(r.role))||!snapshot.accounts.some(a=>!a.disabled&&snapshot.roles.some(r=>r.name===a.name&&r.role==='admin')))throw Error('אין מנהל פעיל תקין בגיבוי');
 // Refuse any existing target, preserving all existing installations and files.
 mkdirSync(directory,{mode:0o700});let db;
 try{db=new DatabaseSync(path.join(directory,'taov.sqlite'));db.exec('CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL);CREATE TABLE accounts(name TEXT PRIMARY KEY,salt TEXT,hash TEXT,disabled INTEGER NOT NULL DEFAULT 0);CREATE TABLE roles(name TEXT PRIMARY KEY,role TEXT NOT NULL);CREATE TABLE audit(id INTEGER PRIMARY KEY,at TEXT,actor TEXT,action TEXT,target TEXT);BEGIN');
 for(const r of snapshot.records)db.prepare('INSERT INTO records VALUES(?,?,?)').run(r.id,r.kind,r.body);
 for(const a of snapshot.accounts)db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(a.name,a.salt,a.hash,a.disabled);
 for(const r of snapshot.roles)db.prepare('INSERT INTO roles VALUES(?,?)').run(r.name,r.role);
 for(const e of snapshot.audit)db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(e.at,e.actor,e.action,e.target);
 db.exec('COMMIT');db.close();return {records:snapshot.records.length,users:snapshot.accounts.length};
 }catch(e){if(db){try{db.close();}catch{}}rmSync(directory,{recursive:true,force:true});throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const [file,keyFile,directory]=process.argv.slice(2);if(!file||!keyFile||!directory)throw Error('Usage: npm run recover -- backup.enc.json recovery-key.txt NEW_DIRECTORY');if(statSync(file).size>64*1024*1024)throw Error('Backup exceeds 64MB limit');const result=recoverToNewDirectory(JSON.parse(readFileSync(file,'utf8')),readFileSync(keyFile,'utf8'),directory);console.log('Recovery complete in new directory; records: '+result.records+', users: '+result.users);}
 catch(e){console.error(e.message);process.exitCode=1;}
}
