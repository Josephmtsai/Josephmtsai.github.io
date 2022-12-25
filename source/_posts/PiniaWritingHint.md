---
title: Pinia Writing Hint in Composition Api
date: 2022-12-26 00:15:55
tags:
  - Pinia
  - Reactive
  - Refs
  - Composition Api
  - Proxy
  - StoreToRefs
---

在 Composition Api 使用 Pinia 做狀態管理的時候,官方網站上面有寫說

{% asset_img 03.png "Sample" %}

寫一陣子後才想到有遇過幾個問題

怎麼樣算是沒有 refs or reactive , 並且怎樣寫才是正確的呢?

先看一下我們定義的 State

以 number , array ,object 為例子來講解一下我們使用的方法

```javascript
import { defineStore } from 'pinia';
export const useCounter = defineStore({
  id: 'counter',

  state: () => ({
    n: 2,
    decrementedTimes: 0,
    numbers: [],
    data: {
      user: 'joseph',
      age: 13,
      profile: {
        role: 'aaa',
      },
    },
  }),

  getters: {
    double: (state) => state.n * 2,
  },

  actions: {
    increment(amount = 1) {
      this.n += amount;
    },
    setupUser(userName, profile) {
      this.data.user = userName;
      this.data.profile.role = profile;
    },
    pushNumber(number) {
      this.numbers.push(number);
    },
  },
});
```

[Sample](https://codesandbox.io/s/pinia-testing-i1lqly)
我們用三個層面來探討

1.  Counter Store 建立實體

```javascript
import { useCounter } from './stores/counter';
const counter = useCounter();
```

2. Counter Store 解構方式取出 (錯誤方法)

```javascript
const {
  n: unRefCounts,
  numbers: unRefNumbers,
  data: unRefData,
  double: unRefDouble,
} = useCounter();
```

3. Counter Store 解構方式取出 (StoreToRefs)

```javascript
const { n, numbers, data, double } = storeToRefs(counter);
```

# Counter Store 建立實體

這個最不需要討論 因為建立實體後 可以調用所有的 method 屬性跟 Getter 都會是雙向綁定的
只是缺點是 每次使用都要 counter.xxx counter.xxx 有點麻煩

```javascript
import { useCounter } from './stores/counter';
const counter = useCounter();
```

{% asset_img 04.png "Sample" %}

# Counter Store 解構方式取出 (錯誤方法)

因為在 ES6 上面建立的解構的方法 所以一開始大家都會想要用這種方法片段的取出值

```javascript
const {
  n: unRefCounts,
  numbers: unRefNumbers,
  data: unRefData,
  double: unRefDouble,
} = useCounter();
```

{% asset_img 05.png "Sample" %}

大家可以看到 標黑色的部分 因為單純的 number or string 這些都是 call by value 所以透過解構的方法並不會雙向綁定
但是物件跟陣列是會的

**為了避免混用 我們還是少用這種方法**

# Counter Store 解構方式取出 (StoreToRefs)

這是官方推薦的方法

```javascript
const { n, numbers, data, double } = storeToRefs(counter);
```

這樣就可以把 n 直接做雙向綁定 只要操作的時候使用 n.value ++就可以

但是要注意一件事情. storeToRefs 出來的值 如果再將其中的子屬性 assign 出去也不會有 two way binding 的效果

```javascript
const userName = data.value.user;
```

{% asset_img 06.png "Sample" %}

那如果我們還是希望可以有子屬性有 two way binding 的效果可以參考以下範例

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
