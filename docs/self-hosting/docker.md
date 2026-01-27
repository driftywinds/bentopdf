# Deploy with Docker / Podman

The easiest way to self-host BentoPDF in a production environment.

> [!IMPORTANT]
> **Required Headers for Office File Conversion**
>
> LibreOffice-based tools (Word, Excel, PowerPoint conversion) require these HTTP headers for `SharedArrayBuffer` support:
>
> - `Cross-Origin-Opener-Policy: same-origin`
> - `Cross-Origin-Embedder-Policy: require-corp`
>
> The official container images include these headers. If using a reverse proxy (Traefik, Caddy, etc.), ensure these headers are preserved or added.

> [!TIP]
> **Podman Users:** All `docker` commands work with Podman by replacing `docker` with `podman` and `docker-compose` with `podman-compose`.

## Quick Start

```bash
# Docker
docker run -d \
  --name bentopdf \
  -p 3000:8080 \
  --restart unless-stopped \
  ghcr.io/alam00000/bentopdf:latest

# Podman
podman run -d \
  --name bentopdf \
  -p 3000:8080 \
  ghcr.io/alam00000/bentopdf:latest
```

## Docker Compose / Podman Compose

Create `docker-compose.yml`:

```yaml
services:
  bentopdf:
    image: ghcr.io/alam00000/bentopdf:latest
    container_name: bentopdf
    ports:
      - '3000:8080'
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080']
      interval: 30s
      timeout: 10s
      retries: 3
```

Run:

```bash
# Docker Compose
docker compose up -d

# Podman Compose
podman-compose up -d
```

## Build Your Own Image

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:

```bash
docker build -t bentopdf:custom .
docker run -d -p 3000:8080 bentopdf:custom
```

## Environment Variables

| Variable      | Description                     | Default |
| ------------- | ------------------------------- | ------- |
| `SIMPLE_MODE` | Build without LibreOffice tools | `false` |
| `BASE_URL`    | Deploy to subdirectory          | `/`     |

Example:

```bash
docker run -d \
  -e SIMPLE_MODE=true \
  -p 3000:8080 \
  ghcr.io/alam00000/bentopdf:latest
```

## With Traefik (Reverse Proxy)

```yaml
services:
  traefik:
    image: traefik:v2.10
    command:
      - '--providers.docker=true'
      - '--entrypoints.web.address=:80'
      - '--entrypoints.websecure.address=:443'
      - '--certificatesresolvers.letsencrypt.acme.email=you@example.com'
      - '--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json'
      - '--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web'
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt

  bentopdf:
    image: ghcr.io/alam00000/bentopdf:latest
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.bentopdf.rule=Host(`pdf.example.com`)'
      - 'traefik.http.routers.bentopdf.entrypoints=websecure'
      - 'traefik.http.routers.bentopdf.tls.certresolver=letsencrypt'
      - 'traefik.http.services.bentopdf.loadbalancer.server.port=8080'
      # Required headers for SharedArrayBuffer (LibreOffice WASM)
      - 'traefik.http.routers.bentopdf.middlewares=bentopdf-headers'
      - 'traefik.http.middlewares.bentopdf-headers.headers.customresponseheaders.Cross-Origin-Opener-Policy=same-origin'
      - 'traefik.http.middlewares.bentopdf-headers.headers.customresponseheaders.Cross-Origin-Embedder-Policy=require-corp'
    restart: unless-stopped
```

## With Caddy (Reverse Proxy)

```yaml
services:
  caddy:
    image: caddy:2
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

  bentopdf:
    image: ghcr.io/alam00000/bentopdf:latest
    restart: unless-stopped

volumes:
  caddy_data:
```

Caddyfile:

```
pdf.example.com {
    reverse_proxy bentopdf:8080
    header Cross-Origin-Opener-Policy "same-origin"
    header Cross-Origin-Embedder-Policy "require-corp"
}
```

## Resource Limits

```yaml
services:
  bentopdf:
    image: ghcr.io/alam00000/bentopdf:latest
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
```

## Podman Quadlet (Systemd Integration)

[Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) allows you to run Podman containers as systemd services. This is ideal for production deployments on Linux systems.

### Basic Quadlet Setup

Create a container unit file at `~/.config/containers/systemd/bentopdf.container` (user) or `/etc/containers/systemd/bentopdf.container` (system):

```ini
[Unit]
Description=BentoPDF - Privacy-first PDF toolkit
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/alam00000/bentopdf:latest
ContainerName=bentopdf
PublishPort=3000:8080
AutoUpdate=registry

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

### Enable and Start

```bash
# Reload systemd to detect new unit
systemctl --user daemon-reload

# Start the service
systemctl --user start bentopdf

# Enable on boot
systemctl --user enable bentopdf

# Check status
systemctl --user status bentopdf

# View logs
journalctl --user -u bentopdf -f
```

> [!TIP]
> For system-wide deployment, use `systemctl` without `--user` flag and place the file in `/etc/containers/systemd/`.

### Simple Mode Quadlet

For Simple Mode deployment, create `bentopdf-simple.container`:

```ini
[Unit]
Description=BentoPDF Simple Mode - Clean PDF toolkit
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/alam00000/bentopdf-simple:latest
ContainerName=bentopdf-simple
PublishPort=3000:8080
AutoUpdate=registry

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

### Quadlet with Health Check

```ini
[Unit]
Description=BentoPDF with health monitoring
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/alam00000/bentopdf:latest
ContainerName=bentopdf
PublishPort=3000:8080
AutoUpdate=registry
HealthCmd=curl -f http://localhost:8080 || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

### Auto-Update with Quadlet

Podman can automatically update containers when new images are available:

```bash
# Enable auto-update timer
systemctl --user enable --now podman-auto-update.timer

# Check for updates manually
podman auto-update

# Dry run (check without updating)
podman auto-update --dry-run
```

### Quadlet Network Configuration

For custom network configuration, create a network file `bentopdf.network`:

```ini
[Network]
Subnet=10.89.0.0/24
Gateway=10.89.0.1
```

Then reference it in your container file:

```ini
[Container]
Image=ghcr.io/alam00000/bentopdf:latest
ContainerName=bentopdf
PublishPort=3000:8080
Network=bentopdf.network
```

## Updating

```bash
# Pull latest image
docker compose pull

# Recreate container
docker compose up -d
```
