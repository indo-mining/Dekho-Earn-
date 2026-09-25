/*
=========================================================
 DEKHOEARN SERVICE WORKER
 Version 3.1.4 FINAL
 --------------------------------------------------------
 - Network-first app shell
 - API always network
 - Old cache cleanup
 - Cache-busted app.js / style.css
 - PWA offline fallback
 - Safe cache handling
=========================================================
*/

"use strict";

/* ======================================================
   VERSION
====================================================== */

const CACHE_NAME =
  "dekhoearn-shell-v3.1.4";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css?v=3.1.4",
  "/app.js?v=3.1.4",
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

          return cache.addAll(
            APP_SHELL
          );

        })

        .then(() => {

          return self.skipWaiting();

        })

        .catch(error => {

          console.error(
            "SERVICE WORKER INSTALL ERROR:",
            error
          );

          /*
          Do not prevent the service worker
          from activating if one optional
          shell resource fails.
          */

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

                return caches.delete(
                  key
                );

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
       Only GET requests.
    ----------------------------------------------- */

    if (
      request.method !== "GET"
    ) {
      return;
    }


    /* -----------------------------------------------
       Ignore unsupported request types.
    ----------------------------------------------- */

    if (
      request.mode === "navigate"
    ) {

      event.respondWith(
        handleNavigation(request)
      );

      return;
    }


    /* -----------------------------------------------
       URL
    ----------------------------------------------- */

    let url;

    try {

      url =
        new URL(
          request.url
        );

    } catch {

      return;

    }


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
       Always network.
       Never cache API responses.
    ----------------------------------------------- */

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


    /* -----------------------------------------------
       STATIC APP FILES
       Network first.
       Cache fallback.
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
              .open(
                CACHE_NAME
              )

              .then(cache => {

                return cache.put(
                  request,
                  copy
                );

              })

              .catch(() => {

                /*
                Cache failure must never
                break the application.
                */

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


/* ======================================================
   NAVIGATION HANDLER
====================================================== */

async function handleNavigation(
  request
) {

  try {

    /*
    Always try the latest index.html
    from the server first.
    */

    const response =
      await fetch(
        request
      );

    if (
      response &&
      response.ok
    ) {

      const copy =
        response.clone();

      caches
        .open(
          CACHE_NAME
        )
        .then(cache => {

          cache.put(
            "/",
            copy
          );

        })
        .catch(() => {});

      return response;

    }

  } catch {
    /*
    Network unavailable.
    Continue to cached version.
    */
  }


  /* -----------------------------------------------
     Offline fallback
  ----------------------------------------------- */

  const cached =
    await caches.match(
      request
    );

  if (cached) {

    return cached;

  }


  const cachedIndex =
    await caches.match(
      "/index.html"
    );

  if (cachedIndex) {

    return cachedIndex;

  }


  /*
  Last-resort offline response.
  */

  return new Response(
    `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >
        <title>DekhoEarn</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            background: #ffffff;
            color: #222222;
            text-align: center;
          }

          .box {
            padding: 24px;
          }

          h1 {
            margin-bottom: 10px;
          }

          p {
            color: #666666;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>DekhoEarn</h1>
          <p>
            Internet connection available nahi hai.
          </p>
          <p>
            Internet connect karke dobara try karein.
          </p>
        </div>
      </body>
      </html>
    `,
    {
      status: 503,
      headers: {
        "Content-Type":
          "text/html; charset=utf-8"
      }
    }
  );

}


/* ======================================================
   MESSAGE HANDLER
   Allows App.js to force-update the service worker.
====================================================== */

self.addEventListener(
  "message",
  event => {

    if (
      event.data &&
      event.data.type ===
        "SKIP_WAITING"
    ) {

      self.skipWaiting();

    }

  }
);
