#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { createInternalId, type DomainError } from "@cimiloop/protocol";
import {
  createChange,
  doctor,
  initProject,
  listChanges,
  pauseChange,
  resumeChange,
  showChange,
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
