/**
 * ESG Compliance Report Generator
 * Restaurant Industry — Regulatory Compliance Auditor Tool
 */

// Required fields configuration
const REQUIRED_FIELDS = {
  entity: ['business-name', 'ein', 'entity-type', 'address', 'jurisdiction', 'report-period', 'locations'],
  environmental: ['electricity-kwh', 'natural-gas', 'water-gallons', 'waste-solid'],
  social: ['total-employees', 'full-time', 'part-time', 'min-wage-compliance', 'food-handler-cert', 'osha-incidents'],
  governance: ['business-license', 'food-service-permit', 'health-permit', 'health-inspection-score', 'health-inspection-date', 'liability-insurance', 'workers-comp-insurance']
};

// State management
const state = {
  data: {},
  completion: {
    entity: 0,
    environmental: 0,
    social: 0,
    governance: 0
  }
};

// DOM Elements
const elements = {
  navItems: document.querySelectorAll('.nav-item'),
  panels: document.querySelectorAll('.panel'),
  completionFill: document.getElementById('completion-fill'),
  completionPercent: document.getElementById('completion-percent'),
  btnClear: document.getElementById('btn-clear'),
  btnExport: document.getElementById('btn-export'),
  btnGenerate: document.getElementById('btn-generate'),
  reportOutput: document.getElementById('report-output'),
  validationGrid: document.getElementById('validation-grid'),
  currentDate: document.getElementById('current-date')
};

// Initialize
function init() {
  setupNavigation();
  setupFormListeners();
  setupButtons();
  setCurrentDate();
  updateValidationSummary();
  loadSavedData();
}

// Navigation
function setupNavigation() {
  elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      
      // Update nav
      elements.navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update panels
      elements.panels.forEach(panel => panel.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');
    });
  });
}

// Form Listeners
function setupFormListeners() {
  const inputs = document.querySelectorAll('input, select');
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      saveFieldData(input);
      calculateCompletion();
      updateValidationSummary();
    });
    input.addEventListener('input', () => {
      if (input.tagName === 'INPUT') {
        saveFieldData(input);
        calculateCompletion();
      }
    });
  });
}

// Save field data
function saveFieldData(input) {
  state.data[input.id] = input.value;
  localStorage.setItem('esg-data', JSON.stringify(state.data));
}

// Load saved data
function loadSavedData() {
  const saved = localStorage.getItem('esg-data');
  if (saved) {
    state.data = JSON.parse(saved);
    Object.entries(state.data).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value;
      }
    });
    calculateCompletion();
    updateValidationSummary();
  }
}

// Calculate completion percentage
function calculateCompletion() {
  let totalRequired = 0;
  let totalFilled = 0;

  Object.entries(REQUIRED_FIELDS).forEach(([section, fields]) => {
    let sectionFilled = 0;
    fields.forEach(fieldId => {
      totalRequired++;
      const element = document.getElementById(fieldId);
      if (element && element.value && element.value.trim() !== '') {
        totalFilled++;
        sectionFilled++;
      }
    });
    state.completion[section] = Math.round((sectionFilled / fields.length) * 100);
    
    // Update section status
    const statusEl = document.getElementById(`status-${section}`);
    if (statusEl) {
      if (state.completion[section] === 100) {
        statusEl.textContent = 'Complete';
        statusEl.className = 'panel-status complete';
      } else if (state.completion[section] > 0) {
        statusEl.textContent = `${state.completion[section]}%`;
        statusEl.className = 'panel-status partial';
      } else {
        statusEl.textContent = 'Incomplete';
        statusEl.className = 'panel-status';
      }
    }
    
    // Update nav indicator
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navItem) {
      const icon = navItem.querySelector('.nav-icon');
      if (state.completion[section] === 100) {
        icon.textContent = '✓';
        icon.style.color = 'var(--color-success)';
      } else if (state.completion[section] > 0) {
        icon.textContent = '●';
        icon.style.color = 'var(--color-warning)';
      } else {
        icon.textContent = '●';
        icon.style.color = 'var(--color-muted)';
      }
    }
  });

  const overallPercent = Math.round((totalFilled / totalRequired) * 100);
  elements.completionFill.style.width = `${overallPercent}%`;
  elements.completionPercent.textContent = `${overallPercent}%`;
  
  // Enable/disable generate button
  const allComplete = Object.values(state.completion).every(v => v === 100);
  elements.btnGenerate.disabled = !allComplete;
  elements.btnExport.disabled = !allComplete;
  
  if (overallPercent === 100) {
    elements.completionFill.style.background = 'var(--color-success)';
  } else if (overallPercent > 50) {
    elements.completionFill.style.background = 'var(--color-warning)';
  }
}

// Update validation summary
function updateValidationSummary() {
  const sections = [
    { key: 'entity', name: 'Entity Information', icon: '◆' },
    { key: 'environmental', name: 'Environmental (E)', icon: 'E' },
    { key: 'social', name: 'Social (S)', icon: 'S' },
    { key: 'governance', name: 'Governance (G)', icon: 'G' }
  ];
  
  elements.validationGrid.innerHTML = sections.map(section => {
    const fields = REQUIRED_FIELDS[section.key];
    const missing = fields.filter(id => {
      const el = document.getElementById(id);
      return !el || !el.value || el.value.trim() === '';
    });
    
    const status = missing.length === 0 ? 'complete' : 
                   missing.length < fields.length ? 'partial' : 'missing';
    
    return `
      <div class="validation-item ${status}">
        <div class="validation-header">
          <span class="validation-icon">${section.icon}</span>
          <span class="validation-name">${section.name}</span>
          <span class="validation-status">${
            status === 'complete' ? '✓ Complete' :
            status === 'partial' ? `${fields.length - missing.length}/${fields.length}` :
            '✗ Missing'
          }</span>
        </div>
        ${missing.length > 0 ? `
          <div class="validation-missing">
            <span class="missing-label">Missing:</span>
            ${missing.map(id => `<span class="missing-field">${formatFieldName(id)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Format field name for display
function formatFieldName(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Button handlers
function setupButtons() {
  elements.btnClear.addEventListener('click', clearAllData);
  elements.btnGenerate.addEventListener('click', generateReport);
  elements.btnExport.addEventListener('click', exportReport);
}

// Clear all data
function clearAllData() {
  if (confirm('Clear all entered data? This cannot be undone.')) {
    state.data = {};
    localStorage.removeItem('esg-data');
    document.querySelectorAll('input, select').forEach(el => {
      el.value = '';
    });
    elements.reportOutput.innerHTML = '';
    calculateCompletion();
    updateValidationSummary();
  }
}

// Set current date
function setCurrentDate() {
  const now = new Date();
  elements.currentDate.textContent = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Generate Report
function generateReport() {
  const format = document.getElementById('report-format').value;
  const includeRecs = document.getElementById('include-recommendations').value === 'yes';
  
  const report = compileReportData();
  
  if (format === 'json') {
    elements.reportOutput.innerHTML = `
      <div class="report-json">
        <pre>${JSON.stringify(report, null, 2)}</pre>
      </div>
    `;
  } else {
    elements.reportOutput.innerHTML = renderHTMLReport(report, includeRecs);
  }
}

// Compile report data
function compileReportData() {
  const d = state.data;
  
  // Calculate ESG scores
  const envScore = calculateEnvironmentalScore(d);
  const socScore = calculateSocialScore(d);
  const govScore = calculateGovernanceScore(d);
  const overallScore = Math.round((envScore + socScore + govScore) / 3);
  
  return {
    meta: {
      reportType: 'ESG Compliance Report',
      generatedAt: new Date().toISOString(),
      reportingPeriod: d['report-period'],
      version: '1.0'
    },
    entity: {
      legalName: d['business-name'],
      dba: d['dba-name'] || null,
      ein: d['ein'],
      entityType: d['entity-type'],
      address: d['address'],
      jurisdiction: d['jurisdiction'],
      locations: parseInt(d['locations']),
      seatingCapacity: d['seating-capacity'] ? parseInt(d['seating-capacity']) : null
    },
    scores: {
      overall: overallScore,
      environmental: envScore,
      social: socScore,
      governance: govScore,
      rating: getComplianceRating(overallScore)
    },
    environmental: {
      energy: {
        electricityKwh: parseFloat(d['electricity-kwh']),
        naturalGasTherms: parseFloat(d['natural-gas']),
        renewablePercent: d['renewable-percent'] ? parseFloat(d['renewable-percent']) : 0,
        energyStarEquipment: d['energy-star'] || 'unknown'
      },
      water: {
        totalGallons: parseFloat(d['water-gallons']),
        recycledPercent: d['water-recycled'] ? parseFloat(d['water-recycled']) : 0,
        lowFlowFixtures: d['low-flow'] || 'unknown'
      },
      waste: {
        solidWasteLbs: parseFloat(d['waste-solid']),
        recycledPercent: d['waste-recycled'] ? parseFloat(d['waste-recycled']) : 0,
        compostedPercent: d['waste-composted'] ? parseFloat(d['waste-composted']) : 0,
        greaseDisposal: d['grease-disposal'] || 'unknown',
        foodDonation: d['food-donation'] || 'unknown'
      },
      refrigerants: {
        type: d['refrigerant-type'] || 'unknown',
        leaksReported: d['refrigerant-leaks'] ? parseInt(d['refrigerant-leaks']) : 0,
        hvacMaintenance: d['hvac-maintenance'] || 'unknown'
      }
    },
    social: {
      workforce: {
        totalEmployees: parseInt(d['total-employees']),
        fullTime: parseInt(d['full-time']),
        partTime: parseInt(d['part-time']),
        turnoverRate: d['turnover-rate'] ? parseFloat(d['turnover-rate']) : null
      },
      compensation: {
        minWageCompliance: d['min-wage-compliance'] === 'yes',
        avgHourlyWage: d['avg-hourly-wage'] ? parseFloat(d['avg-hourly-wage']) : null,
        tipPoolPolicy: d['tip-pool'] || 'unknown',
        healthInsurance: d['health-insurance'] || 'unknown',
        paidLeave: d['paid-leave'] || 'unknown'
      },
      training: {
        foodHandlerCert: d['food-handler-cert'],
        allergenTraining: d['allergen-training'] || 'unknown',
        harassmentTraining: d['harassment-training'] || 'unknown'
      },
      safety: {
        oshaIncidents: parseInt(d['osha-incidents']),
        workersCompClaims: d['workers-comp-claims'] ? parseInt(d['workers-comp-claims']) : 0,
        safetyInspectionsPassed: d['safety-inspections'] ? parseInt(d['safety-inspections']) : null
      }
    },
    governance: {
      licenses: {
        businessLicense: d['business-license'],
        foodServicePermit: d['food-service-permit'],
        liquorLicense: d['liquor-license'] || 'na',
        firePermit: d['fire-permit'] || 'unknown',
        healthPermit: d['health-permit']
      },
      inspections: {
        healthScore: parseInt(d['health-inspection-score']),
        inspectionDate: d['health-inspection-date'],
        criticalViolations: d['critical-violations'] ? parseInt(d['critical-violations']) : 0,
        nonCriticalViolations: d['non-critical-violations'] ? parseInt(d['non-critical-violations']) : 0
      },
      insurance: {
        generalLiability: d['liability-insurance'],
        workersComp: d['workers-comp-insurance'],
        property: d['property-insurance'] || 'unknown'
      },
      policies: {
        employeeHandbook: d['employee-handbook'] || 'unknown',
        ethicsPolicy: d['ethics-policy'] || 'unknown',
        dataPrivacy: d['data-privacy'] || 'unknown'
      }
    },
    flags: generateComplianceFlags(d)
  };
}

// Calculate Environmental Score
function calculateEnvironmentalScore(d) {
  let score = 70; // Base score
  
  // Renewable energy bonus
  const renewable = parseFloat(d['renewable-percent']) || 0;
  score += renewable * 0.1;
  
  // Energy Star equipment
  if (d['energy-star'] === 'full') score += 5;
  else if (d['energy-star'] === 'majority') score += 3;
  
  // Water recycling
  const waterRecycled = parseFloat(d['water-recycled']) || 0;
  score += waterRecycled * 0.05;
  
  // Low-flow fixtures
  if (d['low-flow'] === 'yes') score += 3;
  
  // Waste management
  const recycled = parseFloat(d['waste-recycled']) || 0;
  const composted = parseFloat(d['waste-composted']) || 0;
  score += (recycled + composted) * 0.05;
  
  // Food donation
  if (d['food-donation'] === 'yes') score += 3;
  
  // Refrigerant penalties
  const leaks = parseInt(d['refrigerant-leaks']) || 0;
  score -= leaks * 5;
  
  // HVAC maintenance
  if (d['hvac-maintenance'] === 'monthly' || d['hvac-maintenance'] === 'quarterly') score += 2;
  else if (d['hvac-maintenance'] === 'none') score -= 5;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

// Calculate Social Score
function calculateSocialScore(d) {
  let score = 70;
  
  // Minimum wage compliance
  if (d['min-wage-compliance'] !== 'yes') score -= 30;
  
  // Benefits
  if (d['health-insurance'] === 'all') score += 5;
  else if (d['health-insurance'] === 'full') score += 3;
  
  if (d['paid-leave'] === 'full') score += 5;
  else if (d['paid-leave'] === 'none') score -= 5;
  
  // Training
  if (d['food-handler-cert'] === 'all') score += 5;
  else if (d['food-handler-cert'] === 'none') score -= 10;
  
  if (d['harassment-training'] === 'annual') score += 3;
  
  // Safety incidents
  const oshaIncidents = parseInt(d['osha-incidents']) || 0;
  score -= oshaIncidents * 10;
  
  // Turnover rate impact
  const turnover = parseFloat(d['turnover-rate']) || 0;
  if (turnover > 100) score -= 5;
  if (turnover > 150) score -= 5;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

// Calculate Governance Score
function calculateGovernanceScore(d) {
  let score = 80;
  
  // License penalties
  if (d['business-license'] !== 'current') score -= 15;
  if (d['food-service-permit'] !== 'current') score -= 15;
  if (d['health-permit'] !== 'current') score -= 15;
  
  // Health inspection
  const healthScore = parseInt(d['health-inspection-score']) || 0;
  if (healthScore >= 90) score += 5;
  else if (healthScore < 70) score -= 15;
  else if (healthScore < 80) score -= 5;
  
  // Violations
  const critical = parseInt(d['critical-violations']) || 0;
  const nonCritical = parseInt(d['non-critical-violations']) || 0;
  score -= critical * 10;
  score -= nonCritical * 2;
  
  // Insurance
  if (d['liability-insurance'] !== 'current') score -= 10;
  if (d['workers-comp-insurance'] !== 'current' && d['workers-comp-insurance'] !== 'exempt') score -= 10;
  
  // Policies
  if (d['employee-handbook'] === 'current') score += 2;
  if (d['ethics-policy'] === 'documented') score += 2;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

// Get compliance rating
function getComplianceRating(score) {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 70) return 'SATISFACTORY';
  if (score >= 60) return 'NEEDS IMPROVEMENT';
  return 'NON-COMPLIANT';
}

// Generate compliance flags
function generateComplianceFlags(d) {
  const flags = [];
  
  // Critical flags
  if (d['min-wage-compliance'] !== 'yes') {
    flags.push({ severity: 'critical', category: 'social', message: 'Minimum wage non-compliance detected' });
  }
  if (d['business-license'] === 'expired') {
    flags.push({ severity: 'critical', category: 'governance', message: 'Business license expired' });
  }
  if (d['food-service-permit'] === 'expired') {
    flags.push({ severity: 'critical', category: 'governance', message: 'Food service permit expired' });
  }
  if (d['health-permit'] === 'expired') {
    flags.push({ severity: 'critical', category: 'governance', message: 'Health department permit expired' });
  }
  if (d['food-handler-cert'] === 'none') {
    flags.push({ severity: 'critical', category: 'social', message: 'No food handler certification on record' });
  }
  if (d['liability-insurance'] !== 'current') {
    flags.push({ severity: 'critical', category: 'governance', message: 'General liability insurance not current' });
  }
  
  // Warning flags
  const healthScore = parseInt(d['health-inspection-score']) || 0;
  if (healthScore < 70) {
    flags.push({ severity: 'warning', category: 'governance', message: `Health inspection score below 70 (${healthScore})` });
  }
  
  const criticalViolations = parseInt(d['critical-violations']) || 0;
  if (criticalViolations > 0) {
    flags.push({ severity: 'warning', category: 'governance', message: `${criticalViolations} critical violation(s) on record` });
  }
  
  const oshaIncidents = parseInt(d['osha-incidents']) || 0;
  if (oshaIncidents > 0) {
    flags.push({ severity: 'warning', category: 'social', message: `${oshaIncidents} OSHA recordable incident(s)` });
  }
  
  const refrigerantLeaks = parseInt(d['refrigerant-leaks']) || 0;
  if (refrigerantLeaks > 0) {
    flags.push({ severity: 'warning', category: 'environmental', message: `${refrigerantLeaks} refrigerant leak(s) reported` });
  }
  
  // Advisory flags
  if (d['renewable-percent'] === '' || parseFloat(d['renewable-percent']) === 0) {
    flags.push({ severity: 'advisory', category: 'environmental', message: 'No renewable energy usage reported' });
  }
  if (d['food-donation'] !== 'yes') {
    flags.push({ severity: 'advisory', category: 'environmental', message: 'No food donation program in place' });
  }
  if (d['harassment-training'] === 'none') {
    flags.push({ severity: 'advisory', category: 'social', message: 'No anti-harassment training program' });
  }
  if (d['employee-handbook'] === 'none' || d['employee-handbook'] === 'outdated') {
    flags.push({ severity: 'advisory', category: 'governance', message: 'Employee handbook missing or outdated' });
  }
  
  return flags;
}

// Render HTML Report
function renderHTMLReport(report, includeRecs) {
  const ratingClass = report.scores.rating.toLowerCase().replace(' ', '-');
  
  return `
    <div class="compliance-report">
      <div class="report-header">
        <div class="report-title-block">
          <h1>ESG COMPLIANCE REPORT</h1>
          <p class="report-subtitle">Restaurant Industry — Regulatory Assessment</p>
        </div>
        <div class="report-meta">
          <div class="meta-item">
            <span class="meta-label">Report Date</span>
            <span class="meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Period</span>
            <span class="meta-value">${report.meta.reportingPeriod}</span>
          </div>
        </div>
      </div>
      
      <div class="report-entity">
        <h2>Entity Information</h2>
        <div class="entity-grid">
          <div class="entity-item"><span class="label">Legal Name:</span> ${report.entity.legalName}</div>
          ${report.entity.dba ? `<div class="entity-item"><span class="label">DBA:</span> ${report.entity.dba}</div>` : ''}
          <div class="entity-item"><span class="label">EIN:</span> ${report.entity.ein}</div>
          <div class="entity-item"><span class="label">Entity Type:</span> ${report.entity.entityType.toUpperCase()}</div>
          <div class="entity-item full"><span class="label">Address:</span> ${report.entity.address}</div>
          <div class="entity-item"><span class="label">Jurisdiction:</span> ${report.entity.jurisdiction}</div>
          <div class="entity-item"><span class="label">Locations:</span> ${report.entity.locations}</div>
        </div>
      </div>
      
      <div class="report-scores">
        <h2>ESG Compliance Scores</h2>
        <div class="scores-grid">
          <div class="score-card overall">
            <div class="score-value">${report.scores.overall}</div>
            <div class="score-label">Overall Score</div>
            <div class="score-rating ${ratingClass}">${report.scores.rating}</div>
          </div>
          <div class="score-card env">
            <div class="score-value">${report.scores.environmental}</div>
            <div class="score-label">Environmental</div>
            <div class="score-indicator" style="width: ${report.scores.environmental}%"></div>
          </div>
          <div class="score-card soc">
            <div class="score-value">${report.scores.social}</div>
            <div class="score-label">Social</div>
            <div class="score-indicator" style="width: ${report.scores.social}%"></div>
          </div>
          <div class="score-card gov">
            <div class="score-value">${report.scores.governance}</div>
            <div class="score-label">Governance</div>
            <div class="score-indicator" style="width: ${report.scores.governance}%"></div>
          </div>
        </div>
      </div>
      
      ${report.flags.length > 0 ? `
      <div class="report-flags">
        <h2>Compliance Flags</h2>
        <div class="flags-list">
          ${report.flags.map(flag => `
            <div class="flag-item ${flag.severity}">
              <span class="flag-severity">${flag.severity.toUpperCase()}</span>
              <span class="flag-category">[${flag.category.charAt(0).toUpperCase()}]</span>
              <span class="flag-message">${flag.message}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
      
      <div class="report-section">
        <h2>Environmental (E) — Detailed Data</h2>
        <div class="data-table">
          <div class="data-row header">
            <span>Metric</span>
            <span>Value</span>
            <span>Status</span>
          </div>
          <div class="data-row">
            <span>Electricity Consumption</span>
            <span>${report.environmental.energy.electricityKwh.toLocaleString()} kWh</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Natural Gas</span>
            <span>${report.environmental.energy.naturalGasTherms.toLocaleString()} therms</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Renewable Energy</span>
            <span>${report.environmental.energy.renewablePercent}%</span>
            <span class="${report.environmental.energy.renewablePercent > 0 ? 'status-good' : 'status-neutral'}">${report.environmental.energy.renewablePercent > 0 ? 'Active' : 'None'}</span>
          </div>
          <div class="data-row">
            <span>Water Usage</span>
            <span>${report.environmental.water.totalGallons.toLocaleString()} gal</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Solid Waste</span>
            <span>${report.environmental.waste.solidWasteLbs.toLocaleString()} lbs</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Waste Recycled</span>
            <span>${report.environmental.waste.recycledPercent}%</span>
            <span class="${report.environmental.waste.recycledPercent > 30 ? 'status-good' : 'status-neutral'}">${report.environmental.waste.recycledPercent > 30 ? 'Good' : 'Below Target'}</span>
          </div>
          <div class="data-row">
            <span>Food Composted</span>
            <span>${report.environmental.waste.compostedPercent}%</span>
            <span class="${report.environmental.waste.compostedPercent > 0 ? 'status-good' : 'status-neutral'}">${report.environmental.waste.compostedPercent > 0 ? 'Active' : 'None'}</span>
          </div>
          <div class="data-row">
            <span>Refrigerant Leaks</span>
            <span>${report.environmental.refrigerants.leaksReported}</span>
            <span class="${report.environmental.refrigerants.leaksReported === 0 ? 'status-good' : 'status-bad'}">${report.environmental.refrigerants.leaksReported === 0 ? 'None' : 'Reported'}</span>
          </div>
        </div>
      </div>
      
      <div class="report-section">
        <h2>Social (S) — Detailed Data</h2>
        <div class="data-table">
          <div class="data-row header">
            <span>Metric</span>
            <span>Value</span>
            <span>Status</span>
          </div>
          <div class="data-row">
            <span>Total Employees</span>
            <span>${report.social.workforce.totalEmployees}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Full-Time / Part-Time</span>
            <span>${report.social.workforce.fullTime} / ${report.social.workforce.partTime}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Minimum Wage Compliance</span>
            <span>${report.social.compensation.minWageCompliance ? 'Yes' : 'No'}</span>
            <span class="${report.social.compensation.minWageCompliance ? 'status-good' : 'status-bad'}">${report.social.compensation.minWageCompliance ? 'Compliant' : 'NON-COMPLIANT'}</span>
          </div>
          <div class="data-row">
            <span>Food Handler Certification</span>
            <span>${report.social.training.foodHandlerCert}</span>
            <span class="${report.social.training.foodHandlerCert === 'all' ? 'status-good' : report.social.training.foodHandlerCert === 'none' ? 'status-bad' : 'status-warning'}">${report.social.training.foodHandlerCert === 'all' ? 'Full' : report.social.training.foodHandlerCert === 'none' ? 'Missing' : 'Partial'}</span>
          </div>
          <div class="data-row">
            <span>OSHA Recordable Incidents</span>
            <span>${report.social.safety.oshaIncidents}</span>
            <span class="${report.social.safety.oshaIncidents === 0 ? 'status-good' : 'status-warning'}">${report.social.safety.oshaIncidents === 0 ? 'None' : 'Recorded'}</span>
          </div>
          <div class="data-row">
            <span>Health Insurance</span>
            <span>${report.social.compensation.healthInsurance}</span>
            <span class="${report.social.compensation.healthInsurance === 'all' || report.social.compensation.healthInsurance === 'full' ? 'status-good' : 'status-neutral'}">${report.social.compensation.healthInsurance === 'no' ? 'Not Offered' : 'Offered'}</span>
          </div>
        </div>
      </div>
      
      <div class="report-section">
        <h2>Governance (G) — Detailed Data</h2>
        <div class="data-table">
          <div class="data-row header">
            <span>Metric</span>
            <span>Value</span>
            <span>Status</span>
          </div>
          <div class="data-row">
            <span>Business License</span>
            <span>${report.governance.licenses.businessLicense}</span>
            <span class="${report.governance.licenses.businessLicense === 'current' ? 'status-good' : 'status-bad'}">${report.governance.licenses.businessLicense === 'current' ? 'Valid' : 'INVALID'}</span>
          </div>
          <div class="data-row">
            <span>Food Service Permit</span>
            <span>${report.governance.licenses.foodServicePermit}</span>
            <span class="${report.governance.licenses.foodServicePermit === 'current' ? 'status-good' : 'status-bad'}">${report.governance.licenses.foodServicePermit === 'current' ? 'Valid' : 'INVALID'}</span>
          </div>
          <div class="data-row">
            <span>Health Department Permit</span>
            <span>${report.governance.licenses.healthPermit}</span>
            <span class="${report.governance.licenses.healthPermit === 'current' ? 'status-good' : 'status-bad'}">${report.governance.licenses.healthPermit === 'current' ? 'Valid' : 'INVALID'}</span>
          </div>
          <div class="data-row">
            <span>Health Inspection Score</span>
            <span>${report.governance.inspections.healthScore}/100</span>
            <span class="${report.governance.inspections.healthScore >= 90 ? 'status-good' : report.governance.inspections.healthScore >= 70 ? 'status-warning' : 'status-bad'}">${report.governance.inspections.healthScore >= 90 ? 'Excellent' : report.governance.inspections.healthScore >= 70 ? 'Passing' : 'FAILING'}</span>
          </div>
          <div class="data-row">
            <span>Inspection Date</span>
            <span>${new Date(report.governance.inspections.inspectionDate).toLocaleDateString()}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Critical Violations</span>
            <span>${report.governance.inspections.criticalViolations}</span>
            <span class="${report.governance.inspections.criticalViolations === 0 ? 'status-good' : 'status-bad'}">${report.governance.inspections.criticalViolations === 0 ? 'None' : 'FLAGGED'}</span>
          </div>
          <div class="data-row">
            <span>General Liability Insurance</span>
            <span>${report.governance.insurance.generalLiability}</span>
            <span class="${report.governance.insurance.generalLiability === 'current' ? 'status-good' : 'status-bad'}">${report.governance.insurance.generalLiability === 'current' ? 'Active' : 'INACTIVE'}</span>
          </div>
          <div class="data-row">
            <span>Workers' Compensation</span>
            <span>${report.governance.insurance.workersComp}</span>
            <span class="${report.governance.insurance.workersComp === 'current' || report.governance.insurance.workersComp === 'exempt' ? 'status-good' : 'status-bad'}">${report.governance.insurance.workersComp === 'current' ? 'Active' : report.governance.insurance.workersComp === 'exempt' ? 'Exempt' : 'INACTIVE'}</span>
          </div>
        </div>
      </div>
      
      ${includeRecs ? renderRecommendations(report) : ''}
      
      <div class="report-footer">
        <div class="footer-disclaimer">
          <strong>DISCLAIMER:</strong> This report is generated based on self-reported data and does not constitute legal advice or an official regulatory audit. 
          Verify all information with appropriate regulatory authorities. Report generated by ESG Compliance Report Generator v1.0.
        </div>
        <div class="footer-signature">
          <div class="sig-line"></div>
          <span>Authorized Representative Signature</span>
        </div>
      </div>
    </div>
  `;
}

// Render recommendations
function renderRecommendations(report) {
  const recs = [];
  
  // Environmental recommendations
  if (report.environmental.energy.renewablePercent < 10) {
    recs.push({ category: 'E', text: 'Consider sourcing at least 10% of energy from renewable sources to improve environmental score.' });
  }
  if (report.environmental.waste.recycledPercent < 30) {
    recs.push({ category: 'E', text: 'Implement or expand recycling program to achieve 30%+ waste diversion rate.' });
  }
  if (report.environmental.waste.compostedPercent === 0) {
    recs.push({ category: 'E', text: 'Establish food waste composting program to reduce landfill impact.' });
  }
  if (report.environmental.refrigerants.leaksReported > 0) {
    recs.push({ category: 'E', text: 'Address refrigerant leaks immediately and implement preventive maintenance schedule.' });
  }
  
  // Social recommendations
  if (!report.social.compensation.minWageCompliance) {
    recs.push({ category: 'S', text: 'URGENT: Address minimum wage compliance immediately to avoid legal penalties.' });
  }
  if (report.social.training.foodHandlerCert !== 'all') {
    recs.push({ category: 'S', text: 'Ensure all food handling staff obtain required certifications.' });
  }
  if (report.social.training.harassmentTraining === 'none') {
    recs.push({ category: 'S', text: 'Implement mandatory anti-harassment training for all employees.' });
  }
  if (report.social.safety.oshaIncidents > 0) {
    recs.push({ category: 'S', text: 'Review and strengthen workplace safety protocols to prevent future incidents.' });
  }
  
  // Governance recommendations
  if (report.governance.inspections.healthScore < 90) {
    recs.push({ category: 'G', text: 'Target health inspection score of 90+ through staff training and facility improvements.' });
  }
  if (report.governance.inspections.criticalViolations > 0) {
    recs.push({ category: 'G', text: 'Remediate all critical violations before next scheduled inspection.' });
  }
  if (report.governance.policies.employeeHandbook !== 'current') {
    recs.push({ category: 'G', text: 'Update employee handbook to reflect current policies and legal requirements.' });
  }
  
  if (recs.length === 0) {
    return '';
  }
  
  return `
    <div class="report-section recommendations">
      <h2>Recommendations for Improvement</h2>
      <div class="recs-list">
        ${recs.map(rec => `
          <div class="rec-item">
            <span class="rec-category">[${rec.category}]</span>
            <span class="rec-text">${rec.text}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Export report
function exportReport() {
  const format = document.getElementById('report-format').value;
  const report = compileReportData();
  
  let content, filename, type;
  
  if (format === 'json') {
    content = JSON.stringify(report, null, 2);
    filename = `esg-report-${report.entity.legalName.replace(/\s+/g, '-').toLowerCase()}-${report.meta.reportingPeriod}.json`;
    type = 'application/json';
  } else {
    content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ESG Compliance Report - ${report.entity.legalName}</title>
  <style>
    body { font-family: 'IBM Plex Sans', sans-serif; max-width: 900px; margin: 0 auto; padding: 40px; color: #1a202c; }
    h1 { color: #1a365d; border-bottom: 3px solid #4ade80; padding-bottom: 10px; }
    h2 { color: #2d5a87; margin-top: 30px; }
    .score-card { display: inline-block; padding: 20px; margin: 10px; background: #f8fafc; border-radius: 8px; text-align: center; }
    .score-value { font-size: 36px; font-weight: bold; color: #1a365d; }
    .data-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .data-row { display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .data-row.header { background: #1a365d; color: white; font-weight: bold; }
    .flag-item { padding: 10px; margin: 5px 0; border-radius: 4px; }
    .flag-item.critical { background: #fee2e2; border-left: 4px solid #dc2626; }
    .flag-item.warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
    .flag-item.advisory { background: #e0e7ff; border-left: 4px solid #6366f1; }
    .status-good { color: #059669; font-weight: bold; }
    .status-bad { color: #dc2626; font-weight: bold; }
    .status-warning { color: #d97706; }
    .footer-disclaimer { margin-top: 40px; padding: 20px; background: #f1f5f9; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
${renderHTMLReport(report, document.getElementById('include-recommendations').value === 'yes')}
</body>
</html>`;
    filename = `esg-report-${report.entity.legalName.replace(/\s+/g, '-').toLowerCase()}-${report.meta.reportingPeriod}.html`;
    type = 'text/html';
  }
  
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
