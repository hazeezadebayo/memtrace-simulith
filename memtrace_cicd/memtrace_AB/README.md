# MemTrace - Qwen Hackathon CI/CD Deployment

This directory contains the CI/CD deployment configuration required to deploy **MemTrace** on Alibaba Cloud for the Global AI Hackathon Series with Qwen Cloud.

## TL;DR (Too Long; Didn't Read)

To deploy MemTrace on a fresh Alibaba Cloud instance (ECS or SAS), clone your repository, navigate to this folder, and execute the deployment script:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## ☁️ Architecture & Hackathon Rules Compliance

Following the Qwen Hackathon **"Proof of Deploy 1 Pager"** rules, we are using the **Option A: Docker Compose (multi-service)** deployment strategy. 
This ensures the environment is deterministic, containerized, and easily reproducible across any Alibaba Cloud Ubuntu instance.

### Step-by-step Deployment Breakdown

The deployment process involves provisioning cloud infrastructure, configuring security, and running the CI/CD script.

### 1. Provisioning Alibaba Cloud Instance
You can choose between two compute options depending on your needs:
- **Elastic Compute Service (ECS)**: Recommended for maximum control or if you need to set up custom VPC networking.
- **Simple Application Server (SAS/SWAS)**: Recommended for predictable monthly pricing and faster setup.

**OS Choice:** Select an **Ubuntu 22.04 LTS** image (or the Docker application image if using SAS).

### 2. Network & Security Groups (Firewall)
By default, cloud firewalls block incoming traffic to custom ports. The MemTrace API application listens on **port 3000**.
- **For ECS**: Go to your instance's Security Group and add an inbound rule allowing **TCP Port 3000** (Source `0.0.0.0/0` or restrict to your own IP).
- **For SAS**: Go to the Firewall tab for your server and add a rule allowing **TCP Port 3000**.
- Ensure SSH (**Port 22**) is also open so you can connect.

### 3. Environment Variables (`.env`)
Before deployment, you must provide your Qwen API credentials. MemTrace relies on `.env` files for secrets management.
Ensure you have created the `.env` file at `memtrace_cicd/memtrace_HF/.env` with your Qwen API key (from `home.qwencloud.com/api-keys`):

```bash
DASHSCOPE_API_KEY=sk-your-qwen-key-here
# Add any other MemTrace-specific variables here
```
*Note: Do NOT mix Token Plan keys (`sk-sp-xxxxx`) with pay-as-you-go endpoints to avoid 401 errors.*

### 4. Running the CI/CD Script (`deploy.sh`)
The `deploy.sh` script automates the internal setup of the instance. Here is what the script does under the hood:
1. **Docker Installation:** Automatically detects if Docker is installed. If not, it safely installs `docker-ce` and `docker-compose-plugin` using the official Docker apt repository.
2. **Service Enablement:** Starts the Docker daemon and ensures it restarts on system reboot.
3. **Permissions:** Adds the current user to the `docker` group so you don't need to run every docker command with `sudo`.
4. **Firewall (UFW) Configuration:** If the Uncomplicated Firewall (`ufw`) is running, it automatically punches holes for ports 22 and 3000.
5. **Orchestration:** Navigates to `../../memtrace/docker` and executes `docker compose up -d --build`. This pulls down all dependencies and boots up your application in isolated containers.

---

## ✅ Verifying the Deployment

Once the script completes, verify that the containers are healthy:

```bash
# Verify the api container is running
docker ps

# Stream the application logs to ensure there are no startup errors
cd ../../memtrace/docker
docker compose logs -f api
```

### Hackathon Submission Proof
Visit your instance's public IP on port 3000 in your browser: 
`http://<ALIBABA_PUBLIC_IP>:3000`

To satisfy the hackathon **Proof of Alibaba Cloud Deployment** requirement:
1. Go to your Alibaba Cloud Console (ECS or SAS dashboard).
2. Take a screenshot showing your Workbench Overview or Server Overview page proving the server is running. Ensure the IP address matches where MemTrace is being served.
