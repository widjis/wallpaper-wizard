# Database Schema Specification

## Purpose

This document defines the target logical database model for CWCM. The current repository does not yet implement a database or Prisma schema.

## Current State

- no PostgreSQL schema is present in the repository
- no Prisma models or migrations exist
- all UI data is currently mock data

## Design Principles

- use UUID primary keys for domain entities
- preserve auditability for administrative actions
- keep campaign and deployment history immutable except for operational annotations
- separate configuration, operational logs, and domain entities clearly

## Core Entities

### User

| Field        | Type              | Notes                                 |
| ------------ | ----------------- | ------------------------------------- |
| id           | UUID              | Primary key                           |
| username     | String            | Unique login identifier               |
| passwordHash | String            | Local authentication hash for phase 1 |
| role         | Enum              | `ADMINISTRATOR`, `OPERATOR`, `VIEWER` |
| isActive     | Boolean           | Soft disable flag                     |
| createdAt    | DateTime          | Creation timestamp                    |
| updatedAt    | DateTime          | Update timestamp                      |
| lastLoginAt  | DateTime nullable | Last successful login                 |

### Wallpaper

| Field          | Type              | Notes                  |
| -------------- | ----------------- | ---------------------- |
| id             | UUID              | Primary key            |
| title          | String            | Human-readable name    |
| filename       | String            | Stored source filename |
| storagePath    | String            | Internal storage path  |
| description    | Text nullable     | Description            |
| tags           | String array      | Search tags            |
| resolution     | String            | Example `1920x1080`    |
| sizeBytes      | BigInt            | File size              |
| checksumSha256 | String            | Integrity value        |
| mimeType       | String            | Example `image/jpeg`   |
| uploadedById   | UUID              | FK to User             |
| uploadedAt     | DateTime          | Upload timestamp       |
| deletedAt      | DateTime nullable | Soft delete            |

### Campaign

| Field       | Type              | Notes                                                    |
| ----------- | ----------------- | -------------------------------------------------------- |
| id          | UUID              | Primary key                                              |
| name        | String            | Campaign name                                            |
| wallpaperId | UUID              | FK to Wallpaper                                          |
| description | Text nullable     | Description                                              |
| startDate   | DateTime nullable | Scheduled start                                          |
| endDate     | DateTime nullable | Scheduled end                                            |
| priority    | Int               | Higher value wins when rules allow                       |
| status      | Enum              | `DRAFT`, `SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| createdById | UUID              | FK to User                                               |
| createdAt   | DateTime          | Creation timestamp                                       |
| updatedAt   | DateTime          | Update timestamp                                         |
| activatedAt | DateTime nullable | Actual activation time                                   |
| completedAt | DateTime nullable | Actual completion time                                   |

### CampaignQueueEntry

| Field         | Type     | Notes                                       |
| ------------- | -------- | ------------------------------------------- |
| id            | UUID     | Primary key                                 |
| campaignId    | UUID     | FK to Campaign                              |
| queuePosition | Int      | Ordering within active queue                |
| state         | Enum     | `QUEUED`, `PAUSED`, `PROCESSING`, `REMOVED` |
| createdAt     | DateTime | Creation timestamp                          |
| updatedAt     | DateTime | Update timestamp                            |

### DeploymentLog

| Field                  | Type              | Notes                          |
| ---------------------- | ----------------- | ------------------------------ |
| id                     | UUID              | Primary key                    |
| campaignId             | UUID              | FK to Campaign                 |
| wallpaperId            | UUID              | FK to Wallpaper                |
| triggeredByUserId      | UUID nullable     | Null when scheduler triggered  |
| triggerSource          | Enum              | `SCHEDULER`, `MANUAL`, `RETRY` |
| startedAt              | DateTime          | Deployment start               |
| finishedAt             | DateTime nullable | Deployment finish              |
| durationMs             | Int nullable      | Elapsed duration               |
| result                 | Enum              | `SUCCESS`, `FAILED`, `WARNING` |
| message                | Text nullable     | Human-readable summary         |
| targetPath             | String            | SYSVOL target path             |
| targetFilename         | String            | Usually `Wallpaper.jpg`        |
| verifiedExists         | Boolean nullable  | Verification outcome           |
| verifiedSizeBytes      | BigInt nullable   | Observed target file size      |
| verifiedChecksumSha256 | String nullable   | Observed checksum              |

### ActivityLog

| Field      | Type          | Notes                      |
| ---------- | ------------- | -------------------------- |
| id         | UUID          | Primary key                |
| userId     | UUID nullable | Null for system activity   |
| actorType  | Enum          | `USER`, `SYSTEM`           |
| action     | String        | Example `campaign.created` |
| detailJson | JSON          | Structured action metadata |
| createdAt  | DateTime      | Log timestamp              |

### SystemSetting

| Field       | Type          | Notes               |
| ----------- | ------------- | ------------------- |
| id          | UUID          | Primary key         |
| key         | String        | Unique setting key  |
| valueJson   | JSON          | Typed value payload |
| updatedById | UUID nullable | FK to User          |
| updatedAt   | DateTime      | Update timestamp    |

### Session

| Field     | Type              | Notes                           |
| --------- | ----------------- | ------------------------------- |
| id        | UUID              | Primary key                     |
| userId    | UUID              | FK to User                      |
| tokenId   | String            | Unique session token identifier |
| expiresAt | DateTime          | Session expiry                  |
| revokedAt | DateTime nullable | Revocation timestamp            |
| createdAt | DateTime          | Creation timestamp              |

## Suggested Enums

### UserRole

- `ADMINISTRATOR`
- `OPERATOR`
- `VIEWER`

### CampaignStatus

- `DRAFT`
- `SCHEDULED`
- `ACTIVE`
- `COMPLETED`
- `CANCELLED`

### QueueState

- `QUEUED`
- `PAUSED`
- `PROCESSING`
- `REMOVED`

### DeploymentResult

- `SUCCESS`
- `FAILED`
- `WARNING`

### TriggerSource

- `SCHEDULER`
- `MANUAL`
- `RETRY`

### ActorType

- `USER`
- `SYSTEM`

## Key Relationships

- one user uploads many wallpapers
- one wallpaper can be referenced by many campaigns
- one campaign can have many deployment logs
- one campaign can have one active queue entry at a time
- one user can create many campaigns
- one user can create many activity log entries

## Migration Readiness Notes

Before implementation:

- decide the exact authentication model for phase 1
- confirm whether tags will be stored as native PostgreSQL arrays or normalized labels
- confirm whether deleted wallpapers remain deployable by historical deployments
- confirm retention and archival strategy for deployment and activity logs
