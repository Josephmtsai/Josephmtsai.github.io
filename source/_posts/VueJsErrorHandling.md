---
title: VueErrorHandling
date: 2022-06-05  20:20:04
tags:
  - Vue3
  - Error Handling
  - Debug
  - Log
  - Error
  - Source Map
---

### 一般前端開發最常遇到的問題有四塊:

我們 會針對 3 多做一些說明

1. Syntax error
   template 裡面有一些錯誤的 syntax ,可能多加了一個 TAG 或是沒有 close tag .可以透過安裝一些 extension or pre commit 去檢查
2. Runtime error: 執行階段遇到的錯誤
   例如少引用的 components... 可以透過安裝一些 extension 幫助檢查
3. Logical Error

邏輯上面的問題最難被測試到，尤其對於前端來說 萬一問題不能被明確說明，就非常難查問題，所以與其透過使用者告訴我們錯誤
我們應該要想辦法將錯誤記錄下來 放到 Log 裡面提供給我們做查詢

4. Api Error

在個人的經驗中,由於 Api 是處在 Server Side，通常會有 Request Log or IIS ,Jetty Log 紀錄 input or output 的 https status
如果真的發生問題是容易追蹤的,也容易被處理，這部分我們另外寫一篇文章說明

# Logical Handling

我們先以 3 的邏輯錯誤多做說明，首先介紹 Vue 處理作錯誤有兩塊

### Vue Error Handler

我們可以透過 Vue 的 global error handler 集中處理錯誤的各種資訊
[Error Handler](https://vuejs.org/api/application.html#app-config-errorhandler)

範例如下 : 我們可以把所有的邏輯錯誤 記錄到 globla 的 error hanlder,然後在統一送給 Api 做 Debug

```javascript
function sendErrorLogRequest(logData) {
  fetch('', {
    method: 'POST',
    headers: { 'Content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(logData),
  });
}
function formatComponentName(vm) {
  if (vm.$root === vm) return 'root';
  var name = vm._isVue
    ? (vm.$options && vm.$options.name) ||
      (vm.$options && vm.$options._componentTag)
    : vm.name;
  return (
    (name ? 'component <' + name + '>' : 'anonymous component') +
    (vm._isVue && vm.$options && vm.$options.__file
      ? ' at ' + (vm.$options && vm.$options.__file)
      : '')
  );
}
function ErrorHandler(err, vm, info) {
  const errorData = {
    Location: window.location.pathname,
    Name: formatComponentName(vm),
    Message: err.message.toString(),
    StackTrace: err.stack.toString(),
  };
  sendErrorLogRequest(errorData);
  throw err;
}
export default ErrorHandler;
```

### Vue LifeCycle Hook

可以透過每一個 Component 的 lifecycle errorCaptured 去攔截各自的錯誤,但是這就需要每一個元件都要撰寫
就要看團隊如何評估
[errorcaptured](https://vuejs.org/api/options-lifecycle.html#errorcaptured)

```javascript
export default {
  name: 'ErrorSample',

  created() {},

  errorCaptured(err, vm, info) {
    // err: error trace
    // vm: component in which error occured
    // info: Vue specific error information such as lifecycle hooks, events etc.
    // TODO: Perform any custom logic or log to server
  },
};
```

### Logic Error Sample

以 Demo site 為例子
我們故意在 method 裡面加入兩個 JSON Parse 的錯誤

[Demo Site](https://vue-menu.herokuapp.com/error-sample)
{% asset_img 01.png "Error" %}

點開會有兩個錯誤

```javascript
chunk-vendors.f74a5e6c.js:1 SyntaxError: Unexpected token D in JSON at position 0
    at JSON.parse (<anonymous>)
    at Proxy.jsError (validate.942ffcee.js:1:51528)
    at onClick.t.<computed>.t.<computed> (validate.942ffcee.js:1:50549)
    at vh (chunk-vendors.f74a5e6c.js:1:228008)
    at u (chunk-vendors.f74a5e6c.js:1:354212)
    at h (chunk-vendors.f74a5e6c.js:1:27792)
    at f (chunk-vendors.f74a5e6c.js:1:27875)
    at HTMLButtonElement.n (chunk-vendors.f74a5e6c.js:1:71846)
```

先假設我們後端有收到錯誤 LOG

{% asset_img 02.png "Error" %}

我們就可以先透過 Source map cli decrypt 錯誤的行數

重點是下面這行錯誤代碼 告訴你是哪一隻檔案&資訊

```
validate.942ffcee.js:1:51528
```

我們就可以透過 source map 解開後知道在哪邊有噴錯

```
D:\vue\vue_menu\dist\js>source-map resolve validate.9cc0683f.js.map 1 51528
Maps to webpack://vue_menu/src/views/ErrorSample.vue:70:32 (parse)

      this.convertedData = JSON.parse(jsonData);
```

{% asset_img 03.png "Debug Line" %}

常常使用者無法說清楚到底是哪一個步驟出問題 所以可以透過 log 系統去反推一些資訊 進而 debug
{% asset_img 04.png "Debug Line" %}

# Reference

[Sample Code](https://github.com/Josephmtsai/vue_menu)
[Error Handling](https://medium.com/js-dojo/error-exception-handling-in-vue-js-application-6c26eeb6b3e4)
[Source Map Cli](https://www.npmjs.com/package/source-map-cli)
