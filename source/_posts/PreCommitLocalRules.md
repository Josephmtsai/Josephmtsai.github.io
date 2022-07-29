---
title: Pre Commit ESLint Local Rules
date: 2022-07-20 00:01:08
tags:
  - Vue
  - Pre-Commit
  - Custom Rules
  - File Check
  - Quality Control
  - ESLint
---

我們在開發專案的時候，為了程式碼的品質 通常會用各種輔助工具幫助我們檢查（例如： ESLint, Formater, Testing ...)

Git hooks 可以透過在 before commit 之前做一些檢查，雖然會稍微慢一點 但是為了整體的開發格式是 OK 的

此文件主要是在討論 一種情況

今天你可能在開發 Vue 元件的時候，你可能不希望有一些元件被引用了不該引用的檔案或是使用套件

EX:

填寫表單的頁面 不允許使用 Pinia or 使用特定的元件( 避免相依性之類)
這時候除了寫文件以外 一定都會想到 那我就在註解 OR Commit 的時候檢查，這時候 EsLint Local Rules 就出現了

# PreRequires

Vue & Vite Cli

主要是以下的套件需要安裝:

可以參考從[Husky Lint-staged](https://www.coffeeclass.io/articles/commit-better-code-with-husky-prettier-eslint-lint-staged) 開始安裝

1. Husky install
   > 此套件主要是可以比較簡單操作 Git hooks

```bash
npx husky-init && npm install
```

2. Lint staged install
   > 此套件主要是針對 Commit Code 只會針對這些 Commit 的檔案做優化 以及檢查 而不會所有專案內的檔案檢查 增加效率

```bash
npm i --save-dev lint-staged
```

3. Modify .husky pre-commit file
   > 修改.husky 資料夾底下的 pre-commit 檔案

```pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
```

4. Modify package.json
   > 修改 package.json 直接在 root 底下新增這個 KEY
   > 可以參考官方文件 也可以分離出來[Config](https://github.com/okonet/lint-staged#Configuration)
   > 我們只需要針對 vue ,ts, js 檔案做優化

```
"lint-staged": {
    "**/*.{js,ts,vue}": [
      "npx eslint --fix"
    ]
  }
```

接著就可以隨便測試看看 Commit 一個不合法的 js 檔案

{% asset_img 01.png "Example" %}

正常會在 GIT Console 上面顯示 eslint 檢查出來的錯誤 這樣就設定完成了
{% asset_img 02.png "Error" %}

# EsLint Local Rules

接著介紹今天的主角，如果我們想要客製一些 只有我們專案會用到的規則

就可以透過[eslint-plugin-local-rules](https://www.npmjs.com/package/eslint-plugin-local-rules)來達到

這裡直接跳過安裝，從設定開始

## Setting EsLint Local Rules

1. 在你的 ESLint Config 設定 plugin &你想要綁定的 rule 以及錯誤的程度

以 vue cli 來說預設是在 package.json 裡面 的 rules Object
新增你自訂的規則以及 plugin

```json
"eslintConfig": {
    "root": true,
    "env": {
      "node": true
    },
    "extends": [
      "plugin:vue/vue3-essential",
      "@vue/airbnb"
    ],
    "parserOptions": {
      "parser": "@babel/eslint-parser"
    },
    "rules": {
      "max-len": [
        "error",
        {
          "code": 1000
        }
      ],
      "local-rules/disallow-identifiers": "error"
    },
    "plugins": [
      "eslint-plugin-local-rules"
    ]
  },
```

2. 接著 create eslint-local-rules folder and index.js 制定出我們需要的規則

文件可以參考此[working-with-rules](https://eslint.org/docs/latest/developer-guide/working-with-rules#runtime-rules)

首先我們先以[Demo](https://github.com/Josephmtsai/vue_menu)
來看

我們先自訂一個 local rules 用途主要是 comment 有
//eslint-disable-package: testbutton
他就去檢查 import 的元件是否有 TestButton 這個字眼

```javascript
module.exports = {
  'vue-package-checker': {
    meta: {
      fixable: 'code',
      docs: {
        description: 'Should not using TestButton in this component',
        category: 'Possible Errors',
        recommended: false,
      },
      schema: [],
    },
    create(context) {
      return {
        ImportDeclaration(node) {
          // 只撈取import相關的資訊
          const comments = context.getAllComments();
          if (
            comments.findIndex((comment) =>
              comment.value.includes('eslint-disable-package: testbutton')
            ) !== -1
          ) {
            if (node.source.value.includes('TestButton')) {
              context.report({
                node,
                message: 'Should not using TestButton in this component',
              });
            }
          }
        },
      };
    },
  },
};
```

我們可以透過 Commit 來測試,也可以透過 report 錯誤把資訊印出來 Debug

```javascript
context.report({
  node,
  message: node.source.value,
});
```

{% asset_img 03.png "Example" %}

在上面的連結中 也有各式各樣的 Statement 可以去檢查變數的命名或是 Catch 的錯誤之類的資訊
VariableDeclaration
CatchClause

也可以參考以下這篇文章
[中文版 Custom Rules](https://cn.eslint.org/docs/developer-guide/working-with-rules)
....

## 用途

這個用途主要是在 如果在測試不足的狀況下
可以透過自訂 ESLINT 規則來規範團隊的開發.並且避免一些不必要的引用. 尤其是有可能這個元件也會需要給第三方 或是其他人使用

# Reference

[Commit Better Code with Husky, Prettier, ESLint, and Lint-Staged](https://www.coffeeclass.io/articles/commit-better-code-with-husky-prettier-eslint-lint-staged)
[Husky - Git Hooks 工具](https://ithelp.ithome.com.tw/articles/10278411)
[working-with-rules](https://eslint.org/docs/latest/developer-guide/working-with-rules#runtime-rules)
