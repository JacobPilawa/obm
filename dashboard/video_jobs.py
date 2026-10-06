"""Persistent local background movie jobs; never depend on a browser tab."""
from pathlib import Path
import json,math,os,re,shutil,subprocess,threading,time,uuid

class VideoJobs:
    def __init__(self,root):
        self.root=Path(root);self.folder=self.root/'cache/video_jobs';self.folder.mkdir(parents=True,exist_ok=True)
        self.slots=threading.Semaphore(1);self.processes={};self.lock=threading.Lock()
    def _path(self,identity):
        if not re.fullmatch(r'[0-9a-f]{32}',identity):raise KeyError('Unknown export')
        path=self.folder/identity
        if not (path/'status.json').is_file():raise KeyError('Unknown export')
        return path
    def status(self,identity):return json.loads((self._path(identity)/'status.json').read_text())
    def _write(self,path,data):
        temp=path/'status.tmp';temp.write_text(json.dumps(data));temp.replace(path/'status.json')
    def list(self):
        jobs=[]
        for path in self.folder.glob('*/status.json'):
            try:jobs.append(json.loads(path.read_text()))
            except (OSError,ValueError):pass
        return sorted(jobs,key=lambda j:j['created'],reverse=True)[:30]
    def submit(self,state,store,origin):
        if not isinstance(state,dict) or state.get('version')!=2:raise ValueError('Refresh the dashboard to use background exports.')
        ids=[state.get('primary')]+[entry.get('id') for entry in state.get('entries',[])]
        if len(ids)>5 or any(identity not in store.entries for identity in ids):raise ValueError('Invalid export recordings.')
        if any(store.entries[i]['public']['discipline']!=store.entries[ids[0]]['public']['discipline'] for i in ids):raise ValueError('Compared recordings must use the same discipline.')
        for key in ['width','height','pixelWidth','pixelHeight']:
            if not isinstance(state.get(key),(int,float)) or not math.isfinite(state[key]) or not 16<=state[key]<=4096:raise ValueError('Viewer dimensions must be between 16 and 4096 pixels.')
            state[key]=int(state[key])
        if state['pixelWidth']%2 or state['pixelHeight']%2:raise ValueError('Movie dimensions must be even.')
        if state.get('speed') not in [.1,.25,.5,.75,1]:raise ValueError('Invalid playback speed.')
        if sum(job['status'] in ['queued','rendering'] for job in self.list())>=5:raise ValueError('Five exports are already queued; wait for one to finish.')
        filename=re.sub(r'[^A-Za-z0-9_.-]','_',str(state.get('filename','replay.mp4')))[:200]
        if not filename.endswith('.mp4'):filename+='.mp4'
        identity=uuid.uuid4().hex;path=self.folder/identity;path.mkdir()
        job={'id':identity,'filename':filename,'status':'queued','progress':0,'created':time.time()}
        self._write(path,job);(path/'input.json').write_text(json.dumps(state));
        threading.Thread(target=self._run,args=(identity,origin),daemon=True).start();return job
    def _run(self,identity,origin):
        with self.slots:
            path=self._path(identity)
            if self.status(identity)['status']=='cancelled':return
            node=os.environ.get('OBM_NODE') or shutil.which('node') or '/usr/local/bin/node'
            try:
                with (path/'worker.log').open('w') as log:
                    process=subprocess.Popen([node,str(self.root/'render_movie.cjs'),str(path),origin],stdout=log,stderr=log,start_new_session=True)
                    with self.lock:self.processes[identity]=process
                    code=process.wait()
                job=self.status(identity)
                if job['status'] not in ['completed','cancelled']:
                    job.update(status='failed',error=(path/'worker.log').read_text()[-1500:] or f'Renderer exited with status {code}')
                    self._write(path,job)
            except Exception as exc:
                job=self.status(identity)
                if job['status']!='cancelled':job.update(status='failed',error=str(exc));self._write(path,job)
            finally:
                with self.lock:self.processes.pop(identity,None)
    def cancel(self,identity):
        path=self._path(identity);job=self.status(identity)
        if job['status'] in ['queued','rendering']:
            (path/'cancel').touch();job['status']='cancelled';self._write(path,job)
            with self.lock:process=self.processes.get(identity)
            if process:process.terminate()
        return job
