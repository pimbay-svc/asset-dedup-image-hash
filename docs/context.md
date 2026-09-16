# Context

> Working memory, not a historical record.
> Continuously edited, not append-only — unlike DECISIONS.md.
> When something here resolves: delete it if it was only ever local/temporary, or promote it to DECISIONS.md if it turned out to matter beyond this moment.
> Don't let resolved items pile up here.

## Current focus

Nothing in progress — repo is in a stable, maintenance state.

## Open questions

None currently.

## Known limitations / non-goals (for now)

- **Paths in, a hash string out — no output files, no `OUTPUT_DIR`.**
  Socket messages carry only paths and metadata, never raw file bytes (see spec, "Binary data policy").
  `ImagehashRunner.hash()` reads the input image directly from its given path (streamed into the worker's stdin) and returns a hash string — there's no output artifact on the shared volume the way `video-frame-extract`/`pdf-page-extract` produce PNG files, so there's no `OUTPUT_DIR`, no filename convention, and no TTL sweep in this service.
  If you find yourself wanting to add one, that almost certainly means the feature belongs in a different extension, not here.

## Implementation notes

None currently.

## Ideas / future plans

None currently.
