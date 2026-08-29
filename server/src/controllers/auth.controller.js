const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../services/db.service');
const { jwtSecret } = require('../middleware/auth.middleware');

const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;

// Mobile ID tokens use platform-specific client IDs as `aud`; web uses the web client ID.
const GOOGLE_CLIENT_IDS = [
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper to sign JWT
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '30d' });
}

// 1. Manual Signup
async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const trimmedUsername = String(username).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    // Username validation
    if (trimmedUsername.length < 2 || trimmedUsername.length > 50) {
      return res.status(400).json({ error: 'Username must be between 2 and 50 characters' });
    }

    // Email format validation
    if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Password validation (standard security rules: min 8 characters)
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    if (password.length > 128) {
      return res.status(400).json({ error: 'Password must be 128 characters or fewer' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        email: normalizedEmail,
        passwordHash,
      },
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    if (error && error.code === 'P2002') {
      return res.status(400).json({ error: 'Email is already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
}

// 2. Manual Login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}

// 3. Google Sign-in — verify ID token from client
async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }

    if (GOOGLE_CLIENT_IDS.length === 0) {
      console.error('Google Auth error: no Google client IDs configured');
      return res.status(500).json({ error: 'Google Sign-In is not configured on the server' });
    }

    // Verify the ID token — accept web, Android, and iOS client audiences
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_IDS,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    
    if (!payload.email_verified) {
      return res.status(403).json({ error: 'Google email must be verified to sign in' });
    }

    const username = payload.name || email.split('@')[0];

    // Check if user exists by Google ID
    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      try {
        user = await prisma.user.upsert({
          where: { email },
          update: { googleId },
          create: {
            username,
            email,
            googleId,
          },
        });
      } catch (upsertErr) {
        if (upsertErr && upsertErr.code === 'P2002') {
          // Handled concurrent signup/link race condition: refetch user
          user = await prisma.user.findFirst({
            where: {
              OR: [{ googleId }, { email }],
            },
          });
        } else {
          throw upsertErr;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to authenticate user' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('Google Auth error:', error);
    res.status(500).json({ error: 'Failed Google Authentication' });
  }
}

module.exports = {
  register,
  login,
  googleAuth,
};
