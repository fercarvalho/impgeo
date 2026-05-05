import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Check, X } from 'lucide-react';
import { cropImage } from '../utils/imageProcessor';

interface ImageCropProps {
  image: File | string;
  onCropComplete: (croppedFile: File) => void;
  onCancel: () => void;
}

const ImageCrop: React.FC<ImageCropProps> = ({ image, onCropComplete, onCancel }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSrc, setImageSrc] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const isProcessingRef = useRef(false);

  React.useEffect(() => {
    setImageLoadError(false);
    if (typeof image === 'string') {
      setImageSrc(image);
      return;
    }
    let cancelled = false;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (cancelled) return;
      if (reader.result === null) {
        setImageLoadError(true);
        return;
      }
      setImageSrc(reader.result as string);
    };
    reader.onerror = () => {
      if (!cancelled) setImageLoadError(true);
    };
    reader.readAsDataURL(image);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [image]);

  const onCropCompleteCallback = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (isProcessingRef.current || !croppedAreaPixels) return;
    // cropImage espera um File; quando image é string (URL), não é possível recortar
    if (typeof image === 'string') {
      alert('Recorte não disponível para imagens externas (URL). Faça upload de um arquivo.');
      return;
    }
    isProcessingRef.current = true;
    setIsProcessing(true);
    try {
      const croppedFile = await cropImage(image, croppedAreaPixels);
      onCropComplete(croppedFile);
    } catch (error) {
      console.error('Erro ao recortar imagem:', error);
      alert('Erro ao recortar imagem. Por favor, tente novamente.');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900/50 to-indigo-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600">
          <h2 id="image-crop-title" className="text-lg font-bold text-white">Recortar Imagem</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar recorte de imagem"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="relative flex-1 min-h-[400px] bg-gray-900 flex items-center justify-center">
          {imageLoadError ? (
            <p className="text-red-400 text-sm px-6 text-center">Não foi possível carregar a imagem. Verifique o arquivo e tente novamente.</p>
          ) : imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropCompleteCallback}
              cropShape="round"
            />
          ) : (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" aria-label="Carregando imagem" role="status" />
          )}
        </div>

        <div className="p-4 border-t border-gray-200 space-y-4">
          <div>
            <label htmlFor="crop-zoom" className="block text-sm font-medium text-gray-700 mb-2">Zoom: {Math.round(zoom * 100)}%</label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing || !croppedAreaPixels}
              aria-busy={isProcessing}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl disabled:opacity-50 disabled:transform-none flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                  Processando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Confirmar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

export default ImageCrop;
