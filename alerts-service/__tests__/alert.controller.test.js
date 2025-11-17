const request = require('supertest');
const express = require('express');
const alertRoutes = require('../routes/alert.routes');
const AlertService = require('../services/alert.service');
const { authMiddleware } = require('../../shared');

// Mock dependencies
jest.mock('../services/alert.service');
jest.mock('axios');
jest.mock('../../shared', () => ({
  ...jest.requireActual('../../shared'),
  authMiddleware: (req, res, next) => {
    req.userId = 'test-user-123';
    next();
  },
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/api/v1/alerts', alertRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: err
  });
});

describe('Alert Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure all AlertService methods are mocked
    AlertService.createAlert = jest.fn();
    AlertService.getUserAlerts = jest.fn();
    AlertService.getAlertById = jest.fn();
    AlertService.updateAlert = jest.fn();
    AlertService.deleteAlert = jest.fn();
    AlertService.resetAlert = jest.fn();
    AlertService.fetchCurrentPrice = jest.fn();
    AlertService.checkAlertCondition = jest.fn();
  });

  describe('POST /api/v1/alerts', () => {
    it('should create a new alert', async () => {
      const alertData = {
        assetId: 'bitcoin',
        assetSymbol: 'BTC',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      const mockAlert = {
        id: 'alert-123',
        userId: 'test-user-123',
        ...alertData,
        active: true,
        triggered: false,
        toJSON: () => ({
          id: 'alert-123',
          userId: 'test-user-123',
          ...alertData,
          active: true,
          triggered: false
        })
      };

      AlertService.createAlert.mockResolvedValue(mockAlert);

      const res = await request(app)
        .post('/api/v1/alerts')
        .send(alertData);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('price_target');
      expect(AlertService.createAlert).toHaveBeenCalledWith('test-user-123', alertData);
    });

    it('should return 400 for invalid alert data', async () => {
      const invalidData = {
        assetId: 'bitcoin',
        type: 'invalid_type'
      };

      AlertService.createAlert.mockRejectedValue(
        new Error('Validation failed: type must be either "price_target" or "percentage_change"')
      );

      const res = await request(app)
        .post('/api/v1/alerts')
        .send(invalidData);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/alerts', () => {
    it('should fetch all alerts for user', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          userId: 'test-user-123',
          assetId: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 50000,
          toJSON: () => ({
            id: 'alert-1',
            userId: 'test-user-123',
            assetId: 'bitcoin',
            type: 'price_target',
            condition: 'above',
            value: 50000
          })
        },
        {
          id: 'alert-2',
          userId: 'test-user-123',
          assetId: 'ethereum',
          type: 'percentage_change',
          condition: 'increase',
          value: 5,
          toJSON: () => ({
            id: 'alert-2',
            userId: 'test-user-123',
            assetId: 'ethereum',
            type: 'percentage_change',
            condition: 'increase',
            value: 5
          })
        }
      ];

      AlertService.getUserAlerts.mockResolvedValue(mockAlerts);

      const res = await request(app)
        .get('/api/v1/alerts');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('count', 2);
      expect(res.body).toHaveProperty('alerts');
      expect(res.body.alerts).toHaveLength(2);
    });

    it('should filter by activeOnly query parameter', async () => {
      AlertService.getUserAlerts.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/alerts')
        .query({ activeOnly: 'true' });

      expect(AlertService.getUserAlerts).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ activeOnly: true })
      );
    });
  });

  describe('GET /api/v1/alerts/:id', () => {
    it('should fetch a specific alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        userId: 'test-user-123',
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        toJSON: () => ({
          id: 'alert-123',
          userId: 'test-user-123',
          assetId: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 50000
        })
      };

      AlertService.getAlertById.mockResolvedValue(mockAlert);

      const res = await request(app)
        .get('/api/v1/alerts/alert-123');

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('alert-123');
    });

    it('should return 404 if alert not found', async () => {
      AlertService.getAlertById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/alerts/non-existent');

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Alert not found');
    });
  });

  describe('PUT /api/v1/alerts/:id', () => {
    it('should update an alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        userId: 'test-user-123',
        value: 60000,
        toJSON: () => ({
          id: 'alert-123',
          userId: 'test-user-123',
          value: 60000
        })
      };

      AlertService.updateAlert.mockResolvedValue(mockAlert);

      const res = await request(app)
        .put('/api/v1/alerts/alert-123')
        .send({ value: 60000 });

      expect(res.statusCode).toBe(200);
      expect(res.body.value).toBe(60000);
    });

    it('should return 404 if alert not found', async () => {
      AlertService.updateAlert.mockRejectedValue(new Error('Alert not found'));

      const res = await request(app)
        .put('/api/v1/alerts/non-existent')
        .send({ value: 60000 });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/alerts/:id', () => {
    it('should delete an alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        toJSON: () => ({ id: 'alert-123' })
      };

      AlertService.deleteAlert.mockResolvedValue(mockAlert);

      const res = await request(app)
        .delete('/api/v1/alerts/alert-123');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Alert deleted successfully');
    });

    it('should return 404 if alert not found', async () => {
      AlertService.deleteAlert.mockRejectedValue(new Error('Alert not found'));

      const res = await request(app)
        .delete('/api/v1/alerts/non-existent');

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/alerts/:id/reset', () => {
    it('should reset a triggered alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        triggered: false,
        toJSON: () => ({
          id: 'alert-123',
          triggered: false
        })
      };

      AlertService.resetAlert.mockResolvedValue(mockAlert);

      const res = await request(app)
        .post('/api/v1/alerts/alert-123/reset');

      expect(res.statusCode).toBe(200);
      expect(res.body.triggered).toBe(false);
    });
  });

  describe('POST /api/v1/alerts/:id/test', () => {
    it('should test an alert and return check result', async () => {
      const mockAlert = {
        id: 'alert-123',
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        toJSON: () => ({
          id: 'alert-123',
          assetId: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 50000
        })
      };

      const priceData = {
        price: 51000,
        change24h: 2.5
      };

      const checkResult = {
        triggered: true,
        reason: 'Price 51000 is above target 50000',
        currentValue: 51000,
        targetValue: 50000
      };

      AlertService.getAlertById.mockResolvedValue(mockAlert);
      AlertService.fetchCurrentPrice.mockResolvedValue(priceData);
      
      // Mock checkAlertCondition as a static method
      jest.spyOn(AlertService, 'checkAlertCondition').mockReturnValue(checkResult);

      const res = await request(app)
        .post('/api/v1/alerts/alert-123/test');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('alert');
      expect(res.body).toHaveProperty('priceData');
      expect(res.body).toHaveProperty('checkResult');
      expect(res.body.checkResult.triggered).toBe(true);
    });

    it('should return 404 if alert not found', async () => {
      AlertService.getAlertById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/alerts/non-existent/test');

      expect(res.statusCode).toBe(404);
    });

    it('should return 503 if price data unavailable', async () => {
      const mockAlert = {
        id: 'alert-123',
        assetId: 'bitcoin',
        toJSON: () => ({ id: 'alert-123', assetId: 'bitcoin' })
      };

      AlertService.getAlertById.mockResolvedValue(mockAlert);
      AlertService.fetchCurrentPrice.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/alerts/alert-123/test');

      expect(res.statusCode).toBe(503);
    });
  });
});