import { ArrowLeftOutlined, BulbOutlined, CheckCircleFilled, CloseCircleFilled, CodeOutlined, ExclamationCircleFilled, FileSearchOutlined, FolderOpenOutlined, PauseCircleOutlined, SearchOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Empty as AntEmpty, Input, Modal, Progress, Segmented, Tabs, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import "react-diff-view/style/index.css";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { useAction, useChange, useRunResult, useWorkbenchContext, useWrite } from "../api/hooks";
import type { AiReview, Run, RunEvent, RunResult } from "../api/types";
import { useRunEvents } from "../api/useRunEvents";
import { PageError, PageSkeleton } from "../components/States";
import { uuid7 } from "../lib/ids";
import { RUN_STATUS } from "../lib/labels";

export function RunConsole() {
  const { runId } = useParams();
  const run = useQuery({ queryKey: ["run", runId], enabled: !!runId, queryFn: () => api<{ object: Run }>(`/api/objects/run/${encodeURIComponent(runId!)}`) });
  if (run.isError) return <PageError message={run.error.message} onRetry={() => run.refetch()} />;
  if (!run.data) return <PageSkeleton />;
  return <Console run={run.data.object} />;
}

function Console({ run }: { run: Run }) {
  const change = useChange(run.change_id).data;
  const { events, state } = useRunEvents(run.id);
  const statusEvent = [...events].reverse().find(event => event.type === "status") as Extract<RunEvent, { type: "status" }> | undefined;
  const status = statusEvent?.status ?? run.status;
  const live = status === "Running" || status === "Reserved";
  const result = useRunResult(run.id, !live);
  const usage = [...events].reverse().find(event => event.type === "usage") as Extract<RunEvent, { type: "usage" }> | undefined;
  const definition = change?.execution.definitions.find(item => change.execution.tasks.some(task => task.id === run.task_id && task.definition_ref.id === item.id))?.body;
  const [tab, setTab] = useState<string>("trace");
  useEffect(() => { if (!live && result.data) setTab(current => current === "trace" ? "changes" : current); }, [live, result.data]);

  return (
    <div className="page console">
      <Link to={`/changes/${run.change_id}/execute`} className="back-link"><ArrowLeftOutlined /> {change ? <><span className="mono">{change.intent.change.display_key}</span> {change.intent.change.title}</> : "返回需求"}</Link>
      <header className="console-head">
        <div>
          <div className="eyebrow">Agent 运行 <span className="mono">#{run.id.slice(-6)}</span></div>
          <h1 className="page-title">{definition?.goal ?? "任务实施"}</h1>
        </div>
        <StopButton run={run} live={live} />
      </header>

      <Gauges status={status} live={live} startedAt={run.created_at} endedAt={result.data?.ended_at} usage={usage?.limits ? usage : undefined} result={result.data} />
      {state === "unavailable" && <Alert type="warning" showIcon title="实时进展暂时连接不上" description="运行仍以服务端记录为准，刷新页面可以重新连接。" />}
      {status === "Unknown" && <Alert type="warning" showIcon title="运行状态待核对" description="工作台重启时这次运行没有正常结束。检查分支上的修改后再决定是否重新运行。" />}

      <Tabs activeKey={tab} onChange={setTab} className="console-tabs" items={[
        { key: "trace", label: <span className="tab-label">过程{live && <span className="live-pill__dot" />}</span>, children: <Trace events={events} live={live} /> },
        { key: "changes", label: <span className="tab-label">修改{result.data && <span className="tab-label__count">{result.data.files.length}</span>}</span>, disabled: live, children: <Changes result={result.data} loading={result.isLoading} /> },
        { key: "checks", label: "检查", disabled: live, children: <Checks result={result.data} /> },
        { key: "review", label: "AI 评审", disabled: live || status !== "Succeeded", children: <Review runId={run.id} /> }
      ]} />
    </div>
  );
}

function Gauges({ status, live, startedAt, endedAt, usage, result }: { status: string; live: boolean; startedAt: string; endedAt?: string;
  usage?: Extract<RunEvent, { type: "usage" }>; result?: RunResult }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!live) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live]);
  const elapsed = Math.max(0, (endedAt ? dayjs(endedAt).valueOf() : now) - dayjs(startedAt).valueOf());
  const tokens = usage ? usage.prompt_tokens + usage.completion_tokens : result ? result.usage.prompt_tokens + result.usage.completion_tokens : 0;
  const turns = usage?.turns ?? result?.usage.turns ?? 0;
  const passed = result?.checks.filter(check => check.status === "passed").length ?? 0;
  return (
    <div className={`gauges ${live ? "is-live" : ""}`}>
      <div className={`gauge gauge--status run-${status}`}><span className="gauge__label">状态</span><span className="gauge__value"><span className="run-row__dot" />{RUN_STATUS[status] ?? status}</span></div>
      <div className="gauge"><span className="gauge__label">用时</span><span className="gauge__value mono">{formatDuration(elapsed)}</span></div>
      <div className="gauge"><span className="gauge__label">轮次</span><span className="gauge__value mono">{turns}{usage && <small>/{usage.limits.max_turns}</small>}</span>
        {usage && <Progress percent={Math.min(100, turns / usage.limits.max_turns * 100)} showInfo={false} size="small" strokeColor="var(--teal)" />}</div>
      <div className="gauge"><span className="gauge__label">Tokens</span><span className="gauge__value mono">{formatTokens(tokens)}{usage && <small>/{formatTokens(usage.limits.max_tokens)}</small>}</span>
        {usage && <Progress percent={Math.min(100, tokens / usage.limits.max_tokens * 100)} showInfo={false} size="small" strokeColor="var(--teal)" />}</div>
      <div className="gauge"><span className="gauge__label">检查</span><span className="gauge__value mono">{result ? `${passed}/${result.checks.length}` : "—"}</span></div>
    </div>
  );
}

const TOOL_ICON: Record<string, ReactNode> = { list_dir: <FolderOpenOutlined />, read_file: <FileSearchOutlined />, search_text: <SearchOutlined />, write_file: <EditOutlined />, run_check: <CodeOutlined /> };
const TOOL_LABEL: Record<string, string> = { list_dir: "查看目录", read_file: "读取", search_text: "搜索", write_file: "写入", run_check: "运行检查" };

function Trace({ events, live }: { events: RunEvent[]; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const results = useMemo(() => new Map(events.filter(event => event.type === "tool_result").map(event => [(event as Extract<RunEvent, { type: "tool_result" }>).call_id, event as Extract<RunEvent, { type: "tool_result" }>])), [events]);
  useEffect(() => { if (follow && live) end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [events.length, follow, live]);

  const shown = events.filter(event => event.type !== "tool_result" && event.type !== "usage" && event.type !== "done");
  if (!shown.length) return <div className="trace-empty">{live ? <><span className="live-pill__dot" /> 等待 Agent 的第一步…</> : "这次运行没有记录过程。"}</div>;
  return (
    <div className="trace">
      {live && <div className="trace__follow"><Segmented size="small" value={follow ? "on" : "off"} onChange={value => setFollow(value === "on")} options={[{ value: "on", label: "跟随最新" }, { value: "off", label: "停止跟随" }]} /></div>}
      {shown.map(event => {
        switch (event.type) {
          case "assistant": return <div key={event.seq} className="trace-msg"><span className="trace-msg__turn mono">{event.turn}</span><div className="trace-msg__text md"><Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown></div></div>;
          case "tool_call": {
            const outcome = results.get(event.call_id);
            return (
              <details key={event.seq} className={`trace-tool ${outcome ? outcome.ok ? "is-ok" : "is-fail" : "is-pending"}`}>
                <summary>
                  <span className="trace-tool__icon">{TOOL_ICON[event.tool] ?? <CodeOutlined />}</span>
                  <span className="trace-tool__name">{TOOL_LABEL[event.tool] ?? event.tool}</span>
                  <span className="trace-tool__arg mono">{describeArgs(event.args)}</span>
                  {!outcome && <span className="live-pill__dot" />}
                  {outcome && !outcome.ok && <CloseCircleFilled className="trace-tool__fail" />}
                </summary>
                {outcome && <pre className="trace-tool__out">{outcome.summary}</pre>}
              </details>
            );
          }
          case "check": return <div key={event.seq} className={`trace-check is-${event.status}`}>{event.status === "passed" ? <CheckCircleFilled /> : <CloseCircleFilled />}<span>检查 <b>{event.name}</b> {event.status === "passed" ? "通过" : `失败（退出码 ${event.exit_code}）`}</span><span className="muted mono">{formatDuration(event.duration_ms)}</span></div>;
          case "status": return <div key={event.seq} className={`trace-status run-${event.status}`}><span className="run-row__dot" />{RUN_STATUS[event.status]}{event.reason && <span className="muted"> · {event.reason}</span>}<span className="muted mono">{dayjs(event.at).format("HH:mm:ss")}</span></div>;
          case "error": return <div key={event.seq} className="trace-error"><ExclamationCircleFilled /> {event.message}</div>;
          default: return null;
        }
      })}
      <div ref={end} />
    </div>
  );
}

function Changes({ result, loading }: { result?: RunResult; loading: boolean }) {
  const files = useMemo(() => { try { return result?.patch ? parseDiff(result.patch) : []; } catch { return []; } }, [result?.patch]);
  const [view, setView] = useState<"unified" | "split">("unified");
  if (loading) return <PageSkeleton />;
  if (!result) return <AntEmpty description="运行结果暂不可读取" />;
  return (
    <div className="changes">
      {result.summary && <div className="surface surface--pad md summary"><div className="eyebrow">Agent 的说明</div><Markdown remarkPlugins={[remarkGfm]}>{result.summary}</Markdown></div>}
      <div className="changes__bar">
        <span className="mono muted">{result.branch} · {result.base_commit?.slice(0, 8)} → {result.head_commit?.slice(0, 8)}</span>
        <Segmented size="small" value={view} onChange={value => setView(value as "unified" | "split")} options={[{ value: "unified", label: "合并" }, { value: "split", label: "并排" }]} />
      </div>
      {result.patch_truncated && <Alert type="info" showIcon title="修改太大，只显示了前一部分" description="完整修改在上面的分支里。" />}
      {files.length === 0 && <AntEmpty description="这次运行没有修改文件" />}
      {files.map(file => {
        const path = file.type === "delete" ? file.oldPath : file.newPath;
        const stat = result.files.find(item => item.path === path);
        return (
          <section key={`${file.oldPath}-${file.newPath}`} className="diff-file">
            <header className="diff-file__head">
              <Tag bordered={false} color={file.type === "add" ? "green" : file.type === "delete" ? "red" : "blue"}>{{ add: "新增", delete: "删除", modify: "修改", rename: "重命名", copy: "复制" }[file.type]}</Tag>
              <span className="mono">{path}</span>
              {stat && <span className="diff-file__stat"><span className="diff-add">+{stat.additions}</span><span className="diff-del">−{stat.deletions}</span></span>}
            </header>
            <Diff viewType={view} diffType={file.type} hunks={file.hunks}>{hunks => hunks.map(hunk => <Hunk key={hunk.content} hunk={hunk} />)}</Diff>
          </section>
        );
      })}
    </div>
  );
}

function Checks({ result }: { result?: RunResult }) {
  if (!result) return <AntEmpty description="运行结果暂不可读取" />;
  if (!result.checks.length) return <AntEmpty description="没有配置固定检查" />;
  return (
    <div className="stack">
      {result.checks.map(check => (
        <section key={check.name} className={`check-block is-${check.status}`}>
          <header>{check.status === "passed" ? <CheckCircleFilled /> : <CloseCircleFilled />}<b>{check.name}</b><span className="mono muted">{check.command}</span><span className="mono muted">退出码 {check.exit_code} · {formatDuration(check.duration_ms)}</span></header>
          {check.output_tail && <pre>{check.output_tail}</pre>}
        </section>
      ))}
    </div>
  );
}

function Review({ runId }: { runId: string }) {
  const act = useAction();
  const configured = !!useWorkbenchContext().data?.runtime?.provider;
  const [review, setReview] = useState<AiReview | null>(null);
  const [loading, setLoading] = useState(false);
  const ask = async () => { setLoading(true); const result = await act(() => api<AiReview>(`/api/agent-runs/${runId}/ai/review`, {})); setLoading(false); if (result) setReview(result); };
  return (
    <div className="review">
      <div className="cta-strip cta-strip--flat">
        <div><b>请另一个 AI 会话看一遍这次修改</b><span>评审只是参考，不会写入项目记录。是否通过由你在“验证”中决定。</span></div>
        <Button icon={<BulbOutlined />} loading={loading} disabled={!configured} onClick={ask}>{review ? "重新评审" : "开始评审"}</Button>
      </div>
      {review && (
        <div className={`review-result verdict-${review.verdict}`}>
          <div className="review-result__head">{review.verdict === "looks_good" ? <CheckCircleFilled /> : <ExclamationCircleFilled />}<b>{review.verdict === "looks_good" ? "没有发现阻断问题" : "有需要关注的地方"}</b></div>
          <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{review.summary}</Markdown></div>
          <ul className="findings">
            {review.findings.map((finding, index) => (
              <li key={index} className={`finding sev-${finding.severity}`}>
                <Tag bordered={false} color={finding.severity === "block" ? "red" : finding.severity === "warn" ? "orange" : "default"}>{{ block: "阻断", warn: "注意", info: "提示" }[finding.severity]}</Tag>
                {finding.file && <span className="mono">{finding.file}{finding.line ? `:${finding.line}` : ""}</span>}
                <span>{finding.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StopButton({ run, live }: { run: Run; live: boolean }) {
  const write = useWrite();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!live) return null;
  const stop = async () => {
    const ok = await act(() => write.send(`/api/agent-runs/${run.id}/stop`, {
      command_id: uuid7(), requested_at: new Date().toISOString(), acting_role: "technical_owner", command_type: "CancelRun",
      target: { object_type: "run", id: run.id }, expected_revision: run.revision, payload: { reason: reason.trim() || "人工停止" }
    }, "停止运行"));
    if (ok) setOpen(false);
  };
  return <>
    <Tooltip title="停止后分支上已有的修改会保留"><Button danger icon={<PauseCircleOutlined />} onClick={() => setOpen(true)}>停止运行</Button></Tooltip>
    <Modal open={open} title="停止这次运行" okText="停止" okButtonProps={{ danger: true }} confirmLoading={write.busy} onOk={stop} onCancel={() => setOpen(false)}>
      <Input.TextArea autoSize={{ minRows: 2 }} placeholder="停止的原因（可选）" value={reason} onChange={event => setReason(event.target.value)} />
    </Modal>
  </>;
}

function describeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const value = args as Record<string, unknown>;
  const main = value.path ?? value.query ?? value.pattern ?? value.name ?? value.command;
  return typeof main === "string" ? main : JSON.stringify(args).slice(0, 120);
}
function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
function formatTokens(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value); }
