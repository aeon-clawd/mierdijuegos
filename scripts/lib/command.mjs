import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export function command(bin,args,{cwd,log,timeout=120000,env=process.env}={}) {
  const res=spawnSync(bin,args,{cwd,env,encoding:'utf8',timeout,killSignal:'SIGKILL',maxBuffer:4*1024*1024});
  if(log) writeFileSync(log,`${res.stdout||''}\n${res.stderr||''}`);
  if(res.error || res.status!==0) throw new Error(`${bin} failed (${res.error?.message||res.status}): ${(res.stderr||res.stdout||'').slice(-1500)}`);
  return res.stdout||'';
}
