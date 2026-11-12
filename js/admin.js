let adminPassword = '';
let activities = [];
let availableFields = [];
let availableHeaders = [];
let adminPublicToken = '';
let loginRole = 'admin';
let currentUnit = null;
let units = [];

function api(action, params = {}) {
  // 大型資料（如活動設定）改用 POST，避免 GET URL 長度限制
  if (params.data) {
    const body = new URLSearchParams();
    body.set('action', action);
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') body.set(k, v); });
    return fetch(CONFIG.GAS_URL, { method: 'POST', body }).then(r => r.json());
  }
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  return fetch(url).then(r => r.json());
}
function authParams() {
  if (loginRole === 'unit' && currentUnit) return { unit: currentUnit.id, unitPwd: adminPassword };
  return { pwd: adminPassword };
}
function extractSheetId(url) {
  const m = (url || '').match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
function showError(el, msg) { if (typeof el === 'string') el = document.getElementById(el); el.textContent = msg; el.className = 'text-danger small'; }
function showOk(el, msg) { if (typeof el === 'string') el = document.getElementById(el); el.textContent = msg; el.className = 'text-success small'; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLogin').onclick = handleLogin;
  document.getElementById('adminPwd').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
  document.getElementById('loginRole').addEventListener('change', e => {
    const isUnit = e.target.value === 'unit';
    document.getElementById('loginUnitWrap').classList.toggle('d-none', !isUnit);
  });
  loadPublicUnits();

  // 單位管理
  document.getElementById('btnAddUnit').onclick = () => {
    document.getElementById('unitForm').classList.remove('d-none');
    document.getElementById('unitName').value = '';
    document.getElementById('unitPwd').value = '';
    document.getElementById('unitHint').textContent = '';
  };
  document.getElementById('btnCancelUnit').onclick = () => document.getElementById('unitForm').classList.add('d-none');
  document.getElementById('btnCreateUnit').onclick = handleCreateUnit;

  document.getElementById('btnAddActivity').onclick = () => openModal();
  document.getElementById('btnCloseModal').onclick = () => document.getElementById('activityModal').close();
  document.getElementById('btnTestConnection').onclick = handleTestConnection;
  document.getElementById('btnSaveActivity').onclick = handleSaveActivity;
  document.getElementById('btnAutoDetect').onclick = autoDetectDays;

  // 統計報表（後台）
  const reportLoadBtn = document.getElementById('reportLoadBtn');
  if (reportLoadBtn) reportLoadBtn.onclick = loadAdminReport;
  document.querySelectorAll('#reportTabs .nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reportTabs .nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (window._lastAdminReport) renderAdminReport(window._lastAdminReport);
    });
  });
  const chkRole = document.getElementById('reportChkRole');
  const chkGender = document.getElementById('reportChkGender');
  const rerender = () => { if (window._lastAdminReport) renderAdminReport(window._lastAdminReport); };
  if (chkRole) chkRole.addEventListener('change', rerender);
  if (chkGender) chkGender.addEventListener('change', rerender);
  ['reportChkRowSub', 'reportChkColSub'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', rerender);
  });
});

let adminReportTab = 'manpower';
async function loadAdminReport() {
  const actId = document.getElementById('reportActivitySelect')?.value;
  if (!actId) { alert('請選擇活動'); return; }
  const token = loginRole === 'unit' ? (currentUnit?.token || '') : adminPublicToken;
  const res = await api('getReport', { act: actId, token, ...authParams() });
  if (!res.ok) { alert(res.error || '載入報表失敗'); return; }
  window._lastAdminReport = res;
  renderAdminReport(res);
}
function renderAdminReport(res) {
  const opt = {
    gender: document.getElementById('reportChkGender').checked,
    role: document.getElementById('reportChkRole').checked,
    rowSub: document.getElementById('reportChkRowSub').checked,
    colSub: document.getElementById('reportChkColSub').checked
  };
  const tab = document.querySelector('#reportTabs .nav-link.active')?.dataset.tab || 'manpower';
  const meta = res.dayMeta || (res.dayLabels || []).map(l => ({ label: l, attendance: true, breakfast: true, lunch: true, dinner: true, lodging: true }));
  let html = '';
  if (tab === 'manpower') html = buildManpowerTable(res, meta, opt);
  else if (tab === 'meals') html = buildMealsTable(res, meta, opt);
  else html = buildLodgingTable(res, meta, opt);
  document.getElementById('reportContainer').innerHTML = html;
}

// 日期欄表頭：日期一行、項目一行，節省欄寬
function dayHead(label, sub) {
  return '<span class="d-block">' + (label || '') + '</span>' + (sub ? '<span class="d-block text-muted small">' + sub + '</span>' : '');
}

// headers: [{label, day}] day=true 代表可加總的每日欄（列小計只加這些）
function buildReportTable(headers, rows, totals, opt) {
  const dayIdx = [];
  headers.forEach((h, i) => { if (h.day) dayIdx.push(i); });
  let html = '<div class="table-responsive"><table class="table table-bordered table-sm report-table"><thead><tr>';
  headers.forEach(h => { html += '<th>' + h.label + '</th>'; });
  if (opt.rowSub) html += '<th class="sub-col">小計</th>';
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    r.cells.forEach((c, i) => {
      const cls = [];
      if (i === 0) cls.push('text-start');
      if (i === 1) cls.push('text-start');
      if (headers[i] && headers[i].day) cls.push('text-end');
      html += '<td class="' + cls.join(' ') + '">' + (c === undefined || c === null ? '' : c) + '</td>';
    });
    if (opt.rowSub) {
      const sum = dayIdx.reduce((a, i) => a + (Number(r.cells[i]) || 0), 0);
      html += '<td class="sub-col fw-semibold text-end">' + sum + '</td>';
    }
    html += '</tr>';
  });
  if (opt.colSub) {
    html += '<tr class="table-dark fw-semibold">';
    html += '<td colspan="2">總計</td>';
    for (let i = 2; i < headers.length; i++) {
      html += '<td class="' + (headers[i].day ? 'text-end' : '') + '">' + (totals[i] === undefined ? '' : totals[i]) + '</td>';
    }
    if (opt.rowSub) {
      const sum = dayIdx.filter(i => i >= 2).reduce((a, i) => a + (Number(totals[i]) || 0), 0);
      html += '<td class="text-end">' + sum + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function buildManpowerTable(res, meta, opt) {
  const headers = [{ label: '大組' }, { label: '小組' }, { label: '總人數' }];
  if (opt.gender) { headers.push({ label: '男' }, { label: '女' }); }
  if (opt.role) { headers.push({ label: '幹部' }, { label: '一般義工' }); }
  meta.forEach(m => {
    if (!m.attendance) return;
    if (opt.gender) { headers.push({ label: dayHead(m.label, '男') }, { label: dayHead(m.label, '女') }); }
    headers.push({ label: dayHead(m.label, '合計'), day: true });
  });

  const rows = [];
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      const cells = [g.name, s.name, s.headcount.total];
      if (opt.gender) cells.push(s.headcount.male, s.headcount.female);
      if (opt.role) cells.push(s.headcount.cadre, s.headcount.volunteer);
      s.manpowerByDay.forEach((d, i) => {
        if (!meta[i] || !meta[i].attendance) return;
        if (opt.gender) cells.push(d.male, d.female);
        cells.push(d.total);
      });
      rows.push({ cells });
    });
  });

  const totals = ['總計', '', res.total.headcount.total];
  if (opt.gender) totals.push(res.total.headcount.male, res.total.headcount.female);
  if (opt.role) totals.push(res.total.headcount.cadre, res.total.headcount.volunteer);
  res.total.manpowerByDay.forEach((d, i) => {
    if (!meta[i] || !meta[i].attendance) return;
    if (opt.gender) totals.push(d.male, d.female);
    totals.push(d.total);
  });
  return buildReportTable(headers, rows, totals, opt);
}

function buildMealsTable(res, meta, opt) {
  const meals = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];
  const headers = [{ label: '大組' }, { label: '小組' }];
  meta.forEach(m => {
    meals.forEach(([key, name]) => {
      if (!m[key]) return;
      if (opt.gender) {
        headers.push({ label: dayHead(m.label, name + '男') });
        headers.push({ label: dayHead(m.label, name + '女') });
      }
      headers.push({ label: dayHead(m.label, name + '計'), day: true });
    });
  });

  const rows = [];
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      const cells = [g.name, s.name];
      s.mealsByDay.forEach((d, i) => {
        const m = meta[i] || {};
        meals.forEach(([key]) => {
          if (!m[key]) return;
          if (opt.gender) cells.push(d[key].male, d[key].female);
          cells.push(d[key].total);
        });
      });
      rows.push({ cells });
    });
  });

  const totals = ['總計', ''];
  res.total.mealsByDay.forEach((d, i) => {
    const m = meta[i] || {};
    meals.forEach(([key]) => {
      if (!m[key]) return;
      if (opt.gender) totals.push(d[key].male, d[key].female);
      totals.push(d[key].total);
    });
  });
  return buildReportTable(headers, rows, totals, opt);
}

function buildLodgingTable(res, meta, opt) {
  const headers = [{ label: '大組' }, { label: '小組' }];
  meta.forEach(m => {
    if (!m.lodging) return;
    if (opt.gender) { headers.push({ label: dayHead(m.label, '男') }, { label: dayHead(m.label, '女') }); }
    headers.push({ label: dayHead(m.label, '合計'), day: true });
  });
  if (opt.gender) {
    headers.push({ label: '最大床位<br><span class="text-muted small">男</span>' });
    headers.push({ label: '最大床位<br><span class="text-muted small">女</span>' });
  }
  headers.push({ label: '最大床位<br><span class="text-muted small">合計</span>' });

  const rows = [];
  res.groups.forEach(g => {
    g.subgroups.forEach(s => {
      const cells = [g.name, s.name];
      s.lodgingByDay.forEach((d, i) => {
        if (!meta[i] || !meta[i].lodging) return;
        if (opt.gender) cells.push(d.male, d.female);
        cells.push(d.total);
      });
      if (opt.gender) cells.push(s.maxBed.male, s.maxBed.female);
      cells.push(s.maxBed.total);
      rows.push({ cells });
    });
  });

  const totals = ['總計', ''];
  res.total.lodgingByDay.forEach((d, i) => {
    if (!meta[i] || !meta[i].lodging) return;
    if (opt.gender) totals.push(d.male, d.female);
    totals.push(d.total);
  });
  if (opt.gender) totals.push(res.total.maxBed.male, res.total.maxBed.female);
  totals.push(res.total.maxBed.total);
  return buildReportTable(headers, rows, totals, opt);
}

async function handleLogin() {
  const role = document.getElementById('loginRole').value;
  const pwd = document.getElementById('adminPwd').value.trim();
  if (!pwd) { showError('loginHint', '請輸入密碼'); return; }
  if (role === 'unit') {
    const unitId = document.getElementById('loginUnit').value;
    if (!unitId) { showError('loginHint', '請選擇單位'); return; }
    const res = await api('unit_login', { unit: unitId, pwd });
    if (!res.ok) { showError('loginHint', res.error || '登入失敗'); return; }
    loginRole = 'unit';
    currentUnit = res.unit;
  } else {
    const res = await api('admin_login', { pwd });
    if (!res.ok) { showError('loginHint', res.error || '密碼錯誤'); return; }
    loginRole = 'admin';
    currentUnit = null;
  }
  adminPassword = pwd;
  showOk('loginHint', '登入成功');
  document.getElementById('loginSection').classList.add('d-none');
  document.getElementById('adminPanel').classList.remove('d-none');
  document.getElementById('unitCard').classList.toggle('d-none', loginRole !== 'admin');
  document.getElementById('actUnitWrap').classList.toggle('d-none', loginRole !== 'admin');
  await loadActivities();
}

async function loadPublicUnits() {
  const res = await api('listUnitsPublic');
  const sel = document.getElementById('loginUnit');
  if (!sel) return;
  const list = (res && res.ok) ? res.units : [];
  sel.innerHTML = list.length
    ? list.map(u => `<option value="${u.id}">${u.name}</option>`).join('')
    : '<option value="">（尚無單位）</option>';
}

async function loadActivities() {
  const res = await api('getConfig', authParams());
  if (!res.ok) { alert(res.error); return; }
  activities = res.config?.activities || [];
  adminPublicToken = res.config?.publicToken || '';
  units = res.config?.units || [];
  renderActivityList();
  renderUnits();
  const rsel = document.getElementById('reportActivitySelect');
  if (rsel) rsel.innerHTML = activities.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const asel = document.getElementById('actUnit');
  if (asel) {
    asel.innerHTML = '<option value="">（不分單位）</option>' +
      units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  }
}

function renderUnits() {
  const box = document.getElementById('unitList');
  if (!box) return;
  if (loginRole !== 'admin') { box.innerHTML = ''; return; }
  if (!units.length) { box.innerHTML = '<p class="text-muted small mb-0">尚無單位。單位用於隔離不同分會／教室的活動與名單。</p>'; return; }
  const base = location.href.replace(/admin\.html.*/, 'index.html');
  box.innerHTML = '<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-0"><thead><tr>' +
    '<th>單位名稱</th><th>單位 ID</th><th>unitToken</th><th>活動數</th><th style="width:260px;">操作</th>' +
    '</tr></thead><tbody>' +
    units.map(u => {
      const link = `${base}?unit=${encodeURIComponent(u.id)}&unitToken=${encodeURIComponent(u.token || '')}`;
      return `<tr>
        <td><strong>${u.name}</strong></td>
        <td><code class="user-select-all small">${u.id}</code></td>
        <td><code class="user-select-all small">${u.token || ''}</code></td>
        <td>${u.activityCount || 0}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="copyUnitLink('${u.id}')">複製查詢網址</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="changeUnitPassword('${u.id}')">改密碼</button>
          <button class="btn btn-sm btn-outline-danger" onclick="removeUnit('${u.id}')">刪除</button>
        </td>
      </tr>`;
    }).join('') + '</tbody></table></div>';
}

function copyUnitLink(unitId) {
  const u = units.find(x => x.id === unitId);
  if (!u) return;
  const base = location.href.replace(/admin\.html.*/, 'index.html');
  const link = `${base}?unit=${encodeURIComponent(u.id)}&unitToken=${encodeURIComponent(u.token || '')}`;
  navigator.clipboard?.writeText(link);
  alert('已複製查詢網址：\n' + link);
}

async function handleCreateUnit() {
  const name = document.getElementById('unitName').value.trim();
  const unitAdminPwd = document.getElementById('unitPwd').value.trim();
  if (!name) { showError('unitHint', '請輸入單位名稱'); return; }
  if (unitAdminPwd.length < 6) { showError('unitHint', '單位管理密碼至少 6 碼'); return; }
  const res = await api('createUnit', { pwd: adminPassword, name, unitAdminPwd });
  if (!res.ok) { showError('unitHint', res.error || '建立失敗'); return; }
  document.getElementById('unitForm').classList.add('d-none');
  await loadActivities();
  await loadPublicUnits();
}

async function changeUnitPassword(unitId) {
  const newPwd = prompt('請輸入新的單位管理密碼（至少 6 碼）');
  if (!newPwd) return;
  const res = await api('setUnitPassword', { pwd: adminPassword, id: unitId, newPwd });
  if (!res.ok) { alert(res.error || '設定失敗'); return; }
  alert('密碼已更新');
}

async function removeUnit(unitId) {
  if (!confirm('確定刪除這個單位？（單位內有活動時不可刪除）')) return;
  const res = await api('deleteUnit', { pwd: adminPassword, id: unitId });
  if (!res.ok) { alert(res.error || '刪除失敗'); return; }
  await loadActivities();
  await loadPublicUnits();
}

function renderActivityList() {
  const ul = document.getElementById('activityList');
  if (!activities.length) { ul.innerHTML = '<li class="list-group-item text-muted">尚無活動</li>'; return; }
  ul.innerHTML = activities.map(a => {
    const u = a.unit ? units.find(x => x.id === a.unit) : null;
    const badge = u ? `<span class="badge bg-info text-dark ms-2">${u.name}</span>` : '';
    return `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <strong>${a.name}</strong>${badge}
        <div class="small text-muted">ID: <code class="user-select-all">${a.id}</code></div>
        <div class="small text-muted">大組欄位: ${a.groupField || '-'} / 小組: ${a.subgroupField || '-'} / 日期數: ${(a.dayMappings||[]).length}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary" onclick="viewActivity('${a.id}')">檢視</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="openModal('${a.id}')">編輯</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteActivity('${a.id}')">刪除</button>
      </div>
    </li>`;
  }).join('');
}

function viewActivity(id) {
  const base = location.href.replace(/admin\.html.*/, 'index.html');
  const act = activities.find(a => a.id === id);
  let url = base + '?act=' + encodeURIComponent(id);
  const unitId = act && act.unit ? act.unit : (loginRole === 'unit' && currentUnit ? currentUnit.id : '');
  if (unitId) {
    const u = units.find(x => x.id === unitId) || (currentUnit && currentUnit.id === unitId ? currentUnit : null);
    if (u) url += '&unit=' + encodeURIComponent(u.id) + '&unitToken=' + encodeURIComponent(u.token || '');
  }
  window.open(url, '_blank');
}

async function deleteActivity(id) {
  if (!confirm('確定刪除？')) return;
  const res = await api('deleteActivity', { ...authParams(), id });
  if (!res.ok) { alert(res.error); return; }
  await loadActivities();
}

function openModal(actId = null) {
  document.getElementById('editActivityId').value = actId || '';
  document.getElementById('modalTitle').textContent = actId ? '編輯活動' : '新增活動';
  // reset
  document.getElementById('actName').value = '';
  document.getElementById('actSheetUrl').value = '';
  document.getElementById('actSheetName').value = '';
  document.getElementById('actAccessKey').value = '';
  document.getElementById('actUnit').value = '';
  document.getElementById('dayMappingsJson').value = '';
  document.getElementById('connectionHint').textContent = '';
  document.getElementById('fieldMapping').classList.add('d-none');
  availableFields = [];
  if (actId) {
    const act = activities.find(a => a.id === actId);
    if (act) {
      document.getElementById('actName').value = act.name || '';
      document.getElementById('actSheetUrl').value = act.sheetUrl || '';
      document.getElementById('actSheetName').value = act.sheetName || '';
      document.getElementById('actAccessKey').value = act.accessKey || '';
      document.getElementById('actUnit').value = act.unit || '';
      document.getElementById('dayMappingsJson').value = JSON.stringify(act.dayMappings || [], null, 2);
      // test connection silent
      handleTestConnection(true).then(() => {
        // set dropdowns
        setDropdown('mapGroup', act.groupField);
        setDropdown('mapSubgroup', act.subgroupField);
        setDropdown('mapRole', act.roleField);
        setDropdown('mapGender', act.genderField);

        setDropdown('mapName', act.nameField);
        setDropdown('mapPhone', act.phoneField);
        // display fields
        renderDisplayFields(act.displayFields || []);
      });
    }
  }
  document.getElementById('activityModal').showModal();
}

function setDropdown(id, val) {
  const sel = document.getElementById(id);
  if (val) sel.value = val;
}

async function handleTestConnection(silent = false) {
  const url = document.getElementById('actSheetUrl').value.trim();
  if (!url) { if (!silent) showError('connectionHint','請先輸入試算表網址'); return; }
  const sheetName = document.getElementById('actSheetName').value.trim();
  const res = await api('testConnection', { url, sheetName: sheetName || undefined, ...authParams() });
  if (!res.ok) { if (!silent) showError('connectionHint', res.error); return; }
  availableFields = res.fields || [];
  availableHeaders = res.fields || [];
  showOk('connectionHint', `連線成功！取得 ${availableFields.length} 個欄位`);
  document.getElementById('fieldMapping').classList.remove('d-none');
  // populate dropdowns
  const opts = '<option value="">（請選擇）</option>' + availableFields.map(f => `<option value="${f}">${f}</option>`).join('');
  ['mapGroup','mapSubgroup','mapRole','mapGender','mapName','mapPhone'].forEach(id => {
    document.getElementById(id).innerHTML = opts;
  });
  renderDisplayFields([]);
  return res;
}

function renderDisplayFields(selected) {
  const box = document.getElementById('displayFieldsBox');
  const selSet = new Set(selected);
  box.innerHTML = availableFields.map(f => `
    <label class="d-block"><input type="checkbox" value="${f}" ${selSet.has(f) ? 'checked' : ''}> ${f}</label>
  `).join('');
}

function autoDetectDays() {
  const headers = availableFields.length ? availableFields : [];
  if (!headers.length) { alert('請先測試連線'); return; }
  // detect date tokens
  const dateRegex = /(\d{1,2}[\/\-]\d{1,2})/;
  const groups = {};
  headers.forEach(h => {
    const m = h.match(dateRegex);
    const key = m ? m[1] : null;
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });
  const days = Object.keys(groups).map(date => {
    const hs = groups[date];
    // 從最後欄位往前看，優先取公式拆解後的 1/0 欄位
    const find = (kw) => hs.slice().reverse().find(h => h.includes(kw)) || '';
    return {
      label: date,
      attendanceField: find('進駐') || find('正行') || find('出席') || '',
      breakfastField: find('早餐') || '',
      lunchField: find('午餐') || '',
      dinnerField: find('晚餐') || '',
      lodgingField: find('住宿') || ''
    };
  });
  // sort by date
  days.sort((a,b) => a.label.localeCompare(b.label));
  document.getElementById('dayMappingsJson').value = JSON.stringify(days, null, 2);
}

async function handleSaveActivity() {
  const name = document.getElementById('actName').value.trim();
  const sheetUrl = document.getElementById('actSheetUrl').value.trim();
  const sheetName = document.getElementById('actSheetName').value.trim();
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) { alert('無法解析試算表 ID，請確認網址格式'); return; }
  const groupField = document.getElementById('mapGroup').value;
  const subgroupField = document.getElementById('mapSubgroup').value;
  const roleField = document.getElementById('mapRole').value;
  const genderField = document.getElementById('mapGender').value;
  const birthYearField = '';
  const nameField = document.getElementById('mapName').value;
  const phoneField = document.getElementById('mapPhone').value;
  const accessKey = document.getElementById('actAccessKey').value.trim();
  let dayMappings = [];
  try { dayMappings = JSON.parse(document.getElementById('dayMappingsJson').value || '[]'); } catch(e) { alert('日期 JSON 格式錯誤'); return; }
  const displayFields = [...document.querySelectorAll('#displayFieldsBox input:checked')].map(c => c.value);
  if (!name || !sheetUrl) { alert('請填寫名稱與試算表網址'); return; }
  const data = {
    id: document.getElementById('editActivityId').value || undefined,
    name, sheetId, sheetUrl, sheetName: sheetName || undefined, groupField, subgroupField, roleField, genderField,
    birthYearField, nameField, phoneField, dayMappings, displayFields, accessKey,
    unit: document.getElementById('actUnit').value || undefined
  };
  const res = await api('saveActivity', { ...authParams(), data: JSON.stringify(data) });
  if (!res.ok) { alert('儲存失敗：' + res.error); return; }
  alert('儲存成功');
  document.getElementById('activityModal').close();
  await loadActivities();
}