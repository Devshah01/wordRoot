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

// Helper to sign JWT
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: '30d' });
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

    if (!payload || !payload.email || typeof payload.email !== 'string') {
      return res.status(400).json({ error: 'Google account did not provide a valid email address' });
    }

    const googleId = payload.sub;
    const email = payload.email.trim().toLowerCase();
    
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

    // Check if Brevo SMTP environment variables are configured
    if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) {
      console.error('[Password Reset] Brevo SMTP configuration missing (BREVO_SMTP_LOGIN or BREVO_SMTP_KEY not set).');
      return res.status(500).json({ error: 'Email service is not configured on the server. Please contact support.' });
    }

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

    await prisma.user.update({
      where: { email: normalizedEmail },
      data: { passwordHash },
    });

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

    // Atomically delete associated words, password reset codes, and the user record
    await prisma.$transaction([
      prisma.word.deleteMany({ where: { userId } }),
      prisma.passwordReset.deleteMany({ where: { email: user.email } }),
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

// 6. Send OTP
async function sendOtp(req, res) {
  try {
    const { email, username, isSignUp } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (isSignUp) {
      if (username) {
        const trimmedUsername = String(username).trim();
        if (trimmedUsername.length < 2 || trimmedUsername.length > 50) {
          return res.status(400).json({ error: 'Username must be between 2 and 50 characters' });
        }
      }
      const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email is already registered. Please sign in.' });
      }
    } else {
      const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!existingUser) {
        return res.status(404).json({ error: 'No account found with this email. Please sign up first.' });
      }
    }

    // Generate a 6-digit OTP code using crypto
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store in PostgreSQL database
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

    // Check if Brevo SMTP is configured
    if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) {
      console.log(`[OTP Dev Fallback] Code for ${normalizedEmail} is ${code}`);
      return res.json({ message: 'Verification code generated' });
    }

    // Send email via Brevo
    try {
      await transporter.sendMail({
        from: process.env.BREVO_SENDER_EMAIL || '"WordRoot Auth" <wordroot.app@gmail.com>',
        to: normalizedEmail,
        subject: 'Your Verification Code - WordRoot',
        text: `Your WordRoot verification code is: ${code}\n\nIt expires in 15 minutes.`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FBFBFA; padding: 40px 20px; color: #1A1A1A;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; padding: 40px; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #EAEAEA;">
              
              <div style="text-align: center; margin-bottom: 32px;">
                <img src="https://raw.githubusercontent.com/Devshah01/wordRoot/main/app-icon-transparent-512.png" alt="WordRoot" style="width: 64px; height: 64px; border-radius: 16px;" />
                <h1 style="font-size: 24px; margin-top: 16px; margin-bottom: 0; font-weight: 700; color: #1A1A1A;">WordRoot</h1>
              </div>

              <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #1A1A1A;">Verification Code</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #4A4A4A; margin-bottom: 32px;">
                Your 6-digit verification code to sign in to WordRoot is:
              </p>

              <div style="text-align: center; margin-bottom: 32px;">
                <div style="background-color: #F5F5F5; border-radius: 16px; padding: 20px; display: inline-block; border: 1px solid #EAEAEA;">
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1A1A1A; margin-left: 6px;">${code}</span>
                </div>
              </div>

              <p style="font-size: 14px; color: #71717A; line-height: 1.5; margin-bottom: 0;">
                This code expires in 15 minutes. If you didn't request this code, you can safely ignore this email.
              </p>

            </div>
          </div>
        `,
      });
      console.log(`[OTP Auth] Email sent to ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('Failed to send OTP email via Brevo:', emailErr);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
    }

    res.json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('sendOtp error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
}

// 7. Verify OTP
async function verifyOtp(req, res) {
  try {
    const { email, code, username, isSignUp } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const otpRecord = await prisma.passwordReset.findUnique({
      where: { email: normalizedEmail },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'No verification code found. Please request a new code.' });
    }

    if (new Date() > otpRecord.expiresAt) {
      await prisma.passwordReset.delete({ where: { email: normalizedEmail } }).catch(() => {});
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    const isValid = await bcrypt.compare(String(code), otpRecord.codeHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Code is valid! Clean up OTP record
    await prisma.passwordReset.delete({ where: { email: normalizedEmail } }).catch(() => {});

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      if (!isSignUp) {
        return res.status(404).json({ error: 'No account found with this email. Please sign up first.' });
      }
      const finalUsername = (username && String(username).trim()) || normalizedEmail.split('@')[0];
      user = await prisma.user.create({
        data: {
          username: finalUsername,
          email: normalizedEmail,
        },
      });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('verifyOtp error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
}

module.exports = {
  register,
  login,
  googleAuth,
  forgotPassword,
  resetPassword,
  deleteAccount,
  sendOtp,
  verifyOtp,
};

