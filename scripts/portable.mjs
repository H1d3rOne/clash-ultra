import fs from 'fs'
import fsp from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'

import AdmZip from 'adm-zip'

const target = process.argv.slice(2)[0]
const ARCH_MAP = {
  'x86_64-pc-windows-msvc': 'x64',
  'i686-pc-windows-msvc': 'x86',
  'aarch64-pc-windows-msvc': 'arm64',
}

const PROCESS_MAP = {
  x64: 'x64',
  ia32: 'x86',
  arm64: 'arm64',
}
const arch = target ? ARCH_MAP[target] : PROCESS_MAP[process.arch]

function addFirstExisting(zip, releaseDir, candidates) {
  const file = candidates.find((name) =>
    fs.existsSync(path.join(releaseDir, name)),
  )

  if (!file) {
    throw new Error(`could not found executable: ${candidates.join(' or ')}`)
  }

  zip.addLocalFile(path.join(releaseDir, file))
}

/// Script for ci
/// 打包绿色版/便携版 (only Windows)
async function resolvePortable() {
  if (process.platform !== 'win32') return

  const releaseDir = target
    ? `./src-tauri/target/${target}/release`
    : `./src-tauri/target/release`
  const configDir = path.join(releaseDir, '.config')

  if (!fs.existsSync(releaseDir)) {
    throw new Error('could not found the release dir')
  }

  await fsp.mkdir(configDir, { recursive: true })
  if (!fs.existsSync(path.join(configDir, 'PORTABLE'))) {
    await fsp.writeFile(path.join(configDir, 'PORTABLE'), '')
  }
  const zip = new AdmZip()

  addFirstExisting(zip, releaseDir, ['Clash Ultra.exe', 'clash-ultra.exe'])
  zip.addLocalFile(path.join(releaseDir, 'ultra-mihomo.exe'))
  zip.addLocalFile(path.join(releaseDir, 'ultra-mihomo-alpha.exe'))
  zip.addLocalFolder(path.join(releaseDir, 'resources'), 'resources')
  zip.addLocalFolder(configDir, '.config')

  const require = createRequire(import.meta.url)
  const packageJson = require('../package.json')
  const { version } = packageJson
  const zipFile = `Clash.Ultra_${version}_${arch}_portable.zip`
  zip.writeZip(zipFile)
  console.log('[INFO]: create portable zip successfully')
}

resolvePortable().catch(console.error)
