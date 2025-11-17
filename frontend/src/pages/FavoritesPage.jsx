import React, { useState, useEffect } from 'react';
import { apiGetFavorites as getFavorites, apiRemoveFavorite as removeFavorite, apiGetMarketPrices as getMarketPrices } from '../services/api_devB';
import '../DevB_Features.css'; // Import your styles

export function FavoritesPage() {
    const [favorites, setFavorites] = useState([]);
    const [vs, setVs] = useState('USD');
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);    const loadFavorites = () => {
        setLoading(true);
        getFavorites()
            .then(data => {
                const favs = data.favorites || [];
                setFavorites(favs);
                setVs(data.vs || 'USD');
                refreshMarketPrices(favs);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    const refreshMarketPrices = (favoritesList) => {
        const symbols = [...new Set(favoritesList.map(f => f.assetId).filter(Boolean))];
        if (symbols.length === 0) {
            return;
        }
        getMarketPrices(symbols)
            .then(data => {
                const snapshots = {};
                (data.data || []).forEach(entry => {
                    const symbol = (entry.symbol || entry.assetId || '').toUpperCase();
                    snapshots[symbol] = {
                        price: entry.price ?? null,
                        change24h: entry.change24h ?? entry.percentChange24h ?? 0,
                        name: entry.name || symbol,
                        vs: (data.vs || entry.vs || 'USD').toUpperCase()
                    };
                });
                setFavorites(prev =>
                    prev.map(f => {
                        const symbol = (f.assetId || '').toUpperCase();
                        const snapshot = snapshots[symbol];
                        if (!snapshot) return f;
                        return {
                            ...f,
                            name: snapshot.name || f.name,
                            price: snapshot.price,
                            priceChange24h: snapshot.change24h,
                            vs: snapshot.vs || f.vs || vs
                        };
                    })
                );
            })
            .catch(err => {
                console.error('Failed to load market prices for favorites', err);
            });
    };

    const handleRemove = (assetId) => {
        removeFavorite(assetId)
            .then(() => {
                // Refresh the list after removing
                setFavorites(prev => {
                    const updated = prev.filter(f => f.assetId !== assetId);
                    refreshMarketPrices(updated);
                    return updated;
                });
            })
            .catch(err => setError(err.message));
    };

    const filteredFavorites = favorites.filter(f => {
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return (
            (f.assetId || '').toLowerCase().includes(q) ||
            (f.name || '').toLowerCase().includes(q)
        );
    });

    if (loading) return <div className="page-container"><h2>Loading Favorites...</h2></div>;
    if (error) return <div className="page-container"><div className="error-message">Error: {error}</div></div>;

    return (
        <div className="page-container">
            <h1>My Favorites{favorites?.length ? ` (${favorites.length})` : ''}</h1>
            <div className="filter-bar" style={{ marginBottom: 12 }}>
                <input
                    className="filter-input"
                    type="text"
                    placeholder="Filter by asset or name..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <span className="filter-hint">Type to filter</span>
            </div>
            <div className="devb-list">
                {favorites.length === 0 && (
                    <p className="empty-message">You have no favorites yet. Use the global search to add some.</p>
                )}
                {favorites.length > 0 && filteredFavorites.length === 0 && (
                    <p className="empty-message">No matches for "{filter}".</p>
                )}
                
                {filteredFavorites.map(fav => (
                    <div className="devb-card favorite-item" key={fav.assetId}>
                        <div className="card-info">
                            <span className="card-asset-id">{fav.assetId}</span>
                            <span className="card-asset-name">{fav.name}</span>
                        </div>
                        <div className="card-price">
                            {`$${formatPrice(fav.price)}`}
                            <span className={(Number(fav.priceChange24h) || 0) >= 0 ? 'price-up' : 'price-down'}>
                                {formatChange(fav.priceChange24h)}%
                            </span>
                        </div>
                        <button className="btn-danger" onClick={() => handleRemove(fav.assetId)}>Remove</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const formatPrice = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatChange = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00';
    return num.toFixed(2);
};
