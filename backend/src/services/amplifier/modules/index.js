/**
 * Amplifier Module System
 * 
 * Pre-built autonomous workflow modules that guide the agent through
 * complex legal tasks with proven patterns and quality gates.
 * 
 * Each module defines:
 * - Required context/inputs
 * - Step-by-step execution plan
 * - Required tools and their order
 * - Quality gates and minimum requirements
 * - Expected outputs
 */

// Import individual modules
import { matterIntakeModule } from './matterIntake.js';
import { documentReviewModule } from './documentReview.js';
import { billingReviewModule } from './billingReview.js';
import { deadlineAuditModule } from './deadlineAudit.js';
import { caseAssessmentModule } from './caseAssessment.js';
import { clientCommunicationModule } from './clientCommunication.js';
import { legalResearchModule } from './legalResearch.js';
import { discoveryPrepModule } from './discoveryPrep.js';
import { contractAnalysisModule } from './contractAnalysis.js';
import { complianceCheckModule } from './complianceCheck.js';

/**
 * All available modules
 */
export const MODULES = {
  'matter-intake': matterIntakeModule,
  'document-review': documentReviewModule,
  'billing-review': billingReviewModule,
  'deadline-audit': deadlineAuditModule,
  'case-assessment': caseAssessmentModule,
  'client-communication': clientCommunicationModule,
  'legal-research': legalResearchModule,
  'discovery-prep': discoveryPrepModule,
  'contract-analysis': contractAnalysisModule,
  'compliance-check': complianceCheckModule,
};

/**
 * Module trigger patterns - keywords that activate specific modules
 */
const MODULE_TRIGGERS = {
  'matter-intake': [
    'new matter', 'new case', 'intake', 'open matter', 'start matter',
    'new client matter', 'onboard', 'setup matter'
  ],
  'document-review': [
    'review document', 'analyze document', 'summarize document',
    'document analysis', 'review all documents', 'document summary'
  ],
  'billing-review': [
    'billing review', 'invoice', 'time entry', 'unbilled time',
    'billing audit', 'prepare invoice', 'monthly billing'
  ],
  'deadline-audit': [
    'deadline', 'statute of limitation', 'calendar audit', 'upcoming deadline',
    'sol check', 'critical date', 'deadline review', 'calendar review'
  ],
  'case-assessment': [
    'case assessment', 'case evaluation', 'legal assessment', 'merit',
    'strength weakness', 'case strategy', 'litigation assessment'
  ],
  'client-communication': [
    'client update', 'status update', 'client email', 'client letter',
    'draft email', 'prepare communication', 'client status'
  ],
  'legal-research': [
    'research', 'case law', 'legal issue', 'statute', 'cplr',
    'precedent', 'legal analysis', 'authority'
  ],
  'discovery-prep': [
    'discovery', 'disclosure', 'interrogator', 'document production',
    'deposition', 'discovery request', 'privilege review'
  ],
  'contract-analysis': [
    'contract', 'agreement', 'lease', 'terms', 'provisions',
    'contract review', 'due diligence', 'contract analysis'
  ],
  'compliance-check': [
    'compliance', 'trust account', 'ethical', 'conflict check',
    'iola', 'retainer', 'engagement letter'
  ],
};

/**
 * Detect which module should handle a goal
 */
export function detectModule(goal) {
  const goalLower = goal.toLowerCase();
  
  // Score each module based on trigger matches
  const scores = {};
  
  for (const [moduleId, triggers] of Object.entries(MODULE_TRIGGERS)) {
    scores[moduleId] = 0;
    for (const trigger of triggers) {
      if (goalLower.includes(trigger)) {
        // Exact phrase match gets higher score
        scores[moduleId] += trigger.split(' ').length;
      }
    }
  }
  
  // Find highest scoring module
  let bestModule = null;
  let bestScore = 0;
  
  for (const [moduleId, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestModule = moduleId;
    }
  }
  
  // Only return if we have a confident match
  if (bestScore >= 2) {
    return MODULES[bestModule];
  }
  
  return null;
}

/**
 * Get module by ID
 */
export function getModule(moduleId) {
  return MODULES[moduleId] || null;
}

/**
 * Get all modules as array
 */
export function getAllModules() {
  return Object.entries(MODULES).map(([id, module]) => ({
    id,
    ...module.metadata,
  }));
}

/**
 * Validate module inputs
 */
export function validateModuleInputs(module, inputs) {
  const errors = [];
  const required = module.requiredContext || [];
  
  for (const field of required) {
    if (!inputs[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format module as system prompt enhancement
 */
export function formatModuleForPrompt(module, inputs = {}) {
  if (!module) return '';
  
  const sections = [];
  
  sections.push(`## ACTIVATED MODULE: ${module.metadata.name.toUpperCase()}`);
  sections.push(`\n**Description:** ${module.metadata.description}`);
  sections.push(`**Estimated Time:** ${module.metadata.estimatedMinutes} minutes`);
  sections.push(`**Complexity:** ${module.metadata.complexity}`);
  
  // Add execution plan
  if (module.executionPlan) {
    sections.push('\n### EXECUTION PLAN\n');
    sections.push('Follow these steps IN ORDER:\n');
    
    for (let i = 0; i < module.executionPlan.length; i++) {
      const step = module.executionPlan[i];
      sections.push(`**Step ${i + 1}: ${step.name}**`);
      sections.push(`- Description: ${step.description}`);
      sections.push(`- Tools: ${step.tools.join(', ')}`);
      if (step.required) {
        sections.push(`- ⚠️ REQUIRED - Do not skip this step`);
      }
      sections.push('');
    }
  }
  
  // Add quality gates
  if (module.qualityGates) {
    sections.push('### QUALITY REQUIREMENTS\n');
    sections.push('You MUST meet ALL of these requirements before completing:\n');
    
    for (const gate of module.qualityGates) {
      sections.push(`- ✅ ${gate.description} (${gate.metric}: ${gate.minValue})`);
    }
    sections.push('');
  }
  
  // Add expected outputs
  if (module.expectedOutputs) {
    sections.push('### EXPECTED DELIVERABLES\n');
    for (const output of module.expectedOutputs) {
      sections.push(`- ${output}`);
    }
    sections.push('');
  }
  
  // Add module-specific instructions
  if (module.instructions) {
    sections.push('### MODULE-SPECIFIC INSTRUCTIONS\n');
    sections.push(module.instructions);
    sections.push('');
  }
  
  return sections.join('\n');
}

// Export individual modules for direct use
export {
  matterIntakeModule,
  documentReviewModule,
  billingReviewModule,
  deadlineAuditModule,
  caseAssessmentModule,
  clientCommunicationModule,
  legalResearchModule,
  discoveryPrepModule,
  contractAnalysisModule,
  complianceCheckModule,
};
