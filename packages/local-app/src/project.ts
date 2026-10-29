import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CimiLoopKernel, type KernelResult,type SkillInvocationVerifierPort } from "@cimiloop/kernel";
import { SCHEMA_VERSION, type ActingRole, type InternalId, type TypedReference } from "@cimiloop/protocol/v2";
import { SqliteProjectStore } from "@cimiloop/store-sqlite";
import { readInstance, type SoloInstance } from "./instance.js";
import { locateProject, type ProjectLocation } from "./location.js";
import { LocalProjectError } from "./errors.js";
import { executeHumanAgentRunCommand,executeHumanAgentRunCommandAsync } from './agent-runtime-admission-local.js';
import { LocalEvidenceVerifier } from "./evidence-local.js";
import { LocalRunVerifier } from "./runs-local.js";
import { LocalProviderVerifier } from "./providers-local.js";
import{executeProviderCommandWithSources}from'./provider-command-sources-local.js';
import type{DedicatedAgentAccountLedger}from'@cimiloop/runtime-adapter';
import type{LocalAgentRunFamilyVerification}from'./agent-run-family-costs-local.js';
import {LocalPlanningClarificationAdmission,type LocalPlanningClarificationOptions,type MattPlanClarificationVerification} from './planning-clarification-local.js';

import type{LocalAgentParentSkillResultPort}from'./agent-parent-skill-results-local.js';
import type { MattClarificationHost } from './clarification-matt-local.js';
export interface LocalProject {
  prePlanMatt?: MattClarificationHost;
  agentParentSkillResults?:LocalAgentParentSkillResultPort;
  location: ProjectLocation;
  instance: SoloInstance;
  store: SqliteProjectStore;
  kernel: CimiLoopKernel;
}

const installedRunVerifiers = new WeakMap<SqliteProjectStore, LocalRunVerifier>();
const installedProviderVerifiers=new WeakMap<SqliteProjectStore,LocalProviderVerifier>();
const installedPlanning=new WeakMap<SqliteProjectStore,{kernel:CimiLoopKernel;admission:LocalPlanningClarificationAdmission}>();
export const needsInstalledPlanningClarification=(local:LocalProject)=>installedPlanning.get(local.store)?.admission.needsInstalledMatt===true;
// Synchronous code-only window around the existing Kernel transaction. No
// HTTP option or serialized verdict can install a historical verifier.
export function withPlanningClarificationVerification<T>(local:LocalProject,verifier:MattPlanClarificationVerification,run:()=>T):T{
 const installed=installedPlanning.get(local.store);if(!installed||installed.kernel!==local.kernel)throw new LocalProjectError('原计划准入入口发生变化','INPUT_CHANGED','conflict');
 return installed.admission.withOriginalVerifier(verifier,run);
}
export const installedProviderVerifier=(local:Pick<LocalProject,'store'>)=>installedProviderVerifiers.get(local.store);
export const installedRunVerifier = (local: Pick<LocalProject, "store">) => installedRunVerifiers.get(local.store);
// Only a trusted local launcher supplies the project directory and operator.
// HTTP requests never select a database, filesystem path or caller identity.
export const openLocalProject = (options: { projectDir?: string; prePlanMatt?:MattClarificationHost; agentRunCostAccount?:(runId:string)=>DedicatedAgentAccountLedger;planningClarification?:LocalPlanningClarificationOptions;legacyManualPlanning?:true;skillInvocationResults?:Pick<SkillInvocationVerifierPort,'readResult'>;agentRunFamilySkills?:LocalAgentRunFamilyVerification;agentParentSkillResults?:LocalAgentParentSkillResultPort } = {}): LocalProject => {
  if(options.legacyManualPlanning===true&&options.planningClarification!==undefined)throw new LocalProjectError('旧人工兼容不能同时安装正式前置澄清端口','INVALID_COMMAND','conflict');
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const location = locateProject(start, Boolean(options.projectDir) || existsSync(join(start, ".cimiloop", "instance.json")));
  if (!existsSync(location.instancePath) || !existsSync(location.databasePath)) {
    throw new LocalProjectError("当前目录尚未初始化 CimiLoop Project，请先运行 cimiloop init", "PROJECT_NOT_INITIALIZED", "not_found");
  }
  const instance = readInstance(location.instancePath);
  const store = new SqliteProjectStore(location.databasePath);
  try {
    const project = store.getProject(), actor = store.getActor(instance.actor_id);
    if (!project || project.id !== instance.project_id || project.instance_id !== instance.instance_id ||
      resolve(project.repository_path) !== location.repositoryPath || project.repository_kind !== location.repositoryKind ||
      !actor || actor.project_id !== project.id || actor.actor_type !== "human") {
      throw new LocalProjectError("本地入口与项目或 Human 身份不匹配", "CALLER_IDENTITY_MISMATCH", "forbidden");
    }
    const runVerifier=new LocalRunVerifier(location.repositoryPath,location.dataDirectory,options.agentRunCostAccount,store,options.agentRunFamilySkills,options.agentParentSkillResults);
    const skillResults=options.skillInvocationResults??options.agentRunFamilySkills;
    if(skillResults){const readResult=skillResults.readResult;if(typeof readResult!=='function')throw Error('Skill historical reader unavailable');runVerifier.agent.skills={prepare:()=>{throw Error('Skill execution unavailable');},readResult:readResult.bind(skillResults)};}
    const providerVerifier=new LocalProviderVerifier(location.repositoryPath,location.dataDirectory);
    const planning=new LocalPlanningClarificationAdmission(location.dataDirectory,options.planningClarification??{});
    const kernel = new CimiLoopKernel({ store, caller: { kind: "local_operator", project_id: project.id, actor_id: actor.id },
      evidenceVerifier: new LocalEvidenceVerifier(location.repositoryPath, location.dataDirectory),
      runVerifier,
      providerVerifier,
      ...(options.legacyManualPlanning===true?{legacyManualPlanning:true}:{planningClarification:planning}) });
    if(options.legacyManualPlanning!==true)installedPlanning.set(store,{kernel,admission:planning});
    installedRunVerifiers.set(store, runVerifier);
    installedProviderVerifiers.set(store,providerVerifier);
    return { location, instance, store, kernel,...(options.prePlanMatt?{prePlanMatt:options.prePlanMatt}:{}),...(options.agentParentSkillResults?{agentParentSkillResults:Object.freeze({forOriginal:options.agentParentSkillResults.forOriginal.bind(options.agentParentSkillResults)})}:{}) };
  } catch (error) { store.close(); throw error; }
};

export const LOCAL_COMMAND_TYPES = [
  "AssignResponsibility", "TransferChangeResponsibility", "UpdateProjectSettings",
  "CreateChange", "PauseChange", "ResumeChange", "ChangePlanning", "CreateTargetVersion", "CloseTargetVersion",
  "SubmitContractProposal", "SubmitPlanProposal", "RecordRiskAssessment", "RequestDecision", "RecordDecision",
  "ConfirmContract", "ConfirmPlan", "StartChange", "InitializePlanTasks", "CreateWorkItem", "RevokeWorkItem",
  "CaptureSourceSnapshot", "PrepareTaskEvaluation", "RecordEvidence", "EvaluateTask", "SatisfyTask",
  "EvaluateIntegration", "MarkReadyForIntegration", "PrepareRunContext", "ReserveRun", "RecordRunObservation",
  "ReconcileRun", "CancelRun", "SaveHandoff", "CheckResumption", "RecordSkillInvocationObservation", "ReconcileSkillInvocation"
] as const;

export interface LocalCommandInput {
  command_id: InternalId;
  requested_at: string;
  acting_role: ActingRole;
  command_type: typeof LOCAL_COMMAND_TYPES[number];
  target?: TypedReference;
  expected_revision?: number;
  expected_input_digest?: { algorithm: "sha256"; value: string };
  payload: unknown;
}

const localCommandRequest=(context:Pick<LocalProject,'location'|'instance'>,input:unknown)=>{
  const keys = new Set(["command_id", "requested_at", "acting_role", "command_type", "target", "expected_revision", "expected_input_digest", "payload"]);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !keys.has(key))) {
    throw new LocalProjectError("动作包含不支持的字段", "INVALID_COMMAND");
  }
  const command = input as LocalCommandInput;
  if (!(LOCAL_COMMAND_TYPES as readonly string[]).includes(command.command_type)) throw new LocalProjectError("该入口尚未支持此动作", "INVALID_COMMAND");
  // Preserve the complete request across retries. The receipt, not a browser
  // cache or a new timestamp, determines whether a command has already run.
  const request={ ...command, schema_version: SCHEMA_VERSION, correlation_id: command.command_id,
    project_id: context.instance.project_id, actor_id: context.instance.actor_id,
    source: { origin: "human_ui", producer: "cimiloop-workbench", repository_path: context.location.repositoryPath } };
  return request;
};
export const executeLocalCommand = (context: Pick<LocalProject, "location" | "instance"> & { kernel: Pick<LocalProject["kernel"], "execute">; store?:unknown }, input: unknown): KernelResult => {const request=localCommandRequest(context,input);return context.store instanceof SqliteProjectStore&&context.kernel instanceof CimiLoopKernel?executeHumanAgentRunCommand({...context,store:context.store,kernel:context.kernel},request):context.kernel.execute(request);};
export async function executeLocalCommandAsync(context:LocalProject,input:unknown,beforeCommit?:()=>void):Promise<KernelResult>{const request=localCommandRequest(context,input),verifier=installedProviderVerifier(context);return verifier&&['RecordProviderEvidence','EvaluateProvider','RegisterProviderBinding'].includes(request.command_type)?executeProviderCommandWithSources(context,verifier,request,beforeCommit):executeHumanAgentRunCommandAsync(context,request,beforeCommit);}
