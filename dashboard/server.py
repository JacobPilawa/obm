"""Local-only OpenBiomechanics dashboard server."""
from __future__ import annotations

import argparse
import gzip
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from video_jobs import VideoJobs
from urllib.parse import parse_qs, urlparse

from data_store import APP_DIR, CATALOG_PATH, DataStore


class DashboardHTTPServer(ThreadingHTTPServer):
    request_queue_size = 64


class Handler(SimpleHTTPRequestHandler):
    store: DataStore
    videos: VideoJobs
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".md": "text/plain; charset=utf-8"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/video-exports":
            return self.send_json(self.videos.list())
        if parsed.path.startswith("/api/video-exports/"):
            pieces=parsed.path.strip("/").split("/")
            try:
                identity=pieces[2];job=self.videos.status(identity)
                if len(pieces)==4 and pieces[3]=="download":
                    if job['status']!='completed':return self.send_json({'error':'Export is not ready'},409)
                    path=self.videos._path(identity)/job['filename']
                    self.send_response(200);self.send_header('Content-Type','video/mp4');self.send_header('Content-Length',str(path.stat().st_size));self.send_header('Content-Disposition',f'attachment; filename="{job["filename"]}"');self.end_headers()
                    with path.open('rb') as movie:
                        import shutil
                        shutil.copyfileobj(movie,self.wfile)
                    return
                return self.send_json(job)
            except (KeyError,IndexError):return self.send_json({'error':'Unknown export'},404)
        if parsed.path == "/api/catalog":
            return self.send_json(self.store.catalog())
        if parsed.path == "/api/trial":
            identity = parse_qs(parsed.query).get("id", [None])[0]
            try:
                payload = self.store.trial(identity)
            except KeyError as exc:
                return self.send_json({"error": str(exc)}, 404)
            except Exception as exc:
                return self.send_json({"error": f"Could not load trial: {exc}"}, 500)
            return self.send_json(payload)
        if parsed.path == "/api/health":
            return self.send_json({"ready": True, "entries": len(self.store.entries)})
        return super().do_GET()

    def do_POST(self):
        parsed=urlparse(self.path)
        if parsed.path == '/api/video-exports':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<1000000:raise ValueError('Invalid export request size')
                state=json.loads(self.rfile.read(length))
                origin=f'http://127.0.0.1:{self.server.server_address[1]}'
                return self.send_json(self.videos.submit(state,self.store,origin),202)
            except (ValueError,KeyError,TypeError) as error:return self.send_json({'error':str(error)},400)
        if parsed.path.startswith('/api/video-exports/') and parsed.path.endswith('/cancel'):
            try:return self.send_json(self.videos.cancel(parsed.path.strip('/').split('/')[2]))
            except KeyError:return self.send_json({'error':'Unknown export'},404)
        return self.send_json({'error':'Unknown endpoint'},404)

    def send_json(self, data, status=200):
        payload = json.dumps(data, separators=(",", ":"), allow_nan=False).encode("utf-8")
        compressed = "gzip" in self.headers.get("Accept-Encoding", "") and len(payload) > 2048
        if compressed:
            payload = gzip.compress(payload, compresslevel=5)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        if compressed:
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        self.wfile.write(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--build-index", action="store_true", help="Index and audit local files, then exit")
    parser.add_argument("--refresh-catalog", action="store_true", help="Rescan all local C3D files before starting")
    args = parser.parse_args()
    if args.refresh_catalog:
        CATALOG_PATH.unlink(missing_ok=True)
    store = DataStore()
    if args.build_index:
        print(json.dumps(store.catalog()["counts"], indent=2))
        return
    Handler.store = store
    Handler.videos = VideoJobs(APP_DIR)
    server = DashboardHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Dashboard: http://127.0.0.1:{args.port}/", flush=True)
    print(f"Catalog: {len(store.entries):,} items", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
