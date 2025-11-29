const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const db = require('./db');
const path = require('path');

const app = express(); // 👈 ESTA LÍNEA DEBE VENIR ANTES DE CUALQUIER app.use

// Middlewares
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'panaderia-secret',
  resave: false,
  saveUninitialized: false
}));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
})

// Utilidad: generar número de venta
function generarNumeroVenta() {
  return 'V-' + crypto.randomUUID();
}




/* ========= Usuarios ========= */

// Registro
app.post('/registro', async (req, res) => {
  try {
    const { nombre, username, correo, contraseña } = req.body;
    if (!nombre || !username || !correo || !contraseña) return res.status(400).json({ error: 'Datos incompletos' });

    await db.query(
      'INSERT INTO usuarios (nombre, username, correo, contraseña, rol, fondos) VALUES (?,?,?,?,?,?)',
      [nombre, username, correo, contraseña, 'USER', 0]
    );
    res.json({ ok: true, mensaje: 'Usuario registrado' });
  } catch (e) {
    res.status(400).json({ error: 'Registro inválido o duplicado' });
  }
});

// Login por username
app.post('/login', async (req, res) => {
  try {
    const { username, contraseña } = req.body;
    if (!username || !contraseña) return res.status(400).json({ error: 'Datos incompletos' });

    const rows = await db.query('SELECT * FROM usuarios WHERE username=?', [username]);
    if (!rows.length || rows[0].contraseña !== contraseña) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const u = rows[0];
    req.session.user = { id: u.id, username: u.username, rol: u.rol };
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// Logout
app.post('/logout', auth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Fondos del usuario
app.get('/usuarios/mis-fondos', auth, async (req, res) => {
  const row = (await db.query('SELECT fondos FROM usuarios WHERE id=?', [req.session.user.id]))[0];
  res.json({ fondos: row?.fondos || 0 });
});

// CRUD usuarios (ADMIN)
app.get('/usuarios', authAdmin, async (req, res) => {
  const rows = await db.query('SELECT id, nombre, username, correo, fondos, rol FROM usuarios');
  res.json(rows);
});
app.post('/usuarios', authAdmin, async (req, res) => {
  const { nombre, username, correo, contraseña, rol='USER', fondos=0 } = req.body;
  await db.query('INSERT INTO usuarios (nombre, username, correo, contraseña, rol, fondos) VALUES (?,?,?,?,?,?)',
    [nombre, username, correo, contraseña, rol, fondos]);
  res.json({ ok: true });
});
app.put('/usuarios/:id', authAdmin, async (req, res) => {
  const { nombre, username, correo, contraseña, rol, fondos } = req.body;
  await db.query('UPDATE usuarios SET nombre=?, username=?, correo=?, contraseña=?, rol=?, fondos=? WHERE id=?',
    [nombre, username, correo, contraseña, rol, fondos, req.params.id]);
  res.json({ ok: true });
});
app.delete('/usuarios/:id', authAdmin, async (req, res) => {
  await db.query('DELETE FROM usuarios WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/* ========= Productos ========= */
// Ejemplos básicos (ajusta según ya tengas)
app.get('/productos', async (req, res) => {
  const rows = await db.query('SELECT id, nombre, descripcion, precio, stock FROM productos');
  res.json(rows);
});
app.post('/productos', authAdmin, async (req, res) => {
  const { nombre, descripcion, precio, imagenBase64, stock=1 } = req.body;
  if (!nombre || !precio || !imagenBase64) return res.status(400).json({ error: 'Datos incompletos' });
  const imagenBuffer = Buffer.from(imagenBase64, 'base64');
  await db.query('INSERT INTO productos (nombre, descripcion, precio, imagen, stock) VALUES (?,?,?,?,?)',
    [nombre, descripcion || null, precio, imagenBuffer, stock]);
  res.json({ ok: true });
});
app.put('/productos/:id', authAdmin, async (req, res) => {
  const { nombre, descripcion, precio, imagenBase64, stock } = req.body;
  let sql = 'UPDATE productos SET nombre=?, descripcion=?, precio=?, stock=? WHERE id=?';
  let params = [nombre, descripcion || null, precio, stock, req.params.id];
  if (imagenBase64) {
    sql = 'UPDATE productos SET nombre=?, descripcion=?, precio=?, imagen=?, stock=? WHERE id=?';
    params = [nombre, descripcion || null, precio, Buffer.from(imagenBase64, 'base64'), stock, req.params.id];
  }
  await db.query(sql, params);
  res.json({ ok: true });
});
app.delete('/productos/:id', authAdmin, async (req, res) => {
  await db.query('DELETE FROM productos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/* ========= Carrito ========= */
app.get('/carrito', auth, async (req, res) => {
  const rows = await db.query(`
    SELECT c.id, p.id AS producto_id, p.nombre, p.precio, c.cantidad
    FROM carrito c
    JOIN productos p ON p.id=c.producto_id
    WHERE c.usuario_id=?`, [req.session.user.id]);
  res.json(rows);
});
app.post('/carrito', auth, async (req, res) => {
  const { producto_id, cantidad } = req.body;
  if (!producto_id || !cantidad || cantidad <= 0) return res.status(400).json({ error: 'Datos inválidos' });
  await db.query('INSERT INTO carrito (usuario_id, producto_id, cantidad) VALUES (?,?,?)',
    [req.session.user.id, producto_id, cantidad]);
  res.json({ ok: true });
});
app.delete('/carrito/:id', auth, async (req, res) => {
  await db.query('DELETE FROM carrito WHERE id=? AND usuario_id=?', [req.params.id, req.session.user.id]);
  res.json({ ok: true });
});

/* ========= Checkout (comprar carrito) ========= */
app.post('/carrito/checkout', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const usuarioId = req.session.user.id;

    const items = await conn.query(`
      SELECT c.id, p.id AS producto_id, p.nombre, p.precio, p.stock, c.cantidad
      FROM carrito c
      JOIN productos p ON p.id=c.producto_id
      WHERE c.usuario_id=?`, [usuarioId]).then(([rows]) => rows);

    if (!items.length) {
      conn.release();
      return res.status(400).json({ error: 'Carrito vacío' });
    }

    const total = items.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);

    const user = await conn.query('SELECT fondos FROM usuarios WHERE id=?', [usuarioId]).then(([rows]) => rows[0]);
    if (!user || user.fondos <= 0 || user.fondos < total) {
      conn.release();
      return res.status(400).json({ error: 'Fondos insuficientes' });
    }

    await conn.beginTransaction();

    const numeroVenta = generarNumeroVenta();
    await conn.query('INSERT INTO ventas (numero_venta, usuario_id, total) VALUES (?,?,?)',
      [numeroVenta, usuarioId, total]);
    const ventaId = await conn.query('SELECT LAST_INSERT_ID() AS id').then(([rows]) => rows[0].id);

    for (const it of items) {
      // Validar stock si usas stock
      if (it.stock < it.cantidad) throw new Error('Stock insuficiente');

      await conn.query('INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario) VALUES (?,?,?,?)',
        [ventaId, it.producto_id, it.cantidad, it.precio]);

      // “Eliminar de la base de datos” o decremento de stock
      // Opción recomendada: decrementar stock, y si queda 0 puedes dejar o eliminar según tu requerimiento:
      await conn.query('UPDATE productos SET stock=stock-? WHERE id=?', [it.cantidad, it.producto_id]);

      // Si realmente quieres eliminar al comprar, usa esta línea en lugar del UPDATE:
      // await conn.query('DELETE FROM productos WHERE id=?', [it.producto_id]);
    }

    // Descontar fondos y limitar máximo
    await conn.query('UPDATE usuarios SET fondos = LEAST(999999999999, fondos - ?) WHERE id=?', [total, usuarioId]);

    // Vaciar carrito
    await conn.query('DELETE FROM carrito WHERE usuario_id=?', [usuarioId]);

    await conn.commit();
    conn.release();
    res.json({ ok: true, venta_id: ventaId, numero_venta: numeroVenta, total });
  } catch (e) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ error: e.message || 'Error en checkout' });
  }
});

/* ========= Historial ========= */
// Ventas del usuario
app.get('/ventas/mias', auth, async (req, res) => {
  const rows = await db.query('SELECT id, numero_venta, fecha, total FROM ventas WHERE usuario_id=? ORDER BY fecha DESC', [req.session.user.id]);
  res.json(rows);
});
// Detalle de una venta
app.get('/ventas/:id/detalle', auth, async (req, res) => {
  const rows = await db.query(`
    SELECT dv.producto_id, p.nombre, dv.cantidad, dv.precio_unitario
    FROM detalle_venta dv
    JOIN productos p ON p.id=dv.producto_id
    WHERE dv.venta_id=?`, [req.params.id]);
  res.json(rows);
});
// Admin: ventas por rango de fecha
app.get('/admin/ventas', authAdmin, async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Rango de fechas requerido' });
  const rows = await db.query(`
    SELECT id, usuario_id, numero_venta, fecha, total
    FROM ventas
    WHERE fecha BETWEEN ? AND ?
    ORDER BY fecha DESC`, [desde, hasta]);
  res.json(rows);
});
// Admin: agregación por día (gráficos)
app.get('/admin/ventas/por-dia', authAdmin, async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Rango de fechas requerido' });
  const rows = await db.query(`
    SELECT DATE(fecha) AS dia, SUM(total) AS monto
    FROM ventas
    WHERE fecha BETWEEN ? AND ?
    GROUP BY DATE(fecha)
    ORDER BY dia ASC`, [desde, hasta]);
  res.json(rows);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor escuchando en puerto 3000');
});
