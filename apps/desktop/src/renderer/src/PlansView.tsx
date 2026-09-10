import { useState } from "react";
import { CalendarDays, Check, FilePenLine, Play, Plus, Save, Square } from "lucide-react";
import type { LongTailProject, PlanDraft, ResidencyPlan, ResidencySession } from "./types";
import { localDate, planMinutesUsed, projectIsAvailable } from "../../../../../packages/core/src";
import { Dialog } from "./Continuity";

const statusLabels = { draft: "草案", committed: "已确认", active: "驻留中", closed: "已结束" };

export function PlansView({ projects, plans, sessions, onRefresh, onWork }: {
  projects: LongTailProject[]; plans: ResidencyPlan[]; sessions: ResidencySession[];
  onRefresh: () => Promise<void>; onWork: () => void;
}): JSX.Element {
  const current = plans.find((plan) => plan.status !== "closed");
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<PlanDraft>({
    title: "本次驻留", projectIds: [], startDate: localDate(), endDate: localDate(),
    dailyMinutes: 90, intensity: "medium", notDoing: "不接纳新项目，不扩大范围。", exitCriteria: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const execute = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError("");
    try { await action(); await onRefresh(); setEditing(false); setClosing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  const openEditor = (): void => {
    setError("");
    if (current) setDraft({ ...current });
    else setDraft((value) => ({ ...value, projectIds: [], startDate: localDate(), endDate: localDate() }));
    setEditing(true);
  };
  return <div className="plans-plane">
    <header className="plans-head"><div><span>PERSONAL RESIDENCY</span><h1>驻留计划</h1></div>
      {!current && <button className="solid-button" onClick={openEditor} disabled={!projects.some(projectIsAvailable)}><Plus size={17} />新建计划</button>}
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {current ? <section className="plan-current">
      <div className="plan-identity"><CalendarDays size={24} /><div><span>{statusLabels[current.status]}</span><h2>{current.title}</h2></div></div>
      <dl className="plan-facts">
        <div><dt>日期</dt><dd>{current.startDate} 至 {current.endDate}</dd></div>
        <div><dt>每日容量</dt><dd>{current.dailyMinutes} 分钟 · {current.intensity}</dd></div>
        {current.status === "active" && <div><dt>今日剩余</dt><dd>{Math.max(0, Math.floor(current.dailyMinutes - planMinutesUsed(current, sessions)))} 分钟</dd></div>}
        <div><dt>本次项目</dt><dd>{current.projectIds.map((id) => projects.find((project) => project.id === id)?.title ?? id).join("、")}</dd></div>
        <div><dt>结束标准</dt><dd>{current.exitCriteria}</dd></div>
        <div><dt>不再展开</dt><dd>{current.notDoing}</dd></div>
      </dl>
      {current.endDate < localDate() && <p className="pause-notice">计划窗口已结束，请留下结束说明。</p>}
      <div className="continuity-actions">
        {current.status !== "active" && <button disabled={busy} onClick={openEditor}><FilePenLine size={16} />调整计划</button>}
        <button disabled={busy} onClick={() => { setNote(""); setClosing(true); }}><Square size={15} />结束计划</button>
        {current.status === "draft" && <button className="solid-button" disabled={busy} onClick={() => void execute(() => window.los.transitionPlan({ id: current.id, status: "committed" }))}><Check size={16} />确认计划</button>}
        {current.status === "committed" && <button className="solid-button" disabled={busy || current.startDate > localDate() || current.endDate < localDate()} onClick={() => void execute(() => window.los.transitionPlan({ id: current.id, status: "active" }))}><Play size={16} />开始这次驻留</button>}
        {current.status === "active" && <button className="solid-button" onClick={onWork}><Play size={16} />进入下一段</button>}
      </div>
    </section> : <section className="plan-empty"><CalendarDays size={32} strokeWidth={1.2} /><h2>尚无待开始的计划</h2><button onClick={onWork}><Play size={16} />现在驻留一段</button></section>}
    {plans.some((plan) => plan.status === "closed") && <section className="past-plans"><h2>过去的驻留</h2>
      {plans.filter((plan) => plan.status === "closed").map((plan) => <article key={plan.id}><div><h3>{plan.title}</h3><time>{plan.startDate} 至 {plan.endDate}</time></div><p>{plan.closingNote}</p></article>)}
    </section>}
    {editing && <Dialog title={current ? "调整驻留计划" : "新建驻留计划"} onClose={() => { if (!busy) setEditing(false); }}>
      <div className="continuity-fields">
        <label><span>计划名称</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label><span>每日分钟</span><input type="number" min={5} max={480} value={draft.dailyMinutes} onChange={(e) => setDraft({ ...draft, dailyMinutes: Number(e.target.value) })} /></label>
        <label><span>开始日期</span><input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
        <label><span>结束日期</span><input type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
        <label><span>最高强度</span><select aria-label="最高强度" value={draft.intensity} onChange={(e) => setDraft({ ...draft, intensity: e.target.value as PlanDraft["intensity"] })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        <label><span>结束标准</span><textarea aria-label="结束标准" rows={2} value={draft.exitCriteria} onChange={(e) => setDraft({ ...draft, exitCriteria: e.target.value })} /></label>
        <label className="full-field"><span>本次不做</span><textarea aria-label="本次不做" rows={2} value={draft.notDoing} onChange={(e) => setDraft({ ...draft, notDoing: e.target.value })} /></label>
      </div>
      <fieldset className="plan-projects"><legend>只带走这些项目</legend>
        {projects.filter(projectIsAvailable).map((project) => <label key={project.id}><input type="checkbox" checked={draft.projectIds.includes(project.id)} onChange={(e) => setDraft({ ...draft, projectIds: e.target.checked ? [...draft.projectIds, project.id] : draft.projectIds.filter((id) => id !== project.id) })} /><span>{project.title}</span></label>)}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="solid-button" disabled={busy || !draft.projectIds.length || !draft.exitCriteria.trim()} onClick={() => void execute(() => window.los.savePlan({ id: current?.id, draft }))}><Save size={16} />保存草案</button></footer>
    </Dialog>}
    {closing && current && <Dialog title="结束这次驻留" onClose={() => { if (!busy) setClosing(false); }}>
      <label className="full-field"><span>已经关闭什么，还有什么留待以后</span><textarea aria-label="已经关闭什么，还有什么留待以后" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="solid-button" disabled={busy || !note.trim()} onClick={() => void execute(() => window.los.transitionPlan({ id: current.id, status: "closed", note }))}><Check size={16} />确认结束</button></footer>
    </Dialog>}
  </div>;
}
