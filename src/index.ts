import path from "path";
import fs from "fs";
import glob from "glob";
import { Command } from "commander";
import Transformer from "./transform";
import { logInfo, logError, logNote, logWarn, mkdirSync } from "./utils";
import { ConfigOptions } from "./typings";
import packageJson from "../package.json";

(function () {
  // node version must >= 14
  require("please-upgrade-node")(packageJson);

  // 读取位于package.json里的配置项
  let options: ConfigOptions = {
    pattern: "**/*.{vue,js,ts}",
    ignore: ["node_modules/**", "**/*.d.ts", "**/*.spec.ts", "**/*.min.js"],
    output: "i18n/zh-CN.json",
    useUniqKey: false,
    importPath: "",
  };
  try {
    const localPackageJson = fs.readFileSync(
      path.resolve(process.cwd(), "package.json"),
      "utf8"
    );
    const config: { sugar18: ConfigOptions } = JSON.parse(localPackageJson);
    if (config.sugar18) {
      options = {
        ...options,
        ...config.sugar18,
      };
    }
  } catch (err) {
    logError(err as string);
    process.exit(1);
  }

  const program = new Command();
  program.showHelpAfterError();
  program
    .name("fasti18n")
    .version(packageJson.version)
    .requiredOption("-i --import <importPath>", "[必需]导入的I18N对象路径，eg: '@/lib/i18n'，会自动生成 import I18N from @/lib/i18n")
    .option("-s --scope <scope>", "限制查找的范围，默认查找项目下全部文件")
    .option("-p --output <output>", "输出路径，默认" + options.output)
    .parse(process.argv)
  
  const opts = program.opts()
  if (opts.import) {
    options.importPath = opts.import;
  }
  if (opts.scope) {
    options.pattern = opts.scope + "/" + options.pattern
  }
  // 必须指定引入的从vue-i18n导出对象的路径，方便在script内部自动生成import语句
  if (!options.importPath) {
    logError("Please set import expression's filepath.");
    process.exit(1);
  }

  let locales = {};
  const outputJSONPath = path.resolve(process.cwd(), options.output!);
  if (fs.existsSync(outputJSONPath)) {
    const content = fs.readFileSync(outputJSONPath, "utf8");
    if (content) {
      locales = JSON.parse(content);
    }
  }

  fs.writeFileSync(path.resolve("./scanner-files.log"), "", "utf8");
  glob
    .sync(options.pattern!, { ignore: options.ignore })
    .forEach((filename) => {
      const filePath = path.resolve(process.cwd(), filename);
      logInfo(`🚀 detecting file: ${filePath}`);
      const sourceCode = fs.readFileSync(filePath, "utf8");
      try {
        const { result } = new Transformer({
          code: sourceCode,
          locales,
          useUniqKey: options.useUniqKey,
          importPath: options.importPath,
          filename,
        });
        fs.writeFileSync(filePath, result, "utf8");
        fs.appendFileSync(path.resolve("./scanner-files.log"), filePath + '\n', "utf8");
      } catch (err) {
        console.log(err);
        fs.appendFileSync(path.resolve("./scanner-files.log"), "[error]" + filePath + '\n', "utf8");
        fs.appendFileSync(path.resolve("./scanner-files.log"), err + '\n', "utf8");
      }
    });

  if (Object.keys(locales).length) {
    mkdirSync(path.dirname(outputJSONPath));

    fs.writeFileSync(
      outputJSONPath,
      JSON.stringify(locales, null, "\t"),
      "utf8"
    );
    logNote("🎉🎉🎉 Extract successfully!");
  } else {
    logWarn(
      "There is no chinese characters can be found in specified directory."
    );
  }
})();
