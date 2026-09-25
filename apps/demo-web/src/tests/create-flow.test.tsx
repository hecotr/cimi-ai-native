import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderDemo } from "./render";

describe("create-to-close path", () => {
  it("creates CHG-0242 as Draft and then clarifies into a contract decision", () => {
    renderDemo();
    fireEvent.click(screen.getAllByRole("button", { name: "创建 Change" })[0]);
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "create_change");

    fireEvent.click(screen.getByTestId("create-change-submit"));
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "draft_clarify");
    expect(screen.getByTestId("change-room")).toHaveTextContent("CHG-0242");
    expect(screen.getByTestId("change-room")).toHaveTextContent("Draft");
    expect(screen.getByTestId("current-focus")).toHaveTextContent("开始澄清");

    fireEvent.click(screen.getByTestId("primary-action"));
    expect(screen.getByTestId("demo-scene")).toHaveAttribute("data-scene", "contract_decision");
    expect(screen.getByTestId("current-focus")).toHaveTextContent("审阅 Contract v1");
    expect(screen.getByTestId("decision-panel")).toHaveTextContent("DEC-1042");
  });
});
