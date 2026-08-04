# 🔧 Installation Notes & Troubleshooting

## Node.js Version Compatibility

### ⚠️ Node v26 Issue

**Current System:** Node v26.0.0  
**Issue:** `better-sqlite3` v11 does not compile on Node v26 (released Aug 2026)

### ✅ Recommended Solutions

#### Option 1: Use Node v20 LTS (Recommended)

```bash
# Using nvm (Node Version Manager)
nvm install 20
nvm use 20

# Or using Homebrew
brew uninstall node
brew install node@20
brew link node@20
```

#### Option 2: Use Node v22

```bash
nvm install 22
nvm use 22
```

#### Option 3: Wait for better-sqlite3 Update

Monitor the [better-sqlite3 repository](https://github.com/WiseLibs/better-sqlite3) for Node v26 support.

---

## Installation Steps (After Node Version Fix)

```bash
# 1. Switch to compatible Node version
nvm use 20  # or nvm use 22

# 2. Clean install
rm -rf node_modules package-lock.json
npm install

# 3. Verify installation
npm run build

# 4. Seed database
npm run seed

# 5. Start dev server
npm run dev
```

---

## Alternative: Use Docker

If you can't change your Node version, run EpochBridge in Docker:

```bash
# Build the image (uses Node 20 internally)
docker build -t epochbridge:latest .

# Run the container
docker run -p 4000:4000 -v $(pwd)/data:/app/data epochbridge:latest
```

---

## Dependency Installation Issues

### better-sqlite3 Compilation Errors

**Requirements:**
- Python 3.x
- C++ build tools (Xcode Command Line Tools on macOS)
- Compatible Node.js version (v18, v20, or v22)

**Install build tools (macOS):**
```bash
xcode-select --install
```

**Install build tools (Linux/Ubuntu):**
```bash
sudo apt-get install build-essential python3
```

---

## Verification Checklist

After successful installation:

- [ ] `npm install` completes without errors
- [ ] `npm run build` compiles TypeScript successfully
- [ ] `npm run seed` creates `./data/legacy.db`
- [ ] `npm run dev` starts server on port 4000
- [ ] http://localhost:4000/health returns `{"status":"ok"}`
- [ ] http://localhost:4000/graphql loads GraphQL playground

---

## Still Having Issues?

### Check System Requirements

```bash
# Check Node version (should be 18, 20, or 22)
node --version

# Check npm version
npm --version

# Check Python (required for node-gyp)
python3 --version

# Check build tools (macOS)
xcode-select -p
```

### Clean Build

```bash
# Remove all build artifacts
rm -rf node_modules package-lock.json dist/ data/ logs/

# Reinstall
npm install

# Rebuild
npm run build
```

### Enable Verbose Logging

```bash
npm install --verbose
```

---

## Environment-Specific Notes

### macOS Apple Silicon (M1/M2/M3)

better-sqlite3 should work natively on ARM64. If you encounter issues, ensure Rosetta 2 is installed:

```bash
softwareupdate --install-rosetta
```

### Windows

Install Windows Build Tools:

```powershell
npm install --global windows-build-tools
```

Or install Visual Studio with "Desktop development with C++" workload.

---

## Contact

If issues persist after trying these solutions, please report:

1. Node version (`node --version`)
2. npm version (`npm --version`)
3. Operating system
4. Full error log (`npm install --verbose > install.log 2>&1`)

Email: support@epochbridge.io
