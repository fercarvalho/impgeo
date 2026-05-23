// Gerador de PDF do orçamento TerraControl (server-side).
//
// Por que server-side: o PDF é anexado no e-mail enviado pro tc_user. Se
// gerássemos no client (jsPDF, igual exportPdf.ts existente), teríamos que
// fazer upload de volta — overhead inútil. pdfkit é leve (~700KB) e não
// precisa de Chromium headless.
//
// Adapter TipTap-JSON → pdfkit: implementa um SUBSET com whitelist (sem
// suporte a script/HTML/embed). Defesa em profundidade contra XSS via PDF
// malicioso, mesmo que o conteúdo venha de um admin autenticado.
//
// Nodes suportados:
//   doc, paragraph, heading (level 1-3), bulletList, orderedList, listItem,
//   horizontalRule, hardBreak
// Marks suportados:
//   bold, italic
// Qualquer outro tipo é silenciosamente ignorado (não quebra render).
//
// Layout: cabeçalho verde-azul TerraControl, dados do imóvel, conteúdo do
// orçamento, tabela de itens, total destacado, rodapé com paginação.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Paleta TerraControl (idêntica aos templates de e-mail)
const TC_GREEN = '#48A326';
const TC_BLUE  = '#0041B1';
const GREY_900 = '#111827';
const GREY_700 = '#374151';
const GREY_500 = '#6b7280';
const GREY_300 = '#d1d5db';
const GREY_100 = '#f3f4f6';

const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'logo_terracontrol.png');

function formatBRL(cents) {
  const value = (Number(cents) || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Renderer TipTap JSON → pdfkit ─────────────────────────────────────────

// Aplica os marks (bold/italic) na fonte. Retorna o nome de fonte composto
// que pdfkit reconhece. Marks desconhecidos viram texto plain.
function fontForMarks(marks) {
  const set = new Set((marks || []).map(m => m.type));
  if (set.has('bold') && set.has('italic')) return 'Helvetica-BoldOblique';
  if (set.has('bold')) return 'Helvetica-Bold';
  if (set.has('italic')) return 'Helvetica-Oblique';
  return 'Helvetica';
}

// Renderiza um array de inline nodes (texto + marks) numa sequência de
// chamadas doc.text() com continued:true até o último, que fecha o parágrafo.
function renderInlines(doc, inlines, opts = {}) {
  const items = (inlines || []).filter(n => n.type === 'text' || n.type === 'hardBreak');
  if (items.length === 0) {
    doc.text(' ', opts);
    return;
  }
  items.forEach((n, idx) => {
    const isLast = idx === items.length - 1;
    if (n.type === 'hardBreak') {
      doc.text('\n', { ...opts, continued: !isLast });
      return;
    }
    const text = n.text || '';
    doc.font(fontForMarks(n.marks)).text(text, { ...opts, continued: !isLast });
  });
  doc.font('Helvetica'); // reset
}

// Renderiza um node block-level. Mantém Y atual; cada bloco quebra parágrafo
// e adiciona pequeno gap. Profundidade só importa pra listas aninhadas.
function renderNode(doc, node, depth = 0) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'paragraph': {
      doc.fontSize(11).fillColor(GREY_900);
      renderInlines(doc, node.content, { paragraphGap: 4 });
      doc.moveDown(0.3);
      return;
    }
    case 'heading': {
      const lvl = (node.attrs && node.attrs.level) || 1;
      const sizes = { 1: 18, 2: 15, 3: 13 };
      doc.fontSize(sizes[lvl] || 13).fillColor(TC_BLUE).font('Helvetica-Bold');
      renderInlines(doc, node.content, { paragraphGap: 6 });
      doc.font('Helvetica').fillColor(GREY_900);
      doc.moveDown(0.4);
      return;
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (node.content || []).filter(n => n.type === 'listItem');
      // pdfkit suporta doc.list(['a','b']) mas só de strings.
      // Pra suportar marks, iteramos manualmente com bullet/index manual.
      const indent = 20 + depth * 16;
      items.forEach((item, i) => {
        const x = doc.x;
        const bullet = node.type === 'orderedList' ? `${i + 1}.` : '•';
        doc.fontSize(11).fillColor(GREY_900).font('Helvetica');
        doc.text(bullet, x, doc.y, { width: 12, continued: false });
        // Reposiciona pra continuar item à direita do bullet
        const itemY = doc.y - doc.currentLineHeight();
        doc.text('', x + indent - 8, itemY); // ajuste mínimo
        (item.content || []).forEach(child => renderNode(doc, child, depth + 1));
        doc.x = x; // restaura margem original
      });
      doc.moveDown(0.3);
      return;
    }
    case 'horizontalRule': {
      const y = doc.y + 4;
      doc.moveTo(doc.x, y).lineTo(doc.page.width - doc.page.margins.right, y)
        .strokeColor(GREY_300).lineWidth(0.5).stroke();
      doc.moveDown(0.8);
      return;
    }
    case 'hardBreak': {
      doc.moveDown(0.3);
      return;
    }
    default:
      // Whitelist: ignora silenciosamente nodes desconhecidos pra não quebrar
      // o PDF nem dar XSS via injeção de tipos exóticos.
      return;
  }
}

function renderTipTapDocument(doc, json) {
  if (!json || json.type !== 'doc' || !Array.isArray(json.content)) {
    doc.fontSize(11).fillColor(GREY_500).font('Helvetica-Oblique')
      .text('(Conteúdo do orçamento vazio)');
    return;
  }
  json.content.forEach(node => renderNode(doc, node));
}

// ─── Renderer principal ────────────────────────────────────────────────────

/**
 * Gera o PDF do orçamento e grava em outPath.
 *
 * @param {object} args
 * @param {string} args.outPath           caminho completo de saída (.pdf)
 * @param {object} args.record            row terracontrol (imovel, municipio, cod_imovel, area_total…)
 * @param {object} args.tcUser            row tc_users (first_name, last_name, email, cpf)
 * @param {object} args.revision          row tc_budget_revisions (revision_number, content_json, items, total_amount_cents, created_at)
 * @returns {{path: string, filename: string}}
 */
async function renderBudgetPdf({ outPath, record, tcUser, revision }) {
  if (!outPath) throw new Error('renderBudgetPdf: outPath obrigatório');
  if (!revision) throw new Error('renderBudgetPdf: revision obrigatório');

  // Garante o diretório
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `Orçamento TerraControl #${revision.revision_number}`,
        Author: 'TerraControl',
        Producer: 'TerraControl',
      },
    });
    const stream = fs.createWriteStream(outPath);
    stream.on('finish', () => resolve({ path: outPath, filename: path.basename(outPath) }));
    stream.on('error', reject);
    doc.pipe(stream);

    // ── Cabeçalho ──
    const headerHeight = 70;
    // Faixa gradiente simulada com 2 retângulos (pdfkit não tem gradient nativo)
    doc.rect(0, 0, doc.page.width / 2, headerHeight).fill(TC_GREEN);
    doc.rect(doc.page.width / 2, 0, doc.page.width / 2, headerHeight).fill(TC_BLUE);

    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, 50, 14, { fit: [42, 42] });
      } catch { /* logo opcional */ }
    }

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20)
      .text('TerraControl', 100, 20);
    doc.font('Helvetica').fontSize(11).fillColor('#E0E7FF')
      .text(`Orçamento #${revision.revision_number}`, 100, 44);

    // Data no canto direito
    doc.font('Helvetica').fontSize(10).fillColor('#FFFFFF')
      .text(formatDateBR(revision.created_at), 50, 30, {
        width: doc.page.width - 100,
        align: 'right',
      });

    doc.y = headerHeight + 20;
    doc.x = 50;

    // ── Dados do imóvel ──
    doc.fillColor(GREY_500).font('Helvetica-Bold').fontSize(9)
      .text('IMÓVEL', { paragraphGap: 2 });
    doc.fillColor(GREY_900).font('Helvetica-Bold').fontSize(14)
      .text(record?.imovel || '(sem nome)', { paragraphGap: 1 });
    doc.fillColor(GREY_700).font('Helvetica').fontSize(11)
      .text([
        record?.municipio,
        record?.cod_imovel != null ? `Cód. #${String(record.cod_imovel).padStart(3, '0')}` : null,
      ].filter(Boolean).join(' · '));
    doc.moveDown(0.6);

    // ── Cliente ──
    if (tcUser) {
      const fullName = [tcUser.first_name, tcUser.last_name].filter(Boolean).join(' ').trim()
        || tcUser.username || '';
      doc.fillColor(GREY_500).font('Helvetica-Bold').fontSize(9)
        .text('CLIENTE', { paragraphGap: 2 });
      doc.fillColor(GREY_900).font('Helvetica').fontSize(11)
        .text(fullName || '—');
      if (tcUser.email) doc.fillColor(GREY_700).fontSize(10).text(tcUser.email);
      doc.moveDown(0.8);
    }

    // ── Linha divisória ──
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
      .strokeColor(GREY_300).lineWidth(1).stroke();
    doc.moveDown(0.8);

    // ── Conteúdo TipTap ──
    try {
      const contentJson = typeof revision.content_json === 'string'
        ? JSON.parse(revision.content_json)
        : revision.content_json;
      renderTipTapDocument(doc, contentJson);
    } catch (err) {
      doc.fillColor('#dc2626').fontSize(10)
        .text(`(Erro ao renderizar conteúdo do orçamento: ${err.message})`);
    }
    doc.moveDown(0.8);

    // ── Tabela de itens ──
    const items = Array.isArray(revision.items)
      ? revision.items
      : (typeof revision.items === 'string' ? JSON.parse(revision.items || '[]') : []);

    if (items.length > 0) {
      const tableX = 50;
      const tableW = doc.page.width - 100;
      const descCol = tableX;
      const valCol  = doc.page.width - 50 - 100; // valor alinhado à direita, ~100px

      // Header
      doc.rect(tableX, doc.y, tableW, 22).fill(GREY_100);
      doc.fillColor(GREY_700).font('Helvetica-Bold').fontSize(10)
        .text('DESCRIÇÃO', descCol + 8, doc.y + 7, { width: valCol - descCol - 16 });
      doc.text('VALOR', valCol, doc.y - 14, { width: 92, align: 'right' });
      doc.y += 22;
      doc.x = tableX;

      // Rows
      doc.font('Helvetica').fontSize(10).fillColor(GREY_900);
      items.forEach((it, idx) => {
        const rowY = doc.y;
        const descText = String(it.description || it.descricao || '');
        const amount = Number(it.amount_cents ?? it.amountCents ?? 0);

        // Calcula altura necessária pra descrição (texto pode quebrar em N linhas)
        const descH = doc.heightOfString(descText, { width: valCol - descCol - 16 });
        const rowH = Math.max(descH + 12, 26);

        // Zebra sutil
        if (idx % 2 === 1) {
          doc.rect(tableX, rowY, tableW, rowH).fillColor('#fafafa').fill();
          doc.fillColor(GREY_900);
        }

        doc.text(descText || '—', descCol + 8, rowY + 6, { width: valCol - descCol - 16 });
        doc.text(formatBRL(amount), valCol, rowY + 6, { width: 92, align: 'right' });

        // Linha entre rows
        doc.moveTo(tableX, rowY + rowH).lineTo(tableX + tableW, rowY + rowH)
          .strokeColor(GREY_300).lineWidth(0.3).stroke();
        doc.y = rowY + rowH;
        doc.x = tableX;
      });

      doc.moveDown(0.4);

      // Total destacado
      const totalY = doc.y;
      doc.rect(tableX, totalY, tableW, 32).fill(TC_GREEN);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
        .text('TOTAL', descCol + 8, totalY + 10, { width: valCol - descCol - 16 });
      doc.fontSize(14)
        .text(formatBRL(revision.total_amount_cents), valCol, totalY + 8, {
          width: 92, align: 'right',
        });
      doc.y = totalY + 32;
      doc.x = tableX;
    } else {
      // Sem itens: mostra só o total
      doc.fillColor(GREY_500).fontSize(10)
        .text('Nenhum item discriminado.', { paragraphGap: 2 });
      doc.fillColor(TC_GREEN).font('Helvetica-Bold').fontSize(14)
        .text(`Total: ${formatBRL(revision.total_amount_cents)}`);
    }

    // ── Rodapé ──
    // Numeração de página (pdfkit chama o callback no final de cada página
    // automaticamente via bufferPages — habilitamos sob demanda).
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(GREY_500).font('Helvetica').fontSize(8)
        .text(
          `TerraControl · Orçamento #${revision.revision_number}`,
          50, doc.page.height - 40, { align: 'left', width: doc.page.width - 100 }
        );
      doc.text(
        `Página ${i + 1 - pages.start} de ${pages.count}`,
        50, doc.page.height - 40, { align: 'right', width: doc.page.width - 100 }
      );
    }

    doc.end();
  });
}

module.exports = {
  renderBudgetPdf,
  // Exportado pra testes/uso direto se necessário
  _internals: { renderTipTapDocument, fontForMarks, formatBRL },
};
