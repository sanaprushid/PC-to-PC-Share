const $ = (sel) => document.querySelector(sel);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function showToast(msg, type = 'ok') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Render ──────────────────────────────────────────────────────────────────

let renderedIds = new Set();

function renderItems(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No items yet.</div>';
    renderedIds.clear();
    return;
  }

  // Remove items no longer in list
  const currentIds = new Set(items.map(i => i.id));
  container.querySelectorAll('.item[data-id]').forEach(el => {
    if (!currentIds.has(el.dataset.id)) el.remove();
  });

  // Add new items at top
  for (const it of items) {
    if (renderedIds.has(it.id)) continue;
    renderedIds.add(it.id);

    const el = document.createElement('div');
    el.className = 'item';
    el.dataset.id = it.id;

    const badge = it.type === 'text'
      ? '<span class="badge">TEXT</span>'
      : '<span class="badge file">FILE</span>';

    el.innerHTML = `
      <div class="item-top">
        ${badge}
        <span class="time">${timeAgo(it.ts)}</span>
      </div>
      ${it.type === 'text'
        ? `<div class="item-text">${escapeHtml(it.text)}</div>
           <button class="copy-text-btn icon-btn small secondary" data-text="${escapeHtml(it.text)}">Copy</button>`
        : `<div class="item-file">
             <div class="file-meta">
               <span class="file-name">${escapeHtml(it.filename || 'file')}</span>
               <span class="time">${formatBytes(it.size)}</span>
             </div>
             <a class="dl-btn" href="/uploads/${encodeURIComponent(it.savedName)}" download="${escapeHtml(it.filename || 'file')}">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
               Download
             </a>
           </div>`
      }
    `;

    // animate in
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px) scale(.98)';
    container.prepend(el);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .35s ease, transform .35s cubic-bezier(.2,.9,.2,1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0) scale(1)';
    });
  }

  // wire copy-text buttons
  container.querySelectorAll('.copy-text-btn').forEach(btn => {
    btn.onclick = () => {
      navigator.clipboard.writeText(btn.dataset.text).then(() => showToast('Copied!'));
    };
  });
}

// ── Polling — FIX: always fetch ALL items (since=0), never advance lastSince ─

let pollTimer = null;

async function pollItems() {
  const res = await fetch('/api/items?since=0', { cache: 'no-store' });
  if (!res.ok) return;
  const data = await res.json();
  const container = $('#items');
  if (container) renderItems(data.items || [], container);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollItems().catch(() => {});
  pollTimer = setInterval(() => pollItems().catch(() => {}), 2000);
}

// ── Send Text ────────────────────────────────────────────────────────────────

async function sendText() {
  const textEl = $('#text');
  const text = (textEl?.value || '').trim();
  if (!text) { showToast('Type something first.', 'err'); return; }

  const btn = $('#btnSendText');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const r = await fetch('/api/share-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  btn.disabled = false;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Text`;

  if (!r.ok) { showToast('Failed to send text.', 'err'); return; }
  textEl.value = '';
  showToast('Text sent!');
  pollItems();
}

// ── Send File (XHR for progress) ─────────────────────────────────────────────

function sendFile() {
  const fileEl = $('#file');
  const f = fileEl?.files?.[0];
  if (!f) { showToast('Choose a file first.', 'err'); return; }

  const progressWrap = $('#progressWrap');
  const progressBar = $('#progressBar');
  const progressText = $('#progressText');
  const btn = $('#btnSendFile');

  progressWrap.classList.remove('hidden');
  btn.disabled = true;

  const fd = new FormData();
  fd.append('file', f);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/share-file-multipart');

  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    progressBar.style.width = pct + '%';
    progressText.textContent = `${pct}% · ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
  };

  xhr.onload = () => {
    btn.disabled = false;
    progressWrap.classList.add('hidden');
    progressBar.style.width = '0%';
    if (xhr.status >= 200 && xhr.status < 300) {
      fileEl.value = '';
      $('#fileInfo').classList.add('hidden');
      $('#dropLabel').textContent = 'Drop file here or browse';
      showToast('File sent!');
      pollItems();
    } else {
      showToast('Upload failed.', 'err');
    }
  };

  xhr.onerror = () => {
    btn.disabled = false;
    progressWrap.classList.add('hidden');
    showToast('Upload error.', 'err');
  };

  xhr.send(fd);
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

function initDropZone() {
  const zone = $('#dropZone');
  const fileEl = $('#file');
  const fileInfo = $('#fileInfo');
  const dropLabel = $('#dropLabel');
  if (!zone) return;

  zone.addEventListener('click', () => fileEl.click());

  fileEl.addEventListener('change', () => {
    const f = fileEl.files?.[0];
    if (f) {
      dropLabel.textContent = f.name;
      fileInfo.textContent = formatBytes(f.size);
      fileInfo.classList.remove('hidden');
    }
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    fileEl.files = dt.files;
    dropLabel.textContent = f.name;
    fileInfo.textContent = formatBytes(f.size);
    fileInfo.classList.remove('hidden');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // LAN link
  const shareUrl = $('#shareUrl');
  const btnRefresh = $('#btnRefresh');
  if (btnRefresh && shareUrl) {
    btnRefresh.addEventListener('click', async () => {
      try {
        const info = await fetch('/api/info', { cache: 'no-store' }).then(r => r.json());
        const ip = info.ips?.[0] || 'localhost';
        shareUrl.value = `http://${ip}:${info.port}/receiver.html`;
        showToast('LAN link ready!');
      } catch {
        shareUrl.value = 'Failed — check server terminal.';
      }
    });
    btnRefresh.click();
  }

  // Copy URL
  const btnCopy = $('#btnCopy');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const v = shareUrl?.value;
      if (v && !v.startsWith('Failed')) {
        navigator.clipboard.writeText(v).then(() => showToast('URL copied!'));
      }
    });
  }

  // Clear
  $('#btnClear')?.addEventListener('click', async () => {
    await fetch('/api/clear', { method: 'POST' }).catch(() => {});
    renderedIds.clear();
    const c = $('#items');
    if (c) c.innerHTML = '<div class="empty-state">No items yet.</div>';
    showToast('Cleared.');
  });

  // Send
  $('#btnSendText')?.addEventListener('click', sendText);
  $('#btnSendFile')?.addEventListener('click', sendFile);
  $('#btnReload')?.addEventListener('click', () => { pollItems(); showToast('Refreshed.'); });

  initDropZone();

  if ($('#items')) startPolling();
}

init();
