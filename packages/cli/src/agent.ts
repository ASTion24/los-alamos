import type {
  Intensity,
  LongTailProject,
  ResidencySession
} from "../../core/src";
import type { WorkspaceHealth } from "../../workspace/src";

const agentCommand = "./.los/los";

export const agentCapabilities = {
  protocolVersion: "1",
  entryCommand: `${agentCommand} agent context --json`,
  rules: [
    "Use CLI commands before editing JSON directly.",
    "Treat brief.md as user-provided facts and never invent missing facts.",
    "Do not perform the user's substantive project work.",
    "Never start a proposed session without explicit user confirmation.",
    "Never close a session without user feedback.",
    "Treat requested intensity as a hard ceiling."
  ],
  resources: {
    instructions: ["AGENTS.md", "CLAUDE.md", "skills/los-alamos-residency/SKILL.md"],
    workspaceRoot: "Read workspace.root from agent context output; never infer it.",
    standaloneLauncher: "<workspace-root>/.los/los",
    standaloneRuntime: "<workspace-root>/.los/los.mjs",
    projectFacts: "<workspace-root>/projects/<project-id>/brief.md",
    projectModel: "<workspace-root>/projects/<project-id>/model.json",
    projectEvents: "<workspace-root>/projects/<project-id>/events.jsonl",
    sessions: "<workspace-root>/sessions/<session-id>.json",
    schemas: "<workspace-root>/schemas/*.schema.json",
    contextSchema: "<workspace-root>/schemas/agent-context.schema.json"
  },
  commands: [
    {
      operation: "agent.context",
      command: `${agentCommand} agent context [--minutes <5-180>] [--intensity <low|medium|high|xhigh>] --json`
    },
    {
      operation: "agent.capabilities",
      command: `${agentCommand} agent capabilities --json`
    },
    {
      operation: "project.create",
      command: `${agentCommand} project add --title <title> --brief <facts> --json`,
      gui: "新增项目"
    },
    {
      operation: "project.list",
      command: `${agentCommand} project list --json`,
      gui: "项目总览"
    },
    {
      operation: "project.inspect",
      command: `${agentCommand} project inspect <project-id> --json`,
      gui: "项目详情"
    },
    {
      operation: "project.updateFacts",
      command: `${agentCommand} project update-brief <project-id> --brief <facts> --json`,
      gui: "更新项目事实"
    },
    {
      operation: "project.reanalyze",
      command: `${agentCommand} project reanalyze <project-id> --json`,
      gui: "重新建模"
    },
    {
      operation: "project.archive",
      command: `${agentCommand} project archive <project-id> --json`,
      gui: "归档项目"
    },
    {
      operation: "project.restore",
      command: `${agentCommand} project restore <project-id> --json`,
      gui: "恢复项目"
    },
    {
      operation: "task.update",
      command:
        `${agentCommand} task update <project-id> <task-id> [--title <text>] [--description <text>] [--status <status>] [--depends-on <id,id>] [--minutes <n>] [--intensity <level>] [--weight <n>] [--progress <0-100>] [--completion <text>] [--start <text>] [--not-doing <text>] [--notes <text>] --json`,
      gui: "任务校准"
    },
    {
      operation: "session.propose",
      command: `${agentCommand} session propose --minutes <5-180> --intensity <level> --json`,
      gui: "生成驻留提案"
    },
    {
      operation: "session.start",
      command: `${agentCommand} session start <session-id> --json`,
      gui: "开始驻留"
    },
    {
      operation: "session.cancel",
      command: `${agentCommand} session cancel <session-id> --json`,
      gui: "取消提案"
    },
    {
      operation: "session.close",
      command:
        `${agentCommand} session close <session-id> --result <completed|partial|not_completed> [--note <feedback>] --json`,
      gui: "结束驻留"
    },
    {
      operation: "workspace.health",
      command: `${agentCommand} workspace health --json`,
      gui: "模型设置 / 工作区"
    },
    {
      operation: "gui.open",
      command:
        `${agentCommand} open <projects|project|archive|create|residency|history|settings|about|session> [id] --json`
    }
  ]
} as const;

type AgentPhase =
  | "repair_workspace"
  | "needs_project"
  | "needs_constraints"
  | "ready_to_propose"
  | "review_proposal"
  | "residency_active";

interface AgentContextInput {
  workspaceRoot: string;
  health: WorkspaceHealth;
  projects: LongTailProject[];
  sessions: ResidencySession[];
  minutes?: number;
  intensity?: Intensity;
}

interface NextAction {
  id: string;
  type: "ask_user" | "run_command" | "wait_for_user";
  instruction: string;
  command?: string;
  requiresUserConfirmation?: boolean;
}

export function buildAgentContext(input: AgentContextInput): {
  protocolVersion: "1";
  phase: AgentPhase;
  summary: string;
  workspace: {
    root: string;
    ok: boolean;
    issues: WorkspaceHealth["issues"];
    projects: Array<{
      id: string;
      title: string;
      completionPercent: number;
      archived: boolean;
    }>;
  };
  session: ResidencySession | null;
  constraints: { minutes?: number; intensity?: Intensity };
  nextActions: NextAction[];
} {
  const projects = input.projects.map((project) => ({
    id: project.id,
    title: project.title,
    completionPercent: project.completionPercent,
    archived: Boolean(project.archivedAt)
  }));
  const activeProjects = input.projects.filter((project) => !project.archivedAt);
  const activeSession =
    input.sessions.find((session) => session.status === "active") ?? null;
  const proposedSession =
    input.sessions.find((session) => session.status === "proposed") ?? null;
  const constraints = {
    ...(input.minutes === undefined ? {} : { minutes: input.minutes }),
    ...(input.intensity === undefined ? {} : { intensity: input.intensity })
  };
  const workspace = {
    root: input.workspaceRoot,
    ok: input.health.ok,
    issues: input.health.issues,
    projects
  };

  if (!input.health.ok) {
    return {
      protocolVersion: "1",
      phase: "repair_workspace",
      summary: "工作区存在阻断性错误，先修复数据，再继续调度。",
      workspace,
      session: activeSession ?? proposedSession,
      constraints,
      nextActions: [
        {
          id: "inspect-health",
          type: "run_command",
          instruction: "读取完整健康报告，只修复报告列出的文件。",
          command: `${agentCommand} workspace health --json`
        }
      ]
    };
  }

  if (activeSession) {
    return {
      protocolVersion: "1",
      phase: "residency_active",
      summary: `驻留正在进行：${activeSession.taskTitle}`,
      workspace,
      session: activeSession,
      constraints,
      nextActions: [
        {
          id: "open-session",
          type: "run_command",
          instruction: "打开当前驻留界面。",
          command: `${agentCommand} open session ${activeSession.id} --json`
        },
        {
          id: "wait-feedback",
          type: "wait_for_user",
          instruction:
            "等待用户完成实际工作并报告 completed、partial 或 not_completed；没有反馈时不得关闭驻留。"
        }
      ]
    };
  }

  if (proposedSession) {
    return {
      protocolVersion: "1",
      phase: "review_proposal",
      summary: `驻留提案等待确认：${proposedSession.taskTitle}`,
      workspace,
      session: proposedSession,
      constraints,
      nextActions: [
        {
          id: "present-proposal",
          type: "ask_user",
          instruction:
            "向用户展示任务、选择依据、开始动作、完成标准和明确不做，并询问开始或取消。",
          requiresUserConfirmation: true
        },
        {
          id: "start-after-confirmation",
          type: "run_command",
          instruction: "仅在用户明确确认后开始。",
          command: `${agentCommand} session start ${proposedSession.id} --json`,
          requiresUserConfirmation: true
        },
        {
          id: "cancel-after-rejection",
          type: "run_command",
          instruction: "用户拒绝该提案时取消。",
          command: `${agentCommand} session cancel ${proposedSession.id} --json`,
          requiresUserConfirmation: true
        }
      ]
    };
  }

  if (activeProjects.length === 0) {
    return {
      protocolVersion: "1",
      phase: "needs_project",
      summary: "没有可调度的项目。",
      workspace,
      session: null,
      constraints,
      nextActions: [
        {
          id: "ask-project",
          type: "ask_user",
          instruction:
            "询问一个项目名称和当前事实：已有材料、剩余工作、阻塞点、理想关闭标准。不要补写用户未提供的事实。",
          requiresUserConfirmation: true
        },
        {
          id: "create-project",
          type: "run_command",
          instruction: "取得事实后创建项目。",
          command:
            `${agentCommand} project add --title "<用户项目名>" --brief "<用户提供的事实>" --json`,
          requiresUserConfirmation: true
        }
      ]
    };
  }

  if (input.minutes === undefined || input.intensity === undefined) {
    return {
      protocolVersion: "1",
      phase: "needs_constraints",
      summary: "项目已就绪，需要本轮时间和工作强度。",
      workspace,
      session: null,
      constraints,
      nextActions: [
        {
          id: "ask-constraints",
          type: "ask_user",
          instruction:
            "询问用户本轮可用分钟数（5-180）和最高强度（low、medium、high、xhigh）。",
          requiresUserConfirmation: true
        },
        {
          id: "refresh-context",
          type: "run_command",
          instruction: "取得约束后重新读取上下文。",
          command:
            `${agentCommand} agent context --minutes <5-180> --intensity <low|medium|high|xhigh> --json`,
          requiresUserConfirmation: true
        }
      ]
    };
  }

  return {
    protocolVersion: "1",
    phase: "ready_to_propose",
    summary: `可以按 ${input.minutes} 分钟、${input.intensity} 强度生成驻留提案。`,
    workspace,
    session: null,
    constraints,
    nextActions: [
      {
        id: "propose",
        type: "run_command",
        instruction: "生成可审阅提案；这一步不会开始计时。",
        command: `${agentCommand} session propose --minutes ${input.minutes} --intensity ${input.intensity} --json`
      },
      {
        id: "refresh-after-proposal",
        type: "run_command",
        instruction: "生成后重新读取上下文，并进入等待用户确认阶段。",
        command: `${agentCommand} agent context --json`
      }
    ]
  };
}
