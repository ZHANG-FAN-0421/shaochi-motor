# 紹馳車業維修管理系統

這是一套純前端的機車維修管理系統，可直接部署到 GitHub Pages。

## 功能

- 登入
- 接車建單
- 車牌自動格式化，支援 `AAA-1111` 與 `AAA-111`
- 維修工單
- 估價單
- 品項管理
- 客戶車輛資料
- 維修紀錄查詢
- 營收統計
- JSON 匯入 / 匯出備份
- 多機連線雲端同步

## 登入

```text
帳號：Zhangfan
密碼：zhangfan0421
```

## 部署

把整個資料夾上傳到 GitHub repository 後，在 GitHub Pages 設定：

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/root`

完成後即可用 GitHub Pages 網址開啟 `index.html`。

## 多機連線

系統的「多機連線」需要 Google Apps Script Web App URL。

1. 到 Google Apps Script 建立新專案
2. 貼上 `shaochi-cloud-sync-apps-script.js` 的內容
3. 部署為 Web App
4. 權限選「任何知道連結的人」
5. 將 Web App URL 貼到系統的「多機連線」
6. 開啟「自動上傳與自動下載」
