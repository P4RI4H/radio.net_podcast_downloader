# 🎙 Radio.net Podcast MP3 Extractor

If you find this script useful, you can support development:

## 💰 Support

[![Donate using Cashapp](/.assets/cashapp_button.png)](https://cash.app/$p4ri4h)[![Donate using Liberapay](/.assets/liberapay_button.png)](https://liberapay.com/p4ri4h/donate)

**Cash App:** $p4ri4h  
![Cash App QR](/.assets/cashapp-qr.png)

**Bitcoin:** `bc1q63q3thx2vmf9cyxqld5td6896z3k939pct4f0r`   
![Bitcoin QR](/.assets/bitcoin-qr.png)


---

## TL;DR

1. Install Tampermonkey.
2. Add this script.
3. Open a radio.net podcast page.
4. Click extract.
5. Export links or download directly.

Done.

---

## 📌 What This Script Does

This Tampermonkey user script extracts direct MP3 links from radio.net podcast pages and allows you to:

- Extract episodes from the current page
- Extract episodes from all pages
- Export links to a text file
- Export a `.crawljob` file for JDownloader
- Direct download episodes (with rate limiting)

---

## 🚀 Installation

1. Install the **Tampermonkey** browser extension.
2. Open Tampermonkey Dashboard.
3. Click **Create a new script**.
4. Delete the template code.
5. Paste the full script from this repository.
6. Save.

---

## ▶ How to Use

1. Visit any podcast page on: https://www.radio.net/podcast/

2. The **Podcast Extractor panel** will appear in the top-right corner.

3. Choose one of the extraction options:
- **Pick Single Episode**
- **All Episodes This Page**
- **All Episodes Every Page**

4. After extracting, you can:
- **Export to Text**
- **Export for JDownloader**
- **Direct Download All**

---

## 📦 JDownloader Workflow (Recommended)

1. Extract episodes.
2. Click **Export for JDownloader**.
3. Move the downloaded `.crawljob` file into your JDownloader watch folder. 
4. JDownloader will automatically queue the downloads.

(Personally, I just add a shortcut to this directory in the directory I download my crawljob files and then drag them to the shortcut.)

See JDownloader Folder Watch documentation:
https://support.jdownloader.org/en/knowledgebase/article/folder-watch-basic-usage

---

## ⚖ License

Copyright (c) 2026 P4RI4H  
Personal, non-commercial use only.  
Redistribution or commercial use without permission is prohibited.

Full license text is available in the LICENSE file.
