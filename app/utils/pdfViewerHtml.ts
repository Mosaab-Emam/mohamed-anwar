import type { PdfInfoBubble, PdfLink } from "./pdfLinkStorage"

/**
 * Generates HTML for the in-app PDF viewer using pdf.js.
 * Supports both remote (https) and local (base64) sources, and opening at a specific page.
 * Exposes window.goToPage(n) for future QR deep linking.
 */
const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

export interface PdfViewerHtmlOptions {
  /** Remote PDF URL (https). Use when source is a hosted PDF. */
  uri?: string
  /** Base64-encoded PDF data. Use for local files (file://) since WebView often blocks them. */
  base64?: string
  /** 1-based page number to open at. */
  page: number
  /** Optional link areas for this PDF; overlays shown on the current page. */
  links?: PdfLink[]
  /** Optional info bubbles to show as "i" markers on the current page. */
  infoBubbles?: PdfInfoBubble[]
}

export function getPdfViewerHtml(options: PdfViewerHtmlOptions): string {
  const { uri, base64, page, links, infoBubbles } = options
  const uriJson = uri != null ? JSON.stringify(uri) : "null"
  const base64Json = base64 != null ? JSON.stringify(base64) : "null"
  const pageNum = Math.max(1, Math.floor(page))
  const linksJson = JSON.stringify(links ?? [])
  const infoBubblesJson = JSON.stringify(infoBubbles ?? [])

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { direction: rtl; background: #1a1a1a; height: 100vh; min-height: 100vh; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
    #toolbar { flex-shrink: 0; height: 44px; width: 100%; background: #2d2d2d; display: flex; align-items: center; justify-content: center; gap: 12px; }
    #pageInfo { color: #eee; font-family: system-ui, sans-serif; font-size: 14px; display: flex; align-items: center; gap: 6px; }
    #pageInput { width: 48px; padding: 4px 8px; font-size: 14px; text-align: center; border-radius: 6px; border: 1px solid #555; background: #1a1a1a; color: #eee; }
    .navBtn { background: #444; color: #eee; border: none; padding: 6px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; }
    .navBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #container { flex: 1; width: 100%; min-height: 0; overflow: auto; padding: 8px; }
    .pageWrap { position: relative; display: inline-block; margin: 0 auto 16px; }
    .pageWrap canvas { display: block; background: #fff; margin: 0; }
    .linkOverlay { position: absolute; cursor: pointer; pointer-events: auto; left: 0; top: 0; background: rgba(100, 150, 255, 0.2); border: 1px solid rgba(100, 150, 255, 0.6); }
    .linkOverlay:hover { background: rgba(100, 150, 255, 0.35); }
    .infoBubbleOverlay {
      position: absolute;
      cursor: pointer;
      pointer-events: auto;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      transform: translate(-50%, -50%);
      background: #2d4a6a;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 700;
      user-select: none;
    }
    .infoBubbleOverlay:hover { background: #3f628c; }
    #error { color: #e74c3c; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button type="button" class="navBtn" id="prevBtn" aria-label="الصفحة السابقة">السابق</button>
    <span id="pageInfo">
      <input type="number" id="pageInput" min="1" value="1" aria-label="رقم الصفحة" />
      <span id="pageTotal">—</span>
    </span>
    <button type="button" class="navBtn" id="nextBtn" aria-label="الصفحة التالية">التالي</button>
  </div>
  <div id="container"></div>
  <div id="error"></div>
  <script src="${PDF_JS_URL}"><\/script>
  <script>
    (function() {
      var PDF_URI = ${uriJson};
      var PDF_BASE64 = ${base64Json};
      var PDF_PAGE = ${pageNum};
      var PDF_LINKS = ${linksJson};
      var PDF_INFO_BUBBLES = ${infoBubblesJson};

      var pdfDoc = null;
      var numPages = 0;
      var currentPage = PDF_PAGE;
      var container = document.getElementById('container');
      var pageInfo = document.getElementById('pageInfo');
      var pageInput = document.getElementById('pageInput');
      var pageTotal = document.getElementById('pageTotal');
      var errEl = document.getElementById('error');

      function showErr(msg) {
        errEl.textContent = msg || 'فشل تحميل ملف PDF';
      }

      function renderPage(n) {
        if (!pdfDoc || n < 1 || n > numPages) return;
        currentPage = n;
        pageTotal.textContent = 'من ' + numPages;
        if (pageInput) {
          pageInput.value = String(n);
          pageInput.max = numPages;
        }
        var prevBtn = document.getElementById('prevBtn');
        var nextBtn = document.getElementById('nextBtn');
        if (prevBtn) { prevBtn.disabled = n <= 1; }
        if (nextBtn) { nextBtn.disabled = n >= numPages; }
        // Notify React Native of page change
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'pageChanged',
            page: n,
            totalPages: numPages
          }));
        }
        container.innerHTML = '';
        var pageLinks = Array.isArray(PDF_LINKS) ? PDF_LINKS.filter(function(l) { return l.page === n; }) : [];
        var pageInfoBubbles = Array.isArray(PDF_INFO_BUBBLES)
          ? PDF_INFO_BUBBLES.filter(function(i) { return i.page === n; })
          : [];
        pdfDoc.getPage(n).then(function(p) {
          var v1 = p.getViewport(1);
          var winW = window.innerWidth || 300;
          var scale = v1.width > 0
            ? Math.max(0.1, Math.min(2.5, (winW - 16) / v1.width))
            : 1;
          var viewport = p.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            showErr('Canvas 2D غير متوفر');
            return;
          }
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          var wrap = document.createElement('div');
          wrap.className = 'pageWrap';
          wrap.style.width = viewport.width + 'px';
          wrap.style.height = viewport.height + 'px';
          wrap.appendChild(canvas);
          container.appendChild(wrap);
          for (var i = 0; i < pageLinks.length; i++) {
            var link = pageLinks[i];
            var r = link.rect || {};
            var div = document.createElement('div');
            div.className = 'linkOverlay';
            div.style.left = (r.x * 100) + '%';
            div.style.top = (r.y * 100) + '%';
            div.style.width = (r.width * 100) + '%';
            div.style.height = (r.height * 100) + '%';
            div.dataset.linkId = link.id;
            div.addEventListener('click', function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              var id = this.dataset.linkId;
              var l = pageLinks.find(function(x) { return x.id === id; });
              if (l && l.destinations && l.destinations.length && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'linkClicked',
                  linkId: id,
                  destinations: l.destinations
                }));
              }
            });
            wrap.appendChild(div);
          }
          for (var j = 0; j < pageInfoBubbles.length; j++) {
            var infoBubble = pageInfoBubbles[j];
            var pos = infoBubble.position || {};
            var infoDiv = document.createElement('div');
            infoDiv.className = 'infoBubbleOverlay';
            infoDiv.style.left = (pos.x * 100) + '%';
            infoDiv.style.top = (pos.y * 100) + '%';
            infoDiv.textContent = 'i';
            infoDiv.dataset.infoId = infoBubble.id;
            infoDiv.addEventListener('click', function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              var id = this.dataset.infoId;
              var info = pageInfoBubbles.find(function(x) { return x.id === id; });
              if (info && info.text && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'infoBubbleClicked',
                  infoBubbleId: id,
                  text: info.text
                }));
              }
            });
            wrap.appendChild(infoDiv);
          }
          void canvas.offsetHeight;
          var task = p.render({ canvasContext: ctx, viewport: viewport });
          var prom = task && task.promise ? task.promise : Promise.resolve();
          prom.catch(function(e) {
            showErr('خطأ في عرض الصفحة: ' + (e && e.message ? e.message : String(e)));
          });
        }).catch(function(e) {
          showErr('خطأ في عرض الصفحة: ' + (e.message || e));
        });
      }

      window.goToPage = function(n) {
        var p = Math.max(1, Math.min(Math.floor(n), numPages));
        renderPage(p);
      };
      window.nextPage = function() { if (currentPage < numPages) renderPage(currentPage + 1); };
      window.prevPage = function() { if (currentPage > 1) renderPage(currentPage - 1); };

      document.getElementById('prevBtn').addEventListener('click', window.prevPage);
      document.getElementById('nextBtn').addEventListener('click', window.nextPage);

      if (pageInput) {
        pageInput.addEventListener('change', function() {
          var p = parseInt(this.value, 10);
          if (!isNaN(p) && p >= 1 && p <= numPages) window.goToPage(p);
          else this.value = String(currentPage);
        });
        pageInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            var p = parseInt(this.value, 10);
            if (!isNaN(p) && p >= 1 && p <= numPages) window.goToPage(p);
            else this.value = String(currentPage);
            e.preventDefault();
          }
        });
      }

      if (typeof pdfjsLib === 'undefined') {
        showErr('تعذر تحميل pdf.js');
        return;
      }
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDF_WORKER_URL)};
      } catch (e) {}

      var loadingTask = PDF_URI
        ? pdfjsLib.getDocument({ url: PDF_URI, disableWorker: true })
        : PDF_BASE64
          ? pdfjsLib.getDocument({ data: atob(PDF_BASE64), disableWorker: true })
          : null;

      if (!loadingTask) {
        showErr('لم يتم العثور على مصدر PDF');
        return;
      }

      loadingTask.promise.then(function(doc) {
        pdfDoc = doc;
        numPages = doc.numPages;
        var p = Math.max(1, Math.min(PDF_PAGE, numPages));
        renderPage(p);
      }).catch(function(e) {
        showErr('خطأ في تحميل الملف: ' + (e.message || e));
      });
    })();
  </script>
</body>
</html>`
}
