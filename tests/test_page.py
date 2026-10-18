"""Browser test for site/index.html with mocked sync data.

Run: python3 tests/test_page.py   (needs Playwright; serves site/ locally)
Checks: next step and warmup render, reveal works, Start link is set,
empty state shows when there is no data, no page-wide sideways scroll,
and saves iPhone-size screenshots in light and dark.
"""
import http.server, json, os, sys, threading, functools
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("light", "dark"):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme=scheme, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        pg.goto("http://127.0.0.1:8765/index.html")
        pg.wait_for_selector("#padWhat:not(:empty)", timeout=5000)
        check(pg.inner_text("#padWhat") == "B1: device list", f"{scheme}: next step is B1 (steps 1 and 2 done)")
        check("csv" in pg.inner_text("#warmText"), f"{scheme}: warmup text shown")
        check(pg.is_hidden("#warmA"), f"{scheme}: answer hidden before reveal")
        check(pg.get_attribute("#startBtn", "href") == "https://lrps.wgu.edu/provision/565781699", f"{scheme}: Start opens the Task 1 lab")
        check(pg.inner_text("#sHops") == "2/22", f"{scheme}: score shows 2/22")
        sw = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        check(sw, f"{scheme}: no sideways scroll at 390px")
        pg.screenshot(path=os.path.join(OUT, f"phone-{scheme}.png"), full_page=True)
        pg.click("#reveal")
        check(pg.is_visible("#warmA"), f"{scheme}: reveal shows the answer")
        check(pg.inner_text("#sWarm") == "1", f"{scheme}: warmups done counts 1")
        check(not errors, f"{scheme}: no script errors {errors}")
        ctx.close()
    # Empty state: no data files yet
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    pg.route("**/data/**", lambda r: r.fulfill(status=404, body="not found"))
    pg.goto("http://127.0.0.1:8765/index.html")
    pg.wait_for_selector("#empty:not([hidden])", timeout=5000)
    check(pg.is_hidden("#pad"), "empty: launch pad hidden when no data")
    ctx.close()
    b.close()
srv.shutdown()
print("ALL PASSED" if not fails else f"{len(fails)} FAILED")
sys.exit(1 if fails else 0)
