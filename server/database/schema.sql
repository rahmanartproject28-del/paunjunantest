-- PAUNJUNAN v2 — skema MySQL/MariaDB untuk server Node (Fase 2).
-- Jalankan sekali: mysql -u USER -p NAMA_DB < server/database/schema.sql
-- Untuk Hostinger/phpMyAdmin lebih mudah memakai website/database/paunjunan-database.sql (tabel game + website sekaligus).
-- (Tabel server PHP lama tidak dipakai lagi; datanya bisa dipindah dengan skrip terpisah.)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS pj_players (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,
  name        VARCHAR(40)  NOT NULL,
  xp          INT          NOT NULL DEFAULT 0,
  data        JSON         NOT NULL,              -- seluruh objek Player (koin, tas, keranjang, album, …)
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_xp (xp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pj_accounts (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,   -- sama dengan pj_players.id
  username    VARCHAR(18)  NOT NULL,
  email       VARCHAR(255) NOT NULL,
  pass        VARCHAR(160) NOT NULL,               -- scrypt$salt$hash
  pin         VARCHAR(160) NOT NULL,
  created_at  BIGINT       NOT NULL,
  fail_n      INT          NOT NULL DEFAULT 0,
  lock_until  BIGINT       NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user (username), UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pj_sessions (
  token_hash  CHAR(64)     NOT NULL PRIMARY KEY,   -- sha256 token, token asli tidak disimpan
  player_id   VARCHAR(40)  NOT NULL,
  kind        ENUM('sesi','perangkat','reset') NOT NULL,
  expires     BIGINT       NOT NULL,
  fail_n      INT          NOT NULL DEFAULT 0,
  KEY idx_player (player_id), KEY idx_exp (expires)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS pj_stock (
  spot        VARCHAR(8)   NOT NULL,
  species     VARCHAR(20)  NOT NULL,
  n           INT          NOT NULL,
  PRIMARY KEY (spot, species)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS pj_catches (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,
  player_id   VARCHAR(40)  NOT NULL,
  player_name VARCHAR(40)  NOT NULL,
  species     VARCHAR(20)  NOT NULL,
  name        VARCHAR(40)  NOT NULL,
  weight      DECIMAL(7,2) NOT NULL,
  length_cm   INT          NOT NULL,
  tier        TINYINT      NOT NULL,
  stars       TINYINT      NOT NULL,
  spot        VARCHAR(8)   NOT NULL,
  value       INT          NOT NULL,
  at          BIGINT       NOT NULL,               -- detik unix
  KEY idx_at (at), KEY idx_player (player_id), KEY idx_weight (weight), KEY idx_species_at (species, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fase 4: dokumen bersama (turnamen, pasar, klub). Diperbarui dengan kunci baris (SELECT … FOR UPDATE).
CREATE TABLE IF NOT EXISTS pj_docs (
  k           VARCHAR(64)  NOT NULL PRIMARY KEY,
  data        JSON         NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
