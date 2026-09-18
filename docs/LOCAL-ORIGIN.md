# Public-origin configuration

OpenNext/Next.js can reconstruct a request URL behind its runtime adapter. Cookie origin checks must use the externally visible origin, not an internal URL. Configure **KITCHEN_ORIGIN** in Worker vars or `.dev.vars` as the exact origin shown in your browser (scheme, hostname and port; no path/trailing slash). This is a non-secret setting; the API_TOKEN remains your private secret.

Examples:

```dotenv
# npm run dev, opened at this exact address:
KITCHEN_ORIGIN="http://localhost:3000"
# Local Worker preview opened at http://localhost:8787 instead:
# KITCHEN_ORIGIN="http://localhost:8787"
# Production example (replace with your own address):
# KITCHEN_ORIGIN="https://your-kitchen.example"
```

The default without this setting is the framework request URL. Set the value explicitly when using Worker preview or a reverse proxy. Use the same origin consistently; localhost and 127.0.0.1 are different origins. The isolated browser test runner sets its own non-secret test origin and never changes your `.dev.vars`.

Origin/CSRF checks remain strict: the Origin header is preserved and compared against this server-configured origin. It is never used as the source of the trusted origin, and foreign origins are not allowlisted. Non-loopback HTTP, credentials, paths, and wildcard settings are rejected. Changing the canonical origin can require unlocking again.
