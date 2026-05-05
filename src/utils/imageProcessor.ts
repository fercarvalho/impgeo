import imageCompression from 'browser-image-compression';

export async function processImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 2,
    maxWidthOrHeight: 400,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  };

  try {
    let fileToCompress = file;
    // Check if the file is HEIC/HEIF
    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().match(/\.(heic|heif)$/)) {
      // Import heic2any dynamically only when needed to save bundle size
      const heic2any = (await import('heic2any')).default;
      const convertedBlob = await (heic2any as Function)({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      // heic2any might return an array if the image is a sequence, get the first one
      const rawBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      if (!rawBlob) throw new Error('heic2any retornou resultado vazio ao converter HEIC');
      fileToCompress = new File([rawBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
      });
    }

    return await imageCompression(fileToCompress, options);
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    throw new Error('Falha ao processar imagem. Este formato pode não ser suportado pelo seu navegador.');
  }
}

export async function cropImage(
  imageFile: File,
  cropArea: { x: number; y: number; width: number; height: number }
): Promise<File> {
  if (
    !Number.isFinite(cropArea.width) || cropArea.width <= 0 ||
    !Number.isFinite(cropArea.height) || cropArea.height <= 0
  ) {
    return Promise.reject(new Error('Dimensões de recorte inválidas: width e height devem ser números finitos maiores que zero'));
  }
  if (
    !Number.isFinite(cropArea.x) || cropArea.x < 0 ||
    !Number.isFinite(cropArea.y) || cropArea.y < 0
  ) {
    return Promise.reject(new Error('Coordenadas de recorte inválidas: x e y devem ser números finitos não negativos'));
  }

  let fileToCrop = imageFile;

  if (imageFile.type === 'image/heic' || imageFile.type === 'image/heif' || imageFile.name.toLowerCase().match(/\.(heic|heif)$/)) {
    try {
      const heic2any = (await import('heic2any')).default;
      const convertedBlob = await (heic2any as Function)({
        blob: imageFile,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      const rawBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      if (!rawBlob) throw new Error('heic2any retornou resultado vazio ao converter HEIC para recorte');
      fileToCrop = new File([rawBlob], imageFile.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
      });
    } catch (error) {
      console.error('Erro ao converter imagem HEIC para recorte:', error);
      throw new Error('Falha ao processar imagem HEIC para recorte.');
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (!result || typeof result !== 'string') {
        reject(new Error('Erro ao ler arquivo: FileReader retornou resultado inválido'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          if (
            cropArea.x + cropArea.width > img.naturalWidth ||
            cropArea.y + cropArea.height > img.naturalHeight
          ) {
            reject(new Error(
              `Área de recorte ultrapassa os limites da imagem (${img.naturalWidth}x${img.naturalHeight})`
            ));
            return;
          }

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Não foi possível criar o contexto do canvas'));
            return;
          }

          canvas.width = cropArea.width;
          canvas.height = cropArea.height;
          context.drawImage(
            img,
            cropArea.x,
            cropArea.y,
            cropArea.width,
            cropArea.height,
            0,
            0,
            cropArea.width,
            cropArea.height
          );

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Falha ao criar blob da imagem recortada'));
                return;
              }
              const baseName = imageFile.name.includes('.')
                ? imageFile.name.replace(/\.[^/.]+$/, '.webp')
                : `${imageFile.name}.webp`;
              resolve(
                new File([blob], baseName, {
                  type: 'image/webp',
                })
              );
            },
            'image/webp',
            0.95
          );
        } catch (err) {
          console.error('Erro ao recortar imagem no canvas:', err);
          reject(err instanceof Error ? err : new Error('Erro ao recortar imagem no canvas'));
        }
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = result;
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(fileToCrop);
  });
}
