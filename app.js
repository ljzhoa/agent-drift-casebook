/* Case content lives in cases.json; this file controls the reading experience. */
(() => {
  'use strict';
  const categories = [
    {id:'loops', number:'01', title:'Loop / repeated attempts', short:'Repeated attempts', description:'An approach recurs after its limitations have already surfaced.'},
    {id:'environment', number:'02', title:'Environment not updated', short:'Environment feedback', description:'The environment changes, but the working plan or completion judgment does not follow.'},
    {id:'hallucinations', number:'03', title:'LLM hallucination', short:'Unsupported assumptions', description:'An unsupported assumption or causal explanation starts directing subsequent actions.'},
    {id:'subgoals', number:'04', title:'Subgoal replaces the goal', short:'Premature completion', description:'A local milestone becomes a substitute for the original acceptance criteria.'},
    {id:'constraints', number:'05', title:'Forgetting task constraints', short:'Lost constraints', description:'A stated requirement disappears from the implementation or its validation.'}
  ];
  const cases = window.DRIFT_CASES || [];
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2,'0');
  const phaseNames = {setup:'Goal & context',feedback:'New evidence',drift:'Drift transition',consequence:'What follows',outcome:'Recorded outcome'};
  const kindNames = {task:'Task requirement',agent:'Agent statement',tool:'Tool record',verifier:'Independent verifier',result:'Run result'};
  let evidenceRegistry = [];
  let sourcePromise;
  let sourceRequest = 0;
  let state = {caseId:cases[0]?.id, step:0, view:'walkthrough', presentation:false};
  const current = () => cases.find(c => c.id === state.caseId) || cases[0];
  const categoryFor = c => categories.find(x => x.id === c.category);
  function readHash() {
    const hash = location.hash.slice(1);
    const [id,params] = hash.split('?');
    if(cases.some(c=>c.id===id)) state.caseId=id;
    const query = new URLSearchParams(params || '');
    const c=current();
    state.step=Math.min(Math.max(Number(query.get('step'))||0,0),c.steps.length-1);
    state.view=['walkthrough','narrative','comparison'].includes(query.get('view'))?query.get('view'):'walkthrough';
  }
  function saveHash() {
    const query = new URLSearchParams();
    if(state.step) query.set('step',state.step);
    if(state.view!=='walkthrough') query.set('view',state.view);
    const hash='#'+state.caseId+(query.size?'?'+query:'');
    history.replaceState(null,'',hash);
  }
  function renderNavigation() {
    $('#case-navigation').innerHTML=categories.map(cat=>`<section class="nav-category"><div class="category-label"><span class="category-number">${cat.number}</span><span>${esc(cat.title)}</span></div>${cases.filter(c=>c.category===cat.id).map(c=>`<a class="case-link ${c.id===state.caseId?'active':''}" href="#${esc(c.id)}" data-case="${esc(c.id)}" ${c.id===state.caseId?'aria-current="page"':''}><span>${esc(c.navTitle || c.task)}<span class="nav-id">${c.group==='Extra'?'EXTRA':'GROUP '+esc(c.group)} / ${esc(c.trace.replace('trace_',''))}</span></span></a>`).join('')}</section>`).join('');
  }
  function evidenceCard(ref) {
    const index=evidenceRegistry.push(ref)-1;
    const basename=ref.file.split('/').pop();
    return `<article class="evidence-card"><div class="evidence-meta"><span class="source-kind ${esc(ref.kind)}">${esc(kindNames[ref.kind]||ref.kind)}</span><span>${esc(ref.locator)}</span></div><blockquote>${esc(ref.quote)}</blockquote><button class="source-link" data-evidence="${index}" aria-label="Inspect ${esc(basename)}, line ${ref.line}"><span>${esc(basename)}</span><span>Inspect source · L${ref.line}</span></button></article>`;
  }
  function stepParts(step) {
    const parts=[['What was available',step.observation],['Reading this step · analysis',step.interpretation],['Action in the record',step.action]];
    return parts.filter(x=>x[1]).map(([label,text])=>`<section class="story-part"><h3>${label}</h3><p>${esc(text)}</p></section>`).join('')+`<section class="story-part interpretation"><h3>Why this matters · analysis</h3><p>${esc(step.significance)}</p></section>`;
  }
  function outcome(c) {
    return `<div class="outcome-box"><h3>${esc(c.outcome.label)}</h3><p>${esc(c.outcome.detail)}</p></div>`;
  }
  function walkthrough(c) {
    const step=c.steps[state.step];
    const last=state.step===c.steps.length-1;
    const compactControls=`<div class="walk-top-controls" aria-label="Walkthrough navigation"><span>Step ${pad(state.step+1)} of ${pad(c.steps.length)}</span><div><button class="button" data-action="previous" ${state.step===0?'disabled':''}>Previous</button><button class="button button-primary" data-action="${last?'next-case':'next'}">${last?'Next case':'Next step'}</button></div></div>`;
    return `<div class="timeline" style="--steps:${c.steps.length}" aria-label="Walkthrough steps">${c.steps.map((s,i)=>`<button class="step-node ${i<state.step?'past':''} ${i===state.step?'current':''} ${i===c.driftStep?'is-drift':''}" data-step="${i}" ${i===state.step?'aria-current="step"':''} aria-label="Step ${i+1}: ${esc(s.title)}${i===c.driftStep?', marked drift point':''}"><span class="node-track"></span><span class="node-index">${pad(i+1)}</span>${i===c.driftStep?'<span class="drift-marker">DRIFT</span>':''}<span class="node-label">${esc(s.label)}</span></button>`).join('')}</div>
    ${compactControls}<div class="walk-grid"><article class="story-card ${state.step===c.driftStep||step.phase==='drift'?'drift-card':''}" aria-labelledby="step-title"><div class="step-kicker"><span class="eyebrow">STEP ${pad(state.step+1)} / ${pad(c.steps.length)}</span><span class="phase-badge ${esc(step.phase)}">${esc(phaseNames[step.phase]||step.phase)}</span></div><h2 id="step-title">${esc(step.title)}</h2>${stepParts(step)}${last?outcome(c):''}</article>
    <aside class="evidence-panel" aria-label="Evidence for this step"><div class="evidence-heading"><h3>Evidence at this step</h3><span>${step.evidence.length} SOURCE${step.evidence.length===1?'':'S'}</span></div>${step.evidence.map(evidenceCard).join('')}<p class="evidence-note">Quoted text comes from the original record. The explanation on the left is an analytical annotation.</p></aside></div>
    <div class="step-controls"><button class="button" data-action="previous" ${state.step===0?'disabled':''}>Previous step</button><span class="control-caption">${last?'End of this walkthrough':'Use keyboard'} ${last?'':'<kbd>←</kbd> <kbd>→</kbd>'}</span><div class="control-group">${last?'<button class="button" data-view="narrative">Read full analysis</button>':''}<button class="button button-primary" data-action="${last?'next-case':'next'}">${last?'Next case':'Next step'}</button></div></div>
    ${last?`<div class="case-bottom"><strong>Interpretation boundary</strong><p>${esc(c.caveat)}</p></div>`:`<div class="case-bottom"><strong>Keep the goal in view</strong><p>${esc(categoryFor(c).description)}</p></div>`}`;
  }
  function mechanism(c) {
    const parts=[['01 · TRIGGER',c.mechanism.trigger],['02 · SHIFT',c.mechanism.shift],['03 · REINFORCEMENT',c.mechanism.reinforcement],['04 · CONSEQUENCE',c.mechanism.consequence]];
    return `<div class="mechanism">${parts.map(([label,text])=>`<section class="mechanism-part"><span>${label}</span><p>${esc(text)}</p></section>`).join('')}</div>`;
  }
  function narrative(c) {
    return `<p class="full-intro">${esc(c.thesis)}</p>${mechanism(c)}${c.steps.map((s,i)=>`<div class="full-step"><span class="full-number">${pad(i+1)}</span><article class="story-card ${i===c.driftStep||s.phase==='drift'?'drift-card':''}"><div class="step-kicker"><span class="eyebrow">${esc(s.label)}</span><span class="phase-badge ${esc(s.phase)}">${esc(phaseNames[s.phase])}</span></div><h2>${esc(s.title)}</h2>${stepParts(s)}<details><summary>Inspect ${s.evidence.length} source reference${s.evidence.length===1?'':'s'}</summary><div class="full-evidence">${s.evidence.map(evidenceCard).join('')}</div></details></article></div>`).join('')}${outcome(c)}<div class="analysis-grid"><section class="analysis-box alternative"><h3>${esc(c.alternative.title)}</h3><p>${esc(c.alternative.detail)}</p></section><section class="analysis-box caution"><h3>What the evidence does and does not establish</h3><p>${esc(c.caveat)}</p></section></div><p class="takeaway">${esc(c.takeaway)}</p>`;
  }
  function comparison(c) {
    const ref=c.comparison;
    const drift=c.steps[c.driftStep];
    return `<div class="compare-grid"><article class="comparison-card selected"><span class="eyebrow">SELECTED CASE · ${esc(c.trace)}</span><h2>${esc(drift.title)}</h2><p>${esc(c.thesis)}</p>${drift.evidence.map(evidenceCard).join('')}${outcome(c)}</article><article class="comparison-card reference"><span class="eyebrow">${ref?'COMPARISON FROM THE RECORD':'PROPOSED CORRECTION · NOT OBSERVED'}</span><h2>${esc(ref?.title||c.alternative.title)}</h2><p>${esc(ref?.detail||c.alternative.detail)}</p>${(ref?.evidence||[]).map(evidenceCard).join('')}</article></div><p class="comparison-note">${ref?'A separate successful or contrasting run helps explain the behavior. It is not a controlled intervention and does not prove that one changed action caused the different outcome.':'This is an analyst-proposed alternative, not an observed recovery or a replay of the original agent.'}</p><div class="analysis-grid"><section class="analysis-box"><h3>Transferable lesson</h3><p>${esc(c.takeaway)}</p></section><section class="analysis-box caution"><h3>Interpretation boundary</h3><p>${esc(c.caveat)}</p></section></div>`;
  }
  function render() {
    const c=current(); if(!c)return;
    evidenceRegistry=[];
    const cat=categoryFor(c);
    document.title=`${c.title} — Agent Drift`;
    $('#breadcrumb').textContent=`${cat.number} / ${cat.short}`;
    renderNavigation();
    $('#case-view').innerHTML=`<header class="case-header"><div class="case-overline"><span class="category-pill">${cat.number} · ${esc(cat.title)}</span><span class="eyebrow">${c.group==='Extra'?'EXTRA CASE':'GROUP '+esc(c.group)} / ${esc(c.trace.replace('trace_','TRACE '))}</span></div><h1>${esc(c.title)}</h1><p class="case-intro">${esc(c.summary)}</p><div class="meta-row"><span>${esc(c.task)}</span><span>${esc(c.model)}</span><span>${c.steps.length} key moments</span></div></header>
    <section class="goal-panel" aria-label="Original task goal"><span class="eyebrow">ORIGINAL GOAL</span><div><p>${esc(c.goal)}</p><details><summary>Acceptance criteria (${c.requirements.length})</summary><ul>${c.requirements.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></details></div></section>
    <div class="view-toolbar"><div class="tabs" role="tablist" aria-label="Case view">${[['walkthrough','Walkthrough'],['narrative','Full case'],['comparison','Compare']].map(([id,label])=>`<button role="tab" id="tab-${id}" class="tab" data-view="${id}" aria-selected="${state.view===id}" aria-controls="view-panel" tabindex="${state.view===id?'0':'-1'}">${label}</button>`).join('')}</div><button class="text-button" data-action="jump">Jump to drift point · ${pad(c.driftStep+1)}</button></div>
    <section id="view-panel" role="tabpanel" aria-labelledby="tab-${state.view}" tabindex="0">${state.view==='walkthrough'?walkthrough(c):state.view==='narrative'?narrative(c):comparison(c)}</section>`;
    saveHash();
    const timeline=$('.timeline');
    if(timeline&&timeline.scrollWidth>timeline.clientWidth){const active=timeline.querySelector('.current');timeline.scrollLeft=active.getBoundingClientRect().left-timeline.getBoundingClientRect().left-(timeline.clientWidth-active.offsetWidth)/2;}
  }
  function announce(message){$('#announcer').textContent=message;}
  function selectCase(id) {
    if(!cases.some(c=>c.id===id))return;
    state.caseId=id;state.step=0;state.view='walkthrough';
    document.body.classList.remove('nav-open');$('#menu-button').setAttribute('aria-expanded','false');render();window.scrollTo({top:0,behavior:'instant'});announce(`Selected ${current().title}`);
  }
  function selectStep(index) {
    state.step=Math.min(Math.max(index,0),current().steps.length-1);state.view='walkthrough';render();
    announce(`Step ${state.step+1}. ${current().steps[state.step].title}`);
  }
  function selectView(view) {state.view=view;render();}
  function togglePresentation(force) {
    state.presentation=typeof force==='boolean'?force:!state.presentation;
    document.body.classList.toggle('presentation',state.presentation);
    const button=$('#presentation-button');button.setAttribute('aria-pressed',String(state.presentation));button.innerHTML=state.presentation?'Exit presentation':'<span aria-hidden="true">▣</span> Presentation mode';
    document.body.classList.remove('nav-open');$('#menu-button').setAttribute('aria-expanded','false');
    announce(state.presentation?'Presentation mode. Use left and right arrow keys to advance.':'Presentation mode ended.');
  }
  function loadSources() {
    if(window.DRIFT_SOURCES)return Promise.resolve(window.DRIFT_SOURCES);
    if(!sourcePromise)sourcePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='sources.js';script.onload=()=>window.DRIFT_SOURCES?resolve(window.DRIFT_SOURCES):reject(Error('Source bundle is unavailable.'));script.onerror=()=>{sourcePromise=null;script.remove();reject(Error('The source bundle could not be loaded.'));};document.head.append(script);});
    return sourcePromise;
  }
  async function openEvidence(ref) {
    const request=++sourceRequest;
    const dialog=$('#evidence-dialog');
    $('#evidence-title').textContent=ref.locator;
    $('#evidence-body').innerHTML=`<div class="source-body"><div class="source-path">${esc(ref.file)} · line ${ref.line}</div><div class="source-excerpt">${esc(ref.quote)}</div><div class="source-actions"><a class="button" href="evidence/${ref.file.split('/').map(encodeURIComponent).join('/')}.txt" target="_blank" rel="noopener">Open original file</a></div><p class="source-context-caption">Original source lines. The cited line is highlighted; JSON keeps its original escaped formatting.</p><div class="source-context" id="source-context">Loading surrounding lines…</div></div>`;
    if(!dialog.open)dialog.showModal();
    try {
      const sources=await loadSources();
      if(request!==sourceRequest)return;
      const text=sources[ref.file];if(typeof text!=='string')throw Error('This source is not included in the local bundle.');
      const lines=text.split(/\r?\n/);const index=Math.min(Math.max(ref.line-1,0),lines.length-1);const first=Math.max(0,index-5);const last=Math.min(lines.length,index+7);
      $('#source-context').innerHTML=lines.slice(first,last).map((line,i)=>`<div class="source-line ${first+i===index?'selected':''}"><span class="line-number">${first+i+1}</span><span>${esc(line)}</span></div>`).join('');
    }catch(error){if(request===sourceRequest)$('#source-context').textContent=`${error.message} The quoted excerpt above is still available; use Open original file to inspect the record.`;}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.dataset.case){event.preventDefault();selectCase(target.dataset.case);return;}
    if(target.dataset.step!==undefined){selectStep(Number(target.dataset.step));return;}
    if(target.dataset.view){selectView(target.dataset.view);return;}
    if(target.dataset.evidence!==undefined){openEvidence(evidenceRegistry[Number(target.dataset.evidence)]);return;}
    if(target.classList.contains('dialog-close')){target.closest('dialog').close();return;}
    switch(target.dataset.action){case 'next':selectStep(state.step+1);break;case 'previous':selectStep(state.step-1);break;case 'jump':selectStep(current().driftStep);break;case 'next-case':selectCase(cases[(cases.findIndex(c=>c.id===state.caseId)+1)%cases.length].id);break;}
  });
  $('#presentation-button').addEventListener('click',()=>togglePresentation());
  $('#menu-button').addEventListener('click',()=>{const open=document.body.classList.toggle('nav-open');$('#menu-button').setAttribute('aria-expanded',String(open));$('#menu-button').setAttribute('aria-label',open?'Close case navigation':'Open case navigation');});
  $('#method-button').addEventListener('click',()=>$('#method-dialog').showModal());
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||event.target.matches('input,textarea,select,[contenteditable]'))return;
    if(event.key==='Escape'){if(state.presentation)togglePresentation(false);document.body.classList.remove('nav-open');$('#menu-button').setAttribute('aria-expanded','false');return;}
    if(event.target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const views=['walkthrough','narrative','comparison'];let i=views.indexOf(state.view);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;selectView(views[i]);$(`#tab-${views[i]}`).focus();return;
    }
    if(state.view==='walkthrough'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();selectStep(event.key==='Home'?0:event.key==='End'?current().steps.length-1:state.step+(event.key==='ArrowRight'?1:-1));}
  });
  window.addEventListener('hashchange',()=>{readHash();render();});
  if(!cases.length){$('#case-view').innerHTML='<h1>The case collection could not be loaded.</h1><p>Please keep cases.js beside this page and reload.</p>';return;}
  readHash();render();
})();
