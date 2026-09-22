/*
=========================================================
 DEKHOEARN SERVER
 Version 3.1.2 FINAL
 --------------------------------------------------------
 Secure Authentication
 Neon PostgreSQL
 Cloudinary Signed Upload
 Video Feed
 Watch Rewards
 Likes / Comments / Reports
 Follow System
 Daily Rewards
 Rewarded Ads Demo
 Points History
 Watch History
 Creator Dashboard
 Monetization
 Payout Accounts
 Admin
 PWA
 Database Migrations
 Optional Referral System
 Existing Database Compatibility
=========================================================
*/

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();

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

const AUTH_TOKEN_DAYS = 30;

const MAX_VIDEO_BYTES =
  100 * 1024 * 1024;

const MIN_WATCH_SECONDS = 10;

const WATCH_REWARD = 1;
const DAILY_REWARD = 10;
const REWARDED_AD_POINTS = 5;
const REFERRAL_REWARD = 10;

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

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
}

/* ======================================================
   DATABASE
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

  return pool.query(text, params);
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
  max = 5000
) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 30);
}

function isValidUsername(username) {
  return /^[a-z0-9_.-]{3,30}$/.test(
    username
  );
}

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6
  );
}

function hashPassword(
  password,
  saltHex
) {
  const salt = saltHex
    ? Buffer.from(saltHex, "hex")
    : crypto.randomBytes(16);

  const hash = crypto.scryptSync(
    password,
    salt,
    64
  );

  return {
    salt: salt.toString("hex"),
    hash: hash.toString("hex")
  };
}

function verifyPassword(
  password,
  saltHex,
  storedHashHex
) {
  try {
    const salt = Buffer.from(
      saltHex,
      "hex"
    );

    const storedHash =
      Buffer.from(
        storedHashHex,
        "hex"
      );

    const calculatedHash =
      crypto.scryptSync(
        password,
        salt,
        storedHash.length
      );

    return crypto.timingSafeEqual(
      calculatedHash,
      storedHash
    );
  } catch {
    return false;
  }
}

function createAuthToken() {
  const token =
    crypto.randomBytes(32).toString("hex");

  const tokenHash =
    crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

  const expiresAt = new Date(
    Date.now() +
      AUTH_TOKEN_DAYS *
        24 *
        60 *
        60 *
        1000
  );

  return {
    token,
    tokenHash,
    expiresAt
  };
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getBearerToken(req) {
  const header = String(
    req.headers.authorization || ""
  );

  if (header.startsWith("Bearer ")) {
    return header
      .slice(7)
      .trim();
  }

  return String(
    req.headers["x-auth-token"] || ""
  ).trim();
}

function generateReferralCode() {
  return (
    "DEKHO" +
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase()
  );
}

function safeNumber(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

/* ======================================================
   SAFE USER
====================================================== */

function safeUser(row) {
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
      safeNumber(row.points),

    total_earned:
      safeNumber(row.total_earned),

    watched_videos:
      safeNumber(row.watched_videos),

    today_earned:
      safeNumber(row.today_earned),

    followers_count:
      safeNumber(row.followers_count),

    following_count:
      safeNumber(row.following_count),

    is_creator:
      Boolean(row.is_creator),

    monetization_status:
      row.monetization_status ||
      "not_applied",

    referral_code:
      row.referral_code || "",

    created_at:
      row.created_at
  };
}

async function getSafeUserById(id) {
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

  if (!result.rows.length) {
    return null;
  }

  return safeUser(
    result.rows[0]
  );
}

/* ======================================================
   SAFE VIDEO
====================================================== */

function safeVideo(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    user_id:
      row.user_id,

    creator_id:
      row.creator_id ||
      row.user_id,

    title:
      row.title || "",

    description:
      row.description || "",

    video_url:
      row.video_url || "",

    thumbnail_url:
      row.thumbnail_url || "",

    cloudinary_public_id:
      row.cloudinary_public_id || "",

    cloudinary_resource_type:
      row.cloudinary_resource_type ||
      "video",

    cloudinary_format:
      row.cloudinary_format || "",

    duration:
      safeNumber(row.duration),

    bytes:
      safeNumber(row.bytes),

    views:
      safeNumber(row.views),

    likes_count:
      safeNumber(row.likes_count),

    comments_count:
      safeNumber(
        row.comments_count
      ),

    watch_seconds:
      safeNumber(
        row.watch_seconds
      ),

    status:
      row.status || "published",

    moderation_status:
      row.moderation_status ||
      "normal",

    duplicate_warning:
      Boolean(
        row.duplicate_warning
      ),

    creator_username:
      row.creator_username || "",

    creator_name:
      row.creator_name || "",

    created_at:
      row.created_at
  };
}

/* ======================================================
   AUTHENTICATION
====================================================== */

async function getAuthenticatedUser(
  req
) {
  const token =
    getBearerToken(req);

  if (!token || !pool) {
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
        AND auth_token_expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

  return (
    result.rows[0] || null
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
        message: "Login required"
      });
    }

    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      message:
        "Authentication failed"
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
  const suppliedKey =
    String(
      req.headers["x-admin-key"] ||
        req.query.admin_key ||
        ""
    );

  if (!ADMIN_KEY) {
    return res.status(503).json({
      ok: false,
      message:
        "Admin system is not configured"
    });
  }

  if (
    !suppliedKey ||
    suppliedKey !== ADMIN_KEY
  ) {
    return res.status(403).json({
      ok: false,
      message:
        "Admin access denied"
    });
  }

  next();
}

/* ======================================================
   CLOUDINARY
====================================================== */

function signCloudinaryParams(
  params
) {
  const entries =
    Object.entries(params)
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ""
      )
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      );

  const serialized =
    entries
      .map(
        ([key, value]) =>
          `${key}=${value}`
      )
      .join("&");

  return crypto
    .createHash("sha1")
    .update(
      serialized +
        CLOUDINARY_API_SECRET
    )
    .digest("hex");
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDatabase() {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is missing"
    );
  }

  console.log(
    "Initializing database..."
  );

  /* ----------------------------------------------------
     USERS
  ---------------------------------------------------- */

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

  /*
   IMPORTANT:
   Existing Neon database may have been created
   using an older version.

   These migrations make the old table compatible.
  */

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT ''
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
    ADD COLUMN IF NOT EXISTS auth_token_hash TEXT DEFAULT ''
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS auth_token_expires_at TIMESTAMPTZ
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS points BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS total_earned BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS watched_videos BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS today_earned BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS monetization_status TEXT NOT NULL DEFAULT 'not_applied'
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
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  /* ----------------------------------------------------
     EXISTING USER DEFAULT CLEANUP
  ---------------------------------------------------- */

  await dbQuery(`
    UPDATE dekhoearn_users
    SET
      first_name = COALESCE(first_name, ''),
      points = COALESCE(points, 0),
      total_earned = COALESCE(total_earned, 0),
      watched_videos = COALESCE(watched_videos, 0),
      today_earned = COALESCE(today_earned, 0),
      is_creator = COALESCE(is_creator, FALSE),
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
      updated_at =
        COALESCE(
          updated_at,
          NOW()
        )
  `);

  /* ----------------------------------------------------
     VIDEOS
  ---------------------------------------------------- */

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
      cloudinary_resource_type TEXT DEFAULT 'video',
      cloudinary_format TEXT DEFAULT '',
      duration NUMERIC(18,3) DEFAULT 0,
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
    ADD COLUMN IF NOT EXISTS cloudinary_format TEXT DEFAULT ''
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS duration NUMERIC(18,3) DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS bytes BIGINT DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'normal'
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE
  `);

  /* ----------------------------------------------------
     VIDEO VIEWS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      watch_seconds BIGINT NOT NULL DEFAULT 0,
      reward_points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, video_id)
    )
  `);

  /* ----------------------------------------------------
     LIKES
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, video_id)
    )
  `);

  /* ----------------------------------------------------
     COMMENTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     REPORTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     FOLLOWS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, creator_id)
    )
  `);

  /* ----------------------------------------------------
     POINTS LEDGER
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      points BIGINT NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      description TEXT DEFAULT '',
      reference_id TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     DAILY REWARDS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_points BIGINT NOT NULL DEFAULT 10,
      reward_date DATE NOT NULL DEFAULT CURRENT_DATE,
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
      user_id TEXT NOT NULL,
      reward_points BIGINT NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     REFERRALS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL UNIQUE,
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
      creator_id TEXT NOT NULL,
      video_id BIGINT,
      amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      source TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     PAYOUT ACCOUNTS
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL,
      account_details TEXT NOT NULL,
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
      action TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* ----------------------------------------------------
     INDEXES
  ---------------------------------------------------- */

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_videos_created_idx
    ON dekhoearn_videos(created_at DESC)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_videos_user_idx
    ON dekhoearn_videos(user_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_videos_creator_idx
    ON dekhoearn_videos(creator_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_comments_video_idx
    ON dekhoearn_comments(video_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_points_user_idx
    ON dekhoearn_points_ledger(
      user_id,
      created_at DESC
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_auth_token_idx
    ON dekhoearn_users(auth_token_hash)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS dekhoearn_referral_code_idx
    ON dekhoearn_users(referral_code)
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
  async (req, res) => {
    let database = false;

    if (pool) {
      try {
        await dbQuery(
          "SELECT 1"
        );

        database = true;
      } catch {
        database = false;
      }
    }

    res.json({
      ok: true,

      app: "DekhoEarn",

      version:
        SERVER_VERSION,

      status:
        database
          ? "healthy"
          : "degraded",

      database,

      cloudinary:
        Boolean(
          CLOUDINARY_CLOUD_NAME &&
            CLOUDINARY_API_KEY &&
            CLOUDINARY_API_SECRET
        ),

      timestamp:
        new Date().toISOString()
    });
  }
);

/* ======================================================
   AUTH REGISTER
   REFERRAL IS OPTIONAL
====================================================== */

app.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const firstName =
        cleanText(
          req.body.first_name ||
            req.body.name,
          80
        );

      const username =
        normalizeUsername(
          req.body.username
        );

      const password =
        String(
          req.body.password || ""
        );

      /*
       IMPORTANT:
       Referral is optional.
       Empty referral = normal registration.
      */

      const referralCode =
        cleanText(
          req.body.referral_code ||
            req.body.referral,
          50
        ).toUpperCase();

      if (!firstName) {
        return res.status(400).json({
          ok: false,
          message:
            "Name is required"
        });
      }

      if (
        !isValidUsername(
          username
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Username must be 3-30 characters"
        });
      }

      if (
        !isValidPassword(
          password
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
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

      if (existing.rows.length) {
        return res.status(409).json({
          ok: false,
          message:
            "Username already exists"
        });
      }

      const id =
        randomId(16);

      const passwordData =
        hashPassword(
          password
        );

      /*
       Referral lookup happens ONLY
       when user entered a referral.
      */

      let referralOwner = null;

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

        referralOwner =
          refResult.rows[0] ||
          null;
      }

      /* ------------------------------------------------
         GENERATE UNIQUE REFERRAL CODE
      ------------------------------------------------ */

      let userReferralCode =
        "";

      for (
        let i = 0;
        i < 5;
        i++
      ) {
        const candidate =
          generateReferralCode();

        const check =
          await dbQuery(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code = $1
            LIMIT 1
            `,
            [candidate]
          );

        if (
          !check.rows.length
        ) {
          userReferralCode =
            candidate;

          break;
        }
      }

      if (
        !userReferralCode
      ) {
        userReferralCode =
          generateReferralCode() +
          Date.now()
            .toString()
            .slice(-4);
      }

      const auth =
        createAuthToken();

      const client =
        await pool.connect();

      try {
        await client.query(
          "BEGIN"
        );

        const userResult =
          await client.query(
            `
            INSERT INTO dekhoearn_users (
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
              $1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9
            )
            RETURNING *
            `,
            [
              id,

              username,

              firstName,

              passwordData.hash,

              passwordData.salt,

              auth.tokenHash,

              auth.expiresAt,

              userReferralCode,

              referralOwner
                ? referralOwner.id
                : null
            ]
          );

        /*
         Referral reward only when
         a valid referral owner exists.
        */

        if (
          referralOwner &&
          referralOwner.id !== id
        ) {
          const referralInsert =
            await client.query(
              `
              INSERT INTO dekhoearn_referrals (
                referrer_id,
                referred_id,
                reward_points
              )
              VALUES ($1,$2,$3)
              ON CONFLICT (referred_id)
              DO NOTHING
              RETURNING id
              `,
              [
                referralOwner.id,

                id,

                REFERRAL_REWARD
              ]
            );

          /*
           Only award points when the
           referral record was actually inserted.
          */

          if (
            referralInsert.rows
              .length
          ) {
            await client.query(
              `
              UPDATE dekhoearn_users
              SET
                points =
                  points + $1,

                total_earned =
                  total_earned + $1,

                updated_at =
                  NOW()

              WHERE id = $2
              `,
              [
                REFERRAL_REWARD,

                referralOwner.id
              ]
            );

            await client.query(
              `
              INSERT INTO dekhoearn_points_ledger (
                user_id,
                points,
                type,
                description,
                reference_id
              )
              VALUES (
                $1,$2,'referral',
                'Referral reward',
                $3
              )
              `,
              [
                referralOwner.id,

                REFERRAL_REWARD,

                id
              ]
            );
          }
        }

        await client.query(
          "COMMIT"
        );

        const user =
          await getSafeUserById(
            id
          );

        return res.json({
          ok: true,

          message:
            "Registration successful",

          user,

          token:
            auth.token
        });
      } catch (error) {
        await client.query(
          "ROLLBACK"
        );

        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
          "Registration failed"
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
          message:
            "Invalid username or password"
        });
      }

      const userRow =
        result.rows[0];

      if (
        !userRow.password_hash ||
        !userRow.password_salt
      ) {
        return res.status(401).json({
          ok: false,
          message:
            "This account needs to be registered again with a password"
        });
      }

      const valid =
        verifyPassword(
          password,

          userRow.password_salt,

          userRow.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          ok: false,
          message:
            "Invalid username or password"
        });
      }

      const auth =
        createAuthToken();

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          auth_token_hash = $1,
          auth_token_expires_at = $2,
          last_login_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          auth.tokenHash,

          auth.expiresAt,

          userRow.id
        ]
      );

      const user =
        await getSafeUserById(
          userRow.id
        );

      return res.json({
        ok: true,

        message:
          "Login successful",

        user,

        token:
          auth.token
      });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        message:
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
  async (req, res) => {
    try {
      const user =
        await getSafeUserById(
          req.userId
        );

      if (!user) {
        return res.status(401).json({
          ok: false,
          message:
            "User not found"
        });
      }

      res.json({
        ok: true,
        user
      });
    } catch (error) {
      console.error(
        "ME ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
          "Unable to load session"
      });
    }
  }
);

/* ======================================================
   AUTH LOGOUT
====================================================== */

app.post(
  "/api/auth/logout",
  async (req, res) => {
    try {
      const token =
        getBearerToken(req);

      if (token) {
        await dbQuery(
          `
          UPDATE dekhoearn_users
          SET
            auth_token_hash = '',
            auth_token_expires_at = NULL,
            updated_at = NOW()
          WHERE auth_token_hash = $1
          `,
          [hashToken(token)]
        );
      }

      res.json({
        ok: true,
        message:
          "Logged out"
      });
    } catch (error) {
      console.error(
        "LOGOUT ERROR:",
        error
      );

      res.json({
        ok: true,
        message:
          "Logged out"
      });
    }
  }
);

/* ======================================================
   CURRENT USER
====================================================== */

app.get(
  "/api/user/:id",
  requireUser,
  async (req, res) => {
    try {
      if (
        String(req.params.id) !==
        String(req.userId)
      ) {
        return res.status(403).json({
          ok: false,
          message:
            "Access denied"
        });
      }

      const user =
        await getSafeUserById(
          req.userId
        );

      if (!user) {
        return res.status(404).json({
          ok: false,
          message:
            "User not found"
        });
      }

      res.json({
        ok: true,
        user
      });
    } catch (error) {
      console.error(
        "USER ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
          "Unable to load user"
      });
    }
  }
);

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

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
          message:
            "Cloudinary is not configured"
        });
      }

      const timestamp =
        Math.floor(
          Date.now() / 1000
        );

      const params = {
        timestamp,

        folder:
          CLOUDINARY_FOLDER
      };

      const signature =
        signCloudinaryParams(
          params
        );

      res.json({
        ok: true,

        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        folder:
          CLOUDINARY_FOLDER,

        resource_type:
          "video"
      });
    } catch (error) {
      console.error(
        "CLOUDINARY SIGNATURE ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
          "Unable to create upload signature"
      });
    }
  }
);

/* ======================================================
   VIDEOS FEED
====================================================== */

app.get(
  "/api/videos",
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
        ) === "1";

      if (
        creatorId &&
        mine
      ) {
        const user =
          await getAuthenticatedUser(
            req
          );

        if (
          !user ||
          String(user.id) !==
            String(creatorId)
        ) {
          return res.status(403).json({
            ok: false,
            message:
              "Access denied"
          });
        }

        const result =
          await dbQuery(
            `
            SELECT
              v.*,
              u.username AS creator_username,
              u.first_name AS creator_name

            FROM dekhoearn_videos v

            LEFT JOIN dekhoearn_users u
              ON u.id = v.creator_id

            WHERE v.creator_id = $1

            ORDER BY v.created_at DESC

            LIMIT 100
            `,
            [creatorId]
          );

        return res.json({
          ok: true,

          videos:
            result.rows.map(
              safeVideo
            )
        });
      }

      const where =
        creatorId
          ? `
            WHERE v.creator_id = $1
              AND v.status = 'published'
          `
          : `
            WHERE v.status = 'published'
          `;

      const params =
        creatorId
          ? [creatorId]
          : [];

      const result =
        await dbQuery(
          `
          SELECT
            v.*,
            u.username AS creator_username,
            u.first_name AS creator_name

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
            ON u.id = v.creator_id

          ${where}

          ORDER BY v.created_at DESC

          LIMIT 100
          `,
          params
        );

      res.json({
        ok: true,

        videos:
          result.rows.map(
            safeVideo
          )
      });
    } catch (error) {
      console.error(
        "VIDEO FEED ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
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
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            v.*,
            u.username AS creator_username,
            u.first_name AS creator_name

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
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
          message:
            "Video not found"
        });
      }

      res.json({
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

      res.status(500).json({
        ok: false,
        message:
          "Unable to load video"
      });
    }
  }
);

/* ======================================================
   CREATE VIDEO METADATA
====================================================== */

app.post(
  "/api/videos",
  requireUser,
  async (req, res) => {
    try {
      const title =
        cleanText(
          req.body.title,
          150
        );

      const description =
        cleanText(
          req.body.description,
          3000
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
          req.body.cloudinary_format,
          30
        );

      const duration =
        Math.max(
          0,
          Math.min(
            safeNumber(
              req.body.duration
            ),
            86400
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
          message:
            "Video title is required"
        });
      }

      if (
        !videoUrl.startsWith(
          "https://res.cloudinary.com/"
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Only Cloudinary video URLs are allowed"
        });
      }

      if (!publicId) {
        return res.status(400).json({
          ok: false,
          message:
            "Cloudinary public ID is required"
        });
      }

      if (
        bytes > MAX_VIDEO_BYTES
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Maximum video size is 100 MB"
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_videos (
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
            status,
            moderation_status
          )

          VALUES (
            $1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            'published','normal'
          )

          RETURNING *
          `,
          [
            req.userId,

            title,

            description,

            videoUrl,

            thumbnailUrl,

            publicId,

            resourceType,

            format,

            duration,

            bytes
          ]
        );

      res.json({
        ok: true,

        message:
          "Video published successfully",

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

      res.status(500).json({
        ok: false,
        message:
          "Unable to save video"
      });
    }
  }
);

/* ======================================================
   DELETE VIDEO
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
            AND creator_id = $2

          RETURNING id
          `,
          [
            req.params.id,
            req.userId
          ]
        );

      if (
        !result.rows.length
      ) {
        return res.status(404).json({
          ok: false,
          message:
            "Video not found or access denied"
        });
      }

      res.json({
        ok: true,

        message:
          "Video deleted successfully"
      });
    } catch (error) {
      console.error(
        "DELETE VIDEO ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
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
          Math.min(
            Math.floor(
              safeNumber(
                req.body.watch_seconds
              )
            ),
            86400
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
            "Invalid video"
        });
      }

      /*
       Server-side reward protection.
       User must actually watch at least
       MIN_WATCH_SECONDS before first reward.
      */

      if (
        watchSeconds <
        MIN_WATCH_SECONDS
      ) {
        return res.status(400).json({
          ok: false,
          message:
            `Watch at least ${MIN_WATCH_SECONDS} seconds to earn points`
        });
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

      if (
        !videoResult.rows.length
      ) {
        throw new Error(
          "Video not found"
        );
      }

      const video =
        videoResult.rows[0];

      if (
        video.status !==
        "published"
      ) {
        throw new Error(
          "Video is not available"
        );
      }

      const existingResult =
        await client.query(
          `
          SELECT *
          FROM dekhoearn_video_views

          WHERE user_id = $1
            AND video_id = $2

          FOR UPDATE
          `,
          [
            req.userId,
            videoId
          ]
        );

      let reward = 0;

      if (
        !existingResult.rows.length
      ) {
        reward =
          WATCH_REWARD;

        await client.query(
          `
          INSERT INTO dekhoearn_video_views (
            user_id,
            video_id,
            watch_seconds,
            reward_points
          )

          VALUES (
            $1,$2,$3,$4
          )
          `,
          [
            req.userId,

            videoId,

            watchSeconds,

            reward
          ]
        );

        await client.query(
          `
          UPDATE dekhoearn_videos

          SET
            views =
              views + 1,

            watch_seconds =
              watch_seconds + $1,

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
              points + $1,

            total_earned =
              total_earned + $1,

            watched_videos =
              watched_videos + 1,

            today_earned =
              today_earned + $1,

            updated_at =
              NOW()

          WHERE id = $2
          `,
          [
            reward,

            req.userId
          ]
        );

        await client.query(
          `
          INSERT INTO dekhoearn_points_ledger (
            user_id,
            points,
            type,
            description,
            reference_id
          )

          VALUES (
            $1,$2,'watch',
            'Video watch reward',
            $3
          )
          `,
          [
            req.userId,

            reward,

            String(videoId)
          ]
        );
      } else {
        const oldSeconds =
          safeNumber(
            existingResult
              .rows[0]
              .watch_seconds
          );

        const newSeconds =
          Math.max(
            oldSeconds,

            watchSeconds
          );

        const delta =
          Math.max(
            0,

            newSeconds -
              oldSeconds
          );

        await client.query(
          `
          UPDATE dekhoearn_video_views

          SET watch_seconds = $1

          WHERE user_id = $2
            AND video_id = $3
          `,
          [
            newSeconds,

            req.userId,

            videoId
          ]
        );

        if (delta > 0) {
          await client.query(
            `
            UPDATE dekhoearn_videos

            SET
              watch_seconds =
                watch_seconds + $1,

              updated_at =
                NOW()

            WHERE id = $2
            `,
            [
              delta,

              videoId
            ]
          );
        }
      }

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.userId
        );

      res.json({
        ok: true,

        reward,

        user
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "WATCH ERROR:",
        error
      );

      res.status(400).json({
        ok: false,

        message:
          error.message ||
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
  async (req, res) => {
    try {
      if (
        String(req.params.id) !==
        String(req.userId)
      ) {
        return res.status(403).json({
          ok: false,
          message:
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

            vv.reward_points
              AS user_reward_points,

            vv.created_at
              AS watched_at,

            u.username
              AS creator_username,

            u.first_name
              AS creator_name

          FROM dekhoearn_video_views vv

          JOIN dekhoearn_videos v
            ON v.id = vv.video_id

          LEFT JOIN dekhoearn_users u
            ON u.id = v.creator_id

          WHERE vv.user_id = $1

          ORDER BY vv.created_at DESC

          LIMIT 100
          `,
          [req.userId]
        );

      res.json({
        ok: true,

        history:
          result.rows.map(
            row => ({
              ...safeVideo(row),

              user_watch_seconds:
                safeNumber(
                  row.user_watch_seconds
                ),

              user_reward_points:
                safeNumber(
                  row.user_reward_points
                ),

              watched_at:
                row.watched_at
            })
          )
      });
    } catch (error) {
      console.error(
        "WATCH HISTORY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        message:
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
  async (req, res) => {
    const client =
      await pool.connect();

    try {
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
          [req.params.id]
        );

      if (
        !video.rows.length
      ) {
        throw new Error(
          "Video not found"
        );
      }

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
            req.userId,

            req.params.id
          ]
        );

      let liked = false;

      if (
        existing.rows.length
      ) {
        await client.query(
          `
          DELETE FROM dekhoearn_likes

          WHERE user_id = $1
            AND video_id = $2
          `,
          [
            req.userId,

            req.params.id
          ]
        );

        await client.query(
          `
          UPDATE dekhoearn_videos

          SET likes_count =
            GREATEST(
              0,
              likes_count - 1
            )

          WHERE id = $1
          `,
          [req.params.id]
        );
      } else {
        liked = true;

        await client.query(
          `
          INSERT INTO dekhoearn_likes (
            user_id,
            video_id
          )

          VALUES ($1,$2)

          ON CONFLICT DO NOTHING
          `,
          [
            req.userId,

            req.params.id
          ]
        );

        await client.query(
          `
          UPDATE dekhoearn_videos

          SET likes_count =
            likes_count + 1

          WHERE id = $1
          `,
          [req.params.id]
        );
      }

      const count =
        await client.query(
          `
          SELECT likes_count
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [req.params.id]
        );

      await client.query(
        "COMMIT"
      );

      res.json({
        ok: true,

        liked,

        likes_count:
          safeNumber(
            count.rows[0]
              .likes_count
          )
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "LIKE ERROR:",
        error
      );

      res.status(400).json({
        ok: false,

        message:
          error.message ||
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
  "/api/videos/:id/like/status",
  requireUser,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT 1
          FROM dekhoearn_likes

          WHERE user_id = $1
            AND video_id = $2

          LIMIT 1
          `,
          [
            req.userId,

            req.params.id
          ]
        );

      res.json({
        ok: true,

        liked:
          result.rows.length >
          0
      });
    } catch (error) {
      res.status(500).json({
        ok: false,

        message:
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
  async (req, res) => {
    try {
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

          LIMIT 100
          `,
          [req.params.id]
        );

      res.json({
        ok: true,

        comments:
          result.rows.map(
            row => ({
              id:
                row.id,

              user_id:
                row.user_id,

              video_id:
                row.video_id,

              comment:
                row.comment,

              username:
                row.username ||
                "user",

              first_name:
                row.first_name ||
                "",

              created_at:
                row.created_at
            })
          )
      });
    } catch (error) {
      console.error(
        "COMMENTS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
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

          message:
            "Comment cannot be empty"
        });
      }

      const video =
        await dbQuery(
          `
          SELECT id

          FROM dekhoearn_videos

          WHERE id = $1
            AND status = 'published'

          LIMIT 1
          `,
          [req.params.id]
        );

      if (
        !video.rows.length
      ) {
        return res.status(404).json({
          ok: false,

          message:
            "Video not found"
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_comments (
            user_id,
            video_id,
            comment
          )

          VALUES ($1,$2,$3)

          RETURNING *
          `,
          [
            req.userId,

            req.params.id,

            comment
          ]
        );

      await dbQuery(
        `
        UPDATE dekhoearn_videos

        SET comments_count =
          comments_count + 1

        WHERE id = $1
        `,
        [req.params.id]
      );

      res.json({
        ok: true,

        comment:
          result.rows[0]
      });
    } catch (error) {
      console.error(
        "COMMENT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to add comment"
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
      const reason =
        cleanText(
          req.body.reason ||
            "Reported by user",
          1000
        );

      /*
       Prevent the same user from
       submitting repeated reports
       for the same video.
      */

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
            req.userId,

            req.params.id
          ]
        );

      if (
        existing.rows.length
      ) {
        return res.status(409).json({
          ok: false,

          message:
            "You have already reported this video"
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_reports (
          user_id,
          video_id,
          reason
        )

        VALUES ($1,$2,$3)
        `,
        [
          req.userId,

          req.params.id,

          reason
        ]
      );

      res.json({
        ok: true,

        message:
          "Report submitted"
      });
    } catch (error) {
      console.error(
        "REPORT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to submit report"
      });
    }
  }
);

/* ======================================================
   DAILY REWARD
====================================================== */

app.post(
  "/api/daily/claim",
  requireUser,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const reward =
        await client.query(
          `
          INSERT INTO dekhoearn_daily_rewards (
            user_id,
            reward_points
          )

          VALUES ($1,$2)

          ON CONFLICT (
            user_id,
            reward_date
          )

          DO NOTHING

          RETURNING id
          `,
          [
            req.userId,

            DAILY_REWARD
          ]
        );

      if (
        !reward.rows.length
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          ok: false,

          message:
            "Daily reward already claimed"
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

          updated_at =
            NOW()

        WHERE id = $2
        `,
        [
          DAILY_REWARD,

          req.userId
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger (
          user_id,
          points,
          type,
          description
        )

        VALUES (
          $1,$2,'daily',
          'Daily reward'
        )
        `,
        [
          req.userId,

          DAILY_REWARD
        ]
      );

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.userId
        );

      res.json({
        ok: true,

        reward:
          DAILY_REWARD,

        user
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "DAILY ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to claim daily reward"
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
  "/api/rewarded-ad/complete",
  requireUser,
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      /*
       DEMO ONLY.
       Real ad network verification
       should be connected later.
      */

      await client.query(
        "BEGIN"
      );

      await client.query(
        `
        INSERT INTO dekhoearn_rewarded_ads (
          user_id,
          reward_points
        )

        VALUES ($1,$2)
        `,
        [
          req.userId,

          REWARDED_AD_POINTS
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

          today_earned =
            today_earned + $1,

          updated_at =
            NOW()

        WHERE id = $2
        `,
        [
          REWARDED_AD_POINTS,

          req.userId
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger (
          user_id,
          points,
          type,
          description
        )

        VALUES (
          $1,$2,'rewarded_ad',
          'Rewarded ad demo reward'
        )
        `,
        [
          req.userId,

          REWARDED_AD_POINTS
        ]
      );

      await client.query(
        "COMMIT"
      );

      const user =
        await getSafeUserById(
          req.userId
        );

      res.json({
        ok: true,

        reward:
          REWARDED_AD_POINTS,

        demo: true,

        user
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "REWARDED AD ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to add reward"
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
  "/api/user/:id/points/history",
  requireUser,
  async (req, res) => {
    try {
      if (
        String(req.params.id) !==
        String(req.userId)
      ) {
        return res.status(403).json({
          ok: false,

          message:
            "Access denied"
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            id,
            points,
            type,
            description,
            reference_id,
            created_at

          FROM dekhoearn_points_ledger

          WHERE user_id = $1

          ORDER BY created_at DESC

          LIMIT 100
          `,
          [req.userId]
        );

      res.json({
        ok: true,

        history:
          result.rows.map(
            row => ({
              id:
                row.id,

              points:
                safeNumber(
                  row.points
                ),

              type:
                row.type,

              description:
                row.description,

              reference_id:
                row.reference_id,

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

      res.status(500).json({
        ok: false,

        message:
          "Unable to load points history"
      });
    }
  }
);

/* ======================================================
   CREATOR STATS
====================================================== */

app.get(
  "/api/creator/:id",
  requireUser,
  async (req, res) => {
    try {
      const user =
        await getSafeUserById(
          req.params.id
        );

      if (!user) {
        return res.status(404).json({
          ok: false,

          message:
            "Creator not found"
        });
      }

      const videoStats =
        await dbQuery(
          `
          SELECT
            COUNT(*) AS video_count,

            COALESCE(
              SUM(views),
              0
            ) AS total_views,

            COALESCE(
              SUM(likes_count),
              0
            ) AS total_likes,

            COALESCE(
              SUM(comments_count),
              0
            ) AS total_comments

          FROM dekhoearn_videos

          WHERE creator_id = $1
          `,
          [req.params.id]
        );

      const followers =
        await dbQuery(
          `
          SELECT COUNT(*) AS count

          FROM dekhoearn_follows

          WHERE creator_id = $1
          `,
          [req.params.id]
        );

      const earnings =
        await dbQuery(
          `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS earnings

          FROM dekhoearn_creator_earnings

          WHERE creator_id = $1
          `,
          [req.params.id]
        );

      res.json({
        ok: true,

        creator:
          user,

        stats: {
          video_count:
            safeNumber(
              videoStats.rows[0]
                .video_count
            ),

          total_views:
            safeNumber(
              videoStats.rows[0]
                .total_views
            ),

          total_likes:
            safeNumber(
              videoStats.rows[0]
                .total_likes
            ),

          total_comments:
            safeNumber(
              videoStats.rows[0]
                .total_comments
            ),

          followers:
            safeNumber(
              followers.rows[0]
                .count
            ),

          earnings:
            safeNumber(
              earnings.rows[0]
                .earnings
            )
        }
      });
    } catch (error) {
      console.error(
        "CREATOR STATS ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to load creator dashboard"
      });
    }
  }
);

/* ======================================================
   MONETIZATION APPLY
====================================================== */

async function applyMonetization(
  req,
  res
) {
  try {
    const creatorId =
      String(req.params.id);

    if (
      creatorId !==
      String(req.userId)
    ) {
      return res.status(403).json({
        ok: false,

        message:
          "You can only apply for your own account"
      });
    }

    await dbQuery(
      `
      UPDATE dekhoearn_users

      SET
        is_creator = TRUE,

        monetization_status =
          'pending',

        updated_at =
          NOW()

      WHERE id = $1
      `,
      [req.userId]
    );

    const user =
      await getSafeUserById(
        req.userId
      );

    res.json({
      ok: true,

      message:
        "Monetization application submitted",

      user
    });
  } catch (error) {
    console.error(
      "MONETIZATION ERROR:",
      error
    );

    res.status(500).json({
      ok: false,

      message:
        "Unable to apply for monetization"
    });
  }
}

app.post(
  "/api/creator/:id/monetization/apply",
  requireUser,
  applyMonetization
);

app.post(
  "/api/creator/:id/apply",
  requireUser,
  applyMonetization
);

/* ======================================================
   FOLLOW TOGGLE
====================================================== */

app.post(
  "/api/creator/:id/follow",
  requireUser,
  async (req, res) => {
    const creatorId =
      String(req.params.id);

    if (
      creatorId ===
      String(req.userId)
    ) {
      return res.status(400).json({
        ok: false,

        message:
          "You cannot follow yourself"
      });
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const creator =
        await client.query(
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
        throw new Error(
          "Creator not found"
        );
      }

      const existing =
        await client.query(
          `
          SELECT id

          FROM dekhoearn_follows

          WHERE follower_id = $1
            AND creator_id = $2

          LIMIT 1
          `,
          [
            req.userId,

            creatorId
          ]
        );

      let following = false;

      if (
        existing.rows.length
      ) {
        await client.query(
          `
          DELETE FROM dekhoearn_follows

          WHERE follower_id = $1
            AND creator_id = $2
          `,
          [
            req.userId,

            creatorId
          ]
        );
      } else {
        following = true;

        await client.query(
          `
          INSERT INTO dekhoearn_follows (
            follower_id,
            creator_id
          )

          VALUES ($1,$2)

          ON CONFLICT DO NOTHING
          `,
          [
            req.userId,

            creatorId
          ]
        );
      }

      const count =
        await client.query(
          `
          SELECT COUNT(*) AS count

          FROM dekhoearn_follows

          WHERE creator_id = $1
          `,
          [creatorId]
        );

      await client.query(
        "COMMIT"
      );

      res.json({
        ok: true,

        following,

        followers:
          safeNumber(
            count.rows[0]
              .count
          )
      });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "FOLLOW ERROR:",
        error
      );

      res.status(400).json({
        ok: false,

        message:
          error.message ||
          "Unable to update follow"
      });
    } finally {
      client.release();
    }
  }
);

/* ======================================================
   FOLLOW STATUS
====================================================== */

app.get(
  "/api/creator/:id/follow/status",
  requireUser,
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT 1

          FROM dekhoearn_follows

          WHERE follower_id = $1
            AND creator_id = $2

          LIMIT 1
          `,
          [
            req.userId,

            req.params.id
          ]
        );

      res.json({
        ok: true,

        following:
          result.rows.length >
          0
      });
    } catch (error) {
      res.status(500).json({
        ok: false,

        message:
          "Unable to check follow"
      });
    }
  }
);

/* ======================================================
   PAYOUT ACCOUNT
====================================================== */

app.post(
  "/api/payout-account",
  requireUser,
  async (req, res) => {
    try {
      const method =
        cleanText(
          req.body.method,
          50
        );

      const accountDetails =
        cleanText(
          req.body.account_details,
          2000
        );

      if (
        !method ||
        !accountDetails
      ) {
        return res.status(400).json({
          ok: false,

          message:
            "Payout method and account details are required"
        });
      }

      await dbQuery(
        `
        INSERT INTO dekhoearn_payout_accounts (
          user_id,
          method,
          account_details
        )

        VALUES ($1,$2,$3)

        ON CONFLICT (user_id)

        DO UPDATE SET
          method =
            EXCLUDED.method,

          account_details =
            EXCLUDED.account_details,

          updated_at =
            NOW()
        `,
        [
          req.userId,

          method,

          accountDetails
        ]
      );

      res.json({
        ok: true,

        message:
          "Payout account saved"
      });
    } catch (error) {
      console.error(
        "PAYOUT ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to save payout account"
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
            points,
            total_earned,
            watched_videos,
            is_creator,
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

        message:
          "Unable to load users"
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
            v.title,
            u.username

          FROM dekhoearn_reports r

          LEFT JOIN dekhoearn_videos v
            ON v.id = r.video_id

          LEFT JOIN dekhoearn_users u
            ON u.id = r.user_id

          ORDER BY r.created_at DESC

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

        message:
          "Unable to load reports"
      });
    }
  }
);

/* ======================================================
   ADMIN - MODERATION
====================================================== */

app.post(
  "/api/admin/video/:id/moderate",
  requireAdmin,
  async (req, res) => {
    try {
      const status =
        cleanText(
          req.body.status ||
            "normal",
          50
        );

      const videoStatus =
        cleanText(
          req.body.video_status ||
            "published",
          50
        );

      await dbQuery(
        `
        UPDATE dekhoearn_videos

        SET
          moderation_status = $1,

          status = $2,

          updated_at = NOW()

        WHERE id = $3
        `,
        [
          status,

          videoStatus,

          req.params.id
        ]
      );

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions (
          action,
          target_id,
          details
        )

        VALUES (
          'video_moderation',
          $1,
          $2
        )
        `,
        [
          String(
            req.params.id
          ),

          JSON.stringify({
            moderation_status:
              status,

            status:
              videoStatus
          })
        ]
      );

      res.json({
        ok: true,

        message:
          "Video moderation updated"
      });
    } catch (error) {
      console.error(
        "ADMIN MODERATION ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        message:
          "Unable to update moderation"
      });
    }
  }
);

/* ======================================================
   STATIC FRONTEND
====================================================== */

app.use(
  express.static(
    __dirname,
    {
      index: false,

      dotfiles:
        "ignore"
    }
  )
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/*
 Express 5 compatible SPA fallback.
*/

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET"
    ) {
      return next();
    }

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return res.status(404).json({
        ok: false,

        message:
          "API route not found"
      });
    }

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
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
      "UNHANDLED ERROR:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      ok: false,

      message:
        "Internal server error"
    });
  }
);

/* ======================================================
   START
====================================================== */

async function startServer() {
  try {
    if (!DATABASE_URL) {
      throw new Error(
        "DATABASE_URL environment variable is required"
      );
    }

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
      "❌ Startup failed:",
      error
    );

    process.exit(1);
  }
}

/* ======================================================
   PROCESS SIGNALS
====================================================== */

process.on(
  "SIGTERM",
  async () => {
    console.log(
      "SIGTERM received"
    );

    if (pool) {
      await pool.end();
    }

    process.exit(0);
  }
);

process.on(
  "SIGINT",
  async () => {
    console.log(
      "SIGINT received"
    );

    if (pool) {
      await pool.end();
    }

    process.exit(0);
  }
);

/* ======================================================
   START SERVER
====================================================== */

startServer();
