# Database Schema Specification

## Purpose

This document defines the target logical database model for CWCM.

## Current State

- PostgreSQL schema and Prisma models are implemented in the repository
- the wallpaper storage model now keeps normalized image blobs directly in PostgreSQL
- web UI flows are connected to live API data for the implemented MVP scope

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

| Field          | Type              | Notes                                        |
| -------------- | ----------------- | -------------------------------------------- |
| id             | UUID              | Primary key                                  |
| title          | String            | Human-readable name                          |
| filename       | String            | Normalized stored filename, always `.jpg`    |
| description    | Text nullable     | Description                                  |
| tags           | String array      | Search tags                                  |
| resolution     | String            | Fixed `1920x1080` for normalized wallpapers  |
| width          | Int               | Stored pixel width                           |
| height         | Int               | Stored pixel height                          |
| sizeBytes      | BigInt            | Final normalized file size                   |
| checksumSha256 | String            | Integrity value for normalized image         |
| mimeType       | String            | Always `image/jpeg` after normalization      |
| imageData      | Bytes             | Binary JPG wallpaper blob stored in database |
| uploadedById   | UUID              | FK to User                                   |
| uploadedAt     | DateTime          | Upload timestamp                             |
| deletedAt      | DateTime nullable | Soft delete                                  |

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

| Field                  | Type              | Notes                                                   |
| ---------------------- | ----------------- | ------------------------------------------------------- |
| id                     | UUID              | Primary key                                             |
| campaignId             | UUID nullable     | FK to Campaign, null when default wallpaper is deployed |
| wallpaperId            | UUID              | FK to Wallpaper                                         |
| triggeredByUserId      | UUID nullable     | Null when scheduler triggered                           |
| triggerSource          | Enum              | `SCHEDULER`, `MANUAL`, `RETRY`                          |
| startedAt              | DateTime          | Deployment start                                        |
| finishedAt             | DateTime nullable | Deployment finish                                       |
| durationMs             | Int nullable      | Elapsed duration                                        |
| result                 | Enum              | `SUCCESS`, `FAILED`, `WARNING`                          |
| message                | Text nullable     | Human-readable summary                                  |
| targetPath             | String            | SYSVOL target path                                      |
| targetFilename         | String            | Usually `Wallpaper.jpg`                                 |
| verifiedExists         | Boolean nullable  | Verification outcome                                    |
| verifiedSizeBytes      | BigInt nullable   | Observed target file size                               |
| verifiedChecksumSha256 | String nullable   | Observed checksum                                       |

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

Current runtime keys include:

- `sysvolPath`
- `wallpaperFilename`
- `defaultWallpaperId`
- `storageLocation`
- `schedulerIntervalMinutes`
- `deploymentTimeoutSeconds`
- `retryAttempts`
- `maxUploadSizeMb`
- `allowedExtensions`
- `overwriteExistingWallpaper`
- `autoRetryFailedDeployments`

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
- one wallpaper can also be referenced by the `defaultWallpaperId` system setting
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
- keep wallpaper normalization rules aligned with application behavior:
  - convert every uploaded wallpaper to JPG
  - normalize every uploaded wallpaper to Full HD `1920x1080`
  - reduce JPG quality when the normalized output exceeds `2 MB`

## Current Storage Mode

- wallpaper storage is now fully database-only
- filesystem source fallback has been removed from the target model
- deployment publishing reads wallpaper bytes from PostgreSQL blob data
