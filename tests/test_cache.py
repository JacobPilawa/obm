import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from memo_cache import MemoCache


class CacheTests(unittest.TestCase):
    def test_concurrent_readers_share_one_load(self):
        cache = MemoCache(2)
        started, release = Event(), Event()
        calls = []
        def load():
            calls.append(1)
            started.set()
            self.assertTrue(release.wait(5))
            return object()
        with ThreadPoolExecutor(8) as pool:
            first = pool.submit(cache.get, 'trial', load)
            self.assertTrue(started.wait(5))
            readers = [pool.submit(cache.get, 'trial', load) for _ in range(7)]
            release.set()
            value = first.result(5)
            self.assertTrue(all(reader.result(5) is value for reader in readers))
        self.assertEqual(len(calls), 1)

    def test_failures_can_be_retried(self):
        cache = MemoCache(2)
        def fail():
            raise ValueError('bad source')
        with self.assertRaises(ValueError):
            cache.get('trial', fail)
        self.assertEqual(cache.get('trial', lambda: 'fixed'), 'fixed')

    def test_entry_and_byte_limits_evict_least_recent(self):
        cache = MemoCache(2, 5, len)
        cache.get('a', lambda: b'aa')
        cache.get('b', lambda: b'bb')
        cache.get('a', lambda: b'ignored')
        cache.get('c', lambda: b'ccc')
        self.assertEqual(list(cache._values), ['a', 'c'])
        cache.get('huge', lambda: b'123456')
        self.assertEqual(list(cache._values), ['a', 'c'])
        self.assertLessEqual(cache._weight, 5)
        self.assertEqual(cache.get('b', lambda: b'new'), b'new')


if __name__ == '__main__':
    unittest.main()
