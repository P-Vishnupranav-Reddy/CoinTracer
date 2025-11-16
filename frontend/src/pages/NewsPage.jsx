import React, { useState, useEffect } from 'react';
import { marketApi } from '../services/api_market';
import '../DevB_Features.css';

export function NewsPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sources, setSources] = useState([]);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadNews();
    loadSources();
  }, [limit, selectedSource, selectedCategory]);

  const loadNews = async () => {
    setLoading(true);
    setError('');
    try {
      const options = { limit };
      if (selectedSource !== 'all') options.source = selectedSource;
      if (selectedCategory !== 'all') options.category = selectedCategory;

      const response = await marketApi.getNews(options);
      setArticles(response.data?.articles || response.data?.data?.articles || []);
    } catch (err) {
      setError(err.message || 'Failed to load news');
      console.error('Error loading news:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const response = await marketApi.getNewsSources();
      setSources(response.data?.sources || response.data?.data?.sources || []);
    } catch (err) {
      console.error('Error loading sources:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const filteredArticles = articles.filter(article => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;

    return (
      (article.title || '').toLowerCase().includes(query) ||
      (article.description || '').toLowerCase().includes(query) ||
      (article.source || '').toLowerCase().includes(query)
    );
  });

  const availableCategories = [
    'all', 'general', 'bitcoin', 'ethereum', 'defi', 'nft', 'regulation'
  ];
  const availableSourcesList = ['all', ...sources.filter(s => s.available).map(s => s.name)];

  if (loading && articles.length === 0) {
    return (
      <div className="page-container">
        <h1>Market News</h1>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading latest crypto news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1>Market News</h1>

      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Stay informed with the latest cryptocurrency news from reputable sources
      </p>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div className="filter-bar" style={{ flex: 1, minWidth: '200px' }}>
          <input
            className="filter-input"
            type="text"
            placeholder="Search news..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="news-select">
          {availableSourcesList.map(source => (
            <option key={source} value={source}>
              {source === 'all' ? 'All Sources' : source}
            </option>
          ))}
        </select>

        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="news-select">
          {availableCategories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>

        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="news-select">
          <option value={25}>25 articles</option>
          <option value={50}>50 articles</option>
          <option value={100}>100 articles</option>
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* News List */}
      <div className="devb-list">
        {filteredArticles.length === 0 && !loading && (
          <p className="empty-message">
            {articles.length === 0
              ? 'No news articles available.'
              : `No articles match "${filter}".`}
          </p>
        )}

        {filteredArticles.map((article, index) => {
          // Fix URL logic
          let articleLink = '#';

          if (article.link?.startsWith('http://') || article.link?.startsWith('https://')) {
            articleLink = article.link;
          } else if (article.link?.startsWith('//')) {
            articleLink = `https:${article.link}`;
          } else if (article.link) {
            articleLink = `https://${article.link}`;
          }

          const handleClick = (e) => {
            e.preventDefault();
            if (articleLink.startsWith('http')) {
              window.open(articleLink, '_blank', 'noopener,noreferrer');
            }
          };

          return (
            <a
              key={article.id || article.link || index}
              href={articleLink}
              onClick={handleClick}
              className="news-item devb-card"
              style={{ display: 'block', padding: '1.5rem', marginBottom: '1rem', textDecoration: 'none' }}
            >
              <div style={{ display: 'flex', gap: '1rem' }}>

                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt={article.title}
                    style={{
                      width: '120px',
                      height: '120px',
                      objectFit: 'cover',
                      borderRadius: '8px'
                    }}
                    onError={(e) => (e.target.style.display = 'none')}
                  />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ color: '#93c5fd' }}>{article.title}</h3>
                    <span style={{ color: 'var(--muted)' }}>{formatDate(article.pubDate)}</span>
                  </div>

                  {article.description && (
                    <p className="news-desc">{article.description}</p>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>{article.source}</strong>

                    {article.category && article.category !== 'general' && (
                      <span className="news-badge">{article.category}</span>
                    )}

                    {article.tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {article.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="news-tag">{tag}</span>
                        ))}
                      </div>
                    )}

                  </div>
                </div>

              </div>
            </a>
          );
        })}
      </div>

      {loading && articles.length > 0 && (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--muted)' }}>
          Refreshing news...
        </div>
      )}
    </div>
  );
}
