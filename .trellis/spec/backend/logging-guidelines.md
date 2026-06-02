# Backend Logging Guidelines

## Scope / Trigger

No logging library is currently established. Prefer user-facing IPC errors for
expected failures.

## What To Log

Only add logs for diagnostic events that help debug local file access,
Electron startup, or packaging issues.

## What Not To Log

Do not log full todo contents by default. Avoid logging sensitive filesystem
paths unless actively debugging a local issue.
