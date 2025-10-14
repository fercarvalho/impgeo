import React, { useState, useEffect } from 'react'
import { Calculator, TrendingUp, DollarSign } from 'lucide-react'

interface ProjectionData {
  despesasVariaveis: number[]
  despesasFixas: number[]
  investimentos: number[]
  mkt: number[]
  faturamentoReurb: number[]
  faturamentoGeo: number[]
  faturamentoPlan: number[]
  faturamentoReg: number[]
  faturamentoNn: number[]
}

const Projection: React.FC = () => {
  const [data, setData] = useState<ProjectionData>({
    despesasVariaveis: new Array(12).fill(0),
    despesasFixas: new Array(12).fill(0),
    investimentos: new Array(12).fill(0),
    mkt: new Array(12).fill(0),
    faturamentoReurb: new Array(12).fill(0),
    faturamentoGeo: new Array(12).fill(0),
    faturamentoPlan: new Array(12).fill(0),
    faturamentoReg: new Array(12).fill(0),
    faturamentoNn: new Array(12).fill(0)
  })

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  // Carregar dados do localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('impgeo-projection')
    if (savedData) {
      setData(JSON.parse(savedData))
    }
  }, [])

  // Salvar dados no localStorage
  useEffect(() => {
    localStorage.setItem('impgeo-projection', JSON.stringify(data))
  }, [data])

  const updateData = (category: keyof ProjectionData, monthIndex: number, value: number) => {
    setData(prev => ({
      ...prev,
      [category]: prev[category].map((val, index) => 
        index === monthIndex ? value : val
      )
    }))
  }

  // Fórmulas calculadas
  const calcularDespesasTotais = (monthIndex: number) => {
    return data.despesasVariaveis[monthIndex] + data.despesasFixas[monthIndex]
  }

  const calcularFaturamentoTotal = (monthIndex: number) => {
    return data.faturamentoReurb[monthIndex] + 
           data.faturamentoGeo[monthIndex] + 
           data.faturamentoPlan[monthIndex] + 
           data.faturamentoReg[monthIndex] + 
           data.faturamentoNn[monthIndex]
  }

  const calcularResultado = (monthIndex: number) => {
    const faturamentoTotal = calcularFaturamentoTotal(monthIndex)
    const despesasTotais = calcularDespesasTotais(monthIndex)
    return faturamentoTotal - (data.mkt[monthIndex] + data.investimentos[monthIndex] + despesasTotais)
  }

  // Cálculos por trimestre
  const calcularTrimestre = (startMonth: number, endMonth: number, calculator: (monthIndex: number) => number) => {
    let total = 0
    for (let i = startMonth; i <= endMonth; i++) {
      total += calculator(i)
    }
    return total
  }

  const calcularTotalGeral = (calculator: (monthIndex: number) => number) => {
    return calcularTrimestre(0, 11, calculator)
  }

  const calcularMedia = (calculator: (monthIndex: number) => number) => {
    return calcularTotalGeral(calculator) / 12
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const InputCell: React.FC<{
    value: number
    onChange: (value: number) => void
    className?: string
  }> = ({ value, onChange, className = '' }) => (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
      placeholder="0,00"
    />
  )

  const CalculatedCell: React.FC<{
    value: number
    className?: string
  }> = ({ value, className = '' }) => (
    <div className={`px-2 py-1 text-sm font-semibold text-center ${className}`}>
      {formatCurrency(value)}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calculator className="w-8 h-8 text-blue-600" />
          Projeção Anual
        </h1>
        <div className="text-sm text-gray-600">
          <p>Preencha apenas os valores mensais - os cálculos são automáticos</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            {/* Cabeçalho */}
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">DESCRIÇÃO</th>
                <th className="px-2 py-3 text-center font-bold">1 TRI</th>
                {meses.slice(0, 3).map(mes => (
                  <th key={mes} className="px-2 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-2 py-3 text-center font-bold">2 TRI</th>
                {meses.slice(3, 6).map(mes => (
                  <th key={mes} className="px-2 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-2 py-3 text-center font-bold">3 TRI</th>
                {meses.slice(6, 9).map(mes => (
                  <th key={mes} className="px-2 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-2 py-3 text-center font-bold">4 TRI</th>
                {meses.slice(9, 12).map(mes => (
                  <th key={mes} className="px-2 py-3 text-center font-bold">{mes}</th>
                ))}
                <th className="px-2 py-3 text-center font-bold">Total Geral</th>
                <th className="px-2 py-3 text-center font-bold">Média</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {/* Despesas Totais */}
              <tr className="bg-gray-100">
                <td className="px-4 py-3 font-semibold text-gray-800">Despesas Totais</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularDespesasTotais)} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularDespesasTotais)} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 3)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularDespesasTotais)} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 6)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularDespesasTotais)} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <CalculatedCell value={calcularDespesasTotais(index + 9)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularDespesasTotais)} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia(calcularDespesasTotais)} />
                </td>
              </tr>

              {/* Despesas Variáveis */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Despesas Variáveis</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index]} 
                      onChange={(value) => updateData('despesasVariaveis', index, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 3]} 
                      onChange={(value) => updateData('despesasVariaveis', index + 3, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 6]} 
                      onChange={(value) => updateData('despesasVariaveis', index + 6, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.despesasVariaveis[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasVariaveis[index + 9]} 
                      onChange={(value) => updateData('despesasVariaveis', index + 9, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.despesasVariaveis[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.despesasVariaveis[i])} />
                </td>
              </tr>

              {/* Despesas Fixas */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Despesas Fixas</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasFixas[index]} 
                      onChange={(value) => updateData('despesasFixas', index, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 3]} 
                      onChange={(value) => updateData('despesasFixas', index + 3, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 6]} 
                      onChange={(value) => updateData('despesasFixas', index + 6, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.despesasFixas[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.despesasFixas[index + 9]} 
                      onChange={(value) => updateData('despesasFixas', index + 9, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.despesasFixas[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.despesasFixas[i])} />
                </td>
              </tr>

              {/* Investimentos */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Investimentos</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.investimentos[index]} 
                      onChange={(value) => updateData('investimentos', index, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.investimentos[index + 3]} 
                      onChange={(value) => updateData('investimentos', index + 3, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.investimentos[index + 6]} 
                      onChange={(value) => updateData('investimentos', index + 6, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.investimentos[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.investimentos[index + 9]} 
                      onChange={(value) => updateData('investimentos', index + 9, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.investimentos[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.investimentos[i])} />
                </td>
              </tr>

              {/* Mkt */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Mkt</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.mkt[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.mkt[index]} 
                      onChange={(value) => updateData('mkt', index, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.mkt[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.mkt[index + 3]} 
                      onChange={(value) => updateData('mkt', index + 3, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.mkt[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.mkt[index + 6]} 
                      onChange={(value) => updateData('mkt', index + 6, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.mkt[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.mkt[index + 9]} 
                      onChange={(value) => updateData('mkt', index + 9, value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.mkt[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.mkt[i])} />
                </td>
              </tr>

              {/* Faturamento Total */}
              <tr className="bg-blue-50">
                <td className="px-4 py-3 font-semibold text-blue-800">Faturamento Total</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 3)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 6)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularFaturamentoTotal)} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <CalculatedCell value={calcularFaturamentoTotal(index + 9)} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularFaturamentoTotal)} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia(calcularFaturamentoTotal)} />
                </td>
              </tr>

              {/* Faturamento REURB */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento REURB</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index]} 
                      onChange={(value) => updateData('faturamentoReurb', index, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 3]} 
                      onChange={(value) => updateData('faturamentoReurb', index + 3, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 6]} 
                      onChange={(value) => updateData('faturamentoReurb', index + 6, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoReurb[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReurb[index + 9]} 
                      onChange={(value) => updateData('faturamentoReurb', index + 9, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoReurb[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoReurb[i])} />
                </td>
              </tr>

              {/* Faturamento GEO */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento GEO</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index]} 
                      onChange={(value) => updateData('faturamentoGeo', index, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 3]} 
                      onChange={(value) => updateData('faturamentoGeo', index + 3, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 6]} 
                      onChange={(value) => updateData('faturamentoGeo', index + 6, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoGeo[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoGeo[index + 9]} 
                      onChange={(value) => updateData('faturamentoGeo', index + 9, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoGeo[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoGeo[i])} />
                </td>
              </tr>

              {/* Faturamento PLAN */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento PLAN</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index]} 
                      onChange={(value) => updateData('faturamentoPlan', index, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 3]} 
                      onChange={(value) => updateData('faturamentoPlan', index + 3, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 6]} 
                      onChange={(value) => updateData('faturamentoPlan', index + 6, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoPlan[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoPlan[index + 9]} 
                      onChange={(value) => updateData('faturamentoPlan', index + 9, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoPlan[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoPlan[i])} />
                </td>
              </tr>

              {/* Faturamento REG */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento REG</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index]} 
                      onChange={(value) => updateData('faturamentoReg', index, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 3]} 
                      onChange={(value) => updateData('faturamentoReg', index + 3, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 6]} 
                      onChange={(value) => updateData('faturamentoReg', index + 6, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoReg[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoReg[index + 9]} 
                      onChange={(value) => updateData('faturamentoReg', index + 9, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoReg[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoReg[i])} />
                </td>
              </tr>

              {/* Faturamento NN */}
              <tr>
                <td className="px-4 py-3 text-gray-700">Faturamento NN</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index]} 
                      onChange={(value) => updateData('faturamentoNn', index, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 3]} 
                      onChange={(value) => updateData('faturamentoNn', index + 3, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 6]} 
                      onChange={(value) => updateData('faturamentoNn', index + 6, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, (i) => data.faturamentoNn[i])} />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <InputCell 
                      value={data.faturamentoNn[index + 9]} 
                      onChange={(value) => updateData('faturamentoNn', index + 9, value)}
                      className="bg-blue-100"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral((i) => data.faturamentoNn[i])} />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia((i) => data.faturamentoNn[i])} />
                </td>
              </tr>

              {/* Resultado */}
              <tr className="bg-gray-800 text-white">
                <td className="px-4 py-3 font-bold">Resultado</td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(0, 2, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(0, 3).map((_, index) => (
                  <td key={index} className="px-2 py-2">
                    <CalculatedCell value={calcularResultado(index)} className="text-white" />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(3, 5, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(3, 6).map((_, index) => (
                  <td key={index + 3} className="px-2 py-2">
                    <CalculatedCell value={calcularResultado(index + 3)} className="text-white" />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(6, 8, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(6, 9).map((_, index) => (
                  <td key={index + 6} className="px-2 py-2">
                    <CalculatedCell value={calcularResultado(index + 6)} className="text-white" />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTrimestre(9, 11, calcularResultado)} className="text-white" />
                </td>
                {meses.slice(9, 12).map((_, index) => (
                  <td key={index + 9} className="px-2 py-2">
                    <CalculatedCell value={calcularResultado(index + 9)} className="text-white" />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularTotalGeral(calcularResultado)} className="text-white" />
                </td>
                <td className="px-2 py-2">
                  <CalculatedCell value={calcularMedia(calcularResultado)} className="text-white" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Legenda:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><span className="font-semibold">Campos editáveis:</span> Apenas os valores mensais</p>
            <p><span className="font-semibold">Campos calculados:</span> Trimestres, Total Geral e Média</p>
          </div>
          <div>
            <p><span className="font-semibold">Fórmulas:</span></p>
            <p>• Despesas Totais = Despesas Variáveis + Despesas Fixas</p>
            <p>• Faturamento Total = REURB + GEO + PLAN + REG + NN</p>
            <p>• Resultado = Faturamento Total - (Mkt + Investimentos + Despesas Totais)</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Projection
