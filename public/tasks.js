import { createVersionReview } from '../src/tasks/version-review.js';

(() => {
  const storageKey = 'kantor-ai.tasks.v1';
  const states = {queued: 'Queued', active: 'In progress', blocked: 'Needs decision', review: 'Needs review', done: 'Done'};
  const priorities = new Set(['urgent','high','normal','low']);
  const el = id => document.getElementById(id);
  let tasks = [], team = [], changed, locate;
  let storageHealthy = true;
  let mutation=0,polling=false,writing=0;
  const drafts=new Map();
  const draftKey=(task,kind)=>`${kind}:${task.id}:${kind==='result'?'result':(task.version||0)}`;
  function draftRead(key){if(drafts.has(key))return drafts.get(key);try{return sessionStorage.getItem('kantor-draft:'+key)||'';}catch{return '';}}
  function draftWrite(key,value){drafts.set(key,value);try{sessionStorage.setItem('kantor-draft:'+key,value);}catch{feedback('Draft is kept in this tab only; browser storage is unavailable.');}}
  function draftClear(key){drafts.delete(key);try{sessionStorage.removeItem('kantor-draft:'+key);}catch{}}

  // With the server running, tasks live there and some members are AI agents; without it, tasks stay in this browser.
  let server = null;
  const displayName = name => team.find(person => person.n === name)?.initials || name;
  const agentFor = name => server?.members[name] ? {...server.members[name], mode: server.mode} : null;

  function normalizeTask(task) {
    return {...task, priority: priorities.has(task.priority) ? task.priority : 'normal', dueDate: validDueDate(task.dueDate) ? task.dueDate || null : null, blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy : []};
  }
  function validDueDate(value) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function dependencies(task) {
    const byId = new Map(tasks.map(candidate => [candidate.id, candidate]));
    return (task.blockedBy || []).map(id => byId.get(id)).filter(candidate => candidate && candidate.status !== 'done');
  }
  function localDependencyCycle(taskId, blockedBy) {
    const seen = new Set();
    const reaches = id => {
      if (id === taskId) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return (tasks.find(candidate => candidate.id === id)?.blockedBy || []).some(reaches);
    };
    return blockedBy.some(reaches);
  }
  function refreshTaskPlanningControls() {
    const select = el('taskAssignee');
    if (!select || !el('assigneeSuggestion') || !el('taskBlockedBy')) return;
    const currentAssignee = select.value;
    const activeCounts = new Map(team.map(person => [person.n, tasks.filter(task => task.assignee === person.n && task.status === 'active').length]));
    const leastLoad = activeCounts.size ? Math.min(...activeCounts.values()) : 0;
    const previousGroup = team.find(person => person.n === tasks[0]?.assignee)?.group;
    const suggested = [...team].filter(person => activeCounts.get(person.n) === leastLoad)
      .sort((a,b) => Number(b.group === previousGroup) - Number(a.group === previousGroup) || a.n.localeCompare(b.n));
    const ordered = [...suggested, ...team.filter(person => !suggested.includes(person))];
    const suggestedGroup = document.createElement('optgroup');
    suggestedGroup.label = suggested.length ? `Suggested · ${leastLoad} active` : 'Suggested';
    for (const person of suggested) {
      const option = node('option', `${displayName(person.n)} · ${person.role}${agentFor(person.n) ? ' · AI agent' : ''}`);
      option.value = person.n; suggestedGroup.append(option);
    }
    const allGroup = document.createElement('optgroup');allGroup.label = 'All team members';
    for (const person of ordered.filter(member => !suggested.includes(member))) {
      const option = node('option', `${displayName(person.n)} · ${person.role}${activeCounts.get(person.n) ? ` · ${activeCounts.get(person.n)} active` : ''}${agentFor(person.n) ? ' · AI agent' : ''}`);
      option.value = person.n; allGroup.append(option);
    }
    select.replaceChildren(suggestedGroup, allGroup);
    select.value = team.some(person => person.n === currentAssignee) ? currentAssignee : suggested[0]?.n || '';
    el('assigneeSuggestion').textContent = suggested.length
      ? `Suggested: ${suggested.slice(0, 3).map(person => `${displayName(person.n)} (${activeCounts.get(person.n)} active)`).join(' · ')}. Sorted by current workload.`
      : 'No team members available.';

    const dependencyRoot = el('taskBlockedBy');
    const checked = new Set([...dependencyRoot.querySelectorAll('input:checked')].map(input => input.value));
    const openTasks = tasks.filter(task => task.status !== 'done');
    if (!openTasks.length) {
      dependencyRoot.replaceChildren(node('p', 'No open tasks to depend on.', 'dependency-empty'));
      return;
    }
    dependencyRoot.replaceChildren(...openTasks.map(task => {
      const label = node('label', undefined, 'dependency-option');
      const checkbox = document.createElement('input');checkbox.type = 'checkbox';checkbox.value = task.id;
      checkbox.checked = checked.has(task.id);
      label.append(checkbox, node('span', `${task.title} · ${displayName(task.assignee)}`));
      return label;
    }));
  }

  function feedback(message) { el('taskFeedback').textContent = message; }
  function persist(next) {
    if (!storageHealthy) {
      feedback('Saved data cannot be read. Changes are blocked so the old data is not overwritten.');
      return false;
    }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { feedback('Could not save. Check browser storage; the change was not applied.'); return false; }
    tasks = next.map(normalizeTask);
    return true;
  }
  async function call(method, path, body) {
    const write=method!=='GET';if(write){mutation++;writing++;}
    try{
      const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Server error ${response.status}`);
      return data;
    }finally{if(write){writing--;mutation++;}}
  }
  // Server changes arrive as whole task lists; report each status change once so the office log and characters follow.
  function apply(list) {
    const before = new Map(tasks.map(t => [t.id, t]));
    tasks = list.map(normalizeTask);
    for (const task of list) {
      const old = before.get(task.id);
      // A fast agent can go from queued to done between two polls; still log that it started.
      if (old && old.status === 'queued' && ['blocked','review','done'].includes(task.status)) changed(task.assignee, 'active', task.title);
      if (old && old.status !== task.status) changed(task.assignee, task.status, task.title);
      if (old && old.assignee !== task.assignee) changed(old.assignee);
    }
  }
  function validTask(task) {
    return task && typeof task.id === 'string' && typeof task.title === 'string' && task.title.trim() &&
      task.title.length <= 160 && typeof task.assignee === 'string' && task.assignee.trim() &&
      Object.hasOwn(states, task.status) && typeof task.brief === 'string' && task.brief.length <= 5000 &&
      typeof task.result === 'string' && task.result.length <= 10000 &&
      (task.priority === undefined || priorities.has(task.priority)) &&
      validDueDate(task.dueDate) &&
      (task.blockedBy === undefined || Array.isArray(task.blockedBy)) &&
      (!['review','done'].includes(task.status) || task.result.trim()) && typeof task.createdAt === 'string';
  }
  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function action(text, handler) {
    const button = node('button', text);
    button.type = 'button'; button.onclick = handler;
    return button;
  }
  async function update(id, status, result = '') {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const blocked = dependencies(task);
    if (status === 'active' && blocked.length) {
      feedback(`Finish ${blocked.map(item => item.title).join(', ')} before starting this task.`);
      return false;
    }
    if (status === 'done' && !result.trim()) {
      feedback('Write a result before finishing this task.');
      return false;
    }
    if (status === 'active' && tasks.some(t => t.id !== id && t.assignee === task.assignee && t.status === 'active')) {
      feedback(`${displayName(task.assignee)} already has an active task. Move it back to the queue or finish it first.`);
      return false;
    }
    if (server) {
      try { const saved = await call('PATCH', `/api/tasks/${id}`, {status, result}); apply(tasks.map(t => t.id === id ? saved : t)); }
      catch (error) { feedback(error.message); return false; }
    } else {
      const next = tasks.map(t => t.id === id ? {...t, status, result, updatedAt: new Date().toISOString()} : t);
      if (!persist(next)) return false;
      changed(task.assignee, status, task.title);
    }
    if(status==='done')draftClear(draftKey(task,'result'));
    render(); feedback(`Task status: ${states[status]}.`);
    if (el('taskDialog').open) el('taskFilter').focus();
    return true;
  }

  async function editPlan(id, changes) {
    const task = tasks.find(candidate => candidate.id === id);
    if (!task) return false;
    if (changes.priority !== undefined && !priorities.has(changes.priority)) { feedback('Choose a valid priority.'); return false; }
    if (changes.dueDate !== undefined && !validDueDate(changes.dueDate)) { feedback('Choose a valid due date.'); return false; }
    if (changes.blockedBy !== undefined) {
      const blockedBy = [...new Set(changes.blockedBy)];
      if (blockedBy.length !== changes.blockedBy.length || blockedBy.includes(id) || blockedBy.some(dependencyId => !tasks.some(candidate => candidate.id === dependencyId)) || localDependencyCycle(id, blockedBy)) {
        feedback('Dependencies must be other existing tasks without cycles.'); return false;
      }
      changes = {...changes, blockedBy};
      if (task.status === 'active' && dependencies({...task, blockedBy}).length) { feedback('An active task cannot be blocked by unfinished work.'); return false; }
    }
    if (server) {
      try {
        const saved = await call('PATCH', `/api/tasks/${id}`, changes);
        apply(tasks.map(candidate => candidate.id === id ? saved : candidate));
      } catch (error) { feedback(error.message); return false; }
    } else {
      const next = tasks.map(candidate => candidate.id === id ? normalizeTask({...candidate, ...changes, updatedAt: new Date().toISOString()}) : candidate);
      if (!persist(next)) return false;
    }
    render(); feedback('Task planning details saved.');
    return true;
  }
  async function reassign(id, assignee) {
    if (!team.some(person => person.n === assignee)) return;
    if (server) {
      try { const saved = await call('PATCH', `/api/tasks/${id}`, {assignee}); apply(tasks.map(t => t.id === id ? saved : t)); }
      catch (error) { feedback(error.message); return; }
    } else {
      const next = tasks.map(task => task.id === id ? {...task, assignee, status: task.status === 'done' ? 'done' : 'queued'} : task);
      if (!persist(next)) return;
    }
    render(); feedback(`Task moved to ${displayName(assignee)}.`);
  }
  async function reviewTask(task,action,comments=''){
    try{
      const entry={draftVersion:task.history?.length||1,action,by:'You',at:new Date().toISOString(),feedback:action==='revise'?comments:''};
      if(server){const saved=await call('PATCH',`/api/tasks/${task.id}`,{action,feedback:comments,version:task.version||0});apply(tasks.map(t=>t.id===task.id?saved:t));}
      else{
        const next=tasks.map(t=>t.id===task.id?{...t,status:action==='approve'?'done':'queued',feedback:comments,reviewHistory:[...(t.reviewHistory||[]),entry],version:(t.version||0)+1,updatedAt:new Date().toISOString()}:t);
        if(!persist(next))return;
        changed(task.assignee,action==='approve'?'done':'queued',task.title);
      }
      draftClear(draftKey(task,'review'));render();feedback(action==='approve'?'Draft approved.':'Revision requested. The previous draft stays in history.');
    }catch(error){feedback(error.message);}
  }
  function reviewControls(task,article){
    article.append(createVersionReview(task));
    const approve=action('Approve & finish',()=>reviewTask(task,'approve'));approve.className='task-primary';article.append(approve);
    const form=node('form'),label=node('label','Revision comments'),input=node('textarea'),key=draftKey(task,'review');
    input.id=`review-${task.id}`;label.htmlFor=input.id;input.required=true;input.maxLength=5000;input.rows=3;input.value=draftRead(key);
    input.oninput=()=>{input.setCustomValidity('');draftWrite(key,input.value);};
    const submit=node('button','Request revision');submit.type='submit';
    form.append(label,input,submit);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('Describe the changes needed.');input.reportValidity();return;}reviewTask(task,'revise',input.value.trim());};article.append(form);
  }
  // An agent that asked instead of guessing: show its questions and take the answers.
  async function answerTask(task,answer){
    try{const saved=await call('PATCH',`/api/tasks/${task.id}`,{action:'answer',answer,version:task.version||0});apply(tasks.map(t=>t.id===task.id?saved:t));draftClear(draftKey(task,'answer'));render();feedback(`Answer sent. ${displayName(task.assignee)} picks the task up again.`);}
    catch(error){feedback(error.message);}
  }
  function answerControls(task,article){
    article.append(node('p',`${displayName(task.assignee)} needs more information before drafting:`,'task-agent'),node('div',task.questions,'task-result task-questions'));
    const form=node('form'),label=node('label','Your answer'),input=node('textarea'),key=draftKey(task,'answer');
    input.id=`answer-${task.id}`;label.htmlFor=input.id;input.required=true;input.maxLength=3000;input.rows=3;input.value=draftRead(key);
    input.oninput=()=>{input.setCustomValidity('');draftWrite(key,input.value);};
    const submit=node('button','Send answer');submit.type='submit';submit.className='task-primary';
    form.append(label,input,submit);form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()){input.setCustomValidity('Write an answer first.');input.reportValidity();return;}answerTask(task,input.value.trim());};
    article.append(form);
  }
  function agentActions(task, article, actions) {
    const agent = agentFor(task.assignee);
    if (task.status === 'blocked') answerControls(task, article);
    else if (task.status === 'queued' && task.error) {
      article.append(node('p', `The agent could not finish: ${task.error}`, 'task-error'));
      actions.append(action('Try again', () => update(task.id, 'queued')));
    } else if (task.status === 'queued') article.append(node('p', 'Waiting for the AI agent to pick this up.', 'task-agent'));
    else if (task.status === 'active') article.append(node('p', agent.mode === 'claude' ? 'The AI agent is working on this…' : 'Dry run in progress…', 'task-agent'));
    else {
      article.append(node('p', task.by === 'dry-run' ? 'Dry run result, not AI output. Review before use.' : task.by ? `Draft by Claude (${task.by}). Review before use.` : 'Result', 'task-agent'));
      if(task.status==='review')reviewControls(task,article);
      else if(task.status==='done')article.append(createVersionReview(task));
      else article.append(node('div', task.result, 'task-result'));
    }
    article.append(actions);
  }
  function planningEditor(task) {
    const details=node('details',undefined,'task-planning-editor');
    details.append(node('summary','Edit priority, due date & dependencies'));
    const form=node('form');
    const priorityLabel=node('label','Priority'),priority=node('select');priorityLabel.htmlFor=`priority-${task.id}`;priority.id=priorityLabel.htmlFor;
    for(const value of ['urgent','high','normal','low']){const option=node('option',value[0].toUpperCase()+value.slice(1));option.value=value;priority.append(option);}
    priority.value=task.priority||'normal';
    const dateLabel=node('label','Due date'),dueDate=node('input');dateLabel.htmlFor=`due-${task.id}`;dueDate.id=dateLabel.htmlFor;dueDate.type='date';dueDate.value=task.dueDate||'';
    const fieldset=node('fieldset',undefined,'task-edit-dependencies'),legend=node('legend','Blocked by');fieldset.append(legend);
    for(const dependency of tasks.filter(candidate=>candidate.id!==task.id)){
      const label=node('label',undefined,'dependency-option'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=dependency.id;checkbox.checked=(task.blockedBy||[]).includes(dependency.id);
      label.append(checkbox,node('span',`${dependency.title} · ${displayName(dependency.assignee)}`));fieldset.append(label);
    }
    const save=node('button','Save planning details','task-primary');save.type='submit';
    form.append(priorityLabel,priority,dateLabel,dueDate,fieldset,save);
    form.onsubmit=event=>{event.preventDefault();editPlan(task.id,{priority:priority.value,dueDate:dueDate.value||null,blockedBy:[...fieldset.querySelectorAll('input:checked')].map(input=>input.value)});};
    details.append(form);return details;
  }
  const announce = () => document.dispatchEvent(new CustomEvent('officetasks:change'));
  function render() {
    refreshTaskPlanningControls();
    const focused=el('taskList').contains(document.activeElement)&&document.activeElement.tagName==='TEXTAREA'?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
    announce();
    const list = el('taskList'); list.replaceChildren();
    const done = tasks.filter(t => t.status === 'done').length;
    el('taskCount').textContent = tasks.length - done;
    el('taskSummary').textContent = `${tasks.length} tasks · ${done} done`;
    el('exportTasks').disabled = tasks.length === 0;
    const visible = tasks.filter(t => (el('taskFilter').value === 'all' || t.status === el('taskFilter').value) &&
      (el('agentFilter').value === 'all' || t.assignee === el('agentFilter').value));
    if (!visible.length) list.append(node('p', tasks.length ? 'No tasks match this filter.' : 'No tasks yet. Add the first job for your team.', 'task-empty'));
    for (const task of visible) {
      const article = node('article', undefined, 'task-item');
      article.id=`task-${task.id}`;
      const agent = agentFor(task.assignee);
      article.append(node('h3', task.title), node('div', `${displayName(task.assignee)} · ${states[task.status]}${agent ? ` · AI agent${agent.mode === 'claude' ? ` · ${agent.model}` : ''}` : ''}`, 'task-meta'));
      const priority=node('span',(task.priority||'normal')[0].toUpperCase()+(task.priority||'normal').slice(1),`priority-badge ${task.priority||'normal'}`);
      article.append(priority);
      if(task.dueDate)article.append(node('p',`Due ${task.dueDate}`,'task-due'));
      const blockers=dependencies(task);
      if(blockers.length)article.append(node('p',`Blocked by: ${blockers.map(dependency=>dependency.title).join(', ')}`,'task-dependency'));
      article.append(planningEditor(task));
      if (task.brief) article.append(node('p', task.brief));
      const actions = node('div', undefined, 'task-actions');
      if (!team.some(person => person.n === task.assignee)) {
        article.append(node('p', 'This assignee comes from an old prototype. Pick a team member to continue.'));
        const select = node('select'); select.setAttribute('aria-label', `New assignee for ${task.title}`);
        for (const person of team) { const option = node('option', displayName(person.n)); option.value = person.n; select.append(option); }
        actions.append(action('Move task', () => reassign(task.id, select.value)));
        if (task.result) article.append(node('div', task.result, 'task-result'));
        article.append(select, actions); list.append(article); continue;
      }
      actions.append(action('Show character', () => { el('taskDialog').close(); locate(task.assignee); }));
      if (agent) { agentActions(task, article, actions); list.append(article); continue; }
      if(task.status==='review'){reviewControls(task,article);article.append(actions);list.append(article);continue;}
      if (task.status === 'queued') {
        const start=action('Start task',()=>update(task.id,'active'));start.disabled=blockers.length>0;
        if(blockers.length)start.title=`Finish ${blockers.map(dependency=>dependency.title).join(', ')} first.`;
        actions.append(start);
      }
      if (task.status === 'active') {
        actions.append(action('Back to queue', () => update(task.id, 'queued')));
        const form = node('form');
        const label = node('label', 'Result'); label.htmlFor = `result-${task.id}`;
        const input = node('textarea'); input.id = label.htmlFor; input.required = true; input.maxLength = 10000; input.rows = 3;
        const key=draftKey(task,'result');input.value=draftRead(key);
        input.placeholder = 'Write the result or a document link before finishing the task';
        const submit = node('button', 'Save result & finish'); submit.type = 'submit'; submit.className = 'task-primary';
        const footer = node('div', undefined, 'task-actions'); footer.append(submit);
        form.append(label, input, footer);
        form.onsubmit = event => {
          event.preventDefault();
          if (!input.value.trim()) { input.setCustomValidity('Fill in the result first.'); input.reportValidity(); return; }
          update(task.id, 'done', input.value.trim());
        };
        input.oninput = () => {input.setCustomValidity('');draftWrite(key,input.value);};
        article.append(actions, form);
      } else {
        if (task.status === 'done') article.append(node('div', task.result, 'task-result'));
        article.append(actions);
      }
      list.append(article);
    }
    if(focused){const input=document.getElementById(focused.id);if(input){input.focus({preventScroll:true});input.setSelectionRange(focused.start,focused.end);}}
  }
  // Look for the server once at start. A static host (or no server) keeps the browser-only behaviour.
  async function connect() {
    let info;
    try {
      const response = await fetch('/api/agents', {cache: 'no-store'});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
      info = await response.json();
    } catch { return; }
    let list = await call('GET', '/api/tasks').catch(() => null);
    if (!list) return;
    // First visit with the server: carry over tasks this browser saved before, if the server has none.
    if (!list.length && storageHealthy && tasks.length) {
      list = await call('POST', '/api/tasks/import', tasks).then(imported => { feedback(`${imported.length} tasks from this browser moved to the server.`); return imported; }).catch(() => list);
    }
    server = info;
    tasks = list.map(normalizeTask);
    const names = Object.keys(info.members).map(displayName).join(', ');
    el('taskNote').textContent = info.mode === 'claude'
      ? `${names} works with Claude and submits drafts for your review. Everyone else is a simulation; change their status by hand.`
      : `${names} is connected in dry-run mode (no API key yet), so results are placeholders. Everyone else is a simulation; change their status by hand.`;
    el('saveNote').textContent = 'Saved on the StudioOps server. Export tasks to keep a copy.';
    render();
    tasks.filter(t => t.status === 'active' && team.some(person => person.n === t.assignee)).forEach(t => changed(t.assignee));
    document.dispatchEvent(new CustomEvent('officetasks:server', {detail: info}));
    setInterval(async () => {
      if(polling||writing)return;polling=true;const ticket=mutation;
      const latest = await call('GET', '/api/tasks').catch(() => null);
      polling=false;if(ticket!==mutation)return;
      if (!latest || JSON.stringify(latest) === JSON.stringify(tasks)) return;
      apply(latest);render();
    }, 2500);
  }
  window.officeTasks = {
    activeFor: name => tasks.find(t => t.assignee === name && t.status === 'active'),
    list: () => tasks.map(t => ({...t})),
    people: () => team.map(person => ({...person})),
    agents: () => team.map(person => ({...person, agent: agentFor(person.n)})).filter(person => person.agent),
    agentFor,
    update,
    editPlan,
    async configureAgent(name, changes) {
      if (!server) throw new Error('Start the StudioOps task server to configure AI agents.');
      const saved = await call('PATCH', `/api/agents/${encodeURIComponent(name)}`, changes);
      server.members[name] = {...server.members[name], role: saved.role, model: saved.model, system: saved.system};
      document.dispatchEvent(new CustomEvent('officetasks:server', {detail: server}));
      return saved;
    },
    focus(id) {
      const task=tasks.find(candidate=>candidate.id===id);
      if(!task)return;
      this.open(task.assignee,task.status);
      requestAnimationFrame(()=>{
        const article=el(`task-${id}`);
        article?.scrollIntoView({block:'center'});
        if(task.status==='active'&&!agentFor(task.assignee))article?.querySelector('textarea')?.focus({preventScroll:true});
      });
    },
    open(name, status = 'all') {
      if (name) el('taskAssignee').value = name;
      el('agentFilter').value = name || 'all';
      el('taskFilter').value = status; render();
      el('taskDialog').showModal();
      el('taskTitle').focus();
    },
    init(people, onChange, onLocate) {
      team = people; changed = onChange; locate = onLocate;
      for (const person of team) {
        for (const id of ['taskAssignee', 'agentFilter']) {
          const option = node('option', `${displayName(person.n)} · ${person.role}`); option.value = person.n; el(id).append(option);
        }
      }
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!Array.isArray(parsed) || !parsed.every(validTask) || new Set(parsed.map(t => t.id)).size !== parsed.length ||
            new Set(parsed.filter(t => t.status === 'active').map(t => t.assignee)).size !== parsed.filter(t => t.status === 'active').length) throw new Error('Invalid task data');
          tasks = parsed.map(normalizeTask);
        }
      } catch { storageHealthy = false; feedback('Task data cannot be read. The old data is kept; changes are blocked.'); }
      for (const name of new Set(tasks.filter(task => !team.some(person => person.n === task.assignee)).map(task => task.assignee))) {
        const option = node('option', `${name} (old prototype)`); option.value = name; el('agentFilter').append(option);
      }
      el('closeTasks').onclick = () => el('taskDialog').close();
      el('taskFilter').onchange = render; el('agentFilter').onchange = render;
      el('taskForm').onsubmit = async event => {
        event.preventDefault();
        const title = el('taskTitle').value.trim();
        if (!title) { el('taskTitle').setCustomValidity('Enter a task name.'); el('taskTitle').reportValidity(); return; }
        const draft = {
          title, assignee: el('taskAssignee').value, brief: el('taskBrief').value.trim(), status: 'queued', result: '',
          priority: el('taskPriority')?.value || 'normal', dueDate: el('taskDueDate')?.value || null,
          blockedBy: [...(el('taskBlockedBy')?.querySelectorAll('input:checked') || [])].map(input => input.value)
        };
        let task;
        if (server) {
          try { task = normalizeTask(await call('POST', '/api/tasks', draft)); tasks = [task, ...tasks]; if (task.status !== 'queued') changed(task.assignee, task.status, task.title); }
          catch (error) { feedback(error.message); return; }
        } else {
          task = normalizeTask({id: crypto.randomUUID(), ...draft, createdAt: new Date().toISOString()});
          if (!persist([task, ...tasks])) return;
        }
        el('taskTitle').value = ''; el('taskBrief').value = ''; el('taskPriority').value = 'normal'; el('taskDueDate').value = '';
        el('taskTitle').value = ''; el('taskBrief').value = '';
        if(el('taskPriority'))el('taskPriority').value = 'normal';
        if(el('taskDueDate'))el('taskDueDate').value = '';
        el('taskBlockedBy')?.querySelectorAll('input').forEach(input => {input.checked=false;});
        el('agentFilter').value = 'all'; el('taskFilter').value = 'all';
        render(); feedback(`Task added for ${displayName(task.assignee)}${agentFor(task.assignee) ? '. The AI agent will pick it up.' : '.'}`); el('taskTitle').focus();
      };
      el('taskTitle').oninput = () => el('taskTitle').setCustomValidity('');
      el('exportTasks').onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], {type: 'application/json'}));
        const link = node('a'); link.href = url; link.download = 'kantor-ai-tasks.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); feedback('Task copy exported.');
      };
      render();
      tasks.filter(t => t.status === 'active' && team.some(person => person.n === t.assignee)).forEach(t => changed(t.assignee));
      connect();
    }
  };
})();
