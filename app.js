'use strict';

document.documentElement.classList.remove('no-js');
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const KEY = 'stridecoach-public-journal-v1';
const tabs = ['overview', 'activities', 'strategy', 'training', 'nutrition', 'milestones', 'coach', 'settings'];
const empty = message => `<div class="empty">${esc(message)}</div>`;
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (key, days) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date); };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).valueOf()) && dateKey(new Date(`${value}T12:00:00`)) === value;
const fresh = () => ({ version: 1, workouts: [], fuel: [], planDone: [], sessions: {}, options: { weeklyGoal: 15 } });
const text = (value, max = 5000) => String(value ?? '').slice(0, max);

function normalize(w) {
  if (!w || typeof w !== 'object' || !validDate(w.date) || !['run', 'football', 'other'].includes(w.sport)) throw new Error('Each workout needs a valid date and sport (run, football, other).');
  const out = { ...w, id: text(w.id || uid('imported'), 200), title: text(w.title || w.type || 'Workout', 110), type: text(w.type || 'Workout', 80), notes: text(w.notes), strategy: text(w.strategy, 200), source: text(w.source || 'Imported JSON', 200), shoe: text(w.shoe, 100), evidence: ['confirmed', 'reported', 'user-entered'].includes(w.evidence) ? w.evidence : 'user-entered' };
  for (const [key, max] of [['distanceKm', 200], ['durationSec', 172800], ['avgHr', 240], ['cadence', 250], ['rpe', 10], ['officialDistanceKm', 200], ['officialDurationSec', 172800]]) {
    if (out[key] == null || out[key] === '') { out[key] = key === 'distanceKm' ? 0 : null; continue; }
    const value = Number(out[key]);
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${key}`);
    out[key] = value;
  }
  out.reviews = (Array.isArray(w.reviews) ? w.reviews : []).slice(0, 100).map(review => ({ date: text(review.date, 10), source: text(review.source, 200), summary: text(review.summary), positives: text(review.positives), limiters: text(review.limiters), next: text(review.next), confidence: text(review.confidence) }));
  out.splits = (Array.isArray(w.splits) ? w.splits : []).slice(0, 1000).map(split => ({ label: text(split.label, 100), km: Number(split.km) || 0, seconds: Number(split.seconds) || 0, hr: Number(split.hr) || null }));
  return out;
}

function cleanOptions(raw = {}) {
  const options = {};
  for (const [key, max] of [['weeklyGoal', 300], ['easyHrCap', 220], ['zone3Low', 240], ['zone3High', 240]]) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0 && value <= max) options[key] = value;
  }
  options.weeklyGoal ||= 15;
  options.goalName = text(raw.goalName, 100);
  options.goalDate = validDate(raw.goalDate || '') ? raw.goalDate : '';
  return options;
}

function cleanFuel(entries) {
  return (Array.isArray(entries) ? entries : []).filter(item => item && validDate(item.date)).slice(0, 3000).map(item => ({ id: text(item.id || uid('fuel'), 200), date: item.date, when: text(item.when, 80), content: text(item.content, 700) }));
}

function cleanSessions(sessions) {
  const out = {};
  if (sessions && typeof sessions === 'object' && !Array.isArray(sessions)) for (const [date, session] of Object.entries(sessions).slice(0, 3650)) {
    if (validDate(date) && session && typeof session === 'object') out[date] = { title: text(session.title, 100), notes: text(session.notes, 2000) };
  }
  return out;
}

let storageIssue = false;
function load() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!value) return fresh();
    if (!Array.isArray(value.workouts) || value.workouts.length > 10000) throw new Error('Invalid saved journal');
    return { version: 1, workouts: value.workouts.map(normalize), fuel: cleanFuel(value.fuel), planDone: (Array.isArray(value.planDone) ? value.planDone : []).filter(validDate), sessions: cleanSessions(value.sessions), options: cleanOptions(value.options) };
  } catch { storageIssue = true; return fresh(); }
}

let db = load();
let weekOffset = 0;
let activityRange = 'rolling';
let activePreset = '1000';
let returnFocus = null;
function notify(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch { alert('Browser storage is unavailable or full. Export a backup to protect your records.'); return false; }
}
function commit(next) {
  const previous = db;
  db = next;
  if (save()) return true;
  db = previous;
  return false;
}
function fmtTime(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds)) || seconds < 0) return '—';
  const value = Math.round(seconds), h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const fmtPace = (seconds, km) => seconds > 0 && km > 0 ? `${fmtTime(seconds / km)}/km` : '—';
function parseDuration(value) {
  const parts = String(value).trim().split(':');
  if (![2, 3].includes(parts.length) || parts.some(part => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.some((n, i) => i > 0 && n > 59)) return null;
  const total = values.length === 3 ? values[0] * 3600 + values[1] * 60 + values[2] : values[0] * 60 + values[1];
  return total > 0 && total <= 172800 ? total : null;
}
const sorted = () => db.workouts.slice().sort((a, b) => b.date.localeCompare(a.date));
function closeMore() { $('mobileMoreMenu').hidden = true; $('mobileMoreBackdrop').hidden = true; $('mobileMoreButton').setAttribute('aria-expanded', 'false'); }
function goto(id, push = true) {
  if (!tabs.includes(id)) return;
  if (push && location.hash !== `#tab-${id}`) history.pushState(null, '', `#tab-${id}`);
  document.querySelectorAll('[data-tab]').forEach(link => { const active = link.dataset.tab === id; link.classList.toggle('active', active); link.setAttribute('aria-current', active ? 'page' : 'false'); });
  document.querySelectorAll('.tabs').forEach(section => { const active = section.id === `tab-${id}`; section.hidden = !active; section.classList.toggle('active', active); });
  closeMore(); window.scrollTo(0, 0);
}
function modal(title, body) {
  returnFocus = document.activeElement;
  $('modalTitle').textContent = title; $('modalContent').innerHTML = body; $('workoutModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  $('workoutModal').querySelector('input,select,textarea,button').focus();
}
function closeModal() { $('workoutModal').classList.remove('open'); document.body.style.overflow = ''; if (returnFocus?.isConnected) returnFocus.focus(); }

document.addEventListener('click', event => {
  const button = event.target.closest('button,a[data-tab]');
  if (!button) return;
  if (button.dataset.tab || button.dataset.goto) { event.preventDefault(); goto(button.dataset.tab || button.dataset.goto); }
  else if (button.dataset.action === 'new') newWorkout();
  else if (button.dataset.open) openWorkout(button.dataset.open);
  else if (button.hasAttribute('data-close')) closeModal();
  else if (button.id === 'mobileMoreButton') { const open = $('mobileMoreMenu').hidden; $('mobileMoreMenu').hidden = !open; $('mobileMoreBackdrop').hidden = !open; button.setAttribute('aria-expanded', String(open)); }
  else if (button.id === 'mobileMoreClose') closeMore();
});
$('mobileMoreBackdrop').onclick = closeMore;
$('workoutModal').onclick = event => { if (event.target === $('workoutModal')) closeModal(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeModal(); closeMore(); }
  if (event.key === 'Tab' && $('workoutModal').classList.contains('open')) {
    const focusable = [...$('workoutModal').querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.addEventListener('popstate', () => goto(location.hash.slice(5) || 'overview', false));
window.addEventListener('hashchange', () => goto(location.hash.slice(5) || 'overview', false));

function activityHtml(w) {
  return `<div class="activity-card"><div class="row" style="flex:1;min-width:0;flex-wrap:nowrap"><div class="avatar">${w.sport === 'football' ? '⚽' : w.sport === 'run' ? '🏃' : '✦'}</div><div class="sport-info"><strong>${esc(w.title)} <span class="small dim">· ${esc(w.date)}</span></strong><div class="minirow"><span>${w.distanceKm ? w.distanceKm.toFixed(2) + ' km' : 'Distance not logged'}</span><span>${fmtTime(w.durationSec)}</span><span>${w.sport === 'run' ? fmtPace(w.durationSec, w.distanceKm) : esc(w.sport)}</span>${w.avgHr ? `<span>♥ ${w.avgHr} bpm</span>` : ''}<span>${w.reviews.length} coach review(s)</span></div><span class="pill gray" style="margin-top:7px">${esc(w.evidence)}</span></div></div><button class="btn tiny" data-open="${esc(w.id)}">Details →</button></div>`;
}
function renderActivities() {
  const sport = $('sportFilter').value, evidence = $('verifiedFilter').value;
  const runs = sorted().filter(w => (sport === 'all' || w.sport === sport) && (evidence === 'all' || w.evidence === evidence));
  $('activityResultCount').textContent = `${runs.length} results`;
  $('activityList').innerHTML = runs.map(activityHtml).join('') || empty('No matching workouts yet. Add an activity or restore your backup in Data & privacy.');
}
$('sportFilter').onchange = renderActivities; $('verifiedFilter').onchange = renderActivities;

function inputField(id, label, attrs = '', full = false) { return `<div class="field${full ? ' full' : ''}"><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`; }
function newWorkout(id = null) {
  const w = db.workouts.find(item => item.id === id);
  modal(w ? 'Edit workout' : 'Add new activity', `<form id="workoutForm" class="inputs">${inputField('wDate', 'Date', 'type="date" required')}
  <div class="field"><label for="wSport">Sport</label><select id="wSport"><option value="run">Run / race</option><option value="football">Football</option><option value="other">Other sport</option></select></div>
  ${inputField('wType', 'Activity type', 'maxlength="80" placeholder="Easy run, race, football…"')}${inputField('wTitle', 'Display name', 'maxlength="110" placeholder="Morning run"')}
  ${inputField('wKm', 'Distance (km, optional)', 'type="number" min="0" max="200" step="0.001"')}${inputField('wDuration', 'Duration (mm:ss or hh:mm:ss)', 'placeholder="30:00"')}
  ${inputField('wHR', 'Average HR (bpm, optional)', 'type="number" min="30" max="240"')}${inputField('wCadence', 'Cadence (spm, optional)', 'type="number" min="0" max="250"')}
  ${inputField('wRpe', 'RPE (1–10, optional)', 'type="number" min="1" max="10"')}
  <div class="field"><label for="wEvidence">Evidence</label><select id="wEvidence"><option value="user-entered">Self entered</option><option value="confirmed">Confirmed by evidence</option><option value="reported">Reported / approximate</option></select></div>
  ${inputField('wShoe', 'Shoe (optional)', 'maxlength="100"')}${inputField('wStrategy', 'Run / walk strategy (optional)', 'maxlength="200"')}
  <div class="field full"><label for="wNotes">Notes, symptoms, fueling and context</label><textarea id="wNotes" maxlength="5000"></textarea></div>
  ${inputField('wSource', 'Data source', 'maxlength="200"', true)}<div class="field full"><button class="btn primary" type="submit">${w ? 'Save changes' : 'Save workout'}</button></div></form>`);
  const values = { wDate: w?.date || dateKey(), wSport: w?.sport || 'run', wType: w?.type || '', wTitle: w?.title || '', wKm: w?.distanceKm ?? '', wDuration: w?.durationSec ? fmtTime(w.durationSec) : '', wHR: w?.avgHr ?? '', wCadence: w?.cadence ?? '', wRpe: w?.rpe ?? '', wEvidence: w?.evidence || 'user-entered', wShoe: w?.shoe || '', wStrategy: w?.strategy || '', wNotes: w?.notes || '', wSource: w?.source || 'Manual entry' };
  for (const [key, value] of Object.entries(values)) $(key).value = value;
  $('workoutForm').onsubmit = event => {
    event.preventDefault();
    const duration = parseDuration($('wDuration').value);
    if ($('wDuration').value.trim() && duration === null) { alert('Duration must be mm:ss or hh:mm:ss, up to 48 hours.'); return; }
    try {
      const item = normalize({ ...(w || {}), id: w?.id || uid('workout'), date: $('wDate').value, sport: $('wSport').value, type: $('wType').value || 'Workout', title: $('wTitle').value || $('wType').value || 'Workout', distanceKm: $('wKm').value || 0, durationSec: duration, avgHr: $('wHR').value || null, cadence: $('wCadence').value || null, rpe: $('wRpe').value || null, evidence: $('wEvidence').value, shoe: $('wShoe').value, strategy: $('wStrategy').value, notes: $('wNotes').value, source: $('wSource').value });
      const workouts = w ? db.workouts.map(old => old.id === id ? item : old) : [...db.workouts, item];
      if (!commit({ ...db, workouts })) return;
      closeModal(); renderAll(); goto('activities'); notify(w ? 'Workout updated' : 'Workout saved');
    } catch (error) { alert(error.message); }
  };
}
function openWorkout(id) {
  const w = db.workouts.find(item => item.id === id); if (!w) return;
  const reviews = w.reviews.map(r => `<div class="feedback"><strong>${esc(r.date)} · ${esc(r.source)}</strong><p><b>Assessment:</b> ${esc(r.summary)}</p>${[['What went well', r.positives], ['Limiting factors', r.limiters], ['Next steps', r.next], ['Confidence', r.confidence]].filter(([, value]) => value).map(([label, value]) => `<p><b>${label}:</b> ${esc(value)}</p>`).join('')}</div>`).join('') || empty('No coaching reviews yet. Add a dated note below.');
  const splits = w.splits.length ? `<div class="tablewrap"><table><thead><tr><th>Segment</th><th>Distance</th><th>Time</th><th>Pace</th></tr></thead><tbody>${w.splits.map(s => `<tr><td>${esc(s.label)}</td><td>${s.km} km</td><td>${fmtTime(s.seconds)}</td><td>${fmtPace(s.seconds, s.km)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="guide">No recorded splits.</p>';
  modal(w.title, `<div class="between"><span class="pill gray">${esc(w.date)} · ${esc(w.sport)}</span><button class="btn tiny" id="editWorkout">✎ Edit details</button></div><div class="grid" style="margin-top:16px"><div class="kpi col4"><div class="small dim">Distance</div><div class="v">${w.distanceKm.toFixed(2)} km</div></div><div class="kpi col4"><div class="small dim">Time</div><div class="v">${fmtTime(w.durationSec)}</div></div><div class="kpi col4"><div class="small dim">Avg HR</div><div class="v">${w.avgHr ? w.avgHr + ' bpm' : '—'}</div></div></div>${w.officialDurationSec ? `<p class="notebox">Official result: ${fmtTime(w.officialDurationSec)} over ${w.officialDistanceKm} km · recorded separately from GPS.</p>` : ''}<p class="dim">${esc(w.shoe || 'Shoe not recorded')} · ${w.cadence ? w.cadence + ' spm' : 'Cadence not recorded'} · ${w.rpe ? 'RPE ' + w.rpe + '/10' : 'RPE not recorded'}</p><p>Run / walk: ${esc(w.strategy || 'Not recorded')}</p><p style="white-space:pre-wrap">${esc(w.notes || 'No notes yet.')}</p><p class="guide">Source: ${esc(w.source)}</p><div class="hr"></div><h3>Recorded splits</h3>${splits}<div class="hr"></div><div class="between"><h3>Coaching reviews (${w.reviews.length})</h3><button class="btn tiny" id="showReviewForm">＋ Add coach note</button></div>${reviews}<div id="reviewFormSlot"></div><div class="hr"></div><button class="btn danger tiny" id="deleteWorkout">Delete workout</button>`);
  $('editWorkout').onclick = () => newWorkout(id);
  $('showReviewForm').onclick = () => {
    $('reviewFormSlot').innerHTML = `<form id="reviewForm" class="inputs" style="margin-top:16px">${inputField('rvDate', 'Review date', 'type="date" required')}${inputField('rvSource', 'Source', 'maxlength="200"')}<div class="field full"><label for="rvSummary">Assessment</label><textarea id="rvSummary" required maxlength="5000"></textarea></div>${['Good', 'Bad', 'Next'].map((key, index) => `<div class="field full"><label for="rv${key}">${['What went well', 'Limiting factors', 'Next action'][index]}</label><textarea id="rv${key}" maxlength="5000"></textarea></div>`).join('')}<button class="btn primary" type="submit">Save review</button></form>`;
    $('rvDate').value = dateKey(); $('rvSource').value = 'Coaching review'; $('rvSummary').focus();
    $('reviewForm').onsubmit = event => {
      event.preventDefault();
      const review = { date: $('rvDate').value, source: $('rvSource').value, summary: $('rvSummary').value, positives: $('rvGood').value, limiters: $('rvBad').value, next: $('rvNext').value };
      if (!commit({ ...db, workouts: db.workouts.map(item => item.id === id ? { ...item, reviews: [...item.reviews, review] } : item) })) return;
      renderAll(); openWorkout(id); notify('Coaching review saved');
    };
  };
  $('deleteWorkout').onclick = () => {
    if (!confirm('Delete this workout and its reviews? Export a backup first if needed.')) return;
    if (!commit({ ...db, workouts: db.workouts.filter(item => item.id !== id) })) return;
    closeModal(); renderAll(); notify('Workout deleted');
  };
}

function periodDates() {
  const today = dateKey(); const day = new Date(`${today}T12:00:00`).getDay();
  const start = addDays(today, activityRange === 'rolling' ? -6 : -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
function renderOverview() {
  const runs = db.workouts.filter(w => w.sport === 'run');
  const total = runs.reduce((sum, w) => sum + w.distanceKm, 0);
  const minutes = db.workouts.reduce((sum, w) => sum + (w.durationSec || 0) / 60, 0);
  $('databaseCount').textContent = `${db.workouts.length} activities`; $('stat-count').textContent = db.workouts.length;
  $('stat-distance').textContent = total.toFixed(1) + ' km'; $('stat-duration').textContent = Math.round(minutes) + ' min';
  $('stat-longest').textContent = runs.length ? Math.max(...runs.map(w => w.distanceKm)).toFixed(1) + ' km' : '—';
  const dates = periodDates(); const entries = db.workouts.filter(w => dates.includes(w.date));
  const runKm = entries.filter(w => w.sport === 'run').reduce((sum, w) => sum + w.distanceKm, 0);
  const checks = db.planDone.filter(date => dates.includes(date)).length;
  for (const [id, value, goal] of [['ringDistance', runKm, db.options.weeklyGoal], ['ringSessions', entries.length, 3], ['ringChecks', checks, 7]]) $(id).style.setProperty('--percent', Math.min(100, value / goal * 100));
  $('ringDistanceText').textContent = runKm.toFixed(1) + ' km'; $('ringSessionsText').textContent = `${entries.length} sessions`; $('ringChecksText').textContent = `${checks} check-ins`;
  $('weekRangeText').textContent = `${dates[0]} to ${dates[6]}`;
  const dayMinutes = dates.map(date => entries.filter(w => w.date === date).reduce((sum, w) => sum + (w.durationSec || 0) / 60, 0));
  const max = Math.max(45, ...dayMinutes);
  $('weekBars').innerHTML = dates.map((date, i) => `<div class="week-column" title="${date}: ${Math.round(dayMinutes[i])} minutes"><span class="workout-point">${dayMinutes[i] ? Math.round(dayMinutes[i]) : '—'}</span><span class="bar-track"><span class="bar-fill ${dayMinutes[i] ? '' : 'zero'}" style="--bar-pct:${dayMinutes[i] / max * 100}%"></span></span><span class="weekday">${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span></div>`).join('');
  $('weekSportMinutes').textContent = Math.round(dayMinutes.reduce((a, b) => a + b, 0)) + ' min'; $('weekKmMetric').textContent = runKm.toFixed(1) + ' km'; $('weekSessionsMetric').textContent = entries.length; $('weekChecksMetric').textContent = checks;
  const year = new Date().getFullYear(); $('chartYear').textContent = year;
  const months = Array.from({ length: 12 }, (_, i) => runs.filter(w => w.date.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).reduce((sum, w) => sum + w.distanceKm, 0));
  const monthMax = Math.max(1, ...months);
  $('monthlyChart').innerHTML = months.map((km, i) => `<div class="month" title="${year}-${String(i + 1).padStart(2, '0')}: ${km.toFixed(2)} km"><div class="month-value">${km ? km.toFixed(0) : '—'}</div><div class="month-rail"><div class="month-fill" style="height:${km / monthMax * 100}%"></div></div><div class="month-label">${new Date(year, i).toLocaleDateString(undefined, { month: 'short' })}</div></div>`).join('');
  $('goalSummary').innerHTML = db.options.goalName ? `<strong style="font-size:23px">${esc(db.options.goalName)}</strong><p class="dim">${esc(db.options.goalDate || 'No event date set')}</p>` : empty('Set a goal that means something to you.');
  $('recentActivities').innerHTML = sorted().slice(0, 4).map(activityHtml).join('') || empty('Your story starts with your first activity.');
}
document.querySelectorAll('[data-range]').forEach(button => button.onclick = () => { activityRange = button.dataset.range; document.querySelectorAll('[data-range]').forEach(item => item.classList.toggle('selected', item === button)); renderOverview(); });

function renderPlan() {
  const today = dateKey(), weekday = new Date(today + 'T12:00:00').getDay();
  const start = addDays(today, -((weekday + 6) % 7) + weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  $('planWeekLabel').textContent = `${start} → ${dates[6]}`; $('planChecked').textContent = `${dates.filter(date => db.planDone.includes(date)).length} of 7 checked`;
  $('planDays').innerHTML = dates.map(date => {
    const session = db.sessions[date];
    return `<div class="plan-item"><button type="button" class="session-card rest" data-plan-detail="${date}" aria-label="Edit session on ${date}"><span class="session-day">${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span><span class="session-date">${date.slice(8)}</span><span class="session-emoji">${session ? '✦' : '＋'}</span><span class="session-title">${esc(session?.title || 'Add a session')}</span><span class="session-minor">${session ? 'Tap to view or edit' : 'Make this day your own'}</span></button><label class="plan-tick"><input class="plancheck" data-plan="${date}" type="checkbox" ${db.planDone.includes(date) ? 'checked' : ''}> Checked</label></div>`;
  }).join('');
  document.querySelectorAll('[data-plan]').forEach(input => input.onchange = () => {
    const planDone = input.checked ? [...new Set([...db.planDone, input.dataset.plan])] : db.planDone.filter(date => date !== input.dataset.plan);
    if (commit({ ...db, planDone })) { renderPlan(); renderOverview(); notify('Planned-session check-in saved'); }
  });
  document.querySelectorAll('[data-plan-detail]').forEach(button => button.onclick = () => {
    const date = button.dataset.planDetail, session = db.sessions[date];
    modal(`Your session · ${date}`, `<form class="inputs" id="sessionForm">${inputField('sessionTitle', 'Session name', 'required maxlength="100"', true)}<div class="field full"><label for="sessionNotes">Session instructions / notes</label><textarea id="sessionNotes" maxlength="2000"></textarea></div><button class="btn primary" type="submit">Save session</button></form>`);
    $('sessionTitle').value = session?.title || ''; $('sessionNotes').value = session?.notes || '';
    $('sessionForm').onsubmit = event => { event.preventDefault(); if (commit({ ...db, sessions: { ...db.sessions, [date]: { title: $('sessionTitle').value, notes: $('sessionNotes').value } } })) { closeModal(); renderPlan(); notify('Session saved'); } };
  });
}
$('planPrev').onclick = () => { weekOffset--; renderPlan(); }; $('planNext').onclick = () => { weekOffset++; renderPlan(); };

function renderFuel() {
  $('fuelList').innerHTML = db.fuel.slice().sort((a, b) => b.date.localeCompare(a.date)).map(item => `<div class="sport-line"><div class="sport-info"><strong>${esc(item.date)} · ${esc(item.when)}</strong><p style="white-space:pre-wrap">${esc(item.content)}</p></div><button class="btn tiny danger" data-fuel-delete="${esc(item.id)}" aria-label="Delete nutrition note">✕</button></div>`).join('') || empty('No notes yet. Record what works for your training.');
  document.querySelectorAll('[data-fuel-delete]').forEach(button => button.onclick = () => { if (confirm('Delete this nutrition note?') && commit({ ...db, fuel: db.fuel.filter(item => item.id !== button.dataset.fuelDelete) })) renderFuel(); });
}
$('fuelDate').value = dateKey();
$('fuelForm').onsubmit = event => { event.preventDefault(); if (commit({ ...db, fuel: [...db.fuel, { id: uid('fuel'), date: $('fuelDate').value, when: $('fuelWhen').value, content: $('fuelContent').value.trim() }] })) { $('fuelContent').value = ''; renderFuel(); notify('Nutrition note saved'); } };

function renderMilestones() {
  $('milestoneCards').innerHTML = [['1 km', 1, '⚡'], ['3 km', 3, '✦'], ['5 km', 5, '🔥'], ['10 km', 10, '↗'], ['15 km', 15, '⛰'], ['Half marathon', 21.0975, '🏅'], ['25 km', 25, '✧'], ['Marathon', 42.195, '🏆']].map(([name, distance, icon]) => {
    const results = db.workouts.filter(w => w.sport === 'run' && (w.evidence === 'confirmed' || (w.officialDurationSec && w.officialDistanceKm)) && Math.abs((w.officialDistanceKm || w.distanceKm) - distance) < (distance > 20 ? 0.08 : 0.025) && (w.officialDurationSec || w.durationSec) > 0).sort((a, b) => (a.officialDurationSec || a.durationSec) - (b.officialDurationSec || b.durationSec));
    const best = results[0];
    return `<div class="milestone col3"><div class="between"><span class="emoji">${icon}</span><span class="pill ${best ? '' : 'gray'}">${best ? 'Fastest logged' : 'No timed result'}</span></div><div class="small dim" style="margin-top:12px">${name}</div><b>${best ? fmtTime(best.officialDurationSec || best.durationSec) : '—:—'}</b><em>${best ? esc(best.date) + ' · ' + esc(best.source) : 'Add a confirmed timed effort'}</em></div>`;
  }).join('');
}
function renderReviews() {
  const reviews = db.workouts.flatMap(w => w.reviews.map(r => ({ w, r }))).sort((a, b) => b.r.date.localeCompare(a.r.date));
  $('reviewFeed').innerHTML = reviews.map(({ w, r }) => `<div class="sport-line"><div class="sport-info"><strong>${esc(w.title)} · ${esc(r.date)}</strong><p>${esc(r.summary)}</p><small>Next: ${esc(r.next || 'Not specified')}</small></div><button class="btn tiny" data-open="${esc(w.id)}">Review →</button></div>`).join('') || empty('Coaching notes will appear here when you add them to an activity.');
}

function parsePace(value) { const match = String(value).trim().match(/^(\d{1,3}):(\d{2})$/); return match && Number(match[2]) < 60 && Number(match[1]) * 60 + Number(match[2]) > 0 ? Number(match[1]) * 60 + Number(match[2]) : null; }
function updateProjection() {
  const rp = parsePace($('runPace').value), wp = parsePace($('walkPace').value), seg = Number($('runSegment').value), ws = Number($('walkBreak').value), extra = Number($('raceExtra').value), distance = Number($('raceDistance').value);
  if (!rp || !wp || !Number.isFinite(seg) || seg <= 0 || seg > 30000 || !Number.isFinite(ws) || ws < 0 || ws > 1000 || !Number.isFinite(extra) || extra < 0 || extra > 120) {
    $('raceProjected').textContent = 'Check inputs'; $('raceOverall').textContent = '—'; $('raceWalks').textContent = '—'; $('projectedCheckpoints').innerHTML = ''; return;
  }
  let d = 0, t = 0, walkCount = 0, iterations = 0; const segments = [];
  while (d < distance - 1e-9 && iterations++ < 1500) {
    const block = activePreset === 'descending' ? [5, 4, 3, 2, 1][Math.min(walkCount, 4)] : $('runMode').value === 'time' ? seg / rp : seg / 1000;
    const run = Math.min(block, distance - d);
    segments.push({ from: d, to: d + run, t0: t, t1: t + run * rp }); d += run; t += run * rp;
    if (d >= distance - 1e-9) break;
    if (ws > 0) { const walk = Math.min(ws / wp, distance - d); segments.push({ from: d, to: d + walk, t0: t, t1: t + walk * wp }); d += walk; t += walk * wp; walkCount++; }
  }
  if (d < distance - 1e-9) { $('raceProjected').textContent = 'Too many intervals'; $('raceOverall').textContent = '—'; $('raceWalks').textContent = '—'; $('projectedCheckpoints').innerHTML = ''; return; }
  const finish = t + extra * 60;
  $('raceProjected').textContent = fmtTime(finish); $('raceOverall').textContent = fmtPace(finish, distance); $('raceWalks').textContent = walkCount;
  const checkpoints = [...new Set([5, 10, 15, 20, 30, 40, distance].filter(km => km <= distance))];
  $('projectedCheckpoints').innerHTML = checkpoints.map(km => { const s = segments.find(segment => segment.to >= km - 1e-9); const elapsed = s.t0 + (km - s.from) * (s.t1 - s.t0) / (s.to - s.from) + extra * 60 * km / distance; return `<div class="metric-pair"><span>${km === distance ? 'Finish' : km + ' km'}</span><strong>${fmtTime(elapsed)}</strong></div>`; }).join('');
}
['runPace', 'walkPace', 'runMode', 'runSegment', 'walkBreak', 'raceExtra', 'raceDistance'].forEach(id => $(id).addEventListener('input', updateProjection));
document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => {
  activePreset = button.dataset.preset; $('runMode').value = activePreset === '300' ? 'time' : 'distance';
  $('runSegment').value = activePreset === '300' ? 300 : activePreset === 'descending' ? 5000 : activePreset === '500' ? 500 : activePreset === '2000' ? 2000 : 1000;
  $('walkBreak').value = activePreset === 'continuous' ? 0 : 60;
  $('runSegment').disabled = $('runMode').disabled = activePreset === 'descending';
  document.querySelectorAll('[data-preset]').forEach(item => item.classList.toggle('selected', item === button)); updateProjection();
});
['runMode', 'runSegment', 'walkBreak'].forEach(id => $(id).addEventListener('input', () => { if (activePreset === 'descending' && id !== 'walkBreak') return; if (activePreset !== 'descending') { activePreset = 'custom'; document.querySelectorAll('[data-preset]').forEach(item => item.classList.remove('selected')); } }));

function renderSettings() {
  $('goalName').value = db.options.goalName || ''; $('goalDate').value = db.options.goalDate || ''; $('weeklyGoal').value = db.options.weeklyGoal;
  $('hrEasyCap').value = db.options.easyHrCap ?? ''; $('hrZ3Low').value = db.options.zone3Low ?? ''; $('hrZ3High').value = db.options.zone3High ?? '';
}
$('goalForm').onsubmit = event => { event.preventDefault(); if (commit({ ...db, options: { ...db.options, goalName: $('goalName').value.trim(), goalDate: $('goalDate').value, weeklyGoal: Number($('weeklyGoal').value) } })) { renderOverview(); notify('Goal saved'); } };
$('saveZones').onclick = () => {
  const cap = $('hrEasyCap').value === '' ? null : Number($('hrEasyCap').value), lo = $('hrZ3Low').value === '' ? null : Number($('hrZ3Low').value), hi = $('hrZ3High').value === '' ? null : Number($('hrZ3High').value);
  if ((cap !== null && !(cap >= 60 && cap <= 220)) || ((lo !== null || hi !== null) && !(lo >= 60 && hi > lo && hi <= 240))) { $('zoneStatus').textContent = 'Check the ceiling, and set both Z3 boundaries or leave both blank.'; return; }
  if (commit({ ...db, options: { ...db.options, easyHrCap: cap, zone3Low: lo, zone3High: hi } })) { $('zoneStatus').textContent = 'Personal HR notes saved in this browser.'; notify('HR guidelines saved'); }
};
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `StrideCoach_AI_Backup_${dateKey()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportBackup').onclick = () => { download(db); notify('Backup downloaded'); };
async function importData(parsed) {
  const arr = Array.isArray(parsed) ? parsed : parsed?.workout ? [parsed.workout] : parsed?.workouts;
  if (!Array.isArray(arr) || arr.length > 10000) throw new Error('Expected up to 10,000 workouts in a JSON backup or update.');
  const incoming = arr.map(normalize); const workouts = new Map(db.workouts.map(w => [w.id, w])); let added = 0, updated = 0;
  for (const w of incoming) {
    const previous = workouts.get(w.id);
    if (previous) { const reviews = [...previous.reviews]; for (const review of w.reviews) if (!reviews.some(old => JSON.stringify(old) === JSON.stringify(review))) reviews.push(review); workouts.set(w.id, { ...previous, ...w, reviews }); updated++; }
    else { workouts.set(w.id, w); added++; }
  }
  const full = !Array.isArray(parsed) && Array.isArray(parsed.fuel) && Array.isArray(parsed.planDone);
  if (!confirm(`Import ${added} new workouts and update ${updated} existing workouts?${full ? ' This full backup also restores food notes, check-ins, goals and session notes.' : ''} Existing other workouts are preserved. Export a backup first if needed.`)) return;
  const next = { ...db, workouts: [...workouts.values()] };
  if (full) { next.fuel = cleanFuel(parsed.fuel); next.planDone = [...new Set(parsed.planDone.filter(validDate))]; next.sessions = cleanSessions(parsed.sessions); next.options = cleanOptions({ ...db.options, ...parsed.options }); }
  if (!commit(next)) return;
  renderAll(); $('importMsg').textContent = `Imported ${added} new, updated ${updated} existing workout(s).`; notify('Backup imported into this browser only');
}
$('importBtn').onclick = async () => {
  const file = $('importFile').files[0];
  if (!file) { $('importMsg').textContent = 'Select a JSON file first.'; return; }
  if (file.size > 8 * 1024 * 1024) { $('importMsg').textContent = 'File too large (max 8 MB).'; return; }
  try { await importData(JSON.parse(await file.text())); $('importFile').value = ''; }
  catch (error) { $('importMsg').textContent = 'Import failed: ' + error.message; }
};
$('clearData').onclick = () => { if (prompt('Type ERASE to remove this browser journal. This cannot be undone without a backup.') === 'ERASE' && commit(fresh())) { renderAll(); notify('Local journal erased'); } };
function renderAll() { renderOverview(); renderActivities(); renderPlan(); renderFuel(); renderMilestones(); renderReviews(); renderSettings(); }
renderAll(); updateProjection(); goto(tabs.includes(location.hash.slice(5)) ? location.hash.slice(5) : 'overview', false);
if (storageIssue) alert('Saved browser data could not be loaded. It has not been overwritten. Export or recover your previous backup before saving a new journal.');
