// Jest setup file for additional configuration
// This file is run once before all tests

// Load environment variables from root .env file
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env');

// Check if .env exists and load it
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.warn('.env file not found at:', envPath);
}

// Increase timeout for processing dump files
/* global jest */
jest.setTimeout(30000);

// Suppress logger output during tests
process.env.LOG_LEVEL = 'error';
