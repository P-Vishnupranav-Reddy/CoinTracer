/**
 * Alert Model
 * Data model and validation for alerts
 */

class Alert {
  constructor(data) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.assetId = data.asset_id || data.assetId;
    this.assetSymbol = data.asset_symbol || data.assetSymbol;
    this.type = data.type;
    this.condition = data.condition;
    this.value = parseFloat(data.value);
    this.percentageTimeframe = data.percentage_timeframe || data.percentageTimeframe || '24h';
    this.active = data.active !== undefined ? data.active : true;
    this.triggered = data.triggered !== undefined ? data.triggered : false;
    this.triggeredAt = data.triggered_at || data.triggeredAt;
    this.triggerCount = data.trigger_count || data.triggerCount || 0;
    this.lastCheckedAt = data.last_checked_at || data.lastCheckedAt;
    this.notificationSent = data.notification_sent !== undefined ? data.notification_sent : false;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  /**
   * Validate alert data
   */
  static validate(data) {
    const errors = [];

    if (!data.userId && !data.user_id) {
      errors.push('user_id is required');
    }

    if (!data.assetId && !data.asset_id) {
      errors.push('asset_id is required');
    }

    if (!data.type) {
      errors.push('type is required');
    } else if (!['price_target', 'percentage_change'].includes(data.type)) {
      errors.push('type must be either "price_target" or "percentage_change"');
    }

    if (!data.condition) {
      errors.push('condition is required');
    } else {
      if (data.type === 'price_target') {
        if (!['above', 'below'].includes(data.condition)) {
          errors.push('condition must be "above" or "below" for price_target type');
        }
      } else if (data.type === 'percentage_change') {
        if (!['increase', 'decrease'].includes(data.condition)) {
          errors.push('condition must be "increase" or "decrease" for percentage_change type');
        }
      }
    }

    if (data.value === undefined || data.value === null) {
      errors.push('value is required');
    } else if (isNaN(parseFloat(data.value)) || parseFloat(data.value) <= 0) {
      errors.push('value must be a positive number');
    }

    if (data.type === 'percentage_change') {
      const validTimeframes = ['1h', '24h', '7d', '30d'];
      const timeframe = data.percentageTimeframe || data.percentage_timeframe || '24h';

      if (!validTimeframes.includes(timeframe)) {
        errors.push(`percentage_timeframe must be one of: ${validTimeframes.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to JSON format for API response
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      assetId: this.assetId,
      assetSymbol: this.assetSymbol,
      type: this.type,
      condition: this.condition,
      value: this.value,
      percentageTimeframe: this.percentageTimeframe,
      active: this.active,
      triggered: this.triggered,
      triggeredAt: this.triggeredAt,
      triggerCount: this.triggerCount,
      lastCheckedAt: this.lastCheckedAt,
      notificationSent: this.notificationSent,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Alert;
