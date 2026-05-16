import { dom } from './dom.js';
import { state } from './state.js';
import { config, VOICES, getSettings, saveSettings, CORE_THEMES } from './config.js';
import { showError } from './ui-helpers.js';
import { sendTextMessage } from './chat.js';
import { startListening, stopListening } from './audio-capture.js';
import { connectWebSocket } from './websocket.js';

window.onerror = function(msg, url, line, col, error) {
  console.error('[Global]', msg, error);
  showError('Xatolik: ' + (error?.message || msg));
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('[Promise]', e.reason);
  showError('Xatolik: ' + (e.reason?.message || e.reason));
});

document.getElementById('nucleusWrapper').addEventListener('click', () => {
  if (!state.isSessionActive) {
    showError('Hali ulanish tayyor emas. Kutib turing...');
    return;
  }
  if (state.isListening) {
    stopListening();
    document.getElementById('nucleusWrapper')?.classList.remove('listening');
  } else {
    startListening();
    document.getElementById('nucleusWrapper')?.classList.add('listening');
  }
});

dom.userInput.addEventListener('input', () => {
  dom.userInput.style.height = 'auto';
  dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 120) + 'px';
  dom.sendBtn.disabled = !dom.userInput.value.trim();
});

dom.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage(dom.userInput.value);
  }
});

dom.sendBtn.addEventListener('click', () => {
  sendTextMessage(dom.userInput.value);
});

console.log('[UI] Ufi Live starting...');
console.log('[UI] WebSocket URL:', config.WS_URL.slice(0, 50) + '...');
connectWebSocket();


// Settings modal
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const voiceSelect = document.getElementById('voiceSelect');
const systemPromptInput = document.getElementById('systemPromptInput');

// Populate voice dropdown
VOICES.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v.name;
  opt.textContent = v.name + ' — ' + v.desc;
  voiceSelect.appendChild(opt);
});

function openSettings() {
  const settings = getSettings();
  voiceSelect.value = settings.voiceName;
  systemPromptInput.value = settings.systemPrompt;
  settingsModal.style.display = 'flex';
}

function closeSettings() {
  settingsModal.style.display = 'none';
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
cancelSettingsBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

saveSettingsBtn.addEventListener('click', () => {
  saveSettings({
    voiceName: voiceSelect.value,
    systemPrompt: systemPromptInput.value,
    coreTheme: state.coreTheme,
    coreSpeed: state.coreSpeed,
    coreSensitivity: state.coreSensitivity,
    coreHue: state.coreHue,
  });
  closeSettings();
  showError('Sozlamalar saqlandi. Qayta ulanmoqda...');
  if (state.ws) {
    state.ws.close();
  }
});

// === Core Settings UI ===
// Load saved settings into state
const savedSet = getSettings();
if (savedSet.coreTheme) state.coreTheme = savedSet.coreTheme;
if (savedSet.coreSpeed) state.coreSpeed = savedSet.coreSpeed;
if (savedSet.coreSensitivity) state.coreSensitivity = savedSet.coreSensitivity;
if (savedSet.coreHue !== undefined) state.coreHue = savedSet.coreHue;

// Theme buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
  if (btn.dataset.theme === state.coreTheme) btn.classList.add('active');
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.coreTheme = btn.dataset.theme;
  });
});

// Range sliders — update state live
['coreSpeed','coreSensitivity','coreHue'].forEach(id => {
  const el = document.getElementById(id);
  const disp = document.getElementById(id === 'coreSpeed' ? 'speedDisp' : id === 'coreSensitivity' ? 'sensDisp' : 'hueDisp');
  if (el) {
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      state[id] = val;
      if (disp) disp.textContent = val;
    });
  }
});

// === Energy Core animation (Theme-aware) ===
const canvas = document.getElementById('nucleusCanvas');
if (canvas) {
  const SZ = 280;
  canvas.width = SZ; canvas.height = SZ;
  const ctx = canvas.getContext('2d');
  const cx = SZ/2, cy = SZ/2;
  const fl = 150;

  function hsh(n){ return ((n*1103515245+12345)&0x7fffffff)/0x7fffffff; }

  // Base shell config (positions only — colors come from theme)
  const SH = [
    {c:80, r1:5, r2:16, sz:2.8, st:85, sp:0.004},
    {c:100, r1:16, r2:26, sz:2.2, st:80, sp:0.006},
    {c:90, r1:26, r2:36, sz:1.7, st:75, sp:0.008},
    {c:60, r1:36, r2:46, sz:1.3, st:70, sp:0.010},
    {c:30, r1:46, r2:58, sz:1.0, st:65, sp:0.013},
  ];
  const N = SH.reduce((s,sh)=>s+sh.c,0);
  const P = [];
  let t=0, smE=0, pw=0, pwCD=0, micL=0, lis=0;

  let pIdx = 0;
  SH.forEach((sh,si)=>{
    for(let i=0;i<sh.c;i++){
      const id=pIdx++;
      const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
      const r=sh.r1+Math.random()*(sh.r2-sh.r1), d=(r-5)/53;
      const x=Math.sin(ph)*Math.cos(th)*r, y=Math.sin(ph)*Math.sin(th)*r, z=Math.cos(ph)*r;
      const dir=Math.random()>0.5?1:-1;
      P.push({x,y,z, hx:x,hy:y,hz:z, dr:d, si, id,
        bs:sh.sz*(0.7+Math.random()*0.6),
        st:sh.st+(Math.random()-0.5)*10,
        l:55+(Math.random()-0.5)*15,
        ph:Math.random()*Math.PI*2,
        ws:0.15+Math.random()*0.6, wa:0.5+Math.random()*4,
        os:sh.sp*(0.4+Math.random()*1.0)*dir,
        ax:Math.floor(Math.random()*3),
        wox:Math.floor(Math.random()*3),
      });
    }
  });

  // Rings (positions only)
  const ringBases = [
    {r:68, sp:0.10, w:2.5},
    {r:58, sp:-0.07, w:1.8},
    {r:78, sp:0.05, w:1.2},
    {r:48, sp:-0.12, w:1.0},
  ];

  function draw(){
    const w=document.getElementById('nucleusWrapper');
    if(w){
      const lv=parseFloat(w.style.getPropertyValue('--mic-level'))||0;
      // Apply sensitivity multiplier from state
      const sens = state.coreSensitivity || 1.0;
      micL=Math.max(micL*0.88, lv*sens);
      lis=w.classList.contains('listening');
    }
    t+=0.016;

    const uE=lis?Math.max(0.05,micL):0;
    const aE=state.isPlaying?0.6+Math.sin(t*1.5)*0.1+0.1:0;
    const tar=Math.min(1,Math.max(uE,aE));
    smE+=(tar-smE)*0.06;
    if(pwCD>0)pwCD-=0.016;
    if(tar>0.35&&smE<0.12&&pwCD<=0){pw=1;pwCD=2.0;}
    if(pw>0){pw*=0.97;if(pw<0.001)pw=0;}
    const E=smE, exp=1+E*0.3, pp=pw*0.4;

    // === READ THEME + CONTROLS ===
    const theme = (typeof CORE_THEMES !== 'undefined' && CORE_THEMES[state.coreTheme]) ? CORE_THEMES[state.coreTheme] : CORE_THEMES.nebula;
    const spd = state.coreSpeed || 1.0;
    const hueOff = state.coreHue || 0;

    // Rotation speed multiplied by coreSpeed setting
    const rY=t*(0.035+E*0.015)*spd, cY=Math.cos(rY), sY=Math.sin(rY);
    const tX=Math.sin(t*0.04)*0.15+E*0.06, cX=Math.cos(tX), sX=Math.sin(tX);
    const tZ=Math.sin(t*0.02)*0.06, cZ=Math.cos(tZ), sZ=Math.sin(tZ);

    ctx.clearRect(0,0,SZ,SZ);

    // 1. Background glow — theme-based
    const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,85+E*45);
    if(state.isPlaying){
      bg.addColorStop(0,`rgba(${theme.agentCol},${0.06+E*0.15})`);
      bg.addColorStop(0.5,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.03+E*0.08})`);
    }else if(lis&&micL>0.05){
      bg.addColorStop(0,`rgba(${theme.userCol},${0.06+E*0.15})`);
      bg.addColorStop(0.5,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.03+E*0.08})`);
    }else{
      bg.addColorStop(0,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},0.05)`);
    }
    bg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=bg; ctx.fillRect(0,0,SZ,SZ);

    // 2. Energy rings — theme-based hues
    ringBases.forEach((ring,i)=>{
      const ang=t*ring.sp, re=0.3+E*0.7;
      const rx=ring.r*(1+E*0.1), ry=ring.r*0.12;
      const hueBase=(theme.ringH[i]||280)+hueOff+(state.isPlaying?-25:lis?20:0);
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
      ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
      const g1=ctx.createLinearGradient(-rx,0,rx,0);
      const hb=hueBase; g1.addColorStop(0,`hsla(${hb-10},95%,65%,${0.05*re})`);
      g1.addColorStop(0.3,`hsla(${hb},95%,75%,${0.4*re})`);
      g1.addColorStop(0.5,`hsla(${hb+10},95%,85%,${0.6*re})`);
      g1.addColorStop(0.7,`hsla(${hb},95%,75%,${0.4*re})`);
      g1.addColorStop(1,`hsla(${hb-10},95%,65%,${0.05*re})`);
      ctx.strokeStyle=g1; ctx.lineWidth=ring.w*(0.3+E*0.8);
      ctx.globalAlpha=0.3+E*0.6; ctx.stroke(); ctx.restore();
      // Cross ring
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang+Math.PI/2);
      ctx.beginPath(); ctx.ellipse(0,0,rx*0.5,ry*2.5,0,0,Math.PI*2);
      const g2=ctx.createLinearGradient(0,-ry*2.5,0,ry*2.5);
      g2.addColorStop(0,`hsla(${hb+20},85%,60%,${0.03*re})`);
      g2.addColorStop(0.5,`hsla(${hb+30},85%,75%,${0.25*re})`);
      g2.addColorStop(1,`hsla(${hb+20},85%,60%,${0.03*re})`);
      ctx.strokeStyle=g2; ctx.lineWidth=ring.w*0.6*(0.3+E*0.6);
      ctx.globalAlpha=0.15+E*0.4; ctx.stroke(); ctx.restore();
    });

    // 3. Corona rays — theme hue
    const rc=16+Math.floor(E*20);
    ctx.shadowBlur=0;
    for(let i=0;i<rc;i++){
      const ang=t*0.2+i*Math.PI*2/rc+Math.sin(t*0.3+i)*0.3;
      const id=i*17+3;
      const len=15+hsh(id+1)*25*(1+E*2);
      const wid=0.5+hsh(id+2)*1.5*(1+E);
      const rayE=0.1+hsh(id+3)*0.4*(1+E);
      const baseHue=(theme.shellH[2]||255)+hueOff;
      const hueR=state.isPlaying?baseHue-30+hsh(id+4)*40:(lis?baseHue+20+hsh(id+4)*40:baseHue-10+hsh(id+4)*30);
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(ang)*14,cy+Math.sin(ang)*14);
      ctx.lineTo(cx+Math.cos(ang)*(14+len),cy+Math.sin(ang)*(14+len));
      ctx.strokeStyle=`hsla(${hueR},90%,70%,${rayE})`;
      ctx.lineWidth=wid; ctx.stroke();
    }

    // 4. Update particles — theme-based colors
    for(let i=0;i<N;i++){
      const p=P[i];
      const t2=t*p.ws+p.ph, wb=p.wa*(0.2+E*3.5);
      const ox=Math.sin(t2*1.3+p.wox)*wb;
      const oy=Math.cos(t2*1.1+0.5+(p.wox+1)%3)*wb;
      const oz=Math.sin(t2*0.9+1.2+(p.wox+2)%3)*wb*0.5;
      let px=(p.hx+ox)*(exp+pp/(Math.abs(p.hx)+4));
      let py=(p.hy+oy)*(exp+pp/(Math.abs(p.hy)+4));
      let pz=(p.hz+oz)*(exp+pp/(Math.abs(p.hz)+4));
      const pre=t*p.os, cP=Math.cos(pre), sP=Math.sin(pre);
      let ppx,ppy,ppz;
      if(p.ax===0){ppy=py*cP-pz*sP;ppz=py*sP+pz*cP;ppx=px;}
      else if(p.ax===1){ppx=px*cP-pz*sP;ppz=px*sP+pz*cP;ppy=py;}
      else{ppx=px*cP-py*sP;ppy=px*sP+py*cP;ppz=pz;}
      px=ppx;py=ppy;pz=ppz;
      let rx=px*cY-pz*sY, rz=px*sY+pz*cY, ry=py;
      let ry2=ry*cX-rz*sX, rz2=ry*sX+rz*cX;
      let rx3=rx*cZ-ry2*sZ, ry3=rx*sZ+ry2*cZ, rz3=rz2;
      const persp=fl/(fl+rz3), sx=cx+rx3*persp, sy=cy+ry3*persp;
      const dScl=Math.min(1,persp*1.3);
      const a=Math.min(1,0.2+dScl*0.6+E*0.35);
      const sz=Math.max(0.3,p.bs*(0.3+dScl*0.9)+E*p.bs*1.8);
      const lt=Math.min(90,p.l+(dScl-0.5)*12+E*28);
      // Shell hue from theme + hue offset
      const shIdx=Math.min(p.si, theme.shellH.length-1);
      const baseH=theme.shellH[shIdx]+hueOff+(state.isPlaying?-25:(lis&&micL>0.05?20:0));
      const hue=(baseH+Math.sin(t2*0.5)*5+360)%360;
      p._sx=sx;p._sy=sy;p._sz=sz;p._a=a;p._h=hue;p._st=p.st;p._l=lt;p._d=rz3;
    }

    const ord=new Array(N);
    for(let i=0;i<N;i++)ord[i]=i;
    ord.sort((a,b)=>P[b]._d-P[a]._d);
    for(let i=0;i<N;i++){
      const p=P[ord[i]];
      ctx.beginPath(); ctx.arc(p._sx,p._sy,p._sz,0,Math.PI*2);
      ctx.fillStyle=`hsla(${p._h},${p._st}%,${p._l}%,${p._a})`;
      ctx.shadowBlur=p._sz*(2+E*5);
      ctx.shadowColor=`hsla(${(p._h-20+360)%360},100%,60%,${p._a*0.15})`;
      ctx.fill();
    }
    ctx.shadowBlur=0;

    // 5. Plasma core orb — theme colors
    const cR=14+E*10+pp*4;
    const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,cR);
    if(state.isPlaying){
      cg.addColorStop(0,`rgba(${theme.agentCol},${0.95+E*0.05})`);
      cg.addColorStop(0.3,`rgba(${theme.agentCol},${0.7+E*0.3})`);
      cg.addColorStop(0.6,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.4+E*0.4})`);
    }else if(lis&&micL>0.05){
      cg.addColorStop(0,`rgba(${theme.userCol},${0.95+E*0.05})`);
      cg.addColorStop(0.3,`rgba(${theme.userCol},${0.7+E*0.3})`);
      cg.addColorStop(0.6,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.4+E*0.4})`);
    }else{
      cg.addColorStop(0,`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.85})`);
      cg.addColorStop(0.3,`rgba(${theme.idleR-40},${theme.idleG-40},${theme.idleB-40},${0.55})`);
      cg.addColorStop(0.6,`rgba(${theme.idleR-60},${theme.idleG-60},${theme.idleB-60},${0.25})`);
    }
    cg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.shadowBlur=25+E*40;
    ctx.shadowColor=state.isPlaying?`rgba(${theme.agentCol},${0.5+E*0.4})`:
      (lis?`rgba(${theme.userCol},${0.5+E*0.4})`:`rgba(${theme.idleR},${theme.idleG},${theme.idleB},${0.25})`);
    ctx.beginPath(); ctx.arc(cx,cy,cR,0,Math.PI*2);
    ctx.fillStyle=cg; ctx.fill();
    ctx.shadowBlur=0;

    // 6. Plasma spots
    const spots=6+Math.floor(E*15);
    for(let i=0;i<spots;i++){
      const id=i*37+13;
      const a2=t*(0.4+(id%10)*0.01)+i*1.7;
      const dist=hsh(id+1)*cR*0.65;
      const spx=cx+Math.cos(a2+i)*dist, spy=cy+Math.sin(a2*0.7+i*0.5)*dist;
      const spSz=1.5+hsh(id+2)*3.5*(1+E);
      const spBr=0.2+hsh(id+3)*0.6*(1+E);
      ctx.beginPath(); ctx.arc(spx,spy,spSz,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${spBr})`;
      ctx.shadowBlur=spSz*4;
      ctx.shadowColor=`rgba(255,255,255,${spBr*0.4})`;
      ctx.fill();
    }
    ctx.shadowBlur=0;

    if (animActive) requestAnimationFrame(draw);
  }

  // Pause animation when tab is hidden (save CPU/battery)
  let animActive = true;
  document.addEventListener('visibilitychange', () => {
    animActive = !document.hidden;
    if (!document.hidden) draw(); // restart if was paused
  });
  draw();
}
