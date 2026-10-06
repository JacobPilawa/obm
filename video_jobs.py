"""Persistent local background movie jobs, with one renderer at a time."""
from pathlib import Path
import json
import math
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid


class VideoJobs:
    def __init__(self, root):
        self.root = Path(root)
        self.folder = self.root / 'cache/video_jobs'
        self.folder.mkdir(parents=True, exist_ok=True)
        self.slots = threading.Semaphore(1)
        self.processes = {}
        self.active = set()
        self.lock = threading.RLock()
        self.closed = False
        # A previous server's worker cannot be resumed by this manager.
        for path in self.folder.glob('*/status.json'):
            try:
                job = json.loads(path.read_text())
                if job['status'] in ('queued', 'rendering'):
                    job.update(status='failed', error='The dashboard server stopped before this export finished.')
                    self._write(path.parent, job)
            except (OSError, ValueError, KeyError):
                pass

    def _path(self, identity):
        if not isinstance(identity, str) or not re.fullmatch(r'[0-9a-f]{32}', identity):
            raise KeyError('Unknown export')
        path = self.folder / identity
        if not (path / 'status.json').is_file():
            raise KeyError('Unknown export')
        return path

    def status(self, identity):
        path = self._path(identity)
        job = json.loads((path / 'status.json').read_text())
        # Cancellation is authoritative even if the renderer raced a status write.
        if (path / 'cancel').exists():
            job['status'] = 'cancelled'
        return job

    def _write(self, path, data):
        temp = path / 'status.tmp'
        temp.write_text(json.dumps(data, allow_nan=False))
        temp.replace(path / 'status.json')

    def list(self):
        jobs = []
        for path in self.folder.glob('*/status.json'):
            try:
                jobs.append(self.status(path.parent.name))
            except (OSError, ValueError, KeyError):
                pass
        return sorted(jobs, key=lambda job: job['created'], reverse=True)[:30]

    @staticmethod
    def validate(state, store):
        if not isinstance(state, dict) or state.get('version') != 2:
            raise ValueError('Refresh the dashboard to use background exports.')
        entries = state.get('entries', [])
        if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
            raise ValueError('Invalid export recordings.')
        identities = [state.get('primary')] + [entry.get('id') for entry in entries]
        if len(identities) > 5 or any(not isinstance(identity, str) or identity not in store.entries for identity in identities):
            raise ValueError('Invalid export recordings.')
        discipline = store.entries[identities[0]]['public']['discipline']
        if any(store.entries[identity]['public']['discipline'] != discipline for identity in identities):
            raise ValueError('Compared recordings must use the same discipline.')
        state = dict(state)
        for key in ('width', 'height', 'pixelWidth', 'pixelHeight'):
            value = state.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 16 <= value <= 4096:
                raise ValueError('Viewer dimensions must be between 16 and 4096 pixels.')
            state[key] = int(value)
        if state['pixelWidth'] % 2 or state['pixelHeight'] % 2:
            raise ValueError('Movie dimensions must be even.')
        if isinstance(state.get('speed'), bool) or state.get('speed') not in (.1, .25, .5, .75, 1):
            raise ValueError('Invalid playback speed.')
        json.dumps(state, allow_nan=False)
        return state

    def submit(self, state, store, origin):
        state = self.validate(state, store)
        filename = re.sub(r'[^A-Za-z0-9_.-]', '_', str(state.get('filename', 'replay.mp4')))[:200]
        if not filename.endswith('.mp4'):
            filename += '.mp4'
        with self.lock:
            if self.closed:
                raise ValueError('The dashboard server is stopping.')
            if len(self.active) >= 5:
                raise ValueError('Five exports are already queued; wait for one to finish.')
            identity = uuid.uuid4().hex
            path = self.folder / identity
            path.mkdir()
            job = dict(id=identity, filename=filename, status='queued', progress=0, created=time.time())
            self._write(path, job)
            (path / 'input.json').write_text(json.dumps(state, allow_nan=False))
            self.active.add(identity)
            threading.Thread(target=self._run, args=(identity, origin), daemon=True).start()
            return job

    def _run(self, identity, origin):
        try:
            with self.slots:
                path = self._path(identity)
                node = os.environ.get('OBM_NODE') or shutil.which('node') or 'node'
                with (path / 'worker.log').open('w') as log:
                    with self.lock:
                        if self.status(identity)['status'] == 'cancelled' or self.closed:
                            return
                        process = subprocess.Popen(
                            [node, str(self.root / 'render_movie.cjs'), str(path), origin],
                            stdout=log, stderr=log, start_new_session=True,
                        )
                        self.processes[identity] = process
                    code = process.wait()
                with self.lock:
                    job = self.status(identity)
                    if job['status'] not in ('completed', 'cancelled'):
                        job.update(status='failed', error=(path / 'worker.log').read_text()[-1500:] or f'Renderer exited with status {code}')
                        self._write(path, job)
        except Exception as error:
            with self.lock:
                job = self.status(identity)
                if job['status'] != 'cancelled':
                    job.update(status='failed', error=str(error))
                    self._write(self._path(identity), job)
        finally:
            with self.lock:
                self.processes.pop(identity, None)
                self.active.discard(identity)

    def cancel(self, identity):
        with self.lock:
            path = self._path(identity)
            job = self.status(identity)
            if job['status'] in ('queued', 'rendering'):
                (path / 'cancel').touch()
                job['status'] = 'cancelled'
                self._write(path, job)
                self.active.discard(identity)
                process = self.processes.get(identity)
                if process and process.poll() is None:
                    try:
                        if hasattr(os, 'killpg'):
                            os.killpg(process.pid, signal.SIGTERM)
                        else:
                            process.terminate()
                    except ProcessLookupError:
                        pass
            return job

    def close(self):
        with self.lock:
            self.closed = True
            for identity in list(self.active):
                self.cancel(identity)
