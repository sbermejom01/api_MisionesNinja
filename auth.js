const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'konoha-secret-key';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No se proporcionó token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, SECRET);
        req.ninja = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido o expirado' });
    }
};

const generateToken = (ninja) => {
    return jwt.sign(
        { id: ninja.id, username: ninja.username, rank: ninja.rank },
        SECRET,
        { expiresIn: '24h' }
    );
};

module.exports = {
    authMiddleware,
    generateToken
};
