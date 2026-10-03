# Deployment destination

- Publish this project's changes only to **https://staging.aria-man.com/**.
- Use `.github/workflows/deploy-staging.yml` with the intended reviewed ref (for example, `main`).
- Never dispatch `deploy-production.yml`, configure production deployment credentials, or modify the root domain `aria-man.com` as part of this project's deployment.
