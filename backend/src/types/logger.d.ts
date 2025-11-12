/**
 * Type declarations for @jitsi/logger module
 */
declare module '@jitsi/logger' {
  export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    trace(message: string, ...args: any[]): void;
  }

  export function getLogger(name: string): Logger;
}