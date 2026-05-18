---
title: Responsible Gambling 後端防護設計：Self Exclusion / Time Out 不是前端按鈕
date: 2026-05-18
tags:
  - ASP.NET
  - Responsible Gambling
  - Security
  - Session
  - Backend Architecture
categories:
  - Backend
---

## 前言

Responsible Gambling 功能看起來像會員中心裡的一個設定頁：

- 使用者選擇 Self Exclusion
- 使用者選擇 Time Out
- 系統顯示限制期間

但從後端角度看，這不是一般 profile setting。

它牽涉到：

- 帳號狀態更新
- Session cache 更新
- 其他平台踢出
- 頁面權限限制
- 通知會員與 risk team
- Product / Deposit / Promotion 類頁面的存取限制

因此 Responsible Gambling 不能只靠前端 UI 隱藏，必須由後端狀態與權限管線共同保護。

## 相關檔案

```text
src/AgileBet.Cash.Portal.BLL/ResponsibleGamingManager.cs
src/AgileBet.Cash.Portal.Web/BLL/WebAccountManager.cs
src/AgileBet.Cash.Portal.BLL/AccountManager.cs
src/AgileBet.Cash.Portal.Web/MvcActionFilter/ResponsibleGamblingCheckerActionFilter.cs
src/AgileBet.Cash.Portal.Web/Utilities/UserPagePermissionChecker.cs
src/AgileBet.Cash.Portal.Model/MyAccount/ResponsibleGamblingSetting.cs
```

## 兩種核心狀態

Model 層有共同 base：

```csharp
public interface IResponsibleGamblingBase
{
    double ExpiredDate { get; }
    int Period { get; set; }
    double AppliedDate { get; }
    DateTime ExpiredDateTime { get; set; }
    DateTime AppliedDateTime { get; set; }
}
```

Time Out：

```csharp
public class TimeOutSetting : ResponsibleGamblingBase
{
    [DataMember(Name = "method")]
    public RemovalMethod TimeOutMethod { get; set; }
}
```

Self Exclusion：

```csharp
public class SelfExclusionSetting : ResponsibleGamblingBase
{
    [DataMember(Name = "endDate")]
    public double RemoveEndDate =>
        this.SelfExclusionEndDateTime.ToJsMilliseconds();

    [IgnoreDataMember]
    public DateTime SelfExclusionEndDateTime { get; set; }
}
```

兩者都包含：

- applied date
- expired date
- period

Self Exclusion 另外有 remove request date。

## 從 DTO 轉成前端設定

`ResponsibleGamingManager` 會根據 `UserDto` 與 `UserRestrictionDto` 組出設定：

```csharp
public static SelfExclusionSetting GetSelfExclusionSettingByDto(
    UserDto userDto,
    UserRestrictionDto userRestrictionDto)
{
    var setting = new SelfExclusionSetting();
    if (userDto.SelfExclusion || userDto.PermanentSelfExclusion)
    {
        setting.AppliedDateTime =
            userRestrictionDto.MEMBERSELFEXCLUSIONLASTDATE;

        setting.ExpiredDateTime = userDto.PermanentSelfExclusion
            ? new DateTime(9999, 12, 30)
            : userRestrictionDto.UpliftDate;

        setting.Period = userDto.PermanentSelfExclusion
            ? (int)SelfExclusionStatus.Permanent
            : userRestrictionDto.SelfExcludeByMonth;

        setting.SelfExclusionEndDateTime =
            userRestrictionDto.SelfExclusionRemoveRequestDate != null
                ? userRestrictionDto.UpliftDate
                : DateTime.MinValue;
    }
    return setting;
}
```

永久 Self Exclusion 使用 `9999-12-30` 表示沒有正常 expiry。

Time Out：

```csharp
public static TimeOutSetting GetTimeOutSettingByDto(
    UserDto userDto,
    UserRestrictionDto userRestrictionDto)
{
    var setting = new TimeOutSetting();
    if (userDto.Timeout)
    {
        setting.AppliedDateTime =
            userRestrictionDto.SEVENDAYCOOLINGPERIODLASTDATE;
        setting.ExpiredDateTime =
            userRestrictionDto.TimeoutUpliftedDate ?? DateTime.MinValue;
        setting.Period = userRestrictionDto.SelfExcludeByMonth;
        setting.TimeOutMethod =
            (RemovalMethod)Enum.Parse(typeof(RemovalMethod),
                userRestrictionDto.RemovalMethod.ToString());
    }
    return setting;
}
```

## SetSelfExclusion 流程

`WebAccountManager.SetSelfExclusion` 做了很多事，不只是呼叫 API。

第一步：如果已在 exclusion 且尚未過期，直接擋掉：

```csharp
if (trading.SelfExclusion &&
    DateTime.Now.ToJsMilliseconds() <
    trading.ExclusionExpiredDate.ToJsMilliseconds())
{
    internalResponse.ReturnCode =
        ResponsibleGamblingEnum.UnderExclusionOrTimeout;
    result.Response = (int)internalResponse.ReturnCode;
    return result;
}
```

第二步：呼叫 Customer SPI：

```csharp
var model = new SelfExclusionInternalRequestModel()
{
    IpAddress = trading.ClientIP,
    Period = (int)setting.SelfExclusionPeriod,
    AccountId = trading.AccountID,
};

internalResponse = AccountManager.UpdateSelfExclusion(
    model,
    trading.MemberCode,
    trading.AppId);
```

第三步：成功後更新目前 session 的 trading 狀態：

```csharp
trading.ExclusionExpiredDate = internalResponse.ResponseData.UpliftedDate;
trading.ExclusionAppliedDate = internalResponse.ResponseData.AppliedDate;
trading.ExclusionPeriod = (int)setting.SelfExclusionPeriod;
trading.SelfExclusion = true;
trading.IsExcluded = true;
trading.SessionUpdateTime = DateTime.MinValue;
```

第四步：更新 Redis TradingSession cache：

```csharp
CacheLayerManager.UpdateData<TradingSessionCache>(
    CacheName.TradingSession,
    trading.AccountID.ToString(),
    trading);
```

第五步：寄信給會員與 risk team：

```csharp
MsgHubManager.SendSelfExcludeMessage(
    exclusionStatus,
    trading,
    profile,
    trading.ExclusionAppliedDate,
    trading.ExclusionExpiredDate);

MsgHubManager.SendSelfExcludeRiskMessage(
    setting.EnglishPeriodMessage,
    trading,
    profile);
```

## SetTimeOut 流程

Time Out 類似，但狀態欄位不同：

```csharp
var model = new TimeOutInternalRequestModel()
{
    IpAddress = trading.ClientIP,
    Period = (int)setting.TimeOutPeriod,
    AccountId = trading.AccountID,
    RemovalMethod = (int)RemovalMethod.Auto
};

result = AccountManager.UpdateTimeOut(
    model,
    trading.MemberCode,
    trading.AppId);
```

成功後：

```csharp
trading.TimeOutMethod = RemovalMethod.Auto;
trading.IsTimeOut = true;
trading.IsExcluded = true;
trading.ExclusionAppliedDate = result.ResponseData.AppliedDate;
trading.ExclusionExpiredDate = result.ResponseData.UpliftedDate;
trading.SessionUpdateTime = DateTime.MinValue;
trading.ExclusionPeriod = (int)setting.TimeOutPeriod;

CacheLayerManager.UpdateData<TradingSessionCache>(
    CacheName.TradingSession,
    trading.AccountID.ToString(),
    trading);
```

通知：

```csharp
MsgHubManager.SendTimeoutMessage(
    timeOutInDay,
    setting.TimeOutPeriod,
    trading,
    profile);

MsgHubManager.SendTimeoutRiskMessage(
    setting.EnglishPeriodMessage,
    trading,
    profile);
```

## Customer SPI 更新

`AccountManager.UpdateSelfExclusion` 會呼叫 `customerSpi`：

```csharp
var updateSelfExclusionUrl = customerSpi.url +
    customerSpi.AppSettings
        ?.FirstOrDefault(appSetting =>
            appSetting.Key == "SetSelfExclusion").Value;

result = RequestUtil.SendRequest<SelfExclusionInternalResponseModel>(
    updateSelfExclusionUrl,
    "POST",
    JsonConvert.SerializeObject(model),
    "application/json");
```

成功時會觸發 AccountState：

```csharp
if (result.ReturnCode == ResponsibleGamblingEnum.Success)
{
    AccountStateManager.ChangeAllChannelAccountState(
        memberCode,
        model.AccountId,
        Status.Invalidate,
        ActionRemark.SelfExclusion,
        appId);
}
```

Time Out 也是類似：

```csharp
if (result.ReturnCode == ResponsibleGamblingEnum.Success)
{
    AccountStateManager.ChangeAllChannelAccountState(
        memberCode,
        model.AccountId,
        Status.Invalidate,
        ActionRemark.TimeOut,
        appId);
}
```

這代表 Responsible Gambling 狀態不是只改目前 session，而是要讓其他 channel 都被標記失效。

## 失敗時的補償動作

`WebAccountManager` 有一個暫時解法：

```csharp
if (internalResponse.ReturnCode == ResponsibleGamblingEnum.GeneralError)
{
    ForReloadAndKickOutOtherPlatform(trading);
}
```

補償邏輯：

```csharp
private static void ForReloadAndKickOutOtherPlatform(Trading trading)
{
    trading.SessionUpdateTime = DateTime.MinValue;
    CacheLayerManager.UpdateData<TradingSessionCache>(
        CacheName.TradingSession,
        trading.AccountID.ToString(),
        trading);

    AccountStateManager.ClearAccountStateOtherChannelAsync(
        trading.AppId,
        trading.AccountID,
        trading.MemberCode);
}
```

即使 SPI 回 general error，也會強制目前 cache reload，並踢掉其他平台，降低狀態不一致風險。

## 頁面防護：ResponsibleGamblingCheckerActionFilter

MVC 頁面層有 filter：

```csharp
public override void OnActionExecuting(ActionExecutingContext filterContext)
{
    var session = DependencyResolver.Current.GetService<SessionData>();
    var permissionChecker =
        DependencyResolver.Current.GetService<UserPagePermissionChecker>();

    bool isForbidden = permissionChecker.IsInDisallowPath(
        session,
        disallowRgStatus,
        HttpContext.Current.Request.Url.AbsolutePath,
        byPassPathChecker);

    if (isForbidden)
        filterContext.Result = new RedirectResult(
            $"~/{session.Trading.PreferData.Languages}/forbidden?type=limit-access");
}
```

API PageGuard 裡也會使用同一個 `UserPagePermissionChecker`。

## Block Path 設計

`UserPagePermissionChecker` 會根據 RGType 建立 blocking list：

```csharp
blockingList.Add(RGType.TimeOut, BlockPaths);
blockingList.Add(RGType.SelfExclusion, BlockPaths);
blockingList.Add(RGType.PermanentExclusion, BlockPaths);
```

Block paths：

```csharp
private static readonly List<PathModel> BlockPaths =
    new List<PathModel>()
{
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/overlay$" },
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/news" },
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/rules" },
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/applications" },
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/my-account/deposit" },
    new PathModel() { pathRegex = "^/[a-z]{2}-[a-z]{2}/my-account/settings" },
};
```

判斷邏輯：

```csharp
if (session.Trading.IsExcluded)
{
    foreach (var status in disallowRgStatus)
    {
        bool isExcluded = GetIsExcludedByStatus(session.Trading, status);
        if (isExcluded &&
            (byPassPathChecker || IsInBlockList(status, destinationPath)))
            return true;
    }
}
```

`byPassPathChecker` 可以讓某些情境直接 block all path，不需要再看 block list。

## 通知設計

Self Exclusion 會員通知：

```csharp
var clientMessage = new ClientMessage()
{
    EventName = "tSelfExclusion" +
        GetSelfExclusionTemplateByPeriod((int)status),
    Params = emailParams,
    Region = trading.PreferData.RegionCode,
    Language = profile.PreferLanguage,
};

MsgHubManagement.RequestMessagingToMember(
    clientMessage,
    trading.MemberCode);
```

Risk team 通知：

```csharp
var clientMessage = new ClientMessage()
{
    EventName = "tSelfExclusionConfirmForRisk",
    Params = emailParams,
    Recipient = riskSender,
};

MsgHubManagement.RequestMessagingToUser(
    clientMessage,
    trading.MemberCode,
    trading.AccountID);
```

Time Out 也是同樣模式。

這代表 Responsible Gambling 是一個跨 domain 流程：

```text
Account SPI
    +
Trading Cache
    +
AccountState
    +
PageGuard
    +
MsgHub
```

## 完整流程圖

```text
User submits Self Exclusion / Time Out
    |
    v
WebAccountManager
    |
    v
AccountManager calls Customer SPI
    |
    +-- Success
    |     |
    |     v
    |   Update Trading session fields
    |     |
    |     v
    |   Update TradingSession cache
    |     |
    |     v
    |   ChangeAllChannelAccountState
    |     |
    |     v
    |   Send member + risk messages
    |
    +-- GeneralError
          |
          v
        Force cache reload + kick out other platform
```

頁面防護：

```text
Next request
    |
    v
PageGuard / ResponsibleGamblingCheckerActionFilter
    |
    v
UserPagePermissionChecker
    |
    +-- allowed path --> pass
    |
    +-- blocked path --> 403 / redirect forbidden
```

## 小結

Responsible Gambling 在後端不該被當成普通會員設定，它是一個安全與合規管線。

這套設計值得借鑑的地方：

- SPI 更新成功後同步 Trading cache
- AccountState 讓其他 Channel 失效
- PageGuard / ActionFilter 在後端攔截限制頁
- Notification / MsgHub 同步通知會員與 risk team
- Self Exclusion / Time Out 共用基底模型，但保留各自差異
- 失敗情境仍做 cache reload 與其他平台 kickout，避免狀態漂移

一句話總結：Responsible Gambling 的核心不是「使用者不能看到某些按鈕」，而是「整個系統都要承認這個狀態，並在所有入口強制執行」。
