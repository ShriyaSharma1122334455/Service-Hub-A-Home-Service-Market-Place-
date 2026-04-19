/**
 * ServiceHub Setup Script
 *
 * This script automates the initial setup of the ServiceHub project by:
 * 1. Generating .env files from .env.example templates for all components
 * 2. Installing Node.js dependencies for backend and frontend
 * 3. Installing Python dependencies for AI services and visual damage assessment
 * 4. Optionally seeding the database with sample data
 */


import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";

// ─── Resolve Paths Safely ─────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of project (adjust if needed)
const rootDir = path.resolve(__dirname, "../../..");

const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const aiServicesDir = path.join(rootDir, "ai-services");
const visualDamageDir = path.join(rootDir, "visual-damage-assessment");

// Track errors instead of exiting early
let hasError = false;

// ─── Utility: Check if command exists ─────────────────────────────────────────

function checkCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
  } catch {
    console.error(`❌ ${cmd} is not installed or not in PATH`);
    hasError = true;
  }
}


// ─── Step 1: Create .env Files ────────────────────────────────────────────────

function createEnv(folder) {
  const example = path.join(folder, ".env.example");
  const env = path.join(folder, ".env");

  if (!fs.existsSync(example)) {
    console.log(`⚠️  No .env.example found in ${folder} — skipping`);
    return;
  }

  if (!fs.existsSync(env) && fs.existsSync(example)) {
    fs.copyFileSync(example, env);
    console.log(`✅ Created ${env}`);
  } else {
    console.log(`ℹ️  ${env} already exists`);
  }
}

// ─── Step 2A: Install Node Dependencies ───────────────────────────────────────

function installDeps(folder, label) {
  const pkgJson = path.join(folder, "package.json");
  if (!fs.existsSync(pkgJson)) {
    console.log(`⚠️  No package.json found in ${label} — skipping`);
    return;
  }

  console.log(`\n📦 Installing ${label} dependencies...`);
  try {
    // Uses `npm ci` if a lockfile exists (faster + deterministic), else `npm install`
    const hasLock = fs.existsSync(path.join(folder, "package-lock.json"));
    execSync(hasLock ? "npm ci" : "npm install", {
      cwd: folder,
      stdio: "inherit", // streams output directly to terminal
    });
    console.log(`✅ ${label} dependencies installed`);
  } catch {
    console.error(`❌ Failed to install ${label} dependencies`);
    hasError = true;
  }
}

// ─── Step 2B: Install Python Dependencies  ─────────────────────────────

function installPythonDeps(folder, label, PYTHON_CMD) {
  if (!PYTHON_CMD) {
  console.log(`⚠️ Skipping ${label} — Python not available`);
  return;
}
  const reqFile = path.join(folder, "requirements.txt");

  if (!fs.existsSync(reqFile)) {
    console.log(`⚠️  No requirements.txt found in ${label} — skipping`);
    return;
  }

  console.log(`\n🐍 Installing ${label} Python dependencies...`);

  try {
    // Optional: create virtual environment if not exists
    const isWindows = process.platform === "win32";
    const venvPath = path.join(folder, "venv");

    // Create virtual environment if not exists
    if (!fs.existsSync(venvPath)) {
      console.log(`📦 Creating virtual environment in ${folder}...`);

      execSync(`${PYTHON_CMD} -m venv venv`, {
        cwd: folder,
        stdio: "inherit",
      });
    }
    // IMPORTANT: Use pip directly instead of activating venv
    const pipPath = isWindows
      ? path.join(folder, "venv", "Scripts", "pip")
      : path.join(folder, "venv", "bin", "pip");

    execSync(`"${pipPath}" install -r requirements.txt`, {
      cwd: folder,
      stdio: "inherit",
    });
    console.log(`✅ ${label} Python dependencies installed`);
  } catch (err) {
    console.error(`❌ Failed installing Python deps for ${label}`, err);
    hasError = true;
  }
}

// ─── Step 3: Ask Question (Reusable readline) ─────────────────────────────────


function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Step 4: Seed Database ────────────────────────────────────────────────────

function runSeedScripts() {
  const seedScripts = [
    "seedCategories.js",
    "seedUsers.js",
    "seedProviders.js",
  ];

  for (const script of seedScripts) {
    const scriptPath = path.join(__dirname, script);
    if (!fs.existsSync(scriptPath)) {
      console.log(`⚠️  ${script} not found — skipping`);
      continue;
    }

    console.log(`🌱 Running ${script}...`);

    try {
      execSync(`node ${script}`, {
        cwd: __dirname, // ensures correct execution context
        stdio: "inherit",
      });
    } catch {
      console.error(`❌ Failed running ${script}`);
      hasError = true;
    }
  }
}
// ─── Step 5: Check Python ────────────────────────────────────────────────────

function checkPython() {
  try {
    execSync("python --version", { stdio: "ignore" });
    return "python";
  } catch {
    try {
      execSync("python3 --version", { stdio: "ignore" });
      return "python3";
    } catch {
      console.error("❌ Python is not installed");
      hasError = true;
      return null;
    }
  }
}



// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔧 ServiceHub Setup\n");

  // Pre-check required tools
  console.log("── Checking required tools ──");
  checkCommand("npm");
  const PYTHON_CMD = checkPython();

  // 1. Generate .env files
  console.log("── Step 1: Environment files ──");
  createEnv(backendDir);
  createEnv(frontendDir);
  createEnv(aiServicesDir);
  createEnv(visualDamageDir);

  // 2. Install dependencies
  console.log("\n── Step 2: Dependencies ──");

  // Node
  installDeps(backendDir, "backend");
  installDeps(frontendDir, "frontend");

  // Python
  installPythonDeps(aiServicesDir, "ai-services", PYTHON_CMD);
  installPythonDeps(visualDamageDir, "visual-damage-assessment");

  // 3. Optional DB seed (unchanged)
  console.log("\n── Step 3: Database seed ──");
  const answer = await askQuestion("Seed the database with sample data? (y/N): ");

  if (answer === "y") {
    runSeedScripts();
    console.log("✅ Database seeded");
  } else {
    console.log("ℹ️  Skipping database seed");
  }

 console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Setup complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

if (hasError) {
    console.log("⚠️ Completed with some errors. Check logs above.");
  } else {
    console.log("🎉 Everything completed successfully!");
  }
  console.log(`
Next steps:
1. Fill in all .env files
2. Start backend:   cd backend && npm run dev
3. Start frontend:  cd frontend && npm run dev
4. Start AI modules manually (if needed)
`);
}

main();