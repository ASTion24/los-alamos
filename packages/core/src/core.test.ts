import { describe, expect, it } from "vitest";
import { analyzeProjectFast } from "./analyzer";
import { proposeSessionTask } from "./planner";
import { closeSession } from "./session";

describe("Los Alamos core", () => {
  it("uses Chinese-first copy in local fast analysis", () => {
    const project = analyzeProjectFast({
      id: "p1",
      title: "论文修订",
      brief: "已有草稿，下一步需要完成最终检查。",
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(project.taskGraph.tasks[0].title).toBe("明确关闭标准");
    expect(project.compact).toContain("下一步");
  });

  it("computes progress from weighted completed tasks", () => {
    const project = analyzeProjectFast({
      id: "p1",
      title: "Pilot",
      brief: "A project with a draft and a clear next action.",
      now: "2026-01-01T00:00:00.000Z"
    });
    const session = {
      schemaVersion: "1" as const,
      id: "s1",
      projectId: project.id,
      projectTitle: project.title,
      taskId: "t2",
      taskTitle: "Inventory current state",
      scope: "full_task" as const,
      minutesPlanned: 25,
      intensity: "medium" as const,
      status: "active" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
      prompt: "",
      startAction: "",
      completionCriteria: "",
      notDoing: "",
      selectionReason: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "app" as const,
      revision: 1
    };

    const output = closeSession({
      project,
      session,
      result: "completed",
      now: "2026-01-01T00:10:00.000Z"
    });

    expect(output.project.completionPercent).toBe(18);
    expect(output.session.status).toBe("closed");
  });

  it("does not assign work above the user's intensity", () => {
    const project = analyzeProjectFast({
      id: "p1",
      title: "Pilot",
      brief: "A project with a draft and a clear next action.",
      now: "2026-01-01T00:00:00.000Z"
    });
    const proposal = proposeSessionTask({
      projects: [project],
      minutes: 45,
      intensity: "low",
      now: "2026-01-01T00:00:00.000Z",
      makeId: () => "s1"
    });

    expect(proposal?.task.intensity).toBe("low");
  });

  it("keeps the parent task open when a checkpoint session is completed", () => {
    const project = analyzeProjectFast({
      id: "p1",
      title: "Pilot",
      brief: "A project with a draft and a clear next action.",
      now: "2026-01-01T00:00:00.000Z"
    });
    const proposal = proposeSessionTask({
      projects: [project],
      minutes: 5,
      intensity: "low",
      now: "2026-01-01T00:00:00.000Z",
      makeId: () => "s1"
    });

    expect(proposal?.session.scope).toBe("checkpoint");
    const output = closeSession({
      project,
      session: proposal!.session,
      result: "completed",
      now: "2026-01-01T00:05:00.000Z"
    });

    expect(output.project.taskGraph.tasks.find((task) => task.id === proposal?.session.taskId)?.status).toBe(
      "in_progress"
    );
    expect(output.project.completionPercent).toBe(4);
  });

  it("uses an assessed partial progress without closing the task", () => {
    const project = analyzeProjectFast({
      id: "p1",
      title: "Pilot",
      brief: "A project with a draft and a clear next action.",
      now: "2026-01-01T00:00:00.000Z"
    });
    const proposal = proposeSessionTask({
      projects: [project],
      minutes: 15,
      intensity: "low",
      now: "2026-01-01T00:00:00.000Z",
      makeId: () => "s1"
    });
    const output = closeSession({
      project,
      session: proposal!.session,
      result: "partial",
      assessment: {
        taskProgressPercent: 40,
        judgement: "The closing criterion is partly specified.",
        compact: "Closing line drafted; resolve the remaining ambiguity next."
      },
      now: "2026-01-01T00:10:00.000Z"
    });

    const task = output.project.taskGraph.tasks.find(
      (candidate) => candidate.id === proposal?.session.taskId
    );
    expect(task?.status).toBe("in_progress");
    expect(task?.progressPercent).toBe(40);
    expect(output.project.compact).toContain("Closing line drafted");
  });
});
