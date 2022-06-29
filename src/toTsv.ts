export const parse = (localesData: any) => {
  let csvData = "id\tchinese\n"
  for (const key in localesData) {
    if (Object.prototype.hasOwnProperty.call(localesData, key)) {
      const element = localesData[key];
      csvData += `${key}\t${element}\n`
    }
  }
  return csvData
}