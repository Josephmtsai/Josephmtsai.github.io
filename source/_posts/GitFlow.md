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
| fix/xxx     |                | 排程功能部屬  |

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
5. fix/Week1: 因為我們是每一週會上 Code 所以 branch 以 fix prefix 開頭 然後會把完成的功能 merge 進來

branch 流程順序如下:

1. feature/Profile ,feature/ForgotAccount 都從 main 拉 branch 出來
2. feature/Profile ,feature/ForgotAccount 各自開發 直到完成
3. feature/Profile ,feature/ForgotAccount Merge qat

---

**如圖片黑框的部分 這樣有可能會發生衝突**
{% asset_img 1.1.png "Flow" %}

## Issue 1. 因為根據剛剛上面的敘述 A 跟 B 在沒有協調的狀況下 它們有檔案衝突了

所以這是第一個衝突點，Routing 檔案衝突

### Solution:

1. 找 A 跟 B 一起選擇 confilt 檔案
2. 並且要討論之後進到正式環境的順序是否是 A 先 B 後 或是 B 後 A 先 ，到時候要討論怎麼 Merge

---

接著測試到一個段落 QA 也認為 1 跟 2. 的 branch 差不多可以進 Prod 了,我們會透過剛剛提到的 5.
fix/Week1 將大家要進的程式碼統一 Merge 到此 branch 然後 merge to main ,部屬到 Pre-Prod 環境給 QA 做最後檢查

branch 流程順序如下:

1. fix/Week1 都從 main 拉 branch 出來
2. feature/Profile ,feature/ForgotAccount Merge fix/week1
3. fix/week1 Merge main (需要有人 approve 或是檢查程式碼)

**這樣好處是 Merge prod 只會有一個點 到時候要退版也會好退**

## Issue 2. 跟 Issue 1 一樣 有可能會有 Routing 檔案衝突或是其他檔案衝突

**如圖片黑框的部分 fix/week1 是從上方這個 main branch 開的 然後 merge 進去這樣有可能會發生衝突**
{% asset_img 1.2.png "Flow" %}

### Solution:

1. 定時 Sync main branch 到自己的 branch ex: feature/Profile 如果有衝突可以當下就定時解掉 避免上線前的困擾
2. 找 A 跟 B 一起選擇 confilt 檔案
3. 部屬時候如果有衝突的部分要再檢查一次功能

---

這樣就完成照順序進到 Prod 的功能了

# 2. 緊急修正問題 直接推到 Prod

想當然 我們在開發的過程中 有可能緊急有發生 Prod 有問題 需要緊急修正的問題

branch:
hotfix/RegisterIssue : 註冊問題修正的 branch

branch 流程順序如下:

1. hotfix/RegisterIssue 都從 main 拉 branch 出來
2. hotfix/RegisterIssue Merge main (緊急修正 要直接丟到 Pre-prod 做快速驗證後上線)
3. hotfix/RegisterIssue Merge qat

為什麼要做 3 是因為要避免 qat 以及 main branch 有一些落差，理論上 qat 會比較新 但是功能應該要跟 main 相同

### Issue 3. 有可能遇到的問題也是類似 ，有可能在 Merge qat 的時候 ,QAT 有新的功能在開發也修改到相同檔案

{% asset_img 1.3.png "Flow" %}

### Solution:

1. 找到衝突的檔案 並且找到功能的作者討論如何修改衝突
2. 並且請功能的作者 他的 branch 先行 sync main 到自己的 branch 維持最新的版本 避免之後 Merge main 又會有衝突

---

# 3. 開發功能 時程需要拖很長(歷時一兩個月)

因為要先知道 如果一個 feature branch 存活的週期大於一個月以上一定要定時做一件事情

**定時 sync main to feature branch **

其餘流程要照著正常 feature 推動 這樣才不會有到時候要 Merge main 一堆衝突的困擾

# 心得

不管使用什麼 gitflow 都是要避免衝突，盡量要跟衝突的檔案的作者溝通 看上線時程，以及 sync main branch.
如果真有遇到 Merge 到錯誤的 branch (最好是先 force reset 到錯誤的地方開始解決 千萬不要再修改檔案避免造成更多錯誤)
