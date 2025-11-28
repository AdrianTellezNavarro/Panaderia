const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'panaderia',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = {
  query: async (sql, params=[]) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
  getConnection: () => pool.getConnection()
};
