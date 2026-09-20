#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { createInternalId, type DomainError } from "@cimiloop/protocol";
import {
  bootstrapSoloGovernance,
  createChange,
  doctor,
  initProject,
  listChanges,
  listDecisionInbox,
  pauseChange,
  requestIntentDecision,
  requestPlanDecision,
  resumeChange,
  showChange,
  showRoom,
  showTimeline,
  submitContractCandidate,
  submitDecision,
  submitPlanCandidate,
  tickScheduler,
  listWorkItems,
  showWorkItem,
  claimWorkItem,
  executeWorkItem,
  listRuns,
  showRun,
  recordArtifact,
  showArtifact,
  submitClaim,
  showClaim,
  recordEvidence,
  showEvidence,
  requestEvaluation,
  completeEvaluation,
  showEvaluation,
  createRepair,
  assessImpactCli,
  showEvidencePackage,
  registerEnvironment,
  showEnvironment,
  createReleaseCli,
  showRelease,
  requestReleaseDecisionCli,
  queueDeploymentCli,
  showDeployment,
  recordOperationResultCli,
  requestReconciliationCli,
  recordReconciliationCli,
  authorizeRecoveryCli,
  recordRecoveryCli,
  type GlobalOptions
} from "./commands.js";
import { outputError } from "./output.js";

const program = new Command();
const jsonRequested = process.argv.includes("--json");

program
  .name("cimiloop")
  .description("CimiLoop Embedded Solo Mode CLI")
  .version("0.0.0")
  .option("--json", "输出稳定 JSON")
  .option("--project-dir <path>", "显式指定 Project 目录")
  .option("--command-id <uuid>", "显式指定幂等 Command ID");

program.exitOverride();
if (jsonRequested) {
  program.configureOutput({ writeErr: () => undefined });
}

const globals = (command: Command): GlobalOptions => command.optsWithGlobals<GlobalOptions>();

program
  .command("init")
  .description("在当前 Repository 初始化 CimiLoop Project")
  .option("--name <name>", "Project 名称")
  .option("--owner-name <name>", "Project Owner 名称")
  .option("--owner-email <email>", "Project Owner 邮箱")
  .option("--yes", "确认使用提供或检测到的身份")
  .action(async (options, command) => initProject({ ...globals(command), ...options }));

const change = program.command("change").description("管理 Change");

change
  .command("create")
  .description("创建 Draft Change")
  .requiredOption("--title <title>", "Change 标题")
  .action((options, command) => createChange(options.title, globals(command)));

change
  .command("list")
  .description("列出当前 Project 的 Change")
  .action((_options, command) => listChanges(globals(command)));

change
  .command("show <id-or-key>")
  .description("查看 Change")
  .action((idOrKey, _options, command) => showChange(idOrKey, globals(command)));

change
  .command("pause <id-or-key>")
  .description("暂停 Change")
  .requiredOption("--reason <reason>", "暂停原因")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((idOrKey, options, command) => pauseChange(idOrKey, options.reason, { ...globals(command), ...options }));

change
  .command("resume <id-or-key>")
  .description("恢复 Change")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((idOrKey, options, command) => resumeChange(idOrKey, { ...globals(command), ...options }));

const governance = program.command("governance").description("治理与角色初始化");
governance
  .command("bootstrap-solo <change>")
  .description("初始化 Solo 治理角色、Assignment 与 Policy")
  .option("--expected-revision <revision>", "期望 Revision")
  .option("--intent-owner <actor-id>", "Intent Owner Actor ID")
  .option("--technical-owner <actor-id>", "Technical Owner Actor ID")
  .action((change, options, command) =>
    bootstrapSoloGovernance(change, { ...globals(command), ...options })
  );

const contract = program.command("contract").description("Contract Candidate 与 Intent Review");
contract
  .command("submit <change>")
  .description("提交 Contract Candidate")
  .requiredOption("--file <json>", "Contract JSON 文件")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    submitContractCandidate(change, options.file, { ...globals(command), ...options })
  );
contract
  .command("request-review <change>")
  .description("请求 Intent Decision")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) => requestIntentDecision(change, { ...globals(command), ...options }));

const plan = program.command("plan").description("Plan Candidate 与 Plan Review");
plan
  .command("submit <change>")
  .description("提交 Plan Candidate")
  .requiredOption("--file <json>", "Plan JSON 文件")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    submitPlanCandidate(change, options.file, { ...globals(command), ...options })
  );
plan
  .command("request-review <change>")
  .description("请求 Plan Decision")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) => requestPlanDecision(change, { ...globals(command), ...options }));

const decision = program.command("decision").description("Human Decision Inbox 与提交");
decision.command("inbox").description("列出当前 Actor 可处理的 Decision").action((_options, command) =>
  listDecisionInbox(globals(command))
);
decision
  .command("submit <request>")
  .description("提交 Human Decision")
  .requiredOption("--outcome <outcome>", "approve | request_changes | reject")
  .requiredOption("--acting-role <id>", "Acting Role ID")
  .requiredOption("--reason <text>", "决策理由")
  .option("--feedback-file <json>", "Feedback JSON 文件")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((request, options, command) =>
    submitDecision(request, {
      ...globals(command),
      ...options,
      actingRole: options.actingRole,
      outcome: options.outcome
    })
  );

program
  .command("room")
  .command("show <change>")
  .description("查看 Change Room")
  .action((change, _options, command) => showRoom(change, globals(command)));

program
  .command("timeline <change>")
  .description("查看 Change Timeline")
  .action((change, _options, command) => showTimeline(change, globals(command)));

const workItem = program.command("work-item").description("Work Item 查询与领取");
workItem.command("list <change>").description("列出 Change 的 Work Item").action((change, _options, command) =>
  listWorkItems(change, globals(command))
);
workItem.command("show <id>").description("查看 Work Item").action((id, _options, command) =>
  showWorkItem(id, globals(command))
);
workItem
  .command("claim <id>")
  .description("领取 Work Item")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((id, options, command) => claimWorkItem(id, { ...globals(command), ...options }));
workItem
  .command("execute <id>")
  .description("在授权边界内执行 Work Item")
  .requiredOption("--executable <path>", "Runtime executable")
  .action(async (id, options, command) => executeWorkItem(id, { ...globals(command), ...options }));

const runCommand = program.command("run").description("Run 查询");
runCommand.command("list <work-item>").description("列出 Work Item 的 Run").action((workItemId, _options, command) =>
  listRuns(workItemId, globals(command))
);
runCommand.command("show <id>").description("查看 Run").action((id, _options, command) => showRun(id, globals(command)));

const artifact = program.command("artifact").description("Artifact 记录与查询");
artifact
  .command("record <run>")
  .description("记录 Source Snapshot 与 Artifact")
  .requiredOption("--file <path>", "制品文件")
  .requiredOption("--summary <text>", "制品摘要")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((runId, options, command) => recordArtifact(runId, { ...globals(command), ...options }));
artifact.command("show <id>").description("查看 Artifact").action((id, _options, command) =>
  showArtifact(id, globals(command))
);

const claim = program.command("claim").description("Claim 提交与查询");
claim
  .command("submit <change>")
  .description("提交 Claim")
  .requiredOption("--key <key>", "Claim key")
  .requiredOption("--statement <text>", "Claim 陈述")
  .requiredOption("--category <category>", "Claim 类别")
  .requiredOption("--obligation <obligation>", "required | conditional | advisory")
  .requiredOption("--source <source>", "acceptance | policy | risk | plan | contract")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) => submitClaim(change, { ...globals(command), ...options }));
claim.command("show <id>").description("查看 Claim").action((id, _options, command) => showClaim(id, globals(command)));

const evidence = program.command("evidence").description("Evidence 记录、查询与 Package");
evidence
  .command("record <change>")
  .description("记录 Evidence")
  .requiredOption("--claim <id>", "Claim ID")
  .requiredOption("--stance <stance>", "Supports | Refutes | Inconclusive")
  .requiredOption("--subject-type <type>", "主体类型")
  .requiredOption("--subject-id <id>", "主体 ID")
  .requiredOption("--subject-digest <hex>", "主体 Digest")
  .requiredOption("--reference <ref>", "内容引用")
  .requiredOption("--digest <hex>", "Evidence Digest")
  .requiredOption("--producer <role>", "producer role")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    recordEvidence(change, { ...globals(command), ...options, subjectType: options.subjectType, subjectId: options.subjectId, subjectDigest: options.subjectDigest })
  );
evidence.command("show <id>").description("查看 Evidence").action((id, _options, command) =>
  showEvidence(id, globals(command))
);
evidence.command("package <change>").description("查看 Evidence Package Manifest").action((change, _options, command) =>
  showEvidencePackage(change, globals(command))
);

const evaluate = program.command("evaluate").description("独立 Evaluation");
evaluate
  .command("request <change>")
  .description("创建 Evaluation Work Item")
  .requiredOption("--artifact <id>", "Artifact ID")
  .requiredOption("--digest <hex>", "Artifact Digest")
  .option("--requirement-set <id>", "Requirement Set ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    requestEvaluation(change, { ...globals(command), ...options, requirementSet: options.requirementSet })
  );
evaluate
  .command("complete <change>")
  .description("完成 Evaluation；Kernel 重新判定 Gate")
  .requiredOption("--evaluation-id <id>", "Evaluation ID")
  .requiredOption("--artifact <id>", "Artifact ID")
  .requiredOption("--digest <hex>", "Artifact Digest")
  .requiredOption("--input-digest <hex>", "输入 Digest")
  .requiredOption("--result <result>", "提议结果，Kernel 可覆盖")
  .requiredOption("--reason <text>", "提议理由")
  .option("--requirement-set <id>", "Requirement Set ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    completeEvaluation(change, {
      ...globals(command),
      ...options,
      evaluationId: options.evaluationId,
      inputDigest: options.inputDigest,
      requirementSet: options.requirementSet
    })
  );
evaluate.command("show <id>").description("查看 Evaluation").action((id, _options, command) =>
  showEvaluation(id, globals(command))
);

program
  .command("repair")
  .command("create <change>")
  .description("为 Refutes Evidence 创建 Repair Work Item")
  .requiredOption("--failed-evidence <id>", "失败 Evidence ID")
  .requiredOption("--source-work-item <id>", "原 Work Item ID")
  .requiredOption("--artifact <id>", "失败 Artifact ID")
  .requiredOption("--task <id>", "Task ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    createRepair(change, {
      ...globals(command),
      ...options,
      failedEvidence: options.failedEvidence,
      sourceWorkItem: options.sourceWorkItem
    })
  );

program
  .command("impact")
  .command("assess <change>")
  .description("记录精确失效传播")
  .requiredOption("--trigger <trigger>", "artifact | contract | environment | policy | context")
  .requiredOption("--subject-type <type>", "主体类型")
  .requiredOption("--subject-id <id>", "主体 ID")
  .requiredOption("--rule <rule>", "影响规则")
  .requiredOption("--old-digest <hex>", "旧 Digest")
  .requiredOption("--new-digest <hex>", "新 Digest")
  .requiredOption("--affected <id>", "受影响 Evidence ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    assessImpactCli(change, {
      ...globals(command),
      ...options,
      subjectType: options.subjectType,
      subjectId: options.subjectId,
      oldDigest: options.oldDigest,
      newDigest: options.newDigest
    })
  );

const environment = program.command("environment").description("登记与查询 Environment");
environment
  .command("register <change>")
  .description("登记 Test 或 Production Environment")
  .requiredOption("--key <key>", "Environment key")
  .requiredOption("--kind <kind>", "test | production")
  .requiredOption("--name <name>", "显示名称")
  .requiredOption("--adapter <ref>", "Adapter 引用")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) => registerEnvironment(change, { ...globals(command), ...options }));
environment.command("show <id>").description("查看 Environment").action((id, _options, command) =>
  showEnvironment(id, globals(command))
);

const release = program.command("release").description("创建与推进 Release");
release
  .command("create <change>")
  .description("创建 Test 或 Production Release")
  .requiredOption("--kind <kind>", "test | production")
  .requiredOption("--artifact <id>", "Artifact ID")
  .requiredOption("--digest <hex>", "Artifact Digest")
  .requiredOption("--environment <id>", "Environment ID")
  .requiredOption("--scope <csv>", "范围内目标，逗号分隔")
  .requiredOption("--window-start <iso>", "窗口开始")
  .requiredOption("--window-end <iso>", "窗口结束")
  .requiredOption("--recovery-file <path>", "Recovery Strategy Draft JSON")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) =>
    createReleaseCli(change, {
      ...globals(command),
      ...options,
      windowStart: options.windowStart,
      windowEnd: options.windowEnd,
      recoveryFile: options.recoveryFile
    })
  );
release.command("show <id>").description("查看 Release").action((id, _options, command) =>
  showRelease(id, globals(command))
);
release
  .command("request-review <id>")
  .description("请求 Production Release Decision")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((id, options, command) => requestReleaseDecisionCli(id, { ...globals(command), ...options }));
release
  .command("queue <id>")
  .description("排队 Deployment 或下一步外部操作")
  .requiredOption("--environment <id>", "Environment ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((id, options, command) => queueDeploymentCli(id, { ...globals(command), ...options }));
release
  .command("authorize-recovery <id>")
  .description("授权 Production Recovery")
  .requiredOption("--strategy <id>", "Recovery Strategy ID")
  .requiredOption("--source-deployment <id>", "失败 Deployment ID")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((id, options, command) =>
    authorizeRecoveryCli(id, { ...globals(command), ...options, sourceDeployment: options.sourceDeployment })
  );

const deployment = program.command("deployment").description("Deployment、核对与 Recovery 结果");
deployment.command("show <id>").description("查看 Deployment").action((id, _options, command) =>
  showDeployment(id, globals(command))
);
deployment
  .command("record-result <operation>")
  .description("记录外部操作结果")
  .requiredOption("--key <key>", "Operation key")
  .requiredOption("--state <state>", "pending | unknown | succeeded | failed | not_found")
  .requiredOption("--log-reference <ref>", "日志引用")
  .requiredOption("--log-digest <hex>", "日志 Digest")
  .requiredOption("--summary <text>", "结果摘要")
  .option("--actual-digest <hex>", "实际 Artifact Digest")
  .option("--health <health>", "healthy | unhealthy | unknown")
  .option("--core-path <path>", "pass | fail | unknown")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((operation, options, command) =>
    recordOperationResultCli(operation, {
      ...globals(command),
      ...options,
      logReference: options.logReference,
      logDigest: options.logDigest,
      actualDigest: options.actualDigest,
      corePath: options.corePath
    })
  );
deployment
  .command("reconcile-request <operation>")
  .description("请求核对未知外部结果")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((operation, options, command) => requestReconciliationCli(operation, { ...globals(command), ...options }));
deployment
  .command("reconcile-record <operation>")
  .description("记录核对结论")
  .requiredOption("--conclusion <conclusion>", "核对结论")
  .requiredOption("--summary <text>", "核对摘要")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((operation, options, command) => recordReconciliationCli(operation, { ...globals(command), ...options }));
deployment
  .command("record-recovery <execution>")
  .description("记录 Recovery 执行结果")
  .requiredOption("--status <status>", "verified | failed | require_human | authorized")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((execution, options, command) => recordRecoveryCli(execution, { ...globals(command), ...options }));

program
  .command("scheduler")
  .command("tick <change>")
  .description("为 ready Task 创建 Execution Work Item")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((change, options, command) => tickScheduler(change, { ...globals(command), ...options }));

program
  .command("doctor")
  .description("检查当前 Project 本地状态")
  .action((_options, command) => doctor(globals(command)));

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
  } else if (jsonRequested) {
    const argumentFailure = error instanceof CommanderError;
    const domainError: DomainError = {
      code: argumentFailure ? "CLI_ARGUMENT_INVALID" : "CLI_EXECUTION_FAILED",
      message: argumentFailure
        ? error instanceof Error
          ? error.message
          : "命令参数无效"
        : "CLI 执行失败",
      category: argumentFailure ? "validation" : "internal",
      retryable: false,
      details: argumentFailure ? { commander_code: error.code } : {},
      correlation_id: createInternalId()
    };
    outputError(domainError, true);
  } else if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`错误：${message}\n`);
  process.exitCode = 1;
  }
}
