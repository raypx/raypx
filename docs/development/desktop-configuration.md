# Desktop connection configuration

Every Desktop installation uses the same package. Native reads
`~/.raypx/config.toml` once at startup; Windows uses `%USERPROFILE%\.raypx\config.toml`.
The first launch creates the directory and a commented TOML template, defaulting
to `https://raypx.pro`. Existing files are never overwritten. Public Web/API
build variables do not select the server for an installed Desktop.

This follows the user-level TOML and named-configuration approach described in
[OpenAI's Codex configuration documentation](https://learn.chatgpt.com/docs/config-file/config-basic).
Raypx's supported parameters and profile-table syntax are defined below.

## One server

```toml
base_url = "https://beta.raypx.pro"
```

Use a self-hosted Raypx origin in the same field. When Web and API share an origin,
this controls authentication, account reads, tasks, device registration, grant
renewal, relay WebSockets and account email callback links.

For a split deployment:

```toml
base_url = "https://api.example.com"
web_url = "https://app.example.com"
```

The server must implement the Raypx API/relay contract and allow `views://main`
as a trusted auth origin. HTTPS cookies retain their Secure/HttpOnly requirements.
See [self-hosted deployment](deployment.md). Switching endpoints does not deploy
or migrate a server.

## Named profiles

```toml
# Root fields must precede [profiles.*] tables in TOML.
profile = "beta"
base_url = "https://raypx.pro"

[profiles.beta]
base_url = "https://beta.raypx.pro"

[profiles.company]
base_url = "https://api.example.com"
web_url = "https://app.example.com"
```

Profiles are user-defined names, not release channels. Select one by changing
`profile`; omit it to use root defaults. Unknown profiles or unsupported options
are errors. Raypx's CLI `--profile` still selects its local SQLite profile and
does not select this Desktop connection.

| Parameter                  | Meaning                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `base_url`                 | API origin; defaults to `https://raypx.pro`                              |
| `web_url`                  | Web origin for verification/password-reset links; defaults to `base_url` |
| `profile`                  | Optional selected name in `profiles`                                     |
| `profiles.<name>.base_url` | Overrides the root API origin                                            |
| `profiles.<name>.web_url`  | Overrides the Web origin for this profile                                |

A selected profile takes precedence over root defaults. If it overrides
`base_url`, an omitted profile `web_url` follows that new origin, rather than
inheriting a different server's Web URL. If it only overrides `web_url`, the
root API origin remains in use.

Origins cannot include credentials, subpaths, query strings or fragments.
HTTPS is required except for loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`).
The file is limited to 16 KiB. It contains public connection settings only;
passwords, session cookies and provider credentials do not belong here.

## Apply and isolate

Quit Raypx from the tray/application menu and start it again after editing.
Closing the window only hides it and does not reload configuration. Invalid or
unreadable configuration stops startup with a native error dialog; Raypx does
not fall back to another server.

The normalized API origin scopes the persistent WebView/cookie partition,
remote opt-in and device binding, and local account-specific Agent history.
Ports count as distinct origins. Switching back restores that server's saved
state. Theme/language preferences and device-local CLI file grants/jobs remain
on the same computer.

Earlier versions did not scope their login/remote settings to a server. Those
unscoped sessions and opt-ins are not imported: sign in and enable remote tasks
again. Earlier unscoped local Agent history stays in SQLite and is not
automatically assigned to a deployment.

For isolated testing or a portable setup, `RAYPX_HOME` may name another absolute
configuration directory. It changes where `config.toml` is read, not the server
precedence. The GUI launched by Finder/Explorer may not inherit shell variables.
Native smoke tests always use their own temporary configuration directory.
