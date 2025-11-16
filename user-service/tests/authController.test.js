const authController = require('../controllers/authControllers');
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../db');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key';

describe('Auth Controller Unit Tests', () => {
  let mockReq;
  let mockRes;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock console methods to prevent pollution in test output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mock request and response objects
    mockReq = {
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('register', () => {
    
    it('should successfully register a new user', async () => {
      mockReq.body = {
        email: 'newuser@example.com',
        password: 'password123'
      };

      const mockSalt = 'mocksalt';
      const mockHashedPassword = 'hashedpassword123';
      const mockUser = { id: 1, email: 'newuser@example.com' };
      const mockToken = 'mockjwttoken';

      db.query
        .mockResolvedValueOnce({ rows: [] }) // No existing user
        .mockResolvedValueOnce({ rows: [mockUser] }); // User created
      
      bcrypt.genSalt.mockResolvedValue(mockSalt);
      bcrypt.hash.mockResolvedValue(mockHashedPassword);
      jwt.sign.mockReturnValue(mockToken);

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        user: mockUser,
        token: mockToken
      });
      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', mockSalt);
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    it('should return 400 if email is missing', async () => {
      mockReq.body = {
        password: 'password123'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Fields are null.'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = {
        email: 'test@example.com'
      };

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Fields are null.'
      });
    });

    it('should return 409 if user already exists (from query)', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        password: 'password123'
      };

      const existingUser = { id: 1, email: 'existing@example.com' };
      db.query.mockResolvedValue({ rows: [existingUser] });

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User already exists.'
      });
    });

    it('should handle database unique constraint violation', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const dbError = new Error('duplicate key');
      dbError.code = '23505';

      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(dbError);
      
      bcrypt.genSalt.mockResolvedValue('salt');
      bcrypt.hash.mockResolvedValue('hashed');

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Email already in use.'
      });
    });

    it('should return 500 on general server error', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error.'
      });
    });
  });

  describe('login', () => {
    
    it('should successfully login a user with correct credentials', async () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        password_hash: 'hashedpassword'
      };
      const mockToken = 'mockjwttoken';

      db.query.mockResolvedValue({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue(mockToken);

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        user: { id: 1, email: 'user@example.com', name: 'Test User' },
        token: mockToken
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
    });

    it('should return 400 if email is missing', async () => {
      mockReq.body = {
        password: 'password123'
      };

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Fields are null.'
      });
    });

    it('should return 400 if password is missing', async () => {
      mockReq.body = {
        email: 'test@example.com'
      };

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Fields are null.'
      });
    });

    it('should return 401 if user does not exist', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      db.query.mockResolvedValue({ rows: [] });

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Invalid credentials.'
      });
    });

    it('should return 401 if password does not match', async () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password_hash: 'hashedpassword'
      };

      db.query.mockResolvedValue({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Invalid credentials.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'password123'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error during login.'
      });
    });

    it('should not include password_hash in response', async () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        password_hash: 'hashedpassword'
      };

      db.query.mockResolvedValue({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await authController.login(mockReq, mockRes);

      const responseUser = mockRes.json.mock.calls[0][0].user;
      expect(responseUser).not.toHaveProperty('password_hash');
      expect(responseUser).toHaveProperty('id');
      expect(responseUser).toHaveProperty('email');
      expect(responseUser).toHaveProperty('name');
    });
  });

  describe('forgotPassword', () => {
    
    it('should successfully initiate password reset for existing user', async () => {
      mockReq.body = {
        email: 'user@example.com'
      };

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        password_hash: 'hashedpassword'
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // User found
        .mockResolvedValueOnce({ rows: [] }); // Update successful

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('password reset link')
        })
      );
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE public.users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        expect.arrayContaining([expect.any(String), expect.any(Date), 'user-uuid-123'])
      );
    });

    it('should return success message even if user does not exist', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com'
      };

      db.query.mockResolvedValue({ rows: [] });

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('password reset link')
        })
      );
    });

    it('should return 400 if email is missing', async () => {
      mockReq.body = {};

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Email is required.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.body = {
        email: 'user@example.com'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error during password reset request.'
      });
    });

    it('should include reset token in development environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      mockReq.body = {
        email: 'user@example.com'
      };

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com'
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          resetToken: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('resetPassword', () => {
    
    it('should successfully reset password with valid token', async () => {
      const plainToken = 'valid-reset-token';
      const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
      
      mockReq.body = {
        token: plainToken,
        newPassword: 'newPassword123'
      };

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        reset_token: hashedToken,
        reset_token_expires: new Date(Date.now() + 3600000)
      };

      const mockHashedPassword = 'newHashedPassword';

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Token valid
        .mockResolvedValueOnce({ rows: [] }); // Update successful
      
      bcrypt.genSalt.mockResolvedValue('salt');
      bcrypt.hash.mockResolvedValue(mockHashedPassword);

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Password has been reset successfully.'
      });
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE public.users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
        [mockHashedPassword, 'user-uuid-123']
      );
    });

    it('should return 400 if token is missing', async () => {
      mockReq.body = {
        newPassword: 'newPassword123'
      };

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Token and new password are required.'
      });
    });

    it('should return 400 if new password is missing', async () => {
      mockReq.body = {
        token: 'some-token'
      };

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Token and new password are required.'
      });
    });

    it('should return 400 if password is too short', async () => {
      mockReq.body = {
        token: 'some-token',
        newPassword: 'short'
      };

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Password must be at least 6 characters long.'
      });
    });

    it('should return 400 if token is invalid or expired', async () => {
      mockReq.body = {
        token: 'invalid-token',
        newPassword: 'newPassword123'
      };

      db.query.mockResolvedValue({ rows: [] });

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Invalid or expired reset token.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.body = {
        token: 'some-token',
        newPassword: 'newPassword123'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error during password reset.'
      });
    });
  });

  describe('getProfile', () => {
    
    it('should successfully return user profile', async () => {
      mockReq.userId = 'user-uuid-123';

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'Test User',
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      await authController.getProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        user: mockUser
      });
      expect(db.query).toHaveBeenCalledWith(
        'SELECT id, email, name, birthday, phone_number, country, created_at FROM public.users WHERE id = $1',
        ['user-uuid-123']
      );
    });

    it('should not include password_hash in profile response', async () => {
      mockReq.userId = 'user-uuid-123';

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'Test User',
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      await authController.getProfile(mockReq, mockRes);

      const responseUser = mockRes.json.mock.calls[0][0].user;
      expect(responseUser).not.toHaveProperty('password_hash');
      expect(responseUser).not.toHaveProperty('reset_token');
    });

    it('should return 404 if user not found', async () => {
      mockReq.userId = 'nonexistent-uuid';

      db.query.mockResolvedValue({ rows: [] });

      await authController.getProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User not found.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.userId = 'user-uuid-123';

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.getProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error while fetching profile.'
      });
    });
  });

  describe('updateProfile', () => {
    
    it('should successfully update user profile with all fields', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        name: 'Updated Name',
        birthday: '1990-01-01',
        phone_number: '+1234567890',
        country: 'USA'
      };

      const mockUpdatedUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'Updated Name',
        birthday: '1990-01-01',
        phone_number: '+1234567890',
        country: 'USA',
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        user: mockUpdatedUser,
        message: 'Profile updated successfully.'
      });
    });

    it('should update only provided fields', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        name: 'New Name'
      };

      const mockUpdatedUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'New Name',
        birthday: null,
        phone_number: null,
        country: null,
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.users'),
        expect.any(Array)
      );
    });

    it('should allow clearing fields with null values', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        birthday: null,
        phone_number: null
      };

      const mockUpdatedUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'Test User',
        birthday: null,
        phone_number: null,
        country: 'USA',
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when no fields are provided', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {};

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'No fields to update.'
      });
    });

    it('should return 404 if user not found', async () => {
      mockReq.userId = 'nonexistent-uuid';
      mockReq.body = {
        name: 'New Name'
      };

      db.query.mockResolvedValue({ rows: [] });

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User not found.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        name: 'New Name'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error while updating profile.'
      });
    });

    it('should handle partial updates without affecting other fields', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        country: 'Canada'
      };

      const mockUpdatedUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        name: 'Test User',
        birthday: '1990-01-01',
        phone_number: '+1234567890',
        country: 'Canada',
        created_at: '2025-01-01T00:00:00.000Z'
      };

      db.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      await authController.updateProfile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            country: 'Canada'
          })
        })
      );
    });
  });

  describe('deleteAccount', () => {
    
    it('should successfully delete user account with correct password', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        password: 'correctPassword123'
      };

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        password_hash: 'hashedpassword'
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // User found
        .mockResolvedValueOnce({ rows: [] }); // Delete successful
      
      bcrypt.compare.mockResolvedValue(true);

      await authController.deleteAccount(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Account deleted successfully.'
      });
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM public.users WHERE id = $1',
        ['user-uuid-123']
      );
    });

    it('should return 400 if password is missing', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {};

      await authController.deleteAccount(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Password confirmation is required.'
      });
    });

    it('should return 404 if user not found', async () => {
      mockReq.userId = 'nonexistent-uuid';
      mockReq.body = {
        password: 'somePassword'
      };

      db.query.mockResolvedValue({ rows: [] });

      await authController.deleteAccount(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User not found.'
      });
    });

    it('should return 401 if password is incorrect', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        password: 'wrongPassword'
      };

      const mockUser = {
        id: 'user-uuid-123',
        email: 'user@example.com',
        password_hash: 'hashedpassword'
      };

      db.query.mockResolvedValue({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(false);

      await authController.deleteAccount(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Invalid password.'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        password: 'password123'
      };

      db.query.mockRejectedValue(new Error('Database error'));

      await authController.deleteAccount(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Server error while deleting account.'
      });
    });

    it('should verify password before deletion', async () => {
      mockReq.userId = 'user-uuid-123';
      mockReq.body = {
        password: 'password123'
      };

      const mockUser = {
        id: 'user-uuid-123',
        password_hash: 'hashedpassword'
      };

      db.query.mockResolvedValueOnce({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValue(true);

      await authController.deleteAccount(mockReq, mockRes);

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
    });
  });
});
