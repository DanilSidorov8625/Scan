// schema.js
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

//
// ─── SCANS ────────────────────────────────────────────────────────────────────────
//
export const scans = sqliteTable('scans', {
  // primary key: UUID or any 32-char ID
  id: text('id').primaryKey(),

  // which user this belongs to
  userId: text('userId')
    .notNull(),

  // which form the scan was for (matches your formsConfig.forms[].id)
  formId: text('formId').notNull(),

  // timestamp of the scan
  scannedAt: integer('scannedAt', { mode: 'timestamp_ms' }).notNull(),

  key: text('key').notNull(), // unique key for this scan, e.g. 'parcelBarcode'

  // JSON-stringified record of all field values
  data: text('data').notNull(),

  // flag for “has this been exported yet?”
  exported: integer('exported').notNull().default(0),

  synced: integer('synced').notNull().default(0),

  exportId: text('exportId').notNull().default(''),
});