(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))r(e);new MutationObserver(e=>{for(const s of e)if(s.type==="childList")for(const n of s.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&r(n)}).observe(document,{childList:!0,subtree:!0});function a(e){const s={};return e.integrity&&(s.integrity=e.integrity),e.referrerPolicy&&(s.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?s.credentials="include":e.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(e){if(e.ep)return;e.ep=!0;const s=a(e);fetch(e.href,s)}})();const q={USD:"$",EUR:"€",GBP:"£",CAD:"C$",AUD:"A$"};let d=[],C=0;const l={itemsContainer:document.getElementById("items-container"),addItemBtn:document.getElementById("add-item"),invoicePreview:document.getElementById("invoice-preview"),downloadBtn:document.getElementById("btn-download"),previewRefreshBtn:document.getElementById("btn-preview-refresh"),paymentModal:document.getElementById("payment-modal"),successModal:document.getElementById("success-modal"),modalCloseBtn:document.getElementById("modal-close"),payStripeBtn:document.getElementById("btn-pay-stripe"),progressFill:document.getElementById("progress-fill"),progressText:document.getElementById("progress-text"),previewSubtotal:document.getElementById("preview-subtotal"),previewTax:document.getElementById("preview-tax"),previewDiscount:document.getElementById("preview-discount"),previewTotal:document.getElementById("preview-total")};function A(){M(),z(),I(),f(),R()}function M(){const o=new Date,t=new Date(o);t.setDate(t.getDate()+30),document.getElementById("invoice-date").value=S(o),document.getElementById("due-date").value=S(t);const a=`INV-${String(Math.floor(Math.random()*9999)+1).padStart(4,"0")}`;document.getElementById("invoice-number").value=a}function S(o){return o.toISOString().split("T")[0]}function w(o){return o?new Date(o).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}):""}function z(){l.addItemBtn.addEventListener("click",I),document.querySelectorAll("input, select, textarea").forEach(t=>{t.addEventListener("input",()=>{E(),f()}),t.addEventListener("change",()=>{E(),f()})}),l.downloadBtn.addEventListener("click",W),l.previewRefreshBtn.addEventListener("click",f),l.modalCloseBtn.addEventListener("click",b),l.paymentModal.addEventListener("click",t=>{t.target===l.paymentModal&&b()}),l.payStripeBtn.addEventListener("click",U)}function I(){const o=++C;d.push({id:o,description:"",quantity:1,rate:0});const t=document.createElement("div");t.className="item-row",t.dataset.itemId=o,t.innerHTML=`
    <input type="text" class="item-desc" placeholder="Description of service or product" data-field="description">
    <input type="number" class="item-qty" value="1" min="1" step="1" data-field="quantity">
    <input type="number" class="item-rate" placeholder="0.00" min="0" step="0.01" data-field="rate">
    <input type="text" class="item-amount" readonly value="${$()}0.00">
    <button type="button" class="btn-remove" title="Remove item">&times;</button>
  `,l.itemsContainer.appendChild(t),t.querySelectorAll("input:not([readonly])").forEach(r=>{r.addEventListener("input",()=>B(o,r)),r.addEventListener("change",()=>B(o,r))}),t.querySelector(".btn-remove").addEventListener("click",()=>O(o)),f()}function B(o,t){const a=d.find(y=>y.id===o);if(!a)return;const r=t.dataset.field;let e=t.value;r==="quantity"?e=parseInt(e)||0:r==="rate"&&(e=parseFloat(e)||0),a[r]=e;const n=t.closest(".item-row").querySelector(".item-amount"),p=(a.quantity||0)*(a.rate||0);n.value=`${$()}${p.toFixed(2)}`,E(),f()}function O(o){d=d.filter(a=>a.id!==o);const t=document.querySelector(`.item-row[data-item-id="${o}"]`);t&&t.remove(),d.length===0&&I(),E(),f()}function $(){const o=document.getElementById("currency").value;return q[o]||"$"}function D(){const o=$(),t=d.reduce((n,p)=>n+(p.quantity||0)*(p.rate||0),0),a=parseFloat(document.getElementById("tax-rate").value)||0,r=t*(a/100),e=parseFloat(document.getElementById("discount").value)||0,s=t+r-e;return{subtotal:t,taxRate:a,taxAmount:r,discount:e,total:s,symbol:o}}function f(){const o=F(),t=D(),a=t.symbol;l.previewSubtotal.textContent=`${a}${t.subtotal.toFixed(2)}`,l.previewTax.textContent=`${a}${t.taxAmount.toFixed(2)}`,l.previewDiscount.textContent=`-${a}${t.discount.toFixed(2)}`,l.previewTotal.textContent=`${a}${t.total.toFixed(2)}`;const r=d.filter(e=>e.description||e.rate>0).map(e=>{const s=(e.quantity||0)*(e.rate||0);return`
        <tr>
          <td>${m(e.description)||"Item"}</td>
          <td>${e.quantity||0}</td>
          <td>${a}${(e.rate||0).toFixed(2)}</td>
          <td>${a}${s.toFixed(2)}</td>
        </tr>
      `}).join("");l.invoicePreview.innerHTML=`
    <div class="preview-header-section">
      <div class="preview-from">
        <h1>${m(o.fromName)||"Your Business"}</h1>
        ${o.fromEmail?`<p>${m(o.fromEmail)}</p>`:""}
        ${o.fromAddress?`<p>${m(o.fromAddress).replace(/\n/g,"<br>")}</p>`:""}
        ${o.fromPhone?`<p>${m(o.fromPhone)}</p>`:""}
        ${o.fromWebsite?`<p>${m(o.fromWebsite)}</p>`:""}
      </div>
      <div class="preview-invoice-info">
        <div class="invoice-title">INVOICE</div>
        <p><strong>#${m(o.invoiceNumber)||"INV-0001"}</strong></p>
        <p>Date: ${w(o.invoiceDate)}</p>
        ${o.dueDate?`<p>Due: ${w(o.dueDate)}</p>`:""}
      </div>
    </div>
    
    <div class="preview-bill-to">
      <h2>Bill To</h2>
      <p><strong>${m(o.toName)||"Client Name"}</strong></p>
      ${o.toEmail?`<p>${m(o.toEmail)}</p>`:""}
      ${o.toAddress?`<p>${m(o.toAddress).replace(/\n/g,"<br>")}</p>`:""}
    </div>
    
    <table class="preview-items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${r||'<tr><td colspan="4" style="text-align: center; color: #9ca3af;">Add line items above</td></tr>'}
      </tbody>
    </table>
    
    <div class="preview-totals">
      <div class="total-line">
        <span>Subtotal</span>
        <span>${a}${t.subtotal.toFixed(2)}</span>
      </div>
      ${t.taxRate>0?`
        <div class="total-line">
          <span>Tax (${t.taxRate}%)</span>
          <span>${a}${t.taxAmount.toFixed(2)}</span>
        </div>
      `:""}
      ${t.discount>0?`
        <div class="total-line">
          <span>Discount</span>
          <span>-${a}${t.discount.toFixed(2)}</span>
        </div>
      `:""}
      <div class="total-line grand-total">
        <span>Total Due</span>
        <span>${a}${t.total.toFixed(2)}</span>
      </div>
    </div>
    
    ${o.notes?`
      <div class="preview-notes">
        <h3>Notes</h3>
        <p>${m(o.notes)}</p>
      </div>
    `:""}
  `}function F(){return{fromName:document.getElementById("from-name").value,fromEmail:document.getElementById("from-email").value,fromAddress:document.getElementById("from-address").value,fromPhone:document.getElementById("from-phone").value,fromWebsite:document.getElementById("from-website").value,toName:document.getElementById("to-name").value,toEmail:document.getElementById("to-email").value,toAddress:document.getElementById("to-address").value,invoiceNumber:document.getElementById("invoice-number").value,invoiceDate:document.getElementById("invoice-date").value,dueDate:document.getElementById("due-date").value,currency:document.getElementById("currency").value,taxRate:document.getElementById("tax-rate").value,discount:document.getElementById("discount").value,notes:document.getElementById("notes").value}}function m(o){return o?o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}function E(){const o={formData:F(),items:d};localStorage.setItem("invoiceforge-data",JSON.stringify(o))}function R(){const o=localStorage.getItem("invoiceforge-data");if(o)try{const t=JSON.parse(o);t.formData&&Object.entries(t.formData).forEach(([a,r])=>{const s={fromName:"from-name",fromEmail:"from-email",fromAddress:"from-address",fromPhone:"from-phone",fromWebsite:"from-website",toName:"to-name",toEmail:"to-email",toAddress:"to-address",invoiceNumber:"invoice-number",invoiceDate:"invoice-date",dueDate:"due-date",currency:"currency",taxRate:"tax-rate",discount:"discount",notes:"notes"}[a];if(s){const n=document.getElementById(s);n&&r&&(n.value=r)}}),t.items&&t.items.length>0&&(l.itemsContainer.innerHTML="",d=[],C=0,t.items.forEach(a=>{I();const r=d[d.length-1];r.description=a.description,r.quantity=a.quantity,r.rate=a.rate;const e=document.querySelector(`.item-row[data-item-id="${r.id}"]`);if(e){e.querySelector(".item-desc").value=a.description||"",e.querySelector(".item-qty").value=a.quantity||1,e.querySelector(".item-rate").value=a.rate||"";const s=(a.quantity||0)*(a.rate||0);e.querySelector(".item-amount").value=`${$()}${s.toFixed(2)}`}})),f()}catch(t){console.error("Error loading saved data:",t)}}function W(){const o=document.getElementById("from-name").value.trim(),t=document.getElementById("to-name").value.trim(),a=document.getElementById("invoice-number").value.trim(),r=document.getElementById("invoice-date").value,e=[];if(o||e.push("Business Name"),t||e.push("Client Name"),a||e.push("Invoice Number"),r||e.push("Invoice Date"),d.some(n=>n.description&&n.rate>0)||e.push("At least one line item"),e.length>0){alert(`Please fill in the required fields:

• ${e.join(`
• `)}`);return}l.paymentModal.classList.add("active")}function b(){l.paymentModal.classList.remove("active")}async function U(){b(),T(),await N()}function T(){l.successModal.classList.add("active")}function H(){l.successModal.classList.remove("active")}async function N(){const o=l.progressFill,t=l.progressText;o.style.width="20%",t.textContent="Processing payment...",await x(500),o.style.width="50%",t.textContent="Payment successful!",await x(500),o.style.width="75%",t.textContent="Generating PDF...",await x(500),await V(),o.style.width="100%",t.textContent="Download complete!",await x(1e3),H(),o.style.width="0%"}async function V(){const{jsPDF:o}=window.jspdf,t=F(),a=D(),r=a.symbol,e=new o({orientation:"portrait",unit:"mm",format:"a4"}),s=e.internal.pageSize.getWidth(),n=20,p=s-n*2,y=[37,99,235],v=[31,41,55],u=[107,114,128];e.setFontSize(24),e.setTextColor(...y),e.setFont("helvetica","bold"),e.text(t.fromName||"Your Business",n,25),e.setFontSize(10),e.setTextColor(...u),e.setFont("helvetica","normal");let i=32;t.fromEmail&&(e.text(t.fromEmail,n,i),i+=5),t.fromAddress&&t.fromAddress.split(`
`).forEach(h=>{e.text(h,n,i),i+=5}),t.fromPhone&&(e.text(t.fromPhone,n,i),i+=5),t.fromWebsite&&e.text(t.fromWebsite,n,i),e.setFontSize(28),e.setTextColor(...v),e.setFont("helvetica","bold"),e.text("INVOICE",s-n,25,{align:"right"}),e.setFontSize(12),e.setFont("helvetica","normal"),e.text(`#${t.invoiceNumber||"INV-0001"}`,s-n,33,{align:"right"}),e.setFontSize(10),e.setTextColor(...u),e.text(`Date: ${w(t.invoiceDate)}`,s-n,42,{align:"right"}),t.dueDate&&e.text(`Due: ${w(t.dueDate)}`,s-n,48,{align:"right"}),e.setDrawColor(...y),e.setLineWidth(.5),e.line(n,58,s-n,58),i=70,e.setFontSize(9),e.setTextColor(...u),e.setFont("helvetica","bold"),e.text("BILL TO",n,i),i+=7,e.setFontSize(12),e.setTextColor(...v),e.setFont("helvetica","bold"),e.text(t.toName||"Client Name",n,i),i+=6,e.setFontSize(10),e.setFont("helvetica","normal"),e.setTextColor(...u),t.toEmail&&(e.text(t.toEmail,n,i),i+=5),t.toAddress&&t.toAddress.split(`
`).forEach(h=>{e.text(h,n,i),i+=5}),i=Math.max(i+10,110),e.setFillColor(248,250,252),e.rect(n,i-5,p,10,"F"),e.setFontSize(8),e.setTextColor(...u),e.setFont("helvetica","bold"),e.text("DESCRIPTION",n+3,i),e.text("QTY",n+100,i),e.text("RATE",n+120,i),e.text("AMOUNT",s-n-3,i,{align:"right"}),i+=8,e.setFont("helvetica","normal"),e.setTextColor(...v),e.setFontSize(10),d.filter(c=>c.description||c.rate>0).forEach(c=>{const h=(c.quantity||0)*(c.rate||0);e.text(c.description||"Item",n+3,i),e.text(String(c.quantity||0),n+100,i),e.text(`${r}${(c.rate||0).toFixed(2)}`,n+120,i),e.text(`${r}${h.toFixed(2)}`,s-n-3,i,{align:"right"}),e.setDrawColor(229,231,235),e.setLineWidth(.1),e.line(n,i+3,s-n,i+3),i+=10}),i+=10;const g=s-n-60;if(e.setFontSize(10),e.setTextColor(...u),e.text("Subtotal",g,i),e.setTextColor(...v),e.text(`${r}${a.subtotal.toFixed(2)}`,s-n,i,{align:"right"}),a.taxRate>0&&(i+=7,e.setTextColor(...u),e.text(`Tax (${a.taxRate}%)`,g,i),e.setTextColor(...v),e.text(`${r}${a.taxAmount.toFixed(2)}`,s-n,i,{align:"right"})),a.discount>0&&(i+=7,e.setTextColor(...u),e.text("Discount",g,i),e.setTextColor(...v),e.text(`-${r}${a.discount.toFixed(2)}`,s-n,i,{align:"right"})),i+=10,e.setDrawColor(...y),e.setLineWidth(.5),e.line(g-5,i-3,s-n,i-3),e.setFont("helvetica","bold"),e.setFontSize(12),e.setTextColor(...v),e.text("Total Due",g,i+4),e.setTextColor(...y),e.text(`${r}${a.total.toFixed(2)}`,s-n,i+4,{align:"right"}),t.notes){i+=25,e.setFillColor(248,250,252),e.roundedRect(n,i-5,p,30,3,3,"F"),e.setFontSize(8),e.setTextColor(...u),e.setFont("helvetica","bold"),e.text("NOTES",n+5,i),e.setFontSize(9),e.setFont("helvetica","normal"),e.setTextColor(...v);const c=e.splitTextToSize(t.notes,p-10);e.text(c,n+5,i+6)}const L=e.internal.pageSize.getHeight()-15;e.setFontSize(8),e.setTextColor(...u),e.text("Generated by InvoiceForge",s/2,L,{align:"center"});const P=`Invoice-${t.invoiceNumber||"INV-0001"}.pdf`;e.save(P)}function x(o){return new Promise(t=>setTimeout(t,o))}window.showTerms=function(){alert(`Terms of Service

• InvoiceForge provides a tool to create invoice PDFs.
• Payment of $2.99 is required per download.
• We do not store your invoice data.
• All payments are processed securely via Stripe.
• No refunds for downloaded invoices.
• Service provided as-is without warranty.`)};window.showPrivacy=function(){alert(`Privacy Policy

• We do not store your invoice data on our servers.
• Invoice data is stored only in your browser's local storage.
• Payment processing is handled by Stripe.
• We do not sell or share any user data.
• Contact support@invoiceforge.app for questions.`)};function Y(){new URLSearchParams(window.location.search).get("payment")==="success"&&(T(),N().then(()=>{window.history.replaceState({},"",window.location.pathname)}))}document.addEventListener("DOMContentLoaded",()=>{A(),Y()});
