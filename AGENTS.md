# Architecture rules
- Keep orchestration model IDs in a browser-safe shared module so the admin display and actual request selection agree; standalone legacy geocoding retains its separate default.
- Apply moderation through authenticated existing workflows or authenticated one-off scripts; preserve source snapshots before bulk changes for traceability.