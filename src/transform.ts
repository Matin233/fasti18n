import babelTraverse, { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";
import path from "path";
import { ElementNode, SimpleExpressionNode } from "@vue/compiler-core";
import { parseVue, parseJS } from "./parse";
import {
  generateTemplate,
  generateJS,
  generateInterpolation,
  generateSfc,
} from "./generator";
import { hasChineseCharacter, logError } from "./utils";
import { generateHash } from "./hash";
import { FileType, NodeTypes } from "./typings";

/**
 * 创建Vue指令属性的ast对象
 * @param type
 * @param name 
 * @param value 
 * @returns 
 */
function createDirectiveAttr(type: string, name: string, value: string) {
  // 处理特殊的事件属性
  if (type === "on") {
    return {
      name: "on",
      type: NodeTypes.DIRECTIVE,
      loc: {
        source: `@${name}="${value}"`,
      },
    };
  }

  return {
    name: "bind",
    type: NodeTypes.DIRECTIVE,
    loc: {
      source: `:${name}="${value}"`,
    },
  };
}

/**
 * 创建Vue插值节点
 * @param content 
 * @returns 
 */
function createInterpolationNode(content: string) {
  return {
    type: NodeTypes.INTERPOLATION,
    loc: {
      source: `{{ ${content} }}`,
    },
  };
}

interface Options {
  code: string;
  locales: Record<string, string>;
  filename: string;
  importPath: string;
}

class Transformer {
  /**
   * 转换后的代码
   */
  result = "";
  /**
   * 提取的中文键值对
   */
  locales: Record<string, string> = {};
  /**
   * 源代码
   */
  sourceCode: string;
  /**
   * 源代码文件的名称
   */
  filename: string;
  /**
   * 源代码文件的扩展名
   */
  fileType: FileType;
  /**
   * 导入 vue-i18n 对象的变量值
   */
  importVar = "I18N";
  /**
   * 导入 vue-i18n 对象的相对路径
   */
  importPath = "";

  constructor({ code, locales, importPath, filename }: Options) {
    this.sourceCode = code;
    this.result = code;
    this.locales = locales;
    this.importPath = importPath;
    this.filename = filename;
    this.fileType = path.extname(filename) as FileType;

    this.startTransform();
  }

  /**
   * 任务列表
   * - 提取中文到locales返回key
   * - 根据得到的key为代码混入翻译函数和import导入
   * - 输出生成的新代码
   */
  startTransform() {
    if (!Object.values(FileType).includes(this.fileType)) {
      logError(`Unsupported file type: ${this.filename}`);
      return;
    }

    if (hasChineseCharacter(this.sourceCode)) {
      if (
        (this.fileType === FileType.JS || this.fileType === FileType.TS) &&
        this.hasChineseCharacterInJS(this.sourceCode)
      ) {
        this.result = generateJS(this.transformJS(this.sourceCode));
      } else if (this.fileType === FileType.VUE) {
        const descriptor = parseVue(this.sourceCode);
        // <template>
        if (
          descriptor?.template?.content &&
          hasChineseCharacter(descriptor?.template?.content)
        ) {
          descriptor.template.content = generateTemplate({
            ...this.transformTemplate(descriptor?.template?.ast),
            tag: "",
          });
        }

        // <script>
        if (
          descriptor?.script?.content &&
          this.hasChineseCharacterInJS(descriptor?.script?.content)
        ) {
          descriptor.script.content = generateJS(
            this.transformJS(descriptor.script.content)
          );
        } else if (
          descriptor?.scriptSetup?.content &&
          this.hasChineseCharacterInJS(descriptor?.scriptSetup?.content)
        ) {
          descriptor.scriptSetup.content = generateJS(
            this.transformJS(descriptor.scriptSetup.content)
          );
        }

        this.result = generateSfc(descriptor);
      }
    }
  }

  /**
   * JS代码是否含有中文字符
   * @param code 
   * @returns 
   */
  hasChineseCharacterInJS = (code: string) => {
    let result = false;
    babelTraverse(parseJS(code), {
      enter: (path) => {
        if (
          path.node.type === "StringLiteral" &&
          hasChineseCharacter(path.node.extra?.rawValue as string)
        ) {
          path.stop();
          result = true;
        }

        if (
          path.node.type === "TemplateLiteral" &&
          path.node.quasis.some((q) => hasChineseCharacter(q.value.cooked))
        ) {
          path.stop();
          result = true;
        }

        if (
          path.node.type === "JSXText" &&
          hasChineseCharacter(path.node.value)
        ) {
          path.stop();
          result = true;
        }
      },
    });

    return result;
  };

  /**
   * 转换template节点
   * 
   * 为Vue SFC template模版混入模版t函数，返回AST对象结果
   */
  transformTemplate = (ast: ElementNode) => {
    /**
     * this is a hack
     * FIXME:指定 v-pre 的元素的属性及其子元素的属性和插值语法都不需要解析，
     * 但是 @vue/compiler-sfc 解析后的props中不会包含 v-pre 的属性名，所以这里暂时使用正则表达式匹配v-pre，并生动注入 v-pre 到 props 中
     * https://github.com/vuejs/vue-next/issues/4975
     */
    if (
      ast.type === 1 &&
      /^<+?[^>]+\s+(v-pre)[^>]*>+?[\s\S]*<+?\/[\s\S]*>+?$/gm.test(
        ast.loc.source
      )
    ) {
      ast.props = [
        {
          type: 7,
          name: "pre",
          // @ts-expect-error 类型“{ source: string; }”缺少类型“SourceLocation”中的以下属性: start, endts(2739)
          loc: {
            source: "v-pre",
          },
        },
      ];
      return ast;
    }

    // 优先处理Vue模版插值语法，eg: <div>有 {item} 个任务</div>
    if (ast.type === 1) {
      const isPureNode = !ast.children.find((node) => {
        return node.type === 1
      })
      const containTextNode = ast.children.find((node) => {
        return node.type === 2 && node.content.trim() !== ""
      })
      const containChinese = isPureNode && hasChineseCharacter(ast.loc.source)
      if (containChinese && containTextNode) {
        let textTemplate = ""
        let args: string[] = []
        ast.children.forEach(node => {
          if (node.type === 2) {
            textTemplate += node.content
          } else {
            textTemplate += "%s"
            args.push(node.loc.source.replace("{{", "").replace("}}", ""))
          }
        })
        if (args.length > 0) {
          const localeKey = this.extractChar(textTemplate)
          const transformNode = {
            ...ast,
            children: [{
              type: NodeTypes.INTERPOLATION,
              loc: {
                source: `{{ $i18n.tExtend('${localeKey}',[${args + ""}]) }}`
              }
            }]
          }
          return transformNode
        }
      }
    }

    if (ast.props.length) {
      // @ts-expect-error 类型“{ name: string; type: number; loc: { source: string; }; }”缺少类型“DirectiveNode”中的以下属性: exp, arg, modifiersts(2322)
      ast.props = ast.props.map((prop) => {
        // vue指令
        if (
          prop.type === 7 &&
          hasChineseCharacter((prop.exp as SimpleExpressionNode)?.content)
        ) {
          const jsCode = generateInterpolation(
            this.transformJS((prop.exp as SimpleExpressionNode)?.content, true)
          );
          return createDirectiveAttr(
            prop.name,
            (prop.arg as SimpleExpressionNode)?.content,
            jsCode
          );
        }
        // 普通属性
        if (prop.type === 6 && hasChineseCharacter(prop.value?.content)) {
          const localeKey = this.extractChar(prop.value!.content);
          return createDirectiveAttr("bind", prop.name, `$t('${localeKey}')`);
        }

        return prop;
      });
    }

    if (ast.children.length) {
      // @ts-expect-error 类型“{ type: number; loc: { source: string; }; }”缺少类型“TextCallNode”中的以下属性: content, codegenNodets(2322)
      ast.children = ast.children.map((child) => {
        if (child.type === 2 && hasChineseCharacter(child.content)) {
          const localeKey = this.extractChar(child.content);
          return createInterpolationNode(`$t('${localeKey}')`);
        }

        // 插值语法，插值语法的内容包含在child.content内部，如果匹配到中文字符，则进行JS表达式解析并替换
        if (
          child.type === 5 &&
          hasChineseCharacter((child.content as SimpleExpressionNode)?.content)
        ) {
          const jsCode = generateInterpolation(
            this.transformJS(
              (child.content as SimpleExpressionNode)?.content,
              true
            )
          );
          return createInterpolationNode(jsCode);
        }

        // 元素
        if (child.type === 1) {
          return this.transformTemplate(child);
        }

        return child;
      });
    }

    return ast;
  };

  /**
   * 转换JS代码
   * 
   * 为JS代码混入模版t函数，返回AST对象结果
   * @param code 
   * @param isInTemplate 
   * @returns 
   */
  transformJS = (code: string, isInTemplate?: boolean) => {
    const ast = parseJS(code);
    let shouldImportVar = false;

    // Babel AST 的规格说明参考
    // https://github.com/babel/babel/blob/main/packages/babel-parser/ast/spec.md
    const visitor: Visitor = {
      // 整个代码项目
      Program: {
        exit: (path) => {
          if (this.fileType === FileType.JS || this.fileType === FileType.TS) {
            // 解析import语句
            path.traverse({
              ImportDeclaration: (path) => {
                if (
                  path.node.specifiers.find(
                    (item) => item.local.name === this.importVar
                  )
                ) {
                  shouldImportVar = false;
                  path.stop();
                }
              },
            });

            if (shouldImportVar) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier(this.importVar))],
                  t.stringLiteral(this.importPath)
                )
              );
            }
          }
        },
      },
      // 计算表达式。a + 'b' + c
      BinaryExpression: {
        exit: (path) => {
          // 连续相加的表达式会依序返回多条结果，取最长的那一条
          if (path.node.operator === "+" && !t.isBinaryExpression(path.parentPath)) {
            // 由于右节点不可能为计算表达式，故只需要遍历左节点
            let leftNode = path.node
            let rightNode = null
            let textTemplate = ""
            let args: any[] = []
            while (true) {
              let endLoop: boolean
              if (t.isBinaryExpression(leftNode)) {
                rightNode = leftNode.right
                leftNode = leftNode.left as t.BinaryExpression
              }

              if (t.isStringLiteral(rightNode)) {
                textTemplate = rightNode.value + textTemplate
              } else if (rightNode !== null){
                textTemplate = "%s" + textTemplate
                args.unshift(rightNode)
              }

              if (t.isBinaryExpression(leftNode)) {
                endLoop = false
              } else if (t.isStringLiteral(leftNode)) {
                textTemplate = (leftNode as t.StringLiteral).value + textTemplate
                endLoop = true
              } else {
                textTemplate = "%s" + textTemplate
                args.unshift(leftNode)
                endLoop = true
              }

              if (endLoop) break
            }
            if (textTemplate.replace(/%s/g, "").trim() !== "" && args.length > 0 && hasChineseCharacter(textTemplate)) {
              const localeKey = this.extractChar(textTemplate.replace(/"/g, `\\"`));
              path.replaceWith(
                t.callExpression(
                  t.memberExpression(
                    t.identifier(this.importVar),
                    t.identifier("tExtend")
                  ),
                  [
                    t.stringLiteral(localeKey),
                    t.arrayExpression(args)
                  ]
                )
              )
            }
          }
        }
      },
      // 字符串字面量
      StringLiteral: {
        exit: (path) => {
          if (hasChineseCharacter(path.node.extra?.rawValue as string)) {
            // 不翻译console
            const isConsole = this.isConsoleExpression(path);
            if (isConsole) {
              return
            }
            // 计算表达式的字符串在BinaryExpression处理
            if (t.isBinaryExpression(path.parentPath)) {
              return
            }

            const localeKey = this.extractChar(
              path.node.extra?.rawValue as string
            );

            if (this.fileType === FileType.JS) {
              shouldImportVar = true;
              path.replaceWith(
                t.callExpression(
                  t.memberExpression(
                    t.identifier(this.importVar),
                    t.identifier("t")
                  ),
                  [t.stringLiteral(localeKey)]
                )
              );
            } else if (this.fileType === FileType.TS) {
              shouldImportVar = true;
              path.replaceWith(
                t.callExpression(
                  t.memberExpression(
                    t.callExpression(
                      t.memberExpression(
                        t.identifier(this.importVar),
                        t.identifier("t")
                      ),
                      [t.stringLiteral(localeKey)]
                    ),
                    // Fix(Vue-i18n): Type 'LocaleMessages' is not assignable to type 'string'
                    t.identifier("toString")
                  ),
                  []
                )
              );
            } else if (this.fileType === FileType.VUE) {
              if (isInTemplate) {
                path.replaceWith(
                  t.callExpression(t.identifier("$t"), [
                    t.stringLiteral(localeKey),
                  ])
                );
              } else {
                // this.$t.toString()
                // Fix(Vue-i18n): Type 'TranslateResult' is not assignable to type 'string'.
                path.replaceWith(
                  t.callExpression(t.memberExpression(
                    t.callExpression(
                      t.memberExpression(t.thisExpression(), t.identifier("$t")),
                      [t.stringLiteral(localeKey)]
                    ), t.identifier("toString")
                  ), []
                ));
              }
            }
          }
        },
      },
      // 模版字符串字面量。eg: `${aaa}bbb`
      TemplateLiteral: {
        exit: (path) => {
          // 检测模板字符串内部是否含有中文字符
          if (
            path.node.quasis.some((q) => hasChineseCharacter(q.value.cooked))
          ) {
            // 生成替换字符串，注意这里不需要过滤quasis里的空字符串
            const replaceStr = path.node.quasis
              .map((q) => q.value.cooked)
              .join("%s");
            const localeKey = this.extractChar(replaceStr);
            const isIncludeInterpolation = !!path.node.expressions?.length;
            if (this.fileType === FileType.JS || this.fileType === FileType.TS) {
              shouldImportVar = true;
              if (isIncludeInterpolation) {
                path.replaceWith(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier(this.importVar),
                      t.identifier("tExtend")
                    ),
                    [
                      t.stringLiteral(localeKey),
                      t.arrayExpression(
                        path.node.expressions as t.Expression[]
                      ),
                    ]
                  )
                );
              } else {
                path.replaceWith(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier(this.importVar),
                      t.identifier("t")
                    ),
                    [t.stringLiteral(localeKey)]
                  )
                );
              }
            } else if (this.fileType === FileType.VUE) {
              if (isInTemplate) {
                if (isIncludeInterpolation) {
                  path.replaceWith(
                    t.callExpression(
                      t.memberExpression(
                        t.identifier("$i18n"),
                        t.identifier("tExtend")
                      ),
                      [
                        t.stringLiteral(localeKey),
                        t.arrayExpression(
                          path.node.expressions as t.Expression[]
                        ),
                      ]
                    )
                  );
                } else {
                  path.replaceWith(
                    t.callExpression(t.identifier("$t"), [
                      t.stringLiteral(localeKey),
                    ])
                  );
                }
              } else {
                if (isIncludeInterpolation) {
                  path.replaceWith(
                    t.callExpression(
                      t.memberExpression(
                        t.memberExpression(
                          t.thisExpression(),
                          t.identifier("$i18n")
                        ),
                        t.identifier("tExtend")
                      ),
                      [
                        t.stringLiteral(localeKey),
                        t.arrayExpression(
                          path.node.expressions as t.Expression[]
                        ),
                      ]
                    )
                  );
                } else {
                  path.replaceWith(
                    t.callExpression(
                      t.memberExpression(
                        t.thisExpression(),
                        t.identifier("$t")
                      ),
                      [t.stringLiteral(localeKey)]
                    )
                  );
                }
              }
            }
          }
        },
      },
      JSXText: {
        exit: (path) => {
          if (hasChineseCharacter(path.node.value)) {
            const localeKey = this.extractChar(
              path.node.extra?.rawValue as string
            );

            path.replaceWith(
              t.jsxExpressionContainer(
                t.callExpression(t.identifier("$t"), [
                  t.stringLiteral(localeKey),
                ])
              )
            );
          }
        },
      },
    };

    babelTraverse(ast, visitor);
    return ast;
  };

  /**
   * 提取存储中文文本(locales)，返回MD5的Hash值作为key
   * @param char 
   * @returns 
   */
  extractChar = (char: string) => {
    const locale = char.trim();
    const key = generateHash(locale);
    this.locales[key] = locale;
    return key;
  };

  /**
   * 不翻译`console.log("中文")`里面的中文
   * @param path 
   */
  isConsoleExpression(path: NodePath) {
    const parentNode = path.parentPath ? path.parentPath.node : null;
    if (!parentNode) {
      return false
    }
    const isCallExpression = t.isCallExpression(parentNode)
    if (isCallExpression) {
      const callExpressionNode = parentNode as t.CallExpression;
      const isMemberExpression = t.isMemberExpression(callExpressionNode.callee);
      if (isMemberExpression) {
        const memberExpression = callExpressionNode.callee as t.MemberExpression;
        const isIndentifier = t.isIdentifier(memberExpression.object)
        if (isIndentifier) {
          const object = memberExpression.object as t.Identifier
          const isConsole = object.name === 'console'
          if (isConsole) {
            return true
          }
        }
      }
    }
    return false
  }
}

export default Transformer;
