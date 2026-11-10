let lastReport = null;
function api(action, params = {}) {
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', action);
  const token = sessionStorage.getItem('publicToken');
  if (token && !params.token) params.token = token;
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  return fetch(url).then(r => r.json());
}
function showError(msg){ const e=document.getElementById('error'); e.textContent=msg; e.classList.remove('d-none'); }

async function init() {
  const params = new URLSearchParams(location.search);
  const unit = params.get('unit') || '';
  const unitToken = params.get('unitToken') || '';
  const lp = {};
  if (unit) { lp.unit = unit; lp.unitToken = unitToken; }
  const res = await api('listActivities', lp);
  if (!res.ok) { showError(res.error); return; }
  if (res.publicToken) sessionStorage.setItem('publicToken', res.publicToken);
  const sel = document.getElementById('activitySelect');
  sel.innerHTML = (res.activities||[]).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  document.getElementById('loadBtn').onclick = loadReport;
  document.getElementById('chkRole').addEventListener('change', () => { if (lastReport) { renderManpower(lastReport); renderMeals(lastReport); renderLodging(lastReport); } });
  document.getElementById('chkGender').addEventListener('change', () => { if (lastReport) { renderManpower(lastReport); renderMeals(lastReport); renderLodging(lastReport); } });
}
async function loadReport() {
  const actId = document.getElementById('activitySelect').value;
  const res = await api('getReport', { act: actId });
  if (!res.ok) { showError(res.error); return; }
  document.getElementById('error').classList.add('d-none');
  document.getElementById('reportArea').classList.remove('d-none');
  lastReport = res;
  renderManpower(res);
  renderMeals(res);
  renderLodging(res);
}
function renderManpower(res) {
  const chkGender = document.getElementById('chkGender').checked;
  const chkRole = document.getElementById('chkRole').checked;
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th><th>總人數</th>';
  if (chkGender) html += '<th>男</th><th>女</th>';
  if (chkRole) html += '<th>幹部</th><th>一般義工</th>';
  res.dayLabels.forEach(l => {
    if (chkGender) html += `<th>${l} 男</th><th>${l} 女</th>`;
    html += `<th>${l} 合計</th>`;
  });
  html += '</tr></thead><tbody>';
  const rowCells = (s, isTotal) => {
    let c = '';
    if (isTotal) c += `<td colspan="2">${isTotal}</td>`;
    else c += `<td>${s._g}</td><td>${s.name}</td>`;
    c += `<td>${s.headcount.total}</td>`;
    if (chkGender) c += `<td>${s.headcount.male}</td><td>${s.headcount.female}</td>`;
    if (chkRole) c += `<td>${s.headcount.cadre}</td><td>${s.headcount.volunteer}</td>`;
    s.manpowerByDay.forEach(d => {
      if (chkGender) c += `<td>${d.male}</td><td>${d.female}</td>`;
      c += `<td>${d.total}</td>`;
    });
    return c;
  };
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      s._g = g.name;
      html += `<tr>${rowCells(s, false)}</tr>`;
    });
    g._g = g.name;
    // group subtotal uses g aggregate
    html += `<tr class="table-secondary">${rowCells({name:'小計', headcount: g.headcount, manpowerByDay: g.manpowerByDay}, '小計')}</tr>`;
  });
  html += `<tr class="table-dark">${rowCells({name:'總計', headcount: res.total.headcount, manpowerByDay: res.total.manpowerByDay}, '總計')}</tr>`;
  html += '</tbody></table>';
  document.getElementById('manpowerTable').innerHTML = html;
}
function renderMeals(res) {
  const chkGender = document.getElementById('chkGender').checked;
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th>';
  res.dayLabels.forEach(l => {
    if (chkGender) html += `<th>${l} 早男</th><th>${l} 早女</th>`;
    html += `<th>${l} 早計</th>`;
    if (chkGender) html += `<th>${l} 午男</th><th>${l} 午女</th>`;
    html += `<th>${l} 午計</th>`;
    if (chkGender) html += `<th>${l} 晚男</th><th>${l} 晚女</th>`;
    html += `<th>${l} 晚計</th>`;
  });
  html += '</tr></thead><tbody>';
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      html += `<tr><td>${g.name}</td><td>${s.name}</td>`;
      s.mealsByDay.forEach(d => {
        if (chkGender) html += `<td>${d.breakfast.male}</td><td>${d.breakfast.female}</td>`;
        html += `<td>${d.breakfast.total}</td>`;
        if (chkGender) html += `<td>${d.lunch.male}</td><td>${d.lunch.female}</td>`;
        html += `<td>${d.lunch.total}</td>`;
        if (chkGender) html += `<td>${d.dinner.male}</td><td>${d.dinner.female}</td>`;
        html += `<td>${d.dinner.total}</td>`;
      });
      html += '</tr>';
    });
  });
  html += '</tbody></table>';
  document.getElementById('mealsTable').innerHTML = html;
}
function renderLodging(res) {
  const chkGender = document.getElementById('chkGender').checked;
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th>';
  res.dayLabels.forEach(l => {
    if (chkGender) html += `<th>${l} 男</th><th>${l} 女</th>`;
    html += `<th>${l} 合計</th>`;
  });
  if (chkGender) html += '<th>最大床位(男)</th><th>最大床位(女)</th>';
  html += '<th>最大床位(合計)</th></tr></thead><tbody>';
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      html += `<tr><td>${g.name}</td><td>${s.name}</td>`;
      s.lodgingByDay.forEach(d => {
        if (chkGender) html += `<td>${d.male}</td><td>${d.female}</td>`;
        html += `<td>${d.total}</td>`;
      });
      if (chkGender) html += `<td>${s.maxBed.male}</td><td>${s.maxBed.female}</td>`;
      html += `<td>${s.maxBed.total}</td></tr>`;
    });
  });
  html += `<tr class="table-dark"><td colspan="2">總計</td>`;
  res.total.lodgingByDay.forEach(d => {
    if (chkGender) html += `<td>${d.male}</td><td>${d.female}</td>`;
    html += `<td>${d.total}</td>`;
  });
  if (chkGender) html += `<td>${res.total.maxBed.male}</td><td>${res.total.maxBed.female}</td>`;
  html += `<td>${res.total.maxBed.total}</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('lodgingTable').innerHTML = html;
}
document.addEventListener('DOMContentLoaded', init);