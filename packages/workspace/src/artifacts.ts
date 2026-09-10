import { isAbsolute, extname } from "node:path";
import { stat, realpath } from "node:fs/promises";
import { projectCapsule } from "../../core/src";
import { readProject } from "./store";

export async function resolveArtifact(projectId: string, artifact: string, root?: string): Promise<{
  kind: "url" | "document" | "reveal"; target: string;
}> {
  const project = await readProject(projectId, root);
  if (!projectCapsule(project).artifacts.includes(artifact)) throw new Error("材料不在这个项目的交接记录中。");
  if (/^https?:\/\//i.test(artifact)) {
    const url = new URL(artifact);
    if (url.username || url.password) throw new Error("材料链接不能包含登录凭据。");
    return { kind: "url", target: url.href };
  }
  if (!isAbsolute(artifact)) throw new Error("本地材料需要绝对路径，请重新选择文件。");
  const target = await realpath(artifact).catch(() => { throw new Error("材料已移动或不存在，请更新位置。"); });
  const info = await stat(target);
  const documentExtensions = [".txt", ".md", ".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".png", ".jpg", ".jpeg", ".webp"];
  return {
    kind: info.isFile() && documentExtensions.includes(extname(target).toLowerCase()) ? "document" : "reveal",
    target
  };
}
