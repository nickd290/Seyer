import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { FileData } from '../types';

interface ImageUploadProps {
  label: string;
  description: string;
  fileData: FileData | null;
  onFileSelect: (data: FileData | null) => void;
  required?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ 
  label, 
  description, 
  fileData, 
  onFileSelect, 
  required = false 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onFileSelect({
          file,
          previewUrl: URL.createObjectURL(file),
          base64: reader.result as string,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemove = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onFileSelect(null);
  };

  return (
    <div className="w-full mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          {label}
          {required && <span className="text-red-500 text-xs">*Required</span>}
        </label>
        {fileData && (
          <button 
            onClick={handleRemove}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
          >
            <X size={12} /> Remove
          </button>
        )}
      </div>

      <div 
        className={`
          relative border-2 border-dashed rounded-xl transition-all duration-300 overflow-hidden group
          ${fileData 
            ? 'border-emerald-500/50 bg-zinc-900' 
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-800/50'
          }
        `}
        style={{ minHeight: '160px' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={!!fileData}
        />

        {fileData ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black/20 p-2">
            <img 
              src={fileData.previewUrl} 
              alt="Preview" 
              className="max-h-64 object-contain rounded-lg shadow-lg" 
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Upload className="text-zinc-400" size={20} />
            </div>
            <p className="text-sm text-zinc-300 font-medium">{label}</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">{description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;