# MinMay · Code-only public website seed

This is an **offline, freshly initialized Git repository** containing reviewed frontend code only. It is **not** the live MinMay repo, does not include the previous Git history, and has no Git remote or deployment.

The site is a D1/R2 member gallery frontend. Postcard data and original images are served only by the separately secured Cloudflare Worker; the website build ships neither index JSON nor photographs.

## Local build

```bash
npm ci --offline
VITE_PRIVATE_GALLERY_READY=true npm run build
node scripts/verify-code-only.mjs check-tree
node scripts/verify-code-only.mjs check-dist dist
node --test scripts/verify-code-only.test.mjs
```

The release workflow explicitly requires the new GitHub repository **Actions variable** `MINMAY_PRIVATE_GALLERY_ENABLED=true`. Unset, `false` and invalid values abort; the build requires `VITE_PRIVATE_GALLERY_READY=true` even outside CI. This repo intentionally contains **no legacy image cleanup / duplicate scan Actions**, no D1 schema/Worker secrets, no Android binary, no historical photos and no private user index.

Before any future same-slug remote replacement: separately coordinate old public repo archival, Pages path, App APK Release download / auto-update endpoints, signing lineage, member auth, D1/R2, old Pages caches, and any running old Actions. Nothing in this seed creates, renames, pushes, or archives a GitHub repo.
