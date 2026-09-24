"use strict";

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
 - Follow / Subscribe System
 - Daily Reward
 - Rewarded Ad Demo
 - Points History
 - Watch History
 - Gallery Video Upload
 - Cloudinary Signed Upload
 - Upload Progress
 - 100 MB Video Limit
 - My Videos
 - Creator Dashboard
 - Creator Monetization
 - Payout Account Foundation
 - PWA Install
 - Mobile Handling
=========================================================
*/

const API_BASE = "";

const STORAGE = {
    TOKEN: "dekhoearn_auth_token",
    USER: "dekhoearn_user",
    USERNAME: "dekhoearn_username",
    FIRST_NAME: "dekhoearn_first_name"
};

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MIN_WATCH_SECONDS = 10;

let currentUser = null;
let currentVideo = null;
let watchTimer = null;
let watchSeconds = 0;
let watchRewardSent = false;
let deferredPrompt = null;
let uploadInProgress = false;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
    return document.getElementById(id);
}

function qs(selector) {
    return document.querySelector(selector);
}

function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function escapeHTML(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeJSON(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getToken() {
    return localStorage.getItem(STORAGE.TOKEN) || "";
}

function saveToken(token) {
    if (token) {
        localStorage.setItem(STORAGE.TOKEN, token);
    } else {
        localStorage.removeItem(STORAGE.TOKEN);
    }
}

function saveUser(user) {
    if (!user) return;

    currentUser = user;

    localStorage.setItem(
        STORAGE.USER,
        JSON.stringify(user)
    );

    if (user.username) {
        localStorage.setItem(
            STORAGE.USERNAME,
            user.username
        );
    }

    if (user.first_name || user.name) {
        localStorage.setItem(
            STORAGE.FIRST_NAME,
            user.first_name || user.name
        );
    }
}

function loadSavedUser() {
    const raw = localStorage.getItem(STORAGE.USER);

    if (!raw) return null;

    const user = safeJSON(raw, null);

    if (user) {
        currentUser = user;
    }

    return user;
}

function clearSession() {
    currentUser = null;
    currentVideo = null;

    localStorage.removeItem(STORAGE.TOKEN);
    localStorage.removeItem(STORAGE.USER);
    localStorage.removeItem(STORAGE.USERNAME);
    localStorage.removeItem(STORAGE.FIRST_NAME);
}

function showMessage(message, type = "info") {
    const box =
        $("messageBox") ||
        $("toast") ||
        $("statusMessage");

    if (box) {
        box.textContent = message;
        box.className = `message ${type}`;
        box.style.display = "block";

        setTimeout(() => {
            box.style.display = "none";
        }, 3500);

        return;
    }

    alert(message);
}

function formatNumber(number) {
    const n = Number(number || 0);

    if (n >= 1000000) {
        return (n / 1000000).toFixed(1) + "M";
    }

    if (n >= 1000) {
        return (n / 1000).toFixed(1) + "K";
    }

    return String(n);
}

function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);

    if (h > 0) {
        return (
            String(h).padStart(2, "0") +
            ":" +
            String(m).padStart(2, "0") +
            ":" +
            String(s).padStart(2, "0")
        );
    }

    return (
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0")
    );
}

function formatDate(dateValue) {
    if (!dateValue) return "";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


/* ======================================================
   API
====================================================== */

async function api(path, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (
        options.body &&
        !(options.body instanceof FormData) &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] = "application/json";
    }

    const token = getToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers["x-auth-token"] = token;
    }

    const response = await fetch(
        API_BASE + path,
        {
            ...options,
            headers
        }
    );

    const text = await response.text();

    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {
            message: text
        };
    }

    if (!response.ok) {
        const error = new Error(
            data.message ||
            data.error ||
            `Request failed (${response.status})`
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}


/* ======================================================
   AUTH
====================================================== */

async function registerUser(username, firstName, email = "") {
    const data = await api(
        "/api/auth/register",
        {
            method: "POST",
            body: JSON.stringify({
                username,
                first_name: firstName,
                email
            })
        }
    );

    if (data.token) {
        saveToken(data.token);
    }

    const user =
        data.user ||
        data.account ||
        data;

    if (user) {
        saveUser(user);
    }

    return data;
}

async function loginUser(username, password = "") {
    const data = await api(
        "/api/auth/login",
        {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        }
    );

    if (data.token) {
        saveToken(data.token);
    }

    const user =
        data.user ||
        data.account ||
        data;

    if (user) {
        saveUser(user);
    }

    return data;
}

async function getCurrentUser() {
    if (!getToken()) {
        return null;
    }

    try {
        const data = await api("/api/auth/me");

        const user =
            data.user ||
            data.account ||
            data;

        if (user) {
            saveUser(user);
        }

        return user;
    } catch (error) {
        if (
            error.status === 401 ||
            error.status === 403
        ) {
            clearSession();
        }

        return null;
    }
}

async function logoutUser() {
    try {
        if (getToken()) {
            await api(
                "/api/auth/logout",
                {
                    method: "POST"
                }
            );
        }
    } catch {
        // Session is cleared locally even if server logout fails.
    }

    clearSession();

    showPage("home");
    updateUserUI();

    showMessage(
        "Logged out successfully.",
        "success"
    );
}


/* ======================================================
   USER CREATION / OLD COMPATIBILITY
====================================================== */

async function ensureUser() {
    if (getToken()) {
        const me = await getCurrentUser();

        if (me) {
            return me;
        }
    }

    const saved = loadSavedUser();

    if (saved) {
        return saved;
    }

    return null;
}

async function createUserFromLegacy(username, firstName) {
    const params = new URLSearchParams(
        window.location.search
    );

    const ref = params.get("ref");

    const data = await api(
        "/api/user",
        {
            method: "POST",
            body: JSON.stringify({
                username,
                first_name: firstName,
                ref
            })
        }
    );

    if (data.token) {
        saveToken(data.token);
    }

    const user =
        data.user ||
        data.account ||
        data;

    if (user) {
        saveUser(user);
    }

    return data;
}


/* ======================================================
   UI USER DATA
====================================================== */

function updateUserUI() {
    const user = currentUser;

    const name =
        user?.first_name ||
        user?.name ||
        user?.username ||
        "Guest";

    const username =
        user?.username ||
        "";

    const points =
        Number(
            user?.points ??
            user?.balance ??
            0
        );

    qsa(
        "[data-user-name], .user-name"
    ).forEach(el => {
        el.textContent = name;
    });

    qsa(
        "[data-username], .username"
    ).forEach(el => {
        el.textContent = username
            ? "@" + username
            : "";
    });

    qsa(
        "[data-points], .points-value"
    ).forEach(el => {
        el.textContent = formatNumber(points);
    });

    qsa(
        "[data-followers]"
    ).forEach(el => {
        el.textContent = formatNumber(
            user?.followers_count ||
            user?.followers ||
            0
        );
    });

    qsa(
        "[data-following]"
    ).forEach(el => {
        el.textContent = formatNumber(
            user?.following_count ||
            user?.following ||
            0
        );
    });

    const avatar =
        user?.avatar_url ||
        user?.avatar ||
        "";

    qsa(
        "[data-user-avatar], .user-avatar"
    ).forEach(el => {
        if (
            el.tagName === "IMG" &&
            avatar
        ) {
            el.src = avatar;
        }
    });
}


/* ======================================================
   PAGE NAVIGATION
====================================================== */

function showPage(pageName) {
    const pageMap = {
        home: [
            "homePage",
            "pageHome"
        ],
        watch: [
            "watchPage",
            "pageWatch"
        ],
        player: [
            "playerPage",
            "pagePlayer"
        ],
        earn: [
            "earnPage",
            "pageEarn"
        ],
        upload: [
            "uploadPage",
            "pageUpload"
        ],
        profile: [
            "profilePage",
            "pageProfile"
        ],
        creator: [
            "creatorPage",
            "pageCreator"
        ]
    };

    qsa(
        ".page, .app-page, [data-page]"
    ).forEach(page => {
        page.style.display = "none";
        page.classList.remove("active");
    });

    const ids =
        pageMap[pageName] ||
        [];

    let shown = false;

    for (const id of ids) {
        const page = $(id);

        if (page) {
            page.style.display = "block";
            page.classList.add("active");
            shown = true;
            break;
        }
    }

    const generic =
        document.querySelector(
            `[data-page="${pageName}"]`
        );

    if (generic) {
        generic.style.display = "block";
        generic.classList.add("active");
        shown = true;
    }

    if (!shown) {
        console.warn(
            "DekhoEarn page not found:",
            pageName
        );
    }

    qsa(
        "[data-nav]"
    ).forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.nav === pageName
        );
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (pageName === "home" ||
        pageName === "watch") {
        loadVideos();
    }

    if (pageName === "earn") {
        loadPointsHistory();
    }

    if (pageName === "profile") {
        loadWatchHistory();
        loadMyVideos();
    }

    if (pageName === "creator") {
        loadCreatorDashboard();
    }
}


/* ======================================================
   VIDEO NORMALIZATION
====================================================== */

function normalizeVideo(video) {
    if (!video) return null;

    return {
        ...video,

        id:
            video.id ??
            video.video_id,

        title:
            video.title ||
            "Untitled Video",

        description:
            video.description ||
            "",

        video_url:
            video.video_url ||
            video.url ||
            video.secure_url ||
            "",

        thumbnail_url:
            video.thumbnail_url ||
            video.thumbnail ||
            "",

        views:
            Number(
                video.views ??
                video.view_count ??
                0
            ),

        likes:
            Number(
                video.likes ??
                video.like_count ??
                0
            ),

        comments:
            Number(
                video.comments ??
                video.comment_count ??
                0
            ),

        liked:
            Boolean(
                video.liked ??
                video.is_liked ??
                false
            ),

        following:
            Boolean(
                video.following ??
                video.is_following ??
                false
            ),

        creator_id:
            video.creator_id ??
            video.user_id ??
            null,

        creator_name:
            video.creator_name ||
            video.username ||
            video.name ||
            "Creator",

        creator_username:
            video.creator_username ||
            video.username ||
            "",

        creator_avatar:
            video.creator_avatar ||
            video.avatar_url ||
            ""
    };
}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {
    const containers = [
        $("videoFeed"),
        $("videosContainer"),
        $("homeVideos"),
        $("feed")
    ].filter(Boolean);

    if (!containers.length) {
        return;
    }

    containers.forEach(container => {
        container.innerHTML =
            `<div class="loading">Loading videos...</div>`;
    });

    try {
        const data = await api(
            "/api/videos"
        );

        let videos =
            data.videos ||
            data.items ||
            data.data ||
            data;

        if (!Array.isArray(videos)) {
            videos = [];
        }

        videos =
            videos
                .map(normalizeVideo)
                .filter(Boolean);

        containers.forEach(container => {
            renderVideoFeed(
                container,
                videos
            );
        });
    } catch (error) {
        console.error(
            "VIDEO FEED ERROR:",
            error
        );

        containers.forEach(container => {
            container.innerHTML =
                `<div class="empty-state">
                    Unable to load videos.
                 </div>`;
        });
    }
}

function renderVideoFeed(container, videos) {
    if (!videos.length) {
        container.innerHTML =
            `<div class="empty-state">
                No videos available yet.
             </div>`;

        return;
    }

    container.innerHTML =
        videos
            .map(video => {
                const thumbnail =
                    video.thumbnail_url;

                return `
                <article
                    class="video-card"
                    data-video-id="${escapeHTML(video.id)}"
                    onclick="openVideo('${escapeHTML(video.id)}')"
                >
                    <div class="video-thumb">
                        ${
                            thumbnail
                            ? `
                                <img
                                    src="${escapeHTML(thumbnail)}"
                                    alt=""
                                    loading="lazy"
                                >
                            `
                            : `
                                <video
                                    src="${escapeHTML(video.video_url)}"
                                    muted
                                    preload="metadata"
                                ></video>
                            `
                        }

                        <span class="video-views">
                            ${formatNumber(video.views)} views
                        </span>
                    </div>

                    <div class="video-info">
                        <h3>
                            ${escapeHTML(video.title)}
                        </h3>

                        <div class="video-creator">
                            ${
                                video.creator_avatar
                                ? `
                                    <img
                                        src="${escapeHTML(video.creator_avatar)}"
                                        alt=""
                                    >
                                `
                                : ""
                            }

                            <span>
                                ${escapeHTML(
                                    video.creator_name
                                )}
                            </span>
                        </div>

                        <div class="video-stats">
                            <span>
                                ❤️ ${formatNumber(video.likes)}
                            </span>

                            <span>
                                💬 ${formatNumber(video.comments)}
                            </span>
                        </div>
                    </div>
                </article>
                `;
            })
            .join("");
}


/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(videoId) {
    stopWatchTimer();

    watchSeconds = 0;
    watchRewardSent = false;

    try {
        const data = await api(
            `/api/videos/${encodeURIComponent(videoId)}`
        );

        currentVideo =
            normalizeVideo(
                data.video ||
                data
            );

        if (!currentVideo) {
            throw new Error(
                "Video not found."
            );
        }

        showPage("player");

        renderPlayer(currentVideo);

    } catch (error) {
        console.error(
            "OPEN VIDEO ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to open video.",
            "error"
        );
    }
}

function renderPlayer(video) {
    const player =
        $("videoPlayer") ||
        $("playerVideo");

    const title =
        $("playerTitle");

    const description =
        $("playerDescription");

    const views =
        $("playerViews");

    const likes =
        $("playerLikes");

    const comments =
        $("playerComments");

    if (title) {
        title.textContent =
            video.title;
    }

    if (description) {
        description.textContent =
            video.description;
    }

    if (views) {
        views.textContent =
            formatNumber(video.views);
    }

    if (likes) {
        likes.textContent =
            formatNumber(video.likes);
    }

    if (comments) {
        comments.textContent =
            formatNumber(video.comments);
    }

    if (player) {
        player.pause();

        player.src =
            video.video_url;

        player.load();

        player.onplay = () => {
            startWatchTimer();
        };

        player.onpause = () => {
            stopWatchTimer();
        };

        player.onended = () => {
            stopWatchTimer();
        };
    }

    updateLikeButton(video);

    updateFollowButton(video);

    loadComments(video.id);
}


/* ======================================================
   WATCH REWARD
====================================================== */

function startWatchTimer() {
    if (watchTimer) {
        return;
    }

    watchTimer = setInterval(
        () => {
            watchSeconds++;

            updateWatchProgress();

            if (
                watchSeconds >= MIN_WATCH_SECONDS &&
                !watchRewardSent
            ) {
                completeWatchReward();
            }
        },
        1000
    );
}

function stopWatchTimer() {
    if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
    }
}

function updateWatchProgress() {
    const progress =
        $("watchProgress");

    if (progress) {
        const percentage =
            Math.min(
                100,
                (
                    watchSeconds /
                    MIN_WATCH_SECONDS
                ) * 100
            );

        progress.style.width =
            percentage + "%";
    }

    const counter =
        $("watchCounter");

    if (counter) {
        counter.textContent =
            `${Math.min(
                watchSeconds,
                MIN_WATCH_SECONDS
            )}/${MIN_WATCH_SECONDS}s`;
    }
}

async function completeWatchReward() {
    if (
        !currentVideo ||
        watchRewardSent
    ) {
        return;
    }

    watchRewardSent = true;

    try {
        const data = await api(
            "/api/watch/complete",
            {
                method: "POST",
                body: JSON.stringify({
                    video_id: currentVideo.id,
                    watch_seconds: watchSeconds
                })
            }
        );

        const reward =
            Number(
                data.points ??
                data.reward ??
                data.earned_points ??
                0
            );

        if (currentUser) {
            currentUser.points =
                Number(
                    currentUser.points || 0
                ) + reward;

            saveUser(currentUser);
            updateUserUI();
        }

        showMessage(
            reward > 0
                ? `🎉 You earned ${reward} point${reward === 1 ? "" : "s"}!`
                : (
                    data.message ||
                    "Watch reward processed."
                ),
            "success"
        );

    } catch (error) {
        console.error(
            "WATCH REWARD ERROR:",
            error
        );

        watchRewardSent = false;
    }
}


/* ======================================================
   LIKE / UNLIKE
====================================================== */

async function toggleLike() {
    if (!currentVideo) {
        return;
    }

    try {
        const data = await api(
            `/api/videos/${encodeURIComponent(
                currentVideo.id
            )}/like`,
            {
                method: "POST"
            }
        );

        currentVideo.liked =
            Boolean(
                data.liked ??
                data.is_liked ??
                !currentVideo.liked
            );

        currentVideo.likes =
            Number(
                data.likes ??
                data.like_count ??
                (
                    currentVideo.likes +
                    (
                        currentVideo.liked
                            ? 1
                            : -1
                    )
                )
            );

        updateLikeButton(
            currentVideo
        );

    } catch (error) {
        console.error(
            "LIKE ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to like video.",
            "error"
        );
    }
}

function updateLikeButton(video) {
    const buttons = [
        $("likeButton"),
        $("btnLike")
    ].filter(Boolean);

    buttons.forEach(button => {
        button.classList.toggle(
            "liked",
            Boolean(video.liked)
        );

        button.textContent =
            video.liked
                ? `❤️ ${formatNumber(video.likes)}`
                : `♡ ${formatNumber(video.likes)}`;
    });
}


/* ======================================================
   COMMENTS
====================================================== */

async function loadComments(videoId) {
    const container =
        $("commentsList") ||
        $("commentList");

    if (!container) {
        return;
    }

    container.innerHTML =
        `<div class="loading">
            Loading comments...
         </div>`;

    try {
        const data = await api(
            `/api/videos/${encodeURIComponent(videoId)}/comments`
        );

        let comments =
            data.comments ||
            data.items ||
            data.data ||
            data;

        if (!Array.isArray(comments)) {
            comments = [];
        }

        if (!comments.length) {
            container.innerHTML =
                `<div class="empty-state">
                    No comments yet.
                 </div>`;

            return;
        }

        container.innerHTML =
            comments
                .map(comment => `
                    <div class="comment-item">
                        <strong>
                            ${escapeHTML(
                                comment.username ||
                                comment.name ||
                                "User"
                            )}
                        </strong>

                        <p>
                            ${escapeHTML(
                                comment.comment ||
                                comment.text ||
                                ""
                            )}
                        </p>

                        <small>
                            ${formatDate(
                                comment.created_at
                            )}
                        </small>
                    </div>
                `)
                .join("");

    } catch (error) {
        console.error(
            "COMMENTS ERROR:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Unable to load comments.
             </div>`;
    }
}

async function addComment() {
    if (!currentVideo) {
        return;
    }

    const input =
        $("commentInput");

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (!text) {
        showMessage(
            "Please write a comment.",
            "error"
        );

        return;
    }

    try {
        await api(
            `/api/videos/${encodeURIComponent(
                currentVideo.id
            )}/comments`,
            {
                method: "POST",
                body: JSON.stringify({
                    comment: text
                })
            }
        );

        input.value = "";

        await loadComments(
            currentVideo.id
        );

        showMessage(
            "Comment added.",
            "success"
        );

    } catch (error) {
        console.error(
            "COMMENT ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to add comment.",
            "error"
        );
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
        prompt(
            "Why are you reporting this video?"
        );

    if (
        reason === null
    ) {
        return;
    }

    const cleanReason =
        reason.trim();

    if (!cleanReason) {
        showMessage(
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
                body: JSON.stringify({
                    reason: cleanReason
                })
            }
        );

        showMessage(
            "Report submitted.",
            "success"
        );

    } catch (error) {
        console.error(
            "REPORT ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to report video.",
            "error"
        );
    }
}


/* ======================================================
   FOLLOW / SUBSCRIBE
====================================================== */

async function toggleFollow() {
    if (!currentVideo) {
        return;
    }

    const creatorId =
        currentVideo.creator_id;

    if (!creatorId) {
        showMessage(
            "Creator information unavailable.",
            "error"
        );

        return;
    }

    try {
        const data = await api(
            `/api/follow/${encodeURIComponent(
                creatorId
            )}`,
            {
                method: "POST"
            }
        );

        currentVideo.following =
            Boolean(
                data.following ??
                data.is_following ??
                !currentVideo.following
            );

        updateFollowButton(
            currentVideo
        );

    } catch (error) {
        console.error(
            "FOLLOW ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to subscribe.",
            "error"
        );
    }
}

function updateFollowButton(video) {
    const buttons = [
        $("followButton"),
        $("subscribeButton"),
        $("btnFollow"),
        $("btnSubscribe")
    ].filter(Boolean);

    buttons.forEach(button => {
        button.classList.toggle(
            "following",
            Boolean(video.following)
        );

        button.textContent =
            video.following
                ? "✓ Subscribed"
                : "Subscribe";
    });
}


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDailyReward() {
    const buttons = [
        $("dailyRewardButton"),
        $("claimDailyButton")
    ].filter(Boolean);

    buttons.forEach(
        button => button.disabled = true
    );

    try {
        const data = await api(
            "/api/rewards/daily",
            {
                method: "POST"
            }
        );

        const points =
            Number(
                data.points ??
                data.reward ??
                data.earned_points ??
                10
            );

        if (currentUser) {
            currentUser.points =
                Number(
                    currentUser.points || 0
                ) + points;

            saveUser(currentUser);
            updateUserUI();
        }

        buttons.forEach(
            button => {
                button.textContent =
                    "✓ Claimed";
            }
        );

        showMessage(
            `🎁 You earned ${points} points!`,
            "success"
        );

    } catch (error) {
        buttons.forEach(
            button => button.disabled = false
        );

        console.error(
            "DAILY REWARD ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Daily reward unavailable.",
            "error"
        );
    }
}


/* ======================================================
   REWARDED AD DEMO
====================================================== */

async function claimRewardedAd() {
    const button =
        $("rewardedAdButton") ||
        $("rewardAdButton");

    if (button) {
        button.disabled = true;
    }

    try {
        const confirmed =
            confirm(
                "Watch the rewarded ad demo to earn points?"
            );

        if (!confirmed) {
            if (button) {
                button.disabled = false;
            }

            return;
        }

        const data = await api(
            "/api/rewards/ad",
            {
                method: "POST"
            }
        );

        const points =
            Number(
                data.points ??
                data.reward ??
                data.earned_points ??
                5
            );

        if (currentUser) {
            currentUser.points =
                Number(
                    currentUser.points || 0
                ) + points;

            saveUser(currentUser);
            updateUserUI();
        }

        showMessage(
            `🎁 You earned ${points} points!`,
            "success"
        );

    } catch (error) {
        console.error(
            "REWARDED AD ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Rewarded ad unavailable.",
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* ======================================================
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {
    const container =
        $("pointsHistory") ||
        $("historyList");

    if (!container) {
        return;
    }

    container.innerHTML =
        `<div class="loading">
            Loading points history...
         </div>`;

    try {
        const data = await api(
            "/api/points/history"
        );

        let history =
            data.history ||
            data.items ||
            data.data ||
            data;

        if (!Array.isArray(history)) {
            history = [];
        }

        if (!history.length) {
            container.innerHTML =
                `<div class="empty-state">
                    No points history yet.
                 </div>`;

            return;
        }

        container.innerHTML =
            history
                .map(item => {
                    const points =
                        Number(
                            item.points ??
                            item.amount ??
                            0
                        );

                    return `
                    <div class="history-item">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    item.reason ||
                                    item.description ||
                                    item.type ||
                                    "Reward"
                                )}
                            </strong>

                            <small>
                                ${formatDate(
                                    item.created_at ||
                                    item.date
                                )}
                            </small>
                        </div>

                        <strong>
                            +${points}
                        </strong>
                    </div>
                    `;
                })
                .join("");

    } catch (error) {
        console.error(
            "POINTS HISTORY ERROR:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Unable to load points history.
             </div>`;
    }
}


/* ======================================================
   WATCH HISTORY
====================================================== */

async function loadWatchHistory() {
    const container =
        $("watchHistory") ||
        $("watchHistoryList");

    if (!container) {
        return;
    }

    container.innerHTML =
        `<div class="loading">
            Loading watch history...
         </div>`;

    try {
        const data = await api(
            "/api/watch/history"
        );

        let history =
            data.history ||
            data.items ||
            data.data ||
            data;

        if (!Array.isArray(history)) {
            history = [];
        }

        if (!history.length) {
            container.innerHTML =
                `<div class="empty-state">
                    No watch history yet.
                 </div>`;

            return;
        }

        container.innerHTML =
            history
                .map(item => {
                    const video =
                        normalizeVideo(
                            item.video ||
                            item
                        );

                    return `
                    <div
                        class="history-video"
                        onclick="openVideo('${escapeHTML(
                            video.id
                        )}')"
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
                            : ""
                        }

                        <div>
                            <strong>
                                ${escapeHTML(
                                    video.title
                                )}
                            </strong>

                            <small>
                                Watched:
                                ${formatDuration(
                                    item.watch_seconds ||
                                    item.watched_seconds ||
                                    0
                                )}
                            </small>
                        </div>
                    </div>
                    `;
                })
                .join("");

    } catch (error) {
        console.error(
            "WATCH HISTORY ERROR:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Unable to load watch history.
             </div>`;
    }
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {
    const container =
        $("myVideos") ||
        $("myVideosList");

    if (!container) {
        return;
    }

    container.innerHTML =
        `<div class="loading">
            Loading your videos...
         </div>`;

    try {
        const data = await api(
            "/api/videos/mine"
        );

        let videos =
            data.videos ||
            data.items ||
            data.data ||
            data;

        if (!Array.isArray(videos)) {
            videos = [];
        }

        videos =
            videos
                .map(normalizeVideo)
                .filter(Boolean);

        if (!videos.length) {
            container.innerHTML =
                `<div class="empty-state">
                    You haven't uploaded any videos yet.
                 </div>`;

            return;
        }

        container.innerHTML =
            videos
                .map(video => `
                    <div class="my-video-item">
                        <div
                            class="my-video-info"
                            onclick="openVideo('${escapeHTML(
                                video.id
                            )}')"
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
                                : ""
                            }

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
                `)
                .join("");

    } catch (error) {
        console.error(
            "MY VIDEOS ERROR:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Unable to load your videos.
             </div>`;
    }
}

async function deleteMyVideo(videoId) {
    const confirmed =
        confirm(
            "Are you sure you want to delete this video?"
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

        showMessage(
            "Video deleted successfully.",
            "success"
        );

        await loadMyVideos();
        await loadVideos();

    } catch (error) {
        console.error(
            "DELETE VIDEO ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to delete video.",
            "error"
        );
    }
}


/* ======================================================
   CLOUDINARY SIGNED UPLOAD
====================================================== */

function getUploadElements() {
    return {
        input:
            $("videoFile") ||
            $("videoInput") ||
            $("galleryVideo"),

        title:
            $("videoTitle") ||
            $("uploadTitle"),

        description:
            $("videoDescription") ||
            $("uploadDescription"),

        preview:
            $("videoPreview") ||
            $("uploadPreview"),

        progress:
            $("uploadProgress"),

        progressText:
            $("uploadProgressText") ||
            $("uploadPercent"),

        button:
            $("uploadButton") ||
            $("publishVideoButton")
    };
}

function setupVideoPreview() {
    const {
        input,
        preview
    } = getUploadElements();

    if (!input) {
        return;
    }

    input.addEventListener(
        "change",
        () => {
            const file =
                input.files?.[0];

            if (!file) {
                return;
            }

            if (
                !file.type.startsWith(
                    "video/"
                )
            ) {
                input.value = "";

                showMessage(
                    "Please select a video file.",
                    "error"
                );

                return;
            }

            if (
                file.size >
                MAX_VIDEO_SIZE
            ) {
                input.value = "";

                showMessage(
                    "Maximum video size is 100 MB.",
                    "error"
                );

                return;
            }

            if (preview) {
                const url =
                    URL.createObjectURL(
                        file
                    );

                if (
                    preview.tagName ===
                    "VIDEO"
                ) {
                    preview.src = url;
                    preview.controls = true;
                    preview.style.display =
                        "block";
                } else {
                    preview.innerHTML = `
                        <video
                            src="${url}"
                            controls
                            playsinline
                        ></video>
                    `;

                    preview.style.display =
                        "block";
                }
            }
        }
    );
}

function updateUploadProgress(percent) {
    const {
        progress,
        progressText
    } = getUploadElements();

    const value =
        Math.max(
            0,
            Math.min(
                100,
                Number(percent || 0)
            )
        );

    if (progress) {
        if (
            progress.tagName ===
            "PROGRESS"
        ) {
            progress.value = value;
        } else {
            progress.style.width =
                value + "%";
        }
    }

    if (progressText) {
        progressText.textContent =
            `${Math.round(value)}%`;
    }
}

async function getCloudinarySignature() {
    return await api(
        "/api/cloudinary/signature"
    );
}

function uploadToCloudinary(
    file,
    signatureData,
    onProgress
) {
    return new Promise(
        (resolve, reject) => {
            const xhr =
                new XMLHttpRequest();

            const cloudName =
                signatureData.cloud_name ||
                signatureData.cloudName;

            const apiKey =
                signatureData.api_key ||
                signatureData.apiKey;

            const timestamp =
                signatureData.timestamp;

            const signature =
                signatureData.signature;

            const folder =
                signatureData.folder ||
                "";

            if (
                !cloudName ||
                !apiKey ||
                !timestamp ||
                !signature
            ) {
                reject(
                    new Error(
                        "Invalid Cloudinary signature response."
                    )
                );

                return;
            }

            const form =
                new FormData();

            form.append(
                "file",
                file
            );

            form.append(
                "api_key",
                apiKey
            );

            form.append(
                "timestamp",
                timestamp
            );

            form.append(
                "signature",
                signature
            );

            if (folder) {
                form.append(
                    "folder",
                    folder
                );
            }

            xhr.open(
                "POST",
                `https://api.cloudinary.com/v1_1/${encodeURIComponent(
                    cloudName
                )}/video/upload`
            );

            xhr.upload.onprogress =
                event => {
                    if (
                        event.lengthComputable
                    ) {
                        const percent =
                            (
                                event.loaded /
                                event.total
                            ) * 100;

                        onProgress(
                            percent
                        );
                    }
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
                            data.message ||
                            "Cloudinary upload failed."
                        )
                    );
                }
            };

            xhr.onerror = () => {
                reject(
                    new Error(
                        "Network error during upload."
                    )
                );
            };

            xhr.onabort = () => {
                reject(
                    new Error(
                        "Upload cancelled."
                    )
                );
            };

            xhr.send(form);
        }
    );
}


/* ======================================================
   SAVE VIDEO METADATA
====================================================== */

async function saveUploadedVideo(
    title,
    description,
    uploadData
) {
    const videoUrl =
        uploadData.secure_url ||
        uploadData.url;

    const publicId =
        uploadData.public_id;

    if (!videoUrl) {
        throw new Error(
            "Cloudinary did not return video URL."
        );
    }

    return await api(
        "/api/videos",
        {
            method: "POST",
            body: JSON.stringify({
                title,
                description,
                video_url: videoUrl,
                cloudinary_public_id:
                    publicId || null,
                resource_type:
                    uploadData.resource_type ||
                    "video"
            })
        }
    );
}


/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadVideo() {
    if (uploadInProgress) {
        return;
    }

    const {
        input,
        title,
        description,
        button
    } = getUploadElements();

    if (!input) {
        showMessage(
            "Video picker not found.",
            "error"
        );

        return;
    }

    const file =
        input.files?.[0];

    if (!file) {
        showMessage(
            "Please select a video.",
            "error"
        );

        return;
    }

    if (
        !file.type.startsWith(
            "video/"
        )
    ) {
        showMessage(
            "Please select a valid video file.",
            "error"
        );

        return;
    }

    if (
        file.size >
        MAX_VIDEO_SIZE
    ) {
        showMessage(
            "Maximum video size is 100 MB.",
            "error"
        );

        return;
    }

    const videoTitle =
        title?.value?.trim() ||
        "";

    const videoDescription =
        description?.value?.trim() ||
        "";

    if (!videoTitle) {
        showMessage(
            "Please enter a video title.",
            "error"
        );

        return;
    }

    uploadInProgress = true;

    if (button) {
        button.disabled = true;
        button.textContent =
            "Uploading...";
    }

    updateUploadProgress(0);

    try {
        /*
         * STEP 1:
         * Get signed Cloudinary upload data
         */
        const signatureData =
            await getCloudinarySignature();

        updateUploadProgress(5);

        /*
         * STEP 2:
         * Upload directly to Cloudinary
         */
        const uploadData =
            await uploadToCloudinary(
                file,
                signatureData,
                percent => {
                    /*
                     * Cloudinary upload = 5% to 90%
                     */
                    const total =
                        5 +
                        (
                            percent * 0.85
                        );

                    updateUploadProgress(
                        total
                    );
                }
            );

        updateUploadProgress(90);

        /*
         * STEP 3:
         * Save video metadata in Neon
         */
        await saveUploadedVideo(
            videoTitle,
            videoDescription,
            uploadData
        );

        updateUploadProgress(100);

        showMessage(
            "🎉 Video uploaded successfully!",
            "success"
        );

        input.value = "";

        const preview =
            getUploadElements()
                .preview;

        if (preview) {
            if (
                preview.tagName ===
                "VIDEO"
            ) {
                preview.removeAttribute(
                    "src"
                );

                preview.load();

                preview.style.display =
                    "none";
            } else {
                preview.innerHTML = "";
                preview.style.display =
                    "none";
            }
        }

        if (title) {
            title.value = "";
        }

        if (description) {
            description.value = "";
        }

        await loadVideos();
        await loadMyVideos();

        showPage("home");

    } catch (error) {
        console.error(
            "UPLOAD ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Network error during upload.",
            "error"
        );

    } finally {
        uploadInProgress = false;

        if (button) {
            button.disabled = false;
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
        $("creatorStats");

    if (!container) {
        return;
    }

    container.innerHTML =
        `<div class="loading">
            Loading creator dashboard...
         </div>`;

    try {
        const data = await api(
            "/api/creator/stats"
        );

        const stats =
            data.stats ||
            data.creator ||
            data;

        container.innerHTML = `
            <div class="creator-stat-grid">

                <div class="creator-stat">
                    <strong>
                        ${formatNumber(
                            stats.followers ||
                            stats.followers_count ||
                            0
                        )}
                    </strong>
                    <span>Followers</span>
                </div>

                <div class="creator-stat">
                    <strong>
                        ${formatNumber(
                            stats.videos ||
                            stats.total_videos ||
                            0
                        )}
                    </strong>
                    <span>Videos</span>
                </div>

                <div class="creator-stat">
                    <strong>
                        ${formatNumber(
                            stats.watch_hours ||
                            0
                        )}
                    </strong>
                    <span>Watch Hours</span>
                </div>

                <div class="creator-stat">
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

        updateCreatorEligibility(
            stats
        );

    } catch (error) {
        console.error(
            "CREATOR DASHBOARD ERROR:",
            error
        );

        container.innerHTML =
            `<div class="empty-state">
                Creator dashboard is not available yet.
             </div>`;
    }
}

function updateCreatorEligibility(stats) {
    const element =
        $("creatorEligibility");

    if (!element) {
        return;
    }

    const status =
        stats.creator_status ||
        stats.status ||
        currentUser?.creator_status ||
        "";

    const applied =
        stats.applied ??
        currentUser?.creator_applied ??
        false;

    element.textContent =
        status
            ? `Creator status: ${status}`
            : applied
                ? "Creator application submitted."
                : "Creator eligibility available.";
}


/* ======================================================
   CREATOR APPLICATION
====================================================== */

async function applyForCreator() {
    const button =
        $("creatorApplyButton");

    if (button) {
        button.disabled = true;
    }

    try {
        await api(
            "/api/creator/apply",
            {
                method: "POST"
            }
        );

        showMessage(
            "Creator application submitted.",
            "success"
        );

        await loadCreatorDashboard();

    } catch (error) {
        console.error(
            "CREATOR APPLY ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to submit creator application.",
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* ======================================================
   PAYOUT ACCOUNT FOUNDATION
====================================================== */

async function savePayoutAccount() {
    const name =
        $("payoutName")?.value?.trim() ||
        "";

    const accountNumber =
        $("payoutAccountNumber")?.value?.trim() ||
        "";

    const ifsc =
        $("payoutIFSC")?.value?.trim() ||
        "";

    if (
        !name ||
        !accountNumber ||
        !ifsc
    ) {
        showMessage(
            "Please fill all payout account fields.",
            "error"
        );

        return;
    }

    try {
        await api(
            "/api/creator/payout",
            {
                method: "POST",
                body: JSON.stringify({
                    account_name: name,
                    account_number:
                        accountNumber,
                    ifsc
                })
            }
        );

        showMessage(
            "Payout account saved.",
            "success"
        );

    } catch (error) {
        console.error(
            "PAYOUT ERROR:",
            error
        );

        showMessage(
            error.message ||
            "Unable to save payout account.",
            "error"
        );
    }
}


/* ======================================================
   PWA INSTALL
====================================================== */

window.addEventListener(
    "beforeinstallprompt",
    event => {
        event.preventDefault();

        deferredPrompt = event;

        qsa(
            "#installButton, [data-install]"
        ).forEach(button => {
            button.style.display =
                "block";
        });
    }
);

async function installApp() {
    if (!deferredPrompt) {
        showMessage(
            "Install option is not available right now.",
            "info"
        );

        return;
    }

    deferredPrompt.prompt();

    try {
        await deferredPrompt.userChoice;
    } catch {
        // Ignore install result errors.
    }

    deferredPrompt = null;

    qsa(
        "#installButton, [data-install]"
    ).forEach(button => {
        button.style.display =
            "none";
    });
}

window.addEventListener(
    "appinstalled",
    () => {
        deferredPrompt = null;

        qsa(
            "#installButton, [data-install]"
        ).forEach(button => {
            button.style.display =
                "none";
        });
    }
);


/* ======================================================
   EVENT BINDING
====================================================== */

function bindNavigation() {
    qsa(
        "[data-nav]"
    ).forEach(button => {
        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const page =
                    button.dataset.nav;

                if (page) {
                    showPage(page);
                }
            }
        );
    });

    const homeButtons = [
        "homeButton",
        "navHome"
    ];

    homeButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("home")
            );
        }
    });

    const watchButtons = [
        "watchButton",
        "navWatch"
    ];

    watchButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("watch")
            );
        }
    });

    const earnButtons = [
        "earnButton",
        "navEarn"
    ];

    earnButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("earn")
            );
        }
    });

    const uploadButtons = [
        "uploadNavButton",
        "navUpload"
    ];

    uploadButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("upload")
            );
        }
    });

    const profileButtons = [
        "profileButton",
        "navProfile"
    ];

    profileButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("profile")
            );
        }
    });

    const creatorButtons = [
        "creatorButton",
        "navCreator"
    ];

    creatorButtons.forEach(id => {
        const button = $(id);

        if (button) {
            button.addEventListener(
                "click",
                () => showPage("creator")
            );
        }
    });
}

function bindActions() {
    const likeButton =
        $("likeButton") ||
        $("btnLike");

    if (likeButton) {
        likeButton.addEventListener(
            "click",
            toggleLike
        );
    }

    const commentButton =
        $("commentButton") ||
        $("btnComment");

    if (commentButton) {
        commentButton.addEventListener(
            "click",
            addComment
        );
    }

    const reportButton =
        $("reportButton") ||
        $("btnReport");

    if (reportButton) {
        reportButton.addEventListener(
            "click",
            reportVideo
        );
    }

    const followButton =
        $("followButton") ||
        $("subscribeButton") ||
        $("btnFollow") ||
        $("btnSubscribe");

    if (followButton) {
        followButton.addEventListener(
            "click",
            toggleFollow
        );
    }

    const dailyButton =
        $("dailyRewardButton") ||
        $("claimDailyButton");

    if (dailyButton) {
        dailyButton.addEventListener(
            "click",
            claimDailyReward
        );
    }

    const adButton =
        $("rewardedAdButton") ||
        $("rewardAdButton");

    if (adButton) {
        adButton.addEventListener(
            "click",
            claimRewardedAd
        );
    }

    const uploadButton =
        $("uploadButton") ||
        $("publishVideoButton");

    if (uploadButton) {
        uploadButton.addEventListener(
            "click",
            uploadVideo
        );
    }

    const creatorApply =
        $("creatorApplyButton");

    if (creatorApply) {
        creatorApply.addEventListener(
            "click",
            applyForCreator
        );
    }

    const payoutButton =
        $("savePayoutButton");

    if (payoutButton) {
        payoutButton.addEventListener(
            "click",
            savePayoutAccount
        );
    }

    const installButton =
        $("installButton");

    if (installButton) {
        installButton.addEventListener(
            "click",
            installApp
        );
    }

    const logoutButton =
        $("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            logoutUser
        );
    }
}


/* ======================================================
   AUTH FORM
====================================================== */

function bindAuthForm() {
    const form =
        $("authForm") ||
        $("loginForm");

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const username =
                $("username")?.value?.trim() ||
                $("loginUsername")?.value?.trim() ||
                "";

            const firstName =
                $("firstName")?.value?.trim() ||
                $("first_name")?.value?.trim() ||
                "";

            const email =
                $("email")?.value?.trim() ||
                "";

            const password =
                $("password")?.value ||
                "";

            if (!username) {
                showMessage(
                    "Please enter username.",
                    "error"
                );

                return;
            }

            try {
                let data;

                if (
                    password
                ) {
                    data =
                        await loginUser(
                            username,
                            password
                        );
                } else {
                    data =
                        await registerUser(
                            username,
                            firstName ||
                            username,
                            email
                        );
                }

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

                updateUserUI();

                showMessage(
                    "Welcome to DekhoEarn!",
                    "success"
                );

                showPage("home");

                await loadVideos();

            } catch (error) {
                console.error(
                    "AUTH ERROR:",
                    error
                );

                showMessage(
                    error.message ||
                    "Authentication failed.",
                    "error"
                );
            }
        }
    );
}


/* ======================================================
   SEARCH
====================================================== */

function setupSearch() {
    const input =
        $("searchInput");

    if (!input) {
        return;
    }

    let timeout;

    input.addEventListener(
        "input",
        () => {
            clearTimeout(timeout);

            timeout =
                setTimeout(
                    () => {
                        filterVisibleVideos(
                            input.value
                        );
                    },
                    250
                );
        }
    );
}

function filterVisibleVideos(query) {
    const value =
        String(
            query || ""
        )
            .trim()
            .toLowerCase();

    qsa(
        ".video-card"
    ).forEach(card => {
        const text =
            card.textContent
                .toLowerCase();

        card.style.display =
            !value ||
            text.includes(value)
                ? ""
                : "none";
    });
}


/* ======================================================
   MOBILE
====================================================== */

function setupMobileHandling() {
    document.body.classList.add(
        "dekhoearn-mobile-ready"
    );

    qsa("video").forEach(
        video => {
            video.setAttribute(
                "playsinline",
                ""
            );

            video.setAttribute(
                "webkit-playsinline",
                ""
            );
        }
    );
}


/* ======================================================
   ONLINE / OFFLINE
====================================================== */

function setupNetworkHandling() {
    window.addEventListener(
        "offline",
        () => {
            showMessage(
                "You are offline.",
                "error"
            );
        }
    );

    window.addEventListener(
        "online",
        () => {
            showMessage(
                "Internet connection restored.",
                "success"
            );

            loadVideos();
        }
    );
}


/* ======================================================
   SERVICE WORKER
====================================================== */

function registerServiceWorker() {
    if (
        "serviceWorker" in navigator
    ) {
        window.addEventListener(
            "load",
            () => {
                navigator.serviceWorker
                    .register(
                        "./sw.js"
                    )
                    .catch(
                        error => {
                            console.warn(
                                "Service worker registration failed:",
                                error
                            );
                        }
                    );
            }
        );
    }
}


/* ======================================================
   APP INITIALIZATION
====================================================== */

async function initApp() {
    console.log(
        "DekhoEarn Frontend v3.1.4 starting..."
    );

    loadSavedUser();

    bindNavigation();
    bindActions();
    bindAuthForm();

    setupVideoPreview();
    setupSearch();
    setupMobileHandling();
    setupNetworkHandling();

    registerServiceWorker();

    updateUserUI();

    const user =
        await ensureUser();

    if (user) {
        saveUser(user);
        updateUserUI();
    }

    showPage("home");

    await loadVideos();

    console.log(
        "DekhoEarn Frontend v3.1.4 ready."
    );
}


/* ======================================================
   GLOBAL FUNCTIONS
====================================================== */

window.showPage =
    showPage;

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

window.uploadVideo =
    uploadVideo;

window.deleteMyVideo =
    deleteMyVideo;

window.applyForCreator =
    applyForCreator;

window.savePayoutAccount =
    savePayoutAccount;

window.installApp =
    installApp;

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
        initApp
    );
} else {
    initApp();
}
