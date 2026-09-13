# Deploying to Oracle Cloud

One VM running four containers. The compose stack itself is in [`compose.yaml`](../compose.yaml)
and is not Oracle-specific — everything below is.

## 1. The instance

Create a compute instance on the **Always Free** Ampere A1 shape: `VM.Standard.A1.Flex`,
4 OCPU / 24 GB. That is the whole free ARM allocation in one instance, which is the right
call here — the build compiles the studio with Vite, and doing that on a 1 GB
micro instance means adding swap and waiting.

- **Image**: Ubuntu 24.04 (aarch64). Oracle Linux works too; the package commands below
  are the Ubuntu ones.
- **Boot volume**: bump it to 100 GB. The free tier allows 200 GB total and the default
  47 GB gets tight once you have images, the Postgres volume and a fortnight of dumps.
- **SSH key**: add yours at creation. There is no password login to fall back on.

Ampere is **arm64**. Both Dockerfiles are architecture-agnostic and everything they
install has arm64 builds — including `@node-rs/argon2`, which is the one native module in
the tree. Build on the instance itself and this never comes up; build on your Windows
machine and push, and you would need `--platform linux/arm64`.

## 2. Open the ports — both times

This is the step that wastes an afternoon if you miss half of it. OCI filters traffic in
two independent places and opening one does nothing without the other.

**Security list** (VCN → Subnet → Security List → Add Ingress Rules), stateless off:

| Source    | Protocol | Destination port |
| --------- | -------- | ---------------- |
| 0.0.0.0/0 | TCP      | 80               |
| 0.0.0.0/0 | TCP      | 443              |
| 0.0.0.0/0 | UDP      | 443              |

UDP 443 is for HTTP/3. Skip it and everything still works over TCP.

**The instance's own firewall.** Oracle's Ubuntu images ship iptables rules that reject
everything except SSH, and they sit _above_ any rule you append — so `-A INPUT` appears
to work and changes nothing. Insert, don't append:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

On Oracle Linux it is firewalld instead:

```bash
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

## 3. Docker

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER" && newgrp docker
```

## 4. DNS

Point an A record at the instance's public IP and let it propagate **before** the first
`up`. Caddy asks Let's Encrypt for a certificate on boot; if the domain does not resolve
to this machine yet the challenge fails, and repeated failures get rate-limited for an
hour or so.

## 5. Deploy

```bash
git clone <your-remote> Ui-builder && cd Ui-builder
cp .env.example .env
nano .env          # SITE_ADDRESS, WEB_ORIGIN, POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d --build
```

First build takes roughly 5–10 minutes — two `npm ci` runs and a Vite build. After that:

```bash
docker compose ps           # migrate should read Exited (0); the rest Up
docker compose logs -f api
curl https://your-domain/health
```

The `migrate` container running once and exiting 0 is the expected state, not a failure.
The API will not start until it does — a schema that did not migrate should stop the
deploy rather than serve five hundred errors.

## 6. Backups

```bash
chmod +x deploy/backup.sh
sudo crontab -e
# 15 3 * * * /home/ubuntu/Ui-builder/deploy/backup.sh >> /var/log/ui-builder-backup.log 2>&1
```

Nightly `pg_dump`, gzipped into `backups/`, fourteen days kept. Restore instructions are
in the header of [`backup.sh`](backup.sh). Copy them off the instance periodically —
a backup that only exists on the machine it is backing up is not one.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on the way up. Postgres keeps its named volume, so data
survives. `docker compose down -v` is the command that does not — it deletes the volume,
and the certificates with it.

## What is not set up

- **Uploads.** No `S3_*` variables, so the asset routes answer 503 and the studio hides
  the upload button. The commented block in `.env.example` has the OCI Object Storage
  values, including the Customer Secret Key detail that trips people up.
- **Tests in CI.** The suite is disabled in `vitest.config.ts`, so what reaches `main` is
  checked by format, lint, typecheck and build only. Worth knowing, given this is now the
  path to production.
- **Automatic deploys.** `git pull && docker compose up -d --build` by hand. Wiring it to
  a push means giving CI an SSH key or standing up a registry, which is a bigger decision
  than it looks.
