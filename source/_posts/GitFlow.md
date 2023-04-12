---
title: GitFlow
date: 2023-04-12 22:52:34
tags:
  - Git
  - GitFlow
  - Workflow
---

突然有感而發 想寫下部門之前用了很多年的 GitFlow 以及它們會遇到的問題，以及他們解決什麼問題

最主要觀念是

1. 正常功能開發以 main branch 為主體(所有的分支都由這裡出發) ，分別 Merge 到 QAT 避免同步大家開發多個功能，
   有互相的影響以及將不必要的程式碼帶到正式環境

2. 緊急修正的情況可以直接根據 main branch 拉出分支修正 避免其他影響 然後部屬到 Pre-prod 測試

首先我們先定義好 Git Branch 以及對應的環境

**我們這裡以 main 當作我們的主要分支 所有 branch 都是以 main 為主**

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

{% asset_img Flow.png "Example" %}

我們會一個一個介紹

# 1. 開發功能 照順序進到 Prod

首先我們先介紹我們有幾個 branch 以及大概的功能敘述

1. feature/Profile : 他有會員功能的部分 (新增 UI 以及會修改到 Routing 的檔案)
2. feature/ForgotAccount: 忘記帳號密碼的流程 (新增 UI 以及會修改到 Routing 的檔案)
3. feature/Product: 新的產品頁面 (新增 UI 以及會修改到 Routing 的檔案)
4. main: 我們的正式環境的 branch

首先可能 A 這個人收到會員功能的部分開始開發，以及 B 這個人也開始開發忘記帳號密碼的流程

他們都是從 main 這個 branch 開啟 feature branch 各自開發，那開發到一個段落了

A 的功能先完成，他先 Merge 到 QAT ，接著換 B 的功能完成，他也 Merge 到 QAT

**如圖片黑框的部分 這樣有可能會發生衝突**
{% asset_img 1.1.png "Flow" %}

Issue 1. 因為根據剛剛上面的敘述 A 跟 B 在沒有協調的狀況下 它們有檔案衝突了
所以這是第一個衝突點，Routing 檔案衝突
Solution:

1. 找 A 跟 B 一起選擇 confilt 檔案
2. 並且要討論之後 Prod 進入的順序是否是 A 先 B 後 或是 B 後 A 先 ，如果不是
