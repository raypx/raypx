# External browser and Page forms

In a Web conversation, open **Browser** and enter an HTTPS URL on an admitted
host. Ask the Agent to fill the form. The approval shows the proposed field names
and values. After approval, the side panel shows the same browser the Agent
filled. Select **Take control** to review, edit or submit it with the website's
own controls. A site can save or react to input immediately. Takeover invalidates
the previous inspection, so a subsequent Agent fill needs a fresh approval.

For a Raypx HTML Page, ask the Agent to fill the Page's form. Approve the values,
then open the **Form draft filled** result to see the recorded version in the
existing Page preview. The draft belongs to the member who initiated the Run
and appears on that version's authenticated document only. Public links, saved
source and versions retain their original content. Page form drafts do not
require the external browser service.

Both flows accept named text inputs and text areas. The external browser is
available in Web and finds visible fields with unique names in the top-level
document. The preview shows periodic live frames and supports clicking, scrolling,
text input and common editing keys when the member has control.

## Private broker deployment

Build the broker from the repository root with the published digest for the Bun
version in the root manifest.

```sh
docker build -f infra/browser/Dockerfile \
  --build-arg BUN_IMAGE_DIGEST="$BUN_IMAGE_DIGEST" \
  -t raypx/browser .
```

Run the broker on an isolated private service accessible from the API and worker.
Expose no public ingress or agent-browser stream port. Enforce network egress
outside the broker to deny internal services, private addresses and cloud metadata,
and to admit only the intended HTTPS destinations. The hostname checks in the app
and agent-browser supplement that network policy.

| Service        | Variable                     | Value                                                                              |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Broker         | `RAYPX_BROWSER_BROKER_TOKEN` | A randomly generated secret of at least 32 characters                              |
| Broker         | `RAYPX_BROWSER_HOSTS`        | Comma-separated exact HTTPS hostnames, including needed redirects and dependencies |
| Broker         | `RAYPX_BROWSER_HOST`         | Bind address for the private network, default `127.0.0.1`                          |
| Broker         | `RAYPX_BROWSER_PORT`         | Private HTTP port, default `8091`                                                  |
| API and worker | `BROWSER_BROKER_URL`         | The broker's private HTTP or HTTPS origin                                          |
| API and worker | `BROWSER_BROKER_TOKEN`       | The same broker token                                                              |

The broker keeps browser state in temporary sessions scoped to one member and
conversation. Sessions are evicted after 10 minutes idle or 30 minutes total.
For a local Bun process, `RAYPX_AGENT_BROWSER_BIN` and
`RAYPX_BROWSER_CHROME_BIN` can select prepared binaries.
