// Fail-closed O_EXCL lock. Never steal a stale/malformed lock automatically:
// reclamation races could allow two publishers. Operator cleanup after checking PID.
import { openSync, writeSync, closeSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
export function acquireLock(path) {
  mkdirSync(dirname(path),{recursive:true});
  const info={pid:process.pid,host:hostname(),startedAt:new Date().toISOString(),token:randomUUID()};
  let fd;
  try {fd=openSync(path,'wx',0o600);}
  catch(e) {if(e.code!=='EEXIST') throw e;const err=new Error(`another run holds the lock ${path}; inspect owner before manual cleanup`);err.code='ELOCKED';throw err;}
  try {writeSync(fd,JSON.stringify(info));} finally {closeSync(fd);}
  return ()=>{
    try {const current=JSON.parse(readFileSync(path,'utf8'));if(current.token===info.token) unlinkSync(path);} catch { /* absent or taken over: do not unlink */ }
  };
}
