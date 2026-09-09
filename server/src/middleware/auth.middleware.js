const jwt = require('jsonwebtoken');
const prisma = require('../services/db.service');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  return secret;
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Expecting format: Bearer <token>
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    // Verify that the user still exists in the database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, username: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.message === "JWT_SECRET is not defined in environment variables.") {
      console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
      return res.status(500).json({ error: 'Internal server configuration error' });
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  authenticateToken,
  getJwtSecret,
  get jwtSecret() {
    return getJwtSecret();
  },
};

