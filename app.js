"use strict";

/*
=========================================================
 DEKHOEARN FRONTEND
 Version 4.0.0
 Compatible with:
 - DekhoEarn Server v4.0.1
 - Current index.html
 - Cloudinary direct signed video upload
 - Neon PostgreSQL API
 - Mobile / PWA
=========================================================
*/

(() => {

    /* =====================================================
       CONFIG
    ===================================================== */

    const API_BASE = "";

    const STORAGE = {
        token: "dekhoearn_auth_token",
        user: "dekhoearn_user",
        username: "dekhoearn_username",
        firstName: "dekhoearn_first_name"
    };

    const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
    const MIN_WATCH_SECONDS = 10;

    let currentUser = null;
    let currentVideo = null;

    let watchTimer = null;
    let watchedSeconds = 0;
    let watchRewardSent = false;

    let selectedVideoFile = null;
    let selectedVideoDuration = 0;
    let selectedVideoObjectUrl = null;

    let uploadInProgress = false;

    let deferredInstallPrompt = null;

    let initialized = false;


    /* =====================================================
       HELPERS
    ===================================================== */

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function number(value, fallback = 0) {

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }


    function formatNumber(value) {

        return number(value).toLocaleString("en-IN");
    }


    function formatDuration(seconds) {

        seconds = Math.max(0, Math.floor(number(seconds)));

        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;

        return `${minutes}:${String(secs).padStart(2, "0")}`;
    }


    function formatDate(value) {

        if (!value) return "";

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }


    function getToken() {

        return localStorage.getItem(STORAGE.token) || "";
    }


    function getSavedUser() {

        try {

            const raw = localStorage.getItem(STORAGE.user);

            return raw ? JSON.parse(raw) : null;

        } catch {

            return null;
        }
    }


    function saveSession(token, user) {

        if (token) {
            localStorage.setItem(STORAGE.token, token);
        }

        if (user) {

            localStorage.setItem(
                STORAGE.user,
                JSON.stringify(user)
            );

            if (user.username) {
                localStorage.setItem(
                    STORAGE.username,
                    user.username
                );
            }

            const firstName =
                user.name ||
                user.first_name ||
                user.firstName ||
                user.username ||
                "";

            if (firstName) {

                localStorage.setItem(
                    STORAGE.firstName,
                    firstName
                );
            }
        }
    }


    function clearSession() {

        Object.values(STORAGE).forEach(key => {
            localStorage.removeItem(key);
        });

        currentUser = null;
        currentVideo = null;
    }


    /* =====================================================
       TOAST
    ===================================================== */

    function showMessage(message, type = "info") {

        const toast = $("toast");

        if (!toast) {

            alert(message);

            return;
        }

        toast.textContent = message;

        toast.className = `toast ${type}`;

        toast.classList.add("show");

        clearTimeout(showMessage.timer);

        showMessage.timer = setTimeout(() => {

            toast.classList.remove("show");

        }, 3200);
    }


    /* =====================================================
       API
    ===================================================== */

    async function api(path, options = {}) {

        const headers = new Headers(
            options.headers || {}
        );

        const token = getToken();

        if (token) {

            headers.set(
                "Authorization",
                `Bearer ${token}`
            );

            headers.set(
                "x-auth-token",
                token
            );
        }

        if (
            options.body &&
            !(options.body instanceof FormData) &&
            !headers.has("Content-Type")
        ) {

            headers.set(
                "Content-Type",
                "application/json"
            );
        }

        const controller = new AbortController();

        const timeout = setTimeout(() => {

            controller.abort();

        }, options.timeout || 120000);

        try {

            const response = await fetch(
                API_BASE + path,
                {
                    ...options,
                    headers,
                    signal: controller.signal
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


            if (
                response.status === 401 ||
                response.status === 403
            ) {

                if (path !== "/api/auth/login" &&
                    path !== "/api/auth/register") {

                    clearSession();

                    showAuthScreen();
                }
            }


            if (!response.ok) {

                const message =
                    data.message ||
                    data.error ||
                    data.details ||
                    `Request failed (${response.status})`;

                const error = new Error(message);

                error.status = response.status;
                error.data = data;

                throw error;
            }

            return data;

        } catch (error) {

            if (error.name === "AbortError") {

                throw new Error(
                    "Request timeout. Please try again."
                );
            }

            throw error;

        } finally {

            clearTimeout(timeout);
        }
    }


    /* =====================================================
       AUTH SCREEN
    ===================================================== */

    function showAuthScreen() {

        const auth = $("authScreen");
        const app = $("appShell");

        if (auth) {
            auth.style.display = "";
        }

        if (app) {
            app.style.display = "none";
        }

        const loginBox = $("loginBox");
        const registerBox = $("registerBox");

        if (loginBox) {
            loginBox.style.display = "";
        }

        if (registerBox) {
            registerBox.style.display = "none";
        }
    }


    function showAppScreen() {

        const auth = $("authScreen");
        const app = $("appShell");

        if (auth) {
            auth.style.display = "none";
        }

        if (app) {
            app.style.display = "";
        }
    }


    function showLoginBox() {

        const loginBox = $("loginBox");
        const registerBox = $("registerBox");

        if (loginBox) {
            loginBox.style.display = "";
        }

        if (registerBox) {
            registerBox.style.display = "none";
        }
    }


    function showRegisterBox() {

        const loginBox = $("loginBox");
        const registerBox = $("registerBox");

        if (loginBox) {
            loginBox.style.display = "none";
        }

        if (registerBox) {
            registerBox.style.display = "";
        }
    }


    async function loginUser() {

        const username =
            $("loginUsername")?.value.trim();

        const password =
            $("loginPassword")?.value || "";


        if (!username) {

            showMessage(
                "Username enter karo.",
                "error"
            );

            $("loginUsername")?.focus();

            return;
        }


        if (!password) {

            showMessage(
                "Password enter karo.",
                "error"
            );

            $("loginPassword")?.focus();

            return;
        }


        const button = $("loginBtn");

        if (button) {
            button.disabled = true;
        }


        try {

            const data = await api(
                "/api/auth/login",
                {
                    method: "POST",
                    body: JSON.stringify({
                        username,
                        password
                    }),
                    timeout: 30000
                }
            );


            const token =
                data.token ||
                data.access_token ||
                data.session?.token ||
                data.data?.token;


            const user =
                data.user ||
                data.data?.user ||
                data.profile ||
                null;


            if (!token) {

                throw new Error(
                    "Login token server se nahi mila."
                );
            }


            saveSession(token, user);


            if (user) {
                currentUser = user;
            }


            showAppScreen();

            await refreshCurrentUser();

            showMessage(
                "Login successful.",
                "success"
            );

            await openPage("homeSection");


        } catch (error) {

            showMessage(
                error.message ||
                "Login failed.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    async function registerUser() {

        const name =
            $("registerName")?.value.trim();

        const username =
            $("registerUsername")?.value.trim();

        const password =
            $("registerPassword")?.value || "";

        const referral =
            $("registerReferral")?.value.trim() || "";


        if (!name) {

            showMessage(
                "Name enter karo.",
                "error"
            );

            $("registerName")?.focus();

            return;
        }


        if (!username) {

            showMessage(
                "Username enter karo.",
                "error"
            );

            $("registerUsername")?.focus();

            return;
        }


        if (!password) {

            showMessage(
                "Password enter karo.",
                "error"
            );

            $("registerPassword")?.focus();

            return;
        }


        if (password.length < 6) {

            showMessage(
                "Password kam se kam 6 characters ka rakho.",
                "error"
            );

            return;
        }


        const button = $("registerBtn");

        if (button) {
            button.disabled = true;
        }


        try {

            /*
             Server compatibility:
             name + first_name
             referral_code + ref
             Extra fields server ignore kar sakta hai.
            */

            const body = {
                name,
                first_name: name,
                username,
                password,
                email: "",
                referral_code: referral,
                ref: referral
            };


            const data = await api(
                "/api/auth/register",
                {
                    method: "POST",
                    body: JSON.stringify(body),
                    timeout: 30000
                }
            );


            const token =
                data.token ||
                data.access_token ||
                data.session?.token ||
                data.data?.token;


            const user =
                data.user ||
                data.data?.user ||
                data.profile ||
                null;


            if (token) {

                saveSession(token, user);

                currentUser = user;

                showAppScreen();

                await refreshCurrentUser();

                showMessage(
                    "Account successfully create ho gaya.",
                    "success"
                );

                await openPage("homeSection");

            } else {

                showLoginBox();

                if ($("loginUsername")) {
                    $("loginUsername").value = username;
                }

                showMessage(
                    "Account create ho gaya. Ab login karo.",
                    "success"
                );
            }


        } catch (error) {

            showMessage(
                error.message ||
                "Registration failed.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    async function refreshCurrentUser() {

        try {

            const data =
                await api("/api/auth/me", {
                    method: "GET",
                    timeout: 30000
                });


            const user =
                data.user ||
                data.data?.user ||
                data;


            if (user && user.id) {

                currentUser = user;

                saveSession(
                    getToken(),
                    user
                );

                updateUserUI(user);

                return user;
            }

        } catch (error) {

            /*
             If /me fails but local session exists,
             don't immediately destroy UI for temporary
             network errors.
            */

            if (
                error.status === 401 ||
                error.status === 403
            ) {

                clearSession();

                showAuthScreen();

                return null;
            }
        }


        const saved = getSavedUser();

        if (saved) {

            currentUser = saved;

            updateUserUI(saved);

            return saved;
        }

        return null;
    }


    async function logoutUser() {

        try {

            if (getToken()) {

                await api(
                    "/api/auth/logout",
                    {
                        method: "POST",
                        timeout: 15000
                    }
                );
            }

        } catch {

            /*
             Local logout should still happen even if
             server logout request fails.
            */
        }


        clearWatchTimer();

        clearSession();

        showAuthScreen();

        showMessage(
            "Logout ho gaya.",
            "success"
        );
    }


    /* =====================================================
       USER UI
    ===================================================== */

    function updateUserUI(user) {

        if (!user) return;


        const name =
            user.name ||
            user.first_name ||
            user.firstName ||
            user.username ||
            "User";


        const username =
            user.username ||
            "";


        const points =
            number(user.points);


        if ($("headerGreeting")) {

            $("headerGreeting").textContent =
                `Hi, ${name}`;
        }


        if ($("headerPoints")) {

            $("headerPoints").textContent =
                `${formatNumber(points)} Points`;
        }


        if ($("profileName")) {

            $("profileName").textContent =
                name;
        }


        if ($("profileUsername")) {

            $("profileUsername").textContent =
                username
                    ? `@${username}`
                    : "";
        }


        if ($("profilePoints")) {

            $("profilePoints").textContent =
                formatNumber(points);
        }


        if ($("profileVideos")) {

            $("profileVideos").textContent =
                formatNumber(
                    user.total_videos ||
                    user.videos_count ||
                    0
                );
        }


        if ($("profileEarned")) {

            $("profileEarned").textContent =
                formatNumber(
                    user.total_earned ||
                    user.earned_points ||
                    points
                );
        }
    }


    /* =====================================================
       NAVIGATION
    ===================================================== */

    const PAGE_IDS = [
        "homeSection",
        "watchSection",
        "playerSection",
        "earnSection",
        "uploadSection",
        "profileSection",
        "creatorSection"
    ];


    function hideAllPages() {

        PAGE_IDS.forEach(id => {

            const element = $(id);

            if (!element) return;

            element.style.display = "none";
        });
    }


    async function openPage(pageId) {

        hideAllPages();

        const page = $(pageId);

        if (!page) {

            showMessage(
                "Page nahi mili.",
                "error"
            );

            return;
        }


        page.style.display = "";


        document
            .querySelectorAll(".bottom-nav [data-page]")
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button.dataset.page === pageId
                );
            });


        if (pageId === "homeSection") {

            await loadVideos();
        }


        if (pageId === "watchSection") {

            await loadWatchHistory();
        }


        if (pageId === "earnSection") {

            await Promise.allSettled([
                loadPointsHistory(),
                updateRewardButtons()
            ]);
        }


        if (pageId === "profileSection") {

            await loadMyVideos();
        }


        if (pageId === "creatorSection") {

            await loadCreatorStats();
        }
    }


    function goToPlayer() {

        openPage("playerSection");
    }


    /* =====================================================
       VIDEO NORMALIZATION
    ===================================================== */

    function normalizeVideo(video) {

        if (!video) return null;


        return {

            id: video.id,

            title:
                video.title ||
                "Untitled video",

            description:
                video.description ||
                "",

            video_url:
                video.video_url ||
                video.url ||
                "",

            thumbnail_url:
                video.thumbnail_url ||
                video.thumbnail ||
                "",

            duration_seconds:
                number(
                    video.duration_seconds ||
                    video.duration ||
                    0
                ),

            views:
                number(
                    video.views ||
                    video.view_count ||
                    0
                ),

            likes:
                number(
                    video.likes_count ??
                    video.likes ??
                    0
                ),

            comments:
                number(
                    video.comments_count ??
                    video.comments ??
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
                video.creator_id ||
                video.user_id ||
                video.owner_id ||
                null,

            creator_name:
                video.creator_name ||
                video.user_name ||
                video.name ||
                "Creator",

            creator_username:
                video.creator_username ||
                video.username ||
                "",

            creator_avatar:
                video.creator_avatar ||
                video.avatar_url ||
                "",

            created_at:
                video.created_at ||
                video.createdAt ||
                ""
        };
    }


    /* =====================================================
       HOME FEED
    ===================================================== */

    async function loadVideos() {

        const feed = $("videoFeed");

        if (!feed) return;


        feed.innerHTML = `
            <div class="loading-state">
                Loading videos...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/videos",
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const rawVideos =
                Array.isArray(data)
                    ? data
                    : (
                        data.videos ||
                        data.data?.videos ||
                        data.items ||
                        data.data ||
                        []
                    );


            const videos =
                rawVideos
                    .map(normalizeVideo)
                    .filter(Boolean);


            renderVideoFeed(videos);


        } catch (error) {

            feed.innerHTML = `
                <div class="empty-state">
                    <h3>Videos load nahi hue</h3>
                    <p>${escapeHTML(error.message)}</p>
                    <button type="button" id="retryFeedButton">
                        Try Again
                    </button>
                </div>
            `;


            $("retryFeedButton")?.addEventListener(
                "click",
                loadVideos
            );
        }
    }


    function renderVideoFeed(videos) {

        const feed = $("videoFeed");

        if (!feed) return;


        if (!videos.length) {

            feed.innerHTML = `
                <div class="empty-state">
                    <h3>Abhi koi video nahi hai</h3>
                    <p>Sabse pehla video upload karo.</p>
                </div>
            `;

            return;
        }


        feed.innerHTML =
            videos.map(video => {

                const thumbnail =
                    video.thumbnail_url
                        ? `
                            <img
                                src="${escapeHTML(video.thumbnail_url)}"
                                alt=""
                                loading="lazy"
                            >
                        `
                        : `
                            <div class="video-placeholder">
                                ▶
                            </div>
                        `;


                return `
                    <article
                        class="video-card"
                        data-video-id="${escapeHTML(video.id)}"
                    >

                        <div class="video-card-media">
                            ${thumbnail}

                            <span class="video-duration">
                                ${formatDuration(video.duration_seconds)}
                            </span>
                        </div>

                        <div class="video-card-body">

                            <h3>
                                ${escapeHTML(video.title)}
                            </h3>

                            <p>
                                ${escapeHTML(
                                    video.creator_name
                                )}
                            </p>

                            <div class="video-card-meta">

                                <span>
                                    👁 ${formatNumber(video.views)}
                                </span>

                                <span>
                                    ❤️ ${formatNumber(video.likes)}
                                </span>

                            </div>

                        </div>

                    </article>
                `;

            }).join("");


        feed
            .querySelectorAll("[data-video-id]")
            .forEach(card => {

                card.addEventListener(
                    "click",
                    () => {

                        const id =
                            card.dataset.videoId;

                        openVideo(id);
                    }
                );
            });
    }


    /* =====================================================
       OPEN VIDEO
    ===================================================== */

    async function openVideo(videoId) {

        if (!videoId) return;


        try {

            const data =
                await api(
                    `/api/videos/${encodeURIComponent(videoId)}`,
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const raw =
                data.video ||
                data.data?.video ||
                data;


            const video =
                normalizeVideo(raw);


            if (!video || !video.id) {

                throw new Error(
                    "Video data nahi mila."
                );
            }


            currentVideo = video;

            renderPlayer(video);

            await openPage("playerSection");

            await loadComments(video.id);


        } catch (error) {

            showMessage(
                error.message ||
                "Video open nahi hua.",
                "error"
            );
        }
    }


    function renderPlayer(video) {

        const player = $("mainVideo");

        if (player) {

            clearWatchTimer();

            player.pause();

            player.src = video.video_url;

            if (video.thumbnail_url) {

                player.poster =
                    video.thumbnail_url;
            }

            player.load();
        }


        if ($("playerTitle")) {

            $("playerTitle").textContent =
                video.title;
        }


        if ($("playerDescription")) {

            $("playerDescription").textContent =
                video.description;
        }


        if ($("playerViews")) {

            $("playerViews").textContent =
                `${formatNumber(video.views)} views`;
        }


        updateLikeUI(video);

        updateFollowUI(video);


        if ($("playerCommentsCount")) {

            $("playerCommentsCount").textContent =
                formatNumber(video.comments);
        }


        watchedSeconds = 0;
        watchRewardSent = false;
    }


    /* =====================================================
       VIDEO WATCH REWARD
    ===================================================== */

    function startWatchTimer() {

        clearWatchTimer();


        if (!currentVideo) return;


        watchTimer = setInterval(
            async () => {

                const video =
                    $("mainVideo");

                if (!video) return;

                if (video.paused ||
                    video.ended) {
                    return;
                }


                watchedSeconds++;


                if (
                    watchedSeconds >=
                    MIN_WATCH_SECONDS &&
                    !watchRewardSent
                ) {

                    watchRewardSent = true;

                    await completeWatch();
                }

            },
            1000
        );
    }


    function clearWatchTimer() {

        if (watchTimer) {

            clearInterval(watchTimer);

            watchTimer = null;
        }
    }


    async function completeWatch() {

        if (!currentVideo) return;


        try {

            const data =
                await api(
                    "/api/watch/complete",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            video_id: currentVideo.id,
                            watched_seconds:
                                Math.max(
                                    MIN_WATCH_SECONDS,
                                    watchedSeconds
                                )
                        }),
                        timeout: 30000
                    }
                );


            const reward =
                number(
                    data.reward ??
                    data.points_earned ??
                    data.points ??
                    0
                );


            if (reward > 0) {

                showMessage(
                    `Watch complete! +${reward} points`,
                    "success"
                );

            } else {

                showMessage(
                    "Watch complete.",
                    "success"
                );
            }


            await refreshCurrentUser();


        } catch (error) {

            /*
             If reward was already claimed,
             don't repeatedly show an error.
            */

            if (
                !/already|duplicate|rewarded/i
                    .test(error.message || "")
            ) {

                showMessage(
                    error.message ||
                    "Watch reward process nahi hua.",
                    "error"
                );
            }
        }
    }


    /* =====================================================
       LIKE
    ===================================================== */

    function updateLikeUI(video) {

        const button =
            $("likeVideoBtn");

        if (!button || !video) return;


        const likes =
            formatNumber(video.likes);


        button.textContent =
            video.liked
                ? `❤️ ${likes}`
                : `♡ ${likes}`;
    }


    async function toggleLike() {

        if (!currentVideo) return;


        const button =
            $("likeVideoBtn");


        if (button) {
            button.disabled = true;
        }


        try {

            const data =
                await api(
                    `/api/videos/${encodeURIComponent(currentVideo.id)}/like`,
                    {
                        method: "POST",
                        timeout: 30000
                    }
                );


            const liked =
                Boolean(
                    data.liked ??
                    data.is_liked ??
                    !currentVideo.liked
                );


            currentVideo.liked = liked;


            currentVideo.likes =
                number(
                    data.likes_count ??
                    data.likes ??
                    (
                        liked
                            ? currentVideo.likes + 1
                            : Math.max(
                                0,
                                currentVideo.likes - 1
                            )
                    )
                );


            updateLikeUI(currentVideo);

        } catch (error) {

            showMessage(
                error.message ||
                "Like update nahi hua.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    /* =====================================================
       FOLLOW
    ===================================================== */

    function updateFollowUI(video) {

        const button =
            $("followCreatorBtn");

        if (!button || !video) return;


        if (!video.creator_id) {

            button.style.display = "none";

            return;
        }


        button.style.display = "";


        button.textContent =
            video.following
                ? "Following"
                : "Follow";
    }


    async function toggleFollow() {

        if (!currentVideo) return;


        if (!currentVideo.creator_id) {

            showMessage(
                "Creator information available nahi hai.",
                "error"
            );

            return;
        }


        const button =
            $("followCreatorBtn");


        if (button) {
            button.disabled = true;
        }


        try {

            const data =
                await api(
                    `/api/follow/${encodeURIComponent(
                        currentVideo.creator_id
                    )}`,
                    {
                        method: "POST",
                        timeout: 30000
                    }
                );


            currentVideo.following =
                Boolean(
                    data.following ??
                    data.is_following ??
                    !currentVideo.following
                );


            updateFollowUI(currentVideo);


        } catch (error) {

            showMessage(
                error.message ||
                "Follow update nahi hua.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    /* =====================================================
       REPORT
    ===================================================== */

    async function reportCurrentVideo() {

        if (!currentVideo) return;


        const confirmed =
            window.confirm(
                "Kya aap is video ko report karna chahte hain?"
            );


        if (!confirmed) return;


        try {

            await api(
                `/api/videos/${encodeURIComponent(
                    currentVideo.id
                )}/report`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        reason: "Reported by user"
                    }),
                    timeout: 30000
                }
            );


            showMessage(
                "Video report kar diya gaya.",
                "success"
            );


        } catch (error) {

            showMessage(
                error.message ||
                "Report submit nahi hua.",
                "error"
            );
        }
    }


    /* =====================================================
       COMMENTS
    ===================================================== */

    async function loadComments(videoId) {

        const list =
            $("commentsList");

        if (!list) return;


        list.innerHTML = `
            <div class="loading-state">
                Comments loading...
            </div>
        `;


        try {

            const data =
                await api(
                    `/api/videos/${encodeURIComponent(videoId)}/comments`,
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const rawComments =
                Array.isArray(data)
                    ? data
                    : (
                        data.comments ||
                        data.data?.comments ||
                        data.items ||
                        []
                    );


            renderComments(rawComments);


        } catch (error) {

            list.innerHTML = `
                <div class="empty-state">
                    Comments load nahi hue.
                </div>
            `;
        }
    }


    function renderComments(comments) {

        const list =
            $("commentsList");

        if (!list) return;


        if (!comments.length) {

            list.innerHTML = `
                <div class="empty-state">
                    Abhi koi comment nahi hai.
                </div>
            `;

            return;
        }


        list.innerHTML =
            comments.map(comment => {

                const name =
                    comment.user_name ||
                    comment.name ||
                    comment.username ||
                    "User";


                const text =
                    comment.comment ||
                    comment.text ||
                    comment.content ||
                    "";


                return `
                    <div class="comment-item">

                        <div class="comment-author">
                            ${escapeHTML(name)}
                        </div>

                        <div class="comment-text">
                            ${escapeHTML(text)}
                        </div>

                        <div class="comment-date">
                            ${escapeHTML(
                                formatDate(
                                    comment.created_at
                                )
                            )}
                        </div>

                    </div>
                `;

            }).join("");
    }


    async function addComment() {

        if (!currentVideo) return;


        const input =
            $("commentInput");


        if (!input) return;


        const text =
            input.value.trim();


        if (!text) {

            showMessage(
                "Comment likho.",
                "error"
            );

            input.focus();

            return;
        }


        const button =
            $("commentBtn");


        if (button) {
            button.disabled = true;
        }


        try {

            await api(
                `/api/videos/${encodeURIComponent(
                    currentVideo.id
                )}/comments`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        comment: text,
                        text
                    }),
                    timeout: 30000
                }
            );


            input.value = "";


            currentVideo.comments =
                number(
                    currentVideo.comments
                ) + 1;


            if ($("playerCommentsCount")) {

                $("playerCommentsCount").textContent =
                    formatNumber(
                        currentVideo.comments
                    );
            }


            await loadComments(
                currentVideo.id
            );


        } catch (error) {

            showMessage(
                error.message ||
                "Comment post nahi hua.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    /* =====================================================
       DAILY REWARD
    ===================================================== */

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
                        method: "POST",
                        timeout: 30000
                    }
                );


            const points =
                number(
                    data.points_earned ??
                    data.reward ??
                    data.points ??
                    0
                );


            showMessage(
                points
                    ? `Daily reward +${points} points`
                    : "Daily reward processed.",
                "success"
            );


            await refreshCurrentUser();

            await updateRewardButtons();


        } catch (error) {

            showMessage(
                error.message ||
                "Daily reward nahi mila.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    /* =====================================================
       REWARDED AD
    ===================================================== */

    async function claimRewardedAd() {

        const button =
            $("rewardedAdBtn");


        if (button) {
            button.disabled = true;
        }


        try {

            /*
             Server v4.0.1 rewards endpoint.
             Actual ad network integration can be
             connected later. Current button represents
             completed rewarded-ad action.
            */

            const data =
                await api(
                    "/api/rewards/ad",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            completed: true
                        }),
                        timeout: 30000
                    }
                );


            const points =
                number(
                    data.points_earned ??
                    data.reward ??
                    data.points ??
                    0
                );


            showMessage(
                points
                    ? `Rewarded ad complete! +${points} points`
                    : "Reward processed.",
                "success"
            );


            await refreshCurrentUser();


        } catch (error) {

            showMessage(
                error.message ||
                "Rewarded ad reward nahi mila.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    async function updateRewardButtons() {

        /*
         The server is authoritative for duplicate daily
         reward checks. Buttons remain enabled here unless
         server reports that the reward is already claimed.
        */

        return true;
    }


    /* =====================================================
       POINTS HISTORY
    ===================================================== */

    async function loadPointsHistory() {

        const container =
            $("pointsHistory");

        if (!container) return;


        container.innerHTML = `
            <div class="loading-state">
                Loading points history...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/points/history",
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const items =
                Array.isArray(data)
                    ? data
                    : (
                        data.history ||
                        data.items ||
                        data.data?.history ||
                        data.data ||
                        []
                    );


            if (!items.length) {

                container.innerHTML = `
                    <div class="empty-state">
                        Abhi points history nahi hai.
                    </div>
                `;

                return;
            }


            container.innerHTML =
                items.map(item => {

                    const points =
                        number(
                            item.points ??
                            item.amount ??
                            item.delta ??
                            0
                        );


                    const reason =
                        item.reason ||
                        item.description ||
                        item.type ||
                        "Points";


                    return `
                        <div class="history-item">

                            <div>
                                <strong>
                                    ${escapeHTML(reason)}
                                </strong>

                                <small>
                                    ${escapeHTML(
                                        formatDate(
                                            item.created_at
                                        )
                                    )}
                                </small>
                            </div>

                            <strong>
                                ${points >= 0 ? "+" : ""}
                                ${formatNumber(points)}
                            </strong>

                        </div>
                    `;

                }).join("");


        } catch (error) {

            container.innerHTML = `
                <div class="empty-state">
                    History load nahi hui.
                </div>
            `;
        }
    }


    /* =====================================================
       WATCH HISTORY
    ===================================================== */

    async function loadWatchHistory() {

        const container =
            $("watchHistoryList");

        if (!container) return;


        container.innerHTML = `
            <div class="loading-state">
                Loading watch history...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/watch/history",
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const items =
                Array.isArray(data)
                    ? data
                    : (
                        data.history ||
                        data.items ||
                        data.data?.history ||
                        data.data ||
                        []
                    );


            if (!items.length) {

                container.innerHTML = `
                    <div class="empty-state">
                        Abhi watch history nahi hai.
                    </div>
                `;

                return;
            }


            container.innerHTML =
                items.map(item => {

                    const video =
                        normalizeVideo(
                            item.video ||
                            item
                        );


                    const title =
                        video?.title ||
                        item.title ||
                        "Video";


                    return `
                        <div
                            class="history-item watch-history-item"
                            data-video-id="${escapeHTML(
                                video?.id ||
                                item.video_id ||
                                ""
                            )}"
                        >

                            <div>
                                <strong>
                                    ${escapeHTML(title)}
                                </strong>

                                <small>
                                    Watched:
                                    ${formatDuration(
                                        item.watched_seconds ||
                                        0
                                    )}
                                </small>
                            </div>

                            <span>▶</span>

                        </div>
                    `;

                }).join("");


            container
                .querySelectorAll("[data-video-id]")
                .forEach(item => {

                    item.addEventListener(
                        "click",
                        () => {

                            if (
                                item.dataset.videoId
                            ) {

                                openVideo(
                                    item.dataset.videoId
                                );
                            }
                        }
                    );
                });


        } catch (error) {

            container.innerHTML = `
                <div class="empty-state">
                    Watch history load nahi hui.
                </div>
            `;
        }
    }


    /* =====================================================
       CLOUDINARY SIGNATURE
    ===================================================== */

    async function getCloudinarySignature() {

        const data =
            await api(
                "/api/cloudinary/signature",
                {
                    method: "GET",
                    timeout: 30000
                }
            );


        return (
            data.data ||
            data
        );
    }


    /* =====================================================
       UPLOAD UI
    ===================================================== */

    function getUploadElements() {

        return {

            input:
                $("videoFile"),

            fileName:
                $("videoFileName"),

            preview:
                $("uploadPreview"),

            previewVideo:
                $("uploadPreviewVideo"),

            title:
                $("videoTitle"),

            description:
                $("videoDescription"),

            progressBox:
                $("uploadProgressBox"),

            progressText:
                $("uploadProgressText"),

            progressPercent:
                $("uploadProgressPercent"),

            progressBar:
                $("uploadProgressBar"),

            button:
                $("uploadVideoBtn")
        };
    }


    function setUploadProgress(percent, text) {

        const elements =
            getUploadElements();


        const safePercent =
            Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        number(percent)
                    )
                )
            );


        if (elements.progressBox) {

            elements.progressBox.style.display =
                "";
        }


        if (elements.progressText) {

            elements.progressText.textContent =
                text ||
                "Uploading...";
        }


        if (elements.progressPercent) {

            elements.progressPercent.textContent =
                `${safePercent}%`;
        }


        if (elements.progressBar) {

            elements.progressBar.style.width =
                `${safePercent}%`;

            elements.progressBar.setAttribute(
                "aria-valuenow",
                String(safePercent)
            );
        }
    }


    function hideUploadProgress() {

        const box =
            $("uploadProgressBox");

        if (box) {

            box.style.display =
                "none";
        }
    }


    function resetUploadForm() {

        const elements =
            getUploadElements();


        selectedVideoFile = null;
        selectedVideoDuration = 0;


        if (
            selectedVideoObjectUrl
        ) {

            URL.revokeObjectURL(
                selectedVideoObjectUrl
            );

            selectedVideoObjectUrl = null;
        }


        if (elements.input) {

            elements.input.value = "";
        }


        if (elements.fileName) {

            elements.fileName.textContent =
                "No video selected";
        }


        if (elements.title) {

            elements.title.value = "";
        }


        if (elements.description) {

            elements.description.value = "";
        }


        if (elements.previewVideo) {

            elements.previewVideo.pause();

            elements.previewVideo.removeAttribute(
                "src"
            );

            elements.previewVideo.load();
        }


        setUploadProgress(
            0,
            ""
        );

        hideUploadProgress();
    }


    function handleVideoFileChange() {

        const elements =
            getUploadElements();


        const file =
            elements.input?.files?.[0];


        if (!file) {

            selectedVideoFile = null;

            return;
        }


        if (
            !file.type ||
            !file.type.startsWith("video/")
        ) {

            elements.input.value = "";

            selectedVideoFile = null;

            showMessage(
                "Sirf video file select karo.",
                "error"
            );

            return;
        }


        if (file.size > MAX_VIDEO_SIZE) {

            elements.input.value = "";

            selectedVideoFile = null;

            showMessage(
                "Video maximum 100 MB ho sakta hai.",
                "error"
            );

            return;
        }


        selectedVideoFile = file;


        if (elements.fileName) {

            elements.fileName.textContent =
                `${file.name} • ${(
                    file.size /
                    1024 /
                    1024
                ).toFixed(1)} MB`;
        }


        if (
            selectedVideoObjectUrl
        ) {

            URL.revokeObjectURL(
                selectedVideoObjectUrl
            );
        }


        selectedVideoObjectUrl =
            URL.createObjectURL(file);


        if (elements.previewVideo) {

            elements.previewVideo.src =
                selectedVideoObjectUrl;

            elements.previewVideo.load();

            elements.previewVideo.style.display =
                "";
        }


        if (elements.preview) {

            elements.preview.style.display =
                "";
        }


        showMessage(
            "Video ready hai.",
            "success"
        );
    }


    function handlePreviewMetadata() {

        const video =
            $("uploadPreviewVideo");


        if (!video) return;


        if (
            Number.isFinite(
                video.duration
            ) &&
            video.duration > 0
        ) {

            selectedVideoDuration =
                video.duration;
        }
    }


    /* =====================================================
       CLOUDINARY UPLOAD
    ===================================================== */

    function uploadToCloudinary(
        file,
        signature
    ) {

        return new Promise(
            (resolve, reject) => {

                const cloudName =
                    signature.cloud_name;


                const apiKey =
                    signature.api_key;


                const timestamp =
                    signature.timestamp;


                const signed =
                    signature.signature;


                const folder =
                    signature.folder ||
                    "dekhoearn/videos";


                if (
                    !cloudName ||
                    !apiKey ||
                    !timestamp ||
                    !signed
                ) {

                    reject(
                        new Error(
                            "Cloudinary signature incomplete hai."
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
                    String(timestamp)
                );


                form.append(
                    "signature",
                    signed
                );


                form.append(
                    "folder",
                    folder
                );


                const xhr =
                    new XMLHttpRequest();


                xhr.open(
                    "POST",
                    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
                        cloudName
                    )}/video/upload`
                );


                xhr.timeout =
                    15 * 60 * 1000;


                xhr.upload.onprogress =
                    event => {

                        if (!event.lengthComputable) {
                            return;
                        }


                        const percent =
                            event.loaded /
                            event.total *
                            100;


                        /*
                         5% -> 90%
                        */

                        const overall =
                            5 +
                            (
                                percent * 0.85
                            );


                        setUploadProgress(
                            overall,
                            "Cloudinary par video upload ho rahi hai..."
                        );
                    };


                xhr.onload = () => {

                    let data = {};


                    try {

                        data =
                            xhr.responseText
                                ? JSON.parse(
                                    xhr.responseText
                                )
                                : {};

                    } catch {

                        reject(
                            new Error(
                                "Cloudinary response invalid hai."
                            )
                        );

                        return;
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
                            "Cloudinary network error."
                        )
                    );
                };


                xhr.ontimeout = () => {

                    reject(
                        new Error(
                            "Cloudinary upload timeout."
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


    /* =====================================================
       SAVE VIDEO METADATA
    ===================================================== */

    async function saveUploadedVideo(
        uploadData,
        title,
        description
    ) {

        const videoUrl =
            uploadData.secure_url ||
            uploadData.url;


        const publicId =
            uploadData.public_id;


        if (!videoUrl) {

            throw new Error(
                "Cloudinary video URL nahi mila."
            );
        }


        if (!publicId) {

            throw new Error(
                "Cloudinary public ID nahi mila."
            );
        }


        const cloudName =
            uploadData.cloud_name ||
            (
                await getCloudinarySignature()
            ).cloud_name;


        let thumbnailUrl = "";


        if (cloudName) {

            thumbnailUrl =
                `https://res.cloudinary.com/${encodeURIComponent(
                    cloudName
                )}/video/upload/so_0/${publicId}.jpg`;
        }


        const duration =
            number(
                uploadData.duration ||
                selectedVideoDuration ||
                0
            );


        const body = {

            title,

            description,

            video_url:
                videoUrl,

            cloudinary_public_id:
                publicId,

            cloudinary_resource_type:
                uploadData.resource_type ||
                "video",

            thumbnail_url:
                thumbnailUrl,

            duration_seconds:
                duration
        };


        return api(
            "/api/videos",
            {
                method: "POST",
                body: JSON.stringify(body),
                timeout: 30000
            }
        );
    }


    /* =====================================================
       MAIN UPLOAD
    ===================================================== */

    async function uploadVideo() {

        if (uploadInProgress) {
            return;
        }


        if (!getToken()) {

            showMessage(
                "Pehle login karo.",
                "error"
            );

            showAuthScreen();

            return;
        }


        const elements =
            getUploadElements();


        const file =
            selectedVideoFile ||
            elements.input?.files?.[0];


        const title =
            elements.title?.value.trim() ||
            "";


        const description =
            elements.description?.value.trim() ||
            "";


        if (!file) {

            showMessage(
                "Pehle video select karo.",
                "error"
            );

            return;
        }


        if (file.size > MAX_VIDEO_SIZE) {

            showMessage(
                "Video maximum 100 MB ho sakta hai.",
                "error"
            );

            return;
        }


        if (!title) {

            showMessage(
                "Video title enter karo.",
                "error"
            );

            elements.title?.focus();

            return;
        }


        uploadInProgress = true;


        if (elements.button) {

            elements.button.disabled = true;

            elements.button.dataset.oldText =
                elements.button.textContent;

            elements.button.textContent =
                "Uploading...";
        }


        try {

            setUploadProgress(
                2,
                "Upload prepare ho raha hai..."
            );


            const signature =
                await getCloudinarySignature();


            setUploadProgress(
                5,
                "Cloudinary upload start ho raha hai..."
            );


            const uploadData =
                await uploadToCloudinary(
                    file,
                    signature
                );


            setUploadProgress(
                92,
                "Video metadata save ho raha hai..."
            );


            await saveUploadedVideo(
                uploadData,
                title,
                description
            );


            setUploadProgress(
                100,
                "Video successfully publish ho gaya!"
            );


            showMessage(
                "Video successfully upload ho gaya! 🎉",
                "success"
            );


            await loadVideos();


            setTimeout(() => {

                resetUploadForm();

            }, 800);


            await openPage(
                "homeSection"
            );


        } catch (error) {

            console.error(
                "Upload error:",
                error
            );


            setUploadProgress(
                0,
                "Upload failed"
            );


            showMessage(
                error.message ||
                "Video upload failed.",
                "error"
            );


        } finally {

            uploadInProgress = false;


            if (elements.button) {

                elements.button.disabled =
                    false;

                elements.button.textContent =
                    elements.button.dataset.oldText ||
                    "Upload Video";
            }
        }
    }


    /* =====================================================
       MY VIDEOS
    ===================================================== */

    async function loadMyVideos() {

        const container =
            $("myVideosList");

        if (!container) return;


        container.innerHTML = `
            <div class="loading-state">
                Loading your videos...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/videos/mine",
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const raw =
                Array.isArray(data)
                    ? data
                    : (
                        data.videos ||
                        data.items ||
                        data.data?.videos ||
                        data.data ||
                        []
                    );


            const videos =
                raw
                    .map(normalizeVideo)
                    .filter(Boolean);


            if (!videos.length) {

                container.innerHTML = `
                    <div class="empty-state">
                        <h3>No uploaded videos</h3>
                        <p>Apna pehla video upload karo.</p>
                    </div>
                `;

                return;
            }


            container.innerHTML =
                videos.map(video => {

                    return `
                        <div class="my-video-item">

                            <div
                                class="my-video-main"
                                data-video-id="${escapeHTML(
                                    video.id
                                )}"
                            >

                                <strong>
                                    ${escapeHTML(video.title)}
                                </strong>

                                <small>
                                    👁 ${formatNumber(video.views)}
                                    &nbsp; ❤️ ${formatNumber(video.likes)}
                                </small>

                            </div>

                            <button
                                type="button"
                                class="delete-video-button"
                                data-delete-video="${escapeHTML(
                                    video.id
                                )}"
                            >
                                Delete
                            </button>

                        </div>
                    `;

                }).join("");


            container
                .querySelectorAll("[data-video-id]")
                .forEach(item => {

                    item.addEventListener(
                        "click",
                        () => {

                            openVideo(
                                item.dataset.videoId
                            );
                        }
                    );
                });


            container
                .querySelectorAll(
                    "[data-delete-video]"
                )
                .forEach(button => {

                    button.addEventListener(
                        "click",
                        event => {

                            event.stopPropagation();

                            deleteMyVideo(
                                button.dataset.deleteVideo
                            );
                        }
                    );
                });


        } catch (error) {

            container.innerHTML = `
                <div class="empty-state">
                    My videos load nahi hue.
                </div>
            `;
        }
    }


    async function deleteMyVideo(videoId) {

        if (!videoId) return;


        const confirmed =
            window.confirm(
                "Kya aap is video ko delete karna chahte hain?"
            );


        if (!confirmed) return;


        try {

            await api(
                `/api/videos/${encodeURIComponent(videoId)}`,
                {
                    method: "DELETE",
                    timeout: 30000
                }
            );


            showMessage(
                "Video delete ho gaya.",
                "success"
            );


            await loadMyVideos();

            await loadVideos();


        } catch (error) {

            showMessage(
                error.message ||
                "Video delete nahi hua.",
                "error"
            );
        }
    }


    /* =====================================================
       CREATOR DASHBOARD
    ===================================================== */

    async function loadCreatorStats() {

        const container =
            $("creatorStats");

        if (!container) return;


        container.innerHTML = `
            <div class="loading-state">
                Loading creator dashboard...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/creator/stats",
                    {
                        method: "GET",
                        timeout: 30000
                    }
                );


            const stats =
                data.stats ||
                data.data?.stats ||
                data;


            container.innerHTML = `

                <div class="creator-stat-grid">

                    <div class="creator-stat">
                        <strong>
                            ${formatNumber(
                                stats.videos ||
                                stats.total_videos ||
                                currentUser?.total_videos ||
                                0
                            )}
                        </strong>
                        <span>Videos</span>
                    </div>

                    <div class="creator-stat">
                        <strong>
                            ${formatNumber(
                                stats.views ||
                                stats.total_views ||
                                0
                            )}
                        </strong>
                        <span>Views</span>
                    </div>

                    <div class="creator-stat">
                        <strong>
                            ${formatNumber(
                                stats.followers ||
                                stats.followers_count ||
                                currentUser?.followers_count ||
                                0
                            )}
                        </strong>
                        <span>Followers</span>
                    </div>

                    <div class="creator-stat">
                        <strong>
                            ${formatNumber(
                                stats.earnings ||
                                stats.total_earnings ||
                                0
                            )}
                        </strong>
                        <span>Earnings</span>
                    </div>

                </div>

            `;


        } catch (error) {

            container.innerHTML = `
                <div class="empty-state">
                    Creator stats load nahi hue.
                </div>
            `;
        }
    }


    async function applyCreator() {

        const button =
            $("applyMonetizationBtn");


        if (button) {
            button.disabled = true;
        }


        try {

            const data =
                await api(
                    "/api/creator/apply",
                    {
                        method: "POST",
                        timeout: 30000
                    }
                );


            showMessage(
                data.message ||
                "Creator application submit ho gayi.",
                "success"
            );


            await refreshCurrentUser();

            await loadCreatorStats();


        } catch (error) {

            showMessage(
                error.message ||
                "Creator application submit nahi hui.",
                "error"
            );

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    /* =====================================================
       PWA INSTALL
    ===================================================== */

    function setupInstallPrompt() {

        window.addEventListener(
            "beforeinstallprompt",
            event => {

                event.preventDefault();

                deferredInstallPrompt =
                    event;


                const button =
                    $("installAppBtn");


                if (button) {

                    button.style.display =
                        "";
                }
            }
        );


        window.addEventListener(
            "appinstalled",
            () => {

                deferredInstallPrompt =
                    null;


                showMessage(
                    "DekhoEarn install ho gaya! 🎉",
                    "success"
                );
            }
        );
    }


    async function installApp() {

        if (!deferredInstallPrompt) {

            showMessage(
                "Install option browser menu se available ho sakta hai.",
                "info"
            );

            return;
        }


        try {

            await deferredInstallPrompt.prompt();


            const result =
                await deferredInstallPrompt.userChoice;


            if (
                result &&
                result.outcome === "accepted"
            ) {

                showMessage(
                    "DekhoEarn install ho raha hai.",
                    "success"
                );
            }


        } catch {

            showMessage(
                "Install prompt open nahi hua.",
                "error"
            );
        }


        deferredInstallPrompt = null;
    }


    /* =====================================================
       EVENT BINDING
    ===================================================== */

    function bindAuthEvents() {

        $("loginBtn")?.addEventListener(
            "click",
            loginUser
        );


        $("registerBtn")?.addEventListener(
            "click",
            registerUser
        );


        $("showRegisterBtn")?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                showRegisterBox();
            }
        );


        $("showLoginBtn")?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                showLoginBox();
            }
        );


        $("loginPassword")?.addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {

                    event.preventDefault();

                    loginUser();
                }
            }
        );


        $("loginUsername")?.addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {

                    event.preventDefault();

                    loginUser();
                }
            }
        );


        $("registerPassword")?.addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {

                    event.preventDefault();

                    registerUser();
                }
            }
        );
    }


    function bindNavigationEvents() {

        document
            .querySelectorAll(
                ".bottom-nav [data-page]"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        openPage(
                            button.dataset.page
                        );
                    }
                );
            });


        $("refreshFeedBtn")?.addEventListener(
            "click",
            loadVideos
        );


        $("backFromPlayerBtn")?.addEventListener(
            "click",
            () => {

                clearWatchTimer();

                openPage(
                    "homeSection"
                );
            }
        );


        $("watchHistoryList")?.addEventListener(
            "click",
            event => {

                const target =
                    event.target.closest(
                        "[data-video-id]"
                    );

                if (!target) return;

                openVideo(
                    target.dataset.videoId
                );
            }
        );
    }


    function bindPlayerEvents() {

        $("mainVideo")?.addEventListener(
            "play",
            startWatchTimer
        );


        $("mainVideo")?.addEventListener(
            "pause",
            clearWatchTimer
        );


        $("mainVideo")?.addEventListener(
            "ended",
            async () => {

                clearWatchTimer();


                if (
                    watchedSeconds >=
                    MIN_WATCH_SECONDS &&
                    !watchRewardSent
                ) {

                    watchRewardSent = true;

                    await completeWatch();
                }
            }
        );


        $("likeVideoBtn")?.addEventListener(
            "click",
            toggleLike
        );


        $("followCreatorBtn")?.addEventListener(
            "click",
            toggleFollow
        );


        $("reportVideoBtn")?.addEventListener(
            "click",
            reportCurrentVideo
        );


        $("commentBtn")?.addEventListener(
            "click",
            addComment
        );


        $("commentInput")?.addEventListener(
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


    function bindRewardEvents() {

        $("dailyRewardBtn")?.addEventListener(
            "click",
            claimDailyReward
        );


        $("rewardedAdBtn")?.addEventListener(
            "click",
            claimRewardedAd
        );
    }


    function bindUploadEvents() {

        $("videoFile")?.addEventListener(
            "change",
            handleVideoFileChange
        );


        $("uploadPreviewVideo")?.addEventListener(
            "loadedmetadata",
            handlePreviewMetadata
        );


        $("uploadVideoBtn")?.addEventListener(
            "click",
            uploadVideo
        );
    }


    function bindProfileEvents() {

        $("myVideosBtn")?.addEventListener(
            "click",
            async () => {

                await openPage(
                    "profileSection"
                );

                await loadMyVideos();
            }
        );


        $("creatorDashboardBtn")?.addEventListener(
            "click",
            () => {

                openPage(
                    "creatorSection"
                );
            }
        );


        $("installAppBtn")?.addEventListener(
            "click",
            installApp
        );


        $("logoutBtn")?.addEventListener(
            "click",
            logoutUser
        );


        $("applyMonetizationBtn")?.addEventListener(
            "click",
            applyCreator
        );
    }


    /* =====================================================
       KEYBOARD / PAGE EVENTS
    ===================================================== */

    function bindGlobalEvents() {

        document.addEventListener(
            "visibilitychange",
            () => {

                if (
                    document.hidden
                ) {

                    clearWatchTimer();
                } else {

                    const video =
                        $("mainVideo");

                    if (
                        video &&
                        !video.paused &&
                        !video.ended &&
                        currentVideo
                    ) {

                        startWatchTimer();
                    }
                }
            }
        );


        window.addEventListener(
            "pagehide",
            clearWatchTimer
        );


        window.addEventListener(
            "beforeunload",
            () => {

                if (
                    selectedVideoObjectUrl
                ) {

                    URL.revokeObjectURL(
                        selectedVideoObjectUrl
                    );
                }
            }
        );
    }


    /* =====================================================
       INITIAL AUTH
    ===================================================== */

    async function initializeAuth() {

        const token =
            getToken();


        if (!token) {

            showAuthScreen();

            return false;
        }


        const saved =
            getSavedUser();


        if (saved) {

            currentUser =
                saved;

            updateUserUI(
                saved
            );
        }


        showAppScreen();


        const user =
            await refreshCurrentUser();


        if (!user && !getToken()) {

            showAuthScreen();

            return false;
        }


        return true;
    }


    /* =====================================================
       INIT
    ===================================================== */

    async function init() {

        if (initialized) {
            return;
        }


        initialized = true;


        bindAuthEvents();

        bindNavigationEvents();

        bindPlayerEvents();

        bindRewardEvents();

        bindUploadEvents();

        bindProfileEvents();

        bindGlobalEvents();

        setupInstallPrompt();


        const loggedIn =
            await initializeAuth();


        if (!loggedIn) {
            return;
        }


        await openPage(
            "homeSection"
        );
    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.DekhoEarn = {

        init,

        loginUser,

        registerUser,

        logoutUser,

        loadVideos,

        openVideo,

        uploadVideo,

        loadMyVideos,

        claimDailyReward,

        claimRewardedAd,

        addComment,

        toggleLike,

        toggleFollow,

        installApp,

        openPage,

        refreshCurrentUser
    };


    /*
     Compatibility helpers.
    */

    window.openVideo =
        openVideo;

    window.uploadVideo =
        uploadVideo;

    window.loginUser =
        loginUser;

    window.registerUser =
        registerUser;

    window.logoutUser =
        logoutUser;


    /* =====================================================
       START
    ===================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once: true
            }
        );

    } else {

        init();
    }

})();
