# Policy Sync Checklist

Use this checklist whenever `AGENTS.md` changes, or when reference docs are suspected stale.

## Metadata update checkpoints

- [ ] Update `last_sync_date` in both reference docs:
  - `claudedocs/CLAUDEKR.md`
  - `claudedocs/CLAUDE_original.md`
- [ ] Update `source_commit_hash` in both reference docs to match:
  - `git log -1 --format=%H -- AGENTS.md`

## Explicit diff checkpoints

- [ ] Compare section headings between `AGENTS.md` and `claudedocs/CLAUDEKR.md`.
- [ ] Compare non-negotiables / MUST-level requirements for semantic parity.
- [ ] Compare linked module lists and ensure new/removed links are mirrored.
- [ ] Compare checklist and template references for additions/removals.
- [ ] Confirm any intentionally unsynced content is marked `STALE` with a short reason.

## Suggested verification commands

```bash
git log -1 --format=%H -- AGENTS.md
sed -n '1,20p' claudedocs/CLAUDEKR.md
sed -n '1,20p' claudedocs/CLAUDE_original.md
git diff -- AGENTS.md claudedocs/CLAUDEKR.md claudedocs/CLAUDE_original.md
```
