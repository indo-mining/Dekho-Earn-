require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "DekhoEarn",
    version: "1.0.0"
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DekhoEarn running on port ${PORT}`);
});
