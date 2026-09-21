/*
=========================================================
 DEKHOEARN SERVICE WORKER
 Version 3.1.0
=========================================================
*/

const CACHE_NAME =
  "dekhoearn-shell-v3";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
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
        .then(cache =>
          cache.addAll(
            APP_SHELL
          )
        )
        .then(() =>
          self.skipWaiting()
        )
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
        .then(keys =>
          Promise.all(
            keys
              .filter(
                key =>
                  key !==
                  CACHE_NAME
              )
              .map(key =>
                caches.delete(
                  key
                )
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )
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

    if (
      request.method !==
      "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

    /*
     API requests should always go
     to network first.
    */

    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {
      event.respondWith(
        fetch(request)
      );

      return;
    }

    /*
     App shell:
     network first so new deployments
     are picked up quickly.
    */

    event.respondWith(
      fetch(request)
        .then(response => {
          if (
            response.ok &&
            request.method ===
              "GET"
          ) {
            const copy =
              response.clone();

            caches
              .open(
                CACHE_NAME
              )
              .then(cache =>
                cache.put(
                  request,
                  copy
                )
              );
          }

          return response;
        })
        .catch(() =>
          caches.match(
            request
          )
        )
    );
  }
);
