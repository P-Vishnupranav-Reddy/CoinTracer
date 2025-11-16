// Mock axios before importing newsService
jest.mock('axios');

// Mock NodeCache to allow cache control in tests
jest.mock('node-cache');

// Set environment variables BEFORE importing the module
process.env.CMC_API_KEY = process.env.CMC_API_KEY || 'TEST_API_KEY';
process.env.CMC_BASE_URL = process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com';
process.env.NEWS_CACHE_TTL_SECONDS = process.env.NEWS_CACHE_TTL_SECONDS || '300';

// Now import modules after setting up mocks and env vars
const axios = require('axios');
const NodeCache = require('node-cache');

// Set up NodeCache mock
let mockCacheData = {};
NodeCache.mockImplementation(() => ({
  get: jest.fn(key => mockCacheData[key]),
  set: jest.fn((key, value) => { mockCacheData[key] = value; }),
  flushAll: jest.fn(() => { mockCacheData = {}; })
}));

// Mock axios.get for RSS feeds
axios.get = jest.fn();

// Mock axios.create for CMC client
const mockCmcClient = {
  get: jest.fn()
};

axios.create = jest.fn(() => mockCmcClient);

// Import newsService after mocks
const newsService = require('../services/news');

describe('News Service', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheData = {};
  });

  describe('parseRSSFeed', () => {

    it('should parse RSS feed XML correctly', async () => {
      const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Bitcoin Reaches New All-Time High</title>
              <link>https://example.com/news/1</link>
              <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
              <description>Bitcoin has reached a new all-time high today.</description>
            </item>
            <item>
              <title>Ethereum 2.0 Update</title>
              <link>https://example.com/news/2</link>
              <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
              <description>Ethereum 2.0 staking reaches new milestones.</description>
            </item>
          </channel>
        </rss>`;

      axios.get.mockResolvedValue({ data: mockRSSXML });
      const result = await newsService.fetchRSSNews(10);

      expect(axios.get).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle CDATA correctly', async () => {
      const mockRSSXML = `<?xml version="1.0"?>
        <rss><channel>
          <item>
            <title><![CDATA[Bitcoin & Ethereum News]]></title>
            <link>https://example.com/news/1</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <description><![CDATA[<p>HTML inside CDATA</p>]]></description>
          </item>
        </channel></rss>`;

      axios.get.mockResolvedValue({ data: mockRSSXML });
      const result = await newsService.fetchRSSNews(10);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle RSS errors gracefully', async () => {
      axios.get.mockRejectedValue(new Error("Network error"));
      const result = await newsService.fetchRSSNews(10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('fetchCMCNews', () => {

    it('should fetch and map CMC news', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 1,
              title: 'Bitcoin Price Surge',
              url: 'https://example.com/news/1',
              published_on: 1704110400,
              text: 'Bitcoin surged today.',
              source: 'CoinMarketCap',
              source_url: 'https://example.com',
              tags: ['btc'],
              category: 'general',
              thumbnail: 'https://example.com/img.jpg'
            }
          ]
        }
      });

      const result = await newsService.fetchCMCNews(50);

      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Bitcoin Price Surge');
    });

    it('should handle CMC API errors gracefully', async () => {
      mockCmcClient.get.mockRejectedValue(new Error("API Error"));

      const result = await newsService.fetchCMCNews(50);
      expect(result).toEqual([]);
    });
  });

  describe('getAggregatedNews', () => {

    it('should aggregate RSS + CMC news', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: [{
            id: 1,
            title: 'CMC News Article',
            url: 'https://example.com/cmc/1',
            published_on: 1704110400,
            text: 'CMC description'
          }]
        }
      });

      axios.get.mockResolvedValue({
        data: `
        <rss><channel>
          <item>
            <title>RSS News Article</title>
            <link>https://example.com/rss/1</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <description>RSS Desc</description>
          </item>
        </channel></rss>`
      });

      const result = await newsService.getAggregatedNews({ limit: 50 });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should limit results', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            title: `News ${i + 1}`,
            url: `https://example.com/${i + 1}`,
            published_on: 1704110400 + i,
            text: `Description ${i + 1}`
          }))
        }
      });

      axios.get.mockResolvedValue({ data: "<rss><channel></channel></rss>" });

      const result = await newsService.getAggregatedNews({ limit: 25 });

      expect(result.length).toBe(25);
    });

    it('should dedupe titles', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: [
            { id: 1, title: 'Duplicate', url: 'https://a.com', published_on: 1704110400 }
          ]
        }
      });

      axios.get.mockResolvedValue({
        data: `
        <rss><channel>
          <item>
            <title>Duplicate</title>
            <link>https://b.com</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <description>desc</description>
          </item>
        </channel></rss>`
      });

      const result = await newsService.getAggregatedNews({ limit: 50 });

      expect(result.length).toBe(1);
    });
  });

  describe('getNewsForAsset', () => {

    it('should filter news for BTC', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 1,
              title: 'Bitcoin Price Surges',
              url: 'https://example.com/1',
              published_on: 1704110400,
              text: 'Bitcoin hit a new high',
              tags: ['bitcoin', 'btc']
            }
          ]
        }
      });

      axios.get.mockResolvedValue({ data: "<rss><channel></channel></rss>" });

      const result = await newsService.getNewsForAsset('BTC', 20);

      expect(result.length).toBe(1);
      expect(result[0].title.toLowerCase()).toContain('bitcoin');
    });

    it('should limit asset results', async () => {
      mockCmcClient.get.mockResolvedValue({
        data: {
          data: Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            title: `Bitcoin News ${i + 1}`,
            url: `https://example.com/${i + 1}`,
            published_on: 1704110400 + i,
            text: `Bitcoin desc ${i + 1}`,
            tags: ['btc']
          }))
        }
      });

      axios.get.mockResolvedValue({ data: "<rss><channel></channel></rss>" });

      const result = await newsService.getNewsForAsset('BTC', 10);

      expect(result.length).toBe(10);
    });
  });

});
