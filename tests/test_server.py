import gzip
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'dashboard'))
from server import DashboardHTTPServer, Handler, accepts_gzip
from video_jobs import VideoJobs


class FakeStore:
    entries = {'pitch': {'public': {'discipline': 'pitching'}}}
    calls = 0
    def catalog(self):
        return {'entries': list(self.entries)}
    def trial(self, identity):
        if identity not in self.entries:
            raise KeyError(identity)
        self.calls += 1
        return {'id': identity, 'values': list(range(1000)), 'missing': None}


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        (self.root / 'data/cohort_pitching.json').write_text('{"version":1}')
        self.appdir = patch('server.APP_DIR', self.root)
        self.appdir.start()
        class QuietHandler(Handler):
            def log_message(self, *args):
                pass
        QuietHandler.store = self.store = FakeStore()
        QuietHandler.videos = VideoJobs(self.root)
        self.server = DashboardHTTPServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_address[1]}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.appdir.stop()
        self.temp.cleanup()

    def get(self, path, encoding='gzip'):
        return urllib.request.urlopen(urllib.request.Request(self.origin + path, headers={'Accept-Encoding': encoding}))

    def test_cached_trial_preserves_json_and_encoding_variants(self):
        with self.get('/api/trial?id=pitch') as response:
            self.assertEqual(response.headers['Vary'], 'Accept-Encoding')
            first = response.read()
        with self.get('/api/trial?id=pitch') as response:
            self.assertEqual(first, response.read())
        self.assertEqual(self.store.calls, 1)
        decoded = json.loads(gzip.decompress(first))
        with self.get('/api/trial?id=pitch', 'gzip;q=0, *;q=1') as response:
            self.assertIsNone(response.headers.get('Content-Encoding'))
            self.assertEqual(decoded, json.load(response))
        self.assertIsNone(decoded['missing'])

    def test_asset_compression_invalidates_after_rebuild(self):
        with self.get('/data/cohort_pitching.json') as response:
            self.assertEqual(json.loads(gzip.decompress(response.read())), {'version': 1})
        (self.root / 'data/cohort_pitching.json').write_text('{"version":2,"new":true}')
        with self.get('/data/cohort_pitching.json') as response:
            self.assertEqual(json.loads(gzip.decompress(response.read())), {'version': 2, 'new': True})

    def test_unknown_trial_export_and_routes_return_json_404(self):
        for path in ['/api/trial', '/api/trial?id=missing', '/api/video-exports/nope', '/api/missing']:
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as caught:
                self.get(path)
            self.assertEqual(caught.exception.code, 404)
            self.assertIn('error', json.load(caught.exception))

    def test_malformed_export_returns_400(self):
        state = {'version': 2, 'primary': ['not a string'], 'entries': []}
        request = urllib.request.Request(self.origin + '/api/video-exports', data=json.dumps(state).encode(), headers={'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)
        self.assertEqual(caught.exception.code, 400)
        self.assertIn('error', json.load(caught.exception))

    def test_encoding_negotiation(self):
        for header in ['gzip', 'br, gzip;q=0.5', '*;q=1']:
            self.assertTrue(accepts_gzip(header))
        for header in ['', 'br', 'gzip;q=0', 'gzip;q=0, *;q=1', 'gzip;q=bad']:
            self.assertFalse(accepts_gzip(header))


if __name__ == '__main__':
    unittest.main()
