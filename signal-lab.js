(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const ROLES = ['HOME','COIL','ROUTINE','GREEN','MEASURE','CORRECT','FAULT','RUPTURE','ARCHITECTURE','RETURN','SHUTDOWN'];
const MATERIALS = ['BODY','CRACK','LATTICE','LIQUID','FULL_BAND','GRAIN','ATTACK','GESTURE','CELL','PHRASE','SECTION'];
const STORAGE = 'pirate-radio-signal-lab-v1';
const state = {
  file:null, buffer:null, audioCtx:null, source:null, loopTimer:null,
  duration:0, playhead:0, a:0, b:1, looping:false,
  viewStart:0, viewEnd:1, zoom:1, view:'raw', snap:'beat', bpm:174,
  pointers:[], activePointer:-1, tags:new Set(), transients:[],
  touches:new Map(), gesture:null, dragKind:null, dragStart:null, lastTap:0,
  sourceId:null, peaks:null
};

function fmt(t){
  t=Math.max(0,t||0); const m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
function beatSec(){ return 60/state.bpm; }
function snapTime(t){
  t=clamp(t,0,state.duration||0);
  if(state.snap==='free') return t;
  if(state.snap==='beat') return Math.round(t/beatSec())*beatSec();
  if(state.snap==='16th') return Math.round(t/(beatSec()/4))*(beatSec()/4);
  if(state.snap==='transient' && state.transients.length){
    let best=state.transients[0],d=Math.abs(best-t);
    for(const x of state.transients){ const q=Math.abs(x-t); if(q<d){best=x;d=q;} }
    return best;
  }
  return t;
}
function ensureSelection(){
  if(!state.duration) return;
  state.a=clamp(state.a,0,state.duration);
  state.b=clamp(state.b,0,state.duration);
  if(state.b<state.a)[state.a,state.b]=[state.b,state.a];
  if(state.b-state.a<.012) state.b=clamp(state.a+.012,0,state.duration);
}
function currentRange(){
  let a=state.a,b=state.b;
  const len=Math.max(.012,b-a);
  if(state.view==='attack') b=Math.min(b,a+Math.min(.35,len*.28));
  if(state.view==='tail') a=Math.max(a,b-Math.min(.70,len*.42));
  if(state.view==='grain'){
    const c=(a+b)/2,d=Math.min(.065,len*.25); a=Math.max(0,c-d/2); b=Math.min(state.duration,c+d/2);
  }
  return [a,b];
}
function saveLocal(){
  try{localStorage.setItem(STORAGE,JSON.stringify({pointers:state.pointers,bpm:state.bpm,sourceId:state.sourceId}));}catch(_){ }
}
function loadLocal(){
  try{const x=JSON.parse(localStorage.getItem(STORAGE)||'{}');state.pointers=Array.isArray(x.pointers)?x.pointers:[];if(x.bpm)state.bpm=Number(x.bpm)||174;}catch(_){ }
}

function initTags(){
  const mk=(root,tags)=>{root.innerHTML=''; for(const tag of tags){const b=document.createElement('button');b.className='chip';b.textContent=tag;b.dataset.tag=tag;b.onclick=()=>{state.tags.has(tag)?state.tags.delete(tag):state.tags.add(tag);b.classList.toggle('active',state.tags.has(tag));};root.appendChild(b)}};
  mk($('#roleTags'),ROLES); mk($('#materialTags'),MATERIALS);
}
function syncTagButtons(){ $$('.chip').forEach(b=>b.classList.toggle('active',state.tags.has(b.dataset.tag))); }

async function audioContext(){
  if(!state.audioCtx) state.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(state.audioCtx.state==='suspended') await state.audioCtx.resume();
  return state.audioCtx;
}
function stopAudio(){
  if(state.source){try{state.source.onended=null;state.source.stop();}catch(_){} state.source=null;}
  if(state.loopTimer){clearTimeout(state.loopTimer);state.loopTimer=null;}
  $('#playBtn').textContent='▶ PLAY';
}
async function playRange(a,b,loop=state.looping){
  if(!state.buffer) return;
  stopAudio(); const ctx=await audioContext();
  const s=ctx.createBufferSource(),g=ctx.createGain(); s.buffer=state.buffer; s.connect(g).connect(ctx.destination);
  const len=Math.max(.012,b-a); s.start(0,a,len); state.source=s; $('#playBtn').textContent='■ STOP';
  const started=performance.now(),tick=()=>{
    if(state.source!==s)return; state.playhead=clamp(a+(performance.now()-started)/1000,a,b); updateRead(); drawOverlay(); requestAnimationFrame(tick);
  }; requestAnimationFrame(tick);
  s.onended=()=>{if(state.source!==s)return;state.source=null;if(loop){state.playhead=a;state.loopTimer=setTimeout(()=>playRange(a,b,true),18)}else{$('#playBtn').textContent='▶ PLAY';state.playhead=b;updateRead();drawOverlay();}};
}

function makePeaks(buffer,bins=4096){
  const out=new Float32Array(bins*2),ch=buffer.numberOfChannels,frames=buffer.length,step=Math.max(1,Math.floor(frames/bins));
  for(let i=0;i<bins;i++){let mn=1,mx=-1;const from=i*step,to=Math.min(frames,from+step);for(let c=0;c<ch;c++){const d=buffer.getChannelData(c);for(let j=from;j<to;j+=Math.max(1,Math.floor(step/80))){const v=d[j];if(v<mn)mn=v;if(v>mx)mx=v;}}out[i*2]=mn;out[i*2+1]=mx;}
  return out;
}
function detectTransients(buffer){
  const d=buffer.getChannelData(0),sr=buffer.sampleRate,hop=Math.max(64,Math.floor(sr*.010)),win=Math.max(hop,Math.floor(sr*.025));
  const env=[]; for(let i=0;i<d.length-win;i+=hop){let e=0;for(let j=0;j<win;j+=8){const v=d[i+j];e+=v*v;}env.push(e/(win/8));}
  const diff=[]; for(let i=1;i<env.length;i++)diff.push(Math.max(0,env[i]-env[i-1]));
  const sorted=[...diff].sort((a,b)=>a-b),thr=(sorted[Math.floor(sorted.length*.91)]||0)*.9; const hits=[];let last=-99;
  for(let i=1;i<diff.length-1;i++){if(diff[i]>thr&&diff[i]>=diff[i-1]&&diff[i]>=diff[i+1]){const t=(i+1)*hop/sr;if(t-last>.055){hits.push(t);last=t;}}}
  return hits;
}

async function loadFile(file){
  stopAudio(); state.file=file; $('#fileName').textContent=`Decoding ${file.name}…`;
  const ctx=await audioContext();
  try{
    const bytes=await file.arrayBuffer(); state.buffer=await ctx.decodeAudioData(bytes.slice(0)); state.duration=state.buffer.duration;
    state.sourceId=`local:${file.name}:${file.size}:${file.lastModified||0}`; state.peaks=makePeaks(state.buffer); state.transients=detectTransients(state.buffer);
    state.playhead=0;state.a=0;state.b=Math.min(state.duration,beatSec()*4);state.viewStart=0;state.viewEnd=Math.min(state.duration,Math.max(8,beatSec()*16));state.zoom=state.duration/(state.viewEnd-state.viewStart);
    $('#fileName').textContent=`${file.name} · ${fmt(state.duration)} · ${(state.buffer.sampleRate/1000).toFixed(1)} kHz · ${state.transients.length} attacks`;
    $$('button').forEach(b=>{if(['prevPointer','nextPointer','auditionPointer','exportBtn','clearBtn','resumeBtn'].includes(b.id))return;b.disabled=false;});
    renderPointers(); updateRead(); resizeAndDraw();
  }catch(e){$('#fileName').textContent='Could not decode this audio: '+e.message;}
}

function visibleDuration(){return Math.max(.1,state.viewEnd-state.viewStart)}
function xToTime(x,w){return state.viewStart+clamp(x/w,0,1)*visibleDuration()}
function timeToX(t,w){return (t-state.viewStart)/visibleDuration()*w}
function setView(center,dur){
  if(!state.duration)return; dur=clamp(dur,.12,state.duration); let a=center-dur/2,b=center+dur/2;if(a<0){b-=a;a=0}if(b>state.duration){a-=b-state.duration;b=state.duration}state.viewStart=Math.max(0,a);state.viewEnd=Math.min(state.duration,b);drawAll();
}
function zoom(factor,center=state.playhead||((state.viewStart+state.viewEnd)/2)){setView(center,visibleDuration()*factor)}
function ensureVisible(t){if(t<state.viewStart||t>state.viewEnd)setView(t,visibleDuration())}

function resizeCanvas(c){const r=c.parentElement.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.style.width=r.width+'px';c.style.height=r.height+'px';const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:r.width,h:r.height};}
function drawWave(){
  if(!state.buffer)return; const {ctx,w,h}=resizeCanvas($('#wave'));ctx.clearRect(0,0,w,h);ctx.fillStyle='#030709';ctx.fillRect(0,0,w,h);
  const mid=h/2,amp=h*.44;ctx.strokeStyle='#4eb8bd';ctx.lineWidth=1;ctx.beginPath();
  const bins=state.peaks.length/2;for(let x=0;x<w;x++){const t0=xToTime(x,w),t1=xToTime(x+1,w),i0=clamp(Math.floor(t0/state.duration*bins),0,bins-1),i1=clamp(Math.ceil(t1/state.duration*bins),i0+1,bins);let mn=1,mx=-1;for(let i=i0;i<i1;i++){mn=Math.min(mn,state.peaks[i*2]);mx=Math.max(mx,state.peaks[i*2+1]);}ctx.moveTo(x,mid-mx*amp);ctx.lineTo(x,mid-mn*amp);}ctx.stroke();
  const beat=beatSec(),six=beat/4;ctx.lineWidth=1;for(let t=Math.ceil(state.viewStart/six)*six;t<state.viewEnd;t+=six){const x=timeToX(t,w),n=Math.round(t/six);ctx.strokeStyle=n%4===0?'#304d56':'#18282e';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  if(state.snap==='transient'){ctx.strokeStyle='#5b4030';ctx.globalAlpha=.45;for(const t of state.transients){if(t<state.viewStart||t>state.viewEnd)continue;const x=timeToX(t,w);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}ctx.globalAlpha=1;}
}
function drawOverlay(){
  if(!state.buffer)return; const {ctx,w,h}=resizeCanvas($('#overlay'));ctx.clearRect(0,0,w,h);const ax=timeToX(state.a,w),bx=timeToX(state.b,w),px=timeToX(state.playhead,w);
  ctx.fillStyle='#e6c96c22';ctx.fillRect(ax,0,bx-ax,h);ctx.strokeStyle='#e6c96c';ctx.lineWidth=2;ctx.strokeRect(ax,1,bx-ax,h-2);
  const handle=18;ctx.fillStyle='#e6c96c';ctx.fillRect(ax-handle/2,0,handle,34);ctx.fillRect(bx-handle/2,h-34,handle,34);ctx.fillStyle='#05080b';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText('A',ax,21);ctx.fillText('B',bx,h-12);
  ctx.strokeStyle='#77e6eb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,h);ctx.stroke();
  const [va,vb]=currentRange(); if(state.view!=='raw'){ctx.fillStyle='#77e6eb16';ctx.fillRect(timeToX(va,w),0,timeToX(vb,w)-timeToX(va,w),h);}
}
function drawAll(){drawWave();drawOverlay()}
function resizeAndDraw(){requestAnimationFrame(drawAll)}

function updateRead(){
  $('#timeRead').textContent=fmt(state.playhead);$('#bpmRead').textContent=state.bpm.toFixed(2);$('#snapRead').textContent=state.snap.toUpperCase();$('#viewRead').textContent=state.view.toUpperCase();$('#pointerCount').textContent=state.pointers.length;
  const [va,vb]=currentRange();$('#pointerMeta').textContent=`A ${fmt(state.a)} · B ${fmt(state.b)} · ${((state.b-state.a)*1000).toFixed(0)} ms · audition ${fmt(va)}–${fmt(vb)}`;
}

function screenPoint(e){const r=$('#waveWrap').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height}}
function hitKind(p){const ax=timeToX(state.a,p.w),bx=timeToX(state.b,p.w),tol=28;if(Math.abs(p.x-ax)<tol)return'a';if(Math.abs(p.x-bx)<tol)return'b';if(p.x>ax&&p.x<bx)return'selection';return'playhead';}
function onPointerDown(e){if(!state.buffer)return;$('#waveWrap').setPointerCapture?.(e.pointerId);const p=screenPoint(e);state.touches.set(e.pointerId,p);if(state.touches.size===1){state.dragKind=hitKind(p);state.dragStart={p,a:state.a,b:state.b,playhead:state.playhead,viewStart:state.viewStart,viewEnd:state.viewEnd};}else if(state.touches.size===2){const pts=[...state.touches.values()];state.gesture={dist:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),centerX:(pts[0].x+pts[1].x)/2,dur:visibleDuration(),centerT:xToTime((pts[0].x+pts[1].x)/2,p.w),a:state.a,b:state.b};state.dragKind='pinch';}e.preventDefault();}
function onPointerMove(e){if(!state.buffer||!state.touches.has(e.pointerId))return;const p=screenPoint(e);state.touches.set(e.pointerId,p);if(state.touches.size>=2&&state.gesture){const pts=[...state.touches.values()].slice(0,2),dist=Math.max(10,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),cx=(pts[0].x+pts[1].x)/2,ratio=state.gesture.dist/dist,newDur=clamp(state.gesture.dur*ratio,.12,state.duration),shift=(state.gesture.centerX-cx)/p.w*newDur;setView(state.gesture.centerT+shift,newDur);return;}
  const t=snapTime(xToTime(p.x,p.w));if(state.dragKind==='a'){state.a=Math.min(t,state.b-.012);state.playhead=state.a;}else if(state.dragKind==='b'){state.b=Math.max(t,state.a+.012);state.playhead=state.b;}else if(state.dragKind==='selection'){const dt=xToTime(p.x,p.w)-xToTime(state.dragStart.p.x,p.w),len=state.dragStart.b-state.dragStart.a;let a=clamp(state.dragStart.a+dt,0,state.duration-len);state.a=snapTime(a);state.b=clamp(state.a+len,0,state.duration);state.playhead=state.a;}else{state.playhead=t;}ensureSelection();updateRead();drawOverlay();e.preventDefault();}
function onPointerUp(e){if(!state.buffer)return;const p=screenPoint(e),was=state.dragKind;state.touches.delete(e.pointerId);if(state.touches.size<2)state.gesture=null;if(state.touches.size===0){if(was==='playhead'&&Math.abs(p.x-state.dragStart.p.x)<8){const now=performance.now();state.playhead=snapTime(xToTime(p.x,p.w));if(now-state.lastTap<330){state.looping=!state.looping;$('#loopBtn').classList.toggle('gold',state.looping);if(state.looping)playRange(...currentRange(),true);}state.lastTap=now;ensureVisible(state.playhead);}state.dragKind=null;updateRead();drawAll();}e.preventDefault();}

function commitPointer(){
  if(!state.buffer)return; ensureSelection();const id=`ptr_${String(state.pointers.length+1).padStart(3,'0')}`;const p={id,source:state.sourceId,file_name:state.file?.name||null,start:+state.a.toFixed(6),end:+state.b.toFixed(6),duration:+(state.b-state.a).toFixed(6),view:state.view,bpm:state.bpm,snap:state.snap,tags:[...state.tags],created_at:new Date().toISOString(),parent:'SOURCE'};state.pointers.push(p);state.activePointer=state.pointers.length-1;saveLocal();renderPointers();$('#pointerTitle').textContent=id;}
function activatePointer(i,audition=false){if(!state.pointers.length)return;i=(i+state.pointers.length)%state.pointers.length;state.activePointer=i;const p=state.pointers[i];state.a=p.start;state.b=p.end;state.view=p.view||'raw';state.tags=new Set(p.tags||[]);state.playhead=state.a;ensureVisible((state.a+state.b)/2);syncTagButtons();syncModes();renderPointers();updateRead();drawAll();if(audition)playRange(...currentRange(),false);}
function renderPointers(){
  $('#pointerCount').textContent=state.pointers.length;const root=$('#pointerList');root.innerHTML='';if(!state.pointers.length){root.innerHTML='<div class="sub">No pointers yet. Mark A/B, tag, then SAVE.</div>';return;}
  state.pointers.forEach((p,i)=>{const d=document.createElement('div');d.className='pitem'+(i===state.activePointer?' active':'');const txt=document.createElement('div');txt.innerHTML=`<strong>${p.id} · ${p.view.toUpperCase()}</strong><small>${fmt(p.start)} → ${fmt(p.end)} · ${(p.tags||[]).join(' / ')||'untagged'}</small>`;const b=document.createElement('button');b.textContent='LOAD';b.onclick=()=>activatePointer(i,true);d.append(txt,b);root.appendChild(d);});
}
function exportMap(){
  const map={version:'pirate-radio-signal-map-v1',source:{id:state.sourceId,file_name:state.file?.name||null,duration:state.duration||null},tempo:{bpm:state.bpm,grid:'1/16'},pointers:state.pointers};const blob=new Blob([JSON.stringify(map,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='signal-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
function syncModes(){
  $$('#viewModes .mode').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));$$('#snapModes .mode').forEach(b=>b.classList.toggle('active',b.dataset.snap===state.snap));updateRead();
}

$('#fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadFile(f)});
$('#resumeBtn').onclick=()=>audioContext();
$('#playBtn').onclick=()=>{if(state.source)stopAudio();else playRange(...currentRange(),state.looping)};
$('#aBtn').onclick=()=>{state.a=snapTime(state.playhead);ensureSelection();updateRead();drawAll()};
$('#bBtn').onclick=()=>{state.b=snapTime(state.playhead);ensureSelection();updateRead();drawAll()};
$('#loopBtn').onclick=()=>{state.looping=!state.looping;$('#loopBtn').classList.toggle('gold',state.looping);if(state.looping)playRange(...currentRange(),true);else stopAudio()};
$('#commitBtn').onclick=commitPointer;
$('#prevBeat').onclick=()=>{state.playhead=snapTime(state.playhead-beatSec());ensureVisible(state.playhead);updateRead();drawAll()};
$('#nextBeat').onclick=()=>{state.playhead=snapTime(state.playhead+beatSec());ensureVisible(state.playhead);updateRead();drawAll()};
$('#zoomIn').onclick=()=>zoom(.55);$('#zoomOut').onclick=()=>zoom(1.8);
$('#viewModes').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;state.view=b.dataset.view;syncModes();drawAll()};
$('#snapModes').onclick=e=>{const b=e.target.closest('[data-snap]');if(!b)return;state.snap=b.dataset.snap;syncModes();drawAll()};
$('#prevPointer').onclick=()=>activatePointer(state.activePointer-1,true);$('#nextPointer').onclick=()=>activatePointer(state.activePointer+1,true);$('#auditionPointer').onclick=()=>{if(state.activePointer>=0)activatePointer(state.activePointer,true);else if(state.buffer)playRange(...currentRange(),false)};
$('#exportBtn').onclick=exportMap;$('#clearBtn').onclick=()=>{if(!confirm('Clear saved pointer map on this device?'))return;state.pointers=[];state.activePointer=-1;saveLocal();renderPointers();};
const wrap=$('#waveWrap');wrap.addEventListener('pointerdown',onPointerDown);wrap.addEventListener('pointermove',onPointerMove);wrap.addEventListener('pointerup',onPointerUp);wrap.addEventListener('pointercancel',onPointerUp);
window.addEventListener('resize',resizeAndDraw);

loadLocal();initTags();renderPointers();syncModes();updateRead();
})();
