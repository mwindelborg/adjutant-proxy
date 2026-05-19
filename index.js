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
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 120000,
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((e) => {
      poolPromise = undefined;
      throw e;
    });
  }
  return poolPromise;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/export', async (req, res) => {
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const from = ymd.test(req.query.from) ? req.query.from
    : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  const to = ymd.test(req.query.to) ? req.query.to
    : new Date().toISOString().slice(0, 10);
  const includeInventory = req.query.include_inventory === '1';

  try {
    const pool = await getPool();

    res.setHeader('Content-Type', 'application/json');
    res.write(`{"from":${JSON.stringify(from)},"to":${JSON.stringify(to)},"export_byic_sales":[`);

    const salesReq = pool.request();
    salesReq.input('from', sql.Date, from);
    salesReq.input('to', sql.Date, to);
    salesReq.stream = true;
    salesReq.query(`
      SELECT *
      FROM [export_byic_sales]
      WHERE date >= @from AND date <= @to
    `);

    let salesFirst = true;
    let salesCount = 0;
    await new Promise((resolve, reject) => {
      salesReq.on('row', (row) => {
        if (!salesFirst) res.write(',');
        salesFirst = false;
        salesCount++;
        res.write(JSON.stringify(row));
      });
      salesReq.on('error', reject);
      salesReq.on('done', resolve);
    });

    res.write(`],"sales_count":${salesCount},"export_byic_inventory":[`);

    let invCount = 0;
    if (includeInventory) {
      const invReq = pool.request();
      invReq.stream = true;
      invReq.query(`SELECT * FROM [export_byic_inventory]`);
      let invFirst = true;
      await new Promise((resolve, reject) => {
        invReq.on('row', (row) => {
          if (!invFirst) res.write(',');
          invFirst = false;
          invCount++;
          res.write(JSON.stringify(row));
        });
        invReq.on('error', reject);
        invReq.on('done', resolve);
      });
    }

    res.write(`],"inventory_count":${invCount}}`);
    res.end();
  } catch (err) {
    console.error('export failed:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
