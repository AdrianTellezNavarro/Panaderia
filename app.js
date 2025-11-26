

import express from "express";
import bodyParser from "body-parser";
import session from "express-session";

const app = express();

app.use(express.static("public"));

// Sanitizador simple
function sanitizeInput(input) {
  if (!input) return "";
  return String(input)
    .replace(/<[^>]*>?/gm, "")
    .replace(/<\?php.*?\?>/gs, "");
}

// Middlewares
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: "cambiar_esto_a_algo_seguro",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// Probar conexión
(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✅ Conexión exitosa a PostgreSQL:", res.rows[0]);
  } catch (err) {
    console.error("❌ Error al conectar a PostgreSQL:", err);
    process.exit(1);
  }
})();

// Función: verificar si el usuario es admin
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== "admin") {
    return res.status(403).json({ error: "Acceso denegado." });
  }
  next();
}

// SOCKET.IO - MAPA EN TIEMPO REAL

io.on('connection', (socket) => {
  console.log('👤 Usuario conectado al mapa:', socket.id);
  
  // Recibir coordenadas del usuario
  socket.on('userCoordinates', (coords) => {
    console.log('📍 Coordenadas recibidas:', coords);
    // Enviar a todos los demás usuarios conectados
    socket.broadcast.emit('userNewCoordinates', {
      coords: coords,
      socketId: socket.id
    });
  });
  
  // Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    console.log('👋 Usuario desconectado:', socket.id);
    socket.broadcast.emit('userDisconnected', socket.id);
  });
});

// RUTAS DE AUTENTICACIÓN

// Registro
app.post("/register", async (req, res) => {
  let { nombre, email, password, rol } = req.body;
  nombre = sanitizeInput(nombre);
  email = sanitizeInput(email);
  rol = rol === "admin" ? "admin" : "cliente";

  if (!nombre || !email || !password)
    return res.status(400).json({ error: "Todos los campos son obligatorios." });

  try {
    const userExists = await pool.query(
      "SELECT id_usuario FROM usuario WHERE email = $1",
      [email]
    );
    if (userExists.rows.length > 0)
      return res.status(400).json({ error: "El correo ya está registrado." });

    const result = await pool.query(
      "INSERT INTO usuario (nombre, email, password, rol, fondos) VALUES ($1, $2, $3, $4, 0) RETURNING *",
      [nombre, email, password, rol]
    );

    req.session.user = result.rows[0];
    res.json({ mensaje: "Usuario registrado correctamente.", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario." });
  }
});

// Login
app.post("/login", async (req, res) => {
  let { email, password } = req.body;
  email = sanitizeInput(email);
  if (!email || !password)
    return res.status(400).json({ error: "Email y contraseña son obligatorios." });

  try {
    const result = await pool.query(
      "SELECT * FROM usuario WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0)
      return res.status(400).json({ error: "Credenciales inválidas." });

    const user = result.rows[0];
    if (password !== user.password) {
      return res.status(400).json({ error: "Credenciales inválidas." });
    }

    // Asegurar que fondos existe
    if (user.fondos === null || user.fondos === undefined) {
      user.fondos = 0;
      await pool.query("UPDATE usuario SET fondos = 0 WHERE id_usuario = $1", [user.id_usuario]);
    }

    req.session.user = user;
    res.json({ mensaje: "Inicio de sesión exitoso.", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en el login." });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Error al cerrar sesión." });
    res.clearCookie("connect.sid");
    res.json({ mensaje: "Sesión cerrada correctamente." });
  });
});

// Obtener usuario actual
app.get("/me", (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

// Reset password
app.post("/resetPassword", async (req, res) => {
  let { nombre, email, newPassword } = req.body;
  nombre = sanitizeInput(nombre);
  email = sanitizeInput(email);

  if (!nombre || !email || !newPassword)
    return res.status(400).json({ error: "Todos los campos son obligatorios." });

  try {
    const result = await pool.query(
      "SELECT * FROM usuario WHERE nombre = $1 AND email = $2",
      [nombre, email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "Usuario no encontrado." });

    // CAMBIO: Guardar contraseña sin encriptar
    await pool.query(
      "UPDATE usuario SET password = $1 WHERE email = $2",
      [newPassword, email]  // newPassword directamente, sin bcrypt.hash
    );

    res.json({ mensaje: "Contraseña actualizada correctamente." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar contraseña." });
  }
});

// RUTAS DE PRODUCTOS

// Obtener productos
app.get("/productos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id_producto, nombre, descripcion, precio, stock, imagen IS NOT NULL AS tiene_imagen FROM producto"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener productos:", err);
    res.status(500).json({ error: "Error al obtener productos." });
  }
});

// Alias para compatibilidad
app.get("/obtenerProductos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id_producto, nombre, descripcion, precio, stock, imagen IS NOT NULL AS tiene_imagen FROM producto"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener productos:", err);
    res.status(500).json({ error: "Error al obtener productos." });
  }
});

// Obtener imagen
app.get("/producto/imagen/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT imagen FROM producto WHERE id_producto = $1", [id]);
    if (result.rows.length === 0 || !result.rows[0].imagen)
      return res.status(404).send("Imagen no encontrada");
    res.contentType("image/png");
    res.send(result.rows[0].imagen);
  } catch (err) {
    console.error("Error al obtener imagen:", err);
    res.status(500).json({ error: "Error al obtener imagen." });
  }
});

// Alias para compatibilidad
app.get("/imagen/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT imagen FROM producto WHERE id_producto = $1", [id]);
    if (result.rows.length === 0 || !result.rows[0].imagen)
      return res.status(404).send("Imagen no encontrada");
    res.contentType("image/png");
    res.send(result.rows[0].imagen);
  } catch (err) {
    console.error("Error al obtener imagen:", err);
    res.status(500).json({ error: "Error al obtener imagen." });
  }
});

// Agregar producto (solo admin)
app.post("/agregarProducto", requireAdmin, upload.single("imagen"), async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock } = req.body;
    const imagen = req.file ? req.file.buffer : null;

    const result = await pool.query(
      "INSERT INTO producto (nombre, descripcion, precio, stock, imagen) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [sanitizeInput(nombre), sanitizeInput(descripcion), precio, stock, imagen]
    );

    res.json({ mensaje: "Producto agregado correctamente.", producto: result.rows[0] });
  } catch (err) {
    console.error("Error al crear producto:", err);
    res.status(500).json({ error: "Error al crear producto." });
  }
});

// Actualizar producto
app.post("/actualizarProducto", requireAdmin, upload.single("imagen"), async (req, res) => {
  try {
    const { id_producto, nombre, descripcion, precio, stock } = req.body;
    const imagen = req.file ? req.file.buffer : null;

    if (imagen) {
      await pool.query(
        "UPDATE producto SET nombre=$1, descripcion=$2, precio=$3, stock=$4, imagen=$5 WHERE id_producto=$6",
        [sanitizeInput(nombre), sanitizeInput(descripcion), precio, stock, imagen, id_producto]
      );
    } else {
      await pool.query(
        "UPDATE producto SET nombre=$1, descripcion=$2, precio=$3, stock=$4 WHERE id_producto=$5",
        [sanitizeInput(nombre), sanitizeInput(descripcion), precio, stock, id_producto]
      );
    }

    res.json({ mensaje: "Producto actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar producto:", err);
    res.status(500).json({ error: "Error al actualizar producto." });
  }
});

// Eliminar producto
app.post("/borrarProducto", requireAdmin, async (req, res) => {
  try {
    const { id_producto } = req.body;
    await pool.query("DELETE FROM producto WHERE id_producto = $1", [id_producto]);
    res.json({ mensaje: "Producto eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar producto:", err);
    res.status(500).json({ error: "Error al eliminar producto." });
  }
});

// RUTAS DE CATEGORÍAS

// Crear categoría
app.post("/categoria", requireAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    const result = await pool.query(
      "INSERT INTO categoria (nombre) VALUES ($1) RETURNING *",
      [sanitizeInput(nombre)]
    );
    res.json({ mensaje: "Categoría creada correctamente.", categoria: result.rows[0] });
  } catch (err) {
    console.error("Error al crear categoría:", err);
    res.status(500).json({ error: "Error al crear categoría." });
  }
});

// Obtener categorías
app.get("/categorias", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categoria ORDER BY nombre ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener categorías:", err);
    res.status(500).json({ error: "Error al obtener categorías." });
  }
});

// RUTAS DE CARRITO

// Agregar al carrito
app.post("/carrito/agregar", async (req, res) => {
  try {
    if (!req.session.user)
      return res.status(401).json({ error: "Inicia sesión para agregar al carrito." });

    const { id_producto, cantidad } = req.body;
    
    // Validar que la cantidad sea positiva
    if (cantidad <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a 0." });
    }

    // Obtener el stock actual del producto
    const producto = await pool.query(
      "SELECT stock FROM producto WHERE id_producto = $1",
      [id_producto]
    );

    if (producto.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    const stockDisponible = producto.rows[0].stock;

    // Verificar si ya existe en el carrito
    const existe = await pool.query(
      "SELECT cantidad FROM carrito WHERE id_usuario=$1 AND id_producto=$2",
      [req.session.user.id_usuario, id_producto]
    );

    const cantidadEnCarrito = existe.rows.length > 0 ? existe.rows[0].cantidad : 0;
    const nuevaCantidadTotal = cantidadEnCarrito + cantidad;

    // Validar que no exceda el stock
    if (nuevaCantidadTotal > stockDisponible) {
      return res.status(400).json({ 
        error: `Stock insuficiente. Disponible: ${stockDisponible}, en carrito: ${cantidadEnCarrito}` 
      });
    }

    if (existe.rows.length > 0) {
      await pool.query(
        "UPDATE carrito SET cantidad = cantidad + $1 WHERE id_usuario=$2 AND id_producto=$3",
        [cantidad, req.session.user.id_usuario, id_producto]
      );
    } else {
      await pool.query(
        "INSERT INTO carrito (id_usuario, id_producto, cantidad) VALUES ($1, $2, $3)",
        [req.session.user.id_usuario, id_producto, cantidad]
      );
    }

    res.json({ mensaje: "Producto agregado al carrito." });
  } catch (err) {
    console.error("Error al agregar al carrito:", err);
    res.status(500).json({ error: "Error al agregar al carrito." });
  }
});

// Ver carrito
app.get("/carrito", async (req, res) => {
  try {
    if (!req.session.user)
      return res.json({ items: [] });

    const result = await pool.query(
      `SELECT c.id_carrito, p.id_producto, p.nombre, p.precio, c.cantidad
      FROM carrito c
      JOIN producto p ON c.id_producto = p.id_producto
      WHERE c.id_usuario = $1`,
      [req.session.user.id_usuario]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error("Error al obtener carrito:", err);
    res.status(500).json({ error: "Error al obtener carrito." });
  }
});

// Actualizar cantidad en carrito
app.post("/carrito/actualizar", async (req, res) => {
  try {
    if (!req.session.user)
      return res.status(401).json({ error: "Inicia sesión." });

    const { id_carrito, cantidad } = req.body;
    
    if (cantidad <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a 0." });
    }
    
    // Obtener el producto del carrito
    const itemCarrito = await pool.query(
      "SELECT id_producto FROM carrito WHERE id_carrito = $1 AND id_usuario = $2",
      [id_carrito, req.session.user.id_usuario]
    );
    
    if (itemCarrito.rows.length === 0) {
      return res.status(404).json({ error: "Item no encontrado en el carrito." });
    }
    
    // Verificar stock disponible
    const producto = await pool.query(
      "SELECT stock FROM producto WHERE id_producto = $1",
      [itemCarrito.rows[0].id_producto]
    );
    
    if (cantidad > producto.rows[0].stock) {
      return res.status(400).json({ 
        error: `Stock insuficiente. Disponible: ${producto.rows[0].stock}` 
      });
    }
    
    await pool.query(
      "UPDATE carrito SET cantidad = $1 WHERE id_carrito = $2 AND id_usuario = $3",
      [cantidad, id_carrito, req.session.user.id_usuario]
    );
    
    res.json({ mensaje: "Cantidad actualizada." });
  } catch (err) {
    console.error("Error al actualizar carrito:", err);
    res.status(500).json({ error: "Error al actualizar carrito." });
  }
});

// Eliminar del carrito
app.post("/carrito/eliminar", async (req, res) => {
  try {
    if (!req.session.user)
      return res.status(401).json({ error: "Inicia sesión." });

    const { id_carrito } = req.body;
    
    await pool.query(
      "DELETE FROM carrito WHERE id_carrito=$1 AND id_usuario=$2",
      [id_carrito, req.session.user.id_usuario]
    );
    
    res.json({ mensaje: "Producto eliminado del carrito." });
  } catch (err) {
    console.error("Error al eliminar del carrito:", err);
    res.status(500).json({ error: "Error al eliminar del carrito." });
  }
});

// RUTAS DE USUARIOS

// Obtener usuarios
app.get("/usuarios", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id_usuario, nombre, email, rol FROM usuario ORDER BY nombre ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener usuarios:", err);
    res.status(500).json({ error: "Error al obtener usuarios." });
  }
});

// Agregar usuario (admin)
app.post("/usuarios/agregar", requireAdmin, async (req, res) => {
  try {
    let { nombre, email, rol } = req.body;
    nombre = sanitizeInput(nombre);
    email = sanitizeInput(email);
    rol = rol === "admin" ? "admin" : "cliente";

    const password = "password123";

    const result = await pool.query(
      "INSERT INTO usuario (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING *",
      [nombre, email, hashed, rol]
    );

    res.json({ mensaje: "Usuario agregado correctamente.", usuario: result.rows[0] });
  } catch (err) {
    console.error("Error al agregar usuario:", err);
    res.status(500).json({ error: "Error al agregar usuario." });
  }
});

// Eliminar usuario
app.post("/usuarios/eliminar", requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("DELETE FROM usuario WHERE id_usuario = $1", [id]);
    res.json({ mensaje: "Usuario eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar usuario:", err);
    res.status(500).json({ error: "Error al eliminar usuario." });
  }
});

// RUTAS DE VENTAS

// Registrar venta
app.post("/venta", async (req, res) => {
  try {
    if (!req.session.user)
      return res.status(401).json({ error: "Inicia sesión para comprar." });

    const { id_usuario } = req.session.user;
    const venta = await pool.query(
      "INSERT INTO venta (id_usuario) VALUES ($1) RETURNING id_venta",
      [id_usuario]
    );

    const items = await pool.query(
      "SELECT id_producto, cantidad FROM carrito WHERE id_usuario = $1",
      [id_usuario]
    );

    for (const item of items.rows) {
      await pool.query(
        "UPDATE producto SET stock = stock - $1 WHERE id_producto = $2",
        [item.cantidad, item.id_producto]
      );
    }

    await pool.query("DELETE FROM carrito WHERE id_usuario = $1", [id_usuario]);

    res.json({ mensaje: "Compra realizada con éxito.", id_venta: venta.rows[0].id_venta });
  } catch (err) {
    console.error("Error al registrar venta:", err);
    res.status(500).json({ error: "Error al procesar venta." });
  }
});

// RUTAS DE FONDOS

// Obtener fondos del usuario actual
app.get("/fondos", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Inicia sesión." });
    }
    
    const result = await pool.query(
      "SELECT fondos FROM usuario WHERE id_usuario = $1",
      [req.session.user.id_usuario]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    res.json({ fondos: parseFloat(result.rows[0].fondos) || 0 });
  } catch (err) {
    console.error("Error al obtener fondos:", err);
    res.status(500).json({ error: "Error al obtener fondos." });
  }
});

// Agregar fondos
app.post("/fondos/agregar", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Inicia sesión." });
    }

    let { cantidad } = req.body;
    cantidad = parseFloat(cantidad);

    // Validaciones
    if (isNaN(cantidad) || cantidad <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a 0." });
    }

    if (cantidad > 999999999999) {
      return res.status(400).json({ error: "No puedes agregar más de $999,999,999,999." });
    }

    // Obtener fondos actuales
    const result = await pool.query(
      "SELECT fondos FROM usuario WHERE id_usuario = $1",
      [req.session.user.id_usuario]
    );

    const fondosActuales = parseFloat(result.rows[0].fondos) || 0;
    const nuevosFondos = fondosActuales + cantidad;

    // Validar límite total
    if (nuevosFondos > 999999999999) {
      return res.status(400).json({ 
        error: `El total de fondos no puede exceder $999,999,999,999. Actualmente tienes $${fondosActuales.toFixed(2)}` 
      });
    }

    // Actualizar fondos
    await pool.query(
      "UPDATE usuario SET fondos = $1 WHERE id_usuario = $2",
      [nuevosFondos, req.session.user.id_usuario]
    );

    // Actualizar sesión
    req.session.user.fondos = nuevosFondos;

    res.json({ 
      mensaje: "Fondos agregados correctamente.", 
      fondos: nuevosFondos 
    });
  } catch (err) {
    console.error("Error al agregar fondos:", err);
    res.status(500).json({ error: "Error al agregar fondos." });
  }
});

// MODIFICAR EL CHECKOUT PARA USAR FONDOS

app.post("/carrito/checkout", async (req, res) => {
  const client = await pool.connect();

  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Inicia sesión para comprar." });
    }

    const { id_usuario } = req.session.user;

    await client.query("BEGIN");

    // 1. Obtener fondos
    const userResult = await client.query(
      "SELECT fondos FROM usuario WHERE id_usuario = $1",
      [id_usuario]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const fondosDisponibles = parseFloat(userResult.rows[0].fondos) || 0;

    // 2. Obtener items del carrito
    const items = await client.query(
      `SELECT c.id_producto, c.cantidad, p.stock, p.nombre, p.precio
      FROM carrito c
      JOIN producto p ON c.id_producto = p.id_producto
      WHERE c.id_usuario = $1
      FOR UPDATE`,
      [id_usuario]
    );

    if (items.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El carrito está vacío." });
    }

    // 3. Validar stock
    for (const item of items.rows) {
      if (item.stock < item.cantidad) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Stock insuficiente para ${item.nombre}. Disponible: ${item.stock}, solicitado: ${item.cantidad}`
        });
      }
    }

    // 4. Calcular total
    const total = items.rows.reduce(
      (sum, item) => sum + item.precio * item.cantidad,
      0
    );

    // 5. Validar fondos
    if (fondosDisponibles < total) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Fondos insuficientes. Necesitas $${total.toFixed(2)}, tienes $${fondosDisponibles.toFixed(2)}`
      });
    }

    // 6. Crear venta
    const venta = await client.query(
      "INSERT INTO venta (id_usuario, total) VALUES ($1, $2) RETURNING id_venta",
      [id_usuario, total]
    );

    const id_venta = venta.rows[0].id_venta;

    // 7. Reducir stock y registrar detalles
    for (const item of items.rows) {
      // Reducir stock
      await client.query(
        "UPDATE producto SET stock = stock - $1 WHERE id_producto = $2",
        [item.cantidad, item.id_producto]
      );

      // Registrar detalle
      await client.query(
        `INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario)
        VALUES ($1, $2, $3, $4)`,
        [id_venta, item.id_producto, item.cantidad, item.precio]
      );
    }

    // 8. Descontar fondos del usuario
    const nuevosFondos = fondosDisponibles - total;

    await client.query(
      "UPDATE usuario SET fondos = $1 WHERE id_usuario = $2",
      [nuevosFondos, id_usuario]
    );

    // Actualizar sesión
    req.session.user.fondos = nuevosFondos;

    // 9. Vaciar carrito
    await client.query(
      "DELETE FROM carrito WHERE id_usuario = $1",
      [id_usuario]
    );

    await client.query("COMMIT");

    res.json({
      mensaje: "Compra realizada con éxito.",
      id_venta,
      fondosRestantes: nuevosFondos
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error en checkout:", err);
    res.status(500).json({ error: "Error al procesar la compra." });
  } finally {
    client.release();
  }
});


// Rutas para Ventas

app.get('/venta/detalle/:id_venta', async (req, res) => {
  const { id_venta } = req.params;

  try {
    const query = `
      SELECT 
        p.nombre,
        dv.cantidad,
        dv.precio_unitario
      FROM detalle_venta dv
      INNER JOIN producto p ON dv.id_producto = p.id_producto
      WHERE dv.id_venta = $1
    `;
    
    const result = await pool.query(query, [id_venta]);

    res.json({
      productos: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo detalles de venta', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/venta', async (req, res) => {
  const { id_usuario, total } = req.body;

  try {
    const ventaQuery = `
      INSERT INTO venta (id_usuario, total, fecha)
      VALUES ($1, $2, NOW())
      RETURNING *;
    `;

    const venta = await pool.query(ventaQuery, [id_usuario, total]);

    // Obtener fondos actuales
    const usuario = await pool.query(`SELECT fondos FROM usuario WHERE id_usuario = $1`, [id_usuario]);

    // Actualizar fondos
    const fondosRestantes = Number(usuario.rows[0].fondos) - Number(total);

    await pool.query(`UPDATE usuario SET fondos = $1 WHERE id_usuario = $2`, [fondosRestantes, id_usuario]);

    res.json({
      ...venta.rows[0],
      fondos_restantes: fondosRestantes
    });

  } catch (error) {
    console.error("Error creando venta", error);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post('/venta/detalle', async (req, res) => {
  const { id_venta, id_producto, cantidad, precio_unitario } = req.body;

  try {
    const query = `
      INSERT INTO detalle_venta (id_venta, id_producto, cantidad, precio_unitario, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *;
    `;

    const result = await pool.query(query, [
      id_venta,
      id_producto,
      cantidad,
      precio_unitario
    ]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error guardando detalle_venta", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// AGREGAR ESTAS RUTAS A app.js

// Obtener historial de compras del usuario actual
app.get("/historial/mis-compras", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Inicia sesión." });
    }

    const { id_usuario } = req.session.user;

    // Obtener todas las ventas del usuario
    const ventas = await pool.query(
      `SELECT 
        v.id_venta,
        v.total,
        v.fecha,
        u.nombre as cliente
      FROM venta v
      JOIN usuario u ON v.id_usuario = u.id_usuario
      WHERE v.id_usuario = $1
      ORDER BY v.fecha DESC`,
      [id_usuario]
    );

    // Para cada venta, obtener los productos
    const ventasConDetalles = await Promise.all(
      ventas.rows.map(async (venta) => {
        const detalles = await pool.query(
          `SELECT 
            p.nombre,
            dv.cantidad,
            dv.precio_unitario,
            (dv.cantidad * dv.precio_unitario) as subtotal
          FROM detalle_venta dv
          JOIN producto p ON dv.id_producto = p.id_producto
          WHERE dv.id_venta = $1`,
          [venta.id_venta]
        );

        return {
          ...venta,
          productos: detalles.rows
        };
      })
    );

    res.json({ compras: ventasConDetalles });
  } catch (err) {
    console.error("Error al obtener historial:", err);
    res.status(500).json({ error: "Error al obtener historial." });
  }
});

// Obtener todas las compras (solo admin)
app.get("/historial/todas", requireAdmin, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, id_usuario } = req.query;

    let query = `
      SELECT 
        v.id_venta,
        v.total,
        v.fecha,
        u.nombre as cliente,
        u.email as email_cliente
      FROM venta v
      JOIN usuario u ON v.id_usuario = u.id_usuario
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Filtro por fecha de inicio
    if (fecha_inicio) {
      query += ` AND v.fecha >= $${paramCount}`;
      params.push(fecha_inicio);
      paramCount++;
    }

    // Filtro por fecha fin
    if (fecha_fin) {
      query += ` AND v.fecha <= $${paramCount}`;
      params.push(fecha_fin + ' 23:59:59');
      paramCount++;
    }

    // Filtro por usuario
    if (id_usuario) {
      query += ` AND v.id_usuario = $${paramCount}`;
      params.push(id_usuario);
      paramCount++;
    }

    query += ` ORDER BY v.fecha DESC`;

    const ventas = await pool.query(query, params);

    // Para cada venta, obtener los productos
    const ventasConDetalles = await Promise.all(
      ventas.rows.map(async (venta) => {
        const detalles = await pool.query(
          `SELECT 
            p.nombre,
            dv.cantidad,
            dv.precio_unitario,
            (dv.cantidad * dv.precio_unitario) as subtotal
          FROM detalle_venta dv
          JOIN producto p ON dv.id_producto = p.id_producto
          WHERE dv.id_venta = $1`,
          [venta.id_venta]
        );

        return {
          ...venta,
          productos: detalles.rows
        };
      })
    );

    res.json({ compras: ventasConDetalles });
  } catch (err) {
    console.error("Error al obtener historial (admin):", err);
    res.status(500).json({ error: "Error al obtener historial." });
  }
});

// Obtener estadísticas de ventas (solo admin)
app.get("/historial/estadisticas", requireAdmin, async (req, res) => {
  try {
    // Total de ventas
    const totalVentas = await pool.query(
      "SELECT COUNT(*) as total, SUM(total) as ingresos FROM venta"
    );

    // Productos más vendidos
    const topProductos = await pool.query(
      `SELECT 
        p.nombre,
        SUM(dv.cantidad) as cantidad_vendida,
        SUM(dv.cantidad * dv.precio_unitario) as ingresos
        FROM detalle_venta dv
        JOIN producto p ON dv.id_producto = p.id_producto
        GROUP BY p.id_producto, p.nombre
        ORDER BY cantidad_vendida DESC
        LIMIT 5`
    );

    // Ventas por mes (últimos 6 meses)
    const ventasPorMes = await pool.query(
      `SELECT 
        TO_CHAR(fecha, 'YYYY-MM') as mes,
        COUNT(*) as cantidad,
        SUM(total) as ingresos
      FROM venta
      WHERE fecha >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(fecha, 'YYYY-MM')
      ORDER BY mes DESC`
    );

    res.json({
      total_ventas: parseInt(totalVentas.rows[0].total),
      ingresos_totales: parseFloat(totalVentas.rows[0].ingresos) || 0,
      productos_mas_vendidos: topProductos.rows,
      ventas_por_mes: ventasPorMes.rows
    });
  } catch (err) {
    console.error("Error al obtener estadísticas:", err);
    res.status(500).json({ error: "Error al obtener estadísticas." });
  }
});
  
// INICIAR SERVIDOR

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});