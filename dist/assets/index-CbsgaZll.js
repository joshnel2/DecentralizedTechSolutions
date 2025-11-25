(function(){const a=document.createElement("link").relList;if(a&&a.supports&&a.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const r of i.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&s(r)}).observe(document,{childList:!0,subtree:!0});function t(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(n){if(n.ep)return;n.ep=!0;const i=t(n);fetch(n.href,i)}})();const f={entity:["business-name","ein","entity-type","address","jurisdiction","report-period","locations"],environmental:["electricity-kwh","natural-gas","water-gallons","waste-solid"],social:["total-employees","full-time","part-time","min-wage-compliance","food-handler-cert","osha-incidents"],governance:["business-license","food-service-permit","health-permit","health-inspection-score","health-inspection-date","liability-insurance","workers-comp-insurance"]},l={data:{},completion:{entity:0,environmental:0,social:0,governance:0}},o={navItems:document.querySelectorAll(".nav-item"),panels:document.querySelectorAll(".panel"),completionFill:document.getElementById("completion-fill"),completionPercent:document.getElementById("completion-percent"),btnClear:document.getElementById("btn-clear"),btnExport:document.getElementById("btn-export"),btnGenerate:document.getElementById("btn-generate"),reportOutput:document.getElementById("report-output"),validationGrid:document.getElementById("validation-grid"),currentDate:document.getElementById("current-date")};function w(){b(),$(),S(),C(),m(),I()}function b(){o.navItems.forEach(e=>{e.addEventListener("click",()=>{const a=e.dataset.section;o.navItems.forEach(t=>t.classList.remove("active")),e.classList.add("active"),o.panels.forEach(t=>t.classList.remove("active")),document.getElementById(`section-${a}`).classList.add("active")})})}function $(){document.querySelectorAll("input, select").forEach(a=>{a.addEventListener("change",()=>{g(a),p(),m()}),a.addEventListener("input",()=>{a.tagName==="INPUT"&&(g(a),p())})})}function g(e){l.data[e.id]=e.value,localStorage.setItem("esg-data",JSON.stringify(l.data))}function I(){const e=localStorage.getItem("esg-data");e&&(l.data=JSON.parse(e),Object.entries(l.data).forEach(([a,t])=>{const s=document.getElementById(a);s&&(s.value=t)}),p(),m())}function p(){let e=0,a=0;Object.entries(f).forEach(([n,i])=>{let r=0;i.forEach(d=>{e++;const u=document.getElementById(d);u&&u.value&&u.value.trim()!==""&&(a++,r++)}),l.completion[n]=Math.round(r/i.length*100);const c=document.getElementById(`status-${n}`);c&&(l.completion[n]===100?(c.textContent="Complete",c.className="panel-status complete"):l.completion[n]>0?(c.textContent=`${l.completion[n]}%`,c.className="panel-status partial"):(c.textContent="Incomplete",c.className="panel-status"));const v=document.querySelector(`.nav-item[data-section="${n}"]`);if(v){const d=v.querySelector(".nav-icon");l.completion[n]===100?(d.textContent="✓",d.style.color="var(--color-success)"):l.completion[n]>0?(d.textContent="●",d.style.color="var(--color-warning)"):(d.textContent="●",d.style.color="var(--color-muted)")}});const t=Math.round(a/e*100);o.completionFill.style.width=`${t}%`,o.completionPercent.textContent=`${t}%`;const s=Object.values(l.completion).every(n=>n===100);o.btnGenerate.disabled=!s,o.btnExport.disabled=!s,t===100?o.completionFill.style.background="var(--color-success)":t>50&&(o.completionFill.style.background="var(--color-warning)")}function m(){const e=[{key:"entity",name:"Entity Information",icon:"◆"},{key:"environmental",name:"Environmental (E)",icon:"E"},{key:"social",name:"Social (S)",icon:"S"},{key:"governance",name:"Governance (G)",icon:"G"}];o.validationGrid.innerHTML=e.map(a=>{const t=f[a.key],s=t.filter(i=>{const r=document.getElementById(i);return!r||!r.value||r.value.trim()===""}),n=s.length===0?"complete":s.length<t.length?"partial":"missing";return`
      <div class="validation-item ${n}">
        <div class="validation-header">
          <span class="validation-icon">${a.icon}</span>
          <span class="validation-name">${a.name}</span>
          <span class="validation-status">${n==="complete"?"✓ Complete":n==="partial"?`${t.length-s.length}/${t.length}`:"✗ Missing"}</span>
        </div>
        ${s.length>0?`
          <div class="validation-missing">
            <span class="missing-label">Missing:</span>
            ${s.map(i=>`<span class="missing-field">${E(i)}</span>`).join("")}
          </div>
        `:""}
      </div>
    `}).join("")}function E(e){return e.replace(/-/g," ").replace(/\b\w/g,a=>a.toUpperCase())}function S(){o.btnClear.addEventListener("click",k),o.btnGenerate.addEventListener("click",x),o.btnExport.addEventListener("click",T)}function k(){confirm("Clear all entered data? This cannot be undone.")&&(l.data={},localStorage.removeItem("esg-data"),document.querySelectorAll("input, select").forEach(e=>{e.value=""}),o.reportOutput.innerHTML="",p(),m())}function C(){const e=new Date;o.currentDate.textContent=e.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}function x(){const e=document.getElementById("report-format").value,a=document.getElementById("include-recommendations").value==="yes",t=y();e==="json"?o.reportOutput.innerHTML=`
      <div class="report-json">
        <pre>${JSON.stringify(t,null,2)}</pre>
      </div>
    `:o.reportOutput.innerHTML=h(t,a)}function y(){const e=l.data,a=L(e),t=P(e),s=R(e),n=Math.round((a+t+s)/3);return{meta:{reportType:"ESG Compliance Report",generatedAt:new Date().toISOString(),reportingPeriod:e["report-period"],version:"1.0"},entity:{legalName:e["business-name"],dba:e["dba-name"]||null,ein:e.ein,entityType:e["entity-type"],address:e.address,jurisdiction:e.jurisdiction,locations:parseInt(e.locations),seatingCapacity:e["seating-capacity"]?parseInt(e["seating-capacity"]):null},scores:{overall:n,environmental:a,social:t,governance:s,rating:N(n)},environmental:{energy:{electricityKwh:parseFloat(e["electricity-kwh"]),naturalGasTherms:parseFloat(e["natural-gas"]),renewablePercent:e["renewable-percent"]?parseFloat(e["renewable-percent"]):0,energyStarEquipment:e["energy-star"]||"unknown"},water:{totalGallons:parseFloat(e["water-gallons"]),recycledPercent:e["water-recycled"]?parseFloat(e["water-recycled"]):0,lowFlowFixtures:e["low-flow"]||"unknown"},waste:{solidWasteLbs:parseFloat(e["waste-solid"]),recycledPercent:e["waste-recycled"]?parseFloat(e["waste-recycled"]):0,compostedPercent:e["waste-composted"]?parseFloat(e["waste-composted"]):0,greaseDisposal:e["grease-disposal"]||"unknown",foodDonation:e["food-donation"]||"unknown"},refrigerants:{type:e["refrigerant-type"]||"unknown",leaksReported:e["refrigerant-leaks"]?parseInt(e["refrigerant-leaks"]):0,hvacMaintenance:e["hvac-maintenance"]||"unknown"}},social:{workforce:{totalEmployees:parseInt(e["total-employees"]),fullTime:parseInt(e["full-time"]),partTime:parseInt(e["part-time"]),turnoverRate:e["turnover-rate"]?parseFloat(e["turnover-rate"]):null},compensation:{minWageCompliance:e["min-wage-compliance"]==="yes",avgHourlyWage:e["avg-hourly-wage"]?parseFloat(e["avg-hourly-wage"]):null,tipPoolPolicy:e["tip-pool"]||"unknown",healthInsurance:e["health-insurance"]||"unknown",paidLeave:e["paid-leave"]||"unknown"},training:{foodHandlerCert:e["food-handler-cert"],allergenTraining:e["allergen-training"]||"unknown",harassmentTraining:e["harassment-training"]||"unknown"},safety:{oshaIncidents:parseInt(e["osha-incidents"]),workersCompClaims:e["workers-comp-claims"]?parseInt(e["workers-comp-claims"]):0,safetyInspectionsPassed:e["safety-inspections"]?parseInt(e["safety-inspections"]):null}},governance:{licenses:{businessLicense:e["business-license"],foodServicePermit:e["food-service-permit"],liquorLicense:e["liquor-license"]||"na",firePermit:e["fire-permit"]||"unknown",healthPermit:e["health-permit"]},inspections:{healthScore:parseInt(e["health-inspection-score"]),inspectionDate:e["health-inspection-date"],criticalViolations:e["critical-violations"]?parseInt(e["critical-violations"]):0,nonCriticalViolations:e["non-critical-violations"]?parseInt(e["non-critical-violations"]):0},insurance:{generalLiability:e["liability-insurance"],workersComp:e["workers-comp-insurance"],property:e["property-insurance"]||"unknown"},policies:{employeeHandbook:e["employee-handbook"]||"unknown",ethicsPolicy:e["ethics-policy"]||"unknown",dataPrivacy:e["data-privacy"]||"unknown"}},flags:F(e)}}function L(e){let a=70;const t=parseFloat(e["renewable-percent"])||0;a+=t*.1,e["energy-star"]==="full"?a+=5:e["energy-star"]==="majority"&&(a+=3);const s=parseFloat(e["water-recycled"])||0;a+=s*.05,e["low-flow"]==="yes"&&(a+=3);const n=parseFloat(e["waste-recycled"])||0,i=parseFloat(e["waste-composted"])||0;a+=(n+i)*.05,e["food-donation"]==="yes"&&(a+=3);const r=parseInt(e["refrigerant-leaks"])||0;return a-=r*5,e["hvac-maintenance"]==="monthly"||e["hvac-maintenance"]==="quarterly"?a+=2:e["hvac-maintenance"]==="none"&&(a-=5),Math.min(100,Math.max(0,Math.round(a)))}function P(e){let a=70;e["min-wage-compliance"]!=="yes"&&(a-=30),e["health-insurance"]==="all"?a+=5:e["health-insurance"]==="full"&&(a+=3),e["paid-leave"]==="full"?a+=5:e["paid-leave"]==="none"&&(a-=5),e["food-handler-cert"]==="all"?a+=5:e["food-handler-cert"]==="none"&&(a-=10),e["harassment-training"]==="annual"&&(a+=3);const t=parseInt(e["osha-incidents"])||0;a-=t*10;const s=parseFloat(e["turnover-rate"])||0;return s>100&&(a-=5),s>150&&(a-=5),Math.min(100,Math.max(0,Math.round(a)))}function R(e){let a=80;e["business-license"]!=="current"&&(a-=15),e["food-service-permit"]!=="current"&&(a-=15),e["health-permit"]!=="current"&&(a-=15);const t=parseInt(e["health-inspection-score"])||0;t>=90?a+=5:t<70?a-=15:t<80&&(a-=5);const s=parseInt(e["critical-violations"])||0,n=parseInt(e["non-critical-violations"])||0;return a-=s*10,a-=n*2,e["liability-insurance"]!=="current"&&(a-=10),e["workers-comp-insurance"]!=="current"&&e["workers-comp-insurance"]!=="exempt"&&(a-=10),e["employee-handbook"]==="current"&&(a+=2),e["ethics-policy"]==="documented"&&(a+=2),Math.min(100,Math.max(0,Math.round(a)))}function N(e){return e>=90?"EXCELLENT":e>=80?"GOOD":e>=70?"SATISFACTORY":e>=60?"NEEDS IMPROVEMENT":"NON-COMPLIANT"}function F(e){const a=[];e["min-wage-compliance"]!=="yes"&&a.push({severity:"critical",category:"social",message:"Minimum wage non-compliance detected"}),e["business-license"]==="expired"&&a.push({severity:"critical",category:"governance",message:"Business license expired"}),e["food-service-permit"]==="expired"&&a.push({severity:"critical",category:"governance",message:"Food service permit expired"}),e["health-permit"]==="expired"&&a.push({severity:"critical",category:"governance",message:"Health department permit expired"}),e["food-handler-cert"]==="none"&&a.push({severity:"critical",category:"social",message:"No food handler certification on record"}),e["liability-insurance"]!=="current"&&a.push({severity:"critical",category:"governance",message:"General liability insurance not current"});const t=parseInt(e["health-inspection-score"])||0;t<70&&a.push({severity:"warning",category:"governance",message:`Health inspection score below 70 (${t})`});const s=parseInt(e["critical-violations"])||0;s>0&&a.push({severity:"warning",category:"governance",message:`${s} critical violation(s) on record`});const n=parseInt(e["osha-incidents"])||0;n>0&&a.push({severity:"warning",category:"social",message:`${n} OSHA recordable incident(s)`});const i=parseInt(e["refrigerant-leaks"])||0;return i>0&&a.push({severity:"warning",category:"environmental",message:`${i} refrigerant leak(s) reported`}),(e["renewable-percent"]===""||parseFloat(e["renewable-percent"])===0)&&a.push({severity:"advisory",category:"environmental",message:"No renewable energy usage reported"}),e["food-donation"]!=="yes"&&a.push({severity:"advisory",category:"environmental",message:"No food donation program in place"}),e["harassment-training"]==="none"&&a.push({severity:"advisory",category:"social",message:"No anti-harassment training program"}),(e["employee-handbook"]==="none"||e["employee-handbook"]==="outdated")&&a.push({severity:"advisory",category:"governance",message:"Employee handbook missing or outdated"}),a}function h(e,a){const t=e.scores.rating.toLowerCase().replace(" ","-");return`
    <div class="compliance-report">
      <div class="report-header">
        <div class="report-title-block">
          <h1>ESG COMPLIANCE REPORT</h1>
          <p class="report-subtitle">Restaurant Industry — Regulatory Assessment</p>
        </div>
        <div class="report-meta">
          <div class="meta-item">
            <span class="meta-label">Report Date</span>
            <span class="meta-value">${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Period</span>
            <span class="meta-value">${e.meta.reportingPeriod}</span>
          </div>
        </div>
      </div>
      
      <div class="report-entity">
        <h2>Entity Information</h2>
        <div class="entity-grid">
          <div class="entity-item"><span class="label">Legal Name:</span> ${e.entity.legalName}</div>
          ${e.entity.dba?`<div class="entity-item"><span class="label">DBA:</span> ${e.entity.dba}</div>`:""}
          <div class="entity-item"><span class="label">EIN:</span> ${e.entity.ein}</div>
          <div class="entity-item"><span class="label">Entity Type:</span> ${e.entity.entityType.toUpperCase()}</div>
          <div class="entity-item full"><span class="label">Address:</span> ${e.entity.address}</div>
          <div class="entity-item"><span class="label">Jurisdiction:</span> ${e.entity.jurisdiction}</div>
          <div class="entity-item"><span class="label">Locations:</span> ${e.entity.locations}</div>
        </div>
      </div>
      
      <div class="report-scores">
        <h2>ESG Compliance Scores</h2>
        <div class="scores-grid">
          <div class="score-card overall">
            <div class="score-value">${e.scores.overall}</div>
            <div class="score-label">Overall Score</div>
            <div class="score-rating ${t}">${e.scores.rating}</div>
          </div>
          <div class="score-card env">
            <div class="score-value">${e.scores.environmental}</div>
            <div class="score-label">Environmental</div>
            <div class="score-indicator" style="width: ${e.scores.environmental}%"></div>
          </div>
          <div class="score-card soc">
            <div class="score-value">${e.scores.social}</div>
            <div class="score-label">Social</div>
            <div class="score-indicator" style="width: ${e.scores.social}%"></div>
          </div>
          <div class="score-card gov">
            <div class="score-value">${e.scores.governance}</div>
            <div class="score-label">Governance</div>
            <div class="score-indicator" style="width: ${e.scores.governance}%"></div>
          </div>
        </div>
      </div>
      
      ${e.flags.length>0?`
      <div class="report-flags">
        <h2>Compliance Flags</h2>
        <div class="flags-list">
          ${e.flags.map(s=>`
            <div class="flag-item ${s.severity}">
              <span class="flag-severity">${s.severity.toUpperCase()}</span>
              <span class="flag-category">[${s.category.charAt(0).toUpperCase()}]</span>
              <span class="flag-message">${s.message}</span>
            </div>
          `).join("")}
        </div>
      </div>
      `:""}
      
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
            <span>${e.environmental.energy.electricityKwh.toLocaleString()} kWh</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Natural Gas</span>
            <span>${e.environmental.energy.naturalGasTherms.toLocaleString()} therms</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Renewable Energy</span>
            <span>${e.environmental.energy.renewablePercent}%</span>
            <span class="${e.environmental.energy.renewablePercent>0?"status-good":"status-neutral"}">${e.environmental.energy.renewablePercent>0?"Active":"None"}</span>
          </div>
          <div class="data-row">
            <span>Water Usage</span>
            <span>${e.environmental.water.totalGallons.toLocaleString()} gal</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Solid Waste</span>
            <span>${e.environmental.waste.solidWasteLbs.toLocaleString()} lbs</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Waste Recycled</span>
            <span>${e.environmental.waste.recycledPercent}%</span>
            <span class="${e.environmental.waste.recycledPercent>30?"status-good":"status-neutral"}">${e.environmental.waste.recycledPercent>30?"Good":"Below Target"}</span>
          </div>
          <div class="data-row">
            <span>Food Composted</span>
            <span>${e.environmental.waste.compostedPercent}%</span>
            <span class="${e.environmental.waste.compostedPercent>0?"status-good":"status-neutral"}">${e.environmental.waste.compostedPercent>0?"Active":"None"}</span>
          </div>
          <div class="data-row">
            <span>Refrigerant Leaks</span>
            <span>${e.environmental.refrigerants.leaksReported}</span>
            <span class="${e.environmental.refrigerants.leaksReported===0?"status-good":"status-bad"}">${e.environmental.refrigerants.leaksReported===0?"None":"Reported"}</span>
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
            <span>${e.social.workforce.totalEmployees}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Full-Time / Part-Time</span>
            <span>${e.social.workforce.fullTime} / ${e.social.workforce.partTime}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Minimum Wage Compliance</span>
            <span>${e.social.compensation.minWageCompliance?"Yes":"No"}</span>
            <span class="${e.social.compensation.minWageCompliance?"status-good":"status-bad"}">${e.social.compensation.minWageCompliance?"Compliant":"NON-COMPLIANT"}</span>
          </div>
          <div class="data-row">
            <span>Food Handler Certification</span>
            <span>${e.social.training.foodHandlerCert}</span>
            <span class="${e.social.training.foodHandlerCert==="all"?"status-good":e.social.training.foodHandlerCert==="none"?"status-bad":"status-warning"}">${e.social.training.foodHandlerCert==="all"?"Full":e.social.training.foodHandlerCert==="none"?"Missing":"Partial"}</span>
          </div>
          <div class="data-row">
            <span>OSHA Recordable Incidents</span>
            <span>${e.social.safety.oshaIncidents}</span>
            <span class="${e.social.safety.oshaIncidents===0?"status-good":"status-warning"}">${e.social.safety.oshaIncidents===0?"None":"Recorded"}</span>
          </div>
          <div class="data-row">
            <span>Health Insurance</span>
            <span>${e.social.compensation.healthInsurance}</span>
            <span class="${e.social.compensation.healthInsurance==="all"||e.social.compensation.healthInsurance==="full"?"status-good":"status-neutral"}">${e.social.compensation.healthInsurance==="no"?"Not Offered":"Offered"}</span>
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
            <span>${e.governance.licenses.businessLicense}</span>
            <span class="${e.governance.licenses.businessLicense==="current"?"status-good":"status-bad"}">${e.governance.licenses.businessLicense==="current"?"Valid":"INVALID"}</span>
          </div>
          <div class="data-row">
            <span>Food Service Permit</span>
            <span>${e.governance.licenses.foodServicePermit}</span>
            <span class="${e.governance.licenses.foodServicePermit==="current"?"status-good":"status-bad"}">${e.governance.licenses.foodServicePermit==="current"?"Valid":"INVALID"}</span>
          </div>
          <div class="data-row">
            <span>Health Department Permit</span>
            <span>${e.governance.licenses.healthPermit}</span>
            <span class="${e.governance.licenses.healthPermit==="current"?"status-good":"status-bad"}">${e.governance.licenses.healthPermit==="current"?"Valid":"INVALID"}</span>
          </div>
          <div class="data-row">
            <span>Health Inspection Score</span>
            <span>${e.governance.inspections.healthScore}/100</span>
            <span class="${e.governance.inspections.healthScore>=90?"status-good":e.governance.inspections.healthScore>=70?"status-warning":"status-bad"}">${e.governance.inspections.healthScore>=90?"Excellent":e.governance.inspections.healthScore>=70?"Passing":"FAILING"}</span>
          </div>
          <div class="data-row">
            <span>Inspection Date</span>
            <span>${new Date(e.governance.inspections.inspectionDate).toLocaleDateString()}</span>
            <span class="status-neutral">Recorded</span>
          </div>
          <div class="data-row">
            <span>Critical Violations</span>
            <span>${e.governance.inspections.criticalViolations}</span>
            <span class="${e.governance.inspections.criticalViolations===0?"status-good":"status-bad"}">${e.governance.inspections.criticalViolations===0?"None":"FLAGGED"}</span>
          </div>
          <div class="data-row">
            <span>General Liability Insurance</span>
            <span>${e.governance.insurance.generalLiability}</span>
            <span class="${e.governance.insurance.generalLiability==="current"?"status-good":"status-bad"}">${e.governance.insurance.generalLiability==="current"?"Active":"INACTIVE"}</span>
          </div>
          <div class="data-row">
            <span>Workers' Compensation</span>
            <span>${e.governance.insurance.workersComp}</span>
            <span class="${e.governance.insurance.workersComp==="current"||e.governance.insurance.workersComp==="exempt"?"status-good":"status-bad"}">${e.governance.insurance.workersComp==="current"?"Active":e.governance.insurance.workersComp==="exempt"?"Exempt":"INACTIVE"}</span>
          </div>
        </div>
      </div>
      
      ${a?D(e):""}
      
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
  `}function D(e){const a=[];return e.environmental.energy.renewablePercent<10&&a.push({category:"E",text:"Consider sourcing at least 10% of energy from renewable sources to improve environmental score."}),e.environmental.waste.recycledPercent<30&&a.push({category:"E",text:"Implement or expand recycling program to achieve 30%+ waste diversion rate."}),e.environmental.waste.compostedPercent===0&&a.push({category:"E",text:"Establish food waste composting program to reduce landfill impact."}),e.environmental.refrigerants.leaksReported>0&&a.push({category:"E",text:"Address refrigerant leaks immediately and implement preventive maintenance schedule."}),e.social.compensation.minWageCompliance||a.push({category:"S",text:"URGENT: Address minimum wage compliance immediately to avoid legal penalties."}),e.social.training.foodHandlerCert!=="all"&&a.push({category:"S",text:"Ensure all food handling staff obtain required certifications."}),e.social.training.harassmentTraining==="none"&&a.push({category:"S",text:"Implement mandatory anti-harassment training for all employees."}),e.social.safety.oshaIncidents>0&&a.push({category:"S",text:"Review and strengthen workplace safety protocols to prevent future incidents."}),e.governance.inspections.healthScore<90&&a.push({category:"G",text:"Target health inspection score of 90+ through staff training and facility improvements."}),e.governance.inspections.criticalViolations>0&&a.push({category:"G",text:"Remediate all critical violations before next scheduled inspection."}),e.governance.policies.employeeHandbook!=="current"&&a.push({category:"G",text:"Update employee handbook to reflect current policies and legal requirements."}),a.length===0?"":`
    <div class="report-section recommendations">
      <h2>Recommendations for Improvement</h2>
      <div class="recs-list">
        ${a.map(t=>`
          <div class="rec-item">
            <span class="rec-category">[${t.category}]</span>
            <span class="rec-text">${t.text}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `}function T(){const e=document.getElementById("report-format").value,a=y();let t,s,n;e==="json"?(t=JSON.stringify(a,null,2),s=`esg-report-${a.entity.legalName.replace(/\s+/g,"-").toLowerCase()}-${a.meta.reportingPeriod}.json`,n="application/json"):(t=`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ESG Compliance Report - ${a.entity.legalName}</title>
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
${h(a,document.getElementById("include-recommendations").value==="yes")}
</body>
</html>`,s=`esg-report-${a.entity.legalName.replace(/\s+/g,"-").toLowerCase()}-${a.meta.reportingPeriod}.html`,n="text/html");const i=new Blob([t],{type:n}),r=URL.createObjectURL(i),c=document.createElement("a");c.href=r,c.download=s,c.click(),URL.revokeObjectURL(r)}document.addEventListener("DOMContentLoaded",w);
