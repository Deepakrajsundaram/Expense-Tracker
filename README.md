# D's Expense Tracker

A mobile-first, local-first personal expense tracker for GitHub Pages.

## V1.0.7 goals

- Upload CSV, XLS, or XLSX bank statements.
- Process statements in the browser.
- Import statements repeatedly: daily, weekly, monthly, or overlapping.
- Detect already-imported transactions and avoid double counting.
- Flag possible duplicates instead of silently importing them.
- Automatically categorize known merchants.
- Review only uncertain transactions.
- Learn merchant rules from explicit review.
- Keep transactions in IndexedDB on the device/browser.
- Export/import a JSON backup.
- iPhone-first dark UI.
- Salary-based monthly cycles: salary transactions starting with `NEFT` and containing `ACCENTURE SOLUTIONS PVT LTD` start the following month cycle.
- Transaction dates remain unchanged; only dashboard/month grouping changes.

## Important privacy design

This version does **not** connect to a bank and does **not** send transaction data to a backend.

Spreadsheet parsing is performed in the browser using SheetJS loaded from jsDelivr.

If you require fully offline parsing later, the SheetJS library can be vendored into the repository.

## GitHub Pages deployment

1. Create a GitHub repository, for example `ds-expense-tracker`.
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save.
7. Open the generated GitHub Pages URL in Safari.
8. On iPhone: **Share → Add to Home Screen**.

## Data safety

Do not delete or replace the browser's IndexedDB when updating the application.

The database is versioned (`DB_VERSION` in `app.js`). Future schema changes should use IndexedDB migrations so existing transactions and rules are preserved.

Export a backup before making major changes or clearing browser data.

## Statement import behavior

Every transaction receives a deterministic fingerprint from:

- transaction date
- amount
- debit/credit direction
- normalized transaction description

Example:

- Sep 1–15 uploaded → 100 transactions stored
- Sep 1–20 uploaded later → only new transactions are added
- Sep 1–30 uploaded later → only transactions not already present are added

Possible duplicates with the same date, amount, direction, and merchant are held for review.

## File structure

```text
/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── README.md
└── assets/
    ├── icon-512.png
    ├── apple-touch-icon.png
    └── favicon.png
```

## V1.0.0 scope

This is the first working foundation. It is intentionally focused on safe import, deduplication, categorization, local storage, and mobile usability before adding more complexity.


### v1.0.11
- Home now shows the latest transaction date imported, last upload timestamp, and a simple up-to-date/gap status.
- Upload timestamps are stored in IndexedDB metadata and included in backup/restore.
- Existing transactions and deduplication behavior are preserved.
