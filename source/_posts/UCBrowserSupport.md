---
title: UC Browser Support
date: 2022-05-07 23:38:50
tags:
  - UC Browser
  - Tailwind CSS
  - Vite
  - Vue3
  - Tailwind CSS Dark Mode
---

在開發 Global 的網頁的時候，通常會去評估各種網頁的支援度，如果沒有通常會請放 Upgrade your Browser.

因為 UC Browser 在中國大陸其實還是有一些比較舊的手機在使用，剛好在開發 Vue 的時候遇到一些問題順便記錄下來

使用的 Framework and config

- Vue 3 with Vite
- Tailwind CSS 3 (Dark Mode)

想要支援舊版的 UC Browsr

# 瀏覽器支援度

一開始以為是 ES module 導致 Build 出來有問題
[ES Module](https://caniuse.com/es6-module)

[Dynamic Import](https://caniuse.com/es6-module-dynamic-import)

所以針對這點我們有安裝了[plugin-legacy plugin](https://www.npmjs.com/package/@vitejs/plugin-legacy)

但是還是遇到問題，基本上 UC 瀏覽器 13 以上 legacy plugin 才有用，但是當下發現 CSS 有跑版.. 然後回頭去看發現有這行敘述

> Now instead of dark:{class} classes being applied based on prefers-color-scheme,
> they will be applied whenever dark class is present earlier in the HTML tree.

再回頭去查詢發現 其實到最新版本的 UC 瀏覽器才有支援這個設定....
[prefers-color-scheme](https://caniuse.com/?search=prefers-color-scheme)

| UC Browser Version | Vite | Vite with Legacy Code | CSS OK?          |
| ------------------ | ---- | --------------------- | ---------------- |
| 11.2.0             | X    | X                     | X                |
| 11.3.8             | X    | X                     | X                |
| 13.0.5             | X    | O                     | X(Display Wrong) |
| 13.4.0             | O    | O                     | O                |

## 心得

Caniuse 的資訊不是最新的 實際支援的瀏覽器還是需要實測才知道... 如果用比較新的 framework 之類還是要考慮舊版的瀏覽器支援度
不然這個畫面都會是白色的.
