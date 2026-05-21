// Modal de cadastro/edição de registro TerraControl PELO TC_USER.
// Versão enxuta do modal de admin (em TerraControl.tsx) — só 2 abas:
//   1. Básico (imóvel, município, link do mapa, CAR, status CAR)
//   2. Documentos (matrículas, ITRs, CCIRs com upload de PDF)
//
// Sem áreas/culturas/ambiental (o admin que preenche/edita esses).
//
// Endpoints:
//   - POST /api/tc-auth/me/records       (criação)
//   - PUT  /api/tc-auth/me/records/:id   (edição)
//   - POST /api/tc-auth/me/upload-car    (upload de PDF — espelho do /api/terracontrol/upload-car)
//
// Auth: Bearer <tcToken> via TcAuthContext.

import React, { useEffect, useState } from 'react'
import {
  X, Plus, Trash2, Upload, Check, RefreshCw, ExternalLink, Loader2, FileText, ClipboardCheck,
} from 'lucide-react'
import Modal from '@/components/Modal'
import { useTcAuth } from '@/contexts/TcAuthContext'
import type { TerraControlRecord, MatriculaItem, ItrItem, CcirItem } from './types'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** undefined = criação; presente = edição */
  record?: TerraControlRecord | null
  onSaved: (record: TerraControlRecord) => void
  notify: NotifyFn
}

type FormTab = 'basico' | 'documentos'

const API_BASE_URL = '/api'

// ID local pra item de matrícula/itr/ccir antes de ir pro banco
const localId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const STATUS_CAR_OPTIONS = [
  'ATIVO - AGUARDANDO ANÁLISE',
  'ATIVO',
  'PENDENTE',
  'INATIVO',
]

const TcRecordFormModal: React.FC<Props> = ({ isOpen, onClose, record, onSaved, notify }) => {
  const { tcToken } = useTcAuth()
  const isEdit = !!record

  // ── State do form ───────────────────────────────────────────────────────
  const [tab, setTab] = useState<FormTab>('basico')

  // Básico
  const [imovel, setImovel] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [mapaUrl, setMapaUrl] = useState('')
  const [car, setCar] = useState('')
  const [carUrl, setCarUrl] = useState<string>('')
  const [statusCar, setStatusCar] = useState<string>('ATIVO - AGUARDANDO ANÁLISE')

  // Documentos
  const [matriculasDados, setMatriculasDados] = useState<MatriculaItem[]>([])
  const [itrDados, setItrDados] = useState<ItrItem[]>([])
  const [ccirDados, setCcirDados] = useState<CcirItem[]>([])

  // Uploads em andamento (id do item → bool)
  const [uploadingCar, setUploadingCar] = useState(false)
  const [uploadingMatricula, setUploadingMatricula] = useState<string | null>(null)
  const [uploadingItrDecl, setUploadingItrDecl] = useState<string | null>(null)
  const [uploadingItrRec, setUploadingItrRec] = useState<string | null>(null)
  const [uploadingCcir, setUploadingCcir] = useState<string | null>(null)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Hydrate state ao abrir / mudar de record ───────────────────────────
  useEffect(() => {
    if (!isOpen) return
    setTab('basico')
    setErrors({})
    if (record) {
      setImovel(record.imovel || '')
      setMunicipio(record.municipio || '')
      setMapaUrl(record.mapaUrl || '')
      setCar(record.car || '')
      setCarUrl(record.carUrl || '')
      setStatusCar(record.statusCar || 'ATIVO - AGUARDANDO ANÁLISE')
      setMatriculasDados(record.matriculasDados ? [...record.matriculasDados] : [])
      setItrDados(record.itrDados ? [...record.itrDados] : [])
      setCcirDados(record.ccirDados ? [...record.ccirDados] : [])
    } else {
      setImovel('')
      setMunicipio('')
      setMapaUrl('')
      setCar('')
      setCarUrl('')
      setStatusCar('ATIVO - AGUARDANDO ANÁLISE')
      setMatriculasDados([])
      setItrDados([])
      setCcirDados([])
    }
  }, [isOpen, record])

  // ── Validação ───────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!imovel.trim()) e.imovel = 'Nome do imóvel é obrigatório'
    if (!municipio.trim()) e.municipio = 'Município é obrigatório'
    if (!mapaUrl.trim()) e.mapaUrl = 'Link do Google Maps é obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Upload helper ───────────────────────────────────────────────────────
  const uploadFile = async (file: File): Promise<string | null> => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('Selecione apenas arquivos PDF.', { type: 'warning' })
      return null
    }
    if (file.size > 20 * 1024 * 1024) {
      notify('O arquivo é muito grande (máx 20MB).', { type: 'warning' })
      return null
    }
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE_URL}/tc-auth/me/upload-car`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tcToken || ''}` },
      credentials: 'include',
      body: formData,
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success && data.url) return data.url
    notify(data?.error || 'Erro ao enviar arquivo', { type: 'error' })
    return null
  }

  // ── Handlers de arquivo ─────────────────────────────────────────────────
  const handleCarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingCar(true)
    try {
      const url = await uploadFile(file)
      if (url) setCarUrl(url)
    } finally { setUploadingCar(false) }
  }

  const handleMatriculaFile = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingMatricula(id)
    try {
      const url = await uploadFile(file)
      if (url) setMatriculasDados(prev => prev.map(m => m.id === id ? { ...m, url } : m))
    } finally { setUploadingMatricula(null) }
  }

  const handleItrDeclFile = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingItrDecl(id)
    try {
      const url = await uploadFile(file)
      if (url) setItrDados(prev => prev.map(i => i.id === id ? { ...i, declaracaoUrl: url } : i))
    } finally { setUploadingItrDecl(null) }
  }

  const handleItrRecFile = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingItrRec(id)
    try {
      const url = await uploadFile(file)
      if (url) setItrDados(prev => prev.map(i => i.id === id ? { ...i, reciboUrl: url } : i))
    } finally { setUploadingItrRec(null) }
  }

  const handleCcirFile = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingCcir(id)
    try {
      const url = await uploadFile(file)
      if (url) setCcirDados(prev => prev.map(c => c.id === id ? { ...c, url } : c))
    } finally { setUploadingCcir(null) }
  }

  // ── CRUD de items ───────────────────────────────────────────────────────
  const addMatricula = () => setMatriculasDados(prev => [...prev, { id: localId(), numero: '' }])
  const removeMatricula = (id: string) => setMatriculasDados(prev => prev.filter(m => m.id !== id))
  const setMatriculaNumero = (id: string, numero: string) =>
    setMatriculasDados(prev => prev.map(m => m.id === id ? { ...m, numero } : m))

  const addItr = () => setItrDados(prev => [...prev, { id: localId(), numero: '' }])
  const removeItr = (id: string) => setItrDados(prev => prev.filter(i => i.id !== id))
  const setItrNumero = (id: string, numero: string) =>
    setItrDados(prev => prev.map(i => i.id === id ? { ...i, numero } : i))

  const addCcir = () => setCcirDados(prev => [...prev, { id: localId(), numero: '' }])
  const removeCcir = (id: string) => setCcirDados(prev => prev.filter(c => c.id !== id))
  const setCcirNumero = (id: string, numero: string) =>
    setCcirDados(prev => prev.map(c => c.id === id ? { ...c, numero } : c))

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!validate()) { setTab('basico'); return }

    setSubmitting(true)
    try {
      const payload = {
        imovel: imovel.trim(),
        municipio: municipio.trim(),
        mapaUrl: mapaUrl.trim(),
        car: car.trim() || null,
        carUrl: carUrl || null,
        statusCar,
        matriculas: matriculasDados.map(m => m.numero).filter(Boolean).join(', '),
        matriculasDados,
        nIncraCcir: ccirDados.map(c => c.numero).filter(Boolean).join(', '),
        ccirDados,
        itr: itrDados.map(i => i.numero).filter(Boolean).join(', '),
        itrDados,
      }
      const url = isEdit
        ? `${API_BASE_URL}/tc-auth/me/records/${record!.id}`
        : `${API_BASE_URL}/tc-auth/me/records`
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${tcToken || ''}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        notify(isEdit ? 'Registro atualizado' : 'Registro criado — aguardando aprovação', { type: 'success' })
        onSaved(data.data)
        onClose()
      } else {
        notify(data?.error || 'Erro ao salvar', { type: 'error' })
      }
    } catch (err: any) {
      notify(err?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
      active ? 'border-tc-blue text-tc-blue' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
    }`

  // Helpers do badge "PDF anexado"
  const PdfBadge: React.FC<{ url?: string; onRemove: () => void; label?: string }> = ({ url, onRemove, label = 'PDF Anexado' }) => {
    if (!url) return null
    return (
      <div className="flex items-center gap-2 text-xs text-green-600 mt-1">
        <Check className="w-3 h-3" />
        <span>{label}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center ml-1">
          <ExternalLink className="w-3 h-3 mr-1" /> Ver
        </a>
        <button type="button" onClick={onRemove} className="ml-1 text-red-500 hover:text-red-700">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-4 text-white flex items-center justify-between">
          <h2 className="text-lg font-bold">{isEdit ? 'Editar registro' : 'Novo registro'}</h2>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 bg-gray-50 dark:bg-[#243040]">
          <button type="button" onClick={() => setTab('basico')} className={tabClass(tab === 'basico')}>Básico</button>
          <button type="button" onClick={() => setTab('documentos')} className={tabClass(tab === 'documentos')}>Documentos</button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* ─── BÁSICO ─── */}
          <div className={tab !== 'basico' ? 'hidden' : ''}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome do imóvel *</label>
                <input type="text" value={imovel} onChange={(e) => setImovel(e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 ${errors.imovel ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} required />
                {errors.imovel && <p className="text-red-500 text-xs mt-1">{errors.imovel}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Município *</label>
                <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 ${errors.municipio ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} required />
                {errors.municipio && <p className="text-red-500 text-xs mt-1">{errors.municipio}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Link do Google Maps *</label>
                <input type="url" value={mapaUrl} onChange={(e) => setMapaUrl(e.target.value)}
                  placeholder="https://www.google.com/maps/d/u/0/viewer?..."
                  className={`w-full h-10 px-3 text-sm border rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 ${errors.mapaUrl ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} required />
                {errors.mapaUrl ? <p className="text-red-500 text-xs mt-1">{errors.mapaUrl}</p>
                  : <p className="text-xs text-gray-500 mt-1">Cole o link completo do Google Maps</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">CAR (Cadastro Ambiental Rural)</label>
                <div className="flex gap-2">
                  <input type="text" value={car} onChange={(e) => setCar(e.target.value)} placeholder="Número do CAR"
                    className="flex-1 h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                  <input type="file" id="tc-carFile" accept=".pdf,application/pdf" className="hidden" onChange={handleCarFile} />
                  <button type="button" onClick={() => document.getElementById('tc-carFile')?.click()}
                    className={`px-3 h-10 border rounded-lg flex items-center justify-center ${carUrl ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white dark:!bg-[#243040] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
                    {uploadingCar ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </button>
                </div>
                <PdfBadge url={carUrl} onRemove={() => setCarUrl('')} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Status CAR</label>
                <select value={statusCar} onChange={(e) => setStatusCar(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100">
                  {STATUS_CAR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ─── DOCUMENTOS ─── */}
          <div className={tab !== 'documentos' ? 'hidden' : ''}>
            {/* Matrículas */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Matrículas</label>
              <div className="space-y-2">
                {matriculasDados.map(m => (
                  <div key={m.id} className="flex gap-2 items-start bg-gray-50 dark:bg-[#243040] p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <input type="text" value={m.numero} onChange={(e) => setMatriculaNumero(m.id, e.target.value)}
                        placeholder="Número da Matrícula"
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-900 dark:text-gray-100" />
                      <PdfBadge url={m.url} onRemove={() => setMatriculasDados(prev => prev.map(x => x.id === m.id ? { ...x, url: undefined } : x))} />
                    </div>
                    <input type="file" id={`tc-mat-${m.id}`} accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleMatriculaFile(e, m.id)} />
                    <button type="button" onClick={() => document.getElementById(`tc-mat-${m.id}`)?.click()}
                      className={`px-3 py-2 border rounded-lg ${m.url ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white dark:!bg-[#1a2332] border-gray-300 text-gray-600'}`}>
                      {uploadingMatricula === m.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => removeMatricula(m.id)}
                      className="px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addMatricula}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium border border-blue-100">
                  <Plus className="w-4 h-4" /> Nova Matrícula
                </button>
              </div>
            </div>

            {/* CCIR */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">N INCRA / CCIR (Cadastro de Imóvel Rural)</label>
              <div className="space-y-2">
                {ccirDados.map(c => (
                  <div key={c.id} className="flex gap-2 items-start bg-gray-50 dark:bg-[#243040] p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <input type="text" value={c.numero} onChange={(e) => setCcirNumero(c.id, e.target.value)}
                        placeholder="Número do CCIR"
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-900 dark:text-gray-100" />
                      <PdfBadge url={c.url} onRemove={() => setCcirDados(prev => prev.map(x => x.id === c.id ? { ...x, url: undefined } : x))} />
                    </div>
                    <input type="file" id={`tc-ccir-${c.id}`} accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleCcirFile(e, c.id)} />
                    <button type="button" onClick={() => document.getElementById(`tc-ccir-${c.id}`)?.click()}
                      className={`px-3 py-2 border rounded-lg ${c.url ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white dark:!bg-[#1a2332] border-gray-300 text-gray-600'}`}>
                      {uploadingCcir === c.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => removeCcir(c.id)}
                      className="px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addCcir}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium border border-blue-100">
                  <Plus className="w-4 h-4" /> Novo CCIR
                </button>
              </div>
            </div>

            {/* ITR */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ITR</label>
              <div className="space-y-2">
                {itrDados.map(i => (
                  <div key={i.id} className="flex gap-2 items-start bg-gray-50 dark:bg-[#243040] p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <input type="text" value={i.numero} onChange={(e) => setItrNumero(i.id, e.target.value)}
                        placeholder="Número do ITR"
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:!bg-[#1a2332] text-gray-900 dark:text-gray-100" />
                      <PdfBadge url={i.declaracaoUrl} onRemove={() => setItrDados(prev => prev.map(x => x.id === i.id ? { ...x, declaracaoUrl: undefined } : x))} label="Declaração ITR" />
                      <PdfBadge url={i.reciboUrl} onRemove={() => setItrDados(prev => prev.map(x => x.id === i.id ? { ...x, reciboUrl: undefined } : x))} label="Recibo ITR" />
                    </div>
                    <div className="flex flex-col items-center">
                      <input type="file" id={`tc-itrd-${i.id}`} accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleItrDeclFile(e, i.id)} />
                      <button type="button" onClick={() => document.getElementById(`tc-itrd-${i.id}`)?.click()} title="Anexar Declaração"
                        className={`px-3 py-2 border rounded-lg ${i.declaracaoUrl ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white dark:!bg-[#1a2332] border-gray-300 text-gray-600'}`}>
                        {uploadingItrDecl === i.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      </button>
                      <span className="text-[9px] uppercase font-bold text-gray-400 mt-0.5">Decl.</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input type="file" id={`tc-itrr-${i.id}`} accept=".pdf,application/pdf" className="hidden" onChange={(e) => handleItrRecFile(e, i.id)} />
                      <button type="button" onClick={() => document.getElementById(`tc-itrr-${i.id}`)?.click()} title="Anexar Recibo"
                        className={`px-3 py-2 border rounded-lg ${i.reciboUrl ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white dark:!bg-[#1a2332] border-gray-300 text-gray-600'}`}>
                        {uploadingItrRec === i.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                      </button>
                      <span className="text-[9px] uppercase font-bold text-gray-400 mt-0.5">Recibo</span>
                    </div>
                    <button type="button" onClick={() => removeItr(i.id)}
                      className="px-3 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 h-[38px]">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addItr}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium border border-blue-100">
                  <Plus className="w-4 h-4" /> Novo ITR
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex justify-between items-center gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isEdit
              ? 'Editar registro reseta o status para "Pendente aprovação"'
              : 'Após salvar, o registro fica pendente até admin aprovar.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Salvar alterações' : 'Criar registro'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default TcRecordFormModal
