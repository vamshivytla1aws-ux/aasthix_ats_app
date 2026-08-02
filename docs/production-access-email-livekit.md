# Production access, email, and LiveKit

## Workspace owner

Set `WORKSPACE_OWNER_EMAIL=vamshi.vaitla360@gmail.com` on the Railway **web** service. The migration runner promotes the matching database user to `workspace_owner` with `all` scope. The environment variable remains an emergency recovery path.

## Resend

1. Add `aasthix.com` in Resend Domains and publish every SPF, DKIM, and verification record shown there.
2. Wait until Resend reports the domain as verified.
3. Configure the Railway **web** service:
   - `RESEND_API_KEY=<production key>`
   - `RESEND_FROM_EMAIL=AASTHIX Talent <noreply@aasthix.com>`
   - `RESEND_VERIFIED_DOMAIN=aasthix.com`
   - `EMAIL_PROVIDER_ORDER=resend`
4. Remove `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` while Gmail credentials are invalid.

Use the owner-only Email Health action in Access Control to send a test. A Resend API key cannot bypass domain verification.

## Hetzner LiveKit

Configure Railway web with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_TURN_EXPECTED=true`. Keys must exactly match the Hetzner LiveKit configuration.

Validate the server:

- trusted TLS for the LiveKit WebSocket domain and TURN/TLS domain
- DNS for both domains points to the Hetzner public IP
- `rtc.use_external_ip: true`
- Docker host networking
- firewall permits HTTPS/TURN-TLS, ICE/TCP, TURN/UDP, and the configured ICE/UDP range or UDP mux port
- embedded TURN is enabled with valid certificates
- monitor WebSocket disconnects, ICE failures, packet loss, CPU, memory, and bandwidth

`NEXT_PUBLIC_CHAT_ICE_SERVERS` is optional and only supports the legacy peer fallback. It is not proof that the LiveKit server advertises TURN.

References: [deployment](https://docs.livekit.io/transport/self-hosting/deployment/), [ports and firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/), [VM deployment](https://docs.livekit.io/transport/self-hosting/vm/).
