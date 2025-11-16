/**
 * Alert Worker Service
 * Background service that periodically checks alerts and triggers notifications
 */

const AlertService = require('./alert.service');
const { createLogger } = require('../../shared');

const logger = createLogger('Alert-Worker');

class AlertWorker {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 60000; // Default: 1 minute
    this.isRunning = false;
    this.intervalId = null;
    this.checkInProgress = false;
  }

  /**
   * Start the alert checking worker
   */
  start() {
    if (this.isRunning) {
      logger.warn('Alert worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Alert worker started', { intervalMs: this.intervalMs });

    // Run immediately on start
    this.checkAlerts();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAlerts();
    }, this.intervalMs);
  }

  /**
   * Stop the alert checking worker
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Alert worker stopped');
  }

  /**
   * Check all active alerts
   */
  async checkAlerts() {
    if (this.checkInProgress) {
      logger.debug('Alert check already in progress, skipping');
      return;
    }

    this.checkInProgress = true;

    try {
      const alerts = await AlertService.getActiveAlertsForChecking();
      logger.debug('Checking alerts', { count: alerts.length });

      if (alerts.length === 0) {
        this.checkInProgress = false;
        return;
      }

      // Process alerts in batches to avoid overwhelming the market data service
      const batchSize = 10;
      for (let i = 0; i < alerts.length; i += batchSize) {
        const batch = alerts.slice(i, i + batchSize);
        await Promise.all(batch.map(alert => this.checkSingleAlert(alert)));
      }

      logger.debug('Alert check completed', { count: alerts.length });
    } catch (error) {
      logger.error('Error in alert check cycle', { error: error.message });
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Check a single alert
   */
  async checkSingleAlert(alert) {
    try {
      // Update last checked timestamp
      await AlertService.updateLastChecked(alert.id);

      // Skip if already triggered
      if (alert.triggered) {
        return;
      }

      // Fetch current price data
      const priceData = await AlertService.fetchCurrentPrice(alert.assetId,alert.assetSymbol);

      if (!priceData) {
        logger.debug('Could not fetch price data', { alertId: alert.id, assetId: alert.assetId });
        return;
      }

      // Check if condition is met
      const result = AlertService.checkAlertCondition(alert, priceData);

      if (result.triggered) {
        // Mark alert as triggered
        await AlertService.markAlertTriggered(
          alert.id,
          priceData.price,
          result.currentValue
        );

        logger.info('Alert triggered', {
          alertId: alert.id,
          userId: alert.userId,
          assetId: alert.assetId,
          type: alert.type,
          condition: alert.condition,
          reason: result.reason,
          currentValue: result.currentValue,
          targetValue: result.targetValue
        });

        // TODO: Send notification (email, push, etc.)
        // This would integrate with a notification service
        await this.sendNotification(alert, result, priceData);
      }
    } catch (error) {
      logger.error('Error checking single alert', {
        alertId: alert.id,
        error: error.message
      });
    }
  }

  /**
   * Send notification for triggered alert
   * TODO: Integrate with actual notification service
   */
  async sendNotification(alert, checkResult, priceData) {
    try {
      // For now, just log the notification
      // In production, this would send email, push notification, etc.
      logger.info('Alert notification', {
        alertId: alert.id,
        userId: alert.userId,
        assetId: alert.assetId,
        message: checkResult.reason,
        currentPrice: priceData.price,
        currentChange: priceData.change24h
      });

      // Update notification_sent flag
      await query(
        'UPDATE alerts SET notification_sent = true WHERE id = $1',
        [alert.id]
      );
    } catch (error) {
      logger.error('Error sending notification', {
        alertId: alert.id,
        error: error.message
      });
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInProgress: this.checkInProgress,
      intervalMs: this.intervalMs
    };
  }
}

module.exports = AlertWorker;