const fs = require("fs");
const path = require("path");

function createEnv(folder) {
  const example = path.join(folder, ".env.example");
  const env = path.join(folder, ".env");

  if (!fs.existsSync(env) && fs.existsSync(example)) {
    fs.copyFileSync(example, env);
    console.log(`Created ${env}`);
  } else {
    console.log(`${env} already exists`);
  }
}

createEnv(path.join(__dirname, "../../../backend"));
createEnv(path.join(__dirname, "../../../frontend"));