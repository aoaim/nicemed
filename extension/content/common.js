/**
 * NiceMed - Common Utilities
 * Shared functions for content scripts
 */

const NiceMed = {
  CONSTANTS: NiceMedConstants,

  // Per-page query cache to avoid redundant IPC calls
  _cache: new Map(),

  /**
   * Log message with prefix
   */
  log(...args) {
    console.log(`[${this.CONSTANTS.APP_NAME}]`, ...args);
  },

  /**
   * Build cache key from query object
   */
  _cacheKey(query) {
    return (query.issn || '') + '|' + (query.eissn || '') + '|' + (query.name || '').toUpperCase();
  },

  /**
   * Query journal info from background script (with cache)
   */
  async queryJournal(query) {
    const key = this._cacheKey(query);
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    try {
      const result = await browser.runtime.sendMessage({
        type: 'queryJournal',
        query
      });
      this._cache.set(key, result);
      return result;
    } catch (error) {
      this.log('Query failed:', error);
      return null;
    }
  },

  /**
   * Create a badge element
   */
  createBadge(text, type, title = '') {
    const badge = document.createElement('span');
    badge.className = `${this.CONSTANTS.BADGE_CLASS_PREFIX}badge ${this.CONSTANTS.BADGE_CLASS_PREFIX}badge-${type}`;
    badge.textContent = text;
    if (title) {
      badge.title = title;
    }
    return badge;
  },

  /**
   * Create container for badges
   */
  createBadgeContainer(journal) {
    const container = document.createElement('div');
    container.className = `${this.CONSTANTS.BADGE_CLASS_PREFIX}badge-container`;
    container.setAttribute(this.CONSTANTS.ATTR_CONTAINER, 'true');

    if (!journal) {
      this.log('No journal data provided to createBadgeContainer.');
      return null;
    }

    // Badge 1: Journal Name (formatted)
    if (journal.name) {
      const displayName = this.getDisplayName(journal.name);
      const nameBadge = this.createBadge(
        this.toTitleCase(displayName),
        'name',
        '期刊名'
      );
      container.appendChild(nameBadge);
    }

    // Badge 2: JCR Quartile
    if (journal.jcrQ) {
      const q = journal.jcrQ;
      let type = 'jcr-q4';
      if (q === 'Q1') type = 'jcr-q1';
      else if (q === 'Q2') type = 'jcr-q2';
      else if (q === 'Q3') type = 'jcr-q3';
      container.appendChild(this.createBadge(`JCR ${q}`, type, 'JCR分区'));
    }

    // Badge 3: CAS Quartile and Rank
    if (journal.casQ) {
      const q = journal.casQ;
      let type = 'cas-4';
      if (q === 1) type = 'cas-1';
      else if (q === 2) type = 'cas-2';
      else if (q === 3) type = 'cas-3';
      const category = journal.casCategory || '综合';
      const tooltip = `中科院分区大类和排名: ${journal.casRank || ''}`;
      container.appendChild(this.createBadge(`${category}${q}区`, type, tooltip));
    }

    // Badge 4: Impact Factor
    if (journal.if) {
      container.appendChild(
        this.createBadge(`IF: ${journal.if.toFixed(1)}`, 'if', '影响因子 (2024)')
      );
    }

    // Badge 5: Top Journal
    if (journal.isTop) {
      container.appendChild(this.createBadge('🏆 TOP', 'top', 'Top 期刊'));
    }

    // Badge 6: Warning Journal
    if (journal.isWarning) {
      container.appendChild(this.createBadge('⚠️ WARN', 'warning', '中科院国际期刊预警名单 (2025)'));
    }

    // Badge 7: Mega Journal
    if (journal.isMega) {
      container.appendChild(this.createBadge('🌊 MEGA', 'mega', 'Mega-Journal'));
    }

    // Badge 8: China Support
    if (journal.isChinaSupport) {
      container.appendChild(this.createBadge('🇨🇳 CN', 'cn', '中国SCI期刊支持计划'));
    }

    return container.children.length > 0 ? container : null;
  },

  /**
   * Get display name alias
   */
  getDisplayName(name) {
    if (!name) return '';

    const aliasMap = {
      'PROCEEDINGS OF THE NATIONAL ACADEMY OF SCIENCES OF THE UNITED STATES OF AMERICA': 'PNAS',
      'PROCEEDINGS OF THE NATIONAL ACADEMY OF SCIENCES USA': 'PNAS',
      'PROC NATL ACAD SCI USA': 'PNAS'
    };

    const normalized = name.toUpperCase().trim();
    if (aliasMap[normalized]) {
      return aliasMap[normalized];
    }
    return name;
  },

  /**
   * Convert string to Title Case
   */
  toTitleCase(str) {
    if (!str) return '';

    const smallWords = /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|vs?\.?|via)$/i;

    // Special overrides for tricky journals
    const overrides = {
      'EBIOMEDICINE': 'eBiomedicine',
      'ELIFE': 'eLife',
      'ECLINICALMEDICINE': 'eClinicalMedicine',
      'ISCIENCE': 'iScience',
      'IMETA': 'iMeta',
      'PNAS': 'PNAS'
    };

    if (overrides[str.toUpperCase()]) {
      return overrides[str.toUpperCase()];
    }

    // If not ALL CAPS, trust existing casing
    const isAllCaps = str === str.toUpperCase();
    if (!isAllCaps) return str;

    return str.split(' ').map((word, index, parts) => {
      if (index > 0 && index < parts.length - 1 && smallWords.test(word)) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  },

  /**
   * Inject badges into an element
   */
  async addBadgesToElement(element, query, insertPosition = 'append') {
    if (!element || !query) return false;

    // Check for cached/processed status
    if (element.hasAttribute(this.CONSTANTS.ATTR_PROCESSED)) return false;

    const journal = await this.queryJournal(query);
    if (journal) {
      const badgeContainer = this.createBadgeContainer(journal);
      if (badgeContainer) {
        if (insertPosition === 'append') {
          element.appendChild(badgeContainer);
        } else if (insertPosition === 'prepend') {
          element.insertBefore(badgeContainer, element.firstChild);
        } else if (insertPosition === 'after') {
          element.parentNode.insertBefore(badgeContainer, element.nextSibling);
        } else if (insertPosition === 'before') {
          element.parentNode.insertBefore(badgeContainer, element);
        }
        element.setAttribute(this.CONSTANTS.ATTR_PROCESSED, 'true');
        return true;
      }
    } else {
      element.setAttribute(this.CONSTANTS.ATTR_PROCESSED, 'not-found');
    }
    return false;
  },

  /**
   * Check if element already has badges
   */
  hasBadges(element) {
    if (!element) return false;
    return element.querySelector(`[${this.CONSTANTS.ATTR_CONTAINER}="true"]`) !== null;
  }
};

// Make available globally
window.NiceMed = NiceMed;
