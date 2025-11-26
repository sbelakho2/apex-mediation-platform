# DigitalOcean — Initial Boot Commands (FRA1 droplet)

Purpose: Copy‑pasteable, safe, minimal commands to harden a fresh Ubuntu droplet, install Docker, clone the repo to `/opt/apex`, and prepare for TLS issuance with certbot. Run only after the DO account exists and the droplet is created in FRA1.

Notes
- Replace placeholders in angle brackets.
- These commands avoid business‑logic changes and follow the Infra Migration Plan.

---

## 0) Connect to droplet and set hostname
```bash
ssh root@<DROPLET_PUBLIC_IP>
hostnamectl set-hostname apex-core-1
```

## 1) Create deploy user and harden SSH
```bash
adduser deploy --disabled-password --gecos "Deploy User"
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
echo "<YOUR_DEPLOY_PUBKEY>" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

## 2) UFW firewall
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

## 3) Base packages and security updates
```bash
apt-get update && apt-get -y upgrade
apt-get -y install curl ca-certificates gnupg lsb-release fail2ban unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
systemctl enable --now fail2ban
```

## 4) Install Docker (Engine + Compose plugin)
```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
```

## 5) Prepare project directory and clone repo
```bash
mkdir -p /opt/apex
chown -R deploy:deploy /opt/apex
su - deploy -c "cd /opt/apex && git clone <REPO_GIT_URL> . && git checkout <BRANCH_OR_TAG>"
```

## 6) Compose prod‑like stack (HTTP only first)
```bash
su - deploy <<'EOF'
set -e
cd /opt/apex
export REDIS_PASSWORD=$(openssl rand -hex 16)
docker compose -f infrastructure/docker-compose.prod.yml up -d --build
docker compose -f infrastructure/docker-compose.prod.yml ps
curl -i http://localhost/health || true
EOF
```

## 7) Issue TLS certificates with certbot (host‑level)
```bash
apt-get -y install certbot
systemctl stop nginx || true
certbot certonly --standalone \
  -d api.apexmediation.ee -d console.apexmediation.ee \
  --email ops@apexmediation.ee --agree-tos --non-interactive

# Renewal dry run
certbot renew --dry-run
```

## 8) Enable HTTPS in Nginx container and reload
```bash
su - deploy <<'EOF'
set -e
cd /opt/apex
# Ensure /etc/letsencrypt is bind-mounted read‑only (already in compose)
# Enable SSL config and 443 mapping if commented in your compose (edit if needed)
docker compose -f infrastructure/docker-compose.prod.yml up -d nginx
EOF

# External checks (run from your workstation after DNS is set):
# - SSL Labs scans (expect A/A+)
# - openssl s_client -connect api.apexmediation.ee:443 -status | sed -n '1,25p'
```

## 9) Post‑validation: enable HSTS (after A/A+)
```bash
# On the repo: uncomment HSTS header in infrastructure/nginx/snippets/ssl-params.conf
# and set ENABLE_HSTS=1 for the Website env at next deploy. Then reload Nginx.
```

Reference
- See DO Readiness Checklist for full flip sequence and evidence to capture.
