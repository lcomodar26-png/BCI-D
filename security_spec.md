# Enterprise Investment System Security Specification

## Data Invariants
1. A user's balance cannot be negative.
2. A transaction must always be linked to the user who performed it.
3. Only admins can block users or change user roles.
4. Users cannot modify their own `blocked` status or `role`.
5. Transactions are immutable once created.

## The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Spoofing**: Creating a user document with a different `uid` than the authenticated one.
2. **Privilege Escalation**: A user trying to update their own `role` to 'admin'.
3. **Ghost Blocking**: A regular user trying to set their own `blocked` field to `false` after being blocked.
4. **Balance Forging**: A user directly updating their balance to a massive number without a transaction.
5. **Orphaned Transaction**: Creating a transaction for a different `userId`.
6. **Self-Unblocking**: A blocked user trying to unblock themselves.
7. **Cross-User Read**: A regular user trying to read another user's balance or profile.
8. **Admin-Only Data Leak**: A regular user trying to list all transactions in the system.
9. **Negative Deposit**: A user trying to "deposit" a negative amount to drain balance (if logic was simple).
10. **ID Poisoning**: Using a 2MB string as a document ID.
11. **Immortal Field Overwrite**: A user trying to change their `email` after registration (if we want it immutable).
12. **Future Transaction**: Creating a transaction with a future date.

## The Test Runner
(This would be implemented in `firestore.rules.test.ts` if we were running a test suite, but here we describe the logic).
- `auth != null` is mandatory for all writes.
- `isValidUser(incoming())` and `isValidTransaction(incoming())` strictly enforce types and sizes.
- `isAdmin()` checks for existence in an `/admins/` collection or a specific field.
- `affectedKeys().hasOnly()` is used on all updates to partition permissions.
