/*
=========================================================
 DEKHOEARN SERVER
 Version 1.1.0
 --------------------------------------------------------
 Dekho. Earn Karo. Reward Lo.

 Features:
 - Express server
 - Neon PostgreSQL
 - User storage
 - Points storage
 - Videos watched storage
 - Today's earning storage
 - Automatic database table creation
 - Health check
 - Static frontend
=========================================================
*/

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;
const SERVER_VERSION = "1.1.0";

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve frontend files
app.use(express.static(path.join(__dirname)));

// ======================================================
// NEON DATABASE
// ======================================================

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on("error", (error) => {
    console.error("Neon database error:", error.message);
  });

  console.log("Neon PostgreSQL configured.");
} else {
  console.warn("DATABASE_URL is missing.");
}

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initDatabase() {
  if (!pool) {
    console.warn("Database initialization skipped.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        points NUMERIC DEFAULT 0,
        videos_watched INTEGER DEFAULT 0,
        today_earned NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log("DekhoEarn database table is ready.");
  } catch (error) {
    console.error(
      "Database initialization failed:",
      error.message
    );
  }
}

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", async (req, res) => {
  let database = false;

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = true;
    } catch (error) {
      database = false;
    }
  }

  res.json({
    ok: true,
    app: "DekhoEarn",
    version: SERVER_VERSION,
    database
  });
});

// ======================================================
// CREATE / GET USER
// ======================================================

app.post("/api/user", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      error: "Database is not connected."
    });
  }

  try {
    const {
      username = null,
      first_name = null
    } = req.body || {};

    const result = await pool.query(
      `
      INSERT INTO dekhoearn_users
      (
        username,
        first_name
      )
      VALUES ($1, $2)
      RETURNING
        id,
        username,
        first_name,
        points,
        videos_watched,
        today_earned,
        created_at,
        updated_at
      `,
      [username, first_name]
    );

    res.json({
      ok: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Create user error:", error.message);

    res.status(500).json({
      ok: false,
      error: "Unable to create user."
    });
  }
});

// ======================================================
// GET USER
// ======================================================

app.get("/api/user/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      error: "Database is not connected."
    });
  }

  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Invalid user ID."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        username,
        first_name,
        points,
        videos_watched,
        today_earned,
        created_at,
        updated_at
      FROM dekhoearn_users
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "User not found."
      });
    }

    res.json({
      ok: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Get user error:", error.message);

    res.status(500).json({
      ok: false,
      error: "Unable to get user."
    });
  }
});

// ======================================================
// ADD POINTS
// ======================================================

app.post("/api/user/:id/points", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      error: "Database is not connected."
    });
  }

  try {
    const userId = Number(req.params.id);
    const points = Number(req.body?.points);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Invalid
