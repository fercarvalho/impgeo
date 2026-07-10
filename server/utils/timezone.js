// ═══════════════════════════════════════════════════════════════════════════
// server/utils/timezone.js
// Timezone da organização, configurável por env (#13). Substitui o
// `America/Sao_Paulo` hardcoded no cálculo de "dia" do Pomodoro/relatórios.
//
// Fonte única: `APP_TIMEZONE` (env). Default: America/Sao_Paulo (BRT). O valor é
// validado como IANA válido (via Intl) — se inválido, cai no default e avisa.
// A validação também fecha o risco de typo/injeção, já que o valor é
// interpolado em SQL (`NOW() AT TIME ZONE '<tz>'`).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const DEFAULT_TZ = 'America/Sao_Paulo';

// Um timezone IANA é válido se o Intl consegue construir um formatter com ele.
function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false; // RangeError → tz desconhecido
  }
}

// Resolve o timezone efetivo a partir de um valor de env (função pura → testável).
function resolveTimezone(envValue, { warn = console.warn } = {}) {
  if (envValue && isValidTimeZone(envValue)) return envValue;
  if (envValue) warn(`[timezone] APP_TIMEZONE inválido ("${envValue}") — usando ${DEFAULT_TZ}`);
  return DEFAULT_TZ;
}

// Valor efetivo da app (resolvido uma vez no load; env é setado no boot).
const APP_TIMEZONE = resolveTimezone(process.env.APP_TIMEZONE);

module.exports = { APP_TIMEZONE, DEFAULT_TZ, isValidTimeZone, resolveTimezone };
