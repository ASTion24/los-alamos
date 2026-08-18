import json
from pathlib import Path
from time import time
from typing import Optional

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "workspace" / ".runtime" / "visual" / "packaged-app.png"
ABOUT_SHOT = ROOT / "workspace" / ".runtime" / "visual" / "packaged-about.png"
errors = []


def request_open(workspace_root: Path, target: str, item_id: Optional[str] = None) -> None:
    request_path = workspace_root / ".runtime" / "open-request.json"
    temporary_path = request_path.with_suffix(f".{int(time() * 1000)}.tmp")
    payload = {
        "at": "2026-08-18T00:00:00.000Z",
        "payload": {
            "target": target,
            "source": "packaged-smoke",
        },
    }
    if item_id:
        payload["payload"]["id"] = item_id
    temporary_path.write_text(f"{json.dumps(payload)}\n", encoding="utf8")
    temporary_path.replace(request_path)


with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9223")
    context = browser.contexts[0]
    page = context.pages[0]
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.reload()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Los Alamos", exact=True).wait_for()

    assert page.title() == "Los Alamos"
    assert page.evaluate("typeof window.los") == "object"
    assert page.evaluate("typeof window.los.getAboutState") == "function"
    assert page.evaluate("typeof window.los.dismissAbout") == "function"
    assert page.evaluate("typeof window.los.getWorkspaceHealth") == "function"
    assert page.evaluate("typeof window.los.updateProjectBrief") == "function"
    assert page.evaluate("typeof window.los.setProjectArchived") == "function"
    assert page.evaluate("typeof window.los.startSession") == "function"
    assert page.evaluate("typeof window.los.cancelSessionProposal") == "function"
    about_state = page.evaluate("window.los.getAboutState()")
    assert about_state["shouldShow"] is True
    page.locator(".about-plane").wait_for()
    assert page.get_by_text("关于 Los Alamos", exact=True).is_visible()
    assert page.get_by_text("原生应用", exact=True).is_visible()
    assert page.get_by_text("Agent workspace", exact=True).is_visible()
    page.screenshot(path=ABOUT_SHOT, full_page=True)
    page.get_by_role("button", name="进入 Los Alamos", exact=True).click()
    page.locator(".about-plane").wait_for(state="detached")
    assert page.evaluate("window.los.getAboutState()")["shouldShow"] is False
    page.reload()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Los Alamos", exact=True).wait_for()
    assert page.locator(".about-plane").count() == 0

    health = page.evaluate("window.los.getWorkspaceHealth()")
    assert "issues" in health
    assert "projectCount" in health
    assert page.locator(".atelier").is_visible()
    assert page.locator(".projects-overview-plane").is_visible()
    assert page.locator(".workspace-count").count() == 0
    workspace_root = Path(page.evaluate("window.los.workspaceRoot()"))
    projects = page.evaluate("window.los.listProjects()")
    if health["projectCount"] <= 1:
        assert page.locator(".overview-metrics").count() == 0
    if projects:
        request_open(workspace_root, "project", projects[0]["id"])
        page.locator(".project-detail").wait_for()
        assert page.get_by_text("下一入口", exact=True).is_visible()
        assert page.get_by_text("最近推进", exact=True).is_visible()
        assert page.get_by_label("更新项目事实").is_visible()
        assert page.locator(".project-title-metrics").count() == 0
    request_open(workspace_root, "create")
    page.locator(".project-create-card").wait_for()
    page.get_by_label("关闭新增项目").click()
    request_open(workspace_root, "settings")
    page.locator(".settings-plane").wait_for()
    assert page.locator(".workspace-health").is_visible()
    assert page.locator(".settings-mode").count() == 0
    assert page.locator(".settings-field input").evaluate_all(
        "(inputs) => inputs.every((input) => !input.disabled)"
    )
    page.get_by_label("关闭设置").click(force=True)
    request_open(workspace_root, "about")
    page.locator(".about-plane").wait_for()
    page.get_by_label("关闭关于 Los Alamos").click()
    page.locator(".about-plane").wait_for(state="detached")
    request_open(workspace_root, "history")
    page.locator(".history-plane").wait_for()
    request_open(workspace_root, "residency")
    page.locator(".work-plane").wait_for()
    if page.locator(".residency-proposal").count() > 0:
        assert page.get_by_text("选择依据", exact=True).is_visible()
        assert page.get_by_text("本轮边界", exact=True).is_visible()
    else:
        assert page.get_by_role("button", name="生成驻留提案", exact=True).is_visible()
        assert page.locator(".residency-instruments .clock-dial").count() == 1
        assert page.locator(".load-book").count() == 4
    page.screenshot(path=SHOT, full_page=True)
    request_open(workspace_root, "projects")
    page.locator(".projects-overview-plane").wait_for()

    assert not errors, f"Renderer console errors: {errors}"
    browser.close()

print(f"packaged smoke passed; screenshots: {ABOUT_SHOT}, {SHOT}")
