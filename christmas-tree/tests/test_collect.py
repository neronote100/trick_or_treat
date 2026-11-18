import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect import parse_rss, collect, valid_note_url  # noqa: E402

SAMPLE = b'''<?xml version="1.0" encoding="utf-8"?><rss version="2.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><item><title>Christmas story</title><link>https://note.com/test_user/n/n123abcd?ref=feed</link>
<dc:creator>Latte</dc:creator><media:thumbnail url="https://assets.st-note.com/img.jpg"/>
<pubDate>Tue, 17 Nov 2026 12:00:00 +0900</pubDate></item></channel></rss>'''

class CollectorTests(unittest.TestCase):
    def test_parse_media_image_and_url(self):
        x = parse_rss(SAMPLE)[0]
        self.assertEqual(x['url'], 'https://note.com/test_user/n/n123abcd')
        self.assertEqual(x['author'], 'Latte')
        self.assertEqual(x['thumbnail'], 'https://assets.st-note.com/img.jpg')

    def test_reject_foreign_or_untrusted_link(self):
        self.assertEqual(valid_note_url('https://evil.example/n/n123abcd'), '')
        self.assertEqual(valid_note_url('javascript:alert(1)'), '')

    def test_dedupe_and_keep_prior_articles(self):
        old = {'articles': [{'url': 'https://note.com/old/n/n9999', 'title': 'old', 'first_seen': '2026-11-01'}], 'updated_at': 'yesterday'}
        result = collect({'hashtag': 'Christmas', 'magazine_rss_urls': [], 'manual_articles': []}, old, fetcher=lambda u: SAMPLE, now=lambda:'2026-11-18')
        self.assertEqual(len(result['articles']), 2)
        result2 = collect({'hashtag': 'Christmas', 'magazine_rss_urls': [], 'manual_articles': []}, result, fetcher=lambda u: SAMPLE, now=lambda:'2026-11-19')
        self.assertEqual(len(result2['articles']), 2)

    def test_keep_previous_on_source_failure(self):
        old = {'articles': [{'url': 'https://note.com/old/n/n9999', 'title': 'old'}], 'updated_at': 'yesterday'}
        with self.assertRaises(RuntimeError):
            collect({'hashtag': 'Christmas', 'magazine_rss_urls': [], 'manual_articles': []}, old, fetcher=lambda u: (_ for _ in ()).throw(OSError('offline')))

    def test_manual_source_works(self):
        result = collect({'hashtag': '', 'magazine_rss_urls': [], 'manual_articles': [{'url':'https://note.com/u/n/nabc', 'title':'hello','author':'you'}]}, {'articles': []}, now=lambda:'now')
        self.assertEqual(result['articles'][0]['title'], 'hello')

if __name__ == '__main__':
    unittest.main()
