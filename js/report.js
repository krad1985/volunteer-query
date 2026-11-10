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
}
async function loadReport() {
  const actId = document.getElementById('activitySelect').value;
  const res = await api('getReport', { act: actId });
  if (!res.ok) { showError(res.error); return; }
  document.getElementById('error').classList.add('d-none');
  document.getElementById('reportArea').classList.remove('d-none');
  renderManpower(res);
  renderMeals(res);
  renderLodging(res);
}
function renderManpower(res) {
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th><th>總人數</th><th>男</th><th>女</th><th>幹部</th><th>一般義工</th>';
  res.dayLabels.forEach(l => { html += `<th>${l} 男</th><th>${l} 女</th><th>${l} 合計</th>`; });
  html += '</tr></thead><tbody>';
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      html += `<tr><td>${g.name}</td><td>${s.name}</td><td>${s.headcount.total}</td><td>${s.headcount.male}</td><td>${s.headcount.female}</td><td>${s.headcount.cadre}</td><td>${s.headcount.volunteer}</td>`;
      s.manpowerByDay.forEach(d => { html += `<td>${d.male}</td><td>${d.female}</td><td>${d.total}</td>`; });
      html += '</tr>';
    });
    // group subtotal
    html += `<tr class="table-secondary"><td>${g.name}</td><td>小計</td><td>${g.headcount.total}</td><td>${g.headcount.male}</td><td>${g.headcount.female}</td><td>${g.headcount.cadre}</td><td>${g.headcount.volunteer}</td>`;
    g.manpowerByDay.forEach(d => { html += `<td>${d.male}</td><td>${d.female}</td><td>${d.total}</td>`; });
    html += '</tr>';
  });
  // grand total
  html += `<tr class="table-dark"><td colspan="2">總計</td><td>${res.total.headcount.total}</td><td>${res.total.headcount.male}</td><td>${res.total.headcount.female}</td><td>${res.total.headcount.cadre}</td><td>${res.total.headcount.volunteer}</td>`;
  res.total.manpowerByDay.forEach(d => { html += `<td>${d.male}</td><td>${d.female}</td><td>${d.total}</td>`; });
  html += '</tr></tbody></table>';
  document.getElementById('manpowerTable').innerHTML = html;
}
function renderMeals(res) {
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th>';
  res.dayLabels.forEach(l => { html += `<th>${l} 早男</th><th>${l} 早女</th><th>${l} 早計</th><th>${l} 午男</th><th>${l} 午女</th><th>${l} 午計</th><th>${l} 晚男</th><th>${l} 晚女</th><th>${l} 晚計</th>`; });
  html += '</tr></thead><tbody>';
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      html += `<tr><td>${g.name}</td><td>${s.name}</td>`;
      s.mealsByDay.forEach(d => {
        html += `<td>${d.breakfast.male}</td><td>${d.breakfast.female}</td><td>${d.breakfast.total}</td>`;
        html += `<td>${d.lunch.male}</td><td>${d.lunch.female}</td><td>${d.lunch.total}</td>`;
        html += `<td>${d.dinner.male}</td><td>${d.dinner.female}</td><td>${d.dinner.total}</td>`;
      });
      html += '</tr>';
    });
  });
  html += '</tbody></table>';
  document.getElementById('mealsTable').innerHTML = html;
}
function renderLodging(res) {
  let html = '<table class="table table-bordered table-sm"><thead><tr><th>大組</th><th>小組</th>';
  res.dayLabels.forEach(l => { html += `<th>${l} 男</th><th>${l} 女</th><th>${l} 合計</th>`; });
  html += '<th>最大床位(男)</th><th>最大床位(女)</th><th>最大床位(合計)</th></tr></thead><tbody>';
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      html += `<tr><td>${g.name}</td><td>${s.name}</td>`;
      s.lodgingByDay.forEach(d => { html += `<td>${d.male}</td><td>${d.female}</td><td>${d.total}</td>`; });
      html += `<td>${s.maxBed.male}</td><td>${s.maxBed.female}</td><td>${s.maxBed.total}</td></tr>`;
    });
  });
  // grand
  html += `<tr class="table-dark"><td colspan="2">總計</td>`;
  res.total.lodgingByDay.forEach(d => { html += `<td>${d.male}</td><td>${d.female}</td><td>${d.total}</td>`; });
  html += `<td>${res.total.maxBed.male}</td><td>${res.total.maxBed.female}</td><td>${res.total.maxBed.total}</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('lodgingTable').innerHTML = html;
}
document.addEventListener('DOMContentLoaded', init);