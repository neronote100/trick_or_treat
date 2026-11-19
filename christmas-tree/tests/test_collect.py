import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from collect import parse_rss, collect, valid_note_url, archive_config, normalize_api_article, api_articles_for_tag

SAMPLE = b'''<?xml version="1.0" encoding="utf-8"?><rss version="2.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><item><title>Christmas story</title><link>https://note.com/test_user/n/n123abcd?ref=feed</link>
<dc:creator>Latte</dc:creator><media:thumbnail url="https://assets.st-note.com/img.jpg"/>
<pubDate>Tue, 17 Nov 2026 12:00:00 +0900</pubDate></item></channel></rss>'''

EMPTY = b'<?xml version="1.0"?><rss><channel></channel></rss>'
CONFIG = {
    "projects": [
        {"id": "letter", "hashtag": "キングダム恋文2026"},
        {"id": "card", "hashtag": "キングダムカード2026"},
    ],
    "manual_articles": [],
    "exclude_urls": [],
    "exclude_by_project": [],
}

class CollectorTests(unittest.TestCase):
    def test_archival_feeds_separate_from_christmas(self):
        setup = {"projects": [{"id": "letter", "hashtag": "キングダム恋文2026"}],
                 "archive_projects": [
                   {"id": "prince-play", "hashtag": "王子ごっこ"},
                   {"id": "autumn-reading", "hashtag": "秋読コレクション"},
                   {"id": "hello-halloween", "hashtag": "ハロハロウィーン"}]}
        ac = archive_config(setup)
        self.assertEqual(len(ac["projects"]), 3)
        result = collect(ac, {"articles": []}, fetcher=lambda url:SAMPLE, now=lambda:"now")
        self.assertEqual(len(result["articles"]), 3)
        self.assertEqual({x["project_id"] for x in result["articles"]},
                         {"prince-play", "autumn-reading", "hello-halloween"})

    def test_note_native_creator_and_cover(self):
        xml = b"""<?xml version="1.0" encoding="utf-8"?>
        <rss xmlns:note="https://note.com"
             xmlns:media="http://search.yahoo.com/mrss/">
          <channel><item>
            <title>Note event</title><link>https://note.com/abc/n/n12345</link>
            <media:thumbnail url="https://assets.st-note.com/thumb.png?width=800"/>
            <note:creatorName>Event Author</note:creatorName>
            <note:creatorImage url="https://assets.st-note.com/profile.png"/>
          </item></channel>
        </rss>"""
        article = parse_rss(xml)[0]
        self.assertEqual(article["author"], "Event Author")
        self.assertEqual(article["thumbnail"], "https://assets.st-note.com/thumb.png?width=800")

    def test_comment_reader_api_page_and_cover(self):
        article={"key":"n123abcde","name":"告白","status":"published",
                 "eyecatch_url":"https://assets.st-note.com/cover.png",
                 "user":{"nickname":"らて","urlname":"latte_note"}}
        calls=[]
        def page(tag,n):
            calls.append(n)
            return {"data":{"notes":[article] if n==1 else [{**article,"key":"n789abcde"}],
                            "next_page":2 if n==1 else None}}
        works,pages=api_articles_for_tag("秋読コレクション",page,max_pages=10,delay=0)
        self.assertEqual((len(works),pages),(2,2))
        self.assertEqual(works[0]["thumbnail"],"https://assets.st-note.com/cover.png")
        self.assertEqual(works[0]["author"],"らて")
        self.assertEqual(calls,[1,2])

    def test_api_scan_and_rss_fallback(self):
        raw={"key":"n123abcde","name":"星の手紙","status":"published",
             "eyecatch_url":"https://assets.st-note.com/cover.png",
             "user":{"nickname":"らて","urlname":"latte_note"}}
        cfg={**CONFIG,"projects":[{"id":"letter","hashtag":"クリスマス"}]}
        first=collect(cfg,{"articles":[]},fetcher=lambda u:EMPTY,
             api_fetcher=lambda tag,page:{"data":{"notes":[raw],"next_page":None}},
             now=lambda:"first",sleep=lambda _:None)
        self.assertEqual(len(first["articles"]),1)
        self.assertEqual(first["sources"][0]["method"],"note-api")
        second=collect(cfg,first,fetcher=lambda u:EMPTY,
               api_fetcher=lambda tag,page:(_ for _ in ()).throw(OSError("blocked")),
               now=lambda:"second",sleep=lambda _:None)
        self.assertEqual(len(second["articles"]),1)

    def test_parse_rss(self):
        a = parse_rss(SAMPLE)[0]
        self.assertEqual(a["url"], "https://note.com/test_user/n/n123abcd")
        self.assertEqual(a["title"], "Christmas story")
        self.assertEqual(a["author"], "Latte")
        self.assertEqual(a["thumbnail"], "https://assets.st-note.com/img.jpg")

    def test_reject_unsafe_links(self):
        self.assertEqual(valid_note_url("https://evil.example/n/n123abcd"), "")
        self.assertEqual(valid_note_url("javascript:alert(1)"), "")

    def test_auto_publish_each_project_and_repeat_authors(self):
        works = collect(CONFIG, {"articles": []}, fetcher=lambda url: SAMPLE,
                        now=lambda: "2026-11-20")
        self.assertEqual(len(works["articles"]), 2)
        self.assertEqual({w["project_id"] for w in works["articles"]}, {"letter", "card"})
        self.assertEqual({w["author"] for w in works["articles"]}, {"Latte"})
        self.assertTrue(all("status" not in w for w in works["articles"]))

    def test_dedupe_and_idempotent(self):
        first = collect(CONFIG, {"articles": []}, fetcher=lambda url: SAMPLE,
                        now=lambda: "first")
        second = collect(CONFIG, first, fetcher=lambda url: SAMPLE, now=lambda: "second")
        self.assertEqual(first, second)

    def test_retains_previous_on_missing_tag_or_feed_failure(self):
        first = collect(CONFIG, {"articles": []}, fetcher=lambda url: SAMPLE,
                        now=lambda: "first")
        second = collect(CONFIG, first, fetcher=lambda url: (_ for _ in ()).throw(OSError("offline")),
                         now=lambda: "second")
        self.assertEqual(len(second["articles"]), 2)
        third = collect(CONFIG, second, fetcher=lambda url: EMPTY, now=lambda: "third")
        self.assertEqual(len(third["articles"]), 2)

    def test_global_and_project_opt_out(self):
        config = {**CONFIG, "exclude_by_project": [{"project_id": "letter", "url": "https://note.com/test_user/n/n123abcd"}]}
        result = collect(config, {"articles": []}, fetcher=lambda url: SAMPLE, now=lambda: "now")
        self.assertEqual([a["project_id"] for a in result["articles"]], ["card"])
        config = {**CONFIG, "exclude_urls": ["https://note.com/test_user/n/n123abcd"]}
        result = collect(config, {"articles": []}, fetcher=lambda url: SAMPLE, now=lambda: "now")
        self.assertEqual(len(result["articles"]), 0)

    def test_operator_fallback_missing_feed(self):
        config = {**CONFIG, "manual_articles": [{"project_id": "letter", "url": "https://note.com/another/n/n123", "title": "発見", "author": "王子"}]}
        result = collect(config, {"articles": []}, fetcher=lambda url: EMPTY, now=lambda: "now")
        self.assertEqual(len(result["articles"]), 1)
        self.assertEqual(result["articles"][0]["title"], "発見")

if __name__ == "__main__":
    unittest.main()
