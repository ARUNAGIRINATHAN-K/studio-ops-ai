const statuses = [
  { id: 'queued', label: 'Queued', includes: ['queued', 'blocked'] },
  { id: 'active', label: 'In progress' },
  { id: 'review', label: 'Needs review' },
  { id: 'done', label: 'Done' }
];
const priorityLabels = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
const taskStateLabels = { queued: 'Queued', active: 'In progress', blocked: 'Needs decision', review: 'Needs review', done: 'Done' };
const node = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
};
const getFilters = () => ({
  assignee: document.getElementById('hub-assignee-filter').value,
  priority: document.getElementById('hub-priority-filter').value
});
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let selectedView = 'kanban';
let populatedAssignees = false;

function filteredTasks() {
  const { assignee, priority } = getFilters();
  return (window.officeTasks?.list() || []).filter(task =>
    (assignee === 'all' || task.assignee === assignee) &&
    (priority === 'all' || (task.priority || 'normal') === priority)
  );
}

function blockersFor(task, allTasks) {
  const dependencies = new Map(allTasks.map(candidate => [candidate.id, candidate]));
  return (task.blockedBy || []).map(id => dependencies.get(id)).filter(candidate => candidate && candidate.status !== 'done');
}

function fillAssigneeFilter() {
  if (populatedAssignees) return;
  const select = document.getElementById('hub-assignee-filter');
  const members = window.officeTasks?.people?.() || [];
  for (const member of members) {
    const option = node('option', `${member.initials} · ${member.role}`);
    option.value = member.n;
    select.append(option);
  }
  populatedAssignees = members.length > 0;
}

function renderStats(tasks) {
  const root = document.getElementById('task-hub-stats');
  const definitions = [
    ['Queued', tasks.filter(task => task.status === 'queued').length, 'queued'],
    ['In progress', tasks.filter(task => task.status === 'active').length, 'active'],
    ['Needs review', tasks.filter(task => task.status === 'review').length, 'review'],
    ['Done', tasks.filter(task => task.status === 'done').length, 'done']
  ];
  root.replaceChildren(...definitions.map(([label, count, status]) => {
    const item = node('div', undefined, `task-hub-stat ${status}`);
    item.append(node('strong', String(count)), node('span', label));
    return item;
  }));
}

function makeCard(task, allTasks, agenda = false) {
  const agent = window.officeTasks?.agentFor(task.assignee);
  const blockers = blockersFor(task, allTasks);
  const article = node('article', undefined, `hub-task-card${agenda ? ' agenda-task-card' : ''}${task.status === 'blocked' ? ' blocked' : ''}`);
  const header = node('div', undefined, 'hub-task-card-header');
  const priority = node('span', priorityLabels[task.priority || 'normal'], `priority-badge ${task.priority || 'normal'}`);
  header.append(priority);
  if (agent) header.append(node('span', 'AI agent', 'task-agent-badge'));
  article.append(header);
  article.append(node('h3', task.title));
  article.append(node('p', `${task.assignee} · ${taskStateLabels[task.status] || task.status}`, 'hub-task-meta'));
  if (task.status === 'blocked') article.append(node('p', task.questions || 'Waiting for your answer before the agent continues.', 'hub-task-blockers'));
  if (task.dueDate) article.append(node('p', `Due ${task.dueDate}`, `hub-task-due${task.dueDate < localDate() && task.status !== 'done' ? ' overdue' : ''}`));
  if (blockers.length) {
    article.append(node('p', `Blocked by: ${blockers.map(blocker => blocker.title).join(', ')}`, 'hub-task-blockers'));
  }
  const actions = node('div', undefined, 'hub-task-actions');
  const open = node('button', 'Open task', 'btn');
  open.type = 'button';
  open.addEventListener('click', () => window.officeTasks?.focus(task.id));
  actions.append(open);
  if (!agent && ['queued', 'active'].includes(task.status)) {
    const move = document.createElement('select');
    move.setAttribute('aria-label', `Move ${task.title}`);
    for (const status of statuses.filter(item => ['queued', 'active', 'done'].includes(item.id))) {
      const option = node('option', status.id === task.status ? `Move: ${status.label}` : status.label);
      option.value = status.id;
      move.append(option);
    }
    move.value = task.status;
    move.addEventListener('change', async () => {
      if (move.value === 'done') {
        document.getElementById('task-hub-feedback').textContent = 'Open the task and enter a result before finishing it.';
        window.officeTasks?.focus(task.id);
        return;
      }
      const updated = await window.officeTasks?.update(task.id, move.value);
      if (!updated) move.value = task.status;
    });
    actions.append(move);
  }
  article.append(actions);

  const canDrag = !agenda && !agent && !['blocked', 'review', 'done'].includes(task.status);
  article.draggable = canDrag;
  if (canDrag) {
    article.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
      article.classList.add('dragging');
    });
    article.addEventListener('dragend', () => article.classList.remove('dragging'));
  }
  return article;
}

function renderKanban(tasks) {
  const board = document.getElementById('task-kanban');
  const allTasks = window.officeTasks?.list() || [];
  const doneTasks = tasks.filter(task => task.status === 'done');
  const collapsedDone = node('details', undefined, 'kanban-done-collapsed');
  const summary = node('summary', `Done · ${doneTasks.length}`);
  const collapsedCards = node('div', undefined, 'kanban-column-cards');
  if (!doneTasks.length) collapsedCards.append(node('p', 'No completed tasks', 'kanban-empty'));
  for (const task of doneTasks) collapsedCards.append(makeCard(task, allTasks));
  collapsedDone.append(summary, collapsedCards);
  board.replaceChildren(...statuses.map(status => {
    const column = node('section', undefined, `kanban-column ${status.id}`);
    column.dataset.status = status.id;
    const matching = tasks.filter(task => (status.includes || [status.id]).includes(task.status));
    const header = node('header', undefined, 'kanban-column-header');
    header.append(node('h2', status.label), node('span', String(matching.length), 'kanban-count'));
    column.append(header);
    const cards = node('div', undefined, 'kanban-column-cards');
    if (!matching.length) cards.append(node('p', 'No tasks', 'kanban-empty'));
    for (const task of matching) cards.append(makeCard(task, allTasks));
    column.append(cards);
    column.addEventListener('dragover', event => {
      if (['review'].includes(status.id)) return;
      event.preventDefault();
      column.classList.add('drop-target');
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target');
    });
    column.addEventListener('drop', async event => {
      event.preventDefault();
      column.classList.remove('drop-target');
      const id = event.dataTransfer.getData('text/plain');
      const task = allTasks.find(candidate => candidate.id === id);
      if (!task || task.status === status.id) return;
      if (status.id === 'review') return;
      if (status.id === 'done') {
        document.getElementById('task-hub-feedback').textContent = 'Open the task and enter a result before finishing it.';
        window.officeTasks?.focus(id);
        return;
      }
      const blockers = blockersFor(task, allTasks);
      if (status.id === 'active' && blockers.length) {
        document.getElementById('task-hub-feedback').textContent = `Finish ${blockers.map(blocker => blocker.title).join(', ')} before starting this task.`;
        return;
      }
      const updated = await window.officeTasks?.update(id, status.id);
      if (updated) document.getElementById('task-hub-feedback').textContent = `${task.title} moved to ${status.label}.`;
    });
    return column;
  }), collapsedDone);
}

function dateCategory(task, today, weekEnd) {
  if (!task.dueDate) return 'No due date';
  if (task.status !== 'done' && task.dueDate < today) return 'Overdue';
  if (task.dueDate === today) return 'Today';
  if (task.dueDate <= weekEnd) return 'This week';
  return 'Later';
}

function renderAgenda(tasks) {
  const root = document.getElementById('task-agenda');
  const allTasks = window.officeTasks?.list() || [];
  const today = localDate();
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = localDate(weekEndDate);
  const sections = ['Overdue', 'Today', 'This week', 'Later', 'No due date'];
  root.replaceChildren(...sections.map(label => {
    const section = node('section', undefined, `agenda-section${label === 'Overdue' ? ' overdue' : ''}`);
    const matching = tasks.filter(task => dateCategory(task, today, weekEnd) === label)
      .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || a.createdAt.localeCompare(b.createdAt));
    const heading = node('h2', label);
    heading.append(node('span', String(matching.length), 'agenda-count'));
    section.append(heading);
    const list = node('div', undefined, 'agenda-task-list');
    if (!matching.length) list.append(node('p', 'Nothing scheduled', 'agenda-empty'));
    for (const task of matching) list.append(makeCard(task, allTasks, true));
    section.append(list);
    return section;
  }));
}

function render() {
  fillAssigneeFilter();
  const tasks = filteredTasks();
  renderStats(tasks);
  renderKanban(tasks);
  renderAgenda(tasks);
}

function setView(view) {
  selectedView = view;
  const agenda = view === 'agenda';
  document.getElementById('kanban-panel').hidden = agenda;
  document.getElementById('agenda-panel').hidden = !agenda;
  document.querySelectorAll('[data-task-view]').forEach(button => {
    const selected = button.dataset.taskView === view;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
}

export function initTaskHub() {
  const buttons = document.querySelectorAll('[data-task-view]');
  buttons.forEach(button => button.addEventListener('click', () => setView(button.dataset.taskView)));
  document.getElementById('hub-assignee-filter').addEventListener('change', render);
  document.getElementById('hub-priority-filter').addEventListener('change', render);
  document.addEventListener('officetasks:change', render);
  document.addEventListener('officetasks:server', () => {
    populatedAssignees = false;
    render();
  });
  setView(window.matchMedia('(max-width: 767px)').matches ? 'agenda' : 'kanban');
  render();
}
