import { defineConfig } from 'tsdown'
export default defineConfig({ entry: ['lib/types/index.js', 'lib/types/remote-tools.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', clean: false, fixedExtension: false })
