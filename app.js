"use strict";

/*
=========================================================
 DEKHOEARN FRONTEND v4.0.2
=========================================================
*/

(() => {

  const API_BASE = "";

  const VERSION = "4.0.2";

  const STORAGE = {
    token:
      "dekhoearn_auth_token",

    user:
      "dekhoearn_user",

    username:
      "dekhoearn_username",

    firstName:
      "dekhoearn_first_name"
  };

  const MAX_VIDEO_SIZE =
    100 * 1024 * 1024;

  const MIN_WATCH_SECONDS = 10;

  let currentUser = null;
  let currentVideo = null;

  let watchTimer = null;
  let watchSeconds = 0;
  let selectedVideoFile = null;

  let uploadInProgress = false;
  let deferredInstallPrompt = null;
  let initialized = false;

  /* ====================================================
     DOM
  ==================================================== */

  const $ = id =>
    document.getElementById(id);

  /* ====================================================
     HELPERS
  ==================================================== */

  function escapeHTML(value) {

    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function number(value) {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : 0;
  }

  function formatNumber(value) {

    return number(
      value
    ).toLocaleString(
      "en-IN"
    );
  }

  function formatDuration(seconds) {

    const total =
      Math.max(
        0,
        Math.floor(
          number(seconds)
        )
      );

    const m =
      Math.floor(
        total / 60
      );

    const s =
      total % 60;

    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDate(value) {

    if (!value) {
      return "";
    }

    try {

      return new Date(
        value
      ).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric"
        }
      );

    } catch {
      return "";
    }
  }

  function getToken() {

    return localStorage.getItem(
      STORAGE.token
    ) || "";
  }

  function getSavedUser() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE.user
        );

      return raw
        ? JSON.parse(raw)
        : null;

    } catch {

      return null;
    }
  }

  function saveSession(
    tokenValue,
    user
  ) {

    if (tokenValue) {

      localStorage.setItem(
        STORAGE.token,
        tokenValue
      );
    }

    if (user) {

      currentUser = user;

      localStorage.setItem(
        STORAGE.user,
        JSON.stringify(user)
      );

      localStorage.setItem(
        STORAGE.username,
        user.username || ""
      );

      localStorage.setItem(
        STORAGE.firstName,
        user.name || ""
      );
    }

    updateUserUI();
  }

  function clearSession() {

    currentUser = null;

    localStorage.removeItem(
      STORAGE.token
    );

    localStorage.removeItem(
      STORAGE.user
    );

    localStorage.removeItem(
      STORAGE.username
    );

    localStorage.removeItem(
      STORAGE.firstName
    );
  }

  /* ====================================================
     ERROR
  ==================================================== */

  function makeApiError(
    message,
    status,
    data
  ) {

    const e =
      new Error(
        message ||
        "Request failed"
      );

    e.status =
      status;

    e.data =
      data;

    return e;
  }

  /* ====================================================
     API
  ==================================================== */

  async function api(
    path,
    options = {}
  ) {

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        options.timeout || 120000
      );

    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type":
              "application/json"
          }),

      ...(options.headers || {})
    };

    const tokenValue =
      getToken();

    if (tokenValue) {

      headers.Authorization =
        `Bearer ${tokenValue}`;

      headers["x-auth-token"] =
        tokenValue;
    }

    let response;

    try {

      response =
        await fetch(
          API_BASE + path,
          {
            ...options,
            headers,
            signal:
              controller.signal
          }
        );

    } catch (e) {

      clearTimeout(
        timeout
      );

      if (
        e.name ===
        "AbortError"
      ) {

        throw makeApiError(
          "Request timed out. Please try again.",
          408
        );
      }

      throw makeApiError(
        "Network error. Please check your connection.",
        0
      );

    } finally {

      clearTimeout(
        timeout
      );
    }

    let data = null;

    try {

      data =
        await response.json();

    } catch {

      data = {};
    }

    if (!response.ok) {

      const message =
        data?.message ||
        data?.error ||
        `Request failed (${response.status})`;

      /*
       * IMPORTANT:
       * Do NOT automatically clear session here.
       *
       * A protected request can return 503 because
       * database is temporarily unavailable.
       */

      throw makeApiError(
        message,
        response.status,
        data
      );
    }

    return data;
  }

  /* ====================================================
     MESSAGE
  ==================================================== */

  function showMessage(
    message,
    type = "info"
  ) {

    const toast =
      $("toast");

    if (!toast) {
      return;
    }

    toast.textContent =
      message || "";

    toast.className =
      `toast ${type}`;

    toast.classList.add(
      "show"
    );

    clearTimeout(
      toast._timer
    );

    toast._timer =
      setTimeout(
        () => {
          toast.classList.remove(
            "show"
          );
        },
        3500
      );
  }

  /* ====================================================
     AUTH SCREEN
  ==================================================== */

  function hideAllAuthBoxes() {

    [
      "loginBox",
      "registerBox",
      "forgotPasswordBox",
      "resetPasswordBox"
    ].forEach(
      id => {

        const el =
          $(id);

        if (el) {
          el.classList.add(
            "hidden"
          );
        }
      }
    );
  }

  function showAuthScreen(
    mode = "login"
  ) {

    const auth =
      $("authScreen");

    const shell =
      $("appShell");

    if (shell) {
      shell.classList.add(
        "hidden"
      );
    }

    if (auth) {
      auth.classList.remove(
        "hidden"
      );

      auth.style.display =
        "";
    }

    hideAllAuthBoxes();

    if (
      mode === "register"
    ) {

      const box =
        $("registerBox");

      if (box) {
        box.classList.remove(
          "hidden"
        );
      }

      return;
    }

    if (
      mode === "forgot"
    ) {

      const box =
        $("forgotPasswordBox");

      if (box) {
        box.classList.remove(
          "hidden"
        );
      }

      return;
    }

    if (
      mode === "reset"
    ) {

      const box =
        $("resetPasswordBox");

      if (box) {
        box.classList.remove(
          "hidden"
        );
      }

      return;
    }

    const box =
      $("loginBox");

    if (box) {
      box.classList.remove(
        "hidden"
      );
    }
  }

  function showAppScreen() {

    const auth =
      $("authScreen");

    const shell =
      $("appShell");

    if (auth) {

      auth.classList.add(
        "hidden"
      );

      auth.style.display =
        "none";
    }

    if (shell) {

      shell.classList.remove(
        "hidden"
      );

      shell.style.display =
        "";
    }
  }

  function showLoginBox() {
    showAuthScreen(
      "login"
    );
  }

  function showRegisterBox() {
    showAuthScreen(
      "register"
    );
  }

  function showForgotPasswordBox() {
    showAuthScreen(
      "forgot"
    );
  }

  function showResetPasswordBox(
    resetToken = ""
  ) {

    showAuthScreen(
      "reset"
    );

    const input =
      $("resetPasswordToken");

    if (
      input &&
      resetToken
    ) {
      input.value =
        resetToken;
    }
  }

  /* ====================================================
     LOGIN
  ==================================================== */

  async function login() {

    const identifier =
      String(
        $("loginUsername")?.value ||
        ""
      ).trim();

    const password =
      String(
        $("loginPassword")?.value ||
        ""
      );

    if (
      !identifier ||
      !password
    ) {

      showMessage(
        "Username/email aur password enter karo.",
        "error"
      );

      return;
    }

    const button =
      $("loginBtn");

    if (button) {
      button.disabled = true;
      button.dataset.oldText =
        button.textContent;
      button.textContent =
        "Logging in...";
    }

    try {

      const data =
        await api(
          "/api/auth/login",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                email:
                  identifier,
                username:
                  identifier,
                password
              })
          }
        );

      saveSession(
        data.token,
        data.user
      );

      showAppScreen();

      await initializeAppData();

      showMessage(
        "Login successful.",
        "success"
      );

    } catch (e) {

      showMessage(
        e.message ||
        "Login failed.",
        "error"
      );

    } finally {

      if (button) {
        button.disabled =
          false;

        button.textContent =
          button.dataset.oldText ||
          "Login";
      }
    }
  }

  /* ====================================================
     REGISTER
  ==================================================== */

  async function register() {

    const name =
      String(
        $("registerName")?.value ||
        ""
      ).trim();

    const uname =
      String(
        $("registerUsername")?.value ||
        ""
      ).trim();

    const password =
      String(
        $("registerPassword")?.value ||
        ""
      );

    const referral =
      String(
        $("registerReferral")?.value ||
        ""
      ).trim();

    if (
      !name ||
      !uname ||
      !password
    ) {

      showMessage(
        "Name, username aur password enter karo.",
        "error"
      );

      return;
    }

    if (
      password.length < 6
    ) {

      showMessage(
        "Password minimum 6 characters ka hona chahiye.",
        "error"
      );

      return;
    }

    /*
     * Existing UI may not have email field.
     * Generate a placeholder email only if needed.
     * Backend requires an email.
     */
    const generatedEmail =
      `${uname.toLowerCase().replace(/[^a-z0-9_.]/g, "")}@dekhoearn.local`;

    const button =
      $("registerBtn");

    if (button) {
      button.disabled = true;
      button.dataset.oldText =
        button.textContent;
      button.textContent =
        "Creating...";
    }

    try {

      const data =
        await api(
          "/api/auth/register",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                name,
                username:
                  uname,
                email:
                  generatedEmail,
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

      showAppScreen();

      await initializeAppData();

      showMessage(
        "Account created successfully.",
        "success"
      );

    } catch (e) {

      showMessage(
        e.message ||
        "Registration failed.",
        "error"
      );

    } finally {

      if (button) {
        button.disabled =
          false;

        button.textContent =
          button.dataset.oldText ||
          "Create Account";
      }
    }
  }

  /* ====================================================
     FORGOT PASSWORD
  ==================================================== */

  async function requestForgotPassword() {

    const identifier =
      String(
        $("forgotPasswordIdentifier")
          ?.value ||
        ""
      ).trim();

    if (!identifier) {

      showMessage(
        "Username ya email enter karo.",
        "error"
      );

      return;
    }

    const button =
      $("forgotPasswordSubmitBtn");

    if (button) {
      button.disabled =
        true;

      button.dataset.oldText =
        button.textContent;

      button.textContent =
        "Checking...";
    }

    try {

      const data =
        await api(
          "/api/auth/forgot-password",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                identifier
              })
          }
        );

      showMessage(
        data.message ||
        "Password reset request submitted.",
        "success"
      );

      /*
       * Development/testing mode:
       * backend only sends this when
       * RETURN_RESET_TOKEN=true.
       */
      if (
        data.dev_reset_token
      ) {

        const tokenValue =
          data.dev_reset_token;

        showResetPasswordBox(
          tokenValue
        );

        showMessage(
          "Testing reset token mil gaya. Naya password set karo.",
          "success"
        );

        return;
      }

    } catch (e) {

      showMessage(
        e.message ||
        "Password reset request failed.",
        "error"
      );

    } finally {

      if (button) {

        button.disabled =
          false;

        button.textContent =
          button.dataset.oldText ||
          "Send Reset";
      }
    }
  }

  /* ====================================================
     RESET PASSWORD
  ==================================================== */

  async function resetPassword() {

    const tokenValue =
      String(
        $("resetPasswordToken")
          ?.value ||
        ""
      ).trim();

    const password =
      String(
        $("resetPasswordNew")
          ?.value ||
        ""
      );

    const confirm =
      String(
        $("resetPasswordConfirm")
          ?.value ||
        ""
      );

    if (!tokenValue) {

      showMessage(
        "Reset token missing hai.",
        "error"
      );

      return;
    }

    if (
      password.length < 6
    ) {

      showMessage(
        "Password minimum 6 characters ka hona chahiye.",
        "error"
      );

      return;
    }

    if (
      password !== confirm
    ) {

      showMessage(
        "Passwords match nahi kar rahe.",
        "error"
      );

      return;
    }

    const button =
      $("resetPasswordSubmitBtn");

    if (button) {
      button.disabled =
        true;

      button.dataset.oldText =
        button.textContent;

      button.textContent =
        "Resetting...";
    }

    try {

      const data =
        await api(
          "/api/auth/reset-password",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                token:
                  tokenValue,
                password
              })
          }
        );

      clearSession();

      if (
        history.replaceState
      ) {

        history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }

      showAuthScreen(
        "login"
      );

      const loginPassword =
        $("loginPassword");

      if (loginPassword) {
        loginPassword.value =
          "";
      }

      showMessage(
        data.message ||
        "Password reset successful. Login again.",
        "success"
      );

    } catch (e) {

      showMessage(
        e.message ||
        "Password reset failed.",
        "error"
      );

    } finally {

      if (button) {

        button.disabled =
          false;

        button.textContent =
          button.dataset.oldText ||
          "Reset Password";
      }
    }
  }

  /* ====================================================
     SESSION VALIDATION
  ==================================================== */

  async function ensureAuthenticated() {

    const tokenValue =
      getToken();

    if (!tokenValue) {

      showAuthScreen();

      throw makeApiError(
        "Please login first.",
        401
      );
    }

    try {

      const data =
        await api(
          "/api/auth/me",
          {
            method:
              "GET",
            timeout:
              30000
          }
        );

      if (
        !data?.user
      ) {
        throw makeApiError(
          "Invalid session.",
          401
        );
      }

      saveSession(
        tokenValue,
        data.user
      );

      return data.user;

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

      }

      /*
       * 503 is intentionally NOT converted
       * into logout.
       */

      throw e;
    }
  }

  async function refreshCurrentUser() {

    if (!getToken()) {

      clearSession();

      showAuthScreen();

      return null;
    }

    try {

      const data =
        await api(
          "/api/auth/me",
          {
            method:
              "GET",
            timeout:
              30000
          }
        );

      if (data?.user) {

        saveSession(
          getToken(),
          data.user
        );

        return data.user;
      }

      return null;

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

        return null;
      }

      /*
       * Server/database temporary failure:
       * keep local session.
       */
      console.warn(
        "Session refresh failed:",
        e.message
      );

      return currentUser ||
        getSavedUser();
    }
  }

  /* ====================================================
     LOGOUT
  ==================================================== */

  async function logout() {

    try {

      if (getToken()) {

        try {

          await api(
            "/api/auth/logout",
            {
              method:
                "POST",
              timeout:
                15000
            }
          );

        } catch {}
      }

    } finally {

      clearSession();

      showAuthScreen(
        "login"
      );

      showMessage(
        "Logged out.",
        "success"
      );
    }
  }

  /* ====================================================
     USER UI
  ==================================================== */

  function updateUserUI() {

    const user =
      currentUser ||
      getSavedUser();

    if (!user) {
      return;
    }

    const greeting =
      $("headerGreeting");

    if (greeting) {

      greeting.textContent =
        user.name
          ? `Hi, ${user.name}`
          : "Welcome to DekhoEarn";
    }

    const points =
      formatNumber(
        user.points || 0
      );

    const headerPoints =
      $("headerPoints");

    if (headerPoints) {
      headerPoints.textContent =
        points;
    }

    const profileName =
      $("profileName");

    if (profileName) {
      profileName.textContent =
        user.name || "-";
    }

    const profileUsername =
      $("profileUsername");

    if (profileUsername) {
      profileUsername.textContent =
        user.username
          ? `@${user.username}`
          : "-";
    }

    const profilePoints =
      $("profilePoints");

    if (profilePoints) {
      profilePoints.textContent =
        points;
    }

    const profileVideos =
      $("profileVideos");

    if (profileVideos) {
      profileVideos.textContent =
        formatNumber(
          user.total_videos || 0
        );
    }

    const profileEarned =
      $("profileEarned");

    if (profileEarned) {
      profileEarned.textContent =
        formatNumber(
          user.points || 0
        );
    }
  }

  /* ====================================================
     NAVIGATION
  ==================================================== */

  const PAGE_IDS = [
    "homeSection",
    "watchSection",
    "earnSection",
    "uploadSection",
    "profileSection",
    "creatorSection",
    "playerSection"
  ];

  function showPage(
    pageId
  ) {

    PAGE_IDS.forEach(
      id => {

        const el =
          $(id);

        if (!el) {
          return;
        }

        if (
          id === pageId
        ) {

          el.classList.remove(
            "hidden"
          );

        } else {

          el.classList.add(
            "hidden"
          );
        }
      }
    );

    document
      .querySelectorAll(
        "[data-page]"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "active",
            button.dataset.page ===
              pageId
          );
        }
      );

    if (
      pageId ===
      "homeSection"
    ) {
      loadFeed();
    }

    if (
      pageId ===
      "watchSection"
    ) {
      loadWatchHistory();
    }

    if (
      pageId ===
      "earnSection"
    ) {
      loadPointsHistory();
    }

    if (
      pageId ===
      "profileSection"
    ) {
      loadMyVideos();
    }

    if (
      pageId ===
      "creatorSection"
    ) {
      loadCreatorStats();
    }
  }

  /* ====================================================
     FEED
  ==================================================== */

  function normalizeVideo(
    video
  ) {

    return {
      ...video,

      id:
        number(
          video.id
        ),

      user_id:
        number(
          video.user_id
        ),

      views:
        number(
          video.views
        ),

      likes_count:
        number(
          video.likes_count
        ),

      comments_count:
        number(
          video.comments_count
        ),

      watched_seconds:
        number(
          video.watched_seconds
        )
    };
  }

  async function loadFeed() {

    const container =
      $("videoFeed");

    if (!container) {
      return;
    }

    container.innerHTML =
      `
      <div class="loading">
        Loading videos...
      </div>
      `;

    try {

      const data =
        await api(
          "/api/videos?limit=30"
        );

      const videos =
        Array.isArray(
          data.videos
        )
          ? data.videos.map(
              normalizeVideo
            )
          : [];

      if (!videos.length) {

        container.innerHTML =
          `
          <div class="empty-state">
            <h3>No videos yet</h3>
            <p>Be the first creator on DekhoEarn.</p>
          </div>
          `;

        return;
      }

      container.innerHTML =
        videos
          .map(
            video => {

              const thumb =
                video.thumbnail_url ||
                "";

              return `
                <article
                  class="video-card"
                  data-video-id="${video.id}"
                >

                  <div
                    class="video-card-thumb"
                    data-open-video="${video.id}"
                  >
                    ${
                      thumb
                        ? `
                          <img
                            src="${escapeHTML(thumb)}"
                            alt="${escapeHTML(video.title)}"
                            loading="lazy"
                          >
                        `
                        : `
                          <div class="video-placeholder">
                            ▶
                          </div>
                        `
                    }
                  </div>

                  <div class="video-card-body">

                    <h3>
                      ${escapeHTML(
                        video.title
                      )}
                    </h3>

                    <p>
                      ${escapeHTML(
                        video.name ||
                        video.username ||
                        "Creator"
                      )}
                    </p>

                    <div class="video-meta">
                      <span>
                        ${formatNumber(video.views)}
                        views
                      </span>

                      <span>
                        ${formatNumber(video.likes_count)}
                        likes
                      </span>
                    </div>

                  </div>

                </article>
              `;
            }
          )
          .join("");

      container
        .querySelectorAll(
          "[data-open-video]"
        )
        .forEach(
          el => {

            el.addEventListener(
              "click",
              () => {

                openVideo(
                  el.dataset.openVideo
                );
              }
            );
          }
        );

    } catch (e) {

      container.innerHTML =
        `
        <div class="empty-state">
          <h3>Feed load nahi hua</h3>
          <p>
            ${escapeHTML(
              e.message ||
              "Please try again."
            )}
          </p>
          <button
            type="button"
            id="retryFeedBtn"
          >
            Retry
          </button>
        </div>
        `;

      $("retryFeedBtn")
        ?.addEventListener(
          "click",
          loadFeed
        );
    }
  }

  /* ====================================================
     PLAYER
  ==================================================== */

  async function openVideo(
    id
  ) {

    stopWatchTimer();

    try {

      const data =
        await api(
          `/api/videos/${encodeURIComponent(id)}`
        );

      currentVideo =
        normalizeVideo(
          data.video
        );

      const player =
        $("mainVideo");

      if (player) {

        player.src =
          currentVideo.video_url;

        player.load();
      }

      const title =
        $("playerTitle");

      if (title) {
        title.textContent =
          currentVideo.title || "";
      }

      const description =
        $("playerDescription");

      if (description) {
        description.textContent =
          currentVideo.description || "";
      }

      const views =
        $("playerViews");

      if (views) {
        views.textContent =
          formatNumber(
            currentVideo.views
          );
      }

      const likes =
        $("playerLikes");

      if (likes) {
        likes.textContent =
          formatNumber(
            currentVideo.likes_count
          );
      }

      const comments =
        $("playerCommentsCount");

      if (comments) {
        comments.textContent =
          formatNumber(
            currentVideo.comments_count
          );
      }

      showPage(
        "playerSection"
      );

      await loadComments(
        currentVideo.id
      );

      watchSeconds = 0;

      startWatchTimer();

    } catch (e) {

      showMessage(
        e.message ||
        "Video load nahi hua.",
        "error"
      );
    }
  }

  function startWatchTimer() {

    stopWatchTimer();

    watchSeconds = 0;

    watchTimer =
      setInterval(
        () => {

          if (
            !currentVideo
          ) {
            return;
          }

          const video =
            $("mainVideo");

          if (
            video &&
            !video.paused &&
            !video.ended
          ) {

            watchSeconds++;

            if (
              watchSeconds >=
              MIN_WATCH_SECONDS
            ) {

              clearInterval(
                watchTimer
              );

              watchTimer = null;

              completeWatchReward();
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

      watchTimer = null;
    }
  }

  async function completeWatchReward() {

    if (!currentVideo) {
      return;
    }

    try {

      const data =
        await api(
          "/api/watch/complete",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                video_id:
                  currentVideo.id,

                watch_seconds:
                  watchSeconds
              })
          }
        );

      if (
        data.already_rewarded
      ) {
        return;
      }

      if (
        data.points
      ) {

        if (currentUser) {

          currentUser.points =
            number(
              currentUser.points
            ) +
            number(
              data.points
            );

          saveSession(
            getToken(),
            currentUser
          );
        }

        showMessage(
          `+${data.points} point earned!`,
          "success"
        );
      }

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

      } else {

        console.warn(
          "Watch reward:",
          e.message
        );
      }
    }
  }

  /* ====================================================
     LIKE
  ==================================================== */

  async function likeVideo() {

    if (!currentVideo) {
      return;
    }

    try {

      await ensureAuthenticated();

      const data =
        await api(
          `/api/videos/${currentVideo.id}/like`,
          {
            method:
              "POST"
          }
        );

      if (
        data.liked
      ) {

        currentVideo.likes_count++;

      } else {

        currentVideo.likes_count =
          Math.max(
            0,
            currentVideo.likes_count - 1
          );
      }

      const likes =
        $("playerLikes");

      if (likes) {
        likes.textContent =
          formatNumber(
            currentVideo.likes_count
          );
      }

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {
        clearSession();
        showAuthScreen();
      } else {
        showMessage(
          e.message ||
          "Like failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     FOLLOW
  ==================================================== */

  async function followCreator() {

    if (!currentVideo) {
      return;
    }

    try {

      await ensureAuthenticated();

      const creatorId =
        number(
          currentVideo.user_id
        );

      if (!creatorId) {
        return;
      }

      const data =
        await api(
          `/api/follow/${creatorId}`,
          {
            method:
              "POST"
          }
        );

      showMessage(
        data.following
          ? "Creator followed."
          : "Creator unfollowed.",
        "success"
      );

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Follow failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     REPORT
  ==================================================== */

  async function reportVideo() {

    if (!currentVideo) {
      return;
    }

    try {

      await ensureAuthenticated();

      const reason =
        window.prompt(
          "Report reason:"
        );

      if (!reason) {
        return;
      }

      const data =
        await api(
          `/api/videos/${currentVideo.id}/report`,
          {
            method:
              "POST",

            body:
              JSON.stringify({
                reason
              })
          }
        );

      showMessage(
        data.message ||
        "Report submitted.",
        "success"
      );

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Report failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     COMMENTS
  ==================================================== */

  async function loadComments(
    videoId
  ) {

    const list =
      $("commentsList");

    if (!list) {
      return;
    }

    list.innerHTML =
      `
      <div class="loading">
        Loading comments...
      </div>
      `;

    try {

      const data =
        await api(
          `/api/videos/${videoId}/comments`
        );

      const comments =
        Array.isArray(
          data.comments
        )
          ? data.comments
          : [];

      if (!comments.length) {

        list.innerHTML =
          `
          <div class="empty-state">
            No comments yet.
          </div>
          `;

        return;
      }

      list.innerHTML =
        comments
          .map(
            comment => `
              <div class="comment-item">

                <strong>
                  ${escapeHTML(
                    comment.name ||
                    comment.username ||
                    "User"
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
            `
          )
          .join("");

    } catch (e) {

      list.innerHTML =
        `
        <div class="empty-state">
          Comments load nahi hue.
        </div>
        `;
    }
  }

  async function addComment() {

    if (!currentVideo) {
      return;
    }

    const input =
      $("commentInput");

    const text =
      String(
        input?.value ||
        ""
      ).trim();

    if (!text) {
      return;
    }

    try {

      await ensureAuthenticated();

      await api(
        `/api/videos/${currentVideo.id}/comments`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              comment:
                text
            })
        }
      );

      if (input) {
        input.value = "";
      }

      await loadComments(
        currentVideo.id
      );

      showMessage(
        "Comment added.",
        "success"
      );

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Comment failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     DAILY REWARD
  ==================================================== */

  async function claimDailyReward() {

    try {

      await ensureAuthenticated();

      const button =
        $("dailyRewardBtn");

      if (button) {
        button.disabled =
          true;
      }

      const data =
        await api(
          "/api/rewards/daily",
          {
            method:
              "POST"
          }
        );

      if (
        data.already_claimed
      ) {

        showMessage(
          "Aaj ka reward already claim ho chuka hai.",
          "info"
        );

        return;
      }

      const earned =
        number(
          data.points
        );

      if (currentUser) {

        currentUser.points =
          number(
            currentUser.points
          ) +
          earned;

        saveSession(
          getToken(),
          currentUser
        );
      }

      showMessage(
        `Daily reward: +${earned} points`,
        "success"
      );

      await loadPointsHistory();

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Daily reward failed.",
          "error"
        );
      }

    } finally {

      const button =
        $("dailyRewardBtn");

      if (button) {
        button.disabled =
          false;
      }
    }
  }

  /* ====================================================
     REWARDED AD
  ==================================================== */

  async function claimRewardedAd() {

    try {

      await ensureAuthenticated();

      /*
       * This endpoint is intentionally kept as
       * the current app's reward endpoint.
       *
       * Real ad-network verification should be
       * connected before production monetization.
       */

      const data =
        await api(
          "/api/rewards/ad",
          {
            method:
              "POST"
          }
        );

      const earned =
        number(
          data.points
        );

      if (currentUser) {

        currentUser.points =
          number(
            currentUser.points
          ) +
          earned;

        saveSession(
          getToken(),
          currentUser
        );
      }

      showMessage(
        `Reward: +${earned} points`,
        "success"
      );

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Reward failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     POINTS HISTORY
  ==================================================== */

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

        container.innerHTML =
          `
          <div class="empty-state">
            No points history yet.
          </div>
          `;

        return;
      }

      container.innerHTML =
        history
          .map(
            item => {

              const amount =
                number(
                  item.amount
                );

              return `
                <div class="history-item">

                  <div>
                    <strong>
                      ${escapeHTML(
                        item.description ||
                        item.type ||
                        "Reward"
                      )}
                    </strong>

                    <small>
                      ${formatDate(
                        item.created_at
                      )}
                    </small>
                  </div>

                  <strong>
                    ${
                      amount >= 0
                        ? "+"
                        : ""
                    }${formatNumber(amount)}
                  </strong>

                </div>
              `;
            }
          )
          .join("");

    } catch (e) {

      container.innerHTML =
        `
        <div class="empty-state">
          Points history load nahi hui.
        </div>
        `;
    }
  }

  /* ====================================================
     WATCH HISTORY
  ==================================================== */

  async function loadWatchHistory() {

    const container =
      $("watchHistoryList");

    if (!container) {
      return;
    }

    try {

      const data =
        await api(
          "/api/watch/history"
        );

      const history =
        Array.isArray(
          data.history
        )
          ? data.history
          : [];

      if (!history.length) {

        container.innerHTML =
          `
          <div class="empty-state">
            No watch history yet.
          </div>
          `;

        return;
      }

      container.innerHTML =
        history
          .map(
            item => `
              <div class="history-item">

                <div>
                  <strong>
                    ${escapeHTML(
                      item.title
                    )}
                  </strong>

                  <small>
                    Watched:
                    ${formatDuration(
                      item.watch_seconds
                    )}
                  </small>
                </div>

                <span>
                  ${
                    item.reward_granted
                      ? "✓ Rewarded"
                      : ""
                  }
                </span>

              </div>
            `
          )
          .join("");

    } catch (e) {

      container.innerHTML =
        `
        <div class="empty-state">
          Watch history load nahi hui.
        </div>
        `;
    }
  }

  /* ====================================================
     CLOUDINARY UPLOAD
  ==================================================== */

  async function getCloudinarySignature() {

    await ensureAuthenticated();

    return api(
      "/api/cloudinary/signature",
      {
        timeout:
          30000
      }
    );
  }

  async function uploadToCloudinary(
    file
  ) {

    const signature =
      await getCloudinarySignature();

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
      String(
        signature.timestamp
      )
    );

    form.append(
      "signature",
      signature.signature
    );

    form.append(
      "folder",
      signature.folder
    );

    const endpoint =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        signature.cloud_name
      )}/video/upload`;

    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          body:
            form
        }
      );

    let data = {};

    try {
      data =
        await response.json();
    } catch {}

    if (!response.ok) {

      throw makeApiError(
        data?.error?.message ||
        "Cloudinary upload failed.",
        response.status,
        data
      );
    }

    return data;
  }

  async function saveUploadedVideo(
    cloudinary
  ) {

    await ensureAuthenticated();

    const title =
      String(
        $("videoTitle")?.value ||
        ""
      ).trim();

    const description =
      String(
        $("videoDescription")?.value ||
        ""
      ).trim();

    const duration =
      selectedVideoFile?._duration ||
      0;

    return api(
      "/api/videos",
      {
        method:
          "POST",

        body:
          JSON.stringify({
            title,

            description,

            video_url:
              cloudinary.secure_url ||
              cloudinary.url,

            cloudinary_public_id:
              cloudinary.public_id,

            cloudinary_resource_type:
              cloudinary.resource_type ||
              "video",

            thumbnail_url:
              cloudinary.secure_url
                ? cloudinary.secure_url
                    .replace(
                      "/upload/",
                      "/upload/so_0/"
                    )
                    .replace(
                      /\.[^/.]+$/,
                      ".jpg"
                    )
                : "",

            duration_seconds:
              Math.floor(
                duration
              )
          })
      }
    );
  }

  function updateUploadProgress(
    percent,
    text
  ) {

    const progress =
      $("uploadProgressPercent");

    const bar =
      $("uploadProgressBar");

    const label =
      $("uploadProgressText");

    if (progress) {
      progress.textContent =
        `${Math.round(percent)}%`;
    }

    if (bar) {
      bar.style.width =
        `${Math.max(
          0,
          Math.min(
            100,
            percent
          )
        )}%`;
    }

    if (label) {
      label.textContent =
        text || "Uploading...";
    }
  }

  async function uploadVideo() {

    if (uploadInProgress) {
      return;
    }

    try {

      await ensureAuthenticated();

      const file =
        selectedVideoFile ||
        $("videoFile")?.files?.[0];

      if (!file) {

        showMessage(
          "Video select karo.",
          "error"
        );

        return;
      }

      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {

        showMessage(
          "Video maximum 100 MB ka ho sakta hai.",
          "error"
        );

        return;
      }

      const title =
        String(
          $("videoTitle")?.value ||
          ""
        ).trim();

      if (!title) {

        showMessage(
          "Video title enter karo.",
          "error"
        );

        return;
      }

      uploadInProgress = true;

      const button =
        $("uploadVideoBtn");

      if (button) {
        button.disabled =
          true;
      }

      const progressBox =
        $("uploadProgressBox");

      if (progressBox) {
        progressBox.classList.remove(
          "hidden"
        );
      }

      updateUploadProgress(
        5,
        "Checking account..."
      );

      const cloudinary =
        await uploadToCloudinary(
          file
        );

      updateUploadProgress(
        85,
        "Saving video..."
      );

      await saveUploadedVideo(
        cloudinary
      );

      updateUploadProgress(
        100,
        "Upload complete"
      );

      showMessage(
        "Video successfully upload ho gaya.",
        "success"
      );

      if (
        $("videoTitle")
      ) {
        $("videoTitle").value =
          "";
      }

      if (
        $("videoDescription")
      ) {
        $("videoDescription").value =
          "";
      }

      if (
        $("videoFile")
      ) {
        $("videoFile").value =
          "";
      }

      if (
        $("videoFileName")
      ) {
        $("videoFileName").textContent =
          "";
      }

      selectedVideoFile =
        null;

      await refreshCurrentUser();

      await loadFeed();

    } catch (e) {

      console.error(
        "UPLOAD ERROR:",
        e
      );

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Video upload failed.",
          "error"
        );
      }

    } finally {

      uploadInProgress =
        false;

      const button =
        $("uploadVideoBtn");

      if (button) {
        button.disabled =
          false;
      }
    }
  }

  /* ====================================================
     MY VIDEOS
  ==================================================== */

  async function loadMyVideos() {

    const container =
      $("myVideosList");

    if (!container) {
      return;
    }

    try {

      await ensureAuthenticated();

      const data =
        await api(
          "/api/videos/mine"
        );

      const videos =
        Array.isArray(
          data.videos
        )
          ? data.videos
          : [];

      if (!videos.length) {

        container.innerHTML =
          `
          <div class="empty-state">
            You haven't uploaded any videos yet.
          </div>
          `;

        return;
      }

      container.innerHTML =
        videos
          .map(
            video => `
              <div class="history-item">

                <div>
                  <strong>
                    ${escapeHTML(
                      video.title
                    )}
                  </strong>

                  <small>
                    ${formatNumber(
                      video.views
                    )} views
                  </small>
                </div>

                <button
                  type="button"
                  class="delete-video-btn"
                  data-delete-video="${video.id}"
                >
                  Delete
                </button>

              </div>
            `
          )
          .join("");

      container
        .querySelectorAll(
          "[data-delete-video]"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () => {

                deleteVideo(
                  button.dataset.deleteVideo
                );
              }
            );
          }
        );

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        container.innerHTML =
          `
          <div class="empty-state">
            My videos load nahi hue.
          </div>
          `;
      }
    }
  }

  async function deleteVideo(
    id
  ) {

    if (
      !window.confirm(
        "Delete this video?"
      )
    ) {
      return;
    }

    try {

      await ensureAuthenticated();

      await api(
        `/api/videos/${id}`,
        {
          method:
            "DELETE"
        }
      );

      showMessage(
        "Video deleted.",
        "success"
      );

      await loadMyVideos();
      await loadFeed();

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Delete failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     CREATOR STATS
  ==================================================== */

  async function loadCreatorStats() {

    const container =
      $("creatorStats");

    if (!container) {
      return;
    }

    container.innerHTML =
      `
      <div class="loading">
        Loading creator stats...
      </div>
      `;

    try {

      await ensureAuthenticated();

      const data =
        await api(
          "/api/creator/stats"
        );

      const stats =
        data.stats ||
        data.data?.stats ||
        data.data ||
        data;

      container.innerHTML =
        `
        <div class="stats-grid">

          <div class="stat-card">
            <strong>
              ${formatNumber(
                stats.videos ||
                stats.total_videos ||
                0
              )}
            </strong>
            <span>Videos</span>
          </div>

          <div class="stat-card">
            <strong>
              ${formatNumber(
                stats.views ||
                0
              )}
            </strong>
            <span>Views</span>
          </div>

          <div class="stat-card">
            <strong>
              ${formatNumber(
                stats.followers ||
                currentUser?.followers_count ||
                0
              )}
            </strong>
            <span>Followers</span>
          </div>

          <div class="stat-card">
            <strong>
              ${formatNumber(
                stats.earnings ||
                0
              )}
            </strong>
            <span>Earnings</span>
          </div>

        </div>
        `;

    } catch (e) {

      console.error(
        "CREATOR STATS:",
        e
      );

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();

        showAuthScreen();

        return;
      }

      container.innerHTML =
        `
        <div class="empty-state">

          <h3>
            Creator stats load nahi hue.
          </h3>

          <p>
            ${escapeHTML(
              e.message ||
              "Please try again."
            )}
          </p>

          <button
            type="button"
            id="retryCreatorStatsBtn"
          >
            Retry
          </button>

        </div>
        `;

      $("retryCreatorStatsBtn")
        ?.addEventListener(
          "click",
          loadCreatorStats
        );
    }
  }

  /* ====================================================
     CREATOR APPLY
  ==================================================== */

  async function applyCreator() {

    try {

      await ensureAuthenticated();

      const data =
        await api(
          "/api/creator/apply",
          {
            method:
              "POST"
          }
        );

      showMessage(
        data.message ||
        "Creator application submitted.",
        "success"
      );

      await refreshCurrentUser();

    } catch (e) {

      if (
        e.status === 401 ||
        e.status === 403
      ) {

        clearSession();
        showAuthScreen();

      } else {

        showMessage(
          e.message ||
          "Creator application failed.",
          "error"
        );
      }
    }
  }

  /* ====================================================
     INSTALL
  ==================================================== */

  async function installApp() {

    if (
      !deferredInstallPrompt
    ) {

      showMessage(
        "Install option browser support par depend karta hai.",
        "info"
      );

      return;
    }

    try {

      deferredInstallPrompt.prompt();

      await deferredInstallPrompt.userChoice;

    } catch {}

    deferredInstallPrompt =
      null;
  }

  /* ====================================================
     FILE SELECT
  ==================================================== */

  function handleVideoFile() {

    const input =
      $("videoFile");

    const file =
      input?.files?.[0];

    if (!file) {
      return;
    }

    if (
      file.size >
      MAX_VIDEO_SIZE
    ) {

      showMessage(
        "Maximum video size 100 MB hai.",
        "error"
      );

      input.value =
        "";

      selectedVideoFile =
        null;

      return;
    }

    selectedVideoFile =
      file;

    const name =
      $("videoFileName");

    if (name) {
      name.textContent =
        file.name;
    }

    const preview =
      $("uploadPreview");

    const previewVideo =
      $("uploadPreviewVideo");

    if (
      previewVideo &&
      preview
    ) {

      previewVideo.src =
        URL.createObjectURL(
          file
        );

      preview.classList.remove(
        "hidden"
      );

      previewVideo.onloadedmetadata =
        () => {

          file._duration =
            Number(
              previewVideo.duration
            ) || 0;
        };
    }
  }

  /* ====================================================
     INITIAL APP DATA
  ==================================================== */

  async function initializeAppData() {

    updateUserUI();

    try {
      await refreshCurrentUser();
    } catch {}

    updateUserUI();

    await Promise.allSettled([
      loadFeed(),
      loadPointsHistory(),
      loadMyVideos()
    ]);
  }

  /* ====================================================
     AUTH INITIALIZATION
  ==================================================== */

  async function initializeAuth() {

    const query =
      new URLSearchParams(
        window.location.search
      );

    const resetToken =
      query.get(
        "reset_token"
      ) ||
      query.get(
        "token"
      );

    if (resetToken) {

      showResetPasswordBox(
        resetToken
      );

      return;
    }

    const saved =
      getSavedUser();

    if (
      getToken() &&
      saved
    ) {

      currentUser =
        saved;

      updateUserUI();

      showAppScreen();

      /*
       * Validate session in background.
       * If DB temporarily unavailable, don't
       * unnecessarily log the user out.
       */
      const user =
        await refreshCurrentUser();

      if (
        user ||
        currentUser
      ) {

        showAppScreen();

        await initializeAppData();

        return;
      }
    }

    showAuthScreen(
      "login"
    );
  }

  /* ====================================================
     EVENT BINDING
  ==================================================== */

  function bindEvents() {

    $("loginBtn")
      ?.addEventListener(
        "click",
        login
      );

    $("showRegisterBtn")
      ?.addEventListener(
        "click",
        showRegisterBox
      );

    $("showLoginBtn")
      ?.addEventListener(
        "click",
        showLoginBox
      );

    $("registerBtn")
      ?.addEventListener(
        "click",
        register
      );

    $("forgotPasswordBtn")
      ?.addEventListener(
        "click",
        showForgotPasswordBox
      );

    $("backToLoginFromForgotBtn")
      ?.addEventListener(
        "click",
        showLoginBox
      );

    $("forgotPasswordSubmitBtn")
      ?.addEventListener(
        "click",
        requestForgotPassword
      );

    $("backToLoginFromResetBtn")
      ?.addEventListener(
        "click",
        showLoginBox
      );

    $("resetPasswordSubmitBtn")
      ?.addEventListener(
        "click",
        resetPassword
      );

    $("logoutBtn")
      ?.addEventListener(
        "click",
        logout
      );

    $("refreshFeedBtn")
      ?.addEventListener(
        "click",
        loadFeed
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
        handleVideoFile
      );

    $("likeVideoBtn")
      ?.addEventListener(
        "click",
        likeVideo
      );

    $("followCreatorBtn")
      ?.addEventListener(
        "click",
        followCreator
      );

    $("reportVideoBtn")
      ?.addEventListener(
        "click",
        reportVideo
      );

    $("commentBtn")
      ?.addEventListener(
        "click",
        addComment
      );

    $("backFromPlayerBtn")
      ?.addEventListener(
        "click",
        () => {

          stopWatchTimer();

          const video =
            $("mainVideo");

          if (video) {

            video.pause();

            video.removeAttribute(
              "src"
            );

            video.load();
          }

          showPage(
            "homeSection"
          );
        }
      );

    $("myVideosBtn")
      ?.addEventListener(
        "click",
        () => {

          showPage(
            "profileSection"
          );

          loadMyVideos();
        }
      );

    $("creatorDashboardBtn")
      ?.addEventListener(
        "click",
        () => {

          showPage(
            "creatorSection"
          );

          loadCreatorStats();
        }
      );

    $("applyMonetizationBtn")
      ?.addEventListener(
        "click",
        applyCreator
      );

    $("installAppBtn")
      ?.addEventListener(
        "click",
        installApp
      );

    document
      .querySelectorAll(
        "[data-page]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              showPage(
                button.dataset.page
              );
            }
          );
        }
      );

    /*
     * Enter key.
     */

    $("loginPassword")
      ?.addEventListener(
        "keydown",
        e => {

          if (
            e.key === "Enter"
          ) {
            login();
          }
        }
      );

    $("loginUsername")
      ?.addEventListener(
        "keydown",
        e => {

          if (
            e.key === "Enter"
          ) {
            login();
          }
        }
      );

    $("commentInput")
      ?.addEventListener(
        "keydown",
        e => {

          if (
            e.key === "Enter" &&
            !e.shiftKey
          ) {

            e.preventDefault();

            addComment();
          }
        }
      );
  }

  /* ====================================================
     PWA
  ==================================================== */

  function initPWA() {

    window.addEventListener(
      "beforeinstallprompt",
      event => {

        event.preventDefault();

        deferredInstallPrompt =
          event;

        const button =
          $("installAppBtn");

        if (button) {
          button.classList.remove(
            "hidden"
          );
        }
      }
    );

    window.addEventListener(
      "appinstalled",
      () => {

        deferredInstallPrompt =
          null;

        showMessage(
          "DekhoEarn installed.",
          "success"
        );
      }
    );

    if (
      "serviceWorker" in
      navigator
    ) {

      window.addEventListener(
        "load",
        () => {

          navigator.serviceWorker
            .register(
              `/sw.js?v=${VERSION}`
            )
            .catch(
              error => {
                console.warn(
                  "Service worker:",
                  error
                );
              }
            );
        }
      );
    }
  }

  /* ====================================================
     INIT
  ==================================================== */

  async function init() {

    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();

    initPWA();

    await initializeAuth();
  }

  /* ====================================================
     GLOBAL COMPATIBILITY
  ==================================================== */

  window.DekhoEarn = {
    init,
    api,
    login,
    register,
    logout,
    loadFeed,
    uploadVideo,
    claimDailyReward,
    claimRewardedAd,
    loadCreatorStats,
    requestForgotPassword,
    resetPassword
  };

  window.DekhoEarnApp =
    window.DekhoEarn;

  /* ====================================================
     START
  ==================================================== */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();
  }

})();
