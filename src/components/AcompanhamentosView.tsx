import React, { useState, useEffect } from 'react'
import { Map as MapIcon, ExternalLink } from 'lucide-react'

interface Acompanhamento {
  id: string
  codImovel: number
  imovel: string
  municipio: string
  mapaUrl?: string
  matriculas: string
  nIncraCcir: string
  car: string
  statusCar: string
  itr: string
  geoCertificacao: 'SIM' | 'NÃO'
  geoRegistro: 'SIM' | 'NÃO'
  areaTotal: number
  reservaLegal: number
  cultura1: string
  areaCultura1: number
  cultura2: string
  areaCultura2: number
  outros: string
  areaOutros: number
  appCodigoFlorestal: number
  appVegetada: number
  appNaoVegetada: number
  remanescenteFlorestal: number
}

const API_BASE_URL = '/api'

const AcompanhamentosView: React.FC<{ token: string }> = ({ token }) => {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [selectedMapUrl, setSelectedMapUrl] = useState<string>('')
  const [selectedImovel, setSelectedImovel] = useState<string>('')
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)

  useEffect(() => {
    const loadAcompanhamentos = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/acompanhamentos/public/${token}`)
        const result = await response.json()
        if (result.success) {
          setAcompanhamentos(result.data)
        } else {
          setError(result.error || 'Erro ao carregar dados')
        }
      } catch (error) {
        console.error('Erro ao carregar acompanhamentos:', error)
        setError('Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    loadAcompanhamentos()
  }, [token])

  const formatNumber = (num: number) => {
    return num.toFixed(2).replace('.', ',')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Erro</h1>
          <p className="text-gray-700">{error}</p>
          <p className="text-sm text-gray-500 mt-4">O link pode estar inválido ou expirado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Acompanhamentos de Imóveis</h1>
              <p className="text-blue-200 mt-1">Visualização somente leitura</p>
            </div>
            <div className="flex items-center gap-2">
              <img src="/imp_logo.png" alt="IMPGEO Logo" className="h-10 w-10 object-contain" />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-600">Total de Imóveis</p>
            <p className="text-2xl font-bold text-gray-900">{acompanhamentos.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-600">Área Total</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(acompanhamentos.reduce((sum, a) => sum + a.areaTotal, 0))} ha
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-600">Com Geo Certificação</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoCertificacao === 'SIM').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-600">Com Geo Registro</p>
            <p className="text-2xl font-bold text-green-600">
              {acompanhamentos.filter(a => a.geoRegistro === 'SIM').length}
            </p>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2000px]">
              <thead>
                <tr className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">COD. IMP</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">IMÓVEL</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">MUNICÍPIO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">MATRÍCULAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">N INCRA / CCIR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CAR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">STATUS CAR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ITR</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">GEO CERTIFICAÇÃO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">GEO REGISTRO</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA TOTAL (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">20% RESERVA LEGAL (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CULTURAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">CULTURAS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">OUTROS</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">ÁREA (ha)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (CÓDIGO FLORESTAL)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (VEGETADA)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">APP (NÃO VEGETADA)</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider">REMANESCENTE FLORESTAL (ha)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {acompanhamentos.map((acomp, index) => (
                  <tr
                    key={acomp.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50 hover:bg-blue-100'}
                  >
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{acomp.codImovel}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">
                      {acomp.mapaUrl ? (
                        <button
                          onClick={() => {
                            setSelectedMapUrl(acomp.mapaUrl || '')
                            setSelectedImovel(acomp.imovel)
                            setIsMapModalOpen(true)
                          }}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
                          title="Ver mapa do imóvel"
                        >
                          {acomp.imovel}
                          <MapIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <span>{acomp.imovel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{acomp.municipio}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.matriculas}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.nIncraCcir}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-xs truncate" title={acomp.car}>{acomp.car}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.statusCar}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.itr || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        acomp.geoCertificacao === 'SIM' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {acomp.geoCertificacao}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        acomp.geoRegistro === 'SIM' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {acomp.geoRegistro}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 font-semibold">{formatNumber(acomp.areaTotal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.reservaLegal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.cultura1}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaCultura1)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.cultura2}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaCultura2)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{acomp.outros}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.areaOutros)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appCodigoFlorestal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appVegetada)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.appNaoVegetada)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{formatNumber(acomp.remanescenteFlorestal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal do Mapa */}
      {isMapModalOpen && selectedMapUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Mapa do Imóvel</h2>
                <p className="text-gray-600 mt-1">{selectedImovel}</p>
              </div>
              <button
                onClick={() => {
                  setIsMapModalOpen(false)
                  setSelectedMapUrl('')
                  setSelectedImovel('')
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center mb-4">
                <MapIcon className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                <p className="text-gray-700 mb-4">
                  Clique no botão abaixo para abrir o mapa do imóvel no Google Maps
                </p>
                <a
                  href={selectedMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  <ExternalLink className="w-5 h-5" />
                  Abrir Mapa no Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AcompanhamentosView

