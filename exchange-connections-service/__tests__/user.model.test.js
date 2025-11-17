const User = require('../models/user.model');
const pool = require('../config/database');

jest.mock('../config/database');

describe('User Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123', email: 'test@example.com', name: 'testuser', password_hash: 'hashed-password' }]
      });

      const result = await User.create('test@example.com', 'testuser', 'hashed-password');

      expect(pool.query).toHaveBeenCalled();
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('testuser');
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123', email: 'test@example.com' }]
      });

      const result = await User.findByEmail('test@example.com');

      expect(result.email).toBe('test@example.com');
    });

    it('should return null when user not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await User.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123', username: 'testuser' }]
      });

      const result = await User.findById('user-123');

      expect(result.id).toBe('user-123');
    });
  });

  describe('findOrCreate', () => {
    it('should return existing user if found', async () => {
      const existingUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };
      
      pool.query.mockResolvedValueOnce({ rows: [existingUser] });

      const result = await User.findOrCreate('test@example.com', 'Test User');

      expect(result).toEqual(existingUser);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should create new user if not found', async () => {
      const newUser = { id: 'user-456', email: 'new@example.com', name: 'New User', password_hash: null };
      
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // findByEmail returns empty
        .mockResolvedValueOnce({ rows: [newUser] }); // create returns new user

      const result = await User.findOrCreate('new@example.com', 'New User');

      expect(result).toEqual(newUser);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error when email is missing', async () => {
      await expect(User.findOrCreate(null)).rejects.toThrow('Email is required');
    });

    it('should use default name when not provided', async () => {
      const newUser = { id: 'user-789', email: 'test@example.com', name: 'Demo User' };
      
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newUser] });

      const result = await User.findOrCreate('test@example.com');

      expect(result.name).toBe('Demo User');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in findById', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(User.findById('user-123')).rejects.toThrow('Database error');
    });

    it('should handle database errors in create', async () => {
      pool.query.mockRejectedValueOnce(new Error('Duplicate key'));

      await expect(User.create('test@example.com', 'Test')).rejects.toThrow('Duplicate key');
    });
  });
});
