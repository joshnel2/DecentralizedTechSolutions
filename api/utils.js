const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/dts-data';
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const AVAIL_FILE = path.join(DATA_DIR, 'availability.json');

function ensureFile(filePath, initialValue) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(initialValue));
}

function loadJson(filePath, initialValue) {
  ensureFile(filePath, initialValue);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  ensureFile(filePath, data);
  fs.writeFileSync(filePath, JSON.stringify(data));
}

module.exports = {
  BOOKINGS_FILE,
  AVAIL_FILE,
  loadBookings: () => loadJson(BOOKINGS_FILE, []),
  saveBookings: data => saveJson(BOOKINGS_FILE, data),
  loadAvailability: () => loadJson(AVAIL_FILE, []),
  saveAvailability: data => saveJson(AVAIL_FILE, data),
  ADMIN_PASSWORD: 'Tennis345!'
};