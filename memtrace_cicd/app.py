import os
import subprocess
import urllib.request

NODE_VERSION = "v20.11.1"
NODE_DIR = f"node-{NODE_VERSION}-linux-x64"
NODE_BIN = os.path.abspath(f"{NODE_DIR}/bin/node")
NPM_BIN = os.path.abspath(f"{NODE_DIR}/bin/npm")

def ensure_node():
    if not os.path.exists(NODE_DIR):
        print(f"📦 Downloading Node.js {NODE_VERSION}...")
        url = f"https://nodejs.org/dist/{NODE_VERSION}/{NODE_DIR}.tar.xz"
        urllib.request.urlretrieve(url, "node.tar.xz")
        print("📦 Extracting Node.js...")
        os.system("tar -xf node.tar.xz")
        os.remove("node.tar.xz")
    return NODE_BIN

def main():
    print("🚀 Starting Memtrace Gradio Bypass...")
    node_bin = ensure_node()
    
    # Hugging Face Spaces mandates port 7860
    os.environ["PORT"] = "7860"
    
    # Configure environment so npm and node are in PATH
    env = os.environ.copy()
    env["PATH"] = f"{os.path.abspath(f'{NODE_DIR}/bin')}:{env.get('PATH', '')}"
    
    # Install dependencies
    print("📦 Installing npm dependencies...")
    try:
        subprocess.run([NPM_BIN, "install"], check=True, env=env)
    except subprocess.CalledProcessError as e:
        print(f"❌ npm install failed: {e}")
        return

    # Start the Memtrace Server
    print("🚀 Booting Memtrace Server on port 7860...")
    try:
        # Execute the server. It uses api/memtrace_server.js as the main entry point
        subprocess.Popen([node_bin, "api/memtrace_server.js"], env=env).wait()
    except KeyboardInterrupt:
        print("🛑 Server stopped.")

if __name__ == "__main__":
    main()
