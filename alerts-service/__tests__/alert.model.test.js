const Alert = require('../models/alert.model');

describe('Alert Model', () => {
  describe('Constructor', () => {
    it('should create alert from database row format', () => {
      const dbRow = {
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        asset_symbol: 'BTC',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        percentage_timeframe: null,
        active: true,
        triggered: false,
        trigger_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      const alert = new Alert(dbRow);

      expect(alert.id).toBe('alert-123');
      expect(alert.userId).toBe('user-123');
      expect(alert.assetId).toBe('bitcoin');
      expect(alert.assetSymbol).toBe('BTC');
      expect(alert.type).toBe('price_target');
      expect(alert.value).toBe(50000);
    });

    it('should create alert from API format', () => {
      const apiData = {
        id: 'alert-123',
        userId: 'user-123',
        assetId: 'bitcoin',
        assetSymbol: 'BTC',
        type: 'percentage_change',
        condition: 'increase',
        value: 5,
        percentageTimeframe: '24h'
      };

      const alert = new Alert(apiData);

      expect(alert.userId).toBe('user-123');
      expect(alert.percentageTimeframe).toBe('24h');
    });
  });

  describe('validate', () => {
    it('should validate valid price target alert', () => {
      const data = {
        userId: 'user-123',
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid percentage change alert', () => {
      const data = {
        userId: 'user-123',
        assetId: 'ethereum',
        type: 'percentage_change',
        condition: 'increase',
        value: 5,
        percentageTimeframe: '24h'
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(true);
    });

    it('should reject missing userId', () => {
      const data = {
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('user_id is required');
    });

    it('should reject missing assetId', () => {
      const data = {
        userId: 'user-123',
        type: 'price_target',
        condition: 'above',
        value: 50000
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('asset_id is required');
    });

    it('should reject invalid type', () => {
      const data = {
        userId: 'user-123',
        assetId: 'bitcoin',
        type: 'invalid_type',
        condition: 'above',
        value: 50000
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('type must be'))).toBe(true);
    });

    it('should reject invalid condition for price_target', () => {
      const data = {
        userId: 'user-123',
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'invalid',
        value: 50000
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('condition must be'))).toBe(true);
    });

    it('should reject invalid condition for percentage_change', () => {
      const data = {
        userId: 'user-123',
        assetId: 'ethereum',
        type: 'percentage_change',
        condition: 'invalid',
        value: 5
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
    });

    it('should reject invalid value', () => {
      const data = {
        userId: 'user-123',
        assetId: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: -100
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('value must be'))).toBe(true);
    });

    it('should reject invalid percentage_timeframe', () => {
      const data = {
        userId: 'user-123',
        assetId: 'ethereum',
        type: 'percentage_change',
        condition: 'increase',
        value: 5,
        percentageTimeframe: 'invalid'
      };

      const result = Alert.validate(data);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('percentage_timeframe'))).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should convert alert to JSON format', () => {
      const alert = new Alert({
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        active: true,
        triggered: false
      });

      const json = alert.toJSON();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('userId');
      expect(json).toHaveProperty('assetId');
      expect(json).toHaveProperty('type');
      expect(json).toHaveProperty('value', 50000);
      expect(json).toHaveProperty('active', true);
      expect(json).toHaveProperty('triggered', false);
    });
  });
});