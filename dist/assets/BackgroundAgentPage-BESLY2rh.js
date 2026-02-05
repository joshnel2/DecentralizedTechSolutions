import{r as a,a6 as e,h as A}from"./vendor-DrKzkH4x.js";import{n as ws,m as Is,o as Es}from"./index-CCWWoMiH.js";import{x as V,ah as F,D as W,J as z,F as R,a$ as Qe,ao as Z,M as ee,z as Ne,a0 as Je,Z as le,b as J,X as re,S as oe,aT as je,f as Q,ad as As,L as M,R as Wt,a as ye,b0 as Ve,A as ve,b1 as Rs,as as Ls,b2 as Ds,ab as Yt,aa as Kt,b3 as Ps,b4 as Xt,Y as Qt,y as We,a4 as Jt,ay as Bs,q as Zt,b5 as es,C as Ye,n as Ke,T as Ms,a_ as ts,i as zs,b6 as Fs,Q as Os,s as Us,t as Hs}from"./icons-BtUkkwGS.js";import{u as qs,a as Gs}from"./router-CNLU_KyZ.js";import"./doc-parsers-U1nJMjtM.js";import"./react-dom-DfB-QKj2.js";import"./pdf-worker-CVmCB3lP.js";import"./state-72d44OIA.js";function Ce(){return"Notification"in window}async function $s(){return Ce()?Notification.permission==="granted"?"granted":Notification.permission!=="denied"?await Notification.requestPermission():Notification.permission:"denied"}function Vs(){return Ce()?Notification.permission:"unsupported"}function ss(_,c){if(!Ce()||Notification.permission!=="granted")return null;const f=new Notification(_,{body:c==null?void 0:c.body,icon:(c==null?void 0:c.icon)||"/apex-icon.png",tag:c==null?void 0:c.tag,requireInteraction:(c==null?void 0:c.requireInteraction)||!1,data:c==null?void 0:c.data});return c!=null&&c.onClick&&(f.onclick=()=>{var i;window.focus(),(i=c.onClick)==null||i.call(c),f.close()}),f}function Ws(_,c){const f=_.status==="completed"?"✅":_.status==="failed"?"❌":"⚠️",i=_.status==="completed"?"completed":_.status==="failed"?"failed":"cancelled";return ss(`${f} Task ${i}`,{body:_.goal.substring(0,100)+(_.goal.length>100?"...":""),tag:`task-${_.id}`,requireInteraction:_.status==="failed",data:{taskId:_.id},onClick:c})}function Ys(){const[_,c]=a.useState("default"),[f,i]=a.useState(!1);a.useEffect(()=>{i(Ce()),c(Vs())},[]);const N=a.useCallback(async()=>{const k=await $s();return c(k),k},[]),y=a.useCallback((k,L)=>ss(k,L),[]),w=a.useCallback((k,L)=>Ws(k,L),[]);return{isSupported:f,permission:_,isEnabled:_==="granted",requestPermission:N,notify:y,notifyTask:w}}const Ks="_overlay_1uxju_2",Xs="_fadeIn_1uxju_1",Qs="_modal_1uxju_20",Js="_slideUp_1uxju_1",Zs="_header_1uxju_44",en="_headerTitle_1uxju_52",tn="_closeBtn_1uxju_65",sn="_content_1uxju_80",nn="_searchBar_1uxju_87",an="_filters_1uxju_125",on="_complexityFilters_1uxju_130",rn="_complexityBtn_1uxju_135",ln="_active_1uxju_155",cn="_body_1uxju_161",dn="_sidebar_1uxju_168",mn="_categoryBtn_1uxju_178",un="_count_1uxju_208",pn="_templates_1uxju_217",gn="_noResults_1uxju_227",hn="_templateCard_1uxju_258",_n="_templateHeader_1uxju_276",xn="_templateIcon_1uxju_283",fn="_quick_1uxju_294",yn="_standard_1uxju_299",vn="_extended_1uxju_304",kn="_templateBadges_1uxju_309",jn="_popularBadge_1uxju_314",Nn="_newBadge_1uxju_325",Cn="_templateName_1uxju_336",bn="_templateDesc_1uxju_343",Tn="_templateMeta_1uxju_351",Sn="_templateComplexity_1uxju_358",wn="_templateTime_1uxju_381",In="_templateUse_1uxju_389",u={overlay:Ks,fadeIn:Xs,modal:Qs,slideUp:Js,header:Zs,headerTitle:en,closeBtn:tn,content:sn,searchBar:nn,filters:an,complexityFilters:on,complexityBtn:rn,active:ln,body:cn,sidebar:dn,categoryBtn:mn,count:un,templates:pn,noResults:gn,templateCard:hn,templateHeader:_n,templateIcon:xn,quick:fn,standard:yn,extended:vn,templateBadges:kn,popularBadge:jn,newBadge:Nn,templateName:Cn,templateDesc:bn,templateMeta:Tn,templateComplexity:Sn,templateTime:wn,templateUse:In},ke=[{id:"matter-audit",name:"Full Matter Audit",description:"Comprehensive review of all active matters with status report and action items",prompt:`Perform a comprehensive audit of ALL my active matters. For each matter:

1. Review current status and recent activity
2. Check for upcoming deadlines (next 30 days)
3. Identify any issues or concerns
4. Review billing status (unbilled time, outstanding invoices)
5. Check document completeness

Deliverables:
- Matter-by-matter status summary
- Prioritized action item list
- Deadline calendar
- Risk assessment

Take your time to be thorough.`,category:"matters",icon:V,estimatedTime:"~20-30 min",complexity:"extended",tags:["matters","audit","status","comprehensive"],popular:!0},{id:"matter-intake",name:"New Matter Intake Checklist",description:"Generate intake checklist for a new client matter",prompt:"Create a comprehensive intake checklist for a new matter. Include conflict check items, required documents, initial tasks, fee agreement requirements, and client communication templates.",category:"matters",icon:V,estimatedTime:"~5 min",complexity:"standard",tags:["matters","intake","checklist","new client"]},{id:"conflict-check",name:"Conflict Check Analysis",description:"Run conflict check against existing clients and matters",prompt:"Perform a conflict of interest check for [CLIENT NAME]. Search all existing clients, matters, and adverse parties. Flag any potential conflicts and explain the nature of each.",category:"matters",icon:F,estimatedTime:"~5-8 min",complexity:"standard",tags:["conflicts","ethics","intake"]},{id:"billing-review",name:"Weekly Billing Review",description:"Review time entries, identify unbilled work, prepare invoicing recommendations",prompt:`Complete weekly billing review:

1. Review all time entries from the past week
2. Improve narrative descriptions for billing clarity
3. Flag any entries that need attention or write-offs
4. Identify unbilled time by matter
5. Recommend matters ready for invoicing
6. Calculate estimated invoice amounts

Generate a billing-ready report.`,category:"billing",icon:W,estimatedTime:"~15-20 min",complexity:"extended",tags:["billing","time entries","invoicing","weekly"],popular:!0},{id:"invoice-drafts",name:"Draft Invoice Summaries",description:"Create professional invoice summaries for client billing",prompt:"Review unbilled time entries and draft professional invoice summaries for each matter ready for billing. Include executive summary, work performed, and value delivered.",category:"billing",icon:W,estimatedTime:"~10 min",complexity:"standard",tags:["invoicing","billing","summaries"]},{id:"wip-analysis",name:"WIP Analysis Report",description:"Analyze work-in-progress across all matters",prompt:"Generate a Work-in-Progress (WIP) analysis report. Show unbilled time and costs by matter, attorney, and practice area. Identify aged WIP and recommend billing priorities.",category:"billing",icon:z,estimatedTime:"~10-15 min",complexity:"extended",tags:["WIP","billing","analysis","aging"]},{id:"contract-review",name:"Contract Review & Risk Analysis",description:"Analyze contract for key terms, risks, and negotiation points",prompt:`Review the attached contract and provide:

1. Executive Summary (2-3 sentences)
2. Key Terms Analysis:
   - Payment terms
   - Termination provisions
   - Liability and indemnification
   - IP ownership
   - Confidentiality
3. Risk Assessment (High/Medium/Low for each area)
4. Recommended negotiation points
5. Missing or unusual clauses to address

Be thorough and attorney-ready.`,category:"documents",icon:R,estimatedTime:"~15-25 min",complexity:"extended",tags:["contracts","review","risk","analysis"],popular:!0},{id:"doc-summary",name:"Document Summary",description:"Summarize key points from any document",prompt:"Analyze the attached document and provide a comprehensive summary including: main purpose, key parties, important dates, obligations, and notable provisions.",category:"documents",icon:R,estimatedTime:"~5-8 min",complexity:"standard",tags:["documents","summary","analysis"]},{id:"discovery-index",name:"Discovery Document Index",description:"Create organized index of discovery documents",prompt:"Create a comprehensive index of discovery documents for [MATTER]. Categorize by document type, author, date, and relevance. Flag key documents and hot documents.",category:"documents",icon:R,estimatedTime:"~20-30 min",complexity:"extended",tags:["discovery","litigation","index","documents"]},{id:"legal-research",name:"Legal Research Memo",description:"Research a legal issue and draft findings memo",prompt:`Research the following legal issue and provide:

1. Issue Statement
2. Brief Answer
3. Facts (as provided)
4. Analysis:
   - Applicable law and statutes
   - Relevant case law
   - Application to facts
5. Conclusion
6. Recommendations

Include citations. Focus on [JURISDICTION] law.`,category:"research",icon:Qe,estimatedTime:"~20-30 min",complexity:"extended",tags:["research","legal memo","analysis"],popular:!0},{id:"case-law-search",name:"Case Law Search",description:"Find relevant cases on a specific legal issue",prompt:"Search for relevant case law on [LEGAL ISSUE]. Provide case names, citations, brief holdings, and relevance to our matter. Focus on recent decisions from [JURISDICTION].",category:"research",icon:Z,estimatedTime:"~10-15 min",complexity:"standard",tags:["research","case law","search"]},{id:"client-update",name:"Client Status Update",description:"Draft professional client update email",prompt:"Draft a professional client status update email for [MATTER]. Include: current status, recent developments, next steps, upcoming deadlines, and any required client action. Use clear, non-legal language.",category:"communication",icon:ee,estimatedTime:"~5 min",complexity:"quick",tags:["email","client","update","communication"],popular:!0},{id:"demand-letter",name:"Demand Letter Draft",description:"Draft professional demand letter",prompt:"Draft a professional demand letter for [MATTER]. Include: factual background, legal basis for claim, specific demands, deadline for response, and consequences of non-compliance. Maintain firm but professional tone.",category:"communication",icon:ee,estimatedTime:"~10-15 min",complexity:"standard",tags:["letter","demand","drafting"]},{id:"deadline-review",name:"Deadline Review",description:"Review and verify all upcoming deadlines",prompt:`Review all deadlines across my matters for the next 30 days:

1. List all deadlines by date
2. Verify court filing deadlines against court rules
3. Identify any conflicts or tight timelines
4. Flag matters needing immediate attention
5. Recommend preparation timeline for each

Generate a deadline calendar summary.`,category:"calendar",icon:Ne,estimatedTime:"~10-15 min",complexity:"standard",tags:["deadlines","calendar","court rules"],popular:!0},{id:"trial-prep",name:"Trial Preparation Outline",description:"Comprehensive trial preparation checklist and outline",prompt:`Create comprehensive trial preparation materials:

1. Trial Notebook Outline
2. Witness List with examination topics
3. Exhibit List with foundation requirements
4. Key themes and theory of the case
5. Opening statement outline
6. Closing argument themes
7. Motions in limine to file
8. Jury instruction requests

Take time to be thorough - this is for trial.`,category:"litigation",icon:F,estimatedTime:"~25-30 min",complexity:"extended",tags:["trial","litigation","preparation"]},{id:"deposition-outline",name:"Deposition Outline",description:"Create deposition examination outline",prompt:"Create a deposition outline for [WITNESS NAME] in [MATTER]. Include: background questions, key topic areas, document references, impeachment opportunities, and must-ask questions.",category:"litigation",icon:F,estimatedTime:"~15-20 min",complexity:"extended",tags:["deposition","litigation","outline"]},{id:"due-diligence",name:"Due Diligence Checklist",description:"Generate comprehensive due diligence checklist",prompt:"Create a comprehensive due diligence checklist for [TRANSACTION TYPE]. Include all relevant categories: corporate documents, contracts, IP, real estate, employment, litigation, financial, regulatory, environmental.",category:"transactional",icon:Je,estimatedTime:"~10-15 min",complexity:"standard",tags:["due diligence","M&A","checklist","transactional"]},{id:"quick-summary",name:"Quick Matter Summary",description:"Get a quick status on any matter",prompt:"Give me a quick status summary on [MATTER NAME] including: current status, last activity, upcoming deadlines, and key next steps.",category:"quick",icon:le,estimatedTime:"~2 min",complexity:"quick",tags:["quick","summary","status"],new:!0},{id:"email-draft",name:"Quick Email Draft",description:"Draft any type of professional email",prompt:"Draft a professional email to [RECIPIENT] regarding [SUBJECT]. [Add any specific points to include].",category:"quick",icon:ee,estimatedTime:"~2-3 min",complexity:"quick",tags:["email","quick","draft"]}],En=[{id:"all",label:"All Templates",icon:oe},{id:"popular",label:"Popular",icon:je},{id:"matters",label:"Matters",icon:V},{id:"billing",label:"Billing & Time",icon:W},{id:"documents",label:"Documents",icon:R},{id:"research",label:"Research",icon:Qe},{id:"communication",label:"Communication",icon:ee},{id:"calendar",label:"Calendar",icon:Ne},{id:"litigation",label:"Litigation",icon:F},{id:"transactional",label:"Transactional",icon:Je},{id:"quick",label:"Quick Tasks",icon:le}];function An({onSelect:_,onClose:c}){const[f,i]=a.useState(""),[N,y]=a.useState("all"),[w,k]=a.useState(null),L=a.useMemo(()=>ke.filter(l=>{const D=!f||l.name.toLowerCase().includes(f.toLowerCase())||l.description.toLowerCase().includes(f.toLowerCase())||l.tags.some(ce=>ce.toLowerCase().includes(f.toLowerCase())),j=N==="all"||(N==="popular"?l.popular:l.category===N),v=!w||l.complexity===w;return D&&j&&v}),[f,N,w]);return e.jsx("div",{className:u.overlay,onClick:c,children:e.jsxs("div",{className:u.modal,onClick:l=>l.stopPropagation(),children:[e.jsxs("div",{className:u.header,children:[e.jsxs("div",{className:u.headerTitle,children:[e.jsx(J,{size:22}),e.jsx("h2",{children:"Task Templates"})]}),e.jsx("button",{className:u.closeBtn,onClick:c,children:e.jsx(re,{size:20})})]}),e.jsxs("div",{className:u.content,children:[e.jsxs("div",{className:u.searchBar,children:[e.jsx(Z,{size:16}),e.jsx("input",{type:"text",placeholder:"Search templates...",value:f,onChange:l=>i(l.target.value),autoFocus:!0}),f&&e.jsx("button",{onClick:()=>i(""),children:e.jsx(re,{size:14})})]}),e.jsx("div",{className:u.filters,children:e.jsx("div",{className:u.complexityFilters,children:["quick","standard","extended"].map(l=>e.jsxs("button",{className:A(u.complexityBtn,w===l&&u.active),onClick:()=>k(w===l?null:l),children:[l==="quick"&&e.jsx(le,{size:12}),l==="standard"&&e.jsx(z,{size:12}),l==="extended"&&e.jsx(J,{size:12}),l]},l))})}),e.jsxs("div",{className:u.body,children:[e.jsx("div",{className:u.sidebar,children:En.map(l=>{const D=l.icon,j=l.id==="all"?ke.length:l.id==="popular"?ke.filter(v=>v.popular).length:ke.filter(v=>v.category===l.id).length;return e.jsxs("button",{className:A(u.categoryBtn,N===l.id&&u.active),onClick:()=>y(l.id),children:[e.jsx(D,{size:16}),e.jsx("span",{children:l.label}),e.jsx("span",{className:u.count,children:j})]},l.id)})}),e.jsxs("div",{className:u.templates,children:[L.length===0&&e.jsxs("div",{className:u.noResults,children:[e.jsx(Z,{size:24}),e.jsx("p",{children:"No templates found"}),e.jsx("button",{onClick:()=>{i(""),y("all"),k(null)},children:"Clear filters"})]}),L.map(l=>{const D=l.icon;return e.jsxs("button",{className:u.templateCard,onClick:()=>_(l),children:[e.jsxs("div",{className:u.templateHeader,children:[e.jsx("div",{className:A(u.templateIcon,u[l.complexity]),children:e.jsx(D,{size:18})}),e.jsxs("div",{className:u.templateBadges,children:[l.popular&&e.jsx("span",{className:u.popularBadge,children:"Popular"}),l.new&&e.jsx("span",{className:u.newBadge,children:"New"})]})]}),e.jsx("div",{className:u.templateName,children:l.name}),e.jsx("div",{className:u.templateDesc,children:l.description}),e.jsxs("div",{className:u.templateMeta,children:[e.jsx("span",{className:A(u.templateComplexity,u[l.complexity]),children:l.complexity}),e.jsxs("span",{className:u.templateTime,children:[e.jsx(z,{size:12}),l.estimatedTime]})]}),e.jsxs("div",{className:u.templateUse,children:["Use Template",e.jsx(Q,{size:14})]})]},l.id)})]})]})]})]})})}const Rn="_page_4r8n1_1",Ln="_header_4r8n1_6",Dn="_title_4r8n1_14",Pn="_refreshBtn_4r8n1_32",Bn="_alert_4r8n1_50",Mn="_grid_4r8n1_63",zn="_card_4r8n1_70",Fn="_highlighted_4r8n1_79",On="_highlightPulse_4r8n1_1",Un="_cardHeader_4r8n1_94",Hn="_taskForm_4r8n1_107",qn="_taskInput_4r8n1_113",Gn="_suggestions_4r8n1_129",$n="_suggestionsLabel_4r8n1_136",Vn="_suggestionChips_4r8n1_142",Wn="_suggestionChip_4r8n1_142",Yn="_taskOptions_4r8n1_170",Kn="_extendedMode_4r8n1_176",Xn="_extendedHint_4r8n1_192",Qn="_extendedModeToggle_4r8n1_198",Jn="_extendedModeActive_4r8n1_220",Zn="_pulse_4r8n1_1",ea="_extendedModeLabel_4r8n1_236",ta="_extendedModeTime_4r8n1_246",sa="_extendedModeInfo_4r8n1_256",na="_extendedTemplate_4r8n1_280",aa="_templateComplexity_4r8n1_290",ia="_extended_4r8n1_176",oa="_startBtnExtended_4r8n1_299",ra="_taskActions_4r8n1_305",la="_startBtn_4r8n1_299",ca="_taskHint_4r8n1_342",da="_textBtn_4r8n1_347",ma="_emptyState_4r8n1_355",ua="_task_4r8n1_107",pa="_fadeIn_4r8n1_1",ga="_taskHeader_4r8n1_383",ha="_taskGoal_4r8n1_389",_a="_taskStep_4r8n1_394",xa="_progressRow_4r8n1_399",fa="_progressBar_4r8n1_405",ya="_progressFill_4r8n1_424",va="_progressGradient_4r8n1_1",ka="_shimmer_4r8n1_1",ja="_active_4r8n1_470",Na="_progressPulse_4r8n1_1",Ca="_progressMeta_4r8n1_486",ba="_taskSummary_4r8n1_500",Ta="_completionCelebrate_4r8n1_1",Sa="_celebrateShine_4r8n1_1",wa="_summaryHeader_4r8n1_547",Ia="_summaryIcon_4r8n1_557",Ea="_checkBounce_4r8n1_1",Aa="_summaryContent_4r8n1_567",Ra="_summaryMeta_4r8n1_575",La="_taskError_4r8n1_590",Da="_taskList_4r8n1_608",Pa="_taskRow_4r8n1_614",Ba="_taskGoalSmall_4r8n1_628",Ma="_taskMeta_4r8n1_633",za="_summaryBlock_4r8n1_638",Fa="_summaryGoal_4r8n1_644",Oa="_summaryText_4r8n1_649",Ua="_toolGrid_4r8n1_654",Ha="_toolCategory_4r8n1_660",qa="_toolHeader_4r8n1_674",Ga="_cancelBtn_4r8n1_683",$a="_complete_4r8n1_701",Va="_error_4r8n1_705",Wa="_cancelled_4r8n1_709",Ya="_running_4r8n1_713",Ka="_spin_4r8n1_717",Xa="_liveActivitySection_4r8n1_727",Qa="_liveActivityHeader_4r8n1_738",Ja="_streamingIndicator_4r8n1_754",Za="_liveGlow_4r8n1_1",ei="_connectingIndicator_4r8n1_777",ti="_reconnectingIndicator_4r8n1_786",si="_liveActivityFeed_4r8n1_800",ni="_liveEventItem_4r8n1_809",ai="_slideInEvent_4r8n1_1",ii="_milestone_4r8n1_829",oi="_action_4r8n1_835",ri="_warning_4r8n1_840",li="_liveEventTime_4r8n1_855",ci="_liveEventMessage_4r8n1_863",di="_thinkingIndicator_4r8n1_878",mi="_thinkingPulse_4r8n1_1",ui="_thinkingDots_4r8n1_892",pi="_thinkingDot_4r8n1_892",gi="_dotBounce_4r8n1_1",hi="_followUpSection_4r8n1_957",_i="_followUpHeader_4r8n1_965",xi="_followUpForm_4r8n1_976",fi="_followUpInput_4r8n1_982",yi="_followUpBtn_4r8n1_1008",vi="_followUpError_4r8n1_1031",ki="_feedbackBtn_4r8n1_1038",ji="_feedbackThanks_4r8n1_1059",Ni="_modalOverlay_4r8n1_1072",Ci="_feedbackModal_4r8n1_1084",bi="_modalHeader_4r8n1_1095",Ti="_modalClose_4r8n1_1110",Si="_modalBody_4r8n1_1129",wi="_ratingSection_4r8n1_1136",Ii="_starRating_4r8n1_1147",Ei="_starBtn_4r8n1_1153",Ai="_starActive_4r8n1_1166",Ri="_ratingLabel_4r8n1_1170",Li="_feedbackField_4r8n1_1177",Di="_feedbackTextarea_4r8n1_1189",Pi="_feedbackHint_4r8n1_1212",Bi="_modalFooter_4r8n1_1217",Mi="_modalCancelBtn_4r8n1_1225",zi="_modalSubmitBtn_4r8n1_1241",Fi="_templatesToggle_4r8n1_1267",Oi="_templatesPanel_4r8n1_1288",Ui="_templatesPanelHeader_4r8n1_1296",Hi="_templatesGrid_4r8n1_1313",qi="_templateCard_4r8n1_1319",Gi="_templateIcon_4r8n1_1338",$i="_templateContent_4r8n1_1350",Vi="_templateName_4r8n1_1355",Wi="_templateDesc_4r8n1_1362",Yi="_templateMeta_4r8n1_1369",Ki="_templateTime_4r8n1_1375",Xi="_low_4r8n1_1391",Qi="_medium_4r8n1_1396",Ji="_high_4r8n1_79",Zi="_estimatedTime_4r8n1_1407",eo="_taskCount_4r8n1_1424",to="_historyFilters_4r8n1_1430",so="_historySearch_4r8n1_1438",no="_clearSearch_4r8n1_1467",ao="_statusFilter_4r8n1_1485",io="_taskRowMain_4r8n1_1501",oo="_taskStatusIcon_4r8n1_1509",ro="_taskRowContent_4r8n1_1514",lo="_taskRowMeta_4r8n1_1519",co="_taskStatusBadge_4r8n1_1526",mo="_completed_4r8n1_1534",uo="_failed_4r8n1_1539",po="_taskIterations_4r8n1_1554",go="_taskRowProgress_4r8n1_1559",ho="_capabilitiesCard_4r8n1_1567",_o="_capabilitiesHeader_4r8n1_1575",xo="_capabilitiesTitle_4r8n1_1579",fo="_capabilitiesGrid_4r8n1_1604",yo="_capabilityCategory_4r8n1_1610",vo="_capabilityIcon_4r8n1_1625",ko="_capabilityInfo_4r8n1_1637",jo="_toolsDetails_4r8n1_1666",No="_toolsSummary_4r8n1_1672",Co="_toolCount_4r8n1_1699",bo="_learningCard_4r8n1_1712",To="_learningHeader_4r8n1_1720",So="_learningTitle_4r8n1_1733",wo="_learningStats_4r8n1_1756",Io="_statBadge_4r8n1_1762",Eo="_expandBtn_4r8n1_1774",Ao="_learningContent_4r8n1_1789",Ro="_slideDown_4r8n1_1",Lo="_privacyNotice_4r8n1_1805",Do="_learningsList_4r8n1_1828",Po="_learningsListHeader_4r8n1_1832",Bo="_noLearnings_4r8n1_1850",Mo="_learningHint_4r8n1_1863",zo="_learningItems_4r8n1_1870",Fo="_learningItem_4r8n1_1870",Oo="_learningInsight_4r8n1_1892",Uo="_learningType_4r8n1_1900",Ho="_usageCount_4r8n1_1911",qo="_personalizationTips_4r8n1_1919",Go="_tipsGrid_4r8n1_1931",$o="_tipCard_4r8n1_1937",Vo="_suggestionsCard_4r8n1_1972",Wo="_suggestionsHeader_4r8n1_1980",Yo="_suggestionsTitle_4r8n1_1989",Ko="_suggestionsBadge_4r8n1_1998",Xo="_dismissSuggestions_4r8n1_2007",Qo="_suggestionsList_4r8n1_2022",Jo="_suggestionItem_4r8n1_2029",Zo="_priorityHigh_4r8n1_2045",er="_priorityMedium_4r8n1_2049",tr="_priorityLow_4r8n1_2053",sr="_suggestionIcon_4r8n1_2057",nr="_suggestionContent_4r8n1_2079",ar="_suggestionItemTitle_4r8n1_2084",ir="_suggestionDesc_4r8n1_2091",or="_suggestionAction_4r8n1_2097",rr="_scheduledCard_4r8n1_2119",lr="_scheduledHeader_4r8n1_2127",cr="_scheduledTitle_4r8n1_2136",dr="_addScheduleBtn_4r8n1_2145",mr="_scheduledList_4r8n1_2163",ur="_scheduledItem_4r8n1_2170",pr="_scheduledDisabled_4r8n1_2186",gr="_scheduledInfo_4r8n1_2190",hr="_scheduledName_4r8n1_2194",_r="_scheduledMeta_4r8n1_2201",xr="_scheduledNext_4r8n1_2213",fr="_scheduledActions_4r8n1_2219",yr="_scheduledToggle_4r8n1_2224",vr="_enabled_4r8n1_2238",kr="_scheduledRun_4r8n1_2244",jr="_toolConfirmModal_4r8n1_2264",Nr="_toolConfirmContent_4r8n1_2275",Cr="_toolConfirmHeader_4r8n1_2284",br="_toolConfirmBody_4r8n1_2302",Tr="_toolConfirmName_4r8n1_2306",Sr="_toolConfirmDesc_4r8n1_2313",wr="_toolConfirmParams_4r8n1_2319",Ir="_toolConfirmImpact_4r8n1_2344",Er="_toolConfirmActions_4r8n1_2356",Ar="_toolConfirmCancel_4r8n1_2364",Rr="_toolConfirmApprove_4r8n1_2378",Lr="_pauseBtn_4r8n1_2398",Dr="_paused_4r8n1_2416",Pr="_taskControlButtons_4r8n1_2451",Br="_cardHeaderRight_4r8n1_2466",Mr="_exportBtn_4r8n1_2473",zr="_quickStats_4r8n1_2490",Fr="_quickStat_4r8n1_2490",Or="_quickStatValue_4r8n1_2506",Ur="_quickStatLabel_4r8n1_2512",Hr="_taskAnalysisCard_4r8n1_2530",qr="_analyzingState_4r8n1_2538",Gr="_analysisHeader_4r8n1_2546",$r="_complexityBadge_4r8n1_2556",Vr="_complexitySimple_4r8n1_2566",Wr="_complexityModerate_4r8n1_2571",Yr="_complexityComplex_4r8n1_2576",Kr="_analysisBody_4r8n1_2581",Xr="_analysisRow_4r8n1_2587",Qr="_analysisLabel_4r8n1_2593",Jr="_analysisValue_4r8n1_2598",Zr="_analysisTools_4r8n1_2604",el="_toolTags_4r8n1_2610",tl="_toolTag_4r8n1_2610",sl="_toolTagMore_4r8n1_2627",nl="_analysisIssues_4r8n1_2635",al="_issueItem_4r8n1_2645",il="_analysisApproach_4r8n1_2658",ol="_confidenceBar_4r8n1_2678",rl="_confidenceLabel_4r8n1_2688",ll="_confidenceTrack_4r8n1_2694",cl="_confidenceFill_4r8n1_2702",dl="_confidenceValue_4r8n1_2720",ml="_followUpSuggestions_4r8n1_2729",ul="_followUpList_4r8n1_2747",pl="_followUpItem_4r8n1_2753",gl="_suggestedFollowUps_4r8n1_2780",hl="_suggestedFollowUpsHeader_4r8n1_2786",_l="_suggestedFollowUpsList_4r8n1_2796",xl="_suggestedFollowUpItem_4r8n1_2802",fl="_headerActions_4r8n1_2830",yl="_notifyBtn_4r8n1_2837",vl="_notifyEnabled_4r8n1_2856",kl="_templatesLibraryBtn_4r8n1_2867",jl="_configAlert_4r8n1_2887",Nl="_alertHeader_4r8n1_2895",Cl="_alertSteps_4r8n1_2916",bl="_alertHint_4r8n1_2948",t={page:Rn,header:Ln,title:Dn,refreshBtn:Pn,alert:Bn,grid:Mn,card:zn,highlighted:Fn,highlightPulse:On,cardHeader:Un,taskForm:Hn,taskInput:qn,suggestions:Gn,suggestionsLabel:$n,suggestionChips:Vn,suggestionChip:Wn,taskOptions:Yn,extendedMode:Kn,extendedHint:Xn,extendedModeToggle:Qn,extendedModeActive:Jn,pulse:Zn,extendedModeLabel:ea,extendedModeTime:ta,extendedModeInfo:sa,extendedTemplate:na,templateComplexity:aa,extended:ia,startBtnExtended:oa,taskActions:ra,startBtn:la,taskHint:ca,textBtn:da,emptyState:ma,task:ua,fadeIn:pa,taskHeader:ga,taskGoal:ha,taskStep:_a,progressRow:xa,progressBar:fa,progressFill:ya,progressGradient:va,shimmer:ka,active:ja,progressPulse:Na,progressMeta:Ca,taskSummary:ba,completionCelebrate:Ta,celebrateShine:Sa,summaryHeader:wa,summaryIcon:Ia,checkBounce:Ea,summaryContent:Aa,summaryMeta:Ra,taskError:La,taskList:Da,taskRow:Pa,taskGoalSmall:Ba,taskMeta:Ma,summaryBlock:za,summaryGoal:Fa,summaryText:Oa,toolGrid:Ua,toolCategory:Ha,toolHeader:qa,cancelBtn:Ga,complete:$a,error:Va,cancelled:Wa,running:Ya,spin:Ka,liveActivitySection:Xa,liveActivityHeader:Qa,streamingIndicator:Ja,liveGlow:Za,connectingIndicator:ei,reconnectingIndicator:ti,liveActivityFeed:si,liveEventItem:ni,slideInEvent:ai,milestone:ii,action:oi,warning:ri,liveEventTime:li,liveEventMessage:ci,thinkingIndicator:di,thinkingPulse:mi,thinkingDots:ui,thinkingDot:pi,dotBounce:gi,followUpSection:hi,followUpHeader:_i,followUpForm:xi,followUpInput:fi,followUpBtn:yi,followUpError:vi,feedbackBtn:ki,feedbackThanks:ji,modalOverlay:Ni,feedbackModal:Ci,modalHeader:bi,modalClose:Ti,modalBody:Si,ratingSection:wi,starRating:Ii,starBtn:Ei,starActive:Ai,ratingLabel:Ri,feedbackField:Li,feedbackTextarea:Di,feedbackHint:Pi,modalFooter:Bi,modalCancelBtn:Mi,modalSubmitBtn:zi,templatesToggle:Fi,templatesPanel:Oi,templatesPanelHeader:Ui,templatesGrid:Hi,templateCard:qi,templateIcon:Gi,templateContent:$i,templateName:Vi,templateDesc:Wi,templateMeta:Yi,templateTime:Ki,low:Xi,medium:Qi,high:Ji,estimatedTime:Zi,taskCount:eo,historyFilters:to,historySearch:so,clearSearch:no,statusFilter:ao,taskRowMain:io,taskStatusIcon:oo,taskRowContent:ro,taskRowMeta:lo,taskStatusBadge:co,completed:mo,failed:uo,taskIterations:po,taskRowProgress:go,capabilitiesCard:ho,capabilitiesHeader:_o,capabilitiesTitle:xo,capabilitiesGrid:fo,capabilityCategory:yo,capabilityIcon:vo,capabilityInfo:ko,toolsDetails:jo,toolsSummary:No,toolCount:Co,learningCard:bo,learningHeader:To,learningTitle:So,learningStats:wo,statBadge:Io,expandBtn:Eo,learningContent:Ao,slideDown:Ro,privacyNotice:Lo,learningsList:Do,learningsListHeader:Po,noLearnings:Bo,learningHint:Mo,learningItems:zo,learningItem:Fo,learningInsight:Oo,learningType:Uo,usageCount:Ho,personalizationTips:qo,tipsGrid:Go,tipCard:$o,suggestionsCard:Vo,suggestionsHeader:Wo,suggestionsTitle:Yo,suggestionsBadge:Ko,dismissSuggestions:Xo,suggestionsList:Qo,suggestionItem:Jo,priorityHigh:Zo,priorityMedium:er,priorityLow:tr,suggestionIcon:sr,suggestionContent:nr,suggestionItemTitle:ar,suggestionDesc:ir,suggestionAction:or,scheduledCard:rr,scheduledHeader:lr,scheduledTitle:cr,addScheduleBtn:dr,scheduledList:mr,scheduledItem:ur,scheduledDisabled:pr,scheduledInfo:gr,scheduledName:hr,scheduledMeta:_r,scheduledNext:xr,scheduledActions:fr,scheduledToggle:yr,enabled:vr,scheduledRun:kr,toolConfirmModal:jr,toolConfirmContent:Nr,toolConfirmHeader:Cr,toolConfirmBody:br,toolConfirmName:Tr,toolConfirmDesc:Sr,toolConfirmParams:wr,toolConfirmImpact:Ir,toolConfirmActions:Er,toolConfirmCancel:Ar,toolConfirmApprove:Rr,pauseBtn:Lr,paused:Dr,taskControlButtons:Pr,cardHeaderRight:Br,exportBtn:Mr,quickStats:zr,quickStat:Fr,quickStatValue:Or,quickStatLabel:Ur,taskAnalysisCard:Hr,analyzingState:qr,analysisHeader:Gr,complexityBadge:$r,complexitySimple:Vr,complexityModerate:Wr,complexityComplex:Yr,analysisBody:Kr,analysisRow:Xr,analysisLabel:Qr,analysisValue:Jr,analysisTools:Zr,toolTags:el,toolTag:tl,toolTagMore:sl,analysisIssues:nl,issueItem:al,analysisApproach:il,confidenceBar:ol,confidenceLabel:rl,confidenceTrack:ll,confidenceFill:cl,confidenceValue:dl,followUpSuggestions:ml,followUpList:ul,followUpItem:pl,suggestedFollowUps:gl,suggestedFollowUpsHeader:hl,suggestedFollowUpsList:_l,suggestedFollowUpItem:xl,headerActions:fl,notifyBtn:yl,notifyEnabled:vl,templatesLibraryBtn:kl,configAlert:jl,alertHeader:Nl,alertSteps:Cl,alertHint:bl},Xe=(_,c=0)=>{const f=typeof _=="number"&&Number.isFinite(_)?_:c;return Math.min(100,Math.max(0,f))},E=ws;function Gl(){var Ft,Ot,Ut,Ht,qt,Gt,$t;const _=qs();Gs();const[c,f]=a.useState(null),[i,N]=a.useState(null),[y,w]=a.useState([]),[k,L]=a.useState(null),[l,D]=a.useState(null),[j,v]=a.useState(""),[ce,be]=a.useState(null),[Ze,et]=a.useState(!0),[tt,Tl]=a.useState(!0),[Te,st]=a.useState(!1),[Se,nt]=a.useState(!1),[we,H]=a.useState([]),[Sl,te]=a.useState(!1),[Ie,O]=a.useState("disconnected"),[at,se]=a.useState(0),P=a.useRef(null),q=a.useRef(null),de=a.useRef(null),Ee=5,[Ae,it]=a.useState(""),[me,ot]=a.useState(!1),[rt,lt]=a.useState(null),[b,G]=a.useState(!1),[ct,Re]=a.useState([]),[wl,ns]=a.useState(!1),[Il,El]=a.useState({name:"",schedule:"weekly",day:"friday",time:"16:00"}),[Le,dt]=a.useState([]),[Al,mt]=a.useState(!1),[as,is]=a.useState(!0),[Y,ut]=a.useState(null),[pt,gt]=a.useState(null),[ue,os]=a.useState(!1),[ht,_t]=a.useState(!1),[C,pe]=a.useState(null),[Rl,Ll]=a.useState([]),[Dl,Pl]=a.useState(0),{isSupported:rs,requestPermission:xt,notifyTask:ls}=Ys(),[ne,ft]=a.useState(!1),cs=a.useCallback(async()=>{const s=await xt();ft(s==="granted")},[xt]),[ds,De]=a.useState(!1),ms=a.useCallback(s=>{v(s.prompt),G(s.complexity==="extended"),De(!1),ge(!1)},[]),[Pe,yt]=a.useState(null),vt=a.useRef(null),kt=[{id:"new-matter-intake",name:"New Matter Intake",description:"Set up a new matter with all required tasks, deadlines, and initial documents",icon:V,estimatedTime:"~5 min",complexity:"medium",prompt:"Create a complete new matter intake workflow: set up initial tasks checklist, identify key deadlines including statute of limitations, create client communication templates, and generate a matter summary memo.",tags:["matters","intake","tasks"],extended:!1},{id:"document-review",name:"Quick Document Analysis",description:"Review and summarize documents for a single matter",icon:R,estimatedTime:"~3 min",complexity:"low",prompt:"Review and analyze all documents in the current matter. Create a summary of each document, identify key terms and dates, flag any potential issues or missing documents, and generate a matter document index.",tags:["documents","analysis","review"],extended:!1},{id:"client-communication",name:"Client Update Prep",description:"Prepare client status updates and communication drafts",icon:We,estimatedTime:"~3 min",complexity:"low",prompt:"Prepare client communication materials: summarize recent activity on all active matters, draft status update emails, identify matters that need client contact, and create a client call preparation sheet.",tags:["clients","communication","emails"],extended:!1},{id:"time-entry-cleanup",name:"Time Entry Cleanup",description:"Review and improve time entry descriptions for billing",icon:z,estimatedTime:"~4 min",complexity:"low",prompt:"Review my recent time entries from the last 7 days. Improve vague descriptions to be more detailed and billable-friendly, flag any entries that might be questioned by clients, and identify any unbilled work that should be recorded.",tags:["billing","time","cleanup"],extended:!1},{id:"matter-status-check",name:"Matter Status Check",description:"Quick health check on all active matters",icon:V,estimatedTime:"~3 min",complexity:"low",prompt:"Do a quick status check on all my active matters: identify any with no activity in the past 2 weeks, list matters with upcoming deadlines in 7 days, flag any matters missing key documents, and note which clients are waiting on something from us.",tags:["matters","status","health"],extended:!1},{id:"conflict-check",name:"Conflict Check",description:"Run conflict check for a new matter or client",icon:Jt,estimatedTime:"~3 min",complexity:"medium",prompt:"Run a comprehensive conflict check: search all existing clients and matters for potential conflicts with the named parties. Check opposing parties, related entities, and any previously adverse parties. Generate a conflict report with findings.",tags:["conflicts","intake","compliance"],extended:!1},{id:"email-draft",name:"Draft Email",description:"Draft a professional email for a matter",icon:ee,estimatedTime:"~2 min",complexity:"low",prompt:"Draft a professional email based on the context provided. Use appropriate legal tone, be clear and concise, and include any necessary attachments or follow-up action items.",tags:["email","communication","drafting"],extended:!1},{id:"invoice-prep",name:"Invoice Preparation",description:"Prepare matters for invoicing with summaries",icon:W,estimatedTime:"~5 min",complexity:"medium",prompt:"Identify all matters with unbilled time ready for invoicing. For each matter, summarize the work performed, calculate the total amount, flag any time entries that need review before billing, and draft invoice cover letters.",tags:["billing","invoices","financial"],extended:!1},{id:"full-matter-audit",name:"🚀 Full Matter Audit",description:"Deep analysis of all matters: documents, deadlines, billing, and action items",icon:V,estimatedTime:"~20-30 min",complexity:"extended",prompt:`EXTENDED TASK - Take your time and be thorough:

1. MATTER REVIEW (all active matters):
   - List each matter with status, key dates, and recent activity
   - Identify matters needing immediate attention
   - Flag any matters with stale activity (no updates in 30+ days)

2. DEADLINE AUDIT:
   - Check all upcoming deadlines in next 90 days
   - Verify statute of limitations for each matter
   - Identify any missing critical dates
   - Create prioritized deadline calendar

3. DOCUMENT ANALYSIS:
   - Review documents across all matters
   - Identify missing documents by matter type
   - Flag documents needing attention
   - Create document index per matter

4. BILLING STATUS:
   - Unbilled time per matter
   - Time entries needing better descriptions
   - Matters ready for invoicing
   - WIP aging analysis

5. ACTION ITEMS:
   - Generate specific action items per matter
   - Prioritize by urgency and importance
   - Assign recommended due dates

Take up to 30 minutes. Be thorough. This is a comprehensive audit.`,tags:["audit","matters","comprehensive"],extended:!0},{id:"monthly-billing-review",name:"🚀 Monthly Billing Deep Dive",description:"Comprehensive billing review with time optimization and invoice prep",icon:W,estimatedTime:"~15-20 min",complexity:"extended",prompt:`EXTENDED BILLING TASK - Comprehensive monthly review:

1. TIME ENTRY ANALYSIS:
   - Review ALL time entries from the past 30 days
   - Identify entries with poor descriptions - suggest improvements
   - Flag entries that may need to be written off
   - Check for unbilled time that should be billed

2. INVOICE PREPARATION:
   - Identify matters ready for invoicing
   - Calculate unbilled amounts per client
   - Draft invoice summaries
   - Recommend billing approach (monthly, milestone, etc.)

3. BILLING EFFICIENCY:
   - Analyze time by matter type
   - Identify most profitable practice areas
   - Suggest billing rate optimizations
   - Find potential write-off patterns

4. CLIENT BILLING HEALTH:
   - Aging receivables analysis
   - Clients with outstanding balances
   - Payment pattern analysis
   - Collection recommendations

5. FINAL REPORT:
   - Executive summary of billing status
   - Key metrics and trends
   - Recommended actions
   - Priority items for follow-up

Take 15-20 minutes. Be thorough with billing analysis.`,tags:["billing","invoices","time","financial"],extended:!0},{id:"litigation-prep",name:"🚀 Litigation Case Prep",description:"Full case analysis: facts, issues, research, strategy, and timeline",icon:F,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED LITIGATION PREP - Comprehensive case analysis:

1. CASE FACTS:
   - Compile all known facts from documents and notes
   - Create chronological timeline of events
   - Identify disputed vs. undisputed facts
   - Note gaps in factual record

2. LEGAL ISSUES:
   - Identify all legal issues (claims, defenses)
   - Research applicable law and standards
   - Find relevant NY CPLR requirements
   - Note any jurisdictional considerations

3. EVIDENCE ANALYSIS:
   - Review all available evidence
   - Identify what supports/undermines each claim
   - Note evidence gaps and discovery needs
   - Categorize by admissibility concerns

4. STRENGTHS & WEAKNESSES:
   - Honest assessment of case strength
   - Key vulnerabilities to address
   - Opposing party's likely arguments
   - Risk factors

5. STRATEGY RECOMMENDATIONS:
   - Litigation vs. settlement analysis
   - Recommended approach
   - Key deadlines and milestones
   - Estimated timeline and resources needed

6. DELIVERABLES:
   - Case assessment memo
   - Litigation timeline
   - Discovery checklist
   - Strategy summary

Take up to 30 minutes. This should be thorough enough for a partner review.`,tags:["litigation","strategy","legal research"],extended:!0},{id:"contract-deep-review",name:"🚀 Contract Deep Review",description:"Thorough contract analysis with issue spotting and redline suggestions",icon:R,estimatedTime:"~20-25 min",complexity:"extended",prompt:`EXTENDED CONTRACT REVIEW - Comprehensive analysis:

1. CONTRACT OVERVIEW:
   - Identify parties, term, and type of agreement
   - Key business terms summary
   - Renewal/termination provisions

2. CRITICAL CLAUSES:
   - Indemnification provisions - analyze scope and risk
   - Limitation of liability - assess adequacy
   - Insurance requirements
   - Termination rights and triggers
   - IP ownership and licensing

3. RISK ANALYSIS:
   - High-risk provisions (score each)
   - Missing protective language
   - One-sided terms favoring counterparty
   - Potential liability exposure

4. COMPLIANCE CHECK:
   - Regulatory requirements
   - Data privacy provisions (if applicable)
   - Employment law considerations
   - Industry-specific requirements

5. NEGOTIATION POINTS:
   - Must-have changes
   - Nice-to-have improvements
   - Fallback positions
   - Deal-breakers

6. DELIVERABLES:
   - Executive summary for client
   - Detailed issue list with page/section refs
   - Suggested redline language
   - Risk rating (Low/Medium/High)

Take 20-25 minutes for a thorough review.`,tags:["contracts","review","transactional"],extended:!0},{id:"discovery-prep",name:"🚀 Discovery Package Prep",description:"Prepare complete discovery requests and responses",icon:R,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED DISCOVERY TASK - Complete discovery package:

1. INTERROGATORIES:
   - Draft comprehensive interrogatories (limit: 25 per NY CPLR)
   - Cover all elements of claims/defenses
   - Include contention interrogatories
   - Request identification of witnesses and documents

2. DOCUMENT REQUESTS:
   - Draft document demands covering all relevant categories
   - Include electronic discovery requests (ESI)
   - Request communications, agreements, financials
   - Cover social media and metadata

3. REQUESTS FOR ADMISSION:
   - Draft RFAs to narrow disputed facts
   - Target key legal and factual issues
   - Include authenticity requests for documents

4. DEPOSITION NOTICES:
   - Identify key witnesses for deposition
   - Draft deposition notices with document requests
   - Create deposition outline for each witness
   - Prioritize by importance to case

5. DISCOVERY RESPONSES (if responding):
   - Review opposing discovery requests
   - Draft objections where appropriate
   - Identify responsive documents
   - Prepare privilege log entries

6. DELIVERABLES:
   - Complete interrogatory set
   - Document request set
   - RFA set
   - Deposition notices and outlines
   - Timeline for discovery deadlines

Take up to 30 minutes. Make these litigation-ready.`,tags:["discovery","litigation","depositions"],extended:!0},{id:"deposition-prep",name:"🚀 Deposition Preparation",description:"Full deposition prep: outline, exhibits, and cross-examination",icon:We,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED DEPOSITION PREP - Complete witness preparation:

1. WITNESS BACKGROUND:
   - Review all documents mentioning witness
   - Compile prior testimony/statements
   - Research witness background
   - Identify potential bias or credibility issues

2. EXAMINATION OUTLINE:
   - Create detailed topic outline
   - Draft key questions for each topic
   - Plan impeachment questions
   - Include follow-up questions for likely answers

3. EXHIBIT PREPARATION:
   - Identify all exhibits to use
   - Create exhibit list with descriptions
   - Plan order of exhibit introduction
   - Prepare document comparison questions

4. KEY AREAS TO COVER:
   - Establish foundation facts
   - Lock in favorable testimony
   - Explore weaknesses in opposing case
   - Preserve testimony for trial/summary judgment

5. POTENTIAL PROBLEMS:
   - Anticipate objections
   - Identify sensitive topics
   - Plan for evasive answers
   - Prepare redirect areas (if defending)

6. DELIVERABLES:
   - Detailed deposition outline
   - Exhibit list and binder index
   - Key questions cheat sheet
   - Impeachment document references

Take up to 30 minutes. This should be ready for tomorrow's deposition.`,tags:["deposition","litigation","witness"],extended:!0},{id:"motion-practice",name:"🚀 Motion Drafting",description:"Draft motion with memorandum of law and supporting documents",icon:F,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED MOTION TASK - Complete motion package:

1. MOTION TYPE ANALYSIS:
   - Identify appropriate motion type
   - Review procedural requirements (NY CPLR)
   - Check timing and deadline requirements
   - Verify proper court and venue

2. LEGAL RESEARCH:
   - Research applicable legal standards
   - Find controlling precedent
   - Identify favorable case law
   - Distinguish unfavorable cases

3. MEMORANDUM OF LAW:
   - Statement of facts
   - Procedural history
   - Legal argument with headings
   - Analysis of elements/factors
   - Application to facts
   - Conclusion and relief requested

4. SUPPORTING DOCUMENTS:
   - Draft attorney affirmation
   - Identify necessary exhibits
   - Prepare proposed order
   - Create exhibit list

5. OPPOSITION ANTICIPATION:
   - Predict opposing arguments
   - Prepare counter-arguments
   - Address weaknesses proactively

6. DELIVERABLES:
   - Notice of motion
   - Memorandum of law
   - Attorney affirmation
   - Proposed order
   - Exhibit list

Take up to 30 minutes. Make this filing-ready.`,tags:["motion","litigation","legal writing"],extended:!0},{id:"client-intake",name:"🚀 New Client Intake & Evaluation",description:"Complete new client setup: conflicts, engagement, and case evaluation",icon:Bs,estimatedTime:"~20-25 min",complexity:"extended",prompt:`EXTENDED INTAKE TASK - Complete new client onboarding:

1. CONFLICT CHECK:
   - Search all parties against existing clients
   - Check adverse parties
   - Review related entities and individuals
   - Document conflict analysis

2. CASE EVALUATION:
   - Analyze facts and legal issues
   - Assess liability and damages
   - Evaluate statute of limitations
   - Estimate case value range

3. ENGAGEMENT SETUP:
   - Determine fee arrangement (hourly, contingency, flat)
   - Calculate retainer amount
   - Draft engagement letter
   - Identify scope limitations

4. MATTER CREATION:
   - Set up matter with all fields
   - Create initial task list
   - Set key deadlines
   - Assign team members

5. INITIAL DOCUMENTS:
   - Request list for client
   - Authorization forms needed
   - Preservation letters to draft
   - Initial correspondence

6. DELIVERABLES:
   - Conflict check memo
   - Case evaluation summary
   - Draft engagement letter
   - Initial task checklist
   - Document request list

Take 20-25 minutes. Get this client properly onboarded.`,tags:["intake","new client","conflicts"],extended:!0},{id:"due-diligence",name:"🚀 Due Diligence Review",description:"Corporate transaction due diligence checklist and analysis",icon:Z,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED DUE DILIGENCE - Comprehensive transaction review:

1. CORPORATE DOCUMENTS:
   - Review formation documents
   - Check good standing certificates
   - Analyze organizational structure
   - Review board/shareholder minutes

2. CONTRACTS & AGREEMENTS:
   - Material contracts review
   - Assignment/change of control provisions
   - Termination rights
   - Key customer/vendor agreements

3. EMPLOYMENT MATTERS:
   - Employment agreements
   - Non-compete/NDA review
   - Benefits and compensation
   - Pending employment claims

4. INTELLECTUAL PROPERTY:
   - IP ownership verification
   - Patent/trademark status
   - License agreements
   - IP litigation or disputes

5. LITIGATION & LIABILITIES:
   - Pending/threatened litigation
   - Regulatory matters
   - Environmental issues
   - Tax liabilities

6. FINANCIAL REVIEW:
   - Financial statement analysis
   - Debt obligations
   - Accounts receivable aging
   - Material contingencies

7. DELIVERABLES:
   - Due diligence checklist (completed)
   - Issue summary with risk ratings
   - Outstanding items list
   - Recommendation memo

Take up to 30 minutes. Flag all material issues.`,tags:["due diligence","transactional","M&A"],extended:!0},{id:"real-estate-closing",name:"🚀 Real Estate Closing Prep",description:"Complete closing checklist, title review, and document preparation",icon:Je,estimatedTime:"~20-25 min",complexity:"extended",prompt:`EXTENDED REAL ESTATE TASK - Closing preparation:

1. TITLE REVIEW:
   - Review title commitment/report
   - Identify all exceptions
   - Check for liens and encumbrances
   - Verify legal description

2. SURVEY REVIEW:
   - Review survey for encroachments
   - Check easements
   - Verify boundaries
   - Note any issues

3. CONTRACT COMPLIANCE:
   - Review all contract contingencies
   - Verify conditions satisfied
   - Check for outstanding items
   - Calculate prorations

4. CLOSING DOCUMENTS:
   - Prepare/review deed
   - Settlement statement review
   - Transfer tax calculations
   - Entity authorization documents

5. DUE DILIGENCE ITEMS:
   - Zoning compliance
   - Certificate of occupancy
   - Environmental concerns
   - HOA/condo documents

6. DELIVERABLES:
   - Title objection letter (if needed)
   - Closing checklist with status
   - Document preparation list
   - Closing statement review
   - Wire instructions verification

Take 20-25 minutes. Get this closing-ready.`,tags:["real estate","closing","title"],extended:!0},{id:"estate-planning",name:"🚀 Estate Planning Package",description:"Draft wills, trusts, POAs, and healthcare directives",icon:R,estimatedTime:"~25-30 min",complexity:"extended",prompt:`EXTENDED ESTATE PLANNING - Complete document package:

1. CLIENT INFORMATION ANALYSIS:
   - Review family structure
   - Analyze asset inventory
   - Identify planning goals
   - Note special considerations (special needs, blended family)

2. LAST WILL AND TESTAMENT:
   - Draft will with appropriate provisions
   - Specific bequests
   - Residuary clause
   - Executor appointment
   - Guardian nominations (if minors)

3. TRUST PLANNING:
   - Revocable living trust (if appropriate)
   - Trust provisions and distributions
   - Trustee succession
   - Special needs trust provisions

4. POWER OF ATTORNEY:
   - Durable financial POA
   - Specific powers needed
   - Successor agents
   - Springing vs. immediate

5. HEALTHCARE DIRECTIVES:
   - Healthcare proxy
   - Living will / advance directive
   - HIPAA authorization
   - End-of-life wishes

6. DELIVERABLES:
   - Draft Last Will and Testament
   - Trust document (if needed)
   - Durable Power of Attorney
   - Healthcare Proxy
   - Living Will
   - Asset summary for funding

Take up to 30 minutes. Create a complete estate plan.`,tags:["estate planning","wills","trusts"],extended:!0},{id:"trial-prep",name:"🚀 Trial Preparation",description:"Complete trial prep: witness list, exhibits, and examination outlines",icon:F,estimatedTime:"~30 min",complexity:"extended",prompt:`EXTENDED TRIAL PREP - Comprehensive trial preparation:

1. TRIAL NOTEBOOK:
   - Create case summary
   - Legal issues and jury instructions
   - Key facts and themes
   - Trial timeline

2. WITNESS PREPARATION:
   - Finalize witness list and order
   - Create direct examination outlines
   - Prepare cross-examination outlines
   - Identify impeachment materials

3. EXHIBIT PREPARATION:
   - Finalize exhibit list
   - Check admissibility of each exhibit
   - Create exhibit binder index
   - Prepare foundation questions

4. MOTIONS IN LIMINE:
   - Identify evidence to exclude
   - Draft motions in limine
   - Anticipate opposing motions
   - Prepare responses

5. OPENING & CLOSING:
   - Draft opening statement outline
   - Prepare closing argument themes
   - Create demonstrative exhibit list
   - Identify key jury instructions

6. LOGISTICS:
   - Courtroom technology needs
   - Witness scheduling
   - Document/exhibit organization
   - Daily trial prep checklist

7. DELIVERABLES:
   - Complete trial notebook outline
   - Witness examination outlines
   - Exhibit list with foundations
   - Motions in limine
   - Opening/closing outlines

Take the full 30 minutes. This is trial prep.`,tags:["trial","litigation","courtroom"],extended:!0},{id:"settlement-negotiation",name:"🚀 Settlement Analysis & Strategy",description:"Case valuation, demand letter, and negotiation strategy",icon:W,estimatedTime:"~20-25 min",complexity:"extended",prompt:`EXTENDED SETTLEMENT TASK - Negotiation preparation:

1. CASE VALUATION:
   - Calculate economic damages
   - Assess non-economic damages
   - Consider punitive damages potential
   - Apply liability percentage
   - Determine settlement range

2. RISK ANALYSIS:
   - Probability of success at trial
   - Key evidence strengths/weaknesses
   - Witness credibility assessment
   - Jury appeal factors

3. DEMAND LETTER:
   - Draft comprehensive demand letter
   - Summarize facts and liability
   - Detail all damages with support
   - Set appropriate demand amount

4. NEGOTIATION STRATEGY:
   - Determine opening position
   - Identify walk-away point
   - Plan concession strategy
   - Anticipate counteroffers

5. MEDIATION PREP (if applicable):
   - Mediation statement draft
   - Confidential brief points
   - Settlement authority range
   - Creative resolution options

6. DELIVERABLES:
   - Case valuation memo
   - Settlement demand letter
   - Negotiation strategy outline
   - Authority recommendation
   - Mediation materials (if needed)

Take 20-25 minutes. Know your numbers before negotiating.`,tags:["settlement","negotiation","mediation"],extended:!0},{id:"compliance-audit",name:"🚀 Compliance Audit",description:"Review firm/client compliance with regulations and best practices",icon:Jt,estimatedTime:"~20-25 min",complexity:"extended",prompt:`EXTENDED COMPLIANCE TASK - Comprehensive compliance review:

1. REGULATORY COMPLIANCE:
   - Identify applicable regulations
   - Review current compliance status
   - Check for recent regulatory changes
   - Note filing deadlines

2. DOCUMENT REVIEW:
   - Policy and procedure review
   - Contract compliance check
   - Required disclosures verification
   - Record retention compliance

3. RISK ASSESSMENT:
   - Identify compliance gaps
   - Assess risk levels
   - Prioritize remediation needs
   - Estimate exposure

4. TRAINING & AWARENESS:
   - Training requirements status
   - Employee certification tracking
   - Awareness program review
   - Documentation of training

5. REPORTING & MONITORING:
   - Required reports status
   - Monitoring procedures
   - Audit trail review
   - Incident tracking

6. DELIVERABLES:
   - Compliance checklist with status
   - Gap analysis report
   - Risk matrix
   - Remediation recommendations
   - Priority action items

Take 20-25 minutes. Identify all compliance issues.`,tags:["compliance","audit","regulatory"],extended:!0},{id:"deadline-audit",name:"Deadline Audit",description:"Check all matters for upcoming deadlines and compliance",icon:Ne,estimatedTime:"~4 min",complexity:"medium",prompt:"Audit all active matters for upcoming deadlines in the next 30 days. Identify any matters missing critical deadlines, check statute of limitations dates, and create a prioritized deadline report with recommended actions.",tags:["calendar","deadlines","compliance"],extended:!1},{id:"case-assessment",name:"Quick Case Assessment",description:"Generate case evaluation and strategy summary",icon:F,estimatedTime:"~6 min",complexity:"high",prompt:"Prepare a case assessment: analyze the facts and evidence, identify legal issues and applicable law, assess strengths and weaknesses, evaluate potential outcomes, and recommend litigation or settlement strategy.",tags:["litigation","strategy","analysis"],extended:!1},{id:"letter-draft",name:"Draft Legal Letter",description:"Draft a professional legal letter or correspondence",icon:ee,estimatedTime:"~5 min",complexity:"medium",prompt:"Draft a professional legal letter. Consider the purpose, tone, and recipient. Include proper formatting, clear language, and appropriate legal terminology. Make it ready to send.",tags:["correspondence","drafting","communication"],extended:!1},{id:"research-memo",name:"Quick Legal Research",description:"Research a specific legal issue and summarize findings",icon:Z,estimatedTime:"~8 min",complexity:"high",prompt:"Research the specified legal issue. Identify applicable law, relevant cases, and provide a summary of the current legal standard. Include citations and practical implications.",tags:["research","legal memo","analysis"],extended:!1}],us=["What matters need my attention this week?","Summarize unbilled time and what can be invoiced","Find all deadlines in the next 14 days","Review my recent time entries and improve descriptions","Which clients haven't heard from us in 30+ days?","Analyze the uploaded contract for risks","Prepare a case status summary for [client name]","What tasks are overdue across my matters?"],[Be,ge]=a.useState(!1),[ae,jt]=a.useState(""),[he,ps]=a.useState("all"),gs=s=>{const n=s.split(" ").length,r=/document|review|analyze|summarize|contract/i.test(s),m=/bill|invoice|time entr|unbilled|WIP/i.test(s),p=/research|statute|case law|precedent|legal issue/i.test(s),x=/all|every|each|matters|clients|comprehensive|thorough|full|complete/i.test(s),g=/take your time|thorough|extended|30 minute|deep dive|comprehensive audit/i.test(s),h=/litigation|strategy|deposition|discovery|trial|motion/i.test(s);let o=2;return n>50?o+=5:n>30&&(o+=2),r&&(o+=3),m&&(o+=4),p&&(o+=5),x&&(o+=5),h&&(o+=5),g&&(o+=15),b&&(o=Math.max(o*2,20)),o<=3?"~2-3 min":o<=5?"~3-5 min":o<=8?"~5-8 min":o<=15?"~10-15 min":o<=25?"~15-25 min":"~25-30 min"},Me=a.useMemo(()=>y.filter(s=>{const n=!ae||s.goal.toLowerCase().includes(ae.toLowerCase()),r=he==="all"||s.status===he;return n&&r}),[y,ae,he]),[hs,Nt]=a.useState(!1),[ze,Ct]=a.useState(null),[T,Fe]=a.useState(0),[_e,Oe]=a.useState(""),[xe,Ue]=a.useState(""),[He,bt]=a.useState(!1),[Tt,_s]=a.useState(new Set),[qe,St]=a.useState([]),[Ge,xs]=a.useState(!1),[wt,It]=a.useState(!1),[Et,fs]=a.useState(null),At=a.useCallback(async()=>{try{const s=await E.getBackgroundAgentStatus();f(s)}catch{f({available:!1,configured:!1,message:"Background agent status unavailable"})}},[]),Rt=a.useCallback(async()=>{try{const s=await E.getBackgroundAgentTools();L(s)}catch{L(null)}},[]),[U,ie]=a.useState(null),$e=a.useRef(null),K=a.useCallback(async()=>{try{const s=await E.getActiveBackgroundTask();if(s.active&&s.task)N(s.task),$e.current=s.task.id,s.task.status==="running"&&ie(null);else{const n=$e.current;if(n){try{const r=await E.getBackgroundTask(n);r!=null&&r.task&&ie(r.task)}catch{}$e.current=null}N(null)}}catch{N(null)}},[]),X=a.useCallback(async()=>{try{const s=await E.getBackgroundTasks(8);w(s.tasks||[]);const n=s.tasks||[],r=n.filter(m=>m.status==="completed");fs({totalTasks:n.length,completedTasks:r.length,avgRating:0,topCategories:[]})}catch{w([])}},[]),Lt=a.useCallback(async()=>{It(!0);try{const s=await E.getLearnedPatterns(10);St(s.patterns||s.learnings||[])}catch{St([])}finally{It(!1)}},[]),Dt=a.useCallback(async()=>{mt(!0);try{const[s,n]=await Promise.all([Is.getAll({view:"my"}).catch(()=>({matters:[]})),Es.getEvents().catch(()=>({events:[]}))]),r=s.matters||s||[],m=n.events||n||[],p=new Date,x=[],g=m.filter(d=>{var B;if(!d.date&&!d.startDate)return!1;const S=new Date(d.date||d.startDate),I=Math.ceil((S.getTime()-p.getTime())/(1e3*60*60*24));return I>=0&&I<=7&&(d.type==="deadline"||d.isDeadline||((B=d.title)==null?void 0:B.toLowerCase().includes("deadline")))});g.length>0&&x.push({id:"deadlines-upcoming",type:"deadline",title:`${g.length} Deadline${g.length>1?"s":""} This Week`,description:`You have ${g.length} deadline${g.length>1?"s":""} coming up in the next 7 days. Review and prepare.`,priority:"high",action:"Review Deadlines",actionPrompt:"Review all my upcoming deadlines in the next 7 days. For each deadline, tell me: the matter name, deadline date, what needs to be done, and recommend any preparation steps."});const h=r.filter(d=>{if(d.status!=="active")return!1;const S=d.updatedAt||d.lastActivity;return S?Math.floor((p.getTime()-new Date(S).getTime())/(1e3*60*60*24))>30:!0});h.length>0&&x.push({id:"stale-matters",type:"stale",title:`${h.length} Matter${h.length>1?"s":""} Need Attention`,description:`${h.length} active matter${h.length>1?"s have":" has"} had no updates in over 30 days.`,priority:"medium",action:"Review Stale Matters",actionPrompt:"Review all my matters that have had no activity in the past 30 days. For each one, tell me: the matter name, last activity date, current status, and recommend next steps."});const o=r.filter(d=>d.unbilledAmount&&d.unbilledAmount>0);if(o.length>0){const d=o.reduce((S,I)=>S+(I.unbilledAmount||0),0);x.push({id:"unbilled-time",type:"billing",title:"Unbilled Time Available",description:`You have approximately $${d.toLocaleString()} in unbilled time across ${o.length} matter${o.length>1?"s":""}.`,priority:"medium",action:"Review Billing",actionPrompt:"Review all my matters with unbilled time. List each matter with: matter name, unbilled amount, last time entry date, and recommend which should be invoiced."})}p.getDay()===1&&x.push({id:"weekly-audit",type:"opportunity",title:"Weekly Matter Audit",description:"It's Monday - a good time to review your matters for the week ahead.",priority:"low",action:"Start Audit",actionPrompt:"Perform a weekly audit of all my active matters. Summarize: what needs attention this week, upcoming deadlines, and recommended priorities."}),dt(x)}catch(s){console.error("Failed to fetch suggestions:",s),dt([])}finally{mt(!1)}},[]),Pt=a.useCallback(async()=>{try{Re([{id:"sched-1",name:"Weekly Billing Review",goal:"Review all unbilled time and prepare invoicing recommendations",schedule:"Every Friday at 4:00 PM",nextRun:ys(),lastRun:void 0,enabled:!0,extended:!0}])}catch{Re([])}},[]),ys=()=>{const s=new Date,n=(5-s.getDay()+7)%7||7,r=new Date(s);return r.setDate(s.getDate()+n),r.setHours(16,0,0,0),r.toISOString()},Bt=a.useCallback(async s=>{if(!s.trim()){pe(null);return}_t(!0);try{const n=s.toLowerCase();let r="simple",m=3;const p=[],x=[];let g="";const h=["comprehensive","all matters","full audit","complete review","thorough","extended","litigation strategy","trial prep"],o=["analyze","review","research","draft","summarize","billing","time entries"];h.some(d=>n.includes(d))?(r="complex",m=15):o.some(d=>n.includes(d))&&(r="moderate",m=8),(n.includes("matter")||n.includes("case"))&&p.push("matters_search","matter_update"),(n.includes("document")||n.includes("contract")||n.includes("file"))&&p.push("document_analyze","document_search"),(n.includes("bill")||n.includes("invoice")||n.includes("time"))&&p.push("billing_review","time_entries_get"),(n.includes("calendar")||n.includes("deadline")||n.includes("schedule"))&&p.push("calendar_events","deadline_check"),(n.includes("research")||n.includes("case law")||n.includes("statute"))&&p.push("legal_research","case_search"),n.includes("client")&&p.push("client_search","client_info"),(n.includes("email")||n.includes("draft")||n.includes("letter"))&&p.push("email_draft","document_create"),n.includes("all")&&n.includes("matter")&&x.push("Processing many matters may take longer"),(n.includes("confidential")||n.includes("privileged"))&&x.push("Contains sensitive information - handle with care"),r==="complex"&&!b&&x.push("Consider enabling Extended Mode for better results"),r==="complex"?g="This task requires deep analysis. The agent will work methodically through multiple steps, gathering data, analyzing patterns, and generating comprehensive output.":r==="moderate"?g="The agent will perform targeted analysis, focusing on the specific area requested and providing actionable insights.":g="Quick task - the agent will complete this efficiently with minimal steps.",pe({complexity:r,estimatedSteps:m,requiredTools:p.length>0?p:["general_analysis"],potentialIssues:x,suggestedApproach:g})}catch{pe(null)}finally{_t(!1)}},[b]);a.useEffect(()=>{const s=setTimeout(()=>{j.trim().length>20?Bt(j):pe(null)},500);return()=>clearTimeout(s)},[j,Bt]);const Mt=a.useCallback(async()=>{et(!0),await Promise.all([At(),Rt(),K(),X(),Lt(),Dt(),Pt()]),et(!1)},[At,Rt,K,X,Lt,Dt,Pt]);a.useEffect(()=>{Mt()},[]),a.useEffect(()=>{const s=_.state;if(s!=null&&s.highlightTaskId){yt(s.highlightTaskId);const n=setTimeout(()=>{yt(null)},3e3);return s.fromTaskBar&&setTimeout(()=>{var r;(r=vt.current)==null||r.scrollIntoView({behavior:"smooth",block:"center"})},100),window.history.replaceState({},document.title),()=>clearTimeout(n)}},[_.state]),a.useEffect(()=>{if(!tt)return;const s=setInterval(()=>{K(),X()},3e3);return()=>clearInterval(s)},[tt,K,X]),a.useEffect(()=>{if(!(i!=null&&i.id)){P.current&&(P.current.close(),P.current=null,te(!1),O("disconnected")),q.current&&(clearTimeout(q.current),q.current=null),se(0);return}const s=(n=0)=>{const r="https://apexai-api.azurewebsites.net/api",m=localStorage.getItem("apex-access-token")||localStorage.getItem("token")||"",p=n>0?`${Date.now()}`:"",x=`${r}/v1/agent-stream/${i.id}?token=${m}${p?`&reconnectId=${p}`:""}`;console.log(`[BackgroundAgent] Connecting to SSE (attempt ${n+1}):`,x),O("connecting");const g=new EventSource(x);P.current=g,g.onopen=()=>{console.log("[BackgroundAgent] SSE connected"),te(!0),O("connected"),se(0)},g.onerror=h=>{if(console.log("[BackgroundAgent] SSE error",h),te(!1),i!=null&&i.id&&n<Ee){O("error");const o=Math.min(1e3*Math.pow(2,n),3e4);console.log(`[BackgroundAgent] Reconnecting in ${o}ms (attempt ${n+1}/${Ee})`),se(n+1),q.current=setTimeout(()=>{P.current&&P.current.close(),s(n+1)},o)}else O("disconnected")},g.addEventListener("connected",h=>{console.log("[BackgroundAgent] SSE connected event:",h.data),te(!0),O("connected"),se(0)}),g.addEventListener("history",h=>{try{const o=JSON.parse(h.data);o.events&&Array.isArray(o.events)&&(o.isReconnection?H(d=>{const S=new Set(d.map(B=>B.timestamp)),I=o.events.filter(B=>!S.has(B.timestamp));return[...d,...I].slice(-100)}):H(d=>[...o.events,...d].slice(-50)))}catch(o){console.error("Failed to parse history:",o)}}),g.addEventListener("event",h=>{try{const o=JSON.parse(h.data);H(d=>[...d.slice(-100),o])}catch(o){console.error("Failed to parse event:",o)}}),g.addEventListener("progress",h=>{try{const o=JSON.parse(h.data);N(d=>d?{...d,status:o.status||d.status,progress:{progressPercent:o.progress_percent,currentStep:o.current_step,iterations:o.actions_count,totalSteps:o.total_steps,completedSteps:o.completed_steps}}:null)}catch(o){console.error("Failed to parse progress:",o)}}),g.addEventListener("task_complete",h=>{try{const o=JSON.parse(h.data);console.log("[BackgroundAgent] Task completed:",o),N(d=>d?{...d,status:"completed",progress:{...d.progress,progressPercent:100,currentStep:o.message||"Completed successfully"},result:{summary:o.summary||o.message}}:null),ie(d=>i?{...i,status:"completed",progress:{...i.progress,progressPercent:100},result:{summary:o.summary||o.message}}:d),ne&&i&&ls({id:i.id,goal:i.goal,status:"completed",summary:o.summary||o.message},()=>{window.focus()})}catch(o){console.error("Failed to parse task_complete:",o)}}),g.addEventListener("heartbeat",()=>{O("connected"),se(0)})};return s(0),()=>{P.current&&(P.current.close(),P.current=null),q.current&&(clearTimeout(q.current),q.current=null),te(!1),O("disconnected")}},[i==null?void 0:i.id]),a.useEffect(()=>{de.current&&(de.current.scrollTop=de.current.scrollHeight)},[we]),a.useEffect(()=>{H([])},[i==null?void 0:i.id]),a.useEffect(()=>{const s=sessionStorage.getItem("backgroundTaskSummary");if(s)try{D(JSON.parse(s))}catch{D(null)}},[_.state]);const vs=()=>{sessionStorage.removeItem("backgroundTaskSummary"),D(null)},ks=async()=>{var n;const s=j.trim();if(!(!s||Se)){if(s.length<10){be("Please provide a more detailed description (at least 10 characters)");return}nt(!0),be(null),H([]);try{const r=await E.startBackgroundTask(s,{extended:b}),m=r==null?void 0:r.task;m!=null&&m.id&&(window.dispatchEvent(new CustomEvent("backgroundTaskStarted",{detail:{taskId:m.id,goal:m.goal||s,isAmplifier:!0,extended:b}})),H([{type:"task_starting",message:"🚀 Initializing autonomous agent...",timestamp:new Date().toISOString(),color:"green"}])),v(""),G(!1),ie(null),await K(),await X()}catch(r){const m=((n=r==null?void 0:r.response)==null?void 0:n.data)||r,p=(m==null?void 0:m.details)||(m==null?void 0:m.error)||(r==null?void 0:r.message)||"Failed to start background task",x=m==null?void 0:m.retryable;be(x?`${p} Please try again.`:p)}finally{nt(!1)}}},js=async()=>{if(!(!i||Te)){st(!0);try{await E.cancelBackgroundTask(i.id),await K(),await X()}finally{st(!1)}}},zt=async()=>{const s=Ae.trim();if(!(!s||!i||me)){ot(!0),lt(null);try{await E.sendBackgroundTaskFollowUp(i.id,s),it(""),H(n=>[...n,{type:"followup_sent",message:`📨 Follow-up sent: "${s.substring(0,50)}${s.length>50?"...":""}"`,timestamp:new Date().toISOString(),color:"purple"}])}catch(n){lt((n==null?void 0:n.message)||"Failed to send follow-up")}finally{ot(!1)}}},Ns=s=>{Ct(s),Fe(0),Oe(""),Ue(""),Nt(!0)},fe=()=>{Nt(!1),Ct(null),Fe(0),Oe(""),Ue("")},Cs=async()=>{if(!(!ze||He)&&!(T===0&&!_e.trim()&&!xe.trim())){bt(!0);try{await E.submitBackgroundTaskFeedback(ze,{rating:T>0?T:void 0,feedback:_e.trim()||void 0,correction:xe.trim()||void 0}),_s(s=>new Set([...s,ze])),fe()}catch(s){console.error("Failed to submit feedback:",s)}finally{bt(!1)}}},bs=a.useMemo(()=>{if(!i)return null;const s=i.status;return s==="error"||s==="failed"?"error":s==="cancelled"?"cancelled":s==="completed"?"complete":"running"},[i]),Ts=Xe((Ft=i==null?void 0:i.progress)==null?void 0:Ft.progressPercent,i?5:0);return(Ot=i==null?void 0:i.progress)!=null&&Ot.totalSteps?`${Math.min(((Ut=i.progress)==null?void 0:Ut.completedSteps)??((Ht=i.progress)==null?void 0:Ht.iterations)??1,(qt=i.progress)==null?void 0:qt.totalSteps)}${(Gt=i.progress)==null?void 0:Gt.totalSteps}`:($t=i==null?void 0:i.progress)!=null&&$t.iterations&&`${i.progress.iterations}`,e.jsxs("div",{className:t.page,children:[e.jsxs("div",{className:t.header,children:[e.jsxs("div",{className:t.title,children:[e.jsx(J,{size:20}),e.jsxs("div",{children:[e.jsx("h1",{children:"Background Agent"}),e.jsx("p",{children:"Autonomous legal workflows powered by Amplifier"})]})]}),e.jsxs("div",{className:t.headerActions,children:[rs&&e.jsxs("button",{className:A(t.notifyBtn,ne&&t.notifyEnabled),onClick:ne?()=>ft(!1):cs,title:ne?"Notifications enabled":"Enable notifications",children:[e.jsx(As,{size:16}),ne?"Notify On":"Notify"]}),e.jsxs("button",{className:t.refreshBtn,onClick:Mt,disabled:Ze,children:[Ze?e.jsx(M,{size:16,className:t.spin}):e.jsx(Wt,{size:16}),"Refresh"]})]})]}),c&&!c.configured&&e.jsxs("div",{className:t.configAlert,children:[e.jsxs("div",{className:t.alertHeader,children:[e.jsx(ye,{size:20}),e.jsx("h3",{children:"AI Agent Not Configured"})]}),e.jsx("p",{children:c.message||"The background AI agent requires Azure OpenAI credentials to function."}),e.jsxs("div",{className:t.alertSteps,children:[e.jsx("p",{children:"To enable the AI agent, configure these environment variables:"}),e.jsxs("ul",{children:[e.jsxs("li",{children:[e.jsx("code",{children:"AZURE_OPENAI_ENDPOINT"})," - Your Azure OpenAI resource URL"]}),e.jsxs("li",{children:[e.jsx("code",{children:"AZURE_OPENAI_API_KEY"})," - Your API key"]}),e.jsxs("li",{children:[e.jsx("code",{children:"AZURE_OPENAI_DEPLOYMENT"})," - Your deployment name (e.g., gpt-4)"]})]})]}),e.jsx("p",{className:t.alertHint,children:"Contact your administrator if you need help setting this up."})]}),Le.length>0&&as&&e.jsxs("div",{className:t.suggestionsCard,children:[e.jsxs("div",{className:t.suggestionsHeader,children:[e.jsxs("div",{className:t.suggestionsTitle,children:[e.jsx(Ve,{size:18}),e.jsx("span",{children:"AI Insights & Suggestions"}),e.jsx("span",{className:t.suggestionsBadge,children:Le.length})]}),e.jsx("button",{className:t.dismissSuggestions,onClick:()=>is(!1),children:e.jsx(re,{size:14})})]}),e.jsx("div",{className:t.suggestionsList,children:Le.map(s=>e.jsxs("div",{className:A(t.suggestionItem,t[`priority${s.priority.charAt(0).toUpperCase()+s.priority.slice(1)}`]),children:[e.jsxs("div",{className:t.suggestionIcon,children:[s.type==="deadline"&&e.jsx(z,{size:18}),s.type==="billing"&&e.jsx(W,{size:18}),s.type==="stale"&&e.jsx(ve,{size:18}),s.type==="document"&&e.jsx(R,{size:18}),s.type==="opportunity"&&e.jsx(oe,{size:18})]}),e.jsxs("div",{className:t.suggestionContent,children:[e.jsx("div",{className:t.suggestionItemTitle,children:s.title}),e.jsx("div",{className:t.suggestionDesc,children:s.description})]}),s.action&&s.actionPrompt&&e.jsxs("button",{className:t.suggestionAction,onClick:()=>{v(s.actionPrompt),G(s.priority==="high")},children:[s.action,e.jsx(Q,{size:14})]})]},s.id))})]}),ct.length>0&&e.jsxs("div",{className:t.scheduledCard,children:[e.jsxs("div",{className:t.scheduledHeader,children:[e.jsxs("div",{className:t.scheduledTitle,children:[e.jsx(Rs,{size:18}),e.jsx("span",{children:"Scheduled Tasks"})]}),e.jsxs("button",{className:t.addScheduleBtn,onClick:()=>ns(!0),children:[e.jsx(Ls,{size:14}),"Add"]})]}),e.jsx("div",{className:t.scheduledList,children:ct.map(s=>e.jsxs("div",{className:A(t.scheduledItem,!s.enabled&&t.scheduledDisabled),children:[e.jsxs("div",{className:t.scheduledInfo,children:[e.jsx("div",{className:t.scheduledName,children:s.name}),e.jsxs("div",{className:t.scheduledMeta,children:[e.jsx(Ds,{size:12}),e.jsx("span",{children:s.schedule}),e.jsxs("span",{className:t.scheduledNext,children:["Next: ",new Date(s.nextRun).toLocaleDateString()," at ",new Date(s.nextRun).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]})]})]}),e.jsxs("div",{className:t.scheduledActions,children:[e.jsx("button",{className:A(t.scheduledToggle,s.enabled&&t.enabled),onClick:()=>{Re(n=>n.map(r=>r.id===s.id?{...r,enabled:!r.enabled}:r))},children:s.enabled?e.jsx(Yt,{size:14}):e.jsx(Kt,{size:14})}),e.jsxs("button",{className:t.scheduledRun,onClick:()=>{v(s.goal),G(s.extended)},children:[e.jsx(J,{size:14}),"Run Now"]})]})]},s.id))})]}),e.jsxs("div",{className:t.card,children:[e.jsxs("div",{className:t.cardHeader,children:[e.jsx("h2",{children:"Start Background Task"}),e.jsxs("div",{className:t.cardHeaderRight,children:[e.jsxs("button",{className:t.templatesLibraryBtn,onClick:()=>De(!0),children:[e.jsx(Qe,{size:14}),"Full Library"]}),e.jsxs("button",{className:t.templatesToggle,onClick:()=>ge(!Be),children:[e.jsx(Ps,{size:16}),"Templates",Be?e.jsx(Xt,{size:14}):e.jsx(Qt,{size:14})]})]})]}),Be&&e.jsxs("div",{className:t.templatesPanel,children:[e.jsxs("div",{className:t.templatesPanelHeader,children:[e.jsx("h3",{children:"🚀 Extended Deep Work (15-30 min)"}),e.jsx("p",{children:"Let the agent work autonomously on complex legal tasks while you focus on other things"})]}),e.jsx("div",{className:t.templatesGrid,children:kt.filter(s=>s.extended).map(s=>{const n=s.icon;return e.jsxs("button",{className:`${t.templateCard} ${t.extendedTemplate}`,onClick:()=>{v(s.prompt),G(!0),ge(!1)},children:[e.jsx("div",{className:t.templateIcon,children:e.jsx(n,{size:20})}),e.jsxs("div",{className:t.templateContent,children:[e.jsx("div",{className:t.templateName,children:s.name}),e.jsx("div",{className:t.templateDesc,children:s.description}),e.jsxs("div",{className:t.templateMeta,children:[e.jsxs("span",{className:t.templateTime,children:[e.jsx(z,{size:12}),s.estimatedTime]}),e.jsx("span",{className:`${t.templateComplexity} ${t.extended}`,children:"deep work"})]})]})]},s.id)})}),e.jsxs("div",{className:t.templatesPanelHeader,style:{marginTop:"24px"},children:[e.jsx("h3",{children:"Quick Tasks (2-10 min)"}),e.jsx("p",{children:"Fast workflows for common legal tasks"})]}),e.jsx("div",{className:t.templatesGrid,children:kt.filter(s=>!s.extended).map(s=>{const n=s.icon;return e.jsxs("button",{className:t.templateCard,onClick:()=>{v(s.prompt),G(!1),ge(!1)},children:[e.jsx("div",{className:t.templateIcon,children:e.jsx(n,{size:20})}),e.jsxs("div",{className:t.templateContent,children:[e.jsx("div",{className:t.templateName,children:s.name}),e.jsx("div",{className:t.templateDesc,children:s.description}),e.jsxs("div",{className:t.templateMeta,children:[e.jsxs("span",{className:t.templateTime,children:[e.jsx(z,{size:12}),s.estimatedTime]}),e.jsx("span",{className:`${t.templateComplexity} ${t[s.complexity]}`,children:s.complexity})]})]})]},s.id)})})]}),e.jsxs("div",{className:t.taskForm,children:[e.jsx("textarea",{className:t.taskInput,placeholder:"Describe the legal task you want handled...",value:j,onChange:s=>v(s.target.value),rows:3}),!j&&e.jsxs("div",{className:t.suggestions,children:[e.jsx("span",{className:t.suggestionsLabel,children:"Quick suggestions:"}),e.jsx("div",{className:t.suggestionChips,children:us.slice(0,3).map((s,n)=>e.jsx("button",{className:t.suggestionChip,onClick:()=>v(s),children:s.length>50?s.substring(0,47)+"...":s},n))})]}),j.trim()&&e.jsxs("div",{className:t.estimatedTime,children:[e.jsx(z,{size:14}),e.jsxs("span",{children:["Estimated completion: ",e.jsx("strong",{children:gs(j)})]})]}),(ht||C)&&j.trim()&&e.jsx("div",{className:t.taskAnalysisCard,children:ht?e.jsxs("div",{className:t.analyzingState,children:[e.jsx(M,{size:16,className:t.spin}),e.jsx("span",{children:"Analyzing task..."})]}):C&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:t.analysisHeader,children:[e.jsx(Zt,{size:16}),e.jsx("span",{children:"AI Task Analysis"}),e.jsx("span",{className:A(t.complexityBadge,t[`complexity${C.complexity.charAt(0).toUpperCase()+C.complexity.slice(1)}`]),children:C.complexity})]}),e.jsxs("div",{className:t.analysisBody,children:[e.jsxs("div",{className:t.analysisRow,children:[e.jsx("span",{className:t.analysisLabel,children:"Estimated Steps"}),e.jsxs("span",{className:t.analysisValue,children:["~",C.estimatedSteps," steps"]})]}),C.requiredTools.length>0&&e.jsxs("div",{className:t.analysisTools,children:[e.jsx("span",{className:t.analysisLabel,children:"Tools to Use"}),e.jsxs("div",{className:t.toolTags,children:[C.requiredTools.slice(0,4).map((s,n)=>e.jsxs("span",{className:t.toolTag,children:[e.jsx(es,{size:10}),s.replace(/_/g," ")]},n)),C.requiredTools.length>4&&e.jsxs("span",{className:t.toolTagMore,children:["+",C.requiredTools.length-4]})]})]}),C.potentialIssues.length>0&&e.jsx("div",{className:t.analysisIssues,children:C.potentialIssues.map((s,n)=>e.jsxs("div",{className:t.issueItem,children:[e.jsx(ve,{size:12}),e.jsx("span",{children:s})]},n))}),e.jsxs("div",{className:t.analysisApproach,children:[e.jsx(Ve,{size:14}),e.jsx("span",{children:C.suggestedApproach})]})]})]})}),e.jsx("div",{className:t.taskOptions,children:e.jsxs("button",{type:"button",className:`${t.extendedModeToggle} ${b?t.extendedModeActive:""}`,onClick:()=>G(!b),children:[e.jsx(le,{size:16}),e.jsx("span",{className:t.extendedModeLabel,children:b?"Extended Mode ON":"Extended Mode"}),e.jsx("span",{className:t.extendedModeTime,children:b?"Up to 30 min":"Enable for 15-30 min tasks"})]})}),b&&e.jsxs("div",{className:t.extendedModeInfo,children:[e.jsx(oe,{size:14}),e.jsxs("span",{children:["Extended mode allows the agent to work for up to ",e.jsx("strong",{children:"30 minutes"})," on complex legal tasks. Perfect for matter audits, billing reviews, litigation prep, and contract analysis. You can close this tab - you'll be notified when done."]})]}),e.jsxs("div",{className:t.taskActions,children:[e.jsxs("button",{className:`${t.startBtn} ${b?t.startBtnExtended:""}`,onClick:ks,disabled:!j.trim()||Se||!(c!=null&&c.available),children:[Se?e.jsx(M,{size:16,className:t.spin}):e.jsx(J,{size:16}),b?"🚀 Start Extended Task":"Start Task"]}),!(c!=null&&c.available)&&e.jsx("span",{className:t.taskHint,children:"Background agent is not available."})]}),ce&&e.jsx("div",{className:t.taskError,children:ce})]})]}),l&&e.jsxs("div",{className:t.card,children:[e.jsxs("div",{className:t.cardHeader,children:[e.jsx("h2",{children:"Latest Summary"}),e.jsx("button",{className:t.textBtn,onClick:vs,children:"Dismiss"})]}),e.jsxs("div",{className:t.summaryBlock,children:[e.jsx("div",{className:t.summaryGoal,children:l.goal}),e.jsx("div",{className:t.summaryText,children:l.summary||"Summary unavailable."})]})]}),e.jsxs("div",{className:t.grid,children:[e.jsxs("div",{ref:vt,className:`${t.card} ${Pe&&((i==null?void 0:i.id)===Pe||(U==null?void 0:U.id)===Pe)?t.highlighted:""}`,children:[e.jsxs("div",{className:t.cardHeader,children:[e.jsx("h2",{children:i?"Active Task":U?"Last Completed Task":"Active Task"}),U&&!i&&e.jsx("button",{className:t.textBtn,onClick:()=>ie(null),children:"Clear"})]}),!i&&!U&&e.jsx("div",{className:t.emptyState,children:"No active background task. Start one above!"}),(i||U)&&(()=>{var p,x,g,h,o,d,S,I,B,Vt;const s=i||U,n=i?bs:s.status==="completed"?"complete":s.status==="error"||s.status==="failed"?"error":s.status==="cancelled"?"cancelled":"complete",r=i?Ts:Xe((p=s.progress)==null?void 0:p.progressPercent,100),m=(x=s.progress)!=null&&x.totalSteps?`Step ${Math.min(((g=s.progress)==null?void 0:g.completedSteps)??((h=s.progress)==null?void 0:h.iterations)??1,(o=s.progress)==null?void 0:o.totalSteps)} of ${(d=s.progress)==null?void 0:d.totalSteps}`:(S=s.progress)!=null&&S.iterations?`Step ${s.progress.iterations}`:"Completed";return e.jsxs("div",{className:t.task,children:[e.jsxs("div",{className:t.taskHeader,children:[n==="complete"&&e.jsx(Ye,{size:18,className:t.complete}),n==="error"&&e.jsx(ye,{size:18,className:t.error}),n==="cancelled"&&e.jsx(Ke,{size:18,className:t.cancelled}),n==="running"&&e.jsx(J,{size:18,className:t.running}),e.jsxs("div",{children:[e.jsx("div",{className:t.taskGoal,children:s.goal}),e.jsx("div",{className:t.taskStep,children:((I=s.progress)==null?void 0:I.currentStep)||(n==="complete"?"Completed successfully":"Working...")})]})]}),e.jsxs("div",{className:t.progressRow,children:[e.jsx("div",{className:t.progressBar,children:e.jsx("div",{className:t.progressFill,style:{width:`${r}%`}})}),e.jsxs("div",{className:t.progressMeta,children:[e.jsxs("span",{children:[r,"%"]}),e.jsx("span",{children:m})]})]}),n==="running"&&e.jsxs("div",{className:t.liveActivitySection,children:[e.jsxs("div",{className:t.liveActivityHeader,children:[e.jsx(Ms,{size:14}),e.jsx("span",{children:"Live Activity"}),Ie==="connected"&&e.jsx("span",{className:t.streamingIndicator,children:"● Live"}),Ie==="connecting"&&e.jsxs("span",{className:t.connectingIndicator,children:[e.jsx(M,{size:12,className:t.spin})," Connecting..."]}),Ie==="error"&&at>0&&e.jsxs("span",{className:t.reconnectingIndicator,children:[e.jsx(Wt,{size:12,className:t.spin})," Reconnecting (",at,"/",Ee,")"]})]}),e.jsxs("div",{className:t.liveActivityFeed,ref:de,children:[we.length===0&&e.jsxs("div",{className:t.thinkingIndicator,children:[e.jsxs("div",{className:t.thinkingDots,children:[e.jsx("span",{className:t.thinkingDot}),e.jsx("span",{className:t.thinkingDot}),e.jsx("span",{className:t.thinkingDot})]}),e.jsx("span",{children:"Agent is analyzing and preparing actions..."})]}),we.map(($,Ss)=>e.jsxs("div",{className:t.liveEventItem,children:[e.jsx("span",{className:t.liveEventTime,children:new Date($.timestamp).toLocaleTimeString()}),e.jsx("span",{className:t.liveEventMessage,children:$.message})]},Ss))]})]}),((B=s.result)==null?void 0:B.summary)&&e.jsxs("div",{className:t.taskSummary,children:[e.jsxs("div",{className:t.summaryHeader,children:[e.jsx(Ye,{size:16,className:t.summaryIcon}),e.jsx("strong",{children:"Task Completed"})]}),e.jsx("div",{className:t.summaryContent,children:s.result.summary}),((Vt=s.progress)==null?void 0:Vt.iterations)&&e.jsxs("div",{className:t.summaryMeta,children:["Completed in ",s.progress.iterations," steps"]}),e.jsxs("div",{className:t.suggestedFollowUps,children:[e.jsxs("div",{className:t.suggestedFollowUpsHeader,children:[e.jsx(oe,{size:14}),e.jsx("span",{children:"What's Next?"})]}),e.jsxs("div",{className:t.suggestedFollowUpsList,children:[s.goal.toLowerCase().includes("audit")&&e.jsxs("button",{className:t.suggestedFollowUpItem,onClick:()=>v("Based on the audit results, create a prioritized action plan for the matters needing attention"),children:[e.jsx(Q,{size:14}),"Create action plan from audit"]}),s.goal.toLowerCase().includes("bill")&&e.jsxs("button",{className:t.suggestedFollowUpItem,onClick:()=>v("Draft invoice summaries for the matters ready to bill"),children:[e.jsx(Q,{size:14}),"Draft invoice summaries"]}),s.goal.toLowerCase().includes("research")&&e.jsxs("button",{className:t.suggestedFollowUpItem,onClick:()=>v("Create a legal memo summarizing the research findings"),children:[e.jsx(Q,{size:14}),"Create research memo"]}),e.jsxs("button",{className:t.suggestedFollowUpItem,onClick:()=>v(`Continue working on: ${s.goal}`),children:[e.jsx(Q,{size:14}),"Continue this task"]})]})]})]}),s.error&&e.jsxs("div",{className:t.taskError,children:[e.jsx(ye,{size:16}),e.jsx("span",{children:s.error})]}),n==="running"&&e.jsxs("div",{className:t.followUpSection,children:[e.jsxs("div",{className:t.followUpHeader,children:[e.jsx(ts,{size:14}),e.jsx("span",{children:"Send Follow-up Instructions"})]}),e.jsxs("div",{className:t.followUpForm,children:[e.jsx("input",{type:"text",className:t.followUpInput,placeholder:"Add more context or redirect the agent...",value:Ae,onChange:$=>it($.target.value),onKeyDown:$=>$.key==="Enter"&&!$.shiftKey&&zt(),disabled:me}),e.jsx("button",{className:t.followUpBtn,onClick:zt,disabled:!Ae.trim()||me,children:me?e.jsx(M,{size:14,className:t.spin}):e.jsx(zs,{size:14})})]}),rt&&e.jsx("div",{className:t.followUpError,children:rt})]}),n==="running"&&e.jsxs("div",{className:t.taskControlButtons,children:[e.jsxs("button",{className:A(t.pauseBtn,ue&&t.paused),onClick:()=>os(!ue),children:[ue?e.jsx(Kt,{size:14}):e.jsx(Yt,{size:14}),ue?"Resume":"Pause"]}),e.jsxs("button",{className:t.cancelBtn,onClick:js,disabled:Te,children:[Te?e.jsx(M,{size:14,className:t.spin}):e.jsx(Ke,{size:14}),"Cancel Task"]})]}),(n==="complete"||n==="error")&&s.id&&!Tt.has(s.id)&&e.jsxs("button",{className:t.feedbackBtn,onClick:()=>Ns(s.id),children:[e.jsx(je,{size:14}),"Rate This Task"]}),s.id&&Tt.has(s.id)&&e.jsxs("div",{className:t.feedbackThanks,children:[e.jsx(Fs,{size:14}),"Thanks for your feedback!"]})]})})()]}),e.jsxs("div",{className:t.card,children:[e.jsxs("div",{className:t.cardHeader,children:[e.jsx("h2",{children:"Recent Tasks"}),e.jsxs("div",{className:t.cardHeaderRight,children:[y.length>0&&e.jsx("button",{className:t.exportBtn,onClick:()=>{const s=y.map(p=>{var x,g,h;return{goal:p.goal,status:p.status,steps:((x=p.progress)==null?void 0:x.iterations)||0,progress:((g=p.progress)==null?void 0:g.progressPercent)||0,result:((h=p.result)==null?void 0:h.summary)||""}}),n=new Blob([JSON.stringify(s,null,2)],{type:"application/json"}),r=URL.createObjectURL(n),m=document.createElement("a");m.href=r,m.download=`agent-tasks-${new Date().toISOString().split("T")[0]}.json`,m.click(),URL.revokeObjectURL(r)},children:"Export"}),e.jsxs("span",{className:t.taskCount,children:[y.length," tasks"]})]})]}),y.length>0&&e.jsxs("div",{className:t.quickStats,children:[e.jsxs("div",{className:t.quickStat,children:[e.jsx("span",{className:t.quickStatValue,children:y.filter(s=>s.status==="completed").length}),e.jsx("span",{className:t.quickStatLabel,children:"Completed"})]}),e.jsxs("div",{className:t.quickStat,children:[e.jsx("span",{className:t.quickStatValue,children:y.filter(s=>s.status==="running").length}),e.jsx("span",{className:t.quickStatLabel,children:"Running"})]}),e.jsxs("div",{className:t.quickStat,children:[e.jsxs("span",{className:t.quickStatValue,children:[Math.round(y.filter(s=>s.status==="completed").length/Math.max(y.length,1)*100),"%"]}),e.jsx("span",{className:t.quickStatLabel,children:"Success Rate"})]})]}),y.length>0&&e.jsxs("div",{className:t.historyFilters,children:[e.jsxs("div",{className:t.historySearch,children:[e.jsx(Z,{size:14}),e.jsx("input",{type:"text",placeholder:"Search tasks...",value:ae,onChange:s=>jt(s.target.value)}),ae&&e.jsx("button",{className:t.clearSearch,onClick:()=>jt(""),children:e.jsx(re,{size:12})})]}),e.jsxs("select",{className:t.statusFilter,value:he,onChange:s=>ps(s.target.value),children:[e.jsx("option",{value:"all",children:"All Status"}),e.jsx("option",{value:"completed",children:"Completed"}),e.jsx("option",{value:"running",children:"Running"}),e.jsx("option",{value:"failed",children:"Failed"}),e.jsx("option",{value:"cancelled",children:"Cancelled"})]})]}),y.length===0&&e.jsx("div",{className:t.emptyState,children:"No recent background tasks yet."}),y.length>0&&Me.length===0&&e.jsx("div",{className:t.emptyState,children:"No tasks match your search."}),Me.length>0&&e.jsx("div",{className:t.taskList,children:Me.map(s=>{var n,r;return e.jsxs("div",{className:t.taskRow,children:[e.jsxs("div",{className:t.taskRowMain,children:[e.jsxs("div",{className:t.taskStatusIcon,children:[s.status==="completed"&&e.jsx(Ye,{size:14,className:t.complete}),s.status==="failed"&&e.jsx(ye,{size:14,className:t.error}),s.status==="cancelled"&&e.jsx(Ke,{size:14,className:t.cancelled}),s.status==="running"&&e.jsx(M,{size:14,className:t.spin})]}),e.jsxs("div",{className:t.taskRowContent,children:[e.jsx("div",{className:t.taskGoalSmall,children:s.goal}),e.jsxs("div",{className:t.taskRowMeta,children:[e.jsx("span",{className:`${t.taskStatusBadge} ${t[s.status]}`,children:s.status}),((n=s.progress)==null?void 0:n.iterations)&&e.jsxs("span",{className:t.taskIterations,children:[s.progress.iterations," steps"]})]})]})]}),e.jsxs("div",{className:t.taskRowProgress,children:[Xe((r=s.progress)==null?void 0:r.progressPercent,0),"%"]})]},s.id)})})]})]}),e.jsxs("div",{className:t.capabilitiesCard,children:[e.jsx("div",{className:t.capabilitiesHeader,children:e.jsxs("div",{className:t.capabilitiesTitle,children:[e.jsx(le,{size:20}),e.jsxs("div",{children:[e.jsx("h2",{children:"What the Agent Can Do"}),e.jsx("p",{children:"The background agent can autonomously perform these actions on your behalf"})]})]})}),e.jsxs("div",{className:t.capabilitiesGrid,children:[e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(V,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Matters & Cases"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Create and update matters"}),e.jsx("li",{children:"Generate case assessments"}),e.jsx("li",{children:"Identify critical deadlines"}),e.jsx("li",{children:"Run conflict checks"})]})]})]}),e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(R,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Documents"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Analyze and summarize documents"}),e.jsx("li",{children:"Extract key terms and clauses"}),e.jsx("li",{children:"Draft document outlines"}),e.jsx("li",{children:"Create document indexes"})]})]})]}),e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(z,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Time & Billing"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Review time entries"}),e.jsx("li",{children:"Suggest billing descriptions"}),e.jsx("li",{children:"Prepare invoice summaries"}),e.jsx("li",{children:"Identify unbilled work"})]})]})]}),e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(We,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Clients & Communication"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Prepare client updates"}),e.jsx("li",{children:"Draft correspondence"}),e.jsx("li",{children:"Create intake checklists"}),e.jsx("li",{children:"Generate status reports"})]})]})]}),e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(Ne,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Calendar & Tasks"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Review upcoming deadlines"}),e.jsx("li",{children:"Create task lists"}),e.jsx("li",{children:"Schedule reminders"}),e.jsx("li",{children:"Audit calendar compliance"})]})]})]}),e.jsxs("div",{className:t.capabilityCategory,children:[e.jsx("div",{className:t.capabilityIcon,children:e.jsx(F,{size:18})}),e.jsxs("div",{className:t.capabilityInfo,children:[e.jsx("h4",{children:"Legal Research"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Research statute of limitations"}),e.jsx("li",{children:"Identify relevant court rules"}),e.jsx("li",{children:"Check NY CPLR requirements"}),e.jsx("li",{children:"Prepare legal memos"})]})]})]})]}),(k==null?void 0:k.categories)&&e.jsxs("details",{className:t.toolsDetails,children:[e.jsxs("summary",{className:t.toolsSummary,children:[e.jsx(es,{size:14}),e.jsxs("span",{children:["View All ",k.categories.reduce((s,n)=>s+n.tools.length,0)," Tools"]})]}),e.jsx("div",{className:t.toolGrid,children:k.categories.map(s=>e.jsxs("div",{className:t.toolCategory,children:[e.jsxs("div",{className:t.toolHeader,children:[e.jsx("span",{children:s.name}),e.jsx("span",{className:t.toolCount,children:s.tools.length})]}),e.jsx("ul",{children:s.tools.map(n=>e.jsx("li",{children:n},n))})]},s.name))})]})]}),e.jsxs("div",{className:t.learningCard,children:[e.jsxs("div",{className:t.learningHeader,onClick:()=>xs(!Ge),children:[e.jsxs("div",{className:t.learningTitle,children:[e.jsx(Zt,{size:20}),e.jsxs("div",{children:[e.jsx("h2",{children:"Your Personal AI"}),e.jsx("p",{children:"The agent learns from your feedback and adapts to your work style"})]})]}),e.jsxs("div",{className:t.learningStats,children:[Et&&e.jsx(e.Fragment,{children:e.jsxs("div",{className:t.statBadge,children:[e.jsx(Os,{size:14}),e.jsxs("span",{children:[Et.completedTasks," tasks completed"]})]})}),e.jsx("button",{className:t.expandBtn,children:Ge?e.jsx(Xt,{size:18}):e.jsx(Qt,{size:18})})]})]}),Ge&&e.jsxs("div",{className:t.learningContent,children:[e.jsxs("div",{className:t.privacyNotice,children:[e.jsx(oe,{size:16}),e.jsxs("span",{children:[e.jsx("strong",{children:"Your AI is private."})," All learnings are stored securely per-user. Other users can't access your AI's personalized insights."]})]}),e.jsxs("div",{className:t.learningsList,children:[e.jsxs("div",{className:t.learningsListHeader,children:[e.jsx(Ve,{size:16}),e.jsx("h4",{children:"What I've Learned About Your Preferences"}),wt&&e.jsx(M,{size:14,className:t.spin})]}),qe.length===0&&!wt&&e.jsxs("div",{className:t.noLearnings,children:[e.jsx("p",{children:"I haven't learned any preferences yet."}),e.jsx("p",{className:t.learningHint,children:"Complete tasks and provide feedback to help me learn your style. I'll remember your preferences for document formatting, communication style, billing descriptions, and more."})]}),qe.length>0&&e.jsx("div",{className:t.learningItems,children:qe.map((s,n)=>e.jsxs("div",{className:t.learningItem,children:[e.jsxs("div",{className:t.learningInsight,children:[e.jsx("span",{className:t.learningType,children:s.type}),e.jsx("span",{children:s.insight})]}),s.usageCount&&s.usageCount>1&&e.jsxs("span",{className:t.usageCount,children:["Used ",s.usageCount,"x"]})]},s.id||n))})]}),e.jsxs("div",{className:t.personalizationTips,children:[e.jsx("h4",{children:"How to Personalize Your AI"}),e.jsxs("div",{className:t.tipsGrid,children:[e.jsxs("div",{className:t.tipCard,children:[e.jsx(je,{size:16}),e.jsx("span",{children:"Rate completed tasks to teach preferences"})]}),e.jsxs("div",{className:t.tipCard,children:[e.jsx(ts,{size:16}),e.jsx("span",{children:"Provide corrections when output isn't right"})]}),e.jsxs("div",{className:t.tipCard,children:[e.jsx(Us,{size:16}),e.jsx("span",{children:"Set custom instructions in AI Settings"})]})]})]})]})]}),hs&&e.jsx("div",{className:t.modalOverlay,onClick:fe,children:e.jsxs("div",{className:t.feedbackModal,onClick:s=>s.stopPropagation(),children:[e.jsxs("div",{className:t.modalHeader,children:[e.jsx("h3",{children:"Rate This Task"}),e.jsx("button",{className:t.modalClose,onClick:fe,children:e.jsx(re,{size:18})})]}),e.jsxs("div",{className:t.modalBody,children:[e.jsxs("div",{className:t.ratingSection,children:[e.jsx("label",{children:"How did the agent perform?"}),e.jsx("div",{className:t.starRating,children:[1,2,3,4,5].map(s=>e.jsx("button",{className:`${t.starBtn} ${T>=s?t.starActive:""}`,onClick:()=>Fe(s),type:"button",children:e.jsx(je,{size:28,fill:T>=s?"#f59e0b":"none"})},s))}),e.jsxs("div",{className:t.ratingLabel,children:[T===0&&"Click to rate",T===1&&"Poor",T===2&&"Fair",T===3&&"Good",T===4&&"Very Good",T===5&&"Excellent"]})]}),e.jsxs("div",{className:t.feedbackField,children:[e.jsx("label",{children:"Additional feedback (optional)"}),e.jsx("textarea",{className:t.feedbackTextarea,placeholder:"What did you like or dislike about the result?",value:_e,onChange:s=>Oe(s.target.value),rows:3})]}),e.jsxs("div",{className:t.feedbackField,children:[e.jsx("label",{children:"What should the agent have done differently? (optional)"}),e.jsx("textarea",{className:t.feedbackTextarea,placeholder:"Describe how you would have preferred the task to be handled...",value:xe,onChange:s=>Ue(s.target.value),rows:3}),e.jsx("div",{className:t.feedbackHint,children:"This helps the agent learn and improve for future tasks."})]})]}),e.jsxs("div",{className:t.modalFooter,children:[e.jsx("button",{className:t.modalCancelBtn,onClick:fe,children:"Cancel"}),e.jsx("button",{className:t.modalSubmitBtn,onClick:Cs,disabled:He||T===0&&!_e.trim()&&!xe.trim(),children:He?e.jsxs(e.Fragment,{children:[e.jsx(M,{size:14,className:t.spin}),"Submitting..."]}):"Submit Feedback"})]})]})}),Y&&e.jsx("div",{className:t.toolConfirmModal,children:e.jsxs("div",{className:t.toolConfirmContent,children:[e.jsxs("div",{className:t.toolConfirmHeader,children:[e.jsx(ve,{size:24}),e.jsx("h3",{children:"Confirm Action"})]}),e.jsxs("div",{className:t.toolConfirmBody,children:[e.jsx("div",{className:t.toolConfirmName,children:Y.toolName}),e.jsx("div",{className:t.toolConfirmDesc,children:Y.toolDescription}),Object.keys(Y.parameters).length>0&&e.jsxs("div",{className:t.toolConfirmParams,children:[e.jsx("h4",{children:"Parameters"}),e.jsx("pre",{children:JSON.stringify(Y.parameters,null,2)})]}),e.jsxs("div",{className:t.toolConfirmImpact,children:[e.jsx(ve,{size:16}),e.jsx("span",{children:Y.estimatedImpact})]})]}),e.jsxs("div",{className:t.toolConfirmActions,children:[e.jsx("button",{className:t.toolConfirmCancel,onClick:()=>{ut(null),gt(null)},children:"Cancel"}),e.jsxs("button",{className:t.toolConfirmApprove,onClick:()=>{pt&&pt(),ut(null),gt(null)},children:[e.jsx(Hs,{size:16}),"Approve & Continue"]})]})]})}),ds&&e.jsx(An,{onSelect:ms,onClose:()=>De(!1)})]})}export{Gl as BackgroundAgentPage};
