import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const manualHoldingAPI = {
  // Get all manual holdings for a portfolio
  getHoldings: async (portfolioId) => {
    try {
      const response = await axios.get(
        `${API_URL}/manual-holdings/${portfolioId}`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching manual holdings:', error);
      throw error;
    }
  },

  // Add or update a manual holding
  upsertHolding: async (portfolioId, data) => {
    try {
      const response = await axios.post(
        `${API_URL}/manual-holdings/${portfolioId}`,
        data,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error upserting manual holding:', error);
      throw error;
    }
  },

  // Delete a manual holding
  deleteHolding: async (portfolioId, assetSymbol) => {
    try {
      const response = await axios.delete(
        `${API_URL}/manual-holdings/${portfolioId}/${assetSymbol}`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting manual holding:', error);
      throw error;
    }
  },
};
