const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  server: process.env.AZURE_SQL_SERVER,
  port: parseInt(process.env.AZURE_SQL_PORT || '1433'),
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USERNAME,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false }
};

app.get('/export', async (req, res) => {
  try {
    await sql.connect(config);
    const tables = await sql.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    const result = {};
    for (const row of tables.recordset) {
      const data = await sql.query(`SELECT * FROM [${row.TABLE_NAME}]`);
      result[row.TABLE_NAME] = data.recordset;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
