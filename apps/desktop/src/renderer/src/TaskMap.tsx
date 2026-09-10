import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, Pause, Save, X } from "lucide-react";
import type { Intensity, TaskStatus, WorkUnit } from "./types";

interface TaskMapProps {
  tasks: WorkUnit[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

interface TaskEditorProps {
  task: WorkUnit;
  tasks: WorkUnit[];
  busy: boolean;
  onClose: () => void;
  onSave: (taskId: string, patch: Partial<WorkUnit>) => Promise<void>;
}

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "待办" },
  { value: "in_progress", label: "进行中" },
  { value: "done", label: "完成" },
  { value: "parked", label: "暂停" },
  { value: "killed", label: "终止" },
  { value: "unknown", label: "待确认" }
];

const intensities: Intensity[] = ["low", "medium", "high", "xhigh"];

export function TaskMap({ tasks, selectedTaskId, onSelectTask }: TaskMapProps): JSX.Element {
  const layout = useMemo(() => buildLayout(tasks), [tasks]);

  if (tasks.length === 0) {
    return <div className="task-map-empty">任务图还没有生成。</div>;
  }

  return (
    <div className="task-map-scroll">
      <svg
        className="task-map"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="任务依赖图"
        role="img"
      >
        <defs>
          <marker id="task-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="task-arrow-head" />
          </marker>
        </defs>

        {layout.layers.map((layer, index) => (
          <text key={index} x={layer.x} y={18} className="task-map-phase">
            第 {String(index + 1).padStart(2, "0")} 层
          </text>
        ))}

        {layout.connections.map((connection) => {
          const source = tasks.find((task) => task.id === connection.from);
          const target = tasks.find((task) => task.id === connection.to);
          const flowState =
            target?.status === "in_progress"
              ? "active-flow"
              : source?.status === "done" && target?.status === "todo"
                ? "ready-flow"
                : "";
          return (
            <path
              key={`${connection.from}-${connection.to}`}
              d={`M ${connection.x1} ${connection.y1} C ${connection.x1 + 42} ${connection.y1}, ${connection.x2 - 42} ${connection.y2}, ${connection.x2} ${connection.y2}`}
              className={`task-connection ${flowState}`}
              markerEnd="url(#task-arrow)"
            />
          );
        })}

        {layout.nodes.map(({ task, x, y }) => (
          <foreignObject key={task.id} x={x} y={y} width={190} height={98}>
            <button
              className={`map-node ${task.status} ${selectedTaskId === task.id ? "selected" : ""}`}
              onClick={() => onSelectTask(task.id)}
              title={task.description}
              type="button"
            >
              <span className="map-node-state">{statusLabel(task.status)}</span>
              <strong>{task.title}</strong>
              <span className="map-node-meta">
                {task.progressPercent}% · {task.effortMinutes} 分钟 · {task.intensity}
              </span>
            </button>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

export function WeightedProgress({ tasks, value }: { tasks: WorkUnit[]; value: number }): JSX.Element {
  const activeTasks = tasks.filter((task) => task.status !== "killed");
  const totalWeight = activeTasks.reduce((sum, task) => sum + Math.max(task.weight, 0), 0) || 1;

  return (
    <div className="weighted-progress">
      <div className="weighted-progress-label">
        <span>加权收尾进度</span>
        <strong>{value}%</strong>
      </div>
      <div className="weighted-progress-track" aria-label={`完成度 ${value}%`}>
        {activeTasks.map((task) => (
          <span
            key={task.id}
            className={`progress-segment ${task.status}`}
            style={{
              width: `${(Math.max(task.weight, 0) / totalWeight) * 100}%`,
              background: `linear-gradient(90deg, var(--pine) ${task.progressPercent}%, var(--surface-deep) ${task.progressPercent}%)`
            }}
            title={`${task.title}：${statusLabel(task.status)}，权重 ${task.weight}`}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskEditor({ task, tasks, busy, onClose, onSave }: TaskEditorProps): JSX.Element {
  const [draft, setDraft] = useState<WorkUnit>(task);
  const [dependencyPage, setDependencyPage] = useState(0);
  const dependencyCandidates = tasks.filter((candidate) => candidate.id !== draft.id);
  const dependencyPageSize = 6;
  const dependencyPageCount = Math.max(1, Math.ceil(dependencyCandidates.length / dependencyPageSize));
  const visibleDependencies = dependencyCandidates.slice(
    dependencyPage * dependencyPageSize,
    (dependencyPage + 1) * dependencyPageSize
  );

  useEffect(() => {
    setDraft(task);
    setDependencyPage(0);
  }, [task]);

  useEffect(() => {
    setDependencyPage((current) => Math.min(current, dependencyPageCount - 1));
  }, [dependencyPageCount]);

  const set = <K extends keyof WorkUnit>(key: K, value: WorkUnit[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="task-editor">
      <header className="task-editor-head">
        <h3>任务校准</h3>
        <button className="icon-button" onClick={onClose} title="关闭任务编辑" aria-label="关闭任务编辑" type="button">
          <X size={17} />
        </button>
      </header>

      <div className="editor-primary-grid">
        <label className="editor-field">
          <span>标题</span>
          <input value={draft.title} onChange={(event) => set("title", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>说明</span>
          <textarea value={draft.description} onChange={(event) => set("description", event.target.value)} />
        </label>
      </div>

      <div className="status-strip">
        {statuses.map((status) => (
          <button
            key={status.value}
            className={draft.status === status.value ? "active" : ""}
            onClick={() => set("status", status.value)}
            type="button"
          >
            {statusIcon(status.value)}
            {status.label}
          </button>
        ))}
      </div>

      <div className="editor-grid">
        <label className="editor-field">
          <span>预计分钟</span>
          <input
            type="number"
            min={1}
            value={draft.effortMinutes}
            onChange={(event) => set("effortMinutes", Number(event.target.value))}
          />
        </label>
        <label className="editor-field">
          <span>权重</span>
          <input
            type="number"
            min={0}
            value={draft.weight}
            onChange={(event) => set("weight", Number(event.target.value))}
          />
        </label>
        <label className="editor-field">
          <span>完成度</span>
          <input
            type="number"
            min={0}
            max={100}
            value={draft.progressPercent}
            onChange={(event) => set("progressPercent", Number(event.target.value))}
          />
        </label>
        <label className="editor-field">
          <span>强度</span>
          <select value={draft.intensity} onChange={(event) => set("intensity", event.target.value as Intensity)}>
            {intensities.map((intensity) => (
              <option key={intensity} value={intensity}>
                {intensity}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="editor-boundary-grid">
        <label className="editor-field">
          <span>开始动作</span>
          <textarea value={draft.startAction} onChange={(event) => set("startAction", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>完成标准</span>
          <textarea
            value={draft.completionCriteria}
            onChange={(event) => set("completionCriteria", event.target.value)}
          />
        </label>
        <label className="editor-field">
          <span>明确不做</span>
          <textarea value={draft.notDoing} onChange={(event) => set("notDoing", event.target.value)} />
        </label>
      </div>

      <div className="editor-foot">
        <fieldset className="dependency-field">
          <legend>
            <span>依赖任务</span>
            {dependencyPageCount > 1 ? (
              <span className="dependency-pager">
                <button
                  type="button"
                  disabled={dependencyPage === 0}
                  onClick={() => setDependencyPage((current) => Math.max(0, current - 1))}
                  aria-label="上一页依赖"
                >
                  ‹
                </button>
                {dependencyPage + 1}/{dependencyPageCount}
                <button
                  type="button"
                  disabled={dependencyPage >= dependencyPageCount - 1}
                  onClick={() =>
                    setDependencyPage((current) => Math.min(dependencyPageCount - 1, current + 1))
                  }
                  aria-label="下一页依赖"
                >
                  ›
                </button>
              </span>
            ) : null}
          </legend>
          <div>
            {visibleDependencies.map((candidate) => (
              <label key={candidate.id}>
                <input
                  type="checkbox"
                  checked={draft.dependsOn.includes(candidate.id)}
                  onChange={(event) => {
                    const dependsOn = event.target.checked
                      ? [...draft.dependsOn, candidate.id]
                      : draft.dependsOn.filter((dependencyId) => dependencyId !== candidate.id);
                    set("dependsOn", dependsOn);
                  }}
                />
                <span>{candidate.title}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="save-task"
          disabled={busy || !draft.title.trim()}
          onClick={() =>
            void onSave(task.id, {
              title: draft.title,
              description: draft.description,
              status: draft.status,
              dependsOn: draft.dependsOn,
              effortMinutes: draft.effortMinutes,
              intensity: draft.intensity,
              weight: draft.weight,
              progressPercent: draft.progressPercent,
              completionCriteria: draft.completionCriteria,
              startAction: draft.startAction,
              notDoing: draft.notDoing
            })
          }
        >
          <Save size={16} />
          保存任务
        </button>
      </div>
    </section>
  );
}

function buildLayout(tasks: WorkUnit[]): {
  width: number;
  height: number;
  layers: Array<{ x: number }>;
  nodes: Array<{ task: WorkUnit; x: number; y: number }>;
  connections: Array<{ from: string; to: string; x1: number; y1: number; x2: number; y2: number }>;
} {
  const depthMemo = new Map<string, number>();
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const depthOf = (task: WorkUnit, visiting = new Set<string>()): number => {
    const cached = depthMemo.get(task.id);
    if (cached !== undefined) return cached;
    if (visiting.has(task.id)) return 0;

    visiting.add(task.id);
    const dependencyDepths = task.dependsOn
      .map((dependencyId) => byId.get(dependencyId))
      .filter((dependency): dependency is WorkUnit => Boolean(dependency))
      .map((dependency) => depthOf(dependency, visiting) + 1);
    visiting.delete(task.id);

    const depth = dependencyDepths.length > 0 ? Math.max(...dependencyDepths) : 0;
    depthMemo.set(task.id, depth);
    return depth;
  };

  const layerCount = Math.max(1, ...tasks.map((task) => depthOf(task) + 1));
  const layers = Array.from({ length: layerCount }, (_, index) => ({ x: 24 + index * 230 }));
  const grouped = layers.map((_, depth) => tasks.filter((task) => depthOf(task) === depth));
  const height = Math.max(180, ...grouped.map((layer) => 44 + layer.length * 118));
  const nodes = grouped.flatMap((layer, depth) =>
    layer.map((task, index) => ({
      task,
      x: layers[depth].x,
      y: 36 + index * 118
    }))
  );
  const positionById = new Map(nodes.map((node) => [node.task.id, node]));
  const connections = nodes.flatMap((node) =>
    node.task.dependsOn.flatMap((dependencyId) => {
      const dependency = positionById.get(dependencyId);
      if (!dependency) return [];
      return [
        {
          from: dependencyId,
          to: node.task.id,
          x1: dependency.x + 190,
          y1: dependency.y + 49,
          x2: node.x,
          y2: node.y + 49
        }
      ];
    })
  );

  return {
    width: Math.max(720, 48 + layerCount * 230),
    height,
    layers,
    nodes,
    connections
  };
}

function statusLabel(status: TaskStatus): string {
  return statuses.find((candidate) => candidate.value === status)?.label ?? status;
}

function statusIcon(status: TaskStatus): JSX.Element {
  if (status === "done") return <Check size={14} />;
  if (status === "parked") return <Pause size={14} />;
  if (status === "killed") return <X size={14} />;
  return <CircleDashed size={14} />;
}
