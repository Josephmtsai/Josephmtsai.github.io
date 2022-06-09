---
title: Vue Api Error Handling
date: 2022-06-08 20:58:20
tags:
  - Vue3
  - Error Handling
  - Api
  - Log
  - Error
  - Axios
  - Pinia
---

接著 上一篇文章[Vue Error Handling](https://josephmtsai.github.io/2022/06/05/VueJsErrorHandling/)

### 一般前端開發最常遇到的問題有四塊

1. Syntax error
2. Runtime error
3. Logical error
4. Api error

接著我們針對第四點介紹

# Api Error

一般 Api Error 可以透過 http status Code 去歸類各種錯誤類型

401 Unauthorized (en-US)
403 Forbidden
500 Internal Server Error
503 Service Unavailable

以 Axios 套件舉例 用在 vue 上面

[Intercepters](https://axios-http.com/docs/interceptors)

我們一樣可以客製化一份 axios 的攔截器(可以在這裡定義共用的錯誤處理 OR title )

{% asset_img 01.png "Intercepters" %}

我們可以在這裡注入 Pinia Store 當 Api 有錯誤的時候 就直接透過 Pinia 的狀態改變觸發 Dialog

只要把她放在 App.vue 底下就可以使用

```javascript
import { storeToRefs } from 'pinia';
const dialog = useDialog();
const dialogStore = useDialogStore();
const { display, title, content } = storeToRefs(dialogStore);
watch(display, (newValue) => {
  if (newValue) {
    dialog.error({
      title,
      content,
      maskClosable: false,
      onClose: () => {
        dialogStore.hideMessage();
      },
    });
  }
});
```

{% asset_img 02.png "Dialog" %}
這樣就可以達到假設有 Api 錯誤 User 可以看到自定義的錯誤訊息以及視窗，也方便我們前端 Debug

[Demo](https://vue-menu.herokuapp.com/error-sample)
[SourceCode](https://github.com/Josephmtsai/vue_menu)
