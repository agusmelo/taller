#!/bin/bash
# One-time VPS hardening: firewall, SSH brute-force protection, automatic
# security patches, Docker log rotation. Idempotent — safe to re-run.
#
# Run as root (or with sudo) over SSH, BEFORE bringing up the app stack
# (this script restarts the Docker daemon, which restarts any running
# containers). Run it as step 1, per docs/production-runbook.md.
#
# IMPORTANT: keep your current SSH session open while this runs, and test a
# NEW connection in a second terminal before closing it — a firewall mistake
# here can lock you out of the box entirely.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root (sudo scripts/vps-setup.sh)." >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script assumes a Debian/Ubuntu host (apt-get not found)." >&2
  exit 1
fi

echo "== Installing ufw, fail2ban, unattended-upgrades =="
apt-get update -y
apt-get install -y ufw fail2ban unattended-upgrades

echo "== Firewall: allow SSH first, THEN enable (order matters) =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

echo "== fail2ban: sshd jail =="
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "== Unattended security upgrades =="
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

echo "== Docker daemon log rotation (this restarts Docker + all containers) =="
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

echo ""
echo "== Done. Verify: =="
echo "  ufw status"
echo "  fail2ban-client status sshd"
echo "  systemctl status unattended-upgrades"
echo "  docker info --format '{{.LoggingDriver}}'"
echo ""
echo "NOT automated (do this manually, deliberately, after confirming key-based"
echo "SSH login works from a NEW terminal):"
echo "  edit /etc/ssh/sshd_config -> PasswordAuthentication no"
echo "  (and PermitRootLogin no, if you're deploying as a non-root user)"
echo "  then: systemctl restart sshd"
