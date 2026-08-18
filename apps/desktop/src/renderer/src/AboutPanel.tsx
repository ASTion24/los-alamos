import { ArrowRight, FolderOpen, Monitor, SquareTerminal, X } from "lucide-react";

interface AboutPanelProps {
  open: boolean;
  onClose: () => void;
  onShowWorkspace: () => void;
}

export function AboutPanel({
  open,
  onClose,
  onShowWorkspace
}: AboutPanelProps): JSX.Element | null {
  if (!open) return null;

  return (
    <section
      className="about-plane"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <header className="about-head">
        <div>
          <span>LOS ALAMOS</span>
          <h1 id="about-title">关于 Los Alamos</h1>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          title="关闭关于 Los Alamos"
          aria-label="关闭关于 Los Alamos"
        >
          <X size={19} />
        </button>
      </header>

      <div className="about-composition">
        <section className="about-philosophy">
          <span>设计前提</span>
          <h2>把未关闭的中间状态暂时带离日常。</h2>
          <p>
            Los Alamos 不代替你工作。它收拢上下文、拆分依赖、选择一个与当下时间和精力相称的入口，并在结束后压缩进度。
          </p>
          <dl>
            <div>
              <dt>01</dt>
              <dd>一次只推进一个最小任务</dd>
            </div>
            <div>
              <dt>02</dt>
              <dd>先明确开始、完成与不做</dd>
            </div>
            <div>
              <dt>03</dt>
              <dd>事实与叶任务决定完成度</dd>
            </div>
          </dl>
        </section>

        <section className="about-paths">
          <div className="about-path">
            <Monitor size={22} strokeWidth={1.5} />
            <div>
              <span>原生应用</span>
              <h3>直接进入驻留</h3>
              <p>在界面中添加项目、审阅任务图、配置时间与强度，并记录每次推进结果。</p>
            </div>
          </div>

          <div className="about-path">
            <SquareTerminal size={22} strokeWidth={1.5} />
            <div>
              <span>Agent workspace</span>
              <h3>在对话中完成全流程</h3>
              <p>
                将同一工作区交给 Coding Agent。它读取事实与模型、执行完整协议，也能打开原生应用的指定页面。
              </p>
              <code>./.los/los agent context --json</code>
            </div>
          </div>

          <p className="about-path-note">两条路径共用一个 workspace，可以随时切换。</p>
        </section>
      </div>

      <footer className="about-actions">
        <button className="about-workspace-button" onClick={onShowWorkspace}>
          <FolderOpen size={16} />
          打开工作区
        </button>
        <button className="about-enter-button" onClick={onClose}>
          进入 Los Alamos
          <ArrowRight size={17} />
        </button>
      </footer>
    </section>
  );
}
