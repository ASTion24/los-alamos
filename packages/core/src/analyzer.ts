import type { ContextCapsule, LongTailProject, ProjectIntake, WorkUnit } from "./types";
import { SCHEMA_VERSION } from "./types";
import { refreshProjectProgress } from "./progress";

export interface AnalyzeProjectInput {
  id: string;
  title: string;
  brief: string;
  now: string;
  intake?: ProjectIntake;
  context?: ContextCapsule;
}

export function analyzeProjectFast(input: AnalyzeProjectInput): LongTailProject {
  const title = input.title.trim();
  const brief = input.brief.trim();
  const remaining = input.intake?.remaining.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  const criteria = input.intake?.closeCriteria.trim();
  const tasks: WorkUnit[] = remaining.length ? remaining.map((action, index) => makeTask({
    id: `t${index + 1}`,
    title: action,
    description: action,
    effortMinutes: 25,
    intensity: "medium",
    weight: 1,
    startAction: action,
    completionCriteria: `已完成：${action}`,
    notDoing: "不扩展到清单之外的优化。"
  })) : [{
    ...makeTask({
      id: "clarify",
      title: "确认一个可以关闭的入口",
      description: "当前事实不足以推断实际剩余工作。",
      effortMinutes: 10,
      intensity: "low",
      weight: 0,
      startAction: "写下剩余动作和足以停止关注的关闭标准。",
      completionCriteria: "剩余工作和关闭标准已由本人确认。",
      notDoing: "不把整理计划计为项目产出。"
    }),
    status: "unknown"
  }];

  const project: LongTailProject = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    title,
    brief,
    goal: inferGoal(title, brief),
    closeCriteria: criteria ? [criteria] : [],
    currentState: inferCurrentState(brief),
    unknowns: remaining.length ? [
      "任务时间、强度与权重为初始估计；依赖关系尚需确认。",
      ...(!criteria ? ["尚未确认关闭标准。"] : [])
    ] : inferUnknowns(brief),
    taskGraph: { tasks },
    completionPercent: 0,
    confidence: "low",
    compact: remaining.length ? `下一步：${remaining[0]}` : `项目已加入。下一步：确认剩余工作。`,
    intake: input.intake,
    capsule: {
      summary: input.intake?.completed || inferCurrentState(brief),
      decisions: [],
      artifacts: [],
      blocker: "",
      nextAction: tasks[0].startAction,
      notDoing: tasks[0].notDoing,
      taskId: tasks[0].id,
      updatedAt: input.now
    },
    createdAt: input.now,
    updatedAt: input.now,
    updatedBy: "app",
    revision: 1
  };

  return refreshProjectProgress(project);
}

function makeTask(
  task: Omit<WorkUnit, "status" | "dependsOn" | "progressPercent"> & { dependsOn?: string[] }
): WorkUnit {
  return {
    status: "todo",
    dependsOn: task.dependsOn ?? [],
    progressPercent: 0,
    ...task
  };
}

function inferGoal(title: string, brief: string): string {
  const firstSentence = brief.split(/[.!?\n]/).map((item) => item.trim()).find(Boolean);
  return firstSentence ? `${title}：${firstSentence}` : `关闭长尾项目“${title}”。`;
}

function inferCurrentState(brief: string): string {
  if (brief.trim().length === 0) {
    return "尚未提供详细状态。";
  }

  return brief.length > 220 ? `${brief.slice(0, 220)}...` : brief;
}

function inferUnknowns(brief: string): string[] {
  const unknowns: string[] = [];
  if (!/done|finish|close|complete|criterion|criteria|完成|结束|关闭|标准|验收/i.test(brief)) {
    unknowns.push("尚未明确精确的关闭标准。");
  }
  if (!/block|stuck|missing|unknown|risk|issue|阻塞|卡住|缺失|未知|风险|问题/i.test(brief)) {
    unknowns.push("尚未指出具体阻塞因素。");
  }
  if (!/next|step|todo|action|下一|步骤|待办|行动|动作/i.test(brief)) {
    unknowns.push("尚未明确立即可做的下一动作。");
  }
  return unknowns;
}
