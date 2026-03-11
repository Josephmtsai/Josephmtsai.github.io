---
title: Git Revert 後再次 Merge 失效？正式環境退版後的正確處理流程
date: 2026-03-11
tags:
  - Git
  - GitFlow
  - Workflow
  - Revert
categories:
  - 工程實踐
---

## 前言

在團隊協作中，經常會遇到這種情境：你的功能分支已經 merge 到正式環境的 release branch，但上線前一天被通知要**抽單退版**。這時候如果直接在 release branch 上 `git revert` 那筆 merge commit，後續想把同一個功能分支重新 merge 回去時，Git 會認為「這些 commit 已經被 merge 過了」而跳過所有變更——導致程式碼根本沒有被帶回來。

本文記錄這個問題的成因，以及在不遺漏檔案的前提下，如何正確退版並繼續推進功能。

<!-- more -->

## 問題場景

假設流程如下：

1. 你在 `CC1-XXX` 功能分支上完成修改
2. 將 `CC1-XXX` merge 到正式環境前的 release branch（例如 `release/prod`）
3. 上線前被通知要抽單，需要從 `release/prod` 退掉你的變更
4. 但功能本身還需要繼續修改，修完後要重新上線

如果此時直接在 `release/prod` 上 revert 你的 merge commit，之後再次從 `CC1-XXX` merge 回去，Git 會判定這些 commit 已經存在於歷史中，**不會帶入任何變更**。

## 為什麼會這樣？

Git 的 merge 判斷基於 commit history，而非檔案差異。當你 revert 一筆 merge commit 時：

- Revert 只是新增一筆「反向操作」的 commit，原本的 merge commit 仍然留在歷史中
- 下次再 merge 同一個分支時，Git 看到那些 commit 已經在歷史裡了，就不會再 merge 一次
- 結果就是：你以為 merge 成功了，但實際上什麼都沒帶進去

## 正確的退版與重新上線流程

### Step 1：在 release branch 上 revert merge commit

先在 `release/prod` 上 revert 掉 `CC1-XXX` 的 merge commit，讓 release branch 回到乾淨的狀態。

```bash
git checkout release/prod
git revert -m 1 <merge-commit-hash>
```

### Step 2：將 release branch 同步回你的功能分支

把最新的 `release/prod`（包含 revert commit）sync 回你的 `CC1-XXX` 分支，確保兩邊歷史一致。

```bash
git checkout CC1-XXX
git merge release/prod
```

### Step 3：在功能分支上 revert 那筆 revert

在 `CC1-XXX` 上，cherry-pick 或 revert 掉 Step 1 產生的 revert commit。這會讓你的變更重新出現在功能分支上。

```bash
git revert <revert-commit-hash>
```

### Step 4：繼續修改並重新 merge

此時 `CC1-XXX` 上已經有了「revert of revert」，等於你的原始變更被還原回來了。繼續修改完畢後，正常 merge 回 `release/prod` 即可，Git 這次會正確帶入所有變更。

## 流程示意圖

{% asset_img image.png "Git Revert Flow" %}

## 重點整理

- **直接 revert merge commit 後，不能再次 merge 同一個分支**——Git 會認為已經 merge 過而跳過
- **解法是「revert the revert」**——在功能分支上反轉那筆退版 commit，讓變更重新生效
- 務必先將 release branch 同步回功能分支，確保歷史一致後再操作，避免遺漏檔案
