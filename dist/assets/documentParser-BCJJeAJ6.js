const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/pdf-worker-CVmCB3lP.js","assets/doc-parsers-U1nJMjtM.js","assets/vendor-DrKzkH4x.js","assets/react-dom-DfB-QKj2.js"])))=>i.map(i=>d[i]);
import{_ as g}from"./index-CCWWoMiH.js";async function E(){const n=await g(()=>import("./pdf-worker-CVmCB3lP.js").then(r=>r.p),__vite__mapDeps([0,1,2,3]));if(n.GlobalWorkerOptions.workerSrc)return n;const e=["/pdf.worker.min.js","/pdf.worker.js","https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js","https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js"];for(const r of e)try{if(r.startsWith("/")){if((await fetch(r,{method:"HEAD"})).ok)return n.GlobalWorkerOptions.workerSrc=r,console.log(`PDF.js worker loaded from: ${r}`),n}else return n.GlobalWorkerOptions.workerSrc=r,console.log(`PDF.js worker set to CDN: ${r}`),n}catch(t){console.warn(`Failed to load PDF worker from ${r}:`,t)}return console.warn("Using PDF.js without worker (slower performance)"),n.GlobalWorkerOptions.workerSrc="",n}async function T(n,e){try{const r=await E(),t=new Uint8Array(n),a=await r.getDocument({data:t,useSystemFonts:!0,disableFontFace:!0,isEvalSupported:!1,useWorkerFetch:!1,verbosity:0}).promise,s=a.numPages;let i="",p=!1;for(let l=1;l<=s;l++)try{const f=await(await a.getPage(l)).getTextContent();let d="",m=null;for(const y of f.items){const u=y;u.str&&(m!==null&&Math.abs(u.transform[5]-m)>5?d+=`
`:d&&!d.endsWith(" ")&&!u.str.startsWith(" ")&&(d+=" "),d+=u.str,m=u.transform[5])}d=d.trim(),d&&(p=!0,i+=`
--- Page ${l} ---
${d}
`)}catch(c){console.warn(`Error extracting page ${l}:`,c),i+=`
--- Page ${l} ---
[Error extracting this page]
`}return p?{success:!0,content:`[PDF FILE: ${e}]

Extracted content from PDF (${s} page${s>1?"s":""}):
${i}`,fileName:e,fileType:"application/pdf",pageCount:s}:{success:!1,content:`[PDF FILE: ${e}]

This PDF appears to be scanned or image-based with no extractable text.

To analyze this document, please try one of these options:
1. If you have the original editable version, upload that instead
2. Use OCR software (like Adobe Acrobat Pro) to create a searchable PDF
3. Copy and paste the text content manually
4. Describe the document contents and I can help analyze based on your description`,fileName:e,fileType:"application/pdf",pageCount:s,error:"No extractable text found - likely a scanned document"}}catch(r){const t=r instanceof Error?r.message:"Unknown error";return console.error("PDF extraction error:",r),{success:!1,content:`[PDF FILE: ${e}]

Unable to extract text from this PDF. Error: ${t}

This may be due to:
- The PDF is password protected
- The PDF is corrupted or malformed
- The PDF uses an unsupported format

Please try:
1. Opening the PDF in a viewer and copying the text manually
2. Re-saving the PDF with a different application
3. Describing the content you need analyzed`,fileName:e,fileType:"application/pdf",error:t}}}async function w(n,e){try{const t=await(await g(()=>import("./doc-parsers-U1nJMjtM.js").then(i=>i.i),__vite__mapDeps([1,2,3,0]))).extractRawText({arrayBuffer:n}),o=t.value.trim();if(!o)return{success:!1,content:`[WORD DOCUMENT: ${e}]

This document appears to be empty or contains only non-text content (images, charts, tables without text, etc.).

If this document has content you expected to be extracted, please:
1. Check if the content is in embedded images
2. Try saving the document as plain text (.txt) and re-uploading`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",error:"No text content found"};const a=t.messages.filter(i=>i.type==="warning").map(i=>i.message).slice(0,3);let s="";return a.length>0&&(s=`

[Note: Some formatting may have been simplified during extraction]`),{success:!0,content:`[WORD DOCUMENT: ${e}]

Extracted content:
${o}${s}`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}}catch(r){const t=r instanceof Error?r.message:"Unknown error";return console.error("DOCX extraction error:",r),{success:!1,content:`[WORD DOCUMENT: ${e}]

Unable to extract text from this Word document. Error: ${t}

The file may be:
- Corrupted or damaged
- Password protected
- Not a valid DOCX file

Please try re-saving the document or converting it to PDF.`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",error:t}}}async function b(n,e){try{const r=new Uint8Array(n);let t="";try{const i=new TextDecoder("utf-16le",{fatal:!1}).decode(n).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g," ").replace(/\s+/g," ").trim();i.length>100&&(t=i)}catch{}if(!t||t.length<100){const i=new TextDecoder("utf-8",{fatal:!1}).decode(n).replace(/[^\x20-\x7E\n\r\t\u00A0-\u00FF\u0100-\u017F]/g," ").replace(/\s+/g," ").trim();i.length>t.length&&(t=i)}if(!t||t.length<50){const a=/[A-Za-z]{3,}(?:\s+[A-Za-z]{2,})*/g;t=(new TextDecoder("utf-8",{fatal:!1}).decode(n).match(a)||[]).join(" ").trim()}if(t.length<50)return{success:!1,content:`[LEGACY WORD DOCUMENT: ${e}]

This is a legacy .doc format file. Unable to extract meaningful text.

For best results, please:
1. Open the document in Microsoft Word
2. Save it as .docx format (File > Save As > Word Document)
3. Upload the .docx version

Alternatively, you can copy and paste the text content directly.`,fileName:e,fileType:"application/msword",error:"Unable to extract text from legacy DOC format"};const o=t.substring(0,1e5);return{success:!0,content:`[LEGACY WORD DOCUMENT: ${e}]

Extracted content (some formatting may be lost):
${o}

[Note: This is a legacy .doc format. For better extraction, consider converting to .docx]`,fileName:e,fileType:"application/msword"}}catch(r){const t=r instanceof Error?r.message:"Unknown error";return console.error("DOC extraction error:",r),{success:!1,content:`[LEGACY WORD DOCUMENT: ${e}]

Unable to process this legacy Word document. Error: ${t}

Please convert to .docx format for reliable text extraction.`,fileName:e,fileType:"application/msword",error:t}}}async function F(n,e){try{const r=await g(()=>import("./doc-parsers-U1nJMjtM.js").then(s=>s.x),__vite__mapDeps([1,2,3,0])),t=r.read(n,{type:"array"});let o="",a=0;for(const s of t.SheetNames){const i=t.Sheets[s],p=r.utils.sheet_to_csv(i),l=p.split(`
`).filter(c=>c.trim()).length;a+=l,o+=`
--- Sheet: ${s} (${l} rows) ---
${p}
`}return a===0?{success:!1,content:`[EXCEL FILE: ${e}]

This spreadsheet appears to be empty.`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",error:"Empty spreadsheet"}:{success:!0,content:`[EXCEL FILE: ${e}]

Spreadsheet with ${t.SheetNames.length} sheet(s), ${a} total rows:
${o}`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}}catch(r){const t=r instanceof Error?r.message:"Unknown error";return console.error("Excel extraction error:",r),{success:!1,content:`[EXCEL FILE: ${e}]

Unable to extract data from this Excel file. Error: ${t}

The file may be corrupted or password protected.`,fileName:e,fileType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",error:t}}}function $(n,e){try{const r=n.replace(/^\{\\rtf\d+[^}]*\}?/i,"").replace(/\{\\fonttbl[^}]*\}/gi,"").replace(/\{\\colortbl[^}]*\}/gi,"").replace(/\{\\stylesheet[^}]*\}/gi,"").replace(/\{\\info[^}]*\}/gi,"").replace(/\\'([0-9a-f]{2})/gi,(t,o)=>String.fromCharCode(parseInt(o,16))).replace(/\\([a-z]+)(-?\d+)? ?/gi,(t,o)=>o==="par"||o==="line"?`
`:o==="tab"?"	":"").replace(/[{}]/g,"").replace(/\n\s*\n\s*\n/g,`

`).replace(/[ \t]+/g," ").trim();return r.length<10?{success:!1,content:`[RTF FILE: ${e}]

Unable to extract meaningful text from this RTF file.

Please try converting to a different format (TXT, DOCX, or PDF).`,fileName:e,fileType:"application/rtf",error:"No extractable text"}:{success:!0,content:`[RTF FILE: ${e}]

Extracted content:
${r}`,fileName:e,fileType:"application/rtf"}}catch(r){const t=r instanceof Error?r.message:"Unknown error";return{success:!1,content:`[RTF FILE: ${e}]

Unable to parse this RTF file. Error: ${t}`,fileName:e,fileType:"application/rtf",error:t}}}function D(n,e){var r;try{const t=[];let o=null,a="",s="";const i=n.split(/\r?\n/);for(const l of i){if(l.startsWith(" ")||l.startsWith("	")){s+=l.substring(1);continue}if(a&&o){const f=s.replace(/\\n/g,`
`).replace(/\\,/g,",").replace(/\\;/g,";");switch(a){case"SUMMARY":o.summary=f;break;case"DESCRIPTION":o.description=f;break;case"LOCATION":o.location=f;break;case"DTSTART":o.start=h(f);break;case"DTEND":o.end=h(f);break;case"ORGANIZER":o.organizer=x(f);break;case"ATTENDEE":o.attendees||(o.attendees=[]),o.attendees.push(x(f));break}}const c=l.indexOf(":");c>0&&(a=l.substring(0,c).split(";")[0].toUpperCase(),s=l.substring(c+1),a==="BEGIN"&&s.toUpperCase()==="VEVENT"?o={}:a==="END"&&s.toUpperCase()==="VEVENT"&&(o&&o.summary&&t.push(o),o=null))}if(t.length===0)return{success:!1,content:`[CALENDAR FILE: ${e}]

No events found in this calendar file.

The file may be empty or in an unsupported format.`,fileName:e,fileType:"text/calendar",error:"No events found"};let p=`[CALENDAR FILE: ${e}]

Found ${t.length} event(s):
`;for(let l=0;l<t.length;l++){const c=t[l];p+=`
--- Event ${l+1} ---
`,c.summary&&(p+=`Title: ${c.summary}
`),c.start&&(p+=`Start: ${c.start}
`),c.end&&(p+=`End: ${c.end}
`),c.location&&(p+=`Location: ${c.location}
`),c.organizer&&(p+=`Organizer: ${c.organizer}
`),(r=c.attendees)!=null&&r.length&&(p+=`Attendees: ${c.attendees.join(", ")}
`),c.description&&(p+=`Description: ${c.description}
`)}return{success:!0,content:p,fileName:e,fileType:"text/calendar"}}catch(t){const o=t instanceof Error?t.message:"Unknown error";return{success:!1,content:`[CALENDAR FILE: ${e}]

Unable to parse this calendar file. Error: ${o}

Please ensure it's a valid iCalendar (.ics) format file.`,fileName:e,fileType:"text/calendar",error:o}}}function h(n){try{const e=n.replace(/[^0-9TZ]/g,"");if(e.length>=8){const r=e.substring(0,4),t=e.substring(4,6),o=e.substring(6,8);let a=`${r}-${t}-${o}`;if(e.length>=15){const s=e.substring(9,11),i=e.substring(11,13);a+=` ${s}:${i}`,e.includes("Z")&&(a+=" UTC")}return a}return n}catch{return n}}function x(n){const e=n.match(/mailto:([^\s;]+)/i);if(e)return e[1];const r=n.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);if(r)return r[1];const t=n.match(/CN=([^;:]+)/i);return t?t[1]:n}async function L(n,e,r){var t;try{const o=await C(n);return{success:!0,content:`[IMAGE FILE: ${e}]

This is an image file that will be analyzed using AI vision capabilities.
The AI can read text from this image, describe its contents, and answer questions about it.`,fileName:e,fileType:r,imageData:{base64:o,mimeType:r||`image/${((t=e.split(".").pop())==null?void 0:t.toLowerCase())||"png"}`}}}catch(o){const a=o instanceof Error?o.message:"Unknown error";return{success:!1,content:`[IMAGE FILE: ${e}]

Failed to process this image file. Error: ${a}

Please try:
1. Re-uploading the image
2. Using a different image format (PNG, JPG, WEBP)
3. Ensuring the image file is not corrupted`,fileName:e,fileType:r,error:a}}}function C(n){return new Promise((e,r)=>{const t=new FileReader;t.onload=()=>{const a=t.result.split(",")[1];e(a)},t.onerror=()=>r(new Error("Failed to read file")),t.readAsDataURL(n)})}function P(n,e){var a;const r=((a=e.split(".").pop())==null?void 0:a.toLowerCase())||"txt",o={txt:"TEXT FILE",csv:"CSV FILE",json:"JSON FILE",xml:"XML FILE",html:"HTML FILE",htm:"HTML FILE",md:"MARKDOWN FILE",markdown:"MARKDOWN FILE",log:"LOG FILE",ini:"CONFIG FILE",cfg:"CONFIG FILE",yaml:"YAML FILE",yml:"YAML FILE"}[r]||"FILE";if(!n.trim())return{success:!1,content:`[${o}: ${e}]

This file appears to be empty.`,fileName:e,fileType:`text/${r}`,error:"Empty file"};if(r==="json")try{const s=JSON.parse(n);n=JSON.stringify(s,null,2)}catch{}return{success:!0,content:`[${o}: ${e}]

Content:
${n}`,fileName:e,fileType:`text/${r}`}}async function v(n){var o;const e=n.name,r=n.type||"",t=((o=e.split(".").pop())==null?void 0:o.toLowerCase())||"";console.log(`Parsing document: ${e} (type: ${r}, ext: ${t})`);try{if(r.startsWith("image/")||["png","jpg","jpeg","gif","bmp","tiff","webp","svg"].includes(t))return await L(n,e,r||`image/${t}`);if(r==="application/pdf"||t==="pdf"){const s=await n.arrayBuffer();return await T(s,e)}if(r==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"||t==="docx"){const s=await n.arrayBuffer();return await w(s,e)}if(r==="application/msword"||t==="doc"){const s=await n.arrayBuffer();return await b(s,e)}if(r==="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"||r==="application/vnd.ms-excel"||["xlsx","xls"].includes(t)){const s=await n.arrayBuffer();return await F(s,e)}if(r==="text/calendar"||["ics","cal","ical","ifb","vcs"].includes(t)){const s=await n.text();return D(s,e)}if(r==="application/rtf"||r==="text/rtf"||t==="rtf"){const s=await n.text();return $(s,e)}const a=await n.text();return P(a,e)}catch(a){const s=a instanceof Error?a.message:"Unknown error";return console.error(`Error parsing ${e}:`,a),{success:!1,content:`[FILE: ${e}]

An unexpected error occurred while processing this file: ${s}

Please try:
1. Re-uploading the file
2. Converting to a different format (PDF, DOCX, or TXT)
3. Copying and pasting the text content directly`,fileName:e,fileType:r,error:s}}}function k(){return[".pdf",".doc",".docx",".rtf",".txt",".xlsx",".xls",".csv",".ics",".cal",".ical",".vcs",".json",".xml",".yaml",".yml",".html",".htm",".md",".markdown",".png",".jpg",".jpeg",".gif",".bmp",".tiff",".webp"].join(",")}export{k as g,v as p};
