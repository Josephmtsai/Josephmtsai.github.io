---
title: "Nuxt 3 實戰：用 Composable 封裝集中式請求攔截器"
date: 2026-04-10 11:30:00
tags:
  - Nuxt3
  - Vue3
  - TypeScript
  - Composable
  - Fetch
  - Interceptor
categories:
  - 前端架構
---

在 Nuxt 3 中，直接使用 `useFetch` 或 `$fetch` 發 API 請求雖然方便，
但在真實專案中你很快會遇到這些問題：

- Loading 狀態分散在每個 component
- 401 / 403 處理邏輯到處重複
- Toast 錯誤通知散落各處難以維護

解決方案：將這些**橫切關注點（cross-cutting concerns）** 集中到一個 composable。

<!-- more -->

## 問題描述

**問題一：Loading 狀態分散**
```vue
<!-- ❌ 每個 component 都要手動管理 loading -->
<script setup>
const isLoading = ref(false);

async function fetchData() {
  isLoading.value = true;
  const data = await $fetch('/api/xxx');
  isLoading.value = false;
}
</script>
```

**問題二：401/403 處理重複**
```typescript
// ❌ 每個請求都要個別處理 401
const { data, error } = await useFetch('/api/xxx');
if (error.value?.statusCode === 401) {
  navigateTo('/logout'); // 每個地方都要寫一遍
}
```

**問題三：錯誤通知邏輯散落各處**
```typescript
// ❌ Toast 通知散落在每個 component 裡
if (error.value?.statusCode === 403) {
  toast.add({ severity: 'error', summary: 'Forbidden' }); // 重複寫
}
```

---

## 架構設計

```mermaid
flowchart LR
    subgraph Components["Vue Components"]
        C1[PageA.vue]
        C2[PageB.vue]
        C3[PageC.vue]
    end

    subgraph Composable["useFetchWithLoading (Interceptor)"]
        I1[onRequest\n顯示 Loading]
        I2[onResponse\n隱藏 Loading\n處理 401]
        I3[onResponseError\n隱藏 Loading\n處理 403 Toast]
    end

    subgraph Store["Pinia Stores"]
        S1[LoadingMaskStore\nQueue 管理]
    end

    subgraph Server["Nuxt 3 Server"]
        A1[API Endpoint]
    end

    subgraph UI["UI Feedback"]
        U1[Loading Mask]
        U2[Toast Notification]
        U3[Redirect /logout]
    end

    C1 --> Composable
    C2 --> Composable
    C3 --> Composable
    Composable --> A1
    I1 --> S1
    I2 --> S1
    I3 --> S1
    S1 --> U1
    I2 -- 401 --> U3
    I3 -- 403 --> U2

    style Composable fill:#4f46e5,color:#fff
    style S1 fill:#7c3aed,color:#fff
```

---

## 完整實作（`composables/useFetchWithLoading.ts`）

```typescript
import { type UseFetchOptions } from '#app';
import { useLoadingMaskStore } from '@/stores/loading-mask';
import { Resource } from '@/constants/resource.constant';

export function useFetchWithLoading<T>(
  url: string | (() => string),
  options: UseFetchOptions<T> = {}
) {
  return useFetch(url, {
    // 保留外部傳入的所有選項（headers、query、body 等）
    ...options,

    // ── Hook 1：請求發出前 ──
    onRequest({ request, options }) {
      console.log('[fetch request]');

      // process.client 確保只在瀏覽器端執行（Nuxt SSR 安全）
      if (process.client) {
        const loadingMaskStore = useLoadingMaskStore();
        loadingMaskStore.showLoadingMask(); // Queue +1
      }
    },

    // ── Hook 2：請求錯誤（網路層錯誤，例如無法連線） ──
    onRequestError({ request, options, error }) {
      console.log('[fetch request error]');
      // 目前記錄 log，可擴充為顯示「網路連線失敗」提示
    },

    // ── Hook 3：收到 Response（包含 4xx、5xx） ──
    onResponse({ request, response, options }) {
      console.log('[fetch response]');

      if (process.client) {
        const loadingMaskStore = useLoadingMaskStore();
        loadingMaskStore.hideLoadingMask(); // Queue -1

        if (response.status === 401) {
          // 判斷是 Session 過期（一般 401）還是 IOWB 特殊錯誤碼（帶 error_code）
          if (response.statusText.includes('error_code')) {
            // IOWB 登入失敗，帶 error_code 參數到 /logout 頁面顯示對應錯誤訊息
            navigateTo(`/logout?${response.statusText}`);
          } else {
            // 一般 Session 過期
            alert(Resource.SessionExpired);
            navigateTo(`/logout`);
          }
        }
      }
    },

    // ── Hook 4：Response 處理錯誤（4xx/5xx 由 useFetch 拋出時） ──
    onResponseError({ request, response, options }) {
      console.log('[fetch response error]');

      if (process.client) {
        const loadingMaskStore = useLoadingMaskStore();
        loadingMaskStore.hideLoadingMask(); // 確保 loading 被關閉

        try {
          const { showError } = useCustomToast();
          if (response?.status === 403) {
            // 403 Forbidden：顯示 toast 通知（不跳轉，讓使用者知道權限不足）
            showError((response as any)._data?.message || response.statusText || 'Forbidden');
          }
        } catch {
          // 若 toast 元件不可用（例如 SSR 階段），靜默處理
        }
      }
    },
  });
}
```

---

## 請求生命週期完整流程

```mermaid
flowchart TD
    A[Component 呼叫\nuseFetchWithLoading] --> B[onRequest\nLoadingMask Queue +1\n顯示 Loading Mask]

    B --> C[發送 HTTP 請求]

    C --> D{請求成功？}

    D -- 網路失敗 --> E[onRequestError\n記錄 log]

    D -- 收到 Response --> F[onResponse\nLoadingMask Queue -1]

    F --> G{HTTP Status?}

    G -- 200 OK --> H[正常返回資料\nLoading 隱藏]

    G -- 401 Unauthorized --> I{statusText 包含\nerror_code?}
    I -- Yes --> J[navigateTo\n/logout?error_code=2\n顯示特定錯誤訊息]
    I -- No --> K[alert: Session Expired\nnavigateTo /logout]

    G -- 403 Forbidden --> L[onResponseError\nshowError Toast\n顯示無權限訊息]

    G -- 5xx Server Error --> M[onResponseError\nLoading 隱藏\n可擴充錯誤處理]

    style B fill:#4f46e5,color:#fff
    style H fill:#22c55e,color:#fff
    style J fill:#ef4444,color:#fff
    style K fill:#ef4444,color:#fff
    style L fill:#f59e0b,color:#fff
```

---

## 使用範例

### 基本使用（替換原生 `useFetch`）

```typescript
// ❌ 原始 useFetch（無攔截）
const { data, error } = await useFetch('/api/promotion/overview');

// ✅ 使用 useFetchWithLoading（自動 loading + 401/403 處理）
const { data, error } = await useFetchWithLoading('/api/promotion/overview');
```

### 帶查詢參數

```typescript
const { data } = await useFetchWithLoading('/api/member/summary', {
  query: {
    page: 1,
    size: 20,
    status: 'active',
  },
});
```

### POST 請求

```typescript
const { data, error } = await useFetchWithLoading('/api/promotion/create', {
  method: 'POST',
  body: {
    name: '春節活動',
    startDate: '2026-01-20',
  },
});
```

### 動態 URL（Reactive）

```typescript
const memberId = ref('U001');

// URL 會隨 memberId 自動重新請求
const { data } = await useFetchWithLoading(
  () => `/api/member/${memberId.value}/detail`
);
```

---

## 401 的兩種處理情境

本系統有兩種 401 情境，處理方式不同：

```mermaid
sequenceDiagram
    participant F as useFetchWithLoading
    participant S as Nuxt Server
    participant U as User

    Note over F,S: 情境一：一般 Session 過期

    F->>S: API Request
    S-->>F: 401 (statusText: "session_expired")
    F->>F: onResponse: status === 401
    F->>F: !statusText.includes('error_code')
    F->>U: alert("Session Expired")
    F->>U: navigateTo('/logout')

    Note over F,S: 情境二：IOWB Token 登入失敗

    F->>S: GET /api/login-from-iowb?token=xxx
    S-->>F: 401 (statusText: "error_code=2")
    F->>F: onResponse: status === 401
    F->>F: statusText.includes('error_code')
    F->>U: navigateTo('/logout?error_code=2')
    Note over U: /logout 頁面根據\nerror_code 顯示對應訊息
```

---

## useCustomToast 整合

```typescript
// composables/useCustomToast.ts
export function useCustomToast() {
  const toast = useToast(); // PrimeVue Toast

  return {
    showError(message: string, summary = 'Error') {
      toast.add({
        severity: 'error',
        summary,
        detail: message,
        life: ToastHiddenMilliseconds,
      });
    },
    showSuccess(message: string, summary = 'Success') { /* ... */ },
    showInfo(message: string, summary = 'Info') { /* ... */ },
    showWarn(message: string, summary = 'Warning') { /* ... */ },
  };
}
```

在 `useFetchWithLoading` 中，403 錯誤會自動呼叫 `showError`，
Component 完全不需要知道這件事。

---

## 擴充點：加入更多攔截邏輯

當你需要擴充更多全域行為時，只需修改 `useFetchWithLoading` 一個地方：

```typescript
// 擴充範例：加入 CSRF Token 自動附加
onRequest({ options }) {
  options.headers = {
    ...options.headers,
    'X-CSRF-Token': getCsrfToken(),
  };
  loadingMaskStore.showLoadingMask();
},

// 擴充範例：加入全域 retry 機制
onResponseError({ response }) {
  if (response?.status === 503) {
    showWarn('系統維護中，請稍後再試');
  }
},
```

---

## 小結

`useFetchWithLoading` 是一個**薄薄的攔截層**，職責非常明確：

| Hook | 職責 |
|------|------|
| `onRequest` | Loading Queue +1（顯示 Loading）|
| `onRequestError` | 記錄網路層錯誤 log |
| `onResponse` | Loading Queue -1（隱藏 Loading）+ 401 登出處理 |
| `onResponseError` | Loading Queue -1 + 403 Toast 通知 |

這個模式的設計哲學：

> **Components 只關心「要請求什麼資料」，不關心「請求過程中發生了什麼」。**
> 請求的橫切關注點（loading、auth、error feedback）由 composable 層統一處理。

結合完整架構：
- **後端** `defineLogAndAuthHandler` HOF → 統一 Auth + Logging
- **前端** `useFetchWithLoading` Composable → 統一 Loading + Error Handling
- **前端** Queue-based Loading Mask → 解決並發請求的 UX 問題

這三層架構共同構成了一個**從 UI 到 Server 的完整請求管理體系**。
