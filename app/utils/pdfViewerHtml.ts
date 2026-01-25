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
}

export function getPdfViewerHtml(options: PdfViewerHtmlOptions): string {
  const { uri, base64, page } = options
  const uriJson = uri != null ? JSON.stringify(uri) : "null"
  const base64Json = base64 != null ? JSON.stringify(base64) : "null"
  const pageNum = Math.max(1, Math.floor(page))

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a1a; height: 100vh; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    #toolbar { position: fixed; top: 0; left: 0; right: 0; height: 44px; background: #2d2d2d; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 10; }
    #pageInfo { color: #eee; font-family: system-ui, sans-serif; font-size: 14px; }
    .navBtn { background: #444; color: #eee; border: none; padding: 6px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; }
    .navBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #container { flex: 1; width: 100%; min-height: 200px; overflow: auto; padding: 52px 8px 16px; }
    canvas { display: block; margin: 0 auto 16px; background: #fff; }
    #error { color: #e74c3c; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button type="button" class="navBtn" id="prevBtn" aria-label="Previous page">Prev</button>
    <span id="pageInfo">—</span>
    <button type="button" class="navBtn" id="nextBtn" aria-label="Next page">Next</button>
  </div>
  <div id="container"></div>
  <div id="error"></div>
  <script src="${PDF_JS_URL}"><\/script>
  <script>
    (function() {
      var PDF_URI = ${uriJson};
      var PDF_BASE64 = ${base64Json};
      var PDF_PAGE = ${pageNum};

      var pdfDoc = null;
      var numPages = 0;
      var currentPage = PDF_PAGE;
      var container = document.getElementById('container');
      var pageInfo = document.getElementById('pageInfo');
      var errEl = document.getElementById('error');

      function showErr(msg) {
        errEl.textContent = msg || 'Failed to load PDF';
      }

      function renderPage(n) {
        if (!pdfDoc || n < 1 || n > numPages) return;
        currentPage = n;
        pageInfo.textContent = 'Page ' + n + ' of ' + numPages;
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
            showErr('Canvas 2D context not available');
            return;
          }
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          container.appendChild(canvas);
          void canvas.offsetHeight;
          var task = p.render({ canvasContext: ctx, viewport: viewport });
          var prom = task && task.promise ? task.promise : Promise.resolve();
          prom.catch(function(e) {
            showErr('Render error: ' + (e && e.message ? e.message : String(e)));
          });
        }).catch(function(e) {
          showErr('Render error: ' + (e.message || e));
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

      if (typeof pdfjsLib === 'undefined') {
        showErr('pdf.js failed to load');
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
        showErr('No PDF source (uri or base64)');
        return;
      }

      loadingTask.promise.then(function(doc) {
        pdfDoc = doc;
        numPages = doc.numPages;
        var p = Math.max(1, Math.min(PDF_PAGE, numPages));
        renderPage(p);
      }).catch(function(e) {
        showErr('Load error: ' + (e.message || e));
      });
    })();
  </script>
</body>
</html>`
}
