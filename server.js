const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Utility – ensure bookings file exists
function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE));
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
  }
}

function loadBookings() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveBookings(bookings) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
}

// Generate slots for next N days (default 14) between 09:00-17:00 every hour
function generateSlots(days = 14) {
  const slots = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    for (let hour = 9; hour <= 16; hour++) { // last slot starts at 16:00 (ends 17:00)
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      if (slot > now) slots.push(slot.toISOString());
    }
  }
  return slots;
}

app.get('/api/slots', (req, res) => {
  const booked = loadBookings().map(b => b.slot);
  const available = generateSlots().filter(slot => !booked.includes(slot));
  res.json({ available });
});

app.post('/api/book', (req, res) => {
  const { name, email, slot } = req.body;
  if (!name || !email || !slot) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const bookings = loadBookings();
  if (bookings.some(b => b.slot === slot)) {
    return res.status(409).json({ error: 'Slot already booked' });
  }
  bookings.push({ name, email, slot });
  saveBookings(bookings);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Consultation scheduler running on http://localhost:${PORT}`);
});