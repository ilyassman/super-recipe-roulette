const multer = require('multer');
const path = require('path');

// Utiliser memoryStorage pour avoir le fichier en mémoire
// On copiera manuellement avec fs pour avoir plus de contrôle
const storage = multer.memoryStorage();

// Filtre pour accepter uniquement les images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Seuls les fichiers image (jpg, png, webp) sont autorisés.'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter: fileFilter
});

module.exports = upload;
