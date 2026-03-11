---
title: ERR_CONTENT_DECODING_FAILED — 當 Status 200 卻解碼失敗的踩坑紀錄
date: 2026-03-10 11:02:34
tags:
  - ERR_CONTENT_DECODING_FAILED
  - Nuxt3
  - Client Side Error
  - Gzip
categories:
  - Troubleshooting
---

## 前言

之前在正式環境遇到一個棘手的問題：使用者回報某支 API 回傳 HTTP 200，瀏覽器卻直接噴出 `ERR_CONTENT_DECODING_FAILED`。當下排查了很久才發現問題出在 Response Header 中多了一個不該出現的 `gzip`，特別記錄一下整個排查過程。

{% asset_img 1.png "異常 API 的 Response Headers" %}
{% asset_img 2.png "正常 API 的 Response Headers" %}

## 問題現象

打開 DevTools 檢查異常 API 的 Response Headers，可以看到幾個關鍵資訊：

- `Content-Encoding: gzip` — 伺服器宣稱回傳內容經過 gzip 壓縮
- `Transfer-Encoding: chunked` — 資料以分段方式傳輸
- `X-Powered-By: ASP.NET` — 請求可能直接打到後端 .NET 伺服器，或經過了某層 Proxy 轉發

## 問題核心：空 Body + gzip 標頭

瀏覽器收到 `Content-Encoding: gzip` 後，會自動嘗試用 gzip 解碼器解壓內容。但實際上這支 API 的 Response Body 是空的（長度為 0），解碼器無法處理一個空的壓縮流，因此直接報出 `ERR_CONTENT_DECODING_FAILED`。

為什麼 Body 會是空的？根據 Header 中的 `X-Powered-By: ASP.NET`，可能有兩種原因：

1. **後端程式異常中斷** — ASP.NET 拋出 Exception 後沒有回傳 500，而是直接結束了 Response，導致 Body 為空。
2. **查詢超時** — 後端資料庫查詢耗時過久，連線中斷，最終只傳回了 Headers 就結束了。

## 關鍵線索：對比正常與異常的 API

進一步對比同專案中兩支 API 的 Response Headers，差異一目了然：

| 欄位 | 異常 API | 正常 API |
|------|---------|---------|
| Content-Encoding | gzip | (無) |
| X-Powered-By | ASP.NET | (無) |
| X-Aspnet-Version | 4.0.30319 | (無) |

正常的 API 回傳的 Headers 很乾淨，是經過 Nuxt BFF（Node.js）處理後回傳的；而異常的 API 卻直接暴露了 ASP.NET 的資訊。這代表：

- **情況 A**：這支 API 繞過了 Nuxt BFF，直接打到了後端 .NET 伺服器。
- **情況 B**：後端 .NET 伺服器強制啟動了 gzip 壓縮，但因資料量過大或超時導致傳輸中斷，最終變成「空 Body + gzip 標頭」的組合。

## 真相：Nitro 透傳 Response 物件導致 gzip 標頭外洩

後端伺服器其實**沒有噴錯**，它正常回傳了資料（只是內容為空陣列或空物件）。真正的問題出在 Nuxt Server（Nitro）端的 API Handler 寫法。

檢查 Server 端程式碼後，發現異常的 API Handler 是這樣寫的：

```typescript
const response = await api.memberGetMemberPriorityHistories(query);
return response; // 直接回傳整個 Response 物件
```

這裡 `api.memberGetMemberPriorityHistories()` 回傳的是一個繼承自原生 `Response` 的物件。當直接 `return response` 時，Nitro 引擎會將其視為**透傳（Proxy）**，把後端的所有原始標頭原封不動地轉發給瀏覽器。

整個流程是這樣的：

1. 後端 ASP.NET 回傳帶有 `Content-Encoding: gzip` 的壓縮內容
2. Nuxt Server（Node.js）在接收時**已經自動解壓了 gzip 內容**
3. 但因為直接 `return response`，Nitro 把後端的原始 Headers（包含 `Content-Encoding: gzip`）照搬給瀏覽器
4. 瀏覽器收到 `Content-Encoding: gzip` 標頭，嘗試解壓 Body —— 但 Body 早就被 Node.js 解壓過了，已經不是 gzip 格式
5. 解碼失敗，噴出 `ERR_CONTENT_DECODING_FAILED`

簡單來說：**gzip 被 Nuxt Server Side 解開了一次，但 gzip 標頭卻還在，瀏覽器又試圖解第二次，自然就失敗了。**

這也解釋了為什麼對比表中異常 API 會帶有 `X-Powered-By: ASP.NET` 和 `X-Aspnet-Version` — 這些都是後端的原始標頭被透傳出來的結果。

## 修正方式

根因找到後，修正方式很明確：**不要直接回傳整個 Response 物件，改為只回傳 `response.data`。** 這樣 Nitro 會重新封裝成乾淨的 JSON Response，由 Nuxt 統一處理壓縮，後端的 ASP.NET 標頭就不會外洩。

修改前：

```typescript
export default defineLogAndAuthHandler(async (event) => {
  const query = getQuery(event);
  const api = new GetMemberPriorityHistories();
  const response = await api.memberGetMemberPriorityHistories(query);
  return response; // 透傳整個物件，標頭外洩
});
```

修改後：

```typescript
export default defineLogAndAuthHandler(async (event) => {
  const query = getQuery(event);
  const api = new GetMemberPriorityHistories();
  const response = await api.memberGetMemberPriorityHistories(query);
  return response.data; // 只回傳資料，Nitro 重新封裝 JSON
});
```

這個修正需要**系統性地檢查所有 Server API Handler**，只要有直接 `return response` 的地方都應該改為 `return response.data`，避免同樣的問題在其他 API 上重演。

## 結論

這個問題的根因不在後端、也不在前端元件，而是 **Nuxt Server（Nitro）的 API Handler 直接透傳了後端 Response 物件**。Node.js 在接收後端回應時已經解開了 gzip，但透傳卻把原始的 `Content-Encoding: gzip` 標頭一併帶給瀏覽器，導致瀏覽器嘗試二次解壓而失敗。

排查這類問題的關鍵：**對比正常與異常 API 的 Response Headers**。當你發現某支 API 突然多了 `X-Powered-By: ASP.NET` 和 `Content-Encoding: gzip`，而其他 API 都沒有，很可能就是 Nitro 把後端的原始標頭透傳出來了。回去檢查 Server API Handler 的回傳值，把 `return response` 改成 `return response.data` 就能解決。