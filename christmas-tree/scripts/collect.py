#!/usr/bin/env python3
"""Automated event-tag RSS collection for the Christmas Kingdom multi-tree site.

Publishes tagged note thumbnails without operator review. Feed discovery can be delayed
or incomplete; prior entries persist through temporary failures. No credentials.
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
ARCHIVE_DEST = ROOT / "data" / "archive.json"
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
    """Collect hashtag RSS for each tree, retain prior ornaments, auto-publish without review.

    The hashtag URL is best-effort, not an official comprehensive search API.
    A unique event tag per tree is used as the public participation signal.
    """
    projects = [(str(p.get("id", "")), str(p.get("hashtag", "")).strip().lstrip("#"))
                for p in config.get("projects", []) if p.get("id") and p.get("hashtag")]
    allowed = {pid for pid, _ in projects}
    saved = {}
    for article in previous.get("articles", []):
        pid = str(article.get("project_id", ""))
        url = valid_note_url(article.get("url", ""))
        if pid in allowed and url:
            saved[(pid, url)] = {**article, "project_id": pid, "url": url}
    sources, warnings = [], []
    checked = 0
    for pid, tag in projects:
        feed = f"https://note.com/hashtag/{quote(tag, safe='')}/rss"
        try:
            works = parse_rss(fetcher(feed))
            checked += 1
            for work in works:
                key = (pid, work["url"])
                prior = saved.get(key, {})
                saved[key] = {
                    **prior,
                    **work,
                    "project_id": pid,
                    "first_seen": prior.get("first_seen") or now(),
                }
            sources.append({"type": "hashtag", "project_id": pid, "tag": tag, "ok": True, "items": len(works)})
        except (ValueError, ET.ParseError, OSError, TimeoutError) as error:
            # A newly invented tag may return 404 until the first public article.
            # Do not delete previously indexed entries or break a scheduled run.
            warnings.append(f"{pid}: {str(error)[:120]}")
            sources.append({"type": "hashtag", "project_id": pid, "tag": tag, "ok": False, "items": 0})
        time.sleep(0.3)

    # Operator rescue for articles missed by a delayed/incomplete RSS feed.
    # This is not a participant form, and no approval is required.
    for item in config.get("manual_articles", []):
        pid = str(item.get("project_id", ""))
        url = valid_note_url(item.get("url", ""))
        if pid not in allowed or not url:
            warnings.append("Manual item skipped (invalid project_id or note article URL)")
            continue
        key = (pid, url)
        prior = saved.get(key, {})
        saved[key] = {
            **prior,
            "project_id": pid,
            "url": url,
            "title": str(item.get("title") or prior.get("title") or "無題の作品")[:220],
            "author": str(item.get("author") or prior.get("author") or "noteクリエイター")[:100],
            "thumbnail": valid_image(item.get("thumbnail", "")) or prior.get("thumbnail", ""),
            "published_at": prior.get("published_at", ""),
            "first_seen": prior.get("first_seen") or now(),
        }

    blocked = {valid_note_url(url) for url in config.get("exclude_urls", [])}
    blocked_pairs = {(str(item.get("project_id", "")), valid_note_url(item.get("url", "")))
                     for item in config.get("exclude_by_project", [])}
    for key in list(saved):
        if key[1] in blocked or key in blocked_pairs:
            del saved[key]

    articles = sorted(saved.values(), key=lambda a: (a.get("first_seen", ""), a.get("project_id", ""), a["url"]))
    limit = max(1, min(3000, int(config.get("max_articles", 1000))))
    articles = articles[:limit]

    # Prevent needless Git commits and Cloudflare redeployments when no work changed.
    changed = articles != previous.get("articles", []) or sources != previous.get("sources", []) or warnings != previous.get("warnings", [])
    if not projects:
        warnings.append("No project hashtags configured")
        changed = True
    return {
        "updated_at": now() if changed else previous.get("updated_at"),
        "articles": articles,
        "sources": sources,
        "warnings": warnings,
    }


def archive_config(config: dict) -> dict:
    """Read past-event tags separately, never as Christmas participants."""
    return {
        "projects": config.get("archive_projects", []),
        "max_articles": config.get("archive_max_articles", 1000),
        "exclude_urls": config.get("archive_exclude_urls", []),
        "exclude_by_project": config.get("archive_exclude_by_project", []),
        "manual_articles": [],
    }


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    DEST.parent.mkdir(parents=True, exist_ok=True)
    for label, destination, source_config in (
        ("Christmas", DEST, config),
        ("Historical sample", ARCHIVE_DEST, archive_config(config)),
    ):
        previous = json.loads(destination.read_text(encoding="utf-8")) if destination.exists() else {"articles": []}
        result = collect(source_config, previous)
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{label}: {len(result['articles'])} total, warnings: {len(result['warnings'])}")
        for warning in result["warnings"]:
            print("WARNING:", warning, file=sys.stderr)


if __name__ == "__main__":
    main()
