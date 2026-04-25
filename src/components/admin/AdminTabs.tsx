import { useState, type ComponentType } from 'react';
import { Users, Settings, Activity, BarChart3, Shield, MessageSquare, HelpCircle, FileText, BookOpen, Layout } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import LegacyUserManagement from '../AdminPanel';
import ModuleManagement from './ModuleManagement';
import ActivityLog from './ActivityLog';
import Statistics from './Statistics';
import FeedbackManagement from './FeedbackManagement';
import FAQManagement from './FAQManagement';
import LegalManagement from './LegalManagement';
import DocumentationManagement from './DocumentationManagement';
import FooterManagement from './FooterManagement';

type AdminTab = 'users' | 'modules' | 'activity' | 'statistics' | 'feedbacks' | 'faq' | 'legal' | 'documentacao' | 'rodape';

const AdminTabs: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const permissoesLegais = (user as any)?.permissoesLegais || {};
  const hasLegalAccess = user?.role === 'superadmin' || Object.values(permissoesLegais).some(v => v === true);

  const tabs: Array<{ id: AdminTab; name: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'users',      name: 'Usuários',    icon: Users },
    { id: 'modules',    name: 'Módulos',     icon: Settings },
    { id: 'activity',   name: 'Atividades',  icon: Activity },
    { id: 'statistics', name: 'Estatísticas',icon: BarChart3 },
    { id: 'feedbacks',  name: 'Feedbacks',   icon: MessageSquare },
    { id: 'faq',           name: 'FAQ',           icon: HelpCircle },
    { id: 'documentacao',  name: 'Documentação',  icon: BookOpen },
    ...(hasLegalAccess ? [{ id: 'legal' as AdminTab, name: 'Legal', icon: FileText }] : []),
    ...(user?.role === 'superadmin' ? [{ id: 'rodape' as AdminTab, name: 'Rodapé', icon: Layout }] : []),
  ];

  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-lg">Acesso negado. Apenas administradores podem acessar este painel.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-blue-900">Painel Administrativo</h1>
        </div>
        <p className="text-gray-600">Gerencie usuários, módulos e visualize estatísticas do sistema</p>
      </div>

      <div className="flex space-x-2 border-b border-gray-200 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-6 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-600 hover:text-blue-600'
              }`}
            >
              <Icon className="h-5 w-5 mr-2" />
              {tab.name}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
      {activeTab === 'users'      && <LegacyUserManagement embedded />}
      {activeTab === 'modules'    && <ModuleManagement />}
      {activeTab === 'activity'   && <ActivityLog />}
      {activeTab === 'statistics' && <Statistics />}
      {activeTab === 'feedbacks'  && <FeedbackManagement />}
      {activeTab === 'faq'          && <FAQManagement />}
      {activeTab === 'documentacao' && <DocumentationManagement />}
      {activeTab === 'legal'        && <LegalManagement />}
      {activeTab === 'rodape'       && <FooterManagement />}
      </div>
    </div>
  );
};

export default AdminTabs;
