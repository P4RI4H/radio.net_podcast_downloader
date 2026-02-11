// Copyright (c) 2026 P4RI4H
// Licensed for personal, non-commercial use only.
// Redistribution or commercial use without permission is prohibited.
// https://github.com/P4RI4H/radio.net_podcast_downloader
// ==UserScript==
// @name         Radio.net Podcast MP3 Extractor
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Extract and download podcast episodes from any radio.net podcast page
// @author       P4RI4H
// @match        https://www.radio.net/podcast/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────
    let episodes = [];
    let currentDownloadIndex = 0;
    let isDownloading = false;
    let isExtracting = false;

    // ─────────────────────────────────────────────
    //  PANEL
    // ─────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid #333;
        border-radius: 8px;
        padding: 15px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        width: 300px;
        font-family: Arial, sans-serif;
        font-size: 13px;
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3 style="margin:0; color:#333; font-size:15px;">&#127908; Podcast Extractor</h3>
            <button id="minimize-btn" style="background:none; border:none; cursor:pointer; font-size:16px; color:#999;" title="Minimize">&#8212;</button>
        </div>

        <div id="panel-body">

            <div style="font-size:10px; font-weight:bold; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">Extract</div>

            <button id="pick-episode-btn" style="width:100%; padding:8px; margin-bottom:4px; background:#7B1FA2; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Pick Single Episode</button>

            <div id="episode-picker" style="display:none; margin-bottom:6px; max-height:200px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; padding:5px; background:#fafafa;"></div>

            <button id="extract-current-btn" style="width:100%; padding:8px; margin-bottom:4px; background:#8BC34A; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">All Episodes This Page</button>
            <button id="extract-all-btn" style="width:100%; padding:8px; margin-bottom:10px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">All Episodes Every Page</button>

            <div style="font-size:10px; font-weight:bold; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">Export</div>

            <button id="export-text-btn" style="width:100%; padding:8px; margin-bottom:4px; background:#FF9800; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" disabled>Export to Text</button>
            <button id="export-jdownloader-btn" style="width:100%; padding:8px; margin-bottom:10px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" disabled>Export for JDownloader</button>

            <div style="font-size:10px; font-weight:bold; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">Direct Download</div>

            <button id="download-all-btn" style="width:100%; padding:8px; margin-bottom:10px; background:#f44336; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" disabled>Direct Download All</button>

            <button id="settings-btn" style="width:100%; padding:8px; background:#9E9E9E; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">&#9881; Settings</button>

            <div id="status" style="margin-top:10px; font-size:12px; color:#666; word-wrap:break-word; line-height:1.5;"></div>
            <div id="episode-count" style="font-size:12px; font-weight:bold; color:#333; margin-top:3px;"></div>
        </div>
    `;

    document.body.appendChild(panel);

    // Minimize toggle
    let minimized = false;
    document.getElementById('minimize-btn').onclick = () => {
        minimized = !minimized;
        document.getElementById('panel-body').style.display = minimized ? 'none' : 'block';
        document.getElementById('minimize-btn').textContent = minimized ? '\u25b2' : '\u2014';
    };

    // ─────────────────────────────────────────────
    //  SCRAPING HELPERS
    // ─────────────────────────────────────────────

    function getPodcastName() {
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        return document.title.replace(/\s*[-|].*$/, '').trim() || 'Podcast';
    }

    function scrapeEpisodeSynopsis(containerEl) {
        if (!containerEl) return '';
        const descSelectors = [
            '[class*="description"]',
            '[class*="synopsis"]',
            '[class*="summary"]',
            '[class*="subtitle"]',
            '[data-testid*="description"]',
            '[data-testid*="synopsis"]',
            'p'
        ];
        for (const sel of descSelectors) {
            const el = containerEl.querySelector(sel);
            if (el && el.textContent.trim().length > 30) {
                return el.textContent.trim().replace(/\s+/g, ' ');
            }
        }
        // Last resort: grab meaningful lines from container text
        const allText = containerEl.innerText || '';
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 30);
        return lines.slice(1).join(' ').replace(/\s+/g, ' ').substring(0, 1000);
    }

    function extractFromFiber(domEl) {
        const reactKey = Object.keys(domEl).find(k => k.startsWith('__reactFiber'));
        if (!reactKey) return null;

        let fiber = domEl[reactKey];
        for (let i = 0; i < 20; i++) {
            if (fiber?.memoizedProps) {
                const props = fiber.memoizedProps;
                const episodeObj = props.episode || props.item || props.data;
                if (episodeObj && episodeObj.url && episodeObj.url.includes('.mp3')) {
                    return {
                        title: (episodeObj.title || 'Unknown').trim(),
                        url: episodeObj.url,
                        duration: episodeObj.duration || '',
                        publishDate: episodeObj.publishDate || '',
                        synopsis: (
                            episodeObj.description ||
                            episodeObj.synopsis ||
                            episodeObj.summary ||
                            episodeObj.subtitle || ''
                        ).trim()
                    };
                }
            }
            fiber = fiber?.return;
            if (!fiber) break;
        }
        return null;
    }

    // Returns array of { data, el } for the current visible page
    function getPageEpisodeNodes() {
        const results = [];
        const containers = document.querySelectorAll('[data-testid*="episode"], [class*="episode"]');

        containers.forEach(el => {
            const data = extractFromFiber(el);
            if (!data) return;
            if (results.some(r => r.data.url === data.url)) return;

            if (!data.synopsis) {
                data.synopsis = scrapeEpisodeSynopsis(el);
            }

            results.push({ data, el });
        });

        return results;
    }

    function extractEpisodesFromCurrentPage() {
        return getPageEpisodeNodes().map(r => r.data);
    }

    // ─────────────────────────────────────────────
    //  PAGINATION
    // ─────────────────────────────────────────────

    function getMaxPageNumber() {
        const buttons = document.querySelectorAll(
            '[data-testid*="paginator-page"], [aria-label*="Page"], button[data-module="episodes_of_podcast"]'
        );
        let maxPage = 1;
        buttons.forEach(btn => {
            const m = btn.getAttribute('aria-label')?.match(/Page (\d+)/) ||
                      btn.getAttribute('data-testid')?.match(/page-(\d+)/) ||
                      btn.textContent?.match(/(\d+)/);
            if (m) {
                const n = parseInt(m[1]);
                if (n > maxPage) maxPage = n;
            }
        });
        return maxPage;
    }

    function navigateToPage(pageNumber) {
        return new Promise(resolve => {
            const btn = document.querySelector(
                `[aria-label="Page ${pageNumber}"], [data-testid*="page-${pageNumber}"]`
            );
            if (!btn) return resolve(false);
            btn.click();
            setTimeout(() => {
                const check = () => {
                    const eps = document.querySelectorAll('[data-testid*="episode"], [class*="episode"]');
                    if (eps.length > 0) resolve(true);
                    else setTimeout(check, 500);
                };
                setTimeout(check, 1000);
            }, 1000);
        });
    }

    // ─────────────────────────────────────────────
    //  EXTRACT ACTIONS
    // ─────────────────────────────────────────────

    function showEpisodePicker() {
        const pageNodes = getPageEpisodeNodes();
        const picker = document.getElementById('episode-picker');

        if (pageNodes.length === 0) {
            updateStatus('No episodes found on this page.');
            return;
        }

        picker.innerHTML = '';
        picker.style.display = 'block';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px; color:#555; margin-bottom:5px; font-weight:bold;';
        label.textContent = 'Tap an episode to add it:';
        picker.appendChild(label);

        pageNodes.forEach((node, i) => {
            const row = document.createElement('div');
            const alreadyAdded = episodes.some(e => e.url === node.data.url);

            row.style.cssText = `
                display: flex; align-items: center; gap: 6px;
                padding: 5px; margin-bottom: 3px;
                background: ${alreadyAdded ? '#E1BEE7' : '#F3E5F5'};
                border: 1px solid #CE93D8;
                border-radius: 4px; cursor: pointer;
                opacity: ${alreadyAdded ? '0.7' : '1'};
            `;

            const tick = document.createElement('span');
            tick.style.cssText = 'font-size:14px; min-width:16px; text-align:center; flex-shrink:0;';
            tick.textContent = alreadyAdded ? '\u2705' : '\u2795';

            const titleEl = document.createElement('span');
            titleEl.style.cssText = 'font-size:11px; color:#4A148C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            titleEl.textContent = `${i + 1}. ${node.data.title}`;
            titleEl.title = node.data.title;

            row.appendChild(tick);
            row.appendChild(titleEl);

            row.onclick = () => {
                const alreadyIn = episodes.some(e => e.url === node.data.url);
                if (!alreadyIn) {
                    episodes.push(node.data);
                    tick.textContent = '\u2705';
                    row.style.background = '#E1BEE7';
                    row.style.opacity = '0.7';
                    updateEpisodeCount();
                    enableExportButtons();
                    updateStatus(`Added: "${node.data.title}"`);
                } else {
                    updateStatus(`Already added: "${node.data.title}"`);
                }
            };

            picker.appendChild(row);
        });

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            width:100%; padding:5px; margin-top:4px;
            background:#eee; color:#555; border:1px solid #ccc;
            border-radius:4px; cursor:pointer; font-size:11px;
        `;
        closeBtn.textContent = '\u2715 Close Picker';
        closeBtn.onclick = () => {
            picker.style.display = 'none';
            picker.innerHTML = '';
        };
        picker.appendChild(closeBtn);
    }

    function extractCurrentPageOnly() {
        const pageEps = extractEpisodesFromCurrentPage();
        let added = 0;
        pageEps.forEach(ep => {
            if (!episodes.some(e => e.url === ep.url)) {
                episodes.push(ep);
                added++;
            }
        });
        updateEpisodeCount();
        enableExportButtons();
        updateStatus(`Added ${added} new episode(s) from this page.`);
    }

    async function extractAllPages() {
        if (isExtracting) { alert('Extraction already in progress!'); return; }
        isExtracting = true;
        episodes = [];
        updateEpisodeCount();

        updateStatus('Scanning pages\u2026');
        const maxPage = getMaxPageNumber();
        updateStatus(`Found ${maxPage} page(s). Extracting\u2026`);

        const p1 = extractEpisodesFromCurrentPage();
        episodes = episodes.concat(p1);
        updateStatus(`Page 1/${maxPage}: ${p1.length} eps (Total: ${episodes.length})`);
        updateEpisodeCount();

        for (let page = 2; page <= maxPage; page++) {
            updateStatus(`Navigating to page ${page}/${maxPage}\u2026`);
            const ok = await navigateToPage(page);
            if (ok) {
                const pageEps = extractEpisodesFromCurrentPage();
                pageEps.forEach(ep => {
                    if (!episodes.some(e => e.url === ep.url)) episodes.push(ep);
                });
                updateStatus(`Page ${page}/${maxPage}: ${pageEps.length} eps (Total: ${episodes.length})`);
                updateEpisodeCount();
            } else {
                updateStatus(`Could not navigate to page ${page}, skipping.`);
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        updateStatus(`Done! ${episodes.length} episodes extracted from ${maxPage} page(s).`);
        enableExportButtons();
        isExtracting = false;
    }

    // ─────────────────────────────────────────────
    //  EXPORT ACTIONS
    // ─────────────────────────────────────────────

    // Plain text: episode title on one line, URL on next, blank line between
    function exportToText() {
        if (episodes.length === 0) { updateStatus('No episodes to export.'); return; }

        const lines = episodes.map(ep => `${ep.title}\n${ep.url}`).join('\n\n');

        const blob = new Blob([lines], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'podcast_episodes.txt';
        a.click();
        URL.revokeObjectURL(url);
        updateStatus(`Exported ${episodes.length} episode(s) to text file.`);
    }

    // JDownloader crawljob format
    function exportForJDownloader() {
        if (episodes.length === 0) { updateStatus('No episodes to export.'); return; }

        const podcastName = getPodcastName().replace(/[<>:"/\\|?*]/g, '').trim();
        const watchFolder = GM_getValue('watchFolder', '').trim();

        const blocks = episodes.map(ep => {
            const safeTitle = ep.title.replace(/[<>:"/\\|?*]/g, '').trim();
            const synopsis = (ep.synopsis || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

            return [
                `comment=${synopsis}`,
                `text=${ep.url}`,
                `packageName=${podcastName}`,
                `filename=${safeTitle}.mp3`
            ].join('\n');
        });

        const content = blocks.join('\n\n');
        const fileName = `${podcastName}.crawljob`;

        // Detect if watchFolder is a relative path (no drive letter like C:\ and no leading / or \)
        // If relative, we can use GM_download to save directly into that subfolder of the
        // browser's default downloads directory.
        const isRelativePath = watchFolder &&
            !watchFolder.match(/^[A-Za-z]:[\\\/]/) &&   // not C:\ style absolute
            !watchFolder.match(/^[\/\\]/);               // not /absolute or \absolute

        if (isRelativePath) {
            // Normalise separators to forward slash for GM_download
            const cleanFolder = watchFolder.replace(/\\/g, '/').replace(/\/$/, '');
            GM_download({
                url: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
                name: `${cleanFolder}/${fileName}`,
                saveAs: false,
                onload: () => updateStatus(`✔ Saved "${fileName}" directly to Downloads/${cleanFolder}/`),
                onerror: () => {
                    // Fallback to normal download if GM_download fails
                    triggerBlobDownload(content, fileName);
                    updateStatus(`Could not auto-save to subfolder — downloaded normally. Move to: ${watchFolder}`);
                }
            });
        } else {
            // Absolute path or no path set — download normally and show reminder
            triggerBlobDownload(content, fileName);
            if (watchFolder) {
                updateStatus(`✔ Saved "${fileName}" — move it to your watch folder: ${watchFolder}`);
            } else {
                updateStatus(`✔ Exported "${fileName}". Set a Watch Folder in Settings to get location reminders.`);
            }
        }
    }

    function triggerBlobDownload(content, fileName) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─────────────────────────────────────────────
    //  DIRECT DOWNLOAD
    // ─────────────────────────────────────────────

    function downloadAllMP3s() {
        if (isDownloading) { alert('Download already in progress!'); return; }

        const limit = parseInt(GM_getValue('downloadLimit', '10'));
        const delay = parseInt(GM_getValue('downloadDelay', '2000'));
        let toDownload = [...episodes];

        if (toDownload.length > limit) {
            const proceed = confirm(
                `You have ${toDownload.length} episodes queued. Your limit is ${limit}.\nDownload only the first ${limit}?`
            );
            if (!proceed) return;
            toDownload = toDownload.slice(0, limit);
        }

        isDownloading = true;
        currentDownloadIndex = 0;
        downloadNext(toDownload, delay);
    }

    function downloadNext(queue, delay) {
        if (currentDownloadIndex >= queue.length) {
            updateStatus('All downloads complete!');
            isDownloading = false;
            return;
        }
        const ep = queue[currentDownloadIndex];
        const safeTitle = ep.title.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        updateStatus(`Downloading ${currentDownloadIndex + 1}/${queue.length}: ${ep.title}`);

        GM_download({
            url: ep.url,
            name: `${safeTitle}.mp3`,
            saveAs: false,
            onload: () => {
                currentDownloadIndex++;
                setTimeout(() => downloadNext(queue, delay), delay);
            },
            onerror: (err) => {
                console.error('Download failed:', ep.title, err);
                updateStatus(`Error downloading: ${ep.title}`);
                currentDownloadIndex++;
                setTimeout(() => downloadNext(queue, delay), delay);
            }
        });
    }

    // ─────────────────────────────────────────────
    //  SETTINGS MODAL (tabbed)
    // ─────────────────────────────────────────────

    function showSettings() {
        const currentLimit = GM_getValue('downloadLimit', '10');
        const currentDelay = GM_getValue('downloadDelay', '2000');

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; top:0; left:0; right:0; bottom:0;
            background:rgba(0,0,0,0.6); z-index:10001;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            position:fixed; top:50%; left:50%;
            transform:translate(-50%,-50%);
            background:white; padding:0;
            border-radius:10px;
            box-shadow:0 8px 32px rgba(0,0,0,0.4);
            z-index:10002;
            width:520px;
            max-width:95vw;
            max-height:88vh;
            overflow:hidden;
            display:flex;
            flex-direction:column;
            font-family:Arial, sans-serif;
            font-size:13px;
        `;

        modal.innerHTML = `
            <!-- Tab Bar -->
            <div style="display:flex; border-bottom:2px solid #eee; background:#f8f8f8; border-radius:10px 10px 0 0; flex-shrink:0;">
                <button class="tab-btn" data-tab="general"
                    style="flex:1; padding:12px; border:none; background:transparent; cursor:pointer;
                           font-weight:bold; font-size:13px; color:#333; border-bottom:3px solid #4CAF50;">
                    General
                </button>
                <button class="tab-btn" data-tab="jdownloader"
                    style="flex:1; padding:12px; border:none; background:transparent; cursor:pointer;
                           font-size:13px; color:#999; border-bottom:3px solid transparent;">
                    JDownloader Setup
                </button>
                <button class="tab-btn" data-tab="about"
                    style="flex:1; padding:12px; border:none; background:transparent; cursor:pointer;
                           font-size:13px; color:#999; border-bottom:3px solid transparent;">
                    About
                </button>
            </div>

            <!-- Tab: General -->
            <div id="tab-general" class="tab-content" style="padding:25px; overflow-y:auto; flex:1;">
                <h3 style="margin:0 0 20px 0; color:#333;">General Settings</h3>

                <div style="margin-bottom:18px;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold;">Max Episodes for Direct Download:</label>
                    <input type="number" id="download-limit" value="${currentLimit}" min="1" max="1000"
                        style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc; box-sizing:border-box;">
                    <small style="color:#888; display:block; margin-top:4px;">Safety limit &mdash; does not apply to JDownloader or text exports.</small>
                </div>

                <div style="margin-bottom:18px;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold;">Delay Between Direct Downloads (ms):</label>
                    <input type="number" id="download-delay" value="${currentDelay}" min="500" max="10000" step="500"
                        style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc; box-sizing:border-box;">
                    <small style="color:#888; display:block; margin-top:4px;">Recommended: 2000ms (2 seconds) to avoid rate limiting.</small>
                </div>

                <div style="margin-bottom:18px;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold;">JDownloader Watch Folder Path (optional):</label>
                    <input type="text" id="watch-folder" value="${GM_getValue('watchFolder', '')}"
                        placeholder="e.g. C:\\JD_Watch or /home/user/jd_watch"
                        style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc; box-sizing:border-box;">
                    <small style="color:#555; display:block; margin-top:6px; line-height:1.6;">
                        <strong>Relative path</strong> (e.g. <code>JD_Watch</code> or <code>JD_Watch/crawljobs</code>)<br>
                        &rarr; File saves <em>automatically</em> into that subfolder inside your browser Downloads folder.
                        Just point JDownloader&apos;s watch folder at <code>[Downloads]/JD_Watch</code>.<br><br>
                        <strong>Absolute path</strong> (e.g. <code>C:\JD_Watch</code> or <code>/home/user/jd_watch</code>)<br>
                        &rarr; Browsers can&apos;t save to arbitrary locations, so the file downloads normally and this path
                        is shown as a reminder of where to move it.
                    </small>
                </div>

                <div style="background:#f0f8ff; border-radius:6px; padding:15px;">
                    <h4 style="margin:0 0 10px 0; color:#333;">Recommended Workflow</h4>
                    <ol style="margin:0; padding-left:20px; color:#555; line-height:1.9;">
                        <li>Pick individual episodes, extract this page, or extract all pages</li>
                        <li>Use <strong>Export for JDownloader</strong> to create a <code>.crawljob</code> file</li>
                        <li>Move the file to your JDownloader watch folder to start downloading</li>
                    </ol>
                </div>
            </div>

            <!-- Tab: JDownloader Setup -->
            <div id="tab-jdownloader" class="tab-content" style="display:none; padding:25px; overflow-y:auto; flex:1;">
                <h3 style="margin:0 0 5px 0; color:#333;">JDownloader Auto-Naming Setup</h3>
                <p style="color:#888; font-size:12px; margin:0 0 20px 0;">Configure JDownloader to use the folder watch feature and auto-name files from your crawljob export.</p>

                <div style="background:#fff8e1; border-left:4px solid #FFC107; padding:12px 15px; border-radius:4px; margin-bottom:18px;">
                    <strong>&#128214; Official JDownloader Folder Watch Guide:</strong><br>
                    <a href="https://support.jdownloader.org/en/knowledgebase/article/folder-watch-basic-usage"
                       target="_blank"
                       style="color:#2196F3; word-break:break-all; display:block; margin-top:5px;">
                       https://support.jdownloader.org/en/knowledgebase/article/folder-watch-basic-usage
                    </a>
                </div>

                <div style="margin-bottom:18px;">
                    <h4 style="margin:0 0 10px 0; color:#333;">Step 1 &mdash; Enable Folder Watch in JDownloader</h4>
                    <ol style="margin:0; padding-left:20px; color:#555; line-height:1.9;">
                        <li>Open JDownloader and go to <strong>Settings</strong></li>
                        <li>Click <strong>Advanced Settings</strong></li>
                        <li>In the search box, type <code>FolderWatch</code></li>
                        <li>Set <strong>FolderWatch Directory</strong> to a folder on your computer<br>
                            <span style="color:#888;">(e.g. <code>C:\JD_Watch</code> or <code>~/jd_watch</code>)</span></li>
                        <li>Set <strong>FolderWatch Active</strong> to <code>true</code></li>
                    </ol>
                </div>

                <div style="margin-bottom:18px;">
                    <h4 style="margin:0 0 10px 0; color:#333;">Step 2 &mdash; Export and Drop the File</h4>
                    <ol style="margin:0; padding-left:20px; color:#555; line-height:1.9;">
                        <li>Extract your episodes using this script</li>
                        <li>Click <strong>Export for JDownloader</strong> &mdash; a <code>.crawljob</code> file will download</li>
                        <li>Move the <code>.crawljob</code> file into your JDownloader watch folder</li>
                        <li>JDownloader detects it automatically and queues all the downloads</li>
                    </ol>
                </div>

                <div style="margin-bottom:18px;">
                    <h4 style="margin:0 0 10px 0; color:#333;">Step 3 &mdash; Auto File Naming</h4>
                    <p style="color:#555; line-height:1.7; margin:0 0 10px 0;">
                        The exported crawljob already includes a <code>filename=</code> field with the episode title
                        and a <code>packageName=</code> field with the podcast name.
                        JDownloader will use these automatically &mdash; no extra configuration needed.
                    </p>
                    <div style="background:#f5f5f5; border-radius:4px; padding:12px; font-family:monospace; font-size:12px; color:#333; line-height:2;">
                        comment=Episode synopsis goes here&hellip;<br>
                        text=https://example.com/episode.mp3<br>
                        packageName=Podcast Name<br>
                        filename=Episode Title.mp3
                    </div>
                </div>

                <div style="background:#e8f5e9; border-left:4px solid #4CAF50; padding:12px 15px; border-radius:4px;">
                    <strong>&#128161; Tip:</strong>
                    <p style="margin:6px 0 0 0; color:#555; line-height:1.6;">
                        If JDownloader ignores the filename, go to
                        <strong>Settings &rarr; Save To</strong> and ensure
                        <em>"Use filename from download list"</em> is enabled.
                        You can also check the <strong>Filename</strong> column in the download list
                        to confirm the name was picked up correctly before starting.
                    </p>
                </div>
            </div>

            <!-- Tab: About -->
            <div id="tab-about" class="tab-content" style="display:none; padding:25px; overflow-y:auto; flex:1;">
                <h3 style="margin:0 0 15px 0; color:#333;">About This Script</h3>

                <!-- INSERT YOUR README CONTENT HERE -->
                <p style="color:#666; line-height:1.7;">

                    Full README can be found <a href="https://github.com/P4RI4H/radio.net_podcast_downloader">HERE</a>.<br>
                    If you find this script useful, you can support development:

                </p>

                <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">

                <h4 style="margin:0 0 10px 0; color:#333;">Support This Project</h4>

                <div style="display:flex; gap:20px; margin-bottom:20px;">
                    <!-- Cash App QR Code -->
                    <div style="flex:1; text-align:center;">
                        <p style="margin:0 0 10px 0; font-weight:bold; color:#555;">Cash App</p>
                        <!-- INSERT CASH APP QR BASE64 HERE -->
                        <div style="background:#f5f5f5; border:1px solid #ddd; border-radius:8px; padding:20px;">
                            <img src="data:image/png;base64,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" style="width:100%; height:auto; display:block;">
                        </div>
                        <p style="margin:10px 0 0 0; font-size:12px; color:#666;">$p4ri4h</p>
                    </div>

                    <!-- Bitcoin QR Code -->
                    <div style="flex:1; text-align:center;">
                        <p style="margin:0 0 10px 0; font-weight:bold; color:#555;">Bitcoin</p>
                        <!-- INSERT BITCOIN QR BASE64 HERE -->
                        <div style="background:#f5f5f5; border:1px solid #ddd; border-radius:8px; padding:20px;">
                            <img src="data:image/png;base64,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" style="width:100%; height:auto; display:block;">
                        </div>
                        <p style="margin:10px 0 0 0; font-size:11px; color:#666; word-break:break-all;">bc1q63q3thx2vmf9cyxqld5td6896z3k939pct4f0r</p>
                    </div>
                </div>

                <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">

                <div style="background:#f9f9f9; border-radius:6px; padding:15px;">
                    <h4 style="margin:0 0 10px 0; color:#333;">License</h4>
                    <p style="margin:0; color:#666; font-size:12px; line-height:1.6;">
                        Copyright &copy; 2026 P4RI4H<br>
                        Licensed for personal, non-commercial use only.<br>
                        Redistribution or commercial use without permission is prohibited.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="display:flex; gap:10px; padding:15px 25px; border-top:1px solid #eee; background:#fafafa; border-radius:0 0 10px 10px; flex-shrink:0;">
                <button id="save-settings-btn" style="flex:1; padding:10px; background:#4CAF50; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px;">Save Settings</button>
                <button id="cancel-settings-btn" style="flex:1; padding:10px; background:#f44336; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px;">Close</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // Tab switching logic
        modal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                modal.querySelectorAll('.tab-btn').forEach(b => {
                    b.style.borderBottom = '3px solid transparent';
                    b.style.color = '#999';
                    b.style.fontWeight = 'normal';
                });
                modal.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                btn.style.borderBottom = '3px solid #4CAF50';
                btn.style.color = '#333';
                btn.style.fontWeight = 'bold';
                modal.querySelector(`#tab-${btn.dataset.tab}`).style.display = 'block';
            };
        });

        modal.querySelector('#save-settings-btn').onclick = () => {
            GM_setValue('downloadLimit', modal.querySelector('#download-limit').value);
            GM_setValue('downloadDelay', modal.querySelector('#download-delay').value);
            GM_setValue('watchFolder', modal.querySelector('#watch-folder').value.trim());
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
            updateStatus('Settings saved!');
        };

        const closeModal = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };
        modal.querySelector('#cancel-settings-btn').onclick = closeModal;
        overlay.onclick = closeModal;
    }

    // ─────────────────────────────────────────────
    //  UI HELPERS
    // ─────────────────────────────────────────────

    function updateStatus(msg) {
        document.getElementById('status').textContent = msg;
    }

    function updateEpisodeCount() {
        const el = document.getElementById('episode-count');
        el.textContent = episodes.length > 0 ? `${episodes.length} episode(s) queued` : '';
    }

    function enableExportButtons() {
        document.getElementById('export-text-btn').disabled = false;
        document.getElementById('export-jdownloader-btn').disabled = false;
        document.getElementById('download-all-btn').disabled = false;
    }

    // ─────────────────────────────────────────────
    //  EVENT LISTENERS
    // ─────────────────────────────────────────────

    document.getElementById('pick-episode-btn').onclick = showEpisodePicker;
    document.getElementById('extract-current-btn').onclick = extractCurrentPageOnly;
    document.getElementById('extract-all-btn').onclick = extractAllPages;
    document.getElementById('export-text-btn').onclick = exportToText;
    document.getElementById('export-jdownloader-btn').onclick = exportForJDownloader;
    document.getElementById('download-all-btn').onclick = downloadAllMP3s;
    document.getElementById('settings-btn').onclick = showSettings;

    updateStatus('Ready. Extract episodes then export.');

})();