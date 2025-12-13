-- Migration: Seed default document templates
-- These are the 11 most commonly used legal document templates

-- Note: These templates will be added for ALL firms. Run once per database.
-- The templates use {{variable}} syntax for merge fields.

-- First, create a function to insert templates for all existing firms
DO $$
DECLARE
    firm_record RECORD;
BEGIN
    FOR firm_record IN SELECT id FROM firms
    LOOP
        -- 1. Engagement Letter
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Engagement Letter',
            'Standard attorney-client engagement letter outlining scope of representation, fees, and terms',
            'custom',
            'Client Intake',
            E'ENGAGEMENT LETTER\n\nDate: {{effective_date}}\n\n{{client_name}}\n{{client_address}}\n\nRe: Engagement for Legal Services - {{matter_description}}\n\nDear {{client_name}},\n\nThis letter confirms that you have retained our firm to represent you in connection with the above-referenced matter.\n\nSCOPE OF REPRESENTATION\n{{scope_of_work}}\n\nFEES AND BILLING\nOur fees will be charged at an hourly rate of ${{hourly_rate}}. A retainer of ${{retainer_amount}} is required to commence representation.\n\nPlease sign below to acknowledge your acceptance of these terms.\n\n_______________________\n{{client_name}}\nDate: _______________',
            '[{"id":"1","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"2","name":"client_address","label":"Client Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"matter_description","label":"Matter Description","type":"text","required":true,"aiAutoFill":false},{"id":"4","name":"scope_of_work","label":"Scope of Work","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"hourly_rate","label":"Hourly Rate ($)","type":"number","required":true,"defaultValue":"350","aiAutoFill":false},{"id":"6","name":"retainer_amount","label":"Retainer Amount ($)","type":"number","required":true,"defaultValue":"5000","aiAutoFill":false},{"id":"7","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 2. Demand Letter
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Demand Letter',
            'Pre-litigation demand letter for collection, personal injury, or breach of contract matters',
            'custom',
            'Litigation',
            E'DEMAND LETTER\n[SENT VIA CERTIFIED MAIL]\n\nDate: {{current_date}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Demand for Payment - {{client_name}}\n\nDear {{recipient_name}},\n\nPlease be advised that this firm represents {{client_name}} in connection with the matter described herein.\n\nOn {{incident_date}}, the following occurred:\n{{demand_reason}}\n\nDEMAND\nOur client hereby demands payment in the amount of ${{demand_amount}} no later than {{response_deadline}}.\n\nFailure to respond by the deadline will result in our client pursuing all available legal remedies without further notice.\n\nVery truly yours,\n[Attorney Name]',
            '[{"id":"1","name":"recipient_name","label":"Recipient Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"recipient_address","label":"Recipient Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"4","name":"incident_date","label":"Incident/Breach Date","type":"date","required":true,"aiAutoFill":false},{"id":"5","name":"demand_amount","label":"Demand Amount ($)","type":"number","required":true,"aiAutoFill":false},{"id":"6","name":"demand_reason","label":"Reason for Demand","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"response_deadline","label":"Response Deadline","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 3. Power of Attorney
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Power of Attorney',
            'General or limited power of attorney granting legal authority to act on behalf of another',
            'custom',
            'Estate Planning',
            E'{{poa_type}} POWER OF ATTORNEY\n\nKNOW ALL PERSONS BY THESE PRESENTS:\n\nI, {{principal_name}}, residing at {{principal_address}}, hereby appoint {{agent_name}}, residing at {{agent_address}}, as my true and lawful Attorney-in-Fact.\n\nPOWERS GRANTED:\n{{powers_granted}}\n\nThis Power of Attorney shall become effective on {{effective_date}}.\n\nIN WITNESS WHEREOF, I have executed this Power of Attorney on the date first written above.\n\n_______________________\n{{principal_name}}, Principal\n\nSTATE OF _______________\nCOUNTY OF ______________',
            '[{"id":"1","name":"principal_name","label":"Principal Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"principal_address","label":"Principal Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"agent_name","label":"Agent Name","type":"text","required":true,"aiAutoFill":false},{"id":"4","name":"agent_address","label":"Agent Address","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"poa_type","label":"Type of POA","type":"select","required":true,"options":["General","Limited","Durable","Springing"],"aiAutoFill":false},{"id":"6","name":"powers_granted","label":"Powers Granted","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 4. Non-Disclosure Agreement (NDA)
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Non-Disclosure Agreement (NDA)',
            'Mutual or unilateral NDA to protect confidential business information',
            'contract',
            'Business',
            E'{{nda_type}} NON-DISCLOSURE AGREEMENT\n\nThis Non-Disclosure Agreement ("Agreement") is entered into as of {{effective_date}} by and between:\n\nDisclosing Party: {{disclosing_party}}\nReceiving Party: {{receiving_party}}\n\nPURPOSE: {{purpose}}\n\nCONFIDENTIAL INFORMATION:\n{{confidential_info}}\n\nTERM: This Agreement shall remain in effect for {{term_years}} years from the Effective Date.\n\nGOVERNING LAW: This Agreement shall be governed by the laws of the State of {{governing_state}}.\n\nIN WITNESS WHEREOF, the parties have executed this Agreement.\n\n_______________________          _______________________\n{{disclosing_party}}              {{receiving_party}}',
            '[{"id":"1","name":"disclosing_party","label":"Disclosing Party","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"receiving_party","label":"Receiving Party","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"nda_type","label":"NDA Type","type":"select","required":true,"options":["Mutual","Unilateral"],"aiAutoFill":false},{"id":"4","name":"purpose","label":"Purpose of Disclosure","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"confidential_info","label":"Definition of Confidential Info","type":"text","required":true,"aiAutoFill":false},{"id":"6","name":"term_years","label":"Term (Years)","type":"number","required":true,"defaultValue":"3","aiAutoFill":false},{"id":"7","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false},{"id":"8","name":"governing_state","label":"Governing State","type":"text","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 5. Settlement Agreement
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Settlement Agreement',
            'Comprehensive settlement agreement to resolve disputes and claims between parties',
            'custom',
            'Litigation',
            E'SETTLEMENT AGREEMENT AND MUTUAL RELEASE\n\nThis Settlement Agreement ("Agreement") is entered into as of {{effective_date}}.\n\nPARTIES:\n{{party_a}} ("Party A")\n{{party_b}} ("Party B")\n\nRECITALS:\nThe parties are involved in a dispute concerning: {{dispute_description}}\n\nSETTLEMENT TERMS:\n1. Settlement Payment: Party A/B shall pay ${{settlement_amount}}\n2. Payment Terms: {{payment_terms}}\n\nRELEASE:\n{{release_scope}}\n\nCONFIDENTIALITY: This Agreement is {{confidentiality}}.\n\n_______________________          _______________________\n{{party_a}}                       {{party_b}}',
            '[{"id":"1","name":"party_a","label":"First Party Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"party_b","label":"Second Party Name","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"case_number","label":"Case Number (if applicable)","type":"text","required":false,"aiAutoFill":false},{"id":"4","name":"dispute_description","label":"Description of Dispute","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"settlement_amount","label":"Settlement Amount ($)","type":"number","required":true,"aiAutoFill":false},{"id":"6","name":"payment_terms","label":"Payment Terms","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"release_scope","label":"Scope of Release","type":"text","required":true,"aiAutoFill":false},{"id":"8","name":"confidentiality","label":"Confidentiality Provisions","type":"select","required":true,"options":["Confidential","Non-Confidential"],"aiAutoFill":false},{"id":"9","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 6. Contract Amendment
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Contract Amendment',
            'Amendment to modify existing contract terms and conditions',
            'contract',
            'Business',
            E'{{amendment_number}} AMENDMENT TO {{original_contract_name}}\n\nThis Amendment is made effective as of {{effective_date}}.\n\nPARTIES:\n{{party_a}}\n{{party_b}}\n\nRECITALS:\nThe parties entered into {{original_contract_name}} dated {{original_date}} (the "Original Agreement").\n\nAMENDMENTS:\nThe following sections are hereby amended:\n{{sections_amended}}\n\nNEW TERMS:\n{{new_terms}}\n\nAll other terms of the Original Agreement remain in full force and effect.\n\n_______________________          _______________________\n{{party_a}}                       {{party_b}}',
            '[{"id":"1","name":"original_contract_name","label":"Original Contract Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"original_date","label":"Original Contract Date","type":"date","required":true,"aiAutoFill":false},{"id":"3","name":"party_a","label":"First Party","type":"text","required":true,"aiAutoFill":false},{"id":"4","name":"party_b","label":"Second Party","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"amendment_number","label":"Amendment Number","type":"select","required":true,"options":["First","Second","Third","Fourth","Fifth"],"aiAutoFill":false},{"id":"6","name":"sections_amended","label":"Sections Being Amended","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"new_terms","label":"New Terms/Changes","type":"text","required":true,"aiAutoFill":false},{"id":"8","name":"effective_date","label":"Amendment Effective Date","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 7. Cease and Desist Letter
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Cease and Desist Letter',
            'Formal demand to stop unlawful activity such as infringement, harassment, or defamation',
            'letter',
            'Litigation',
            E'CEASE AND DESIST NOTICE\n[SENT VIA CERTIFIED MAIL]\n\nDate: {{current_date}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: {{violation_type}} - Cease and Desist\n\nDear {{recipient_name}},\n\nThis firm represents {{client_name}}. We write regarding your unlawful conduct as described below.\n\nVIOLATION:\n{{violation_description}}\n\nDEMANDS:\n{{demands}}\n\nYou are hereby demanded to cease and desist from the above-described conduct immediately, and in any event no later than {{compliance_deadline}}.\n\nFailure to comply will result in immediate legal action.\n\nVery truly yours,\n[Attorney Name]',
            '[{"id":"1","name":"recipient_name","label":"Recipient Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"recipient_address","label":"Recipient Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"4","name":"violation_type","label":"Type of Violation","type":"select","required":true,"options":["Trademark Infringement","Copyright Infringement","Defamation","Harassment","Breach of Contract","Other"],"aiAutoFill":false},{"id":"5","name":"violation_description","label":"Description of Violation","type":"text","required":true,"aiAutoFill":false},{"id":"6","name":"demands","label":"Specific Demands","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"compliance_deadline","label":"Compliance Deadline","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 8. Fee Agreement - Contingency
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Fee Agreement - Contingency',
            'Contingency fee agreement for personal injury and other contingency-based matters',
            'custom',
            'Client Intake',
            E'CONTINGENCY FEE AGREEMENT\n\nCLIENT: {{client_name}}\nADDRESS: {{client_address}}\n\nMATTER: {{matter_type}} - {{matter_description}}\n\nFEE STRUCTURE:\n- Pre-Trial Resolution: {{contingency_pretrial}}% of gross recovery\n- After Trial Commences: {{contingency_trial}}% of gross recovery\n- On Appeal: {{contingency_appeal}}% of gross recovery\n\nCOSTS AND EXPENSES:\n{{costs_handling}}\n\nBy signing below, Client acknowledges reading and understanding these terms.\n\n_______________________          Date: _______________\n{{client_name}}\n\n_______________________          Date: _______________\nAttorney',
            '[{"id":"1","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"2","name":"client_address","label":"Client Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"matter_type","label":"Type of Matter","type":"select","required":true,"options":["Personal Injury","Medical Malpractice","Employment","Products Liability","Other"],"aiAutoFill":false},{"id":"4","name":"matter_description","label":"Matter Description","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"contingency_pretrial","label":"Contingency % (Pre-Trial)","type":"number","required":true,"defaultValue":"33","aiAutoFill":false},{"id":"6","name":"contingency_trial","label":"Contingency % (After Trial Begins)","type":"number","required":true,"defaultValue":"40","aiAutoFill":false},{"id":"7","name":"contingency_appeal","label":"Contingency % (On Appeal)","type":"number","required":true,"defaultValue":"45","aiAutoFill":false},{"id":"8","name":"costs_handling","label":"Costs Handling","type":"select","required":true,"options":["Client pays as incurred","Advanced by firm, deducted from recovery","Advanced by firm, repaid only if recovery"],"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 9. Promissory Note
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Promissory Note',
            'Legal promise to pay a specified sum of money with defined terms',
            'contract',
            'Business',
            E'PROMISSORY NOTE\n\nPrincipal Amount: ${{principal_amount}}\nDate: {{effective_date}}\n\nFOR VALUE RECEIVED, {{borrower_name}} ("Borrower"), residing at {{borrower_address}}, promises to pay to {{lender_name}} ("Lender") the principal sum of ${{principal_amount}}, together with interest at {{interest_rate}}% per annum.\n\nPAYMENT TERMS:\nSchedule: {{payment_schedule}}\nMaturity Date: {{maturity_date}}\n\nCOLLATERAL:\n{{collateral}}\n\n_______________________          Date: _______________\n{{borrower_name}}, Borrower',
            '[{"id":"1","name":"borrower_name","label":"Borrower Name","type":"text","required":true,"aiAutoFill":false},{"id":"2","name":"borrower_address","label":"Borrower Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"lender_name","label":"Lender Name","type":"text","required":true,"aiAutoFill":false},{"id":"4","name":"principal_amount","label":"Principal Amount ($)","type":"number","required":true,"aiAutoFill":false},{"id":"5","name":"interest_rate","label":"Interest Rate (%)","type":"number","required":true,"aiAutoFill":false},{"id":"6","name":"payment_schedule","label":"Payment Schedule","type":"select","required":true,"options":["Monthly","Quarterly","Semi-Annually","Annually","Lump Sum at Maturity"],"aiAutoFill":false},{"id":"7","name":"maturity_date","label":"Maturity Date","type":"date","required":true,"aiAutoFill":false},{"id":"8","name":"collateral","label":"Collateral (if any)","type":"text","required":false,"aiAutoFill":false},{"id":"9","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 10. Client Termination Letter
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Client Termination Letter',
            'Professional letter terminating attorney-client relationship with required notices',
            'letter',
            'Client Intake',
            E'TERMINATION OF REPRESENTATION\n\nDate: {{current_date}}\n\n{{client_name}}\n{{client_address}}\n\nRe: Termination of Representation - {{matter_name}}\n\nDear {{client_name}},\n\nThis letter confirms that our firm''s representation of you in the above matter will terminate effective {{termination_date}}.\n\nREASON: {{termination_reason}}\n\nIMPORTANT NOTICES:\nPending Deadlines: {{pending_deadlines}}\nStatute of Limitations: {{statute_limitations}}\n\nYOUR FILE:\n{{file_retrieval}}\n\nWe wish you the best in your future endeavors.\n\nSincerely,\n[Attorney Name]',
            '[{"id":"1","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"2","name":"client_address","label":"Client Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"matter_name","label":"Matter Name","type":"matter","required":true,"aiAutoFill":false},{"id":"4","name":"termination_reason","label":"Reason for Termination","type":"select","required":true,"options":["Completion of Matter","Client Request","Non-Payment","Conflict of Interest","Breakdown in Communication","Other"],"aiAutoFill":false},{"id":"5","name":"termination_date","label":"Termination Effective Date","type":"date","required":true,"aiAutoFill":false},{"id":"6","name":"pending_deadlines","label":"Pending Deadlines/Actions","type":"text","required":false,"aiAutoFill":false},{"id":"7","name":"statute_limitations","label":"Statute of Limitations Warnings","type":"text","required":false,"aiAutoFill":false},{"id":"8","name":"file_retrieval","label":"File Retrieval Instructions","type":"text","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

        -- 11. Retainer Agreement
        INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, is_active, usage_count)
        VALUES (
            firm_record.id,
            'Retainer Agreement',
            'Comprehensive retainer agreement establishing ongoing legal representation with payment terms and conditions',
            'contract',
            'Client Intake',
            E'RETAINER AGREEMENT FOR LEGAL SERVICES\n\nThis Retainer Agreement ("Agreement") is entered into as of {{effective_date}} by and between:\n\nATTORNEY/LAW FIRM:\n[Law Firm Name]\n[Firm Address]\nResponsible Attorney: {{responsible_attorney}}\nBar Number: {{attorney_bar_number}}\n\nCLIENT:\n{{client_name}}\n{{client_address}}\nEmail: {{client_email}}\nPhone: {{client_phone}}\n\n1. ENGAGEMENT AND SCOPE OF SERVICES\n\nThe Client hereby retains the Law Firm to provide legal services in connection with:\n\nMatter Type: {{matter_type}}\n\nScope of Services:\n{{scope_of_services}}\n\n2. RETAINER AND FEES\n\nA. Initial Retainer: ${{retainer_amount}}\nB. Minimum Balance: ${{minimum_balance}}\n\nC. Hourly Rates:\n- Partners: ${{hourly_rate_partner}}/hour\n- Associates: ${{hourly_rate_associate}}/hour\n- Paralegals: ${{hourly_rate_paralegal}}/hour\n\nD. Billing: {{billing_frequency}}, due within {{payment_due_days}} days\n\n11. GOVERNING LAW\n\nThis Agreement shall be governed by the laws of the State of {{governing_state}}.\n\nCLIENT:\n\n_________________________________          Date: _______________\n{{client_name}}\n\nATTORNEY/LAW FIRM:\n\n_________________________________          Date: _______________\n{{responsible_attorney}}\nBar Number: {{attorney_bar_number}}',
            '[{"id":"1","name":"client_name","label":"Client Name","type":"client","required":true,"aiAutoFill":false},{"id":"2","name":"client_address","label":"Client Address","type":"text","required":true,"aiAutoFill":false},{"id":"3","name":"client_email","label":"Client Email","type":"text","required":true,"aiAutoFill":false},{"id":"4","name":"client_phone","label":"Client Phone","type":"text","required":true,"aiAutoFill":false},{"id":"5","name":"matter_type","label":"Type of Legal Matter","type":"select","required":true,"options":["General Business Counsel","Litigation","Corporate Transactions","Employment Matters","Real Estate","Intellectual Property","Estate Planning","Family Law","Criminal Defense","Other"],"aiAutoFill":false},{"id":"6","name":"scope_of_services","label":"Scope of Legal Services","type":"text","required":true,"aiAutoFill":false},{"id":"7","name":"retainer_amount","label":"Initial Retainer Amount ($)","type":"number","required":true,"defaultValue":"5000","aiAutoFill":false},{"id":"8","name":"minimum_balance","label":"Minimum Retainer Balance ($)","type":"number","required":true,"defaultValue":"2500","aiAutoFill":false},{"id":"9","name":"hourly_rate_partner","label":"Partner Hourly Rate ($)","type":"number","required":true,"defaultValue":"450","aiAutoFill":false},{"id":"10","name":"hourly_rate_associate","label":"Associate Hourly Rate ($)","type":"number","required":true,"defaultValue":"300","aiAutoFill":false},{"id":"11","name":"hourly_rate_paralegal","label":"Paralegal Hourly Rate ($)","type":"number","required":true,"defaultValue":"150","aiAutoFill":false},{"id":"12","name":"billing_frequency","label":"Billing Frequency","type":"select","required":true,"options":["Monthly","Bi-Weekly","Quarterly"],"aiAutoFill":false},{"id":"13","name":"payment_due_days","label":"Payment Due (Days)","type":"number","required":true,"defaultValue":"30","aiAutoFill":false},{"id":"14","name":"responsible_attorney","label":"Responsible Attorney","type":"text","required":true,"aiAutoFill":false},{"id":"15","name":"attorney_bar_number","label":"Attorney Bar Number","type":"text","required":true,"aiAutoFill":false},{"id":"16","name":"effective_date","label":"Effective Date","type":"date","required":true,"aiAutoFill":false},{"id":"17","name":"governing_state","label":"Governing State","type":"text","required":true,"aiAutoFill":false}]'::jsonb,
            false,
            true,
            0
        ) ON CONFLICT DO NOTHING;

    END LOOP;
END $$;

-- Add comments
COMMENT ON TABLE document_templates IS 'Contains document templates including 11 pre-built legal templates for each firm';
