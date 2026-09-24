// 更新のお知らせ：GitHub Releases の最新版とアプリのバージョンを比べる
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { APP_VERSION, UPDATE_REPO } from './config.js';

export function compareVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

export const isNative = () => { try { return Capacitor.isNativePlatform(); } catch (e) { return false; } };

// 新しい版があれば { version, notes, url, apk } を返す
export async function checkForUpdate() {
  if (!isNative()) return null; // Web版は常に最新が配信されるので不要
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const rel = await res.json();
    const version = (rel.tag_name || '').replace(/^v/, '');
    if (!version || compareVersion(version, APP_VERSION) <= 0) return null;
    const apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
    return { version, notes: rel.body || '', url: rel.html_url, apk: apk?.browser_download_url || rel.html_url };
  } catch (e) { return null; }
}

// アプリ内ブラウザ(Custom Tabs)では APK のダウンロードが完了直前で止まることがあるため、
// 端末の標準ブラウザ(Chrome など)で開いてダウンロードさせる
export async function openExternal(url) {
  if (isNative()) {
    try { const r = await AppLauncher.openUrl({ url }); if (r?.completed !== false) return; } catch (e) { /* 失敗したら下へ */ }
    try { await Browser.open({ url }); return; } catch (e) { /* 失敗したら下へ */ }
  }
  window.open(url, '_blank');
}
