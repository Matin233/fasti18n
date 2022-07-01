import babelTraverse, { Visitor } from "@babel/traverse";
import path from "path";
import fs from "fs";
import { parseVue, parseJS } from "./parse";
import { logError } from "./utils";
import { FileType } from "./typings";

interface Options {
  filename: string;
  aliasList: string[];
}

// 根据import依赖深度遍历输出所有支持的依赖文件
class Walker {
  /**
   * 入口文件的名称
   */
  filename: string;
  /**
   * import别名列表，格式为@:src ===> @ 为 src 做引入别名
   */
  aliasList: string[];
  /**
   * 依赖的文件列表
   */
  dependencyList: string[];
  visitedList: Set<string>;

  constructor({ filename, aliasList }: Options) {
    this.filename = filename;
    this.aliasList = aliasList;

    this.visitedList = new Set();
    const deps = this.getDependency(this.filename);
    this.dependencyList = [...this.traverseDeps(deps), ...deps];
    // this.dependencyList.forEach((dep) => console.log(dep));
  }

  getDependency(filename: string) {
    const fileType = path.extname(filename) as FileType;
    if (!Object.values(FileType).includes(fileType)) {
      logError(`Unsupported file type: ${filename}`);
      return [];
    }
    const sourceCode = fs.readFileSync(filename, "utf-8");

    if (fileType === FileType.JS || fileType === FileType.TS) {
      return this.traverseJS(sourceCode);
    } else if (fileType === FileType.VUE) {
      const descriptor = parseVue(sourceCode);
      const scriptCode =
        descriptor?.script?.content || descriptor?.scriptSetup?.content;
      return scriptCode ? this.traverseJS(scriptCode) : [];
    }
    return [];
  }

  traverseJS(code: string) {
    const deps: string[] = [];
    const ast = parseJS(code);
    const visitor: Visitor = {
      ImportDeclaration: ({ node }) => {
        let filename = node.source.value
        if (this.aliasList) {
          this.aliasList.forEach(alias => {
            const aliasGroup = alias.split(":");
            filename = node.source.value.replace(
              aliasGroup[0],
              path.resolve(aliasGroup[1])
            );
          })
        }
        
        const extname = path.extname(filename);
        // ignore node_modules
        if (!filename.startsWith("/")) {
          return;
        }
        if (!extname) {
          if (fs.existsSync(filename + ".ts")) {
            deps.push(filename + ".ts");
          } else if (fs.existsSync(filename + ".js")) {
            deps.push(filename + ".js");
          }
        } else if (Object.values(FileType).includes(path.extname(filename) as FileType)) {
          deps.push(filename);
        }
      },
    };

    babelTraverse(ast, visitor);
    return deps;
  }

  convertToVisitMap() {
    const visitMap = new Map();
    this.dependencyList.forEach((dep) => visitMap.set(dep, false));
    return visitMap;
  }

  traverseDeps(dependencyList: string[]) {
    if (!Array.isArray(dependencyList)) {
      return [dependencyList];
    }
    let deps: string[] = [];
    for (const dep of dependencyList) {
      let currentDep = this.getDependency(dep);

      // 去重
      if (Array.isArray(currentDep)) {
        let filterCurrentDep: string[] = [];
        currentDep.forEach((dep) => {
          if (!this.visitedList.has(dep)) {
            this.visitedList.add(dep);
            filterCurrentDep.push(dep);
          }
        });
        currentDep = filterCurrentDep;
      } else {
        if (!this.visitedList.has(currentDep)) {
          this.visitedList.add(currentDep);
        }
      }

      deps.push(...currentDep, ...this.traverseDeps(currentDep));
    }
    return deps;
  }
}

export default Walker;
