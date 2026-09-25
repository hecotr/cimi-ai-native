import { SCENE_META, SCENE_ORDER } from "../demo/scenario";
import type { DemoScene } from "../demo/types";

export function StoryRail({ scene }: { scene: DemoScene }) {
  const current = SCENE_META[scene].index;
  return (
    <ol className="story-rail" aria-label="演示主路径" data-testid="story-rail">
      {SCENE_ORDER.map((item) => {
        const meta = SCENE_META[item];
        const status = meta.index < current ? "done" : meta.index === current ? "current" : "todo";
        return (
          <li key={item} className={`story-rail-step ${status}`} data-scene={item}>
            <span className="story-rail-index">{meta.index}</span>
            <span className="story-rail-label">{meta.nameZh}</span>
          </li>
        );
      })}
    </ol>
  );
}
