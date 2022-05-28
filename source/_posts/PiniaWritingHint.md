---
title: PiniaWritingHint
date: 2022-05-28 11:15:55
tags:
  - Pinia
  - Reactive
  - Refs
  - Vue3
  - Proxy
---

# Pinia Writing Hint in Vue3

在 Vue3 使用 Pinia 做狀態管理的時候，有可能會把狀態宣告成巢狀的 Object 結構
ex: 使用者的資料

```javascript
    data: {
            UpdateTime: 0,
            Name: "",
            Status: "Active",
            Profile: { Email: "", Phone: 0 }
        }
```

因為有可能不是每次都要把所有使用者資料撈出來，會遇到一些寫法問題 請參考範例

[Code Sample](https://codesandbox.io/s/sad-fermat-p3ig62)

{% asset_img 01.png "Sample" %}
Pinia 存取的結構:
{% asset_img 02.png "Sample" %}

這裡有發現有幾種寫法就算 Pinia 狀態有改變，畫面上面的值沒有跟著連動

**Not Working Sample**

1. rootStore.data.Status
   直接把 rootStore 的屬性取出是無法做 reactive

2. data.value.Profile.Phone
   透過 storeToRefs 拉出的屬性值**注意只有屬性值不會 reactive**

3. rootStore.phoneNumber
   直接把 rootStore 的 Getter 取出是無法做 reactive

## 為什麼會這樣呢?

後面有回頭去看 Vue 3 reactive 用法

其實 reactive 是使用 proxy 做的

其實他文件上面有提到兩點很重要的

- When you assign or destructure a reactive object's property to a local variable, the reactivity is "disconnected" because access to the local variable no longer triggers the get / set proxy traps.
  意思是當你把 reactiv object 的屬性值單獨取出他就會 disconnected 因為 value update 不會被 proxy 的 get set 觸發到
  這就是對應到剛剛的問題 1 2 3
- The returned proxy from reactive(), although behaving just like the original, has a different identity if we compare it to the original using the === operator.
  當你重新把 reactive object 在 assign 出去 他會視為是不同的物件

[reactive work in vue](https://vuejs.org/guide/extras/reactivity-in-depth.html#how-reactivity-works-in-vue)

### How to Fix It?

1. 使用 getter method 透過 storeToRefs 取出單一的屬性值
   Getters are exactly the equivalent of computed values for the state of a Store.
   [Reference](https://pinia.vuejs.org/core-concepts/getters.html)
2. 單獨把屬性值透過 computed 包裝起來
3. 使用 watchEffect

以下是 working 的 sample

```javascript
const { data, phoneNumber } = storeToRefs(rootStore);
const computedTime = computed(() => {
  return data.value.UpdateTime;
});
```

為什麼要特地說明這個呢? 因為在 vue 3 中 會很常使用 composition api, 並且把一些共用的邏輯抽成 composeble 的 code
相對 Pinia 也是 可能會需要單獨取某一些值出來，所以特地記錄這塊
