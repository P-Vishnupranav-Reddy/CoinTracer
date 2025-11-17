const AlertService = require('../services/alert.service');
const Alert = require('../models/alert.model');
const { query } = require('../../shared/database');
const axios = require('axios');

// Mock dependencies
jest.mock('../../shared/database');
jest.mock('axios');
jest.mock('../../shared', () => ({
  ...jest.requireActual('../../shared'),
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure axios is always mocked
    axios.get = jest.fn();
  });

  describe('createAlert', () => {
    it('should create a price target alert successfully', async () => {
      const userId = 'user-123';
      const alertData = {
        assetId: 'bitcoin',
        assetSymbol: 'BTC',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      const mockRow = {
        id: 'alert-123',
        user_id: userId,
        asset_id: alertData.assetId,
        asset_symbol: alertData.assetSymbol,
        type: alertData.type,
        condition: alertData.condition,
        value: alertData.value,
        percentage_timeframe: null,
        active: true,
        triggered: false,
        trigger_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      query.mockResolvedValue({ rows: [mockRow] });

      const alert = await AlertService.createAlert(userId, alertData);

      expect(alert).toBeInstanceOf(Alert);
      expect(alert.type).toBe('price_target');
      expect(alert.condition).toBe('above');
      expect(alert.value).toBe(50000);
      expect(query).toHaveBeenCalled();
    });

    it('should create a percentage change alert successfully', async () => {
      const userId = 'user-123';
      const alertData = {
        assetId: 'ethereum',
        assetSymbol: 'ETH',
        type: 'percentage_change',
        condition: 'increase',
        value: 5,
        percentageTimeframe: '24h'
      };

      const mockRow = {
        id: 'alert-456',
        user_id: userId,
        asset_id: alertData.assetId,
        asset_symbol: alertData.assetSymbol,
        type: alertData.type,
        condition: alertData.condition,
        value: alertData.value,
        percentage_timeframe: '24h',
        active: true,
        triggered: false,
        trigger_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      query.mockResolvedValue({ rows: [mockRow] });

      const alert = await AlertService.createAlert(userId, alertData);

      expect(alert).toBeInstanceOf(Alert);
      expect(alert.type).toBe('percentage_change');
      expect(alert.percentageTimeframe).toBe('24h');
      expect(query).toHaveBeenCalled();
    });

    it('should throw error for invalid alert data', async () => {
      const userId = 'user-123';
      const invalidData = {
        assetId: 'bitcoin',
        type: 'invalid_type',
        condition: 'above',
        value: 50000
      };

      await expect(AlertService.createAlert(userId, invalidData)).rejects.toThrow();
    });
  });

  describe('getUserAlerts', () => {
    it('should fetch all alerts for a user', async () => {
      const userId = 'user-123';
      const mockRows = [
        {
          id: 'alert-1',
          user_id: userId,
          asset_id: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 50000,
          active: true,
          triggered: false
        },
        {
          id: 'alert-2',
          user_id: userId,
          asset_id: 'ethereum',
          type: 'percentage_change',
          condition: 'increase',
          value: 5,
          active: true,
          triggered: false
        }
      ];

      query.mockResolvedValue({ rows: mockRows });

      const alerts = await AlertService.getUserAlerts(userId);

      expect(alerts).toHaveLength(2);
      expect(alerts[0]).toBeInstanceOf(Alert);
      expect(query).toHaveBeenCalled();
    });

    it('should filter by activeOnly option', async () => {
      const userId = 'user-123';
      query.mockResolvedValue({ rows: [] });

      await AlertService.getUserAlerts(userId, { activeOnly: true });

      const sqlCall = query.mock.calls[0][0];
      expect(sqlCall).toContain('active = true');
    });
  });

  describe('getAlertById', () => {
    it('should return alert if found', async () => {
      const userId = 'user-123';
      const alertId = 'alert-123';
      const mockRow = {
        id: alertId,
        user_id: userId,
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      query.mockResolvedValue({ rows: [mockRow] });

      const alert = await AlertService.getAlertById(alertId, userId);

      expect(alert).toBeInstanceOf(Alert);
      expect(alert.id).toBe(alertId);
    });

    it('should return null if alert not found', async () => {
      query.mockResolvedValue({ rows: [] });

      const alert = await AlertService.getAlertById('non-existent', 'user-123');

      expect(alert).toBeNull();
    });
  });

  describe('updateAlert', () => {
    it('should update alert successfully', async () => {
      const userId = 'user-123';
      const alertId = 'alert-123';

      // Mock getAlertById
      query.mockResolvedValueOnce({
        rows: [{
          id: alertId,
          user_id: userId,
          asset_id: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 50000
        }]
      });

      // Mock update
      query.mockResolvedValueOnce({
        rows: [{
          id: alertId,
          user_id: userId,
          asset_id: 'bitcoin',
          type: 'price_target',
          condition: 'above',
          value: 60000
        }]
      });

      const updated = await AlertService.updateAlert(alertId, userId, { value: 60000 });

      expect(updated.value).toBe(60000);
    });

    it('should throw error if alert not found', async () => {
      query.mockResolvedValue({ rows: [] });

      await expect(
        AlertService.updateAlert('non-existent', 'user-123', { value: 60000 })
      ).rejects.toThrow('Alert not found');
    });
  });

  describe('deleteAlert', () => {
    it('should delete alert successfully', async () => {
      const userId = 'user-123';
      const alertId = 'alert-123';
      const mockRow = {
        id: alertId,
        user_id: userId
      };

      query.mockResolvedValue({ rows: [mockRow] });

      const deleted = await AlertService.deleteAlert(alertId, userId);

      expect(deleted).toBeInstanceOf(Alert);
      expect(query).toHaveBeenCalled();
    });

    it('should throw error if alert not found', async () => {
      query.mockResolvedValue({ rows: [] });

      await expect(
        AlertService.deleteAlert('non-existent', 'user-123')
      ).rejects.toThrow('Alert not found');
    });
  });

  describe('fetchCurrentPrice', () => {
    it('should fetch price data successfully', async () => {
      const assetId = 'bitcoin';
      const assetSymbol = 'BTC';
      const mockResponse = {
        data: {
          price: 50000,
          change24h: 2.5,
          change7d: 10.0,
          change1h: 0.5
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const priceData = await AlertService.fetchCurrentPrice(assetId, assetSymbol);

      expect(priceData).toEqual({
        price: 50000,
        change24h: 2.5,
        change7d: 10.0,
        change30d: null,
        change1h: 0.5
      });
      expect(axios.get).toHaveBeenCalled();
    });

    it('should work with only assetId (backward compatible)', async () => {
      const assetId = 'bitcoin';
      const mockResponse = {
        data: {
          price: 50000,
          change24h: 2.5
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const priceData = await AlertService.fetchCurrentPrice(assetId);

      expect(priceData).toBeTruthy();
      expect(priceData.price).toBe(50000);
      expect(axios.get).toHaveBeenCalled();
    });

    it('should try symbol first, then assetId on 404', async () => {
      const assetId = 'ethereum';
      const assetSymbol = 'ETH';
      
      // First call (symbol) returns 404, second call (assetId) succeeds
      axios.get
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({
          data: {
            price: 3000,
            change24h: 1.5
          }
        });

      const priceData = await AlertService.fetchCurrentPrice(assetId, assetSymbol);

      expect(priceData).toBeTruthy();
      expect(priceData.price).toBe(3000);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should return null on error', async () => {
      // Mock axios to reject with a non-404 error
      axios.get.mockRejectedValue({ 
        message: 'Network error',
        response: { status: 500 }
      });

      const priceData = await AlertService.fetchCurrentPrice('bitcoin');

      expect(priceData).toBeNull();
      expect(axios.get).toHaveBeenCalled();

    });
  });

  describe('checkAlertCondition', () => {
    it('should trigger price target above condition', () => {
      const alert = new Alert({
        type: 'price_target',
        condition: 'above',
        value: 50000
      });

      const priceData = { price: 51000, change24h: 2.5 };

      const result = AlertService.checkAlertCondition(alert, priceData);

      expect(result.triggered).toBe(true);
      expect(result.currentValue).toBe(51000);
      expect(result.targetValue).toBe(50000);
    });

    it('should trigger price target below condition', () => {
      const alert = new Alert({
        type: 'price_target',
        condition: 'below',
        value: 50000
      });

      const priceData = { price: 49000, change24h: -2.5 };

      const result = AlertService.checkAlertCondition(alert, priceData);

      expect(result.triggered).toBe(true);
    });

    it('should trigger percentage increase condition', () => {
      const alert = new Alert({
        type: 'percentage_change',
        condition: 'increase',
        value: 5,
        percentageTimeframe: '24h'
      });

      const priceData = { price: 50000, change24h: 6.5 };

      const result = AlertService.checkAlertCondition(alert, priceData);

      expect(result.triggered).toBe(true);
      expect(result.currentValue).toBe(6.5);
    });

    it('should trigger percentage decrease condition', () => {
      const alert = new Alert({
        type: 'percentage_change',
        condition: 'decrease',
        value: 5,
        percentageTimeframe: '24h'
      });

      const priceData = { price: 50000, change24h: -6.5 };

      const result = AlertService.checkAlertCondition(alert, priceData);

      expect(result.triggered).toBe(true);
      expect(result.currentValue).toBe(-6.5);
    });

    it('should not trigger when condition not met', () => {
      const alert = new Alert({
        type: 'price_target',
        condition: 'above',
        value: 50000
      });

      const priceData = { price: 49000, change24h: 2.5 };

      const result = AlertService.checkAlertCondition(alert, priceData);

      expect(result.triggered).toBe(false);
    });

    it('should return false when price data unavailable', () => {
      const alert = new Alert({
        type: 'price_target',
        condition: 'above',
        value: 50000
      });

      const result = AlertService.checkAlertCondition(alert, null);

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain('unavailable');
    });
  });
});