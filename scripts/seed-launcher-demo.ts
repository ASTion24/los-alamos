import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  captureThought, createProject, ensureWorkspace, resolveProject, updateProjectCapsule, updateProjectTask
} from "../packages/workspace/src";
import { localDate } from "../packages/core/src";

async function main(): Promise<void> {
  if (!process.argv[2]) throw new Error("Pass an explicit empty demo workspace path.");
  const root = resolve(process.argv[2]);
  if ((await readdir(join(root, "projects")).catch(() => [])).length) {
    throw new Error("Demo workspace already contains projects; nothing was changed.");
  }
  await ensureWorkspace(root);
  const materials = join(root, "demo-materials");
  await mkdir(materials, { recursive: true });
  const material = join(materials, "reference-check.md");
  await writeFile(material, [
    "# Los Alamos 体验材料",
    "",
    "这是一份虚构的验收样例，不是你的实际论文或项目。",
    "",
    "## 当前停靠点",
    "",
    "前 12 条引用已核对。下一步从第 13 条继续。",
    "",
    "## 本次边界",
    "",
    "只检查已有引用，不添加实验，不重写正文。",
    "",
    "体验时可以暂停、留下下一动作，或报告本段已完成。",
    ""
  ].join("\n"));
  const paper = await createProject({
    title: "体验 · 论文投稿", brief: "这是虚构体验项目。正文和实验已完成，剩余引用核对与投稿确认。",
    intake: { completed: "正文、实验、图表已完成。", remaining: "从第13条引用继续核对\n确认投稿回执", closeCriteria: "引用核对完成，投稿回执已保存。", progressEstimate: 90 },
    workspaceRoot: root
  });
  await updateProjectTask({ projectId: paper.id, taskId: "t1", patch: { status: "in_progress", progressPercent: 65, completionCriteria: "剩余引用逐项核验通过。", notDoing: "不补实验，不重写正文，不更换投稿目标。" }, workspaceRoot: root });
  await updateProjectTask({ projectId: paper.id, taskId: "t2", patch: { dependsOn: ["t1"], effortMinutes: 15, intensity: "low" }, workspaceRoot: root });
  await updateProjectCapsule({ projectId: paper.id, capsule: {
    summary: "前12条引用已核对；没有新增实验要做。",
    nextAction: "打开文稿，从第13条引用继续。",
    taskId: "t1", decisions: ["保留当前投稿目标", "不再扩展实验范围"], artifacts: [material], blocker: "",
    notDoing: "不补实验，不重写正文，不更换投稿目标。", updatedAt: new Date().toISOString()
  }, workspaceRoot: root });
  const website = await createProject({
    title: "体验 · 个人网站上线", brief: "虚构体验项目。页面已发布，验收截图已保存，只差正式说一句完成。",
    intake: { completed: "发布和检查已经完成。", remaining: "核验线上页面", closeCriteria: "正式地址可访问，移动端检查通过。" },
    workspaceRoot: root
  });
  await updateProjectTask({ projectId: website.id, taskId: "t1", patch: { status: "done", progressPercent: 100 }, workspaceRoot: root });
  const portfolio = await createProject({
    title: "体验 · 作品集反馈", brief: "虚构体验项目，等待他人反馈。",
    intake: { completed: "初稿已发送", remaining: "整理反馈", closeCriteria: "修改决定已记录" }, workspaceRoot: root
  });
  await resolveProject({ projectId: portfolio.id, outcome: "waiting", note: "等待对方对初稿的反馈；收到后再决定是否修改。", revisitAt: localDate(), workspaceRoot: root });
  await captureThought({ text: "域名下个月到期，找个空档续签。", workspaceRoot: root });
  await captureThought({ text: "旧笔记想整理成文章，但现在不必展开。", workspaceRoot: root });
  console.log(`Isolated demo ready: ${root}`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
