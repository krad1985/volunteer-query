let adminPassword = '';
let activities = [];
let availableFields = [];
let availableHeaders = [];

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
function authParams() { return { pwd: adminPassword }; }
function showError(el, msg) { if (typeof el === 'string') el = document.getElementById(el); el.textContent = msg; el.className = 'text-danger small'; }
function showOk(el, msg) { if (typeof el === 'string') el = document.getElementById(el); el.textContent = msg; el.className = 'text-success small'; }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLogin').onclick = handleLogin;
  document.getElementById('adminPwd').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
  document.getElementById('btnAddActivity').onclick = () => openModal();
  document.getElementById('btnCloseModal').onclick = () => document.getElementById('activityModal').close();
  document.getElementById('btnTestConnection').onclick = handleTestConnection;
  document.getElementById('btnSaveActivity').onclick = handleSaveActivity;
  document.getElementById('btnAutoDetect').onclick = autoDetectDays;
});

async function handleLogin() {
  const pwd = document.getElementById('adminPwd').value.trim();
  if (!pwd) { showError('loginHint','請輸入密碼'); return; }
  const res = await api('admin_login', { pwd });
  if (!res.ok) { showError('loginHint', res.error || '密碼錯誤'); return; }
  adminPassword = pwd;
  showOk('loginHint', '登入成功');
  document.getElementById('loginSection').classList.add('d-none');
  document.getElementById('adminPanel').classList.remove('d-none');
  await loadActivities();
}

async function loadActivities() {
  const res = await api('getConfig', { pwd: adminPassword });
  if (!res.ok) { alert(res.error); return; }
  activities = res.config?.activities || [];
  renderActivityList();
}

function renderActivityList() {
  const ul = document.getElementById('activityList');
  if (!activities.length) { ul.innerHTML = '<li class="list-group-item text-muted">尚無活動</li>'; return; }
  ul.innerHTML = activities.map(a => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <strong>${a.name}</strong>
        <div class="small text-muted">大組欄位: ${a.groupField || '-'} / 小組: ${a.subgroupField || '-'} / 日期數: ${(a.dayMappings||[]).length}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary" onclick="viewActivity('${a.id}')">檢視</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="openModal('${a.id}')">編輯</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteActivity('${a.id}')">刪除</button>
      </div>
    </li>
  `).join('');
}

function viewActivity(id) {
  const base = location.href.replace(/admin\.html.*/, 'index.html');
  window.open(base + '?act=' + id, '_blank');
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
    birthYearField, nameField, phoneField, dayMappings, displayFields, accessKey
  };
  const res = await api('saveActivity', { ...authParams(), data: JSON.stringify(data) });
  if (!res.ok) { alert('儲存失敗：' + res.error); return; }
  alert('儲存成功');
  document.getElementById('activityModal').close();
  await loadActivities();
}