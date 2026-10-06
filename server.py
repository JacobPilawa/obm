"""Local-only OpenBiomechanics dashboard server."""
from __future__ import annotations

import argparse
import gzip
import json
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from data_store import APP_DIR, CATALOG_PATH, DataStore
from memo_cache import MemoCache
from video_jobs import VideoJobs


def accepts_gzip(header):
    """Honor an explicit gzip;q=0 even when a wildcard is present."""
    encodings = {}
    for part in header.lower().split(','):
        name, *parameters = part.strip().split(';')
        quality = 1.0
        for parameter in parameters:
            key, _, value = parameter.strip().partition('=')
            if key == 'q':
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        encodings[name] = quality
    return encodings.get('gzip', encodings.get('*', 0)) > 0


def encode_json(data, compressed):
    payload = json.dumps(data, separators=(',', ':'), allow_nan=False).encode('utf-8')
    return gzip.compress(payload, compresslevel=5, mtime=0) if compressed else payload


class DashboardHTTPServer(ThreadingHTTPServer):
    request_queue_size = 64

    def __init__(self, *args, **kwargs):
        # Keep large responses bounded and share concurrent encoding work.
        self.responses = MemoCache(12, 64 * 1024 * 1024, weight=len)
        super().__init__(*args, **kwargs)


class Handler(SimpleHTTPRequestHandler):
    store: DataStore
    videos: VideoJobs
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.md': 'text/plain; charset=utf-8'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/video-exports':
            return self.send_json(self.videos.list())
        if parsed.path.startswith('/api/video-exports/'):
            pieces = parsed.path.strip('/').split('/')
            try:
                identity = pieces[2]
                job = self.videos.status(identity)
                if len(pieces) == 4 and pieces[3] == 'download':
                    if job['status'] != 'completed':
                        return self.send_json({'error': 'Export is not ready'}, 409)
                    path = self.videos._path(identity) / job['filename']
                    # Open before sending headers so stale completed jobs return an error.
                    with path.open('rb') as movie:
                        self.send_response(200)
                        self.send_header('Content-Type', 'video/mp4')
                        self.send_header('Content-Length', str(path.stat().st_size))
                        self.send_header('Content-Disposition', f'attachment; filename="{job["filename"]}"')
                        self.end_headers()
                        try:
                            shutil.copyfileobj(movie, self.wfile)
                        except (BrokenPipeError, ConnectionResetError):
                            pass
                    return
                if len(pieces) != 3:
                    raise KeyError(identity)
                return self.send_json(job)
            except (KeyError, IndexError, OSError):
                return self.send_json({'error': 'Unknown export'}, 404)
        if parsed.path == '/api/catalog':
            return self.send_cached_json(('catalog',), self.store.catalog)
        if parsed.path == '/api/trial':
            identity = parse_qs(parsed.query).get('id', [None])[0]
            try:
                return self.send_cached_json(('trial', identity), lambda: self.store.trial(identity))
            except KeyError as error:
                return self.send_json({'error': str(error)}, 404)
            except Exception as error:
                return self.send_json({'error': f'Could not load trial: {error}'}, 500)
        if parsed.path == '/api/health':
            return self.send_json({'ready': True, 'entries': len(self.store.entries)})
        if parsed.path.startswith('/api/'):
            return self.send_json({'error': 'Unknown endpoint'}, 404)
        if parsed.path.startswith('/data/') and parsed.path.endswith('.json'):
            path = (APP_DIR / parsed.path.lstrip('/')).resolve()
            if path.parent == (APP_DIR / 'data').resolve() and path.is_file():
                stat = path.stat()
                compressed = accepts_gzip(self.headers.get('Accept-Encoding', ''))
                key = ('asset', path.name, stat.st_size, stat.st_mtime_ns, compressed)
                def read_asset():
                    payload = path.read_bytes()
                    return gzip.compress(payload, compresslevel=5, mtime=0) if compressed else payload
                payload = self.server.responses.get(key, read_asset)
                return self.send_bytes(payload, 200, compressed)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/video-exports':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length < 1000000:
                    raise ValueError('Invalid export request size')
                state = json.loads(self.rfile.read(length))
                origin = f'http://127.0.0.1:{self.server.server_address[1]}'
                return self.send_json(self.videos.submit(state, self.store, origin), 202)
            except (ValueError, KeyError, TypeError) as error:
                return self.send_json({'error': str(error)}, 400)
        pieces = parsed.path.strip('/').split('/')
        if len(pieces) == 4 and pieces[:2] == ['api', 'video-exports'] and pieces[3] == 'cancel':
            try:
                return self.send_json(self.videos.cancel(pieces[2]))
            except KeyError:
                return self.send_json({'error': 'Unknown export'}, 404)
        return self.send_json({'error': 'Unknown endpoint'}, 404)

    def send_cached_json(self, key, factory):
        compressed = accepts_gzip(self.headers.get('Accept-Encoding', ''))
        payload = self.server.responses.get((*key, compressed), lambda: encode_json(factory(), compressed))
        return self.send_bytes(payload, 200, compressed)

    def send_json(self, data, status=200):
        return self.send_bytes(encode_json(data, False), status, False)

    def send_bytes(self, payload, status, compressed):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(payload)))
        if compressed:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A superseded replay fetch or a closed tab can disconnect normally.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--build-index', action='store_true', help='Index and audit local files, then exit')
    parser.add_argument('--refresh-catalog', action='store_true', help='Rescan all local C3D files before starting')
    args = parser.parse_args()
    if args.refresh_catalog:
        CATALOG_PATH.unlink(missing_ok=True)
    try:
        store = DataStore()
    except FileNotFoundError as error:
        parser.error(f'{error}. Set OBM_DATA_ROOT to your upstream checkout and download/extract its full-signal release files. See README.md.')
    if args.build_index:
        print(json.dumps(store.catalog()['counts'], indent=2))
        return
    Handler.store = store
    Handler.videos = VideoJobs(APP_DIR)
    server = DashboardHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Dashboard: http://127.0.0.1:{args.port}/', flush=True)
    print(f'Catalog: {len(store.entries):,} items', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        Handler.videos.close()
        server.server_close()


if __name__ == '__main__':
    main()
