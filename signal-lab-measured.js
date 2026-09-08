(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const STORAGE='pirate-radio-signal-lab-v2';
const PC=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const state={
  file:null,buffer:null,audioCtx:null,source:null,loopTimer:null,duration:0,playhead:0,a:0,b:1,looping:false,
  viewStart:0,viewEnd:1,view:'raw',snap:'free',bpm:174,pointers:[],activePointer:-1,transients:[],
  touches:new Map(),gesture:null,dragKind:null,dragStart:null,lastTap:0,sourceId:null,peaks:null,metrics:null
};
function fmt(t){t=Math.max(0,t||0);const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;}
function db(x){return 20*Math.log10(Math.max(1e-12,x));}
function beatSec(){return 60/state.bpm;}
function currentRange(){
  let a=state.a,b=state.b,len=Math.max(.012,b-a);
  if(state.view==='attack') b=Math.min(b,a+Math.min(.35,len*.28));
  if(state.view==='tail') a=Math.max(a,b-Math.min(.7,len*.42));
  if(state.view==='grain'){const c=(a+b)/2,d=Math.min(.065,len*.25);a=Math.max(0,c-d/2);b=Math.min(state.duration,c+d/2);}
  return[a,b];
}
function snapTime(t){
  t=clamp(t,0,state.duration||0);
  if(state.snap==='free')return t;
  if(state.snap==='beat')return Math.round(t/beatSec())*beatSec();
  if(state.snap==='16th')return Math.round(t/(beatSec()/4))*(beatSec()/4);
  if(state.snap==='transient'&&state.transients.length){
    let best=state.transients[0],d=Math.abs(best-t);
    for(const x of state.transients){const q=Math.abs(x-t);if(q<d){best=x;d=q;}}
    return best;
  }
  return t;
}
function ensureSelection(){
  if(!state.duration)return;
  state.a=clamp(state.a,0,state.duration);state.b=clamp(state.b,0,state.duration);
  if(state.b<state.a)[state.a,state.b]=[state.b,state.a];
  if(state.b-state.a<.012)state.b=clamp(state.a+.012,0,state.duration);
}
function saveLocal(){try{localStorage.setItem(STORAGE,JSON.stringify({pointers:state.pointers,bpm:state.bpm}))}catch(_){}}
function loadLocal(){try{const x=JSON.parse(localStorage.getItem(STORAGE)||'{}');state.pointers=Array.isArray(x.pointers)?x.pointers:[];if(x.bpm)state.bpm=Number(x.bpm)||174}catch(_){}}
async function audioContext(){if(!state.audioCtx)state.audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(state.audioCtx.state==='suspended')await state.audioCtx.resume();return state.audioCtx;}
function stopAudio(){if(state.source){try{state.source.onended=null;state.source.stop()}catch(_){}state.source=null}if(state.loopTimer){clearTimeout(state.loopTimer);state.loopTimer=null}$('#playBtn').textContent='▶ PLAY';}
async function playRange(a,b,loop=state.looping){
  if(!state.buffer)return;stopAudio();const ctx=await audioContext(),s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=state.buffer;s.connect(g).connect(ctx.destination);
  const len=Math.max(.012,b-a);s.start(0,a,len);state.source=s;$('#playBtn').textContent='■ STOP';const started=performance.now();
  const tick=()=>{if(state.source!==s)return;state.playhead=clamp(a+(performance.now()-started)/1000,a,b);updateRead();drawOverlay();requestAnimationFrame(tick)};requestAnimationFrame(tick);
  s.onended=()=>{if(state.source!==s)return;state.source=null;if(loop){state.playhead=a;state.loopTimer=setTimeout(()=>playRange(a,b,true),18)}else{$('#playBtn').textContent='▶ PLAY';state.playhead=b;updateRead();drawOverlay()}};
}
function makePeaks(buffer,bins=4096){
  const out=new Float32Array(bins*2),ch=buffer.numberOfChannels,frames=buffer.length,step=Math.max(1,Math.floor(frames/bins));
  for(let i=0;i<bins;i++){let mn=1,mx=-1,from=i*step,to=Math.min(frames,from+step),stride=Math.max(1,Math.floor(step/80));for(let c=0;c<ch;c++){const d=buffer.getChannelData(c);for(let j=from;j<to;j+=stride){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v}}out[i*2]=mn;out[i*2+1]=mx}return out;
}
function detectTransients(buffer){
  const d=buffer.getChannelData(0),sr=buffer.sampleRate,hop=Math.max(64,Math.floor(sr*.010)),win=Math.max(hop,Math.floor(sr*.025)),env=[];
  for(let i=0;i<d.length-win;i+=hop){let e=0;for(let j=0;j<win;j+=8){const v=d[i+j];e+=v*v}env.push(e/(win/8))}
  const diff=[];for(let i=1;i<env.length;i++)diff.push(Math.max(0,env[i]-env[i-1]));const sorted=[...diff].sort((a,b)=>a-b),thr=(sorted[Math.floor(sorted.length*.91)]||0)*.9,hits=[];let last=-99;
  for(let i=1;i<diff.length-1;i++)if(diff[i]>thr&&diff[i]>=diff[i-1]&&diff[i]>=diff[i+1]){const t=(i+1)*hop/sr;if(t-last>.055){hits.push(t);last=t}}return hits;
}
async function loadFile(file){
  stopAudio();state.file=file;$('#fileName').textContent=`Decoding ${file.name}…`;const ctx=await audioContext();
  try{
    const bytes=await file.arrayBuffer();state.buffer=await ctx.decodeAudioData(bytes.slice(0));state.duration=state.buffer.duration;state.sourceId=`local:${file.name}:${file.size}:${file.lastModified||0}`;
    state.peaks=makePeaks(state.buffer);state.transients=detectTransients(state.buffer);state.playhead=0;state.a=0;state.b=Math.min(state.duration,4);state.viewStart=0;state.viewEnd=Math.min(state.duration,8);state.metrics=null;
    $('#fileName').textContent=`${file.name} · ${fmt(state.duration)} · ${(state.buffer.sampleRate/1000).toFixed(1)} kHz · ${state.transients.length} detected attacks`;
    $$('button').forEach(b=>{if(['prevPointer','nextPointer','auditionPointer','exportBtn','clearBtn','resumeBtn'].includes(b.id))return;b.disabled=false});
    renderPointers();clearMetrics();updateRead();resizeAndDraw();
  }catch(e){$('#fileName').textContent='Could not decode this audio: '+e.message}
}
function visibleDuration(){return Math.max(.1,state.viewEnd-state.viewStart)}
function xToTime(x,w){return state.viewStart+clamp(x/w,0,1)*visibleDuration()}
function timeToX(t,w){return(t-state.viewStart)/visibleDuration()*w}
function setView(center,dur){if(!state.duration)return;dur=clamp(dur,.12,state.duration);let a=center-dur/2,b=center+dur/2;if(a<0){b-=a;a=0}if(b>state.duration){a-=b-state.duration;b=state.duration}state.viewStart=Math.max(0,a);state.viewEnd=Math.min(state.duration,b);drawAll()}
function zoom(factor,center=state.playhead||((state.viewStart+state.viewEnd)/2)){setView(center,visibleDuration()*factor)}
function ensureVisible(t){if(t<state.viewStart||t>state.viewEnd)setView(t,visibleDuration())}
function resizeCanvas(c){const r=c.parentElement.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.style.width=r.width+'px';c.style.height=r.height+'px';const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w:r.width,h:r.height}}
function drawWave(){
  if(!state.buffer)return;const{ctx,w,h}=resizeCanvas($('#wave'));ctx.clearRect(0,0,w,h);ctx.fillStyle='#030709';ctx.fillRect(0,0,w,h);const mid=h/2,amp=h*.44;ctx.strokeStyle='#4eb8bd';ctx.lineWidth=1;ctx.beginPath();
  const bins=state.peaks.length/2;for(let x=0;x<w;x++){const t0=xToTime(x,w),t1=xToTime(x+1,w),i0=clamp(Math.floor(t0/state.duration*bins),0,bins-1),i1=clamp(Math.ceil(t1/state.duration*bins),i0+1,bins);let mn=1,mx=-1;for(let i=i0;i<i1;i++){mn=Math.min(mn,state.peaks[i*2]);mx=Math.max(mx,state.peaks[i*2+1])}ctx.moveTo(x,mid-mx*amp);ctx.lineTo(x,mid-mn*amp)}ctx.stroke();
  if(state.snap!=='free'){const unit=state.snap==='16th'?beatSec()/4:beatSec();ctx.lineWidth=1;for(let t=Math.ceil(state.viewStart/unit)*unit;t<state.viewEnd;t+=unit){const x=timeToX(t,w),n=Math.round(t/unit);ctx.strokeStyle=(state.snap==='16th'&&n%4!==0)?'#18282e':'#304d56';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}}
  if(state.snap==='transient'){ctx.strokeStyle='#5b4030';ctx.globalAlpha=.45;for(const t of state.transients){if(t<state.viewStart||t>state.viewEnd)continue;const x=timeToX(t,w);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}ctx.globalAlpha=1}
}
function drawOverlay(){
  if(!state.buffer)return;const{ctx,w,h}=resizeCanvas($('#overlay'));ctx.clearRect(0,0,w,h);const ax=timeToX(state.a,w),bx=timeToX(state.b,w),px=timeToX(state.playhead,w);ctx.fillStyle='#e6c96c22';ctx.fillRect(ax,0,bx-ax,h);ctx.strokeStyle='#e6c96c';ctx.lineWidth=2;ctx.strokeRect(ax,1,bx-ax,h-2);
  const handle=18;ctx.fillStyle='#e6c96c';ctx.fillRect(ax-handle/2,0,handle,34);ctx.fillRect(bx-handle/2,h-34,handle,34);ctx.fillStyle='#05080b';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText('A',ax,21);ctx.fillText('B',bx,h-12);
  ctx.strokeStyle='#77e6eb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,h);ctx.stroke();const[va,vb]=currentRange();if(state.view!=='raw'){ctx.fillStyle='#77e6eb16';ctx.fillRect(timeToX(va,w),0,timeToX(vb,w)-timeToX(va,w),h)}
}
function drawAll(){drawWave();drawOverlay()}
function resizeAndDraw(){requestAnimationFrame(drawAll)}
function updateRead(){
  $('#timeRead').textContent=fmt(state.playhead);$('#snapRead').textContent=state.snap.toUpperCase();$('#viewRead').textContent=state.view.toUpperCase();$('#pointerCount').textContent=state.pointers.length;
  const[va,vb]=currentRange();$('#pointerMeta').textContent=`A ${fmt(state.a)} · B ${fmt(state.b)} · ${((state.b-state.a)*1000).toFixed(0)} ms · audition ${fmt(va)}–${fmt(vb)}`;
}
function screenPoint(e){const r=$('#waveWrap').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height}}
function hitKind(p){const ax=timeToX(state.a,p.w),bx=timeToX(state.b,p.w),tol=28;if(Math.abs(p.x-ax)<tol)return'a';if(Math.abs(p.x-bx)<tol)return'b';if(p.x>ax&&p.x<bx)return'selection';return'playhead'}
function invalidateMetrics(){state.metrics=null;$('#measureStatus').textContent='selection changed';}
function onPointerDown(e){
  if(!state.buffer)return;$('#waveWrap').setPointerCapture?.(e.pointerId);const p=screenPoint(e);state.touches.set(e.pointerId,p);
  if(state.touches.size===1){state.dragKind=hitKind(p);state.dragStart={p,a:state.a,b:state.b,playhead:state.playhead}}
  else if(state.touches.size===2){const pts=[...state.touches.values()];state.gesture={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),centerX:(pts[0].x+pts[1].x)/2,dur:visibleDuration(),centerT:xToTime((pts[0].x+pts[1].x)/2,p.w)};state.dragKind='pinch'}e.preventDefault();
}
function onPointerMove(e){
  if(!state.buffer||!state.touches.has(e.pointerId))return;const p=screenPoint(e);state.touches.set(e.pointerId,p);
  if(state.touches.size>=2&&state.gesture){const pts=[...state.touches.values()].slice(0,2),dist=Math.max(10,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),cx=(pts[0].x+pts[1].x)/2,ratio=state.gesture.dist/dist,newDur=clamp(state.gesture.dur*ratio,.12,state.duration),shift=(state.gesture.centerX-cx)/p.w*newDur;setView(state.gesture.centerT+shift,newDur);return}
  const t=snapTime(xToTime(p.x,p.w));if(state.dragKind==='a'){state.a=Math.min(t,state.b-.012);state.playhead=state.a;invalidateMetrics()}else if(state.dragKind==='b'){state.b=Math.max(t,state.a+.012);state.playhead=state.b;invalidateMetrics()}else if(state.dragKind==='selection'){const dt=xToTime(p.x,p.w)-xToTime(state.dragStart.p.x,p.w),len=state.dragStart.b-state.dragStart.a;let a=clamp(state.dragStart.a+dt,0,state.duration-len);state.a=snapTime(a);state.b=clamp(state.a+len,0,state.duration);state.playhead=state.a;invalidateMetrics()}else state.playhead=t;
  ensureSelection();updateRead();drawOverlay();e.preventDefault();
}
function onPointerUp(e){
  if(!state.buffer)return;const p=screenPoint(e),was=state.dragKind;state.touches.delete(e.pointerId);if(state.touches.size<2)state.gesture=null;
  if(state.touches.size===0){if(was==='playhead'&&Math.abs(p.x-state.dragStart.p.x)<8){const now=performance.now();state.playhead=snapTime(xToTime(p.x,p.w));if(now-state.lastTap<330){state.looping=!state.looping;$('#loopBtn').classList.toggle('gold',state.looping);if(state.looping)playRange(...currentRange(),true)}state.lastTap=now;ensureVisible(state.playhead)}state.dragKind=null;updateRead();drawAll()}e.preventDefault();
}
function fft(re,im){
  const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
  for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wlr=Math.cos(ang),wli=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const uR=re[i+j],uI=im[i+j],vR=re[i+j+len/2]*wr-im[i+j+len/2]*wi,vI=re[i+j+len/2]*wi+im[i+j+len/2]*wr;re[i+j]=uR+vR;im[i+j]=uI+vI;re[i+j+len/2]=uR-vR;im[i+j+len/2]=uI-vI;const nw=wr*wlr-wi*wli;wi=wr*wli+wi*wlr;wr=nw}}}
}
function metricVector(m){return[m.rms_db,m.crest,m.onsets_per_s,Math.log1p(m.centroid_hz),m.flatness,m.low_ratio,m.mid_ratio,m.high_ratio,m.stereo_width,m.chroma_entropy]}
function nearestPointer(m){
  const v=metricVector(m),eligible=state.pointers.filter(p=>p.metrics);if(!eligible.length)return null;let best=null,bd=Infinity;
  for(const p of eligible){const u=metricVector(p.metrics);let d=0;for(let i=0;i<v.length;i++){const scale=[20,3,5,2,.2,.5,.5,.5,2,.5][i];d+=((v[i]-u[i])/scale)**2}if(d<bd){bd=d;best=p}}
  return best?{id:best.id,distance:+Math.sqrt(bd).toFixed(4)}:null;
}
function measureSelection(){
  if(!state.buffer)return null;const[a,b]=currentRange(),sr=state.buffer.sampleRate,from=Math.floor(a*sr),to=Math.max(from+1,Math.floor(b*sr)),len=to-from,channels=state.buffer.numberOfChannels,stride=Math.max(1,Math.floor(len/120000));
  let sum=0,peak=0,z=0,count=0,prev=0,midE=0,sideE=0;const L=state.buffer.getChannelData(0),R=channels>1?state.buffer.getChannelData(1):L;
  for(let i=from;i<to;i+=stride){const l=L[i],r=R[i],v=(l+r)*.5;sum+=v*v;peak=Math.max(peak,Math.abs(v));if(count&&Math.sign(v)!==Math.sign(prev))z++;prev=v;count++;const mid=(l+r)*.5,side=(l-r)*.5;midE+=mid*mid;sideE+=side*side}
  const rms=Math.sqrt(sum/Math.max(1,count)),crest=peak/Math.max(1e-9,rms),duration=b-a,onsets=state.transients.filter(t=>t>=a&&t<b).length;
  const N=2048,frames=Math.min(12,Math.max(1,Math.floor(len/N))),power=new Float64Array(N/2),chroma=new Float64Array(12);
  for(let f=0;f<frames;f++){let center=from+Math.floor((f+.5)/frames*len),start=clamp(center-N/2,0,L.length-N),re=new Array(N),im=new Array(N).fill(0);for(let i=0;i<N;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(N-1));re[i]=((L[start+i]+R[start+i])*.5)*w}fft(re,im);for(let k=1;k<N/2;k++){const p=re[k]*re[k]+im[k]*im[k];power[k]+=p;const freq=k*sr/N;if(freq>=60&&freq<=5000){let midi=Math.round(69+12*Math.log2(freq/440)),pc=((midi%12)+12)%12;chroma[pc]+=p}}}
  let total=0,weighted=0,logsum=0,npos=0,lo=0,mi=0,hi=0;for(let k=1;k<N/2;k++){const p=power[k]/frames,f=k*sr/N;total+=p;weighted+=f*p;if(p>0){logsum+=Math.log(p+1e-30);npos++}if(f<180)lo+=p;else if(f<2000)mi+=p;else hi+=p}
  const centroid=weighted/Math.max(1e-20,total),flatness=Math.exp(logsum/Math.max(1,npos))/(total/Math.max(1,npos)+1e-30),bandTot=lo+mi+hi+1e-30;
  const cs=[...chroma],csum=cs.reduce((a,x)=>a+x,0)+1e-30,cp=cs.map(x=>x/csum),entropy=-cp.reduce((a,x)=>a+(x>0?x*Math.log(x):0),0)/Math.log(12),tops=cp.map((x,i)=>[x,i]).sort((a,b)=>b[0]-a[0]).slice(0,4).map(([x,i])=>`${PC[i]} ${(100*x).toFixed(0)}%`);
  const m={start:+a.toFixed(6),end:+b.toFixed(6),duration:+duration.toFixed(6),duration_beats:+(duration/beatSec()).toFixed(4),grid_phase:+((a%beatSec())/beatSec()).toFixed(4),rms_db:+db(rms).toFixed(2),peak_db:+db(peak).toFixed(2),crest:+crest.toFixed(3),zcr_per_s:+(z/duration).toFixed(2),onsets_per_s:+(onsets/duration).toFixed(3),centroid_hz:+centroid.toFixed(1),flatness:+flatness.toFixed(5),low_ratio:+(lo/bandTot).toFixed(5),mid_ratio:+(mi/bandTot).toFixed(5),high_ratio:+(hi/bandTot).toFixed(5),stereo_width:+Math.sqrt(sideE/Math.max(1e-20,midE)).toFixed(4),chroma_entropy:+entropy.toFixed(4),chroma_top:tops};
  m.nearest_saved=nearestPointer(m);state.metrics=m;showMetrics(m);return m;
}
function clearMetrics(){['mDuration','mPhase','mRms','mPeak','mCrest','mOnsets','mCentroid','mFlatness','mLow','mMid','mHigh','mWidth','mChroma','mEntropy','mNearest'].forEach(id=>$('#'+id).textContent='—');$('#measureStatus').textContent='not measured'}
function showMetrics(m){
  $('#mDuration').textContent=`${(m.duration*1000).toFixed(0)} ms / ${m.duration_beats.toFixed(2)} beats`;$('#mPhase').textContent=m.grid_phase.toFixed(3);$('#mRms').textContent=`${m.rms_db.toFixed(1)} dBFS`;$('#mPeak').textContent=`${m.peak_db.toFixed(1)} dBFS`;$('#mCrest').textContent=m.crest.toFixed(2);$('#mOnsets').textContent=m.onsets_per_s.toFixed(2);$('#mCentroid').textContent=`${m.centroid_hz.toFixed(0)} Hz`;$('#mFlatness').textContent=m.flatness.toFixed(4);$('#mLow').textContent=`${(m.low_ratio*100).toFixed(1)}%`;$('#mMid').textContent=`${(m.mid_ratio*100).toFixed(1)}%`;$('#mHigh').textContent=`${(m.high_ratio*100).toFixed(1)}%`;$('#mWidth').textContent=m.stereo_width.toFixed(2);$('#mChroma').textContent=m.chroma_top.join(' · ');$('#mEntropy').textContent=m.chroma_entropy.toFixed(3);$('#mNearest').textContent=m.nearest_saved?`${m.nearest_saved.id} / ${m.nearest_saved.distance}`:'—';$('#measureStatus').textContent='measured';
}
function commitPointer(){
  if(!state.buffer)return;const m=state.metrics||measureSelection(),id=`ptr_${String(state.pointers.length+1).padStart(3,'0')}`,p={id,source:state.sourceId,file_name:state.file?.name||null,start:+state.a.toFixed(6),end:+state.b.toFixed(6),view:state.view,bpm_grid:state.bpm,snap:state.snap,parent:'SOURCE',note:$('#noteInput').value.trim(),metrics:m,created_at:new Date().toISOString()};
  state.pointers.push(p);state.activePointer=state.pointers.length-1;saveLocal();renderPointers();$('#pointerTitle').textContent=id;
}
function activatePointer(i,audition=false){
  if(!state.pointers.length)return;i=(i+state.pointers.length)%state.pointers.length;state.activePointer=i;const p=state.pointers[i];state.a=p.start;state.b=p.end;state.view=p.view||'raw';state.playhead=state.a;state.metrics=p.metrics||null;$('#noteInput').value=p.note||'';ensureVisible((state.a+state.b)/2);syncModes();renderPointers();updateRead();state.metrics?showMetrics(state.metrics):clearMetrics();drawAll();if(audition)playRange(...currentRange(),false);
}
function renderPointers(){
  $('#pointerCount').textContent=state.pointers.length;const root=$('#pointerList');root.innerHTML='';if(!state.pointers.length){root.innerHTML='<div class="sub">No pointers yet. Measure a region, then save it.</div>';return}
  state.pointers.forEach((p,i)=>{const d=document.createElement('div');d.className='pitem'+(i===state.activePointer?' active':'');const txt=document.createElement('div'),m=p.metrics;txt.innerHTML=`<strong>${p.id} · ${(p.view||'raw').toUpperCase()}</strong><small>${fmt(p.start)} → ${fmt(p.end)}${m?` · ${m.centroid_hz.toFixed(0)} Hz · ${m.onsets_per_s.toFixed(1)} on/s`:''}${p.note?` · ${p.note}`:''}</small>`;const b=document.createElement('button');b.textContent='LOAD';b.onclick=()=>activatePointer(i,true);d.append(txt,b);root.appendChild(d)});
}
function exportMap(){
  const map={version:'pirate-radio-signal-map-v2-measured',source:{id:state.sourceId,file_name:state.file?.name||null,duration:state.duration||null,sample_rate:state.buffer?.sampleRate||null},grid:{bpm:state.bpm,snap_default:'free'},pointers:state.pointers};const blob=new Blob([JSON.stringify(map,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='signal-map-measured.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
function syncModes(){$$('#viewModes .mode').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));$$('#snapModes .mode').forEach(b=>b.classList.toggle('active',b.dataset.snap===state.snap));updateRead()}
$('#fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadFile(f)});$('#resumeBtn').onclick=()=>audioContext();$('#bpmInput').value=state.bpm;
$('#bpmInput').addEventListener('change',e=>{state.bpm=clamp(Number(e.target.value)||174,40,300);e.target.value=state.bpm.toFixed(2);saveLocal();invalidateMetrics();drawAll()});
$('#playBtn').onclick=()=>state.source?stopAudio():playRange(...currentRange(),state.looping);
$('#aBtn').onclick=()=>{state.a=snapTime(state.playhead);ensureSelection();invalidateMetrics();updateRead();drawAll()};$('#bBtn').onclick=()=>{state.b=snapTime(state.playhead);ensureSelection();invalidateMetrics();updateRead();drawAll()};
$('#loopBtn').onclick=()=>{state.looping=!state.looping;$('#loopBtn').classList.toggle('gold',state.looping);if(state.looping)playRange(...currentRange(),true);else stopAudio()};
$('#measureBtn').onclick=measureSelection;$('#commitBtn').onclick=commitPointer;
$('#prevBeat').onclick=()=>{state.playhead=snapTime(state.playhead-beatSec());ensureVisible(state.playhead);updateRead();drawAll()};$('#nextBeat').onclick=()=>{state.playhead=snapTime(state.playhead+beatSec());ensureVisible(state.playhead);updateRead();drawAll()};
$('#zoomIn').onclick=()=>zoom(.55);$('#zoomOut').onclick=()=>zoom(1.8);
$('#viewModes').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;state.view=b.dataset.view;invalidateMetrics();syncModes();drawAll()};
$('#snapModes').onclick=e=>{const b=e.target.closest('[data-snap]');if(!b)return;state.snap=b.dataset.snap;syncModes();drawAll()};
$('#prevPointer').onclick=()=>activatePointer(state.activePointer-1,true);$('#nextPointer').onclick=()=>activatePointer(state.activePointer+1,true);$('#auditionPointer').onclick=()=>{if(state.activePointer>=0)activatePointer(state.activePointer,true);else if(state.buffer)playRange(...currentRange(),false)};
$('#exportBtn').onclick=exportMap;$('#clearBtn').onclick=()=>{if(!confirm('Clear saved measured pointer map on this device?'))return;state.pointers=[];state.activePointer=-1;saveLocal();renderPointers()};
const wrap=$('#waveWrap');wrap.addEventListener('pointerdown',onPointerDown);wrap.addEventListener('pointermove',onPointerMove);wrap.addEventListener('pointerup',onPointerUp);wrap.addEventListener('pointercancel',onPointerUp);window.addEventListener('resize',resizeAndDraw);
loadLocal();$('#bpmInput').value=state.bpm.toFixed(2);renderPointers();syncModes();clearMetrics();updateRead();
})();
