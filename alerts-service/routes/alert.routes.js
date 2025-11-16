/**
 * Alert Routes
 * Defines API routes for alerts
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../shared');
const alertController = require('../controllers/alert.controller');

// All routes require authentication
router.use(authMiddleware);

// Create alert
router.post('/', alertController.createAlert);

// Get all alerts
router.get('/', alertController.getAlerts);

// Get specific alert
router.get('/:id', alertController.getAlertById);

// Update alert
router.put('/:id', alertController.updateAlert);

// Delete alert
router.delete('/:id', alertController.deleteAlert);

// Reset triggered alert
router.post('/:id/reset', alertController.resetAlert);

// Test alert (check if it would trigger)
router.post('/:id/test', alertController.testAlert);

module.exports = router;