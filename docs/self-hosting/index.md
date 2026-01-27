# Self-Hosting Guide

BentoPDF can be self-hosted on your own infrastructure. This guide covers various deployment options.

## Quick Start with Docker / Podman

The fastest way to self-host BentoPDF:

```bash
# Docker
docker run -d -p 3000:8080 ghcr.io/alam00000/bentopdf:latest

# Podman
podman run -d -p 3000:8080 ghcr.io/alam00000/bentopdf:latest
```

Or with Docker Compose / Podman Compose:

```yaml
# docker-compose.yml
services:
  bentopdf:
    image: ghcr.io/alam00000/bentopdf:latest
    ports:
      - '3000:8080'
    restart: unless-stopped
```

```bash
# Docker Compose
docker compose up -d

# Podman Compose
podman-compose up -d
```

## Podman Quadlet (Linux Systemd)

Run BentoPDF as a systemd service. Create `~/.config/containers/systemd/bentopdf.container`:

```ini
[Container]
Image=ghcr.io/alam00000/bentopdf:latest
ContainerName=bentopdf
PublishPort=3000:8080
AutoUpdate=registry

[Service]
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now bentopdf
```

See [Docker deployment guide](/self-hosting/docker) for full Quadlet documentation.

## Building from Source

```bash
# Clone and build
git clone https://github.com/alam00000/bentopdf.git
cd bentopdf
npm install
npm run build

# The built files are in the `dist` folder
```

## Configuration Options

### Simple Mode

Simple Mode is designed for internal organizational use where you want to hide all branding and marketing content, showing only the essential PDF tools.

**What Simple Mode hides:**

- Navigation bar
- Hero section with marketing content
- Features, FAQ, testimonials sections
- Footer
- Updates page title to "PDF Tools"

```bash
# Build with Simple Mode
SIMPLE_MODE=true npm run build

# Or use the pre-built Docker image
docker run -p 3000:8080 bentopdfteam/bentopdf-simple:latest
```

See [SIMPLE_MODE.md](https://github.com/alam00000/bentopdf/blob/main/SIMPLE_MODE.md) for full details.

### Base URL

Deploy to a subdirectory:

```bash
BASE_URL=/pdf-tools/ npm run build
```

## Deployment Guides

Choose your platform:

- [Vercel](/self-hosting/vercel)
- [Netlify](/self-hosting/netlify)
- [Cloudflare Pages](/self-hosting/cloudflare)
- [AWS S3 + CloudFront](/self-hosting/aws)
- [Hostinger](/self-hosting/hostinger)
- [Nginx](/self-hosting/nginx)
- [Apache](/self-hosting/apache)
- [Docker](/self-hosting/docker)
- [Kubernetes](/self-hosting/kubernetes)
- [CORS Proxy](/self-hosting/cors-proxy) - Required for digital signatures

## System Requirements

| Requirement | Minimum                         |
| ----------- | ------------------------------- |
| Storage     | ~500 MB (with all WASM modules) |
| RAM         | 512 MB                          |
| CPU         | Any modern processor            |

::: tip
BentoPDF is a static site—there's no database or backend server required!
:::
