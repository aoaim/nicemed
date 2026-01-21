/**
 * NiceMed - CSV to JSON Converter
 * Converts FQBJCR2025-UTF8.csv and JCR2024-UTF8.csv to journals.json
 * 
 * Usage: node convert-csv.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const DATA_DIR = path.join(__dirname, '..');
const CSV_DIR = path.join(DATA_DIR, 'csv');
const CAS_CSV = path.join(CSV_DIR, 'FQBJCR2025-UTF8.csv');
const JCR_CSV = path.join(CSV_DIR, 'JCR2024-UTF8.csv');
const OUTPUT_JSON = path.join(DATA_DIR, 'extension', 'data', 'journals.json');

/**
 * Parse CSV content to array of objects
 */
function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const obj = {};
    
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }
    
    results.push(obj);
  }
  
  return results;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Normalize ISSN format
 */
function normalizeISSN(issn) {
  if (!issn || issn === 'N/A') return null;
  // Remove spaces, keep hyphen or add it
  issn = issn.replace(/\s/g, '').toUpperCase();
  if (issn.length === 8 && !issn.includes('-')) {
    issn = issn.slice(0, 4) + '-' + issn.slice(4);
  }
  return issn;
}

/**
 * Parse CAS division format like "1 [30/840]" to get division number and full rank
 */
function parseCasDivision(text) {
  if (!text) return { q: null, rank: null };
  const match = text.match(/^(\d+)\s*(\[\d+\/\d+\])/);
  if (match) {
    return {
      q: parseInt(match[1], 10),
      rank: text.trim() // Keep full string like "1 [30/840]"
    };
  }
  return { q: null, rank: null };
}

/**
 * Check if journal is marked as Top
 */
function isTop(value) {
  return value === '是';
}

/**
 * Check if journal is in China SCI Support Program
 */
function isChinaSupport(value) {
  if (!value) return false;
  return value.includes('中国SCI期刊支持计划') || value.includes('中英文期刊');
}

/**
 * Check if journal is in Warning List
 */
function isWarning(value) {
  if (!value) return false;
  return value.includes('预警');
}

/**
 * Check if journal is Mega-Journal
 */
function isMega(value) {
  if (!value) return false;
  return value.toLowerCase().includes('mega');
}

/**
 * Main conversion function
 */
async function convert() {
  console.log('Loading CSV files...');
  
  // Load CAS data
  const casContent = fs.readFileSync(CAS_CSV, 'utf-8');
  const casData = parseCSV(casContent);
  console.log(`Parsed ${casData.length} CAS entries`);
  
  // Load JCR data
  const jcrContent = fs.readFileSync(JCR_CSV, 'utf-8');
  const jcrData = parseCSV(jcrContent);
  console.log(`Parsed ${jcrData.length} JCR entries`);
  
  // Build journal database indexed by ISSN
  const journals = {};
  
  // Index by both ISSN and eISSN
  const excludedIssns = new Set();
  
  // Filter out non-science/medical categories as requested
  const excludedCategories = [
    '文学', '历史学', '艺术学', '管理学', '社会学', 
    '经济学', '法学', '哲学', '教育学',
    '工程技术', '计算机科学', '地球科学', '数学', '物理与天体物理'
  ];

  for (const row of casData) {
    const journalName = row['Journal'];
    if (!journalName) continue;
    
    // Parse ISSN/EISSN field (format: "1234-5678/8765-4321")
    const issnField = row['ISSN/EISSN'] || '';
    const issnParts = issnField.split('/');
    const issn = normalizeISSN(issnParts[0]);
    const eissn = normalizeISSN(issnParts[1]);
    
    const casCategory = row['大类'] || null;
    
    if (excludedCategories.includes(casCategory)) {
      if (issn) excludedIssns.add(issn);
      if (eissn) excludedIssns.add(eissn);
      continue;
    }

    const casDivision = parseCasDivision(row['大类分区']);
    const mark = row['标注'];
    
    const journal = {
      name: journalName,
      issn: issn,
      eissn: eissn,
      casCategory: row['大类'] || null,
      casQ: casDivision.q,
      casRank: casDivision.rank,
      isTop: isTop(row['Top']),
      isChinaSupport: isChinaSupport(mark),
      isWarning: isWarning(mark),
      isMega: isMega(mark),
      if: null,
      jcrQ: null
    };
    
    // Index by both ISSN and eISSN
    if (issn) {
      journals[issn] = journal;
    }
    if (eissn && eissn !== issn) {
      journals[eissn] = journal;
    }
  }
  
  console.log(`Indexed ${Object.keys(journals).length} entries from CAS data`);
  console.log(`Blacklisted ${excludedIssns.size} ISSNs from excluded categories`);
  
  // Process JCR data and merge
  let jcrMatched = 0;
  let jcrNew = 0;
  
  for (const row of jcrData) {
    const journalName = row['Journal'];
    if (!journalName) continue;
    
    const issn = normalizeISSN(row['ISSN']);
    const eissn = normalizeISSN(row['eISSN']);
    
    // Skip blacklisted journals
    if ((issn && excludedIssns.has(issn)) || (eissn && excludedIssns.has(eissn))) {
      continue;
    }

    const ifValue = parseFloat(row['IF(2024)']);
    const jcrQ = row['IF Quartile(2024)'];
    
    // Try to find existing entry
    let journal = null;
    if (issn && journals[issn]) {
      journal = journals[issn];
      jcrMatched++;
    } else if (eissn && journals[eissn]) {
      journal = journals[eissn];
      jcrMatched++;
    }
    
    if (journal) {
      // Merge JCR data into existing entry
      if (!isNaN(ifValue)) {
        journal.if = ifValue;
      }
      if (jcrQ) {
        journal.jcrQ = jcrQ;
      }
    } else {
      // Create new entry from JCR data
      const newJournal = {
        name: journalName,
        issn: issn,
        eissn: eissn,
        casCategory: null,
        casQ: null,
        casRank: null,
        isTop: false,
        isChinaSupport: false,
        isWarning: false,
        isMega: false,
        if: isNaN(ifValue) ? null : ifValue,
        jcrQ: jcrQ || null
      };
      
      if (issn) {
        journals[issn] = newJournal;
        jcrNew++;
      }
      if (eissn && eissn !== issn) {
        journals[eissn] = newJournal;
      }
    }
  }
  
  console.log(`JCR data: ${jcrMatched} matched, ${jcrNew} new entries`);
  console.log(`Total entries: ${Object.keys(journals).length}`);
  
  // Also create name-based index for fallback matching
  const nameIndex = {};
  for (const key in journals) {
    const journal = journals[key];
    const normalizedName = journal.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!nameIndex[normalizedName]) {
      nameIndex[normalizedName] = key;
    }
  }
  
  // Write output
  const outputDir = path.dirname(OUTPUT_JSON);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create optimized output with name aliases
  const output = {};
  const seen = new Set();
  
  for (const key in journals) {
    const journal = journals[key];
    // Avoid duplicating the same journal object
    const journalKey = journal.issn || journal.eissn || journal.name;
    if (seen.has(journalKey)) {
      // Just add a reference
      output[key] = journals[journal.issn || journal.eissn];
      continue;
    }
    seen.add(journalKey);
    output[key] = journal;
  }
  
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 0));
  
  const stats = fs.statSync(OUTPUT_JSON);
  console.log(`\nOutput written to: ${OUTPUT_JSON}`);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Generate some stats
  let withIF = 0, withCasQ = 0, withTop = 0, withCnSupport = 0, withWarning = 0, withMega = 0;
  const uniqueJournals = new Set();
  
  for (const key in output) {
    const j = output[key];
    uniqueJournals.add(j.name);
    if (j.if) withIF++;
    if (j.casQ) withCasQ++;
    if (j.isTop) withTop++;
    if (j.isChinaSupport) withCnSupport++;
    if (j.isWarning) withWarning++;
    if (j.isMega) withMega++;
  }
  
  console.log(`\nStats:`);
  console.log(`  Unique journals: ${uniqueJournals.size}`);
  console.log(`  With IF: ${withIF}`);
  console.log(`  With CAS Q: ${withCasQ}`);
  console.log(`  Top journals: ${withTop}`);
  console.log(`  China Support: ${withCnSupport}`);
  console.log(`  Warning List: ${withWarning}`);
  console.log(`  Mega Journals: ${withMega}`);
}

// Run
convert().catch(console.error);
