from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "workspace" / ".runtime" / "visual"
OUT.mkdir(parents=True, exist_ok=True)

PROJECT = {
    "id": "paper-revision",
    "title": "Paper revision",
    "brief": "Draft and experiments exist. The paper needs a final argument pass and submission packaging.",
    "goal": "Submit a coherent final manuscript without carrying unresolved editorial debt.",
    "closeCriteria": [
        "The manuscript passes a final internal review.",
        "Submission files are complete and archived.",
    ],
    "currentState": "Draft 82%, experiments closed, discussion and packaging remain.",
    "unknowns": ["Whether one supplementary figure is still required."],
    "taskGraph": {
        "tasks": [
            {
                "id": "scope",
                "title": "Freeze the closing line",
                "description": "Define exactly what counts as submission-ready.",
                "status": "done",
                "dependsOn": [],
                "effortMinutes": 20,
                "intensity": "low",
                "weight": 12,
                "progressPercent": 100,
                "completionCriteria": "Submission-ready definition is written.",
                "startAction": "Write the final acceptance checklist.",
                "notDoing": "Do not revise prose yet.",
            },
            {
                "id": "argument",
                "title": "Tighten the central argument",
                "description": "Reconcile the introduction, results, and discussion claims.",
                "status": "in_progress",
                "dependsOn": ["scope"],
                "effortMinutes": 90,
                "intensity": "high",
                "weight": 34,
                "progressPercent": 35,
                "completionCriteria": "The main claim is consistent in all three sections.",
                "startAction": "Read the claim sentences side by side.",
                "notDoing": "Do not polish references or formatting.",
            },
            {
                "id": "figure",
                "title": "Resolve supplementary figure",
                "description": "Decide whether the figure is necessary and either finish or remove it.",
                "status": "todo",
                "dependsOn": ["scope"],
                "effortMinutes": 35,
                "intensity": "medium",
                "weight": 18,
                "progressPercent": 0,
                "completionCriteria": "The figure has a final include/remove decision.",
                "startAction": "Compare the figure against the stated closing criterion.",
                "notDoing": "Do not generate new experiments.",
            },
            {
                "id": "review",
                "title": "Run final review",
                "description": "Review the complete manuscript against the closing checklist.",
                "status": "todo",
                "dependsOn": ["argument", "figure"],
                "effortMinutes": 60,
                "intensity": "high",
                "weight": 22,
                "progressPercent": 0,
                "completionCriteria": "Every checklist item is confirmed or explicitly waived.",
                "startAction": "Open the checklist and manuscript together.",
                "notDoing": "Do not expand scope.",
            },
            {
                "id": "package",
                "title": "Package and archive",
                "description": "Prepare submission files and leave a compact archive.",
                "status": "todo",
                "dependsOn": ["review"],
                "effortMinutes": 30,
                "intensity": "low",
                "weight": 14,
                "progressPercent": 0,
                "completionCriteria": "Submission package and archive both exist.",
                "startAction": "Create the final submission folder.",
                "notDoing": "Do not reopen editorial decisions.",
            },
        ]
    },
    "completionPercent": 12,
    "confidence": "medium",
    "compact": "Argument is the current critical path; the supplementary figure can proceed in parallel.",
    "createdAt": "2026-08-17T10:00:00.000Z",
    "updatedAt": "2026-08-17T11:00:00.000Z",
    "updatedBy": "app",
    "revision": 3,
}


def mock_script():
    return f"""
    const project = {PROJECT!r};
    const projects = [
      project,
      ...[2, 3, 4, 5].map((index) => ({{
        ...project,
        id: `paper-revision-${{index}}`,
        title: `Paper revision ${{index}}`,
        completionPercent: 12 + index
      }}))
    ];
    const closedSession = {{
      id: 'session-closed',
      projectId: project.id,
      projectTitle: project.title,
      taskId: 'scope',
      taskTitle: 'Freeze the closing line',
      scope: 'full_task',
      minutesPlanned: 20,
      intensity: 'low',
      status: 'closed',
      startedAt: '2026-08-17T10:00:00.000Z',
      endedAt: '2026-08-17T10:18:00.000Z',
      userResult: 'completed',
      prompt: 'Freeze the closing line.',
      startAction: 'Write the exact closing condition.',
      completionCriteria: 'The closing condition is explicit.',
      notDoing: 'Do not expand the project scope.',
      selectionReason: 'The task fit the available constraints.',
      log: '关闭标准已明确，下一次可以直接进入中心论点修订。',
      updatedAt: '2026-08-17T10:18:00.000Z',
      updatedBy: 'app',
      revision: 2
    }};
    let currentSession = null;
    window.los = {{
      platform: 'linux',
      workspaceRoot: async () => '/mock/LosAlamos/workspace',
      showWorkspace: async () => '',
      getAboutState: async () => ({{
        version: '1',
        shouldShow: sessionStorage.getItem('los-about-seen') !== '1'
      }}),
      dismissAbout: async () => {{
        sessionStorage.setItem('los-about-seen', '1');
        return {{ version: '1', shouldShow: false }};
      }},
      listProjects: async () => projects,
      createProject: async (input) => project,
      reanalyzeProject: async () => project,
      updateProjectBrief: async (input) => {{
        project.brief = input.brief;
        return project;
      }},
      setProjectArchived: async (input) => {{
        project.archivedAt = input.archived ? new Date().toISOString() : undefined;
        return project;
      }},
      updateTask: async (input) => {{
        const index = project.taskGraph.tasks.findIndex((task) => task.id === input.taskId);
        project.taskGraph.tasks[index] = {{ ...project.taskGraph.tasks[index], ...input.patch }};
        return project;
      }},
      listSessions: async () => currentSession ? [currentSession, closedSession] : [closedSession],
      proposeSession: async (input) => {{
        currentSession = {{
          id: 'session-' + Date.now(),
          projectId: project.id,
          projectTitle: project.title,
          taskId: 'figure',
          taskTitle: 'Resolve supplementary figure',
          scope: 'full_task',
          minutesPlanned: input.minutes,
          intensity: input.intensity,
          status: 'proposed',
          startedAt: new Date().toISOString(),
          prompt: 'Only resolve the supplementary figure decision.',
          startAction: 'Compare the figure against the stated closing criterion.',
          completionCriteria: 'The figure has a final include/remove decision.',
          notDoing: 'Do not generate new experiments.',
          selectionReason: '任务规模与可用时间接近，可以在本轮形成明确结果。',
          updatedAt: new Date().toISOString(),
          updatedBy: 'app',
          revision: 1
        }};
        return currentSession;
      }},
      startSession: async () => {{
        currentSession = {{
          ...currentSession,
          status: 'active',
          startedAt: new Date(Date.now() - 94000).toISOString(),
          revision: currentSession.revision + 1
        }};
        return currentSession;
      }},
      cancelSessionProposal: async () => {{
        currentSession = {{
          ...currentSession,
          status: 'cancelled',
          endedAt: new Date().toISOString(),
          revision: currentSession.revision + 1
        }};
        return currentSession;
      }},
      closeSession: async (input) => ({{}}),
      getWorkspaceHealth: async () => ({{
        ok: true,
        checkedAt: new Date().toISOString(),
        projectCount: projects.length,
        sessionCount: 1,
        backupCount: 2,
        issues: []
      }}),
      getSettings: async () => ({{
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        hasApiKey: false
      }}),
      testSettings: async () => ({{
        ok: true,
        model: 'gpt-4.1-mini',
        latencyMs: 120
      }}),
      saveSettings: async (input) => ({{
        baseUrl: input.baseUrl,
        model: input.model,
        hasApiKey: Boolean(input.apiKey)
      }}),
      onOpenRequest: (callback) => {{
        window.__losOpenRequest = (payload) => callback({{ payload }});
        return () => {{
          delete window.__losOpenRequest;
        }};
      }},
      onWorkspaceChanged: () => () => {{}},
      onOperationWarning: () => () => {{}},
      onSessionDeadline: () => () => {{}}
    }};
    """


def assert_no_bad_overlap(page):
    collisions = page.evaluate(
        """
        () => {
          const taskEditorOpen = Boolean(document.querySelector('.task-editor'));
          const settingsOpen = Boolean(document.querySelector('.settings-plane'));
          const aboutOpen = Boolean(document.querySelector('.about-plane'));
          const selectors = aboutOpen
            ? ['.about-plane button']
            : settingsOpen
              ? ['.settings-plane button']
              : [
                '.topline button',
                '.time-slab button',
                '.residency-control button',
                '.residency-proposal button',
                '.project-note',
                '.history-note',
                ...(taskEditorOpen ? [] : ['.map-node']),
                '.task-editor button',
                '.finish-actions button'
              ];
          const items = [...document.querySelectorAll(selectors.join(','))]
            .map((el) => {
              const raw = el.getBoundingClientRect();
              const stage = el.closest('.stage');
              const clip = stage ? stage.getBoundingClientRect() : {
                left: 0,
                top: 0,
                right: innerWidth,
                bottom: innerHeight
              };
              const r = {
                left: Math.max(raw.left, clip.left, 0),
                top: Math.max(raw.top, clip.top, 0),
                right: Math.min(raw.right, clip.right, innerWidth),
                bottom: Math.min(raw.bottom, clip.bottom, innerHeight)
              };
              const s = getComputedStyle(el);
              return { el, r, visible: r.right - r.left > 1 && r.bottom - r.top > 1 && s.visibility !== 'hidden' && s.display !== 'none' };
            })
            .filter((item) => item.visible);
          const collisions = [];
          for (let i = 0; i < items.length; i += 1) {
            const a = items[i].el;
            const ar = items[i].r;
            for (let j = i + 1; j < items.length; j += 1) {
              const b = items[j].el;
              if (a.contains(b) || b.contains(a)) continue;
              const br = items[j].r;
              const w = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
              const h = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
              if (w > 2 && h > 2) {
                collisions.push({
                  a: [a.className, a.textContent.trim().slice(0, 30), Math.round(ar.top), Math.round(ar.bottom)],
                  b: [b.className, b.textContent.trim().slice(0, 30), Math.round(br.top), Math.round(br.bottom)],
                  overlap: [Math.round(w), Math.round(h)]
                });
              }
            }
          }
          return collisions;
        }
        """
    )
    assert not collisions, f"Unexpected overlapping controls: {collisions[:8]}"


def assert_controls_in_view(page):
    offenders = page.evaluate(
        """
        () => {
          const root = document.querySelector('.settings-plane') ?? document;
          return [...root.querySelectorAll('button, input, textarea, select')]
          .filter((el) => {
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return r.width > 1 && r.height > 1 && (
              r.left < -1 ||
              r.top < -1 ||
              r.right > innerWidth + 1 ||
              r.bottom > innerHeight + 1
            );
          })
          .slice(0, 8)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              cls: el.className,
              text: el.textContent?.trim().slice(0, 30),
              rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]
            };
          })
        }
        """
    )
    assert not offenders, f"Controls clipped outside viewport: {offenders}"


def assert_no_scrollbars(page):
    offenders = page.evaluate(
        """
        () => {
          const allowed = new Set(['visible', 'hidden', 'clip']);
          return [...document.querySelectorAll('*')]
            .filter((el) => {
              const s = getComputedStyle(el);
              const hasScrollX = el.scrollWidth - el.clientWidth > 1 && !allowed.has(s.overflowX);
              const hasScrollY = el.scrollHeight - el.clientHeight > 1 && !allowed.has(s.overflowY);
              return hasScrollX || hasScrollY;
            })
            .slice(0, 8)
            .map((el) => ({
              cls: el.className,
              overflowX: getComputedStyle(el).overflowX,
              overflowY: getComputedStyle(el).overflowY,
              size: [el.clientWidth, el.clientHeight],
              scroll: [el.scrollWidth, el.scrollHeight]
            }));
        }
        """
    )
    assert not offenders, f"Unexpected scrollbars: {offenders}"


def intensity_alignment_error(page):
    return page.evaluate(
        """
        () => {
          const thumb = document.querySelector('.energy-thumb').getBoundingClientRect();
          const label = document.querySelector('.intensity-scale button.active').getBoundingClientRect();
          return Math.abs(
            (thumb.left + thumb.width / 2) -
            (label.left + label.width / 2)
          );
        }
        """
    )


def assert_refined_motion(page):
    motion = page.locator(".projects-overview-plane, .project-focus-plane, .work-plane, .history-plane").first.evaluate(
        """
        (el) => {
          const style = getComputedStyle(el);
          return {
            name: style.animationName,
            duration: Number.parseFloat(style.animationDuration) || 0,
            transform: style.transform
          };
        }
        """
    )
    assert motion["duration"] <= 0.15, f"Primary transition is too slow: {motion}"
    assert page.locator(".switch-flash").count() == 0
    assert page.get_by_text("长尾项目，一屏判断", exact=True).count() == 0


with sync_playwright() as p:
    system_chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    launch_options = {"headless": True}
    if system_chrome.exists():
        launch_options["executable_path"] = str(system_chrome)
    browser = p.chromium.launch(**launch_options)
    for width, height in [(1180, 760), (980, 640)]:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.add_init_script(mock_script())
        page.goto("http://127.0.0.1:5174")
        page.wait_for_load_state("networkidle")
        page.get_by_text("Los Alamos", exact=True).wait_for()
        page.wait_for_timeout(240)

        page.locator(".about-plane").wait_for()
        page.screenshot(path=OUT / f"about-{width}x{height}.png", full_page=True)
        assert page.get_by_text("关于 Los Alamos", exact=True).is_visible()
        assert page.get_by_text("原生应用", exact=True).is_visible()
        assert page.get_by_text("Agent workspace", exact=True).is_visible()
        assert page.get_by_text("./.los/los agent context --json", exact=True).is_visible()
        assert page.locator(".about-path").count() == 2
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.get_by_role("button", name="进入 Los Alamos", exact=True).click()
        page.locator(".about-plane").wait_for(state="detached")
        assert page.evaluate("sessionStorage.getItem('los-about-seen')") == "1"

        page.screenshot(path=OUT / f"home-{width}x{height}.png", full_page=True)
        assert page.locator(".project-note").count() >= 1
        assert page.locator(".overview-slab").is_visible()
        assert page.get_by_text("在 Los Alamos，把未关闭的中间状态", exact=False).is_visible()
        assert page.locator(".overview-metrics").count() == 0
        assert page.get_by_text("项目列表", exact=True).count() == 0
        assert page.locator(".workspace-count").count() == 0
        assert page.locator(".new-project-tile").is_visible()
        assert page.get_by_text("1 / 2", exact=True).is_visible()
        first_page_title = page.locator(".project-note h3").first.inner_text()
        page.locator(".pager button").last.click()
        page.get_by_text("2 / 2", exact=True).wait_for()
        assert page.locator(".project-note h3").first.inner_text() != first_page_title
        page.locator(".pager button").first.click()
        page.get_by_text("1 / 2", exact=True).wait_for()
        assert page.locator(".project-wall-footer").evaluate(
            """
            (footer) => footer.getBoundingClientRect().top >=
              footer.closest('.gallery-slab').querySelector('.project-wall').getBoundingClientRect().bottom - 1
            """
        )
        project_note_geometry = page.locator(".project-note").first.evaluate(
            """
            (el) => {
              const note = el.getBoundingClientRect();
              const wall = el.closest('.project-wall').getBoundingClientRect();
              return {
                width: note.width,
                squareError: Math.abs(note.width - note.height),
                columnCount: getComputedStyle(el.closest('.project-wall')).gridTemplateColumns.split(' ').length,
                titleFont: getComputedStyle(el.querySelector('h3')).fontFamily
              };
            }
            """
        )
        assert project_note_geometry["width"] >= 180
        assert project_note_geometry["squareError"] <= 2
        assert 1 <= project_note_geometry["columnCount"] <= 4
        assert "Songti" not in project_note_geometry["titleFont"]
        assert "STSong" not in project_note_geometry["titleFont"]
        overview_composition = page.evaluate(
            """
            () => {
              const plane = document.querySelector('.projects-overview-plane').getBoundingClientRect();
              const head = document.querySelector('.overview-slab').getBoundingClientRect();
              const row = document.querySelector('.project-wall').getBoundingClientRect();
              const footer = document.querySelector('.project-wall-footer').getBoundingClientRect();
              return {
                width: plane.width,
                sideImbalance: Math.abs(plane.left - (innerWidth - plane.right)),
                footerBelowWall: footer.top >= row.bottom - 1,
                verticalImbalance: Math.abs((head.top - plane.top) - (plane.bottom - footer.bottom))
              };
            }
            """
        )
        assert overview_composition["width"] <= 961
        assert overview_composition["sideImbalance"] <= 2
        assert overview_composition["footerBelowWall"]
        assert overview_composition["verticalImbalance"] <= 32
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        assert_refined_motion(page)

        assert page.evaluate("typeof window.__losOpenRequest") == "function"
        page.evaluate("window.__losOpenRequest({ target: 'settings' })")
        page.locator(".settings-plane").wait_for()
        page.keyboard.press("Escape")
        page.evaluate("window.__losOpenRequest({ target: 'about' })")
        page.locator(".about-plane").wait_for()
        page.get_by_label("关闭关于 Los Alamos").click()
        page.locator(".about-plane").wait_for(state="detached")
        page.evaluate("window.__losOpenRequest({ target: 'residency' })")
        page.locator(".work-plane").wait_for()
        page.evaluate("window.__losOpenRequest({ target: 'projects' })")
        page.locator(".projects-overview-plane").wait_for()

        page.evaluate("window.__losOpenRequest({ target: 'create' })")
        page.locator(".project-create-card").wait_for()
        page.wait_for_timeout(160)
        page.screenshot(path=OUT / f"project-create-{width}x{height}.png", full_page=True)
        create_action = page.locator(".create-card-foot button").evaluate(
            """
            (button) => ({
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
              textFits: button.scrollWidth <= button.clientWidth
            })
            """
        )
        assert create_action["width"] >= 168
        assert create_action["height"] >= 50
        assert create_action["textFits"]
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.keyboard.press("Escape")
        assert page.locator(".project-create-card").count() == 0

        page.evaluate("window.__losOpenRequest({ target: 'history' })")
        page.locator(".history-plane").wait_for()
        page.wait_for_timeout(160)
        page.screenshot(path=OUT / f"history-{width}x{height}.png", full_page=True)
        assert page.get_by_text("驻留记录", exact=True).is_visible()
        assert page.get_by_text("保留每次推进的边界与结果", exact=True).count() == 0
        assert page.locator(".history-row").count() == 0
        assert page.locator(".history-wall").is_visible()
        history_note_geometry = page.locator(".history-note").first.evaluate(
            """
            (el) => {
              const note = el.getBoundingClientRect();
              return {
                width: note.width,
                squareError: Math.abs(note.width - note.height),
                titleFont: getComputedStyle(el.querySelector('h3')).fontFamily
              };
            }
            """
        )
        assert history_note_geometry["width"] >= 160
        assert history_note_geometry["squareError"] <= 2
        assert "Songti" not in history_note_geometry["titleFont"]
        history_composition = page.locator(".history-plane").evaluate(
            """
            (plane) => {
              const r = plane.getBoundingClientRect();
              const head = plane.querySelector('.history-slab').getBoundingClientRect();
              const note = plane.querySelector('.history-note').getBoundingClientRect();
              return {
                width: r.width,
                sideImbalance: Math.abs(r.left - (innerWidth - r.right)),
                verticalImbalance: Math.abs((head.top - r.top) - (r.bottom - note.bottom))
              };
            }
            """
        )
        assert history_composition["width"] <= 961
        assert history_composition["sideImbalance"] <= 2
        assert history_composition["verticalImbalance"] <= 32
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.get_by_role("button", name="项目", exact=True).click()

        page.evaluate("window.__losOpenRequest({ target: 'project', id: 'paper-revision' })")
        page.locator(".project-detail").wait_for()
        page.wait_for_timeout(240)
        page.screenshot(path=OUT / f"project-detail-{width}x{height}.png", full_page=True)
        assert page.get_by_role("button", name="返回总览").is_visible()
        assert "Songti" not in page.locator(".project-heading h2").evaluate(
            "(el) => getComputedStyle(el).fontFamily"
        )
        assert "linear-gradient" in page.locator(".progress-segment").first.evaluate(
            "(el) => getComputedStyle(el).backgroundImage"
        )
        assert page.get_by_text("下一入口", exact=True).is_visible()
        assert page.get_by_text("最近推进", exact=True).is_visible()
        assert page.get_by_label("更新项目事实").is_visible()
        assert page.get_by_label("归档项目").is_visible()
        assert page.locator(".task-connection.active-flow").count() >= 1
        assert page.locator(".task-connection.active-flow").first.evaluate(
            "(el) => getComputedStyle(el).animationName"
        ) == "dependency-flow"
        assert page.locator(".project-title-metrics").count() == 0
        assert page.get_by_text("判断稳定", exact=True).count() == 0
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        page.get_by_label("更新项目事实").click()
        page.locator(".project-brief-card").wait_for()
        page.wait_for_timeout(180)
        page.screenshot(path=OUT / f"project-brief-{width}x{height}.png", full_page=True)
        assert page.get_by_role("button", name="保存并重建任务图").is_visible()
        assert page.get_by_text("权威事实", exact=True).count() == 0
        assert page.locator(".project-brief-card footer span").count() == 0
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.keyboard.press("Escape")
        assert page.locator(".project-brief-card").count() == 0

        page.get_by_label("归档项目").click()
        page.locator(".projects-overview-plane").wait_for()
        page.evaluate("window.__losOpenRequest({ target: 'archive' })")
        page.locator(".archive-overview-plane").wait_for()
        assert page.locator(".overview-slab").count() == 0
        assert page.get_by_text("在 Los Alamos，把未关闭的中间状态", exact=False).count() == 0
        assert page.locator(".new-project-tile").count() == 0
        page.screenshot(path=OUT / f"archive-{width}x{height}.png", full_page=True)
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.locator(".project-note").first.click()
        page.get_by_label("恢复项目").click()
        page.locator(".overview-slab").wait_for()
        page.locator(".project-note").first.wait_for()
        page.locator(".project-note").first.click()

        page.get_by_role("button", name="开始驻留").click()
        page.locator(".residency-control").wait_for()
        page.wait_for_timeout(240)
        page.screenshot(path=OUT / f"work-{width}x{height}.png", full_page=True)
        assert page.locator(".residency-pool").count() == 0
        assert page.locator(".dispatch-scope").count() == 0
        assert page.locator(".residency-dispatch").count() == 0
        assert page.get_by_text("项开放任务").count() == 0
        assert page.get_by_text("个项目").count() == 0
        assert page.get_by_text("给出本轮约束", exact=True).count() == 1
        assert page.locator(".begin-block").inner_text().strip() == "生成驻留提案"
        assert page.locator(".residency-instruments .clock-dial").count() == 1
        assert page.locator(".residency-instruments .clock-mark").count() == 12
        assert page.locator(".load-book").count() == 4
        instrument_geometry = page.evaluate(
            """
            () => {
              const rowElement = document.querySelector('.residency-instruments');
              const row = rowElement.getBoundingClientRect();
              const clock = rowElement.querySelector('.clock-dial').getBoundingClientRect();
              const stack = rowElement.querySelector('.load-stack').getBoundingClientRect();
              const controls = document.querySelector('.residency-parameters').getBoundingClientRect();
              return {
                rowAboveControls: row.bottom <= controls.top + 1,
                clockSize: Math.min(clock.width, clock.height),
                stackSize: Math.min(stack.width, stack.height),
                centerDelta: Math.abs(
                  (clock.top + clock.height / 2) - (stack.top + stack.height / 2)
                )
              };
            }
            """
        )
        assert instrument_geometry["rowAboveControls"]
        assert instrument_geometry["clockSize"] >= 109
        assert abs(instrument_geometry["clockSize"] - instrument_geometry["stackSize"]) <= 2
        assert instrument_geometry["centerDelta"] <= 1
        residency_geometry = page.evaluate(
            """
            () => {
              const body = document.querySelector('.residency-body').getBoundingClientRect();
              const control = document.querySelector('.residency-control').getBoundingClientRect();
              const parameters = document.querySelector('.residency-parameters').getBoundingClientRect();
              const submit = document.querySelector('.residency-submit').getBoundingClientRect();
              const time = document.querySelector('.time-control').getBoundingClientRect();
              const intensity = document.querySelector('.intensity-slider').getBoundingClientRect();
              const consoleRect = document.querySelector('.residency-console').getBoundingClientRect();
              return {
                bodySections: document.querySelectorAll('.residency-body > section').length,
                controlWidthRatio: control.width / body.width,
                submitBelowParameters: submit.top >= parameters.bottom - 1,
                submitCenterDelta: Math.abs(
                  (submit.left + submit.width / 2) - (body.left + body.width / 2)
                ),
                unifiedParameters: Math.abs(time.right - intensity.left) <= 1,
                consoleWidth: consoleRect.width,
                sideImbalance: Math.abs(
                  (consoleRect.left - body.left) - (body.right - consoleRect.right)
                ),
                verticalImbalance: Math.abs(
                  (consoleRect.top - body.top) - (body.bottom - consoleRect.bottom)
                )
              };
            }
            """
        )
        assert residency_geometry["bodySections"] == 1
        assert residency_geometry["controlWidthRatio"] >= 0.98
        assert residency_geometry["submitBelowParameters"]
        assert residency_geometry["submitCenterDelta"] <= 2
        assert residency_geometry["unifiedParameters"]
        assert residency_geometry["consoleWidth"] <= 901
        assert residency_geometry["sideImbalance"] <= 2
        assert residency_geometry["verticalImbalance"] <= 32
        assert page.locator(".dispatch-constraint").count() == 0
        assert page.locator(".topline").count() == 0
        assert page.locator(".residency-stage").evaluate(
            "(el) => { const r = el.getBoundingClientRect(); return r.top === 0 && r.left === 0 && r.width === innerWidth && r.height === innerHeight; }"
        )
        assert page.locator(".topnav").count() == 0
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        initial_minute_angle = page.locator(".residency-instruments .clock-dial").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--minute-angle').trim()"
        )
        page.locator(".time-presets button").filter(has_text="45").click()
        assert page.locator(".time-stepper output").get_by_text("45", exact=True).is_visible()
        changed_minute_angle = page.locator(".residency-instruments .clock-dial").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--minute-angle').trim()"
        )
        assert initial_minute_angle != changed_minute_angle
        page.get_by_label("增加 5 分钟").click()
        assert page.locator(".time-stepper output").get_by_text("50", exact=True).is_visible()
        page.locator(".time-presets button").filter(has_text="25").click()

        intensity_input = page.get_by_label("工作强度")
        intensity_input.fill("0")
        page.wait_for_timeout(340)
        relaxed_color = page.locator(".work-plane").evaluate(
            "(el) => getComputedStyle(el).backgroundColor"
        )
        relaxed_position = page.locator(".energy-range").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--intensity-progress').trim()"
        )
        relaxed_book_load = page.locator(".load-book").evaluate_all(
            "(els) => els.reduce((sum, el) => sum + Number(getComputedStyle(el).opacity), 0)"
        )
        assert page.locator(".intensity-scale button.active").get_by_text("low", exact=True).is_visible()
        assert intensity_alignment_error(page) <= 1
        page.screenshot(path=OUT / f"work-low-{width}x{height}.png", full_page=True)
        intensity_input.fill("3")
        page.wait_for_timeout(340)
        fatigued_color = page.locator(".work-plane").evaluate(
            "(el) => getComputedStyle(el).backgroundColor"
        )
        fatigued_position = page.locator(".energy-range").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--intensity-progress').trim()"
        )
        fatigued_book_load = page.locator(".load-book").evaluate_all(
            "(els) => els.reduce((sum, el) => sum + Number(getComputedStyle(el).opacity), 0)"
        )
        assert relaxed_color != fatigued_color
        assert relaxed_position != fatigued_position
        assert fatigued_book_load > relaxed_book_load + 2
        assert intensity_alignment_error(page) <= 1
        assert page.locator(".intensity-scale button.active").get_by_text("xhigh", exact=True).is_visible()
        assert page.locator(".intensity-copy").get_by_text("短时攻坚与高压决策", exact=True).is_visible()
        snap_curve = page.locator(".energy-thumb").evaluate("(el) => getComputedStyle(el).transition")
        assert "cubic-bezier" in snap_curve
        page.screenshot(path=OUT / f"work-xhigh-{width}x{height}.png", full_page=True)
        page.locator(".intensity-scale button").filter(has_text="medium").click()

        page.locator(".begin-block").click()
        page.locator(".residency-proposal").wait_for()
        page.wait_for_timeout(180)
        assert page.locator(".focus-mode").count() == 0
        assert page.get_by_text("选择依据", exact=True).is_visible()
        assert page.get_by_text("第一动作", exact=True).is_visible()
        assert page.get_by_text("结束判断", exact=True).is_visible()
        assert page.get_by_text("本轮边界", exact=True).is_visible()
        assert page.get_by_text("任务规模与可用时间接近，可以在本轮形成明确结果。", exact=True).is_visible()
        assert page.locator(".proposal-contract article").nth(1).evaluate(
            "(el) => getComputedStyle(el, '::before').animationName"
        ) == "boundary-draw"
        page.screenshot(path=OUT / f"proposal-{width}x{height}.png", full_page=True)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        page.get_by_role("button", name="调整约束").click()
        page.locator(".residency-control").wait_for()
        page.locator(".begin-block").click()
        page.locator(".residency-proposal").wait_for()
        page.get_by_role("button", name="确认并进入驻留").click()
        page.locator(".focus-mode").wait_for()
        page.wait_for_timeout(240)
        assert page.locator(".session-clock").is_visible()
        assert page.locator(".session-clock .clock-dial").count() == 1
        assert page.locator(".session-clock .clock-hand.second").count() == 1
        assert page.locator(".session-clock-meta").count() == 0
        assert page.get_by_text("计划 25 分钟", exact=True).count() == 0
        assert page.get_by_text("medium", exact=True).count() == 0
        assert page.get_by_text("完整任务", exact=True).count() == 0
        assert page.locator(".topnav").count() == 0
        assert page.locator(".session-line").count() == 0
        assert page.locator(".residency-chrome-state").inner_text().strip() == ""
        active_sidebar_ratio = page.evaluate(
            """
            () => {
              const body = document.querySelector('.residency-body').getBoundingClientRect();
              const clock = document.querySelector('.time-slab').getBoundingClientRect();
              return clock.width / body.width;
            }
            """
        )
        assert active_sidebar_ratio <= 0.24
        assert "Songti" not in page.locator(".session-title h2").evaluate(
            "(el) => getComputedStyle(el).fontFamily"
        )
        active_composition = page.locator(".active-residency-canvas").evaluate(
            """
            (el) => {
              const r = el.getBoundingClientRect();
              const body = el.closest('.residency-body').getBoundingClientRect();
              return {
                width: r.width,
                sideImbalance: Math.abs((r.left - body.left) - (body.right - r.right)),
                verticalImbalance: Math.abs((r.top - body.top) - (body.bottom - r.bottom))
              };
            }
            """
        )
        assert active_composition["width"] <= 921
        assert active_composition["sideImbalance"] <= 2
        assert active_composition["verticalImbalance"] <= 2
        initial_second_angle = page.locator(".session-clock .clock-dial").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--second-angle').trim()"
        )
        initial_day_progress = page.locator(".work-plane").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--day-progress').trim()"
        )
        page.wait_for_timeout(1100)
        next_second_angle = page.locator(".session-clock .clock-dial").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--second-angle').trim()"
        )
        next_day_progress = page.locator(".work-plane").evaluate(
            "(el) => getComputedStyle(el).getPropertyValue('--day-progress').trim()"
        )
        assert initial_second_angle != next_second_angle
        assert initial_day_progress != next_day_progress
        page.screenshot(path=OUT / f"active-{width}x{height}.png", full_page=True)
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        page.reload()
        page.wait_for_load_state("networkidle")
        page.keyboard.press("Meta+1")
        page.locator(".project-note").first.click()
        page.locator(".task-map").wait_for()
        page.wait_for_timeout(240)
        assert page.locator(".map-node").count() == 5
        assert page.locator(".task-connection").count() == 5
        page.screenshot(path=OUT / f"projects-{width}x{height}.png", full_page=True)
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        page.locator(".map-node").nth(1).click()
        page.locator(".task-editor").wait_for()
        assert page.locator(".task-editor-head > div").count() == 0
        boundary_gap = page.evaluate(
            """
            () => [...document.querySelectorAll('.editor-boundary-grid .editor-field')].map((field) => {
              const label = field.querySelector('span').getBoundingClientRect();
              const input = field.querySelector('textarea').getBoundingClientRect();
              return input.top - label.bottom;
            })
            """
        )
        assert max(boundary_gap) <= 5
        page.wait_for_timeout(200)
        page.screenshot(path=OUT / f"editor-{width}x{height}.png", full_page=True)
        assert page.get_by_role("button", name="保存任务").is_visible()
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)

        page.get_by_label("模型设置").click()
        page.locator(".settings-plane").wait_for()
        page.wait_for_timeout(240)
        assert page.locator(".workspace-health").get_by_text("正常", exact=True).is_visible()
        assert page.get_by_text("模型接入", exact=True).count() == 0
        assert page.locator(".settings-mode").count() == 0
        assert page.locator(".settings-field input").evaluate_all(
            "(inputs) => inputs.every((input) => !input.disabled)"
        )
        page.locator('input[type="password"]').fill("test-key")
        page.get_by_role("button", name="测试连接").click()
        page.get_by_text("连接正常", exact=True).wait_for()
        page.screenshot(path=OUT / f"settings-{width}x{height}.png", full_page=True)
        assert page.locator(".settings-card").evaluate(
            "(el) => el.getBoundingClientRect().width <= 660"
        )
        assert_no_bad_overlap(page)
        assert_controls_in_view(page)
        assert_no_scrollbars(page)
        page.keyboard.press("Escape")
        assert page.locator(".settings-plane").count() == 0

        page.close()
    browser.close()

print(f"visual smoke passed; screenshots: {OUT}")
