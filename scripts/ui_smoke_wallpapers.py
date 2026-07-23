import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def load_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def main():
    root = Path(__file__).resolve().parents[1]
    env = {**load_dotenv(root / ".env"), **os.environ}
    username = env.get("LOCAL_ADMIN", "")
    password = env.get("LOCAL_PASS", "")
    if not username or not password:
        raise RuntimeError("Missing LOCAL_ADMIN/LOCAL_PASS for login")

    upload_path = root / "Desktop BG 1.png"
    if not upload_path.exists():
        raise RuntimeError(f"Upload file not found: {upload_path}")

    base_url = env.get("UI_BASE_URL", "http://localhost:8080").rstrip("/")

    dbg_dir = root / ".dbg"
    dbg_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(300000)
        console_lines: list[str] = []
        request_failures: list[str] = []

        page.on(
            "console",
            lambda msg: console_lines.append(f"[{msg.type}] {msg.text}") if len(console_lines) < 200 else None,
        )
        page.on(
            "requestfailed",
            lambda req: request_failures.append(f"{req.method} {req.url} :: {req.failure}")
            if len(request_failures) < 200
            else None,
        )

        page.goto(f"{base_url}/wallpapers")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(250)

        if page.url.rstrip("/").endswith("/login"):
            page.wait_for_selector("text=CWCM Login", timeout=30000)
            inputs = page.locator("input")
            inputs.nth(0).fill(username)
            inputs.nth(1).fill(password)
            u_len = len(inputs.nth(0).input_value())
            p_len = len(inputs.nth(1).input_value())
            if u_len == 0 or p_len == 0:
                page.screenshot(path=str(dbg_dir / "ui-smoke-login-inputs-empty.png"), full_page=True)
                raise RuntimeError(f"Login inputs not filled. username_len={u_len} password_len={p_len}")
            page.get_by_role("button", name="Sign In").click()
            try:
                page.wait_for_url("**/", timeout=30000)
            except Exception:
                page.screenshot(path=str(dbg_dir / "ui-smoke-login-failed.png"), full_page=True)
                raise RuntimeError("Login did not navigate away from /login")

        page.goto(f"{base_url}/wallpapers")
        page.wait_for_load_state("networkidle")
        try:
            page.wait_for_selector('text=Wallpaper Library', timeout=60000)
        except Exception:
            page.screenshot(path=str(dbg_dir / "ui-smoke-wallpapers-not-loaded.png"), full_page=True)
            tail_console = "\n".join(console_lines[-40:])
            tail_failures = "\n".join(request_failures[-40:])
            raise RuntimeError(
                f"Wallpaper page did not load. url={page.url}\n\nconsole:\n{tail_console}\n\nrequestfailed:\n{tail_failures}"
            )
        page.locator('input[type="file"]').wait_for(state="attached", timeout=60000)

        with page.expect_file_chooser(timeout=30000) as chooser_info:
            page.get_by_role("button", name="Upload Wallpaper").click()
        chooser = chooser_info.value
        chooser.set_files(str(upload_path))

        try:
            toast_el = page.wait_for_selector(
                "text=/uploaded|upload failed|too large|request failed|failed/i",
                timeout=600000,
            )
        except Exception:
            page.screenshot(path=str(dbg_dir / "ui-smoke-upload-timeout.png"), full_page=True)
            tail_console = "\n".join(console_lines[-40:])
            tail_failures = "\n".join(request_failures[-40:])
            raise RuntimeError(
                f"Upload did not complete before timeout. url={page.url}\n\nconsole:\n{tail_console}\n\nrequestfailed:\n{tail_failures}"
            )

        toast_text = (toast_el.inner_text() or "").lower()
        if "uploaded" not in toast_text:
            page.screenshot(path=str(dbg_dir / "ui-smoke-upload-failed.png"), full_page=True)
            tail_console = "\n".join(console_lines[-40:])
            tail_failures = "\n".join(request_failures[-40:])
            raise RuntimeError(
                f"Upload failed. url={page.url}\n\ntoast={toast_text}\n\nconsole:\n{tail_console}\n\nrequestfailed:\n{tail_failures}"
            )

        page.screenshot(path=str(dbg_dir / "ui-smoke-wallpapers-upload.png"), full_page=True)

        page.get_by_role("button", name="Preview").first.click()
        page.get_by_role("dialog").wait_for(state="visible", timeout=30000)
        page.screenshot(path=str(dbg_dir / "ui-smoke-wallpapers-preview.png"), full_page=True)

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
