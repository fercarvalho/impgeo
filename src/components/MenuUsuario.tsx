import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Edit, Eye, Key, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UserProfileModal from './UserProfileModal';
import EditarPerfilModal from './EditarPerfilModal';
import AlterarUsernameModal from './AlterarUsernameModal';
import AlterarSenhaModal from './AlterarSenhaModal';
import LazyAvatar from './LazyAvatar';

const MenuUsuario: React.FC = () => {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  if (!user) return null;

  const handleMenuToggle = () => {
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setShowMenu((prev) => !prev);
  };

  const openModalAndCloseMenu = (openModal: () => void) => {
    openModal();
    setShowMenu(false);
  };

  const handleOpenEditProfileFromView = () => {
    setShowProfileModal(false);
    setShowEditProfileModal(true);
  };

  const dropdownContent = showMenu ? (
    <div
      ref={menuRef}
      className="fixed w-56 bg-white rounded-xl shadow-lg border border-blue-200 overflow-hidden z-[9999]"
      style={{
        top: `${dropdownPosition.top}px`,
        right: `${dropdownPosition.right}px`,
        animation: 'slideDown 0.2s ease-out',
        transformOrigin: 'top right',
      }}
    >
      <div className="py-2">
        <button
          onClick={() => openModalAndCloseMenu(() => setShowProfileModal(true))}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors text-gray-700"
        >
          <Eye className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Ver Perfil</span>
        </button>
        <button
          onClick={() => openModalAndCloseMenu(() => setShowUsernameModal(true))}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors text-gray-700"
        >
          <Edit className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Alterar Username</span>
        </button>
        <button
          onClick={() => openModalAndCloseMenu(() => setShowPasswordModal(true))}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors text-gray-700"
        >
          <Key className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Alterar Senha</span>
        </button>
        <button
          onClick={() => openModalAndCloseMenu(() => setShowEditProfileModal(true))}
          className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors text-gray-700"
        >
          <User className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">Editar Perfil</span>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleMenuToggle}
        className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg border border-blue-500 text-white transition-colors shadow-sm"
        title={`Usuário: ${user.username}`}
      >
        <LazyAvatar
          photoUrl={user.photoUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          username={user.username}
          size="sm"
          className="border border-blue-300"
        />
        <span className="text-sm font-medium max-w-[120px] truncate">{user.username}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {typeof document !== 'undefined' ? createPortal(dropdownContent, document.body) : null}

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onEditProfile={handleOpenEditProfileFromView}
      />
      <EditarPerfilModal isOpen={showEditProfileModal} onClose={() => setShowEditProfileModal(false)} />
      <AlterarUsernameModal isOpen={showUsernameModal} onClose={() => setShowUsernameModal(false)} />
      <AlterarSenhaModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </>
  );
};

export default MenuUsuario;
