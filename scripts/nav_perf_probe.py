import json
import os
import time
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
    base_url = env.get("UI_BASE_URL", "http://localhost:8080").rstrip("/")
    if not username or not password:
        raise RuntimeError("Missing LOCAL_ADMIN/LOCAL_PASS")

    routes = [
        ("/", "Dashboard", "Dashboard"),
        ("/wallpapers", "Wallpaper Library", "Wallpaper Library"),
        ("/campaigns", "Campaigns", "Campaigns"),
        ("/timeline", "Timeline & Queue", "Timeline & Queue"),
        ("/deployment", "Deployment", "Deployment"),
        ("/history", "History & Audit", "History & Audit"),
        ("/users", "Users", "Users"),
        ("/settings", "Settings", "Settings"),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(f"{base_url}/wallpapers")
        page.wait_for_load_state("networkidle")
        if page.url.rstrip("/").endswith("/login"):
            page.wait_for_selector("text=CWCM Login", timeout=30000)
            inputs = page.locator("input")
            inputs.nth(0).fill(username)
            inputs.nth(1).fill(password)
            page.get_by_role("button", name="Sign In").click()
            page.wait_for_url("**/", timeout=30000)

        page.goto(f"{base_url}/")
        page.wait_for_load_state("networkidle")

        results = []

        for path, route_name, heading_text in routes:
            requests: list[dict[str, object]] = []

            def on_response(response):
                try:
                    requests.append(
                        {
                            "url": response.url,
                            "status": response.status,
                            "resource_type": response.request.resource_type,
                        }
                    )
                except Exception:
                    pass

            page.on("response", on_response)
            start = time.perf_counter()
            page.goto(f"{base_url}{path}")
            error_text = None
            heading_ms = None
            idle_ms = None
            try:
                page.get_by_role("heading", name=heading_text).wait_for(timeout=30000)
                heading_ms = round((time.perf_counter() - start) * 1000, 0)
                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                    idle_ms = round((time.perf_counter() - start) * 1000, 0)
                except Exception:
                    idle_ms = None
            except Exception as error:
                error_text = str(error)

            page.wait_for_timeout(1200)
            page.remove_listener("response", on_response)

            api_requests = [r for r in requests if "/api/" in str(r["url"])]
            image_requests = [
                r
                for r in requests
                if "/image" in str(r["url"]) or r.get("resource_type") in ("image", "media")
            ]

            results.append(
                {
                    "route": route_name,
                    "path": path,
                    "heading_ms": heading_ms,
                    "networkidle_ms": idle_ms,
                    "error": error_text,
                    "page_url": page.url,
                    "title": page.title(),
                    "request_count": len(requests),
                    "api_request_count": len(api_requests),
                    "image_request_count": len(image_requests),
                    "api_paths": sorted(
                        {
                            str(r["url"]).replace(base_url, "")
                            for r in api_requests
                            if isinstance(r.get("url"), str)
                        }
                    )[:15],
                }
            )

        print(json.dumps(results, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
