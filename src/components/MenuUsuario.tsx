import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Edit, Key, ChevronDown, Bell, UserCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UserProfileModal from './UserProfileModal';
import AlterarUsernameModal from './AlterarUsernameModal';
import AlterarSenhaModal from './AlterarSenhaModal';
import EditarPerfilModal from './EditarPerfilModal';
import NotificacoesModal from './NotificacoesModal';
import CapturarUsuarioModal from './CapturarUsuarioModal';
import LazyAvatar from './LazyAvatar';

interface MenuUsuarioProps {
  onLogout?: () => void;
}

const MenuUsuario: React.FC<MenuUsuarioProps> = ({ onLogout: _onLogout }) => {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showMenu) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMenu(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
        if (!items || items.length === 0) return;
        const focused = document.activeElement;
        const idx = Array.from(items).indexOf(focused as HTMLButtonElement);
        if (event.key === 'ArrowDown') {
          const next = idx < items.length - 1 ? idx + 1 : 0;
          items[next].focus();
        } else {
          const prev = idx > 0 ? idx - 1 : items.length - 1;
          items[prev].focus();
        }
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

  if (!user) return null;

  const handleMenuClick = () => {
    if (!showMenu && buttonRef.current) {
      // Calcular posição ANTES de mostrar o menu
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
    setShowMenu(!showMenu);
  };

  const handleProfileClick = () => {
    setShowProfileModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const handleUsernameClick = () => {
    setShowUsernameModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const handlePasswordClick = () => {
    setShowPasswordModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const handleEditProfileClick = () => {
    setShowEditProfileModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const handleNotificationsClick = () => {
    setShowNotificationsModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const handleCaptureClick = () => {
    setShowCaptureModal(true);
    setShowMenu(false);
    buttonRef.current?.focus();
  };

  const getUserDisplayName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username || 'Usuário';
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'Super Administrador';
      case 'admin':
        return 'Administrador';
      case 'user':
        return 'Usuário';
      case 'guest':
        return 'Visitante';
      default:
        return role;
    }
  };

  const dropdownContent = showMenu ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu do usuário"
      className="fixed w-56 bg-white/95 dark:!bg-[#243040]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-blue-200/50 dark:border-blue-800/40 overflow-hidden z-[9999]"
      style={{
        top: `${dropdownPosition.top}px`,
        right: `${dropdownPosition.right}px`,
        animation: 'slideDown 0.2s ease-out',
        transformOrigin: 'top right'
      }}
    >
      <div className="py-2">
        <button
          type="button"
          role="menuitem"
          onClick={handleProfileClick}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-700 dark:text-gray-300"
        >
          <User className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm font-medium">Ver Perfil</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={handleUsernameClick}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-700 dark:text-gray-300"
        >
          <Edit className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm font-medium">Alterar Username</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={handlePasswordClick}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-700 dark:text-gray-300 min-h-[44px]"
        >
          <Key className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm font-medium">Alterar Senha</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={handleEditProfileClick}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-700 dark:text-gray-300 min-h-[44px]"
        >
          <Edit className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm font-medium">Editar Perfil</span>
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={handleNotificationsClick}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-gray-700 dark:text-gray-300 min-h-[44px]"
        >
          <Bell className="w-4 h-4 text-blue-600" aria-hidden="true" />
          <span className="text-sm font-medium">Notificações</span>
        </button>

        {user.role === 'superadmin' && (
          <button
            type="button"
            role="menuitem"
            onClick={handleCaptureClick}
            className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-gray-700 dark:text-gray-300 min-h-[44px] border-t border-gray-100 dark:border-gray-700"
          >
            <UserCircle2 className="w-4 h-4 text-amber-600" aria-hidden="true" />
            <span className="text-sm font-medium">Capturar usuário</span>
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleMenuClick}
          aria-expanded={showMenu}
          aria-haspopup="menu"
          aria-label={`Menu do usuário: ${getUserDisplayName()}`}
          className="flex items-center gap-3 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 text-white transition-colors shadow-sm min-h-[44px] flex-shrink-0 whitespace-nowrap"
          title={getUserDisplayName()}
        >
          {/* Avatar */}
          <LazyAvatar
            photoUrl={user.photoUrl}
            firstName={user.firstName}
            lastName={user.lastName}
            username={user.username}
            size="sm"
            className="flex-shrink-0"
          />
          
          {/* Nome e Role */}
          <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0">
            <User className="w-4 h-4 text-white/70 flex-shrink-0" aria-hidden="true" />
            {user.firstName ? (
              <span className="text-sm font-medium text-white whitespace-nowrap">
                {user.firstName}
                {user.lastName && (
                  <span className="hidden md:inline"> {user.lastName}</span>
                )}
              </span>
            ) : (
              <span className="text-sm font-medium text-white whitespace-nowrap">
                {user.username}
              </span>
            )}
            <span className="hidden lg:inline-flex text-xs text-blue-100 bg-blue-700 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
              {getRoleLabel(user.role)}
            </span>
          </div>
          
          {/* Ícone de dropdown */}
          <ChevronDown className={`w-4 h-4 text-white/70 flex-shrink-0 transition-transform ${showMenu ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <AlterarUsernameModal
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        currentUsername={user.username}
      />

      <AlterarSenhaModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      <EditarPerfilModal
        isOpen={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
      />

      <NotificacoesModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
      />

      {showCaptureModal && (
        <CapturarUsuarioModal onClose={() => setShowCaptureModal(false)} />
      )}
    </>
  );
};

export default MenuUsuario;
