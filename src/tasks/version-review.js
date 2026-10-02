const element = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
};

function dateLabel(value) {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not recorded' : date.toLocaleString();
}

function lineDiff(beforeText, afterText) {
  const before = beforeText.split(/\r?\n/);
  const after = afterText.split(/\r?\n/);
  if (before.length * after.length > 200000) {
    const lines = [];
    const count = Math.max(before.length, after.length);
    for (let index = 0; index < count; index++) {
      if (before[index] === after[index]) lines.push({type: 'same', text: before[index]});
      else {
        if (before[index] !== undefined) lines.push({type: 'removed', text: before[index]});
        if (after[index] !== undefined) lines.push({type: 'added', text: after[index]});
      }
    }
    return lines;
  }
  const matrix = Array.from({length: before.length + 1}, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left--) {
    for (let right = after.length - 1; right >= 0; right--) {
      matrix[left][right] = before[left] === after[right]
        ? matrix[left + 1][right + 1] + 1
        : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
    }
  }
  const result = [];
  let left = 0, right = 0;
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      result.push({type: 'same', text: before[left++]});
      right++;
    } else if (matrix[left + 1][right] >= matrix[left][right + 1]) {
      result.push({type: 'removed', text: before[left++]});
    } else {
      result.push({type: 'added', text: after[right++]});
    }
  }
  while (left < before.length) result.push({type: 'removed', text: before[left++]});
  while (right < after.length) result.push({type: 'added', text: after[right++]});
  return result;
}

function appendDiffLines(target, lines, include) {
  for (const line of lines.filter(item => include.includes(item.type))) {
    target.append(element('div', `${line.type === 'removed' ? '− ' : line.type === 'added' ? '+ ' : ''}${line.text || ' '}`, `diff-line ${line.type}`));
  }
}

function renderHistory(task, drafts, target) {
  const heading = element('h3', 'Draft versions', 'review-history-heading');
  target.append(heading);
  if (!drafts.length) target.append(element('p', 'No saved drafts.', 'history-empty'));
  drafts.forEach((draft, index) => {
    const version = draft.version || index + 1;
    const item = element('article', undefined, 'review-history-item');
    const title = element('h4', `v${version} · ${draft.by || 'Saved draft'}`);
    item.append(title, element('time', dateLabel(draft.createdAt)));
    if (draft.feedback) item.append(element('p', `Revision brief: ${draft.feedback}`));
    item.append(element('pre', draft.result || '', 'version-content'));
    target.append(item);
  });

  const reviews = task.reviewHistory || [];
  target.append(element('h3', 'Approval history', 'review-history-heading'));
  if (!reviews.length) target.append(element('p', 'No review decisions recorded yet.', 'history-empty'));
  const list = element('ol', undefined, 'approval-history');
  reviews.forEach(entry => {
    const row = element('li', undefined, `approval-entry ${entry.action || ''}`);
    const version = entry.draftVersion || entry.version || '?';
    const action = entry.action === 'approve' ? 'Approved' : 'Revision requested';
    row.append(element('strong', `v${version} · ${action}`), element('time', dateLabel(entry.at || entry.createdAt)), element('span', entry.by || 'You'));
    if (entry.feedback) row.append(element('p', entry.feedback));
    list.append(row);
  });
  target.append(list);
}

export function createVersionReview(task) {
  const root = element('section', undefined, 'version-review');
  const drafts = task.history?.length ? task.history : task.result ? [{result: task.result, by: task.by, createdAt: task.updatedAt || task.createdAt}] : [];
  const currentIndex = Math.max(0, drafts.length - 1);
  const currentVersion = drafts[currentIndex]?.version || currentIndex + 1;
  const tabs = element('div', undefined, 'review-view-tabs');
  const content = element('div', undefined, 'review-view-content');
  const modes = [
    {id: 'current', label: `Current draft · v${currentVersion}`},
    {id: 'compare', label: currentIndex > 0 ? `Compare with v${drafts[currentIndex - 1]?.version || currentIndex}` : 'Compare versions'},
    {id: 'history', label: 'History'}
  ];
  let selected = 'current';

  const render = () => {
    content.replaceChildren();
    if (selected === 'history') {
      renderHistory(task, drafts, content);
      return;
    }
    if (selected === 'compare') {
      if (currentIndex < 1) {
        content.append(element('p', 'A previous draft will appear here after the first revision.', 'history-empty'));
        return;
      }
      const previous = drafts[currentIndex - 1];
      const current = drafts[currentIndex];
      const comparison = element('div', undefined, 'version-compare-columns');
      const previousPane = element('section', undefined, 'version-pane previous');
      const currentPane = element('section', undefined, 'version-pane current');
      previousPane.append(element('h3', `Previous · v${previous.version || currentIndex}`));
      currentPane.append(element('h3', `Current · v${current.version || currentIndex + 1}`));
      const diff = lineDiff(previous.result || '', current.result || '');
      appendDiffLines(previousPane, diff, ['same', 'removed']);
      appendDiffLines(currentPane, diff, ['same', 'added']);
      comparison.append(previousPane, currentPane);
      content.append(comparison);
      return;
    }
    const draft = drafts[currentIndex];
    if (!draft) {
      content.append(element('p', 'No draft is available yet.', 'history-empty'));
      return;
    }
    const pane = element('section', undefined, 'current-draft-pane');
    pane.append(element('div', `CURRENT DRAFT · v${draft.version || currentVersion}`, 'draft-version-label'));
    pane.append(element('p', `${draft.by || 'Saved draft'} · ${dateLabel(draft.createdAt)}`, 'draft-attribution'));
    pane.append(element('pre', draft.result || task.result || '', 'version-content'));
    if (draft.feedback) pane.append(element('p', `Revision brief: ${draft.feedback}`, 'revision-brief'));
    content.append(pane);
  };

  for (const mode of modes) {
    const button = element('button', mode.label);
    button.type = 'button';
    button.dataset.mode = mode.id;
    button.setAttribute('aria-pressed', String(mode.id === selected));
    button.addEventListener('click', () => {
      selected = mode.id;
      tabs.querySelectorAll('button').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.mode === selected)));
      render();
    });
    tabs.append(button);
  }
  root.append(element('h3', `Draft review · ${task.title}`, 'review-panel-title'), tabs, content);
  render();
  return root;
}
