const AlertWorker = require('../services/alertWorker.service');
const AlertService = require('../services/alert.service');
const Alert = require('../models/alert.model');

// Mock dependencies
jest.mock('../services/alert.service');
jest.mock('../../shared/database', () => ({
  query: jest.fn()
}));

describe('AlertWorker', () => {
  let worker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    worker = new AlertWorker({ intervalMs: 1000 });
  });

  afterEach(() => {
    worker.stop();
    jest.useRealTimers();
  });

  // -------------------------------
  // start()
  // -------------------------------
  describe('start', () => {
    it('should start the worker and check alerts immediately', async () => {
      AlertService.getActiveAlertsForChecking.mockResolvedValue([]);

      worker.start();

      // Wait for async checkAlerts to complete
      await Promise.resolve();

      expect(worker.isRunning).toBe(true);
      expect(AlertService.getActiveAlertsForChecking).toHaveBeenCalled();
    });

    it('should check alerts periodically', async () => {
      AlertService.getActiveAlertsForChecking.mockResolvedValue([]);

      worker.start();

      // Wait for initial check to complete
      await Promise.resolve();

      jest.advanceTimersByTime(2000);

      // Wait for async operations to complete
      await Promise.resolve();

      expect(AlertService.getActiveAlertsForChecking.mock.calls.length).toBeGreaterThan(1);
    });

    it('should not start if already running', () => {
      AlertService.getActiveAlertsForChecking.mockResolvedValue([]);

      worker.start();
      const initialCount = AlertService.getActiveAlertsForChecking.mock.calls.length;

      worker.start(); // should NOT start again

      expect(AlertService.getActiveAlertsForChecking.mock.calls.length).toBe(initialCount);
    });
  });

  // -------------------------------
  // stop()
  // -------------------------------
  describe('stop', () => {
    it('should stop the worker', () => {
      worker.start();
      expect(worker.isRunning).toBe(true);

      worker.stop();
      expect(worker.isRunning).toBe(false);
    });

    it('should not throw if stop() is called while not running', () => {
      expect(() => worker.stop()).not.toThrow();
    });
  });

  // -------------------------------
  // checkAlerts()
  // -------------------------------
  describe('checkAlerts', () => {
    it('should process alerts in batches', async () => {
      const mockAlerts = Array.from({ length: 25 }, (_, i) => new Alert({
        id: `alert-${i}`,
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000
      }));

      AlertService.getActiveAlertsForChecking.mockResolvedValue(mockAlerts);
      AlertService.updateLastChecked.mockResolvedValue();
      AlertService.fetchCurrentPrice.mockResolvedValue({ price: 51000, change24h: 2.5 });
      AlertService.checkAlertCondition.mockReturnValue({ triggered: false });

      await worker.checkAlerts();

      expect(AlertService.updateLastChecked).toHaveBeenCalledTimes(25);
    });

    it('should skip if check already in progress', async () => {
      AlertService.getActiveAlertsForChecking.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );

      const p1 = worker.checkAlerts();
      const p2 = worker.checkAlerts(); // should skip

      await Promise.all([p1, p2]);

      expect(AlertService.getActiveAlertsForChecking).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------
  // checkSingleAlert()
  // -------------------------------
  describe('checkSingleAlert', () => {
    it('should trigger alert when condition is met', async () => {
      const alert = new Alert({
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        triggered: false
      });

      AlertService.updateLastChecked.mockResolvedValue();
      AlertService.fetchCurrentPrice.mockResolvedValue({ price: 51000, change24h: 2.5 });
      AlertService.checkAlertCondition.mockReturnValue({
        triggered: true,
        reason: 'Price 51000 is above target 50000',
        currentValue: 51000,
        targetValue: 50000
      });
      AlertService.markAlertTriggered.mockResolvedValue(alert);

      await worker.checkSingleAlert(alert);

      expect(AlertService.markAlertTriggered).toHaveBeenCalledWith(
        'alert-123',
        51000,
        51000
      );
    });

    it('should NOT trigger alert if condition not met', async () => {
      const alert = new Alert({
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        triggered: false
      });

      AlertService.updateLastChecked.mockResolvedValue();
      AlertService.fetchCurrentPrice.mockResolvedValue({ price: 49000, change24h: -2.5 });
      AlertService.checkAlertCondition.mockReturnValue({ triggered: false });

      await worker.checkSingleAlert(alert);

      expect(AlertService.markAlertTriggered).not.toHaveBeenCalled();
    });

    it('should skip if alert is already triggered', async () => {
      const alert = new Alert({
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000,
        triggered: true
      });

      await worker.checkSingleAlert(alert);

      expect(AlertService.fetchCurrentPrice).not.toHaveBeenCalled();
    });

    it('should not throw if an error occurs', async () => {
      const alert = new Alert({
        id: 'alert-123',
        user_id: 'user-123',
        asset_id: 'bitcoin',
        type: 'price_target',
        condition: 'above',
        value: 50000
      });

      AlertService.updateLastChecked.mockRejectedValue(new Error('DB error'));

      await expect(worker.checkSingleAlert(alert)).resolves.not.toThrow();
    });
  });

  // -------------------------------
  // getStatus()
  // -------------------------------
  describe('getStatus', () => {
    it('should return worker status', () => {
      const status = worker.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('checkInProgress');
      expect(status).toHaveProperty('intervalMs');
    });
  });
});
