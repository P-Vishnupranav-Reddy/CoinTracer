const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Mock the database module
jest.mock('../db');

// Create an express app for testing
const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ 
    message: err.message || 'Internal server error' 
  });
});

// Mock console methods
let consoleErrorSpy;
let consoleLogSpy;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key';

describe('User Service - Authentication', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com'
      };

      // Mock database responses
      db.query
        .mockResolvedValueOnce({ rows: [] }) // Check if user exists (returns empty)
        .mockResolvedValueOnce({ rows: [mockUser] }); // Insert new user

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.user).toHaveProperty('id');
      
      // Verify JWT token
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('userId');
      expect(decoded.userId).toBe(mockUser.id);
    });

    it('should fail to register a user with an existing email', async () => {
      const existingUser = {
        id: 1,
        email: 'existing@example.com',
        password_hash: 'hashed'
      };

      // Mock database to return existing user
      db.query.mockResolvedValue({ rows: [existingUser] });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('User already exists.');
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Fields are null.');
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Fields are null.');
    });

    it('should return 400 when both email and password are missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Fields are null.');
    });

    it('should handle database unique constraint violation', async () => {
      const dbError = new Error('duplicate key value');
      dbError.code = '23505'; // PostgreSQL unique violation code

      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(dbError);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Email already in use.');
    });

    it('should handle general database errors', async () => {
      db.query.mockRejectedValue(new Error('Database connection failed'));

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Server error.');
    });

    it('should hash the password before storing', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com'
      };

      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      // Verify password was hashed (not stored as plain text)
      const insertCall = db.query.mock.calls[1];
      const hashedPassword = insertCall[1][1];
      expect(hashedPassword).not.toBe('password123');
      expect(hashedPassword.length).toBeGreaterThan(20);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    
    it('should login an existing user successfully', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 1,
        email: 'login@example.com',
        name: 'Test User',
        password_hash: hashedPassword
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'login@example.com', 
          password: 'password123' 
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('login@example.com');
      expect(res.body.user.id).toBe(1);
      
      // Verify token
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(mockUser.id);
    });

    it('should return 401 for non-existent user', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'noone@example.com', 
          password: 'wrongpassword' 
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid credentials.');
    });

    it('should return 401 for incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password_hash: hashedPassword
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'user@example.com', 
          password: 'wrongpassword' 
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe('Invalid credentials.');
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Fields are null.');
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Fields are null.');
    });

    it('should handle database errors during login', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'password123' 
        });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Server error during login.');
    });

    it('should not include password_hash in response', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 1,
        email: 'login@example.com',
        name: 'Test User',
        password_hash: hashedPassword
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'login@example.com', 
          password: 'password123' 
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should generate valid JWT token with 1 hour expiry', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 1,
        email: 'login@example.com',
        password_hash: hashedPassword
      };

      db.query.mockResolvedValue({ rows: [mockUser] });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ 
          email: 'login@example.com', 
          password: 'password123' 
        });

      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      const expiryTime = decoded.exp - decoded.iat;
      expect(expiryTime).toBe(3600); // 1 hour = 3600 seconds
    });
  });
});