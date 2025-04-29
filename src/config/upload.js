import multer from 'multer';

// Configuración para almacenar en memoria (necesario para Azure)
const storage = multer.memoryStorage();

// Filtro para validar tipos de archivo
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Formato de archivo no soportado. Solo se permiten JPG y PNG.'), false);
  }
};

// Crear middleware de carga
export const singleImageUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: fileFilter
}).single('image');