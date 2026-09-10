import { describe, expect, it } from "vitest";
import { analyzeProjectFast, closeSession, proposeSessionTask, sessionElapsedSeconds, validateDate } from "./index";
import type { LongTailProject, ResidencySession } from "./types";

const now = "2026-09-09T10:00:00.000Z";
const project = (): LongTailProject => analyzeProjectFast({
  id: "paper", title: "论文收尾", brief: "正文完成，仅需核对引用并提交。",
  intake: { completed: "正文完成", remaining: "核对引用\n提交论文", closeCriteria: "取得提交回执", progressEstimate: 80 },
  now
});
const propose = (model = project(), minutes = 25) => proposeSessionTask({
  projects: [model], minutes, intensity: "medium", now, makeId: () => "s1"
})!;
const active = (session: ResidencySession): ResidencySession => ({
  ...session, status: "active", elapsedSeconds: 0, lastResumedAt: now
});

describe("closure modeling", () => {
  it("keeps a self-reported starting estimate separate from closure progress", () => {
    const model = project();
    expect(model.intake?.progressEstimate).toBe(80);
    expect(model.completionPercent).toBe(0);
    expect(model.taskGraph.tasks.map((task) => task.title)).toEqual(["核对引用", "提交论文"]);
    expect(model.taskGraph.tasks.every((task) => !task.dependsOn.length)).toBe(true);
  });
  it("does not invent five generic tasks from an ambiguous brief", () => {
    const model = analyzeProjectFast({ id: "p", title: "旧项目", brief: "大概做完了80%。", now });
    expect(model.taskGraph.tasks).toHaveLength(1);
    expect(model.taskGraph.tasks[0]).toMatchObject({ status: "unknown", weight: 0 });
    expect(model.compact).toContain("下一步");
  });
  it("computes completion from actual task weights", () => {
    const model = project();
    model.taskGraph.tasks[0].weight = 3;
    const output = closeSession({ project: model, session: active(propose(model).session), result: "completed", now });
    expect(output.project.completionPercent).toBe(75);
    expect(output.session.status).toBe("closed");
  });
});

describe("selection and continuity", () => {
  it("respects the intensity ceiling", () => {
    expect(proposeSessionTask({ projects: [project()], minutes: 25, intensity: "low", now, makeId: () => "s" })).toBeNull();
  });
  it("scopes a proposal to the explicitly selected project", () => {
    const other = { ...project(), id: "other", completionPercent: 90 };
    const proposal = proposeSessionTask({ projects: [other, project()], projectId: "paper", minutes: 25, intensity: "medium", now, makeId: () => "s" });
    expect(proposal?.project.id).toBe("paper");
  });
  it("excludes archived and resolved projects", () => {
    for (const outcome of ["closed", "parked", "waiting", "killed"] as const) {
      const model = project();
      model.resolution = { outcome, note: "Decision", evidence: "", decidedAt: now };
      expect(proposeSessionTask({ projects: [model], minutes: 25, intensity: "medium", now, makeId: () => "s" })).toBeNull();
    }
  });
  it("uses the confirmed next action only for the matching task", () => {
    const model = project();
    model.capsule = { ...model.capsule!, nextAction: "从第12条引用继续" };
    expect(propose(model).session.startAction).toBe("从第12条引用继续");
    model.taskGraph.tasks[0].status = "done";
    expect(propose(model).session.startAction).toBe("提交论文");
  });
  it("shrinks any task that exceeds the budget into a checkpoint", () => {
    expect(propose(project(), 20).session.scope).toBe("checkpoint");
    expect(propose(project(), 25).session.scope).toBe("full_task");
  });
  it("does not award progress for time, even after many completed checkpoints", () => {
    let model = project();
    for (let i = 0; i < 10; i++) {
      model = closeSession({ project: model, session: active(propose(model, 5).session), result: "completed", now }).project;
    }
    expect(model.completionPercent).toBe(0);
    expect(model.taskGraph.tasks[0].status).toBe("in_progress");
  });
  it("does not let LLM estimates inflate a partial result", () => {
    const model = project();
    const output = closeSession({ project: model, session: active(propose(model).session), result: "partial", now,
      assessment: { taskProgressPercent: 95, judgement: "有推进", compact: "模型猜测" },
      handoff: { ...model.capsule!, summary: "核对到第12条", nextAction: "从第13条继续" }
    });
    expect(output.project.completionPercent).toBe(0);
    expect(output.project.currentState).toBe("核对到第12条");
    expect(propose(output.project).session.startAction).toBe("从第13条继续");
    expect(output.session.handoff).toEqual(output.project.capsule);
  });
  it("selects an actual next task after full completion", () => {
    const model = project();
    const output = closeSession({ project: model, session: active(propose(model).session), result: "completed", now });
    expect(output.project.capsule?.taskId).toBe("t2");
    expect(output.project.capsule?.nextAction).toBe("提交论文");
  });
});

describe("time and input contracts", () => {
  it("excludes paused time", () => {
    const session = active(propose().session);
    expect(sessionElapsedSeconds(session, Date.parse(now) + 60_000)).toBe(60);
    expect(sessionElapsedSeconds({ ...session, status: "paused", elapsedSeconds: 60, lastResumedAt: undefined }, Date.parse(now) + 86400_000)).toBe(60);
    expect(sessionElapsedSeconds({ ...session, elapsedSeconds: 60, lastResumedAt: "2026-09-10T10:00:00.000Z" }, Date.parse("2026-09-10T10:01:00.000Z"))).toBe(120);
  });
  it("reads legacy closed session timing", () => {
    const session = { ...propose().session, status: "closed" as const, elapsedSeconds: undefined, endedAt: "2026-09-09T10:05:00.000Z" };
    expect(sessionElapsedSeconds(session)).toBe(300);
  });
  it("rejects impossible calendar dates", () => {
    expect(() => validateDate("2026-02-30", "日期")).toThrow();
    expect(() => validateDate("2026-09-09", "日期")).not.toThrow();
  });
  it("rejects invalid planning constraints", () => {
    expect(() => propose(project(), NaN)).toThrow();
    expect(() => propose(project(), 181)).toThrow();
  });
});
