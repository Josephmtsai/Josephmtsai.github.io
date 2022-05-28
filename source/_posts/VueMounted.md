---
title: Vue Created Mounted example
date: 2022-05-28 20:52:42
tags:
  - Vue3
  - Vue Life Cycle
  - Integration
---

最近遇到一個 Issue，我們本來有跟 Partner 整合一個功能，做法是類似先 Inject 對方的 js，
接著去指定一個 element 讓他生成到對應的頁面位置，因為當初開發的時候大家都是新手 邊做邊學，
一開始把 init script 的方法放到 created function，會造成一個問題是 element 都還沒有被掛到 html 上面就先呼叫 init script
有可能會無法生成畫面，但是神奇的是 當初寫沒有發現問題，等到有一天可能 Partner 突然有改 JS 的流程，造成我們整個頁面壞掉。
所以又再回頭去 review code 才發現應該要放到 mounted

{% asset_img 01.png "Sample" %}

```javascript
<script
  async
  id='__ada'
  data-handle='<YOUR-BOT-HANDLE>'
  src='https://xxx.xxx.com/embed2.js'
></script>
```

正確就是要放到 mounted 上面

```javascript
export default {
  created() {
    //element not create
  },
  mounted() {
    //element created
  },
};
```

這裡附上 Kuro Hsu 的 Vue2 vs Vue 3 Life cycle 參考

{% asset_img 02.png "Compare" %}
[Reference](https://book.vue.tw/CH1/1-7-lifecycle.html)
