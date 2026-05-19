// Helpers para empacotar documentos (matrículas, ITR, CCIR, CAR) em ZIP via
// JSZip e salvar com file-saver. Compartilhado entre os dois componentes.
//
// Cada função aceita um UrlTransformer opcional: na View pública, ele injeta
// ?token=&password= em URLs /api/documents/* (G2.1); no componente autenticado,
// é identidade. O componente fica responsável só pelo estado de "downloading".

// G5.6 — JSZip + file-saver são pesados (~250KB juntos) e usados apenas quando
// o usuário clica em algum botão de download. Em vez de subir no chunk inicial
// do componente, carregamos sob demanda via dynamic import — Vite cria um
// chunk separado e o navegador só baixa quando a função é chamada.
//
// `import type` é elidido pelo TS no build, então não puxa o módulo em runtime —
// só serve para tipar o resultado do dynamic import.
import type JSZipType from 'jszip'
import type { saveAs as saveAsType } from 'file-saver'

type ZipLibs = {
  JSZip: typeof JSZipType
  saveAs: typeof saveAsType
}
let zipLibsPromise: Promise<ZipLibs> | null = null
const loadZipLibs = (): Promise<ZipLibs> => {
  if (!zipLibsPromise) {
    zipLibsPromise = Promise.all([import('jszip'), import('file-saver')]).then(
      ([jszipMod, fileSaverMod]) => ({
        JSZip: jszipMod.default,
        saveAs: fileSaverMod.saveAs,
      })
    )
  }
  return zipLibsPromise
}

import type { CcirItem, ItrItem, MatriculaItem, TerraControlRecord, UrlTransformer } from './types'
import { getSafeImovelName } from './normalize'

const identity: UrlTransformer = (url?: string) => url || ''

const safeFileName = (numero: string): string =>
  (numero || '').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'doc'

// Baixa uma URL → Blob, jogando erro para o caller. Mantemos try/catch nos
// loops para que falha em um arquivo não cancele os demais.
async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

export async function downloadAllMatriculasZip(
  matriculas: MatriculaItem[],
  imovelName: string,
  transform: UrlTransformer = identity
): Promise<void> {
  const comUrl = (matriculas || []).filter(m => m.url)
  if (comUrl.length === 0) return

  const { JSZip, saveAs } = await loadZipLibs()
  const zip = new JSZip()
  await Promise.all(
    comUrl.map(async mat => {
      try {
        const blob = await fetchBlob(transform(mat.url))
        zip.file(`Matricula_${safeFileName(mat.numero)}.pdf`, blob)
      } catch (e) {
        console.error(`Erro ao baixar matrícula ${mat.numero}:`, e)
      }
    })
  )

  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `Matriculas_${getSafeImovelName(imovelName)}.zip`)
}

export async function downloadAllItrZip(
  itrs: ItrItem[],
  imovelName: string,
  transform: UrlTransformer = identity
): Promise<void> {
  const comDocs = (itrs || []).filter(m => m.declaracaoUrl || m.reciboUrl)
  if (comDocs.length === 0) return

  const { JSZip, saveAs } = await loadZipLibs()
  const zip = new JSZip()
  const promises: Promise<void>[] = []

  for (const item of comDocs) {
    const safe = safeFileName(item.numero)
    const declUrl = item.declaracaoUrl
    if (declUrl) {
      promises.push((async () => {
        try {
          const blob = await fetchBlob(transform(declUrl))
          zip.file(`Itr_${safe}_Declaracao.pdf`, blob)
        } catch (e) {
          console.error(`Erro ITR declaração ${item.numero}:`, e)
        }
      })())
    }
    if (item.reciboUrl) {
      promises.push((async () => {
        try {
          const blob = await fetchBlob(transform(item.reciboUrl))
          zip.file(`Itr_${safe}_Recibo.pdf`, blob)
        } catch (e) {
          console.error(`Erro ITR recibo ${item.numero}:`, e)
        }
      })())
    }
  }

  await Promise.all(promises)
  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `ITRs_${getSafeImovelName(imovelName)}.zip`)
}

export async function downloadSingleItrZip(
  item: ItrItem,
  imovelName: string,
  transform: UrlTransformer = identity
): Promise<void> {
  if (!item.declaracaoUrl && !item.reciboUrl) return

  const { JSZip, saveAs } = await loadZipLibs()
  const zip = new JSZip()
  const safe = safeFileName(item.numero)
  const promises: Promise<void>[] = []

  const declUrl = item.declaracaoUrl
  if (declUrl) {
    promises.push((async () => {
      try {
        const blob = await fetchBlob(transform(declUrl))
        zip.file(`Itr_${safe}_Declaracao.pdf`, blob)
      } catch (e) { console.error('Erro declaração:', e) }
    })())
  }
  if (item.reciboUrl) {
    promises.push((async () => {
      try {
        const blob = await fetchBlob(transform(item.reciboUrl))
        zip.file(`Itr_${safe}_Recibo.pdf`, blob)
      } catch (e) { console.error('Erro recibo:', e) }
    })())
  }

  await Promise.all(promises)
  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `ITR_${item.numero}_${getSafeImovelName(imovelName)}.zip`)
}

export async function downloadAllCcirZip(
  ccirs: CcirItem[],
  imovelName: string,
  transform: UrlTransformer = identity
): Promise<void> {
  const comUrl = (ccirs || []).filter(m => m.url)
  if (comUrl.length === 0) return

  const { JSZip, saveAs } = await loadZipLibs()
  const zip = new JSZip()
  await Promise.all(
    comUrl.map(async mat => {
      try {
        const blob = await fetchBlob(transform(mat.url))
        zip.file(`Ccir_${safeFileName(mat.numero)}.pdf`, blob)
      } catch (e) {
        console.error(`Erro CCIR ${mat.numero}:`, e)
      }
    })
  )

  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `CCIRs_${getSafeImovelName(imovelName)}.zip`)
}

// Empacota TODO o registro (CAR + matrículas + ITRs + CCIRs) em folders separados.
export async function downloadRegistroZip(
  record: TerraControlRecord,
  transform: UrlTransformer = identity
): Promise<{ empty: boolean }> {
  const matriculas = (record.matriculasDados || []).filter(m => m.url)
  const itrs = (record.itrDados || []).filter(m => m.declaracaoUrl || m.reciboUrl)
  const ccirs = (record.ccirDados || []).filter(m => m.url)
  const hasCar = !!record.carUrl

  if (!hasCar && matriculas.length === 0 && itrs.length === 0 && ccirs.length === 0) {
    return { empty: true }
  }

  const { JSZip, saveAs } = await loadZipLibs()
  const zip = new JSZip()
  const promises: Promise<void>[] = []

  if (hasCar) {
    promises.push((async () => {
      try {
        const blob = await fetchBlob(transform(record.carUrl))
        zip.folder('CAR')?.file(`CAR_${safeFileName(record.car || 'CAR')}.pdf`, blob)
      } catch (e) {
        console.error(`Erro CAR ${record.car}:`, e)
      }
    })())
  }

  for (const mat of matriculas) {
    promises.push((async () => {
      try {
        const blob = await fetchBlob(transform(mat.url))
        zip.folder('Matriculas')?.file(`Matricula_${safeFileName(mat.numero)}.pdf`, blob)
      } catch (e) {
        console.error(`Erro matrícula ${mat.numero}:`, e)
      }
    })())
  }

  for (const item of itrs) {
    const safe = safeFileName(item.numero)
    const declUrl = item.declaracaoUrl
    if (declUrl) {
      promises.push((async () => {
        try {
          const blob = await fetchBlob(transform(declUrl))
          zip.folder('Itr')?.file(`Itr_${safe}_Declaracao.pdf`, blob)
        } catch (e) {
          console.error(`Erro ITR declaração ${item.numero}:`, e)
        }
      })())
    }
    if (item.reciboUrl) {
      promises.push((async () => {
        try {
          const blob = await fetchBlob(transform(item.reciboUrl))
          zip.folder('Itr')?.file(`Itr_${safe}_Recibo.pdf`, blob)
        } catch (e) {
          console.error(`Erro ITR recibo ${item.numero}:`, e)
        }
      })())
    }
  }

  for (const ccir of ccirs) {
    promises.push((async () => {
      try {
        const blob = await fetchBlob(transform(ccir.url))
        zip.folder('Ccir')?.file(`Ccir_${safeFileName(ccir.numero)}.pdf`, blob)
      } catch (e) {
        console.error(`Erro CCIR ${ccir.numero}:`, e)
      }
    })())
  }

  await Promise.all(promises)
  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `Documentos_${getSafeImovelName(record.imovel)}.zip`)
  return { empty: false }
}
