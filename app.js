(() => {
  'use strict';
  const defaults = { focus: 25, short: 5, long: 15 };
  const state = {
    settings: load('focusflow.settings', defaults),
    tasks: load('focusflow.tasks', []),
    mode: 'focus',
    remaining: 25 * 60,
    running: false,
    deadline: 0,
    sessions: load('focusflow.sessions', { day: todayKey(), count: 0 }),
    interval: null,
    toastTimer: null,
  };
  const $ = (id) => document.getElementById(id);
  const display = $('timeDisplay');
  const ring = $('ringProgress');
  const ringLength = 2 * Math.PI * 116;
  ring.style.strokeDasharray = String(ringLength);

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function load(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Storage is full. Remove some saved tasks.'); } }
  function duration(mode = state.mode) { return (Number(state.settings[mode]) || defaults[mode]) * 60; }
  function pad(value) { return String(value).padStart(2, '0'); }
  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
  }
  function setMode(mode, reset = true) {
    pause(); state.mode = mode;
    if (reset) state.remaining = duration(mode);
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
    });
    $('modeLabel').textContent = mode === 'focus' ? 'TIME TO FOCUS' : mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK';
    $('startText').textContent = mode === 'focus' ? 'Start focus' : 'Start break';
    $('sessionNote').textContent = mode === 'focus' ? 'A little progress adds up.' : 'Take a breath. You’ve earned it.';
    renderTimer();
  }
  function renderTimer() {
    const mins = Math.floor(state.remaining / 60), secs = state.remaining % 60;
    display.textContent = `${pad(mins)}:${pad(secs)}`;
    const fraction = Math.max(0, Math.min(1, state.remaining / duration()));
    ring.style.strokeDashoffset = String(ringLength * (1 - fraction));
    $('startIcon').textContent = state.running ? 'Ⅱ' : '▶';
    $('startText').textContent = state.running ? 'Pause timer' : state.mode === 'focus' ? 'Start focus' : 'Start break';
    document.title = state.running ? `${pad(mins)}:${pad(secs)} · FocusFlow` : 'FocusFlow — make space for focus';
  }
  function pause() {
    if (state.running) {
      state.remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      state.running = false; clearInterval(state.interval); state.interval = null;
    }
    renderTimer();
  }
  function tick() {
    state.remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    renderTimer();
    if (state.remaining <= 0) finishSession();
  }
  function start() {
    if (state.running) { pause(); return; }
    if (state.remaining <= 0) state.remaining = duration();
    state.running = true; state.deadline = Date.now() + state.remaining * 1000;
    state.interval = setInterval(tick, 250); renderTimer();
  }
  function finishSession() {
    pause(); state.remaining = 0; renderTimer();
    if (state.mode === 'focus') {
      if (state.sessions.day !== todayKey()) state.sessions = { day: todayKey(), count: 0 };
      state.sessions.count += 1; save('focusflow.sessions', state.sessions); renderSessions();
      toast('Focus session complete — lovely work!');
      if ('Notification' in window && Notification.permission === 'granted') new Notification('FocusFlow', { body: 'Focus session complete. Take a break!' });
    } else toast('Break complete. Ready when you are.');
    if (navigator.vibrate) navigator.vibrate([120, 70, 120]);
  }
  function addTask(title) {
    const clean = title.trim(); if (!clean) return;
    state.tasks.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title: clean, done: false, sessions: 0 });
    save('focusflow.tasks', state.tasks); renderTasks(); $('taskInput').value = '';
  }
  function renderTasks() {
    const list = $('taskList'); list.replaceChildren();
    state.tasks.forEach((task) => {
      const item = document.createElement('li'); item.className = `task-item${task.done ? ' done' : ''}`;
      const check = document.createElement('button'); check.className = 'task-check'; check.type = 'button'; check.setAttribute('aria-label', task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`); check.textContent = task.done ? '✓' : '';
      check.addEventListener('click', () => { task.done = !task.done; persistTasks(); renderTasks(); });
      const title = document.createElement('span'); title.className = 'task-title'; title.textContent = task.title;
      item.append(check, title);
      if (task.sessions > 0) { const count = document.createElement('span'); count.className = 'task-sessions'; count.textContent = `◷ ${task.sessions}`; count.title = 'Focus sessions'; item.append(count); }
      const remove = document.createElement('button'); remove.className = 'task-delete'; remove.type = 'button'; remove.setAttribute('aria-label', `Delete ${task.title}`); remove.textContent = '×';
      remove.addEventListener('click', () => { state.tasks = state.tasks.filter((entry) => entry.id !== task.id); persistTasks(); renderTasks(); }); item.append(remove); list.append(item);
    });
    $('taskEmpty').hidden = state.tasks.length > 0;
    $('taskCount').textContent = String(state.tasks.filter((task) => !task.done).length);
    const done = state.tasks.filter((task) => task.done).length, total = state.tasks.length;
    $('progressText').textContent = `${done} of ${total} done`;
    $('progressBar').style.width = `${total ? (done / total) * 100 : 0}%`;
    $('clearDone').hidden = done === 0;
  }
  function persistTasks() { save('focusflow.tasks', state.tasks); }
  function renderSessions() {
    if (state.sessions.day !== todayKey()) state.sessions = { day: todayKey(), count: 0 };
    $('sessionCount').textContent = String(state.sessions.count);
    const dots = $('sessionDots'); dots.replaceChildren();
    for (let i = 0; i < Math.max(4, Math.min(8, state.sessions.count)); i++) {
      const dot = document.createElement('span'); dot.className = `session-dot${i < state.sessions.count ? ' filled' : ''}`; dots.append(dot);
    }
  }
  function dateLabels() {
    const now = new Date(); $('todayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(now);
    $('dateChip').textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(now).toUpperCase();
  }
  document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  $('startButton').addEventListener('click', start);
  $('resetButton').addEventListener('click', () => { pause(); state.remaining = duration(); renderTimer(); });
  $('skipButton').addEventListener('click', () => { pause(); setMode(state.mode === 'focus' ? 'short' : 'focus'); toast('Session skipped.'); });
  $('taskForm').addEventListener('submit', (event) => { event.preventDefault(); addTask($('taskInput').value); });
  $('clearDone').addEventListener('click', () => { state.tasks = state.tasks.filter((task) => !task.done); persistTasks(); renderTasks(); });
  $('settingsOpen').addEventListener('click', () => {
    $('focusMinutes').value = state.settings.focus; $('shortMinutes').value = state.settings.short; $('longMinutes').value = state.settings.long;
    $('settingsDialog').showModal();
  });
  $('settingsForm').addEventListener('submit', (event) => {
    if (event.submitter?.id !== 'saveSettings') return;
    event.preventDefault();
    const next = { focus: Number($('focusMinutes').value), short: Number($('shortMinutes').value), long: Number($('longMinutes').value) };
    if (Object.entries(next).some(([key, value]) => !Number.isInteger(value) || value < 1 || value > (key === 'focus' ? 90 : key === 'short' ? 30 : 60))) {
      toast('Please enter a valid duration.'); return;
    }
    pause(); state.settings = next; save('focusflow.settings', next); state.remaining = duration(); renderTimer(); $('settingsDialog').close(); toast('Settings saved.');
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName) && !$('settingsDialog').open) { event.preventDefault(); start(); }
  });
  $('taskList').addEventListener('dblclick', (event) => {
    if (event.target.classList.contains('task-title') && state.mode === 'focus') {
      const task = state.tasks.find((entry) => entry.title === event.target.textContent && !entry.done);
      if (task) { task.sessions += 1; persistTasks(); renderTasks(); toast('Focus session noted for this task.'); }
    }
  });
  dateLabels(); renderTasks(); renderSessions(); renderTimer();
})();
