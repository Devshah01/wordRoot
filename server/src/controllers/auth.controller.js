const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../services/db.service');
const { getJwtSecret } = require('../middleware/auth.middleware');
const nodemailer = require('nodemailer');

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

// Password reset codes are securely hashed and stored in PostgreSQL (password_resets table)


// Set up Brevo SMTP Transporter
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

// Helper to sign access token (15m expiration)
function generateAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '15m' });
}

// Helper to generate cryptographically secure random refresh token string
function generateRefreshTokenString() {
  return crypto.randomBytes(40).toString('hex');
}

// Issue access token + refresh token and persist refresh token in DB
async function issueTokenPair(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshTokenString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      expiresAt,
      user: {
        connect: { id: user.id },
      },
    },
  });

  return { accessToken, refreshToken };
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

    const { accessToken, refreshToken } = await issueTokenPair(user);
    res.status(201).json({
      accessToken,
      refreshToken,
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

    const { accessToken, refreshToken } = await issueTokenPair(user);
    res.json({
      accessToken,
      refreshToken,
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
          // Handled concurrent signup/link race condition: refetch user with retries
          for (let attempt = 0; attempt < 3; attempt++) {
            user = await prisma.user.findFirst({
              where: {
                OR: [{ googleId }, { email }],
              },
            });
            if (user) break;
            await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          }
        } else {
          throw upsertErr;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to authenticate user' });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('Google Auth error:', error);
    res.status(500).json({ error: 'Failed Google Authentication' });
  }
}

// 4. Forgot Password — generate a 6-digit reset code
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash) {
      // Don't reveal whether the email exists — always return success
      return res.json({ message: 'If this email is registered, a reset code has been generated.' });
    }

    // Generate a 6-digit code using cryptographically secure PRNG
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store in PostgreSQL database (upsert replaces any existing code for this email)
    await prisma.passwordReset.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        codeHash,
        expiresAt,
      },
      update: {
        codeHash,
        expiresAt,
      },
    });

    // Send email via Brevo
    try {
      await transporter.sendMail({
        from: process.env.BREVO_SENDER_EMAIL || '"WordRoot Support" <wordroot.app@gmail.com>', // MUST be a verified sender in Brevo
        to: normalizedEmail,
        subject: 'Your Password Reset Code - WordRoot',
        text: `Your password reset code for WordRoot is: ${code}\n\nIt expires in 15 minutes.`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FBFBFA; padding: 40px 20px; color: #1A1A1A;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; padding: 40px; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #EAEAEA;">
              
              <div style="text-align: center; margin-bottom: 32px;">
                <img src="https://raw.githubusercontent.com/Devshah01/wordRoot/main/app-icon-transparent-512.png" alt="WordRoot" style="width: 64px; height: 64px; border-radius: 16px;" />
                <h1 style="font-size: 24px; margin-top: 16px; margin-bottom: 0; font-weight: 700; color: #1A1A1A;">WordRoot</h1>
              </div>

              <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #1A1A1A;">Password Reset Request</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #4A4A4A; margin-bottom: 32px;">
                We received a request to reset your password. Enter the 6-digit code below in the app to continue:
              </p>

              <div style="text-align: center; margin-bottom: 32px;">
                <div style="background-color: #F5F5F5; border-radius: 16px; padding: 20px; display: inline-block; border: 1px solid #EAEAEA;">
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1A1A1A; margin-left: 6px;">${code}</span>
                </div>
              </div>

              <p style="font-size: 14px; color: #71717A; line-height: 1.5; margin-bottom: 0;">
                This code will expire in 15 minutes. If you didn't request a password reset, you can safely ignore this email.
              </p>

            </div>
            <div style="text-align: center; margin-top: 24px;">
              <p style="font-size: 12px; color: #A1A1AA;">&copy; ${new Date().getFullYear()} WordRoot. All rights reserved.</p>
            </div>
          </div>
        `,
      });
      console.log(`[Password Reset] Email sent to ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('Failed to send reset email via Brevo:', emailErr);
      return res.status(500).json({ error: 'Failed to send reset email. Please try again later.' });
    }

    res.json({
      message: 'If this email is registered, a reset code has been generated.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
}

// 5. Reset Password — verify code and set new password
async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Password must be 128 characters or fewer' });
    }

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { email: normalizedEmail },
    });
    if (!resetRecord) {
      return res.status(400).json({ error: 'No reset code found. Please request a new one.' });
    }

    if (new Date() > resetRecord.expiresAt) {
      await prisma.passwordReset.delete({ where: { email: normalizedEmail } }).catch(() => {});
      return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
    }

    const isValid = await bcrypt.compare(String(code), resetRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const user = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { passwordHash },
    });

    // Revoke all existing refresh tokens for this user on password reset
    if (user) {
      await prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }).catch(() => {});
    }

    // Remove used code from database
    await prisma.passwordReset.delete({
      where: { email: normalizedEmail },
    }).catch(() => {});

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

// 6. Refresh Access Token
async function refreshToken(req, res) {
  try {
    const { refreshToken: reqRefreshToken } = req.body;

    if (!reqRefreshToken || typeof reqRefreshToken !== 'string') {
      return res.status(400).json({ error: 'Refresh token is required', code: 'REFRESH_TOKEN_MISSING' });
    }

    const savedToken = await prisma.refreshToken.findUnique({
      where: { token: reqRefreshToken },
      include: { user: true },
    });

    if (!savedToken) {
      return res.status(401).json({ error: 'Invalid or revoked refresh token', code: 'REFRESH_TOKEN_INVALID' });
    }

    if (new Date() > savedToken.expiresAt) {
      await prisma.refreshToken.delete({ where: { id: savedToken.id } }).catch(() => {});
      return res.status(401).json({ error: 'Refresh token expired', code: 'REFRESH_TOKEN_EXPIRED' });
    }

    const user = savedToken.user;
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists', code: 'USER_NOT_FOUND' });
    }

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}

// 7. Logout (Revoke Refresh Token)
async function logout(req, res) {
  try {
    const { refreshToken: reqRefreshToken } = req.body;

    if (reqRefreshToken && typeof reqRefreshToken === 'string') {
      await prisma.refreshToken.delete({
        where: { token: reqRefreshToken },
      }).catch(() => {});
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to log out' });
  }
}

async function deleteAccount(req, res) {
  try {
    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User ID missing from request' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // Atomically delete associated words, password reset codes, refresh tokens, and the user record
    await prisma.$transaction([
      prisma.word.deleteMany({ where: { userId } }),
      prisma.passwordReset.deleteMany({ where: { email: user.email } }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    console.log(`[auth] Account deleted successfully for userId: ${userId} (${user.email})`);
    res.json({
      message: 'Account and all associated data deleted successfully',
      loggedOut: true,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
}

module.exports = {
  register,
  login,
  googleAuth,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  deleteAccount,
};
