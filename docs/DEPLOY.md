# Putting NER Tower on GitHub Pages

The build is one self-contained `dist/index.html`, so Pages needs no special configuration and the
page works under any path (`https://<user>.github.io/<repo>/`). The workflow in
`.github/workflows/deploy.yml` builds and publishes it for you.

## One-time setup

1. **Push the repository to GitHub**, with `main` as the default branch. Make sure `worker/schema.sql`
   is committed: the tests read it, and the workflow runs the tests before it deploys.
2. **Turn Pages on:** repository **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. **Push to `main`** (or run the workflow by hand under **Actions > Deploy to GitHub Pages > Run workflow**).
4. When the run is green, the game is at `https://<user>.github.io/<repo>/`. The link is also shown on
   the run page and under Settings > Pages.

Every later push to `main` redeploys. A pull request only runs the tests and the build (`ci.yml`).

## Before the first public launch

- Run `npm run classic:pin` and paste the printed `classicHash` lines into `clirener-gold.ts` and
  `clirener-silver.ts`. Without them there is no Classic challenge. Commit, push.
- `npm run test:live` checks that Hugging Face still serves what the sources expect, including CORS.
- If you changed anything that affects towers, the lock test will have told you: follow
  [RULESET.md](RULESET.md) first, because after launch a change starts new boards.

## Optional: the leaderboard

Without it the game works fully; the leaderboard buttons simply do not appear.

1. Deploy the Worker: [worker/README.md](../worker/README.md). Note the URL it prints.
2. In the GitHub repository: **Settings > Secrets and variables > Actions > Variables > New repository
   variable**, name `LEADERBOARD_URL`, value the Worker URL (no trailing path).
3. Re-run the deploy workflow. The URL is baked into the build, so changing it needs a new deploy.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| The deploy job fails with "Get Pages site failed" or "not found" | Pages is not enabled yet: do step 2 above, then re-run the workflow. |
| Tests fail in the workflow but pass locally | `worker/schema.sql` or a CSS file is not committed, or Node is older than 22.12. |
| 404 right after the first deploy | Give it a minute; the first publish can take a short while. |
| The page loads but datasets do not | Open the browser console. A network error means Hugging Face was unreachable; the menu says so and the Demo dataset still works. |
| Leaderboard buttons missing | The build had no `LEADERBOARD_URL`: set the variable and redeploy. |

## Hosting somewhere else

`npm run build` and upload `dist/index.html` to any static host (Netlify, Cloudflare Pages, an S3
bucket, a static Hugging Face Space). It also runs straight from disk.
