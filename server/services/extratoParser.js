const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(str) {
  const [d, m, y] = str.trim().split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseMoney(str) {
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

/**
 * Usa pdftotext -layout para extrair texto do PDF preservando colunas.
 * Requer poppler-utils instalado no sistema.
 */
function pdfToLayoutText(buffer, password = null) {
  const tmpIn = path.join(os.tmpdir(), `extrato-${Date.now()}.pdf`);
  try {
    fs.writeFileSync(tmpIn, buffer);
    const pwFlag = password ? `-upw "${password}"` : "";
    const text = execSync(`pdftotext ${pwFlag} -layout "${tmpIn}" -`, { encoding: "utf8" });
    return text;
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
  }
}

// ─── Banco do Brasil ──────────────────────────────────────────────────────────

// (legado - mantido para referência, não usado no novo parser)
const BB_SKIP = [
  /saldo\s+anterior/i,
  /s\s*a\s*l\s*d\s*o/i,
  /^\*{3}/,
  /^seguro\s+empresarial/i,
  /^protecao\s+para/i,
  /^o\s+seu\s+cartao/i,
  /^transacao\s+efetuada/i,
  /^servico\s+de\s+atendimento/i,
  /^ouvidoria/i,
  /^para\s+deficientes/i,
  /^-{5,}/,
  /^observacoes/i,
  /^consultas/i,
  /^cliente\s+-/i,
  /^conta\s+corrente/i,
  /^periodo\s+do/i,
  /^dt\.\s+balancete/i,
  /^lancamentos/i,
  /^agencia/i,
  /^\s*$/,
];

function skipBB(line) {
  return BB_SKIP.some((re) => re.test(line.trim()));
}

// ── BB Formato 1 ─────────────────────────────────────────────────────────────
// "Consultas - Extrato de conta corrente"
// Colunas: Dt.balancete  Ag  Lote  Hist  Histórico  Documento  Valor D/C  [Saldo D/C]
// Sinal: D = Débito (Despesa), C = Crédito (Receita)
// Detectado por: presença de "Dt. balancete" ou "Dt. movimento" no cabeçalho

const BB1_LINE_RE  = /^(\d{2}\/\d{2}\/\d{4})\s+\d+\s+\d+\s+\d+\s+(.+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([DC])(?:\s+\d{1,3}(?:\.\d{3})*,\d{2}\s+[DC])?\s*$/;
const BB1_SKIP_RE  = /saldo\s+anterior|s\s*a\s*l\s*d\s*o|lançamentos|dt\.\s*balanc|dt\.\s*movim|a\s+conta\s+nao\s+foi|seguro\s+empresarial|observa[çc]|protecao|contrate|sac\s+0800|ouvidoria|transação\s+efetuada|serviço\s+de\s+atendimento|para\s+deficientes|^-{3,}|^\*{3}/i;

function parseBBFormat1(text) {
  const lines = text.split("\n");
  const transactions = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    if (!trim || BB1_SKIP_RE.test(trim)) { i++; continue; }

    const m = BB1_LINE_RE.exec(line);
    if (!m) { i++; continue; }

    const date  = parseDate(m[1]);
    const side  = m[4];                  // 'D' ou 'C'
    const value = parseMoney(m[3]);
    const type  = side === "C" ? "Receita" : "Despesa";

    // Remove número de documento do final da descrição (ex: " 890.691.200.298.465")
    let desc = m[2].replace(/\s+\d{1,3}(?:\.\d{3})+\s*$/, "").trim();

    if (BB1_SKIP_RE.test(desc) || /^saldo/i.test(desc)) { i++; continue; }

    // Verifica linha de continuação (ex: "EMPRESARIAL ELO", "IMP GEOTECN")
    const next = (lines[i + 1] || "").trim();
    if (
      next &&
      !/^\d{2}\/\d{2}\/\d{4}/.test(next) &&
      !BB1_LINE_RE.test(lines[i + 1] || "") &&
      !BB1_SKIP_RE.test(next) &&
      !/^-{3}/.test(next) &&
      !/^\*/.test(next)
    ) {
      // Limpa prefixo de data de operação Pix (ex: "16/03 09:27 37965... IMP GEOTECN")
      const cleanNext = next.replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+\S+\s+/, "").trim();
      if (cleanNext) desc = `${desc} — ${cleanNext}`;
      i++;
    }

    if (date && value > 0) {
      transactions.push({
        date,
        description: desc || "Sem descrição",
        value,
        type,
        category: type,
      });
    }

    i++;
  }

  return transactions;
}

// ── BB Formato 2 ─────────────────────────────────────────────────────────────
// "Extrato de Conta Corrente" (app/internet banking)
// Data em linha própria, depois "   Lote   Doc   Descrição   Valor (+/-)"
// Detectado por: ausência de "Dt. balancete"

const BB_VALUE_LINE_RE = /^\s+(\d+)\s+(\d+)\s+(.*?)\s{2,}(\d{1,3}(?:\.\d{3})*,\d{2})\s*\(([+-])\)\s*$/;
const BB_DATE_LINE_RE  = /^(\d{2}\/\d{2}\/\d{4})/;
const BB_SKIP_LINE_RE  = /saldo\s+(anterior|do\s+dia)|resumo\s+do\s+período/i;

function parseBBFormat2(text) {
  const lines = text.split("\n");
  const transactions = [];
  let currentDate = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Linha de data
    const dateMatch = BB_DATE_LINE_RE.exec(line);
    if (dateMatch) {
      const raw = dateMatch[1];
      if (raw !== "00/00/0000") currentDate = parseDate(raw);
      i++;
      continue;
    }

    if (!currentDate) { i++; continue; }

    const vm = BB_VALUE_LINE_RE.exec(line);
    if (!vm) { i++; continue; }

    if (BB_SKIP_LINE_RE.test(line)) { i++; continue; }

    const value = parseMoney(vm[4]);
    const type  = vm[5] === "+" ? "Receita" : "Despesa";
    let   desc  = vm[3].trim();

    if (!desc) {
      const next = lines[i + 1] || "";
      const nextTrim = next.trim();
      if (nextTrim && !BB_DATE_LINE_RE.test(next) && !BB_VALUE_LINE_RE.test(next) && !BB_SKIP_LINE_RE.test(nextTrim)) {
        desc = nextTrim;
        i++;
      }
    }

    desc = desc.replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/, "").trim();

    if (value > 0 && currentDate) {
      transactions.push({
        date: currentDate,
        description: desc || "Sem descrição",
        value,
        type,
        category: type,
      });
    }

    i++;
  }

  return transactions;
}

// ── Dispatcher BB ─────────────────────────────────────────────────────────────
// Detecta automaticamente o formato pelo cabeçalho do PDF

function parseBBLayout(text) {
  if (/Dt\.\s*balancete|Dt\.\s*movimento/i.test(text)) {
    return parseBBFormat1(text);
  }
  return parseBBFormat2(text);
}

// ─── Sicoob ───────────────────────────────────────────────────────────────────

const SICOOB_SKIP = [
  /^saldo\s+anterior/i,
  /^saldo\s+bloq/i,
  /^saldo\s+do\s+dia/i,
  /^resumo/i,
  /^\(\+\)/,
  /^\(\-\)/,
  /^\(=\)/,
  /^saldo\s+bloqueado/i,
  /^saldo\s+em\s+conta/i,
  /^encargos/i,
  /^juros\s+vencidos/i,
  /^tarifas\s+vencidas/i,
  /^vencimento/i,
  /^taxa\s+cheque/i,
  /^custo\s+efetivo/i,
  /^sac:/i,
  /^ouvidoria/i,
  /^\d{3}\s+extratos/i,
  /^outras\s+informa/i,
  /^\s*$/,
];

const SICOOB_COMPLEMENT_SKIP = [
  /^doc\./i,
  /^nome:/i,
  /^cpf\s+cnpj:/i,
  /^protocolo/i,
  /^\d{2}\/\d{2}/,       // linha de data
  /^\d[\d.]+\s*0001/,    // número de conta/CNPJ
  /^pagamento\s+pix/i,
];

function skipSicoob(line) {
  return SICOOB_SKIP.some((re) => re.test(line.trim()));
}

function skipSicoobComplement(line) {
  return SICOOB_COMPLEMENT_SKIP.some((re) => re.test(line.trim()));
}

// Linha de transação: DD/MM seguido de espaços e descrição
const SICOOB_LINE_RE = /^(\d{2}\/\d{2})\s{3,}(.+)$/;

// Valor inline: "60,00D" ou "63.501,24C" no final da descrição
const SICOOB_INLINE_VALUE_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})([DC])\s*$/;

// Valor sem D/C (vem na próxima linha): "63.501,24"
const SICOOB_SPLIT_VALUE_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

function parseSicoobPDF(text) {
  // Extrair ano do cabeçalho
  const yearMatch = /PERÍODO:\s*\d{2}\/\d{2}\/(\d{4})/.exec(text);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  const lines = text.split("\n");
  const transactions = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (skipSicoob(line)) { i++; continue; }

    const lineMatch = SICOOB_LINE_RE.exec(raw);
    if (!lineMatch) { i++; continue; }

    const ddmm = lineMatch[1]; // "DD/MM"
    const rest = lineMatch[2].trim();

    if (skipSicoob(rest)) { i++; continue; }

    const date = `${year}-${ddmm.slice(3, 5)}-${ddmm.slice(0, 2)}`;

    // Tentar extrair valor inline (D/C colado ao número)
    const inlineMatch = SICOOB_INLINE_VALUE_RE.exec(rest);
    if (inlineMatch) {
      const value = parseMoney(inlineMatch[1]);
      const side = inlineMatch[2];
      const description = rest.replace(SICOOB_INLINE_VALUE_RE, "").trim();
      const type = side === "D" ? "Despesa" : "Receita";

      if (value > 0) {
        transactions.push({ date, description, value, type, category: type });
      }
      i++;
      continue;
    }

    // Verificar se o valor está separado (próxima linha tem D, C ou *)
    const splitMatch = SICOOB_SPLIT_VALUE_RE.exec(rest);
    if (splitMatch) {
      const value = parseMoney(splitMatch[1]);
      const description = rest.replace(SICOOB_SPLIT_VALUE_RE, "").trim();

      // Buscar D/C ou * nas próximas linhas
      let j = i + 1;
      let marker = null;
      while (j < lines.length && j < i + 5) {
        const nextTrim = lines[j].trim();
        if (/^[DC\*]$/.test(nextTrim)) { marker = nextTrim; j++; break; }
        if (nextTrim && !/^doc\./i.test(nextTrim)) break;
        j++;
      }

      if (marker && marker !== "*" && value > 0) {
        const type = marker === "D" ? "Despesa" : "Receita";
        transactions.push({ date, description, value, type, category: type });
      }
      // Se marker === "*" → bloqueado, ignora
      i++;
      continue;
    }

    i++;
  }

  return transactions;
}

// ─── C6 Bank ──────────────────────────────────────────────────────────────────

const C6_SKIP = [
  /^saldo\s+do\s+dia/i,
  /^informaç/i,
  /^atendimento/i,
  /^chat\s+para/i,
  /^no\s+app/i,
  /^demais\s+localidades/i,
  /^0800/i,
  /^capitais/i,
  /^segunda/i,
  /^sac/i,
  /^ouvidoria/i,
  /^whatsapp/i,
  /^abra\s+uma/i,
  /^baixe\s+o/i,
  /^extrato\s+exportado/i,
  /^imp\s+geotecnologia/i,
  /^agência:/i,
  /^extrato\s*$/i,
  /^março\s+\d{4}/i,
  /^data\s+lançamento/i,
  /^data$/i,
  /^lançamento/i,
  /^contábil/i,
  /^\s*$/,
];

function skipC6(line) {
  return C6_SKIP.some((re) => re.test(line.trim()));
}

// Linha de transação: começa com exatamente 2 espaços + DD/MM
const C6_LINE_RE = /^  (\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+(.+)$/;

// Valor no final da linha: "-R$ 1.234,56" ou "R$ 1.234,56"
const C6_VALUE_RE = /(-?R\$\s*[\d.]+,\d{2})\s*$/;

// Linha de continuação (sem data, mas tem valor no final)
const C6_CONTINUATION_RE = /^(\s{20,})(\S.+?)(-?R\$\s*[\d.]+,\d{2})\s*$/;

function parseC6Value(str) {
  // "-R$ 3.000,00" → { value: 3000, type: "Despesa" }
  const negative = str.trim().startsWith("-");
  const clean = str.replace(/[^0-9,.]/g, "").replace(/\./g, "").replace(",", ".");
  return {
    value: parseFloat(clean),
    type: negative ? "Despesa" : "Receita",
  };
}

function parseC6PDF(text) {
  // Extrair ano da linha do período
  const yearMatch = /(\d{4})/.exec(text);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  const lines = text.split("\n");
  const transactions = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];

    if (skipC6(raw)) { i++; continue; }

    const lineMatch = C6_LINE_RE.exec(raw);
    if (!lineMatch) { i++; continue; }

    const ddmm = lineMatch[1];
    const rest = lineMatch[2];
    const date = `${year}-${ddmm.slice(3, 5)}-${ddmm.slice(0, 2)}`;

    // Tentar extrair valor do final desta linha
    const valueMatch = C6_VALUE_RE.exec(rest);
    if (valueMatch) {
      const { value, type } = parseC6Value(valueMatch[1]);
      const withoutValue = rest.replace(C6_VALUE_RE, "").trim();
      const parts = withoutValue.split(/\s{3,}/);
      let description = (parts.length >= 2 ? parts.slice(1).join(" ") : "").trim();

      // Caso especial: descrição está na linha anterior (indentada, sem data)
      if (!description) {
        const prevRaw = lines[i - 1] || "";
        if (/^\s{20,}\S/.test(prevRaw) && !C6_LINE_RE.test(prevRaw)) {
          description = prevRaw.trim();
        }
      }

      // Descrição também pode ter continuação na próxima linha
      const nextRaw2 = lines[i + 1] || "";
      if (description && /^\s{20,}\S/.test(nextRaw2) && !C6_LINE_RE.test(nextRaw2) && !C6_VALUE_RE.test(nextRaw2)) {
        description = `${description} ${nextRaw2.trim()}`;
        i++;
      }

      if (!description) description = withoutValue.trim();

      if (value > 0) {
        transactions.push({ date, description, value, type, category: type });
      }
      i++;
      continue;
    }

    // Sem valor nesta linha → checar próxima linha (descrição em duas linhas)
    const nextRaw = lines[i + 1] || "";
    const contMatch = C6_CONTINUATION_RE.exec(nextRaw);
    if (contMatch) {
      const { value, type } = parseC6Value(contMatch[3]);
      const withoutValue = rest.trim();
      const parts = withoutValue.split(/\s{3,}/);
      const tipoAndDesc = parts.length >= 2 ? parts.slice(1) : parts;
      const descPart1 = tipoAndDesc.join(" ").trim();
      const descPart2 = contMatch[2].trim();
      const description = descPart1 ? `${descPart1} ${descPart2}`.trim() : descPart2;

      if (value > 0) {
        transactions.push({ date, description, value, type, category: type });
      }
      i += 2;
      continue;
    }

    i++;
  }

  return transactions;
}

// ─── Fatura BB ────────────────────────────────────────────────────────────────

const FATURA_BB_SKIP = [
  /^saldo\s+fatura\s+anterior/i,
  /^pagamentos?\s*\/?\s*créditos?/i,
  /^outros\s+lançamentos?/i,
  /^compras\s+parceladas?/i,
  /^compras?\s*$/i,
  /^serviços?\s*$/i,
  /^subtotal/i,
  /^total\s*$/i,
  /^detalhes\s+da\s+fatura/i,
  /^confira\s+aqui/i,
  /^informações\s+complementares/i,
  /^fale\s+conosco/i,
  /^central\s+de\s+atendimento/i,
  /^serviço\s+de\s+atendimento/i,
  /^ouvidoria/i,
  /^deficiente/i,
  /^tarifas?\s*$/i,
  /^página\s+\d/i,
  /^data\s+descrição/i,
  /^data\s*$/i,
  /^opções\s+de\s+pagamento/i,
  /^resumo\s+da\s+fatura/i,
  /^encargos\s+financeiros?/i,
  /^datas?\s+fatura/i,
  /^bb\s+relaciona/i,
  /^empresa/i,
  /^centro\s+de\s+custo/i,
  /^valor\s*$/i,
  /^limite\s+único/i,
  /^vencimento/i,
  /^\s*$/,
];

// Linhas que identificam seção de portador — ignorar mas não afetar estado
const FATURA_BB_CARDHOLDER_RE = /^\s{2,}[A-ZÀ-Ú][a-zà-ú].*\(Cart[aã]o\s+\d+\)/;

function skipFaturaBB(line) {
  return FATURA_BB_SKIP.some((re) => re.test(line.trim()));
}

// Linha de transação: DD/MM seguido de espaços e descrição + valor no final
const FATURA_BB_LINE_RE = /^\s{3,}(\d{2}\/\d{2})\s{3,}(.+?)\s{3,}(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

function parseFaturaBBPDF(text) {
  // Extrair ano do cabeçalho
  const yearMatch = /(?:Fatura fechada em|Vencimento):\s*\d{2}\/\d{2}\/(\d{4})/i.exec(text);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  const lines = text.split("\n");
  const transactions = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (!line || skipFaturaBB(line) || FATURA_BB_CARDHOLDER_RE.test(raw)) continue;

    const m = FATURA_BB_LINE_RE.exec(raw);
    if (!m) continue;

    const ddmm = m[1];
    const rawDesc = m[2].trim();
    const rawValue = m[3];

    // Ignorar valores negativos (pagamentos já rastreados no extrato bancário)
    if (rawValue.startsWith("-")) continue;

    const value = parseMoney(rawValue);
    if (value <= 0) continue;

    const date = `${year}-${ddmm.slice(3, 5)}-${ddmm.slice(0, 2)}`;

    // Limpar descrição: remover colunas de país (2 letras maiúsculas) e parcelas no final
    const description = rawDesc
      .replace(/\s+[A-Z]{2}\s*$/, "")   // remove país (BR, US, etc.)
      .replace(/\s{3,}.*$/, "")          // remove colunas extras (parcelas, etc.)
      .trim();

    transactions.push({
      date,
      description,
      value,
      type: "Despesa",
      category: "Despesa",
    });
  }

  return transactions;
}

// ─── Fatura C6 ────────────────────────────────────────────────────────────────

const MONTH_PT = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };

const FATURA_C6_SKIP = [
  /^transações\s+do\s+cartão/i,
  /^lembrando:/i,
  /^valores\s+em\s+reais/i,
  /^subtotal\s+deste/i,
  /^c6\s+business/i,
  /^resumo\s+da\s+fatura/i,
  /^compras\s+nacionais/i,
  /^compras\s+internacionais/i,
  /^anuidade/i,
  /^tarifa\s+de\s+saque/i,
  /^personalização/i,
  /^iof\s+de\s+financiamento/i,
  /^juros\s+de\s+financiamento/i,
  /^pagamento\s+de\s+fatura/i,
  /^formas\s+de\s+pagamento/i,
  /^pague\s+com\s+pix/i,
  /^central\s+de\s+relacionamento/i,
  /^chat\s+para\s+clientes/i,
  /^sac/i,
  /^ouvidoria/i,
  /^whatsapp/i,
  /^\d+\s*\/\s*\d+/,            // "6 / 10" (paginação)
  /^vencimento:/i,
  /^valor\s+da\s+fatura:/i,
  /^melhor\s+dia/i,
  /^débito\s+automático/i,
  /^limite\s+(total|de\s+cartão|de\s+saque)/i,
  /^total\s+a\s+pagar/i,
  /^inclusao\s+de\s+pagamento/i,   // crédito: "Inclusao de Pagamento"
  /^pagamento\s+fatura/i,          // crédito: "Pagamento Fatura QR CODE", etc.
  /^\s*$/,
];

function skipFaturaC6(line) {
  return FATURA_C6_SKIP.some((re) => re.test(line.trim()));
}

// Linha de transação: "DD mmm   Descrição   Valor"
const FATURA_C6_LINE_RE = /^\s{4,}(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(.+?)\s{2,}(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i;

function parseFaturaC6PDF(text) {
  // Extrair mês e ano de fechamento: "fechamento desta fatura em DD/MM/YY"
  const closeMatch = /fechamento desta fatura em\s+(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(text);
  let closeMonth = 3, closeYear = new Date().getFullYear();
  if (closeMatch) {
    closeMonth = parseInt(closeMatch[2], 10);
    closeYear = parseInt(closeMatch[3].length === 2 ? "20" + closeMatch[3] : closeMatch[3], 10);
  } else {
    const vencMatch = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
    if (vencMatch) {
      closeMonth = parseInt(vencMatch[2], 10);
      closeYear  = parseInt(vencMatch[3], 10);
    }
  }

  const lines = text.split("\n");
  const transactions = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || skipFaturaC6(line)) continue;

    const m = FATURA_C6_LINE_RE.exec(raw);
    if (!m) continue;

    const day   = m[1].padStart(2, "0");
    const mon   = MONTH_PT[m[2].toLowerCase()];
    const rawDesc = m[3].trim();
    const value = parseMoney(m[4]);

    if (!mon || value <= 0) continue;

    // Ignorar créditos/pagamentos aplicados na fatura
    if (/inclusao\s+de\s+pagamento/i.test(rawDesc)) continue;

    // Determinar ano: se mês da transação > mês de fechamento → ano anterior
    const year = mon > closeMonth ? closeYear - 1 : closeYear;
    const date = `${year}-${String(mon).padStart(2, "0")}-${day}`;

    // Limpar descrição: remover info de cotação e país no final
    const description = rawDesc
      .replace(/\s+[A-Z]{2}\s*$/, "")                        // remove sufixo de país (WI, SA, etc.)
      .replace(/\s+IOF\s+Transações\s+Exterior\s*$/i, " — IOF Exterior")
      .replace(/\s+USD\s+[\d.,]+\s*\|\s*Cotação.*$/i, "")    // remove info de câmbio
      .trim();

    transactions.push({
      date,
      description,
      value,
      type: "Despesa",
      category: "Despesa",
    });
  }

  return transactions;
}

// ─── InfinityPay Extrato ──────────────────────────────────────────────────────
//
// Formato: "Relatório de movimentações" (CloudWalk / InfinityPay)
// Colunas: Data  Hora  Tipo de transação  Nome  Detalhe  Valor (R$)
// Data: "DD Mmm, YYYY" — só na 1ª linha de cada bloco de dia
// Valor: "+929,67" ou "-42,49" — sinal define Receita/Despesa

const IP_MONTHS_MAP = {
  jan:"01", fev:"02", mar:"03", abr:"04", mai:"05", jun:"06",
  jul:"07", ago:"08", set:"09", out:"10", nov:"11", dez:"12",
};

// Linha de data: "06 Jan, 2026" ou "23 Mar, 2026" no início da linha
const IP_DATE_RE   = /^(\d{2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez),?\s+(\d{4})/i;
// Hora dentro da linha
const IP_TIME_RE   = /\b\d{2}:\d{2}\b/;
// Valor no final da linha: [+-]NNNN,NN (sem espaço após sinal)
const IP_VALUE_RE  = /([+-]\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
// Linhas a ignorar
const IP_SKIP_RE   = /saldo\s+do\s+dia|saldo\s+(inicial|final\s+do)|total\s+de\s+(entrada|saída|saida)|^data\s+hora|relatório|cloudwalk|central\s+de\s+ajuda|página\s+\d|r\$\s+\d/i;

function parseIPDate(line) {
  const m = IP_DATE_RE.exec(line.trim());
  if (!m) return null;
  const month = IP_MONTHS_MAP[m[2].toLowerCase()];
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function parseInfinityPayPDF(text) {
  const lines = text.split("\n");
  const transactions = [];
  let currentDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const trim  = line.trim();

    if (!trim || IP_SKIP_RE.test(trim)) continue;

    // ── Detecta data no início da linha ───────────────────────────
    const dateAttempt = parseIPDate(trim);
    if (dateAttempt) currentDate = dateAttempt;

    if (!currentDate) continue;

    // ── A linha deve ter horário e valor para ser transação ────────
    if (!IP_TIME_RE.test(line)) continue;

    const valueMatch = IP_VALUE_RE.exec(line);
    if (!valueMatch) continue;

    const rawValue = valueMatch[1];           // ex: "+929,67"
    const sign     = rawValue[0];             // '+' ou '-'
    const value    = parseMoney(rawValue.slice(1));
    if (value === 0) continue;

    const type = sign === "+" ? "Receita" : "Despesa";

    // ── Extrai descrição ───────────────────────────────────────────
    // Remove data (se houver), hora, valor do final → sobra: "Tipo   Nome   Detalhe"
    let work = line
      .replace(IP_VALUE_RE, "")
      .replace(/^\s*\d{2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez),?\s+\d{4}\s*/i, "")
      .replace(/^\s*\d{2}:\d{2}\s+/, "")
      .trim();

    // Divide em colunas separadas por 2+ espaços
    const cols = work.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
    // cols[0] = Tipo de transação, cols[1] = Nome, cols[2+] = Detalhe

    let desc = "";
    if (cols.length >= 2) {
      const tipo = cols[0].toLowerCase();
      const nome = cols[1];

      if (tipo === "pix") {
        // Remove prefixo "Pix " e possível número de conta logo após
        desc = nome
          .replace(/^Pix\s+/i, "")
          .replace(/^\d{1,3}(?:\.\d{3})*\s+/, "") // remove código ex: "22.486.736 "
          .trim();
      } else if (/depósito de vendas|deposito de vendas/i.test(tipo)) {
        desc = "Depósito InfinityPay";
      } else if (/empréstimo inteligente|emprestimo inteligente/i.test(tipo)) {
        desc = "Empréstimo InfinityPay";
      } else if (/iof/i.test(tipo)) {
        desc = "IOF Empréstimo InfinityPay";
      } else if (/cancelamento/i.test(tipo)) {
        desc = "Cancelamento de venda InfinityPay";
      } else if (/transação|transacao/i.test(tipo)) {
        desc = nome; // ex: "Reembolso"
      } else {
        desc = nome || cols[0];
      }
    } else if (cols.length === 1) {
      desc = cols[0];
    }

    // Caso a descrição esteja vazia, verifica se a próxima linha é
    // continuação do nome (multi-linha, ex: "BEBIDAS LTDA" separado)
    if (!desc) {
      const next = (lines[i + 1] || "").trim();
      if (next && !IP_TIME_RE.test(next) && !IP_VALUE_RE.test(next) && !IP_SKIP_RE.test(next) && !IP_DATE_RE.test(next)) {
        desc = next;
        i++;
      }
    }

    // Complementa nomes quebrados em duas linhas (ex: "CASARIA SALVADOR..." na linha seguinte)
    const next = (lines[i + 1] || "").trim();
    if (
      next &&
      !IP_TIME_RE.test(next) &&
      !IP_VALUE_RE.test(next) &&
      !IP_SKIP_RE.test(next) &&
      !IP_DATE_RE.test(next) &&
      /^[A-ZÁÉÍÓÚÀÃÕ]/.test(next)
    ) {
      desc = `${desc} ${next}`.trim();
      i++;
    }

    transactions.push({
      date: currentDate,
      description: desc || "InfinityPay",
      value,
      type,
      category: type,
    });
  }

  return transactions;
}

// ─── Mercado Pago ─────────────────────────────────────────────────────────────
//
// Formato: "EXTRATO DE CONTA" (Mercado Pago Instituição de Pagamento Ltda.)
// Colunas: Data | Descrição | ID da operação | Valor | Saldo
// Data: DD-MM-YYYY
// Valor: "R$ 246,03" (positivo = Receita) ou "R$ -4,50" (negativo = Despesa)
//
// Estrutura por grupo de transação:
//   [linhas pré-desc (indentadas, sem data)]
//   DD-MM-YYYY  [desc inline?]  [ID 8+ dígitos]  R$ VALOR  R$ SALDO
//   [linhas pós-desc (indentadas, sem data)]
//   [linha(s) em branco  ← separa grupos]
//
// Observação: a descrição pode estar dividida em até 3 partes:
//   pré-linhas + inline na linha da data + pós-linhas

const MP_DATE_RE = /^\s*(\d{2}-\d{2}-\d{4})\b/;
// Captura primeiro valor monetário da linha (pode ser negativo)
const MP_VALUE_RE = /R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/;
const MP_SKIP_RE = /EXTRATO\s+DE\s+CONTA|CPF\/CNPJ|Periodo:|Entradas:|Sa[íi]das:|Saldo\s+(inicial|final)|DETALHE\s+DOS\s+MOVIMENTOS|^\s*Data\s+Descri|^\s*\d+\/\d+\s*$|Data\s+de\s+gera[çc][aã]o|Mercado\s+Pago\s+Institui|0800\s+\d|Voc[êe]\s+tem\s+alguma|Encontre\s+nossos|SAC\b|ouvidoria|portal\s+de\s+ajuda/i;

function parseMercadoPagoPDF(text) {
  const lines = text.split("\n");
  const transactions = [];

  let state    = "BETWEEN"; // "BETWEEN" | "IN_GROUP"
  let preParts = [];
  let current  = null;

  const finalizeTransaction = () => {
    if (current) {
      transactions.push(current);
      current = null;
    }
    preParts = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Linhas de cabeçalho/rodapé — ignorar completamente
    if (MP_SKIP_RE.test(trimmed)) continue;

    // Linha em branco → fecha grupo de transação
    if (!trimmed) {
      if (state === "IN_GROUP") {
        finalizeTransaction();
        state = "BETWEEN";
      }
      continue;
    }

    // Linha com conteúdo — garante que estamos em IN_GROUP
    if (state === "BETWEEN") state = "IN_GROUP";

    const dateMatch = MP_DATE_RE.exec(line);
    if (dateMatch) {
      // ── Linha de data ───────────────────────────────────────────
      const [d, m, y] = dateMatch[1].split("-");
      const date = `${y}-${m}-${d}`;

      // Tudo antes do primeiro "R$" contém: data + desc inline + ID
      const firstRS = line.indexOf("R$");
      const beforeValue = firstRS !== -1 ? line.slice(0, firstRS) : line;

      // Extrai o primeiro valor (R$ X,XX) → esse é o valor da transação
      // O segundo R$ é o saldo — ignoramos
      const valueMatch = MP_VALUE_RE.exec(line);
      let value = 0;
      if (valueMatch) {
        value = parseMoney(valueMatch[1]);
      }

      // Descrição inline: remove a data e IDs numéricos longos (≥ 8 dígitos)
      const inlineDesc = beforeValue
        .slice(dateMatch[0].length)
        .replace(/\b\d{8,}\b/g, "")
        .trim();

      const descParts = [...preParts];
      if (inlineDesc) descParts.push(inlineDesc);
      preParts = [];

      current = {
        date,
        value,
        type: value >= 0 ? "Receita" : "Despesa",
        descParts,
      };
    } else {
      // ── Linha sem data ──────────────────────────────────────────
      if (current) {
        // Pós-descrição da transação atual
        current.descParts.push(trimmed);
      } else {
        // Pré-descrição da próxima transação
        preParts.push(trimmed);
      }
    }
  }

  // Finaliza última transação caso o arquivo não termine com linha em branco
  if (current) transactions.push(current);

  return transactions
    .filter(t => t.value !== 0)
    .map(t => ({
      date:        t.date,
      description: t.descParts.join(" ").replace(/\s+/g, " ").trim() || "Mercado Pago",
      value:       Math.abs(t.value),
      type:        t.type,
      category:    t.type,
    }));
}

// ─── Dispatcher principal ─────────────────────────────────────────────────────

async function parseExtrato(bank, buffer, ext, importType = "extrato", password = null) {
  if (bank === "bb") {
    if (ext === "pdf") {
      const text = pdfToLayoutText(buffer, password);
      const result = importType === "fatura" ? parseFaturaBBPDF(text) : parseBBLayout(text);
      if (result.length === 0) {
        console.log("[Parser DEBUG] BB texto bruto (primeiras 80 linhas):\n" + text.split("\n").slice(0, 80).join("\n"));
      }
      return result;
    }
    throw new Error("Banco do Brasil: somente PDF é suportado no momento.");
  }
  if (bank === "sicoob") {
    if (ext === "pdf") {
      const text = pdfToLayoutText(buffer, password);
      const result = parseSicoobPDF(text);
      if (result.length === 0) {
        console.log("[Parser DEBUG] Sicoob texto bruto (primeiras 80 linhas):\n" + text.split("\n").slice(0, 80).join("\n"));
      }
      return result;
    }
    throw new Error("Sicoob: somente PDF é suportado no momento.");
  }
  if (bank === "c6") {
    if (ext === "pdf") {
      const text = pdfToLayoutText(buffer, password);
      const result = importType === "fatura" ? parseFaturaC6PDF(text) : parseC6PDF(text);
      if (result.length === 0) {
        console.log("[Parser DEBUG] C6 texto bruto (primeiras 80 linhas):\n" + text.split("\n").slice(0, 80).join("\n"));
      }
      return result;
    }
    throw new Error("C6 Bank: somente PDF é suportado no momento.");
  }
  if (bank === "infinitypay") {
    if (ext === "pdf") {
      const text = pdfToLayoutText(buffer, password);
      const result = parseInfinityPayPDF(text);
      if (result.length === 0) {
        console.log("[Parser DEBUG] InfinityPay texto bruto (primeiras 80 linhas):\n" + text.split("\n").slice(0, 80).join("\n"));
      }
      return result;
    }
    throw new Error("InfinityPay: somente PDF é suportado no momento.");
  }
  if (bank === "mercadopago") {
    if (ext === "pdf") {
      const text = pdfToLayoutText(buffer, password);
      const result = parseMercadoPagoPDF(text);
      if (result.length === 0) {
        console.log("[Parser DEBUG] MercadoPago texto bruto (primeiras 80 linhas):\n" + text.split("\n").slice(0, 80).join("\n"));
      }
      return result;
    }
    throw new Error("Mercado Pago: somente PDF é suportado no momento.");
  }
  throw new Error(`Banco "${bank}" ainda não possui parser implementado.`);
}

module.exports = { parseExtrato };
