"use strict";

/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.4 FINAL
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Server v3.1.3
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
 - Admin-ready API
 - PWA Install
 - Mobile Friendly
=========================================================
*/

"use strict";


/* ======================================================
   CONFIG
====================================================== */

const API_BASE = "";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

const MIN_WATCH_SECONDS = 10;

const WATCH_REWARD = 1;

const DAILY_REWARD = 10;

const REWARDED_AD_POINTS = 5;

const TOKEN_KEY = "dekhoearn_auth_token";

const USER_KEY = "dekhoearn_user";

const USERNAME_KEY = "dekhoearn_username";

const FIRST_NAME_KEY = "dekhoearn_first_name";


/* ======================================================
   GLOBAL STATE
====================================================== */

let currentUser = null;

let currentVideo = null;

let watchSeconds = 0;

let watchRewardSent = false;

let watchTimer = null;

let currentPage = "home";

let videos = [];

let myVideos = [];

let comments = [];

let deferredPrompt = null;

let uploadInProgress = false;

let uploadAbortController = null;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}


function qs(selector, parent = document) {
  return parent.querySelector(selector);
}


function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


function formatNumber(value) {
  return new Intl.NumberFormat("en-IN")
    .format(safeNumber(value));
}


function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  } catch {
    return String(value);
  }
}


function formatDuration(seconds) {
  seconds = Math.max(
    0,
    Math.floor(
      safeNumber(seconds)
    )
  );

  const minutes =
    Math.floor(seconds / 60);

  const secs =
    seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}


function showToast(message, type = "info") {

  let toast =
    $("dekhoearn-toast");

  if (!toast) {

    toast =
      document.createElement("div");

    toast.id =
      "dekhoearn-toast";

    toast.style.position =
      "fixed";

    toast.style.left =
      "50%";

    toast.style.bottom =
      "24px";

    toast.style.transform =
      "translateX(-50%)";

    toast.style.zIndex =
      "99999";

    toast.style.maxWidth =
      "90%";

    toast.style.padding =
      "12px 18px";

    toast.style.borderRadius =
      "12px";

    toast.style.background =
      "#111";

    toast.style.color =
      "#fff";

    toast.style.fontSize =
      "14px";

    toast.style.boxShadow =
      "0 8px 30px rgba(0,0,0,.25)";

    toast.style.textAlign =
      "center";

    document.body.appendChild(
      toast
    );
  }

  toast.textContent =
    message || "";

  toast.dataset.type =
    type;

  toast.style.display =
    "block";

  clearTimeout(
    toast._timer
  );

  toast._timer =
    setTimeout(() => {
      toast.style.display =
        "none";
    }, 3000);
}


function showError(message) {
  showToast(
    message || "Something went wrong.",
    "error"
  );
}


function showSuccess(message) {
  showToast(
    message || "Done.",
    "success"
  );
}


/* ======================================================
   LOCAL STORAGE
====================================================== */

function getToken() {
  return localStorage.getItem(
    TOKEN_KEY
  ) || "";
}


function saveToken(token) {

  if (token) {
    localStorage.setItem(
      TOKEN_KEY,
      token
    );
  } else {
    localStorage.removeItem(
      TOKEN_KEY
    );
  }
}


function saveUser(user) {

  if (!user) return;

  currentUser =
    user;

  localStorage.setItem(
    USER_KEY,
    JSON.stringify(user)
  );

  if (user.username) {
    localStorage.setItem(
      USERNAME_KEY,
      user.username
    );
  }

  if (user.first_name) {
    localStorage.setItem(
      FIRST_NAME_KEY,
      user.first_name
    );
  }

  updateUserUI();
}


function loadStoredUser() {

  try {

    const raw =
      localStorage.getItem(
        USER_KEY
      );

    if (raw) {
      currentUser =
        JSON.parse(raw);
    }

  } catch {
    currentUser = null;
  }
}


function clearAuth() {

  currentUser = null;

  localStorage.removeItem(
    TOKEN_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  localStorage.removeItem(
    USERNAME_KEY
  );

  localStorage.removeItem(
    FIRST_NAME_KEY
  );
}


/* ======================================================
   API HELPER
====================================================== */

async function api(
  endpoint,
  options = {}
) {

  const config = {
    method:
      options.method ||
      "GET",

    headers: {
      ...(options.headers || {})
    }
  };


  if (
    options.body !== undefined
  ) {

    if (
      options.body instanceof FormData
    ) {

      config.body =
        options.body;

    } else if (
      typeof options.body ===
      "string"
    ) {

      config.body =
        options.body;

      if (
        !config.headers[
          "Content-Type"
        ]
      ) {
        config.headers[
          "Content-Type"
        ] =
          "application/json";
      }

    } else {

      config.body =
        JSON.stringify(
          options.body
        );

      config.headers[
        "Content-Type"
      ] =
        "application/json";
    }

  }


  const token =
    getToken();


  if (token) {

    config.headers[
      "Authorization"
    ] =
      `Bearer ${token}`;
  }


  /*
   * IMPORTANT:
   * Do NOT send x-user-id.
   * Server v3.1.3 uses Bearer token.
   */


  let response;

  try {

    response =
      await fetch(
        API_BASE + endpoint,
        config
      );

  } catch (error) {

    console.error(
      "NETWORK ERROR:",
      error
    );

    throw new Error(
      "Network error. Please check your internet connection."
    );
  }


  let data = null;

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  try {

    if (
      contentType.includes(
        "application/json"
      )
    ) {

      data =
        await response.json();

    } else {

      const text =
        await response.text();

      data = {
        ok:
          response.ok,
        message:
          text
      };
    }

  } catch {

    data = {
      ok:
        response.ok
    };
  }


  if (
    response.status === 401
  ) {

    /*
     * Only force logout when the
     * server says authentication failed.
     */

    clearAuth();

    updateUserUI();

    if (
      currentPage !== "login"
    ) {
      showAuthScreen();
    }

    throw new Error(
      data?.message ||
      "Session expired. Please login again."
    );
  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      `Request failed (${response.status}).`
    );
  }


  return data;
}


/* ======================================================
   AUTH CHECK
====================================================== */

async function loadCurrentUser() {

  const token =
    getToken();

  if (!token) {
    return false;
  }


  try {

    const data =
      await api(
        "/api/auth/me"
      );

    if (
      data &&
      data.user
    ) {

      saveUser(
        data.user
      );

      return true;
    }

  } catch (error) {

    console.warn(
      "AUTH CHECK:",
      error.message
    );
  }


  return false;
}


/* ======================================================
   REGISTER
====================================================== */

async function registerUser(
  firstName,
  username,
  password,
  referralCode = ""
) {

  const data =
    await api(
      "/api/auth/register",
      {
        method:
          "POST",

        body: {
          first_name:
            firstName,

          username:
            username,

          password:
            password,

          referral_code:
            referralCode
        }
      }
    );


  if (
    data.token
  ) {
    saveToken(
      data.token
    );
  }


  if (
    data.user
  ) {
    saveUser(
      data.user
    );
  }


  return data;
}


/* ======================================================
   LOGIN
====================================================== */

async function loginUser(
  username,
  password
) {

  const data =
    await api(
      "/api/auth/login",
      {
        method:
          "POST",

        body: {
          username,
          password
        }
      }
    );


  if (
    data.token
  ) {
    saveToken(
      data.token
    );
  }


  if (
    data.user
  ) {
    saveUser(
      data.user
    );
  }


  return data;
}


/* ======================================================
   LOGOUT
====================================================== */

async function logoutUser() {

  try {

    if (
      getToken()
    ) {

      await api(
        "/api/auth/logout",
        {
          method:
            "POST"
        }
      );
    }

  } catch (error) {

    console.warn(
      "Logout API:",
      error.message
    );

  } finally {

    stopWatchTimer();

    clearAuth();

    currentVideo =
      null;

    videos =
      [];

    myVideos =
      [];

    showAuthScreen();
  }
}


/* ======================================================
   AUTH SCREEN
====================================================== */

function showAuthScreen() {

  currentPage =
    "login";

  stopWatchTimer();

  const root =
    $("app");

  if (!root) {
    return;
  }


  root.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">

        <div class="auth-logo">
          <div class="auth-logo-icon">▶</div>
          <h1>DekhoEarn</h1>
          <p>Dekho. Earn Karo. Reward Lo.</p>
        </div>

        <div class="auth-tabs">
          <button
            type="button"
            class="auth-tab active"
            id="loginTab"
          >
            Login
          </button>

          <button
            type="button"
            class="auth-tab"
            id="registerTab"
          >
            Register
          </button>
        </div>

        <form id="loginForm">

          <label>Username</label>

          <input
            id="loginUsername"
            type="text"
            autocomplete="username"
            placeholder="Enter username"
            required
          />

          <label>Password</label>

          <input
            id="loginPassword"
            type="password"
            autocomplete="current-password"
            placeholder="Enter password"
            required
          />

          <button
            class="primary-btn"
            type="submit"
          >
            Login
          </button>

        </form>


        <form
          id="registerForm"
          style="display:none"
        >

          <label>First Name</label>

          <input
            id="registerFirstName"
            type="text"
            autocomplete="given-name"
            placeholder="Your first name"
            required
          />

          <label>Username</label>

          <input
            id="registerUsername"
            type="text"
            autocomplete="username"
            placeholder="username"
            minlength="3"
            maxlength="30"
            required
          />

          <small>
            Use lowercase letters, numbers,
            underscore or dot.
          </small>

          <label>Password</label>

          <input
            id="registerPassword"
            type="password"
            autocomplete="new-password"
            placeholder="Minimum 6 characters"
            minlength="6"
            required
          />

          <label>Referral Code (optional)</label>

          <input
            id="registerReferral"
            type="text"
            placeholder="Referral code"
          />

          <button
            class="primary-btn"
            type="submit"
          >
            Create Account
          </button>

        </form>

        <div
          id="authMessage"
          class="auth-message"
        ></div>

      </div>
    </div>
  `;


  $("loginTab")
    ?.addEventListener(
      "click",
      () => {
        switchAuthTab(
          "login"
        );
      }
    );


  $("registerTab")
    ?.addEventListener(
      "click",
      () => {
        switchAuthTab(
          "register"
        );
      }
    );


  async function handleRegister(event) {

  event.preventDefault();
  event.stopPropagation();

  console.log("CREATE ACCOUNT CLICKED");

  const firstName =
    $("registerFirstName")?.value.trim() || "";

  const username =
    $("registerUsername")?.value.trim().toLowerCase() || "";

  const password =
    $("registerPassword")?.value || "";

  const referral =
    $("registerReferral")?.value.trim().toUpperCase() || "";

  if (!firstName) {
    showAuthMessage("First name is required.");
    return;
  }

  if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
    showAuthMessage(
      "Username must be 3-30 characters and use only lowercase letters, numbers, dot or underscore."
    );
    return;
  }

  if (password.length < 6) {
    showAuthMessage(
      "Password must be at least 6 characters."
    );
    return;
  }

  const button =
    $("registerForm")?.querySelector(
      'button[type="submit"]'
    );

  if (button) {
    button.disabled = true;
    button.textContent = "Creating...";
  }

  showAuthMessage("");

  try {

    console.log("REGISTER REQUEST START");

    const data = await api(
      "/api/auth/register",
      {
        method: "POST",

        body: {
          first_name: firstName,
          username: username,
          password: password,
          referral_code: referral
        }
      }
    );

    console.log(
      "REGISTER RESPONSE:",
      data
    );

    if (!data || !data.token) {
      throw new Error(
        data?.message ||
        "Registration successful response was incomplete."
      );
    }

    saveToken(data.token);

    if (data.user) {
      saveUser(data.user);
    }

    showSuccess(
      "Account created successfully!"
    );

    await showMainApp();

  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );

    showAuthMessage(
      error.message ||
      "Unable to create account."
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }
  }


  $("registerForm")
    ?.addEventListener(
      "submit",
      handleRegister
    );


  injectAuthStyles();
}


function switchAuthTab(
  tab
) {

  const loginForm =
    $("loginForm");

  const registerForm =
    $("registerForm");

  const loginTab =
    $("loginTab");

  const registerTab =
    $("registerTab");


  if (
    tab === "register"
  ) {

    loginForm.style.display =
      "none";

    registerForm.style.display =
      "block";

    loginTab.classList.remove(
      "active"
    );

    registerTab.classList.add(
      "active"
    );

  } else {

    loginForm.style.display =
      "block";

    registerForm.style.display =
      "none";

    registerTab.classList.remove(
      "active"
    );

    loginTab.classList.add(
      "active"
    );
  }
}


async function handleLogin(
  event
) {

  event.preventDefault();

  const username =
    $("loginUsername")
      ?.value
      .trim();

  const password =
    $("loginPassword")
      ?.value || "";


  if (!username || !password) {
    showAuthMessage(
      "Username and password required."
    );
    return;
  }


  const button =
    event.submitter;


  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Logging in...";
  }


  try {

    await loginUser(
      username,
      password
    );

    showSuccess(
      "Login successful."
    );

    await showMainApp();

  } catch (error) {

    showAuthMessage(
      error.message
    );

  } finally {

    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Login";
    }
  }
}


async function handleRegister(
  event
) {

  event.preventDefault();

  const firstName =
    $("registerFirstName")
      ?.value
      .trim();

  const username =
    $("registerUsername")
      ?.value
      .trim()
      .toLowerCase();

  const password =
    $("registerPassword")
      ?.value || "";

  const referral =
    $("registerReferral")
      ?.value
      .trim()
      .toUpperCase();


  if (!firstName) {
    showAuthMessage(
      "First name is required."
    );
    return;
  }


  if (
    !/^[a-z0-9_.]{3,30}$/.test(
      username
    )
  ) {

    showAuthMessage(
      "Username: 3-30 characters, lowercase letters, numbers, dot or underscore."
    );

    return;
  }


  if (
    password.length < 6
  ) {

    showAuthMessage(
      "Password must be at least 6 characters."
    );

    return;
  }


  const button =
    event.submitter;


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Creating account...";
  }


  try {

    await registerUser(
      firstName,
      username,
      password,
      referral
    );

    showSuccess(
      "Account created successfully."
    );

    await showMainApp();

  } catch (error) {

    showAuthMessage(
      error.message
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Create Account";
    }
  }
}


function showAuthMessage(
  message
) {

  const element =
    $("authMessage");

  if (element) {
    element.textContent =
      message || "";
  }
}


/* ======================================================
   MAIN APP
====================================================== */

async function showMainApp() {

  currentPage =
    "home";

  renderAppShell();

  updateUserUI();

  await loadVideos();

  showPage(
    "home"
  );
}


/* ======================================================
   APP SHELL
====================================================== */

function renderAppShell() {

  const root =
    $("app");

  if (!root) {
    return;
  }


  const firstName =
    currentUser?.first_name ||
    currentUser?.username ||
    "User";


  root.innerHTML = `
    <div class="dekhoearn-app">

      <header class="topbar">

        <div
          class="brand"
          onclick="showPage('home')"
        >
          <div class="brand-icon">▶</div>

          <div>
            <strong>DekhoEarn</strong>
            <small>Dekho. Earn Karo.</small>
          </div>
        </div>

        <div class="top-user">

          <span id="topUserName">
            ${escapeHtml(firstName)}
          </span>

          <span class="points-pill">
            ⭐
            <span id="topPoints">
              ${formatNumber(
                currentUser?.points || 0
              )}
            </span>
          </span>

          <button
            type="button"
            id="logoutBtn"
            class="logout-btn"
          >
            Logout
          </button>

        </div>

      </header>


      <main
        id="pageContent"
        class="page-content"
      ></main>


      <nav class="bottom-nav">

        <button
          data-page="home"
          onclick="showPage('home')"
        >
          <span>🏠</span>
          <small>Home</small>
        </button>

        <button
          data-page="earn"
          onclick="showPage('earn')"
        >
          <span>🎁</span>
          <small>Earn</small>
        </button>

        <button
          data-page="upload"
          onclick="showPage('upload')"
        >
          <span>＋</span>
          <small>Upload</small>
        </button>

        <button
          data-page="history"
          onclick="showPage('history')"
        >
          <span>🕘</span>
          <small>History</small>
        </button>

        <button
          data-page="profile"
          onclick="showPage('profile')"
        >
          <span>👤</span>
          <small>Profile</small>
        </button>

      </nav>

    </div>
  `;


  $("logoutBtn")
    ?.addEventListener(
      "click",
      logoutUser
    );


  injectMainStyles();
}


/* ======================================================
   USER UI
====================================================== */

function updateUserUI() {

  if (!currentUser) {
    return;
  }


  const name =
    currentUser.first_name ||
    currentUser.username ||
    "User";


  const topName =
    $("topUserName");

  const topPoints =
    $("topPoints");


  if (topName) {
    topName.textContent =
      name;
  }


  if (topPoints) {
    topPoints.textContent =
      formatNumber(
        currentUser.points || 0
      );
  }
}


/* ======================================================
   PAGE SYSTEM
====================================================== */

async function showPage(
  page
) {

  if (!currentUser) {
    showAuthScreen();
    return;
  }


  currentPage =
    page;


  qsa(
    ".bottom-nav button"
  ).forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.page ===
          page
      );

    }
  );


  stopWatchTimer();


  switch (page) {

    case "home":
      await renderHomePage();
      break;

    case "earn":
      await renderEarnPage();
      break;

    case "upload":
      renderUploadPage();
      break;

    case "history":
      await renderHistoryPage();
      break;

    case "profile":
      await renderProfilePage();
      break;

    case "watch":
      renderWatchPage();
      break;

    case "creator":
      await renderCreatorPage();
      break;

    default:
      await renderHomePage();
  }
}


/* ======================================================
   HOME
====================================================== */

async function renderHomePage() {

  const content =
    $("pageContent");

  if (!content) return;


  content.innerHTML = `
    <section class="page-section">

      <div class="welcome-card">

        <div>
          <span class="eyebrow">
            Welcome back
          </span>

          <h1>
            ${escapeHtml(
              currentUser?.first_name ||
              currentUser?.username ||
              "User"
            )}
          </h1>

          <p>
            Watch videos and collect
            DekhoEarn points.
          </p>
        </div>

        <div class="wallet-big">
          <span>⭐</span>
          <strong>
            ${formatNumber(
              currentUser?.points || 0
            )}
          </strong>
          <small>Points</small>
        </div>

      </div>


      <div class="section-heading">

        <div>
          <h2>Video Feed</h2>
          <p>Latest videos</p>
        </div>

        <button
          type="button"
          class="secondary-btn"
          id="refreshVideosBtn"
        >
          Refresh
        </button>

      </div>


      <div
        id="videoFeed"
        class="video-grid"
      >
        <div class="loading-card">
          Loading videos...
        </div>
      </div>

    </section>
  `;


  $("refreshVideosBtn")
    ?.addEventListener(
      "click",
      async () => {

        await loadVideos();

        renderHomePage();
      }
    );


  renderVideoFeed();
}


async function loadVideos() {

  try {

    const data =
      await api(
        "/api/videos"
      );

    videos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    return videos;

  } catch (error) {

    console.error(
      "LOAD VIDEOS:",
      error
    );

    showError(
      error.message
    );

    videos =
      [];

    return [];
  }
}


/* ======================================================
   VIDEO FEED
====================================================== */

function renderVideoFeed() {

  const container =
    $("videoFeed");

  if (!container) {
    return;
  }


  if (!videos.length) {

    container.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">📺</div>
        <h3>No videos yet</h3>
        <p>
          Upload the first video on DekhoEarn.
        </p>

        <button
          type="button"
          class="primary-btn"
          onclick="showPage('upload')"
        >
          Upload Video
        </button>
      </div>
    `;

    return;
  }


  container.innerHTML =
    videos
      .map(
        video =>
          createVideoCard(
            video
          )
      )
      .join("");


  qsa(
    "[data-video-id]",
    container
  ).forEach(
    element => {

      element.addEventListener(
        "click",
        event => {

          if (
            event.target.closest(
              "button"
            )
          ) {
            return;
          }

          const id =
            Number(
              element.dataset.videoId
            );

          openVideo(
            id
          );
        }
      );

    }
  );


  qsa(
    ".video-like-quick",
    container
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        async event => {

          event.stopPropagation();

          const id =
            Number(
              button.dataset.videoId
            );

          await toggleLike(
            id,
            button
          );
        }
      );

    }
  );
}


function createVideoCard(
  video
) {

  const thumbnail =
    video.thumbnail_url ||
    "";


  const title =
    escapeHtml(
      video.title ||
      "Untitled video"
    );


  const creator =
    escapeHtml(
      video.first_name ||
      video.username ||
      "Creator"
    );


  const views =
    formatNumber(
      video.views || 0
    );


  const likes =
    formatNumber(
      video.likes_count || 0
    );


  const duration =
    formatDuration(
      video.duration || 0
    );


  return `
    <article
      class="video-card"
      data-video-id="${video.id}"
    >

      <div class="video-thumbnail">

        ${
          thumbnail
            ? `
              <img
                src="${escapeHtml(thumbnail)}"
                alt=""
                loading="lazy"
              />
            `
            : `
              <div class="video-placeholder">
                ▶
              </div>
            `
        }

        ${
          duration !== "00:00"
            ? `
              <span class="duration-badge">
                ${duration}
              </span>
            `
            : ""
        }

      </div>


      <div class="video-card-body">

        <h3>
          ${title}
        </h3>

        <p class="creator-line">
          👤 ${creator}
        </p>

        <div class="video-meta">
          <span>👁 ${views}</span>
          <span>❤️ ${likes}</span>
        </div>

        ${
          video.duplicate_warning
            ? `
              <div class="warning-box">
                ⚠️ Duplicate URL warning
              </div>
            `
            : ""
        }

        <button
          type="button"
          class="quick-like-btn video-like-quick"
          data-video-id="${video.id}"
        >
          ❤️ Like
        </button>

      </div>

    </article>
  `;
}


/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(
  videoId
) {

  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          videoId
        )}`
      );


    currentVideo =
      data.video;


    watchSeconds =
      0;

    watchRewardSent =
      false;


    currentPage =
      "watch";


    await renderWatchPage();

  } catch (error) {

    showError(
      error.message
    );
  }
}


/* ======================================================
   WATCH PAGE
====================================================== */

function renderWatchPage() {

  const content =
    $("pageContent");

  if (!content) {
    return;
  }


  if (!currentVideo) {

    content.innerHTML = `
      <div class="empty-card">
        Video not found.
      </div>
    `;

    return;
  }


  const video =
    currentVideo;


  content.innerHTML = `
    <section class="watch-section">

      <button
        type="button"
        class="back-btn"
        id="backHomeBtn"
      >
        ← Back
      </button>


      <div class="player-card">

        <video
          id="mainVideoPlayer"
          class="main-video"
          controls
          playsinline
          preload="metadata"
          src="${escapeHtml(
            video.video_url
          )}"
        ></video>

      </div>


      <div class="watch-info">

        <h1>
          ${escapeHtml(
            video.title
          )}
        </h1>

        <div class="watch-creator">

          <span>
            👤
            ${escapeHtml(
              video.creator_username ||
              video.username ||
              "Creator"
            )}
          </span>

          <span>
            👁
            ${formatNumber(
              video.views || 0
            )}
          </span>

        </div>


        ${
          video.description
            ? `
              <p class="description">
                ${escapeHtml(
                  video.description
                )}
              </p>
            `
            : ""
        }


        ${
          video.duplicate_warning
            ? `
              <div class="warning-box">
                ⚠️ This video has a duplicate
                URL warning.
              </div>
            `
            : ""
        }


        <div class="watch-actions">

          <button
            type="button"
            id="likeBtn"
            class="action-btn"
          >
            ❤️ Like
          </button>

          <button
            type="button"
            id="commentBtn"
            class="action-btn"
          >
            💬 Comments
          </button>

          <button
            type="button"
            id="reportBtn"
            class="action-btn"
          >
            🚩 Report
          </button>

        </div>


        <div
          id="watchRewardStatus"
          class="reward-status"
        >
          Watch ${MIN_WATCH_SECONDS} seconds
          to earn ${WATCH_REWARD} point.
        </div>


        <div
          id="watchTimer"
          class="watch-timer"
        >
          Watched: 0 sec
        </div>


        <div
          id="commentsPanel"
          class="comments-panel"
          style="display:none"
        ></div>

      </div>

    </section>
  `;


  $("backHomeBtn")
    ?.addEventListener(
      "click",
      () => {
        showPage("home");
      }
    );


  const player =
    $("mainVideoPlayer");


  if (player) {

    player.addEventListener(
      "play",
      startWatchTimer
    );

    player.addEventListener(
      "pause",
      stopWatchTimer
    );

    player.addEventListener(
      "ended",
      async () => {
        stopWatchTimer();

        await completeWatchReward(
          true
        );
      }
    );
  }


  $("likeBtn")
    ?.addEventListener(
      "click",
      async () => {
        await toggleVideoLike();
      }
    );


  $("commentBtn")
    ?.addEventListener(
      "click",
      async () => {
        await toggleComments();
      }
    );


  $("reportBtn")
    ?.addEventListener(
      "click",
      async () => {
        await reportVideo();
      }
    );


  loadLikeStatus();

  updateWatchStatus();
}


/* ======================================================
   WATCH TIMER
====================================================== */

function startWatchTimer() {

  if (
    watchTimer ||
    !currentVideo
  ) {
    return;
  }


  watchTimer =
    setInterval(
      async () => {

        const player =
          $("mainVideoPlayer");


        if (
          player &&
          !player.paused &&
          !player.ended
        ) {

          watchSeconds =
            Math.max(
              watchSeconds,
              Math.floor(
                player.currentTime || 0
              )
            );

          updateWatchStatus();


          if (
            watchSeconds >=
              MIN_WATCH_SECONDS &&
            !watchRewardSent
          ) {

            await completeWatchReward(
              false
            );
          }
        }

      },
      1000
    );
}


function stopWatchTimer() {

  if (watchTimer) {

    clearInterval(
      watchTimer
    );

    watchTimer =
      null;
  }
}


function updateWatchStatus() {

  const element =
    $("watchTimer");

  const status =
    $("watchRewardStatus");


  if (element) {

    element.textContent =
      `Watched: ${watchSeconds} sec`;
  }


  if (!status) {
    return;
  }


  if (watchRewardSent) {

    status.textContent =
      `🎉 +${WATCH_REWARD} point earned for this video.`;

    status.classList.add(
      "reward-success"
    );

  } else if (
    watchSeconds >=
    MIN_WATCH_SECONDS
  ) {

    status.textContent =
      "Claiming your watch reward...";

  } else {

    status.textContent =
      `Watch ${MIN_WATCH_SECONDS} seconds to earn ${WATCH_REWARD} point.`;
  }
}


/* ======================================================
   WATCH COMPLETE API
====================================================== */

async function completeWatchReward(
  force = false
) {

  if (
    !currentVideo ||
    watchRewardSent
  ) {
    return;
  }


  if (
    watchSeconds <
    MIN_WATCH_SECONDS
  ) {
    return;
  }


  if (
    !force &&
    watchSeconds <
      MIN_WATCH_SECONDS
  ) {
    return;
  }


  try {

    const data =
      await api(
        "/api/watch/complete",
        {
          method:
            "POST",

          body: {
            video_id:
              currentVideo.id,

            watch_seconds:
              watchSeconds
          }
        }
      );


    if (
      data.reward_granted
    ) {

      watchRewardSent =
        true;

      if (
        data.user
      ) {
        saveUser(
          data.user
        );
      }


      updateWatchStatus();

      showSuccess(
        `+${data.reward || WATCH_REWARD} point earned!`
      );

    } else {

      /*
       * Server allows one reward
       * per user/video.
       */

      watchRewardSent =
        true;

      if (
        data.user
      ) {
        saveUser(
          data.user
        );
      }

      updateWatchStatus();
    }

  } catch (error) {

    console.error(
      "WATCH REWARD:",
      error
    );

    const status =
      $("watchRewardStatus");

    if (status) {

      status.textContent =
        error.message;
    }
  }
}


/* ======================================================
   LIKE STATUS
====================================================== */

async function loadLikeStatus() {

  if (!currentVideo) {
    return;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`
      );


    const button =
      $("likeBtn");


    if (button) {

      button.textContent =
        data.liked
          ? "❤️ Liked"
          : "🤍 Like";
    }

  } catch (error) {

    console.warn(
      "LIKE STATUS:",
      error.message
    );
  }
}


/* ======================================================
   LIKE TOGGLE
====================================================== */

async function toggleVideoLike() {

  if (!currentVideo) {
    return;
  }


  const button =
    $("likeBtn");


  if (button) {
    button.disabled =
      true;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`,
        {
          method:
            "POST"
        }
      );


    if (button) {

      button.textContent =
        data.liked
          ? "❤️ Liked"
          : "🤍 Like";
    }


    currentVideo.likes_count =
      data.likes_count;


  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {
      button.disabled =
        false;
    }
  }
}


async function toggleLike(
  videoId,
  button
) {

  if (button) {
    button.disabled =
      true;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          videoId
        )}/like`,
        {
          method:
            "POST"
        }
      );


    if (button) {

      button.textContent =
        data.liked
          ? "❤️ Liked"
          : "🤍 Like";
    }

  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {
      button.disabled =
        false;
    }
  }
}


/* ======================================================
   COMMENTS
====================================================== */

async function toggleComments() {

  const panel =
    $("commentsPanel");

  if (!panel) {
    return;
  }


  if (
    panel.style.display ===
    "none"
  ) {

    panel.style.display =
      "block";

    await loadComments();

  } else {

    panel.style.display =
      "none";
  }
}


async function loadComments() {

  if (!currentVideo) {
    return;
  }


  const panel =
    $("commentsPanel");


  if (!panel) {
    return;
  }


  panel.innerHTML =
    `
      <div class="loading-card">
        Loading comments...
      </div>
    `;


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`
      );


    comments =
      Array.isArray(
        data.comments
      )
        ? data.comments
        : [];


    renderComments();

  } catch (error) {

    panel.innerHTML =
      `
        <div class="error-card">
          ${escapeHtml(
            error.message
          )}
        </div>
      `;
  }
}


function renderComments() {

  const panel =
    $("commentsPanel");

  if (!panel) {
    return;
  }


  panel.innerHTML = `
    <div class="comments-header">
      <h3>Comments</h3>
    </div>

    <form
      id="commentForm"
      class="comment-form"
    >

      <input
        id="commentInput"
        type="text"
        maxlength="2000"
        placeholder="Write a comment..."
        required
      />

      <button
        type="submit"
        class="primary-btn"
      >
        Send
      </button>

    </form>

    <div class="comment-list">

      ${
        comments.length
          ? comments
              .map(
                comment => `
                  <div class="comment-item">

                    <div class="comment-avatar">
                      👤
                    </div>

                    <div>
                      <strong>
                        ${escapeHtml(
                          comment.first_name ||
                          comment.username ||
                          "User"
                        )}
                      </strong>

                      <p>
                        ${escapeHtml(
                          comment.comment
                        )}
                      </p>

                      <small>
                        ${formatDate(
                          comment.created_at
                        )}
                      </small>
                    </div>

                  </div>
                `
              )
              .join("")
          : `
            <div class="empty-card">
              No comments yet.
            </div>
          `
      }

    </div>
  `;


  $("commentForm")
    ?.addEventListener(
      "submit",
      submitComment
    );
}


async function submitComment(
  event
) {

  event.preventDefault();


  if (!currentVideo) {
    return;
  }


  const input =
    $("commentInput");

  const comment =
    input?.value.trim();


  if (!comment) {
    return;
  }


  const button =
    event.submitter;


  if (button) {
    button.disabled =
      true;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`,
        {
          method:
            "POST",

          body: {
            comment
          }
        }
      );


    currentVideo.comments_count =
      data.comments_count;


    input.value =
      "";


    await loadComments();

    showSuccess(
      "Comment added."
    );

  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {
      button.disabled =
        false;
    }
  }
}


/* ======================================================
   REPORT
====================================================== */

async function reportVideo() {

  if (!currentVideo) {
    return;
  }


  const reason =
    window.prompt(
      "Why are you reporting this video?",
      "Other"
    );


  if (
    reason === null
  ) {
    return;
  }


  const cleanReason =
    reason.trim() ||
    "Other";


  try {

    await api(
      `/api/videos/${encodeURIComponent(
        currentVideo.id
      )}/report`,
      {
        method:
          "POST",

        body: {
          reason:
            cleanReason
        }
      }
    );


    showSuccess(
      "Report submitted."
    );

  } catch (error) {

    showError(
      error.message
    );
  }
}


/* ======================================================
   EARN PAGE
====================================================== */

async function renderEarnPage() {

  const content =
    $("pageContent");

  if (!content) return;


  content.innerHTML = `
    <section class="page-section">

      <div class="section-heading">
        <div>
          <span class="eyebrow">
            Earn
          </span>

          <h1>
            Collect Points
          </h1>

          <p>
            Use available rewards inside DekhoEarn.
          </p>
        </div>

        <div class="wallet-big compact">
          <span>⭐</span>
          <strong>
            ${formatNumber(
              currentUser?.points || 0
            )}
          </strong>
          <small>Points</small>
        </div>
      </div>


      <div class="reward-grid">

        <div class="reward-card">

          <div class="reward-icon">
            🎁
          </div>

          <h2>
            Daily Reward
          </h2>

          <p>
            Claim your daily
            ${DAILY_REWARD}-point reward.
          </p>

          <button
            type="button"
            id="dailyRewardBtn"
            class="primary-btn"
          >
            Claim Daily Reward
          </button>

        </div>


        <div class="reward-card">

          <div class="reward-icon">
            📺
          </div>

          <h2>
            Reward Ad
          </h2>

          <p>
            Demo reward system.
            Real ad network can be connected later.
          </p>

          <button
            type="button"
            id="rewardAdBtn"
            class="primary-btn"
          >
            🎁 Reward Ad Demo
          </button>

        </div>

      </div>


      <div class="section-heading">
        <div>
          <h2>Points History</h2>
          <p>Your recent rewards</p>
        </div>
      </div>


      <div
        id="pointsHistory"
        class="history-list"
      >
        Loading...
      </div>

    </section>
  `;


  $("dailyRewardBtn")
    ?.addEventListener(
      "click",
      claimDailyReward
    );


  $("rewardAdBtn")
    ?.addEventListener(
      "click",
      claimRewardAd
    );


  await loadPointsHistory();
}


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDailyReward() {

  const button =
    $("dailyRewardBtn");


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Claiming...";
  }


  try {

    const data =
      await api(
        "/api/rewards/daily",
        {
          method:
            "POST"
        }
      );


    if (
      data.user
    ) {
      saveUser(
        data.user
      );
    }


    showSuccess(
      `+${data.reward || DAILY_REWARD} points added.`
    );


    await loadPointsHistory();


  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Claim Daily Reward";
    }
  }
}


/* ======================================================
   REWARDED AD DEMO
====================================================== */

async function claimRewardAd() {

  const confirmed =
    window.confirm(
      "Reward Ad Demo: claim 5 points?"
    );


  if (!confirmed) {
    return;
  }


  const button =
    $("rewardAdBtn");


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Processing...";
  }


  try {

    const data =
      await api(
        "/api/rewards/ad",
        {
          method:
            "POST"
        }
      );


    if (
      data.user
    ) {
      saveUser(
        data.user
      );
    }


    showSuccess(
      `+${data.reward || REWARDED_AD_POINTS} points added.`
    );


    await loadPointsHistory();


  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "🎁 Reward Ad Demo";
    }
  }
}


/* ======================================================
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {

  const container =
    $("pointsHistory");

  if (!container) {
    return;
  }


  try {

    const data =
      await api(
        "/api/points/history"
      );


    const history =
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!history.length) {

      container.innerHTML = `
        <div class="empty-card">
          No points history yet.
        </div>
      `;

      return;
    }


    container.innerHTML =
      history
        .map(
          item => `
            <div class="history-item">

              <div class="history-icon">
                ⭐
              </div>

              <div class="history-content">

                <strong>
                  ${escapeHtml(
                    item.reason ||
                    "Reward"
                  )}
                </strong>

                <small>
                  ${formatDate(
                    item.created_at
                  )}
                </small>

              </div>

              <div class="history-points">
                +${formatNumber(
                  item.points || 0
                )}
              </div>

            </div>
          `
        )
        .join("");


  } catch (error) {

    container.innerHTML = `
      <div class="error-card">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;
  }
}


/* ======================================================
   UPLOAD PAGE
====================================================== */

function renderUploadPage() {

  const content =
    $("pageContent");

  if (!content) return;


  content.innerHTML = `
    <section class="page-section">

      <div class="section-heading">

        <div>
          <span class="eyebrow">
            Gallery
          </span>

          <h1>
            Upload Video
          </h1>

          <p>
            Maximum video size: 100 MB
          </p>
        </div>

      </div>


      <div class="upload-card">

        <form
          id="uploadForm"
        >

          <label>
            Video file
          </label>

          <input
            id="videoFile"
            type="file"
            accept="video/*"
            required
          />


          <div
            id="videoPreviewBox"
            class="video-preview-box"
            style="display:none"
          >
            <video
              id="videoPreview"
              controls
              playsinline
            ></video>
          </div>


          <label>
            Video Title
          </label>

          <input
            id="videoTitle"
            type="text"
            maxlength="200"
            placeholder="Enter video title"
            required
          />


          <label>
            Description
          </label>

          <textarea
            id="videoDescription"
            maxlength="5000"
            rows="5"
            placeholder="Describe your video..."
          ></textarea>


          <div
            id="uploadFileInfo"
            class="file-info"
          ></div>


          <div
            id="uploadProgressWrap"
            class="upload-progress-wrap"
            style="display:none"
          >

            <div class="progress-label">
              <span>Uploading...</span>
              <span id="uploadProgressText">
                0%
              </span>
            </div>

            <div class="progress-bar">
              <div
                id="uploadProgressBar"
                class="progress-fill"
                style="width:0%"
              ></div>
            </div>

          </div>


          <div
            id="uploadStatus"
            class="upload-status"
          ></div>


          <button
            type="submit"
            id="uploadButton"
            class="primary-btn upload-submit"
          >
            Upload Video
          </button>

        </form>

      </div>


      <div class="section-heading my-videos-heading">

        <div>
          <h2>
            My Videos
          </h2>

          <p>
            Videos uploaded by you
          </p>
        </div>

      </div>


      <div
        id="myVideosList"
        class="video-grid"
      >
        Loading...
      </div>

    </section>
  `;


  $("videoFile")
    ?.addEventListener(
      "change",
      handleVideoFileSelect
    );


  $("uploadForm")
    ?.addEventListener(
      "submit",
      handleUpload
    );


  loadMyVideos();
}


/* ======================================================
   FILE SELECT
====================================================== */

function handleVideoFileSelect(
  event
) {

  const file =
    event.target.files?.[0];


  const previewBox =
    $("videoPreviewBox");

  const preview =
    $("videoPreview");

  const info =
    $("uploadFileInfo");


  if (!file) {

    if (previewBox) {
      previewBox.style.display =
        "none";
    }

    return;
  }


  if (
    !file.type.startsWith(
      "video/"
    )
  ) {

    event.target.value =
      "";

    showError(
      "Please select a video file."
    );

    return;
  }


  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    event.target.value =
      "";

    showError(
      "Maximum video size is 100 MB."
    );

    return;
  }


  if (info) {

    info.textContent =
      `${file.name} • ${formatBytes(
        file.size
      )}`;
  }


  if (
    preview &&
    previewBox
  ) {

    const url =
      URL.createObjectURL(
        file
      );

    preview.src =
      url;

    previewBox.style.display =
      "block";

    preview.onloadedmetadata =
      () => {

        try {
          URL.revokeObjectURL(
            url
          );
        } catch {}
      };
  }
}


/* ======================================================
   FORMAT BYTES
====================================================== */

function formatBytes(
  bytes
) {

  bytes =
    Math.max(
      0,
      safeNumber(bytes)
    );


  if (!bytes) {
    return "0 B";
  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];


  const index =
    Math.floor(
      Math.log(bytes) /
      Math.log(1024)
    );


  return (
    (bytes /
      Math.pow(
        1024,
        Math.min(
          index,
          units.length - 1
        )
      )
    ).toFixed(
      index === 0 ? 0 : 2
    ) +
    " " +
    units[
      Math.min(
        index,
        units.length - 1
      )
    ]
  );
}


/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

async function getCloudinarySignature() {

  /*
   * Server v3.1.3 supports GET.
   */

  const data =
    await api(
      "/api/cloudinary/signature"
    );


  if (
    !data.ok
  ) {
    throw new Error(
      data.message ||
      "Unable to prepare upload."
    );
  }


  if (
    !data.upload_url ||
    !data.signature ||
    !data.timestamp ||
    !data.api_key ||
    !data.cloud_name
  ) {

    throw new Error(
      "Invalid Cloudinary signature response."
    );
  }


  return data;
}


/* ======================================================
   CLOUDINARY UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signatureData,
  onProgress
) {

  return new Promise(
    (resolve, reject) => {

      const xhr =
        new XMLHttpRequest();


      uploadAbortController = {
        abort: () => {
          try {
            xhr.abort();
          } catch {}
        }
      };


      xhr.open(
        "POST",
        signatureData.upload_url,
        true
      );


      xhr.upload.onprogress =
        event => {

          if (
            event.lengthComputable
          ) {

            const percent =
              Math.round(
                (
                  event.loaded /
                  event.total
                ) *
                100
              );

            if (
              typeof onProgress ===
              "function"
            ) {
              onProgress(
                percent
              );
            }
          }
        };


      xhr.onload =
        () => {

          uploadAbortController =
            null;


          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {

            try {

              const response =
                JSON.parse(
                  xhr.responseText
                );

              resolve(
                response
              );

            } catch {

              reject(
                new Error(
                  "Invalid Cloudinary response."
                )
              );
            }

          } else {

            let message =
              "Cloudinary upload failed.";

            try {

              const response =
                JSON.parse(
                  xhr.responseText
                );

              message =
                response?.error?.message ||
                message;

            } catch {}

            reject(
              new Error(
                message
              )
            );
          }
        };


      xhr.onerror =
        () => {

          uploadAbortController =
            null;

          reject(
            new Error(
              "Network error during Cloudinary upload."
            )
          );
        };


      xhr.onabort =
        () => {

          uploadAbortController =
            null;

          reject(
            new Error(
              "Upload cancelled."
            )
          );
        };


      const formData =
        new FormData();


      formData.append(
        "file",
        file
      );

      formData.append(
        "api_key",
        signatureData.api_key
      );

      formData.append(
        "timestamp",
        signatureData.timestamp
      );

      formData.append(
        "signature",
        signatureData.signature
      );

      formData.append(
        "folder",
        signatureData.folder
      );


      xhr.send(
        formData
      );
    }
  );
}


/* ======================================================
   UPLOAD
====================================================== */

async function handleUpload(
  event
) {

  event.preventDefault();


  if (
    uploadInProgress
  ) {
    return;
  }


  const file =
    $("videoFile")
      ?.files?.[0];


  const title =
    $("videoTitle")
      ?.value
      .trim();


  const description =
    $("videoDescription")
      ?.value
      .trim();


  if (!file) {

    showError(
      "Please select a video."
    );

    return;
  }


  if (
    !file.type.startsWith(
      "video/"
    )
  ) {

    showError(
      "Selected file is not a video."
    );

    return;
  }


  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    showError(
      "Maximum video size is 100 MB."
    );

    return;
  }


  if (!title) {

    showError(
      "Video title is required."
    );

    return;
  }


  uploadInProgress =
    true;


  const button =
    $("uploadButton");


  const progressWrap =
    $("uploadProgressWrap");


  const progressBar =
    $("uploadProgressBar");


  const progressText =
    $("uploadProgressText");


  const status =
    $("uploadStatus");


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Preparing...";
  }


  if (progressWrap) {

    progressWrap.style.display =
      "block";
  }


  if (status) {

    status.textContent =
      "Preparing secure upload...";
  }


  try {

    /*
     * Step 1:
     * Get signed Cloudinary upload data
     */

    const signature =
      await getCloudinarySignature();


    if (status) {

      status.textContent =
        "Uploading video to Cloudinary...";
    }


    /*
     * Step 2:
     * Direct browser -> Cloudinary
     */

    const cloudinary =
      await uploadToCloudinary(
        file,
        signature,
        percent => {

          if (progressBar) {

            progressBar.style.width =
              `${percent}%`;
          }

          if (progressText) {

            progressText.textContent =
              `${percent}%`;
          }
        }
      );


    if (!cloudinary?.secure_url) {

      throw new Error(
        "Cloudinary did not return a video URL."
      );
    }


    if (status) {

      status.textContent =
        "Cloudinary upload complete. Saving video...";
    }


    /*
     * Step 3:
     * Save metadata in Neon through server
     */

    const duration =
      safeNumber(
        cloudinary.duration,
        0
      );


    const createData =
      await api(
        "/api/videos",
        {
          method:
            "POST",

          body: {
            title,

            description,

            video_url:
              cloudinary.secure_url,

            thumbnail_url:
              cloudinary.thumbnail_url ||
              "",

            cloudinary_public_id:
              cloudinary.public_id ||
              "",

            cloudinary_resource_type:
              cloudinary.resource_type ||
              "video",

            cloudinary_format:
              cloudinary.format ||
              "",

            duration,

            bytes:
              file.size
          }
        }
      );


    if (
      createData.user
    ) {
      saveUser(
        createData.user
      );
    }


    if (status) {

      status.textContent =
        createData.message ||
        "Video uploaded successfully.";
    }


    if (
      createData.video?.duplicate_warning
    ) {

      showToast(
        "Video uploaded, but duplicate URL warning was detected.",
        "warning"
      );

    } else {

      showSuccess(
        "Video uploaded successfully."
      );
    }


    /*
     * Reset form
     */

    $("uploadForm")
      ?.reset();


    if (progressBar) {
      progressBar.style.width =
        "100%";
    }

    if (progressText) {
      progressText.textContent =
        "100%";
    }


    if ($("videoPreviewBox")) {

      $("videoPreviewBox")
        .style.display =
        "none";
    }


    await loadMyVideos();


    /*
     * Refresh feed in background
     */

    await loadVideos();


  } catch (error) {

    console.error(
      "UPLOAD ERROR:",
      error
    );


    if (status) {

      status.textContent =
        error.message ||
        "Upload failed.";
    }


    showError(
      error.message ||
      "Upload failed."
    );

  } finally {

    uploadInProgress =
      false;

    uploadAbortController =
      null;


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Upload Video";
    }
  }
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  const container =
    $("myVideosList");


  try {

    const data =
      await api(
        `/api/videos?creator_id=${encodeURIComponent(
          currentUser.id
        )}&mine=1`
      );


    myVideos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    renderMyVideos();

    return myVideos;

  } catch (error) {

    if (container) {

      container.innerHTML =
        `
          <div class="error-card">
            ${escapeHtml(
              error.message
            )}
          </div>
        `;
    }

    return [];
  }
}


function renderMyVideos() {

  const container =
    $("myVideosList");


  if (!container) {
    return;
  }


  if (!myVideos.length) {

    container.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">🎬</div>
        <h3>No uploaded videos</h3>
        <p>
          Your uploaded videos will appear here.
        </p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    myVideos
      .map(
        video => `
          <article class="my-video-item">

            <div class="my-video-thumb">

              ${
                video.thumbnail_url
                  ? `
                    <img
                      src="${escapeHtml(
                        video.thumbnail_url
                      )}"
                      alt=""
                    />
                  `
                  : `
                    <div class="video-placeholder">
                      ▶
                    </div>
                  `
              }

            </div>

            <div class="my-video-content">

              <h3>
                ${escapeHtml(
                  video.title
                )}
              </h3>

              <p>
                👁
                ${formatNumber(
                  video.views || 0
                )}
                &nbsp; ❤️
                ${formatNumber(
                  video.likes_count || 0
                )}
              </p>

              <small>
                ${formatDate(
                  video.created_at
                )}
              </small>

              ${
                video.duplicate_warning
                  ? `
                    <div class="warning-box">
                      ⚠️ Duplicate URL warning
                    </div>
                  `
                  : ""
              }

              <div class="my-video-actions">

                <button
                  type="button"
                  class="secondary-btn"
                  onclick="openVideo(${Number(
                    video.id
                  )})"
                >
                  Watch
                </button>

                <button
                  type="button"
                  class="danger-btn"
                  onclick="deleteMyVideo(${Number(
                    video.id
                  )})"
                >
                  Delete
                </button>

              </div>

            </div>

          </article>
        `
      )
      .join("");
}


/* ======================================================
   DELETE MY VIDEO
====================================================== */

async function deleteMyVideo(
  videoId
) {

  const confirmed =
    window.confirm(
      "Delete this video permanently?"
    );


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/videos/${encodeURIComponent(
        videoId
      )}`,
      {
        method:
          "DELETE"
      }
    );


    showSuccess(
      "Video deleted successfully."
    );


    await loadMyVideos();

    await loadVideos();


  } catch (error) {

    showError(
      error.message
    );
  }
}


/* ======================================================
   HISTORY PAGE
====================================================== */

async function renderHistoryPage() {

  const content =
    $("pageContent");

  if (!content) return;


  content.innerHTML = `
    <section class="page-section">

      <div class="section-heading">

        <div>
          <span class="eyebrow">
            Activity
          </span>

          <h1>
            Watch History
          </h1>

          <p>
            Videos you have watched.
          </p>
        </div>

      </div>


      <div
        id="watchHistoryList"
        class="history-video-list"
      >
        Loading...
      </div>

    </section>
  `;


  await loadWatchHistory();
}


async function loadWatchHistory() {

  const container =
    $("watchHistoryList");


  if (!container) {
    return;
  }


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          currentUser.id
        )}/watch-history`
      );


    const history =
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!history.length) {

      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-icon">🕘</div>
          <h3>No watch history</h3>
          <p>
            Start watching videos to build your history.
          </p>
        </div>
      `;

      return;
    }


    container.innerHTML =
      history
        .map(
          item => `
            <article
              class="history-video"
              onclick="openVideo(${Number(
                item.video_id
              )})"
            >

              <div class="history-thumb">

                ${
                  item.thumbnail_url
                    ? `
                      <img
                        src="${escapeHtml(
                          item.thumbnail_url
                        )}"
                        alt=""
                        loading="lazy"
                      />
                    `
                    : `
                      <div class="video-placeholder">
                        ▶
                      </div>
                    `
                }

              </div>


              <div class="history-video-info">

                <h3>
                  ${escapeHtml(
                    item.title ||
                    "Video"
                  )}
                </h3>

                <p>
                  Watched:
                  ${formatDuration(
                    item.watch_seconds
                  )}
                </p>

                <small>
                  ${
                    item.reward_granted
                      ? "⭐ Reward received"
                      : "Reward not received"
                  }
                  •
                  ${formatDate(
                    item.updated_at ||
                    item.created_at
                  )}
                </small>

              </div>

            </article>
          `
        )
        .join("");


  } catch (error) {

    container.innerHTML = `
      <div class="error-card">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;
  }
}


/* ======================================================
   PROFILE PAGE
====================================================== */

async function renderProfilePage() {

  const content =
    $("pageContent");

  if (!content) return;


  let profile =
    currentUser;


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          currentUser.id
        )}`
      );

    if (
      data.user
    ) {

      profile =
        data.user;

      saveUser(
        profile
      );
    }

  } catch (error) {

    console.warn(
      "PROFILE:",
      error.message
    );
  }


  content.innerHTML = `
    <section class="page-section">

      <div class="profile-card">

        <div class="profile-avatar">
          ${escapeHtml(
            (
              profile.first_name ||
              profile.username ||
              "U"
            )
              .charAt(0)
              .toUpperCase()
          )}
        </div>

        <h1>
          ${escapeHtml(
            profile.first_name ||
            profile.username
          )}
        </h1>

        <p class="username">
          @${escapeHtml(
            profile.username ||
            ""
          )}
        </p>

        ${
          profile.referral_code
            ? `
              <div class="referral-box">
                <span>Your Referral Code</span>
                <strong>
                  ${escapeHtml(
                    profile.referral_code
                  )}
                </strong>
              </div>
            `
            : ""
        }

      </div>


      <div class="stats-grid">

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.points || 0
            )}
          </strong>
          <span>Points</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.total_earned || 0
            )}
          </strong>
          <span>Total Earned</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.watched_videos || 0
            )}
          </strong>
          <span>Watched</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.total_videos || 0
            )}
          </strong>
          <span>My Videos</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.followers_count || 0
            )}
          </strong>
          <span>Followers</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              profile.following_count || 0
            )}
          </strong>
          <span>Following</span>
        </div>

      </div>


      <div class="menu-card">

        <button
          type="button"
          onclick="showPage('creator')"
        >
          <span>🎬</span>
          <div>
            <strong>Creator Dashboard</strong>
            <small>
              Stats and monetization eligibility
            </small>
          </div>
          <span>›</span>
        </button>


        <button
          type="button"
          onclick="showPage('upload')"
        >
          <span>📤</span>
          <div>
            <strong>My Videos</strong>
            <small>
              Upload and manage videos
            </small>
          </div>
          <span>›</span>
        </button>


        <button
          type="button"
          onclick="showPage('history')"
        >
          <span>🕘</span>
          <div>
            <strong>Watch History</strong>
            <small>
              Your watched videos
            </small>
          </div>
          <span>›</span>
        </button>


        <button
          type="button"
          id="profileLogoutBtn"
        >
          <span>🚪</span>
          <div>
            <strong>Logout</strong>
            <small>
              Sign out of this device
            </small>
          </div>
          <span>›</span>
        </button>

      </div>


      <div class="app-info-card">
        <strong>DekhoEarn</strong>
        <p>
          Version 3.1.4
        </p>
        <small>
          Dekho. Earn Karo. Reward Lo.
        </small>
      </div>

    </section>
  `;


  $("profileLogoutBtn")
    ?.addEventListener(
      "click",
      logoutUser
    );
}


/* ======================================================
   CREATOR DASHBOARD
====================================================== */

async function renderCreatorPage() {

  const content =
    $("pageContent");

  if (!content) return;


  content.innerHTML = `
    <section class="page-section">

      <button
        type="button"
        class="back-btn"
        onclick="showPage('profile')"
      >
        ← Profile
      </button>

      <div class="section-heading">

        <div>
          <span class="eyebrow">
            Creator
          </span>

          <h1>
            Creator Dashboard
          </h1>

          <p>
            Track your creator statistics.
          </p>
        </div>

      </div>


      <div
        id="creatorStats"
        class="creator-dashboard"
      >
        Loading...
      </div>

    </section>
  `;


  await loadCreatorStats();
}


/* ======================================================
   CREATOR STATS
====================================================== */

async function loadCreatorStats() {

  const container =
    $("creatorStats");


  if (!container) {
    return;
  }


  try {

    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          currentUser.id
        )}/stats`
      );


    const stats =
      data.stats;


    const followers =
      safeNumber(
        stats.followers
      );


    const watchHours =
      safeNumber(
        stats.watch_hours
      );


    const followerTarget =
      1000;


    const watchTarget =
      1000;


    const followerPercent =
      Math.min(
        100,
        (
          followers /
          followerTarget
        ) *
        100
      );


    const watchPercent =
      Math.min(
        100,
        (
          watchHours /
          watchTarget
        ) *
        100
      );


    container.innerHTML = `

      <div class="creator-status-card">

        <div>
          <span>
            Creator Status
          </span>

          <strong>
            ${escapeHtml(
              stats.creator_status ||
              "none"
            )}
          </strong>
        </div>

        <div>
          <span>
            Monetization
          </span>

          <strong>
            ${escapeHtml(
              stats.monetization_status ||
              "not_applied"
            )}
          </strong>
        </div>

      </div>


      <div class="stats-grid">

        <div class="stat-card">
          <strong>
            ${formatNumber(
              followers
            )}
          </strong>
          <span>Followers</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              stats.total_videos || 0
            )}
          </strong>
          <span>Videos</span>
        </div>

        <div class="stat-card">
          <strong>
            ${formatNumber(
              stats.total_views || 0
            )}
          </strong>
          <span>Views</span>
        </div>

        <div class="stat-card">
          <strong>
            ${watchHours.toFixed(2)}
          </strong>
          <span>Watch Hours</span>
        </div>

        <div class="stat-card">
          <strong>
            ₹${safeNumber(
              stats.creator_amount
            ).toFixed(2)}
          </strong>
          <span>Creator Amount</span>
        </div>

      </div>


      <div class="eligibility-card">

        <h2>
          Monetization Eligibility
        </h2>

        <p>
          Requirement:
          ${followerTarget} followers
          and
          ${watchTarget} watch hours.
        </p>


        <div class="requirement-row">

          <div class="requirement-top">
            <span>Followers</span>
            <strong>
              ${formatNumber(
                followers
              )}
              / ${formatNumber(
                followerTarget
              )}
            </strong>
          </div>

          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width:${followerPercent}%"
            ></div>
          </div>

        </div>


        <div class="requirement-row">

          <div class="requirement-top">
            <span>Watch Hours</span>
            <strong>
              ${watchHours.toFixed(2)}
              / ${watchTarget}
            </strong>
          </div>

          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width:${watchPercent}%"
            ></div>
          </div>

        </div>


        ${
          stats.monetization_eligible
            ? `
              <div class="success-box">
                🎉 You meet the current creator eligibility requirements.
              </div>

              <button
                type="button"
                class="primary-btn"
                id="creatorApplyBtn"
              >
                Apply for Creator Monetization
              </button>
            `
            : `
              <div class="info-box">
                Keep growing your followers and watch hours.
              </div>
            `
        }

      </div>


      <div class="info-card">

        <h3>
          Monetization Foundation
        </h3>

        <p>
          Creator earnings are recorded by the
          server. Actual payouts can be connected
          later after the monetization and payout
          system is finalized.
        </p>

      </div>

    `;


    $("creatorApplyBtn")
      ?.addEventListener(
        "click",
        applyCreator
      );


  } catch (error) {

    container.innerHTML = `
      <div class="error-card">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;
  }
}


/* ======================================================
   CREATOR APPLY
====================================================== */

async function applyCreator() {

  const confirmed =
    window.confirm(
      "Submit creator application?"
    );


  if (!confirmed) {
    return;
  }


  try {

    const data =
      await api(
        "/api/creator/apply",
        {
          method:
            "POST"
        }
      );


    if (
      data.user
    ) {
      saveUser(
        data.user
      );
    }


    showSuccess(
      data.message ||
      "Creator application submitted."
    );


    await loadCreatorStats();


  } catch (error) {

    showError(
      error.message
    );
  }
}


/* ======================================================
   FOLLOW STATUS
====================================================== */

async function getFollowStatus(
  creatorId
) {

  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          creatorId
        )}/follow`
      );

    return Boolean(
      data.following
    );

  } catch {

    return false;
  }
}


/* ======================================================
   FOLLOW TOGGLE
====================================================== */

async function toggleFollow(
  creatorId,
  button
) {

  if (!creatorId) {
    return;
  }


  if (
    String(creatorId) ===
    String(currentUser.id)
  ) {

    showError(
      "You cannot follow yourself."
    );

    return;
  }


  if (button) {
    button.disabled =
      true;
  }


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          creatorId
        )}/follow`,
        {
          method:
            "POST"
        }
      );


    if (button) {

      button.textContent =
        data.following
          ? "Following"
          : "Follow";
    }


    showSuccess(
      data.following
        ? "Following creator."
        : "Unfollowed creator."
    );


  } catch (error) {

    showError(
      error.message
    );

  } finally {

    if (button) {
      button.disabled =
        false;
    }
  }
}


/* ======================================================
   PAYOUT ACCOUNT FOUNDATION
====================================================== */

async function savePayoutAccount(
  accountName,
  accountType,
  accountReference
) {

  return api(
    "/api/payout-account",
    {
      method:
        "POST",

      body: {
        account_name:
          accountName,

        account_type:
          accountType,

        account_reference:
          accountReference
      }
    }
  );
}


/* ======================================================
   PWA INSTALL
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  event => {

    event.preventDefault();

    deferredPrompt =
      event;

    addInstallButton();
  }
);


window.addEventListener(
  "appinstalled",
  () => {

    deferredPrompt =
      null;

    showSuccess(
      "DekhoEarn installed successfully."
    );

    removeInstallButton();
  }
);


function addInstallButton() {

  if (
    $("installAppBtn")
  ) {
    return;
  }


  const topbar =
    qs(".top-user");


  if (!topbar) {
    return;
  }


  const button =
    document.createElement(
      "button"
    );


  button.id =
    "installAppBtn";

  button.className =
    "install-btn";

  button.type =
    "button";

  button.textContent =
    "Install";


  button.addEventListener(
    "click",
    installApp
  );


  topbar.insertBefore(
    button,
    topbar.firstChild
  );
}


function removeInstallButton() {

  $("installAppBtn")
    ?.remove();
}


async function installApp() {

  if (!deferredPrompt) {

    showToast(
      "Install option is not currently available.",
      "info"
    );

    return;
  }


  try {

    await deferredPrompt.prompt();

    await deferredPrompt.userChoice;

  } catch (error) {

    console.warn(
      "PWA INSTALL:",
      error
    );
  }


  deferredPrompt =
    null;

  removeInstallButton();
}


/* ======================================================
   SERVICE WORKER
====================================================== */

async function registerServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {
    return;
  }


  try {

    await navigator.serviceWorker.register(
      "/sw.js"
    );

    console.log(
      "Service worker registered."
    );

  } catch (error) {

    console.warn(
      "Service worker registration failed:",
      error.message
    );
  }
}


/* ======================================================
   AUTH STYLE
====================================================== */

function injectAuthStyles() {

  if (
    $("dekhoearn-auth-styles")
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "dekhoearn-auth-styles";


  style.textContent = `

    .auth-wrapper {
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:#f5f7fb;
    }

    .auth-card {
      width:100%;
      max-width:430px;
      background:#fff;
      border-radius:24px;
      padding:28px;
      box-shadow:0 15px 50px rgba(0,0,0,.10);
    }

    .auth-logo {
      text-align:center;
      margin-bottom:25px;
    }

    .auth-logo-icon {
      width:64px;
      height:64px;
      margin:auto;
      border-radius:20px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#111;
      color:#fff;
      font-size:26px;
    }

    .auth-logo h1 {
      margin:12px 0 4px;
    }

    .auth-logo p {
      margin:0;
      color:#777;
    }

    .auth-tabs {
      display:flex;
      gap:8px;
      margin-bottom:20px;
    }

    .auth-tab {
      flex:1;
      padding:11px;
      border:0;
      border-radius:12px;
      background:#f0f1f5;
      cursor:pointer;
    }

    .auth-tab.active {
      background:#111;
      color:#fff;
    }

    .auth-card label {
      display:block;
      margin:14px 0 7px;
      font-weight:600;
    }

    .auth-card input,
    .auth-card textarea {
      width:100%;
      box-sizing:border-box;
      padding:13px;
      border:1px solid #ddd;
      border-radius:12px;
      font:inherit;
    }

    .auth-card small {
      color:#777;
      display:block;
      margin-top:5px;
    }

    .auth-message {
      margin-top:15px;
      color:#d22;
      text-align:center;
    }

  `;


  document.head.appendChild(
    style
  );
}


/* ======================================================
   MAIN STYLES
====================================================== */

function injectMainStyles() {

  if (
    $("dekhoearn-main-styles")
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "dekhoearn-main-styles";


  style.textContent = `

    * {
      box-sizing:border-box;
    }

    body {
      margin:0;
      font-family:Arial, sans-serif;
      background:#f7f8fa;
      color:#171717;
    }

    button,
    input,
    textarea {
      font:inherit;
    }

    button {
      cursor:pointer;
    }

    button:disabled {
      opacity:.55;
      cursor:not-allowed;
    }

    .dekhoearn-app {
      min-height:100vh;
      padding-bottom:80px;
    }

    .topbar {
      position:sticky;
      top:0;
      z-index:100;
      background:#fff;
      border-bottom:1px solid #eee;
      min-height:68px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:10px 18px;
      gap:12px;
    }

    .brand {
      display:flex;
      align-items:center;
      gap:10px;
      cursor:pointer;
    }

    .brand-icon {
      width:42px;
      height:42px;
      border-radius:13px;
      background:#111;
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .brand strong {
      display:block;
    }

    .brand small {
      color:#777;
      display:block;
      margin-top:2px;
    }

    .top-user {
      display:flex;
      align-items:center;
      gap:8px;
    }

    .points-pill {
      padding:8px 12px;
      border-radius:20px;
      background:#f1f2f5;
      white-space:nowrap;
    }

    .logout-btn,
    .install-btn {
      border:0;
      border-radius:10px;
      padding:8px 10px;
      background:#eee;
    }

    .page-content {
      max-width:1050px;
      margin:auto;
      padding:22px 16px;
    }

    .page-section {
      width:100%;
    }

    .welcome-card {
      background:#111;
      color:#fff;
      border-radius:22px;
      padding:24px;
      display:flex;
      justify-content:space-between;
      gap:20px;
      align-items:center;
      margin-bottom:28px;
    }

    .welcome-card h1 {
      margin:5px 0;
    }

    .welcome-card p {
      margin:0;
      color:#ccc;
    }

    .eyebrow {
      font-size:12px;
      text-transform:uppercase;
      letter-spacing:.08em;
      color:#777;
    }

    .welcome-card .eyebrow {
      color:#aaa;
    }

    .wallet-big {
      min-width:100px;
      text-align:center;
      padding:15px;
      border-radius:16px;
      background:rgba(255,255,255,.1);
    }

    .wallet-big span {
      font-size:20px;
    }

    .wallet-big strong {
      display:block;
      font-size:26px;
      margin-top:4px;
    }

    .wallet-big small {
      color:#bbb;
    }

    .wallet-big.compact {
      background:#f0f1f5;
      color:#111;
    }

    .wallet-big.compact small {
      color:#777;
    }

    .section-heading {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:15px;
      margin:20px 0 14px;
    }

    .section-heading h1,
    .section-heading h2 {
      margin:2px 0;
    }

    .section-heading p {
      margin:5px 0 0;
      color:#777;
    }

    .video-grid {
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:16px;
    }

    .video-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:18px;
      overflow:hidden;
      cursor:pointer;
    }

    .video-thumbnail {
      position:relative;
      aspect-ratio:16/9;
      background:#ddd;
      overflow:hidden;
    }

    .video-thumbnail img,
    .my-video-thumb img,
    .history-thumb img {
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }

    .video-placeholder {
      width:100%;
      height:100%;
      min-height:150px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#ddd;
      font-size:40px;
    }

    .duration-badge {
      position:absolute;
      right:8px;
      bottom:8px;
      background:#111;
      color:#fff;
      padding:4px 7px;
      border-radius:6px;
      font-size:12px;
    }

    .video-card-body {
      padding:14px;
    }

    .video-card-body h3 {
      margin:0 0 8px;
      font-size:17px;
    }

    .creator-line {
      color:#666;
      margin:0 0 9px;
    }

    .video-meta {
      display:flex;
      gap:15px;
      color:#666;
      font-size:13px;
    }

    .quick-like-btn {
      border:0;
      background:#f2f2f2;
      border-radius:9px;
      padding:8px 10px;
      margin-top:10px;
    }

    .warning-box,
    .info-box,
    .success-box {
      margin-top:10px;
      padding:10px;
      border-radius:10px;
      font-size:13px;
    }

    .warning-box {
      background:#fff4d8;
      color:#805b00;
    }

    .info-box {
      background:#edf5ff;
    }

    .success-box {
      background:#e8f8ed;
      color:#17652d;
    }

    .primary-btn,
    .secondary-btn,
    .danger-btn {
      border:0;
      border-radius:11px;
      padding:11px 15px;
      font-weight:600;
    }

    .primary-btn {
      background:#111;
      color:#fff;
    }

    .secondary-btn {
      background:#eee;
      color:#111;
    }

    .danger-btn {
      background:#ffe5e5;
      color:#a40000;
    }

    .back-btn {
      border:0;
      background:transparent;
      padding:7px 0;
      margin-bottom:12px;
      font-weight:600;
    }

    .bottom-nav {
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      height:68px;
      background:#fff;
      border-top:1px solid #ddd;
      z-index:200;
      display:flex;
      justify-content:center;
    }

    .bottom-nav button {
      flex:1;
      max-width:170px;
      border:0;
      background:#fff;
      color:#777;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:3px;
    }

    .bottom-nav button.active {
      color:#111;
      font-weight:700;
    }

    .bottom-nav span {
      font-size:20px;
    }

    .bottom-nav small {
      font-size:11px;
    }

    .loading-card,
    .empty-card,
    .error-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:16px;
      padding:25px;
      text-align:center;
    }

    .empty-icon {
      font-size:40px;
      margin-bottom:10px;
    }

    .player-card {
      background:#000;
      border-radius:18px;
      overflow:hidden;
    }

    .main-video {
      width:100%;
      max-height:70vh;
      display:block;
      background:#000;
    }

    .watch-info {
      background:#fff;
      margin-top:15px;
      padding:18px;
      border-radius:18px;
    }

    .watch-info h1 {
      margin-top:0;
    }

    .watch-creator {
      display:flex;
      gap:18px;
      color:#666;
      margin-bottom:12px;
    }

    .description {
      line-height:1.6;
    }

    .watch-actions {
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin:15px 0;
    }

    .action-btn {
      border:0;
      background:#f1f1f1;
      padding:10px 14px;
      border-radius:10px;
    }

    .reward-status {
      background:#f3f4f6;
      border-radius:12px;
      padding:12px;
      margin-top:12px;
    }

    .reward-status.reward-success {
      background:#e7f8ec;
    }

    .watch-timer {
      color:#777;
      margin-top:8px;
      font-size:13px;
    }

    .comments-panel {
      margin-top:18px;
      border-top:1px solid #eee;
      padding-top:18px;
    }

    .comment-form {
      display:flex;
      gap:8px;
      margin-bottom:15px;
    }

    .comment-form input {
      flex:1;
      padding:11px;
      border:1px solid #ddd;
      border-radius:10px;
    }

    .comment-item {
      display:flex;
      gap:10px;
      padding:12px 0;
      border-bottom:1px solid #eee;
    }

    .comment-avatar {
      width:34px;
      height:34px;
      border-radius:50%;
      background:#eee;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .comment-item p {
      margin:5px 0;
    }

    .comment-item small {
      color:#888;
    }

    .reward-grid {
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:16px;
    }

    .reward-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:18px;
      padding:20px;
    }

    .reward-icon {
      font-size:35px;
    }

    .reward-card h2 {
      margin:8px 0;
    }

    .reward-card p {
      color:#666;
      line-height:1.5;
      min-height:45px;
    }

    .history-list {
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .history-item {
      background:#fff;
      border:1px solid #eee;
      border-radius:14px;
      padding:13px;
      display:flex;
      align-items:center;
      gap:12px;
    }

    .history-icon {
      width:40px;
      height:40px;
      border-radius:12px;
      background:#f0f1f5;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .history-content {
      flex:1;
    }

    .history-content strong,
    .history-content small {
      display:block;
    }

    .history-content small {
      color:#888;
      margin-top:4px;
    }

    .history-points {
      font-weight:700;
    }

    .upload-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:18px;
      padding:20px;
    }

    .upload-card label {
      display:block;
      font-weight:600;
      margin:14px 0 7px;
    }

    .upload-card input,
    .upload-card textarea {
      width:100%;
      padding:12px;
      border:1px solid #ddd;
      border-radius:11px;
      font:inherit;
    }

    .video-preview-box {
      margin-top:15px;
      background:#000;
      border-radius:12px;
      overflow:hidden;
    }

    .video-preview-box video {
      width:100%;
      max-height:400px;
      display:block;
    }

    .file-info {
      margin-top:8px;
      color:#666;
      font-size:13px;
    }

    .upload-progress-wrap {
      margin-top:18px;
    }

    .progress-label,
    .requirement-top {
      display:flex;
      justify-content:space-between;
      margin-bottom:7px;
      font-size:13px;
    }

    .progress-bar {
      height:9px;
      background:#e5e5e5;
      border-radius:20px;
      overflow:hidden;
    }

    .progress-fill {
      height:100%;
      background:#111;
      transition:width .2s ease;
    }

    .upload-status {
      margin-top:12px;
      min-height:20px;
      color:#666;
    }

    .upload-submit {
      width:100%;
      margin-top:18px;
    }

    .my-videos-heading {
      margin-top:35px;
    }

    .my-video-item {
      background:#fff;
      border:1px solid #eee;
      border-radius:16px;
      overflow:hidden;
      display:flex;
    }

    .my-video-thumb {
      width:180px;
      flex:none;
      background:#ddd;
      min-height:130px;
    }

    .my-video-content {
      padding:14px;
      flex:1;
    }

    .my-video-content h3 {
      margin-top:0;
    }

    .my-video-content p,
    .my-video-content small {
      color:#666;
    }

    .my-video-actions {
      display:flex;
      gap:8px;
      margin-top:10px;
    }

    .history-video-list {
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .history-video {
      background:#fff;
      border:1px solid #eee;
      border-radius:15px;
      overflow:hidden;
      display:flex;
      cursor:pointer;
    }

    .history-thumb {
      width:190px;
      min-height:110px;
      background:#ddd;
      flex:none;
    }

    .history-video-info {
      padding:14px;
    }

    .history-video-info h3 {
      margin:0 0 7px;
    }

    .history-video-info p {
      color:#666;
    }

    .history-video-info small {
      color:#888;
    }

    .profile-card {
      text-align:center;
      background:#fff;
      border:1px solid #eee;
      border-radius:20px;
      padding:25px;
    }

    .profile-avatar {
      width:75px;
      height:75px;
      margin:auto;
      border-radius:50%;
      background:#111;
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:30px;
      font-weight:700;
    }

    .profile-card h1 {
      margin-bottom:4px;
    }

    .username {
      color:#777;
    }

    .referral-box {
      margin:15px auto 0;
      max-width:300px;
      padding:12px;
      background:#f4f4f4;
      border-radius:12px;
    }

    .referral-box span,
    .referral-box strong {
      display:block;
    }

    .referral-box span {
      color:#777;
      font-size:12px;
    }

    .stats-grid {
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:12px;
      margin:15px 0;
    }

    .stat-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:15px;
      padding:16px;
      text-align:center;
    }

    .stat-card strong {
      display:block;
      font-size:22px;
    }

    .stat-card span {
      color:#777;
      font-size:13px;
      display:block;
      margin-top:4px;
    }

    .menu-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:18px;
      overflow:hidden;
    }

    .menu-card button {
      width:100%;
      border:0;
      border-bottom:1px solid #eee;
      background:#fff;
      padding:15px;
      display:flex;
      align-items:center;
      gap:12px;
      text-align:left;
    }

    .menu-card button:last-child {
      border-bottom:0;
    }

    .menu-card button > div {
      flex:1;
    }

    .menu-card strong,
    .menu-card small {
      display:block;
    }

    .menu-card small {
      color:#777;
      margin-top:4px;
    }

    .app-info-card {
      text-align:center;
      padding:20px;
      color:#777;
    }

    .creator-dashboard {
      display:flex;
      flex-direction:column;
      gap:15px;
    }

    .creator-status-card {
      background:#111;
      color:#fff;
      border-radius:18px;
      padding:18px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:15px;
    }

    .creator-status-card span,
    .creator-status-card strong {
      display:block;
    }

    .creator-status-card span {
      color:#aaa;
      font-size:12px;
    }

    .creator-status-card strong {
      margin-top:5px;
    }

    .eligibility-card,
    .info-card {
      background:#fff;
      border:1px solid #eee;
      border-radius:18px;
      padding:20px;
    }

    .requirement-row {
      margin:18px 0;
    }

    @media(max-width:800px) {

      .video-grid {
        grid-template-columns:repeat(2,1fr);
      }

      .stats-grid {
        grid-template-columns:repeat(2,1fr);
      }

    }

    @media(max-width:600px) {

      .topbar {
        padding:9px 10px;
      }

      .top-user > span:first-child {
        display:none;
      }

      .logout-btn {
        display:none;
      }

      .page-content {
        padding:15px 10px;
      }

      .welcome-card {
        flex-direction:column;
        align-items:flex-start;
      }

      .wallet-big {
        width:100%;
      }

      .video-grid {
        grid-template-columns:1fr;
      }

      .reward-grid {
        grid-template-columns:1fr;
      }

      .stats-grid {
        grid-template-columns:repeat(2,1fr);
      }

      .my-video-item,
      .history-video {
        display:block;
      }

      .my-video-thumb,
      .history-thumb {
        width:100%;
        height:auto;
        aspect-ratio:16/9;
      }

      .watch-actions {
        display:grid;
        grid-template-columns:1fr 1fr;
      }

      .comment-form {
        flex-direction:column;
      }

      .brand small {
        display:none;
      }

      .creator-status-card {
        grid-template-columns:1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );
}


/* ======================================================
   GLOBAL ERROR HANDLER
====================================================== */

window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "UNHANDLED PROMISE:",
      event.reason
    );
  }
);


/* ======================================================
   INIT
====================================================== */

async function initDekhoEarn() {

  console.log(
    "DekhoEarn App.js v3.1.4 starting..."
  );


  loadStoredUser();


  /*
   * No token:
   * show login/register.
   */

  if (!getToken()) {

    showAuthScreen();

    registerServiceWorker();

    return;
  }


  /*
   * Token exists:
   * verify with server.
   */

  const authenticated =
    await loadCurrentUser();


  if (!authenticated) {

    clearAuth();

    showAuthScreen();

    registerServiceWorker();

    return;
  }


  /*
   * Valid token.
   */

  await showMainApp();


  registerServiceWorker();
}


/* ======================================================
   GLOBAL EXPORTS
====================================================== */

window.showPage =
  showPage;

window.openVideo =
  openVideo;

window.deleteMyVideo =
  deleteMyVideo;

window.toggleFollow =
  toggleFollow;

window.savePayoutAccount =
  savePayoutAccount;

window.logoutUser =
  logoutUser;


/* ======================================================
   START
====================================================== */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initDekhoEarn
  );

} else {

  initDekhoEarn();
}
