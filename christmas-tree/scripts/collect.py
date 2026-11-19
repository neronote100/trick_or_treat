#!/usr/bin/env python3
"""note RSS collector: hashtag RSS (best effort), magazine RSS (preferred), manual fallback.

Uses only the publicly available RSS data: title, author, article URL and thumbnail.
Never deletes previously found works on a temporary feed failure. No credentials.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config.json"
DEST = ROOT / "data" / "ornaments.json"
MAX_FEED_BYTES = 3_000_000
NS = {"media": "http://search.yahoo.com/mrss/", "dc": "http://purl.org/dc/elements/1.1/"}


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and not self.image:
            self.image = attrs.get("src", "")


def valid_note_url(raw: str) -> str:
    """Only allow ordinary public note article URLs as clickable destination."""
    try:
        u = urlsplit(str(raw).strip())
        if u.scheme != "https" or u.hostname not in ("note.com", "www.note.com"):
            return ""
        if not re.search(r"/n/n[a-zA-Z0-9]+(?:/|$)", u.path):
            return ""
        return urlunsplit(("https", "note.com", u.path.rstrip("/"), "", ""))
    except ValueError:
        return ""


def valid_feed_url(raw: str) -> bool:
    try:
        u = urlsplit(raw)
        return u.scheme == "https" and u.hostname in ("note.com", "www.note.com") and u.path.endswith("/rss")
    except ValueError:
        return False


def valid_image(raw: str) -> str:
    try:
        u = urlsplit(str(raw).strip())
        return raw.strip() if u.scheme == "https" and u.hostname and not u.username and not u.password else ""
    except ValueError:
        return ""


def fetch_feed(url: str) -> bytes:
    if not valid_feed_url(url):
        raise ValueError("Invalid note RSS URL")
    req = Request(url, headers={"User-Agent": "ChristmasTreeFeedReader/1.0 (+public RSS)", "Accept": "application/rss+xml, application/xml, text/xml;q=0.8"})
    with urlopen(req, timeout=18) as response:
        if urlsplit(response.geturl()).hostname not in ("note.com", "www.note.com"):
            raise ValueError("RSS redirected outside note.com")
        raw = response.read(MAX_FEED_BYTES + 1)
    if len(raw) > MAX_FEED_BYTES:
        raise ValueError("RSS exceeds size limit")
    return raw


def child_text(parent, tag: str) -> str:
    e = parent.find(tag, NS)
    return (e.text or "").strip() if e is not None else ""


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        d = parsedate_to_datetime(value)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    except (ValueError, TypeError, IndexError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return ""


def image_from_description(html: str) -> str:
    parser = ImageParser()
    parser.feed(unescape(html))
    return valid_image(parser.image)


def parse_rss(data: bytes) -> list[dict]:
    root = ET.fromstring(data)
    articles: list[dict] = []
    if root.tag.endswith("rss") or root.find("channel") is not None:
        entries = root.findall("./channel/item")
    else:
        entries = root.findall("{http://www.w3.org/2005/Atom}entry")
    for item in entries:
        if item.tag.endswith("}entry"):
            atom = "{http://www.w3.org/2005/Atom}"
            links = item.findall(f"{atom}link")
            raw_url = next((x.attrib.get("href", "") for x in links if x.attrib.get("rel", "alternate") == "alternate"), "")
            title = child_text(item, f"{atom}title")
            author = child_text(item, f"{atom}author/{atom}name")
            published = child_text(item, f"{atom}published") or child_text(item, f"{atom}updated")
            description = child_text(item, f"{atom}summary")
        else:
            raw_url = child_text(item, "link")
            title = child_text(item, "title")
            author = child_text(item, "dc:creator") or child_text(item, "author")
            published = child_text(item, "pubDate")
            description = child_text(item, "description")
        url = valid_note_url(raw_url)
        if not url:
            continue
        image = ""
        for name in ("media:thumbnail", "media:content", "enclosure"):
            e = item.find(name, NS) if name.startswith("media:") else item.find(name)
            if e is not None:
                image = valid_image(e.attrib.get("url", ""))
                if image:
                    break
        if not image:
            image = image_from_description(description)
        articles.append({"url": url, "title": unescape(title)[:220] or "無題の作品", "author": unescape(author)[:100] or "noteクリエイター", "thumbnail": image, "published_at": parse_date(published)})
    return articles


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def collect(config: dict, previous: dict, fetcher=fetch_feed, now=iso_now) -> dict:
    saved = {a["url"]: a.copy() for a in previous.get("articles", []) if valid_note_url(a.get("url", ""))}
    sources, warnings = [], []
    feeds = []
    tag = config.get("hashtag", "").strip().lstrip("#")
    if tag:
        feeds.append(("hashtag", f"https://note.com/hashtag/{quote(tag, safe='')}/rss"))
    for url in config.get("magazine_rss_urls", []):
        feeds.append(("magazine", str(url)))
    good_feeds = 0
    for kind, feed in feeds:
        try:
            works = parse_rss(fetcher(feed))
            if not works:
                raise ValueError("RSS has no valid note articles")
            good_feeds += 1
            for article in works:
                url = article["url"]
                if url not in saved:
                    article["first_seen"] = now()
                    saved[url] = article
                else:
                    saved[url].update({k: v for k, v in article.items() if v})
            sources.append({"type": kind, "url": feed, "ok": True, "items": len(works)})
        except (ValueError, ET.ParseError, OSError, TimeoutError) as e:
            warnings.append(f"{kind}: {str(e)[:160]}")
            sources.append({"type": kind, "url": feed, "ok": False, "items": 0})
        time.sleep(0.3)
    manual_added = 0
    for item in config.get("manual_articles", []):
        url = valid_note_url(item.get("url", ""))
        if not url:
            warnings.append("An invalid manual article URL was ignored")
            continue
        prior = saved.get(url, {})
        saved[url] = {
            "url": url,
            "title": str(item.get("title") or prior.get("title") or "無題の作品")[:220],
            "author": str(item.get("author") or prior.get("author") or "noteクリエイター")[:100],
            "thumbnail": valid_image(item.get("thumbnail", "")) or prior.get("thumbnail", ""),
            "published_at": prior.get("published_at", ""),
            "first_seen": prior.get("first_seen", now()),
        }
        manual_added += 1
    sources.append({"type": "manual", "url": "config.json", "ok": True, "items": manual_added})
    for url in config.get("exclude_urls", []):
        saved.pop(valid_note_url(url), None)
    picks = {valid_note_url(x.get("url", "")): x for x in config.get("picks", [])}
    for a in saved.values():
        chosen = picks.get(a["url"])
        a["picked_by"] = str(chosen.get("by", ""))[:40] if chosen else ""
    # Preserve the first discovered ordering, so existing ornaments never move.
    articles = sorted(saved.values(), key=lambda a: (a.get("first_seen", ""), a.get("published_at", ""), a["url"]))
    limit = max(1, min(500, int(config.get("max_articles", 200))))
    articles = articles[:limit]
    if feeds and not good_feeds and not manual_added:
        raise RuntimeError("All RSS sources failed. Previous ornaments.json is kept unchanged. " + "; ".join(warnings))
    if not feeds and not manual_added:
        warnings.append("No feeds or manual articles are configured")
    return {"updated_at": now() if good_feeds or manual_added else previous.get("updated_at"), "articles": articles, "sources": sources, "warnings": warnings}


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    previous = json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {"articles": []}
    result = collect(config, previous)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Collected: {len(result['articles'])} total, warnings: {len(result['warnings'])}")
    for warning in result["warnings"]:
        print("WARNING:", warning, file=sys.stderr)


if __name__ == "__main__":
    main()
