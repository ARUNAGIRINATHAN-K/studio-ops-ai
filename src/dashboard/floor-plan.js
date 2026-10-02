import { DIVISIONS, FLOOR_NAMES, FLOOR_PLANS } from './floor-plan-data.js';

const canvas = document.getElementById('floor-plan');
const context = canvas.getContext('2d');
const divisionFilter = document.getElementById('filter-division');
const statusFilter = document.getElementById('filter-status');
const planTitle = document.getElementById('planHeading');
const planCount = document.getElementById('planCount');
const planFeedback = document.getElementById('plan-feedback');
const clearSelection = document.getElementById('clear-plan-selection');
const divisionColors = Object.fromEntries(DIVISIONS.map(division => [division.id, division.color]));
const roomColors = {
  open: '#ffffff',
  private: '#f8fafc',
  service: '#fefce8',
  social: '#ecfdf5'
};
let hitTargets = [];
let animationFrame = 0;
let previousFloor = null;
let sourceTeam = [];
let keyboardTargetId = '';
let zoom = 1;

function taskFor(member) {
  return window.officeTasks?.activeFor(member.name) || null;
}

function memberStatus(member) {
  const task = taskFor(member);
  if (task && window.officeTasks?.agentFor(member.name)) return 'drafting';
  if (member.state === 'walk' || member.state === 'stairs') return 'moving';
  if (task) return 'working';
  if (member.state === 'work' && member.atDesk) return 'free';
  return 'away';
}

function visibleMembers(team) {
  return team.filter(member => statusFilter.value === 'all' || memberStatus(member) === statusFilter.value);
}

function worldToCanvas(bounds, x, z) {
  x *= zoom;
  z *= zoom;
  return {
    x: bounds.x + (x + 16) / 32 * bounds.w,
    y: bounds.y + (12 - z) / 24 * bounds.h
  };
}

function drawGrid(bounds, scale) {
  context.fillStyle = '#fafafa';
  context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  context.save();
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.w, bounds.h);
  context.clip();
  context.strokeStyle = '#f1f5f9';
  context.lineWidth = 1;
  for (let x = -16; x <= 16; x += 4) {
    const point = worldToCanvas(bounds, x, 0);
    context.beginPath();
    context.moveTo(point.x, bounds.y);
    context.lineTo(point.x, bounds.y + bounds.h);
    context.stroke();
  }
  for (let z = -12; z <= 12; z += 4) {
    const point = worldToCanvas(bounds, 0, z);
    context.beginPath();
    context.moveTo(bounds.x, point.y);
    context.lineTo(bounds.x + bounds.w, point.y);
    context.stroke();
  }
  context.restore();
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = Math.max(1, Math.min(2, scale * .07));
  context.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
}

function addHitTarget(target) {
  hitTargets.push(target);
}

function drawFloor(level, area, team, selectedName, mini = false) {
  const header = mini ? 24 : 0;
  const padding = mini ? 12 : 30;
  const aspect = 32 / 24;
  let width = area.w - padding * 2;
  let height = (area.h - header - padding * 2);
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  const bounds = {
    x: area.x + (area.w - width) / 2,
    y: area.y + header + (area.h - header - height) / 2,
    w: width,
    h: height
  };
  const scale = width / 32;
  const point = (x, z) => worldToCanvas(bounds, x, z);

  context.save();
  context.beginPath();
  context.rect(area.x, area.y, area.w, area.h);
  context.clip();

  if (mini) {
    context.fillStyle = '#64748b';
    context.font = '600 12px "IBM Plex Mono", monospace';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(`FL.0${level}  ${FLOOR_NAMES[level]}`, area.x + 10, area.y + 12);
    addHitTarget({ type: 'floor', level, x: area.x, y: area.y, w: area.w, h: area.h });
  }

  drawGrid(bounds, scale);

  if (level === 3) {
    const groups = [
      { id: 'leadership', x: -5.5, z: -3.5, w: 8.6, d: 4.4, label: 'LEADERSHIP' },
      { id: 'marketing', x: 5.5, z: -3.5, w: 8.6, d: 6.6, label: 'MARKETING & BUSINESS' },
      { id: 'engineering', x: -5.5, z: 6.5, w: 8.6, d: 6.6, label: 'ENGINEERING & DESIGN' },
      { id: 'service', x: 5.5, z: 6.5, w: 8.6, d: 6.6, label: 'CUSTOMER SERVICE' }
    ];
    for (const group of groups) {
      const topLeft = point(group.x - group.w / 2, group.z + group.d / 2);
      const bottomRight = point(group.x + group.w / 2, group.z - group.d / 2);
      context.fillStyle = divisionColors[group.id];
      context.globalAlpha = .08;
      context.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      context.globalAlpha = 1;
      context.setLineDash([4, 4]);
      context.strokeStyle = divisionColors[group.id];
      context.globalAlpha = .35;
      context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      context.globalAlpha = 1;
      context.setLineDash([]);
      context.fillStyle = divisionColors[group.id];
      context.font = `600 ${Math.max(8, Math.min(10, scale * .68))}px "IBM Plex Mono", monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const labelPoint = point(group.x, group.z + group.d / 2 - .45);
      context.fillText(group.label, labelPoint.x, labelPoint.y, Math.max(40, bottomRight.x - topLeft.x - 8));
    }
  }

  const rooms = FLOOR_PLANS[level]?.rooms || [];
  for (const room of rooms) {
    const topLeft = point(room.x - room.w / 2, room.z + room.d / 2);
    const bottomRight = point(room.x + room.w / 2, room.z - room.d / 2);
    const rect = {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y
    };
    context.fillStyle = roomColors[room.type] || roomColors.open;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    if (rect.w > 30 && rect.h > 14) {
      context.fillStyle = '#475569';
      context.font = `600 ${Math.max(8, Math.min(11, scale * .72))}px "IBM Plex Mono", monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(room.label, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - 6);
    }
    const roomId = `room:${level}:${room.label}`;
    addHitTarget({ id: roomId, type: 'room', level, ...rect, label: room.label, world: { x: room.x, z: room.z, w: room.w, d: room.d } });
    if (keyboardTargetId === roomId) {
      context.strokeStyle = '#2563eb';
      context.lineWidth = 3;
      context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  if (level === 3) {
    for (const desk of FLOOR_PLANS[3].desks) {
      const deskPoint = point(desk.x, desk.z);
      const deskWidth = Math.max(9, scale * 1.12);
      const deskHeight = Math.max(5, scale * .45);
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 1;
      context.fillRect(deskPoint.x - deskWidth / 2, deskPoint.y - deskHeight / 2, deskWidth, deskHeight);
      context.strokeRect(deskPoint.x - deskWidth / 2, deskPoint.y - deskHeight / 2, deskWidth, deskHeight);
      addHitTarget({ id: `desk:${desk.name}`, type: 'desk', level, ...deskPoint, radius: Math.max(12, scale * 1.1), name: desk.name });
      const member = sourceTeam.find(person => person.name === desk.name);
      if (member && taskFor(member)) drawTaskMarker(deskPoint, scale, window.officeTasks?.agentFor(member.name));
    }
  }

  const onFloor = team.filter(member => member.floor === level);
  for (const member of onFloor) {
    const memberPoint = point(member.position[0], member.position[2]);
    const radius = Math.max(mini ? 5 : 8, Math.min(mini ? 7 : 14, scale * (mini ? .55 : .8)));
    const color = divisionColors[member.group] || '#64748b';
    const status = memberStatus(member);
    const alpha = (divisionFilter.value === 'all' || divisionFilter.value === member.group) &&
      (statusFilter.value === 'all' || statusFilter.value === status) ? 1 : .16;

    context.save();
    context.globalAlpha = alpha;
    if (status === 'drafting' || status === 'working') {
      context.beginPath();
      context.arc(memberPoint.x, memberPoint.y, radius + 4, 0, Math.PI * 2);
      context.strokeStyle = status === 'drafting' ? '#2563eb' : '#e89b1c';
      context.lineWidth = 2;
      context.stroke();
    }
    if (member.name === selectedName) {
      context.beginPath();
      context.arc(memberPoint.x, memberPoint.y, radius + 7, 0, Math.PI * 2);
      context.strokeStyle = '#06b6d4';
      context.lineWidth = 2;
      context.stroke();
    }
    context.beginPath();
    context.arc(memberPoint.x, memberPoint.y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    if (keyboardTargetId === `person:${member.name}`) {
      context.beginPath();
      context.arc(memberPoint.x, memberPoint.y, radius + 10, 0, Math.PI * 2);
      context.strokeStyle = '#2563eb';
      context.lineWidth = 2;
      context.stroke();
    }
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = '#fff';
    context.font = `700 ${Math.max(7, Math.min(10, radius * .72))}px "Source Sans 3", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(member.initials, memberPoint.x, memberPoint.y + .5, radius * 1.7);
    context.restore();
    addHitTarget({ id: `person:${member.name}`, type: 'person', level, ...memberPoint, radius: radius + 5, name: member.name, initials: member.initials, role: member.role });
  }

  context.strokeStyle = '#cbd5e1';
  context.lineWidth = Math.max(1, Math.min(2, scale * .07));
  context.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  context.restore();
}

function drawTaskMarker(point, scale, agent) {
  const size = Math.max(4, Math.min(7, scale * .45));
  context.save();
  context.translate(point.x + Math.max(6, scale * .62), point.y - Math.max(4, scale * .4));
  context.rotate(Math.PI / 4);
  context.fillStyle = agent ? '#2563eb' : '#e89b1c';
  context.fillRect(-size / 2, -size / 2, size, size);
  context.restore();
}

function drawEmptyState(message) {
  const { width, height } = canvas.getBoundingClientRect();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#64748b';
  context.font = '600 15px "Source Sans 3", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(message, width / 2, height / 2);
}

function updateLegend() {
  const legend = document.getElementById('plan-legend');
  if (legend.childElementCount) return;
  for (const division of DIVISIONS) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('i');
    swatch.style.setProperty('--legend-color', division.color);
    item.append(swatch, division.label);
    legend.append(item);
  }
  for (const [label, color, marker] of [
    ['Working', '#e89b1c', 'ring'],
    ['AI drafting', '#2563eb', 'ring'],
    ['Active task', '#e89b1c', 'diamond']
  ]) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('i');
    swatch.className = `legend-${marker}`;
    swatch.style.setProperty('--legend-color', color);
    item.append(swatch, label);
    legend.append(item);
  }
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * pixelRatio);
  const pixelHeight = Math.round(rect.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  hitTargets = [];
  const snapshot = window.officeScene?.snapshot?.();
  if (!snapshot) {
    drawEmptyState('Connecting to the live office…');
    return;
  }

  const team = visibleMembers(snapshot.team);
  sourceTeam = snapshot.team;
  const matchingMembers = snapshot.team.filter(member =>
    (divisionFilter.value === 'all' || member.group === divisionFilter.value) &&
    (statusFilter.value === 'all' || memberStatus(member) === statusFilter.value)
  );
  const currentFloor = snapshot.floor;
  if (previousFloor !== currentFloor) {
    planTitle.textContent = currentFloor === 0 ? 'Whole building' : FLOOR_NAMES[currentFloor];
    previousFloor = currentFloor;
  }
  const floorMembers = currentFloor === 0 ? matchingMembers.length : matchingMembers.filter(member => member.floor === currentFloor).length;
  const tasks = snapshot.team.filter(taskFor).length;
  planCount.textContent = `${floorMembers} of ${snapshot.team.length} people · ${tasks} active tasks`;
  clearSelection.hidden = !snapshot.selected;

  if (currentFloor === 0) {
    context.clearRect(0, 0, rect.width, rect.height);
    const gap = 12;
    const margin = 14;
    const cellWidth = (rect.width - margin * 2 - gap) / 2;
    const cellHeight = (rect.height - margin * 2 - gap) / 2;
    [1, 2, 3, 4].forEach((level, index) => {
      const x = margin + (index % 2) * (cellWidth + gap);
      const y = margin + Math.floor(index / 2) * (cellHeight + gap);
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#e2e8f0';
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 6);
      context.fill();
      context.stroke();
      drawFloor(level, { x, y, w: cellWidth, h: cellHeight }, team, snapshot.selected, true);
    });
  } else {
    context.clearRect(0, 0, rect.width, rect.height);
    drawFloor(currentFloor, { x: 0, y: 0, w: rect.width, h: rect.height }, team, snapshot.selected);
  }
}

function activateTarget(target) {
  if (target.type === 'person' || target.type === 'desk') {
    if (target.name) {
      window.officeScene?.select(target.name);
      planFeedback.textContent = `${target.initials || target.name} selected. Member details and commands are open.`;
    }
    return;
  }
  if (target.type === 'floor') {
    window.officeScene?.setFloor(target.level);
    return;
  }
  const occupants = (window.officeScene?.snapshot?.().team || []).filter(member => {
    if (member.floor !== target.level) return false;
    const { x, z, w, d } = target.world;
    return Math.abs(member.position[0] - x) <= w / 2 && Math.abs(member.position[2] - z) <= d / 2;
  });
  planFeedback.textContent = `${target.label} · ${occupants.length ? occupants.map(person => person.initials).join(', ') : 'No team members here'}.`;
}

function hitTest(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return [...hitTargets].reverse().find(target => {
    if (target.type === 'person' || target.type === 'desk') return Math.hypot(x - target.x, y - target.y) <= target.radius;
    return x >= target.x && x <= target.x + target.w && y >= target.y && y <= target.y + target.h;
  });
}

canvas.addEventListener('click', event => {
  const target = hitTest(event);
  if (!target) return;
  canvas.focus({preventScroll: true});
  keyboardTargetId = target.id || '';
  activateTarget(target);
});

canvas.addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
  const candidates = hitTargets.filter(target => ['person', 'desk', 'room'].includes(target.type));
  if (!candidates.length) return;
  let index = candidates.findIndex(target => target.id === keyboardTargetId);
  if (event.key !== 'Enter' && event.key !== ' ') {
    index = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      ? (index <= 0 ? candidates.length - 1 : index - 1)
      : (index + 1) % candidates.length;
    keyboardTargetId = candidates[index].id;
    const target = candidates[index];
    planFeedback.textContent = target.type === 'room' ? `${target.label}. Press Enter for room occupants.` : `${target.initials || target.name} · ${target.role || 'team member'}. Press Enter to open details.`;
    draw();
  } else {
    activateTarget(candidates[index < 0 ? 0 : index]);
  }
  event.preventDefault();
  event.stopPropagation();
});

canvas.addEventListener('pointermove', event => {
  const target = hitTest(event);
  canvas.style.cursor = target ? 'pointer' : 'default';
  if (target?.type === 'person') canvas.title = `${target.name} · ${target.role}`;
  else if (target?.type === 'room') canvas.title = target.label;
  else canvas.removeAttribute('title');
});

divisionFilter.addEventListener('change', draw);
statusFilter.addEventListener('change', draw);
document.getElementById('map-zoom-in').addEventListener('click', () => {
  zoom = Math.min(1.6, +(zoom + .15).toFixed(2));
  document.getElementById('map-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  draw();
});
document.getElementById('map-zoom-out').addEventListener('click', () => {
  zoom = Math.max(.7, +(zoom - .15).toFixed(2));
  document.getElementById('map-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  draw();
});
clearSelection.addEventListener('click', () => {
  window.officeScene?.select(null);
  planFeedback.textContent = 'Member selection cleared.';
});

document.getElementById('logList').addEventListener('click', event => {
  const action = event.target.closest('.timeline-focus');
  if (action?.dataset.floor) window.officeScene?.setFloor(action.dataset.floor);
  if (action?.dataset.member) window.officeScene?.select(action.dataset.member);
  if (action?.dataset.group) {
    divisionFilter.value = action.dataset.group;
    draw();
  }
});

export function startFloorPlan() {
  if (animationFrame) return;
  updateLegend();
  const frame = () => {
    if (document.body.dataset.view === 'dashboard') draw();
    animationFrame = requestAnimationFrame(frame);
  };
  frame();
}
