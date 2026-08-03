# Releasing bepebl

npm publish requires WebAuthn/passkey 2FA approval on this account, so releases
are manual — there's no CI publish step. Follow this checklist every time.

1. Land your changes on `main` (PR or direct commit), CI (`pebl-ci.yml`) green.
2. From `packages/pebl/`, bump the version:
   ```
   npm version <patch|minor|major>
   ```
   This updates `package.json` + `package-lock.json` and creates a local git
   commit + tag (`vX.Y.Z`) automatically.
3. Sanity-check before publishing:
   ```
   npm run build
   npm test
   npm publish --dry-run --access public
   ```
   Read the dry-run tarball contents — confirm `bin`, `dist/cli.js`, and
   version look right. (We shipped a bug once where a leading `./` in `bin`
   made npm silently drop the `pebl` command — the dry-run output is what
   catches that.)
4. Publish for real:
   ```
   npm publish --access public
   ```
   This will prompt for a passkey/Touch ID approval in the browser — approve
   it there, not with `--otp`.
5. Push the commit and tag from step 2:
   ```
   git push origin main
   git push origin vX.Y.Z
   ```
6. Verify the published package works from a clean install:
   ```
   npx --yes bepebl@latest --version
   npx --yes bepebl@latest doctor
   ```

GitHub and npm should always point at the same commit after this — if `git
log` and `npm view bepebl version` disagree, something in this checklist was
skipped.
