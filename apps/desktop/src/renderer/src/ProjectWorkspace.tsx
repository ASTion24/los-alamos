import { useState } from "react";
import { ArrowLeft, Archive, ArchiveRestore, CheckCheck, FilePenLine, Play, RotateCcw, Save } from "lucide-react";
import type { LongTailProject, ProjectIntake, ProjectOutcome, ResidencySession, WorkUnit } from "./types";
import { localDate, projectCapsule, projectIsAvailable } from "../../../../../packages/core/src";
import { CapsuleContent, CapsuleEditor, Dialog } from "./Continuity";
import { TaskEditor, TaskMap, WeightedProgress } from "./TaskMap";

export const outcomeLabels: Record<ProjectOutcome, string> = {
  closed: "已关闭", parked: "暂存", waiting: "等待外部", killed: "不再投入"
};

export function IntakeFields({ value, onChange }: { value: ProjectIntake; onChange: (value: ProjectIntake) => void }): JSX.Element {
  return <div className="continuity-fields intake-fields">
    <label><span>已经完成</span><textarea aria-label="已经完成" rows={2} value={value.completed} onChange={(e) => onChange({ ...value, completed: e.target.value })} /></label>
    <label><span>剩余动作（每行一项）</span><textarea aria-label="剩余动作（每行一项）" rows={3} value={value.remaining} onChange={(e) => onChange({ ...value, remaining: e.target.value })} /></label>
    <label><span>关闭标准</span><textarea aria-label="关闭标准" rows={2} value={value.closeCriteria} onChange={(e) => onChange({ ...value, closeCriteria: e.target.value })} /></label>
    <label><span>起点自述 %（可选）</span><input type="number" min={0} max={100} value={value.progressEstimate ?? ""} onChange={(e) => onChange({ ...value, progressEstimate: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
  </div>;
}

export function ProjectWorkspace({ project, sessions, onBack, onOpenSession, onRefresh }: {
  project: LongTailProject; sessions: ResidencySession[]; onBack: () => void;
  onOpenSession: () => void; onRefresh: () => Promise<void>;
}): JSX.Element {
  const [tab, setTab] = useState<"handoff" | "tasks" | "records">("handoff");
  const [capsuleOpen, setCapsuleOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [brief, setBrief] = useState(project.brief);
  const [intake, setIntake] = useState<ProjectIntake>(project.intake ?? {
    completed: "", remaining: "", closeCriteria: project.closeCriteria.join("\n")
  });
  const [outcome, setOutcome] = useState<ProjectOutcome | "active">(project.resolution ? "active" : "closed");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const capsule = projectCapsule(project);
  const task = project.taskGraph.tasks.find((item) => item.id === taskId);
  const live = sessions.some((session) => ["active", "paused", "proposed"].includes(session.status));
  const run = async (action: () => Promise<unknown>, done?: () => void): Promise<void> => {
    setBusy(true); setError("");
    try { await action(); await onRefresh(); done?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  return <div className="project-detail continuity-project">
    <div className="project-titleline">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} />返回总览</button>
      <div className="project-heading"><h2>{project.title}</h2></div>
      <div className="project-title-actions">
        <button className="icon-button" disabled={live || busy} onClick={() => setFactsOpen(true)} title="更新项目事实" aria-label="更新项目事实"><FilePenLine size={16} /></button>
        <button className="icon-button" disabled={live || busy} onClick={() => void run(() => window.los.setProjectArchived({ projectId: project.id, archived: !project.archivedAt }), onBack)}
          title={project.archivedAt ? "恢复项目" : "归档项目"} aria-label={project.archivedAt ? "恢复项目" : "归档项目"}>{project.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
        <button className="command-button" disabled={live || busy} onClick={() => { setOutcome(project.resolution ? "active" : "closed"); setNote(""); setEvidence(""); setDate(""); setError(""); setResolutionOpen(true); }}><CheckCheck size={16} />收尾决定</button>
        {projectIsAvailable(project) && <button className="cta-button" onClick={onOpenSession}><Play size={15} />{live ? "返回驻留" : "开始驻留"}</button>}
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {project.modelNeedsReview && <div className="model-review-band"><span>项目事实有更新，任务图待校准。</span>
      <button disabled={busy || live} onClick={() => void run(() => window.los.reanalyzeProject(project.id))}><RotateCcw size={15} />校准任务图</button>
    </div>}
    <div className="project-context-meta">
      <span>{project.resolution ? outcomeLabels[project.resolution.outcome] : "开放中"}</span>
      {project.intake?.progressEstimate !== undefined && <span>起点自述 {project.intake.progressEstimate}%</span>}
      <span>关闭标准：{project.closeCriteria.join("；") || "待确认"}</span>
    </div>
    <nav className="continuity-tabs" aria-label="项目视图">
      {(["handoff", "tasks", "records"] as const).map((name, index) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{["交接", "任务图", "推进记录"][index]}</button>)}
      {tab === "handoff" && <button className="icon-button" disabled={live || busy} onClick={() => setCapsuleOpen(true)} title="编辑交接" aria-label="编辑交接"><FilePenLine size={16} /></button>}
    </nav>
    <div className="project-tab-body">
      {tab === "handoff" && <>
        {project.resolution && <section className="resolution-band">
          <strong>{outcomeLabels[project.resolution.outcome]}</strong><p>{project.resolution.note}</p>
          {project.resolution.evidence && <p>{project.resolution.evidence}</p>}
          {project.resolution.revisitAt && <p>{project.resolution.revisitAt} 回看{project.resolution.revisitAt <= localDate() ? " · 已到回看日期" : ""}</p>}
        </section>}
        <CapsuleContent capsule={capsule} projectId={project.id} />
      </>}
      {tab === "tasks" && <div className="project-tasks">
        <WeightedProgress tasks={project.taskGraph.tasks} value={project.completionPercent} />
        <TaskMap tasks={project.taskGraph.tasks} selectedTaskId={taskId} onSelectTask={(id) => { if (!live) setTaskId(id); }} />
        {task && <TaskEditor task={task} tasks={project.taskGraph.tasks} busy={busy} onClose={() => setTaskId(null)}
          onSave={async (id, patch: Partial<WorkUnit>) => { await run(() => window.los.updateTask({ projectId: project.id, taskId: id, patch }), () => setTaskId(null)); }} />}
      </div>}
      {tab === "records" && <div className="project-records">
        {sessions.filter((session) => session.status === "closed").length === 0 && <p>尚无推进记录。</p>}
        {sessions.filter((session) => session.status === "closed").map((session) => <article key={session.id}>
          <time>{new Date(session.endedAt ?? session.startedAt).toLocaleString("zh-CN")}</time><h3>{session.taskTitle}</h3>
          {session.handoff ? <CapsuleContent capsule={session.handoff} /> : <p>{session.log ?? session.userNote}</p>}
        </article>)}
      </div>}
    </div>
    {capsuleOpen && <CapsuleEditor capsule={capsule} tasks={project.taskGraph.tasks} onClose={() => setCapsuleOpen(false)}
      onSave={async (value) => { await window.los.updateCapsule({ projectId: project.id, capsule: value }); await onRefresh(); }} />}
    {factsOpen && <Dialog title="更新项目事实" onClose={() => { if (!busy) setFactsOpen(false); }}>
      <label className="full-field"><span>项目事实</span><textarea aria-label="项目事实" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} /></label>
      <IntakeFields value={intake} onChange={setIntake} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer>
        <button disabled={busy} onClick={() => void run(() => window.los.updateProjectBrief({ projectId: project.id, brief, intake }), () => setFactsOpen(false))}><Save size={16} />只保存事实</button>
        <button className="solid-button" disabled={busy} onClick={() => void run(async () => {
          await window.los.updateProjectBrief({ projectId: project.id, brief, intake });
          await window.los.reanalyzeProject(project.id);
        }, () => setFactsOpen(false))}><RotateCcw size={16} />保存并重建任务图</button>
      </footer>
    </Dialog>}
    {resolutionOpen && <Dialog title="收尾决定" onClose={() => { if (!busy) setResolutionOpen(false); }}>
      <div className="continuity-fields">
        <label><span>决定</span><select aria-label="决定" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="closed">已交付，关闭</option><option value="parked">暂存至某日</option><option value="waiting">等待外部条件</option><option value="killed">不再投入</option><option value="active">恢复为开放项目</option>
        </select></label>
        <label><span>{outcome === "waiting" ? "等待对象与恢复条件" : "决定原因"}</span><textarea aria-label={outcome === "waiting" ? "等待对象与恢复条件" : "决定原因"} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {outcome === "closed" && <label><span>交付证据 / 验收说明</span><textarea aria-label="交付证据 / 验收说明" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>}
        {(outcome === "parked" || outcome === "waiting") && <label><span>回看日期{outcome === "waiting" ? "（可选）" : ""}</span><input type="date" min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="solid-button" disabled={busy || !note.trim() || (outcome === "closed" && !evidence.trim()) || (outcome === "parked" && !date)}
        onClick={() => void run(() => window.los.resolveProject({ projectId: project.id, outcome, note, evidence, revisitAt: date || undefined }), () => setResolutionOpen(false))}><CheckCheck size={16} />确认决定</button></footer>
    </Dialog>}
  </div>;
}
