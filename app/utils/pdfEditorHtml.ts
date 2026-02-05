import type { PdfLink } from "./pdfLinkStorage"

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

export interface PdfEditorHtmlOptions {
  base64?: string
  uri?: string
  page: number
  links: PdfLink[]
}

export function getPdfEditorHtml(options: PdfEditorHtmlOptions): string {
  const { base64, uri, page, links } = options
  const base64Json = base64 != null ? JSON.stringify(base64) : "null"
  const uriJson = uri != null ? JSON.stringify(uri) : "null"
  const pageNum = Math.max(1, Math.floor(page))
  const linksJson = JSON.stringify(links)

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a1a; height: 100vh; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
    #toolbar { position: fixed; top: 0; left: 0; right: 0; height: 44px; background: #2d2d2d; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 10; }
    #pageInfo { color: #eee; font-size: 14px; }
    .navBtn { background: #444; color: #eee; border: none; padding: 6px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; }
    .navBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #addLinkBtn { background: #2d6a2d; color: #eee; }
    #addLinkBtn.active { background: #4a9a4a; }
    #container { flex: 1; width: 100%; min-height: 200px; overflow: auto; padding: 52px 8px 16px; }
    .pageWrap { position: relative; display: inline-block; margin: 0 auto 16px; }
    .pageWrap canvas { display: block; background: #fff; margin: 0; }
    .linkOverlay { position: absolute; pointer-events: none; background: rgba(100, 150, 255, 0.2); border: 1px solid rgba(100, 150, 255, 0.6); left: 0; top: 0; }
    .drawRect { position: absolute; pointer-events: none; background: rgba(255, 200, 80, 0.3); border: 2px solid #e0a020; }
    #formPanel { position: fixed; bottom: 0; left: 0; right: 0; background: #2d2d2d; color: #eee; padding: 12px; max-height: 45vh; overflow: auto; z-index: 20; display: none; }
    #formPanel.visible { display: block; }
    #formPanel h3 { margin-bottom: 8px; font-size: 14px; }
    .destRow { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
    .destRow input { flex: 1; padding: 6px; border-radius: 4px; border: 1px solid #555; background: #1a1a1a; color: #eee; }
    .destRow input[type="number"] { width: 60px; flex: none; }
    .formBtn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; margin-right: 8px; margin-top: 8px; }
    .formBtn.primary { background: #2d6a2d; color: #eee; }
    .formBtn.secondary { background: #444; color: #eee; }
    #error { color: #e74c3c; padding: 16px; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button type="button" class="navBtn" id="prevBtn">Prev</button>
    <span id="pageInfo">—</span>
    <button type="button" class="navBtn" id="nextBtn">Next</button>
    <button type="button" class="navBtn" id="addLinkBtn">Add link</button>
  </div>
  <div id="container"></div>
  <div id="error"></div>
  <div id="formPanel">
    <h3 id="formTitle">New link</h3>
    <div id="destList"></div>
    <button type="button" class="formBtn secondary" id="addDestBtn">Add destination</button>
    <button type="button" class="formBtn primary" id="saveLinkBtn">Save link</button>
    <button type="button" class="formBtn secondary" id="cancelFormBtn">Cancel</button>
  </div>
  <script src="${PDF_JS_URL}"><\/script>
  <script>
    (function() {
      var PDF_BASE64 = ${base64Json};
      var PDF_URI = ${uriJson};
      var PDF_PAGE = ${pageNum};
      var PDF_LINKS = ${linksJson};

      var pdfDoc = null;
      var numPages = 0;
      var currentPage = PDF_PAGE;
      var container = document.getElementById('container');
      var pageInfo = document.getElementById('pageInfo');
      var errEl = document.getElementById('error');
      var formPanel = document.getElementById('formPanel');
      var formTitle = document.getElementById('formTitle');
      var destList = document.getElementById('destList');
      var addLinkBtn = document.getElementById('addLinkBtn');
      var addMode = false;
      var drawStart = null;
      var drawRectEl = null;
      var draftRect = null;
      var draftDestinations = [{ title: '', page: 1 }];
      var wrapEl = null;
      var canvasW = 0, canvasH = 0;

      function showErr(msg) { errEl.textContent = msg || ''; }

      function notifyPage(n) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'editorPageChanged', page: n, totalPages: numPages }));
        }
      }

      function renderPage(n) {
        if (!pdfDoc || n < 1 || n > numPages) return;
        currentPage = n;
        pageInfo.textContent = 'Page ' + n + ' of ' + numPages;
        document.getElementById('prevBtn').disabled = n <= 1;
        document.getElementById('nextBtn').disabled = n >= numPages;
        container.innerHTML = '';
        var pageLinks = Array.isArray(PDF_LINKS) ? PDF_LINKS.filter(function(l) { return l.page === n; }) : [];
        pdfDoc.getPage(n).then(function(p) {
          var v1 = p.getViewport(1);
          var winW = window.innerWidth || 300;
          var scale = v1.width > 0
            ? Math.max(0.1, Math.min(2.5, (winW - 16) / v1.width))
            : 1;
          var viewport = p.getViewport({ scale: scale });
          canvasW = viewport.width;
          canvasH = viewport.height;
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          if (!ctx) { showErr('Canvas 2D not available'); return; }
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          wrapEl = document.createElement('div');
          wrapEl.className = 'pageWrap';
          wrapEl.style.width = viewport.width + 'px';
          wrapEl.style.height = viewport.height + 'px';
          wrapEl.appendChild(canvas);
          pageLinks.forEach(function(link) {
            var r = link.rect || {};
            var div = document.createElement('div');
            div.className = 'linkOverlay';
            div.style.left = (r.x * 100) + '%';
            div.style.top = (r.y * 100) + '%';
            div.style.width = (r.width * 100) + '%';
            div.style.height = (r.height * 100) + '%';
            wrapEl.appendChild(div);
          });
          container.appendChild(wrapEl);
          void canvas.offsetHeight;
          var task = p.render({ canvasContext: ctx, viewport: viewport });
          var prom = task && task.promise ? task.promise : Promise.resolve();
          prom.catch(function(e) { showErr('Render: ' + (e && e.message ? e.message : String(e))); });
          setupDraw();
        }).catch(function(e) { showErr('Load: ' + (e.message || e)); });
      }

      function setupDraw() {
        if (!wrapEl) return;
        wrapEl.onmousedown = addMode ? onDrawStart : null;
        wrapEl.ontouchstart = addMode ? function(e) { e.preventDefault(); onDrawStart(e.touches[0]); } : null;
      }

      function onDrawStart(ev) {
        if (!addMode || !wrapEl) return;
        var r = wrapEl.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width;
        var y = (ev.clientY - r.top) / r.height;
        drawStart = { x: x, y: y };
        if (drawRectEl) { drawRectEl.remove(); drawRectEl = null; }
        drawRectEl = document.createElement('div');
        drawRectEl.className = 'drawRect';
        drawRectEl.style.left = (x * 100) + '%';
        drawRectEl.style.top = (y * 100) + '%';
        drawRectEl.style.width = '0%';
        drawRectEl.style.height = '0%';
        wrapEl.appendChild(drawRectEl);
        document.addEventListener('mousemove', onDrawMove);
        document.addEventListener('mouseup', onDrawEnd);
        document.addEventListener('touchmove', onDrawMoveTouch, { passive: false });
        document.addEventListener('touchend', onDrawEndTouch);
      }

      function onDrawMove(ev) {
        if (!drawStart || !wrapEl || !drawRectEl) return;
        var r = wrapEl.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width;
        var y = (ev.clientY - r.top) / r.height;
        updateDrawRect(x, y);
      }

      function onDrawMoveTouch(ev) {
        ev.preventDefault();
        if (ev.touches.length) onDrawMove(ev.touches[0]);
      }

      function updateDrawRect(x, y) {
        if (!drawStart || !drawRectEl) return;
        var left = Math.min(drawStart.x, x);
        var top = Math.min(drawStart.y, y);
        var w = Math.abs(x - drawStart.x);
        var h = Math.abs(y - drawStart.y);
        drawRectEl.style.left = (left * 100) + '%';
        drawRectEl.style.top = (top * 100) + '%';
        drawRectEl.style.width = (w * 100) + '%';
        drawRectEl.style.height = (h * 100) + '%';
      }

      function onDrawEnd(ev) {
        if (!drawStart || !wrapEl || !drawRectEl) return;
        document.removeEventListener('mousemove', onDrawMove);
        document.removeEventListener('mouseup', onDrawEnd);
        document.removeEventListener('touchmove', onDrawMoveTouch);
        document.removeEventListener('touchend', onDrawEndTouch);
        var r = wrapEl.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width;
        var y = (ev.clientY - r.top) / r.height;
        updateDrawRect(x, y);
        var left = Math.min(drawStart.x, x);
        var top = Math.min(drawStart.y, y);
        var w = Math.abs(x - drawStart.x);
        var h = Math.abs(y - drawStart.y);
        if (w < 0.02 || h < 0.02) { drawRectEl.remove(); drawRectEl = null; drawStart = null; return; }
        draftRect = { x: left, y: top, width: w, height: h };
        drawRectEl.remove();
        drawRectEl = null;
        drawStart = null;
        showForm();
      }

      function onDrawEndTouch(ev) {
        if (ev.changedTouches && ev.changedTouches[0]) onDrawEnd(ev.changedTouches[0]);
      }

      function showForm() {
        draftDestinations = [{ title: '', page: currentPage }];
        renderDestList();
        formTitle.textContent = 'New link (Page ' + currentPage + ')';
        formPanel.classList.add('visible');
      }

      function renderDestList() {
        destList.innerHTML = '';
        draftDestinations.forEach(function(d, i) {
          var row = document.createElement('div');
          row.className = 'destRow';
          row.innerHTML = '<input type="text" placeholder="Title" data-idx="' + i + '" data-field="title" value="' + (d.title || '').replace(/"/g, '&quot;') + '">' +
            '<input type="number" min="1" placeholder="Page" data-idx="' + i + '" data-field="page" value="' + (d.page || 1) + '">';
          destList.appendChild(row);
        });
        destList.querySelectorAll('input').forEach(function(inp) {
          inp.onchange = syncDraft;
          inp.oninput = syncDraft;
        });
      }

      function syncDraft() {
        destList.querySelectorAll('.destRow').forEach(function(row, i) {
          var titleInp = row.querySelector('input[data-field="title"]');
          var pageInp = row.querySelector('input[data-field="page"]');
          if (draftDestinations[i]) {
            draftDestinations[i].title = titleInp ? titleInp.value : '';
            draftDestinations[i].page = pageInp ? Math.max(1, parseInt(pageInp.value, 10) || 1) : 1;
          }
        });
      }

      document.getElementById('addDestBtn').onclick = function() {
        syncDraft();
        draftDestinations.push({ title: '', page: currentPage });
        renderDestList();
      };

      document.getElementById('saveLinkBtn').onclick = function() {
        syncDraft();
        var valid = draftDestinations.filter(function(d) { return (d.title || '').trim(); });
        if (valid.length === 0) { alert('Add at least one destination with a title'); return; }
        if (!draftRect) return;
        var payload = {
          type: 'linkSaved',
          page: currentPage,
          rect: draftRect,
          destinations: valid.map(function(d) { return { title: d.title.trim(), page: d.page }; })
        };
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
        formPanel.classList.remove('visible');
        draftRect = null;
      };

      document.getElementById('cancelFormBtn').onclick = function() {
        formPanel.classList.remove('visible');
        draftRect = null;
      };

      addLinkBtn.onclick = function() {
        addMode = !addMode;
        addLinkBtn.classList.toggle('active', addMode);
        setupDraw();
      };

      document.getElementById('prevBtn').onclick = function() { if (currentPage > 1) { renderPage(currentPage - 1); notifyPage(currentPage - 1); } };
      document.getElementById('nextBtn').onclick = function() { if (currentPage < numPages) { renderPage(currentPage + 1); notifyPage(currentPage + 1); } };

      if (typeof pdfjsLib === 'undefined') { showErr('pdf.js failed to load'); return; }
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDF_WORKER_URL)}; } catch (e) {}
      var loadingTask = PDF_BASE64
        ? pdfjsLib.getDocument({ data: atob(PDF_BASE64), disableWorker: true })
        : PDF_URI
          ? pdfjsLib.getDocument({ url: PDF_URI, disableWorker: true })
          : null;
      if (!loadingTask) { showErr('No PDF source'); return; }
      loadingTask.promise.then(function(doc) {
        pdfDoc = doc;
        numPages = doc.numPages;
        var p = Math.max(1, Math.min(PDF_PAGE, numPages));
        renderPage(p);
        notifyPage(p);
      }).catch(function(e) { showErr('Load: ' + (e.message || e)); });

      window.editorGoToPage = function(n) {
        var p = Math.max(1, Math.min(Math.floor(n), numPages));
        renderPage(p);
        notifyPage(p);
      };
    })();
  </script>
</body>
</html>`
}
