---
title: GitFlow
date: 2023-04-12 22:52:34
tags:
  - Git
  - GitFlow
  - Workflow
---

突然有感而發 想寫下部門之前用了很多年的 GitFlow 以及它們會遇到的問題，

首先我們先定義好 Git Branch 以及對應的環境

| Branch      | Env            | Branch Remark |
| ----------- | -------------- | ------------- |
| qat         | QAT            | QA Testing    |
| main        | Pre-Prod, Prod | 正式環境      |
| feature/xxx |                | 開發功能分支  |
| hotfix/xxx  |                | 緊急功能修正  |

我們環境實際上重要的有三種環境

| Environment | remark                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------- |
| QAT         | 給 QA 做測試的環境(所有的 Feature 都會先進到 QAT 給 QA 測試 測試完成的才會 Deploy to Pre-prod) |
| Pre-prod    | 上線前給 QA 做最後測試的環境                                                                   |
| Prod        | 正式環境                                                                                       |

那我們可以依照幾種情境講述會遇到的問題

1. 開發功能 照順序進到 Prod

2. 緊急修正問題 直接推到 Prod

3. 開發功能 時程需要拖很長(歷時一兩個月)

以下是大致上的 Gitflow 流程圖

我們會一個一個介紹

```mermaid
gitGraph:
options
{
  "nodeSpacing": 150,
  "commitSpacing": 60
}
end
commit id:"First Commit" tag: "1.0.0"
branch feature/Profile
branch feature/ForgotAccount
branch feature/Product
branch qat/uat
checkout feature/Profile
commit id:"Profile UI"
commit id:"Add Profile Routing"
checkout feature/Product
commit id:"Add Poduct UI"
commit
checkout feature/ForgotAccount
commit id:"ForgotAccount UI"
commit id:"Add ForgotAccount Routing"
checkout qat/uat
merge feature/Profile id: "Profile enter qat"
merge feature/ForgotAccount id: "ForgotAccount enter qat" type: HIGHLIGHT
merge feature/Product id: "Product enter qat"
checkout main
branch hotfix/RegisterIssue
commit id: "fix register form"
commit id: "fix UI Issue"
commit id: "fix Routing Issue"
checkout main
merge hotfix/RegisterIssue
checkout feature/Profile
commit id:"Fix QT-XXX Profile Issue"
checkout feature/ForgotAccount
commit id:"Fix QT-XXX ForgotAccount Issue"
commit id:"Fix UAT-XXXXX ForgotAccount Issue"
merge qat/uat
checkout qat/uat
merge feature/ForgotAccount type: HIGHLIGHT
merge feature/Profile type: HIGHLIGHT
checkout main
branch rlps/week1
checkout rlps/week1
merge feature/ForgotAccount type: HIGHLIGHT
merge feature/Profile type: HIGHLIGHT
checkout main
merge rlps/week1 tag: "1.0.1"
```
