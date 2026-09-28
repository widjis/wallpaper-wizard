# LDAPS trust files

Place your IT-issued AD CA chain PEM here as `ad-ca-chain.pem` (not a private key). Compose mounts this directory read-only at `/app/certs`. Set `LDAP_CA_FILE=/app/certs/ad-ca-chain.pem` in the deployment `.env` and use a domain-controller hostname matching its certificate in `LDAP_URL`. Certificate files are not tracked in Git.

For the owner-approved no-CA configuration, set `LDAP_TLS_REJECT_UNAUTHORIZED=false` in the server `.env`. LDAP traffic remains encrypted but the server certificate is not verified. The default is `true`; restore it when the CA chain is available.
