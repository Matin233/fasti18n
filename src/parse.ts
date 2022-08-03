import { parse as vueParser } from "@vue/compiler-sfc";
import { parse as babelParser } from "@babel/parser";
import { parse as recastParser } from "recast";

export function parseVue(code: string) {
  return vueParser(code).descriptor;
}

export function parseJS(code: string) {
  return recastParser(code, {
    parser: {
      parse() {
        return babelParser(code, {
          sourceType: "module",
          plugins: ["jsx", "decorators-legacy", "typescript"],
          tokens: true, // recast requires this object
        });
      }
    }
  })
}
