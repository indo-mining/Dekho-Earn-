"use strict";

/*
=========================================================
 DEKHOEARN SERVER
 Version 3.1.3 FINAL
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Frontend v3.1.4
 - Secure Bearer Authentication
 - x-auth-token compatibility
 - Neon PostgreSQL
 - Cloudinary Signed Video Upload
 - Video Feed
 - Watch Rewards
 - Watch History
 - Likes / Comments / Reports
 - Follow / Subscribe System
 - Daily Reward
 - Rewarded Ad Demo
 - Points History
 - Referral System
 - Creator Dashboard
 - Creator Monetization Foundation
 - Creator Earnings Ledger
 - Payout Account Foundation
 - Admin Moderation
 - Admin Users
 - Duplicate URL Warning
 - Existing Database Compatibility
 - Database Migrations
 - Resend Email Configuration
 - PWA / Static Frontend
 - Express 5 Compatible Wildcard Route

=========================================================
*/

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");

const app = express();

/* ======================================================
   CONFIG
====================================================== */

const PORT = Number(process.env.PORT || 10000);

const DATABASE_URL = process.env.DATABASE_URL || "";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "";

const CLOUDINARY_API_KEY =
  process.env.CLOUDINARY_API_KEY || "";

const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "";

const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || "dekhoearn/videos";

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || "";

const MAIL_FROM =
  process.env.MAIL_FROM || "";

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  `http://localhost:${PORT}`;

/* ======================================================
   DEKHOEARN REWARD SETTINGS
====================================================== */

const POINTS_PER_WATCH =
  Number(process.env.POINTS_PER_WATCH || 1);

const DAILY_REWARD =
  Number(process.env.DAILY_REWARD || 10);

const REWARDED_AD_POINTS =
  Number(process.env.REWARDED_AD_POINTS || 5);

const REFERRAL_REWARD =
  Number(process.env.REFERRAL_REWARD || 10);

const MIN_WATCH_SECONDS =
  Number(process.env.MIN_WATCH_SECONDS || 10);

const CREATOR_MIN_FOLLOWERS =
  Number(process.env.CREATOR_MIN_FOLLOWERS || 1000);

const CREATOR_MIN_WATCH_HOURS =
  Number(process.env.CREATOR_MIN_WATCH_HOURS || 1000);

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;

/* ======================================================
   DATABASE
====================================================== */

if (!DATABASE_URL) {
  console.warn(
    "WARNING: DATABASE_URL is not configured."
  );
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

/* ======================================================
   EXPRESS
====================================================== */

app.disable("x-powered-by");

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-auth-token",
      "x-user-id",
      "x-admin-key"
    ]
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

/* ======================================================
   BASIC HELPERS
====================================================== */

function cleanString(value, max = 1000) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function normalizeEmail(value) {
  return cleanString(value, 320).toLowerCase();
}

function normalizeUsername(value) {
  return cleanString(value, 50)
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
}

function firstNameFromName(name) {
  const value = cleanString(name, 100);

  if (!value) {
    return "User";
  }

  return value.split(/\s+/)[0];
}

function makeUsername(name) {
  let base = normalizeUsername(name);

  if (!base) {
    base = "user";
  }

  return base.slice(0, 40);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function safeInt(value, fallback = 0) {
  const n = parseInt(value, 10);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function nowDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function escapeLike(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function getAuthToken(req) {
  const auth =
    req.headers.authorization ||
    req.headers.Authorization ||
    "";

  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  const legacy =
    req.headers["x-auth-token"];

  if (legacy) {
    return String(legacy).trim();
  }

  return "";
}

function getAdminKey(req) {
  const header =
    req.headers["x-admin-key"];

  if (header) {
    return String(header);
  }

  const auth =
    req.headers.authorization ||
    "";

  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return "";
}

function sendError(res, status, message, extra = {}) {
  return res.status(status).json({
    success: false,
    error: message,
    message,
    ...extra
  });
}

function sendSuccess(res, data = {}) {
  return res.json({
    success: true,
    ...data
  });
}

async function dbQuery(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  return pool.query(text, params);
}

async function tableExists(tableName) {
  const result = await dbQuery(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function columnExists(tableName, columnName) {
  const result = await dbQuery(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function addColumnIfMissing(
  tableName,
  columnName,
  definition
) {
  const exists = await columnExists(
    tableName,
    columnName
  );

  if (!exists) {
    await dbQuery(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`
    );

    console.log(
      `Migration: added ${tableName}.${columnName}`
    );
  }
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initializeDatabase() {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is required"
    );
  }

  console.log("Initializing database...");

  /* ----------------------------------------------------
     USERS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      points BIGINT NOT NULL DEFAULT 0,
      followers_count BIGINT NOT NULL DEFAULT 0,
      following_count BIGINT NOT NULL DEFAULT 0,
      total_watch_seconds BIGINT NOT NULL DEFAULT 0,
      total_videos BIGINT NOT NULL DEFAULT 0,
      creator_status TEXT NOT NULL DEFAULT 'user',
      creator_applied BOOLEAN NOT NULL DEFAULT FALSE,
      banned BOOLEAN NOT NULL DEFAULT FALSE,
      referral_code TEXT UNIQUE,
      referred_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await addColumnIfMissing(
    "dekhoearn_users",
    "password_hash",
    "TEXT"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "avatar_url",
    "TEXT"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "points",
    "BIGINT NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "followers_count",
    "BIGINT NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "following_count",
    "BIGINT NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "total_watch_seconds",
    "BIGINT NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "total_videos",
    "BIGINT NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "creator_status",
    "TEXT NOT NULL DEFAULT 'user'"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "creator_applied",
    "BOOLEAN NOT NULL DEFAULT FALSE"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "banned",
    "BOOLEAN NOT NULL DEFAULT FALSE"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "referral_code",
    "TEXT"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "referred_by",
    "BIGINT"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "created_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  );

  /* ----------------------------------------------------
     VIDEOS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      video_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      cloudinary_resource_type TEXT DEFAULT 'video',
      thumbnail_url TEXT,
      duration_seconds INTEGER DEFAULT 0,
      views BIGINT NOT NULL DEFAULT 0,
      likes_count BIGINT NOT NULL DEFAULT 0,
      comments_count BIGINT NOT NULL DEFAULT 0,
      watched_seconds BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      moderation_status TEXT NOT NULL DEFAULT 'approved',
      duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const videoColumns = [
    ["description", "TEXT"],
    ["cloudinary_public_id", "TEXT"],
    [
      "cloudinary_resource_type",
      "TEXT DEFAULT 'video'"
    ],
    ["thumbnail_url", "TEXT"],
    [
      "duration_seconds",
      "INTEGER DEFAULT 0"
    ],
    [
      "views",
      "BIGINT NOT NULL DEFAULT 0"
    ],
    [
      "likes_count",
      "BIGINT NOT NULL DEFAULT 0"
    ],
    [
      "comments_count",
      "BIGINT NOT NULL DEFAULT 0"
    ],
    [
      "watched_seconds",
      "BIGINT NOT NULL DEFAULT 0"
    ],
    [
      "status",
      "TEXT NOT NULL DEFAULT 'active'"
    ],
    [
      "moderation_status",
      "TEXT NOT NULL DEFAULT 'approved'"
    ],
    [
      "duplicate_warning",
      "BOOLEAN NOT NULL DEFAULT FALSE"
    ],
    [
      "created_at",
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
    ],
    [
      "updated_at",
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
    ]
  ];

  for (const [name, definition] of videoColumns) {
    await addColumnIfMissing(
      "dekhoearn_videos",
      name,
      definition
    );
  }

  /* ----------------------------------------------------
     AUTH SESSIONS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     VIDEO VIEWS / WATCH HISTORY
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      watch_seconds INTEGER NOT NULL DEFAULT 0,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    )
  `);

  await addColumnIfMissing(
    "dekhoearn_video_views",
    "watch_seconds",
    "INTEGER NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_video_views",
    "reward_granted",
    "BOOLEAN NOT NULL DEFAULT FALSE"
  );

  await addColumnIfMissing(
    "dekhoearn_video_views",
    "created_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  );

  await addColumnIfMissing(
    "dekhoearn_video_views",
    "updated_at",
    "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  );

  /* ----------------------------------------------------
     LIKES
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    )
  `);

  /* ----------------------------------------------------
     COMMENTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     REPORTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    )
  `);

  /* ----------------------------------------------------
     FOLLOWS / SUBSCRIPTIONS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id BIGINT NOT NULL,
      following_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    )
  `);

  /* ----------------------------------------------------
     POINTS LEDGER
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount BIGINT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      reference_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     DAILY REWARDS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      reward_date DATE NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, reward_date)
    )
  `);

  /* ----------------------------------------------------
     REWARDED ADS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     REFERRALS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL,
      referred_id BIGINT NOT NULL UNIQUE,
      reward_points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     CREATOR EARNINGS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id BIGSERIAL PRIMARY KEY,
      creator_id BIGINT NOT NULL,
      video_id BIGINT,
      gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      platform_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      creator_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     PAYOUT ACCOUNTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE,
      account_type TEXT,
      account_name TEXT,
      account_identifier TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     ADMIN ACTIONS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id BIGSERIAL PRIMARY KEY,
      admin_identifier TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     INDEXES
  ---------------------------------------------------- */

  const indexes = [
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_videos_created
      ON dekhoearn_videos(created_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_videos_user
      ON dekhoearn_videos(user_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_video_views_user
      ON dekhoearn_video_views(user_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_video_views_updated
      ON dekhoearn_video_views(updated_at DESC)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_comments_video
      ON dekhoearn_comments(video_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_reports_status
      ON dekhoearn_reports(status)
    `,
    `
      CREATE INDEX IF NOT EXISTS
      idx_dekhoearn_points_user
      ON dekhoearn_points_ledger(user_id)
    `
  ];

  for (const sql of indexes) {
    await dbQuery(sql);
  }

  /* ----------------------------------------------------
     BACKFILL NULLS
  ---------------------------------------------------- */

  await dbQuery(`
    UPDATE dekhoearn_video_views
    SET updated_at = COALESCE(updated_at, created_at, NOW())
    WHERE updated_at IS NULL
  `);

  await dbQuery(`
    UPDATE dekhoearn_videos
    SET
      views = COALESCE(views, 0),
      likes_count = COALESCE(likes_count, 0),
      comments_count = COALESCE(comments_count, 0),
      watched_seconds = COALESCE(watched_seconds, 0)
  `);

  await dbQuery(`
    UPDATE dekhoearn_users
    SET
      points = COALESCE(points, 0),
      followers_count = COALESCE(followers_count, 0),
      following_count = COALESCE(following_count, 0),
      total_watch_seconds = COALESCE(total_watch_seconds, 0),
      total_videos = COALESCE(total_videos, 0)
  `);

  console.log(
    "Database initialized successfully."
  );
}

/* ======================================================
   USER HELPERS
====================================================== */

async function findUserById(userId) {
  const result = await dbQuery(
    `
      SELECT *
      FROM dekhoearn_users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await dbQuery(
    `
      SELECT *
      FROM dekhoearn_users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserByUsername(username) {
  const result = await dbQuery(
    `
      SELECT *
      FROM dekhoearn_users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [username]
  );

  return result.rows[0] || null;
}

async function ensureReferralCode(user) {
  if (user.referral_code) {
    return user.referral_code;
  }

  let code = "";

  for (let i = 0; i < 10; i++) {
    code =
      makeUsername(user.username || "user") +
      "-" +
      crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();

    const exists = await dbQuery(
      `
        SELECT id
        FROM dekhoearn_users
        WHERE referral_code = $1
        LIMIT 1
      `,
      [code]
    );

    if (!exists.rows.length) {
      break;
    }
  }

  await dbQuery(
    `
      UPDATE dekhoearn_users
      SET referral_code = $1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [code, user.id]
  );

  return code;
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name || "",
    first_name:
      firstNameFromName(user.name || ""),
    username: user.username || "",
    email: user.email || "",
    avatar_url: user.avatar_url || "",
    points: safeInt(user.points),
    followers_count:
      safeInt(user.followers_count),
    following_count:
      safeInt(user.following_count),
    total_watch_seconds:
      safeInt(user.total_watch_seconds),
    total_videos:
      safeInt(user.total_videos),
    creator_status:
      user.creator_status || "user",
    creator_applied:
      Boolean(user.creator_applied),
    banned: Boolean(user.banned),
    referral_code:
      user.referral_code || ""
  };
}

/* ======================================================
   AUTH MIDDLEWARE
====================================================== */

async function optionalAuth(req, res, next) {
  try {
    const token = getAuthToken(req);

    req.user = null;

    if (!token) {
      return next();
    }

    const tokenHash = sha256(token);

    const result = await dbQuery(
      `
        SELECT u.*
        FROM dekhoearn_sessions s
        JOIN dekhoearn_users u
          ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );

    if (result.rows.length) {
      req.user = result.rows[0];
    }

    return next();
  } catch (error) {
    console.error(
      "OPTIONAL AUTH ERROR:",
      error
    );

    req.user = null;
    return next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = getAuthToken(req);

    if (!token) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const tokenHash = sha256(token);

    const result = await dbQuery(
      `
        SELECT
          u.*
        FROM dekhoearn_sessions s
        JOIN dekhoearn_users u
          ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );

    if (!result.rows.length) {
      return sendError(
        res,
        401,
        "Invalid or expired session"
      );
    }

    const user = result.rows[0];

    if (user.banned) {
      return sendError(
        res,
        403,
        "Your account has been restricted"
      );
    }

    req.user = user;
    req.authToken = token;

    return next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Authentication failed"
    );
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return sendError(
      res,
      503,
      "Admin system is not configured"
    );
  }

  const provided = getAdminKey(req);

  if (!provided || provided !== ADMIN_KEY) {
    return sendError(
      res,
      403,
      "Admin access denied"
    );
  }

  next();
}

/* ======================================================
   AUTH SESSION
====================================================== */

async function createSession(userId) {
  const token = randomToken();
  const tokenHash = sha256(token);

  await dbQuery(
    `
      INSERT INTO dekhoearn_sessions
      (
        user_id,
        token_hash,
        expires_at
      )
      VALUES
      (
        $1,
        $2,
        NOW() + INTERVAL '30 days'
      )
    `,
    [userId, tokenHash]
  );

  return token;
}

/* ======================================================
   HEALTH
====================================================== */

app.get("/health", async (req, res) => {
  try {
    let database = false;

    if (pool) {
      await dbQuery("SELECT 1");
      database = true;
    }

    return res.json({
      success: true,
      status: "ok",
      service: "DekhoEarn",
      version: "3.1.3",
      database,
      cloudinary: Boolean(
        CLOUDINARY_CLOUD_NAME &&
        CLOUDINARY_API_KEY &&
        CLOUDINARY_API_SECRET
      ),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: "error",
      service: "DekhoEarn",
      version: "3.1.3",
      database: false,
      error: error.message
    });
  }
});

/* ======================================================
   AUTH - REGISTER
====================================================== */

app.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const name =
        cleanString(
          req.body.name ||
          req.body.first_name ||
          "",
          100
        );

      const username =
        normalizeUsername(
          req.body.username ||
          makeUsername(name)
        );

      const email =
        normalizeEmail(
          req.body.email || ""
        );

      const password =
        cleanString(
          req.body.password || "",
          200
        );

      if (!username) {
        return sendError(
          res,
          400,
          "Username is required"
        );
      }

      if (email && !email.includes("@")) {
        return sendError(
          res,
          400,
          "Invalid email"
        );
      }

      if (
        password &&
        password.length < 6
      ) {
        return sendError(
          res,
          400,
          "Password must be at least 6 characters"
        );
      }

      const existingUsername =
        await findUserByUsername(
          username
        );

      if (existingUsername) {
        return sendError(
          res,
          409,
          "Username already exists"
        );
      }

      if (email) {
        const existingEmail =
          await findUserByEmail(email);

        if (existingEmail) {
          return sendError(
            res,
            409,
            "Email already exists"
          );
        }
      }

      let passwordHash = null;

      if (password) {
        passwordHash =
          await bcrypt.hash(
            password,
            10
          );
      }

      const result =
        await dbQuery(
          `
            INSERT INTO dekhoearn_users
            (
              name,
              username,
              email,
              password_hash
            )
            VALUES
            ($1, $2, $3, $4)
            RETURNING *
          `,
          [
            name ||
              firstNameFromName(username),
            username,
            email || null,
            passwordHash
          ]
        );

      const user = result.rows[0];

      const referralCode =
        await ensureReferralCode(
          user
        );

      user.referral_code =
        referralCode;

      const token =
        await createSession(
          user.id
        );

      return res.status(201).json({
        success: true,
        token,
        user: publicUser(user)
      });
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Registration failed"
      );
    }
  }
);

/* ======================================================
   AUTH - LOGIN
====================================================== */

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const login =
        cleanString(
          req.body.email ||
          req.body.username ||
          "",
          320
        );

      const password =
        cleanString(
          req.body.password || "",
          200
        );

      if (!login) {
        return sendError(
          res,
          400,
          "Email or username is required"
        );
      }

      const user =
        login.includes("@")
          ? await findUserByEmail(login)
          : await findUserByUsername(
              normalizeUsername(login)
            );

      if (!user) {
        return sendError(
          res,
          401,
          "Invalid login details"
        );
      }

      if (user.banned) {
        return sendError(
          res,
          403,
          "Your account has been restricted"
        );
      }

      if (user.password_hash) {
        const valid =
          await bcrypt.compare(
            password,
            user.password_hash
          );

        if (!valid) {
          return sendError(
            res,
            401,
            "Invalid login details"
          );
        }
      }

      await ensureReferralCode(user);

      const freshUser =
        await findUserById(user.id);

      const token =
        await createSession(
          user.id
        );

      return sendSuccess(
        res,
        {
          token,
          user: publicUser(
            freshUser
          )
        }
      );
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Login failed"
      );
    }
  }
);

/* ======================================================
   AUTH - ME
====================================================== */

app.get(
  "/api/auth/me",
  requireAuth,
  async (req, res) => {
    return sendSuccess(
      res,
      {
        user: publicUser(
          req.user
        )
      }
    );
  }
);

/* ======================================================
   AUTH - LOGOUT
====================================================== */

app.post(
  "/api/auth/logout",
  requireAuth,
  async (req, res) => {
    try {
      const tokenHash =
        sha256(req.authToken);

      await dbQuery(
        `
          DELETE FROM dekhoearn_sessions
          WHERE token_hash = $1
        `,
        [tokenHash]
      );

      return sendSuccess(res, {
        message: "Logged out"
      });
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Logout failed"
      );
    }
  }
);

/* ======================================================
   LEGACY USER ENDPOINT
====================================================== */

app.post(
  "/api/user",
  optionalAuth,
  async (req, res) => {
    try {
      if (req.user) {
        return sendSuccess(
          res,
          {
            user: publicUser(
              req.user
            )
          }
        );
      }

      const username =
        normalizeUsername(
          req.body.username ||
          "user"
        );

      const firstName =
        cleanString(
          req.body.first_name ||
          req.body.name ||
          "User",
          100
        );

      let user =
        await findUserByUsername(
          username
        );

      if (!user) {
        const result =
          await dbQuery(
            `
              INSERT INTO dekhoearn_users
              (
                name,
                username
              )
              VALUES
              ($1, $2)
              RETURNING *
            `,
            [
              firstName,
              username
            ]
          );

        user = result.rows[0];
      }

      await ensureReferralCode(user);

      user =
        await findUserById(user.id);

      const token =
        await createSession(
          user.id
        );

      return sendSuccess(
        res,
        {
          token,
          user: publicUser(user)
        }
      );
    } catch (error) {
      console.error(
        "LEGACY USER ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to create user"
      );
    }
  }
);

/* ======================================================
   VIDEO NORMALIZER
====================================================== */

function publicVideo(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    creator_id: row.user_id,

    title: row.title || "",
    description:
      row.description || "",

    video_url:
      row.video_url || "",

    url:
      row.video_url || "",

    cloudinary_public_id:
      row.cloudinary_public_id || "",

    cloudinary_resource_type:
      row.cloudinary_resource_type ||
      "video",

    thumbnail_url:
      row.thumbnail_url || "",

    duration_seconds:
      safeInt(row.duration_seconds),

    views:
      safeInt(row.views),

    likes_count:
      safeInt(row.likes_count),

    comments_count:
      safeInt(row.comments_count),

    watched_seconds:
      safeInt(row.watched_seconds),

    status:
      row.status || "active",

    moderation_status:
      row.moderation_status ||
      "approved",

    duplicate_warning:
      Boolean(row.duplicate_warning),

    creator_name:
      row.creator_name ||
      row.name ||
      "",

    creator_username:
      row.creator_username ||
      row.username ||
      "",

    creator_avatar:
      row.creator_avatar ||
      row.avatar_url ||
      "",

    created_at:
      row.created_at
  };
}

/* ======================================================
   VIDEO FEED
====================================================== */

app.get(
  "/api/videos",
  optionalAuth,
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          safeInt(req.query.limit, 20),
          1
        ),
        50
      );

      const offset = Math.max(
        safeInt(req.query.offset, 0),
        0
      );

      const result =
        await dbQuery(
          `
            SELECT
              v.*,
              u.name,
              u.username,
              u.avatar_url
            FROM dekhoearn_videos v
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            WHERE v.status = 'active'
              AND v.moderation_status != 'removed'
              AND u.banned = FALSE
            ORDER BY v.created_at DESC
            LIMIT $1
            OFFSET $2
          `,
          [
            limit,
            offset
          ]
        );

      return sendSuccess(
        res,
        {
          videos:
            result.rows.map(
              publicVideo
            )
        }
      );
    } catch (error) {
      console.error(
        "VIDEOS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load videos"
      );
    }
  }
);

/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get(
  "/api/videos/:id",
  optionalAuth,
  async (req, res) => {
    try {
      const id =
        safeInt(req.params.id);

      const result =
        await dbQuery(
          `
            SELECT
              v.*,
              u.name,
              u.username,
              u.avatar_url
            FROM dekhoearn_videos v
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            WHERE v.id = $1
            LIMIT 1
          `,
          [id]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      return sendSuccess(
        res,
        {
          video:
            publicVideo(
              result.rows[0]
            )
        }
      );
    } catch (error) {
      console.error(
        "SINGLE VIDEO ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load video"
      );
    }
  }
);

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

function cloudinarySignature(params) {
  const keys = Object.keys(params)
    .filter(
      key =>
        params[key] !== undefined &&
        params[key] !== null &&
        params[key] !== ""
    )
    .sort();

  const stringToSign = keys
    .map(
      key =>
        `${key}=${params[key]}`
    )
    .join("&");

  return crypto
    .createHash("sha1")
    .update(
      stringToSign +
        CLOUDINARY_API_SECRET
    )
    .digest("hex");
}

async function cloudinarySignatureHandler(
  req,
  res
) {
  try {
    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      return sendError(
        res,
        503,
        "Cloudinary is not configured"
      );
    }

    const timestamp =
      Math.floor(
        Date.now() / 1000
      );

    const folder =
      cleanString(
        req.body?.folder ||
        req.query?.folder ||
        CLOUDINARY_FOLDER,
        200
      );

    const paramsToSign = {
      folder,
      timestamp
    };

    const signature =
      cloudinarySignature(
        paramsToSign
      );

    return sendSuccess(
      res,
      {
        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        folder,

        resource_type:
          "video",

        upload_url:
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`
      }
    );
  } catch (error) {
    console.error(
      "CLOUDINARY SIGNATURE ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to generate upload signature"
    );
  }
}

app.get(
  "/api/cloudinary/signature",
  requireAuth,
  cloudinarySignatureHandler
);

app.post(
  "/api/cloudinary/signature",
  requireAuth,
  cloudinarySignatureHandler
);

/* ======================================================
   SAVE VIDEO METADATA
====================================================== */

app.post(
  "/api/videos",
  requireAuth,
  async (req, res) => {
    try {
      const title =
        cleanString(
          req.body.title,
          200
        );

      const description =
        cleanString(
          req.body.description,
          2000
        );

      const videoUrl =
        cleanString(
          req.body.video_url ||
          req.body.url,
          2000
        );

      const publicId =
        cleanString(
          req.body.cloudinary_public_id ||
          req.body.public_id,
          500
        );

      const resourceType =
        cleanString(
          req.body.cloudinary_resource_type ||
          req.body.resource_type ||
          "video",
          50
        );

      const thumbnailUrl =
        cleanString(
          req.body.thumbnail_url,
          2000
        );

      const duration =
        Math.max(
          safeInt(
            req.body.duration_seconds,
            0
          ),
          0
        );

      if (!title) {
        return sendError(
          res,
          400,
          "Video title is required"
        );
      }

      if (!videoUrl) {
        return sendError(
          res,
          400,
          "Video URL is required"
        );
      }

      /* -----------------------------------------------
         Duplicate URL warning
      ------------------------------------------------ */

      let duplicateWarning =
        false;

      const duplicate =
        await dbQuery(
          `
            SELECT id
            FROM dekhoearn_videos
            WHERE video_url = $1
              AND user_id != $2
            LIMIT 1
          `,
          [
            videoUrl,
            req.user.id
          ]
        );

      if (duplicate.rows.length) {
        duplicateWarning = true;
      }

      /* -----------------------------------------------
         Duplicate Cloudinary public ID
      ------------------------------------------------ */

      if (
        publicId &&
        !duplicateWarning
      ) {
        const duplicatePublicId =
          await dbQuery(
            `
              SELECT id
              FROM dekhoearn_videos
              WHERE cloudinary_public_id = $1
                AND user_id != $2
              LIMIT 1
            `,
            [
              publicId,
              req.user.id
            ]
          );

        if (
          duplicatePublicId.rows.length
        ) {
          duplicateWarning = true;
        }
      }

      const result =
        await dbQuery(
          `
            INSERT INTO dekhoearn_videos
            (
              user_id,
              title,
              description,
              video_url,
              cloudinary_public_id,
              cloudinary_resource_type,
              thumbnail_url,
              duration_seconds,
              duplicate_warning
            )
            VALUES
            (
              $1,$2,$3,$4,$5,$6,$7,$8,$9
            )
            RETURNING *
          `,
          [
            req.user.id,
            title,
            description,
            videoUrl,
            publicId || null,
            resourceType ||
              "video",
            thumbnailUrl || null,
            duration,
            duplicateWarning
          ]
        );

      await dbQuery(
        `
          UPDATE dekhoearn_users
          SET total_videos =
              COALESCE(total_videos, 0) + 1,
              updated_at = NOW()
          WHERE id = $1
        `,
        [req.user.id]
      );

      const row =
        result.rows[0];

      return res.status(201).json({
        success: true,
        video:
          publicVideo(row),
        duplicate_warning:
          duplicateWarning
      });
    } catch (error) {
      console.error(
        "CREATE VIDEO ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to save video"
      );
    }
  }
);

/* ======================================================
   MY VIDEOS
====================================================== */

app.get(
  "/api/videos/mine",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
            SELECT
              v.*,
              u.name,
              u.username,
              u.avatar_url
            FROM dekhoearn_videos v
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            WHERE v.user_id = $1
            ORDER BY v.created_at DESC
          `,
          [req.user.id]
        );

      return sendSuccess(
        res,
        {
          videos:
            result.rows.map(
              publicVideo
            )
        }
      );
    } catch (error) {
      console.error(
        "MY VIDEOS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load your videos"
      );
    }
  }
);

/* ======================================================
   DELETE OWN VIDEO
====================================================== */

app.delete(
  "/api/videos/:id",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        safeInt(req.params.id);

      const result =
        await dbQuery(
          `
            SELECT *
            FROM dekhoearn_videos
            WHERE id = $1
            LIMIT 1
          `,
          [videoId]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      const video =
        result.rows[0];

      if (
        String(video.user_id) !==
        String(req.user.id)
      ) {
        return sendError(
          res,
          403,
          "You can delete only your own video"
        );
      }

      await dbQuery(
        `
          DELETE FROM dekhoearn_video_views
          WHERE video_id = $1
        `,
        [videoId]
      );

      await dbQuery(
        `
          DELETE FROM dekhoearn_likes
          WHERE video_id = $1
        `,
        [videoId]
      );

      await dbQuery(
        `
          DELETE FROM dekhoearn_comments
          WHERE video_id = $1
        `,
        [videoId]
      );

      await dbQuery(
        `
          DELETE FROM dekhoearn_reports
          WHERE video_id = $1
        `,
        [videoId]
      );

      await dbQuery(
        `
          DELETE FROM dekhoearn_videos
          WHERE id = $1
        `,
        [videoId]
      );

      await dbQuery(
        `
          UPDATE dekhoearn_users
          SET total_videos =
            GREATEST(
              COALESCE(total_videos, 0) - 1,
              0
            ),
            updated_at = NOW()
          WHERE id = $1
        `,
        [req.user.id]
      );

      return sendSuccess(
        res,
        {
          message:
            "Video deleted successfully"
        }
      );
    } catch (error) {
      console.error(
        "DELETE VIDEO ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to delete video"
      );
    }
  }
);

/* ======================================================
   WATCH COMPLETE
====================================================== */

app.post(
  "/api/watch/complete",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const videoId =
        safeInt(
          req.body.video_id ||
          req.body.videoId
        );

      const watchSeconds =
        Math.max(
          safeInt(
            req.body.watch_seconds ||
            req.body.watchSeconds,
            0
          ),
          0
        );

      if (!videoId) {
        client.release();

        return sendError(
          res,
          400,
          "Video ID is required"
        );
      }

      await client.query(
        "BEGIN"
      );

      const videoResult =
        await client.query(
          `
            SELECT *
            FROM dekhoearn_videos
            WHERE id = $1
            FOR UPDATE
          `,
          [videoId]
        );

      if (!videoResult.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        client.release();

        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      const video =
        videoResult.rows[0];

      const existing =
        await client.query(
          `
            SELECT *
            FROM dekhoearn_video_views
            WHERE video_id = $1
              AND user_id = $2
            FOR UPDATE
          `,
          [
            videoId,
            req.user.id
          ]
        );

      let rewardGranted = false;
      let previousSeconds = 0;

      if (existing.rows.length) {
        previousSeconds =
          safeInt(
            existing.rows[0]
              .watch_seconds
          );

        rewardGranted =
          Boolean(
            existing.rows[0]
              .reward_granted
          );

        const finalSeconds =
          Math.max(
            previousSeconds,
            watchSeconds
          );

        await client.query(
          `
            UPDATE dekhoearn_video_views
            SET watch_seconds = $1,
                updated_at = NOW()
            WHERE video_id = $2
              AND user_id = $3
          `,
          [
            finalSeconds,
            videoId,
            req.user.id
          ]
        );
      } else {
        await client.query(
          `
            INSERT INTO dekhoearn_video_views
            (
              video_id,
              user_id,
              watch_seconds,
              reward_granted
            )
            VALUES
            ($1,$2,$3,FALSE)
          `,
          [
            videoId,
            req.user.id,
            watchSeconds
          ]
        );
      }

      /* -----------------------------------------------
         Update aggregate watch information
      ------------------------------------------------ */

      const additionalSeconds =
        existing.rows.length
          ? Math.max(
              watchSeconds -
                previousSeconds,
              0
            )
          : watchSeconds;

      if (
        additionalSeconds > 0
      ) {
        await client.query(
          `
            UPDATE dekhoearn_videos
            SET watched_seconds =
              COALESCE(watched_seconds, 0)
              + $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [
            additionalSeconds,
            videoId
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET total_watch_seconds =
              COALESCE(
                total_watch_seconds,
                0
              ) + $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [
            additionalSeconds,
            req.user.id
          ]
        );
      }

      /* -----------------------------------------------
         View count only first watch record
      ------------------------------------------------ */

      if (!existing.rows.length) {
        await client.query(
          `
            UPDATE dekhoearn_videos
            SET views =
              COALESCE(views, 0) + 1,
              updated_at = NOW()
            WHERE id = $1
          `,
          [videoId]
        );
      }

      /* -----------------------------------------------
         Reward once after minimum watch
      ------------------------------------------------ */

      const currentSeconds =
        Math.max(
          previousSeconds,
          watchSeconds
        );

      if (
        !rewardGranted &&
        currentSeconds >=
          MIN_WATCH_SECONDS
      ) {
        await client.query(
          `
            UPDATE dekhoearn_video_views
            SET reward_granted = TRUE,
                updated_at = NOW()
            WHERE video_id = $1
              AND user_id = $2
          `,
          [
            videoId,
            req.user.id
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET points =
              COALESCE(points, 0)
              + $1,
              updated_at = NOW()
            WHERE id = $2
          `,
          [
            POINTS_PER_WATCH,
            req.user.id
          ]
        );

        await client.query(
          `
            INSERT INTO dekhoearn_points_ledger
            (
              user_id,
              amount,
              type,
              description,
              reference_id
            )
            VALUES
            ($1,$2,$3,$4,$5)
          `,
          [
            req.user.id,
            POINTS_PER_WATCH,
            "watch",
            "Video watch reward",
            String(videoId)
          ]
        );

        rewardGranted = true;
      }

      await client.query(
        "COMMIT"
      );

      client.release();

      const updatedUser =
        await findUserById(
          req.user.id
        );

      return sendSuccess(
        res,
        {
          reward_granted:
            rewardGranted,

          reward_points:
            rewardGranted
              ? POINTS_PER_WATCH
              : 0,

          watch_seconds:
            currentSeconds,

          points:
            safeInt(
              updatedUser?.points
            )
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "WATCH COMPLETE ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to complete watch"
      );
    }
  }
);

/* ======================================================
   WATCH HISTORY
====================================================== */

app.get(
  "/api/watch/history",
  requireAuth,
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          safeInt(
            req.query.limit,
            50
          ),
          1
        ),
        100
      );

      const result =
        await dbQuery(
          `
            SELECT
              vv.id AS view_id,
              vv.video_id,
              vv.user_id,
              vv.watch_seconds,
              vv.reward_granted,
              vv.created_at AS watched_at,
              vv.updated_at,
              v.title,
              v.description,
              v.video_url,
              v.thumbnail_url,
              v.views,
              v.likes_count,
              v.comments_count,
              v.user_id AS creator_id,
              u.name AS creator_name,
              u.username AS creator_username,
              u.avatar_url AS creator_avatar
            FROM dekhoearn_video_views vv
            JOIN dekhoearn_videos v
              ON v.id = vv.video_id
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            WHERE vv.user_id = $1
            ORDER BY vv.updated_at DESC
            LIMIT $2
          `,
          [
            req.user.id,
            limit
          ]
        );

      return sendSuccess(
        res,
        {
          history:
            result.rows.map(row => ({
              id: row.video_id,
              video_id: row.video_id,
              title: row.title || "",
              description:
                row.description || "",
              video_url:
                row.video_url || "",
              thumbnail_url:
                row.thumbnail_url || "",
              views:
                safeInt(row.views),
              likes_count:
                safeInt(
                  row.likes_count
                ),
              comments_count:
                safeInt(
                  row.comments_count
                ),
              creator_id:
                row.creator_id,
              creator_name:
                row.creator_name || "",
              creator_username:
                row.creator_username ||
                "",
              creator_avatar:
                row.creator_avatar ||
                "",
              watch_seconds:
                safeInt(
                  row.watch_seconds
                ),
              reward_granted:
                Boolean(
                  row.reward_granted
                ),
              watched_at:
                row.watched_at,
              updated_at:
                row.updated_at
            }))
        }
      );
    } catch (error) {
      console.error(
        "WATCH HISTORY ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load watch history"
      );
    }
  }
);

/* ======================================================
   LIKE / UNLIKE
====================================================== */

app.post(
  "/api/videos/:id/like",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const videoId =
        safeInt(req.params.id);

      await client.query(
        "BEGIN"
      );

      const video =
        await client.query(
          `
            SELECT id
            FROM dekhoearn_videos
            WHERE id = $1
            FOR UPDATE
          `,
          [videoId]
        );

      if (!video.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        client.release();

        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      const existing =
        await client.query(
          `
            SELECT id
            FROM dekhoearn_likes
            WHERE video_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [
            videoId,
            req.user.id
          ]
        );

      let liked = false;

      if (existing.rows.length) {
        await client.query(
          `
            DELETE FROM dekhoearn_likes
            WHERE video_id = $1
              AND user_id = $2
          `,
          [
            videoId,
            req.user.id
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_videos
            SET likes_count =
              GREATEST(
                COALESCE(likes_count, 0) - 1,
                0
              )
            WHERE id = $1
          `,
          [videoId]
        );
      } else {
        await client.query(
          `
            INSERT INTO dekhoearn_likes
            (
              video_id,
              user_id
            )
            VALUES
            ($1,$2)
            ON CONFLICT
            (
              video_id,
              user_id
            )
            DO NOTHING
          `,
          [
            videoId,
            req.user.id
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_videos
            SET likes_count =
              COALESCE(likes_count, 0) + 1
            WHERE id = $1
          `,
          [videoId]
        );

        liked = true;
      }

      await client.query(
        "COMMIT"
      );

      client.release();

      const count =
        await dbQuery(
          `
            SELECT likes_count
            FROM dekhoearn_videos
            WHERE id = $1
          `,
          [videoId]
        );

      return sendSuccess(
        res,
        {
          liked,
          likes_count:
            safeInt(
              count.rows[0]
                ?.likes_count
            )
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "LIKE ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update like"
      );
    }
  }
);

/* ======================================================
   GET COMMENTS
====================================================== */

app.get(
  "/api/videos/:id/comments",
  optionalAuth,
  async (req, res) => {
    try {
      const videoId =
        safeInt(req.params.id);

      const result =
        await dbQuery(
          `
            SELECT
              c.id,
              c.video_id,
              c.user_id,
              c.comment,
              c.created_at,
              u.name,
              u.username,
              u.avatar_url
            FROM dekhoearn_comments c
            JOIN dekhoearn_users u
              ON u.id = c.user_id
            WHERE c.video_id = $1
            ORDER BY c.created_at DESC
            LIMIT 100
          `,
          [videoId]
        );

      return sendSuccess(
        res,
        {
          comments:
            result.rows.map(
              row => ({
                id: row.id,
                video_id:
                  row.video_id,
                user_id:
                  row.user_id,
                comment:
                  row.comment,
                created_at:
                  row.created_at,
                user: {
                  id: row.user_id,
                  name:
                    row.name || "",
                  username:
                    row.username ||
                    "",
                  avatar_url:
                    row.avatar_url ||
                    ""
                }
              })
            )
        }
      );
    } catch (error) {
      console.error(
        "COMMENTS GET ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load comments"
      );
    }
  }
);

/* ======================================================
   ADD COMMENT
====================================================== */

app.post(
  "/api/videos/:id/comments",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        safeInt(req.params.id);

      const comment =
        cleanString(
          req.body.comment ||
          req.body.text ||
          "",
          1000
        );

      if (!comment) {
        return sendError(
          res,
          400,
          "Comment cannot be empty"
        );
      }

      const video =
        await dbQuery(
          `
            SELECT id
            FROM dekhoearn_videos
            WHERE id = $1
            LIMIT 1
          `,
          [videoId]
        );

      if (!video.rows.length) {
        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      const result =
        await dbQuery(
          `
            INSERT INTO dekhoearn_comments
            (
              video_id,
              user_id,
              comment
            )
            VALUES
            ($1,$2,$3)
            RETURNING *
          `,
          [
            videoId,
            req.user.id,
            comment
          ]
        );

      await dbQuery(
        `
          UPDATE dekhoearn_videos
          SET comments_count =
            COALESCE(comments_count, 0) + 1
          WHERE id = $1
        `,
        [videoId]
      );

      return sendSuccess(
        res,
        {
          comment:
            result.rows[0]
        }
      );
    } catch (error) {
      console.error(
        "COMMENT ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to add comment"
      );
    }
  }
);

/* ======================================================
   REPORT VIDEO
====================================================== */

app.post(
  "/api/videos/:id/report",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        safeInt(req.params.id);

      const reason =
        cleanString(
          req.body.reason ||
          "Community report",
          500
        );

      const video =
        await dbQuery(
          `
            SELECT id
            FROM dekhoearn_videos
            WHERE id = $1
            LIMIT 1
          `,
          [videoId]
        );

      if (!video.rows.length) {
        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      const result =
        await dbQuery(
          `
            INSERT INTO dekhoearn_reports
            (
              video_id,
              user_id,
              reason
            )
            VALUES
            ($1,$2,$3)
            ON CONFLICT
            (
              video_id,
              user_id
            )
            DO NOTHING
            RETURNING *
          `,
          [
            videoId,
            req.user.id,
            reason
          ]
        );

      if (!result.rows.length) {
        return sendSuccess(
          res,
          {
            already_reported:
              true,
            message:
              "You have already reported this video"
          }
        );
      }

      return sendSuccess(
        res,
        {
          reported: true,
          message:
            "Report submitted"
        }
      );
    } catch (error) {
      console.error(
        "REPORT ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to submit report"
      );
    }
  }
);

/* ======================================================
   FOLLOW / SUBSCRIBE
====================================================== */

app.post(
  "/api/follow/:creatorId",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const creatorId =
        safeInt(
          req.params.creatorId
        );

      if (
        String(creatorId) ===
        String(req.user.id)
      ) {
        client.release();

        return sendError(
          res,
          400,
          "You cannot follow yourself"
        );
      }

      await client.query(
        "BEGIN"
      );

      const creator =
        await client.query(
          `
            SELECT id
            FROM dekhoearn_users
            WHERE id = $1
            FOR UPDATE
          `,
          [creatorId]
        );

      if (!creator.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        client.release();

        return sendError(
          res,
          404,
          "Creator not found"
        );
      }

      const existing =
        await client.query(
          `
            SELECT id
            FROM dekhoearn_follows
            WHERE follower_id = $1
              AND following_id = $2
            LIMIT 1
          `,
          [
            req.user.id,
            creatorId
          ]
        );

      let following = false;

      if (existing.rows.length) {
        await client.query(
          `
            DELETE FROM dekhoearn_follows
            WHERE follower_id = $1
              AND following_id = $2
          `,
          [
            req.user.id,
            creatorId
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET followers_count =
              GREATEST(
                COALESCE(
                  followers_count,
                  0
                ) - 1,
                0
              )
            WHERE id = $1
          `,
          [creatorId]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET following_count =
              GREATEST(
                COALESCE(
                  following_count,
                  0
                ) - 1,
                0
              )
            WHERE id = $1
          `,
          [req.user.id]
        );
      } else {
        await client.query(
          `
            INSERT INTO dekhoearn_follows
            (
              follower_id,
              following_id
            )
            VALUES
            ($1,$2)
            ON CONFLICT
            (
              follower_id,
              following_id
            )
            DO NOTHING
          `,
          [
            req.user.id,
            creatorId
          ]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET followers_count =
              COALESCE(
                followers_count,
                0
              ) + 1
            WHERE id = $1
          `,
          [creatorId]
        );

        await client.query(
          `
            UPDATE dekhoearn_users
            SET following_count =
              COALESCE(
                following_count,
                0
              ) + 1
            WHERE id = $1
          `,
          [req.user.id]
        );

        following = true;
      }

      await client.query(
        "COMMIT"
      );

      client.release();

      const freshCreator =
        await findUserById(
          creatorId
        );

      return sendSuccess(
        res,
        {
          following,
          subscribed:
            following,
          followers_count:
            safeInt(
              freshCreator
                ?.followers_count
            )
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "FOLLOW ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update follow"
      );
    }
  }
);

/* ======================================================
   DAILY REWARD
====================================================== */

app.post(
  "/api/rewards/daily",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const today =
        nowDateOnly();

      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
            INSERT INTO dekhoearn_daily_rewards
            (
              user_id,
              reward_date,
              points
            )
            VALUES
            ($1,$2,$3)
            ON CONFLICT
            (
              user_id,
              reward_date
            )
            DO NOTHING
            RETURNING *
          `,
          [
            req.user.id,
            today,
            DAILY_REWARD
          ]
        );

      if (!result.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        client.release();

        return sendSuccess(
          res,
          {
            claimed: false,
            already_claimed: true,
            points: 0,
            message:
              "Daily reward already claimed"
          }
        );
      }

      await client.query(
        `
          UPDATE dekhoearn_users
          SET points =
            COALESCE(points, 0)
            + $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          DAILY_REWARD,
          req.user.id
        ]
      );

      await client.query(
        `
          INSERT INTO dekhoearn_points_ledger
          (
            user_id,
            amount,
            type,
            description
          )
          VALUES
          ($1,$2,$3,$4)
        `,
        [
          req.user.id,
          DAILY_REWARD,
          "daily",
          "Daily reward"
        ]
      );

      await client.query(
        "COMMIT"
      );

      client.release();

      const user =
        await findUserById(
          req.user.id
        );

      return sendSuccess(
        res,
        {
          claimed: true,
          points:
            DAILY_REWARD,
          balance:
            safeInt(
              user?.points
            )
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "DAILY REWARD ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to claim daily reward"
      );
    }
  }
);

/* ======================================================
   REWARDED AD DEMO
====================================================== */

app.post(
  "/api/rewards/ad",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
          INSERT INTO dekhoearn_rewarded_ads
          (
            user_id,
            points
          )
          VALUES
          ($1,$2)
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS
        ]
      );

      await client.query(
        `
          UPDATE dekhoearn_users
          SET points =
            COALESCE(points, 0)
            + $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          REWARDED_AD_POINTS,
          req.user.id
        ]
      );

      await client.query(
        `
          INSERT INTO dekhoearn_points_ledger
          (
            user_id,
            amount,
            type,
            description
          )
          VALUES
          ($1,$2,$3,$4)
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS,
          "rewarded_ad",
          "Rewarded ad demo"
        ]
      );

      await client.query(
        "COMMIT"
      );

      client.release();

      const user =
        await findUserById(
          req.user.id
        );

      return sendSuccess(
        res,
        {
          rewarded: true,
          points:
            REWARDED_AD_POINTS,
          balance:
            safeInt(
              user?.points
            )
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "REWARDED AD ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to process rewarded ad"
      );
    }
  }
);

/* ======================================================
   POINTS HISTORY
====================================================== */

app.get(
  "/api/points/history",
  requireAuth,
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          safeInt(
            req.query.limit,
            100
          ),
          1
        ),
        200
      );

      const result =
        await dbQuery(
          `
            SELECT
              id,
              amount,
              type,
              description,
              reference_id,
              created_at
            FROM dekhoearn_points_ledger
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          `,
          [
            req.user.id,
            limit
          ]
        );

      return sendSuccess(
        res,
        {
          history:
            result.rows
        }
      );
    } catch (error) {
      console.error(
        "POINTS HISTORY ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load points history"
      );
    }
  }
);

/* ======================================================
   REFERRAL
====================================================== */

app.post(
  "/api/referral",
  requireAuth,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const code =
        cleanString(
          req.body.referral_code ||
          req.body.ref ||
          "",
          100
        );

      if (!code) {
        client.release();

        return sendError(
          res,
          400,
          "Referral code is required"
        );
      }

      const referrer =
        await client.query(
          `
            SELECT *
            FROM dekhoearn_users
            WHERE referral_code = $1
            LIMIT 1
          `,
          [code]
        );

      if (!referrer.rows.length) {
        client.release();

        return sendError(
          res,
          404,
          "Invalid referral code"
        );
      }

      const referrerUser =
        referrer.rows[0];

      if (
        String(
          referrerUser.id
        ) ===
        String(req.user.id)
      ) {
        client.release();

        return sendError(
          res,
          400,
          "You cannot use your own referral code"
        );
      }

      await client.query(
        "BEGIN"
      );

      const already =
        await client.query(
          `
            SELECT id
            FROM dekhoearn_referrals
            WHERE referred_id = $1
            LIMIT 1
          `,
          [req.user.id]
        );

      if (already.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        client.release();

        return sendSuccess(
          res,
          {
            applied: false,
            message:
              "Referral already applied"
          }
        );
      }

      await client.query(
        `
          INSERT INTO dekhoearn_referrals
          (
            referrer_id,
            referred_id,
            reward_points
          )
          VALUES
          ($1,$2,$3)
        `,
        [
          referrerUser.id,
          req.user.id,
          REFERRAL_REWARD
        ]
      );

      await client.query(
        `
          UPDATE dekhoearn_users
          SET referred_by = $1
          WHERE id = $2
        `,
        [
          referrerUser.id,
          req.user.id
        ]
      );

      await client.query(
        `
          UPDATE dekhoearn_users
          SET points =
            COALESCE(points, 0)
            + $1
          WHERE id = $2
        `,
        [
          REFERRAL_REWARD,
          referrerUser.id
        ]
      );

      await client.query(
        `
          INSERT INTO dekhoearn_points_ledger
          (
            user_id,
            amount,
            type,
            description,
            reference_id
          )
          VALUES
          ($1,$2,$3,$4,$5)
        `,
        [
          referrerUser.id,
          REFERRAL_REWARD,
          "referral",
          "Referral reward",
          String(
            req.user.id
          )
        ]
      );

      await client.query(
        "COMMIT"
      );

      client.release();

      return sendSuccess(
        res,
        {
          applied: true,
          points:
            REFERRAL_REWARD
        }
      );
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      client.release();

      console.error(
        "REFERRAL ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to apply referral"
      );
    }
  }
);

/* ======================================================
   CREATOR STATS
====================================================== */

app.get(
  "/api/creator/stats",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await findUserById(
          req.user.id
        );

      const videoStats =
        await dbQuery(
          `
            SELECT
              COUNT(*)::BIGINT AS videos,
              COALESCE(
                SUM(views),
                0
              )::BIGINT AS views,
              COALESCE(
                SUM(likes_count),
                0
              )::BIGINT AS likes,
              COALESCE(
                SUM(comments_count),
                0
              )::BIGINT AS comments,
              COALESCE(
                SUM(watched_seconds),
                0
              )::BIGINT AS watched_seconds
            FROM dekhoearn_videos
            WHERE user_id = $1
          `,
          [req.user.id]
        );

      const earnings =
        await dbQuery(
          `
            SELECT
              COALESCE(
                SUM(gross_amount),
                0
              ) AS gross_amount,
              COALESCE(
                SUM(platform_amount),
                0
              ) AS platform_amount,
              COALESCE(
                SUM(creator_amount),
                0
              ) AS creator_amount
            FROM dekhoearn_creator_earnings
            WHERE creator_id = $1
          `,
          [req.user.id]
        );

      const stats =
        videoStats.rows[0] ||
        {};

      const earning =
        earnings.rows[0] ||
        {};

      const watchHours =
        safeNumber(
          stats.watched_seconds
        ) / 3600;

      return sendSuccess(
        res,
        {
          creator: {
            ...publicUser(user),
            videos:
              safeInt(
                stats.videos
              ),
            views:
              safeInt(
                stats.views
              ),
            likes:
              safeInt(
                stats.likes
              ),
            comments:
              safeInt(
                stats.comments
              ),
            watched_seconds:
              safeInt(
                stats.watched_seconds
              ),
            watch_hours:
              Number(
                watchHours.toFixed(2)
              ),
            gross_amount:
              Number(
                earning.gross_amount ||
                0
              ),
            platform_amount:
              Number(
                earning.platform_amount ||
                0
              ),
            creator_amount:
              Number(
                earning.creator_amount ||
                0
              )
          },

          eligibility: {
            followers_required:
              CREATOR_MIN_FOLLOWERS,

            watch_hours_required:
              CREATOR_MIN_WATCH_HOURS,

            current_followers:
              safeInt(
                user.followers_count
              ),

            current_watch_hours:
              Number(
                watchHours.toFixed(2)
              ),

            eligible:
              safeInt(
                user.followers_count
              ) >=
                CREATOR_MIN_FOLLOWERS &&
              watchHours >=
                CREATOR_MIN_WATCH_HOURS
          }
        }
      );
    } catch (error) {
      console.error(
        "CREATOR STATS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load creator stats"
      );
    }
  }
);

/* ======================================================
   CREATOR APPLY
====================================================== */

app.post(
  "/api/creator/apply",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await findUserById(
          req.user.id
        );

      if (
        user.creator_status ===
        "approved"
      ) {
        return sendSuccess(
          res,
          {
            applied: true,
            status: "approved"
          }
        );
      }

      await dbQuery(
        `
          UPDATE dekhoearn_users
          SET creator_applied = TRUE,
              creator_status = 'pending',
              updated_at = NOW()
          WHERE id = $1
        `,
        [req.user.id]
      );

      return sendSuccess(
        res,
        {
          applied: true,
          status: "pending",
          message:
            "Creator application submitted"
        }
      );
    } catch (error) {
      console.error(
        "CREATOR APPLY ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to submit creator application"
      );
    }
  }
);

/* ======================================================
   CREATOR PAYOUT ACCOUNT FOUNDATION
====================================================== */

app.post(
  "/api/creator/payout",
  requireAuth,
  async (req, res) => {
    try {
      const accountType =
        cleanString(
          req.body.account_type ||
          req.body.type ||
          "",
          50
        );

      const accountName =
        cleanString(
          req.body.account_name ||
          req.body.name ||
          "",
          200
        );

      const accountIdentifier =
        cleanString(
          req.body.account_identifier ||
          req.body.identifier ||
          req.body.account ||
          "",
          500
        );

      if (!accountType) {
        return sendError(
          res,
          400,
          "Account type is required"
        );
      }

      if (!accountIdentifier) {
        return sendError(
          res,
          400,
          "Account identifier is required"
        );
      }

      const result =
        await dbQuery(
          `
            INSERT INTO dekhoearn_payout_accounts
            (
              user_id,
              account_type,
              account_name,
              account_identifier,
              status
            )
            VALUES
            ($1,$2,$3,$4,'pending')
            ON CONFLICT
            (
              user_id
            )
            DO UPDATE SET
              account_type =
                EXCLUDED.account_type,
              account_name =
                EXCLUDED.account_name,
              account_identifier =
                EXCLUDED.account_identifier,
              status = 'pending',
              updated_at = NOW()
            RETURNING
              id,
              user_id,
              account_type,
              account_name,
              account_identifier,
              status,
              created_at,
              updated_at
          `,
          [
            req.user.id,
            accountType,
            accountName,
            accountIdentifier
          ]
        );

      return sendSuccess(
        res,
        {
          payout_account:
            result.rows[0],
          message:
            "Payout account saved"
        }
      );
    } catch (error) {
      console.error(
        "PAYOUT ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to save payout account"
      );
    }
  }
);

/* ======================================================
   CREATOR EARNINGS
====================================================== */

app.get(
  "/api/creator/earnings",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
            SELECT
              *
            FROM dekhoearn_creator_earnings
            WHERE creator_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [req.user.id]
        );

      return sendSuccess(
        res,
        {
          earnings:
            result.rows
        }
      );
    } catch (error) {
      console.error(
        "CREATOR EARNINGS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load creator earnings"
      );
    }
  }
);

/* ======================================================
   USER PROFILE
====================================================== */

app.get(
  "/api/profile",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await findUserById(
          req.user.id
        );

      await ensureReferralCode(
        user
      );

      const freshUser =
        await findUserById(
          req.user.id
        );

      return sendSuccess(
        res,
        {
          user:
            publicUser(
              freshUser
            )
        }
      );
    } catch (error) {
      console.error(
        "PROFILE ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load profile"
      );
    }
  }
);

/* ======================================================
   UPDATE PROFILE
====================================================== */

app.put(
  "/api/profile",
  requireAuth,
  async (req, res) => {
    try {
      const name =
        cleanString(
          req.body.name,
          100
        );

      const avatarUrl =
        cleanString(
          req.body.avatar_url ||
          req.body.avatarUrl ||
          "",
          2000
        );

      if (
        !name &&
        !avatarUrl
      ) {
        return sendError(
          res,
          400,
          "No profile changes provided"
        );
      }

      const result =
        await dbQuery(
          `
            UPDATE dekhoearn_users
            SET
              name =
                CASE
                  WHEN $1 <> ''
                  THEN $1
                  ELSE name
                END,
              avatar_url =
                CASE
                  WHEN $2 <> ''
                  THEN $2
                  ELSE avatar_url
                END,
              updated_at = NOW()
            WHERE id = $3
            RETURNING *
          `,
          [
            name,
            avatarUrl,
            req.user.id
          ]
        );

      return sendSuccess(
        res,
        {
          user:
            publicUser(
              result.rows[0]
            )
        }
      );
    } catch (error) {
      console.error(
        "UPDATE PROFILE ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update profile"
      );
    }
  }
);

/* ======================================================
   GET CREATOR PROFILE
====================================================== */

app.get(
  "/api/creator/:id",
  optionalAuth,
  async (req, res) => {
    try {
      const creatorId =
        safeInt(req.params.id);

      const creator =
        await findUserById(
          creatorId
        );

      if (!creator) {
        return sendError(
          res,
          404,
          "Creator not found"
        );
      }

      const videos =
        await dbQuery(
          `
            SELECT
              v.*,
              u.name,
              u.username,
              u.avatar_url
            FROM dekhoearn_videos v
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            WHERE v.user_id = $1
              AND v.status = 'active'
              AND v.moderation_status != 'removed'
            ORDER BY v.created_at DESC
            LIMIT 100
          `,
          [creatorId]
        );

      let following = false;

      if (req.user) {
        const follow =
          await dbQuery(
            `
              SELECT id
              FROM dekhoearn_follows
              WHERE follower_id = $1
                AND following_id = $2
              LIMIT 1
            `,
            [
              req.user.id,
              creatorId
            ]
          );

        following =
          follow.rows.length > 0;
      }

      return sendSuccess(
        res,
        {
          creator: {
            ...publicUser(
              creator
            ),
            following
          },
          videos:
            videos.rows.map(
              publicVideo
            )
        }
      );
    } catch (error) {
      console.error(
        "CREATOR PROFILE ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load creator"
      );
    }
  }
);

/* ======================================================
   RESEND EMAIL
====================================================== */

async function sendEmail({
  to,
  subject,
  html
}) {
  if (
    !RESEND_API_KEY ||
    !MAIL_FROM
  ) {
    return {
      sent: false,
      reason:
        "Resend is not configured"
    };
  }

  try {
    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${RESEND_API_KEY}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            from: MAIL_FROM,
            to: [to],
            subject,
            html
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "RESEND ERROR:",
        data
      );

      return {
        sent: false,
        error: data
      };
    }

    return {
      sent: true,
      id: data.id
    };
  } catch (error) {
    console.error(
      "EMAIL SEND ERROR:",
      error
    );

    return {
      sent: false,
      error: error.message
    };
  }
}

/* ======================================================
   EMAIL TEST
====================================================== */

app.post(
  "/api/email/test",
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user.email) {
        return sendError(
          res,
          400,
          "No email is attached to this account"
        );
      }

      const result =
        await sendEmail({
          to: req.user.email,
          subject:
            "DekhoEarn Email Test",
          html: `
            <h2>DekhoEarn</h2>
            <p>This is a test email from DekhoEarn.</p>
            <p>APP: ${APP_BASE_URL}</p>
          `
        });

      if (!result.sent) {
        return sendError(
          res,
          503,
          "Email service is not configured"
        );
      }

      return sendSuccess(
        res,
        {
          sent: true
        }
      );
    } catch (error) {
      console.error(
        "EMAIL TEST ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to send test email"
      );
    }
  }
);

/* ======================================================
   ADMIN - USERS
====================================================== */

app.get(
  "/api/admin/users",
  requireAdmin,
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          safeInt(
            req.query.limit,
            100
          ),
          1
        ),
        500
      );

      const result =
        await dbQuery(
          `
            SELECT
              id,
              name,
              username,
              email,
              points,
              followers_count,
              following_count,
              total_watch_seconds,
              total_videos,
              creator_status,
              creator_applied,
              banned,
              created_at
            FROM dekhoearn_users
            ORDER BY created_at DESC
            LIMIT $1
          `,
          [limit]
        );

      return sendSuccess(
        res,
        {
          users:
            result.rows
        }
      );
    } catch (error) {
      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load users"
      );
    }
  }
);

/* ======================================================
   ADMIN - VIDEOS
====================================================== */

app.get(
  "/api/admin/videos",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
            SELECT
              v.*,
              u.name,
              u.username
            FROM dekhoearn_videos v
            JOIN dekhoearn_users u
              ON u.id = v.user_id
            ORDER BY v.created_at DESC
            LIMIT 200
          `
        );

      return sendSuccess(
        res,
        {
          videos:
            result.rows.map(
              publicVideo
            )
        }
      );
    } catch (error) {
      console.error(
        "ADMIN VIDEOS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load admin videos"
      );
    }
  }
);

/* ======================================================
   ADMIN - REPORTS
====================================================== */

app.get(
  "/api/admin/reports",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
            SELECT
              r.*,
              v.title,
              v.video_url,
              u.name AS reporter_name,
              u.username AS reporter_username
            FROM dekhoearn_reports r
            JOIN dekhoearn_videos v
              ON v.id = r.video_id
            JOIN dekhoearn_users u
              ON u.id = r.user_id
            ORDER BY r.created_at DESC
            LIMIT 500
          `
        );

      return sendSuccess(
        res,
        {
          reports:
            result.rows
        }
      );
    } catch (error) {
      console.error(
        "ADMIN REPORTS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load reports"
      );
    }
  }
);

/* ======================================================
   ADMIN - REMOVE VIDEO
====================================================== */

app.delete(
  "/api/admin/videos/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const videoId =
        safeInt(req.params.id);

      const result =
        await dbQuery(
          `
            UPDATE dekhoearn_videos
            SET
              status = 'removed',
              moderation_status = 'removed',
              updated_at = NOW()
            WHERE id = $1
            RETURNING id
          `,
          [videoId]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "Video not found"
        );
      }

      await dbQuery(
        `
          INSERT INTO dekhoearn_admin_actions
          (
            admin_identifier,
            action,
            target_type,
            target_id,
            reason
          )
          VALUES
          ($1,$2,$3,$4,$5)
        `,
        [
          "admin",
          "remove_video",
          "video",
          String(videoId),
          cleanString(
            req.body?.reason ||
            req.query?.reason ||
            "Admin moderation",
            500
          )
        ]
      );

      return sendSuccess(
        res,
        {
          removed: true
        }
      );
    } catch (error) {
      console.error(
        "ADMIN REMOVE VIDEO ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to remove video"
      );
    }
  }
);

/* ======================================================
   ADMIN - BAN USER
====================================================== */

app.post(
  "/api/admin/users/:id/ban",
  requireAdmin,
  async (req, res) => {
    try {
      const userId =
        safeInt(req.params.id);

      const banned =
        req.body.banned === undefined
          ? true
          : Boolean(
              req.body.banned
            );

      const result =
        await dbQuery(
          `
            UPDATE dekhoearn_users
            SET banned = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, banned
          `,
          [
            banned,
            userId
          ]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "User not found"
        );
      }

      await dbQuery(
        `
          INSERT INTO dekhoearn_admin_actions
          (
            admin_identifier,
            action,
            target_type,
            target_id,
            reason
          )
          VALUES
          ($1,$2,$3,$4,$5)
        `,
        [
          "admin",
          banned
            ? "ban_user"
            : "unban_user",
          "user",
          String(userId),
          cleanString(
            req.body.reason ||
            "",
            500
          )
        ]
      );

      return sendSuccess(
        res,
        {
          user:
            result.rows[0]
        }
      );
    } catch (error) {
      console.error(
        "ADMIN BAN ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update user"
      );
    }
  }
);

/* ======================================================
   ADMIN - CREATOR APPROVAL
====================================================== */

app.post(
  "/api/admin/creators/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const userId =
        safeInt(req.params.id);

      const status =
        cleanString(
          req.body.status,
          50
        );

      const allowed = [
        "user",
        "pending",
        "approved",
        "rejected"
      ];

      if (!allowed.includes(status)) {
        return sendError(
          res,
          400,
          "Invalid creator status"
        );
      }

      const result =
        await dbQuery(
          `
            UPDATE dekhoearn_users
            SET
              creator_status = $1,
              creator_applied =
                CASE
                  WHEN $1 = 'approved'
                  THEN TRUE
                  ELSE creator_applied
                END,
              updated_at = NOW()
            WHERE id = $2
            RETURNING
              id,
              username,
              creator_status,
              creator_applied
          `,
          [
            status,
            userId
          ]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "User not found"
        );
      }

      return sendSuccess(
        res,
        {
          creator:
            result.rows[0]
        }
      );
    } catch (error) {
      console.error(
        "ADMIN CREATOR STATUS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update creator status"
      );
    }
  }
);

/* ======================================================
   ADMIN - REPORT STATUS
====================================================== */

app.post(
  "/api/admin/reports/:id/status",
  requireAdmin,
  async (req, res) => {
    try {
      const reportId =
        safeInt(req.params.id);

      const status =
        cleanString(
          req.body.status,
          50
        );

      const allowed = [
        "pending",
        "reviewed",
        "dismissed",
        "actioned"
      ];

      if (!allowed.includes(status)) {
        return sendError(
          res,
          400,
          "Invalid report status"
        );
      }

      const result =
        await dbQuery(
          `
            UPDATE dekhoearn_reports
            SET status = $1
            WHERE id = $2
            RETURNING *
          `,
          [
            status,
            reportId
          ]
        );

      if (!result.rows.length) {
        return sendError(
          res,
          404,
          "Report not found"
        );
      }

      return sendSuccess(
        res,
        {
          report:
            result.rows[0]
        }
      );
    } catch (error) {
      console.error(
        "ADMIN REPORT STATUS ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to update report"
      );
    }
  }
);

/* ======================================================
   ADMIN DASHBOARD
====================================================== */

app.get(
  "/api/admin/dashboard",
  requireAdmin,
  async (req, res) => {
    try {
      const [
        users,
        videos,
        reports,
        creators
      ] = await Promise.all([
        dbQuery(
          `
            SELECT COUNT(*)::BIGINT AS count
            FROM dekhoearn_users
          `
        ),

        dbQuery(
          `
            SELECT COUNT(*)::BIGINT AS count
            FROM dekhoearn_videos
          `
        ),

        dbQuery(
          `
            SELECT COUNT(*)::BIGINT AS count
            FROM dekhoearn_reports
            WHERE status = 'pending'
          `
        ),

        dbQuery(
          `
            SELECT COUNT(*)::BIGINT AS count
            FROM dekhoearn_users
            WHERE creator_applied = TRUE
              AND creator_status = 'pending'
          `
        )
      ]);

      return sendSuccess(
        res,
        {
          dashboard: {
            users:
              safeInt(
                users.rows[0]?.count
              ),
            videos:
              safeInt(
                videos.rows[0]?.count
              ),
            pending_reports:
              safeInt(
                reports.rows[0]?.count
              ),
            pending_creators:
              safeInt(
                creators.rows[0]?.count
              )
          }
        }
      );
    } catch (error) {
      console.error(
        "ADMIN DASHBOARD ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load dashboard"
      );
    }
  }
);

/* ======================================================
   CLEAN EXPIRED SESSIONS
====================================================== */

async function cleanupSessions() {
  try {
    if (!pool) {
      return;
    }

    await dbQuery(
      `
        DELETE FROM dekhoearn_sessions
        WHERE expires_at <= NOW()
      `
    );
  } catch (error) {
    console.error(
      "SESSION CLEANUP ERROR:",
      error
    );
  }
}

/* ======================================================
   STATIC FRONTEND
====================================================== */

const publicDir =
  path.join(
    __dirname,
    "public"
  );

app.use(
  express.static(
    publicDir,
    {
      extensions: [
        "html"
      ]
    }
  )
);

/* ======================================================
   PWA MANIFEST FALLBACK
====================================================== */

app.get(
  "/manifest.json",
  (req, res, next) => {
    const manifest =
      path.join(
        publicDir,
        "manifest.json"
      );

    res.sendFile(
      manifest,
      error => {
        if (error) {
          next();
        }
      }
    );
  }
);

/* ======================================================
   SERVICE WORKER
====================================================== */

app.get(
  "/sw.js",
  (req, res, next) => {
    const serviceWorker =
      path.join(
        publicDir,
        "sw.js"
      );

    res.sendFile(
      serviceWorker,
      error => {
        if (error) {
          next();
        }
      }
    );
  }
);

/* ======================================================
   EXPRESS 5 SPA FALLBACK
   IMPORTANT:
   DO NOT USE app.get("*")
====================================================== */

app.get(
  "/{*splat}",
  (req, res, next) => {
    if (
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    const indexFile =
      path.join(
        publicDir,
        "index.html"
      );

    res.sendFile(
      indexFile,
      error => {
        if (error) {
          next(error);
        }
      }
    );
  }
);

/* ======================================================
   404
====================================================== */

app.use(
  (req, res) => {
    return sendError(
      res,
      404,
      "Route not found"
    );
  }
);

/* ======================================================
   ERROR HANDLER
====================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "SERVER ERROR:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return sendError(
      res,
      500,
      "Internal server error"
    );
  }
);

/* ======================================================
   START SERVER
====================================================== */

async function startServer() {
  try {
    await initializeDatabase();

    await cleanupSessions();

    setInterval(
      cleanupSessions,
      6 * 60 * 60 * 1000
    );

    app.listen(
      PORT,
      () => {
        console.log(
          "================================================="
        );

        console.log(
          " DEKHOEARN SERVER v3.1.3"
        );

        console.log(
          ` PORT: ${PORT}`
        );

        console.log(
          ` APP_BASE_URL: ${APP_BASE_URL}`
        );

        console.log(
          ` DATABASE: ${
            DATABASE_URL
              ? "configured"
              : "missing"
          }`
        );

        console.log(
          ` CLOUDINARY: ${
            CLOUDINARY_CLOUD_NAME
              ? "configured"
              : "missing"
          }`
        );

        console.log(
          ` RESEND: ${
            RESEND_API_KEY &&
            MAIL_FROM
              ? "configured"
              : "optional/not configured"
          }`
        );

        console.log(
          ` ADMIN_KEY: ${
            ADMIN_KEY
              ? "configured"
              : "missing"
          }`
        );

        console.log(
          "================================================="
        );

        console.log(
          "DekhoEarn server started successfully."
        );
      }
    );
  } catch (error) {
    console.error(
      "SERVER STARTUP FAILED:",
      error
    );

    process.exit(1);
  }
}

startServer();

/* ======================================================
   PROCESS HANDLERS
====================================================== */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);
