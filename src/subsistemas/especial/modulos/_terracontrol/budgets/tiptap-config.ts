// Config compartilhada do TipTap usada no editor de orçamentos e no editor
// de template. Mantém o subset de nodes/marks alinhado ao adapter do PDF
// server-side (server/services/budget-pdf.js): paragraph, heading 1-3,
// bullet/ordered list, horizontal rule + marks bold/italic.
//
// Variáveis disponíveis pra substituição: {{imovel}}, {{municipio}},
// {{codImovel}}, {{areaTotal}}, {{reservaLegal}}, {{tcUserName}}.
// substituteVariables faz a troca no JSON inteiro de forma defensiva
// (só nodes type='text', sem reescrever estrutura).

import StarterKit from '@tiptap/starter-kit'

// Extensões usadas tanto no editor admin quanto no viewer readonly.
// `bold` + `italic` já vêm no StarterKit; demais opções alinhadas ao que
// o pdfkit consegue renderizar no PDF.
export const tiptapExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // Coisas que NÃO temos suporte no PDF — desabilitamos pra evitar que
    // admin insira algo que não vai aparecer na versão final:
    code: false,
    codeBlock: false,
    blockquote: false, // (FooterManagement/LegalManagement usam, mas pdfkit não)
  }),
]

// Mapa de variáveis disponíveis pro template/orçamento. UI lista esses
// labels nos chips clicáveis; substituteVariables consome o valor.
export interface BudgetVariableContext {
  imovel?: string | null
  municipio?: string | null
  codImovel?: string | number | null
  areaTotal?: string | number | null
  reservaLegal?: string | number | null
  tcUserName?: string | null
}

export const AVAILABLE_VARIABLES: Array<{ key: keyof BudgetVariableContext; label: string; example: string }> = [
  { key: 'imovel',       label: '{{imovel}}',       example: 'Fazenda Boa Vista' },
  { key: 'municipio',    label: '{{municipio}}',    example: 'São Paulo - SP' },
  { key: 'codImovel',    label: '{{codImovel}}',    example: '042' },
  { key: 'areaTotal',    label: '{{areaTotal}}',    example: '125.5 ha' },
  { key: 'reservaLegal', label: '{{reservaLegal}}', example: '25.1 ha' },
  { key: 'tcUserName',   label: '{{tcUserName}}',   example: 'João Silva' },
]

function formatVarValue(ctx: BudgetVariableContext, key: keyof BudgetVariableContext): string {
  const v = ctx[key]
  if (v === null || v === undefined || v === '') return `{{${key}}}`
  if (key === 'codImovel') return String(v).padStart(3, '0')
  if (key === 'areaTotal' || key === 'reservaLegal') return `${v} ha`
  return String(v)
}

// Substitui {{var}} em todos os nodes type='text' do JSON. NÃO altera
// estrutura, marks ou nodes não-text — totalmente seguro pra qualquer
// JSON TipTap válido.
export function substituteVariables(json: any, ctx: BudgetVariableContext): any {
  if (!json) return json
  if (Array.isArray(json)) return json.map(n => substituteVariables(n, ctx))
  if (typeof json !== 'object') return json
  if (json.type === 'text' && typeof json.text === 'string') {
    let text = json.text
    for (const v of AVAILABLE_VARIABLES) {
      const pattern = new RegExp(`\\{\\{\\s*${v.key}\\s*\\}\\}`, 'g')
      text = text.replace(pattern, formatVarValue(ctx, v.key))
    }
    return { ...json, text }
  }
  if (Array.isArray(json.content)) {
    return { ...json, content: json.content.map((n: any) => substituteVariables(n, ctx)) }
  }
  return json
}

// JSON TipTap mínimo válido pra inicializar editor vazio.
export const EMPTY_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
