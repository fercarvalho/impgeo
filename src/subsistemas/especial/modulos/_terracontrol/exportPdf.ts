// Geração do PDF de relatório do TerraControl — extraída do componente
// TerraControlView pra não inflar o chunk inicial. Carregada via dynamic
// import só quando o usuário clica em "Exportar dados". O `jspdf` (~380KB)
// fica em vendor-jspdf separado pelo Rollup.

import type { TerraControlRecord, APPField } from './index'
import {
  formatNumber,
  formatCodImovel,
  getTotalImoveisData,
  getAreaTotalData,
  getGeoCertificacaoData,
  getGeoRegistroData,
  getCulturaData,
  getAPPData,
  getReservaLegalData,
} from './index'

export interface ExportPdfOptions {
  records: TerraControlRecord[]              // base de cálculo das métricas
  selectedRecords: TerraControlRecord[]      // só esses entram na seção de detalhe
  ownerName?: string                          // nome do tc_user pra header e filename
  filenamePrefix?: string                     // 'terracontrol' (default) ou 'terracontrol-<owner>'
}

interface PieRow { name: string; value: number; color: string }

export async function exportTerraControlPdf(opts: ExportPdfOptions): Promise<void> {
  const { records, selectedRecords } = opts
  if (records.length === 0) throw new Error('Nenhum registro para exportar.')

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const HEADER_HEIGHT = 22
  const CONTENT_TOP = HEADER_HEIGHT + 8
  let y = margin

  const dateStr = new Date().toLocaleString('pt-BR')
  const ownerStr = opts.ownerName ? ` · ${opts.ownerName}` : ''

  const drawHeader = () => {
    doc.setFillColor(72, 163, 38)
    doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('TerraControl — Relatório de Métricas', margin, 14)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em ${dateStr}${ownerStr}`, margin, 19)
    doc.setTextColor(40, 40, 40)
  }

  const addPageWithHeader = () => {
    doc.addPage()
    drawHeader()
    y = CONTENT_TOP
  }

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) { addPageWithHeader() }
  }

  const sectionTitle = (title: string) => {
    ensure(10)
    doc.setFillColor(0, 65, 177)
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(title, margin + 2, y + 5)
    y += 10
    doc.setTextColor(40, 40, 40)
  }

  const kv = (k: string, v: string, indent = 0) => {
    ensure(5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(k, margin + indent, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v), margin + indent + 55, y)
    y += 5.2
  }

  const drawPieDataUrl = (data: PieRow[], size: number): string | null => {
    const total = data.reduce((s, d) => s + d.value, 0)
    if (total <= 0) return null
    const canvas = document.createElement('canvas')
    const dpi = 2
    canvas.width = size * dpi
    canvas.height = size * dpi
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpi, dpi)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    const cx = size / 2
    const cy = size / 2
    const r = size * 0.4
    let start = -Math.PI / 2
    data.forEach(d => {
      const slice = (d.value / total) * Math.PI * 2
      const end = start + slice
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fillStyle = d.color || '#3b82f6'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      start = end
    })
    return canvas.toDataURL('image/png')
  }

  const pieChart = (rows: PieRow[], valueLabel: string, formatVal: (v: number) => string) => {
    if (rows.length === 0) {
      ensure(5)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(120, 120, 120)
      doc.text('Sem dados.', margin + 2, y)
      doc.setTextColor(40, 40, 40)
      y += 6
      return
    }
    const total = rows.reduce((s, r) => s + r.value, 0)
    const pieSize = 55
    const dataUrl = drawPieDataUrl(rows, 400)

    ensure(pieSize + 4)

    const pieY = y
    const pieX = margin
    if (dataUrl) doc.addImage(dataUrl, 'PNG', pieX, pieY, pieSize, pieSize)

    const legendX = pieX + pieSize + 5
    const legendW = pageWidth - legendX - margin
    let legY = pieY + 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(80, 80, 80)
    doc.text('Item', legendX + 5, legY)
    doc.text(valueLabel, legendX + legendW - 2, legY, { align: 'right' })
    doc.text('%', legendX + legendW - 22, legY, { align: 'right' })
    legY += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(40, 40, 40)

    rows.forEach((row) => {
      if (legY - pieY > pieSize && legY > pageHeight - margin - 5) {
        addPageWithHeader()
        legY = y + 4
      }
      doc.setFillColor(row.color || '#3b82f6')
      doc.rect(legendX, legY - 2.5, 3, 3, 'F')
      const nm = row.name && row.name.length > 38 ? row.name.slice(0, 36) + '…' : (row.name || '—')
      doc.text(nm, legendX + 5, legY)
      const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) + '%' : '—'
      doc.text(pct, legendX + legendW - 22, legY, { align: 'right' })
      doc.text(formatVal(row.value), legendX + legendW - 2, legY, { align: 'right' })
      legY += 4
    })

    y = Math.max(pieY + pieSize, legY) + 5
  }

  // ── HEADER (1ª página)
  drawHeader()
  y = CONTENT_TOP

  // ── SEÇÃO 1: Resumo geral
  sectionTitle('Resumo')
  const totalArea = records.reduce((s, r) => s + (r.areaTotal || 0), 0)
  const totalRL   = records.reduce((s, r) => s + (r.reservaLegal || 0), 0)
  const comGeoCert = records.filter(r => r.geoCertificacao === 'SIM').length
  const comGeoReg  = records.filter(r => r.geoRegistro === 'SIM').length
  kv('Total de imóveis', String(records.length))
  kv('Área total', `${formatNumber(totalArea)} ha`)
  kv('Reserva Legal somada', `${formatNumber(totalRL)} ha`)
  kv('Com geo certificação', `${comGeoCert} / ${records.length}`)
  kv('Com geo registro', `${comGeoReg} / ${records.length}`)
  y += 2

  // ── SEÇÃO 2: Distribuição por município
  sectionTitle('Distribuição por município (imóveis)')
  pieChart(getTotalImoveisData(records), 'Imóveis', v => String(v))

  sectionTitle('Distribuição por município (área total)')
  pieChart(getAreaTotalData(records), 'Área (ha)', v => `${formatNumber(v)} ha`)

  // ── SEÇÃO 3: Geo Certificação / Registro
  sectionTitle('Geo Certificação')
  pieChart(getGeoCertificacaoData(records), 'Imóveis', v => String(v))

  sectionTitle('Geo Registro')
  pieChart(getGeoRegistroData(records), 'Imóveis', v => String(v))

  // ── SEÇÃO 4: Top imóveis por cultura
  const culturas = ['Silvicultura', 'Cultura Temporária', 'Pasto', 'Banhado', 'Servidão', 'Área Antropizada']
  culturas.forEach(tipo => {
    const data = getCulturaData(records, tipo)
    if (data.length === 0) return
    sectionTitle(`Top imóveis — ${tipo}`)
    pieChart(data, 'Área (ha)', v => `${formatNumber(v)} ha`)
  })

  // ── SEÇÃO 5: Reserva Legal e APP/Ambiental
  sectionTitle('Top imóveis — Reserva Legal')
  pieChart(getReservaLegalData(records), 'Área (ha)', v => `${formatNumber(v)} ha`)

  const appFields: Array<{ field: APPField; label: string }> = [
    { field: 'appCodigoFlorestal',    label: 'APP Código Florestal' },
    { field: 'appVegetada',           label: 'APP Vegetada' },
    { field: 'appNaoVegetada',        label: 'APP Não Vegetada' },
    { field: 'remanescenteFlorestal', label: 'Remanescente Florestal' },
  ]
  appFields.forEach(({ field, label }) => {
    const data = getAPPData(records, field)
    if (data.length === 0) return
    sectionTitle(`Top imóveis — ${label}`)
    pieChart(data, 'Área (ha)', v => `${formatNumber(v)} ha`)
  })

  // ── SEÇÃO 6 (condicional): Detalhamento dos registros selecionados
  if (selectedRecords.length > 0) {
    addPageWithHeader()
    sectionTitle(`Detalhamento dos ${selectedRecords.length} registro(s) selecionado(s)`)

    for (const r of selectedRecords) {
      ensure(40)
      doc.setFillColor(240, 245, 250)
      doc.rect(margin, y - 4, pageWidth - margin * 2, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 65, 177)
      doc.text(`#${formatCodImovel(r.codImovel)} · ${r.imovel || ''}`, margin + 1, y + 1)
      doc.setTextColor(80, 80, 80)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const muni = r.municipio || '—'
      doc.text(muni, pageWidth - margin - 1, y + 1, { align: 'right' })
      y += 8
      doc.setTextColor(40, 40, 40)
      const fields: Array<[string, string]> = [
        ['CAR', r.car || '—'],
        ['Status CAR', r.statusCar || '—'],
        ['Área total', `${formatNumber(r.areaTotal || 0)} ha`],
        ['Reserva Legal', `${formatNumber(r.reservaLegal || 0)} ha`],
        ['Cultura 1', r.cultura1 ? `${r.cultura1} (${formatNumber(r.areaCultura1 || 0)} ha)` : '—'],
        ['Cultura 2', r.cultura2 ? `${r.cultura2} (${formatNumber(r.areaCultura2 || 0)} ha)` : '—'],
        ['Outros', r.outros ? `${r.outros} (${formatNumber(r.areaOutros || 0)} ha)` : '—'],
        ['APP Cód. Florestal', `${formatNumber(r.appCodigoFlorestal || 0)} ha`],
        ['APP Vegetada', `${formatNumber(r.appVegetada || 0)} ha`],
        ['APP Não Vegetada', `${formatNumber(r.appNaoVegetada || 0)} ha`],
        ['Remanescente Florestal', `${formatNumber(r.remanescenteFlorestal || 0)} ha`],
        ['Geo Certificação', r.geoCertificacao || '—'],
        ['Geo Registro', r.geoRegistro || '—'],
      ]
      fields.forEach(([k, v]) => kv(k + ':', v, 4))
      y += 3
    }
  }

  const prefix = opts.filenamePrefix || 'terracontrol'
  doc.save(`${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
