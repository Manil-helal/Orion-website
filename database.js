import mysql from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Connexion simple à la base de données du Bot.
 * Le site ne gère pas la structure (CREATE TABLE), il fait juste des lectures/écritures.
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Petit log pour confirmer au démarrage que le lien est fait
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ [SQL] Erreur de connexion au cluster du Bot :', err.message);
    } else {
        console.log('✅ [SQL] Site connecté à la base de données du Bot.');
        connection.release();
    }
});

export default pool;
