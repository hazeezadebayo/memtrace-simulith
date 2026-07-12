#!/bin/bash
# Install Docker and Docker Compose on Debian (Official Way)
# Reference: https://docs.docker.com/engine/install/debian/
# Run with: sudo ./docker/install_docker.sh

set -e

echo "Uninstalling conflicting packages (if any)..."
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt-get remove -y $pkg || true; done

echo "Installing prerequisites..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

echo "Setting up Docker's official GPG key..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "Adding Docker repository..."
# NOTE: Using 'bookworm' (Debian 12) repository as 'trixie' (Debian 13/Testing) 
# usually does not have a dedicated Docker release yet.
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  bookworm stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "Installing Docker Engine and Compose..."
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Adding current user to docker group..."
sudo usermod -aG docker $USER

echo "Done! Please log out and back in (or run 'newgrp docker') to use docker without sudo."
bash -c "docker compose version"
