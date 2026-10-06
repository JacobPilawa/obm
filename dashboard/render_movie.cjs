// Deterministic frame rendering and a non-fragmented MP4 encoder, independent of the user's tab.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{once}=require('events');
const folder=process.argv[2],origin=process.argv[3],state=JSON.parse(fs.readFileSync(path.join(folder,'input.json'),'utf8'));
process.env.TMPDIR=folder;
const chromium=require(process.env.OBM_PLAYWRIGHT||path.join(require('os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')).chromium;
let browser,encoder,cancelled=false;
const status=()=>JSON.parse(fs.readFileSync(path.join(folder,'status.json'),'utf8'));
const update=data=>{if(fs.existsSync(path.join(folder,'cancel')))throw Error('Export cancelled');const temp=path.join(folder,'worker-status.tmp');fs.writeFileSync(temp,JSON.stringify({...status(),...data}));fs.renameSync(temp,path.join(folder,'status.json'))};
process.on('SIGTERM',async()=>{cancelled=true;encoder?.kill();await browser?.close().catch(()=>{});process.exit(0)});
(async()=>{
 update({status:'rendering',progress:0});
 browser=await chromium.launch({executablePath:process.env.OBM_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-breakpad','--disable-crash-reporter',`--disk-cache-dir=${path.join(folder,'chrome-cache')}`]});
 const page=await browser.newPage({viewport:{width:Math.max(800,state.width),height:Math.max(600,state.height)},deviceScaleFactor:1});
 page.on('pageerror',error=>{console.error(error.message)});
 await page.goto(origin+'/index.html');
 await page.waitForFunction(()=>window.__movieReady?.(),{},{timeout:90000});
 const setup=await page.evaluate(state=>window.__prepareMovie(state),state),fps=60,duration=(setup.bounds.max-setup.bounds.min)/state.speed;
 if(!(duration>0)||duration>600)throw Error('Export duration must be between 0 and 600 seconds.');
 const count=Math.max(1,Math.ceil(duration*fps)),job=status(),output=path.join(folder,job.filename),temp=path.join(folder,'render.part.mp4');
 encoder=spawn(process.env.OBM_FFMPEG||'/opt/homebrew/bin/ffmpeg',['-y','-v','error','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r',String(fps),'-g',String(fps),'-movflags','+faststart','-video_track_timescale','30000',temp],{stdio:['pipe','ignore','pipe']});
 let stderr='';encoder.stderr.on('data',chunk=>stderr+=chunk);encoder.stdin.on('error',()=>{});let code=null;const closed=once(encoder,'close').then(([exit])=>{code=exit;return exit});
 for(let i=0;i<count;i++){
  if(cancelled||fs.existsSync(path.join(folder,'cancel')))throw Error('Export cancelled');
  if(code!==null)throw Error(stderr||'Video encoder exited early.');
  const t=Math.min(setup.bounds.max,setup.bounds.min+i/fps*state.speed),png=await page.evaluate(t=>window.__renderMovieFrame(t),t);
  if(!encoder.stdin.write(Buffer.from(png,'base64')))await Promise.race([once(encoder.stdin,'drain'),closed.then(()=>{throw Error(stderr||'Video encoder stopped')})]);
  if(i%(fps/2)===0)update({progress:(i+1)/count});
 }
 encoder.stdin.end();if(await closed!==0)throw Error(stderr||'Video encoding failed');
 fs.renameSync(temp,output);update({status:'completed',progress:1,frames:count,fps,duration:count/fps,bytes:fs.statSync(output).size});
})().catch(error=>{console.error(error.stack||error.message);if(!cancelled&&!fs.existsSync(path.join(folder,'cancel')))update({status:'failed',error:error.message});process.exitCode=1}).finally(async()=>{if(encoder&&codeSafe(encoder))encoder.kill();await browser?.close()});
function codeSafe(process){return process.exitCode===null}
