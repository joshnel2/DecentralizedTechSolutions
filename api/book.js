const { loadAvailability, loadBookings, saveBookings } = require('./utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  let body=req.body;
  if(!body){
    const buffers=[];
    for await (const ch of req) buffers.push(ch);
    try{ body=JSON.parse(Buffer.concat(buffers).toString()||'{}'); }catch{ body={}; }
  }
  const { name, email, phone, slot } = body;
  if (!name || !email || !phone || !slot) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const availability = loadAvailability();
  if (!availability.includes(slot)) return res.status(400).json({ error:'Slot not available' });
  const bookings = loadBookings();
  if (bookings.some(b=>b.slot===slot)) return res.status(409).json({ error:'Slot already booked' });
  bookings.push({ name, email, phone, slot });
  saveBookings(bookings);
  res.status(200).json({ success:true });
};