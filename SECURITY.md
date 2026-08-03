# Security Policy

Pebl processes potentially sensitive AI-workflow metadata. Security and privacy reports should not be opened as public issues.

## Reporting a vulnerability

Until a dedicated security mailbox is published, contact the repository owner privately through GitHub.

Include:

- affected component and version;
- reproduction steps;
- expected impact;
- suggested mitigation, if known.

## Security principles

- Source code and prompts stay local by default.
- Secrets are redacted before optional synchronization.
- New telemetry requires explicit documentation and review.
- Provider credentials must use least privilege and secure local storage.
- Pebl must fail open without blocking the user's AI workflow.
