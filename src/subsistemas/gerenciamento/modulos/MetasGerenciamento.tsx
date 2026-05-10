import { Target, ArrowRight, Info } from 'lucide-react';

/**
 * Shell de Metas de Gerenciamento (fase 1.7).
 *
 * Quando o backend de metas operacionais estiver implementado, este shell
 * preencherá os cards reais usando os dados de `projecao_gerenciamento`
 * (que é onde as metas serão definidas, conforme briefing do usuário).
 *
 * Por enquanto, mostra o esqueleto da UI com estado vazio claro e indicação
 * do fluxo (criar metas em Projeção → visualizar aqui).
 */
export default function MetasGerenciamento() {
  // Métricas operacionais previstas — placeholder. Quando houver API,
  // estes itens serão preenchidos com valor real + meta + cálculo.
  const metricasPlanejadas = [
    { label: 'Novos projetos por mês',     descricao: 'Quantas novas oportunidades a equipe abre mensalmente' },
    { label: 'Novos clientes por mês',     descricao: 'Crescimento da base de clientes' },
    { label: 'Projetos concluídos no prazo', descricao: 'Disciplina operacional na entrega' },
    { label: 'Receita por serviço',        descricao: 'Valor médio gerado por categoria de serviço' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Metas de Gerenciamento
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Acompanhamento das metas operacionais definidas em Projeção de Gerenciamento.
        </p>
      </header>

      {/* Aviso pedagógico — vai sumir quando houver dados reais */}
      <div className="mb-8 p-4 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-900/20 text-sm text-violet-800 dark:text-violet-200 flex items-start gap-3">
        <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium mb-1">Como funcionam as metas operacionais</p>
          <p className="text-violet-700/90 dark:text-violet-200/90 leading-relaxed">
            As metas são definidas no módulo <span className="font-semibold">Projeção de Gerenciamento</span>{' '}
            e exibidas aqui em forma de progresso. Cada métrica tem uma meta mensal/anual e a comparação
            com o real acontece à medida que projetos, serviços e clientes são cadastrados.
          </p>
        </div>
      </div>

      {/* Estado vazio com cards mock representando a estrutura */}
      <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
          <Target className="h-5 w-5 text-violet-600" />
          Métricas previstas
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          Esta lista vira a galeria de progressos quando houver metas configuradas.
        </p>

        <ul className="space-y-3">
          {metricasPlanejadas.map(m => (
            <li
              key={m.label}
              className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {m.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {m.descricao}
                </div>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                aguardando meta
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Para definir as metas e ativar este painel, abra <span className="font-medium text-gray-800 dark:text-gray-200">Projeção de Gerenciamento</span>.
          </p>
          <span className="text-xs font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1">
            Disponível em breve
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </section>
    </div>
  );
}
