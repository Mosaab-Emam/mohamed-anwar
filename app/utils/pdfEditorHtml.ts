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
<html lang="ar" dir="rtl">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { direction: rtl; background: #1a1a1a; height: 100vh; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
    #toolbar { position: fixed; top: 0; left: 0; right: 0; min-height: 88px; background: #2d2d2d; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; z-index: 10; }
    #toolbar.has-results { min-height: 124px; }
    .toolbarRow { display: flex; align-items: center; justify-content: center; gap: 12px; }
    #pageInfo { color: #eee; font-size: 14px; }
    .navBtn { background: #444; color: #eee; border: none; padding: 6px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; }
    .navBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #addLinkBtn { background: #2d6a2d; color: #eee; }
    #addLinkBtn.active { background: #4a9a4a; }
    #searchInput { flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid #555; background: #1a1a1a; color: #eee; font-size: 14px; min-width: 120px; max-width: 200px; }
    #searchInfo { color: #eee; font-size: 12px; min-width: 70px; text-align: center; }
    .resultsRow { display: none; align-items: center; justify-content: center; gap: 12px; padding: 4px 0; }
    .resultsRow.visible { display: flex; }
    #resultsText { color: #aaa; font-size: 13px; }
    #linkAllBtn { background: #6a2d6a; color: #eee; padding: 8px 16px; }
    #bulkResultPanel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2d2d2d; color: #eee; padding: 20px; border-radius: 12px; z-index: 30; display: none; max-width: 90%; text-align: center; }
    #bulkResultPanel.visible { display: block; }
    #bulkResultPanel h3 { margin-bottom: 12px; color: #4a9a4a; }
    #bulkResultPanel p { margin-bottom: 8px; font-size: 14px; }
    #bulkResultPanel .pages { font-size: 12px; color: #aaa; margin-bottom: 16px; max-height: 100px; overflow-y: auto; }
    #bulkOverlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 25; display: none; }
    #bulkOverlay.visible { display: block; }
    #container { flex: 1; width: 100%; min-height: 200px; overflow: auto; padding: 96px 8px 16px; }
    #container.has-results { padding-top: 132px; }
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
    <div class="toolbarRow">
      <button type="button" class="navBtn" id="prevBtn">السابق</button>
      <span id="pageInfo">—</span>
      <button type="button" class="navBtn" id="nextBtn">التالي</button>
      <button type="button" class="navBtn" id="addLinkBtn">إضافة رابط</button>
    </div>
    <div class="toolbarRow">
      <input type="text" id="searchInput" placeholder="ابحث..." />
      <button type="button" class="navBtn" id="searchBtn">بحث</button>
      <span id="searchInfo">—</span>
    </div>
    <div class="resultsRow" id="resultsRow">
      <span id="resultsText"></span>
      <button type="button" class="navBtn" id="linkAllBtn">ربط جميع النتائج</button>
    </div>
  </div>
  <div id="container"></div>
  <div id="error"></div>
  <div id="formPanel">
    <h3 id="formTitle">رابط جديد</h3>
    <div id="destList"></div>
    <button type="button" class="formBtn secondary" id="addDestBtn">إضافة وجهة</button>
    <button type="button" class="formBtn primary" id="saveLinkBtn">حفظ الرابط</button>
    <button type="button" class="formBtn secondary" id="cancelFormBtn">إلغاء</button>
  </div>
  <div id="bulkOverlay"></div>
  <div id="bulkResultPanel">
    <h3 id="bulkResultTitle">تم إنشاء الروابط</h3>
    <p id="bulkResultSummary"></p>
    <div class="pages" id="bulkResultPages"></div>
    <button type="button" class="formBtn primary" id="bulkResultOkBtn">حسنًا</button>
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
        pageInfo.textContent = 'الصفحة ' + n + ' من ' + numPages;
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
          if (!ctx) { showErr('Canvas 2D غير متوفر'); return; }
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
          prom.catch(function(e) { showErr('خطأ في العرض: ' + (e && e.message ? e.message : String(e))); });
          setupDraw();
        }).catch(function(e) { showErr('خطأ في التحميل: ' + (e.message || e)); });
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
        formTitle.textContent = 'رابط جديد (صفحة ' + currentPage + ')';
        formPanel.classList.add('visible');
      }

      function renderDestList() {
        destList.innerHTML = '';
        draftDestinations.forEach(function(d, i) {
          var row = document.createElement('div');
          row.className = 'destRow';
          row.innerHTML = '<input type="text" placeholder="العنوان" data-idx="' + i + '" data-field="title" value="' + (d.title || '').replace(/"/g, '&quot;') + '">' +
            '<input type="number" min="1" placeholder="الصفحة" data-idx="' + i + '" data-field="page" value="' + (d.page || 1) + '">';
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

      addLinkBtn.onclick = function() {
        addMode = !addMode;
        addLinkBtn.classList.toggle('active', addMode);
        setupDraw();
      };

      document.getElementById('prevBtn').onclick = function() { if (currentPage > 1) { renderPage(currentPage - 1); notifyPage(currentPage - 1); } };
      document.getElementById('nextBtn').onclick = function() { if (currentPage < numPages) { renderPage(currentPage + 1); notifyPage(currentPage + 1); } };

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

      function updateSearchInfo() {
        var searchInfo = document.getElementById('searchInfo');
        var resultsRow = document.getElementById('resultsRow');
        var resultsText = document.getElementById('resultsText');
        var toolbar = document.getElementById('toolbar');
        var containerEl = document.getElementById('container');
        
        if (!searchInfo) return;
        
        var hasResults = bulkMatchRects.length > 0;
        
        if (searchInProgress) {
          searchInfo.textContent = 'جارٍ البحث...';
          if (resultsRow) resultsRow.classList.remove('visible');
          if (toolbar) toolbar.classList.remove('has-results');
          if (containerEl) containerEl.classList.remove('has-results');
        } else if (hasResults) {
          var matchCount = bulkMatchRects.length;
          var pageCount = searchResults.length;
          searchInfo.textContent = matchCount + ' نتيجة';
          if (resultsText) {
            resultsText.textContent = matchCount + ' نتيجة على ' + pageCount + ' صفحة';
          }
          if (resultsRow) resultsRow.classList.add('visible');
          if (toolbar) toolbar.classList.add('has-results');
          if (containerEl) containerEl.classList.add('has-results');
        } else if (searchQuery) {
          searchInfo.textContent = 'لا توجد نتائج';
          if (resultsRow) resultsRow.classList.remove('visible');
          if (toolbar) toolbar.classList.remove('has-results');
          if (containerEl) containerEl.classList.remove('has-results');
        } else {
          searchInfo.textContent = '—';
          if (resultsRow) resultsRow.classList.remove('visible');
          if (toolbar) toolbar.classList.remove('has-results');
          if (containerEl) containerEl.classList.remove('has-results');
        }
      }

      async function performSearch() {
        if (!pdfDoc || searchInProgress) return;
        
        var searchInputEl = document.getElementById('searchInput');
        if (!searchInputEl) return;
        
        var query = searchInputEl.value.trim();
        if (!query) {
          searchQuery = '';
          searchResults = [];
          bulkMatchRects = [];
          updateSearchInfo();
          return;
        }

        searchQuery = query.toLowerCase();
        searchResults = [];
        bulkMatchRects = [];
        searchInProgress = true;
        updateSearchInfo();

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
          updateSearchInfo();
        }
      }

      var searchBtn = document.getElementById('searchBtn');
      var searchInputEl = document.getElementById('searchInput');
      var linkAllBtn = document.getElementById('linkAllBtn');
      var bulkOverlay = document.getElementById('bulkOverlay');
      var bulkResultPanel = document.getElementById('bulkResultPanel');
      var bulkResultOkBtn = document.getElementById('bulkResultOkBtn');
      
      if (searchBtn) {
        searchBtn.onclick = performSearch;
      }
      
      if (searchInputEl) {
        searchInputEl.onkeydown = function(e) {
          if (e.key === 'Enter') {
            performSearch();
          }
        };
      }

      function showBulkForm() {
        if (bulkMatchRects.length === 0) return;
        bulkLinkMode = true;
        draftDestinations = [{ title: '', page: currentPage }];
        renderDestList();
        formTitle.textContent = 'ربط ' + bulkMatchRects.length + ' نتيجة لعبارة "' + searchQuery + '"';
        formPanel.classList.add('visible');
      }

      function showBulkResult(linkCount, pages) {
        var summaryEl = document.getElementById('bulkResultSummary');
        var pagesEl = document.getElementById('bulkResultPages');
        if (summaryEl) {
          summaryEl.textContent = 'تم إنشاء ' + linkCount + ' رابط بنجاح';
        }
        if (pagesEl) {
          var uniquePages = pages.filter(function(p, i, arr) { return arr.indexOf(p) === i; }).sort(function(a, b) { return a - b; });
          pagesEl.textContent = 'الصفحات: ' + uniquePages.join(', ');
        }
        if (bulkOverlay) bulkOverlay.classList.add('visible');
        if (bulkResultPanel) bulkResultPanel.classList.add('visible');
      }

      function hideBulkResult() {
        if (bulkOverlay) bulkOverlay.classList.remove('visible');
        if (bulkResultPanel) bulkResultPanel.classList.remove('visible');
        
        // Notify React Native that the result was dismissed - this triggers the state update
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bulkResultDismissed' }));
        }
        
        // Clear search after dismissing the result
        bulkMatchRects = [];
        searchQuery = '';
        searchResults = [];
        if (searchInputEl) searchInputEl.value = '';
        updateSearchInfo();
      }

      if (linkAllBtn) {
        linkAllBtn.onclick = showBulkForm;
      }

      if (bulkResultOkBtn) {
        bulkResultOkBtn.onclick = hideBulkResult;
      }

      if (bulkOverlay) {
        bulkOverlay.onclick = hideBulkResult;
      }

      // Save button handler - handles both single link and bulk link modes
      document.getElementById('saveLinkBtn').onclick = function() {
        syncDraft();
        var valid = draftDestinations.filter(function(d) { return (d.title || '').trim(); });
        if (valid.length === 0) { alert('أضف وجهة واحدة على الأقل مع عنوان'); return; }

        if (bulkLinkMode && bulkMatchRects.length > 0) {
          // Bulk save mode - save all matches in a single message
          var pages = [];
          var destinations = valid.map(function(d) { return { title: d.title.trim(), page: d.page }; });
          var links = [];
          
          for (var i = 0; i < bulkMatchRects.length; i++) {
            var match = bulkMatchRects[i];
            pages.push(match.page);
            links.push({
              page: match.page,
              rect: match.rect,
              destinations: destinations
            });
          }
          
          // Send all links in a single bulk message
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'bulkLinksSaved',
              links: links
            }));
          }
          
          formPanel.classList.remove('visible');
          bulkLinkMode = false;
          showBulkResult(links.length, pages);
        } else {
          // Single link mode (original behavior)
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
        }
      };

      // Update cancel button to handle bulk mode
      document.getElementById('cancelFormBtn').onclick = function() {
        formPanel.classList.remove('visible');
        draftRect = null;
        bulkLinkMode = false;
      };
    })();
  </script>
</body>
</html>`
}
