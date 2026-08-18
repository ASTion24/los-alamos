# 关于 Los Alamos

Los Alamos 是一个用于关闭长尾项目的本地桌面工作区。

它不代替用户完成真实工作。它负责收拢上下文、拆分依赖、按时间与精力选择一个可验证入口，并在每段驻留结束后压缩进度，让长期悬置的项目能够被连续推进。

## 设计原则

- **一次只处理一个入口**：驻留始终围绕一个明确的最小任务。
- **边界先于执行**：开始动作、完成标准与明确不做必须在计时前可见。
- **事实先于推断**：`brief.md` 保存用户事实；任务图与完成度从事实和叶任务权重推导。
- **规划不越界**：Los Alamos 管理上下文、调度和记录，不替用户完成项目本身。
- **本地优先**：不配置 API 也能使用；配置 LLM 后自动增强，失败时回退本地规则。

## 两条路径，一个工作区

### 原生应用

打开 macOS 应用后，可以直接在界面中：

- 添加项目并审阅任务依赖图；
- 调整任务边界、强度、预计时间与进度；
- 输入本轮可用时间和最高工作强度；
- 审阅、开始和结束驻留；
- 查看项目总览、归档与驻留记录。

应用数据位于 `~/Documents/Los Alamos/`，API 密钥单独保存在系统安全存储中。

### Agent workspace

也可以直接将 Los Alamos 工作区作为项目交给 Codex、Claude Code、TRAE 或其他 Coding Agent。Agent 读取同一份事实、任务模型、事件和驻留记录，并可通过文件协议打开原生应用的指定页面。

打开工作区后，唯一入口是：

```bash
./.los/los agent context --json
```

命令会返回当前阶段、缺失输入和唯一下一步。完整能力可通过以下命令发现：

```bash
./.los/los agent capabilities --json
```

Windows 使用 `.los\los.cmd`。启动器不依赖 npm；缺少系统 Node 时会复用 Los Alamos 自身的 Electron Runtime。

两条路径共享同一个 workspace，可以随时切换，不需要导入、导出或同步。

## 公共协议

```text
Los Alamos/
  README.md
  AGENTS.md
  CLAUDE.md
  .los/
  .trae/skills/los-alamos-residency/SKILL.md
  skills/los-alamos-residency/SKILL.md
  residency.json
  schemas/
  projects/<project-id>/brief.md
  projects/<project-id>/model.json
  projects/<project-id>/events.jsonl
  sessions/<session-id>.json
```

Agent 必须先读取 `AGENTS.md`，优先通过 `./.los/los` 操作；只有 CLI 无法表达合理的任务图变更时，才直接编辑结构化文件。

## 开发

要求 Node.js `20.19.0` 或更高版本。

```bash
npm install
npm run dev
npm test
npm run build
npm run pack
```

macOS arm64 本地构建产物位于：

```text
release/mac-arm64/Los Alamos.app
```

源码仓库不会提交本地 `workspace/` 数据或 `release/` 构建产物。打包应用的正式数据默认位于 `~/Documents/Los Alamos/`。
