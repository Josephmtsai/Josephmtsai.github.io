---
title: iOS Safari Handle Elastic Scroll
date: 2023-03-28 23:00:51
tags:
  - Safari
  - VueUse
  - Elastic Scrolling
  - Compatible
  - iOS
---

先說明這個問題主要是 通常在滾動頁面的時候 會有兩個需求

1. 往下滑動就要隱藏 Header

2. 開始上滑就要顯示 Header

{% asset_img sample.gif "Sample" %}

但是問題來了，iOS 有一個橡皮筋的功能叫做 Elastic Scroll ，他會造成你滑動到最上方以後 會再反彈

如果沒有寫好的話，明明就滑動到最上方還是隱藏 Header (明明 Chrome 跟其他瀏覽器不會)....

為了兼容這個問題 我們以 Vue Use 為例子做一個範例

裡面其實只有 directions 跟 y 最重要

因為我們判斷它是否為回彈事件為 判斷他 nextY ===0 代表他就在最上方

不用管他是什麼事件，這樣就可以解決了

> 這裡說明一下 為什麼使用這方法而不用 touchmove preventDefault 是因為 有可能舊版本的 safari 沒有這個 event...
> 也不想要考慮太多相容性 就先保留這個行為 但是讓結果相同

```javascript
import { useScroll } from '@vueuse/core';
import { ref, computed, toRefs, watch } from 'vue';

export default function useHeader() {
  const showHeader = ref(true);
  const winComputedRef = computed(() => window);
  const { arrivedState, y, directions } = useScroll(winComputedRef);
  const { top: toTop, bottom: toBottom } = toRefs(directions);
  const { top: topArrived } = toRefs(arrivedState);
  watch([toBottom, y], ([toBottomNewValue, nextY]) => {
    //nextY to prevent iOS safari elastic scrolling
    if (toBottomNewValue && nextY !== 0) {
      showHeader.value = false;
    } else if (nextY === 0) {
      showHeader.value = true;
    }
  });

  watch(
    () => toTop.value,
    (newValue) => {
      if (newValue) {
        showHeader.value = true;
      }
    }
  );
  return {
    showHeader,
    topArrived,
    toBottom,
    toTop,
    y,
  };
}
```

這個問題主要要考慮的是 iOS 以及 safari 版本不同 有可能有不同的事件 所以最好是找一個比較符合的解決方法

## 其他解法(要確認使用者大部分 Device 在什麼版本)

方向

1.  touchmove prevent

2.  使用 debounce 限制 scroll top 抓取事件 delay 50 ms 之類 然後判斷高度 可以使用 lodash.throttle 套件

### Reference

[Vue Use](https://vueuse.org/core/useScroll/#usage)
