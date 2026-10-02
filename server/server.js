// Kantor Kita server: serves public/ and a small task API. Tasks assigned to a connected
// team member (server/agents.js) are worked by Claude, or by a labelled dry run when no API key is set.
// No login yet, so it only listens on this machine.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
try { process.loadEnvFile(process.env.ENV_FILE || path.join(ROOT, '.env')); } catch { /* no .env file: dry run */ }

const defaultAgents = require('./agents');
let agents = structuredClone(defaultAgents);
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const AGENT_CONFIG_FILE = path.join(DATA_DIR, 'agent-config.json');
const HOST = process.env.HOST || '0.0.0.0', PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const API_URL = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;
const DRY_RUN = !API_KEY || process.env.ANTHROPIC_DRY_RUN === '1';
const STATES = new Set(['queued', 'active', 'blocked', 'review', 'done']);
const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low']);
// Which model a member uses: their own, else the .env default.
const modelOf = agent => agent.model || MODEL;

// ---- storage: one JSON file, written atomically ----
fs.mkdirSync(DATA_DIR, {recursive: true});
let agentOverrides = {};
try {
  const saved = JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, 'utf8'));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('not an object');
  for (const [name, override] of Object.entries(saved)) {
    if (!defaultAgents[name] || !override || typeof override !== 'object') continue;
    const clean = {};
    if (typeof override.system === 'string' && override.system.trim() && override.system.length <= 10000) clean.system = override.system;
    if (typeof override.model === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(override.model)) clean.model = override.model;
    if (Object.keys(clean).length) {
      agentOverrides[name] = clean;
      agents[name] = {...agents[name], ...clean};
    }
  }
} catch (error) { if (error.code !== 'ENOENT') console.error(`Cannot read ${AGENT_CONFIG_FILE}: ${error.message}. Defaults will be used.`); }
function saveAgentConfig() {
  const tmp = `${AGENT_CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(agentOverrides, null, 2));
  fs.renameSync(tmp, AGENT_CONFIG_FILE);
}
let tasks = [];
try { tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); if (!Array.isArray(tasks)) throw new Error('not a list'); }
catch (error) { if (error.code !== 'ENOENT') { console.error(`Cannot read ${TASKS_FILE}: ${error.message}. Fix or move the file, then restart.`); process.exit(1); } }
let durable = JSON.stringify(tasks);
function save() {
  try {
  const tmp = `${TASKS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, TASKS_FILE);
  durable=JSON.stringify(tasks);
  } catch(error) { tasks=JSON.parse(durable); throw error; }
}
const now = () => new Date().toISOString();
const MEMBERS = new Set(['Aiden Cross','Ravi Menon','Sofia Reyes','Mei Lin','Nadia Osei','Yuki Sato','Liam Novak','Omar Farid','Arjun Patel','Jonas Berg','Carlos Vega','Hana Park','Isla Murray']);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function validDueDate(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function unresolvedDependency(task) {
  return (task.blockedBy || []).some(id => tasks.some(dependency => dependency.id === id && dependency.status !== 'done'));
}
function createsDependencyCycle(taskId, blockedBy) {
  const seen = new Set();
  const reachesTask = id => {
    if (id === taskId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const dependency = tasks.find(candidate => candidate.id === id);
    return (dependency?.blockedBy || []).some(reachesTask);
  };
  return blockedBy.some(reachesTask);
}
function validDependencies(ids, taskId) {
  return Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string') &&
    new Set(ids).size === ids.length && !ids.includes(taskId) && ids.every(id => tasks.some(task => task.id === id)) &&
    !createsDependencyCycle(taskId, ids);
}

// ---- agent worker: one task at a time per connected member, oldest first ----
const busy = new Set();
async function askClaude(agent, task) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(API_URL, {
      method: 'POST', signal: controller.signal,
      headers: {'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01'},
      body: JSON.stringify({model: modelOf(agent), max_tokens: 2000, system: agent.system,
        messages: [{role: 'user', content: `Task: ${task.title}\n\nBrief:\n${task.brief || '(no brief given)'}${task.feedback ? `\n\nPrevious draft:\n${task.result}\n\nRevision requested:\n${task.feedback}` : ''}`}]})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Claude API returned ${response.status}`);
    const answer = (body.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n').trim();
    if (!answer) throw new Error('Claude returned an empty answer');
    return answer;
  } finally { clearTimeout(timer); }
}
async function dryRun(agent, task) {
  await new Promise(resolve => setTimeout(resolve, Number(process.env.DRY_RUN_DELAY_MS ?? 4000)));
  // Dry runs ask back when the brief is nearly empty, so the "Needs decision" flow can be tried without a key.
  if ((task.brief || '').trim().length < 12) return 'QUESTIONS:\n1. DRY RUN: who is this for, and what should it say?\n2. DRY RUN: any facts, links or deadlines to include?';
  return `DRY RUN: no ANTHROPIC_API_KEY is set, so this is placeholder text, not AI output.\n\n${agent.role} would draft: "${task.title}".\nBrief received: ${task.brief || '(none)'}${task.feedback ? `\nRevision requested: ${task.feedback}` : ''}`;
}
async function work(name) {
  if (busy.has(name)) return;
  const task = tasks.filter(t => t.assignee === name && t.status === 'queued' && !t.error && !unresolvedDependency(t)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!task || tasks.some(t => t.assignee === name && t.status === 'active')) return;
  busy.add(name);
  const runId=crypto.randomUUID();
  try {
    Object.assign(task, {status: 'active', runId, version:(task.version||0)+1, updatedAt: now()}); save();
    const input=structuredClone(task);
    const answer = DRY_RUN ? await dryRun(agents[name], input) : await askClaude(agents[name], input);
    const current = tasks.find(t => t.id === task.id);
    // The task may have been moved back to the queue or reassigned while the agent worked.
    if (current && current.status === 'active' && current.assignee === name && current.runId === runId) {
      const by=DRY_RUN?'dry-run':modelOf(agents[name]),asked=answer.match(/^QUESTIONS:\s*([\s\S]+)/);
      // The agent asked instead of guessing: park the task until someone answers.
      if(asked){Object.assign(current,{status:'blocked',questions:asked[1].trim().slice(0,2000),askedBy:by,runId:null,version:(current.version||0)+1,updatedAt:now()});save();return;}
      const draft={version:(current.history||[]).length+1,result:answer.slice(0,10000),by,createdAt:now(),feedback:input.feedback||''};
      Object.assign(current, {status:'review',result:draft.result,by:draft.by,history:[...(current.history||[]),draft],runId:null,version:(current.version||0)+1,updatedAt:now()});save();
    }
  } catch (error) {
    const current = tasks.find(t => t.id === task.id);
    if (current && current.status === 'active' && current.assignee === name && current.runId === runId) { Object.assign(current, {status: 'queued', runId:null, version:(current.version||0)+1, error: error.name === 'AbortError' ? 'Claude took too long to answer.' : error.message === 'fetch failed' ? 'Could not reach the Claude API. Check the internet connection.' : error.message, updatedAt: now()}); save(); }
    console.error(`Agent ${name} failed on "${task.title}": ${error.message}`);
  } finally { busy.delete(name); setImmediate(() => work(name)); }
}
const kick = () => Object.keys(agents).forEach(work);

// ---- HTTP ----
function send(res, status, body) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > 1e6) { reject(Object.assign(new Error('Request too large'), {status: 413})); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), {status: 400})); } });
  });
}
function newTask(input, preserveId = false) {
  if(!input||typeof input!=='object')return null;
  const title = text(input.title, 160), assignee = text(input.assignee, 80);
  if (!title || !assignee) return null;
  const status = STATES.has(input.status) ? input.status : 'queued', result = text(input.result, 10000);
  return {
    id: preserveId && typeof input.id === 'string' ? input.id : crypto.randomUUID(), title, assignee, brief: text(input.brief, 5000),
    status: ['done','review'].includes(status) && !result ? 'queued' : status,
    result, priority: PRIORITIES.has(input.priority) ? input.priority : 'normal',
    dueDate: validDueDate(input.dueDate) ? input.dueDate || null : null,
    blockedBy: Array.isArray(input.blockedBy) ? input.blockedBy.slice(0, 100) : [],
    createdAt: now()
  };
}
async function api(req, res, url) {
  if (url.pathname === '/api/agents' && req.method === 'GET')
    return send(res, 200, {mode: DRY_RUN ? 'dry-run' : 'claude', model: DRY_RUN ? null : MODEL, members: Object.fromEntries(Object.entries(agents).map(([name, a]) => [name, {role: a.role, model: modelOf(a), system: a.system}]))});
  const agentMatch=url.pathname.match(/^\/api\/agents\/([^/]+)$/);
  if(agentMatch&&req.method==='PATCH'){
    const name=decodeURIComponent(agentMatch[1]),agent=agents[name];
    if(!agent)return send(res,404,{error:'AI agent not found.'});
    const input=await readJson(req);
    if(!input||typeof input!=='object'||Array.isArray(input))return send(res,400,{error:'Expected an object.'});
    if(input.reset===true){delete agentOverrides[name];agents[name]=structuredClone(defaultAgents[name]);saveAgentConfig();return send(res,200,{name,role:agents[name].role,model:modelOf(agents[name]),system:agents[name].system});}
    const change={};
    if(input.system!==undefined){if(typeof input.system!=='string'||!input.system.trim()||input.system.length>10000)return send(res,400,{error:'System prompt must contain 1 to 10000 characters.'});change.system=input.system;}
    if(input.model!==undefined){if(typeof input.model!=='string'||! /^[a-zA-Z0-9._-]{1,100}$/.test(input.model))return send(res,400,{error:'Choose a valid model identifier.'});change.model=input.model;}
    if(!Object.keys(change).length)return send(res,400,{error:'Provide a model, system prompt, or reset action.'});
    agentOverrides[name]={...(agentOverrides[name]||{}),...change};agents[name]={...agent,...change};saveAgentConfig();
    return send(res,200,{name,role:agents[name].role,model:modelOf(agents[name]),system:agents[name].system});
  }
  if (url.pathname === '/api/tasks' && req.method === 'GET') return send(res, 200, tasks);
  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    const input=await readJson(req);
    if(input?.status!==undefined&&!STATES.has(input.status))return send(res,400,{error:'Unknown status.'});
    if(input?.priority!==undefined&&!PRIORITIES.has(input.priority))return send(res,400,{error:'Choose urgent, high, normal, or low priority.'});
    if(input?.dueDate!==undefined&&!validDueDate(input.dueDate))return send(res,400,{error:'Due date must be a valid YYYY-MM-DD date.'});
    const task = newTask(input); if (!task) return send(res, 400, {error: 'A task needs a title and an assignee.'});
    if(!MEMBERS.has(task.assignee))return send(res,400,{error:'Unknown assignee.'});
    if(input.blockedBy!==undefined&&!validDependencies(input.blockedBy,task.id))return send(res,400,{error:'Dependencies must reference existing tasks without duplicates or cycles.'});
    if(input.blockedBy!==undefined)task.blockedBy=input.blockedBy;
    if(task.status==='review'||task.status==='blocked'||(agents[task.assignee]&&task.status!=='queued'))return send(res,409,{error:'AI drafts must be generated before review.'});
    if(task.status==='active'&&tasks.some(t=>t.assignee===task.assignee&&t.status==='active'))return send(res,409,{error:'This member already has an active task.'});
    if(task.status==='active'&&unresolvedDependency(task))return send(res,409,{error:'Finish the blocking tasks before starting this task.'});
    tasks.unshift(task); save(); send(res, 201, task); setImmediate(kick); return;
  }
  // One-time move of tasks saved in a browser before the server existed; only into an empty store.
  if (url.pathname === '/api/tasks/import' && req.method === 'POST') {
    if (tasks.length) return send(res, 409, {error: 'The server already has tasks.'});
    const list = await readJson(req); if (!Array.isArray(list)) return send(res, 400, {error: 'Expected a list of tasks.'});
    if(tasks.length)return send(res,409,{error:'The server already has tasks.'});
    const imported = list.map(item => { const task = newTask(item,true); if (task && typeof item.createdAt === 'string') task.createdAt = item.createdAt; if(task&&Array.isArray(item.history))task.history=item.history; return task; }).filter(Boolean);
    const previousTasks=tasks;tasks=imported;
    if(new Set(tasks.map(task=>task.id)).size!==tasks.length||tasks.some(task=>!validDependencies(task.blockedBy,task.id))){tasks=previousTasks;return send(res,400,{error:'Imported task dependencies are invalid or cyclic.'});}
    // Imported work that was in progress by hand goes back to the queue.
    tasks.forEach(task => { if (task.status === 'active') task.status = 'queued'; });
    save(); kick(); return send(res, 201, tasks);
  }
  const match = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})$/);
  if (match && req.method === 'PATCH') {
    const task = tasks.find(t => t.id === match[1]); if (!task) return send(res, 404, {error: 'Task not found.'});
    const input = await readJson(req), change = {};
    if(!input||typeof input!=='object')return send(res,400,{error:'Expected an object.'});
    // Answering an agent's questions adds the answers to the brief and puts the task back in its queue.
    if(input.action==='answer'){
      if(task.status!=='blocked'||input.version!==(task.version||0))return send(res,409,{error:'These questions changed. Refresh and answer the latest ones.'});
      const answer=text(input.answer,3000);if(!answer)return send(res,400,{error:'Write an answer first.'});
      Object.assign(task,{status:'queued',brief:`${task.brief}\n\nQuestions from ${task.assignee}:\n${task.questions}\n\nAnswers:\n${answer}`.trim().slice(0,5000),questions:undefined,askedBy:undefined,error:undefined,runId:null,version:(task.version||0)+1,updatedAt:now()});
      save();send(res,200,task);setImmediate(kick);return;
    }
    if(input.action!==undefined){
      if(!['approve','revise'].includes(input.action))return send(res,400,{error:'Unknown action.'});
      if(task.status!=='review'||input.version!==(task.version||0))return send(res,409,{error:'This draft changed. Refresh and review the latest version.'});
      if(input.action==='revise'&&!text(input.feedback,5000))return send(res,400,{error:'Describe the changes needed.'});
      const decisionAt=now(),decision={draftVersion:task.history?.length||1,action:input.action,by:'You',at:decisionAt,feedback:input.action==='revise'?text(input.feedback,5000):''};
      Object.assign(task,{status:input.action==='approve'?'done':'queued',feedback:input.action==='revise'?text(input.feedback,5000):'',reviewedAt:input.action==='approve'?decisionAt:null,reviewHistory:[...(task.reviewHistory||[]),decision],runId:null,error:undefined,version:(task.version||0)+1,updatedAt:decisionAt});
      save();send(res,200,task);setImmediate(kick);return;
    }
    if (input.assignee !== undefined) { change.assignee = text(input.assignee, 80); if (!MEMBERS.has(change.assignee)) return send(res, 400, {error: 'Pick an assignee.'}); if (task.status !== 'done') change.status = 'queued'; }
    if (input.priority !== undefined) { if (!PRIORITIES.has(input.priority)) return send(res,400,{error:'Choose urgent, high, normal, or low priority.'}); change.priority=input.priority; }
    if (input.dueDate !== undefined) { if (!validDueDate(input.dueDate)) return send(res,400,{error:'Due date must be a valid YYYY-MM-DD date.'}); change.dueDate=input.dueDate||null; }
    if (input.blockedBy !== undefined) {
      if (!validDependencies(input.blockedBy,task.id))return send(res,400,{error:'Dependencies must reference existing tasks without duplicates or cycles.'});
      if(task.status==='active'&&input.blockedBy.some(id=>tasks.some(dependency=>dependency.id===id&&dependency.status!=='done')))return send(res,409,{error:'An active task cannot be blocked by unfinished work.'});
      change.blockedBy=input.blockedBy;
    }
    if (input.status !== undefined) {
      if (!STATES.has(input.status)||input.status==='review'||input.status==='blocked') return send(res, 400, {error: 'Unknown status.'});
      const assignee = change.assignee || task.assignee;
      if (input.status === 'active' && unresolvedDependency({...task,...change})) return send(res,409,{error:'Finish the blocking tasks before starting this task.'});
      if(task.status==='review'&&!change.assignee)return send(res,409,{error:'Approve this draft or request a revision.'});
      if (agents[assignee] && input.status !== 'queued') return send(res, 409, {error: 'This member is connected to an AI agent; it starts and finishes its own tasks.'});
      if (input.status === 'active' && tasks.some(t => t.id !== task.id && t.assignee === assignee && t.status === 'active')) return send(res, 409, {error: 'This member already has an active task.'});
      if (input.status === 'done' && !text(input.result, 10000)) return send(res, 400, {error: 'Write a result before finishing.'});
      change.status = input.status; change.result = input.status === 'done' ? text(input.result, 10000) : '';
    }
    if(!Object.keys(change).length)return send(res,400,{error:'Provide an assignee, status, or review action.'});
    // Moving a task back to the queue clears a previous agent error so it is tried again.
    Object.assign(task, change, {runId:null,version:(task.version||0)+1,error: undefined, updatedAt: now()}); save(); kick(); return send(res, 200, task);
  }
  send(res, 404, {error: 'Not found.'});
}
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon'};
function serveFile(res, url) {
  let file;
  try { file = path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return send(res, 400, {error: 'Bad path.'}); }
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, {error: 'Forbidden.'});
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404, {'content-type': 'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache'}); res.end(data);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  if (!url.pathname.startsWith('/api/')) return serveFile(res, url);
  try { await api(req, res, url); }
  catch (error) { send(res, error.status || 500, {error: error.status ? error.message : 'Server error.'}); if (!error.status) console.error(error); }
});
server.listen(PORT, HOST, () => {
  console.log(`StudioOps: http://${HOST}:${PORT}`);
  console.log(DRY_RUN ? 'AI agents: dry run (set ANTHROPIC_API_KEY in .env to use Claude)' : `AI agents: ${Object.entries(agents).map(([name, a]) => `${name} → ${modelOf(a)}`).join(', ')}`);
  // Tasks left active by a previous run go back to the queue and are picked up again.
  let reset = false; tasks.forEach(task => { if (task.status === 'active' && agents[task.assignee]) { task.status = 'queued'; reset = true; } }); if (reset) save();
  kick();
});
