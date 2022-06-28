const esbuild = require("esbuild");
const chalk = require("chalk");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

esbuild
  .build({
    entryPoints: ["./src/index.ts"],
    bundle: true,
    minify: true,
    platform: "node",
    sourcemap: false,
    target: ["node14"],
    loader: {
      ".ts": "ts",
    },
    tsconfig: "./tsconfig.json",
    plugins: [nodeExternalsPlugin()],
    outfile: "./lib/index.js",
  })
  .then(() => {
    console.log(chalk.green("compiled success"));
  })
  .catch((err) => {
    console.log(chalk.red("compiled failed"));
    console.log();
    console.log(err);
    process.exit(1);
  });
