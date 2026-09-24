# Install: OpenClaw (local & Cloud) · Chrome Web Store

Bilingual guide — **Deutsch** first, then **English**.

---

## Deutsch

### Was noch fehlt, bis es „öffentlich“ läuft

AgentVisualEditor besteht aus **zwei** Verteilwegen:

| Teil | Wo installieren | Status heute |
|------|-----------------|--------------|
| **OpenClaw Plugin** | Gateway (lokal oder Cloud) via ClawHub / git / lokal | Code fertig; Veröffentlichung auf ClawHub noch ausstehend |
| **Chrome Extension** | Chrome (unpacked) oder Chrome Web Store | Icons + Build fertig; Store-Listing + Review noch ausstehend |

Ohne ClawHub-/Store-Release kannst du beides **jetzt** lokal nutzen (`docs/setup.md`).

### A) OpenClaw — lokal (Entwicklung)

```bash
cd packages/openclaw-plugin
npm run build && npm run validate
openclaw plugins install .
# oder Dev-Link:
# openclaw plugins install --link .
openclaw gateway restart
```

1. OpenClaw **Settings → Labs → Custom plugin UI** aktivieren.  
2. Composer-UI: **AVE Composer mit Chips** / **AVE Composer with chips** wählen (Sprache folgt der UI).  
3. Seite **AVE Status**: Pairing-Code erzeugen.  
4. Extension laden (`packages/extension` → `npm run build` → `dist-ext` unpacked) und koppeln.

### B) OpenClaw Cloud / ClawHub (Produktion)

OpenClaw Cloud nutzt denselben Plugin-Mechanismus wie ein self-hosted Gateway. Das Plugin muss als **ClawHub-Paket** (oder git/npm) erreichbar sein.

#### 1. Paket vorbereiten

```bash
cd packages/openclaw-plugin
npm run build && npm run validate
# optional: openclaw plugins pack --json
```

In `package.json`:

- `private: false` setzen, wenn veröffentlicht wird  
- Scoped Name wählen, der zum ClawHub-Owner passt, z. B. `@dein-owner/agent-visual-editor`  
- `openclaw.compat.pluginApi` und `openclaw.build.openclawVersion` sind bereits gesetzt  

#### 2. Auf ClawHub veröffentlichen

Offizielle Docs: [Building plugins](https://docs.openclaw.ai/plugins/building-extensions), [ClawHub publishing](https://docs.openclaw.ai/clawhub/publishing).

```bash
npm i -g clawhub
clawhub login
clawhub package validate .
clawhub package publish . --dry-run
clawhub package publish . --wait
```

#### 3. Auf Cloud-/Gateway-Instanz installieren

```bash
openclaw plugins install clawhub:@dein-owner/agent-visual-editor
# Alternativen:
# openclaw plugins install git:github.com/iamthamanic/AgentVisualEditor@main
# openclaw plugins install npm:@dein-owner/agent-visual-editor
openclaw plugins enable agent-visual-editor
openclaw gateway restart
openclaw plugins inspect agent-visual-editor --runtime --json
```

Dann wieder: Labs Custom Plugin UI → AVE Composer → Pairing → Extension.

**Wichtig:** Die Chrome Extension läuft immer lokal im Browser. Cloud-Gateway braucht eine von der Extension erreichbare Bridge-URL (HTTPS/WSS), nicht nur `127.0.0.1`, außer du tunnelst.

### C) Chrome Web Store

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) — Account (~5 $).  
2. Extension bauen: `cd packages/extension && npm run build`.  
3. ZIP von `dist-ext` (ohne `.map`, wenn gewünscht).  
4. Assets: `icons/icon-128.png`, Screenshots (Side Panel + Inspector), Privacy-URL (`docs/privacy.md` gehostet).  
5. Berechtigung **`<all_urls>`** ehrlich begründen (Inspect + Element-Vorschau).  
6. Version in `manifest.json` erhöhen, Review einreichen.

---

## English

### What’s left for a public rollout

AgentVisualEditor has **two** distribution paths:

| Piece | Where | Status today |
|-------|--------|--------------|
| **OpenClaw plugin** | Gateway (local or Cloud) via ClawHub / git / local path | Code ready; ClawHub publish still todo |
| **Chrome extension** | Unpacked Chrome or Chrome Web Store | Build + icons ready; store listing + review still todo |

You can use both **locally now** without publishing (`docs/setup.md`).

### A) OpenClaw — local (dev)

```bash
cd packages/openclaw-plugin
npm run build && npm run validate
openclaw plugins install .
openclaw gateway restart
```

1. Enable **Settings → Labs → Custom plugin UI**.  
2. Pick **AVE Composer with chips** / **AVE Composer mit Chips**.  
3. Open **AVE Status**, generate a pairing code.  
4. Build/load the extension (`packages/extension/dist-ext`) and pair.

### B) OpenClaw Cloud / ClawHub (production)

Cloud gateways install the same plugin package as self-hosted ones. Publish to **ClawHub** (or offer git/npm).

#### 1. Prepare the package

```bash
cd packages/openclaw-plugin
npm run build && npm run validate
```

Update `package.json` for publish: `private: false`, scoped name matching your ClawHub owner (e.g. `@your-owner/agent-visual-editor`). Compat fields are already present.

#### 2. Publish to ClawHub

See [Building plugins](https://docs.openclaw.ai/plugins/building-extensions) and [ClawHub publishing](https://docs.openclaw.ai/clawhub/publishing).

```bash
npm i -g clawhub
clawhub login
clawhub package validate .
clawhub package publish . --dry-run
clawhub package publish . --wait
```

#### 3. Install on the Cloud / gateway host

```bash
openclaw plugins install clawhub:@your-owner/agent-visual-editor
openclaw plugins enable agent-visual-editor
openclaw gateway restart
openclaw plugins inspect agent-visual-editor --runtime --json
```

Then: Labs Custom Plugin UI → AVE composer → pairing → extension.

**Note:** The Chrome extension always runs in the user’s browser. A cloud gateway needs a reachable bridge URL (HTTPS/WSS), not only `127.0.0.1`, unless you tunnel.

### C) Chrome Web Store

1. Chrome Web Store developer account.  
2. `cd packages/extension && npm run build` → zip `dist-ext`.  
3. Listing assets: 128px icon, screenshots, privacy policy URL.  
4. Justify `<all_urls>` (Inspect Mode + element preview screenshots).  
5. Bump `manifest.json` version and submit for review.

---

## Language (DE / EN)

- **OpenClaw Control UI** (`packages/openclaw-plugin`): strings follow the browser/OpenClaw UI language (`de*` → German, otherwise English).  
- **Chrome side panel** (`packages/extension`): same rule via `navigator.language`.
