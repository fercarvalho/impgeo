import React from 'react'
import { BarChart3 } from 'lucide-react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

export type TransactionType = 'Receita' | 'Despesa'

export interface Transaction {
  id: string
  date: string
  description: string
  value: number
  type: TransactionType
  category: string
}

interface ReportsProps {
  transactions: Transaction[]
}

const Reports: React.FC<ReportsProps> = ({ transactions }) => {
  const agora = new Date()
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - agora.getDay())
  inicioSemana.setHours(0, 0, 0, 0)

  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioTrimestre = new Date(agora.getFullYear(), Math.floor(agora.getMonth() / 3) * 3, 1)
  const inicioAno = new Date(agora.getFullYear(), 0, 1)

  const transacoesSemana = transactions.filter(t => new Date(t.date) >= inicioSemana)
  const transacoesMes = transactions.filter(t => new Date(t.date) >= inicioMes)
  const transacoesTrimestre = transactions.filter(t => new Date(t.date) >= inicioTrimestre)
  const transacoesAno = transactions.filter(t => new Date(t.date) >= inicioAno)

  const calcularVendasPorCategoria = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Receita') { mapa[t.category] = (mapa[t.category] || 0) + t.value } })
    const cores = ['#2563eb', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']
    return Object.entries(mapa).map(([name, value], i) => ({ name, value, color: cores[i % cores.length] }))
  }

  const calcularDespesasPorCategoria = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Despesa') { mapa[t.category] = (mapa[t.category] || 0) + t.value } })
    const cores = ['#ef4444', '#dc2626', '#f87171', '#fb7185', '#fca5a5']
    return Object.entries(mapa).map(([name, value], i) => ({ name, value, color: cores[i % cores.length] }))
  }

  const calcularVendasPorProduto = (ts: Transaction[]) => {
    const mapa: Record<string, number> = {}
    ts.forEach(t => { if (t.type === 'Receita') { const n = t.description || 'Produto'; mapa[n] = (mapa[n] || 0) + t.value } })
    const cores = ['#6366f1', '#7c3aed', '#22c55e', '#3b82f6', '#06b6d4']
    return Object.entries(mapa)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([name, value], i) => ({ name, value: value as number, color: cores[i % cores.length] }))
  }

  const renderDonutChart = (title: string, data: { name: string; value: number; color: string }[]) => (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
      <div className="flex items-center mb-4">
        <span className="text-gray-400 text-lg mr-3">📊</span>
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            <Legend />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  const renderBarChart = (title: string, data: { name: string; value: number; color: string }[]) => (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200">
      <div className="flex items-center mb-4">
        <span className="text-gray-400 text-lg mr-3">📦</span>
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} />
            <YAxis tickFormatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#666' }} />
            <Tooltip formatter={(v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            <Bar dataKey="value" radius={[8,8,0,0]}>
              {data.map((entry, index) => (
                <Cell key={`bar-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  const blocoPeriodo = (titulo: string, ts: Transaction[]) => {
    const vendasPorCategoria = calcularVendasPorCategoria(ts)
    const despesasPorCategoria = calcularDespesasPorCategoria(ts)
    const vendasPorProduto = calcularVendasPorProduto(ts)

    const totalReceitas = vendasPorCategoria.reduce((s, i) => s + i.value, 0)
    const totalDespesas = despesasPorCategoria.reduce((s, i) => s + i.value, 0)
    const saldo = totalReceitas - totalDespesas

    return (
      <div className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold text-gray-800">{titulo}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderDonutChart('Vendas por Categoria', vendasPorCategoria)}
          {renderDonutChart('Despesas por Categoria', despesasPorCategoria)}
        </div>
        <div className="grid grid-cols-1 gap-6">
          {renderBarChart('Top Produtos (Receita)', vendasPorProduto)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
            <p className="text-sm font-semibold text-blue-700">Receitas</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100 border border-red-200">
            <p className="text-sm font-semibold text-red-700">Despesas</p>
            <p className="text-2xl font-bold text-red-900 mt-1">R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200">
            <p className="text-sm font-semibold text-indigo-700">Saldo</p>
            <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? 'text-green-800' : 'text-red-800'}`}>R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>
    )
  }

  const nomesTrimestres = ['1º Trimestre', '2º Trimestre', '3º Trimestre', '4º Trimestre']
  const trimestreAtual = Math.floor(agora.getMonth() / 3)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          Relatórios
        </h1>
      </div>

      {blocoPeriodo('Semana Atual', transacoesSemana)}
      {blocoPeriodo('Mês Atual', transacoesMes)}
      {blocoPeriodo(`Trimestre Atual - ${nomesTrimestres[trimestreAtual]}`, transacoesTrimestre)}
      {blocoPeriodo(`Ano ${agora.getFullYear()}`, transacoesAno)}
    </div>
  )
}

export default Reports


