import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {AgentStartLedger,digest} from '../../../packages/runtime-adapter/dist/index.js';
import {LocalSkillInvocationStartCustody,writeInstance} from '@cimiloop/local-app';
import {readHumanOriginalAgentRunInputs} from '../../../packages/local-app/src/agent-runtime-control-local.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
import {createInternalId} from '@cimiloop/protocol/v2';
import {startWorkbench,type WorkbenchServer} from '../src/server.js';
const until=async(condition:()=>boolean)=>{const deadline=Date.now()+15000;while(!condition()){if(Date.now()>deadline)throw Error('PUBLIC family UI timed out');await new Promise(done=>setTimeout(done,10));}};
// Actual CLI/HTTP/Kernel/SQLite/Host1 and original custody. No Native/model
// execution or real Skill qualification: unavailable resources stay Unknown.
let f:ReturnType<typeof createSkillInvocationProject>,server:WorkbenchServer,origin:AgentStartLedger,cookie:string,csrf:string;
let invocationId:string,leases=0;
const request=async(action='',body?:unknown)=>{
 const response=await fetch(`${server.origin}/api/agent-runs/${f.currentRun().id}${action?'/'+action:''}`,{
  headers:{Cookie:cookie,Connection:'close',...(body===undefined?{}:{Origin:server.origin,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf})},
  ...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 return{status:response.status,body:await response.json() as Record<string,any>};
};
beforeAll(async()=>{
 const root=mkdtempSync(join(tmpdir(),'cimi-family-http-'));f=createSkillInvocationProject(root);const data=dirname(f.path);
 writeInstance(join(data,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime});
 origin=AgentStartLedger.initialize(join(data,'family-host'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC Human').value});
 const custody=new LocalSkillInvocationStartCustody(root,data,origin),prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
 f.runPort.agent.skills!.prepare=(p,r,c,b,i)=>custody.bindPreparation(p,r,c,b,i,prepare(p,r,c,b,i));
 const invocation=f.reserveSkill().invocation;invocationId=invocation.id;
 const local={store:f.store,kernel:f.humanKernel,instance:{schema_version:'1.0.0' as const,instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime},location:{repositoryKind:'git' as const,repositoryPath:root,dataDirectory:data,databasePath:f.path,instancePath:join(data,'instance.json'),suggestedName:'PUBLIC family'}};
 const parent=readHumanOriginalAgentRunInputs(local,f.currentRun().id);custody.claim(f.project,invocation,parent.scope,parent.record.id,digest('PUBLIC method').value,()=>{});
 server=await startWorkbench({projectDir:root,skillRuntimeForInvocation:async()=>{leases++;return{custody,release(){}};}});
 const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});
 expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')!.split(';')[0]!;csrf=(await login.json() as {csrf:string}).csrf;
},120000);
afterAll(async()=>{await server?.close();origin?.close();f?.store.close();});
it('includes every child in parent HTTP query and keeps missing original resources Unknown',async()=>{
 const sequence=f.store.asOfEventSequence(),result=await request();expect(result.status).toBe(200);
 expect(result.body.family).toMatchObject({resources_disposed:false,completion_proven:false,costs_reconciled:false,children:[{invocation_id:invocationId,operation:{outcome:'unknown'}}]});
 expect(leases).toBe(1);expect(f.store.asOfEventSequence()).toBe(sequence);
});
it('stops and recovers through the same child service while replaying one Kernel command',async()=>{
 const command={command_id:createInternalId(),requested_at:flowTime,acting_role:'technical_owner',command_type:'CancelRun',target:{object_type:'run',id:f.currentRun().id},expected_revision:f.currentRun().revision,payload:{reason:'PUBLIC stop original family'}},sequence=f.store.asOfEventSequence(),before=leases;
 const first=await request('stop',command),replay=await request('stop',command),recover=await request('recover',{});
 for(const result of[first,replay,recover]){expect(result.status).toBe(200);expect(result.body.family.children).toHaveLength(1);expect(result.body.family.resources_disposed).toBe(false);}
 expect(first.body.command_result).toEqual(replay.body.command_result);expect(leases).toBe(before+3);
 expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().usage.pending_reconciliation).toBe(true);
});
it('collects every original child through authenticated parent HTTP without creating new business records',async()=>{
 const before=f.store.asOfEventSequence(),calls=leases,result=await request('collect',{});
 expect(result.status).toBe(200);expect(result.body.family).toMatchObject({resources_disposed:false,completion_proven:false,costs_reconciled:false,children:[{invocation_id:invocationId,operation:{outcome:'unknown'}}]});
 expect(leases).toBe(calls+1);expect(f.store.asOfEventSequence()).toBe(before);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
});
it('exposes the same complete original child set from the compiled default CLI',()=>{
 const sequence=f.store.asOfEventSequence();
 for(const action of['query-original','collect-original','cancel-original','recover-original']){
  const result=spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'run',action,f.currentRun().id,'--project-dir',f.project.repository_path,'--json'],{encoding:'utf8',windowsHide:true,timeout:30000});
  expect(result.status).toBe(1);expect(JSON.parse(result.stdout).family).toMatchObject({resources_disposed:false,children:[{invocation_id:invocationId,operation:{outcome:'unknown'}}]});
 }
 expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
},120000);
it('uses the same parent-family cancellation from the selected Skill HTTP endpoint and replays one receipt',async()=>{
 const command={command_id:createInternalId(),requested_at:flowTime,acting_role:'technical_owner',command_type:'CancelRun',target:{object_type:'run',id:f.currentRun().id},expected_revision:f.currentRun().revision,payload:{reason:'PUBLIC selected Skill stop'}},before=f.store.asOfEventSequence(),calls=leases;
 const send=async()=>{const response=await fetch(`${server.origin}/api/skill-invocations/${invocationId}/stop`,{method:'POST',headers:{Cookie:cookie,Connection:'close',Origin:server.origin,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf},body:JSON.stringify(command)});return{status:response.status,body:await response.json() as Record<string,any>};};
 const first=await send(),replay=await send();for(const result of[first,replay])expect(result).toMatchObject({status:200,body:{invocation_id:invocationId,parent_operation:{outcome:'unknown'},family:{resources_disposed:false,completion_proven:false,costs_reconciled:false,children:[{invocation_id:invocationId}]}}});
 expect(replay.body.command_result).toEqual(first.body.command_result);expect(leases).toBe(calls+2);expect(f.store.asOfEventSequence()).toBe(before+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().usage.pending_reconciliation).toBe(true);
});
