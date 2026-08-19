import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "LOS_ALAMOS_SMOKE_OUTPUT",
        ROOT / "workspace" / ".runtime" / "visual",
    )
)
SHOT = OUTPUT / f"packaged-app-{sys.platform}.png"
ABOUT_SHOT = OUTPUT / f"packaged-about-{sys.platform}.png"
LOG = OUTPUT / f"packaged-app-{sys.platform}.log"
SMOKE_API_KEY = "los-alamos-packaged-smoke-not-a-secret"
SKIP_SAFE_STORAGE = os.environ.get("LOS_ALAMOS_SKIP_SAFE_STORAGE_SMOKE") == "1"


def find_executable() -> Path:
    configured = os.environ.get("LOS_ALAMOS_PACKAGED_EXECUTABLE")
    if configured:
        executable = Path(configured).expanduser().resolve()
        if executable.is_file():
            return executable
        raise FileNotFoundError(f"Configured executable does not exist: {executable}")

    if sys.platform == "darwin":
        patterns = ["mac*/Los Alamos.app/Contents/MacOS/Los Alamos"]
    elif sys.platform == "win32":
        patterns = ["win*-unpacked/Los Alamos.exe", "win-unpacked/Los Alamos.exe"]
    else:
        patterns = ["linux*-unpacked/los-alamos", "linux-unpacked/los-alamos"]

    for pattern in patterns:
        candidates = sorted((ROOT / "release").glob(pattern))
        if candidates:
            return candidates[0].resolve()
    raise FileNotFoundError(f"No packaged executable found for {sys.platform}.")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def wait_for_cdp(port: int, process: subprocess.Popen[bytes], log_path: Path) -> None:
    deadline = time.monotonic() + 90
    endpoint = f"http://127.0.0.1:{port}/json/version"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            log = log_path.read_text(encoding="utf8", errors="replace")
            raise RuntimeError(
                f"Packaged application exited with {process.returncode} before CDP was ready.\n{log}"
            )
        try:
            with urlopen(endpoint, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for packaged application CDP on port {port}.")


def request_open(workspace_root: Path, target: str, item_id: Optional[str] = None) -> None:
    request_path = workspace_root / ".runtime" / "open-request.json"
    temporary_path = request_path.with_suffix(f".{int(time.time() * 1000)}.tmp")
    payload = {
        "at": "2026-08-19T00:00:00.000Z",
        "payload": {
            "target": target,
            "source": "packaged-smoke",
        },
    }
    if item_id:
        payload["payload"]["id"] = item_id
    temporary_path.write_text(f"{json.dumps(payload)}\n", encoding="utf8")
    temporary_path.replace(request_path)


def verify_agent_runtime(executable: Path, workspace_root: Path) -> None:
    runtime = workspace_root / ".los" / "los.mjs"
    assert runtime.is_file()
    assert (workspace_root / "README.md").is_file()
    assert (workspace_root / "AGENTS.md").is_file()
    assert (workspace_root / ".trae" / "skills" / "los-alamos-residency" / "SKILL.md").is_file()
    launcher = workspace_root / ".los" / ("los.cmd" if sys.platform == "win32" else "los")
    assert launcher.is_file()

    environment = os.environ.copy()
    environment["ELECTRON_RUN_AS_NODE"] = "1"
    environment["LOS_ALAMOS_WORKSPACE"] = str(workspace_root)
    result = subprocess.run(
        [
            str(executable),
            str(runtime),
            "agent",
            "capabilities",
            "--json",
        ],
        cwd=workspace_root,
        env=environment,
        capture_output=True,
        check=True,
        encoding="utf8",
        text=True,
        timeout=30,
    )
    capabilities = json.loads(result.stdout)
    assert capabilities["protocolVersion"] == "1"
    assert capabilities["entryCommand"].endswith("agent context --json")


def terminate(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def run_smoke(
    executable: Path,
    port: int,
    workspace_root: Path,
    user_data: Path,
) -> None:
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.wait_for_event("page", timeout=30_000)
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.reload()
        page.wait_for_load_state("domcontentloaded")
        page.get_by_text("Los Alamos", exact=True).wait_for()

        assert page.title() == "Los Alamos"
        assert page.evaluate("typeof window.los") == "object"
        assert page.evaluate("window.los.platform") == sys.platform
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
        actual_workspace = Path(page.evaluate("window.los.workspaceRoot()"))
        assert actual_workspace.resolve() == workspace_root.resolve()
        verify_agent_runtime(executable, actual_workspace)

        projects = page.evaluate("window.los.listProjects()")
        if health["projectCount"] <= 1:
            assert page.locator(".overview-metrics").count() == 0
        if projects:
            request_open(actual_workspace, "project", projects[0]["id"])
            page.locator(".project-detail").wait_for()
            assert page.get_by_text("下一入口", exact=True).is_visible()
            assert page.get_by_text("最近推进", exact=True).is_visible()
            assert page.get_by_label("更新项目事实").is_visible()
            assert page.locator(".project-title-metrics").count() == 0
        request_open(actual_workspace, "create")
        page.locator(".project-create-card").wait_for()
        page.get_by_label("关闭新增项目").click()
        request_open(actual_workspace, "settings")
        page.locator(".settings-plane").wait_for()
        assert page.locator(".workspace-health").is_visible()
        assert page.locator(".settings-mode").count() == 0
        assert page.locator(".settings-field input").evaluate_all(
            "(inputs) => inputs.every((input) => !input.disabled)"
        )
        if not SKIP_SAFE_STORAGE:
            saved_settings = page.evaluate(
                """(apiKey) => window.los.saveSettings({
                    baseUrl: "https://example.invalid/v1",
                    model: "packaged-smoke",
                    apiKey
                })""",
                SMOKE_API_KEY,
            )
            assert saved_settings["hasApiKey"] is True
            assert page.evaluate("window.los.getSettings()")["hasApiKey"] is True
            settings_path = user_data / "settings.json"
            assert settings_path.is_file()
            assert SMOKE_API_KEY not in settings_path.read_text(
                encoding="utf8",
                errors="replace",
            )
            cleared_settings = page.evaluate(
                """window.los.saveSettings({
                    baseUrl: "https://example.invalid/v1",
                    model: "packaged-smoke",
                    clearApiKey: true
                })"""
            )
            assert cleared_settings["hasApiKey"] is False
        page.get_by_label("关闭设置").click(force=True)
        request_open(actual_workspace, "about")
        page.locator(".about-plane").wait_for()
        page.get_by_label("关闭关于 Los Alamos").click()
        page.locator(".about-plane").wait_for(state="detached")
        request_open(actual_workspace, "history")
        page.locator(".history-plane").wait_for()
        request_open(actual_workspace, "residency")
        page.locator(".work-plane").wait_for()
        if page.locator(".residency-proposal").count() > 0:
            assert page.get_by_text("选择依据", exact=True).is_visible()
            assert page.get_by_text("本轮边界", exact=True).is_visible()
        else:
            assert page.get_by_role("button", name="生成驻留提案", exact=True).is_visible()
            assert page.locator(".residency-instruments .clock-dial").count() == 1
            assert page.locator(".load-book").count() == 4
        page.screenshot(path=SHOT, full_page=True)
        request_open(actual_workspace, "projects")
        page.locator(".projects-overview-plane").wait_for()

        assert not errors, f"Renderer console errors: {errors}"
        browser.close()


def main() -> None:
    executable = find_executable()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    port = free_port()

    with tempfile.TemporaryDirectory(prefix="los-alamos-packaged-smoke-") as temporary:
        temporary_root = Path(temporary)
        user_data = temporary_root / "user-data"
        workspace_root = temporary_root / "workspace"
        environment = os.environ.copy()
        environment["LOS_ALAMOS_WORKSPACE"] = str(workspace_root)
        environment["ELECTRON_ENABLE_LOGGING"] = "1"
        command = [
            str(executable),
            f"--user-data-dir={user_data}",
            f"--remote-debugging-port={port}",
            "--no-first-run",
        ]
        if sys.platform.startswith("linux"):
            command.extend(
                [
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                ]
            )
            password_store = os.environ.get("LOS_ALAMOS_SMOKE_PASSWORD_STORE")
            if password_store:
                command.append(f"--password-store={password_store}")

        with LOG.open("wb") as log:
            process = subprocess.Popen(
                command,
                cwd=executable.parent,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_for_cdp(port, process, LOG)
                run_smoke(executable, port, workspace_root, user_data)
            finally:
                terminate(process)

    print(
        f"packaged smoke passed on {sys.platform}; executable: {executable}; "
        f"screenshots: {ABOUT_SHOT}, {SHOT}; log: {LOG}"
    )


if __name__ == "__main__":
    main()
