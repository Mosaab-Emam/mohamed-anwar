import type { PdfInfoBubble, PdfLink } from "./pdfLinkStorage"

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

export interface PdfEditorHtmlOptions {
  base64?: string
  uri?: string
  page: number
  links: PdfLink[]
  infoBubbles: PdfInfoBubble[]
}

export function getPdfEditorHtml(options: PdfEditorHtmlOptions): string {
  const { base64, uri, page, links, infoBubbles } = options
  const base64Json = base64 != null ? JSON.stringify(base64) : "null"
  const uriJson = uri != null ? JSON.stringify(uri) : "null"
  const pageNum = Math.max(1, Math.floor(page))
  const linksJson = JSON.stringify(links)
  const infoBubblesJson = JSON.stringify(infoBubbles)

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=8.0, user-scalable=yes" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { direction: rtl; background: #1a1a1a; height: 100vh; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
    /* Toolbar and form panels are native - zoom only affects PDF container */
    /* PDF canvas must be LTR or rendering is scrambled (pdf.js #12081) */
    #container { flex: 1; width: 100%; min-height: 200px; overflow: auto; padding: 8px; direction: ltr; }
    .pageWrap { position: relative; display: inline-block; margin: 0 auto 16px; direction: ltr; }
    .pageWrap canvas { display: block; background: #fff; margin: 0; }
    .linkOverlay { position: absolute; pointer-events: none; background: rgba(100, 150, 255, 0.2); border: 1px solid rgba(100, 150, 255, 0.6); left: 0; top: 0; z-index: 2; }
    .infoBubbleOverlay {
      position: absolute;
      z-index: 1;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      transform: translate(-50%, -50%);
      background: #2d4a6a;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.35);
      pointer-events: none;
    }
    .drawRect { position: absolute; z-index: 3; pointer-events: none; background: rgba(255, 200, 80, 0.3); border: 2px solid #e0a020; }
    #error { color: #e74c3c; padding: 16px; }
  </style>
</head>
<body>
  <div id="container"></div>
  <div id="error"></div>
  <script src="${PDF_JS_URL}"><\/script>
  <script>
    (function() {
      var PDF_BASE64 = ${base64Json};
      var PDF_URI = ${uriJson};
      var PDF_PAGE = ${pageNum};
      var PDF_LINKS = ${linksJson};
      var PDF_INFO_BUBBLES = ${infoBubblesJson};

      var pdfDoc = null;
      var numPages = 0;
      var currentPage = PDF_PAGE;
      var container = document.getElementById('container');
      var errEl = document.getElementById('error');
      var addMode = false;
      var infoMode = false;
      var drawStart = null;
      var drawRectEl = null;
      var wrapEl = null;
      var canvasW = 0, canvasH = 0;
      var searchResults = [];
      var searchQuery = '';
      var searchInProgress = false;
      var bulkLinkMode = false;
      var bulkMatchRects = []; // Array of { page, rect } for all matches with positions

      function showErr(msg) { errEl.textContent = msg || ''; }

      function notifyPage(n) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'editorPageChanged', page: n, totalPages: numPages }));
        }
      }

      function renderPage(n) {
        if (!pdfDoc || n < 1 || n > numPages) return;
        currentPage = n;
        container.innerHTML = '';
        var pageLinks = Array.isArray(PDF_LINKS) ? PDF_LINKS.filter(function(l) { return l.page === n; }) : [];
        var pageInfoBubbles = Array.isArray(PDF_INFO_BUBBLES) ? PDF_INFO_BUBBLES.filter(function(i) { return i.page === n; }) : [];
        pdfDoc.getPage(n).then(function(p) {
          var v1 = p.getViewport({ scale: 1 });
          var winW = window.innerWidth || 300;
          var baseScale = v1.width > 0
            ? Math.max(0.1, Math.min(2.5, (winW - 16) / v1.width))
            : 1;
          var pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
          var maxZoom = 8;
          var scale = baseScale * pixelRatio * maxZoom;
          var viewport = p.getViewport({ scale: scale });
          canvasW = viewport.width / (pixelRatio * maxZoom);
          canvasH = viewport.height / (pixelRatio * maxZoom);
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          if (!ctx) { showErr('Canvas 2D غير متوفر'); return; }
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.width = canvasW + 'px';
          canvas.style.height = canvasH + 'px';
          canvas.setAttribute('dir', 'ltr');
          wrapEl = document.createElement('div');
          wrapEl.className = 'pageWrap';
          wrapEl.setAttribute('dir', 'ltr');
          wrapEl.style.width = canvasW + 'px';
          wrapEl.style.height = canvasH + 'px';
          wrapEl.appendChild(canvas);
          pageLinks.forEach(function(link) {
            var r = link.rect || {};
            var div = document.createElement('div');
            div.className = 'linkOverlay';
            var lid = link.id != null ? String(link.id) : '';
            div.setAttribute('data-link-id', lid);
            div.style.left = (r.x * 100) + '%';
            div.style.top = (r.y * 100) + '%';
            div.style.width = (r.width * 100) + '%';
            div.style.height = (r.height * 100) + '%';
            div.addEventListener('click', function(ev) {
              if (addMode || infoMode) return;
              ev.preventDefault();
              ev.stopPropagation();
              var id = div.getAttribute('data-link-id');
              if (id && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'existingLinkTapped', linkId: id }));
              }
            });
            wrapEl.appendChild(div);
          });
          pageInfoBubbles.forEach(function(infoBubble) {
            var pos = infoBubble.position || {};
            var marker = document.createElement('div');
            marker.className = 'infoBubbleOverlay';
            marker.style.left = (pos.x * 100) + '%';
            marker.style.top = (pos.y * 100) + '%';
            marker.textContent = 'i';
            wrapEl.appendChild(marker);
          });
          container.appendChild(wrapEl);
          void canvas.offsetHeight;
          var task = p.render({ canvasContext: ctx, viewport: viewport });
          var prom = task && task.promise ? task.promise : Promise.resolve();
          prom.catch(function(e) { showErr('خطأ في العرض: ' + (e && e.message ? e.message : String(e))); });
          setupDraw();
        }).catch(function(e) { showErr('خطأ في التحميل: ' + (e.message || e)); });
      }

      function refreshLinkHitMode() {
        if (!wrapEl) return;
        var list = wrapEl.querySelectorAll('.linkOverlay');
        var hit = !addMode && !infoMode;
        for (var i = 0; i < list.length; i++) {
          list[i].style.pointerEvents = hit ? 'auto' : 'none';
          list[i].style.cursor = hit ? 'pointer' : 'default';
        }
      }

      function setupDraw() {
        if (!wrapEl) return;
        if (addMode) {
          wrapEl.onmousedown = onDrawStart;
          wrapEl.ontouchstart = function(e) { e.preventDefault(); onDrawStart(e.touches[0]); };
          refreshLinkHitMode();
          return;
        }
        if (infoMode) {
          wrapEl.onmousedown = onInfoTap;
          wrapEl.ontouchstart = function(e) { e.preventDefault(); onInfoTap(e.touches[0]); };
          refreshLinkHitMode();
          return;
        }
        wrapEl.onmousedown = null;
        wrapEl.ontouchstart = null;
        refreshLinkHitMode();
      }

      function onInfoTap(ev) {
        if (!infoMode || !wrapEl) return;
        var r = wrapEl.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width;
        var y = (ev.clientY - r.top) / r.height;
        var position = {
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y))
        };
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'infoPositionTapped', page: currentPage, position: position }));
        }
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
        var rect = { x: left, y: top, width: w, height: h };
        drawRectEl.remove();
        drawRectEl = null;
        drawStart = null;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'linkRectDrawn', page: currentPage, rect: rect }));
        }
      }

      function onDrawEndTouch(ev) {
        if (ev.changedTouches && ev.changedTouches[0]) onDrawEnd(ev.changedTouches[0]);
      }

      window.setAddLinkMode = function(on) {
        addMode = !!on;
        if (addMode) infoMode = false;
        setupDraw();
      };
      window.setAddInfoMode = function(on) {
        infoMode = !!on;
        if (infoMode) addMode = false;
        setupDraw();
      };
      window.editorPrevPage = function() {
        if (currentPage > 1) { renderPage(currentPage - 1); notifyPage(currentPage - 1); }
      };
      window.editorNextPage = function() {
        if (currentPage < numPages) { renderPage(currentPage + 1); notifyPage(currentPage + 1); }
      };

      if (typeof pdfjsLib === 'undefined') { showErr('تعذر تحميل pdf.js'); return; }
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDF_WORKER_URL)}; } catch (e) {}
      var loadingTask = PDF_BASE64
        ? pdfjsLib.getDocument({ data: atob(PDF_BASE64), disableWorker: true })
        : PDF_URI
          ? pdfjsLib.getDocument({ url: PDF_URI, disableWorker: true })
          : null;
      if (!loadingTask) { showErr('لم يتم العثور على مصدر PDF'); return; }
      loadingTask.promise.then(function(doc) {
        pdfDoc = doc;
        numPages = doc.numPages;
        var p = Math.max(1, Math.min(PDF_PAGE, numPages));
        renderPage(p);
        notifyPage(p);
      }).catch(function(e) { showErr('خطأ في التحميل: ' + (e.message || e)); });

      window.editorGoToPage = function(n) {
        var p = Math.max(1, Math.min(Math.floor(n), numPages));
        renderPage(p);
        notifyPage(p);
      };

      function notifySearchResults() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'editorSearchResults',
            inProgress: searchInProgress,
            matchCount: bulkMatchRects.length,
            query: searchQuery
          }));
        }
      }

      async function performSearch(queryFromNative) {
        if (!pdfDoc || searchInProgress) return;
        
        var query = (typeof queryFromNative === 'string' ? queryFromNative : '').trim();
        if (!query) {
          searchQuery = '';
          searchResults = [];
          bulkMatchRects = [];
          notifySearchResults();
          return;
        }

        searchQuery = query.toLowerCase();
        searchResults = [];
        bulkMatchRects = [];
        searchInProgress = true;
        notifySearchResults();

        try {
          for (var pageNum = 1; pageNum <= numPages; pageNum++) {
            var page = await pdfDoc.getPage(pageNum);
            var textContent = await page.getTextContent();
            var viewport = page.getViewport({ scale: 1 });
            var pageWidth = viewport.width;
            var pageHeight = viewport.height;
            
            // Build text with position info
            var items = textContent.items;
            var pageMatches = [];
            
            // For each text item, check if it contains the search query
            for (var i = 0; i < items.length; i++) {
              var item = items[i];
              var str = (item.str || '').toLowerCase();
              var searchIdx = 0;
              
              while ((searchIdx = str.indexOf(searchQuery, searchIdx)) !== -1) {
                // Get the transform matrix for this text item
                var transform = item.transform;
                var x = transform[4];
                var y = transform[5];
                var itemWidth = item.width || 0;
                var itemHeight = item.height || Math.abs(transform[3]) || 12;
                
                // Calculate approximate position of the match within the text item
                var charWidth = itemWidth / Math.max(1, item.str.length);
                var matchX = x + (searchIdx * charWidth);
                var matchWidth = query.length * charWidth;
                
                // Convert to normalized coordinates (0-1 range, top-left origin)
                // PDF coordinates are bottom-left origin, so we need to flip Y
                var normX = Math.max(0, Math.min(1, matchX / pageWidth));
                var normY = Math.max(0, Math.min(1, 1 - ((y + itemHeight) / pageHeight)));
                var normWidth = Math.min(1 - normX, Math.max(0.02, matchWidth / pageWidth));
                var normHeight = Math.min(1 - normY, Math.max(0.02, itemHeight / pageHeight));
                
                // Add some padding around the match
                var padding = 0.005;
                normX = Math.max(0, normX - padding);
                normY = Math.max(0, normY - padding);
                normWidth = Math.min(1 - normX, normWidth + padding * 2);
                normHeight = Math.min(1 - normY, normHeight + padding * 2);
                
                pageMatches.push({
                  page: pageNum,
                  rect: { x: normX, y: normY, width: normWidth, height: normHeight }
                });
                
                searchIdx += searchQuery.length;
              }
            }
            
            if (pageMatches.length > 0) {
              searchResults.push({ page: pageNum, matches: pageMatches.length });
              bulkMatchRects = bulkMatchRects.concat(pageMatches);
            }
          }
        } catch (e) {
          showErr('خطأ أثناء البحث: ' + (e.message || e));
        } finally {
          searchInProgress = false;
          notifySearchResults();
        }
      }

      window.performSearch = function(q) { performSearch(q); };

      window.requestBulkFormData = function() {
        if (bulkMatchRects.length === 0) return;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'bulkFormData',
            matches: bulkMatchRects,
            query: searchQuery
          }));
        }
      };

      window.clearSearchAndNotify = function() {
        bulkMatchRects = [];
        searchQuery = '';
        searchResults = [];
        notifySearchResults();
      };

      window.showBulkForm = window.requestBulkFormData;
    })();
  </script>
</body>
</html>`
}
