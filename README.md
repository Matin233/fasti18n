# fast i18n

A nodejs cli tool that transforms chinese characters automaticly, based on [sweet-i18n/sugar18](https://github.com/wood3n/sweet-i18n/tree/master/packages/sugar18) [[Docs](https://sweet.icodex.me/docs/usage)]

## Install

```bash
npm i -g fasti18n
```

## Usage

默认已设置为错误的命令提供帮助（Default is set to help with incorrect commands）

```bash
Usage: fasti18n [options]

Options:
  -V, --version                 output the version number
  -i --import <importPath>      [必需]导入的I18N对象路径，eg: '@/lib/i18n'，会自动生成 'import I18N from @/lib/i18n'（[required] the imported I18N object path, eg: '@/lib/i18n', will automatically generate 'import I18N from @/lib/i18n'）
  -s --scope <scope>            限制查找的范围，默认查找项目下全部文件（Limit the search scope, and search all files under the project by default）
  -p --output <output>          输出路径，默认'i18n/zh-CN.json'（Output path, default 'i18n/zh-CN.json'）
  -ig --ignore <ignoreList...>  指定的路径查找时会被跳过，多个路径使用空格隔开（The specified path will be skipped when searching, and multiple paths are separated by spaces）
  -e --entry <entryFile>        通过入口文件的依赖查找（Dependency lookup through entry files）
  --alias <aliasList...>        [--entry指定时]import中使用的别名列表，如@:src标识用@代替src路径（['--entry' required]Alias list used in import, such as '@:src' uses '@' instead of 'src' path）
  --tsv                         额外输出tsv文件（Extra output TSV file）
  -h, --help                    display help for command
```

## Example

### 按文件列表遍历获取中文

```bash
fasti18n -i @/lib/i18n --tsv
```

效果如下：

- 设置import代码为`import I18N from @/lib/i18n`
- 完全遍历
- 额外输出`TSV`文件用于其他软件读取

> -s, -p, -ig为其余可选项，详见Usage一栏

### 按入口文件遍历获取中文

```bash
fasti18n -i @/lib/i18n -e path/to/your/entry/file.vue --alias @:src --tsv
```

效果如下：

- 设置import代码为`import I18N from @/lib/i18n`
- 设置入口文件为`path/to/your/entry/file.vue`
- 设置alias别名，将`@`自动转成`src`
- 额外输出`TSV`文件用于其他软件读取