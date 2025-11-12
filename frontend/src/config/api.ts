/**
 * API Configuration
 * Centralized API base URL configuration
 */

// In development: Use backend server directly at localhost:5000
// In production: Use PUBLIC_URL (frontend served by backend on same host)
// Override with REACT_APP_API_URL environment variable if needed
const isDevelopment = process.env.NODE_ENV === 'development';

export const API_BASE_URL = process.env.REACT_APP_API_URL
    || (isDevelopment ? 'http://localhost:5000' : process.env.PUBLIC_URL || '');
