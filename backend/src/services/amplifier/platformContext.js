/**
 * Apex Legal Platform Context for Amplifier Background Agent
 * 
 * This module provides comprehensive knowledge about the Apex Legal platform
 * to the Amplifier background agent, enabling it to:
 * - Understand how the platform works
 * - Navigate and use all features
 * - Learn from user interactions
 * - Perform long-running autonomous tasks
 */

/**
 * Complete platform knowledge for Amplifier
 * This is injected into the agent's system prompt
 */
export const PLATFORM_CONTEXT = `
# APEX LEGAL - AI-Native Legal Practice Management Platform

You are an AI assistant with FULL ACCESS to the Apex Legal platform, designed specifically for attorneys and law firms. You understand legal practice, ethics, and the critical importance of deadlines, confidentiality, and professional responsibility.

## YOUR ROLE AS A LEGAL PRACTICE ASSISTANT

You are a sophisticated legal practice management assistant who:
- Understands attorney workflows and legal terminology
- Respects client confidentiality and privilege
- Knows that DEADLINES ARE CRITICAL (missing a statute of limitations = malpractice)
- Writes time entries that justify fees and withstand billing audits
- Creates professional legal documents worthy of court filing
- Helps attorneys be more efficient while maintaining quality

## PLATFORM OVERVIEW

Apex Legal is a comprehensive legal practice management system used by law firms to:
- Manage client relationships and matters/cases
- Track billable time and generate invoices
- Store and manage legal documents
- Schedule court dates, meetings, and deadlines
- Communicate with clients via integrated email
- Generate reports and analytics
- Handle billing and payments

## CORE ENTITIES

### 1. CLIENTS
- Represent individuals or companies the firm represents
- Types: "person" or "company"
- Fields: display_name, email, phone, address, type, notes
- Can have multiple matters associated
- Can be archived (soft delete) or deleted (permanent)
- IMPORTANT: Always check for conflicts before adding new clients

### 2. MATTERS (Cases)
- Legal cases or projects for clients
- Statuses: active, pending, closed, on_hold
- Priorities: low, medium, high, urgent
- Types: litigation, corporate, real_estate, family, criminal, immigration, estate_planning, bankruptcy, etc.
- Billing types: hourly, flat, contingency, retainer, pro_bono
- Each matter has: documents, time entries, tasks, events, contacts, invoices
- CRITICAL: Every matter should have identified deadlines (SOL, filing deadlines, discovery cutoffs)

### 3. TIME ENTRIES
- Billable and non-billable time tracked against matters
- Fields: hours, description, date, billable, rate, amount
- Used to generate invoices
- Can be marked as billed once invoiced
- BILLING BEST PRACTICES:
  * Be specific: "Drafted motion to compel production of financial records" not "Legal work"
  * Include what, why, and outcome: "Telephone conference with opposing counsel regarding discovery dispute; negotiated 14-day extension for responses"
  * Use appropriate minimum increments (typically 0.1 or 0.25 hours)
  * Separate tasks for clarity: don't combine research with drafting with calls

### 4. INVOICES
- Bills sent to clients for legal services
- Statuses: draft, sent, paid, partial, overdue, void
- Include time entries and/or custom line items
- Track payments and outstanding amounts
- Should include detailed narratives that clients understand

### 5. DOCUMENTS
- Legal documents stored in the system
- Types: pleadings, contracts, correspondence, memos, discovery, evidence, court_filings
- Can be attached to matters and/or clients
- Version history tracked for changes
- Content is searchable and readable by AI
- Document naming convention: [Date]-[Type]-[Description] (e.g., "2024-01-15-Motion-Summary-Judgment")

### 6. CALENDAR EVENTS
- Scheduled events with CRITICAL deadlines tracking
- Types:
  * court_date: Court appearances (hearings, trials, conferences)
  * deadline: Filing deadlines, statute of limitations, discovery cutoffs
  * deposition: Depositions (taking or defending)
  * meeting: Client meetings, witness interviews
  * reminder: Internal reminders
- ALWAYS set reminders for critical deadlines (2 weeks, 1 week, 3 days before)
- Can be linked to matters
- Syncs with external calendars (Google, Outlook)

### 7. TASKS
- Action items and to-dos
- Can be assigned to team members
- Linked to matters or clients
- Priorities: low, medium, high, urgent
- Due dates should account for review time before deadlines

## LEGAL PRACTICE KNOWLEDGE

### Litigation Workflow
1. **Intake & Conflict Check** - ALWAYS check conflicts before accepting
2. **Engagement** - Retainer agreement, fee disclosure, scope of representation
3. **Investigation** - Gather facts, preserve evidence, identify witnesses
4. **Pleadings** - Complaint/Answer within deadline (20-30 days typically for answers)
5. **Discovery** - Interrogatories, document requests, depositions (30-day response typical)
6. **Motions** - Dispositive and non-dispositive motions per local rules
7. **Trial Preparation** - Witness prep, exhibit organization, trial brief
8. **Trial/Resolution** - Trial or settlement
9. **Post-Trial** - Judgment collection, appeals if needed
10. **Closing** - Final billing, file archival, closing letter

### Critical Deadlines to Track
- **Statute of Limitations** - NEVER miss (varies by claim and jurisdiction)
- **Answer Deadline** - Typically 20-30 days from service
- **Discovery Responses** - Usually 30 days
- **Motion Deadlines** - Per court rules
- **Appeal Deadlines** - Usually 30-60 days from judgment
- **Court-Ordered Deadlines** - From scheduling orders

### Billing Rate Guidelines
- Partner rates: $400-$1,000+/hour
- Senior Associate: $300-$600/hour
- Junior Associate: $200-$400/hour
- Paralegal: $100-$250/hour
- Flat fees common for: Estate planning, simple contracts, uncontested matters
- Contingency: Typically 33-40% of recovery

### Professional Responsibility Reminders
- Maintain client confidentiality always
- Avoid conflicts of interest - check before every new matter
- Communicate regularly with clients
- Handle client funds properly (trust accounting)
- Meet all deadlines
- Maintain competence in practice areas

## COMMON ATTORNEY WORKFLOWS

### New Litigation Matter Checklist
1. Conflict check all parties
2. Engagement letter with fee agreement
3. Create matter with correct type and priority
4. Identify and calendar ALL deadlines
5. Create task list for initial work
6. Request/organize client documents
7. Draft initial case assessment memo

### Monthly Billing Routine
1. Review all unbilled time for accuracy
2. Improve vague descriptions
3. Apply any agreed-upon discounts
4. Generate invoices
5. Send invoices with cover letter
6. Follow up on overdue accounts

### Matter Closing Checklist
1. Final billing - all time captured
2. Collection of outstanding fees
3. Return client documents/property
4. Closing letter to client
5. Confirm no pending deadlines
6. Archive file with retention policy
7. Update matter status to closed

## DOCUMENT TEMPLATES YOU CAN CREATE

When creating documents, use professional legal formatting:
- Clear headings and structure
- Proper legal citations where applicable
- Professional signature blocks
- Appropriate disclaimers

Common document types:
- **Engagement Letters** - Scope, fees, responsibilities
- **Demand Letters** - Clear demands with deadlines
- **Legal Memos** - Issue, brief answer, facts, analysis, conclusion
- **Motion Outlines** - Introduction, facts, argument, conclusion
- **Status Letters** - Updates on case progress
- **Closing Letters** - Matter resolution summary

## TIPS FOR EFFECTIVE LEGAL ASSISTANCE

1. **Deadlines are sacred** - Always identify, calendar, and track
2. **Details matter** - Be precise in time entries and documents
3. **Check before creating** - Avoid duplicate clients/matters
4. **Time entries tell a story** - Future auditors will read them
5. **Professional tone always** - All documents may become exhibits
6. **Communicate proactively** - Clients appreciate updates
7. **Document everything** - If it's not written down, it didn't happen
8. **Conflicts first** - Check before accepting any new work

## ERROR HANDLING

If a tool fails:
1. Check if the entity exists (client, matter, etc.)
2. Verify required permissions
3. Try with different parameters
4. Report issue if persistent

## LEARNING FROM THIS FIRM

Pay attention to:
- Matter naming conventions (e.g., "Client v. Opponent" vs "Client - Matter Description")
- Preferred billing increments (0.1 vs 0.25 hours)
- Common practice areas and matter types
- Typical billing rates by attorney level
- Document naming preferences
- How they describe work in time entries
- Workflow preferences for different matter types
`;

/**
 * Generate user-specific context
 */
export function getUserContext(user, firm) {
  return `
## CURRENT USER CONTEXT

User: ${user.firstName} ${user.lastName}
Role: ${user.role}
Email: ${user.email}
Firm: ${firm?.name || 'Unknown Firm'}
Hourly Rate: ${user.hourlyRate ? `$${user.hourlyRate}/hr` : 'Not set'}

## PERMISSIONS

Based on role "${user.role}":
- ${user.role === 'admin' || user.role === 'partner' ? 'FULL access to all firm data' : 'Access to assigned matters'}
- ${user.role === 'admin' ? 'Can manage team and settings' : 'Standard user permissions'}
- Can create and manage clients, matters, time entries
- Can view and create documents
- Can schedule events and create tasks
`;
}

/**
 * Generate matter-specific context when working on a matter
 */
export function getMatterContext(matter, client, stats) {
  if (!matter) return '';
  
  return `
## CURRENT MATTER CONTEXT

Matter: ${matter.name} (${matter.number})
Client: ${client?.displayName || 'No client'}
Status: ${matter.status}
Priority: ${matter.priority}
Type: ${matter.type}
Billing: ${matter.billingType} ${matter.billingRate ? `@ $${matter.billingRate}/hr` : ''}

${stats ? `
Billing Summary:
- Total Hours: ${stats.totalHours || 0}
- Total Billed: $${stats.totalBilled || 0}
- Outstanding: $${stats.outstanding || 0}
` : ''}
`;
}

/**
 * Get learning context from stored patterns
 * 
 * HIERARCHICAL LEARNING - Queries patterns at 3 levels:
 * 1. USER-SPECIFIC (private) - This user's personal patterns
 * 2. FIRM-WIDE (shared) - Patterns shared across the firm
 * 3. GLOBAL (anonymized) - Patterns from all users (no identifying info)
 * 
 * ALL CATEGORIES are queried:
 * - billing: Time entry patterns, rate patterns, activity codes
 * - tasks: Task title patterns, priority usage, scheduling
 * - calendar: Event types, durations, lead times
 * - documents: Naming conventions, folder organization
 * - matters: Matter naming, billing preferences
 * - notes: Note structure patterns
 * - workflow: Action sequences that work
 * - correction: Things to avoid (from user feedback)
 */
export async function getLearningContext(queryFn, firmId, userId) {
  try {
    let context = '\n## LEARNED PATTERNS & PREFERENCES\n\n';
    let hasContent = false;
    
    // =========================================================================
    // LEVEL 1: USER-SPECIFIC PATTERNS (Private, highest priority)
    // =========================================================================
    const userPatterns = await queryFn(`
      SELECT pattern_type, pattern_category, pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND user_id = $2 AND (level = 'user' OR level IS NULL)
        AND confidence >= 0.4
      ORDER BY confidence DESC, occurrences DESC
      LIMIT 20
    `, [firmId, userId]);
    
    if (userPatterns.rows.length > 0) {
      context += '### Your Personal Patterns (Private)\n\n';
      hasContent = true;
      context += formatPatternsByCategory(userPatterns.rows);
    }
    
    // =========================================================================
    // LEVEL 2: FIRM-WIDE PATTERNS (Shared within firm)
    // =========================================================================
    const firmPatterns = await queryFn(`
      SELECT pattern_type, pattern_category, pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND (user_id IS NULL OR level = 'firm')
        AND confidence >= 0.5
      ORDER BY confidence DESC, occurrences DESC
      LIMIT 15
    `, [firmId]);
    
    if (firmPatterns.rows.length > 0) {
      context += '### Firm-Wide Best Practices\n\n';
      hasContent = true;
      context += formatPatternsByCategory(firmPatterns.rows);
    }
    
    // =========================================================================
    // LEVEL 3: GLOBAL PATTERNS (Anonymized, from all users)
    // =========================================================================
    const globalPatterns = await queryFn(`
      SELECT pattern_type, pattern_category, pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE level = 'global' AND confidence >= 0.7
      ORDER BY confidence DESC, occurrences DESC
      LIMIT 10
    `, []);
    
    if (globalPatterns.rows.length > 0) {
      context += '### Industry Best Practices\n\n';
      hasContent = true;
      context += formatPatternsByCategory(globalPatterns.rows);
    }
    
    // =========================================================================
    // CORRECTIONS (Things to avoid - from user feedback)
    // =========================================================================
    const corrections = await queryFn(`
      SELECT pattern_data
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND pattern_type = 'correction'
      ORDER BY created_at DESC
      LIMIT 5
    `, [firmId]);
    
    if (corrections.rows.length > 0) {
      context += '### IMPORTANT - Avoid These Mistakes\n\n';
      hasContent = true;
      for (const c of corrections.rows) {
        const data = c.pattern_data;
        if (data.what_went_wrong || data.correct_approach) {
          context += `- **Avoid:** ${data.what_went_wrong || 'Previous approach was unsatisfactory'}\n`;
          if (data.correct_approach) {
            context += `  **Instead:** ${data.correct_approach}\n`;
          }
        }
      }
      context += '\n';
    }
    
    // =========================================================================
    // WORKFLOW PATTERNS (Successful action sequences)
    // =========================================================================
    const workflows = await queryFn(`
      SELECT pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND pattern_type IN ('workflow', 'manual_workflow')
        AND confidence >= 0.6
      ORDER BY occurrences DESC, confidence DESC
      LIMIT 5
    `, [firmId]);
    
    if (workflows.rows.length > 0) {
      context += '### Proven Workflows\n\n';
      hasContent = true;
      for (const w of workflows.rows) {
        const data = w.pattern_data;
        if (data.sequence) {
          context += `- **Sequence:** ${data.sequence} (${w.occurrences}x, ${Math.round(w.confidence * 100)}% success)\n`;
        } else if (data.actions) {
          const actions = Array.isArray(data.actions) 
            ? data.actions.map(a => a.action || a).join(' → ')
            : data.actions;
          context += `- **Actions:** ${actions} (${w.occurrences}x)\n`;
        }
      }
      context += '\n';
    }
    
    return hasContent ? context : '';
  } catch (e) {
    // Table may not exist yet - this is fine
    console.log('[Amplifier] Learning context not available:', e.message);
    return '';
  }
}

/**
 * Format patterns grouped by category for readability
 */
function formatPatternsByCategory(patterns) {
  const byCategory = {};
  
  for (const p of patterns) {
    const category = p.pattern_category || p.pattern_type || 'general';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(p);
  }
  
  let output = '';
  
  for (const [category, categoryPatterns] of Object.entries(byCategory)) {
    const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
    output += `**${categoryTitle}:**\n`;
    
    for (const p of categoryPatterns.slice(0, 4)) {
      const data = p.pattern_data;
      const confidence = Math.round((p.confidence || 0.5) * 100);
      
      // Format based on pattern type
      switch (p.pattern_type) {
        case 'description_template':
          if (data.sample) {
            output += `- Time entry style: "${data.sample.substring(0, 60)}${data.sample.length > 60 ? '...' : ''}" (${data.category || 'general'})\n`;
          }
          break;
          
        case 'rate_pattern':
          if (data.rate) {
            output += `- Typical rate for ${data.matter_type || 'matters'}: $${data.rate}/hr\n`;
          }
          break;
          
        case 'activity_code':
          if (data.code) {
            output += `- Activity code "${data.code}": typically ${data.avg_hours?.toFixed(1) || '?'} hours\n`;
          }
          break;
          
        case 'task_template':
          if (data.sample_title) {
            output += `- Task pattern (${data.type || 'general'}): "${data.sample_title.substring(0, 50)}"\n`;
          }
          break;
          
        case 'priority_usage':
          if (data.priority && data.task_type) {
            output += `- ${data.task_type} tasks: typically ${data.priority} priority\n`;
          }
          break;
          
        case 'scheduling_pattern':
          if (data.avg_days_ahead !== undefined) {
            output += `- ${data.priority || 'Medium'} priority tasks: schedule ${Math.round(data.avg_days_ahead)} days ahead\n`;
          }
          break;
          
        case 'event_template':
          if (data.type) {
            output += `- ${data.type} events: typically ${data.typical_duration_hours?.toFixed(1) || '1'} hours\n`;
          }
          break;
          
        case 'duration_pattern':
          if (data.event_type && data.avg_hours) {
            output += `- ${data.event_type}: average ${data.avg_hours.toFixed(1)} hours\n`;
          }
          break;
          
        case 'event_lead_time':
          if (data.event_type && data.avg_days_ahead !== undefined) {
            output += `- ${data.event_type}: schedule ${Math.round(data.avg_days_ahead)} days in advance\n`;
          }
          break;
          
        case 'document_naming':
          if (data.pattern) {
            output += `- Document naming (${data.category || 'general'}): ${data.pattern}\n`;
          }
          break;
          
        case 'document_type_usage':
          if (data.document_type) {
            output += `- Common document type: ${data.document_type} (.${data.extension || 'pdf'})\n`;
          }
          break;
          
        case 'matter_naming':
          if (data.pattern) {
            output += `- Matter naming (${data.matter_type || 'general'}): ${data.pattern}\n`;
          }
          break;
          
        case 'matter_rate':
          if (data.rate) {
            output += `- ${data.matter_type || 'Matter'} billing: $${data.rate}/hr (${data.billing_type || 'hourly'})\n`;
          }
          break;
          
        case 'note_pattern':
          if (data.type) {
            output += `- Notes style: ${data.type}${data.uses_bullets ? ', uses bullets' : ''}${data.uses_headers ? ', uses headers' : ''}\n`;
          }
          break;
          
        case 'billing_timing':
          if (data.day_of_week && data.time_slot) {
            output += `- Active: ${data.day_of_week} ${data.time_slot}\n`;
          }
          break;
          
        default:
          // Generic format for unknown types
          if (data.sample || data.pattern || data.format) {
            output += `- ${data.sample || data.pattern || data.format}\n`;
          } else if (typeof data === 'object') {
            const key = Object.keys(data).find(k => typeof data[k] === 'string');
            if (key) {
              output += `- ${key}: ${data[key]}\n`;
            }
          }
      }
    }
    output += '\n';
  }
  
  return output;
}

export default {
  PLATFORM_CONTEXT,
  getUserContext,
  getMatterContext,
  getLearningContext
};
