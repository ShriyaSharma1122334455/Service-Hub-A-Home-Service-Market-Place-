const fs = require("fs");
const path = require("path");

const rootEnv = path.join(__dirname, "../../../.env");
const exampleEnv = path.join(__dirname, "../../../.env.example");

if (!fs.existsSync(rootEnv)) {
  fs.copyFileSync(exampleEnv, rootEnv);
  console.log("✅ .env file created from .env.example");
} else {
  console.log("ℹ️ .env already exists");
}