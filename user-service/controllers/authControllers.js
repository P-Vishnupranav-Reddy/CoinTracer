const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

exports.register = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Fields are null.' });
  }

  try {
    const result = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists.' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserResult = await db.query(
      'INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hashedPassword]
    );

    const newUser = newUserResult.rows[0];

    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ user: newUser, token });
  } catch (error) {
    console.error(error);
    if (error && error.code === '23505') { // unique_violation from Postgres
      return res.status(409).json({ message: 'Email already in use.' });
    }
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Fields are null.' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

// Request password reset
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    if (rows.length === 0) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    const user = rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    // Store hashed token in database
    await db.query(
      'UPDATE public.users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [hashedToken, expires, user.id]
    );

    // In production, you would send this via email
    // For now, we'll return it in the response for testing
    console.log('Password reset token:', resetToken);
    console.log('Reset link:', `http://localhost:5173/reset-password?token=${resetToken}`);

    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      // Include token only in development
      ...(process.env.NODE_ENV !== 'production' && { resetToken })
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error during password reset request.' });
  }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const { rows } = await db.query(
      'SELECT * FROM public.users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [hashedToken]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    const user = rows[0];

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await db.query(
      'UPDATE public.users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
};

// Get user profile (requires authentication)
exports.getProfile = async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware

    const { rows } = await db.query(
      'SELECT id, email, name, birthday, phone_number, country, created_at FROM public.users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error while fetching profile.' });
  }
};

// Update user profile (requires authentication)
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware
    const { name, birthday, phoneNumber, country } = req.body;

    // Build dynamic query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (birthday !== undefined) {
      updates.push(`birthday = $${paramCount++}`);
      values.push(birthday || null);
    }
    if (phoneNumber !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phoneNumber || null);
    }
    if (country !== undefined) {
      updates.push(`country = $${paramCount++}`);
      values.push(country || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    values.push(userId);

    const query = `
      UPDATE public.users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, name, birthday, phone_number, country, created_at
    `;

    const { rows } = await db.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ user: rows[0], message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile.' });
  }
};

// Delete user account (requires authentication)
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.userId; // Set by auth middleware
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password confirmation is required.' });
    }

    // Verify password before deletion
    const { rows } = await db.query('SELECT * FROM public.users WHERE id = $1', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password.' });
    }

    // Delete user (CASCADE will handle related data)
    await db.query('DELETE FROM public.users WHERE id = $1', [userId]);

    res.status(200).json({ message: 'Account deleted successfully.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error while deleting account.' });
  }
};
