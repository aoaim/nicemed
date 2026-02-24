/**
 * NiceMed - Google Scholar Content Script
 * Adds journal badges and "Search in PubMed" button to each result.
 */

(function () {
  const PROCESSED_ATTR = NiceMed.CONSTANTS.ATTR_PROCESSED;

  /**
   * Extract journal name from Scholar citation line (.gs_a)
   * Format: "Author1, Author2 - Journal Name, Year - Publisher"
   */
  function extractJournalFromCitation(citationEl) {
    if (!citationEl) return null;
    const text = citationEl.textContent;
    // Split by " - " to get segments: [authors, "journal, year", publisher]
    const parts = text.split(' - ');
    if (parts.length < 2) return null;

    // The journal info is in the second segment (index 1)
    const journalPart = parts[1].trim();
    // Remove trailing year (", 2024" or ", 2023")
    const journalName = journalPart.replace(/,\s*\d{4}\s*$/, '').trim();

    // Skip if it looks like a URL or empty
    if (!journalName || journalName.includes('http') || journalName.length < 3) {
      return null;
    }
    return journalName;
  }

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

      // 2. Find result info block
      const resultInfo = result.querySelector('.gs_ri');
      if (!resultInfo) return;

      // 3. Extract journal name from citation line and add badges
      const citationEl = resultInfo.querySelector('.gs_a');
      const journalName = extractJournalFromCitation(citationEl);

      if (journalName) {
        NiceMed.addBadgesToElement(citationEl, { name: journalName }, 'after');
      }

      // 4. Add "Search in PubMed" button
      const footerLinks = resultInfo.querySelector('.gs_fl');

      if (footerLinks) {
        createAndInsertButton(footerLinks, title);
      } else if (citationEl) {
        createAndInsertButton(citationEl, title, true);
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
      container.parentNode.insertBefore(button, container.nextSibling);
    } else {
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
