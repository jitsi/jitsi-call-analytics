/**
 * Type declarations for @jitsi/logger
 * Custom type definitions since no official @types package exists
 */

declare module '@jitsi/logger' {
  export interface Logger {
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    log(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    setLogLevel(level: string | number): void;
  }

  export function getLogger(id?: string): Logger;
  export function setLogLevel(level: string | number): void;

  export const levels: {
    TRACE: string;
    DEBUG: string;
    INFO: string;
    LOG: string;
    WARN: string;
    ERROR: string;
  };
}
