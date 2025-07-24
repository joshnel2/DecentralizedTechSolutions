/*
Google Apps Script to back the booking feature.

1. Create a Google Sheet named "Time Slots" (or any name).
   - Tab 1: "TimeSlots" with headers in row 1 exactly like:
       id | date | start | end | status
   - Tab 2: "Bookings" with headers:
       slotId | name | email | phone | timestamp
   The admin enters rows in the TimeSlots tab leaving status blank. Rows become available slots.

2. In the sheet choose Extensions → Apps Script, paste this code, then Deploy → New deployment → Web app.
   - Execute as: Me
   - Who has access: Anyone
   - Copy the resulting URL.  GET returns open slots, POST books a slot.
*/

const SHEET = SpreadsheetApp.getActive().getSheetByName('TimeSlots');
const BOOKINGS = SpreadsheetApp.getActive().getSheetByName('Bookings');

/**
 * GET → returns JSON array of open slots
 * Each element: { id, date, start, end }
 */
function doGet() {
  const rows = SHEET.getDataRange().getValues();
  const slots = rows.slice(1) // drop header row
    .filter(r => r[4] !== 'BOOKED' && r[1]) // col E = status
    .map(r => ({
      id: r[0],
      date: Utilities.formatDate(new Date(r[1]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      start: r[2],
      end: r[3]
    }));
  return ContentService.createTextOutput(JSON.stringify(slots))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST body: { slotId, name, email, phone }
 * Marks the slot as BOOKED and logs the booking.
 */
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const id = Number(data.slotId);
  const rowIdx = id + 1; // sheet rows are 1-indexed; header is row 1

  // Mark slot as BOOKED only if it's currently free
  const status = SHEET.getRange(rowIdx, 5).getValue();
  if (status === 'BOOKED') {
    return ContentService.createTextOutput('already booked').setResponseCode(409);
  }
  SHEET.getRange(rowIdx, 5).setValue('BOOKED');

  // Log booking
  BOOKINGS.appendRow([
    id,
    data.name,
    data.email,
    data.phone,
    new Date()
  ]);

  return ContentService.createTextOutput('OK');
}