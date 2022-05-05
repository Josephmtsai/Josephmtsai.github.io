---
title: InterceptInApp
date: 2022-05-05 22:21:35
tags:
  - Intecept Request
  - App Debug
  - Web Debug
---

# 在手機上如何攔截到 http Request

> 在開發 App 的過程中，最常會遇到的幾個問題是

1. 在 Native App 中 鑲嵌的 Api Request 是否有送出到 Server Side
2. 在 Native App 中 發送 Request 的格式以及原始資料是什麼?
   (假定你想要觀看別人的 App 運作)

## PreRequires

1. [Charles](https://www.charlesproxy.com/) 攔截 Http Request
2. Wifi with App Device

### Steps

打開 Charles 後

1. 先去 Proxy =>Proxy Setting
   指定你想要的 port 以及把設定都打勾
   {% asset_img 01.png "Proxy Setting" %}

2. Help=> Local IP Address
   確定自己的 IP
   {% asset_img 02.png "IP Setting" %}

3. 回到手機 填上你的 Proxy 根據 1 &2 的 ip & port
   {% asset_img 03.jpg "Phone Setting" %}

4. 接著應該會跳出下圖 點選 Allow (如果選錯的話請重開 Charles 並且讓手機重新連線)
   {% asset_img 04.png %}
5. 那接著就可以選取你手機上面的 App 去觀察 Request
   {% asset_img 05.png %}

6. 接著去 Charles 這裡就可以點開 Request 觀察
   {% asset_img 06.png %}
   {% asset_img 07.png %}

### 心得

從一些小地方可以看到 在 App 開發中 為了讓 User 不一直重複登入

會發給類似 Token 的東西 以及 Device ID 去判斷此帳號是否登入

萬一被有心人士透過不可靠的 Wifi 攔截

就可以拿到此人相關的資訊

我們也可以透過 Postman ....方式直接拿取 App 背後的 Api 資訊
