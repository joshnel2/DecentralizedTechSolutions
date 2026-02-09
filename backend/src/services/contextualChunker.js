/**
 * Contextual Chunker for Legal Documents
 * 
 * Implements Anthropic's Contextual Retrieval approach:
 * Before embedding each chunk, prepend document-level and section-level
 * context so the embedding captures WHERE and WHAT this chunk is about,
 * not just its literal text.
 * 
 * For a legal document, this means:
 * - A generic "indemnification" clause gets context about whether it's
 *   from a SaaS agreement, real estate lease, or employment contract
 * - A case citation gets context about the matter type and jurisdiction
 * - A definition gets context about which agreement it belongs to
 * 
 * Anthropic's benchmarks show 35-50% retrieval improvement with this approach.
 * For legal documents with heavy cross-referencing, we expect even higher gains.
 */

import { query } from '../db/connection.js';

// Chunk size configuration
const DEFAULT_CHUNK_SIZE = 800;       // Target chunk size in characters
const MAX_CHUNK_SIZE = 1200;          // Never exceed this
const MIN_CHUNK_SIZE = 100;           // Discard chunks smaller than this
const OVERLAP_SIZE = 100;             // Overlap between adjacent chunks for continuity

/**
 * Legal document section markers
 * These indicate natural chunk boundaries in legal documents
 */
const SECTION_MARKERS = [
  // Contract sections
  /^(?:ARTICLE|Article)\s+[IVXLCDM\d]+/m,
  /^(?:SECTION|Section)\s+\d+[\.\d]*/m,
  /^\d+\.\s+[A-Z][A-Z\s]+/m,                    // "1. DEFINITIONS"
  /^(?:WHEREAS|RECITALS|NOW,?\s*THEREFORE)/im,
  /^(?:IN WITNESS WHEREOF)/im,
  
  // Case law sections
  /^(?:OPINION|ORDER|JUDGMENT|MEMORANDUM)/im,
  /^(?:I{1,3}V?|V?I{0,3})\.\s+[A-Z]/m,          // Roman numeral sections
  /^(?:BACKGROUND|FACTS|ANALYSIS|DISCUSSION|CONCLUSION|HOLDING)/im,
  /^(?:STANDARD OF REVIEW)/im,
  
  // Pleading sections
  /^(?:COMES NOW|INTRODUCTION|STATEMENT OF FACTS)/im,
  /^(?:ARGUMENT|PRAYER FOR RELIEF|WHEREFORE)/im,
  /^(?:FIRST|SECOND|THIRD|FOURTH|FIFTH)\s+(?:CAUSE OF ACTION|CLAIM|DEFENSE|COUNT)/im,
  
  // General legal
  /^(?:EXHIBIT|SCHEDULE|APPENDIX|ANNEX)\s+[A-Z\d]/im,
];

/**
 * Document type classification patterns
 */
const DOCUMENT_TYPE_PATTERNS = {
  contract: [
    /agreement|contract|lease|license|terms/i,
    /whereas.*now,?\s*therefore/is,
    /party|parties|between.*and/i,
  ],
  case_law: [
    /v\.\s|vs?\.\s|versus/i,
    /plaintiff|defendant|appellant|appellee/i,
    /court|judge|justice|opinion/i,
    /\d+\s+(?:U\.S\.|F\.\s*(?:2d|3d|4th)?|S\.Ct\.|L\.Ed)/i,
  ],
  pleading: [
    /motion|complaint|answer|brief|memorandum/i,
    /comes now|respectfully\s+(?:submits|requests|moves)/i,
    /prayer\s+for\s+relief|wherefore/i,
  ],
  memo: [
    /memorandum|memo|to:.*from:/is,
    /re:|subject:/i,
    /analysis|recommendation|conclusion/i,
  ],
  letter: [
    /dear\s|sincerely|regards/i,
    /enclosed|attached|please\s+find/i,
  ],
  statute: [
    /§\s*\d+|U\.S\.C\.|C\.F\.R\./i,
    /enacted|effective\s+date|shall\s+be\s+(?:unlawful|prohibited)/i,
  ],
};

/**
 * Classify document type from name and content
 */
export function classifyDocumentType(documentName, content) {
  const nameAndContent = `${documentName || ''} ${(content || '').substring(0, 2000)}`;
  
  let bestType = 'legal_document';
  let bestScore = 0;
  
  for (const [type, patterns] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(nameAndContent)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  
  return bestType;
}

/**
 * Extract document-level metadata for context prepending
 */
function extractDocumentContext(document, content, matterInfo) {
  const parts = [];
  
  // Document name and type
  if (document.name) {
    parts.push(`Document: ${document.name}`);
  }
  
  const docType = document.type || classifyDocumentType(document.name, content);
  parts.push(`Type: ${docType}`);
  
  // Matter information
  if (matterInfo) {
    if (matterInfo.name) parts.push(`Matter: ${matterInfo.name}`);
    if (matterInfo.type || matterInfo.matter_type) {
      parts.push(`Matter Type: ${matterInfo.type || matterInfo.matter_type}`);
    }
    if (matterInfo.practice_area) {
      parts.push(`Practice Area: ${matterInfo.practice_area}`);
    }
  }
  
  // Jurisdiction (extract from content if available)
  const jurisdiction = extractJurisdiction(content);
  if (jurisdiction) {
    parts.push(`Jurisdiction: ${jurisdiction}`);
  }
  
  // Date
  if (document.created_at) {
    const date = new Date(document.created_at);
    parts.push(`Date: ${date.toISOString().split('T')[0]}`);
  }
  
  // Author
  if (document.owner_name || document.uploaded_by_name) {
    parts.push(`Author: ${document.owner_name || document.uploaded_by_name}`);
  }
  
  return parts.join(' | ');
}

/**
 * Extract jurisdiction from document content
 */
function extractJurisdiction(content) {
  if (!content) return null;
  
  const firstPage = content.substring(0, 3000);
  
  // State court patterns
  const statePatterns = [
    /(?:State|Commonwealth)\s+of\s+(\w+(?:\s+\w+)?)/i,
    /(?:Supreme|Superior|Circuit|District)\s+Court\s+(?:of|for)\s+(?:the\s+)?(?:State\s+of\s+)?(\w+(?:\s+\w+)?)/i,
    /governing\s+law[:\s]+(\w+(?:\s+\w+)?)/i,
    /laws\s+of\s+(?:the\s+State\s+of\s+)?(\w+(?:\s+\w+)?)/i,
  ];
  
  for (const pattern of statePatterns) {
    const match = firstPage.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Federal court patterns
  const federalPatterns = [
    /United\s+States\s+(?:District\s+Court|Court\s+of\s+Appeals)/i,
    /(?:S\.D\.N\.Y\.|N\.D\.\s*Cal\.|E\.D\.\s*Pa\.)/i,
    /(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|D\.C\.)\s+Circuit/i,
  ];
  
  for (const pattern of federalPatterns) {
    if (pattern.test(firstPage)) {
      const circuitMatch = firstPage.match(/(\w+)\s+Circuit/i);
      if (circuitMatch) return `${circuitMatch[1]} Circuit (Federal)`;
      return 'Federal';
    }
  }
  
  return null;
}

/**
 * Find section boundaries in legal document text
 */
function findSectionBoundaries(text) {
  const boundaries = [{ index: 0, marker: 'document_start' }];
  
  for (const pattern of SECTION_MARKERS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
    
    while ((match = regex.exec(text)) !== null) {
      boundaries.push({
        index: match.index,
        marker: match[0].trim().substring(0, 80),
      });
    }
  }
  
  // Sort by position and deduplicate nearby boundaries
  boundaries.sort((a, b) => a.index - b.index);
  
  const deduped = [boundaries[0]];
  for (let i = 1; i < boundaries.length; i++) {
    // Skip if within 50 chars of previous boundary
    if (boundaries[i].index - deduped[deduped.length - 1].index > 50) {
      deduped.push(boundaries[i]);
    }
  }
  
  return deduped;
}

/**
 * Split text into chunks respecting legal document structure
 * 
 * Strategy:
 * 1. First, find section boundaries (ARTICLE, SECTION, etc.)
 * 2. Within sections, split by paragraphs
 * 3. Within paragraphs, split by sentence if still too long
 * 4. Add overlap between chunks for continuity
 */
function splitIntoChunks(text, sectionBoundaries) {
  const rawChunks = [];
  
  for (let i = 0; i < sectionBoundaries.length; i++) {
    const start = sectionBoundaries[i].index;
    const end = i < sectionBoundaries.length - 1 
      ? sectionBoundaries[i + 1].index 
      : text.length;
    
    const sectionText = text.substring(start, end).trim();
    const sectionMarker = sectionBoundaries[i].marker;
    
    if (sectionText.length <= MAX_CHUNK_SIZE) {
      // Section fits in one chunk
      if (sectionText.length >= MIN_CHUNK_SIZE) {
        rawChunks.push({
          text: sectionText,
          sectionMarker,
          charStart: start,
          charEnd: end,
        });
      }
    } else {
      // Split section by paragraphs
      const paragraphs = sectionText.split(/\n\s*\n+/);
      let currentChunk = '';
      let chunkStart = start;
      
      for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;
        
        if (currentChunk.length + trimmedPara.length + 2 > DEFAULT_CHUNK_SIZE && currentChunk.length > 0) {
          // Flush current chunk
          if (currentChunk.length >= MIN_CHUNK_SIZE) {
            rawChunks.push({
              text: currentChunk,
              sectionMarker,
              charStart: chunkStart,
              charEnd: chunkStart + currentChunk.length,
            });
          }
          
          // Start new chunk with overlap
          const overlapText = currentChunk.length > OVERLAP_SIZE 
            ? currentChunk.substring(currentChunk.length - OVERLAP_SIZE)
            : '';
          currentChunk = overlapText + (overlapText ? '\n\n' : '') + trimmedPara;
          chunkStart = chunkStart + currentChunk.length - overlapText.length - trimmedPara.length - 2;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
        }
      }
      
      // Flush remaining
      if (currentChunk.length >= MIN_CHUNK_SIZE) {
        rawChunks.push({
          text: currentChunk,
          sectionMarker,
          charStart: chunkStart,
          charEnd: start + sectionText.length,
        });
      }
    }
  }
  
  return rawChunks;
}

/**
 * Detect special chunk types for legal domain
 */
function classifyChunkType(text) {
  // Citation block
  if (/\d+\s+(?:U\.S\.|S\.Ct\.|F\.\s*(?:2d|3d|4th)?|U\.S\.C\.|C\.F\.R\.)/i.test(text)) {
    return 'citation';
  }
  
  // Definition
  if (/^"?[A-Z][A-Za-z\s]+?"?\s+(?:means|shall\s+mean|refers\s+to|is\s+defined\s+as)/im.test(text)) {
    return 'definition';
  }
  
  // Recital/Whereas
  if (/^WHEREAS/im.test(text)) {
    return 'recital';
  }
  
  // Signature block
  if (/(?:IN WITNESS WHEREOF|BY:|Signature:|Authorized\s+Representative)/im.test(text)) {
    return 'signature_block';
  }
  
  // Numbered list/enumeration
  if (/^\s*(?:\([a-z]\)|(?:i{1,3}v?|v?i{0,3})\.|[a-z]\))\s/m.test(text)) {
    return 'enumeration';
  }
  
  return 'body';
}

/**
 * Extract cross-references within a chunk
 * These become candidates for graph edges
 */
function extractCrossReferences(text) {
  const refs = [];
  
  // Section cross-references
  const sectionRefs = text.matchAll(/(?:Section|§)\s*(\d+[\.\d]*(?:\([a-z]\))?)/gi);
  for (const match of sectionRefs) {
    refs.push({ type: 'section_ref', target: match[1], context: match[0] });
  }
  
  // Case citations
  const caseRefs = text.matchAll(/(\w+(?:\s+\w+)?)\s+v\.\s+(\w+(?:\s+\w+)?),?\s*(\d+\s+\w+\.?\s*(?:2d|3d|4th)?\s*\d+)/gi);
  for (const match of caseRefs) {
    refs.push({ type: 'case_citation', target: match[0].trim(), context: match[0] });
  }
  
  // Statute citations
  const statuteRefs = text.matchAll(/(\d+)\s+(U\.S\.C\.|C\.F\.R\.)\s*§\s*(\d+)/gi);
  for (const match of statuteRefs) {
    refs.push({ type: 'statute_citation', target: `${match[1]} ${match[2]} § ${match[3]}`, context: match[0] });
  }
  
  // Defined term references
  const definedTermRefs = text.matchAll(/(?:as\s+defined\s+in|see\s+definition\s+of)\s+"([^"]+)"/gi);
  for (const match of definedTermRefs) {
    refs.push({ type: 'defined_term', target: match[1], context: match[0] });
  }
  
  return refs;
}

/**
 * Main entry point: chunk a legal document with contextual metadata
 * 
 * @param {string} text - The full document text
 * @param {object} document - Document metadata (name, type, created_at, etc.)
 * @param {object} matterInfo - Matter metadata (name, type, practice_area, etc.)
 * @returns {object[]} Array of contextual chunks ready for embedding
 */
export function chunkWithContext(text, document = {}, matterInfo = null) {
  if (!text || text.trim().length < MIN_CHUNK_SIZE) {
    return [];
  }
  
  // Step 1: Build document-level context string
  const documentContext = extractDocumentContext(document, text, matterInfo);
  
  // Step 2: Find section boundaries
  const sectionBoundaries = findSectionBoundaries(text);
  
  // Step 3: Split into raw chunks
  const rawChunks = splitIntoChunks(text, sectionBoundaries);
  
  // Step 4: Enrich each chunk with context and metadata
  const contextualChunks = rawChunks.map((chunk, index) => {
    const chunkType = classifyChunkType(chunk.text);
    const crossRefs = extractCrossReferences(chunk.text);
    
    // Build the contextual text (what actually gets embedded)
    const sectionContext = chunk.sectionMarker !== 'document_start'
      ? `Section: ${chunk.sectionMarker}`
      : '';
    
    const contextPrefix = [documentContext, sectionContext]
      .filter(Boolean)
      .join(' | ');
    
    const contextualText = contextPrefix 
      ? `[${contextPrefix}]\n${chunk.text}`
      : chunk.text;
    
    return {
      chunkIndex: index,
      text: chunk.text,                    // Original text (stored for display)
      contextualText,                      // Context-prepended text (used for embedding)
      chunkType,
      sectionMarker: chunk.sectionMarker,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      crossReferences: crossRefs,
      metadata: {
        documentType: classifyDocumentType(document.name, text),
        chunkType,
        sectionMarker: chunk.sectionMarker,
        charRange: [chunk.charStart, chunk.charEnd],
        crossReferenceCount: crossRefs.length,
        wordCount: chunk.text.split(/\s+/).length,
      },
    };
  });
  
  return contextualChunks;
}

/**
 * Get matter information for context enrichment
 * Fetches matter metadata from database if available
 */
export async function getMatterContext(matterId, firmId) {
  if (!matterId || !firmId) {
    return null;
  }
  
  try {
    const result = await query(`
      SELECT 
        m.name,
        m.matter_type,
        m.status,
        m.description,
        c.name as client_name
      FROM matters m
      LEFT JOIN clients c ON c.id = m.client_id AND c.firm_id = m.firm_id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matterId, firmId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const matter = result.rows[0];
    return {
      name: matter.name,
      matter_type: matter.matter_type,
      status: matter.status,
      practice_area: matter.matter_type, // Map matter_type to practice_area
      client_name: matter.client_name,
    };
  } catch (error) {
    console.error('[ContextualChunker] Failed to fetch matter context:', error.message);
    return null;
  }
}

export default {
  chunkWithContext,
  classifyDocumentType,
  getMatterContext,
};
