"use strict";

/*
=========================================================
 DEKHOEARN SERVER v4.0.1

 - Authentication / Sessions
 - Videos / Cloudinary
 - Watch Rewards
 - Daily Rewards
 - Referrals
 - Likes / Comments / Reports
 - Follow System
 - Points Ledger
 - Creator Dashboard
 - Cash Wallet
 - UPI / Bank Payout Account
 - Withdrawal Requests
 - Admin Withdrawal Processing
 - PWA / Static Frontend

 IMPORTANT:
 Actual bank/UPI transfer requires a compliant payout
 provider and its API credentials.
=========================================================
*/

require("dotenv").config();

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

const PORT =
  Number(process.env.PORT || 10000);

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  `http://localhost:${PORT}`;

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
   REWARD SETTINGS
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

/* ======================================================
   CASH / WITHDRAWAL SETTINGS
====================================================== */

const MIN_WITHDRAWAL =
  Number(
    process.env.MIN_WITHDRAWAL ||
    process.env.MIN_WITHDRAWAL_AMOUNT ||
    100
  );

const MAX_WITHDRAWAL =
  Number(
    process.env.MAX_WITHDRAWAL ||
    process.env.MAX_WITHDRAWAL_AMOUNT ||
    5000
  );

const POINTS_PER_RUPEE =
  Number(
    process.env.POINTS_PER_RUPEE || 100
  );

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;

/* ======================================================
   DATABASE
====================================================== */

const pool = DATABASE_URL
  ? new Pool({
      connectionString:
        DATABASE_URL,

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

app.set(
  "trust proxy",
  1
);

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
   HELPERS
====================================================== */

function clean(
  value,
  max = 1000
) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function cleanString(
  value,
  max = 1000
) {
  return clean(
    value,
    max
  );
}

function email(value) {
  return clean(
    value,
    320
  ).toLowerCase();
}

function username(value) {
  return clean(
    value,
    50
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9_.]/g,
      ""
    );
}

function int(
  value,
  fallback = 0
) {
  const n =
    parseInt(
      value,
      10
    );

  return Number.isFinite(n)
    ? n
    : fallback;
}

function num(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function dateOnly() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function token() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function json(
  res,
  data = {}
) {
  return res.json({
    success: true,
    ...data
  });
}

function error(
  res,
  status,
  message,
  extra = {}
) {
  return res
    .status(status)
    .json({
      success: false,
      error: message,
      message,
      ...extra
    });
}

function sendError(
  res,
  status,
  message,
  extra = {}
) {
  return error(
    res,
    status,
    message,
    extra
  );
}

async function q(
  sql,
  params = []
) {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  return pool.query(
    sql,
    params
  );
}

async function col(
  table,
  name,
  definition
) {
  const result =
    await q(
      `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema='public'
        AND table_name=$1
        AND column_name=$2
      ) AS exists
      `,
      [
        table,
        name
      ]
    );

  if (
    !result.rows[0].exists
  ) {
    await q(
      `ALTER TABLE "${table}"
       ADD COLUMN "${name}" ${definition}`
    );

    console.log(
      `Migration: ${table}.${name}`
    );
  }
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDB() {

  if (!pool) {
    throw new Error(
      "DATABASE_URL is required"
    );
  }

  /* USERS */

  await q(`
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

  const userColumns = {
    password_hash: "TEXT",

    avatar_url: "TEXT",

    points:
      "BIGINT NOT NULL DEFAULT 0",

    followers_count:
      "BIGINT NOT NULL DEFAULT 0",

    following_count:
      "BIGINT NOT NULL DEFAULT 0",

    total_watch_seconds:
      "BIGINT NOT NULL DEFAULT 0",

    total_videos:
      "BIGINT NOT NULL DEFAULT 0",

    creator_status:
      "TEXT NOT NULL DEFAULT 'user'",

    creator_applied:
      "BOOLEAN NOT NULL DEFAULT FALSE",

    banned:
      "BOOLEAN NOT NULL DEFAULT FALSE",

    referral_code:
      "TEXT",

    referred_by:
      "BIGINT",

    created_at:
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()",

    updated_at:
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  };

  for (
    const [
      name,
      definition
    ] of Object.entries(
      userColumns
    )
  ) {
    await col(
      "dekhoearn_users",
      name,
      definition
    );
  }

  /* VIDEOS */

  await q(`
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

  const videoColumns = {
    description: "TEXT",

    cloudinary_public_id:
      "TEXT",

    cloudinary_resource_type:
      "TEXT DEFAULT 'video'",

    thumbnail_url:
      "TEXT",

    duration_seconds:
      "INTEGER DEFAULT 0",

    views:
      "BIGINT NOT NULL DEFAULT 0",

    likes_count:
      "BIGINT NOT NULL DEFAULT 0",

    comments_count:
      "BIGINT NOT NULL DEFAULT 0",

    watched_seconds:
      "BIGINT NOT NULL DEFAULT 0",

    status:
      "TEXT NOT NULL DEFAULT 'active'",

    moderation_status:
      "TEXT NOT NULL DEFAULT 'approved'",

    duplicate_warning:
      "BOOLEAN NOT NULL DEFAULT FALSE",

    created_at:
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()",

    updated_at:
      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
  };

  for (
    const [
      name,
      definition
    ] of Object.entries(
      videoColumns
    )
  ) {
    await col(
      "dekhoearn_videos",
      name,
      definition
    );
  }

  /* SESSIONS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* WATCH HISTORY */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      watch_seconds INTEGER NOT NULL DEFAULT 0,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id,user_id)
    )
  `);

  /* LIKES */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id,user_id)
    )
  `);

  /* COMMENTS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* REPORTS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id,user_id)
    )
  `);

  /* FOLLOWS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id BIGINT NOT NULL,
      following_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id,following_id)
    )
  `);

  /* POINTS */

  await q(`
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

  /* DAILY */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      reward_date DATE NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,reward_date)
    )
  `);

  /* REWARDED ADS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* REFERRALS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL,
      referred_id BIGINT NOT NULL UNIQUE,
      reward_points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* CREATOR EARNINGS */

  await q(`
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

  /* PAYOUT ACCOUNTS */

  await q(`
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

  /* ADMIN ACTIONS */

  await q(`
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

  /* CASH WALLET */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_wallet_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      reference_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* WITHDRAWALS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_withdrawals (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      payout_account_id BIGINT,
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT,
      provider_reference TEXT UNIQUE,
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )
  `);

  /* CASH EARNINGS */

  await q(`
    CREATE TABLE IF NOT EXISTS dekhoearn_cash_earnings (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      reference_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* INDEXES */

  await q(`
    CREATE INDEX IF NOT EXISTS
    idx_de_videos_created
    ON dekhoearn_videos(created_at DESC)
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS
    idx_de_views_user
    ON dekhoearn_video_views(user_id)
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS
    idx_de_points_user
    ON dekhoearn_points_ledger(user_id)
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS
    idx_de_wallet_user
    ON dekhoearn_wallet_ledger(user_id)
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS
    idx_de_withdraw_user
    ON dekhoearn_withdrawals(
      user_id,
      created_at DESC
    )
  `);
}

/* ======================================================
   AUTH
====================================================== */

function authToken(req) {

  const auth =
    req.headers.authorization || "";

  if (
    auth.startsWith("Bearer ")
  ) {
    return auth
      .slice(7)
      .trim();
  }

  return clean(
    req.headers["x-auth-token"],
    200
  );
}

async function userFromReq(req) {

  const t =
    authToken(req);

  if (!t) {
    return null;
  }

  const result =
    await q(
      `
      SELECT u.*
      FROM dekhoearn_sessions s
      JOIN dekhoearn_users u
        ON u.id=s.user_id
      WHERE s.token_hash=$1
        AND s.expires_at>NOW()
      LIMIT 1
      `,
      [hash(t)]
    );

  return (
    result.rows[0] ||
    null
  );
}

async function requireAuth(
  req,
  res,
  next
) {

  try {

    const user =
      await userFromReq(req);

    if (!user) {
      return error(
        res,
        401,
        "Authentication required"
      );
    }

    if (user.banned) {
      return error(
        res,
        403,
        "Account is banned"
      );
    }

    req.user = user;

    next();

  } catch (e) {

    console.error(e);

    return error(
      res,
      500,
      "Authentication error"
    );
  }
}

function requireAdmin(
  req,
  res,
  next
) {

  if (
    !ADMIN_KEY ||
    clean(
      req.headers["x-admin-key"]
    ) !== ADMIN_KEY
  ) {
    return error(
      res,
      401,
      "Admin access required"
    );
  }

  next();
}

function publicUser(user) {

  return {
    id: user.id,

    name:
      user.name,

    username:
      user.username,

    email:
      user.email,

    avatar_url:
      user.avatar_url,

    points:
      Number(
        user.points || 0
      ),

    followers_count:
      Number(
        user.followers_count || 0
      ),

    following_count:
      Number(
        user.following_count || 0
      ),

    total_watch_seconds:
      Number(
        user.total_watch_seconds || 0
      ),

    total_videos:
      Number(
        user.total_videos || 0
      ),

    creator_status:
      user.creator_status,

    creator_applied:
      user.creator_applied,

    referral_code:
      user.referral_code,

    created_at:
      user.created_at
  };
}

async function issueSession(
  userId
) {

  const raw =
    token();

  await q(
    `
    INSERT INTO dekhoearn_sessions(
      user_id,
      token_hash,
      expires_at
    )
    VALUES(
      $1,
      $2,
      NOW()+INTERVAL '30 days'
    )
    `,
    [
      userId,
      hash(raw)
    ]
  );

  return raw;
}

async function ledgerPoints(
  client,
  userId,
  amount,
  type,
  description,
  referenceId
) {

  await client.query(
    `
    UPDATE dekhoearn_users
    SET
      points=GREATEST(
        0,
        points+$1
      ),
      updated_at=NOW()
    WHERE id=$2
    `,
    [
      amount,
      userId
    ]
  );

  await client.query(
    `
    INSERT INTO dekhoearn_points_ledger(
      user_id,
      amount,
      type,
      description,
      reference_id
    )
    VALUES(
      $1,
      $2,
      $3,
      $4,
      $5
    )
    `,
    [
      userId,
      amount,
      type,
      description,
      referenceId || null
    ]
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

      if (pool) {

        await q(
          "SELECT 1"
        );

        database = true;
      }

    } catch {}

    return res.json({
      ok: true,
      service:
        "DekhoEarn",
      version:
        "4.0.1",
      database,
      time:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/version",
  (req, res) =>
    json(
      res,
      {
        version:
          "4.0.1",

        min_watch_seconds:
          MIN_WATCH_SECONDS,

        minimum_withdrawal:
          MIN_WITHDRAWAL,

        maximum_withdrawal:
          MAX_WITHDRAWAL,

        points_per_rupee:
          POINTS_PER_RUPEE
      }
    )
);

/* ======================================================
   AUTH ROUTES
====================================================== */

app.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      const name =
        clean(
          req.body.name ||
          req.body.first_name,
          100
        );

      const em =
        email(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      const uname =
        username(
          req.body.username ||
          name
        );

      if (
        !name ||
        !em ||
        password.length < 6
      ) {
        return error(
          res,
          400,
          "Name, valid email and password of at least 6 characters are required"
        );
      }

      if (!uname) {
        return error(
          res,
          400,
          "Valid username required"
        );
      }

      const duplicate =
        await q(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE email=$1
             OR username=$2
          LIMIT 1
          `,
          [
            em,
            uname
          ]
        );

      if (duplicate.rowCount) {
        return error(
          res,
          409,
          "Email or username already exists"
        );
      }

      const referral =
        clean(
          req.body.referral_code,
          50
        );

      let referrer = null;

      if (referral) {

        const rr =
          await q(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code=$1
            LIMIT 1
            `,
            [referral]
          );

        referrer =
          rr.rows[0]?.id ||
          null;
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const referralCode =
        (
          uname +
          crypto
            .randomBytes(3)
            .toString("hex")
        ).slice(
          0,
          50
        );

      const result =
        await q(
          `
          INSERT INTO dekhoearn_users(
            name,
            username,
            email,
            password_hash,
            referral_code,
            referred_by
          )
          VALUES(
            $1,$2,$3,$4,$5,$6
          )
          RETURNING *
          `,
          [
            name,
            uname,
            em,
            passwordHash,
            referralCode,
            referrer
          ]
        );

      const user =
        result.rows[0];

      if (referrer) {

        await q(
          `
          INSERT INTO dekhoearn_referrals(
            referrer_id,
            referred_id,
            reward_points
          )
          VALUES(
            $1,$2,$3
          )
          ON CONFLICT DO NOTHING
          `,
          [
            referrer,
            user.id,
            REFERRAL_REWARD
          ]
        );
      }

      const session =
        await issueSession(
          user.id
        );

      return json(
        res,
        {
          token:
            session,

          user:
            publicUser(user)
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Registration failed"
      );
    }
  }
);

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const identifier =
        email(
          req.body.email ||
          req.body.username
        );

      const password =
        String(
          req.body.password || ""
        );

      const result =
        await q(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE email=$1
             OR username=$1
          LIMIT 1
          `,
          [identifier]
        );

      const user =
        result.rows[0];

      if (
        !user ||
        !user.password_hash ||
        !(await bcrypt.compare(
          password,
          user.password_hash
        ))
      ) {
        return error(
          res,
          401,
          "Invalid login details"
        );
      }

      if (user.banned) {
        return error(
          res,
          403,
          "Account is banned"
        );
      }

      const session =
        await issueSession(
          user.id
        );

      return json(
        res,
        {
          token:
            session,

          user:
            publicUser(user)
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Login failed"
      );
    }
  }
);

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) =>
    json(
      res,
      {
        user:
          publicUser(
            req.user
          )
      }
    )
);

app.post(
  "/api/auth/logout",
  requireAuth,
  async (req, res) => {

    try {

      await q(
        `
        DELETE FROM dekhoearn_sessions
        WHERE token_hash=$1
        `,
        [
          hash(
            authToken(req)
          )
        ]
      );

      return json(
        res,
        {
          message:
            "Logged out"
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Logout failed"
      );
    }
  }
);

app.get(
  "/api/user",
  requireAuth,
  (req, res) =>
    json(
      res,
      {
        user:
          publicUser(
            req.user
          )
      }
    )
);

/* ======================================================
   VIDEO ROUTES
====================================================== */

app.get(
  "/api/videos",
  async (req, res) => {

    try {

      const limit =
        Math.min(
          int(
            req.query.limit,
            20
          ),
          50
        );

      const offset =
        Math.max(
          int(
            req.query.offset,
            0
          ),
          0
        );

      const search =
        clean(
          req.query.search,
          100
        );

      const params = [];

      let where = `
        v.status='active'
        AND
        v.moderation_status='approved'
      `;

      if (search) {

        params.push(
          `%${search}%`
        );

        where += `
          AND (
            v.title ILIKE $${params.length}
            OR
            COALESCE(
              v.description,
              ''
            ) ILIKE $${params.length}
          )
        `;
      }

      params.push(
        limit,
        offset
      );

      const result =
        await q(
          `
          SELECT
            v.*,
            u.username,
            u.name,
            u.avatar_url
          FROM dekhoearn_videos v
          LEFT JOIN dekhoearn_users u
            ON u.id=v.user_id
          WHERE ${where}
          ORDER BY v.created_at DESC
          LIMIT $${params.length - 1}
          OFFSET $${params.length}
          `,
          params
        );

      return json(
        res,
        {
          videos:
            result.rows.map(
              video => ({
                ...video,

                id:
                  Number(video.id),

                user_id:
                  Number(
                    video.user_id
                  ),

                views:
                  Number(
                    video.views
                  ),

                likes_count:
                  Number(
                    video.likes_count
                  ),

                comments_count:
                  Number(
                    video.comments_count
                  ),

                watched_seconds:
                  Number(
                    video.watched_seconds
                  )
              })
            )
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Could not load videos"
      );
    }
  }
);

app.get(
  "/api/videos/mine",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT *
          FROM dekhoearn_videos
          WHERE user_id=$1
          ORDER BY created_at DESC
          `,
          [req.user.id]
        );

      return json(
        res,
        {
          videos:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load your videos"
      );
    }
  }
);

app.get(
  "/api/videos/:id",
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT
            v.*,
            u.username,
            u.name,
            u.avatar_url
          FROM dekhoearn_videos v
          LEFT JOIN dekhoearn_users u
            ON u.id=v.user_id
          WHERE v.id=$1
          `,
          [
            int(
              req.params.id
            )
          ]
        );

      if (!result.rowCount) {
        return error(
          res,
          404,
          "Video not found"
        );
      }

      return json(
        res,
        {
          video:
            result.rows[0]
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load video"
      );
    }
  }
);

app.post(
  "/api/videos",
  requireAuth,
  async (req, res) => {

    try {

      const title =
        clean(
          req.body.title,
          200
        );

      const url =
        clean(
          req.body.video_url ||
          req.body.url,
          2000
        );

      if (
        !title ||
        !url
      ) {
        return error(
          res,
          400,
          "Title and video URL are required"
        );
      }

      const result =
        await q(
          `
          INSERT INTO dekhoearn_videos(
            user_id,
            title,
            description,
            video_url,
            cloudinary_public_id,
            cloudinary_resource_type,
            thumbnail_url,
            duration_seconds
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8
          )
          RETURNING *
          `,
          [
            req.user.id,

            title,

            clean(
              req.body.description,
              2000
            ),

            url,

            clean(
              req.body.cloudinary_public_id,
              500
            ),

            clean(
              req.body.cloudinary_resource_type,
              50
            ) || "video",

            clean(
              req.body.thumbnail_url,
              2000
            ),

            Math.max(
              0,
              int(
                req.body.duration_seconds,
                0
              )
            )
          ]
        );

      await q(
        `
        UPDATE dekhoearn_users
        SET
          total_videos=
            total_videos+1,
          updated_at=NOW()
        WHERE id=$1
        `,
        [req.user.id]
      );

      return json(
        res,
        {
          video:
            result.rows[0]
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Video save failed"
      );
    }
  }
);

app.delete(
  "/api/videos/:id",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          DELETE FROM dekhoearn_videos
          WHERE id=$1
            AND user_id=$2
          RETURNING id
          `,
          [
            int(
              req.params.id
            ),
            req.user.id
          ]
        );

      if (!result.rowCount) {
        return error(
          res,
          404,
          "Video not found"
        );
      }

      return json(
        res,
        {
          message:
            "Video deleted"
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Delete failed"
      );
    }
  }
);

/* ======================================================
   CLOUDINARY
====================================================== */

app.get(
  "/api/cloudinary/signature",
  requireAuth,
  (req, res) => {

    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      return error(
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
      clean(
        req.query.folder,
        200
      ) ||
      CLOUDINARY_FOLDER;

    const toSign =
      `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;

    const signature =
      crypto
        .createHash("sha1")
        .update(toSign)
        .digest("hex");

    return json(
      res,
      {
        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        folder,

        max_file_size:
          MAX_VIDEO_SIZE
      }
    );
  }
);

/* ======================================================
   WATCH REWARD
====================================================== */

app.post(
  "/api/watch/complete",
  requireAuth,
  async (req, res) => {

    if (!pool) {
      return error(
        res,
        503,
        "Database unavailable"
      );
    }

    const client =
      await pool.connect();

    try {

      const videoId =
        int(
          req.body.video_id ||
          req.body.videoId
        );

      const seconds =
        Math.max(
          0,
          int(
            req.body.watch_seconds ||
            req.body.watchSeconds
          )
        );

      if (
        !videoId ||
        seconds <
          MIN_WATCH_SECONDS
      ) {
        return error(
          res,
          400,
          `Watch at least ${MIN_WATCH_SECONDS} seconds`
        );
      }

      await client.query(
        "BEGIN"
      );

      const video =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_videos
          WHERE id=$1
            AND status='active'
            AND moderation_status='approved'
          FOR UPDATE
          `,
          [videoId]
        );

      if (!video.rowCount) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          404,
          "Video not found"
        );
      }

      const existing =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_video_views
          WHERE video_id=$1
            AND user_id=$2
          FOR UPDATE
          `,
          [
            videoId,
            req.user.id
          ]
        );

      if (
        existing.rowCount &&
        existing.rows[0]
          .reward_granted
      ) {

        await client.query(
          `
          UPDATE dekhoearn_video_views
          SET
            watch_seconds=
              GREATEST(
                watch_seconds,
                $1
              ),
            updated_at=NOW()
          WHERE id=$2
          `,
          [
            seconds,
            existing.rows[0].id
          ]
        );

        await client.query(
          "COMMIT"
        );

        return json(
          res,
          {
            points: 0,
            already_rewarded: true
          }
        );
      }

      if (existing.rowCount) {

        await client.query(
          `
          UPDATE dekhoearn_video_views
          SET
            watch_seconds=
              GREATEST(
                watch_seconds,
                $1
              ),
            reward_granted=TRUE,
            updated_at=NOW()
          WHERE id=$2
          `,
          [
            seconds,
            existing.rows[0].id
          ]
        );

      } else {

        await client.query(
          `
          INSERT INTO dekhoearn_video_views(
            video_id,
            user_id,
            watch_seconds,
            reward_granted
          )
          VALUES(
            $1,$2,$3,TRUE
          )
          `,
          [
            videoId,
            req.user.id,
            seconds
          ]
        );
      }

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          views=views+1,
          watched_seconds=
            watched_seconds+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [
          seconds,
          videoId
        ]
      );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          total_watch_seconds=
            total_watch_seconds+$1
        WHERE id=$2
        `,
        [
          seconds,
          req.user.id
        ]
      );

      await ledgerPoints(
        client,
        req.user.id,
        POINTS_PER_WATCH,
        "watch",
        "Video watch reward",
        `watch:${videoId}:${req.user.id}`
      );

      await client.query(
        "COMMIT"
      );

      return json(
        res,
        {
          points:
            POINTS_PER_WATCH,

          earned_points:
            POINTS_PER_WATCH
        }
      );

    } catch (e) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(e);

      return error(
        res,
        500,
        "Watch reward failed"
      );

    } finally {

      client.release();
    }
  }
);

/* ======================================================
   LIKES
====================================================== */

app.post(
  "/api/videos/:id/like",
  requireAuth,
  async (req, res) => {

    try {

      const id =
        int(
          req.params.id
        );

      const existing =
        await q(
          `
          SELECT id
          FROM dekhoearn_likes
          WHERE video_id=$1
            AND user_id=$2
          `,
          [
            id,
            req.user.id
          ]
        );

      if (existing.rowCount) {

        await q(
          `
          DELETE FROM dekhoearn_likes
          WHERE id=$1
          `,
          [
            existing.rows[0].id
          ]
        );

        await q(
          `
          UPDATE dekhoearn_videos
          SET likes_count=
            GREATEST(
              0,
              likes_count-1
            )
          WHERE id=$1
          `,
          [id]
        );

        return json(
          res,
          {
            liked: false
          }
        );
      }

      await q(
        `
        INSERT INTO dekhoearn_likes(
          video_id,
          user_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [
          id,
          req.user.id
        ]
      );

      await q(
        `
        UPDATE dekhoearn_videos
        SET likes_count=
          likes_count+1
        WHERE id=$1
        `,
        [id]
      );

      return json(
        res,
        {
          liked: true
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Like failed"
      );
    }
  }
);

/* ======================================================
   COMMENTS
====================================================== */

app.get(
  "/api/videos/:id/comments",
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT
            c.*,
            u.username,
            u.name,
            u.avatar_url
          FROM dekhoearn_comments c
          LEFT JOIN dekhoearn_users u
            ON u.id=c.user_id
          WHERE c.video_id=$1
          ORDER BY c.created_at DESC
          LIMIT 100
          `,
          [
            int(
              req.params.id
            )
          ]
        );

      return json(
        res,
        {
          comments:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load comments"
      );
    }
  }
);

app.post(
  "/api/videos/:id/comments",
  requireAuth,
  async (req, res) => {

    try {

      const text =
        clean(
          req.body.comment ||
          req.body.text,
          1000
        );

      if (!text) {
        return error(
          res,
          400,
          "Comment required"
        );
      }

      const videoId =
        int(
          req.params.id
        );

      const result =
        await q(
          `
          INSERT INTO dekhoearn_comments(
            video_id,
            user_id,
            comment
          )
          VALUES($1,$2,$3)
          RETURNING *
          `,
          [
            videoId,
            req.user.id,
            text
          ]
        );

      await q(
        `
        UPDATE dekhoearn_videos
        SET comments_count=
          comments_count+1
        WHERE id=$1
        `,
        [videoId]
      );

      return json(
        res,
        {
          comment:
            result.rows[0]
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Comment failed"
      );
    }
  }
);

/* ======================================================
   REPORT
====================================================== */

app.post(
  "/api/videos/:id/report",
  requireAuth,
  async (req, res) => {

    try {

      await q(
        `
        INSERT INTO dekhoearn_reports(
          video_id,
          user_id,
          reason
        )
        VALUES($1,$2,$3)
        ON CONFLICT(
          video_id,
          user_id
        )
        DO UPDATE SET
          reason=EXCLUDED.reason,
          status='pending'
        `,
        [
          int(
            req.params.id
          ),
          req.user.id,
          clean(
            req.body.reason,
            500
          )
        ]
      );

      return json(
        res,
        {
          message:
            "Report submitted"
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Report failed"
      );
    }
  }
);

/* ======================================================
   FOLLOW
====================================================== */

app.post(
  "/api/follow/:creatorId",
  requireAuth,
  async (req, res) => {

    try {

      const creatorId =
        int(
          req.params.creatorId
        );

      if (
        creatorId ===
        Number(req.user.id)
      ) {
        return error(
          res,
          400,
          "Cannot follow yourself"
        );
      }

      const existing =
        await q(
          `
          SELECT id
          FROM dekhoearn_follows
          WHERE follower_id=$1
            AND following_id=$2
          `,
          [
            req.user.id,
            creatorId
          ]
        );

      if (existing.rowCount) {

        await q(
          `
          DELETE FROM dekhoearn_follows
          WHERE id=$1
          `,
          [
            existing.rows[0].id
          ]
        );

        await q(
          `
          UPDATE dekhoearn_users
          SET followers_count=
            GREATEST(
              0,
              followers_count-1
            )
          WHERE id=$1
          `,
          [creatorId]
        );

        await q(
          `
          UPDATE dekhoearn_users
          SET following_count=
            GREATEST(
              0,
              following_count-1
            )
          WHERE id=$1
          `,
          [req.user.id]
        );

        return json(
          res,
          {
            following: false
          }
        );
      }

      await q(
        `
        INSERT INTO dekhoearn_follows(
          follower_id,
          following_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [
          req.user.id,
          creatorId
        ]
      );

      await q(
        `
        UPDATE dekhoearn_users
        SET followers_count=
          followers_count+1
        WHERE id=$1
        `,
        [creatorId]
      );

      await q(
        `
        UPDATE dekhoearn_users
        SET following_count=
          following_count+1
        WHERE id=$1
        `,
        [req.user.id]
      );

      return json(
        res,
        {
          following: true
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Follow failed"
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

    try {

      const result =
        await q(
          `
          INSERT INTO dekhoearn_daily_rewards(
            user_id,
            reward_date,
            points
          )
          VALUES(
            $1,$2,$3
          )
          ON CONFLICT(
            user_id,
            reward_date
          )
          DO NOTHING
          RETURNING id
          `,
          [
            req.user.id,
            dateOnly(),
            DAILY_REWARD
          ]
        );

      if (!result.rowCount) {

        return json(
          res,
          {
            points: 0,
            already_claimed: true
          }
        );
      }

      await q(
        `
        UPDATE dekhoearn_users
        SET points=
          points+$1
        WHERE id=$2
        `,
        [
          DAILY_REWARD,
          req.user.id
        ]
      );

      await q(
        `
        INSERT INTO dekhoearn_points_ledger(
          user_id,
          amount,
          type,
          description,
          reference_id
        )
        VALUES(
          $1,
          $2,
          'daily',
          'Daily reward',
          $3
        )
        `,
        [
          req.user.id,
          DAILY_REWARD,
          `daily:${req.user.id}:${dateOnly()}`
        ]
      );

      return json(
        res,
        {
          points:
            DAILY_REWARD
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Daily reward failed"
      );
    }
  }
);

/* ======================================================
   REWARDED AD
====================================================== */

app.post(
  "/api/rewards/ad",
  requireAuth,
  async (req, res) => {

    try {

      await q(
        `
        INSERT INTO dekhoearn_rewarded_ads(
          user_id,
          points
        )
        VALUES(
          $1,$2
        )
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS
        ]
      );

      await q(
        `
        UPDATE dekhoearn_users
        SET points=
          points+$1
        WHERE id=$2
        `,
        [
          REWARDED_AD_POINTS,
          req.user.id
        ]
      );

      await q(
        `
        INSERT INTO dekhoearn_points_ledger(
          user_id,
          amount,
          type,
          description
        )
        VALUES(
          $1,
          $2,
          'rewarded_ad',
          'Rewarded ad reward'
        )
        `,
        [
          req.user.id,
          REWARDED_AD_POINTS
        ]
      );

      return json(
        res,
        {
          points:
            REWARDED_AD_POINTS
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Ad reward failed"
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

      const result =
        await q(
          `
          SELECT *
          FROM dekhoearn_points_ledger
          WHERE user_id=$1
          ORDER BY created_at DESC
          LIMIT 100
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          history:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load points history"
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

      const result =
        await q(
          `
          SELECT
            vv.*,
            v.title,
            v.video_url
          FROM dekhoearn_video_views vv
          JOIN dekhoearn_videos v
            ON v.id=vv.video_id
          WHERE vv.user_id=$1
          ORDER BY vv.updated_at DESC
          LIMIT 100
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          history:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load watch history"
      );
    }
  }
);

/* ======================================================
   CREATOR
====================================================== */

app.get(
  "/api/creator/stats",
  requireAuth,
  async (req, res) => {

    try {

      const stats =
        await q(
          `
          SELECT
            COUNT(*) videos,
            COALESCE(
              SUM(views),
              0
            ) views,
            COALESCE(
              SUM(watched_seconds),
              0
            ) watched_seconds
          FROM dekhoearn_videos
          WHERE user_id=$1
          `,
          [
            req.user.id
          ]
        );

      const earnings =
        await q(
          `
          SELECT
            COALESCE(
              SUM(creator_amount),
              0
            ) earnings
          FROM dekhoearn_creator_earnings
          WHERE creator_id=$1
            AND status IN(
              'approved',
              'paid'
            )
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          stats: {
            ...stats.rows[0],

            earnings:
              Number(
                earnings.rows[0]
                  .earnings || 0
              ),

            followers:
              Number(
                req.user
                  .followers_count || 0
              )
          }
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load creator stats"
      );
    }
  }
);

app.post(
  "/api/creator/apply",
  requireAuth,
  async (req, res) => {

    try {

      await q(
        `
        UPDATE dekhoearn_users
        SET
          creator_applied=TRUE,
          creator_status=
            CASE
              WHEN creator_status='user'
              THEN 'pending'
              ELSE creator_status
            END
        WHERE id=$1
        `,
        [
          req.user.id
        ]
      );

      return json(
        res,
        {
          message:
            "Creator application submitted"
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Creator application failed"
      );
    }
  }
);

/* ======================================================
   PAYOUT ACCOUNT
====================================================== */

app.get(
  "/api/wallet/payout-account",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT
            id,
            account_type,
            account_name,
            account_identifier,
            status
          FROM dekhoearn_payout_accounts
          WHERE user_id=$1
          LIMIT 1
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          account:
            result.rows[0] ||
            null
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Unable to load payout account"
      );
    }
  }
);

app.post(
  "/api/wallet/payout-account",
  requireAuth,
  async (req, res) => {

    try {

      const accountType =
        cleanString(
          req.body.account_type ||
          req.body.type,
          30
        ).toLowerCase();

      const accountName =
        cleanString(
          req.body.account_name,
          120
        );

      const accountIdentifier =
        cleanString(
          req.body.account_identifier ||
          req.body.upi_id ||
          req.body.account_number,
          150
        );

      if (
        ![
          "upi",
          "bank"
        ].includes(
          accountType
        )
      ) {
        return error(
          res,
          400,
          "Payout type must be UPI or bank"
        );
      }

      if (
        !accountName ||
        !accountIdentifier
      ) {
        return error(
          res,
          400,
          "Payout details are required"
        );
      }

      await q(
        `
        INSERT INTO dekhoearn_payout_accounts(
          user_id,
          account_type,
          account_name,
          account_identifier,
          status
        )
        VALUES(
          $1,$2,$3,$4,'pending'
        )
        ON CONFLICT(user_id)
        DO UPDATE SET
          account_type=
            EXCLUDED.account_type,
          account_name=
            EXCLUDED.account_name,
          account_identifier=
            EXCLUDED.account_identifier,
          status='pending',
          updated_at=NOW()
        `,
        [
          req.user.id,
          accountType,
          accountName,
          accountIdentifier
        ]
      );

      return json(
        res,
        {
          message:
            "Payout account saved",
          status:
            "pending"
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Unable to save payout account"
      );
    }
  }
);

/* ======================================================
   WALLET HELPER
====================================================== */

async function walletBalance(
  userId
) {

  const result =
    await q(
      `
      SELECT
        COALESCE(
          SUM(amount),
          0
        ) balance
      FROM dekhoearn_wallet_ledger
      WHERE user_id=$1
      `,
      [
        userId
      ]
    );

  return Number(
    result.rows[0]
      .balance || 0
  );
}

/* ======================================================
   WALLET
====================================================== */

app.get(
  "/api/wallet",
  requireAuth,
  async (req, res) => {

    try {

      const balance =
        await walletBalance(
          req.user.id
        );

      const pending =
        await q(
          `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) amount
          FROM dekhoearn_withdrawals
          WHERE user_id=$1
            AND status IN(
              'pending',
              'processing'
            )
          `,
          [
            req.user.id
          ]
        );

      const withdrawals =
        await q(
          `
          SELECT *
          FROM dekhoearn_withdrawals
          WHERE user_id=$1
          ORDER BY created_at DESC
          LIMIT 50
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          wallet: {
            balance,

            pending:
              Number(
                pending.rows[0]
                  .amount || 0
              ),

            currency:
              "INR",

            minimum_withdrawal:
              MIN_WITHDRAWAL,

            maximum_withdrawal:
              MAX_WITHDRAWAL,

            points_per_rupee:
              POINTS_PER_RUPEE
          },

          withdrawals:
            withdrawals.rows
        }
      );

    } catch (e) {

      console.error(e);

      return error(
        res,
        500,
        "Could not load wallet"
      );
    }
  }
);

app.get(
  "/api/wallet/history",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT *
          FROM dekhoearn_wallet_ledger
          WHERE user_id=$1
          ORDER BY created_at DESC
          LIMIT 100
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          history:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load wallet history"
      );
    }
  }
);

/* ======================================================
   POINTS -> CASH
====================================================== */

app.post(
  "/api/wallet/convert-points",
  requireAuth,
  async (req, res) => {

    if (!pool) {
      return error(
        res,
        503,
        "Database unavailable"
      );
    }

    const client =
      await pool.connect();

    try {

      const points =
        Math.floor(
          num(
            req.body.points
          )
        );

      if (
        points <= 0 ||
        points %
          POINTS_PER_RUPEE !==
          0
      ) {

        return error(
          res,
          400,
          `Points must be a positive multiple of ${POINTS_PER_RUPEE}`
        );
      }

      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          SELECT points
          FROM dekhoearn_users
          WHERE id=$1
          FOR UPDATE
          `,
          [
            req.user.id
          ]
        );

      const available =
        Number(
          result.rows[0]
            ?.points || 0
        );

      if (
        points > available
      ) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          400,
          "Insufficient points"
        );
      }

      const amount =
        points /
        POINTS_PER_RUPEE;

      const reference =
        `convert:${req.user.id}:${crypto.randomUUID()}`;

      await client.query(
        `
        UPDATE dekhoearn_users
        SET points=
          points-$1
        WHERE id=$2
        `,
        [
          points,
          req.user.id
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger(
          user_id,
          amount,
          type,
          description,
          reference_id
        )
        VALUES(
          $1,
          $2,
          'conversion',
          'Points converted to cash',
          $3
        )
        `,
        [
          req.user.id,
          -points,
          reference
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_cash_earnings(
          user_id,
          amount,
          type,
          description,
          reference_id
        )
        VALUES(
          $1,
          $2,
          'points_conversion',
          'Points converted to wallet',
          $3
        )
        ON CONFLICT DO NOTHING
        `,
        [
          req.user.id,
          amount,
          reference
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_wallet_ledger(
          user_id,
          amount,
          type,
          description,
          reference_id
        )
        VALUES(
          $1,
          $2,
          'credit',
          'Points conversion',
          $3
        )
        `,
        [
          req.user.id,
          amount,
          reference
        ]
      );

      await client.query(
        "COMMIT"
      );

      return json(
        res,
        {
          converted_points:
            points,

          amount,

          balance:
            await walletBalance(
              req.user.id
            )
        }
      );

    } catch (e) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(e);

      return error(
        res,
        500,
        "Conversion failed"
      );

    } finally {

      client.release();
    }
  }
);

/* ======================================================
   WITHDRAWAL
====================================================== */

app.post(
  "/api/withdraw",
  requireAuth,
  async (req, res) => {

    if (!pool) {
      return error(
        res,
        503,
        "Database unavailable"
      );
    }

    const client =
      await pool.connect();

    try {

      const amount =
        Math.round(
          num(
            req.body.amount
          ) * 100
        ) / 100;

      if (
        amount <
        MIN_WITHDRAWAL
      ) {
        return error(
          res,
          400,
          `Minimum withdrawal is ₹${MIN_WITHDRAWAL}`
        );
      }

      if (
        amount >
        MAX_WITHDRAWAL
      ) {
        return error(
          res,
          400,
          `Maximum withdrawal is ₹${MAX_WITHDRAWAL}`
        );
      }

      await client.query(
        "BEGIN"
      );

      const account =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_payout_accounts
          WHERE user_id=$1
            AND status!='rejected'
          LIMIT 1
          `,
          [
            req.user.id
          ]
        );

      if (!account.rowCount) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          400,
          "Add a UPI or bank payout account first"
        );
      }

      const balanceResult =
        await client.query(
          `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) balance
          FROM dekhoearn_wallet_ledger
          WHERE user_id=$1
          `,
          [
            req.user.id
          ]
        );

      const balance =
        Number(
          balanceResult
            .rows[0]
            .balance || 0
        );

      if (
        amount > balance
      ) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          400,
          "Insufficient available wallet balance"
        );
      }

      const existing =
        await client.query(
          `
          SELECT id
          FROM dekhoearn_withdrawals
          WHERE user_id=$1
            AND status IN(
              'pending',
              'processing'
            )
          LIMIT 1
          FOR UPDATE
          `,
          [
            req.user.id
          ]
        );

      if (existing.rowCount) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          400,
          "You already have a withdrawal pending"
        );
      }

      const reference =
        `withdraw:${req.user.id}:${crypto.randomUUID()}`;

      const withdrawal =
        await client.query(
          `
          INSERT INTO dekhoearn_withdrawals(
            user_id,
            amount,
            payout_account_id,
            status,
            provider_reference
          )
          VALUES(
            $1,
            $2,
            $3,
            'pending',
            $4
          )
          RETURNING *
          `,
          [
            req.user.id,
            amount,
            account.rows[0].id,
            reference
          ]
        );

      await client.query(
        `
        INSERT INTO dekhoearn_wallet_ledger(
          user_id,
          amount,
          type,
          description,
          reference_id
        )
        VALUES(
          $1,
          $2,
          'hold',
          'Withdrawal request',
          $3
        )
        `,
        [
          req.user.id,
          -amount,
          reference
        ]
      );

      await client.query(
        "COMMIT"
      );

      return json(
        res,
        {
          withdrawal:
            withdrawal.rows[0],

          reference,

          message:
            "Withdrawal request submitted. Payment will be marked paid only after payout confirmation."
        }
      );

    } catch (e) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(e);

      return error(
        res,
        500,
        "Withdrawal request failed"
      );

    } finally {

      client.release();
    }
  }
);

app.get(
  "/api/withdrawals",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT
            w.*,
            p.account_type,
            p.account_name
          FROM dekhoearn_withdrawals w
          LEFT JOIN dekhoearn_payout_accounts p
            ON p.id=w.payout_account_id
          WHERE w.user_id=$1
          ORDER BY w.created_at DESC
          LIMIT 100
          `,
          [
            req.user.id
          ]
        );

      return json(
        res,
        {
          withdrawals:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load withdrawals"
      );
    }
  }
);

/* ======================================================
   ADMIN WITHDRAWALS
====================================================== */

app.get(
  "/api/admin/withdrawals",
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT
            w.*,
            u.username,
            u.name,
            u.email,
            p.account_type,
            p.account_name,
            p.account_identifier
          FROM dekhoearn_withdrawals w
          JOIN dekhoearn_users u
            ON u.id=w.user_id
          LEFT JOIN dekhoearn_payout_accounts p
            ON p.id=w.payout_account_id
          ORDER BY w.created_at DESC
          LIMIT 500
          `
        );

      return json(
        res,
        {
          withdrawals:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load withdrawals"
      );
    }
  }
);

app.post(
  "/api/admin/withdrawals/:id/status",
  requireAdmin,
  async (req, res) => {

    if (!pool) {
      return error(
        res,
        503,
        "Database unavailable"
      );
    }

    const client =
      await pool.connect();

    try {

      const id =
        int(
          req.params.id
        );

      const status =
        clean(
          req.body.status,
          30
        );

      const allowed = [
        "pending",
        "processing",
        "paid",
        "failed",
        "rejected"
      ];

      if (
        !allowed.includes(
          status
        )
      ) {
        return error(
          res,
          400,
          "Invalid withdrawal status"
        );
      }

      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_withdrawals
          WHERE id=$1
          FOR UPDATE
          `,
          [id]
        );

      if (!result.rowCount) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          404,
          "Withdrawal not found"
        );
      }

      const withdrawal =
        result.rows[0];

      if (
        withdrawal.status ===
          "paid" &&
        status !== "paid"
      ) {

        await client.query(
          "ROLLBACK"
        );

        return error(
          res,
          400,
          "Paid withdrawal cannot be reverted"
        );
      }

      /*
       * If a withdrawal is rejected or failed,
       * return the held amount to wallet.
       */

      if (
        (
          status === "failed" ||
          status === "rejected"
        ) &&
        (
          withdrawal.status ===
            "pending" ||
          withdrawal.status ===
            "processing"
        )
      ) {

        const refundReference =
          `refund:${withdrawal.id}`;

        await client.query(
          `
          INSERT INTO dekhoearn_wallet_ledger(
            user_id,
            amount,
            type,
            description,
            reference_id
          )
          VALUES(
            $1,
            $2,
            'refund',
            'Withdrawal failed/rejected refund',
            $3
          )
          ON CONFLICT(
            reference_id
          )
          DO NOTHING
          `,
          [
            withdrawal.user_id,
            withdrawal.amount,
            refundReference
          ]
        );
      }

      await client.query(
        `
        UPDATE dekhoearn_withdrawals
        SET
          status=$1,
          admin_note=$2,
          updated_at=NOW(),
          paid_at=
            CASE
              WHEN $1='paid'
              THEN NOW()
              ELSE paid_at
            END
        WHERE id=$3
        `,
        [
          status,

          clean(
            req.body.note,
            500
          ),

          id
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_admin_actions(
          admin_identifier,
          action,
          target_type,
          target_id,
          reason
        )
        VALUES(
          $1,
          $2,
          'withdrawal',
          $3,
          $4
        )
        `,
        [
          "admin",
          "withdrawal_status",
          String(id),

          clean(
            req.body.note,
            500
          )
        ]
      );

      await client.query(
        "COMMIT"
      );

      return json(
        res,
        {
          message:
            "Withdrawal status updated"
        }
      );

    } catch (e) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(e);

      return error(
        res,
        500,
        "Status update failed"
      );

    } finally {

      client.release();
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
        await q(
          `
          SELECT
            id,
            name,
            username,
            email,
            points,
            followers_count,
            total_videos,
            creator_status,
            banned,
            created_at
          FROM dekhoearn_users
          ORDER BY created_at DESC
          LIMIT 500
          `
        );

      return json(
        res,
        {
          users:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load users"
      );
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
        await q(
          `
          SELECT
            r.*,
            v.title,
            u.username
          FROM dekhoearn_reports r
          LEFT JOIN dekhoearn_videos v
            ON v.id=r.video_id
          LEFT JOIN dekhoearn_users u
            ON u.id=r.user_id
          ORDER BY r.created_at DESC
          LIMIT 500
          `
        );

      return json(
        res,
        {
          reports:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load reports"
      );
    }
  }
);

/* ======================================================
   ADMIN VIDEOS
====================================================== */

app.get(
  "/api/admin/videos",
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await q(
          `
          SELECT *
          FROM dekhoearn_videos
          ORDER BY created_at DESC
          LIMIT 500
          `
        );

      return json(
        res,
        {
          videos:
            result.rows
        }
      );

    } catch (e) {

      return error(
        res,
        500,
        "Could not load videos"
      );
    }
  }
);

/* ======================================================
   STATIC FRONTEND
   MUST BE AFTER ALL API ROUTES
====================================================== */

const publicDir =
  __dirname;

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

/*
 * Express 5 catch-all.
 * API routes have already been registered above.
 */

app.get(
  "/{*splat}",
  (req, res) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return error(
        res,
        404,
        "API route not found"
      );
    }

    return res.sendFile(
      path.join(
        publicDir,
        "index.html"
      )
    );
  }
);

/* ======================================================
   START SERVER
====================================================== */

let server = null;

async function start() {

  try {

    if (!pool) {

      console.warn(
        "WARNING: DATABASE_URL is not configured"
      );

      console.warn(
        "Database features will be unavailable."
      );

    } else {

      console.log(
        "Initializing database..."
      );

      await initDB();

      console.log(
        "Database initialized successfully."
      );
    }

    server =
      app.listen(
        PORT,
        () => {

          console.log(
            `DekhoEarn server v4.0.1 running on ${APP_BASE_URL}`
          );

          console.log(
            `Port: ${PORT}`
          );

        }
      );

  } catch (e) {

    console.error(
      "SERVER START FAILED:",
      e
    );

    process.exit(1);
  }
}

/* ======================================================
   GRACEFUL SHUTDOWN
   ONLY ONE SIGTERM + ONE SIGINT
====================================================== */

let shuttingDown = false;

async function shutdown(
  signal
) {

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `${signal} received. Shutting down...`
  );

  try {

    if (server) {

      await new Promise(
        resolve => {
          server.close(
            () => resolve()
          );
        }
      );

      console.log(
        "HTTP server closed."
      );
    }

  } catch (e) {

    console.error(
      "HTTP shutdown error:",
      e
    );
  }

  try {

    if (pool) {

      await pool.end();

      console.log(
        "Database connection closed."
      );
    }

  } catch (e) {

    console.error(
      "Database shutdown error:",
      e
    );
  }

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => {
    shutdown("SIGTERM");
  }
);

process.on(
  "SIGINT",
  () => {
    shutdown("SIGINT");
  }
);

/* ======================================================
   UNHANDLED ERRORS
====================================================== */

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "Uncaught Exception:",
      error
    );

    /*
     * Do not immediately kill the process here.
     * Render/Node can still report the error.
     */
  }
);

/* ======================================================
   START APPLICATION
====================================================== */

start();
