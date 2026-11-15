import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildT01Fixture } from './fixture.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const tmp = resolve(root, 'tmp')
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'T01.hwpx'), buildT01Fixture())
writeFileSync(resolve(tmp, 'broken.hwpx'), 'this is not a zip')
