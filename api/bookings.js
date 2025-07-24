const { loadBookings, ADMIN_PASSWORD } = require('./utils');

module.exports = (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error:'Unauthorized' });
  res.status(200).json({ bookings: loadBookings() });
};