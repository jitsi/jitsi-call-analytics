/**
 * 8x8 Professional Enterprise Theme
 * Inspired by 8x8's branding and professional analytics dashboards
 */

import { createTheme } from '@mui/material/styles';

// 8x8 Color Palette - Professional Enterprise
const colors = {
    // Primary 8x8 Blues
    primary: {
        50: '#e3f2fd',
        100: '#bbdefb',
        200: '#90caf9',
        300: '#64b5f6',
        400: '#42a5f5',
        500: '#1e88e5', // Main 8x8 blue
        600: '#1976d2',
        700: '#1565c0',
        800: '#0d47a1',
        900: '#0a237a'
    },

    // Professional Grays
    neutral: {
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#eeeeee',
        300: '#e0e0e0',
        400: '#bdbdbd',
        500: '#9e9e9e',
        600: '#757575',
        700: '#616161',
        800: '#424242',
        900: '#212121'
    },

    // Status Colors
    success: '#00c853',
    warning: '#ff9800',
    error: '#f44336',
    info: '#2196f3',

    // Accent Colors
    accent: {
        orange: '#ff6f00',
        teal: '#00bcd4',
        purple: '#9c27b0'
    }
};

export const eightByEightTheme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            light: colors.primary[400],
            main: colors.primary[500],
            dark: colors.primary[700],
            contrastText: '#ffffff',
        },
        secondary: {
            light: colors.accent.orange,
            main: '#ff6f00',
            dark: '#e65100',
            contrastText: '#ffffff',
        },
        background: {
            default: '#f8fafc',
            paper: '#ffffff',
        },
        text: {
            primary: colors.neutral[800],
            secondary: colors.neutral[600],
        },
        divider: colors.neutral[200],
        success: {
            main: colors.success,
            light: '#69f0ae',
            dark: '#00a152',
        },
        warning: {
            main: colors.warning,
            light: '#ffb74d',
            dark: '#f57c00',
        },
        error: {
            main: colors.error,
            light: '#ef5350',
            dark: '#d32f2f',
        },
        info: {
            main: colors.info,
            light: '#64b5f6',
            dark: '#1976d2',
        },
    },

    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
        h1: {
            fontSize: '2.5rem',
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
        },
        h2: {
            fontSize: '2rem',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
        },
        h3: {
            fontSize: '1.75rem',
            fontWeight: 600,
            lineHeight: 1.3,
        },
        h4: {
            fontSize: '1.5rem',
            fontWeight: 600,
            lineHeight: 1.4,
        },
        h5: {
            fontSize: '1.25rem',
            fontWeight: 600,
            lineHeight: 1.4,
        },
        h6: {
            fontSize: '1.125rem',
            fontWeight: 600,
            lineHeight: 1.4,
        },
        subtitle1: {
            fontSize: '1rem',
            fontWeight: 500,
            lineHeight: 1.5,
        },
        subtitle2: {
            fontSize: '0.875rem',
            fontWeight: 500,
            lineHeight: 1.5,
        },
        body1: {
            fontSize: '1rem',
            lineHeight: 1.5,
        },
        body2: {
            fontSize: '0.875rem',
            lineHeight: 1.5,
        },
        caption: {
            fontSize: '0.75rem',
            lineHeight: 1.4,
            color: colors.neutral[600],
        },
    },

    shape: {
        borderRadius: 8,
    },

    shadows: [
        'none',
        '0px 1px 2px rgba(0, 0, 0, 0.05)',
        '0px 1px 3px rgba(0, 0, 0, 0.1), 0px 1px 2px rgba(0, 0, 0, 0.06)',
        '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)',
        '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -2px rgba(0, 0, 0, 0.05)',
        '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        '0px 25px 50px -12px rgba(0, 0, 0, 0.25)'
    ],

    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: '#f8fafc',
                    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
                },
            },
        },

        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#ffffff',
                    color: colors.neutral[800],
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    borderBottom: `1px solid ${colors.neutral[200]}`,
                },
            },
        },

        MuiCard: {
            styleOverrides: {
                root: {
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
                    border: `1px solid ${colors.neutral[200]}`,
                    borderRadius: 12,
                    '&:hover': {
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    },
                },
            },
        },

        MuiPaper: {
            styleOverrides: {
                root: {
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
                    border: `1px solid ${colors.neutral[200]}`,
                    borderRadius: 12,
                },
            },
        },

        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    padding: '10px 20px',
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    },
                },
                contained: {
                    '&:hover': {
                        boxShadow: '0 4px 8px rgba(30, 136, 229, 0.3)',
                    },
                },
            },
        },

        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    fontWeight: 500,
                },
                outlined: {
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    border: `1px solid ${colors.neutral[300]}`,
                    '&:hover': {
                        backgroundColor: colors.neutral[50],
                    },
                },
            },
        },

        MuiLinearProgress: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                    backgroundColor: colors.neutral[200],
                },
                bar: {
                    borderRadius: 4,
                },
            },
        },

        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 8,
                        backgroundColor: '#ffffff',
                        '& fieldset': {
                            borderColor: colors.neutral[300],
                        },
                        '&:hover fieldset': {
                            borderColor: colors.primary[400],
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: colors.primary[500],
                            borderWidth: 2,
                        },
                    },
                },
            },
        },

        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    border: '1px solid',
                    '& .MuiAlert-icon': {
                        marginRight: 12,
                    },
                },
                standardSuccess: {
                    backgroundColor: '#f0f9ff',
                    borderColor: colors.success,
                    color: '#065f46',
                },
                standardError: {
                    backgroundColor: '#fef2f2',
                    borderColor: colors.error,
                    color: '#991b1b',
                },
                standardWarning: {
                    backgroundColor: '#fffbeb',
                    borderColor: colors.warning,
                    color: '#92400e',
                },
                standardInfo: {
                    backgroundColor: '#eff6ff',
                    borderColor: colors.info,
                    color: '#1e40af',
                },
            },
        },

        MuiContainer: {
            styleOverrides: {
                root: {
                    paddingLeft: 24,
                    paddingRight: 24,
                },
            },
        },
    },
});

// Export additional utilities
export const gradients = {
    primary: `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.primary[600]} 100%)`,
    success: `linear-gradient(135deg, ${colors.success} 0%, #00a152 100%)`,
    warning: `linear-gradient(135deg, ${colors.warning} 0%, #f57c00 100%)`,
    error: `linear-gradient(135deg, ${colors.error} 0%, #d32f2f 100%)`,
    neutral: `linear-gradient(135deg, ${colors.neutral[100]} 0%, ${colors.neutral[200]} 100%)`,
};

export const customColors = colors;
