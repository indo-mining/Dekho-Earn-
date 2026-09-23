/*
=========================================================
 DEKHOEARN SERVER
 Version 3.1.2 FINAL
 --------------------------------------------------------
 Stack:
 - Node.js
 - Express
 - PostgreSQL / Neon
 - Cloudinary
 - Render

 Features:
 - Register / Login
 - Auth token
 - User profile
 - Points wallet
 - Video feed
 - Cloudinary signed upload
 - Video metadata
 - Watch reward
 - Watch history
 - Like / Unlike
 - Comments
 - Reports
 - Follow / Unfollow
 - Daily reward
 - Rewarded ad points
 - Referral system
 - Points history
 - Creator profile
 - Creator statistics
 - Creator monetization
 - Creator earnings ledger
 - Payout account foundation
 - My Videos
 - Delete own video
 - Admin moderation
 - Admin users
 - Admin reports
 - Duplicate warning
 - Database migrations
 - Existing database compatibility
 - PWA / static frontend
=========================================================
*/

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();

/* ======================================================
   VERSION / CONFIG
====================================================== */

const SERVER_VERSION = "3.1.2";

const PORT = Number(process.env.PORT || 10000);

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "";

const CLOUDINARY_API_KEY =
  process.env.CLOUDINARY_API_KEY || "";

const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "";

const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER ||
  "dekhoearn/videos";

/* ======================================================
   APP SETTINGS
====================================================== */

const AUTH_TOKEN_DAYS = 30;

const MAX_VIDEO_BYTES =
  100 * 1024 * 1024;

const MIN_WATCH_SECONDS = 10;

const WATCH_REWARD = 1;

const DAILY_REWARD = 10;

const REWARDED_AD_POINTS = 5;

const REFERRAL_REWARD = 10;

/* ======================================================
   EXPRESS
====================================================== */

app.disable("x-powered-by");

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

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

      max: 5,

      idleTimeoutMillis: 30000,

      connectionTimeoutMillis: 10000
    })
  : null;

/* ======================================================
   DATABASE HELPER
====================================================== */

async function dbQuery(
  text,
  params = []
) {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  return pool.query(
    text,
    params
  );
}

/* ======================================================
   BASIC HELPERS
====================================================== */

function randomId() {
  return crypto
    .randomBytes(16)
    .toString("hex");
}

function cleanText(
  value,
  maxLength = 500
) {
  return String(
    value ?? ""
  )
    .trim()
    .slice(0, maxLength);
}

function normalizeUsername(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

function isValidUsername(
  username
) {
  return /^[a-z0-9_.]{3,30}$/.test(
    username
  );
}

function isValidPassword(
  password
) {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    password.length <= 200
  );
}

function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

/* ======================================================
   PASSWORD HASHING
====================================================== */

function hashPassword(
  password
) {
  return new Promise(
    (resolve, reject) => {
      const salt =
        crypto.randomBytes(16);

      crypto.scrypt(
        password,
        salt,
        64,
        {
          N: 16384,
          r: 8,
          p: 1
        },
        (
          error,
          derivedKey
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({
            salt:
              salt.toString("hex"),

            hash:
              derivedKey.toString(
                "hex"
              )
          });
        }
      );
    }
  );
}

function verifyPassword(
  password,
  saltHex,
  hashHex
) {
  return new Promise(
    (resolve, reject) => {
      const salt =
        Buffer.from(
          saltHex,
          "hex"
        );

      crypto.scrypt(
        password,
        salt,
        64,
        {
          N: 16384,
          r: 8,
          p: 1
        },
        (
          error,
          derivedKey
        ) => {
          if (error) {
            reject(error);
            return;
          }

          const stored =
            Buffer.from(
              hashHex,
              "hex"
            );

          if (
            stored.length !==
            derivedKey.length
          ) {
            resolve(false);
            return;
          }

          resolve(
            crypto.timingSafeEqual(
              stored,
              derivedKey
            )
          );
        }
      );
    }
  );
}

/* ======================================================
   AUTH TOKEN
====================================================== */

function createAuthToken() {
  return crypto
    .randomBytes(48)
    .toString("hex");
}

function hashToken(
  token
) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getBearerToken(
  req
) {
  const auth =
    req.headers.authorization ||
    "";

  if (
    !auth ||
    !auth.startsWith(
      "Bearer "
    )
  ) {
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

/* ======================================================
   REFERRAL CODE
====================================================== */

function generateReferralCode() {
  return crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase();
}

/* ======================================================
   SAFE USER
====================================================== */

function safeUser(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    username:
      row.username || "",

    first_name:
      row.first_name || "",

    points:
      safeNumber(
        row.points
      ),

    total_earned:
      safeNumber(
        row.total_earned
      ),

    watched_videos:
      safeNumber(
        row.watched_videos
      ),

    today_earned:
      safeNumber(
        row.today_earned
      ),

    followers_count:
      safeNumber(
        row.followers_count
      ),

    following_count:
      safeNumber(
        row.following_count
      ),

    is_creator:
      Boolean(
        row.is_creator
      ),

    monetization_status:
      row.monetization_status ||
      "not_applied",

    referral_code:
      row.referral_code || "",

    created_at:
      row.created_at || null
  };
}

/* ======================================================
   SAFE VIDEO
====================================================== */

function safeVideo(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    user_id:
      row.user_id || "",

    creator_id:
      row.creator_id ||
      row.user_id ||
      "",

    title:
      row.title || "",

    description:
      row.description || "",

    video_url:
      row.video_url || "",

    thumbnail_url:
      row.thumbnail_url || "",

    cloudinary_public_id:
      row.cloudinary_public_id ||
      "",

    cloudinary_resource_type:
      row.cloudinary_resource_type ||
      "video",

    cloudinary_format:
      row.cloudinary_format ||
      "",

    duration:
      safeNumber(
        row.duration
      ),

    bytes:
      safeNumber(
        row.bytes
      ),

    views:
      safeNumber(
        row.views
      ),

    likes_count:
      safeNumber(
        row.likes_count
      ),

    comments_count:
      safeNumber(
        row.comments_count
      ),

    watch_seconds:
      safeNumber(
        row.watch_seconds
      ),

    status:
      row.status ||
      "published",

    moderation_status:
      row.moderation_status ||
      "normal",

    duplicate_warning:
      Boolean(
        row.duplicate_warning
      ),

    creator_username:
      row.creator_username ||
      "",

    creator_name:
      row.creator_name ||
      "",

    created_at:
      row.created_at || null
  };
}

/* ======================================================
   GET SAFE USER BY ID
====================================================== */

async function getSafeUserById(
  id
) {
  const result =
    await dbQuery(
      `
      SELECT
        u.*,

        (
          SELECT COUNT(*)
          FROM dekhoearn_follows f
          WHERE f.creator_id = u.id
        ) AS followers_count,

        (
          SELECT COUNT(*)
          FROM dekhoearn_follows f
          WHERE f.follower_id = u.id
        ) AS following_count

      FROM dekhoearn_users u

      WHERE u.id = $1

      LIMIT 1
      `,
      [id]
    );

  return safeUser(
    result.rows[0]
  );
}

/* ======================================================
   AUTHENTICATED USER
====================================================== */

async function getAuthenticatedUser(
  req
) {
  const token =
    getBearerToken(req);

  if (!token) {
    return null;
  }

  const tokenHash =
    hashToken(token);

  const result =
    await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users

      WHERE auth_token_hash = $1

      AND (
        auth_token_expires_at IS NULL
        OR auth_token_expires_at > NOW()
      )

      LIMIT 1
      `,
      [tokenHash]
    );

  return result.rows[0] || null;
}

/* ======================================================
   REQUIRE USER
====================================================== */

async function requireUser(
  req,
  res,
  next
) {
  try {
    const user =
      await getAuthenticatedUser(
        req
      );

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required"
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Authentication error"
    });
  }
}

/* ======================================================
   ADMIN
====================================================== */

function requireAdmin(
  req,
  res,
  next
) {
  const provided =
    req.headers["x-admin-key"] ||
    req.query.admin_key ||
    "";

  if (
    !ADMIN_KEY ||
    provided !== ADMIN_KEY
  ) {
    return res.status(403).json({
      ok: false,
      error: "Admin access denied"
    });
  }

  next();
}

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

function cloudinarySignature(
  params
) {
  const sortedKeys =
    Object.keys(params)
      .filter(
        key =>
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ""
      )
      .sort();

  const query =
    sortedKeys
      .map(
        key =>
          `${key}=${params[key]}`
      )
      .join("&");

  return crypto
    .createHash("sha1")
    .update(
      query +
      CLOUDINARY_API_SECRET
    )
    .digest("hex");
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDatabase() {
  console.log(
    "Initializing database..."
  );

  if (!pool) {
    throw new Error(
      "DATABASE_URL is missing"
    );
  }

  /* ====================================================
     USERS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id TEXT PRIMARY KEY,

      username TEXT NOT NULL UNIQUE,

      first_name TEXT DEFAULT '',

      password_hash TEXT,

      password_salt TEXT,

      auth_token_hash TEXT DEFAULT '',

      auth_token_expires_at TIMESTAMPTZ,

      last_login_at TIMESTAMPTZ,

      points BIGINT NOT NULL DEFAULT 0,

      total_earned BIGINT NOT NULL DEFAULT 0,

      watched_videos BIGINT NOT NULL DEFAULT 0,

      today_earned BIGINT NOT NULL DEFAULT 0,

      is_creator BOOLEAN NOT NULL DEFAULT FALSE,

      monetization_status TEXT NOT NULL DEFAULT 'not_applied',

      referral_code TEXT UNIQUE,

      referred_by TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     USER MIGRATIONS
  ==================================================== */

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS first_name TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS password_salt TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS auth_token_hash TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS auth_token_expires_at
    TIMESTAMPTZ
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS last_login_at
    TIMESTAMPTZ
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS points BIGINT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS total_earned BIGINT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS watched_videos BIGINT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS today_earned BIGINT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS is_creator BOOLEAN
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS monetization_status TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS referral_code TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS referred_by TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS created_at
    TIMESTAMPTZ
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS updated_at
    TIMESTAMPTZ
  `);

  await dbQuery(`
    UPDATE dekhoearn_users

    SET
      first_name =
        COALESCE(first_name, ''),

      points =
        COALESCE(points, 0),

      total_earned =
        COALESCE(total_earned, 0),

      watched_videos =
        COALESCE(watched_videos, 0),

      today_earned =
        COALESCE(today_earned, 0),

      is_creator =
        COALESCE(is_creator, FALSE),

      monetization_status =
        COALESCE(
          monetization_status,
          'not_applied'
        ),

      auth_token_hash =
        COALESCE(
          auth_token_hash,
          ''
        ),

      created_at =
        COALESCE(
          created_at,
          NOW()
        ),

      updated_at =
        COALESCE(
          updated_at,
          NOW()
        )
  `);

  /* ====================================================
     VIDEOS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      creator_id TEXT,

      title TEXT NOT NULL,

      description TEXT DEFAULT '',

      video_url TEXT NOT NULL,

      thumbnail_url TEXT DEFAULT '',

      cloudinary_public_id TEXT DEFAULT '',

      cloudinary_resource_type
        TEXT DEFAULT 'video',

      cloudinary_format TEXT DEFAULT '',

      duration NUMERIC(18,3)
        DEFAULT 0,

      bytes BIGINT DEFAULT 0,

      views BIGINT NOT NULL DEFAULT 0,

      likes_count BIGINT NOT NULL DEFAULT 0,

      comments_count BIGINT NOT NULL DEFAULT 0,

      watch_seconds BIGINT NOT NULL DEFAULT 0,

      status TEXT NOT NULL DEFAULT 'published',

      moderation_status
        TEXT NOT NULL DEFAULT 'normal',

      duplicate_warning
        BOOLEAN NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     VIDEO MIGRATIONS
  ==================================================== */

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS creator_id TEXT
  `);

  await dbQuery(`
    UPDATE dekhoearn_videos
    SET creator_id = user_id
    WHERE creator_id IS NULL
       OR creator_id = ''
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    cloudinary_format TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    duration NUMERIC(18,3)
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    bytes BIGINT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    moderation_status TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    duplicate_warning BOOLEAN
  `);

  await dbQuery(`
    UPDATE dekhoearn_videos

    SET
      cloudinary_format =
        COALESCE(
          cloudinary_format,
          ''
        ),

      duration =
        COALESCE(
          duration,
          0
        ),

      bytes =
        COALESCE(
          bytes,
          0
        ),

      moderation_status =
        COALESCE(
          moderation_status,
          'normal'
        ),

      duplicate_warning =
        COALESCE(
          duplicate_warning,
          FALSE
        ),

      updated_at =
        COALESCE(
          updated_at,
          NOW()
        )
  `);

  /* ====================================================
     VIDEO VIEWS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_video_views (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      watch_seconds BIGINT
        NOT NULL DEFAULT 0,

      reward_granted BOOLEAN
        NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(
        user_id,
        video_id
      )
    )
  `);

  /* ====================================================
     LIKES
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_likes (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(
        user_id,
        video_id
      )
    )
  `);

  /* ====================================================
     COMMENTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_comments (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      comment TEXT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     REPORTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_reports (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      reason TEXT DEFAULT '',

      status TEXT NOT NULL
        DEFAULT 'pending',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     FOLLOWS
     IMPORTANT:
     creator_id migration fixes old DB
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_follows (

      id BIGSERIAL PRIMARY KEY,

      follower_id TEXT NOT NULL,

      creator_id TEXT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(
        follower_id,
        creator_id
      )
    )
  `);

  /* ====================================================
     FOLLOW MIGRATIONS
  ==================================================== */

  await dbQuery(`
    ALTER TABLE dekhoearn_follows
    ADD COLUMN IF NOT EXISTS
    follower_id TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_follows
    ADD COLUMN IF NOT EXISTS
    creator_id TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_follows
    ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMPTZ
  `);

  /* ====================================================
     OLD DATABASE COMPATIBILITY

     Older version may have:
     following_id

     Copy old following_id into creator_id.
  ==================================================== */

  const followsColumns =
    await dbQuery(`
      SELECT column_name

      FROM information_schema.columns

      WHERE table_schema = 'public'

      AND table_name =
        'dekhoearn_follows'
    `);

  const followColumnNames =
    new Set(
      followsColumns.rows.map(
        row =>
          row.column_name
      )
    );

  if (
    followColumnNames.has(
      "following_id"
    )
  ) {
    await dbQuery(`
      UPDATE dekhoearn_follows

      SET creator_id =
        following_id

      WHERE (
        creator_id IS NULL
        OR creator_id = ''
      )

      AND following_id IS NOT NULL
    `);
  }

  await dbQuery(`
    UPDATE dekhoearn_follows

    SET created_at =
      COALESCE(
        created_at,
        NOW()
      )

    WHERE created_at IS NULL
  `);

  /* ====================================================
     POINTS LEDGER
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_points_ledger (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      points BIGINT NOT NULL,

      type TEXT NOT NULL,

      reference_id TEXT DEFAULT '',

      description TEXT DEFAULT '',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     DAILY REWARDS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_daily_rewards (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      reward_date DATE NOT NULL,

      points BIGINT NOT NULL
        DEFAULT ${DAILY_REWARD},

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(
        user_id,
        reward_date
      )
    )
  `);

  /* ====================================================
     REWARDED ADS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_rewarded_ads (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      points BIGINT NOT NULL
        DEFAULT ${REWARDED_AD_POINTS},

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     REFERRALS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_referrals (

      id BIGSERIAL PRIMARY KEY,

      referrer_id TEXT NOT NULL,

      referred_id TEXT NOT NULL,

      reward_points BIGINT NOT NULL
        DEFAULT ${REFERRAL_REWARD},

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(
        referred_id
      )
    )
  `);

  /* ====================================================
     CREATOR EARNINGS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_creator_earnings (

      id BIGSERIAL PRIMARY KEY,

      creator_id TEXT NOT NULL,

      video_id BIGINT,

      gross_amount NUMERIC(18,2)
        NOT NULL DEFAULT 0,

      platform_amount NUMERIC(18,2)
        NOT NULL DEFAULT 0,

      creator_amount NUMERIC(18,2)
        NOT NULL DEFAULT 0,

      currency TEXT NOT NULL
        DEFAULT 'INR',

      status TEXT NOT NULL
        DEFAULT 'pending',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     PAYOUT ACCOUNTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_payout_accounts (

      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL UNIQUE,

      account_name TEXT DEFAULT '',

      account_number TEXT DEFAULT '',

      ifsc TEXT DEFAULT '',

      upi_id TEXT DEFAULT '',

      status TEXT NOT NULL
        DEFAULT 'not_verified',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     ADMIN ACTIONS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS
    dekhoearn_admin_actions (

      id BIGSERIAL PRIMARY KEY,

      admin_key_hash TEXT DEFAULT '',

      action TEXT NOT NULL,

      target_type TEXT DEFAULT '',

      target_id TEXT DEFAULT '',

      reason TEXT DEFAULT '',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* ====================================================
     INDEXES
  ==================================================== */

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_videos_created

    ON dekhoearn_videos(
      created_at DESC
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_videos_user

    ON dekhoearn_videos(
      user_id
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_videos_creator

    ON dekhoearn_videos(
      creator_id
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_comments_video

    ON dekhoearn_comments(
      video_id
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_points_user

    ON dekhoearn_points_ledger(
      user_id
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_auth_token

    ON dekhoearn_users(
      auth_token_hash
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_referral_code

    ON dekhoearn_users(
      referral_code
    )
  `);

  console.log(
    "Database initialized successfully."
  );
}

/* ======================================================
   HEALTH
====================================================== */

app.get(
  "/health",
  async (
    req,
    res
  ) => {
    let database = false;

    try {
      await dbQuery(
        "SELECT 1"
      );

      database = true;
    } catch (error) {
      console.error(
        "HEALTH DB ERROR:",
        error.message
      );
    }

    const cloudinary =
      Boolean(
        CLOUDINARY_CLOUD_NAME &&
        CLOUDINARY_API_KEY &&
        CLOUDINARY_API_SECRET
      );

    return res.json({
      ok: true,

      app: "DekhoEarn",

      version:
        SERVER_VERSION,

      status:
        database
          ? "healthy"
          : "degraded",

      database,

      cloudinary,

      timestamp:
        new Date().toISOString()
    });
  }
);

/* ======================================================
   REGISTER
====================================================== */

app.post(
  "/api/auth/register",
  async (
    req,
    res
  ) => {
    let client = null;

    try {
      const firstName =
        cleanText(
          req.body.first_name ||
          req.body.name ||
          "",
          80
        );

      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        req.body.password;

      const referralCode =
        cleanText(
          req.body.referral_code ||
          req.body.referral ||
          "",
          50
        ).toUpperCase();

      if (!firstName) {
        return res.status(400).json({
          ok: false,
          error:
            "First name is required"
        });
      }

      if (
        !isValidUsername(
          username
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Username must be 3-30 characters and use only letters, numbers, underscore or dot"
        });
      }

      if (
        !isValidPassword(
          password
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Password must be at least 6 characters"
        });
      }

      const existing =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE username = $1
          LIMIT 1
          `,
          [username]
        );

      if (
        existing.rows.length
      ) {
        return res.status(409).json({
          ok: false,
          error:
            "Username already exists"
        });
      }

      let referrerId = null;

      if (referralCode) {
        const ref =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE UPPER(referral_code) = $1
            LIMIT 1
            `,
            [referralCode]
          );

        if (
          ref.rows.length
        ) {
          referrerId =
            ref.rows[0].id;
        }
      }

      const userId =
        randomId();

      const passwordData =
        await hashPassword(
          password
        );

      let authToken =
        createAuthToken();

      let authTokenHash =
        hashToken(
          authToken
        );

      let referralCodeNew =
        generateReferralCode();

      let referralExists =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE referral_code = $1
          LIMIT 1
          `,
          [referralCodeNew]
        );

      while (
        referralExists.rows.length
      ) {
        referralCodeNew =
          generateReferralCode();

        referralExists =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code = $1
            LIMIT 1
            `,
            [referralCodeNew]
          );
      }

      client =
        await pool.connect();

      try {
        await client.query(
          "BEGIN"
        );

        const inserted =
          await client.query(
            `
            INSERT INTO
            dekhoearn_users (

              id,

              username,

              first_name,

              password_hash,

              password_salt,

              auth_token_hash,

              auth_token_expires_at,

              last_login_at,

              referral_code,

              referred_by

            )

            VALUES (

              $1,

              $2,

              $3,

              $4,

              $5,

              $6,

              NOW() +
              INTERVAL '${AUTH_TOKEN_DAYS} days',

              NOW(),

              $7,

              $8

            )

            RETURNING *
            `,
            [
              userId,
              username,
              firstName,
              passwordData.hash,
              passwordData.salt,
              authTokenHash,
              referralCodeNew,
              referrerId
            ]
          );

        if (
          referrerId
        ) {
          const referral =
            await client.query(
              `
              INSERT INTO
              dekhoearn_referrals (

                referrer_id,

                referred_id,

                reward_points

              )

              VALUES (
                $1,
                $2,
                $3
              )

              ON CONFLICT (
                referred_id
              )

              DO NOTHING

              RETURNING id
              `,
              [
                referrerId,
                userId,
                REFERRAL_REWARD
              ]
            );

          if (
            referral.rows.length
          ) {
            await client.query(
              `
              UPDATE
              dekhoearn_users

              SET
                points =
                  COALESCE(
                    points,
                    0
                  ) +
                  $1,

                total_earned =
                  COALESCE(
                    total_earned,
                    0
                  ) +
                  $1,

                updated_at =
                  NOW()

              WHERE id = $2
              `,
              [
                REFERRAL_REWARD,
                referrerId
              ]
            );

            await client.query(
              `
              INSERT INTO
              dekhoearn_points_ledger (

                user_id,

                points,

                type,

                reference_id,

                description

              )

              VALUES (
                $1,
                $2,
                'referral',
                $3,
                'Referral reward'
              )
              `,
              [
                referrerId,
                REFERRAL_REWARD,
                userId
              ]
            );
          }
        }

        await client.query(
          "COMMIT"
        );

        const user =
          safeUser(
            inserted.rows[0]
          );

        /*
         IMPORTANT:
         Use getSafeUserById only
         AFTER commit.
        */

        let finalUser =
          user;

        try {
          finalUser =
            await getSafeUserById(
              userId
            );
        } catch (
          followCountError
        ) {
          console.error(
            "POST-REGISTER USER READ ERROR:",
            followCountError
          );
        }

        return res.status(201).json({
          ok: true,

          message:
            "Registration successful",

          token:
            authToken,

          user:
            finalUser
        });
      } catch (
        transactionError
      ) {
        try {
          await client.query(
            "ROLLBACK"
          );
        } catch (_) {}

        throw transactionError;
      }
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Registration failed"
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

/* ======================================================
   LOGIN
====================================================== */

app.post(
  "/api/auth/login",
  async (
    req,
    res
  ) => {
    try {
      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        req.body.password;

      if (
        !username ||
        !password
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Username and password are required"
        });
      }

      const result =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users

          WHERE username = $1

          LIMIT 1
          `,
          [username]
        );

      if (
        !result.rows.length
      ) {
        return res.status(401).json({
          ok: false,
          error:
            "Invalid username or password"
        });
      }

      const dbUser =
        result.rows[0];

      if (
        !dbUser.password_hash ||
        !dbUser.password_salt
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Password setup is incomplete. Please register again."
        });
      }

      const valid =
        await verifyPassword(
          password,
          dbUser.password_salt,
          dbUser.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          ok: false,
          error:
            "Invalid username or password"
        });
      }

      const token =
        createAuthToken();

      const tokenHash =
        hashToken(
          token
        );

      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          auth_token_hash = $1,

          auth_token_expires_at =
            NOW() +
            INTERVAL '${AUTH_TOKEN_DAYS} days',

          last_login_at = NOW(),

          updated_at = NOW()

        WHERE id = $2
        `,
        [
          tokenHash,
          dbUser.id
        ]
      );

      const user =
        await getSafeUserById(
          dbUser.id
        );

      return res.json({
        ok: true,

        message:
          "Login successful",

        token,

        user
      });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Login failed"
      });
    }
  }
);

/* ======================================================
   AUTH ME
====================================================== */

app.get(
  "/api/auth/me",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await getSafeUserById(
          req.user.id
        );

      return res.json({
        ok: true,
        user
      });
    } catch (error) {
      console.error(
        "ME ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load account"
      });
    }
  }
);

/* ======================================================
   LOGOUT
====================================================== */

app.post(
  "/api/auth/logout",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          auth_token_hash = '',

          auth_token_expires_at =
            NULL,

          updated_at = NOW()

        WHERE id = $1
        `,
        [req.user.id]
      );

      return res.json({
        ok: true,
        message:
          "Logged out"
      });
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Logout failed"
      });
    }
  }
);

/* ======================================================
   USER PROFILE
====================================================== */

app.get(
  "/api/user/:id",
  async (
    req,
    res
  ) => {
    try {
      const user =
        await getSafeUserById(
          req.params.id
        );

      if (!user) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found"
        });
      }

      return res.json({
        ok: true,
        user
      });
    } catch (error) {
      console.error(
        "USER ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load user"
      });
    }
  }
);

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

app.get(
  "/api/cloudinary/signature",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
      ) {
        return res.status(503).json({
          ok: false,
          error:
            "Cloudinary is not configured"
        });
      }

      const timestamp =
        Math.floor(
          Date.now() / 1000
        );

      const folder =
        CLOUDINARY_FOLDER;

      const params = {
        folder,
        timestamp
      };

      const signature =
        cloudinarySignature(
          params
        );

      return res.json({
        ok: true,

        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        folder,

        resource_type:
          "video"
      });
    } catch (error) {
      console.error(
        "CLOUDINARY SIGNATURE ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to create upload signature"
      });
    }
  }
);

/* ======================================================
   VIDEO FEED
====================================================== */

app.get(
  "/api/videos",
  async (
    req,
    res
  ) => {
    try {
      const creatorId =
        cleanText(
          req.query.creator_id ||
          "",
          100
        );

      const mine =
        String(
          req.query.mine ||
          ""
        ) === "true";

      let user = null;

      if (mine) {
        try {
          user =
            await getAuthenticatedUser(
              req
            );
        } catch (_) {}
      }

      let result;

      if (creatorId) {
        result =
          await dbQuery(
            `
            SELECT
              v.*,

              u.username
                AS creator_username,

              u.first_name
                AS creator_name

            FROM dekhoearn_videos v

            LEFT JOIN
              dekhoearn_users u
            ON u.id = v.creator_id

            WHERE
              v.creator_id = $1

            AND v.status =
              'published'

            ORDER BY
              v.created_at DESC
            `,
            [creatorId]
          );
      } else if (
        mine &&
        user
      ) {
        result =
          await dbQuery(
            `
            SELECT
              v.*,

              u.username
                AS creator_username,

              u.first_name
                AS creator_name

            FROM dekhoearn_videos v

            LEFT JOIN
              dekhoearn_users u
            ON u.id = v.creator_id

            WHERE
              v.user_id = $1

            ORDER BY
              v.created_at DESC
            `,
            [user.id]
          );
      } else {
        result =
          await dbQuery(
            `
            SELECT
              v.*,

              u.username
                AS creator_username,

              u.first_name
                AS creator_name

            FROM dekhoearn_videos v

            LEFT JOIN
              dekhoearn_users u
            ON u.id = v.creator_id

            WHERE
              v.status = 'published'

            AND (
              v.moderation_status =
                'normal'

              OR v.moderation_status
                IS NULL
            )

            ORDER BY
              v.created_at DESC

            LIMIT 100
            `
          );
      }

      return res.json({
        ok: true,

        videos:
          result.rows.map(
            safeVideo
          )
      });
    } catch (error) {
      console.error(
        "VIDEOS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load videos"
      });
    }
  }
);

/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get(
  "/api/videos/:id",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            u.username
              AS creator_username,

            u.first_name
              AS creator_name

          FROM dekhoearn_videos v

          LEFT JOIN
            dekhoearn_users u
          ON u.id = v.creator_id

          WHERE v.id = $1

          LIMIT 1
          `,
          [req.params.id]
        );

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found"
        });
      }

      return res.json({
        ok: true,

        video:
          safeVideo(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load video"
      });
    }
  }
);

/* ======================================================
   CREATE VIDEO
====================================================== */

app.post(
  "/api/videos",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const title =
        cleanText(
          req.body.title,
          200
        );

      const description =
        cleanText(
          req.body.description,
          2000
        );

      const videoUrl =
        cleanText(
          req.body.video_url,
          2000
        );

      const thumbnailUrl =
        cleanText(
          req.body.thumbnail_url,
          2000
        );

      const publicId =
        cleanText(
          req.body.cloudinary_public_id,
          500
        );

      const resourceType =
        cleanText(
          req.body.cloudinary_resource_type ||
          "video",
          50
        );

      const format =
        cleanText(
          req.body.cloudinary_format ||
          "",
          50
        );

      const duration =
        Math.max(
          0,
          safeNumber(
            req.body.duration
          )
        );

      const bytes =
        Math.max(
          0,
          safeNumber(
            req.body.bytes
          )
        );

      if (!title) {
        return res.status(400).json({
          ok: false,
          error:
            "Video title is required"
        });
      }

      if (!videoUrl) {
        return res.status(400).json({
          ok: false,
          error:
            "Video URL is required"
        });
      }

      if (
        bytes >
        MAX_VIDEO_BYTES
      ) {
        return res.status(413).json({
          ok: false,
          error:
            "Maximum video size is 100MB"
        });
      }

      /* ================================================
         Simple duplicate URL warning
      ================================================= */

      let duplicateWarning =
        false;

      if (videoUrl) {
        const duplicate =
          await dbQuery(
            `
            SELECT id

            FROM dekhoearn_videos

            WHERE video_url = $1

            LIMIT 1
            `,
            [videoUrl]
          );

        duplicateWarning =
          duplicate.rows.length > 0;
      }

      const result =
        await dbQuery(
          `
          INSERT INTO
          dekhoearn_videos (

            user_id,

            creator_id,

            title,

            description,

            video_url,

            thumbnail_url,

            cloudinary_public_id,

            cloudinary_resource_type,

            cloudinary_format,

            duration,

            bytes,

            duplicate_warning

          )

          VALUES (

            $1,

            $1,

            $2,

            $3,

            $4,

            $5,

            $6,

            $7,

            $8,

            $9,

            $10,

            $11

          )

          RETURNING *
          `,
          [
            req.user.id,
            title,
            description,
            videoUrl,
            thumbnailUrl,
            publicId,
            resourceType,
            format,
            duration,
            bytes,
            duplicateWarning
          ]
        );

      return res.status(201).json({
        ok: true,

        message:
          "Video uploaded successfully",

        video:
          safeVideo(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "CREATE VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to save video"
      });
    }
  }
);

/* ======================================================
   DELETE OWN VIDEO
====================================================== */

app.delete(
  "/api/videos/:id",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          DELETE FROM
            dekhoearn_videos

          WHERE id = $1

          AND user_id = $2

          RETURNING id
          `,
          [
            req.params.id,
            req.user.id
          ]
        );

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found or not owned by you"
        });
      }

      return res.json({
        ok: true,
        message:
          "Video deleted successfully"
      });
    } catch (error) {
      console.error(
        "DELETE VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to delete video"
      });
    }
  }
);

/* ======================================================
   WATCH COMPLETE
====================================================== */

app.post(
  "/api/watch/complete",
  requireUser,
  async (
    req,
    res
  ) => {
    const client =
      await pool.connect();

    try {
      const videoId =
        req.body.video_id;

      const watchSeconds =
        Math.max(
          0,
          Math.floor(
            safeNumber(
              req.body.watch_seconds
            )
          )
        );

      if (!videoId) {
        return res.status(400).json({
          ok: false,
          error:
            "Video ID is required"
        });
      }

      if (
        watchSeconds <
        MIN_WATCH_SECONDS
      ) {
        return res.status(400).json({
          ok: false,
          error:
            `Watch at least ${MIN_WATCH_SECONDS} seconds`
        });
      }

      await client.query(
        "BEGIN"
      );

      const video =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_videos

          WHERE id = $1

          LIMIT 1
          `,
          [videoId]
        );

      if (
        !video.rows.length
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          ok: false,
          error:
            "Video not found"
        });
      }

      const existing =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_video_views

          WHERE user_id = $1

          AND video_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            videoId
          ]
        );

      let rewardGranted =
        false;

      if (
        !existing.rows.length
      ) {
        await client.query(
          `
          INSERT INTO
          dekhoearn_video_views (

            user_id,

            video_id,

            watch_seconds,

            reward_granted

          )

          VALUES (
            $1,
            $2,
            $3,
            TRUE
          )
          `,
          [
            req.user.id,
            videoId,
            watchSeconds
          ]
        );

        rewardGranted =
          true;

        await client.query(
          `
          UPDATE dekhoearn_videos

          SET
            views =
              COALESCE(
                views,
                0
              ) + 1,

            watch_seconds =
              COALESCE(
                watch_seconds,
                0
              ) + $1,

            updated_at =
              NOW()

          WHERE id = $2
          `,
          [
            watchSeconds,
            videoId
          ]
        );

        await client.query(
          `
          UPDATE dekhoearn_users

          SET
            points =
              COALESCE(
                points,
                0
              ) + $1,

            total_earned =
              COALESCE(
                total_earned,
                0
              ) + $1,

            watched_videos =
              COALESCE(
                watched_videos,
                0
              ) + 1,

            today_earned =
              COALESCE(
                today_earned,
                0
              ) + $1,

            updated_at =
              NOW()

          WHERE id = $2
          `,
          [
            WATCH_REWARD,
            req.user.id
          ]
        );

        await client.query(
          `
          INSERT INTO
          dekhoearn_points_ledger (

            user_id,

            points,

            type,

            reference_id,

            description

          )

          VALUES (
            $1,
            $2,
            'watch',
            $3,
            'Video watch reward'
          )
          `,
          [
            req.user.id,
            WATCH_REWARD,
            String(
              videoId
            )
          ]
        );
      } else {
        await client.query(
          `
          UPDATE
          dekhoearn_video_views

          SET
            watch_seconds =
              GREATEST(
                watch_seconds,
                $1
              ),

            updated_at =
              NOW()

          WHERE user_id = $2

          AND video_id = $3
          `,
          [
            watchSeconds,
            req.user.id,
            videoId
          ]
        );

        await client.query(
          `
          UPDATE dekhoearn_videos

          SET
            watch_seconds =
              COALESCE(
                watch_seconds,
                0
              ) + $1,

            updated_at =
              NOW()

          WHERE id = $2
          `,
          [
            watchSeconds,
            videoId
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.user.id
        );

      return res.json({
        ok: true,

        reward_granted:
          rewardGranted,

        reward:
          rewardGranted
            ? WATCH_REWARD
            : 0,

        user
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      console.error(
        "WATCH ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to complete watch"
      });
    } finally {
      client.release();
    }
  }
);

/* ======================================================
   WATCH HISTORY
====================================================== */

app.get(
  "/api/user/:id/watch-history",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      if (
        req.params.id !==
        req.user.id
      ) {
        return res.status(403).json({
          ok: false,
          error:
            "Access denied"
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            vv.watch_seconds
              AS user_watch_seconds,

            vv.reward_granted,

            u.username
              AS creator_username,

            u.first_name
              AS creator_name

          FROM dekhoearn_video_views vv

          JOIN
            dekhoearn_videos v
          ON v.id = vv.video_id

          LEFT JOIN
            dekhoearn_users u
          ON u.id = v.creator_id

          WHERE vv.user_id = $1

          ORDER BY
            vv.updated_at DESC

          LIMIT 100
          `,
          [req.user.id]
        );

      return res.json({
        ok: true,

        videos:
          result.rows.map(
            row => ({
              ...safeVideo(row),

              user_watch_seconds:
                safeNumber(
                  row.user_watch_seconds
                ),

              reward_granted:
                Boolean(
                  row.reward_granted
                )
            })
          )
      });
    } catch (error) {
      console.error(
        "WATCH HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load watch history"
      });
    }
  }
);

/* ======================================================
   LIKE TOGGLE
====================================================== */

app.post(
  "/api/videos/:id/like",
  requireUser,
  async (
    req,
    res
  ) => {
    const client =
      await pool.connect();

    try {
      const videoId =
        req.params.id;

      await client.query(
        "BEGIN"
      );

      const existing =
        await client.query(
          `
          SELECT id
          FROM dekhoearn_likes

          WHERE user_id = $1

          AND video_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            videoId
          ]
        );

      let liked;

      if (
        existing.rows.length
      ) {
        await client.query(
          `
          DELETE FROM
            dekhoearn_likes

          WHERE user_id = $1

          AND video_id = $2
          `,
          [
            req.user.id,
            videoId
          ]
        );

        liked = false;

        await client.query(
          `
          UPDATE
            dekhoearn_videos

          SET
            likes_count =
              GREATEST(
                0,
                COALESCE(
                  likes_count,
                  0
                ) - 1
              )

          WHERE id = $1
          `,
          [videoId]
        );
      } else {
        await client.query(
          `
          INSERT INTO
            dekhoearn_likes (
              user_id,
              video_id
            )

          VALUES ($1,$2)

          ON CONFLICT DO NOTHING
          `,
          [
            req.user.id,
            videoId
          ]
        );

        liked = true;

        await client.query(
          `
          UPDATE
            dekhoearn_videos

          SET
            likes_count =
              COALESCE(
                likes_count,
                0
              ) + 1

          WHERE id = $1
          `,
          [videoId]
        );
      }

      const count =
        await client.query(
          `
          SELECT COUNT(*) AS count

          FROM dekhoearn_likes

          WHERE video_id = $1
          `,
          [videoId]
        );

      await client.query(
        "COMMIT"
      );

      return res.json({
        ok: true,

        liked,

        likes_count:
          safeNumber(
            count.rows[0].count
          )
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      console.error(
        "LIKE ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to update like"
      });
    } finally {
      client.release();
    }
  }
);

/* ======================================================
   LIKE STATUS
====================================================== */

app.get(
  "/api/videos/:id/like",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT id

          FROM dekhoearn_likes

          WHERE user_id = $1

          AND video_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            req.params.id
          ]
        );

      return res.json({
        ok: true,

        liked:
          result.rows.length > 0
      });
    } catch (error) {
      console.error(
        "LIKE STATUS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to check like"
      });
    }
  }
);

/* ======================================================
   COMMENTS GET
====================================================== */

app.get(
  "/api/videos/:id/comments",
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            c.id,

            c.comment,

            c.created_at,

            c.user_id,

            u.username,

            u.first_name

          FROM dekhoearn_comments c

          LEFT JOIN
            dekhoearn_users u
          ON u.id = c.user_id

          WHERE c.video_id = $1

          ORDER BY
            c.created_at ASC

          LIMIT 200
          `,
          [req.params.id]
        );

      return res.json({
        ok: true,

        comments:
          result.rows.map(
            row => ({
              id: row.id,

              user_id:
                row.user_id,

              username:
                row.username ||
                "",

              first_name:
                row.first_name ||
                "",

              comment:
                row.comment,

              created_at:
                row.created_at
            })
          )
      });
    } catch (error) {
      console.error(
        "COMMENTS GET ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load comments"
      });
    }
  }
);

/* ======================================================
   COMMENT POST
====================================================== */

app.post(
  "/api/videos/:id/comments",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const comment =
        cleanText(
          req.body.comment,
          1000
        );

      if (!comment) {
        return res.status(400).json({
          ok: false,
          error:
            "Comment cannot be empty"
        });
      }

      const video =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_videos

          WHERE id = $1

          LIMIT 1
          `,
          [req.params.id]
        );

      if (
        !video.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found"
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO
          dekhoearn_comments (

            user_id,

            video_id,

            comment

          )

          VALUES (
            $1,
            $2,
            $3
          )

          RETURNING *
          `,
          [
            req.user.id,
            req.params.id,
            comment
          ]
        );

      await dbQuery(
        `
        UPDATE
          dekhoearn_videos

        SET
          comments_count =
            COALESCE(
              comments_count,
              0
            ) + 1

        WHERE id = $1
        `,
        [req.params.id]
      );

      return res.status(201).json({
        ok: true,

        comment:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "COMMENT POST ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to post comment"
      });
    }
  }
);

/* ======================================================
   REPORT VIDEO
====================================================== */

app.post(
  "/api/videos/:id/report",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const reason =
        cleanText(
          req.body.reason ||
          "Reported by user",
          500
        );

      const existing =
        await dbQuery(
          `
          SELECT id

          FROM dekhoearn_reports

          WHERE user_id = $1

          AND video_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            req.params.id
          ]
        );

      if (
        existing.rows.length
      ) {
        return res.json({
          ok: true,

          duplicate: true,

          message:
            "You have already reported this video"
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO
          dekhoearn_reports (

            user_id,

            video_id,

            reason

          )

          VALUES (
            $1,
            $2,
            $3
          )

          RETURNING id
          `,
          [
            req.user.id,
            req.params.id,
            reason
          ]
        );

      return res.status(201).json({
        ok: true,

        message:
          "Report submitted",

        report_id:
          result.rows[0].id
      });
    } catch (error) {
      console.error(
        "REPORT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to submit report"
      });
    }
  }
);

/* ======================================================
   DAILY REWARD
====================================================== */

app.post(
  "/api/rewards/daily",
  requireUser,
  async (
    req,
    res
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          INSERT INTO
          dekhoearn_daily_rewards (

            user_id,

            reward_date,

            points

          )

          VALUES (
            $1,
            CURRENT_DATE,
            $2
          )

          ON CONFLICT (
            user_id,
            reward_date
          )

          DO NOTHING

          RETURNING id
          `,
          [
            req.user.id,
            DAILY_REWARD
          ]
        );

      if (
        !result.rows.length
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.json({
          ok: true,

          claimed: false,

          reward: 0,

          message:
            "Daily reward already claimed"
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_users

        SET
          points =
            COALESCE(
              points,
              0
            ) + $1,

          total_earned =
            COALESCE(
              total_earned,
              0
            ) + $1,

          today_earned =
            COALESCE(
              today_earned,
              0
            ) + $1,

          updated_at =
            NOW()

        WHERE id = $2
        `,
        [
          DAILY_REWARD,
          req.user.id
        ]
      );

      await client.query(
        `
        INSERT INTO
        dekhoearn_points_ledger (

          user_id,

          points,

          type,

          description

        )

        VALUES (
          $1,
          $2,
          'daily',
          'Daily reward'
        )
        `,
        [
          req.user.id,
          DAILY_REWARD
        ]
      );

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.user.id
        );

      return res.json({
        ok: true,

        claimed: true,

        reward:
          DAILY_REWARD,

        user
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      console.error(
        "DAILY REWARD ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to claim daily reward"
      });
    } finally {
      client.release();
    }
  }
);

/* ======================================================
   REWARDED AD
   Demo / points foundation
====================================================== */

app.post(
  "/api/rewards/ad",
  requireUser,
  async (
    req,
    res
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        INSERT INTO
        dekhoearn_rewarded_ads (

          user_id,

          points

        )

        VALUES (
          $1,
          $2
        )
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS
        ]
      );

      await client.query(
        `
        UPDATE
          dekhoearn_users

        SET
          points =
            COALESCE(
              points,
              0
            ) + $1,

          total_earned =
            COALESCE(
              total_earned,
              0
            ) + $1,

          today_earned =
            COALESCE(
              today_earned,
              0
            ) + $1,

          updated_at =
            NOW()

        WHERE id = $2
        `,
        [
          REWARDED_AD_POINTS,
          req.user.id
        ]
      );

      await client.query(
        `
        INSERT INTO
        dekhoearn_points_ledger (

          user_id,

          points,

          type,

          description

        )

        VALUES (
          $1,
          $2,
          'rewarded_ad',
          'Rewarded ad points'
        )
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS
        ]
      );

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.user.id
        );

      return res.json({
        ok: true,

        reward:
          REWARDED_AD_POINTS,

        user
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      console.error(
        "REWARDED AD ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to give ad reward"
      });
    } finally {
      client.release();
    }
  }
);

/* ======================================================
   POINTS HISTORY
====================================================== */

app.get(
  "/api/points/history",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT *

          FROM
            dekhoearn_points_ledger

          WHERE user_id = $1

          ORDER BY
            created_at DESC

          LIMIT 200
          `,
          [req.user.id]
        );

      return res.json({
        ok: true,

        history:
          result.rows.map(
            row => ({
              id: row.id,

              points:
                safeNumber(
                  row.points
                ),

              type:
                row.type,

              reference_id:
                row.reference_id,

              description:
                row.description,

              created_at:
                row.created_at
            })
          )
      });
    } catch (error) {
      console.error(
        "POINTS HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load points history"
      });
    }
  }
);

/* ======================================================
   CREATOR STATS
====================================================== */

app.get(
  "/api/creator/:id/stats",
  async (
    req,
    res
  ) => {
    try {
      const creatorId =
        req.params.id;

      const userResult =
        await dbQuery(
          `
          SELECT
            id,

            username,

            first_name,

            is_creator,

            monetization_status

          FROM
            dekhoearn_users

          WHERE id = $1

          LIMIT 1
          `,
          [creatorId]
        );

      if (
        !userResult.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Creator not found"
        });
      }

      const stats =
        await dbQuery(
          `
          SELECT

            COUNT(*) AS videos,

            COALESCE(
              SUM(views),
              0
            ) AS views,

            COALESCE(
              SUM(likes_count),
              0
            ) AS likes,

            COALESCE(
              SUM(comments_count),
              0
            ) AS comments,

            COALESCE(
              SUM(watch_seconds),
              0
            ) AS watch_seconds

          FROM
            dekhoearn_videos

          WHERE creator_id = $1

          AND status =
            'published'
          `,
          [creatorId]
        );

      const followers =
        await dbQuery(
          `
          SELECT COUNT(*) AS count

          FROM
            dekhoearn_follows

          WHERE creator_id = $1
          `,
          [creatorId]
        );

      return res.json({
        ok: true,

        creator:
          userResult.rows[0],

        stats: {
          videos:
            safeNumber(
              stats.rows[0].videos
            ),

          views:
            safeNumber(
              stats.rows[0].views
            ),

          likes:
            safeNumber(
              stats.rows[0].likes
            ),

          comments:
            safeNumber(
              stats.rows[0].comments
            ),

          watch_seconds:
            safeNumber(
              stats.rows[0].watch_seconds
            ),

          followers:
            safeNumber(
              followers.rows[0].count
            )
        }
      });
    } catch (error) {
      console.error(
        "CREATOR STATS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load creator stats"
      });
    }
  }
);

/* ======================================================
   CREATOR MONETIZATION APPLY
====================================================== */

app.post(
  "/api/creator/apply",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          monetization_status =
            'pending',

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [req.user.id]
      );

      const user =
        await getSafeUserById(
          req.user.id
        );

      return res.json({
        ok: true,

        message:
          "Creator monetization application submitted",

        user
      });
    } catch (error) {
      console.error(
        "CREATOR APPLY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to apply for monetization"
      });
    }
  }
);

/* ======================================================
   FOLLOW TOGGLE
====================================================== */

app.post(
  "/api/user/:id/follow",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const creatorId =
        req.params.id;

      if (
        creatorId ===
        req.user.id
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "You cannot follow yourself"
        });
      }

      const creator =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users

          WHERE id = $1

          LIMIT 1
          `,
          [creatorId]
        );

      if (
        !creator.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found"
        });
      }

      const existing =
        await dbQuery(
          `
          SELECT id

          FROM
            dekhoearn_follows

          WHERE follower_id = $1

          AND creator_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            creatorId
          ]
        );

      let following;

      if (
        existing.rows.length
      ) {
        await dbQuery(
          `
          DELETE FROM
            dekhoearn_follows

          WHERE follower_id = $1

          AND creator_id = $2
          `,
          [
            req.user.id,
            creatorId
          ]
        );

        following = false;
      } else {
        await dbQuery(
          `
          INSERT INTO
            dekhoearn_follows (

              follower_id,

              creator_id

            )

          VALUES ($1,$2)

          ON CONFLICT DO NOTHING
          `,
          [
            req.user.id,
            creatorId
          ]
        );

        following = true;
      }

      const count =
        await dbQuery(
          `
          SELECT COUNT(*) AS count

          FROM
            dekhoearn_follows

          WHERE creator_id = $1
          `,
          [creatorId]
        );

      return res.json({
        ok: true,

        following,

        followers_count:
          safeNumber(
            count.rows[0].count
          )
      });
    } catch (error) {
      console.error(
        "FOLLOW ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to update follow"
      });
    }
  }
);

/* ======================================================
   FOLLOW STATUS
====================================================== */

app.get(
  "/api/user/:id/follow",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT id

          FROM
            dekhoearn_follows

          WHERE follower_id = $1

          AND creator_id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            req.params.id
          ]
        );

      return res.json({
        ok: true,

        following:
          result.rows.length > 0
      });
    } catch (error) {
      console.error(
        "FOLLOW STATUS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to check follow"
      });
    }
  }
);

/* ======================================================
   PAYOUT ACCOUNT FOUNDATION
====================================================== */

app.post(
  "/api/payout-account",
  requireUser,
  async (
    req,
    res
  ) => {
    try {
      const accountName =
        cleanText(
          req.body.account_name,
          150
        );

      const accountNumber =
        cleanText(
          req.body.account_number,
          100
        );

      const ifsc =
        cleanText(
          req.body.ifsc,
          30
        ).toUpperCase();

      const upiId =
        cleanText(
          req.body.upi_id,
          150
        );

      const result =
        await dbQuery(
          `
          INSERT INTO
          dekhoearn_payout_accounts (

            user_id,

            account_name,

            account_number,

            ifsc,

            upi_id,

            status,

            updated_at

          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'not_verified',
            NOW()
          )

          ON CONFLICT (
            user_id
          )

          DO UPDATE SET

            account_name =
              EXCLUDED.account_name,

            account_number =
              EXCLUDED.account_number,

            ifsc =
              EXCLUDED.ifsc,

            upi_id =
              EXCLUDED.upi_id,

            updated_at =
              NOW()

          RETURNING
            id,
            user_id,
            account_name,
            account_number,
            ifsc,
            upi_id,
            status
          `,
          [
            req.user.id,
            accountName,
            accountNumber,
            ifsc,
            upiId
          ]
        );

      return res.json({
        ok: true,

        payout_account:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "PAYOUT ACCOUNT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to save payout account"
      });
    }
  }
);

/* ======================================================
   ADMIN USERS
====================================================== */

app.get(
  "/api/admin/users",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT

            id,

            username,

            first_name,

            points,

            total_earned,

            watched_videos,

            today_earned,

            is_creator,

            monetization_status,

            created_at,

            last_login_at

          FROM
            dekhoearn_users

          ORDER BY
            created_at DESC

          LIMIT 500
          `
        );

      return res.json({
        ok: true,

        users:
          result.rows.map(
            safeUser
          )
      });
    } catch (error) {
      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load admin users"
      });
    }
  }
);

/* ======================================================
   ADMIN REPORTS
====================================================== */

app.get(
  "/api/admin/reports",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT

            r.*,

            u.username
              AS reporter_username,

            v.title
              AS video_title

          FROM
            dekhoearn_reports r

          LEFT JOIN
            dekhoearn_users u
          ON u.id = r.user_id

          LEFT JOIN
            dekhoearn_videos v
          ON v.id = r.video_id

          ORDER BY
            r.created_at DESC

          LIMIT 500
          `
        );

      return res.json({
        ok: true,

        reports:
          result.rows
      });
    } catch (error) {
      console.error(
        "ADMIN REPORTS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load reports"
      });
    }
  }
);

/* ======================================================
   ADMIN MODERATION
====================================================== */

app.post(
  "/api/admin/videos/:id/moderate",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const action =
        cleanText(
          req.body.action,
          50
        ).toLowerCase();

      const reason =
        cleanText(
          req.body.reason ||
          "",
          500
        );

      let status =
        "published";

      let moderationStatus =
        "normal";

      if (
        action ===
        "remove"
      ) {
        status =
          "removed";

        moderationStatus =
          "removed";
      } else if (
        action ===
        "hide"
      ) {
        status =
          "hidden";

        moderationStatus =
          "hidden";
      } else if (
        action ===
        "restore"
      ) {
        status =
          "published";

        moderationStatus =
          "normal";
      } else if (
        action ===
        "warning"
      ) {
        status =
          "published";

        moderationStatus =
          "warning";
      } else {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid moderation action"
        });
      }

      const result =
        await dbQuery(
          `
          UPDATE
            dekhoearn_videos

          SET
            status = $1,

            moderation_status = $2,

            updated_at = NOW()

          WHERE id = $3

          RETURNING *
          `,
          [
            status,
            moderationStatus,
            req.params.id
          ]
        );

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found"
        });
      }

      const adminKeyHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            ADMIN_KEY
          )
          .digest("hex");

      await dbQuery(
        `
        INSERT INTO
        dekhoearn_admin_actions (

          admin_key_hash,

          action,

          target_type,

          target_id,

          reason

        )

        VALUES (
          $1,
          $2,
          'video',
          $3,
          $4
        )
        `,
        [
          adminKeyHash,
          action,
          String(
            req.params.id
          ),
          reason
        ]
      );

      return res.json({
        ok: true,

        video:
          safeVideo(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "ADMIN MODERATION ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to moderate video"
      });
    }
  }
);

/* ======================================================
   ADMIN BAN / USER STATUS
====================================================== */

app.post(
  "/api/admin/users/:id/action",
  requireAdmin,
  async (
    req,
    res
  ) => {
    try {
      const action =
        cleanText(
          req.body.action,
          50
        ).toLowerCase();

      const reason =
        cleanText(
          req.body.reason ||
          "",
          500
        );

      if (
        action !== "logout"
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Supported action: logout"
        });
      }

      await dbQuery(
        `
        UPDATE
          dekhoearn_users

        SET
          auth_token_hash = '',

          auth_token_expires_at =
            NULL,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [req.params.id]
      );

      const adminKeyHash =
        crypto
          .createHash(
            "sha256"
          )
          .update(
            ADMIN_KEY
          )
          .digest("hex");

      await dbQuery(
        `
        INSERT INTO
        dekhoearn_admin_actions (

          admin_key_hash,

          action,

          target_type,

          target_id,

          reason

        )

        VALUES (
          $1,
          $2,
          'user',
          $3,
          $4
        )
        `,
        [
          adminKeyHash,
          action,
          String(
            req.params.id
          ),
          reason
        ]
      );

      return res.json({
        ok: true,

        message:
          "User session cleared"
      });
    } catch (error) {
      console.error(
        "ADMIN USER ACTION ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to perform admin action"
      });
    }
  }
);

/* ======================================================
   STATIC FRONTEND
====================================================== */

const publicPath =
  path.join(
    __dirname,
    "public"
  );

/*
 If your index.html,
 app.js, style.css,
 manifest.json and sw.js
 are in project root instead
 of /public, this fallback also
 checks root files.
*/

app.use(
  express.static(
    publicPath,
    {
      maxAge: "1h"
    }
  )
);

app.use(
  express.static(
    __dirname,
    {
      maxAge: "1h"
    }
  )
);

/* ======================================================
   SPA FALLBACK
====================================================== */

app.get(
  /.*/,
  (req, res, next) => {
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }
    );

    const publicIndex =
      path.join(
        publicPath,
        "index.html"
      );

    const rootIndex =
      path.join(
        __dirname,
        "index.html"
      );

    const fs =
      require("fs");

    if (
      fs.existsSync(
        publicIndex
      )
    ) {
      return res.sendFile(
        publicIndex
      );
    }

    if (
      fs.existsSync(
        rootIndex
      )
    ) {
      return res.sendFile(
        rootIndex
      );
    }

    return res.status(404).send(
      "DekhoEarn frontend not found"
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

    if (
      res.headersSent
    ) {
      return next(
        error
      );
    }

    return res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });
  }
);

/* ======================================================
   START SERVER
====================================================== */

async function startServer() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 DekhoEarn ${SERVER_VERSION} running on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);
  }
}

/* ======================================================
   GRACEFUL SHUTDOWN
====================================================== */

async function shutdown(
  signal
) {
  console.log(
    `${signal} received. Shutting down...`
  );

  try {
    if (pool) {
      await pool.end();
    }
  } catch (error) {
    console.error(
      "POOL CLOSE ERROR:",
      error
    );
  }

  process.exit(0);
}

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT")
);

/* ======================================================
   START
====================================================== */

startServer();
