import rateLimit from 'express-rate-limit';

// Custom key generator to handle Azure proxy IP:port format
const keyGenerator = (req) => {
  // Get IP from X-Forwarded-For header (for proxied requests) or socket
  const forwarded = req.headers['x-forwarded-for'];
  let ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
  
  // Remove port if present (e.g., "24.157.59.58:19888" -> "24.157.59.58")
  if (ip.includes(':') && !ip.includes('::')) {
    // IPv4 with port - extract just the IP
    ip = ip.split(':')[0];
  } else if (ip.includes('::ffff:')) {
    // IPv4-mapped IPv6 address
    ip = ip.replace('::ffff:', '');
  }
  
  return ip;
};

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // Limit each IP to 300 requests per minute
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false, ip: false }
});

// Strict rate limit for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login attempts per 15 minutes
  message: { error: 'Too many login attempts, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false, ip: false }
});

// Password reset rate limit
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: { error: 'Too many password reset attempts, please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false, ip: false }
});
