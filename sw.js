/*
=========================================================
 DEKHOEARN SERVICE WORKER
 Version 3.1.1
 --------------------------------------------------------
 - Network-first app shell
 - API always network
 - Old cache cleanup
 - Cache-busted app.js/style.css
=========================================================
*/

"use strict";

const CACHE_NAME =
  "dekhoearn-shell-v3.1.1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css?v=3.1.1",
  "/app.js?v=3.1.1",
  "/manifest.json"
];

/* ======================================================
   INSTALL
====================================================== */

self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache => {
          return cache.addAll(APP_SHELL);
        })
        .then(() => {
          return self.skipWaiting();
        })
    );
  }
);

/* ======================================================
   ACTIVATE
====================================================== */

self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      caches
        .keys()
        .then(keys => {
          return Promise.all(
            keys
              .filter(key => {
                return key !== CACHE_NAME;
              })
              .map(key => {
                return caches.delete(key);
              })
          );
        })
        .then(() => {
          return self.clients.claim();
        })
    );
  }
);

/* ======================================================
   FETCH
====================================================== */

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;

    /* -----------------------------------------------
       Only GET requests are cached.
    ----------------------------------------------- */

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(request.url);

    /* -----------------------------------------------
       Ignore external domains.
    ----------------------------------------------- */

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

    /* -----------------------------------------------
       API REQUESTS
       Always use network.
       Never serve API from cache.
    ----------------------------------------------- */

    if (
      url.pathname.startsWith("/api/")
    ) {
      event.respondWith(
        fetch(request)
      );

      return;
    }

    /* -----------------------------------------------
       APP SHELL
       Network first.
       If network fails, use cache.
    ----------------------------------------------- */

    event.respondWith(

      fetch(request)

        .then(response => {

          if (
            response &&
            response.ok
          ) {

            const copy =
              response.clone();

            caches
              .open(CACHE_NAME)
              .then(cache => {

                cache.put(
                  request,
                  copy
                );

              })
              .catch(() => {
                /* Cache failure should
                   never break the app. */
              });
          }

          return response;
        })

        .catch(() => {

          return caches.match(
            request
          );

        })

    );
  }
);
