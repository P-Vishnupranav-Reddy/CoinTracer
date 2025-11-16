const axios = require('axios');
const NodeCache = require('node-cache');

// Cache configuration
const ttl = Number(process.env.NEWS_CACHE_TTL_SECONDS || 300);
const cache = new NodeCache({ stdTTL: ttl, checkperiod: ttl });

// CoinMarketCap API Configuration
const CMC_API_KEY = process.env.CMC_API_KEY || 'DEMO_KEY';
const CMC_BASE_URL = process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com';

const cmcClient = axios.create({
  baseURL: CMC_BASE_URL,
  timeout: 15000,
  headers: {
    'X-CMC_PRO_API_KEY': CMC_API_KEY,
    Accept: 'application/json'
  }
});

/* ------------------------------
   RSS News Sources
-------------------------------- */
const NEWS_SOURCES = [
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'general'
  },
  {
    name: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    category: 'general'
  },
  {
    name: 'Bitcoin Magazine',
    url: 'https://bitcoinmagazine.com/.rss/full/',
    category: 'bitcoin'
  }
];

/* ------------------------------
   RSS Parsing
-------------------------------- */
async function parseRSSFeed(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const xml = response.data;
    const items = [];

    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

    for (const match of itemMatches) {
      const itemXml = match[1];

      // Title
      const titleMatch =
        itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
        itemXml.match(/<title>(.*?)<\/title>/i);

      // Description
      const descriptionMatch =
        itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/is) ||
        itemXml.match(/<description>(.*?)<\/description>/is);

      // Link
      let linkMatch =
        itemXml.match(/<link>(.*?)<\/link>/i) ||
        itemXml.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/i) ||
        itemXml.match(/<guid[^>]*>(.*?)<\/guid>/i);

      if (!linkMatch) {
        const enclosureMatch =
          itemXml.match(/<enclosure[^>]*url=["'](.*?)["']/i);
        if (enclosureMatch) linkMatch = enclosureMatch;
      }

      if (!linkMatch) {
        const urlMatch = itemXml.match(/https?:\/\/[^\s<>"']+/i);
        if (urlMatch) linkMatch = [null, urlMatch[0]];
      }

      if (!linkMatch && descriptionMatch) {
        const descText = descriptionMatch[1] || '';
        const urlInDesc = descText.match(/https?:\/\/[^\s<>"']+/i);
        if (urlInDesc) linkMatch = [null, urlInDesc[0]];
      }

      // Date
      const pubDateMatch =
        itemXml.match(/<pubDate>(.*?)<\/pubDate>/i) ||
        itemXml.match(/<dc:date>(.*?)<\/dc:date>/i);

      if (!titleMatch || !linkMatch) continue;

      let title = (titleMatch[1] || '').trim();
      let link = (linkMatch[1] || '').trim();

      link = link
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'');

      // Make link absolute
      if (!link.startsWith('http://') && !link.startsWith('https://')) {
        try {
          const feedUrlObj = new URL(url);
          link = link.startsWith('/')
            ? `${feedUrlObj.protocol}//${feedUrlObj.host}${link}`
            : `${feedUrlObj.protocol}//${feedUrlObj.host}/${link}`;
        } catch (err) {
          console.warn(
            `[News] Could not construct absolute URL for: ${link}`
          );
          continue;
        }
      }

      let description = '';
      if (descriptionMatch) {
        description = (descriptionMatch[1] || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();

        if (description.length > 300) { description = description.substring(0, 300) + '...'; }
      }

      title = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'');

      items.push({
        title,
        link,
        pubDate: pubDateMatch
          ? new Date(pubDateMatch[1]).toISOString()
          : new Date().toISOString(),
        description,
        source: 'RSS'
      });
    }

    return items;
  } catch (err) {
    console.error(`[News] Error parsing RSS feed ${url}: ${err.message}`);
    return [];
  }
}

/* ------------------------------
   CMC News
-------------------------------- */
async function fetchCMCNews(limit = 50) {
  try {
    if (CMC_API_KEY === 'DEMO_KEY') {
      console.log('[News] CMC API not configured.');
      return [];
    }

    const cacheKey = `news:cmc:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { data } = await cmcClient.get('/v1/cryptocurrency/news', {
      params: { limit, page: 1 }
    });

    const articles = [];

    if (Array.isArray(data.data)) {
      for (const article of data.data) {
        articles.push({
          id: article.id,
          title: article.title,
          link: article.url,
          pubDate: article.published_on
            ? new Date(article.published_on * 1000).toISOString()
            : new Date().toISOString(),
          description: article.text || '',
          source: article.source || 'CoinMarketCap',
          tags: article.tags || [],
          category: article.category || 'general',
          imageUrl: article.thumbnail || null
        });
      }
    }

    cache.set(cacheKey, articles);
    return articles;
  } catch (err) {
    console.error(`[News] Error fetching CMC news: ${err.message}`);
    return [];
  }
}

/* ------------------------------
   RSS News
-------------------------------- */
async function fetchRSSNews(limitPerSource = 10) {
  try {
    const cacheKey = `news:rss:${limitPerSource}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const allArticles = [];

    const rssPromises = NEWS_SOURCES.map(async (src) => {
      try {
        const items = await parseRSSFeed(src.url);
        return items.slice(0, limitPerSource).map((item) => ({
          ...item,
          source: src.name,
          category: src.category
        }));
      } catch (err) {
        console.error(`[News] RSS error at ${src.name}: ${err.message}`);
        return [];
      }
    });

    const results = await Promise.all(rssPromises);
    results.forEach((list) => allArticles.push(...list));

    cache.set(cacheKey, allArticles);
    return allArticles;
  } catch (err) {
    console.error(`[News] Error fetching RSS news: ${err.message}`);
    return [];
  }
}

/* ------------------------------
   Aggregated News
-------------------------------- */
async function getAggregatedNews(options = {}) {
  const { limit = 50, category = null, source = null } = options;

  const cacheKey = `news:aggregated:${limit}:${category || 'all'}:${
    source || 'all'
  }`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const [cmcNews, rssNews] = await Promise.all([
      fetchCMCNews(Math.min(limit, 50)),
      fetchRSSNews(Math.min(limit, 20))
    ]);

    const allArticles = [...cmcNews, ...rssNews];

    // Deduplicate by title
    const seen = new Set();
    const uniqueArticles = allArticles.filter((a) => {
      const key = a.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let filtered = uniqueArticles;

    if (category) {
      filtered = filtered.filter(
        (a) => a.category?.toLowerCase() === category.toLowerCase()
      );
    }

    if (source) {
      filtered = filtered.filter(
        (a) => a.source?.toLowerCase() === source.toLowerCase()
      );
    }

    filtered.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    const result = filtered.slice(0, limit);
    cache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.error(`[News] Error aggregating news: ${err.message}`);
    return [];
  }
}

/* ------------------------------
   News for Symbol
-------------------------------- */
async function getNewsForAsset(symbol, limit = 20) {
  if (!symbol) return [];

  const cacheKey = `news:asset:${symbol.toLowerCase()}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const allNews = await getAggregatedNews({ limit: 100 });

    const sLower = symbol.toLowerCase();
    const sUpper = symbol.toUpperCase();

    const filtered = allNews.filter((article) => {
      const t = (article.title || '').toLowerCase();
      const d = (article.description || '').toLowerCase();
      const tags = (article.tags || []).join(' ').toLowerCase();

      return (
        t.includes(sLower) ||
        d.includes(sLower) ||
        tags.includes(sLower) ||
        t.includes(sUpper) ||
        d.includes(sUpper)
      );
    });

    const result = filtered.slice(0, limit);
    cache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.error(`[News] Error fetching asset news: ${err.message}`);
    return [];
  }
}

module.exports = {
  getAggregatedNews,
  getNewsForAsset,
  fetchCMCNews,
  fetchRSSNews
};
