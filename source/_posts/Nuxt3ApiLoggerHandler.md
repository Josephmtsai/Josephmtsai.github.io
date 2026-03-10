---
title: 在 Nuxt 3 中打造統一的 API Handler：認證、日誌與錯誤處理的優雅封裝
date: 2026-01-20
tags:
  - Nuxt3
  - TypeScript
  - API Design
  - Backend
  - Log
  
categories:
  - 前端架構

---
## 前言
在開發後台管理系統時，我們經常會遇到一個問題：每個 API Handler 都需要處理**認證驗證**、**日誌記錄**、**錯誤捕獲**等重複性邏輯。如果在每個檔案中都寫一遍，不僅冗長，還容易遺漏。
本文將介紹如何在 Nuxt 3 的 Server API 中，利用 **Higher-Order Function (高階函式)** 的概念，打造一個統一的 `defineLogAndAuthHandler`，讓所有 API 自動擁有以下功能：
- ✅ Session 認證與過期檢查
- ✅ 請求/回應日誌記錄
- ✅ 敏感資料自動遮蔽
- ✅ 效能監控 (API 執行時間)
- ✅ 統一錯誤處理與格式化

## 核心概念：Higher-Order Function
在 JavaScript/TypeScript 中，**高階函式 (HOF)** 是指「接收函式作為參數」或「回傳函式」的函式。我們的設計正是利用這個概念：

```typescript
export const defineLogAndAuthHandler = <T extends EventHandlerRequest>(
  handler: EventHandler<T>
): EventHandler<T> => defineEventHandler<T>(async (event) => {
  // 在這裡加入認證、日誌等邏輯
  const response = await handler(event); // 執行原本的 Handler
  // 在這裡加入回應處理邏輯
  return response;
});
這就像是在原本的 API Handler 外面「包一層糖衣」，讓它自動具備額外的能力。

功能拆解
1. Session 認證與過期檢查
// 檢查是否已認證
if (!event.context?.session?.isAuthenticated && !isPublicRoute) {
  return createError({
    statusCode: 401,
    statusText: 'Session Expired',
  });
}
// 檢查 Session 是否已過期
const currentTime = new Date().getTime();
const lastLoginTimestamp = event.context?.session?.lastLoginTime;
const maxTimeDiff = (currentTime - lastLoginTimestamp) / 1000;
if (maxTimeDiff >= parseInt(maxExpiryInSeconds, 10)) {
  // 清除 Session 並回傳 401
  event.context.session.isAuthenticated = false;
  return createError({ statusCode: 401, statusText: 'Session Expired' });
}
設計重點：

白名單機制：登入、登出等 API 不需要認證
雙重檢查：不只檢查是否登入，還檢查 Session 是否超時
2. 請求日誌記錄與敏感資料遮蔽
const ignoreLogParams = ['password', 'newPassword', 'oldPassword'];
// 遮蔽敏感欄位
if (typeof body === 'object') {
  const filterBody = Object.assign({}, body);
  for (const key in filterBody) {
    if (ignoreLogParams.includes(key)) {
      filterBody[key] = '***mask***';
    }
  }
  logger.log('info', `[POST] ${JSON.stringify(filterBody)}`);
}
設計重點：

自動遮蔽密碼等敏感欄位，避免日誌外洩
支援 GET/POST/PUT/DELETE 不同方法的日誌格式
3. 效能監控
const startTime = Date.now();
const response = await handler(event);
const endTime = Date.now();
const duration = endTime - startTime;
logger.performance.log('info', `[${pathWithoutQueryString}] [${duration}ms]`);
設計重點：

記錄每個 API 的執行時間
方便後續分析效能瓶頸
4. 回應日誌與大型回應處理
const byPassLogUrls = ['/api/general/settings', '/api/promotion/promotions'];
function truncateString(body: string) {
  const resultSizeLimit = 1024;
  const stringSize = Buffer.byteLength(body);
  
  if (stringSize > resultSizeLimit) {
    return `Result size - ${stringSize} bytes`;
  }
  return body;
}
設計重點：

大型回應只記錄大小，避免日誌檔案爆炸
特定 API 可跳過輸出日誌（如設定檔、大量資料查詢）
5. 統一錯誤處理
catch (error: any) {
  console.error('API Error:', error);
  
  logger.error.log('error', `URL: ${event.path}, Message: ${error.message}`);
  
  return createError({
    statusCode: error.statusCode || 500,
    statusMessage: error.statusMessage || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
  });
}
設計重點：

所有未捕獲的異常都會被統一處理
錯誤資訊會被記錄到日誌中，方便追蹤
使用方式
使用這個封裝後，原本的 API Handler 變得非常簡潔：

// server/api/member/summary.get.ts
import { GetMemberSummary } from '@/bospi/GetMemberSummary';
export default defineLogAndAuthHandler(async (event) => {
  const query = getQuery(event);
  const api = new GetMemberSummary();
  const response = await api.getMemberSummary(query);
  return response.data;
});
只需要專注在業務邏輯，認證、日誌、錯誤處理全部自動搞定！

架構圖
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              defineLogAndAuthHandler (Wrapper)           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 1. Session 認證檢查                                  ││
│  │ 2. 請求日誌記錄 (含敏感資料遮蔽)                      ││
│  │ 3. 效能計時開始                                      ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │           實際的 API Handler (業務邏輯)              ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 4. 效能計時結束                                      ││
│  │ 5. 回應日誌記錄                                      ││
│  │ 6. 錯誤捕獲與格式化                                  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend SPI (ASP.NET)                 │
└─────────────────────────────────────────────────────────┘


這個設計模式其實就是 AOP (Aspect-Oriented Programming) 的體現——將「橫切關注點」（如日誌、認證、錯誤處理）從業務邏輯中抽離出來。

