/**
 * Alert Service
 * Business logic for managing alerts
 */

const { query } = require('../../shared/database');
const Alert = require('../models/alert.model');
const { createLogger } = require('../../shared');
const axios = require('axios');

const logger = createLogger('Alert-Service');

class AlertService {
  /**
   * Create a new alert
   */
  static async createAlert(userId, alertData) {
    const validation = Alert.validate({ ...alertData, userId });
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const {
      assetId,
      assetSymbol,
      type,
      condition,
      value,
      percentageTimeframe
    } = alertData;

    const sql = `
      INSERT INTO alerts (
        user_id, asset_id, asset_symbol, type, condition, value, percentage_timeframe
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const { rows } = await query(sql, [
      userId,
      assetId,
      assetSymbol || null,
      type,
      condition,
      value,
      type === 'percentage_change' ? (percentageTimeframe || '24h') : null
    ]);

    logger.info('Alert created', { userId, alertId: rows[0].id, type });
    return new Alert(rows[0]);
  }

  /**
   * Get all alerts for a user
   */
  static async getUserAlerts(userId, options = {}) {
    const { activeOnly = false, type = null } = options;
    let sql = 'SELECT * FROM alerts WHERE user_id = $1';
    const params = [userId];

    if (activeOnly) {
      sql += ' AND active = true';
    }

    if (type) {
      sql += ' AND type = $2';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await query(sql, params);
    return rows.map(row => new Alert(row));
  }

  /**
   * Get a specific alert by ID
   */
  static async getAlertById(alertId, userId) {
    const sql = 'SELECT * FROM alerts WHERE id = $1 AND user_id = $2';
    const { rows } = await query(sql, [alertId, userId]);

    if (rows.length === 0) {
      return null;
    }
    return new Alert(rows[0]);
  }

  /**
   * Update an alert
   */
  static async updateAlert(alertId, userId, updateData) {
    const existingAlert = await this.getAlertById(alertId, userId);
    if (!existingAlert) {
      throw new Error('Alert not found');
    }

    const allowedFields = ['value', 'condition', 'active', 'percentage_timeframe'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(updateData)) {
      const dbKey = key === 'percentageTimeframe' ? 'percentage_timeframe' : key;
      if (allowedFields.includes(dbKey) && val !== undefined) {
        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(alertId, userId);

    const sql = `
      UPDATE alerts
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const { rows } = await query(sql, values);
    logger.info('Alert updated', { userId, alertId });
    return new Alert(rows[0]);
  }

  /**
   * Delete an alert
   */
  static async deleteAlert(alertId, userId) {
    const sql = 'DELETE FROM alerts WHERE id = $1 AND user_id = $2 RETURNING *';
    const { rows } = await query(sql, [alertId, userId]);

    if (rows.length === 0) {
      throw new Error('Alert not found');
    }

    logger.info('Alert deleted', { userId, alertId });
    return new Alert(rows[0]);
  }

  /**
   * Get active alerts for checking
   */
  static async getActiveAlertsForChecking() {
    const sql = `
      SELECT * FROM alerts
      WHERE active = true AND triggered = false
      ORDER BY last_checked_at NULLS FIRST, created_at ASC
      LIMIT 100
    `;

    const { rows } = await query(sql);
    return rows.map(row => new Alert(row));
  }

  /**
   * Mark alert triggered
   */
  static async markAlertTriggered(alertId, currentPrice = null, currentChange = null) {
    const sql = `
      UPDATE alerts
      SET 
        triggered = true,
        triggered_at = CURRENT_TIMESTAMP,
        trigger_count = trigger_count + 1,
        last_checked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await query(sql, [alertId]);
    logger.info('Alert triggered', { alertId, currentPrice, currentChange });
    return new Alert(rows[0]);
  }

  /**
   * Update last checked timestamp
   */
  static async updateLastChecked(alertId) {
    const sql = `
      UPDATE alerts
      SET last_checked_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await query(sql, [alertId]);
  }

  /**
   * Reset alert
   */
  static async resetAlert(alertId, userId) {
    const sql = `
      UPDATE alerts
      SET 
        triggered = false,
        triggered_at = NULL,
        notification_sent = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const { rows } = await query(sql, [alertId, userId]);
    if (rows.length === 0) {
      throw new Error('Alert not found');
    }

    logger.info('Alert reset', { userId, alertId });
    return new Alert(rows[0]);
  }

  /**
   * Fetch current price
   */
  static async fetchCurrentPrice(assetId, assetSymbol = null) {
    try {
      let baseUrl = (process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:5001').replace(/\/$/, '');
      if (!baseUrl.includes('/api/v1')) baseUrl = `${baseUrl}/api/v1`;

      let response;
      const identifiers = [];
      if (assetSymbol) identifiers.push({ value: assetSymbol, type: 'symbol' });
      if (assetId) identifiers.push({ value: assetId, type: 'assetId' });

      let lastError = null;

      for (const identifier of identifiers) {
        const url = `${baseUrl}/market/prices/${identifier.value}`;
        try {
          response = await axios.get(url, { timeout: 5000 });
          logger.debug('Successfully fetched price', { identifier, url });
          break;
        } catch (error) {
          lastError = error;
          if (error.response?.status === 404) {
            logger.debug(`${identifier.type} lookup failed, trying next identifier`, { identifier, url });
            continue;
          } else {
            throw error;
          }
        }
      }

      if (!response) {
        throw lastError || new Error('No valid identifier provided');
      }

      if (response.data && response.data.price != null) {
        return {
          price: Number(response.data.price) || 0,
          change24h: Number(response.data.change24h) || 0,
          change7d: Number(response.data.change7d) || null,
          change30d: Number(response.data.change30d) || null,
          change1h: Number(response.data.change1h) || null
        };
      }

      return null;

    } catch (error) {
      logger.error('Failed to fetch price', { assetId, assetSymbol, error: error.message, status: error.response?.status });
      return null;
    }
  }

  /**
   * Check alert conditions
   */
  static checkAlertCondition(alert, priceData) {
    if (!priceData || priceData.price == null) {
      return { triggered: false, reason: 'Price data unavailable' };
    }

    const { type, condition, value, percentageTimeframe } = alert;

    if (type === 'price_target') {
      if (condition === 'above') {
        const triggered = priceData.price >= value;
        return {
          triggered,
          reason: triggered ? `Price ${priceData.price} is above target ${value}` : null,
          currentValue: priceData.price,
          targetValue: value
        };
      } else if (condition === 'below') {
        const triggered = priceData.price <= value;
        return {
          triggered,
          reason: triggered ? `Price ${priceData.price} is below target ${value}` : null,
          currentValue: priceData.price,
          targetValue: value
        };
      }
    }

    if (type === 'percentage_change') {
      let changeValue = null;

      switch (percentageTimeframe) {
        case '1h': changeValue = priceData.change1h; break;
        case '24h': changeValue = priceData.change24h; break;
        case '7d': changeValue = priceData.change7d; break;
        case '30d': changeValue = priceData.change30d; break;
      }

      if (changeValue == null) {
        return { triggered: false, reason: `Change data unavailable for ${percentageTimeframe}` };
      }

      if (condition === 'increase') {
        const triggered = changeValue >= value;
        return {
          triggered,
          reason: triggered ? `${percentageTimeframe} change ${changeValue}% is above threshold ${value}%` : null,
          currentValue: changeValue,
          targetValue: value
        };
      }

      if (condition === 'decrease') {
        const triggered = changeValue <= -value;
        return {
          triggered,
          reason: triggered ? `${percentageTimeframe} change ${changeValue}% is below threshold -${value}%` : null,
          currentValue: changeValue,
          targetValue: -value
        };
      }
    }

    return { triggered: false, reason: 'Unknown alert type or condition' };
  }
}

module.exports = AlertService;
