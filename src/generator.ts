import { ParseResult } from "@babel/parser";
import babelGenerator from "@babel/generator";
import { SFCDescriptor } from "@vue/compiler-sfc";
import {
  ElementNode,
  TemplateChildNode,
  AttributeNode,
  DirectiveNode,
} from "@vue/compiler-core";
import { File, Expression } from "@babel/types";
import prettier from "prettier";

/**
 * 生成template内部JS表达式
 * 字符串需要使用单引号
 * 函数调用末尾的分号需要移除
 */
export function generateInterpolation(
  ast: ParseResult<File> | ParseResult<Expression>
) {
  // that's a hack, because @babel/generator will give a semi after a callexpression
  return babelGenerator(ast, {
    compact: false,
    jsescOption: {
      quotes: "single",
    },
  }).code.replace(/;/gm, "");
}

/**
 * 根据AST生成JS代码
 */
export function generateJS(ast: ParseResult<File> | ParseResult<Expression>) {
  // that's a hack, because @babel/generator will give a semi after a callexpression
  const result = babelGenerator(ast, {
    jsescOption: {
      quotes: "single",
    },
    // vue2的decorator需要单独写
    decoratorsBeforeExport: true
  }).code;

  return prettier.format(result, {
    parser: "typescript",
    semi: false,
    singleQuote: true,
  });
}

/**
 * 组合template，script，style
 */
export function generateSfc(descriptor: SFCDescriptor) {
  let result = "";

  const { template, script, scriptSetup, styles, customBlocks } = descriptor;
  const blocks = [template, script, scriptSetup, ...styles, ...customBlocks];
  blocks.forEach(
    (block, index) => {
      if (block?.type) {
        result += `<${block.type}${Object.entries(block.attrs).reduce(
          (attrCode, [attrName, attrValue]) => {
            if (attrValue === true) {
              attrCode += ` ${attrName}`;
            } else {
              attrCode += ` ${attrName}="${attrValue}"`;
            }

            return attrCode;
          },
          ""
        )}>${block.content}</${block.type}>`;
        // 还原 Vue SFC 每个 Block 之间的空白换行
        if (blocks.length - 1 === index) {
          result += "\n"
        } else {
          result += "\n\n"
        }
      }
    }
  );

  return prettier.format(result, {
    parser: "vue",
    semi: false,
    singleQuote: true,
  });
}

export function generateTemplate(
  templateAst: ElementNode | TemplateChildNode | any,
  children = ""
): string {
  if (templateAst?.children?.length) {
    // @ts-expect-error 类型“InterpolationNode”上不存在属性“children”
    children = templateAst.children.reduce((result, child) => {
      return result + generateTemplate(child);
    }, "");
  }

  // 元素节点
  if (templateAst.type === 1) {
    return generateElement(templateAst, children);
  }

  return templateAst.loc.source;
}

function generateElement(node: ElementNode, children: string) {
  let attributes = "";

  if (node.props.length) {
    attributes = ` ${generateElementAttr(node.props)}`;
  }

  if (node.tag) {
    // 自关闭标签：https://html.spec.whatwg.org/multipage/syntax.html#void-elements
    const selfClosingTags = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];

    if (node.isSelfClosing || selfClosingTags.includes(node.tag)) {
      return `<${node.tag}${attributes} />`;
    }

    return `<${node.tag}${attributes}>${children}</${node.tag}>`;
  }

  return children;
}

function generateElementAttr(attrs: Array<AttributeNode | DirectiveNode>) {
  return attrs
    .map((attr) => {
      return attr.loc.source;
    })
    .join(" ");
}
