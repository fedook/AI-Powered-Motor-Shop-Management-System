# Distribution checklist

## 1. Create the archive

```powershell
cd "C:\AI-Powered Motor Shop Management System"
powershell -ExecutionPolicy Bypass -File scripts/create-distribution.ps1
```

The script writes `distribution/AI-Motor-Shop-BA-<timestamp>.zip`, then verifies that:

- no `.env` file is present;
- no `.env.local` or `.env.*.local` file is present;
- no `node_modules` or build output is present;
- both `.env.example` files are retained.

A verified run on 20 November 2026 produced the latest timestamped ZIP in `distribution/` with `backend\.env.example` and `frontend\.env.example`, and no secret env files.

## 2. Manual inspection

- [ ] Open the ZIP and confirm only source, config, docs, and `.env.example` files.
- [ ] Search the extracted archive for `DATABASE_URL=`, `JWT_SECRET=`, `GROQ_API_KEY=`, and real passwords. Only empty example keys should appear.
- [ ] Confirm no screenshot, chat log, or test output contains credential values.
- [ ] Confirm `docs/` includes all 17 indexed documents.
- [ ] Confirm `scripts/create-distribution.ps1` is included.

## 3. Credential rotation

- [ ] Rotate any credential that was ever pasted into chat, a screenshot, an old document, or source history.
- [ ] Update the deployment environment with the new values.
- [ ] Do not place rotated values in the ZIP, README, docs, or source code.
- [ ] If a git repository is initialized later, confirm `.gitignore` still excludes `.env` variants.

## 4. Recipient setup instructions

Recipients must:

1. extract the archive;
2. run `npm install` in `backend` and `frontend`;
3. copy each `.env.example` to `.env` and fill in their own values;
4. run `npm.cmd run db:migrate`, then `npm.cmd run db:seed`;
5. run `npm.cmd run db:verify`, `npm.cmd run test:ba-forecast`, and `npm.cmd run test:ba-api`;
6. start backend and frontend, then open `/analytics/overview`.

## 5. Final submission contents

- [ ] Source ZIP from the script.
- [ ] `docs/FINAL_COMPLIANCE_REPORT.md`.
- [ ] `docs/TESTING_REPORT.md`.
- [ ] Completed `docs/GROUP_CONTRIBUTIONS.md`.
- [ ] Official rating sheet, if one was provided by the instructor; otherwise the labeled template.
