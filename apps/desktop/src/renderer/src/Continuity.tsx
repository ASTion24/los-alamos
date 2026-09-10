import { useEffect, useState } from "react";
import { Check, FilePenLine, Pause, Play, Save, Inbox } from "lucide-react";
import type { ContextCapsule, LongTailProject, ResidencySession, SessionResult, WorkUnit } from "./types";
import { sessionElapsedSeconds } from "../../../../../packages/core/src";
import { ArtifactButtons, CaptureComposer, ReleaseDialog } from "./Launcher";
import { Dialog } from "./Dialog";
export { Dialog } from "./Dialog";

export function CapsuleContent({ capsule, projectId }: { capsule: ContextCapsule; projectId?: string }): JSX.Element {
  return <div className="capsule-content">
    <div className="capsule-summary"><span>停在这里</span><p>{capsule.summary || "尚无交接记录"}</p></div>
    <div className="capsule-next"><span>下一动作</span><p>{capsule.nextAction || "核对关闭标准，决定是否收尾。"}</p></div>
    {capsule.blocker && <div><span>阻塞 / 待确认</span><p>{capsule.blocker}</p></div>}
    {capsule.decisions.length > 0 && <div><span>已定事项</span><ul>{capsule.decisions.map((line, index) => <li key={index}>{line}</li>)}</ul></div>}
    {capsule.artifacts.length > 0 && <div><span>材料位置 / 证据</span>{projectId
      ? <ArtifactButtons projectId={projectId} artifacts={capsule.artifacts} />
      : <ul>{capsule.artifacts.map((line, index) => <li key={index}><code>{line}</code></li>)}</ul>}</div>}
    {capsule.notDoing && <div><span>不再展开</span><p>{capsule.notDoing}</p></div>}
  </div>;
}

export function CapsuleEditor({ capsule, tasks, title = "编辑交接", onClose, onSave }: {
  capsule: ContextCapsule; tasks?: WorkUnit[]; title?: string;
  onClose: () => void; onSave: (value: ContextCapsule) => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState(capsule);
  const [decisions, setDecisions] = useState(capsule.decisions.join("\n"));
  const [artifacts, setArtifacts] = useState(capsule.artifacts.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (key: "summary" | "blocker" | "nextAction" | "notDoing", label: string) =>
    <label><span>{label}</span><textarea aria-label={label} rows={2} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>;
  const save = async (): Promise<void> => {
    setBusy(true); setError("");
    try {
      await onSave({ ...draft, decisions: decisions.split("\n").filter((line) => line.trim()),
        artifacts: artifacts.split("\n").filter((line) => line.trim()), updatedAt: new Date().toISOString() });
      onClose();
    } catch (failure) { setError(String(failure instanceof Error ? failure.message : failure)); }
    finally { setBusy(false); }
  };
  return <Dialog title={title} onClose={() => { if (!busy) onClose(); }}>
    <div className="continuity-fields">
      {field("summary", "停在这里")}
      {field("nextAction", "下次第一动作")}
      <label><span>已定事项</span><textarea aria-label="已定事项" rows={2} value={decisions} onChange={(e) => setDecisions(e.target.value)} /></label>
      <label><span>材料位置 / 证据</span><textarea aria-label="材料位置 / 证据" rows={2} value={artifacts} onChange={(e) => setArtifacts(e.target.value)} /></label>
      {field("blocker", "阻塞 / 待确认")}
      {field("notDoing", "不再展开")}
      {tasks && <label><span>关联下一任务</span><select aria-label="关联下一任务" value={draft.taskId ?? ""} onChange={(e) => setDraft({ ...draft, taskId: e.target.value || undefined })}>
        <option value="">不指定</option>{tasks.filter((task) => !["done", "killed", "parked"].includes(task.status)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
      </select></label>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer><button className="solid-button" disabled={busy} onClick={() => void save()}><Save size={16} />{busy ? "保存中" : "保存交接"}</button></footer>
  </Dialog>;
}

export function useSessionSeconds(session: ResidencySession): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (session.status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session.status, session.lastResumedAt]);
  return sessionElapsedSeconds(session, Math.max(now, Date.parse(session.lastResumedAt ?? session.startedAt)));
}

export function SessionContinuity({ session, busy, note, onNote, onSession, onClose, onNext, onExit, project, onRefresh }: {
  session: ResidencySession; busy: boolean; note: string; onNote: (text: string) => void;
  onSession: (session: ResidencySession) => void;
  onClose: (result: SessionResult, handoff?: ContextCapsule) => Promise<void>;
  onNext: () => void; onExit: () => void;
  project?: LongTailProject; onRefresh: () => Promise<void>;
}): JSX.Element {
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const elapsed = useSessionSeconds(session);
  const paused = session.status === "paused";
  const closed = session.status === "closed";
  const capsule = session.handoff ?? session.capsule;
  useEffect(() => {
    if (session.status !== "closed") onNote(localStorage.getItem(`los-session-note:${session.id}`) ?? "");
  }, [session.id]);
  const readyToClose = project && !project.resolution && !project.modelNeedsReview &&
    project.taskGraph.tasks.some((task) => task.weight > 0) &&
    project.taskGraph.tasks.every((task) => ["done", "killed"].includes(task.status));
  const pause = async (): Promise<void> => {
    try { setError(""); onSession(await (paused ? window.los.resumeSession(session.id) : window.los.pauseSession(session.id))); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  };
  const handoff: ContextCapsule = {
    summary: note || `${session.taskTitle}：${result === "completed" ? "本段已完成" : result === "partial" ? "已有推进，尚未关闭" : "本段未完成"}`,
    decisions: capsule?.decisions ?? [], artifacts: capsule?.artifacts ?? [],
    blocker: capsule?.blocker ?? "",
    nextAction: result === "completed" && session.scope === "full_task" ? "" : session.startAction,
    notDoing: session.notDoing, taskId: session.taskId, updatedAt: new Date().toISOString()
  };
  return <div className="session-surface continuity-session">
    <div className="session-time-track"><span style={{ width: `${Math.min(100, elapsed / (session.minutesPlanned * 60) * 100)}%` }} /></div>
    <div className="session-title"><p className="project-name">{session.projectTitle}</p><h2>{session.taskTitle}</h2></div>
    {closed ? <>
      <div className="session-result"><Check size={18} /><strong>{session.userResult === "completed" ? "本段已完成" : session.userResult === "partial" ? "本段已有推进" : "本段已记录"}</strong></div>
      {capsule && <div className="return-point"><span>停在这里</span><p>{capsule.summary}</p>
        <span>{project?.resolution ? "收尾依据" : "下次回来，从这里接上"}</span>
        <h3>{project?.resolution ? project.resolution.evidence || project.resolution.note : capsule.nextAction || "核对收尾标准，确认这件事的去向。"}</h3>
      </div>}
      {capsule?.artifacts && <ArtifactButtons projectId={session.projectId} artifacts={capsule.artifacts} />}
      {project?.resolution ? <div className="release-receipt"><Check size={20} /><p>这件事已有去向，可以放下了。</p></div>
        : readyToClose && <button className="release-prompt" onClick={() => setReleaseOpen(true)}><Check size={18} /><span>剩余动作已完成，确认项目收尾</span></button>}
      <div className="continuity-actions"><button className="solid-button" onClick={onExit}>到这里，休息</button>{!project?.resolution && <button onClick={onNext}><Play size={16} />继续这个项目</button>}</div>
    </> : <>
      {paused && <p className="pause-notice" role="status">{session.pauseReason ?? "驻留已暂停"}</p>}
      {session.capsule?.summary && <div className="session-reentry"><span>上次停在</span><p>{session.capsule.summary}</p></div>}
      <div className="block-line"><span>开始动作</span><p>{session.startAction}</p></div>
      <div className="block-line"><span>完成标准</span><p>{session.completionCriteria}</p></div>
      <div className="block-line"><span>明确不做</span><p>{session.notDoing}</p></div>
      <ArtifactButtons projectId={session.projectId} artifacts={capsule?.artifacts ?? []} />
      <div className="continuity-actions">
        <button disabled={busy} onClick={() => void pause()}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? "继续驻留" : "暂停"}</button>
        <span>{session.scope === "checkpoint" ? "本段检查点" : "本段完整任务"}</span>
      </div>
      <div className="finish-strip">
        <textarea aria-label="本次推进记录" value={note} onChange={(e) => { onNote(e.target.value); localStorage.setItem(`los-session-note:${session.id}`, e.target.value); }} placeholder="停在了哪里？留一句，下次不用重想。" />
        <div className="finish-actions">
          <button disabled={busy} onClick={() => setResult("not_completed")}>未完成</button>
          <button disabled={busy} onClick={() => setResult("partial")}>部分完成</button>
          <button disabled={busy} onClick={() => setResult("completed")}>已完成</button>
        </div>
      </div>
      <details className="session-capture"><summary><Inbox size={15} />想起了别的事</summary><CaptureComposer sourceSessionId={session.id} compact /></details>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {result && <QuickHandoff capsule={handoff} result={result} sessionId={session.id} onDismiss={() => setResult(null)} onSave={async (value) => {
      await onClose(result, value); localStorage.removeItem(`los-session-note:${session.id}`);
    }} />}
    {releaseOpen && project && <ReleaseDialog project={project} onClose={() => setReleaseOpen(false)} onSaved={onRefresh} />}
  </div>;
}

function QuickHandoff({ capsule, result, sessionId, onDismiss, onSave }: {
  capsule: ContextCapsule; result: SessionResult; sessionId: string; onDismiss: () => void; onSave: (capsule: ContextCapsule) => Promise<void>;
}): JSX.Element {
  const [summary, setSummary] = useState(capsule.summary);
  const [next, setNext] = useState(() => localStorage.getItem(`los-next:${sessionId}`) ?? capsule.nextAction);
  const [blocker, setBlocker] = useState(capsule.blocker);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog title="留下交接，结束本段" dismissDisabled={busy} onClose={onDismiss} className="quick-handoff">
    <label className="full-field"><span>停在这里</span><textarea aria-label="停在这里" rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
    <label className="full-field"><span>下次第一动作</span><textarea aria-label="下次第一动作" rows={2} value={next} onChange={(event) => { setNext(event.target.value); localStorage.setItem(`los-next:${sessionId}`, event.target.value); }} /></label>
    <details><summary>还有一个阻塞点</summary><textarea aria-label="阻塞点" rows={2} value={blocker} onChange={(event) => setBlocker(event.target.value)} /></details>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <footer><span>{result === "completed" ? "本段已完成" : result === "partial" ? "已有推进，尚未关闭" : "本次未完成"}</span><button className="solid-button" disabled={busy || !summary.trim()} onClick={async () => {
      setBusy(true);
      try { await onSave({ ...capsule, summary, nextAction: next, blocker }); localStorage.removeItem(`los-next:${sessionId}`); onDismiss(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setBusy(false); }
    }}><Save size={16} />{busy ? "保存中" : "保存交接"}</button></footer>
  </Dialog>;
}

export function ProposalEditor({ session, onSaved }: { session: ResidencySession; onSaved: (session: ResidencySession) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(session);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <>
    <button onClick={() => setOpen(true)} title="校准本轮边界"><FilePenLine size={15} />校准边界</button>
    {open && <Dialog title="校准本轮边界" onClose={() => { if (!busy) setOpen(false); }}>
      <div className="continuity-fields">
        {(["startAction", "completionCriteria", "notDoing"] as const).map((key, index) => <label key={key}>
          <span>{["第一动作", "完成标准", "本轮不做"][index]}</span>
          <textarea aria-label={["第一动作", "完成标准", "本轮不做"][index]} rows={3} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        </label>)}
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <footer><button className="solid-button" disabled={busy} onClick={async () => {
        setBusy(true);
        try { onSaved(await window.los.reviseProposal({ id: session.id, startAction: draft.startAction, completionCriteria: draft.completionCriteria, notDoing: draft.notDoing })); setOpen(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { setBusy(false); }
      }}><Save size={16} />保存边界</button></footer>
    </Dialog>}
  </>;
}
