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
