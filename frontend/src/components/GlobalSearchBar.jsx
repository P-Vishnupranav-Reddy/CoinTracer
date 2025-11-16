import React, { useState, useEffect } from 'react';
import { apiSearchAssets as searchAssets, apiAddFavorite as addFavorite } from '../services/api_devB';
import { useDebounce } from '../hooks/useDebounce'; // <-- 1. IMPORT THE HOOK
import '../DevB_Features.css';

export function GlobalSearchBar() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [message, setMessage] = useState('');
    const [isActive, setIsActive] = useState(false);

    const debouncedQuery = useDebounce(query, 300); // <-- 2. USE THE HOOK

    // 3. CHANGE THIS EFFECT TO USE debouncedQuery INSTEAD OF query
    useEffect(() => {
        if (debouncedQuery.length < 2) {
            setResults([]);
            return;
        }

        searchAssets(debouncedQuery)
            .then(data => setResults(data.assets || []))
            .catch(err => console.error("Search failed:", err));

    }, [debouncedQuery]); // <-- 4. MAKE IT DEPEND ON debouncedQuery

    const handleAddFavorite = (e, assetId) => {
        e.stopPropagation();
        addFavorite(assetId)
            .then(() => {
                setMessage(`${assetId} added to favorites!`);
                setQuery('');
                setResults([]);
                setIsActive(false);
                setTimeout(() => setMessage(''), 2000);
            })
            .catch(err => {
                setMessage(`Error: ${err.message}`);
                setTimeout(() => setMessage(''), 2000);
            });
    };

    return (
        <div className="search-bar-container" onBlur={() => setTimeout(() => setIsActive(false), 200)}>
            <input
                type="text"
                className="search-input"
                placeholder="Search assets (e.g., BTC)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsActive(true)}
            />
            {message && <div className="search-message">{message}</div>}
            
            {isActive && query.length > 0 && (
                <ul className="search-results-list">
                    {results.length > 0 ? (
                        results.map(asset => (
                            <li key={asset.id || asset.symbol}>
                                <span>{asset.name} ({asset.symbol.toUpperCase()})</span>
                                <button className="btn-add-fav" onClick={(e) => handleAddFavorite(e, asset.symbol.toUpperCase())}>+</button>
                            </li>
                        ))
                    ) : (
                        <li className="no-results">No results found.</li>
                    )}
                </ul>
            )}
        </div>
    );
}

