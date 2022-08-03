import { exec } from "shelljs";
import { copySync } from "fs-extra";
import config from "../shared/config";

describe('Test file', () => {
  beforeAll(() => {
    exec("npm run build")
    copySync("tests/samples", config.tempPath)
  }),
  afterAll(() => {
    // exec("npm run clean")
  })
  test('Parse', () => {
    exec(`node lib/index -i @code/lib/i18n -s ${config.tempPath} -p ${config.langPath}/zh.json`)
  })
})