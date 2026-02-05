/**
 * Document Learning System
 * 
 * Learns from user's documents to become a better lawyer AI:
 * - Extracts writing style patterns (per user, private)
 * - Learns document templates and structures
 * - Understands terminology preferences
 * - Remembers key clause patterns
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
};

/**
 * Analyze a document and extract learnings for the user
 */
export async function learnFromDocument(userId, firmId, document, content) {
  if (!content || content.length < 200) return []; // Too short to learn from
  
  const insights = [];
  
  try {
    // 1. Extract writing style
    const styleInsight = analyzeWritingStyle(content, document);
    if (styleInsight) {
      insights.push({
        type: InsightType.WRITING_STYLE,
        content: styleInsight,
        documentId: document.id,
        documentType: document.type || categorizeDocument(document.name),
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
        content: { terms, documentType: categorizeDocument(document.name) },
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
        documentType: categorizeDocument(document.name),
      });
    }
    
    // Store insights (private to this user)
    for (const insight of insights) {
      await storeDocumentInsight(userId, firmId, insight);
    }
    
    console.log(`[DocumentLearning] Learned ${insights.length} insights from document ${document.id} for user ${userId}`);
    return insights;
    
  } catch (error) {
    console.error('[DocumentLearning] Error learning from document:', error);
    return [];
  }
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
 * Categorize document by name
 */
function categorizeDocument(name) {
  const nameLower = (name || '').toLowerCase();
  
  if (/contract|agreement|lease|license/i.test(nameLower)) return 'contract';
  if (/memo|memorandum/i.test(nameLower)) return 'memo';
  if (/letter|correspondence/i.test(nameLower)) return 'letter';
  if (/brief|motion|filing/i.test(nameLower)) return 'court_filing';
  if (/will|trust|estate/i.test(nameLower)) return 'estate';
  if (/complaint|answer|pleading/i.test(nameLower)) return 'pleading';
  if (/discovery|interrogator|deposition/i.test(nameLower)) return 'discovery';
  if (/invoice|bill/i.test(nameLower)) return 'billing';
  
  return 'general';
}

/**
 * Check if document is a contract
 */
function isContractDocument(name) {
  return /contract|agreement|lease|license|nda|msa|sow|amendment/i.test(name || '');
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
  };
  
  for (const row of rows) {
    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    
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
    }
  }
  
  // Dedupe terminology
  const termSet = new Set();
  profile.preferredTerminology = profile.preferredTerminology.filter(t => {
    if (termSet.has(t.term)) return false;
    termSet.add(t.term);
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
    if (formalTerms.length > 0) {
      sections.push(`**Preferred Terms:** ${formalTerms.slice(0, 5).join(', ')}`);
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
