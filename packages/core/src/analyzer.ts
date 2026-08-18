import type { LongTailProject, WorkUnit } from "./types";
import { SCHEMA_VERSION } from "./types";
import { refreshProjectProgress } from "./progress";

export interface AnalyzeProjectInput {
  id: string;
  title: string;
  brief: string;
  now: string;
}

export function analyzeProjectFast(input: AnalyzeProjectInput): LongTailProject {
  const title = input.title.trim();
  const brief = input.brief.trim();
  const lowerBrief = brief.toLowerCase();
  const hasArtifact =
    /code|draft|paper|deck|slide|document|repo|manuscript|prototype|代码|草稿|论文|文稿|幻灯|文档|仓库|原型|材料/.test(
      lowerBrief
    );
  const hasReview = /review|revise|polish|audit|check|verify|审阅|复核|润色|检查|验证|验收|校对/.test(
    lowerBrief
  );

  const tasks: WorkUnit[] = [
    makeTask({
      id: "t1",
      title: "明确关闭标准",
      description: "写清楚项目在什么条件下可以被视为完成并停止占用注意力。",
      effortMinutes: 15,
      intensity: "low",
      weight: 12,
      completionCriteria: "用一到两句话写出具体、可判断的关闭标准。",
      startAction: "打开项目记录，写下那条足以让你停止反复惦记它的判断线。",
      notDoing: "此时不直接推进项目本身。"
    }),
    makeTask({
      id: "t2",
      title: "盘点当前状态",
      description: "列出现有材料、已完成部分、缺失事实和可见阻塞。",
      effortMinutes: 25,
      intensity: hasArtifact ? "medium" : "low",
      weight: 18,
      completionCriteria: "当前状态清晰到下一次驻留无需重新考古即可开始。",
      startAction: "把已有文件、笔记、链接或记忆汇总成一份短状态清单。",
      notDoing: "暂不改进任何产物，只确认已经存在什么。"
    }),
    makeTask({
      id: "t3",
      title: "解决首个阻塞未知点",
      description: "选择阻碍继续推进的最小未知点，把它转化为事实或决定。",
      effortMinutes: 30,
      intensity: "medium",
      weight: 20,
      completionCriteria: "一个阻塞点已被回答、转交给后续步骤或明确判定为无关。",
      startAction: "选出制造最大不确定性的阻塞点，写下需要作出的决定。",
      notDoing: "不展开无关研究。"
    }),
    makeTask({
      id: "t4",
      title: "推进关键路径",
      description: "在直接贡献于项目关闭的工作上完成一次具体推进。",
      effortMinutes: 45,
      intensity: "high",
      weight: 30,
      completionCriteria: "产生一个可见产物、明确决定或不可逆的进度标记。",
      startAction: "打开真正的工作产物，做出明天仍然有价值的最小改动。",
      notDoing: "不扩大范围，不启动相邻优化。",
      dependsOn: ["t1", "t2"]
    }),
    makeTask({
      id: "t5",
      title: hasReview ? "完成最终核验" : "压缩上下文并闭环",
      description: "总结最新状态，核验关闭标准，并决定关闭、暂停或继续。",
      effortMinutes: 20,
      intensity: "low",
      weight: 20,
      completionCriteria: "下一入口已经清楚，或项目已被明确关闭、暂停、终止。",
      startAction: "写一段短 compact：当前进度、剩余阻塞、下一入口。",
      notDoing: "不重新打开已经完成的决定。",
      dependsOn: ["t3", "t4"]
    })
  ];

  const project: LongTailProject = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    title,
    brief,
    goal: inferGoal(title, brief),
    closeCriteria: [
      "项目已经产生无需继续主动关注的具体产物或决定。",
      "剩余工作均已被明确关闭、暂停或终止。"
    ],
    currentState: inferCurrentState(brief),
    unknowns: inferUnknowns(brief),
    taskGraph: { tasks },
    completionPercent: 0,
    confidence: "low",
    compact: `项目已加入。下一步：为“${title}”明确关闭标准。`,
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
