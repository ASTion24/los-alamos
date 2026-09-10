import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Dialog({ title, onClose, children, className = "", dismissDisabled = false }: {
  title: string; onClose: () => void; children: ReactNode; className?: string; dismissDisabled?: boolean;
}): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = () => { if (!dismissDisabled) onClose(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const dialog = ref.current;
    const focusable = (): HTMLElement[] => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'
    ) ?? []).filter((item) => item.getClientRects().length > 0);
    (focusable().find((item) => ["INPUT", "TEXTAREA", "SELECT"].includes(item.tagName)) ?? focusable()[0])?.focus();
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", keydown);
    return () => {
      dialog?.removeEventListener("keydown", keydown);
      if (root) root.inert = wasInert;
      previous?.focus();
    };
  }, []);
  return createPortal(<div className="continuity-overlay" onClick={() => closeRef.current()}>
    <section ref={ref} className={`continuity-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><button className="icon-button" disabled={dismissDisabled} onClick={onClose} title={`关闭${title}`} aria-label={`关闭${title}`}><X size={18} /></button></header>
      {children}
    </section>
  </div>, document.body);
}
