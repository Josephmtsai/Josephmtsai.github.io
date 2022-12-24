---
title: TypeScript Object Using Enum as Key
date: 2022-12-24 11:59:26
tags:
  - Typescript
  - Enum
  - Object
---

我們在使用 typescript 的時候 有可能需要宣告 Enum 來避免 傳入的參數可能大小寫不符合或是傳到沒有值的參數

那相對我們在宣告物件的時候也想要把這個概念串接下來 讓我們可以使用
如下方的範例: 我們先定義一個 Enum

```
enum DateFormat {
  Default = 1, //DD/MM/YYYY HH:mm:ss
  ShortDate = 2, //DD/MMM/YYYY
  DateTimeWithComma = 3, //DD/MM/YYYY, HH:mm:ss
}
```

目標是想要使用 以下物件去宣告

```typescript
type DateLanguage = {
  en: string;
  zh: string;
};

type DateSetting{
    Default: DateLanguage
    ShortDate: DateLanguage
    DateTimeWithComma: DateLanguage
}
```

**大家有發現到嗎 假設我們新增一個 Enum 也想要相對應在 type 新增一個 key 但是又怕打錯字 或是 key 錯大小寫**

所以這是我今天想解決的問題

# Solution

首先在這個 Case 我們使用 type 是因為 type 可以使用 typeof 取出 Key 並進行定義

> 如果想了解 Interface vs type 區別 可以參考 reference
> 如圖片
> 使用 keyof type DateFormat 可以讓 DateFormatKey 必須是這三個的其中之一 不然會報錯
> {% asset_img 01.png "Example" %}

接著使用 下面方法就可以定義出來我們想要的 Key 值

```typescript
type DateFormatFields = { [key in DateFormatKeys]: DateLanguage };
```

{% asset_img 02.png "Example" %}

接著我們就可以定義我們的 object

```typescript
const dateSetting: DateFormatFields = {
  Default: {
    en: 'DD/MM/YYYY HH:mm:ss',
    zh: 'MM/DD/YYYY HH:mm:ss',
  },
  ShortDate: {
    en: 'DD/MM/YYYY',
    zh: 'MM/DD/YYYY',
  },
  DateTimeWithComma: {
    en: 'DD/MM/YYYY, HH:mm:ss',
    zh: 'MM/DD/YYYY, HH:mm:ss',
  },
};
```

最後是如何去取出呢?

一開始發現想說可能可以用 C#的寫法把 Enum 的值 to string
=> DateFormat.DateTimeWithComma.toString()
後面發現不行
要透過下面方式

```typescript
const key = DateFormat[DateFormat.DateTimeWithComma]; //string
```

是因為實際上我們使用 typescript 宣告的 enum 他對應的 out 會長這樣 所以可以用這方法取出值

```
Output
{
  "1": "North",
  "2": "East",
  "3": "South",
  "4": "West",
  "North": 1,
  "East": 2,
  "South": 3,
  "West": 4
}
```

那我們取出的方法就會是這樣

> 主要是因為 key 是 string 所以又要讓他 當成最上方的 type 傳入到我們的 object 內

```typescript
console.log(dateSetting[key as DateFormatKeys]);
```

如果是這樣寫就會噴錯

```typescript
console.log(dateSetting[key]);
```

Source Code

{% asset_img 03.png "Example" %}

# Reference

[Key of type of 分析](https://juejin.cn/post/7023238396931735583)
[Interface vs type 區別](https://juejin.cn/post/6844903749501059085)
[Interface vs Type ](https://ithelp.ithome.com.tw/articles/10224646?sc=rss.iron)
[How To Use Enums in TypeScript](https://www.digitalocean.com/community/tutorials/how-to-use-enums-in-typescript)
