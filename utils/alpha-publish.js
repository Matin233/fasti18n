const fs = require("fs");
const path = require("path");
const shell = require("shelljs");

const localPackageJson = fs.readFileSync(
  path.resolve(process.cwd(), "package.json"),
  "utf8"
);

const packageInfo = JSON.parse(localPackageJson);

const version = packageInfo.version.split("-");
const alphaVersion = +version[1].replace("alpha", "");
const updatedAlphaVersion = version[0] + "-alpha" + (alphaVersion + 1);

shell.exec("npm version " + updatedAlphaVersion);
