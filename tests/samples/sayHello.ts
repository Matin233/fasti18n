export function sayHello(name: string) {
  const country = "中国";
  const greeting = "你好呀";
  const templateStr = `你好，${name}`;
  const concatenateStrs1 = "您好，" + name;
  const concatenateStrs2 = name + "，你好";
  const concatenateStrs3 = "你好，" + name + "。";
  const concatenateStrs4 = "你好，" + name + "。这里是" + country;
  return {
    greeting,
    templateStr,
    concatenateStrs1,
    concatenateStrs2,
    concatenateStrs3,
    concatenateStrs4,
  };
}
