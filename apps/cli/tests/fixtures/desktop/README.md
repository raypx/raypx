# Synthetic Desktop TLS fixture

The certificate and private key in this directory are public test data for the
loopback-only Desktop session integration suite. They are never loaded by runtime
code. The suite accepts this certificate only through its injected test fetch;
the production fetch must reject it. No real account or server credentials exist
in these files.
