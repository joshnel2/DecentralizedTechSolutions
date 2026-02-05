/**
 * Legal Knowledge Module Index
 * 
 * This module provides structured legal knowledge for the background agent.
 * Currently includes:
 * - NY CPLR (Civil Practice Law and Rules)
 * 
 * Future expansions:
 * - Federal Rules of Civil Procedure (FRCP)
 * - NY CPLR (Commercial Division Rules)
 * - NY Business Corporation Law
 * - NY Real Property Law
 * - Other state procedural rules
 */

export * from './nyCPLR.js';

// Re-export for convenient access
import nyCPLR, { 
  getCPLRContextForPrompt, 
  getCPLRGuidanceForMatter,
  NY_CPLR,
  CPLR_ARTICLE_2_LIMITATIONS,
  CPLR_ARTICLE_3_JURISDICTION,
  CPLR_ARTICLE_31_DISCLOSURE,
  CPLR_ARTICLE_32_JUDGMENT,
  CPLR_TIME_COMPUTATION,
  CPLR_DEADLINES_QUICK_REFERENCE
} from './nyCPLR.js';

export default {
  nyCPLR,
  // Add more jurisdictions/rules here as needed
  // frcp: null, // Federal Rules of Civil Procedure
  // nyBCL: null, // NY Business Corporation Law
};

/**
 * Get all available legal knowledge contexts for the system prompt
 */
export function getAllLegalKnowledgeContext() {
  let context = '';
  
  // NY CPLR
  context += getCPLRContextForPrompt();
  
  // Add more contexts here as modules are added
  
  return context;
}

/**
 * Get matter-specific guidance from all applicable legal frameworks
 */
export function getComprehensiveLegalGuidance(matterType, matterDescription = '') {
  const guidance = {
    nyCPLR: getCPLRGuidanceForMatter(matterType, matterDescription),
    // Add more jurisdictions as needed
  };
  
  return guidance;
}
