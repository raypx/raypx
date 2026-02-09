# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

### Preferred Method: Security Email

Email us at: **security@raypx.com**

Please include the following information:
- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected code (tag, branch, or commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

### Alternative: Private Security Advisory

If you prefer, you can create a [private security advisory](https://github.com/raypx/raypx/security/advisories/new) on GitHub.

## What to Expect

1. **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
2. **Initial Assessment**: We will provide an initial assessment within 7 days
3. **Updates**: We will keep you informed of our progress
4. **Resolution**: We will work to resolve the issue as quickly as possible

## Disclosure Policy

We follow a **coordinated disclosure** process:

1. **Private Reporting**: Report the vulnerability privately
2. **Investigation**: We investigate and verify the issue
3. **Fix Development**: We develop and test a fix
4. **Public Disclosure**: After a fix is released, we may publicly disclose the vulnerability (with credit if desired)

**Timeline**: We aim to resolve critical vulnerabilities within 30 days, and high-severity issues within 90 days.

## Security Best Practices

### For Users

- Keep your dependencies up to date
- Use strong, unique passwords
- Enable two-factor authentication (2FA) when available
- Regularly review and rotate API keys
- Monitor your account for suspicious activity

### For Developers

- Never commit secrets or API keys to the repository
- Use environment variables for sensitive configuration
- Follow the principle of least privilege
- Keep dependencies updated (`pnpm update --latest`)
- Review security advisories for dependencies

## Security Features

Raypx includes several built-in security features:

- **Authentication**: Better Auth with secure session management
- **Authorization**: Role-based access control (RBAC)
- **API Security**: Rate limiting and API key management
- **Data Protection**: Encryption at rest and in transit
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Drizzle ORM with parameterized queries
- **XSS Protection**: React's built-in XSS protection
- **CSRF Protection**: Built-in CSRF tokens

## Known Security Considerations

### Environment Variables

Never expose these in client-side code:
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- Any API keys or secrets

### Database Security

- Use parameterized queries (Drizzle ORM handles this)
- Never concatenate user input into SQL queries
- Use database user with minimal required permissions
- Enable SSL/TLS for database connections in production

### API Security

- All API endpoints require authentication by default
- Use rate limiting for public endpoints
- Validate and sanitize all user input
- Use HTTPS in production

## Security Updates

Security updates are released as:
- **Patch versions** (x.x.1) for critical security fixes
- **Minor versions** (x.1.0) for security enhancements
- **Major versions** (1.0.0) for breaking security changes

Subscribe to security advisories:
- Watch this repository for security releases
- Check [GitHub Security Advisories](https://github.com/raypx/raypx/security/advisories)

## Responsible Disclosure

We appreciate responsible disclosure of security vulnerabilities. We will:

- Credit you in security advisories (if desired)
- Work with you to understand and resolve the issue
- Keep you informed throughout the process

## Security Checklist for Contributors

Before submitting code, ensure:

- [ ] No secrets or credentials in code
- [ ] Input validation on all user inputs
- [ ] Proper error handling (no sensitive info in errors)
- [ ] Authentication/authorization checks in place
- [ ] SQL injection prevention (use Drizzle ORM)
- [ ] XSS prevention (React handles this, but be careful with `dangerouslySetInnerHTML`)
- [ ] Rate limiting on public endpoints
- [ ] HTTPS enforced in production
- [ ] Dependencies are up to date

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [React Security](https://react.dev/learn/escape-hatches#dangerously-setting-the-inner-html)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

## Contact

For security-related questions or concerns:
- **Email**: security@raypx.com
- **GitHub Security Advisories**: [Create an advisory](https://github.com/raypx/raypx/security/advisories/new)

---

**Thank you for helping keep Raypx secure!** 🔒

