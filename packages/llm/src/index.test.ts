import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible provider", () => {
  it("converts strict model JSON into a validated project graph", async () => {
    const analysis = {
      goal: "Close the manuscript revision.",
      currentState: "Draft exists.",
      closeCriteria: ["Submission package exists."],
      unknowns: ["Final figure decision."],
      compact: "Resolve the figure, then review and package.",
      tasks: [
        {
          id: "figure",
          title: "Resolve figure",
          description: "Make the final include/remove decision.",
          status: "in_progress",
          dependsOn: [],
          effortMinutes: 25,
          intensity: "medium",
          weight: 40,
          progressPercent: 50,
          completionCriteria: "Decision is recorded.",
          startAction: "Compare the figure against the close criterion.",
          notDoing: "Do not run new experiments."
        },
        {
          id: "review",
          title: "Final review",
          description: "Review the complete manuscript.",
          status: "todo",
          dependsOn: ["figure"],
          effortMinutes: 45,
          intensity: "high",
          weight: 60,
          progressPercent: 0,
          completionCriteria: "Review checklist is closed.",
          startAction: "Open the manuscript and checklist.",
          notDoing: "Do not expand scope."
        }
      ]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(analysis) } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test",
      model: "test-model"
    });
    const project = await provider.analyzeProject({
      id: "paper",
      title: "Paper",
      brief: "Draft exists.",
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(project.updatedBy).toBe("llm");
    expect(project.taskGraph.tasks).toHaveLength(2);
    expect(project.completionPercent).toBe(20);
  });

  it("rejects a cyclic model graph", async () => {
    const analysis = {
      goal: "Close the project.",
      currentState: "Open.",
      closeCriteria: ["Closed."],
      unknowns: [],
      compact: "Resolve both tasks.",
      tasks: [
        {
          id: "a",
          title: "A",
          description: "A",
          status: "todo",
          dependsOn: ["b"],
          effortMinutes: 10,
          intensity: "low",
          weight: 50,
          progressPercent: 0,
          completionCriteria: "A",
          startAction: "A",
          notDoing: "A"
        },
        {
          id: "b",
          title: "B",
          description: "B",
          status: "todo",
          dependsOn: ["a"],
          effortMinutes: 10,
          intensity: "low",
          weight: 50,
          progressPercent: 0,
          completionCriteria: "B",
          startAction: "B",
          notDoing: "B"
        }
      ]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(analysis) } }]
          }),
          { status: 200 }
        )
      )
    );

    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test",
      model: "test-model"
    });

    await expect(
      provider.analyzeProject({
        id: "paper",
        title: "Paper",
        brief: "Draft exists.",
        now: "2026-01-01T00:00:00.000Z"
      })
    ).rejects.toThrow("cycle");
  });

  it("assesses a session without allowing a partial result to close the task", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    taskProgressPercent: 100,
                    judgement: "Useful progress was made, but the task remains open.",
                    compact: "Continue from the documented checkpoint."
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test",
      model: "test-model"
    });
    const project = {
      schemaVersion: "1" as const,
      id: "paper",
      title: "Paper",
      brief: "Draft exists.",
      goal: "Close the paper.",
      closeCriteria: ["Submission exists."],
      currentState: "Draft exists.",
      unknowns: [],
      taskGraph: {
        tasks: [
          {
            id: "review",
            title: "Review",
            description: "Review the paper.",
            status: "in_progress" as const,
            dependsOn: [],
            effortMinutes: 60,
            intensity: "high" as const,
            weight: 100,
            progressPercent: 20,
            completionCriteria: "Review is closed.",
            startAction: "Open the paper.",
            notDoing: "Do not expand scope."
          }
        ]
      },
      completionPercent: 20,
      confidence: "high" as const,
      compact: "Continue review.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "app" as const,
      revision: 1
    };
    const assessment = await provider.assessSession({
      project,
      session: {
        schemaVersion: "1",
        id: "s1",
        projectId: "paper",
        projectTitle: "Paper",
        taskId: "review",
        taskTitle: "Review",
        scope: "full_task",
        minutesPlanned: 30,
        intensity: "high",
        status: "active",
        startedAt: "2026-01-01T00:00:00.000Z",
        prompt: "",
        startAction: "Open the paper.",
        completionCriteria: "Review is closed.",
        notDoing: "Do not expand scope.",
        selectionReason: "This task fits the available constraints.",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "app",
        revision: 1
      },
      result: "partial",
      note: "Half the review is complete."
    });

    expect(assessment.taskProgressPercent).toBe(95);
  });

  it("tests the configured endpoint and model with a minimal request", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "OK" } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1/",
      apiKey: "test",
      model: "test-model"
    });

    const result = await provider.testConnection();
    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body)) as { model: string; max_tokens: number };

    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(body).toEqual(expect.objectContaining({ model: "test-model", max_tokens: 1 }));
    expect(result.ok).toBe(true);
  });
});
