export const generateBlurredThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.onloadeddata = () => { video.currentTime = Math.min(1, video.duration / 2) || 0; };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scaleSize = 50 / (video.videoWidth || 100);
        canvas.width = 50;
        canvas.height = (video.videoHeight || 100) * scaleSize;
        if(ctx) {
          ctx.filter = 'blur(2px)';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      };
      video.onerror = () => resolve(''); 
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const scaleSize = 50 / img.width;
          canvas.width = 50;
          canvas.height = img.height * scaleSize;
          if(ctx) {
            ctx.filter = 'blur(2px)';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          resolve(canvas.toDataURL('image/jpeg', 0.3));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
};