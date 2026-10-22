import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { command } from './command.mjs';
import { repoPaths } from './paths.mjs';

const hasOutput=r=>!!r.structured_output?.entry&&typeof r.structured_output?.html==='string';

export function parseClaudeResponse(raw) {
  let r;
  try {r=JSON.parse(raw);} catch {throw new Error('Claude returned invalid JSON');}
  // On success `result` duplicates the structured output (game HTML), so it is only
  // read as a provider error when there is no valid structured output, and bounded.
  const ok=r.subtype==='success'&&!r.is_error&&hasOutput(r);
  const error=ok?'':String(r.result??'').slice(0,500);
  if(/(?:hit.*limit|quota|rate.?limit|resets|usage limit)/i.test(error)) throw new Error(`Claude limit: ${error.slice(0,300)}`);
  if(r.subtype!=='success'||r.is_error) throw new Error(`Claude did not finish with success: ${r.subtype}`);
  if(!r.modelUsage||!Object.keys(r.modelUsage).length) throw new Error('Claude response is missing actual modelUsage');
  if(!hasOutput(r)) throw new Error('Claude response has no structured entry/html');
  return {output:r.structured_output,modelUsage:r.modelUsage,usage:r.usage,session_id:r.session_id};
}
const text={type:'string'};
const schema={type:'object',additionalProperties:false,required:['entry','html'],properties:{
  html:text,
  entry:{type:'object',additionalProperties:false,required:['slug','title','description','mechanic','emoji','novelty'],properties:{
    slug:text,title:text,description:text,mechanic:text,emoji:text,
    novelty:{type:'object',additionalProperties:false,required:['candidates','chosen','nearest','differs_in'],properties:{
      candidates:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['name','mechanic'],properties:{name:text,mechanic:text}}},
      chosen:{type:'integer',minimum:0,maximum:2},
      nearest:{type:'array',minItems:1,items:{type:'object',additionalProperties:false,required:['id','difference'],properties:{id:text,difference:text}}},
      differs_in:{type:'array',minItems:1,items:{type:'string',enum:['control','rules','feedback','win-loss']}}
    }}
  }}
}};

export function buildPrompt({root,catalog,number,today}) {
  return `${readFileSync(join(root,'scripts/generate-game.md'),'utf8')}\n\nDATE Europe/Madrid: ${today}. Assigned next number: ${number}. Return only structured output as specified by the JSON schema. Do not assign the id or date: the parent does that.\n\nCOMPLETE EXISTING CATALOG:\n${JSON.stringify(catalog)}`;
}

function writeOutput(output,result) {
  writeFileSync(join(output,'entry.json'),JSON.stringify(result.output.entry,null,2));
  writeFileSync(join(output,'index.html'),result.output.html);
}

// Only a stamp in runStamp() format, resolving to a real directory inside .local/runs.
export function resolveSavedRun(root,stamp) {
  if(typeof stamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{6}-[a-z0-9]{1,4}$/.test(stamp)) throw new Error(`invalid run stamp: ${JSON.stringify(stamp)}`);
  const runs=repoPaths(root).runs,dir=join(runs,stamp);
  if(!existsSync(dir)) throw new Error(`saved run not found: ${stamp}`);
  if(!realpathSync(dir).startsWith(realpathSync(runs)+sep)) throw new Error(`saved run resolves outside .local/runs: ${stamp}`);
  return dir;
}

// Explicit recovery of a genuine saved Claude response (no LLM call). The saved
// prompt must equal the prompt this run would send now, so the output answers
// exactly today's catalog/number/date.
export function generateFromSaved({root,output,run,catalog,number,today,from}) {
  const prompt=buildPrompt({root,catalog,number,today});
  if(readFileSync(join(from,'prompt.txt'),'utf8')!==prompt) throw new Error(`saved prompt in ${from} does not match the current expected prompt; refusing resume`);
  const raw=readFileSync(join(from,'claude.raw.log'),'utf8');
  const result=parseClaudeResponse(raw);
  writeFileSync(join(run,'prompt.txt'),prompt);
  writeFileSync(join(run,'claude.json'),raw);
  writeOutput(output,result);
  return {modelUsage:result.modelUsage,usage:result.usage,session_id:result.session_id,recoveredFrom:from};
}

export async function generate({root,output,run,catalog,number,today}) {
  const prompt=buildPrompt({root,catalog,number,today});
  writeFileSync(join(run,'prompt.txt'),prompt);
  const raw=command('claude',['-p',prompt,'--model',process.env.MIERDI_MODEL||'opus','--effort','high','--output-format','json','--json-schema',JSON.stringify(schema),'--max-turns','4','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--disable-slash-commands','--no-session-persistence'],{cwd:output,log:join(run,'claude.raw.log'),timeout:12*60*1000});
  writeFileSync(join(run,'claude.json'),raw);
  const result=parseClaudeResponse(raw);
  writeOutput(output,result);
  return {modelUsage:result.modelUsage,usage:result.usage,session_id:result.session_id};
}
