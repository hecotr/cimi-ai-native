import { useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, RotateCcw } from "lucide-react";
import { adjacentScene, SCENE_COUNT, SCENE_META, SCENE_ORDER } from "../demo/scenario";
import type { DemoScene } from "../demo/types";

export function PresenterBar({
  scene,
  open,
  onToggle,
  onJump,
  onReset
}: {
  scene: DemoScene;
  open: boolean;
  onToggle: () => void;
  onJump: (scene: DemoScene) => void;
  onReset: () => void;
}) {
  const meta = SCENE_META[scene];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest('[role="tablist"], [role="dialog"]')
        ) {
          return;
        }
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onJump(adjacentScene(scene, 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onJump(adjacentScene(scene, -1));
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        onReset();
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, onJump, onReset, onToggle]);

  return (
    <div className="presenter-bar" data-testid="presenter-bar" data-open={open ? "true" : "false"}>
      {open ? (
        <div className="presenter-expanded">
          <div className="presenter-meta">
            <span className="demo-pill">PRESENTER</span>
            <strong data-testid="presenter-progress">
              {meta.index}/{SCENE_COUNT} {meta.name}
            </strong>
            <span className="tiny">{meta.nameZh} · {meta.narration}</span>
          </div>
          <div className="presenter-controls">
            <button type="button" className="button-secondary" onClick={() => onJump(adjacentScene(scene, -1))} disabled={meta.index === 1}>
              <ChevronLeft size={16} /> 上一步
            </button>
            <button type="button" className="button-secondary" onClick={() => onJump(adjacentScene(scene, 1))} disabled={meta.index === SCENE_COUNT} data-testid="presenter-next">
              下一步 <ChevronRight size={16} />
            </button>
            <label className="tiny">
              跳转
              <select
                className="presenter-select"
                value={scene}
                aria-label="选择演示场景"
                onChange={(event) => onJump(event.target.value as DemoScene)}
              >
                {SCENE_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {SCENE_META[item].index}. {SCENE_META[item].name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button-secondary" onClick={onReset} data-testid="reset-demo">
              <RotateCcw size={15} /> Reset Demo
            </button>
            <button type="button" className="button-ghost" onClick={onToggle} aria-expanded="true">
              折叠
            </button>
          </div>
        </div>
      ) : (
        <div className="presenter-collapsed">
          <button type="button" className="button-ghost" onClick={onToggle} aria-expanded="false" data-testid="presenter-toggle">
            <ChevronsUpDown size={15} /> Presenter Mode · {meta.index}/{SCENE_COUNT} {meta.name}
          </button>
          <span className="tiny">快捷键 ← → 切换 · R 重置 · P 展开</span>
        </div>
      )}
    </div>
  );
}
