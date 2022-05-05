---
title: InterceptInApp
date: 2022-05-05 22:21:35
tags:
  - Intecept Request
  - App Debug
  - Web Debug
---

# 在手機上如何攔截到 http Request

Motivation

> 在開發 App 的過程中，最常會遇到的幾個問題是

1. 在 Native App 中 鑲嵌的 Api Request 是否有送出到 Server Side
2. 在 Native App 中 發送 Request 的格式以及原始資料是什麼?
   (假定你想要觀看別人的 App 運作)

## PreRequires

1. (https://www.charlesproxy.com/)[Charles] 攔截 Http Request
2. Wifi

### Steps

打開 Charles 後

1. 先去 Proxy =>Proxy Setting
   指定你想要的 port 以及把設定都打勾

{% asset_img 01.png "Proxy Setting" %}

2. Help=> Local IP Address
   確定自己的 IP
   {% asset_img 02.png "IP Setting" %}
