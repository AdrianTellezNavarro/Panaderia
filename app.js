// app.js - ES6 Modules
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import pkg from 'pg';

const { Pool } = pkg;
const app = express();

/* ================== MIDDLEWARE ================== */

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.use(session({
  name: 'panaderia.sid',
  secret: process.env.SESSION_SECRET || 'panaderia_secreta',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

/* ================== POSTGRES ================== */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log('✅ Conectado a PostgreSQL'))
  .catch(err => console.error('❌ PostgreSQL error:', err));

/* ================== HELPERS ================== */

function requiereSesion(req, res, next) {
  if (!req.session.usuarioId) {
    return res.status(401).json({ error: 'No has iniciado sesión' });
  }
  next();
}

function requiereAdmin(req, res, next) {
  if (!req.session.esAdmin) {
    return res.status(403).json({ error: 'Solo administrador' });
  }
  next();
}

/* ================== SESIÓN ================== */

app.get('/sesion', (req, res) => {
  if (req.session.usuarioId) {
    res.json({
      autenticado: true,
      esAdmin: req.session.esAdmin,
      rol: req.session.rol
    });
  } else {
    res.status(401).json({ autenticado: false });
  }
});

/* ================== AUTH ================== */

app.post('/registro', async (req, res) => {
  const { nombre, correo, password } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    await pool.query(
      'INSERT INTO usuarios (nombre, correo, password) VALUES ($1, $2, $3)',
      [nombre, correo, password]
    );

    res.json({ mensaje: 'Registro exitoso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});


app.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE correo = $1 AND password = $2',
      [correo, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const usuario = result.rows[0];

    req.session.usuarioId = usuario.id;
    req.session.rol = usuario.rol;
    req.session.esAdmin = usuario.rol === 'admin';

    res.json({
      mensaje: 'Sesión iniciada',
      rol: usuario.rol
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }

    res.clearCookie('connect.sid');
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

app.get('/inventario', requiereSesion, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id');
    
    const productos = result.rows.map(pan => {
      const imagenBase64 = pan.imagen ? Buffer.from(pan.imagen).toString('base64') : null;
      return {
        ...pan,
        imagen: imagenBase64
      };
    });

    res.json(productos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/inventario', requiereSesion, requiereAdmin, async (req, res) => {
  const { nombre, descripcion, precio, imagen } = req.body;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  try {
    const imagenBuffer = Buffer.from(imagen, 'base64');
    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, imagen) VALUES ($1, $2, $3, $4) RETURNING id',
      [nombre, descripcion, precio, imagenBuffer]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.put('/inventario/:id', requiereSesion, requiereAdmin, async (req, res) => {
  const { nombre, descripcion, precio, imagen } = req.body;
  const { id } = req.params;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  try {
    const imagenBuffer = Buffer.from(imagen, 'base64');
    await pool.query(
      'UPDATE productos SET nombre = $1, descripcion = $2, precio = $3, imagen = $4 WHERE id = $5',
      [nombre, descripcion, precio, imagenBuffer, id]
    );
    res.json({ mensaje: 'Producto actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.delete('/inventario/:id', requiereSesion, requiereAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM productos WHERE id = $1', [id]);
    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.get('/carrito', requiereSesion, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, p.nombre, p.precio, c.cantidad
       FROM carrito c
       JOIN productos p ON c.producto_id = p.id
       WHERE c.usuario_id = $1 AND c.vendido = 0`,
      [req.session.usuarioId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/carrito/agregar', requiereSesion, async (req, res) => {
  const { producto_id, cantidad } = req.body;
  const usuario_id = req.session.usuarioId;
  if (!producto_id || !cantidad) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const result = await pool.query(
      'SELECT * FROM carrito WHERE usuario_id = $1 AND producto_id = $2 AND vendido = 0',
      [usuario_id, producto_id]
    );

    if (result.rows.length > 0) {
      const nuevaCantidad = result.rows[0].cantidad + cantidad;
      await pool.query(
        'UPDATE carrito SET cantidad = $1 WHERE id = $2',
        [nuevaCantidad, result.rows[0].id]
      );
      res.json({ mensaje: 'Cantidad actualizada' });
    } else {
      await pool.query(
        'INSERT INTO carrito (usuario_id, producto_id, cantidad) VALUES ($1, $2, $3)',
        [usuario_id, producto_id, cantidad]
      );
      res.json({ mensaje: 'Producto agregado al carrito' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.delete('/carrito/:id', requiereSesion, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM carrito WHERE id = $1', [id]);
    res.json({ mensaje: 'Producto eliminado del carrito' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.get('/carrito/total', requiereSesion, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT SUM(p.precio * c.cantidad) AS total
       FROM carrito c  
       JOIN productos p ON c.producto_id = p.id
       WHERE c.usuario_id = $1 AND c.vendido = 0`,
      [req.session.usuarioId]
    );
    const total = result.rows[0].total !== null ? parseFloat(result.rows[0].total) : 0;
    res.json({ total });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.put('/carrito/pagar', requiereSesion, async (req, res) => {
  const usuario_id = req.session.usuarioId;

  try {
    // Obtener carrito
    const carritoRes = await pool.query(
      `SELECT c.producto_id, p.nombre, p.precio, c.cantidad,
              (p.precio * c.cantidad) AS subtotal
       FROM carrito c
       JOIN productos p ON c.producto_id = p.id
       WHERE c.usuario_id = $1 AND c.vendido = 0`,
      [usuario_id]
    );

    if (carritoRes.rows.length === 0) {
      return res.status(400).json({ error: 'Carrito vacío' });
    }

    const items = carritoRes.rows;
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);

    // Ver saldo
    const saldoRes = await pool.query(
      'SELECT saldo FROM usuarios WHERE id = $1',
      [usuario_id]
    );

    const saldoActual = Number(saldoRes.rows[0].saldo);

    if (saldoActual < total) {
      return res.status(400).json({
        error: `Saldo insuficiente 💸 (Saldo: $${saldoActual.toFixed(2)})`
      });
    }

    // Descontar saldo
    await pool.query(
      'UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2',
      [total, usuario_id]
    );

    // Crear ticket
    const ticketRes = await pool.query(
      `INSERT INTO tickets (usuario_id, total)
       VALUES ($1, $2)
       RETURNING id, fecha`,
      [usuario_id, total]
    );

    const ticketId = ticketRes.rows[0].id;

    // Detalle ticket
    for (const item of items) {
      await pool.query(
        `INSERT INTO ticket_detalle
         (ticket_id, producto, precio, cantidad, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, item.nombre, item.precio, item.cantidad, item.subtotal]
      );
    }

    // Marcar carrito como vendido
    await pool.query(
      `UPDATE carrito
       SET vendido = 1, fecha_venta = NOW()
       WHERE usuario_id = $1 AND vendido = 0`,
      [usuario_id]
    );

    res.json({
      mensaje: 'Compra realizada con éxito',
      ticket: {
        id: ticketId,
        fecha: ticketRes.rows[0].fecha,
        total,
        items
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la compra' });
  }
});

app.get('/estadisticas/panes-mas-vendidos', requiereSesion, requiereAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.nombre, SUM(c.cantidad) as total_vendido
       FROM carrito c
       JOIN productos p ON c.producto_id = p.id
       WHERE c.vendido = 1
       GROUP BY p.id, p.nombre
       ORDER BY total_vendido DESC
       LIMIT 5`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

app.get('/historial', requiereSesion, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.total, t.fecha,
              json_agg(
                json_build_object(
                  'nombre', d.producto,
                  'precio', d.precio,
                  'cantidad', d.cantidad,
                  'subtotal', d.subtotal
                )
              ) AS items
       FROM tickets t
       JOIN ticket_detalle d ON d.ticket_id = t.id
       WHERE t.usuario_id = $1
       GROUP BY t.id
       ORDER BY t.fecha DESC`,
      [req.session.usuarioId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});


app.get('/estadisticas/mejores-clientes', requiereSesion, requiereAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.nombre, COUNT(DISTINCT c.id) as total_compras, 
              SUM(p.precio * c.cantidad) as total_gastado
       FROM carrito c
       JOIN usuarios u ON c.usuario_id = u.id
       JOIN productos p ON c.producto_id = p.id
       WHERE c.vendido = 1
       GROUP BY u.id, u.nombre
       ORDER BY total_gastado DESC
       LIMIT 5`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

app.get('/estadisticas/ingresos', requiereSesion, requiereAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DATE(c.fecha_venta) as fecha, 
              SUM(p.precio * c.cantidad) as ingresos
       FROM carrito c
       JOIN productos p ON c.producto_id = p.id
       WHERE c.vendido = 1 AND c.fecha_venta IS NOT NULL
       GROUP BY DATE(c.fecha_venta)
       ORDER BY fecha DESC
       LIMIT 7`
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

app.get('/saldo', requiereSesion, async (req, res) => {
  const result = await pool.query(
    'SELECT saldo FROM usuarios WHERE id = $1',
    [req.session.usuarioId]
  );
  res.json({ saldo: Number(result.rows[0].saldo) });
});

app.post('/saldo/agregar', requiereSesion, async (req, res) => {
  const { monto } = req.body;

  if (!monto || monto <= 0) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET saldo = LEAST(saldo + $1, 1000000)
       WHERE id = $2
       RETURNING saldo`,
      [monto, req.session.usuarioId]
    );

    res.json({
      mensaje: 'Saldo agregado correctamente',
      saldo: Number(result.rows[0].saldo)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar saldo' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
