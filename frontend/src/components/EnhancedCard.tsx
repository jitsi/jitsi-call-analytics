/**
 * Enhanced Card Component
 * Professional enterprise-style card with 8x8 branding
 */

import { Box, Card, CardProps } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';

const StyledCard = styled(Card)(({ theme }) => ({
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

    '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
        opacity: 0,
        transition: 'opacity 0.3s ease',
    },

    '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 25px rgba(30, 136, 229, 0.15)',

        '&::before': {
            opacity: 1,
        },
    },
}));

interface IEnhancedCardProps extends CardProps {
    gradient?: boolean;
    highlight?: boolean;
}

export const EnhancedCard: React.FC<IEnhancedCardProps> = ({
    children,
    gradient = false,
    highlight = false,
    ...props
}) => {
    return (
        <StyledCard
            { ...props }
            sx = {{
                ...(gradient && {
                    background: 'linear-gradient(135deg, rgba(30, 136, 229, 0.02) 0%, rgba(255, 255, 255, 1) 100%)',
                }),
                ...(highlight && {
                    border: '2px solid',
                    borderColor: 'primary.main',
                    backgroundColor: 'rgba(30, 136, 229, 0.02)',
                }),
                ...props.sx,
            }}>
            {children}
        </StyledCard>
    );
};

interface IMetricCardProps {
    color?: 'primary' | 'success' | 'warning' | 'error';
    icon?: React.ReactNode;
    subtitle?: string;
    title: string;
    trend?: 'up' | 'down' | 'neutral';
    value: string | number;
}

export const MetricCard: React.FC<IMetricCardProps> = ({
    icon,
    title,
    value,
    subtitle,
    trend,
    color = 'primary'
}) => {
    const getTrendColor = () => {
        switch (trend) {
        case 'up': return 'success.main';
        case 'down': return 'error.main';
        default: return 'text.secondary';
        }
    };

    const getTrendIcon = () => {
        switch (trend) {
        case 'up': return '↗️';
        case 'down': return '↘️';
        default: return '';
        }
    };

    return (
        <EnhancedCard>
            <Box sx = {{ p: 3 }}>
                <Box sx = {{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    {icon && (
                        <Box sx = {{
                            color: `${color}.main`,
                            display: 'flex',
                            alignItems: 'center',
                        }}>
                            {icon}
                        </Box>
                    )}
                    <Box sx = {{
                        color: 'text.secondary',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        {title}
                    </Box>
                </Box>

                <Box sx = {{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                    <Box sx = {{
                        fontSize: '2rem',
                        fontWeight: 600,
                        color: 'text.primary',
                        lineHeight: 1,
                    }}>
                        {value}
                    </Box>
                    {trend && (
                        <Box sx = {{
                            color: getTrendColor(),
                            fontSize: '1rem',
                            fontWeight: 500,
                        }}>
                            {getTrendIcon()}
                        </Box>
                    )}
                </Box>

                {subtitle && (
                    <Box sx = {{
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        fontWeight: 400,
                    }}>
                        {subtitle}
                    </Box>
                )}
            </Box>
        </EnhancedCard>
    );
};
