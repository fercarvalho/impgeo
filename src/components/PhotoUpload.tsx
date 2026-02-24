import React, { useRef, useState } from 'react';
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

  const processAndSetFile = async (file: File) => {
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
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    setImageToCrop(file);

    // UX FIX: Automatically process the original file right away so the parent component 
    // receives the file state. If they later choose to crop it, it will be updated again.
    try {
      const processedFile = await processImage(file);
      onPhotoProcessed?.(processedFile);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    setImageToCrop(null);
    setShowCropModal(false);
    await processAndSetFile(croppedFile);
  };

  const handleSkipCrop = async () => {
    if (!selectedFile) return;
    setShowCropModal(false);
    setImageToCrop(null);
    await processAndSetFile(selectedFile);
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onPhotoRemoved?.();
  };

  return (
    <>
      <div className="space-y-3">
        {!previewUrl ? (
          <div
            onClick={() => !disabled && fileInputRef.current?.click()}
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
              <Upload className={`w-8 h-8 ${disabled ? 'text-gray-400' : 'text-blue-600'}`} />
              <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-700'}`}>
                Clique para selecionar uma foto
              </span>
              <span className="text-xs text-gray-500">JPG, PNG, WebP ou HEIC (máx. 10MB)</span>
            </div>
          </div>
        ) : (
          <div className="relative w-full max-w-[200px] sm:max-w-[300px] md:max-w-[400px] mx-auto">
            <div className="relative rounded-lg overflow-hidden border-2 border-blue-200 bg-gray-50">
              <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[300px] object-contain" />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                {!disabled && imageToCrop ? (
                  <>
                    <button
                      onClick={() => setShowCropModal(true)}
                      className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                      title="Recortar imagem"
                    >
                      <Crop className="w-5 h-5 text-blue-600" />
                    </button>
                    <button
                      onClick={handleSkipCrop}
                      className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                      title="Usar imagem sem recortar"
                    >
                      <Upload className="w-5 h-5 text-green-600" />
                    </button>
                  </>
                ) : null}
                {!disabled ? (
                  <button
                    onClick={handleRemovePhoto}
                    className="min-w-[44px] min-h-[44px] bg-white/90 hover:bg-white rounded-full p-2 flex items-center justify-center shadow-lg transition-all"
                    title="Remover foto"
                  >
                    <X className="w-5 h-5 text-red-600" />
                  </button>
                ) : null}
              </div>
            </div>

            {isProcessing ? (
              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                <div className="bg-white rounded-lg p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm text-gray-700">Processando...</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {previewUrl && !imageToCrop && !disabled ? (
          <button
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
