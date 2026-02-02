const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const { readData, writeData } = require('./database');
const { authMiddleware, generateToken } = require('./auth');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// RANKS ordering for validation
const RANKS = ['Academy', 'Genin', 'Chunin', 'Jonin', 'Kage'];
const MISSION_RANKS = ['D', 'C', 'B', 'A', 'S'];

const rankToValue = (rank) => RANKS.indexOf(rank);
const missionRankToValue = (mRank) => MISSION_RANKS.indexOf(mRank);

// --- Auth Routes ---
app.post('/auth/register', async (req, res) => {
    const { username, password, rank = 'Academy' } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const data = readData();
    const existingNinja = data.ninjas.find(n => n.username === username);

    if (existingNinja) {
        return res.status(400).json({ message: 'Ese nombre de ninja ya está en uso' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newNinja = {
        id: (data.ninjas.length + 1).toString(),
        username,
        passwordHash,
        rank: RANKS.includes(rank) ? rank : 'Academy',
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        experiencePoints: 0
    };

    data.ninjas.push(newNinja);
    writeData(data);

    const token = generateToken(newNinja);
    res.status(201).json({
        token,
        ninja: {
            id: newNinja.id,
            username: newNinja.username,
            rank: newNinja.rank,
            experiencePoints: newNinja.experiencePoints,
            avatarUrl: newNinja.avatarUrl
        }
    });
});

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const data = readData();
    const ninja = data.ninjas.find(n => n.username === username);

    if (!ninja) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const isValid = await bcrypt.compare(password, ninja.passwordHash);
    if (!isValid) {
        return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    const token = generateToken(ninja);
    res.json({
        token,
        ninja: {
            id: ninja.id,
            username: ninja.username,
            rank: ninja.rank,
            experiencePoints: ninja.experiencePoints || 0,
            avatarUrl: ninja.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ninja.username}`
        }
    });
});

// --- Missions Routes ---
app.get('/missions', authMiddleware, (req, res) => {
    const { rank, status, page = 1, limit = 50 } = req.query;
    const data = readData();
    let missions = data.missions;

    if (rank) missions = missions.filter(m => m.rankRequirement === rank);
    if (status) missions = missions.filter(m => m.status === status);

    const startIndex = (page - 1) * limit;
    const paginatedMissions = missions.slice(startIndex, startIndex + Number(limit));

    const enrichedMissions = paginatedMissions.map(mission => {
        const assignment = data.assignments.find(a => a.missionId === mission.id);
        if (assignment) {
            const ninja = data.ninjas.find(n => n.id === assignment.ninjaId);
            return {
                ...mission,
                acceptedByNinjaName: ninja ? ninja.username : 'Ninja Desconocido',
                acceptedByNinjaAvatar: ninja ? ninja.avatarUrl : null
            };
        }
        return mission;
    });

    res.json({
        total: missions.length,
        page: Number(page),
        limit: Number(limit),
        data: enrichedMissions
    });
});


app.patch('/missions/:id/accept', authMiddleware, (req, res) => {
    const { id } = req.params;
    const data = readData();
    const mission = data.missions.find(m => m.id === id);

    if (!mission) return res.status(404).json({ message: 'Misión no encontrada' });
    if (mission.status !== 'DISPONIBLE') return res.status(400).json({ message: 'La misión ya no está disponible' });

    // Rank validation: Ninja rank must be >= mission rank index? 
    // Usually: D (0), C (1), B (2), A (3), S (4)
    // Academy (0) -> can do D? Let's say yes.
    // Genin (1) -> can do D, C.
    // Chunin (2) -> can do D, C, B.
    // Jonin (3) -> can do D, C, B, A.
    // Kage (4) -> can do all.

    const ninjaRankVal = rankToValue(req.ninja.rank);
    const missionRankVal = missionRankToValue(mission.rankRequirement);

    if (ninjaRankVal < missionRankVal) {
        return res.status(403).json({ message: 'Tu rango es insuficiente para esta misión' });
    }

    mission.status = 'EN_CURSO';
    mission.updatedAt = new Date().toISOString();

    data.assignments.push({
        missionId: id,
        ninjaId: req.ninja.id,
        assignedAt: new Date().toISOString(),
        reportText: null,
        evidenceImageUrl: null
    });

    writeData(data);
    writeData(data);
    res.json({ message: 'Misión aceptada', mission });
});

app.delete('/missions/:id/abandon', authMiddleware, (req, res) => {
    const { id } = req.params;
    const data = readData();

    // Find assignment for this ninja and mission
    const assignmentIndex = data.assignments.findIndex(a => a.missionId === id && a.ninjaId === req.ninja.id);
    if (assignmentIndex === -1) {
        return res.status(404).json({ message: 'No estás asignado a esta misión o no existe' });
    }

    // Check if mission is already completed (cannot abandon completed missions)
    const mission = data.missions.find(m => m.id === id);
    if (mission && mission.status === 'COMPLETADA') {
        return res.status(400).json({ message: 'No puedes abandonar una misión completada' });
    }

    // Remove assignment
    data.assignments.splice(assignmentIndex, 1);

    // Reset mission status to DISPONIBLE
    if (mission) {
        mission.status = 'DISPONIBLE';
        mission.updatedAt = new Date().toISOString();
    }

    writeData(data);
    res.json({ message: 'Misión abandonada. Has deshonrado a tu clan... pero la misión está libre de nuevo.', mission });
});

app.post('/missions/:id/report', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { reportText, evidenceImageUrl } = req.body; // Simulating multipart/base64 via direct field
    const data = readData();

    const assignment = data.assignments.find(a => a.missionId === id && a.ninjaId === req.ninja.id);
    if (!assignment) return res.status(404).json({ message: 'No estás asignado a esta misión' });

    const mission = data.missions.find(m => m.id === id);
    mission.status = 'COMPLETADA';
    mission.updatedAt = new Date().toISOString();

    assignment.reportText = reportText;
    assignment.evidenceImageUrl = evidenceImageUrl;

    // Award experience
    const ninja = data.ninjas.find(n => n.id === req.ninja.id);
    const expGain = mission.reward / 10; // Simple logic: 10% of reward as XP
    ninja.experiencePoints += expGain;

    writeData(data);
    res.json({ message: 'Reporte enviado con éxito', experienceGained: expGain });
});

// --- Ninja Stats ---
app.get('/ninjas/me/stats', authMiddleware, (req, res) => {
    const data = readData();
    const ninja = data.ninjas.find(n => n.id === req.ninja.id);
    const myAssignments = data.assignments.filter(a => a.ninjaId === req.ninja.id);

    // Aggregated stats
    const completedCount = data.missions.filter(m =>
        myAssignments.some(a => a.missionId === m.id) && m.status === 'COMPLETADA'
    ).length;

    res.json({
        profile: {
            username: ninja.username,
            rank: ninja.rank,
            experience: ninja.experiencePoints,
            avatar: ninja.avatarUrl
        },
        stats: {
            totalAssignments: myAssignments.length,
            completedMissions: completedCount
        }
    });
});

const server = app.listen(PORT, () => {
    console.log(`The Brain of the Village is running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${PORT} is already in use.`);
    } else {
        console.error('Server error:', err);
    }
});
