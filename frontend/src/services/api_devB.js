// --- Base URLs for your backend services ---
// These must match the ports you set up in your backend!
const API_URLS = {
    NOTIFICATION: 'http://localhost:3002/api/v1',
    PERSONALIZATION: 'http://localhost:3004/api/v1',
    NEWS: 'http://localhost:3005/api/v1',
    
    // This is Developer A's Market Data service (for search)
    // Assuming it runs on the same port as his user-service
    MARKET_DATA: 'http://localhost:5001/api/v1' 
};

/**
 * A helper function to make all your API calls.
 * It automatically gets the JWT token from localStorage and adds it 
 * to the "Authorization" header.
 */
const fetchWithAuth = async (url, options = {}) => {
    // 1. Get the token from where Dev A's login page saved it
    const token = localStorage.getItem('token');

    // 2. Prepare the headers
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // 3. If a token exists, add it to the headers
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 4. Make the fetch request
    const response = await fetch(url, { ...options, headers });

    // 5. Check for errors
    if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData.error);
        throw new Error(errorData.error || 'Something went wrong');
    }

    // 6. Handle 204 No Content (for DELETE requests)
    if (response.status === 204) {
        return { message: 'Success' };
    }

    return response.json();
};

// --- API Functions for your Features ---

// 1. Personalization Service (Favorites)
export const apiGetFavorites = () => {
    return fetchWithAuth(`${API_URLS.PERSONALIZATION}/favorites`);
};

export const apiAddFavorite = (assetId) => {
    return fetchWithAuth(`${API_URLS.PERSONALIZATION}/favorites`, {
        method: 'POST',
        body: JSON.stringify({ assetId }),
    });
};

export const apiRemoveFavorite = (assetId) => {
    return fetchWithAuth(`${API_URLS.PERSONALIZATION}/favorites/${assetId}`, {
        method: 'DELETE',
    });
};

// 2. Notification Service (Alerts)
export const apiGetAlerts = () => {
    return fetchWithAuth(`${API_URLS.NOTIFICATION}/alerts`);
};

export const apiCreateAlert = (alertData) => {
    // alertData = { assetId, condition, value }
    return fetchWithAuth(`${API_URLS.NOTIFICATION}/alerts`, {
        method: 'POST',
        body: JSON.stringify(alertData),
    });
};

export const apiDeleteAlert = (alertId) => {
    return fetchWithAuth(`${API_URLS.NOTIFICATION}/alerts/${alertId}`, {
        method: 'DELETE',
    });
};

// 3. News Service
export const apiGetNews = () => {
    // News doesn't need auth, but we can use the helper anyway
    return fetchWithAuth(`${API_URLS.NEWS}/news`);
};

// 4. Market Data Service (Search)
export const apiSearchAssets = (query) => {
    // This calls Developer A's endpoint
    // Assuming it also requires auth
    return fetchWithAuth(`${API_URLS.MARKET_DATA}/market/assets/search?query=${query}`);
};

export const apiGetMarketPrices = (symbols = []) => {
    const unique = [...new Set(symbols.filter(Boolean).map((s) => s.toUpperCase()))];
    if (unique.length === 0) {
        return Promise.resolve({ data: [] });
    }
    const params = encodeURIComponent(unique.join(','));
    return fetchWithAuth(`${API_URLS.MARKET_DATA}/market/prices/batch?assets=${params}`);
};
