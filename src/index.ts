import path from "path";
import fs from "fs";
import glob from "glob";
import { Command } from "commander";
import Transformer from "./transform";
import { logInfo, logError, logNote, logWarn, mkdirSync } from "./utils";
import { ConfigOptions } from "./typings";
import packageJson from "../package.json";
import Walker from "./walker";
import { parse } from "./toTsv";

(function () {
  // node version must >= 14
  require("please-upgrade-node")(packageJson);

  // 读取位于package.json里的配置项
  let options: ConfigOptions = {
    pattern: "**/*.{vue,js,ts}",
    ignore: ["node_modules/**", "**/*.d.ts", "**/*.spec.ts", "**/*.min.js"],
    output: "i18n/zh-CN.json",
    importPath: "",
  };
  try {
    const localPackageJson = fs.readFileSync(
      path.resolve(process.cwd(), "package.json"),
      "utf8"
    );
    const config: { fasti18n: ConfigOptions } = JSON.parse(localPackageJson);
    if (config.fasti18n) {
      options = {
        ...options,
        ...config.fasti18n,
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
    .requiredOption(
      "-i --import <importPath>",
      "[必需]导入的I18N对象路径，eg: '@/lib/i18n'，会自动生成 import I18N from @/lib/i18n"
    )
    .option("-s --scope <scope>", "限制查找的范围，默认查找项目下全部文件")
    .option("-p --output <output>", "输出路径，默认" + options.output)
    .option(
      "-ig --ignore <ignoreList...>",
      "指定的路径查找时会被跳过，多个路径使用空格隔开"
    )
    .option("-e --entry <entryFile>", "通过入口文件的依赖查找")
    .option("--alias <aliasList...>", "[--entry指定时]import中使用的别名列表，如@:src标识用@代替src路径")
    .option("--tsv", "额外输出tsv文件")
    .parse(process.argv);

  const opts = program.opts();
  if (opts.import) {
    options.importPath = opts.import;
  }
  if (opts.output) {
    options.output = opts.output;
  }
  if (opts.scope) {
    options.pattern = opts.scope + "/" + options.pattern;
  }
  // 忽略指定路径下的文件
  if (Array.isArray(opts.ignore)) {
    const mapOpts = opts.ignore.map((item) => {
      return item + "/**";
    });
    options.ignore = [...options.ignore, ...mapOpts];
  }
  // 必须指定引入的从vue-i18n导出对象的路径，方便在script内部自动生成import语句
  if (!options.importPath) {
    logError("Please set import expression's filepath.");
    process.exit(1);
  }

  let locales = {};
  const outputJSONPath = path.resolve(process.cwd(), options.output!);
  console.log("output JSON path:", outputJSONPath)
  if (fs.existsSync(outputJSONPath)) {
    const content = fs.readFileSync(outputJSONPath, "utf8");
    if (content) {
      locales = JSON.parse(content);
    }
  }

  fs.writeFileSync(path.resolve("./scanner-files.log"), "", "utf8");
  if (opts.entry) {
    const deps = new Walker({ filename: path.resolve("./", opts.entry), aliasList: opts.alias })
      .dependencyList;
    deps.push(opts.entry);
    deps.forEach(task);
  } else {
    glob.sync(options.pattern!, { ignore: options.ignore }).forEach(task);
  }

  if (Object.keys(locales).length) {
    mkdirSync(path.dirname(outputJSONPath));

    fs.writeFileSync(
      outputJSONPath,
      JSON.stringify(locales, null, "  "),
      "utf8"
    );
    if (opts.tsv) {
      const tsv = parse(locales);
      fs.writeFileSync(
        outputJSONPath.replace(".json", ".tsv"),
        tsv,
        "utf8"
      );
    }
    logNote("🎉🎉🎉 Extract successfully!");
  } else {
    logWarn(
      "There is no chinese characters can be found in specified directory."
    );
  }

  function task(filename: string) {
    const filePath = path.resolve(process.cwd(), filename);
    logInfo(`🚀 detecting file: ${filePath}`);
    const sourceCode = fs.readFileSync(filePath, "utf8");
    try {
      const { result } = new Transformer({
        code: sourceCode,
        locales,
        importPath: options.importPath,
        filename,
      });
      fs.writeFileSync(filePath, result, "utf8");
      fs.appendFileSync(
        path.resolve("./scanner-files.log"),
        filePath + "\n",
        "utf8"
      );
    } catch (err) {
      console.log(err);
      fs.appendFileSync(
        path.resolve("./scanner-files.log"),
        "[error]" + filePath + "\n",
        "utf8"
      );
      fs.appendFileSync(
        path.resolve("./scanner-files.log"),
        err + "\n",
        "utf8"
      );
    }
  }
})();
