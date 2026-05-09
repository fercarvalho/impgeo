import { LineChart, Calendar, Lock } from 'lucide-react';

/**
 * Shell de Projeção de Gerenciamento (fase 1.7).
 *
 * Aqui o usuário vai definir as metas operacionais que alimentam o módulo
 * Metas de Gerenciamento. O backend ainda não tem persistência para isso,
 * por enquanto mostramos o esqueleto da UI com inputs em modo somente-leitura
 * (visual sketch) e nota explicativa.
 */
export default function ProjecaoGerenciamento() {
  const metricasParaConfigurar = [
    { id: 'novos_projetos_mes',  label: 'Novos projetos por mês',         unidade: 'projetos',  exemplo: 12 },
    { id: 'novos_clientes_mes',  label: 'Novos clientes por mês',         unidade: 'clientes',  exemplo: 8 },
    { id: 'projetos_no_prazo',   label: 'Projetos concluídos no prazo',   unidade: '%',         exemplo: 90 },
    { id: 'receita_por_servico', label: 'Receita média por serviço',      unidade: 'R$',        exemplo: 5000 },
  ];

  const meses = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Projeção de Gerenciamento
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Defina as metas operacionais — projetos, clientes, prazos. Os valores configurados aqui
          alimentam o painel de Metas de Gerenciamento.
        </p>
      </header>

      {/* Indicador de fase */}
      <div className="mb-6 p-4 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-900/20 text-sm text-violet-800 dark:text-violet-200 flex items-start gap-3">
        <Lock className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium mb-1">Edição de metas em desenvolvimento</p>
          <p className="text-violet-700/90 dark:text-violet-200/90 leading-relaxed">
            A UI abaixo é um preview funcional do layout. A persistência das metas (salvar,
            editar, comparar com o real) será habilitada na próxima entrega — quando o backend
            de projeção operacional estiver pronto.
          </p>
        </div>
      </div>

      {/* Tabela de planejamento mensal — sketch */}
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <LineChart className="h-5 w-5 text-violet-600" />
            Metas mensais — {new Date().getFullYear()}
          </h2>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            preview
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/30">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-900/30">
                  Métrica
                </th>
                {meses.map(m => (
                  <th key={m} className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[60px]">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {metricasParaConfigurar.map(metrica => (
                <tr key={metrica.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 sticky left-0 bg-white dark:bg-gray-800">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {metrica.label}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                      em {metrica.unidade}
                    </div>
                  </td>
                  {meses.map(m => (
                    <td key={m} className="text-center px-2 py-3">
                      <input
                        type="text"
                        disabled
                        defaultValue={metrica.exemplo}
                        title="Edição habilitada em breve"
                        className="w-14 text-center text-sm bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 cursor-not-allowed"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
        Os valores acima são exemplos. Ao salvar (em breve), eles aparecerão no módulo Metas de Gerenciamento como progresso real ↔ meta.
      </p>
    </div>
  );
}
