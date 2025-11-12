/**
 * Environment Configuration Loader
 * This file MUST be imported first in index.ts to ensure environment variables are loaded
 * before any other modules that depend on process.env
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file from root directory (monorepo root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
