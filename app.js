const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'panaderia_secreta',
  resave: false,
  saveUninitialized: false
}));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
db.connect(err => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  console.log('Conectado a la base de datos');
});

function requiereSesion(req, res, next) {
  if (!req.session.usuarioId) {
    return res.status(401).json({ error: 'No has iniciado sesión' });
  }
  next();
}

function requiereAdmin(req, res, next) {
  if (!req.session.esAdmin) {
    return res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' });
  }
  next();
}

app.post('/registro', async (req, res) => {
  const { nombre, correo, contraseña } = req.body;
  if (!nombre || !correo || !contraseña) return res.status(400).json({ error: 'Todos los campos son obligatorios' });

  const hash = await bcrypt.hash(contraseña, 10);
  db.query('INSERT INTO usuarios (nombre, correo, contraseña) VALUES (?, ?, ?)', [nombre, correo, hash], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Correo ya registrado' });
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.json({ mensaje: 'Registro exitoso, ahora inicia sesión' });
  });
});

app.post('/login', (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    if (results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

    const usuario = results[0];
    const match = await bcrypt.compare(contraseña, usuario.contraseña);
    if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

    req.session.usuarioId = usuario.id;
    req.session.esAdmin = correo === 'admin@panaderia.com' && contraseña === 'admin123';
    res.json({ mensaje: 'Sesión iniciada' });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

app.get('/inventario', requiereSesion, (req, res) => {
  db.query('SELECT * FROM productos', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });

    const productos = results.map(pan => {
      const imagenBase64 = pan.imagen ? Buffer.from(pan.imagen).toString('base64') : null;
      return {
        ...pan,
        imagen: imagenBase64
      };
    });

    res.json(productos);
  });
});

app.post('/inventario', requiereSesion, requiereAdmin, (req, res) => {
  const { nombre, descripcion, precio, imagen } = req.body;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  const imagenBuffer = Buffer.from(imagen, 'base64');
  const query = 'INSERT INTO productos (nombre, descripcion, precio, imagen) VALUES (?, ?, ?, ?)';
  db.query(query, [nombre, descripcion, precio, imagenBuffer], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.status(201).json({ id: result.insertId });
  });
});

app.put('/inventario/:id', requiereSesion, requiereAdmin, (req, res) => {
  const { nombre, descripcion, precio, imagen } = req.body;
  const { id } = req.params;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  const imagenBuffer = Buffer.from(imagen, 'base64');
  const query = 'UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, imagen = ? WHERE id = ?';
  db.query(query, [nombre, descripcion, precio, imagenBuffer, id], (err) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.json({ mensaje: 'Producto actualizado' });
  });
});

app.delete('/inventario/:id', requiereSesion, requiereAdmin, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM productos WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.json({ mensaje: 'Producto eliminado' });
  });
});

app.get('/carrito', requiereSesion, (req, res) => {
  const query = `
    SELECT c.id, p.nombre, p.precio, c.cantidad
    FROM carrito c
    JOIN productos p ON c.producto_id = p.id
    WHERE c.usuario_id = ?
  `;
  db.query(query, [req.session.usuarioId], (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

app.post('/carrito/agregar', requiereSesion, (req, res) => {
  const { producto_id, cantidad } = req.body;
  const usuario_id = req.session.usuarioId;
  if (!producto_id || !cantidad) return res.status(400).json({ error: 'Faltan datos' });

  db.query('SELECT * FROM carrito WHERE usuario_id = ? AND producto_id = ?', [usuario_id, producto_id], (err, results) => {
    if (err) return res.status(500).json({ error: err });

    if (results.length > 0) {
      const nuevaCantidad = results[0].cantidad + cantidad;
      db.query('UPDATE carrito SET cantidad = ? WHERE id = ?', [nuevaCantidad, results[0].id], err => {
        if (err) return res.status(500).json({ error: err });
        res.json({ mensaje: 'Cantidad actualizada' });
      });
    } else {
      db.query('INSERT INTO carrito (usuario_id, producto_id, cantidad) VALUES (?, ?, ?)', [usuario_id, producto_id, cantidad], err => {
        if (err) return res.status(500).json({ error: err });
        res.json({ mensaje: 'Producto agregado al carrito' });
      });
    }
  });
});

app.delete('/carrito/:id', requiereSesion, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM carrito WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ mensaje: 'Producto eliminado del carrito' });
  });
});

app.get('/carrito/total', requiereSesion, (req, res) => {
  const query = `
    SELECT SUM(p.precio * c.cantidad) AS total
    FROM carrito c  
    JOIN productos p ON c.producto_id = p.id
    WHERE c.usuario_id = ?
  `;
  db.query(query, [req.session.usuarioId], (err, results) => {
    if (err) return res.status(500).json({ error: err });
    
    const total = results[0].total !== null ? parseFloat(results[0].total) : 0;
    res.json({ total });
    
  });
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
