/**
 * Database configuration for exchange-connections-service
 *
 * This file re-exports the shared database module for backward compatibility.
 * New code should import directly from '../shared/database'.
 *
 * @deprecated Use require('../../shared').database instead
 */

const { database } = require('../../shared');
module.exports = database.pool;
