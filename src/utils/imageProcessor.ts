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
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      // heic2any might return an array if the image is a sequence, get the first one
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      fileToCompress = new File([finalBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
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
  let fileToCrop = imageFile;

  if (imageFile.type === 'image/heic' || imageFile.type === 'image/heif' || imageFile.name.toLowerCase().match(/\.(heic|heif)$/)) {
    try {
      const heic2any = (await import('heic2any')).default;
      const convertedBlob = await heic2any({
        blob: imageFile,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      fileToCrop = new File([finalBlob], imageFile.name.replace(/\.(heic|heif)$/i, '.jpg'), {
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
      const img = new Image();
      img.onload = () => {
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
            resolve(
              new File([blob], imageFile.name.replace(/\.[^/.]+$/, '.webp'), {
                type: 'image/webp',
              })
            );
          },
          'image/webp',
          0.95
        );
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(fileToCrop);
  });
}
