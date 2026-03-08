import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createInterface } from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEnv(folder) {
  const example = path.join(folder, ".env.example");
  const env = path.join(folder, ".env");

  if (!fs.existsSync(env) && fs.existsSync(example)) {
    fs.copyFileSync(example, env);
    console.log(`✅ Created ${env}`);
  } else {
    console.log(`ℹ️  ${env} already exists`);
  }
}

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
    process.exit(1);
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const backendDir  = path.join(__dirname, "../../");
const frontendDir = path.join(__dirname, "../../../frontend");

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔧 ServiceHub Setup\n");

  // 1. Generate .env files (your existing logic — unchanged)
  console.log("── Step 1: Environment files ──");
  createEnv(backendDir);
  createEnv(frontendDir);

  // 2. Install dependencies
  console.log("\n── Step 2: Dependencies ──");
  installDeps(backendDir, "backend");
  installDeps(frontendDir, "frontend");

  // 3. Optional DB seed
  console.log("\n── Step 3: Database seed ──");
  const answer = await askQuestion("Seed the database with sample data? (y/N): ");
  if (answer === "y") {
    const seedScripts = ["seedCategories.js", "seedUsers.js", "seedProviders.js"];
    for (const script of seedScripts) {
      const scriptPath = path.join(__dirname, script);
      if (fs.existsSync(scriptPath)) {
        console.log(`🌱 Running ${script}...`);
        execSync(`node ${scriptPath}`, { stdio: "inherit" });
      } else {
        console.log(`⚠️  ${script} not found — skipping`);
      }
    }
    console.log("✅ Database seeded");
  }

  // 4. Done
  console.log(`
✅ Setup complete!

Next steps:
  1. Fill in the secrets in backend/.env and frontend/.env
  2. Start backend:   cd backend && npm run dev
  3. Start frontend:  cd frontend && npm run dev
`);
}

main();