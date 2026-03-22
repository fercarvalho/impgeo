# Security Policy — IMPGEO

## 🔒 Supported Versions

| Version | Supported | Status |
|---------|-----------|--------|
| 1.x | ✅ Yes | Current stable release |
| < 1.0 | ❌ No | Legacy, no longer supported |

---

## 🐛 Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### ⚠️ DO NOT Create Public Issues

**Do not** disclose security vulnerabilities through public GitHub issues, discussions, or pull requests.

### ✅ Responsible Disclosure Process

1. **Email:** [contato@fercarvalho.com](mailto:contato@fercarvalho.com)
2. **Subject:** `[SECURITY] Brief description of the issue`
3. **Include:**
   - Detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Affected versions
   - Suggested fix (if available)

### 🕒 Response Timeline

- **Initial Response:** Within 48 hours (weekdays)
- **Critical:** Fix within 24-72 hours
- **High:** Fix within 7 days
- **Medium:** Fix within 14 days
- **Low:** Fix within 30 days

---

## 🛡️ Security Features

### Authentication & Session Management
- ✅ JWT access tokens — 15-minute expiration
- ✅ Refresh tokens — 7-day expiration with automatic rotation
- ✅ Token theft detection — revokes entire token family on reuse
- ✅ Active sessions per device with geolocation (geoip-lite)
- ✅ Configurable session limit per user (default: 5)
- ✅ bcrypt password hashing (cost factor 10)
- ✅ Secure password reset via time-limited tokens (SendGrid)

### Role-Based Access Control
- ✅ Four roles: `guest`, `user`, `admin`, `superadmin`
- ✅ Protected modules (admin, sessions, anomalies, security_alerts) cannot be deactivated
- ✅ Superadmin impersonation with audit trail and visual banner

### Input Validation & Sanitization
- ✅ express-validator on all critical routes
- ✅ express-mongo-sanitize (NoSQL injection prevention)
- ✅ xss-clean middleware
- ✅ hpp (HTTP Parameter Pollution protection)
- ✅ 100% prepared statements (SQL Injection prevention)

### Security Headers (Helmet.js)
- ✅ Content Security Policy (CSP)
- ✅ Strict-Transport-Security (HSTS — 1 year)
- ✅ X-Frame-Options: DENY (clickjacking protection)
- ✅ X-Content-Type-Options: nosniff
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ X-Powered-By removed

### Rate Limiting
- ✅ General: 1000 req/15min
- ✅ Login: 10 attempts/15min (brute force protection)
- ✅ Resource creation: 100/hour
- ✅ File uploads: 20/hour

### Anomaly Detection & Alerts
- ✅ ML-based behavioral anomaly detection (Z-score + baseline)
- ✅ Monitors: new country, unusual hours, multiple IPs, abnormal volume
- ✅ Automated email alerts via SendGrid (brute force, token theft, new country, etc.)
- ✅ Monitoring job runs every 15 minutes

### Audit Logging
- ✅ All critical operations logged to PostgreSQL (`audit_logs` table)
- ✅ Sensitive data masked in logs (passwords, tokens, CPF)
- ✅ IP address, User-Agent, timestamp, operation, status recorded

### Data Protection
- ✅ Sensitive field encryption at rest (AES-256-GCM)
- ✅ HTTPS enforced in production (automatic redirect)
- ✅ CORS whitelist (configured via environment variable)
- ✅ `.env` excluded from version control

---

## 📋 Security Audit History

### 2026-03-22 — Post-Implementation Audit
**Score:** 9.8/10
**OWASP Top 10 Compliance:** 95%+

**Implemented in this audit cycle:**
- ✅ Refresh tokens with rotation
- ✅ Active sessions management
- ✅ Anomaly detection (ML)
- ✅ Security alerts (email)
- ✅ Impersonation system
- ✅ Superadmin role
- ✅ Encryption at rest (AES-256-GCM)
- ✅ mongoSanitize, xss-clean, hpp middlewares

**Remaining issues:** See [TECH-DEBT.md](TECH-DEBT.md)

---

## 🚨 Known Vulnerabilities

### Active

#### xlsx Library — Prototype Pollution & ReDoS
**Severity:** HIGH
**Status:** Documented as technical debt
**Mitigations in place:**
- File size limit: 5MB
- Rate limiting on upload endpoints (20/hour)
- Filename sanitization
- Uploads isolated from application code

**Planned fix:** Migration to `exceljs` (see TECH-DEBT.md)

---

## 🎯 Scope

**In Scope:**
- Web application (frontend + backend API)
- Authentication & authorization
- Session management
- API endpoints
- File upload functionality
- Database interactions
- Third-party dependencies

**Out of Scope:**
- Infrastructure (hosting, network, firewall)
- Physical security
- DDoS (handled at infrastructure level)

---

## 🔐 Security Checklist for Contributors

Before submitting changes, verify:

- [ ] No hardcoded secrets or API keys
- [ ] All user inputs validated and sanitized
- [ ] SQL queries use prepared statements (`$1`, `$2`)
- [ ] Sensitive data not logged in plaintext
- [ ] New endpoints have `authenticateToken` middleware
- [ ] Admin/superadmin routes have appropriate role middleware
- [ ] Critical operations logged to `audit_logs`
- [ ] Error messages don't expose internal details

See also: [docs/07 - BOAS-PRATICAS-DE-SEGURANCA.md](docs/07%20-%20BOAS-PRATICAS-DE-SEGURANCA.md)

---

## 🔄 Security Maintenance Schedule

- **Dependency Audits:** `npm audit` before each deploy
- **Manual Security Review:** Monthly
- **Credential Rotation:** Every 6 months
- **Next Full Audit:** 2026-06-22

---

## 📞 Contact

- **Email:** [contato@fercarvalho.com](mailto:contato@fercarvalho.com)
- **Response Time:** Within 48 hours (weekdays)

---

**Last Updated:** 2026-03-22
**Next Review:** 2026-06-22
