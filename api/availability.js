const { loadAvailability, saveAvailability, loadBookings, ADMIN_PASSWORD } = require('./utils');

module.exports = async (req, res) => {
  const method = req.method;
  if (method === 'GET') {
    const availability = loadAvailability();
    const booked = loadBookings().map(b => b.slot);
    const open = availability.filter(s => !booked.includes(s) && new Date(s) > new Date());
    return res.status(200).json({ available: open.sort() });
  }

  // Auth for mutations
  if (['POST','DELETE'].includes(method) && req.headers['x-admin-token'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (method === 'POST' || method === 'DELETE') {
    const buffers = [];
    let body = req.body;
    if (!body) {
      for await (const chunk of req) buffers.push(chunk);
      const raw = Buffer.concat(buffers).toString() || '{}';
      try { body = JSON.parse(raw); } catch { body = {}; }
    }

    if (method === 'POST') {
      const { slots = [] } = body;
      if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be array' });
      const avail = new Set(loadAvailability());
      slots.forEach(s => avail.add(s));
      saveAvailability(Array.from(avail));
      return res.status(200).json({ success: true });
    }

    if (method === 'DELETE') {
      const { slot } = body;
      if (!slot) return res.status(400).json({ error: 'Missing slot' });
      const avail = loadAvailability().filter(s => s !== slot);
      saveAvailability(avail);
      return res.status(200).json({ success: true });
    }
  }

  res.status(405).end();
};