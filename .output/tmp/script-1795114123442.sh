const { execSync } = require("child_process");
try {
  execSync("npx esbuild app/pages/import.js --loader:.js=jsx --outfile=/dev/null", { cwd: "/Users/haseebqureshi/Code/emoryvalley", stdio: "pipe" });
  console.log("JSX parse OK");
} catch (e) {
  console.log("BUILD FAIL:\n" + e.stderr?.toString());
  process.exit(1);
}
