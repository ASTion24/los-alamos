import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Book,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  FolderOpen,
  History,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Timer,
  X
} from "lucide-react";
import { AboutPanel } from "./AboutPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TaskEditor, TaskMap, WeightedProgress } from "./TaskMap";
import type {
  Intensity,
  LongTailProject,
  ResidencySession,
  SessionResult,
  WorkUnit,
  WorkspaceHealth
} from "./types";
import "./styles.css";

type View = "work" | "projects" | "history";

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
  { background: [171, 190, 181], soft: [232, 239, 233], accent: [62, 91, 75] },
  { background: [194, 177, 132], soft: [242, 235, 218], accent: [112, 87, 47] },
  { background: [179, 119, 103], soft: [241, 222, 214], accent: [128, 65, 53] },
  { background: [93, 68, 87], soft: [229, 216, 226], accent: [58, 35, 53] }
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
  const [view, setView] = useState<View>("projects");
  const [projects, setProjects] = useState<LongTailProject[]>([]);
  const [sessions, setSessions] = useState<ResidencySession[]>([]);
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
    const [nextProjects, nextSessions, nextHealth] = await Promise.all([
      window.los.listProjects(),
      window.los.listSessions(),
      window.los.getWorkspaceHealth()
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
    setWorkspaceHealth(nextHealth);
    setSelectedProjectId((current) => {
      if (current && nextProjects.some((project) => project.id === current)) return current;
      return nextProjects[0]?.id ?? null;
    });
    setActiveSession((current) => {
      if (current) {
        return normalizedSessions.find((session) => session.id === current.id) ?? current;
      }
      return (
        normalizedSessions.find((session) => session.status === "active") ??
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
    void reload();
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
      void reload();
    });
    const unsubscribeWorkspace = window.los.onWorkspaceChanged(() => {
      void reload();
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
      if (!(event.metaKey || event.ctrlKey) || settingsOpen || activeSession?.status === "active") {
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

  async function handleCreateProject(): Promise<void> {
    if (!title.trim() || !brief.trim()) return;
    setBusy(true);
    try {
      const project = await window.los.createProject({ title, brief });
      setTitle("");
      setBrief("");
      await reload();
      openProject(project.id);
      pushNotice("项目已加入总览。");
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePropose(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const session = await window.los.proposeSession({ minutes, intensity });
      setActiveSession(session);
      if (session) {
        navigate("work");
      } else {
        pushNotice("当前强度下，没有适合的未阻塞任务。");
      }
      await reload();
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(result: SessionResult): Promise<void> {
    if (!activeSession) return;
    setBusy(true);
    try {
      const closed = await window.los.closeSession({
        sessionId: activeSession.id,
        result,
        note: closeNote.trim() || undefined
      });
      setActiveSession(closed);
      setCloseNote("");
      await reload();
      pushNotice("本次驻留已写入记录。");
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
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

  async function handleUpdateTask(
    projectId: string,
    taskId: string,
    patch: Partial<WorkUnit>
  ): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const updatedProject = await window.los.updateTask({ projectId, taskId, patch });
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project))
      );
      pushNotice("任务已更新。");
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReanalyzeProject(projectId: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const updatedProject = await window.los.reanalyzeProject(projectId);
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project))
      );
      pushNotice(`任务图已重建，共 ${updatedProject.taskGraph.tasks.length} 个任务。`);
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateProjectBrief(projectId: string, nextBrief: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const savedProject = await window.los.updateProjectBrief({
        projectId,
        brief: nextBrief
      });
      setProjects((current) =>
        current.map((project) => (project.id === savedProject.id ? savedProject : project))
      );
      try {
        const rebuiltProject = await window.los.reanalyzeProject(projectId);
        setProjects((current) =>
          current.map((project) => (project.id === rebuiltProject.id ? rebuiltProject : project))
        );
        pushNotice("项目事实与任务图已更新。");
      } catch (error) {
        pushNotice(
          `项目事实已保存，任务图重建失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetProjectArchived(projectId: string, archived: boolean): Promise<void> {
    setBusy(true);
    try {
      const updatedProject = await window.los.setProjectArchived({ projectId, archived });
      setProjects((current) =>
        current.map((project) => (project.id === updatedProject.id ? updatedProject : project))
      );
      setProjectDetailOpen(false);
      pushNotice(archived ? "项目已归档。" : "项目已恢复。");
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
          <button className="wordmark" onClick={() => navigate("projects")}>
            Los Alamos
          </button>
          <div className="titlebar-drag" />
          <div className="app-commands">
            {view === "history" ? (
              <button className="command-button" onClick={() => navigate("projects")}>
                <ArrowLeft size={15} />
                项目
              </button>
            ) : null}
            <button className="command-button primary" onClick={() => navigate("work")}>
              <Timer size={16} />
              驻留
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

      <section className={`stage ${residencyOpen ? "residency-stage" : ""}`}>
        {notice ? <div className="notice-line">{notice.message}</div> : null}
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
            onUpdateTask={handleUpdateTask}
            onReanalyzeProject={handleReanalyzeProject}
            onUpdateProjectBrief={handleUpdateProjectBrief}
            onSetProjectArchived={handleSetProjectArchived}
            onOpenSession={() => navigate("work")}
          />
        ) : null}

        {view === "work" ? (
          <ResidencyView
            projects={projects.filter((project) => !project.archivedAt)}
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
            onCloseNoteChange={setCloseNote}
            onExit={() => navigate("projects")}
            onNewSession={() => setActiveSession(null)}
          />
        ) : null}

        {view === "history" ? <HistoryView sessions={sessions} onOpenProject={openProject} /> : null}
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
  onClose: (result: SessionResult) => void;
  onCloseNoteChange: (value: string) => void;
  onExit: () => void;
  onNewSession: () => void;
}): JSX.Element {
  const [intensityPosition, setIntensityPosition] = useState(() => intensities.indexOf(props.intensity));

  useEffect(() => {
    setIntensityPosition(intensities.indexOf(props.intensity));
  }, [props.intensity]);

  const activeStartedAt =
    props.activeSession?.status === "active" ? props.activeSession.startedAt : null;
  const [skyNow, setSkyNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeStartedAt) return;
    const timer = window.setInterval(() => setSkyNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeStartedAt]);

  const skyElapsedSeconds = activeStartedAt
    ? Math.max(0, Math.floor((skyNow - new Date(activeStartedAt).getTime()) / 1000))
    : 0;
  const themePosition =
    props.activeSession?.status === "proposed"
      ? intensities.indexOf(props.activeSession.intensity)
      : intensityPosition;
  const theme =
    props.activeSession?.status === "active"
      ? sessionSkyTheme(skyElapsedSeconds)
      : residencyTheme(themePosition);
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
            返回项目
          </button>
        ) : null}
      </header>

      <div className="residency-body">
        {props.activeSession?.status === "active" ? (
          <div className="active-residency-canvas">
            <section className="time-slab">
              <SessionClock session={props.activeSession} />
            </section>
            <section className="focus-slab">
              <SessionSurface
                session={props.activeSession}
                closeNote={props.closeNote}
                busy={props.busy}
                onClose={props.onClose}
                onCloseNoteChange={props.onCloseNoteChange}
                onNewSession={props.onNewSession}
              />
            </section>
          </div>
        ) : props.activeSession?.status === "proposed" ? (
          <ResidencyProposal
            session={props.activeSession}
            busy={props.busy}
            onStart={props.onStart}
            onCancel={props.onCancelProposal}
          />
        ) : (
          <section className="residency-control">
            <div className="residency-console">
              <div className="prep-head">
                <strong>给出本轮约束</strong>
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
                  disabled={props.busy || props.projects.length === 0}
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
  const elapsedSeconds = useElapsedSeconds(session.startedAt, session.endedAt);

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

function SessionSurface(props: {
  session: ResidencySession;
  closeNote: string;
  busy: boolean;
  onClose: (result: SessionResult) => void;
  onCloseNoteChange: (value: string) => void;
  onNewSession: () => void;
}): JSX.Element {
  const elapsedSeconds = useElapsedSeconds(props.session.startedAt, props.session.endedAt);
  const plannedSeconds = Math.max(1, props.session.minutesPlanned * 60);
  const elapsedPercent = Math.min(100, Math.round((elapsedSeconds / plannedSeconds) * 100));

  return (
    <div className="session-surface">
      <div className="session-time-track">
        <span style={{ width: `${elapsedPercent}%` }} />
      </div>
      <div className="session-title">
        <p className="project-name">{props.session.projectTitle}</p>
        <h2>{props.session.taskTitle}</h2>
      </div>
      <Block label="开始动作" text={props.session.startAction} />
      <Block label="完成标准" text={props.session.completionCriteria} />
      <Block label="明确不做" text={props.session.notDoing} />

      {props.session.status !== "closed" ? (
        <div className="finish-strip">
          <textarea
            value={props.closeNote}
            onChange={(event) => props.onCloseNoteChange(event.target.value)}
            placeholder="补充一两句这次推进情况（可选）"
          />
          <div className="finish-actions">
            <button onClick={() => props.onClose("not_completed")} disabled={props.busy}>
              未完成
            </button>
            <button onClick={() => props.onClose("partial")} disabled={props.busy}>
              部分完成
            </button>
            <button onClick={() => props.onClose("completed")} disabled={props.busy}>
              已完成
            </button>
          </div>
        </div>
      ) : (
        <div className="session-complete">
          <div className="session-result">
            <span>结果</span>
            <strong>{props.session.userResult ? sessionResultCopy[props.session.userResult] : "已记录"}</strong>
          </div>
          <p className="session-log">{props.session.log ?? props.session.prompt}</p>
          <button className="new-session-button" onClick={props.onNewSession}>
            <RotateCcw size={15} />
            再开始一段
          </button>
        </div>
      )}
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
  onCreateProject: () => Promise<void>;
  onUpdateTask: (projectId: string, taskId: string, patch: Partial<WorkUnit>) => Promise<void>;
  onReanalyzeProject: (projectId: string) => Promise<void>;
  onUpdateProjectBrief: (projectId: string, brief: string) => Promise<void>;
  onSetProjectArchived: (projectId: string, archived: boolean) => Promise<void>;
  onOpenSession: () => void;
}): JSX.Element {
  const viewport = useViewport();
  const pageSize = projectPageSize(viewport.width, viewport.height);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const activeProjects = props.projects.filter((project) => !project.archivedAt);
  const archivedProjects = props.projects.filter((project) => Boolean(project.archivedAt));
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
          <ProjectDetail
            project={props.selectedProject}
            busy={props.busy}
            onBack={props.onBackToOverview}
            onUpdateTask={(taskId, patch) => props.onUpdateTask(props.selectedProject?.id ?? "", taskId, patch)}
            onReanalyze={() => props.onReanalyzeProject(props.selectedProject?.id ?? "")}
            onUpdateBrief={(brief) =>
              props.onUpdateProjectBrief(props.selectedProject?.id ?? "", brief)
            }
            onSetArchived={(archived) =>
              props.onSetProjectArchived(props.selectedProject?.id ?? "", archived)
            }
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
                {showArchived ? "返回项目" : `归档 ${archivedProjects.length}`}
              </button>
            </div>
            {listedProjects.length > pageSize ? (
              <Pager page={page} totalPages={totalPages} onChange={setPage} />
            ) : null}
          </div>
        ) : null}
        {listedProjects.length === 0 ? (
          <EmptyState
            label={showArchived ? "没有归档项目" : "总览还是空的"}
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
        <section className="project-create-plane" onClick={() => setCreateOpen(false)}>
          <div className="project-create-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>新增项目</h2>
              </div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="关闭新增项目">
                <X size={18} />
              </button>
            </header>
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
            <div className="create-card-foot">
              <button
                disabled={props.busy || !props.title.trim() || !props.brief.trim()}
                onClick={() => {
                  setCreateOpen(false);
                  void props.onCreateProject();
                }}
              >
                加入总览
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProjectDetail(props: {
  project: LongTailProject;
  sessions: ResidencySession[];
  busy: boolean;
  onBack: () => void;
  onUpdateTask: (taskId: string, patch: Partial<WorkUnit>) => Promise<void>;
  onReanalyze: () => Promise<void>;
  onUpdateBrief: (brief: string) => Promise<void>;
  onSetArchived: (archived: boolean) => Promise<void>;
  onOpenSession: () => void;
}): JSX.Element {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState(props.project.brief);
  const selectedTask = props.project.taskGraph.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const nextTask = nextReadyTask(props.project);
  const recentSession = props.sessions[0] ?? null;

  useEffect(() => {
    setBriefDraft(props.project.brief);
  }, [props.project.brief]);

  useEffect(() => {
    if (!briefOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setBriefOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [briefOpen]);

  return (
    <div className="project-detail">
      <div className="project-titleline">
        <button className="back-button" onClick={props.onBack}>
          <ArrowLeft size={17} />
          返回总览
        </button>
        <div className="project-heading">
          <h2>{props.project.title}</h2>
        </div>
        <div className="project-title-actions">
          <button
            className="icon-button"
            onClick={() => setBriefOpen(true)}
            title="更新项目事实"
            aria-label="更新项目事实"
          >
            <FilePenLine size={15} />
          </button>
          <button
            className="icon-button"
            disabled={props.busy}
            onClick={() => void props.onReanalyze()}
            title="重建任务图"
            aria-label="重建任务图"
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="icon-button"
            disabled={props.busy}
            onClick={() => void props.onSetArchived(!props.project.archivedAt)}
            title={props.project.archivedAt ? "恢复项目" : "归档项目"}
            aria-label={props.project.archivedAt ? "恢复项目" : "归档项目"}
          >
            {props.project.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </button>
          {!props.project.archivedAt ? (
            <button className="cta-button" onClick={props.onOpenSession}>
              <Timer size={15} />
              开始驻留
            </button>
          ) : null}
        </div>
      </div>

      <div className="detail-grid">
        <article className="detail-card">
          <span>当前状态</span>
          <p>{props.project.currentState}</p>
        </article>
        <article className="detail-card">
          <span>下一入口</span>
          <p>
            {nextTask
              ? `${nextTask.title}：${nextTask.startAction}`
              : "当前没有未阻塞的可执行任务。"}
          </p>
        </article>
        <article className="detail-card">
          <span>最近推进</span>
          <p>
            {recentSession
              ? recentSession.judgement ?? recentSession.userNote ?? recentSession.log ?? recentSession.prompt
              : "尚无驻留记录。"}
          </p>
        </article>
        <article className="detail-card">
          <span>关闭标准</span>
          <p>{props.project.closeCriteria.join("；") || "尚未定义关闭标准。"}</p>
        </article>
      </div>

      <WeightedProgress tasks={props.project.taskGraph.tasks} value={props.project.completionPercent} />

      <div className="task-map-shell">
        <div className="slab-head compact">
          <strong>任务图</strong>
        </div>
        <TaskMap
          tasks={props.project.taskGraph.tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
        />
      </div>

      {selectedTask ? (
        <TaskEditor
          task={selectedTask}
          tasks={props.project.taskGraph.tasks}
          busy={props.busy}
          onClose={() => setSelectedTaskId(null)}
          onSave={props.onUpdateTask}
        />
      ) : null}

      {briefOpen ? (
        <section className="project-brief-plane" onClick={() => setBriefOpen(false)}>
          <div className="project-brief-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>更新项目事实</h3>
              <button
                className="icon-button"
                onClick={() => setBriefOpen(false)}
                aria-label="关闭项目事实"
              >
                <X size={17} />
              </button>
            </header>
            <textarea
              value={briefDraft}
              onChange={(event) => setBriefDraft(event.target.value)}
              autoFocus
            />
            <footer>
              <button
                disabled={props.busy || !briefDraft.trim()}
                onClick={() => {
                  void props.onUpdateBrief(briefDraft).then(() => setBriefOpen(false));
                }}
              >
                保存并重建任务图
              </button>
            </footer>
          </div>
        </section>
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

function Block({ label, text }: { label: string; text: string }): JSX.Element {
  return (
    <div className="block-line">
      <span>{label}</span>
      <p>{text}</p>
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

function useElapsedSeconds(startedAt: string, endedAt?: string): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endedAt]);

  const end = endedAt ? new Date(endedAt).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
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

function nextReadyTask(project: LongTailProject): WorkUnit | null {
  if (project.archivedAt) return null;
  const byId = new Map(project.taskGraph.tasks.map((task) => [task.id, task]));
  return (
    project.taskGraph.tasks
      .filter((task) => ["todo", "in_progress", "unknown"].includes(task.status))
      .filter((task) =>
        task.dependsOn.every((dependencyId) => byId.get(dependencyId)?.status === "done")
      )
      .sort((left, right) => {
        const statusDifference =
          Number(right.status === "in_progress") - Number(left.status === "in_progress");
        return statusDifference || right.weight - left.weight;
      })[0] ?? null
  );
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
    Math.round(
      (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000
    )
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
    "--energy-ink": clamped < 1.5 ? "#202820" : "#fff7e8",
    "--energy-muted": clamped < 1.5 ? "rgba(32, 40, 32, 0.68)" : "rgba(255, 247, 232, 0.74)"
  } as CSSProperties;
}

const skyThemeStops = [
  { at: 0, background: [222, 191, 163], soft: [245, 229, 215], accent: [162, 96, 66] },
  { at: 0.16, background: [169, 197, 211], soft: [224, 235, 238], accent: [75, 111, 132] },
  { at: 0.4, background: [114, 165, 193], soft: [205, 224, 232], accent: [48, 91, 117] },
  { at: 0.58, background: [215, 132, 94], soft: [244, 216, 202], accent: [133, 65, 50] },
  { at: 0.7, background: [100, 73, 99], soft: [219, 201, 214], accent: [65, 39, 65] },
  { at: 0.84, background: [35, 43, 69], soft: [75, 83, 111], accent: [222, 175, 120] },
  { at: 1, background: [222, 191, 163], soft: [245, 229, 215], accent: [162, 96, 66] }
] as const;

function sessionSkyTheme(elapsedSeconds: number): CSSProperties {
  const cycleSeconds = 10 * 60;
  const progress = (elapsedSeconds % cycleSeconds) / cycleSeconds;
  const upperIndex = skyThemeStops.findIndex((stop) => stop.at >= progress);
  const safeUpperIndex = upperIndex <= 0 ? 1 : upperIndex;
  const lower = skyThemeStops[safeUpperIndex - 1];
  const upper = skyThemeStops[safeUpperIndex];
  const ratio = (progress - lower.at) / Math.max(upper.at - lower.at, 0.001);
  const mix = (from: readonly number[], to: readonly number[]): string =>
    `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio)).join(", ")})`;
  const night = progress >= 0.67 && progress < 0.95;

  return {
    "--energy-bg": mix(lower.background, upper.background),
    "--energy-soft": mix(lower.soft, upper.soft),
    "--energy-accent": mix(lower.accent, upper.accent),
    "--energy-ink": night ? "#fff4ea" : "#293238",
    "--energy-muted": night ? "rgba(255, 244, 234, 0.7)" : "rgba(41, 50, 56, 0.68)",
    "--day-progress": `${progress}`
  } as CSSProperties;
}
