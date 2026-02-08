/**
 * Research Tools for Background Agent
 * 
 * Gives the agent the ability to search the web, read web pages, and
 * search case law databases -- turning it from a "can only read what's
 * in the platform" tool into something that can actually research.
 * 
 * Safety Rails:
 * - Source quality filtering: legal-specific searches prioritize known-good domains
 * - Content length caps: web pages trimmed to prevent context window blowout
 * - Rate limiting: max searches/reads per task to prevent runaway costs
 * - Citation provenance: every piece of external content is tagged with its source
 * - No login-gated content: only free, public sources
 * 
 * Supported backends:
 * - Web search: Bing Web Search API (Azure) or Tavily API
 * - Web reading: Jina Reader API or native fetch + HTML parsing
 * - Case law: CourtListener API (free, millions of opinions)
 */

import https from 'https';
import http from 'http';

// =====================================================================
// CONFIGURATION
// =====================================================================

// Rate limits per task (enforced by the caller in amplifierService)
export const RESEARCH_LIMITS = {
  maxSearchesPerTask: 15,     // web_search calls
  maxPageReadsPerTask: 20,    // read_webpage calls
  maxCaseLawSearchesPerTask: 10, // search_case_law calls
  maxContentCharsPerRead: 15000, // trim page content to this
  maxResultsPerSearch: 8,     // search results returned
};

// Trusted legal domains that get priority in search results
const TRUSTED_LEGAL_DOMAINS = [
  'law.cornell.edu',         // Cornell LII - statutes, rules, constitution
  'courtlistener.com',       // CourtListener - case law
  'scholar.google.com',      // Google Scholar - case law
  'codes.findlaw.com',       // FindLaw - statutes
  'casetext.com',            // Casetext - case law (some free)
  'justia.com',              // Justia - case law, statutes
  'law.justia.com',
  'supreme.justia.com',
  'nycourts.gov',            // NY Courts
  'courts.gov',              // Federal courts
  'uscourts.gov',
  'supremecourt.gov',
  'nysenate.gov',            // NY Legislature
  'legislature.gov',
  'congress.gov',
  'govinfo.gov',
  'leginfo.legislature.ca.gov',
  'westlaw.com',             // Won't be readable but signal quality
  'lexisnexis.com',
  'law.com',
  'americanbar.org',         // ABA
  'nysba.org',               // NY State Bar
];

// Domains to NEVER cite as legal authority
const BLOCKED_DOMAINS = [
  'reddit.com',
  'quora.com', 
  'yahoo.com/answers',
  'avvo.com',                // Lawyer Q&A, not authoritative
  'wikipedia.org',           // Reference only, never cite
  'tiktok.com',
  'facebook.com',
  'twitter.com',
  'x.com',
];

// =====================================================================
// WEB SEARCH
// =====================================================================

/**
 * Search the web using Bing Web Search API or Tavily.
 * 
 * Returns structured results with title, URL, snippet, and source quality rating.
 * Legal-specific queries automatically boost trusted legal domains.
 * 
 * @param {object} params - { query, legal_focus, max_results, site_filter }
 * @returns {object} { results: [...], query, source, result_count }
 */
export async function webSearch(params) {
  const { 
    query: searchQuery, 
    legal_focus = true,
    max_results = 6,
    site_filter = null,  // e.g., "law.cornell.edu" to restrict to one site
  } = params;
  
  if (!searchQuery || searchQuery.trim().length < 3) {
    return { error: 'Search query is required and must be at least 3 characters' };
  }
  
  const cleanQuery = searchQuery.trim().substring(0, 300); // Cap query length
  const resultLimit = Math.min(max_results, RESEARCH_LIMITS.maxResultsPerSearch);
  
  // Try Bing first (Azure-native), fall back to Tavily, then to a basic approach
  const bingKey = process.env.BING_SEARCH_API_KEY || process.env.AZURE_BING_SEARCH_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  
  let results;
  let searchSource;
  
  if (bingKey) {
    results = await _bingSearch(cleanQuery, bingKey, resultLimit, legal_focus, site_filter);
    searchSource = 'bing';
  } else if (tavilyKey) {
    results = await _tavilySearch(cleanQuery, tavilyKey, resultLimit, legal_focus);
    searchSource = 'tavily';
  } else {
    // No search API configured - return helpful error
    return {
      error: 'Web search is not configured. Set BING_SEARCH_API_KEY or TAVILY_API_KEY in environment variables.',
      hint: 'You can still use lookup_cplr for NY CPLR references and search_case_law for CourtListener case law.',
      configured: false,
    };
  }
  
  if (results.error) return results;
  
  // Rate and tag each result
  const taggedResults = results.map(r => ({
    ...r,
    source_quality: _rateSourceQuality(r.url),
    is_trusted_legal: TRUSTED_LEGAL_DOMAINS.some(d => r.url?.includes(d)),
    is_blocked: BLOCKED_DOMAINS.some(d => r.url?.includes(d)),
    provenance: `web_search:${searchSource}`,
  })).filter(r => !r.is_blocked); // Remove blocked domains entirely
  
  // Sort: trusted legal sources first, then by original rank
  taggedResults.sort((a, b) => {
    if (a.is_trusted_legal && !b.is_trusted_legal) return -1;
    if (!a.is_trusted_legal && b.is_trusted_legal) return 1;
    return 0;
  });
  
  console.log(`[Research] web_search: "${cleanQuery.substring(0, 60)}" -> ${taggedResults.length} results (source: ${searchSource})`);
  
  return {
    results: taggedResults.slice(0, resultLimit),
    query: cleanQuery,
    source: searchSource,
    result_count: taggedResults.length,
    note: legal_focus 
      ? 'Results prioritized for legal relevance. Trusted legal sources ranked first.'
      : 'General web search results.',
    usage_hint: 'Use read_webpage on any URL to get the full content. Always verify citations from web sources.',
  };
}

/**
 * Bing Web Search API implementation
 */
async function _bingSearch(query, apiKey, count, legalFocus, siteFilter) {
  try {
    // Enhance query for legal searches
    let enhancedQuery = query;
    if (siteFilter) {
      enhancedQuery = `site:${siteFilter} ${query}`;
    } else if (legalFocus) {
      // Don't modify the query text, but we'll use Bing's market parameter
      // and sort results by trusted domains after
    }
    
    const params = new URLSearchParams({
      q: enhancedQuery,
      count: String(Math.min(count + 2, 10)), // Fetch a couple extra to filter blocked ones
      responseFilter: 'Webpages',
      textDecorations: 'false',
      textFormat: 'Raw',
    });
    
    const url = `https://api.bing.microsoft.com/v7.0/search?${params}`;
    
    const response = await fetchWithTimeout(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    }, 10000);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Research] Bing search error ${response.status}:`, errorText.substring(0, 200));
      return { error: `Search failed (${response.status}). Try again or use a different query.` };
    }
    
    const data = await response.json();
    const webPages = data.webPages?.value || [];
    
    return webPages.map((page, idx) => ({
      title: page.name,
      url: page.url,
      snippet: page.snippet,
      rank: idx + 1,
      date_crawled: page.dateLastCrawled,
    }));
  } catch (error) {
    console.error('[Research] Bing search error:', error.message);
    return { error: `Search failed: ${error.message}` };
  }
}

/**
 * Tavily Search API implementation
 */
async function _tavilySearch(query, apiKey, count, legalFocus) {
  try {
    const body = {
      api_key: apiKey,
      query: query,
      max_results: Math.min(count + 2, 10),
      search_depth: legalFocus ? 'advanced' : 'basic',
      include_domains: legalFocus 
        ? TRUSTED_LEGAL_DOMAINS.slice(0, 5) // Tavily supports domain filtering
        : [],
    };
    
    const response = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 15000);
    
    if (!response.ok) {
      return { error: `Search failed (${response.status})` };
    }
    
    const data = await response.json();
    const results = data.results || [];
    
    return results.map((r, idx) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.substring(0, 300) || '',
      rank: idx + 1,
      relevance_score: r.score,
    }));
  } catch (error) {
    console.error('[Research] Tavily search error:', error.message);
    return { error: `Search failed: ${error.message}` };
  }
}

// =====================================================================
// WEB PAGE READING
// =====================================================================

/**
 * Fetch a URL and extract clean, readable text content.
 * 
 * Uses Jina Reader API (if available) for high-quality extraction,
 * falls back to native fetch + HTML stripping.
 * 
 * Returns the content tagged with its source URL for citation provenance.
 * 
 * @param {object} params - { url, max_length, extract_citations }
 * @returns {object} { content, url, title, word_count, provenance, ... }
 */
export async function readWebpage(params) {
  const { 
    url, 
    max_length = RESEARCH_LIMITS.maxContentCharsPerRead,
    extract_citations = true,
  } = params;
  
  if (!url || !url.startsWith('http')) {
    return { error: 'A valid URL starting with http:// or https:// is required' };
  }
  
  // Block obviously non-useful URLs
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
    return { 
      error: `This source (${new URL(url).hostname}) is not suitable for legal research. Use trusted legal sources.`,
      blocked: true,
    };
  }
  
  // Check for login-gated legal databases
  const loginGated = ['westlaw.com', 'lexisnexis.com', 'bloomberglaw.com'];
  if (loginGated.some(d => url.includes(d))) {
    return {
      error: `${new URL(url).hostname} requires a subscription login. Use free sources: CourtListener (search_case_law), Cornell LII (law.cornell.edu), or Justia.`,
      login_required: true,
    };
  }
  
  const safeMaxLength = Math.min(max_length, RESEARCH_LIMITS.maxContentCharsPerRead);
  
  let content, title, extractionMethod;
  
  // Try Jina Reader first (best quality)
  const jinaKey = process.env.JINA_API_KEY;
  if (jinaKey || !process.env.DISABLE_JINA_READER) {
    const jinaResult = await _jinaRead(url, jinaKey);
    if (jinaResult && !jinaResult.error) {
      content = jinaResult.content;
      title = jinaResult.title;
      extractionMethod = 'jina_reader';
    }
  }
  
  // Fall back to native fetch + HTML stripping
  if (!content) {
    const nativeResult = await _nativeFetch(url);
    if (nativeResult.error) return nativeResult;
    content = nativeResult.content;
    title = nativeResult.title;
    extractionMethod = 'native_fetch';
  }
  
  if (!content || content.trim().length < 50) {
    return {
      error: 'Could not extract meaningful content from this page. It may require JavaScript rendering or login.',
      url,
      suggestion: 'Try a different source URL, or use web_search to find an alternative page.',
    };
  }
  
  // Trim content to max length
  const isTruncated = content.length > safeMaxLength;
  const trimmedContent = isTruncated 
    ? content.substring(0, safeMaxLength) + '\n\n[... content truncated at ' + safeMaxLength.toLocaleString() + ' characters ...]'
    : content;
  
  // Extract legal citations if requested
  let citations = [];
  if (extract_citations) {
    citations = _extractCitationsFromContent(trimmedContent);
  }
  
  const sourceQuality = _rateSourceQuality(url);
  const isTrustedLegal = TRUSTED_LEGAL_DOMAINS.some(d => url.includes(d));
  
  console.log(`[Research] read_webpage: ${url.substring(0, 80)} -> ${trimmedContent.length} chars (${extractionMethod}, quality: ${sourceQuality})`);
  
  return {
    success: true,
    url,
    title: title || 'Untitled',
    content: trimmedContent,
    word_count: trimmedContent.split(/\s+/).length,
    content_length: content.length,
    truncated: isTruncated,
    extraction_method: extractionMethod,
    source_quality: sourceQuality,
    is_trusted_legal: isTrustedLegal,
    citations_found: citations,
    provenance: `read_webpage:${extractionMethod}:${new URL(url).hostname}`,
    citation_note: isTrustedLegal
      ? `✅ Trusted legal source (${new URL(url).hostname}). Content can be cited with source attribution.`
      : `⚠️ Non-authoritative source (${new URL(url).hostname}). Verify any legal claims independently. Mark citations as [UNVERIFIED] unless corroborated by a trusted legal source.`,
  };
}

/**
 * Jina Reader API - converts any URL to clean markdown
 */
async function _jinaRead(url, apiKey) {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers = {
      'Accept': 'text/plain',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetchWithTimeout(jinaUrl, { headers }, 20000);
    
    if (!response.ok) {
      console.log(`[Research] Jina Reader ${response.status} for ${url.substring(0, 60)}`);
      return null; // Fall through to native fetch
    }
    
    const text = await response.text();
    
    // Jina returns markdown with a title line at the top
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;
    
    // Remove Jina metadata headers
    const content = text
      .replace(/^Title:.*$/m, '')
      .replace(/^URL Source:.*$/m, '')
      .replace(/^Markdown Content:.*$/m, '')
      .trim();
    
    return { content, title };
  } catch (error) {
    console.log(`[Research] Jina Reader error: ${error.message}`);
    return null; // Fall through to native fetch
  }
}

/**
 * Native fetch + HTML stripping fallback
 */
async function _nativeFetch(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ApexLegalAgent/1.0; +https://apexlegal.com)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
    }, 15000);
    
    if (!response.ok) {
      return { error: `Failed to fetch page (HTTP ${response.status})` };
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // Handle plain text
    if (contentType.includes('text/plain') || contentType.includes('application/json')) {
      const text = await response.text();
      return { content: text, title: null };
    }
    
    // Handle HTML
    const html = await response.text();
    const title = _extractTitleFromHtml(html);
    const content = _stripHtmlToText(html);
    
    return { content, title };
  } catch (error) {
    console.error(`[Research] Native fetch error for ${url.substring(0, 60)}:`, error.message);
    return { error: `Failed to read page: ${error.message}` };
  }
}

// =====================================================================
// CASE LAW SEARCH (CourtListener)
// =====================================================================

/**
 * Search for case law using the CourtListener API.
 * 
 * CourtListener is a free, open-source legal database with millions of
 * federal and state court opinions. It's maintained by Free Law Project.
 * 
 * @param {object} params - { query, jurisdiction, date_after, date_before, court }
 * @returns {object} { cases: [...], query, source, count }
 */
export async function searchCaseLaw(params) {
  const {
    query: searchQuery,
    jurisdiction = null,    // e.g., "ny", "ca", "fed"
    date_after = null,      // e.g., "2015-01-01"
    date_before = null,
    court = null,           // e.g., "scotus", "ca2" (2nd Circuit)
    max_results = 8,
  } = params;
  
  if (!searchQuery || searchQuery.trim().length < 3) {
    return { error: 'Search query is required and must be at least 3 characters' };
  }
  
  const courtListenerToken = process.env.COURTLISTENER_API_TOKEN;
  const resultLimit = Math.min(max_results, RESEARCH_LIMITS.maxResultsPerSearch);
  
  // Build CourtListener search URL
  const searchParams = new URLSearchParams({
    q: searchQuery.trim().substring(0, 300),
    order_by: 'score desc',
    type: 'o', // opinions
  });
  
  // Add optional filters
  if (jurisdiction) {
    // Map common abbreviations to CourtListener court IDs
    const jurisdictionMap = {
      'ny': 'court_id=nysd OR court_id=nyed OR court_id=nywd OR court_id=nynd OR court_id=nyappdiv OR court_id=ny',
      'nys': 'court_id=ny OR court_id=nyappdiv OR court_id=nysupct',
      'fed': 'court_id=scotus OR court_id=ca1 OR court_id=ca2 OR court_id=ca3 OR court_id=ca4 OR court_id=ca5 OR court_id=ca6 OR court_id=ca7 OR court_id=ca8 OR court_id=ca9 OR court_id=ca10 OR court_id=ca11 OR court_id=cadc OR court_id=cafc',
      'scotus': 'court_id=scotus',
      '2d_circuit': 'court_id=ca2',
      'ca': 'court_id=cacd OR court_id=caed OR court_id=cand OR court_id=casd',
    };
    // We'll add jurisdiction to the query if it's a known abbreviation
    if (jurisdictionMap[jurisdiction.toLowerCase()]) {
      searchParams.set('q', `${searchQuery} ${jurisdictionMap[jurisdiction.toLowerCase()]}`);
    }
  }
  
  if (date_after) {
    searchParams.set('filed_after', date_after);
  }
  if (date_before) {
    searchParams.set('filed_before', date_before);
  }
  if (court) {
    searchParams.set('court', court);
  }
  
  searchParams.set('page_size', String(resultLimit));
  
  try {
    const url = `https://www.courtlistener.com/api/rest/v4/search/?${searchParams}`;
    
    const headers = {
      'Accept': 'application/json',
    };
    if (courtListenerToken) {
      headers['Authorization'] = `Token ${courtListenerToken}`;
    }
    
    const response = await fetchWithTimeout(url, { headers }, 15000);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Research] CourtListener error ${response.status}:`, errorText.substring(0, 200));
      
      if (response.status === 429) {
        return { error: 'Case law search rate limit reached. Wait a moment and try again, or narrow your search.' };
      }
      
      return { error: `Case law search failed (${response.status}). Try a simpler query.` };
    }
    
    const data = await response.json();
    const opinions = data.results || [];
    
    const cases = opinions.map((op, idx) => ({
      case_name: op.caseName || op.case_name || 'Unknown',
      citation: _buildCitationString(op),
      court: op.court || op.court_id || 'Unknown Court',
      date_filed: op.dateFiled || op.date_filed,
      docket_number: op.docketNumber || op.docket_number,
      snippet: (op.snippet || op.text || '').substring(0, 500),
      url: op.absolute_url 
        ? `https://www.courtlistener.com${op.absolute_url}`
        : null,
      rank: idx + 1,
      provenance: 'search_case_law:courtlistener',
      source_quality: 'authoritative',
      citation_ready: true, // Content from CourtListener can be cited
    }));
    
    console.log(`[Research] search_case_law: "${searchQuery.substring(0, 60)}" -> ${cases.length} cases`);
    
    return {
      cases,
      query: searchQuery,
      source: 'courtlistener',
      count: cases.length,
      total_available: data.count || cases.length,
      note: cases.length > 0
        ? `Found ${cases.length} case(s). Use read_webpage on any case URL to get the full opinion text. CourtListener citations are authoritative and can be used directly.`
        : `No cases found matching "${searchQuery}". Try broader search terms or different jurisdiction.`,
      citation_note: '✅ CourtListener is an authoritative legal database. Case citations from these results can be used directly without [UNVERIFIED] tags.',
    };
  } catch (error) {
    console.error('[Research] CourtListener search error:', error.message);
    return { 
      error: `Case law search failed: ${error.message}`,
      suggestion: 'Try a simpler query, or use web_search with site:law.cornell.edu for statutes.',
    };
  }
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Rate the quality of a source for legal research
 */
function _rateSourceQuality(url) {
  if (!url) return 'unknown';
  
  const hostname = new URL(url).hostname.toLowerCase();
  
  // Tier 1: Official government/court sources
  if (hostname.endsWith('.gov') || hostname.includes('courts.') || hostname.includes('courtlistener')) {
    return 'authoritative';
  }
  
  // Tier 2: Established legal publishers/databases
  if (TRUSTED_LEGAL_DOMAINS.some(d => hostname.includes(d))) {
    return 'trusted';
  }
  
  // Tier 3: Educational/reference (.edu)
  if (hostname.endsWith('.edu')) {
    return 'educational';
  }
  
  // Tier 4: Everything else
  return 'general';
}

/**
 * Extract legal citations from text content
 */
function _extractCitationsFromContent(content) {
  if (!content) return [];
  
  const citations = [];
  
  // Case citations: "Party v. Party, 123 F.3d 456 (2d Cir. 2020)"
  const caseCites = content.match(
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+v\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,?\s+\d+\s+(?:F\.(?:2d|3d|4th|Supp\.(?:2d|3d)?)|U\.S\.|S\.Ct\.|L\.Ed\.(?:2d)?|N\.Y\.(?:2d|3d)?|A\.D\.(?:2d|3d)?|Misc\.(?:2d|3d)?|N\.Y\.S\.(?:2d|3d)?)\s+\d+/g
  ) || [];
  
  for (const cite of caseCites.slice(0, 20)) {
    citations.push({ type: 'case', citation: cite.trim() });
  }
  
  // Statute citations: "CPLR § 213" or "42 U.S.C. § 1983"
  const statuteCites = content.match(
    /(?:CPLR|C\.P\.L\.R\.|U\.S\.C\.|N\.Y\.\s*\w+\s*Law)\s*§+\s*[\d.-]+(?:\([a-z0-9]+\))?/gi
  ) || [];
  
  for (const cite of statuteCites.slice(0, 20)) {
    citations.push({ type: 'statute', citation: cite.trim() });
  }
  
  return citations;
}

/**
 * Build a citation string from a CourtListener opinion object
 */
function _buildCitationString(opinion) {
  const parts = [];
  
  if (opinion.citation) {
    return Array.isArray(opinion.citation) ? opinion.citation[0] : opinion.citation;
  }
  
  // Try to build from components
  if (opinion.volume && opinion.reporter && opinion.page) {
    parts.push(`${opinion.volume} ${opinion.reporter} ${opinion.page}`);
  }
  
  if (opinion.dateFiled || opinion.date_filed) {
    const year = new Date(opinion.dateFiled || opinion.date_filed).getFullYear();
    if (opinion.court) {
      parts.push(`(${opinion.court} ${year})`);
    } else {
      parts.push(`(${year})`);
    }
  }
  
  return parts.join(' ') || 'Citation unavailable';
}

/**
 * Strip HTML tags and extract readable text
 */
function _stripHtmlToText(html) {
  if (!html) return '';
  
  let text = html;
  
  // Remove script and style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  
  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&sect;/g, '§');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}

/**
 * Extract <title> from HTML
 */
function _extractTitleFromHtml(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// =====================================================================
// OPENAI TOOL DEFINITIONS
// =====================================================================

/**
 * Tool definitions in OpenAI function-calling format.
 * These get added to BACKGROUND_AGENT_ONLY_TOOLS in toolBridge.js
 */
export const RESEARCH_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for legal information, statutes, case law, regulations, or any other information. Results are ranked with trusted legal sources (Cornell LII, CourtListener, Justia, .gov sites) prioritized. Use this during DISCOVERY phase to research legal issues. For NY CPLR specifically, prefer lookup_cplr. For case law specifically, prefer search_case_law.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query. Be specific: include jurisdiction, legal topic, and key terms. Example: "New York breach of contract statute of limitations CPLR 213"' 
          },
          legal_focus: { 
            type: 'boolean', 
            description: 'Prioritize legal sources in results (default: true)' 
          },
          max_results: { 
            type: 'integer', 
            description: 'Maximum results to return (default: 6, max: 8)' 
          },
          site_filter: { 
            type: 'string', 
            description: 'Restrict search to a specific domain. Example: "law.cornell.edu" for statutes, "courtlistener.com" for cases' 
          },
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_webpage',
      description: 'Read the full content of a web page. Use after web_search or search_case_law to read the actual content of a result. Returns clean text with source quality rating and citation provenance. Trusted legal sources (courtlistener.com, law.cornell.edu, .gov) can be cited directly. Non-authoritative sources should be marked [UNVERIFIED].',
      parameters: {
        type: 'object',
        properties: {
          url: { 
            type: 'string', 
            description: 'Full URL to read (must start with http:// or https://)' 
          },
          max_length: { 
            type: 'integer', 
            description: 'Maximum characters to return (default: 15000)' 
          },
          extract_citations: { 
            type: 'boolean', 
            description: 'Extract legal citations found in the content (default: true)' 
          },
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_case_law',
      description: 'Search for court opinions and case law using CourtListener, a free legal database with millions of federal and state court opinions. Returns case names, citations, court, date, and snippets. Use read_webpage on the case URL to get the full opinion text. Citations from CourtListener are authoritative and do not need [UNVERIFIED] tags.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Legal search query. Example: "breach of fiduciary duty limited liability company New York"' 
          },
          jurisdiction: { 
            type: 'string', 
            description: 'Filter by jurisdiction: "ny" (NY federal), "nys" (NY state), "fed" (all federal), "scotus" (Supreme Court), "2d_circuit", "ca" (California). Leave empty for all jurisdictions.' 
          },
          date_after: { 
            type: 'string', 
            description: 'Only cases filed after this date (YYYY-MM-DD). Example: "2015-01-01"' 
          },
          date_before: { 
            type: 'string', 
            description: 'Only cases filed before this date (YYYY-MM-DD)' 
          },
          court: { 
            type: 'string', 
            description: 'Specific court ID. Examples: "scotus", "ca2" (2nd Circuit), "nysd" (SDNY)' 
          },
          max_results: { 
            type: 'integer', 
            description: 'Maximum results (default: 8)' 
          },
        },
        required: ['query']
      }
    }
  },
];
