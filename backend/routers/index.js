const express = require('express');
const router = express.Router();

// Route d'accueil
router.get('/', (req, res) => {
    res.render('index', { logged: req.session.loggedin || false });
});

module.exports = router;

