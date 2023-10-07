---
title: JamWebDebugger
date: 2023-10-07 22:44:38
tags:
  - Debbuger
  - Recording
  - QA Testing
---

前幾天同事介紹一個好用的工具,最主要是它可以錄製網頁的 Network ,Console 資訊

因為大家也知道 QA 很常反應問題 一般 IT 還需要重現這個問題. 如果 QA 能夠提供更多的資訊

我們就可以減少 Debugger 的時候.而且這個軟體還是免費而且也整合了 jira 等等的套件

[JAM](https://jam.dev/)

我們以 [myfunnow](https://www.myfunnow.com/en) 這個旅遊網站當例子

[Demo](https://jam.dev/c/dce8eee6-c996-498d-89ed-7a65d8c972b6)

可以看到 他在幾秒的時候 Console 有出現 401 的錯誤 並且在 Network 的 tab 當下有記錄每一個 request 的相關資訊

這些可以幫助 IT 跟 QA 更快反應問題

{% asset_img 1.png "Sample" %}

{% asset_img 2.png "Sample" %}
