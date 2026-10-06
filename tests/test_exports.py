import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'dashboard'))
from video_jobs import VideoJobs

STORE = SimpleNamespace(entries={'p': {'public': {'discipline': 'pitching'}}, 'h': {'public': {'discipline': 'hitting'}}})
VALID = dict(version=2, primary='p', entries=[], width=800, height=600, pixelWidth=800, pixelHeight=600, speed=1)


class ExportTests(unittest.TestCase):
    def test_rejects_malformed_recordings_dimensions_and_speed(self):
        bad = [dict(entries=[None]), dict(entries={}), dict(primary=[]), dict(primary=None),
               dict(entries=[{'id': 'h'}]), dict(pixelWidth=801), dict(height=float('inf')),
               dict(width=True), dict(speed=True), dict(speed=.9)]
        for changes in bad:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                VideoJobs.validate({**VALID, **changes}, STORE)
        self.assertEqual(VideoJobs.validate(VALID, STORE), VALID)

    def test_queue_capacity_cancel_and_shutdown(self):
        with tempfile.TemporaryDirectory() as root, patch('video_jobs.threading.Thread'):
            videos = VideoJobs(root)
            jobs = [videos.submit(VALID, STORE, 'http://127.0.0.1:1234') for _ in range(5)]
            with self.assertRaisesRegex(ValueError, 'Five exports'):
                videos.submit(VALID, STORE, 'http://127.0.0.1:1234')
            cancelled = videos.cancel(jobs[0]['id'])
            self.assertEqual(cancelled['status'], 'cancelled')
            videos.submit(VALID, STORE, 'http://127.0.0.1:1234')
            # A renderer's stale write cannot resurrect a cancelled job.
            path = videos._path(jobs[0]['id'])
            videos._write(path, {**jobs[0], 'status': 'rendering'})
            self.assertEqual(videos.status(jobs[0]['id'])['status'], 'cancelled')
            videos.close()
            self.assertTrue(all(job['status'] == 'cancelled' for job in videos.list()))
            with self.assertRaisesRegex(ValueError, 'stopping'):
                videos.submit(VALID, STORE, 'http://127.0.0.1:1234')

    def test_server_restart_marks_interrupted_jobs_failed(self):
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root) / 'cache/video_jobs' / ('a' * 32)
            folder.mkdir(parents=True)
            (folder / 'status.json').write_text(json.dumps(dict(id='a' * 32, status='rendering', created=1)))
            videos = VideoJobs(root)
            job = videos.status('a' * 32)
            self.assertEqual(job['status'], 'failed')
            self.assertIn('stopped', job['error'])
            videos.close()


if __name__ == '__main__':
    unittest.main()
