---
title: "Vue.js BroadcastChannel 跨分頁通訊：從踩坑到 Singleton Event Bus 架構設計"
date: 2026-03-13
tags:
  - Vue.js
  - TypeScript
  - Architecture
categories:
  - 前端架構
---

## 前言

在多分頁的 Web 應用中，跨 Tab 同步狀態是常見需求——例如閒置登出同步、Session 過期通知、T&C 接受後其他 Tab 強制刷新等。瀏覽器原生的 `BroadcastChannel` API 是最直覺的方案，搭配 VueUse 的 `useBroadcastChannel` 封裝更是方便。

但在實際開發中，我們踩了一個非常隱晦的坑——**同一個 Tab 內建立多個 BroadcastChannel 實例，會互相收到訊息**。本文記錄我們從「能用」到「好用」的架構演進過程，並以閒置登出同步為完整業務範例。

<!-- more -->

## 問題場景

想像這樣的狀況：使用者在 Tab A 操作，Tab B、Tab C 是同一個應用的其他頁面。Tab A 觸發了閒置登出，Dialog 彈出，使用者確認登出。但 Tab B 和 Tab C 完全不知道，畫面停在登入後狀態。

更麻煩的是反向情境：**Tab B 剛剛有過操作（5 秒前才點了一個按鈕），但 Tab A 的閒置計時器並不知道，仍然觸發了登出。**

這兩個問題分別是「狀態廣播」和「活動同步」，本文的解法用原生 `BroadcastChannel` API 配合 `localStorage` 一起解決。

---

## 為什麼不用 localStorage + storage event

最常見的跨 Tab 通訊方案是監聽 `storage` event：

```js
window.addEventListener('storage', (event) => {
  if (event.key === 'logout') doLogout();
});
localStorage.setItem('logout', Date.now().toString());
```

這個方案有幾個問題：

1. **訊息語意不清**：`storage` event 是「某個 key 被改了」，而不是「某件事發生了」。
2. **無法傳物件**：只能存字串，`JSON.stringify/parse` 是必要開銷。
3. **狀態殘留**：localStorage 是持久化的，用完還要清理，忘了清理會影響下一次頁面開啟。

`BroadcastChannel` 解決了上述問題：語意上就是「廣播一個事件給其他 Tab」，支援傳遞物件，發送方不會收到自己的訊息，用完 close 即可。

| 特性 | BroadcastChannel | localStorage + storage event |
|------|-----------------|------------------------------|
| 訊息格式 | 任意物件（結構化複製演算法）| 僅字串 |
| 發送方是否收到 | 否 | 否（只有其他 Tab 收到）|
| 狀態持久化 | 否（揮發性訊息）| 是（持久存在）|
| 關閉後行為 | close() 後停止接收 | 持續存在 |
| 瀏覽器支援 | Chrome 54+, Firefox 38+, Safari 15.4+ | 全部 |

---

## BroadcastChannel API 基礎

```mermaid
flowchart LR
    subgraph TabA ["Tab A"]
        BC_A["BC 實例"]
    end
    subgraph TabB ["Tab B"]
        BC_B["BC 實例"]
    end
    BC_A -->|postMessage| BC_B
    BC_B -->|onmessage| BC_A
    TabA ~~~ note["同一個 Channel Name"]
    TabB ~~~ note
```

核心特性：

- **同源限制**：只能在相同 origin 的 Tab 之間通訊
- **發送者不收自己**：`postMessage` 不會觸發**同一個實例**的 `onmessage`
- **多實例陷阱**：但同一 Tab 內如果有**多個 BC 實例**用相同 name，**彼此會收到對方的訊息**

第三點是大多數文章不會提到的關鍵行為，也是我們踩坑的根源。

## 初版設計：直接封裝 VueUse

我們最初用 VueUse 的 `useBroadcastChannel` 做了一個簡單封裝：

```typescript
// useBroadCast.ts
import { useBroadcastChannel } from '@vueuse/core';

export function useBroadcast() {
  const { post, data } = useBroadcastChannel({ name: 'Star4' });
  const sessionTabId = sessionStorage.getItem('currentTabId');
  const currentTabId = ref(sessionTabId);

  if (!currentTabId.value) {
    currentTabId.value = Math.random().toString();
    sessionStorage.setItem('currentTabId', currentTabId.value);
  }

  function sendMessageToOtherTab(key: BroadCastChannelAction, data: string) {
    post({ action: key, data, senderTabId: currentTabId.value ?? '' });
  }

  return { sendMessageToOtherTab, receivedMessage: data, currentTabId };
}
```

在 App.vue 用 watch 集中處理所有訊息：

```typescript
// App.vue — Options API watch
watch: {
  receivedMessage(value) {
    const message = value as BroadCastMessage;
    if (message.senderTabId !== this.currentTabId) {
      switch (message.action) {
        case BroadCastChannelAction.ForceRefresh:
          location.reload();
          break;
        case BroadCastChannelAction.UpdateLastActiveTimeStamp:
          const val = parseInt(message.data) || new Date().getTime();
          useIdleLogoutAction().setLastActiveTimeStamp(val);
          break;
        case BroadCastChannelAction.UpdateShowIdleLogoutDialog:
          const show = JSON.parse(message.data || 'true');
          useIdleLogoutAction().setShowIdleLogoutDialog(show);
          break;
      }
    }
  },
},
```

看起來能用，但隱藏了 5 個問題。

## 問題一：多個 BroadcastChannel 實例的陷阱

`useBroadcast()` 在以下 4 個地方被呼叫：

1. **App.vue** — setup() 裡呼叫，接收訊息
2. **useIdleLogoutAction** — watch callback 裡呼叫，發送閒置狀態
3. **IdleLogoutDialog** — 點擊「繼續使用」時呼叫，發送 ForceRefresh
4. **AcceptTermsAndConditionsDialog** — 接受 T&C 時呼叫，發送 ForceRefresh

VueUse 的 `useBroadcastChannel` 每次呼叫都會 `new BroadcastChannel('Star4')`。當同一個 Tab 裡有 4 個 BC 實例時：

```mermaid
flowchart TD
    subgraph TabA ["Tab A — 4 個 BC 實例"]
        BC1["BC #1<br/>App.vue"]
        BC2["BC #2<br/>IdleLogoutAction"]
        BC3["BC #3<br/>IdleLogoutDialog"]
        BC4["BC #4<br/>TncDialog"]
    end
    BC3 -->|"postMessage()"| BC1
    BC3 -->|"觸發 onmessage"| BC2
    BC3 -->|"觸發 onmessage"| BC4
    BC1 -.-|"同一個 Tab 收到<br/>自己發的訊息！"| BC3
```

BroadcastChannel 的規格是「同一個實例不會收到自己的訊息」，但同一個 Tab 內的**其他實例會收到**！

這就是為什麼程式碼裡需要 `senderTabId` 過濾：

```typescript
if (message.senderTabId !== this.currentTabId) {
  // 過濾掉同一 Tab 內其他實例發出的訊息
}
```

這個 `senderTabId` 機制能 work，但本質上是用 workaround 修補架構問題。

## 問題二：receivedMessage 型別是 any

```typescript
export interface BroadCastChannel {
  sendMessageToOtherTab: (key: BroadCastChannelAction, data: string) => void;
  receivedMessage: any;  // ← 完全失去型別安全
}
```

在接收端：

```typescript
const message = value as BroadCastMessage;  // 手動 type assertion
const val = parseInt(message.data);          // data 永遠是 string，每次手動轉型
const show = JSON.parse(message.data);       // 每個 handler 都要自己 parse
```

沒有型別推導，也無法利用 TypeScript 的 Discriminated Union 做 exhaustive check。

## 問題三：Handler 邏輯集中在 App.vue

所有 action 的處理都寫在 App.vue 的 switch/case 裡：

```typescript
switch (message.action) {
  case BroadCastChannelAction.ForceRefresh:
    // 處理邏輯
    break;
  case BroadCastChannelAction.UpdateLastActiveTimeStamp:
    // 處理邏輯
    break;
  //TODO Add Action here  ← 每次新增功能都要改 App.vue
}
```

- 違反開放封閉原則：新增 action 就要修改 App.vue
- 職責混亂：Idle Logout 的處理邏輯應該在 IdleLogout 相關模組裡，不是 App.vue
- App.vue 膨脹：隨著 action 增加，switch/case 越來越長

## 問題四：沒有瀏覽器支援檢查

VueUse 有回傳 `isSupported`，但完全沒用到。雖然 BroadcastChannel 的瀏覽器支援率已經很高，但在 WebView、某些封裝瀏覽器或 Fallback 場景下仍可能不支援。

## 問題五：watch callback 裡重複建立實例

```typescript
watch(idle, (idleValue) => {
  const { sendMessageToOtherTab } = useBroadcast(); // 每次都建新的 BC 實例
  sendMessageToOtherTab(BroadCastChannelAction.UpdateShowIdleLogoutDialog, ...);
});

watch(lastActive, (lastActiveValue) => {
  const { sendMessageToOtherTab } = useBroadcast(); // 用戶每次操作都觸發
  sendMessageToOtherTab(BroadCastChannelAction.UpdateLastActiveTimeStamp, ...);
});
```

`lastActive` 在用戶有操作時會頻繁觸發，意味著每次滑鼠移動或鍵盤輸入都會建立一個新的 BroadcastChannel 實例。

---

## 改進方案：Singleton + Typed Event Bus

### 核心設計原則

1. **全域只有一個 BroadcastChannel 實例** — 消除 senderTabId workaround
2. **型別安全的 Event Map** — Discriminated Union 取代 string data
3. **Handler 自行註冊** — 各 feature 模組自行 subscribe，不需改 App.vue

### 架構圖

```mermaid
flowchart TD
    subgraph TabA ["Tab A"]
        subgraph bus ["Singleton BroadcastEventBus<br/>唯一的 BC 實例"]
            post["post()"]
            handlers["handlers Map"]
        end
        handlers -->|ForceRefresh| IdleMod["IdleLogoutModule"]
        handlers -->|SyncLastActive| IdleMod
        handlers -->|TncAccepted| TncMod["TncModule"]
    end
    post -->|"postMessage<br/>只送到其他 Tab"| TabB
    subgraph TabB ["Tab B"]
        busBus["Singleton Bus<br/>onmessage → dispatch to handlers"]
    end
```

### Step 1：定義型別安全的 Event Map

用 TypeScript Discriminated Union 取代 `{ action: enum, data: string }`：

```typescript
// typings/broadcast-channel.ts
export enum BroadcastAction {
  ForceRefresh = 'ForceRefresh',
  SyncLastActive = 'SyncLastActive',
  SyncIdleDialog = 'SyncIdleDialog',
}

interface ForceRefreshEvent {
  action: BroadcastAction.ForceRefresh;
}

interface SyncLastActiveEvent {
  action: BroadcastAction.SyncLastActive;
  timestamp: number;
}

interface SyncIdleDialogEvent {
  action: BroadcastAction.SyncIdleDialog;
  show: boolean;
}

export type BroadcastEvent =
  | ForceRefreshEvent
  | SyncLastActiveEvent
  | SyncIdleDialogEvent;

export type BroadcastHandler<A extends BroadcastAction> = (
  event: Extract<BroadcastEvent, { action: A }>
) => void;
```

好處：

- 新增 event 只需擴充 union type，不需要改任何現有程式碼
- handler 的參數型別自動推斷，不需要手動 `parseInt` 或 `JSON.parse`
- TypeScript 會在 compile time 檢查你是否處理了所有 event type

### Step 2：Singleton Event Bus

用 VueUse 的 `createSharedComposable` 確保全域只有一個 BC 實例：

```typescript
// composables/useBroadcastBus.ts
import { useBroadcastChannel, createSharedComposable } from '@vueuse/core';
import { watch } from 'vue';
import type { BroadcastEvent, BroadcastAction, BroadcastHandler } from '../typings/broadcast-channel';

function _useBroadcastBus() {
  const { data, post, isSupported } = useBroadcastChannel<BroadcastEvent>({
    name: 'AppBroadcast',
  });

  const handlers = new Map<BroadcastAction, Set<BroadcastHandler<any>>>();

  watch(data, (event) => {
    if (!event?.action) return;
    const actionHandlers = handlers.get(event.action);
    if (actionHandlers) {
      actionHandlers.forEach((handler) => handler(event));
    }
  });

  function emit(event: BroadcastEvent) {
    if (!isSupported.value) return;
    post(event);
  }

  function on<A extends BroadcastAction>(
    action: A,
    handler: BroadcastHandler<A>,
  ): () => void {
    if (!handlers.has(action)) {
      handlers.set(action, new Set());
    }
    handlers.get(action)!.add(handler);
    return () => {
      handlers.get(action)?.delete(handler);
    };
  }

  return { emit, on, isSupported };
}

export const useBroadcastBus = createSharedComposable(_useBroadcastBus);
```

`createSharedComposable` 的效果：

```typescript
const bus1 = useBroadcastBus(); // 建立實例
const bus2 = useBroadcastBus(); // 回傳同一個實例
bus1 === bus2; // true
```

因為只有一個 BC 實例，同一個 Tab 內不會收到自己的訊息，`senderTabId` 過濾邏輯完全不需要了。

### Step 3：各模組自行註冊 Handler

```typescript
// composables/useIdleLogoutBroadcast.ts
import { onScopeDispose } from 'vue';
import { useBroadcastBus } from './useBroadcastBus';
import { BroadcastAction } from '../typings/broadcast-channel';

export function useIdleLogoutBroadcast() {
  const { emit, on } = useBroadcastBus();

  const offSyncActive = on(BroadcastAction.SyncLastActive, (event) => {
    setLastActiveTimeStamp(event.timestamp); // number，不需要 parseInt
  });

  const offSyncDialog = on(BroadcastAction.SyncIdleDialog, (event) => {
    setShowIdleLogoutDialog(event.show); // boolean，不需要 JSON.parse
  });

  const offForceRefresh = on(BroadcastAction.ForceRefresh, () => {
    setShowIdleLogoutDialog(false);
    location.reload();
  });

  function broadcastLastActive(timestamp: number) {
    emit({ action: BroadcastAction.SyncLastActive, timestamp });
  }

  function broadcastIdleDialog(show: boolean) {
    emit({ action: BroadcastAction.SyncIdleDialog, show });
  }

  function broadcastForceRefresh() {
    emit({ action: BroadcastAction.ForceRefresh });
  }

  onScopeDispose(() => {
    offSyncActive();
    offSyncDialog();
    offForceRefresh();
  });

  return { broadcastLastActive, broadcastIdleDialog, broadcastForceRefresh };
}
```

### Step 4：App.vue — 大幅簡化

```vue
<script setup lang="ts">
import { useIdleLogoutBroadcast } from '@/composables/useIdleLogoutBroadcast';
useIdleLogoutBroadcast();
</script>
```

原本 App.vue 裡 20 行的 watch + switch/case，現在只需要一行。新增功能？建一個新的 composable，在需要的地方呼叫，完全不用改 App.vue。

### Step 5：新增功能示範

假設要新增「用戶在某個 Tab 接受了 T&C，其他 Tab 自動刷新」：

**1. 擴充 Event 型別**

```typescript
interface TncAcceptedEvent {
  action: BroadcastAction.TncAccepted;
  version: string;
}

export type BroadcastEvent =
  | ForceRefreshEvent
  | SyncLastActiveEvent
  | SyncIdleDialogEvent
  | TncAcceptedEvent;   // ← 加這一行
```

**2. 發送端**

```typescript
const { emit } = useBroadcastBus();
emit({ action: BroadcastAction.TncAccepted, version: '2.0' });
```

**3. 接收端**

```typescript
const { on } = useBroadcastBus();
on(BroadcastAction.TncAccepted, (event) => {
  console.log(`T&C version ${event.version} accepted`);
  location.reload();
});
```

不需要改 App.vue，不需要改 useBroadcastBus，不需要改任何現有程式碼。

---

## 閒置登出：完整業務邏輯實作

### useIdleLogoutAction

閒置偵測的核心設計：**不直接以「本 Tab 的計時器」為準**，而是用 localStorage 的 `lastActiveTimeStamp`（由最近活動的 Tab 更新）做真實判斷。這讓「任何一個 Tab 有活動就重置所有 Tab 的閒置計時」成為可能。

```typescript
// composables/useIdleLogoutAction.ts
import { watch } from 'vue';
import { useIdle } from '@vueuse/core';
import { useIdleLogoutBroadcast } from './useIdleLogoutBroadcast';

export const IdleLogoutSetting = {
  idleTime: window.gv.idleTimeMilliseconds || 7200000, // 2 小時
  kickOutTime: 2 * 60 * 1000,                          // 給使用者確認的 2 分鐘
};

export function useIdleLogoutAction() {
  const rootStore = useRootStore();

  const checkMemberActivity = () => {
    if (!rootStore.isLogin) return;

    const systemDialogQueue = useSystemDialogQueueStore();
    const { broadcastLastActive, broadcastIdleDialog } = useIdleLogoutBroadcast();

    // 初始化時：若 localStorage 裡已有登出 flag（可能由其他 Tab 設置）
    // 直接加入 Dialog 隊列，不等閒置計時器
    if (rootStore.isLogin && rootStore.showIdleLogoutDialog) {
      if (!systemDialogQueue.isInQueue(QueueName.IdleLogout)) {
        systemDialogQueue.pushToFirst(QueueName.IdleLogout);
      }
    }

    const { idle, lastActive, reset } = useIdle(IdleLogoutSetting.idleTime);

    watch(idle, (idleValue) => {
      if (idleValue && !rootStore.showIdleLogoutDialog) {
        // 用 localStorage 的 lastActiveTimeStamp 做真實判斷
        // 即使本 Tab 的 useIdle 判斷 idle，但如果其他 Tab 最近有活動就不登出
        const realIdleTime = new Date().getTime() - rootStore.lastActiveTimeStamp;
        const shouldLogout = realIdleTime >= IdleLogoutSetting.idleTime;

        if (!shouldLogout) {
          reset(); // 其他 Tab 有活動，重置本 Tab 的閒置計時器
        } else {
          broadcastIdleDialog(true);
        }
        setShowIdleLogoutDialog(shouldLogout);
      }
    });

    watch(lastActive, (lastActiveValue) => {
      if (lastActiveValue && !rootStore.showIdleLogoutDialog) {
        setLastActiveTimeStamp(lastActiveValue);
        broadcastLastActive(lastActiveValue);
      }
    });
  };

  const setLastActiveTimeStamp = (lastActiveValue: number) => {
    rootStore.lastActiveTimeStamp = lastActiveValue;
    // localStorage 供頁面重整後恢復狀態，BroadcastChannel 供即時同步
    localStorage.setItem('lastActiveTimeStamp', lastActiveValue.toString());
  };

  const setShowIdleLogoutDialog = (showIdleLogoutDialog: boolean) => {
    rootStore.showIdleLogoutDialog = showIdleLogoutDialog;
    localStorage.setItem('showIdleLogoutDialog', showIdleLogoutDialog.toString());

    const systemDialogQueue = useSystemDialogQueueStore();
    if (rootStore.isLogin && showIdleLogoutDialog) {
      systemDialogQueue.pushToFirst(QueueName.IdleLogout);
    } else {
      systemDialogQueue.close();
    }
  };

  const removeIdleLogoutLocalStorage = () => {
    localStorage.removeItem('lastActiveTimeStamp');
    localStorage.removeItem('showIdleLogoutDialog');
  };

  return {
    checkMemberActivity,
    setLastActiveTimeStamp,
    setShowIdleLogoutDialog,
    removeIdleLogoutLocalStorage,
  };
}
```

### 完整資料流

```mermaid
sequenceDiagram
    participant B as Tab B
    participant BC as BroadcastChannel
    participant A as Tab A

    B->>B: 使用者操作 (lastActive = T)
    B->>B: setLastActiveTimeStamp(T)<br/>rootStore + localStorage
    B->>BC: broadcastLastActive(T)
    BC->>A: SyncLastActive
    A->>A: rootStore.lastActiveTimeStamp = T

    Note over A: 2 小時後，useIdle 觸發 idle = true
    A->>A: realIdleTime = now - lastActiveTimeStamp
    alt realIdleTime 小於 2 小時
        A->>A: reset() 重置計時器
    else realIdleTime 大於等於 2 小時
        A->>BC: broadcastIdleDialog(true)
        BC->>B: SyncIdleDialog
        A->>A: showIdleLogoutDialog = true
        B->>B: showIdleLogoutDialog = true
    end
```

### BroadcastChannel 與 localStorage 的責任分工

這是整個架構最重要的設計決策，兩者各有不可替代的場景：

| | BroadcastChannel | localStorage |
|---|---|---|
| 語意 | 事件通知 | 狀態持久化 |
| 對象 | 即時廣播給已開啟的 Tab | 供頁面重整後讀取；供新開啟的 Tab 讀取初始狀態 |
| 生命週期 | 頁面關閉後自動失效 | 永久存在直到 removeItem |
| 清理需求 | 不需要 | 需要在登出時 removeItem |

新開一個 Tab 時，BroadcastChannel 無法得知「過去曾發生什麼」，這時 localStorage 的 `showIdleLogoutDialog` 就是初始狀態的來源。這就是為什麼 `checkMemberActivity` 在初始化時要先讀 `rootStore.showIdleLogoutDialog`（這個值在 App 啟動時從 localStorage 讀取）。

### 邊界情境分析

**情境一：網路斷線重連後**

BroadcastChannel 是 in-browser 機制，不依賴網路，網路斷線不影響跨 Tab 同步。

**情境二：同一個 Tab 重整（F5）**

- `sessionStorage.currentTabId` 保留 → Tab ID 不變
- `localStorage.lastActiveTimeStamp` 保留 → 閒置基準不變
- BroadcastChannel 重新建立 → 自動加入頻道

**情境三：Tab 關閉後重開**

- `sessionStorage` 清除 → 新 Tab ID 生成
- `localStorage` 保留 → 讀取上次的閒置狀態
- 若 `showIdleLogoutDialog = true` 仍在 localStorage → 新 Tab 開啟後立即彈出登出 Dialog

**情境四：多個 Tab 同時達到閒置**

由於每個 Tab 的 `useIdle` 計時略有誤差，可能多個 Tab 在接近的時間都觸發 `idle`。防止機制：`setShowIdleLogoutDialog` 在設定前先檢查 `rootStore.showIdleLogoutDialog`（如果已是 `true`，說明已有 Tab 處理了）。BroadcastChannel 廣播也只在這個值從 `false` 變成 `true` 時才發出。

---

## 改進前後對比

| 面向 | 改進前 | 改進後 |
|------|-------|-------|
| BC 實例數 | 每次 `useBroadcast()` 都建新的，同一 Tab 4+ 個 | 全域唯一 1 個 (`createSharedComposable`) |
| senderTabId | 需要手動過濾同 Tab 訊息 | 不需要，單實例不會收到自己的訊息 |
| 型別安全 | `receivedMessage: any`，手動 `as` 轉型 | Discriminated Union 自動推斷 |
| data 解析 | 每個 handler 手動 `parseInt` / `JSON.parse` | payload 直接是正確型別 |
| 新增 action | 改 App.vue 的 switch/case | 建新 composable，不動現有程式碼 |
| Handler 位置 | 全部集中在 App.vue | 各模組自行管理，職責分離 |
| isSupported | 沒檢查 | emit 內建檢查 |
| 記憶體 | watch callback 裡重複建實例 | 全域唯一，自動 dispose |

## createSharedComposable 原理補充

很多人可能不知道 VueUse 提供了 `createSharedComposable` 這個工具，它的原理很簡單：

```typescript
function createSharedComposable(composable) {
  let state = null;
  let subscribers = 0;

  return () => {
    if (subscribers === 0) {
      state = composable();  // 第一次呼叫才真正執行
    }
    subscribers++;

    onScopeDispose(() => {
      subscribers--;
      if (subscribers === 0) {
        state = null;  // 最後一個使用者離開時清理
      }
    });

    return state;  // 所有呼叫者共享同一個 state
  };
}
```

用它包裝 composable 就能確保：

- 第一次呼叫才真正建立 BC 實例
- 後續呼叫回傳同一個實例
- 所有使用者都 unmount 後自動清理

## 適用場景

這套 Singleton Event Bus 模式適用於任何需要跨 Tab 同步的場景：

- **閒置登出同步**：一個 Tab 偵測到閒置，所有 Tab 同步顯示 dialog
- **登入/登出同步**：一個 Tab 登出，其他 Tab 強制刷新
- **即時資料同步**：A Tab 修改了設定，B Tab 自動更新
- **T&C 接受通知**：A Tab 接受條款，B Tab 不再顯示彈窗
- **Domain 切換**：後台切換 Domain 後，所有 Tab 同步導向新 Domain
- **主題切換**：A Tab 切換深色模式，其他 Tab 同步

## 結語

BroadcastChannel API 本身設計簡潔，但「多實例同 Tab 互相觸發」這個行為非常容易讓人忽略。直接封裝 VueUse 的 `useBroadcastChannel` 雖然能快速上手，但在多處呼叫的情境下會造成不必要的實例膨脹和 workaround。

關鍵改進：

- **createSharedComposable** — 一行解決多實例問題
- **Discriminated Union** — 型別安全，compile time 檢查
- **Handler 註冊機制** — 開放封閉原則，新功能不改舊程式碼

最終的結果是一個 30 行的 Singleton Event Bus，取代了原本散落在多個檔案、需要 senderTabId workaround 的實作。閒置登出的實際業務邏輯也透過 `lastActiveTimeStamp` 的跨 Tab 同步，解決了「其他 Tab 有操作但本 Tab 仍觸發登出」的問題。
