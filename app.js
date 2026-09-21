/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.0 FINAL
=========================================================
*/

"use strict";

const API_BASE = "";

const AUTH_TOKEN_KEY =
  "dekhoearn_auth_token";

const USER_KEY =
  "dekhoearn_user";

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;

let currentUser = null;
let authToken =
  localStorage.getItem(
    AUTH_TOKEN_KEY
  ) || "";

let currentVideo = null;
let watchSeconds = 0;
let watchRewardSent = false;
let watchTimer = null;

let deferredPrompt = null;
let selectedVideoFile = null;
let uploadPreviewUrl = null;
let selectedVideoDuration = 0;

/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}

function showToast(
  message,
  type = "normal"
) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.className =
    `toast ${type}`;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {
      toast.classList.remove(
        "show"
      );
    }, 2800);
}

function escapeHTML(value) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "en-IN"
  );
}

function formatVideoSize(bytes) {
  const size =
    Number(bytes || 0);

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(
      size / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    size /
    1024 /
    1024
  ).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(
      value
    ).toLocaleString(
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
   API
====================================================== */

async function api(
  path,
  options = {}
) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : {
          "Content-Type":
            "application/json"
        }),
    ...(options.headers || {})
  };

  if (authToken) {
    headers.Authorization =
      `Bearer ${authToken}`;
  }

  const response =
    await fetch(
      `${API_BASE}${path}`,
      {
        ...options,
        headers
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

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
      "Session expired"
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        `Request failed (${response.status})`
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

  $("appShell")
    ?.classList.add(
      "hidden"
    );

  if (
    mode === "register"
  ) {
    $("loginBox")
      ?.classList.add(
        "hidden"
      );

    $("registerBox")
      ?.classList.remove(
        "hidden"
      );
  } else {
    $("registerBox")
      ?.classList.add(
        "hidden"
      );

    $("loginBox")
      ?.classList.remove(
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

  $("appShell")
    ?.classList.remove(
      "hidden"
    );
}

/* ======================================================
   LOGIN
====================================================== */

async function login() {
  const username =
    $("loginUsername")
      ?.value
      .trim();

  const password =
    $("loginPassword")
      ?.value || "";

  if (!username || !password) {
    showToast(
      "Username and password required",
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
          body: JSON.stringify({
            username,
            password
          })
        }
      );

    saveSession(
      data.token,
      data.user
    );

    showApp();
    updateUserUI();

    await startAppData();

    showToast(
      "Welcome back! 👋",
      "success"
    );
  } catch (error) {
    showToast(
      error.message,
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
    $("registerName")
      ?.value
      .trim();

  const username =
    $("registerUsername")
      ?.value
      .trim();

  const password =
    $("registerPassword")
      ?.value || "";

  const referral =
    $("registerReferral")
      ?.value
      .trim();

  if (!firstName) {
    showToast(
      "Enter your name",
      "error"
    );
    return;
  }

  if (!username) {
    showToast(
      "Enter a username",
      "error"
    );
    return;
  }

  if (password.length < 6) {
    showToast(
      "Password must be at least 6 characters",
      "error"
    );
    return;
  }

  const button =
    $("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Creating...";
  }

  try {
    const data =
      await api(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            first_name:
              firstName,
            username,
            password,
            referral_code:
              referral
          })
        }
      );

    saveSession(
      data.token,
      data.user
    );

    showApp();
    updateUserUI();

    await startAppData();

    showToast(
      "Account created successfully 🎉",
      "success"
    );
  } catch (error) {
    showToast(
      error.message,
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
    showAuthScreen(
      "login"
    );
    return false;
  }

  try {
    const data =
      await api(
        "/api/auth/me"
      );

    currentUser =
      data.user;

    localStorage.setItem(
      USER_KEY,
      JSON.stringify(
        currentUser
      )
    );

    showApp();
    updateUserUI();

    return true;
  } catch {
    clearSession();

    showAuthScreen(
      "login"
    );

    return false;
  }
}

/* ======================================================
   LOGOUT
====================================================== */

async function logout() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } catch {
    // Ignore logout network error.
  }

  clearSession();

  $("loginPassword")
    ?.value = "";

  $("registerPassword")
    ?.value = "";

  showAuthScreen(
    "login"
  );

  showToast(
    "Logged out",
    "success"
  );
}

/* ======================================================
   USER UI
====================================================== */

function updateUserUI() {
  if (!currentUser) return;

  const name =
    currentUser.first_name ||
    currentUser.username ||
    "User";

  if ($("headerGreeting")) {
    $("headerGreeting")
      .textContent =
      `Hi, ${name} 👋`;
  }

  if ($("headerPoints")) {
    $("headerPoints")
      .textContent =
      `${formatNumber(
        currentUser.points
      )} pts`;
  }

  if ($("profileName")) {
    $("profileName")
      .textContent =
      name;
  }

  if ($("profileUsername")) {
    $("profileUsername")
      .textContent =
      `@${currentUser.username}`;
  }

  if ($("profilePoints")) {
    $("profilePoints")
      .textContent =
      formatNumber(
        currentUser.points
      );
  }

  if ($("profileVideos")) {
    $("profileVideos")
      .textContent =
      formatNumber(
        currentUser.watched_videos
      );
  }

  if ($("profileEarned")) {
    $("profileEarned")
      .textContent =
      formatNumber(
        currentUser.total_earned
      );
  }
}

async function refreshCurrentUser() {
  if (!currentUser) return;

  const data =
    await api(
      `/api/user/${encodeURIComponent(
        currentUser.id
      )}`
    );

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

/* ======================================================
   NAVIGATION
====================================================== */

function showPage(
  sectionId
) {
  const sections =
    document.querySelectorAll(
      ".page-section"
    );

  sections.forEach(
    section => {
      section.classList.toggle(
        "active",
        section.id ===
          sectionId
      );
    }
  );

  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          sectionId
      );
    });

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
}

/* ======================================================
   FEED
====================================================== */

async function loadVideos() {
  const feed =
    $("videoFeed");

  if (!feed) return;

  feed.innerHTML = `
    <div class="loading-card">
      <div class="spinner"></div>
      <p>Loading videos...</p>
    </div>
  `;

  try {
    const data =
      await api(
        "/api/videos"
      );

    renderVideoFeed(
      data.videos || []
    );
  } catch (error) {
    feed.innerHTML = `
      <div class="empty-card">
        <h3>Unable to load videos</h3>
        <p>${escapeHTML(
          error.message
        )}</p>
        <button class="primary-btn"
          id="retryFeedBtn">
          Try Again
        </button>
      </div>
    `;

    $("retryFeedBtn")
      ?.addEventListener(
        "click",
        loadVideos
      );
  }
}

function renderVideoFeed(
  videos
) {
  const feed =
    $("videoFeed");

  if (!feed) return;

  if (!videos.length) {
    feed.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">🎬</div>
        <h3>No videos yet</h3>
        <p>Be the first creator to upload a video.</p>
      </div>
    `;

    return;
  }

  feed.innerHTML =
    videos
      .map(video => `
        <article
          class="video-card"
          data-video-id="${video.id}"
        >
          <div class="video-thumb-wrap">
            ${
              video.thumbnail_url
                ? `
                  <img
                    class="video-thumb"
                    src="${escapeHTML(
                      video.thumbnail_url
                    )}"
                    alt=""
                    loading="lazy"
                  >
                `
                : `
                  <div class="video-thumb placeholder-thumb">
                    ▶
                  </div>
                `
            }

            <span class="play-badge">
              ▶
            </span>
          </div>

          <div class="video-card-body">
            <h3>
              ${escapeHTML(
                video.title
              )}
            </h3>

            <p class="video-description">
              ${escapeHTML(
                video.description ||
                  "No description"
              )}
            </p>

            <div class="video-meta">
              <span>
                @${escapeHTML(
                  video.creator_username ||
                    "creator"
                )}
              </span>

              <span>
                ${formatNumber(
                  video.views
                )} views
              </span>
            </div>
          </div>
        </article>
      `)
      .join("");

  feed
    .querySelectorAll(
      ".video-card"
    )
    .forEach(card => {
      card.addEventListener(
        "click",
        () =>
          openVideo(
            card.dataset.videoId
          )
      );
    });
}

/* ======================================================
   OPEN PLAYER
====================================================== */

async function openVideo(
  videoId
) {
  try {
    stopWatchTimer();

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          videoId
        )}`
      );

    currentVideo =
      data.video;

    watchSeconds = 0;
    watchRewardSent = false;

    showPage(
      "playerSection"
    );

    const video =
      $("mainVideo");

    if (video) {
      video.pause();
      video.src =
        currentVideo.video_url;

      video.poster =
        currentVideo.thumbnail_url ||
        "";

      video.load();
    }

    $("playerTitle")
      .textContent =
      currentVideo.title;

    $("playerDescription")
      .textContent =
      currentVideo.description ||
      "No description";

    $("playerViews")
      .textContent =
      `${formatNumber(
        currentVideo.views
      )} views`;

    $("playerLikes")
      .textContent =
      `${formatNumber(
        currentVideo.likes_count
      )} likes`;

    $("playerCommentsCount")
      .textContent =
      `${formatNumber(
        currentVideo.comments_count
      )} comments`;

    await Promise.all([
      loadLikeStatus(),
      loadFollowStatus(),
      loadComments()
    ]);

    setupWatchTimer();
  } catch (error) {
    showToast(
      error.message,
      "error"
    );
  }
}

/* ======================================================
   WATCH TIMER
====================================================== */

function setupWatchTimer() {
  stopWatchTimer();

  watchTimer =
    setInterval(
      async () => {
        const video =
          $("mainVideo");

        if (
          !video ||
          video.paused ||
          video.ended ||
          document.hidden
        ) {
          return;
        }

        watchSeconds += 1;

        if (
          watchSeconds >= 10 &&
          !watchRewardSent
        ) {
          await completeWatch();
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

    watchTimer = null;
  }
}

async function completeWatch() {
  if (
    watchRewardSent ||
    !currentVideo ||
    watchSeconds < 10
  ) {
    return;
  }

  try {
    const data =
      await api(
        "/api/watch/complete",
        {
          method: "POST",
          body: JSON.stringify({
            video_id:
              currentVideo.id,
            watch_seconds:
              watchSeconds
          })
        }
      );

    watchRewardSent = true;

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

    if (data.reward > 0) {
      showToast(
        `+${data.reward} point earned 🎉`,
        "success"
      );
    }
  } catch (error) {
    console.error(
      "Watch reward:",
      error
    );
  }
}

/* ======================================================
   LIKE
====================================================== */

async function loadLikeStatus() {
  if (!currentVideo) return;

  try {
    const data =
      await api(
        `/api/videos/${currentVideo.id}/like/status`
      );

    updateLikeButton(
      Boolean(data.liked)
    );
  } catch {}
}

function updateLikeButton(
  liked
) {
  const button =
    $("likeVideoBtn");

  if (!button) return;

  button.classList.toggle(
    "liked",
    liked
  );

  button.innerHTML =
    liked
      ? "❤️ Liked"
      : "🤍 Like";
}

async function toggleLike() {
  if (!currentVideo) return;

  try {
    const data =
      await api(
        `/api/videos/${currentVideo.id}/like`,
        {
          method: "POST"
        }
      );

    updateLikeButton(
      Boolean(data.liked)
    );

    currentVideo.likes_count =
      data.likes_count;

    $("playerLikes")
      .textContent =
      `${formatNumber(
        data.likes_count
      )} likes`;
  } catch (error) {
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
  if (!currentVideo) return;

  const creatorId =
    currentVideo.creator_id ||
    currentVideo.user_id;

  if (
    String(creatorId) ===
    String(currentUser?.id)
  ) {
    $("followCreatorBtn")
      ?.classList.add(
        "hidden"
      );

    return;
  }

  $("followCreatorBtn")
    ?.classList.remove(
      "hidden"
    );

  try {
    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          creatorId
        )}/follow/status`
      );

    updateFollowButton(
      Boolean(data.following)
    );
  } catch {}
}

function updateFollowButton(
  following
) {
  const button =
    $("followCreatorBtn");

  if (!button) return;

  button.classList.toggle(
    "following",
    following
  );

  button.textContent =
    following
      ? "Following"
      : "Follow";
}

async function toggleFollow() {
  if (!currentVideo) return;

  const creatorId =
    currentVideo.creator_id ||
    currentVideo.user_id;

  try {
    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          creatorId
        )}/follow`,
        {
          method: "POST"
        }
      );

    updateFollowButton(
      Boolean(data.following)
    );

    showToast(
      data.following
        ? "Following creator"
        : "Unfollowed creator",
      "success"
    );
  } catch (error) {
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
  if (!currentVideo) return;

  const list =
    $("commentsList");

  if (!list) return;

  list.innerHTML = `
    <div class="mini-loading">
      Loading comments...
    </div>
  `;

  try {
    const data =
      await api(
        `/api/videos/${currentVideo.id}/comments`
      );

    const comments =
      data.comments || [];

    if (!comments.length) {
      list.innerHTML = `
        <div class="empty-comments">
          No comments yet. Be the first! 💬
        </div>
      `;

      return;
    }

    list.innerHTML =
      comments
        .map(comment => `
          <div class="comment-item">
            <div class="comment-avatar">
              ${escapeHTML(
                (
                  comment.first_name ||
                  comment.username ||
                  "U"
                )
                  .charAt(0)
                  .toUpperCase()
              )}
            </div>

            <div class="comment-content">
              <strong>
                ${escapeHTML(
                  comment.first_name ||
                    comment.username
                )}
              </strong>

              <p>
                ${escapeHTML(
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
        `)
        .join("");
  } catch (error) {
    list.innerHTML = `
      <div class="empty-comments">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
  }
}

async function addComment() {
  if (!currentVideo) return;

  const input =
    $("commentInput");

  const comment =
    input?.value.trim();

  if (!comment) {
    showToast(
      "Write a comment first",
      "error"
    );
    return;
  }

  try {
    await api(
      `/api/videos/${currentVideo.id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          comment
        })
      }
    );

    input.value = "";

    currentVideo.comments_count +=
      1;

    $("playerCommentsCount")
      .textContent =
      `${formatNumber(
        currentVideo.comments_count
      )} comments`;

    await loadComments();

    showToast(
      "Comment added",
      "success"
    );
  } catch (error) {
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
  if (!currentVideo) return;

  const reason =
    window.prompt(
      "Why are you reporting this video?"
    );

  if (
    reason === null
  ) {
    return;
  }

  try {
    await api(
      `/api/videos/${currentVideo.id}/report`,
      {
        method: "POST",
        body: JSON.stringify({
          reason
        })
      }
    );

    showToast(
      "Report submitted",
      "success"
    );
  } catch (error) {
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
  if (!currentUser) return;

  const list =
    $("watchHistoryList");

  if (!list) return;

  list.innerHTML = `
    <div class="loading-card">
      <div class="spinner"></div>
      <p>Loading history...</p>
    </div>
  `;

  try {
    const data =
      await api(
        `/api/user/${currentUser.id}/watch-history`
      );

    const history =
      data.history || [];

    if (!history.length) {
      list.innerHTML = `
        <div class="empty-card">
          <div class="empty-icon">🕘</div>
          <h3>No watch history</h3>
          <p>Videos you watch will appear here.</p>
        </div>
      `;

      return;
    }

    list.innerHTML =
      history
        .map(video => `
          <article
            class="history-card"
            data-video-id="${video.id}"
          >
            ${
              video.thumbnail_url
                ? `
                  <img
                    src="${escapeHTML(
                      video.thumbnail_url
                    )}"
                    alt=""
                  >
                `
                : `
                  <div class="history-placeholder">
                    ▶
                  </div>
                `
            }

            <div>
              <h3>
                ${escapeHTML(
                  video.title
                )}
              </h3>

              <p>
                ${formatNumber(
                  video.user_watch_seconds
                )} sec watched
              </p>

              <small>
                ${formatDate(
                  video.watched_at
                )}
              </small>
            </div>
          </article>
        `)
        .join("");

    list
      .querySelectorAll(
        ".history-card"
      )
      .forEach(card => {
        card.addEventListener(
          "click",
          () =>
            openVideo(
              card.dataset.videoId
            )
        );
      });
  } catch (error) {
    list.innerHTML = `
      <div class="empty-card">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
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
        "/api/daily/claim",
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
      `+${data.reward} daily points 🎁`,
      "success"
    );
  } catch (error) {
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
  const button =
    $("rewardedAdBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Adding reward...";
  }

  try {
    const data =
      await api(
        "/api/rewarded-ad/complete",
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
      `+${data.reward} points added 🎁`,
      "success"
    );
  } catch (error) {
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
  if (!currentUser) return;

  const list =
    $("pointsHistory");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading...
    </div>`;

  try {
    const data =
      await api(
        `/api/user/${currentUser.id}/points/history`
      );

    const history =
      data.history || [];

    if (!history.length) {
      list.innerHTML = `
        <div class="empty-card small">
          No points activity yet.
        </div>
      `;

      return;
    }

    list.innerHTML =
      history
        .map(item => `
          <div class="points-row">
            <div>
              <strong>
                ${escapeHTML(
                  item.description ||
                    item.type
                )}
              </strong>

              <small>
                ${formatDate(
                  item.created_at
                )}
              </small>
            </div>

            <b class="points-positive">
              +${formatNumber(
                item.points
              )}
            </b>
          </div>
        `)
        .join("");
  } catch (error) {
    list.innerHTML = `
      <div class="empty-card small">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
  }
}

/* ======================================================
   VIDEO UPLOAD FILE
====================================================== */

function handleVideoFile(
  file
) {
  if (!file) return;

  if (
    !file.type.startsWith(
      "video/"
    )
  ) {
    showToast(
      "Please select a video file",
      "error"
    );

    return;
  }

  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {
    showToast(
      "Maximum video size is 100 MB",
      "error"
    );

    return;
  }

  selectedVideoFile =
    file;

  if (uploadPreviewUrl) {
    URL.revokeObjectURL(
      uploadPreviewUrl
    );
  }

  uploadPreviewUrl =
    URL.createObjectURL(
      file
    );

  const preview =
    $("uploadPreviewVideo");

  if (preview) {
    preview.src =
      uploadPreviewUrl;

    preview.load();
  }

  $("videoFileName")
    .textContent =
    `${file.name} • ${formatVideoSize(
      file.size
    )}`;

  $("uploadPreview")
    ?.classList.remove(
      "hidden"
    );
}

function uploadPreviewMetadata() {
  const preview =
    $("uploadPreviewVideo");

  if (!preview) return;

  if (
    Number.isFinite(
      preview.duration
    )
  ) {
    selectedVideoDuration =
      preview.duration;
  }
}

/* ======================================================
   CLOUDINARY UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signature
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const url =
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          signature.cloud_name
        )}/video/upload`;

      const form =
        new FormData();

      form.append(
        "file",
        file
      );

      form.append(
        "api_key",
        signature.api_key
      );

      form.append(
        "timestamp",
        signature.timestamp
      );

      form.append(
        "signature",
        signature.signature
      );

      form.append(
        "folder",
        signature.folder
      );

      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "POST",
        url
      );

      xhr.upload.onprogress =
        event => {
          if (!event.lengthComputable) {
            return;
          }

          const percent =
            Math.round(
              (event.loaded /
                event.total) *
                100
            );

          $("uploadProgressPercent")
            .textContent =
            `${percent}%`;

          $("uploadProgressText")
            .textContent =
            `Uploading video... ${percent}%`;

          $("uploadProgressBar")
            .style.width =
            `${percent}%`;
        };

      xhr.onload = () => {
        let data = {};

        try {
          data =
            JSON.parse(
              xhr.responseText
            );
        } catch {
          data = {};
        }

        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          resolve(data);
        } else {
          reject(
            new Error(
              data.error?.message ||
                "Cloudinary upload failed"
            )
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "Network error during upload"
          )
        );
      };

      xhr.onabort = () => {
        reject(
          new Error(
            "Upload cancelled"
          )
        );
      };

      xhr.send(form);
    }
  );
}

/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadVideo() {
  if (!selectedVideoFile) {
    showToast(
      "Select a video first",
      "error"
    );

    return;
  }

  const title =
    $("videoTitle")
      ?.value
      .trim();

  const description =
    $("videoDescription")
      ?.value
      .trim();

  if (!title) {
    showToast(
      "Enter a video title",
      "error"
    );

    return;
  }

  const button =
    $("uploadVideoBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Uploading...";
  }

  $("uploadProgressBox")
    ?.classList.remove(
      "hidden"
    );

  try {
    $("uploadProgressPercent")
      .textContent =
      "0%";

    $("uploadProgressText")
      .textContent =
      "Preparing upload...";

    $("uploadProgressBar")
      .style.width =
      "0%";

    const signature =
      await api(
        "/api/cloudinary/signature",
        {
          method: "POST"
        }
      );

    const uploaded =
      await uploadToCloudinary(
        selectedVideoFile,
        signature
      );

    $("uploadProgressText")
      .textContent =
      "Saving video details...";

    const publicId =
      uploaded.public_id ||
      "";

    const thumbnail =
      publicId
        ? `https://res.cloudinary.com/${encodeURIComponent(
            signature.cloud_name
          )}/video/upload/so_0/${publicId}.jpg`
        : "";

    const duration =
      Number(
        uploaded.duration ||
          selectedVideoDuration ||
          0
      );

    const bytes =
      Number(
        uploaded.bytes ||
          selectedVideoFile.size
      );

    await api(
      "/api/videos",
      {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          video_url:
            uploaded.secure_url ||
            uploaded.url,
          thumbnail_url:
            thumbnail,
          cloudinary_public_id:
            publicId,
          cloudinary_resource_type:
            uploaded.resource_type ||
            "video",
          cloudinary_format:
            uploaded.format ||
            "",
          duration,
          bytes
        })
      }
    );

    showToast(
      "Video uploaded successfully 🎉",
      "success"
    );

    $("videoTitle").value = "";
    $("videoDescription").value = "";
    $("videoFile").value = "";

    $("videoFileName")
      .textContent =
      "No video selected";

    $("uploadPreview")
      ?.classList.add(
        "hidden"
      );

    selectedVideoFile =
      null;

    selectedVideoDuration =
      0;

    if (uploadPreviewUrl) {
      URL.revokeObjectURL(
        uploadPreviewUrl
      );

      uploadPreviewUrl = null;
    }

    $("uploadProgressText")
      .textContent =
      "Upload complete";

    $("uploadProgressPercent")
      .textContent =
      "100%";

    $("uploadProgressBar")
      .style.width =
      "100%";

    await refreshCurrentUser();
    await loadVideos();
    await loadMyVideos();
  } catch (error) {
    showToast(
      error.message,
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Upload Video";
    }
  }
}

/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {
  if (!currentUser) return;

  const list =
    $("myVideosList");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading your videos...
    </div>`;

  try {
    const data =
      await api(
        `/api/videos?creator_id=${encodeURIComponent(
          currentUser.id
        )}&mine=1`
      );

    const videos =
      data.videos || [];

    if (!videos.length) {
      list.innerHTML = `
        <div class="empty-card small">
          <h3>No videos uploaded</h3>
          <p>Upload your first video.</p>
        </div>
      `;

      return;
    }

    list.innerHTML =
      videos
        .map(video => `
          <div class="my-video-row">
            ${
              video.thumbnail_url
                ? `
                  <img
                    src="${escapeHTML(
                      video.thumbnail_url
                    )}"
                    alt=""
                  >
                `
                : `
                  <div class="my-video-placeholder">
                    ▶
                  </div>
                `
            }

            <div class="my-video-info">
              <h3>
                ${escapeHTML(
                  video.title
                )}
              </h3>

              <p>
                ${formatNumber(
                  video.views
                )} views •
                ${formatNumber(
                  video.likes_count
                )} likes
              </p>

              <small>
                ${formatDate(
                  video.created_at
                )}
              </small>
            </div>

            <button
              class="danger-small delete-video-btn"
              data-id="${video.id}"
            >
              Delete
            </button>
          </div>
        `)
        .join("");

    list
      .querySelectorAll(
        ".delete-video-btn"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () =>
            deleteVideo(
              button.dataset.id
            )
        );
      });
  } catch (error) {
    list.innerHTML = `
      <div class="empty-card small">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
  }
}

async function deleteVideo(
  videoId
) {
  const confirmed =
    window.confirm(
      "Delete this video?"
    );

  if (!confirmed) return;

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
      "Video deleted",
      "success"
    );

    await loadMyVideos();
    await loadVideos();
  } catch (error) {
    showToast(
      error.message,
      "error"
    );
  }
}

/* ======================================================
   CREATOR DASHBOARD
====================================================== */

async function loadCreatorDashboard() {
  if (!currentUser) return;

  const statsBox =
    $("creatorStats");

  if (!statsBox) return;

  statsBox.innerHTML =
    `<div class="mini-loading">
      Loading dashboard...
    </div>`;

  try {
    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          currentUser.id
        )}`
      );

    const stats =
      data.stats || {};

    statsBox.innerHTML = `
      <div class="creator-stat-grid">

        <div class="stat-card">
          <span>Videos</span>
          <strong>
            ${formatNumber(
              stats.video_count
            )}
          </strong>
        </div>

        <div class="stat-card">
          <span>Views</span>
          <strong>
            ${formatNumber(
              stats.total_views
            )}
          </strong>
        </div>

        <div class="stat-card">
          <span>Likes</span>
          <strong>
            ${formatNumber(
              stats.total_likes
            )}
          </strong>
        </div>

        <div class="stat-card">
          <span>Comments</span>
          <strong>
            ${formatNumber(
              stats.total_comments
            )}
          </strong>
        </div>

        <div class="stat-card">
          <span>Followers</span>
          <strong>
            ${formatNumber(
              stats.followers
            )}
          </strong>
        </div>

        <div class="stat-card">
          <span>Earnings</span>
          <strong>
            ₹${formatNumber(
              stats.earnings
            )}
          </strong>
        </div>

      </div>

      <div class="monetization-status">
        Monetization:
        <strong>
          ${escapeHTML(
            currentUser.monetization_status
          )}
        </strong>
      </div>
    `;
  } catch (error) {
    statsBox.innerHTML = `
      <div class="empty-card small">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
  }
}

async function applyMonetization() {
  try {
    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          currentUser.id
        )}/monetization/apply`,
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
      "Monetization application submitted",
      "success"
    );

    await loadCreatorDashboard();
  } catch (error) {
    showToast(
      error.message,
      "error"
    );
  }
}

/* ======================================================
   START APP DATA
====================================================== */

async function startAppData() {
  if (!currentUser) return;

  updateUserUI();

  await Promise.allSettled([
    loadVideos(),
    loadWatchHistory(),
    loadPointsHistory(),
    loadMyVideos()
  ]);
}

/* ======================================================
   PWA
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  event => {
    event.preventDefault();

    deferredPrompt =
      event;

    $("installAppBtn")
      ?.classList.remove(
        "hidden"
      );
  }
);

async function installApp() {
  if (!deferredPrompt) {
    showToast(
      "Install option is not available yet",
      "error"
    );

    return;
  }

  deferredPrompt.prompt();

  try {
    await deferredPrompt.userChoice;
  } catch {}

  deferredPrompt = null;

  $("installAppBtn")
    ?.classList.add(
      "hidden"
    );
}

window.addEventListener(
  "appinstalled",
  () => {
    $("installAppBtn")
      ?.classList.add(
        "hidden"
      );

    showToast(
      "DekhoEarn installed 🎉",
      "success"
    );
  }
);

/* ======================================================
   SERVICE WORKER
====================================================== */

function registerServiceWorker() {
  if (
    "serviceWorker" in
    navigator
  ) {
    navigator.serviceWorker
      .register(
        "/sw.js"
      )
      .catch(error => {
        console.warn(
          "Service worker:",
          error
        );
      });
  }
}

/* ======================================================
   EVENTS
====================================================== */

function setupEvents() {
  $("loginBtn")
    ?.addEventListener(
      "click",
      login
    );

  $("registerBtn")
    ?.addEventListener(
      "click",
      register
    );

  $("showRegisterBtn")
    ?.addEventListener(
      "click",
      () =>
        showAuthScreen(
          "register"
        )
    );

  $("showLoginBtn")
    ?.addEventListener(
      "click",
      () =>
        showAuthScreen(
          "login"
        )
    );

  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );

  $("refreshFeedBtn")
    ?.addEventListener(
      "click",
      loadVideos
    );

  $("backFromPlayerBtn")
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "homeSection"
        )
    );

  $("likeVideoBtn")
    ?.addEventListener(
      "click",
      toggleLike
    );

  $("followCreatorBtn")
    ?.addEventListener(
      "click",
      toggleFollow
    );

  $("commentBtn")
    ?.addEventListener(
      "click",
      addComment
    );

  $("reportVideoBtn")
    ?.addEventListener(
      "click",
      reportVideo
    );

  $("dailyRewardBtn")
    ?.addEventListener(
      "click",
      claimDailyReward
    );

  $("rewardedAdBtn")
    ?.addEventListener(
      "click",
      claimRewardedAd
    );

  $("uploadVideoBtn")
    ?.addEventListener(
      "click",
      uploadVideo
    );

  $("videoFile")
    ?.addEventListener(
      "change",
      event =>
        handleVideoFile(
          event.target.files?.[0]
        )
    );

  $("uploadPreviewVideo")
    ?.addEventListener(
      "loadedmetadata",
      uploadPreviewMetadata
    );

  $("myVideosBtn")
    ?.addEventListener(
      "click",
      async () => {
        await loadMyVideos();

        $("myVideosContainer")
          ?.classList.remove(
            "hidden"
          );
      }
    );

  $("creatorDashboardBtn")
    ?.addEventListener(
      "click",
      async () => {
        showPage(
          "creatorSection"
        );

        await loadCreatorDashboard();
      }
    );

  $("applyMonetizationBtn")
    ?.addEventListener(
      "click",
      applyMonetization
    );

  $("installAppBtn")
    ?.addEventListener(
      "click",
      installApp
    );

  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          showPage(
            button.dataset.page
          )
      );
    });

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        document.activeElement ===
          $("loginPassword")
      ) {
        login();
      }

      if (
        event.key === "Enter" &&
        document.activeElement ===
          $("registerPassword")
      ) {
        register();
      }
    }
  );

  $("mainVideo")
    ?.addEventListener(
      "play",
      setupWatchTimer
    );

  $("mainVideo")
    ?.addEventListener(
      "pause",
      stopWatchTimer
    );

  $("mainVideo")
    ?.addEventListener(
      "ended",
      stopWatchTimer
    );
}

/* ======================================================
   INITIALIZE
====================================================== */

async function init() {
  setupEvents();

  registerServiceWorker();

  const loggedIn =
    await loadSession();

  if (!loggedIn) {
    return;
  }

  await startAppData();

  showPage(
    "homeSection"
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
