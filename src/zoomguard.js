// LINE などのアプリ内ブラウザで、ピンチ・ダブルタップ・入力欄のフォーカスによって
// 画面が拡大されたまま戻らなくなるのを防ぐ(iOS の WebView は user-scalable=no を無視する)
const VIEWPORT = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

function meta() {
  let m = document.querySelector('meta[name=viewport]');
  if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
  return m;
}

// 拡大されてしまったら、viewport を書き直して等倍に戻す
export function resetZoom() {
  const m = meta();
  m.setAttribute('content', VIEWPORT.replace('initial-scale=1,', 'initial-scale=1.0001,'));
  requestAnimationFrame(() => {
    m.setAttribute('content', VIEWPORT);
    window.scrollTo(0, 0);
  });
}

function zoomed() {
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) > 0.01) return true;
  // 一部のブラウザは visualViewport がないので、画面幅との比で判断する
  return !vv && document.documentElement.clientWidth && Math.abs(window.innerWidth - document.documentElement.clientWidth) > 2;
}

export function installZoomGuard() {
  meta().setAttribute('content', VIEWPORT);
  const isField = (t) => t && (t.closest?.('input, select, textarea, button, .panel, #news-text, #update-notes, #keypad-keys'));

  // iOS のピンチ操作
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // 2本指以上の拡大(移動と視点の同時操作は Pointer Events で処理しているので影響しない)
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  // ダブルタップ拡大
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last < 320 && !isField(e.target) && e.cancelable) e.preventDefault();
    last = now;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  // Ctrl + ホイールによる拡大(PC)
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  // それでも拡大されたら元に戻す
  const check = () => { if (zoomed()) resetZoom(); };
  window.visualViewport?.addEventListener('resize', () => setTimeout(check, 250));
  window.addEventListener('orientationchange', () => setTimeout(resetZoom, 350));
  window.addEventListener('resize', () => setTimeout(check, 250));
  // 入力欄から離れたとき(フォーカスによる拡大の戻し)
  document.addEventListener('focusout', () => setTimeout(check, 100));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 300); });
  setInterval(check, 2000);
  // ページが縦にずれたままになるのを防ぐ
  window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); }, { passive: true });
}
