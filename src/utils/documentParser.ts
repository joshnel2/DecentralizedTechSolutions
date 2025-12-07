/**
 * Document Parser Utility
 * 
 * Robust client-side document text extraction supporting:
 * - PDF (text-based and with fallbacks)
 * - DOCX (Word 2007+)
 * - DOC (legacy Word)
 * - XLSX/XLS (Excel)
 * - RTF (Rich Text Format)
 * - ICS/CAL (Calendar files)
 * - Text-based formats (TXT, CSV, JSON, XML, HTML, MD)
 * - Images (with helpful message)
 */

export interface ParsedDocument {
  success: boolean
  content: string
  fileName: string
  fileType: string
  pageCount?: number
  error?: string
}

// PDF.js worker URL - we'll set this dynamically
let pdfWorkerUrl: string | null = null

/**
 * Initialize PDF.js worker
 * Tries multiple sources in order of preference
 */
async function initPdfWorker(): Promise<typeof import('pdfjs-dist')> {
  const pdfjsLib = await import('pdfjs-dist')
  
  // If worker is already set, return
  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    return pdfjsLib
  }

  // Try to use the worker from the same origin first (most reliable)
  // This requires the worker to be copied to public folder
  const workerPaths = [
    '/pdf.worker.min.js',
    '/pdf.worker.js',
    // Fallback to CDN versions (less reliable but works as backup)
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`,
    `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`,
  ]

  // Try each worker path
  for (const workerPath of workerPaths) {
    try {
      // For local paths, check if the file exists
      if (workerPath.startsWith('/')) {
        const response = await fetch(workerPath, { method: 'HEAD' })
        if (response.ok) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
          console.log(`PDF.js worker loaded from: ${workerPath}`)
          return pdfjsLib
        }
      } else {
        // For CDN, just set it (will fail on actual use if unavailable)
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath
        console.log(`PDF.js worker set to CDN: ${workerPath}`)
        return pdfjsLib
      }
    } catch (e) {
      console.warn(`Failed to load PDF worker from ${workerPath}:`, e)
    }
  }

  // Last resort: try to use fake worker (runs in main thread, slower but works)
  console.warn('Using PDF.js without worker (slower performance)')
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  return pdfjsLib
}

/**
 * Extract text from a PDF file
 */
async function extractPdfText(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  try {
    const pdfjsLib = await initPdfWorker()
    
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Load PDF with error-tolerant options
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0, // Suppress console warnings
    })

    const pdf = await loadingTask.promise
    const numPages = pdf.numPages
    
    let fullText = ''
    let extractedAnyText = false

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        
        // Extract text with proper spacing
        let pageText = ''
        let lastY: number | null = null
        
        for (const item of textContent.items) {
          const textItem = item as any
          if (textItem.str) {
            // Check if we're on a new line (Y position changed significantly)
            if (lastY !== null && Math.abs(textItem.transform[5] - lastY) > 5) {
              pageText += '\n'
            } else if (pageText && !pageText.endsWith(' ') && !textItem.str.startsWith(' ')) {
              pageText += ' '
            }
            pageText += textItem.str
            lastY = textItem.transform[5]
          }
        }
        
        pageText = pageText.trim()
        if (pageText) {
          extractedAnyText = true
          fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`
        }
      } catch (pageError) {
        console.warn(`Error extracting page ${pageNum}:`, pageError)
        fullText += `\n--- Page ${pageNum} ---\n[Error extracting this page]\n`
      }
    }

    if (!extractedAnyText) {
      return {
        success: false,
        content: `[PDF FILE: ${fileName}]

This PDF appears to be scanned or image-based with no extractable text.

To analyze this document, please try one of these options:
1. If you have the original editable version, upload that instead
2. Use OCR software (like Adobe Acrobat Pro) to create a searchable PDF
3. Copy and paste the text content manually
4. Describe the document contents and I can help analyze based on your description`,
        fileName,
        fileType: 'application/pdf',
        pageCount: numPages,
        error: 'No extractable text found - likely a scanned document'
      }
    }

    return {
      success: true,
      content: `[PDF FILE: ${fileName}]

Extracted content from PDF (${numPages} page${numPages > 1 ? 's' : ''}):
${fullText}`,
      fileName,
      fileType: 'application/pdf',
      pageCount: numPages
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('PDF extraction error:', error)
    
    return {
      success: false,
      content: `[PDF FILE: ${fileName}]

Unable to extract text from this PDF. Error: ${errorMessage}

This may be due to:
- The PDF is password protected
- The PDF is corrupted or malformed
- The PDF uses an unsupported format

Please try:
1. Opening the PDF in a viewer and copying the text manually
2. Re-saving the PDF with a different application
3. Describing the content you need analyzed`,
      fileName,
      fileType: 'application/pdf',
      error: errorMessage
    }
  }
}

/**
 * Extract text from a DOCX file using mammoth
 */
async function extractDocxText(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer })
    
    const text = result.value.trim()
    
    if (!text) {
      return {
        success: false,
        content: `[WORD DOCUMENT: ${fileName}]

This document appears to be empty or contains only non-text content (images, charts, tables without text, etc.).

If this document has content you expected to be extracted, please:
1. Check if the content is in embedded images
2. Try saving the document as plain text (.txt) and re-uploading`,
        fileName,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        error: 'No text content found'
      }
    }

    // Report any conversion messages/warnings
    const warnings = result.messages
      .filter((m: any) => m.type === 'warning')
      .map((m: any) => m.message)
      .slice(0, 3)

    let warningText = ''
    if (warnings.length > 0) {
      warningText = `\n\n[Note: Some formatting may have been simplified during extraction]`
    }

    return {
      success: true,
      content: `[WORD DOCUMENT: ${fileName}]

Extracted content:
${text}${warningText}`,
      fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('DOCX extraction error:', error)
    
    return {
      success: false,
      content: `[WORD DOCUMENT: ${fileName}]

Unable to extract text from this Word document. Error: ${errorMessage}

The file may be:
- Corrupted or damaged
- Password protected
- Not a valid DOCX file

Please try re-saving the document or converting it to PDF.`,
      fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      error: errorMessage
    }
  }
}

/**
 * Extract text from legacy DOC files
 * This is a best-effort extraction since proper DOC parsing requires complex binary parsing
 */
async function extractDocText(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  try {
    // Try to extract text using multiple methods
    const bytes = new Uint8Array(arrayBuffer)
    
    // Method 1: Look for the Word Document stream and extract text
    // DOC files are OLE compound documents with embedded streams
    let extractedText = ''
    
    // Try UTF-16LE decoding (common in DOC files)
    try {
      const utf16Decoder = new TextDecoder('utf-16le', { fatal: false })
      const utf16Text = utf16Decoder.decode(arrayBuffer)
      // Filter to printable characters and clean up
      const cleanUtf16 = utf16Text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (cleanUtf16.length > 100) {
        extractedText = cleanUtf16
      }
    } catch (e) {
      // UTF-16 decoding failed
    }

    // Method 2: Try UTF-8 / ASCII extraction
    if (!extractedText || extractedText.length < 100) {
      const textDecoder = new TextDecoder('utf-8', { fatal: false })
      const rawText = textDecoder.decode(arrayBuffer)
      
      // Extract readable ASCII/UTF-8 sequences
      const asciiText = rawText
        .replace(/[^\x20-\x7E\n\r\t\u00A0-\u00FF\u0100-\u017F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (asciiText.length > extractedText.length) {
        extractedText = asciiText
      }
    }

    // Method 3: Look for text between specific markers
    if (!extractedText || extractedText.length < 50) {
      // Search for readable word sequences
      const wordPattern = /[A-Za-z]{3,}(?:\s+[A-Za-z]{2,})*/g
      const textDecoder = new TextDecoder('utf-8', { fatal: false })
      const rawText = textDecoder.decode(arrayBuffer)
      const matches = rawText.match(wordPattern) || []
      extractedText = matches.join(' ').trim()
    }

    if (extractedText.length < 50) {
      return {
        success: false,
        content: `[LEGACY WORD DOCUMENT: ${fileName}]

This is a legacy .doc format file. Unable to extract meaningful text.

For best results, please:
1. Open the document in Microsoft Word
2. Save it as .docx format (File > Save As > Word Document)
3. Upload the .docx version

Alternatively, you can copy and paste the text content directly.`,
        fileName,
        fileType: 'application/msword',
        error: 'Unable to extract text from legacy DOC format'
      }
    }

    // Limit to reasonable length and clean up
    const finalText = extractedText.substring(0, 100000)

    return {
      success: true,
      content: `[LEGACY WORD DOCUMENT: ${fileName}]

Extracted content (some formatting may be lost):
${finalText}

[Note: This is a legacy .doc format. For better extraction, consider converting to .docx]`,
      fileName,
      fileType: 'application/msword'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('DOC extraction error:', error)
    
    return {
      success: false,
      content: `[LEGACY WORD DOCUMENT: ${fileName}]

Unable to process this legacy Word document. Error: ${errorMessage}

Please convert to .docx format for reliable text extraction.`,
      fileName,
      fileType: 'application/msword',
      error: errorMessage
    }
  }
}

/**
 * Extract data from Excel files
 */
async function extractExcelText(arrayBuffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    let fullContent = ''
    let totalRows = 0

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      const rows = csv.split('\n').filter((r: string) => r.trim()).length
      totalRows += rows
      fullContent += `\n--- Sheet: ${sheetName} (${rows} rows) ---\n${csv}\n`
    }

    if (totalRows === 0) {
      return {
        success: false,
        content: `[EXCEL FILE: ${fileName}]

This spreadsheet appears to be empty.`,
        fileName,
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        error: 'Empty spreadsheet'
      }
    }

    return {
      success: true,
      content: `[EXCEL FILE: ${fileName}]

Spreadsheet with ${workbook.SheetNames.length} sheet(s), ${totalRows} total rows:
${fullContent}`,
      fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Excel extraction error:', error)
    
    return {
      success: false,
      content: `[EXCEL FILE: ${fileName}]

Unable to extract data from this Excel file. Error: ${errorMessage}

The file may be corrupted or password protected.`,
      fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      error: errorMessage
    }
  }
}

/**
 * Extract text from RTF files
 */
function extractRtfText(text: string, fileName: string): ParsedDocument {
  try {
    // RTF parsing - remove control words and extract text
    let plainText = text
      // Remove RTF header
      .replace(/^\{\\rtf\d+[^}]*\}?/i, '')
      // Remove font tables, color tables, etc.
      .replace(/\{\\fonttbl[^}]*\}/gi, '')
      .replace(/\{\\colortbl[^}]*\}/gi, '')
      .replace(/\{\\stylesheet[^}]*\}/gi, '')
      .replace(/\{\\info[^}]*\}/gi, '')
      // Handle special characters
      .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Remove control words but keep their text
      .replace(/\\([a-z]+)(-?\d+)? ?/gi, (match, word) => {
        // Keep paragraph and line breaks
        if (word === 'par' || word === 'line') return '\n'
        if (word === 'tab') return '\t'
        return ''
      })
      // Remove remaining braces
      .replace(/[{}]/g, '')
      // Clean up whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()

    if (plainText.length < 10) {
      return {
        success: false,
        content: `[RTF FILE: ${fileName}]

Unable to extract meaningful text from this RTF file.

Please try converting to a different format (TXT, DOCX, or PDF).`,
        fileName,
        fileType: 'application/rtf',
        error: 'No extractable text'
      }
    }

    return {
      success: true,
      content: `[RTF FILE: ${fileName}]

Extracted content:
${plainText}`,
      fileName,
      fileType: 'application/rtf'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      success: false,
      content: `[RTF FILE: ${fileName}]

Unable to parse this RTF file. Error: ${errorMessage}`,
      fileName,
      fileType: 'application/rtf',
      error: errorMessage
    }
  }
}

/**
 * Parse iCalendar (.ics, .cal) files
 */
function extractCalendarText(text: string, fileName: string): ParsedDocument {
  try {
    const events: Array<{
      summary?: string
      description?: string
      location?: string
      start?: string
      end?: string
      organizer?: string
      attendees?: string[]
    }> = []

    let currentEvent: typeof events[0] | null = null
    let currentField = ''
    let currentValue = ''

    const lines = text.split(/\r?\n/)
    
    for (const line of lines) {
      // Handle line folding (lines starting with space/tab are continuations)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        currentValue += line.substring(1)
        continue
      }

      // Process previous field
      if (currentField && currentEvent) {
        const value = currentValue.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';')
        switch (currentField) {
          case 'SUMMARY': currentEvent.summary = value; break
          case 'DESCRIPTION': currentEvent.description = value; break
          case 'LOCATION': currentEvent.location = value; break
          case 'DTSTART': currentEvent.start = formatCalendarDate(value); break
          case 'DTEND': currentEvent.end = formatCalendarDate(value); break
          case 'ORGANIZER': currentEvent.organizer = extractEmail(value); break
          case 'ATTENDEE': 
            if (!currentEvent.attendees) currentEvent.attendees = []
            currentEvent.attendees.push(extractEmail(value))
            break
        }
      }

      // Parse new field
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const fieldPart = line.substring(0, colonIndex)
        // Remove parameters (e.g., DTSTART;VALUE=DATE:20240101 -> DTSTART)
        currentField = fieldPart.split(';')[0].toUpperCase()
        currentValue = line.substring(colonIndex + 1)

        if (currentField === 'BEGIN' && currentValue.toUpperCase() === 'VEVENT') {
          currentEvent = {}
        } else if (currentField === 'END' && currentValue.toUpperCase() === 'VEVENT') {
          if (currentEvent && currentEvent.summary) {
            events.push(currentEvent)
          }
          currentEvent = null
        }
      }
    }

    if (events.length === 0) {
      return {
        success: false,
        content: `[CALENDAR FILE: ${fileName}]

No events found in this calendar file.

The file may be empty or in an unsupported format.`,
        fileName,
        fileType: 'text/calendar',
        error: 'No events found'
      }
    }

    // Format events for display
    let content = `[CALENDAR FILE: ${fileName}]

Found ${events.length} event(s):\n`

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      content += `\n--- Event ${i + 1} ---\n`
      if (event.summary) content += `Title: ${event.summary}\n`
      if (event.start) content += `Start: ${event.start}\n`
      if (event.end) content += `End: ${event.end}\n`
      if (event.location) content += `Location: ${event.location}\n`
      if (event.organizer) content += `Organizer: ${event.organizer}\n`
      if (event.attendees?.length) content += `Attendees: ${event.attendees.join(', ')}\n`
      if (event.description) content += `Description: ${event.description}\n`
    }

    return {
      success: true,
      content,
      fileName,
      fileType: 'text/calendar'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return {
      success: false,
      content: `[CALENDAR FILE: ${fileName}]

Unable to parse this calendar file. Error: ${errorMessage}

Please ensure it's a valid iCalendar (.ics) format file.`,
      fileName,
      fileType: 'text/calendar',
      error: errorMessage
    }
  }
}

/**
 * Format calendar date string to readable format
 */
function formatCalendarDate(dateStr: string): string {
  try {
    // Handle various date formats: 20240101, 20240101T120000, 20240101T120000Z
    const cleaned = dateStr.replace(/[^0-9TZ]/g, '')
    
    if (cleaned.length >= 8) {
      const year = cleaned.substring(0, 4)
      const month = cleaned.substring(4, 6)
      const day = cleaned.substring(6, 8)
      
      let result = `${year}-${month}-${day}`
      
      if (cleaned.length >= 15) {
        const hour = cleaned.substring(9, 11)
        const minute = cleaned.substring(11, 13)
        result += ` ${hour}:${minute}`
        if (cleaned.includes('Z')) result += ' UTC'
      }
      
      return result
    }
    return dateStr
  } catch {
    return dateStr
  }
}

/**
 * Extract email from calendar field value
 */
function extractEmail(value: string): string {
  const match = value.match(/mailto:([^\s;]+)/i)
  if (match) return match[1]
  
  const emailMatch = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
  if (emailMatch) return emailMatch[1]
  
  // Try to extract CN (common name)
  const cnMatch = value.match(/CN=([^;:]+)/i)
  if (cnMatch) return cnMatch[1]
  
  return value
}

/**
 * Handle image files (no OCR, but helpful message)
 */
function handleImageFile(fileName: string, fileType: string): ParsedDocument {
  return {
    success: false,
    content: `[IMAGE FILE: ${fileName}]

This is an image file (${fileType}).

I cannot directly extract text from images. To analyze document images:

1. **If it's a scanned document**: Use OCR software to convert it to a searchable PDF:
   - Adobe Acrobat Pro (File > Create PDF > From Scanner)
   - Microsoft OneNote (paste image, right-click, "Copy Text")
   - Google Drive (upload image, open with Google Docs)
   - Free online OCR tools (ocr.space, onlineocr.net)

2. **If it contains a chart/graph**: Describe what you see and I can help analyze it

3. **If it's a photo of a document**: Take a clearer photo or scan it properly

Once you have the text extracted, paste it here or upload the converted document.`,
    fileName,
    fileType,
    error: 'Image files require OCR for text extraction'
  }
}

/**
 * Handle plain text files
 */
function extractTextFile(content: string, fileName: string): ParsedDocument {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'txt'
  
  const fileTypeLabels: Record<string, string> = {
    'txt': 'TEXT FILE',
    'csv': 'CSV FILE',
    'json': 'JSON FILE',
    'xml': 'XML FILE',
    'html': 'HTML FILE',
    'htm': 'HTML FILE',
    'md': 'MARKDOWN FILE',
    'markdown': 'MARKDOWN FILE',
    'log': 'LOG FILE',
    'ini': 'CONFIG FILE',
    'cfg': 'CONFIG FILE',
    'yaml': 'YAML FILE',
    'yml': 'YAML FILE',
  }
  
  const label = fileTypeLabels[ext] || 'FILE'
  
  if (!content.trim()) {
    return {
      success: false,
      content: `[${label}: ${fileName}]

This file appears to be empty.`,
      fileName,
      fileType: `text/${ext}`,
      error: 'Empty file'
    }
  }

  // For JSON, try to format it nicely
  if (ext === 'json') {
    try {
      const parsed = JSON.parse(content)
      content = JSON.stringify(parsed, null, 2)
    } catch {
      // Keep original content if JSON parsing fails
    }
  }

  return {
    success: true,
    content: `[${label}: ${fileName}]

Content:
${content}`,
    fileName,
    fileType: `text/${ext}`
  }
}

/**
 * Main document parsing function
 * Automatically detects file type and uses appropriate parser
 */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  const fileName = file.name
  const fileType = file.type || ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  console.log(`Parsing document: ${fileName} (type: ${fileType}, ext: ${ext})`)

  try {
    // Image files
    if (fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp', 'svg'].includes(ext)) {
      return handleImageFile(fileName, fileType || `image/${ext}`)
    }

    // PDF files
    if (fileType === 'application/pdf' || ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer()
      return await extractPdfText(arrayBuffer, fileName)
    }

    // DOCX files (Word 2007+)
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer()
      return await extractDocxText(arrayBuffer, fileName)
    }

    // DOC files (legacy Word)
    if (fileType === 'application/msword' || ext === 'doc') {
      const arrayBuffer = await file.arrayBuffer()
      return await extractDocText(arrayBuffer, fileName)
    }

    // Excel files
    if (
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileType === 'application/vnd.ms-excel' ||
      ['xlsx', 'xls'].includes(ext)
    ) {
      const arrayBuffer = await file.arrayBuffer()
      return await extractExcelText(arrayBuffer, fileName)
    }

    // Calendar files (.ics, .cal, .ical, .ifb)
    if (
      fileType === 'text/calendar' ||
      ['ics', 'cal', 'ical', 'ifb', 'vcs'].includes(ext)
    ) {
      const text = await file.text()
      return extractCalendarText(text, fileName)
    }

    // RTF files
    if (fileType === 'application/rtf' || fileType === 'text/rtf' || ext === 'rtf') {
      const text = await file.text()
      return extractRtfText(text, fileName)
    }

    // Text-based files (default handler)
    // This includes: txt, csv, json, xml, html, md, log, yaml, etc.
    const text = await file.text()
    return extractTextFile(text, fileName)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Error parsing ${fileName}:`, error)
    
    return {
      success: false,
      content: `[FILE: ${fileName}]

An unexpected error occurred while processing this file: ${errorMessage}

Please try:
1. Re-uploading the file
2. Converting to a different format (PDF, DOCX, or TXT)
3. Copying and pasting the text content directly`,
      fileName,
      fileType,
      error: errorMessage
    }
  }
}

/**
 * Get supported file extensions for the file input accept attribute
 */
export function getSupportedFileTypes(): string {
  return [
    // Documents
    '.pdf', '.doc', '.docx', '.rtf', '.txt',
    // Spreadsheets  
    '.xlsx', '.xls', '.csv',
    // Calendar
    '.ics', '.cal', '.ical', '.vcs',
    // Data/Config
    '.json', '.xml', '.yaml', '.yml',
    // Web
    '.html', '.htm', '.md', '.markdown',
    // Images (for helpful message)
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'
  ].join(',')
}

export default parseDocument
