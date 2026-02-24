/**
 * NiceMed - Background Script
 * Loads journal data and handles queries from content scripts
 */

const APP_NAME = 'NiceMed';

let journalData = null;
let nameIndex = null; // Pre-built name index for O(1) lookup
let dataLoaded = false;

// Load journal data on startup
async function loadJournalData() {
  try {
    const url = browser.runtime.getURL("data/journals.json");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    journalData = await response.json();
    dataLoaded = true;

    // Build name index for fast lookup
    nameIndex = new Map();
    for (const key in journalData) {
      const journal = journalData[key];
      if (journal.name) {
        const normalized = normalizeJournalName(journal.name);
        if (!nameIndex.has(normalized)) {
          nameIndex.set(normalized, journal);
        }
      }
      // Also index aliases
      if (journal.aliases) {
        for (const alias of journal.aliases) {
          const normalizedAlias = normalizeJournalName(alias);
          if (!nameIndex.has(normalizedAlias)) {
            nameIndex.set(normalizedAlias, journal);
          }
        }
      }
    }

    console.log(
      `[${APP_NAME}] Journal data loaded:`,
      Object.keys(journalData).length,
      "entries,",
      nameIndex.size,
      "name index entries",
    );
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to load journal data:`, error);
    dataLoaded = false;
  }
}

// Initialize
loadJournalData();

// Handle messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "queryJournal") {
    const result = queryJournal(message.query);
    return Promise.resolve(result);
  }

  if (message.type === "getStatus") {
    return Promise.resolve({
      dataLoaded,
      entryCount: journalData ? Object.keys(journalData).length : 0,
    });
  }

  return false;
});

/**
 * Query journal by various criteria
 * @param {Object} query - Query object with issn, eissn, or name
 * @returns {Object|null} Journal info or null if not found
 */
function queryJournal(query) {
  if (!journalData) return null;

  // Try ISSN first
  if (query.issn) {
    const normalized = normalizeISSN(query.issn);
    if (journalData[normalized]) {
      return journalData[normalized];
    }
  }

  // Try eISSN
  if (query.eissn) {
    const normalized = normalizeISSN(query.eissn);
    if (journalData[normalized]) {
      return journalData[normalized];
    }
  }

  // Try journal name via pre-built index (O(1) lookup)
  if (query.name) {
    const normalizedName = normalizeJournalName(query.name);

    // Direct name match via index
    const directMatch = nameIndex.get(normalizedName);
    if (directMatch) {
      return directMatch;
    }

    // Retry with parentheses info stripped (e.g. "Sensors (Basel)" -> "Sensors")
    // This is common in PubMed for journals with location qualifiers
    const paramIndex = query.name.indexOf('(');
    if (paramIndex > 0) {
      const cleanName = query.name.substring(0, paramIndex).trim();
      const normalizedClean = normalizeJournalName(cleanName);
      const parenMatch = nameIndex.get(normalizedClean);
      if (parenMatch) {
        console.log(`[${APP_NAME}] Match by stripping parens: "${query.name}" -> "${parenMatch.name}"`);
        return parenMatch;
      }
    }

    // Fuzzy match / Abbreviation match (Smart Prefix Matching)
    const queryClean = query.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
    const startChar = queryClean.trim().charAt(0);

    let bestMatch = null;
    let bestScore = 0;

    // Filter candidates by first letter for performance
    const candidates = Object.values(journalData).filter(j => {
      if (!j.name) return false;
      const jName = j.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
      return jName.charAt(0) === startChar;
    });

    for (const journal of candidates) {
      const score = calculateMatchScore(query.name, journal.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = journal;
      }
    }

    // Threshold for acceptance (80 out of 100)
    if (bestScore >= 80) {
      console.log(`[${APP_NAME}] Fuzzy match: "${query.name}" -> "${bestMatch.name}" (Score: ${bestScore})`);
      return bestMatch;
    }
  }

  return null;
}

/**
 * Calculate similarity score between query (potential abbreviation) and target (full name)
 * Handles "J Biol Chem" matching "Journal of Biological Chemistry"
 */
function calculateMatchScore(query, target) {
  if (!query || !target) return 0;

  const qObj = parseName(query);
  const tObj = parseName(target);

  // If query has more words than target, it's unlikely a match
  if (qObj.words.length > tObj.words.length) return 0;

  // Check for suspicious truncation (query ending in OF, AND, etc.)
  // This prevents "Journal of..." matching "Journal of Finance" or "Burns &..." matching "Burns & Trauma"
  if (qObj.words.length > 0) {
    const lastQWord = qObj.words[qObj.words.length - 1];
    const suspiciousEndings = new Set(['OF', 'AND', 'THE', 'A', 'AN', 'IN', 'ON', 'FOR']);
    if (suspiciousEndings.has(lastQWord)) {
      return 0;
    }
  }

  // Check word coverage
  let matchCount = 0;
  let qIndex = 0;
  let tIndex = 0;

  while (qIndex < qObj.words.length && tIndex < tObj.words.length) {
    const qWord = qObj.words[qIndex];
    const tWord = tObj.words[tIndex];

    // Check if qWord is a prefix of tWord
    if (tWord.startsWith(qWord)) {
      matchCount++;
      qIndex++;
      tIndex++;
    } else if (isSubsequence(qWord, tWord)) {
      // Allow subsequence match for abbreviations like NATL -> NATIONAL
      matchCount++;
      qIndex++;
      tIndex++;
    } else {
      // Try skipping target word
      tIndex++;
    }
  }

  // Score calculation
  const coverage = matchCount / qObj.words.length;
  let score = coverage * 100;

  // Tie-breaker: Penalize targets with extra words that were not matched
  if (score >= 90) {
    const extraWords = Math.max(0, tObj.words.length - matchCount);
    score -= Math.min(20, extraWords * 2);
  }

  return Math.max(0, score);
}

/**
 * Check if s1 is a subsequence of s2 (characters of s1 appear in s2 in order)
 * e.g. NATL in NATIONAL -> true
 */
function isSubsequence(s1, s2) {
  if (s1.length > s2.length) return false;
  if (s1[0] !== s2[0]) return false; // First char must match for abbreviations

  let i = 0; // index for s1
  let j = 0; // index for s2

  while (i < s1.length && j < s2.length) {
    if (s1[i] === s2[j]) {
      i++;
    }
    j++;
  }
  return i === s1.length;
}

/**
 * Parse name into normalized words, ignoring stop words
 */
function parseName(name) {
  const stopWords = new Set(['THE', 'A', 'AN']);
  const words = name.toUpperCase()
    .replace(/&/g, ' AND ') // Convert & to AND explicitly
    .replace(/[^A-Z0-9\s]/g, ' ') // Replace punctuation with space
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopWords.has(w));

  return { words, original: name };
}

/**
 * Normalize ISSN format (preserve hyphen to match journals.json keys)
 */
function normalizeISSN(issn) {
  if (!issn) return "";
  // Remove spaces, ensure uppercase, preserve hyphen
  issn = issn.replace(/\s/g, "").toUpperCase();
  // Add hyphen if missing (8 digits without hyphen)
  if (issn.length === 8 && !issn.includes('-')) {
    issn = issn.slice(0, 4) + '-' + issn.slice(4);
  }
  return issn;
}

/**
 * Normalize journal name for comparison
 */
function normalizeJournalName(name) {
  if (!name) return "";
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}
