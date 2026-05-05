import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Upload, X } from 'lucide-react';
import ImageCrop from './ImageCrop';
import { processImage } from '../utils/imageProcessor';

interface PhotoUploadProps {
  onPhotoProcessed?: (file: File) => void;
  onPhotoRemoved?: () => void;
  initialPhotoUrl?: string;
  disabled?: boolean;
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({
  onPhotoProcessed,
  onPhotoRemoved,
  initialPhotoUrl,
  disabled = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPhotoUrl || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks blob URLs criados por URL.createObjectURL para revogação posterior
  const blobUrlRef = useRef<string | null>(null);

  // Revoga qualquer blob URL ao desmontar o componente
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Sincroniza previewUrl com initialPhotoUrl quando a prop muda externamente
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(initialPhotoUrl || null);
    }
  }, [initialPhotoUrl, selectedFile]);

  // Gera a preview base64 do selectedFile com cleanup correto
  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (cancelled) return;
      if (reader.result === null) {
        alert('Não foi possível ler o arquivo. Verifique se ele não está corrompido.');
        return;
      }
      setPreviewUrl(reader.result as string);
    };
    reader.onerror = () => {
      if (!cancelled) alert('Erro ao ler o arquivo de imagem. Por favor, tente novamente.');
    };
    reader.readAsDataURL(selectedFile);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [selectedFile]);

  const handleRemovePhoto = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onPhotoRemoved?.();
  }, [onPhotoRemoved]);

  const processAndSetFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const processedFile = await processImage(file);
      onPhotoProcessed?.(processedFile);
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      alert('Erro ao processar imagem. Por favor, tente novamente.');
      handleRemovePhoto();
    } finally {
      setIsProcessing(false);
    }
  }, [handleRemovePhoto, onPhotoProcessed]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'
    ];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|heic|heif)$/)) {
      alert('Selecione uma imagem válida (JPG, PNG, WebP ou HEIC).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 10MB (será otimizada automaticamente).');
      return;
    }

    // Revoga blob URL anterior se existir
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setSelectedFile(file);
    setImageToCrop(file);
    // A geração da preview é feita pelo useEffect([selectedFile]) com cleanup correto
  };

  const handleCropComplete = async (croppedFile: File) => {
    setImageToCrop(null);
    setShowCropModal(false);
    // Revoga blob URL anterior se existir, cria novo para o preview do crop
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    const croppedPreviewUrl = URL.createObjectURL(croppedFile);
    blobUrlRef.current = croppedPreviewUrl;
    setPreviewUrl(croppedPreviewUrl);
    await processAndSetFile(croppedFile);
  };

  const handleSkipCrop = async () => {
    if (!selectedFile) return;
    setShowCropModal(false);
    setImageToCrop(null);
    await processAndSetFile(selectedFile);
  };

  return (
    <>
      <div className="space-y-3">
        {!previewUrl ? (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Clique para selecionar uma foto"
            aria-disabled={disabled}
            onClick={() => !disabled && fileInputRef.current?.click()}
            onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fileInputRef.current?.click(); } }}
            className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 min-h-[120px] flex items-center justify-center ${disabled
              ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
              : 'border-blue-300 bg-blue-50/30 hover:bg-blue-50 hover:border-blue-400 cursor-pointer'
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={disabled}
            />
            <div className="flex flex-col items-center gap-2">
              <Upload className={`w-8 h-8 ${disabled ? 'text-gray-400' : 'text-blue-600'}`} aria-hidden="true" />
              <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-700'}`}>
                Clique para selecionar uma foto
              </span>
              <span className="text-xs text-gray-500">JPG, PNG, WebP ou HEIC (máx. 10MB)</span>
            </div>
          </div>
        ) : (
          <div className="relative w-full max-w-[200px] sm:max-w-[300px] md:max-w-[400px] mx-auto">
            <div className="relative rounded-lg overflow-hidden border-2 border-blue-200 bg-gray-50">
              <img src={previewUrl} alt={selectedFile ? `Foto selecionada: ${selectedFile.name}` : 'Foto selecionada'} className="w-full h-auto max-h-[300px] object-contain" />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 focus-within:bg-black/20">
                {!disabled && imageToCrop ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCropModal(true)}
                      className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                      title="Recortar imagem"
                      aria-label="Recortar imagem"
                    >
                      <Crop className="w-5 h-5 text-blue-600" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipCrop}
                      className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                      title="Usar imagem sem recortar"
                      aria-label="Usar imagem sem recortar"
                    >
                      <Upload className="w-5 h-5 text-green-600" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {!disabled ? (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                    title="Remover foto"
                    aria-label="Remover foto"
                  >
                    <X className="w-5 h-5 text-red-600" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            {isProcessing ? (
              <div
                className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"
                aria-live="polite"
                aria-label="Processando imagem, aguarde"
              >
                <div className="bg-white rounded-lg p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" aria-hidden="true"></div>
                  <p className="mt-2 text-sm text-gray-700">Processando...</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Botões de crop visíveis em touch (sem hover disponível) */}
        {previewUrl && !disabled && imageToCrop ? (
          <div className="flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setShowCropModal(true)}
              className="flex-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
            >
              <Crop className="w-4 h-4" aria-hidden="true" />
              Recortar
            </button>
            <button
              type="button"
              onClick={handleSkipCrop}
              className="flex-1 px-3 py-2 text-sm text-green-600 hover:text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors flex items-center justify-center gap-1"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Usar sem recortar
            </button>
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center"
              aria-label="Remover foto"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {previewUrl && !imageToCrop && !disabled ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-4 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Trocar foto
          </button>
        ) : null}
      </div>

      {showCropModal && imageToCrop ? (
        <ImageCrop
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setShowCropModal(false);
            setImageToCrop(null);
          }}
        />
      ) : null}
    </>
  );
};

export default PhotoUpload;
