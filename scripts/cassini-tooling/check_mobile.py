import os
import asyncio
from playwright.async_api import async_playwright

async def check_mobile_overflow():
    pages = [
        ("https://metardu.duckdns.org/dashboard", "dashboard"),
        ("https://metardu.duckdns.org/field", "field"),
        ("https://metardu.duckdns.org/admin", "admin"),
        ("https://metardu.duckdns.org/parcel", "parcel"),
        ("https://metardu.duckdns.org/analytics", "analytics"),
        ("https://metardu.duckdns.org/", "landing"),
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": 375, "height": 812},
            is_mobile=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        )

        results = []
        for url, name in pages:
            page = await context.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                # Check for horizontal overflow
                scroll_width = await page.evaluate("document.documentElement.scrollWidth")
                viewport_width = await page.evaluate("document.documentElement.clientWidth")
                has_overflow = scroll_width > viewport_width

                # Check body overflow-x style
                body_overflow = await page.evaluate("""
                    window.getComputedStyle(document.body).overflowX
                """)

                # Screenshot
                await page.screenshot(path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "screenshots", "cassini-utm", f"{name}_mobile.png"), full_page=False)

                diff = scroll_width - viewport_width
                results.append(f"{'OVERFLOW' if has_overflow else 'OK'} | {name} | scroll={scroll_width} viewport={viewport_width} diff={diff} | body-overflow-x={body_overflow}")
            except Exception as e:
                results.append(f"ERROR | {name} | {str(e)[:80]}")
            finally:
                await page.close()

        browser.close()

        print("\n=== MOBILE OVERFLOW CHECK (375x812 viewport) ===")
        for r in results:
            print(r)

asyncio.run(check_mobile_overflow())
