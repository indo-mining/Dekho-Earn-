/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.4 FINAL
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Server v3.1.3+
 - Secure Bearer Authentication
 - Video Feed
 - Watch Rewards
 - Likes / Comments / Reports
 - Follow System
 - Daily Reward
 - Rewarded Ad Demo
 - Points History
 - Watch History
 - Gallery Video Upload
 - Cloudinary Signed Upload
 - Upload Progress
 - Detailed Upload Diagnostics
 - My Videos
 - Creator Dashboard
 - Monetization Foundation
 - PWA
=========================================================
*/

"use strict";


/* ======================================================
   CONFIG
====================================================== */

const API_BASE = "";

const AUTH_TOKEN_KEY = "dekhoearn_auth_token";
const USER_KEY = "dekhoearn_user";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MIN_WATCH_SECONDS = 10;

const CLOUDINARY_UPLOAD_TIMEOUT =
  15 * 60 * 1000;


/* ======================================================
   GLOBAL STATE
====================================================== */

let currentUser = null;

let authToken =
  localStorage.getItem(AUTH_TOKEN_KEY) || "";

let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;
let watchTimer = null;

let deferredPrompt = null;

let selectedVideoFile = null;
let uploadPreviewUrl = null;
let selectedVideoDuration = 0;

let uploadInProgress = false;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}


function showToast(message, type = "normal") {

  document
    .querySelectorAll(".dekho-toast")
    .forEach(el => el.remove());

  const toast =
    document.createElement("div");

  toast.className =
    `dekho-toast ${type}`;

  toast.textContent =
    String(message || "");

  toast.style.position = "fixed";
  toast.style.left = "50%";
  toast.style.bottom = "85px";
  toast.style.transform =
    "translateX(-50%)";
  toast.style.zIndex = "999999";
  toast.style.maxWidth = "92%";
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "12px";
  toast.style.background = "#111";
  toast.style.color = "#fff";
  toast.style.fontSize = "14px";
  toast.style.boxShadow =
    "0 6px 25px rgba(0,0,0,.25)";
  toast.style.textAlign = "center";

  document.body.appendChild(toast);

  setTimeout(() => {

    if (toast.parentNode) {
      toast.remove();
    }

  }, 4500);
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatNumber(value) {

  return Number(value || 0)
    .toLocaleString("en-IN");
}


function formatVideoSize(bytes) {

  const size =
    Number(bytes || 0);

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(
      size /
      1024 /
      1024
    ).toFixed(1)} MB`;
  }

  return `${(
    size /
    1024 /
    1024 /
    1024
  ).toFixed(2)} GB`;
}


function formatDate(value) {

  if (!value) return "";

  try {

    return new Date(value)
      .toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      );

  } catch {

    return "";
  }
}


function getFirstExistingId(ids) {

  for (const id of ids) {

    if ($(id)) {
      return id;
    }
  }

  return null;
}


/* ======================================================
   CLOUDINARY ERROR
====================================================== */

class CloudinaryUploadError
  extends Error {

  constructor(
    message,
    status = 0,
    details = ""
  ) {

    super(message);

    this.name =
      "CloudinaryUploadError";

    this.status =
      status;

    this.details =
      details;
  }
}


/* ======================================================
   SESSION
====================================================== */

function saveSession(
  token,
  user
) {

  authToken =
    String(token || "");

  currentUser =
    user || null;


  if (authToken) {

    localStorage.setItem(
      AUTH_TOKEN_KEY,
      authToken
    );
  }


  if (currentUser) {

    localStorage.setItem(
      USER_KEY,
      JSON.stringify(
        currentUser
      )
    );
  }
}


function clearSession() {

  authToken = "";

  currentUser = null;

  localStorage.removeItem(
    AUTH_TOKEN_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  stopWatchTimer();
}


/* ======================================================
   API RESPONSE
====================================================== */

async function parseApiResponse(
  response
) {

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  if (
    contentType.includes(
      "application/json"
    )
  ) {

    try {

      return await response.json();

    } catch {

      return {};
    }
  }


  try {

    const text =
      await response.text();

    return {
      message: text
    };

  } catch {

    return {};
  }
}


/* ======================================================
   API HELPER
====================================================== */

async function api(
  path,
  options = {}
) {

  const requestOptions = {
    ...options
  };


  const headers = {
    ...(options.headers || {})
  };


  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {

    headers["Content-Type"] =
      "application/json";
  }


  if (authToken) {

    headers.Authorization =
      `Bearer ${authToken}`;
  }


  requestOptions.headers =
    headers;


  if (
    !requestOptions.cache &&
    String(
      options.method || "GET"
    ).toUpperCase() === "GET"
  ) {

    requestOptions.cache =
      "no-store";
  }


  let response;


  try {

    response =
      await fetch(
        `${API_BASE}${path}`,
        requestOptions
      );

  } catch (error) {

    console.error(
      "API FETCH ERROR:",
      {
        path,
        error
      }
    );

    throw new Error(
      "Network error while connecting to DekhoEarn server."
    );
  }


  const data =
    await parseApiResponse(
      response
    );


  if (
    response.status === 401 &&
    !path.startsWith(
      "/api/auth/login"
    ) &&
    !path.startsWith(
      "/api/auth/register"
    )
  ) {

    clearSession();

    showAuthScreen(
      "login",
      "Session expired. Please login again."
    );

    throw new Error(
      "Session expired. Please login again."
    );
  }


  if (!response.ok) {

    const message =
      data?.message ||
      data?.error ||
      `Request failed with HTTP ${response.status}`;


    throw new Error(
      message
    );
  }


  return data;
}


/* ======================================================
   AUTH SCREEN
====================================================== */

function showAuthScreen(
  mode = "login",
  message = ""
) {

  $("authScreen")
    ?.classList.remove(
      "hidden"
    );

  $("appScreen")
    ?.classList.add(
      "hidden"
    );


  const loginForm =
    $("loginForm");

  const registerForm =
    $("registerForm");


  if (mode === "register") {

    loginForm?.classList.add(
      "hidden"
    );

    registerForm?.classList.remove(
      "hidden"
    );

  } else {

    registerForm?.classList.add(
      "hidden"
    );

    loginForm?.classList.remove(
      "hidden"
    );
  }


  if (message) {

    showToast(
      message,
      "error"
    );
  }
}


function showApp() {

  $("authScreen")
    ?.classList.add(
      "hidden"
    );

  $("appScreen")
    ?.classList.remove(
      "hidden"
    );


  updateUserUI();


  showPage(
    "homeSection"
  );


  loadVideos();
}


/* ======================================================
   LOGIN
====================================================== */

async function login() {

  const username =
    String(
      $("loginUsername")
        ?.value || ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      $("loginPassword")
        ?.value || ""
    );


  if (
    !username ||
    !password
  ) {

    showToast(
      "Username and password required.",
      "error"
    );

    return;
  }


  const button =
    $("loginBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Logging in...";
  }


  try {

    const data =
      await api(
        "/api/auth/login",
        {
          method: "POST",

          body:
            JSON.stringify({
              username,
              password
            })
        }
      );


    if (
      !data.token ||
      !data.user
    ) {

      throw new Error(
        "Invalid login response from server."
      );
    }


    saveSession(
      data.token,
      data.user
    );


    showToast(
      "Login successful 🎉",
      "success"
    );


    showApp();

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );


    showToast(
      error.message ||
      "Login failed.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Login";
    }
  }
}


/* ======================================================
   REGISTER
====================================================== */

async function register() {

  const firstName =
    String(
      $("registerFirstName")
        ?.value || ""
    ).trim();


  const username =
    String(
      $("registerUsername")
        ?.value || ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      $("registerPassword")
        ?.value || ""
    );


  const referral =
    String(
      $("registerReferral")
        ?.value || ""
    )
      .trim()
      .toUpperCase();


  const usernameRegex =
    /^[A-Za-z0-9_.]{3,30}$/;


  if (!firstName) {

    showToast(
      "First name required.",
      "error"
    );

    $("registerFirstName")
      ?.focus();

    return;
  }


  if (
    !usernameRegex.test(
      username
    )
  ) {

    showToast(
      "Username must be 3-30 characters and use only letters, numbers, underscore or dot.",
      "error"
    );

    $("registerUsername")
      ?.focus();

    return;
  }


  if (
    password.length < 6
  ) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    $("registerPassword")
      ?.focus();

    return;
  }


  const button =
    $("registerBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Creating account...";
  }


  try {

    const data =
      await api(
        "/api/auth/register",
        {
          method: "POST",

          body:
            JSON.stringify({
              first_name:
                firstName,

              username,

              password,

              referral_code:
                referral
            })
        }
      );


    if (
      !data.token ||
      !data.user
    ) {

      throw new Error(
        "Invalid registration response."
      );
    }


    saveSession(
      data.token,
      data.user
    );


    showToast(
      "Account created successfully 🎉",
      "success"
    );


    showApp();

  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );


    showToast(
      error.message ||
      "Registration failed.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Create Account";
    }
  }
}


/* ======================================================
   LOAD SESSION
====================================================== */

async function loadSession() {

  if (!authToken) {

    clearSession();

    showAuthScreen(
      "login"
    );

    return;
  }


  try {

    const data =
      await api(
        "/api/auth/me"
      );


    if (!data.user) {

      throw new Error(
        "User session not found."
      );
    }


    currentUser =
      data.user;


    localStorage.setItem(
      USER_KEY,
      JSON.stringify(
        currentUser
      )
    );


    showApp();

  } catch (error) {

    console.warn(
      "SESSION LOAD:",
      error
    );


    clearSession();


    showAuthScreen(
      "login"
    );
  }
}


/* ======================================================
   LOGOUT
====================================================== */

async function logout() {

  try {

    if (authToken) {

      await api(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );
    }

  } catch (error) {

    console.warn(
      "LOGOUT API:",
      error
    );
  }


  clearSession();


  showAuthScreen(
    "login",
    "You have been logged out."
  );
}


/* ======================================================
   USER UI
====================================================== */

function updateUserUI() {

  if (!currentUser) return;


  const name =
    currentUser.first_name ||
    currentUser.name ||
    currentUser.username ||
    "User";


  if ($("headerGreeting")) {

    $("headerGreeting").textContent =
      `Hi, ${name} 👋`;
  }


  if ($("headerPoints")) {

    $("headerPoints").textContent =
      `${formatNumber(
        currentUser.points
      )} pts`;
  }


  if ($("profileName")) {

    $("profileName").textContent =
      name;
  }


  if ($("profileUsername")) {

    $("profileUsername").textContent =
      `@${currentUser.username || ""}`;
  }


  if ($("profilePoints")) {

    $("profilePoints").textContent =
      formatNumber(
        currentUser.points
      );
  }


  if ($("profileVideos")) {

    $("profileVideos").textContent =
      formatNumber(
        currentUser.watched_videos ??
        currentUser.total_videos_watched ??
        0
      );
  }


  if ($("profileEarned")) {

    $("profileEarned").textContent =
      formatNumber(
        currentUser.total_earned ??
        currentUser.points_earned ??
        currentUser.points ??
        0
      );
  }


  if ($("profileFollowers")) {

    $("profileFollowers").textContent =
      formatNumber(
        currentUser.followers_count ||
        0
      );
  }


  if ($("profileFollowing")) {

    $("profileFollowing").textContent =
      formatNumber(
        currentUser.following_count ||
        0
      );
  }
}


async function refreshCurrentUser() {

  if (!currentUser) return;


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          currentUser.id
        )}`
      );


    if (data.user) {

      currentUser =
        data.user;


      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );


      updateUserUI();
    }

  } catch (error) {

    console.warn(
      "REFRESH USER:",
      error
    );
  }
}


/* ======================================================
   NAVIGATION
====================================================== */

function showPage(
  sectionId
) {

  document
    .querySelectorAll(
      ".page-section"
    )
    .forEach(
      section => {

        section.classList.toggle(
          "active",
          section.id === sectionId
        );
      }
    );


  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page === sectionId
        );
      }
    );


  if (
    sectionId !==
    "playerSection"
  ) {

    stopWatchTimer();
  }


  if (
    sectionId ===
    "watchSection"
  ) {

    loadWatchHistory();
  }


  if (
    sectionId ===
    "earnSection"
  ) {

    loadPointsHistory();
  }


  if (
    sectionId ===
    "profileSection"
  ) {

    loadMyVideos();
  }


  if (
    sectionId ===
    "creatorSection"
  ) {

    loadCreatorDashboard();
  }
}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {

  const feed =
    $("videoFeed");


  if (!feed) return;


  feed.innerHTML =
    `<div class="mini-loading">
      Loading videos...
    </div>`;


  try {

    const data =
      await api(
        "/api/videos"
      );


    const videos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    renderVideoFeed(
      videos
    );

  } catch (error) {

    console.error(
      "LOAD VIDEOS:",
      error
    );


    feed.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


function renderVideoFeed(
  videos
) {

  const feed =
    $("videoFeed");


  if (!feed) return;


  if (!videos.length) {

    feed.innerHTML =
      `<div class="empty-state">
        No videos available yet.
      </div>`;

    return;
  }


  feed.innerHTML =
    videos.map(
      video => {

        const id =
          video.id ??
          video.video_id;


        const thumbnail =
          video.thumbnail_url ||
          video.thumbnail ||
          "";


        const title =
          video.title ||
          "Untitled video";


        const description =
          video.description ||
          "";


        const creator =
          video.creator_username ||
          video.username ||
          video.first_name ||
          "Creator";


        const views =
          video.views ??
          video.view_count ??
          0;


        return `
          <article
            class="video-card"
            data-video-id="${escapeHTML(id)}"
            onclick="openVideo('${escapeHTML(id)}')"
          >

            <div class="video-thumb-wrap">

              ${
                thumbnail
                  ? `
                    <img
                      class="video-thumb"
                      src="${escapeHTML(
                        thumbnail
                      )}"
                      alt="${escapeHTML(
                        title
                      )}"
                      loading="lazy"
                    >
                  `
                  : `
                    <div class="video-thumb-placeholder">
                      🎬
                    </div>
                  `
              }

            </div>

            <div class="video-card-body">

              <h3>
                ${escapeHTML(
                  title
                )}
              </h3>

              ${
                description
                  ? `
                    <p>
                      ${escapeHTML(
                        description
                      )}
                    </p>
                  `
                  : ""
              }

              <div class="video-meta">

                <span>
                  @${escapeHTML(
                    creator
                  )}
                </span>

                <span>
                  ${formatNumber(
                    views
                  )} views
                </span>

              </div>

            </div>

          </article>
        `;
      }
    ).join("");
}


/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(
  videoId
) {

  if (!videoId) return;


  stopWatchTimer();


  currentVideo = null;


  showPage(
    "playerSection"
  );


  const videoElement =
    $("playerVideo");


  if (videoElement) {

    videoElement.pause();

    videoElement.removeAttribute(
      "src"
    );

    videoElement.load();
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          videoId
        )}`
      );


    currentVideo =
      data.video ||
      data;


    if (!currentVideo) {

      throw new Error(
        "Video not found."
      );
    }


    const videoUrl =
      currentVideo.video_url ||
      currentVideo.url ||
      currentVideo.secure_url ||
      "";


    const thumbnail =
      currentVideo.thumbnail_url ||
      currentVideo.thumbnail ||
      "";


    const title =
      currentVideo.title ||
      "Untitled video";


    const description =
      currentVideo.description ||
      "";


    const views =
      currentVideo.views ??
      currentVideo.view_count ??
      0;


    const likes =
      currentVideo.likes_count ??
      currentVideo.likes ??
      0;


    const comments =
      currentVideo.comments_count ??
      currentVideo.comments ??
      0;


    if ($("playerTitle")) {

      $("playerTitle").textContent =
        title;
    }


    if ($("playerDescription")) {

      $("playerDescription").textContent =
        description;
    }


    if ($("playerViews")) {

      $("playerViews").textContent =
        `${formatNumber(
          views
        )} views`;
    }


    if ($("playerLikes")) {

      $("playerLikes").textContent =
        formatNumber(
          likes
        );
    }


    if ($("playerCommentsCount")) {

      $("playerCommentsCount")
        .textContent =
        formatNumber(
          comments
        );
    }


    if ($("likeBtn")) {

      $("likeBtn")
        .classList.remove(
          "active"
        );
    }


    if ($("followBtn")) {

      $("followBtn")
        .classList.remove(
          "active"
        );
    }


    if (videoElement) {

      if (thumbnail) {

        videoElement.poster =
          thumbnail;
      }


      if (videoUrl) {

        videoElement.src =
          videoUrl;

        videoElement.load();
      }
    }


    watchSeconds = 0;

    watchRewardSent = false;


    await loadLikeStatus();

    await loadFollowStatus();

    await loadComments();


    setupWatchTimer();

  } catch (error) {

    console.error(
      "OPEN VIDEO:",
      error
    );


    showToast(
      error.message ||
      "Unable to open video.",
      "error"
    );
  }
}


/* ======================================================
   WATCH TIMER
====================================================== */

function setupWatchTimer() {

  stopWatchTimer();


  if (!currentVideo) {
    return;
  }


  const videoElement =
    $("playerVideo");


  if (!videoElement) {
    return;
  }


  const update =
    () => {

      if (
        !videoElement.paused &&
        !videoElement.ended
      ) {

        watchSeconds =
          Math.floor(
            Number(
              videoElement.currentTime ||
              0
            )
          );


        if (
          watchSeconds >=
          MIN_WATCH_SECONDS &&
          !watchRewardSent
        ) {

          completeWatchReward();
        }
      }
    };


  videoElement.addEventListener(
    "timeupdate",
    update
  );


  videoElement.addEventListener(
    "play",
    update
  );


  watchTimer = {
    update,
    videoElement
  };
}


function stopWatchTimer() {

  if (!watchTimer) {
    return;
  }


  try {

    watchTimer.videoElement
      ?.removeEventListener(
        "timeupdate",
        watchTimer.update
      );

    watchTimer.videoElement
      ?.removeEventListener(
        "play",
        watchTimer.update
      );

  } catch (error) {

    console.warn(
      "WATCH TIMER CLEANUP:",
      error
    );
  }


  watchTimer = null;
}


async function completeWatchReward() {

  if (
    watchRewardSent ||
    !currentVideo ||
    !currentVideo.id
  ) {

    return;
  }


  watchRewardSent = true;


  try {

    const data =
      await api(
        "/api/watch/complete",
        {
          method: "POST",

          body:
            JSON.stringify({

              video_id:
                currentVideo.id,

              watch_seconds:
                Math.max(
                  MIN_WATCH_SECONDS,
                  watchSeconds
                )
            })
        }
      );


    if (
      data.reward_granted
    ) {

      showToast(
        `+${data.points || 1} point earned 🎉`,
        "success"
      );

    }


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();

    } else {

      await refreshCurrentUser();
    }


  } catch (error) {

    console.error(
      "WATCH REWARD:",
      error
    );


    /*
     * Allow retry if the request
     * itself failed.
     */
    watchRewardSent = false;
  }
}


/* ======================================================
   LIKE
====================================================== */

async function loadLikeStatus() {

  if (
    !currentVideo ||
    !currentVideo.id
  ) {

    return;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`
      );


    const liked =
      Boolean(
        data.liked
      );


    const button =
      $("likeBtn");


    if (button) {

      button.classList.toggle(
        "active",
        liked
      );

      button.dataset.liked =
        liked
          ? "true"
          : "false";
    }

  } catch (error) {

    console.warn(
      "LIKE STATUS:",
      error
    );
  }
}


async function toggleLike() {

  if (!currentVideo) {

    showToast(
      "Open a video first.",
      "error"
    );

    return;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`,
        {
          method: "POST"
        }
      );


    const liked =
      Boolean(
        data.liked
      );


    const count =
      data.likes_count ??
      data.likes ??
      currentVideo.likes_count ??
      0;


    currentVideo.likes_count =
      count;


    if ($("playerLikes")) {

      $("playerLikes")
        .textContent =
        formatNumber(
          count
        );
    }


    if ($("likeBtn")) {

      $("likeBtn")
        .classList.toggle(
          "active",
          liked
        );
    }


    showToast(
      liked
        ? "Liked ❤️"
        : "Like removed.",
      "success"
    );

  } catch (error) {

    console.error(
      "TOGGLE LIKE:",
      error
    );

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   COMMENTS
====================================================== */

async function loadComments() {

  const list =
    $("commentsList");


  if (!list) return;


  if (!currentVideo) {

    list.innerHTML = "";

    return;
  }


  list.innerHTML =
    `<div class="mini-loading">
      Loading comments...
    </div>`;


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`
      );


    const comments =
      Array.isArray(
        data.comments
      )
        ? data.comments
        : [];


    renderComments(
      comments
    );


  } catch (error) {

    console.error(
      "LOAD COMMENTS:",
      error
    );


    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


function renderComments(
  comments
) {

  const list =
    $("commentsList");


  if (!list) return;


  if (!comments.length) {

    list.innerHTML =
      `<div class="empty-state">
        No comments yet.
      </div>`;

    return;
  }


  list.innerHTML =
    comments.map(
      comment => {

        const name =
          comment.first_name ||
          comment.username ||
          "User";


        const text =
          comment.comment ||
          comment.text ||
          "";


        return `
          <div class="comment-item">

            <div class="comment-author">
              ${escapeHTML(name)}
            </div>

            <div class="comment-text">
              ${escapeHTML(text)}
            </div>

            ${
              comment.created_at
                ? `
                  <div class="comment-date">
                    ${escapeHTML(
                      formatDate(
                        comment.created_at
                      )
                    )}
                  </div>
                `
                : ""
            }

          </div>
        `;
      }
    ).join("");
}


async function addComment() {

  if (!currentVideo) {

    showToast(
      "Open a video first.",
      "error"
    );

    return;
  }


  const input =
    $("commentInput") ||
    $("videoCommentInput");


  const comment =
    String(
      input?.value || ""
    ).trim();


  if (!comment) {

    showToast(
      "Write a comment first.",
      "error"
    );

    return;
  }


  if (comment.length > 1000) {

    showToast(
      "Comment is too long.",
      "error"
    );

    return;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`,
        {
          method: "POST",

          body:
            JSON.stringify({
              comment
            })
        }
      );


    if (input) {
      input.value = "";
    }


    if (
      data.comments_count !==
      undefined
    ) {

      currentVideo.comments_count =
        data.comments_count;


      if ($("playerCommentsCount")) {

        $("playerCommentsCount")
          .textContent =
          formatNumber(
            data.comments_count
          );
      }
    }


    await loadComments();


    showToast(
      "Comment added 💬",
      "success"
    );

  } catch (error) {

    console.error(
      "ADD COMMENT:",
      error
    );

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   REPORT
====================================================== */

async function reportVideo() {

  if (!currentVideo) {

    showToast(
      "Open a video first.",
      "error"
    );

    return;
  }


  const reason =
    prompt(
      "Why are you reporting this video?"
    );


  if (reason === null) {
    return;
  }


  const cleanReason =
    String(
      reason || ""
    ).trim();


  if (!cleanReason) {

    showToast(
      "Please enter a reason.",
      "error"
    );

    return;
  }


  try {

    await api(
      `/api/videos/${encodeURIComponent(
        currentVideo.id
      )}/report`,
      {
        method: "POST",

        body:
          JSON.stringify({
            reason:
              cleanReason
          })
      }
    );


    showToast(
      "Report submitted. Thank you.",
      "success"
    );

  } catch (error) {

    console.error(
      "REPORT:",
      error
    );

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   FOLLOW
====================================================== */

async function loadFollowStatus() {

  if (
    !currentVideo ||
    !currentVideo.creator_id
  ) {

    return;
  }


  try {

    const data =
      await api(
        `/api/users/${encodeURIComponent(
          currentVideo.creator_id
        )}/follow`
      );


    const following =
      Boolean(
        data.following
      );


    const button =
      $("followBtn");


    if (button) {

      button.classList.toggle(
        "active",
        following
      );

      button.textContent =
        following
          ? "Following"
          : "Follow";
    }

  } catch (error) {

    console.warn(
      "FOLLOW STATUS:",
      error
    );
  }
}


async function toggleFollow() {

  if (
    !currentVideo ||
    !currentVideo.creator_id
  ) {

    showToast(
      "Creator information unavailable.",
      "error"
    );

    return;
  }


  try {

    const data =
      await api(
        `/api/users/${encodeURIComponent(
          currentVideo.creator_id
        )}/follow`,
        {
          method: "POST"
        }
      );


    const following =
      Boolean(
        data.following
      );


    const button =
      $("followBtn");


    if (button) {

      button.classList.toggle(
        "active",
        following
      );

      button.textContent =
        following
          ? "Following"
          : "Follow";
    }


    showToast(
      following
        ? "Following creator 👤"
        : "Unfollowed creator.",
      "success"
    );


    await refreshCurrentUser();

  } catch (error) {

    console.error(
      "FOLLOW:",
      error
    );

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   WATCH HISTORY
====================================================== */

async function loadWatchHistory() {

  const list =
    $("watchHistoryList") ||
    $("historyList");


  if (!list) return;


  list.innerHTML =
    `<div class="mini-loading">
      Loading watch history...
    </div>`;


  try {

    const data =
      await api(
        "/api/watch/history"
      );


    const items =
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!items.length) {

      list.innerHTML =
        `<div class="empty-state">
          No watch history yet.
        </div>`;

      return;
    }


    list.innerHTML =
      items.map(
        item => {

          const id =
            item.video_id ||
            item.id;


          const title =
            item.title ||
            "Untitled video";


          const thumbnail =
            item.thumbnail_url ||
            "";


          const seconds =
            Number(
              item.watch_seconds ||
              0
            );


          return `
            <div
              class="history-item"
              onclick="openVideo('${escapeHTML(id)}')"
            >

              ${
                thumbnail
                  ? `
                    <img
                      src="${escapeHTML(
                        thumbnail
                      )}"
                      alt=""
                      loading="lazy"
                    >
                  `
                  : `
                    <div class="history-thumb">
                      🎬
                    </div>
                  `
              }

              <div>

                <strong>
                  ${escapeHTML(title)}
                </strong>

                <small>
                  Watched ${seconds}s
                </small>

              </div>

            </div>
          `;
        }
      ).join("");


  } catch (error) {

    console.error(
      "WATCH HISTORY:",
      error
    );


    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDailyReward() {

  const button =
    $("dailyRewardBtn");


  if (button) {

    button.disabled = true;
  }


  try {

    const data =
      await api(
        "/api/rewards/daily",
        {
          method: "POST"
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    showToast(
      data.message ||
      `Daily reward claimed 🎁`,
      "success"
    );

  } catch (error) {

    console.error(
      "DAILY REWARD:",
      error
    );


    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;
    }
  }
}


/* ======================================================
   REWARDED AD DEMO
====================================================== */

async function claimRewardedAd() {

  const confirmed =
    confirm(
      "Rewarded Ad Demo\n\nClaim demo reward after simulated ad?"
    );


  if (!confirmed) {
    return;
  }


  const button =
    $("rewardedAdBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Processing...";
  }


  try {

    const data =
      await api(
        "/api/rewards/ad",
        {
          method: "POST"
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    showToast(
      data.message ||
      "Reward ad demo completed 🎁",
      "success"
    );


  } catch (error) {

    console.error(
      "REWARDED AD:",
      error
    );


    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "🎁 Reward Ad Demo";
    }
  }
}


/* ======================================================
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {

  const list =
    $("pointsHistoryList") ||
    $("pointsHistory");


  if (!list) return;


  list.innerHTML =
    `<div class="mini-loading">
      Loading points history...
    </div>`;


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

      list.innerHTML =
        `<div class="empty-state">
          No points history yet.
        </div>`;

      return;
    }


    list.innerHTML =
      history.map(
        item => {

          const points =
            Number(
              item.points || 0
            );


          const reason =
            item.reason ||
            "Reward";


          return `
            <div class="points-history-item">

              <div>

                <strong>
                  ${escapeHTML(
                    reason
                  )}
                </strong>

                ${
                  item.created_at
                    ? `
                      <small>
                        ${escapeHTML(
                          formatDate(
                            item.created_at
                          )
                        )}
                      </small>
                    `
                    : ""
                }

              </div>

              <strong>
                +${formatNumber(
                  points
                )}
              </strong>

            </div>
          `;
        }
      ).join("");


  } catch (error) {

    console.error(
      "POINTS HISTORY:",
      error
    );


    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  const list =
    $("myVideosList") ||
    $("myVideos");


  if (!list) return;


  list.innerHTML =
    `<div class="mini-loading">
      Loading your videos...
    </div>`;


  try {

    const data =
      await api(
        `/api/users/${encodeURIComponent(
          currentUser?.id || ""
        )}/videos`
      );


    const videos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    if (!videos.length) {

      list.innerHTML =
        `<div class="empty-state">
          You haven't uploaded any videos yet.
        </div>`;

      return;
    }


    list.innerHTML =
      videos.map(
        video => {

          const thumbnail =
            video.thumbnail_url ||
            "";


          return `
            <div
              class="my-video-item"
              data-video-id="${escapeHTML(
                video.id
              )}"
            >

              ${
                thumbnail
                  ? `
                    <img
                      src="${escapeHTML(
                        thumbnail
                      )}"
                      alt=""
                      loading="lazy"
                    >
                  `
                  : `
                    <div class="history-thumb">
                      🎬
                    </div>
                  `
              }

              <div class="my-video-info">

                <strong>
                  ${escapeHTML(
                    video.title ||
                    "Untitled video"
                  )}
                </strong>

                <small>
                  ${formatNumber(
                    video.views || 0
                  )} views
                </small>

              </div>

              <button
                type="button"
                onclick="deleteMyVideo('${escapeHTML(
                  video.id
                )}')"
              >
                Delete
              </button>

            </div>
          `;
        }
      ).join("");


  } catch (error) {

    console.error(
      "MY VIDEOS:",
      error
    );


    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


async function deleteMyVideo(
  videoId
) {

  if (!videoId) return;


  const confirmed =
    confirm(
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
        method: "DELETE"
      }
    );


    showToast(
      "Video deleted successfully.",
      "success"
    );


    await loadMyVideos();

    await loadVideos();

  } catch (error) {

    console.error(
      "DELETE VIDEO:",
      error
    );


    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   VIDEO FILE SELECTION
====================================================== */

function handleVideoFileSelect(
  event
) {

  const file =
    event?.target?.files?.[0];


  if (!file) {
    return;
  }


  selectVideoFile(
    file
  );
}


function selectVideoFile(
  file
) {

  if (!file) {
    return;
  }


  if (
    !file.type ||
    !file.type.startsWith(
      "video/"
    )
  ) {

    showToast(
      "Please select a valid video file.",
      "error"
    );

    return;
  }


  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    showToast(
      `Video maximum ${formatVideoSize(
        MAX_VIDEO_SIZE
      )} hona chahiye.`,
      "error"
    );

    return;
  }


  selectedVideoFile =
    file;


  selectedVideoDuration =
    0;


  if (uploadPreviewUrl) {

    try {

      URL.revokeObjectURL(
        uploadPreviewUrl
      );

    } catch {}
  }


  uploadPreviewUrl =
    URL.createObjectURL(
      file
    );


  const preview =
    $("videoPreview");


  if (preview) {

    preview.src =
      uploadPreviewUrl;

    preview.classList.remove(
      "hidden"
    );


    preview.onloadedmetadata =
      function() {

        selectedVideoDuration =
          Number(
            preview.duration || 0
          );
      };
  }


  const fileName =
    $("selectedVideoName");


  if (fileName) {

    fileName.textContent =
      file.name;
  }


  const fileSize =
    $("selectedVideoSize");


  if (fileSize) {

    fileSize.textContent =
      formatVideoSize(
        file.size
      );
  }


  const uploadButton =
    $("uploadVideoBtn");


  if (uploadButton) {

    uploadButton.disabled =
      false;
  }


  showToast(
    "Video selected successfully.",
    "success"
  );
}


/* ======================================================
   CLOUDINARY STATUS
====================================================== */

async function getCloudinaryStatus() {

  try {

    const response =
      await fetch(
        `${API_BASE}/api/cloudinary/status?t=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const data =
      await parseApiResponse(
        response
      );


    return data;

  } catch (error) {

    console.warn(
      "CLOUDINARY STATUS ERROR:",
      error
    );

    return null;
  }
}


/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

async function getCloudinarySignature() {

  if (!authToken) {

    throw new Error(
      "Session expired. Please login again."
    );
  }


  const url =
    `${API_BASE}/api/cloudinary/signature?t=${Date.now()}`;


  let response;


  try {

    response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {

            Authorization:
              `Bearer ${authToken}`,

            Accept:
              "application/json",

            "Cache-Control":
              "no-cache"
          },

          cache: "no-store",

          credentials:
            "same-origin"
        }
      );

  } catch (error) {

    console.error(
      "CLOUDINARY SIGNATURE NETWORK ERROR:",
      error
    );


    throw new Error(
      "DekhoEarn server se Cloudinary signature nahi mil rahi. Internet connection check karein."
    );
  }


  const data =
    await parseApiResponse(
      response
    );


  if (
    response.status === 401
  ) {

    clearSession();

    showAuthScreen(
      "login",
      "Session expired. Please login again."
    );

    throw new Error(
      "Session expired. Please login again."
    );
  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      `Cloudinary signature failed. HTTP ${response.status}`
    );
  }


  if (
    !data ||
    !data.ok ||
    !data.signature ||
    !data.timestamp ||
    !data.api_key ||
    !data.cloud_name
  ) {

    console.error(
      "INVALID CLOUDINARY SIGNATURE:",
      data
    );


    throw new Error(
      "Cloudinary signature response incomplete hai."
    );
  }


  return data;
}


/* ======================================================
   UPLOAD PROGRESS
====================================================== */

function updateUploadProgress(
  percent
) {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent || 0)
      )
    );


  const progress =
    $("uploadProgress");


  const progressText =
    $("uploadProgressText");


  if (progress) {

    if (
      progress.tagName ===
      "PROGRESS"
    ) {

      progress.value =
        value;

    } else {

      progress.style.width =
        `${value}%`;
    }
  }


  if (progressText) {

    progressText.textContent =
      `${value}%`;
  }


  const status =
    $("uploadStatus");


  if (status) {

    if (value >= 100) {

      status.textContent =
        "Upload complete";

    } else if (value > 0) {

      status.textContent =
        `Uploading ${value}%`;

    } else {

      status.textContent =
        "Preparing upload...";
    }
  }
}


/* ======================================================
   DIRECT CLOUDINARY UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signed
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      if (!file) {

        reject(
          new CloudinaryUploadError(
            "Video file select nahi hui."
          )
        );

        return;
      }


      if (!signed) {

        reject(
          new CloudinaryUploadError(
            "Cloudinary signature missing hai."
          )
        );

        return;
      }


      if (
        !signed.cloud_name ||
        !signed.api_key ||
        !signed.timestamp ||
        !signed.signature
      ) {

        console.error(
          "INVALID SIGNED DATA:",
          signed
        );


        reject(
          new CloudinaryUploadError(
            "Cloudinary signing data incomplete hai."
          )
        );

        return;
      }


      /*
       * IMPORTANT
       *
       * Server v3.1.3 signs only:
       *
       * folder
       * timestamp
       *
       * Therefore public_id is intentionally
       * NOT sent here.
       */


      const uploadUrl =
        signed.upload_url ||
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          signed.cloud_name
        )}/video/upload`;


      const formData =
        new FormData();


      formData.append(
        "file",
        file
      );


      formData.append(
        "api_key",
        String(
          signed.api_key
        )
      );


      formData.append(
        "timestamp",
        String(
          signed.timestamp
        )
      );


      formData.append(
        "signature",
        String(
          signed.signature
        )
      );


      if (signed.folder) {

        formData.append(
          "folder",
          String(
            signed.folder
          )
        );
      }


      const xhr =
        new XMLHttpRequest();


      xhr.open(
        "POST",
        uploadUrl,
        true
      );


      /*
       * VERY IMPORTANT
       *
       * Direct Cloudinary upload must not
       * send DekhoEarn cookies/credentials.
       */
      xhr.withCredentials =
        false;


      xhr.timeout =
        CLOUDINARY_UPLOAD_TIMEOUT;


      xhr.responseType =
        "text";


      xhr.upload.onprogress =
        function(event) {

          if (
            event.lengthComputable
          ) {

            const percent =
              Math.round(
                (
                  event.loaded /
                  event.total
                ) * 100
              );


            console.log(
              `CLOUDINARY UPLOAD: ${percent}%`
            );


            updateUploadProgress(
              percent
            );
          }
        };


      xhr.onload =
        function() {

          const raw =
            xhr.responseText ||
            "";


          let data =
            null;


          try {

            data =
              raw
                ? JSON.parse(raw)
                : null;

          } catch {

            data = null;
          }


          console.log(
            "CLOUDINARY RESPONSE:",
            {
              status:
                xhr.status,

              data
            }
          );


          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {

            if (
              data &&
              (
                data.secure_url ||
                data.url
              )
            ) {

              updateUploadProgress(
                100
              );


              resolve(
                data
              );

              return;
            }


            reject(
              new CloudinaryUploadError(
                "Cloudinary ne successful response diya, lekin video URL nahi mili.",
                xhr.status,
                raw
              )
            );

            return;
          }


          let message =
            data?.error?.message ||
            data?.message ||
            raw ||
            `Cloudinary upload failed. HTTP ${xhr.status}`;


          if (
            xhr.status === 400
          ) {

            message =
              `Cloudinary upload rejected: ${message}`;
          }


          if (
            xhr.status === 401 ||
            xhr.status === 403
          ) {

            message =
              `Cloudinary authentication/signature error: ${message}`;
          }


          if (
            xhr.status === 413
          ) {

            message =
              "Video upload limit se bada hai.";
          }


          reject(
            new CloudinaryUploadError(
              message,
              xhr.status,
              raw
            )
          );
        };


      xhr.onerror =
        function() {

          console.error(
            "CLOUDINARY XHR ERROR:",
            {
              status:
                xhr.status,

              readyState:
                xhr.readyState,

              uploadUrl
            }
          );


          if (
            xhr.status === 0
          ) {

            reject(
              new CloudinaryUploadError(
                "Cloudinary se connection establish nahi hua. Internet, browser network ya CORS/blocking issue check karein.",
                0
              )
            );

            return;
          }


          reject(
            new CloudinaryUploadError(
              `Cloudinary network error. HTTP ${xhr.status}`,
              xhr.status
            )
          );
        };


      xhr.ontimeout =
        function() {

          reject(
            new CloudinaryUploadError(
              "Video upload timeout ho gaya. Large video ke liye dobara try karein.",
              408
            )
          );
        };


      xhr.onabort =
        function() {

          reject(
            new CloudinaryUploadError(
              "Video upload cancel ho gaya.",
              0
            )
          );
        };


      try {

        xhr.send(
          formData
        );

      } catch (error) {

        console.error(
          "CLOUDINARY SEND ERROR:",
          error
        );


        reject(
          new CloudinaryUploadError(
            "Cloudinary upload request start nahi ho paayi.",
            0,
            error.message
          )
        );
      }
    }
  );
}


/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadSelectedVideo() {

  if (uploadInProgress) {

    showToast(
      "Upload already in progress.",
      "normal"
    );

    return;
  }


  if (!authToken) {

    showAuthScreen(
      "login",
      "Please login before uploading."
    );

    return;
  }


  if (!selectedVideoFile) {

    showToast(
      "Please select a video first.",
      "error"
    );

    return;
  }


  const file =
    selectedVideoFile;


  if (
    !file.type ||
    !file.type.startsWith(
      "video/"
    )
  ) {

    showToast(
      "Invalid video file.",
      "error"
    );

    return;
  }


  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    showToast(
      `Video maximum ${formatVideoSize(
        MAX_VIDEO_SIZE
      )} hona chahiye.`,
      "error"
    );

    return;
  }


  const title =
    String(
      $("videoTitle")
        ?.value ||
      $("uploadTitle")
        ?.value ||
      ""
    ).trim();


  const description =
    String(
      $("videoDescription")
        ?.value ||
      $("uploadDescription")
        ?.value ||
      ""
    ).trim();


  if (!title) {

    showToast(
      "Video title required hai.",
      "error"
    );

    return;
  }


  if (title.length > 200) {

    showToast(
      "Video title is too long.",
      "error"
    );

    return;
  }


  if (description.length > 5000) {

    showToast(
      "Description is too long.",
      "error"
    );

    return;
  }


  uploadInProgress =
    true;


  const button =
    $("uploadVideoBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Uploading...";
  }


  updateUploadProgress(
    0
  );


  try {

    /*
     * STEP 1
     *
     * Signature request.
     *
     * Only ONE request.
     */
    showToast(
      "Preparing secure upload...",
      "normal"
    );


    const signed =
      await getCloudinarySignature();


    console.log(
      "CLOUDINARY SIGNATURE OK:",
      {
        cloud_name:
          signed.cloud_name,

        folder:
          signed.folder,

        timestamp:
          signed.timestamp
      }
    );


    /*
     * STEP 2
     *
     * Browser → Cloudinary
     */
    showToast(
      "Video upload started...",
      "normal"
    );


    const cloudinaryResult =
      await uploadToCloudinary(
        file,
        signed
      );


    console.log(
      "CLOUDINARY UPLOAD SUCCESS:",
      cloudinaryResult
    );


    const videoUrl =
      cloudinaryResult.secure_url ||
      cloudinaryResult.url ||
      "";


    if (!videoUrl) {

      throw new Error(
        "Cloudinary upload successful tha, lekin video URL nahi mili."
      );
    }


    /*
     * STEP 3
     *
     * Save metadata in Neon.
     */
    showToast(
      "Video uploaded. Saving details...",
      "normal"
    );


    const metadata =
      await api(
        "/api/videos",
        {
          method: "POST",

          body:
            JSON.stringify({

              title,

              description,

              video_url:
                videoUrl,

              thumbnail_url:
                cloudinaryResult.thumbnail_url ||
                "",

              cloudinary_public_id:
                cloudinaryResult.public_id ||
                "",

              cloudinary_resource_type:
                cloudinaryResult.resource_type ||
                "video",

              duration:
                Number(
                  selectedVideoDuration ||
                  cloudinaryResult.duration ||
                  0
                ),

              bytes:
                Number(
                  file.size
                )
            })
        }
      );


    console.log(
      "VIDEO METADATA SAVED:",
      metadata
    );


    updateUploadProgress(
      100
    );


    showToast(
      "Video successfully uploaded 🎉",
      "success"
    );


    /*
     * Clear selected video only
     * after complete success.
     */
    selectedVideoFile =
      null;


    selectedVideoDuration =
      0;


    if (uploadPreviewUrl) {

      try {

        URL.revokeObjectURL(
          uploadPreviewUrl
        );

      } catch {}

      uploadPreviewUrl =
        null;
    }


    const input =
      $("videoFile") ||
      $("videoInput") ||
      $("galleryVideoInput");


    if (input) {

      input.value =
        "";
    }


    const preview =
      $("videoPreview");


    if (preview) {

      preview.pause?.();

      preview.removeAttribute(
        "src"
      );

      preview.load?.();

      preview.classList.add(
        "hidden"
      );
    }


    const name =
      $("selectedVideoName");


    if (name) {

      name.textContent =
        "";
    }


    const size =
      $("selectedVideoSize");


    if (size) {

      size.textContent =
        "";
    }


    await loadVideos();

    await loadMyVideos();

    await refreshCurrentUser();


  } catch (error) {

    console.error(
      "FINAL VIDEO UPLOAD ERROR:",
      error
    );


    /*
     * DO NOT automatically retry Cloudinary.
     *
     * The upload may have succeeded while
     * its response was lost.
     */
    if (
      error instanceof
      CloudinaryUploadError
    ) {

      if (
        error.status === 0
      ) {

        showToast(
          error.message,
          "error"
        );

      } else {

        showToast(
          error.message,
          "error"
        );
      }

    } else {

      showToast(
        error?.message ||
        "Video upload failed.",
        "error"
      );
    }

  } finally {

    uploadInProgress =
      false;


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Upload Video";
    }
  }
}


/* ======================================================
   CREATOR DASHBOARD
====================================================== */

async function loadCreatorDashboard() {

  const container =
    $("creatorDashboard") ||
    $("creatorContent");


  if (!container) return;


  container.innerHTML =
    `<div class="mini-loading">
      Loading creator dashboard...
    </div>`;


  try {

    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          currentUser?.id || ""
        )}`
      );


    renderCreatorDashboard(
      data,
      container
    );

  } catch (error) {

    console.error(
      "CREATOR DASHBOARD:",
      error
    );


    container.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


function renderCreatorDashboard(
  data,
  container
) {

  const stats =
    data.stats ||
    data.creator ||
    data;


  const followers =
    stats.followers_count ??
    stats.followers ??
    currentUser?.followers_count ??
    0;


  const watchSeconds =
    stats.total_watch_seconds ??
    0;


  const watchHours =
    watchSeconds /
    3600;


  const videos =
    stats.total_videos ??
    stats.videos ??
    currentUser?.total_videos ??
    0;


  const earnings =
    stats.creator_earnings ??
    stats.earnings ??
    0;


  const status =
    stats.creator_status ||
    currentUser?.creator_status ||
    "not_applied";


  container.innerHTML = `
    <div class="creator-stats-grid">

      <div class="creator-stat">
        <strong>
          ${formatNumber(followers)}
        </strong>
        <span>Followers</span>
      </div>

      <div class="creator-stat">
        <strong>
          ${formatNumber(
            Math.floor(watchHours)
          )}
        </strong>
        <span>Watch Hours</span>
      </div>

      <div class="creator-stat">
        <strong>
          ${formatNumber(videos)}
        </strong>
        <span>Videos</span>
      </div>

      <div class="creator-stat">
        <strong>
          ${formatNumber(earnings)}
        </strong>
        <span>Creator Earnings</span>
      </div>

    </div>

    <div class="creator-status">

      <strong>
        Creator Status
      </strong>

      <p>
        ${escapeHTML(status)}
      </p>

    </div>

    ${
      status === "not_applied"
        ? `
          <button
            type="button"
            onclick="applyForCreator()"
          >
            Apply for Creator
          </button>
        `
        : ""
    }
  `;
}


async function applyForCreator() {

  try {

    const data =
      await api(
        "/api/creator/apply",
        {
          method: "POST"
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    showToast(
      data.message ||
      "Creator application submitted.",
      "success"
    );


    await loadCreatorDashboard();

  } catch (error) {

    console.error(
      "CREATOR APPLY:",
      error
    );


    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   PAYOUT ACCOUNT FOUNDATION
====================================================== */

async function savePayoutAccount() {

  const accountType =
    String(
      $("payoutAccountType")
        ?.value || ""
    ).trim();


  const accountName =
    String(
      $("payoutAccountName")
        ?.value || ""
    ).trim();


  const accountNumber =
    String(
      $("payoutAccountNumber")
        ?.value || ""
    ).trim();


  const ifsc =
    String(
      $("payoutIfsc")
        ?.value || ""
    ).trim()
    .toUpperCase();


  if (!accountType) {

    showToast(
      "Account type required.",
      "error"
    );

    return;
  }


  try {

    await api(
      "/api/creator/payout-account",
      {
        method: "POST",

        body:
          JSON.stringify({

            account_type:
              accountType,

            account_name:
              accountName,

            account_number:
              accountNumber,

            ifsc
          })
      }
    );


    showToast(
      "Payout account information saved.",
      "success"
    );

  } catch (error) {

    console.error(
      "PAYOUT ACCOUNT:",
      error
    );


    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   PWA INSTALL
====================================================== */

function setupPWA() {

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();

      deferredPrompt =
        event;


      const installButtons =
        document.querySelectorAll(
          "[data-install-app]"
        );


      installButtons.forEach(
        button => {

          button.classList.remove(
            "hidden"
          );
        }
      );
    }
  );


  window.addEventListener(
    "appinstalled",
    () => {

      deferredPrompt =
        null;


      showToast(
        "DekhoEarn installed successfully 🎉",
        "success"
      );
    }
  );
}


async function installApp() {

  if (!deferredPrompt) {

    showToast(
      "Install option is not available right now. Browser menu se Add to Home Screen try karein.",
      "normal"
    );

    return;
  }


  try {

    await deferredPrompt.prompt();


    const result =
      await deferredPrompt.userChoice;


    console.log(
      "PWA INSTALL:",
      result
    );

  } catch (error) {

    console.warn(
      "PWA INSTALL:",
      error
    );
  }


  deferredPrompt =
    null;
}


/* ======================================================
   EVENT HELPERS
====================================================== */

function bindClick(
  id,
  handler
) {

  const element =
    $(id);


  if (!element) {
    return;
  }


  element.addEventListener(
    "click",
    event => {

      event.preventDefault();

      handler(event);
    }
  );
}


function bindOptionalEvents() {

  bindClick(
    "loginBtn",
    login
  );


  bindClick(
    "registerBtn",
    register
  );


  bindClick(
    "logoutBtn",
    logout
  );


  bindClick(
    "likeBtn",
    toggleLike
  );


  bindClick(
    "followBtn",
    toggleFollow
  );


  bindClick(
    "reportBtn",
    reportVideo
  );


  bindClick(
    "commentBtn",
    addComment
  );


  bindClick(
    "addCommentBtn",
    addComment
  );


  bindClick(
    "dailyRewardBtn",
    claimDailyReward
  );


  bindClick(
    "rewardedAdBtn",
    claimRewardedAd
  );


  bindClick(
    "uploadVideoBtn",
    uploadSelectedVideo
  );


  bindClick(
    "applyCreatorBtn",
    applyForCreator
  );


  bindClick(
    "savePayoutBtn",
    savePayoutAccount
  );


  bindClick(
    "installAppBtn",
    installApp
  );


  const fileInputs = [

    $("videoFile"),

    $("videoInput"),

    $("galleryVideoInput"),

    $("uploadVideoInput")

  ].filter(Boolean);


  fileInputs.forEach(
    input => {

      input.addEventListener(
        "change",
        handleVideoFileSelect
      );
    }
  );


  const commentInput =
    $("commentInput");


  if (commentInput) {

    commentInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {

          event.preventDefault();

          addComment();
        }
      }
    );
  }


  /*
   * Navigation buttons
   */

  document
    .querySelectorAll(
      ".bottom-nav button[data-page]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();

            showPage(
              button.dataset.page
            );
          }
        );
      }
    );


  /*
   * Generic install buttons
   */

  document
    .querySelectorAll(
      "[data-install-app]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          installApp
        );
      }
    );


  /*
   * Auth mode switch buttons.
   */

  document
    .querySelectorAll(
      "[data-auth-mode]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showAuthScreen(
              button.dataset.authMode
            );
          }
        );
      }
    );
}


/* ======================================================
   GLOBAL FUNCTIONS
   ====================================================== */

window.login =
  login;

window.register =
  register;

window.logout =
  logout;

window.openVideo =
  openVideo;

window.toggleLike =
  toggleLike;

window.addComment =
  addComment;

window.reportVideo =
  reportVideo;

window.toggleFollow =
  toggleFollow;

window.claimDailyReward =
  claimDailyReward;

window.claimRewardedAd =
  claimRewardedAd;

window.uploadSelectedVideo =
  uploadSelectedVideo;

window.deleteMyVideo =
  deleteMyVideo;

window.applyForCreator =
  applyForCreator;

window.savePayoutAccount =
  savePayoutAccount;

window.installApp =
  installApp;

window.showPage =
  showPage;

window.handleVideoFileSelect =
  handleVideoFileSelect;

window.selectVideoFile =
  selectVideoFile;


/* ======================================================
   SERVICE WORKER
====================================================== */

function registerServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {

    return;
  }


  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register(
          "/service-worker.js"
        )
        .then(
          registration => {

            console.log(
              "Service Worker registered:",
              registration.scope
            );
          }
        )
        .catch(
          error => {

            console.warn(
              "Service Worker registration failed:",
              error
            );
          }
        );
    }
  );
}


/* ======================================================
   INITIALIZATION
====================================================== */

async function initApp() {

  console.log(
    "DekhoEarn Frontend v3.1.4 starting..."
  );


  /*
   * Bind events first.
   */
  bindOptionalEvents();


  /*
   * PWA.
   */
  setupPWA();

  registerServiceWorker();


  /*
   * Existing locally cached user.
   */
  try {

    const storedUser =
      localStorage.getItem(
        USER_KEY
      );


    if (storedUser) {

      currentUser =
        JSON.parse(
          storedUser
        );
    }

  } catch (error) {

    console.warn(
      "LOCAL USER PARSE:",
      error
    );

    currentUser = null;
  }


  /*
   * Session validation.
   */
  await loadSession();
}


/* ======================================================
   DOM READY
====================================================== */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );

} else {

  initApp();
}


/* ======================================================
   DEBUG HELPERS
====================================================== */

window.DekhoEarnDebug = {

  version:
    "3.1.4",

  getUser() {
    return currentUser;
  },

  getToken() {
    return authToken;
  },

  getSelectedFile() {
    return selectedVideoFile;
  },

  isUploadInProgress() {
    return uploadInProgress;
  },

  async cloudinaryStatus() {
    return await getCloudinaryStatus();
  }

};
