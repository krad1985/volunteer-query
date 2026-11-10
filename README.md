# 通用義工報名查詢 / 統計系統

將 Google Form 報名回覆（Google Sheet）轉為可查詢、可統計的網頁系統，供各小組幹部查詢招募狀況，並產出護持團隊 / 餐飲組 / 住宿組所需的統計報表。

## 架構

- 前端：靜態 HTML/JS（可部署 GitHub Pages / Vercel）
- 後端：Google Apps Script (GAS) Web App，直接讀取 Google Sheet
- 設定：活動 / 欄位對應存於 GAS ScriptProperties（仿 classified-query）

## 檔案

- `index.html` 查詢頁
- `report.html` 統計報表頁
- `admin.html` 管理後台
- `gas/Code.js` GAS 後端
- `gas/appsscript.json` GAS 設定

## 部署

1. `cd gas && clasp push && clasp deploy`
2. 將部署 URL 填入 `js/config.js` 的 `GAS_URL`
3. 部署前端靜態檔

## 欄位對應

活動建立時，管理員測試連線取得 Sheet 欄位，指派：
- 大組 / 小組 / 身分別 / 性別 / 出生年 / 姓名 / 電話
- 日期群組（自動偵測）：每一個活動日的 進駐(attendance)、早餐、午餐、晚餐、住宿 欄位

統計報表：
1. 整體人力：各大組/小組人數（男/女/幹部/一般義工）+ 每日 manpower（分男女）
2. 用餐狀況：各大組/小組每日早/午/晚用餐人數（分男女）
3. 住宿狀況：各大組/小組每日住宿人數（分男女）+ 最大床位需求

## 未來擴充

- 定期快取至資料庫（Neon/Postgres）以加速
- 內建報名問卷設計（表單範本）
- 單位隔離、分類密碼（已沿用 classified-query 機制）