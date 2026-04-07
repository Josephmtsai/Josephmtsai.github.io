---
title: "Login MFA — 新裝置驗證架構設計 "
date: 2026-03-28
tags:
  - .NET
  - MFA
  - Security
  - Redis
  - Vue3
  - Authentication
categories:
  - 後端架構
---

## 背景

傳統登入只驗證帳號 + 密碼，一旦帳密外洩即全面失守。本需求在既有登入流程中加入第二層驗證（MFA）：在使用者完成密碼驗證後、正式取得 Passport 之前，須通過以下其中一種驗證：

| 方法 | 說明 |
|------|------|
| Push Notification | 向已登入的可信裝置推播，由舊手機批准 |
| Email OTP | 發送一次性驗證碼到註冊信箱 |
| TOTP | 使用 Authenticator App（時間型）驗證碼 |

**驗證優先級**：Push Notification > Email OTP > TOTP（`availableMethods[0]` 為預設）

## 核心設計決策：Passport 在驗證成功後才產生

```mermaid
flowchart LR
    subgraph Legacy["傳統做法 有安全風險"]
        L1[Login API] --> L2[驗證帳密]
        L2 --> L3[立即回傳 Passport]
        L3 --> L4[前端再做 MFA]
    end
    subgraph CC["CC1-4638 做法"]
        C1[Login API] --> C2[驗證帳密]
        C2 --> C3["returnCode 0018 不含 Passport"]
        C3 --> C4[MFA 驗證通過]
        C4 --> C5[產生 Passport]
        C5 --> C6[PostLogin]
    end
```

這確保未完成 MFA 的使用者無法取得任何有效 Passport。

<!-- more -->

## 整體三段式流程

```mermaid
sequenceDiagram
    participant FE as Frontend_Vue3
    participant Login as UserLogin_API
    participant MFA as OTP_API
    participant Post as PostLogin_API
    participant Redis as Redis_OTT
    participant BO as BO_API

    FE->>Login: 帳號 密碼 BlackBox
    Login->>Login: 驗證帳密 UserLoginManager
    Login->>MFA: HandleLoginMfaFlow
    MFA->>BO: NewDeviceCheck 取得可用 MFA 方法
    BO-->>MFA: availableMethods
    MFA->>Redis: 寫入 MFA ActiveSession AccountId MfaContext TTL 30min
    MFA-->>Login: LoginResult 需要 MFA
    Login-->>FE: returnCode 0018 verificationId accountId availableMethods 不含 Passport

    FE->>MFA: triggerLoginVerification
    MFA->>Redis: Rate Limit 檢查
    MFA->>BO: 發送 OTP 或 Push
    BO-->>MFA: SecurityCodeId
    MFA-->>FE: Id ExpiryTime MaskedEmail

    FE->>MFA: verifyLoginVerification
    MFA->>Redis: 讀取 MFA ActiveSession
    MFA->>MFA: 比對 VerificationId 踢單檢查
    MFA->>BO: 校驗驗證碼
    BO-->>MFA: 驗證成功
    MFA->>MFA: 產生 Passport
    MFA->>MFA: CompleteLoginProcess
    MFA->>Redis: 清理 MFA Session
    MFA-->>FE: passport recDomain ReachLimitTrustedDevice

    FE->>Post: postLogin passport
    Post-->>FE: 登入完成 建立 Web Session
```

## Redis 會話設計

### MfaContext — 會話核心

```csharp
public class MfaContext
{
    // ── 會話識別 ──────────────────────────────────────
    public string VerificationId { get; set; }  // GUID，踢單關鍵
    public long AccountId { get; set; }
    public string LoginId { get; set; }
    public string MemberCode { get; set; }
    public List<recDomain> RecDomain { get; set; }
    public bool IsVerified { get; set; }  // 防重放攻擊，驗證後設為 true

    // ── 環境資訊（Kafka log / 風控用）────────────────────
    public string ClientIP { get; set; }
    public string UserAgent { get; set; }
    public string CountryCode { get; set; }
    public string City { get; set; }
    public string BlackBox { get; set; }  // 驗證成功後執行 FireBBoxAsLogin

    // ── 裝置資訊（App 專用）──────────────────────────────
    public string FingerPrintId { get; set; }
    public string DeviceId { get; set; }
    public string DeviceModel { get; set; }
    public int DeviceType { get; set; }

    // ── 擴展登入資訊（OAuth / WebAuthn）─────────────────
    public int? OAuthType { get; set; }
    public string OAuthId { get; set; }
    public string WebAuthnCredentialId { get; set; }
}
```

### Redis Key 一覽

| Key Pattern | Value | TTL | 用途 |
|-------------|-------|-----|------|
| `MFA:ActiveSession:{AccountId}` | `MfaContext` JSON | 30 min | 會話主體（踢單、驗證一致性） |
| `MFA:LoginGrant:{GrantId}` | `MfaContext` snapshot | 1 min | WebView→App 交接（選配） |
| `LoginVerification_Verify:{AccountId}` | 失敗次數 | 30 min | 暴力破解防護 |
| `LoginVerification_Resend:{AccountId}` | 發送次數 | 30 min | 發送頻率限制 |

## 踢單機制（最後一跳有效）

多視窗或多裝置同時登入時，同一 `AccountId` 的 Redis key 會被後來的登入覆寫，**只保留最新一筆 `VerificationId`**。

```mermaid
sequenceDiagram
    participant WinA as 視窗A
    participant WinB as 視窗B
    participant Redis as Redis
    WinA->>Redis: 寫入 Context VerificationId aaa
    WinB->>Redis: 覆寫 Context VerificationId bbb
    WinA->>Redis: 驗證時帶 aaa
    Redis-->>WinA: 目前為 bbb Mismatch
    Note over WinA: 回傳 Overridden
    WinB->>Redis: 驗證時帶 bbb
    Redis-->>WinB: 一致 可取得 Passport
```

**實作**：`SetStrToOTTRedis(key, json, 30, overwriteKey: true)` 覆寫操作是原子性的，確保踢單安全。

## 安全防護：Rate Limit 雙重保護

```mermaid
flowchart TD
    T[triggerLoginVerification] --> RC[責任鏈]
    RC --> S1{Resend 發送次數 小於 5}
    S1 -->|超過| E1[ResendLimitReached 鎖定 30 分鐘]
    S1 -->|通過| S2{Verify 驗證失敗次數 小於 5}
    S2 -->|超過| E2[VerificationLocked 鎖定 30 分鐘]
    S2 -->|通過| OK[呼叫 BO 發送驗證碼]

    V[verifyLoginVerification] --> VS1{Context 存在且 VerificationId 一致}
    VS1 -->|不存在| E3[SessionExpired]
    VS1 -->|Id 不符| E4[Overridden 已被其他登入覆蓋]
    VS1 -->|通過| VS2{驗證碼正確}
    VS2 -->|錯誤| INC[計數加一 累計大於等於 5 則 VerificationLocked]
    VS2 -->|正確| SUC[產生 Passport MarkMfaSessionAsVerified]
```

### 責任鏈實作

```csharp
// LoginMfaManager.TriggerLoginVerificationAsync()
var chain = new MfaResendLimitStep(
    new GenerateLoginVerificationCodeStep(null));
var checkResult = await chain.ProcessAsync(ctx);
```

**`MfaResendLimitStep`**：檢查 `LoginVerification_Resend:{AccountId}` 計數  
**`GenerateLoginVerificationCodeStep`**：通過後呼叫 BO 發送驗證碼，回傳 `SecurityCodeId`

## 三種驗證方式的流程

### Email OTP / TOTP

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    FE->>BE: triggerLoginVerification
    BE-->>FE: Id SecurityCodeId
    Note over FE: 使用者輸入驗證碼
    FE->>BE: verifyLoginVerification VerificationId AccountId Id Code
    BE->>BE: 校驗 OTP TOTP 產生 Passport CompleteLoginProcess 清理 Session
    BE-->>FE: passport recDomain
```

### Push Notification — 雙裝置流程

```mermaid
sequenceDiagram
    participant NewDev as 新手機未登入
    participant BE as Backend
    participant OldDev as 舊手機已登入
    NewDev->>BE: triggerLoginVerification
    BE->>OldDev: Push Deep Link device-confirmation
    BE-->>NewDev: Id ExpiryTime
    OldDev->>BE: getDeviceLoginRequest Id
    BE-->>OldDev: Device Location Time
    Note over OldDev: 使用者核准
    OldDev->>BE: approvePushLogin Id approve
    NewDev->>BE: checkPushLoginStatus 約每 3 秒輪詢
    BE-->>NewDev: passport recDomain
    NewDev->>BE: postLogin passport
```

**關鍵**：舊手機必須是已登入的 Trusted Device（API 需 `[NeedLogin]`）。  
批准頁面顯示：裝置型號、登入地點、請求時間，讓使用者判斷是否為本人操作。

## Login Grant Exchange — WebView / App 交接

當 App 在 WebView 內顯示登入頁，MFA 驗證成功後不直接建立 Web Session，而是簽發一個短效的 **Login Grant** 給 App。

```mermaid
flowchart LR
    subgraph WV["WebView"]
        A[MFA 驗證成功]
        B[回傳 grantId expiresIn]
    end
    subgraph RD["Redis"]
        C["MFA LoginGrant GrantId snapshot TTL Single-use"]
    end
    subgraph App["App Native"]
        D[grantId Bridge postMessage]
        E[POST exchangeLoginGrant]
        F[Token CompleteLoginProcess]
    end
    A --> B
    A --> C
    B --> D
    D --> E
    E -->|驗證 grant| C
    C -->|讀取後刪除 Key| F
```

### 兩種路徑的差異

| 面向 | 做法 1（Web 直接登入） | 做法 2（WebView→App 交接） |
|------|-------------------|----------------------|
| Verify 成功產物 | `passport` | `grantId` + `expiresIn` |
| CompleteLoginProcess | 驗證成功後立即執行 | App 兌換成功後執行 |
| Passport 建立方 | Web 端 | App 端（`webapi.mobileapp`） |
| MFA Session 清理 | 立即清理 | 兌換成功或 Grant 過期後清理 |

### 安全防護

- **Short TTL**：Grant 存活 60~180 秒，降低攔截風險
- **Single-use**：兌換後立即刪除 Redis Key，防重放
- **Device Binding**：Grant 生成時可綁定 `deviceId`，兌換時比對
- **最小化資訊**：WebView 只拿到 `grantId`，不含完整 MfaContext

## 防重放攻擊：IsVerified Flag

```csharp
// MarkMfaSessionAsVerified
private static void MarkMfaSessionAsVerified(MfaContext context)
{
    context.IsVerified = true;
    var contextJson = JsonConvert.SerializeObject(context);
    string activeSessionKey = $"MFA:ActiveSession:{context.AccountId}";

    // 保留剩餘 TTL，只更新 IsVerified 欄位
    ProductManagement.SetStrToOTTRedis(
        activeSessionKey, contextJson,
        MFA_SESSION_DURATION_MINS,
        overwriteKey: true);
}

// ValidateMfaContext（每次驗證前執行）
if (context.IsVerified)
    return (null, MfaErrorCode.SessionExpired); // 已驗證，拒絕重複使用
```

**效果**：就算使用者截取到正確的 `verificationId`，Session 被標記為已驗證後，後續呼叫一律回傳 `SessionExpired`。

## 前端架構（Vue 3）

### 統一入口設計（方案 B）

```mermaid
flowchart TD
    subgraph Entries["三種登入入口"]
        E1[密碼登入 Login API]
        E2[OAuth OAuthLogin API]
        E3[WebAuthn WebAuthnLogin API]
    end
    RC{returnCode}
    E1 --> RC
    E2 --> RC
    E3 --> RC
    RC -->|0000 0001| PL[postLogin]
    RC -->|0018| MFA[emit require-mfa]
    RC -->|其他| ERR[顯示錯誤]
    MFA --> H[LoginForm handleMfaRequired]
    H --> D[LoginVerificationDialog]
    D --> S1[Step1 選擇驗證方式 SDialog]
    S1 --> S2[Step2 Email TOTP 輸入碼 或 Push 輪詢]
    S2 --> V[emit verified]
    V --> OK[handleLoginVerificationSuccess]
    OK --> PL2[authStore.postLogin passport recDomain]
```

### 前端狀態管理

```typescript
// LoginForm.vue
const showLoginVerificationDialog = ref(false);
const loginVerificationData = ref({
  verificationId: '',
  accountId: 0,
  availableMethods: [] as LoginVerificationType[],
  selectedMethod: LoginVerificationType.PushNotification,
});

// 收到 0018 時
if (returnCode == '0018') {
  loginVerificationData.value = {
    verificationId: response.data.verificationId,
    accountId: response.data.accountId,
    availableMethods: response.data.availableMethods || [],
    selectedMethod: response.data.availableMethods?.[0] ?? 0,
  };
  showLoginVerificationDialog.value = true;
}
```

### 前端 API 函式

```typescript
// auth.ts
triggerLoginVerification(params: TriggerLoginVerificationParams)
  → POST /service/otpapi/triggerLoginVerification
  → 回傳 { id (SecurityCodeId), expiryTimeDuration, maskedEmail }

verifyLoginVerification(params: VerifyLoginVerificationParams)
  → POST /service/otpapi/verifyLoginVerification
  → 回傳 { passport, recDomain, reachLimitTrustedDevice }

checkPushLoginStatus(params)
  → POST /service/otpapi/checkPushLoginStatus （輪詢 3 秒）

approvePushLogin(params: { id, action: 1|2 })
  → POST /service/otpapi/approvePushLogin

getDeviceLoginRequest(params: { id })
  → POST /service/otpapi/getDeviceLoginRequest
```

## CompleteLoginProcess — 登入收尾

```csharp
// LoginMfaManager.CompleteLoginProcess()
public static void CompleteLoginProcess(Trading trading, string blackbox)
{
    // 1. 重置登入失敗嘗試次數
    AccountManager.ResetLoginAttempt(trading.LoginID);

    // 2. 執行 BBox 風控檢查
    ThreadSecurityManager.ImpersonateWithServiceAccount();
    AccountManager.FireBBoxAsLogin(trading, blackbox);

    // 3. 清理 Session（防止殘留）
    if (HttpContext.Current?.Session != null)
        HttpContext.Current.Session.Clear();
}
```

## 架構摘要

```mermaid
flowchart TD
    S1[登入帳密成功] --> H[HandleLoginMfaFlow]
    H --> H1[BO NewDeviceCheck availableMethods]
    H --> H2[寫入 MFA ActiveSession TTL 30m]
    H --> H3[returnCode 0018 無 Passport]
    H3 --> UI[前端 MFA Dialog]
    UI --> T[triggerLoginVerification]
    T --> T1[Resend Rate Limit]
    T --> T2[Verify Rate Limit]
    T --> T3[BO 發送驗證碼 SecurityCodeId]
    T3 --> V[verifyLoginVerification]
    V --> V1[讀取 ActiveSession 比對 VerificationId]
    V --> V2[校驗驗證碼 IsVerified 防重放]
    V --> V3[產生 Passport CompleteLoginProcess]
    V --> V4[清理 Redis 回傳 passport]
    V4 --> P[postLogin 建立 Web Session]
```
