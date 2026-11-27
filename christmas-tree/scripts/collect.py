#!/usr/bin/env python3
"""Automated note hashtag API collection for HEARTFUL TREE, with RSS fallback.

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
NS = {"media": "http://search.yahoo.com/mrss/", "dc": "http://purl.org/dc/elements/1.1/", "note": "https://note.com"}


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
            author = child_text(item, "note:creatorName") or child_text(item, "dc:creator") or child_text(item, "author")
            published = child_text(item, "pubDate")
            description = child_text(item, "description")
        url = valid_note_url(raw_url)
        if not url:
            continue
        # note feeds use a media:thumbnail element; match the local name too
        # to tolerate namespace variations in note's RSS output.
        image = ""
        for element in item:
            local_name = element.tag.rsplit("}", 1)[-1].lower()
            if local_name in ("thumbnail", "content", "enclosure", "eyecatch"):
                image = valid_image(
                    element.attrib.get("url", "")
                    or element.attrib.get("href", "")
                    or (element.text or "").strip()
                )
                if image:
                    break
        if not image:
            image = image_from_description(description)
        articles.append({"url": url, "title": unescape(title)[:220] or "無題の作品", "author": unescape(author)[:100] or "noteクリエイター", "thumbnail": image, "published_at": parse_date(published)})
    return articles


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")



MAX_API_BYTES = 3_000_000

def fetch_note_page(tag: str, page: int) -> dict:
    """Use comment reader's public hashtag JSON endpoint with pagination."""
    if not tag or len(tag) > 100 or not (1 <= page <= 80):
        raise ValueError("Invalid tag/page")
    url = ("https://note.com/api/v3/hashtags/" + quote(tag, safe="") +
           "/notes?order=new&page=" + str(page) + "&paid_only=false")
    req = Request(url, headers={"Accept":"application/json",
                  "User-Agent":"NeroCommentReader/0.3 (+https://neronote100.github.io/nero_comment_reader/)"})
    with urlopen(req, timeout=22) as response:
        final = urlsplit(response.geturl())
        if final.scheme != "https" or final.hostname not in ("note.com","www.note.com"):
            raise ValueError("Note API redirect outside note.com")
        data = response.read(MAX_API_BYTES + 1)
    if len(data) > MAX_API_BYTES:
        raise ValueError("Note API response too big")
    payload = json.loads(data)
    if not isinstance(payload,dict) or not isinstance(payload.get("data"),dict):
        raise ValueError("Invalid note API response")
    return payload


def normalize_api_article(raw: dict) -> dict | None:
    if not isinstance(raw,dict) or raw.get("status") not in (None,"published"):
        return None
    user=raw.get("user") or {}
    if not isinstance(user,dict):return None
    key=str(raw.get("key") or "")
    username=str(user.get("urlname") or "")
    if not re.fullmatch(r"n[a-zA-Z0-9]{7,40}",key):return None
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}",username):return None
    link=valid_note_url(f"https://note.com/{username}/n/{key}")
    if not link:return None
    return {
      "url":link,
      "title":unescape(str(raw.get("name") or raw.get("title") or "無題の作品"))[:220],
      "author":unescape(str(user.get("nickname") or user.get("name") or username))[:100],
      "author_id":username,
      "thumbnail":(valid_image(raw.get("eyecatch_url") or "") or
                   valid_image(raw.get("thumbnail_external_url") or "") or
                   valid_image(raw.get("sp_eyecatch_url") or "")),
      "published_at":parse_date(str(raw.get("publish_at") or raw.get("published_at") or raw.get("created_at") or "")),
    }


def api_articles_for_tag(tag: str, page_fetcher=fetch_note_page,
                         max_pages: int=25, delay:float=0.12):
    page,seen,articles,actual=1,set(),{},0
    for _ in range(max(1,min(80,max_pages))):
        if page in seen:raise ValueError("Note API pagination cycle")
        seen.add(page)
        response=page_fetcher(tag,page)
        data=response.get("data") or {}
        rows=data.get("notes")
        if not isinstance(rows,list):raise ValueError("Note API notes missing")
        actual+=1
        for raw in rows:
            item=normalize_api_article(raw)
            if item:articles[item["url"]]=item
        nxt=data.get("next_page")
        if not nxt or not rows:break
        try:
            target=int(nxt)
            page=target if target>page else page+1
        except (ValueError,TypeError):
            page+=1
        if delay:time.sleep(delay)
    return list(articles.values()),actual



def collect(config:dict,previous:dict,fetcher=fetch_feed,now=iso_now,
            api_fetcher=None,sleep=time.sleep)->dict:
    if config.get("group_common_articles"):
        return collect_grouped(config, previous, fetcher, now, api_fetcher, sleep)
    projects=[(str(p.get("id","")),str(p.get("hashtag","")).strip().lstrip("#"))
              for p in config.get("projects",[]) if p.get("id") and p.get("hashtag")]
    allowed={pid for pid,_ in projects}
    saved={}
    for item in previous.get("articles",[]):
        pid,url=str(item.get("project_id","")),valid_note_url(item.get("url",""))
        if pid in allowed and url:saved[(pid,url)]={**item,"project_id":pid,"url":url}
    sources,warnings=[],[]
    for pid,tag in projects:
        works,pages,method=[],0,"rss"
        api_error=""
        if api_fetcher is not None:
            try:
                works,pages=api_articles_for_tag(tag,api_fetcher,int(config.get("max_pages_per_tag",25)))
                method="note-api"
            except (ValueError,OSError,TimeoutError,KeyError,TypeError) as exc:
                api_error=str(exc)[:130]
        if not works:
            feed=f"https://note.com/hashtag/{quote(tag,safe='')}/rss"
            try:
                works=parse_rss(fetcher(feed))
                method="rss-fallback" if api_fetcher is not None else "rss"
                pages=1
            except (ValueError,ET.ParseError,OSError,TimeoutError) as exc:
                warnings.append(f"{pid}: API {api_error}; RSS {str(exc)[:130]}")
                sources.append({"type":"hashtag","method":"failed","project_id":pid,
                                "tag":tag,"ok":False,"items":0,"pages":pages})
                sleep(0.15)
                continue
        for work in works:
            key=(pid,work["url"])
            old=saved.get(key,{})
            merged={**old,**work,"project_id":pid,"first_seen":old.get("first_seen") or now()}
            for field in ("thumbnail","author_id"):
                if not merged.get(field) and old.get(field):merged[field]=old[field]
            saved[key]=merged
        sources.append({"type":"hashtag","method":method,"project_id":pid,
                        "tag":tag,"ok":True,"items":len(works),"pages":pages})
        sleep(0.15)
    for item in config.get("manual_articles",[]):
        pid,url=str(item.get("project_id","")),valid_note_url(item.get("url",""))
        if pid not in allowed or not url:
            warnings.append("Manual item skipped (invalid project_id or URL)")
            continue
        key=(pid,url);old=saved.get(key,{})
        saved[key]={**old,"project_id":pid,"url":url,
                    "title":str(item.get("title") or old.get("title") or "無題の作品")[:220],
                    "author":str(item.get("author") or old.get("author") or "noteクリエイター")[:100],
                    "thumbnail":valid_image(item.get("thumbnail","")) or old.get("thumbnail",""),
                    "published_at":old.get("published_at",""),
                    "first_seen":old.get("first_seen") or now()}
    blocked={valid_note_url(u) for u in config.get("exclude_urls",[])}
    pairs={(str(x.get("project_id","")),valid_note_url(x.get("url","")))
           for x in config.get("exclude_by_project",[])}
    for key in list(saved):
        if key[1] in blocked or key in pairs:del saved[key]
    articles=sorted(saved.values(),key=lambda a:(a.get("first_seen",""),a.get("project_id",""),a["url"]))
    articles=articles[:max(1,min(3000,int(config.get("max_articles",1000))))]
    changed=(articles!=previous.get("articles",[]) or sources!=previous.get("sources",[])
             or warnings!=previous.get("warnings",[]))
    if not projects:
        warnings.append("No project hashtags configured");changed=True
    return {"updated_at":now() if changed else previous.get("updated_at"),
            "articles":articles,"sources":sources,"warnings":warnings}


def collect_grouped(config, previous, fetcher, now, api_fetcher, sleep):
    """Retain source memberships across transient feed failures, then route display."""
    raw_config = {**config, "group_common_articles": False}
    raw_previous = {**previous, "articles": previous.get("tag_articles", previous.get("articles", []))}
    raw = collect(raw_config, raw_previous, fetcher, now, api_fetcher, sleep)
    by_url = {}
    for article in raw["articles"]:
        by_url.setdefault(article["url"], {})[article["project_id"]] = article
    displayed = []
    for url, memberships in by_url.items():
        dedicated = sorted(set(memberships) - {"common"})
        if len(dedicated) > 1 or not dedicated:
            target = "common"
        else:
            target = dedicated[0]
        article = memberships.get(target) or memberships.get("common") or memberships[dedicated[0]]
        displayed.append({**article, "project_id": target})
        # A gift tag always preserves the physical gift, even in a mixed article.
        if target != "santa" and "santa" in memberships:
            displayed.append(memberships["santa"])
    blocked = {(str(x.get("project_id", "")), valid_note_url(x.get("url", "")))
               for x in config.get("exclude_by_project", [])}
    displayed = [a for a in displayed if (a["project_id"], a["url"]) not in blocked]
    displayed.sort(key=lambda a: (a.get("first_seen", ""), a["project_id"], a["url"]))
    changed = displayed != previous.get("articles", []) or raw["articles"] != previous.get("tag_articles", [])
    return {**raw, "articles": displayed, "tag_articles": raw["articles"],
            "updated_at": now() if changed else raw["updated_at"]}


def archive_config(config: dict) -> dict:
    """Read past-event tags separately, never as Christmas participants."""
    return {
        "projects": config.get("archive_projects", []),
        "max_articles": config.get("archive_max_articles", 1000),
        "max_pages_per_tag": config.get("archive_max_pages_per_tag", 25),
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
        result = collect(source_config, previous, api_fetcher=fetch_note_page)
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{label}: {len(result['articles'])} total, warnings: {len(result['warnings'])}")
        for warning in result["warnings"]:
            print("WARNING:", warning, file=sys.stderr)


if __name__ == "__main__":
    main()
