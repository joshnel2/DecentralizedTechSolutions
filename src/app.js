/**
 * InvoiceForge — Professional Invoice Generator
 * Makes money by charging $2.99 per PDF download via Stripe
 */

// Configuration
const CONFIG = {
  price: 2.99,
  currency: 'usd',
  productName: 'Professional Invoice PDF',
  // Replace with your Stripe publishable key for production
  // For testing, this demo mode will simulate payment
  stripePublishableKey: 'pk_test_REPLACE_WITH_YOUR_KEY',
  // For production, create a Stripe Checkout session via your backend
  // This demo simulates the flow client-side
  demoMode: true
};

// Currency symbols
const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$'
};

// State
let invoiceItems = [];
let itemIdCounter = 0;

// DOM Elements
const elements = {
  itemsContainer: document.getElementById('items-container'),
  addItemBtn: document.getElementById('add-item'),
  invoicePreview: document.getElementById('invoice-preview'),
  downloadBtn: document.getElementById('btn-download'),
  previewRefreshBtn: document.getElementById('btn-preview-refresh'),
  paymentModal: document.getElementById('payment-modal'),
  successModal: document.getElementById('success-modal'),
  modalCloseBtn: document.getElementById('modal-close'),
  payStripeBtn: document.getElementById('btn-pay-stripe'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  previewSubtotal: document.getElementById('preview-subtotal'),
  previewTax: document.getElementById('preview-tax'),
  previewDiscount: document.getElementById('preview-discount'),
  previewTotal: document.getElementById('preview-total')
};

// Initialize
function init() {
  setDefaultDates();
  setupEventListeners();
  addItem(); // Start with one item
  updatePreview();
  loadSavedData();
}

// Set default dates
function setDefaultDates() {
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  
  document.getElementById('invoice-date').value = formatDateForInput(today);
  document.getElementById('due-date').value = formatDateForInput(dueDate);
  
  // Generate default invoice number
  const invoiceNum = `INV-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;
  document.getElementById('invoice-number').value = invoiceNum;
}

function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Setup event listeners
function setupEventListeners() {
  // Add item button
  elements.addItemBtn.addEventListener('click', addItem);
  
  // Form inputs - live preview update
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      saveData();
      updatePreview();
    });
    input.addEventListener('change', () => {
      saveData();
      updatePreview();
    });
  });
  
  // Download button
  elements.downloadBtn.addEventListener('click', showPaymentModal);
  
  // Preview refresh
  elements.previewRefreshBtn.addEventListener('click', updatePreview);
  
  // Modal close
  elements.modalCloseBtn.addEventListener('click', hidePaymentModal);
  elements.paymentModal.addEventListener('click', (e) => {
    if (e.target === elements.paymentModal) hidePaymentModal();
  });
  
  // Pay button
  elements.payStripeBtn.addEventListener('click', processPayment);
}

// Add line item
function addItem() {
  const itemId = ++itemIdCounter;
  invoiceItems.push({ id: itemId, description: '', quantity: 1, rate: 0 });
  
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.itemId = itemId;
  row.innerHTML = `
    <input type="text" class="item-desc" placeholder="Description of service or product" data-field="description">
    <input type="number" class="item-qty" value="1" min="1" step="1" data-field="quantity">
    <input type="number" class="item-rate" placeholder="0.00" min="0" step="0.01" data-field="rate">
    <input type="text" class="item-amount" readonly value="${getCurrencySymbol()}0.00">
    <button type="button" class="btn-remove" title="Remove item">&times;</button>
  `;
  
  elements.itemsContainer.appendChild(row);
  
  // Add event listeners to new inputs
  const inputs = row.querySelectorAll('input:not([readonly])');
  inputs.forEach(input => {
    input.addEventListener('input', () => handleItemChange(itemId, input));
    input.addEventListener('change', () => handleItemChange(itemId, input));
  });
  
  // Remove button
  row.querySelector('.btn-remove').addEventListener('click', () => removeItem(itemId));
  
  updatePreview();
}

// Handle item changes
function handleItemChange(itemId, input) {
  const item = invoiceItems.find(i => i.id === itemId);
  if (!item) return;
  
  const field = input.dataset.field;
  let value = input.value;
  
  if (field === 'quantity') {
    value = parseInt(value) || 0;
  } else if (field === 'rate') {
    value = parseFloat(value) || 0;
  }
  
  item[field] = value;
  
  // Update amount display
  const row = input.closest('.item-row');
  const amountInput = row.querySelector('.item-amount');
  const amount = (item.quantity || 0) * (item.rate || 0);
  amountInput.value = `${getCurrencySymbol()}${amount.toFixed(2)}`;
  
  saveData();
  updatePreview();
}

// Remove item
function removeItem(itemId) {
  invoiceItems = invoiceItems.filter(i => i.id !== itemId);
  const row = document.querySelector(`.item-row[data-item-id="${itemId}"]`);
  if (row) {
    row.remove();
  }
  
  // Ensure at least one item exists
  if (invoiceItems.length === 0) {
    addItem();
  }
  
  saveData();
  updatePreview();
}

// Get currency symbol
function getCurrencySymbol() {
  const currency = document.getElementById('currency').value;
  return CURRENCY_SYMBOLS[currency] || '$';
}

// Calculate totals
function calculateTotals() {
  const symbol = getCurrencySymbol();
  
  const subtotal = invoiceItems.reduce((sum, item) => {
    return sum + ((item.quantity || 0) * (item.rate || 0));
  }, 0);
  
  const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  
  const discount = parseFloat(document.getElementById('discount').value) || 0;
  
  const total = subtotal + taxAmount - discount;
  
  return {
    subtotal,
    taxRate,
    taxAmount,
    discount,
    total,
    symbol
  };
}

// Update preview
function updatePreview() {
  const data = getFormData();
  const totals = calculateTotals();
  const symbol = totals.symbol;
  
  // Update totals summary
  elements.previewSubtotal.textContent = `${symbol}${totals.subtotal.toFixed(2)}`;
  elements.previewTax.textContent = `${symbol}${totals.taxAmount.toFixed(2)}`;
  elements.previewDiscount.textContent = `-${symbol}${totals.discount.toFixed(2)}`;
  elements.previewTotal.textContent = `${symbol}${totals.total.toFixed(2)}`;
  
  // Build items HTML
  const itemsHtml = invoiceItems
    .filter(item => item.description || item.rate > 0)
    .map(item => {
      const amount = (item.quantity || 0) * (item.rate || 0);
      return `
        <tr>
          <td>${escapeHtml(item.description) || 'Item'}</td>
          <td>${item.quantity || 0}</td>
          <td>${symbol}${(item.rate || 0).toFixed(2)}</td>
          <td>${symbol}${amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  
  // Build preview HTML
  elements.invoicePreview.innerHTML = `
    <div class="preview-header-section">
      <div class="preview-from">
        <h1>${escapeHtml(data.fromName) || 'Your Business'}</h1>
        ${data.fromEmail ? `<p>${escapeHtml(data.fromEmail)}</p>` : ''}
        ${data.fromAddress ? `<p>${escapeHtml(data.fromAddress).replace(/\n/g, '<br>')}</p>` : ''}
        ${data.fromPhone ? `<p>${escapeHtml(data.fromPhone)}</p>` : ''}
        ${data.fromWebsite ? `<p>${escapeHtml(data.fromWebsite)}</p>` : ''}
      </div>
      <div class="preview-invoice-info">
        <div class="invoice-title">INVOICE</div>
        <p><strong>#${escapeHtml(data.invoiceNumber) || 'INV-0001'}</strong></p>
        <p>Date: ${formatDateForDisplay(data.invoiceDate)}</p>
        ${data.dueDate ? `<p>Due: ${formatDateForDisplay(data.dueDate)}</p>` : ''}
      </div>
    </div>
    
    <div class="preview-bill-to">
      <h2>Bill To</h2>
      <p><strong>${escapeHtml(data.toName) || 'Client Name'}</strong></p>
      ${data.toEmail ? `<p>${escapeHtml(data.toEmail)}</p>` : ''}
      ${data.toAddress ? `<p>${escapeHtml(data.toAddress).replace(/\n/g, '<br>')}</p>` : ''}
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
        ${itemsHtml || '<tr><td colspan="4" style="text-align: center; color: #9ca3af;">Add line items above</td></tr>'}
      </tbody>
    </table>
    
    <div class="preview-totals">
      <div class="total-line">
        <span>Subtotal</span>
        <span>${symbol}${totals.subtotal.toFixed(2)}</span>
      </div>
      ${totals.taxRate > 0 ? `
        <div class="total-line">
          <span>Tax (${totals.taxRate}%)</span>
          <span>${symbol}${totals.taxAmount.toFixed(2)}</span>
        </div>
      ` : ''}
      ${totals.discount > 0 ? `
        <div class="total-line">
          <span>Discount</span>
          <span>-${symbol}${totals.discount.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="total-line grand-total">
        <span>Total Due</span>
        <span>${symbol}${totals.total.toFixed(2)}</span>
      </div>
    </div>
    
    ${data.notes ? `
      <div class="preview-notes">
        <h3>Notes</h3>
        <p>${escapeHtml(data.notes)}</p>
      </div>
    ` : ''}
  `;
}

// Get form data
function getFormData() {
  return {
    fromName: document.getElementById('from-name').value,
    fromEmail: document.getElementById('from-email').value,
    fromAddress: document.getElementById('from-address').value,
    fromPhone: document.getElementById('from-phone').value,
    fromWebsite: document.getElementById('from-website').value,
    toName: document.getElementById('to-name').value,
    toEmail: document.getElementById('to-email').value,
    toAddress: document.getElementById('to-address').value,
    invoiceNumber: document.getElementById('invoice-number').value,
    invoiceDate: document.getElementById('invoice-date').value,
    dueDate: document.getElementById('due-date').value,
    currency: document.getElementById('currency').value,
    taxRate: document.getElementById('tax-rate').value,
    discount: document.getElementById('discount').value,
    notes: document.getElementById('notes').value
  };
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Save data to localStorage
function saveData() {
  const data = {
    formData: getFormData(),
    items: invoiceItems
  };
  localStorage.setItem('invoiceforge-data', JSON.stringify(data));
}

// Load saved data
function loadSavedData() {
  const saved = localStorage.getItem('invoiceforge-data');
  if (!saved) return;
  
  try {
    const data = JSON.parse(saved);
    
    // Restore form fields
    if (data.formData) {
      Object.entries(data.formData).forEach(([key, value]) => {
        const fieldMap = {
          fromName: 'from-name',
          fromEmail: 'from-email',
          fromAddress: 'from-address',
          fromPhone: 'from-phone',
          fromWebsite: 'from-website',
          toName: 'to-name',
          toEmail: 'to-email',
          toAddress: 'to-address',
          invoiceNumber: 'invoice-number',
          invoiceDate: 'invoice-date',
          dueDate: 'due-date',
          currency: 'currency',
          taxRate: 'tax-rate',
          discount: 'discount',
          notes: 'notes'
        };
        
        const elementId = fieldMap[key];
        if (elementId) {
          const el = document.getElementById(elementId);
          if (el && value) {
            el.value = value;
          }
        }
      });
    }
    
    // Restore items
    if (data.items && data.items.length > 0) {
      // Clear existing items
      elements.itemsContainer.innerHTML = '';
      invoiceItems = [];
      itemIdCounter = 0;
      
      // Add saved items
      data.items.forEach(item => {
        addItem();
        const lastItem = invoiceItems[invoiceItems.length - 1];
        lastItem.description = item.description;
        lastItem.quantity = item.quantity;
        lastItem.rate = item.rate;
        
        // Update input values
        const row = document.querySelector(`.item-row[data-item-id="${lastItem.id}"]`);
        if (row) {
          row.querySelector('.item-desc').value = item.description || '';
          row.querySelector('.item-qty').value = item.quantity || 1;
          row.querySelector('.item-rate').value = item.rate || '';
          const amount = (item.quantity || 0) * (item.rate || 0);
          row.querySelector('.item-amount').value = `${getCurrencySymbol()}${amount.toFixed(2)}`;
        }
      });
    }
    
    updatePreview();
  } catch (e) {
    console.error('Error loading saved data:', e);
  }
}

// Show payment modal
function showPaymentModal() {
  // Validate required fields
  const fromName = document.getElementById('from-name').value.trim();
  const toName = document.getElementById('to-name').value.trim();
  const invoiceNumber = document.getElementById('invoice-number').value.trim();
  const invoiceDate = document.getElementById('invoice-date').value;
  
  const errors = [];
  if (!fromName) errors.push('Business Name');
  if (!toName) errors.push('Client Name');
  if (!invoiceNumber) errors.push('Invoice Number');
  if (!invoiceDate) errors.push('Invoice Date');
  
  // Check if there are any items with content
  const hasItems = invoiceItems.some(item => item.description && item.rate > 0);
  if (!hasItems) errors.push('At least one line item');
  
  if (errors.length > 0) {
    alert(`Please fill in the required fields:\n\n• ${errors.join('\n• ')}`);
    return;
  }
  
  elements.paymentModal.classList.add('active');
}

// Hide payment modal
function hidePaymentModal() {
  elements.paymentModal.classList.remove('active');
}

// Process payment
async function processPayment() {
  if (CONFIG.demoMode) {
    // Demo mode - simulate payment and generate PDF
    hidePaymentModal();
    showSuccessModal();
    await simulatePaymentAndDownload();
  } else {
    // Production mode - redirect to Stripe Checkout
    // You would create a checkout session via your backend
    try {
      const stripe = Stripe(CONFIG.stripePublishableKey);
      
      // Call your backend to create checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: CONFIG.price,
          currency: CONFIG.currency,
          productName: CONFIG.productName
        })
      });
      
      const session = await response.json();
      
      // Redirect to Stripe Checkout
      const result = await stripe.redirectToCheckout({
        sessionId: session.id
      });
      
      if (result.error) {
        alert(result.error.message);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment failed. Please try again.');
    }
  }
}

// Show success modal
function showSuccessModal() {
  elements.successModal.classList.add('active');
}

// Hide success modal
function hideSuccessModal() {
  elements.successModal.classList.remove('active');
}

// Simulate payment and download
async function simulatePaymentAndDownload() {
  const progressFill = elements.progressFill;
  const progressText = elements.progressText;
  
  // Simulate progress
  progressFill.style.width = '20%';
  progressText.textContent = 'Processing payment...';
  await sleep(500);
  
  progressFill.style.width = '50%';
  progressText.textContent = 'Payment successful!';
  await sleep(500);
  
  progressFill.style.width = '75%';
  progressText.textContent = 'Generating PDF...';
  await sleep(500);
  
  // Generate and download PDF
  await generatePDF();
  
  progressFill.style.width = '100%';
  progressText.textContent = 'Download complete!';
  
  await sleep(1000);
  hideSuccessModal();
  progressFill.style.width = '0%';
}

// Generate PDF
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const data = getFormData();
  const totals = calculateTotals();
  const symbol = totals.symbol;
  
  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  
  // Colors
  const primaryColor = [37, 99, 235];
  const textColor = [31, 41, 55];
  const mutedColor = [107, 114, 128];
  
  // Header
  doc.setFontSize(24);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(data.fromName || 'Your Business', margin, 25);
  
  // From info
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.setFont('helvetica', 'normal');
  let yPos = 32;
  
  if (data.fromEmail) {
    doc.text(data.fromEmail, margin, yPos);
    yPos += 5;
  }
  if (data.fromAddress) {
    const addressLines = data.fromAddress.split('\n');
    addressLines.forEach(line => {
      doc.text(line, margin, yPos);
      yPos += 5;
    });
  }
  if (data.fromPhone) {
    doc.text(data.fromPhone, margin, yPos);
    yPos += 5;
  }
  if (data.fromWebsite) {
    doc.text(data.fromWebsite, margin, yPos);
  }
  
  // Invoice title & number (right side)
  doc.setFontSize(28);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth - margin, 25, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${data.invoiceNumber || 'INV-0001'}`, pageWidth - margin, 33, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text(`Date: ${formatDateForDisplay(data.invoiceDate)}`, pageWidth - margin, 42, { align: 'right' });
  if (data.dueDate) {
    doc.text(`Due: ${formatDateForDisplay(data.dueDate)}`, pageWidth - margin, 48, { align: 'right' });
  }
  
  // Divider line
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(margin, 58, pageWidth - margin, 58);
  
  // Bill To section
  yPos = 70;
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', margin, yPos);
  
  yPos += 7;
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text(data.toName || 'Client Name', margin, yPos);
  
  yPos += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);
  
  if (data.toEmail) {
    doc.text(data.toEmail, margin, yPos);
    yPos += 5;
  }
  if (data.toAddress) {
    const addressLines = data.toAddress.split('\n');
    addressLines.forEach(line => {
      doc.text(line, margin, yPos);
      yPos += 5;
    });
  }
  
  // Items table
  yPos = Math.max(yPos + 10, 110);
  
  // Table header
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, yPos - 5, contentWidth, 10, 'F');
  
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', margin + 3, yPos);
  doc.text('QTY', margin + 100, yPos);
  doc.text('RATE', margin + 120, yPos);
  doc.text('AMOUNT', pageWidth - margin - 3, yPos, { align: 'right' });
  
  yPos += 8;
  
  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  doc.setFontSize(10);
  
  invoiceItems.filter(item => item.description || item.rate > 0).forEach(item => {
    const amount = (item.quantity || 0) * (item.rate || 0);
    
    doc.text(item.description || 'Item', margin + 3, yPos);
    doc.text(String(item.quantity || 0), margin + 100, yPos);
    doc.text(`${symbol}${(item.rate || 0).toFixed(2)}`, margin + 120, yPos);
    doc.text(`${symbol}${amount.toFixed(2)}`, pageWidth - margin - 3, yPos, { align: 'right' });
    
    // Row line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.1);
    doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3);
    
    yPos += 10;
  });
  
  // Totals section
  yPos += 10;
  const totalsX = pageWidth - margin - 60;
  
  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text('Subtotal', totalsX, yPos);
  doc.setTextColor(...textColor);
  doc.text(`${symbol}${totals.subtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
  
  if (totals.taxRate > 0) {
    yPos += 7;
    doc.setTextColor(...mutedColor);
    doc.text(`Tax (${totals.taxRate}%)`, totalsX, yPos);
    doc.setTextColor(...textColor);
    doc.text(`${symbol}${totals.taxAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
  }
  
  if (totals.discount > 0) {
    yPos += 7;
    doc.setTextColor(...mutedColor);
    doc.text('Discount', totalsX, yPos);
    doc.setTextColor(...textColor);
    doc.text(`-${symbol}${totals.discount.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
  }
  
  // Total due
  yPos += 10;
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, yPos - 3, pageWidth - margin, yPos - 3);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  doc.text('Total Due', totalsX, yPos + 4);
  doc.setTextColor(...primaryColor);
  doc.text(`${symbol}${totals.total.toFixed(2)}`, pageWidth - margin, yPos + 4, { align: 'right' });
  
  // Notes section
  if (data.notes) {
    yPos += 25;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos - 5, contentWidth, 30, 3, 3, 'F');
    
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', margin + 5, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textColor);
    const noteLines = doc.splitTextToSize(data.notes, contentWidth - 10);
    doc.text(noteLines, margin + 5, yPos + 6);
  }
  
  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  doc.text('Generated by InvoiceForge', pageWidth / 2, footerY, { align: 'center' });
  
  // Save PDF
  const fileName = `Invoice-${data.invoiceNumber || 'INV-0001'}.pdf`;
  doc.save(fileName);
}

// Utility: sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Terms and Privacy (simple alerts for demo)
window.showTerms = function() {
  alert('Terms of Service\n\n• InvoiceForge provides a tool to create invoice PDFs.\n• Payment of $2.99 is required per download.\n• We do not store your invoice data.\n• All payments are processed securely via Stripe.\n• No refunds for downloaded invoices.\n• Service provided as-is without warranty.');
};

window.showPrivacy = function() {
  alert('Privacy Policy\n\n• We do not store your invoice data on our servers.\n• Invoice data is stored only in your browser\'s local storage.\n• Payment processing is handled by Stripe.\n• We do not sell or share any user data.\n• Contact support@invoiceforge.app for questions.');
};

// Check for payment success (when returning from Stripe)
function checkPaymentSuccess() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment') === 'success') {
    // Payment was successful, generate PDF
    showSuccessModal();
    simulatePaymentAndDownload().then(() => {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  init();
  checkPaymentSuccess();
});
