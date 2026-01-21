/**
 * NiceMed - Google Scholar Content Script
 * Adds a "Search in PubMed" button to each result.
 */

(function() {
  const PROCESSED_ATTR = NiceMed.CONSTANTS.ATTR_PROCESSED;

  /**
   * Process search result items
   */
  function processSearchResults() {
    // Each search result is in a .gs_r.gs_or.gs_scl element
    const results = document.querySelectorAll('.gs_r.gs_or.gs_scl');
    
    results.forEach(result => {
      if (result.hasAttribute(PROCESSED_ATTR)) return;
      result.setAttribute(PROCESSED_ATTR, 'true');
      
      // 1. Get Title from .gs_rt
      const titleEl = result.querySelector('.gs_rt');
      if (!titleEl) return;
      
      // Clean title text - remove [HTML], [PDF], [CITATION] tags anywhere
      let title = titleEl.textContent;
      title = title.replace(/\[(HTML|PDF|CITATION|BOOK)\]\s*/gi, '').trim();
      
      if (!title) return;

      // 2. Find the footer links row within .gs_ri (the main result info block)
      // This ensures we don't accidentally pick up sidebar elements
      const resultInfo = result.querySelector('.gs_ri');
      if (!resultInfo) return;
      
      // Look for the action links row (Save, Cite, Cited by, etc.)
      const footerLinks = resultInfo.querySelector('.gs_fl');
      
      if (footerLinks) {
        createAndInsertButton(footerLinks, title);
      } else {
        // Fallback: insert after .gs_a (citation line)
        const citationEl = resultInfo.querySelector('.gs_a');
        if (citationEl) {
          createAndInsertButton(citationEl, title, true);
        }
      }
    });
  }

  /**
   * Create and insert PubMed button
   */
  function createAndInsertButton(container, title, insertAfter = false) {
      const button = document.createElement('a');
      button.href = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(title)}`;
      button.target = '_blank';
      button.className = 'nicemed-pubmed-btn';
      button.textContent = 'Search in PubMed';
      
      if (insertAfter) {
        // Insert after the container element
        container.parentNode.insertBefore(button, container.nextSibling);
      } else {
        // Append to container (footer links row)
        container.appendChild(button);
      }
  }

  /**
   * Initialize
   */
  function init() {
    processSearchResults();

    // Observer for dynamic content (pagination, etc.)
    let timeout = null;
    const observer = new MutationObserver((mutations) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            processSearchResults();
        }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
