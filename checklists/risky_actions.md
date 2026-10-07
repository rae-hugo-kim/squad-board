# Risky Actions Checklist (Approval Gate)

If any of the following is involved, you MUST obtain explicit approval:

- [ ] Mass delete / broad refactor across many files
- [ ] History rewrite / force push
- [ ] Destructive DB changes/migrations without rollback
- [ ] Production change or production data access
- [ ] Handling secrets/credentials or `.env` content

Before requesting approval:

- [ ] Explain the need and expected impact
- [ ] Provide rollback plan (or why rollback is impossible)
- [ ] Provide safer alternatives if available




