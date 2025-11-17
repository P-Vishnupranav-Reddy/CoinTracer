/**
 * Alert Controller
 * Handles HTTP requests for alerts
 */

const AlertService = require('../services/alert.service');
const Alert = require('../models/alert.model');
const { createLogger } = require('../../shared');

const logger = createLogger('Alert-Controller');

/**
 * Create a new alert
 * POST /api/v1/alerts
 */
exports.createAlert = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertData = req.body;

    const alert = await AlertService.createAlert(userId, alertData);
    res.status(201).json(alert.toJSON());
  } catch (error) {
    logger.error('Error creating alert', { error: error.message });
    if (error.message.includes('Validation failed')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Get all alerts for the authenticated user
 * GET /api/v1/alerts
 */
exports.getAlerts = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { activeOnly, type } = req.query;

    const options = {
      activeOnly: activeOnly === 'true',
      type: type || null
    };

    const alerts = await AlertService.getUserAlerts(userId, options);
    res.json({
      count: alerts.length,
      alerts: alerts.map(alert => alert.toJSON())
    });
  } catch (error) {
    logger.error('Error fetching alerts', { error: error.message });
    next(error);
  }
};

/**
 * Get a specific alert by ID
 * GET /api/v1/alerts/:id
 */
exports.getAlertById = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertId = req.params.id;

    const alert = await AlertService.getAlertById(alertId, userId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alert.toJSON());
  } catch (error) {
    logger.error('Error fetching alert', { error: error.message });
    next(error);
  }
};

/**
 * Update an alert
 * PUT /api/v1/alerts/:id
 */
exports.updateAlert = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertId = req.params.id;
    const updateData = req.body;

    const alert = await AlertService.updateAlert(alertId, userId, updateData);
    res.json(alert.toJSON());
  } catch (error) {
    logger.error('Error updating alert', { error: error.message });
    if (error.message === 'Alert not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('No valid fields')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Delete an alert
 * DELETE /api/v1/alerts/:id
 */
exports.deleteAlert = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertId = req.params.id;

    await AlertService.deleteAlert(alertId, userId);
    res.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    logger.error('Error deleting alert', { error: error.message });
    if (error.message === 'Alert not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Reset a triggered alert
 * POST /api/v1/alerts/:id/reset
 */
exports.resetAlert = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertId = req.params.id;

    const alert = await AlertService.resetAlert(alertId, userId);
    res.json(alert.toJSON());
  } catch (error) {
    logger.error('Error resetting alert', { error: error.message });
    if (error.message === 'Alert not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * Test an alert (check if it would trigger)
 * POST /api/v1/alerts/:id/test
 */
exports.testAlert = async (req, res, next) => {
  try {
    const userId = req.userId;
    const alertId = req.params.id;

    const alert = await AlertService.getAlertById(alertId, userId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Fetch current price
    const priceData = await AlertService.fetchCurrentPrice(alert.assetId, alert.assetSymbol);
    if (!priceData) {
      return res.status(503).json({ error: 'Unable to fetch current price data' });
    }

    // Check condition
    const result = AlertService.checkAlertCondition(alert, priceData);

    res.json({
      alert: alert.toJSON(),
      priceData,
      checkResult: result
    });
  } catch (error) {
    logger.error('Error testing alert', { error: error.message });
    next(error);
  }
};