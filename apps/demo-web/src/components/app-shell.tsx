import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Box, Gavel, Layers3, LayoutDashboard } from "lucide-react";
import { useDemo } from "../demo/context";
import { jumpToScene, resetDemo } from "../demo/commands";
import { SCENE_META } from "../demo/scenario";
import { PresenterBar } from "./presenter-bar";
import { StoryRail } from "./story-rail";
import { ToastStack } from "./toast";
import type { DemoScene } from "../demo/types";

const NAV = [
  { to: "/", label: "Workbench", icon: LayoutDashboard },
  { to: "/changes", label: "Changes", icon: Layers3 },
  { to: "/decisions", label: "Decisions", icon: Gavel },
  { to: "/environments", label: "Environments", icon: Box }
];

function SceneRouteSync() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const previousScene = useRef(state.scene);

  useEffect(() => {
    if (previousScene.current === state.scene) {
      return;
    }
    previousScene.current = state.scene;
    const path = SCENE_META[state.scene].path;
    if (location.pathname !== path) {
      navigate(path);
    }
  }, [location.pathname, navigate, state.scene]);

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [hiddenToastRevision, setHiddenToastRevision] = useState<number | null>(null);
  const toastEvent = hiddenToastRevision === state.revision ? null : state.lastEvent;
  const toastRejection = hiddenToastRevision === state.revision ? null : state.lastRejection;

  const handleJump = useCallback(
    (scene: DemoScene) => {
      dispatch(jumpToScene(scene));
      navigate(SCENE_META[scene].path);
    },
    [dispatch, navigate]
  );

  const handleReset = useCallback(() => {
    dispatch(resetDemo());
    navigate("/");
  }, [dispatch, navigate]);

  return (
    <div
        className="app-shell"
        data-testid="demo-scene"
        data-scene={state.scene}
        data-revision={state.revision}
        data-last-event={state.lastEvent?.headline ?? ""}
      >
      <SceneRouteSync />
      <aside className="sidebar">
        <div className="brand">
          <div className="demo-pill">DEMO DATA</div>
          <div className="brand-mark">CimiLoop</div>
          <div className="brand-sub">决策运营工作台</div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/" || item.to === "/changes"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <header className="topbar">
        <div className="project-switcher">
          <span className="tiny">Project</span>
          <span className="project-name">{state.project.name}</span>
          <span className="badge badge-neutral">{state.project.mode}</span>
        </div>
        <div className="identity">
          <div className="avatar" aria-hidden="true">
            {state.project.currentUser.slice(0, 1)}
          </div>
          <div>
            <div>{state.project.currentUser}</div>
            <div className="tiny">Acting role · {state.actingRole}</div>
          </div>
        </div>
      </header>
      <main className="main">
        <StoryRail scene={state.scene} />
        {children}
      </main>
      <ToastStack
        event={toastEvent}
        rejection={toastRejection}
        revision={state.revision}
        onDismiss={(revision) => setHiddenToastRevision(revision)}
      />
      <PresenterBar
        scene={state.scene}
        open={presenterOpen}
        onToggle={() => setPresenterOpen((value) => !value)}
        onJump={handleJump}
        onReset={handleReset}
      />
    </div>
  );
}

