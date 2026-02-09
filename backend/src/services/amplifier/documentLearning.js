/**
 * Document Learning System
 * 
 * Learns from user's documents to become a better lawyer AI:
 * - Extracts writing style patterns (per user, private)
 * - Learns document templates and structures
 * - Understands terminology preferences
 * - Remembers key clause patterns
 * - Tracks naming conventions and folder organization
 * - Learns from version diffs (what the user changes between edits)
 * - Extracts jurisdiction and court references
 * 
 * TRIGGERS:
 * - Web upload (documents.js POST /)
 * - Web content view (documents.js GET /:id/content)
 * - Desktop client upload (drive.js PUT /files/:id/upload)
 * - Background sync (driveSync.js text extraction)
 * - Version creation (drive.js POST /documents/:id/versions)
 * 
 * PRIVACY: All learnings are scoped to user_id - never shared between users
 */

import { query } from '../../db/connection.js';

// In-memory cache per user for fast access
const userStyleCache = new Map();
const CACHE_TTL_MS = 600000; // 10 minutes

/**
 * Document insight types
 */
export const InsightType = {
  WRITING_STYLE: 'writing_style',       // Tone, formality, structure
  CLAUSE_PATTERN: 'clause_pattern',     // Common clause structures
  TERMINOLOGY: 'terminology',           // Preferred legal terms
  DOCUMENT_STRUCTURE: 'doc_structure',  // How they structure docs
  MATTER_PATTERN: 'matter_pattern',     // How they handle matter types
  CLIENT_STYLE: 'client_style',         // Per-client communication style
  NAMING_PATTERN: 'naming_pattern',     // How they name files
  FOLDER_PATTERN: 'folder_pattern',     // How they organize folders
  EDIT_PATTERN: 'edit_pattern',         // What they change between versions
  JURISDICTION: 'jurisdiction',         // Courts/jurisdictions they reference
  CITATION_STYLE: 'citation_style',    // How they cite cases/statutes
};

/**
 * Analyze a document and extract learnings for the user
 */
export async function learnFromDocument(userId, firmId, document, content) {
  if (!content || content.length < 200) return []; // Too short to learn from
  
  const insights = [];
  const docType = categorizeDocument(document.name);
  
  try {
    // 1. Extract writing style
    const styleInsight = analyzeWritingStyle(content, document);
    if (styleInsight) {
      insights.push({
        type: InsightType.WRITING_STYLE,
        content: styleInsight,
        documentId: document.id,
        documentType: docType,
      });
    }
    
    // 2. Extract clause patterns (for contracts/agreements)
    if (isContractDocument(document.name)) {
      const clauses = extractClausePatterns(content);
      for (const clause of clauses) {
        insights.push({
          type: InsightType.CLAUSE_PATTERN,
          content: clause,
          documentId: document.id,
          documentType: 'contract',
        });
      }
    }
    
    // 3. Extract terminology preferences
    const terms = extractTerminology(content);
    if (terms.length > 0) {
      insights.push({
        type: InsightType.TERMINOLOGY,
        content: { terms, documentType: docType },
        documentId: document.id,
      });
    }
    
    // 4. Extract document structure
    const structure = analyzeDocumentStructure(content);
    if (structure) {
      insights.push({
        type: InsightType.DOCUMENT_STRUCTURE,
        content: structure,
        documentId: document.id,
        documentType: docType,
      });
    }
    
    // 5. Extract naming conventions
    if (document.name) {
      const namingPattern = analyzeNamingPattern(document.name, document.folder_path || document.folderPath);
      if (namingPattern) {
        insights.push({
          type: InsightType.NAMING_PATTERN,
          content: namingPattern,
          documentId: document.id,
          documentType: docType,
        });
      }
    }
    
    // 6. Extract folder organization
    const folderPath = document.folder_path || document.folderPath;
    if (folderPath) {
      const folderPattern = analyzeFolderPattern(folderPath);
      if (folderPattern) {
        insights.push({
          type: InsightType.FOLDER_PATTERN,
          content: folderPattern,
          documentId: document.id,
          documentType: docType,
        });
      }
    }
    
    // 7. Extract jurisdiction/court references
    const jurisdictions = extractJurisdictions(content);
    if (jurisdictions.length > 0) {
      insights.push({
        type: InsightType.JURISDICTION,
        content: { jurisdictions, documentType: docType },
        documentId: document.id,
      });
    }
    
    // 8. Extract citation style
    const citationStyle = analyzeCitationStyle(content);
    if (citationStyle) {
      insights.push({
        type: InsightType.CITATION_STYLE,
        content: citationStyle,
        documentId: document.id,
        documentType: docType,
      });
    }
    
    // Store insights (private to this user)
    for (const insight of insights) {
      await storeDocumentInsight(userId, firmId, insight);
    }
    
    console.log(`[DocumentLearning] Learned ${insights.length} insights from "${document.name}" for user ${userId}`);
    return insights;
    
  } catch (error) {
    console.error('[DocumentLearning] Error learning from document:', error);
    return [];
  }
}

/**
 * Learn from version diff -- what did the user change between v(N-1) and v(N)?
 * This is a high-value signal: the user is showing you what they prefer.
 */
export async function learnFromVersionDiff(userId, firmId, documentId, oldContent, newContent, documentName) {
  if (!oldContent || !newContent || oldContent === newContent) return [];
  if (oldContent.length < 100 || newContent.length < 100) return [];
  
  const insights = [];
  const docType = categorizeDocument(documentName || '');
  
  try {
    // Find substitutions (what words/phrases were replaced)
    const substitutions = findSubstitutions(oldContent, newContent);
    if (substitutions.length > 0) {
      insights.push({
        type: InsightType.EDIT_PATTERN,
        content: {
          editType: 'substitutions',
          patterns: substitutions.slice(0, 10),
          documentType: docType,
        },
        documentId,
        documentType: docType,
      });
    }
    
    // Detect structural changes (sections added/removed/reordered)
    const oldSections = oldContent.split(/\n{2,}/).length;
    const newSections = newContent.split(/\n{2,}/).length;
    const oldLength = oldContent.length;
    const newLength = newContent.length;
    
    if (Math.abs(oldSections - newSections) > 1 || Math.abs(oldLength - newLength) > oldLength * 0.2) {
      insights.push({
        type: InsightType.EDIT_PATTERN,
        content: {
          editType: 'structural',
          sectionsAdded: Math.max(0, newSections - oldSections),
          sectionsRemoved: Math.max(0, oldSections - newSections),
          lengthChange: newLength - oldLength,
          percentChange: Math.round(((newLength - oldLength) / oldLength) * 100),
          documentType: docType,
        },
        documentId,
        documentType: docType,
      });
    }
    
    // Store insights
    for (const insight of insights) {
      await storeDocumentInsight(userId, firmId, insight);
    }
    
    if (insights.length > 0) {
      console.log(`[DocumentLearning] Learned ${insights.length} edit patterns from version diff for user ${userId}`);
    }
    return insights;
    
  } catch (error) {
    console.error('[DocumentLearning] Error learning from version diff:', error);
    return [];
  }
}

/**
 * Find word/phrase substitutions between two texts
 */
function findSubstitutions(oldText, newText) {
  const substitutions = [];
  
  // Split into sentences and find changed ones
  const oldSentences = oldText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  const newSentences = newText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  
  const oldSet = new Set(oldSentences);
  const newSet = new Set(newSentences);
  
  // Find sentences that were removed and roughly replaced
  const removed = oldSentences.filter(s => !newSet.has(s));
  const added = newSentences.filter(s => !oldSet.has(s));
  
  // Try to match removed with added (similar length, some shared words)
  for (const oldS of removed) {
    const oldWords = new Set(oldS.toLowerCase().split(/\s+/));
    let bestMatch = null;
    let bestOverlap = 0;
    
    for (const newS of added) {
      const newWords = newS.toLowerCase().split(/\s+/);
      const overlap = newWords.filter(w => oldWords.has(w)).length / Math.max(oldWords.size, 1);
      
      if (overlap > 0.3 && overlap > bestOverlap) { // At least 30% word overlap
        bestOverlap = overlap;
        bestMatch = newS;
      }
    }
    
    if (bestMatch) {
      // Find the actual changed parts
      const oldW = oldS.split(/\s+/);
      const newW = bestMatch.split(/\s+/);
      
      for (let i = 0; i < Math.min(oldW.length, newW.length); i++) {
        if (oldW[i].toLowerCase() !== newW[i].toLowerCase() && oldW[i].length > 2 && newW[i].length > 2) {
          substitutions.push({
            from: oldW[i],
            to: newW[i],
            context: oldW.slice(Math.max(0, i - 2), i + 3).join(' '),
          });
        }
      }
    }
  }
  
  return substitutions;
}

/**
 * Analyze writing style from document content
 */
function analyzeWritingStyle(content, document) {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 5) return null;
  
  // Calculate average sentence length
  const avgWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
  
  // Detect formality level
  const formalIndicators = [
    'pursuant to', 'hereby', 'whereas', 'notwithstanding',
    'hereinafter', 'aforementioned', 'therein', 'thereof'
  ];
  const informalIndicators = [
    "don't", "won't", "can't", "we'll", "you're", "let's"
  ];
  
  const contentLower = content.toLowerCase();
  const formalCount = formalIndicators.filter(w => contentLower.includes(w)).length;
  const informalCount = informalIndicators.filter(w => contentLower.includes(w)).length;
  
  // Detect paragraph structure
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
  const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / Math.max(paragraphs.length, 1);
  
  // Detect heading usage
  const hasHeadings = /^[A-Z][A-Z\s]+:|\n[A-Z][A-Z\s]+\n|^#+\s/.test(content);
  const hasNumberedSections = /^\d+\.|^\([a-z]\)|^[IVX]+\./.test(content);
  
  return {
    avgSentenceLength: Math.round(avgWords),
    formalityLevel: formalCount > informalCount ? 'formal' : (formalCount < informalCount ? 'informal' : 'neutral'),
    avgParagraphLength: Math.round(avgParagraphLength),
    usesHeadings: hasHeadings,
    usesNumberedSections: hasNumberedSections,
    documentName: document.name,
  };
}

/**
 * Extract clause patterns from contracts
 */
function extractClausePatterns(content) {
  const patterns = [];
  
  // Common clause headers
  const clauseHeaders = [
    'indemnification', 'indemnity',
    'limitation of liability', 'limitation',
    'confidentiality', 'confidential',
    'termination',
    'governing law', 'choice of law',
    'dispute resolution', 'arbitration',
    'force majeure',
    'assignment',
    'notices',
    'severability',
    'entire agreement', 'integration',
    'amendment', 'modification',
    'waiver',
  ];
  
  const contentLower = content.toLowerCase();
  
  for (const header of clauseHeaders) {
    const regex = new RegExp(`(${header}[\\s\\.:]+)([^\\n]+(?:\\n(?![A-Z0-9]+[\\.:]).[^\\n]+)*)`, 'gi');
    const match = regex.exec(contentLower);
    
    if (match && match[2]) {
      const clauseText = match[2].substring(0, 500).trim();
      if (clauseText.length > 50) {
        patterns.push({
          clauseType: header,
          sampleText: clauseText.substring(0, 200),
          length: clauseText.length,
        });
      }
    }
  }
  
  return patterns.slice(0, 10); // Limit to 10 clauses
}

/**
 * Extract preferred terminology
 */
function extractTerminology(content) {
  const terms = [];
  
  // Legal term pairs (some lawyers prefer one over the other)
  const termPairs = [
    { formal: 'hereinafter', informal: 'referred to as' },
    { formal: 'pursuant to', informal: 'according to' },
    { formal: 'notwithstanding', informal: 'despite' },
    { formal: 'whereas', informal: 'because' },
    { formal: 'shall', informal: 'will' },
    { formal: 'hereby', informal: '' },
    { formal: 'therein', informal: 'in it' },
    { formal: 'aforementioned', informal: 'mentioned above' },
  ];
  
  const contentLower = content.toLowerCase();
  
  for (const pair of termPairs) {
    if (contentLower.includes(pair.formal)) {
      terms.push({ term: pair.formal, style: 'formal' });
    }
    if (pair.informal && contentLower.includes(pair.informal)) {
      terms.push({ term: pair.informal, style: 'informal' });
    }
  }
  
  return terms;
}

/**
 * Analyze document structure
 */
function analyzeDocumentStructure(content) {
  const lines = content.split('\n');
  
  // Detect structure elements
  const hasHeader = lines.slice(0, 5).some(l => /^[A-Z][A-Z\s]+$/.test(l.trim()));
  const hasDate = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i.test(content.substring(0, 500));
  const hasSignatureBlock = /sincerely|regards|respectfully|signature|_________________/i.test(content.slice(-500));
  const hasRecitals = /WHEREAS|RECITALS|BACKGROUND/i.test(content.substring(0, 1500));
  const hasDefinitions = /definitions|"[^"]+" means|shall mean/i.test(content);
  
  // Count sections/headers
  const sectionCount = (content.match(/^[A-Z][A-Z\s]+:|^\d+\.\s+[A-Z]/gm) || []).length;
  
  return {
    hasHeader,
    hasDate,
    hasSignatureBlock,
    hasRecitals,
    hasDefinitions,
    sectionCount,
  };
}

/**
 * Categorize document by name -- expanded for legal practice
 */
function categorizeDocument(name) {
  const nameLower = (name || '').toLowerCase();
  
  // Contracts & Agreements
  if (/contract|agreement|lease|license|nda|msa|sow|amendment|addendum|rider/i.test(nameLower)) return 'contract';
  // Court Filings
  if (/motion|brief|filing|petition|order|judgment|ruling|opinion/i.test(nameLower)) return 'court_filing';
  // Pleadings
  if (/complaint|answer|pleading|counterclaim|cross-claim|reply|demurrer/i.test(nameLower)) return 'pleading';
  // Discovery
  if (/discovery|interrogator|deposition|request.*production|subpoena|rogs|rfp|rfa/i.test(nameLower)) return 'discovery';
  // Correspondence
  if (/letter|correspondence|demand|notice/i.test(nameLower)) return 'letter';
  // Memos
  if (/memo|memorandum|research|analysis/i.test(nameLower)) return 'memo';
  // Estate/Trust
  if (/will|trust|estate|probate|guardian|conservator/i.test(nameLower)) return 'estate';
  // Corporate
  if (/articles|bylaws|resolution|minutes|certificate|incorporation|formation/i.test(nameLower)) return 'corporate';
  // Real Estate
  if (/deed|mortgage|title|closing|survey|easement|lien/i.test(nameLower)) return 'real_estate';
  // Affidavits & Declarations
  if (/affidavit|declaration|sworn|verification|certification/i.test(nameLower)) return 'affidavit';
  // Settlement
  if (/settlement|release|stipulation|consent/i.test(nameLower)) return 'settlement';
  // Billing
  if (/invoice|bill|retainer|engagement.*letter|fee/i.test(nameLower)) return 'billing';
  // Immigration
  if (/visa|i-\d{3}|immigration|petition|uscis|asylum/i.test(nameLower)) return 'immigration';
  
  return 'general';
}

/**
 * Check if document is a contract
 */
function isContractDocument(name) {
  return /contract|agreement|lease|license|nda|msa|sow|amendment|addendum/i.test(name || '');
}

/**
 * Analyze file naming patterns
 */
function analyzeNamingPattern(fileName, folderPath) {
  if (!fileName) return null;
  
  const name = fileName.replace(/\.[^.]+$/, ''); // Remove extension
  
  const pattern = {
    hasDate: /\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}/.test(name),
    hasVersion: /v\d|version|rev|draft|final/i.test(name),
    hasMatterNumber: /\d{4}[-_]\d{3}|\d{2}[-_]\d+/.test(name),
    hasClientName: false, // Would need client list to verify
    usesUnderscores: name.includes('_'),
    usesDashes: name.includes('-'),
    usesCamelCase: /[a-z][A-Z]/.test(name),
    hasPrefix: /^[A-Z]{2,5}[-_]/.test(name),
    avgWordCount: name.split(/[-_\s]+/).length,
    datePosition: null as string | null,
    sampleName: name.substring(0, 60),
  };
  
  // Determine date position in filename
  if (pattern.hasDate) {
    const dateIdx = name.search(/\d{4}[-_]\d{2}|\d{2}[-_]\d{2}/);
    if (dateIdx < name.length / 3) pattern.datePosition = 'prefix';
    else if (dateIdx > name.length * 2 / 3) pattern.datePosition = 'suffix';
    else pattern.datePosition = 'middle';
  }
  
  return pattern;
}

/**
 * Analyze folder organization patterns
 */
function analyzeFolderPattern(folderPath) {
  if (!folderPath) return null;
  
  const parts = folderPath.split('/').filter(p => p);
  
  return {
    depth: parts.length,
    topLevel: parts[0] || null,
    usesClientFolders: parts.some(p => /client/i.test(p)),
    usesMatterFolders: parts.some(p => /matter|case/i.test(p)),
    usesDateFolders: parts.some(p => /\d{4}/.test(p)),
    usesTypeFolders: parts.some(p => /pleading|discovery|correspondence|draft|final/i.test(p)),
    samplePath: folderPath.substring(0, 80),
  };
}

/**
 * Extract jurisdiction and court references
 */
function extractJurisdictions(content) {
  const jurisdictions = [];
  const contentSample = content.substring(0, 5000); // Check first 5000 chars
  
  // Federal courts
  if (/United States District Court/i.test(contentSample)) {
    const match = contentSample.match(/(?:United States District Court|U\.?S\.?D\.?C\.?)\s+(?:for the\s+)?(.+?)(?:\n|,|\.|$)/i);
    if (match) jurisdictions.push({ type: 'federal', court: match[1].trim().substring(0, 80) });
  }
  if (/Circuit Court of Appeals|U\.?S\.? Court of Appeals/i.test(contentSample)) {
    jurisdictions.push({ type: 'federal_appellate', court: 'Circuit Court of Appeals' });
  }
  
  // State courts - common patterns
  const stateCourtMatch = contentSample.match(/(?:Supreme Court|Superior Court|Circuit Court|District Court|County Court|Family Court)\s+(?:of|for)\s+(?:the\s+)?(?:State of\s+)?(\w[\w\s]+?)(?:\n|,|\.|$)/i);
  if (stateCourtMatch) {
    jurisdictions.push({ type: 'state', court: stateCourtMatch[0].trim().substring(0, 80) });
  }
  
  // State references
  const statePatterns = /(?:State of|Commonwealth of|laws of)\s+(\w+)/gi;
  let stateMatch;
  while ((stateMatch = statePatterns.exec(contentSample)) !== null) {
    const state = stateMatch[1].trim();
    if (state.length > 2 && state.length < 20 && !/the|this|that/i.test(state)) {
      jurisdictions.push({ type: 'state_ref', state });
    }
  }
  
  // NY-specific (CPLR, NYCPLR)
  if (/CPLR|C\.P\.L\.R\.|N\.Y\.\s*C\.P\.L\.R/i.test(contentSample)) {
    jurisdictions.push({ type: 'state', state: 'New York', cplr: true });
  }
  
  return jurisdictions.slice(0, 5); // Limit
}

/**
 * Analyze citation style preferences
 */
function analyzeCitationStyle(content) {
  const contentSample = content.substring(0, 10000);
  
  // Count different citation formats
  const bluebookCount = (contentSample.match(/\d+\s+\w+\.\s*(?:2d|3d|4th)?\s*\d+/g) || []).length; // e.g., "123 F.3d 456"
  const pinCiteCount = (contentSample.match(/at\s+\d+/g) || []).length; // "at 234"
  const supraCount = (contentSample.match(/supra/gi) || []).length;
  const idCount = (contentSample.match(/\bId\.\s/g) || []).length;
  const seCount = (contentSample.match(/\bSee\s/g) || []).length;
  const cfCount = (contentSample.match(/\bCf\.\s/g) || []).length;
  
  const totalCitations = bluebookCount + supraCount + idCount;
  if (totalCitations < 2) return null; // Not enough citations to learn from
  
  return {
    style: bluebookCount > 3 ? 'bluebook' : 'informal',
    usesPinCites: pinCiteCount > 1,
    usesSupra: supraCount > 0,
    usesId: idCount > 0,
    usesSignalWords: seCount > 0 || cfCount > 0,
    citationDensity: totalCitations > 10 ? 'heavy' : (totalCitations > 4 ? 'moderate' : 'light'),
    totalFound: totalCitations,
  };
}

/**
 * Store document insight (private to user)
 */
async function storeDocumentInsight(userId, firmId, insight) {
  try {
    await query(`
      INSERT INTO ai_document_insights (
        user_id, firm_id, insight_type, content, document_id, document_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, insight_type, document_type, content_hash)
      DO UPDATE SET
        occurrence_count = ai_document_insights.occurrence_count + 1,
        updated_at = NOW()
    `, [
      userId,
      firmId,
      insight.type,
      JSON.stringify(insight.content),
      insight.documentId,
      insight.documentType,
    ]);
  } catch (error) {
    // Table might not exist - that's OK, we'll create it on next migration
    if (!error.message?.includes('ai_document_insights')) {
      console.error('[DocumentLearning] Error storing insight:', error);
    }
  }
}

/**
 * Get user's document insights for prompt enhancement
 */
export async function getUserDocumentProfile(userId, firmId, documentType = null) {
  // Check cache
  const cacheKey = `${userId}:${documentType || 'all'}`;
  const cached = userStyleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  
  try {
    let queryStr = `
      SELECT insight_type, content, document_type, occurrence_count
      FROM ai_document_insights
      WHERE user_id = $1 AND firm_id = $2
    `;
    const params = [userId, firmId];
    
    if (documentType) {
      queryStr += ` AND document_type = $3`;
      params.push(documentType);
    }
    
    queryStr += ` ORDER BY occurrence_count DESC, updated_at DESC LIMIT 50`;
    
    const result = await query(queryStr, params);
    
    // Process into a profile
    const profile = buildUserProfile(result.rows);
    
    // Cache it
    userStyleCache.set(cacheKey, { data: profile, timestamp: Date.now() });
    
    return profile;
    
  } catch (error) {
    // Table might not exist
    return null;
  }
}

/**
 * Build a user profile from insights
 */
function buildUserProfile(rows) {
  if (!rows || rows.length === 0) return null;
  
  const profile = {
    writingStyle: null,
    preferredTerminology: [],
    documentStructures: {},
    clausePatterns: [],
    namingPatterns: [],
    folderPatterns: [],
    editPatterns: [],
    jurisdictions: [],
    citationStyle: null,
    documentTypeFrequency: {},
  };
  
  for (const row of rows) {
    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    
    // Track document type frequency
    if (row.document_type) {
      profile.documentTypeFrequency[row.document_type] = 
        (profile.documentTypeFrequency[row.document_type] || 0) + (row.occurrence_count || 1);
    }
    
    switch (row.insight_type) {
      case InsightType.WRITING_STYLE:
        if (!profile.writingStyle) {
          profile.writingStyle = content;
        }
        break;
        
      case InsightType.TERMINOLOGY:
        if (content.terms) {
          profile.preferredTerminology.push(...content.terms);
        }
        break;
        
      case InsightType.DOCUMENT_STRUCTURE:
        if (!profile.documentStructures[row.document_type]) {
          profile.documentStructures[row.document_type] = content;
        }
        break;
        
      case InsightType.CLAUSE_PATTERN:
        profile.clausePatterns.push(content);
        break;
        
      case InsightType.NAMING_PATTERN:
        if (profile.namingPatterns.length < 5) {
          profile.namingPatterns.push(content);
        }
        break;
        
      case InsightType.FOLDER_PATTERN:
        if (profile.folderPatterns.length < 5) {
          profile.folderPatterns.push(content);
        }
        break;
        
      case InsightType.EDIT_PATTERN:
        if (profile.editPatterns.length < 10) {
          profile.editPatterns.push(content);
        }
        break;
        
      case InsightType.JURISDICTION:
        if (content.jurisdictions) {
          profile.jurisdictions.push(...content.jurisdictions);
        }
        break;
        
      case InsightType.CITATION_STYLE:
        if (!profile.citationStyle) {
          profile.citationStyle = content;
        }
        break;
    }
  }
  
  // Dedupe terminology
  const termSet = new Set();
  profile.preferredTerminology = profile.preferredTerminology.filter(t => {
    if (termSet.has(t.term)) return false;
    termSet.add(t.term);
    return true;
  });
  
  // Dedupe jurisdictions
  const jurisdictionSet = new Set();
  profile.jurisdictions = profile.jurisdictions.filter(j => {
    const key = `${j.type}:${j.court || j.state || ''}`;
    if (jurisdictionSet.has(key)) return false;
    jurisdictionSet.add(key);
    return true;
  });
  
  return profile;
}

/**
 * Format user profile for agent prompt
 */
export function formatProfileForPrompt(profile, documentType = null) {
  if (!profile) return '';
  
  const sections = [];
  
  // Writing style
  if (profile.writingStyle) {
    const style = profile.writingStyle;
    let styleDesc = `This user prefers ${style.formalityLevel} language`;
    if (style.avgSentenceLength > 25) {
      styleDesc += ' with longer, detailed sentences';
    } else if (style.avgSentenceLength < 15) {
      styleDesc += ' with short, concise sentences';
    }
    if (style.usesHeadings) styleDesc += ', uses section headings';
    if (style.usesNumberedSections) styleDesc += ', uses numbered sections';
    
    sections.push(`**Writing Style:** ${styleDesc}`);
  }
  
  // Terminology
  if (profile.preferredTerminology.length > 0) {
    const formalTerms = profile.preferredTerminology.filter(t => t.style === 'formal').map(t => t.term);
    const informalTerms = profile.preferredTerminology.filter(t => t.style === 'informal').map(t => t.term);
    if (formalTerms.length > 0) {
      sections.push(`**Preferred Legal Terms:** ${formalTerms.slice(0, 5).join(', ')}`);
    }
    if (informalTerms.length > 0) {
      sections.push(`**Uses Plain Language For:** ${informalTerms.slice(0, 5).join(', ')}`);
    }
  }
  
  // Document structure for this type
  if (documentType && profile.documentStructures[documentType]) {
    const struct = profile.documentStructures[documentType];
    const structParts = [];
    if (struct.hasRecitals) structParts.push('recitals/whereas section');
    if (struct.hasDefinitions) structParts.push('definitions section');
    if (struct.hasSignatureBlock) structParts.push('formal signature block');
    
    if (structParts.length > 0) {
      sections.push(`**${documentType} Structure:** Include ${structParts.join(', ')}`);
    }
  }
  
  // Clause patterns for contracts
  if (documentType === 'contract' && profile.clausePatterns.length > 0) {
    const clauseTypes = [...new Set(profile.clausePatterns.map(c => c.clauseType))].slice(0, 5);
    sections.push(`**Standard Clauses:** ${clauseTypes.join(', ')}`);
  }
  
  // Jurisdictions
  if (profile.jurisdictions && profile.jurisdictions.length > 0) {
    const courts = profile.jurisdictions
      .filter(j => j.court || j.state)
      .map(j => j.court || j.state)
      .slice(0, 3);
    if (courts.length > 0) {
      sections.push(`**Primary Jurisdictions:** ${courts.join(', ')}`);
    }
  }
  
  // Citation style
  if (profile.citationStyle) {
    const cs = profile.citationStyle;
    let citDesc = cs.style === 'bluebook' ? 'Uses Bluebook citation format' : 'Uses informal citations';
    if (cs.usesPinCites) citDesc += ', includes pin cites';
    if (cs.usesSignalWords) citDesc += ', uses signal words (See, Cf.)';
    citDesc += `, ${cs.citationDensity} citation density`;
    sections.push(`**Citation Style:** ${citDesc}`);
  }
  
  // Edit patterns (what they tend to change)
  if (profile.editPatterns && profile.editPatterns.length > 0) {
    const substitutionPatterns = profile.editPatterns
      .filter(e => e.editType === 'substitutions' && e.patterns)
      .flatMap(e => e.patterns)
      .slice(0, 5);
    if (substitutionPatterns.length > 0) {
      const subs = substitutionPatterns.map(s => `"${s.from}" → "${s.to}"`).join(', ');
      sections.push(`**Common Edits:** ${subs}`);
    }
  }
  
  // Document type focus
  if (profile.documentTypeFrequency && Object.keys(profile.documentTypeFrequency).length > 0) {
    const sorted = Object.entries(profile.documentTypeFrequency)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([type]) => type);
    if (sorted.length > 0 && sorted[0] !== 'general') {
      sections.push(`**Primary Document Types:** ${sorted.join(', ')}`);
    }
  }
  
  // Naming convention
  if (profile.namingPatterns && profile.namingPatterns.length > 0) {
    const patterns = profile.namingPatterns;
    const usesDate = patterns.some(p => p.hasDate);
    const usesDashes = patterns.some(p => p.usesDashes);
    const usesUnderscores = patterns.some(p => p.usesUnderscores);
    
    const parts = [];
    if (usesDate) parts.push('includes dates');
    if (usesDashes) parts.push('uses dashes');
    if (usesUnderscores) parts.push('uses underscores');
    
    if (parts.length > 0) {
      sections.push(`**Naming Convention:** ${parts.join(', ')}`);
    }
  }
  
  if (sections.length === 0) return '';
  
  return `\n## YOUR PERSONAL STYLE PREFERENCES\n\nBased on your previous documents (private to you):\n\n${sections.join('\n')}\n\nMatch this style when creating new documents.\n`;
}

/**
 * Learn from document on upload/view (hook into document routes)
 */
export async function onDocumentAccessed(userId, firmId, document, content) {
  // Only learn from substantial documents
  if (!content || content.length < 500) return;
  
  // Learn in background (don't block the request)
  setImmediate(() => {
    learnFromDocument(userId, firmId, document, content).catch(err => {
      console.error('[DocumentLearning] Background learning failed:', err.message);
    });
  });
}
