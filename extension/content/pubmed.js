/**
 * NiceMed - PubMed Content Script
 */

(function () {
  const PROCESSED_ATTR = NiceMed.CONSTANTS.ATTR_PROCESSED;
  const COPY_BTN_ATTR = 'data-nicemed-copy-added';

  /**
   * Extract journal name from citation text (take text before first dot)
   */
  function extractJournalName(citationElement) {
    if (!citationElement) return null;
    let text = citationElement.textContent.trim();
    const dotIndex = text.indexOf('.');
    if (dotIndex > 0) {
      return text.substring(0, dotIndex).trim();
    }
    return text || null;
  }

  /**
   * Create copy button for title
   */
  function createCopyButton(titleText) {
    // Remove trailing period
    titleText = titleText.replace(/\.\s*$/, '').trim();

    const btn = document.createElement('span');
    btn.className = 'nicemed-copy-btn';
    btn.title = '复制标题';
    const clipboardSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/></svg>';
    const checkSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>';

    btn.innerHTML = clipboardSvg;

    // Prevent any navigation
    btn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try {
        await navigator.clipboard.writeText(titleText);
        btn.innerHTML = checkSvg;
        btn.classList.add('nicemed-copy-success');
        setTimeout(() => {
          btn.innerHTML = clipboardSvg;
          btn.classList.remove('nicemed-copy-success');
        }, 1500);
      } catch (err) {
        console.error('Copy failed:', err);
      }
      return false;
    };
    return btn;
  }

  /**
   * Add copy button to a title element
   */
  function addCopyButton(titleElement) {
    if (!titleElement || titleElement.hasAttribute(COPY_BTN_ATTR)) return;

    const titleText = titleElement.textContent.trim();
    if (!titleText) return;

    const copyBtn = createCopyButton(titleText);
    titleElement.insertBefore(copyBtn, titleElement.firstChild);
    titleElement.setAttribute(COPY_BTN_ATTR, 'true');
  }

  /**
   * Process search results page
   */
  function processSearchResults() {
    const articles = document.querySelectorAll(".docsum-content");

    articles.forEach((article) => {
      if (article.hasAttribute(PROCESSED_ATTR)) return;

      if (article.closest('.similar-articles') || article.closest('#similar-articles-list')) {
        return;
      }

      const journalNameElement = article.querySelector(".docsum-journal-citation");
      const titleElement = article.querySelector(".docsum-title");

      // Add copy button to title
      if (titleElement) {
        addCopyButton(titleElement);
      }

      if (journalNameElement) {
        const journalName = extractJournalName(journalNameElement);

        if (journalName) {
          const query = { name: journalName };

          if (titleElement) {
            NiceMed.addBadgesToElement(titleElement, query, 'after');
          } else {
            NiceMed.addBadgesToElement(journalNameElement, query, 'before');
          }
        }

        article.setAttribute(PROCESSED_ATTR, "true");
      }
    });
  }

  /**
   * Process single article page
   */
  async function processArticlePage() {
    const journalTitleElement = document.querySelector("#full-view-journal-trigger");
    const articleTitle = document.querySelector(".heading-title");

    // Add copy button to article title
    if (articleTitle) {
      addCopyButton(articleTitle);
    }

    if (journalTitleElement && articleTitle) {
      if (!journalTitleElement.hasAttribute(PROCESSED_ATTR)) {
        let journalName = journalTitleElement.textContent.trim();
        const query = { name: journalName };

        const issnMeta = document.querySelector('meta[name="citation_issn"]');
        if (issnMeta) query.issn = issnMeta.content;

        const eissnMeta = document.querySelector('meta[name="citation_eissn"]');
        if (eissnMeta) query.eissn = eissnMeta.content;

        const success = await NiceMed.addBadgesToElement(articleTitle, query, 'before');

        if (success) {
          journalTitleElement.setAttribute(PROCESSED_ATTR, "true");
        }
      }
    }

    await processSimilarArticles();
  }

  /**
   * Process Similar articles section
   */
  async function processSimilarArticles() {
    const similarArticles = document.querySelectorAll('.similar-articles .full-docsum, #similar .docsum-content');

    for (const article of similarArticles) {
      if (article.hasAttribute(PROCESSED_ATTR)) continue;
      article.setAttribute(PROCESSED_ATTR, "true");

      const titleEl = article.querySelector('.docsum-title');

      // Add copy button
      if (titleEl) {
        addCopyButton(titleEl);
      }

      const citationEl = article.querySelector('.docsum-journal-citation');
      const journalName = extractJournalName(citationEl);

      if (journalName && titleEl) {
        await NiceMed.addBadgesToElement(titleEl, { name: journalName }, 'after');
      }
    }
  }

  // --- Initialization ---

  function init() {
    processSearchResults();
    processArticlePage();
  }

  function startObserver() {
    let timeout = null;
    const observer = new MutationObserver((mutations) => {
      // Filter out self-mutations (badges inserted by NiceMed)
      const hasRelevantMutation = mutations.some(m => {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.className &&
            typeof node.className === 'string' &&
            node.className.includes('nicemed-')) {
            return false;
          }
        }
        return m.addedNodes.length > 0;
      });
      if (!hasRelevantMutation) return;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        init();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      startObserver();
    });
  } else {
    init();
    startObserver();
  }

  NiceMed.log("PubMed script initialized");
})();
