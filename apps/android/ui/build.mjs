import { build } from 'vite'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tsImport } from 'tsx/esm/api'
const root = fileURLToPath(new URL('.', import.meta.url))
const primitive = createRequire(new URL('../../../packages/client/ui-primitives/package.json', import.meta.url))
const artwork = await tsImport('../../../packages/client/ui-primitives/src/icons/index.tsx', { parentURL: import.meta.url, tsconfig: join(root, '../../../tsconfig.base.client.json') })
const { createElement } = primitive('react')
const { renderToStaticMarkup } = primitive('react-dom/server')
const iconNames = { sidebar: 'PanelLeftOutline', new: 'NewChatOutline', settings: 'SettingsOutline', close: 'CloseOutline', refresh: 'RefreshOutline', send: 'SendOutline', stop: 'StopFill', copy: 'CopyOutline', globe: 'GlobeOutline', folder: 'FolderClose' }
const icons = Object.fromEntries(Object.entries(iconNames).map(([name, glyph]) => [name, renderToStaticMarkup(createElement(artwork[`Icon${glyph}Regular`], { size: 20 }))]))
await build({ root, base: './', configFile: false, plugins: [{ name: 'phone-desktop-icons',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'native-selection.js', source: readFileSync(join(root, 'native-selection.js'), 'utf8') }) },
  resolveId(id) { if (id === 'virtual:phone-icons') return '\0phone-icons' },
  load(id) { if (id === '\0phone-icons') return `export default ${JSON.stringify(icons)}` },
}, { name: 'phone-license-notices', writeBundle() {
  const seen = new Set(), notices = []
  for (const id of this.getModuleIds()) {
    if (!id.includes('node_modules')) continue
    let path = dirname(id.split('?')[0])
    while (path !== dirname(path) && !existsSync(join(path, 'package.json'))) path = dirname(path)
    if (!existsSync(join(path, 'package.json')) || seen.has(path)) continue
    seen.add(path); const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    const licenses = readdirSync(path).filter(name => /^(license|licence|copying|notice)([.\-_]|$)/i.test(name))
    notices.push([`${manifest.name} ${manifest.version} (${manifest.license ?? 'see notice'})`, ...licenses.map(name => readFileSync(join(path, name), 'utf8'))].join('\n\n'))
  }
  writeFileSync(join(root, '../app/src/main/assets/chat/THIRD-PARTY-NOTICES.txt'), notices.sort().join('\n\n----------------\n\n'))
} }], resolve: { alias: {
  'katex/dist/katex.min.css': primitive.resolve('katex/dist/katex.min.css'),
  katex: primitive.resolve('katex'),
} }, build: { outDir: '../app/src/main/assets/chat', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 0 } })
