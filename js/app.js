let activities = [];
let currentActivity = null;
let currentFields = [];
let currentRows = [];
let allRows = [];
let headers = [];

function api(action, params = {}) {
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  return fetch(url).then(r => r.json());
}
function authParams() {
  const p = new URLSearchParams(location.search);
  const key = p.get('key') || sessionStorage.getItem('pendingKey') || '';
  const token = sessionStorage.getItem('publicToken') || '';
  const out = {};
  if (token) out.token = token;
  if (key) out.key = key;
  return out;
}
function showError(msg){ const e=document.getElementById('error'); e.textContent=msg; e.classList.remove('d-none'); document.getElementById('success').classList.add('d-none'); }
function showSuccess(msg){ const e=document.getElementById('success'); e.textContent=msg; e.classList.remove('d-none'); document.getElementById('error').classList.add('d-none'); }

async function init() {
  try {
    const params = new URLSearchParams(location.search);
    const urlAct = params.get('act');
    const urlKey = params.get('key');
    const urlGroup = params.get('group');
    const urlSubgroup = params.get('subgroup');
    const urlPwd = params.get('pwd');
    const unit = params.get('unit') || '';
    const unitToken = params.get('unitToken') || '';
    if (urlKey) sessionStorage.setItem('pendingKey', urlKey);
    const lp = {};
    if (unit) { lp.unit = unit; lp.unitToken = unitToken; }
    const res = await api('listActivities', lp);
    if (!res.ok) throw new Error(res.error || '載入活動失敗');
    activities = res.activities || [];
    if (res.publicToken) sessionStorage.setItem('publicToken', res.publicToken);
    const sel = document.getElementById('activitySelect');
    sel.innerHTML = activities.map(a => `<option value="${a.id}">${a.name}</option>`).join('') || '<option value="">（無活動）</option>';
    if (urlAct && activities.some(a=>a.id===urlAct)) sel.value = urlAct;
    sel.addEventListener('change', () => loadActivity(sel.value));
    await loadActivity(sel.value);
    // URL 參數自動篩選
    if (urlGroup) {
      const gSel = document.getElementById('groupSelect');
      gSel.value = urlGroup;
      gSel.dispatchEvent(new Event('change'));
      if (urlSubgroup) {
        const sSel = document.getElementById('subgroupSelect');
        setTimeout(() => {
          sSel.value = urlSubgroup;
          sSel.dispatchEvent(new Event('change'));
          if (urlPwd) document.getElementById('passwordInput').value = urlPwd;
          setTimeout(() => {
            const btn = document.getElementById('submitBtn');
            if (!btn.disabled) btn.click();
          }, 100);
        }, 100);
      }
      // 隱藏篩選控制，只顯示該組內容
      const filterCard = document.getElementById('filterCard');
      if (filterCard) filterCard.style.display = 'none';
      document.getElementById('content').classList.add('compact-mode');
    }
    // 單位模式：隱藏活動選擇，只顯示該單位活動
    if (unit) {
      const actRow = document.getElementById('activitySelect').closest('.col-md-3');
      if (actRow) actRow.style.display = 'none';
    }
    document.getElementById('loading').classList.add('d-none');
    document.getElementById('content').classList.remove('d-none');
    // 即時搜尋
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (!allRows.length) return;
        const kw = searchInput.value.trim().toLowerCase();
        const role = document.getElementById('roleSelect').value;
        const gender = document.getElementById('genderSelect').value;
        const fieldIndex = Object.fromEntries(currentFields.map((f,i)=>[f,i]));
        let rows = allRows.slice();
        if (role && fieldIndex['身分別'] !== undefined) rows = rows.filter(r => String(r[fieldIndex['身分別']] ?? '') === role);
        if (gender && fieldIndex['性別'] !== undefined) rows = rows.filter(r => String(r[fieldIndex['性別']] ?? '') === gender);
        if (kw) rows = rows.filter(r => r.some(c => String(c).toLowerCase().includes(kw)));
        currentRows = rows;
        renderTable(currentFields, currentRows);
        document.getElementById('resultCount').textContent = `共 ${rows.length} 筆`;
      });
    }
  } catch (err) {
    document.getElementById('loading').textContent = '載入失敗：' + err.message;
  }
}
async function loadActivity(actId) {
  if (!actId) return;
  const params = { act: actId, ...authParams() };
  const res = await api('getActivityInfo', params);
  if (!res.ok) { showError(res.error || '載入活動失敗'); return; }
  currentActivity = res.activity;
  headers = res.headers || [];
  window._recColWidths = res.recColWidths || {};
  window._subgroupsByGroup = res.subgroupsByGroup || {};
  const groupSel = document.getElementById('groupSelect');
  const subSel = document.getElementById('subgroupSelect');
  groupSel.innerHTML = '<option value="">請選擇大組（或留空查全部）</option>' + (res.groupValues||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
  subSel.innerHTML = '<option value="">請選擇小組</option>';
  subSel.disabled = true;
  groupSel.onchange = () => {
    subSel.innerHTML = '<option value="">請選擇小組</option>';
    subSel.disabled = !groupSel.value;
    document.getElementById('submitBtn').disabled = !(groupSel.value === '' || subSel.value);
    document.getElementById('results').classList.add('d-none');
    showSuccess('');
    if (groupSel.value) {
      const subs = (window._subgroupsByGroup[groupSel.value] || []);
      subSel.innerHTML = '<option value="">請選擇小組</option>' +
        subs.map(v => `<option value="${v}">${v === '大組' ? '大組（幹部）' : v}</option>`).join('') +
        '<option value="選擇全部">選擇全部</option>';
      subSel.value = '選擇全部';
      document.getElementById('submitBtn').disabled = false;
    }
  };
  subSel.onchange = () => {
    document.getElementById('submitBtn').disabled = !(groupSel.value === '' || subSel.value);
    document.getElementById('results').classList.add('d-none');
  };
  const roleSel = document.getElementById('roleSelect');
  // role values from data not available; keep generic
  document.getElementById('submitBtn').onclick = submitQuery;
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('subgroupSelect').onchange = () => {
    document.getElementById('submitBtn').disabled = !document.getElementById('subgroupSelect').value;
    document.getElementById('results').classList.add('d-none');
  };
}
async function submitQuery() {
  const actId = document.getElementById('activitySelect').value;
  const group = document.getElementById('groupSelect').value;
  const subgroup = document.getElementById('subgroupSelect').value;
  const password = document.getElementById('passwordInput').value;
  const role = document.getElementById('roleSelect').value;
  const gender = document.getElementById('genderSelect').value;
  const search = document.getElementById('searchInput').value;
  const res = await api('getList', { act: actId, group, subgroup, pwd: password, ...authParams() });
  if (!res.ok) { showError(res.error || '查詢失敗'); document.getElementById('results').classList.add('d-none'); return; }
  let rows = res.rows || [];
  allRows = rows.slice();
  // client-side filters
  const fieldIndex = Object.fromEntries(res.fields.map((f,i)=>[f,i]));
  if (role && fieldIndex['身分別'] !== undefined) rows = rows.filter(r => String(r[fieldIndex['身分別']] ?? '') === role);
  if (gender && fieldIndex['性別'] !== undefined) rows = rows.filter(r => String(r[fieldIndex['性別']] ?? '') === gender);
  if (search) rows = rows.filter(r => r.some(c => String(c).includes(search)));
  currentFields = res.fields || [];
  currentRows = rows;
  renderTable(currentFields, currentRows);
  document.getElementById('results').classList.remove('d-none');
  document.getElementById('resultCount').textContent = `共 ${rows.length} 筆`;
  showSuccess(`已載入 ${rows.length} 筆資料`);
}
function renderTable(fields, rows) {
  const table = document.getElementById('dataTable');
  table.classList.add('fixed-cols');
  const thead = table.querySelector('thead'); const tbody = table.querySelector('tbody');
  thead.innerHTML = ''; tbody.innerHTML = '';
  // colgroup for widths
  let cg = table.querySelector('colgroup');
  if (!cg) { cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
  cg.innerHTML = '';
  const rec = window._recColWidths || {};
  fields.forEach(f => {
    const col = document.createElement('col');
    if (rec[f]) col.style.width = rec[f] + 'px';
    cg.appendChild(col);
  });
  const tr = document.createElement('tr');
  fields.forEach(f => { const th = document.createElement('th'); th.textContent = f; th.className = 'px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap border-b border-gray-200'; tr.appendChild(th); });
  thead.appendChild(tr);
  renderStats(rows);
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, i) => {
      const td = document.createElement('td');
      const h = fields[i];
      td.className = 'px-3 py-2 text-sm text-gray-700 border-b border-gray-100 whitespace-nowrap';
      if (h && (h.includes('義工') || h.includes('早餐') || h.includes('午餐') || h.includes('晚餐') || h.includes('住宿'))) {
        td.textContent = String(cell) === '1' ? '☑' : (String(cell)==='0' ? '☐' : '');
        td.classList.add('text-center', 'text-lg', 'text-green-600');
      } else if (h && (h === '電話' || h.includes('電話'))) {
        renderPhoneCell(td, cell);
      } else if (h && h.includes('電話') && cell) {
        const phone = String(cell).replace(/[^0-9]/g, '');
        const masked = phone.length >= 8 ? phone.substring(0, 4) + '***' + phone.substring(phone.length - 3) : '***';
        td.textContent = masked;
        td.dataset.phone = phone;
        td.classList.add('cursor-pointer', 'select-none');
        td.title = '長按 3 秒解鎖顯示';
        let timer = null;
        const start = () => {
          if (td.dataset.revealed === '1') return;
          td.classList.add('bg-red-50');
          const bar = document.createElement('div');
          bar.className = 'absolute bottom-0 left-0 h-0.5 bg-red-500';
          bar.style.width = '0%';
          bar.style.transition = 'width 3s linear';
          td.style.position = 'relative';
          td.appendChild(bar);
          requestAnimationFrame(() => { bar.style.width = '100%'; });
          timer = setTimeout(() => {
            td.textContent = phone;
            td.dataset.revealed = '1';
            td.classList.remove('bg-red-50');
            bar.remove();
          }, 3000);
        };
        const cancel = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          td.classList.remove('bg-red-50');
          const bar = td.querySelector('.bg-red-500');
          if (bar) bar.remove();
        };
        td.addEventListener('mousedown', start);
        td.addEventListener('mouseup', cancel);
        td.addEventListener('mouseleave', cancel);
        td.addEventListener('touchstart', start);
        td.addEventListener('touchend', cancel);
        td.addEventListener('contextmenu', e => e.preventDefault());
      } else {
        td.textContent = cell ?? '';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
function renderStats(rows) {
  const box = document.getElementById('statsCards');
  const card = document.getElementById('stats');
  if (!box) return;
  if (!rows.length) { card.classList.add('d-none'); return; }
  card.classList.remove('d-none');
  const idx = Object.fromEntries(currentFields.map((f,i)=>[f,i]));
  const total = rows.length;
  let male=0, female=0, cadre=0, volunteer=0;
  rows.forEach(r => {
    const g = String(r[idx['性別']] ?? '').trim();
    if (g === '男') male++; else if (g === '女') female++;
    const role = String(r[idx['身分別']] ?? '').trim();
    if (role === '幹部') cadre++; else volunteer++;
  });
  const item = (label, val, color) => `<div class="col"><div class="p-3 rounded-lg bg-${color}-50"><div class="text-2xl font-bold text-${color}-700">${val}</div><div class="text-xs text-gray-500">${label}</div></div></div>`;
  box.innerHTML = item('總人數', total, 'blue') + item('男', male, 'indigo') + item('女', female, 'pink') + item('幹部', cadre, 'green') + item('一般義工', volunteer, 'amber');
}
// 匯出 CSV
function exportCsv() {
  const fields = currentFields; const rows = currentRows;
  if (!rows || rows.length === 0) { alert('目前沒有可匯出的資料'); return; }
  const esc = v => { const s = v == null ? '' : String(v); return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const actName = currentActivity?.name || '名冊';
  const now = new Date().toLocaleString('zh-TW', { hour12: false });
  const lines = [];
  lines.push(fields.map(esc).join(','));
  rows.forEach(r => lines.push(r.map(esc).join(',')));
  const csv = '\\uFEFF' + lines.join('\\r\\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${actName}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// 列印名冊
function printRoster() {
  const fields = currentFields; const rows = currentRows;
  if (!rows || rows.length === 0) { alert('目前沒有可列印的資料'); return; }
  const escHtml = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const actName = currentActivity?.name || '名冊';
  const now = new Date().toLocaleString('zh-TW', { hour12: false });
  const thead = '<thead><tr>' + fields.map(f => `<th>${escHtml(f)}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>' + rows.map(r => '<tr>' + r.map((c, i) => {
    const h = fields[i] || '';
    let val = c;
    if (h && (h.includes('義工')||h.includes('早餐')||h.includes('午餐')||h.includes('晚餐')||h.includes('住宿'))) {
      val = String(c)==='1' ? '☑' : (String(c)==='0' ? '☐' : '');
    }
    return `<td>${escHtml(val)}</td>`;
  }).join('') + '</tr>').join('') + '</tbody>';
  const win = window.open('', '_blank');
  if (!win) { alert('請允許彈出視窗'); return; }
  win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escHtml(actName)} 名冊</title><style>
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#222;padding:24px}
  @page{size:A4 landscape;margin:12mm}table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #444;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-all}
  thead th{background:#f0efe9}thead{display:table-header-group}tr{break-inside:avoid}
  </style></head><body><div><h1>${escHtml(actName)} 名冊</h1><div>匯出時間：${escHtml(now)} ｜ 共 ${rows.length} 筆</div></div><table>${thead}${tbody}</table></body></html>`);
  win.document.close(); win.focus();
  setTimeout(() => { try { win.print(); } catch(e){} }, 250);
}
document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
  document.getElementById('btnPrintRoster').addEventListener('click', printRoster);
});