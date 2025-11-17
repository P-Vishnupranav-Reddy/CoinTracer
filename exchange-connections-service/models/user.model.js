const pool = require('../config/database');

class User {
  /**
   * Find user by ID (UUID)
   */
  static async findById(id) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find or create user (used by auth middleware + portfolio creation)
   */
  static async findOrCreate(email, name = 'Demo User') {
    try {
      if (!email) {
        throw new Error('Email is required to create or find user.');
      }

      // Check if user exists
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        console.log(`Found existing user: ${existingUser.id} (${existingUser.email})`);
        return existingUser;
      }

      // Otherwise create new user with NULL password (requires password setup later)
      console.log(`Creating new user for ${email}`);
      const result = await pool.query(
        `INSERT INTO users (email, name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, name, null]
      );

      const newUser = result.rows[0];
      console.log('Created new user:', newUser.id);
      return newUser;
    } catch (error) {
      console.error('Error in findOrCreate user:', error);
      throw error;
    }
  }

  /**
   * Create user directly
   */
  static async create(email, name, passwordHash = null) {
    try {
      const result = await pool.query(
        `INSERT INTO users (email, name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, name, passwordHash]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
}

module.exports = User;
