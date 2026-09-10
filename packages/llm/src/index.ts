import {
  analyzeProjectFast,
  refreshProjectProgress,
  SCHEMA_VERSION,
  type AnalyzeProjectInput,
  type Intensity,
  type LongTailProject,
  type ResidencySession,
  type SessionAssessment,
  type SessionResult,
  type TaskStatus,
  type WorkUnit
} from "../../core/src";

export interface LlmProvider {
  analyzeProject(input: AnalyzeProjectInput): Promise<LongTailProject>;
}

export interface AssessSessionInput {
  project: LongTailProject;
  session: ResidencySession;
  result: SessionResult;
  note?: string;
}

export interface ConnectionTestResult {
  ok: true;
  model: string;
  latencyMs: number;
}

export class LocalHeuristicProvider implements LlmProvider {
  async analyzeProject(input: AnalyzeProjectInput): Promise<LongTailProject> {
    return analyzeProjectFast(input);
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  ) {}

  async analyzeProject(input: AnalyzeProjectInput): Promise<LongTailProject> {
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const messages = [
      {
        role: "system",
        content: [
          "You model long-tail projects for Los Alamos.",
          "Do not perform the project work. Only model, split, estimate, and identify uncertainty.",
          "Return JSON only. Build a complete directed acyclic task graph with parallel and serial work.",
          "Use Chinese for generated copy unless the user's brief clearly uses another language.",
          "Every leaf task needs a concrete start action, completion criterion, explicit out-of-scope boundary,",
          "effortMinutes, intensity (low|medium|high|xhigh), weight, dependencies, and status.",
          "Model remaining closure work, not a generic planning workflow. Planning-only tasks have weight 0.",
          "A self-reported overall progress estimate is not evidence of task completion. Do not translate it into task percentages.",
          "One task is sufficient. Never invent dependencies or unnecessary work.",
          "Use unknowns instead of inventing facts. Keep the response concise enough for an interactive desktop tool."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title,
          brief: input.brief,
          intake: input.intake,
          latestConfirmedContext: input.context,
          output: {
            goal: "string",
            currentState: "string",
            closeCriteria: ["string"],
            unknowns: ["string"],
            compact: "string",
            tasks: [
              {
                id: "short stable id",
                title: "string",
                description: "string",
                status: "todo|in_progress|done|parked|killed|unknown",
                dependsOn: ["task id"],
                effortMinutes: 25,
                intensity: "low|medium|high|xhigh",
                weight: 10,
                progressPercent: 0,
                completionCriteria: "string",
                startAction: "string",
                notDoing: "string"
              }
            ]
          }
        })
      }
    ];

    const baseBody = {
      model: this.config.model,
      temperature: 0.2,
      messages
    };
    let response = await this.request(endpoint, {
      ...baseBody,
      response_format: { type: "json_object" }
    });
    if (response.status === 400) {
      response = await this.request(endpoint, baseBody);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`LLM analysis failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = extractContent(payload.choices?.[0]?.message?.content);
    const analysis = JSON.parse(stripCodeFence(content)) as unknown;
    return buildProject(input, analysis);
  }

  async assessSession(input: AssessSessionInput): Promise<SessionAssessment> {
    const task = input.project.taskGraph.tasks.find(
      (candidate) => candidate.id === input.session.taskId
    );
    if (!task) {
      throw new Error("Session task no longer exists in the project graph.");
    }
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body = {
      model: this.config.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You assess a human work session for Los Alamos.",
            "Do not perform the work and do not invent facts.",
            "Return JSON only with taskProgressPercent (0-100), judgement, and compact.",
            "Use Chinese for judgement and compact unless the user's project clearly uses another language.",
            "Never reduce existing progress. Respect the user's explicit result.",
            "If the result is not completed or the session is only a checkpoint, never return 100.",
            "Keep judgement and compact each under two sentences."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            project: {
              title: input.project.title,
              goal: input.project.goal,
              completionPercent: input.project.completionPercent
            },
            task,
            session: {
              scope: input.session.scope,
              minutesPlanned: input.session.minutesPlanned,
              startedAt: input.session.startedAt,
              result: input.result,
              note: input.note ?? ""
            }
          })
        }
      ]
    };
    let response = await this.request(endpoint, body);
    if (response.status === 400) {
      const { response_format: _responseFormat, ...fallbackBody } = body;
      response = await this.request(endpoint, fallbackBody);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`LLM session assessment failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = extractContent(payload.choices?.[0]?.message?.content);
    const assessment = asObject(JSON.parse(stripCodeFence(content)), "assessment");
    const proposedProgress = boundedNumber(
      assessment.taskProgressPercent,
      task.progressPercent,
      100,
      task.progressPercent
    );
    const maximum = input.result === "completed" && input.session.scope === "full_task" ? 100 : 95;
    return {
      taskProgressPercent: Math.min(maximum, Math.max(task.progressPercent, proposedProgress)),
      judgement: asString(assessment.judgement, "assessment.judgement"),
      compact: asString(assessment.compact, "assessment.compact")
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const response = await this.request(endpoint, {
      model: this.config.model,
      temperature: 0,
      max_tokens: 1,
      messages: [
        {
          role: "user",
          content: "Reply with OK."
        }
      ]
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`LLM connection failed (${response.status}): ${detail}`);
    }
    return {
      ok: true,
      model: this.config.model,
      latencyMs: Date.now() - startedAt
    };
  }

  private request(endpoint: string, body: unknown): Promise<Response> {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
  }
}

function buildProject(input: AnalyzeProjectInput, raw: unknown): LongTailProject {
  const object = asObject(raw, "analysis");
  const rawTasks = asArray(object.tasks, "tasks");
  if (rawTasks.length < 1 || rawTasks.length > 50) {
    throw new Error("LLM analysis must contain between one and fifty tasks.");
  }

  const tasks = rawTasks.map((task, index) => normalizeTask(task, index));
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) {
    throw new Error("LLM analysis returned duplicate task ids.");
  }
  for (const task of tasks) {
    if (task.dependsOn.includes(task.id)) {
      throw new Error(`Task "${task.title}" depends on itself.`);
    }
    if (task.dependsOn.some((dependencyId) => !ids.has(dependencyId))) {
      throw new Error(`Task "${task.title}" contains an unknown dependency.`);
    }
  }
  assertAcyclic(tasks);

  const project: LongTailProject = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    title: input.title.trim(),
    brief: input.brief.trim(),
    goal: asString(object.goal, "goal"),
    closeCriteria: stringArray(object.closeCriteria, "closeCriteria"),
    currentState: asString(object.currentState, "currentState"),
    unknowns: stringArray(object.unknowns, "unknowns"),
    taskGraph: { tasks },
    completionPercent: 0,
    confidence: "low",
    compact: asString(object.compact, "compact"),
    intake: input.intake,
    capsule: {
      summary: asString(object.currentState, "currentState"),
      decisions: [], artifacts: [], blocker: stringArray(object.unknowns, "unknowns").join("\n"),
      nextAction: "", notDoing: "", updatedAt: input.now
    },
    createdAt: input.now,
    updatedAt: input.now,
    updatedBy: "llm",
    revision: 1
  };

  return refreshProjectProgress(project);
}

function normalizeTask(raw: unknown, index: number): WorkUnit {
  const object = asObject(raw, `tasks[${index}]`);
  return {
    id: asString(object.id, `tasks[${index}].id`),
    title: asString(object.title, `tasks[${index}].title`),
    description: asString(object.description, `tasks[${index}].description`),
    status: enumValue(
      object.status,
      ["todo", "in_progress", "done", "parked", "killed", "unknown"],
      "todo"
    ) as TaskStatus,
    dependsOn: stringArray(object.dependsOn, `tasks[${index}].dependsOn`),
    effortMinutes: positiveNumber(object.effortMinutes, 25),
    intensity: enumValue(object.intensity, ["low", "medium", "high", "xhigh"], "medium") as Intensity,
    weight: boundedNumber(object.weight, 0, 10000, 10),
    progressPercent:
      object.status === "done"
        ? 100
        : boundedNumber(object.progressPercent, 0, 100, 0),
    completionCriteria: asString(object.completionCriteria, `tasks[${index}].completionCriteria`),
    startAction: asString(object.startAction, `tasks[${index}].startAction`),
    notDoing: asString(object.notDoing, `tasks[${index}].notDoing`)
  };
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
      .join("");
  }
  throw new Error("LLM response did not contain text content.");
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
  return asArray(value, field).map((item, index) => asString(item, `${field}[${index}]`));
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function enumValue(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function assertAcyclic(tasks: WorkUnit[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) throw new Error("LLM task graph contains a dependency cycle.");
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)?.dependsOn ?? []) visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.id);
}
