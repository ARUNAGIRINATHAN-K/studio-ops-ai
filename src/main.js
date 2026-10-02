import * as THREE from 'three';
import { startFloorPlan } from './dashboard/floor-plan.js';
import { initTaskHub } from './tasks/task-hub.js';
import { initAgentMonitor } from './tasks/agent-monitor.js';
import { initMissionControl } from './dashboard/mission-control.js';

window.THREE = THREE;
let officeModulePromise;

const setView = async (view) => {
  const shells = document.querySelectorAll('.view-shell');
  shells.forEach((shell) => {
    const isActive = shell.dataset.view === view;
    shell.hidden = !isActive;
    shell.classList.toggle('active', isActive);
  });

  document.body.dataset.view = view;
  document.querySelectorAll('.view-tab').forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  if (view === 'explore') {
    await window.loadOfficeScene();
    const selected = window.officeScene?.snapshot?.().selected;
    if (selected) window.officeScene.focus(selected);
  }
};

window.switchView = setView;
window.loadOfficeScene = () => {
  if (!officeModulePromise) {
    const officeSceneUrl = new URL('office.js', window.location.href).href;
    officeModulePromise = import(/* @vite-ignore */ officeSceneUrl).catch(error => {
      officeModulePromise = null;
      throw error;
    });
  }
  return officeModulePromise;
};

document.addEventListener('DOMContentLoaded', () => {
  const switchButtons = document.querySelectorAll('.view-tab');
  switchButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  document.getElementById('task-shell-open')?.addEventListener('click', () => {
    if (window.officeTasks?.open) window.officeTasks.open();
  });

  document.getElementById('exit-explore')?.addEventListener('click', () => setView('dashboard'));
  document.getElementById('tasks-back-dashboard')?.addEventListener('click', () => setView('dashboard'));
  document.getElementById('closeShortcutHelp')?.addEventListener('click', () => document.getElementById('shortcutHelpDialog').close());

  document.addEventListener('keydown', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && document.body.dataset.view === 'explore') {
      window.officeScene?.stopFollow?.();
      setView('dashboard');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (key === '?') {
      document.getElementById('shortcutHelpDialog').showModal();
    } else if (key === 'd') {
      setView('dashboard');
    } else if (key === 't') {
      setView('tasks');
    } else if (key === 'e') {
      setView('explore');
    } else if (key === 'n') {
      window.officeTasks?.open();
    } else if (key === '/' && document.body.dataset.view === 'dashboard') {
      document.getElementById('filter-division')?.focus();
    } else if (/^[1-4]$/.test(key) && document.body.dataset.view === 'dashboard') {
      document.querySelector(`[data-floor="${key}"]`)?.click();
    } else if (key === '0' && document.body.dataset.view === 'dashboard') {
      document.querySelector('[data-floor="0"]')?.click();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  setView('dashboard');
  initTaskHub();
  initAgentMonitor();
  initMissionControl();
  startFloorPlan();
  requestAnimationFrame(() => window.loadOfficeScene().catch(() => {
    document.getElementById('planCount').textContent = 'Office simulation unavailable';
  }));
});
