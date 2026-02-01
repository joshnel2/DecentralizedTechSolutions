const express = require('express');
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const authenticate = require('../middleware/auth');
const documentController = require('../controllers/documentController');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept common document types
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/json',
    'text/csv'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Document routes
router.post('/upload',
  authenticate,
  upload.single('document'),
  [
    body('title').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('category').optional().isIn(['general', 'contracts', 'technical', 'administrative', 'financial', 'legal', 'personal']),
    body('tags').optional().customSanitizer(value => {
      if (typeof value === 'string') {
        return value.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
      }
      return value;
    })
  ],
  documentController.uploadDocument
);

router.get('/',
  authenticate,
  documentController.listDocuments
);

router.get('/stats',
  authenticate,
  documentController.getDocumentStats
);

router.get('/:id',
  authenticate,
  documentController.getDocument
);

router.get('/:id/content',
  authenticate,
  documentController.getDocumentContent
);

router.put('/:id',
  authenticate,
  [
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('category').optional().isIn(['general', 'contracts', 'technical', 'administrative', 'financial', 'legal', 'personal']),
    body('tags').optional().isArray(),
    body('accessLevel').optional().isIn(['public', 'private', 'restricted'])
  ],
  documentController.updateDocument
);

router.delete('/:id',
  authenticate,
  documentController.deleteDocument
);

// Additional utility routes
router.post('/:id/share',
  authenticate,
  [
    body('email').isEmail(),
    body('permission').isIn(['read', 'write', 'admin'])
  ],
  (req, res) => {
    // Share document with user
    res.json({ success: true, message: 'Document sharing not implemented yet' });
  }
);

module.exports = router;