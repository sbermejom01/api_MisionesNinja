const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const { authMiddleware, generateToken } = require('./auth');
const pool = require('./database');

const app = express();

app.use(cors({
  origin: 'https://pr-5-misiones-ninja.vercel.app',
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/api", (req, res) => {
  res.json({ mensaje: "API funcionando en Vercel" });
});

module.exports = app;

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

    try {
        const exists = await pool.query(
            'SELECT id FROM ninjas WHERE username = $1',
            [username]
        );
        if (exists.rowCount > 0) {
            return res.status(400).json({ message: 'Ese nombre de ninja ya está en uso' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

        const result = await pool.query(
            `INSERT INTO ninjas (username, password_hash, rank, avatar_url)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, rank, experience_points, avatar_url`,
            [username, passwordHash, RANKS.includes(rank) ? rank : 'Academy', avatarUrl]
        );

        const ninja = result.rows[0];

        const token = generateToken(ninja);

        res.status(201).json({ token, ninja });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al registrar ninja' });
    }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Faltan credenciales' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, rank, experience_points, avatar_url FROM ninjas WHERE username = $1',
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const ninja = result.rows[0];

    const isValid = await bcrypt.compare(password, ninja.password_hash);
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
        experiencePoints: ninja.experience_points,
        avatarUrl: ninja.avatar_url
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en el login' });
  }
});

// --- Missions Routes ---
app.get('/missions', authMiddleware, async (req, res) => {
    try {
        const { rank, status } = req.query;
        
        let query = `
            SELECT m.*, 
                   n.username as "acceptedByNinjaName", 
                   n.avatar_url as "acceptedByNinjaAvatar"
            FROM missions m
            LEFT JOIN assignments a ON m.id = a.mission_id
            LEFT JOIN ninjas n ON a.ninja_id = n.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 1;

        if (rank) {
            query += ` AND m.rank_requirement = $${paramCount}`;
            params.push(rank);
            paramCount++;
        }

        if (status) {
            query += ` AND m.status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        query += ` ORDER BY m.created_at DESC`;

        const result = await pool.query(query, params);
        
        const formattedMissions = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
            rankRequirement: row.rank_requirement,
            reward: row.reward,
            status: row.status,
            acceptedByNinjaName: row.acceptedByNinjaName,
            acceptedByNinjaAvatar: row.acceptedByNinjaAvatar
        }));

        res.json({ data: formattedMissions });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener misiones' });
    }
});

app.patch('/missions/:id/accept', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const missionRes = await client.query('SELECT * FROM missions WHERE id = $1', [id]);
        if (missionRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Misión no encontrada' });
        }
        const mission = missionRes.rows[0];

        if (mission.status !== 'DISPONIBLE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'La misión ya no está disponible' });
        }

        const ninjaRankVal = rankToValue(req.ninja.rank);
        const missionRankVal = missionRankToValue(mission.rank_requirement);

        if (ninjaRankVal < missionRankVal) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Tu rango es insuficiente' });
        }

        await client.query("UPDATE missions SET status = 'EN_CURSO', updated_at = NOW() WHERE id = $1", [id]);

        await client.query(
            "INSERT INTO assignments (mission_id, ninja_id) VALUES ($1, $2)",
            [id, req.ninja.id]
        );

        await client.query('COMMIT');
        res.json({ message: 'Misión aceptada' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al aceptar misión' });
    } finally {
        client.release();
    }
});

app.post('/missions/:id/report', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { reportText, evidenceImageUrl } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const assignRes = await client.query(
            'SELECT * FROM assignments WHERE mission_id = $1 AND ninja_id = $2', 
            [id, req.ninja.id]
        );
        
        if (assignRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'No estás asignado a esta misión' });
        }

        const missionRes = await client.query('SELECT reward FROM missions WHERE id = $1', [id]);
        const reward = missionRes.rows[0].reward;

        await client.query("UPDATE missions SET status = 'COMPLETADA', updated_at = NOW() WHERE id = $1", [id]);

        await client.query(
            "UPDATE assignments SET report_text = $1, evidence_image_url = $2 WHERE mission_id = $3",
            [reportText, evidenceImageUrl, id]
        );

        const xpGain = Math.floor(reward / 10);
        await client.query(
            "UPDATE ninjas SET experience_points = experience_points + $1 WHERE id = $2",
            [xpGain, req.ninja.id]
        );

        await client.query('COMMIT');
        res.json({ message: 'Reporte enviado', experienceGained: xpGain });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al enviar reporte' });
    } finally {
        client.release();
    }
});

app.get('/ninjas/me/stats', authMiddleware, async (req, res) => {
    try {
        const ninjaRes = await pool.query('SELECT * FROM ninjas WHERE id = $1', [req.ninja.id]);
        const ninja = ninjaRes.rows[0];

        const totalAssignRes = await pool.query('SELECT COUNT(*) FROM assignments WHERE ninja_id = $1', [req.ninja.id]);
        
        const completedRes = await pool.query(`
            SELECT COUNT(*) 
            FROM assignments a 
            JOIN missions m ON a.mission_id = m.id 
            WHERE a.ninja_id = $1 AND m.status = 'COMPLETADA'
        `, [req.ninja.id]);

        res.json({
            profile: {
                username: ninja.username,
                rank: ninja.rank,
                experiencePoints: ninja.experience_points,
                avatarUrl: ninja.avatar_url
            },
            stats: {
                totalAssignments: parseInt(totalAssignRes.rows[0].count),
                completedMissions: parseInt(completedRes.rows[0].count)
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener stats' });
    }
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
