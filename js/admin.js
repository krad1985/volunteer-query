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
  ['reportChkRowSub'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', rerender);
  });
  const imgBtn = document.getElementById('reportImgBtn');
  if (imgBtn) imgBtn.onclick = downloadReportImage;

  // 組別密碼
  document.getElementById('btnLoadGroups').onclick = loadGroupPasswords;

  // 通知單
  document.getElementById('btnLoadNoticeCfg').onclick = loadNoticeConfig;
  document.getElementById('btnNoticeSaveCfg').onclick = saveNoticeConfig;
  document.getElementById('btnPickAll').onclick = () => setNoticePick(true);
  document.getElementById('btnPickNone').onclick = () => setNoticePick(false);
  document.getElementById('noticeGroupFilter').addEventListener('change', renderNoticePick);
  document.getElementById('noticeCodeType').addEventListener('change', renderNoticePreview);
  ['noticeRegion', 'noticeClassPrefix', 'noticeSerialPrefix', 'noticeReportInfo', 'noticeContactName', 'noticeContactPhone', 'noticeNotices']
    .forEach(id => document.getElementById(id).addEventListener('input', renderNoticePreview));
  document.getElementById('btnNoticePrint').onclick = printNoticeSheets;
  document.getElementById('btnReportCollapse').onclick = toggleReportCollapse;
});

async function downloadReportImage() {
  const el = document.getElementById('reportContainer');
  const table = el && el.querySelector('table');
  if (!table) { alert('請先載入報表'); return; }
  if (typeof html2canvas === 'undefined') { alert('圖片元件尚未載入，請稍後再試'); return; }
  const wrap = table.closest('.report-wrap');
  const prev = wrap ? wrap.style.cssText : '';
  if (wrap) wrap.style.cssText = 'overflow: visible;';
  try {
    const canvas = await html2canvas(table, { backgroundColor: '#ffffff', scale: 2 });
    const a = document.createElement('a');
    a.download = '統計報表.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  } finally {
    if (wrap) wrap.style.cssText = prev;
  }
}

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
    groupSub: document.getElementById('reportChkRowSub').checked,
    collapsed: !!window._reportCollapsed
  };
  const tab = document.querySelector('#reportTabs .nav-link.active')?.dataset.tab || 'manpower';
  const meta = res.dayMeta || (res.dayLabels || []).map(l => ({ label: l, attendance: true, breakfast: true, lunch: true, dinner: true, lodging: true }));
  let html = '';
  if (tab === 'manpower') html = buildManpowerTable(res, meta, opt);
  else if (tab === 'meals') html = buildMealsTable(res, meta, opt);
  else if (tab === 'lodging') html = buildLodgingTable(res, meta, opt);
  else html = buildOverviewTable(res, opt);
  document.getElementById('reportContainer').innerHTML = html;
  const accent = res.themeColor || '#3b5b8c';
  document.querySelectorAll('#reportContainer table.report-table').forEach(t => {
    t.style.setProperty('--ov-accent', accent);
  });
  const picker = document.getElementById('reportThemeColor');
  if (picker && res.themeColor) picker.value = res.themeColor;
}

// 日期欄表頭：日期一行、項目一行，節省欄寬
function dayHead(label, sub) {
  return '<span class="d-block">' + (label || '') + '</span>' + (sub ? '<span class="d-block text-muted small">' + sub + '</span>' : '');
}

// 小組留空的資料不顯示「（未分小組）」字樣，保持空白
function subLabel(name) {
  return name === '（未分小組）' ? '' : name;
}

function cellHtml(col, value) {
  const cls = col.day ? 'text-end' : '';
  return '<td class="' + cls + '">' + (value === undefined || value === null ? '' : value) + '</td>';
}

// columns: [{label, day, get(obj)}]；obj 需具備 headcount / manpowerByDay / mealsByDay / lodgingByDay / maxBed
function buildReportTable(groups, columns, total, opt) {
  const collapsed = !!opt.collapsed;
  let html = '<div class="report-wrap"><table class="table table-bordered table-sm report-table"><thead><tr><th>大組</th><th>小組</th>';
  columns.forEach(c => { html += '<th>' + c.label + '</th>'; });
  html += '</tr></thead><tbody>';
  groups.forEach((g, gi) => {
    const alt = gi % 2 === 1 ? ' ov-alt' : '';
    if (!collapsed) {
      g.subgroups.forEach((sg, si) => {
        html += '<tr class="ov-row' + alt + '">';
        if (si === 0) html += '<td class="ov-group text-start" rowspan="' + g.subgroups.length + '">' + g.name + '</td>';
        html += '<td class="text-start">' + subLabel(sg.name) + '</td>';
        columns.forEach(c => { html += cellHtml(c, c.get(sg)); });
        html += '</tr>';
      });
    }
    if (opt.groupSub || collapsed) {
      html += '<tr class="ov-sub"><td class="ov-group text-start fw-semibold">' + g.name + '</td><td class="text-start fw-semibold">小計</td>';
      columns.forEach(c => { html += cellHtml(c, c.get(g)); });
      html += '</tr>';
    }
  });
  html += '<tr class="ov-total"><td colspan="2">總計</td>';
  columns.forEach(c => { html += cellHtml(c, c.get(total)); });
  html += '</tr></tbody></table></div>';
  return html;
}

function toggleReportCollapse() {
  window._reportCollapsed = !window._reportCollapsed;
  const btn = document.getElementById('btnReportCollapse');
  if (btn) btn.textContent = window._reportCollapsed ? '展開（含小組明細）' : '收合（只顯示大組）';
  if (window._lastAdminReport) renderAdminReport(window._lastAdminReport);
}

function buildManpowerTable(res, meta, opt) {
  const cols = [{ label: '總人數', get: o => o.headcount.total }];
  if (opt.gender) cols.push({ label: '男', get: o => o.headcount.male }, { label: '女', get: o => o.headcount.female });
  if (opt.role) cols.push({ label: '幹部', get: o => o.headcount.cadre }, { label: '一般義工', get: o => o.headcount.volunteer });
  meta.forEach((m, i) => {
    if (!m.attendance) return;
    if (opt.gender) {
      cols.push({ label: dayHead(m.label, '男'), get: o => o.manpowerByDay[i].male });
      cols.push({ label: dayHead(m.label, '女'), get: o => o.manpowerByDay[i].female });
    }
    cols.push({ label: dayHead(m.label, '合計'), day: true, get: o => o.manpowerByDay[i].total });
  });
  return buildReportTable(res.groups, cols, res.total, opt);
}

function buildMealsTable(res, meta, opt) {
  const meals = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];
  const cols = [];
  meta.forEach((m, i) => {
    meals.forEach(([key, name]) => {
      if (!m[key]) return;
      if (opt.gender) {
        cols.push({ label: dayHead(m.label, name + '男'), get: o => o.mealsByDay[i][key].male });
        cols.push({ label: dayHead(m.label, name + '女'), get: o => o.mealsByDay[i][key].female });
      }
      cols.push({ label: dayHead(m.label, name + '計'), day: true, get: o => o.mealsByDay[i][key].total });
    });
  });
  return buildReportTable(res.groups, cols, res.total, opt);
}

function buildLodgingTable(res, meta, opt) {
  const cols = [];
  meta.forEach((m, i) => {
    if (!m.lodging) return;
    if (opt.gender) {
      cols.push({ label: dayHead(m.label, '男'), get: o => o.lodgingByDay[i].male });
      cols.push({ label: dayHead(m.label, '女'), get: o => o.lodgingByDay[i].female });
    }
    cols.push({ label: dayHead(m.label, '合計'), day: true, get: o => o.lodgingByDay[i].total });
  });
  if (opt.gender) {
    cols.push({ label: '最大床位<br><span class="text-muted small">男</span>', get: o => o.maxBed.male });
    cols.push({ label: '最大床位<br><span class="text-muted small">女</span>', get: o => o.maxBed.female });
  }
  cols.push({ label: '最大床位<br><span class="text-muted small">合計</span>', get: o => o.maxBed.total });
  return buildReportTable(res.groups, cols, res.total, opt);
}

/* ===== 總表：大組／小組人數 + 篩選連結 ===== */
function buildQueryLink(res, group, subgroup) {
  const base = location.href.replace(/admin\.html.*$/, 'index.html');
  const p = new URLSearchParams();
  p.set('act', res.actId || '');
  if (group) p.set('group', group);
  if (subgroup) p.set('subgroup', subgroup);
  if (res.accessKey) p.set('key', res.accessKey);
  if (res.unitId) {
    p.set('unit', res.unitId);
    if (res.unitToken) p.set('unitToken', res.unitToken);
  }
  return base + '?' + p.toString();
}

function linkCell(res, group, subgroup) {
  const idx = window._overviewLinks.push(buildQueryLink(res, group, subgroup)) - 1;
  return '<td class="text-nowrap"><button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openQueryLink(' + idx + ')">開啟</button> '
    + '<button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="copyQueryLink(' + idx + ')">複製</button></td>';
}

function openQueryLink(i) {
  const url = (window._overviewLinks || [])[i];
  if (url) window.open(url, '_blank');
}

function copyQueryLink(i) {
  const url = (window._overviewLinks || [])[i];
  if (!url) return;
  if (navigator.clipboard) navigator.clipboard.writeText(url);
  alert('已複製連結：\n' + url);
}

function buildOverviewTable(res, opt) {
  window._overviewLinks = [];

  let html = '<div class="report-wrap"><table class="table table-bordered table-sm report-table overview-table"><thead><tr>'
    + '<th>大組</th><th>小組</th><th class="num">總人數</th><th>名冊</th></tr></thead><tbody>';

  res.groups.forEach((g, gi) => {
    const alt = gi % 2 === 1 ? ' ov-alt' : '';
    const span = g.subgroups.length + 1;
    g.subgroups.forEach((sg, si) => {
      const subLabel = sg.name === '（未分小組）' ? '' : sg.name;
      html += '<tr class="ov-row' + alt + '">';
      if (si === 0) html += '<td class="ov-group" rowspan="' + span + '">' + g.name + '</td>';
      html += '<td class="text-start">' + subLabel + '</td>'
        + '<td class="num">' + sg.headcount.total + '</td>'
        + linkCell(res, g.name, sg.name) + '</tr>';
    });
    html += '<tr class="ov-sub' + alt + '"><td class="text-start fw-semibold">小計</td>'
      + '<td class="num fw-semibold">' + g.headcount.total + '</td>'
      + linkCell(res, g.name, '') + '</tr>';
  });

  html += '<tr class="ov-total"><td colspan="2" class="fw-semibold">總計</td>'
    + '<td class="num fw-semibold">' + res.total.headcount.total + '</td><td></td></tr></tbody></table></div>';
  return html;
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
  const optHtml = activities.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const psel = document.getElementById('pwdActivitySelect');
  if (psel) psel.innerHTML = optHtml;
  const nsel = document.getElementById('noticeActivitySelect');
  if (nsel) nsel.innerHTML = optHtml;
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
  document.getElementById('actThemeColor').value = '#3b5b8c';
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
      document.getElementById('actThemeColor').value = act.themeColor || '#3b5b8c';
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
        setDropdown('mapNum', act.numField);
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
  ['mapGroup','mapSubgroup','mapRole','mapGender','mapName','mapPhone','mapNum'].forEach(id => {
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
  const numField = document.getElementById('mapNum').value;
  const accessKey = document.getElementById('actAccessKey').value.trim();
  let dayMappings = [];
  try { dayMappings = JSON.parse(document.getElementById('dayMappingsJson').value || '[]'); } catch(e) { alert('日期 JSON 格式錯誤'); return; }
  const displayFields = [...document.querySelectorAll('#displayFieldsBox input:checked')].map(c => c.value);
  if (!name || !sheetUrl) { alert('請填寫名稱與試算表網址'); return; }
  const data = {
    id: document.getElementById('editActivityId').value || undefined,
    name, sheetId, sheetUrl, sheetName: sheetName || undefined, groupField, subgroupField, roleField, genderField,
    birthYearField, nameField, phoneField, numField, dayMappings, displayFields, accessKey,
    themeColor: document.getElementById('actThemeColor').value || undefined,
    unit: document.getElementById('actUnit').value || undefined
  };
  const res = await api('saveActivity', { ...authParams(), data: JSON.stringify(data) });
  if (!res.ok) { alert('儲存失敗：' + res.error); return; }
  alert('儲存成功');
  document.getElementById('activityModal').close();
  await loadActivities();
}

/* ===== 組別密碼 ===== */
async function loadGroupPasswords() {
  const actId = document.getElementById('pwdActivitySelect').value;
  if (!actId) { alert('請選擇活動'); return; }
  const res = await api('getActivityGroups', { act: actId, ...authParams() });
  if (!res.ok) { alert(res.error || '載入失敗'); return; }
  window._groupPwdData = res;
  document.getElementById('groupPwdBox').classList.remove('d-none');
  renderGroupPasswords();
}

function renderGroupPasswords() {
  const res = window._groupPwdData;
  if (!res) return;
  const prot = res.protectedCategories || {};
  const tbody = document.getElementById('groupPwdBody');
  const esc = t => String(t ?? '').replace(/'/g, "\\'");
  let html = '';
  res.groups.forEach(g => {
    const pw = prot[g.name] || '';
    html += '<tr><td><strong>' + g.name + '</strong></td><td>大組</td>'
      + '<td><code class="user-select-all">' + (pw || '<span class="text-muted">（未設定）</span>') + '</code></td>'
      + '<td>'
      + '<button class="btn btn-sm btn-outline-primary" onclick="genGroupPwd(\'' + esc(g.name) + '\')">產生</button> '
      + (pw ? '<button class="btn btn-sm btn-outline-danger" onclick="clearGroupPwd(\'' + esc(g.name) + '\')">清除</button>' : '')
      + '</td></tr>';
    g.subgroups.forEach(sg => {
      const spw = prot[sg] || '';
      html += '<tr><td class="ps-4">' + sg + '</td><td>小組</td>'
        + '<td><code class="user-select-all">' + (spw || '<span class="text-muted">（未設定）</span>') + '</code></td>'
        + '<td>'
        + '<button class="btn btn-sm btn-outline-primary" onclick="genGroupPwd(\'' + esc(sg) + '\')">產生</button> '
        + (spw ? '<button class="btn btn-sm btn-outline-danger" onclick="clearGroupPwd(\'' + esc(sg) + '\')">清除</button>' : '')
        + '</td></tr>';
    });
  });
  tbody.innerHTML = html;
}

async function genGroupPwd(cat) {
  const actId = document.getElementById('pwdActivitySelect').value;
  const res = await api('generateCategoryPassword', { act: actId, cat, ...authParams() });
  if (!res.ok) { alert(res.error || '產生失敗'); return; }
  window._groupPwdData.protectedCategories[cat] = res.password;
  renderGroupPasswords();
  alert('已為「' + cat + '」產生密碼：' + res.password);
}

async function clearGroupPwd(cat) {
  const actId = document.getElementById('pwdActivitySelect').value;
  if (!confirm('確定清除「' + cat + '」的密碼？')) return;
  const res = await api('clearCategoryPassword', { act: actId, cat, ...authParams() });
  if (!res.ok) { alert(res.error || '清除失敗'); return; }
  delete window._groupPwdData.protectedCategories[cat];
  renderGroupPasswords();
}

/* ===== 通知單 ===== */
let noticePeople = [];
let noticeData = null;

function readNoticeForm() {
  return {
    region: document.getElementById('noticeRegion').value.trim(),
    classPrefix: document.getElementById('noticeClassPrefix').value.trim(),
    serialPrefix: document.getElementById('noticeSerialPrefix').value.trim(),
    reportInfo: document.getElementById('noticeReportInfo').value,
    contactName: document.getElementById('noticeContactName').value.trim(),
    contactPhone: document.getElementById('noticeContactPhone').value.trim(),
    notices: document.getElementById('noticeNotices').value.split('\n').map(x => x.trim()).filter(Boolean),
    serialStart: Number(document.getElementById('noticeSerialStart').value) || 1,
    serialDigits: Number(document.getElementById('noticeSerialDigits').value) || 3,
    codeType: document.getElementById('noticeCodeType').value
  };
}

function writeNoticeForm(cfg) {
  if (!cfg) return;
  document.getElementById('noticeRegion').value = cfg.region || '';
  document.getElementById('noticeClassPrefix').value = cfg.classPrefix || '';
  document.getElementById('noticeSerialPrefix').value = cfg.serialPrefix || '';
  document.getElementById('noticeReportInfo').value = cfg.reportInfo || '';
  document.getElementById('noticeContactName').value = cfg.contactName || '';
  document.getElementById('noticeContactPhone').value = cfg.contactPhone || '';
  document.getElementById('noticeNotices').value = (cfg.notices || []).join('\n');
  document.getElementById('noticeSerialStart').value = cfg.serialStart || 1;
  document.getElementById('noticeSerialDigits').value = cfg.serialDigits || 3;
  const ct = cfg.codeType || (cfg.showBarcode ? 'barcode' : (cfg.showQr === false ? 'none' : 'qr'));
  document.getElementById('noticeCodeType').value = ct;
}

async function loadNoticeConfig() {
  const actId = document.getElementById('noticeActivitySelect').value;
  if (!actId) { alert('請選擇活動'); return; }
  const res = await api('getNoticeData', { act: actId, ...authParams() });
  if (!res.ok) { alert(res.error || '載入失敗'); return; }
  noticeData = res;
  noticePeople = res.people || [];
  document.getElementById('noticeCfgBox').classList.remove('d-none');
  writeNoticeForm(Object.assign({}, res.noticeConfig, { color: res.themeColor || '#3b5b8c' }));
  const gsel = document.getElementById('noticeGroupFilter');
  gsel.innerHTML = '<option value="">全部大組</option>' +
    (res.groups || []).map(g => '<option value="' + g + '">' + g + '</option>').join('');
  renderNoticePick();
  renderNoticePreviewWithCodes();
}

function renderNoticePick() {
  const box = document.getElementById('noticePickBox');
  if (!box) return;
  const filter = document.getElementById('noticeGroupFilter').value;
  const list = noticePeople.filter(p => !filter || p.group === filter);
  box.innerHTML = list.map(p => {
    const idx = noticePeople.indexOf(p);
    return '<div class="notice-pick-item"><label><input type="checkbox" class="notice-pick" data-idx="' + idx + '" checked>'
      + '<span class="small">' + p.group + ' / ' + (p.subgroup || '—') + ' / ' + p.name + '（' + p.code + '）</span></label></div>';
  }).join('');
  box.querySelectorAll('.notice-pick').forEach(cb => cb.addEventListener('change', updatePickCount));
  updatePickCount();
}

function setNoticePick(checked) {
  document.querySelectorAll('.notice-pick').forEach(cb => { cb.checked = checked; });
  updatePickCount();
}

function updatePickCount() {
  const total = document.querySelectorAll('.notice-pick').length;
  const picked = document.querySelectorAll('.notice-pick:checked').length;
  document.getElementById('pickCount').textContent = picked + ' / ' + total + ' 人';
}

function noticeEsc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function noticeSheetHtml(cfg, p) {
  const title = noticeData && noticeData.name ? noticeData.name : '義工報到通知單';
  const meta = [];
  if (cfg.region) meta.push('<span class="meta-line"><strong>區域:</strong>' + noticeEsc(cfg.region) + '</span>');
  if (cfg.classPrefix) meta.push('<span class="meta-line"><strong>班別:</strong>' + noticeEsc(cfg.classPrefix) + '</span>');
  meta.push('<span class="meta-line"><strong>姓名:</strong>' + noticeEsc(p.name) + '</span>');
  const groupLine = '<div class="meta-line"><strong>您所屬的組別為:</strong>' + noticeEsc(p.group)
    + (p.subgroup ? ' <strong>小組:</strong>' + noticeEsc(p.subgroup) : '') + '</div>';
  const notices = cfg.notices.map(n => '<li>' + noticeEsc(n) + '</li>').join('');
  const contact = (cfg.contactName || cfg.contactPhone)
    ? '<div class="contact">若有其他問題請聯絡報到組：' + noticeEsc(cfg.contactName)
      + (cfg.contactPhone ? ' ' + noticeEsc(cfg.contactPhone) : '') + '</div>'
    : '';

  let codeHtml = '';
  if (cfg.codeType === 'qr') {
    codeHtml = '<div class="notice-code"><img alt="QR" data-qr="' + noticeEsc(p.code) + '">'
      + '<div class="code-text">' + noticeEsc(p.code) + '</div></div>';
  } else if (cfg.codeType === 'barcode') {
    codeHtml = '<div class="notice-code"><div class="code-text">' + noticeEsc(p.code) + '</div>'
      + '<canvas class="bc-canvas" data-bc="' + noticeEsc(p.code) + '"></canvas></div>';
  }

  const reportBlock = cfg.reportInfo
    ? '<div class="notice-block"><div class="blk-title">報到資訊</div>'
      + '<div>' + noticeEsc(cfg.reportInfo).replace(/\n/g, '<br>') + '</div></div>'
    : '';
  const noticeBlock = notices
    ? '<div class="notice-block"><div class="blk-title">注意事項</div><ol class="notice-ol">' + notices + '</ol></div>'
    : '';

  return '<div class="notice-sheet">'
    + '<div class="notice-head"><h2>' + noticeEsc(title) + '</h2><div class="head-sub">義 工 報 到 通 知 單</div></div>'
    + '<div class="notice-body">'
    + '<div class="notice-row"><div class="notice-main notice-meta">' + meta.join('') + groupLine + '</div>' + codeHtml + '</div>'
    + reportBlock
    + noticeBlock
    + contact
    + '</div>'
    + '<div class="notice-foot">隨喜您發心參加護持法人事業　敬祝您福慧增長</div>'
    + '</div>';
}

// 依表單重算編號（流水號前綴／起始／位數），有來源編號欄者沿用來源值
function applyNoticeCodes(list, cfg) {
  const digits = Math.max(1, Math.min(6, Number(cfg.serialDigits) || 3));
  const start = Number(cfg.serialStart) || 1;
  return list.map((p, i) => {
    if (p.fromSheet) return p;
    const auto = String(cfg.serialPrefix || '') + String(start + i).padStart(digits, '0');
    return Object.assign({}, p, { code: auto, autoCode: auto });
  });
}

function renderNoticePreview() {
  const box = document.getElementById('noticePreview');
  if (!box || !noticeData) return;
  const cfg = readNoticeForm();
  const checked = Array.from(document.querySelectorAll('.notice-pick:checked'))
    .map(cb => noticePeople[Number(cb.dataset.idx)]).filter(Boolean);
  const base = checked.length ? checked.slice(0, 1) : noticePeople.slice(0, 1);
  const people = applyNoticeCodes(base, cfg);
  box.innerHTML = people.map(p => noticeSheetHtml(cfg, p)).join('');
}

async function renderNoticePreviewWithCodes() {
  renderNoticePreview();
  await renderNoticeCodes();
}

async function renderNoticeCodes() {
  const qrImgs = document.querySelectorAll('#noticePreview img[data-qr]');
  for (const qr of qrImgs) {
    qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=184x184&data=' + encodeURIComponent(qr.dataset.qr);
  }
  const canvases = document.querySelectorAll('#noticePreview canvas.bc-canvas');
  for (const cv of canvases) {
    try {
      JsBarcode(cv, cv.dataset.bc, { format: 'CODE128', displayValue: true, fontSize: 16, height: 46, margin: 0 });
    } catch (e) { cv.replaceWith(document.createTextNode(cv.dataset.bc)); }
  }
}

async function saveNoticeConfig() {
  const actId = document.getElementById('noticeActivitySelect').value;
  if (!actId) { alert('請先選擇活動'); return; }
  const cfg = readNoticeForm();
  const res = await api('saveActivity', {
    ...authParams(),
    data: JSON.stringify({ id: actId, noticeConfig: cfg })
  });
  if (!res.ok) { alert(res.error || '儲存失敗'); return; }
  alert('通知單設定已儲存');
}

function printNoticeSheets() {
  if (!noticePeople.length) { alert('尚無名單'); return; }
  const checked = Array.from(document.querySelectorAll('.notice-pick:checked'))
    .map(cb => noticePeople[Number(cb.dataset.idx)]).filter(Boolean);
  if (!checked.length) { alert('請至少勾選一人'); return; }
  const cfg = readNoticeForm();
  const people = applyNoticeCodes(checked, cfg);
  const sheets = people.map(p => noticeSheetHtml(cfg, p)).join('');
  const css = (document.getElementById('noticeStyle') || {}).textContent || '';
  const win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>通知單</title>'
    + '<style>' + css + '<\/style>'
    + '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>'
    + '</head><body>'
    + '<div class="no-print" style="position:sticky;top:0;background:#fff;padding:8px;text-align:center;border-bottom:1px solid #999">'
    + '共 ' + checked.length + ' 張，請按 Ctrl+P 列印（A4、邊界 8mm，每頁兩張）</div>'
    + sheets
    + '<script>window.onload=function(){document.querySelectorAll("img[data-qr]").forEach(function(qr){'
    + 'qr.src="https://api.qrserver.com/v1/create-qr-code/?size=148x148&data="+encodeURIComponent(qr.dataset.qr)});'
    + 'document.querySelectorAll("canvas.bc-canvas").forEach(function(cv){'
    + 'try{JsBarcode(cv,cv.dataset.bc,{format:"CODE128",displayValue:true,fontSize:14,height:40,margin:0})}catch(e){cv.replaceWith(document.createTextNode(cv.dataset.bc))}});};'
    + '<\/script></body></html>');
  win.document.close();
}
