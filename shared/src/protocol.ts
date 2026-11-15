// Pesan waktu nyata (WebSocket) antara game dan server.
// Posisi dikirim ringkas supaya hemat kuota dan baterai.

import type { Look } from './social';
export type PlayerPose = 'idle' | 'cast' | 'wait' | 'fight' | 'walk';

export interface NetPlayer { id: string; name: string; x: number; z: number; yaw: number; pose: PlayerPose; lv: number; look?: Partial<Look> }

export type ClientMsg =
  | { t: 'join'; room: string; token: string }
  | { t: 'state'; x: number; z: number; yaw: number; pose: PlayerPose }
  | { t: 'chat'; text: string; ch?: 'global' | 'klub' }
  | { t: 'emote'; e: string }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; you: string; room: string; players: NetPlayer[] }
  | { t: 'snap'; players: NetPlayer[] }                 // 5× per detik, hanya pemain di ruang yang sama
  | { t: 'left'; id: string }
  | { t: 'chat'; id: string; name: string; text: string; at: number; ch?: 'global' | 'klub' }
  | { t: 'emote'; id: string; e: string }
  | { t: 'catch'; name: string; species: string; weight: number }   // pengumuman tangkapan besar
  | { t: 'pong'; at: number }
  | { t: 'error'; msg: string };

/** Pemain per ruang: HP hanya menggambar pemain di ruang yang sama. */
export const ROOM_CAPACITY = 40;
export const SNAP_HZ = 5;
