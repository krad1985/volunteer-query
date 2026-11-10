/**
 * 通用義工報名查詢 / 統計系統 - GAS 後端
 * 資料來源：Google Sheet（表單回應 / 檢視表）
 * 提供：活動列表、活動資訊、名單查詢、統計報表、管理設定
 *
 * 部署：Web App -> 執行身分「我」，存取權「任何人」
 */

const PROP_ACTIVITIES = 'ACTIVITIES_CONFIG';
const PROP_ADMIN_HASH = 'ADMIN_PWD_HASH';
const PROP_ADMIN_SALT = 'ADMIN_PWD_SALT';
const CACHE_PREFIX = 'VOL_V2_DATA_';
const CACHE_TTL = 60;

/* ===== 主進入點 ===== */
function doGet(e) {
  const action = e?.parameter?.action || 'listActivities';
  let result;
  try {
    switch (action) {
      case 'listActivities': result = handleListActivities(e.parameter); break;
      case 'getActivityInfo': result = handleGetActivityInfo(e.parameter); break;
      case 'getList': result = handleGetList(e.parameter); break;
      case 'getReport': result = handleGetReport(e.parameter); break;
      case 'testConnection': result = handleTestConnection(e.parameter); break;
      case 'getCategoryValues': result = handleGetCategoryValues(e.parameter); break;
      case 'admin_login': result = handleAdminLogin(e.parameter); break;
      case 'unit_login': result = handleUnitLogin(e.parameter); break;
      case 'listUnitsPublic': result = handleListUnitsPublic(e.parameter); break;
      case 'getConfig': result = handleGetConfig(e.parameter); break;
      case 'saveActivity': result = handleSaveActivity(e.parameter); break;
      case 'deleteActivity': result = handleDeleteActivity(e.parameter); break;
      case 'generateCategoryPassword': result = handleGenerateCategoryPassword(e.parameter); break;
      case 'changePassword': result = handleChangePassword(e.parameter); break;
      case 'createUnit': result = handleCreateUnit(e.parameter); break;
      case 'listUnits': result = handleListUnits(e.parameter); break;
      case 'deleteUnit': result = handleDeleteUnit(e.parameter); break;
      case 'setUnitPassword': result = handleSetUnitPassword(e.parameter); break;
      default: result = { ok: false, error: '未知的 action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== 活動列表 ===== */
function handleListActivities(params) {
  const index = getConfigIndex();
  const unitId = params.unit || '';
  const unitToken = params.unitToken || '';
  if (!unitId) {
    const activities = index.activityIds.map(id => getActivityById(id)).filter(a => a && !a.unit)
      .map(a => ({ id: a.id, name: a.name }));
    return { ok: true, activities, publicToken: index.publicToken || '' };
  }
  const unit = getUnitById(unitId);
  if (!unit) return { ok: false, error: '找不到該單位' };
  if (!unit.token || unit.token !== unitToken) return { ok: false, code: 'NEED_UNIT_TOKEN', error: '單位 Token 驗證失敗' };
  const activities = index.activityIds.map(id => getActivityById(id)).filter(a => a && a.unit === unitId)
    .map(a => ({ id: a.id, name: a.name }));
  return { ok: true, activities, publicToken: unit.token || '' };
}

/* ===== 活動資訊 ===== */
function authorizeActivity(params, activity) {
  const index = getConfigIndex();
  const token = params.token || '';
  const key = params.key || '';
  const unitToken = activity.unit ? (getUnitById(activity.unit)?.token || '') : '';
  const validToken = activity.unit ? unitToken : (index.publicToken || '');
  if (validToken && token !== validToken) return { ok: false, code: 'BAD_TOKEN', error: 'Token 驗證失敗' };
  const accessKey = activity.accessKey || '';
  if (accessKey && key !== accessKey) return { ok: false, code: 'NEED_KEY', error: '此活動需輸入存取金鑰' };
  return { ok: true };
}

function handleGetActivityInfo(params) {
  const actId = params.act;
  if (!actId) return { ok: false, error: '缺少活動 ID' };
  const activity = getActivityById(actId);
  if (!activity) return { ok: false, error: '找不到該活動' };
  const auth = authorizeActivity(params, activity);
  if (!auth.ok) return { ok: false, code: auth.code, error: auth.error };
  const data = readSpreadsheetData(activity);
  if (!data.ok) return data;
  return {
    ok: true,
    activity: {
      id: activity.id,
      name: activity.name,
      groupField: activity.groupField || '',
      subgroupField: activity.subgroupField || '',
      roleField: activity.roleField || '',
      genderField: activity.genderField || '',
      birthYearField: activity.birthYearField || '',
      nameField: activity.nameField || '',
      phoneField: activity.phoneField || '',
      dayMappings: activity.dayMappings || [],
      displayFields: activity.displayFields || [],
      unit: activity.unit || '',
      accessKey: activity.accessKey || ''
    },
    headers: data.headers,
    groupValues: uniqueValues(data.rawRows, activity.groupField),
    subgroupValues: uniqueValues(data.rawRows, activity.subgroupField)
  };
}

function uniqueValues(rows, field) {
  if (!field) return [];
  const set = {};
  rows.forEach(r => { const v = String(r[field] ?? '').trim(); if (v) set[v] = true; });
  return Object.keys(set).sort((a,b) => a.localeCompare(b,'zh-TW'));
}

/* ===== 名單查詢 ===== */
function handleGetList(params) {
  const actId = params.act;
  const group = params.group || '';
  const subgroup = params.subgroup || '';
  const pwd = params.pwd || '';
  if (!actId) return { ok: false, error: '缺少活動 ID' };
  const activity = getActivityById(actId);
  if (!activity) return { ok: false, error: '找不到該活動' };
  const auth = authorizeActivity(params, activity);
  if (!auth.ok) return { ok: false, code: auth.code, error: auth.error };

  // 密碼驗證：若 activity 有 protectedCategories（以 group/subgroup 為 key）
  const protectedSet = activity.protectedCategories || {};
  if (subgroup && protectedSet[subgroup] && protectedSet[subgroup] !== pwd) {
    return { ok: false, code: 'NEED_PWD', error: '此小組已鎖定，需輸入正確密碼' };
  }
  if (!subgroup && group && protectedSet[group] && protectedSet[group] !== pwd) {
    return { ok: false, code: 'NEED_PWD', error: '此大組已鎖定，需輸入正確密碼' };
  }

  const cacheKey = CACHE_PREFIX + actId + '_v' + (activity.cacheVersion||0) + '_' + group + '_' + subgroup;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const data = readSpreadsheetData(activity);
  if (!data.ok) return data;

  let rows = data.rawRows;
  if (group) rows = rows.filter(r => String(r[activity.groupField] ?? '').trim() === group);
  if (subgroup && subgroup !== '選擇全部') rows = rows.filter(r => String(r[activity.subgroupField] ?? '').trim() === subgroup);

  const displayFields = (activity.displayFields && activity.displayFields.length) ? activity.displayFields : data.headers;
  const projected = rows.map(row => displayFields.map(f => {
    const i = data.headers.indexOf(f);
    return i >= 0 ? row[data.headers[i]] : null;
  }));

  const result = {
    ok: true, name: activity.name, fields: displayFields, rows: projected,
    updatedAt: new Date().toISOString()
  };
  try { cache.put(cacheKey, JSON.stringify(result), CACHE_TTL); } catch(e) {}
  return result;
}

/* ===== 統計報表 ===== */
function handleGetReport(params) {
  const actId = params.act;
  if (!actId) return { ok: false, error: '缺少活動 ID' };
  const activity = getActivityById(actId);
  if (!activity) return { ok: false, error: '找不到該活動' };
  const auth = authorizeActivity(params, activity);
  if (!auth.ok) return { ok: false, code: auth.code, error: auth.error };

  const data = readSpreadsheetData(activity);
  if (!data.ok) return data;

  const gf = activity.groupField;
  const sf = activity.subgroupField;
  const rf = activity.roleField;
  const gendf = activity.genderField;
  const byf = activity.birthYearField;
  const days = activity.dayMappings || [];

  // 過濾（可選）
  const filterGroup = params.group || '';
  const filterSubgroup = params.subgroup || '';
  let rows = data.rawRows;
  if (filterGroup) rows = rows.filter(r => String(r[gf] ?? '').trim() === filterGroup);
  if (filterSubgroup) rows = rows.filter(r => String(r[sf] ?? '').trim() === filterSubgroup);

  // 建立 group -> subgroup 結構
  const groupMap = {};
  rows.forEach(row => {
    const g = String(row[gf] ?? '').trim() || '（未分組）';
    const s = String(row[sf] ?? '').trim() || '（未分小組）';
    if (!groupMap[g]) groupMap[g] = {};
    if (!groupMap[g][s]) groupMap[g][s] = [];
    groupMap[g][s].push(row);
  });

  const groups = Object.keys(groupMap).sort((a,b)=>a.localeCompare(b,'zh-TW')).map(g => {
    const subgroups = Object.keys(groupMap[g]).sort((a,b)=>a.localeCompare(b,'zh-TW')).map(s => {
      const rs = groupMap[g][s];
      return buildSubgroupReport(rs, days, rf, gendf, byf, s);
    });
    // group totals
    const allRows = subgroups.reduce((acc, sg) => acc.concat(sg._rows || []), []);
    // 重新從原始 rows 聚合 group
    const gRows = rows.filter(r => String(r[gf] ?? '').trim() === g || (g === '（未分組）' && !String(r[gf] ?? '').trim()));
    const groupReport = buildAggregate(gRows, days, rf, gendf, byf);
    return {
      name: g,
      subgroups: subgroups.map(({_rows, ...rest}) => rest),
      ...groupReport
    };
  });

  // grand total
  const grand = buildAggregate(rows, days, rf, gendf, byf);

  return { ok: true, name: activity.name, groups, total: grand, dayLabels: days.map(d=>d.label) };
}

function buildSubgroupReport(rows, days, rf, gendf, byf, name) {
  const agg = buildAggregate(rows, days, rf, gendf, byf);
  agg._rows = rows;
  agg.name = name;
  return agg;
}

function isOne(v) {
  const s = String(v ?? '').trim();
  return s === '1' || s === '1.0' || s.toLowerCase() === 'true' || s === '是' || s === 'Y' || s === 'y';
}

function buildAggregate(rows, days, rf, gendf, byf) {
  const headcount = { total: rows.length, male: 0, female: 0, cadre: 0, volunteer: 0 };
  rows.forEach(r => {
    const gender = String(r[gendf] ?? '').trim();
    if (gender === '男') headcount.male++;
    else if (gender === '女') headcount.female++;
    const role = String(r[rf] ?? '').trim();
    if (role === '幹部') headcount.cadre++;
    else headcount.volunteer++;
  });

  const manpowerByDay = days.map(d => {
    const m = { label: d.label, male: 0, female: 0, total: 0 };
    rows.forEach(r => {
      const f = d.attendanceField;
      if (!f) return;
      if (isOne(r[f])) {
        m.total++;
        const gender = String(r[gendf] ?? '').trim();
        if (gender === '男') m.male++;
        else if (gender === '女') m.female++;
      }
    });
    return m;
  });

  const mealsByDay = days.map(d => {
    const mk = (field) => {
      const o = { male: 0, female: 0, total: 0 };
      if (!field) return o;
      rows.forEach(r => {
        if (isOne(r[field])) {
          o.total++;
          const gender = String(r[gendf] ?? '').trim();
          if (gender === '男') o.male++;
          else if (gender === '女') o.female++;
        }
      });
      return o;
    };
    return {
      label: d.label,
      breakfast: mk(d.breakfastField),
      lunch: mk(d.lunchField),
      dinner: mk(d.dinnerField)
    };
  });

  const lodgingByDay = days.map(d => {
    const o = { label: d.label, male: 0, female: 0, total: 0 };
    const field = d.lodgingField;
    if (field) rows.forEach(r => {
      if (isOne(r[field])) {
        o.total++;
        const gender = String(r[gendf] ?? '').trim();
        if (gender === '男') o.male++;
        else if (gender === '女') o.female++;
      }
    });
    return o;
  });

  let maxBedTotal = 0, maxBedMale = 0, maxBedFemale = 0;
  lodgingByDay.forEach(d => {
    if (d.total > maxBedTotal) maxBedTotal = d.total;
    if (d.male > maxBedMale) maxBedMale = d.male;
    if (d.female > maxBedFemale) maxBedFemale = d.female;
  });

  return {
    headcount,
    manpowerByDay,
    mealsByDay,
    lodgingByDay,
    maxBed: { male: maxBedMale, female: maxBedFemale, total: maxBedTotal }
  };
}

/* ===== 測試連線 ===== */
function handleTestConnection(params) {
  if (!resolveAdminAuth(params)) return { ok: false, error: '管理密碼錯誤' };
  const url = params.url;
  if (!url) return { ok: false, error: '缺少試算表網址' };
  const sheetId = extractSheetId(url);
  if (!sheetId) return { ok: false, error: '無法從網址解析試算表 ID' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = params.sheetName ? ss.getSheetByName(params.sheetName) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到工作表' };
    const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h).trim()).filter(h=>h);
    return { ok: true, fields: headers, sheetName: sheet.getName(), sheetId };
  } catch (err) {
    const msg = err.toString();
    if (msg.includes('permission') || msg.includes('權限') || msg.includes('找不到')) {
      return { ok: false, error: '無法存取試算表，請確認已分享給 krad1985@gmail.com' };
    }
    return { ok: false, error: msg };
  }
}

function handleGetCategoryValues(params) {
  if (!resolveAdminAuth(params)) return { ok: false, error: '管理密碼錯誤' };
  const url = params.url; const field = params.field;
  if (!url) return { ok: false, error: '缺少試算表網址' };
  if (!field) return { ok: false, error: '缺少欄位' };
  const sheetId = extractSheetId(url);
  if (!sheetId) return { ok: false, error: '無法解析試算表 ID' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = params.sheetName ? ss.getSheetByName(params.sheetName) : ss.getSheets()[0];
    const lastRow = sheet.getLastRow(); const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { ok: true, values: [] };
    const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(h=>String(h).trim());
    const idx = headers.indexOf(field);
    if (idx < 0) return { ok: true, values: [] };
    const data = sheet.getRange(2, idx+1, lastRow-1, 1).getValues().flat();
    const set = {};
    data.forEach(v => { const s = String(v).trim(); if (s) set[s]=true; });
    return { ok: true, values: Object.keys(set).sort((a,b)=>a.localeCompare(b,'zh-TW')) };
  } catch (err) { return { ok: false, error: err.toString() }; }
}

/* ===== Auth ===== */
function resolveAdminAuth(params) {
  if (params.unit && params.unitPwd) {
    const unit = getUnitById(params.unit);
    if (unit && verifyUnitAdminPassword(unit, params.unitPwd)) return { role: 'unit', unit };
    return null;
  }
  if (verifyAdminPassword(params.pwd)) return { role: 'admin' };
  return null;
}
function handleAdminLogin(params) {
  const pwd = params.pwd || '';
  const storedHash = PropertiesService.getScriptProperties().getProperty(PROP_ADMIN_HASH);
  const storedSalt = PropertiesService.getScriptProperties().getProperty(PROP_ADMIN_SALT);
  if (!storedHash || !storedSalt) {
    const salt = generateSalt(); const hash = hashPassword(pwd, salt);
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_ADMIN_HASH, hash); props.setProperty(PROP_ADMIN_SALT, salt);
    return { ok: true, firstTime: true };
  }
  return { ok: verifyPassword(pwd, storedHash, storedSalt), firstTime: false };
}
function handleUnitLogin(params) {
  const unitId = params.unit || ''; const pwd = params.pwd || '';
  if (!unitId) return { ok: false, error: '缺少單位 ID' };
  const unit = getUnitById(unitId);
  if (!unit) return { ok: false, error: '找不到該單位' };
  if (!verifyUnitAdminPassword(unit, pwd)) return { ok: false, error: '單位管理密碼錯誤' };
  return { ok: true, unit: { id: unit.id, name: unit.name, token: unit.token || '' } };
}
function verifyUnitAdminPassword(unit, pwd) {
  if (!unit || !unit.adminHash || !unit.adminSalt) return false;
  return verifyPassword(pwd || '', unit.adminHash, unit.adminSalt);
}
function handleListUnitsPublic(params) {
  const index = getConfigIndex();
  const units = index.units.map(id => getUnitById(id)).filter(u=>u);
  return { ok: true, units: units.map(u=>({id:u.id, name:u.name})) };
}

function handleGetConfig(params) {
  if (params.unit && params.unitPwd) {
    const unit = getUnitById(params.unit);
    if (!unit) return { ok: false, error: '找不到該單位' };
    if (!verifyUnitAdminPassword(unit, params.unitPwd)) return { ok: false, error: '單位管理密碼錯誤' };
    const activities = getAllActivities().filter(a => a.unit === unit.id);
    return { ok: true, role: 'unit', unit: { id: unit.id, name: unit.name, token: unit.token || '' },
      config: { activities, units: [{ id: unit.id, name: unit.name, token: unit.token || '' }] } };
  }
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const index = getConfigIndex();
  const units = index.units.map(id => getUnitById(id)).filter(u=>u);
  const allActivities = getAllActivities();
  return { ok: true, role: 'admin', config: {
    activities: allActivities,
    units: units.map(u => ({ id: u.id, name: u.name, token: u.token || '', activityCount: allActivities.filter(a=>a.unit===u.id).length })),
    publicToken: index.publicToken || ''
  } };
}

function handleCreateUnit(params) {
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const name = (params.name || '').trim(); const unitAdminPwd = params.unitAdminPwd || '';
  if (!name) return { ok: false, error: '請輸入單位名稱' };
  if (unitAdminPwd.length < 6) return { ok: false, error: '單位管理密碼至少 6 碼' };
  const unitId = 'unit_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const salt = generateSalt();
  const unit = { id: unitId, name, adminHash: hashPassword(unitAdminPwd, salt), adminSalt: salt, token: generatePublicToken() };
  saveUnitRecord(unit);
  const index = getConfigIndex(); index.units.push(unitId); saveConfigIndex(index);
  return { ok: true, id: unitId, name, token: unit.token };
}
function handleListUnits(params) {
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const index = getConfigIndex();
  const units = index.units.map(id => getUnitById(id)).filter(u=>u);
  return { ok: true, units: units.map(u => ({ id: u.id, name: u.name, token: u.token || '', activityCount: getAllActivities().filter(a=>a.unit===u.id).length })) };
}
function handleDeleteUnit(params) {
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const unitId = params.id;
  if (!unitId) return { ok: false, error: '缺少單位 ID' };
  const unit = getUnitById(unitId); if (!unit) return { ok: false, error: '找不到該單位' };
  if (getAllActivities().some(a => a.unit === unitId)) return { ok: false, error: '該單位尚有活動' };
  deleteUnitRecord(unitId);
  const index = getConfigIndex(); index.units = index.units.filter(u=>u!==unitId); saveConfigIndex(index);
  return { ok: true };
}
function handleSetUnitPassword(params) {
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const unitId = params.id; const newPwd = params.newPwd || '';
  if (!unitId) return { ok: false, error: '缺少單位 ID' };
  if (newPwd.length < 6) return { ok: false, error: '新密碼至少 6 碼' };
  const unit = getUnitById(unitId); if (!unit) return { ok: false, error: '找不到該單位' };
  const salt = generateSalt(); unit.adminHash = hashPassword(newPwd, salt); unit.adminSalt = salt; saveUnitRecord(unit);
  return { ok: true };
}

function handleSaveActivity(params) {
  // unit admin
  if (params.unit && params.unitPwd) {
    const unit = getUnitById(params.unit);
    if (!unit) return { ok: false, error: '找不到該單位' };
    if (!verifyUnitAdminPassword(unit, params.unitPwd)) return { ok: false, error: '單位管理密碼錯誤' };
    const activityData = JSON.parse(params.data || '{}');
    if (!activityData.sheetId && activityData.sheetUrl) activityData.sheetId = extractSheetId(activityData.sheetUrl);
    activityData.unit = unit.id;
    activityData.protectedCategories = activityData.protectedCategories || {};
    activityData.cacheVersion = (activityData.cacheVersion || 0) + 1;
    if (!activityData.id) {
      activityData.id = 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      saveActivityRecord(activityData);
      const index = getConfigIndex(); index.activityIds.push(activityData.id); saveConfigIndex(index);
    } else {
      const existing = getActivityById(activityData.id);
      if (!existing) return { ok: false, error: '找不到該活動' };
      if (existing.unit !== unit.id) return { ok: false, error: '不可編輯其他單位的活動' };
      saveActivityRecord(activityData);
    }
    return { ok: true, id: activityData.id };
  }
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const activityData = JSON.parse(params.data || '{}');
  if (!activityData.sheetId && activityData.sheetUrl) activityData.sheetId = extractSheetId(activityData.sheetUrl);
  activityData.protectedCategories = activityData.protectedCategories || {};
  activityData.cacheVersion = (activityData.cacheVersion || 0) + 1;
  if (!activityData.id) {
    activityData.id = 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    saveActivityRecord(activityData);
    const index = getConfigIndex(); index.activityIds.push(activityData.id); saveConfigIndex(index);
  } else {
    saveActivityRecord(activityData);
  }
  return { ok: true, id: activityData.id };
}

function handleDeleteActivity(params) {
  if (params.unit && params.unitPwd) {
    const unit = getUnitById(params.unit);
    if (!unit) return { ok: false, error: '找不到該單位' };
    if (!verifyUnitAdminPassword(unit, params.unitPwd)) return { ok: false, error: '單位管理密碼錯誤' };
    const id = params.id; if (!id) return { ok: false, error: '缺少活動 ID' };
    const existing = getActivityById(id); if (!existing) return { ok: false, error: '找不到該活動' };
    if (existing.unit !== unit.id) return { ok: false, error: '不可刪除其他單位的活動' };
    deleteActivityRecord(id);
    const index = getConfigIndex(); index.activityIds = index.activityIds.filter(a=>a!==id); saveConfigIndex(index);
    return { ok: true };
  }
  if (!verifyAdminPassword(params.pwd)) return { ok: false, error: '管理密碼錯誤' };
  const id = params.id; if (!id) return { ok: false, error: '缺少活動 ID' };
  deleteActivityRecord(id);
  const index = getConfigIndex(); index.activityIds = index.activityIds.filter(a=>a!==id); saveConfigIndex(index);
  return { ok: true };
}

function handleGenerateCategoryPassword(params) {
  const actId = params.act; const cat = params.cat;
  if (!actId || !cat) return { ok: false, error: '缺少活動或分類' };
  const activity = getActivityById(actId); if (!activity) return { ok: false, error: '找不到該活動' };
  if (params.unit && params.unitPwd) {
    const unit = getUnitById(params.unit);
    if (!unit) return { ok: false, error: '找不到該單位' };
    if (!verifyUnitAdminPassword(unit, params.unitPwd)) return { ok: false, error: '單位管理密碼錯誤' };
    if (activity.unit !== unit.id) return { ok: false, error: '不可編輯其他單位的活動' };
  } else if (!verifyAdminPassword(params.pwd)) {
    return { ok: false, error: '管理密碼錯誤' };
  }
  activity.protectedCategories = activity.protectedCategories || {};
  const password = generateCategoryPassword();
  activity.protectedCategories[cat] = password;
  activity.cacheVersion = (activity.cacheVersion || 0) + 1;
  saveActivityRecord(activity);
  return { ok: true, password, cat };
}

function handleChangePassword(params) {
  if (!verifyAdminPassword(params.oldPwd)) return { ok: false, error: '舊密碼錯誤' };
  const newPwd = params.newPwd || '';
  if (newPwd.length < 6) return { ok: false, error: '新密碼至少 6 碼' };
  const salt = generateSalt(); const hash = hashPassword(newPwd, salt);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_ADMIN_HASH, hash); props.setProperty(PROP_ADMIN_SALT, salt);
  return { ok: true };
}

/* ===== 儲存工具 ===== */
function getConfigIndex() {
  const props = PropertiesService.getScriptProperties();
  const idxJson = props.getProperty('ACTIVITIES_INDEX');
  if (idxJson) { try { return JSON.parse(idxJson); } catch(e){} }
  const json = props.getProperty(PROP_ACTIVITIES);
  if (json) {
    try {
      const legacy = JSON.parse(json);
      if (legacy.activities || legacy.publicToken) {
        const index = { publicToken: legacy.publicToken || '', units: [], activityIds: [] };
        (legacy.activities || []).forEach(a => { if (a.id) { props.setProperty('ACT_' + a.id, JSON.stringify(a)); index.activityIds.push(a.id); } });
        props.deleteProperty(PROP_ACTIVITIES);
        props.setProperty('ACTIVITIES_INDEX', JSON.stringify(index));
        return index;
      }
    } catch(e) {}
  }
  return { publicToken: generatePublicToken(), units: [], activityIds: [] };
}
function saveConfigIndex(index) {
  PropertiesService.getScriptProperties().setProperty('ACTIVITIES_INDEX', JSON.stringify(index));
}
function getActivityById(actId) {
  const json = PropertiesService.getScriptProperties().getProperty('ACT_' + actId);
  if (!json) return null;
  try { return JSON.parse(json); } catch(e) { return null; }
}
function saveActivityRecord(act) {
  PropertiesService.getScriptProperties().setProperty('ACT_' + act.id, JSON.stringify(act));
}
function deleteActivityRecord(actId) {
  PropertiesService.getScriptProperties().deleteProperty('ACT_' + actId);
}
function getUnitById(unitId) {
  const json = PropertiesService.getScriptProperties().getProperty('UNIT_' + unitId);
  if (!json) return null;
  try { return JSON.parse(json); } catch(e) { return null; }
}
function saveUnitRecord(unit) {
  PropertiesService.getScriptProperties().setProperty('UNIT_' + unit.id, JSON.stringify(unit));
}
function deleteUnitRecord(unitId) {
  PropertiesService.getScriptProperties().deleteProperty('UNIT_' + unitId);
}
function getAllActivities() {
  const index = getConfigIndex();
  return index.activityIds.map(id => getActivityById(id)).filter(a=>a);
}
function verifyAdminPassword(pwd) {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty(PROP_ADMIN_HASH); const salt = props.getProperty(PROP_ADMIN_SALT);
  if (!hash || !salt) return false;
  return verifyPassword(pwd, hash, salt);
}
function hashPassword(pwd, salt) {
  const input = pwd + ':' + salt;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return bytesToHex(digest);
}
function verifyPassword(pwd, hash, salt) { return hashPassword(pwd, salt) === hash; }
function generateSalt() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Math.random().toString(36) + Date.now());
  return bytesToHex(bytes).slice(0,16);
}
function bytesToHex(bytes) { return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join(''); }
function generatePublicToken() { return 'pub_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function generateCategoryPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = ''; for (let i=0;i<6;i++) pwd += chars.charAt(Math.floor(Math.random()*chars.length));
  return pwd;
}
function extractSheetId(url) { const m = (url||'').match(/\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : null; }

function readSpreadsheetData(activity) {
  try {
    const ss = SpreadsheetApp.openById(activity.sheetId);
    let sheet;
    if (activity.sheetName) { sheet = ss.getSheetByName(activity.sheetName); if (!sheet) return { ok: false, error: '找不到指定工作表：' + activity.sheetName }; }
    else sheet = ss.getSheets()[0];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, headers: [], rawRows: [] };
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(h=>String(h).trim());
    const data = sheet.getRange(2,1,lastRow-1,lastCol).getValues();
    const rawRows = data.filter(row => row.some(c => String(c).trim() !== ''))
      .map(row => { const obj = {}; headers.forEach((h,i) => { obj[h] = row[i]; }); return obj; });
    return { ok: true, headers, rawRows };
  } catch (err) { return { ok: false, error: err.toString() }; }
}

function setDefaultAdminPassword() {
  const pwd = 'cyccadmin'; const salt = generateSalt(); const hash = hashPassword(pwd, salt);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_ADMIN_HASH, hash); props.setProperty(PROP_ADMIN_SALT, salt);
  return '管理密碼已設定為 cyccadmin';
}