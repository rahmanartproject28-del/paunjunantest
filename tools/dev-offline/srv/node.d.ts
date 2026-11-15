declare module 'node:crypto' { export function randomBytes(n: number): any; export function randomInt(a: number, b: number): number; export function scrypt(...a: any[]): any; export function timingSafeEqual(a: any, b: any): boolean; export function createHash(a: string): any; export function createSign(a: string): any; }
declare module 'node:util' { export function promisify(f: any): any; }
declare module 'node:fs' { const fs: any; export default fs; }
declare const process: any; declare const Buffer: any; type Buffer = any; declare namespace NodeJS { type Timeout = any; }
