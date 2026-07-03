// ═══════════════════════════════════════════════════════════════════════════
// server/services/pm/pagination.js
//
// Paginação opt-in das listagens do PM (melhoria #12). Helper puro, testável.
//
// Contrato: `limit` ausente/0/inválido → { limit: null, offset: 0 } = "sem
// paginação" (retrocompat: as listas devolvem tudo). Só quando um `limit` > 0
// válido é informado a paginação liga. `offset` deriva de `page` (1-based)
// quando `offset` não vem. Tudo é clampeado ao teto configurável.
//
// Defaults por env: PM_PAGE_LIMIT_DEFAULT (25), PM_PAGE_LIMIT_MAX (200).
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const ENV_DEFAULT = Number(process.env.PM_PAGE_LIMIT_DEFAULT) || 25;
const ENV_MAX = Number(process.env.PM_PAGE_LIMIT_MAX) || 200;

/** Converte para inteiro >= 0, ou null se não for número válido. */
function toNonNegInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}

/**
 * Normaliza parâmetros de paginação vindos de req.query (ou de um objeto).
 * @param {{limit?, offset?, page?}} q
 * @param {{defaultLimit?, maxLimit?}} opts
 * @returns {{limit: number|null, offset: number}}
 *   limit=null → sem paginação (devolver tudo). offset sempre >= 0.
 */
function parsePagination(q = {}, opts = {}) {
  const maxLimit = opts.maxLimit || ENV_MAX;
  const defaultLimit = opts.defaultLimit || ENV_DEFAULT;

  const rawLimit = toNonNegInt(q.limit);
  // limit ausente → sem paginação. limit=0 → também sem paginação.
  if (rawLimit === null || rawLimit === 0) {
    // ...a não ser que venha `page` explícito: aí aplica o defaultLimit.
    const pageOnly = toNonNegInt(q.page);
    if (rawLimit === null && pageOnly !== null && pageOnly >= 1) {
      const limit = Math.min(defaultLimit, maxLimit);
      return { limit, offset: (pageOnly - 1) * limit };
    }
    return { limit: null, offset: 0 };
  }

  const limit = Math.min(rawLimit, maxLimit);

  // offset explícito tem precedência; senão deriva de page (1-based).
  const rawOffset = toNonNegInt(q.offset);
  if (rawOffset !== null) return { limit, offset: rawOffset };

  const page = toNonNegInt(q.page);
  if (page !== null && page >= 1) return { limit, offset: (page - 1) * limit };

  return { limit, offset: 0 };
}

module.exports = { parsePagination, ENV_DEFAULT, ENV_MAX };
