import type { CaptureConversion } from "./types";

// Only explicit phrases become draft fields. The original text is always retained.
export function suggestCapture(text: string): Omit<CaptureConversion, "id"> {
  const clauses = text.trim().split(/[；;\n。]/).map((line) => line.trim()).filter(Boolean);
  const first = clauses[0] ?? "";
  const title = first.split(/[：:,，]/)[0].slice(0, 60);
  const remaining = clauses.filter((line) => !/不知道|不清楚|尚不明确|[?？]/.test(line))
    .map((line) => line.match(/(?:只差|还差|只剩|剩余动作[:：]?|下一步[:：]?)\s*(.+)$/)?.[1])
    .filter((value): value is string => Boolean(value)).join("\n");
  const closeCriteria = clauses.map((line) => line.match(/(?:关闭标准|完成标准|结束标准)[:：]\s*(.+)$/)?.[1])
    .filter(Boolean).join("\n");
  return { title, remaining, closeCriteria };
}

export function validateCaptureText(text: unknown): string {
  if (typeof text !== "string" || !text.trim() || text.trim().length > 12000) {
    throw new Error("请记录 1-12000 字的未完事项。");
  }
  return text.trim();
}
