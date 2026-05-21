// Edição de perfil do tc_user (entrada pública terracontrol.viverdepj.com.br).
// Espelha o UserProfileModal do impgeo, mas:
//   - usa TcAuthContext (não AuthContext do impgeo)
//   - endpoint PUT /api/tc-auth/me
//   - tema visual verde→azul do TerraControl
//   - integra ViaCEP/BrasilAPI no campo CEP (reutiliza utils/cepMask.ts do impgeo)
//   - exige currentPassword se o email for alterado (D2.7)
//   - PhotoUpload reaproveitado do impgeo (com ImageCrop + processImage),
//     chamando endpoint POST /api/tc-auth/me/photo
//
// Campos cobertos: foto, firstName, lastName, email, phone, cpf, birthDate,
// gender, address (com CEP + rua/bairro/cidade/UF/complemento).

import React, { useEffect, useMemo, useState } from 'react'
import { X, Loader2, MapPin, AlertTriangle } from 'lucide-react'
import Modal from '@/components/Modal'
import PhotoUpload from '@/components/PhotoUpload'
import { useTcAuth, type TcUser } from '@/contexts/TcAuthContext'
import { applyCepMask, fetchAddressByCep, removeCepMask } from '@/utils/cepMask'

interface NotifyFn {
  (message: string, opts?: { type?: 'success' | 'error' | 'warning' | 'info' }): void
}

interface Props {
  isOpen: boolean
  onClose: () => void
  notify: NotifyFn
  // F2.3: modo obrigatório (não-fechável). Usado quando
  // tcUser.requiresProfileCompletion === true. Esconde X/Cancelar,
  // bloqueia ESC e click-outside via prop destructive do Modal.
  required?: boolean
}

interface Address {
  cep?: string
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
}

const TcEditarPerfilModal: React.FC<Props> = ({ isOpen, onClose, notify, required = false }) => {
  const { tcUser, updateTcUser, refreshTcUser } = useTcAuth()

  const initialAddress: Address = useMemo(() => {
    const a = (tcUser?.address as Address | null | undefined) || {}
    return {
      cep: a.cep || '',
      street: a.street || '',
      number: a.number || '',
      complement: a.complement || '',
      neighborhood: a.neighborhood || '',
      city: a.city || '',
      state: a.state || '',
    }
  }, [tcUser?.address])

  const [firstName, setFirstName] = useState(tcUser?.firstName || '')
  const [lastName, setLastName] = useState(tcUser?.lastName || '')
  const [email, setEmail] = useState(tcUser?.email || '')
  const [phone, setPhone] = useState(tcUser?.phone || '')
  const [cpf, setCpf] = useState(tcUser?.cpf || '')
  const [birthDate, setBirthDate] = useState(tcUser?.birthDate || '')
  const [gender, setGender] = useState(tcUser?.gender || '')
  const [address, setAddress] = useState<Address>(initialAddress)
  const [currentPassword, setCurrentPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState('')

  // Foto: file local (não enviado ainda) + URL persistida (tcUser.photoUrl)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(tcUser?.photoUrl || null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const handlePhotoProcessed = (file: File) => {
    setPhotoFile(file)
    setPhotoRemoved(false)
  }
  const handlePhotoRemoved = () => {
    setPhotoFile(null)
    setPhotoUrl(null)
    setPhotoRemoved(true)
  }

  // Sobe a foto local pra /api/tc-auth/me/photo e devolve a URL final.
  // Reaproveita o uploadAvatar do impgeo (multer + processamento de imagem).
  const uploadPhoto = async (file: File): Promise<string | null> => {
    setUploadingPhoto(true)
    try {
      const token = sessionStorage.getItem('tcAuthToken')
      const formData = new FormData()
      formData.append('photo', file)
      const res = await fetch('/api/tc-auth/me/photo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) return data.data?.photoUrl ?? null
      throw new Error(data?.error || 'Erro ao enviar foto')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Detecta mudança de email para exigir senha
  const emailChanged = (email || '').trim().toLowerCase() !== (tcUser?.email || '').trim().toLowerCase()

  // Resync quando tcUser mudar (foto, etc.)
  useEffect(() => {
    if (!tcUser) return
    setFirstName(tcUser.firstName || '')
    setLastName(tcUser.lastName || '')
    setEmail(tcUser.email || '')
    setPhone(tcUser.phone || '')
    setCpf(tcUser.cpf || '')
    setBirthDate(tcUser.birthDate || '')
    setGender(tcUser.gender || '')
    setAddress(initialAddress)
    // Só sincroniza a foto se o usuário ainda não selecionou uma nova nem removeu
    if (!photoFile && !photoRemoved) setPhotoUrl(tcUser.photoUrl || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcUser, initialAddress])

  // CEP → preenche endereço
  const handleCepChange = async (raw: string) => {
    const masked = applyCepMask(raw)
    setAddress(prev => ({ ...prev, cep: masked }))
    setCepError('')
    const digits = removeCepMask(masked)
    if (digits.length === 8) {
      setCepLoading(true)
      try {
        const data = await fetchAddressByCep(digits)
        if (!data) {
          setCepError('CEP não encontrado')
          return
        }
        setAddress(prev => ({
          ...prev,
          cep: masked,
          street: data.logradouro || prev.street || '',
          neighborhood: data.bairro || prev.neighborhood || '',
          city: data.localidade || prev.city || '',
          state: data.uf || prev.state || '',
        }))
      } catch {
        setCepError('Falha ao consultar CEP')
      } finally {
        setCepLoading(false)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      notify('Email inválido', { type: 'warning' })
      return
    }
    if (emailChanged && !currentPassword) {
      notify('Confirme com sua senha atual para alterar o email', { type: 'warning' })
      return
    }

    const payload: any = {
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      email: email.trim().toLowerCase() || null,
      phone: phone.trim() || null,
      cpf: cpf.trim() || null,
      birthDate: birthDate || null,
      gender: gender || null,
      address: {
        ...address,
        cep: address.cep || '',
        street: (address.street || '').trim(),
        number: (address.number || '').trim(),
        complement: (address.complement || '').trim(),
        neighborhood: (address.neighborhood || '').trim(),
        city: (address.city || '').trim(),
        state: (address.state || '').trim(),
      },
    }
    if (emailChanged) payload.currentPassword = currentPassword

    // F2.3: em modo obrigatório, valida os campos antes de chamar a API
    // pra não bater no backend só pra ouvir "ainda falta preencher"
    if (required) {
      const addrCity = (payload.address?.city || '').trim()
      if (!payload.phone)     { notify('Informe seu telefone', { type: 'warning' }); return }
      if (!payload.cpf)       { notify('Informe seu CPF', { type: 'warning' }); return }
      if (!payload.birthDate) { notify('Informe sua data de nascimento', { type: 'warning' }); return }
      if (!addrCity)          { notify('Preencha pelo menos cidade no endereço', { type: 'warning' }); return }
    }

    setSubmitting(true)
    try {
      // Se há foto nova selecionada, sobe primeiro pra obter a URL e inclui
      // no payload do PUT /me (que aceita photoUrl no campo allowed).
      if (photoFile) {
        try {
          const newUrl = await uploadPhoto(photoFile)
          if (newUrl) payload.photoUrl = newUrl
        } catch (err: any) {
          notify(err?.message || 'Erro ao enviar foto', { type: 'error' })
          setSubmitting(false)
          return
        }
      } else if (photoRemoved) {
        // Usuário removeu a foto existente sem subir outra → null no DB
        payload.photoUrl = null
      }

      const token = sessionStorage.getItem('tcAuthToken')
      const res = await fetch('/api/tc-auth/me', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Atualiza o contexto local
        const updated = data.data as TcUser
        updateTcUser(updated)
        notify('Perfil atualizado', { type: 'success' })
        setCurrentPassword('')
        setPhotoFile(null)
        setPhotoRemoved(false)
        // F2.3: em modo required, dispara refresh do /me pra atualizar a flag
        // requiresProfileCompletion. Se ainda faltar algo, o modal continua aberto.
        if (required) {
          await refreshTcUser()
        }
        onClose()
      } else if (res.status === 401) {
        notify('Senha incorreta', { type: 'error' })
      } else {
        notify(data.error || 'Erro ao salvar perfil', { type: 'error' })
      }
    } catch (err: any) {
      notify(err?.message || 'Erro de conexão', { type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!tcUser) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} destructive={required}>
      <form onSubmit={handleSubmit} className="bg-white dark:!bg-[#1a2332] rounded-2xl shadow-2xl w-[96vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-tc-green to-tc-blue px-6 py-4 text-white flex items-center justify-between">
          <h2 className="text-lg font-bold">{required ? 'Complete seu cadastro' : 'Editar perfil'}</h2>
          {!required && (
            <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {required && (
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                Como você acessou o TerraControl via convite por email, precisamos que você preencha algumas informações
                obrigatórias antes de continuar: <strong>telefone, CPF, data de nascimento e cidade do endereço</strong>.
                Os outros campos são opcionais.
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Foto de perfil */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Foto de perfil</h3>
            <PhotoUpload
              onPhotoProcessed={handlePhotoProcessed}
              onPhotoRemoved={handlePhotoRemoved}
              initialPhotoUrl={photoUrl || undefined}
              disabled={submitting || uploadingPhoto}
            />
          </section>

          {/* Dados pessoais */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Dados pessoais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Sobrenome</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Email {emailChanged && <span className="text-amber-600">(alterado)</span>}
                </label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">CPF</label>
                <input type="text" value={cpf} onChange={(e) => setCpf(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Data de nascimento</label>
                <input type="date" value={birthDate || ''} onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Gênero</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100">
                  <option value="">Prefiro não informar</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>
          </section>

          {/* Endereço */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereço
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  CEP {cepLoading && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
                </label>
                <input type="text" value={address.cep || ''} onChange={(e) => handleCepChange(e.target.value)}
                  placeholder="00000-000" maxLength={9}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
                {cepError && <p className="text-[11px] text-red-600 mt-1">{cepError}</p>}
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Rua</label>
                <input type="text" value={address.street || ''} onChange={(e) => setAddress(p => ({ ...p, street: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Número</label>
                <input type="text" value={address.number || ''} onChange={(e) => setAddress(p => ({ ...p, number: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Complemento</label>
                <input type="text" value={address.complement || ''} onChange={(e) => setAddress(p => ({ ...p, complement: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Bairro</label>
                <input type="text" value={address.neighborhood || ''} onChange={(e) => setAddress(p => ({ ...p, neighborhood: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Cidade</label>
                <input type="text" value={address.city || ''} onChange={(e) => setAddress(p => ({ ...p, city: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100" />
              </div>
              <div className="sm:col-span-2 sm:max-w-[140px]">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">UF</label>
                <input type="text" value={address.state || ''} maxLength={2}
                  onChange={(e) => setAddress(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100 uppercase" />
              </div>
            </div>
          </section>

          {/* Confirmação de senha quando email muda */}
          {emailChanged && (
            <section className="border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  Para alterar seu email, confirme com sua senha atual.
                </div>
              </div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Senha atual"
                className="w-full h-10 px-3 text-sm border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:!bg-[#243040] text-gray-900 dark:text-gray-100"
                autoComplete="current-password"
              />
            </section>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#243040] flex justify-end gap-2">
          {!required && (
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:!bg-[#1a2332] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
          )}
          <button type="submit" disabled={submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-tc-green to-tc-blue text-white hover:from-tc-green-dark hover:to-tc-blue-dark disabled:opacity-50 flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {required ? 'Salvar e continuar' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default TcEditarPerfilModal
