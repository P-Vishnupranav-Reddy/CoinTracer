import React, { useState, useEffect } from 'react';
import { apiGetFavorites as getFavorites, apiRemoveFavorite as removeFavorite } from '../services/api_devB';
import '../DevB_Features.css'; // Import your styles

export function FavoritesPage() {
    const [favorites, setFavorites] = useState([]);
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFavorites();
    }, []);

    const loadFavorites = () => {
        setLoading(true);
        getFavorites()
            .then(data => setFavorites(data.favorites || []))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    const handleRemove = (assetId) => {
        removeFavorite(assetId)
            .then(() => {
                // Refresh the list after removing
                setFavorites(prev => prev.filter(f => f.assetId !== assetId));
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
                            ${Number(fav.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className={fav.priceChange24h >= 0 ? 'price-up' : 'price-down'}>
                                {fav.priceChange24h.toFixed(2)}%
                            </span>
                        </div>
                        <button className="btn-danger" onClick={() => handleRemove(fav.assetId)}>Remove</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
