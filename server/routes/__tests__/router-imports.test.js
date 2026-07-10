// Guarda contra a classe de bug que escapou 3× na modularização do server.js (#3):
// um router usa um símbolo que vinha de `const { X } = require(...)` no server.js
// mas NÃO foi importado/injetado na extração → ReferenceError só em runtime, dentro
// do handler (boot + enumeração de rotas + testes de service NÃO pegam).
//
// Este teste reproduz a auditoria estática: para cada routes/*.js, todo símbolo que
// o server.js obtém por require desestruturado e que aparece no corpo do router
// PRECISA estar importado (require) OU ser parâmetro da factory OU definido no arquivo.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const routesDir = join(here, '..')
const serverSrc = readFileSync(join(routesDir, '..', 'server.js'), 'utf8')

// 1. Todos os bindings de `const { ... } = require(...)` do server.js (single + multi-linha).
function destructuredRequireNames(src) {
  const names = new Set()
  const re = /const\s*\{([^}]*)\}\s*=\s*require\(/gs
  let m
  while ((m = re.exec(src))) {
    for (let n of m[1].split(',')) {
      n = n.trim().split(':')[0].trim() // lida com `a: b` (rename)
      if (n) names.add(n)
    }
  }
  return names
}

// 2. Nomes "disponíveis" num router: importados por require (qualquer forma),
//    params da factory, ou defs locais (const/let/function).
function availableNames(src) {
  const names = new Set()
  // requires desestruturados: const { a, b } = require(...)
  const reDestr = /const\s*\{([^}]*)\}\s*=\s*require\(/gs
  let m
  while ((m = reDestr.exec(src))) {
    for (let n of m[1].split(',')) { n = n.trim().split(':').pop().trim(); if (n) names.add(n) }
  }
  // requires diretos: const X = require(...)
  const reDirect = /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(/g
  while ((m = reDirect.exec(src))) names.add(m[1])
  // params da factory: module.exports = function createX({ ... }) {  (até "const router")
  const factory = src.match(/module\.exports\s*=\s*function[^{]*\{([\s\S]*?)\}\)\s*\{/)
  if (factory) for (let n of factory[1].split(',')) { n = n.trim().split(':')[0].trim(); if (n) names.add(n) }
  // defs locais: const/let/function NOME
  const reDef = /\b(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g
  while ((m = reDef.exec(src))) names.add(m[1])
  return names
}

const SERVER_DESTRUCTURED = destructuredRequireNames(serverSrc)
const routerFiles = readdirSync(routesDir).filter(f => f.endsWith('.js'))

describe('#3 · routers não usam símbolo de require-desestruturado do server.js sem importar', () => {
  it('há routers e símbolos para checar (sanidade do próprio teste)', () => {
    expect(routerFiles.length).toBeGreaterThan(10)
    expect(SERVER_DESTRUCTURED.size).toBeGreaterThan(10)
    expect(SERVER_DESTRUCTURED.has('logAudit')).toBe(true)
  })

  for (const file of routerFiles) {
    it(`${file} tem todos os símbolos resolvidos`, () => {
      const src = readFileSync(join(routesDir, file), 'utf8')
      const available = availableNames(src)
      const unresolved = []
      for (const sym of SERVER_DESTRUCTURED) {
        if (available.has(sym)) continue
        // usado como palavra no corpo?
        if (new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(src)) {
          unresolved.push(sym)
        }
      }
      expect(unresolved, `${file} usa símbolos não importados/injetados`).toEqual([])
    })
  }
})
