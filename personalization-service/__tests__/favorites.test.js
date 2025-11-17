const request = require('supertest');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Mock the real shared database module used by the service so tests don't hit Postgres
jest.mock('../../shared/database', () => ({
  query: jest.fn()
}));

jest.mock('axios');

const { app } = require('../app');
const { query } = require('../../shared/database');

const makeAuthHeader = () => {
  const token = jwt.sign(
    { userId: 'test-user-123' },
    process.env.JWT_SECRET || 'dev-change-me'
  );
  return `Bearer ${token}`;
};

describe('Personalization Service - Favorites API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns detailed favorites with market snapshots', async () => {
    query.mockResolvedValue({
      rows: [
        { asset_id: 'eth' },
        { asset_id: 'btc' }
      ]
    });

    axios.get.mockResolvedValue({
      data: {
        vs: 'USD',
        data: [
          { symbol: 'ETH', name: 'Ethereum', price: 3250.12, change24h: 1.5 },
          { symbol: 'BTC', name: 'Bitcoin', price: 64000.5, change24h: -0.25 }
        ]
      }
    });

    const res = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT asset_id'), ['test-user-123']);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(res.body.count).toBe(2);
    const eth = res.body.favorites.find(fav => fav.assetId === 'ETH');
    expect(eth).toMatchObject({
      assetId: 'ETH',
      name: 'Ethereum',
      price: 3250.12,
      priceChange24h: 1.5,
      vs: 'USD'
    });
  });

  it('returns empty array when user has no favorites', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.favorites).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('creates a new favorite when it does not already exist', async () => {
    query.mockResolvedValue({
      rows: [{
        id: 'fav-1',
        user_id: 'test-user-123',
        asset_id: 'ETH'
      }]
    });

    const res = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', makeAuthHeader())
      .send({ assetId: 'eth' });

    expect(res.status).toBe(201);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "favorites"'), ['test-user-123', 'ETH']);
  });

  it('returns 409 when attempting to add a duplicate favorite', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', makeAuthHeader())
      .send({ assetId: 'btc' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('removes an existing favorite', async () => {
    query.mockResolvedValue({ rows: [{ id: 'fav-1' }] });

    const res = await request(app)
      .delete('/api/v1/favorites/eth')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "favorites"'), ['test-user-123', 'ETH']);
  });

  it('returns 404 when deleting a non-existent favorite', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .delete('/api/v1/favorites/missing')
      .set('Authorization', makeAuthHeader());

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Favorite not found');
  });
});


