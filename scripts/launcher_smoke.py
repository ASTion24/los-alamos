"""Acceptance for the low-friction launcher using real Electron IPC."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
from continuity_smoke import ROOT, ELECTRON, free_port, check_layout

OUT = ROOT / "artifacts" / "launcher"
OUT.mkdir(parents=True, exist_ok=True)


def run(width, height):
    with tempfile.TemporaryDirectory(prefix="los-launcher-") as temp:
        workspace = Path(temp) / "workspace"
        env = os.environ.copy()
        env.pop("ELECTRON_RUN_AS_NODE", None)
        env["LOS_ALAMOS_WORKSPACE"] = str(workspace)
        port = free_port()
        command = [str(ELECTRON)]
        if not os.environ.get("LOS_ALAMOS_PACKAGED_EXECUTABLE"):
            command.append(str(ROOT))
        command.extend([f"--remote-debugging-port={port}", f"--user-data-dir={temp}/profile"])
        if sys.platform.startswith("linux"):
            command.extend(["--disable-gpu", "--disable-dev-shm-usage"])
        with (OUT / f"electron-{width}.log").open("w") as log:
            process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1):
                            break
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError("Electron exited before ready")
                        time.sleep(.2)
                with sync_playwright() as p:
                    browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
                    page = browser.contexts[0].pages[0]
                    page.set_default_timeout(12000)
                    page.set_viewport_size({"width": width, "height": height})
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.wait_for_load_state("domcontentloaded")
                        page.get_by_role("button", name="进入 Los Alamos", exact=True).click()
                        page.locator(".launcher").wait_for()
                        page.wait_for_timeout(250)
                        print(f"Observed launcher {width}: {page.locator('.next-work').inner_text()[:150]}")
                        assert page.locator(".launcher textarea").count() == 1
                        check_layout(page)
                        page.screenshot(path=OUT / f"empty-{width}.png")

                        raw = "论文收尾：正文已经完成，只差核对引用；结束标准：引用全部核验通过。"
                        page.get_by_label("此刻挂念的事").fill(raw)
                        page.get_by_role("button", name="先收下来", exact=True).click()
                        page.get_by_text("已收好，不必现在处理。", exact=True).wait_for()
                        assert not list((workspace / "projects").glob("*/model.json"))
                        page.get_by_role("button", name="打开收纳箱", exact=True).click()
                        inbox = page.get_by_role("dialog", name="收纳箱", exact=True)
                        inbox.get_by_role("button", name="准备推进", exact=True).click()
                        prepare = page.get_by_role("dialog", name="这件事，做到哪里就够了？")
                        assert prepare.get_by_label("项目名称", exact=True).input_value() == "论文收尾"
                        assert prepare.get_by_label("只剩下这些动作", exact=True).input_value() == "核对引用"
                        assert prepare.get_by_label("到这里就可以结束", exact=True).input_value() == "引用全部核验通过"
                        page.screenshot(path=OUT / f"prepare-{width}.png")
                        prepare.get_by_role("button", name="就从这里开始", exact=True).click()
                        prepare.wait_for(state="detached")
                        start = page.get_by_role("button", name="确认开始 25 分钟", exact=True)
                        start.wait_for()
                        assert not list((workspace / "sessions").glob("*.json"))
                        page.locator(".entry-title").get_by_text("核对引用", exact=True).wait_for()
                        check_layout(page)
                        page.screenshot(path=OUT / f"ready-{width}.png")
                        start.click()
                        page.get_by_role("button", name="暂停", exact=True).wait_for()
                        files = list((workspace / "sessions").glob("*.json"))
                        assert len(files) == 1
                        assert json.loads(files[0].read_text())["status"] == "active"
                        page.locator(".session-capture summary").click()
                        page.get_by_label("此刻挂念的事").fill("记得续签域名，今天先不展开。")
                        page.get_by_role("button", name="先收下来", exact=True).click()
                        page.get_by_text("已收好，继续眼前这一件。", exact=True).wait_for()
                        assert json.loads(files[0].read_text())["status"] == "active"
                        page.locator(".session-capture summary").click()
                        page.get_by_label("本次推进记录").fill("核对到第12条引用")
                        page.reload()
                        page.get_by_role("button", name="暂停", exact=True).wait_for()
                        assert page.get_by_label("本次推进记录").input_value() == "核对到第12条引用"
                        page.get_by_role("button", name="暂停", exact=True).click()
                        page.get_by_role("button", name="继续驻留", exact=True).wait_for()
                        frozen = page.locator(".session-clock-head > strong").inner_text()
                        page.wait_for_timeout(1100)
                        assert page.locator(".session-clock-head > strong").inner_text() == frozen
                        page.get_by_role("button", name="部分完成", exact=True).click()
                        finish = page.get_by_role("dialog", name="留下交接，结束本段")
                        assert finish.locator("textarea:visible").count() == 2
                        finish.get_by_label("下次第一动作").fill("从第13条引用继续")
                        page.screenshot(path=OUT / f"finish-{width}.png")
                        finish.get_by_role("button", name="保存交接", exact=True).click()
                        finish.wait_for(state="detached")
                        page.get_by_text("从第13条引用继续", exact=True).wait_for()
                        page.get_by_role("button", name="到这里，休息", exact=True).click()
                        page.locator(".launcher").wait_for()
                        page.locator(".entry-title").get_by_text("从第13条引用继续", exact=True).wait_for()
                        model_path = next((workspace / "projects").glob("*/model.json"))
                        assert json.loads(model_path.read_text())["completionPercent"] == 0
                        assert len(list((workspace / "sessions").glob("*.json"))) == 1
                        page.screenshot(path=OUT / f"return-{width}.png")
                        page.get_by_role("button", name="确认开始 25 分钟", exact=True).click()
                        page.get_by_role("button", name="已完成", exact=True).wait_for()
                        page.get_by_label("本次推进记录").fill("全部引用核验通过，回执已保存")
                        page.get_by_role("button", name="已完成", exact=True).click()
                        finish = page.get_by_role("dialog", name="留下交接，结束本段")
                        finish.get_by_role("button", name="保存交接", exact=True).click()
                        finish.wait_for(state="detached")
                        page.get_by_role("button", name="剩余动作已完成，确认项目收尾", exact=True).wait_for()
                        page.get_by_role("button", name="剩余动作已完成，确认项目收尾", exact=True).click()
                        release = page.get_by_role("dialog", name="放下「论文收尾」")
                        assert release.get_by_role("button", name="确认收尾", exact=True).is_disabled()
                        release.get_by_label("收尾依据", exact=True).fill("引用全部核验通过，提交回执已保存。")
                        release.get_by_role("button", name="确认收尾", exact=True).click()
                        release.wait_for(state="detached")
                        page.get_by_text("这件事已有去向，可以放下了。", exact=True).wait_for()
                        page.screenshot(path=OUT / f"released-{width}.png")
                        page.get_by_role("button", name="到这里，休息", exact=True).click()
                        page.get_by_role("button", name="打开收纳箱", exact=True).click()
                        inbox = page.get_by_role("dialog", name="收纳箱", exact=True)
                        inbox.get_by_text("记得续签域名，今天先不展开。", exact=True).wait_for()
                        inbox.get_by_role("button", name="先放着", exact=True).click()
                        inbox.get_by_role("button", name="先放着 1", exact=True).click()
                        inbox.get_by_role("button", name="取回", exact=True).click()
                        page.get_by_role("button", name="关闭收纳箱", exact=True).click()
                        inbox.wait_for(state="detached")
                        check_layout(page)
                        assert not errors, errors
                        assert json.loads(model_path.read_text())["resolution"]["outcome"] == "closed"
                        raw_captures = [json.loads(path.read_text()) for path in (workspace / "inbox").glob("*.json")]
                        assert any(capture["text"] == raw and capture["status"] == "converted" for capture in raw_captures)
                        assert any(capture.get("sourceSessionId") for capture in raw_captures)
                        page.get_by_label("此刻挂念的事").fill("布局验收：保留很长的真实动作而不遮挡按钮。")
                        page.get_by_role("button", name="先收下来", exact=True).click()
                        page.get_by_text("已收好，不必现在处理。", exact=True).wait_for()
                        page.get_by_role("button", name="打开收纳箱", exact=True).click()
                        inbox = page.get_by_role("dialog", name="收纳箱", exact=True)
                        inbox.locator("article").filter(has_text="布局验收").get_by_role("button", name="准备推进", exact=True).click()
                        prepare = page.get_by_role("dialog", name="这件事，做到哪里就够了？")
                        prepare.get_by_label("只剩下这些动作").fill("VerifyTheRemainingReferencesWithoutExpandingTheExistingScope" * 4)
                        prepare.get_by_label("到这里就可以结束").fill("已有材料全部核验，保留结果，不扩展范围。" * 8)
                        prepare.get_by_role("button", name="就从这里开始", exact=True).click()
                        prepare.wait_for(state="detached")
                        page.get_by_role("button", name="确认开始 25 分钟", exact=True).wait_for()
                        page.get_by_role("button", name="确认开始 25 分钟", exact=True).scroll_into_view_if_needed()
                        check_layout(page)
                        assert page.locator(".focus-entry").evaluate("(el) => el.scrollWidth <= el.clientWidth + 1")
                        page.screenshot(path=OUT / f"long-content-{width}.png")
                        print(f"PASS {width}x{height}: capture, prepare, immediate start, distraction, draft recovery, 2-field handoff, re-entry, explicit release")
                    except Exception:
                        page.screenshot(path=OUT / f"failure-{width}.png")
                        print(page.locator("body").inner_text()[-4000:])
                        raise
                    finally:
                        browser.close()
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
