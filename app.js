'use strict';

/* ═══════════════════════════════════════════
   BRIDGE FULFILLMENT — app.js v2
   Мотивация: уровни, стрики, бейджи, цели,
   конфетти, лидерборд, рекорды
   ═══════════════════════════════════════════ */

// ─── STORAGE ────────────────────────────────
const DB = {
  ENTRIES:   'wh_entries',
  EMPLOYEES: 'wh_employees',
  MODELS:    'wh_models',
  COLORS:    'wh_colors',
  SIZES:     'wh_sizes',
  GOALS:     'wh_goals',
  STREAKS:   'wh_streaks',
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

// ─── STATE ──────────────────────────────────
const state = {
  entries:   DB.load(DB.ENTRIES,   []),
  employees: DB.load(DB.EMPLOYEES, ['Алина', 'Борис', 'Светлана']),
  models:    DB.load(DB.MODELS,    ['Модель А', 'Модель Б', 'Модель В']),
  colors:    DB.load(DB.COLORS,    ['Чёрный', 'Белый', 'Синий', 'Красный', 'Серый']),
  sizes:     DB.load(DB.SIZES,     ['XS','S','M','L','XL','XXL','40','42','44','46','48','50']),
  goals:     DB.load(DB.GOALS,     {}),   // { employee: number }
  streaks:   DB.load(DB.STREAKS,   {}),   // { employee: { count, lastDate } }
  currentTab:    'add',
  currentPeriod: 'today',
  historyFilters: { search:'', employee:'', model:'', size:'', from:'', to:'' }
};

function persist() {
  DB.save(DB.ENTRIES,   state.entries);
  DB.save(DB.EMPLOYEES, state.employees);
  DB.save(DB.MODELS,    state.models);
  DB.save(DB.COLORS,    state.colors);
  DB.save(DB.SIZES,     state.sizes);
  DB.save(DB.GOALS,     state.goals);
  DB.save(DB.STREAKS,   state.streaks);
}

// ─── HELPERS ────────────────────────────────
const normalizeSize = s => String(s).trim().toUpperCase();
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const totalQty = list => list.reduce((s,e) => s + Number(e.quantity), 0);

function fmt(date) {
  return new Date(date).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function fmtDate(date) {
  return new Date(date).toLocaleDateString('ru', { day:'2-digit', month:'2-digit' });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function groupSum(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    map.set(k, (map.get(k)||0) + Number(item.quantity));
  }
  return [...map.entries()].sort((a,b) => b[1]-a[1]);
}

function periodFilter(entries, period) {
  const now = new Date();
  const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  return entries.filter(e => {
    const t = new Date(e.createdAt).getTime();
    if (period === 'today') return t >= today;
    if (period === 'week')  { const w = new Date(now); w.setDate(w.getDate()-6); return t >= startOf(w); }
    if (period === 'month') return t >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return true;
  });
}

function todayQtyForEmployee(emp) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return state.entries
    .filter(e => e.employee === emp && new Date(e.createdAt).getTime() >= start)
    .reduce((s,e) => s + Number(e.quantity), 0);
}

// ─── LEVELS ─────────────────────────────────
const LEVELS = [
  { min: 0,    label: 'Новичок',    emoji: '🌱' },
  { min: 100,  label: 'Стажёр',     emoji: '⚡' },
  { min: 500,  label: 'Работник',   emoji: '💪' },
  { min: 1500, label: 'Мастер',     emoji: '🔥' },
  { min: 4000, label: 'Эксперт',    emoji: '⭐' },
  { min: 8000, label: 'Легенда',    emoji: '🏆' },
];

function getLevel(totalQty) {
  let level = LEVELS[0];
  for (const l of LEVELS) { if (totalQty >= l.min) level = l; }
  return level;
}

function empTotalQty(emp) {
  return state.entries.filter(e => e.employee === emp).reduce((s,e) => s + Number(e.quantity), 0);
}

// ─── STREAKS ────────────────────────────────
function updateStreak(emp) {
  const today = todayStr();
  const s = state.streaks[emp] || { count: 0, lastDate: '' };
  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate()-1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  if (s.lastDate === today) return; // already updated today
  if (s.lastDate === yesterday) {
    s.count += 1;
  } else {
    s.count = 1;
  }
  s.lastDate = today;
  state.streaks[emp] = s;
}

function getStreak(emp) {
  const s = state.streaks[emp];
  if (!s) return 0;
  // If last date is not today or yesterday, streak is broken
  const today = todayStr();
  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate()-1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  if (s.lastDate !== today && s.lastDate !== yesterday) return 0;
  return s.count;
}

// ─── BADGES ─────────────────────────────────
const BADGES = [
  { id: 'first',    icon: '🎯', name: 'Первая запись',   desc: 'Добавь первую запись',         check: (emp) => state.entries.some(e => e.employee === emp) },
  { id: 'century',  icon: '💯', name: '100 штук',        desc: 'Сделай 100 штук за всё время', check: (emp) => empTotalQty(emp) >= 100 },
  { id: 'k500',     icon: '⭐', name: '500 штук',        desc: '500 штук за всё время',        check: (emp) => empTotalQty(emp) >= 500 },
  { id: 'k1000',    icon: '🔥', name: '1000 штук',       desc: '1000 штук за всё время',       check: (emp) => empTotalQty(emp) >= 1000 },
  { id: 'streak3',  icon: '⚡', name: '3 дня подряд',    desc: 'Стрик 3 дня',                  check: (emp) => getStreak(emp) >= 3 },
  { id: 'streak7',  icon: '🌟', name: 'Неделя подряд',   desc: 'Стрик 7 дней',                 check: (emp) => getStreak(emp) >= 7 },
  { id: 'goal',     icon: '🎉', name: 'Цель выполнена',  desc: 'Выполни дневную цель',         check: (emp) => { const g = state.goals[emp]; return g && todayQtyForEmployee(emp) >= g; } },
  { id: 'speed',    icon: '🚀', name: 'Скорость',        desc: '50+ штук за один раз',         check: (emp) => state.entries.some(e => e.employee === emp && Number(e.quantity) >= 50) },
];

function getEarnedBadges(emp) {
  return BADGES.filter(b => b.check(emp));
}

// ─── TABS ────────────────────────────────────
const tabs    = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');

function switchTab(name) {
  state.currentTab = name;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'history')    renderHistory();
  if (name === 'stats')      renderStats();
  if (name === 'motivation') renderMotivation();
  if (name === 'settings')   renderSettings();
  updateTopbar();
}
tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

function updateTopbar() {
  document.getElementById('topbar-meta').textContent =
    `${state.entries.length} зап · ${totalQty(state.entries)} шт`;
}

// ─── MODAL ──────────────────────────────────
let modalResolve = null;
function openModal(title, placeholder='') {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-input').value = '';
    document.getElementById('modal-input').placeholder = placeholder;
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('modal-input').focus(), 50);
  });
}
function closeModal(val) {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (modalResolve) { modalResolve(val); modalResolve = null; }
}
document.getElementById('modal-ok').addEventListener('click', () =>
  closeModal(document.getElementById('modal-input').value.trim()));
document.getElementById('modal-cancel').addEventListener('click', () => closeModal(null));
document.getElementById('modal-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') closeModal(document.getElementById('modal-input').value.trim());
});

// ─── ADD FORM ────────────────────────────────
function buildSelect(id, items, placeholder='— выберите —') {
  const sel = document.getElementById(id);
  const cur = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(v => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}"${v===cur?' selected':''}>${esc(v)}</option>`));
}

function buildQuickBtns(containerId, items, inputId) {
  const c = document.getElementById(containerId);
  const inp = document.getElementById(inputId);
  c.innerHTML = '';
  items.forEach(v => {
    const b = document.createElement('button');
    b.className = 'quick-btn'; b.textContent = v; b.type = 'button';
    b.addEventListener('click', () => { inp.value = v; });
    c.appendChild(b);
  });
}

function refreshAddForm() {
  buildSelect('f-employee', state.employees, '— выберите сотрудника —');
  buildSelect('f-model',    state.models,    '— выберите модель —');
  buildQuickBtns('quick-colors', state.colors, 'f-color');
  buildQuickBtns('quick-sizes',  state.sizes,  'f-size');
}
refreshAddForm();

// Employee widget + goal progress when employee selected
document.getElementById('f-employee').addEventListener('change', () => {
  updateEmployeeWidget();
  updateGoalProgress();
  updateTop3Widget();
});

function updateEmployeeWidget() {
  const emp = document.getElementById('f-employee').value;
  const widget = document.getElementById('employee-widget');
  if (!emp) { widget.classList.add('hidden'); return; }

  const total  = empTotalQty(emp);
  const level  = getLevel(total);
  const streak = getStreak(emp);
  const todayQ = todayQtyForEmployee(emp);
  const initial = emp.charAt(0).toUpperCase();

  widget.classList.remove('hidden');
  widget.innerHTML = `
    <div class="ew-avatar">${level.emoji}</div>
    <div class="ew-info">
      <div class="ew-name">${esc(emp)}</div>
      <div class="ew-level">${level.label.toUpperCase()}</div>
      <div class="ew-stats">
        <div class="ew-stat"><div class="ew-stat-val">${todayQ}</div><div class="ew-stat-label">Сегодня</div></div>
        <div class="ew-stat"><div class="ew-stat-val">${total}</div><div class="ew-stat-label">Всего</div></div>
      </div>
    </div>
    <div class="ew-streak">
      <div class="ew-streak-fire">🔥</div>
      <div class="ew-streak-val">${streak}</div>
      <div class="ew-streak-label">Стрик</div>
    </div>
  `;
}

function updateGoalProgress() {
  const emp = document.getElementById('f-employee').value;
  const wrap = document.getElementById('goal-progress-wrap');
  if (!emp || !state.goals[emp]) { wrap.classList.add('hidden'); return; }

  const goal = Number(state.goals[emp]);
  const done = todayQtyForEmployee(emp);
  const pct  = Math.min(100, Math.round(done / goal * 100));

  wrap.classList.remove('hidden');
  document.getElementById('goal-progress-pct').textContent = pct + '%';
  document.getElementById('goal-progress-fill').style.width = pct + '%';
  document.getElementById('goal-progress-sub').textContent =
    done >= goal
      ? `✅ Цель выполнена! ${done} из ${goal} шт`
      : `${done} из ${goal} шт — осталось ${goal - done} шт`;

  // Change colour based on progress
  const fill = document.getElementById('goal-progress-fill');
  if (pct >= 100) fill.style.background = 'linear-gradient(90deg,#a8ff78,#78ffd6)';
  else if (pct >= 60) fill.style.background = 'linear-gradient(90deg,#a8ff78,#e8ff47)';
  else fill.style.background = 'linear-gradient(90deg,#e8ff47,#ff9f43)';
}

function updateTop3Widget() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEntries = state.entries.filter(e => new Date(e.createdAt).getTime() >= start);
  const top = groupSum(todayEntries, e => e.employee).slice(0,3);
  const widget = document.getElementById('top3-widget');
  if (!top.length) { widget.classList.add('hidden'); return; }

  const max = top[0][1];
  const colors = ['#ffd700','#c0c0c0','#cd7f32'];
  const ranks  = ['🥇','🥈','🥉'];

  widget.classList.remove('hidden');
  widget.innerHTML = `
    <div class="top3-title">⚡ Топ сегодня</div>
    <div class="top3-list">
      ${top.map(([name,qty],i) => `
        <div class="top3-item">
          <span class="top3-rank r${i+1}">${ranks[i]}</span>
          <span class="top3-name">${esc(name)}</span>
          <div class="top3-bar-track"><div class="top3-bar-fill" style="width:${Math.round(qty/max*100)}%;background:${colors[i]}"></div></div>
          <span class="top3-qty">${qty}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// Save button
document.getElementById('btn-add-employee').addEventListener('click', async () => {
  const v = await openModal('Новый сотрудник', 'Имя сотрудника');
  if (v && !state.employees.includes(v)) {
    state.employees.push(v); persist(); refreshAddForm();
    document.getElementById('f-employee').value = v;
    updateEmployeeWidget(); updateGoalProgress();
  }
});

document.getElementById('btn-add-model').addEventListener('click', async () => {
  const v = await openModal('Новая модель', 'Название модели');
  if (v && !state.models.includes(v)) {
    state.models.push(v); persist(); refreshAddForm();
    document.getElementById('f-model').value = v;
  }
});

document.getElementById('btn-save').addEventListener('click', () => {
  const employee = document.getElementById('f-employee').value.trim();
  const model    = document.getElementById('f-model').value.trim();
  const color    = document.getElementById('f-color').value.trim();
  const size     = normalizeSize(document.getElementById('f-size').value);
  const quantity = parseInt(document.getElementById('f-qty').value, 10);
  const note     = document.getElementById('f-note').value.trim();

  if (!employee) { showToast('Выберите сотрудника'); return; }
  if (!model)    { showToast('Выберите модель');     return; }
  if (!size)     { showToast('Укажите размер');      return; }
  if (!quantity || quantity < 1) { showToast('Укажите количество > 0'); return; }

  // Check goal BEFORE adding
  const goalBefore = state.goals[employee] ? todayQtyForEmployee(employee) : null;

  const entry = { id:genId(), createdAt:new Date().toISOString(), employee, model, color, size, quantity, note };
  state.entries.unshift(entry);

  // Update streak
  updateStreak(employee);
  persist();
  updateTopbar();

  // Motivational messages
  const msgs = ['✓ Сохранено! Отличная работа!', '✓ Записано! Так держать!', '✓ Готово! Продолжай в том же духе!', '✓ Супер! Ещё один шаг к цели!'];
  showToast(msgs[Math.floor(Math.random() * msgs.length)]);

  // Check if goal just reached
  if (goalBefore !== null) {
    const goalAfter = todayQtyForEmployee(employee);
    const goal = Number(state.goals[employee]);
    if (goalBefore < goal && goalAfter >= goal) {
      setTimeout(() => showGoalDone(employee), 300);
      launchConfetti();
    }
  }

  // Clear qty and size only, keep employee and model
  document.getElementById('f-qty').value  = '';
  document.getElementById('f-size').value = '';

  updateEmployeeWidget();
  updateGoalProgress();
  updateTop3Widget();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  ['f-employee','f-model','f-color','f-size','f-qty','f-note']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('employee-widget').classList.add('hidden');
  document.getElementById('goal-progress-wrap').classList.add('hidden');
  document.getElementById('top3-widget').classList.add('hidden');
});

function showToast(msg) {
  const area = document.getElementById('toast');
  area.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  area.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function showGoalDone(emp) {
  const old = document.querySelector('.goal-done-banner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.className = 'goal-done-banner';
  b.textContent = `🎉 ${emp} выполнил(а) цель!`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3000);
}

// ─── CONFETTI ────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#e8ff47','#a8ff78','#ff4757','#48dbfb','#c56cf0','#ff9f43','#ffd700'];

  for (let i = 0; i < 120; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 100,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 8,
      opacity: 1
    });
  }

  let frame;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
      if (p.y > canvas.height * 0.6) p.opacity -= 0.025;
      if (p.opacity > 0) { alive = true; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
    if (alive) frame = requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  if (frame) cancelAnimationFrame(frame);
  animate();
}

// ─── HISTORY ─────────────────────────────────
function filteredEntries() {
  const { search, employee, model, size, from, to } = state.historyFilters;
  let list = [...state.entries];
  if (employee) list = list.filter(e => e.employee === employee);
  if (model)    list = list.filter(e => e.model    === model);
  if (size)     list = list.filter(e => normalizeSize(e.size) === normalizeSize(size));
  if (from) { const f = new Date(from).getTime(); list = list.filter(e => new Date(e.createdAt).getTime() >= f); }
  if (to)   { const t = new Date(to).getTime()+86400000; list = list.filter(e => new Date(e.createdAt).getTime() < t); }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(e => [e.employee,e.model,e.color,e.size,e.note,String(e.quantity)]
      .some(f => f && String(f).toLowerCase().includes(q)));
  }
  return list;
}

function renderHistory() {
  const empSel   = document.getElementById('h-filter-emp');
  const modelSel = document.getElementById('h-filter-model');
  const sizeSel  = document.getElementById('h-filter-size');
  const curEmp = empSel.value, curModel = modelSel.value, curSize = sizeSel.value;

  empSel.innerHTML   = '<option value="">Все сотрудники</option>';
  modelSel.innerHTML = '<option value="">Все модели</option>';
  sizeSel.innerHTML  = '<option value="">Все размеры</option>';

  state.employees.forEach(v => empSel.insertAdjacentHTML('beforeend',   `<option value="${esc(v)}">${esc(v)}</option>`));
  state.models.forEach(v    => modelSel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));
  [...new Set(state.entries.map(e => normalizeSize(e.size)).filter(Boolean))].sort()
    .forEach(v => sizeSel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));

  empSel.value = curEmp; modelSel.value = curModel; sizeSel.value = curSize;

  const list = filteredEntries();
  const uniqEmp  = new Set(list.map(e => e.employee)).size;
  const uniqMod  = new Set(list.map(e => e.model)).size;
  const uniqSize = new Set(list.map(e => normalizeSize(e.size))).size;
  const qty = totalQty(list);

  document.getElementById('history-summary').innerHTML = `
    <div class="summary-card"><div class="summary-val">${list.length}</div><div class="summary-label">Записей</div></div>
    <div class="summary-card"><div class="summary-val">${qty}</div><div class="summary-label">Всего шт</div></div>
    <div class="summary-card"><div class="summary-val">${uniqEmp}</div><div class="summary-label">Сотрудн.</div></div>
    <div class="summary-card"><div class="summary-val">${uniqMod}</div><div class="summary-label">Моделей</div></div>
    <div class="summary-card"><div class="summary-val">${uniqSize}</div><div class="summary-label">Размеров</div></div>
    <div class="summary-card"><div class="summary-val">${list.length ? Math.round(qty/list.length) : 0}</div><div class="summary-label">Ср./запись</div></div>
  `;

  const container = document.getElementById('history-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span>Нет записей по заданным фильтрам</div>`;
    return;
  }

  container.innerHTML = list.map(e => `
    <div class="entry-card">
      <div class="entry-main">
        <div class="entry-top">
          <span class="entry-employee">${esc(e.employee)}</span>
          <span class="entry-model">${esc(e.model)}</span>
        </div>
        <div class="entry-row2">
          <span class="entry-size">${esc(e.size)}</span>
          ${e.color ? `<span class="entry-color">${esc(e.color)}</span>` : ''}
          <span class="entry-qty">× ${e.quantity} шт</span>
        </div>
        ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        <div class="entry-date">${fmt(e.createdAt)}</div>
      </div>
      <div><button class="btn-delete" data-id="${esc(e.id)}">✕</button></div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Удалить запись?')) {
        state.entries = state.entries.filter(e => e.id !== btn.dataset.id);
        persist(); updateTopbar(); renderHistory();
      }
    });
  });
}

document.getElementById('h-search').addEventListener('input',   e => { state.historyFilters.search   = e.target.value; renderHistory(); });
document.getElementById('h-filter-emp').addEventListener('change',   e => { state.historyFilters.employee = e.target.value; renderHistory(); });
document.getElementById('h-filter-model').addEventListener('change', e => { state.historyFilters.model    = e.target.value; renderHistory(); });
document.getElementById('h-filter-size').addEventListener('change',  e => { state.historyFilters.size     = e.target.value; renderHistory(); });
document.getElementById('h-date-from').addEventListener('change',    e => { state.historyFilters.from     = e.target.value; renderHistory(); });
document.getElementById('h-date-to').addEventListener('change',      e => { state.historyFilters.to       = e.target.value; renderHistory(); });
document.getElementById('btn-reset-filters').addEventListener('click', () => {
  state.historyFilters = { search:'', employee:'', model:'', size:'', from:'', to:'' };
  ['h-search','h-filter-emp','h-filter-model','h-filter-size','h-date-from','h-date-to']
    .forEach(id => document.getElementById(id).value = '');
  renderHistory();
});

// ─── EXPORT / IMPORT ─────────────────────────
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const list = filteredEntries();
  const rows = [['ID','Дата','Сотрудник','Модель','Цвет','Размер','Количество','Комментарий']];
  list.forEach(e => rows.push([e.id,e.createdAt,e.employee,e.model,e.color,e.size,e.quantity,e.note]));
  const csv = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('warehouse-export.csv', csv, 'text/csv');
});

document.getElementById('btn-export-json').addEventListener('click', () => {
  downloadFile('warehouse-backup.json',
    JSON.stringify({ entries:state.entries, employees:state.employees, models:state.models, colors:state.colors, sizes:state.sizes, goals:state.goals }, null, 2),
    'application/json');
});

document.getElementById('import-json').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data.entries)) {
        if (confirm(`Импортировать ${data.entries.length} записей?`)) {
          const existIds = new Set(state.entries.map(e => e.id));
          data.entries.forEach(e => { if (!existIds.has(e.id)) state.entries.push(e); });
          if (data.employees) state.employees = [...new Set([...state.employees,...data.employees])];
          if (data.models)    state.models    = [...new Set([...state.models,...data.models])];
          if (data.colors)    state.colors    = [...new Set([...state.colors,...data.colors])];
          if (data.sizes)     state.sizes     = [...new Set([...state.sizes,...data.sizes])];
          if (data.goals)     Object.assign(state.goals, data.goals);
          persist(); updateTopbar(); refreshAddForm(); renderHistory();
          showToast('✓ Импорт выполнен');
        }
      }
    } catch { showToast('Ошибка чтения файла'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

function downloadFile(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content],{type}));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

// ─── STATS ───────────────────────────────────
function renderStats() {
  const entries = periodFilter(state.entries, state.currentPeriod);
  const container = document.getElementById('stats-content');

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📊</span>Нет данных за выбранный период</div>`;
    return;
  }

  const qty = totalQty(entries);
  const uniqEmp  = new Set(entries.map(e => e.employee)).size;
  const uniqMod  = new Set(entries.map(e => e.model)).size;
  const uniqSize = new Set(entries.map(e => normalizeSize(e.size))).size;

  function barList(data, maxVal) {
    return data.map(([label, val]) => `
      <div class="bar-item">
        <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(val/maxVal*100)}%"></div></div>
        <div class="bar-val">${val}</div>
      </div>`).join('');
  }

  const topEmp   = groupSum(entries, e => e.employee).slice(0,8);
  const topModel = groupSum(entries, e => e.model).slice(0,8);
  const topSizes = groupSum(entries, e => normalizeSize(e.size)).slice(0,15);

  const modelNames = [...new Set(entries.map(e => e.model))];
  const modelsSizeHtml = modelNames.map(modelName => {
    const me = entries.filter(e => e.model === modelName);
    const sizeMap = groupSum(me, e => normalizeSize(e.size));
    const mt = totalQty(me);
    return `<div class="model-sizes-block">
      <div class="model-sizes-header">${esc(modelName)} <span>итого ${mt} шт</span></div>
      <div class="size-chips">${sizeMap.map(([sz,qt]) => `
        <div class="size-chip">
          <div class="size-chip-size">${esc(sz)}</div>
          <div class="size-chip-qty">${qt} шт</div>
        </div>`).join('')}</div>
    </div>`;
  }).join('<div class="model-divider"></div>');

  // Chart
  const days = 14;
  const now = new Date();
  const dayData = [];
  for (let i=days-1;i>=0;i--) {
    const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
    const next = new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
    const q = entries.filter(e => { const t=new Date(e.createdAt).getTime(); return t>=d.getTime()&&t<next.getTime(); })
              .reduce((s,e)=>s+Number(e.quantity),0);
    dayData.push({ label:fmtDate(d), qty:q });
  }
  const maxQ = Math.max(...dayData.map(d=>d.qty),1);

  container.innerHTML = `
    <div class="stat-block">
      <div class="stat-block-title">Общая информация</div>
      <div class="stat-kpi-grid">
        <div class="stat-kpi"><div class="stat-kpi-val">${qty}</div><div class="stat-kpi-label">Всего шт</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${entries.length}</div><div class="stat-kpi-label">Записей</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqEmp}</div><div class="stat-kpi-label">Сотрудн.</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqMod}</div><div class="stat-kpi-label">Моделей</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${uniqSize}</div><div class="stat-kpi-label">Размеров</div></div>
        <div class="stat-kpi"><div class="stat-kpi-val">${entries.length?Math.round(qty/entries.length):0}</div><div class="stat-kpi-label">Ср./запись</div></div>
      </div>
    </div>
    <div class="stat-block">
      <div class="stat-block-title">Топ сотрудников</div>
      <div class="bar-list">${topEmp.length?barList(topEmp,topEmp[0][1]):'<div class="empty-state">Нет данных</div>'}</div>
    </div>
    <div class="stat-block">
      <div class="stat-block-title">Топ моделей</div>
      <div class="bar-list">${topModel.length?barList(topModel,topModel[0][1]):'<div class="empty-state">Нет данных</div>'}</div>
    </div>
    <div class="stat-block">
      <div class="stat-block-title">🔥 Топ размеров</div>
      <div class="bar-list">${topSizes.length?barList(topSizes,topSizes[0][1]):'<div class="empty-state">Нет данных</div>'}</div>
    </div>
    <div class="stat-block">
      <div class="stat-block-title">Размеры по моделям</div>
      ${modelsSizeHtml||'<div class="empty-state">Нет данных</div>'}
    </div>
    <div class="stat-block">
      <div class="stat-block-title">Динамика — последние ${days} дней</div>
      <div class="chart-wrap">
        <div class="chart-canvas-area">
          ${dayData.map(d=>`
            <div class="chart-bar-wrap" title="${d.label}: ${d.qty} шт">
              <div class="chart-bar" style="height:${Math.round(d.qty/maxQ*66)}px"></div>
              <div class="chart-day-label">${d.label.split('.')[0]}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentPeriod = btn.dataset.period;
    renderStats();
  });
});

// ─── MOTIVATION SCREEN ───────────────────────
function renderMotivation() {
  const container = document.getElementById('motivation-content');
  if (!state.employees.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🏆</span>Добавьте сотрудников в настройках</div>`;
    return;
  }

  // Leaderboard data (all time)
  const lb = state.employees.map(emp => ({
    emp,
    qty:    empTotalQty(emp),
    streak: getStreak(emp),
    level:  getLevel(empTotalQty(emp)),
    badges: getEarnedBadges(emp),
    todayQ: todayQtyForEmployee(emp)
  })).sort((a,b) => b.qty - a.qty);

  // Podium (top 3)
  const podiumOrder = [lb[1], lb[0], lb[2]].filter(Boolean); // 2nd, 1st, 3rd visual order
  const podiumClasses = ['p2','p1','p3'];
  const podiumEmojis  = ['🥈','🥇','🥉'];

  const podiumHtml = `
    <div class="motiv-hero">
      <div class="motiv-hero-title">🏆 Рейтинг сотрудников</div>
      <div class="motiv-podium">
        ${podiumOrder.map((item,i) => item ? `
          <div class="podium-item ${podiumClasses[i]}">
            <div class="podium-qty">${item.qty}</div>
            <div class="podium-avatar">${item.level.emoji}</div>
            <div class="podium-name">${esc(item.emp)}</div>
            <div class="podium-block"></div>
          </div>
        ` : '').join('')}
      </div>
    </div>
  `;

  // Full leaderboard
  const lbHtml = `
    <div class="stat-block">
      <div class="stat-block-title">Полный рейтинг — все время</div>
      <div class="leaderboard">
        ${lb.map((item,i) => `
          <div class="lb-item">
            <div class="lb-rank ${i<3?'top'+(i+1):''}">${i+1}</div>
            <div class="lb-avatar">${item.level.emoji}</div>
            <div class="lb-info">
              <div class="lb-name">${esc(item.emp)}</div>
              <div class="lb-level">${item.level.label}${item.badges.length ? ' · ' + item.badges.slice(0,3).map(b=>b.icon).join('') : ''}</div>
            </div>
            <div class="lb-right">
              <div class="lb-qty">${item.qty}</div>
              ${item.streak > 0 ? `<div class="lb-streak">🔥 ${item.streak} дн</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Today's goals
  const goalsHtml = state.employees.some(e => state.goals[e]) ? `
    <div class="stat-block">
      <div class="stat-block-title">🎯 Цели на сегодня</div>
      <div class="goal-cards">
        ${state.employees.filter(e => state.goals[e]).map(emp => {
          const goal = Number(state.goals[emp]);
          const done = todayQtyForEmployee(emp);
          const pct  = Math.min(100, Math.round(done/goal*100));
          const color = pct>=100 ? '#a8ff78' : pct>=60 ? '#e8ff47' : '#ff9f43';
          return `
            <div class="goal-card">
              <div class="goal-card-header">
                <span class="goal-card-name">${esc(emp)} ${pct>=100?'✅':''}</span>
                <span class="goal-card-pct" style="color:${color}">${pct}%</span>
              </div>
              <div class="goal-card-track">
                <div class="goal-card-fill" style="width:${pct}%;background:${color}"></div>
              </div>
              <div class="goal-card-sub">${done} из ${goal} шт${done<goal ? ` — осталось ${goal-done}` : ' — ВЫПОЛНЕНО!'}</div>
            </div>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  // Records
  const allEntries = state.entries;
  let bestDay = 0, bestDayDate = '', bestEntry = null;

  if (allEntries.length) {
    // Best single entry
    bestEntry = allEntries.reduce((b,e) => Number(e.quantity) > Number(b.quantity) ? e : b, allEntries[0]);

    // Best day
    const byDay = {};
    allEntries.forEach(e => {
      const d = e.createdAt.slice(0,10);
      byDay[d] = (byDay[d]||0) + Number(e.quantity);
    });
    for (const [d,q] of Object.entries(byDay)) { if (q>bestDay) { bestDay=q; bestDayDate=d; } }
  }

  const recordsHtml = `
    <div class="stat-block">
      <div class="stat-block-title">🌟 Рекорды</div>
      <div class="records-grid">
        <div class="record-card">
          <div class="record-icon">📅</div>
          <div class="record-val">${bestDay}</div>
          <div class="record-label">Лучший день</div>
          <div class="record-sub">${bestDayDate || '—'}</div>
        </div>
        <div class="record-card">
          <div class="record-icon">⚡</div>
          <div class="record-val">${bestEntry ? bestEntry.quantity : 0}</div>
          <div class="record-label">Макс. за раз</div>
          <div class="record-sub">${bestEntry ? esc(bestEntry.employee) : '—'}</div>
        </div>
        <div class="record-card">
          <div class="record-icon">🔥</div>
          <div class="record-val">${lb.length ? Math.max(...lb.map(x=>x.streak)) : 0}</div>
          <div class="record-label">Макс. стрик</div>
          <div class="record-sub">дней подряд</div>
        </div>
        <div class="record-card">
          <div class="record-icon">👥</div>
          <div class="record-val">${state.employees.length}</div>
          <div class="record-label">Сотрудников</div>
          <div class="record-sub">в команде</div>
        </div>
      </div>
    </div>
  `;

  // Badges per employee
  const badgesHtml = lb.map(item => {
    const earned = getEarnedBadges(item.emp);
    const allBadges = BADGES.map(b => ({
      ...b,
      isEarned: earned.some(e => e.id === b.id)
    }));
    return `
      <div class="stat-block">
        <div class="stat-block-title">${item.level.emoji} ${esc(item.emp)} — Достижения</div>
        <div class="badges-grid">
          ${allBadges.map(b => `
            <div class="badge-item ${b.isEarned?'earned':'locked'}">
              <div class="badge-icon">${b.icon}</div>
              <div class="badge-info">
                <div class="badge-name">${b.name}</div>
                <div class="badge-desc">${b.desc}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = podiumHtml + lbHtml + goalsHtml + recordsHtml + badgesHtml;
}

// ─── SETTINGS ────────────────────────────────
function renderSettings() {
  renderTagEditor('colors-editor',    state.colors,    'colors');
  renderTagEditor('sizes-editor',     state.sizes,     'sizes');
  renderTagEditor('employees-editor', state.employees, 'employees');
  renderTagEditor('models-editor',    state.models,    'models');
  renderGoalsEditor();
}

function renderTagEditor(containerId, arr, key) {
  const c = document.getElementById(containerId);
  c.innerHTML = arr.map((v,i) => `
    <div class="tag-item">
      <span>${esc(v)}</span>
      <button class="tag-remove" data-key="${key}" data-idx="${i}">×</button>
    </div>`).join('');
  c.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state[btn.dataset.key].splice(parseInt(btn.dataset.idx,10),1);
      persist(); refreshAddForm();
      renderTagEditor(containerId, state[btn.dataset.key], btn.dataset.key);
    });
  });
}

function renderGoalsEditor() {
  const c = document.getElementById('goals-editor');
  if (!state.employees.length) {
    c.innerHTML = '<div style="color:var(--muted);font-size:12px">Сначала добавьте сотрудников</div>';
    return;
  }
  c.innerHTML = state.employees.map(emp => `
    <div class="goal-row">
      <span class="goal-row-name">${esc(emp)}</span>
      <input type="number" class="form-control goal-row input" data-emp="${esc(emp)}"
        placeholder="норма/день" min="1" inputmode="numeric"
        value="${state.goals[emp] || ''}" />
    </div>
  `).join('');

  c.querySelectorAll('input[data-emp]').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseInt(inp.value, 10);
      if (v > 0) state.goals[inp.dataset.emp] = v;
      else delete state.goals[inp.dataset.emp];
      persist();
    });
  });
}

function addTagFromInput(inputId, stateKey, editorId) {
  const inp = document.getElementById(inputId);
  const v = inp.value.trim(); if (!v) return;
  if (!state[stateKey].includes(v)) {
    state[stateKey].push(v); persist(); refreshAddForm();
    renderTagEditor(editorId, state[stateKey], stateKey);
    if (stateKey === 'employees') renderGoalsEditor();
  }
  inp.value = '';
}

document.getElementById('btn-add-color').addEventListener('click',       () => addTagFromInput('new-color','colors','colors-editor'));
document.getElementById('btn-add-size').addEventListener('click',        () => addTagFromInput('new-size','sizes','sizes-editor'));
document.getElementById('btn-add-employee-s').addEventListener('click',  () => addTagFromInput('new-employee','employees','employees-editor'));
document.getElementById('btn-add-model-s').addEventListener('click',     () => addTagFromInput('new-model','models','models-editor'));

['new-color','new-size','new-employee','new-model'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const map = {
      'new-color':    ['colors','colors-editor'],
      'new-size':     ['sizes','sizes-editor'],
      'new-employee': ['employees','employees-editor'],
      'new-model':    ['models','models-editor']
    };
    const [k, editor] = map[id];
    addTagFromInput(id, k, editor);
  });
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (confirm(`Удалить ВСЕ ${state.entries.length} записей? Это необратимо.`)) {
    state.entries = []; persist(); updateTopbar(); showToast('Все записи удалены');
  }
});

// ─── PWA INSTALL ─────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span>📦 Установить приложение</span>
    <div class="install-banner-btns">
      <button class="banner-btn" id="banner-install">Установить</button>
      <button class="banner-btn" id="banner-dismiss">✕</button>
    </div>`;
  document.body.appendChild(banner);
  document.getElementById('banner-install').addEventListener('click', async () => {
    deferredPrompt.prompt(); await deferredPrompt.userChoice;
    banner.remove(); deferredPrompt = null;
  });
  document.getElementById('banner-dismiss').addEventListener('click', () => banner.remove());
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ─── INIT ─────────────────────────────────────
updateTopbar();
updateTop3Widget();
