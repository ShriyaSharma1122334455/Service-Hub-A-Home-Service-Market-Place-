import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createEnv(folder) {
  const example = path.join(folder, ".env.example");
  const env = path.join(folder, ".env");

  if (!fs.existsSync(env) && fs.existsSync(example)) {
    fs.copyFileSync(example, env);
    console.log(`✅ Created ${env}`);
  } else {
    console.log(`ℹ️ ${env} already exists`);
  }
}

// backend folder
createEnv(path.join(__dirname, "../../"));

// frontend folder
createEnv(path.join(__dirname, "../../../frontend"));