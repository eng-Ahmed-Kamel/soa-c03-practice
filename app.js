/*
 * CloudOps Practice Exam — vanilla JS, no backend.
 * ADDING QUESTIONS: append objects to window.QUESTIONS in questions.js:
 *  {id, domain, type:"single"|"multiple", prompt, codeSnippet, options:[...], correctAnswers:[indexes], explanation}
 * Use a unique `id`. Domain should be one of DOMAINS below (others still work; they get their own filter).
 */
(function(){
'use strict';
const BANK = window.QUESTIONS || [];
const LS_THEME='cloudops_theme', LS_SESSION='cloudops_session';
const COUNTS=[5,10,25,50,65,100,'All'];
const TIMES=[30,60,90,120,180,0]; // minutes; 0 = unlimited
const $=s=>document.querySelector(s);
const el=(t,c,txt)=>{const e=document.createElement(t); if(c)e.className=c; if(txt!==undefined)e.textContent=txt; return e;};

const S={mode:'random',count:65,custom:null,minutes:120,domains:new Set(),
  exam:null, timerHidden:false, tick:null};

/* ---------- helpers ---------- */
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function fmt(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function show(id){['screenStart','screenExam','screenResults'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id));}
function save(){ if(S.exam) try{localStorage.setItem(LS_SESSION,JSON.stringify(S.exam));}catch(e){} }
function loadSaved(){ try{return JSON.parse(localStorage.getItem(LS_SESSION));}catch(e){return null;} }
function clearSaved(){ try{localStorage.removeItem(LS_SESSION);}catch(e){} }
const byId=id=>BANK.find(q=>q.id===id);

/* ---------- theme ---------- */
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);$('#btnTheme').textContent=t==='dark'?'☀️':'🌙';}
(function(){let t='light';try{t=localStorage.getItem(LS_THEME)||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}catch(e){}applyTheme(t);})();
$('#btnTheme').onclick=()=>{const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';applyTheme(t);try{localStorage.setItem(LS_THEME,t);}catch(e){}};

/* ---------- start screen ---------- */
const DOMAINS=[...new Set(BANK.map(q=>q.domain))].sort();
function chips(container,items,isActive,onClick){
  container.innerHTML='';
  items.forEach(it=>{const b=el('button','chip',it.label);b.type='button';if(isActive(it))b.classList.add('active');b.onclick=()=>{onClick(it);};container.appendChild(b);});
}
function renderStart(){
  chips($('#countPresets'),COUNTS.map(c=>({label:c==='All'?'All ('+BANK.length+')':String(c),v:c})),
    it=>S.custom===null&&S.count===it.v,it=>{S.count=it.v;S.custom=null;$('#customCount').value='';renderStart();});
  chips($('#timePresets'),TIMES.map(m=>({label:m?m+' min':'Unlimited',v:m})),it=>S.minutes===it.v,it=>{S.minutes=it.v;renderStart();});
  chips($('#domainFilters'),DOMAINS.map(d=>({label:d,v:d})),it=>S.domains.has(it.v),it=>{S.domains.has(it.v)?S.domains.delete(it.v):S.domains.add(it.v);renderStart();});
  $('#rangeTo').max=BANK.length; $('#rangeFrom').max=BANK.length;
  if(!$('#rangeTo').value)$('#rangeTo').value=BANK.length;
  $('#rangeHint').textContent='Question bank has '+BANK.length+' questions (Q1–Q'+BANK.length+').';
  const sv=loadSaved();
  $('#btnResume').classList.toggle('hidden',!(sv&&sv.order&&!sv.done));
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  S.mode=t.dataset.mode;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
  $('#paneRandom').classList.toggle('hidden',S.mode!=='random');$('#paneRange').classList.toggle('hidden',S.mode!=='range');});
$('#customCount').oninput=e=>{const v=parseInt(e.target.value,10);S.custom=isNaN(v)?null:v;renderStart();$('#customCount').focus();};

function buildExam(){
  const err=m=>{$('#startError').textContent=m;return null;};
  $('#startError').textContent='';
  if(!BANK.length)return err('Question bank is empty.');
  const pass=parseInt($('#passPct').value,10);
  if(isNaN(pass)||pass<1||pass>100)return err('Passing score must be between 1 and 100.');
  let pool=BANK.slice();
  if(S.mode==='range'){
    const f=parseInt($('#rangeFrom').value,10),t=parseInt($('#rangeTo').value,10);
    if(isNaN(f)||isNaN(t))return err('Enter both From and To question numbers.');
    if(f<1||t>BANK.length)return err('Range must be between 1 and '+BANK.length+'.');
    if(f>t)return err('"From" cannot be greater than "To".');
    pool=BANK.slice(f-1,t);
  }
  if(S.domains.size)pool=pool.filter(q=>S.domains.has(q.domain));
  if(!pool.length)return err('No questions match the selected filters.');
  let ids;
  if(S.mode==='random'){
    let n=S.custom!==null?S.custom:(S.count==='All'?pool.length:S.count);
    if(!Number.isInteger(n)||n<1)return err('Question count must be at least 1.');
    n=Math.min(n,pool.length);
    ids=shuffle(pool).slice(0,n).map(q=>q.id);
  }else{
    ids=(($('#rangeShuffle').checked)?shuffle(pool):pool).map(q=>q.id);
  }
  return {order:ids,answers:{},flags:{},cur:0,minutes:S.minutes,pass,startedAt:Date.now(),elapsedBase:0,done:false};
}
$('#btnStart').onclick=()=>{const ex=buildExam();if(!ex)return;S.exam=ex;save();startExam();};
$('#btnResume').onclick=()=>{const sv=loadSaved();if(sv){S.exam=sv;startExam();}};

/* ---------- exam ---------- */
function elapsed(){return S.exam.elapsedBase+(Date.now()-S.exam.startedAt)/1000;}
function startExam(){
  S.exam.startedAt=Date.now(); // elapsedBase persists time from earlier sessions
  show('screenExam');renderQ();renderNav();
  clearInterval(S.tick);S.tick=setInterval(tickTimer,500);tickTimer();
}
function tickTimer(){
  const e=S.exam;if(!e)return;const t=elapsed();
  const limit=e.minutes*60;
  $('#timer').textContent=limit?fmt(limit-t):fmt(t);
  $('#timer').style.visibility=S.timerHidden?'hidden':'visible';
  if(Math.floor(t)%5===0){e.elapsedBase=t;e.startedAt=Date.now();save();}
  if(limit&&t>=limit){submit(true);}
}
$('#btnTimer').onclick=()=>{S.timerHidden=!S.timerHidden;$('#btnTimer').textContent=S.timerHidden?'Show Timer':'Hide Timer';tickTimer();};

function curQ(){return byId(S.exam.order[S.exam.cur]);}
function renderQ(){
  const e=S.exam,q=curQ();
  $('#qProgress').textContent='Question '+(e.cur+1)+' of '+e.order.length;
  $('#qDomain').textContent=q.domain;
  $('#qType').textContent=q.type==='multiple'?'Choose '+q.correctAnswers.length:'Choose 1';
  $('#qPrompt').textContent=q.prompt;
  const code=$('#qCode');if(q.codeSnippet){code.textContent=q.codeSnippet;code.classList.remove('hidden');}else code.classList.add('hidden');
  const box=$('#qOptions');box.innerHTML='';
  const sel=e.answers[q.id]||[];
  q.options.forEach((o,i)=>{
    const lab=el('label','opt'+(sel.includes(i)?' sel':''));
    const inp=el('input');inp.type=q.type==='multiple'?'checkbox':'radio';inp.name='opt';inp.checked=sel.includes(i);
    inp.onchange=()=>pick(q,i,inp.checked);
    lab.append(inp,el('span','',String.fromCharCode(65+i)+'. '+o));box.appendChild(lab);
  });
  $('#btnPrev').disabled=e.cur===0;
  $('#btnNext').disabled=e.cur===e.order.length-1;
  $('#btnFlag').textContent=e.flags[q.id]?'⚑ Unflag':'⚑ Flag for Review';
}
function pick(q,i,on){
  const e=S.exam;let s=(e.answers[q.id]||[]).slice();
  if(q.type==='multiple'){s=on?[...new Set([...s,i])]:s.filter(x=>x!==i);}else s=[i];
  if(s.length)e.answers[q.id]=s.sort();else delete e.answers[q.id];
  save();renderQ();renderNav();
}
function renderNav(){
  const e=S.exam,g=$('#navGrid');g.innerHTML='';let a=0,f=0;
  e.order.forEach((id,i)=>{
    const b=el('button','gq',String(i+1));b.type='button';
    if(e.answers[id]){b.classList.add('answered');a++;}
    if(e.flags[id]){b.classList.add('flagged');f++;}
    if(i===e.cur)b.classList.add('current');
    b.onclick=()=>{e.cur=i;save();renderQ();renderNav();};g.appendChild(b);
  });
  $('#navStats').textContent='— '+a+' answered, '+(e.order.length-a)+' unanswered, '+f+' flagged';
}
$('#btnPrev').onclick=()=>{if(S.exam.cur>0){S.exam.cur--;save();renderQ();renderNav();}};
$('#btnNext').onclick=()=>{if(S.exam.cur<S.exam.order.length-1){S.exam.cur++;save();renderQ();renderNav();}};
$('#btnFlag').onclick=()=>{const q=curQ();const f=S.exam.flags;f[q.id]?delete f[q.id]:f[q.id]=true;save();renderQ();renderNav();};
$('#btnSubmit').onclick=()=>{
  const e=S.exam,un=e.order.filter(id=>!e.answers[id]).length;
  const msg=un===e.order.length?'You have answered 0 questions. Submit anyway?':un?'You have '+un+' unanswered question(s). Submit now?':'Submit your exam?';
  if(confirm(msg))submit(false);
};

/* ---------- grading ---------- */
function isCorrect(q,sel){const c=q.correctAnswers.slice().sort();sel=(sel||[]).slice().sort();return c.length===sel.length&&c.every((v,i)=>v===sel[i]);}
function submit(auto){
  const e=S.exam;clearInterval(S.tick);
  e.timeTaken=Math.min(elapsed(),e.minutes?e.minutes*60:Infinity);e.done=true;clearSaved();
  renderResults(auto);
}
function renderResults(auto){
  const e=S.exam;show('screenResults');
  let right=0;const dom={};
  e.order.forEach(id=>{const q=byId(id);const ok=isCorrect(q,e.answers[id]);if(ok)right++;
    dom[q.domain]=dom[q.domain]||{r:0,t:0};dom[q.domain].t++;if(ok)dom[q.domain].r++;});
  const total=e.order.length,pct=total?Math.round(right/total*1000)/10:0,pass=pct>=e.pass;
  const st=$('#resStatus');st.textContent=(pass?'PASS ✅':'FAIL ❌')+(auto?' (time expired)':'');st.className=pass?'pass':'fail';
  $('#resScore').textContent=right+' / '+total+'  ('+pct+'%)';
  $('#resTime').textContent='Passing score: '+e.pass+'%  •  Time taken: '+fmt(e.timeTaken);
  const d=$('#resDomains');d.innerHTML='';
  Object.keys(dom).sort().forEach(k=>{const v=dom[k],p=Math.round(v.r/v.t*100);
    const r=el('div','drow');r.append(el('div','',k+' — '+v.r+'/'+v.t+' ('+p+'%)'));
    const b=el('div','bar');const i=el('i');i.style.width=p+'%';if(p<e.pass)i.style.background='var(--bad)';b.appendChild(i);r.appendChild(b);d.appendChild(r);});
  renderReview('all');
}
function renderReview(f){
  document.querySelectorAll('#reviewFilters .chip').forEach(c=>c.classList.toggle('active',c.dataset.f===f));
  const e=S.exam,list=$('#reviewList');list.innerHTML='';
  e.order.forEach((id,i)=>{
    const q=byId(id),sel=e.answers[id]||[],ok=isCorrect(q,sel);
    if(f==='wrong'&&ok)return;if(f==='flag'&&!e.flags[id])return;
    list.appendChild(qBlock(q,'Q'+(i+1)+(e.flags[id]?' ⚑':'')+(ok?' ✔':' ✘'),sel,ok));
  });
  if(!list.children.length)list.appendChild(el('p','muted','Nothing to show for this filter.'));
}
function qBlock(q,label,sel,ok){
  const d=el('div','rev '+(sel===null?'':ok?'ok':'no'));
  d.append(el('strong','',label+' · '+q.domain),el('p','',q.prompt));
  if(q.codeSnippet)d.append(el('pre','code',q.codeSnippet));
  q.options.forEach((o,i)=>{
    const c=q.correctAnswers.includes(i),s=sel&&sel.includes(i);
    const r=el('div','ropt'+(c?' correct':s?' wrongsel':''),String.fromCharCode(65+i)+'. '+o+(c?'  ✔ correct':'')+(s?'  ← your answer':''));d.appendChild(r);});
  if(sel!==null&&!sel.length)d.append(el('div','muted','Not answered'));
  d.append(el('div','expl',q.explanation));return d;
}
$('#reviewFilters').onclick=ev=>{const f=ev.target.dataset&&ev.target.dataset.f;if(f)renderReview(f);};
$('#btnRetry').onclick=()=>{S.exam=null;show('screenStart');$('#timer').textContent='--:--';renderStart();};

/* ---------- study view ---------- */
function renderStudy(){
  const term=$('#studySearch').value.toLowerCase(),dm=$('#studyDomain').value,l=$('#studyList');l.innerHTML='';
  BANK.forEach(q=>{
    if(dm&&q.domain!==dm)return;
    if(term&&!(q.prompt+' '+q.options.join(' ')).toLowerCase().includes(term))return;
    l.appendChild(qBlock(q,'Q'+q.id,null,true));
  });
}
$('#btnStudy').onclick=()=>{const s=$('#studyDomain');if(!s.options.length){s.add(new Option('All domains',''));DOMAINS.forEach(d=>s.add(new Option(d,d)));}
  renderStudy();$('#studyModal').showModal();};
$('#btnCloseStudy').onclick=()=>$('#studyModal').close();
$('#studySearch').oninput=renderStudy;$('#studyDomain').onchange=renderStudy;

/* ---------- init ---------- */
renderStart();
})();
