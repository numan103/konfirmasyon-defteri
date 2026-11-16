# Vercel Blob client upload helper

`vercel-blob-upload.mjs` is a browser-only bundle built from the already installed
`@vercel/blob` 2.7.0 package, exported via `assets/podcast-upload-source.mjs`.
The SDK is Apache-2.0 licensed; the Apache-2.0 license text is distributed in
`lightweight-charts-5.0.9/LICENSE.txt` in this same vendor directory.
Upstream: https://github.com/vercel/storage/tree/main/packages/blob
Retained third-party notices are in `vercel-blob-upload.mjs.LEGAL.txt`.

Rebuild from the project root (no production dependency added):

    npm.cmd exec --yes --package=esbuild -- esbuild assets/podcast-upload-source.mjs --bundle --platform=browser --format=esm --minify --legal-comments=linked --outfile=assets/vendor/vercel-blob-upload.mjs

Only client upload code is bundled. Read/write storage keys are never embedded;
the browser receives a path-, MIME-, size- and time-constrained upload token
from the authenticated admin endpoint.
