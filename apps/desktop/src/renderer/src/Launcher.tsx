import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, Archive, Check, ChevronDown, Clock3, ExternalLink,
  FilePlus2, FolderOpen, Inbox, Play, RotateCcw
} from "lucide-react";
import type { AttentionCapture, FocusPreview, Intensity, LongTailProject, ResidencyPlan, ResidencySession } from "./types";
import { localDate, projectCapsule, projectIsAvailable, suggestCapture } from "../../../../../packages/core/src";
import { Dialog } from "./Dialog";

export function ArtifactButtons({ projectId, artifacts }: { projectId: string; artifacts: string[] }): JSX.Element | null {
  const [error, setError] = useState("");
  if (!artifacts.length) return null;
  return <div className="artifact-entrances">
    {artifacts.map((artifact) => <button key={artifact} title={artifact} onClick={async () => {
      setError("");
      try { await window.los.openArtifact({ projectId, artifact }); }
      catch (failure) { setError(message(failure)); }
    }}><ExternalLink size={14} /><span>{artifact.split(/[/\\]/).filter(Boolean).at(-1) ?? artifact}</span></button>)}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </div>;
}

export function CaptureComposer({ sourceSessionId, onSaved, compact = false }: {
  sourceSessionId?: string; onSaved?: () => void; compact?: boolean;
}): JSX.Element {
  const [storageKey, setStorageKey] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    let current = true;
    void window.los.workspaceRoot().then((root) => {
      if (!current) return;
      const key = `los-capture-draft:${root}:${sourceSessionId ?? "home"}`;
      setStorageKey(key);
      try { setText(localStorage.getItem(key) ?? ""); } catch { /* Persistence is optional until submission. */ }
    }).catch((failure) => { if (current) setError(message(failure)); });
    return () => { current = false; };
  }, [sourceSessionId]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const submit = async (): Promise<void> => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      await window.los.captureThought({ text, sourceSessionId });
      setText("");
      try { localStorage.removeItem(storageKey); } catch { /* The canonical capture was saved by IPC. */ }
      setFeedback(sourceSessionId ? "已收好，继续眼前这一件。" : "已收好，不必现在处理。");
      onSaved?.();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  };
  return <form className={`capture-composer ${compact ? "compact" : ""}`} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <textarea aria-label="此刻挂念的事" rows={compact ? 2 : 3} maxLength={12000} disabled={busy || !storageKey}
      placeholder={sourceSessionId ? "突然想起的事，先放在这里。" : "还有什么一直挂在心上？"}
      value={text} onChange={(event) => {
        setText(event.target.value);
        try { localStorage.setItem(storageKey, event.target.value); } catch { /* The input remains available to submit. */ }
        setFeedback("");
      }} />
    <footer><span role="status">{feedback}</span><button type="submit" disabled={busy || !text.trim()}><ArrowDownToLine size={16} />{busy ? "收纳中" : "先收下来"}</button></footer>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </form>;
}

export function ReleaseDialog({ project, onClose, onSaved }: {
  project: LongTailProject; onClose: () => void; onSaved: () => Promise<void>;
}): JSX.Element {
  const [outcome, setOutcome] = useState<"closed" | "parked" | "waiting" | "killed">("closed");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog title={`放下「${project.title}」`} dismissDisabled={busy} onClose={onClose} className="release-dialog">
    <div className="release-criteria"><span>这件事的结束标准</span><p>{project.closeCriteria.join("；") || "尚未记录，以本次明确决定为准。"}</p></div>
    <div className="release-options" role="radiogroup" aria-label="项目去向">
      {(["closed", "parked", "waiting", "killed"] as const).map((value, index) => <label key={value}>
        <input type="radio" name="release" checked={outcome === value} onChange={() => setOutcome(value)} />
        <span>{["已经交付", "留待某日", "等待外部", "不再投入"][index]}</span>
      </label>)}
    </div>
    <label className="full-field"><span>{outcome === "closed" ? "交付证据 / 验收说明" : outcome === "waiting" ? "等待谁，什么条件下再继续" : "留下决定的原因"}</span>
      <textarea aria-label="收尾依据" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </label>
    {outcome === "parked" && <label className="full-field"><span>回看日期</span><input aria-label="回看日期" type="date" min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} /></label>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <footer><button disabled={busy || !note.trim() || (outcome === "parked" && !date)} className="solid-button" onClick={async () => {
      setBusy(true);
      try {
        await window.los.resolveProject({ projectId: project.id, outcome, note, evidence: outcome === "closed" ? note : undefined, revisitAt: outcome === "parked" ? date : undefined });
        await onSaved(); onClose();
      } catch (failure) { setError(message(failure)); } finally { setBusy(false); }
    }}><Check size={16} />确认收尾</button></footer>
  </Dialog>;
}

export function InboxDialog({ captures, projects, onClose, onChanged, onPrepared, onProject }: {
  captures: AttentionCapture[]; projects: LongTailProject[]; onClose: () => void; onChanged: () => Promise<void>;
  onPrepared: (project: LongTailProject) => void; onProject: (id: string) => void;
}): JSX.Element {
  const [filter, setFilter] = useState<"inbox" | "shelved" | "converted">("inbox");
  const [selected, setSelected] = useState<AttentionCapture | null>(null);
  const [draft, setDraft] = useState({ title: "", remaining: "", closeCriteria: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog title={selected ? "这件事，做到哪里就够了？" : "收纳箱"} dismissDisabled={busy} onClose={onClose} className="inbox-dialog">
    {selected ? <>
      <blockquote className="captured-source">{selected.text}</blockquote>
      <div className="prepare-fields">
        <label className="full-field"><span>项目名称</span><input aria-label="项目名称" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="full-field"><span>只剩下这些动作</span><textarea aria-label="只剩下这些动作" rows={3} value={draft.remaining} onChange={(e) => setDraft({ ...draft, remaining: e.target.value })} /></label>
        <label className="full-field"><span>到这里就可以结束</span><textarea aria-label="到这里就可以结束" rows={2} value={draft.closeCriteria} onChange={(e) => setDraft({ ...draft, closeCriteria: e.target.value })} /></label>
      </div>
      <footer><button disabled={busy} onClick={() => setSelected(null)}>返回收纳箱</button><button className="solid-button" disabled={busy || !draft.title.trim() || !draft.remaining.trim() || !draft.closeCriteria.trim()} onClick={async () => {
        setBusy(true); setError("");
        try {
          const project = await window.los.convertCapture({ id: selected.id, ...draft });
          await onChanged(); onPrepared(project); onClose();
        } catch (failure) { setError(message(failure)); } finally { setBusy(false); }
      }}><ArrowRight size={16} />就从这里开始</button></footer>
    </> : <>
      <nav className="inbox-tabs" aria-label="收纳视图">{(["inbox", "shelved", "converted"] as const).map((value, i) =>
        <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{["待整理", "先放着", "已带入项目"][i]} <span>{captures.filter((c) => c.status === value).length}</span></button>)}</nav>
      <div className="inbox-list">
        {captures.filter((capture) => capture.status === filter).map((capture) => <article key={capture.id}>
          <time>{new Date(capture.createdAt).toLocaleDateString("zh-CN")}{capture.sourceSessionId ? " · 驻留中记下" : ""}</time>
          <p>{capture.text}</p><div>
            {filter === "converted" ? <button onClick={() => { if (capture.projectId) { onProject(capture.projectId); onClose(); } }}><ArrowRight size={14} />{projects.find((p) => p.id === capture.projectId)?.title ?? "查看项目"}</button>
              : <button disabled={busy} onClick={async () => {
                setBusy(true); setError("");
                try { await window.los.shelveCapture({ id: capture.id, shelved: filter === "inbox" }); await onChanged(); }
                catch (failure) { setError(message(failure)); } finally { setBusy(false); }
              }}>{filter === "inbox" ? <Archive size={14} /> : <RotateCcw size={14} />}{filter === "inbox" ? "先放着" : "取回"}</button>}
            {filter === "inbox" && <button onClick={() => { setSelected(capture); setDraft(suggestCapture(capture.text)); }}><ArrowRight size={14} />准备推进</button>}
          </div>
        </article>)}
        {!captures.some((capture) => capture.status === filter) && <p className="quiet-empty">这里暂时没有待处理的事项。</p>}
      </div>
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </Dialog>;
}

export function Launcher({ projects, sessions, plans, captures, onRefresh, onStart, onOpenProject, onLibrary, onPlans, initialProjectId }: {
  projects: LongTailProject[]; sessions: ResidencySession[]; plans: ResidencyPlan[]; captures: AttentionCapture[];
  onRefresh: () => Promise<void>; onStart: (session: ResidencySession) => void; onOpenProject: (id: string) => void;
  onLibrary: () => void; onPlans: () => void; initialProjectId?: string;
}): JSX.Element {
  const plan = plans.find((value) => value.status === "active");
  const [minutes, setMinutes] = useState(25);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [preview, setPreview] = useState<FocusPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [release, setRelease] = useState<LongTailProject | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sequence = useRef(0);
  const dataKey = JSON.stringify([projects.map((p) => [p.id, p.revision, p.modelNeedsReview]),
    sessions.map((s) => [s.id, s.status]), plans.map((p) => [p.id, p.revision])]);
  useEffect(() => { setProjectId(initialProjectId ?? ""); }, [initialProjectId]);
  useEffect(() => { if (plan) setIntensity(plan.intensity); }, [plan?.id, plan?.intensity]);
  useEffect(() => {
    const request = ++sequence.current;
    setLoading(true); setPreview(null);
    const timer = window.setTimeout(() => {
      void window.los.previewFocus({ minutes, intensity, projectId: projectId || undefined }).then((value) => {
        if (sequence.current === request) { setPreview(value); setError(""); }
      }).catch((failure) => { if (sequence.current === request) setError(message(failure)); })
        .finally(() => { if (sequence.current === request) setLoading(false); });
    }, 120);
    return () => { window.clearTimeout(timer); sequence.current += 1; };
  }, [minutes, intensity, projectId, dataKey, refreshKey]);
  const pending = captures.filter((capture) => capture.status === "inbox");
  const openProjects = projects.filter(projectIsAvailable);
  const readyToClose = openProjects.filter((p) => !p.modelNeedsReview && p.taskGraph.tasks.some((task) => task.weight > 0) &&
    p.taskGraph.tasks.every((task) => ["done", "killed"].includes(task.status)));
  const due = projects.filter((project) => project.resolution?.revisitAt && project.resolution.revisitAt <= localDate());
  const session = preview?.session;
  const selectedProject = projects.find((p) => p.id === session?.projectId);
  const latestClosed = projects.find((project) => project.resolution?.outcome === "closed");
  return <div className="launcher">
    <header className="launcher-horizon">
      <div><span className="launcher-date">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</span><h1>Los Alamos</h1></div>
      <div className="horizon-state"><span>PERSONAL RESIDENCY</span><p>{openProjects.length ? "只把注意力交给眼前这一件。" : "留出一段可以重新开始的时间。"}</p></div>
    </header>
    <div className="launcher-workspace">
      <section className="next-work">
        <header><span className="section-kicker">此刻，只带走一件</span><button title="全部项目" onClick={onLibrary}><FolderOpen size={16} />项目</button></header>
        <div className="focus-constraints">
          <label><Clock3 size={15} /><select aria-label="可用时间" value={minutes} disabled={busy} onChange={(e) => setMinutes(Number(e.target.value))}>{[5, 15, 25, 45, 60, 90].map((n) => <option key={n} value={n}>{n} 分钟</option>)}</select></label>
          <label><select aria-label="精力上限" value={intensity} disabled={busy} onChange={(e) => setIntensity(e.target.value as Intensity)}>
            <option value="low">轻量</option><option value="medium">平稳</option><option value="high">专注</option>
          </select><ChevronDown size={13} /></label>
          {openProjects.length > 0 && <label className="project-picker"><select aria-label="本轮项目" value={projectId} disabled={busy} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">替我选一件</option>{openProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select><ChevronDown size={13} /></label>}
        </div>
        <div className="focus-entry" aria-busy={loading}>
          {loading ? <div className="entry-loading"><span /><span /><span /></div> : preview?.currentSession ? <>
            <span className="entry-status">还有一段驻留未结束</span><h2>{preview.currentSession.taskTitle}</h2><p>{preview.currentSession.startAction}</p>
            <button className="launch-action" onClick={() => onStart(preview.currentSession!)}><Play size={17} />返回这段驻留</button>
          </> : session ? <>
            <div className="entry-project"><span>{session.projectTitle}</span><button title="查看项目" aria-label="查看当前项目" onClick={() => onOpenProject(session.projectId)}><ExternalLink size={14} /></button></div>
            <h2 key={`${session.projectId}:${session.taskId}`} className="entry-title">{session.startAction}</h2>
            {session.capsule?.summary && <p className="entry-memory"><span>上次停在</span>{session.capsule.summary}</p>}
            <dl className="entry-boundary"><div><dt>做到这里</dt><dd>{session.completionCriteria}</dd></div><div><dt>这次不做</dt><dd>{session.notDoing}</dd></div></dl>
            <p className="entry-reason">{session.selectionReason}</p>
            {selectedProject && <ArtifactButtons projectId={selectedProject.id} artifacts={projectCapsule(selectedProject).artifacts} />}
            <div className="entry-actions">
              <button className="launch-action" disabled={busy || !preview?.token} onClick={async () => {
                if (!preview?.token) return;
                setBusy(true); setError("");
                try { onStart(await window.los.startFocus({ minutes, intensity, projectId: projectId || undefined, token: preview.token })); await onRefresh(); }
                catch (failure) { setError(message(failure)); setRefreshKey((key) => key + 1); }
                finally { setBusy(false); }
              }}><Play size={17} />{busy ? "正在进入" : `确认开始 ${minutes} 分钟`}</button>
              <button disabled={busy} title="选择工作材料" onClick={async () => {
                try { await window.los.attachArtifacts(session.projectId); await onRefresh(); }
                catch (failure) { setError(message(failure)); }
              }}><FilePlus2 size={15} />材料</button>
            </div>
          </> : readyToClose.length ? <>
            <span className="entry-status">剩余动作已经收束</span><h2>{readyToClose[0].title}</h2><p>{readyToClose[0].closeCriteria.join("；")}</p>
            <button className="launch-action" onClick={() => setRelease(readyToClose[0])}><Check size={17} />确认这件事的去向</button>
          </> : openProjects.length ? <>
            <span className="entry-status">先留一点余地</span><h2>这段时间，不必硬塞任务。</h2><p>{preview?.message}</p>
            <div className="entry-actions"><button onClick={onLibrary}><FolderOpen size={16} />查看项目</button>{plan && <button onClick={onPlans}>查看驻留计划</button>}</div>
          </> : <>
            <span className="entry-status">{latestClosed ? "已经放下一件" : "从脑中，移到这里"}</span>
            <h2>{latestClosed ? latestClosed.title : "先收下那些\n一直没放下的事。"}</h2>
            {latestClosed ? <p>{latestClosed.resolution?.note}</p> : <p>今天不需要一个完美的窗口。</p>}
            {pending.length > 0 && <button className="launch-action" onClick={() => setInboxOpen(true)}><ArrowRight size={17} />从收纳中选一件</button>}
          </>}
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <footer className="workspace-footer">
          <span>{openProjects.length > 1 ? `其余 ${openProjects.length - (session ? 1 : 0)} 个项目，暂不展开。` : "不必在今天完成一切。"}</span>
          {plan && <button onClick={onPlans}>{plan.title}<ArrowRight size={13} /></button>}
        </footer>
      </section>
      <aside className="attention-shelf">
        <header><span className="section-kicker">先放在这里</span><button title="打开收纳箱" aria-label="打开收纳箱" onClick={() => setInboxOpen(true)}><Inbox size={17} /><span>{pending.length}</span></button></header>
        <CaptureComposer onSaved={() => { void onRefresh().catch((failure) => setError(message(failure))); }} />
        <div className="shelf-items">{pending.slice(0, 3).map((capture) => <button key={capture.id} onClick={() => setInboxOpen(true)}><span>{capture.text}</span><ArrowRight size={14} /></button>)}</div>
        {pending.length > 3 && <button className="shelf-more" onClick={() => setInboxOpen(true)}>其余 {pending.length - 3} 条<ArrowRight size={14} /></button>}
        {due.length > 0 && <div className="due-review"><span>到了约定回看日</span>{due.slice(0, 2).map((p) => <button key={p.id} onClick={() => onOpenProject(p.id)}>{p.title}<ArrowRight size={14} /></button>)}</div>}
        {readyToClose.length > 0 && session && <div className="due-review"><span>可以确认收尾</span>{readyToClose.slice(0, 2).map((p) => <button key={p.id} onClick={() => setRelease(p)}>{p.title}<Check size={14} /></button>)}</div>}
      </aside>
    </div>
    {inboxOpen && <InboxDialog captures={captures} projects={projects} onClose={() => setInboxOpen(false)} onChanged={onRefresh} onProject={onOpenProject} onPrepared={(p) => { setProjectId(p.id); }} />}
    {release && <ReleaseDialog project={release} onClose={() => setRelease(null)} onSaved={onRefresh} />}
  </div>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : String(error);
}
