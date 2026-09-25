const STAGES = ["创建", "契约", "执行评价", "测试验证", "生产发布", "关闭学习"];

export function LifecycleStrip({ currentStage }: { currentStage: number }) {
  return (
    <ol className="lifecycle-strip" aria-label="生命周期导航">
      {STAGES.map((label, index) => {
        const stage = index + 1;
        const className = stage < currentStage ? "done" : stage === currentStage ? "current" : "";
        return (
          <li key={label} className={`lifecycle-step ${className}`}>
            <div className="tiny">N{stage}</div>
            <div>{label}</div>
          </li>
        );
      })}
    </ol>
  );
}
