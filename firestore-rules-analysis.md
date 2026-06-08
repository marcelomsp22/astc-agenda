# Firestore Rules Analysis

## Collections

- `appointments/{appointmentId}`
- `userAccess/{uid}`

## App Queries

- Reads the 10 most recent appointments with `orderBy('createdAt', 'desc')` and `limit(10)`.
- Client-side filters are applied only to the 10 documents already loaded.
- Reads the current user's `userAccess/{uid}` document to decide whether the app is unlocked.
- Approved users read `userAccess` ordered by `createdAt desc` to list pending access requests.

## Appointment Data Model

- `scheduledAt`: timestamp, required.
- `space`: string enum, required. Allowed values: `Campo`, `Salao de festas`, `Churrasqueira`, `Piscina`.
- `renter`: string, required, 1 to 120 characters.
- `registeredBy`: string, required, 1 to 120 characters.
- `createdAt`: timestamp, required, immutable after create.
- `createdByUid`: string, required, immutable after create.
- `createdByName`: string, required, immutable after create.
- `updatedAt`: timestamp, optional.

## Access Pattern

- New Google logins create `userAccess/{uid}` with `status: pending`.
- Users with `status: approved` can approve other pending users.
- Only approved users can read, create, update, and delete appointments.
- Approved users share the same agenda and can create, update, and delete appointments.
- Rules validate schema and field sizes on create and update.

## User Access Data Model

- `uid`: string, required, immutable.
- `email`: string, required, max 160 characters.
- `displayName`: string, required, 1 to 120 characters.
- `photoURL`: string, required, max 500 characters.
- `status`: string enum, required. Allowed values: `pending`, `approved`.
- `createdAt`: timestamp, required, immutable.
- `approvedAt`: timestamp, optional.
- `approvedByUid`: string, optional.
- `approvedByName`: string, optional.
