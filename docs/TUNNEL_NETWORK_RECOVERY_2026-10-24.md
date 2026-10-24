# Observed tunnel network interruption and recovery — 24 October 2026

At 00:35:41 UTC, the origin health endpoint returned 200 with database and Redis
healthy, while public home, pricing, login and health returned Cloudflare 530.
This superseded the earlier all-green public snapshot.

The single existing Cloudflared service remained running with PID 7324, delayed
automatic startup, saved token file and the approved failure-recovery policy.
Local connector metrics showed zero active tunnel connections. Recent logs
recorded disconnected control streams and a resolver timeout for the connector
host. Both connector hostnames resolved during the later host DNS probe.

A one-time runtime restart was prepared behind exact PID, token-file identity,
one-connector, healthy-origin and zero-connection preconditions. The action
refused admission because the zero-connection precondition no longer held.
**No restart ran and no persistent setting was changed.** The service's own
connection retry recovered as network resolution returned.

At 00:38:04 UTC, origin health and all four public checks returned 200 again;
local metrics reported four active tunnel connections. The current sanitized
HTTP receipt is `.cache/public-availability/current.json`. Public release ID is
still `unknown`; no source promotion is implied.

This is an observed network interruption and automatic connector reconnection,
not a deliberately induced Windows reboot or service-crash acceptance test.
Windows service state alone is insufficient evidence of public availability.
External availability alerting, prolonged network-loss acceptance and moving
the public service off a workstation remain operational work. No DNS setting,
credential, customer data, application container or supporting service changed.
