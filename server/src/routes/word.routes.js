const express = require('express');
const router = express.Router();
const wordController = require('../controllers/word.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

router.use(authenticateToken);

// Pull all words for cloud sync (offline-first clients merge locally)
router.get('/', wordController.getWords);

module.exports = router;
