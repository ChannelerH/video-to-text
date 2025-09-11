import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable(
  "v2tx_users",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    uuid: varchar({ length: 255 }).notNull().unique(),
    email: varchar({ length: 255 }).notNull(),
    created_at: timestamp({ withTimezone: true }),
    nickname: varchar({ length: 255 }),
    avatar_url: varchar({ length: 255 }),
    locale: varchar({ length: 50 }),
    signin_type: varchar({ length: 50 }),
    signin_ip: varchar({ length: 255 }),
    signin_provider: varchar({ length: 50 }),
    signin_openid: varchar({ length: 255 }),
    invite_code: varchar({ length: 255 }).notNull().default(""),
    updated_at: timestamp({ withTimezone: true }),
    invited_by: varchar({ length: 255 }).notNull().default(""),
    is_affiliate: boolean().notNull().default(false),
  },
  (table) => [
    uniqueIndex("email_provider_unique_idx").on(
      table.email,
      table.signin_provider
    ),
  ]
);

// Orders table
export const orders = pgTable("v2tx_orders", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  order_no: varchar({ length: 255 }).notNull().unique(),
  created_at: timestamp({ withTimezone: true }),
  user_uuid: varchar({ length: 255 }).notNull().default(""),
  user_email: varchar({ length: 255 }).notNull().default(""),
  amount: integer().notNull(),
  interval: varchar({ length: 50 }),
  expired_at: timestamp({ withTimezone: true }),
  status: varchar({ length: 50 }).notNull(),
  stripe_session_id: varchar({ length: 255 }),
  credits: integer().notNull(),
  currency: varchar({ length: 50 }),
  sub_id: varchar({ length: 255 }),
  sub_interval_count: integer(),
  sub_cycle_anchor: integer(),
  sub_period_end: integer(),
  sub_period_start: integer(),
  sub_times: integer(),
  product_id: varchar({ length: 255 }),
  product_name: varchar({ length: 255 }),
  valid_months: integer(),
  order_detail: text(),
  paid_at: timestamp({ withTimezone: true }),
  paid_email: varchar({ length: 255 }),
  paid_detail: text(),
  payment_provider: varchar({ length: 50 }).default("stripe"),
});

// API Keys table
export const apikeys = pgTable("v2tx_apikeys", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  api_key: varchar({ length: 255 }).notNull().unique(),
  title: varchar({ length: 100 }),
  user_uuid: varchar({ length: 255 }).notNull(),
  created_at: timestamp({ withTimezone: true }),
  status: varchar({ length: 50 }),
});

// Credits table
export const credits = pgTable("v2tx_credits", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  trans_no: varchar({ length: 255 }).notNull().unique(),
  created_at: timestamp({ withTimezone: true }),
  user_uuid: varchar({ length: 255 }).notNull(),
  trans_type: varchar({ length: 50 }).notNull(),
  credits: integer().notNull(),
  order_no: varchar({ length: 255 }),
  expired_at: timestamp({ withTimezone: true }),
});

// Categories table
export const categories = pgTable("v2tx_categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  uuid: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 255 }).notNull().unique(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  status: varchar({ length: 50 }),
  sort: integer().notNull().default(0),
  created_at: timestamp({ withTimezone: true }),
  updated_at: timestamp({ withTimezone: true }),
});

// Posts table
export const posts = pgTable("v2tx_posts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  uuid: varchar({ length: 255 }).notNull().unique(),
  slug: varchar({ length: 255 }),
  title: varchar({ length: 255 }),
  description: text(),
  content: text(),
  created_at: timestamp({ withTimezone: true }),
  updated_at: timestamp({ withTimezone: true }),
  status: varchar({ length: 50 }),
  cover_url: varchar({ length: 255 }),
  author_name: varchar({ length: 255 }),
  author_avatar_url: varchar({ length: 255 }),
  locale: varchar({ length: 50 }),
  category_uuid: varchar({ length: 255 }),
});

// Affiliates table
export const affiliates = pgTable("v2tx_affiliates", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  user_uuid: varchar({ length: 255 }).notNull(),
  created_at: timestamp({ withTimezone: true }),
  status: varchar({ length: 50 }).notNull().default(""),
  invited_by: varchar({ length: 255 }).notNull(),
  paid_order_no: varchar({ length: 255 }).notNull().default(""),
  paid_amount: integer().notNull().default(0),
  reward_percent: integer().notNull().default(0),
  reward_amount: integer().notNull().default(0),
});

// Feedbacks table
export const feedbacks = pgTable("v2tx_feedbacks", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  created_at: timestamp({ withTimezone: true }),
  status: varchar({ length: 50 }),
  user_uuid: varchar({ length: 255 }),
  content: text(),
  rating: integer(),
});

// Transcription jobs (metadata only; no raw media persisted)
export const transcriptions = pgTable("v2tx_transcriptions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  job_id: varchar({ length: 64 }).notNull().unique(),
  user_uuid: varchar({ length: 255 }).notNull().default(""),
  source_type: varchar({ length: 50 }).notNull(), // youtube_url | audio_url | file_upload
  source_hash: varchar({ length: 255 }).notNull(), // videoId / url sha256 / r2 key hash
  source_url: varchar({ length: 1024 }),
  title: varchar({ length: 512 }),
  language: varchar({ length: 50 }),
  duration_sec: integer().notNull().default(0),
  cost_minutes: integer().notNull().default(0),
  status: varchar({ length: 50 }).notNull().default("completed"),
  created_at: timestamp({ withTimezone: true }),
  completed_at: timestamp({ withTimezone: true }),
  deleted: boolean().notNull().default(false),
});

// Transcription results in multiple formats
export const transcription_results = pgTable("v2tx_transcription_results", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  job_id: varchar({ length: 64 }).notNull(),
  format: varchar({ length: 20 }).notNull(), // txt|srt|vtt|json|md
  content: text().notNull(),
  size_bytes: integer().notNull().default(0),
  created_at: timestamp({ withTimezone: true }),
}, (t) => [
  uniqueIndex("transcription_result_unique").on(t.job_id, t.format)
]);

// Edited transcription structure per user (chapters/titles, etc.)
export const transcription_edits = pgTable("v2tx_transcription_edits", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  job_id: varchar({ length: 64 }).notNull(),
  user_uuid: varchar({ length: 255 }).notNull(),
  content: text().notNull(), // JSON string
  created_at: timestamp({ withTimezone: true }),
  updated_at: timestamp({ withTimezone: true }),
}, (t) => [
  uniqueIndex("transcription_edits_job_user_unique").on(t.job_id, t.user_uuid)
]);
