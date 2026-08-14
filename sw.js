const CACHE_NAME = "yangma-diary-v2";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.webmanifest",
    "./icons/icon-120.png",
    "./icons/icon-152.png",
    "./icons/icon-167.png",
    "./icons/icon-180.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener(
    "install",
    event => {

        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(
                    cache =>
                        cache.addAll(APP_FILES)
                )
        );

    }
);

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(
            caches.keys()
                .then(
                    keys =>
                        Promise.all(
                            keys
                                .filter(
                                    key =>
                                        key !== CACHE_NAME
                                )
                                .map(
                                    key =>
                                        caches.delete(key)
                                )
                        )
                )
        );

    }
);

self.addEventListener(
    "fetch",
    event => {

        if (
            event.request.method !== "GET"
        ) {

            return;

        }


        event.respondWith(
            caches.match(event.request)
                .then(
                    cached =>
                        cached ||
                        fetch(event.request)
                )
        );

    }
);
