const express = require('express');
const mysql = require('mysql2');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Admin!01',
  database: 'panaderia_db'
});

db.connect(err => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  console.log('Conectado a la base de datos');
});

app.post('/inventario', (req, res) => {
  const { nombre, descripcion, precio, imagen} = req.body;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  const imagenBuffer = Buffer.from(imagen, 'base64');
  const query = 'INSERT INTO inventario (nombre, descripcion, precio, imagen) VALUES (?, ?, ?, ?)';
  db.query(query, [nombre, descripcion, precio, imagenBuffer], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.status(201).json({ id: result.insertId });
  });
});

app.get('/inventario', (req, res) => {
  db.query('SELECT * FROM inventario', (err, results) => {
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

app.put('/inventario/:id', (req, res) => {
  const { nombre, descripcion, precio, imagen} = req.body;
  const { id } = req.params;
  if (!nombre || !precio || !imagen) {
    return res.status(400).json({ error: 'Nombre, precio e imagen son obligatorios' });
  }

  const imagenBuffer = Buffer.from(imagen, 'base64');
  const query = 'UPDATE inventario SET nombre = ?, descripcion = ?, precio = ?, imagen = ? WHERE id = ?';
  db.query(query, [nombre, descripcion, precio, imagenBuffer, id], (err) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.json({ mensaje: 'Producto actualizado' });
  });
});

app.delete('/inventario/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM inventario WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    res.json({ mensaje: 'Producto eliminado' });
  });
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
