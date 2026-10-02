const modelChoices = [
  {value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5'},
  {value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5'}
];
let configuredName = null;

const node = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
};

function statusFor(agent, tasks) {
  const own = tasks.filter(task => task.assignee === agent.n);
  if (own.some(task => task.status === 'active')) return {label: 'Working', className: 'working'};
  if (own.some(task => task.status === 'review')) return {label: 'Draft ready', className: 'review'};
  if (own.some(task => task.status === 'blocked')) return {label: 'Needs input', className: 'blocked'};
  if (own.some(task => task.status === 'queued')) return {label: 'Queued', className: 'queued'};
  return {label: 'Idle', className: 'idle'};
}

function render() {
  const agents = window.officeTasks?.agents?.() || [];
  const tasks = window.officeTasks?.list?.() || [];
  const cards = document.getElementById('agent-monitor-cards');
  const count = document.getElementById('agent-monitor-count');
  count.textContent = agents.length ? `${agents.length} connected` : 'Unavailable';
  if (!agents.length) {
    cards.replaceChildren(node('p', 'Agent status is available when the task server is connected.', 'agent-monitor-empty'));
    return;
  }
  cards.replaceChildren(...agents.map(agent => {
    const card = node('article', undefined, 'agent-monitor-card');
    const status = statusFor(agent, tasks);
    const title = node('h3', `${agent.initials} · ${agent.role}`);
    const model = agent.agent.mode === 'claude' ? agent.agent.model : 'Dry-run mode';
    const currentTask = tasks.find(task => task.assignee === agent.n && ['active', 'review', 'blocked', 'queued'].includes(task.status));
    card.append(title, node('p', model, 'agent-model'));
    card.append(node('span', status.label, `agent-status ${status.className}`));
    card.append(node('p', currentTask?.title || 'No assigned task', 'agent-current-task'));
    const configure = node('button', 'Configure', 'btn');
    configure.type = 'button';
    configure.addEventListener('click', () => openConfig(agent));
    card.append(configure);
    return card;
  }));
}

function openConfig(agent) {
  configuredName = agent.n;
  const dialog = document.getElementById('agentConfigDialog');
  document.getElementById('agentConfigHeading').textContent = `${agent.initials} · ${agent.role}`;
  document.getElementById('agentConfigRole').textContent = `${agent.n} · ${agent.agent.mode === 'claude' ? 'Claude connected' : 'Dry-run mode'}`;
  const select = document.getElementById('agentConfigModel');
  select.replaceChildren(...modelChoices.map(choice => {
    const option = node('option', choice.label);
    option.value = choice.value;
    return option;
  }));
  if (![...select.options].some(option => option.value === agent.agent.model)) {
    const option = node('option', agent.agent.model);
    option.value = agent.agent.model;
    select.append(option);
  }
  select.value = agent.agent.model;
  document.getElementById('agentConfigSystem').value = agent.agent.system || '';
  document.getElementById('agentConfigFeedback').textContent = '';
  document.getElementById('agentPromptPreview').hidden = true;
  dialog.showModal();
}

export function initAgentMonitor() {
  const dialog = document.getElementById('agentConfigDialog');
  document.getElementById('closeAgentConfig').addEventListener('click', () => dialog.close());
  document.addEventListener('officetasks:server', render);
  document.addEventListener('officetasks:change', render);
  document.getElementById('previewAgentPrompt').addEventListener('click', () => {
    const preview = document.getElementById('agentPromptPreview');
    const sampleTask = document.getElementById('agentConfigSample')?.value || 'Write a concise status update for the team.';
    preview.replaceChildren(node('h2', 'Prompt preview'), node('pre', `${document.getElementById('agentConfigSystem').value}\n\nTask: ${sampleTask}\n\nBrief: Include the audience, facts, and expected result.`));
    preview.hidden = false;
  });
  document.getElementById('agentConfigForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!configuredName) return;
    const feedback = document.getElementById('agentConfigFeedback');
    const prompt = document.getElementById('agentConfigSystem').value;
    if (!prompt.trim()) {
      feedback.textContent = 'System prompt cannot be empty.';
      return;
    }
    try {
      await window.officeTasks.configureAgent(configuredName, {
        model: document.getElementById('agentConfigModel').value,
        system: prompt
      });
      feedback.textContent = 'Configuration saved. It applies to the next task.';
      render();
      dialog.close();
    } catch (error) {
      feedback.textContent = error.message;
    }
  });
  document.getElementById('resetAgentConfig').addEventListener('click', async () => {
    if (!configuredName) return;
    const feedback = document.getElementById('agentConfigFeedback');
    try {
      await window.officeTasks.configureAgent(configuredName, {reset: true});
      feedback.textContent = 'Default configuration restored.';
      render();
      dialog.close();
    } catch (error) {
      feedback.textContent = error.message;
    }
  });
  render();
}
