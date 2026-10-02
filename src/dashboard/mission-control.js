import { DIVISIONS, FLOOR_NAMES } from './floor-plan-data.js';

const statusColors = {
  'AI draft': 'var(--mc-violet)',
  'Working': 'var(--mc-cyan)',
  'Moving': 'var(--mc-amber)',
  'On break': 'var(--mc-amber)',
  'At desk': 'var(--mc-green)',
  'Queued': 'var(--mc-muted)',
  'Review': 'var(--mc-violet)',
  'Needs input': 'var(--mc-amber)'
};
const divisionColors = Object.fromEntries(DIVISIONS.map(division => [division.id, division.color]));
const divisionTags = {leadership:'LEAD', marketing:'MKT', engineering:'ENG', service:'CX'};
const el = id => document.getElementById(id);
const text = (tag, value, className) => {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
};
let timer = 0;
let previousTasks = new Map();
let knownTaskIds = false;
let rosterSignature = '';

function memberTask(member, tasks) {
  return tasks.find(task => task.assignee === member.name && ['active', 'queued', 'blocked', 'review'].includes(task.status));
}

function memberStatus(member, task) {
  if (task?.status === 'active' && window.officeTasks?.agentFor?.(member.name)) return 'AI draft';
  if (task?.status === 'blocked') return 'Needs input';
  if (task?.status === 'review') return 'Review';
  if (task?.status === 'queued') return 'Queued';
  if (member.state === 'walk' || member.state === 'stairs') return 'Moving';
  if (member.state === 'break' || member.state === 'pray' || member.state === 'drink' || member.state === 'lounge') return 'On break';
  if (member.state === 'work' && member.atDesk) return 'At desk';
  return 'Working';
}

function renderRoster(team, selectedName, tasks) {
  const root = el('team-roster');
  if (!root) return;
  const focusedName = root.contains(document.activeElement) ? document.activeElement.dataset.memberName : '';
  const signature = JSON.stringify(team.map(member => {
    const task = memberTask(member, tasks);
    return [member.name, member.initials, member.role, member.group, member.floor, member.state, member.atDesk, selectedName === member.name, task?.status, task?.title];
  }));
  if (signature === rosterSignature) return;
  rosterSignature = signature;
  const roster = team.map(member => {
    const task = memberTask(member, tasks);
    const status = memberStatus(member, task);
    const button = text('button', undefined, `roster-member${selectedName === member.name ? ' selected' : ''}`);
    button.type = 'button';
    button.dataset.memberName = member.name;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `${member.name}, ${member.role}, ${status}, ${FLOOR_NAMES[member.floor] || 'in transit'}`);
    button.style.setProperty('--division-color', divisionColors[member.group] || '#91a0b5');
    const initials = text('span', member.initials, 'roster-initials');
    initials.setAttribute('aria-hidden', 'true');
    const info = text('span', undefined, 'roster-info');
    info.append(text('span', member.name, 'roster-name'));
    const meta = text('span', undefined, 'roster-meta');
    meta.append(text('small', divisionTags[member.group] || 'TEAM', 'roster-division'));
    meta.append(text('span', task?.title || member.role, 'roster-role'));
    info.append(meta);
    const badge = text('span', undefined, 'roster-status');
    badge.style.setProperty('--status-color', statusColors[status]);
    badge.append(text('i'));
    badge.append(document.createTextNode(status));
    button.append(initials, info, badge);
    button.addEventListener('click', () => {
      if (member.floor && window.officeScene?.snapshot?.().floor !== member.floor) window.officeScene?.setFloor(member.floor);
      window.officeScene?.select(member.name);
    });
    return button;
  });
  root.replaceChildren(...roster);
  el('roster-count').textContent = `${team.length} MEMBERS`;
  if (focusedName) root.querySelector(`[data-member-name="${CSS.escape(focusedName)}"]`)?.focus({preventScroll:true});
}

function renderKpis(team, tasks, agents) {
  const root = el('telemetry-kpis');
  const counts = [
    ['Queued', tasks.filter(task => ['queued', 'blocked'].includes(task.status)).length, 'var(--mc-amber)'],
    ['In progress', tasks.filter(task => task.status === 'active').length, 'var(--mc-cyan)'],
    ['Needs review', tasks.filter(task => task.status === 'review').length, 'var(--mc-violet)'],
    ['AI agents', agents.length, 'var(--mc-violet)']
  ];
  root.replaceChildren(...counts.map(([label, count, color]) => {
    const card = text('div', undefined, 'telemetry-kpi');
    card.style.setProperty('--kpi-color', color);
    card.append(text('strong', String(count)), text('span', label));
    return card;
  }));
}

function appendTaskEvents(tasks) {
  const list = el('logList');
  const current = new Map(tasks.map(task => [task.id, `${task.status}:${task.version || 0}:${task.updatedAt || ''}`]));
  if (knownTaskIds) {
    for (const task of tasks) {
      const signature = current.get(task.id);
      if (!previousTasks.has(task.id) || previousTasks.get(task.id) !== signature) {
        const row = document.createElement('li');
        row.dataset.feed = window.officeTasks?.agentFor?.(task.assignee) ? 'agents' : 'team';
        const time = text('time', new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}));
        const message = text('span', `${task.assignee} · ${task.title} · ${task.status.replaceAll('-', ' ')}`, 'log-text');
        row.append(time, message);
        list.prepend(row);
        while (list.children.length > 80) list.lastElementChild.remove();
      }
    }
  }
  previousTasks = current;
  knownTaskIds = true;
}

function applyLogFilter(filter) {
  document.querySelectorAll('#logList li').forEach(row => {
    if (!row.dataset.feed) row.dataset.feed = 'team';
    row.hidden = filter !== 'all' && row.dataset.feed !== filter;
  });
  document.querySelectorAll('[data-log-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.logFilter === filter);
    button.setAttribute('aria-pressed', String(button.dataset.logFilter === filter));
  });
}

function render() {
  const snapshot = window.officeScene?.snapshot?.();
  if (!snapshot?.team) return;
  const team = snapshot.team;
  const tasks = window.officeTasks?.list?.() || [];
  const agents = window.officeTasks?.agents?.() || [];
  const active = team.length;
  const busy = snapshot.paused;
  el('header-active-count').textContent = String(active);
  el('header-agent-count').textContent = String(agents.length);
  el('campus-count').textContent = String(team.length);
  el('studio-pulse-detail').textContent = busy ? 'Simulation paused' : `${active} members in the studio`;
  el('studio-pulse').classList.toggle('paused', busy);
  el('simulation-status').textContent = busy ? 'Paused' : snapshot.routine ? 'Live routine' : 'Manual dispatch';

  const occupied = new Map([1, 2, 3, 4].map(level => [level, team.filter(member => member.floor === level && member.state !== 'stairs').length]));
  for (const [level, count] of occupied) {
    const button = document.querySelector(`#floors [data-floor="${level}"]`);
    const badge = button?.querySelector('.floor-count');
    if (badge) badge.textContent = String(count);
    button?.classList.toggle('zone-active', snapshot.floor === level);
    button?.setAttribute('aria-label', `${FLOOR_NAMES[level]}, ${count} team members, ${snapshot.floor === level ? 'selected' : 'select zone'}`);
  }

  renderRoster(team, snapshot.selected, tasks);
  renderKpis(team, tasks, agents);
  const claudeAgents = agents.filter(agent => agent.agent.mode === 'claude').length;
  const dryAgents = agents.length - claudeAgents;
  el('agent-engine-detail').textContent = agents.length
    ? `${agents.length} connected · ${claudeAgents ? 'Claude API' : 'dry-run'}${dryAgents && claudeAgents ? ` · ${dryAgents} dry-run` : ''}`
    : 'Task server unavailable';
  el('agent-engine-status').textContent = agents.length ? 'ONLINE' : 'OFFLINE';
  el('agent-engine-status').classList.toggle('offline', !agents.length);
  el('map-coordinate').textContent = snapshot.selected
    ? (() => { const member = team.find(person => person.name === snapshot.selected); return member ? `X ${member.position[0].toFixed(1)} · Z ${member.position[2].toFixed(1)}` : 'COORD —'; })()
    : `ZONE ${String(snapshot.floor).padStart(2, '0')} · ${snapshot.floor ? 'ACTIVE' : 'CAMPUS'}`;
  appendTaskEvents(tasks);
  applyLogFilter(document.querySelector('[data-log-filter].active')?.dataset.logFilter || 'all');
}

export function initMissionControl() {
  if (timer) return;
  document.querySelectorAll('[data-log-filter]').forEach(button => button.addEventListener('click', () => applyLogFilter(button.dataset.logFilter)));
  const refresh = () => render();
  document.addEventListener('officetasks:change', refresh);
  document.addEventListener('officetasks:server', refresh);
  const logList = el('logList');
  new MutationObserver(() => applyLogFilter(document.querySelector('[data-log-filter].active')?.dataset.logFilter || 'all'))
    .observe(logList, {childList:true});
  timer = window.setInterval(refresh, 900);
  refresh();
}
