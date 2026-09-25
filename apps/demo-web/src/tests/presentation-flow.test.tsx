import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SCENE_ORDER } from "../demo/scenario";
import { renderDemo } from "./render";

describe("presenter mode", () => {
  it("walks through all 9 scenes in order", () => {
    renderDemo();
    fireEvent.click(screen.getByTestId("presenter-toggle"));
    expect(screen.getByTestId("presenter-progress")).toHaveTextContent("1/9 Workbench");

    for (let index = 1; index < SCENE_ORDER.length; index += 1) {
      fireEvent.click(screen.getByTestId("presenter-next"));
      expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", SCENE_ORDER[index]);
      expect(screen.getByTestId("presenter-progress")).toHaveTextContent(`${index + 1}/9`);
    }

    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "delivery_closed");
    expect(screen.getByTestId("lifecycle-timeline")).toHaveTextContent("关闭");
  });

  it("supports keyboard next, previous and reset", () => {
    renderDemo({ scene: "contract_decision" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "agent_running");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "contract_decision");
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "workbench");
  });

  it("jumps directly to an arbitrary scene and opens the matching page", () => {
    renderDemo();
    fireEvent.click(screen.getByTestId("presenter-toggle"));
    fireEvent.change(screen.getByLabelText("选择演示场景"), { target: { value: "evaluation_failed" } });
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "evaluation_failed");
    expect(screen.getByTestId("change-room")).toBeInTheDocument();
    expect(screen.getByTestId("claim-CLM-02")).toHaveAttribute("data-status", "Insufficient");
  });
});
