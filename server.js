const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');
const AVAIL_FILE = path.join(__dirname, 'data', 'availability.json');
const ADMIN_PASSWORD = 'Tennis345!';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

function ensureFile(filePath, initialValue = []) {
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialValue));
  }
}

function loadJson(filePath) {
  ensureFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadBookings() {
  return loadJson(BOOKINGS_FILE);
}

function saveBookings(data) {
  saveJson(BOOKINGS_FILE, data);
}

function loadAvailability() {
  return loadJson(AVAIL_FILE);
}

function saveAvailability(data) {
  saveJson(AVAIL_FILE, data);
}

function isAdmin(req) {
  return req.headers['x-admin-token'] === ADMIN_PASSWORD;
}

// PUBLIC: fetch open slots (availability minus booked)
app.get('/api/availability', (req, res) => {
  const availability = loadAvailability();
  const booked = loadBookings().map(b => b.slot);
  const open = availability.filter(
    slot => !booked.includes(slot) && new Date(slot) > new Date()
  );
  res.json({ available: open.sort() });
});

app.post('/api/book', (req, res) => {
  const { name, email, phone, slot } = req.body;
  if (!name || !email || !phone || !slot) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const availability = loadAvailability();
  if (!availability.includes(slot)) {
    return res.status(400).json({ error: 'Slot not available' });
  }
  const bookings = loadBookings();
  if (bookings.some(b => b.slot === slot)) {
    return res.status(409).json({ error: 'Slot already booked' });
  }
  bookings.push({ name, email, phone, slot });
  saveBookings(bookings);
  res.json({ success: true });
});

// ADMIN: add slots (expects array of ISO strings)
app.post('/api/availability', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  let { slots } = req.body;
  if (!Array.isArray(slots)) slots = [];
  const availability = new Set(loadAvailability());
  slots.forEach(s => availability.add(s));
  saveAvailability(Array.from(availability));
  res.json({ success: true });
});

// ADMIN: remove slot
app.delete('/api/availability', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { slot } = req.body;
  if (!slot) return res.status(400).json({ error: 'Missing slot' });
  let availability = loadAvailability();
  availability = availability.filter(s => s !== slot);
  saveAvailability(availability);
  res.json({ success: true });
});

// ADMIN: view bookings
app.get('/api/bookings', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ bookings: loadBookings() });
});

app.listen(PORT, () => {
  console.log(`Consultation scheduler running on http://localhost:${PORT}`);
});