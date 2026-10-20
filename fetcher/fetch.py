"""
Tax Law Updates - fetcher.

Visits each official page listed in sources.json, collects the notification /
circular links on it, and merges anything new into docs/data/updates.json,
which the app reads. Safe to run as often as you like: items already seen are
kept as they are, only new ones are added.

Usage:
    python fetcher/fetch.py                 # normal run
    python fetcher/fetch.py --html-dir DIR  # parse saved pages instead of the web (testing)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "fetcher" / "sources.json"
DATA_DIR = ROOT / "docs" / "data"
UPDATES_FILE = DATA_DIR / "updates.json"
STATUS_FILE = DATA_DIR / "status.json"
IST = timezone(timedelta(hours=5, minutes=30))
MAX_ITEMS_PER_SOURCE = 400
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
}

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_PATTERNS = [
    # 15.12.2025 / 15-12-2025 / 15/12/2025
    (re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b"), "dmy"),
    # 2025-12-15
    (re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    # 15 December 2025 / 15th Dec, 2025 / 15-Dec-2025
    (re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,.-]+(20\d{2})\b"), "dMy"),
    # December 15, 2025
    (re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b"), "Mdy"),
]
NUMBER_RE = re.compile(
    r"\b(?:No\.?\s*)?(\d{1,4}\s*/\s*20\d{2}(?:\s*[-–]\s*(?:Central|Integrated|Union Territory|State|Compensation)"
    r"\s+(?:Tax|Cess)(?:\s*\((?:Rate)\))?)?)", re.I)
GAZETTE_RE = re.compile(r"\b((?:G\.?\s?S\.?\s?R\.?|S\.?\s?O\.?)\s*\d{1,5}\s*\(E\))", re.I)


def clean(text: str) -> str:
    text = re.sub(r"[​ ]", " ", text or "")
    return re.sub(r"\s+", " ", text).strip(" :-|\t")


def parse_date(text: str) -> str | None:
    for rx, kind in DATE_PATTERNS:
        for m in rx.finditer(text):
            try:
                if kind == "dmy":
                    d, mo, y = int(m[1]), int(m[2]), int(m[3])
                elif kind == "ymd":
                    y, mo, d = int(m[1]), int(m[2]), int(m[3])
                elif kind == "dMy":
                    mo = MONTHS.get(m[2][:3].lower())
                    d, y = int(m[1]), int(m[3])
                else:
                    mo = MONTHS.get(m[1][:3].lower())
                    d, y = int(m[2]), int(m[3])
                if not mo:
                    continue
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def row_text(a) -> str:
    """Text of the table row / list item / block holding the link: usually
    number + date + subject, which is far more useful than 'View' or 'PDF'."""
    node = a
    for _ in range(6):
        node = node.parent
        if node is None:
            break
        if node.name in ("tr", "li", "article") or (
            node.name in ("div", "p") and len(clean(node.get_text(" "))) > 25
        ):
            txt = clean(node.get_text(" "))
            if 10 < len(txt) < 900:
                return txt
            break
    return clean(a.get_text(" "))


def make_title(link_text: str, context: str) -> str:
    generic = re.compile(r"^(view|download|pdf|click here|here|english|hindi|read more|\(.*kb\))$", re.I)
    base = context if (generic.match(link_text) or len(link_text) < 12) else link_text
    if len(context) > len(base) and link_text in context:
        base = context
    base = re.sub(r"\b(View|Download PDF|Download)\s*\(\s*\d+\s*KB\s*\)", "", base, flags=re.I)
    base = re.sub(r"\(\s*\d+\s*KB\s*\)", "", base, flags=re.I)
    base = re.sub(r"^(download pdf|download|view|pdf)\b\s*", "", clean(base), flags=re.I)
    base = re.sub(r"\s*\b(download pdf|download|view|pdf)$", "", base, flags=re.I)
    base = clean(base)
    return base[:300] + ("…" if len(base) > 300 else "")


def extract_items(html: str, source: dict, page_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    inc = re.compile(source.get("include") or ".", re.I)
    exc = re.compile(source["exclude"], re.I) if source.get("exclude") else None
    page_host = urlparse(page_url).netloc.split(":")[0].removeprefix("www.")

    items, seen_urls = [], set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        url = urljoin(page_url, href)
        if not url.startswith("http"):
            continue
        link_text = clean(a.get_text(" "))
        context = row_text(a)
        haystack = f"{link_text} {context} {url}"
        if exc and exc.search(haystack):
            continue
        if not inc.search(haystack):
            continue
        host = urlparse(url).netloc.split(":")[0].removeprefix("www.")
        is_doc = url.lower().split("?")[0].endswith((".pdf", ".doc", ".docx"))
        # Stay on the official site (or its document storage); skip social links etc.
        if not is_doc and page_host.split(".")[-3:] != host.split(".")[-3:]:
            continue
        # Skip navigation-style links with no number/date anywhere near them.
        date = parse_date(context) or parse_date(link_text)
        num = NUMBER_RE.search(context) or NUMBER_RE.search(link_text) \
            or GAZETTE_RE.search(context)
        if not (is_doc or date or num):
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        title = make_title(link_text, context)
        if len(title) < 6:
            continue
        items.append({
            "id": hashlib.sha1(url.encode()).hexdigest()[:16],
            "law": source["law"],
            "category": source["category"],
            "source": source["id"],
            "title": title,
            "number": re.sub(r"\s+", " ", num.group(1)).strip() if num else None,
            "date": date,
            "url": url,
        })
        if len(items) >= MAX_ITEMS_PER_SOURCE:
            break
    return items


def get_html(source: dict, session: requests.Session) -> tuple[str, str]:
    url = source["url"]
    if source.get("render"):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print(f"  ! playwright not installed; reading {url} without rendering")
        else:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(user_agent=HEADERS["User-Agent"], locale="en-IN")
                page.goto(url, wait_until="networkidle", timeout=90_000)
                page.wait_for_timeout(2500)
                html, final = page.content(), page.url
                browser.close()
                return html, final
    last_err = None
    for attempt in range(3):
        try:
            r = session.get(url, headers=HEADERS, timeout=45)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or r.encoding
            return r.text, r.url
        except requests.RequestException as e:
            last_err = e
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"could not open page ({last_err})")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def notify(new_items: list[dict]) -> None:
    """Optional free phone push via the ntfy app: set NTFY_TOPIC to your topic name."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not new_items:
        return
    names = {"income-tax": "Income Tax", "gst": "GST", "companies": "Companies Act"}
    lines = [f"• [{names.get(i['law'], i['law'])}] {i['title'][:110]}" for i in new_items[:8]]
    if len(new_items) > 8:
        lines.append(f"…and {len(new_items) - 8} more")
    try:
        requests.post(
            f"https://ntfy.sh/{topic}",
            data="\n".join(lines).encode("utf-8"),
            headers={"Title": f"{len(new_items)} new tax/law update(s)",
                     "Click": os.environ.get("APP_URL", ""), "Tags": "scroll"},
            timeout=20,
        )
    except requests.RequestException as e:
        print(f"  ! push notification failed: {e}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html-dir", help="read <source-id>.html files from this folder instead of the web")
    args = ap.parse_args()

    sources = load_json(SOURCES_FILE, {"sources": []})["sources"]
    store = load_json(UPDATES_FILE, {"items": []})
    known = {i["id"]: i for i in store.get("items", [])}
    now = datetime.now(IST).isoformat(timespec="seconds")
    session = requests.Session()
    status, new_items = [], []

    for src in sources:
        print(f"- {src['id']}: {src['url']}")
        try:
            if args.html_dir:
                html = (Path(args.html_dir) / f"{src['id']}.html").read_text(encoding="utf-8")
                final_url = src["url"]
            else:
                html, final_url = get_html(src, session)
            found = extract_items(html, src, final_url)
            added = 0
            for it in found:
                if it["id"] in known:
                    old = known[it["id"]]
                    # Fill gaps if the page now shows a better title/date.
                    if not old.get("date") and it["date"]:
                        old["date"] = it["date"]
                    continue
                it["first_seen"] = now
                known[it["id"]] = it
                new_items.append(it)
                added += 1
            ok = len(found) > 0
            msg = f"{len(found)} items on page, {added} new" if ok else \
                "page opened but no items were recognised - the site layout may have changed"
            print(f"  {msg}")
            status.append({"id": src["id"], "law": src["law"], "category": src["category"],
                           "url": src["url"], "ok": ok, "found": len(found), "new": added,
                           "message": msg, "checked": now})
        except Exception as e:  # keep going with the other sources
            print(f"  ! {e}")
            status.append({"id": src["id"], "law": src["law"], "category": src["category"],
                           "url": src["url"], "ok": False, "found": 0, "new": 0,
                           "message": str(e)[:300], "checked": now})

    first_run = not store.get("items")
    items = sorted(known.values(),
                   key=lambda i: (i.get("date") or i.get("first_seen", "")[:10], i.get("first_seen", "")),
                   reverse=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPDATES_FILE.write_text(json.dumps({"updated": now, "items": items}, ensure_ascii=False, indent=1),
                            encoding="utf-8")
    STATUS_FILE.write_text(json.dumps({"last_run": now, "sources": status}, ensure_ascii=False, indent=1),
                           encoding="utf-8")
    print(f"\nTotal items: {len(items)}  |  new this run: {len(new_items)}")
    if not first_run:  # don't push hundreds of 'new' items on the very first run
        notify(new_items)
    return 0 if any(s["ok"] for s in status) else 1


if __name__ == "__main__":
    sys.exit(main())
