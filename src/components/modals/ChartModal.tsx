import { useEffect, useId, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { X } from 'lucide-react';

interface ChartData {
  name: string;
  value: number;
  // Bug fix (doc): use cores com luminância baixa (escuras) — o label SVG usa fill="white"
  // fixo; cores claras causam contraste insuficiente (WCAG AA exige 4.5:1 a 12px).
  color: string;
  [key: string]: string | number;
}

interface ChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: ChartData[];
  totalValue: number;
  subtitle?: string;
  valueFormat?: 'currency' | 'number' | 'area';
  valueUnit?: string;
}

function formatValue(
  value: number,
  format: 'currency' | 'number' | 'area',
  unit: string,
): string {
  if (!isFinite(value) || isNaN(value)) return '—';
  if (format === 'currency') {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  if (format === 'area') {
    return `${value.toFixed(2).replace('.', ',')} ${unit || 'ha'}`;
  }
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

interface TooltipContentProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  totalValue: number;
  effectiveFormat: 'currency' | 'number' | 'area';
  valueUnit: string;
}

const CustomTooltip = ({
  active,
  payload,
  totalValue,
  effectiveFormat,
  valueUnit,
}: TooltipContentProps) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const pct = totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : '—';
  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <p className="font-semibold text-gray-800 dark:text-gray-100">{entry.name}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {formatValue(entry.value, effectiveFormat, valueUnit)}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{pct}% do total</p>
    </div>
  );
};

const CustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: string | number;
  cy?: string | number;
  midAngle?: number;
  innerRadius?: string | number;
  outerRadius?: string | number;
  percent?: number;
}) => {
  const pct = percent ?? 0;
  if (pct < 0.05) return null;

  const RADIAN = Math.PI / 180;
  const cxN = typeof cx === 'number' ? cx : 0;
  const cyN = typeof cy === 'number' ? cy : 0;
  const irN = typeof innerRadius === 'number' ? innerRadius : 0;
  const orN = typeof outerRadius === 'number' ? outerRadius : 0;
  const angleN = midAngle ?? 0;

  const radius = irN + (orN - irN) * 0.5;
  const x = cxN + radius * Math.cos(-angleN * RADIAN);
  const y = cyN + radius * Math.sin(-angleN * RADIAN);
  const anchor = x > cxN ? 'start' : x < cxN ? 'end' : 'middle';

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={12}
      fontWeight="bold"
    >
      {`${(pct * 100).toFixed(0)}%`}
    </text>
  );
};

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ChartModal = ({
  isOpen,
  onClose,
  title,
  data,
  totalValue,
  subtitle,
  valueFormat,
  valueUnit = '',
}: ChartModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);
  // Bug fix: wasOpenRef garante que triggerRef só é sobrescrito na transição false→true,
  // não em cada re-run do effect causado por onClose instável (pai sem useCallback).
  const wasOpenRef = useRef(false);

  // Bug fix: useId() gera ID estável por mount, sem efeitos colaterais em re-renders.
  // Substitui ++modalCounter que incrementava a variável de módulo em todo render.
  const reactId = useId();
  const titleId = `chart-modal-title-${reactId}`;
  const subtitleId = `chart-modal-subtitle-${reactId}`;

  const effectiveFormat: 'currency' | 'number' | 'area' =
    valueFormat ?? (valueUnit ? 'area' : 'currency');

  // Escape + focus trap
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    // Bug fix: só captura o trigger e move o foco na transição real false→true.
    // Re-runs por onClose instável não sobrescrevem triggerRef.current.
    if (!wasOpenRef.current) {
      triggerRef.current = document.activeElement;
      wasOpenRef.current = true;
      closeBtnRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      );
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      (triggerRef.current as HTMLElement | null)?.focus();
    };
  }, [isOpen, onClose]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Bug fix: tooltipEl movido para depois do early return — não cria o objeto
  // desnecessariamente quando o modal está fechado.
  const tooltipEl = (
    <CustomTooltip
      totalValue={totalValue}
      effectiveFormat={effectiveFormat}
      valueUnit={valueUnit}
    />
  );

  const isEmpty = data.length === 0;

  return (
    // Bug fix: role="presentation" removido — div sem role nativo já é opaco para
    // leitores de tela; aria-modal="true" no filho resolve o contexto de diálogo.
    <div
      className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Bug fix: aria-describedby conecta o subtitle ao dialog para anúncio automático
        aria-describedby={subtitle ? subtitleId : undefined}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 id={titleId} className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="text-gray-600 dark:text-gray-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-6 h-6 text-gray-600 dark:text-gray-400" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">Sem dados para exibir</p>
              <p className="text-sm mt-1">Nenhum item foi encontrado para este gráfico.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Chart */}
              <div className="flex flex-col items-center">
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {/* Bug fix: aria-label exposto no SVG para leitores de tela (WCAG 1.1.1) */}
                    <PieChart aria-label={`Gráfico de pizza: ${title}`}>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={CustomLabel}
                        outerRadius={120}
                        innerRadius={60}
                        dataKey="value"
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={tooltipEl} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Total */}
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    {formatValue(totalValue, effectiveFormat, valueUnit)}
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                  Detalhamento
                </h3>
                <div className="space-y-3">
                  {data.map((item, index) => {
                    const pct =
                      totalValue > 0
                        ? ((item.value / totalValue) * 100).toFixed(1)
                        : '—';
                    return (
                      // Bug fix: key combina name+index para suportar nomes duplicados
                      <div
                        key={`${item.name}-${index}`}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-gray-800 dark:text-gray-100">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-800 dark:text-gray-100">
                            {formatValue(item.value, effectiveFormat, valueUnit)}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{pct}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartModal;
