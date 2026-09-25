import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDemo } from "../demo/context";
import { createDraftChange, startCreate } from "../demo/commands";
import { DEFAULT_CHANGE_INPUT, isMainChangeCreated, MAIN_CHANGE_ID } from "../demo/scenario";

export function CreateChangePage() {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();

  useEffect(() => {
    if (state.scene === "workbench") {
      dispatch(startCreate());
    }
  }, [dispatch, state.scene]);
  const [title, setTitle] = useState(DEFAULT_CHANGE_INPUT.title);
  const [request, setRequest] = useState(DEFAULT_CHANGE_INPUT.request);
  const [source, setSource] = useState(DEFAULT_CHANGE_INPUT.source);
  const [owner, setOwner] = useState(DEFAULT_CHANGE_INPUT.owner);
  const [profile, setProfile] = useState(DEFAULT_CHANGE_INPUT.profile);
  const [urgency, setUrgency] = useState(DEFAULT_CHANGE_INPUT.urgency);
  const [impact, setImpact] = useState(DEFAULT_CHANGE_INPUT.impact);

  const [submitted, setSubmitted] = useState(false);
  const alreadyCreated = isMainChangeCreated(state.scene);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = dispatch(
      createDraftChange({
        title,
        request,
        source,
        owner,
        profile,
        urgency,
        impact
      })
    );
    if (!result.rejection) {
      setSubmitted(true);
      navigate(`/changes/${MAIN_CHANGE_ID}`);
    }
  };

  if (submitted) {
    return null;
  }

  if (alreadyCreated) {
    return (
      <div className="page" data-testid="create-change-page">
        <div className="page-header">
          <div className="tiny">Create Change</div>
          <h1>订单导出 Change 已经创建</h1>
          <p className="muted">主路径继续在 Change Room 里走完澄清、契约、执行、评价、发布和关闭。</p>
        </div>
        <div className="card empty-state">
          <p>
            {MAIN_CHANGE_ID} {state.mainChange.title} 当前处于 {state.mainChange.lifecycleState}。
          </p>
          <Link className="button" to={`/changes/${MAIN_CHANGE_ID}`}>
            回到 Change Room
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" data-testid="create-change-page">
      <div className="page-header">
        <div className="tiny">Create Change</div>
        <h1>先建立责任边界</h1>
        <p className="muted">这次创建的就是主故事线 CHG-0242。填完后会进入 Draft，下一步是澄清，而不是立即实现。</p>
      </div>
      <form className="card form-grid" onSubmit={onSubmit}>
        <label className="field">
          标题
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="field">
          来源
          <input value={source} onChange={(event) => setSource(event.target.value)} />
        </label>
        <label className="field field-wide">
          原始诉求
          <textarea rows={4} value={request} onChange={(event) => setRequest(event.target.value)} />
        </label>
        <label className="field">
          Change Owner
          <input value={owner} onChange={(event) => setOwner(event.target.value)} />
        </label>
        <label className="field">
          Provisional Profile
          <select value={profile} onChange={(event) => setProfile(event.target.value)}>
            <option>Feature</option>
            <option>Bugfix</option>
            <option>Reliability</option>
            <option>Experiment</option>
          </select>
        </label>
        <label className="field">
          紧急度
          <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option>Low</option>
            <option>Normal</option>
            <option>High</option>
          </select>
        </label>
        <label className="field">
          已知影响
          <input value={impact} onChange={(event) => setImpact(event.target.value)} />
        </label>
        <div className="field-wide row">
          <button type="submit" className="button" data-testid="create-change-submit">
            创建 Draft Change
          </button>
        </div>
      </form>
    </div>
  );
}
