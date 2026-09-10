"""Exercise real Electron IPC and persistence in a disposable workspace."""
import json
import os
import socket
import subprocess
import tempfile
import time
import sys
from datetime import date
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "continuity"
OUT.mkdir(parents=True, exist_ok=True)
electron_name = "Electron.app/Contents/MacOS/Electron" if sys.platform == "darwin" else "electron.exe" if sys.platform == "win32" else "electron"
ELECTRON = Path(os.environ.get("LOS_ALAMOS_PACKAGED_EXECUTABLE", ROOT / "node_modules/electron/dist" / electron_name))


def free_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        return server.getsockname()[1]


def check_layout(page):
    result = page.evaluate("""() => {
      const root = document.querySelector('.continuity-dialog, .project-create-card, .about-plane') || document;
      return Array.from(root.querySelectorAll('button, input, select')).filter(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden') return false;
        const scroll = el.closest('.continuity-dialog, .project-create-card, .project-tab-body, .focus-slab, .plans-plane, .focus-entry, .attention-shelf');
        return r.left < -1 || r.right > innerWidth + 1 || (!scroll && (r.top < -1 || r.bottom > innerHeight + 1));
      }).map(el => el.textContent || el.getAttribute('aria-label'));
    }""")
    assert not result, f"Clipped controls: {result}"


def run(width, height):
    with tempfile.TemporaryDirectory(prefix="los-acceptance-") as temp:
        workspace = Path(temp) / "data"
        env = os.environ.copy()
        env.pop("ELECTRON_RUN_AS_NODE", None)
        env["LOS_ALAMOS_WORKSPACE"] = str(workspace)
        port = free_port()
        with (OUT / f"electron-{width}.log").open("w") as log:
            command = [str(ELECTRON)]
            if not os.environ.get("LOS_ALAMOS_PACKAGED_EXECUTABLE"):
                command.append(str(ROOT))
            command.extend([f"--remote-debugging-port={port}", f"--user-data-dir={temp}/profile"])
            if sys.platform.startswith("linux"):
                command.extend(["--disable-gpu", "--disable-dev-shm-usage"])
            process = subprocess.Popen(command, env=env, stdout=log, stderr=log, cwd=ROOT)
            try:
                for _ in range(100):
                    try:
                        with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1):
                            break
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError("Electron exited early")
                        time.sleep(.2)
                with sync_playwright() as playwright:
                    browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
                    pages = browser.contexts[0].pages
                    page = pages[0]
                    page.set_default_timeout(8000)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.set_viewport_size({"width": width, "height": height})
                    page.wait_for_load_state("domcontentloaded")
                    page.get_by_role("button", name="进入 Los Alamos", exact=True).wait_for()
                    page.get_by_role("button", name="进入 Los Alamos", exact=True).click()
                    page.locator(".app-commands").get_by_role("button", name="项目", exact=True).click()
                    page.get_by_role("button", name="新增项目", exact=True).click()
                    create = page.get_by_role("dialog", name="新增项目")
                    create.get_by_label("项目标题", exact=True).fill("论文收尾")
                    create.get_by_label("当前状态", exact=True).fill("正文和实验已完成，剩下引用核对与提交。")
                    create.get_by_label("已经完成", exact=True).fill("正文和实验已完成")
                    create.get_by_label("剩余动作（每行一项）", exact=True).fill("核对引用\n提交论文")
                    create.get_by_label("关闭标准", exact=True).fill("取得提交回执")
                    create.get_by_label("起点自述 %（可选）", exact=True).fill("80")
                    check_layout(page)
                    page.screenshot(path=OUT / f"intake-{width}.png")
                    create.get_by_role("button", name="加入总览", exact=True).click()
                    page.locator(".continuity-project").wait_for()
                    page.get_by_text("起点自述 80%", exact=True).wait_for()
                    page.get_by_role("button", name="任务图", exact=True).click()
                    assert page.locator(".map-node").count() == 2
                    assert page.locator(".weighted-progress-label strong").inner_text() == "0%"
                    page.get_by_role("button", name="交接", exact=True).click()
                    page.get_by_role("button", name="编辑交接", exact=True).click()
                    page.screenshot(path=OUT / f"editor-state-{width}.png")
                    editor = page.get_by_role("dialog", name="编辑交接")
                    editor.get_by_label("停在这里", exact=True).fill("已核对前12条引用")
                    editor.get_by_label("下次第一动作", exact=True).fill("从第13条引用继续")
                    editor.get_by_label("已定事项", exact=True).fill("不增加新实验")
                    editor.get_by_label("材料位置 / 证据", exact=True).fill("/tmp/manuscript.md")
                    editor.get_by_role("button", name="保存交接", exact=True).click()
                    editor.wait_for(state="detached")
                    page.get_by_text("从第13条引用继续", exact=True).wait_for()
                    check_layout(page)
                    page.screenshot(path=OUT / f"handoff-{width}.png")
                    page.get_by_role("button", name="开始驻留", exact=True).click()
                    page.get_by_role("button", name="生成驻留提案", exact=True).click()
                    page.locator(".residency-proposal").wait_for()
                    page.get_by_text("从第13条引用继续", exact=True).wait_for()
                    page.get_by_role("button", name="校准边界", exact=True).click()
                    boundary = page.get_by_role("dialog", name="校准本轮边界")
                    boundary.get_by_label("完成标准", exact=True).fill("剩余引用全部核对")
                    boundary.get_by_role("button", name="保存边界", exact=True).click()
                    boundary.wait_for(state="detached")
                    page.get_by_role("button", name="确认并进入驻留", exact=True).click()
                    page.get_by_role("button", name="暂停", exact=True).wait_for()
                    page.get_by_role("button", name="暂停", exact=True).click()
                    page.get_by_role("button", name="继续驻留", exact=True).wait_for()
                    paused = page.locator(".session-clock-head > strong").inner_text()
                    page.wait_for_timeout(1200)
                    assert page.locator(".session-clock-head > strong").inner_text() == paused
                    page.reload()
                    page.get_by_role("button", name="继续驻留", exact=True).wait_for()
                    page.get_by_role("button", name="继续驻留", exact=True).click()
                    page.get_by_role("button", name="暂停", exact=True).wait_for()
                    page.get_by_label("本次推进记录").fill("核对到第20条")
                    page.get_by_role("button", name="部分完成", exact=True).click()
                    closing = page.get_by_role("dialog", name="留下交接，结束本段")
                    closing.get_by_label("下次第一动作", exact=True).fill("从第21条继续")
                    closing.get_by_role("button", name="保存交接", exact=True).click()
                    closing.wait_for(state="detached")
                    page.get_by_text("本段已有推进", exact=True).wait_for()
                    page.get_by_text("从第21条继续", exact=True).wait_for()
                    check_layout(page)
                    page.screenshot(path=OUT / f"session-result-{width}.png")
                    page.get_by_role("button", name="到这里，休息", exact=True).click()
                    page.locator(".app-commands").get_by_role("button", name="项目", exact=True).click()
                    page.locator(".project-note").first.click()
                    page.get_by_role("button", name="任务图", exact=True).click()
                    assert page.locator(".weighted-progress-label strong").inner_text() == "0%"
                    page.get_by_role("button", name="收尾决定", exact=True).click()
                    resolution = page.get_by_role("dialog", name="收尾决定")
                    resolution.get_by_label("决定", exact=True).select_option("parked")
                    resolution.get_by_label("决定原因", exact=True).fill("等待明日核对")
                    resolution.get_by_label("回看日期", exact=True).fill(date.today().isoformat())
                    resolution.get_by_role("button", name="确认决定", exact=True).click()
                    resolution.wait_for(state="detached")
                    page.get_by_role("button", name="交接", exact=True).click()
                    page.get_by_text("等待明日核对", exact=True).wait_for()
                    page.get_by_role("button", name="收尾决定", exact=True).click()
                    resolution = page.get_by_role("dialog", name="收尾决定")
                    resolution.get_by_label("决定", exact=True).select_option("active")
                    resolution.get_by_label("决定原因", exact=True).fill("准备继续")
                    resolution.get_by_role("button", name="确认决定", exact=True).click()
                    resolution.wait_for(state="detached")
                    page.get_by_role("button", name="计划", exact=True).click()
                    page.get_by_role("button", name="新建计划", exact=True).click()
                    plan = page.get_by_role("dialog", name="新建驻留计划")
                    plan.get_by_label("计划名称", exact=True).fill("今天的收尾窗口")
                    plan.get_by_label("每日分钟", exact=True).fill("30")
                    plan.get_by_label("结束标准", exact=True).fill("取得回执")
                    plan.get_by_label("论文收尾", exact=True).check()
                    check_layout(page)
                    page.screenshot(path=OUT / f"plan-editor-{width}.png")
                    plan.get_by_role("button", name="保存草案", exact=True).click()
                    plan.wait_for(state="detached")
                    page.get_by_role("button", name="确认计划", exact=True).click()
                    page.get_by_role("button", name="开始这次驻留", exact=True).wait_for()
                    page.get_by_role("button", name="开始这次驻留", exact=True).click()
                    page.get_by_text("今日剩余", exact=True).wait_for()
                    check_layout(page)
                    page.screenshot(path=OUT / f"plan-active-{width}.png")
                    page.get_by_role("button", name="结束计划", exact=True).click()
                    end = page.get_by_role("dialog", name="结束这次驻留")
                    end.get_by_label("已经关闭什么，还有什么留待以后").fill("窗口已结束，剩余工作有明确交接。")
                    end.get_by_role("button", name="确认结束", exact=True).click()
                    end.wait_for(state="detached")
                    page.get_by_text("过去的驻留", exact=True).wait_for()
                    page.get_by_role("button", name="项目", exact=True).click()
                    for index in range(4):
                        page.get_by_role("button", name="新增项目", exact=True).click()
                        added = page.get_by_role("dialog", name="新增项目")
                        added.get_by_label("项目标题", exact=True).fill(f"收尾样本 {index + 1}")
                        added.get_by_label("当前状态", exact=True).fill("现有成果已经保存，剩余一个核验动作。")
                        added.get_by_label("剩余动作（每行一项）", exact=True).fill("核验当前成果")
                        added.get_by_role("button", name="加入总览", exact=True).click()
                        page.get_by_role("button", name="返回总览", exact=True).click()
                    if page.locator(".pager button").first.is_enabled():
                        page.locator(".pager button").first.click()
                    page.get_by_text("1 / 2", exact=True).wait_for()
                    first_title = page.locator(".project-note h3").first.inner_text()
                    page.locator(".pager button").last.click()
                    page.get_by_text("2 / 2", exact=True).wait_for()
                    assert page.locator(".project-note h3").first.inner_text() != first_title
                    page.wait_for_timeout(400)
                    assert page.get_by_text("2 / 2", exact=True).is_visible()
                    check_layout(page)
                    page.screenshot(path=OUT / f"overview-{width}.png")
                    page.locator(".project-note").first.click()
                    page.get_by_role("button", name="任务图", exact=True).click()
                    page.locator(".map-node").first.click()
                    page.get_by_role("button", name="保存任务", exact=True).wait_for()
                    page.screenshot(path=OUT / f"task-editor-{width}.png")
                    page.get_by_label("关闭任务编辑").click()
                    page.get_by_label("模型设置").click()
                    page.get_by_role("button", name="保存设置", exact=True).wait_for()
                    check_layout(page)
                    page.get_by_label("关闭设置").click()
                    assert not errors, errors
                    models = list((workspace / "projects").glob("*/model.json"))
                    model = next(value for value in (json.loads(path.read_text()) for path in models) if value["title"] == "论文收尾")
                    assert model["capsule"]["nextAction"] == "从第21条继续"
                    assert model["completionPercent"] == 0
                    assert model.get("resolution") is None
                    record = json.loads(next((workspace / "sessions").glob("*.json")).read_text())
                    assert record["status"] == "closed"
                    assert record["handoff"]["summary"] == "核对到第20条"
                    browser.close()
                    print(f"PASS {width}x{height}: intake, task graph, capsule, proposal, pause/reload/resume, close, park/restore, plan lifecycle")
            finally:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/pid", str(process.pid), "/t", "/f"], capture_output=True, check=False)
                else:
                    process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    for size in [(1180, 760), (980, 640)]:
        run(*size)
    print(f"Evidence: {OUT}")
