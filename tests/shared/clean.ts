import { removeSync } from 'fs-extra'
import config from './config'

removeSync(config.tempPath)
removeSync(config.langPath)