/**
 * Frontend Entry Point
 * React application for Jitsi Analytics Dashboard
 */

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { eightByEightTheme } from './theme/8x8Theme';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
);

root.render(
    <React.StrictMode>
        <BrowserRouter basename = { process.env.PUBLIC_URL }>
            <ThemeProvider theme = { eightByEightTheme }>
                <CssBaseline />
                <App />
            </ThemeProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
