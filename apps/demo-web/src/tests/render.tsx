import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DemoApp } from "../app";
import { DemoProvider } from "../demo/context";
import { buildSceneState, createInitialState } from "../demo/scenario";
import type { DemoScene, DemoState } from "../demo/types";

export function renderDemo(
  options: {
    scene?: DemoScene;
    route?: string;
    state?: DemoState;
  } = {},
  renderOptions?: RenderOptions
) {
  const state = options.state ?? (options.scene ? buildSceneState(options.scene) : createInitialState());
  const route =
    options.route ??
    (options.scene === "create_change"
      ? "/changes/new"
      : options.scene && options.scene !== "workbench"
        ? `/changes/CHG-0242`
        : "/");
  return render(
    <DemoProvider initialState={state}>
      <MemoryRouter initialEntries={[route]}>
        <DemoApp />
      </MemoryRouter>
    </DemoProvider>,
    renderOptions
  );
}
