"""
Legal Knowledge Base Module

This module provides the agent with comprehensive legal domain knowledge:
- Practice area templates and checklists
- Common legal procedures and workflows
- Jurisdiction-specific rules
- Deadline calculations
- Document requirements
- Best practices for legal work

The agent uses this knowledge to act more like an experienced lawyer.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# =============================================================================
# PRACTICE AREA KNOWLEDGE
# =============================================================================

LITIGATION_KNOWLEDGE = {
    "name": "Litigation",
    "description": "Civil and commercial litigation matters",
    "typical_workflow": [
        "Initial case assessment and intake",
        "Conflict check for all parties",
        "Preserve and collect relevant documents",
        "Identify and calendar critical deadlines (SOL, court dates)",
        "Draft initial pleadings or responsive pleading",
        "Develop case strategy and litigation plan",
        "Conduct discovery (interrogatories, document requests, depositions)",
        "Motion practice as needed",
        "Settlement evaluation and negotiation",
        "Trial preparation",
        "Post-trial matters"
    ],
    "key_deadlines": {
        "statute_of_limitations": "CRITICAL - varies by claim type, typically 1-6 years",
        "answer_deadline": "Typically 20-30 days from service of complaint",
        "discovery_deadline": "Set by court, typically 6-12 months from case management order",
        "motion_deadlines": "Per local rules, typically 21-28 days for response",
        "pretrial_deadlines": "Per court scheduling order"
    },
    "common_documents": [
        "Complaint / Petition",
        "Answer and Affirmative Defenses",
        "Motions (Dismiss, Summary Judgment, etc.)",
        "Discovery requests and responses",
        "Deposition notices and transcripts",
        "Expert reports",
        "Pretrial memoranda",
        "Trial briefs"
    ],
    "intake_checklist": [
        "☐ Identify all parties (plaintiff, defendant, third parties)",
        "☐ Run conflict check for ALL parties",
        "☐ Determine applicable statute of limitations",
        "☐ Identify court/jurisdiction/venue",
        "☐ Assess case merits and damages",
        "☐ Evaluate insurance coverage",
        "☐ Determine fee arrangement (hourly, contingency, etc.)",
        "☐ Send engagement letter",
        "☐ Establish document preservation hold",
        "☐ Calendar all known deadlines"
    ],
    "best_practices": [
        "Always calendar deadlines with at least 7-day advance reminder",
        "Create litigation hold memo immediately upon engagement",
        "Document all client communications",
        "Review all discovery responses before sending",
        "Keep detailed time records for each task"
    ]
}

CONTRACT_KNOWLEDGE = {
    "name": "Contract Law",
    "description": "Contract drafting, review, and negotiation",
    "typical_workflow": [
        "Understand client's business objectives",
        "Identify key deal terms and concerns",
        "Draft or review contract",
        "Flag issues and risks for client",
        "Negotiate with counterparty",
        "Finalize and execute agreement",
        "Create summary of key terms"
    ],
    "key_provisions": [
        "Parties and recitals",
        "Definitions",
        "Scope of agreement / Services / Products",
        "Payment terms",
        "Term and termination",
        "Representations and warranties",
        "Indemnification",
        "Limitation of liability",
        "Confidentiality / NDA provisions",
        "IP ownership and licensing",
        "Dispute resolution (arbitration, litigation, jurisdiction)",
        "Governing law",
        "Force majeure",
        "Assignment",
        "Notices",
        "Entire agreement / Amendment"
    ],
    "common_documents": [
        "Master Service Agreement (MSA)",
        "Statement of Work (SOW)",
        "Non-Disclosure Agreement (NDA)",
        "Employment Agreement",
        "Independent Contractor Agreement",
        "License Agreement",
        "Purchase Agreement",
        "Lease Agreement"
    ],
    "review_checklist": [
        "☐ Verify correct parties and entity types",
        "☐ Check all defined terms are used consistently",
        "☐ Review payment terms and amounts",
        "☐ Assess liability caps and exclusions",
        "☐ Review termination rights",
        "☐ Check IP provisions",
        "☐ Verify confidentiality scope",
        "☐ Review dispute resolution provisions",
        "☐ Check for auto-renewal terms",
        "☐ Verify signature authority"
    ],
    "best_practices": [
        "Use client's preferred templates when available",
        "Track all versions with version control",
        "Create redline for each round of negotiations",
        "Maintain summary of negotiated changes",
        "Calendar any contract milestone dates (renewals, options)"
    ]
}

REAL_ESTATE_KNOWLEDGE = {
    "name": "Real Estate",
    "description": "Real estate transactions and matters",
    "typical_workflow": [
        "Review deal terms and letter of intent",
        "Draft or review purchase/lease agreement",
        "Conduct due diligence (title, survey, environmental, zoning)",
        "Negotiate agreement and resolve issues",
        "Coordinate with lender if financing involved",
        "Prepare closing documents",
        "Conduct closing",
        "Post-closing matters (recording, escrow release)"
    ],
    "due_diligence_items": [
        "Title search and title insurance commitment",
        "Survey review",
        "Environmental assessment (Phase I, Phase II if needed)",
        "Zoning compliance and permits",
        "Lease review (for income properties)",
        "Financial statements and rent rolls",
        "Physical inspection",
        "HOA/condo documents review",
        "Tax status and assessment"
    ],
    "common_documents": [
        "Letter of Intent (LOI)",
        "Purchase and Sale Agreement (PSA)",
        "Commercial Lease",
        "Amendment to lease",
        "Deed (Warranty, Quitclaim, etc.)",
        "Title insurance policy",
        "Closing statement (HUD-1, settlement statement)",
        "Mortgage/Deed of Trust",
        "Assignment of lease",
        "Estoppel certificate"
    ],
    "best_practices": [
        "Calendar all due diligence deadlines",
        "Track all contingencies and their expiration",
        "Coordinate early with title company and lender",
        "Review title commitment as soon as received",
        "Create closing checklist and track status"
    ]
}

EMPLOYMENT_KNOWLEDGE = {
    "name": "Employment Law",
    "description": "Employment matters for employers and employees",
    "typical_workflow": [
        "Understand nature of employment issue",
        "Review relevant documents (handbook, agreements, communications)",
        "Research applicable laws (federal, state, local)",
        "Assess merits and exposure",
        "Advise on strategy and options",
        "Draft necessary documents or responses",
        "Negotiate if applicable"
    ],
    "employer_matters": [
        "Employee handbook drafting/review",
        "Employment agreement drafting",
        "Non-compete and NDA agreements",
        "Wage and hour compliance",
        "Discrimination and harassment prevention",
        "Termination procedures",
        "FMLA/leave compliance",
        "Employee classification (W-2 vs 1099)",
        "Immigration compliance (I-9)"
    ],
    "employee_matters": [
        "Wrongful termination claims",
        "Discrimination claims (Title VII, ADA, ADEA)",
        "Harassment claims",
        "Wage and hour claims",
        "Severance negotiation",
        "Non-compete disputes",
        "Whistleblower claims"
    ],
    "key_deadlines": {
        "eeoc_charge": "300 days from discriminatory act (180 days in some states)",
        "title_vii_lawsuit": "90 days from EEOC right-to-sue letter",
        "flsa_claim": "2 years (3 years for willful violations)",
        "state_claims": "Varies by state - typically 1-3 years"
    },
    "best_practices": [
        "Document all employment decisions thoroughly",
        "Preserve all relevant communications",
        "Calendar EEOC and state agency deadlines carefully",
        "Review company policies before advising",
        "Consider settlement early if exposure is significant"
    ]
}

BANKRUPTCY_KNOWLEDGE = {
    "name": "Bankruptcy",
    "description": "Bankruptcy and creditor rights matters",
    "typical_workflow": [
        "Initial assessment of financial situation",
        "Determine appropriate chapter (7, 11, 13)",
        "Prepare schedules and statement of financial affairs",
        "File petition and schedules",
        "Attend 341 meeting",
        "Navigate chapter-specific process",
        "Complete discharge/confirmation"
    ],
    "chapter_comparison": {
        "chapter_7": "Liquidation - Quick discharge, trustee liquidates non-exempt assets",
        "chapter_11": "Reorganization - Business continues, plan of reorganization",
        "chapter_13": "Wage earner plan - Individual repayment plan over 3-5 years"
    },
    "key_deadlines": {
        "automatic_stay": "Effective immediately upon filing",
        "341_meeting": "21-40 days after filing",
        "objection_to_discharge": "60 days after 341 meeting",
        "proof_of_claim": "90 days after 341 meeting (most cases)",
        "plan_confirmation": "Varies by chapter"
    },
    "common_documents": [
        "Voluntary Petition",
        "Schedules A-J",
        "Statement of Financial Affairs",
        "Means Test (Chapter 7)",
        "Plan (Chapter 11 or 13)",
        "Proof of Claim",
        "Reaffirmation Agreement",
        "Discharge Order"
    ],
    "best_practices": [
        "Calendar all court deadlines immediately",
        "Verify exempt property calculations carefully",
        "Review preference period transactions",
        "Ensure all assets are properly disclosed",
        "Monitor automatic stay for violations"
    ]
}

IP_KNOWLEDGE = {
    "name": "Intellectual Property",
    "description": "Patents, trademarks, copyrights, and trade secrets",
    "practice_areas": {
        "patents": {
            "types": ["Utility patents", "Design patents", "Plant patents"],
            "term": "20 years from filing (utility/plant), 15 years from grant (design)",
            "key_steps": [
                "Prior art search",
                "Patent application drafting",
                "USPTO prosecution",
                "Maintenance fees"
            ]
        },
        "trademarks": {
            "types": ["Word marks", "Design marks", "Service marks"],
            "term": "Indefinite with renewals",
            "key_steps": [
                "Clearance search",
                "Application filing (ITU or actual use)",
                "USPTO examination",
                "Registration and maintenance"
            ]
        },
        "copyrights": {
            "protection": "Original works of authorship fixed in tangible medium",
            "term": "Life of author plus 70 years (generally)",
            "registration": "Not required but provides significant benefits for enforcement"
        },
        "trade_secrets": {
            "protection": "Valuable business information kept secret",
            "requirements": [
                "Information must be secret",
                "Must have economic value from secrecy",
                "Reasonable measures to maintain secrecy"
            ]
        }
    },
    "key_deadlines": {
        "patent_bar_dates": "1 year from public disclosure, sale, or offer for sale",
        "trademark_response": "6 months from office action",
        "copyright_registration": "3 months from publication for full statutory damages",
        "maintenance_fees": "3.5, 7.5, and 11.5 years after patent grant"
    },
    "best_practices": [
        "Conduct clearance searches before adopting marks",
        "Document invention dates and development",
        "Implement confidentiality measures for trade secrets",
        "Calendar all maintenance and renewal deadlines",
        "Register copyrights for important works"
    ]
}


# =============================================================================
# COMBINED KNOWLEDGE BASE
# =============================================================================

PRACTICE_AREAS = {
    "litigation": LITIGATION_KNOWLEDGE,
    "contract": CONTRACT_KNOWLEDGE,
    "real_estate": REAL_ESTATE_KNOWLEDGE,
    "employment": EMPLOYMENT_KNOWLEDGE,
    "bankruptcy": BANKRUPTCY_KNOWLEDGE,
    "ip": IP_KNOWLEDGE,
    "intellectual_property": IP_KNOWLEDGE,
}


# =============================================================================
# COMMON LEGAL PROCEDURES
# =============================================================================

COMMON_PROCEDURES = {
    "conflict_check": {
        "name": "Conflict of Interest Check",
        "description": "Verify no conflicts exist before accepting a new matter",
        "steps": [
            "1. Identify ALL parties to the matter (clients, adverse parties, witnesses, etc.)",
            "2. Search firm's conflict database for each party name",
            "3. Search for related entities and affiliates",
            "4. Review any potential conflicts with supervising attorney",
            "5. Document conflict check results",
            "6. If conflict exists, determine if waivable and obtain proper waivers"
        ],
        "parties_to_check": [
            "Client and all related entities",
            "Opposing parties",
            "Witnesses",
            "Co-parties",
            "Insurers",
            "Other interested parties"
        ]
    },
    "matter_intake": {
        "name": "New Matter Intake",
        "description": "Properly open and set up a new matter",
        "steps": [
            "1. Complete conflict check",
            "2. Verify client identity and authority",
            "3. Determine fee arrangement (hourly, contingency, flat)",
            "4. Draft and send engagement letter",
            "5. Obtain signed engagement letter",
            "6. Open matter in practice management system",
            "7. Set up matter folders and document structure",
            "8. Calendar all known deadlines",
            "9. Assign responsible attorney and team",
            "10. Create initial task list"
        ]
    },
    "deadline_calculation": {
        "name": "Deadline Calculation",
        "description": "Properly calculate legal deadlines",
        "rules": [
            "Count from the day AFTER the triggering event (usually)",
            "If deadline falls on weekend/holiday, generally extends to next business day",
            "Court-specific rules may differ - always check local rules",
            "Federal courts: FRCP Rule 6(a) governs computation",
            "Add 3 days for mailing (Rule 6(d))",
            "Electronic service may have different calculation"
        ],
        "common_mistakes": [
            "Not accounting for court holidays",
            "Forgetting the 3-day mailing rule",
            "Using calendar days vs. business days incorrectly",
            "Not checking local rules for variations"
        ]
    },
    "document_review": {
        "name": "Document Review Process",
        "description": "Systematic review of documents in a matter",
        "steps": [
            "1. Organize documents by type/source",
            "2. Create review protocol and coding scheme",
            "3. Review for relevance",
            "4. Review for privilege",
            "5. Review for confidentiality/sensitivity",
            "6. Code and categorize documents",
            "7. Create privilege log for withheld documents",
            "8. Prepare production set"
        ]
    }
}


# =============================================================================
# LEGAL KNOWLEDGE CLASS
# =============================================================================

class LegalKnowledgeBase:
    """
    Provides the agent with comprehensive legal domain knowledge.
    
    This class helps the agent act more like an experienced lawyer by
    providing templates, checklists, procedures, and best practices.
    """
    
    def __init__(self):
        self.practice_areas = PRACTICE_AREAS
        self.procedures = COMMON_PROCEDURES
    
    def get_practice_area_knowledge(self, practice_area: str) -> Optional[Dict[str, Any]]:
        """
        Get knowledge for a specific practice area.
        
        Args:
            practice_area: Name of practice area (e.g., "litigation", "contract")
            
        Returns:
            Knowledge dictionary or None if not found
        """
        # Normalize input
        key = practice_area.lower().replace(" ", "_")
        return self.practice_areas.get(key)
    
    def get_practice_area_checklist(self, practice_area: str, checklist_type: str = "intake") -> List[str]:
        """
        Get a checklist for a practice area.
        
        Args:
            practice_area: Name of practice area
            checklist_type: Type of checklist (e.g., "intake", "review")
            
        Returns:
            List of checklist items
        """
        knowledge = self.get_practice_area_knowledge(practice_area)
        if not knowledge:
            return []
        
        checklist_key = f"{checklist_type}_checklist"
        return knowledge.get(checklist_key, [])
    
    def get_typical_workflow(self, practice_area: str) -> List[str]:
        """
        Get the typical workflow for a practice area.
        """
        knowledge = self.get_practice_area_knowledge(practice_area)
        if not knowledge:
            return []
        return knowledge.get("typical_workflow", [])
    
    def get_key_deadlines(self, practice_area: str) -> Dict[str, str]:
        """
        Get key deadlines for a practice area.
        """
        knowledge = self.get_practice_area_knowledge(practice_area)
        if not knowledge:
            return {}
        return knowledge.get("key_deadlines", {})
    
    def get_common_documents(self, practice_area: str) -> List[str]:
        """
        Get common documents for a practice area.
        """
        knowledge = self.get_practice_area_knowledge(practice_area)
        if not knowledge:
            return []
        return knowledge.get("common_documents", [])
    
    def get_best_practices(self, practice_area: str) -> List[str]:
        """
        Get best practices for a practice area.
        """
        knowledge = self.get_practice_area_knowledge(practice_area)
        if not knowledge:
            return []
        return knowledge.get("best_practices", [])
    
    def get_procedure(self, procedure_name: str) -> Optional[Dict[str, Any]]:
        """
        Get a common legal procedure.
        
        Args:
            procedure_name: Name of procedure (e.g., "conflict_check", "matter_intake")
            
        Returns:
            Procedure dictionary or None
        """
        key = procedure_name.lower().replace(" ", "_")
        return self.procedures.get(key)
    
    def get_procedure_steps(self, procedure_name: str) -> List[str]:
        """
        Get steps for a common legal procedure.
        """
        procedure = self.get_procedure(procedure_name)
        if not procedure:
            return []
        return procedure.get("steps", [])
    
    def infer_practice_area(self, matter_description: str) -> Optional[str]:
        """
        Infer the practice area from a matter description.
        
        Args:
            matter_description: Description of the matter
            
        Returns:
            Inferred practice area name or None
        """
        desc_lower = matter_description.lower()
        
        keywords = {
            "litigation": ["lawsuit", "litigation", "court", "complaint", "defendant", "plaintiff", "motion", "discovery", "deposition", "trial"],
            "contract": ["contract", "agreement", "negotiate", "draft agreement", "terms", "nda", "msa"],
            "real_estate": ["real estate", "property", "lease", "landlord", "tenant", "purchase", "closing", "title"],
            "employment": ["employment", "employee", "employer", "termination", "discrimination", "harassment", "wage", "flsa", "handbook"],
            "bankruptcy": ["bankruptcy", "chapter 7", "chapter 11", "chapter 13", "creditor", "debtor", "discharge", "insolvency"],
            "ip": ["patent", "trademark", "copyright", "trade secret", "infringement", "intellectual property", "ip"]
        }
        
        for area, kws in keywords.items():
            if any(kw in desc_lower for kw in kws):
                return area
        
        return None
    
    def get_relevant_knowledge_for_task(self, task_description: str) -> Dict[str, Any]:
        """
        Get all relevant knowledge for a task.
        
        Combines practice area knowledge, procedures, and best practices
        relevant to the task description.
        """
        result = {
            "practice_area": None,
            "workflow": [],
            "checklist": [],
            "deadlines": {},
            "best_practices": [],
            "relevant_procedures": []
        }
        
        # Infer practice area
        practice_area = self.infer_practice_area(task_description)
        if practice_area:
            result["practice_area"] = practice_area
            result["workflow"] = self.get_typical_workflow(practice_area)
            result["checklist"] = self.get_practice_area_checklist(practice_area, "intake")
            result["deadlines"] = self.get_key_deadlines(practice_area)
            result["best_practices"] = self.get_best_practices(practice_area)
        
        # Check for relevant procedures
        task_lower = task_description.lower()
        if any(word in task_lower for word in ["conflict", "check"]):
            result["relevant_procedures"].append(self.get_procedure("conflict_check"))
        if any(word in task_lower for word in ["intake", "new matter", "open matter"]):
            result["relevant_procedures"].append(self.get_procedure("matter_intake"))
        if any(word in task_lower for word in ["deadline", "calendar", "due"]):
            result["relevant_procedures"].append(self.get_procedure("deadline_calculation"))
        if any(word in task_lower for word in ["document", "review", "production"]):
            result["relevant_procedures"].append(self.get_procedure("document_review"))
        
        return result
    
    def format_knowledge_for_prompt(self, task_description: str) -> str:
        """
        Format relevant knowledge as compact text for the system prompt.
        
        Kept concise to minimize context window usage. Only includes
        the most relevant sections for the detected practice area.
        Also points the agent to REAL information sources via tools.
        """
        knowledge = self.get_relevant_knowledge_for_task(task_description)
        
        lines = []
        
        if knowledge["practice_area"]:
            area_info = self.get_practice_area_knowledge(knowledge["practice_area"])
            lines.append(f"## {area_info['name'].upper()}")
        
        # Compact workflow - just the steps, no extra formatting
        if knowledge["workflow"]:
            lines.append("Workflow: " + " → ".join(knowledge["workflow"][:6]))
        
        # Key deadlines only
        if knowledge["deadlines"]:
            lines.append("Key deadlines:")
            for name, desc in list(knowledge["deadlines"].items())[:3]:
                lines.append(f"- {name.replace('_', ' ').title()}: {desc}")
        
        # Real information sources available via tools
        lines.append("")
        lines.append("## REAL INFORMATION SOURCES (use these tools)")
        lines.append("- `lookup_cplr`: NY CPLR statute text, deadlines, and practice guidance")
        lines.append("- `calculate_cplr_deadline`: Calculate NY deadlines with court rules")
        lines.append("- `calculate_deadline`: Calculate deadlines (business/court/calendar days)")
        lines.append("- `search_semantic`: Search firm's actual document library by meaning")
        lines.append("- `find_precedent`: Find precedent in firm's real documents")
        lines.append("- `search_document_content`: Full-text search across all firm documents")
        lines.append("- `read_document_content`: Read actual text from any firm document")
        lines.append("- `check_conflicts`: Real conflict check against firm's client/matter database")
        lines.append("- `get_matter`: Get real matter details, documents, tasks, billing from database")
        lines.append("ALWAYS prefer these real tools over general knowledge. Cite what the tools return.")
        
        return "\n".join(lines) if lines else ""


# =============================================================================
# TOOL DEFINITIONS FOR AGENT ACCESS
# =============================================================================

LEGAL_KNOWLEDGE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_practice_area_knowledge",
            "description": "Get comprehensive knowledge about a legal practice area including workflows, checklists, and best practices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "practice_area": {
                        "type": "string",
                        "enum": ["litigation", "contract", "real_estate", "employment", "bankruptcy", "ip"],
                        "description": "The practice area to get knowledge for"
                    }
                },
                "required": ["practice_area"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_legal_procedure",
            "description": "Get steps for a common legal procedure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "procedure_name": {
                        "type": "string",
                        "enum": ["conflict_check", "matter_intake", "deadline_calculation", "document_review"],
                        "description": "The procedure to get"
                    }
                },
                "required": ["procedure_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_intake_checklist",
            "description": "Get the intake checklist for a practice area - use this when opening a new matter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "practice_area": {
                        "type": "string",
                        "description": "The practice area"
                    }
                },
                "required": ["practice_area"]
            }
        }
    }
]


def execute_legal_knowledge_tool(
    tool_name: str,
    args: Dict[str, Any],
    knowledge_base: LegalKnowledgeBase
) -> Dict[str, Any]:
    """Execute a legal knowledge tool"""
    if tool_name == "get_practice_area_knowledge":
        knowledge = knowledge_base.get_practice_area_knowledge(args.get("practice_area", ""))
        if knowledge:
            return {"success": True, "knowledge": knowledge}
        return {"success": False, "error": "Practice area not found"}
    
    elif tool_name == "get_legal_procedure":
        procedure = knowledge_base.get_procedure(args.get("procedure_name", ""))
        if procedure:
            return {"success": True, "procedure": procedure}
        return {"success": False, "error": "Procedure not found"}
    
    elif tool_name == "get_intake_checklist":
        checklist = knowledge_base.get_practice_area_checklist(
            args.get("practice_area", ""),
            "intake"
        )
        return {"success": True, "checklist": checklist}
    
    return {"success": False, "error": f"Unknown tool: {tool_name}"}


# Singleton instance
_knowledge_base_instance = None

def get_legal_knowledge_base() -> LegalKnowledgeBase:
    """Get the singleton legal knowledge base instance"""
    global _knowledge_base_instance
    if _knowledge_base_instance is None:
        _knowledge_base_instance = LegalKnowledgeBase()
    return _knowledge_base_instance
