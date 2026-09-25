import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sortAttention } from "../demo/scenario";
import { renderDemo } from "./render";

describe("workbench", () => {
  it("orders Attention by New Change, Decision, Blocker, then Active Run", () => {
    const items = sortAttention([
      { id: "r", kind: "run", changeId: "C3", displayKey: "C3", title: "run", reason: "", role: "", nextAction: "", priority: 1 },
      { id: "b", kind: "blocker", changeId: "C2", displayKey: "C2", title: "block", reason: "", role: "", nextAction: "", priority: 1 },
      { id: "d", kind: "decision", changeId: "C1", displayKey: "C1", title: "dec", reason: "", role: "", nextAction: "", priority: 1 },
      { id: "c", kind: "create", changeId: "C0", displayKey: "C0", title: "create", reason: "", role: "", nextAction: "", priority: 1 }
    ]);
    expect(items.map((item) => item.kind)).toEqual(["create", "decision", "blocker", "run"]);
  });

  it("renders an Attention-first workbench that starts from creating CHG-0242", () => {
    renderDemo();
    const queue = screen.getByTestId("attention-queue");
    const items = within(queue).getAllByTestId("attention-item");
    expect(items[0]).toHaveAttribute("data-kind", "create");
    expect(items[0]).toHaveAttribute("data-change", "CHG-0242");
    expect(items.map((item) => item.getAttribute("data-kind"))).toEqual(["create", "decision", "blocker", "run"]);
    expect(screen.getByText("从一次尚未成立的 Change 开始")).toBeInTheDocument();
    expect(screen.getByTestId("decision-inbox")).not.toHaveTextContent("DEC-1042");
    expect(screen.getByTestId("change-list")).not.toHaveTextContent("CHG-0242");
    expect(screen.getByTestId("change-list")).toHaveTextContent("CHG-0235");
  });

  it("opens the create form as the first step of the main story", () => {
    renderDemo();
    fireEvent.click(screen.getAllByRole("button", { name: "创建 Change" })[0]);
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "create_change");
    expect(screen.getByDisplayValue("订单导出能力")).toBeInTheDocument();
    expect(screen.getByTestId("create-change-page")).toHaveTextContent("先建立责任边界");
  });
});
