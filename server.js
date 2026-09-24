/*
=========================================================
 DEKHOEARN SERVER
 Version 3.2.0 FINAL
 --------------------------------------------------------
 Secure Authentication
 Neon PostgreSQL
 Cloudinary Signed Upload
 Video Feed
 Watch Rewards
 Likes / Comments / Reports
 Follow / Subscribe System
 Daily Rewards
 Rewarded Ads Demo
 Points History
 Watch History
 Creator Dashboard
 Monetization Foundation
 Payout Accounts Foundation
 Admin Moderation
 PWA
 Database Migrations
 Referral System
 Existing Database Compatibility
 --------------------------------------------------------
 NEW v3.2.0
 - Recovery Email
 - Forgot Password
 - Reset Password
 - Password reset token hashing
 - Password reset expiry
 - Auth session invalidation after password reset
 - Generic forgot-password response
=========================================================
*/

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

/* ======================================================
   APP CONFIG
====================================================== */

const SERVER_VERSION = "3.2.0";
const APP_NAME = "DekhoEarn";
const APP_TAGLINE = "Dekho. Earn Karo. Reward Lo.";

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

/* ======================================================
   EMAIL / PASSWORD RECOVERY CONFIG
====================================================== */

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || "";

const MAIL_FROM =
  process.env.MAIL_FROM || "";

const APP_BASE_URL =
  process.env.APP_BASE_URL || "";

const PASSWORD_RESET_MINUTES = 30;

/* ======================================================
   AUTH CONFIG
====================================================== */

const AUTH_TOKEN_DAYS = 30;

/* ======================================================
   VIDEO / REWARD CONFIG
====================================================== */

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const MIN_WATCH_SECONDS = 10;

const WATCH_REWARD = 1;

const DAILY_REWARD = 10;

const REWARDED_AD_POINTS = 5;

const REFERRAL_REWARD = 10;

/* ======================================================
   CREATOR CONFIG
====================================================== */

const CREATOR_MIN_FOLLOWERS = 1000;

const CREATOR_MIN_WATCH_HOURS = 1000;

/* ======================================================
   EXPRESS
====================================================== */

const app = express();

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
  console.error("DATABASE_URL is missing.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function dbQuery(text, params = []) {
  return pool.query(text, params);
}

/* ======================================================
   BASIC HELPERS
====================================================== */

function randomId() {
  return crypto.randomUUID();
}

function cleanText(value, max = 500) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_.]{3,30}$/.test(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    password.length <= 200
  );
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeReferralCode(username) {
  const base = normalizeUsername(username)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);

  return (
    base +
    crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()
  ).slice(0, 20);
}

/* ======================================================
   PASSWORD HASHING
====================================================== */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(
      password,
      salt,
      64,
      {
        N: 16384,
        r: 8,
        p: 1
      },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          salt,
          hash: derivedKey.toString("hex")
        });
      }
    );
  });
}

function verifyPassword(password, salt, storedHash) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      64,
      {
        N: 16384,
        r: 8,
        p: 1
      },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }

        const calculated = derivedKey.toString("hex");

        try {
          const a = Buffer.from(calculated, "hex");
          const b = Buffer.from(storedHash, "hex");

          if (a.length !== b.length) {
            resolve(false);
            return;
          }

          resolve(crypto.timingSafeEqual(a, b));
        } catch {
          resolve(false);
        }
      }
    );
  });
}

/* ======================================================
   AUTH TOKEN
====================================================== */

function createAuthToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashAuthToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}

function authExpiryDate() {
  const date = new Date();

  date.setDate(
    date.getDate() + AUTH_TOKEN_DAYS
  );

  return date;
}

/* ======================================================
   PASSWORD RESET TOKEN
====================================================== */

function createPasswordResetToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function hashResetToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token))
    .digest("hex");
}

function passwordResetExpiryDate() {
  return new Date(
    Date.now() +
      PASSWORD_RESET_MINUTES * 60 * 1000
  );
}

function passwordResetConfigured() {
  return Boolean(
    RESEND_API_KEY &&
    MAIL_FROM &&
    APP_BASE_URL
  );
}

/* ======================================================
   EMAIL
====================================================== */

async function sendPasswordResetEmail({
  email,
  username,
  resetToken
}) {
  if (!passwordResetConfigured()) {
    throw new Error(
      "Password reset email service is not configured."
    );
  }

  const base =
    APP_BASE_URL.endsWith("/")
      ? APP_BASE_URL.slice(0, -1)
      : APP_BASE_URL;

  const resetUrl =
    `${base}/?reset_token=${encodeURIComponent(resetToken)}`;

  const safeUsername =
    cleanText(username, 100);

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Reset your DekhoEarn password</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f5f7fb;
  font-family:Arial,sans-serif;
">

<div style="
  max-width:600px;
  margin:30px auto;
  background:#ffffff;
  padding:30px;
  border-radius:14px;
">

<h2 style="margin-top:0;">
  DekhoEarn
</h2>

<p>
  Hello ${safeUsername || "User"},
</p>

<p>
  We received a request to reset your DekhoEarn password.
</p>

<p>
  Click the button below to create a new password.
</p>

<p style="margin:30px 0;">
  <a href="${resetUrl}"
     style="
       display:inline-block;
       background:#111827;
       color:#ffffff;
       text-decoration:none;
       padding:13px 22px;
       border-radius:8px;
       font-weight:bold;
     ">
     Reset Password
  </a>
</p>

<p>
  This link will expire in
  <strong>${PASSWORD_RESET_MINUTES} minutes</strong>.
</p>

<p>
  If you did not request this password reset,
  you can safely ignore this email.
</p>

<hr>

<p style="font-size:12px;color:#777;">
  Dekho. Earn Karo. Reward Lo.
</p>

</div>

</body>
</html>
`;

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${RESEND_API_KEY}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject:
          "Reset your DekhoEarn password",
        html
      })
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Email service failed."
    );
  }

  return data;
}

/* ======================================================
   USER SERIALIZER
====================================================== */

function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    first_name: row.first_name,
    email: row.email || null,
    points: safeNumber(row.points),
    total_earned: safeNumber(row.total_earned),
    watched_videos: safeNumber(row.watched_videos),
    today_earned: safeNumber(row.today_earned),
    followers: safeNumber(row.followers),
    following: safeNumber(row.following),
    total_watch_seconds:
      safeNumber(row.total_watch_seconds),
    total_videos:
      safeNumber(row.total_videos),
    creator_applied:
      Boolean(row.creator_applied),
    creator_status:
      row.creator_status || "none",
    monetization_status:
      row.monetization_status || "not_eligible",
    referral_code:
      row.referral_code || null,
    created_at:
      row.created_at || null
  };
}

/* ======================================================
   AUTH USER
====================================================== */

async function getAuthenticatedUser(req) {
  let token = "";

  const auth =
    req.headers.authorization || "";

  if (
    auth.startsWith("Bearer ")
  ) {
    token = auth.slice(7).trim();
  }

  if (!token) {
    token =
      req.headers["x-auth-token"] || "";
  }

  if (!token) {
    return null;
  }

  const tokenHash =
    hashAuthToken(token);

  const result = await dbQuery(
    `
    SELECT *
    FROM dekhoearn_users
    WHERE auth_token_hash = $1
      AND auth_token_expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function requireUser(req, res, next) {
  try {
    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Authentication required."
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Authentication error."
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

  const auth =
    req.headers.authorization || "";

  let bearerKey = "";

  if (auth.startsWith("Bearer ")) {
    bearerKey =
      auth.slice(7).trim();
  }

  const queryKey =
    req.query.admin_key || "";

  return (
    headerKey === ADMIN_KEY ||
    bearerKey === ADMIN_KEY ||
    queryKey === ADMIN_KEY
  );
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Admin access required."
    });
  }

  next();
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function addColumnIfMissing(
  table,
  column,
  definition
) {
  await dbQuery(`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS
    ${column} ${definition}
  `);
}

async function initDatabase() {
  console.log(
    "Initializing DekhoEarn database..."
  );

  /* ====================================================
     USERS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id UUID PRIMARY KEY,
      username VARCHAR(30) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,

      email VARCHAR(320),

      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,

      auth_token_hash TEXT,
      auth_token_expires_at TIMESTAMPTZ,

      password_reset_token_hash TEXT,
      password_reset_expires_at TIMESTAMPTZ,

      points BIGINT DEFAULT 0,
      total_earned BIGINT DEFAULT 0,
      watched_videos BIGINT DEFAULT 0,
      today_earned BIGINT DEFAULT 0,

      followers BIGINT DEFAULT 0,
      following BIGINT DEFAULT 0,

      total_watch_seconds BIGINT DEFAULT 0,
      total_videos BIGINT DEFAULT 0,

      creator_applied BOOLEAN DEFAULT FALSE,
      creator_status VARCHAR(30) DEFAULT 'none',

      monetization_status VARCHAR(30)
        DEFAULT 'not_eligible',

      referral_code VARCHAR(50) UNIQUE,
      referred_by UUID,

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await addColumnIfMissing(
    "dekhoearn_users",
    "email",
    "VARCHAR(320)"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "password_reset_token_hash",
    "TEXT"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "password_reset_expires_at",
    "TIMESTAMPTZ"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "creator_applied",
    "BOOLEAN DEFAULT FALSE"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "creator_status",
    "VARCHAR(30) DEFAULT 'none'"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "monetization_status",
    "VARCHAR(30) DEFAULT 'not_eligible'"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "total_watch_seconds",
    "BIGINT DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_users",
    "total_videos",
    "BIGINT DEFAULT 0"
  );

  /* ====================================================
     VIDEOS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',

      video_url TEXT NOT NULL,
      cloudinary_public_id TEXT,
      cloudinary_resource_type TEXT DEFAULT 'video',

      views BIGINT DEFAULT 0,
      likes BIGINT DEFAULT 0,
      comments BIGINT DEFAULT 0,
      watched_seconds BIGINT DEFAULT 0,

      status VARCHAR(30) DEFAULT 'active',
      moderation_status VARCHAR(30)
        DEFAULT 'pending',

      duplicate_warning BOOLEAN DEFAULT FALSE,

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await addColumnIfMissing(
    "dekhoearn_videos",
    "cloudinary_public_id",
    "TEXT"
  );

  await addColumnIfMissing(
    "dekhoearn_videos",
    "cloudinary_resource_type",
    "TEXT DEFAULT 'video'"
  );

  await addColumnIfMissing(
    "dekhoearn_videos",
    "watched_seconds",
    "BIGINT DEFAULT 0"
  );

  await addColumnIfMissing(
    "dekhoearn_videos",
    "moderation_status",
    "VARCHAR(30) DEFAULT 'pending'"
  );

  await addColumnIfMissing(
    "dekhoearn_videos",
    "duplicate_warning",
    "BOOLEAN DEFAULT FALSE"
  );

  /* ====================================================
     VIDEO VIEWS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      video_id UUID NOT NULL
        REFERENCES dekhoearn_videos(id)
        ON DELETE CASCADE,

      watch_seconds BIGINT DEFAULT 0,
      reward_granted BOOLEAN DEFAULT FALSE,

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);

  /* ====================================================
     LIKES
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      video_id UUID NOT NULL
        REFERENCES dekhoearn_videos(id)
        ON DELETE CASCADE,

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);

  /* ====================================================
     COMMENTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      video_id UUID NOT NULL
        REFERENCES dekhoearn_videos(id)
        ON DELETE CASCADE,

      comment TEXT NOT NULL,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* ====================================================
     REPORTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      video_id UUID NOT NULL
        REFERENCES dekhoearn_videos(id)
        ON DELETE CASCADE,

      reason VARCHAR(200) DEFAULT 'Other',
      details TEXT DEFAULT '',

      status VARCHAR(30) DEFAULT 'open',

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);

  /* ====================================================
     FOLLOWS / SUBSCRIBE
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id UUID PRIMARY KEY,

      follower_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      following_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(follower_id, following_id)
    )
  `);

  /* ====================================================
     POINTS LEDGER
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      points BIGINT NOT NULL,

      reason VARCHAR(100) NOT NULL,
      reference_id TEXT,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* ====================================================
     DAILY REWARDS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      reward_date DATE NOT NULL,
      points BIGINT NOT NULL DEFAULT 10,

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, reward_date)
    )
  `);

  /* ====================================================
     REWARDED ADS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      points BIGINT NOT NULL DEFAULT 5,

      ad_reference TEXT,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* ====================================================
     REFERRALS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id UUID PRIMARY KEY,

      referrer_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      referred_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      points BIGINT NOT NULL DEFAULT 10,

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(referred_id)
    )
  `);

  /* ====================================================
     CREATOR EARNINGS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      video_id UUID
        REFERENCES dekhoearn_videos(id)
        ON DELETE SET NULL,

      gross_amount NUMERIC(14,2)
        DEFAULT 0,

      platform_amount NUMERIC(14,2)
        DEFAULT 0,

      creator_amount NUMERIC(14,2)
        DEFAULT 0,

      currency VARCHAR(10)
        DEFAULT 'INR',

      status VARCHAR(30)
        DEFAULT 'pending',

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* ====================================================
     PAYOUT ACCOUNTS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES dekhoearn_users(id)
        ON DELETE CASCADE,

      account_name TEXT,
      account_type TEXT,
      account_reference TEXT,

      status VARCHAR(30)
        DEFAULT 'pending',

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id)
    )
  `);

  /* ====================================================
     ADMIN ACTIONS
  ==================================================== */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id UUID PRIMARY KEY,

      admin_reference TEXT,

      action VARCHAR(100) NOT NULL,

      target_type VARCHAR(50),
      target_id UUID,

      details TEXT DEFAULT '',

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* ====================================================
     INDEXES
  ==================================================== */

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_users_username
    ON dekhoearn_users(username)
  `);

  await dbQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_de_users_email_unique
    ON dekhoearn_users(email)
    WHERE email IS NOT NULL
      AND email <> ''
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_users_reset_token
    ON dekhoearn_users(password_reset_token_hash)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_videos_user
    ON dekhoearn_videos(user_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_videos_created
    ON dekhoearn_videos(created_at DESC)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_views_user
    ON dekhoearn_video_views(user_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_views_video
    ON dekhoearn_video_views(video_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_comments_video
    ON dekhoearn_comments(video_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_reports_video
    ON dekhoearn_reports(video_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_follows_following
    ON dekhoearn_follows(following_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_follows_follower
    ON dekhoearn_follows(follower_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_points_user
    ON dekhoearn_points_ledger(user_id, created_at DESC)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_history_user
    ON dekhoearn_video_views(user_id, updated_at DESC)
  `);

  console.log(
    "Database initialized successfully."
  );
}

/* ======================================================
   HEALTH
====================================================== */

app.get("/health", async (req, res) => {
  try {
    await dbQuery("SELECT 1");

    res.json({
      ok: true,
      app: APP_NAME,
      version: SERVER_VERSION,
      database: true,
      cloudinary: Boolean(
        CLOUDINARY_CLOUD_NAME &&
        CLOUDINARY_API_KEY &&
        CLOUDINARY_API_SECRET
      ),
      password_reset_email:
        passwordResetConfigured()
    });
  } catch (error) {
    console.error(
      "HEALTH ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      app: APP_NAME,
      version: SERVER_VERSION,
      database: false
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
      const firstName =
        cleanText(
          req.body.first_name,
          100
        );

      const username =
        normalizeUsername(
          req.body.username
        );

      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      const referralCode =
        cleanText(
          req.body.referral_code,
          50
        ).toUpperCase();

      if (!firstName) {
        return res.status(400).json({
          ok: false,
          error: "First name is required."
        });
      }

      if (!isValidUsername(username)) {
        return res.status(400).json({
          ok: false,
          error:
            "Username must contain lowercase letters, numbers, underscore or dot and be 3-30 characters."
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          ok: false,
          error:
            "A valid recovery email is required."
        });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({
          ok: false,
          error:
            "Password must be at least 6 characters."
        });
      }

      const existingUsername =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE username = $1
          LIMIT 1
          `,
          [username]
        );

      if (existingUsername.rows.length) {
        return res.status(409).json({
          ok: false,
          error: "Username already exists."
        });
      }

      const existingEmail =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [email]
        );

      if (existingEmail.rows.length) {
        return res.status(409).json({
          ok: false,
          error:
            "This email is already linked to an account."
        });
      }

      let referredBy = null;

      if (referralCode) {
        const ref =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE UPPER(referral_code) = UPPER($1)
            LIMIT 1
            `,
            [referralCode]
          );

        if (ref.rows.length) {
          referredBy =
            ref.rows[0].id;
        }
      }

      const {
        salt,
        hash
      } = await hashPassword(
        password
      );

      const userId =
        randomId();

      let newReferralCode =
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
            [newReferralCode]
          );

        if (!check.rows.length) {
          break;
        }

        newReferralCode =
          makeReferralCode(
            username
          );
      }

      const authToken =
        createAuthToken();

      const authHash =
        hashAuthToken(
          authToken
        );

      const expiry =
        authExpiryDate();

      const insert =
        await dbQuery(
          `
          INSERT INTO dekhoearn_users (
            id,
            username,
            first_name,
            email,
            password_hash,
            password_salt,
            auth_token_hash,
            auth_token_expires_at,
            referral_code,
            referred_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
          )
          RETURNING *
          `,
          [
            userId,
            username,
            firstName,
            email,
            hash,
            salt,
            authHash,
            expiry,
            newReferralCode,
            referredBy
          ]
        );

      const user =
        insert.rows[0];

      /* Referral reward */

      if (
        referredBy &&
        referredBy !== userId
      ) {
        try {
          await dbQuery(
            `
            INSERT INTO dekhoearn_referrals (
              id,
              referrer_id,
              referred_id,
              points
            )
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (referred_id)
            DO NOTHING
            `,
            [
              randomId(),
              referredBy,
              userId,
              REFERRAL_REWARD
            ]
          );

          await dbQuery(
            `
            UPDATE dekhoearn_users
            SET
              points = points + $1,
              total_earned =
                total_earned + $1,
              updated_at = NOW()
            WHERE id = $2
            `,
            [
              REFERRAL_REWARD,
              referredBy
            ]
          );

          await dbQuery(
            `
            INSERT INTO dekhoearn_points_ledger (
              id,
              user_id,
              points,
              reason,
              reference_id
            )
            VALUES ($1,$2,$3,$4,$5)
            `,
            [
              randomId(),
              referredBy,
              REFERRAL_REWARD,
              "Referral reward",
              userId
            ]
          );
        } catch (refError) {
          console.error(
            "REFERRAL REWARD ERROR:",
            refError
          );
        }
      }

      return res.status(201).json({
        ok: true,
        message:
          "Account created successfully.",
        token: authToken,
        user: publicUser(user)
      });
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      if (
        error.code === "23505"
      ) {
        return res.status(409).json({
          ok: false,
          error:
            "Username or email already exists."
        });
      }

      res.status(500).json({
        ok: false,
        error:
          "Could not create account."
      });
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
      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        String(
          req.body.password || ""
        );

      if (!username || !password) {
        return res.status(400).json({
          ok: false,
          error:
            "Username and password are required."
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

      if (!result.rows.length) {
        return res.status(401).json({
          ok: false,
          error:
            "Invalid username or password."
        });
      }

      const user =
        result.rows[0];

      const valid =
        await verifyPassword(
          password,
          user.password_salt,
          user.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          ok: false,
          error:
            "Invalid username or password."
        });
      }

      const token =
        createAuthToken();

      const tokenHash =
        hashAuthToken(token);

      const expiry =
        authExpiryDate();

      const updated =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            auth_token_hash = $1,
            auth_token_expires_at = $2,
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
          `,
          [
            tokenHash,
            expiry,
            user.id
          ]
        );

      res.json({
        ok: true,
        message: "Login successful.",
        token,
        user:
          publicUser(
            updated.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not login."
      });
    }
  }
);

/* ======================================================
   AUTH - ME
====================================================== */

app.get(
  "/api/auth/me",
  requireUser,
  async (req, res) => {
    res.json({
      ok: true,
      user:
        publicUser(req.user)
    });
  }
);

/* ======================================================
   AUTH - LOGOUT
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

      res.json({
        ok: true,
        message:
          "Logged out successfully."
      });
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not logout."
      });
    }
  }
);

/* ======================================================
   FORGOT PASSWORD
====================================================== */

app.post(
  "/api/auth/forgot-password",
  async (req, res) => {
    const genericMessage =
      "If an account exists for this email, a password reset link has been sent.";

    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      if (!isValidEmail(email)) {
        return res.json({
          ok: true,
          message: genericMessage
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            id,
            username,
            email
          FROM dekhoearn_users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [email]
        );

      if (!result.rows.length) {
        return res.json({
          ok: true,
          message: genericMessage
        });
      }

      const user =
        result.rows[0];

      const resetToken =
        createPasswordResetToken();

      const resetHash =
        hashResetToken(
          resetToken
        );

      const expires =
        passwordResetExpiryDate();

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          password_reset_token_hash = $1,
          password_reset_expires_at = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          resetHash,
          expires,
          user.id
        ]
      );

      try {
        await sendPasswordResetEmail({
          email: user.email,
          username: user.username,
          resetToken
        });
      } catch (emailError) {
        console.error(
          "PASSWORD RESET EMAIL ERROR:",
          emailError
        );

        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            password_reset_token_hash = NULL,
            password_reset_expires_at = NULL,
            updated_at = NOW()
          WHERE id = $1
          `,
          [user.id]
        );
      }

      res.json({
        ok: true,
        message: genericMessage
      });
    } catch (error) {
      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      res.json({
        ok: true,
        message: genericMessage
      });
    }
  }
);

/* ======================================================
   RESET PASSWORD
====================================================== */

app.post(
  "/api/auth/reset-password",
  async (req, res) => {
    try {
      const token =
        String(
          req.body.token || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );

      if (!token) {
        return res.status(400).json({
          ok: false,
          error:
            "Reset token is required."
        });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({
          ok: false,
          error:
            "Password must be at least 6 characters."
        });
      }

      const tokenHash =
        hashResetToken(token);

      const result =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE password_reset_token_hash = $1
            AND password_reset_expires_at > NOW()
          LIMIT 1
          `,
          [tokenHash]
        );

      if (!result.rows.length) {
        return res.status(400).json({
          ok: false,
          error:
            "Reset link is invalid or expired."
        });
      }

      const user =
        result.rows[0];

      const {
        salt,
        hash
      } = await hashPassword(
        password
      );

      /*
       Invalidate all old sessions after
       successful password reset.
      */

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          password_hash = $1,
          password_salt = $2,

          auth_token_hash = NULL,
          auth_token_expires_at = NULL,

          password_reset_token_hash = NULL,
          password_reset_expires_at = NULL,

          updated_at = NOW()

        WHERE id = $3
        `,
        [
          hash,
          salt,
          user.id
        ]
      );

      res.json({
        ok: true,
        message:
          "Password reset successfully. Please login with your new password."
      });
    } catch (error) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not reset password."
      });
    }
  }
);

/* ======================================================
   ADD / UPDATE RECOVERY EMAIL
   Useful for old accounts created before v3.2
====================================================== */

app.post(
  "/api/auth/recovery-email",
  requireUser,
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      if (!isValidEmail(email)) {
        return res.status(400).json({
          ok: false,
          error:
            "Please enter a valid email."
        });
      }

      const existing =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE LOWER(email) = LOWER($1)
            AND id <> $2
          LIMIT 1
          `,
          [
            email,
            req.user.id
          ]
        );

      if (existing.rows.length) {
        return res.status(409).json({
          ok: false,
          error:
            "This email is already linked to another account."
        });
      }

      const updated =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            email = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
          `,
          [
            email,
            req.user.id
          ]
        );

      res.json({
        ok: true,
        message:
          "Recovery email saved successfully.",
        user:
          publicUser(
            updated.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "RECOVERY EMAIL ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not save recovery email."
      });
    }
  }
);

/* ======================================================
   USER PROFILE
====================================================== */

app.get(
  "/api/user/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            id,
            username,
            first_name,
            email,
            points,
            total_earned,
            watched_videos,
            today_earned,
            followers,
            following,
            total_watch_seconds,
            total_videos,
            creator_applied,
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
          error: "User not found."
        });
      }

      res.json({
        ok: true,
        user:
          publicUser(
            result.rows[0]
          )
      });
    } catch (error) {
      console.error(
        "USER PROFILE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load user."
      });
    }
  }
);

/* ======================================================
   CLOUDINARY STATUS
====================================================== */

app.get(
  "/api/cloudinary/status",
  requireUser,
  async (req, res) => {
    res.json({
      ok: true,
      configured: Boolean(
        CLOUDINARY_CLOUD_NAME &&
        CLOUDINARY_API_KEY &&
        CLOUDINARY_API_SECRET
      ),
      cloud_name:
        CLOUDINARY_CLOUD_NAME || null,
      folder:
        CLOUDINARY_FOLDER
    });
  }
);

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

function cloudinarySignature(
  params
) {
  const sorted =
    Object.keys(params)
      .sort()
      .map(
        key =>
          `${key}=${params[key]}`
      )
      .join("&");

  return crypto
    .createHash("sha1")
    .update(
      sorted +
        CLOUDINARY_API_SECRET
    )
    .digest("hex");
}

app.get(
  "/api/cloudinary/signature",
  requireUser,
  async (req, res) => {
    try {
      if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
      ) {
        return res.status(503).json({
          ok: false,
          error:
            "Cloudinary is not configured."
        });
      }

      const timestamp =
        Math.floor(
          Date.now() / 1000
        );

      const params = {
        folder:
          CLOUDINARY_FOLDER,
        timestamp
      };

      const signature =
        cloudinarySignature(
          params
        );

      res.json({
        ok: true,
        cloud_name:
          CLOUDINARY_CLOUD_NAME,
        api_key:
          CLOUDINARY_API_KEY,
        folder:
          CLOUDINARY_FOLDER,
        timestamp,
        signature
      });
    } catch (error) {
      console.error(
        "CLOUDINARY SIGNATURE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not create upload signature."
      });
    }
  }
);

app.post(
  "/api/cloudinary/signature",
  requireUser,
  async (req, res) => {
    try {
      if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
      ) {
        return res.status(503).json({
          ok: false,
          error:
            "Cloudinary is not configured."
        });
      }

      const timestamp =
        Math.floor(
          Date.now() / 1000
        );

      const params = {
        folder:
          CLOUDINARY_FOLDER,
        timestamp
      };

      const signature =
        cloudinarySignature(
          params
        );

      res.json({
        ok: true,
        cloud_name:
          CLOUDINARY_CLOUD_NAME,
        api_key:
          CLOUDINARY_API_KEY,
        folder:
          CLOUDINARY_FOLDER,
        timestamp,
        signature
      });
    } catch (error) {
      console.error(
        "CLOUDINARY SIGNATURE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not create upload signature."
      });
    }
  }
);

/* ======================================================
   VIDEO FEED
====================================================== */

app.get(
  "/api/videos",
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          safeNumber(
            req.query.limit,
            20
          ),
          1
        ),
        50
      );

      const offset = Math.max(
        safeNumber(
          req.query.offset,
          0
        ),
        0
      );

      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            u.username AS creator_username,
            u.first_name AS creator_first_name,
            u.followers AS creator_followers

          FROM dekhoearn_videos v

          JOIN dekhoearn_users u
            ON u.id = v.user_id

          WHERE v.status = 'active'
            AND COALESCE(
              v.moderation_status,
              'pending'
            ) <> 'removed'

          ORDER BY v.created_at DESC

          LIMIT $1
          OFFSET $2
          `,
          [
            limit,
            offset
          ]
        );

      res.json({
        ok: true,
        videos:
          result.rows
      });
    } catch (error) {
      console.error(
        "VIDEOS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load videos."
      });
    }
  }
);

/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get(
  "/api/videos/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            u.username AS creator_username,
            u.first_name AS creator_first_name,
            u.followers AS creator_followers

          FROM dekhoearn_videos v

          JOIN dekhoearn_users u
            ON u.id = v.user_id

          WHERE v.id = $1
          LIMIT 1
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found."
        });
      }

      res.json({
        ok: true,
        video:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load video."
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
          2000
        );

      const videoUrl =
        String(
          req.body.video_url || ""
        ).trim();

      const publicId =
        String(
          req.body.cloudinary_public_id ||
          ""
        ).trim();

      const resourceType =
        String(
          req.body.cloudinary_resource_type ||
          "video"
        ).trim();

      if (!title) {
        return res.status(400).json({
          ok: false,
          error:
            "Video title is required."
        });
      }

      if (!videoUrl) {
        return res.status(400).json({
          ok: false,
          error:
            "Video URL is required."
        });
      }

      if (
        videoUrl.length >
        5000
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Video URL is too long."
        });
      }

      /*
       Simple duplicate URL warning.
       We don't automatically remove the video.
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

      const videoId =
        randomId();

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_videos (
            id,
            user_id,
            title,
            description,
            video_url,
            cloudinary_public_id,
            cloudinary_resource_type,
            duplicate_warning,
            status,
            moderation_status
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,'active','pending'
          )
          RETURNING *
          `,
          [
            videoId,
            req.user.id,
            title,
            description,
            videoUrl,
            publicId || null,
            resourceType,
            duplicateWarning
          ]
        );

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          total_videos =
            total_videos + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );

      res.status(201).json({
        ok: true,
        message:
          "Video uploaded successfully.",
        video:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "CREATE VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not save video."
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
      const result =
        await dbQuery(
          `
          DELETE FROM dekhoearn_videos
          WHERE id = $1
            AND user_id = $2
          RETURNING id
          `,
          [
            req.params.id,
            req.user.id
          ]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found or you do not own it."
        });
      }

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          total_videos =
            GREATEST(total_videos - 1, 0),
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );

      res.json({
        ok: true,
        message:
          "Video deleted successfully."
      });
    } catch (error) {
      console.error(
        "DELETE VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not delete video."
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
        String(
          req.body.video_id || ""
        ).trim();

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

      if (!videoId) {
        return res.status(400).json({
          ok: false,
          error:
            "Video ID is required."
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
          error:
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
      let pointsAdded = 0;

      if (!existing.rows.length) {
        if (
          watchSeconds >=
          MIN_WATCH_SECONDS
        ) {
          await client.query(
            `
            INSERT INTO dekhoearn_video_views (
              id,
              user_id,
              video_id,
              watch_seconds,
              reward_granted
            )
            VALUES (
              $1,$2,$3,$4,TRUE
            )
            `,
            [
              randomId(),
              req.user.id,
              videoId,
              watchSeconds
            ]
          );

          await client.query(
            `
            UPDATE dekhoearn_users
            SET
              points =
                points + $1,
              total_earned =
                total_earned + $1,
              watched_videos =
                watched_videos + 1,
              today_earned =
                today_earned + $1,
              total_watch_seconds =
                total_watch_seconds + $2,
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
            INSERT INTO dekhoearn_points_ledger (
              id,
              user_id,
              points,
              reason,
              reference_id
            )
            VALUES (
              $1,$2,$3,$4,$5
            )
            `,
            [
              randomId(),
              req.user.id,
              WATCH_REWARD,
              "Video watch reward",
              videoId
            ]
          );

          rewardGranted = true;
          pointsAdded =
            WATCH_REWARD;
        } else {
          await client.query(
            `
            INSERT INTO dekhoearn_video_views (
              id,
              user_id,
              video_id,
              watch_seconds,
              reward_granted
            )
            VALUES (
              $1,$2,$3,$4,FALSE
            )
            `,
            [
              randomId(),
              req.user.id,
              videoId,
              watchSeconds
            ]
          );

          await client.query(
            `
            UPDATE dekhoearn_users
            SET
              total_watch_seconds =
                total_watch_seconds + $1,
              updated_at = NOW()
            WHERE id = $2
            `,
            [
              watchSeconds,
              req.user.id
            ]
          );
        }
      } else {
        const oldSeconds =
          safeNumber(
            existing.rows[0]
              .watch_seconds
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

        if (
          !existing.rows[0]
            .reward_granted &&
          newSeconds >=
            MIN_WATCH_SECONDS
        ) {
          await client.query(
            `
            UPDATE dekhoearn_video_views
            SET
              reward_granted = TRUE,
              updated_at = NOW()
            WHERE user_id = $1
              AND video_id = $2
            `,
            [
              req.user.id,
              videoId
            ]
          );

          await client.query(
            `
            UPDATE dekhoearn_users
            SET
              points =
                points + $1,
              total_earned =
                total_earned + $1,
              watched_videos =
                watched_videos + 1,
              today_earned =
                today_earned + $1,
              total_watch_seconds =
                total_watch_seconds +
                GREATEST($2 - $3, 0),
              updated_at = NOW()
            WHERE id = $4
            `,
            [
              WATCH_REWARD,
              newSeconds,
              oldSeconds,
              req.user.id
            ]
          );

          await client.query(
            `
            INSERT INTO dekhoearn_points_ledger (
              id,
              user_id,
              points,
              reason,
              reference_id
            )
            VALUES (
              $1,$2,$3,$4,$5
            )
            `,
            [
              randomId(),
              req.user.id,
              WATCH_REWARD,
              "Video watch reward",
              videoId
            ]
          );

          rewardGranted = true;
          pointsAdded =
            WATCH_REWARD;
        }
      }

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          views =
            views + CASE
              WHEN NOT EXISTS (
                SELECT 1
                FROM dekhoearn_video_views vv
                WHERE vv.user_id = $1
                  AND vv.video_id = $2
                  AND vv.id <> (
                    SELECT vv2.id
                    FROM dekhoearn_video_views vv2
                    WHERE vv2.user_id = $1
                      AND vv2.video_id = $2
                    LIMIT 1
                  )
              )
              THEN 0
              ELSE 0
            END,
          watched_seconds =
            watched_seconds + $3,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          req.user.id,
          videoId,
          Math.min(
            watchSeconds,
            3600
          )
        ]
      );

      await client.query(
        "COMMIT"
      );

      const freshUser =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );

      res.json({
        ok: true,
        reward_granted:
          rewardGranted,
        points_added:
          pointsAdded,
        points:
          safeNumber(
            freshUser.rows[0]?.points
          ),
        min_watch_seconds:
          MIN_WATCH_SECONDS
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

      res.status(500).json({
        ok: false,
        error:
          "Could not complete watch reward."
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
        req.params.id !==
        req.user.id
      ) {
        return res.status(403).json({
          ok: false,
          error:
            "You can only view your own watch history."
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            vv.id,
            vv.video_id,
            vv.watch_seconds,
            vv.reward_granted,
            vv.created_at,
            vv.updated_at,

            v.title,
            v.description,
            v.video_url,

            u.username AS creator_username,
            u.first_name AS creator_first_name

          FROM dekhoearn_video_views vv

          JOIN dekhoearn_videos v
            ON v.id = vv.video_id

          JOIN dekhoearn_users u
            ON u.id = v.user_id

          WHERE vv.user_id = $1

          ORDER BY
            vv.updated_at DESC
          LIMIT 100
          `,
          [req.user.id]
        );

      res.json({
        ok: true,
        history:
          result.rows
      });
    } catch (error) {
      console.error(
        "WATCH HISTORY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load watch history."
      });
    }
  }
);

/* ======================================================
   LIKE STATUS
====================================================== */

app.get(
  "/api/videos/:id/like",
  requireUser,
  async (req, res) => {
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

      res.json({
        ok: true,
        liked:
          result.rows.length > 0
      });
    } catch (error) {
      console.error(
        "LIKE STATUS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not check like."
      });
    }
  }
);

/* ======================================================
   LIKE / UNLIKE
====================================================== */

app.post(
  "/api/videos/:id/like",
  requireUser,
  async (req, res) => {
    try {
      const videoId =
        req.params.id;

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

        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            likes =
              GREATEST(likes - 1, 0),
            updated_at = NOW()
          WHERE id = $1
          `,
          [videoId]
        );

        liked = false;
      } else {
        await dbQuery(
          `
          INSERT INTO dekhoearn_likes (
            id,
            user_id,
            video_id
          )
          VALUES ($1,$2,$3)
          ON CONFLICT (
            user_id,
            video_id
          )
          DO NOTHING
          `,
          [
            randomId(),
            req.user.id,
            videoId
          ]
        );

        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            likes =
              likes + 1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [videoId]
        );

        liked = true;
      }

      const video =
        await dbQuery(
          `
          SELECT likes
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );

      res.json({
        ok: true,
        liked,
        likes:
          safeNumber(
            video.rows[0]?.likes
          )
      });
    } catch (error) {
      console.error(
        "LIKE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not update like."
      });
    }
  }
);

/* ======================================================
   COMMENTS GET
====================================================== */

app.get(
  "/api/videos/:id/comments",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            c.id,
            c.comment,
            c.created_at,
            u.id AS user_id,
            u.username,
            u.first_name

          FROM dekhoearn_comments c

          JOIN dekhoearn_users u
            ON u.id = c.user_id

          WHERE c.video_id = $1

          ORDER BY c.created_at DESC

          LIMIT 100
          `,
          [req.params.id]
        );

      res.json({
        ok: true,
        comments:
          result.rows
      });
    } catch (error) {
      console.error(
        "COMMENTS GET ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load comments."
      });
    }
  }
);

/* ======================================================
   COMMENTS POST
====================================================== */

app.post(
  "/api/videos/:id/comments",
  requireUser,
  async (req, res) => {
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
            "Comment cannot be empty."
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

      if (!video.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found."
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_comments (
            id,
            user_id,
            video_id,
            comment
          )
          VALUES ($1,$2,$3,$4)
          RETURNING *
          `,
          [
            randomId(),
            req.user.id,
            req.params.id,
            comment
          ]
        );

      await dbQuery(
        `
        UPDATE dekhoearn_videos
        SET
          comments =
            comments + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.params.id]
      );

      res.status(201).json({
        ok: true,
        comment:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "COMMENT POST ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not post comment."
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
  async (req, res) => {
    try {
      const reason =
        cleanText(
          req.body.reason ||
            "Other",
          200
        );

      const details =
        cleanText(
          req.body.details ||
            "",
          1000
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

      if (existing.rows.length) {
        return res.status(409).json({
          ok: false,
          error:
            "You have already reported this video."
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

      if (!video.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_reports (
          id,
          user_id,
          video_id,
          reason,
          details
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          randomId(),
          req.user.id,
          req.params.id,
          reason,
          details
        ]
      );

      res.json({
        ok: true,
        message:
          "Report submitted successfully."
      });
    } catch (error) {
      console.error(
        "REPORT ERROR:",
        error
      );

      if (
        error.code === "23505"
      ) {
        return res.status(409).json({
          ok: false,
          error:
            "You have already reported this video."
        });
      }

      res.status(500).json({
        ok: false,
        error:
          "Could not submit report."
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
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          INSERT INTO dekhoearn_daily_rewards (
            id,
            user_id,
            reward_date,
            points
          )
          VALUES (
            $1,$2,CURRENT_DATE,$3
          )
          ON CONFLICT (
            user_id,
            reward_date
          )
          DO NOTHING
          RETURNING id
          `,
          [
            randomId(),
            req.user.id,
            DAILY_REWARD
          ]
        );

      if (!result.rows.length) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          ok: false,
          error:
            "Daily reward already claimed today."
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          points =
            points + $1,
          total_earned =
            total_earned + $1,
          today_earned =
            today_earned + $1,
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
        INSERT INTO dekhoearn_points_ledger (
          id,
          user_id,
          points,
          reason
        )
        VALUES (
          $1,$2,$3,$4
        )
        `,
        [
          randomId(),
          req.user.id,
          DAILY_REWARD,
          "Daily reward"
        ]
      );

      await client.query(
        "COMMIT"
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

      res.json({
        ok: true,
        points_added:
          DAILY_REWARD,
        points:
          safeNumber(
            user.rows[0]?.points
          )
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(
        "DAILY REWARD ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not claim daily reward."
      });
    } finally {
      client.release();
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
      /*
       This is intentionally a DEMO reward.
       No ad click reward.
       Real ad network can be connected later.
      */

      await dbQuery(
        `
        INSERT INTO dekhoearn_rewarded_ads (
          id,
          user_id,
          points,
          ad_reference
        )
        VALUES (
          $1,$2,$3,$4
        )
        `,
        [
          randomId(),
          req.user.id,
          REWARDED_AD_POINTS,
          cleanText(
            req.body.ad_reference ||
              "demo",
            200
          )
        ]
      );

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          points =
            points + $1,
          total_earned =
            total_earned + $1,
          today_earned =
            today_earned + $1,
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
        INSERT INTO dekhoearn_points_ledger (
          id,
          user_id,
          points,
          reason
        )
        VALUES (
          $1,$2,$3,$4
        )
        `,
        [
          randomId(),
          req.user.id,
          REWARDED_AD_POINTS,
          "Rewarded ad demo"
        ]
      );

      const user =
        await dbQuery(
          `
          SELECT points
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );

      res.json({
        ok: true,
        points_added:
          REWARDED_AD_POINTS,
        points:
          safeNumber(
            user.rows[0]?.points
          )
      });
    } catch (error) {
      console.error(
        "REWARDED AD ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not process rewarded ad."
      });
    }
  }
);

/* ======================================================
   POINTS HISTORY
====================================================== */

app.get(
  "/api/user/:id/points-history",
  requireUser,
  async (req, res) => {
    try {
      if (
        req.params.id !==
        req.user.id
      ) {
        return res.status(403).json({
          ok: false,
          error:
            "You can only view your own points history."
        });
      }

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
          LIMIT 100
          `,
          [req.user.id]
        );

      res.json({
        ok: true,
        history:
          result.rows
      });
    } catch (error) {
      console.error(
        "POINTS HISTORY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load points history."
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
  async (req, res) => {
    try {
      const result =
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
            req.params.id
          ]
        );

      res.json({
        ok: true,
        following:
          result.rows.length > 0
      });
    } catch (error) {
      console.error(
        "FOLLOW STATUS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not check follow status."
      });
    }
  }
);

/* ======================================================
   FOLLOW / UNFOLLOW
====================================================== */

app.post(
  "/api/user/:id/follow",
  requireUser,
  async (req, res) => {
    try {
      const targetId =
        req.params.id;

      if (
        targetId ===
        req.user.id
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "You cannot follow yourself."
        });
      }

      const target =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE id = $1
          LIMIT 1
          `,
          [targetId]
        );

      if (!target.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found."
        });
      }

      const existing =
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
            targetId
          ]
        );

      let following;

      if (existing.rows.length) {
        await dbQuery(
          `
          DELETE FROM dekhoearn_follows
          WHERE follower_id = $1
            AND following_id = $2
          `,
          [
            req.user.id,
            targetId
          ]
        );

        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            following =
              GREATEST(following - 1, 0),
            updated_at = NOW()
          WHERE id = $1
          `,
          [req.user.id]
        );

        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            followers =
              GREATEST(followers - 1, 0),
            updated_at = NOW()
          WHERE id = $1
          `,
          [targetId]
        );

        following = false;
      } else {
        await dbQuery(
          `
          INSERT INTO dekhoearn_follows (
            id,
            follower_id,
            following_id
          )
          VALUES (
            $1,$2,$3
          )
          ON CONFLICT (
            follower_id,
            following_id
          )
          DO NOTHING
          `,
          [
            randomId(),
            req.user.id,
            targetId
          ]
        );

        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            following =
              following + 1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [req.user.id]
        );

        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            followers =
              followers + 1,
            updated_at = NOW()
          WHERE id = $1
          `,
          [targetId]
        );

        following = true;
      }

      const user =
        await dbQuery(
          `
          SELECT
            followers,
            following
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [targetId]
        );

      res.json({
        ok: true,
        following,
        followers:
          safeNumber(
            user.rows[0]?.followers
          )
      });
    } catch (error) {
      console.error(
        "FOLLOW ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not update follow status."
      });
    }
  }
);

/* ======================================================
   CREATOR STATS
====================================================== */

app.get(
  "/api/creator/stats",
  requireUser,
  async (req, res) => {
    try {
      const userResult =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
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

          WHERE user_id = $1
          `,
          [req.user.id]
        );

      const videos =
        await dbQuery(
          `
          SELECT
            COUNT(*) AS total_videos,
            COALESCE(
              SUM(views),
              0
            ) AS total_views,
            COALESCE(
              SUM(likes),
              0
            ) AS total_likes,
            COALESCE(
              SUM(comments),
              0
            ) AS total_comments

          FROM dekhoearn_videos

          WHERE user_id = $1
            AND status <> 'removed'
          `,
          [req.user.id]
        );

      const user =
        userResult.rows[0];

      const watchHours =
        safeNumber(
          user.total_watch_seconds
        ) / 3600;

      const eligible =
        safeNumber(
          user.followers
        ) >=
          CREATOR_MIN_FOLLOWERS &&
        watchHours >=
          CREATOR_MIN_WATCH_HOURS;

      res.json({
        ok: true,

        followers:
          safeNumber(
            user.followers
          ),

        following:
          safeNumber(
            user.following
          ),

        total_watch_seconds:
          safeNumber(
            user.total_watch_seconds
          ),

        watch_hours:
          Number(
            watchHours.toFixed(2)
          ),

        total_videos:
          safeNumber(
            videos.rows[0]?.total_videos
          ),

        total_views:
          safeNumber(
            videos.rows[0]?.total_views
          ),

        total_likes:
          safeNumber(
            videos.rows[0]?.total_likes
          ),

        total_comments:
          safeNumber(
            videos.rows[0]?.total_comments
          ),

        creator_status:
          user.creator_status,

        creator_applied:
          Boolean(
            user.creator_applied
          ),

        monetization_status:
          user.monetization_status,

        eligible,

        requirements: {
          min_followers:
            CREATOR_MIN_FOLLOWERS,
          min_watch_hours:
            CREATOR_MIN_WATCH_HOURS
        },

        earnings:
          earnings.rows[0]
      });
    } catch (error) {
      console.error(
        "CREATOR STATS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load creator stats."
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
      const result =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [req.user.id]
        );

      const user =
        result.rows[0];

      const watchHours =
        safeNumber(
          user.total_watch_seconds
        ) / 3600;

      const eligible =
        safeNumber(
          user.followers
        ) >=
          CREATOR_MIN_FOLLOWERS &&
        watchHours >=
          CREATOR_MIN_WATCH_HOURS;

      if (!eligible) {
        return res.status(400).json({
          ok: false,
          error:
            "Creator eligibility requirements are not met.",
          requirements: {
            followers:
              CREATOR_MIN_FOLLOWERS,
            watch_hours:
              CREATOR_MIN_WATCH_HOURS
          },
          current: {
            followers:
              safeNumber(
                user.followers
              ),
            watch_hours:
              Number(
                watchHours.toFixed(2)
              )
          }
        });
      }

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          creator_applied = TRUE,
          creator_status = 'pending',
          monetization_status = 'pending',
          updated_at = NOW()
        WHERE id = $1
        `,
        [req.user.id]
      );

      res.json({
        ok: true,
        message:
          "Creator application submitted.",
        creator_status:
          "pending"
      });
    } catch (error) {
      console.error(
        "CREATOR APPLY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not submit creator application."
      });
    }
  }
);

/* ======================================================
   PAYOUT ACCOUNT FOUNDATION
====================================================== */

app.post(
  "/api/creator/payout-account",
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
          error:
            "All payout account fields are required."
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_payout_accounts (
            id,
            user_id,
            account_name,
            account_type,
            account_reference,
            status
          )
          VALUES (
            $1,$2,$3,$4,$5,'pending'
          )

          ON CONFLICT (user_id)

          DO UPDATE SET
            account_name =
              EXCLUDED.account_name,
            account_type =
              EXCLUDED.account_type,
            account_reference =
              EXCLUDED.account_reference,
            status = 'pending',
            updated_at = NOW()

          RETURNING *
          `,
          [
            randomId(),
            req.user.id,
            accountName,
            accountType,
            accountReference
          ]
        );

      res.json({
        ok: true,
        message:
          "Payout account information saved.",
        payout_account:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "PAYOUT ACCOUNT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not save payout account."
      });
    }
  }
);

/* ======================================================
   MY VIDEOS
====================================================== */

app.get(
  "/api/user/:id/videos",
  requireUser,
  async (req, res) => {
    try {
      if (
        req.params.id !==
        req.user.id
      ) {
        return res.status(403).json({
          ok: false,
          error:
            "You can only view your own videos."
        });
      }

      const result =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_videos
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 100
          `,
          [req.user.id]
        );

      res.json({
        ok: true,
        videos:
          result.rows
      });
    } catch (error) {
      console.error(
        "MY VIDEOS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load your videos."
      });
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
      const result =
        await dbQuery(
          `
          SELECT
            id,
            username,
            first_name,
            email,
            points,
            total_earned,
            followers,
            following,
            creator_status,
            monetization_status,
            created_at
          FROM dekhoearn_users
          ORDER BY created_at DESC
          LIMIT 500
          `
        );

      res.json({
        ok: true,
        users:
          result.rows
      });
    } catch (error) {
      console.error(
        "ADMIN USERS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load users."
      });
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

            v.title AS video_title,
            v.video_url,

            reporter.username
              AS reporter_username,

            owner.username
              AS owner_username

          FROM dekhoearn_reports r

          JOIN dekhoearn_videos v
            ON v.id = r.video_id

          JOIN dekhoearn_users reporter
            ON reporter.id = r.user_id

          JOIN dekhoearn_users owner
            ON owner.id = v.user_id

          ORDER BY
            r.created_at DESC

          LIMIT 500
          `
        );

      res.json({
        ok: true,
        reports:
          result.rows
      });
    } catch (error) {
      console.error(
        "ADMIN REPORTS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load reports."
      });
    }
  }
);

/* ======================================================
   ADMIN - REMOVE VIDEO
====================================================== */

app.post(
  "/api/admin/videos/:id/remove",
  requireAdmin,
  async (req, res) => {
    try {
      const reason =
        cleanText(
          req.body.reason ||
            "Removed by admin",
          500
        );

      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            status = 'removed',
            moderation_status = 'removed',
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          id,
          admin_reference,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        `,
        [
          randomId(),
          "admin",
          "remove_video",
          "video",
          req.params.id,
          reason
        ]
      );

      res.json({
        ok: true,
        message:
          "Video removed successfully."
      });
    } catch (error) {
      console.error(
        "ADMIN REMOVE VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not remove video."
      });
    }
  }
);

/* ======================================================
   ADMIN - RESTORE VIDEO
====================================================== */

app.post(
  "/api/admin/videos/:id/restore",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET
            status = 'active',
            moderation_status = 'approved',
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          id,
          admin_reference,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        `,
        [
          randomId(),
          "admin",
          "restore_video",
          "video",
          req.params.id,
          "Video restored"
        ]
      );

      res.json({
        ok: true,
        message:
          "Video restored successfully."
      });
    } catch (error) {
      console.error(
        "ADMIN RESTORE VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not restore video."
      });
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
      const reason =
        cleanText(
          req.body.reason ||
            "Banned by admin",
          500
        );

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
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          id,
          admin_reference,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        `,
        [
          randomId(),
          "admin",
          "ban_user",
          "user",
          req.params.id,
          reason
        ]
      );

      res.json({
        ok: true,
        message:
          "User session invalidated."
      });
    } catch (error) {
      console.error(
        "ADMIN BAN USER ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not ban user."
      });
    }
  }
);

/* ======================================================
   ADMIN - LOGOUT USER
====================================================== */

app.post(
  "/api/admin/users/:id/logout",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            auth_token_hash = NULL,
            auth_token_expires_at = NULL,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          id,
          admin_reference,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        `,
        [
          randomId(),
          "admin",
          "logout_user",
          "user",
          req.params.id,
          "Session invalidated"
        ]
      );

      res.json({
        ok: true,
        message:
          "User logged out."
      });
    } catch (error) {
      console.error(
        "ADMIN LOGOUT USER ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not logout user."
      });
    }
  }
);

/* ======================================================
   ADMIN - APPROVE CREATOR
====================================================== */

app.post(
  "/api/admin/users/:id/creator/approve",
  requireAdmin,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            creator_applied = TRUE,
            creator_status = 'approved',
            monetization_status = 'approved',
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          ok: false,
          error:
            "User not found."
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          id,
          admin_reference,
          action,
          target_type,
          target_id,
          details
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        `,
        [
          randomId(),
          "admin",
          "approve_creator",
          "user",
          req.params.id,
          "Creator approved"
        ]
      );

      res.json({
        ok: true,
        message:
          "Creator approved."
      });
    } catch (error) {
      console.error(
        "ADMIN CREATOR APPROVE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not approve creator."
      });
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
      const users =
        await dbQuery(
          `
          SELECT COUNT(*) AS count
          FROM dekhoearn_users
          `
        );

      const videos =
        await dbQuery(
          `
          SELECT COUNT(*) AS count
          FROM dekhoearn_videos
          WHERE status <> 'removed'
          `
        );

      const reports =
        await dbQuery(
          `
          SELECT COUNT(*) AS count
          FROM dekhoearn_reports
          WHERE status = 'open'
          `
        );

      const points =
        await dbQuery(
          `
          SELECT
            COALESCE(
              SUM(points),
              0
            ) AS total_points
          FROM dekhoearn_points_ledger
          `
        );

      res.json({
        ok: true,
        dashboard: {
          users:
            safeNumber(
              users.rows[0]?.count
            ),
          videos:
            safeNumber(
              videos.rows[0]?.count
            ),
          open_reports:
            safeNumber(
              reports.rows[0]?.count
            ),
          total_points:
            safeNumber(
              points.rows[0]?.total_points
            )
        }
      });
    } catch (error) {
      console.error(
        "ADMIN DASHBOARD ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Could not load dashboard."
      });
    }
  }
);

/* ======================================================
   404 API HANDLER
====================================================== */

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      ok: false,
      error:
        "API endpoint not found."
    });
  }
);

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
      maxAge: "1h"
    }
  )
);

/* ======================================================
   SPA FALLBACK
====================================================== */

app.get(
  "*",
  (req, res) => {
    res.sendFile(
      path.join(
        publicDir,
        "index.html"
      ),
      error => {
        if (error) {
          res.status(404).send(
            "DekhoEarn frontend not found."
          );
        }
      }
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
      "UNHANDLED SERVER ERROR:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      ok: false,
      error:
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
          "================================================="
        );

        console.log(
          `${APP_NAME} Server v${SERVER_VERSION}`
        );

        console.log(
          APP_TAGLINE
        );

        console.log(
          `Server running on port ${PORT}`
        );

        console.log(
          `Cloudinary configured: ${Boolean(
            CLOUDINARY_CLOUD_NAME &&
            CLOUDINARY_API_KEY &&
            CLOUDINARY_API_SECRET
          )}`
        );

        console.log(
          `Password reset email configured: ${passwordResetConfigured()}`
        );

        console.log(
          "================================================="
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
    await pool.end();

    console.log(
      "Database pool closed."
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "SHUTDOWN ERROR:",
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
   UNHANDLED ERRORS
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

/* ======================================================
   START
====================================================== */

startServer();
