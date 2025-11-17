import React, { useState, useEffect } from 'react';
import { apiAddFavorite as addFavorite } from '../services/api_devB';
import { useDebounce } from '../hooks/useDebounce'; // <-- 1. IMPORT THE HOOK
import '../DevB_Features.css';

export function GlobalSearchBar() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [availableAssets, setAvailableAssets] = useState([]);
    const [syncWarning, setSyncWarning] = useState('');
    const [message, setMessage] = useState('');
    const [isActive, setIsActive] = useState(false);

    const debouncedQuery = useDebounce(query, 300); // <-- 2. USE THE HOOK

    // Load available assets from localStorage and listen for dashboard updates
    useEffect(() => {
        const loadAssetsFromStorage = () => {
            try {
                const raw = localStorage.getItem('dashboardAssets');
                if (!raw) {
                    setAvailableAssets([]);
                    setSyncWarning('Open your dashboard to sync your holdings.');
                    return;
                }
                const parsed = JSON.parse(raw);
                const assets = Array.isArray(parsed?.assets) ? parsed.assets : [];
                setAvailableAssets(assets);
                setSyncWarning(assets.length ? '' : 'Open your dashboard to sync your holdings.');
            } catch (error) {
                console.warn('Failed to parse dashboard assets cache', error);
                setAvailableAssets([]);
            }
        };

        loadAssetsFromStorage();

        const handler = (event) => {
            const assets = Array.isArray(event.detail) ? event.detail : [];
            setAvailableAssets(assets);
            setSyncWarning(assets.length ? '' : 'Open your dashboard to sync your holdings.');
        };

        window.addEventListener('dashboardAssetsUpdated', handler);
        return () => window.removeEventListener('dashboardAssetsUpdated', handler);
    }, []);

    // Filter assets based on query
    useEffect(() => {
        const q = debouncedQuery.trim().toLowerCase();
        if (!q || q.length < 1) {
            setResults([]);
            return;
        }

        const filtered = availableAssets.filter(asset => {
            const sym = asset.symbol?.toLowerCase() || '';
            const name = asset.name?.toLowerCase() || '';
            return sym.includes(q) || name.includes(q);
        });

        setResults(filtered);
    }, [debouncedQuery, availableAssets]);

    const handleAddFavorite = (e, assetId) => {
        e.stopPropagation();
        const normalized = (assetId || '').toUpperCase();
        if (!normalized) {
            setMessage('Unable to determine asset symbol');
            setTimeout(() => setMessage(''), 2000);
            return;
        }
        addFavorite(normalized)
            .then(() => {
                setMessage(`${normalized} added to favorites!`);
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
                    {availableAssets.length === 0 ? (
                        <li className="no-results">{syncWarning || 'No holdings synced yet.'}</li>
                    ) : results.length > 0 ? (
                        results.map(asset => {
                            const symbol = (asset.symbol || asset.asset || '').toUpperCase();
                            const name = asset.name || symbol;
                            return (
                                <li key={symbol}>
                                    <span>{name} ({symbol})</span>
                                    <button className="btn-add-fav" onClick={(e) => handleAddFavorite(e, symbol)}>Add</button>
                                </li>
                            );
                        })
                    ) : (
                        <li className="no-results">No matches found.</li>
                    )}
                </ul>
            )}
        </div>
    );
}

