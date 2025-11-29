const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const db = require('./db');
const path = require('path');

const app = express();

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'panaderia-secret',
  resave: false,
  saveUninitialized: false
}));


// Middlewares de auth
function auth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}
function authAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.rol !== 'ADMIN') return res.status(403).json({ error: 'No autorizado' });
  next();
}

// Utilidad: generar número de venta
function generarNumeroVenta() {
  return 'V-' + crypto.randomUUID();
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


/* ==========================
   LOGIN / REGISTRO / LOGOUT
   ========================== */
document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const contraseña = document.getElementById('contraseña').value;

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, contraseña })
  });

  if (res.ok) {
    document.getElementById('auth').style.display = 'none';
    document.getElementById('panaderia').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'inline-block';
    document.getElementById('mostrarCarritoBtn').style.display = 'inline-block';
    actualizarFondos();
    cargarHistorial();
    cargarPanes();
    initMapa();
  } else {
    const error = await res.json();
    alert(error.error || 'Error al iniciar sesión');
  }
});

document.getElementById('registroBtn')?.addEventListener('click', async () => {
  const nombre = document.getElementById('nombre').value;
  const username = document.getElementById('username').value;
  const correo = document.getElementById('correo').value;
  const contraseña = document.getElementById('contraseña').value;

  if (!nombre || !username || !correo || !contraseña) {
    alert('Todos los campos son obligatorios');
    return;
  }

  const res = await fetch('/registro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, username, correo, contraseña })
  });
  const data = await res.json();
  alert(data.mensaje || data.error);
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  document.getElementById('auth').style.display = 'block';
  document.getElementById('panaderia').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('mostrarCarritoBtn').style.display = 'none';
});

/* ==========================
   FONDOS
   ========================== */
async function actualizarFondos() {
  const res = await fetch('/usuarios/mis-fondos');
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById('fondosLabel').textContent = '$' + Number(data.fondos || 0).toFixed(2);
}

/* ==========================
   HISTORIAL DE COMPRAS
   ========================== */
async function cargarHistorial() {
  const tbody = document.getElementById('tablaHistorial');
  if (!tbody) return;
  tbody.innerHTML = '';
  const res = await fetch('/ventas/mias');
  if (!res.ok) return;
  const ventas = await res.json();
  ventas.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.numero_venta}</td>
      <td>${new Date(v.fecha).toLocaleString()}</td>
      <td>$${Number(v.total).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-outline-primary" onclick="verTicket(${v.id})">Ver ticket</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function verTicket(ventaId) {
  const detalleRes = await fetch('/ventas/' + ventaId + '/detalle');
  if (!detalleRes.ok) return alert('No se pudo cargar el ticket');
  const detalle = await detalleRes.json();
  const lineas = detalle.map(d => `- ${d.nombre} x${d.cantidad} @ $${Number(d.precio_unitario).toFixed(2)}`).join('\n');
  alert('Ticket:\n' + lineas);
}

/* ==========================
   CARRITO
   ========================== */
document.getElementById('pagarCarritoBtn')?.addEventListener('click', async () => {
  const res = await fetch('/carrito/checkout', { method: 'POST' });
  if (!res.ok) {
    const error = await res.json();
    alert(error.error || 'Error al procesar compra');
    return;
  }
  const data = await res.json();
  alert(`Compra realizada!\nNúmero de venta: ${data.numero_venta}\nTotal: $${Number(data.total).toFixed(2)}`);
  actualizarFondos();
  cargarHistorial();
  document.querySelector('#tablaCarrito tbody').innerHTML = '';
  document.getElementById('totalCarrito').textContent = 'Total: $0.00';
});

document.getElementById('mostrarCarritoBtn')?.addEventListener('click', async () => {
  const res = await fetch('/carrito');
  if (!res.ok) return;
  const items = await res.json();
  const tbody = document.querySelector('#tablaCarrito tbody');
  tbody.innerHTML = '';
  let total = 0;
  items.forEach(it => {
    const subtotal = it.precio * it.cantidad;
    total += subtotal;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.nombre}</td>
      <td>$${Number(it.precio).toFixed(2)}</td>
      <td>${it.cantidad}</td>
      <td>$${subtotal.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="eliminarDelCarrito(${it.id})">Eliminar</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('totalCarrito').textContent = 'Total: $' + total.toFixed(2);
});

async function eliminarDelCarrito(id) {
  const res = await fetch('/carrito/' + id, { method: 'DELETE' });
  if (res.ok) {
    alert('Producto eliminado del carrito');
    document.getElementById('mostrarCarritoBtn').click(); // recargar carrito
  } else {
    const error = await res.json();
    alert(error.error || 'Error al eliminar producto');
  }
}

/* ==========================
   CRUD DE PANES (PRODUCTOS)
   ========================== */
document.getElementById('panForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const nombrePan = document.getElementById('nombrePan').value;
  const descripcion = document.getElementById('descripcion').value;
  const precio = document.getElementById('precio').value;
  const imagenFile = document.getElementById('imagenFile').files[0];

  if (!imagenFile) {
    alert('Debes seleccionar una imagen');
    return;
  }

  const reader = new FileReader();
  reader.onloadend = async () => {
    const imagenBase64 = reader.result.split(',')[1];
    const res = await fetch('/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombrePan, descripcion, precio, imagenBase64 })
    });
    if (res.ok) {
      alert('Producto guardado');
      cargarPanes();
      document.getElementById('panForm').reset();
    } else {
      const error = await res.json();
      alert(error.error || 'Error al guardar producto');
    }
  };
  reader.readAsDataURL(imagenFile);
});

async function cargarPanes() {
  const res = await fetch('/productos');
  if (!res.ok) return;
  const panes = await res.json();
  const galeria = document.getElementById('galeria');
  galeria.innerHTML = '';
  panes.forEach(p => {
    const col = document.createElement('div');
    col.className = 'col-md-4 mb-3';
    col.innerHTML = `
      <div class="card pan-card">
        <img src="data:image/jpeg;base64,${p.imagen}" class="card-img-top" alt="${p.nombre}">
        <div class="card-body">
          <h5 class="card-title">${p.nombre}</h5>
          <p class="card-text">${p.descripcion || ''}</p>
          <p class="card-text text-success">$${Number(p.precio).toFixed(2)}</p>
          <button class="btn btn-sm btn-primary" onclick="agregarAlCarrito(${p.id})">Agregar al carrito</button>
        </div>
      </div>
    `;
    galeria.appendChild(col);
  });
}

async function agregarAlCarrito(productoId) {
  const cantidad = 1; // por defecto
  const res = await fetch('/carrito', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ producto_id: productoId, cantidad })
  });
  if (res.ok) {
    alert('Producto agregado al carrito');
  } else {
    const error = await res.json();
    alert(error.error || 'Error al agregar producto al carrito');
  }
}
/* ==========================
   MAPA (Leaflet)
   ========================== */
let mapInstance = null;
function initMapa() {
  if (mapInstance) return;
  const coords = [19.4326, -99.1332]; // CDMX
  mapInstance = L.map('map').setView(coords, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mapInstance);
  L.marker(coords).addTo(mapInstance)
    .bindPopup('Panadería La Desesperanza 🍞')
    .openPopup();
  document.getElementById('map').style.display = 'block';
}

/* ==========================
   GRÁFICO ADMIN (Chart.js)
   ========================== */
async function actualizarGrafica() {
  const desde = document.getElementById('desde')?.value;
  const hasta = document.getElementById('hasta')?.value;
  if (!desde || !hasta) return;
  const res = await fetch(`/admin/ventas/por-dia?desde=${desde}&hasta=${hasta}`);
  if (!res.ok) return;
  const data = await res.json();
  const ctx = document.getElementById('ventasPorDia').getContext('2d');
  if (window.chartVentas) window.chartVentas.destroy();
  window.chartVentas = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => r.dia),
      datasets: [{
        label: 'Ventas por día',
        data: data.map(r => r.monto),
        borderColor: '#b22222',
        backgroundColor: 'rgba(178,34,34,0.12)',
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: 'Fecha' } },
        y: { title: { display: true, text: 'Monto' }, beginAtZero: true }
      }
    }
  });
}
document.getElementById('btnGrafica')?.addEventListener('click', actualizarGrafica);

