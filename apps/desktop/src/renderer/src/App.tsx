import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Book,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CalendarDays,
  FolderOpen,
  History,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Timer,
  LayoutGrid, House
} from "lucide-react";
import { AboutPanel } from "./AboutPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Dialog, SessionContinuity, useSessionSeconds, ProposalEditor } from "./Continuity";
import { ProjectWorkspace, IntakeFields, outcomeLabels } from "./ProjectWorkspace";
import { PlansView } from "./PlansView";
import { Launcher } from "./Launcher";
import { localDate, projectIsAvailable, sessionElapsedSeconds } from "../../../../../packages/core/src";
import type {
  Intensity,
  LongTailProject,
  ResidencySession,
  SessionResult,
  WorkspaceHealth,
  ContextCapsule, ProjectIntake, ResidencyPlan, AttentionCapture
} from "./types";
import "./styles.css";
import "./continuity.css";
import "./launcher.css";

type View = "home" | "work" | "projects" | "history" | "plans";

type ProjectSurfaceRequest = {
  id: number;
  surface: "overview" | "archive" | "create";
};

type NoticeState = {
  id: number;
  message: string;
};

const intensities: Intensity[] = ["low", "medium", "high", "xhigh"];

const intensityCopy: Record<Intensity, { label: string; summary: string; detail: string }> = {
  low: {
    label: "low",
    summary: "轻量整理与上下文恢复",
    detail: "适合盘点材料、回顾进度、校准边界。认知切换少，允许被打断后重新进入。"
  },
  medium: {
    label: "medium",
    summary: "稳定推进已明确的任务",
    detail: "适合持续写作、常规制作与明确决策。需要稳定注意力，但不要求高压推理。"
  },
  high: {
    label: "high",
    summary: "集中处理关键路径",
    detail: "适合复杂判断、结构重组与连续输出。需要完整时间段，并尽量避免外部打断。"
  },
  xhigh: {
    label: "xhigh",
    summary: "短时攻坚与高压决策",
    detail: "仅用于必须立即突破的难点。疲劳累积明显，不适合连续安排或长时间保持。"
  }
};

const intensityThemeStops = [
  { background: [219, 232, 224], soft: [244, 249, 246], accent: [57, 98, 79] },
  { background: [219, 233, 234], soft: [244, 249, 249], accent: [54, 98, 103] },
  { background: [236, 219, 214], soft: [249, 242, 238], accent: [136, 78, 67] },
  { background: [222, 214, 225], soft: [246, 241, 246], accent: [98, 66, 97] }
] as const;

const sessionResultCopy: Record<SessionResult, string> = {
  completed: "已完成",
  partial: "部分完成",
  not_completed: "未完成"
};

const scopeCopy = {
  checkpoint: "检查点",
  full_task: "完整任务"
} as const;

export function App(): JSX.Element {
  const [view, setView] = useState<View>("home");
  const [captures, setCaptures] = useState<AttentionCapture[]>([]);
  const [launcherProjectId, setLauncherProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState<LongTailProject[]>([]);
  const [sessions, setSessions] = useState<ResidencySession[]>([]);
  const [plans, setPlans] = useState<ResidencyPlan[]>([]);
  const [sessionProjectId, setSessionProjectId] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [activeSession, setActiveSession] = useState<ResidencySession | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [projectSurfaceRequest, setProjectSurfaceRequest] =
    useState<ProjectSurfaceRequest | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth | null>(null);

  const selectedProject = useMemo(
    () =>
      selectedProjectId
        ? projects.find((project) => project.id === selectedProjectId) ?? null
        : projects[0] ?? null,
    [projects, selectedProjectId]
  );

  const pushNotice = useCallback((message: string): void => {
    setNotice({
      id: Date.now() + Math.floor(Math.random() * 1000),
      message
    });
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    const [nextProjects, nextSessions, nextHealth, nextPlans, nextCaptures] = await Promise.all([
      window.los.listProjects(),
      window.los.listSessions(),
      window.los.getWorkspaceHealth(),
      window.los.listPlans(),
      window.los.listCaptures()
    ]);

    const normalizedSessions = nextSessions.map((session) => ({
      ...session,
      scope: session.scope ?? "full_task",
      selectionReason:
        session.selectionReason ??
        "符合本轮时间与强度约束，是当前未阻塞任务中的优先入口。"
    }));

    setProjects(nextProjects);
    setSessions(normalizedSessions);
    setPlans(nextPlans);
    setCaptures(nextCaptures);
    setWorkspaceHealth(nextHealth);
    setSelectedProjectId((current) => {
      if (current && nextProjects.some((project) => project.id === current)) return current;
      return nextProjects[0]?.id ?? null;
    });
    setActiveSession((current) => {
      const pending = normalizedSessions.find((session) => ["active", "paused", "proposed"].includes(session.status));
      if (pending) return pending;
      if (current) {
        return normalizedSessions.find((session) => session.id === current.id) ?? current;
      }
      return (
        normalizedSessions.find((session) => ["active", "paused"].includes(session.status)) ??
        normalizedSessions.find((session) => session.status === "proposed") ??
        null
      );
    });
  }, []);

  const navigate = useCallback((nextView: View): void => {
    setView(nextView);
    if (nextView === "projects") {
      setProjectDetailOpen(false);
    }
  }, []);

  const openProject = useCallback((projectId: string): void => {
    setSelectedProjectId(projectId);
    setProjectDetailOpen(true);
    setView("projects");
  }, []);

  const closeAbout = useCallback((): void => {
    setAboutOpen(false);
    void window.los.dismissAbout().catch((error: unknown) => {
      pushNotice(error instanceof Error ? error.message : String(error));
    });
  }, [pushNotice]);

  useEffect(() => {
    void window.los
      .getAboutState()
      .then((state) => {
        if (state.shouldShow) setAboutOpen(true);
      })
      .catch((error: unknown) => {
        pushNotice(error instanceof Error ? error.message : String(error));
      });
    void reload().catch((error) => pushNotice(String(error)));
    void window.los.listSessions().then((list) => {
      if (list.some((session) => ["active", "paused", "proposed"].includes(session.status))) navigate("work");
    }).catch((error) => pushNotice(String(error)));
    const unsubscribeOpen = window.los.onOpenRequest((request) => {
      const payload = extractPayload(request);
      if (payload?.target === "session") {
        navigate("work");
        if (payload.id) {
          void window.los.listSessions().then((nextSessions) => {
            const session = nextSessions.find((candidate) => candidate.id === payload.id);
            if (session) {
              setActiveSession({ ...session, scope: session.scope ?? "full_task" });
            }
          });
        }
      } else if (payload?.target === "residency") {
        navigate("work");
      } else if (payload?.target === "history") {
        navigate("history");
      } else if (payload?.target === "plans") {
        navigate("plans");
      } else if (payload?.target === "home") {
        navigate("home");
      } else if (payload?.target === "settings") {
        setSettingsOpen(true);
      } else if (payload?.target === "about") {
        setAboutOpen(true);
      } else if (payload?.target === "archive" || payload?.target === "create") {
        navigate("projects");
        setProjectSurfaceRequest({
          id: Date.now(),
          surface: payload.target
        });
      } else if (payload?.target === "project" && payload.id) {
        openProject(payload.id);
      } else {
        navigate("projects");
        setProjectSurfaceRequest({
          id: Date.now(),
          surface: "overview"
        });
      }
      void reload().catch((error) => pushNotice(String(error)));
    });
    const unsubscribeWorkspace = window.los.onWorkspaceChanged(() => {
      void reload().catch((error) => pushNotice(String(error)));
    });
    const unsubscribeWarning = window.los.onOperationWarning(pushNotice);
    const unsubscribeDeadline = window.los.onSessionDeadline((sessionId) => {
      setActiveSession((current) => {
        if (current?.id === sessionId) {
          pushNotice("计划时间已到。可以结束并记录，也可以继续推进。");
        }
        return current;
      });
    });
    return () => {
      unsubscribeOpen();
      unsubscribeWorkspace();
      unsubscribeWarning();
      unsubscribeDeadline();
    };
  }, [navigate, openProject, pushNotice, reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && aboutOpen) {
        closeAbout();
        return;
      }
      if (event.key === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || settingsOpen || document.querySelector(".continuity-dialog") || activeSession?.status === "active") {
        return;
      }
      const nextView =
        event.key === "1" ? "projects" : event.key === "2" ? "work" : event.key === "3" ? "history" : null;
      if (nextView) {
        event.preventDefault();
        navigate(nextView);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [aboutOpen, activeSession?.status, closeAbout, navigate, settingsOpen]);

  async function handleCreateProject(intake?: ProjectIntake): Promise<void> {
    if (!title.trim() || !brief.trim()) return;
    setBusy(true);
    try {
      const project = await window.los.createProject({ title, brief, intake });
      setTitle("");
      setBrief("");
      await reload();
      openProject(project.id);
      pushNotice("项目已加入总览。");
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handlePropose(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const session = await window.los.proposeSession({ minutes, intensity, projectId: sessionProjectId });
      setActiveSession(session);
      if (session) {
        navigate("work");
      } else {
        pushNotice("当前没有符合边界的任务。请查看依赖、调整任务范围，或确认项目收尾决定。");
      }
      await reload();
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(result: SessionResult, handoff?: ContextCapsule): Promise<void> {
    if (!activeSession) return;
    setBusy(true);
    try {
      const closed = await window.los.closeSession({
        sessionId: activeSession.id,
        result,
        note: closeNote.trim() || undefined,
        handoff
      });
      setActiveSession(closed);
      setCloseNote("");
      await reload();
      pushNotice("本次驻留已写入记录。");
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSession(): Promise<void> {
    if (!activeSession || activeSession.status !== "proposed") return;
    setBusy(true);
    try {
      const started = await window.los.startSession(activeSession.id);
      setActiveSession(started);
      await reload();
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelProposal(): Promise<void> {
    if (!activeSession || activeSession.status !== "proposed") return;
    setBusy(true);
    try {
      await window.los.cancelSessionProposal(activeSession.id);
      setActiveSession(null);
      await reload();
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const sessionRunning = activeSession?.status === "active";
  const residencyOpen = view === "work";

  return (
    <main
      className={`atelier platform-${window.los.platform} ${sessionRunning ? "focus-mode" : ""} ${
        residencyOpen ? "residency-shell" : ""
      }`}
    >
      {!residencyOpen ? (
        <header className="topline">
          <button className="wordmark" onClick={() => { setLauncherProjectId(undefined); navigate("home"); }}>
            Los Alamos
          </button>
          <div className="titlebar-drag" />
          <div className="app-commands">
            <button className={`command-button ${view === "home" ? "active" : ""}`} onClick={() => { setLauncherProjectId(undefined); navigate("home"); }}><House size={16} />此刻</button>
            <button className={`command-button ${view === "projects" ? "active" : ""}`} onClick={() => navigate("projects")}><LayoutGrid size={16} />项目</button>
            <button className="command-button" onClick={() => navigate("plans")}><CalendarDays size={16} />计划</button>
            <button className="icon-button" title="自定驻留" aria-label="自定驻留" onClick={() => { setSessionProjectId(undefined); setActiveSession((current) => current?.status === "closed" ? null : current); navigate("work"); }}>
              <Timer size={16} />
            </button>
            {view !== "history" ? (
              <button className="command-button" onClick={() => navigate("history")}>
                <History size={16} />
                记录
              </button>
            ) : null}
            <button
              className="icon-button"
              onClick={() => void window.los.showWorkspace()}
              title="打开工作区"
              aria-label="打开工作区"
            >
              <FolderOpen size={16} />
            </button>
            {workspaceHealth && workspaceHealth.issues.length > 0 ? (
              <button
                className="icon-button health-warning-button"
                onClick={() => setSettingsOpen(true)}
                title={`工作区有 ${workspaceHealth.issues.length} 项需检查`}
                aria-label="工作区状态"
              >
                <CircleAlert size={16} />
              </button>
            ) : null}
            <button
              className="icon-button"
              onClick={() => setAboutOpen(true)}
              title="关于 Los Alamos"
              aria-label="关于 Los Alamos"
            >
              <Info size={16} />
            </button>
            <button
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              title="模型设置"
              aria-label="模型设置"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>
      ) : null}

      <section className={`stage ${residencyOpen ? "residency-stage" : ""} ${view === "home" ? "launcher-stage" : ""}`}>
        {notice ? <div className="notice-line" role="status" title={notice.message}>{notice.message}</div> : null}
        {view === "home" && <Launcher projects={projects} sessions={sessions} plans={plans} captures={captures}
          initialProjectId={launcherProjectId} onRefresh={reload}
          onStart={(session) => { setActiveSession(session); setCloseNote(""); navigate("work"); }}
          onOpenProject={openProject} onLibrary={() => navigate("projects")} onPlans={() => navigate("plans")} />}
        {view === "projects" ? (
          <ProjectsView
            projects={projects}
            sessions={sessions}
            selectedProject={selectedProject}
            selectedProjectId={selectedProjectId}
            title={title}
            brief={brief}
            busy={busy}
            detailOpen={projectDetailOpen}
            surfaceRequest={projectSurfaceRequest}
            onSelectProject={openProject}
            onBackToOverview={() => navigate("projects")}
            onTitleChange={setTitle}
            onBriefChange={setBrief}
            onCreateProject={handleCreateProject}
            onOpenSession={() => { setSessionProjectId(selectedProject?.id); navigate("work"); }}
            onRefresh={reload}
          />
        ) : null}

        {view === "work" ? (
          <ResidencyView
            projects={projects}
            targetProject={projects.find((project) => project.id === sessionProjectId)?.title}
            plan={plans.find((plan) => plan.status === "active")}
            minutes={minutes}
            intensity={intensity}
            activeSession={activeSession}
            closeNote={closeNote}
            busy={busy}
            onMinutesChange={setMinutes}
            onIntensityChange={setIntensity}
            onPropose={handlePropose}
            onStart={handleStartSession}
            onCancelProposal={handleCancelProposal}
            onClose={handleClose}
            onSession={setActiveSession}
            onCloseNoteChange={setCloseNote}
            onExit={() => navigate("home")}
            onNewSession={() => { setLauncherProjectId(activeSession?.projectId); setActiveSession(null); navigate("home"); }}
            onRefresh={reload}
          />
        ) : null}

        {view === "history" ? <HistoryView sessions={sessions} onOpenProject={openProject} /> : null}
        {view === "plans" ? <PlansView projects={projects} plans={plans} sessions={sessions} onRefresh={reload}
          onWork={() => { setSessionProjectId(undefined); navigate("work"); }} /> : null}
      </section>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onNotice={pushNotice} />
      <AboutPanel
        open={aboutOpen}
        onClose={closeAbout}
        onShowWorkspace={() => void window.los.showWorkspace()}
      />
    </main>
  );
}

function ResidencyView(props: {
  projects: LongTailProject[];
  targetProject?: string;
  plan?: ResidencyPlan;
  minutes: number;
  intensity: Intensity;
  activeSession: ResidencySession | null;
  closeNote: string;
  busy: boolean;
  onMinutesChange: (value: number) => void;
  onIntensityChange: (value: Intensity) => void;
  onPropose: () => void;
  onStart: () => void;
  onCancelProposal: () => void;
  onClose: (result: SessionResult, handoff?: ContextCapsule) => Promise<void>;
  onSession: (session: ResidencySession) => void;
  onCloseNoteChange: (value: string) => void;
  onExit: () => void;
  onNewSession: () => void;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [intensityPosition, setIntensityPosition] = useState(() => intensities.indexOf(props.intensity));

  useEffect(() => {
    setIntensityPosition(intensities.indexOf(props.intensity));
  }, [props.intensity]);

  const themePosition = props.activeSession
    ? intensities.indexOf(props.activeSession.intensity) : intensityPosition;
  const theme = residencyTheme(themePosition);
  const previewIntensity = intensities[Math.round(intensityPosition)] ?? props.intensity;
  const displayedIntensity =
    props.activeSession?.status === "proposed"
      ? props.activeSession.intensity
      : previewIntensity;
  const residencyState =
    props.activeSession?.status === "active"
      ? "session-active"
      : props.activeSession?.status === "proposed"
        ? "session-proposed"
        : "idle";

  return (
    <div
      className={`work-plane ${residencyState}`}
      style={theme}
      data-intensity={displayedIntensity}
    >
      <header className="residency-chrome">
        <div className="residency-identity">
          <span>Los Alamos</span>
        </div>
        <div className="residency-chrome-state" />
        {props.activeSession?.status !== "active" ? (
          <button className="residency-exit" onClick={props.onExit}>
            <ArrowLeft size={16} />
              返回此刻
          </button>
        ) : null}
      </header>

      <div className="residency-body">
        {props.activeSession && ["active", "paused", "closed"].includes(props.activeSession.status) ? (
          <div className="active-residency-canvas">
            <section className="time-slab">
              <SessionClock session={props.activeSession} />
            </section>
            <section className="focus-slab">
              <SessionContinuity
                key={props.activeSession.id}
                session={props.activeSession}
                note={props.closeNote}
                busy={props.busy}
                onClose={props.onClose}
                onNote={props.onCloseNoteChange}
                onNext={props.onNewSession}
                onExit={props.onExit}
                onSession={props.onSession}
                project={props.projects.find((project) => project.id === props.activeSession?.projectId)}
                onRefresh={props.onRefresh}
              />
            </section>
          </div>
        ) : props.activeSession?.status === "proposed" ? (
          <ResidencyProposal
            session={props.activeSession}
            busy={props.busy}
            onStart={props.onStart}
            onCancel={props.onCancelProposal}
            onSession={props.onSession}
          />
        ) : (
          <section className="residency-control">
            <div className="residency-console">
              <div className="prep-head">
                <strong>给出本轮约束</strong>
                {(props.targetProject || props.plan) && <span className="scope-label">{props.targetProject ?? props.plan?.title}</span>}
              </div>

              <div className="residency-instruments">
                <div className="instrument-cell">
                  <ClockDial
                    totalSeconds={props.minutes * 60}
                    label={`${props.minutes} 分钟`}
                  />
                </div>
                <div className="instrument-cell">
                  <LoadStack position={intensityPosition} label={previewIntensity} />
                </div>
              </div>

              <div className="residency-parameters">
                <TimeControl value={props.minutes} onChange={props.onMinutesChange} />

                <IntensitySlider
                  value={props.intensity}
                  position={intensityPosition}
                  onPositionChange={setIntensityPosition}
                  onChange={props.onIntensityChange}
                />
              </div>

              <div className="residency-submit">
                <button
                  className="begin-block"
                  disabled={props.busy || !props.projects.some(projectIsAvailable)}
                  onClick={props.onPropose}
                >
                  <strong>生成驻留提案</strong>
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ResidencyProposal(props: {
  session: ResidencySession;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSession: (session: ResidencySession) => void;
}): JSX.Element {
  return (
    <section className="residency-proposal">
      <div className="proposal-sheet">
        <header className="proposal-head">
          <span>{props.session.projectTitle}</span>
          <h2>{props.session.taskTitle}</h2>
        </header>

        <div className="proposal-rationale">
          <span>选择依据</span>
          <p>{props.session.selectionReason}</p>
        </div>
        {props.session.capsule?.summary && <div className="proposal-reentry"><span>上次停在</span><p>{props.session.capsule.summary}</p></div>}

        <div className="proposal-contract">
          <article>
            <span>第一动作</span>
            <p>{props.session.startAction}</p>
          </article>
          <article>
            <span>结束判断</span>
            <p>{props.session.completionCriteria}</p>
          </article>
          <article>
            <span>本轮边界</span>
            <p>{props.session.notDoing}</p>
          </article>
        </div>

        <footer className="proposal-footer">
          <div className="proposal-constraints">
            <span>{props.session.minutesPlanned} 分钟</span>
            <span>{intensityCopy[props.session.intensity].label}</span>
            <span>{scopeCopy[props.session.scope]}</span>
          </div>
          <div className="proposal-actions">
            <ProposalEditor session={props.session} onSaved={props.onSession} />
            <button disabled={props.busy} onClick={props.onCancel}>
              <RotateCcw size={15} />
              调整约束
            </button>
            <button className="primary" disabled={props.busy} onClick={props.onStart}>
              <Timer size={15} />
              确认并进入驻留
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

function TimeControl(props: { value: number; onChange: (value: number) => void }): JSX.Element {
  const presets = [15, 25, 45, 60];
  const update = (nextValue: number): void => props.onChange(clampToStep(nextValue, 5, 180, 5));

  return (
    <div className="time-control">
      <div className="control-heading">
        <span className="field-label">可用时间</span>
        <span>{formatEndTime(props.value)} 结束</span>
      </div>
      <div className="time-stepper">
        <button type="button" onClick={() => update(props.value - 5)} disabled={props.value <= 5} aria-label="减少 5 分钟">
          <Minus size={18} />
        </button>
        <output aria-live="polite">
          <strong>{props.value}</strong>
          <span>分钟</span>
        </output>
        <button type="button" onClick={() => update(props.value + 5)} disabled={props.value >= 180} aria-label="增加 5 分钟">
          <Plus size={18} />
        </button>
      </div>
      <div className="time-range-shell">
        <input
          aria-label="可用时间"
          type="range"
          min={5}
          max={180}
          step={5}
          value={props.value}
          style={{ "--time-progress": `${((props.value - 5) / 175) * 100}%` } as CSSProperties}
          onChange={(event) => update(Number(event.target.value))}
        />
        <div className="time-range-labels" aria-hidden="true">
          <span>5</span>
          <span>180</span>
        </div>
      </div>
      <div className="time-presets" aria-label="常用时长">
        {presets.map((minutes) => (
          <button
            type="button"
            key={minutes}
            className={props.value === minutes ? "active" : ""}
            aria-pressed={props.value === minutes}
            onClick={() => update(minutes)}
          >
            {minutes}
          </button>
        ))}
      </div>
    </div>
  );
}

function IntensitySlider(props: {
  value: Intensity;
  position: number;
  onPositionChange: (value: number) => void;
  onChange: (value: Intensity) => void;
}): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const progress = (props.position / (intensities.length - 1)) * 100;
  const previewIntensity = intensities[Math.round(props.position)] ?? props.value;

  const commit = (position = props.position): void => {
    const nextIndex = Math.round(position);
    props.onPositionChange(nextIndex);
    props.onChange(intensities[nextIndex] ?? "medium");
    setDragging(false);
  };

  const updatePosition = (position: number): void => {
    const nextPosition = Math.max(0, Math.min(3, position));
    props.onPositionChange(nextPosition);
  };

  return (
    <div className="intensity-slider">
      <div className="slider-head">
        <span className="field-label">工作强度</span>
      </div>
      <div
        className={`energy-range ${dragging ? "dragging" : ""}`}
        style={
          {
            "--intensity-progress": `${progress}%`
          } as CSSProperties
        }
      >
        <div className="energy-track" aria-hidden="true">
          <span className="energy-fill" />
          {intensities.map((intensity, index) => (
            <i
              className="energy-stop"
              key={intensity}
              style={{ left: `${(index / (intensities.length - 1)) * 100}%` }}
            />
          ))}
          <span className="energy-thumb" />
        </div>
        <input
          type="range"
          min={0}
          max={3}
          step={0.01}
          value={props.position}
          onPointerDown={() => setDragging(true)}
          onPointerUp={(event) => commit(Number(event.currentTarget.value))}
          onPointerCancel={(event) => commit(Number(event.currentTarget.value))}
          onBlur={(event) => commit(Number(event.currentTarget.value))}
          onChange={(event) => updatePosition(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            commit(Math.max(0, Math.min(3, Math.round(props.position) + direction)));
          }}
          aria-label="工作强度"
          aria-valuetext={previewIntensity}
        />
      </div>
      <div className="intensity-scale">
        {intensities.map((item, index) => (
          <button
            key={item}
            className={previewIntensity === item ? "active" : ""}
            onClick={() => commit(index)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="intensity-copy" aria-live="polite">
        <strong>{intensityCopy[previewIntensity].summary}</strong>
        <p>{intensityCopy[previewIntensity].detail}</p>
      </div>
    </div>
  );
}

function SessionClock({ session }: { session: ResidencySession }): JSX.Element {
  const elapsedSeconds = useSessionSeconds(session);

  return (
    <div className="session-clock">
      <div className="session-clock-head">
        <ClockDial
          totalSeconds={elapsedSeconds}
          active
          label={`已驻留 ${formatDuration(elapsedSeconds)}`}
        />
        <strong>{formatDuration(elapsedSeconds)}</strong>
      </div>
    </div>
  );
}

function ClockDial(props: {
  totalSeconds: number;
  active?: boolean;
  label: string;
}): JSX.Element {
  const dialStyle = {
    "--hour-angle": `${props.totalSeconds / 120}deg`,
    "--minute-angle": `${props.totalSeconds / 10}deg`,
    "--second-angle": `${props.totalSeconds * 6}deg`
  } as CSSProperties;

  return (
    <div
      className={`clock-dial ${props.active ? "active" : ""}`}
      style={dialStyle}
      role="img"
      aria-label={props.label}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <i
          className="clock-mark"
          key={index}
          style={{ "--mark-angle": `${index * 30}deg` } as CSSProperties}
        />
      ))}
      <span className="clock-hand hour" />
      <span className="clock-hand minute" />
      {props.active ? <span className="clock-hand second" /> : null}
      <span className="clock-pin" />
    </div>
  );
}

function LoadStack(props: { position: number; label: string }): JSX.Element {
  return (
    <div className="load-stack" role="img" aria-label={`${props.label} 工作负荷`}>
      {Array.from({ length: 4 }, (_, index) => {
        const load = Math.max(0, Math.min(1, props.position - index + 1));
        const direction = index % 2 === 0 ? -1 : 1;
        return (
          <span
            className="load-book"
            key={index}
            style={{
              bottom: `${18 + index * 20}px`,
              opacity: 0.1 + load * 0.9,
              transform: `translateY(${(1 - load) * 8}px) rotate(${direction * load * 1.2}deg) scaleX(${0.9 + load * 0.1})`
            }}
          >
            <Book size={14} strokeWidth={1.7} />
            <i />
          </span>
        );
      })}
    </div>
  );
}

function ProjectsView(props: {
  projects: LongTailProject[];
  sessions: ResidencySession[];
  selectedProject: LongTailProject | null;
  selectedProjectId: string | null;
  title: string;
  brief: string;
  busy: boolean;
  detailOpen: boolean;
  surfaceRequest: ProjectSurfaceRequest | null;
  onSelectProject: (id: string) => void;
  onBackToOverview: () => void;
  onTitleChange: (value: string) => void;
  onBriefChange: (value: string) => void;
  onCreateProject: (intake?: ProjectIntake) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenSession: () => void;
}): JSX.Element {
  const viewport = useViewport();
  const pageSize = projectPageSize(viewport.width, viewport.height);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [intake, setIntake] = useState<ProjectIntake>({ completed: "", remaining: "", closeCriteria: "" });
  const [createError, setCreateError] = useState("");
  const activeProjects = props.projects.filter(projectIsAvailable);
  const archivedProjects = props.projects.filter((project) => !projectIsAvailable(project));
  const listedProjects = showArchived ? archivedProjects : activeProjects;
  const totalPages = Math.max(1, Math.ceil(listedProjects.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    if (showArchived && archivedProjects.length === 0) {
      setShowArchived(false);
    }
  }, [archivedProjects.length, showArchived]);

  useEffect(() => {
    if (props.detailOpen || !props.selectedProjectId) return;
    const index = listedProjects.findIndex((project) => project.id === props.selectedProjectId);
    if (index >= 0) {
      setPage(Math.floor(index / pageSize));
    }
  }, [pageSize, props.detailOpen, props.selectedProjectId]);

  useEffect(() => {
    if (!props.surfaceRequest) return;
    setPage(0);
    if (props.surfaceRequest.surface === "archive") {
      setShowArchived(true);
      setCreateOpen(false);
    } else if (props.surfaceRequest.surface === "create") {
      setShowArchived(false);
      setCreateOpen(true);
    } else {
      setShowArchived(false);
      setCreateOpen(false);
    }
  }, [props.surfaceRequest?.id]);

  const visibleProjects = listedProjects.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => {
    if (!createOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createOpen]);

  if (props.detailOpen && props.selectedProject) {
    return (
      <div className="project-focus-plane" key={props.selectedProject.id}>
        <section className="inspect-slab">
          <ProjectWorkspace
            project={props.selectedProject}
            onBack={props.onBackToOverview}
            onRefresh={props.onRefresh}
            onOpenSession={props.onOpenSession}
            sessions={props.sessions.filter(
              (session) => session.projectId === props.selectedProject?.id
            )}
          />
        </section>
      </div>
    );
  }

  return (
    <div className={`projects-overview-plane ${showArchived ? "archive-overview-plane" : ""}`}>
      {!showArchived ? (
        <section className="overview-slab">
          <div className="overview-title">
            <h1>项目总览</h1>
            <p className="overview-intro">
              在 Los Alamos，把未关闭的中间状态暂时带离日常，在有限时间里推进一个可验证的入口。
            </p>
          </div>
        </section>
      ) : null}

      <section className="gallery-slab">
        {archivedProjects.length > 0 || listedProjects.length > pageSize ? (
          <div className="slab-head project-list-tools">
            <div className="project-list-heading">
              <button
                className={showArchived ? "active" : ""}
                onClick={() => {
                  setShowArchived((current) => !current);
                  setPage(0);
                }}
              >
                {showArchived ? "返回项目" : `已收起 ${archivedProjects.length}`}
              </button>
            </div>
            {listedProjects.length > pageSize ? (
              <Pager page={page} totalPages={totalPages} onChange={setPage} />
            ) : null}
          </div>
        ) : null}
        {listedProjects.length === 0 ? (
          <EmptyState
            label={showArchived ? "没有收起的项目" : "总览还是空的"}
            detail={showArchived ? "归档后的项目会集中在这里。" : "先加入一个项目，系统再帮你做拆分与驻留。"}
          />
        ) : (
          <div className="project-wall">
            {visibleProjects.map((project, index) => {
              const tone = (page * pageSize + index) % 5;

              return (
                <button
                  key={project.id}
                  className={`project-note tone-${tone}`}
                  onClick={() => props.onSelectProject(project.id)}
                  aria-label={`${project.title}，完成度 ${project.completionPercent}%`}
                >
                  <div className="project-note-title">
                    <h3>{project.title}</h3>
                    <span className="project-note-state">{project.resolution ? outcomeLabels[project.resolution.outcome] : "收尾进度"}
                      {project.resolution?.revisitAt && project.resolution.revisitAt <= localDate() ? " · 待回看" : ""}
                    </span>
                  </div>
                  <div className="project-note-progress">
                    <strong>{project.completionPercent}%</strong>
                    <div className="project-card-track">
                      <span style={{ width: `${project.completionPercent}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {!showArchived ? (
          <div className="project-wall-footer">
            <button className="project-note new-project-tile" onClick={() => setCreateOpen(true)}>
              <Plus size={22} strokeWidth={1.5} />
              <span>新增项目</span>
            </button>
          </div>
        ) : null}
      </section>

      {createOpen ? (
        <Dialog title="新增项目" className="project-create-card continuity-create" onClose={() => { if (!props.busy) setCreateOpen(false); }}>
            <label>
              <span>项目标题</span>
              <input
                value={props.title}
                onChange={(event) => props.onTitleChange(event.target.value)}
                placeholder="例如：论文修订、作品集收尾"
                autoFocus
              />
            </label>
            <label>
              <span>当前状态</span>
              <textarea
                value={props.brief}
                onChange={(event) => props.onBriefChange(event.target.value)}
                placeholder="已有材料、剩余工作、阻塞点、理想关闭标准"
              />
            </label>
            <IntakeFields value={intake} onChange={setIntake} />
            {createError && <p className="form-error" role="alert">{createError}</p>}
            <div className="create-card-foot">
              <button
                disabled={props.busy || !props.title.trim() || !props.brief.trim()}
                onClick={async () => {
                  try { await props.onCreateProject(intake); setCreateOpen(false); }
                  catch (error) { setCreateError(error instanceof Error ? error.message : String(error)); }
                }}
              >
                加入总览
              </button>
            </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function HistoryView({
  sessions,
  onOpenProject
}: {
  sessions: ResidencySession[];
  onOpenProject: (projectId: string) => void;
}): JSX.Element {
  const viewport = useViewport();
  const pageSize = historyPageSize(viewport.width, viewport.height);
  const [page, setPage] = useState(0);
  const closedSessions = sessions.filter((session) => session.status === "closed");
  const totalPages = Math.max(1, Math.ceil(closedSessions.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const visibleSessions = closedSessions.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="history-plane">
      <section className="history-slab">
        <h1>驻留记录</h1>
        {closedSessions.length > pageSize ? (
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        ) : null}
      </section>

      {closedSessions.length === 0 ? (
        <EmptyState label="还没有驻留记录" detail="开始第一段驻留之后，这里会沉淀每次推进结果。" />
      ) : (
        <div className="history-wall">
          {visibleSessions.map((session, index) => (
            <button
              key={session.id}
              className={`history-note tone-${(page * pageSize + index) % 5}`}
              onClick={() => onOpenProject(session.projectId)}
            >
              <div className="history-note-head">
                <time dateTime={session.startedAt}>{formatSessionDate(session.startedAt)}</time>
                <span>
                  {session.userResult
                    ? sessionResultCopy[session.userResult]
                    : session.status === "closed"
                      ? "已关闭"
                      : "进行中"}
                </span>
              </div>
              <div className="history-note-title">
                <h3>{session.taskTitle}</h3>
                <p>{session.projectTitle}</p>
              </div>
              <div className="history-note-footer">
                <span>{formatSessionMinutes(session)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Pager(props: { page: number; totalPages: number; onChange: (value: number) => void }): JSX.Element {
  return (
    <div className="pager">
      <button onClick={() => props.onChange(Math.max(0, props.page - 1))} disabled={props.page === 0} type="button">
        <ChevronLeft size={16} />
      </button>
      <span>
        {props.page + 1} / {props.totalPages}
      </span>
      <button
        onClick={() => props.onChange(Math.min(props.totalPages - 1, props.page + 1))}
        disabled={props.page >= props.totalPages - 1}
        type="button"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }): JSX.Element {
  return (
    <div className="empty-state">
      <strong>{label}</strong>
      <p>{detail}</p>
    </div>
  );
}

function extractPayload(request: unknown): { target?: string; id?: string } | null {
  if (typeof request !== "object" || request === null || !("payload" in request)) return null;
  const payload = (request as { payload: unknown }).payload;
  return typeof payload === "object" && payload !== null ? (payload as { target?: string; id?: string }) : null;
}

function useViewport(): { width: number; height: number } {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  useEffect(() => {
    const handleResize = (): void => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewport;
}

function projectPageSize(_width: number, height: number): number {
  return Math.max(3, Math.min(4, Math.floor((height - 250) / 86)));
}

function historyPageSize(_width: number, height: number): number {
  return Math.max(3, Math.min(7, Math.floor((height - 230) / 88)));
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.round(safeValue / step) * step));
}

function formatEndTime(minutes: number): string {
  const end = new Date(Date.now() + minutes * 60_000);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(end);
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatSessionMinutes(session: ResidencySession): string {
  if (!session.endedAt) {
    return `计划 ${session.minutesPlanned} 分钟`;
  }
  const actualMinutes = Math.max(
    1,
    Math.round(sessionElapsedSeconds(session) / 60)
  );
  return `${actualMinutes} / ${session.minutesPlanned} 分钟`;
}

function residencyTheme(position: number): CSSProperties {
  const clamped = Math.max(0, Math.min(intensityThemeStops.length - 1, position));
  const lowerIndex = Math.floor(clamped);
  const upperIndex = Math.min(intensityThemeStops.length - 1, Math.ceil(clamped));
  const ratio = clamped - lowerIndex;
  const lower = intensityThemeStops[lowerIndex];
  const upper = intensityThemeStops[upperIndex];
  const mix = (from: readonly number[], to: readonly number[]): string =>
    `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio)).join(", ")})`;

  return {
    "--energy-bg": mix(lower.background, upper.background),
    "--energy-soft": mix(lower.soft, upper.soft),
    "--energy-accent": mix(lower.accent, upper.accent),
    "--energy-ink": "#203b32",
    "--energy-muted": "rgba(32, 59, 50, 0.68)"
  } as CSSProperties;
}
