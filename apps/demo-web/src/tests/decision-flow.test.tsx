import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARTIFACT_DIGEST, ARTIFACT_ID, PROD_ENV } from "../demo/scenario";
import { renderDemo } from "./render";

describe("decision, evidence and delivery flow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Contract Decision with exact version and acting role", () => {
    renderDemo({ scene: "contract_decision" });
    const panel = screen.getByTestId("decision-panel");
    expect(panel).toHaveTextContent("DEC-1042");
    expect(panel).toHaveTextContent("contract-v1");
    expect(panel).toHaveTextContent("Technical Owner");
    expect(panel).toHaveTextContent("建议");
  });

  it("completes the agent run into evaluation_failed and keeps CLM-02 insufficient", () => {
    vi.useFakeTimers();
    renderDemo({ scene: "agent_running" });
    fireEvent.click(screen.getByTestId("primary-action"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "evaluation_failed");
    const claim = screen.getByTestId("claim-CLM-02");
    expect(claim).toHaveAttribute("data-status", "Insufficient");
    expect(screen.getByTestId("clm-02-gap")).toHaveTextContent("没有独立的权限反例测试");
    expect(screen.getByTestId("clm-02-gap")).toHaveTextContent("NEED_MORE_EVIDENCE");
  });

  it("marks CLM-02 satisfied after the repair work item completes", () => {
    vi.useFakeTimers();
    renderDemo({ scene: "evaluation_failed" });
    fireEvent.click(screen.getByTestId("primary-action"));
    expect(screen.getByTestId("current-focus")).toHaveTextContent("WI-8820");
    fireEvent.click(screen.getByTestId("primary-action"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "repair_verified");
    expect(screen.getByTestId("claim-CLM-02")).toHaveAttribute("data-status", "Satisfied");
    expect(screen.getByTestId("evidence-matrix")).toHaveTextContent("EVD-2207");
    expect(screen.getByTestId("evidence-matrix")).toHaveTextContent("权限反例测试通过");
  });

  it("binds the release decision to artifact, digest and environment", () => {
    renderDemo({ scene: "release_decision" });
    const panel = screen.getByTestId("decision-panel");
    expect(panel).toHaveTextContent(ARTIFACT_ID);
    expect(panel).toHaveTextContent(ARTIFACT_DIGEST);
    expect(panel).toHaveTextContent(PROD_ENV);
    expect(panel).toHaveTextContent("Release Owner");
    expect(screen.getByTestId("release-card")).toHaveTextContent(ARTIFACT_DIGEST);
  });

  it("records verification and closure on the lifecycle timeline after deployment", () => {
    vi.useFakeTimers();
    renderDemo({ scene: "release_decision" });
    fireEvent.click(screen.getByTestId("decision-approve"));
    expect(screen.getByTestId("toast-event")).toHaveTextContent("DEC-1108");
    expect(screen.getByTestId("toast-event")).toHaveTextContent("ALLOW");
    fireEvent.click(screen.getByTestId("primary-action"));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "delivery_closed");
    const timeline = screen.getByTestId("lifecycle-timeline");
    expect(timeline).toHaveTextContent("发布验证");
    expect(timeline).toHaveTextContent("关闭");
    expect(timeline).toHaveTextContent("Digest matched");
    fireEvent.click(screen.getByRole("tab", { name: "Delivery" }));
    expect(screen.getByTestId("deployment-card")).toHaveTextContent("Health check passed");
    expect(screen.getByTestId("deployment-card")).toHaveTextContent("Core path passed");
  });

  it("resets the demo to the fixed initial workbench", () => {
    renderDemo({ scene: "delivery_closed" });
    fireEvent.click(screen.getByTestId("presenter-toggle"));
    fireEvent.click(screen.getByTestId("reset-demo"));
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "workbench");
    expect(screen.getByTestId("workbench-page")).toBeInTheDocument();
    expect(within(screen.getByTestId("attention-queue")).getAllByTestId("attention-item")[0]).toHaveAttribute(
      "data-change",
      "CHG-0242"
    );
  });
});
