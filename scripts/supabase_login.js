import { spawn } from "child_process";
import * as path from "path";

console.log("Starting Supabase login...");

// Resolve local supabase.cmd path
const binaryPath = process.platform === "win32"
  ? path.resolve("node_modules", ".bin", "supabase.cmd")
  : path.resolve("node_modules", ".bin", "supabase");

console.log("Using binary:", binaryPath);

const child = spawn(binaryPath, ["login"], {
  shell: true,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (data) => {
  console.log("[Supabase STDOUT]", data);

  // If it asks for token or browser, simulate pressing Enter
  if (data.includes("Enter access token") || data.includes("open browser")) {
    console.log("Simulating pressing Enter...");
    child.stdin.write("\n");
  }

  // Parse authorization URL
  const match = data.match(/https:\/\/supabase\.com\/dashboard\/cli\/login\?session_id=[a-zA-Z0-9-]+/);
  if (match) {
    console.log("\n==================================================");
    console.log("PLEASE CLICK OR OPEN THIS URL IN YOUR BROWSER TO LOG IN:");
    console.log(match[0]);
    console.log("==================================================\n");
  }
});

child.stderr.on("data", (data) => {
  console.error("[Supabase STDERR]", data);
});

child.on("close", (code) => {
  console.log(`Supabase login process exited with code ${code}`);
  process.exit(code);
});
