# Local migration data

Exported migration batches are written here when you click **Export to local data** in the Review phase.

Each batch folder contains:

- `manifest.json` — batch summary and file index
- `components/{id}.json` — datasource field values + presentation for one queued component
- `pages/{page}.json` — aggregated presentation renderings per target Sitecore page

`latest.json` points at the most recent export batch.

These files are intended for a future Migrate step (create datasource items, assign renderings, set field values).
