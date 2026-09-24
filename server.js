"use strict";

/*
=========================================================
 DEKHOEARN SERVER
 Version 3.1.3 FINAL
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Frontend v3.1.2
 - Secure Bearer Authentication
 - Neon PostgreSQL
 - Cloudinary Signed Video Upload
 - Video Feed
 - Watch Rewards
 - Likes / Comments / Reports
 - Follow System
 - Daily Reward
 - Rewarded Ad Demo
 - Points History
 - Watch History
 - My Videos
 - Creator Dashboard
 - Monetization Foundation
 - Payout Account Foundation
 - Admin Moderation
 - PWA / Static Frontend
 - Existing Database Compatibility
=========================================================
*/

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();

/* ======================================================
   CONFIG
====================================================== */

const SERVER_VERSION = "3.1.3";

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

const AUTH_TOKEN_DAYS = 30;

const MAX_VIDEO_BYTES =
  100 * 1024 * 1024;

const MIN_WATCH_SECONDS = 10;

const WATCH_REWARD = 1;

const DAILY_REWARD = 10;

const REWARDED_AD_POINTS = 5;

const REFERRAL_REWARD = 10;

const CREATOR_MIN_FOLLOWERS = 1000;

const CREATOR_MIN_WATCH_HOURS = 1000;


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

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});


pool.on("error", error => {
  console.error(
    "POSTGRES POOL ERROR:",
    error
  );
});


async function dbQuery(
  text,
  params = []
) {
  return pool.query(
    text,
    params
  );
}


/* ======================================================
   HELPERS
====================================================== */

function randomId(bytes = 16) {
  return crypto
    .randomBytes(bytes)
    .toString("hex");
}


function cleanText(
  value,
  maxLength = 1000
) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}


function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function isValidUsername(value) {
  return /^[a-z0-9_.]{3,30}$/.test(
    value
  );
}


function isValidPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    value.length <= 200
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


function makeReferralCode(
  username
) {
  const base =
    normalizeUsername(username)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase();

  return (
    base +
    randomId(4)
      .slice(0, 6)
      .toUpperCase()
  );
}


function hashAuthToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}


/* ======================================================
   PASSWORD HASHING
====================================================== */

function hashPassword(password) {
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
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({
            salt: salt.toString("hex"),
            hash: derivedKey.toString("hex")
          });
        }
      );
    }
  );
}


function verifyPassword(
  password,
  storedHash,
  storedSalt
) {
  return new Promise(
    (resolve, reject) => {

      if (
        !storedHash ||
        !storedSalt
      ) {
        resolve(false);
        return;
      }

      let salt;

      try {
        salt = Buffer.from(
          storedSalt,
          "hex"
        );
      } catch {
        resolve(false);
        return;
      }

      crypto.scrypt(
        password,
        salt,
        64,
        {
          N: 16384,
          r: 8,
          p: 1
        },
        (error, derivedKey) => {

          if (error) {
            reject(error);
            return;
          }

          const stored =
            Buffer.from(
              storedHash,
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
   AUTH TOKENS
====================================================== */

function createAuthToken() {
  return crypto
    .randomBytes(48)
    .toString("hex");
}


function getBearerToken(req) {

  const authorization =
    String(
      req.headers.authorization || ""
    );

  if (
    authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  /*
   * Optional compatibility header.
   * This is still an actual auth token,
   * NOT a user ID.
   */
  const alternate =
    req.headers["x-auth-token"];

  if (alternate) {
    return String(
      alternate
    ).trim();
  }

  return "";
}


async function getAuthenticatedUser(req) {

  const token =
    getBearerToken(req);

  if (!token) {
    return null;
  }

  const tokenHash =
    hashAuthToken(token);

  const result =
    await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users
      WHERE auth_token_hash = $1
        AND auth_token_expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

  return (
    result.rows[0] ||
    null
  );
}


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
        message:
          "Authentication required."
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
      message:
        "Authentication service error."
    });
  }
}


/* ======================================================
   ADMIN
====================================================== */

function isAdmin(req) {

  if (!ADMIN_KEY) {
    return false;
  }

  const headerKey =
    req.headers["x-admin-key"];

  const bearer =
    String(
      req.headers.authorization || ""
    );

  let provided =
    headerKey
      ? String(headerKey)
      : "";

  if (
    !provided &&
    bearer.startsWith("Bearer ")
  ) {
    provided =
      bearer.slice(7).trim();
  }

  if (!provided) {
    provided =
      String(
        req.query.admin_key || ""
      );
  }

  if (!provided) {
    return false;
  }

  const a =
    Buffer.from(
      provided
    );

  const b =
    Buffer.from(
      ADMIN_KEY
    );

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}


function requireAdmin(
  req,
  res,
  next
) {

  if (!isAdmin(req)) {
    return res.status(403).json({
      ok: false,
      message:
        "Admin access required."
    });
  }

  next();
}


/* ======================================================
   CLOUDINARY
====================================================== */

function cloudinaryConfigured() {
  return Boolean(
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_API_KEY &&
    CLOUDINARY_API_SECRET
  );
}


function cloudinarySignature(
  params
) {

  const stringToSign =
    Object.keys(params)
      .filter(
        key =>
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ""
      )
      .sort()
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

    if (!cloudinaryConfigured()) {

      console.error(
        "CLOUDINARY CONFIGURATION MISSING:",
        {
          cloud_name:
            Boolean(
              CLOUDINARY_CLOUD_NAME
            ),
          api_key:
            Boolean(
              CLOUDINARY_API_KEY
            ),
          api_secret:
            Boolean(
              CLOUDINARY_API_SECRET
            )
        }
      );

      return res.status(500).json({
        ok: false,
        message:
          "Cloudinary is not configured on the server."
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

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        CLOUDINARY_CLOUD_NAME
      )}/video/upload`;

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    console.log(
      "CLOUDINARY SIGNATURE CREATED:",
      {
        userId:
          req.user?.id || null,
        folder,
        timestamp
      }
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
        "video",

      upload_url:
        uploadUrl,

      max_video_bytes:
        MAX_VIDEO_BYTES,

      max_video_mb:
        100
    });

  } catch (error) {

    console.error(
      "CLOUDINARY SIGNATURE ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      message:
        "Unable to create Cloudinary upload signature."
    });
  }
}


/*
 * IMPORTANT:
 * Both GET and POST are supported.
 *
 * Frontend v3.1.2 uses GET.
 */

app.get(
  "/api/cloudinary/signature",
  requireUser,
  cloudinarySignatureHandler
);

app.post(
  "/api/cloudinary/signature",
  requireUser,
  cloudinarySignatureHandler
);


/*
 * Safe diagnostic endpoint.
 * Does NOT expose API secret.
 */

app.get(
  "/api/cloudinary/status",
  (req, res) => {

    return res.json({
      ok: true,
      configured:
        cloudinaryConfigured(),

      cloud_name_present:
        Boolean(
          CLOUDINARY_CLOUD_NAME
        ),

      api_key_present:
        Boolean(
          CLOUDINARY_API_KEY
        ),

      api_secret_present:
        Boolean(
          CLOUDINARY_API_SECRET
        ),

      folder:
        CLOUDINARY_FOLDER,

      resource_type:
        "video",

      max_video_mb:
        100
    });
  }
);


/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDatabase() {

  console.log(
    "Initializing database..."
  );

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing."
    );
  }


  /*
  ======================================================
  USERS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      first_name TEXT,
      password_hash TEXT,
      password_salt TEXT,
      auth_token_hash TEXT,
      auth_token_expires_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,

      points BIGINT NOT NULL DEFAULT 0,
      total_earned BIGINT NOT NULL DEFAULT 0,
      watched_videos BIGINT NOT NULL DEFAULT 0,
      today_earned BIGINT NOT NULL DEFAULT 0,

      followers_count BIGINT NOT NULL DEFAULT 0,
      following_count BIGINT NOT NULL DEFAULT 0,

      total_watch_seconds BIGINT NOT NULL DEFAULT 0,
      total_videos BIGINT NOT NULL DEFAULT 0,

      is_creator BOOLEAN NOT NULL DEFAULT FALSE,

      creator_status TEXT NOT NULL DEFAULT 'none',

      monetization_status TEXT NOT NULL DEFAULT 'not_applied',

      referral_code TEXT UNIQUE,

      referred_by TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  const userColumns = [
    ["first_name", "TEXT"],
    ["password_hash", "TEXT"],
    ["password_salt", "TEXT"],
    ["auth_token_hash", "TEXT"],
    ["auth_token_expires_at", "TIMESTAMPTZ"],
    ["last_login_at", "TIMESTAMPTZ"],
    ["points", "BIGINT NOT NULL DEFAULT 0"],
    ["total_earned", "BIGINT NOT NULL DEFAULT 0"],
    ["watched_videos", "BIGINT NOT NULL DEFAULT 0"],
    ["today_earned", "BIGINT NOT NULL DEFAULT 0"],
    ["followers_count", "BIGINT NOT NULL DEFAULT 0"],
    ["following_count", "BIGINT NOT NULL DEFAULT 0"],
    ["total_watch_seconds", "BIGINT NOT NULL DEFAULT 0"],
    ["total_videos", "BIGINT NOT NULL DEFAULT 0"],
    ["is_creator", "BOOLEAN NOT NULL DEFAULT FALSE"],
    ["creator_status", "TEXT NOT NULL DEFAULT 'none'"],
    ["monetization_status", "TEXT NOT NULL DEFAULT 'not_applied'"],
    ["referral_code", "TEXT"],
    ["referred_by", "TEXT"],
    ["created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"]
  ];

  for (const [
    column,
    type
  ] of userColumns) {

    await dbQuery(
      `
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS ${column} ${type}
      `
    );
  }


  /*
  ======================================================
  VIDEOS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      creator_id TEXT,

      title TEXT NOT NULL,

      description TEXT DEFAULT '',

      video_url TEXT NOT NULL,

      thumbnail_url TEXT DEFAULT '',

      cloudinary_public_id TEXT,

      cloudinary_resource_type TEXT DEFAULT 'video',

      cloudinary_format TEXT,

      duration NUMERIC DEFAULT 0,

      bytes BIGINT DEFAULT 0,

      views BIGINT NOT NULL DEFAULT 0,

      likes_count BIGINT NOT NULL DEFAULT 0,

      comments_count BIGINT NOT NULL DEFAULT 0,

      watch_seconds BIGINT NOT NULL DEFAULT 0,

      status TEXT NOT NULL DEFAULT 'published',

      moderation_status TEXT NOT NULL DEFAULT 'normal',

      duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  const videoColumns = [
    ["creator_id", "TEXT"],
    ["description", "TEXT DEFAULT ''"],
    ["thumbnail_url", "TEXT DEFAULT ''"],
    ["cloudinary_public_id", "TEXT"],
    ["cloudinary_resource_type", "TEXT DEFAULT 'video'"],
    ["cloudinary_format", "TEXT"],
    ["duration", "NUMERIC DEFAULT 0"],
    ["bytes", "BIGINT DEFAULT 0"],
    ["views", "BIGINT NOT NULL DEFAULT 0"],
    ["likes_count", "BIGINT NOT NULL DEFAULT 0"],
    ["comments_count", "BIGINT NOT NULL DEFAULT 0"],
    ["watch_seconds", "BIGINT NOT NULL DEFAULT 0"],
    ["status", "TEXT NOT NULL DEFAULT 'published'"],
    ["moderation_status", "TEXT NOT NULL DEFAULT 'normal'"],
    ["duplicate_warning", "BOOLEAN NOT NULL DEFAULT FALSE"],
    ["created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"]
  ];

  for (const [
    column,
    type
  ] of videoColumns) {

    await dbQuery(
      `
      ALTER TABLE dekhoearn_videos
      ADD COLUMN IF NOT EXISTS ${column} ${type}
      `
    );
  }


  await dbQuery(`
    UPDATE dekhoearn_videos
    SET creator_id = user_id
    WHERE creator_id IS NULL
  `);


  /*
  ======================================================
  VIDEO VIEWS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      watch_seconds INTEGER NOT NULL DEFAULT 0,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);


  const viewColumns = [
    ["watch_seconds", "INTEGER NOT NULL DEFAULT 0"],
    ["reward_granted", "BOOLEAN NOT NULL DEFAULT FALSE"],
    ["created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"]
  ];

  for (const [
    column,
    type
  ] of viewColumns) {

    await dbQuery(
      `
      ALTER TABLE dekhoearn_video_views
      ADD COLUMN IF NOT EXISTS ${column} ${type}
      `
    );
  }


  /*
  ======================================================
  LIKES
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);


  /*
  ======================================================
  COMMENTS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  REPORTS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  FOLLOWS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id TEXT NOT NULL,
      creator_id TEXT,
      following_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  await dbQuery(`
    ALTER TABLE dekhoearn_follows
    ADD COLUMN IF NOT EXISTS creator_id TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_follows
    ADD COLUMN IF NOT EXISTS following_id TEXT
  `);

  await dbQuery(`
    UPDATE dekhoearn_follows
    SET creator_id = following_id
    WHERE creator_id IS NULL
      AND following_id IS NOT NULL
  `);

  await dbQuery(`
    UPDATE dekhoearn_follows
    SET following_id = creator_id
    WHERE following_id IS NULL
      AND creator_id IS NOT NULL
  `);


  /*
  ======================================================
  POINTS LEDGER
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT 'Reward',
      reference_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  DAILY REWARDS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_date DATE NOT NULL,
      points BIGINT NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(user_id, reward_date)
    )
  `);


  /*
  ======================================================
  REWARDED ADS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      points BIGINT NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  REFERRALS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id TEXT,
      referred_id TEXT NOT NULL,
      reward_points BIGINT NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(referred_id)
    )
  `);


  /*
  ======================================================
  CREATOR EARNINGS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id BIGSERIAL PRIMARY KEY,
      creator_id TEXT NOT NULL,
      video_id BIGINT,
      gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      platform_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      creator_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  PAYOUT ACCOUNTS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      account_name TEXT,
      account_type TEXT,
      account_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  ADMIN ACTIONS
  ======================================================
  */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id BIGSERIAL PRIMARY KEY,
      admin_action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  /*
  ======================================================
  INDEXES
  ======================================================
  */

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
    idx_dekhoearn_videos_creator
    ON dekhoearn_videos(creator_id)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_comments_video
    ON dekhoearn_comments(video_id)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_points_user
    ON dekhoearn_points_ledger(user_id, created_at DESC)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_views_user
    ON dekhoearn_video_views(user_id, updated_at DESC)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_auth_token
    ON dekhoearn_users(auth_token_hash)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_referral_code
    ON dekhoearn_users(referral_code)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_reports_video
    ON dekhoearn_reports(video_id)
    `,

    `
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_follows_creator
    ON dekhoearn_follows(creator_id)
    `

  ];

  for (const sql of indexes) {
    try {
      await dbQuery(sql);
    } catch (error) {
      console.warn(
        "INDEX WARNING:",
        error.message
      );
    }
  }


  console.log(
    "Database initialized successfully."
  );
}


/* ======================================================
   HEALTH
====================================================== */

app.get(
  "/health",
  async (req, res) => {

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

    return res.json({
      ok: database,
      app: "DekhoEarn",
      version: SERVER_VERSION,
      database,
      cloudinary:
        cloudinaryConfigured()
    });
  }
);


/* ======================================================
   AUTH REGISTER
====================================================== */

app.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      const firstName =
        cleanText(
          req.body.first_name,
          100
        );

      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        String(
          req.body.password || ""
        );

      const referralCode =
        String(
          req.body.referral_code || ""
        )
          .trim()
          .toUpperCase();

      if (!firstName) {
        return res.status(400).json({
          ok: false,
          message:
            "First name is required."
        });
      }

      if (!isValidUsername(username)) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid username."
        });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({
          ok: false,
          message:
            "Password must be at least 6 characters."
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

      if (existing.rows.length) {
        return res.status(409).json({
          ok: false,
          message:
            "Username already exists."
        });
      }


      const {
        salt,
        hash
      } = await hashPassword(
        password
      );


      let referrer = null;

      if (referralCode) {

        const refResult =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code = $1
            LIMIT 1
            `,
            [referralCode]
          );

        referrer =
          refResult.rows[0] ||
          null;
      }


      const userId =
        randomId(16);

      let generatedReferralCode =
        makeReferralCode(
          username
        );


      for (let i = 0; i < 5; i++) {

        const check =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code = $1
            `,
            [generatedReferralCode]
          );

        if (!check.rows.length) {
          break;
        }

        generatedReferralCode =
          makeReferralCode(
            username
          );
      }


      const token =
        createAuthToken();

      const tokenHash =
        hashAuthToken(token);

      const tokenExpiry =
        new Date(
          Date.now() +
          AUTH_TOKEN_DAYS *
          24 *
          60 *
          60 *
          1000
        );


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_users
          (
            id,
            username,
            first_name,
            password_hash,
            password_salt,
            auth_token_hash,
            auth_token_expires_at,
            last_login_at,
            referral_code,
            referred_by,
            created_at,
            updated_at
          )
          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,NOW(),NOW()
          )
          RETURNING *
          `,
          [
            userId,
            username,
            firstName,
            hash,
            salt,
            tokenHash,
            tokenExpiry,
            generatedReferralCode,
            referrer?.id || null
          ]
        );


      const user =
        result.rows[0];


      /*
      Referral reward
      */

      if (
        referrer &&
        String(referrer.id) !==
        String(user.id)
      ) {

        try {

          await dbQuery(
            `
            INSERT INTO dekhoearn_referrals
            (
              referrer_id,
              referred_id,
              reward_points
            )
            VALUES
            ($1,$2,$3)
            ON CONFLICT (referred_id)
            DO NOTHING
            `,
            [
              referrer.id,
              user.id,
              REFERRAL_REWARD
            ]
          );


          const referral =
            await dbQuery(
              `
              SELECT id
              FROM dekhoearn_referrals
              WHERE referred_id = $1
              LIMIT 1
              `,
              [user.id]
            );


          if (referral.rows.length) {

            await dbQuery(
              `
              UPDATE dekhoearn_users
              SET
                points = points + $1,
                total_earned = total_earned + $1,
                updated_at = NOW()
              WHERE id = $2
              `,
              [
                REFERRAL_REWARD,
                referrer.id
              ]
            );


            await dbQuery(
              `
              INSERT INTO dekhoearn_points_ledger
              (
                user_id,
                points,
                reason,
                reference_id
              )
              VALUES
              ($1,$2,$3,$4)
              `,
              [
                referrer.id,
                REFERRAL_REWARD,
                "Referral reward",
                user.id
              ]
            );
          }

        } catch (error) {

          console.warn(
            "REFERRAL REWARD ERROR:",
            error.message
          );
        }
      }


      return res.status(201).json({
        ok: true,
        token,
        user
      });

    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to create account."
      });
    }
  }
);


/* ======================================================
   AUTH LOGIN
====================================================== */

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        String(
          req.body.password || ""
        );

      if (
        !username ||
        !password
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Username and password required."
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


      const user =
        result.rows[0];


      if (!user) {
        return res.status(401).json({
          ok: false,
          message:
            "Invalid username or password."
        });
      }


      const valid =
        await verifyPassword(
          password,
          user.password_hash,
          user.password_salt
        );


      if (!valid) {
        return res.status(401).json({
          ok: false,
          message:
            "Invalid username or password."
        });
      }


      const token =
        createAuthToken();

      const tokenHash =
        hashAuthToken(token);

      const tokenExpiry =
        new Date(
          Date.now() +
          AUTH_TOKEN_DAYS *
          24 *
          60 *
          60 *
          1000
        );


      const updated =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            auth_token_hash = $1,
            auth_token_expires_at = $2,
            last_login_at = NOW(),
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
          `,
          [
            tokenHash,
            tokenExpiry,
            user.id
          ]
        );


      return res.json({
        ok: true,
        token,
        user:
          updated.rows[0]
      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to login."
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
  async (req, res) => {

    return res.json({
      ok: true,
      user: req.user
    });
  }
);


/* ======================================================
   LOGOUT
====================================================== */

app.post(
  "/api/auth/logout",
  requireUser,
  async (req, res) => {

    try {

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          auth_token_hash = NULL,
          auth_token_expires_at = NULL,
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );


      return res.json({
        ok: true,
        message:
          "Logged out successfully."
      });

    } catch (error) {

      console.error(
        "LOGOUT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Logout failed."
      });
    }
  }
);


/* ======================================================
   GET USER
====================================================== */

app.get(
  "/api/user/:id",
  requireUser,
  async (req, res) => {

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
            followers_count,
            following_count,
            total_watch_seconds,
            total_videos,
            is_creator,
            creator_status,
            monetization_status,
            referral_code,
            created_at
          FROM dekhoearn_users
          WHERE id = $1
          LIMIT 1
          `,
          [req.params.id]
        );


      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "User not found."
        });
      }


      return res.json({
        ok: true,
        user:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "GET USER ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load user."
      });
    }
  }
);


/* ======================================================
   VIDEOS FEED
====================================================== */

app.get(
  "/api/videos",
  requireUser,
  async (req, res) => {

    try {

      const creatorId =
        cleanText(
          req.query.creator_id,
          100
        );

      const mine =
        String(
          req.query.mine || ""
        ) === "1" ||
        String(
          req.query.mine || ""
        ).toLowerCase() === "true";


      let result;


      if (
        creatorId &&
        mine
      ) {

        if (
          String(creatorId) !==
          String(req.user.id)
        ) {
          return res.status(403).json({
            ok: false,
            message:
              "You can only view your own videos here."
          });
        }


        result =
          await dbQuery(
            `
            SELECT
              v.*,
              u.username,
              u.first_name
            FROM dekhoearn_videos v
            LEFT JOIN dekhoearn_users u
              ON u.id = v.creator_id
            WHERE v.creator_id = $1
            ORDER BY v.created_at DESC
            `,
            [creatorId]
          );

      } else if (creatorId) {

        result =
          await dbQuery(
            `
            SELECT
              v.*,
              u.username,
              u.first_name
            FROM dekhoearn_videos v
            LEFT JOIN dekhoearn_users u
              ON u.id = v.creator_id
            WHERE v.creator_id = $1
              AND v.status = 'published'
              AND v.moderation_status = 'normal'
            ORDER BY v.created_at DESC
            `,
            [creatorId]
          );

      } else {

        result =
          await dbQuery(
            `
            SELECT
              v.*,
              u.username,
              u.first_name
            FROM dekhoearn_videos v
            LEFT JOIN dekhoearn_users u
              ON u.id = v.creator_id
            WHERE v.status = 'published'
              AND v.moderation_status = 'normal'
            ORDER BY v.created_at DESC
            LIMIT 100
            `
          );
      }


      return res.json({
        ok: true,
        videos:
          result.rows
      });

    } catch (error) {

      console.error(
        "VIDEOS FEED ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load videos."
      });
    }
  }
);


/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get(
  "/api/videos/:id",
  requireUser,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          videoId
        ) ||
        videoId <= 0
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid video ID."
        });
      }


      const result =
        await dbQuery(
          `
          SELECT
            v.*,
            u.username AS creator_username,
            u.first_name AS creator_first_name,
            u.followers_count AS creator_followers
          FROM dekhoearn_videos v
          LEFT JOIN dekhoearn_users u
            ON u.id = v.creator_id
          WHERE v.id = $1
          LIMIT 1
          `,
          [videoId]
        );


      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


      return res.json({
        ok: true,
        video:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "SINGLE VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load video."
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
  async (req, res) => {

    try {

      const title =
        cleanText(
          req.body.title,
          200
        );

      const description =
        cleanText(
          req.body.description,
          5000
        );

      const videoUrl =
        cleanText(
          req.body.video_url ||
          req.body.url,
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
          1000
        );

      const resourceType =
        cleanText(
          req.body.cloudinary_resource_type ||
          "video",
          50
        );

      const format =
        cleanText(
          req.body.cloudinary_format,
          50
        );

      const duration =
        Math.max(
          0,
          safeNumber(
            req.body.duration,
            0
          )
        );

      const bytes =
        Math.max(
          0,
          safeNumber(
            req.body.bytes,
            0
          )
        );


      if (!title) {
        return res.status(400).json({
          ok: false,
          message:
            "Video title is required."
        });
      }


      if (!videoUrl) {
        return res.status(400).json({
          ok: false,
          message:
            "Video URL is required."
        });
      }


      if (
        bytes >
        MAX_VIDEO_BYTES
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Maximum video size is 100 MB."
        });
      }


      /*
      Duplicate URL warning.
      The upload is not blocked.
      */

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


      const duplicateWarning =
        duplicate.rows.length > 0;


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_videos
          (
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
            duplicate_warning,
            status,
            moderation_status,
            created_at,
            updated_at
          )
          VALUES
          (
            $1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            'published',
            'normal',
            NOW(),
            NOW()
          )
          RETURNING *
          `,
          [
            req.user.id,
            title,
            description,
            videoUrl,
            thumbnailUrl,
            publicId || null,
            resourceType || "video",
            format || null,
            duration,
            bytes,
            duplicateWarning
          ]
        );


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          total_videos =
            COALESCE(total_videos,0) + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );


      return res.status(201).json({
        ok: true,
        message:
          duplicateWarning
            ? "Video uploaded. Duplicate URL warning detected."
            : "Video uploaded successfully.",
        video:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "CREATE VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to save video information."
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
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          videoId
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid video ID."
        });
      }


      const result =
        await dbQuery(
          `
          DELETE FROM dekhoearn_videos
          WHERE id = $1
            AND user_id = $2
          RETURNING id
          `,
          [
            videoId,
            req.user.id
          ]
        );


      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found or you are not the owner."
        });
      }


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          total_videos =
            GREATEST(
              COALESCE(total_videos,0) - 1,
              0
            ),
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );


      return res.json({
        ok: true,
        message:
          "Video deleted successfully."
      });

    } catch (error) {

      console.error(
        "DELETE VIDEO ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to delete video."
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
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const videoId =
        Number(
          req.body.video_id
        );

      const watchSeconds =
        Math.max(
          0,
          Math.floor(
            safeNumber(
              req.body.watch_seconds,
              0
            )
          )
        );


      if (
        !Number.isInteger(
          videoId
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid video ID."
        });
      }


      if (
        watchSeconds <
        MIN_WATCH_SECONDS
      ) {
        return res.status(400).json({
          ok: false,
          message:
            `Watch at least ${MIN_WATCH_SECONDS} seconds.`
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
          FOR UPDATE
          `,
          [videoId]
        );


      if (!video.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


      const existing =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_video_views
          WHERE user_id = $1
            AND video_id = $2
          FOR UPDATE
          `,
          [
            req.user.id,
            videoId
          ]
        );


      let rewardGranted = false;


      if (!existing.rows.length) {

        await client.query(
          `
          INSERT INTO dekhoearn_video_views
          (
            user_id,
            video_id,
            watch_seconds,
            reward_granted,
            created_at,
            updated_at
          )
          VALUES
          ($1,$2,$3,TRUE,NOW(),NOW())
          `,
          [
            req.user.id,
            videoId,
            watchSeconds
          ]
        );


        await client.query(
          `
          UPDATE dekhoearn_videos
          SET
            views = COALESCE(views,0) + 1,
            watch_seconds =
              COALESCE(watch_seconds,0) + $1,
            updated_at = NOW()
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
              COALESCE(points,0) + $1,
            total_earned =
              COALESCE(total_earned,0) + $1,
            watched_videos =
              COALESCE(watched_videos,0) + 1,
            today_earned =
              COALESCE(today_earned,0) + $1,
            total_watch_seconds =
              COALESCE(total_watch_seconds,0) + $2,
            updated_at = NOW()
          WHERE id = $3
          `,
          [
            WATCH_REWARD,
            watchSeconds,
            req.user.id
          ]
        );


        await client.query(
          `
          INSERT INTO dekhoearn_points_ledger
          (
            user_id,
            points,
            reason,
            reference_id
          )
          VALUES
          ($1,$2,$3,$4)
          `,
          [
            req.user.id,
            WATCH_REWARD,
            "Video watch reward",
            String(videoId)
          ]
        );


        rewardGranted = true;

      } else {

        const oldSeconds =
          Number(
            existing.rows[0]
              .watch_seconds || 0
          );

        const newSeconds =
          Math.max(
            oldSeconds,
            watchSeconds
          );

        await client.query(
          `
          UPDATE dekhoearn_video_views
          SET
            watch_seconds = $1,
            updated_at = NOW()
          WHERE user_id = $2
            AND video_id = $3
          `,
          [
            newSeconds,
            req.user.id,
            videoId
          ]
        );


        await client.query(
          `
          UPDATE dekhoearn_videos
          SET
            watch_seconds =
              COALESCE(watch_seconds,0) + $1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [
            Math.max(
              0,
              watchSeconds -
              oldSeconds
            ),
            videoId
          ]
        );
      }


      const updatedUser =
        await client.query(
          `
          SELECT
            id,
            username,
            first_name,
            points,
            total_earned,
            watched_videos,
            today_earned,
            followers_count,
            following_count,
            total_watch_seconds,
            total_videos,
            is_creator,
            creator_status,
            monetization_status,
            referral_code
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );


      await client.query(
        "COMMIT"
      );


      return res.json({
        ok: true,
        reward_granted:
          rewardGranted,
        reward:
          rewardGranted
            ? WATCH_REWARD
            : 0,
        user:
          updatedUser.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(
        "WATCH COMPLETE ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to complete watch reward."
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
  async (req, res) => {

    try {

      if (
        String(req.params.id) !==
        String(req.user.id)
      ) {
        return res.status(403).json({
          ok: false,
          message:
            "You can only view your own watch history."
        });
      }


      const result =
        await dbQuery(
          `
          SELECT
            vv.video_id,
            vv.watch_seconds,
            vv.reward_granted,
            vv.created_at,
            vv.updated_at,
            v.title,
            v.thumbnail_url,
            v.video_url
          FROM dekhoearn_video_views vv
          LEFT JOIN dekhoearn_videos v
            ON v.id = vv.video_id
          WHERE vv.user_id = $1
          ORDER BY vv.updated_at DESC
          LIMIT 100
          `,
          [req.user.id]
        );


      return res.json({
        ok: true,
        history:
          result.rows
      });

    } catch (error) {

      console.error(
        "WATCH HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load watch history."
      });
    }
  }
);


/* ======================================================
   LIKE GET
====================================================== */

app.get(
  "/api/videos/:id/like",
  requireUser,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );


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
            videoId
          ]
        );


      const count =
        await dbQuery(
          `
          SELECT likes_count
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );


      return res.json({
        ok: true,
        liked:
          result.rows.length > 0,
        likes_count:
          Number(
            count.rows[0]?.likes_count || 0
          )
      });

    } catch (error) {

      console.error(
        "LIKE STATUS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load like status."
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
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );


      const video =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );


      if (!video.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


      const existing =
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
            videoId
          ]
        );


      let liked;


      if (existing.rows.length) {

        await dbQuery(
          `
          DELETE FROM dekhoearn_likes
          WHERE user_id = $1
            AND video_id = $2
          `,
          [
            req.user.id,
            videoId
          ]
        );

        liked = false;

        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            likes_count =
              GREATEST(
                COALESCE(likes_count,0)-1,
                0
              ),
            updated_at = NOW()
          WHERE id = $1
          `,
          [videoId]
        );

      } else {

        await dbQuery(
          `
          INSERT INTO dekhoearn_likes
          (
            user_id,
            video_id
          )
          VALUES
          ($1,$2)
          ON CONFLICT
          (
            user_id,
            video_id
          )
          DO NOTHING
          `,
          [
            req.user.id,
            videoId
          ]
        );

        liked = true;

        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            likes_count =
              COALESCE(likes_count,0)+1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [videoId]
        );
      }


      const count =
        await dbQuery(
          `
          SELECT likes_count
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );


      return res.json({
        ok: true,
        liked,
        likes_count:
          Number(
            count.rows[0]?.likes_count || 0
          )
      });

    } catch (error) {

      console.error(
        "LIKE TOGGLE ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to update like."
      });
    }
  }
);


/* ======================================================
   COMMENTS GET
====================================================== */

app.get(
  "/api/videos/:id/comments",
  requireUser,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );


      const result =
        await dbQuery(
          `
          SELECT
            c.id,
            c.user_id,
            c.video_id,
            c.comment,
            c.created_at,
            u.username,
            u.first_name
          FROM dekhoearn_comments c
          LEFT JOIN dekhoearn_users u
            ON u.id = c.user_id
          WHERE c.video_id = $1
          ORDER BY c.created_at DESC
          LIMIT 200
          `,
          [videoId]
        );


      return res.json({
        ok: true,
        comments:
          result.rows
      });

    } catch (error) {

      console.error(
        "COMMENTS GET ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load comments."
      });
    }
  }
);


/* ======================================================
   ADD COMMENT
====================================================== */

app.post(
  "/api/videos/:id/comments",
  requireUser,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );

      const comment =
        cleanText(
          req.body.comment,
          2000
        );


      if (!comment) {
        return res.status(400).json({
          ok: false,
          message:
            "Comment cannot be empty."
        });
      }


      const video =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );


      if (!video.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_comments
        (
          user_id,
          video_id,
          comment
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          req.user.id,
          videoId,
          comment
        ]
      );


      const count =
        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            comments_count =
              COALESCE(comments_count,0)+1,
            updated_at = NOW()
          WHERE id = $1
          RETURNING comments_count
          `,
          [videoId]
        );


      return res.status(201).json({
        ok: true,
        message:
          "Comment added.",
        comments_count:
          Number(
            count.rows[0]?.comments_count || 0
          )
      });

    } catch (error) {

      console.error(
        "ADD COMMENT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to add comment."
      });
    }
  }
);


/* ======================================================
   REPORT
====================================================== */

app.post(
  "/api/videos/:id/report",
  requireUser,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );

      const reason =
        cleanText(
          req.body.reason ||
          "Other",
          500
        );


      const video =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );


      if (!video.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


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
            videoId
          ]
        );


      if (existing.rows.length) {
        return res.status(409).json({
          ok: false,
          message:
            "You have already reported this video."
        });
      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_reports
        (
          user_id,
          video_id,
          reason
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          req.user.id,
          videoId,
          reason
        ]
      );


      return res.status(201).json({
        ok: true,
        message:
          "Report submitted."
      });

    } catch (error) {

      console.error(
        "REPORT ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to submit report."
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
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_daily_rewards
          (
            user_id,
            reward_date,
            points
          )
          VALUES
          (
            $1,
            CURRENT_DATE,
            $2
          )
          ON CONFLICT
          (
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


      if (!result.rows.length) {
        return res.status(409).json({
          ok: false,
          message:
            "Daily reward already claimed today."
        });
      }


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          points =
            COALESCE(points,0)+$1,
          total_earned =
            COALESCE(total_earned,0)+$1,
          today_earned =
            COALESCE(today_earned,0)+$1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          DAILY_REWARD,
          req.user.id
        ]
      );


      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          reason
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          req.user.id,
          DAILY_REWARD,
          "Daily reward"
        ]
      );


      const user =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );


      return res.json({
        ok: true,
        reward:
          DAILY_REWARD,
        user:
          user.rows[0]
      });

    } catch (error) {

      console.error(
        "DAILY REWARD ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to claim daily reward."
      });
    }
  }
);


/* ======================================================
   REWARDED AD DEMO
====================================================== */

app.post(
  "/api/rewards/ad",
  requireUser,
  async (req, res) => {

    try {

      await dbQuery(
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


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          points =
            COALESCE(points,0)+$1,
          total_earned =
            COALESCE(total_earned,0)+$1,
          today_earned =
            COALESCE(today_earned,0)+$1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          REWARDED_AD_POINTS,
          req.user.id
        ]
      );


      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          reason
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS,
          "Rewarded ad demo"
        ]
      );


      const user =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );


      return res.json({
        ok: true,
        reward:
          REWARDED_AD_POINTS,
        user:
          user.rows[0]
      });

    } catch (error) {

      console.error(
        "REWARDED AD ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to add rewarded-ad points."
      });
    }
  }
);


/* ======================================================
   POINTS HISTORY
====================================================== */

app.get(
  "/api/points/history",
  requireUser,
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            id,
            points,
            reason,
            reference_id,
            created_at
          FROM dekhoearn_points_ledger
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 200
          `,
          [req.user.id]
        );


      return res.json({
        ok: true,
        history:
          result.rows
      });

    } catch (error) {

      console.error(
        "POINTS HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load points history."
      });
    }
  }
);


/* ======================================================
   FOLLOW GET
====================================================== */

app.get(
  "/api/user/:id/follow",
  requireUser,
  async (req, res) => {

    try {

      const creatorId =
        String(
          req.params.id
        );


      const result =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_follows
          WHERE follower_id = $1
            AND creator_id = $2
          LIMIT 1
          `,
          [
            req.user.id,
            creatorId
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
        message:
          "Unable to load follow status."
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
  async (req, res) => {

    try {

      const creatorId =
        String(
          req.params.id
        );


      if (
        creatorId ===
        String(req.user.id)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "You cannot follow yourself."
        });
      }


      const creator =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );


      if (!creator.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Creator not found."
        });
      }


      const existing =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_follows
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


      if (existing.rows.length) {

        await dbQuery(
          `
          DELETE FROM dekhoearn_follows
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
          INSERT INTO dekhoearn_follows
          (
            follower_id,
            creator_id,
            following_id
          )
          VALUES
          ($1,$2,$2)
          `,
          [
            req.user.id,
            creatorId
          ]
        );

        following = true;
      }


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          followers_count =
            GREATEST(
              (
                SELECT COUNT(*)
                FROM dekhoearn_follows
                WHERE creator_id = dekhoearn_users.id
              ),
              0
            ),
          updated_at = NOW()
        WHERE id = $1
        `,
        [creatorId]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          following_count =
            GREATEST(
              (
                SELECT COUNT(*)
                FROM dekhoearn_follows
                WHERE follower_id = dekhoearn_users.id
              ),
              0
            ),
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );


      const creatorData =
        await dbQuery(
          `
          SELECT followers_count
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );


      return res.json({
        ok: true,
        following,
        followers_count:
          Number(
            creatorData.rows[0]?.followers_count || 0
          )
      });

    } catch (error) {

      console.error(
        "FOLLOW TOGGLE ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to update follow."
      });
    }
  }
);


/* ======================================================
   CREATOR STATS
====================================================== */

app.get(
  "/api/creator/:id/stats",
  requireUser,
  async (req, res) => {

    try {

      const creatorId =
        String(
          req.params.id
        );


      const userResult =
        await dbQuery(
          `
          SELECT
            id,
            username,
            first_name,
            followers_count,
            following_count,
            total_watch_seconds,
            total_videos,
            creator_status,
            monetization_status,
            is_creator
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );


      if (!userResult.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Creator not found."
        });
      }


      const videoResult =
        await dbQuery(
          `
          SELECT
            COUNT(*) AS total_videos,
            COALESCE(
              SUM(watch_seconds),
              0
            ) AS total_watch_seconds,
            COALESCE(
              SUM(views),
              0
            ) AS total_views
          FROM dekhoearn_videos
          WHERE creator_id = $1
          `,
          [creatorId]
        );


      const earnings =
        await dbQuery(
          `
          SELECT
            COALESCE(
              SUM(creator_amount),
              0
            ) AS creator_amount
          FROM dekhoearn_creator_earnings
          WHERE creator_id = $1
          `,
          [creatorId]
        );


      const user =
        userResult.rows[0];

      const videos =
        videoResult.rows[0];

      const creatorAmount =
        Number(
          earnings.rows[0]
            ?.creator_amount || 0
        );


      const followers =
        Number(
          user.followers_count || 0
        );

      const watchSeconds =
        Number(
          user.total_watch_seconds ||
          videos.total_watch_seconds ||
          0
        );

      const watchHours =
        watchSeconds / 3600;

      const eligible =
        followers >=
          CREATOR_MIN_FOLLOWERS &&
        watchHours >=
          CREATOR_MIN_WATCH_HOURS;


      return res.json({
        ok: true,

        stats: {
          creator_id:
            creatorId,

          username:
            user.username,

          followers,

          total_videos:
            Number(
              videos.total_videos || 0
            ),

          total_views:
            Number(
              videos.total_views || 0
            ),

          total_watch_seconds:
            watchSeconds,

          watch_hours:
            watchHours,

          creator_amount:
            creatorAmount,

          creator_status:
            user.creator_status,

          monetization_status:
            user.monetization_status,

          monetization_eligible:
            eligible,

          eligible
        }
      });

    } catch (error) {

      console.error(
        "CREATOR STATS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load creator dashboard."
      });
    }
  }
);


/* ======================================================
   CREATOR APPLY
====================================================== */

app.post(
  "/api/creator/apply",
  requireUser,
  async (req, res) => {

    try {

      const stats =
        await dbQuery(
          `
          SELECT
            followers_count,
            total_watch_seconds
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );


      const user =
        stats.rows[0];


      if (!user) {
        return res.status(404).json({
          ok: false,
          message:
            "User not found."
        });
      }


      const followers =
        Number(
          user.followers_count || 0
        );

      const watchHours =
        Number(
          user.total_watch_seconds || 0
        ) / 3600;


      if (
        followers <
        CREATOR_MIN_FOLLOWERS ||
        watchHours <
        CREATOR_MIN_WATCH_HOURS
      ) {

        return res.status(400).json({
          ok: false,
          message:
            `Creator eligibility requires ${CREATOR_MIN_FOLLOWERS} followers and ${CREATOR_MIN_WATCH_HOURS} watch hours.`,
          followers,
          watch_hours:
            Number(
              watchHours.toFixed(2)
            )
        });
      }


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            is_creator = TRUE,
            creator_status = 'applied',
            monetization_status = 'pending',
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [req.user.id]
        );


      return res.json({
        ok: true,
        message:
          "Creator application submitted.",
        user:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "CREATOR APPLY ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to submit creator application."
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
  async (req, res) => {

    try {

      const accountName =
        cleanText(
          req.body.account_name,
          150
        );

      const accountType =
        cleanText(
          req.body.account_type,
          50
        );

      const accountReference =
        cleanText(
          req.body.account_reference,
          500
        );


      if (
        !accountName ||
        !accountType ||
        !accountReference
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Payout account information is incomplete."
        });
      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_payout_accounts
          (
            user_id,
            account_name,
            account_type,
            account_reference,
            status,
            updated_at
          )
          VALUES
          ($1,$2,$3,$4,'pending',NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET
            account_name = EXCLUDED.account_name,
            account_type = EXCLUDED.account_type,
            account_reference = EXCLUDED.account_reference,
            status = 'pending',
            updated_at = NOW()
          RETURNING *
          `,
          [
            req.user.id,
            accountName,
            accountType,
            accountReference
          ]
        );


      return res.json({
        ok: true,
        message:
          "Payout account saved.",
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
        message:
          "Unable to save payout account."
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
  async (req, res) => {

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
            followers_count,
            following_count,
            total_videos,
            total_watch_seconds,
            is_creator,
            creator_status,
            monetization_status,
            created_at,
            last_login_at
          FROM dekhoearn_users
          ORDER BY created_at DESC
          LIMIT 500
          `
        );


      return res.json({
        ok: true,
        users:
          result.rows
      });

    } catch (error) {

      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to load users."
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
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            r.*,
            v.title,
            v.video_url,
            u.username,
            u.first_name
          FROM dekhoearn_reports r
          LEFT JOIN dekhoearn_videos v
            ON v.id = r.video_id
          LEFT JOIN dekhoearn_users u
            ON u.id = r.user_id
          ORDER BY r.created_at DESC
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
        message:
          "Unable to load reports."
      });
    }
  }
);


/* ======================================================
   ADMIN VIDEO MODERATION
====================================================== */

app.post(
  "/api/admin/videos/:id/moderate",
  requireAdmin,
  async (req, res) => {

    try {

      const videoId =
        Number(
          req.params.id
        );

      const action =
        cleanText(
          req.body.action,
          50
        ).toLowerCase();


      const allowed = [
        "remove",
        "hide",
        "restore",
        "warning"
      ];


      if (
        !allowed.includes(
          action
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid moderation action."
        });
      }


      let status =
        "published";

      let moderation =
        "normal";

      let duplicateWarning =
        false;


      if (
        action === "remove"
      ) {
        status = "removed";
        moderation = "removed";

      } else if (
        action === "hide"
      ) {
        status = "hidden";
        moderation = "hidden";

      } else if (
        action === "warning"
      ) {
        status = "published";
        moderation = "warning";
        duplicateWarning = true;

      } else if (
        action === "restore"
      ) {
        status = "published";
        moderation = "normal";
      }


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            status = $1,
            moderation_status = $2,
            duplicate_warning =
              CASE
                WHEN $3 = TRUE
                THEN TRUE
                WHEN $4 = TRUE
                THEN FALSE
                ELSE duplicate_warning
              END,
            updated_at = NOW()
          WHERE id = $5
          RETURNING *
          `,
          [
            status,
            moderation,
            duplicateWarning,
            action === "restore",
            videoId
          ]
        );


      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found."
        });
      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          details
        )
        VALUES
        ($1,$2,$3,$4)
        `,
        [
          action,
          "video",
          String(videoId),
          JSON.stringify({
            status,
            moderation_status:
              moderation
          })
        ]
      );


      return res.json({
        ok: true,
        message:
          "Video moderation updated.",
        video:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "ADMIN MODERATION ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to moderate video."
      });
    }
  }
);


/* ======================================================
   ADMIN USER ACTION
====================================================== */

app.post(
  "/api/admin/users/:id/action",
  requireAdmin,
  async (req, res) => {

    try {

      const userId =
        String(
          req.params.id
        );

      const action =
        cleanText(
          req.body.action,
          50
        ).toLowerCase();


      if (
        action !== "logout"
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Unsupported user action."
        });
      }


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            auth_token_hash = NULL,
            auth_token_expires_at = NULL,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, username
          `,
          [userId]
        );


      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          message:
            "User not found."
        });
      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          details
        )
        VALUES
        ($1,$2,$3,$4)
        `,
        [
          action,
          "user",
          userId,
          "Admin action"
        ]
      );


      return res.json({
        ok: true,
        message:
          "User session logged out."
      });

    } catch (error) {

      console.error(
        "ADMIN USER ACTION ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Unable to perform user action."
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


app.use(
  express.static(
    publicPath
  )
);


/*
 * Also serve root-level frontend files
 * if present.
 */

app.use(
  express.static(
    __dirname
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

    const indexPath =
      path.join(
        publicPath,
        "index.html"
      );

    return res.sendFile(
      indexPath,
      error => {

        if (error) {

          /*
           * If public/index.html doesn't exist,
           * try root index.html.
           */

          return res.sendFile(
            path.join(
              __dirname,
              "index.html"
            ),
            secondError => {

              if (secondError) {
                return next(
                  secondError
                );
              }

            }
          );
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

    return res.status(404).json({
      ok: false,
      message:
        "Route not found."
    });
  }
);


/* ======================================================
   ERROR HANDLER
====================================================== */

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      ok: false,
      message:
        "Internal server error."
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

        console.log(
          `Cloudinary configured: ${cloudinaryConfigured()}`
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

    await pool.end();

    console.log(
      "Database pool closed."
    );

    process.exit(0);

  } catch (error) {

    console.error(
      "Shutdown error:",
      error
    );

    process.exit(1);
  }
}


process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);


/* ======================================================
   START
====================================================== */

startServer();
