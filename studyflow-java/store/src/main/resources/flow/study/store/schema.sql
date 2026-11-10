-- The local copy.
--
-- Mirrors supabase/migrations, with three differences, all deliberate:
--
--   No RLS.        Row Level Security is the authorisation model for a shared
--                  database with many accounts in it. This file holds one
--                  student and lives inside an AES-encrypted file she unlocks
--                  with a passphrase. A policy here would protect her from
--                  herself and nothing else. Authorisation still happens --
--                  it happens in the cloud, on push, because the sync layer
--                  goes through PostgREST rather than connecting to Postgres.
--
--   No EXCLUDE.    H2 has no btree_gist and no range types, so the two
--                  overlap constraints move into the domain module, where
--                  Overlaps reports a clash with both lessons named.
--
--   Three extra    outbox, sync_state and auth_state. Local-only; none of
--   tables.        them exists in the cloud and none is ever pushed.
--
-- Enum columns are TEXT with a CHECK rather than H2 ENUM: the wire form is
-- what crosses to PostgREST, and a CHECK keeps the value honest without
-- making a new cloud enum label an ALTER TABLE here.

create table if not exists profiles (
    id              varchar(64) primary key,
    full_name       varchar(200) not null default '',
    role            varchar(16) not null default 'student' check (role in ('student', 'admin')),
    timezone        varchar(64) not null default 'UTC',
    study_until     time not null default '21:00:00',
    settle_minutes  int not null default 30 check (settle_minutes between 0 and 240),
    created_at      timestamp with time zone,
    updated_at      timestamp with time zone
);

create table if not exists subjects (
    id          varchar(64) primary key,
    user_id     varchar(64) not null,
    name        varchar(200) not null,
    short_name  varchar(40),
    color_token varchar(40) not null default 'chart-1',
    created_at  timestamp with time zone,
    updated_at  timestamp with time zone
);

create table if not exists timetable_versions (
    id              varchar(64) primary key,
    user_id         varchar(64) not null,
    name            varchar(200) not null default '',
    status          varchar(16) not null check (status in ('draft', 'active', 'archived')),
    source_type     varchar(16) not null check (source_type in ('manual', 'pdf', 'image', 'csv')),
    source_path     varchar(1000),
    effective_from  date not null,
    effective_until date,
    confirmed_at    timestamp with time zone,
    created_at      timestamp with time zone,
    updated_at      timestamp with time zone
);

create table if not exists timetable_entries (
    id                   varchar(64) primary key,
    user_id              varchar(64) not null,
    timetable_version_id varchar(64) not null,
    subject_id           varchar(64),
    activity_type        varchar(16) not null
                             check (activity_type in ('class', 'break', 'free', 'study', 'other')),
    title                varchar(200),
    day_of_week          int not null check (day_of_week between 1 and 7),
    start_time           time not null,
    end_time             time not null,
    room                 varchar(100),
    teacher              varchar(200),
    confidence           varchar(16) not null default 'high'
                             check (confidence in ('high', 'medium', 'low')),
    created_at           timestamp with time zone,
    updated_at           timestamp with time zone,
    -- A lesson cannot end before it starts. The only one of the cloud
    -- timetable checks that survives verbatim; the overlap EXCLUDE cannot.
    check (end_time > start_time)
);

create index if not exists timetable_entries_day on timetable_entries (day_of_week, start_time);

create table if not exists assignments (
    id                varchar(64) primary key,
    user_id           varchar(64) not null,
    subject_id        varchar(64),
    title             varchar(200) not null,
    description       varchar(2000),
    due_date          date not null,
    due_time          time,
    priority          varchar(16) not null default 'medium'
                          check (priority in ('low', 'medium', 'high')),
    estimated_minutes int not null check (estimated_minutes between 5 and 600),
    status            varchar(16) not null default 'not_started'
                          check (status in ('not_started', 'in_progress', 'completed')),
    completed_at      timestamp with time zone,
    created_at        timestamp with time zone,
    updated_at        timestamp with time zone,
    -- Status and timestamp can never disagree.
    check ((status = 'completed') = (completed_at is not null))
);

create index if not exists assignments_due on assignments (due_date);

create table if not exists revision_tasks (
    id                varchar(64) primary key,
    user_id           varchar(64) not null,
    subject_id        varchar(64),
    title             varchar(200) not null,
    description       varchar(2000),
    scheduled_date    date,
    estimated_minutes int not null check (estimated_minutes between 5 and 600),
    priority          varchar(16) not null default 'medium'
                          check (priority in ('low', 'medium', 'high')),
    status            varchar(16) not null default 'not_started'
                          check (status in ('not_started', 'in_progress', 'completed')),
    completed_at      timestamp with time zone,
    created_at        timestamp with time zone,
    updated_at        timestamp with time zone,
    check ((status = 'completed') = (completed_at is not null))
);

create table if not exists study_sessions (
    id               varchar(64) primary key,
    user_id          varchar(64) not null,
    subject_id       varchar(64),
    assignment_id    varchar(64),
    revision_task_id varchar(64),
    started_at       timestamp with time zone not null,
    ended_at         timestamp with time zone,
    duration_minutes int,
    created_at       timestamp with time zone,
    updated_at       timestamp with time zone,
    -- A session is work on one thing.
    check (assignment_id is null or revision_task_id is null)
);

create table if not exists help_requests (
    id            varchar(64) primary key,
    user_id       varchar(64) not null,
    subject_id    varchar(64),
    assignment_id varchar(64),
    topic         varchar(300) not null,
    detail        varchar(2000),
    status        varchar(16) not null default 'open' check (status in ('open', 'resolved')),
    resolved_at   timestamp with time zone,
    created_at    timestamp with time zone,
    updated_at    timestamp with time zone,
    check ((status = 'resolved') = (resolved_at is not null))
);

create table if not exists catchup_plans (
    id                 varchar(64) primary key,
    user_id            varchar(64) not null,
    assignment_id      varchar(64),
    revision_task_id   varchar(64),
    timetable_entry_id varchar(64),
    planned_date       date not null,
    start_minutes      int not null,
    end_minutes        int not null,
    slot_label         varchar(200),
    planned_minutes    int not null,
    status             varchar(16) not null default 'planned'
                           check (status in ('planned', 'done', 'missed', 'cancelled')),
    answered_at        timestamp with time zone,
    created_at         timestamp with time zone,
    updated_at         timestamp with time zone,
    check (assignment_id is null or revision_task_id is null),
    check (end_minutes > start_minutes)
);

-- Append-only, as in the cloud. There is no update path in the store and the
-- trigger below refuses one anyway -- see ActivityLogGuard.
create table if not exists activity_logs (
    id            varchar(64) primary key,
    user_id       varchar(64) not null,
    actor_id      varchar(64),
    activity_type varchar(40) not null,
    entity_type   varchar(40),
    entity_id     varchar(64),
    metadata      varchar(4096) not null default '{}',
    created_at    timestamp with time zone not null
);

create index if not exists activity_logs_created on activity_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Local-only. None of these three exists in the cloud.
-- ---------------------------------------------------------------------------

-- Every offline mutation, as an intent rather than a row image.
--
-- Intents are what make this safe to replay. "Complete assignment X" is
-- idempotent and touches one column, so replaying it cannot clobber a field
-- the student never edited -- including a timetable edit made by a linked
-- adult while she was offline, which is the one cross-account write the
-- product allows.
--
-- seq is the replay order. Order only has to hold WITHIN an entity, so the
-- engine groups by entity_type plus entity_id and replays each group in seq
-- order; a rejection in one group does not block another.
create table if not exists outbox (
    seq          bigint auto_increment primary key,
    entity_type  varchar(40) not null,
    entity_id    varchar(64) not null,
    kind         varchar(40) not null,
    payload      varchar(8192) not null default '{}',
    status       varchar(16) not null default 'pending'
                     check (status in ('pending', 'sent', 'rejected')),
    attempts     int not null default 0,
    last_error   varchar(2000),
    created_at   timestamp with time zone not null,
    sent_at      timestamp with time zone
);

create index if not exists outbox_pending on outbox (status, seq);

-- How far each table has been pulled. Only activity_logs uses the watermark;
-- everything else pulls as a full snapshot, because the dataset is a few
-- hundred rows and a snapshot makes cloud deletes resolve for free.
create table if not exists sync_state (
    table_name     varchar(40) primary key,
    last_pulled_at timestamp with time zone,
    watermark      varchar(64)
);

-- The session.
--
-- One row, enforced by the fixed primary key. Whether this row exists is also
-- what decides setup versus straight-to-the-app on launch, so there is no
-- separate marker file to fall out of step with it.
--
-- The refresh token is what lets the app sync silently once a connection
-- returns without asking her to sign in again. It is stored in the clear,
-- because this database is: see StoreLocation for that decision. Anyone who
-- can read this file can act as her against Supabase until the token is
-- revoked, which is the sharpest edge of the no-passphrase choice.
create table if not exists auth_state (
    -- default before primary key: H2 rejects the other order.
    id                  int default 1 primary key check (id = 1),
    user_id             varchar(64) not null,
    email               varchar(320) not null,
    refresh_token       varchar(4096),
    last_online_auth_at timestamp with time zone
);
